import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Pedido = Database['public']['Tables']['pedidos']['Row'];
export type PedidoInsert = Database['public']['Tables']['pedidos']['Insert'];

export const pedidosApi = {
  async listarPedidos(clienteId?: string) {
    try {
      let query = supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(id, razon_social),
          destinatario:destinatarios(id, razon_social, direccion_entrega, localidad, ciudad),
          almacen_origen:almacenes(id, nombre, codigo, direccion),
          detalles:pedidos_detalle(id, cantidad_solicitada, cantidad_reservada, cantidad_separada, articulo_id)
        `)
        .order('fecha_solicitud', { ascending: false });

      if (clienteId) query = query.eq('cliente_id', clienteId);
      const { data, error } = await query;
      if (!error && data) return data;
      if (error && !error.message?.includes('almacenes') && !error.message?.includes('localidad') && !error.message?.includes('schema cache')) {
        throw error;
      }
      console.warn('Fallback en listarPedidos por relación o campo no encontrado en schema cache:', error?.message);
    } catch (err: any) {
      if (!err.message?.includes('almacenes') && !err.message?.includes('localidad') && !err.message?.includes('schema cache')) {
        throw err;
      }
      console.warn('Fallback en listarPedidos sin join directo con almacenes o campos pendientes:', err.message);
    }

    // Fallback: consulta sin el join de almacenes
    let fallbackQuery = supabase
      .from('pedidos')
      .select(`
        *,
        cliente:clientes(id, razon_social),
        destinatario:destinatarios(*),
        detalles:pedidos_detalle(id, cantidad_solicitada, cantidad_reservada, cantidad_separada, articulo_id)
      `)
      .order('fecha_solicitud', { ascending: false });

    if (clienteId) fallbackQuery = fallbackQuery.eq('cliente_id', clienteId);
    const { data: fbData, error: fbError } = await fallbackQuery;
    if (fbError) throw fbError;

    // Si los pedidos tienen almacen_origen_id, enriquecer con los datos del almacén
    try {
      const almacenIds = Array.from(
        new Set((fbData || []).map((p: any) => p.almacen_origen_id).filter(Boolean))
      );
      if (almacenIds.length > 0) {
        const { data: almacenesList } = await supabase
          .from('almacenes')
          .select('id, nombre, codigo, direccion')
          .in('id', almacenIds);

        const almacenesMap = new Map((almacenesList || []).map((a: any) => [a.id, a]));
        return (fbData || []).map((p: any) => ({
          ...p,
          almacen_origen: p.almacen_origen_id ? almacenesMap.get(p.almacen_origen_id) || null : null,
        }));
      }
    } catch {
      // Si la consulta secundaria no prospera, devolver la lista base
    }

    return fbData;
  },

  async obtenerPedidoConDetalle(pedidoId: string) {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          destinatario:destinatarios(*),
          almacen_origen:almacenes(*),
          detalles:pedidos_detalle(
            *,
            articulo:articulos(*),
            tareas_picking:tareas_picking(*)
          )
        `)
        .eq('id', pedidoId)
        .single();
      if (!error && data) return data;
      if (error && !error.message?.includes('almacenes') && !error.message?.includes('schema cache')) {
        throw error;
      }
      console.warn('Fallback en obtenerPedidoConDetalle por relación no encontrada en schema cache:', error?.message);
    } catch (err: any) {
      if (!err.message?.includes('almacenes') && !err.message?.includes('schema cache')) {
        throw err;
      }
      console.warn('Fallback en obtenerPedidoConDetalle sin join directo con almacenes:', err.message);
    }

    // Fallback: consulta sin el join de almacenes
    const { data: fbData, error: fbError } = await supabase
      .from('pedidos')
      .select(`
        *,
        cliente:clientes(*),
        destinatario:destinatarios(*),
        detalles:pedidos_detalle(
          *,
          articulo:articulos(*),
          tareas_picking:tareas_picking(*)
        )
      `)
      .eq('id', pedidoId)
      .single();

    if (fbError) throw fbError;

    if (fbData && (fbData as any).almacen_origen_id) {
      try {
        const { data: alm } = await supabase
          .from('almacenes')
          .select('*')
          .eq('id', (fbData as any).almacen_origen_id)
          .single();
        if (alm) {
          (fbData as any).almacen_origen = alm;
        }
      } catch {
        // Ignorar si falla la consulta secundaria
      }
    }

    return fbData;
  },

  async crearPedido(
    pedido: PedidoInsert,
    detalles: Array<{
      articulo_id: string;
      cantidad_solicitada: number;
    }>
  ) {
    let nuevoPedido: any = null;
    let errPedido: any = null;

    const res = await supabase.from('pedidos').insert(pedido).select().single();
    nuevoPedido = res.data;
    errPedido = res.error;

    // Si falla por columnas nuevas aún no presentes en la caché de Supabase, reintentar con payload base
    if (
      errPedido &&
      (errPedido.message?.includes('almacen_origen_id') ||
        errPedido.message?.includes('modalidad_entrega') ||
        errPedido.message?.includes('schema cache'))
    ) {
      console.warn('Reintentando crear pedido sin campos pendientes de migración:', errPedido.message);
      const { almacen_origen_id, modalidad_entrega, ...pedidoBase } = pedido as any;
      const retryRes = await supabase.from('pedidos').insert(pedidoBase).select().single();
      nuevoPedido = retryRes.data;
      errPedido = retryRes.error;
    }

    if (errPedido) throw errPedido;

    const renglones = detalles.map((d) => ({
      ...d,
      pedido_id: nuevoPedido.id
    }));

    const { data: detallesInsertados, error: errDetalles } = await supabase
      .from('pedidos_detalle')
      .insert(renglones)
      .select();
    if (errDetalles) throw errDetalles;

    return { pedido: nuevoPedido, detalles: detallesInsertados };
  },

  // --- RPC: Asignación y Reserva Automática FEFO/FIFO ---
  async asignarPickingFEFO(pedidoId: string) {
    const { data, error } = await supabase.rpc('wms_asignar_picking_fefo', {
      p_pedido_id: pedidoId
    });
    if (error) throw error;
    return data;
  },

  // --- RPC de Picking con validación de Stock, Kardex y Novedades ---
  async confirmarPicking(params: {
    tareaPickingId: string;
    cantidadRecolectada: number;
    novedad?: string;
  }) {
    const { data, error } = await supabase.rpc('wms_confirmar_picking_con_novedad', {
      p_tarea_picking_id: params.tareaPickingId,
      p_cantidad_recolectada: params.cantidadRecolectada,
      p_novedad: params.novedad || undefined
    });
    if (error) throw error;
    return data;
  },

  // --- RPC: Consolidar en Pallet de Despacho (Packing Station) ---
  async consolidarPalletDespacho(params: {
    pedidoId: string;
    palletSalidaLpn: string;
    totalBultos: number;
    pesoEstimadoKg: number;
    volumenEstimadoM3: number;
    ordenSalidaId?: string;
  }) {
    const { data, error } = await supabase.rpc('wms_consolidar_pallet_despacho', {
      p_pedido_id: params.pedidoId,
      p_pallet_salida_lpn: params.palletSalidaLpn,
      p_total_bultos: params.totalBultos,
      p_peso_estimado_kg: params.pesoEstimadoKg,
      p_volumen_estimado_m3: params.volumenEstimadoM3,
      p_orden_salida_id: params.ordenSalidaId || undefined
    });
    if (error) throw error;
    return data;
  },

  // --- RPC: Emisión de Remito Rx de Tránsito ---
  async emitirRemitoRx(params: {
    pedidoId: string;
    numeroRemitoRx: string;
    cae?: string;
    ordenSalidaId?: string;
    valorDeclaradoTotal?: number;
  }) {
    let rpcResult: any = null;
    try {
      // 1. Intentar llamar con el parámetro extendido p_valor_declarado_total
      const { data, error } = await supabase.rpc('wms_emitir_remito_rx', {
        p_pedido_id: params.pedidoId,
        p_numero_remito_rx: params.numeroRemitoRx,
        p_cae: params.cae || undefined,
        p_orden_salida_id: params.ordenSalidaId || undefined,
        p_valor_declarado_total: params.valorDeclaradoTotal !== undefined ? params.valorDeclaradoTotal : undefined,
      });
      if (error) throw error;
      rpcResult = data;
    } catch (errRpc: any) {
      // Fallback: si la función en la DB tiene la firma anterior de 4 parámetros
      const { data, error } = await supabase.rpc('wms_emitir_remito_rx', {
        p_pedido_id: params.pedidoId,
        p_numero_remito_rx: params.numeroRemitoRx,
        p_cae: params.cae || undefined,
        p_orden_salida_id: params.ordenSalidaId || undefined,
      });
      if (error) throw error;
      rpcResult = data;
    }

    // 2. Si el usuario editó el valor declarado total, asegurar que quede persistido en la fila de remitos_transito
    if (params.valorDeclaradoTotal !== undefined && params.valorDeclaradoTotal >= 0) {
      await supabase
        .from('remitos_transito')
        .update({ valor_declarado_total: params.valorDeclaradoTotal })
        .eq('pedido_id', params.pedidoId);
    }

    return rpcResult;
  },

  // --- Consulta de Remito con información extendida para impresión ---
  async obtenerRemitoPorPedido(pedidoId: string) {
    const { data, error } = await supabase
      .from('remitos_transito')
      .select(`
        *,
        cliente:clientes(*),
        destinatario:destinatarios(*),
        pedido:pedidos(
          *,
          detalles:pedidos_detalle(
            *,
            articulo:articulos(*)
          )
        ),
        orden_salida:ordenes_salida(
          *,
          ruta:rutas_entrega(*)
        )
      `)
      .eq('pedido_id', pedidoId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // --- RPC: Despacho Físico Definitivo del Pedido (Salida de Almacén) ---
  async despacharPedido(pedidoId: string, usuarioId?: string) {
    // 1. Intentar RPC almacenada wms_despachar_pedido
    try {
      const { data, error } = await (supabase as any).rpc('wms_despachar_pedido', {
        p_pedido_id: pedidoId,
        p_usuario_id: usuarioId || undefined,
      });
      if (!error && data && data.exito) {
        return data;
      }
      if (error) console.warn('RPC wms_despachar_pedido aviso:', error.message);
    } catch (e) {
      console.warn('Excepción ejecutando wms_despachar_pedido:', e);
    }

    // 2. Fallback Directo: descontar inventario, registrar kardex y marcar despachado
    const { data: ped, error: errGetPed } = await supabase
      .from('pedidos')
      .select(`
        *,
        detalles:pedidos_detalle(
          id,
          articulo_id,
          cantidad_solicitada,
          cantidad_reservada,
          cantidad_separada,
          articulo:articulos(id, sku, volumen_unitario_m3)
        ),
        tareas:tareas_picking(
          id,
          articulo_id,
          lote_id,
          pallet_origen_id,
          ubicacion_origen_id,
          cantidad_a_recolectar,
          cantidad_recolectada,
          estado
        )
      `)
      .eq('id', pedidoId)
      .single();

    if (errGetPed) throw errGetPed;

    let totalDespachado = 0;
    const tareasPicking = (ped.tareas || []).filter(
      (t: any) => t.estado === 'completada' || Number(t.cantidad_recolectada || 0) > 0
    );

    if (tareasPicking.length > 0) {
      for (const t of tareasPicking) {
        const cant = Number(t.cantidad_recolectada || t.cantidad_a_recolectar || 0);
        if (cant <= 0) continue;

        // Buscar volumen unitario del artículo
        const detItem = (ped.detalles || []).find((d: any) => d.articulo_id === t.articulo_id);
        const volUnit = Number(detItem?.articulo?.volumen_unitario_m3 || 0);
        const volTotal = Math.round(cant * volUnit * 10000) / 10000;

        // Descontar inventario reservado
        const { data: invRow } = await supabase
          .from('inventario')
          .select('id, cantidad_reservada, cantidad_disponible, volumen_m3')
          .eq('cliente_id', ped.cliente_id)
          .eq('articulo_id', t.articulo_id)
          .eq('ubicacion_id', t.ubicacion_origen_id)
          .maybeSingle();

        if (invRow) {
          const nuevaRes = Math.max(0, Number(invRow.cantidad_reservada || 0) - cant);
          const nuevoDisp = Number(invRow.cantidad_disponible || 0);
          const nuevoVol = Math.max(0, Math.round((Number(invRow.volumen_m3 || 0) - volTotal) * 10000) / 10000);
          if (nuevaRes <= 0.001 && nuevoDisp <= 0.001) {
            await supabase.from('inventario').delete().eq('id', invRow.id);
          } else {
            await supabase
              .from('inventario')
              .update({
                cantidad_reservada: nuevaRes,
                volumen_m3: nuevoVol,
                actualizado_en: new Date().toISOString(),
              })
              .eq('id', invRow.id);
          }
        }

        // Registrar movimiento de salida en kardex
        try {
          await (supabase.from('movimientos_inventario') as any).insert({
            cliente_id: ped.cliente_id,
            lote_id: t.lote_id || null,
            articulo_id: t.articulo_id,
            pallet_id: t.pallet_origen_id || null,
            ubicacion_origen_id: t.ubicacion_origen_id || null,
            ubicacion_destino_id: null,
            tipo_movimiento: 'despacho',
            cantidad: cant,
            volumen_m3: volTotal,
            documento_referencia: `DESPACHO-${ped.numero_pedido}`,
            notas: `Salida de almacén por despacho de pedido ${ped.numero_pedido}`,
          });
        } catch {
          // Fallback a tipo picking si 'despacho' enum no estuviera aún
          try {
            await (supabase.from('movimientos_inventario') as any).insert({
              cliente_id: ped.cliente_id,
              lote_id: t.lote_id || null,
              articulo_id: t.articulo_id,
              pallet_id: t.pallet_origen_id || null,
              ubicacion_origen_id: t.ubicacion_origen_id || null,
              ubicacion_destino_id: null,
              tipo_movimiento: 'picking',
              cantidad: cant,
              volumen_m3: volTotal,
              documento_referencia: `DESPACHO-${ped.numero_pedido}`,
              notas: `Salida de almacén por despacho de pedido ${ped.numero_pedido}`,
            });
          } catch (errMov) {
            console.warn('No se pudo registrar asiento kardex en fallback:', errMov);
          }
        }

        totalDespachado += cant;
      }
    } else {
      // Si no hubo tareas de picking registradas, descontar directamente por pedidos_detalle
      for (const d of ped.detalles || []) {
        const cant = Number(d.cantidad_separada || d.cantidad_reservada || d.cantidad_solicitada || 0);
        if (cant <= 0) continue;

        const volUnit = Number(d.articulo?.volumen_unitario_m3 || 0);
        const volTotal = Math.round(cant * volUnit * 10000) / 10000;

        const { data: invRows } = await supabase
          .from('inventario')
          .select('id, cantidad_reservada, cantidad_disponible, volumen_m3')
          .eq('cliente_id', ped.cliente_id)
          .eq('articulo_id', d.articulo_id)
          .order('cantidad_reservada', { ascending: false })
          .limit(1);

        if (invRows && invRows[0]) {
          const invRow = invRows[0];
          const nuevaRes = Math.max(0, Number(invRow.cantidad_reservada || 0) - cant);
          const nuevoDisp = Number(invRow.cantidad_disponible || 0);
          const nuevoVol = Math.max(0, Math.round((Number(invRow.volumen_m3 || 0) - volTotal) * 10000) / 10000);
          if (nuevaRes <= 0.001 && nuevoDisp <= 0.001) {
            await supabase.from('inventario').delete().eq('id', invRow.id);
          } else {
            await supabase
              .from('inventario')
              .update({
                cantidad_reservada: nuevaRes,
                volumen_m3: nuevoVol,
                actualizado_en: new Date().toISOString(),
              })
              .eq('id', invRow.id);
          }

          // Asiento Kardex en fallback directo
          try {
            await (supabase.from('movimientos_inventario') as any).insert({
              cliente_id: ped.cliente_id,
              articulo_id: d.articulo_id,
              tipo_movimiento: 'despacho',
              cantidad: cant,
              volumen_m3: volTotal,
              documento_referencia: `DESPACHO-${ped.numero_pedido}`,
              notas: `Salida de almacén por despacho directo de pedido ${ped.numero_pedido}`,
            });
          } catch {
            // Silencioso si falla
          }
        }

        totalDespachado += cant;
      }
    }

    // Marcar pedido como despachado
    const { data: updatedPed, error: errPed } = await supabase
      .from('pedidos')
      .update({ estado: 'despachado', actualizado_en: new Date().toISOString() })
      .eq('id', pedidoId)
      .select()
      .single();

    if (errPed) throw errPed;

    // Actualizar remito de tránsito con enum válido ('en_transito')
    try {
      await (supabase
        .from('remitos_transito') as any)
        .update({ estado: 'en_transito', actualizado_en: new Date().toISOString() })
        .eq('pedido_id', pedidoId);
    } catch (errRem) {
      console.warn('Aviso: no se pudo actualizar remito:', errRem);
    }

    return {
      exito: true,
      pedido: updatedPed,
      total_unidades_despachadas: totalDespachado,
      fallback: true,
    };
  },

  // --- RPC: Despacho de Orden de Salida Completa ---
  async despacharOrdenSalida(ordenSalidaId: string) {
    try {
      const { data, error } = await (supabase as any).rpc('wms_despachar_orden_salida', {
        p_orden_salida_id: ordenSalidaId,
      });
      if (!error && data) return data;
    } catch (e) {
      console.warn('Excepción ejecutando wms_despachar_orden_salida:', e);
    }

    // Fallback
    const { data: vinculos } = await supabase
      .from('ordenes_salida_pedidos')
      .select('pedido_id')
      .eq('orden_salida_id', ordenSalidaId);

    if (vinculos && vinculos.length > 0) {
      for (const v of vinculos) {
        await pedidosApi.despacharPedido(v.pedido_id);
      }
    }

    await (supabase
      .from('ordenes_salida') as any)
      .update({ estado: 'despachada' })
      .eq('id', ordenSalidaId);

    return { exito: true, ordenSalidaId };
  },

  // --- RPC: Ajustar Pedido al Stock Preparado (Corte de Backorder / Short-ship) ---
  async ajustarPedidoStockPreparado(pedidoId: string) {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_ajustar_pedido_stock_preparado', {
      p_pedido_id: pedidoId
    });
    if (error) throw error;
    return data;
  },

  // --- Creación Masiva de Pedidos con Detalle (Importación Masiva CSV/Excel) ---
  async crearPedidosMasivos(
    lote: Array<{
      pedido: PedidoInsert;
      detalles: Array<{ articulo_id: string; cantidad_solicitada: number }>;
    }>
  ) {
    const resultados: Array<{
      exito: boolean;
      numero_pedido: string;
      pedidoId?: string;
      error?: string;
    }> = [];

    for (const item of lote) {
      try {
        const { data: nuevoPedido, error: errPedido } = await supabase
          .from('pedidos')
          .insert(item.pedido)
          .select()
          .single();

        if (errPedido) throw errPedido;

        const renglones = item.detalles.map((d) => ({
          ...d,
          pedido_id: nuevoPedido.id,
        }));

        const { error: errDetalles } = await supabase
          .from('pedidos_detalle')
          .insert(renglones);

        if (errDetalles) throw errDetalles;

        resultados.push({
          exito: true,
          numero_pedido: item.pedido.numero_pedido,
          pedidoId: nuevoPedido.id,
        });
      } catch (err: any) {
        console.error(`Error importando pedido ${item.pedido.numero_pedido}:`, err);
        resultados.push({
          exito: false,
          numero_pedido: item.pedido.numero_pedido,
          error: err.message || 'Error en inserción',
        });
      }
    }

    return resultados;
  },

  // --- Buscar Pedidos por Cliente en Ejecución (Local y Supa RPC) ---
  buscarPedidosPorCliente,
};

