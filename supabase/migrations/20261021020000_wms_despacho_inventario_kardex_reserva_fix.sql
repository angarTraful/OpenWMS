-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: CORRECCIÓN DEFINITIVA DE BAJA DE INVENTARIO EN DESPACHO,
--               UNIFICACIÓN DE REGISTRO EN KARDEX (SIN DUPLICADOS DE RESERVA)
-- Motor: PostgreSQL 17 / Supabase
-- Archivo: 20261021020000_wms_despacho_inventario_kardex_reserva_fix.sql
-- ==============================================================================
-- REGLAS DE NEGOCIO:
-- 1. Durante el ciclo de vida del pedido (ingresado, asignado_picking, en_picking):
--    - En 'inventario' el stock SOLO se reserva (disponible baja, reservado sube).
--    - NO se crea ningún registro separado de "Reserva pedido" en 'movimientos_inventario'.
-- 2. Al confirmar picking:
--    - Se registra el movimiento de preparación ('picking') asociado al pedido_id.
-- 3. Al finalizar / despachar el pedido:
--    - El stock físico se da de baja real del inventario (restando de reservada y disponible).
--    - EN ESE MISMO REGISTRO de movimientos_inventario se actualiza el estado/tipo:
--        * Si fue entrega / flete (modalidad_entrega != 'retiro_deposito') -> 'entregado'
--        * Si fue retiro en puerta (modalidad_entrega == 'retiro_deposito') -> 'despacho'
--    - De esta forma no queda ningún registro fantasma ni duplicado de reserva.
-- ==============================================================================

-- 1. Asegurar enum tipo_movimiento_enum con 'despacho' y 'entregado'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.tipo_movimiento_enum'::regtype 
      AND enumlabel = 'despacho'
  ) THEN
    ALTER TYPE public.tipo_movimiento_enum ADD VALUE 'despacho';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.tipo_movimiento_enum'::regtype 
      AND enumlabel = 'entregado'
  ) THEN
    ALTER TYPE public.tipo_movimiento_enum ADD VALUE 'entregado';
  END IF;
END $$;

-- 2. Asegurar columnas pedido_id y estado en movimientos_inventario
ALTER TABLE public.movimientos_inventario 
  ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_inventario 
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'completado';

-- 3. Limpiar cualquier registro residual previo de 'reserva' para no duplicar asientos
DELETE FROM public.movimientos_inventario 
WHERE tipo_movimiento::text = 'reserva';


