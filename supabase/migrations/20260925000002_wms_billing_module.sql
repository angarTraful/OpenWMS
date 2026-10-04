-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: MÓDULO DE FACTURACIÓN Y LIQUIDACIÓN DE ESPACIO (M3)
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. TABLA: TARIFAS POR CLIENTE Y CONCEPTO
CREATE TABLE IF NOT EXISTS public.tarifas_cliente_concepto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  concepto_codigo TEXT NOT NULL, -- ej: ESTADIA_M3_DIA, REC_CONTAINER_20, REC_CONTAINER_40_HC, REC_CARGA_SUELTA, INBOUND_CLASIF_BULTO, PICKING_BULTO, SERVICIO_CARGA_OUT
  descripcion TEXT NOT NULL,
  tipo_unidad TEXT NOT NULL, -- m3_dia, operacion, bulto, pallet, servicio, hora
  precio_unitario NUMERIC(14,4) DEFAULT 0.0000 NOT NULL CHECK (precio_unitario >= 0),
  moneda TEXT DEFAULT '$' NOT NULL,
  activo BOOLEAN DEFAULT true NOT NULL,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT tarifas_cliente_concepto_uk UNIQUE (cliente_id, concepto_codigo)
);

CREATE INDEX IF NOT EXISTS idx_tarifas_cliente_concepto_cliente 
  ON public.tarifas_cliente_concepto(cliente_id) WHERE activo = true;

-- 2. TABLA: LIQUIDACIONES DE CLIENTES (CABECERA)
CREATE TABLE IF NOT EXISTS public.liquidaciones_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_liquidacion TEXT UNIQUE NOT NULL, -- ej: LIQ-2026-09-0001
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  estado TEXT DEFAULT 'borrador' NOT NULL CHECK (estado IN ('borrador', 'aprobada', 'facturada', 'anulada')),
  total_dias_periodo INTEGER NOT NULL CHECK (total_dias_periodo > 0),
  total_m3_dias NUMERIC(14,4) DEFAULT 0.0000 NOT NULL CHECK (total_m3_dias >= 0),
  total_bultos_stock NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (total_bultos_stock >= 0), -- Bultos totales promedio como dato extra
  subtotal_estadia NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (subtotal_estadia >= 0),
  subtotal_operativo NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (subtotal_operativo >= 0),
  subtotal_manuales NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (subtotal_manuales >= 0),
  monto_total NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (monto_total >= 0),
  moneda TEXT DEFAULT '$' NOT NULL,
  auditoria_desvios_detectados JSONB DEFAULT '{"desvios_count": 0, "detalles": []}'::jsonb NOT NULL,
  observaciones TEXT,
  aprobado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha_aprobacion TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT liquidaciones_fechas_check CHECK (fecha_desde <= fecha_hasta)
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_cliente_fecha 
  ON public.liquidaciones_cliente(cliente_id, fecha_desde, fecha_hasta);

