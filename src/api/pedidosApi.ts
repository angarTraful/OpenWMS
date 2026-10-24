import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';
import { notifyDataChanged } from '../lib/dataSync';

export type Pedido = Database['public']['Tables']['pedidos']['Row'];
export type PedidoInsert = Database['public']['Tables']['pedidos']['Insert'];

export interface DetallePedidoItemRespuesta {
  articulo_nombre: string;
  articulo_descripcion: string;
  sku?: string;
  lote_id: string | null;
  numero_lote?: string | null;
  cantidad: number;
  m3: number;
  tipo_bulto: string;
}

export interface DetallePedidoRespuesta {
  encontrado?: boolean;
  pedido_id: string;
  numero_pedido_cliente: string;
  numero_pedido_wms?: string;
  fecha_compromiso_entrega: string | null;
  destinatario_nombre: string;
  destinatario_direccion_full: string;
  pedidos_detalle: DetallePedidoItemRespuesta[];
}

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
            tareas_picking:tareas_picking(
              *,
              lote:lotes_cliente(id, numero_lote, fecha_vencimiento),
              ubicacion_origen:ubicaciones(id, codigo_etiqueta, pasillo, estante, nivel),
              pallet_origen:pallets_lpn(id, codigo_lpn)
            )
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
          tareas_picking:tareas_picking(
            *,
            lote:lotes_cliente(id, numero_lote, fecha_vencimiento),
            ubicacion_origen:ubicaciones(id, codigo_etiqueta, pasillo, estante, nivel),
            pallet_origen:pallets_lpn(id, codigo_lpn)
          )
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

  // --- Consulta de Pedido con Artículos y Dirección Full (detallePedidoPorId) ---
  async detallePedidoPorId(
    paramOrId: string | { idPedido?: string; nombrePedidoCliente?: string; clienteCodigo?: string },
    clienteCodigoParam?: string
  ): Promise<DetallePedidoRespuesta | null> {
    let idPedido: string | undefined;
    let nombrePedidoCliente: string | undefined;
    let clienteCodigo: string | undefined = clienteCodigoParam;

    if (typeof paramOrId === 'string') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramOrId.trim());
      if (isUuid) {
        idPedido = paramOrId.trim();
      } else {
        nombrePedidoCliente = paramOrId.trim();
      }
    } else if (paramOrId && typeof paramOrId === 'object') {
      idPedido = paramOrId.idPedido;
      nombrePedidoCliente = paramOrId.nombrePedidoCliente;
      clienteCodigo = paramOrId.clienteCodigo || clienteCodigoParam;
    }

    // 1. Intentar RPC nativo de Supabase
    try {
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'wms_obtener_detalle_pedido_por_id',
        {
          p_pedido_id: idPedido || null,
          p_pedido_cliente: nombrePedidoCliente || null,
          p_cliente_codigo: clienteCodigo || null,
        }
      );

      if (!rpcError && rpcData) {
        if (rpcData.encontrado === false || rpcData.error) {
          return null;
        }
        return rpcData as DetallePedidoRespuesta;
      }
      if (rpcError) {
        console.warn('Fallback en detallePedidoPorId (RPC no disponible):', rpcError.message);
      }
    } catch (e) {
      console.warn('Excepción llamando wms_obtener_detalle_pedido_por_id:', e);
    }

    // 2. Fallback local directo en TypeScript sobre tablas de Supabase
    try {
      let resolvedPedidoId = idPedido;

      if (!resolvedPedidoId && nombrePedidoCliente) {
        let clienteId: string | undefined;
        if (clienteCodigo) {
          const isCliUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteCodigo.trim());
          if (isCliUuid) {
            clienteId = clienteCodigo.trim();
          } else {
            const { data: cli } = await supabase
              .from('clientes')
              .select('id')
              .or(`codigo.ilike.${clienteCodigo.trim()},razon_social.ilike.${clienteCodigo.trim()}`)
              .limit(1)
              .maybeSingle();
            if (cli) clienteId = cli.id;
          }
        }

        let q = supabase
          .from('pedidos')
          .select('id')
          .or(`orden_compra_cliente.ilike.${nombrePedidoCliente.trim()},numero_pedido.ilike.${nombrePedidoCliente.trim()}`);

        if (clienteId) {
          q = q.eq('cliente_id', clienteId);
        }

        const { data: foundPed } = await q.order('creado_en', { ascending: false }).limit(1).maybeSingle();
        if (foundPed) {
          resolvedPedidoId = foundPed.id;
        }
      }

      if (!resolvedPedidoId) return null;

      const { data: pedData, error: pedErr } = await supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          orden_compra_cliente,
          fecha_compromiso_entrega,
          cliente_id,
          destinatario:destinatarios(id, razon_social, direccion_entrega, localidad, ciudad),
          detalles:pedidos_detalle(
            id,
            cantidad_solicitada,
            articulo:articulos(id, nombre, descripcion, sku, unidad_medida, volumen_unitario_m3),
            tareas_picking:tareas_picking(id, lote_id, lotes_cliente:lotes_cliente(id, numero_lote))
          )
        `)
        .eq('id', resolvedPedidoId)
        .single();

      if (pedErr || !pedData) return null;

      const dest = (pedData as any).destinatario;
      const direccionPartes = [
        dest?.direccion_entrega,
        dest?.localidad,
        dest?.ciudad,
      ].filter(Boolean);
      const direccionFull = direccionPartes.join(', ');

      const items: DetallePedidoItemRespuesta[] = ((pedData as any).detalles || []).map((d: any) => {
        const art = d.articulo;
        const cant = Number(d.cantidad_solicitada || 0);
        const volUnit = Number(art?.volumen_unitario_m3 || 0);
        const m3Total = Math.round(cant * volUnit * 10000) / 10000;
        const tp = Array.isArray(d.tareas_picking) && d.tareas_picking.length > 0 ? d.tareas_picking[0] : null;

        return {
          articulo_nombre: art?.nombre || 'Artículo sin nombre',
          articulo_descripcion: art?.descripcion || art?.nombre || '',
          sku: art?.sku,
          lote_id: tp?.lote_id || null,
          numero_lote: tp?.lotes_cliente?.numero_lote || null,
          cantidad: cant,
          m3: m3Total,
          tipo_bulto: art?.unidad_medida || 'bulto',
        };
      });

      return {
        encontrado: true,
        pedido_id: pedData.id,
        numero_pedido_cliente: pedData.orden_compra_cliente || pedData.numero_pedido,
        numero_pedido_wms: pedData.numero_pedido,
        fecha_compromiso_entrega: pedData.fecha_compromiso_entrega,
        destinatario_nombre: dest?.razon_social || 'Destinatario no especificado',
        destinatario_direccion_full: direccionFull,
        pedidos_detalle: items,
      };
    } catch (errFallback) {
      console.error('Error en fallback local de detallePedidoPorId:', errFallback);
      return null;
    }
  },

  async crearPedido(
    pedido: PedidoInsert,
    detalles: Array<{
      articulo_id: string;
      cantidad_solicitada: number;
      lote_id?: string | null;
      ubicacion_id?: string | null;
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
      pedido_id: nuevoPedido.id,
      articulo_id: d.articulo_id,
      cantidad_solicitada: Number(d.cantidad_solicitada),
      ...(d.lote_id ? { lote_id: d.lote_id } : {}),
      ...(d.ubicacion_id ? { ubicacion_id: d.ubicacion_id } : {}),
    }));

    let { data: detallesInsertados, error: errDetalles } = await supabase
      .from('pedidos_detalle')
      .insert(renglones)
      .select();

    // Si falla por columnas lote_id o ubicacion_id aún no aplicadas en la base de datos, fallback a renglones base
    if (
      errDetalles &&
      (errDetalles.message?.includes('lote_id') ||
        errDetalles.message?.includes('ubicacion_id') ||
        errDetalles.message?.includes('schema cache'))
    ) {
      console.warn('Fallback en pedidos_detalle sin columnas lote_id/ubicacion_id:', errDetalles.message);
      const renglonesBase = detalles.map((d) => ({
        pedido_id: nuevoPedido.id,
        articulo_id: d.articulo_id,
        cantidad_solicitada: Number(d.cantidad_solicitada),
      }));
      const retry = await supabase.from('pedidos_detalle').insert(renglonesBase).select();
      detallesInsertados = retry.data;
      errDetalles = retry.error;
    }

    if (errDetalles) throw errDetalles;

    notifyDataChanged();
    return { pedido: nuevoPedido, detalles: detallesInsertados };
  },

  // --- RPC: Asignación y Reserva Automática FEFO/FIFO con soporte de lotes manuales ---
  async asignarPickingFEFO(
    pedidoId: string,
    estrategia: 'FEFO' | 'FIFO' = 'FEFO',
    asignacionesManuales?: any[]
  ) {
    const { data, error } = await supabase.rpc('wms_asignar_picking_fefo', {
      p_pedido_id: pedidoId,
      p_estrategia: estrategia,
      p_asignaciones_manuales: (asignacionesManuales && asignacionesManuales.length > 0) ? (asignacionesManuales as any) : ([] as any),
    });
    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- Asignación Integral: Estrategia FEFO/FIFO + Asignación de Roles + Lotes Hardcodeados ---
  async asignarPickingConEstrategia(params: {
    pedidoId: string;
    estrategia: 'FEFO' | 'FIFO';
    operadorId?: string;
    supervisorId?: string;
    controllerId?: string;
    operadorNombre?: string;
    supervisorNombre?: string;
    controllerNombre?: string;
    asignacionesManuales?: any[];
  }) {
    // 1. Ejecutar alocación de stock con la estrategia elegida y posibles lotes hardcodeados
    const { data: resRpc, error: errRpc } = await supabase.rpc('wms_asignar_picking_fefo', {
      p_pedido_id: params.pedidoId,
      p_estrategia: params.estrategia,
      p_asignaciones_manuales: (params.asignacionesManuales && params.asignacionesManuales.length > 0) ? (params.asignacionesManuales as any) : ([] as any),
    });
    if (errRpc) throw errRpc;

    // 2. Si se asignó un Operador de picking, actualizar las tareas de picking generadas
    if (params.operadorId) {
      try {
        await supabase
          .from('tareas_picking')
          .update({ operador_id: params.operadorId })
          .eq('pedido_id', params.pedidoId);
      } catch (errTask) {
        console.warn('Aviso actualizando operador en tareas_picking:', errTask);
      }
    }

    // 3. Actualizar metadatos en el pedido (estrategia y roles asignados)
    try {
      const { data: pedActual } = await supabase
        .from('pedidos')
        .select('observaciones')
        .eq('id', params.pedidoId)
        .single();

      const rolesTagParts: string[] = [];
      rolesTagParts.push(`Estrategia: ${params.estrategia}`);
      if (params.operadorNombre) rolesTagParts.push(`Operador: ${params.operadorNombre}`);
      if (params.supervisorNombre) rolesTagParts.push(`Supervisor: ${params.supervisorNombre}`);
      if (params.controllerNombre) rolesTagParts.push(`Controller: ${params.controllerNombre}`);

      const metaTag = `[${rolesTagParts.join(' | ')}]`;
      const prevObs = pedActual?.observaciones || '';
      const cleanObs = prevObs.replace(/\[Estrategia:.*?\]/g, '').trim();
      const nuevaObs = cleanObs ? `${cleanObs} ${metaTag}` : metaTag;

      await supabase
        .from('pedidos')
        .update({
          observaciones: nuevaObs,
          estrategia_alocacion: params.estrategia,
          operador_picking_id: params.operadorId || null,
          supervisor_picking_id: params.supervisorId || null,
          controller_picking_id: params.controllerId || null,
        } as any)
        .eq('id', params.pedidoId);
    } catch (errPed) {
      console.warn('Aviso actualizando metadatos de roles en pedidos:', errPed);
    }

    notifyDataChanged();
    return resRpc;
  },

  // --- Registro de Control por Muestreo en Zona de Expediciones ---
  async registrarControlMuestreo(params: {
    pedidoId: string;
    usuario: string;
    resultado: 'conforme' | 'con_observacion';
    observaciones?: string;
    itemsMuestreados: number;
  }) {
    const horaActual = new Date().toISOString();
    const resumenResultado = `${params.resultado.toUpperCase()} (${params.itemsMuestreados} artículos verificados)`;

    // Obtener observaciones actuales del pedido
    const { data: ped } = await supabase
      .from('pedidos')
      .select('observaciones')
      .eq('id', params.pedidoId)
      .single();

    const tagMuestreo = `[Muestreo Expedición: ${resumenResultado} por ${params.usuario} - ${new Date().toLocaleTimeString('es-AR')}${params.observaciones ? ` - Obs: ${params.observaciones}` : ''}]`;
    const nuevaObs = ped?.observaciones ? `${ped.observaciones} | ${tagMuestreo}` : tagMuestreo;

    const { data, error } = await supabase
      .from('pedidos')
      .update({
        control_muestreo_completado: true,
        control_muestreo_fecha: horaActual,
        control_muestreo_usuario: params.usuario,
        control_muestreo_resultado: params.resultado,
        observaciones: nuevaObs,
      } as any)
      .eq('id', params.pedidoId)
      .select()
      .single();

    if (error) {
      // Fallback si columnas aún no migradas: asentar en observaciones
      await supabase
        .from('pedidos')
        .update({ observaciones: nuevaObs })
        .eq('id', params.pedidoId);
    }

    notifyDataChanged();
    return data;
  },

  // --- Parcializar Pedido (Fraccionar pedido si no entra en la unidad de transporte) ---
  async parcializarPedido(params: {
    pedidoOriginalId: string;
    itemsADespachar: Array<{ detalleId: string; cantidadADespachar: number }>;
    motivo?: string;
  }) {
    // 1. Obtener datos completos del pedido original
    const pedidoConDetalle = await this.obtenerPedidoConDetalle(params.pedidoOriginalId);
    if (!pedidoConDetalle) throw new Error('Pedido original no encontrado');

    const detallesOriginales = pedidoConDetalle.detalles || [];
    const itemsRestantes: Array<{
      articulo_id: string;
      cantidad_solicitada: number;
      cantidad_reservada: number;
    }> = [];

    let algunRenglonFraccionado = false;

    // Calcular las cantidades a dejar en el pedido original y las que van a nuevo pedido remanente
    for (const d of detallesOriginales) {
      const match = params.itemsADespachar.find((i) => i.detalleId === d.id);
      const cantDespachar = match ? Math.min(match.cantidadADespachar, Number(d.cantidad_solicitada)) : Number(d.cantidad_solicitada);
      const remanente = Math.max(0, Number(d.cantidad_solicitada) - cantDespachar);

      if (remanente > 0) {
        algunRenglonFraccionado = true;
        itemsRestantes.push({
          articulo_id: d.articulo_id,
          cantidad_solicitada: remanente,
          cantidad_reservada: 0,
        });
      }
    }

    if (!algunRenglonFraccionado) {
      throw new Error('No se detectó ningún artículo con remanente para parcializar.');
    }

    // 2. Crear pedido hijo / remanente (Saldo pendiente para viaje 2)
    // Preservar el mismo estado del original (ej. 'preparado') para continuar el flujo sin recomenzar
    const numeroNuevoPedido = `${pedidoConDetalle.numero_pedido}-PARTE2`;
    const obsHijo = `[Fraccionamiento de ${pedidoConDetalle.numero_pedido} por capacidad de carga / unidad de transporte${params.motivo ? ` - Motivo: ${params.motivo}` : ''}]`;
    const estadoHijo = pedidoConDetalle.estado || 'preparado';
    const esPreparado = estadoHijo === 'preparado' || estadoHijo === 'agrupado_salida';

    const { data: pedidoHijo, error: errHijo } = await supabase
      .from('pedidos')
      .insert({
        cliente_id: pedidoConDetalle.cliente_id,
        destinatario_id: pedidoConDetalle.destinatario_id,
        almacen_origen_id: pedidoConDetalle.almacen_origen_id,
        numero_pedido: numeroNuevoPedido,
        orden_compra_cliente: pedidoConDetalle.orden_compra_cliente,
        fecha_compromiso_entrega: pedidoConDetalle.fecha_compromiso_entrega,
        modalidad_entrega: pedidoConDetalle.modalidad_entrega || 'envio_domicilio',
        prioridad: pedidoConDetalle.prioridad || 'normal',
        estado: estadoHijo,
        observaciones: obsHijo,
        pedido_padre_id: pedidoConDetalle.id,
        es_parcializado: true,
        estrategia_alocacion: (pedidoConDetalle as any).estrategia_alocacion || 'FEFO',
        operador_picking_id: (pedidoConDetalle as any).operador_picking_id || null,
        supervisor_picking_id: (pedidoConDetalle as any).supervisor_picking_id || null,
        controller_picking_id: (pedidoConDetalle as any).controller_picking_id || null,
      } as any)
      .select()
      .single();

    if (errHijo) throw errHijo;

    // Insertar renglones en el nuevo pedido hijo (con cantidad_separada igual a solicitada si el pedido ya estaba preparado)
    const renglonesHijo = itemsRestantes.map((r) => ({
      pedido_id: pedidoHijo.id,
      articulo_id: r.articulo_id,
      cantidad_solicitada: r.cantidad_solicitada,
      cantidad_reservada: esPreparado ? r.cantidad_solicitada : 0,
      cantidad_separada: esPreparado ? r.cantidad_solicitada : 0,
    }));

    const { error: errDetHijo } = await supabase.from('pedidos_detalle').insert(renglonesHijo);
    if (errDetHijo) throw errDetHijo;

    // 3. Ajustar cantidades en el pedido original para que coincidan exactamente con lo que se despacha en este viaje
    for (const item of params.itemsADespachar) {
      await supabase
        .from('pedidos_detalle')
        .update({
          cantidad_solicitada: item.cantidadADespachar,
          cantidad_separada: item.cantidadADespachar,
          cantidad_reservada: item.cantidadADespachar,
        })
        .eq('id', item.detalleId);
    }

    // Actualizar pedido original indicando que fue fraccionado
    const obsPadre = `${pedidoConDetalle.observaciones || ''} [Parcializado en viaje 1: Se remite carga parcial. Saldo en pedido ${numeroNuevoPedido}]`.trim();
    await supabase
      .from('pedidos')
      .update({
        observaciones: obsPadre,
        es_parcializado: true,
      } as any)
      .eq('id', pedidoConDetalle.id);

    notifyDataChanged();
    return {
      pedidoOriginalActualizado: pedidoConDetalle.id,
      pedidoRemanenteCreado: pedidoHijo,
    };
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
    notifyDataChanged();
    return data;
  },

  // --- RPC: Reasignar Lote / Ubicación de una Tarea de Picking Pendiente ---
  async reasignarTareaPicking(params: {
    tareaPickingId: string;
    nuevoLoteId: string;
    nuevaUbicacionId: string;
    nuevaCantidad?: number;
  }) {
    const { data, error } = await (supabase as any).rpc('wms_reasignar_tarea_picking', {
      p_tarea_picking_id: params.tareaPickingId,
      p_nuevo_lote_id: params.nuevoLoteId,
      p_nueva_ubicacion_id: params.nuevaUbicacionId,
      p_nueva_cantidad: params.nuevaCantidad ?? null,
    });
    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- RPC: Crear Tarea de Picking Manual (Lote Hardcodeado) ---
  async crearTareaPickingManual(params: {
    pedidoId: string;
    pedidoDetalleId: string;
    articuloId: string;
    loteId: string;
    ubicacionId: string;
    cantidad: number;
    palletId?: string;
  }) {
    const { data, error } = await (supabase as any).rpc('wms_crear_tarea_picking_manual', {
      p_pedido_id: params.pedidoId,
      p_pedido_detalle_id: params.pedidoDetalleId,
      p_articulo_id: params.articuloId,
      p_lote_id: params.loteId,
      p_ubicacion_id: params.ubicacionId,
      p_cantidad: params.cantidad,
      p_pallet_id: params.palletId ?? null,
    });
    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- RPC: Cancelar Tarea de Picking y Liberar Reserva de Stock ---
  async cancelarTareaPicking(tareaPickingId: string) {
    try {
      const { data, error } = await (supabase as any).rpc('wms_cancelar_tarea_picking', {
        p_tarea_picking_id: tareaPickingId,
      });
      if (!error) {
        notifyDataChanged();
        return data;
      }
      if (error && !error.message?.includes('schema cache') && !error.message?.includes('Could not find')) {
        throw error;
      }
    } catch (rpcErr: any) {
      if (!rpcErr.message?.includes('schema cache') && !rpcErr.message?.includes('Could not find')) {
        throw rpcErr;
      }
      console.warn('Fallback local en cancelarTareaPicking:', rpcErr);
    }

    // Fallback directo en DB si RPC falla por schema cache
    const { data: tarea } = await supabase
      .from('tareas_picking')
      .select('*')
      .eq('id', tareaPickingId)
      .single();

    if (tarea) {
      const cant = Number(tarea.cantidad_a_recolectar || 0);
      if (cant > 0) {
        let q = supabase
          .from('inventario')
          .select('id, cantidad_disponible, cantidad_reservada')
          .eq('articulo_id', tarea.articulo_id)
          .eq('ubicacion_id', tarea.ubicacion_origen_id);
        if (tarea.lote_id) q = q.eq('lote_id', tarea.lote_id);
        if (tarea.pallet_origen_id) q = q.eq('pallet_id', tarea.pallet_origen_id);
        const { data: invRows } = await q.limit(1);
        if (invRows && invRows.length > 0) {
          const inv = invRows[0];
          await supabase
            .from('inventario')
            .update({
              cantidad_reservada: Math.max(0, Number(inv.cantidad_reservada || 0) - cant),
              cantidad_disponible: Number(inv.cantidad_disponible || 0) + cant,
              actualizado_en: new Date().toISOString(),
            })
            .eq('id', inv.id);
        }
      }
      if (tarea.pedido_detalle_id) {
        const { data: det } = await supabase
          .from('pedidos_detalle')
          .select('id, cantidad_reservada')
          .eq('id', tarea.pedido_detalle_id)
          .single();
        if (det) {
          await supabase
            .from('pedidos_detalle')
            .update({
              cantidad_reservada: Math.max(0, Number(det.cantidad_reservada || 0) - cant),
            })
            .eq('id', det.id);
        }
      }
      await supabase.from('tareas_picking').delete().eq('id', tareaPickingId);
    }

    notifyDataChanged();
    return { exito: true, mensaje: 'Tarea cancelada y stock liberado.' };
  },

  // --- RPC: Deshacer / Borrar Asignación de Picking y Arrancar de 0 ---
  async deshacerAsignacionPicking(pedidoId: string) {
    try {
      const { data, error } = await (supabase as any).rpc('wms_deshacer_asignacion_picking', {
        p_pedido_id: pedidoId,
      });
      if (!error && data?.exito) {
        notifyDataChanged();
        return data;
      }
      if (error && !error.message?.includes('schema cache') && !error.message?.includes('Could not find')) {
        throw error;
      }
    } catch (rpcErr: any) {
      if (!rpcErr.message?.includes('schema cache') && !rpcErr.message?.includes('Could not find')) {
        throw rpcErr;
      }
      console.warn('wms_deshacer_asignacion_picking no encontrado en cache, ejecutando rollback via tareas...');
    }

    // Cancelar cada tarea existente usando wms_cancelar_tarea_picking o fallback
    const { data: tareas } = await supabase
      .from('tareas_picking')
      .select('id, estado')
      .eq('pedido_id', pedidoId);

    if (tareas && tareas.length > 0) {
      for (const t of tareas) {
        try {
          await this.cancelarTareaPicking(t.id);
        } catch (e) {
          console.warn(`Error cancelando tarea ${t.id} en deshacer asignación:`, e);
        }
      }
    }

    // Limpiar cualquier residuo de tareas_picking para este pedido
    await supabase.from('tareas_picking').delete().eq('pedido_id', pedidoId);

    // Resetear renglones del pedido
    await supabase
      .from('pedidos_detalle')
      .update({
        cantidad_reservada: 0,
        cantidad_separada: 0,
        lote_id: null,
        ubicacion_id: null,
      })
      .eq('pedido_id', pedidoId);

    // Regresar pedido a 'ingresado' y limpiar estrategia
    const { data: pedActualizado, error: errPed } = await supabase
      .from('pedidos')
      .update({
        estado: 'ingresado',
        estrategia_alocacion: null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', pedidoId)
      .select()
      .maybeSingle();

    if (errPed) throw errPed;

    notifyDataChanged();
    return {
      exito: true,
      pedido: pedActualizado,
      mensaje: 'Asignaciones eliminadas y reservas liberadas. El pedido volvió a estado ingresado.',
    };
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
    notifyDataChanged();
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

    // 1. Resolver ordenSalidaId si no se pasó explícitamente
    let resolvedOrdenSalidaId = params.ordenSalidaId || null;
    if (!resolvedOrdenSalidaId) {
      try {
        const { data: osp } = await supabase
          .from('ordenes_salida_pedidos')
          .select('orden_salida_id')
          .eq('pedido_id', params.pedidoId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (osp?.orden_salida_id) {
          resolvedOrdenSalidaId = osp.orden_salida_id;
        }
      } catch (eOs) {
        console.warn('Aviso resolviendo orden_salida_id en emitirRemitoRx:', eOs);
      }
    }

    const rpcPayload = {
      p_pedido_id: params.pedidoId,
      p_numero_remito_rx: params.numeroRemitoRx,
      p_cae: params.cae ? params.cae.trim() : null,
      p_orden_salida_id: resolvedOrdenSalidaId,
      p_valor_declarado_total: typeof params.valorDeclaradoTotal === 'number' && !isNaN(params.valorDeclaradoTotal)
        ? params.valorDeclaradoTotal
        : 0,
    };

    try {
      const { data, error } = await (supabase.rpc as any)('wms_emitir_remito_rx', rpcPayload);
      if (error) throw error;
      rpcResult = data;
    } catch (errRpc: any) {
      // Si la DB sólo tiene la función antigua de 4 parámetros sin p_valor_declarado_total
      if (errRpc?.message?.includes('p_valor_declarado_total') || errRpc?.code === 'PGRST202') {
        const { data: fbData, error: fbError } = await (supabase.rpc as any)('wms_emitir_remito_rx', {
          p_pedido_id: params.pedidoId,
          p_numero_remito_rx: params.numeroRemitoRx,
          p_cae: params.cae ? params.cae.trim() : null,
          p_orden_salida_id: params.ordenSalidaId || null,
        });
        if (fbError) throw fbError;
        rpcResult = fbData;
      } else {
        throw errRpc;
      }
    }

    // 2. Persistir campos directos de remitos_transito (valor declarado y orden_salida_id)
    const patchRemito: any = {};
    if (params.valorDeclaradoTotal !== undefined && params.valorDeclaradoTotal >= 0) {
      patchRemito.valor_declarado_total = params.valorDeclaradoTotal;
    }
    if (resolvedOrdenSalidaId) {
      patchRemito.orden_salida_id = resolvedOrdenSalidaId;
    }
    if (Object.keys(patchRemito).length > 0) {
      await supabase
        .from('remitos_transito')
        .update(patchRemito)
        .eq('pedido_id', params.pedidoId);
    }

    // 3. Garantizar que la emisión del remito mantenga el pedido en 'preparado' (o 'agrupado_salida')
    // El pedido NO debe pasar a 'despachado' hasta que se cargue y entregue en reparto, o se retire por mostrador.
    try {
      const { data: pedActual } = await supabase
        .from('pedidos')
        .select('estado')
        .eq('id', params.pedidoId)
        .single();

      if (pedActual && pedActual.estado !== 'agrupado_salida') {
        await supabase
          .from('pedidos')
          .update({
            estado: 'preparado',
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', params.pedidoId);
      }
    } catch (e) {
      console.warn('Aviso preservando estado preparado del pedido tras remito:', e);
    }

    // 4. Vincular automáticamente con cualquier parada de itinerario existente
    const finalRemitoId = rpcResult?.remito_id;
    if (finalRemitoId) {
      try {
        await supabase
          .from('rutas_paradas_itinerario')
          .update({ remito_id: finalRemitoId })
          .eq('pedido_id', params.pedidoId);
      } catch (errParada) {
        console.warn('Aviso vinculando remito emitido a parada de ruta existente:', errParada);
      }
    }

    // 5. Si pertenece a una orden de salida, actualizar estado a 'remitida' si todos los pedidos tienen remito
    if (resolvedOrdenSalidaId) {
      try {
        const { data: pedidosSalida } = await supabase
          .from('ordenes_salida_pedidos')
          .select('pedido_id')
          .eq('orden_salida_id', resolvedOrdenSalidaId);

        const ids = (pedidosSalida || []).map((p: any) => p.pedido_id);
        if (ids.length > 0) {
          const { data: remitosSalida } = await supabase
            .from('remitos_transito')
            .select('pedido_id')
            .in('pedido_id', ids);

          const remitidosSet = new Set((remitosSalida || []).map((r: any) => r.pedido_id));
          const todoRemitido = ids.every((id: string) => remitidosSet.has(id));

          if (todoRemitido) {
            await supabase
              .from('ordenes_salida')
              .update({ estado: 'remitida', actualizado_en: new Date().toISOString() })
              .eq('id', resolvedOrdenSalidaId)
              .in('estado', ['planificacion', 'consolidando_pallets']);
          } else {
            await supabase
              .from('ordenes_salida')
              .update({ estado: 'consolidando_pallets', actualizado_en: new Date().toISOString() })
              .eq('id', resolvedOrdenSalidaId)
              .eq('estado', 'planificacion');
          }
        }
      } catch (errSync) {
        console.warn('Aviso sincronizando estado orden salida en emitirRemitoRx:', errSync);
      }
    }

    notifyDataChanged();
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

  // --- Despacho Físico Definitivo del Pedido (Salida de Almacén) ---
  // Unifica el asiento de Kardex sobre el MISMO registro existente de Picking:
  // - Si fue reparto/entrega -> tipo 'entregado'
  // - Si fue retiro en puerta -> tipo 'despacho'
  // - Deduce físicamente de 'inventario' el stock reservado/disponible
  async despacharPedido(pedidoId: string, _usuarioId?: string) {
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

        // Descontar inventario físico (primero de cantidad_reservada, luego de cantidad_disponible)
        let cantRestante = cant;
        const { data: invRow } = await supabase
          .from('inventario')
          .select('id, cantidad_reservada, cantidad_disponible, volumen_m3')
          .eq('cliente_id', ped.cliente_id)
          .eq('articulo_id', t.articulo_id)
          .eq('ubicacion_id', t.ubicacion_origen_id)
          .maybeSingle();

        if (invRow) {
          const cantResActual = Number(invRow.cantidad_reservada || 0);
          const cantDispActual = Number(invRow.cantidad_disponible || 0);

          const dedRes = Math.min(cantResActual, cantRestante);
          cantRestante -= dedRes;

          const dedDisp = Math.min(cantDispActual, cantRestante);
          cantRestante -= dedDisp;

          const nuevaRes = Math.max(0, cantResActual - dedRes);
          const nuevoDisp = Math.max(0, cantDispActual - dedDisp);
          const dedVol = Math.round((dedRes + dedDisp) * volUnit * 10000) / 10000;
          const nuevoVol = Math.max(0, Math.round((Number(invRow.volumen_m3 || 0) - dedVol) * 10000) / 10000);

          if (nuevaRes <= 0.001 && nuevoDisp <= 0.001) {
            await supabase.from('inventario').delete().eq('id', invRow.id);
          } else {
            await supabase
              .from('inventario')
              .update({
                cantidad_reservada: nuevaRes,
                cantidad_disponible: nuevoDisp,
                volumen_m3: nuevoVol,
                actualizado_en: new Date().toISOString(),
              })
              .eq('id', invRow.id);
          }
        }

        // Si aún queda remanente, descontar de cualquier otro registro con stock del artículo
        if (cantRestante > 0) {
          const { data: fallbackRows } = await supabase
            .from('inventario')
            .select('id, cantidad_reservada, cantidad_disponible, volumen_m3')
            .eq('cliente_id', ped.cliente_id)
            .eq('articulo_id', t.articulo_id)
            .order('cantidad_reservada', { ascending: false });

          if (fallbackRows) {
            for (const fRow of fallbackRows) {
              if (cantRestante <= 0) break;
              const fRes = Number(fRow.cantidad_reservada || 0);
              const fDisp = Number(fRow.cantidad_disponible || 0);
              if (fRes <= 0 && fDisp <= 0) continue;

              const dedR = Math.min(fRes, cantRestante);
              cantRestante -= dedR;
              const dedD = Math.min(fDisp, cantRestante);
              cantRestante -= dedD;

              const nRes = Math.max(0, fRes - dedR);
              const nDisp = Math.max(0, fDisp - dedD);
              const nVol = Math.max(0, Math.round((Number(fRow.volumen_m3 || 0) - (dedR + dedD) * volUnit) * 10000) / 10000);

              if (nRes <= 0.001 && nDisp <= 0.001) {
                await supabase.from('inventario').delete().eq('id', fRow.id);
              } else {
                await supabase
                  .from('inventario')
                  .update({
                    cantidad_reservada: nRes,
                    cantidad_disponible: nDisp,
                    volumen_m3: nVol,
                    actualizado_en: new Date().toISOString(),
                  })
                  .eq('id', fRow.id);
              }
            }
          }
        }

        try {
          const esRetiroPuerta = ped.modalidad_entrega === 'retiro_deposito' || (ped.modalidad_entrega as string) === 'retiro';
          const tipoFinal = esRetiroPuerta ? 'despacho' : 'entregado';
          const estadoFinal = esRetiroPuerta ? 'despachado' : 'entregado';
          const docFinal = (esRetiroPuerta ? 'DESPACHO-' : 'ENTREGA-') + ped.numero_pedido;

          let movExistenteId: string | null = null;
          // 1. Buscar por pedido_id y articulo_id
          const { data: m1 } = await (supabase.from('movimientos_inventario') as any)
            .select('id')
            .eq('pedido_id', ped.id)
            .eq('articulo_id', t.articulo_id)
            .order('fecha_hora', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (m1?.id) {
            movExistenteId = m1.id;
          } else {
            // 2. Fallback: buscar por documento_referencia conteniendo el numero_pedido
            const { data: m2 } = await (supabase.from('movimientos_inventario') as any)
              .select('id')
              .ilike('documento_referencia', `%${ped.numero_pedido}%`)
              .eq('articulo_id', t.articulo_id)
              .order('fecha_hora', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (m2?.id) movExistenteId = m2.id;
          }

          if (movExistenteId) {
            await (supabase.from('movimientos_inventario') as any)
              .update({
                tipo_movimiento: tipoFinal,
                estado: estadoFinal,
                documento_referencia: docFinal,
                cantidad: cant,
                volumen_m3: volTotal,
                pedido_id: ped.id,
                notas: esRetiroPuerta
                  ? `Salida de almacén - Retirado en puerta (Despachado) pedido ${ped.numero_pedido}`
                  : `Salida de almacén - Reparto / Entrega (Entregado) pedido ${ped.numero_pedido}`,
                fecha_hora: new Date().toISOString(),
              })
              .eq('id', movExistenteId);
          } else {
            await (supabase.from('movimientos_inventario') as any).insert({
              cliente_id: ped.cliente_id,
              lote_id: t.lote_id || null,
              articulo_id: t.articulo_id,
              pallet_id: t.pallet_origen_id || null,
              ubicacion_origen_id: t.ubicacion_origen_id || null,
              ubicacion_destino_id: null,
              tipo_movimiento: tipoFinal,
              estado: estadoFinal,
              pedido_id: ped.id,
              cantidad: cant,
              volumen_m3: volTotal,
              documento_referencia: docFinal,
              notas: esRetiroPuerta
                ? `Salida de almacén - Retirado en puerta (Despachado) pedido ${ped.numero_pedido}`
                : `Salida de almacén - Reparto / Entrega (Entregado) pedido ${ped.numero_pedido}`,
            });
          }
        } catch (errMov) {
          console.warn('Aviso actualizando Kardex en fallback:', errMov);
        }

        totalDespachado += cant;
      }
    } else {
      // Si no hubo tareas de picking registradas, descontar directamente por pedidos_detalle
      const esRetiroPuerta = ped.modalidad_entrega === 'retiro_deposito';
      const tipoFinal = esRetiroPuerta ? 'despacho' : 'entregado';
      const estadoFinal = esRetiroPuerta ? 'despachado' : 'entregado';
      const docFinal = (esRetiroPuerta ? 'DESPACHO-' : 'ENTREGA-') + ped.numero_pedido;

      for (const d of ped.detalles || []) {
        const cant = Number(d.cantidad_separada || d.cantidad_reservada || d.cantidad_solicitada || 0);
        if (cant <= 0) continue;

        const volUnit = Number(d.articulo?.volumen_unitario_m3 || 0);
        const volTotal = Math.round(cant * volUnit * 10000) / 10000;
        let cantRestante = cant;

        const { data: invRows } = await supabase
          .from('inventario')
          .select('id, cantidad_reservada, cantidad_disponible, volumen_m3')
          .eq('cliente_id', ped.cliente_id)
          .eq('articulo_id', d.articulo_id)
          .order('cantidad_reservada', { ascending: false });

        if (invRows && invRows.length > 0) {
          for (const invRow of invRows) {
            if (cantRestante <= 0) break;
            const cantResActual = Number(invRow.cantidad_reservada || 0);
            const cantDispActual = Number(invRow.cantidad_disponible || 0);
            if (cantResActual <= 0 && cantDispActual <= 0) continue;

            const dedRes = Math.min(cantResActual, cantRestante);
            cantRestante -= dedRes;

            const dedDisp = Math.min(cantDispActual, cantRestante);
            cantRestante -= dedDisp;

            const nuevaRes = Math.max(0, cantResActual - dedRes);
            const nuevoDisp = Math.max(0, cantDispActual - dedDisp);
            const dedVol = Math.round((dedRes + dedDisp) * volUnit * 10000) / 10000;
            const nuevoVol = Math.max(0, Math.round((Number(invRow.volumen_m3 || 0) - dedVol) * 10000) / 10000);

            if (nuevaRes <= 0.001 && nuevoDisp <= 0.001) {
              await supabase.from('inventario').delete().eq('id', invRow.id);
            } else {
              await supabase
                .from('inventario')
                .update({
                  cantidad_reservada: nuevaRes,
                  cantidad_disponible: nuevoDisp,
                  volumen_m3: nuevoVol,
                  actualizado_en: new Date().toISOString(),
                })
                .eq('id', invRow.id);
            }
          }

          // Actualizar en el mismo registro o insertar si no existía
          try {
            let movExistenteId: string | null = null;
            const { data: m1 } = await (supabase.from('movimientos_inventario') as any)
              .select('id')
              .eq('pedido_id', ped.id)
              .eq('articulo_id', d.articulo_id)
              .order('fecha_hora', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (m1?.id) {
              movExistenteId = m1.id;
            } else {
              const { data: m2 } = await (supabase.from('movimientos_inventario') as any)
                .select('id')
                .ilike('documento_referencia', `%${ped.numero_pedido}%`)
                .eq('articulo_id', d.articulo_id)
                .order('fecha_hora', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (m2?.id) movExistenteId = m2.id;
            }

            if (movExistenteId) {
              await (supabase.from('movimientos_inventario') as any)
                .update({
                  tipo_movimiento: tipoFinal,
                  estado: estadoFinal,
                  documento_referencia: docFinal,
                  cantidad: cant,
                  volumen_m3: volTotal,
                  pedido_id: ped.id,
                  notas: esRetiroPuerta
                    ? `Salida directa - Retirado en puerta (Despachado) pedido ${ped.numero_pedido}`
                    : `Salida directa - Reparto / Entrega (Entregado) pedido ${ped.numero_pedido}`,
                  fecha_hora: new Date().toISOString(),
                })
                .eq('id', movExistenteId);
            } else {
              await (supabase.from('movimientos_inventario') as any).insert({
                cliente_id: ped.cliente_id,
                articulo_id: d.articulo_id,
                tipo_movimiento: tipoFinal,
                estado: estadoFinal,
                pedido_id: ped.id,
                cantidad: cant,
                volumen_m3: volTotal,
                documento_referencia: docFinal,
                notas: esRetiroPuerta
                  ? `Salida directa - Retirado en puerta (Despachado) pedido ${ped.numero_pedido}`
                  : `Salida directa - Reparto / Entrega (Entregado) pedido ${ped.numero_pedido}`,
              });
            }
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

    // Actualizar remito de tránsito con estado 'entregado_conforme'
    try {
      await (supabase
        .from('remitos_transito') as any)
        .update({ estado: 'entregado_conforme', actualizado_en: new Date().toISOString() })
        .eq('pedido_id', pedidoId);
    } catch (errRem) {
      console.warn('Aviso: no se pudo actualizar remito:', errRem);
    }

    notifyDataChanged();

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
      if (!error && data) {
        notifyDataChanged();
        return data;
      }
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
      .update({ estado: 'cerrada', actualizado_en: new Date().toISOString() })
      .eq('id', ordenSalidaId);

    notifyDataChanged();

    return { exito: true, ordenSalidaId };
  },

  // --- RPC: Ajustar Pedido al Stock Preparado (Corte de Backorder / Short-ship) ---
  async ajustarPedidoStockPreparado(pedidoId: string) {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_ajustar_pedido_stock_preparado', {
      p_pedido_id: pedidoId
    });
    if (error) throw error;
    notifyDataChanged();
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

    notifyDataChanged();
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