-- 4. RPC: wms_asignar_picking_fefo (SOLO RESERVA DE STOCK, SIN INSERTAR EN KARDEX)
CREATE OR REPLACE FUNCTION public.wms_asignar_picking_fefo(
  p_pedido_id UUID,
  p_estrategia TEXT DEFAULT 'FEFO'
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
  v_pendiente NUMERIC(12,2);
  v_tomar NUMERIC(12,2);
  v_tareas_creadas INT := 0;
  v_total_reservado NUMERIC(12,2) := 0;
  v_total_solicitado NUMERIC(12,2) := 0;
  v_total_faltante NUMERIC(12,2) := 0;
  v_estrategia_norm TEXT := UPPER(COALESCE(p_estrategia, 'FEFO'));
BEGIN
  -- 1. Verificar pedido
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  IF v_pedido.estado::text NOT IN ('ingresado', 'asignado_picking') THEN
    RAISE EXCEPTION 'El pedido % no puede ser asignado en su estado actual (%)', v_pedido.numero_pedido, v_pedido.estado;
  END IF;

  -- 2. Recorrer renglones del pedido
  FOR v_det IN 
    SELECT pd.*, a.sku, a.nombre, a.unidades_por_bulto, a.volumen_unitario_m3
    FROM public.pedidos_detalle pd
    JOIN public.articulos a ON a.id = pd.articulo_id
    WHERE pd.pedido_id = p_pedido_id
  LOOP
    v_total_solicitado := v_total_solicitado + v_det.cantidad_solicitada;
    v_pendiente := v_det.cantidad_solicitada - COALESCE(v_det.cantidad_reservada, 0);

    IF v_pendiente > 0 THEN
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

        -- Reservar en inventario (SOLO reserva física interna)
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
        SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + v_tomar
        WHERE id = v_det.id;

        v_pendiente := v_pendiente - v_tomar;
        v_total_reservado := v_total_reservado + v_tomar;
        v_tareas_creadas := v_tareas_creadas + 1;
      END LOOP;

      IF v_pendiente > 0 THEN
        v_total_faltante := v_total_faltante + v_pendiente;
      END IF;
    ELSE
      v_total_reservado := v_total_reservado + COALESCE(v_det.cantidad_reservada, 0);
    END IF;
  END LOOP;

  -- 3. Actualizar estado del pedido a 'asignado_picking'
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


-- 5. RPC: wms_confirmar_picking_con_novedad (REGISTRA ASIENTO EN PREPARACIÓN VINCULADO AL PEDIDO)
CREATE OR REPLACE FUNCTION public.wms_confirmar_picking_con_novedad(
  p_tarea_picking_id UUID,
  p_cantidad_recolectada NUMERIC,
  p_novedad TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tarea RECORD;
  v_inv RECORD;
  v_pedido RECORD;
  v_art RECORD;
  v_faltante NUMERIC(12,2) := 0.00;
  v_volumen_recolectado NUMERIC(14,4) := 0.0000;
  v_tareas_pendientes INT := 0;
  v_mov_id UUID;
BEGIN
  -- 1. Obtener la tarea de picking
  SELECT * INTO v_tarea
  FROM public.tareas_picking
  WHERE id = p_tarea_picking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea de picking % no encontrada', p_tarea_picking_id;
  END IF;

  IF v_tarea.estado = 'completada' THEN
    RAISE EXCEPTION 'La tarea de picking % ya fue completada previamente', p_tarea_picking_id;
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = v_tarea.pedido_id;
  SELECT * INTO v_art FROM public.articulos WHERE id = v_tarea.articulo_id;

  -- 2. Calcular faltante respecto de la reserva asignada
  v_faltante := GREATEST(0.00, v_tarea.cantidad_a_recolectar - p_cantidad_recolectada);
  v_volumen_recolectado := ROUND(p_cantidad_recolectada * COALESCE(v_art.volumen_unitario_m3, 0.001), 4);

  -- 3. Localizar el inventario reservado
  SELECT * INTO v_inv
  FROM public.inventario
  WHERE articulo_id = v_tarea.articulo_id
    AND ubicacion_id = v_tarea.ubicacion_origen_id
    AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
    AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
  FOR UPDATE;

  IF FOUND THEN
    -- Si hubo faltante físico, liberamos esa fracción de vuelta a cantidad_disponible
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
  SET cantidad_separada = COALESCE(cantidad_separada, 0) + p_cantidad_recolectada,
      cantidad_reservada = GREATEST(0.00, COALESCE(cantidad_reservada, 0) - v_faltante)
  WHERE id = v_tarea.pedido_detalle_id;

  -- 6. Asentar el movimiento de preparación en Kardex (vinculado con pedido_id)
  -- Este registro será el que se ACTUALICE a 'despachado' o 'entregado' al finalizar el pedido.
  IF p_cantidad_recolectada > 0 THEN
    -- Verificar si ya existía un registro de picking para este pedido y artículo
    SELECT id INTO v_mov_id
    FROM public.movimientos_inventario
    WHERE pedido_id = v_tarea.pedido_id
      AND articulo_id = v_tarea.articulo_id
      AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
      AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.movimientos_inventario
      SET cantidad = cantidad + p_cantidad_recolectada,
          volumen_m3 = volumen_m3 + v_volumen_recolectado,
          notas = 'Picking completado para pedido ' || v_pedido.numero_pedido || ' (SKU: ' || COALESCE(v_art.sku, 'S/SKU') || ')',
          fecha_hora = clock_timestamp()
      WHERE id = v_mov_id;
    ELSE
      INSERT INTO public.movimientos_inventario (
        cliente_id, lote_id, articulo_id, pallet_id,
        ubicacion_origen_id, ubicacion_destino_id,
        tipo_movimiento, estado, pedido_id,
        cantidad, volumen_m3,
        documento_referencia, usuario_id, notas
      ) VALUES (
        v_pedido.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_tarea.pallet_origen_id,
        v_tarea.ubicacion_origen_id, NULL,
        'picking'::public.tipo_movimiento_enum, 'en_preparacion', v_tarea.pedido_id,
        p_cantidad_recolectada, v_volumen_recolectado,
        'PICKING-' || v_pedido.numero_pedido, (SELECT auth.uid()),
        'Picking en preparación para pedido ' || v_pedido.numero_pedido || ' (SKU: ' || COALESCE(v_art.sku, 'S/SKU') || ')'
      );
    END IF;
  END IF;

  -- 7. Verificar tareas pendientes
  SELECT COUNT(*) INTO v_tareas_pendientes
  FROM public.tareas_picking
  WHERE pedido_id = v_tarea.pedido_id AND estado != 'completada';

  IF v_tareas_pendientes = 0 THEN
    UPDATE public.pedidos
    SET estado = 'preparado'::public.estado_pedido_enum,
        actualizado_en = clock_timestamp()
    WHERE id = v_tarea.pedido_id;
  ELSE
    UPDATE public.pedidos
    SET estado = 'en_picking'::public.estado_pedido_enum,
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


-- 6. RPC: wms_consolidar_pallet_despacho (Consolidación de bultos, sin asientos duplicados en Kardex)
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
SECURITY DEFINER
SET search_path = public, pg_temp
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


-- 7. RPC: wms_despachar_pedido (DEDUCCIÓN FÍSICA Y ACTUALIZACIÓN EN EL MISMO REGISTRO A ENTREGADO O DESPACHADO)
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
  v_rem_cant NUMERIC(14,2);
  v_ded_res NUMERIC(14,2);
  v_ded_disp NUMERIC(14,2);
  
  -- Variables para discriminación de estado final:
  v_es_retiro_puerta BOOLEAN;
  v_tipo_final TEXT;
  v_estado_final TEXT;
  v_doc_final TEXT;
  v_mov_id UUID;
BEGIN
  -- 1. Obtener y bloquear pedido
  SELECT * INTO v_pedido
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  -- Determinar si la modalidad es retiro en puerta o entrega en domicilio
  v_es_retiro_puerta := (COALESCE(v_pedido.modalidad_entrega, 'envio_domicilio') = 'retiro_deposito');
  v_tipo_final := CASE WHEN v_es_retiro_puerta THEN 'despacho' ELSE 'entregado' END;
  v_estado_final := CASE WHEN v_es_retiro_puerta THEN 'despachado' ELSE 'entregado' END;
  v_doc_final := CASE WHEN v_es_retiro_puerta THEN 'DESPACHO-' ELSE 'ENTREGA-' END || v_pedido.numero_pedido;

  IF v_pedido.estado = 'despachado' THEN
    -- Asegurar remitos en entregado_conforme
    UPDATE public.remitos_transito
    SET estado = 'entregado_conforme'::public.estado_remito_enum,
        actualizado_en = clock_timestamp()
    WHERE pedido_id = p_pedido_id
      AND estado != 'anulado';

    RETURN jsonb_build_object(
      'exito', true,
      'mensaje', 'El pedido ya fue despachado previamente',
      'pedido_id', p_pedido_id,
      'numero_pedido', v_pedido.numero_pedido,
      'total_unidades_despachadas', 0,
      'nuevo_estado', v_estado_final
    );
  END IF;

  -- 2. Recorrer tareas de picking completadas para descontar inventario y actualizar el asiento en Kardex
  FOR v_tarea IN
    SELECT t.*, a.volumen_unitario_m3, a.sku
    FROM public.tareas_picking t
    JOIN public.articulos a ON a.id = t.articulo_id
    WHERE t.pedido_id = p_pedido_id
      AND COALESCE(t.cantidad_recolectada, 0) > 0
  LOOP
    v_cant_despachar := v_tarea.cantidad_recolectada;
    v_volumen_descontado := ROUND(v_cant_despachar * COALESCE(v_tarea.volumen_unitario_m3, 0.001), 4);
    v_rem_cant := v_cant_despachar;

    -- Descontar inventario físico de la posición origen
    SELECT * INTO v_inv
    FROM public.inventario
    WHERE cliente_id = v_pedido.cliente_id
      AND articulo_id = v_tarea.articulo_id
      AND ubicacion_id = v_tarea.ubicacion_origen_id
      AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
      AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
    FOR UPDATE;

    IF FOUND THEN
      v_ded_res := LEAST(COALESCE(v_inv.cantidad_reservada, 0), v_rem_cant);
      v_rem_cant := v_rem_cant - v_ded_res;

      v_ded_disp := LEAST(COALESCE(v_inv.cantidad_disponible, 0), v_rem_cant);
      v_rem_cant := v_rem_cant - v_ded_disp;

      UPDATE public.inventario
      SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_ded_res),
          cantidad_disponible = GREATEST(0.00, cantidad_disponible - v_ded_disp),
          volumen_m3 = GREATEST(0.0000, volumen_m3 - ROUND((v_ded_res + v_ded_disp) * COALESCE(v_tarea.volumen_unitario_m3, 0.001), 4)),
          actualizado_en = clock_timestamp()
      WHERE id = v_inv.id;

      DELETE FROM public.inventario
      WHERE id = v_inv.id
        AND cantidad_disponible <= 0.001
        AND cantidad_reservada <= 0.001;
    END IF;

    -- Si queda remanente, descontar de otras posiciones del mismo cliente y artículo
    IF v_rem_cant > 0 THEN
      FOR v_inv IN
        SELECT * FROM public.inventario
        WHERE cliente_id = v_pedido.cliente_id
          AND articulo_id = v_tarea.articulo_id
          AND (cantidad_reservada > 0 OR cantidad_disponible > 0)
        ORDER BY cantidad_reservada DESC, cantidad_disponible DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_rem_cant <= 0;

        v_ded_res := LEAST(COALESCE(v_inv.cantidad_reservada, 0), v_rem_cant);
        v_rem_cant := v_rem_cant - v_ded_res;

        v_ded_disp := LEAST(COALESCE(v_inv.cantidad_disponible, 0), v_rem_cant);
        v_rem_cant := v_rem_cant - v_ded_disp;

        UPDATE public.inventario
        SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_ded_res),
            cantidad_disponible = GREATEST(0.00, cantidad_disponible - v_ded_disp),
            volumen_m3 = GREATEST(0.0000, volumen_m3 - ROUND((v_ded_res + v_ded_disp) * COALESCE(v_tarea.volumen_unitario_m3, 0.001), 4)),
            actualizado_en = clock_timestamp()
        WHERE id = v_inv.id;

        DELETE FROM public.inventario
        WHERE id = v_inv.id
          AND cantidad_disponible <= 0.001
          AND cantidad_reservada <= 0.001;
      END LOOP;
    END IF;

    -- ACTUALIZACIÓN EN EL MISMO REGISTRO EN KARDEX:
    -- Buscamos el asiento existente de preparación/picking de este pedido
    SELECT id INTO v_mov_id
    FROM public.movimientos_inventario
    WHERE pedido_id = p_pedido_id
      AND articulo_id = v_tarea.articulo_id
    ORDER BY fecha_hora DESC
    LIMIT 1;

    IF FOUND THEN
      -- Se actualiza ese mismo registro al estado final: 'despacho' (puerta) o 'entregado' (flete/reparto)
      UPDATE public.movimientos_inventario
      SET tipo_movimiento = v_tipo_final::public.tipo_movimiento_enum,
          estado = v_estado_final,
          documento_referencia = v_doc_final,
          cantidad = v_cant_despachar,
          volumen_m3 = v_volumen_descontado,
          notas = CASE 
            WHEN v_es_retiro_puerta THEN 'Salida definitiva - Retirado en puerta (Despachado) pedido ' || v_pedido.numero_pedido
            ELSE 'Salida definitiva - Reparto / Entrega (Entregado) pedido ' || v_pedido.numero_pedido
          END || ' (SKU: ' || v_tarea.sku || ')',
          fecha_hora = clock_timestamp()
      WHERE id = v_mov_id;
    ELSE
      -- Si no existía registro previo, se crea directamente con el estado definitivo
      INSERT INTO public.movimientos_inventario (
        cliente_id, lote_id, articulo_id, pallet_id,
        ubicacion_origen_id, ubicacion_destino_id,
        tipo_movimiento, estado, pedido_id,
        cantidad, volumen_m3,
        documento_referencia, usuario_id, notas
      ) VALUES (
        v_pedido.cliente_id, v_tarea.lote_id, v_tarea.articulo_id, v_tarea.pallet_origen_id,
        v_tarea.ubicacion_origen_id, NULL,
        v_tipo_final::public.tipo_movimiento_enum, v_estado_final, p_pedido_id,
        v_cant_despachar, v_volumen_descontado,
        v_doc_final, COALESCE(p_usuario_id, (SELECT auth.uid())),
        CASE 
          WHEN v_es_retiro_puerta THEN 'Salida definitiva - Retirado en puerta (Despachado) pedido ' || v_pedido.numero_pedido
          ELSE 'Salida definitiva - Reparto / Entrega (Entregado) pedido ' || v_pedido.numero_pedido
        END || ' (SKU: ' || v_tarea.sku || ')'
      );
    END IF;

    v_total_despachado := v_total_despachado + v_cant_despachar;
  END LOOP;

  -- 3. Si no existían tareas de picking, despachar por pedidos_detalle (despacho directo)
  IF v_total_despachado = 0 THEN
    FOR v_det IN
      SELECT pd.*, a.volumen_unitario_m3, a.sku
      FROM public.pedidos_detalle pd
      JOIN public.articulos a ON a.id = pd.articulo_id
      WHERE pd.pedido_id = p_pedido_id
        AND (
          COALESCE(pd.cantidad_separada, 0) > 0 
          OR COALESCE(pd.cantidad_reservada, 0) > 0 
          OR COALESCE(pd.cantidad_solicitada, 0) > 0
        )
    LOOP
      v_cant_despachar := GREATEST(
        COALESCE(v_det.cantidad_separada, 0),
        COALESCE(v_det.cantidad_reservada, 0),
        COALESCE(v_det.cantidad_solicitada, 0)
      );

      IF v_cant_despachar <= 0 THEN
        CONTINUE;
      END IF;

      v_volumen_descontado := ROUND(v_cant_despachar * COALESCE(v_det.volumen_unitario_m3, 0.001), 4);
      v_rem_cant := v_cant_despachar;

      FOR v_inv IN
        SELECT * FROM public.inventario
        WHERE cliente_id = v_pedido.cliente_id
          AND articulo_id = v_det.articulo_id
          AND (cantidad_reservada > 0 OR cantidad_disponible > 0)
        ORDER BY cantidad_reservada DESC, cantidad_disponible DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_rem_cant <= 0;

        v_ded_res := LEAST(COALESCE(v_inv.cantidad_reservada, 0), v_rem_cant);
        v_rem_cant := v_rem_cant - v_ded_res;

        v_ded_disp := LEAST(COALESCE(v_inv.cantidad_disponible, 0), v_rem_cant);
        v_rem_cant := v_rem_cant - v_ded_disp;

        UPDATE public.inventario
        SET cantidad_reservada = GREATEST(0.00, cantidad_reservada - v_ded_res),
            cantidad_disponible = GREATEST(0.00, cantidad_disponible - v_ded_disp),
            volumen_m3 = GREATEST(0.0000, volumen_m3 - ROUND((v_ded_res + v_ded_disp) * COALESCE(v_det.volumen_unitario_m3, 0.001), 4)),
            actualizado_en = clock_timestamp()
        WHERE id = v_inv.id;

        DELETE FROM public.inventario
        WHERE id = v_inv.id
          AND cantidad_disponible <= 0.001
          AND cantidad_reservada <= 0.001;
      END LOOP;

      -- Actualizar en el mismo registro o insertar si no existía
      SELECT id INTO v_mov_id
      FROM public.movimientos_inventario
      WHERE pedido_id = p_pedido_id
        AND articulo_id = v_det.articulo_id
      ORDER BY fecha_hora DESC
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.movimientos_inventario
        SET tipo_movimiento = v_tipo_final::public.tipo_movimiento_enum,
            estado = v_estado_final,
            documento_referencia = v_doc_final,
            cantidad = v_cant_despachar,
            volumen_m3 = v_volumen_descontado,
            notas = CASE 
              WHEN v_es_retiro_puerta THEN 'Salida definitiva directa - Retirado en puerta (Despachado) pedido ' || v_pedido.numero_pedido
              ELSE 'Salida definitiva directa - Reparto / Entrega (Entregado) pedido ' || v_pedido.numero_pedido
            END || ' (SKU: ' || v_det.sku || ')',
            fecha_hora = clock_timestamp()
        WHERE id = v_mov_id;
      ELSE
        INSERT INTO public.movimientos_inventario (
          cliente_id, lote_id, articulo_id, pallet_id,
          ubicacion_origen_id, ubicacion_destino_id,
          tipo_movimiento, estado, pedido_id,
          cantidad, volumen_m3,
          documento_referencia, usuario_id, notas
        ) VALUES (
          v_pedido.cliente_id, NULL, v_det.articulo_id, NULL,
          NULL, NULL,
          v_tipo_final::public.tipo_movimiento_enum, v_estado_final, p_pedido_id,
          v_cant_despachar, v_volumen_descontado,
          v_doc_final, COALESCE(p_usuario_id, (SELECT auth.uid())),
          CASE 
            WHEN v_es_retiro_puerta THEN 'Salida definitiva directa - Retirado en puerta (Despachado) pedido ' || v_pedido.numero_pedido
            ELSE 'Salida definitiva directa - Reparto / Entrega (Entregado) pedido ' || v_pedido.numero_pedido
          END || ' (SKU: ' || v_det.sku || ')'
        );
      END IF;

      v_total_despachado := v_total_despachado + v_cant_despachar;
    END LOOP;
  END IF;

  -- 4. Actualizar estado del pedido a 'despachado'
  UPDATE public.pedidos
  SET estado = 'despachado'::public.estado_pedido_enum,
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  -- 5. Actualizar remito de tránsito asociado a 'entregado_conforme'
  UPDATE public.remitos_transito
  SET estado = 'entregado_conforme'::public.estado_remito_enum,
      actualizado_en = clock_timestamp()
  WHERE pedido_id = p_pedido_id
    AND estado != 'anulado';

  RETURN jsonb_build_object(
    'exito', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'total_unidades_despachadas', v_total_despachado,
    'nuevo_estado', v_estado_final,
    'modalidad', CASE WHEN v_es_retiro_puerta THEN 'retiro_deposito' ELSE 'envio_domicilio' END
  );
END;
$$;

-- 8. Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_confirmar_picking_con_novedad(UUID, NUMERIC, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_consolidar_pallet_despacho(UUID, TEXT, INT, NUMERIC, NUMERIC, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_despachar_pedido(UUID, UUID) TO authenticated, anon, service_role;
