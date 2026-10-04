-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: EXTENSIÓN DE HOJAS DE RUTA Y ENTREGAS EN TABLET CHOFER
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. Añadir columnas a rutas_paradas_itinerario si no existen
ALTER TABLE IF EXISTS public.rutas_paradas_itinerario 
  ADD COLUMN IF NOT EXISTS receptor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS receptor_documento TEXT,
  ADD COLUMN IF NOT EXISTS firma_digital TEXT,
  ADD COLUMN IF NOT EXISTS motivo_novedad TEXT,
  ADD COLUMN IF NOT EXISTS foto_remito_url TEXT,
  ADD COLUMN IF NOT EXISTS latitud_entrega NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitud_entrega NUMERIC(10,7);

-- 2. Añadir columnas a rutas_entrega si no existen
ALTER TABLE IF EXISTS public.rutas_entrega
  ADD COLUMN IF NOT EXISTS km_estimados NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS km_reales NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS notas_viaje TEXT;

-- 3. Políticas RLS permisivas para anon y authenticated
DROP POLICY IF EXISTS rutas_auth_all ON public.rutas_entrega;
CREATE POLICY rutas_auth_all ON public.rutas_entrega
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS paradas_auth_all ON public.rutas_paradas_itinerario;
CREATE POLICY paradas_auth_all ON public.rutas_paradas_itinerario
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. Procedimiento para registrar entrega o novedad con firma y documentación
CREATE OR REPLACE FUNCTION public.wms_registrar_entrega_parada(
  p_parada_id UUID,
  p_estado_entrega TEXT, -- 'entregado' o 'con_novedad'
  p_receptor_nombre TEXT DEFAULT NULL,
  p_receptor_documento TEXT DEFAULT NULL,
  p_firma_digital TEXT DEFAULT NULL,
  p_motivo_novedad TEXT DEFAULT NULL,
  p_foto_remito_url TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parada RECORD;
  v_ruta RECORD;
  v_pendientes INT;
BEGIN
  SELECT * INTO v_parada FROM public.rutas_paradas_itinerario WHERE id = p_parada_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada de itinerario no encontrada %', p_parada_id;
  END IF;

  UPDATE public.rutas_paradas_itinerario
  SET estado_entrega = p_estado_entrega::public.estado_parada_enum,
      hora_real_arribo = clock_timestamp(),
      receptor_nombre = COALESCE(p_receptor_nombre, receptor_nombre),
      receptor_documento = COALESCE(p_receptor_documento, receptor_documento),
      firma_digital = COALESCE(p_firma_digital, firma_digital),
      foto_remito_url = COALESCE(p_foto_remito_url, foto_remito_url),
      motivo_novedad = COALESCE(p_motivo_novedad, motivo_novedad),
      observaciones = COALESCE(p_observaciones, observaciones)
  WHERE id = p_parada_id;

  -- Si fue entregado (o entregado con novedad), actualizar el pedido para asentar el desvío
  IF p_estado_entrega = 'entregado' THEN
    UPDATE public.pedidos
    SET estado = 'despachado',
        actualizado_en = clock_timestamp()
    WHERE id = v_parada.pedido_id;
  ELSIF p_estado_entrega = 'con_novedad' THEN
    -- Finalizar el pedido igualmente pero asentando el desvío en observaciones
    UPDATE public.pedidos
    SET estado = 'despachado',
        observaciones = COALESCE(observaciones || ' | ', '') || 'Desvío en entrega: ' || COALESCE(p_motivo_novedad, 'Novedad asentada en reparto'),
        actualizado_en = clock_timestamp()
    WHERE id = v_parada.pedido_id;
  END IF;

  -- Verificar si quedan paradas pendientes en la ruta
  SELECT COUNT(*) INTO v_pendientes
  FROM public.rutas_paradas_itinerario
  WHERE ruta_id = v_parada.ruta_id AND estado_entrega = 'pendiente';

  -- Si no quedan paradas pendientes (todas entregadas o cerradas con novedad), finalizar el viaje
  IF v_pendientes = 0 THEN
    UPDATE public.rutas_entrega
    SET estado = 'itinerario_cumplido'
    WHERE id = v_parada.ruta_id;
  ELSE
    -- Asegurar que la ruta esté en viaje
    UPDATE public.rutas_entrega
    SET estado = 'en_viaje',
        fecha_hora_salida_real = COALESCE(fecha_hora_salida_real, clock_timestamp())
    WHERE id = v_parada.ruta_id AND estado = 'programada';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'parada_id', p_parada_id,
    'paradas_pendientes', v_pendientes
  );
END;
$$;

-- 5. Procedimiento específico para adjuntar foto/documentación a una parada ya cerrada
CREATE OR REPLACE FUNCTION public.wms_adjuntar_documento_parada(
  p_parada_id UUID,
  p_foto_remito_url TEXT,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.rutas_paradas_itinerario
  SET foto_remito_url = p_foto_remito_url,
      observaciones = CASE 
        WHEN p_observaciones IS NOT NULL AND length(trim(p_observaciones)) > 0 
        THEN COALESCE(observaciones || ' - ', '') || p_observaciones 
        ELSE observaciones 
      END
  WHERE id = p_parada_id;

  RETURN jsonb_build_object('success', true, 'parada_id', p_parada_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_registrar_entrega_parada TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_adjuntar_documento_parada TO anon, authenticated, service_role;
