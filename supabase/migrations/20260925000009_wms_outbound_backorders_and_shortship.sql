-- ==============================================================================
-- OPENWMS 3PL - Procedimientos de Gestión de Backorders y Ajuste de Stock
-- Ajuste de pedidos a stock preparado (Short-ship) y Alocación FEFO resiliente
-- Idioma: Español Latinoamericano (es-419)
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. RPC: AJUSTAR PEDIDO AL STOCK PREPARADO (CERRAR BACKORDER / SHORT-SHIP)
CREATE OR REPLACE FUNCTION public.wms_ajustar_pedido_stock_preparado(
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
  v_efectivo NUMERIC(14,2);
  v_diferencia NUMERIC(14,2);
  v_total_recortado NUMERIC(14,2) := 0.00;
  v_renglones_modificados INT := 0;
  v_total_restante NUMERIC(14,2) := 0.00;
  v_tareas_pendientes INT := 0;
  v_nuevo_estado TEXT;
BEGIN
  -- 1. Bloquear pedido para actualización
  SELECT * INTO v_pedido 
  FROM public.pedidos 
  WHERE id = p_pedido_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido con ID % no encontrado', p_pedido_id;
  END IF;

  IF v_pedido.estado IN ('despachado', 'cancelado') THEN
    RAISE EXCEPTION 'No se puede ajustar un pedido en estado %', v_pedido.estado;
  END IF;

  -- 2. Recorrer renglones y recortar saldo no cubierto
  FOR v_det IN 
    SELECT * 
    FROM public.pedidos_detalle 
    WHERE pedido_id = p_pedido_id 
    FOR UPDATE
  LOOP
    -- La cantidad efectiva preservada es lo que ya fue separado o al menos reservado
    v_efectivo := GREATEST(v_det.cantidad_separada, v_det.cantidad_reservada);
    
    IF v_efectivo < v_det.cantidad_solicitada THEN
      v_diferencia := v_det.cantidad_solicitada - v_efectivo;
      v_total_recortado := v_total_recortado + v_diferencia;
      v_renglones_modificados := v_renglones_modificados + 1;

      UPDATE public.pedidos_detalle
      SET cantidad_solicitada = v_efectivo
      WHERE id = v_det.id;
    END IF;

    v_total_restante := v_total_restante + v_efectivo;
  END LOOP;

  -- 3. Determinar nuevo estado del pedido
  SELECT COUNT(*) INTO v_tareas_pendientes
  FROM public.tareas_picking
  WHERE pedido_id = p_pedido_id AND estado != 'completada';

  IF v_total_restante = 0 THEN
    v_nuevo_estado := 'cancelado';
  ELSIF v_tareas_pendientes = 0 AND v_pedido.estado IN ('en_picking', 'asignado_picking') THEN
    -- Ya no quedan tareas pendientes para lo efectivamente reservado/separado
    v_nuevo_estado := 'preparado';
  ELSE
    v_nuevo_estado := v_pedido.estado;
  END IF;

  -- Actualizar pedido
  UPDATE public.pedidos
  SET estado = v_nuevo_estado::public.estado_pedido_enum,
      observaciones = TRIM(BOTH ' ' FROM COALESCE(observaciones || ' | ', '') || 
        'Corte de faltante (short-ship): recortadas ' || v_total_recortado::text || ' un. de backorder en ' || v_renglones_modificados::text || ' renglones.'),
      actualizado_en = clock_timestamp()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'pedido_id', p_pedido_id,
    'numero_pedido', v_pedido.numero_pedido,
    'unidades_recortadas', v_total_recortado,
    'renglones_ajustados', v_renglones_modificados,
    'total_unidades_restantes', v_total_restante,
    'estado_anterior', v_pedido.estado,
    'nuevo_estado', v_nuevo_estado
  );
END;
$$;


-- 2. RPC: ALOCACIÓN FEFO/FIFO RESILIENTE A FALTANTES
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
  v_total_solicitado NUMERIC(12,2) := 0;
  v_total_faltante NUMERIC(12,2) := 0;
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
    v_total_solicitado := v_total_solicitado + v_det.cantidad_solicitada;
    v_pendiente := v_det.cantidad_solicitada - v_det.cantidad_reservada;

    IF v_pendiente > 0 THEN
      -- Buscar existencias disponibles ordenadas por FEFO / FIFO
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
        v_total_faltante := v_total_faltante + v_pendiente;
      END IF;
    END IF;
  END LOOP;

  -- Si no se reservó nada de nada por falta total de stock
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
    'total_solicitado', v_total_solicitado,
    'faltante_total', v_total_faltante,
    'tiene_backorder', (v_total_faltante > 0),
    'estado_nuevo', 'asignado_picking'
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.wms_ajustar_pedido_stock_preparado(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_asignar_picking_fefo(UUID) TO authenticated;
