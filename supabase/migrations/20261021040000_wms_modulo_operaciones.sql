-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: MÓDULO COLECTOR DE OPERACIONES
-- Motor: PostgreSQL 17 / Supabase
-- Archivo: 20261021040000_wms_modulo_operaciones.sql
-- ==============================================================================
-- REGLA DE NEGOCIO:
-- La tabla 'operaciones' es el colector/totalizador central de todas las órdenes:
--  - Entrada / Recepción (IN)
--  - Pedidos de Clientes (Picking / Alocación)
--  - Salidas de Almacén (OUT / Consolidado)
--  - Entregas / Rutas (Flete / Reparto con Remito Conformado)
-- No maneja detalles a nivel artículo; consolida solo cantidades totales, m3,
-- lotes / números de despachos de aduana, documentos de respaldo y trazabilidad.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.operaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_operacion TEXT NOT NULL,                     -- Nro de orden (ej: REC-..., PED-..., OS-..., RUTA-...)
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL DEFAULT 'General',
  unidad_negocio TEXT,                           -- Unidad de negocio de cliente
  fechahora_alta TIMESTAMPTZ NOT NULL DEFAULT now(), -- Cuando se crea la orden
  fechahora_fin TIMESTAMPTZ,                     -- Cuando se finaliza / entrega
  tipo_op TEXT NOT NULL CHECK (tipo_op IN ('entrada', 'pedido', 'salida', 'entrega')),
  documento_movimiento TEXT,                     -- Doc que respalda (Nro contenedor IN / remito OUT / OC cliente / Remito Conformado)
  documento_heredado TEXT,                       -- Doc del cual hereda (ej: salida hereda nro_pedido / ingreso hereda despacho aduana)
  lotes_despacho TEXT,                           -- Lotes involucrados / Nros de despachos de aduana
  cantidad_total NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  m3_totales NUMERIC(14,4) NOT NULL DEFAULT 0.0000,
  novedad_desvio TEXT,                           -- Novedad / desvío operativo
  usuario_creador TEXT NOT NULL DEFAULT 'Sistema',
  usuario_creador_id UUID,
  estado TEXT NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'completada', 'cancelada')),
  referencia_id UUID,                            -- ID origen en ordenes_recepcion, pedidos, ordenes_salida o rutas_entrega
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices estratégicos para búsquedas y filtros de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_operaciones_id_operacion ON public.operaciones(id_operacion);
CREATE INDEX IF NOT EXISTS idx_operaciones_tipo_op ON public.operaciones(tipo_op);
CREATE INDEX IF NOT EXISTS idx_operaciones_cliente_id ON public.operaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_operaciones_fechahora_alta ON public.operaciones(fechahora_alta DESC);
CREATE INDEX IF NOT EXISTS idx_operaciones_estado ON public.operaciones(estado);
CREATE INDEX IF NOT EXISTS idx_operaciones_referencia_id ON public.operaciones(referencia_id);

-- Restricción de unicidad para evitar duplicados por orden y tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_operaciones_id_tipo ON public.operaciones(id_operacion, tipo_op);

-- Habilitar RLS
ALTER TABLE public.operaciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'operaciones' AND policyname = 'operaciones_all_access'
  ) THEN
    CREATE POLICY operaciones_all_access ON public.operaciones
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Publicación Realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operaciones;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignorar si la tabla ya está en la publicación o no hay permisos
END $$;


-- ==============================================================================
-- PROCEDIMIENTO RPC: wms_recolectar_operaciones
-- Totaliza y sincroniza masivamente las órdenes existentes hacia 'operaciones'
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_recolectar_operaciones()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_ped RECORD;
  v_sal RECORD;
  v_rut RECORD;
  v_total_insertadas INT := 0;
  v_total_actualizadas INT := 0;
