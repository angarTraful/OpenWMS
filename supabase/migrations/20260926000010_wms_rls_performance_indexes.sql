-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: OPTIMIZACIÓN DE RLS Y CUBRIMIENTO DE ÍNDICES
-- Motor: PostgreSQL 17 / Supabase
-- Referencia: .agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md
-- ==============================================================================

-- 1. Índice de cobertura para llave foránea auth.users en liquidaciones_cliente
-- Previene table scans secuenciales durante verificación de foreign keys,
-- eliminaciones de usuarios y evaluaciones de RLS sobre usuario aprobador.
CREATE INDEX IF NOT EXISTS idx_liquidaciones_cliente_aprobado_por 
  ON public.liquidaciones_cliente(aprobado_por);
