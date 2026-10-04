import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Building2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Clock,
  Filter,
  FilterX,
} from 'lucide-react';
import { lotesApi, LoteConCliente, LoteCliente } from '../../api/lotesApi';
import type { Cliente } from '../../api/clientesApi';
import { LoteModal } from './LoteModal';
import { ModalPortal } from '@/components/ui/ModalPortal';
import {
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface LotesAbmProps {
  clientes: Cliente[];
  selectedClienteId?: string;
  onRefreshParent?: () => void;
}

export const LotesAbm: React.FC<LotesAbmProps> = ({
  clientes,
  selectedClienteId,
  onRefreshParent,
}) => {
  const [lotes, setLotes] = useState<LoteConCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroClienteId, setFiltroClienteId] = useState<string>(selectedClienteId || '');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'habilitados' | 'bloqueados'>('todos');

  // Column Sorting & Filtering
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    cliente: '',
    numero_lote: '',
    fecha_vencimiento: '',
    estado: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal Lote
  const [modalOpen, setModalOpen] = useState(false);
  const [loteSeleccionado, setLoteSeleccionado] = useState<LoteCliente | null>(null);

  // Modal Motivo Bloqueo Rápido
  const [bloqueoModalLote, setBloqueoModalLote] = useState<LoteCliente | null>(null);
  const [motivoBloqueo, setMotivoBloqueo] = useState('');

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
      numero_lote: '',
      fecha_vencimiento: '',
      estado: '',
    });
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const cargarLotes = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await lotesApi.listarLotes({
        clienteId: filtroClienteId || undefined,
        soloHabilitados: false,
      });
      setLotes(data || []);
    } catch (err: any) {
      console.error('Error cargando lotes:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar los lotes de clientes.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarLotes();
  }, [filtroClienteId]);

  const lotesFiltrados = useMemo(() => {
    return lotes.filter((l) => {
      // Estado global
      if (filtroEstado === 'habilitados' && l.bloqueado) return false;
      if (filtroEstado === 'bloqueados' && !l.bloqueado) return false;

      // Búsqueda global
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const num = (l.numero_lote || '').toLowerCase();
        const motivo = (l.motivo_bloqueo || '').toLowerCase();
        const cli = (l.cliente?.razon_social || '').toLowerCase();
        if (!num.includes(term) && !motivo.includes(term) && !cli.includes(term)) {
          return false;
        }
      }

      // Column filters
      if (columnFilters.cliente.trim()) {
        const fCli = columnFilters.cliente.toLowerCase();
        const cli = (l.cliente?.razon_social || '').toLowerCase();
        const cod = (l.cliente?.codigo || '').toLowerCase();
        if (!cli.includes(fCli) && !cod.includes(fCli)) return false;
      }
      if (columnFilters.numero_lote.trim()) {
        const fNum = columnFilters.numero_lote.toLowerCase();
        if (!(l.numero_lote || '').toLowerCase().includes(fNum)) return false;
      }
      if (columnFilters.fecha_vencimiento.trim()) {
        const fFecha = columnFilters.fecha_vencimiento.toLowerCase();
        const vto = (l.fecha_vencimiento || '').toLowerCase();
        const fab = (l.fecha_fabricacion || '').toLowerCase();
        if (!vto.includes(fFecha) && !fab.includes(fFecha)) return false;
      }
      if (columnFilters.estado.trim()) {
        if (columnFilters.estado === 'habilitados' && l.bloqueado) return false;
        if (columnFilters.estado === 'bloqueados' && !l.bloqueado) return false;
      }

      return true;
    });
  }, [lotes, filtroEstado, searchTerm, columnFilters]);

  const lotesOrdenados = useMemo(() => {
    if (!sortField || !sortDirection) return lotesFiltrados;
    return [...lotesFiltrados].sort((a, b) => {
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
  }, [lotesFiltrados, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(lotesOrdenados.length / pageSize));

  const paginatedLotes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return lotesOrdenados.slice(start, start + pageSize);
  }, [lotesOrdenados, currentPage, pageSize]);

  const handleCrearNuevo = () => {
    setLoteSeleccionado(null);
    setModalOpen(true);
  };

  const handleEditar = (lote: LoteCliente) => {
    setLoteSeleccionado(lote);
    setModalOpen(true);
  };

  const handleAbrirBloqueo = (lote: LoteCliente) => {
    setBloqueoModalLote(lote);
    setMotivoBloqueo('');
  };

  const handleConfirmarBloqueo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bloqueoModalLote || !motivoBloqueo.trim()) return;

    try {
      await lotesApi.bloquearLote(bloqueoModalLote.id, motivoBloqueo);
      setFeedback({
        type: 'ok',
        msg: `Lote "${bloqueoModalLote.numero_lote}" puesto en cuarentena/bloqueado.`,
      });
      setBloqueoModalLote(null);
      setMotivoBloqueo('');
      cargarLotes();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al bloquear lote.' });
    }
  };

  const handleDesbloquear = async (lote: LoteCliente) => {
    try {
      await lotesApi.desbloquearLote(lote.id);
      setFeedback({
        type: 'ok',
        msg: `Lote "${lote.numero_lote}" desbloqueado y habilitado para picking.`,
      });
      cargarLotes();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al desbloquear lote.' });
    }
  };

  const handleEliminar = async (lote: LoteCliente) => {
    const confirmacion = window.confirm(
      `¿Está seguro de eliminar el lote "${lote.numero_lote}"?\n\nSi posee movimientos o stock en kardex, se aplicará bloqueo preventivo.`
    );
    if (!confirmacion) return;

    try {
      const res = await lotesApi.eliminarLote(lote.id);
      setFeedback({
        type: 'ok',
        msg: res.softDelete
          ? `El lote posee movimientos históricos: se bloqueó preventivamente.`
          : `Lote eliminado definitivamente.`,
      });
      cargarLotes();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar lote.' });
    }
  };

  // Cálculo de vencimiento FEFO
  const calcularEstadoVencimiento = (fechaVtoStr: string | null) => {
    if (!fechaVtoStr) return { label: 'Sin vencimiento', color: 'text-[#978d9d]', badgeBg: 'bg-[#1c1b1b]' };
    const hoy = new Date();
    const vto = new Date(fechaVtoStr);
    const diffDias = Math.ceil((vto.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDias < 0) {
      return { label: `Vencido (${Math.abs(diffDias)}d)`, color: 'text-[#ffb4ab]', badgeBg: 'bg-[#370005] border-[#ffb4ab]/50' };
    }
    if (diffDias <= 30) {
      return { label: `Vence en ${diffDias}d`, color: 'text-[#ffb77c]', badgeBg: 'bg-[#351c07] border-[#ffb77c]/50' };
    }
    return { label: `Vigente (${diffDias}d)`, color: 'text-[#78d492]', badgeBg: 'bg-[#152a1c] border-[#2a683b]' };
  };

  return (
    <div className="space-y-4">
      {/* Feedback Banner */}
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

      {/* Barra de Filtros */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#cdc3d4]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por lote, cliente o motivo..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:outline-none focus:border-[#dab9ff]"
            />
          </div>

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

          <div className="flex items-center gap-1 p-0.5 rounded bg-[#131313] border border-[#333333] self-start sm:self-auto">
            {(['todos', 'habilitados', 'bloqueados'] as const).map((estado) => (
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

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={cargarLotes}
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
            <span>Nuevo Lote</span>
          </button>
        </div>
      </div>

      {/* Tabla de Lotes */}
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
                  label="Número de Lote"
                  sortKey="numero_lote"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Fabricación & Vencimiento"
                  sortKey="fecha_vencimiento"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 font-semibold">Control FEFO</th>
                <SortableHeaderCell
                  label="Estado Operativo"
                  sortKey="bloqueado"
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
                      value={columnFilters.numero_lote}
                      onChange={(v) => handleColumnFilterChange('numero_lote', v)}
                      placeholder="Filtrar lote..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.fecha_vencimiento}
                      onChange={(v) => handleColumnFilterChange('fecha_vencimiento', v)}
                      placeholder="YYYY-MM-DD..."
                    />
                  </th>
                  <th className="p-2"></th>
                  <th className="p-2">
                    <ColumnFilterSelect
                      value={columnFilters.estado}
                      onChange={(v) => handleColumnFilterChange('estado', v)}
                      options={[
                        { label: 'Todos', value: '' },
                        { label: 'Habilitados', value: 'habilitados' },
                        { label: 'Bloqueados', value: 'bloqueados' },
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
                      <span>Cargando lotes registrados...</span>
                    </div>
                  </td>
                </tr>
              ) : lotesOrdenados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#cdc3d4]">
                    <Calendar className="w-8 h-8 text-[#522b7c] mx-auto mb-2 opacity-60" />
                    <p className="font-semibold text-[#e5e2e1]">No se encontraron lotes registrados</p>
                    <p className="text-[11px] mt-0.5">
                      {searchTerm || filtroClienteId
                        ? 'Prueba ajustando los filtros de búsqueda.'
                        : 'Registra los lotes de producción para controlar FEFO y trazabilidad.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedLotes.map((l) => {
                  const fefo = calcularEstadoVencimiento(l.fecha_vencimiento);
                  return (
                    <tr key={l.id} className="hover:bg-[#201f1f] transition-colors">
                      {/* Cliente */}
                      <td className="py-1.5 px-2.5 font-medium text-xs text-[#e5e2e1]">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-[#dab9ff]" />
                          <span>{l.cliente?.razon_social || 'Cliente'}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#978d9d]">
                          {l.cliente?.codigo}
                        </span>
                      </td>

                      {/* Lote */}
                      <td className="py-1.5 px-2.5">
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-[#131313] text-[#dab9ff] border border-[#333333]">
                          {l.numero_lote}
                        </span>
                      </td>

                      {/* Fechas */}
                      <td className="py-1.5 px-2.5 space-y-0.5">
                        <div className="text-[10px]">
                          <span className="text-[#978d9d]">Fab: </span>
                          <span className="text-[#e5e2e1]">
                            {l.fecha_fabricacion ? l.fecha_fabricacion.split('T')[0] : 'No declarada'}
                          </span>
                        </div>
                        <div className="text-[10px]">
                          <span className="text-[#978d9d]">Vto: </span>
                          <span className="text-[#e5e2e1] font-semibold">
                            {l.fecha_vencimiento ? l.fecha_vencimiento.split('T')[0] : 'Sin vencimiento'}
                          </span>
                        </div>
                      </td>

                      {/* Control FEFO */}
                      <td className="py-1.5 px-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold border ${fefo.badgeBg} ${fefo.color}`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{fefo.label}</span>
                        </span>
                      </td>

                      {/* Estado Operativo */}
                      <td className="py-1.5 px-2.5 text-center">
                        {l.bloqueado ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#370005] border border-[#ffb4ab]/50 text-[#ffb4ab]">
                              <ShieldAlert className="w-3 h-3" />
                              <span>BLOQUEADO</span>
                            </span>
                            {l.motivo_bloqueo && (
                              <p className="text-[9px] text-[#ffb4ab] max-w-[160px] truncate mx-auto" title={l.motivo_bloqueo}>
                                {l.motivo_bloqueo}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#152a1c] border border-[#2a683b] text-[#78d492]">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Habilitado</span>
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-1.5 px-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEditar(l)}
                            title="Editar fechas o lote"
                            className="p-1.5 rounded hover:bg-[#2a2a2a] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {l.bloqueado ? (
                            <button
                              onClick={() => handleDesbloquear(l)}
                              title="Desbloquear lote para picking"
                              className="p-1.5 rounded hover:bg-[#152a1c] text-[#78d492] transition-colors"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAbrirBloqueo(l)}
                              title="Bloquear lote / Cuarentena"
                              className="p-1.5 rounded hover:bg-[#370005] text-[#ffb4ab] transition-colors"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleEliminar(l)}
                            title="Eliminar lote"
                            className="p-1.5 rounded hover:bg-[#370005] text-[#ffb4ab] transition-colors"
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

        {lotesOrdenados.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={lotesOrdenados.length}
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

      {/* Modal de Bloqueo Rápido */}
      {bloqueoModalLote && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-md bg-white dark:bg-[#1c1b1b] border border-rose-200 dark:border-[#ffb4ab]/40 shadow-2xl p-5 text-slate-800 dark:text-[#e5e2e1]">
            <div className="flex items-center gap-2 text-rose-700 dark:text-[#ffb4ab] font-bold text-xs pb-3 border-b border-slate-200 dark:border-[#333333] mb-3">
              <ShieldAlert className="w-4 h-4" />
              <span>Bloquear Lote {bloqueoModalLote.numero_lote}</span>
            </div>

            <form onSubmit={handleConfirmarBloqueo} className="space-y-3 text-xs">
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                El stock de este lote quedará inhabilitado para recolección en pedidos y despachos.
              </p>

              <div>
                <label className="block text-[10px] font-semibold text-rose-700 dark:text-[#ffb4ab] uppercase mb-1">
                  Motivo de la Cuarentena / Bloqueo <span className="text-rose-600 dark:text-[#ffb4ab]">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={motivoBloqueo}
                  onChange={(e) => setMotivoBloqueo(e.target.value)}
                  placeholder="Detallar causa: ANMAT, rotura de empaque, inspección de calidad..."
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-rose-300 dark:border-[#ffb4ab]/40 text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-rose-500 dark:focus:border-[#ffb4ab]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBloqueoModalLote(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-[#333333] text-xs text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-100 dark:hover:bg-[#201f1f] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white dark:bg-[#93000a] dark:hover:bg-[#b3261e] dark:text-[#ffdad6] font-bold text-xs transition-colors"
                >
                  Confirmar Bloqueo
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
    )}

      {/* Modal Lote Crear / Editar */}
      <LoteModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        lote={loteSeleccionado}
        clientes={clientes}
        defaultClienteId={filtroClienteId || (clientes[0]?.id ?? '')}
        onSuccess={() => {
          cargarLotes();
          if (onRefreshParent) onRefreshParent();
        }}
      />
    </div>
  );
};