BEGIN

  -- Limpiar cualquier registro residual de rutas multicliente (este módulo es exclusivo de clientes)
  DELETE FROM public.operaciones WHERE tipo_op = 'entrega' AND (id_operacion LIKE 'RUTA-%' OR cliente_id IS NULL);

  -- 1. ENTRADAS / RECEPCIONES (INBOUND)
  FOR v_rec IN
    SELECT 
      r.id AS rec_id,
      r.numero_recepcion,
      r.cliente_id,
      COALESCE(c.razon_social, 'General') AS cliente_nombre,
      c.unidad_negocio,
      COALESCE(r.fecha_hora_arribo, r.creado_en) AS fechahora_alta,
      CASE WHEN r.estado = 'finalizada' THEN r.actualizado_en ELSE NULL END AS fechahora_fin,
      COALESCE(r.nro_contenedor_oc, r.observaciones, 'S/D') AS documento_movimiento,
      COALESCE(r.despacho_aduana, r.guia_transporte, 'S/D') AS documento_heredado,
      COALESCE(r.despacho_aduana, r.lote_defecto, 'S/L') AS lotes_despacho,
      COALESCE(SUM(d.cantidad_esperada), 0) AS cantidad_total,
      COALESCE(SUM(d.cantidad_esperada * COALESCE(a.volumen_unitario_m3, 0)), 0) AS m3_totales,
      r.observaciones AS novedad_desvio,
      CASE WHEN r.estado = 'finalizada' THEN 'completada' ELSE 'en_proceso' END AS estado_op
    FROM public.ordenes_recepcion r
    LEFT JOIN public.clientes c ON c.id = r.cliente_id
    LEFT JOIN public.ordenes_recepcion_detalle d ON d.orden_recepcion_id = r.id
    LEFT JOIN public.articulos a ON a.id = d.articulo_id
    GROUP BY r.id, r.numero_recepcion, r.cliente_id, c.razon_social, c.unidad_negocio, 
             r.fecha_hora_arribo, r.creado_en, r.actualizado_en, r.nro_contenedor_oc, 
             r.observaciones, r.despacho_aduana, r.guia_transporte, r.lote_defecto, r.estado
  LOOP
    INSERT INTO public.operaciones (
      id_operacion,
      cliente_id,
      cliente_nombre,
      unidad_negocio,
      fechahora_alta,
      fechahora_fin,
      tipo_op,
      documento_movimiento,
      documento_heredado,
      lotes_despacho,
      cantidad_total,
      m3_totales,
      novedad_desvio,
      usuario_creador,
      estado,
      referencia_id
    ) VALUES (
      v_rec.numero_recepcion,
      v_rec.cliente_id,
      v_rec.cliente_nombre,
      v_rec.unidad_negocio,
      v_rec.fechahora_alta,
      v_rec.fechahora_fin,
      'entrada',
      v_rec.documento_movimiento,
      v_rec.documento_heredado,
      v_rec.lotes_despacho,
      v_rec.cantidad_total,
      v_rec.m3_totales,
      v_rec.novedad_desvio,
      'Operador Inbound',
      v_rec.estado_op,
      v_rec.rec_id
    )
    ON CONFLICT (id_operacion, tipo_op) DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      cliente_nombre = EXCLUDED.cliente_nombre,
      unidad_negocio = EXCLUDED.unidad_negocio,
      fechahora_fin = EXCLUDED.fechahora_fin,
      documento_movimiento = EXCLUDED.documento_movimiento,
      documento_heredado = EXCLUDED.documento_heredado,
      lotes_despacho = EXCLUDED.lotes_despacho,
      cantidad_total = EXCLUDED.cantidad_total,
      m3_totales = EXCLUDED.m3_totales,
      novedad_desvio = EXCLUDED.novedad_desvio,
      estado = EXCLUDED.estado,
      referencia_id = EXCLUDED.referencia_id,
      actualizado_en = clock_timestamp();

    v_total_insertadas := v_total_insertadas + 1;
  END LOOP;

  -- 2. PEDIDOS DE CLIENTES (PICKING / PREPARACIÓN)
  FOR v_ped IN
    SELECT 
      p.id AS ped_id,
      p.numero_pedido,
      p.cliente_id,
      COALESCE(c.razon_social, 'General') AS cliente_nombre,
      c.unidad_negocio,
      COALESCE(p.fecha_solicitud, p.creado_en) AS fechahora_alta,
      CASE WHEN p.estado IN ('despachado', 'entregado', 'preparado') THEN p.actualizado_en ELSE NULL END AS fechahora_fin,
      COALESCE(p.orden_compra_cliente, p.numero_pedido) AS documento_movimiento,
      COALESCE(p.orden_compra_cliente, 'OC Interna') AS documento_heredado,
      COALESCE(
        string_agg(DISTINCT COALESCE(l.numero_lote, pd.lote_id::text), ', '),
        'S/L'
      ) AS lotes_despacho,
      COALESCE(SUM(pd.cantidad_solicitada), 0) AS cantidad_total,
      COALESCE(SUM(pd.cantidad_solicitada * COALESCE(a.volumen_unitario_m3, 0)), 0) AS m3_totales,
      p.observaciones AS novedad_desvio,
      CASE WHEN p.estado IN ('despachado', 'entregado') THEN 'completada' ELSE 'en_proceso' END AS estado_op
    FROM public.pedidos p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    LEFT JOIN public.pedidos_detalle pd ON pd.pedido_id = p.id
    LEFT JOIN public.articulos a ON a.id = pd.articulo_id
    LEFT JOIN public.lotes_cliente l ON l.id = pd.lote_id
    GROUP BY p.id, p.numero_pedido, p.cliente_id, c.razon_social, c.unidad_negocio,
             p.fecha_solicitud, p.creado_en, p.actualizado_en, p.orden_compra_cliente,
             p.observaciones, p.estado
  LOOP
    INSERT INTO public.operaciones (
      id_operacion,
      cliente_id,
      cliente_nombre,
      unidad_negocio,
      fechahora_alta,
      fechahora_fin,
      tipo_op,
      documento_movimiento,
      documento_heredado,
      lotes_despacho,
      cantidad_total,
      m3_totales,
      novedad_desvio,
      usuario_creador,
      estado,
      referencia_id
    ) VALUES (
      v_ped.numero_pedido,
      v_ped.cliente_id,
      v_ped.cliente_nombre,
      v_ped.unidad_negocio,
      v_ped.fechahora_alta,
      v_ped.fechahora_fin,
      'pedido',
      v_ped.documento_movimiento,
      v_ped.documento_heredado,
      v_ped.lotes_despacho,
      v_ped.cantidad_total,
      v_ped.m3_totales,
      v_ped.novedad_desvio,
      'Ventas / 3PL Order',
      v_ped.estado_op,
      v_ped.ped_id
    )
    ON CONFLICT (id_operacion, tipo_op) DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      cliente_nombre = EXCLUDED.cliente_nombre,
      unidad_negocio = EXCLUDED.unidad_negocio,
      fechahora_fin = EXCLUDED.fechahora_fin,
      documento_movimiento = EXCLUDED.documento_movimiento,
      documento_heredado = EXCLUDED.documento_heredado,
      lotes_despacho = EXCLUDED.lotes_despacho,
      cantidad_total = EXCLUDED.cantidad_total,
      m3_totales = EXCLUDED.m3_totales,
      novedad_desvio = EXCLUDED.novedad_desvio,
      estado = EXCLUDED.estado,
      referencia_id = EXCLUDED.referencia_id,
      actualizado_en = clock_timestamp();

    v_total_insertadas := v_total_insertadas + 1;
  END LOOP;

  -- 3. SALIDAS DE ALMACÉN (OUTBOUND CONSOLIDADO)
  FOR v_sal IN
    SELECT 
      os.id AS os_id,
      os.numero_orden_salida,
      NULL::UUID AS cliente_id,
      COALESCE(
        string_agg(DISTINCT c.razon_social, ', '),
        'Consolidado Multi-Cliente'
      ) AS cliente_nombre,
      COALESCE(
        string_agg(DISTINCT c.unidad_negocio, ', '),
        'General'
      ) AS unidad_negocio,
      os.creado_en AS fechahora_alta,
      CASE WHEN os.estado = 'cerrada' THEN os.actualizado_en ELSE NULL END AS fechahora_fin,
      COALESCE(
        (SELECT string_agg(rt.numero_remito_rx, ', ') FROM public.remitos_transito rt WHERE rt.orden_salida_id = os.id),
        'Remito Pendiente'
      ) AS documento_movimiento,
      COALESCE(
        string_agg(DISTINCT p.numero_pedido, ', '),
        'Pedidos Asignados'
      ) AS documento_heredado,
      'Consolidado Salida' AS lotes_despacho,
      COALESCE(
        (SELECT SUM(rt.total_bultos) FROM public.remitos_transito rt WHERE rt.orden_salida_id = os.id),
        (SELECT SUM(pd.cantidad_separada) FROM public.ordenes_salida_pedidos osp JOIN public.pedidos_detalle pd ON pd.pedido_id = osp.pedido_id WHERE osp.orden_salida_id = os.id),
        0
      ) AS cantidad_total,
      COALESCE(
        (SELECT SUM(pd.cantidad_separada * COALESCE(a.volumen_unitario_m3, 0)) 
         FROM public.ordenes_salida_pedidos osp 
         JOIN public.pedidos_detalle pd ON pd.pedido_id = osp.pedido_id 
         JOIN public.articulos a ON a.id = pd.articulo_id 
         WHERE osp.orden_salida_id = os.id),
        0
      ) AS m3_totales,
      os.observaciones AS novedad_desvio,
      CASE WHEN os.estado = 'cerrada' THEN 'completada' ELSE 'en_proceso' END AS estado_op
    FROM public.ordenes_salida os
    LEFT JOIN public.ordenes_salida_pedidos osp ON osp.orden_salida_id = os.id
    LEFT JOIN public.pedidos p ON p.id = osp.pedido_id
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
    GROUP BY os.id, os.numero_orden_salida, os.creado_en, os.actualizado_en, os.estado, os.observaciones
  LOOP
    INSERT INTO public.operaciones (
      id_operacion,
      cliente_id,
      cliente_nombre,
      unidad_negocio,
      fechahora_alta,
      fechahora_fin,
      tipo_op,
      documento_movimiento,
      documento_heredado,
      lotes_despacho,
      cantidad_total,
      m3_totales,
      novedad_desvio,
      usuario_creador,
      estado,
      referencia_id
    ) VALUES (
      v_sal.numero_orden_salida,
      v_sal.cliente_id,
      v_sal.cliente_nombre,
      v_sal.unidad_negocio,
      v_sal.fechahora_alta,
      v_sal.fechahora_fin,
      'salida',
      v_sal.documento_movimiento,
      v_sal.documento_heredado,
      v_sal.lotes_despacho,
      v_sal.cantidad_total,
      v_sal.m3_totales,
      v_sal.novedad_desvio,
      'Supervisor Expedición',
      v_sal.estado_op,
      v_sal.os_id
    )
    ON CONFLICT (id_operacion, tipo_op) DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      cliente_nombre = EXCLUDED.cliente_nombre,
      unidad_negocio = EXCLUDED.unidad_negocio,
      fechahora_fin = EXCLUDED.fechahora_fin,
      documento_movimiento = EXCLUDED.documento_movimiento,
      documento_heredado = EXCLUDED.documento_heredado,
      lotes_despacho = EXCLUDED.lotes_despacho,
      cantidad_total = EXCLUDED.cantidad_total,
      m3_totales = EXCLUDED.m3_totales,
      novedad_desvio = EXCLUDED.novedad_desvio,
      estado = EXCLUDED.estado,
      referencia_id = EXCLUDED.referencia_id,
      actualizado_en = clock_timestamp();

    v_total_insertadas := v_total_insertadas + 1;
  END LOOP;

  -- 4. ENTREGAS / TRANSPORTE Y REPARTO (COLECCIÓN POR REMITO ASIGNADO AL CLIENTE)
  FOR v_rut IN
    SELECT 
      rt.id AS remito_id,
      rt.numero_remito_rx AS remito_nro,
      rt.cliente_id,
      COALESCE(c.razon_social, 'General') AS cliente_nombre,
      COALESCE(c.unidad_negocio, 'Distribución') AS unidad_negocio,
      COALESCE(rt.fecha_emision, rt.creado_en) AS fechahora_alta,
      CASE 
        WHEN rt.estado = 'entregado' OR BOOL_OR(rpi.estado_entrega = 'entregado') 
          THEN COALESCE(MAX(rpi.hora_real_arribo), rt.actualizado_en)
        ELSE NULL 
      END AS fechahora_fin,
      rt.numero_remito_rx AS documento_movimiento,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' / ', 
          CASE WHEN MAX(re.codigo_ruta) IS NOT NULL THEN 'Hoja de Ruta: ' || MAX(re.codigo_ruta) ELSE NULL END,
          CASE WHEN p.numero_pedido IS NOT NULL THEN 'Pedido: ' || p.numero_pedido ELSE NULL END
        )), ''),
        'Remito Conformado / Despacho'
      ) AS documento_heredado,
      COALESCE(
        (SELECT string_agg(DISTINCT COALESCE(l.numero_lote, pd.lote_id::text), ', ')
         FROM public.pedidos_detalle pd
         LEFT JOIN public.lotes_cliente l ON l.id = pd.lote_id
         WHERE pd.pedido_id = rt.pedido_id AND (l.numero_lote IS NOT NULL OR pd.lote_id IS NOT NULL)),
        'Lote Despachado'
      ) AS lotes_despacho,
      COALESCE(rt.total_bultos, 0) AS cantidad_total,
      COALESCE(rt.volumen_total_m3, 0) AS m3_totales,
      COALESCE(MAX(rpi.observaciones), rt.cae_o_autorizacion_fiscal) AS novedad_desvio,
      COALESCE(MAX(re.chofer_nombre), 'Chofer Despacho') AS usuario_creador,
      CASE 
        WHEN rt.estado = 'entregado' OR BOOL_OR(rpi.estado_entrega = 'entregado') THEN 'completada'
        WHEN rt.estado = 'anulado' THEN 'cancelada'
        ELSE 'en_proceso'
      END AS estado_op
    FROM public.remitos_transito rt
    INNER JOIN public.clientes c ON c.id = rt.cliente_id
    LEFT JOIN public.pedidos p ON p.id = rt.pedido_id
    LEFT JOIN public.rutas_paradas_itinerario rpi ON rpi.remito_id = rt.id OR (rpi.pedido_id = rt.pedido_id AND rpi.remito_id IS NULL)
    LEFT JOIN public.rutas_entrega re ON re.id = rpi.ruta_id
    WHERE rt.cliente_id IS NOT NULL
    GROUP BY rt.id, rt.numero_remito_rx, rt.cliente_id, c.razon_social, c.unidad_negocio,
             rt.fecha_emision, rt.creado_en, rt.actualizado_en, rt.estado, rt.pedido_id,
             p.numero_pedido, rt.total_bultos, rt.volumen_total_m3, rt.cae_o_autorizacion_fiscal
  LOOP
    INSERT INTO public.operaciones (
      id_operacion,
      cliente_id,
      cliente_nombre,
      unidad_negocio,
      fechahora_alta,
      fechahora_fin,
      tipo_op,
      documento_movimiento,
      documento_heredado,
      lotes_despacho,
      cantidad_total,
      m3_totales,
      novedad_desvio,
      usuario_creador,
      estado,
      referencia_id
    ) VALUES (
      COALESCE(v_rut.remito_nro, 'REM-' || SUBSTRING(v_rut.remito_id::text, 1, 8)),
      v_rut.cliente_id,
      v_rut.cliente_nombre,
      v_rut.unidad_negocio,
      v_rut.fechahora_alta,
      v_rut.fechahora_fin,
      'entrega',
      v_rut.documento_movimiento,
      v_rut.documento_heredado,
      v_rut.lotes_despacho,
      v_rut.cantidad_total,
      v_rut.m3_totales,
      v_rut.novedad_desvio,
      v_rut.usuario_creador,
      v_rut.estado_op,
      v_rut.remito_id
    )
    ON CONFLICT (id_operacion, tipo_op) DO UPDATE SET
      cliente_id = EXCLUDED.cliente_id,
      cliente_nombre = EXCLUDED.cliente_nombre,
      unidad_negocio = EXCLUDED.unidad_negocio,
      fechahora_alta = EXCLUDED.fechahora_alta,
      fechahora_fin = EXCLUDED.fechahora_fin,
      documento_movimiento = EXCLUDED.documento_movimiento,
      documento_heredado = EXCLUDED.documento_heredado,
      lotes_despacho = EXCLUDED.lotes_despacho,
      cantidad_total = EXCLUDED.cantidad_total,
      m3_totales = EXCLUDED.m3_totales,
      novedad_desvio = EXCLUDED.novedad_desvio,
      usuario_creador = EXCLUDED.usuario_creador,
      estado = EXCLUDED.estado,
      referencia_id = EXCLUDED.referencia_id,
      actualizado_en = clock_timestamp();

    v_total_insertadas := v_total_insertadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'exito', true,
    'total_operaciones_procesadas', v_total_insertadas,
    'timestamp', clock_timestamp()
  );
END;
$$;
