-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: LOTE Y UBICACIÓN EN DETALLE DE PEDIDOS Y ASIGNACIÓN FORZADA
-- Motor: PostgreSQL 17 / Supabase
-- Archivo: 20261021030000_wms_pedidos_detalle_lote_ubicacion.sql
-- ==============================================================================
-- 1. Agregar columnas opcionales 'lote_id' y 'ubicacion_id' a 'pedidos_detalle'
--    para permitir al operador elegir de qué lote y ubicación reservar mercadería
--    desde la carga del pedido, además de la asignación automática FEFO/FIFO.
-- ==============================================================================

ALTER TABLE public.pedidos_detalle 
  ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES public.lotes_cliente(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ubicacion_id UUID REFERENCES public.ubicaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_lote ON public.pedidos_detalle(lote_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_ubicacion ON public.pedidos_detalle(ubicacion_id);

-- ==============================================================================
-- 2. Actualizar wms_asignar_picking_fefo para respetar lote y ubicación preseleccionados
-- ==============================================================================
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
      -- Buscar existencias disponibles en inventario
      -- Si el detalle del pedido tiene lote_id o ubicacion_id seleccionados, se priorizan y respetan
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
          AND (v_det.lote_id IS NULL OR i.lote_id = v_det.lote_id)
          AND (v_det.ubicacion_id IS NULL OR i.ubicacion_id = v_det.ubicacion_id)
        ORDER BY 
          -- Si el detalle especificó lote o ubicación, se priorizan
          CASE WHEN v_det.lote_id IS NOT NULL AND i.lote_id = v_det.lote_id THEN 0 ELSE 1 END ASC,
          CASE WHEN v_det.ubicacion_id IS NOT NULL AND i.ubicacion_id = v_det.ubicacion_id THEN 0 ELSE 1 END ASC,
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

        -- Reservar en inventario (SOLO reserva física interna)
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
            lote_id = COALESCE(v_det.lote_id, v_inv.lote_id),
            ubicacion_id = COALESCE(v_det.ubicacion_id, v_inv.ubicacion_id)
        WHERE id = v_det.id;

        v_pendiente := v_pendiente - v_tomar;
        v_total_reservado := v_total_reservado + v_tomar;
        v_tareas_creadas := v_tareas_creadas + 1;
      END LOOP;

      -- Si quedó saldo y se había forzado un filtro restrictivo, intentar cubrir saldo con FEFO estándar
      IF v_pendiente > 0 AND (v_det.lote_id IS NOT NULL OR v_det.ubicacion_id IS NOT NULL) THEN
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

          UPDATE public.inventario
          SET cantidad_disponible = cantidad_disponible - v_tomar,
              cantidad_reservada = cantidad_reservada + v_tomar,
              actualizado_en = clock_timestamp()
          WHERE id = v_inv.inv_id;

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

          UPDATE public.pedidos_detalle
          SET cantidad_reservada = COALESCE(cantidad_reservada, 0) + v_tomar
          WHERE id = v_det.id;

          v_pendiente := v_pendiente - v_tomar;
          v_total_reservado := v_total_reservado + v_tomar;
          v_tareas_creadas := v_tareas_creadas + 1;
        END LOOP;
      END IF;

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
