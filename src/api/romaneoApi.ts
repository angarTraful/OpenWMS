import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type RecursoDescarga = Database['public']['Tables']['ordenes_recepcion_recursos']['Row'];
export type RecursoDescargaInsert = Database['public']['Tables']['ordenes_recepcion_recursos']['Insert'];

export interface RomaneoExcepcion {
  id?: string;
  recepcion_id?: string | null;
  recepcion_detalle_id?: string | null;
  pedido_id?: string | null;
  orden_salida_id?: string | null;
  articulo_id: string;
  nro_secuencia: number;
  codigo_etiqueta_lpn?: string | null;
  medida_estandar: number;
  medida_real: number;
  unidad_medida: string;
  diferencia?: number | null;
  observaciones?: string | null;
  es_estandar?: boolean | null;
  imprimir_en_reverso?: boolean | null;
  articulo?: any;
}

export const romaneoApi = {
  // --- RECURSOS DE DESCARGA ---
  async listarRecursosRecepcion(recepcionId: string): Promise<RecursoDescarga[]> {
    const { data, error } = await supabase
      .from('ordenes_recepcion_recursos')
      .select('*')
      .eq('recepcion_id', recepcionId)
      .order('creado_en', { ascending: true });

    if (error) throw error;
    return (data || []) as RecursoDescarga[];
  },

  async agregarRecursoRecepcion(recurso: RecursoDescargaInsert): Promise<RecursoDescarga> {
    const { costo_total, ...payload } = recurso;
    const { data, error } = await supabase
      .from('ordenes_recepcion_recursos')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async eliminarRecursoRecepcion(id: string) {
    const { error } = await supabase
      .from('ordenes_recepcion_recursos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // --- ROMANEO EXCEPCIONES RECEPCION (INBOUND) ---
  async listarExcepcionesRecepcion(recepcionId: string) {
    const { data, error } = await supabase
      .from('ordenes_recepcion_romaneo_excepciones')
      .select(`
        *,
        articulo:articulos(id, sku, nombre, unidad_medida)
      `)
      .eq('recepcion_id', recepcionId)
      .order('nro_secuencia', { ascending: true });

    if (error) throw error;
    return data;
  },

  async guardarExcepcionesRecepcion(excepciones: RomaneoExcepcion[]) {
    const cleanPayload = excepciones.map(({ articulo, diferencia, ...item }) => ({
      recepcion_id: item.recepcion_id!,
      recepcion_detalle_id: item.recepcion_detalle_id || null,
      articulo_id: item.articulo_id,
      nro_secuencia: item.nro_secuencia,
      codigo_etiqueta_lpn: item.codigo_etiqueta_lpn || null,
      medida_estandar: item.medida_estandar,
      medida_real: item.medida_real,
      unidad_medida: item.unidad_medida,
      observaciones: item.observaciones || null,
      ...(item.id ? { id: item.id } : {}),
    }));

    const { data, error } = await supabase
      .from('ordenes_recepcion_romaneo_excepciones')
      .upsert(cleanPayload)
      .select('*');

    if (error) throw error;
    return data;
  },

  async eliminarExcepcionRecepcion(id: string) {
    const { error } = await supabase
      .from('ordenes_recepcion_romaneo_excepciones')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // --- ROMANEO REMITOS / PLANILLA INDEPENDIENTE (OUTBOUND) ---
  async listarRomaneoPedido(pedidoId: string) {
    const { data, error } = await supabase
      .from('remitos_romaneo_excepciones')
      .select(`
        *,
        articulo:articulos(id, sku, nombre, unidad_medida)
      `)
      .eq('pedido_id', pedidoId)
      .order('nro_secuencia', { ascending: true });

    if (error) throw error;
    return data;
  },

  async guardarRomaneoPedido(registros: RomaneoExcepcion[]) {
    const cleanPayload = registros.map(({ articulo, diferencia, ...item }) => ({
      pedido_id: item.pedido_id || null,
      orden_salida_id: item.orden_salida_id || null,
      articulo_id: item.articulo_id,
      nro_secuencia: item.nro_secuencia,
      codigo_etiqueta_lpn: item.codigo_etiqueta_lpn || null,
      medida_estandar: item.medida_estandar,
      medida_real: item.medida_real,
      unidad_medida: item.unidad_medida,
      es_estandar: item.es_estandar ?? false,
      imprimir_en_reverso: item.imprimir_en_reverso ?? true,
      ...(item.id ? { id: item.id } : {}),
    }));

    const { data, error } = await supabase
      .from('remitos_romaneo_excepciones')
      .upsert(cleanPayload)
      .select('*');

    if (error) throw error;
    return data;
  },

  async eliminarRomaneoPedido(id: string) {
    const { error } = await supabase
      .from('remitos_romaneo_excepciones')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

