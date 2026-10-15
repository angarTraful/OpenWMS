-- ==============================================================================
-- MIGRACIÓN: 20261015020000_wms_importar_movimientos_inventario.sql
-- DESCRIPCIÓN: Procedimientos almacenados para procesar e importar movimientos de
--              inventario (Kardex) por CSV / JSON en lote, actualizando o generando
--              el stock físico en 'inventario' según el tipo de movimiento.
-- ==============================================================================

-- 1. Asegurar valores en tipo_movimiento_enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.tipo_movimiento_enum'::regtype 
      AND enumlabel = 'despacho'
  ) THEN
    ALTER TYPE public.tipo_movimiento_enum ADD VALUE 'despacho';
  END IF;
END $$;

-- 2. Función unitaria: wms_procesar_movimiento_inventario
CREATE OR REPLACE FUNCTION public.wms_procesar_movimiento_inventario(
  p_movimiento JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_param TEXT;
  v_articulo_param TEXT;
  v_tipo_param TEXT;
  v_tipo_normalizado TEXT;
  v_tipo_enum public.tipo_movimiento_enum;
  v_cantidad NUMERIC(14,2);
  v_lote_param TEXT;
  v_fecha_vencimiento DATE;
  v_ubic_orig_param TEXT;
  v_ubic_dest_param TEXT;
  v_almacen_param TEXT;
  v_pallet_param TEXT;
  v_doc_ref TEXT;
  v_notas TEXT;
  v_fecha_hora TIMESTAMPTZ;
  v_usuario_id UUID;

  -- Entidades resueltas
  v_cliente RECORD;
  v_articulo RECORD;
  v_lote_id UUID;
  v_pallet_id UUID;
  v_almacen_id UUID;
  v_ubic_orig RECORD;
  v_ubic_dest RECORD;

  -- Variables de cálculo
  v_volumen_unitario NUMERIC(14,4) := 0.0000;
  v_volumen_total NUMERIC(14,4) := 0.0000;
  v_inv_orig RECORD;
  v_inv_dest_id UUID;
  v_movimiento_id UUID;
BEGIN
  -- Extraer parámetros del JSON
  v_cliente_param := TRIM(COALESCE(p_movimiento->>'cliente_id', p_movimiento->>'cliente', p_movimiento->>'cliente_codigo', ''));
  v_articulo_param := TRIM(COALESCE(p_movimiento->>'articulo_id', p_movimiento->>'sku', p_movimiento->>'articulo', ''));
  v_tipo_param := LOWER(TRIM(COALESCE(p_movimiento->>'tipo_movimiento', p_movimiento->>'tipo', '')));
  v_cantidad := COALESCE((p_movimiento->>'cantidad')::NUMERIC, 0.0);
  v_lote_param := TRIM(COALESCE(p_movimiento->>'lote', p_movimiento->>'numero_lote', ''));
  v_fecha_vencimiento := NULLIF(TRIM(COALESCE(p_movimiento->>'fecha_vencimiento', '')), '')::DATE;
  v_ubic_orig_param := TRIM(COALESCE(p_movimiento->>'ubicacion_origen', p_movimiento->>'ubicacion_origen_id', p_movimiento->>'origen', ''));
  v_ubic_dest_param := TRIM(COALESCE(p_movimiento->>'ubicacion_destino', p_movimiento->>'ubicacion_destino_id', p_movimiento->>'destino', ''));
  v_almacen_param := TRIM(COALESCE(p_movimiento->>'almacen_id', p_movimiento->>'almacen', p_movimiento->>'almacen_codigo', ''));
  v_pallet_param := TRIM(COALESCE(p_movimiento->>'pallet', p_movimiento->>'codigo_lpn', p_movimiento->>'pallet_id', ''));
  v_doc_ref := NULLIF(TRIM(COALESCE(p_movimiento->>'documento_referencia', p_movimiento->>'referencia', '')), '');
  v_notas := NULLIF(TRIM(COALESCE(p_movimiento->>'notas', p_movimiento->>'observaciones', '')), '');
  v_fecha_hora := NULLIF(TRIM(COALESCE(p_movimiento->>'fecha_hora', '')), '')::TIMESTAMPTZ;

  IF p_movimiento->>'usuario_id' IS NOT NULL AND p_movimiento->>'usuario_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_usuario_id := (p_movimiento->>'usuario_id')::UUID;
  ELSE
    v_usuario_id := auth.uid();
  END IF;

  -- Validaciones básicas
  IF v_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad del movimiento debe ser estrictamente mayor a 0. Valor recibido: %', v_cantidad;
  END IF;

  -- 1. Normalizar Tipo de Movimiento
  CASE v_tipo_param
    WHEN 'recepcion', 'ingreso', 'ingreso_inicial', 'entrada' THEN
      v_tipo_normalizado := 'recepcion';
    WHEN 'ajuste_positivo', 'ajuste+', 'ajuste_pos', '+' THEN
      v_tipo_normalizado := 'ajuste_positivo';
    WHEN 'despacho', 'salida', 'egreso' THEN
      v_tipo_normalizado := 'despacho';
    WHEN 'ajuste_negativo', 'ajuste-', 'ajuste_neg', '-' THEN
      v_tipo_normalizado := 'ajuste_negativo';
    WHEN 'merma', 'scrap', 'baja', 'rotura' THEN
      v_tipo_normalizado := 'merma';
    WHEN 'transferencia', 'transferencia_interna', 'traslado', 'reubicacion' THEN
      v_tipo_normalizado := 'transferencia';
    WHEN 'putaway' THEN
      v_tipo_normalizado := 'putaway';
    WHEN 'picking' THEN
      v_tipo_normalizado := 'picking';
    WHEN 'despaletizado' THEN
      v_tipo_normalizado := 'despaletizado';
    WHEN 'paletizado_despacho' THEN
      v_tipo_normalizado := 'paletizado_despacho';
    ELSE
      RAISE EXCEPTION 'Tipo de movimiento inválido o desconocido: "%". Tipos permitidos: recepcion, ajuste_positivo, despacho, ajuste_negativo, merma, transferencia, putaway, picking', v_tipo_param;
  END CASE;

  v_tipo_enum := v_tipo_normalizado::public.tipo_movimiento_enum;

  -- 2. Resolver Cliente
  IF v_cliente_param = '' THEN
    RAISE EXCEPTION 'Debe especificarse el cliente (código, razón social o ID).';
  END IF;

  IF v_cliente_param ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_cliente FROM public.clientes WHERE id = v_cliente_param::UUID;
  ELSE
    SELECT * INTO v_cliente FROM public.clientes
    WHERE LOWER(codigo) = LOWER(v_cliente_param)
       OR LOWER(razon_social) = LOWER(v_cliente_param)
       OR telefono = v_cliente_param
    LIMIT 1;
  END IF;

  IF v_cliente.id IS NULL THEN
    RAISE EXCEPTION 'Cliente no encontrado en el sistema: "%"', v_cliente_param;
  END IF;

  -- 3. Resolver Artículo
  IF v_articulo_param = '' THEN
    RAISE EXCEPTION 'Debe especificarse el artículo (SKU, código de barras, nombre o ID).';
  END IF;

  IF v_articulo_param ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_articulo FROM public.articulos
    WHERE id = v_articulo_param::UUID AND cliente_id = v_cliente.id;
  ELSE
    SELECT * INTO v_articulo FROM public.articulos
    WHERE cliente_id = v_cliente.id
      AND (
        LOWER(sku) = LOWER(v_articulo_param)
        OR codigo_barras = v_articulo_param
        OR LOWER(nombre) = LOWER(v_articulo_param)
      )
    LIMIT 1;
  END IF;

  IF v_articulo.id IS NULL THEN
    RAISE EXCEPTION 'Artículo "%" no encontrado para el cliente "%" (%)', v_articulo_param, v_cliente.razon_social, v_cliente.codigo;
  END IF;

  -- Volumen unitario y total
  v_volumen_unitario := COALESCE(v_articulo.volumen_unitario_m3, 0.0000);
  v_volumen_total := ROUND(v_cantidad * v_volumen_unitario, 4);

  -- 4. Resolver o Crear Lote
  IF v_lote_param = '' THEN
    v_lote_param := 'LOTE-GENERAL';
  END IF;

  SELECT id INTO v_lote_id FROM public.lotes_cliente
  WHERE cliente_id = v_cliente.id AND LOWER(numero_lote) = LOWER(v_lote_param)
  LIMIT 1;

  IF v_lote_id IS NULL THEN
    INSERT INTO public.lotes_cliente (
      cliente_id, numero_lote, fecha_vencimiento
    ) VALUES (
      v_cliente.id, v_lote_param, v_fecha_vencimiento
    ) RETURNING id INTO v_lote_id;
  END IF;

  -- 5. Resolver o Crear Pallet LPN (si se especifica)
  IF v_pallet_param <> '' THEN
    IF v_pallet_param ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_pallet_id FROM public.pallets_lpn WHERE id = v_pallet_param::UUID;
    ELSE
      SELECT id INTO v_pallet_id FROM public.pallets_lpn
      WHERE cliente_id = v_cliente.id AND LOWER(codigo_lpn) = LOWER(v_pallet_param)
      LIMIT 1;
    END IF;

    IF v_pallet_id IS NULL THEN
      INSERT INTO public.pallets_lpn (
        cliente_id, codigo_lpn, volumen_total_m3, peso_total_kg, estado
      ) VALUES (
        v_cliente.id, v_pallet_param, v_volumen_total, ROUND(v_cantidad * COALESCE(v_articulo.peso_unitario_kg, 1), 3), 'en_stock'
      ) RETURNING id INTO v_pallet_id;
    END IF;
  ELSE
    v_pallet_id := NULL;
  END IF;

  -- 6. Resolver Ubicación Origen
  IF v_ubic_orig_param <> '' THEN
    IF v_ubic_orig_param ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO v_ubic_orig FROM public.ubicaciones WHERE id = v_ubic_orig_param::UUID;
    ELSE
      SELECT * INTO v_ubic_orig FROM public.ubicaciones WHERE LOWER(codigo_etiqueta) = LOWER(v_ubic_orig_param) LIMIT 1;
    END IF;

    IF v_ubic_orig.id IS NULL THEN
      RAISE EXCEPTION 'Ubicación de origen "%" no encontrada.', v_ubic_orig_param;
    END IF;
  END IF;

  -- 7. Resolver Ubicación Destino
  IF v_ubic_dest_param <> '' THEN
    IF v_ubic_dest_param ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO v_ubic_dest FROM public.ubicaciones WHERE id = v_ubic_dest_param::UUID;
    ELSE
      SELECT * INTO v_ubic_dest FROM public.ubicaciones WHERE LOWER(codigo_etiqueta) = LOWER(v_ubic_dest_param) LIMIT 1;
    END IF;

    IF v_ubic_dest.id IS NULL THEN
      RAISE EXCEPTION 'Ubicación de destino "%" no encontrada.', v_ubic_dest_param;
    END IF;
  END IF;

  -- 8. Resolver Almacén
  IF v_almacen_param <> '' THEN
    IF v_almacen_param ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_almacen_id FROM public.almacenes WHERE id = v_almacen_param::UUID;
    ELSE
      SELECT id INTO v_almacen_id FROM public.almacenes WHERE LOWER(codigo) = LOWER(v_almacen_param) LIMIT 1;
    END IF;
  END IF;

  IF v_almacen_id IS NULL THEN
    v_almacen_id := COALESCE(v_ubic_dest.almacen_id, v_ubic_orig.almacen_id);
  END IF;

  IF v_almacen_id IS NULL THEN
    SELECT id INTO v_almacen_id FROM public.almacenes WHERE activo = true ORDER BY creado_en ASC LIMIT 1;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un almacén activo para registrar el movimiento.';
  END IF;

  -- ==============================================================================
  -- PROCESAMIENTO SEGÚN EL TIPO DE MOVIMIENTO
  -- ==============================================================================

  -- A. ENTRADAS: recepcion, ajuste_positivo
  IF v_tipo_normalizado IN ('recepcion', 'ajuste_positivo') THEN
    IF v_ubic_dest.id IS NULL THEN
      -- Si no se indicó destino, buscar la ubicación de recepción por defecto o primera disponible
      SELECT * INTO v_ubic_dest 
      FROM public.ubicaciones 
      WHERE almacen_id = v_almacen_id 
        AND (LOWER(codigo_etiqueta) LIKE '%recep%' OR LOWER(codigo_etiqueta) LIKE '%playa%')
      LIMIT 1;

      IF v_ubic_dest.id IS NULL THEN
        SELECT * INTO v_ubic_dest FROM public.ubicaciones WHERE almacen_id = v_almacen_id LIMIT 1;
      END IF;

      IF v_ubic_dest.id IS NULL THEN
        RAISE EXCEPTION 'Se requiere una ubicación de destino válida para registrar la entrada.';
      END IF;
    END IF;

    -- Actualizar o insertar existencia en inventario
    SELECT id INTO v_inv_dest_id
    FROM public.inventario
    WHERE cliente_id = v_cliente.id
      AND lote_id = v_lote_id
      AND articulo_id = v_articulo.id
      AND almacen_id = v_almacen_id
      AND ubicacion_id = v_ubic_dest.id
      AND (pallet_id IS NOT DISTINCT FROM v_pallet_id)
    FOR UPDATE;

    IF v_inv_dest_id IS NOT NULL THEN
      UPDATE public.inventario
      SET cantidad_disponible = cantidad_disponible + v_cantidad,
          volumen_m3 = volumen_m3 + v_volumen_total,
          actualizado_en = clock_timestamp()
      WHERE id = v_inv_dest_id;
    ELSE
      INSERT INTO public.inventario (
        cliente_id, lote_id, articulo_id, almacen_id, ubicacion_id, pallet_id,
        cantidad_disponible, cantidad_reservada, volumen_m3, unidad_medida
      ) VALUES (
        v_cliente.id, v_lote_id, v_articulo.id, v_almacen_id, v_ubic_dest.id, v_pallet_id,
        v_cantidad, 0.00, v_volumen_total, COALESCE(v_articulo.unidad_medida, 'bulto')
      ) RETURNING id INTO v_inv_dest_id;
    END IF;

  -- B. SALIDAS: despacho, ajuste_negativo, merma
  ELSIF v_tipo_normalizado IN ('despacho', 'ajuste_negativo', 'merma') THEN
    IF v_ubic_orig.id IS NULL THEN
      -- Buscar la primera ubicación donde el artículo y lote tengan stock disponible
      SELECT i.ubicacion_id, u.codigo_etiqueta, u.almacen_id INTO v_ubic_orig
      FROM public.inventario i
      JOIN public.ubicaciones u ON u.id = i.ubicacion_id
      WHERE i.cliente_id = v_cliente.id
        AND i.lote_id = v_lote_id
        AND i.articulo_id = v_articulo.id
        AND i.cantidad_disponible >= v_cantidad
      ORDER BY i.cantidad_disponible DESC
      LIMIT 1;

      IF v_ubic_orig.id IS NULL THEN
        RAISE EXCEPTION 'Debe indicarse la ubicación de origen para la salida (Stock insuficiente o producto inexistente).';
      END IF;
    END IF;

    -- Buscar registro en origen y bloquearlo
    SELECT * INTO v_inv_orig
    FROM public.inventario
    WHERE cliente_id = v_cliente.id
      AND lote_id = v_lote_id
      AND articulo_id = v_articulo.id
      AND ubicacion_id = v_ubic_orig.id
      AND (v_pallet_id IS NULL OR pallet_id = v_pallet_id)
    FOR UPDATE;

    IF v_inv_orig.id IS NULL THEN
      RAISE EXCEPTION 'No se encontró stock en la ubicación % para el artículo % y lote %', 
        v_ubic_orig.codigo_etiqueta, v_articulo.sku, v_lote_param;
    END IF;

    IF v_inv_orig.cantidad_disponible < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en la ubicación %. Disponible: %, Solicitado para salida: %',
        v_ubic_orig.codigo_etiqueta, v_inv_orig.cantidad_disponible, v_cantidad;
    END IF;

    -- Descontar existencia
    IF (v_inv_orig.cantidad_disponible = v_cantidad) AND (v_inv_orig.cantidad_reservada = 0) THEN
      DELETE FROM public.inventario WHERE id = v_inv_orig.id;
    ELSE
      UPDATE public.inventario
      SET cantidad_disponible = cantidad_disponible - v_cantidad,
          volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_total),
          actualizado_en = clock_timestamp()
      WHERE id = v_inv_orig.id;
    END IF;

  -- C. TRASLADOS Y REUBICACIONES: transferencia, putaway, picking, despaletizado, paletizado_despacho
  ELSE
    IF v_ubic_orig.id IS NULL THEN
      RAISE EXCEPTION 'Se requiere ubicación de origen para transferir o reubicar inventario.';
    END IF;
    IF v_ubic_dest.id IS NULL THEN
      RAISE EXCEPTION 'Se requiere ubicación de destino para transferir o reubicar inventario.';
    END IF;
    IF v_ubic_orig.id = v_ubic_dest.id THEN
      RAISE EXCEPTION 'La ubicación de origen y destino no pueden ser iguales (%).', v_ubic_orig.codigo_etiqueta;
    END IF;

    -- 1. Descontar en origen
    SELECT * INTO v_inv_orig
    FROM public.inventario
    WHERE cliente_id = v_cliente.id
      AND lote_id = v_lote_id
      AND articulo_id = v_articulo.id
      AND ubicacion_id = v_ubic_orig.id
      AND (v_pallet_id IS NULL OR pallet_id = v_pallet_id)
    FOR UPDATE;

    IF v_inv_orig.id IS NULL THEN
      RAISE EXCEPTION 'No se encontró stock en la ubicación de origen % para el artículo % y lote %',
        v_ubic_orig.codigo_etiqueta, v_articulo.sku, v_lote_param;
    END IF;

    IF v_inv_orig.cantidad_disponible < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en origen %. Disponible: %, Solicitado: %',
        v_ubic_orig.codigo_etiqueta, v_inv_orig.cantidad_disponible, v_cantidad;
    END IF;

    IF (v_inv_orig.cantidad_disponible = v_cantidad) AND (v_inv_orig.cantidad_reservada = 0) THEN
      DELETE FROM public.inventario WHERE id = v_inv_orig.id;
    ELSE
      UPDATE public.inventario
      SET cantidad_disponible = cantidad_disponible - v_cantidad,
          volumen_m3 = GREATEST(0.0000, volumen_m3 - v_volumen_total),
          actualizado_en = clock_timestamp()
      WHERE id = v_inv_orig.id;
    END IF;

    -- 2. Incrementar en destino
    SELECT id INTO v_inv_dest_id
    FROM public.inventario
    WHERE cliente_id = v_cliente.id
      AND lote_id = v_lote_id
      AND articulo_id = v_articulo.id
      AND almacen_id = v_ubic_dest.almacen_id
      AND ubicacion_id = v_ubic_dest.id
      AND (pallet_id IS NOT DISTINCT FROM v_pallet_id)
    FOR UPDATE;

    IF v_inv_dest_id IS NOT NULL THEN
      UPDATE public.inventario
      SET cantidad_disponible = cantidad_disponible + v_cantidad,
          volumen_m3 = volumen_m3 + v_volumen_total,
          actualizado_en = clock_timestamp()
      WHERE id = v_inv_dest_id;
    ELSE
      INSERT INTO public.inventario (
        cliente_id, lote_id, articulo_id, almacen_id, ubicacion_id, pallet_id,
        cantidad_disponible, cantidad_reservada, volumen_m3, unidad_medida
      ) VALUES (
        v_cliente.id, v_lote_id, v_articulo.id, v_ubic_dest.almacen_id, v_ubic_dest.id, v_pallet_id,
        v_cantidad, 0.00, v_volumen_total, COALESCE(v_articulo.unidad_medida, 'bulto')
      ) RETURNING id INTO v_inv_dest_id;
    END IF;
  END IF;

  -- ==============================================================================
  -- REGISTRO INMUTABLE EN KARDEX (movimientos_inventario)
  -- ==============================================================================
  INSERT INTO public.movimientos_inventario (
    cliente_id,
    lote_id,
    articulo_id,
    pallet_id,
    ubicacion_origen_id,
    ubicacion_destino_id,
    tipo_movimiento,
    cantidad,
    volumen_m3,
    documento_referencia,
    usuario_id,
    notas,
    fecha_hora
  ) VALUES (
    v_cliente.id,
    v_lote_id,
    v_articulo.id,
    v_pallet_id,
    v_ubic_orig.id,
    v_ubic_dest.id,
    v_tipo_enum,
    v_cantidad,
    v_volumen_total,
    v_doc_ref,
    v_usuario_id,
    v_notas,
    COALESCE(v_fecha_hora, clock_timestamp())
  ) RETURNING id INTO v_movimiento_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimiento_id', v_movimiento_id,
    'tipo_movimiento', v_tipo_normalizado,
    'cliente_id', v_cliente.id,
    'cliente_codigo', v_cliente.codigo,
    'articulo_id', v_articulo.id,
    'sku', v_articulo.sku,
    'articulo_nombre', v_articulo.nombre,
    'lote_id', v_lote_id,
    'lote_numero', v_lote_param,
    'cantidad', v_cantidad,
    'volumen_m3', v_volumen_total,
    'ubicacion_origen_id', v_ubic_orig.id,
    'ubicacion_origen', v_ubic_orig.codigo_etiqueta,
    'ubicacion_destino_id', v_ubic_dest.id,
    'ubicacion_destino', v_ubic_dest.codigo_etiqueta,
    'pallet_id', v_pallet_id,
    'documento_referencia', v_doc_ref
  );
