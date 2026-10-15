import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';
import {
  actualizarUltimoAccesoBot as actualizarUltimoAccesoBotUsuario,
  listarUsuariosPorClienteCodigo,
  type Usuario,
} from './usuariosApi';

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

/**
 * Normaliza un número de teléfono extrayendo únicamente los dígitos numéricos
 * para comparaciones seguras y tolerantes a formatos (ej: "+54 11 4789-1000" -> "541147891000")
 */
export function normalizarTelefono(telefono: string): string {
  if (!telefono) return '';
  return telefono.replace(/\D/g, '');
}

/**
 * Obtiene el objeto cliente en formato JSON a partir del número de teléfono.
 * Realiza la búsqueda a través de la API de Supabase, invocando prioritariamente
 * el procedimiento RPC 'wms_obtener_cliente_por_telefono' y con fallback a consulta
 * directa sobre la tabla 'clientes' (con búsqueda exacta y por dígitos normalizados).
 *
 * @param telefono Número de teléfono del cliente a consultar
 * @param soloActivos Opcional. Si es true, filtra solo clientes activos (por defecto false)
 * @returns Promesa con el objeto Cliente en formato JSON o null si no se encuentra
 */
export async function obtenerClientePorTelefono(
  telefono: string,
  soloActivos = false
): Promise<Cliente | null> {
  if (!telefono || typeof telefono !== 'string' || !telefono.trim()) {
    return null;
  }

  const cleanTel = telefono.trim();

  // 1. Invocar RPC nativo de Supabase si está disponible
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'wms_obtener_cliente_por_telefono',
      { p_telefono: cleanTel }
    );

    if (!rpcError && rpcData) {
      const cliente = rpcData as unknown as Cliente;
      if (soloActivos && !cliente.activo) {
        return null;
      }
      return cliente;
    }
  } catch (rpcErr) {
    console.warn('Fallback a consulta directa en obtenerClientePorTelefono:', rpcErr);
  }

  // 2. Fallback de consulta directa a la API de Supabase (PostgREST)
  try {
    // 2.a Coincidencia exacta de texto
    let query = supabase.from('clientes').select('*').eq('telefono', cleanTel);
    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      return data;
    }

    // 2.b Búsqueda flexible por dígitos normalizados
    const digitsOnly = normalizarTelefono(cleanTel);
    if (digitsOnly.length >= 6) {
      let listQuery = supabase.from('clientes').select('*');
      if (soloActivos) listQuery = listQuery.eq('activo', true);
      const { data: lista, error: listError } = await listQuery;

      if (!listError && lista && lista.length > 0) {
        const encontrado = lista.find((c) => {
          if (!c.telefono) return false;
          const cDigits = normalizarTelefono(c.telefono);
          return (
            cDigits === digitsOnly ||
            cDigits.endsWith(digitsOnly) ||
            digitsOnly.endsWith(cDigits) ||
            cDigits.includes(digitsOnly) ||
            digitsOnly.includes(cDigits)
          );
        });

        if (encontrado) return encontrado;
      }
    }
  } catch (err) {
    console.error('Error al obtener cliente por teléfono:', err);
    throw err;
  }

  return null;
}

/**
 * Actualiza la columna FechaUltimoAccesoBot delegando a Usuarios.
 * En la nueva arquitectura, el registro de accesos del bot se asocia a la tabla de usuarios
 * mediante su teléfono, UUID, email o nombre de usuario.
 *
 * @param identificador UUID, código, teléfono, email o nombre de usuario
 * @param fecha Opcional. Timestamp o Date (por defecto fecha y hora actual)
 * @returns Promesa con el usuario actualizado o null si no se encontró
 */
export async function actualizarUltimoAccesoBot(
  identificador: string,
  fecha?: string | Date
): Promise<any> {
  return actualizarUltimoAccesoBotUsuario(identificador, fecha);
}

/**
 * Tipo flexible para el parámetro de entrada de 'obtenerClientesPorId'.
 * Admite:
 * 1. El objeto Usuario o JSON completo devuelto por 'obtener_usuario_por_telefono' (que contiene clientes_ids).
 * 2. Un array de IDs o códigos: string[] (ej: ['000'], ['CLI01', 'CLI02']).
 * 3. Un ID o código único: string (ej: '001', '000').
 * 4. Un objeto que contenga la propiedad 'clientes_ids' o 'p_clientes_ids'.
 */
