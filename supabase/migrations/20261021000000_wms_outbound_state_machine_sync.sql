-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: SINCRONIZACIÓN DE MÁQUINA DE ESTADOS Y ÓRDENES DE SALIDA
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================
-- 1. Agrega columnas extendidas a rutas_paradas_itinerario y rutas_entrega si no existen.
-- 2. Habilita políticas RLS universales (anon, authenticated) para el ciclo de Outbound.
-- 3. Actualiza wms_despachar_pedido como SECURITY DEFINER y corrige estado de remito
--    a 'entregado_conforme' (en vez de 'en_transito').
-- 4. Asegura que wms_emitir_remito_rx resuelva automáticamente el orden_salida_id
--    si no se pasa explícitamente, y pasa la orden de salida a 'remitida' al completarse.
-- 5. Corrige wms_despachar_orden_salida usando el enum válido 'cerrada'::estado_orden_salida_enum.
-- 6. Extiende wms_registrar_entrega_parada como SECURITY DEFINER con resolución inteligente
--    de pedido_id y remito_id, ejecutando despacho formal, actualizando remito a 'entregado_conforme',
--    y cerrando orden de salida si no quedan paradas pendientes.
-- 7. Regulariza datos históricos: asocia orden_salida_id en remitos huérfanos y
--    sincroniza pedidos y remitos ya entregados a 'despachado' y 'entregado_conforme'.
-- ==============================================================================

-- 1. AÑADIR COLUMNAS A RUTAS Y PARADAS SI NO EXISTEN
ALTER TABLE IF EXISTS public.rutas_paradas_itinerario 
  ADD COLUMN IF NOT EXISTS receptor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS receptor_documento TEXT,
  ADD COLUMN IF NOT EXISTS firma_digital TEXT,
  ADD COLUMN IF NOT EXISTS motivo_novedad TEXT,
  ADD COLUMN IF NOT EXISTS foto_remito_url TEXT,
  ADD COLUMN IF NOT EXISTS latitud_entrega NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitud_entrega NUMERIC(10,7);

ALTER TABLE IF EXISTS public.rutas_entrega
  ADD COLUMN IF NOT EXISTS km_estimados NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS km_reales NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS notas_viaje TEXT;


-- 2. POLÍTICAS RLS PERMISIVAS PARA OPERATORIA OUTBOUND (anon + authenticated)
DROP POLICY IF EXISTS pedidos_auth_all ON public.pedidos;
CREATE POLICY pedidos_auth_all ON public.pedidos 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pedidos_det_auth_all ON public.pedidos_detalle;
CREATE POLICY pedidos_det_auth_all ON public.pedidos_detalle 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS remitos_auth_all ON public.remitos_transito;
CREATE POLICY remitos_auth_all ON public.remitos_transito 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS salidas_auth_all ON public.ordenes_salida;
CREATE POLICY salidas_auth_all ON public.ordenes_salida 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS salidas_pedidos_auth_all ON public.ordenes_salida_pedidos;
CREATE POLICY salidas_pedidos_auth_all ON public.ordenes_salida_pedidos 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS rutas_auth_all ON public.rutas_entrega;
CREATE POLICY rutas_auth_all ON public.rutas_entrega 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS paradas_auth_all ON public.rutas_paradas_itinerario;
CREATE POLICY paradas_auth_all ON public.rutas_paradas_itinerario 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventario_auth_all ON public.inventario;
CREATE POLICY inventario_auth_all ON public.inventario 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS movimientos_auth_all ON public.movimientos_inventario;
CREATE POLICY movimientos_auth_all ON public.movimientos_inventario 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- 3. RPC: wms_despachar_pedido (SECURITY DEFINER + ESTADO REMITO 'entregado_conforme')
CREATE OR REPLACE FUNCTION public.wms_despachar_pedido(
  p_pedido_id UUID,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    -- Asegurar que sus remitos estén en entregado_conforme
    UPDATE public.remitos_transito
    SET estado = 'entregado_conforme'::public.estado_remito_enum,
        actualizado_en = clock_timestamp()
    WHERE pedido_id = p_pedido_id
      AND estado != 'anulado';

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
      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_cant_despachar),
          volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_descontado),
          actualizado_en = clock_timestamp()
      WHERE id = v_inv.id;

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
  SET estado = 'despachado'::public.estado_pedido_enum,
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  -- 5. Actualizar remito de tránsito asociado a 'entregado_conforme' (NUNCA resetear a 'en_transito')
  UPDATE public.remitos_transito
  SET estado = 'entregado_conforme'::public.estado_remito_enum,
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

