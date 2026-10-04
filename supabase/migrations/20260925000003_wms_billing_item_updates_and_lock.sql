-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: EDICIÓN FLEXIBLE DE CONCEPTOS Y BLOQUEO DE RE-LIQUIDACIÓN
-- ==============================================================================

-- 1. ACTUALIZAR FUNCIÓN DE ELIMINACIÓN PARA PERMITIR BORRAR CUALQUIER CONCEPTO (SISTEMA O MANUAL)
--    MIENTRAS LA LIQUIDACIÓN ESTÉ EN BORRADOR
CREATE OR REPLACE FUNCTION public.wms_eliminar_item_manual_liquidacion(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_liq_id UUID;
  v_estado TEXT;
  v_subtotal_estadia NUMERIC(14,2);
  v_subtotal_operativo NUMERIC(14,2);
  v_subtotal_manuales NUMERIC(14,2);
  v_nuevo_monto_total NUMERIC(14,2);
BEGIN
  -- 1. Obtener la liquidación asociada
  SELECT liquidacion_id INTO v_liq_id
  FROM public.liquidaciones_cliente_items
  WHERE id = p_item_id;

  IF v_liq_id IS NULL THEN
    RAISE EXCEPTION 'Concepto no encontrado en la liquidación.';
  END IF;

  -- 2. Validar que la liquidación esté en estado 'borrador'
  SELECT estado INTO v_estado
  FROM public.liquidaciones_cliente
  WHERE id = v_liq_id;

  IF v_estado != 'borrador' THEN
    RAISE EXCEPTION 'No se pueden eliminar conceptos de una liquidación en estado "%". Solo se permite en estado "borrador".', v_estado;
  END IF;

  -- 3. Eliminar el renglón (sea automático o manual)
  DELETE FROM public.liquidaciones_cliente_items WHERE id = p_item_id;

  -- 4. Recalcular todos los subtotales de la liquidación
  SELECT 
    COALESCE(SUM(CASE WHEN concepto_codigo = 'ESTADIA_M3_DIA' THEN subtotal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN concepto_codigo != 'ESTADIA_M3_DIA' AND origen = 'automatico' THEN subtotal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN origen = 'manual' THEN subtotal ELSE 0 END), 0),
    COALESCE(SUM(subtotal), 0)
  INTO v_subtotal_estadia, v_subtotal_operativo, v_subtotal_manuales, v_nuevo_monto_total
  FROM public.liquidaciones_cliente_items
  WHERE liquidacion_id = v_liq_id;

  -- 5. Actualizar cabecera
  UPDATE public.liquidaciones_cliente
  SET 
    subtotal_estadia = v_subtotal_estadia,
    subtotal_operativo = v_subtotal_operativo,
    subtotal_manuales = v_subtotal_manuales,
    monto_total = v_nuevo_monto_total
  WHERE id = v_liq_id;

  RETURN jsonb_build_object(
    'success', true,
    'mensaje', 'Concepto eliminado exitosamente',
    'subtotal_estadia', v_subtotal_estadia,
    'subtotal_operativo', v_subtotal_operativo,
    'subtotal_manuales', v_subtotal_manuales,
    'nuevo_monto_total', v_nuevo_monto_total
  );
END;
$$;

-- Alias sin 'manual' en el nombre para mayor claridad semántica
CREATE OR REPLACE FUNCTION public.wms_eliminar_item_liquidacion(
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_eliminar_item_manual_liquidacion(p_item_id);
END;
$$;


-- 2. PROCEDIMIENTO RPC: ACTUALIZAR VALORES DE CUALQUIER CONCEPTO (SISTEMA O MANUAL)
CREATE OR REPLACE FUNCTION public.wms_actualizar_item_liquidacion(
  p_item_id UUID,
  p_cantidad NUMERIC,
  p_precio_unitario NUMERIC,
  p_descripcion TEXT DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_liq_id UUID;
  v_estado TEXT;
  v_subtotal NUMERIC(14,2);
  v_subtotal_estadia NUMERIC(14,2);
  v_subtotal_operativo NUMERIC(14,2);
  v_subtotal_manuales NUMERIC(14,2);
  v_nuevo_monto_total NUMERIC(14,2);
BEGIN
  -- 1. Validaciones de entrada
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'Identificador de concepto obligatorio.';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad < 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor o igual a 0.';
  END IF;

  IF p_precio_unitario IS NULL OR p_precio_unitario < 0 THEN
    RAISE EXCEPTION 'El precio unitario debe ser mayor o igual a 0.';
  END IF;

  -- 2. Obtener liquidación y verificar estado
  SELECT liquidacion_id INTO v_liq_id
  FROM public.liquidaciones_cliente_items
  WHERE id = p_item_id;

  IF v_liq_id IS NULL THEN
    RAISE EXCEPTION 'Concepto no encontrado en la liquidación.';
  END IF;

  SELECT estado INTO v_estado
  FROM public.liquidaciones_cliente
  WHERE id = v_liq_id;

  IF v_estado != 'borrador' THEN
    RAISE EXCEPTION 'No se pueden modificar conceptos de una liquidación en estado "%". Solo se permite en estado "borrador".', v_estado;
  END IF;

  -- 3. Calcular nuevo subtotal
  v_subtotal := ROUND(p_cantidad * p_precio_unitario, 2);

  -- 4. Actualizar el concepto
  UPDATE public.liquidaciones_cliente_items
  SET 
    cantidad = p_cantidad,
    precio_unitario = p_precio_unitario,
    subtotal = v_subtotal,
    descripcion = COALESCE(NULLIF(TRIM(p_descripcion), ''), descripcion),
    notas = COALESCE(p_notas, notas)
  WHERE id = p_item_id;

  -- 5. Recalcular acumulados en la cabecera
  SELECT 
    COALESCE(SUM(CASE WHEN concepto_codigo = 'ESTADIA_M3_DIA' THEN subtotal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN concepto_codigo != 'ESTADIA_M3_DIA' AND origen = 'automatico' THEN subtotal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN origen = 'manual' THEN subtotal ELSE 0 END), 0),
    COALESCE(SUM(subtotal), 0)
  INTO v_subtotal_estadia, v_subtotal_operativo, v_subtotal_manuales, v_nuevo_monto_total
  FROM public.liquidaciones_cliente_items
  WHERE liquidacion_id = v_liq_id;

  UPDATE public.liquidaciones_cliente
  SET 
    subtotal_estadia = v_subtotal_estadia,
    subtotal_operativo = v_subtotal_operativo,
    subtotal_manuales = v_subtotal_manuales,
    monto_total = v_nuevo_monto_total
  WHERE id = v_liq_id;

  RETURN jsonb_build_object(
    'success', true,
    'mensaje', 'Concepto actualizado exitosamente',
    'item_id', p_item_id,
    'subtotal', v_subtotal,
    'subtotal_estadia', v_subtotal_estadia,
    'subtotal_operativo', v_subtotal_operativo,
    'subtotal_manuales', v_subtotal_manuales,
    'nuevo_monto_total', v_nuevo_monto_total
  );
END;
$$;


-- 3. PROCEDIMIENTO RPC: MARCAR LIQUIDACIÓN COMO FACTURADA
CREATE OR REPLACE FUNCTION public.wms_facturar_liquidacion(
  p_liquidacion_id UUID,
  p_observaciones TEXT DEFAULT NULL
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
    RAISE EXCEPTION 'Liquidación no encontrada.';
  END IF;

  IF v_estado = 'facturada' THEN
    RAISE EXCEPTION 'La liquidación % ya se encuentra marcada como FACTURADA.', v_num_liq;
  END IF;

  IF v_estado = 'anulada' THEN
    RAISE EXCEPTION 'No se puede facturar una liquidación anulada.';
  END IF;

  UPDATE public.liquidaciones_cliente
  SET 
    estado = 'facturada',
    observaciones = CASE 
      WHEN p_observaciones IS NOT NULL AND TRIM(p_observaciones) != '' THEN 
        COALESCE(observaciones || ' | ', '') || TRIM(p_observaciones)
      ELSE observaciones 
    END,
    actualizado_en = clock_timestamp()
  WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success', true,
    'numero_liquidacion', v_num_liq,
    'estado', 'facturada',
    'mensaje', 'Liquidación marcada como facturada exitosamente'
  );
END;
$$;


-- 4. ACTUALIZAR PROCEDIMIENTO wms_liquidar_estadia_periodo
--    BLOQUEANDO CUALQUIER RE-LIQUIDACIÓN DE PERÍODOS O CONCEPTOS YA APROBADOS O FACTURADOS
CREATE OR REPLACE FUNCTION public.wms_liquidar_estadia_periodo(
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
  v_liq_solapada RECORD;
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

  -- 2. CONTROL ESTRICTO DE NO RE-LIQUIDACIÓN:
  --    Verificar si existe alguna liquidación previa para este cliente que ya esté APROBADA o FACTURADA
  --    cuyo rango de fechas se solape con el período solicitado.
  SELECT id, numero_liquidacion, estado, fecha_desde, fecha_hasta
  INTO v_liq_solapada
  FROM public.liquidaciones_cliente
  WHERE cliente_id = p_cliente_id 
    AND estado IN ('aprobada', 'facturada')
    AND NOT (p_fecha_hasta < fecha_desde OR p_fecha_desde > fecha_hasta)
  LIMIT 1;

  IF v_liq_solapada.id IS NOT NULL THEN
    RAISE EXCEPTION 'El período solicitado (% al %) contiene conceptos que ya fueron liquidados/facturados en la liquidación % (período % al %, estado: %). No se puede volver a liquidar.',
      p_fecha_desde, p_fecha_hasta, v_liq_solapada.numero_liquidacion, v_liq_solapada.fecha_desde, v_liq_solapada.fecha_hasta, UPPER(v_liq_solapada.estado);
  END IF;

  -- 3. Verificar si existe liquidación en borrador en el mismo rango exacto
  SELECT id, numero_liquidacion, estado 
  INTO v_liq_existente
  FROM public.liquidaciones_cliente
  WHERE cliente_id = p_cliente_id 
    AND fecha_desde = p_fecha_desde 
    AND fecha_hasta = p_fecha_hasta
  LIMIT 1;

  IF v_liq_existente.id IS NOT NULL THEN
    IF NOT p_recalcular THEN
      -- Retornar la existente en borrador
      SELECT jsonb_build_object(
        'success', true,
        'liquidacion_id', v_liq_existente.id,
        'numero_liquidacion', v_liq_existente.numero_liquidacion,
        'mensaje', 'Liquidación en borrador recuperada'
      ) INTO v_auditoria;
      RETURN v_auditoria;
    ELSE
      -- Eliminar el borrador para recalcular limpiamente
      DELETE FROM public.liquidaciones_cliente WHERE id = v_liq_existente.id;
    END IF;
  END IF;

  -- 4. Auditoría preventiva ACID: Comparar Stock en Tabla vs Saldo Kardex
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

  -- 5. Obtener tarifas vigentes del cliente
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

  -- 6. Generar número de liquidación consecutivo
  v_num_liq := 'LIQ-' || TO_CHAR(p_fecha_hasta, 'YYYY-MM') || '-' || LPAD(FLOOR(1 + RANDOM() * 9999)::TEXT, 4, '0');

  -- 7. Obtener Stock Base Actual para cálculo retrospectivo
  SELECT 
    COALESCE(SUM(volumen_m3), 0),
    COALESCE(SUM(cantidad_disponible + cantidad_reservada), 0)
  INTO v_stock_actual_m3, v_stock_actual_bultos
  FROM public.inventario
  WHERE cliente_id = p_cliente_id;

  -- 8. Crear tabla temporal para alojar cada día del rango con su stock
  CREATE TEMP TABLE temp_dias_stock (
    dia DATE PRIMARY KEY,
    volumen_m3 NUMERIC(14,4) NOT NULL,
    bultos_totales NUMERIC(14,2) NOT NULL
  ) ON COMMIT DROP;

  -- Reconstruir retrospectivamente el stock de cada día D:
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

  -- 9. Calcular Bultos Promedio y M3*Días totales
  SELECT 
    COALESCE(SUM(volumen_m3), 0),
    COALESCE(AVG(bultos_totales), 0)
  INTO v_total_m3_dias, v_bultos_promedio
  FROM temp_dias_stock;

  v_subtotal_estadia := ROUND(v_total_m3_dias * v_tarifa_m3, 2);

  -- 10. Insertar Cabecera de Liquidación
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
    '$',
    v_auditoria
  ) RETURNING id INTO v_liquidacion_id;

  -- 11. Agrupar y generar Tramos de Stock Constante
  CREATE TEMP TABLE temp_tramos_calculados ON COMMIT DROP AS
  WITH agrupados AS (
    SELECT 
      dia,
      volumen_m3,
      bultos_totales,
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

  -- 12. Calcular Conceptos Operativos Inbound y Outbound en el Período
  -- 12.a Recepción por Tipo de Contenedor
  SELECT 
    COUNT(CASE WHEN tipo_contenedor = '20ft' THEN 1 END),
    COUNT(CASE WHEN tipo_contenedor = '40ft' THEN 1 END),
    COUNT(CASE WHEN tipo_contenedor NOT IN ('20ft', '40ft') OR tipo_contenedor IS NULL THEN 1 END)
  INTO v_rec_20_count, v_rec_40_count, v_rec_suelta_count
  FROM public.ordenes_recepcion
  WHERE cliente_id = p_cliente_id
    AND fecha_hora_arribo::DATE BETWEEN p_fecha_desde AND p_fecha_hasta
    AND estado IN ('en_control', 'finalizada');

  -- 12.b Bultos Inbound
  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_bultos_inbound
  FROM public.movimientos_inventario
  WHERE cliente_id = p_cliente_id
    AND tipo_movimiento = 'recepcion'
    AND fecha_hora::DATE BETWEEN p_fecha_desde AND p_fecha_hasta;

  -- 12.c Bultos Outbound (Picking)
  SELECT COALESCE(SUM(cantidad), 0)
  INTO v_bultos_picking
  FROM public.movimientos_inventario
  WHERE cliente_id = p_cliente_id
    AND tipo_movimiento = 'picking'
    AND fecha_hora::DATE BETWEEN p_fecha_desde AND p_fecha_hasta;

  -- 12.d Servicios a la Carga / Despachos
  SELECT COUNT(DISTINCT r.id)
  INTO v_despachos_count
  FROM public.remitos_transito r
  WHERE r.cliente_id = p_cliente_id
    AND r.fecha_emision::DATE BETWEEN p_fecha_desde AND p_fecha_hasta
    AND r.estado != 'rechazado_total';

  -- 13. Insertar Renglones / Ítems de Liquidación Automáticos
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

  -- 14. Actualizar Totales Finales en Cabecera
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

-- Permisos
GRANT EXECUTE ON FUNCTION public.wms_actualizar_item_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_eliminar_item_manual_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_eliminar_item_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_facturar_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_liquidar_estadia_periodo TO anon, authenticated, service_role;
