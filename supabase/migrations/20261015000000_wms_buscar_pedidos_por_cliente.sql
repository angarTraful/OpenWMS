-- ==============================================================================
-- OPENWMS 3PL - RPC Y ENDPOINT SUPABASE: BUSCAR PEDIDOS POR CLIENTE EN EJECUCIÓN
-- Motor: PostgreSQL 17 / Supabase
-- ==============================================================================

-- 1. ÍNDICES DE RENDIMIENTO PARA OUTBOUND Y RUTEO
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_fecha_solicitud
  ON public.pedidos(cliente_id, fecha_solicitud ASC);

CREATE INDEX IF NOT EXISTS idx_ordenes_salida_pedidos_pedido
  ON public.ordenes_salida_pedidos(pedido_id, orden_salida_id);

CREATE INDEX IF NOT EXISTS idx_rutas_paradas_pedido_entrega
  ON public.rutas_paradas_itinerario(pedido_id, estado_entrega);

-- 2. PROCEDIMIENTO RPC: wms_buscar_pedidos_por_cliente
-- Devuelve un array JSONB con los pedidos por cliente en estado de ejecución
-- (antes de despachado o cancelado).
-- Si el pedido se encuentra en una Salida activa, progresa con los estados
-- de la salida: agrupado_salida, remitida, cargando, en_transito, entregado.
-- Al cerrarse la salida y finalizar el despacho -> FIN (ya no se lista).
--
-- Entrada:
--   p_cod_cliente: Código comercial del cliente (ej. '001', 'CLI01'), UUID o '000' (todos los clientes).
-- Retorno:
--   Array JSON ordenado asc por fecha_solicitud:
--   [
--     {
--       "NombrePedidoCliente": "PED-2026-0001",
--       "DestinatarioNombre": "Farmacia Central",
--       "Estado": "en_picking",
--       "FechaHoraSolicitado": "2026-10-15T02:00:00+00:00"
--     }
--   ]
CREATE OR REPLACE FUNCTION public.wms_buscar_pedidos_por_cliente(
  p_cod_cliente TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean_cod TEXT;
  v_cliente_uuid UUID := NULL;
  v_es_todos BOOLEAN := FALSE;
  v_result JSONB;
BEGIN
  -- Validar entrada vacía o nula
  IF p_cod_cliente IS NULL OR TRIM(p_cod_cliente) = '' THEN
    RETURN '[]'::JSONB;
  END IF;

  v_clean_cod := TRIM(p_cod_cliente);

  -- 1. Caso '000': Permiso global / todos los clientes
  IF v_clean_cod = '000' THEN
    v_es_todos := TRUE;
  -- 2. Caso UUID: Identificador primario de cliente
  ELSIF v_clean_cod ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_cliente_uuid := v_clean_cod::UUID;
  -- 3. Caso Código Comercial (o teléfono / CUIT alternativo)
  ELSE
    SELECT id INTO v_cliente_uuid
    FROM public.clientes
    WHERE UPPER(codigo) = UPPER(v_clean_cod)
       OR codigo = v_clean_cod
    LIMIT 1;

    IF v_cliente_uuid IS NULL THEN
      SELECT id INTO v_cliente_uuid
      FROM public.clientes
      WHERE telefono = v_clean_cod
         OR cuit = v_clean_cod
      LIMIT 1;
    END IF;
  END IF;

  -- Si se solicitó un cliente puntual pero no existe en la base, retornar array vacío
  IF NOT v_es_todos AND v_cliente_uuid IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 4. Consultar y construir JSON con los pedidos en ejecución
  WITH pedidos_activos AS (
    SELECT
      p.id AS pedido_id,
      COALESCE(p.numero_pedido, p.orden_compra_cliente, '') AS nombre_pedido,
      COALESCE(d.razon_social, 'Sin destinatario') AS destinatario_nombre,
      p.fecha_solicitud,
      p.estado AS pedido_estado,
      os.id AS orden_salida_id,
      os.estado AS orden_salida_estado,
      rpi.estado_entrega AS parada_estado_entrega
    FROM public.pedidos p
    LEFT JOIN public.destinatarios d ON d.id = p.destinatario_id
    -- Última orden de salida asociada
    LEFT JOIN LATERAL (
      SELECT os_inner.id, os_inner.estado
      FROM public.ordenes_salida_pedidos osp
      JOIN public.ordenes_salida os_inner ON os_inner.id = osp.orden_salida_id
      WHERE osp.pedido_id = p.id
      ORDER BY os_inner.creado_en DESC
      LIMIT 1
    ) os ON true
    -- Último estado de entrega en itinerario de transporte
    LEFT JOIN LATERAL (
      SELECT rpi_inner.estado_entrega
      FROM public.rutas_paradas_itinerario rpi_inner
      WHERE rpi_inner.pedido_id = p.id
      ORDER BY rpi_inner.id DESC
      LIMIT 1
    ) rpi ON true
    WHERE (v_es_todos OR p.cliente_id = v_cliente_uuid)
      -- Excluir pedidos cancelados
      AND p.estado <> 'cancelado'
      -- Excluir si la orden de salida ya fue cerrada (ciclo completado FIN)
      AND (os.estado IS NULL OR os.estado <> 'cerrada')
      -- Excluir pedidos despachados finales que no estén en una salida activa con parada
      AND (
        p.estado <> 'despachado'
        OR (
          os.id IS NOT NULL 
          AND os.estado <> 'cerrada' 
          AND (rpi.estado_entrega = 'entregado' OR rpi.estado_entrega = 'con_novedad')
        )
      )
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'NombrePedidoCliente', pa.nombre_pedido,
          'DestinatarioNombre', pa.destinatario_nombre,
          'Estado', 
            CASE
              WHEN pa.parada_estado_entrega = 'entregado' THEN 'entregado'
              WHEN pa.parada_estado_entrega = 'con_novedad' THEN 'con_novedad'
              WHEN pa.orden_salida_estado = 'en_transito' THEN 'en_transito'
              WHEN pa.orden_salida_estado = 'cargando' THEN 'cargando'
              WHEN pa.orden_salida_estado = 'remitida' THEN 'remitida'
              WHEN pa.orden_salida_id IS NOT NULL OR pa.pedido_estado = 'agrupado_salida' THEN 'agrupado_salida'
              ELSE pa.pedido_estado::TEXT
            END,
          'FechaHoraSolicitado', pa.fecha_solicitud
        )
        ORDER BY pa.fecha_solicitud ASC
      ),
      '[]'::JSONB
    )
  INTO v_result
  FROM pedidos_activos pa;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- 3. ALIAS RPC SIN PREFIJO: buscar_pedidos_por_cliente
CREATE OR REPLACE FUNCTION public.buscar_pedidos_por_cliente(
  p_cod_cliente TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.wms_buscar_pedidos_por_cliente(p_cod_cliente);
END;
$$;

-- 4. PERMISOS DE EJECUCIÓN PARA ROLES ANÓNIMO, AUTENTICADO Y SERVICIO
GRANT EXECUTE ON FUNCTION public.wms_buscar_pedidos_por_cliente(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buscar_pedidos_por_cliente(TEXT) TO anon, authenticated, service_role;
