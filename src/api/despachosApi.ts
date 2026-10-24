import { supabase } from './supabaseClient';
import { pedidosApi } from './pedidosApi';
import type { Database } from '../../types/database.types';
import { notifyDataChanged } from '../lib/dataSync';

export type OrdenSalida = Database['public']['Tables']['ordenes_salida']['Row'];
export type RemitoTransito = Database['public']['Tables']['remitos_transito']['Row'];
export type RutaEntrega = Database['public']['Tables']['rutas_entrega']['Row'];

export const despachosApi = {
  // --- Órdenes de Salida Consolidadas ---
  async listarOrdenesSalida() {
    const { data, error } = await supabase
      .from('ordenes_salida')
      .select(`
        *,
        almacen:almacenes(id, nombre),
        pedidos_asociados:ordenes_salida_pedidos(
          pedido:pedidos(id, numero_pedido, cliente:clientes(razon_social), destinatario:destinatarios(razon_social, direccion_entrega))
        ),
        remitos:remitos_transito(*),
        ruta:rutas_entrega(*)
      `)
      .order('fecha_salida_programada', { ascending: false });
    if (error) throw error;
    return data;
  },

  async crearOrdenSalida(
    almacenId: string,
    numeroOrdenSalida: string,
    pedidosIds: string[],
    fechaSalidaProgramada?: string
  ) {
    const { data: orden, error: errOrden } = await supabase
      .from('ordenes_salida')
      .insert({
        almacen_id: almacenId,
        numero_orden_salida: numeroOrdenSalida,
        fecha_salida_programada: fechaSalidaProgramada || null,
        estado: 'planificacion'
      })
      .select()
      .single();
    if (errOrden) throw errOrden;

    // Vincular pedidos
    const vinculos = pedidosIds.map((pid) => ({
      orden_salida_id: orden.id,
      pedido_id: pid
    }));

    const { error: errVinculos } = await supabase.from('ordenes_salida_pedidos').insert(vinculos);
    if (errVinculos) throw errVinculos;

    if (pedidosIds.length > 0) {
      // 1. Actualizar estado de los pedidos a 'agrupado_salida' si estaban en 'preparado'
      await supabase
        .from('pedidos')
        .update({ estado: 'agrupado_salida', actualizado_en: new Date().toISOString() })
        .in('id', pedidosIds)
        .eq('estado', 'preparado');

      // 2. Vincular remitos de tránsito existentes de estos pedidos a la nueva orden de salida
      await supabase
        .from('remitos_transito')
        .update({ orden_salida_id: orden.id })
        .in('pedido_id', pedidosIds);

      // 3. Sincronizar estado inicial de la orden de salida
      await despachosApi.sincronizarEstadoOrdenSalida(orden.id);
    }

    notifyDataChanged();
    return orden;
  },

  // --- Actualizar Estado de Orden de Salida ---
  async actualizarEstadoOrdenSalida(
    ordenSalidaId: string,
    nuevoEstado: 'planificacion' | 'consolidando_pallets' | 'remitida' | 'cargando' | 'en_transito' | 'cerrada'
  ) {
    const { data, error } = await supabase
      .from('ordenes_salida')
      .update({
        estado: nuevoEstado,
        actualizado_en: new Date().toISOString()
      })
      .eq('id', ordenSalidaId)
      .select()
      .single();

    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- Sincronizar Estado de Orden de Salida con Rutas y Remitos ---
  async sincronizarEstadoOrdenSalida(ordenSalidaId: string) {
    if (!ordenSalidaId) return null;
    try {
      const { data: orden, error: errOrden } = await supabase
        .from('ordenes_salida')
        .select(`
          id,
          estado,
          pedidos_asociados:ordenes_salida_pedidos(pedido_id),
          ruta:rutas_entrega(id, estado)
        `)
        .eq('id', ordenSalidaId)
        .single();

      if (errOrden || !orden) return null;

      const ruta = Array.isArray(orden.ruta) ? orden.ruta[0] : orden.ruta;
      let estadoDeseado: 'planificacion' | 'consolidando_pallets' | 'remitida' | 'cargando' | 'en_transito' | 'cerrada' = orden.estado;

      if (ruta) {
        if (ruta.estado === 'itinerario_cumplido') {
          estadoDeseado = 'cerrada';
        } else if (ruta.estado === 'en_viaje') {
          estadoDeseado = 'en_transito';
        } else if (ruta.estado === 'en_carga') {
          estadoDeseado = 'cargando';
        }
      }

      if (!ruta || (ruta.estado !== 'en_viaje' && ruta.estado !== 'en_carga' && ruta.estado !== 'itinerario_cumplido')) {
        const pedidoIds = (orden.pedidos_asociados || []).map((p: any) => p.pedido_id);
        if (pedidoIds.length > 0) {
          const { data: remitos } = await supabase
            .from('remitos_transito')
            .select('id, pedido_id')
            .in('pedido_id', pedidoIds);

          const remitosPedidosSet = new Set((remitos || []).map((r: any) => r.pedido_id));
          const totalPedidos = pedidoIds.length;
          const pedidosConRemito = pedidoIds.filter((pid: string) => remitosPedidosSet.has(pid)).length;

          if (pedidosConRemito === totalPedidos && totalPedidos > 0) {
            estadoDeseado = 'remitida';
          } else if (pedidosConRemito > 0) {
            estadoDeseado = 'consolidando_pallets';
          } else {
            estadoDeseado = 'planificacion';
          }
        }
      }

      if (orden.estado !== estadoDeseado) {
        const { data: updated } = await supabase
          .from('ordenes_salida')
          .update({ estado: estadoDeseado, actualizado_en: new Date().toISOString() })
          .eq('id', ordenSalidaId)
          .select()
          .single();
        return updated;
      }
      return orden;
    } catch (e) {
      console.warn('Error sincronizando estado orden salida:', e);
      return null;
    }
  },

  // --- Remito Rx de Tránsito ---
  async emitirRemitoRx(remito: Database['public']['Tables']['remitos_transito']['Insert']) {
    const { data, error } = await supabase.from('remitos_transito').insert(remito).select().single();
    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- Ruta de Entrega e Itinerario ---
  async asignarRuta(
    ruta: Database['public']['Tables']['rutas_entrega']['Insert'],
    paradas: Array<{
      destinatario_id: string;
      pedido_id: string;
      remito_id?: string | null;
      secuencia_parada: number;
      hora_estimada_arribo?: string | null;
    }>
  ) {
    const { data: nuevaRuta, error: errRuta } = await supabase
      .from('rutas_entrega')
      .insert(ruta)
      .select()
      .single();
    if (errRuta) throw errRuta;

    const paradasInsert = paradas.map((p) => ({
      ...p,
      ruta_id: nuevaRuta.id
    }));

    const { data: paradasCreadas, error: errParadas } = await supabase
      .from('rutas_paradas_itinerario')
      .insert(paradasInsert)
      .select();
    if (errParadas) throw errParadas;

    // Asegurar que los remitos de las paradas tengan orden_salida_id
    if (ruta.orden_salida_id) {
      for (const p of paradas) {
        if (p.remito_id) {
          await supabase
            .from('remitos_transito')
            .update({ orden_salida_id: ruta.orden_salida_id })
            .eq('id', p.remito_id);
        } else if (p.pedido_id) {
          await supabase
            .from('remitos_transito')
            .update({ orden_salida_id: ruta.orden_salida_id })
            .eq('pedido_id', p.pedido_id);
        }
      }
      await despachosApi.sincronizarEstadoOrdenSalida(ruta.orden_salida_id);
    }

    notifyDataChanged();
    return { ruta: nuevaRuta, itinerario: paradasCreadas };
  },

  // --- Listar Remitos Rx Emitidos ---
  async listarRemitos(clienteId?: string) {
    let query = supabase
      .from('remitos_transito')
      .select(`
        *,
        cliente:clientes(id, razon_social, codigo),
        destinatario:destinatarios(id, razon_social, direccion_entrega, ciudad),
        pedido:pedidos(id, numero_pedido, estado),
        orden_salida:ordenes_salida(id, numero_orden_salida, estado)
      `)
      .order('fecha_emision', { ascending: false });

    if (clienteId) query = query.eq('cliente_id', clienteId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // --- Listar Rutas de Entrega con Itinerario y Paradas ---
  async listarRutasConParadas(almacenId?: string) {
    const { data, error } = await supabase
      .from('rutas_entrega')
      .select(`
        *,
        orden_salida:ordenes_salida(
          id,
          numero_orden_salida,
          almacen_id,
          almacen:almacenes(id, nombre, direccion)
        ),
        paradas:rutas_paradas_itinerario(
          *,
          destinatario:destinatarios(id, razon_social, direccion_entrega, ciudad, contacto_recepcion, telefono, ventana_horaria_entrega),
          pedido:pedidos(id, numero_pedido, orden_compra_cliente, cliente:clientes(razon_social)),
          remito:remitos_transito(id, numero_remito_rx, total_bultos, peso_total_kg, volumen_total_m3)
        )
      `)
      .order('creado_en', { ascending: false });
    if (error) throw error;

    let res = data || [];
    if (almacenId) {
      res = res.filter((r: any) => !r.orden_salida?.almacen_id || r.orden_salida?.almacen_id === almacenId);
    }

    // Ordenar paradas de cada ruta por secuencia_parada
    return res.map((r: any) => ({
      ...r,
      paradas: (r.paradas || []).sort(
        (a: any, b: any) => (a.secuencia_parada || 0) - (b.secuencia_parada || 0)
      ),
    }));
  },

  // --- Obtener Ruta por ID con detalle completo para Tablet Chofer ---
  async obtenerRutaPorId(rutaId: string) {
    const { data, error } = await supabase
      .from('rutas_entrega')
      .select(`
        *,
        orden_salida:ordenes_salida(
          id,
          numero_orden_salida,
          almacen_id,
          almacen:almacenes(id, nombre, direccion)
        ),
        paradas:rutas_paradas_itinerario(
          *,
          destinatario:destinatarios(
            id,
            razon_social,
            direccion_entrega,
            ciudad,
            contacto_recepcion,
            telefono,
            ventana_horaria_entrega
          ),
          pedido:pedidos(
            id,
            numero_pedido,
            orden_compra_cliente,
            cliente:clientes(id, razon_social),
            detalles:pedidos_detalle(
              id,
              cantidad_solicitada,
              cantidad_separada,
              articulo:articulos(id, sku, nombre, unidad_medida)
            )
          ),
          remito:remitos_transito(
            id,
            numero_remito_rx,
            total_bultos,
            total_pallets,
            peso_total_kg,
            volumen_total_m3
          )
        )
      `)
      .eq('id', rutaId)
      .single();

    if (error) throw error;
    if (data && data.paradas) {
      data.paradas.sort((a: any, b: any) => (a.secuencia_parada || 0) - (b.secuencia_parada || 0));
    }
    return data;
  },

  // --- Actualizar Estado de la Ruta (Programada, En Viaje, Finalizada) ---
  async actualizarEstadoRuta(
    rutaId: string,
    nuevoEstado: 'programada' | 'en_carga' | 'en_viaje' | 'itinerario_cumplido',
    fechaSalidaReal?: string
  ) {
    const updatePayload: any = {
      estado: nuevoEstado,
    };
    if (nuevoEstado === 'en_viaje') {
      updatePayload.fecha_hora_salida_real = fechaSalidaReal || new Date().toISOString();
    }

    const { data: rutaActualizada, error } = await supabase
      .from('rutas_entrega')
      .update(updatePayload)
      .eq('id', rutaId)
      .select(`
        *,
        paradas:rutas_paradas_itinerario(*)
      `)
      .single();

    if (error) throw error;

    const ordenSalidaId = rutaActualizada?.orden_salida_id;
    if (ordenSalidaId) {
      if (nuevoEstado === 'en_carga') {
        await supabase
          .from('ordenes_salida')
          .update({ estado: 'cargando', actualizado_en: new Date().toISOString() })
          .eq('id', ordenSalidaId);
      } else if (nuevoEstado === 'en_viaje') {
        await supabase
          .from('ordenes_salida')
          .update({ estado: 'en_transito', actualizado_en: new Date().toISOString() })
          .eq('id', ordenSalidaId);

        // Actualizar remitos de la orden a 'en_transito'
        await supabase
          .from('remitos_transito')
          .update({ estado: 'en_transito', orden_salida_id: ordenSalidaId } as any)
          .eq('orden_salida_id', ordenSalidaId);

        // Asegurar vinculación y estado para los remitos de las paradas
        const paradas = rutaActualizada.paradas || [];
        for (const p of paradas) {
          if (p.remito_id) {
            await supabase
              .from('remitos_transito')
              .update({ estado: 'en_transito', orden_salida_id: ordenSalidaId } as any)
              .eq('id', p.remito_id);
          } else if (p.pedido_id) {
            await supabase
              .from('remitos_transito')
              .update({ estado: 'en_transito', orden_salida_id: ordenSalidaId } as any)
              .eq('pedido_id', p.pedido_id);
          }
        }
      } else if (nuevoEstado === 'itinerario_cumplido') {
        await supabase
          .from('ordenes_salida')
          .update({ estado: 'cerrada', actualizado_en: new Date().toISOString() })
          .eq('id', ordenSalidaId);
      }
    }

    notifyDataChanged();
    return rutaActualizada;
  },

  // --- Registrar Entrega de Parada (Tablet Chofer) con Conformidad o Novedad y Geoposición ---
  async registrarEntregaParada(params: {
    paradaId: string;
    rutaId: string;
    pedidoId?: string;
    remitoId?: string;
    estadoEntrega: 'entregado' | 'con_novedad';
    receptorNombre?: string;
    receptorDocumento?: string;
    firmaDigital?: string; // Data URL o Base64
    motivoNovedad?: string;
    fotoRemitoUrl?: string;
    observaciones?: string;
    latitudEntrega?: number | null;
    longitudEntrega?: number | null;
  }) {
    let targetPedidoId = params.pedidoId;
    let targetRemitoId = params.remitoId;

    // Si falta algún ID, resolverlo desde la fila de la parada
    if (!targetPedidoId || !targetRemitoId) {
      try {
        const { data: pData } = await supabase
          .from('rutas_paradas_itinerario')
          .select('pedido_id, remito_id')
          .eq('id', params.paradaId)
          .maybeSingle();
        if (pData) {
          if (!targetPedidoId && pData.pedido_id) targetPedidoId = pData.pedido_id;
          if (!targetRemitoId && pData.remito_id) targetRemitoId = pData.remito_id;
        }
      } catch (e) {
        console.warn('Error resolviendo IDs de parada en registrarEntregaParada:', e);
      }
    }

    let rpcDone = false;
    try {
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
        'wms_registrar_entrega_parada',
        {
          p_parada_id: params.paradaId,
          p_estado_entrega: params.estadoEntrega,
          p_receptor_nombre: params.receptorNombre || null,
          p_receptor_documento: params.receptorDocumento || null,
          p_firma_digital: params.firmaDigital || null,
          p_motivo_novedad: params.motivoNovedad || null,
          p_foto_remito_url: params.fotoRemitoUrl || null,
          p_observaciones: params.observaciones || null,
        }
      );

      if (!rpcError && rpcData) {
        rpcDone = true;
        // Si hay coordenadas GPS, persistirlas directamente en la parada
        if (params.latitudEntrega && params.longitudEntrega) {
          try {
            await supabase
              .from('rutas_paradas_itinerario')
              .update({
                latitud_entrega: params.latitudEntrega,
                longitud_entrega: params.longitudEntrega,
              } as any)
              .eq('id', params.paradaId);
          } catch (e) {
            console.warn('Aviso actualizando GPS en parada:', e);
          }
        }
      }
      if (rpcError) {
        console.warn('RPC wms_registrar_entrega_parada fallback:', rpcError.message);
      }
    } catch (e) {
      console.warn('Excepción en RPC entrega:', e);
    }

    // 2. Si la RPC falló o no actualizó la parada, persistir directamente sobre tablas
    const horaActual = new Date().toISOString();
    if (!rpcDone) {
    const updateData: any = {
      estado_entrega: params.estadoEntrega,
      hora_real_arribo: horaActual,
      observaciones: params.observaciones || (params.motivoNovedad ? `Novedad: ${params.motivoNovedad}` : null),
    };

    // Intentar con campos extendidos incluyendo GPS
    let updateOk = false;
    try {
      const { error: extErr } = await supabase
        .from('rutas_paradas_itinerario')
        .update({
          ...updateData,
          receptor_nombre: params.receptorNombre || null,
          receptor_documento: params.receptorDocumento || null,
          firma_digital: params.firmaDigital || null,
          motivo_novedad: params.motivoNovedad || null,
          foto_remito_url: params.fotoRemitoUrl || null,
          latitud_entrega: params.latitudEntrega || null,
          longitud_entrega: params.longitudEntrega || null,
        } as any)
        .eq('id', params.paradaId);

      if (!extErr) updateOk = true;
    } catch {
      // Ignorar si las columnas aún no existen
    }

    if (!updateOk) {
      // Fallback a campos estándar
      const obsInfo = JSON.stringify({
        receptor: params.receptorNombre,
        dni: params.receptorDocumento,
        novedad: params.motivoNovedad,
        nota: params.observaciones,
        tiene_firma: !!params.firmaDigital,
        foto_remito: params.fotoRemitoUrl ? true : false,
      });
      const { error: stdErr } = await supabase
        .from('rutas_paradas_itinerario')
        .update({
          estado_entrega: params.estadoEntrega,
          hora_real_arribo: horaActual,
          observaciones: obsInfo,
        })
        .eq('id', params.paradaId);

      if (stdErr) throw stdErr;
    }
  }

    // Si fue entregado con éxito o con novedad asentada, despachar formalmente el pedido
    if (targetPedidoId) {
      try {
        await pedidosApi.despacharPedido(targetPedidoId);
        if (params.estadoEntrega === 'con_novedad' && params.motivoNovedad) {
          await supabase
            .from('pedidos')
            .update({
              observaciones: `Desvío en entrega: ${params.motivoNovedad}`,
              actualizado_en: horaActual,
            })
            .eq('id', targetPedidoId);
        }
      } catch (errDesp) {
        console.warn('Excepción invocando pedidosApi.despacharPedido:', errDesp);
        const updatePed: any = {
          estado: 'despachado',
          actualizado_en: horaActual,
        };
        if (params.estadoEntrega === 'con_novedad') {
          updatePed.observaciones = `Desvío en entrega: ${params.motivoNovedad || 'Novedad asentada en reparto'}`;
        }
        await supabase
          .from('pedidos')
          .update(updatePed)
          .eq('id', targetPedidoId);
      }

      // Actualizar remito de tránsito a entregado_conforme o rechazado_parcial
      try {
        const estadoRemito = params.estadoEntrega === 'con_novedad' ? 'rechazado_parcial' : 'entregado_conforme';
        if (targetRemitoId) {
          await supabase
            .from('remitos_transito')
            .update({ estado: estadoRemito, actualizado_en: horaActual } as any)
            .eq('id', targetRemitoId);
        }
        await supabase
          .from('remitos_transito')
          .update({ estado: estadoRemito, actualizado_en: horaActual } as any)
          .eq('pedido_id', targetPedidoId);
      } catch (errRem) {
        console.warn('Aviso actualizando remito tras entrega:', errRem);
      }
    }

    // Verificar paradas pendientes para actualizar estado de la ruta y cerrar orden de salida si terminó
    try {
      const { data: paradasRestantes } = await supabase
        .from('rutas_paradas_itinerario')
        .select('id, estado_entrega')
        .eq('ruta_id', params.rutaId);

      const pendientes = (paradasRestantes || []).filter(
        (p) => p.estado_entrega === 'pendiente'
      ).length;

      if (pendientes === 0) {
        await supabase
          .from('rutas_entrega')
          .update({ estado: 'itinerario_cumplido' })
          .eq('id', params.rutaId);

        // Cerrar orden de salida asociada
        const { data: rutaInfo } = await supabase
          .from('rutas_entrega')
          .select('orden_salida_id')
          .eq('id', params.rutaId)
          .maybeSingle();

        if (rutaInfo?.orden_salida_id) {
          await supabase
            .from('ordenes_salida')
            .update({ estado: 'cerrada', actualizado_en: horaActual })
            .eq('id', rutaInfo.orden_salida_id);
        }
      } else {
        await supabase
          .from('rutas_entrega')
          .update({ estado: 'en_viaje' })
          .eq('id', params.rutaId)
          .eq('estado', 'programada');
      }
    } catch (errRuta) {
      console.warn('No se pudo verificar estado de la ruta:', errRuta);
    }

    notifyDataChanged();
    return { success: true, parada_id: params.paradaId };
  },

  // --- Adjuntar Documentación / Foto de Remito a una Parada ya Entregada ---
  async adjuntarDocumentoParada(params: {
    paradaId: string;
    fotoRemitoUrl: string;
    observaciones?: string;
  }) {
    // 1. Intentar RPC
    try {
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
        'wms_adjuntar_documento_parada',
        {
          p_parada_id: params.paradaId,
          p_foto_remito_url: params.fotoRemitoUrl,
          p_observaciones: params.observaciones || null,
        }
      );
      if (!rpcError && rpcData) {
        notifyDataChanged();
        return rpcData;
      }
    } catch (e) {
      console.warn('RPC adjuntar documento fallback:', e);
    }

    // 2. Fallback directo
    try {
      const { error: updErr } = await supabase
        .from('rutas_paradas_itinerario')
        .update({
          foto_remito_url: params.fotoRemitoUrl,
        } as any)
        .eq('id', params.paradaId);

      if (!updErr) {
        notifyDataChanged();
        return { success: true };
      }
    } catch {
      // Ignorar si la columna no existe
    }

    // Fallback a observaciones
    const { error: obsErr } = await supabase
      .from('rutas_paradas_itinerario')
      .update({
        observaciones: `Documentación adjunta guardada. ${params.observaciones || ''}`,
      })
      .eq('id', params.paradaId);

    if (obsErr) throw obsErr;
    notifyDataChanged();
    return { success: true };
  },

  // --- Control de Carga en Muelle (Verificación previa a Iniciar Viaje) ---
  async registrarControlCarga(params: {
    rutaId: string;
    usuario: string;
    precinto?: string;
    observaciones?: string;
    bultosVerificados?: number;
  }) {
    const horaActual = new Date().toISOString();
    const tag = `[Control de Carga en Muelle APROBADO por ${params.usuario} el ${new Date().toLocaleTimeString('es-AR')}${params.precinto ? ` - Precinto: ${params.precinto}` : ''}${params.bultosVerificados ? ` - Bultos: ${params.bultosVerificados}` : ''}]`;

    // 1. Obtener notas actuales (con try/catch por si notas_viaje aún no está en el schema cache)
    let notasActuales = '';
    try {
      const { data: ruta } = await supabase
        .from('rutas_entrega')
        .select('notas_viaje')
        .eq('id', params.rutaId)
        .maybeSingle();
      notasActuales = ruta?.notas_viaje || '';
    } catch {
      // Ignorar si la columna notas_viaje aún no existe
    }

    const notasActualizadas = notasActuales ? `${notasActuales} | ${tag}` : tag;

    // 2. Actualizar estado a 'en_carga' y persistir flags de control
    const updatePayload: any = {
      estado: 'en_carga' as any,
      control_carga_completado: true,
      control_carga_fecha: horaActual,
      control_carga_usuario: params.usuario,
      control_carga_precinto: params.precinto || null,
      notas_viaje: notasActualizadas,
    };

    let { data, error } = await supabase
      .from('rutas_entrega')
      .update(updatePayload)
      .eq('id', params.rutaId)
      .select()
      .maybeSingle();

    if (error) {
      // Fallback si notas_viaje o columnas de control de carga aún no existen en la tabla
      console.warn('Fallback actualizando ruta sin columnas extendidas:', error.message);
      delete updatePayload.notas_viaje;
      delete updatePayload.control_carga_completado;
      delete updatePayload.control_carga_fecha;
      delete updatePayload.control_carga_usuario;
      delete updatePayload.control_carga_precinto;

      const { data: fbData, error: fbError } = await supabase
        .from('rutas_entrega')
        .update({ estado: 'en_carga' as any })
        .eq('id', params.rutaId)
        .select()
        .maybeSingle();

      if (fbError) throw fbError;
      notifyDataChanged();
      return fbData;
    }

    notifyDataChanged();
    return data;
  },

  // --- Actualizar Datos de Hoja de Ruta (Módulo Supervisor Web) ---
  async actualizarDatosRuta(params: {
    rutaId: string;
    fechaHoraSalidaEstimada?: string | null;
    choferNombre?: string;
    choferDocumento?: string | null;
    choferTelefono?: string | null;
    acompananteNombre?: string | null;
    acompananteDocumento?: string | null;
    vehiculoPatente?: string;
    tipoVehiculo?: string | null;
    transporteEmpresa?: string;
    notasViaje?: string | null;
  }) {
    const payload: any = {};
    if (params.fechaHoraSalidaEstimada !== undefined) payload.fecha_hora_salida_estimada = params.fechaHoraSalidaEstimada;
    if (params.choferNombre !== undefined) payload.chofer_nombre = params.choferNombre;
    if (params.choferDocumento !== undefined) payload.chofer_documento = params.choferDocumento;
    if (params.choferTelefono !== undefined) payload.chofer_telefono = params.choferTelefono;
    if (params.acompananteNombre !== undefined) payload.acompanante_nombre = params.acompananteNombre;
    if (params.acompananteDocumento !== undefined) payload.acompanante_documento = params.acompananteDocumento;
    if (params.vehiculoPatente !== undefined) payload.vehiculo_patente = params.vehiculoPatente.toUpperCase();
    if (params.tipoVehiculo !== undefined) payload.tipo_vehiculo = params.tipoVehiculo;
    if (params.transporteEmpresa !== undefined) payload.transporte_empresa = params.transporteEmpresa;
    if (params.notasViaje !== undefined) payload.notas_viaje = params.notasViaje;

    let { data, error } = await supabase
      .from('rutas_entrega')
      .update(payload)
      .eq('id', params.rutaId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.message?.includes('notas_viaje') || error.message?.includes('schema cache')) {
        delete payload.notas_viaje;
        delete payload.acompanante_nombre;
        delete payload.acompanante_documento;
        const { data: retryData, error: retryError } = await supabase
          .from('rutas_entrega')
          .update(payload)
          .eq('id', params.rutaId)
          .select()
          .maybeSingle();
        if (retryError) throw retryError;
        notifyDataChanged();
        return retryData;
      }
      throw error;
    }
    notifyDataChanged();
    return data;
  },

  // --- Supervisor: Forzar Cierre de Ruta / Desvíos de Retorno ---
  async forzarCierreRuta(rutaId: string, motivo: string, supervisorNombre: string) {
    const notaCierre = `[Cierre Forzado por Supervisor ${supervisorNombre} - ${new Date().toLocaleTimeString('es-AR')}: ${motivo}]`;

    let notasActuales = '';
    let ordenSalidaId: string | null = null;
    try {
      const { data: ruta } = await supabase
        .from('rutas_entrega')
        .select('notas_viaje, orden_salida_id')
        .eq('id', rutaId)
        .maybeSingle();
      notasActuales = ruta?.notas_viaje || '';
      ordenSalidaId = ruta?.orden_salida_id || null;
    } catch {}

    const notasActualizadas = notasActuales ? `${notasActuales} | ${notaCierre}` : notaCierre;

    const payload: any = {
      estado: 'itinerario_cumplido' as any,
      notas_viaje: notasActualizadas,
    };

    let { data, error } = await supabase
      .from('rutas_entrega')
      .update(payload)
      .eq('id', rutaId)
      .select()
      .maybeSingle();

    if (error) {
      delete payload.notas_viaje;
      const { data: retryData, error: retryError } = await supabase
        .from('rutas_entrega')
        .update({ estado: 'itinerario_cumplido' as any })
        .eq('id', rutaId)
        .select()
        .maybeSingle();
      if (retryError) throw retryError;
      data = retryData;
    }

    // Cerrar la orden de salida asociada
    if (ordenSalidaId) {
      try {
        await supabase
          .from('ordenes_salida')
          .update({ estado: 'cerrada', actualizado_en: new Date().toISOString() })
          .eq('id', ordenSalidaId);
      } catch (errOs) {
        console.warn('Aviso cerrando orden de salida en forzarCierreRuta:', errOs);
      }
    }

    notifyDataChanged();
    return data;
  },

  // --- Generadores de Enlace de Navegación Google Maps ---

  // 1. Navegación directa a una parada individual
  generarGoogleMapsParadaUrl(direccion: string, ciudad?: string): string {
    const destino = `${direccion.trim()}${ciudad ? `, ${ciudad.trim()}` : ''}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
  },

  // 2. Búsqueda y ubicación en mapa
  generarGoogleMapsSearchUrl(direccion: string, ciudad?: string): string {
    const destino = `${direccion.trim()}${ciudad ? `, ${ciudad.trim()}` : ''}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;
  },

  // 3. Ruta completa con múltiples paradas (Waypoints)
  generarGoogleMapsRutaCompletaUrl(
    paradas: Array<{ destinatario?: { direccion_entrega?: string; ciudad?: string } }>,
    origen?: string
  ): string {
    const destinosValidos = paradas
      .map((p) => {
        const d = p.destinatario?.direccion_entrega;
        const c = p.destinatario?.ciudad;
        if (!d) return null;
        return `${d.trim()}${c ? `, ${c.trim()}` : ''}`;
      })
      .filter(Boolean) as string[];

    if (destinosValidos.length === 0) {
      return 'https://www.google.com/maps';
    }

    if (destinosValidos.length === 1) {
      return this.generarGoogleMapsParadaUrl(destinosValidos[0]);
    }

    const puntoOrigen = origen ? origen.trim() : destinosValidos[0];
    const destinoFinal = destinosValidos[destinosValidos.length - 1];
    const waypoints = origen
      ? destinosValidos.slice(0, destinosValidos.length - 1)
      : destinosValidos.slice(1, destinosValidos.length - 1);

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(puntoOrigen)}&destination=${encodeURIComponent(destinoFinal)}`;
    if (waypoints.length > 0) {
      url += `&waypoints=${waypoints.map(encodeURIComponent).join('|')}`;
    }
    url += '&travelmode=driving';

    return url;
  },
};
