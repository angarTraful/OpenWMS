-- ==============================================================================
-- OPENWMS 3PL - RPC Y ENDPOINT SUPABASE: OBTENER CLIENTES POR ID / CODIGOS
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. ÍNDICES DE RENDIMIENTO PARA BÚSQUEDA DE CLIENTES
-- Asegura acceso veloz por código de cliente comercial
CREATE INDEX IF NOT EXISTS idx_clientes_codigo 
  ON public.clientes(codigo);

-- 2. PROCEDIMIENTO RPC: wms_obtener_clientes_por_id
-- Devuelve un array JSONB con los clientes asociados a los IDs o códigos provistos.
-- Diseñado específicamente para recibir como entrada:
--   a) El objeto JSON completo retornado por 'obtener_usuario_por_telefono' (que contiene clientes_ids).
--   b) El array 'clientes_ids' directo: ej. ["001", "002"] o ["000"].
--   c) Un único ID o código en string: ej. "000", "CLI01", o un UUID.
--
-- Reglas de negocio:
--   * Si 'clientes_ids' contiene '000', retorna TODOS los clientes depositantes.
--   * Resuelve tanto por 'codigo' comercial como por 'id' (UUID).
--   * Admite parámetro opcional p_solo_activos (por defecto false).
--   * Se marca como STABLE y SECURITY DEFINER con search_path limpio para
--     permitir ejecución segura desde el Bot / anon / authenticated / service_role.
CREATE OR REPLACE FUNCTION public.wms_obtener_clientes_por_id(
  p_clientes_ids JSONB DEFAULT NULL,
  p_solo_activos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_json JSONB := p_clientes_ids;
  v_ids TEXT[] := ARRAY[]::TEXT[];
  v_uuids UUID[] := ARRAY[]::UUID[];
  v_codigos TEXT[] := ARRAY[]::TEXT[];
  v_tiene_todos BOOLEAN := FALSE;
  v_solo_activos BOOLEAN := COALESCE(p_solo_activos, false);
  v_elem JSONB;
  v_elem_str TEXT;
  v_res JSONB;
BEGIN
  -- Validar entrada nula o vacía
  IF v_raw_json IS NULL OR jsonb_typeof(v_raw_json) = 'null' THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 1. Si se recibe un objeto JSON (por ejemplo el retorno de obtener_usuario_por_telefono o payload estructurado)
  IF jsonb_typeof(v_raw_json) = 'object' THEN
    -- Extraer bandera solo_activos si viene dentro del objeto
    IF (v_raw_json ->> 'solo_activos')::BOOLEAN IS TRUE OR (v_raw_json ->> 'soloActivos')::BOOLEAN IS TRUE THEN
      v_solo_activos := TRUE;
    END IF;

    -- Extraer el array clientes_ids según posibles convenciones de nombres
    IF v_raw_json ? 'clientes_ids' THEN
      v_raw_json := v_raw_json -> 'clientes_ids';
    ELSIF v_raw_json ? 'p_clientes_ids' THEN
      v_raw_json := v_raw_json -> 'p_clientes_ids';
    ELSIF v_raw_json ? 'ClientesIds' THEN
      v_raw_json := v_raw_json -> 'ClientesIds';
    ELSIF v_raw_json ? 'clientesIds' THEN
      v_raw_json := v_raw_json -> 'clientesIds';
    ELSE
      -- Si es un objeto pero no contiene claves de clientes, retornar vacío
      RETURN '[]'::JSONB;
    END IF;
  END IF;

  -- Si después de extraer la propiedad el contenido es nulo
  IF v_raw_json IS NULL OR jsonb_typeof(v_raw_json) = 'null' THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 2. Si es un array JSON (ej: ["000"], ["001", "002"], ["uuid1", "uuid2"])
  IF jsonb_typeof(v_raw_json) = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_raw_json)
    LOOP
      IF jsonb_typeof(v_elem) = 'string' THEN
        v_elem_str := TRIM(BOTH '"' FROM v_elem::TEXT);
      ELSE
        v_elem_str := TRIM(v_elem::TEXT);
      END IF;

      v_elem_str := TRIM(v_elem_str);

      IF v_elem_str IS NOT NULL AND v_elem_str <> '' AND v_elem_str <> 'null' THEN
        IF v_elem_str = '000' THEN
          v_tiene_todos := TRUE;
        END IF;
        v_ids := array_append(v_ids, v_elem_str);

        -- Clasificar si es UUID para aprovechar el índice de clave primaria
        IF v_elem_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          v_uuids := array_append(v_uuids, v_elem_str::UUID);
        ELSE
          v_codigos := array_append(v_codigos, v_elem_str);
        END IF;
      END IF;
    END LOOP;

  -- 3. Si es un string simple (ej: "000" o "CLI01" o "CLI01,CLI02")
  ELSIF jsonb_typeof(v_raw_json) = 'string' THEN
    v_elem_str := TRIM(BOTH '"' FROM v_raw_json::TEXT);
    v_elem_str := TRIM(v_elem_str);

    FOR v_elem_str IN 
      SELECT TRIM(val) 
      FROM unnest(string_to_array(v_elem_str, ',')) AS val 
      WHERE TRIM(val) <> '' AND TRIM(val) <> 'null'
    LOOP
      IF v_elem_str = '000' THEN
        v_tiene_todos := TRUE;
      END IF;
      v_ids := array_append(v_ids, v_elem_str);

      IF v_elem_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_uuids := array_append(v_uuids, v_elem_str::UUID);
      ELSE
        v_codigos := array_append(v_codigos, v_elem_str);
      END IF;
    END LOOP;
  ELSE
    RETURN '[]'::JSONB;
  END IF;

  -- Si no se identificó ningún código o ID y no tiene el comodín '000'
  IF (v_ids IS NULL OR cardinality(v_ids) = 0) AND NOT v_tiene_todos THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 4. Si incluye '000' (Comodín de Todos los Clientes Depositantes)
  IF v_tiene_todos THEN
    SELECT COALESCE(
      jsonb_agg(
        to_jsonb(c)
        ORDER BY c.razon_social ASC
      ),
      '[]'::JSONB
    )
    INTO v_res
    FROM public.clientes c
    WHERE (NOT v_solo_activos OR c.activo = true);

    RETURN COALESCE(v_res, '[]'::JSONB);
  END IF;

  -- 5. Búsqueda selectiva por Código comercial o UUID
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(c)
      ORDER BY c.razon_social ASC
    ),
    '[]'::JSONB
  )
  INTO v_res
  FROM public.clientes c
  WHERE (
    (cardinality(v_ids) > 0 AND c.codigo = ANY(v_ids))
    OR (cardinality(v_uuids) > 0 AND c.id = ANY(v_uuids))
  )
  AND (NOT v_solo_activos OR c.activo = true);

  RETURN COALESCE(v_res, '[]'::JSONB);
