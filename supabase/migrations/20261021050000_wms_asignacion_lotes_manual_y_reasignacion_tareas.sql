-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: ASIGNACIÓN DE LOTES MANUALES / HARDCODEADOS Y REASIGNACIÓN DE TAREAS
-- Motor: PostgreSQL 17 / Supabase
-- Archivo: 20261021050000_wms_asignacion_lotes_manual_y_reasignacion_tareas.sql
-- ==============================================================================
-- 1. Actualizar wms_asignar_picking_fefo para admitir asignaciones manuales / hardcodeadas de lote
--    junto con la estrategia global FEFO / FIFO para el saldo.
-- 2. Crear RPC wms_reasignar_tarea_picking para cambiar lote, posición y cantidad desde la tarea.
-- 3. Crear RPC wms_crear_tarea_picking_manual para añadir tareas dirigidas con lote específico.
-- 4. Crear RPC wms_cancelar_tarea_picking para liberar reserva de stock si se descarta una tarea.
-- ==============================================================================

ALTER TABLE public.tareas_picking 
  ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT now();

-- ==============================================================================
-- 1. RPC: wms_asignar_picking_fefo con soporte de lote hardcodeado por renglón
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_asignar_picking_fefo(
  p_pedido_id UUID,
  p_estrategia TEXT,
  p_asignaciones_manuales JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_det RECORD;
  v_inv RECORD;
  v_art RECORD;
  v_lote RECORD;
  v_ubic RECORD;
  v_m RECORD;
  v_pendiente NUMERIC(12,2);
  v_tomar NUMERIC(12,2);
  v_tareas_creadas INT := 0;
  v_total_reservado NUMERIC(12,2) := 0;
  v_total_solicitado NUMERIC(12,2) := 0;
  v_total_faltante NUMERIC(12,2) := 0;
  v_estrategia_norm TEXT := UPPER(COALESCE(p_estrategia, 'FEFO'));
  v_manual_cant NUMERIC(12,2);
  v_det_id UUID;
  v_art_id UUID;
  v_lote_id UUID;
  v_ubic_id UUID;
BEGIN
  -- 1. Verificar pedido
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  IF v_pedido.estado::text NOT IN ('ingresado', 'asignado_picking') THEN
    RAISE EXCEPTION 'El pedido % no puede ser asignado en su estado actual (%)', v_pedido.numero_pedido, v_pedido.estado;
  END IF;

  -- 2. Procesar primero asignaciones manuales hardcodeadas si fueron provistas
  IF p_asignaciones_manuales IS NOT NULL AND jsonb_typeof(p_asignaciones_manuales) = 'array' AND jsonb_array_length(p_asignaciones_manuales) > 0 THEN
    FOR v_m IN SELECT * FROM jsonb_to_recordset(p_asignaciones_manuales) AS x(
      pedido_detalle_id UUID,
      articulo_id UUID,
      lote_id UUID,
      ubicacion_id UUID,
      pallet_id UUID,
      cantidad NUMERIC
    )
    LOOP
      v_det_id := v_m.pedido_detalle_id;
      v_art_id := v_m.articulo_id;
      v_lote_id := v_m.lote_id;
      v_ubic_id := v_m.ubicacion_id;
      v_manual_cant := COALESCE(v_m.cantidad, 0.00);

      IF v_manual_cant > 0 AND v_art_id IS NOT NULL AND v_ubic_id IS NOT NULL THEN
        SELECT * INTO v_art FROM public.articulos WHERE id = v_art_id;
        SELECT * INTO v_lote FROM public.lotes_cliente WHERE id = v_lote_id;
        SELECT * INTO v_ubic FROM public.ubicaciones WHERE id = v_ubic_id;

        -- Buscar inventario disponible en esa ubicación y lote
        SELECT 
          i.id AS inv_id,
          i.ubicacion_id,
          i.pallet_id,
          i.lote_id,
          i.cantidad_disponible,
          l.numero_lote,
          u.codigo_etiqueta AS codigo_ubicacion
        INTO v_inv
        FROM public.inventario i
        LEFT JOIN public.lotes_cliente l ON l.id = i.lote_id
        JOIN public.ubicaciones u ON u.id = i.ubicacion_id
        WHERE i.cliente_id = v_pedido.cliente_id
          AND i.articulo_id = v_art_id
          AND i.ubicacion_id = v_ubic_id
          AND (v_lote_id IS NULL OR i.lote_id = v_lote_id)
          AND (v_m.pallet_id IS NULL OR i.pallet_id = v_m.pallet_id)
          AND i.cantidad_disponible > 0
        ORDER BY i.cantidad_disponible DESC
        LIMIT 1
        FOR UPDATE OF i;

        IF FOUND THEN
          v_tomar := LEAST(v_manual_cant, v_inv.cantidad_disponible);

          -- Reservar inventario
          UPDATE public.inventario
          SET cantidad_disponible = cantidad_disponible - v_tomar,
              cantidad_reservada = cantidad_reservada + v_tomar,
              actualizado_en = clock_timestamp()
          WHERE id = v_inv.inv_id;

          -- Crear tarea con el lote hardcodeado
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
            v_det_id,
            v_art_id,
            COALESCE(v_lote_id, v_inv.lote_id),
            v_inv.pallet_id,
            v_ubic_id,
            v_tomar,
            0.00,
            'Extraer ' || v_tomar::text || ' un. de ' || COALESCE(v_art.nombre, 'Artículo') || ' (Lote Hardcodeado: ' || COALESCE(v_inv.numero_lote, v_lote.numero_lote, 'S/L') || ') en Pos: ' || v_inv.codigo_ubicacion,
            'pendiente'
          );

          -- Actualizar pedidos_detalle
          UPDATE public.pedidos_detalle
          SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + v_tomar,
              lote_id = COALESCE(v_lote_id, v_inv.lote_id),
              ubicacion_id = v_ubic_id
          WHERE id = v_det_id;

          v_total_reservado := v_total_reservado + v_tomar;
          v_tareas_creadas := v_tareas_creadas + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Recorrer renglones del pedido para completar saldo restante mediante FEFO / FIFO
  FOR v_det IN 
    SELECT pd.*, a.sku, a.nombre, a.unidades_por_bulto, a.volumen_unitario_m3
    FROM public.pedidos_detalle pd
    JOIN public.articulos a ON a.id = pd.articulo_id
    WHERE pd.pedido_id = p_pedido_id
  LOOP
    v_total_solicitado := v_total_solicitado + v_det.cantidad_solicitada;
    v_pendiente := v_det.cantidad_solicitada - COALESCE(v_det.cantidad_reservada, 0);

    IF v_pendiente > 0 THEN
      -- Buscar existencias disponibles en inventario respetando estrategia FEFO/FIFO
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
          -- Regla de rotación (FEFO / FIFO)
          CASE WHEN v_estrategia_norm = 'FIFO' THEN 0 ELSE 1 END ASC,
          CASE WHEN v_estrategia_norm != 'FIFO' THEN l.fecha_vencimiento END ASC NULLS LAST,
          i.creado_en ASC,
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

        -- Crear tarea de picking dirigida con lote y ubicación
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
        SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + v_tomar,
            lote_id = COALESCE(lote_id, v_inv.lote_id),
            ubicacion_id = COALESCE(ubicacion_id, v_inv.ubicacion_id)
        WHERE id = v_det.id;

        v_pendiente := v_pendiente - v_tomar;
        v_total_reservado := v_total_reservado + v_tomar;
        v_tareas_creadas := v_tareas_creadas + 1;
      END LOOP;

      IF v_pendiente > 0 THEN
        v_total_faltante := v_total_faltante + v_pendiente;
      END IF;
    END IF;
  END LOOP;

  -- 4. Actualizar estado del pedido a 'asignado_picking'
  UPDATE public.pedidos
  SET estado = 'asignado_picking'::public.estado_pedido_enum,
      estrategia_alocacion = v_estrategia_norm,
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'estrategia', v_estrategia_norm,
    'tareas_creadas', v_tareas_creadas,
    'total_solicitado', v_total_solicitado,
    'total_reservado', v_total_reservado,
    'total_faltante', v_total_faltante,
    'cobertura_completa', (v_total_faltante = 0)
  );
