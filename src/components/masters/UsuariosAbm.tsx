import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  Phone,
  Mail,
  Shield,
  Building2,
  AlertCircle,
  Power,
  Filter,
  FilterX,
  Bot,
  UserCheck,
} from 'lucide-react';
import type { Usuario, Rol } from '../../api/usuariosApi';
import { usuariosApi, CODIGO_TODOS_LOS_CLIENTES } from '../../api/usuariosApi';
import type { Cliente } from '../../api/clientesApi';
import { UsuarioModal } from './UsuarioModal';
import {
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface UsuariosAbmProps {
  clientes: Cliente[];
  onRefreshParent?: () => void;
}

export const UsuariosAbm: React.FC<UsuariosAbmProps> = ({ clientes, onRefreshParent }) => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [filtroRol, setFiltroRol] = useState<string>('todos');

  // Column Sorting & Filtering
  const [sortField, setSortField] = useState<string | null>('nombre_usuario');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    nombre_usuario: '',
    roles: '',
    contacto: '',
    clientes: '',
    activo: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<Usuario | null>(null);

  // Feedback notification
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const activeFilterCount = useMemo(() => {
    return Object.values(columnFilters).filter((v) => v.trim() !== '').length;
  }, [columnFilters]);

  const clearColumnFilters = () => {
    setColumnFilters({
      nombre_usuario: '',
      roles: '',
      contacto: '',
      clientes: '',
      activo: '',
    });
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const cargarDatos = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [usersData, rolesData] = await Promise.all([
        usuariosApi.listarUsuarios(false),
        usuariosApi.listarRoles(false),
      ]);
      setUsuarios(usersData || []);
      setRoles(rolesData || []);
    } catch (err: any) {
      console.error('Error al cargar usuarios:', err);
      setFeedback({
        type: 'err',
        msg: err.message || 'Error al cargar usuarios y roles desde la base de datos.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      // Estado
      if (filtroEstado === 'activos' && !u.activo) return false;
      if (filtroEstado === 'inactivos' && u.activo) return false;

      // Filtro Rol
      if (filtroRol !== 'todos') {
        const hasRol = (u.roles || []).some((r) => r.id === filtroRol || r.rol_nombre === filtroRol);
        if (!hasRol) return false;
      }

      // Búsqueda global
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const nom = (u.nombre_usuario || '').toLowerCase();
        const tel = (u.telefono || '').toLowerCase();
        const mail = (u.email || '').toLowerCase();
        const rolesStr = (u.roles || []).map((r) => r.rol_nombre).join(' ').toLowerCase();
        const clientesStr = (u.clientes_ids || []).join(' ').toLowerCase();

        const match =
          nom.includes(term) ||
          tel.includes(term) ||
          mail.includes(term) ||
          rolesStr.includes(term) ||
          clientesStr.includes(term);

        if (!match) return false;
      }

      // Filtros de Columna
      if (columnFilters.nombre_usuario.trim()) {
        const fNom = columnFilters.nombre_usuario.toLowerCase();
        if (!(u.nombre_usuario || '').toLowerCase().includes(fNom)) return false;
      }
      if (columnFilters.roles.trim()) {
        const fRol = columnFilters.roles.toLowerCase();
        const rolesStr = (u.roles || []).map((r) => r.rol_nombre).join(' ').toLowerCase();
        if (!rolesStr.includes(fRol)) return false;
      }
      if (columnFilters.contacto.trim()) {
        const fCont = columnFilters.contacto.toLowerCase();
        const tel = (u.telefono || '').toLowerCase();
        const mail = (u.email || '').toLowerCase();
        if (!tel.includes(fCont) && !mail.includes(fCont)) return false;
      }
      if (columnFilters.clientes.trim()) {
        const fCli = columnFilters.clientes.toLowerCase();
        const clientesStr = (u.clientes_ids || []).join(' ').toLowerCase();
        if (!clientesStr.includes(fCli)) return false;
      }
      if (columnFilters.activo !== '') {
        const isActivo = columnFilters.activo === 'true';
        if (u.activo !== isActivo) return false;
      }

      return true;
    });
  }, [usuarios, filtroEstado, filtroRol, searchTerm, columnFilters]);

  // Sorting
  const usuariosOrdenados = useMemo(() => {
    if (!sortField || !sortDirection) return usuariosFiltrados;

    return [...usuariosFiltrados].sort((a, b) => {
      let valA: any = (a as any)[sortField];
      let valB: any = (b as any)[sortField];

      if (sortField === 'ultimo_acceso') {
        valA = a.fecha_ultimo_acceso_bot || (a as any).FechaUltimoAccesoBot || '';
        valB = b.fecha_ultimo_acceso_bot || (b as any).FechaUltimoAccesoBot || '';
      }

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      const compare = typeof valA === 'string' ? valA.localeCompare(String(valB)) : valA > valB ? 1 : -1;
      return sortDirection === 'asc' ? compare : -compare;
    });
  }, [usuariosFiltrados, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(usuariosOrdenados.length / pageSize) || 1;
  const paginatedUsuarios = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return usuariosOrdenados.slice(start, start + pageSize);
  }, [usuariosOrdenados, currentPage, pageSize]);

  const handleNuevo = () => {
    setUsuarioSeleccionado(null);
    setModalOpen(true);
  };

  const handleEditar = (u: Usuario) => {
    setUsuarioSeleccionado(u);
    setModalOpen(true);
  };

  const handleAlternarEstado = async (u: Usuario) => {
    try {
      const nuevoEstado = !u.activo;
      await usuariosApi.alternarEstadoUsuario(u.id, u.activo);
      setUsuarios((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, activo: nuevoEstado } : item))
      );
      setFeedback({
        type: 'ok',
        msg: `Usuario "${u.nombre_usuario}" ${nuevoEstado ? 'activado' : 'desactivado'} correctamente.`,
      });
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al cambiar estado de usuario:', err);
      setFeedback({
        type: 'err',
        msg: err.message || 'Error al cambiar estado del usuario en la base de datos.',
      });
    }
  };

  const handleEliminar = async (u: Usuario) => {
    const confirm = window.confirm(
      `¿Está seguro de eliminar o dar de baja al usuario "${u.nombre_usuario}"?`
    );
    if (!confirm) return;

    try {
      const resp = await usuariosApi.eliminarUsuario(u.id);
      if (resp.softDelete) {
        setUsuarios((prev) =>
          prev.map((item) => (item.id === u.id ? { ...item, activo: false } : item))
        );
        setFeedback({
          type: 'ok',
          msg: `El usuario tiene operaciones registradas; se aplicó baja lógica (inactivación).`,
        });
      } else {
        setUsuarios((prev) => prev.filter((item) => item.id !== u.id));
        setFeedback({
          type: 'ok',
          msg: `Usuario "${u.nombre_usuario}" eliminado exitosamente.`,
        });
      }
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al eliminar usuario:', err);
      setFeedback({
        type: 'err',
        msg: err.message || 'Error al eliminar usuario de la base de datos.',
      });
    }
  };

  const getRolBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'admin':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-[#201330] dark:text-[#dab9ff] dark:border-[#522b7c]';
      case 'supervisor':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-[#342410] dark:text-[#ffd27a] dark:border-[#4d3618]';
      case 'operador':
        return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-[#102436] dark:text-[#75d1ff] dark:border-[#1e4976]';
      case 'cliente':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]';
      case 'bot':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-[#0c2e35] dark:text-[#55e0f7] dark:border-[#115867]';
      case 'chofer':
        return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-[#321c0d] dark:text-[#ffb782] dark:border-[#5a2e12]';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#2e2d2d] dark:text-[#cdc3d4] dark:border-[#3d3c3c]';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
              <span>Gestión de Usuarios & Roles</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-slate-100 dark:bg-[#2a2a2a] text-slate-600 dark:text-[#cdc3d4]">
                {usuarios.length} registrados
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
              Administración de cuentas de acceso, roles operativos, vinculación telefónica con el Bot y permisos 3PL
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarDatos}
            disabled={loading}
            className="p-2 rounded border border-slate-300 dark:border-[#333333] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-600 dark:text-[#cdc3d4] transition-colors"
            title="Refrescar catálogo"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleNuevo}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-3 rounded text-xs flex items-center justify-between border ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.msg}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[10px] uppercase font-bold tracking-wider hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="p-3 rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por usuario, teléfono, email o cliente..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-slate-50 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Estado Selector */}
          <div className="flex items-center p-0.5 rounded bg-slate-100 dark:bg-[#131313] border border-slate-200 dark:border-[#333333]">
            {(['todos', 'activos', 'inactivos'] as const).map((est) => (
              <button
                key={est}
                onClick={() => {
                  setFiltroEstado(est);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize transition-all ${
                  filtroEstado === est
                    ? 'bg-white dark:bg-[#201f1f] text-slate-900 dark:text-[#e5e2e1] shadow-xs'
                    : 'text-slate-500 dark:text-[#978d9d] hover:text-slate-800 dark:hover:text-[#e5e2e1]'
                }`}
              >
                {est}
              </button>
            ))}
          </div>

          {/* Filtro Rol */}
          <select
            value={filtroRol}
            onChange={(e) => {
              setFiltroRol(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded bg-slate-50 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none"
          >
            <option value="todos">Todos los Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rol_nombre} ({r.tipo_rol})
              </option>
            ))}
          </select>
        </div>

        {/* Toggle Column Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowColumnFilters(!showColumnFilters)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border transition-colors ${
              showColumnFilters || activeFilterCount > 0
                ? 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-[#201330] dark:border-[#522b7c] dark:text-[#dab9ff]'
                : 'border-slate-200 dark:border-[#333333] text-slate-600 dark:text-[#cdc3d4]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros Columna</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 ml-0.5 rounded-full bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] text-[9px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={clearColumnFilters}
              title="Limpiar filtros"
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a]"
            >
              <FilterX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#333333] bg-slate-50/70 dark:bg-[#161515] text-[11px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase tracking-wider">
                <SortableHeaderCell
                  field="nombre_usuario"
                  label="Nombre de Usuario"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="py-2.5 px-3"
                />
                <th className="py-2.5 px-3">Roles Asignados</th>
                <th className="py-2.5 px-3">Contacto (Tel / Email)</th>
                <th className="py-2.5 px-3">Clientes Asignados</th>
                <SortableHeaderCell
                  field="ultimo_acceso"
                  label="Último Acceso Bot"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="py-2.5 px-3 text-center"
                />
                <SortableHeaderCell
                  field="activo"
                  label="Estado"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="py-2.5 px-3 text-center"
                />
                <th className="py-2.5 px-3 text-center w-28">Acciones</th>
              </tr>

              {/* Fila de Filtros de Columna */}
              {showColumnFilters && (
                <tr className="bg-slate-100/60 dark:bg-[#191818] border-b border-slate-200 dark:border-[#333333]">
                  <td className="p-1 px-3">
                    <ColumnFilterInput
                      value={columnFilters.nombre_usuario}
                      placeholder="Filtrar usuario..."
                      onChange={(val) => handleColumnFilterChange('nombre_usuario', val)}
                    />
                  </td>
                  <td className="p-1 px-3">
                    <ColumnFilterInput
                      value={columnFilters.roles}
                      placeholder="Filtrar rol..."
                      onChange={(val) => handleColumnFilterChange('roles', val)}
                    />
                  </td>
                  <td className="p-1 px-3">
                    <ColumnFilterInput
                      value={columnFilters.contacto}
                      placeholder="Teléfono o mail..."
                      onChange={(val) => handleColumnFilterChange('contacto', val)}
                    />
                  </td>
                  <td className="p-1 px-3">
                    <ColumnFilterInput
                      value={columnFilters.clientes}
                      placeholder="Código cliente o 000..."
                      onChange={(val) => handleColumnFilterChange('clientes', val)}
                    />
                  </td>
                  <td className="p-1 px-3" />
                  <td className="p-1 px-3 text-center">
                    <ColumnFilterSelect
                      value={columnFilters.activo}
                      options={[
                        { label: 'Todos', value: '' },
                        { label: 'Activos', value: 'true' },
                        { label: 'Inactivos', value: 'false' },
                      ]}
                      onChange={(val) => handleColumnFilterChange('activo', val)}
                    />
                  </td>
                  <td className="p-1 px-3" />
                </tr>
              )}
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-[#2a2a2a]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-[#cdc3d4]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-violet-500" />
                      <span>Cargando catálogo de usuarios...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedUsuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-[#978d9d]">
                    No se encontraron usuarios que coincidan con los criterios de búsqueda.
                  </td>
                </tr>
              ) : (
                paginatedUsuarios.map((u) => {
                  const esGlobal = (u.clientes_ids || []).includes(CODIGO_TODOS_LOS_CLIENTES);
                  const ultimoAcceso = u.fecha_ultimo_acceso_bot || (u as any).FechaUltimoAccesoBot;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#201f1f]/50 transition-colors"
                    >
                      {/* Nombre */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-[#e5e2e1]">
                          {u.nombre_usuario}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                          {u.id}
                        </div>
                      </td>

                      {/* Roles */}
                      <td className="py-2.5 px-3">
                        {u.roles && u.roles.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <span
                                key={r.id}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getRolBadgeColor(
                                  r.tipo_rol
                                )}`}
                              >
                                {r.rol_nombre}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Sin roles</span>
                        )}
                      </td>

                      {/* Contacto */}
                      <td className="py-2.5 px-3">
                        {u.email && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-[#e5e2e1]">
                            <Mail className="w-3 h-3 text-sky-500 shrink-0" />
                            <span className="truncate max-w-[180px]">{u.email}</span>
                          </div>
                        )}
                        {u.telefono && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-[#cdc3d4] mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>{u.telefono}</span>
                          </div>
                        )}
                        {!u.email && !u.telefono && (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Clientes Asignados */}
                      <td className="py-2.5 px-3">
                        {esGlobal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-amber-50 text-amber-700 border border-amber-200 dark:bg-[#342410] dark:text-[#ffd27a] dark:border-[#4d3618]">
                            <Building2 className="w-3 h-3" />
                            <span>Todos (000)</span>
                          </span>
                        ) : u.clientes_ids && u.clientes_ids.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {u.clientes_ids.map((cCode) => {
                              const matchCli = clientes.find((c) => c.codigo === cCode);
                              return (
                                <span
                                  key={cCode}
                                  title={matchCli?.razon_social || cCode}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-[#102436] dark:text-[#75d1ff] dark:border-[#1e4976]"
                                >
                                  {cCode}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Ninguno</span>
                        )}
                      </td>

                      {/* Último Acceso Bot */}
                      <td className="py-2.5 px-3 text-center">
                        {ultimoAcceso ? (
                          <div
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-violet-700 dark:text-[#dab9ff]"
                            title={`Último acceso: ${new Date(ultimoAcceso).toLocaleString('es-AR')}`}
                          >
                            <Bot className="w-3 h-3 shrink-0" />
                            <span>
                              {new Date(ultimoAcceso).toLocaleDateString('es-AR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-[#978d9d] italic">
                            -
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            u.activo
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
                          }`}
                        >
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditar(u)}
                            title="Editar usuario"
                            className="p-1 rounded text-slate-400 hover:text-violet-600 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#dab9ff] dark:hover:bg-[#2a2a2a] transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleAlternarEstado(u)}
                            title={u.activo ? 'Desactivar usuario' : 'Activar usuario'}
                            className={`p-1 rounded transition-colors ${
                              u.activo
                                ? 'text-emerald-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]'
                                : 'text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleEliminar(u)}
                            title="Eliminar usuario"
                            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#2a2a2a] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {usuariosOrdenados.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={usuariosOrdenados.length}
            pageSize={pageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* Modal Usuario */}
      <UsuarioModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        usuario={usuarioSeleccionado}
        clientes={clientes}
        onSuccess={() => {
          cargarDatos();
          if (onRefreshParent) onRefreshParent();
          setFeedback({
            type: 'ok',
            msg: usuarioSeleccionado
              ? 'Usuario actualizado exitosamente.'
              : 'Nuevo usuario registrado exitosamente en el sistema.',
          });
        }}
      />
    </div>
  );
};
