import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type Rol = Database['public']['Tables']['roles']['Row'];
export type RolInsert = Database['public']['Tables']['roles']['Insert'];
export type RolUpdate = Database['public']['Tables']['roles']['Update'];
export type TipoRol = Database['public']['Enums']['tipo_rol_enum'];

export type UsuarioBase = Database['public']['Tables']['usuarios']['Row'];
export type UsuarioInsert = Database['public']['Tables']['usuarios']['Insert'];
export type UsuarioUpdate = Database['public']['Tables']['usuarios']['Update'];

export type Usuario = UsuarioBase & {
  roles?: Rol[];
};

export const CODIGO_TODOS_LOS_CLIENTES = '000';

/**
 * Normaliza número de teléfono para búsquedas
 */
export function normalizarTelefono(telefono: string): string {
  if (!telefono) return '';
  return telefono.replace(/\D/g, '');
}

/**
 * Obtiene un usuario a partir de su número de teléfono.
 * Realiza la búsqueda mediante la RPC 'wms_obtener_usuario_por_telefono' con fallback a PostgREST.
 */
export async function obtenerUsuarioPorTelefono(
  telefono: string,
  soloActivos = false
): Promise<Usuario | null> {
  if (!telefono || typeof telefono !== 'string' || !telefono.trim()) {
    return null;
  }

  const cleanTel = telefono.trim();

  // 1. Invocar RPC de Supabase
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'wms_obtener_usuario_por_telefono',
      { p_telefono: cleanTel }
    );

    if (!rpcError && rpcData) {
      const user = rpcData as unknown as Usuario;
      if (soloActivos && !user.activo) {
        return null;
      }
      return user;
    }
  } catch (rpcErr) {
    console.warn('Fallback en obtenerUsuarioPorTelefono:', rpcErr);
  }

  // 2. Fallback de consulta directa
  try {
    let query = supabase
      .from('usuarios')
      .select(`
        *,
        usuarios_roles(
          rol:roles(*)
        )
      `)
      .eq('telefono', cleanTel);

    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      const u = data as any;
      const roles = (u.usuarios_roles || []).map((ur: any) => ur.rol).filter(Boolean);
      return { ...u, roles } as Usuario;
    }

    // Coincidencia flexible por dígitos
    const digitsOnly = normalizarTelefono(cleanTel);
    if (digitsOnly.length >= 6) {
      let listQuery = supabase
        .from('usuarios')
        .select(`
          *,
          usuarios_roles(
            rol:roles(*)
          )
        `);

      if (soloActivos) listQuery = listQuery.eq('activo', true);
      const { data: lista } = await listQuery;

      if (lista && lista.length > 0) {
        const encontrado = lista.find((u: any) => {
          if (!u.telefono) return false;
          const uDigits = normalizarTelefono(u.telefono);
          return (
            uDigits === digitsOnly ||
            uDigits.endsWith(digitsOnly) ||
            digitsOnly.endsWith(uDigits) ||
            uDigits.includes(digitsOnly) ||
            digitsOnly.includes(uDigits)
          );
        });

        if (encontrado) {
          const roles = ((encontrado as any).usuarios_roles || []).map((ur: any) => ur.rol).filter(Boolean);
          return { ...encontrado, roles } as Usuario;
        }
      }
    }
  } catch (err) {
    console.error('Error consultando usuario por teléfono:', err);
    throw err;
  }

  return null;
}

/**
 * Actualiza la fecha de último acceso del bot para un usuario.
 * Permite buscar al usuario indistintamente por:
 *  - ID (UUID)
 *  - Teléfono (exacto o normalizado)
 *  - Email
 *  - Nombre de usuario
 */
