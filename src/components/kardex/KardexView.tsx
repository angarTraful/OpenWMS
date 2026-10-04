import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  X,
  Layers,
  MapPin,
  Calendar,
  Clock,
  Filter,
  RotateCcw,
  Package,
  ArrowRightLeft,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime, formatNumber, formatM3, formatDate, cn } from '@/lib/utils';
import {
  TableContainer,
  SortableHeaderCell,
  AnimatedTableRow,
  TableSkeleton,
  TableEmptyState,
  TablePagination,
  ColumnFilterInput,
  ColumnFilterSelect,
} from '@/components/ui/AnimatedTable';

// Clasificación de movimientos de almacén WMS
export const esMovimientoEntrada = (tipo?: string | null): boolean => {
  return (
    tipo === 'recepcion' ||
    tipo === 'ingreso_inicial' ||
    tipo === 'ajuste_positivo' ||
    tipo === 'putaway'
  );
};

export const esMovimientoSalida = (tipo?: string | null): boolean => {
  return (
    tipo === 'despacho' ||
    tipo === 'picking' ||
    tipo === 'merma' ||
    tipo === 'ajuste_negativo'
  );
};

export const esMovimientoInterno = (tipo?: string | null): boolean => {
  return (
    tipo === 'transferencia' ||
    tipo === 'transferencia_interna' ||
    tipo === 'despaletizado' ||
    tipo === 'paletizado_despacho'
  );
};

interface KardexViewProps {
  movimientos: any[];
  inventario?: any[];
  pedidos?: any[];
  onRefresh: () => void;
  isLoading?: boolean;
  filtroArticuloId?: string | null;
  onClearArticuloFilter?: () => void;
}

type KardexSortField =
  | 'fecha_hora'
  | 'tipo_movimiento'
  | 'articulo'
  | 'lote'
  | 'cliente'
  | 'origen_destino'
  | 'cantidad'
  | 'volumen';

