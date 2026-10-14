import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Shield,
  Save,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  Bot,
  Check,
} from 'lucide-react';
import type { Usuario, UsuarioInsert, UsuarioUpdate, Rol } from '../../api/usuariosApi';
import { usuariosApi, CODIGO_TODOS_LOS_CLIENTES } from '../../api/usuariosApi';
import type { Cliente } from '../../api/clientesApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface UsuarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  usuario: Usuario | null;
  clientes: Cliente[];
  onSuccess: () => void;
}

export const UsuarioModal: React.FC<UsuarioModalProps> = ({
  isOpen,
  onClose,
  usuario,
  clientes,
  onSuccess,
}) => {
  const isEditing = Boolean(usuario);

  const [nombreUsuario, setNombreUsuario] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [activo, setActivo] = useState(true);

  // Roles
  const [rolesDisponibles, setRolesDisponibles] = useState<Rol[]>([]);
  const [rolesSeleccionados, setRolesSeleccionados] = useState<string[]>([]);
  const [cargandoRoles, setCargandoRoles] = useState(false);

  // Clientes asignados
  const [todosLosClientes, setTodosLosClientes] = useState(true);
  const [clientesSeleccionados, setClientesSeleccionados] = useState<string[]>([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar lista de roles disponibles al abrir
  useEffect(() => {
    if (isOpen) {
      setCargandoRoles(true);
      usuariosApi
        .listarRoles(true)
        .then((roles) => setRolesDisponibles(roles))
        .catch((err) => console.error('Error al cargar roles:', err))
        .finally(() => setCargandoRoles(false));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (usuario) {
        setNombreUsuario(usuario.nombre_usuario || '');
        setTelefono(usuario.telefono || '');
        setEmail(usuario.email || '');
        setActivo(usuario.activo ?? true);

        // Roles
        const roleIds = (usuario.roles || []).map((r) => r.id);
        setRolesSeleccionados(roleIds);

        // Clientes
        const cIds = usuario.clientes_ids || [];
        if (cIds.includes(CODIGO_TODOS_LOS_CLIENTES) || cIds.length === 0) {
          setTodosLosClientes(true);
          setClientesSeleccionados([]);
        } else {
          setTodosLosClientes(false);
          setClientesSeleccionados(cIds);
        }
      } else {
        setNombreUsuario('');
        setTelefono('');
        setEmail('');
        setActivo(true);
        setRolesSeleccionados([]);
        setTodosLosClientes(true);
        setClientesSeleccionados([]);
      }
      setBusquedaCliente('');
      setErrorMsg(null);
    }
  }, [isOpen, usuario]);

  if (!isOpen) return null;

  const toggleRol = (rolId: string) => {
    setRolesSeleccionados((prev) =>
      prev.includes(rolId) ? prev.filter((id) => id !== rolId) : [...prev, rolId]
    );
  };

  const toggleCliente = (codigo: string) => {
    setClientesSeleccionados((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nombreUsuario.trim()) {
      setErrorMsg('El nombre de usuario es obligatorio.');
      return;
    }

    // Resolver clientes_ids
    let finalClientesIds: string[] = [];
    if (todosLosClientes) {
      finalClientesIds = [CODIGO_TODOS_LOS_CLIENTES];
    } else {
      if (clientesSeleccionados.length === 0) {
        setErrorMsg('Debe seleccionar al menos un cliente depositante o activar "Acceso a Todos los Clientes (000)".');
        return;
      }
      finalClientesIds = clientesSeleccionados;
    }

    setLoading(true);
    try {
      if (isEditing && usuario) {
        const cambios: UsuarioUpdate = {
          nombre_usuario: nombreUsuario.trim(),
          telefono: telefono.trim() || null,
          email: email.trim().toLowerCase() || null,
          clientes_ids: finalClientesIds,
          activo,
          actualizado_en: new Date().toISOString(),
        };

        await usuariosApi.actualizarUsuario(usuario.id, cambios, rolesSeleccionados);
      } else {
        const nuevo: UsuarioInsert = {
          nombre_usuario: nombreUsuario.trim(),
          telefono: telefono.trim() || null,
          email: email.trim().toLowerCase() || null,
          clientes_ids: finalClientesIds,
          activo,
        };

        await usuariosApi.crearUsuario(nuevo, rolesSeleccionados);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al guardar usuario:', err);
      setErrorMsg(err.message || 'Error al guardar los datos del usuario en la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  const isFormDirty = isEditing
    ? Boolean(
        usuario &&
          (nombreUsuario !== (usuario.nombre_usuario || '') ||
            telefono !== (usuario.telefono || '') ||
            email !== (usuario.email || '') ||
            activo !== (usuario.activo ?? true) ||
            todosLosClientes !== (usuario.clientes_ids || []).includes(CODIGO_TODOS_LOS_CLIENTES))
      )
    : Boolean(nombreUsuario || telefono || email || !todosLosClientes || rolesSeleccionados.length > 0);

  const clientesFiltrados = clientes.filter((c) => {
    if (!busquedaCliente.trim()) return true;
    const term = busquedaCliente.toLowerCase();
    return (
      (c.codigo || '').toLowerCase().includes(term) ||
      (c.razon_social || '').toLowerCase().includes(term)
    );
  });

  const ultimoAccesoBot = usuario?.fecha_ultimo_acceso_bot || (usuario as any)?.FechaUltimoAccesoBot;

  return (
    <ModalPortal
      onClose={onClose}
      isDirty={isFormDirty}
      confirmMessage="¿Está seguro de cerrar el formulario de usuario? Los datos no guardados se perderán."
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fadeIn">
        <div className="relative w-full max-w-xl rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                  {isEditing ? 'Editar Cuenta de Usuario' : 'Nuevo Usuario del Sistema'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                  Gestión de credenciales, roles y asignación de clientes 3PL
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
            {errorMsg && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Datos Básicos */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Nombre de Usuario <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="text"
                required
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                placeholder="Ej: Juan Perez / jperez / BotOperador"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-medium text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>Teléfono / WhatsApp</span>
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
                <span className="text-[10px] text-slate-400 dark:text-[#978d9d] mt-0.5 block">
                  Identificador para integración con el Bot
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span>Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>

            {/* Asignación de Roles */}
            <div className="p-3 rounded bg-slate-50 dark:bg-[#161515] border border-slate-200 dark:border-[#2a2a2a] space-y-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-violet-500 dark:text-[#dab9ff]" />
                <span>Roles Asignados (Permite uno o varios)</span>
              </label>

              {cargandoRoles ? (
                <div className="text-slate-400 text-xs italic">Cargando catálogo de roles...</div>
              ) : rolesDisponibles.length === 0 ? (
                <div className="text-slate-400 text-xs italic">No hay roles activos disponibles.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {rolesDisponibles.map((r) => {
                    const isSelected = rolesSeleccionados.includes(r.id);
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => toggleRol(r.id)}
                        className={`flex items-center justify-between p-2 rounded border text-left transition-all ${
                          isSelected
                            ? 'bg-violet-50 border-violet-300 text-violet-800 dark:bg-[#201330] dark:border-[#dab9ff] dark:text-[#dab9ff] font-semibold'
                            : 'bg-white border-slate-200 text-slate-700 dark:bg-[#1c1b1b] dark:border-[#333333] dark:text-[#cdc3d4] hover:border-slate-300'
                        }`}
                      >
                        <div className="truncate">
                          <div className="text-[11px] truncate">{r.rol_nombre}</div>
                          <div className="text-[9px] uppercase font-mono text-slate-400 dark:text-[#978d9d]">
                            {r.tipo_rol}
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Asignación de Clientes (ClientesIds) */}
            <div className="p-3 rounded bg-slate-50 dark:bg-[#161515] border border-slate-200 dark:border-[#2a2a2a] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-sky-500" />
                  <span>Clientes Depositantes Asignados</span>
                </label>
              </div>

              {/* Opción Todos los Clientes ('000') */}
              <label className="flex items-center gap-2 p-2 rounded bg-amber-50/70 border border-amber-200 dark:bg-[#342410]/50 dark:border-[#4d3618] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={todosLosClientes}
                  onChange={(e) => {
                    setTodosLosClientes(e.target.checked);
                    if (e.target.checked) {
                      setClientesSeleccionados([]);
                    }
                  }}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-0"
                />
                <div>
                  <div className="text-[11px] font-bold text-amber-900 dark:text-[#ffd27a]">
                    Acceso a Todos los Clientes (Código 000)
                  </div>
                  <div className="text-[10px] text-amber-700 dark:text-[#cdc3d4]">
                    El usuario tendrá visibilidad y acceso a todos los clientes del WMS y futuras incorporaciones.
                  </div>
                </div>
              </label>

              {/* Selección específica de clientes si no tiene '000' */}
              {!todosLosClientes && (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    placeholder="Filtrar por código o razón social..."
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-[11px] text-slate-900 dark:text-[#e5e2e1] focus:outline-none"
                  />

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border border-slate-200 dark:border-[#333333] rounded p-1 bg-white dark:bg-[#131313]">
                    {clientesFiltrados.length === 0 ? (
                      <div className="p-2 text-center text-slate-400 text-[11px]">
                        No se encontraron clientes coincidentes.
                      </div>
                    ) : (
                      clientesFiltrados.map((c) => {
                        const isChecked = clientesSeleccionados.includes(c.codigo);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center justify-between p-1.5 rounded cursor-pointer text-[11px] transition-colors ${
                              isChecked
                                ? 'bg-sky-50 dark:bg-[#102436] text-sky-900 dark:text-[#75d1ff]'
                                : 'hover:bg-slate-100 dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCliente(c.codigo)}
                                className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-0"
                              />
                              <span className="font-mono font-bold">{c.codigo}</span>
                              <span className="truncate max-w-[240px]">{c.razon_social}</span>
                            </div>
                            {isChecked && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-[#978d9d]">
                    Seleccionados: {clientesSeleccionados.length} clientes ({clientesSeleccionados.join(', ') || 'Ninguno'})
                  </div>
                </div>
              )}
            </div>

            {/* Acceso Bot si está registrado */}
            {isEditing && ultimoAccesoBot && (
              <div className="p-2.5 rounded bg-violet-50/60 dark:bg-[#201330]/60 border border-violet-200 dark:border-[#522b7c] flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-violet-500 dark:text-[#dab9ff]" />
                  <span>Último Acceso Registrado por Bot:</span>
                </span>
                <span className="font-mono text-violet-700 dark:text-[#dab9ff] font-semibold">
                  {new Date(ultimoAccesoBot).toLocaleString('es-AR')}
                </span>
              </div>
            )}

            {/* Toggle Activo */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-[#333333]">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-800 dark:text-[#e5e2e1]">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="w-4 h-4 rounded text-violet-600 dark:text-[#dab9ff] border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] focus:ring-0"
                />
                <span className="font-medium">Usuario Activo en el Sistema</span>
              </label>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-semibold ${
                  activo
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                    : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
                }`}
              >
                {activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            {/* Actions */}
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#333333]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Usuario'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
