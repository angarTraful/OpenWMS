-- ==============================================================================
-- OPENWMS 3PL - PROCEDIMIENTOS ALMACENADOS / RPCs DE LA API
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. RPC: CONFIRMAR PUTAWAY Y ACTUALIZAR STOCK ATÓMICAMENTE
CREATE OR REPLACE FUNCTION wms_confirmar_putaway(
  p_tarea_id UUID,
  p_cantidad_recibida NUMERIC,
  p_codigo_lpn TEXT DEFAULT NULL,
  p_ubicacion_destino_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tarea RECORD;
  v_articulo RECORD;
  v_pallet_id UUID := NULL;
  v_ubic_dest UUID;
  v_volumen_m3 NUMERIC(14,4);
  v_inv_id UUID;
BEGIN
  -- 1. Obtener datos de la tarea
  SELECT t.*, r.cliente_id, r.almacen_id
  INTO v_tarea
  FROM public.tareas_putaway_control t
  JOIN public.ordenes_recepcion_detalle rd ON rd.id = t.recepcion_detalle_id
  JOIN public.ordenes_recepcion r ON r.id = rd.recepcion_id
  WHERE t.id = p_tarea_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea de putaway con ID % no encontrada', p_tarea_id;
  END IF;

  IF v_tarea.estado = 'almacenado' THEN
    RAISE EXCEPTION 'La tarea % ya fue completada previamente', p_tarea_id;
  END IF;

  -- 2. Obtener datos del artículo para cubicaje
  SELECT * INTO v_articulo FROM public.articulos WHERE id = v_tarea.articulo_id;

  -- 3. Calcular volumen cúbico M3
  v_volumen_m3 := ROUND(p_cantidad_recibida * v_articulo.volumen_unitario_m3, 4);

  -- 4. Resolver ubicación destino
  v_ubic_dest := COALESCE(p_ubicacion_destino_id, v_tarea.ubicacion_destino_id);

  -- 5. Manejo de Pallet LPN si se proporcionó código
  IF p_codigo_lpn IS NOT NULL AND TRIM(p_codigo_lpn) <> '' THEN
    SELECT id INTO v_pallet_id FROM public.pallets_lpn WHERE codigo_lpn = p_codigo_lpn AND cliente_id = v_tarea.cliente_id;
    IF v_pallet_id IS NULL THEN
      INSERT INTO public.pallets_lpn (cliente_id, codigo_lpn, volumen_total_m3, peso_total_kg, estado)
      VALUES (v_tarea.cliente_id, p_codigo_lpn, v_volumen_m3, ROUND(p_cantidad_recibida * v_articulo.peso_unitario_kg, 3), 'en_stock')
      RETURNING id INTO v_pallet_id;
    ELSE
      UPDATE public.pallets_lpn
      SET volumen_total_m3 = volumen_total_m3 + v_volumen_m3,
          peso_total_kg = peso_total_kg + ROUND(p_cantidad_recibida * v_articulo.peso_unitario_kg, 3)
      WHERE id = v_pallet_id;
    END IF;
  ELSE
    v_pallet_id := v_tarea.pallet_id;
  END IF;

  -- 6. Actualizar la tarea de putaway
  UPDATE public.tareas_putaway_control
  SET cantidad_recibida = p_cantidad_recibida,
      volumen_calculado_m3 = v_volumen_m3,
      pallet_id = v_pallet_id,
      ubicacion_destino_id = v_ubic_dest,
      estado = 'almacenado',
      actualizado_en = clock_timestamp()
  WHERE id = p_tarea_id;

  -- 7. Actualizar o insertar en inventario
  SELECT id INTO v_inv_id
  FROM public.inventario
  WHERE cliente_id = v_tarea.cliente_id
    AND lote_id = v_tarea.lote_id
    AND articulo_id = v_tarea.articulo_id
    AND almacen_id = v_tarea.almacen_id
    AND ubicacion_id = v_ubic_dest
    AND (pallet_id IS NOT DISTINCT FROM v_pallet_id);

  IF v_inv_id IS NOT NULL THEN
    UPDATE public.inventario
    SET cantidad_disponible = cantidad_disponible + p_cantidad_recibida,
        volumen_m3 = volumen_m3 + v_volumen_m3,
        actualizado_en = clock_timestamp()
    WHERE id = v_inv_id;
  ELSE
    INSERT INTO public.inventario (
      cliente_id, lote_id, articulo_id, almacen_id, ubicacion_id, pallet_id,
      cantidad_disponible, cantidad_reservada, volumen_m3, unidad_medida
    ) VALUES (
      v_tarea.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_tarea.almacen_id, v_ubic_dest, v_pallet_id,
      p_cantidad_recibida, 0.00, v_volumen_m3, v_articulo.unidad_medida
    ) RETURNING id INTO v_inv_id;
  END IF;

  -- 8. Registrar en Kardex de movimientos
  INSERT INTO public.movimientos_inventario (
    cliente_id, lote_id, articulo_id, pallet_id,
    ubicacion_origen_id, ubicacion_destino_id,
    tipo_movimiento, cantidad, volumen_m3,
    documento_referencia, usuario_id, notas
  ) VALUES (
    v_tarea.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_pallet_id,
    v_tarea.ubicacion_origen_id, v_ubic_dest,
    'putaway', p_cantidad_recibida, v_volumen_m3,
    'PUTAWAY-' || p_tarea_id::text, (SELECT auth.uid()),
    'Ingreso confirmado y almacenado en rack'
  );

  RETURN jsonb_build_object(
    'exito', true,
    'tarea_id', p_tarea_id,
    'inventario_id', v_inv_id,
    'cantidad_almacenada', p_cantidad_recibida,
    'volumen_m3', v_volumen_m3,
    'pallet_id', v_pallet_id,
    'ubicacion_id', v_ubic_dest
  );
END;
$$;

-- 2. RPC: CONFIRMAR PICKING CON DESCUENTO DE STOCK ACID
CREATE OR REPLACE FUNCTION wms_confirmar_picking(
  p_tarea_picking_id UUID,
  p_cantidad_recolectada NUMERIC
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
BEGIN
  -- 1. Obtener la tarea de picking
  SELECT t.*, p.cliente_id, os.almacen_id
  INTO v_tarea
  FROM public.tareas_picking t
  JOIN public.pedidos p ON p.id = t.pedido_id
  LEFT JOIN public.ordenes_salida_pedidos osp ON osp.pedido_id = p.id
  LEFT JOIN public.ordenes_salida os ON os.id = osp.orden_salida_id
  WHERE t.id = p_tarea_picking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea de picking % no encontrada', p_tarea_picking_id;
  END IF;

  IF v_tarea.estado = 'completada' THEN
    RAISE EXCEPTION 'La tarea de picking % ya está completada', p_tarea_picking_id;
  END IF;

  -- 2. Obtener datos del artículo
  SELECT * INTO v_articulo FROM public.articulos WHERE id = v_tarea.articulo_id;
  v_volumen_descontado := ROUND(p_cantidad_recolectada * v_articulo.volumen_unitario_m3, 4);

  -- 3. Localizar y bloquear fila de inventario para consistencia ACID
  SELECT * INTO v_inv
  FROM public.inventario
  WHERE cliente_id = v_tarea.cliente_id
    AND lote_id = v_tarea.lote_id
    AND articulo_id = v_tarea.articulo_id
    AND ubicacion_id = v_tarea.ubicacion_origen_id
    AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
  FOR UPDATE;

  IF NOT FOUND OR v_inv.cantidad_disponible < p_cantidad_recolectada THEN
    RAISE EXCEPTION 'Stock insuficiente en la ubicación para realizar el picking. Disponible: %, Solicitado: %',
      COALESCE(v_inv.cantidad_disponible, 0), p_cantidad_recolectada;
  END IF;

  -- 4. Descontar inventario
  UPDATE public.inventario
  SET cantidad_disponible = cantidad_disponible - p_cantidad_recolectada,
      volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_descontado),
      actualizado_en = clock_timestamp()
  WHERE id = v_inv.id;

  -- Si era un pallet y se redujo, actualizar pallet
  IF v_tarea.pallet_origen_id IS NOT NULL THEN
    UPDATE public.pallets_lpn
    SET volumen_total_m3 = GREATEST(0.0000, volumen_total_m3 - v_volumen_descontado),
        peso_total_kg = GREATEST(0.000, peso_total_kg - ROUND(p_cantidad_recolectada * v_articulo.peso_unitario_kg, 3)),
        estado = CASE WHEN (v_inv.cantidad_disponible - p_cantidad_recolectada) <= 0 THEN 'desarmado'::public.estado_pallet_enum ELSE estado END
    WHERE id = v_tarea.pallet_origen_id;
  END IF;

  -- 5. Actualizar la tarea de picking
  UPDATE public.tareas_picking
  SET cantidad_recolectada = p_cantidad_recolectada,
      estado = 'completada'
  WHERE id = p_tarea_picking_id;

  -- 6. Actualizar el pedido detalle
  UPDATE public.pedidos_detalle
  SET cantidad_separada = cantidad_separada + p_cantidad_recolectada
  WHERE id = v_tarea.pedido_detalle_id;

  -- 7. Registrar en Kardex
  INSERT INTO public.movimientos_inventario (
    cliente_id, lote_id, articulo_id, pallet_id,
    ubicacion_origen_id, ubicacion_destino_id,
    tipo_movimiento, cantidad, volumen_m3,
    documento_referencia, usuario_id, notas
  ) VALUES (
    v_tarea.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_tarea.pallet_origen_id,
    v_tarea.ubicacion_origen_id, NULL,
    'picking', p_cantidad_recolectada, v_volumen_descontado,
    'PICKING-' || p_tarea_picking_id::text, (SELECT auth.uid()),
    'Picking completado para pedido'
  );

  RETURN jsonb_build_object(
    'exito', true,
    'tarea_id', p_tarea_picking_id,
    'cantidad_recolectada', p_cantidad_recolectada,
    'volumen_descontado_m3', v_volumen_descontado,
    'stock_remanente', (v_inv.cantidad_disponible - p_cantidad_recolectada)
  );
END;
$$;

-- Permisos de ejecución para usuarios autenticados
GRANT EXECUTE ON FUNCTION wms_confirmar_putaway(UUID, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION wms_confirmar_picking(UUID, NUMERIC) TO authenticated;
