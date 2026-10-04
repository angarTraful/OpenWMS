-- ==============================================================================
-- OPENWMS 3PL - MIGRACIÓN: MÓDULO DE FACTURACIÓN FISCAL ELECTRÓNICA & REMITOS RX
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. EXTENDER TABLA: LIQUIDACIONES DE CLIENTES CON CAMPOS FISCALES AFIP
ALTER TABLE public.liquidaciones_cliente
  ADD COLUMN IF NOT EXISTS tipo_comprobante TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS punto_venta TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS numero_factura TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cae TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_cae DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alicuota_iva NUMERIC(5,2) DEFAULT 21.00,
  ADD COLUMN IF NOT EXISTS monto_neto_gravado NUMERIC(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS monto_iva NUMERIC(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS monto_total_facturado NUMERIC(14,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS fecha_facturacion TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS remitos_asociados JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS datos_emisor JSONB DEFAULT NULL;

-- Asegurar validación de tipo de comprobante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'liquidaciones_tipo_comprobante_check'
  ) THEN
    ALTER TABLE public.liquidaciones_cliente
      ADD CONSTRAINT liquidaciones_tipo_comprobante_check
      CHECK (tipo_comprobante IS NULL OR tipo_comprobante IN (
        'FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO_A', 'NOTA_CREDITO_B'
      ));
  END IF;
END $$;

-- Índice para búsquedas por número fiscal
CREATE INDEX IF NOT EXISTS idx_liquidaciones_factura_fiscal 
  ON public.liquidaciones_cliente(punto_venta, numero_factura) 
  WHERE punto_venta IS NOT NULL AND numero_factura IS NOT NULL;


-- 2. PROCEDIMIENTO RPC: CONSULTAR REMITOS RX DE UN PERÍODO PARA VINCULAR A FACTURA
CREATE OR REPLACE FUNCTION public.wms_obtener_remitos_periodo_cliente(
  p_cliente_id UUID,
  p_fecha_desde DATE,
  p_fecha_hasta DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_resultado JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'numero_remito_rx', r.numero_remito_rx,
      'fecha_emision', r.fecha_emision,
      'cae_o_autorizacion_fiscal', r.cae_o_autorizacion_fiscal,
      'total_bultos', r.total_bultos,
      'total_pallets', r.total_pallets,
      'peso_total_kg', r.peso_total_kg,
      'volumen_total_m3', r.volumen_total_m3,
      'valor_declarado_total', r.valor_declarado_total,
      'estado', r.estado,
      'destinatario', jsonb_build_object(
        'id', d.id,
        'razon_social_destinatario', d.razon_social_destinatario,
        'codigo_sucursal', d.codigo_sucursal,
        'direccion_entrega', d.direccion_entrega,
        'ciudad', d.ciudad
      )
    ) ORDER BY r.fecha_emision ASC
  ), '[]'::jsonb)
  INTO v_resultado
  FROM public.remitos_transito r
  LEFT JOIN public.destinatarios d ON d.id = r.destinatario_id
  WHERE r.cliente_id = p_cliente_id
    AND r.fecha_emision::DATE BETWEEN p_fecha_desde AND p_fecha_hasta
    AND r.estado != 'rechazado_total';

  RETURN v_resultado;
END;
$$;