export async function actualizarUltimoAccesoBot(
  identificador: string,
  fecha?: string | Date
): Promise<Usuario | null> {
  if (!identificador || typeof identificador !== 'string' || !identificador.trim()) {
    return null;
  }

  const cleanId = identificador.trim();
  const fechaIso =
    fecha instanceof Date
      ? fecha.toISOString()
      : fecha
      ? new Date(fecha).toISOString()
      : new Date().toISOString();

  // 1. Invocar RPC de Supabase
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'wms_actualizar_ultimo_acceso_bot',
      {
        p_identificador: cleanId,
        p_fecha: fechaIso,
      }
    );

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      const resp = rpcData as any;
      if (resp.usuario) {
        return {
          ...resp.usuario,
          roles: resp.roles || [],
        } as Usuario;
      }
      if (resp.id) {
        return resp as Usuario;
      }
    }
  } catch (rpcErr) {
    console.warn('Fallback en actualizarUltimoAccesoBot (usuarios):', rpcErr);
  }

  // 2. Fallback de resolución y actualización directa sobre 'usuarios'
  try {
    let usuarioEncontrado: Usuario | null = null;

    // 2.a Por UUID si tiene formato UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
      const { data } = await supabase.from('usuarios').select('*').eq('id', cleanId).maybeSingle();
      if (data) usuarioEncontrado = data as Usuario;
    }

    // 2.b Por Teléfono
    if (!usuarioEncontrado) {
      usuarioEncontrado = await obtenerUsuarioPorTelefono(cleanId);
    }

    // 2.c Por Email
    if (!usuarioEncontrado) {
      const { data } = await supabase.from('usuarios').select('*').ilike('email', cleanId).maybeSingle();
      if (data) usuarioEncontrado = data as Usuario;
    }

    // 2.d Por Nombre de Usuario
    if (!usuarioEncontrado) {
      const { data } = await supabase.from('usuarios').select('*').ilike('nombre_usuario', cleanId).maybeSingle();
      if (data) usuarioEncontrado = data as Usuario;
    }

    if (!usuarioEncontrado) {
      console.warn(`No se encontró usuario para el identificador: ${cleanId}`);
      return null;
    }

    const { data: updated, error: updateError } = await supabase
      .from('usuarios')
      .update({
        fecha_ultimo_acceso_bot: fechaIso,
        FechaUltimoAccesoBot: fechaIso,
        actualizado_en: new Date().toISOString(),
      } as any)
      .eq('id', usuarioEncontrado.id)
      .select(`
        *,
        usuarios_roles(
          rol:roles(*)
        )
      `)
      .single();

    if (updateError) throw updateError;
    const u = updated as any;
    const roles = (u.usuarios_roles || []).map((ur: any) => ur.rol).filter(Boolean);
    return { ...u, roles } as Usuario;
  } catch (err) {
    console.error('Error al actualizar fecha de último acceso del bot:', err);
    throw err;
  }
}

/**
 * Obtiene los usuarios que tienen acceso a un cliente por su código.
 * Incluye a los usuarios asignados directamente a ese código y a los que tienen '000' (Todos).
 */
export async function listarUsuariosPorClienteCodigo(
  clienteCodigo: string
): Promise<Usuario[]> {
  if (!clienteCodigo || !clienteCodigo.trim()) return [];

  const cleanCod = clienteCodigo.trim();

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'wms_obtener_usuarios_por_cliente',
      { p_codigo_cliente: cleanCod }
    );

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      return rpcData as unknown as Usuario[];
    }
  } catch (rpcErr) {
    console.warn('Fallback en listarUsuariosPorClienteCodigo:', rpcErr);
  }

  // Fallback directo
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select(`
        *,
        usuarios_roles(
          rol:roles(*)
        )
      `)
      .eq('activo', true);

    if (error) throw error;

    const filtrados = (data || []).filter((u: any) => {
      const cIds: string[] = u.clientes_ids || [];
      return cIds.includes(CODIGO_TODOS_LOS_CLIENTES) || cIds.includes(cleanCod);
    });

    return filtrados.map((u: any) => ({
      ...u,
      roles: (u.usuarios_roles || []).map((ur: any) => ur.rol).filter(Boolean),
    })) as Usuario[];
  } catch (err) {
    console.error('Error listando usuarios por cliente:', err);
    throw err;
  }
}

/**
 * Obtiene un usuario en formato JSON a partir de su ID (UUID).
 * Invoca prioritariamente la RPC de Supabase 'wms_obtener_usuario_por_id'
 * con fallback automático a PostgREST por resiliencia.
 *
 * @param usuarioId ID UUID del usuario
 * @param soloActivos Opcional. Si es true, retorna null si el usuario está inactivo (por defecto false)
 * @returns Objeto Usuario con sus roles asociados o null si no se encuentra
 */
export async function obtenerUsuarioPorId(
  usuarioId: string,
  soloActivos = false
): Promise<Usuario | null> {
  if (!usuarioId || typeof usuarioId !== 'string' || !usuarioId.trim()) {
    return null;
  }

  const cleanId = usuarioId.trim();

  // 1. Invocar RPC nativa de Supabase 'wms_obtener_usuario_por_id'
  try {
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      'wms_obtener_usuario_por_id',
      {
        p_usuario_id: cleanId,
        p_solo_activos: soloActivos,
      }
    );

    if (!rpcError && rpcData && typeof rpcData === 'object') {
      return rpcData as unknown as Usuario;
    }
    if (rpcError && !rpcError.message?.includes('schema cache')) {
      console.warn('RPC wms_obtener_usuario_por_id fallback:', rpcError.message);
    }
  } catch (rpcErr: any) {
    console.warn('Fallback en obtenerUsuarioPorId:', rpcErr?.message);
  }

  // 2. Fallback de consulta directa vía PostgREST
  try {
    let query = supabase
      .from('usuarios')
      .select(`
        *,
        usuarios_roles(
          rol:roles(*)
        )
      `)
      .eq('id', cleanId);

    if (soloActivos) query = query.eq('activo', true);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const u = data as any;
    const roles = (u.usuarios_roles || []).map((ur: any) => ur.rol).filter(Boolean);
    return { ...u, roles } as Usuario;
  } catch (err) {
    console.error('Error al obtener usuario por ID:', err);
    throw err;
  }
}