export const KardexView: React.FC<KardexViewProps> = ({
  movimientos,
  inventario = [],
  pedidos = [],
  onRefresh,
  isLoading = false,
  filtroArticuloId,
  onClearArticuloFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [sortField, setSortField] = useState<KardexSortField>('fecha_hora');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [selectedArticuloId, setSelectedArticuloId] = useState<string | null>(filtroArticuloId || null);

  // Filtro de Rango Fecha / Hora (Inicio y Fin)
  const [fechaHoraDesde, setFechaHoraDesde] = useState<string>('');
  const [fechaHoraHasta, setFechaHoraHasta] = useState<string>('');

  React.useEffect(() => {
    if (filtroArticuloId !== undefined) {
      setSelectedArticuloId(filtroArticuloId);
    }
  }, [filtroArticuloId]);

  // Column filters
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState({
    sku: '',
    lote: '',
    cliente: '',
    origenDestino: '',
    tipo: '',
  });

  const activeColFiltersCount = useMemo(() => {
    return Object.values(colFilters).filter((v) => v.trim() !== '').length;
  }, [colFilters]);

  const handleColFilterChange = (key: keyof typeof colFilters, val: string) => {
    setColFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setTipoFiltro('ALL');
    setFechaHoraDesde('');
    setFechaHoraHasta('');
    setColFilters({
      sku: '',
      lote: '',
      cliente: '',
      origenDestino: '',
      tipo: '',
    });
    setSelectedArticuloId(null);
    if (onClearArticuloFilter) onClearArticuloFilter();
    setCurrentPage(1);
  };

  const articulosDisponibles = useMemo(() => {
    const map = new Map<string, { id: string; sku: string; nombre: string; id_producto?: string; color?: string; tipo_empaque?: string }>();
    movimientos.forEach((m) => {
      const art = m.articulo;
      const artId = m.articulo_id || art?.id;
      if (artId && art) {
        map.set(artId, {
          id: artId,
          sku: art.sku || '',
          id_producto: art.id_producto || art.sku || '',
          nombre: art.nombre || '',
          color: art.color,
          tipo_empaque: art.tipo_empaque,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [movimientos]);

  const articuloFiltrado = useMemo(() => {
    if (!selectedArticuloId) return null;
    const m = movimientos.find((mov) => mov.articulo_id === selectedArticuloId || mov.articulo?.id === selectedArticuloId);
    return m?.articulo || articulosDisponibles.find((a) => a.id === selectedArticuloId) || null;
  }, [movimientos, selectedArticuloId, articulosDisponibles]);

  const filtered = useMemo(() => {
    return movimientos.filter((m) => {
      // Filtro exclusivo por artículo individual
      if (selectedArticuloId && m.articulo_id !== selectedArticuloId && m.articulo?.id !== selectedArticuloId) {
        return false;
      }

      // Global search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchSearch =
          m.articulo?.sku?.toLowerCase().includes(query) ||
          m.articulo?.id_producto?.toLowerCase().includes(query) ||
          m.articulo?.nombre?.toLowerCase().includes(query) ||
          m.lote?.numero_lote?.toLowerCase().includes(query) ||
          m.cliente?.razon_social?.toLowerCase().includes(query) ||
          m.tipo_movimiento?.toLowerCase().includes(query) ||
          m.ubicacion_origen?.codigo_etiqueta?.toLowerCase().includes(query) ||
          m.ubicacion_destino?.codigo_etiqueta?.toLowerCase().includes(query);
        if (!matchSearch) return false;
      }

      // Quick type filter pills
      if (tipoFiltro !== 'ALL' && m.tipo_movimiento !== tipoFiltro) {
        return false;
      }

      // Column filters
      if (colFilters.sku.trim()) {
        const q = colFilters.sku.toLowerCase();
        const matchSku =
          m.articulo?.sku?.toLowerCase().includes(q) ||
          m.articulo?.id_producto?.toLowerCase().includes(q) ||
          m.articulo?.nombre?.toLowerCase().includes(q);
        if (!matchSku) return false;
      }

      if (colFilters.lote.trim()) {
        const q = colFilters.lote.toLowerCase();
        if (!m.lote?.numero_lote?.toLowerCase().includes(q)) return false;
      }

      if (colFilters.cliente.trim()) {
        const q = colFilters.cliente.toLowerCase();
        if (!m.cliente?.razon_social?.toLowerCase().includes(q)) return false;
      }

      if (colFilters.origenDestino.trim()) {
        const q = colFilters.origenDestino.toLowerCase();
        const matchOD =
          m.ubicacion_origen?.codigo_etiqueta?.toLowerCase().includes(q) ||
          m.ubicacion_destino?.codigo_etiqueta?.toLowerCase().includes(q);
        if (!matchOD) return false;
      }

      if (colFilters.tipo.trim()) {
        if (m.tipo_movimiento !== colFilters.tipo) return false;
      }

      // Filtro de Rango Fecha / Hora (Desde / Inicio - Hasta / Fin)
      if (fechaHoraDesde) {
        const tDesde = new Date(fechaHoraDesde).getTime();
        const tMov = new Date(m.fecha_hora).getTime();
        if (tMov < tDesde) return false;
      }

      if (fechaHoraHasta) {
        const tHasta = new Date(fechaHoraHasta).getTime();
        const tMov = new Date(m.fecha_hora).getTime();
        if (tMov > tHasta) return false;
      }

      return true;
    });
  }, [movimientos, selectedArticuloId, searchTerm, tipoFiltro, colFilters, fechaHoraDesde, fechaHoraHasta]);

  // Reservas activas en pedidos en proceso (o inventario)
  const totalReservados = useMemo(() => {
    // 1. Si tenemos inventario, usamos la suma de cantidad_reservada
    if (inventario && inventario.length > 0) {
      if (selectedArticuloId) {
        return inventario
          .filter((i) => i.articulo_id === selectedArticuloId)
          .reduce((acc, i) => acc + Number(i.cantidad_reservada || 0), 0);
      }
      const filteredArtIds = new Set(filtered.map((m) => m.articulo_id).filter(Boolean));
      if (filteredArtIds.size > 0 && filteredArtIds.size < 30) {
        return inventario
          .filter((i) => filteredArtIds.has(i.articulo_id))
          .reduce((acc, i) => acc + Number(i.cantidad_reservada || 0), 0);
      }
      return inventario.reduce((acc, i) => acc + Number(i.cantidad_reservada || 0), 0);
    }

    // 2. Fallback a pedidos en proceso
    if (pedidos && pedidos.length > 0) {
      const pedsEnProceso = pedidos.filter(
        (p) => p.estado !== 'despachado' && p.estado !== 'cancelado'
      );
      let sumRes = 0;
      pedsEnProceso.forEach((p) => {
        (p.detalles || []).forEach((d: any) => {
          if (!selectedArticuloId || d.articulo_id === selectedArticuloId) {
            sumRes += Number(d.cantidad_reservada || 0);
          }
        });
      });
      return sumRes;
    }

    return 0;
  }, [inventario, pedidos, selectedArticuloId, filtered]);

  // Cálculo de Totales de Cantidades y M3 de la vista filtrada del Kardex
  // REGLA CLAVE: Salidas se restan de las entradas, nunca se suman.
  // Stock Futuro = Entradas - Salidas - Reservados en Pedidos
  const kardexTotals = useMemo(() => {
    let totalEntradas = 0;
    let totalSalidas = 0;
    let totalInternos = 0;
    let totalVolumenM3 = 0;

    filtered.forEach((m) => {
      const cant = Number(m.cantidad || 0);
      const vol = Number(m.volumen_m3 || m.volumen_total_m3 || 0);
      totalVolumenM3 += vol;

      if (esMovimientoEntrada(m.tipo_movimiento)) {
        totalEntradas += cant;
      } else if (esMovimientoSalida(m.tipo_movimiento)) {
        totalSalidas += cant;
      } else {
        totalInternos += cant;
      }
    });

    const netoCantidad = totalEntradas - totalSalidas; // Stock Físico (Neto en Almacén)
    const stockFuturo = Math.max(0, netoCantidad - totalReservados); // Stock Futuro = Entradas - Salidas - Reservados

    // Cantidad de Pallets presentes en inventario
    const relevantInv = selectedArticuloId
      ? inventario.filter((i) => i.articulo_id === selectedArticuloId)
      : inventario;
    const palletSet = new Set(
      relevantInv.map((i: any) => i.pallet_id || i.id_pallet || i.codigo_pallet).filter(Boolean)
    );
    const totalPallets = palletSet.size;

    return {
      totalCantidad: netoCantidad,
      netoCantidad,
      totalEntradas,
      totalSalidas,
      totalInternos,
      totalReservados,
      stockFuturo,
      totalVolumenM3,
      totalPallets,
    };
  }, [filtered, totalReservados, inventario, selectedArticuloId]);

  const sortedMovimientos = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'fecha_hora':
          valA = new Date(a.fecha_hora || 0).getTime();
          valB = new Date(b.fecha_hora || 0).getTime();
          break;
        case 'tipo_movimiento':
          valA = a.tipo_movimiento || '';
          valB = b.tipo_movimiento || '';
          break;
        case 'articulo':
          valA = a.articulo?.sku || '';
          valB = b.articulo?.sku || '';
          break;
        case 'lote':
          valA = a.lote?.numero_lote || '';
          valB = b.lote?.numero_lote || '';
          break;
        case 'cliente':
          valA = a.cliente?.razon_social || '';
          valB = b.cliente?.razon_social || '';
          break;
        case 'origen_destino':
          valA = a.ubicacion_destino?.codigo_etiqueta || a.ubicacion_origen?.codigo_etiqueta || '';
          valB = b.ubicacion_destino?.codigo_etiqueta || b.ubicacion_origen?.codigo_etiqueta || '';
          break;
        case 'cantidad':
          valA = Number(a.cantidad || 0);
          valB = Number(b.cantidad || 0);
          break;
        case 'volumen':
          valA = Number(a.volumen_total_m3 || 0);
          valB = Number(b.volumen_total_m3 || 0);
          break;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filtered, sortField, sortAsc]);

  const tiposDisponibles = useMemo(() => {
    const set = new Set<string>();
    movimientos.forEach((m) => {
      if (m.tipo_movimiento) set.add(m.tipo_movimiento);
    });
    return Array.from(set);
  }, [movimientos]);

  // Pagination
  const totalPages = Math.ceil(sortedMovimientos.length / pageSize) || 1;
  const paginatedMovimientos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedMovimientos.slice(start, start + pageSize);
  }, [sortedMovimientos, currentPage, pageSize]);

  const toggleSort = (field: KardexSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const hasAnyFilter = Boolean(
    searchTerm.trim() ||
    tipoFiltro !== 'ALL' ||
    activeColFiltersCount > 0 ||
    fechaHoraDesde ||
    fechaHoraHasta
  );

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'recepcion':
      case 'ingreso_inicial':
        return <Badge variant="success" dot pulse>Entrada / Recepción</Badge>;
      case 'despacho':
        return <Badge variant="danger" dot>Salida / Despacho</Badge>;
      case 'picking':
        return <Badge variant="warning" dot>Picking / Preparación</Badge>;
      case 'putaway':
        return <Badge variant="success" dot pulse>Entrada / Putaway</Badge>;
      case 'transferencia':
        return <Badge variant="outline" dot>Transferencia Interna</Badge>;
      case 'ajuste_positivo':
        return <Badge variant="info" dot>Ajuste (+)</Badge>;
      case 'ajuste_negativo':
        return <Badge variant="danger" dot>Ajuste (-)</Badge>;
      case 'merma':
        return <Badge variant="danger" dot>Merma / Scrap</Badge>;
      case 'paletizado_despacho':
        return <Badge variant="warning">Paletizado Salida</Badge>;
      case 'despaletizado':
        return <Badge variant="outline">Despaletizado</Badge>;
      default:
        return <Badge variant="default">{tipo}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-[#333333] gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
            <motion.div
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.5 }}
              className="p-1.5 rounded-lg bg-violet-100 text-violet-700 dark:bg-[#dab9ff]/10 dark:text-[#dab9ff]"
            >
              <History className="w-5 h-5" />
            </motion.div>
            <span>Kardex Físico & Trazabilidad Inmutable</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mt-0.5">
            Asientos cronológicos de movimientos en depósito, variaciones de stock y cubicaje M3
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1a1919] hover:bg-slate-50 dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
          <span>Actualizar Kardex</span>
        </motion.button>
      </div>

      {/* Banner de Filtro Individual por Artículo */}
      {selectedArticuloId && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-violet-50/70 dark:bg-[#201330] border border-violet-200 dark:border-[#dab9ff]/50 flex flex-wrap items-center justify-between gap-3 shadow-xs dark:shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-violet-100 dark:bg-[#dab9ff]/20 text-violet-700 dark:text-[#dab9ff] ring-1 ring-violet-300 dark:ring-[#dab9ff]/40">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-violet-700 dark:text-[#dab9ff]">
                  Ficha Kardex Individual de Producto
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-100 dark:bg-[#dab9ff]/20 text-violet-800 dark:text-[#dab9ff] font-bold border border-violet-200 dark:border-[#dab9ff]/30">
                  SKU: {articuloFiltrado?.sku || 'SKU'}
                </span>
                {articuloFiltrado?.id_producto && articuloFiltrado.id_producto !== articuloFiltrado.sku && (
                  <span className="text-[10px] font-mono text-slate-500 dark:text-[#cdc3d4]">
                    (ID: {articuloFiltrado.id_producto})
                  </span>
                )}
                {articuloFiltrado?.color && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-white dark:bg-[#1a1919] text-slate-600 dark:text-[#cdc3d4] border border-slate-200 dark:border-[#333333]">
                    {articuloFiltrado.color}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] mt-0.5">
                {articuloFiltrado?.nombre || 'Artículo Seleccionado'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#cdc3d4] mt-0.5">
                Visualizando exclusivamente los movimientos históricos y trazabilidad de este artículo ({filtered.length} movimientos).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedArticuloId(null);
                if (onClearArticuloFilter) onClearArticuloFilter();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#252424] hover:bg-slate-100 dark:hover:bg-[#333333] text-slate-800 dark:text-[#e5e2e1] border border-slate-300 dark:border-[#44424a] transition-all hover:border-violet-400 dark:hover:border-[#dab9ff]"
            >
              <X className="w-3.5 h-3.5 text-rose-500 dark:text-[#ffb4ab]" />
              <span>Ver Todos los Artículos</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Table Container */}
      <TableContainer>
        {/* Toolbar */}
        <div className="p-3.5 bg-slate-50/80 dark:bg-[#1a1919] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 dark:text-[#978d9d] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar SKU, Lote, artículo, cliente o ubicación..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] placeholder-slate-400 dark:placeholder-[#978d9d] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] focus:ring-1 focus:ring-violet-500/20 dark:focus:ring-[#dab9ff]/30 transition-all shadow-xs dark:shadow-inner"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#978d9d] hover:text-slate-700 dark:hover:text-[#e5e2e1] p-0.5 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowColFilters(!showColFilters)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                showColFilters || activeColFiltersCount > 0
                  ? 'border-violet-300 dark:border-[#dab9ff]/50 bg-violet-50 dark:bg-[#28153c] text-violet-700 dark:text-[#dab9ff]'
                  : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:border-slate-300 dark:hover:border-[#4b4452]'
              )}
              title="Mostrar / ocultar filtros por columna"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros Columna</span>
              {activeColFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-violet-600 dark:bg-[#dab9ff] text-white dark:text-[#460283] text-[10px] font-bold inline-flex items-center justify-center">
                  {activeColFiltersCount}
                </span>
              )}
            </button>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose-600 dark:text-[#ffb4ab] hover:text-rose-700 dark:hover:text-[#ffdad6] hover:bg-rose-50 dark:hover:bg-[#381015]/40 rounded-lg transition-colors"
                title="Restablecer todos los filtros"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] p-1 rounded-lg text-xs shadow-xs dark:shadow-inner overflow-x-auto scrollbar-none">
              <span className="text-slate-500 dark:text-[#cdc3d4] text-[11px] px-1 font-medium">
                Tipo:
              </span>
              <button
                onClick={() => {
                  setTipoFiltro('ALL');
                  setCurrentPage(1);
                }}
                className={cn(
                  'relative px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors',
                  tipoFiltro === 'ALL'
                    ? 'bg-violet-600 dark:bg-[#dab9ff] text-white dark:text-[#460283]'
                    : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
                )}
              >
                <span>Todos</span>
              </button>
              {tiposDisponibles.map((t) => {
                const isSelected = tipoFiltro === t;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setTipoFiltro(t);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'relative px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors capitalize',
                      isSelected
                        ? 'bg-violet-600 dark:bg-[#dab9ff] text-white dark:text-[#460283]'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
                    )}
                  >
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono hidden sm:inline">
              <strong className="text-violet-700 dark:text-[#dab9ff]">{sortedMovimientos.length}</strong>
              {sortedMovimientos.length !== movimientos.length && (
                <span className="text-slate-400 dark:text-[#978d9d]"> de {movimientos.length}</span>
              )}{' '}
              movimientos
            </span>
          </div>
        </div>

        {/* Barra de Filtro de Rango Fecha / Hora (Inicio y Fin) */}
        <div className="px-3.5 py-2.5 bg-slate-50/50 dark:bg-[#171616] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
              <span className="font-semibold">Rango Fecha/Hora:</span>
            </span>

            {/* Fecha/Hora Inicio */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] rounded-lg px-2.5 py-1 focus-within:border-violet-500 dark:focus-within:border-[#dab9ff] transition-colors shadow-xs dark:shadow-inner">
              <Clock className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
              <span className="text-[10px] text-slate-400 dark:text-[#978d9d] uppercase font-bold tracking-wider">Inicio:</span>
              <input
                type="datetime-local"
                value={fechaHoraDesde}
                onChange={(e) => {
                  setFechaHoraDesde(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-slate-800 dark:text-[#e5e2e1] text-[11px] font-mono outline-none cursor-pointer dark:[color-scheme:dark]"
              />
            </div>

            <span className="text-slate-400 dark:text-[#978d9d] font-bold text-xs">&rarr;</span>

            {/* Fecha/Hora Fin */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] rounded-lg px-2.5 py-1 focus-within:border-violet-500 dark:focus-within:border-[#dab9ff] transition-colors shadow-xs dark:shadow-inner">
              <Clock className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
              <span className="text-[10px] text-slate-400 dark:text-[#978d9d] uppercase font-bold tracking-wider">Fin:</span>
              <input
                type="datetime-local"
                value={fechaHoraHasta}
                onChange={(e) => {
                  setFechaHoraHasta(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-slate-800 dark:text-[#e5e2e1] text-[11px] font-mono outline-none cursor-pointer dark:[color-scheme:dark]"
              />
            </div>

            {(fechaHoraDesde || fechaHoraHasta) && (
              <button
                type="button"
                onClick={() => {
                  setFechaHoraDesde('');
                  setFechaHoraHasta('');
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-rose-50 dark:bg-[#2a0e12] text-rose-700 dark:text-[#ffb4ab] border border-rose-200 dark:border-[#690005] hover:bg-rose-100 dark:hover:bg-[#381015] transition-colors"
                title="Quitar rango de fechas"
              >
                <X className="w-3 h-3" />
                <span>Quitar rango</span>
              </button>
            )}
          </div>

          {/* Atajos / Presets rápidos */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 dark:text-[#978d9d] uppercase font-semibold">Atajos:</span>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                const pad = (n: number) => String(n).padStart(2, '0');
                const toIsoLocal = (d: Date) =>
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                setFechaHoraDesde(toIsoLocal(startToday));
                setFechaHoraHasta(toIsoLocal(endToday));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:text-violet-700 dark:hover:text-[#dab9ff] hover:border-violet-300 dark:hover:border-[#dab9ff]/40 transition-colors shadow-xs"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const pad = (n: number) => String(n).padStart(2, '0');
                const toIsoLocal = (d: Date) =>
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                setFechaHoraDesde(toIsoLocal(past7));
                setFechaHoraHasta(toIsoLocal(now));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:text-violet-700 dark:hover:text-[#dab9ff] hover:border-violet-300 dark:hover:border-[#dab9ff]/40 transition-colors shadow-xs"
            >
              Últimos 7 días
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                const pad = (n: number) => String(n).padStart(2, '0');
                const toIsoLocal = (d: Date) =>
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                setFechaHoraDesde(toIsoLocal(startMonth));
                setFechaHoraHasta(toIsoLocal(now));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:text-violet-700 dark:hover:text-[#dab9ff] hover:border-violet-300 dark:hover:border-[#dab9ff]/40 transition-colors shadow-xs"
            >
              Este Mes
            </button>
          </div>
        </div>

        {/* Barra de Totales con ÉNFASIS en Cantidad y M3 */}
        <div className="px-3.5 py-3 bg-slate-50 dark:bg-[#141414] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#978d9d] flex items-center gap-1 mr-1">
              <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
              <span>Totales:</span>
            </span>

            {/* HERO 1: Stock Físico (Cantidad Total en Almacén) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-500/40 shadow-xs">
              <Package className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <div>
                <div className="text-[10px] font-semibold text-sky-900/70 dark:text-sky-300/80 leading-none">Stock Total (Cantidad)</div>
                <div className="font-mono font-black text-sm text-sky-900 dark:text-sky-200 leading-tight">
                  {formatNumber(kardexTotals.netoCantidad, 0)} <span className="text-xs font-semibold">un.</span>
                </div>
              </div>
            </div>

            {/* HERO 2: Volumen Total (M3) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-300 dark:border-violet-500/40 shadow-xs">
              <Layers className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <div>
                <div className="text-[10px] font-semibold text-violet-900/70 dark:text-violet-300/80 leading-none">Volumen Total</div>
                <div className="font-mono font-black text-sm text-violet-900 dark:text-violet-200 leading-tight">
                  {formatM3(kardexTotals.totalVolumenM3)}
                </div>
              </div>
            </div>

            {/* SECUNDARIO 1: Pallets */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] shadow-xs">
              <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">Pallets:</span>
              <span className="font-mono font-bold text-xs text-slate-800 dark:text-[#e5e2e1]">
                {kardexTotals.totalPallets}
              </span>
            </div>

            {/* SECUNDARIO 2: Stock Futuro Proyectado */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] shadow-xs" title="Stock Físico menos Reservados en Pedidos">
              <Sparkles className="w-3 h-3 text-violet-500 dark:text-[#dab9ff]" />
              <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">Stock Futuro:</span>
              <span className="font-mono font-bold text-xs text-violet-700 dark:text-[#dab9ff]">
                {formatNumber(kardexTotals.stockFuturo, 0)} un.
              </span>
            </div>

            {/* SECUNDARIO 3: Reservados en Pedidos */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50/60 dark:bg-[#2b1f09] border border-amber-200 dark:border-[#854d0e] shadow-xs">
              <Clock className="w-3 h-3 text-amber-600 dark:text-[#eab308]" />
              <span className="text-[11px] text-amber-800 dark:text-[#fef08a]">Reservados:</span>
              <span className="font-mono font-bold text-xs text-amber-700 dark:text-[#eab308]">
                {formatNumber(kardexTotals.totalReservados, 0)}
              </span>
            </div>

            {/* SECUNDARIOS: Entradas / Salidas */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] text-[11px]">
              <span className="text-emerald-700 dark:text-[#75d1ff] font-semibold flex items-center gap-0.5">
                <ArrowDownLeft className="w-2.5 h-2.5" />+{formatNumber(kardexTotals.totalEntradas, 0)}
              </span>
              <span className="text-slate-300 dark:text-[#333333]">|</span>
              <span className="text-rose-700 dark:text-[#ffb4ab] font-semibold flex items-center gap-0.5">
                <ArrowUpRight className="w-2.5 h-2.5" />-{formatNumber(kardexTotals.totalSalidas, 0)}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-[#978d9d] font-mono flex items-center gap-2">
            <span>
              Mostrando <strong className="text-slate-900 dark:text-[#e5e2e1]">{paginatedMovimientos.length}</strong> de{' '}
              <strong className="text-violet-600 dark:text-[#dab9ff]">{filtered.length}</strong> movimientos
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 dark:bg-[#1c1b1b] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a] select-none z-10">
              <tr>
                <SortableHeaderCell
                  label="Fecha / Hora"
                  field="fecha_hora"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                />
                <SortableHeaderCell
                  label="Tipo Movimiento"
                  field="tipo_movimiento"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                />
                <SortableHeaderCell
                  label="Artículo & SKU"
                  field="articulo"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                />
                <SortableHeaderCell
                  label="Lote / Vencimiento"
                  field="lote"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                />
                <SortableHeaderCell
                  label="Cliente 3PL"
                  field="cliente"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                />
                <SortableHeaderCell
                  label="Origen → Destino"
                  field="origen_destino"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                />
                <SortableHeaderCell
                  label="Cantidad"
                  field="cantidad"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableHeaderCell
                  label="Volumen M3"
                  field="volumen"
                  currentSortField={sortField}
                  sortAsc={sortAsc}
                  onSort={toggleSort}
                  align="right"
                />
              </tr>

              {/* Column Filters Subheader Row */}
              {showColFilters && (
                <tr className="bg-slate-50 dark:bg-[#161515] border-b border-slate-200 dark:border-[#44424a]">
                  <th className="py-1.5 px-2" />
                  <th className="py-1.5 px-2">
                    <ColumnFilterSelect
                      value={colFilters.tipo}
                      onChange={(val) => handleColFilterChange('tipo', val)}
                      options={tiposDisponibles.map((t) => ({ label: t, value: t }))}
                      placeholder="Todos los tipos"
                    />
                  </th>
                  <th className="py-1.5 px-2">
                    <ColumnFilterInput
                      value={colFilters.sku}
                      onChange={(val) => handleColFilterChange('sku', val)}
                      placeholder="Filtrar SKU / nombre..."
                    />
                  </th>
                  <th className="py-1.5 px-2">
                    <ColumnFilterInput
                      value={colFilters.lote}
                      onChange={(val) => handleColFilterChange('lote', val)}
                      placeholder="Filtrar lote..."
                    />
                  </th>
                  <th className="py-1.5 px-2">
                    <ColumnFilterInput
                      value={colFilters.cliente}
                      onChange={(val) => handleColFilterChange('cliente', val)}
                      placeholder="Filtrar cliente..."
                    />
                  </th>
                  <th className="py-1.5 px-2">
                    <ColumnFilterInput
                      value={colFilters.origenDestino}
                      onChange={(val) => handleColFilterChange('origenDestino', val)}
                      placeholder="Filtrar ubicación..."
                    />
                  </th>
                  <th className="py-1.5 px-2" />
                  <th className="py-1.5 px-2" />
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#44424a]">
              {isLoading ? (
                <TableSkeleton columns={8} rows={6} />
              ) : paginatedMovimientos.length === 0 ? (
                <TableEmptyState
                  icon={History}
                  colSpan={8}
                  title="No hay movimientos en el Kardex"
                  description={
                    searchTerm || tipoFiltro !== 'ALL' || selectedArticuloId || fechaHoraDesde || fechaHoraHasta
                      ? 'No hay registros coincidentes con los filtros y rango de fechas seleccionados'
                      : 'Los movimientos se asentarán automáticamente al realizar recepciones, putaway o pickings'
                  }
                />
              ) : (
                <AnimatePresence mode="popLayout">
                  {paginatedMovimientos.map((m, idx) => {
                    const esEntrada = esMovimientoEntrada(m.tipo_movimiento);
                    const esSalida = esMovimientoSalida(m.tipo_movimiento);
                    const esInterno = esMovimientoInterno(m.tipo_movimiento);

                    return (
                      <AnimatedTableRow key={m.id} index={idx} isClickable={false}>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                          {formatDateTime(m.fecha_hora)}
                        </td>
                        <td className="py-2 px-3">
                          {getTipoBadge(m.tipo_movimiento)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-xs text-slate-900 dark:text-[#e5e2e1] group-hover:text-violet-700 dark:group-hover:text-[#dab9ff] transition-colors">
                            {m.articulo?.sku || '-'}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#978d9d] truncate max-w-[170px]">
                            {m.articulo?.nombre || ''}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-mono text-xs text-slate-800 dark:text-[#e5e2e1] font-semibold">
                            {m.lote?.numero_lote || '-'}
                          </div>
                          {m.lote?.fecha_vencimiento && (
                            <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block">
                              Vto: {formatDate(m.lote.fecha_vencimiento)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-medium text-xs text-slate-800 dark:text-[#e5e2e1]">
                            {m.cliente?.razon_social || '-'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px]">
                          <div className="flex items-center gap-1 text-slate-600 dark:text-[#cdc3d4]">
                            <span className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[#252424] border border-slate-200 dark:border-[#333333]">
                              {m.origen?.codigo_etiqueta || 'Exterior'}
                            </span>
                            <span className="text-slate-400 dark:text-[#978d9d]">&rarr;</span>
                            <span className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[#252424] border border-slate-200 dark:border-[#333333] font-bold text-slate-900 dark:text-[#e5e2e1]">
                              {m.destino?.codigo_etiqueta || 'Despacho'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px]',
                              esEntrada
                                ? 'text-emerald-700 dark:text-[#75d1ff] bg-emerald-50 dark:bg-[#0f241a] border border-emerald-200 dark:border-[#1d4d38]'
                                : esSalida
                                ? 'text-rose-700 dark:text-[#ffb4ab] bg-rose-50 dark:bg-[#2a0e12] border border-rose-200 dark:border-[#690005]'
                                : 'text-slate-600 dark:text-[#cdc3d4] bg-slate-100 dark:bg-[#252424] border border-slate-200 dark:border-[#333333]'
                            )}
                          >
                            {esEntrada ? (
                              <>
                                <ArrowDownLeft className="w-2.5 h-2.5 text-emerald-600 dark:text-[#75d1ff]" />
                                <span>+{formatNumber(m.cantidad || 0, 0)}</span>
                              </>
                            ) : esSalida ? (
                              <>
                                <ArrowUpRight className="w-2.5 h-2.5 text-rose-600 dark:text-[#ffb4ab]" />
                                <span>-{formatNumber(m.cantidad || 0, 0)}</span>
                              </>
                            ) : (
                              <>
                                <ArrowRightLeft className="w-2.5 h-2.5 text-slate-400" />
                                <span>{formatNumber(m.cantidad || 0, 0)}</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-xs text-violet-700 dark:text-[#dab9ff] tabular-nums">
                          {formatM3(m.volumen_m3 || 0)}
                        </td>
                      </AnimatedTableRow>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>

            {filtered.length > 0 && !isLoading && (
              <tfoot className="bg-slate-100 dark:bg-[#181717] border-t-2 border-slate-300 dark:border-[#44424a] text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] sticky bottom-0 z-10 shadow-lg">
                <tr>
                  <td colSpan={6} className="py-3 px-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] uppercase tracking-wider font-extrabold text-violet-700 dark:text-[#dab9ff]">
                        TOTALES DE LA VISTA
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono">
                        ({filtered.length} movimientos)
                      </span>
                      <div className="flex items-center gap-2 text-[10px] ml-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40 font-bold">
                          Stock Físico: {formatNumber(kardexTotals.netoCantidad, 0)} un.
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-[#dab9ff] border border-violet-200 dark:border-[#dab9ff]/40 font-bold">
                          Volumen: {formatM3(kardexTotals.totalVolumenM3)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border border-slate-200 dark:border-[#333333]">
                          Pallets: {kardexTotals.totalPallets}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-[#28153c] text-violet-800 dark:text-[#dab9ff] border border-slate-200 dark:border-[#dab9ff]/40">
                          <Sparkles className="w-2.5 h-2.5" />
                          Stock Futuro: {formatNumber(kardexTotals.stockFuturo, 0)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-[#2b1f09] text-amber-800 dark:text-[#fef08a] border border-amber-200 dark:border-[#854d0e]">
                          <Clock className="w-2.5 h-2.5" />
                          Reservados: {formatNumber(kardexTotals.totalReservados, 0)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-xs">
                    <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Saldo Físico</div>
                    <div className="text-sm font-extrabold text-sky-700 dark:text-[#75d1ff] tabular-nums">
                      {formatNumber(kardexTotals.netoCantidad, 0)} un.
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-xs">
                    <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Volumen Total</div>
                    <span className="text-sm font-extrabold text-violet-700 dark:text-[#dab9ff] tabular-nums">
                      {formatM3(kardexTotals.totalVolumenM3)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Footer */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={sortedMovimientos.length}
          itemsPerPage={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          onPageChange={setCurrentPage}
        />
      </TableContainer>
    </div>
  );
};