/**
 * Estructura de respuesta de pedidos en ejecución por cliente.
 */
export interface PedidoEnEjecucion {
  NombrePedidoCliente: string;
  DestinatarioNombre: string;
  Estado: string;
  FechaCompromiso: string;
  FechaHoraCompromiso?: string;
  FechaHoraSolicitado?: string;
}

/**
 * Busca y retorna los pedidos de un cliente que se encuentran en estado de ejecución
 * (antes de 'despachado' o 'cancelado').
 *
 * Si el pedido se encuentra asociado a una Orden de Salida activa, progresa a través
 * de los estados de la salida: 'remitida', 'cargando', 'en_transito', 'entregado'.
 * Al cerrarse la salida y completarse el despacho definitivo, pasa a estado final (FIN)
 * y deja de listarse.
 *
 * Soporta invocación tanto vía RPC nativa de Supabase ('wms_buscar_pedidos_por_cliente')
 * como por agregación/consulta directa local para máxima resiliencia offline.
 *
 * @param codCliente Código comercial del cliente (ej: '001', 'CLI01'), UUID o '000' (todos los clientes)
 * @returns Array JSON ordenado ascendentemente por fecha compromiso:
 *          [{ NombrePedidoCliente, DestinatarioNombre, Estado, FechaCompromiso }]
 */
