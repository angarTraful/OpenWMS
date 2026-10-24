import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';
import { notifyDataChanged } from '../lib/dataSync';

export type OrdenRecepcion = Database['public']['Tables']['ordenes_recepcion']['Row'];
export type OrdenRecepcionInsert = Database['public']['Tables']['ordenes_recepcion']['Insert'];
export type OrdenRecepcionUpdate = Database['public']['Tables']['ordenes_recepcion']['Update'];
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
      p_recibir_directo: false, // Creamos la estructura base sin riesgo de falla por RPC directo
      p_lote_defecto: params.loteDefecto || null,
      p_tipo_contenedor: params.tipoContenedor || null,
      p_despacho_aduana: params.despachoAduana || null,
      p_documentos_adjuntos: params.documentosAdjuntos || [],
      p_fecha_hora_arribo: params.fechaHoraArribo || null,
    });

    if (error) throw error;

    // Si es Fast Inbound (recibir directo sin contar), conformar todo de inmediato a stock
    if (params.recibirDirecto && data?.recepcion_id) {
      try {
        await recepcionesApi.conformarTodos(data.recepcion_id);
        data.estado = 'finalizada';
        data.ingreso_directo = true;
      } catch (errFast: any) {
        console.error('Error conformando Fast Inbound:', errFast);
        await supabase
          .from('ordenes_recepcion')
          .update({ estado: 'en_control' })
          .eq('id', data.recepcion_id);
        throw new Error(`Orden creada pero ocurrió un problema al ingresar directo al stock: ${errFast.message}`);
      }
    } else if (!params.recibirDirecto && data?.recepcion_id) {
      try {
        await supabase
          .from('ordenes_recepcion')
          .update({ estado: 'programada' })
          .eq('id', data.recepcion_id);
      } catch (e) {
        console.warn('Error asegurando estado programada:', e);
      }
    }

    notifyDataChanged();
    return data;
  },

  async registrarIngresoEnPlanta(params: {
    recepcionId: string;
    almacenId?: string;
    muelle?: string;
    observaciones?: string;
  }) {
    const updatePayload: OrdenRecepcionUpdate = {
      estado: 'en_control',
      actualizado_en: new Date().toISOString(),
    };

    if (params.almacenId) {
      updatePayload.almacen_id = params.almacenId;
    }

    if (params.observaciones || params.muelle) {
      const notaMuelle = params.muelle ? `[Muelle: ${params.muelle}]` : '';
      updatePayload.observaciones = [notaMuelle, params.observaciones].filter(Boolean).join(' ');
    }

    const { data, error } = await supabase
      .from('ordenes_recepcion')
      .update(updatePayload)
      .eq('id', params.recepcionId)
      .select(`
        *,
        cliente:clientes(*),
        almacen:almacenes(*)
      `)
      .single();

    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  async actualizarEstado(recepcionId: string, nuevoEstado: string) {
    const { data, error } = await (supabase.rpc as any)('wms_actualizar_estado_recepcion', {
      p_recepcion_id: recepcionId,
      p_nuevo_estado: nuevoEstado,
    });
    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- RPC Operativo de Confronta y Putaway con Corrección de Desvío ---
  async confirmarPutaway(params: {
    tareaId: string;
    cantidadRecibida: number;
    codigoLpn?: string;
    ubicacionDestinoId?: string;
    detalleId?: string;
    desvioNota?: string;
  }) {
    const { data, error } = await supabase.rpc('wms_confirmar_putaway', {
      p_tarea_id: params.tareaId,
      p_cantidad_recibida: params.cantidadRecibida,
      p_codigo_lpn: params.codigoLpn || undefined,
      p_ubicacion_destino_id: params.ubicacionDestinoId || undefined,
    });

    if (error) throw error;

    // Si hubo desvío respecto a lo esperado, corregir renglón a lo recibido real y asentar en Kardex
    if (params.detalleId && params.desvioNota) {
      try {
        await supabase
          .from('ordenes_recepcion_detalle')
          .update({
            cantidad_esperada: params.cantidadRecibida,
            comentarios: params.desvioNota,
          })
          .eq('id', params.detalleId);

        // Actualizar la nota en el movimiento de kardex generado
        await supabase
          .from('movimientos_inventario')
          .update({ notas: params.desvioNota })
          .eq('documento_referencia', `PUTAWAY-${params.tareaId}`);
      } catch (errDesvio) {
        console.warn('Error registrando desvío en renglón/kardex:', errDesvio);
      }
    }

    notifyDataChanged();
    return data;
  },

  // --- RPC Conformar Todos los Renglones Pendientes de una Recepción ---
  async conformarTodos(recepcionId: string) {
    const { data, error } = await (supabase.rpc as any)('wms_conformar_todos_inbound', {
      p_recepcion_id: recepcionId,
    });

    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- Modificar Despacho de Aduana de la Orden ---
  async actualizarDespachoAduana(recepcionId: string, despachoAduana: string) {
    const { data, error } = await supabase
      .from('ordenes_recepcion')
      .update({
        despacho_aduana: despachoAduana.trim() || null,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', recepcionId)
      .select()
      .single();

    if (error) throw error;
    notifyDataChanged();
    return data;
  },

  // --- Modificar Documentación Adjunta de la Orden ---
  async actualizarDocumentosAdjuntos(recepcionId: string, documentos: any[]) {
    const { data, error } = await supabase
      .from('ordenes_recepcion')
      .update({
        documentos_adjuntos: documentos,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', recepcionId)
      .select()
      .single();

    if (error) throw error;
    notifyDataChanged();
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

    notifyDataChanged();
    return { exito: true };
  },

  async actualizarLoteDetalle(detalleId: string, nuevoLote: string) {
    const { error } = await supabase
      .from('ordenes_recepcion_detalle')
      .update({ lote_declarado: nuevoLote })
      .eq('id', detalleId);
    if (error) throw error;
    notifyDataChanged();
    return { exito: true };
  }
};
