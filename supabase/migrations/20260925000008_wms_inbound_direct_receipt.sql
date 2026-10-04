-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: ESTADO 'INBOUND' Y RECEPCIÓN DIRECTA SIN CONTAR
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. Agregar valor 'inbound' al enum estado_recepcion_enum si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.estado_recepcion_enum'::regtype 
      AND enumlabel = 'inbound'
  ) THEN
    ALTER TYPE public.estado_recepcion_enum ADD VALUE 'inbound' BEFORE 'en_descarga';
  END IF;
END $$;

-- 2. Asegurar que wms_conformar_todos_inbound sea SECURITY DEFINER y robusto
CREATE OR REPLACE FUNCTION public.wms_conformar_todos_inbound(
  p_recepcion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- 2. Ubicación de respaldo del almacén
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

  -- 3. Recorrer cada tarea pendiente o en traslado
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
      RAISE EXCEPTION 'No se encontró ninguna ubicación válida para almacenar la tarea %', v_tarea.tarea_id;
    END IF;

    -- Confirmar putaway automático exacto
    v_res := public.wms_confirmar_putaway(
      v_tarea.tarea_id,
      v_tarea.cantidad_esperada,
      NULL,
      v_tarea.ubicacion_destino_res
    );

    v_count := v_count + 1;
  END LOOP;

  -- 4. Actualizar la orden a 'finalizada'
  UPDATE public.ordenes_recepcion
  SET estado = 'finalizada', actualizado_en = clock_timestamp()
  WHERE id = p_recepcion_id;

  RETURN jsonb_build_object(
    'exito', true,
    'total_conformados', v_count,
    'recepcion_id', p_recepcion_id,
    'mensaje', 'Recepción conformada exitosamente en stock (' || v_count || ' renglones ingresados).'
  );
END;
$$;

-- 3. Actualizar wms_confirmar_putaway para soportar transición desde 'inbound'
CREATE OR REPLACE FUNCTION public.wms_confirmar_putaway(
  p_tarea_id UUID,
  p_cantidad_recibida NUMERIC,
  p_codigo_lpn TEXT DEFAULT NULL,
  p_ubicacion_destino_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tarea RECORD;
  v_articulo RECORD;
  v_pallet_id UUID;
  v_ubic_dest UUID;
  v_volumen_m3 NUMERIC(14,4);
  v_inv_id UUID;
  v_recepcion_id UUID;
  v_pendientes INT;
BEGIN
  -- 1. Obtener datos de la tarea
  SELECT t.*, r.cliente_id, r.almacen_id, r.id as orden_recepcion_id
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

  v_recepcion_id := v_tarea.orden_recepcion_id;

  -- 2. Obtener datos del artículo para cubicaje
  SELECT * INTO v_articulo FROM public.articulos WHERE id = v_tarea.articulo_id;

  -- 3. Calcular volumen cúbico M3
  v_volumen_m3 := ROUND(p_cantidad_recibida * COALESCE(v_articulo.volumen_unitario_m3, 0.025), 4);

  -- 4. Resolver ubicación destino
  v_ubic_dest := COALESCE(p_ubicacion_destino_id, v_tarea.ubicacion_destino_id);

  -- 5. Manejo de Pallet LPN
  IF p_codigo_lpn IS NOT NULL AND TRIM(p_codigo_lpn) <> '' THEN
    SELECT id INTO v_pallet_id FROM public.pallets_lpn WHERE codigo_lpn = TRIM(p_codigo_lpn) AND cliente_id = v_tarea.cliente_id;
    IF v_pallet_id IS NULL THEN
      INSERT INTO public.pallets_lpn (cliente_id, codigo_lpn, volumen_total_m3, peso_total_kg, estado)
      VALUES (v_tarea.cliente_id, TRIM(p_codigo_lpn), v_volumen_m3, ROUND(p_cantidad_recibida * COALESCE(v_articulo.peso_unitario_kg, 1), 3), 'en_stock')
      RETURNING id INTO v_pallet_id;
    ELSE
      UPDATE public.pallets_lpn
      SET volumen_total_m3 = volumen_total_m3 + v_volumen_m3,
          peso_total_kg = peso_total_kg + ROUND(p_cantidad_recibida * COALESCE(v_articulo.peso_unitario_kg, 1), 3)
      WHERE id = v_pallet_id;
    END IF;
  ELSE
    v_pallet_id := NULL;
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
      p_cantidad_recibida, 0.00, v_volumen_m3, COALESCE(v_articulo.unidad_medida, 'bulto')
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

  -- 9. Verificar estado general de la orden de recepción
  SELECT COUNT(*) INTO v_pendientes
  FROM public.tareas_putaway_control t
  JOIN public.ordenes_recepcion_detalle rd ON rd.id = t.recepcion_detalle_id
  WHERE rd.recepcion_id = v_recepcion_id AND t.estado IN ('pendiente', 'en_traslado');

  IF v_pendientes = 0 THEN
    UPDATE public.ordenes_recepcion
    SET estado = 'finalizada', actualizado_en = clock_timestamp()
    WHERE id = v_recepcion_id;
  ELSE
    UPDATE public.ordenes_recepcion
    SET estado = 'en_control', actualizado_en = clock_timestamp()
    WHERE id = v_recepcion_id AND estado IN ('inbound', 'en_playa', 'en_descarga');
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'tarea_id', p_tarea_id,
    'inventario_id', v_inv_id,
    'cantidad_almacenada', p_cantidad_recibida,
    'volumen_m3', v_volumen_m3,
    'finalizada', (v_pendientes = 0)
  );
END;
$$;

-- 4. Actualizar wms_crear_orden_recepcion con estado inicial 'inbound' y soporte para recibir directo
CREATE OR REPLACE FUNCTION public.wms_crear_orden_recepcion(
  p_almacen_id UUID,
  p_cliente_id UUID,
  p_numero_recepcion TEXT,
  p_nro_contenedor_oc TEXT DEFAULT NULL,
  p_transporte_empresa TEXT DEFAULT NULL,
  p_patente_camion TEXT DEFAULT NULL,
  p_chofer_nombre TEXT DEFAULT NULL,
  p_chofer_documento TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_detalles JSONB DEFAULT '[]'::jsonb,
  p_recibir_directo BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recepcion_id UUID;
  v_staging_id UUID;
  v_det JSONB;
  v_articulo_id UUID;
  v_lote_declarado TEXT;
  v_fecha_venc DATE;
  v_cant_esperada NUMERIC;
  v_ubic_sugerida UUID;
  v_comentarios TEXT;
  v_detalle_id UUID;
  v_lote_id UUID;
  v_ubic_dest UUID;
  v_conformar_res JSONB;
BEGIN
  -- 1. Validar unicidad del número de recepción
  IF EXISTS (SELECT 1 FROM public.ordenes_recepcion WHERE numero_recepcion = TRIM(p_numero_recepcion)) THEN
    RAISE EXCEPTION 'El número de recepción % ya existe en el sistema.', p_numero_recepcion;
  END IF;

  -- 2. Resolver ubicación de staging / playa
  SELECT u.id INTO v_staging_id
  FROM public.ubicaciones u
  JOIN public.zonas z ON z.id = u.zona_id
  WHERE u.almacen_id = p_almacen_id AND z.tipo_zona = 'recepcion'
  ORDER BY u.codigo_etiqueta
  LIMIT 1;

  IF v_staging_id IS NULL THEN
    SELECT id INTO v_staging_id FROM public.ubicaciones WHERE almacen_id = p_almacen_id LIMIT 1;
  END IF;

  -- 3. Insertar cabecera con estado inicial 'inbound'
  INSERT INTO public.ordenes_recepcion (
    almacen_id,
    cliente_id,
    numero_recepcion,
    nro_contenedor_oc,
    transporte_empresa,
    patente_camion,
    chofer_nombre,
    chofer_documento,
    observaciones,
    estado,
    fecha_hora_arribo
  ) VALUES (
    p_almacen_id,
    p_cliente_id,
    TRIM(p_numero_recepcion),
    p_nro_contenedor_oc,
    p_transporte_empresa,
    p_patente_camion,
    p_chofer_nombre,
    p_chofer_documento,
    p_observaciones,
    'inbound',
    clock_timestamp()
  ) RETURNING id INTO v_recepcion_id;

  -- 4. Procesar renglones de mercadería
  FOR v_det IN SELECT * FROM jsonb_array_elements(p_detalles)
  LOOP
    v_articulo_id := (v_det->>'articulo_id')::UUID;
    v_lote_declarado := TRIM(COALESCE(v_det->>'lote_declarado', 'L-GENERAL'));
    v_fecha_venc := NULL;
    IF v_det ? 'fecha_vencimiento' AND v_det->>'fecha_vencimiento' IS NOT NULL AND v_det->>'fecha_vencimiento' <> '' THEN
      v_fecha_venc := (v_det->>'fecha_vencimiento')::DATE;
    END IF;
    v_cant_esperada := COALESCE((v_det->>'cantidad_esperada')::NUMERIC, 0);
    
    v_ubic_sugerida := NULL;
    IF v_det ? 'ubicacion_sugerida_id' AND v_det->>'ubicacion_sugerida_id' IS NOT NULL AND v_det->>'ubicacion_sugerida_id' <> '' THEN
      v_ubic_sugerida := (v_det->>'ubicacion_sugerida_id')::UUID;
    END IF;
    v_comentarios := v_det->>'comentarios';

    -- Si no hay ubicación sugerida, asignar la primera ubicación de almacenamiento disponible
    IF v_ubic_sugerida IS NULL THEN
      SELECT u.id INTO v_ubic_dest
      FROM public.ubicaciones u
      JOIN public.zonas z ON z.id = u.zona_id
      WHERE u.almacen_id = p_almacen_id AND z.tipo_zona = 'almacenamiento'
      ORDER BY u.codigo_etiqueta
      LIMIT 1;

      IF v_ubic_dest IS NULL THEN
        SELECT id INTO v_ubic_dest FROM public.ubicaciones WHERE almacen_id = p_almacen_id LIMIT 1;
      END IF;
    ELSE
      v_ubic_dest := v_ubic_sugerida;
    END IF;

    -- Buscar o crear el lote para el cliente
    SELECT id INTO v_lote_id
    FROM public.lotes_cliente
    WHERE cliente_id = p_cliente_id AND numero_lote = v_lote_declarado;

    IF v_lote_id IS NULL THEN
      INSERT INTO public.lotes_cliente (
        cliente_id,
        numero_lote,
        fecha_vencimiento
      ) VALUES (
        p_cliente_id,
        v_lote_declarado,
        v_fecha_venc
      ) RETURNING id INTO v_lote_id;
    END IF;

    -- Insertar renglón en ordenes_recepcion_detalle
    INSERT INTO public.ordenes_recepcion_detalle (
      recepcion_id,
      articulo_id,
      lote_declarado,
      fecha_vencimiento,
      cantidad_esperada,
      ubicacion_sugerida_id,
      comentarios
    ) VALUES (
      v_recepcion_id,
      v_articulo_id,
      v_lote_declarado,
      v_fecha_venc,
      v_cant_esperada,
      v_ubic_dest,
      v_comentarios
    ) RETURNING id INTO v_detalle_id;

    -- Generar tarea de control y putaway pendiente
    INSERT INTO public.tareas_putaway_control (
      recepcion_detalle_id,
      articulo_id,
      lote_id,
      pallet_id,
      cantidad_recibida,
      volumen_calculado_m3,
      ubicacion_origen_id,
      ubicacion_destino_id,
      estado
    ) VALUES (
      v_detalle_id,
      v_articulo_id,
      v_lote_id,
      NULL,
      0.00,
      0.0000,
      v_staging_id,
      v_ubic_dest,
      'pendiente'
    );
  END LOOP;

  -- 5. Si el usuario eligió recibir directo sin contar, conformar inmediatamente a stock
  IF p_recibir_directo = TRUE THEN
    v_conformar_res := public.wms_conformar_todos_inbound(v_recepcion_id);
    RETURN jsonb_build_object(
      'exito', true,
      'recepcion_id', v_recepcion_id,
      'numero_recepcion', p_numero_recepcion,
      'estado', 'finalizada',
      'recibido_directo', true,
      'mensaje', 'Orden creada e ingresada directamente al stock conforme cantidades esperadas.'
    );
  END IF;

  RETURN jsonb_build_object(
    'exito', true,
    'recepcion_id', v_recepcion_id,
    'numero_recepcion', p_numero_recepcion,
    'estado', 'inbound',
    'recibido_directo', false,
    'mensaje', 'Orden registrada en estado Inbound en espera de descarga/control.'
  );
END;
$$;

-- 5. Función para cambio manual de estado en Inbound (ej: Inbound -> En Control)
CREATE OR REPLACE FUNCTION public.wms_actualizar_estado_recepcion(
  p_recepcion_id UUID,
  p_nuevo_estado public.estado_recepcion_enum
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ordenes_recepcion
  SET estado = p_nuevo_estado,
      actualizado_en = clock_timestamp()
  WHERE id = p_recepcion_id;

  RETURN jsonb_build_object('exito', true, 'estado', p_nuevo_estado);
END;
$$;

-- 6. Grants de ejecución explícitos
GRANT EXECUTE ON FUNCTION public.wms_conformar_todos_inbound(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_confirmar_putaway(UUID, NUMERIC, TEXT, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_crear_orden_recepcion(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_actualizar_estado_recepcion(UUID, public.estado_recepcion_enum) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