-- 3. PROCEDIMIENTO RPC: EMISIÓN FISCAL ELECTRÓNICA DE LIQUIDACIÓN
CREATE OR REPLACE FUNCTION public.wms_emitir_factura_fiscal_liquidacion(
  p_liquidacion_id UUID,
  p_tipo_comprobante TEXT,
  p_punto_venta TEXT,
  p_numero_factura TEXT,
  p_cae TEXT,
  p_fecha_vencimiento_cae DATE,
  p_alicuota_iva NUMERIC DEFAULT 21.00,
  p_remitos JSONB DEFAULT '[]'::jsonb,
  p_datos_emisor JSONB DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_liq RECORD;
  v_neto NUMERIC(14,2);
  v_iva NUMERIC(14,2);
  v_total_facturado NUMERIC(14,2);
  v_alicuota NUMERIC(5,2);
  v_pv TEXT;
  v_num TEXT;
BEGIN
  -- 1. Validar existencia
  SELECT * INTO v_liq
  FROM public.liquidaciones_cliente
  WHERE id = p_liquidacion_id;

  IF v_liq.id IS NULL THEN
    RAISE EXCEPTION 'Liquidación con ID % no encontrada.', p_liquidacion_id;
  END IF;

  IF v_liq.estado = 'facturada' THEN
    RAISE EXCEPTION 'La liquidación % ya se encuentra marcada como FACTURADA con comprobante %-%.', 
      v_liq.numero_liquidacion, v_liq.punto_venta, v_liq.numero_factura;
  END IF;

  IF v_liq.estado = 'anulada' THEN
    RAISE EXCEPTION 'No se puede facturar una liquidación ANULADA.';
  END IF;

  -- 2. Formatear y validar punto de venta y número
  v_pv := LPAD(REGEXP_REPLACE(COALESCE(p_punto_venta, '5'), '[^0-9]', '', 'g'), 4, '0');
  v_num := LPAD(REGEXP_REPLACE(COALESCE(p_numero_factura, '1'), '[^0-9]', '', 'g'), 8, '0');

  IF p_cae IS NULL OR TRIM(p_cae) = '' THEN
    RAISE EXCEPTION 'Debe indicar un Código de Autorización Electrónico (CAE) válido.';
  END IF;

  -- 3. Calcular importes netos e impuestos
  v_neto := COALESCE(v_liq.monto_total, 0.00);
  v_alicuota := COALESCE(p_alicuota_iva, 21.00);
  v_iva := ROUND(v_neto * (v_alicuota / 100.0), 2);
  v_total_facturado := v_neto + v_iva;

  -- 4. Actualizar registro
  UPDATE public.liquidaciones_cliente
  SET
    estado = 'facturada',
    tipo_comprobante = p_tipo_comprobante,
    punto_venta = v_pv,
    numero_factura = v_num,
    cae = TRIM(p_cae),
    fecha_vencimiento_cae = p_fecha_vencimiento_cae,
    alicuota_iva = v_alicuota,
    monto_neto_gravado = v_neto,
    monto_iva = v_iva,
    monto_total_facturado = v_total_facturado,
    fecha_facturacion = clock_timestamp(),
    remitos_asociados = COALESCE(p_remitos, '[]'::jsonb),
    datos_emisor = p_datos_emisor,
    observaciones = CASE 
      WHEN p_observaciones IS NOT NULL AND TRIM(p_observaciones) != '' THEN 
        COALESCE(observaciones || ' | ', '') || TRIM(p_observaciones)
      ELSE observaciones 
    END,
    actualizado_en = clock_timestamp()
  WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success', true,
    'liquidacion_id', p_liquidacion_id,
    'numero_liquidacion', v_liq.numero_liquidacion,
    'tipo_comprobante', p_tipo_comprobante,
    'punto_venta', v_pv,
    'numero_factura', v_num,
    'comprobante_formateado', v_pv || '-' || v_num,
    'cae', TRIM(p_cae),
    'fecha_vencimiento_cae', p_fecha_vencimiento_cae,
    'monto_neto_gravado', v_neto,
    'monto_iva', v_iva,
    'monto_total_facturado', v_total_facturado,
    'fecha_facturacion', clock_timestamp(),
    'estado', 'facturada'
  );
END;
$$;


-- 4. PROCEDIMIENTO RPC: ANULACIÓN FISCAL / NOTA DE CRÉDITO DE LIQUIDACIÓN
CREATE OR REPLACE FUNCTION public.wms_anular_factura_fiscal(
  p_liquidacion_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_liq RECORD;
BEGIN
  SELECT * INTO v_liq
  FROM public.liquidaciones_cliente
  WHERE id = p_liquidacion_id;

  IF v_liq.id IS NULL THEN
    RAISE EXCEPTION 'Liquidación no encontrada.';
  END IF;

  IF v_liq.estado != 'facturada' THEN
    RAISE EXCEPTION 'Solo se puede anular o emitir nota de crédito sobre liquidaciones en estado FACTURADA (estado actual: %).', v_liq.estado;
  END IF;

  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    RAISE EXCEPTION 'Debe especificar obligatoriamente un motivo para la anulación / nota de crédito.';
  END IF;

  UPDATE public.liquidaciones_cliente
  SET
    estado = 'anulada',
    motivo_anulacion = TRIM(p_motivo),
    fecha_anulacion = clock_timestamp(),
    actualizado_en = clock_timestamp()
  WHERE id = p_liquidacion_id;

  RETURN jsonb_build_object(
    'success', true,
    'liquidacion_id', p_liquidacion_id,
    'numero_liquidacion', v_liq.numero_liquidacion,
    'estado', 'anulada',
    'motivo_anulacion', TRIM(p_motivo),
    'fecha_anulacion', clock_timestamp()
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.wms_obtener_remitos_periodo_cliente TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_emitir_factura_fiscal_liquidacion TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wms_anular_factura_fiscal TO anon, authenticated, service_role;
