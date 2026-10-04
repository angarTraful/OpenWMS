import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Barcode,
  Box,
  Layers,
  Sparkles,
  AlertCircle,
  Power,
  Users,
  Filter,
  FilterX,
} from 'lucide-react';
import type { Articulo } from '../../api/articulosApi';
import { articulosApi } from '../../api/articulosApi';
import type { Cliente } from '../../api/clientesApi';
import { ArticuloModal } from './ArticuloModal';
import { formatM3, formatNumber } from '../../lib/utils';
import {
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface ArticulosAbmProps {
  clientes: Cliente[];
  selectedClienteId?: string;
  onRefreshParent?: () => void;
}

export const ArticulosAbm: React.FC<ArticulosAbmProps> = ({
  clientes,
  selectedClienteId: initialClienteId,
  onRefreshParent,
}) => {
  const [articulos, setArticulos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [clienteFilter, setClienteFilter] = useState<string>(initialClienteId || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [rotacionFilter, setRotacionFilter] = useState<'todas' | 'A' | 'B' | 'C'>('todas');

  // Column Sorting & Filtering
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    sku: '',
    nombre: '',
    cliente: '',
    rotacion: '',
    activo: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState<Articulo | null>(null);

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
      sku: '',
      nombre: '',
      cliente: '',
      rotacion: '',
      activo: '',
    });
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (key: string, val: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const cargarArticulos = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await articulosApi.listarTodos({
        clienteId: clienteFilter || undefined,
        soloActivos: false,
      });
      setArticulos(data || []);
    } catch (err: any) {
      console.error('Error al cargar catálogo de artículos:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar artículos de la base de datos.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarArticulos();
  }, [clienteFilter]);

  const articulosFiltrados = useMemo(() => {
    return articulos.filter((art) => {
      // Estado global
      if (filtroEstado === 'activos' && !art.activo) return false;
      if (filtroEstado === 'inactivos' && art.activo) return false;

      // Rotación global
      if (rotacionFilter !== 'todas' && art.rotacion_abc !== rotacionFilter) return false;

      // Búsqueda global
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const sku = (art.id_producto || art.sku || '').toLowerCase();
        const nom = (art.nombre || '').toLowerCase();
        const bar = (art.ean13 || art.codigo_barras || '').toLowerCase();
        const cli = (art.cliente?.razon_social || '').toLowerCase();
        const col = (art.color || '').toLowerCase();
        const mar = (art.marca_bulto || '').toLowerCase();
        const cat = (art.categoria?.nombre || '').toLowerCase();
        const sub = (art.subcategoria?.nombre || '').toLowerCase();
        if (
          !sku.includes(term) &&
          !nom.includes(term) &&
          !bar.includes(term) &&
          !cli.includes(term) &&
          !col.includes(term) &&
          !mar.includes(term) &&
          !cat.includes(term) &&
          !sub.includes(term)
        ) {
          return false;
        }
      }

      // Column Filters
      if (columnFilters.sku.trim()) {
        const fSku = columnFilters.sku.toLowerCase();
        const sku = (art.sku || '').toLowerCase();
        const bar = (art.codigo_barras || '').toLowerCase();
        if (!sku.includes(fSku) && !bar.includes(fSku)) return false;
      }
      if (columnFilters.nombre.trim()) {
        const fNom = columnFilters.nombre.toLowerCase();
        const nom = (art.nombre || '').toLowerCase();
        const cat = (art.categoria?.nombre || '').toLowerCase();
        if (!nom.includes(fNom) && !cat.includes(fNom)) return false;
      }
      if (columnFilters.cliente.trim()) {
        const fCli = columnFilters.cliente.toLowerCase();
        const cli = (art.cliente?.razon_social || '').toLowerCase();
        if (!cli.includes(fCli)) return false;
      }
      if (columnFilters.rotacion.trim() && art.rotacion_abc !== columnFilters.rotacion) {
        return false;
      }
      if (columnFilters.activo.trim()) {
        if (columnFilters.activo === 'activos' && !art.activo) return false;
        if (columnFilters.activo === 'inactivos' && art.activo) return false;
      }

      return true;
    });
  }, [articulos, searchTerm, filtroEstado, rotacionFilter, columnFilters]);

  const articulosOrdenados = useMemo(() => {
    if (!sortField || !sortDirection) return articulosFiltrados;
    return [...articulosFiltrados].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'cliente') {
        aVal = a.cliente?.razon_social || '';
        bVal = b.cliente?.razon_social || '';
      } else if (sortField === 'categoria') {
        aVal = a.categoria?.nombre || '';
        bVal = b.categoria?.nombre || '';
      } else if (
        sortField === 'volumen_unitario_m3' ||
        sortField === 'peso_unitario_kg' ||
        sortField === 'valor_declarado' ||
        sortField === 'unidades_por_bulto'
      ) {
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
  }, [articulosFiltrados, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(articulosOrdenados.length / pageSize));

  const paginatedArticulos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return articulosOrdenados.slice(start, start + pageSize);
  }, [articulosOrdenados, currentPage, pageSize]);

  const totalActivos = useMemo(() => articulos.filter((a) => a.activo).length, [articulos]);
  const totalRotacionA = useMemo(() => articulos.filter((a) => a.rotacion_abc === 'A').length, [articulos]);

  const handleCrearNuevo = () => {
    setArticuloSeleccionado(null);
    setModalOpen(true);
  };

  const handleEditar = (art: Articulo) => {
    setArticuloSeleccionado(art);
    setModalOpen(true);
  };

  const handleAlternarEstado = async (art: Articulo) => {
    const nuevoEstado = !art.activo;
    const accion = nuevoEstado ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Está seguro de ${accion} el artículo SKU "${art.sku}"?`)) return;

    try {
      await articulosApi.alternarEstadoArticulo(art.id, art.activo);
      setFeedback({
        type: 'ok',
        msg: `Artículo SKU "${art.sku}" ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente.`,
      });
      await cargarArticulos();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al cambiar estado del artículo:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cambiar estado del artículo.' });
    }
  };

  const handleEliminar = async (art: Articulo) => {
    if (
      !window.confirm(
        `¿Eliminar el artículo "${art.sku} - ${art.nombre}"?\n\nSi posee inventario en racks o historial en recepción/picking, se dará de baja lógica de manera segura.`
      )
    ) {
      return;
    }

    try {
      const res = await articulosApi.eliminarArticulo(art.id);
      if (res.softDelete) {
        setFeedback({
          type: 'ok',
          msg: `El artículo SKU "${art.sku}" tiene stock o historial vinculado; fue desactivado lógicamente para proteger el inventario.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          msg: `Artículo SKU "${art.sku}" eliminado definitivamente de la base de datos.`,
        });
      }
      await cargarArticulos();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('Error al eliminar artículo:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar el artículo.' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#cdc3d4] uppercase font-semibold">Total SKUs</span>
            <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-0.5">{articulos.length}</div>
          </div>
          <div className="p-2 rounded bg-[#201330] text-[#dab9ff] border border-[#522b7c]">
            <Package className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#69f0ae] uppercase font-semibold">SKUs Activos</span>
            <div className="text-xl font-bold font-mono text-[#69f0ae] mt-0.5">{totalActivos}</div>
          </div>
          <div className="p-2 rounded bg-[#153426] text-[#69f0ae] border border-[#1b4332]">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#ffd27a] uppercase font-semibold">Alta Rotación (A)</span>
            <div className="text-xl font-bold font-mono text-[#ffd27a] mt-0.5">{totalRotacionA}</div>
          </div>
          <div className="p-2 rounded bg-[#38260a] text-[#ffd27a] border border-[#7a4c10]">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#75d1ff] uppercase font-semibold">Depositantes</span>
            <div className="text-xl font-bold font-mono text-[#75d1ff] mt-0.5">{clientes.length}</div>
          </div>
          <div className="p-2 rounded bg-[#0f2430] text-[#75d1ff] border border-[#1d4d68]">
            <Users className="w-4 h-4" />
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

      {/* Control Bar: Filters + Search + Actions */}
      <div className="p-3 bg-[#1c1b1b] border border-[#333333] rounded-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Cliente selector */}
          <div className="w-48">
            <select
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:border-[#dab9ff] outline-none cursor-pointer"
            >
              <option value="">Todos los Clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social} ({c.codigo})
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-[#978d9d] absolute left-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar SKU, código de barras, nombre..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:border-[#dab9ff] outline-none"
            />
          </div>

          {/* Rotación filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[10px] text-[#cdc3d4] uppercase font-semibold mr-1">Rotación:</span>
            {(['todas', 'A', 'B', 'C'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRotacionFilter(r)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                  rotacionFilter === r
                    ? 'bg-[#dab9ff] text-[#460283]'
                    : 'bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] border border-[#333333]'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Estado filter */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setFiltroEstado(filtroEstado === 'activos' ? 'todos' : 'activos')}
              className={`px-2 py-1 rounded text-[10px] font-medium border ${
                filtroEstado === 'activos'
                  ? 'bg-[#153426] text-[#69f0ae] border-[#1b4332]'
                  : 'bg-[#201f1f] text-[#cdc3d4] border-[#333333]'
              }`}
            >
              Solo Activos
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
            onClick={cargarArticulos}
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
            <span>Nuevo Artículo</span>
          </button>
        </div>
      </div>

      {/* Artículos Table */}
      <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#44424a] bg-[#201f1f] text-[#cdc3d4] font-medium text-[11px] uppercase tracking-wider">
                <SortableHeaderCell
                  label="ID_Producto / EAN13"
                  sortKey="sku"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Nombre / Cat / Color"
                  sortKey="nombre"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Cliente"
                  sortKey="cliente"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Empaque & Pallet"
                  sortKey="unidades_por_bulto"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeaderCell
                  label="Medida M³"
                  sortKey="volumen_unitario_m3"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeaderCell
                  label="PesoGW (Kg)"
                  sortKey="peso_unitario_kg"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHeaderCell
                  label="Rotación"
                  sortKey="rotacion_abc"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHeaderCell
                  label="Valor Declarado"
                  sortKey="valor_declarado"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="right"
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
                      value={columnFilters.sku}
                      onChange={(v) => handleColumnFilterChange('sku', v)}
                      placeholder="Filtrar ID_Prod/EAN..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.nombre}
                      onChange={(v) => handleColumnFilterChange('nombre', v)}
                      placeholder="Filtrar nombre/cat..."
                    />
                  </th>
                  <th className="p-2">
                    <ColumnFilterInput
                      value={columnFilters.cliente}
                      onChange={(v) => handleColumnFilterChange('cliente', v)}
                      placeholder="Filtrar cliente..."
                    />
                  </th>
                  <th className="p-2"></th>
                  <th className="p-2"></th>
                  <th className="p-2"></th>
                  <th className="p-2">
                    <ColumnFilterSelect
                      value={columnFilters.rotacion}
                      onChange={(v) => handleColumnFilterChange('rotacion', v)}
                      options={[
                        { label: 'Todas', value: '' },
                        { label: 'Clase A', value: 'A' },
                        { label: 'Clase B', value: 'B' },
                        { label: 'Clase C', value: 'C' },
                      ]}
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
                  <td colSpan={10} className="py-12 text-center text-[#cdc3d4] text-xs">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin text-[#dab9ff] mb-2" />
                    Cargando catálogo de artículos...
                  </td>
                </tr>
              ) : articulosOrdenados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-[#cdc3d4] text-xs">
                    <Package className="w-8 h-8 mx-auto text-[#978d9d] opacity-40 mb-2" />
                    No se encontraron artículos con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedArticulos.map((art) => (
                  <tr key={art.id} className="hover:bg-[#201f1f]/50 transition-colors">
                    <td className="py-1.5 px-2.5">
                      <div className="font-mono font-bold text-[#dab9ff]">{art.id_producto || art.sku}</div>
                      {(art.ean13 || art.codigo_barras) && (
                        <div className="text-[10px] font-mono text-[#cdc3d4] flex items-center gap-1 mt-0.5">
                          <Barcode className="w-3 h-3 text-[#978d9d]" />
                          <span>{art.ean13 || art.codigo_barras}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-1.5 px-2.5">
                      <div className="font-semibold text-[#e5e2e1]">{art.nombre}</div>
                      <div className="text-[10px] text-[#cdc3d4] flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[#dab9ff]">{art.categoria?.nombre || 'General'}</span>
                        {art.subcategoria?.nombre && (
                          <>
                            <span>/</span>
                            <span className="text-[#cdc3d4]">{art.subcategoria.nombre}</span>
                          </>
                        )}
                        {art.color && (
                          <span className="px-1 rounded bg-[#201330] text-[#dab9ff] border border-[#522b7c] text-[9px]">
                            {art.color}
                          </span>
                        )}
                        {art.marca_bulto && (
                          <span className="px-1 rounded bg-[#131313] text-[#ffd27a] border border-[#333333] text-[9px] font-mono">
                            {art.marca_bulto}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-1.5 px-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#201330] text-[#dab9ff] border border-[#522b7c]">
                        {art.cliente?.razon_social || 'Cliente'}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-center text-[#cdc3d4] font-mono text-[11px]">
                      <div>{art.unidades_por_bulto} {art.unidad_medida} / {art.tipo_empaque || 'bulto'}</div>
                      <div className="text-[10px] text-[#978d9d]">{art.cantidad_por_pallet || art.bultos_por_pallet} / plt</div>
                    </td>

                    <td className="py-1.5 px-2.5 text-right font-mono font-bold text-[#dab9ff]">
                      <div>{Number(art.medida_m3 || art.volumen_unitario_m3).toFixed(4)}</div>
                      {art.factor_estiba !== null && art.factor_estiba !== undefined && Number(art.factor_estiba) > 0 && (
                        <div className="text-[9px] text-[#ffd27a] font-normal">Estiba: {art.factor_estiba}%</div>
                      )}
                    </td>

                    <td className="py-1.5 px-2.5 text-right font-mono text-[#e5e2e1]">
                      {Number(art.peso_gw || art.peso_unitario_kg).toFixed(3)}
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          art.rotacion_abc === 'A'
                            ? 'bg-[#38260a] text-[#ffd27a] border border-[#7a4c10]'
                            : art.rotacion_abc === 'B'
                            ? 'bg-[#201330] text-[#dab9ff] border border-[#522b7c]'
                            : 'bg-[#1b2b45] text-[#75d1ff] border border-[#1d4d68]'
                        }`}
                      >
                        Clase {art.rotacion_abc}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-right font-mono text-[#cdc3d4]">
                      ${Number(art.valor_declarado).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          art.activo
                            ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332]'
                            : 'bg-[#381015] text-[#ffb4ab] border border-[#690005]'
                        }`}
                      >
                        {art.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditar(art)}
                          title="Modificar artículo"
                          className="p-1 rounded text-[#cdc3d4] hover:text-[#dab9ff] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleAlternarEstado(art)}
                          title={art.activo ? 'Desactivar artículo' : 'Activar artículo'}
                          className={`p-1 rounded transition-colors ${
                            art.activo
                              ? 'text-[#69f0ae] hover:text-[#ffd27a] hover:bg-[#2a2a2a]'
                              : 'text-[#978d9d] hover:text-[#69f0ae] hover:bg-[#2a2a2a]'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleEliminar(art)}
                          title="Eliminar o dar de baja"
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

        {articulosOrdenados.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={articulosOrdenados.length}
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
      <ArticuloModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        articulo={articuloSeleccionado}
        clientes={clientes}
        defaultClienteId={clienteFilter}
        onSuccess={() => {
          cargarArticulos();
          if (onRefreshParent) onRefreshParent();
          setFeedback({
            type: 'ok',
            msg: articuloSeleccionado
              ? 'Especificaciones del artículo actualizadas exitosamente.'
              : 'Nuevo artículo registrado en el catálogo del WMS.',
          });
        }}
      />
    </div>
  );
};
