import { supabase } from './supabaseClient';

export interface RfInquiryResult {
  encontrado: boolean;
  tipo?: 'ubicacion' | 'pallet' | 'articulo';
  codigo_buscado?: string;
  mensaje?: string;
  ubicacion?: {
    id: string;
    codigo_etiqueta: string;
    pasillo: string;
    estante: string;
    nivel: string;
    estado: string;
    capacidad_volumen_m3: number;
    almacen_nombre: string;
    zona_nombre?: string;
  };
  pallet?: {
    id: string;
    codigo_lpn: string;
    estado: string;
    peso_total_kg: number;
    volumen_total_m3: number;
    cliente_codigo: string;
    cliente_razon_social: string;
  };
  articulo?: {
    id: string;
    sku: string;
    nombre: string;
    codigo_barras?: string;
    unidad_medida: string;
    peso_unitario_kg: number;
    volumen_unitario_m3: number;
    cliente_codigo: string;
    cliente_razon_social: string;
  };
  items?: any[];
  stock_ubicaciones?: any[];
}

export interface RfPutawayTask {
  id: string;
  recepcion_detalle_id: string;
  articulo_id: string;
  lote_id?: string;
  pallet_id?: string;
  cantidad_esperada: number;
  cantidad_recibida?: number;
  ubicacion_origen_id?: string;
  ubicacion_sugerida_id?: string;
  ubicacion_destino_id?: string;
  estado: string;
  articulo: {
    sku: string;
    nombre: string;
    volumen_unitario_m3: number;
  };
  lote?: {
    numero_lote: string;
    fecha_vencimiento?: string;
  };
  pallet?: {
    codigo_lpn: string;
  };
  ubicacion_sugerida?: {
    id: string;
    codigo_etiqueta: string;
    pasillo: string;
    estante: string;
    nivel: string;
  };
  recepcion?: {
    id: string;
    numero_recepcion: string;
    cliente?: {
      razon_social: string;
    };
  };
}

export interface RfPickingTask {
  id: string;
  pedido_id: string;
  pedido_detalle_id: string;
  articulo_id: string;
  lote_id?: string;
  pallet_origen_id?: string;
  ubicacion_origen_id: string;
  cantidad_a_recolectar: number;
  cantidad_recolectada: number;
  observaciones_picking?: string;
  estado: string;
  articulo: {
    sku: string;
    nombre: string;
    codigo_barras?: string;
    unidad_medida: string;
  };
  lote?: {
    numero_lote: string;
  };
  pallet_origen?: {
    codigo_lpn: string;
  };
  ubicacion_origen: {
    id: string;
    codigo_etiqueta: string;
    pasillo: string;
    estante: string;
    nivel: string;
  };
  pedido: {
    id: string;
    numero_pedido: string;
    cliente?: {
      razon_social: string;
    };
    destinatario?: {
      razon_social_destinatario: string;
    };
  };
}