GRANT EXECUTE ON FUNCTION public.wms_despachar_pedido(UUID, UUID) TO authenticated, anon, service_role;


-- 4. ACTUALIZAR RPC: wms_emitir_remito_rx
CREATE OR REPLACE FUNCTION public.wms_emitir_remito_rx(
  p_pedido_id UUID,
  p_numero_remito_rx TEXT,
  p_cae TEXT DEFAULT NULL,
  p_orden_salida_id UUID DEFAULT NULL,
  p_valor_declarado_total NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_remito_id UUID;
  v_total_bultos INT := 0;
  v_total_pallets INT := 0;
  v_peso_total NUMERIC(12,3) := 0.000;
  v_volumen_total NUMERIC(14,4) := 0.0000;
  v_valor_declarado_total NUMERIC(14,2) := 0.00;
  v_res_orden_salida_id UUID := p_orden_salida_id;
  v_pedidos_sin_remito INT := 0;
BEGIN
  -- 1. Obtener pedido
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado', p_pedido_id;
  END IF;

  -- 2. Resolver orden_salida_id si vino nulo
  IF v_res_orden_salida_id IS NULL THEN
    SELECT orden_salida_id INTO v_res_orden_salida_id
    FROM public.ordenes_salida_pedidos
    WHERE pedido_id = p_pedido_id
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  IF v_res_orden_salida_id IS NULL THEN
    SELECT r.orden_salida_id INTO v_res_orden_salida_id
    FROM public.rutas_paradas_itinerario rpi
    JOIN public.rutas_entrega r ON r.id = rpi.ruta_id
    WHERE rpi.pedido_id = p_pedido_id AND r.orden_salida_id IS NOT NULL
    LIMIT 1;
  END IF;

  -- 3. Calcular totales desde pedidos_detalle y articulos
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

  -- 4. Si se pasó un valor declarado total explícito (editado por el usuario), usarlo
  IF p_valor_declarado_total IS NOT NULL AND p_valor_declarado_total >= 0 THEN
    v_valor_declarado_total := p_valor_declarado_total;
  END IF;

  -- 5. Calcular cantidad de pallets de salida registrados
  SELECT COUNT(*) INTO v_total_pallets
  FROM public.paletizado_despacho
  WHERE pedido_id = p_pedido_id;

  IF v_total_pallets = 0 THEN
    v_total_pallets := 1;
  END IF;

  -- 6. Insertar Remito Rx de Tránsito
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
    v_res_orden_salida_id,
    'emitido'::public.estado_remito_enum
  ) RETURNING id INTO v_remito_id;

  -- 7. Preservar estado del pedido como 'agrupado_salida' si ya tiene orden o ruta, o 'preparado'
  UPDATE public.pedidos
  SET estado = CASE 
        WHEN v_res_orden_salida_id IS NOT NULL OR estado::text = 'agrupado_salida' 
          THEN 'agrupado_salida'::public.estado_pedido_enum 
        ELSE 'preparado'::public.estado_pedido_enum 
      END,
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  -- 8. Vincular automáticamente con cualquier parada de itinerario existente
  UPDATE public.rutas_paradas_itinerario
  SET remito_id = v_remito_id
  WHERE pedido_id = p_pedido_id;

  -- 9. Sincronizar estado de la Orden de Salida si existe y está en etapas tempranas
  IF v_res_orden_salida_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pedidos_sin_remito
    FROM public.ordenes_salida_pedidos osp
    WHERE osp.orden_salida_id = v_res_orden_salida_id
      AND NOT EXISTS (
        SELECT 1 FROM public.remitos_transito rt
        WHERE rt.pedido_id = osp.pedido_id
      );

    IF v_pedidos_sin_remito = 0 THEN
      UPDATE public.ordenes_salida
      SET estado = 'remitida'::public.estado_orden_salida_enum,
          actualizado_en = clock_timestamp()
      WHERE id = v_res_orden_salida_id
        AND estado::text IN ('planificacion', 'consolidando_pallets');
    ELSE
      UPDATE public.ordenes_salida
      SET estado = 'consolidando_pallets'::public.estado_orden_salida_enum,
          actualizado_en = clock_timestamp()
      WHERE id = v_res_orden_salida_id
        AND estado::text = 'planificacion';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'remito_id', v_remito_id,
    'numero_remito_rx', p_numero_remito_rx,
    'orden_salida_id', v_res_orden_salida_id,
    'total_bultos', v_total_bultos,
    'total_pallets', v_total_pallets,
    'peso_total_kg', v_peso_total,
    'volumen_total_m3', v_volumen_total,
    'valor_declarado_total', v_valor_declarado_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO authenticated, anon, service_role;