export type ClientesIdsParam =
  | string[]
  | string
  | { clientes_ids?: string[] | null; [key: string]: any }
  | Usuario
  | null
  | undefined;

/**
 * Extrae y normaliza la lista de identificadores a partir de múltiples formatos de entrada:
 * objeto usuario de obtener_usuario_por_telefono, array de strings, o string único.
 */
export function normalizarClientesIdsInput(input: ClientesIdsParam): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map((id) => String(id).trim()).filter(Boolean);
  }

  if (typeof input === 'object') {
    const rawList =
      input.clientes_ids ||
      (input as any).p_clientes_ids ||
      (input as any).ClientesIds ||
      (input as any).clientesIds;

    if (Array.isArray(rawList)) {
      return rawList.map((id) => String(id).trim()).filter(Boolean);
    }
    if (typeof rawList === 'string' && rawList.trim()) {
      return rawList.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }

  return [];
}

/**
 * Obtiene la lista de clientes depositantes correspondientes a los identificadores provistos.
 * Diseñada específicamente para recibir directamente el resultado de 'obtener_usuario_por_telefono'
 * (o su array 'clientes_ids').
 * 
 * Reglas de negocio:
 * - Si contiene el código '000', retorna todos los clientes depositantes autorizados.
 * - Soporta tanto códigos comerciales de cliente (ej: '001', 'CLI01') como UUIDs de base de datos.
 * - Invoca prioritariamente la RPC 'wms_obtener_clientes_por_id' de Supabase.
 * - Incluye fallback automático a PostgREST por compatibilidad y resiliencia offline.
 *
 * @param input Objeto devuelto por obtener_usuario_por_telefono, array de clientes_ids o código/ID
 * @param soloActivos Opcional. Si es true, filtra solo clientes con activo = true (por defecto false)
 * @returns Promesa con el array de clientes en formato JSON
 */
export async function obtenerClientesPorId(
  input: ClientesIdsParam,
  soloActivos = false
): Promise<Cliente[]> {
  const ids = normalizarClientesIdsInput(input);
  if (ids.length === 0) {
    return [];
  }

  const tieneTodos = ids.includes('000');

  // 1. Invocar RPC de Supabase 'wms_obtener_clientes_por_id'
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      'wms_obtener_clientes_por_id',
      {
        p_clientes_ids: ids,
        p_solo_activos: soloActivos,
      }
    );

    if (!rpcError && Array.isArray(rpcData)) {
      return rpcData as Cliente[];
    }
  } catch (rpcErr) {
    console.warn('Fallback en obtenerClientesPorId:', rpcErr);
  }

  // 2. Fallback de consulta directa a la tabla 'clientes'
  try {
    let query = supabase.from('clientes').select('*');
    if (soloActivos) query = query.eq('activo', true);

    const { data, error } = await query.order('razon_social', { ascending: true });
    if (error) throw error;

    const lista = (data || []) as Cliente[];

    // Si tiene '000', tiene permiso para todos los clientes
    if (tieneTodos) {
      return lista;
    }

    // Filtrar en memoria por coincidencia exacta con codigo o id UUID
    const idsSet = new Set(ids);
    return lista.filter((c) => idsSet.has(c.codigo) || idsSet.has(c.id));
  } catch (err) {
    console.error('Error al obtener clientes por IDs:', err);
    throw err;
  }
}

export const clientesApi = {
  // Exponer utilidades para uso directo
  normalizarDireccion,
  normalizarTexto,
  normalizarTelefono,
  normalizarClientesIdsInput,
  obtenerBaseRazonSocial,
  generarSiguienteCodigoSucursal,
  buscarDestinatarioPorDireccion,

  // --- Usuarios Relacionados con el Cliente ---
  obtenerUsuariosRelacionados: (codigoCliente: string): Promise<Usuario[]> => {
    return listarUsuariosPorClienteCodigo(codigoCliente);
  },

  // --- Clientes Depositantes ---
  actualizarUltimoAccesoBot,
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

  obtenerClientesPorId,
  obtenerClientePorTelefono,

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

