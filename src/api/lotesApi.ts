import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type LoteCliente = Database['public']['Tables']['lotes_cliente']['Row'];
export type LoteClienteInsert = Database['public']['Tables']['lotes_cliente']['Insert'];
export type LoteClienteUpdate = Database['public']['Tables']['lotes_cliente']['Update'];

export interface LoteConCliente extends LoteCliente {
  cliente?: {
    id: string;
    codigo: string;
    razon_social: string;
  } | null;
}

export const lotesApi = {
  /**
   * Lista los lotes registrados, opcionalmente filtrados por cliente o estado de bloqueo.
   */
  async listarLotes(params?: { clienteId?: string; soloHabilitados?: boolean }): Promise<LoteConCliente[]> {
    let query = supabase
      .from('lotes_cliente')
      .select(`
        *,
        cliente:clientes(id, codigo, razon_social)
      `)
      .order('numero_lote', { ascending: true });

    if (params?.clienteId) {
      query = query.eq('cliente_id', params.clienteId);
    }
    if (params?.soloHabilitados) {
      query = query.eq('bloqueado', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as any) || [];
  },

  /**
   * Obtiene un lote por su ID.
   */
  async obtenerPorId(id: string): Promise<LoteConCliente> {
    const { data, error } = await supabase
      .from('lotes_cliente')
      .select(`
        *,
        cliente:clientes(id, codigo, razon_social)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as any;
  },

  /**
   * Busca o verifica un lote por cliente y número de lote exacto.
   */
  async buscarPorNumero(clienteId: string, numeroLote: string): Promise<LoteCliente | null> {
    const { data, error } = await supabase
      .from('lotes_cliente')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('numero_lote', numeroLote.trim())
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /**
   * Registra un nuevo lote para un cliente.
   */
  async crearLote(lote: LoteClienteInsert): Promise<LoteCliente> {
    const { data, error } = await supabase
      .from('lotes_cliente')
      .insert({
        ...lote,
        numero_lote: lote.numero_lote.trim(),
        bloqueado: lote.bloqueado ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Actualiza datos de un lote (fechas, número, etc.).
   */
  async actualizarLote(id: string, cambios: LoteClienteUpdate): Promise<LoteCliente> {
    const { data, error } = await supabase
      .from('lotes_cliente')
      .update(cambios)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Bloquea un lote con un motivo específico (cuarentena, calidad, retiro de mercado).
   */
  async bloquearLote(id: string, motivo: string): Promise<LoteCliente> {
    const { data, error } = await supabase
      .from('lotes_cliente')
      .update({
        bloqueado: true,
        motivo_bloqueo: motivo.trim() || 'Bloqueo preventivo de lote',
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Desbloquea un lote para habilitar su recolección y despacho.
   */
  async desbloquearLote(id: string): Promise<LoteCliente> {
    const { data, error } = await supabase
      .from('lotes_cliente')
      .update({
        bloqueado: false,
        motivo_bloqueo: null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Elimina un lote. Si tiene movimientos históricos, arrojará error de integridad referencial.
   */
  async eliminarLote(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('lotes_cliente').delete().eq('id', id);
    if (error) {
      // Si tiene inventario o movimientos asignados, aplicar bloqueo total como alternativa
      const { error: blockError } = await supabase
        .from('lotes_cliente')
        .update({
          bloqueado: true,
          motivo_bloqueo: 'Lote dado de baja (con historial transaccional)',
        })
        .eq('id', id);
      if (blockError) throw blockError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },
};