export async function buscarPedidosPorCliente(
  codCliente: string
): Promise<PedidoEnEjecucion[]> {
  const cleanCod = (codCliente || '').trim();
  if (!cleanCod) return [];

  // 1. Invocar RPC nativo de Supabase 'wms_buscar_pedidos_por_cliente'
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      'wms_buscar_pedidos_por_cliente',
      { p_cod_cliente: cleanCod }
    );

    if (!rpcError && Array.isArray(rpcData)) {
      return rpcData as PedidoEnEjecucion[];
    }
    if (rpcError && !rpcError.message?.includes('schema cache')) {
      console.warn('RPC wms_buscar_pedidos_por_cliente aviso/fallback:', rpcError.message);
    }
  } catch (rpcErr: any) {
    console.warn('Fallback local en buscarPedidosPorCliente:', rpcErr?.message);
  }

  // 2. Fallback de agregación y consulta directa sobre tablas de PostgREST
  try {
    const esTodos = cleanCod === '000';
    let clienteId: string | null = null;

    if (!esTodos) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCod)) {
        clienteId = cleanCod;
      } else {
        const { data: cli } = await supabase
          .from('clientes')
          .select('id')
          .or(`codigo.ilike.${cleanCod},codigo.eq.${cleanCod},telefono.eq.${cleanCod},cuit.eq.${cleanCod}`)
          .maybeSingle();

        if (cli?.id) {
          clienteId = cli.id;
        } else {
          return [];
        }
      }
    }

    // Consultar pedidos que no estén cancelados
    let pedidosQuery = supabase
      .from('pedidos')
      .select(`
        id,
        numero_pedido,
        orden_compra_cliente,
        fecha_compromiso_entrega,
        fecha_solicitud,
        estado,
        cliente_id,
        destinatario:destinatarios(id, razon_social)
      `)
      .neq('estado', 'cancelado')
      .order('fecha_compromiso_entrega', { ascending: true });

    if (!esTodos && clienteId) {
      pedidosQuery = pedidosQuery.eq('cliente_id', clienteId);
    }

    const { data: pedidos, error: pedidosErr } = await pedidosQuery;
    if (pedidosErr) throw pedidosErr;
    if (!pedidos || pedidos.length === 0) return [];

    const pedidoIds = pedidos.map((p) => p.id);

    // Obtener vínculos con órdenes de salida
    const { data: vinculos } = await supabase
      .from('ordenes_salida_pedidos')
      .select(`
        pedido_id,
        orden_salida:ordenes_salida(id, estado, creado_en)
      `)
      .in('pedido_id', pedidoIds);

    const salidasMap = new Map<string, { id: string; estado: string; creado_en: string }>();
    if (vinculos) {
      for (const v of vinculos as any[]) {
        if (!v.orden_salida) continue;
        const actual = salidasMap.get(v.pedido_id);
        if (!actual || new Date(v.orden_salida.creado_en) > new Date(actual.creado_en)) {
          salidasMap.set(v.pedido_id, v.orden_salida);
        }
      }
    }

    // Obtener paradas del itinerario para comprobar si fueron entregadas
    const { data: paradas } = await supabase
      .from('rutas_paradas_itinerario')
      .select('pedido_id, estado_entrega')
      .in('pedido_id', pedidoIds);

    const paradasMap = new Map<string, string>();
    if (paradas) {
      for (const p of paradas as any[]) {
        paradasMap.set(p.pedido_id, p.estado_entrega);
      }
    }

    const resultados: PedidoEnEjecucion[] = [];

    for (const p of pedidos as any[]) {
      const os = salidasMap.get(p.id);
      const estadoEntrega = paradasMap.get(p.id);

      // Si la salida está cerrada, ya terminó el ciclo (FIN)
      if (os && os.estado === 'cerrada') {
        continue;
      }

      // Si el pedido está marcado como despachado:
      // Solo continúa si está en una salida activa no cerrada con parada entregada
      if (p.estado === 'despachado') {
        const enSalidaActivaConEntrega =
          os &&
          os.estado !== 'cerrada' &&
          (estadoEntrega === 'entregado' || estadoEntrega === 'con_novedad');
        if (!enSalidaActivaConEntrega) {
          continue; // FIN
        }
      }

      // Determinar Estado operacional en la progresión
      let estadoFinal: string = p.estado;
      if (estadoEntrega === 'entregado') {
        estadoFinal = 'entregado';
      } else if (estadoEntrega === 'con_novedad') {
        estadoFinal = 'con_novedad';
      } else if (os?.estado === 'en_transito') {
        estadoFinal = 'en_transito';
      } else if (os?.estado === 'cargando') {
        estadoFinal = 'cargando';
      } else if (os?.estado === 'remitida') {
        estadoFinal = 'remitida';
      } else if (os?.id || p.estado === 'agrupado_salida') {
        estadoFinal = 'agrupado_salida';
      }

      const destNombre = p.destinatario?.razon_social || 'Sin destinatario';
      const nomPedido = p.numero_pedido || p.orden_compra_cliente || '';
      const fechaComp = p.fecha_compromiso_entrega || p.fecha_solicitud || '';

      resultados.push({
        NombrePedidoCliente: nomPedido,
        DestinatarioNombre: destNombre,
        Estado: estadoFinal,
        FechaCompromiso: fechaComp,
        FechaHoraCompromiso: fechaComp,
        FechaHoraSolicitado: p.fecha_solicitud,
      });
    }

    // Ordenar ascendentemente por fecha compromiso (o fecha solicitud como respaldo)
    resultados.sort(
      (a, b) =>
        new Date(a.FechaCompromiso || a.FechaHoraSolicitado || 0).getTime() -
        new Date(b.FechaCompromiso || b.FechaHoraSolicitado || 0).getTime()
    );

    return resultados;
  } catch (localErr) {
    console.error('Error en fallback local de buscarPedidosPorCliente:', localErr);
    throw localErr;
  }
}