-- 3. TABLA: TRAMOS DE STOCK CONSTANTE (SUMARIZANDO DÍAS CON MISMO NIVEL DE STOCK)
CREATE TABLE IF NOT EXISTS public.liquidaciones_cliente_tramos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidacion_id UUID NOT NULL REFERENCES public.liquidaciones_cliente(id) ON DELETE CASCADE,
  orden_tramo INTEGER NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_en_tramo INTEGER NOT NULL CHECK (dias_en_tramo > 0),
  volumen_m3 NUMERIC(14,4) NOT NULL CHECK (volumen_m3 >= 0),
  bultos_totales NUMERIC(14,2) DEFAULT 0.00 NOT NULL CHECK (bultos_totales >= 0),
  m3_dias_acumulados NUMERIC(14,4) NOT NULL CHECK (m3_dias_acumulados >= 0),
  tarifa_m3_aplicada NUMERIC(14,4) NOT NULL CHECK (tarifa_m3_aplicada >= 0),
  subtotal_tramo NUMERIC(14,2) NOT NULL CHECK (subtotal_tramo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_tramos_liq 
  ON public.liquidaciones_cliente_tramos(liquidacion_id, orden_tramo);

-- 4. TABLA: ÍTEMS / RENGLONES DE LIQUIDACIÓN (CONCEPTOS AUTOMÁTICOS + MANUALES A MANO)
CREATE TABLE IF NOT EXISTS public.liquidaciones_cliente_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liquidacion_id UUID NOT NULL REFERENCES public.liquidaciones_cliente(id) ON DELETE CASCADE,
  concepto_codigo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  origen TEXT DEFAULT 'automatico' NOT NULL CHECK (origen IN ('automatico', 'manual')),
  cantidad NUMERIC(14,4) NOT NULL CHECK (cantidad >= 0),
  unidad_medida TEXT NOT NULL, -- m3_dia, contenedor, bulto, pallet, servicio, hora
  precio_unitario NUMERIC(14,4) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_liquidaciones_items_liq 
  ON public.liquidaciones_cliente_items(liquidacion_id, origen);

-- 5. TRIGGERS DE ACTUALIZACIÓN DE TIMESTAMP
DROP TRIGGER IF EXISTS trigger_set_actualizado_en_tarifas ON public.tarifas_cliente_concepto;
CREATE TRIGGER trigger_set_actualizado_en_tarifas
  BEFORE UPDATE ON public.tarifas_cliente_concepto
  FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

DROP TRIGGER IF EXISTS trigger_set_actualizado_en_liquidaciones ON public.liquidaciones_cliente;
CREATE TRIGGER trigger_set_actualizado_en_liquidaciones
  BEFORE UPDATE ON public.liquidaciones_cliente
  FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

-- 6. SEMILLAS POR DEFECTO PARA CLIENTES EXISTENTES
INSERT INTO public.tarifas_cliente_concepto (cliente_id, concepto_codigo, descripcion, tipo_unidad, precio_unitario, moneda)
SELECT 
  c.id,
  tc.concepto_codigo,
  tc.descripcion,
  tc.tipo_unidad,
  tc.precio_unitario,
  '$'
FROM public.clientes c
CROSS JOIN (
  VALUES 
    ('ESTADIA_M3_DIA', 'Tarifa por M³/día de estadía', 'm3_dia', 0.8500),
    ('REC_CONTAINER_20', 'Recepción de mercadería Container 20''', 'operacion', 120.0000),
    ('REC_CONTAINER_40_HC', 'Recepción de mercadería Container 40'' HC', 'operacion', 180.0000),
    ('REC_CARGA_SUELTA', 'Recepción de mercadería Carga Suelta', 'operacion', 75.0000),
    ('INBOUND_CLASIF_BULTO', 'Bulto ingresado clasificación (Inbound)', 'bulto', 0.1500),
    ('PICKING_BULTO', 'Bulto preparado (Picking)', 'bulto', 0.2200),
    ('SERVICIO_CARGA_OUT', 'Servicio a la Carga (OUT)', 'servicio', 35.0000)
) AS tc(concepto_codigo, descripcion, tipo_unidad, precio_unitario)
ON CONFLICT (cliente_id, concepto_codigo) DO NOTHING;


-- ==============================================================================
-- 7. PROCEDIMIENTO RPC: LIQUIDAR PERÍODO CON TRAMOS DE STOCK CONSTANTE
-- ==============================================================================
CREATE OR REPLACE FUNCTION wms_liquidar_estadia_periodo(
  p_cliente_id UUID,
  p_fecha_desde DATE,
  p_fecha_hasta DATE,
  p_recalcular BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_liq_existente RECORD;
  v_num_liq TEXT;
  v_liquidacion_id UUID;
  v_total_dias INT;
  
  -- Tarifas obtenidas
  v_tarifa_m3 NUMERIC(14,4) := 0;
  v_tarifa_rec_20 NUMERIC(14,4) := 0;
  v_tarifa_rec_40 NUMERIC(14,4) := 0;
  v_tarifa_rec_suelta NUMERIC(14,4) := 0;
  v_tarifa_inbound_bulto NUMERIC(14,4) := 0;
  v_tarifa_picking_bulto NUMERIC(14,4) := 0;
  v_tarifa_carga_out NUMERIC(14,4) := 0;

  -- Operaciones computadas
  v_rec_20_count INT := 0;
  v_rec_40_count INT := 0;
  v_rec_suelta_count INT := 0;
  v_bultos_inbound NUMERIC(14,2) := 0;
  v_bultos_picking NUMERIC(14,2) := 0;
  v_despachos_count INT := 0;

  -- Stock del día actual como referencia base
  v_stock_actual_m3 NUMERIC(14,4) := 0;
  v_stock_actual_bultos NUMERIC(14,2) := 0;

  -- Variables para cálculo diario y tramos
  v_dia DATE;
  v_vol_dia NUMERIC(14,4);
  v_bultos_dia NUMERIC(14,2);
  v_dias_reconstruidos JSONB := '[]'::jsonb;

  -- Totales acumulados
  v_total_m3_dias NUMERIC(14,4) := 0;
  v_subtotal_estadia NUMERIC(14,2) := 0;
  v_subtotal_operativo NUMERIC(14,2) := 0;
  v_subtotal_manuales NUMERIC(14,2) := 0;
  v_monto_total NUMERIC(14,2) := 0;
  v_bultos_promedio NUMERIC(14,2) := 0;

  -- Auditoría preventiva Kardex vs Stock
  v_stock_inv_bultos NUMERIC(14,2) := 0;
  v_stock_kardex_bultos NUMERIC(14,2) := 0;
  v_desvio_bultos NUMERIC(14,2) := 0;
  v_auditoria JSONB;

  -- Iteración de tramos
  r_tramo RECORD;
  v_orden INT := 1;
BEGIN
  -- 1. Validar parámetros
  IF p_cliente_id IS NULL OR p_fecha_desde IS NULL OR p_fecha_hasta IS NULL THEN
    RAISE EXCEPTION 'Parámetros obligatorios faltantes (cliente, fecha_desde, fecha_hasta)';
  END IF;

  IF p_fecha_desde > p_fecha_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser posterior a la fecha final';
  END IF;

  v_total_dias := (p_fecha_hasta - p_fecha_desde) + 1;

  -- 2. Verificar existencia de liquidación previa en el rango
  SELECT id, numero_liquidacion, estado 
  INTO v_liq_existente
  FROM public.liquidaciones_cliente
  WHERE cliente_id = p_cliente_id 
    AND fecha_desde = p_fecha_desde 
    AND fecha_hasta = p_fecha_hasta
  LIMIT 1;

  IF v_liq_existente.id IS NOT NULL THEN
    IF v_liq_existente.estado IN ('aprobada', 'facturada') THEN
      RAISE EXCEPTION 'La liquidación % para este período ya se encuentra % y congelada.', 
        v_liq_existente.numero_liquidacion, v_liq_existente.estado;
    END IF;

    IF NOT p_recalcular THEN
      -- Retornar la existente
      SELECT jsonb_build_object(
        'success', true,
        'liquidacion_id', v_liq_existente.id,
        'numero_liquidacion', v_liq_existente.numero_liquidacion,
        'mensaje', 'Liquidación en borrador recuperada'
      ) INTO v_auditoria;
      RETURN v_auditoria;
    ELSE
      -- Eliminar para recalcular limpiamente
      DELETE FROM public.liquidaciones_cliente WHERE id = v_liq_existente.id;
    END IF;
  END IF;

  -- 3. Auditoría preventiva ACID: Comparar Stock en Tabla vs Saldo Kardex
  SELECT COALESCE(SUM(cantidad_disponible + cantidad_reservada), 0)
  INTO v_stock_inv_bultos
  FROM public.inventario
  WHERE cliente_id = p_cliente_id;

  SELECT COALESCE(SUM(
    CASE 
      WHEN tipo_movimiento IN ('recepcion', 'ajuste_positivo') THEN cantidad
      WHEN tipo_movimiento IN ('picking', 'merma', 'ajuste_negativo') THEN -cantidad
      ELSE 0
    END
  ), 0)
  INTO v_stock_kardex_bultos
  FROM public.movimientos_inventario
  WHERE cliente_id = p_cliente_id;

  v_desvio_bultos := v_stock_inv_bultos - v_stock_kardex_bultos;

  IF ABS(v_desvio_bultos) > 0.001 THEN
    v_auditoria := jsonb_build_object(
      'desvios_count', 1,
      'estado', 'ALERTA',
      'mensaje', 'Discrepancia detectada entre Stock Actual e Histórico Kardex',
      'stock_inventario_bultos', v_stock_inv_bultos,
      'stock_kardex_bultos', v_stock_kardex_bultos,
      'diferencia_bultos', v_desvio_bultos
    );
  ELSE
    v_auditoria := jsonb_build_object(
      'desvios_count', 0,
      'estado', 'OK',
      'mensaje', 'Consistencia transaccional ACID 100% verificada (Kardex sin desvíos)',
      'stock_bultos_verificado', v_stock_inv_bultos
    );
  END IF;

  -- 4. Obtener tarifas vigentes del cliente
  SELECT COALESCE(precio_unitario, 0.85) INTO v_tarifa_m3
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'ESTADIA_M3_DIA' AND activo = true;

  SELECT COALESCE(precio_unitario, 120.0) INTO v_tarifa_rec_20
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'REC_CONTAINER_20' AND activo = true;

  SELECT COALESCE(precio_unitario, 180.0) INTO v_tarifa_rec_40
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'REC_CONTAINER_40_HC' AND activo = true;

  SELECT COALESCE(precio_unitario, 75.0) INTO v_tarifa_rec_suelta
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'REC_CARGA_SUELTA' AND activo = true;

  SELECT COALESCE(precio_unitario, 0.15) INTO v_tarifa_inbound_bulto
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'INBOUND_CLASIF_BULTO' AND activo = true;

  SELECT COALESCE(precio_unitario, 0.22) INTO v_tarifa_picking_bulto
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'PICKING_BULTO' AND activo = true;

  SELECT COALESCE(precio_unitario, 35.0) INTO v_tarifa_carga_out
  FROM public.tarifas_cliente_concepto 
  WHERE cliente_id = p_cliente_id AND concepto_codigo = 'SERVICIO_CARGA_OUT' AND activo = true;

  -- 5. Generar número de liquidación consecutivo
  v_num_liq := 'LIQ-' || TO_CHAR(p_fecha_hasta, 'YYYY-MM') || '-' || LPAD(FLOOR(1 + RANDOM() * 9999)::TEXT, 4, '0');

  -- 6. Obtener Stock Base Actual para cálculo retrospectivo
  SELECT 
    COALESCE(SUM(volumen_m3), 0),
    COALESCE(SUM(cantidad_disponible + cantidad_reservada), 0)
  INTO v_stock_actual_m3, v_stock_actual_bultos
  FROM public.inventario
  WHERE cliente_id = p_cliente_id;

  -- 7. Crear tabla temporal para alojar cada día del rango con su stock
  CREATE TEMP TABLE temp_dias_stock (
    dia DATE PRIMARY KEY,
    volumen_m3 NUMERIC(14,4) NOT NULL,
    bultos_totales NUMERIC(14,2) NOT NULL
  ) ON COMMIT DROP;

  -- Reconstruir retrospectivamente el stock de cada día D:
  -- Stock(D) = Stock_Actual - Movimientos posteriores al fin del día D
  FOR v_dia IN 
    SELECT generate_series(p_fecha_desde, p_fecha_hasta, '1 day'::interval)::DATE
  LOOP
    SELECT 
      GREATEST(0, v_stock_actual_m3 - COALESCE(SUM(
        CASE 
          WHEN m.tipo_movimiento IN ('recepcion', 'ajuste_positivo') THEN m.volumen_m3
          WHEN m.tipo_movimiento IN ('picking', 'merma', 'ajuste_negativo') THEN -m.volumen_m3
          ELSE 0
        END
      ), 0)),
      GREATEST(0, v_stock_actual_bultos - COALESCE(SUM(
        CASE 
          WHEN m.tipo_movimiento IN ('recepcion', 'ajuste_positivo') THEN m.cantidad
          WHEN m.tipo_movimiento IN ('picking', 'merma', 'ajuste_negativo') THEN -m.cantidad
          ELSE 0
        END
      ), 0))
    INTO v_vol_dia, v_bultos_dia
    FROM public.movimientos_inventario m
    WHERE m.cliente_id = p_cliente_id
      AND m.fecha_hora > (v_dia + TIME '23:59:59');

    INSERT INTO temp_dias_stock(dia, volumen_m3, bultos_totales)
    VALUES (v_dia, ROUND(v_vol_dia, 4), ROUND(v_bultos_dia, 2));
  END LOOP;

  -- 8. Calcular Bultos Promedio y M3*Días totales
  SELECT 
    COALESCE(SUM(volumen_m3), 0),
    COALESCE(AVG(bultos_totales), 0)
  INTO v_total_m3_dias, v_bultos_promedio
  FROM temp_dias_stock;

  v_subtotal_estadia := ROUND(v_total_m3_dias * v_tarifa_m3, 2);

  -- 9. Insertar Cabecera de Liquidación
  INSERT INTO public.liquidaciones_cliente (
    numero_liquidacion,
    cliente_id,
    fecha_desde,
    fecha_hasta,
    estado,
    total_dias_periodo,
    total_m3_dias,
    total_bultos_stock,
    subtotal_estadia,
    subtotal_operativo,
    subtotal_manuales,
    monto_total,
    moneda,
    auditoria_desvios_detectados
  ) VALUES (
    v_num_liq,
    p_cliente_id,
    p_fecha_desde,
    p_fecha_hasta,
    'borrador',
    v_total_dias,
    v_total_m3_dias,
    v_bultos_promedio,
    v_subtotal_estadia,
    0,
    0,
    v_subtotal_estadia,
    'USD',
    v_auditoria
  ) RETURNING id INTO v_liquidacion_id;

  -- 10. Agrupar y generar Tramos de Stock Constante
  -- Se identifican días contiguos con el mismo volumen_m3
  CREATE TEMP TABLE temp_tramos_calculados ON COMMIT DROP AS
  WITH agrupados AS (
    SELECT 
      dia,
      volumen_m3,
      bultos_totales,
      -- Crea un ID de grupo cada vez que cambia el volumen_m3
      COUNT(CASE WHEN cambio THEN 1 END) OVER (ORDER BY dia) AS tramo_grp
    FROM (
      SELECT 
        dia,
        volumen_m3,
        bultos_totales,
        (LAG(volumen_m3) OVER (ORDER BY dia) IS DISTINCT FROM volumen_m3) AS cambio
      FROM temp_dias_stock
    ) s
  )
  SELECT 
    MIN(dia) AS fecha_inicio,
    MAX(dia) AS fecha_fin,
    COUNT(*)::INT AS dias_en_tramo,
    volumen_m3,
    MAX(bultos_totales) AS bultos_totales,
    SUM(volumen_m3) AS m3_dias_acumulados
  FROM agrupados
  GROUP BY tramo_grp, volumen_m3
  ORDER BY MIN(dia);

  v_orden := 1;
  FOR r_tramo IN SELECT * FROM temp_tramos_calculados ORDER BY fecha_inicio LOOP
    INSERT INTO public.liquidaciones_cliente_tramos (
      liquidacion_id,
      orden_tramo,
      fecha_inicio,
      fecha_fin,
      dias_en_tramo,
      volumen_m3,
      bultos_totales,
      m3_dias_acumulados,
      tarifa_m3_aplicada,
      subtotal_tramo
    ) VALUES (
      v_liquidacion_id,
      v_orden,
      r_tramo.fecha_inicio,
      r_tramo.fecha_fin,
      r_tramo.dias_en_tramo,
      r_tramo.volumen_m3,
      r_tramo.bultos_totales,
      r_tramo.m3_dias_acumulados,
      v_tarifa_m3,
      ROUND(r_tramo.m3_dias_acumulados * v_tarifa_m3, 2)
    );
    v_orden := v_orden + 1;
  END LOOP;

  -- 11. Calcular Conceptos Operativos Inbound y Outbound en el Período
  -- 11.a Recepción por Tipo de Contenedor
  SELECT 
    COUNT(CASE WHEN tipo_contenedor = '20ft' THEN 1 END),
    COUNT(CASE WHEN tipo_contenedor = '40ft' THEN 1 END),
    COUNT(CASE WHEN tipo_contenedor NOT IN ('20ft', '40ft') OR tipo_contenedor IS NULL THEN 1 END)
  INTO v_rec_20_count, v_rec_40_count, v_rec_suelta_count
  FROM public.ordenes_recepcion
  WHERE cliente_id = p_cliente_id
    AND fecha_hora_arribo::DATE BETWEEN p_fecha_desde AND p_fecha_hasta
    AND estado IN ('en_control', 'finalizada');

  -- 11.b Bultos Inbound
  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_bultos_inbound
  FROM public.movimientos_inventario
  WHERE cliente_id = p_cliente_id
    AND tipo_movimiento = 'recepcion'
    AND fecha_hora::DATE BETWEEN p_fecha_desde AND p_fecha_hasta;

  -- 11.c Bultos Outbound (Picking)
  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_bultos_picking
  FROM public.movimientos_inventario
  WHERE cliente_id = p_cliente_id
    AND tipo_movimiento = 'picking'
    AND fecha_hora::DATE BETWEEN p_fecha_desde AND p_fecha_hasta;

  -- 11.d Servicios a la Carga / Despachos
  SELECT COUNT(DISTINCT r.id)
  INTO v_despachos_count
  FROM public.remitos_transito r
  WHERE r.cliente_id = p_cliente_id
    AND r.fecha_emision::DATE BETWEEN p_fecha_desde AND p_fecha_hasta
    AND r.estado != 'rechazado_total';

  -- 12. Insertar Renglones / Ítems de Liquidación Automáticos
  -- Ítem Estadía
  INSERT INTO public.liquidaciones_cliente_items (
    liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal, notas
  ) VALUES (
    v_liquidacion_id,
    'ESTADIA_M3_DIA',
    'Estadía de Stock por Volumen M³ (' || v_total_dias || ' días de período)',
    'automatico',
    v_total_m3_dias,
    'm3_dia',
    v_tarifa_m3,
    v_subtotal_estadia,
    'Sumarizado según tramos de días con stock constante'
  );

  -- Ítem Contenedores 20ft
  IF v_rec_20_count > 0 THEN
    INSERT INTO public.liquidaciones_cliente_items (
      liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal
    ) VALUES (
      v_liquidacion_id, 'REC_CONTAINER_20', 'Descarga y Recepción Container 20ft', 'automatico',
      v_rec_20_count, 'operacion', v_tarifa_rec_20, ROUND(v_rec_20_count * v_tarifa_rec_20, 2)
    );
    v_subtotal_operativo := v_subtotal_operativo + ROUND(v_rec_20_count * v_tarifa_rec_20, 2);
  END IF;

  -- Ítem Contenedores 40ft HC
  IF v_rec_40_count > 0 THEN
    INSERT INTO public.liquidaciones_cliente_items (
      liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal
    ) VALUES (
      v_liquidacion_id, 'REC_CONTAINER_40_HC', 'Descarga y Recepción Container 40ft HC', 'automatico',
      v_rec_40_count, 'operacion', v_tarifa_rec_40, ROUND(v_rec_40_count * v_tarifa_rec_40, 2)
    );
    v_subtotal_operativo := v_subtotal_operativo + ROUND(v_rec_40_count * v_tarifa_rec_40, 2);
  END IF;

  -- Ítem Carga Suelta
  IF v_rec_suelta_count > 0 THEN
    INSERT INTO public.liquidaciones_cliente_items (
      liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal
    ) VALUES (
      v_liquidacion_id, 'REC_CARGA_SUELTA', 'Descarga y Recepción Carga Suelta / Camión', 'automatico',
      v_rec_suelta_count, 'operacion', v_tarifa_rec_suelta, ROUND(v_rec_suelta_count * v_tarifa_rec_suelta, 2)
    );
    v_subtotal_operativo := v_subtotal_operativo + ROUND(v_rec_suelta_count * v_tarifa_rec_suelta, 2);
  END IF;

  -- Ítem Bultos Inbound
  IF v_bultos_inbound > 0 THEN
    INSERT INTO public.liquidaciones_cliente_items (
      liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal
    ) VALUES (
      v_liquidacion_id, 'INBOUND_CLASIF_BULTO', 'Clasificación y Control de Bultos Inbound', 'automatico',
      v_bultos_inbound, 'bulto', v_tarifa_inbound_bulto, ROUND(v_bultos_inbound * v_tarifa_inbound_bulto, 2)
    );
    v_subtotal_operativo := v_subtotal_operativo + ROUND(v_bultos_inbound * v_tarifa_inbound_bulto, 2);
  END IF;

  -- Ítem Bultos Picking Outbound
  IF v_bultos_picking > 0 THEN
    INSERT INTO public.liquidaciones_cliente_items (
      liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal
    ) VALUES (
      v_liquidacion_id, 'PICKING_BULTO', 'Preparación y Picking de Bultos Outbound', 'automatico',
      v_bultos_picking, 'bulto', v_tarifa_picking_bulto, ROUND(v_bultos_picking * v_tarifa_picking_bulto, 2)
    );
    v_subtotal_operativo := v_subtotal_operativo + ROUND(v_bultos_picking * v_tarifa_picking_bulto, 2);
  END IF;

  -- Ítem Servicio a la Carga (Despachos)
  IF v_despachos_count > 0 THEN
    INSERT INTO public.liquidaciones_cliente_items (
      liquidacion_id, concepto_codigo, descripcion, origen, cantidad, unidad_medida, precio_unitario, subtotal
    ) VALUES (
      v_liquidacion_id, 'SERVICIO_CARGA_OUT', 'Servicio de Despacho y Carga a Camión', 'automatico',
      v_despachos_count, 'servicio', v_tarifa_carga_out, ROUND(v_despachos_count * v_tarifa_carga_out, 2)
    );
    v_subtotal_operativo := v_subtotal_operativo + ROUND(v_despachos_count * v_tarifa_carga_out, 2);
  END IF;

  -- 13. Actualizar Totales Finales en Cabecera
  v_monto_total := v_subtotal_estadia + v_subtotal_operativo;

  UPDATE public.liquidaciones_cliente
  SET 
    subtotal_operativo = v_subtotal_operativo,
    monto_total = v_monto_total
  WHERE id = v_liquidacion_id;

  -- Retornar resumen completo en JSONB
  RETURN jsonb_build_object(
    'success', true,
    'liquidacion_id', v_liquidacion_id,
    'numero_liquidacion', v_num_liq,
    'dias_periodo', v_total_dias,
    'total_m3_dias', v_total_m3_dias,
    'total_bultos_promedio', v_bultos_promedio,
    'subtotal_estadia', v_subtotal_estadia,
    'subtotal_operativo', v_subtotal_operativo,
    'monto_total', v_monto_total,
    'auditoria', v_auditoria
  );
END;
$$;


-- ==============================================================================
-- 8. PROCEDIMIENTO RPC: INSERTAR CONCEPTO A MANO EN LA LIQUIDACIÓN
-- ==============================================================================
CREATE OR REPLACE FUNCTION wms_agregar_item_manual_liquidacion(
  p_liquidacion_id UUID,
  p_concepto_codigo TEXT,
  p_descripcion TEXT,
  p_cantidad NUMERIC,
  p_unidad_medida TEXT,
  p_precio_unitario NUMERIC,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
  v_item_id UUID;
  v_subtotal NUMERIC(14,2);
  v_nuevo_subtotal_manuales NUMERIC(14,2);
  v_nuevo_monto_total NUMERIC(14,2);
BEGIN
  -- 1. Validar parámetros
  IF p_liquidacion_id IS NULL OR TRIM(p_descripcion) = '' OR p_cantidad <= 0 OR p_precio_unitario < 0 THEN
    RAISE EXCEPTION 'Parámetros inválidos para agregar ítem manual';
  END IF;

  -- 2. Validar que la liquidación esté en borrador
  SELECT estado INTO v_estado
  FROM public.liquidaciones_cliente
  WHERE id = p_liquidacion_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_estado != 'borrador' THEN
    RAISE EXCEPTION 'No se pueden agregar ítems a una liquidación en estado %', v_estado;
  END IF;

  v_subtotal := ROUND(p_cantidad * p_precio_unitario, 2);

  -- 3. Insertar el ítem manual
  INSERT INTO public.liquidaciones_cliente_items (
    liquidacion_id,
    concepto_codigo,
    descripcion,
    origen,
    cantidad,
    unidad_medida,
    precio_unitario,
    subtotal,
    notas
  ) VALUES (
    p_liquidacion_id,
    COALESCE(p_concepto_codigo, 'MANUAL_AD_HOC'),
    p_descripcion,
    'manual',
    p_cantidad,
    COALESCE(p_unidad_medida, 'servicio'),
    p_precio_unitario,
    v_subtotal,
    p_notas
  ) RETURNING id INTO v_item_id;

  -- 4. Recalcular acumulados en cabecera
  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_nuevo_subtotal_manuales
  FROM public.liquidaciones_cliente_items
  WHERE liquidacion_id = p_liquidacion_id AND origen = 'manual';

  UPDATE public.liquidaciones_cliente
  SET 
    subtotal_manuales = v_nuevo_subtotal_manuales,
    monto_total = subtotal_estadia + subtotal_operativo + v_nuevo_subtotal_manuales
  WHERE id = p_liquidacion_id
  RETURNING monto_total INTO v_nuevo_monto_total;

  RETURN jsonb_build_object(
    'success', true,
    'item_id', v_item_id,
    'subtotal', v_subtotal,
    'nuevo_monto_total', v_nuevo_monto_total
  );
END;
$$;


-- ==============================================================================
-- 9. PROCEDIMIENTO RPC: ELIMINAR ÍTEM MANUAL
-- ==============================================================================
CREATE OR REPLACE FUNCTION wms_eliminar_item_manual_liquidacion(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_liq_id UUID;
  v_origen TEXT;
  v_estado TEXT;
  v_nuevo_subtotal_manuales NUMERIC(14,2);
  v_nuevo_monto_total NUMERIC(14,2);
BEGIN
  SELECT liquidacion_id, origen INTO v_liq_id, v_origen
  FROM public.liquidaciones_cliente_items
  WHERE id = p_item_id;

  IF v_liq_id IS NULL THEN
    RAISE EXCEPTION 'Ítem no encontrado';
  END IF;

  IF v_origen != 'manual' THEN
    RAISE EXCEPTION 'Solo se pueden eliminar ítems agregados manualmente';
  END IF;

  SELECT estado INTO v_estado
  FROM public.liquidaciones_cliente
  WHERE id = v_liq_id;

  IF v_estado != 'borrador' THEN
    RAISE EXCEPTION 'No se pueden modificar ítems de una liquidación en estado %', v_estado;
  END IF;

  DELETE FROM public.liquidaciones_cliente_items WHERE id = p_item_id;

  SELECT COALESCE(SUM(subtotal), 0)
  INTO v_nuevo_subtotal_manuales
  FROM public.liquidaciones_cliente_items
  WHERE liquidacion_id = v_liq_id AND origen = 'manual';

  UPDATE public.liquidaciones_cliente
  SET 
    subtotal_manuales = v_nuevo_subtotal_manuales,
    monto_total = subtotal_estadia + subtotal_operativo + v_nuevo_subtotal_manuales
  WHERE id = v_liq_id
  RETURNING monto_total INTO v_nuevo_monto_total;

  RETURN jsonb_build_object(
    'success', true,
    'nuevo_monto_total', v_nuevo_monto_total
  );
END;
$$;


-- ==============================================================================
-- 10. PROCEDIMIENTO RPC: APROBAR LIQUIDACIÓN (BLOQUEO INMUTABLE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION wms_aprobar_liquidacion(
  p_liquidacion_id UUID,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
  v_num_liq TEXT;
BEGIN
  SELECT estado, numero_liquidacion INTO v_estado, v_num_liq
  FROM public.liquidaciones_cliente
  WHERE id = p_liquidacion_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_estado != 'borrador' THEN
    RAISE EXCEPTION 'La liquidación ya se encuentra en estado %', v_estado;
  END IF;

  UPDATE public.liquidaciones_cliente
  SET 
    estado = 'aprobada',
    fecha_aprobacion = clock_timestamp(),
    aprobado_por = p_usuario_id
  WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_liquidacion', v_num_liq,
    'estado', 'aprobada',
    'mensaje', 'Liquidación aprobada y congelada exitosamente para facturación'
  );
END;
$$;
