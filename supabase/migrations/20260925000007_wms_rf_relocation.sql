-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: MÓDULO TERMINAL RF (REUBICACIÓN & CONSULTA LIBRE)
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. PROCEDIMIENTO RPC: REUBICACIÓN INTERNA DE STOCK ENTRE RACKS
CREATE OR REPLACE FUNCTION public.wms_reubicar_stock(
  p_inventario_id UUID DEFAULT NULL,
  p_pallet_id UUID DEFAULT NULL,
  p_ubicacion_destino_id UUID DEFAULT NULL,
  p_cantidad_mover NUMERIC DEFAULT NULL,
  p_usuario_nombre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ubic_dest RECORD;
  v_pallet RECORD;
  v_inv RECORD;
  v_articulo RECORD;
  v_cant_a_mover NUMERIC;
  v_volumen_movido NUMERIC(14,4);
  v_inv_dest_id UUID;
  v_filas_afectadas INT := 0;
BEGIN
  -- 1. Validar ubicación destino
  SELECT * INTO v_ubic_dest
  FROM public.ubicaciones
  WHERE id = p_ubicacion_destino_id;

  IF v_ubic_dest.id IS NULL THEN
    RAISE EXCEPTION 'Ubicación de destino no encontrada.';
  END IF;

  IF v_ubic_dest.estado = 'bloqueada' THEN
    RAISE EXCEPTION 'La ubicación de destino % se encuentra bloqueada.', v_ubic_dest.codigo_etiqueta;
  END IF;

  -- ============================================================================
  -- CASO A: REUBICACIÓN DE PALLET LPN COMPLETO
  -- ============================================================================
  IF p_pallet_id IS NOT NULL AND p_inventario_id IS NULL THEN
    SELECT * INTO v_pallet
    FROM public.pallets_lpn
    WHERE id = p_pallet_id;

    IF v_pallet.id IS NULL THEN
      RAISE EXCEPTION 'Pallet LPN no encontrado.';
    END IF;

    -- Registrar movimientos en Kardex para cada línea de inventario del pallet
    FOR v_inv IN
      SELECT i.*, a.volumen_unitario_m3
      FROM public.inventario i
      JOIN public.articulos a ON a.id = i.articulo_id
      WHERE i.pallet_id = p_pallet_id
    LOOP
      INSERT INTO public.movimientos_inventario (
        cliente_id, lote_id, articulo_id, pallet_id,
        ubicacion_origen_id, ubicacion_destino_id,
        tipo_movimiento, cantidad, volumen_m3,
        documento_referencia, usuario_id, notas
      ) VALUES (
        v_inv.cliente_id, v_inv.lote_id, v_inv.articulo_id, p_pallet_id,
        v_inv.ubicacion_id, p_ubicacion_destino_id,
        'transferencia_interna', v_inv.cantidad_disponible, v_inv.volumen_m3,
        'RF-REUB-PALLET-' || v_pallet.codigo_lpn, (SELECT auth.uid()),
        'Reubicación de pallet LPN por operario: ' || COALESCE(p_usuario_nombre, 'Operario RF')
      );
      v_filas_afectadas := v_filas_afectadas + 1;
    END LOOP;

    -- Actualizar ubicación de todas las existencias del pallet
    UPDATE public.inventario
    SET ubicacion_id = p_ubicacion_destino_id,
        actualizado_en = clock_timestamp()
    WHERE pallet_id = p_pallet_id;

    RETURN jsonb_build_object(
      'success', true,
      'modo', 'pallet_completo',
      'codigo_lpn', v_pallet.codigo_lpn,
      'ubicacion_destino', v_ubic_dest.codigo_etiqueta,
      'filas_movidas', v_filas_afectadas,
      'mensaje', 'Pallet ' || v_pallet.codigo_lpn || ' reubicado exitosamente a ' || v_ubic_dest.codigo_etiqueta
    );
  END IF;

  -- ============================================================================
  -- CASO B: REUBICACIÓN PARCIAL O TOTAL DE BULTO/ITEM ESPECÍFICO
  -- ============================================================================
  IF p_inventario_id IS NOT NULL THEN
    SELECT * INTO v_inv
    FROM public.inventario
    WHERE id = p_inventario_id;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'Registro de inventario no encontrado.';
    END IF;

    SELECT * INTO v_articulo
    FROM public.articulos
    WHERE id = v_inv.articulo_id;

    v_cant_a_mover := COALESCE(p_cantidad_mover, v_inv.cantidad_disponible);

    IF v_cant_a_mover <= 0 THEN
      RAISE EXCEPTION 'La cantidad a transferir debe ser mayor a 0.';
    END IF;

    IF v_cant_a_mover > v_inv.cantidad_disponible THEN
      RAISE EXCEPTION 'Stock insuficiente para transferir. Disponible: %, Solicitado: %', 
        v_inv.cantidad_disponible, v_cant_a_mover;
    END IF;

    v_volumen_movido := ROUND(v_cant_a_mover * v_articulo.volumen_unitario_m3, 4);

    -- Descontar en origen
    IF v_cant_a_mover = v_inv.cantidad_disponible AND v_inv.cantidad_reservada = 0 THEN
      -- Se movió todo el registro
      DELETE FROM public.inventario WHERE id = p_inventario_id;
    ELSE
      UPDATE public.inventario
      SET cantidad_disponible = cantidad_disponible - v_cant_a_mover,
          volumen_m3 = volumen_m3 - v_volumen_movido,
          actualizado_en = clock_timestamp()
      WHERE id = p_inventario_id;
    END IF;

    -- Insertar o actualizar en destino
    SELECT id INTO v_inv_dest_id
    FROM public.inventario
    WHERE cliente_id = v_inv.cliente_id
      AND lote_id = v_inv.lote_id
      AND articulo_id = v_inv.articulo_id
      AND almacen_id = v_ubic_dest.almacen_id
      AND ubicacion_id = p_ubicacion_destino_id
      AND (pallet_id IS NOT DISTINCT FROM v_inv.pallet_id);

    IF v_inv_dest_id IS NOT NULL THEN
      UPDATE public.inventario
      SET cantidad_disponible = cantidad_disponible + v_cant_a_mover,
          volumen_m3 = volumen_m3 + v_volumen_movido,
          actualizado_en = clock_timestamp()
      WHERE id = v_inv_dest_id;
    ELSE
      INSERT INTO public.inventario (
        cliente_id, lote_id, articulo_id, almacen_id, ubicacion_id, pallet_id,
        cantidad_disponible, cantidad_reservada, volumen_m3, unidad_medida
      ) VALUES (
        v_inv.cliente_id, v_inv.lote_id, v_inv.articulo_id, v_ubic_dest.almacen_id, p_ubicacion_destino_id, v_inv.pallet_id,
        v_cant_a_mover, 0.00, v_volumen_movido, v_inv.unidad_medida
      );
    END IF;

    -- Registrar Kardex
    INSERT INTO public.movimientos_inventario (
      cliente_id, lote_id, articulo_id, pallet_id,
      ubicacion_origen_id, ubicacion_destino_id,
      tipo_movimiento, cantidad, volumen_m3,
      documento_referencia, usuario_id, notas
    ) VALUES (
      v_inv.cliente_id, v_inv.lote_id, v_inv.articulo_id, v_inv.pallet_id,
      v_inv.ubicacion_id, p_ubicacion_destino_id,
      'transferencia_interna', v_cant_a_mover, v_volumen_movido,
      'RF-REUB-MANUAL', (SELECT auth.uid()),
      'Transferencia parcial por: ' || COALESCE(p_usuario_nombre, 'Operario RF')
    );

    RETURN jsonb_build_object(
      'success', true,
      'modo', 'parcial',
      'articulo', v_articulo.nombre,
      'sku', v_articulo.sku,
      'cantidad_movida', v_cant_a_mover,
      'volumen_m3', v_volumen_movido,
      'ubicacion_destino', v_ubic_dest.codigo_etiqueta,
      'mensaje', 'Se reubicaron ' || v_cant_a_mover || ' bultos a ' || v_ubic_dest.codigo_etiqueta
    );
  END IF;

  RAISE EXCEPTION 'Debe proporcionar inventario_id o pallet_id para reubicar.';
END;
$$;


-- 2. PROCEDIMIENTO RPC: CONSULTA LIBRE RF (INQUIRY DE LPN, UBICACIÓN O SKU)
CREATE OR REPLACE FUNCTION public.wms_rf_consulta_libre(
  p_codigo TEXT,
  p_almacen_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_codigo_clean TEXT;
  v_ubicacion RECORD;
  v_pallet RECORD;
  v_articulo RECORD;
  v_items JSONB;
BEGIN
  v_codigo_clean := TRIM(p_codigo);

  -- A. Buscar si es una Ubicación de Rack
  SELECT u.*, a.nombre AS almacen_nombre, z.nombre AS zona_nombre
  INTO v_ubicacion
  FROM public.ubicaciones u
  JOIN public.almacenes a ON a.id = u.almacen_id
  LEFT JOIN public.zonas z ON z.id = u.zona_id
  WHERE UPPER(u.codigo_etiqueta) = UPPER(v_codigo_clean)
    AND (p_almacen_id IS NULL OR u.almacen_id = p_almacen_id)
  LIMIT 1;

  IF v_ubicacion.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'inventario_id', i.id,
        'cantidad_disponible', i.cantidad_disponible,
        'cantidad_reservada', i.cantidad_reservada,
        'volumen_m3', i.volumen_m3,
        'unidad_medida', i.unidad_medida,
        'cliente_codigo', c.codigo,
        'cliente_razon_social', c.razon_social,
        'sku', art.sku,
        'articulo_nombre', art.nombre,
        'lote_numero', l.numero_lote,
        'lote_vencimiento', l.fecha_vencimiento,
        'lpn_codigo', p.codigo_lpn
      )
    ), '[]'::jsonb)
    INTO v_items
    FROM public.inventario i
    JOIN public.clientes c ON c.id = i.cliente_id
    JOIN public.articulos art ON art.id = i.articulo_id
    LEFT JOIN public.lotes_cliente l ON l.id = i.lote_id
    LEFT JOIN public.pallets_lpn p ON p.id = i.pallet_id
    WHERE i.ubicacion_id = v_ubicacion.id;

    RETURN jsonb_build_object(
      'encontrado', true,
      'tipo', 'ubicacion',
      'ubicacion', jsonb_build_object(
        'id', v_ubicacion.id,
        'codigo_etiqueta', v_ubicacion.codigo_etiqueta,
        'pasillo', v_ubicacion.pasillo,
        'estante', v_ubicacion.estante,
        'nivel', v_ubicacion.nivel,
        'estado', v_ubicacion.estado,
        'capacidad_volumen_m3', v_ubicacion.capacidad_volumen_m3,
        'almacen_nombre', v_ubicacion.almacen_nombre,
        'zona_nombre', v_ubicacion.zona_nombre
      ),
      'items', v_items
    );
  END IF;

  -- B. Buscar si es un Pallet LPN
  SELECT p.*, c.codigo AS cliente_codigo, c.razon_social AS cliente_razon_social
  INTO v_pallet
  FROM public.pallets_lpn p
  JOIN public.clientes c ON c.id = p.cliente_id
  WHERE UPPER(p.codigo_lpn) = UPPER(v_codigo_clean)
  LIMIT 1;

  IF v_pallet.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'inventario_id', i.id,
        'cantidad_disponible', i.cantidad_disponible,
        'volumen_m3', i.volumen_m3,
        'sku', art.sku,
        'articulo_nombre', art.nombre,
        'lote_numero', l.numero_lote,
        'lote_vencimiento', l.fecha_vencimiento,
        'ubicacion_codigo', u.codigo_etiqueta,
        'almacen_nombre', alm.nombre
      )
    ), '[]'::jsonb)
    INTO v_items
    FROM public.inventario i
    JOIN public.articulos art ON art.id = i.articulo_id
    LEFT JOIN public.lotes_cliente l ON l.id = i.lote_id
    LEFT JOIN public.ubicaciones u ON u.id = i.ubicacion_id
    LEFT JOIN public.almacenes alm ON alm.id = i.almacen_id
    WHERE i.pallet_id = v_pallet.id;

    RETURN jsonb_build_object(
      'encontrado', true,
      'tipo', 'pallet',
      'pallet', jsonb_build_object(
        'id', v_pallet.id,
        'codigo_lpn', v_pallet.codigo_lpn,
        'estado', v_pallet.estado,
        'peso_total_kg', v_pallet.peso_total_kg,
        'volumen_total_m3', v_pallet.volumen_total_m3,
        'cliente_codigo', v_pallet.cliente_codigo,
        'cliente_razon_social', v_pallet.cliente_razon_social
      ),
      'items', v_items
    );
  END IF;

  -- C. Buscar si es un Artículo por SKU o Código de Barras
  SELECT a.*, c.codigo AS cliente_codigo, c.razon_social AS cliente_razon_social
  INTO v_articulo
  FROM public.articulos a
  JOIN public.clientes c ON c.id = a.cliente_id
  WHERE UPPER(a.sku) = UPPER(v_codigo_clean)
     OR a.codigo_barras = v_codigo_clean
  LIMIT 1;

  IF v_articulo.id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'inventario_id', i.id,
        'cantidad_disponible', i.cantidad_disponible,
        'volumen_m3', i.volumen_m3,
        'lote_numero', l.numero_lote,
        'lote_vencimiento', l.fecha_vencimiento,
        'lpn_codigo', p.codigo_lpn,
        'ubicacion_codigo', u.codigo_etiqueta,
        'almacen_nombre', alm.nombre
      )
    ), '[]'::jsonb)
    INTO v_items
    FROM public.inventario i
    LEFT JOIN public.lotes_cliente l ON l.id = i.lote_id
    LEFT JOIN public.pallets_lpn p ON p.id = i.pallet_id
    LEFT JOIN public.ubicaciones u ON u.id = i.ubicacion_id
    LEFT JOIN public.almacenes alm ON alm.id = i.almacen_id
    WHERE i.articulo_id = v_articulo.id
      AND (p_almacen_id IS NULL OR i.almacen_id = p_almacen_id);

    RETURN jsonb_build_object(
      'encontrado', true,
      'tipo', 'articulo',
      'articulo', jsonb_build_object(
        'id', v_articulo.id,
        'sku', v_articulo.sku,
        'nombre', v_articulo.nombre,
        'codigo_barras', v_articulo.codigo_barras,
        'unidad_medida', v_articulo.unidad_medida,
        'peso_unitario_kg', v_articulo.peso_unitario_kg,
        'volumen_unitario_m3', v_articulo.volumen_unitario_m3,
        'cliente_codigo', v_articulo.cliente_codigo,
        'cliente_razon_social', v_articulo.cliente_razon_social
      ),
      'stock_ubicaciones', v_items
    );
  END IF;

  RETURN jsonb_build_object(
    'encontrado', false,
    'codigo_buscado', v_codigo_clean,
    'mensaje', 'No se encontró ninguna Ubicación, Pallet LPN o Artículo con el código ' || v_codigo_clean
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.wms_reubicar_stock TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_rf_consulta_libre TO anon, authenticated, service_role;
