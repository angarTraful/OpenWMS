-- ==============================================================================
-- OPENWMS 3PL - Procedimientos RPC y Mejoras para el Ciclo Outbound
-- Algoritmo FEFO/FIFO, Control de Picking, Packing Station y Remitos Rx
-- Idioma: Español Latinoamericano (es-419)
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. Flexibilizar orden_salida_id en paletizado_despacho y remitos_transito
-- Permite paletizar y emitir el remito del pedido ANTES de agrupar en el camión de ruta
ALTER TABLE IF EXISTS public.paletizado_despacho 
  ALTER COLUMN orden_salida_id DROP NOT NULL;

ALTER TABLE IF EXISTS public.remitos_transito 
  ALTER COLUMN orden_salida_id DROP NOT NULL;

-- 1.1 Asegurar columna creado_en en tabla inventario
ALTER TABLE IF EXISTS public.inventario 
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT now() NOT NULL;

-- 2. Asegurar estados de pedido ampliados si es necesario
DO $$
BEGIN
  -- Agregar columna de novedad de picking si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'tareas_picking' 
      AND column_name = 'novedad_faltante'
  ) THEN
    ALTER TABLE public.tareas_picking ADD COLUMN novedad_faltante TEXT;
  END IF;
END $$;


-- ==============================================================================
-- 3. RPC: ALOCACIÓN AUTOMÁTICA FEFO / FIFO DE STOCK PARA PEDIDO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_asignar_picking_fefo(
  p_pedido_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_pedido RECORD;
  v_det RECORD;
  v_inv RECORD;
  v_pendiente NUMERIC(12,2);
  v_tomar NUMERIC(12,2);
  v_tareas_creadas INT := 0;
  v_total_reservado NUMERIC(12,2) := 0;
BEGIN
  -- 1. Verificar pedido
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  IF v_pedido.estado NOT IN ('ingresado', 'asignado_picking') THEN
    RAISE EXCEPTION 'El pedido % no puede ser asignado en su estado actual (%)', v_pedido.numero_pedido, v_pedido.estado;
  END IF;

  -- 2. Recorrer renglones del pedido
  FOR v_det IN 
    SELECT pd.*, a.sku, a.nombre, a.unidades_por_bulto, a.volumen_unitario_m3
    FROM public.pedidos_detalle pd
    JOIN public.articulos a ON a.id = pd.articulo_id
    WHERE pd.pedido_id = p_pedido_id
  LOOP
    v_pendiente := v_det.cantidad_solicitada - v_det.cantidad_reservada;

    IF v_pendiente > 0 THEN
      -- Buscar existencias disponibles ordenadas por FEFO / FIFO
      -- Prioridad 1: Vencimiento más próximo (FEFO)
      -- Prioridad 2: Antigüedad de fabricación / ingreso (FIFO)
      -- Prioridad 3: Pallet completo antes que fraccionado
      FOR v_inv IN
        SELECT 
          i.id AS inv_id,
          i.ubicacion_id,
          i.pallet_id,
          i.lote_id,
          i.cantidad_disponible,
          l.numero_lote,
          l.fecha_vencimiento,
          u.codigo_etiqueta AS codigo_ubicacion
        FROM public.inventario i
        LEFT JOIN public.lotes_cliente l ON l.id = i.lote_id
        JOIN public.ubicaciones u ON u.id = i.ubicacion_id
        WHERE i.cliente_id = v_pedido.cliente_id
          AND i.articulo_id = v_det.articulo_id
          AND i.cantidad_disponible > 0
          AND (l.bloqueado IS NULL OR l.bloqueado = false)
        ORDER BY 
          l.fecha_vencimiento ASC NULLS LAST,
          l.fecha_fabricacion ASC NULLS LAST,
          (CASE WHEN i.pallet_id IS NOT NULL THEN 0 ELSE 1 END) ASC,
          i.actualizado_en ASC
        FOR UPDATE OF i
      LOOP
        EXIT WHEN v_pendiente <= 0;

        v_tomar := LEAST(v_pendiente, v_inv.cantidad_disponible);

        -- Reservar en inventario
        UPDATE public.inventario
        SET cantidad_disponible = cantidad_disponible - v_tomar,
            cantidad_reservada = cantidad_reservada + v_tomar,
            actualizado_en = clock_timestamp()
        WHERE id = v_inv.inv_id;

        -- Crear tarea de picking dirigida
        INSERT INTO public.tareas_picking (
          pedido_id,
          pedido_detalle_id,
          articulo_id,
          lote_id,
          pallet_origen_id,
          ubicacion_origen_id,
          cantidad_a_recolectar,
          cantidad_recolectada,
          observaciones_picking,
          estado
        ) VALUES (
          p_pedido_id,
          v_det.id,
          v_det.articulo_id,
          v_inv.lote_id,
          v_inv.pallet_id,
          v_inv.ubicacion_id,
          v_tomar,
          0.00,
          'Extraer ' || v_tomar::text || ' un. de ' || v_det.nombre || ' (Lote: ' || COALESCE(v_inv.numero_lote, 'S/L') || ') en Pos: ' || v_inv.codigo_ubicacion,
          'pendiente'
        );

        -- Actualizar detalle del pedido
        UPDATE public.pedidos_detalle
        SET cantidad_reservada = cantidad_reservada + v_tomar
        WHERE id = v_det.id;

        v_pendiente := v_pendiente - v_tomar;
        v_total_reservado := v_total_reservado + v_tomar;
        v_tareas_creadas := v_tareas_creadas + 1;
      END LOOP;

      IF v_pendiente > 0 THEN
        -- Hubo faltante de stock para cubrir todo el pedido
        -- Registramos que no se pudo reservar el 100%
      END IF;
    END IF;
  END LOOP;

  IF v_tareas_creadas = 0 THEN
    RAISE EXCEPTION 'No hay stock disponible para reservar los artículos de este pedido';
  END IF;

  -- Actualizar estado del pedido a asignado_picking
  UPDATE public.pedidos
  SET estado = 'asignado_picking',
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'tareas_creadas', v_tareas_creadas,
    'total_unidades_reservadas', v_total_reservado,
    'estado_nuevo', 'asignado_picking'
  );
