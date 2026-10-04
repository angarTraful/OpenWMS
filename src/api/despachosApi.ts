import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

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

    return orden;
  },

  // --- Remito Rx de Tránsito ---
  async emitirRemitoRx(remito: Database['public']['Tables']['remitos_transito']['Insert']) {
    const { data, error } = await supabase.from('remitos_transito').insert(remito).select().single();
    if (error) throw error;
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
        pedido:pedidos(id, numero_pedido)
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

    const { data, error } = await supabase
      .from('rutas_entrega')
      .update(updatePayload)
      .eq('id', rutaId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // --- Registrar Entrega de Parada (Tablet Chofer) con Conformidad o Novedad ---
  async registrarEntregaParada(params: {
    paradaId: string;
    rutaId: string;
    pedidoId: string;
    estadoEntrega: 'entregado' | 'con_novedad';
    receptorNombre?: string;
    receptorDocumento?: string;
    firmaDigital?: string; // Data URL o Base64
    motivoNovedad?: string;
    fotoRemitoUrl?: string;
    observaciones?: string;
  }) {
    // 1. Intentar RPC almacenada
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
        return rpcData;
      }
      if (rpcError) {
        console.warn('RPC wms_registrar_entrega_parada fallback:', rpcError.message);
      }
    } catch (e) {
      console.warn('Excepción en RPC entrega:', e);
    }

    // 2. Fallback Directo sobre tablas de Postgres
    const horaActual = new Date().toISOString();
    const updateData: any = {
      estado_entrega: params.estadoEntrega,
      hora_real_arribo: horaActual,
      observaciones: params.observaciones || (params.motivoNovedad ? `Novedad: ${params.motivoNovedad}` : null),
    };

    // Intentar con campos extendidos
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

    // Si fue entregado con éxito o con novedad asentada, actualizar estado del pedido a 'despachado'
    if (params.pedidoId) {
      try {
        const obsPedido = params.estadoEntrega === 'con_novedad' 
          ? `Desvío en entrega: ${params.motivoNovedad || 'Novedad asentada en reparto'}` 
          : undefined;

        const updatePed: any = {
          estado: 'despachado',
          actualizado_en: horaActual,
        };
        if (obsPedido) updatePed.observaciones = obsPedido;

        await supabase
          .from('pedidos')
          .update(updatePed)
          .eq('id', params.pedidoId);
      } catch (errPed) {
        console.warn('No se pudo actualizar estado de pedido a despachado:', errPed);
      }
    }

    // Verificar paradas pendientes para actualizar estado de la ruta
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
      if (!rpcError && rpcData) return rpcData;
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

      if (!updErr) return { success: true };
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
    return { success: true };
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
