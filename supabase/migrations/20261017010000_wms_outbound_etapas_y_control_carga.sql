-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: EXTENSIÓN ETAPAS OUTBOUND, CONTROL DE CARGA Y MUESTREO
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. EXTENDER TABLA rutas_entrega: Acompañante, Control de Carga en Muelle y Precintos
ALTER TABLE IF EXISTS public.rutas_entrega
  ADD COLUMN IF NOT EXISTS acompanante_nombre TEXT,
  ADD COLUMN IF NOT EXISTS acompanante_documento TEXT,
  ADD COLUMN IF NOT EXISTS control_carga_completado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_carga_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS control_carga_usuario TEXT,
  ADD COLUMN IF NOT EXISTS control_carga_precinto TEXT;

-- 2. EXTENDER TABLA pedidos: Control por Muestreo en Expedición, Parcialización y Asignación de Roles
ALTER TABLE IF EXISTS public.pedidos
  ADD COLUMN IF NOT EXISTS control_muestreo_completado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_muestreo_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS control_muestreo_usuario TEXT,
  ADD COLUMN IF NOT EXISTS control_muestreo_resultado TEXT,
  ADD COLUMN IF NOT EXISTS pedido_padre_id UUID REFERENCES public.pedidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_parcializado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS estrategia_alocacion TEXT DEFAULT 'FEFO',
  ADD COLUMN IF NOT EXISTS operador_picking_id UUID,
  ADD COLUMN IF NOT EXISTS supervisor_picking_id UUID,
  ADD COLUMN IF NOT EXISTS controller_picking_id UUID;

-- 3. POLÍTICAS RLS PERMISIVAS
DROP POLICY IF EXISTS rutas_ext_auth_all ON public.rutas_entrega;
CREATE POLICY rutas_ext_auth_all ON public.rutas_entrega
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pedidos_ext_auth_all ON public.pedidos;
CREATE POLICY pedidos_ext_auth_all ON public.pedidos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
