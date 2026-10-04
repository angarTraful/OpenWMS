import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Almacen = Database['public']['Tables']['almacenes']['Row'];
export type AlmacenInsert = Database['public']['Tables']['almacenes']['Insert'];
export type AlmacenUpdate = Database['public']['Tables']['almacenes']['Update'];

export type Zona = Database['public']['Tables']['zonas']['Row'];
export type ZonaInsert = Database['public']['Tables']['zonas']['Insert'];
export type ZonaUpdate = Database['public']['Tables']['zonas']['Update'];

export type Ubicacion = Database['public']['Tables']['ubicaciones']['Row'];
export type UbicacionInsert = Database['public']['Tables']['ubicaciones']['Insert'];
export type UbicacionUpdate = Database['public']['Tables']['ubicaciones']['Update'];

export const almacenApi = {
  async listarAlmacenes(soloActivos = true) {
    let query = supabase.from('almacenes').select('*').order('nombre', { ascending: true });
    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async crearAlmacen(almacen: AlmacenInsert) {
    const { data, error } = await supabase.from('almacenes').insert(almacen).select().single();
    if (error) throw error;
    return data;
  },

  async actualizarAlmacen(id: string, cambios: AlmacenUpdate) {
    const { data, error } = await supabase.from('almacenes').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },


  async listarUbicacionesPorAlmacen(almacenId: string) {
    const { data, error } = await supabase
      .from('ubicaciones')
      .select(`
        *,
        zona:zonas(id, codigo, nombre, tipo_zona)
      `)
      .eq('almacen_id', almacenId)
      .order('codigo_etiqueta', { ascending: true });
    if (error) throw error;
    return data;
  },

  async obtenerUbicacionPorEtiqueta(almacenId: string, codigoEtiqueta: string) {
    const { data, error } = await supabase
      .from('ubicaciones')
      .select('*, zona:zonas(*)')
      .eq('almacen_id', almacenId)
      .eq('codigo_etiqueta', codigoEtiqueta)
      .single();
    if (error) throw error;
    return data;
  },

  async listarZonas(almacenId?: string) {
    let query = supabase.from('zonas').select('*').order('nombre', { ascending: true });
    if (almacenId) query = query.eq('almacen_id', almacenId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async crearZona(zona: ZonaInsert) {
    const { data, error } = await supabase.from('zonas').insert(zona).select().single();
    if (error) throw error;
    return data;
  },

  async actualizarZona(id: string, cambios: ZonaUpdate) {
    const { data, error } = await supabase.from('zonas').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },


  async crearUbicacion(ubicacion: {
    almacen_id: string;
    zona_id: string;
    codigo_etiqueta: string;
    pasillo?: string | null;
    estante?: string | null;
    nivel?: string | null;
    posicion?: string | null;
    capacidad_peso_kg?: number | null;
    capacidad_volumen_m3?: number | null;
    permite_mezcla_clientes?: boolean;
    estado?: string;
  }) {
    const { data, error } = await supabase
      .from('ubicaciones')
      .insert(ubicacion)
      .select(`*, zona:zonas(*)`)
      .single();
    if (error) throw error;
    return data;
  },

  async crearUbicacionesLote(ubicaciones: Array<{
    almacen_id: string;
    zona_id: string;
    codigo_etiqueta: string;
    pasillo?: string | null;
    estante?: string | null;
    nivel?: string | null;
    posicion?: string | null;
    capacidad_peso_kg?: number | null;
    capacidad_volumen_m3?: number | null;
    permite_mezcla_clientes?: boolean;
    estado?: string;
  }>) {
    const { data, error } = await supabase
      .from('ubicaciones')
      .insert(ubicaciones)
      .select(`*, zona:zonas(*)`);
    if (error) throw error;
    return data;
  },

  async actualizarUbicacion(id: string, cambios: any) {
    const { data, error } = await supabase
      .from('ubicaciones')
      .update(cambios)
      .eq('id', id)
      .select(`*, zona:zonas(*)`)
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarUbicacion(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('ubicaciones').delete().eq('id', id);
    if (error) {
      // Si tiene inventario o movimientos históricos, bloquear ubicación
      const { error: updateError } = await supabase
        .from('ubicaciones')
        .update({ estado: 'bloqueada' })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },

  async alternarEstadoUbicacion(id: string, estadoActual: string) {
    const nuevoEstado = estadoActual === 'activa' ? 'bloqueada' : 'activa';
    const { data, error } = await supabase
      .from('ubicaciones')
      .update({ estado: nuevoEstado })
      .eq('id', id)
      .select(`*, zona:zonas(*)`)
      .single();
    if (error) throw error;
    return data;
  }
};