END;
$$;


-- ==============================================================================
-- 4. RPC: CONFIRMAR PICKING CON SOPORTE DE FALTANTES / DISCREPANCIAS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_confirmar_picking_con_novedad(
  p_tarea_picking_id UUID,
  p_cantidad_recolectada NUMERIC,
  p_novedad TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tarea RECORD;
  v_articulo RECORD;
  v_inv RECORD;
  v_volumen_descontado NUMERIC(14,4);
  v_faltante NUMERIC(12,2) := 0;
  v_tareas_pendientes INT;
BEGIN
  -- 1. Obtener la tarea de picking
  SELECT t.*, p.cliente_id, p.numero_pedido
  INTO v_tarea
  FROM public.tareas_picking t
  JOIN public.pedidos p ON p.id = t.pedido_id
  WHERE t.id = p_tarea_picking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea de picking % no encontrada', p_tarea_picking_id;
  END IF;

  IF v_tarea.estado = 'completada' THEN
    RAISE EXCEPTION 'La tarea de picking % ya fue completada', p_tarea_picking_id;
  END IF;

  IF p_cantidad_recolectada > v_tarea.cantidad_a_recolectar THEN
    RAISE EXCEPTION 'La cantidad recolectada (%) no puede superar lo asignado (%)', p_cantidad_recolectada, v_tarea.cantidad_a_recolectar;
  END IF;

  -- 2. Obtener datos del artículo
  SELECT * INTO v_articulo FROM public.articulos WHERE id = v_tarea.articulo_id;
  v_volumen_descontado := ROUND(p_cantidad_recolectada * v_articulo.volumen_unitario_m3, 4);
  v_faltante := v_tarea.cantidad_a_recolectar - p_cantidad_recolectada;

  -- 3. Localizar y bloquear inventario
  SELECT * INTO v_inv
  FROM public.inventario
  WHERE cliente_id = v_tarea.cliente_id
    AND articulo_id = v_tarea.articulo_id
    AND ubicacion_id = v_tarea.ubicacion_origen_id
    AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
    AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
  FOR UPDATE;

  IF FOUND THEN
    -- Descontar lo reservado que efectivamente se recolectó
    -- Y si hubo faltante, liberar la reserva de vuelta a disponible para no bloquear stock fantasma
    UPDATE public.inventario
    SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_tarea.cantidad_a_recolectar),
        cantidad_disponible = cantidad_disponible + v_faltante,
        volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_descontado),
        actualizado_en = clock_timestamp()
    WHERE id = v_inv.id;

    -- Si era un pallet y se redujo, actualizar pallet
    IF v_tarea.pallet_origen_id IS NOT NULL THEN
      UPDATE public.pallets_lpn
      SET volumen_total_m3 = GREATEST(0.0000, volumen_total_m3 - v_volumen_descontado),
          peso_total_kg = GREATEST(0.000, peso_total_kg - ROUND(p_cantidad_recolectada * v_articulo.peso_unitario_kg, 3)),
          estado = CASE WHEN (v_inv.cantidad_disponible + v_inv.cantidad_reservada - p_cantidad_recolectada) <= 0 THEN 'desarmado'::public.estado_pallet_enum ELSE estado END
      WHERE id = v_tarea.pallet_origen_id;
    END IF;
  END IF;

  -- 4. Actualizar tarea de picking
  UPDATE public.tareas_picking
  SET cantidad_recolectada = p_cantidad_recolectada,
      novedad_faltante = CASE WHEN v_faltante > 0 THEN COALESCE(p_novedad, 'Faltante físico de ' || v_faltante::text || ' unidades') ELSE NULL END,
      estado = 'completada'
  WHERE id = p_tarea_picking_id;

  -- 5. Actualizar pedidos_detalle
  UPDATE public.pedidos_detalle
  SET cantidad_separada = cantidad_separada + p_cantidad_recolectada,
      cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_faltante)
  WHERE id = v_tarea.pedido_detalle_id;

  -- 6. Asiento inmutable en Kardex
  IF p_cantidad_recolectada > 0 THEN
    INSERT INTO public.movimientos_inventario (
      cliente_id, lote_id, articulo_id, pallet_id,
      ubicacion_origen_id, ubicacion_destino_id,
      tipo_movimiento, cantidad, volumen_m3,
      documento_referencia, usuario_id, notas
    ) VALUES (
      v_tarea.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_tarea.pallet_origen_id,
      v_tarea.ubicacion_origen_id, NULL,
      'picking', p_cantidad_recolectada, v_volumen_descontado,
      'PICKING-' || v_tarea.numero_pedido, (SELECT auth.uid()),
      CASE WHEN v_faltante > 0 
           THEN 'Picking parcial (' || p_cantidad_recolectada::text || '/' || v_tarea.cantidad_a_recolectar::text || '). Novedad: ' || COALESCE(p_novedad, 'Faltante')
           ELSE 'Picking completo para pedido ' || v_tarea.numero_pedido
      END
    );
  END IF;

  -- 7. Verificar si quedan tareas de picking pendientes para este pedido
  SELECT COUNT(*) INTO v_tareas_pendientes
  FROM public.tareas_picking
  WHERE pedido_id = v_tarea.pedido_id AND estado != 'completada';

  IF v_tareas_pendientes = 0 THEN
    -- Todas las tareas finalizadas -> Pedido pasa a estado 'en_picking' o 'preparado' para packing
    UPDATE public.pedidos
    SET estado = 'preparado',
        actualizado_en = clock_timestamp()
    WHERE id = v_tarea.pedido_id;
  ELSE
    UPDATE public.pedidos
    SET estado = 'en_picking',
        actualizado_en = clock_timestamp()
    WHERE id = v_tarea.pedido_id;
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'tarea_id', p_tarea_picking_id,
    'cantidad_recolectada', p_cantidad_recolectada,
    'faltante', v_faltante,
    'tareas_pendientes', v_tareas_pendientes,
    'pedido_estado', CASE WHEN v_tareas_pendientes = 0 THEN 'preparado' ELSE 'en_picking' END
  );
