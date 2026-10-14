-- ==============================================================================
-- OPENWMS 3PL - CAMPO FechaUltimoAccesoBot Y RPC PARA ACTUALIZACIÓN POR BOT
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. AGREGAR COLUMNAS EN TABLA CLIENTES
-- Soporta tanto el nombre PascalCase exacto "FechaUltimoAccesoBot" como snake_case fecha_ultimo_acceso_bot
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS fecha_ultimo_acceso_bot TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "FechaUltimoAccesoBot" TIMESTAMPTZ;

-- 2. TRIGGER DE SINCRONIZACIÓN AUTOMÁTICA ENTRE AMBAS COLUMNAS
CREATE OR REPLACE FUNCTION public.trg_clientes_sync_bot_access()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_ultimo_acceso_bot IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.fecha_ultimo_acceso_bot IS DISTINCT FROM NEW.fecha_ultimo_acceso_bot) THEN
    NEW."FechaUltimoAccesoBot" := NEW.fecha_ultimo_acceso_bot;
  ELSIF NEW."FechaUltimoAccesoBot" IS NOT NULL AND (TG_OP = 'INSERT' OR OLD."FechaUltimoAccesoBot" IS DISTINCT FROM NEW."FechaUltimoAccesoBot") THEN
    NEW.fecha_ultimo_acceso_bot := NEW."FechaUltimoAccesoBot";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clientes_bot_access_sync ON public.clientes;
CREATE TRIGGER trg_clientes_bot_access_sync
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW
EXECUTE FUNCTION public.trg_clientes_sync_bot_access();

-- 3. ÍNDICES DE BÚSQUEDA Y MONITOREO
CREATE INDEX IF NOT EXISTS idx_clientes_fecha_ultimo_acceso_bot 
  ON public.clientes(fecha_ultimo_acceso_bot)
  WHERE fecha_ultimo_acceso_bot IS NOT NULL;

-- 4. PROCEDIMIENTO RPC: wms_actualizar_ultimo_acceso_bot
-- Actualiza la fecha de último acceso del bot buscando al cliente por:
--   - ID (UUID)
--   - Código comercial (ej: CLI-AND-001)
--   - Teléfono (ej: +54 11 4789-1000 o 1157617815)
-- Si p_fecha es NULL, toma por defecto now() (timestamp actual).
CREATE OR REPLACE FUNCTION public.wms_actualizar_ultimo_acceso_bot(
  p_identificador TEXT,
  p_fecha TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cliente public.clientes%ROWTYPE;
  v_clean_id TEXT;
  v_digits TEXT;
  v_fecha_final TIMESTAMPTZ;
BEGIN
  IF p_identificador IS NULL OR TRIM(p_identificador) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debe proporcionar un identificador válido (ID, código o teléfono).'
    );
  END IF;

  v_clean_id := TRIM(p_identificador);
  v_fecha_final := COALESCE(p_fecha, clock_timestamp());

  -- 1. Intentar por UUID si coincide con el patrón
  IF v_clean_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE id = v_clean_id::UUID
    LIMIT 1;
  END IF;

  -- 2. Si no se encontró por ID, buscar por Código Comercial
  IF v_cliente.id IS NULL THEN
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE codigo = v_clean_id
       OR UPPER(codigo) = UPPER(v_clean_id)
    LIMIT 1;
  END IF;

  -- 3. Si no se encontró por Código, buscar por Teléfono exacto
  IF v_cliente.id IS NULL THEN
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE telefono = v_clean_id
    LIMIT 1;
  END IF;

  -- 4. Si no se encontró, buscar por dígitos normalizados de teléfono
  IF v_cliente.id IS NULL THEN
    v_digits := regexp_replace(v_clean_id, '[^0-9]', '', 'g');
    IF length(v_digits) >= 6 THEN
      SELECT * INTO v_cliente
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

  -- 5. Si no se encontró ningún cliente, retornar error estructurado
  IF v_cliente.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No se encontró ningún cliente con el identificador proporcionado (' || v_clean_id || ').'
    );
  END IF;

  -- 6. Actualizar las columnas de fecha de acceso y timestamp de modificación
  UPDATE public.clientes
  SET fecha_ultimo_acceso_bot = v_fecha_final,
      "FechaUltimoAccesoBot" = v_fecha_final,
      actualizado_en = clock_timestamp()
  WHERE id = v_cliente.id
  RETURNING * INTO v_cliente;

  -- 7. Retornar el registro actualizado junto con metadatos de confirmación
  RETURN jsonb_build_object(
    'success', true,
    'mensaje', 'Fecha de último acceso del bot actualizada exitosamente.',
    'cliente_id', v_cliente.id,
    'codigo', v_cliente.codigo,
    'razon_social', v_cliente.razon_social,
    'telefono', v_cliente.telefono,
    'fecha_ultimo_acceso_bot', v_cliente.fecha_ultimo_acceso_bot,
    'FechaUltimoAccesoBot', v_cliente."FechaUltimoAccesoBot",
    'cliente', to_jsonb(v_cliente)
  );
END;
$$;

-- 5. ALIAS DIRECTO RPC: actualizar_ultimo_acceso_bot
CREATE OR REPLACE FUNCTION public.actualizar_ultimo_acceso_bot(
  p_identificador TEXT,
  p_fecha TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_actualizar_ultimo_acceso_bot(p_identificador, p_fecha);
END;
$$;

-- 6. CONCESIÓN DE PRIVILEGIOS DE EJECUCIÓN
GRANT EXECUTE ON FUNCTION public.wms_actualizar_ultimo_acceso_bot(TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.actualizar_ultimo_acceso_bot(TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- 7. COMENTARIOS DOCUMENTALES
COMMENT ON FUNCTION public.wms_actualizar_ultimo_acceso_bot(TEXT, TIMESTAMPTZ) IS 
  'Actualiza la fecha de último acceso del bot para un cliente buscando indistintamente por ID UUID, código comercial o número de teléfono.';

COMMENT ON FUNCTION public.actualizar_ultimo_acceso_bot(TEXT, TIMESTAMPTZ) IS 
  'Alias de wms_actualizar_ultimo_acceso_bot para consumo en la API de Supabase.';
