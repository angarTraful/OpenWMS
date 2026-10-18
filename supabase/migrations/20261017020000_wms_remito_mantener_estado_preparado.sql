-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: PRESERVAR ESTADO PREPARADO TRAS EMISIÓN DE REMITO RX
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================
-- Corrige el flujo de la Etapa 2 (Salidas): al emitir el Remito Rx previo a la
-- hoja de ruta, el pedido debe permanecer en 'preparado' (o 'agrupado_salida')
-- y NO pasar a 'despachado'. Solo pasará a 'despachado' al entregarse en destino
-- o al confirmarse el retiro directo en mostrador/depósito.

-- 1. Eliminar la versión anterior de 4 parámetros para evitar conflicto de ambigüedad
-- "Could not choose the best candidate function between..."
DROP FUNCTION IF EXISTS public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID);

-- 2. Crear o reemplazar la función canónica de 5 parámetros
CREATE OR REPLACE FUNCTION public.wms_emitir_remito_rx(
  p_pedido_id UUID,
  p_numero_remito_rx TEXT,
  p_cae TEXT DEFAULT NULL,
  p_orden_salida_id UUID DEFAULT NULL,
  p_valor_declarado_total NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido RECORD;
  v_remito_id UUID;
  v_total_bultos INT := 0;
  v_total_pallets INT := 0;
  v_peso_total NUMERIC(12,3) := 0.000;
  v_volumen_total NUMERIC(14,4) := 0.0000;
  v_valor_declarado_total NUMERIC(14,2) := 0.00;
BEGIN
  -- 1. Obtener pedido
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado', p_pedido_id;
  END IF;

  -- 2. Calcular totales desde pedidos_detalle y articulos
  SELECT 
    COALESCE(SUM(pd.cantidad_separada), 0),
    COALESCE(SUM(ROUND(pd.cantidad_separada * a.peso_unitario_kg, 3)), 0.000),
    COALESCE(SUM(ROUND(pd.cantidad_separada * a.volumen_unitario_m3, 4)), 0.0000),
    COALESCE(SUM(ROUND(pd.cantidad_separada * a.valor_declarado, 2)), 0.00)
  INTO 
    v_total_bultos,
    v_peso_total,
    v_volumen_total,
    v_valor_declarado_total
  FROM public.pedidos_detalle pd
  JOIN public.articulos a ON a.id = pd.articulo_id
  WHERE pd.pedido_id = p_pedido_id;

  -- 3. Si se pasó un valor declarado total explícito (editado por el usuario), usarlo
  IF p_valor_declarado_total IS NOT NULL AND p_valor_declarado_total >= 0 THEN
    v_valor_declarado_total := p_valor_declarado_total;
  END IF;

  -- 4. Calcular cantidad de pallets de salida registrados
  SELECT COUNT(*) INTO v_total_pallets
  FROM public.paletizado_despacho
  WHERE pedido_id = p_pedido_id;

  IF v_total_pallets = 0 THEN
    v_total_pallets := 1;
  END IF;

  -- 5. Insertar Remito Rx de Tránsito (casteo explícito al enum estado_remito_enum)
  INSERT INTO public.remitos_transito (
    pedido_id,
    cliente_id,
    destinatario_id,
    numero_remito_rx,
    cae_o_autorizacion_fiscal,
    total_bultos,
    total_pallets,
    peso_total_kg,
    volumen_total_m3,
    valor_declarado_total,
    orden_salida_id,
    estado
  ) VALUES (
    p_pedido_id,
    v_pedido.cliente_id,
    v_pedido.destinatario_id,
    p_numero_remito_rx,
    p_cae,
    v_total_bultos,
    v_total_pallets,
    v_peso_total,
    v_volumen_total,
    v_valor_declarado_total,
    p_orden_salida_id,
    'emitido'::public.estado_remito_enum
  ) RETURNING id INTO v_remito_id;

  -- 6. Preservar estado del pedido como 'preparado' (o 'agrupado_salida') con casteo explícito al enum estado_pedido_enum
  UPDATE public.pedidos
  SET estado = CASE 
        WHEN estado::text = 'agrupado_salida' THEN 'agrupado_salida'::public.estado_pedido_enum 
        ELSE 'preparado'::public.estado_pedido_enum 
      END,
      actualizado_en = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'remito_id', v_remito_id,
    'numero_remito_rx', p_numero_remito_rx,
    'total_bultos', v_total_bultos,
    'total_pallets', v_total_pallets,
    'peso_total_kg', v_peso_total,
    'volumen_total_m3', v_volumen_total,
    'valor_declarado_total', v_valor_declarado_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO anon;

-- 3. Asegurar que la tabla rutas_entrega tenga notas_viaje y columnas de control de muelle
ALTER TABLE IF EXISTS public.rutas_entrega
  ADD COLUMN IF NOT EXISTS notas_viaje TEXT,
  ADD COLUMN IF NOT EXISTS acompanante_nombre TEXT,
  ADD COLUMN IF NOT EXISTS acompanante_documento TEXT,
  ADD COLUMN IF NOT EXISTS control_carga_completado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS control_carga_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS control_carga_usuario TEXT,
  ADD COLUMN IF NOT EXISTS control_carga_precinto TEXT;

-- 4. Recargar el schema cache de PostgREST para que detecte la columna notas_viaje de inmediato
NOTIFY pgrst, 'reload schema';