export const usuariosApi = {
  CODIGO_TODOS_LOS_CLIENTES,
  normalizarTelefono,
  obtenerUsuarioPorTelefono,
  actualizarUltimoAccesoBot,
  listarUsuariosPorClienteCodigo,
  obtenerUsuarioPorId,

  // --- CRUD Usuarios ---
  async listarUsuarios(soloActivos = false): Promise<Usuario[]> {
    let query = supabase
      .from('usuarios')
      .select(`
        *,
        usuarios_roles(
          rol:roles(*)
        )
      `)
      .order('nombre_usuario', { ascending: true });

    if (soloActivos) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((u: any) => ({
      ...u,
      roles: (u.usuarios_roles || []).map((ur: any) => ur.rol).filter(Boolean),
    })) as Usuario[];
  },

  async crearUsuario(
    usuario: UsuarioInsert,
    rolesIds: string[] = []
  ): Promise<Usuario> {
    // Asegurar que clientes_ids tenga al menos '000' si viene vacío
    const clientesIdsFinal =
      usuario.clientes_ids && usuario.clientes_ids.length > 0
        ? usuario.clientes_ids
        : [CODIGO_TODOS_LOS_CLIENTES];

    const payload: UsuarioInsert = {
      ...usuario,
      clientes_ids: clientesIdsFinal,
      actualizado_en: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('usuarios').insert(payload).select().single();
    if (error) throw error;

    // Vincular roles si se especificaron
    if (rolesIds && rolesIds.length > 0) {
      const rows = rolesIds.map((rId) => ({
        usuario_id: data.id,
        rol_id: rId,
      }));
      await supabase.from('usuarios_roles').insert(rows);
    }

    return (await this.obtenerUsuarioPorId(data.id))!;
  },

  async actualizarUsuario(
    id: string,
    cambios: UsuarioUpdate,
    rolesIds?: string[]
  ): Promise<Usuario> {
    const payload: UsuarioUpdate = {
      ...cambios,
      actualizado_en: new Date().toISOString(),
    };

    const { error } = await supabase.from('usuarios').update(payload).eq('id', id);
    if (error) throw error;

    // Sincronizar roles si se proveyó rolesIds
    if (rolesIds !== undefined) {
      // Eliminar roles que ya no están
      await supabase.from('usuarios_roles').delete().eq('usuario_id', id);

      // Insertar nuevos roles
      if (rolesIds.length > 0) {
        const rows = rolesIds.map((rId) => ({
          usuario_id: id,
          rol_id: rId,
        }));
        await supabase.from('usuarios_roles').insert(rows);
      }
    }

    return (await this.obtenerUsuarioPorId(id))!;
  },

  async eliminarUsuario(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) {
      // Fallback a baja lógica
      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },

  async alternarEstadoUsuario(id: string, activoActual: boolean): Promise<Usuario> {
    const { data, error } = await supabase
      .from('usuarios')
      .update({ activo: !activoActual, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return (await this.obtenerUsuarioPorId(data.id))!;
  },

  // --- CRUD Roles ---
  async listarRoles(soloActivos = true): Promise<Rol[]> {
    let query = supabase.from('roles').select('*').order('rol_nombre', { ascending: true });
    if (soloActivos) query = query.eq('activo', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as Rol[];
  },

  async crearRol(rol: RolInsert): Promise<Rol> {
    const { data, error } = await supabase.from('roles').insert(rol).select().single();
    if (error) throw error;
    return data as Rol;
  },

  async actualizarRol(id: string, cambios: RolUpdate): Promise<Rol> {
    const { data, error } = await supabase
      .from('roles')
      .update({ ...cambios, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Rol;
  },

  async eliminarRol(id: string): Promise<{ softDelete: boolean }> {
    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) {
      const { error: updateError } = await supabase
        .from('roles')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      return { softDelete: true };
    }
    return { softDelete: false };
  },
};
