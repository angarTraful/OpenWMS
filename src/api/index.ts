export { supabase } from './supabaseClient';
export { clientesApi, obtenerClientesPorId, obtenerClientePorTelefono, normalizarTelefono } from './clientesApi';
export type { ClientesIdsParam } from './clientesApi';
export { usuariosApi, obtenerUsuarioPorId, obtenerUsuarioPorTelefono, actualizarUltimoAccesoBot, CODIGO_TODOS_LOS_CLIENTES } from './usuariosApi';
export type { Usuario, UsuarioBase, UsuarioInsert, UsuarioUpdate, Rol, RolInsert, RolUpdate, TipoRol } from './usuariosApi';
export { articulosApi } from './articulosApi';
export { almacenApi } from './almacenApi';
export { recepcionesApi } from './recepcionesApi';
export { inventarioApi, obtenerStockConsolidadoPorCliente, procesarMovimientoInventario, importarMovimientosMasivos } from './inventarioApi';
export type { MovimientoInventarioInput, ResultadoImportacionMovimientos } from './inventarioApi';
export { pedidosApi, buscarPedidosPorCliente } from './pedidosApi';
export type { PedidoEnEjecucion } from './pedidosApi';
export { despachosApi } from './despachosApi';
export { billingApi } from './billingApi';
export { lotesApi } from './lotesApi';
export {
  programacionApi,
  solicitudesParalelasApi,
  generarTokenAccesoCliente,
  validarTokenAccesoCliente,
  formatFechaCorta,
  PLANILLA_INITIAL_DATA,
} from './programacionApi';
export type {
  ProgramacionItem,
  EstadoProgramacion,
  DocumentoAdjuntoInfo,
  SolicitudParalelaItem,
  TokenAccesoPayload,
} from './programacionApi';

export { operacionesApi } from './operacionesApi';
export type { Operacion, OperacionInsert, OperacionUpdate, FiltrosOperaciones, EstadisticasOperaciones } from './operacionesApi';

export type * from '../../types/database.types';