END;
$$;


-- ==============================================================================
-- 5. RPC: CONSOLIDAR PALLET DE DESPACHO EN PACKING STATION
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_consolidar_pallet_despacho(
  p_pedido_id UUID,
  p_pallet_salida_lpn TEXT,
  p_total_bultos INT,
  p_peso_estimado_kg NUMERIC,
  p_volumen_estimado_m3 NUMERIC,
  p_orden_salida_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_pedido RECORD;
  v_paletizado_id UUID;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  INSERT INTO public.paletizado_despacho (
    pedido_id,
    pallet_salida_lpn,
    total_bultos,
    peso_estimado_kg,
    volumen_estimado_m3,
    orden_salida_id
  ) VALUES (
    p_pedido_id,
    p_pallet_salida_lpn,
    p_total_bultos,
    p_peso_estimado_kg,
    p_volumen_estimado_m3,
    p_orden_salida_id
  ) RETURNING id INTO v_paletizado_id;

  RETURN jsonb_build_object(
    'exito', true,
    'paletizado_id', v_paletizado_id,
    'pedido_id', p_pedido_id,
    'pallet_salida_lpn', p_pallet_salida_lpn,
    'total_bultos', p_total_bultos,
    'volumen_m3', p_volumen_estimado_m3
  );
END;
$$;


-- ==============================================================================
-- 6. RPC: EMITIR REMITO RX DE TRÁNSITO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_emitir_remito_rx(
  p_pedido_id UUID,
  p_numero_remito_rx TEXT,
  p_cae TEXT DEFAULT NULL,
  p_orden_salida_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_pedido RECORD;
  v_remito_id UUID;
  v_total_bultos INT := 0;
  v_total_pallets INT := 0;
  v_peso_total NUMERIC(12,3) := 0.000;
  v_volumen_total NUMERIC(14,4) := 0.0000;
  v_valor_declarado_total NUMERIC(14,2) := 0.00;
BEGIN
  -- 1. Obtener pedido
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado', p_pedido_id;
  END IF;

  -- 2. Calcular totales desde pedidos_detalle y articulos
  SELECT 
    COALESCE(SUM(pd.cantidad_separada), 0),
    COALESCE(SUM(ROUND(pd.cantidad_separada * a.peso_unitario_kg, 3)), 0.000),
    COALESCE(SUM(ROUND(pd.cantidad_separada * a.volumen_unitario_m3, 4)), 0.0000),
    COALESCE(SUM(ROUND(pd.cantidad_separada * a.valor_declarado, 2)), 0.00)
  INTO 
    v_total_bultos,
    v_peso_total,
    v_volumen_total,
    v_valor_declarado_total
  FROM public.pedidos_detalle pd
  JOIN public.articulos a ON a.id = pd.articulo_id
  WHERE pd.pedido_id = p_pedido_id;

  -- 3. Calcular cantidad de pallets de salida registrados
  SELECT COUNT(*) INTO v_total_pallets
  FROM public.paletizado_despacho
  WHERE pedido_id = p_pedido_id;

  IF v_total_pallets = 0 THEN
    v_total_pallets := 1; -- Por defecto al menos 1 bulto/pallet de despacho
  END IF;

  -- 4. Insertar Remito Rx de Tránsito
  INSERT INTO public.remitos_transito (
    pedido_id,
    cliente_id,
    destinatario_id,
    numero_remito_rx,
    cae_o_autorizacion_fiscal,
    total_bultos,
    total_pallets,
    peso_total_kg,
    volumen_total_m3,
    valor_declarado_total,
    orden_salida_id,
    estado
  ) VALUES (
    p_pedido_id,
    v_pedido.cliente_id,
    v_pedido.destinatario_id,
    p_numero_remito_rx,
    p_cae,
    v_total_bultos,
    v_total_pallets,
    v_peso_total,
    v_volumen_total,
    v_valor_declarado_total,
    p_orden_salida_id,
    'emitido'
  ) RETURNING id INTO v_remito_id;

  -- 5. Actualizar estado del pedido
  UPDATE public.pedidos
  SET estado = 'agrupado_salida',
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'remito_id', v_remito_id,
    'numero_remito_rx', p_numero_remito_rx,
    'pedido_id', p_pedido_id,
    'total_bultos', v_total_bultos,
    'total_pallets', v_total_pallets,
    'peso_total_kg', v_peso_total,
    'volumen_total_m3', v_volumen_total,
    'valor_declarado_total', v_valor_declarado_total
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_confirmar_picking_con_novedad(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_consolidar_pallet_despacho(UUID, TEXT, INT, NUMERIC, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID) TO authenticated;