END;
$$;

-- Overload de compatibilidad de 2 parámetros
CREATE OR REPLACE FUNCTION public.wms_asignar_picking_fefo(
  p_pedido_id UUID,
  p_estrategia TEXT DEFAULT 'FEFO'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.wms_asignar_picking_fefo(p_pedido_id, p_estrategia, '[]'::JSONB);
END;
$$;

-- Overload de compatibilidad de 1 parámetro
CREATE OR REPLACE FUNCTION public.wms_asignar_picking_fefo(p_pedido_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.wms_asignar_picking_fefo(p_pedido_id, 'FEFO', '[]'::JSONB);
END;
$$;

-- ==============================================================================
-- 2. RPC: wms_reasignar_tarea_picking (Modificar Lote, Posición y Cantidad de una Tarea)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_reasignar_tarea_picking(
  p_tarea_picking_id UUID,
  p_nuevo_lote_id UUID,
  p_nueva_ubicacion_id UUID,
  p_nueva_cantidad NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tarea RECORD;
  v_pedido RECORD;
  v_art RECORD;
  v_old_inv RECORD;
  v_new_inv RECORD;
  v_new_lote RECORD;
  v_new_ubic RECORD;
  v_cant NUMERIC(12,2);
  v_diff NUMERIC(12,2);
BEGIN
  -- 1. Buscar la tarea
  SELECT * INTO v_tarea
  FROM public.tareas_picking
  WHERE id = p_tarea_picking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea de picking % no encontrada', p_tarea_picking_id;
  END IF;

  IF v_tarea.estado != 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden reasignar tareas en estado pendiente (estado actual: %)', v_tarea.estado;
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = v_tarea.pedido_id;
  SELECT * INTO v_art FROM public.articulos WHERE id = v_tarea.articulo_id;
  SELECT * INTO v_new_lote FROM public.lotes_cliente WHERE id = p_nuevo_lote_id;
  SELECT * INTO v_new_ubic FROM public.ubicaciones WHERE id = p_nueva_ubicacion_id;

  v_cant := COALESCE(p_nueva_cantidad, v_tarea.cantidad_a_recolectar);
  IF v_cant <= 0 THEN
    RAISE EXCEPTION 'La cantidad a recolectar debe ser mayor a 0';
  END IF;

  -- 2. Liberar reserva previa en inventario anterior
  SELECT * INTO v_old_inv
  FROM public.inventario
  WHERE articulo_id = v_tarea.articulo_id
    AND ubicacion_id = v_tarea.ubicacion_origen_id
    AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
    AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.inventario
    SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_tarea.cantidad_a_recolectar),
        cantidad_disponible = cantidad_disponible + v_tarea.cantidad_a_recolectar,
        actualizado_en = clock_timestamp()
    WHERE id = v_old_inv.id;
  END IF;

  -- 3. Reservar en nuevo inventario
  SELECT * INTO v_new_inv
  FROM public.inventario
  WHERE cliente_id = v_pedido.cliente_id
    AND articulo_id = v_tarea.articulo_id
    AND ubicacion_id = p_nueva_ubicacion_id
    AND (lote_id IS NOT DISTINCT FROM p_nuevo_lote_id)
    AND cantidad_disponible >= v_cant
  ORDER BY cantidad_disponible DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Rollback de la liberación si no hay suficiente stock en la nueva ubicación/lote
    IF FOUND IN (SELECT 1 FROM public.inventario WHERE id = v_old_inv.id) THEN
      UPDATE public.inventario
      SET cantidad_reservada = cantidad_reservada + v_tarea.cantidad_a_recolectar,
          cantidad_disponible = GREATEST(0.00, cantidad_disponible - v_tarea.cantidad_a_recolectar)
      WHERE id = v_old_inv.id;
    END IF;
    RAISE EXCEPTION 'Stock insuficiente en la ubicación/lote destino seleccionado (se requieren % un.)', v_cant;
  END IF;

  UPDATE public.inventario
  SET cantidad_disponible = cantidad_disponible - v_cant,
      cantidad_reservada = cantidad_reservada + v_cant,
      actualizado_en = clock_timestamp()
  WHERE id = v_new_inv.id;

  -- 4. Actualizar la tarea
  UPDATE public.tareas_picking
  SET lote_id = p_nuevo_lote_id,
      ubicacion_origen_id = p_nueva_ubicacion_id,
      pallet_origen_id = v_new_inv.pallet_id,
      cantidad_a_recolectar = v_cant,
      observaciones_picking = 'Extraer ' || v_cant::text || ' un. de ' || v_art.nombre || ' (Lote reasignado: ' || COALESCE(v_new_lote.numero_lote, 'S/L') || ') en Pos: ' || v_new_ubic.codigo_etiqueta,
      actualizado_en = clock_timestamp()
  WHERE id = p_tarea_picking_id;

  -- 5. Ajustar cantidad_reservada en pedidos_detalle si la cantidad varió
  v_diff := v_cant - v_tarea.cantidad_a_recolectar;
  IF v_diff != 0 THEN
    UPDATE public.pedidos_detalle
    SET cantidad_reservada = GREATEST(0.00, COALESCE(cantidad_reservada, 0) + v_diff),
        lote_id = p_nuevo_lote_id,
        ubicacion_id = p_nueva_ubicacion_id
    WHERE id = v_tarea.pedido_detalle_id;
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'tarea_id', p_tarea_picking_id,
    'nuevo_lote', v_new_lote.numero_lote,
    'nueva_ubicacion', v_new_ubic.codigo_etiqueta,
    'cantidad', v_cant
  );
END;
$$;

-- ==============================================================================
-- 3. RPC: wms_crear_tarea_picking_manual (Agregar tarea para lote hardcodeado)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_crear_tarea_picking_manual(
  p_pedido_id UUID,
  p_pedido_detalle_id UUID,
  p_articulo_id UUID,
  p_lote_id UUID,
  p_ubicacion_id UUID,
  p_cantidad NUMERIC,
  p_pallet_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_det RECORD;
  v_art RECORD;
  v_lote RECORD;
  v_ubic RECORD;
  v_inv RECORD;
  v_tarea_id UUID;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad a reservar debe ser mayor a 0';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado', p_pedido_id;
  END IF;

  SELECT * INTO v_det FROM public.pedidos_detalle WHERE id = p_pedido_detalle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Renglón del pedido % no encontrado', p_pedido_detalle_id;
  END IF;

  SELECT * INTO v_art FROM public.articulos WHERE id = p_articulo_id;
  SELECT * INTO v_lote FROM public.lotes_cliente WHERE id = p_lote_id;
  SELECT * INTO v_ubic FROM public.ubicaciones WHERE id = p_ubicacion_id;

  -- Buscar inventario disponible en esa posición y lote
  SELECT * INTO v_inv
  FROM public.inventario
  WHERE cliente_id = v_pedido.cliente_id
    AND articulo_id = p_articulo_id
    AND ubicacion_id = p_ubicacion_id
    AND (lote_id IS NOT DISTINCT FROM p_lote_id)
    AND (p_pallet_id IS NULL OR pallet_id = p_pallet_id)
    AND cantidad_disponible >= p_cantidad
  ORDER BY cantidad_disponible DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock insuficiente en la posición % para el lote % (se requieren % un.)',
      COALESCE(v_ubic.codigo_etiqueta, 'N/A'),
      COALESCE(v_lote.numero_lote, 'S/L'),
      p_cantidad;
  END IF;

  -- Reservar en inventario
  UPDATE public.inventario
  SET cantidad_disponible = cantidad_disponible - p_cantidad,
      cantidad_reservada = cantidad_reservada + p_cantidad,
      actualizado_en = clock_timestamp()
  WHERE id = v_inv.id;

  -- Crear tarea
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
    p_pedido_detalle_id,
    p_articulo_id,
    p_lote_id,
    v_inv.pallet_id,
    p_ubicacion_id,
    p_cantidad,
    0.00,
    'Extraer ' || p_cantidad::text || ' un. de ' || v_art.nombre || ' (LOTE MANUAL HARDCODEADO: ' || COALESCE(v_lote.numero_lote, 'S/L') || ') en Pos: ' || v_ubic.codigo_etiqueta,
    'pendiente'
  ) RETURNING id INTO v_tarea_id;

  -- Actualizar pedidos_detalle
  UPDATE public.pedidos_detalle
  SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + p_cantidad,
      lote_id = COALESCE(lote_id, p_lote_id),
      ubicacion_id = COALESCE(ubicacion_id, p_ubicacion_id)
  WHERE id = p_pedido_detalle_id;

  -- Si el pedido estaba en 'ingresado', pasarlo a 'asignado_picking'
  IF v_pedido.estado = 'ingresado' THEN
    UPDATE public.pedidos
    SET estado = 'asignado_picking'::public.estado_pedido_enum,
        actualizado_en = clock_timestamp()
    WHERE id = p_pedido_id;
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'tarea_id', v_tarea_id,
    'cantidad_reservada', p_cantidad
  );
