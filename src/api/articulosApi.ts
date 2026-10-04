import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Articulo = Database['public']['Tables']['articulos']['Row'];
export type ArticuloInsert = Database['public']['Tables']['articulos']['Insert'];
export type ArticuloUpdate = Database['public']['Tables']['articulos']['Update'];

export type Categoria = Database['public']['Tables']['categorias_articulos']['Row'];
export type CategoriaInsert = Database['public']['Tables']['categorias_articulos']['Insert'];
export type CategoriaUpdate = Database['public']['Tables']['categorias_articulos']['Update'];

export type Subcategoria = Database['public']['Tables']['subcategorias_articulos']['Row'];
export type SubcategoriaInsert = Database['public']['Tables']['subcategorias_articulos']['Insert'];
export type SubcategoriaUpdate = Database['public']['Tables']['subcategorias_articulos']['Update'];

export interface CategoriaConSubcategorias extends Categoria {
  subcategorias?: Subcategoria[];
}

export const articulosApi = {
  // --- Artículos ---
  async listarPorCliente(clienteId: string) {
    if (!clienteId) return [];
    try {
      const { data, error } = await supabase
        .from('articulos')
        .select(`
          *,
          categoria:categorias_articulos(id, nombre),
          subcategoria:subcategorias_articulos(id, nombre)
        `)
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Fallback en listarPorCliente sin relaciones anidadas:', err);
      const { data, error } = await supabase
        .from('articulos')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error) throw error;
      return data || [];
    }
  },

  async buscarArticulo(clienteId: string, termino: string) {
    const { data, error } = await supabase
      .from('articulos')
      .select('*')
      .eq('cliente_id', clienteId)
      .or(`sku.ilike.%${termino}%,codigo_barras.eq.${termino},nombre.ilike.%${termino}%`);
    if (error) throw error;
    return data;
  },

  async listarTodos(params?: { clienteId?: string; soloActivos?: boolean }) {
    let query = supabase
      .from('articulos')
      .select(`
        *,
        cliente:clientes(id, codigo, razon_social),
        categoria:categorias_articulos(id, nombre),
        subcategoria:subcategorias_articulos(id, nombre)
      `)
      .order('sku', { ascending: true });

    if (params?.clienteId) {
      query = query.eq('cliente_id', params.clienteId);
    }
    if (params?.soloActivos) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async crearArticulo(articulo: ArticuloInsert) {
    const { data, error } = await supabase.from('articulos').insert(articulo).select().single();
    if (error) throw error;
    return data;
  },

  async actualizarArticulo(id: string, cambios: ArticuloUpdate) {
    const { data, error } = await supabase.from('articulos').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async eliminarArticulo(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('articulos').delete().eq('id', id);
    if (error) {
      // Si tiene inventario o recepciones, baja lógica
      const { error: updateError } = await supabase
        .from('articulos')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },

  async alternarEstadoArticulo(id: string, activoActual: boolean) {
    const { data, error } = await supabase
      .from('articulos')
      .update({ activo: !activoActual, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // --- Categorías y Subcategorías ---
  async listarCategorias(soloActivas = true): Promise<CategoriaConSubcategorias[]> {
    try {
      let query = supabase
        .from('categorias_articulos')
        .select(`
          *,
          subcategorias:subcategorias_articulos(*)
        `)
        .order('nombre', { ascending: true });

      if (soloActivas) {
        query = query.eq('activo', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) || [];
    } catch (err) {
      console.warn('Fallback en listarCategorias sin subcategorias anidadas:', err);
      let query = supabase
        .from('categorias_articulos')
        .select('*')
        .order('nombre', { ascending: true });

      if (soloActivas) {
        query = query.eq('activo', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data as any) || []).map((c: any) => ({ ...c, subcategorias: [] }));
    }
  },

  async crearCategoria(categoria: CategoriaInsert): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias_articulos')
      .insert({
        ...categoria,
        codigo: categoria.codigo.trim().toUpperCase(),
        nombre: categoria.nombre.trim(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarCategoria(id: string, cambios: CategoriaUpdate): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias_articulos')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarCategoria(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('categorias_articulos').delete().eq('id', id);
    if (error) {
      // Si tiene artículos asociados, aplicar baja lógica
      const { error: updateError } = await supabase
        .from('categorias_articulos')
        .update({ activo: false })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },

  async alternarEstadoCategoria(id: string, activoActual: boolean): Promise<Categoria> {
    const { data, error } = await supabase
      .from('categorias_articulos')
      .update({ activo: !activoActual })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async crearSubcategoria(subcategoria: SubcategoriaInsert): Promise<Subcategoria> {
    const { data, error } = await supabase
      .from('subcategorias_articulos')
      .insert({
        ...subcategoria,
        codigo: subcategoria.codigo.trim().toUpperCase(),
        nombre: subcategoria.nombre.trim(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarSubcategoria(id: string, cambios: SubcategoriaUpdate): Promise<Subcategoria> {
    const { data, error } = await supabase
      .from('subcategorias_articulos')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarSubcategoria(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('subcategorias_articulos').delete().eq('id', id);
    if (error) {
      const { error: updateError } = await supabase
        .from('subcategorias_articulos')
        .update({ activo: false })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  }
};

