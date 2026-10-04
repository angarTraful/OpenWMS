-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: CABECERA INBOUND CON LOTE ÚNICO, TIPO CNTR, ADUANA Y DOCUMENTOS
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. Asegurar columnas en ordenes_recepcion
ALTER TABLE public.ordenes_recepcion ADD COLUMN IF NOT EXISTS despacho_aduana TEXT;
ALTER TABLE public.ordenes_recepcion ADD COLUMN IF NOT EXISTS lote_defecto TEXT;
ALTER TABLE public.ordenes_recepcion ADD COLUMN IF NOT EXISTS tipo_contenedor TEXT;
ALTER TABLE public.ordenes_recepcion ADD COLUMN IF NOT EXISTS documentos_adjuntos JSONB DEFAULT '[]'::jsonb;

-- 2. Limpiar sobrecargas previas para evitar ambigüedad en PostgREST RPC
DROP FUNCTION IF EXISTS public.wms_crear_orden_recepcion(uuid, uuid, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.wms_crear_orden_recepcion(uuid, uuid, text, text, text, text, text, text, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public.wms_crear_orden_recepcion(uuid, uuid, text, text, text, text, text, text, text, jsonb, boolean, text, text, text, jsonb, timestamptz);

-- 3. Crear función unificada con soporte completo para lote header, despacho, contenedor, documentos y fecha/hora
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
  p_recibir_directo BOOLEAN DEFAULT false,
  p_lote_defecto TEXT DEFAULT NULL,
  p_tipo_contenedor TEXT DEFAULT NULL,
  p_despacho_aduana TEXT DEFAULT NULL,
  p_documentos_adjuntos JSONB DEFAULT '[]'::jsonb,
  p_fecha_hora_arribo TIMESTAMPTZ DEFAULT NULL
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
  v_lote_cabecera TEXT;
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

  -- Resolver lote general para la operación
  v_lote_cabecera := TRIM(COALESCE(NULLIF(p_lote_defecto, ''), TRIM(p_numero_recepcion)));

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
    tipo_contenedor,
    fecha_hora_arribo,
    transporte_empresa,
    patente_camion,
    chofer_nombre,
    chofer_documento,
    documentos_adjuntos,
    lote_defecto,
    despacho_aduana,
    observaciones,
    estado
  ) VALUES (
    p_almacen_id,
    p_cliente_id,
    TRIM(p_numero_recepcion),
    p_nro_contenedor_oc,
    p_tipo_contenedor,
    COALESCE(p_fecha_hora_arribo, clock_timestamp()),
    p_transporte_empresa,
    p_patente_camion,
    p_chofer_nombre,
    p_chofer_documento,
    COALESCE(p_documentos_adjuntos, '[]'::jsonb),
    v_lote_cabecera,
    p_despacho_aduana,
    p_observaciones,
    'inbound'
  ) RETURNING id INTO v_recepcion_id;

  -- 4. Procesar renglones de mercadería
  FOR v_det IN SELECT * FROM jsonb_array_elements(p_detalles)
  LOOP
    v_articulo_id := (v_det->>'articulo_id')::UUID;
    v_lote_declarado := TRIM(COALESCE(NULLIF(v_det->>'lote_declarado', ''), v_lote_cabecera));
    
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

-- 4. Permisos
GRANT EXECUTE ON FUNCTION public.wms_crear_orden_recepcion(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
