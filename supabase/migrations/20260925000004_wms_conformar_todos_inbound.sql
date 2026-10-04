-- Migración 20260925000004: Procedimiento para conformar todos los renglones pendientes de una recepción inbound

CREATE OR REPLACE FUNCTION public.wms_conformar_todos_inbound(
  p_recepcion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_recepcion RECORD;
  v_tarea RECORD;
  v_count INT := 0;
  v_primer_ubic UUID := NULL;
  v_res JSONB;
BEGIN
  -- 1. Validar que la recepción exista
  SELECT * INTO v_recepcion
  FROM public.ordenes_recepcion
  WHERE id = p_recepcion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de recepción con ID % no encontrada', p_recepcion_id;
  END IF;

  -- 2. Ubicación de respaldo del almacén (filtrar por estado = 'activa' o cualquier disponible)
  SELECT id INTO v_primer_ubic
  FROM public.ubicaciones
  WHERE almacen_id = v_recepcion.almacen_id 
    AND (estado IS NULL OR estado = 'activa')
  ORDER BY codigo_etiqueta ASC
  LIMIT 1;

  IF v_primer_ubic IS NULL THEN
    SELECT id INTO v_primer_ubic
    FROM public.ubicaciones
    WHERE almacen_id = v_recepcion.almacen_id
    ORDER BY codigo_etiqueta ASC
    LIMIT 1;
  END IF;

  -- 3. Recorrer cada tarea pendiente o en traslado asociada a los renglones de la recepción
  FOR v_tarea IN
    SELECT 
      t.id AS tarea_id,
      rd.cantidad_esperada,
      COALESCE(t.ubicacion_destino_id, rd.ubicacion_sugerida_id, v_primer_ubic) AS ubicacion_destino_res
    FROM public.tareas_putaway_control t
    JOIN public.ordenes_recepcion_detalle rd ON rd.id = t.recepcion_detalle_id
    WHERE rd.recepcion_id = p_recepcion_id
      AND t.estado IN ('pendiente', 'en_traslado')
    ORDER BY t.creado_en ASC
  LOOP
    IF v_tarea.ubicacion_destino_res IS NULL THEN
      RAISE EXCEPTION 'No se encontró ninguna ubicación válida ni por defecto para almacenar la tarea %', v_tarea.tarea_id;
    END IF;

    -- Llamar a wms_confirmar_putaway para registrar la confronta exacta con cantidad esperada
    v_res := public.wms_confirmar_putaway(
      v_tarea.tarea_id,
      v_tarea.cantidad_esperada,
      NULL, -- Carga suelta estándar
      v_tarea.ubicacion_destino_res
    );

    v_count := v_count + 1;
  END LOOP;

  -- 4. Asegurar que la orden quede finalizada si no quedaron tareas pendientes
  IF NOT EXISTS (
    SELECT 1 
    FROM public.tareas_putaway_control t
    JOIN public.ordenes_recepcion_detalle rd ON rd.id = t.recepcion_detalle_id
    WHERE rd.recepcion_id = p_recepcion_id
      AND t.estado IN ('pendiente', 'en_traslado')
  ) THEN
    UPDATE public.ordenes_recepcion
    SET estado = 'finalizada', actualizado_en = clock_timestamp()
    WHERE id = p_recepcion_id;
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'total_conformados', v_count,
    'recepcion_id', p_recepcion_id,
    'mensaje', 'Se conformaron exitosamente ' || v_count || ' renglón(es) de la recepción.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_conformar_todos_inbound(UUID) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
