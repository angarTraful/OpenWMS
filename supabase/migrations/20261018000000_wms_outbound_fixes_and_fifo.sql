-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: CORRECCIONES EN OUTBOUND, FEFO/FIFO Y ESTADOS
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. EXTENDER ENUM estado_ruta_enum CON ESTADOS 'suspendida' Y 'cancelada'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'estado_ruta_enum' AND e.enumlabel = 'suspendida'
  ) THEN
    ALTER TYPE public.estado_ruta_enum ADD VALUE 'suspendida';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'estado_ruta_enum' AND e.enumlabel = 'cancelada'
  ) THEN
    ALTER TYPE public.estado_ruta_enum ADD VALUE 'cancelada';
  END IF;
END $$;


-- 2. CORREGIR RPC: wms_confirmar_picking_con_novedad
-- Asegura search_path = public, pg_temp y casteo explícito a estado_pedido_enum
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
  v_faltante NUMERIC(12,2) := 0.00;
  v_tareas_pendientes INT := 0;
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

  -- 2. Calcular faltante respecto de la reserva asignada
  v_faltante := GREATEST(0.00, v_tarea.cantidad_a_recolectar - p_cantidad_recolectada);

  -- 3. Localizar el inventario reservado
  SELECT * INTO v_inv
  FROM public.inventario
  WHERE articulo_id = v_tarea.articulo_id
    AND ubicacion_id = v_tarea.ubicacion_origen_id
    AND (pallet_id IS NOT DISTINCT FROM v_tarea.pallet_origen_id)
    AND (lote_id IS NOT DISTINCT FROM v_tarea.lote_id)
  FOR UPDATE;

  IF FOUND THEN
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
    -- Todas las tareas finalizadas -> Pedido pasa a estado 'preparado' con casteo explícito al enum
    UPDATE public.pedidos
    SET estado = 'preparado'::public.estado_pedido_enum,
        actualizado_en = clock_timestamp()
    WHERE id = v_tarea.pedido_id;
  ELSE
    -- Aún quedan tareas -> Pedido pasa a estado 'en_picking' con casteo explícito al enum
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

GRANT EXECUTE ON FUNCTION public.wms_confirmar_picking_con_novedad(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_confirmar_picking_con_novedad(UUID, NUMERIC, TEXT) TO anon;


-- 3. ALOCACIÓN DE STOCK: SOPORTE INTEGRAL DE FEFO Y FIFO
-- Ordena por Vencimiento (FEFO) o por Ingreso/Antigüedad (FIFO)
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
    v_pendiente := v_det.cantidad_solicitada - v_det.cantidad_reservada;

    IF v_pendiente > 0 THEN
      -- Buscar existencias disponibles ordenadas según la estrategia:
      -- FEFO: fecha_vencimiento ASC NULLS LAST, luego antigüedad
      -- FIFO: antigüedad de ingreso ASC, fecha_fabricacion ASC NULLS LAST
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
          -- Para FEFO:
          CASE WHEN v_estrategia_norm != 'FIFO' THEN l.fecha_vencimiento END ASC NULLS LAST,
          -- Para FIFO o desempate FEFO:
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
        v_total_faltante := v_total_faltante + v_pendiente;
      END IF;
    END IF;
  END LOOP;

  -- Si no se reservó nada por falta total de stock
  IF v_tareas_creadas = 0 THEN
    RETURN jsonb_build_object(
      'exito', false,
      'sin_stock', true,
      'pedido_id', p_pedido_id,
      'numero_pedido', v_pedido.numero_pedido,
      'tareas_creadas', 0,
      'total_unidades_reservadas', 0,
      'faltante_total', v_total_solicitado,
      'mensaje', 'No hay stock disponible para ninguno de los artículos de este pedido.',
      'estado_nuevo', v_pedido.estado
    );
  END IF;

  -- Actualizar estado del pedido a asignado_picking con casteo explícito al enum
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
    'total_unidades_reservadas', v_total_reservado,
    'total_solicitado', v_total_solicitado,
    'faltante_total', v_total_faltante,
    'tiene_backorder', (v_total_faltante > 0),
    'estado_nuevo', 'asignado_picking'
  );
END;
$$;

-- Mantener sobrecarga de 1 parámetro llamando a la de 2 parámetros
CREATE OR REPLACE FUNCTION public.wms_asignar_picking_fefo(p_pedido_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.wms_asignar_picking_fefo(p_pedido_id, 'FEFO');
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID) TO anon;


-- 4. ACTUALIZAR wms_emitir_remito_rx: VINCULAR AUTOMÁTICAMENTE EL REMITO A PARADAS EXISTENTES
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

  -- 3. Si se pasó un valor declarado total explícito (editado por el usuario), usarlo
  IF p_valor_declarado_total IS NOT NULL AND p_valor_declarado_total >= 0 THEN
    v_valor_declarado_total := p_valor_declarado_total;
  END IF;

  -- 4. Calcular cantidad de pallets de salida registrados
  SELECT COUNT(*) INTO v_total_pallets
  FROM public.paletizado_despacho
  WHERE pedido_id = p_pedido_id;

  IF v_total_pallets = 0 THEN
    v_total_pallets := 1;
  END IF;

  -- 5. Insertar Remito Rx de Tránsito (casteo explícito al enum estado_remito_enum)
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
    'emitido'::public.estado_remito_enum
  ) RETURNING id INTO v_remito_id;

  -- 6. Preservar estado del pedido como 'preparado' (o 'agrupado_salida')
  UPDATE public.pedidos
  SET estado = CASE 
        WHEN estado::text = 'agrupado_salida' THEN 'agrupado_salida'::public.estado_pedido_enum 
        ELSE 'preparado'::public.estado_pedido_enum 
      END,
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  -- 7. VINCULACIÓN AUTOMÁTICA CON ITINERARIOS DE VIAJE:
  -- Si ya existía una hoja de ruta con este pedido, asociar inmediatamente el remito_id a la parada
  UPDATE public.rutas_paradas_itinerario
  SET remito_id = v_remito_id
  WHERE pedido_id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'remito_id', v_remito_id,
    'numero_remito_rx', p_numero_remito_rx,
    'total_bultos', v_total_bultos,
    'total_pallets', v_total_pallets,
    'peso_total_kg', v_peso_total,
    'volumen_total_m3', v_volumen_total,
    'valor_declarado_total', v_valor_declarado_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO anon;

NOTIFY pgrst, 'reload schema';