END;
$$;

-- ==============================================================================
-- 4. RPC: wms_cancelar_tarea_picking (Liberar reserva y cancelar tarea)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_cancelar_tarea_picking(
  p_tarea_picking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tarea RECORD;
  v_inv RECORD;
BEGIN
  SELECT * INTO v_tarea
  FROM public.tareas_picking
  WHERE id = p_tarea_picking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea % no encontrada', p_tarea_picking_id;
  END IF;

  IF v_tarea.estado != 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar tareas en estado pendiente (estado actual: %)', v_tarea.estado;
  END IF;

  -- Liberar reserva en inventario
  SELECT * INTO v_inv
  FROM public.inventario
  WHERE articulo_id = v_tarea.articulo_id
    AND ubicacion_id = v_tarea.ubicacion_origen_id
    AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
    AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.inventario
    SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_tarea.cantidad_a_recolectar),
        cantidad_disponible = cantidad_disponible + v_tarea.cantidad_a_recolectar,
        actualizado_en = clock_timestamp()
    WHERE id = v_inv.id;
  END IF;

  -- Descontar reserva en pedidos_detalle
  UPDATE public.pedidos_detalle
  SET cantidad_reservada = GREATEST(0.00, COALESCE(cantidad_reservada, 0) - v_tarea.cantidad_a_recolectar)
  WHERE id = v_tarea.pedido_detalle_id;

  -- Eliminar la tarea cancelada
  DELETE FROM public.tareas_picking WHERE id = p_tarea_picking_id;

  RETURN jsonb_build_object('exito', true, 'mensaje', 'Tarea cancelada y stock liberado exitosamente');
