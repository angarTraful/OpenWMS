-- ==============================================================================
-- OPENWMS 3PL - RPC SUPABASE: OBTENER DETALLE DE PEDIDO POR ID O NÚMERO DE CLIENTE
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================
-- Proporciona un endpoint/función unificada para consultar un pedido con sus
-- detalles de artículos, destinatario y dirección completa.
--
-- Parámetros:
--   p_pedido_id: UUID del pedido en public.pedidos (opcional)
--   p_pedido_cliente: Número de pedido del cliente (orden_compra_cliente o numero_pedido)
--   p_cliente_codigo: Código del cliente (ej. '001', 'CLI01') o UUID (opcional para desambiguar)
--
-- Respuesta JSON:
--   {
--     "pedido_id": "UUID",
--     "numero_pedido_cliente": "OC-99824",
--     "numero_pedido_wms": "PED-2026-0001",
--     "fecha_compromiso_entrega": "2026-10-25T14:00:00Z",
--     "destinatario_nombre": "Farmacia Central",
--     "destinatario_direccion_full": "Av. Corrientes 1234, Almagro, CABA",
--     "pedidos_detalle": [
--       {
--         "articulo_nombre": "Ibuprofeno 400mg",
--         "articulo_descripcion": "Caja x 20 comprimidos",
--         "lote_id": "UUID / NULL",
--         "numero_lote": "LOT-2026-01",
--         "cantidad": 50.00,
--         "m3": 0.0450,
--         "tipo_bulto": "caja"
--       }
--     ]
--   }
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.wms_obtener_detalle_pedido_por_id(
  p_pedido_id UUID DEFAULT NULL,
  p_pedido_cliente TEXT DEFAULT NULL,
  p_cliente_codigo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_id UUID := p_pedido_id;
  v_cliente_id UUID := NULL;
  v_pedido RECORD;
  v_destinatario RECORD;
  v_detalles JSONB := '[]'::jsonb;
  v_direccion_full TEXT := '';
BEGIN
  -- 1. Si no vino el UUID directo pero vino el número/nombre de pedido del cliente
  IF v_pedido_id IS NULL AND p_pedido_cliente IS NOT NULL AND TRIM(p_pedido_cliente) <> '' THEN
    -- Si se pasó código o identificación de cliente, resolver su UUID
    IF p_cliente_codigo IS NOT NULL AND TRIM(p_cliente_codigo) <> '' THEN
      BEGIN
        v_cliente_id := TRIM(p_cliente_codigo)::UUID;
      EXCEPTION WHEN OTHERS THEN
        v_cliente_id := NULL;
      END;

      IF v_cliente_id IS NULL THEN
        SELECT id INTO v_cliente_id
        FROM public.clientes
        WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(p_cliente_codigo))
           OR UPPER(TRIM(razon_social)) = UPPER(TRIM(p_cliente_codigo))
        LIMIT 1;
      END IF;
    END IF;

    -- Buscar coincidencia exacta por orden_compra_cliente o numero_pedido
    SELECT p.id INTO v_pedido_id
    FROM public.pedidos p
    WHERE (v_cliente_id IS NULL OR p.cliente_id = v_cliente_id)
      AND (
        UPPER(TRIM(COALESCE(p.orden_compra_cliente, ''))) = UPPER(TRIM(p_pedido_cliente))
        OR UPPER(TRIM(p.numero_pedido)) = UPPER(TRIM(p_pedido_cliente))
      )
    ORDER BY p.creado_en DESC
    LIMIT 1;

    -- Si no hubo coincidencia exacta, intentar coincidencia parcial (ILIKE)
    IF v_pedido_id IS NULL THEN
      SELECT p.id INTO v_pedido_id
      FROM public.pedidos p
      WHERE (v_cliente_id IS NULL OR p.cliente_id = v_cliente_id)
        AND (
          p.orden_compra_cliente ILIKE '%' || TRIM(p_pedido_cliente) || '%'
          OR p.numero_pedido ILIKE '%' || TRIM(p_pedido_cliente) || '%'
        )
      ORDER BY p.creado_en DESC
      LIMIT 1;
    END IF;
  END IF;

  -- 2. Si no se localizó el pedido, retornar respuesta estructurada de no encontrado
  IF v_pedido_id IS NULL THEN
    RETURN jsonb_build_object(
      'encontrado', false,
      'mensaje', 'Pedido no encontrado para los parámetros suministrados'
    );
  END IF;

  -- 3. Obtener cabecera del pedido
  SELECT p.*, c.codigo AS cliente_codigo, c.razon_social AS cliente_razon_social
  INTO v_pedido
  FROM public.pedidos p
  LEFT JOIN public.clientes c ON c.id = p.cliente_id
  WHERE p.id = v_pedido_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'encontrado', false,
      'mensaje', 'Pedido con ID especificado no existe'
    );
  END IF;

  -- 4. Obtener datos del destinatario y armar la dirección completa
  SELECT * INTO v_destinatario
  FROM public.destinatarios
  WHERE id = v_pedido.destinatario_id;

  IF FOUND THEN
    v_direccion_full := TRIM(BOTH ', ' FROM CONCAT_WS(', ',
      NULLIF(TRIM(v_destinatario.direccion_entrega), ''),
      NULLIF(TRIM(COALESCE(v_destinatario.localidad, '')), ''),
      NULLIF(TRIM(COALESCE(v_destinatario.ciudad, '')), '')
    ));
  END IF;

  -- 5. Armar el array de pedidos_detalle con artículos, lotes, m3 y tipo de bulto
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'articulo_nombre', a.nombre,
      'articulo_descripcion', COALESCE(NULLIF(TRIM(a.descripcion), ''), a.nombre),
      'sku', a.sku,
      'lote_id', COALESCE(
        (SELECT tp.lote_id FROM public.tareas_picking tp WHERE tp.pedido_detalle_id = pd.id AND tp.lote_id IS NOT NULL LIMIT 1),
        (SELECT i.lote_id FROM public.inventario i WHERE i.articulo_id = pd.articulo_id AND i.cliente_id = v_pedido.cliente_id AND i.lote_id IS NOT NULL LIMIT 1),
        NULL
      ),
      'numero_lote', COALESCE(
        (SELECT lc.numero_lote FROM public.tareas_picking tp JOIN public.lotes_cliente lc ON lc.id = tp.lote_id WHERE tp.pedido_detalle_id = pd.id LIMIT 1),
        (SELECT lc.numero_lote FROM public.inventario i JOIN public.lotes_cliente lc ON lc.id = i.lote_id WHERE i.articulo_id = pd.articulo_id AND i.cliente_id = v_pedido.cliente_id LIMIT 1),
        NULL
      ),
      'cantidad', pd.cantidad_solicitada,
      'm3', ROUND(pd.cantidad_solicitada * COALESCE(a.volumen_unitario_m3, 0.0000), 4),
      'tipo_bulto', COALESCE(a.unidad_medida, 'bulto')
    )
    ORDER BY pd.id ASC
  ), '[]'::jsonb)
  INTO v_detalles
  FROM public.pedidos_detalle pd
  JOIN public.articulos a ON a.id = pd.articulo_id
  WHERE pd.pedido_id = v_pedido_id;

  -- 6. Retornar el JSON estructurado solicitado
  RETURN jsonb_build_object(
    'encontrado', true,
    'pedido_id', v_pedido.id,
    'numero_pedido_cliente', COALESCE(v_pedido.orden_compra_cliente, v_pedido.numero_pedido),
    'numero_pedido_wms', v_pedido.numero_pedido,
    'fecha_compromiso_entrega', v_pedido.fecha_compromiso_entrega,
    'destinatario_nombre', COALESCE(v_destinatario.razon_social, 'Sin Destinatario'),
    'destinatario_direccion_full', COALESCE(v_direccion_full, ''),
    'pedidos_detalle', v_detalles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wms_obtener_detalle_pedido_por_id(UUID, TEXT, TEXT) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
