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
// --- Helpers de Deduplicación y Generación de Códigos de Sucursal ---

/**
 * Normaliza una dirección física para comparaciones y prevención de duplicados:
 * - Pasa a minúsculas
 * - Elimina acentos/diacríticos
 * - Normaliza abreviaturas viales comunes (av, avenida -> av, etc.)
 * - Elimina puntuación y unifica espacios en blanco
 */
export function normalizarDireccion(direccion: string): string {
  if (!direccion) return '';
  let s = direccion
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()º°]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Reemplazar prefijos viales usuales
  s = s.replace(/^avenida\s+/i, 'av ');
  s = s.replace(/^avda\s+/i, 'av ');
  s = s.replace(/^calle\s+/i, '');
  s = s.replace(/\b(nro|n°|num|numero)\b/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Normaliza un texto general para comparaciones flexibles
 */
export function normalizarTexto(texto: string): string {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae la base de la Razón Social para usar como prefijo en el código de sucursal
 * Ej: "Supermercados Coto S.A." -> "COTO", "Farmacity" -> "FARMACITY"
 */
export function obtenerBaseRazonSocial(razonSocial: string): string {
  if (!razonSocial) return 'DEST';
  let base = razonSocial
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,.-]+$/, '')
    .trim();

  // Limpiar sufijos societarios comunes si están al final (S.A., S.R.L., S.A.S., etc.)
  base = base.replace(/\s+(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|S\.?C\.?A\.?|C\.?I\.?C\.?S\.?A\.?)$/i, '').trim();

  return base || 'DEST';
}

/**
 * Genera automáticamente el código correlativo de sucursal:
 * "Razon Social" + " SUC1" o "SUC2", "SUC3", etc.
 */
export function generarSiguienteCodigoSucursal(
  razonSocial: string,
  existentes: Array<{ razon_social?: string | null; codigo_sucursal?: string | null }>
): string {
  const base = obtenerBaseRazonSocial(razonSocial);
  const baseNorm = normalizarTexto(base);
  const razonNorm = normalizarTexto(razonSocial);

  let maxNum = 0;

  for (const d of existentes) {
    const cod = (d.codigo_sucursal || '').trim();
    if (!cod) continue;

    const dRazonNorm = normalizarTexto(d.razon_social || '');
    const perteneceMismaRazon =
      !dRazonNorm ||
      dRazonNorm === razonNorm ||
      dRazonNorm.includes(baseNorm) ||
      baseNorm.includes(dRazonNorm) ||
      normalizarTexto(cod).startsWith(baseNorm);

    if (perteneceMismaRazon) {
      const match = cod.match(/(?:SUC|SUCURSAL)[-_\s]*(\d+)/i) || cod.match(/(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const siguiente = maxNum + 1;
  return `${base} SUC${siguiente}`;
}

/**
 * Busca si ya existe un destinatario con la misma dirección física
 * para evitar duplicados.
 */
export function buscarDestinatarioPorDireccion(
  direccion: string,
  existentes: Destinatario[],
  razonSocial?: string
): Destinatario | undefined {
  const dirNorm = normalizarDireccion(direccion);
  if (!dirNorm) return undefined;

  const razonNorm = razonSocial ? normalizarTexto(razonSocial) : '';
  const baseNorm = razonSocial ? normalizarTexto(obtenerBaseRazonSocial(razonSocial)) : '';

  // 1. Coincidencia exacta de dirección Y coincidencia de Razón Social / Prefijo
  if (razonNorm) {
    const exactMatch = existentes.find((d) => {
      const dDirNorm = normalizarDireccion(d.direccion_entrega || '');
      if (dDirNorm !== dirNorm) return false;

      const dRazonNorm = normalizarTexto(d.razon_social || '');
      const dBaseNorm = normalizarTexto(obtenerBaseRazonSocial(d.razon_social || ''));

      return (
        dRazonNorm === razonNorm ||
        dBaseNorm === baseNorm ||
        dRazonNorm.includes(baseNorm) ||
        baseNorm.includes(dRazonNorm)
      );
    });

    if (exactMatch) return exactMatch;
  }

  // 2. Coincidencia de dirección física idéntica
  return existentes.find((d) => {
    const dDirNorm = normalizarDireccion(d.direccion_entrega || '');
    return dDirNorm === dirNorm;
  });
}

export const clientesApi = {
  // Exponer utilidades para uso directo
  normalizarDireccion,
  normalizarTexto,
  obtenerBaseRazonSocial,
  generarSiguienteCodigoSucursal,
  buscarDestinatarioPorDireccion,

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
    esSucursalPropia = false,
    opciones?: {
      evitarDuplicadosPorDireccion?: boolean;
      destinatariosExistentes?: Destinatario[];
    }
  ): Promise<Destinatario & { esDuplicadoReutilizado?: boolean }> {
    const evitarDuplicados = opciones?.evitarDuplicadosPorDireccion ?? true;

    // 1. Si está habilitada la deduplicación, verificar si ya existe un destinatario con la misma dirección física
    if (evitarDuplicados && destinatario.direccion_entrega) {
      try {
        let lista = opciones?.destinatariosExistentes;
        if (!lista) {
          const { data: dbDests } = await supabase.from('destinatarios').select('*');
          lista = (dbDests || []) as Destinatario[];
        }

        if (lista && lista.length > 0) {
          const encontrado = buscarDestinatarioPorDireccion(
            destinatario.direccion_entrega,
            lista,
            destinatario.razon_social
          );

          if (encontrado) {
            // Reutilizar el destinatario existente y vincular los clientes solicitados
            const targets = new Set<string>(clienteIds);
            if (destinatario.cliente_id) {
              targets.add(destinatario.cliente_id);
            }

            if (targets.size > 0) {
              try {
                const rows = Array.from(targets).map((cId) => ({
                  cliente_id: cId,
                  destinatario_id: encontrado.id,
                  activo: true,
                  es_sucursal_propia: esSucursalPropia,
                }));
                await supabase.from('clientes_destinatarios').upsert(rows);
              } catch (relErr) {
                console.warn('No se pudo vincular destinatario en tabla intermedia:', relErr);
              }
            }

            return { ...encontrado, esDuplicadoReutilizado: true };
          }
        }
      } catch (checkErr) {
        console.warn('Error al verificar duplicados de destinatario por dirección:', checkErr);
      }
    }

    // 2. Si no viene código de sucursal, auto-generar "Razon Social" + " SUC1", "SUC2", etc.
    let codigoFinal = destinatario.codigo_sucursal?.trim() || null;
    if (!codigoFinal && destinatario.razon_social) {
      try {
        let lista = opciones?.destinatariosExistentes;
        if (!lista) {
          const { data: todos } = await supabase.from('destinatarios').select('*');
          lista = (todos || []) as Destinatario[];
        }
        codigoFinal = generarSiguienteCodigoSucursal(destinatario.razon_social, lista || []);
      } catch (genErr) {
        console.warn('Error al auto-generar codigo_sucursal:', genErr);
        const base = obtenerBaseRazonSocial(destinatario.razon_social);
        codigoFinal = `${base} SUC1`;
      }
    }

    const payload: DestinatarioInsert = {
      ...destinatario,
      codigo_sucursal: codigoFinal ? codigoFinal.toUpperCase() : null,
    };

    const { data, error } = await supabase.from('destinatarios').insert(payload).select().single();
    if (error) throw error;

    // 3. Vincular a los clientes en clientes_destinatarios
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

