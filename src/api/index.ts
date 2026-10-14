export { supabase } from './supabaseClient';
export { clientesApi, obtenerClientePorTelefono, normalizarTelefono } from './clientesApi';
export { usuariosApi, obtenerUsuarioPorTelefono, actualizarUltimoAccesoBot, CODIGO_TODOS_LOS_CLIENTES } from './usuariosApi';
export type { Usuario, UsuarioBase, UsuarioInsert, UsuarioUpdate, Rol, RolInsert, RolUpdate, TipoRol } from './usuariosApi';
export { articulosApi } from './articulosApi';
export { almacenApi } from './almacenApi';
export { recepcionesApi } from './recepcionesApi';
export { inventarioApi, obtenerStockConsolidadoPorCliente } from './inventarioApi';
export { pedidosApi } from './pedidosApi';
export { despachosApi } from './despachosApi';
export { billingApi } from './billingApi';
export { lotesApi } from './lotesApi';

export type * from '../../types/database.types';

