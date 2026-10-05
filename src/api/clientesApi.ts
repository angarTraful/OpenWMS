import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Cliente = Database['public']['Tables']['clientes']['Row'];
export type ClienteInsert = Database['public']['Tables']['clientes']['Insert'];
export type ClienteUpdate = Database['public']['Tables']['clientes']['Update'];

export type Destinatario = Database['public']['Tables']['destinatarios']['Row'] & {
  es_sucursal_propia?: boolean;
  alias_cliente?: string | null;
  relacion_id?: string;
  relacion_activa?: boolean;
  clientes_habilitados?: Array<{
    id: string;
    cliente_id: string;
    activo: boolean;
    es_sucursal_propia: boolean;
    alias_cliente: string | null;
    cliente?: {
      id: string;
      codigo: string;
      razon_social: string;
    };
  }>;
};
export type DestinatarioInsert = Database['public']['Tables']['destinatarios']['Insert'];
export type DestinatarioUpdate = Database['public']['Tables']['destinatarios']['Update'];

export type ClienteDestinatario = Database['public']['Tables']['clientes_destinatarios']['Row'];
export type ClienteDestinatarioInsert = Database['public']['Tables']['clientes_destinatarios']['Insert'];
export type ClienteDestinatarioUpdate = Database['public']['Tables']['clientes_destinatarios']['Update'];

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

  // --- Destinatarios / Sucursales (Maestro + N:M Clientes) ---
  async listarDestinatariosPorCliente(clienteId: string, soloActivos = true): Promise<Destinatario[]> {
    if (!clienteId) return [];

    try {
      // 1. Intentar consultar mediante tabla intermedia clientes_destinatarios
      let relQuery = supabase
        .from('clientes_destinatarios')
        .select(`
          id,
          cliente_id,
          destinatario_id,
          activo,
          es_sucursal_propia,
          alias_cliente,
          destinatario:destinatarios(*)
        `)
        .eq('cliente_id', clienteId);

      if (soloActivos) {
        relQuery = relQuery.eq('activo', true);
      }

      const { data: relData, error: relError } = await relQuery;

      if (!relError && relData && relData.length > 0) {
        const dests: Destinatario[] = [];
        for (const item of relData) {
          const d = item.destinatario as any;
          if (d && (!soloActivos || d.activo)) {
            dests.push({
              ...d,
              es_sucursal_propia: item.es_sucursal_propia,
              alias_cliente: item.alias_cliente,
              relacion_id: item.id,
              relacion_activa: item.activo,
            });
          }
        }
        return dests.sort((a, b) => (a.razon_social || '').localeCompare(b.razon_social || ''));
      }
    } catch (err) {
      console.warn('Fallback a consulta directa de destinatarios:', err);
    }

    // 2. Fallback de retrocompatibilidad si la tabla intermedia aún no fue migrada
    let query = supabase
      .from('destinatarios')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('razon_social', { ascending: true });

    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Destinatario[];
  },

  async listarDestinatarios(params?: { clienteId?: string; soloActivos?: boolean }): Promise<Destinatario[]> {
    try {
      let query = supabase
        .from('destinatarios')
        .select(`
          *,
          cliente:clientes(id, codigo, razon_social),
          clientes_habilitados:clientes_destinatarios(
            id,
            cliente_id,
            activo,
            es_sucursal_propia,
            alias_cliente,
            cliente:clientes(id, codigo, razon_social)
          )
        `)
        .order('razon_social', { ascending: true });

      if (params?.soloActivos) {
        query = query.eq('activo', true);
      }

      const { data, error } = await query;
      if (!error && data) {
        let result = data as any[];
        // Si se especificó clienteId, filtrar solo los destinatarios asociados o globales
        if (params?.clienteId) {
          result = result.filter((d) => {
            if (d.cliente_id === params.clienteId) return true;
            return (d.clientes_habilitados || []).some(
              (ch: any) => ch.cliente_id === params.clienteId && (!params.soloActivos || ch.activo)
            );
          });
        }
        return result as Destinatario[];
      }
    } catch (err) {
      console.warn('Fallback en listarDestinatarios sin join clientes_destinatarios:', err);
    }

    // Fallback estándar si la relación no existe aún en BD
    let fallbackQuery = supabase
      .from('destinatarios')
      .select(`
        *,
        cliente:clientes(id, codigo, razon_social)
      `)
      .order('razon_social', { ascending: true });

    if (params?.clienteId) {
      fallbackQuery = fallbackQuery.eq('cliente_id', params.clienteId);
    }
    if (params?.soloActivos) {
      fallbackQuery = fallbackQuery.eq('activo', true);
    }

    const { data: fbData, error: fbError } = await fallbackQuery;
    if (fbError) throw fbError;
    return (fbData || []) as Destinatario[];
  },

  async crearDestinatario(
    destinatario: DestinatarioInsert,
    clienteIds: string[] = [],
    esSucursalPropia = false
  ): Promise<Destinatario> {
    const { data, error } = await supabase.from('destinatarios').insert(destinatario).select().single();
    if (error) throw error;

    // Si se enviaron clientes a vincular o si viene cliente_id, insertamos en clientes_destinatarios
    const targets = new Set<string>(clienteIds);
    if (destinatario.cliente_id) {
      targets.add(destinatario.cliente_id);
    }

    if (targets.size > 0) {
      try {
        const rows = Array.from(targets).map((cId) => ({
          cliente_id: cId,
          destinatario_id: data.id,
          activo: true,
          es_sucursal_propia: esSucursalPropia,
        }));
        await supabase.from('clientes_destinatarios').upsert(rows);
      } catch (relErr) {
        console.warn('No se pudo vincular destinatario en tabla intermedia:', relErr);
      }
    }

    return data;
  },

  async actualizarDestinatario(
    id: string,
    cambios: DestinatarioUpdate,
    clienteIds?: string[],
    esSucursalPropia?: boolean
  ): Promise<Destinatario> {
    const { data, error } = await supabase.from('destinatarios').update(cambios).eq('id', id).select().single();
    if (error) throw error;

    // Si se enviaron clienteIds explícitos, sincronizar las vinculaciones
    if (clienteIds !== undefined) {
      try {
        // Obtener relaciones actuales
        const { data: actualList } = await supabase
          .from('clientes_destinatarios')
          .select('id, cliente_id')
          .eq('destinatario_id', id);

        const currentMap = new Map((actualList || []).map((r) => [r.cliente_id, r.id]));
        const targetSet = new Set(clienteIds);

        // Desvincular los que ya no están
        const toDeleteIds: string[] = [];
        currentMap.forEach((relId, cId) => {
          if (!targetSet.has(cId)) {
            toDeleteIds.push(relId);
          }
        });
        if (toDeleteIds.length > 0) {
          await supabase.from('clientes_destinatarios').delete().in('id', toDeleteIds);
        }

        // Agregar los nuevos o actualizar
        if (clienteIds.length > 0) {
          const toUpsert = clienteIds.map((cId) => ({
            cliente_id: cId,
            destinatario_id: id,
            activo: true,
            es_sucursal_propia: esSucursalPropia ?? false,
          }));
          await supabase.from('clientes_destinatarios').upsert(toUpsert);
        }
      } catch (relErr) {
        console.warn('Error sincronizando clientes_destinatarios:', relErr);
      }
    }

    return data;
  },

  async asociarClienteDestinatario(clienteId: string, destinatarioId: string, esSucursalPropia = false) {
    const { data, error } = await supabase
      .from('clientes_destinatarios')
      .upsert({
        cliente_id: clienteId,
        destinatario_id: destinatarioId,
        activo: true,
        es_sucursal_propia: esSucursalPropia,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async desasociarClienteDestinatario(clienteId: string, destinatarioId: string) {
    const { error } = await supabase
      .from('clientes_destinatarios')
      .delete()
      .eq('cliente_id', clienteId)
      .eq('destinatario_id', destinatarioId);
    if (error) throw error;
    return true;
  },

  async alternarHabilitacionClienteDestinatario(relacionId: string, activoActual: boolean) {
    const { data, error } = await supabase
      .from('clientes_destinatarios')
      .update({ activo: !activoActual, actualizado_en: new Date().toISOString() })
      .eq('id', relacionId)
      .select()
      .single();
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