END;
$$;

-- ==============================================================================
-- 5. RPC: wms_deshacer_asignacion_picking (Borrar asignaciones y volver a ingresar desde 0)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wms_deshacer_asignacion_picking(
  p_pedido_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_tarea RECORD;
  v_inv RECORD;
  v_tareas_canceladas INT := 0;
  v_total_liberado NUMERIC(12,2) := 0;
BEGIN
  -- 1. Verificar pedido
  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado', p_pedido_id;
  END IF;

  IF v_pedido.estado IN ('despachado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede deshacer la asignación de un pedido en estado %', v_pedido.estado;
  END IF;

  -- 2. Recorrer tareas_picking y liberar reservas en inventario
  FOR v_tarea IN
    SELECT *
    FROM public.tareas_picking
    WHERE pedido_id = p_pedido_id
      AND estado != 'cancelada'
    FOR UPDATE
  LOOP
    SELECT * INTO v_inv
    FROM public.inventario
    WHERE articulo_id = v_tarea.articulo_id
      AND ubicacion_id = v_tarea.ubicacion_origen_id
      AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
      AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_tarea.cantidad_a_recolectar),
          cantidad_disponible = cantidad_disponible + v_tarea.cantidad_a_recolectar,
          actualizado_en = clock_timestamp()
      WHERE id = v_inv.id;
    END IF;

    v_total_liberado := v_total_liberado + v_tarea.cantidad_a_recolectar;
    v_tareas_canceladas := v_tareas_canceladas + 1;
  END LOOP;

  -- 3. Eliminar todas las tareas del pedido
  DELETE FROM public.tareas_picking
  WHERE pedido_id = p_pedido_id;

  -- 4. Resetear pedidos_detalle
  UPDATE public.pedidos_detalle
  SET cantidad_reservada = 0.00,
      cantidad_separada = 0.00,
      lote_id = NULL,
      ubicacion_id = NULL
  WHERE pedido_id = p_pedido_id;

  -- 5. Cambiar estado a 'ingresado'
  UPDATE public.pedidos
  SET estado = 'ingresado'::public.estado_pedido_enum,
      estrategia_alocacion = NULL,
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'tareas_canceladas', v_tareas_canceladas,
    'total_unidades_liberadas', v_total_liberado,
    'nuevo_estado', 'ingresado'
  );
END;
$$;

-- ==============================================================================
-- Permisos
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID, TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_reasignar_tarea_picking(UUID, UUID, UUID, NUMERIC) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_crear_tarea_picking_manual(UUID, UUID, UUID, UUID, UUID, NUMERIC, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_cancelar_tarea_picking(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_deshacer_asignacion_picking(UUID) TO authenticated, anon, service_role;
