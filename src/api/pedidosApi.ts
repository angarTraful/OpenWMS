import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Pedido = Database['public']['Tables']['pedidos']['Row'];
export type PedidoInsert = Database['public']['Tables']['pedidos']['Insert'];

export const pedidosApi = {
  async listarPedidos(clienteId?: string) {
    let query = supabase
      .from('pedidos')
      .select(`
        *,
        cliente:clientes(id, razon_social),
        destinatario:destinatarios(id, razon_social, direccion_entrega, ciudad),
        detalles:pedidos_detalle(id, cantidad_solicitada, cantidad_reservada, cantidad_separada, articulo_id)
      `)
      .order('fecha_solicitud', { ascending: false });

    if (clienteId) query = query.eq('cliente_id', clienteId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async obtenerPedidoConDetalle(pedidoId: string) {
    const { data, error } = await supabase
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
    if (error) throw error;
    return data;
  },

  async crearPedido(
    pedido: PedidoInsert,
    detalles: Array<{
      articulo_id: string;
      cantidad_solicitada: number;
    }>
  ) {
    const { data: nuevoPedido, error: errPedido } = await supabase
      .from('pedidos')
      .insert(pedido)
      .select()
      .single();
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
  }) {
    const { data, error } = await supabase.rpc('wms_emitir_remito_rx', {
      p_pedido_id: params.pedidoId,
      p_numero_remito_rx: params.numeroRemitoRx,
      p_cae: params.cae || undefined,
      p_orden_salida_id: params.ordenSalidaId || undefined
    });
    if (error) throw error;
    return data;
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
          if (nuevaRes <= 0.001 && nuevoDisp <= 0.001) {
            await supabase.from('inventario').delete().eq('id', invRow.id);
          } else {
            await supabase
              .from('inventario')
              .update({
                cantidad_reservada: nuevaRes,
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
            volumen_m3: 0,
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
              volumen_m3: 0,
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

        const { data: invRows } = await supabase
          .from('inventario')
          .select('id, cantidad_reservada, cantidad_disponible')
          .eq('cliente_id', ped.cliente_id)
          .eq('articulo_id', d.articulo_id)
          .order('cantidad_reservada', { ascending: false })
          .limit(1);

        if (invRows && invRows[0]) {
          const invRow = invRows[0];
          const nuevaRes = Math.max(0, Number(invRow.cantidad_reservada || 0) - cant);
          const nuevoDisp = Number(invRow.cantidad_disponible || 0);
          if (nuevaRes <= 0.001 && nuevoDisp <= 0.001) {
            await supabase.from('inventario').delete().eq('id', invRow.id);
          } else {
            await supabase
              .from('inventario')
              .update({
                cantidad_reservada: nuevaRes,
                actualizado_en: new Date().toISOString(),
              })
              .eq('id', invRow.id);
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
  }
};
