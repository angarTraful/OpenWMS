import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Phone,
  Clock,
  Building2,
  AlertCircle,
  Power,
  Filter,
  FilterX,
} from 'lucide-react';
import { clientesApi, Destinatario, Cliente } from '../../api/clientesApi';
import { DestinatarioModal } from './DestinatarioModal';
import {
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface DestinatariosAbmProps {
  clientes: Cliente[];
  selectedClienteId?: string;
  onRefreshParent?: () => void;
}

export const DestinatariosAbm: React.FC<DestinatariosAbmProps> = ({
  clientes,
  selectedClienteId,
  onRefreshParent,
}) => {
  const [destinatarios, setDestinatarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroClienteId, setFiltroClienteId] = useState<string>(selectedClienteId || '');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');

  // Column Sorting & Filtering
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    cliente: '',
    razon_social: '',
    direccion: '',
    contacto: '',
    activo: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [destinatarioSeleccionado, setDestinatarioSeleccionado] = useState<Destinatario | null>(null);

  // Feedback Notification
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
      cliente: '',
      razon_social: '',
      direccion: '',
      contacto: '',
      activo: '',
    });
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const cargarDestinatarios = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await clientesApi.listarDestinatarios({
        clienteId: filtroClienteId || undefined,
        soloActivos: false,
      });
      setDestinatarios(data || []);
    } catch (err: any) {
      console.error('Error cargando destinatarios:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar sucursales y destinatarios.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDestinatarios();
  }, [filtroClienteId]);

  const destinatariosFiltrados = useMemo(() => {
    return destinatarios.filter((dest) => {
      // Estado global
      if (filtroEstado === 'activos' && !dest.activo) return false;
      if (filtroEstado === 'inactivos' && dest.activo) return false;

      // Búsqueda global
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const razon = (dest.razon_social || '').toLowerCase();
        const suc = (dest.codigo_sucursal || '').toLowerCase();
        const dir = (dest.direccion_entrega || '').toLowerCase();
        const ciudad = (dest.ciudad || '').toLowerCase();
        const contacto = (dest.contacto_recepcion || '').toLowerCase();
        const clienteRazon = (dest.cliente?.razon_social || '').toLowerCase();
        const matchesGlobal =
          razon.includes(term) ||
          suc.includes(term) ||
          dir.includes(term) ||
          ciudad.includes(term) ||
          contacto.includes(term) ||
          clienteRazon.includes(term);
        if (!matchesGlobal) return false;
      }

      // Column filters
      if (columnFilters.cliente.trim()) {
        const fCli = columnFilters.cliente.toLowerCase();
        const cli = (dest.cliente?.razon_social || '').toLowerCase();
        const cod = (dest.cliente?.codigo || '').toLowerCase();
        if (!cli.includes(fCli) && !cod.includes(fCli)) return false;
      }
      if (columnFilters.razon_social.trim()) {
        const fRazon = columnFilters.razon_social.toLowerCase();
        const razon = (dest.razon_social || '').toLowerCase();
        const suc = (dest.codigo_sucursal || '').toLowerCase();
        if (!razon.includes(fRazon) && !suc.includes(fRazon)) return false;
      }
      if (columnFilters.direccion.trim()) {
        const fDir = columnFilters.direccion.toLowerCase();
        const dir = (dest.direccion_entrega || '').toLowerCase();
        const ciudad = (dest.ciudad || '').toLowerCase();
        if (!dir.includes(fDir) && !ciudad.includes(fDir)) return false;
      }
      if (columnFilters.contacto.trim()) {
        const fCont = columnFilters.contacto.toLowerCase();
        const cont = (dest.contacto_recepcion || '').toLowerCase();
        const tel = (dest.telefono || '').toLowerCase();
        if (!cont.includes(fCont) && !tel.includes(fCont)) return false;
      }
      if (columnFilters.activo.trim()) {
        if (columnFilters.activo === 'activos' && !dest.activo) return false;
        if (columnFilters.activo === 'inactivos' && dest.activo) return false;
      }

      return true;
    });
  }, [destinatarios, filtroEstado, searchTerm, columnFilters]);

  const destinatariosOrdenados = useMemo(() => {
    if (!sortField || !sortDirection) return destinatariosFiltrados;
    return [...destinatariosFiltrados].sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];

      if (sortField === 'cliente') {
        aVal = a.cliente?.razon_social || '';
        bVal = b.cliente?.razon_social || '';
      } else if (typeof aVal === 'boolean') {
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
  }, [destinatariosFiltrados, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(destinatariosOrdenados.length / pageSize));

  const paginatedDestinatarios = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return destinatariosOrdenados.slice(start, start + pageSize);
  }, [destinatariosOrdenados, currentPage, pageSize]);

  const handleCrearNuevo = () => {
    setDestinatarioSeleccionado(null);
    setModalOpen(true);
  };

  const handleEditar = (dest: Destinatario) => {
    setDestinatarioSeleccionado(dest);
    setModalOpen(true);
  };

  const handleAlternarEstado = async (dest: Destinatario) => {
    try {
      await clientesApi.alternarEstadoDestinatario(dest.id, dest.activo);
      setFeedback({
        type: 'ok',
        msg: `Destinatario "${dest.razon_social}" ${dest.activo ? 'desactivado' : 'activado'} correctamente.`,
      });
      cargarDestinatarios();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al cambiar estado del destinatario.' });
    }
  };

  const handleEliminar = async (dest: Destinatario) => {
    const confirmacion = window.confirm(
      `¿Está seguro de eliminar el punto de entrega "${dest.razon_social}"?\n\nSi posee remitos o pedidos históricos, se dará de baja lógica automáticamente.`
    );
    if (!confirmacion) return;

    try {
      const res = await clientesApi.eliminarDestinatario(dest.id);
      setFeedback({
        type: 'ok',
        msg: res.softDelete
          ? `El destinatario tiene transacciones históricas: se aplicó baja lógica preventiva.`
          : `Destinatario eliminado definitivamente de la base de datos.`,
      });
      cargarDestinatarios();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar el destinatario.' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner de Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-md flex items-center justify-between text-xs animate-fadeIn ${
            feedback.type === 'ok'
              ? 'bg-[#152a1c] border border-[#2a683b] text-[#78d492]'
              : 'bg-[#370005] border border-[#ffb4ab]/40 text-[#ffb4ab]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Barra de Filtros y Acciones */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#cdc3d4]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por sucursal, dirección, ciudad o cliente..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:outline-none focus:border-[#dab9ff]"
            />
          </div>

          {/* Filtro por Cliente */}
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-[#cdc3d4]" />
            <select
              value={filtroClienteId}
              onChange={(e) => setFiltroClienteId(e.target.value)}
              className="px-2.5 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:outline-none focus:border-[#dab9ff] cursor-pointer"
            >
              <option value="">Todos los Clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social} ({c.codigo})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1 p-0.5 rounded bg-[#131313] border border-[#333333] self-start sm:self-auto">
            {(['todos', 'activos', 'inactivos'] as const).map((estado) => (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                  filtroEstado === estado
                    ? 'bg-[#2a2a2a] text-[#dab9ff]'
                    : 'text-[#cdc3d4] hover:text-[#e5e2e1]'
                }`}
              >
                {estado}
              </button>
            ))}
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

        {/* Botones de Acción */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={cargarDestinatarios}
            disabled={loading}
            title="Recargar catálogo"
            className="p-1.5 rounded border border-[#333333] bg-[#131313] hover:bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCrearNuevo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#dab9ff] hover:bg-[#c99eff] text-[#460283] text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nuevo Destinatario</span>
          </button>
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div className="rounded-md border border-[#333333] bg-[#1c1b1b] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#cdc3d4]">
            <thead className="bg-[#201f1f] text-[#e5e2e1] uppercase text-[10px] tracking-wider border-b border-[#44424a]">
              <tr>
                <SortableHeaderCell
                  label="Cliente Depositante"
                  sortKey="cliente"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Destinatario / Sucursal"
                  sortKey="razon_social"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Dirección & Ciudad"
                  sortKey="direccion_entrega"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Contacto & Horario"
                  sortKey="contacto_recepcion"
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
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
              {showColumnFilters && (
                <tr className="bg-[#181818] border-b border-[#44424a]">
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.cliente}
                      onChange={(v) => handleColumnFilterChange('cliente', v)}
                      placeholder="Filtrar cliente..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.razon_social}
                      onChange={(v) => handleColumnFilterChange('razon_social', v)}
                      placeholder="Filtrar sucursal..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.direccion}
                      onChange={(v) => handleColumnFilterChange('direccion', v)}
                      placeholder="Filtrar dirección..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.contacto}
                      onChange={(v) => handleColumnFilterChange('contacto', v)}
                      placeholder="Filtrar contacto..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterSelect
                      value={columnFilters.activo}
                      onChange={(v) => handleColumnFilterChange('activo', v)}
                      options={[
                        { label: 'Todos', value: '' },
                        { label: 'Activos', value: 'activos' },
                        { label: 'Inactivos', value: 'inactivos' },
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
                  <td colSpan={6} className="px-4 py-8 text-center text-[#cdc3d4]">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#dab9ff]" />
                      <span>Cargando puntos de entrega y destinatarios...</span>
                    </div>
                  </td>
                </tr>
              ) : destinatariosOrdenados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#cdc3d4]">
                    <MapPin className="w-8 h-8 text-[#522b7c] mx-auto mb-2 opacity-60" />
                    <p className="font-semibold text-[#e5e2e1]">No se encontraron destinatarios o sucursales</p>
                    <p className="text-[11px] mt-0.5">
                      {searchTerm || filtroClienteId
                        ? 'Prueba modificando los filtros de búsqueda.'
                        : 'Comienza creando un punto de entrega autorizado para tus pedidos.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedDestinatarios.map((dest) => (
                  <tr key={dest.id} className="hover:bg-[#201f1f] transition-colors">
                    {/* Cliente */}
                    <td className="py-1.5 px-2.5 font-medium text-xs text-[#e5e2e1]">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#dab9ff]" />
                        <span>{dest.cliente?.razon_social || 'Cliente'}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#978d9d]">
                        {dest.cliente?.codigo}
                      </span>
                    </td>

                    {/* Sucursal / Razón Social */}
                    <td className="py-1.5 px-2.5">
                      <div className="font-semibold text-[#e5e2e1]">{dest.razon_social}</div>
                      {dest.codigo_sucursal && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#201330] text-[#dab9ff] border border-[#522b7c]">
                          {dest.codigo_sucursal}
                        </span>
                      )}
                    </td>

                    {/* Dirección */}
                    <td className="py-1.5 px-2.5 text-xs">
                      <div className="text-[#e5e2e1]">{dest.direccion_entrega}</div>
                      {dest.ciudad && <div className="text-[10px] text-[#cdc3d4]">{dest.ciudad}</div>}
                    </td>

                    {/* Contacto & Horario */}
                    <td className="py-1.5 px-2.5 space-y-0.5 text-xs">
                      {dest.contacto_recepcion && (
                        <div className="text-[#e5e2e1] font-medium">{dest.contacto_recepcion}</div>
                      )}
                      {dest.telefono && (
                        <div className="flex items-center gap-1 text-[10px] text-[#cdc3d4]">
                          <Phone className="w-3 h-3 text-[#978d9d]" />
                          <span>{dest.telefono}</span>
                        </div>
                      )}
                      {dest.ventana_horaria_entrega && (
                        <div className="flex items-center gap-1 text-[10px] text-[#dab9ff]">
                          <Clock className="w-3 h-3 text-[#dab9ff]" />
                          <span>{dest.ventana_horaria_entrega}</span>
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold border ${
                          dest.activo
                            ? 'bg-[#152a1c] border-[#2a683b] text-[#78d492]'
                            : 'bg-[#2a1b1b] border-[#5e2b2b] text-[#ffb4ab]'
                        }`}
                      >
                        {dest.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="py-1.5 px-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEditar(dest)}
                          title="Editar destinatario"
                          className="p-1.5 rounded hover:bg-[#2a2a2a] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleAlternarEstado(dest)}
                          title={dest.activo ? 'Desactivar sucursal' : 'Activar sucursal'}
                          className={`p-1.5 rounded hover:bg-[#2a2a2a] transition-colors ${
                            dest.activo
                              ? 'text-[#78d492] hover:text-[#a1e5b3]'
                              : 'text-[#ffb4ab] hover:text-[#ffdad6]'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEliminar(dest)}
                          title="Eliminar destinatario"
                          className="p-1.5 rounded hover:bg-[#370005] text-[#ffb4ab] transition-colors"
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

        {destinatariosOrdenados.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={destinatariosOrdenados.length}
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

      {/* Modal de Alta / Modificación */}
      <DestinatarioModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        destinatario={destinatarioSeleccionado}
        clientes={clientes}
        defaultClienteId={filtroClienteId || (clientes[0]?.id ?? '')}
        onSuccess={() => {
          cargarDestinatarios();
          if (onRefreshParent) onRefreshParent();
        }}
      />
    </div>
  );
};
