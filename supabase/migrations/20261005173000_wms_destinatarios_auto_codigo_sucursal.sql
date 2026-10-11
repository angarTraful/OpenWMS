-- ==============================================================================
-- Migration: Auto-generación de Código de Sucursal y Deduplicación en Destinatarios
-- Fecha: 2026-10-05
-- Descripción:
--   1. Trigger BEFORE INSERT para auto-asignar codigo_sucursal concatenando
--      "Razon Social SUC1", "SUC2", etc., cuando no se especifique código.
--   2. Índice sobre la dirección normalizada para búsquedas y prevención de duplicados.
--   3. Recarga de caché de esquemas PostgREST.
-- ==============================================================================

-- 1. Índice para acelerar búsquedas y comparaciones de dirección en minúsculas
CREATE INDEX IF NOT EXISTS idx_destinatarios_direccion_lower 
  ON public.destinatarios (LOWER(TRIM(direccion_entrega)));

-- 2. Función de trigger para auto-generación de código de sucursal
CREATE OR REPLACE FUNCTION public.wms_destinatarios_auto_codigo_sucursal()
RETURNS TRIGGER AS $$
DECLARE
  v_razon_clean TEXT;
  v_max_num INT := 0;
  v_curr_num INT;
  r RECORD;
BEGIN
  -- Si ya viene con código de sucursal explícito, normalizarlo a mayúsculas
  IF NEW.codigo_sucursal IS NOT NULL AND TRIM(NEW.codigo_sucursal) <> '' THEN
    NEW.codigo_sucursal := UPPER(TRIM(NEW.codigo_sucursal));
    RETURN NEW;
  END IF;

  -- Limpiar razón social para prefijo (mayúsculas, sin espacios al inicio/final)
  v_razon_clean := UPPER(TRIM(COALESCE(NEW.razon_social, 'DEST')));
  -- Quitar sufijos comunes o puntuación al final (ej: comas, puntos)
  v_razon_clean := REGEXP_REPLACE(v_razon_clean, '[,.-]+$', '');

  -- Buscar el número de sucursal más alto existente para esta razón social
  FOR r IN 
    SELECT codigo_sucursal 
    FROM public.destinatarios 
    WHERE (
      UPPER(TRIM(razon_social)) = UPPER(TRIM(NEW.razon_social))
      OR codigo_sucursal ILIKE v_razon_clean || ' SUC%'
      OR codigo_sucursal ILIKE v_razon_clean || '-SUC%'
    )
    AND codigo_sucursal IS NOT NULL
  LOOP
    -- Extraer el número correlativo que sigue a SUC
    v_curr_num := (SUBSTRING(r.codigo_sucursal FROM '(?i)SUC[-_\s]*([0-9]+)'))::INT;
    IF v_curr_num IS NOT NULL AND v_curr_num > v_max_num THEN
      v_max_num := v_curr_num;
    END IF;
  END LOOP;

  -- Asignar el siguiente código de sucursal correlativo
  NEW.codigo_sucursal := v_razon_clean || ' SUC' || (v_max_num + 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear el trigger BEFORE INSERT si no existe
DROP TRIGGER IF EXISTS trg_destinatarios_auto_codigo_sucursal ON public.destinatarios;
CREATE TRIGGER trg_destinatarios_auto_codigo_sucursal
  BEFORE INSERT ON public.destinatarios
  FOR EACH ROW
  EXECUTE FUNCTION public.wms_destinatarios_auto_codigo_sucursal();

-- 4. Recargar inmediatamente la caché de esquemas en PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
