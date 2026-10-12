-- Migration: Articulos Model Refactor, Descripcion Full, Unidades Decimales y Remito Valor Total
-- Date: 2026-10-12
-- Description:
-- 1. Añade campo virtual/sincronizado descripcion_full (descripcion - color - marca_bulto)
-- 2. Asegura que unidades_por_bulto admita decimales (NUMERIC(14,3))
-- 3. Actualiza el procedimiento wms_emitir_remito_rx para aceptar p_valor_declarado_total editable

-- 1. Agregar columna descripcion_full a public.articulos si no existe
ALTER TABLE public.articulos 
  ADD COLUMN IF NOT EXISTS descripcion_full TEXT;

COMMENT ON COLUMN public.articulos.descripcion_full IS 'Descripción extendida concatenada (descripcion - color - marca_bulto)';

-- 2. Asegurar que unidades_por_bulto soporte decimales para metros, kilos, litros, etc.
ALTER TABLE public.articulos
  ALTER COLUMN unidades_por_bulto TYPE NUMERIC(14,3);

-- 3. Actualizar trigger para calcular descripcion_full automáticamente
CREATE OR REPLACE FUNCTION trg_articulos_sync_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- Generar / mantener descripcion_full (descripcion - color - marca_bulto)
  NEW.descripcion_full := NULLIF(
    TRIM(
      CONCAT_WS(' - ',
        NULLIF(TRIM(NEW.descripcion), ''),
        NULLIF(TRIM(NEW.color), ''),
        NULLIF(TRIM(NEW.marca_bulto), '')
      )
    ),
    ''
  );

  -- EAN13 & Codigo Barras
  IF NEW.ean13 IS NOT NULL AND NEW.ean13 <> '' THEN
    NEW.codigo_barras := NEW.ean13;
  ELSIF NEW.codigo_barras IS NOT NULL AND NEW.codigo_barras <> '' THEN
    NEW.ean13 := NEW.codigo_barras;
  END IF;

  -- Peso GW & Peso Unitario
  IF NEW.peso_gw IS NOT NULL AND NEW.peso_gw > 0 THEN
    NEW.peso_unitario_kg := NEW.peso_gw;
  ELSIF NEW.peso_unitario_kg IS NOT NULL AND NEW.peso_unitario_kg > 0 THEN
    NEW.peso_gw := NEW.peso_unitario_kg;
  END IF;

  -- Medida M3 & Volumen Unitario M3
  IF NEW.medida_m3 IS NOT NULL AND NEW.medida_m3 > 0 THEN
    NEW.volumen_unitario_m3 := NEW.medida_m3;
  ELSIF NEW.volumen_unitario_m3 IS NOT NULL AND NEW.volumen_unitario_m3 > 0 THEN
    NEW.medida_m3 := NEW.volumen_unitario_m3;
  END IF;

  -- Cantidad por Pallet & Bultos por Pallet
  IF NEW.cantidad_por_pallet IS NOT NULL AND NEW.cantidad_por_pallet > 0 THEN
    NEW.bultos_por_pallet := GREATEST(1, ROUND(NEW.cantidad_por_pallet)::INTEGER);
  ELSIF NEW.bultos_por_pallet IS NOT NULL AND NEW.bultos_por_pallet > 0 THEN
    NEW.cantidad_por_pallet := NEW.bultos_por_pallet;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asegurar trigger activo
DROP TRIGGER IF EXISTS trg_articulos_sync_fields ON public.articulos;
CREATE TRIGGER trg_articulos_sync_fields
BEFORE INSERT OR UPDATE ON public.articulos
FOR EACH ROW
EXECUTE FUNCTION trg_articulos_sync_aliases();

-- 4. Actualizar filas existentes para poblar descripcion_full
UPDATE public.articulos
SET descripcion_full = NULLIF(
  TRIM(
    CONCAT_WS(' - ',
      NULLIF(TRIM(descripcion), ''),
      NULLIF(TRIM(color), ''),
      NULLIF(TRIM(marca_bulto), '')
    )
  ),
  ''
)
WHERE descripcion_full IS NULL;

-- 5. Actualizar procedimiento de emisión de remito con soporte para valor declarado editable
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
SET search_path = ''
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

  -- 5. Insertar Remito Rx de Tránsito
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
    'emitido'
  ) RETURNING id INTO v_remito_id;

  -- 6. Actualizar estado del pedido a 'despachado'
  UPDATE public.pedidos
  SET estado = 'despachado',
      actualizado_en = now()
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'exito', true,
    'remito_id', v_remito_id,
    'numero_remito_rx', p_numero_remito_rx,
    'valor_declarado_total', v_valor_declarado_total,
    'mensaje', 'Remito Rx de tránsito generado correctamente'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_emitir_remito_rx(UUID, TEXT, TEXT, UUID, NUMERIC) TO anon;
