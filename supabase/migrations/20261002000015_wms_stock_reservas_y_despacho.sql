-- ==============================================================================
-- WMS SSD - MIGRACIÓN: RESERVAS EN PICKING, DESPACHOS Y STOCK FUTURO
-- 1. Permite que los artículos pickeados permanezcan en cantidad_reservada
--    durante todo el ciclo de preparación hasta el despacho definitivo.
-- 2. Incorpora tipo de movimiento 'despacho' en tipo_movimiento_enum.
-- 3. Crea RPC wms_despachar_pedido y wms_despachar_orden_salida para
--    asentar la salida física definitiva en Kardex y liberar la reserva.
-- 4. Soporta el cálculo de Stock Futuro = Entradas - Salidas - Reservados en Pedidos.
-- ==============================================================================

-- 1. Agregar 'despacho' al enum de movimientos si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.tipo_movimiento_enum'::regtype
      AND enumlabel = 'despacho'
  ) THEN
    ALTER TYPE public.tipo_movimiento_enum ADD VALUE 'despacho';
  END IF;
END;
$$;

-- 2. ACTUALIZAR wms_confirmar_picking_con_novedad
-- Los artículos recolectados PERMANECEN en cantidad_reservada hasta el despacho.
-- Solo los faltantes detectados se liberan de vuelta a cantidad_disponible.
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
    -- REGLA DE NEGOCIO WMS:
    -- Lo recolectado (p_cantidad_recolectada) PERMANECE en reserva (cantidad_reservada)
    -- porque el pedido está en proceso y las mercaderías siguen dentro del almacén.
    -- Si hubo faltante (v_faltante > 0), liberamos esa fracción no encontrada
    -- de la reserva de vuelta a cantidad_disponible para que no quede bloqueado inventario fantasma.
    IF v_faltante > 0 THEN
      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_faltante),
          cantidad_disponible = cantidad_disponible + v_faltante,
          actualizado_en = clock_timestamp()
      WHERE id = v_inv.id;
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

  -- 6. Verificar si quedan tareas de picking pendientes para este pedido
  SELECT COUNT(*) INTO v_tareas_pendientes
  FROM public.tareas_picking
  WHERE pedido_id = v_tarea.pedido_id AND estado != 'completada';

  IF v_tareas_pendientes = 0 THEN
    -- Todas las tareas finalizadas -> Pedido pasa a estado 'preparado'
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
    'pedido_id', v_tarea.pedido_id,
    'recolectado', p_cantidad_recolectada,
    'faltante', v_faltante,
    'tareas_pendientes', v_tareas_pendientes,
    'estado_pedido', CASE WHEN v_tareas_pendientes = 0 THEN 'preparado' ELSE 'en_picking' END
  );
END;
$$;


