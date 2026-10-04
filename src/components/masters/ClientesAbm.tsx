import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  MapPin,
  FileText,
  AlertCircle,
  Power,
  Filter,
  FilterX,
} from 'lucide-react';
import type { Cliente } from '../../api/clientesApi';
import { clientesApi } from '../../api/clientesApi';
import { ClienteModal } from './ClienteModal';
import {
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface ClientesAbmProps {
  onRefreshParent?: () => void;
}

export const ClientesAbm: React.FC<ClientesAbmProps> = ({ onRefreshParent }) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');

  // Column Sorting & Filtering
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    codigo: '',
    razon_social: '',
    identificacion_fiscal: '',
    contacto: '',
    activo: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

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
      codigo: '',
      razon_social: '',
      identificacion_fiscal: '',
      contacto: '',
      activo: '',
    });
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const cargarClientes = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      // Listar todos los clientes (activos e inactivos)
      const data = await clientesApi.listarClientes(false);
      setClientes(data || []);
    } catch (err: any) {
      console.error('Error al cargar clientes:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar clientes desde la base de datos.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarClientes();
  }, []);

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((cli) => {
      // Filtro estado global
      if (filtroEstado === 'activos' && !cli.activo) return false;
      if (filtroEstado === 'inactivos' && cli.activo) return false;

      // Filtro búsqueda global
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const cod = (cli.codigo || '').toLowerCase();
        const razon = (cli.razon_social || '').toLowerCase();
        const fiscal = (cli.identificacion_fiscal || '').toLowerCase();
        const email = (cli.email_contacto || '').toLowerCase();
        const unidad = (cli.unidad_negocio || '').toLowerCase();
        const matchesGlobal =
          cod.includes(term) ||
          razon.includes(term) ||
          fiscal.includes(term) ||
          email.includes(term) ||
          unidad.includes(term);
        if (!matchesGlobal) return false;
      }

      // Column Filters
      if (columnFilters.codigo.trim()) {
        const fCod = columnFilters.codigo.toLowerCase();
        if (!(cli.codigo || '').toLowerCase().includes(fCod)) return false;
      }
      if (columnFilters.razon_social.trim()) {
        const fRazon = columnFilters.razon_social.toLowerCase();
        const razon = (cli.razon_social || '').toLowerCase();
        const unidad = (cli.unidad_negocio || '').toLowerCase();
        if (!razon.includes(fRazon) && !unidad.includes(fRazon)) return false;
      }
      if (columnFilters.identificacion_fiscal.trim()) {
        const fFisc = columnFilters.identificacion_fiscal.toLowerCase();
        if (!(cli.identificacion_fiscal || '').toLowerCase().includes(fFisc)) return false;
      }
      if (columnFilters.contacto.trim()) {
        const fCont = columnFilters.contacto.toLowerCase();
        const email = (cli.email_contacto || '').toLowerCase();
        const tel = (cli.telefono || '').toLowerCase();
        if (!email.includes(fCont) && !tel.includes(fCont)) return false;
      }
      if (columnFilters.activo.trim()) {
        if (columnFilters.activo === 'activos' && !cli.activo) return false;
        if (columnFilters.activo === 'inactivos' && cli.activo) return false;
      }

      return true;
    });
  }, [clientes, searchTerm, filtroEstado, columnFilters]);

  const clientesOrdenados = useMemo(() => {
    if (!sortField || !sortDirection) return clientesFiltrados;
    return [...clientesFiltrados].sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];

      if (typeof aVal === 'boolean') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [clientesFiltrados, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(clientesOrdenados.length / pageSize));

  const paginatedClientes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return clientesOrdenados.slice(start, start + pageSize);
  }, [clientesOrdenados, currentPage, pageSize]);

  const totalActivos = useMemo(() => clientes.filter((c) => c.activo).length, [clientes]);
  const totalInactivos = useMemo(() => clientes.filter((c) => !c.activo).length, [clientes]);

  const handleCrearNuevo = () => {
    setClienteSeleccionado(null);
    setModalOpen(true);
  };

  const handleEditar = (cli: Cliente) => {
    setClienteSeleccionado(cli);
    setModalOpen(true);
  };

  const handleAlternarEstado = async (cli: Cliente) => {
    const nuevoEstado = !cli.activo;
    const accion = nuevoEstado ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Está seguro de ${accion} al cliente "${cli.razon_social}"?`)) return;

    try {
      await clientesApi.alternarEstadoCliente(cli.id, cli.activo);
      setFeedback({
        type: 'ok',
        msg: `Cliente "${cli.razon_social}" ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente.`,
      });
      await cargarClientes();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al alternar estado del cliente:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cambiar estado del cliente.' });
    }
  };

  const handleEliminar = async (cli: Cliente) => {
    if (
      !window.confirm(
        `¿Eliminar al cliente "${cli.razon_social}" (${cli.codigo})?\n\nSi posee movimientos, inventario o recepciones históricas, se dará de baja lógica de manera segura para preservar la integridad de datos.`
      )
    ) {
      return;
    }

    try {
      const res = await clientesApi.eliminarCliente(cli.id);
      if (res.softDelete) {
        setFeedback({
          type: 'ok',
          msg: `El cliente "${cli.razon_social}" tiene registros vinculados; fue dado de baja lógica (inactivo) para proteger el historial operativo.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          msg: `Cliente "${cli.razon_social}" eliminado definitivamente de la base de datos.`,
        });
      }
      await cargarClientes();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al eliminar cliente:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar cliente.' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#cdc3d4] uppercase font-semibold">Total Clientes 3PL</span>
            <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-0.5">{clientes.length}</div>
          </div>
          <div className="p-2 rounded bg-[#201330] text-[#dab9ff] border border-[#522b7c]">
            <Building2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#69f0ae] uppercase font-semibold">Clientes Activos</span>
            <div className="text-xl font-bold font-mono text-[#69f0ae] mt-0.5">{totalActivos}</div>
          </div>
          <div className="p-2 rounded bg-[#153426] text-[#69f0ae] border border-[#1b4332]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#ffb4ab] uppercase font-semibold">Clientes Inactivos</span>
            <div className="text-xl font-bold font-mono text-[#ffb4ab] mt-0.5">{totalInactivos}</div>
          </div>
          <div className="p-2 rounded bg-[#381015] text-[#ffb4ab] border border-[#690005]">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3 rounded text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332]'
              : 'bg-[#381015] text-[#ffb4ab] border border-[#690005]'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.msg}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[10px] uppercase font-mono tracking-wider hover:underline ml-2"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Control bar: Search + Filters + New button */}
      <div className="p-3 bg-[#1c1b1b] border border-[#333333] rounded-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#978d9d] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, razón social, CUIT, email..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:border-[#dab9ff] outline-none"
            />
          </div>

          {/* Filter estado */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setFiltroEstado('todos')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                filtroEstado === 'todos'
                  ? 'bg-[#dab9ff] text-[#460283] font-bold'
                  : 'bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] border border-[#333333]'
              }`}
            >
              Todos ({clientes.length})
            </button>
            <button
              onClick={() => setFiltroEstado('activos')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                filtroEstado === 'activos'
                  ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332] font-bold'
                  : 'bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] border border-[#333333]'
              }`}
            >
              Activos ({totalActivos})
            </button>
            <button
              onClick={() => setFiltroEstado('inactivos')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                filtroEstado === 'inactivos'
                  ? 'bg-[#381015] text-[#ffb4ab] border border-[#690005] font-bold'
                  : 'bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] border border-[#333333]'
              }`}
            >
              Inactivos ({totalInactivos})
            </button>
          </div>

          {/* Column Filters Toggle */}
          <button
            onClick={() => setShowColumnFilters(!showColumnFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors border ${
              showColumnFilters || activeFilterCount > 0
                ? 'bg-[#dab9ff]/20 text-[#dab9ff] border-[#dab9ff]/50'
                : 'bg-[#201f1f] text-[#cdc3d4] border-[#333333] hover:text-[#e5e2e1]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros Columna</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#dab9ff] text-[#460283] text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={clearColumnFilters}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#ffb4ab] hover:underline"
            >
              <FilterX className="w-3 h-3" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargarClientes}
            title="Recargar lista"
            className="p-1.5 rounded border border-[#333333] bg-[#201f1f] hover:bg-[#2a2a2a] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#dab9ff]' : ''}`} />
          </button>
          <button
            onClick={handleCrearNuevo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Clientes Table */}
      <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#44424a] bg-[#201f1f] text-[#cdc3d4] font-medium text-[11px] uppercase tracking-wider">
                <SortableHeaderCell
                  label="Código"
                  sortKey="codigo"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Razón Social & Unidad"
                  sortKey="razon_social"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="CUIT / Identif."
                  sortKey="identificacion_fiscal"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Contacto"
                  sortKey="email_contacto"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Dirección"
                  sortKey="direccion"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Estado"
                  sortKey="activo"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <th className="py-3 px-3 text-center">Acciones</th>
              </tr>
              {showColumnFilters && (
                <tr className="bg-[#181818] border-b border-[#44424a]">
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.codigo}
                      onChange={(v) => handleColumnFilterChange('codigo', v)}
                      placeholder="Filtrar código..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.razon_social}
                      onChange={(v) => handleColumnFilterChange('razon_social', v)}
                      placeholder="Filtrar razón..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.identificacion_fiscal}
                      onChange={(v) => handleColumnFilterChange('identificacion_fiscal', v)}
                      placeholder="Filtrar CUIT..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.contacto}
                      onChange={(v) => handleColumnFilterChange('contacto', v)}
                      placeholder="Filtrar contacto..."
                    />
                  </th>
                  <th className="p-2"></th>
                  <th className="p-2">
                    <ColumnFilterSelect
                      value={columnFilters.activo}
                      onChange={(v) => handleColumnFilterChange('activo', v)}
                      options={[
                        { label: 'Todos', value: '' },
                        { label: 'Activo', value: 'activos' },
                        { label: 'Inactivo', value: 'inactivos' },
                      ]}
                    />
                  </th>
                  <th className="p-2"></th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-[#44424a]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#cdc3d4] text-xs">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin text-[#dab9ff] mb-2" />
                    Cargando catálogo de clientes...
                  </td>
                </tr>
              ) : clientesOrdenados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#cdc3d4] text-xs">
                    <Building2 className="w-8 h-8 mx-auto text-[#978d9d] opacity-40 mb-2" />
                    No se encontraron clientes con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedClientes.map((cli) => (
                  <tr key={cli.id} className="hover:bg-[#201f1f]/50 transition-colors">
                    <td className="py-1.5 px-2.5 font-mono font-bold text-[#dab9ff]">
                      {cli.codigo}
                    </td>

                    <td className="py-1.5 px-2.5">
                      <div className="font-semibold text-xs text-[#e5e2e1]">{cli.razon_social}</div>
                      {cli.unidad_negocio && (
                        <div className="text-[10px] text-[#cdc3d4]">{cli.unidad_negocio}</div>
                      )}
                    </td>

                    <td className="py-1.5 px-2.5 font-mono text-[11px] text-[#cdc3d4]">
                      {cli.identificacion_fiscal || '-'}
                    </td>

                    <td className="py-1.5 px-2.5 text-[#cdc3d4]">
                      {cli.email_contacto && (
                        <div className="flex items-center gap-1 text-[11px] text-[#e5e2e1]">
                          <Mail className="w-3 h-3 text-[#75d1ff]" />
                          <span>{cli.email_contacto}</span>
                        </div>
                      )}
                      {cli.telefono && (
                        <div className="flex items-center gap-1 text-[10px] text-[#cdc3d4] mt-0.5">
                          <Phone className="w-3 h-3 text-[#978d9d]" />
                          <span>{cli.telefono}</span>
                        </div>
                      )}
                      {!cli.email_contacto && !cli.telefono && <span className="text-[#978d9d]">-</span>}
                    </td>

                    <td className="py-1.5 px-2.5 text-[#cdc3d4] max-w-xs truncate text-[11px]">
                      {cli.direccion ? (
                        <div className="flex items-center gap-1" title={cli.direccion}>
                          <MapPin className="w-3 h-3 text-[#978d9d] shrink-0" />
                          <span className="truncate">{cli.direccion}</span>
                        </div>
                      ) : (
                        <span className="text-[#978d9d]">-</span>
                      )}
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold uppercase ${
                          cli.activo
                            ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332]'
                            : 'bg-[#381015] text-[#ffb4ab] border border-[#690005]'
                        }`}
                      >
                        {cli.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditar(cli)}
                          title="Modificar datos del cliente"
                          className="p-1 rounded text-[#cdc3d4] hover:text-[#dab9ff] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleAlternarEstado(cli)}
                          title={cli.activo ? 'Desactivar cliente' : 'Activar cliente'}
                          className={`p-1 rounded transition-colors ${
                            cli.activo
                              ? 'text-[#69f0ae] hover:text-[#ffd27a] hover:bg-[#2a2a2a]'
                              : 'text-[#978d9d] hover:text-[#69f0ae] hover:bg-[#2a2a2a]'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleEliminar(cli)}
                          title="Eliminar o dar de baja al cliente"
                          className="p-1 rounded text-[#cdc3d4] hover:text-[#ffb4ab] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {clientesOrdenados.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={clientesOrdenados.length}
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

      {/* Modal Alta / Edición */}
      <ClienteModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        cliente={clienteSeleccionado}
        onSuccess={() => {
          cargarClientes();
          if (onRefreshParent) onRefreshParent();
          setFeedback({
            type: 'ok',
            msg: clienteSeleccionado
              ? 'Datos del cliente actualizados exitosamente.'
              : 'Nuevo cliente registrado exitosamente en el sistema.',
          });
        }}
      />
    </div>
  );
};
