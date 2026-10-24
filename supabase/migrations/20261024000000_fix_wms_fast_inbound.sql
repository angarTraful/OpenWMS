-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: Corrección de Fast Inbound & Recepción Directa
-- Migración: 20261024000000_fix_wms_fast_inbound.sql
-- ==============================================================================

-- 1. Crear la función wms_conformar_orden_recepcion_directa requerida por el RPC de creación
CREATE OR REPLACE FUNCTION public.wms_conformar_orden_recepcion_directa(
  p_recepcion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delega la conformación directa de todos los renglones e ingreso a stock
  RETURN public.wms_conformar_todos_inbound(p_recepcion_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_conformar_orden_recepcion_directa(UUID) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