-- 3. RPC: DESPACHAR PEDIDO
-- Deduce definitivamente la cantidad reservada del inventario del cliente
-- y registra el movimiento de SALIDA ('despacho') en movimientos_inventario.
CREATE OR REPLACE FUNCTION public.wms_despachar_pedido(
  p_pedido_id UUID,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_pedido RECORD;
  v_tarea RECORD;
  v_det RECORD;
  v_inv RECORD;
  v_cant_despachar NUMERIC(14,2);
  v_volumen_descontado NUMERIC(14,4);
  v_total_despachado NUMERIC(14,2) := 0;
BEGIN
  -- 1. Obtener y verificar pedido
  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  IF v_pedido.estado = 'despachado' THEN
    RETURN jsonb_build_object(
      'exito', true,
      'mensaje', 'El pedido ya fue despachado previamente',
      'pedido_id', p_pedido_id,
      'numero_pedido', v_pedido.numero_pedido
    );
  END IF;

  -- 2. Recorrer tareas de picking completadas para descontar del inventario
  FOR v_tarea IN
    SELECT t.*, a.volumen_unitario_m3, a.sku
    FROM public.tareas_picking t
    JOIN public.articulos a ON a.id = t.articulo_id
    WHERE t.pedido_id = p_pedido_id
      AND t.cantidad_recolectada > 0
  LOOP
    v_cant_despachar := v_tarea.cantidad_recolectada;
    v_volumen_descontado := ROUND(v_cant_despachar * COALESCE(v_tarea.volumen_unitario_m3, 0.001), 4);

    -- Localizar el inventario reservado
    SELECT * INTO v_inv
    FROM public.inventario
    WHERE cliente_id = v_pedido.cliente_id
      AND articulo_id = v_tarea.articulo_id
      AND ubicacion_id = v_tarea.ubicacion_origen_id
      AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
      AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
    FOR UPDATE;

    IF FOUND THEN
      -- Descontar de la reserva
      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_cant_despachar),
          volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_descontado),
          actualizado_en = clock_timestamp()
      WHERE id = v_inv.id;

      -- Limpiar registro si quedó en 0 disponible y 0 reservado
      DELETE FROM public.inventario
      WHERE id = v_inv.id
        AND cantidad_disponible <= 0.001
        AND cantidad_reservada <= 0.001;
    ELSE
      -- Fallback: Descontar de cualquier registro reservado del mismo artículo y cliente
      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_cant_despachar),
          volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_descontado),
          actualizado_en = clock_timestamp()
      WHERE id = (
        SELECT id FROM public.inventario
        WHERE cliente_id = v_pedido.cliente_id
          AND articulo_id = v_tarea.articulo_id
          AND cantidad_reservada >= v_cant_despachar
        LIMIT 1
      );

      DELETE FROM public.inventario
      WHERE cliente_id = v_pedido.cliente_id
        AND articulo_id = v_tarea.articulo_id
        AND cantidad_disponible <= 0.001
        AND cantidad_reservada <= 0.001;
    END IF;

    -- Asentar movimiento de SALIDA definitiva en Kardex
    INSERT INTO public.movimientos_inventario (
      cliente_id, lote_id, articulo_id, pallet_id,
      ubicacion_origen_id, ubicacion_destino_id,
      tipo_movimiento, cantidad, volumen_m3,
      documento_referencia, usuario_id, notas
    ) VALUES (
      v_pedido.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_tarea.pallet_origen_id,
      v_tarea.ubicacion_origen_id, NULL,
      'despacho'::public.tipo_movimiento_enum, v_cant_despachar, v_volumen_descontado,
      'DESPACHO-' || v_pedido.numero_pedido, COALESCE(p_usuario_id, (SELECT auth.uid())),
      'Salida por despacho de pedido ' || v_pedido.numero_pedido || ' (SKU: ' || v_tarea.sku || ')'
    );

    v_total_despachado := v_total_despachado + v_cant_despachar;
  END LOOP;

  -- 3. Si no existían tareas de picking registradas, despachar por pedidos_detalle
  IF v_total_despachado = 0 THEN
    FOR v_det IN
      SELECT pd.*, a.volumen_unitario_m3, a.sku
      FROM public.pedidos_detalle pd
      JOIN public.articulos a ON a.id = pd.articulo_id
      WHERE pd.pedido_id = p_pedido_id
        AND (pd.cantidad_separada > 0 OR pd.cantidad_reservada > 0)
    LOOP
      v_cant_despachar := GREATEST(pd.cantidad_separada, pd.cantidad_reservada);
      v_volumen_descontado := ROUND(v_cant_despachar * COALESCE(v_det.volumen_unitario_m3, 0.001), 4);

      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_cant_despachar),
          volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_descontado),
          actualizado_en = clock_timestamp()
      WHERE id = (
        SELECT id FROM public.inventario
        WHERE cliente_id = v_pedido.cliente_id
          AND articulo_id = v_det.articulo_id
        ORDER BY cantidad_reservada DESC
        LIMIT 1
      );

      DELETE FROM public.inventario
      WHERE cliente_id = v_pedido.cliente_id
        AND articulo_id = v_det.articulo_id
        AND cantidad_disponible <= 0.001
        AND cantidad_reservada <= 0.001;

      INSERT INTO public.movimientos_inventario (
        cliente_id, lote_id, articulo_id, pallet_id,
        ubicacion_origen_id, ubicacion_destino_id,
        tipo_movimiento, cantidad, volumen_m3,
        documento_referencia, usuario_id, notas
      ) VALUES (
        v_pedido.cliente_id, NULL, v_det.articulo_id, NULL,
        NULL, NULL,
        'despacho'::public.tipo_movimiento_enum, v_cant_despachar, v_volumen_descontado,
        'DESPACHO-' || v_pedido.numero_pedido, COALESCE(p_usuario_id, (SELECT auth.uid())),
        'Salida por despacho directo de pedido ' || v_pedido.numero_pedido
      );

      v_total_despachado := v_total_despachado + v_cant_despachar;
    END LOOP;
  END IF;

  -- 4. Actualizar estado del pedido a 'despachado'
  UPDATE public.pedidos
  SET estado = 'despachado',
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  -- 5. Actualizar remito de tránsito si existe a 'en_transito'
  UPDATE public.remitos_transito
  SET estado = 'en_transito',
      actualizado_en = clock_timestamp()
  WHERE pedido_id = p_pedido_id
    AND estado != 'anulado';

  RETURN jsonb_build_object(
    'exito', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'total_despachado', v_total_despachado,
    'nuevo_estado', 'despachado'
  );
END;
$$;


-- 4. RPC: DESPACHAR ORDEN DE SALIDA / RUTA COMPLETA
CREATE OR REPLACE FUNCTION public.wms_despachar_orden_salida(
  p_orden_salida_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ped RECORD;
  v_count INT := 0;
BEGIN
  FOR v_ped IN
    SELECT pedido_id FROM public.ordenes_salida_pedidos WHERE orden_salida_id = p_orden_salida_id
  LOOP
    PERFORM public.wms_despachar_pedido(v_ped.pedido_id);
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.ordenes_salida
  SET estado = 'despachada',
      actualizado_en = clock_timestamp()
  WHERE id = p_orden_salida_id;

  RETURN jsonb_build_object(
    'exito', true,
    'orden_salida_id', p_orden_salida_id,
    'pedidos_despachados', v_count
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.wms_confirmar_picking_con_novedad(UUID, NUMERIC, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_despachar_pedido(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_despachar_orden_salida(UUID) TO authenticated, anon, service_role;
