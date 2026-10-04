import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Plus,
  Zap,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Lock,
  Unlock,
  AlertCircle,
  Warehouse,
  Layers,
  Box,
  Filter,
  FilterX,
} from 'lucide-react';
import { almacenApi, type Almacen, type Ubicacion } from '../../api/almacenApi';
import { UbicacionModal } from './UbicacionModal';
import { GeneradorUbicacionesModal } from './GeneradorUbicacionesModal';
import { formatM3 } from '../../lib/utils';
import {
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface UbicacionesAbmProps {
  almacenes: Almacen[];
  selectedAlmacenId?: string;
  onRefreshParent?: () => void;
}

export const UbicacionesAbm: React.FC<UbicacionesAbmProps> = ({
  almacenes,
  selectedAlmacenId: initialAlmacenId,
  onRefreshParent,
}) => {
  const [almacenId, setAlmacenId] = useState<string>(
    initialAlmacenId || (almacenes[0]?.id ?? '')
  );
  const [zonas, setZonas] = useState<any[]>([]);
  const [zonaFilter, setZonaFilter] = useState<string>('');

  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'activa' | 'bloqueada'>('todas');

  // Column Sorting & Filtering
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    codigo_etiqueta: '',
    zona: '',
    pasillo: '',
    estado: '',
    mezcla: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [generadorModalOpen, setGeneradorModalOpen] = useState(false);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState<Ubicacion | null>(null);

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
      codigo_etiqueta: '',
      zona: '',
      pasillo: '',
      estado: '',
      mezcla: '',
    });
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  // Cargar zonas del almacén seleccionado
  useEffect(() => {
    if (almacenId) {
      almacenApi
        .listarZonas(almacenId)
        .then((z) => setZonas(z || []))
        .catch((err) => console.error('Error cargando zonas:', err));
    }
  }, [almacenId]);

  const cargarUbicaciones = async () => {
    if (!almacenId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const data = await almacenApi.listarUbicacionesPorAlmacen(almacenId);
      setUbicaciones(data || []);
    } catch (err: any) {
      console.error('Error al cargar ubicaciones:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar ubicaciones de la base de datos.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarUbicaciones();
  }, [almacenId]);

  const ubicacionesFiltradas = useMemo(() => {
    return ubicaciones.filter((u) => {
      // Filtro zona
      if (zonaFilter && u.zona_id !== zonaFilter) return false;

      // Filtro estado
      if (filtroEstado !== 'todas' && u.estado !== filtroEstado) return false;

      // Búsqueda
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const cod = (u.codigo_etiqueta || '').toLowerCase();
        const pas = (u.pasillo || '').toLowerCase();
        const est = (u.estante || '').toLowerCase();
        const niv = (u.nivel || '').toLowerCase();
        const zon = (u.zona?.nombre || '').toLowerCase();
        if (!cod.includes(term) && !pas.includes(term) && !est.includes(term) && !niv.includes(term) && !zon.includes(term)) {
          return false;
        }
      }

      // Column filters
      if (columnFilters.codigo_etiqueta.trim()) {
        const fCod = columnFilters.codigo_etiqueta.toLowerCase();
        if (!(u.codigo_etiqueta || '').toLowerCase().includes(fCod)) return false;
      }
      if (columnFilters.zona.trim()) {
        const fZona = columnFilters.zona.toLowerCase();
        const zon = (u.zona?.nombre || '').toLowerCase();
        if (!zon.includes(fZona)) return false;
      }
      if (columnFilters.pasillo.trim()) {
        const fP = columnFilters.pasillo.toLowerCase();
        const coord = `P:${u.pasillo || ''} E:${u.estante || ''} N:${u.nivel || ''} Pos:${u.posicion || ''}`.toLowerCase();
        if (!coord.includes(fP)) return false;
      }
      if (columnFilters.estado.trim()) {
        if (u.estado !== columnFilters.estado) return false;
      }
      if (columnFilters.mezcla.trim()) {
        const isMulti = columnFilters.mezcla === 'multi';
        if (Boolean(u.permite_mezcla_clientes) !== isMulti) return false;
      }

      return true;
    });
  }, [ubicaciones, zonaFilter, filtroEstado, searchTerm, columnFilters]);

  const ubicacionesOrdenadas = useMemo(() => {
    if (!sortField || !sortDirection) return ubicacionesFiltradas;
    return [...ubicacionesFiltradas].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'zona') {
        aVal = a.zona?.nombre || '';
        bVal = b.zona?.nombre || '';
      } else if (sortField === 'capacidad_peso_kg' || sortField === 'capacidad_volumen_m3') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
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
  }, [ubicacionesFiltradas, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(ubicacionesOrdenadas.length / pageSize));

  const paginatedUbicaciones = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return ubicacionesOrdenadas.slice(start, start + pageSize);
  }, [ubicacionesOrdenadas, currentPage, pageSize]);

  const totalActivas = useMemo(() => ubicaciones.filter((u) => u.estado === 'activa').length, [ubicaciones]);
  const totalBloqueadas = useMemo(() => ubicaciones.filter((u) => u.estado === 'bloqueada').length, [ubicaciones]);
  const capacidadM3Total = useMemo(() => {
    return ubicaciones.reduce((acc, u) => acc + (Number(u.capacidad_volumen_m3) || 0), 0);
  }, [ubicaciones]);

  const handleCrearNuevo = () => {
    setUbicacionSeleccionada(null);
    setModalOpen(true);
  };

  const handleEditar = (u: Ubicacion) => {
    setUbicacionSeleccionada(u);
    setModalOpen(true);
  };

  const handleAlternarBloqueo = async (u: Ubicacion) => {
    const nuevoEstado = u.estado === 'activa' ? 'bloqueada' : 'activa';
    const accion = nuevoEstado === 'bloqueada' ? 'bloquear' : 'desbloquear/activar';
    if (!window.confirm(`¿Desea ${accion} la posición "${u.codigo_etiqueta}"?`)) return;

    try {
      await almacenApi.alternarEstadoUbicacion(u.id, u.estado);
      setFeedback({
        type: 'ok',
        msg: `Posición "${u.codigo_etiqueta}" ahora en estado ${nuevoEstado.toUpperCase()}.`,
      });
      await cargarUbicaciones();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al cambiar estado de ubicación:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cambiar estado.' });
    }
  };

  const handleEliminar = async (u: Ubicacion) => {
    if (
      !window.confirm(
        `¿Eliminar la ubicación "${u.codigo_etiqueta}"?\n\nSi posee inventario activo o movimientos históricos en kardex, se cambiará a estado BLOQUEADA por seguridad.`
      )
    ) {
      return;
    }

    try {
      const res = await almacenApi.eliminarUbicacion(u.id);
      if (res.softDelete) {
        setFeedback({
          type: 'ok',
          msg: `La posición "${u.codigo_etiqueta}" posee registros de stock; fue cambiada a BLOQUEADA de forma segura.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          msg: `Posición "${u.codigo_etiqueta}" eliminada definitivamente.`,
        });
      }
      await cargarUbicaciones();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al eliminar ubicación:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar ubicación.' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#cdc3d4] uppercase font-semibold">Total Posiciones</span>
            <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-0.5">{ubicaciones.length}</div>
          </div>
          <div className="p-2 rounded bg-[#201330] text-[#dab9ff] border border-[#522b7c]">
            <MapPin className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#69f0ae] uppercase font-semibold">Posiciones Activas</span>
            <div className="text-xl font-bold font-mono text-[#69f0ae] mt-0.5">{totalActivas}</div>
          </div>
          <div className="p-2 rounded bg-[#153426] text-[#69f0ae] border border-[#1b4332]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#ffb4ab] uppercase font-semibold">Bloqueadas</span>
            <div className="text-xl font-bold font-mono text-[#ffb4ab] mt-0.5">{totalBloqueadas}</div>
          </div>
          <div className="p-2 rounded bg-[#381015] text-[#ffb4ab] border border-[#690005]">
            <Lock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#dab9ff] uppercase font-semibold">Capacidad Instalada</span>
            <div className="text-xl font-bold font-mono text-[#dab9ff] mt-0.5">{formatM3(capacidadM3Total)}</div>
          </div>
          <div className="p-2 rounded bg-[#201330] text-[#dab9ff] border border-[#522b7c]">
            <Box className="w-4 h-4" />
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

      {/* Control Bar: Warehouse/Zone + Search + Actions */}
      <div className="p-3 bg-[#1c1b1b] border border-[#333333] rounded-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Almacén selector */}
          <div className="w-48">
            <select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] font-medium focus:border-[#dab9ff] outline-none cursor-pointer"
            >
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Zona selector */}
          <div className="w-44">
            <select
              value={zonaFilter}
              onChange={(e) => setZonaFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:border-[#dab9ff] outline-none cursor-pointer"
            >
              <option value="">Todas las Zonas</option>
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-4 h-4 text-[#978d9d] absolute left-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar etiqueta, pasillo, estante..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:border-[#dab9ff] outline-none"
            />
          </div>

          {/* Estado filter */}
          <div className="flex items-center gap-1 text-xs">
            {(['todas', 'activa', 'bloqueada'] as const).map((est) => (
              <button
                key={est}
                onClick={() => setFiltroEstado(est)}
                className={`px-2.5 py-1 rounded text-[10px] font-medium uppercase font-mono transition-colors ${
                  filtroEstado === est
                    ? est === 'activa'
                      ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332] font-bold'
                      : est === 'bloqueada'
                      ? 'bg-[#381015] text-[#ffb4ab] border border-[#690005] font-bold'
                      : 'bg-[#dab9ff] text-[#460283] font-bold'
                    : 'bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] border border-[#333333]'
                }`}
              >
                {est}
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

        <div className="flex items-center gap-2">
          <button
            onClick={cargarUbicaciones}
            title="Recargar lista"
            className="p-1.5 rounded border border-[#333333] bg-[#201f1f] hover:bg-[#2a2a2a] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#dab9ff]' : ''}`} />
          </button>

          <button
            onClick={() => setGeneradorModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-[#7a4c10] bg-[#38260a] hover:bg-[#52340a] text-[#ffd27a] transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Generador Masivo</span>
          </button>

          <button
            onClick={handleCrearNuevo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Posición</span>
          </button>
        </div>
      </div>

      {/* Ubicaciones Table */}
      <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#44424a] bg-[#201f1f] text-[#cdc3d4] font-medium text-[11px] uppercase tracking-wider">
                <SortableHeaderCell
                  label="Código Etiqueta"
                  sortKey="codigo_etiqueta"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Zona"
                  sortKey="zona"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Coordenadas (Pas-Est-Niv-Pos)"
                  sortKey="pasillo"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeaderCell
                  label="Peso Máx (Kg)"
                  sortKey="capacidad_peso_kg"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeaderCell
                  label="Volumen Máx (M³)"
                  sortKey="capacidad_volumen_m3"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeaderCell
                  label="Mezcla Clientes"
                  sortKey="permite_mezcla_clientes"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeaderCell
                  label="Estado"
                  sortKey="estado"
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
                      value={columnFilters.codigo_etiqueta}
                      onChange={(v) => handleColumnFilterChange('codigo_etiqueta', v)}
                      placeholder="Filtrar código..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.zona}
                      onChange={(v) => handleColumnFilterChange('zona', v)}
                      placeholder="Filtrar zona..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.pasillo}
                      onChange={(v) => handleColumnFilterChange('pasillo', v)}
                      placeholder="P:1 E:2 N:3..."
                    />
                  </th>
                  <th className="p-2"></th>
                  <th className="p-2"></th>
                  <th className="p-2">
                    <ColumnFilterSelect
                      value={columnFilters.mezcla}
                      onChange={(v) => handleColumnFilterChange('mezcla', v)}
                      options={[
                        { label: 'Todas', value: '' },
                        { label: 'Multicliente', value: 'multi' },
                        { label: 'Dedicada', value: 'dedicada' },
                      ]}
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterSelect
                      value={columnFilters.estado}
                      onChange={(v) => handleColumnFilterChange('estado', v)}
                      options={[
                        { label: 'Todos', value: '' },
                        { label: 'Activa', value: 'activa' },
                        { label: 'Bloqueada', value: 'bloqueada' },
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
                  <td colSpan={8} className="py-12 text-center text-[#cdc3d4] text-xs">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin text-[#dab9ff] mb-2" />
                    Cargando posiciones del almacén...
                  </td>
                </tr>
              ) : ubicacionesOrdenadas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#cdc3d4] text-xs">
                    <MapPin className="w-8 h-8 mx-auto text-[#978d9d] opacity-40 mb-2" />
                    No se encontraron ubicaciones con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedUbicaciones.map((u) => (
                  <tr key={u.id} className="hover:bg-[#201f1f]/50 transition-colors">
                    <td className="py-1.5 px-2.5">
                      <div className="font-mono font-bold text-[#dab9ff] text-xs flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-[#978d9d]" />
                        <span>{u.codigo_etiqueta}</span>
                      </div>
                    </td>

                    <td className="py-1.5 px-2.5">
                      <div className="font-semibold text-xs text-[#e5e2e1]">{u.zona?.nombre || 'General'}</div>
                      <div className="text-[10px] text-[#cdc3d4] font-mono">{u.zona?.codigo}</div>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <div className="inline-flex items-center gap-1 font-mono text-[10px] bg-[#131313] px-1.5 py-0.5 rounded border border-[#333333]">
                        <span className="text-[#dab9ff]" title="Pasillo">P:{u.pasillo || '-'}</span>
                        <span className="text-[#978d9d]">&bull;</span>
                        <span className="text-[#e5e2e1]" title="Estante">E:{u.estante || '-'}</span>
                        <span className="text-[#978d9d]">&bull;</span>
                        <span className="text-[#ffd27a]" title="Nivel">N:{u.nivel || '-'}</span>
                        <span className="text-[#978d9d]">&bull;</span>
                        <span className="text-[#75d1ff]" title="Posición">Pos:{u.posicion || '-'}</span>
                      </div>
                    </td>

                    <td className="py-1.5 px-2.5 text-right font-mono text-[11px] text-[#cdc3d4]">
                      {u.capacidad_peso_kg ? `${u.capacidad_peso_kg} kg` : '-'}
                    </td>

                    <td className="py-1.5 px-2.5 text-right font-mono font-bold text-xs text-[#dab9ff]">
                      {u.capacidad_volumen_m3 ? `${Number(u.capacidad_volumen_m3).toFixed(2)} m³` : '-'}
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-mono ${
                          u.permite_mezcla_clientes
                            ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332]'
                            : 'bg-[#201f1f] text-[#cdc3d4] border border-[#333333]'
                        }`}
                      >
                        {u.permite_mezcla_clientes ? 'MULTICLIENTE' : 'DEDICADA'}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold uppercase ${
                          u.estado === 'activa'
                            ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332]'
                            : 'bg-[#381015] text-[#ffb4ab] border border-[#690005]'
                        }`}
                      >
                        {u.estado}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditar(u)}
                          title="Modificar ubicación"
                          className="p-1 rounded text-[#cdc3d4] hover:text-[#dab9ff] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleAlternarBloqueo(u)}
                          title={u.estado === 'activa' ? 'Bloquear posición' : 'Activar posición'}
                          className={`p-1 rounded transition-colors ${
                            u.estado === 'activa'
                              ? 'text-[#69f0ae] hover:text-[#ffd27a] hover:bg-[#2a2a2a]'
                              : 'text-[#ffb4ab] hover:text-[#69f0ae] hover:bg-[#2a2a2a]'
                          }`}
                        >
                          {u.estado === 'activa' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => handleEliminar(u)}
                          title="Eliminar o bloquear"
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

        {ubicacionesOrdenadas.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={ubicacionesOrdenadas.length}
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

      {/* Modal Individual Alta / Edición */}
      <UbicacionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        ubicacion={ubicacionSeleccionada}
        almacenes={almacenes}
        defaultAlmacenId={almacenId}
        onSuccess={() => {
          cargarUbicaciones();
          if (onRefreshParent) onRefreshParent();
          setFeedback({
            type: 'ok',
            msg: ubicacionSeleccionada
              ? 'Parámetros de la ubicación actualizados exitosamente.'
              : 'Nueva ubicación registrada en el mapa físico del almacén.',
          });
        }}
      />

      {/* Modal Generador Masivo */}
      <GeneradorUbicacionesModal
        isOpen={generadorModalOpen}
        onClose={() => setGeneradorModalOpen(false)}
        almacenes={almacenes}
        defaultAlmacenId={almacenId}
        onSuccess={() => {
          cargarUbicaciones();
          if (onRefreshParent) onRefreshParent();
          setFeedback({
            type: 'ok',
            msg: 'Lote de posiciones generado e insertado exitosamente en el almacén.',
          });
        }}
      />
    </div>
  );
};
