-- ==============================================================================
-- OPENWMS 3PL - RPC Y ENDPOINT SUPABASE: OBTENER STOCK CONSOLIDADO POR CLIENTE
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. ÍNDICE DE COBERTURA Y RENDIMIENTO
-- Optimiza consultas de inventario agrupadas por cliente y artículo
CREATE INDEX IF NOT EXISTS idx_inventario_cliente_articulo 
  ON public.inventario(cliente_id, articulo_id);

-- 2. PROCEDIMIENTO RPC: wms_obtener_stock_consolidado_por_cliente
-- Devuelve un objeto JSONB con el stock consolidado por artículo para un cliente.
-- Admite tanto el UUID del cliente como su código comercial o teléfono.
-- Se marca como STABLE para permitir invocación tanto por POST como por GET en PostgREST.
CREATE OR REPLACE FUNCTION public.wms_obtener_stock_consolidado_por_cliente(
  p_cliente_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cliente_uuid UUID := NULL;
  v_clean_id TEXT;
  v_digits TEXT;
  v_result JSONB;
BEGIN
  -- Validar entrada
  IF p_cliente_id IS NULL OR TRIM(p_cliente_id) = '' THEN
    RETURN '{}'::JSONB;
  END IF;

  v_clean_id := TRIM(p_cliente_id);

  -- 1. Si es formato UUID estándar, castearlo directamente
  IF v_clean_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_cliente_uuid := v_clean_id::UUID;
  ELSE
    -- 2. Resolver por código comercial o teléfono
    SELECT id INTO v_cliente_uuid
    FROM public.clientes
    WHERE codigo = v_clean_id
       OR telefono = v_clean_id
    LIMIT 1;

    -- Si no se halló por coincidencia exacta y contiene dígitos, buscar por dígitos telefónicos
    IF v_cliente_uuid IS NULL THEN
      v_digits := regexp_replace(v_clean_id, '[^0-9]', '', 'g');
      IF length(v_digits) >= 6 THEN
        SELECT id INTO v_cliente_uuid
        FROM public.clientes
        WHERE regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits
           OR regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits
           OR v_digits LIKE '%' || regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')
        ORDER BY
          CASE
            WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits THEN 1
            ELSE 2
          END
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- Si no se pudo resolver el cliente, devolver objeto vacío
  IF v_cliente_uuid IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  -- 3. Agrupar y consolidar existencias por artículo
  WITH stock_agrupado AS (
    SELECT 
      i.articulo_id,
      COALESCE(a.sku, '') AS sku,
      COALESCE(a.nombre, '') AS nombre,
      COALESCE(a.descripcion, '') AS descripcion,
      COALESCE(a.unidad_medida, i.unidad_medida, 'bulto') AS unidad_medida,
      ROUND(SUM(COALESCE(i.cantidad_disponible, 0)), 2) AS disponible,
      ROUND(SUM(COALESCE(i.cantidad_reservada, 0)), 2) AS reservado,
      ROUND(SUM(COALESCE(i.cantidad_disponible, 0) + COALESCE(i.cantidad_reservada, 0)), 2) AS total,
      ROUND(SUM(COALESCE(i.cantidad_disponible, 0) + COALESCE(i.cantidad_reservada, 0)), 2) AS stock_fisico,
      ROUND(SUM(COALESCE(i.cantidad_disponible, 0)), 2) AS stock_futuro,
      ROUND(SUM(COALESCE(i.volumen_m3, 0)), 4) AS volumen_m3_total
    FROM public.inventario i
    LEFT JOIN public.articulos a ON a.id = i.articulo_id
    WHERE i.cliente_id = v_cliente_uuid
    GROUP BY i.articulo_id, a.sku, a.nombre, a.descripcion, a.unidad_medida, i.unidad_medida
  )
  SELECT 
    COALESCE(
      jsonb_object_agg(
        s.articulo_id::TEXT,
        jsonb_build_object(
          'articulo_id', s.articulo_id,
          'sku', s.sku,
          'nombre', s.nombre,
          'descripcion', s.descripcion,
          'unidad_medida', s.unidad_medida,
          'disponible', s.disponible,
          'reservado', s.reservado,
          'total', s.total,
          'stockFisico', s.stock_fisico,
          'stockFuturo', s.stock_futuro,
          'volumenM3Total', s.volumen_m3_total
        )
      ),
      '{}'::JSONB
    )
  INTO v_result
  FROM stock_agrupado s;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

-- 3. ALIAS DIRECTO RPC: obtener_stock_consolidado_por_cliente
-- Permite invocar la función sin el prefijo wms_
CREATE OR REPLACE FUNCTION public.obtener_stock_consolidado_por_cliente(
  p_cliente_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_stock_consolidado_por_cliente(p_cliente_id);
END;
$$;

-- 4. CONCESIÓN DE PERMISOS DE EJECUCIÓN (ACCESO DESDE CLIENTES Y REST DATA API)
GRANT EXECUTE ON FUNCTION public.wms_obtener_stock_consolidado_por_cliente(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_stock_consolidado_por_cliente(TEXT) TO anon, authenticated, service_role;

-- 5. DOCUMENTACIÓN DE METADATOS
COMMENT ON FUNCTION public.wms_obtener_stock_consolidado_por_cliente(TEXT) IS 
  'Devuelve un JSONB con el stock consolidado (disponible, reservado, físico y futuro) por artículo para el cliente indicado (por ID UUID, código o teléfono).';

COMMENT ON FUNCTION public.obtener_stock_consolidado_por_cliente(TEXT) IS 
  'Alias de wms_obtener_stock_consolidado_por_cliente para consumo en la API de Supabase.';
