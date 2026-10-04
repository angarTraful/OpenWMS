import React, { useState, useEffect, useMemo } from 'react';
import {
  Tag,
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Power,
  FolderPlus,
  Filter,
  FilterX,
} from 'lucide-react';
import { articulosApi, CategoriaConSubcategorias, Categoria, Subcategoria } from '../../api/articulosApi';
import { CategoriaModal } from './CategoriaModal';
import { ModalPortal } from '@/components/ui/ModalPortal';
import {
  TableContainer,
  SortableHeaderCell,
  ColumnFilterInput,
  ColumnFilterSelect,
  TablePagination,
  type SortDirection,
} from '../ui/AnimatedTable';

interface CategoriasAbmProps {
  onRefreshParent?: () => void;
}

export const CategoriasAbm: React.FC<CategoriasAbmProps> = ({ onRefreshParent }) => {
  const [categorias, setCategorias] = useState<CategoriaConSubcategorias[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activas' | 'inactivas'>('todos');

  // Sorting & Column Filtering
  const [sortField, setSortField] = useState<string | null>('codigo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    activo: '',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal Categoría
  const [modalOpen, setModalOpen] = useState(false);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<Categoria | null>(null);

  // Subcategoría rápida
  const [subcatModalCatId, setSubcatModalCatId] = useState<string | null>(null);
  const [subcatNombre, setSubcatNombre] = useState('');
  const [subcatCodigo, setSubcatCodigo] = useState('');

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const cargarCategorias = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await articulosApi.listarCategorias(false);
      setCategorias(data || []);
    } catch (err: any) {
      console.error('Error cargando categorías:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar las categorías de artículos.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCategorias();
  }, []);

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
      nombre: '',
      descripcion: '',
      activo: '',
    });
    setCurrentPage(1);
  };

  const categoriasFiltradas = useMemo(() => {
    return categorias.filter((cat) => {
      if (filtroEstado === 'activas' && !cat.activo) return false;
      if (filtroEstado === 'inactivas' && cat.activo) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const cod = (cat.codigo || '').toLowerCase();
        const nom = (cat.nombre || '').toLowerCase();
        const desc = (cat.descripcion || '').toLowerCase();
        const hasSubcatMatch = (cat.subcategorias || []).some(
          (s: Subcategoria) => s.nombre.toLowerCase().includes(term) || s.codigo.toLowerCase().includes(term)
        );
        if (!cod.includes(term) && !nom.includes(term) && !desc.includes(term) && !hasSubcatMatch) {
          return false;
        }
      }

      if (columnFilters.codigo && !(cat.codigo || '').toLowerCase().includes(columnFilters.codigo.toLowerCase())) {
        return false;
      }
      if (columnFilters.nombre && !(cat.nombre || '').toLowerCase().includes(columnFilters.nombre.toLowerCase())) {
        return false;
      }
      if (columnFilters.descripcion && !(cat.descripcion || '').toLowerCase().includes(columnFilters.descripcion.toLowerCase())) {
        return false;
      }
      if (columnFilters.activo === 'activas' && !cat.activo) return false;
      if (columnFilters.activo === 'inactivas' && cat.activo) return false;

      return true;
    });
  }, [categorias, filtroEstado, searchTerm, columnFilters]);

  const categoriasOrdenadas = useMemo(() => {
    if (!sortField || !sortDirection) return categoriasFiltradas;
    return [...categoriasFiltradas].sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [categoriasFiltradas, sortField, sortDirection]);

  const totalPages = Math.ceil(categoriasOrdenadas.length / pageSize) || 1;
  const paginatedCategorias = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return categoriasOrdenadas.slice(start, start + pageSize);
  }, [categoriasOrdenadas, currentPage, pageSize]);

  const handleCrearCategoria = () => {
    setCategoriaSeleccionada(null);
    setModalOpen(true);
  };

  const handleEditarCategoria = (cat: Categoria) => {
    setCategoriaSeleccionada(cat);
    setModalOpen(true);
  };

  const handleAlternarEstado = async (cat: Categoria) => {
    try {
      await articulosApi.alternarEstadoCategoria(cat.id, cat.activo);
      setFeedback({
        type: 'ok',
        msg: `Categoría "${cat.nombre}" ${cat.activo ? 'desactivada' : 'activada'} con éxito.`,
      });
      cargarCategorias();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al cambiar estado de la categoría.' });
    }
  };

  const handleEliminarCategoria = async (cat: Categoria) => {
    const confirmacion = window.confirm(
      `¿Está seguro de eliminar la categoría "${cat.nombre}"?\n\nSi posee artículos asociados en catálogo, se aplicará baja lógica preventiva.`
    );
    if (!confirmacion) return;

    try {
      const res = await articulosApi.eliminarCategoria(cat.id);
      setFeedback({
        type: 'ok',
        msg: res.softDelete
          ? `La categoría tiene artículos vinculados: se aplicó baja lógica.`
          : `Categoría eliminada permanentemente.`,
      });
      cargarCategorias();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar la categoría.' });
    }
  };

  const handleCrearSubcategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subcatModalCatId || !subcatNombre.trim() || !subcatCodigo.trim()) return;

    try {
      await articulosApi.crearSubcategoria({
        categoria_id: subcatModalCatId,
        codigo: subcatCodigo.trim().toUpperCase(),
        nombre: subcatNombre.trim(),
        activo: true,
      });
      setFeedback({
        type: 'ok',
        msg: `Subcategoría "${subcatNombre}" agregada exitosamente.`,
      });
      setSubcatModalCatId(null);
      setSubcatNombre('');
      setSubcatCodigo('');
      cargarCategorias();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al agregar subcategoría.' });
    }
  };

  const handleEliminarSubcategoria = async (subcatId: string, subcatNombre: string) => {
    if (!window.confirm(`¿Eliminar la subcategoría "${subcatNombre}"?`)) return;
    try {
      await articulosApi.eliminarSubcategoria(subcatId);
      setFeedback({ type: 'ok', msg: `Subcategoría "${subcatNombre}" eliminada.` });
      cargarCategorias();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar subcategoría.' });
    }
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

      {/* Filtros & Barra de Acciones */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#cdc3d4]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, nombre o subcategoría..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:outline-none focus:border-[#dab9ff]"
            />
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded bg-[#131313] border border-[#333333]">
            {(['todos', 'activas', 'inactivas'] as const).map((estado) => (
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

          <button
            onClick={() => setShowColumnFilters(!showColumnFilters)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs border transition-colors ${
              showColumnFilters || activeFilterCount > 0
                ? 'bg-[#241138] border-[#dab9ff] text-[#dab9ff]'
                : 'border-[#333333] text-[#cdc3d4] hover:bg-[#222]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#dab9ff] text-[#460283] text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={clearColumnFilters}
              title="Limpiar filtros"
              className="p-1.5 text-xs text-[#ffb4ab] hover:text-[#ffdad6] hover:bg-[#381015] rounded transition-colors"
            >
              <FilterX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={cargarCategorias}
            disabled={loading}
            title="Recargar catálogo"
            className="p-1.5 rounded border border-[#333333] bg-[#131313] hover:bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleCrearCategoria}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nueva Categoría</span>
          </button>
        </div>
      </div>

      {/* Tabla Compacta de Categorías */}
      <TableContainer>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#44424a] bg-[#201f1f]">
                <SortableHeaderCell
                  label="Código"
                  sortKey="codigo"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="w-28"
                />
                <SortableHeaderCell
                  label="Nombre de Categoría"
                  sortKey="nombre"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeaderCell
                  label="Descripción"
                  sortKey="descripcion"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="py-2 px-3 font-semibold text-[11px] tracking-wider uppercase text-[#cdc3d4]">
                  Subcategorías
                </th>
                <SortableHeaderCell
                  label="Estado"
                  sortKey="activo"
                  currentSortField={sortField}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  align="center"
                  className="w-24"
                />
                <th className="py-2 px-3 text-center w-28">Acciones</th>
              </tr>

              {showColumnFilters && (
                <tr className="bg-[#181818] border-b border-[#44424a]">
                  <th className="p-1.5">
                    <ColumnFilterInput
                      value={columnFilters.codigo}
                      onChange={(v) => {
                        setColumnFilters((p) => ({ ...p, codigo: v }));
                        setCurrentPage(1);
                      }}
                      placeholder="Filtrar..."
                    />
                  </th>
                  <th className="p-1.5">
                    <ColumnFilterInput
                      value={columnFilters.nombre}
                      onChange={(v) => {
                        setColumnFilters((p) => ({ ...p, nombre: v }));
                        setCurrentPage(1);
                      }}
                      placeholder="Filtrar..."
                    />
                  </th>
                  <th className="p-1.5">
                    <ColumnFilterInput
                      value={columnFilters.descripcion}
                      onChange={(v) => {
                        setColumnFilters((p) => ({ ...p, descripcion: v }));
                        setCurrentPage(1);
                      }}
                      placeholder="Filtrar..."
                    />
                  </th>
                  <th className="p-1.5"></th>
                  <th className="p-1.5">
                    <ColumnFilterSelect
                      value={columnFilters.activo}
                      onChange={(v) => {
                        setColumnFilters((p) => ({ ...p, activo: v }));
                        setCurrentPage(1);
                      }}
                      options={[
                        { label: 'Todos', value: '' },
                        { label: 'Activas', value: 'activas' },
                        { label: 'Inactivas', value: 'inactivas' },
                      ]}
                    />
                  </th>
                  <th className="p-1.5"></th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-[#44424a]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#cdc3d4] text-xs">
                    <RefreshCw className="w-4 h-4 mx-auto animate-spin text-[#dab9ff] mb-2" />
                    Cargando categorías...
                  </td>
                </tr>
              ) : categoriasOrdenadas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#cdc3d4] text-xs">
                    <Tag className="w-7 h-7 mx-auto text-[#978d9d] opacity-40 mb-2" />
                    No se encontraron categorías con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedCategorias.map((cat) => (
                  <tr key={cat.id} className="hover:bg-[#201f1f]/50 transition-colors">
                    <td className="py-1.5 px-2.5 font-mono font-bold text-[#dab9ff]">
                      {cat.codigo}
                    </td>

                    <td className="py-1.5 px-2.5">
                      <div className="font-semibold text-xs text-[#e5e2e1]">{cat.nombre}</div>
                    </td>

                    <td className="py-1.5 px-2.5 text-[#cdc3d4] text-xs max-w-xs truncate">
                      {cat.descripcion || '-'}
                    </td>

                    <td className="py-1.5 px-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {(cat.subcategorias || []).slice(0, 3).map((sub) => (
                          <span
                            key={sub.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1c1b1b] border border-[#333333] text-[#cdc3d4]"
                          >
                            <span>{sub.nombre}</span>
                            <button
                              onClick={() => handleEliminarSubcategoria(sub.id, sub.nombre)}
                              title="Eliminar subcategoría"
                              className="text-[#ffb4ab] hover:text-[#ffdad6] text-[9px]"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        {cat.subcategorias && cat.subcategorias.length > 3 && (
                          <span className="text-[10px] text-[#978d9d] font-mono">
                            +{cat.subcategorias.length - 3} más
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setSubcatModalCatId(cat.id);
                            setSubcatNombre('');
                            setSubcatCodigo('');
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#333333] hover:border-[#dab9ff] text-[#dab9ff] transition-colors"
                          title="Agregar subcategoría"
                        >
                          + Sub
                        </button>
                      </div>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          cat.activo
                            ? 'bg-[#153426] text-[#69f0ae] border border-[#1b4332]'
                            : 'bg-[#381015] text-[#ffb4ab] border border-[#690005]'
                        }`}
                      >
                        {cat.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>

                    <td className="py-1.5 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditarCategoria(cat)}
                          title="Modificar categoría"
                          className="p-1 rounded text-[#cdc3d4] hover:text-[#dab9ff] hover:bg-[#2a2a2a] transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleAlternarEstado(cat)}
                          title={cat.activo ? 'Desactivar categoría' : 'Activar categoría'}
                          className={`p-1 rounded hover:bg-[#2a2a2a] transition-colors ${
                            cat.activo ? 'text-[#69f0ae] hover:text-[#a1e5b3]' : 'text-[#ffb4ab]'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEliminarCategoria(cat)}
                          title="Eliminar categoría"
                          className="p-1 rounded text-[#ffb4ab] hover:text-[#ffdad6] hover:bg-[#381015] transition-colors"
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

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={categoriasOrdenadas.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCurrentPage(1);
          }}
        />
      </TableContainer>

      {/* Subcategoría Modal Rápida */}
      {subcatModalCatId && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-sm rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] p-5 shadow-2xl text-slate-800 dark:text-[#e5e2e1] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#333333]">
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                    <FolderPlus className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                    <span>Agregar Subcategoría</span>
                  </h4>
                  {categorias.find((c) => c.id === subcatModalCatId) && (
                    <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                      Categoría:{' '}
                      <span className="text-violet-700 dark:text-[#dab9ff] font-semibold">
                        {categorias.find((c) => c.id === subcatModalCatId)?.nombre}
                      </span>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSubcatModalCatId(null)}
                  className="text-xs text-slate-400 hover:text-slate-700 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCrearSubcategoria} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Código de Subcategoría
                  </label>
                  <input
                    type="text"
                    required
                    value={subcatCodigo}
                    onChange={(e) => setSubcatCodigo(e.target.value.toUpperCase())}
                    placeholder="SUB-01"
                    className="w-full px-3 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] font-mono text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Nombre de la Subcategoría
                  </label>
                  <input
                    type="text"
                    required
                    value={subcatNombre}
                    onChange={(e) => setSubcatNombre(e.target.value)}
                    placeholder="Gaseosas y Bebidas Colas"
                    className="w-full px-3 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSubcatModalCatId(null)}
                    className="px-3 py-1.5 rounded border border-slate-300 dark:border-[#333333] text-xs text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-100 dark:hover:bg-[#201f1f] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:text-[#460283] font-bold text-xs dark:hover:bg-[#eedbff] transition-colors"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Categoría Principal */}
      <CategoriaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        categoria={categoriaSeleccionada}
        onSuccess={() => {
          cargarCategorias();
          if (onRefreshParent) onRefreshParent();
        }}
      />
    </div>
  );
};
