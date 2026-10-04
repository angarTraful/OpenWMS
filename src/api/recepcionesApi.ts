import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type OrdenRecepcion = Database['public']['Tables']['ordenes_recepcion']['Row'];
export type OrdenRecepcionInsert = Database['public']['Tables']['ordenes_recepcion']['Insert'];
export type TareaPutaway = Database['public']['Tables']['tareas_putaway_control']['Row'];

export const recepcionesApi = {
  async listarRecepciones(clienteId?: string) {
    let query = supabase
      .from('ordenes_recepcion')
      .select(`
        *,
        cliente:clientes(id, razon_social),
        almacen:almacenes(id, nombre),
        detalles:ordenes_recepcion_detalle(
          id,
          cantidad_esperada
        )
      `)
      .order('fecha_hora_arribo', { ascending: false });

    if (clienteId) query = query.eq('cliente_id', clienteId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async obtenerRecepcionConDetalle(recepcionId: string) {
    const { data, error } = await supabase
      .from('ordenes_recepcion')
      .select(`
        *,
        cliente:clientes(*),
        almacen:almacenes(*),
        detalles:ordenes_recepcion_detalle(
          *,
          articulo:articulos(*),
          tareas:tareas_putaway_control(*)
        )
      `)
      .eq('id', recepcionId)
      .single();
    if (error) throw error;
    return data;
  },

  async crearOrdenRecepcion(params: {
    almacenId: string;
    clienteId: string;
    numeroRecepcion: string;
    nroContenedorOc?: string;
    transporteEmpresa?: string;
    patenteCamion?: string;
    choferNombre?: string;
    choferDocumento?: string;
    observaciones?: string;
    recibirDirecto?: boolean;
    loteDefecto?: string;
    tipoContenedor?: string;
    despachoAduana?: string;
    documentosAdjuntos?: Array<any>;
    fechaHoraArribo?: string;
    detalles: Array<{
      articulo_id: string;
      lote_declarado?: string;
      fecha_vencimiento?: string | null;
      cantidad_esperada: number;
      ubicacion_sugerida_id?: string | null;
      comentarios?: string | null;
    }>;
  }) {
    const { data, error } = await (supabase.rpc as any)('wms_crear_orden_recepcion', {
      p_almacen_id: params.almacenId,
      p_cliente_id: params.clienteId,
      p_numero_recepcion: params.numeroRecepcion,
      p_nro_contenedor_oc: params.nroContenedorOc || null,
      p_transporte_empresa: params.transporteEmpresa || null,
      p_patente_camion: params.patenteCamion || null,
      p_chofer_nombre: params.choferNombre || null,
      p_chofer_documento: params.choferDocumento || null,
      p_observaciones: params.observaciones || null,
      p_detalles: params.detalles || [],
      p_recibir_directo: params.recibirDirecto || false,
      p_lote_defecto: params.loteDefecto || null,
      p_tipo_contenedor: params.tipoContenedor || null,
      p_despacho_aduana: params.despachoAduana || null,
      p_documentos_adjuntos: params.documentosAdjuntos || [],
      p_fecha_hora_arribo: params.fechaHoraArribo || null,
    });

    if (error) throw error;
    return data;
  },

  async actualizarEstado(recepcionId: string, nuevoEstado: string) {
    const { data, error } = await (supabase.rpc as any)('wms_actualizar_estado_recepcion', {
      p_recepcion_id: recepcionId,
      p_nuevo_estado: nuevoEstado,
    });
    if (error) throw error;
    return data;
  },

  // --- RPC Operativo de Confronta y Putaway ---
  async confirmarPutaway(params: {
    tareaId: string;
    cantidadRecibida: number;
    codigoLpn?: string;
    ubicacionDestinoId?: string;
  }) {
    const { data, error } = await supabase.rpc('wms_confirmar_putaway', {
      p_tarea_id: params.tareaId,
      p_cantidad_recibida: params.cantidadRecibida,
      p_codigo_lpn: params.codigoLpn || undefined,
      p_ubicacion_destino_id: params.ubicacionDestinoId || undefined
    });

    if (error) throw error;
    return data;
  },

  // --- RPC Conformar Todos los Renglones Pendientes de una Recepción ---
  async conformarTodos(recepcionId: string) {
    const { data, error } = await (supabase.rpc as any)('wms_conformar_todos_inbound', {
      p_recepcion_id: recepcionId,
    });

    if (error) throw error;
    return data;
  },

  // --- Modificar Lote de la Orden y de sus Renglones ---
  async actualizarLoteRecepcion(recepcionId: string, nuevoLote: string) {
    const { error: err1 } = await supabase
      .from('ordenes_recepcion')
      .update({ lote_defecto: nuevoLote })
      .eq('id', recepcionId);
    if (err1) throw err1;

    const { error: err2 } = await supabase
      .from('ordenes_recepcion_detalle')
      .update({ lote_declarado: nuevoLote })
      .eq('recepcion_id', recepcionId);
    if (err2) throw err2;

    return { exito: true };
  },

  async actualizarLoteDetalle(detalleId: string, nuevoLote: string) {
    const { error } = await supabase
      .from('ordenes_recepcion_detalle')
      .update({ lote_declarado: nuevoLote })
      .eq('id', detalleId);
    if (error) throw error;
    return { exito: true };
  }
};