export const rfApi = {
  // 1. Consulta Libre Universal (Escáner de LPN, Ubicación o SKU)
  async consultaLibre(codigo: string, almacenId?: string): Promise<RfInquiryResult> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_rf_consulta_libre', {
      p_codigo: codigo.trim(),
      p_almacen_id: almacenId || null,
    });

    if (error) {
      throw new Error(error.message || 'Error al consultar código.');
    }
    return data as RfInquiryResult;
  },

  // 2. Reubicación Interna entre Racks (Pallet Completo o Bultos Parciales)
  async reubicarStock(params: {
    inventarioId?: string;
    palletId?: string;
    ubicacionDestinoId: string;
    cantidadMover?: number;
    usuarioNombre?: string;
  }): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_reubicar_stock', {
      p_inventario_id: params.inventarioId || null,
      p_pallet_id: params.palletId || null,
      p_ubicacion_destino_id: params.ubicacionDestinoId,
      p_cantidad_mover: params.cantidadMover || null,
      p_usuario_nombre: params.usuarioNombre || 'Operario RF',
    });

    if (error) {
      throw new Error(error.message || 'Error al reubicar stock.');
    }
    return data;
  },

  // 3. Listar Tareas de Putaway Pendientes para el Almacén
  async obtenerTareasPutawayPendientes(almacenId?: string): Promise<RfPutawayTask[]> {
    try {
      let query: any = (supabase as any)
        .from('tareas_putaway_control')
        .select(`
          id,
          recepcion_detalle_id,
          articulo_id,
          lote_id,
          pallet_id,
          cantidad_recibida,
          ubicacion_origen_id,
          ubicacion_destino_id,
          estado,
          articulo:articulos(sku, nombre, volumen_unitario_m3),
          lote:lotes_cliente(numero_lote, fecha_vencimiento),
          pallet:pallets_lpn(codigo_lpn),
          ubicacion_sugerida:ubicaciones!tareas_putaway_control_ubicacion_destino_id_fkey(id, codigo_etiqueta, pasillo, estante, nivel),
          recepcion_detalle:ordenes_recepcion_detalle(
            cantidad_esperada,
            recepcion:ordenes_recepcion(
              id,
              numero_recepcion,
              almacen_id,
              cliente:clientes(razon_social)
            )
          )
        `)
        .neq('estado', 'almacenado')
        .order('creado_en', { ascending: true });

      const { data, error }: { data: any; error: any } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        return data
          .map((t: any) => ({
            ...t,
            cantidad_esperada: t.recepcion_detalle?.cantidad_esperada ?? t.cantidad_recibida ?? 0,
            recepcion: t.recepcion_detalle?.recepcion,
          }))
          .filter((t: any) => !almacenId || !t.recepcion?.almacen_id || t.recepcion?.almacen_id === almacenId);
      }
    } catch (err: any) {
      console.warn('Fallo consulta principal putaway, ejecutando fallback:', err?.message || err);
      try {
        let fallbackQuery: any = (supabase as any)
          .from('tareas_putaway_control')
          .select(`
            id,
            recepcion_detalle_id,
            articulo_id,
            lote_id,
            pallet_id,
            cantidad_recibida,
            ubicacion_origen_id,
            ubicacion_destino_id,
            estado,
            articulo:articulos(sku, nombre, volumen_unitario_m3),
            lote:lotes_cliente(numero_lote, fecha_vencimiento),
            pallet:pallets_lpn(codigo_lpn),
            recepcion_detalle:ordenes_recepcion_detalle(
              cantidad_esperada,
              recepcion:ordenes_recepcion(
                id,
                numero_recepcion,
                almacen_id,
                cliente:clientes(razon_social)
              )
            )
          `)
          .neq('estado', 'almacenado')
          .order('creado_en', { ascending: true });

        const { data: fbData, error: fbError } = await fallbackQuery;
        if (!fbError && fbData && fbData.length > 0) {
          return fbData
            .map((t: any) => ({
              ...t,
              cantidad_esperada: t.recepcion_detalle?.cantidad_esperada ?? t.cantidad_recibida ?? 0,
              recepcion: t.recepcion_detalle?.recepcion,
            }))
            .filter((t: any) => !almacenId || !t.recepcion?.almacen_id || t.recepcion?.almacen_id === almacenId);
        }
      } catch (fbErr) {
        console.error('Error en fallback putaway tareas:', fbErr);
      }
    }

    // Fallback secundario: si no hay tareas en tareas_putaway_control pero hay órdenes de recepción activas
    try {
      let recQuery: any = (supabase as any)
        .from('ordenes_recepcion_detalle')
        .select(`
          id,
          articulo_id,
          cantidad_esperada,
          fecha_vencimiento,
          lote_declarado,
          ubicacion_sugerida_id,
          articulo:articulos(sku, nombre, volumen_unitario_m3),
          ubicacion_sugerida:ubicaciones(id, codigo_etiqueta, pasillo, estante, nivel),
          recepcion:ordenes_recepcion(
            id,
            numero_recepcion,
            almacen_id,
            estado,
            cliente:clientes(razon_social)
          )
        `)
        .in('recepcion.estado', ['en_control', 'en_descarga', 'arribado', 'ingresado']);

      const { data: recData, error: recError } = await recQuery;
      if (!recError && recData && recData.length > 0) {
        return recData
          .filter((d: any) => d.recepcion && (!almacenId || d.recepcion.almacen_id === almacenId))
          .map((d: any) => ({
            id: d.id,
            recepcion_detalle_id: d.id,
            articulo_id: d.articulo_id,
            cantidad_esperada: d.cantidad_esperada || 0,
            cantidad_recibida: 0,
            estado: 'pendiente',
            articulo: d.articulo || { sku: 'SKU', nombre: 'Artículo', volumen_unitario_m3: 0.025 },
            lote: d.lote_declarado ? { numero_lote: d.lote_declarado, fecha_vencimiento: d.fecha_vencimiento } : undefined,
            ubicacion_sugerida: d.ubicacion_sugerida,
            recepcion: d.recepcion,
          }));
      }
    } catch (e) {
      console.warn('Error fallback recepción directa:', e);
    }

    return [];
  },

  // 4. Confirmar Guardado (Putaway)
  async confirmarPutaway(params: {
    tareaId: string;
    cantidadRecibida: number;
    codigoLpn?: string;
    ubicacionDestinoId?: string;
  }): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_confirmar_putaway', {
      p_tarea_id: params.tareaId,
      p_cantidad_recibida: params.cantidadRecibida,
      p_codigo_lpn: params.codigoLpn || null,
      p_ubicacion_destino_id: params.ubicacionDestinoId || null,
    });

    if (error) {
      throw new Error(error.message || 'Error confirmando putaway.');
    }
    return data;
  },

  // 5. Listar Tareas de Picking Pendientes
  async obtenerTareasPickingPendientes(almacenId?: string): Promise<RfPickingTask[]> {
    try {
      let query: any = (supabase as any)
        .from('tareas_picking')
        .select(`
          id,
          pedido_id,
          pedido_detalle_id,
          articulo_id,
          lote_id,
          pallet_origen_id,
          ubicacion_origen_id,
          cantidad_a_recolectar,
          cantidad_recolectada,
          observaciones_picking,
          estado,
          articulo:articulos(sku, nombre, codigo_barras, unidad_medida),
          lote:lotes_cliente(numero_lote),
          pallet_origen:pallets_lpn(codigo_lpn),
          ubicacion_origen:ubicaciones!tareas_picking_ubicacion_origen_id_fkey(id, codigo_etiqueta, pasillo, estante, nivel, almacen_id),
          pedido:pedidos(
            id,
            numero_pedido,
            cliente:clientes(razon_social),
            destinatario:destinatarios(razon_social)
          )
        `)
        .neq('estado', 'completada')
        .order('creado_en', { ascending: true });

      const { data, error }: { data: any; error: any } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        return data
          .map((t: any) => ({
            ...t,
            pedido: {
              ...t.pedido,
              destinatario: {
                razon_social_destinatario: t.pedido?.destinatario?.razon_social || 'Cliente',
                razon_social: t.pedido?.destinatario?.razon_social || 'Cliente',
              },
            },
          }))
          .filter((t: any) => !almacenId || !t.ubicacion_origen?.almacen_id || t.ubicacion_origen?.almacen_id === almacenId);
      }
    } catch (err: any) {
      console.warn('Fallo consulta principal picking, ejecutando fallback:', err?.message || err);
      try {
        let fallbackQuery: any = (supabase as any)
          .from('tareas_picking')
          .select(`
            id,
            pedido_id,
            pedido_detalle_id,
            articulo_id,
            lote_id,
            pallet_origen_id,
            ubicacion_origen_id,
            cantidad_a_recolectar,
            cantidad_recolectada,
            observaciones_picking,
            estado,
            articulo:articulos(sku, nombre, codigo_barras, unidad_medida),
            lote:lotes_cliente(numero_lote),
            pallet_origen:pallets_lpn(codigo_lpn),
            ubicacion_origen:ubicaciones(id, codigo_etiqueta, pasillo, estante, nivel, almacen_id),
            pedido:pedidos(
              id,
              numero_pedido,
              cliente:clientes(razon_social),
              destinatario:destinatarios(razon_social)
            )
          `)
          .neq('estado', 'completada')
          .order('creado_en', { ascending: true });

        const { data: fbData, error: fbError } = await fallbackQuery;
        if (!fbError && fbData && fbData.length > 0) {
          return fbData
            .map((t: any) => ({
              ...t,
              pedido: {
                ...t.pedido,
                destinatario: {
                  razon_social_destinatario: t.pedido?.destinatario?.razon_social || 'Cliente',
                  razon_social: t.pedido?.destinatario?.razon_social || 'Cliente',
                },
              },
            }))
            .filter((t: any) => !almacenId || !t.ubicacion_origen?.almacen_id || t.ubicacion_origen?.almacen_id === almacenId);
        }
      } catch (fbErr) {
        console.error('Error en fallback picking:', fbErr);
      }
    }

    return [];
  },

  // 6. Confirmar Recolección (Picking)
  async confirmarPicking(params: {
    tareaPickingId: string;
    cantidadRecolectada: number;
    novedad?: string;
  }): Promise<any> {
    try {
      const { data, error }: { data: any; error: any } = await (supabase as any).rpc(
        'wms_confirmar_picking_con_novedad',
        {
          p_tarea_picking_id: params.tareaPickingId,
          p_cantidad_recolectada: params.cantidadRecolectada,
          p_novedad: params.novedad || null,
        }
      );

      if (!error) return data;
      console.warn('Fallo rpc wms_confirmar_picking_con_novedad, ejecutando fallback:', error.message);
    } catch (e) {
      console.warn('Excepción en wms_confirmar_picking_con_novedad:', e);
    }

    // Fallback a wms_confirmar_picking tradicional
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc(
      'wms_confirmar_picking',
      {
        p_tarea_picking_id: params.tareaPickingId,
        p_cantidad_recolectada: params.cantidadRecolectada,
      }
    );

    if (error) {
      throw new Error(error.message || 'Error confirmando recolección de picking.');
    }
    return data;
  },

  // 7. Buscar ubicación por código de etiqueta
  async buscarUbicacionPorEtiqueta(etiqueta: string, almacenId?: string): Promise<any | null> {
    let q: any = (supabase as any)
      .from('ubicaciones')
      .select('*')
      .ilike('codigo_etiqueta', etiqueta.trim())
      .limit(1);

    if (almacenId) {
      q = q.eq('almacen_id', almacenId);
    }

    const { data, error } = await q.maybeSingle();
    if (error || !data) return null;
    return data;
  },
};