-- 5. CORREGIR RPC: wms_despachar_orden_salida (Enum válido 'cerrada')
CREATE OR REPLACE FUNCTION public.wms_despachar_orden_salida(
  p_orden_salida_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- Actualizar estado de remitos asociados a 'entregado_conforme'
  UPDATE public.remitos_transito
  SET estado = 'entregado_conforme'::public.estado_remito_enum,
      actualizado_en = clock_timestamp()
  WHERE orden_salida_id = p_orden_salida_id;

  -- Actualizar estado de la orden de salida a 'cerrada'
  UPDATE public.ordenes_salida
  SET estado = 'cerrada'::public.estado_orden_salida_enum,
      actualizado_en = clock_timestamp()
  WHERE id = p_orden_salida_id;

  RETURN jsonb_build_object(
    'exito', true,
    'orden_salida_id', p_orden_salida_id,
    'pedidos_despachados', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_despachar_orden_salida(UUID) TO authenticated, anon, service_role;


-- 6. ACTUALIZAR RPC: wms_registrar_entrega_parada (ROBUSTO Y CON DESPACHO FORMAL)
CREATE OR REPLACE FUNCTION public.wms_registrar_entrega_parada(
  p_parada_id UUID,
  p_estado_entrega TEXT, -- 'entregado' o 'con_novedad'
  p_receptor_nombre TEXT DEFAULT NULL,
  p_receptor_documento TEXT DEFAULT NULL,
  p_firma_digital TEXT DEFAULT NULL,
  p_motivo_novedad TEXT DEFAULT NULL,
  p_foto_remito_url TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parada RECORD;
  v_pedido_id UUID;
  v_remito_id UUID;
  v_orden_salida_id UUID;
  v_pendientes INT;
BEGIN
  SELECT * INTO v_parada FROM public.rutas_paradas_itinerario WHERE id = p_parada_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada de itinerario no encontrada %', p_parada_id;
  END IF;

  v_pedido_id := v_parada.pedido_id;
  v_remito_id := v_parada.remito_id;

  -- Si pedido_id es NULL en la parada pero tiene remito, resolverlo
  IF v_pedido_id IS NULL AND v_remito_id IS NOT NULL THEN
    SELECT pedido_id INTO v_pedido_id FROM public.remitos_transito WHERE id = v_remito_id;
  END IF;

  -- Si remito_id es NULL pero tiene pedido, resolverlo
  IF v_remito_id IS NULL AND v_pedido_id IS NOT NULL THEN
    SELECT id INTO v_remito_id FROM public.remitos_transito WHERE pedido_id = v_pedido_id LIMIT 1;
  END IF;

  -- Actualizar registro de la parada
  UPDATE public.rutas_paradas_itinerario
  SET estado_entrega = p_estado_entrega::public.estado_parada_enum,
      hora_real_arribo = clock_timestamp(),
      receptor_nombre = COALESCE(p_receptor_nombre, receptor_nombre),
      receptor_documento = COALESCE(p_receptor_documento, receptor_documento),
      firma_digital = COALESCE(p_firma_digital, firma_digital),
      foto_remito_url = COALESCE(p_foto_remito_url, foto_remito_url),
      motivo_novedad = COALESCE(p_motivo_novedad, motivo_novedad),
      observaciones = COALESCE(p_observaciones, observaciones),
      pedido_id = COALESCE(pedido_id, v_pedido_id),
      remito_id = COALESCE(remito_id, v_remito_id)
  WHERE id = p_parada_id;

  -- Ejecutar despacho formal de inventario y Kardex
  IF v_pedido_id IS NOT NULL THEN
    BEGIN
      PERFORM public.wms_despachar_pedido(v_pedido_id);
    EXCEPTION WHEN OTHERS THEN
      -- Fallback en caso de que wms_despachar_pedido encuentre alguna anomalía
      UPDATE public.pedidos
      SET estado = 'despachado'::public.estado_pedido_enum,
          actualizado_en = clock_timestamp()
      WHERE id = v_pedido_id;
    END;

    -- Asentar observación si hubo novedad
    IF p_estado_entrega = 'con_novedad' THEN
      UPDATE public.pedidos
      SET observaciones = COALESCE(observaciones || ' | ', '') || 'Desvío en entrega: ' || COALESCE(p_motivo_novedad, 'Novedad asentada en reparto'),
          actualizado_en = clock_timestamp()
      WHERE id = v_pedido_id;
    END IF;

    -- Actualizar el estado del remito asociado a entregado_conforme o rechazado_parcial
    UPDATE public.remitos_transito
    SET estado = CASE 
          WHEN p_estado_entrega = 'entregado' THEN 'entregado_conforme'::public.estado_remito_enum
          ELSE 'rechazado_parcial'::public.estado_remito_enum
        END,
        actualizado_en = clock_timestamp()
    WHERE id = v_remito_id OR pedido_id = v_pedido_id;
  END IF;

  -- Obtener orden_salida_id vinculada a la ruta
  SELECT orden_salida_id INTO v_orden_salida_id
  FROM public.rutas_entrega
  WHERE id = v_parada.ruta_id;

  -- Verificar si quedan paradas pendientes en la ruta
  SELECT COUNT(*) INTO v_pendientes
  FROM public.rutas_paradas_itinerario
  WHERE ruta_id = v_parada.ruta_id AND estado_entrega = 'pendiente';

  -- Si no quedan paradas pendientes, finalizar el viaje y cerrar la orden de salida
  IF v_pendientes = 0 THEN
    UPDATE public.rutas_entrega
    SET estado = 'itinerario_cumplido'::public.estado_ruta_enum
    WHERE id = v_parada.ruta_id;

    IF v_orden_salida_id IS NOT NULL THEN
      UPDATE public.ordenes_salida
      SET estado = 'cerrada'::public.estado_orden_salida_enum,
          actualizado_en = clock_timestamp()
      WHERE id = v_orden_salida_id;
    END IF;
  ELSE
    -- Asegurar que la ruta esté en viaje
    UPDATE public.rutas_entrega
    SET estado = 'en_viaje'::public.estado_ruta_enum,
        fecha_hora_salida_real = COALESCE(fecha_hora_salida_real, clock_timestamp())
    WHERE id = v_parada.ruta_id AND estado::text = 'programada';

    IF v_orden_salida_id IS NOT NULL THEN
      UPDATE public.ordenes_salida
      SET estado = 'en_transito'::public.estado_orden_salida_enum,
          actualizado_en = clock_timestamp()
      WHERE id = v_orden_salida_id
        AND estado::text IN ('planificacion', 'consolidando_pallets', 'remitida', 'cargando');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'parada_id', p_parada_id,
    'pedido_id', v_pedido_id,
    'remito_id', v_remito_id,
    'paradas_pendientes', v_pendientes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_registrar_entrega_parada TO anon, authenticated, service_role;


-- 7. REGULARIZACIÓN Y VINCULACIÓN DE DATOS HISTÓRICOS
-- A. Asociar orden_salida_id a remitos_transito que lo tengan NULL
UPDATE public.remitos_transito rt
SET orden_salida_id = osp.orden_salida_id
FROM public.ordenes_salida_pedidos osp
WHERE rt.pedido_id = osp.pedido_id
  AND rt.orden_salida_id IS NULL;

-- B. Si aún hay remitos huérfanos con paradas en ruta, asociar la orden de salida de la ruta
UPDATE public.remitos_transito rt
SET orden_salida_id = r.orden_salida_id
FROM public.rutas_paradas_itinerario rpi
JOIN public.rutas_entrega r ON r.id = rpi.ruta_id
WHERE (rt.id = rpi.remito_id OR rt.pedido_id = rpi.pedido_id)
  AND rt.orden_salida_id IS NULL
  AND r.orden_salida_id IS NOT NULL;

-- C. Marcar como 'despachado' aquellos pedidos cuyas paradas ya fueron entregadas o con novedad
UPDATE public.pedidos p
SET estado = 'despachado'::public.estado_pedido_enum,
    actualizado_en = clock_timestamp()
FROM public.rutas_paradas_itinerario rpi
WHERE p.id = rpi.pedido_id
  AND rpi.estado_entrega::text IN ('entregado', 'con_novedad')
  AND p.estado::text <> 'despachado';

-- D. Marcar como 'entregado_conforme' los remitos de paradas ya entregadas
UPDATE public.remitos_transito rt
SET estado = 'entregado_conforme'::public.estado_remito_enum,
    actualizado_en = clock_timestamp()
FROM public.rutas_paradas_itinerario rpi
WHERE (rt.id = rpi.remito_id OR rt.pedido_id = rpi.pedido_id)
  AND rpi.estado_entrega::text = 'entregado'
  AND rt.estado::text <> 'entregado_conforme';

-- E. Marcar como 'rechazado_parcial' los remitos de paradas con novedad
UPDATE public.remitos_transito rt
SET estado = 'rechazado_parcial'::public.estado_remito_enum,
    actualizado_en = clock_timestamp()
FROM public.rutas_paradas_itinerario rpi
WHERE (rt.id = rpi.remito_id OR rt.pedido_id = rpi.pedido_id)
  AND rpi.estado_entrega::text = 'con_novedad'
  AND rt.estado::text <> 'rechazado_parcial';

-- F. Marcar como 'agrupado_salida' aquellos pedidos actualmente preparados que ya formen parte de una orden de salida activa
UPDATE public.pedidos p
SET estado = 'agrupado_salida'::public.estado_pedido_enum,
    actualizado_en = clock_timestamp()
FROM public.ordenes_salida_pedidos osp
JOIN public.ordenes_salida os ON os.id = osp.orden_salida_id
WHERE p.id = osp.pedido_id
  AND p.estado::text = 'preparado'
  AND os.estado::text <> 'cerrada';

-- G. Sincronizar remitos y ordenes de salida vinculadas a rutas actualmente en viaje
UPDATE public.remitos_transito rt
SET estado = 'en_transito'::public.estado_remito_enum
FROM public.rutas_entrega r
WHERE r.orden_salida_id = rt.orden_salida_id
  AND r.estado::text = 'en_viaje'
  AND rt.estado::text = 'emitido';

UPDATE public.ordenes_salida os
SET estado = 'en_transito'::public.estado_orden_salida_enum,
    actualizado_en = clock_timestamp()
FROM public.rutas_entrega r
WHERE r.orden_salida_id = os.id
  AND r.estado::text = 'en_viaje'
  AND os.estado::text IN ('planificacion', 'consolidando_pallets', 'remitida', 'cargando');

-- H. Sincronizar ordenes de salida vinculadas a rutas con itinerario cumplido
UPDATE public.ordenes_salida os
SET estado = 'cerrada'::public.estado_orden_salida_enum,
    actualizado_en = clock_timestamp()
FROM public.rutas_entrega r
WHERE r.orden_salida_id = os.id
  AND r.estado::text = 'itinerario_cumplido'
  AND os.estado::text <> 'cerrada';

NOTIFY pgrst, 'reload schema';
