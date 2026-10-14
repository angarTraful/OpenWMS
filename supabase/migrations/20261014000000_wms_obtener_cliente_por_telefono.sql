-- ==============================================================================
-- OPENWMS 3PL - RPC Y ENDPOINT SUPABASE: OBTENER CLIENTE POR TELÉFONO
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. ÍNDICES DE RENDIMIENTO PARA BÚSQUEDA POR TELÉFONO
-- Índice estándar para búsqueda exacta de texto
CREATE INDEX IF NOT EXISTS idx_clientes_telefono 
  ON public.clientes(telefono) 
  WHERE telefono IS NOT NULL;

-- Índice funcional sobre dígitos numéricos para búsqueda flexible acelerada
CREATE INDEX IF NOT EXISTS idx_clientes_telefono_digits 
  ON public.clientes (regexp_replace(telefono, '[^0-9]', '', 'g')) 
  WHERE telefono IS NOT NULL;

-- 2. PROCEDIMIENTO RPC: wms_obtener_cliente_por_telefono
-- Devuelve el objeto cliente completo en formato JSONB dado su número de teléfono.
-- Se marca como STABLE para permitir tanto llamadas POST como GET en PostgREST/Supabase.
CREATE OR REPLACE FUNCTION public.wms_obtener_cliente_por_telefono(
  p_telefono TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cliente public.clientes%ROWTYPE;
  v_clean_tel TEXT;
  v_digits TEXT;
BEGIN
  -- Validar entrada nula o vacía
  IF p_telefono IS NULL OR TRIM(p_telefono) = '' THEN
    RETURN NULL;
  END IF;

  v_clean_tel := TRIM(p_telefono);
  v_digits := regexp_replace(v_clean_tel, '[^0-9]', '', 'g');

  -- 1. Coincidencia exacta en la columna teléfono
  SELECT * INTO v_cliente
  FROM public.clientes
  WHERE telefono = v_clean_tel
  LIMIT 1;

  -- 2. Si no hubo coincidencia exacta y tenemos al menos 6 dígitos numéricos,
  -- buscar con tolerancia de formatos y códigos de área/país
  IF v_cliente.id IS NULL AND length(v_digits) >= 6 THEN
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits
       OR regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits
       OR v_digits LIKE '%' || regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g')
       OR regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
    ORDER BY
      CASE
        -- Prioridad 1: Coincidencia exacta de todos los dígitos
        WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') = v_digits THEN 1
        -- Prioridad 2: Termina con los dígitos (ej: +54 9 11 ... vs 11 ...)
        WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits THEN 2
        -- Prioridad 3: Subcadena
        ELSE 3
      END,
      activo DESC,
      creado_en DESC
    LIMIT 1;
  END IF;

  -- 3. Si no existe, retornar NULL
  IF v_cliente.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 4. Retornar el registro completo convertido a JSONB
  RETURN to_jsonb(v_cliente);
END;
$$;

-- 3. ALIAS DIRECTO RPC: obtener_cliente_por_telefono
-- Permite invocar la función tanto con prefijo wms_ como con el nombre plano
CREATE OR REPLACE FUNCTION public.obtener_cliente_por_telefono(
  p_telefono TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_cliente_por_telefono(p_telefono);
END;
$$;

-- 4. CONCESIÓN DE PRIVILEGIOS DE EJECUCIÓN (ACCESO DESDE CLIENTES Y REST DATA API)
GRANT EXECUTE ON FUNCTION public.wms_obtener_cliente_por_telefono(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_cliente_por_telefono(TEXT) TO anon, authenticated, service_role;

-- 5. DOCUMENTACIÓN DE METADATOS
COMMENT ON FUNCTION public.wms_obtener_cliente_por_telefono(TEXT) IS 
  'Busca y devuelve el objeto cliente en formato JSONB correspondiente al número de teléfono especificado.';

COMMENT ON FUNCTION public.obtener_cliente_por_telefono(TEXT) IS 
  'Alias de wms_obtener_cliente_por_telefono para consumo en la API de Supabase.';
