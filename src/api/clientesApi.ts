import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Cliente = Database['public']['Tables']['clientes']['Row'];
export type ClienteInsert = Database['public']['Tables']['clientes']['Insert'];
export type ClienteUpdate = Database['public']['Tables']['clientes']['Update'];

export type Destinatario = Database['public']['Tables']['destinatarios']['Row'];
export type DestinatarioInsert = Database['public']['Tables']['destinatarios']['Insert'];
export type DestinatarioUpdate = Database['public']['Tables']['destinatarios']['Update'];

export const clientesApi = {
  // --- Clientes Depositantes ---
  async listarClientes(soloActivos = true) {
    let query = supabase.from('clientes').select('*').order('razon_social', { ascending: true });
    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async obtenerClientePorId(id: string) {
    const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async crearCliente(cliente: ClienteInsert) {
    const { data, error } = await supabase.from('clientes').insert(cliente).select().single();
    if (error) throw error;
    return data;
  },

  async actualizarCliente(id: string, cambios: ClienteUpdate) {
    const { data, error } = await supabase.from('clientes').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async eliminarCliente(id: string): Promise<{ softDelete: boolean }> {
    // Intentar borrado físico si no tiene registros dependientes
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) {
      // Si falla por restricción de integridad referencial (ej: órdenes o inventario), aplicar baja lógica
      const { error: updateError } = await supabase
        .from('clientes')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },

  async alternarEstadoCliente(id: string, activoActual: boolean) {
    const { data, error } = await supabase
      .from('clientes')
      .update({ activo: !activoActual, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // --- Destinatarios / Sucursales ---
  async listarDestinatariosPorCliente(clienteId: string, soloActivos = true) {
    if (!clienteId) return [];
    let query = supabase
      .from('destinatarios')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('razon_social', { ascending: true });
    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async listarDestinatarios(params?: { clienteId?: string; soloActivos?: boolean }) {
    let query = supabase
      .from('destinatarios')
      .select(`
        *,
        cliente:clientes(id, codigo, razon_social)
      `)
      .order('razon_social', { ascending: true });

    if (params?.clienteId) {
      query = query.eq('cliente_id', params.clienteId);
    }
    if (params?.soloActivos) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async crearDestinatario(destinatario: DestinatarioInsert) {
    const { data, error } = await supabase.from('destinatarios').insert(destinatario).select().single();
    if (error) throw error;
    return data;
  },

  async actualizarDestinatario(id: string, cambios: DestinatarioUpdate) {
    const { data, error } = await supabase.from('destinatarios').update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async eliminarDestinatario(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('destinatarios').delete().eq('id', id);
    if (error) {
      // Si tiene pedidos o remitos asociados, realizar baja lógica
      const { error: updateError } = await supabase
        .from('destinatarios')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },

  async alternarEstadoDestinatario(id: string, activoActual: boolean) {
    const { data, error } = await supabase
      .from('destinatarios')
      .update({ activo: !activoActual, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

