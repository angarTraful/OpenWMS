import { supabase } from './supabaseClient';

export interface RecursoDescarga {
  id?: string;
  recepcion_id: string;
  tipo_recurso: string;
  descripcion?: string;
  unidad_medida: string;
  cantidad: number;
  costo_unitario: number;
  costo_total?: number;
  incluido_en_tarifario: boolean;
  proveedor_servicio?: string;
  creado_en?: string;
}

export interface RomaneoExcepcion {
  id?: string;
  recepcion_id?: string;
  recepcion_detalle_id?: string;
  pedido_id?: string;
  orden_salida_id?: string;
  articulo_id: string;
  nro_secuencia: number;
  codigo_etiqueta_lpn?: string;
  medida_estandar: number;
  medida_real: number;
  unidad_medida: string;
  diferencia?: number;
  observaciones?: string;
  articulo?: any;
}

export const romaneoApi = {
  // --- RECURSOS DE DESCARGA ---
  async listarRecursosRecepcion(recepcionId: string) {
    const { data, error } = await supabase
      .from('ordenes_recepcion_recursos')
      .select('*')
      .eq('recepcion_id', recepcionId)
      .order('creado_en', { ascending: true });

    if (error) throw error;
    return data as RecursoDescarga[];
  },

  async agregarRecursoRecepcion(recurso: RecursoDescarga) {
    const { data, error } = await supabase
      .from('ordenes_recepcion_recursos')
      .insert(recurso)
      .select('*')
      .single();

    if (error) throw error;
    return data as RecursoDescarga;
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
    const { data, error } = await supabase
      .from('ordenes_recepcion_romaneo_excepciones')
      .upsert(excepciones)
      .select('*');

    if (error) throw error;
    return data;
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
    const { data, error } = await supabase
      .from('remitos_romaneo_excepciones')
      .upsert(registros)
      .select('*');

    if (error) throw error;
    return data;
  }
};
