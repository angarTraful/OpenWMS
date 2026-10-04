-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: AJUSTE POLÍTICAS RLS ANON & SECURITY DEFINER
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. Actualizar políticas RLS para soportar tanto anon como authenticated en tablas de facturación
DROP POLICY IF EXISTS tarifas_cliente_concepto_all ON public.tarifas_cliente_concepto;
CREATE POLICY tarifas_cliente_concepto_all ON public.tarifas_cliente_concepto 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS liquidaciones_cliente_all ON public.liquidaciones_cliente;
CREATE POLICY liquidaciones_cliente_all ON public.liquidaciones_cliente 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS liquidaciones_cliente_tramos_all ON public.liquidaciones_cliente_tramos;
CREATE POLICY liquidaciones_cliente_tramos_all ON public.liquidaciones_cliente_tramos 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS liquidaciones_cliente_items_all ON public.liquidaciones_cliente_items;
CREATE POLICY liquidaciones_cliente_items_all ON public.liquidaciones_cliente_items 
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Configurar funciones RPC de facturación como SECURITY DEFINER
ALTER FUNCTION public.wms_liquidar_estadia_periodo(UUID, DATE, DATE, BOOLEAN) SECURITY DEFINER;
ALTER FUNCTION public.wms_emitir_factura_fiscal_liquidacion(UUID, TEXT, TEXT, TEXT, TEXT, DATE, NUMERIC, JSONB, JSONB, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.wms_anular_factura_fiscal(UUID, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.wms_actualizar_item_liquidacion(UUID, NUMERIC, NUMERIC, TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.wms_eliminar_item_manual_liquidacion(UUID) SECURITY DEFINER;
ALTER FUNCTION public.wms_eliminar_item_liquidacion(UUID) SECURITY DEFINER;
ALTER FUNCTION public.wms_agregar_item_manual_liquidacion(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.wms_aprobar_liquidacion(UUID, UUID) SECURITY DEFINER;
ALTER FUNCTION public.wms_facturar_liquidacion(UUID, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.wms_obtener_remitos_periodo_cliente(UUID, DATE, DATE) SECURITY DEFINER;

-- 3. Grants de ejecución explícitos a roles anon y authenticated
GRANT EXECUTE ON FUNCTION public.wms_liquidar_estadia_periodo TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_emitir_factura_fiscal_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_anular_factura_fiscal TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_actualizar_item_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_eliminar_item_manual_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_eliminar_item_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_agregar_item_manual_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_aprobar_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_facturar_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_obtener_remitos_periodo_cliente TO anon, authenticated, service_role;