END;
$$;

-- 3. Función batch: wms_importar_movimientos_inventario
CREATE OR REPLACE FUNCTION public.wms_importar_movimientos_inventario(
  p_movimientos JSONB,
  p_ignorar_errores BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_procesados INT := 0;
  v_fallidos INT := 0;
  v_elem JSONB;
  v_idx INT := 0;
  v_res JSONB;
  v_resultados JSONB := '[]'::JSONB;
  v_errores JSONB := '[]'::JSONB;
BEGIN
  IF p_movimientos IS NULL OR jsonb_typeof(p_movimientos) <> 'array' THEN
    RAISE EXCEPTION 'El parámetro p_movimientos debe ser un arreglo JSON de movimientos.';
  END IF;

  v_total := jsonb_array_length(p_movimientos);
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'total', 0,
      'procesados', 0,
      'fallidos', 0,
      'resultados', '[]'::JSONB,
      'errores', '[]'::JSONB
    );
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_movimientos)
  LOOP
    v_idx := v_idx + 1;
    IF p_ignorar_errores THEN
      BEGIN
        v_res := public.wms_procesar_movimiento_inventario(v_elem);
        v_procesados := v_procesados + 1;
        v_resultados := v_resultados || jsonb_build_array(v_res);
      EXCEPTION WHEN OTHERS THEN
        v_fallidos := v_fallidos + 1;
        v_errores := v_errores || jsonb_build_array(jsonb_build_object(
          'fila', v_idx,
          'datos', v_elem,
          'error', SQLERRM
        ));
      END;
    ELSE
      -- Modo transaccional estricto: ante cualquier error se eleva y cancela todo
      BEGIN
        v_res := public.wms_procesar_movimiento_inventario(v_elem);
        v_procesados := v_procesados + 1;
        v_resultados := v_resultados || jsonb_build_array(v_res);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Error en fila % (SKU: %, Tipo: %): %', 
          v_idx, 
          COALESCE(v_elem->>'sku', v_elem->>'articulo', 'N/A'), 
          COALESCE(v_elem->>'tipo_movimiento', v_elem->>'tipo', 'N/A'),
          SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (v_fallidos = 0),
    'total', v_total,
    'procesados', v_procesados,
    'fallidos', v_fallidos,
    'resultados', v_resultados,
    'errores', v_errores
  );
END;
$$;

-- 4. Permisos
GRANT EXECUTE ON FUNCTION public.wms_procesar_movimiento_inventario(JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.wms_importar_movimientos_inventario(JSONB, BOOLEAN) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.wms_procesar_movimiento_inventario(JSONB) IS 'Procesa un movimiento de inventario individual, validando o generando stock físico en inventario y asiento en movimientos_inventario.';
COMMENT ON FUNCTION public.wms_importar_movimientos_inventario(JSONB, BOOLEAN) IS 'Importa una lista masiva de movimientos de inventario en lote con opción de tolerancia a fallos por fila o rollback total.';