END;
$$;

-- 3. ALIAS DIRECTO RPC: obtener_clientes_por_id
-- Permite invocar la función tanto con prefijo wms_ como con el nombre plano
CREATE OR REPLACE FUNCTION public.obtener_clientes_por_id(
  p_clientes_ids JSONB DEFAULT NULL,
  p_solo_activos BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_obtener_clientes_por_id(p_clientes_ids, p_solo_activos);
END;
$$;

-- 4. CONCESIÓN DE PRIVILEGIOS DE EJECUCIÓN (ACCESO REST DATA API Y BOT)
GRANT EXECUTE ON FUNCTION public.wms_obtener_clientes_por_id(JSONB, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.obtener_clientes_por_id(JSONB, BOOLEAN) TO anon, authenticated, service_role;

-- 5. DOCUMENTACIÓN DE METADATOS
COMMENT ON FUNCTION public.wms_obtener_clientes_por_id(JSONB, BOOLEAN) IS 
  'Obtiene la lista de clientes depositantes a partir del objeto retornado por obtener_usuario_por_telefono o un array de clientes_ids. Soporta comodín 000 para todos los clientes, códigos comerciales y UUIDs.';

COMMENT ON FUNCTION public.obtener_clientes_por_id(JSONB, BOOLEAN) IS 
  'Alias de wms_obtener_clientes_por_id para consumo directo en la API de Supabase.';
