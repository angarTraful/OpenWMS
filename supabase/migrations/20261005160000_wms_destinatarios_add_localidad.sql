-- ==============================================================================
-- Migration: Agregar campo Localidad a Destinatarios (antes de Ciudad)
-- Fecha: 2026-10-05
-- Descripción:
--   Agrega la columna 'localidad' a la tabla 'destinatarios' para permitir
--   diferenciar barrio/localidad de la ciudad o partido provincial en remitos,
--   hojas de ruta y etiquetas de expedición.
-- ==============================================================================

-- 1. Agregar columna localidad
ALTER TABLE public.destinatarios 
  ADD COLUMN IF NOT EXISTS localidad TEXT;

-- 2. Índice para optimizar búsquedas por localidad
CREATE INDEX IF NOT EXISTS idx_destinatarios_localidad 
  ON public.destinatarios(localidad);

-- 3. Recargar inmediatamente la caché de esquemas en PostgREST (Supabase)
NOTIFY pgrst, 'reload schema';
