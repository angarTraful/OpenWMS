import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Package,
  Layers,
  MapPin,
  Barcode,
  X,
  Sparkles,
  Filter,
  RotateCcw,
  History,
  Building2,
  Tags,
  Boxes,
  ExternalLink,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { cn, formatNumber, formatM3, formatDate, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { inventarioApi } from '@/api/inventarioApi';
import {
  TableContainer,
  SortableHeaderCell,
  AnimatedTableRow,
  TableSkeleton,
  TableEmptyState,
  TablePagination,
  ColumnFilterInput,
} from '@/components/ui/AnimatedTable';

export type VistaInventario = 'articulo' | 'lote' | 'cliente' | 'detalle';

interface InventoryTableProps {
  items: any[];
  selectedItem: any | null;
  onSelectItem: (item: any) => void;
  onViewKardex?: (clienteId: string, articuloId: string) => void;
  isLoading?: boolean;
}

type SortField =
  | 'volumen'
  | 'cantidad'
  | 'sku'
  | 'cliente'
  | 'pallet'
  | 'ubicacion'
  | 'lote'
  | 'articulos_count';

export const InventoryTable: React.FC<InventoryTableProps> = ({
  items,
  selectedItem,
  onSelectItem,
  onViewKardex,
  isLoading = false,
}) => {
  const [vistaActiva, setVistaActiva] = useState<VistaInventario>('articulo');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAbc, setSelectedAbc] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [sortBy, setSortBy] = useState<SortField>('cantidad');
  const [sortAsc, setSortAsc] = useState(false);

  // Column-specific filters
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState({
    sku: '',
    cliente: '',
    pallet: '',
    ubicacion: '',
    lote: '',
  });

  // Modal de vista rápida Kardex de un producto
  const [quickKardexArticulo, setQuickKardexArticulo] = useState<{
    articuloId: string;
    clienteId?: string;
    nombre: string;
    sku: string;
    id_producto?: string;
    color?: string;
    tipo_empaque?: string;
  } | null>(null);
  const [quickKardexMovimientos, setQuickKardexMovimientos] = useState<any[]>([]);
  const [loadingQuickKardex, setLoadingQuickKardex] = useState(false);

  // Cargar movimientos para la vista rápida de Kardex
  useEffect(() => {
    if (!quickKardexArticulo) {
      setQuickKardexMovimientos([]);
      return;
    }
    let isCancelled = false;
    setLoadingQuickKardex(true);
    inventarioApi
      .consultarKardex(quickKardexArticulo.clienteId, quickKardexArticulo.articuloId, 60)
      .then((data) => {
        if (!isCancelled) setQuickKardexMovimientos(data || []);
      })
      .catch((err) => {
        console.error('Error cargando movimientos de kardex:', err);
      })
      .finally(() => {
        if (!isCancelled) setLoadingQuickKardex(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [quickKardexArticulo]);

  const activeColFiltersCount = useMemo(() => {
    return Object.values(colFilters).filter((v) => v.trim() !== '').length;
  }, [colFilters]);

  const handleColFilterChange = (key: keyof typeof colFilters, val: string) => {
    setColFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setSelectedAbc('ALL');
    setColFilters({
      sku: '',
      cliente: '',
      pallet: '',
      ubicacion: '',
      lote: '',
    });
    setCurrentPage(1);
  };

  // 1. Filtrado base de items brutos
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Global search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchGlobal =
          item.articulo?.sku?.toLowerCase().includes(query) ||
          item.articulo?.id_producto?.toLowerCase().includes(query) ||
          item.articulo?.nombre?.toLowerCase().includes(query) ||
          item.articulo?.color?.toLowerCase().includes(query) ||
          item.pallet?.codigo_lpn?.toLowerCase().includes(query) ||
          item.lote?.numero_lote?.toLowerCase().includes(query) ||
          item.cliente?.razon_social?.toLowerCase().includes(query) ||
          item.ubicacion?.codigo_etiqueta?.toLowerCase().includes(query);
        if (!matchGlobal) return false;
      }

      // ABC Filter
      if (selectedAbc !== 'ALL' && item.articulo?.rotacion_abc !== selectedAbc) {
        return false;
      }

      // Column filters
      if (colFilters.sku.trim()) {
        const q = colFilters.sku.toLowerCase();
        const skuMatch =
          item.articulo?.sku?.toLowerCase().includes(q) ||
          item.articulo?.id_producto?.toLowerCase().includes(q) ||
          item.articulo?.nombre?.toLowerCase().includes(q);
        if (!skuMatch) return false;
      }

      if (colFilters.cliente.trim()) {
        const q = colFilters.cliente.toLowerCase();
        if (!item.cliente?.razon_social?.toLowerCase().includes(q)) return false;
      }

      if (colFilters.pallet.trim()) {
        const q = colFilters.pallet.toLowerCase();
        if (!item.pallet?.codigo_lpn?.toLowerCase().includes(q)) return false;
      }

      if (colFilters.ubicacion.trim()) {
        const q = colFilters.ubicacion.toLowerCase();
        if (!item.ubicacion?.codigo_etiqueta?.toLowerCase().includes(q)) return false;
      }

      if (colFilters.lote.trim()) {
        const q = colFilters.lote.toLowerCase();
        if (!item.lote?.numero_lote?.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [items, searchTerm, selectedAbc, colFilters]);

  // 2. Sumarización Por Artículo
  const articulosSumarizados = useMemo(() => {
    const map = new Map<string, any>();
    filteredItems.forEach((item) => {
      const artId = item.articulo_id;
      if (!artId) return;
      const key = `${artId}_${item.cliente_id || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          articulo_id: artId,
          cliente_id: item.cliente_id,
          articulo: item.articulo,
          cliente: item.cliente,
          cantidad_disponible: 0,
          cantidad_reservada: 0,
          volumen_m3: 0,
          lotesMap: new Map<string, { numero_lote: string; fecha_vencimiento?: string | null; cantidad: number }>(),
          ubicacionesSet: new Set<string>(),
          palletsSet: new Set<string>(),
          items: [],
        });
      }
      const g = map.get(key)!;
      const cantDisp = Number(item.cantidad_disponible || 0);
      const cantRes = Number(item.cantidad_reservada || 0);
      g.cantidad_disponible += cantDisp;
      g.cantidad_reservada += cantRes;
      g.stockFisico = (g.stockFisico || 0) + cantDisp + cantRes;
      g.stockFuturo = (g.stockFuturo || 0) + cantDisp;
      g.volumen_m3 += Number(item.volumen_m3 || 0);
      if (item.ubicacion?.codigo_etiqueta) g.ubicacionesSet.add(item.ubicacion.codigo_etiqueta);
      if (item.pallet?.codigo_lpn) g.palletsSet.add(item.pallet.codigo_lpn);
      if (item.lote?.numero_lote) {
        const lKey = item.lote.numero_lote;
        const curL = g.lotesMap.get(lKey) || {
          numero_lote: lKey,
          fecha_vencimiento: item.lote.fecha_vencimiento,
          cantidad: 0,
        };
        curL.cantidad += Number(item.cantidad_disponible || 0);
        g.lotesMap.set(lKey, curL);
      }
      g.items.push(item);
    });

    return Array.from(map.values()).map((g) => ({
      ...g,
      lotes: Array.from(g.lotesMap.values()),
      ubicaciones: Array.from(g.ubicacionesSet),
      pallets: Array.from(g.palletsSet),
    }));
  }, [filteredItems]);

  // 3. Sumarización Por Lote
  const lotesSumarizados = useMemo(() => {
    const map = new Map<string, any>();
    filteredItems.forEach((item) => {
      const nroLote = item.lote?.numero_lote || 'SIN_LOTE';
      const key = `${nroLote}_${item.articulo_id}_${item.cliente_id || ''}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          lote_id: item.lote_id,
          numero_lote: item.lote?.numero_lote || 'Sin Lote',
          fecha_vencimiento: item.lote?.fecha_vencimiento || null,
          articulo_id: item.articulo_id,
          cliente_id: item.cliente_id,
          articulo: item.articulo,
          cliente: item.cliente,
          cantidad_disponible: 0,
          cantidad_reservada: 0,
          stockFisico: 0,
          stockFuturo: 0,
          volumen_m3: 0,
          ubicacionesSet: new Set<string>(),
          palletsSet: new Set<string>(),
          items: [],
        });
      }
      const g = map.get(key)!;
      const cantDisp = Number(item.cantidad_disponible || 0);
      const cantRes = Number(item.cantidad_reservada || 0);
      g.cantidad_disponible += cantDisp;
      g.cantidad_reservada += cantRes;
      g.stockFisico = (g.stockFisico || 0) + cantDisp + cantRes;
      g.stockFuturo = (g.stockFuturo || 0) + cantDisp;
      g.volumen_m3 += Number(item.volumen_m3 || 0);
      if (item.ubicacion?.codigo_etiqueta) g.ubicacionesSet.add(item.ubicacion.codigo_etiqueta);
      if (item.pallet?.codigo_lpn) g.palletsSet.add(item.pallet.codigo_lpn);
      g.items.push(item);
    });

    return Array.from(map.values()).map((g) => ({
      ...g,
      ubicaciones: Array.from(g.ubicacionesSet),
      pallets: Array.from(g.palletsSet),
    }));
  }, [filteredItems]);

  // 4. Sumarización Por Cliente
  const clientesSumarizados = useMemo(() => {
    const map = new Map<string, any>();
    filteredItems.forEach((item) => {
      const cliId = item.cliente_id;
      if (!cliId) return;
      if (!map.has(cliId)) {
        map.set(cliId, {
          id: cliId,
          cliente_id: cliId,
          cliente: item.cliente,
          cantidad_disponible: 0,
          cantidad_reservada: 0,
          stockFisico: 0,
          stockFuturo: 0,
          volumen_m3: 0,
          articulosSet: new Set<string>(),
          lotesSet: new Set<string>(),
          ubicacionesSet: new Set<string>(),
          palletsSet: new Set<string>(),
          items: [],
        });
      }
      const g = map.get(cliId)!;
      const cantDisp = Number(item.cantidad_disponible || 0);
      const cantRes = Number(item.cantidad_reservada || 0);
      g.cantidad_disponible += cantDisp;
      g.cantidad_reservada += cantRes;
      g.stockFisico = (g.stockFisico || 0) + cantDisp + cantRes;
      g.stockFuturo = (g.stockFuturo || 0) + cantDisp;
      g.volumen_m3 += Number(item.volumen_m3 || 0);
      if (item.articulo_id) g.articulosSet.add(item.articulo_id);
      if (item.lote?.numero_lote) g.lotesSet.add(item.lote.numero_lote);
      if (item.ubicacion?.codigo_etiqueta) g.ubicacionesSet.add(item.ubicacion.codigo_etiqueta);
      if (item.pallet?.codigo_lpn) g.palletsSet.add(item.pallet.codigo_lpn);
      g.items.push(item);
    });

    return Array.from(map.values()).map((g) => ({
      ...g,
      articulos_count: g.articulosSet.size,
      lotes_count: g.lotesSet.size,
      ubicaciones_count: g.ubicacionesSet.size,
      pallets_count: g.palletsSet.size,
    }));
  }, [filteredItems]);

  // Registros activos según la vista seleccionada
  const activeRecords = useMemo(() => {
    switch (vistaActiva) {
      case 'articulo':
        return articulosSumarizados;
      case 'lote':
        return lotesSumarizados;
      case 'cliente':
        return clientesSumarizados;
      case 'detalle':
      default:
        return filteredItems;
    }
  }, [vistaActiva, articulosSumarizados, lotesSumarizados, clientesSumarizados, filteredItems]);

  // Cálculo de Totales de Cantidades y M3 de la vista activa de inventario
  // Regla WMS:
  // Stock Físico (En Almacén) = Cantidad Disponible + Cantidad Reservada
  // Reservados en Pedidos = Cantidad Reservada
  // Stock Futuro = Stock Físico - Reservados = Cantidad Disponible
  const totalsVista = useMemo(() => {
    let totalDisponible = 0;
    let totalReservada = 0;
    let totalVolumenM3 = 0;

    activeRecords.forEach((item: any) => {
      totalDisponible += Number(item.cantidad_disponible ?? item.cantidad ?? 0);
      totalReservada += Number(item.cantidad_reservada ?? 0);
      totalVolumenM3 += Number(item.volumen_m3 ?? 0);
    });

    const totalFisico = totalDisponible + totalReservada;
    const totalFuturo = totalDisponible; // Stock Físico - Reservados

    // Cantidad total de pallets únicos
    const palletsSet = new Set<string>();
    filteredItems.forEach((it: any) => {
      const p = it.pallet?.codigo_lpn || it.pallet_id;
      if (p) palletsSet.add(p);
    });

    return {
      totalCantidad: totalFisico,
      totalDisponible,
      totalReservada,
      totalFisico,
      totalFuturo,
      totalVolumenM3,
      totalPallets: palletsSet.size,
      totalRegistros: activeRecords.length,
    };
  }, [activeRecords, filteredItems]);

  // Totales de movimientos para la ventana modal rápida de Kardex
  // REGLA: Salidas se restan de las entradas, nunca se suman
  const quickKardexTotals = useMemo(() => {
    let totalEntradas = 0;
    let totalSalidas = 0;
    let totalVolumenM3 = 0;

    quickKardexMovimientos.forEach((m) => {
      const cant = Number(m.cantidad || 0);
      const vol = Number(m.volumen_m3 || 0);
      totalVolumenM3 += vol;

      const esEntrada =
        m.tipo_movimiento === 'recepcion' ||
        m.tipo_movimiento === 'ingreso_inicial' ||
        m.tipo_movimiento === 'ajuste_positivo' ||
        m.tipo_movimiento === 'putaway';

      const esSalida =
        m.tipo_movimiento === 'despacho' ||
        m.tipo_movimiento === 'picking' ||
        m.tipo_movimiento === 'merma' ||
        m.tipo_movimiento === 'ajuste_negativo';

      if (esEntrada) {
        totalEntradas += cant;
      } else if (esSalida) {
        totalSalidas += cant;
      }
    });

    const netoCantidad = totalEntradas - totalSalidas;

    return {
      totalEntradas,
      totalSalidas,
      totalCantidad: netoCantidad,
      netoCantidad,
      totalVolumenM3,
    };
  }, [quickKardexMovimientos]);

  // Ordenamiento dinámico
  const sortedRecords = useMemo(() => {
    return [...activeRecords].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortBy) {
        case 'volumen':
          valA = Number(a.volumen_m3 || 0);
          valB = Number(b.volumen_m3 || 0);
          break;
        case 'cantidad':
          valA = Number(a.cantidad_disponible || 0);
          valB = Number(b.cantidad_disponible || 0);
          break;
        case 'sku':
          valA = a.articulo?.sku || '';
          valB = b.articulo?.sku || '';
          break;
        case 'cliente':
          valA = a.cliente?.razon_social || '';
          valB = b.cliente?.razon_social || '';
          break;
        case 'pallet':
          valA = a.pallet?.codigo_lpn || '';
          valB = b.pallet?.codigo_lpn || '';
          break;
        case 'ubicacion':
          valA = a.ubicacion?.codigo_etiqueta || '';
          valB = b.ubicacion?.codigo_etiqueta || '';
          break;
        case 'lote':
          valA = a.numero_lote || a.lote?.numero_lote || '';
          valB = b.numero_lote || b.lote?.numero_lote || '';
          break;
        case 'articulos_count':
          valA = Number(a.articulos_count || 0);
          valB = Number(b.articulos_count || 0);
          break;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [activeRecords, sortBy, sortAsc]);

  // Paginación
  const totalPages = Math.ceil(sortedRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const maxM3 = useMemo(() => {
    return Math.max(...activeRecords.map((i) => Number(i.volumen_m3 || 0)), 1);
  }, [activeRecords]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  const hasAnyFilter = Boolean(searchTerm.trim() || selectedAbc !== 'ALL' || activeColFiltersCount > 0);

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'recepcion':
      case 'ingreso_inicial':
        return <Badge variant="success" dot pulse>Entrada / Recepción</Badge>;
      case 'putaway':
        return <Badge variant="success" dot pulse>Entrada / Putaway</Badge>;
      case 'picking':
        return <Badge variant="warning" dot>Picking / Reserva</Badge>;
      case 'despacho':
        return <Badge variant="danger" dot>Salida / Despacho</Badge>;
      case 'ajuste_positivo':
        return <Badge variant="info" dot>Ajuste (+)</Badge>;
      case 'ajuste_negativo':
        return <Badge variant="danger" dot>Ajuste (-)</Badge>;
      default:
        return <Badge variant="default">{tipo}</Badge>;
    }
  };

  return (
    <>
      <TableContainer glow={Boolean(selectedItem)}>
        {/* Selector Superior de Vistas de Inventario */}
        <div className="flex items-center gap-1.5 p-2 bg-slate-100/90 dark:bg-[#141313] border-b border-slate-200 dark:border-[#333333] px-3.5 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#978d9d] uppercase tracking-wider mr-1.5 shrink-0 flex items-center gap-1">
            <Boxes className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
            <span>Modo de Stock:</span>
          </span>

          <button
            type="button"
            onClick={() => {
              setVistaActiva('articulo');
              setSortBy('cantidad');
              setSortAsc(false);
              setCurrentPage(1);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              vistaActiva === 'articulo'
                ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] shadow-xs font-bold'
                : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-200/70 dark:hover:bg-[#201f1f]'
            )}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Sumarizado por Artículo</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5',
                vistaActiva === 'articulo' ? 'bg-white/20 text-white dark:bg-[#460283]/20 dark:text-[#460283]' : 'bg-slate-200 dark:bg-[#252424] text-slate-700 dark:text-[#cdc3d4]'
              )}
            >
              {articulosSumarizados.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setVistaActiva('lote');
              setSortBy('cantidad');
              setSortAsc(false);
              setCurrentPage(1);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              vistaActiva === 'lote'
                ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] shadow-xs font-bold'
                : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-200/70 dark:hover:bg-[#201f1f]'
            )}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>Sumarizado por Lote</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5',
                vistaActiva === 'lote' ? 'bg-white/20 text-white dark:bg-[#460283]/20 dark:text-[#460283]' : 'bg-slate-200 dark:bg-[#252424] text-slate-700 dark:text-[#cdc3d4]'
              )}
            >
              {lotesSumarizados.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setVistaActiva('cliente');
              setSortBy('cantidad');
              setSortAsc(false);
              setCurrentPage(1);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              vistaActiva === 'cliente'
                ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] shadow-xs font-bold'
                : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-200/70 dark:hover:bg-[#201f1f]'
            )}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Sumarizado por Cliente</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5',
                vistaActiva === 'cliente' ? 'bg-white/20 text-white dark:bg-[#460283]/20 dark:text-[#460283]' : 'bg-slate-200 dark:bg-[#252424] text-slate-700 dark:text-[#cdc3d4]'
              )}
            >
              {clientesSumarizados.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setVistaActiva('detalle');
              setSortBy('volumen');
              setSortAsc(false);
              setCurrentPage(1);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
              vistaActiva === 'detalle'
                ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] shadow-xs font-bold'
                : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-200/70 dark:hover:bg-[#201f1f]'
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Detalle (Pallet / Ubicación)</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5',
                vistaActiva === 'detalle' ? 'bg-white/20 text-white dark:bg-[#460283]/20 dark:text-[#460283]' : 'bg-slate-200 dark:bg-[#252424] text-slate-700 dark:text-[#cdc3d4]'
              )}
            >
              {filteredItems.length}
            </span>
          </button>
        </div>

        {/* Table Toolbar */}
        <div className="p-3.5 border-b border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1a1919] flex flex-wrap items-center justify-between gap-3">
          {/* Search Input & Filter Toggle */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 dark:text-[#978d9d] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  vistaActiva === 'cliente'
                    ? 'Buscar cliente 3PL o unidad de negocio...'
                    : vistaActiva === 'lote'
                    ? 'Buscar número de lote, SKU, artículo o cliente...'
                    : 'Buscar SKU, ID_Producto, Nombre, Lote o Cliente...'
                }
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] placeholder-slate-400 dark:placeholder-[#978d9d] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] focus:ring-1 focus:ring-violet-500/20 dark:focus:ring-[#dab9ff]/30 transition-all shadow-xs"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-[#978d9d] dark:hover:text-[#e5e2e1] p-0.5 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {vistaActiva === 'detalle' && (
              <button
                type="button"
                onClick={() => setShowColFilters(!showColFilters)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors shadow-xs',
                  showColFilters || activeColFiltersCount > 0
                    ? 'border-violet-300 dark:border-[#dab9ff]/50 bg-violet-50 dark:bg-[#28153c] text-violet-700 dark:text-[#dab9ff]'
                    : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:border-slate-300 dark:hover:border-[#4b4452]'
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
            )}

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

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Rotacion ABC filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#131313] p-1 rounded-lg border border-slate-200 dark:border-[#333333] text-xs shadow-xs">
              <span className="text-slate-600 dark:text-[#cdc3d4] text-[11px] px-1 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
                ABC:
              </span>
              {['ALL', 'A', 'B', 'C'].map((abc) => {
                const isSelected = selectedAbc === abc;
                return (
                  <button
                    key={abc}
                    onClick={() => {
                      setSelectedAbc(abc);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'relative px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors',
                      isSelected
                        ? 'bg-violet-600 dark:bg-[#dab9ff] text-white dark:text-[#460283] shadow-xs'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-white dark:hover:bg-[#201f1f]'
                    )}
                  >
                    <span>{abc === 'ALL' ? 'Todos' : abc}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono px-2 hidden sm:block">
              <span className="text-violet-600 dark:text-[#dab9ff] font-bold">{sortedRecords.length}</span>
              {sortedRecords.length !== activeRecords.length && (
                <span className="text-slate-400 dark:text-[#978d9d]"> de {activeRecords.length}</span>
              )}{' '}
              {vistaActiva === 'articulo'
                ? 'artículos'
                : vistaActiva === 'lote'
                ? 'lotes'
                : vistaActiva === 'cliente'
                ? 'clientes'
                : 'registros'}
            </div>
          </div>
        </div>

        {/* Barra de Totales de la Vista de Inventario */}
        <div className="px-3.5 py-2.5 bg-slate-50/95 dark:bg-[#141414] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#978d9d] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
              <span>Totales ({vistaActiva === 'articulo' ? 'Artículos' : vistaActiva === 'lote' ? 'Lotes' : vistaActiva === 'cliente' ? 'Clientes' : 'Detalle'}):</span>
            </span>

            {/* HERO 1: Stock Total (Cantidades) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-[#0c243a] border border-sky-300 dark:border-sky-700/60 shadow-xs">
              <Package className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
              <div>
                <span className="text-[9px] text-sky-700 dark:text-[#75d1ff]/80 uppercase font-bold block leading-none">Stock Total</span>
                <span className="font-mono font-extrabold text-sm text-sky-900 dark:text-[#75d1ff]">
                  {formatNumber(totalsVista.totalFisico, 0)} <span className="text-[10px] font-semibold">un.</span>
                </span>
              </div>
            </div>

            {/* HERO 2: Volumen Total M³ */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-[#25153a] border border-violet-300 dark:border-violet-700/60 shadow-xs">
              <Layers className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
              <div>
                <span className="text-[9px] text-violet-700 dark:text-[#dab9ff]/80 uppercase font-bold block leading-none">Volumen Total</span>
                <span className="font-mono font-extrabold text-sm text-violet-900 dark:text-[#dab9ff]">
                  {formatM3(totalsVista.totalVolumenM3)}
                </span>
              </div>
            </div>

            {/* SECUNDARIO 1: Cantidad de Pallets */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] shadow-xs">
              <Boxes className="w-3.5 h-3.5 text-slate-500 dark:text-[#cdc3d4]" />
              <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">Pallets:</span>
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                {totalsVista.totalPallets}
              </span>
            </div>

            {/* SECUNDARIO 2: Stock Futuro */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121111] border border-slate-200 dark:border-[#333333] shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">Stock Futuro:</span>
              <span className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-400">
                {formatNumber(totalsVista.totalFuturo, 0)} un.
              </span>
            </div>

            {/* SECUNDARIO 3: Reservados en Pedidos (si > 0) */}
            {totalsVista.totalReservada > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-[#2b1f09] border border-amber-200 dark:border-[#854d0e] shadow-xs">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-[#eab308]" />
                <span className="text-[11px] text-amber-800 dark:text-[#fef08a]">Reservados:</span>
                <span className="font-mono font-bold text-xs text-amber-700 dark:text-[#eab308]">
                  {formatNumber(totalsVista.totalReservada, 0)} un.
                </span>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-500 dark:text-[#978d9d] font-mono flex items-center gap-2">
            <span>
              Mostrando <strong className="text-slate-900 dark:text-[#e5e2e1]">{paginatedRecords.length}</strong> de{' '}
              <strong className="text-violet-600 dark:text-[#dab9ff]">{activeRecords.length}</strong> {vistaActiva === 'articulo' ? 'artículos' : vistaActiva === 'lote' ? 'lotes' : vistaActiva === 'cliente' ? 'clientes' : 'posiciones'}
            </span>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100/95 dark:bg-[#1c1b1b] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a] select-none z-10 shadow-xs">
              {vistaActiva === 'articulo' && (
                <tr>
                  <SortableHeaderCell
                    label="Artículo & SKU / ID_Producto"
                    field="sku"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHeaderCell
                    label="Cliente 3PL"
                    field="cliente"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4]">Lotes Activos</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4]">Ubicaciones & Pallets</th>
                  <SortableHeaderCell
                    label="Cantidad"
                    field="cantidad"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeaderCell
                    label="Volumen Total (m³)"
                    field="volumen"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    align="right"
                    className="min-w-[140px]"
                  />
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4] text-center w-28">Acciones</th>
                </tr>
              )}

              {vistaActiva === 'lote' && (
                <tr>
                  <SortableHeaderCell
                    label="Lote / Vencimiento"
                    field="lote"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHeaderCell
                    label="Artículo & SKU"
                    field="sku"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHeaderCell
                    label="Cliente 3PL"
                    field="cliente"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4]">Posiciones / Pallets</th>
                  <SortableHeaderCell
                    label="Cantidad"
                    field="cantidad"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeaderCell
                    label="Volumen (m³)"
                    field="volumen"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    align="right"
                    className="min-w-[140px]"
                  />
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4] text-center w-28">Acciones</th>
                </tr>
              )}

              {vistaActiva === 'cliente' && (
                <tr>
                  <SortableHeaderCell
                    label="Cliente 3PL"
                    field="cliente"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHeaderCell
                    label="Artículos Únicos"
                    field="articulos_count"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                  />
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4]">Lotes Activos</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-[#cdc3d4]">Ocupación Física</th>
                  <SortableHeaderCell
                    label="Cantidad"
                    field="cantidad"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortableHeaderCell
                    label="Volumen Ocupado (m³)"
                    field="volumen"
                    currentSortField={sortBy}
                    sortAsc={sortAsc}
                    onSort={toggleSort}
                    align="right"
                    className="min-w-[150px]"
                  />
                </tr>
              )}

              {vistaActiva === 'detalle' && (
                <>
                  <tr>
                    <SortableHeaderCell
                      label="Artículo & SKU"
                      field="sku"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                    />
                    <SortableHeaderCell
                      label="Cliente 3PL"
                      field="cliente"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                    />
                    <SortableHeaderCell
                      label="Pallet LPN"
                      field="pallet"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                    />
                    <SortableHeaderCell
                      label="Ubicación"
                      field="ubicacion"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                    />
                    <SortableHeaderCell
                      label="Lote / Vto"
                      field="lote"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                    />
                    <SortableHeaderCell
                      label="Cantidad"
                      field="cantidad"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortableHeaderCell
                      label="Volumen (m³)"
                      field="volumen"
                      currentSortField={sortBy}
                      sortAsc={sortAsc}
                      onSort={toggleSort}
                      align="right"
                      className="min-w-[150px]"
                    />
                  </tr>

                  {/* Column Filters Subheader Row */}
                  {showColFilters && (
                    <tr className="bg-slate-50/95 dark:bg-[#161515] border-b border-slate-200 dark:border-[#333333]">
                      <th className="py-1.5 px-2">
                        <ColumnFilterInput
                          value={colFilters.sku}
                          onChange={(val) => handleColFilterChange('sku', val)}
                          placeholder="Filtrar SKU / nombre..."
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
                          value={colFilters.pallet}
                          onChange={(val) => handleColFilterChange('pallet', val)}
                          placeholder="Filtrar LPN..."
                        />
                      </th>
                      <th className="py-1.5 px-2">
                        <ColumnFilterInput
                          value={colFilters.ubicacion}
                          onChange={(val) => handleColFilterChange('ubicacion', val)}
                          placeholder="Filtrar posición..."
                        />
                      </th>
                      <th className="py-1.5 px-2">
                        <ColumnFilterInput
                          value={colFilters.lote}
                          onChange={(val) => handleColFilterChange('lote', val)}
                          placeholder="Filtrar lote..."
                        />
                      </th>
                      <th className="py-1.5 px-2" />
                      <th className="py-1.5 px-2" />
                    </tr>
                  )}
                </>
              )}
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-[#44424a]">
              {isLoading ? (
                <TableSkeleton columns={7} rows={6} />
              ) : paginatedRecords.length === 0 ? (
                <TableEmptyState
                  colSpan={7}
                  title="No se encontraron artículos en inventario"
                  description={
                    searchTerm || selectedAbc !== 'ALL'
                      ? 'No hay registros coincidentes con los filtros aplicados'
                      : 'Registra nuevas recepciones en Inbound para incorporar stock al depósito'
                  }
                />
              ) : (
                <AnimatePresence mode="popLayout">
                  {/* --- 1. RENDER VISTA POR ARTÍCULO --- */}
                  {vistaActiva === 'articulo' &&
                    paginatedRecords.map((item, idx) => {
                      const m3Ratio = Math.min(100, (Number(item.volumen_m3 || 0) / maxM3) * 100);

                      return (
                        <AnimatedTableRow
                          key={item.id}
                          index={idx}
                          isClickable={true}
                          onClick={() => {
                            if (item.items && item.items.length > 0) {
                              onSelectItem(item.items[0]);
                            }
                          }}
                        >
                          {/* Artículo */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#dab9ff] shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold text-xs text-[#e5e2e1] group-hover:text-[#dab9ff] transition-colors truncate">
                                  {item.articulo?.nombre || 'Artículo sin nombre'}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#cdc3d4] flex-wrap mt-0.5">
                                  <span className="font-bold text-[#dab9ff]">SKU: {item.articulo?.sku || '-'}</span>
                                  {item.articulo?.id_producto && item.articulo.id_producto !== item.articulo.sku && (
                                    <span className="text-[#978d9d]">(ID: {item.articulo.id_producto})</span>
                                  )}
                                  {item.articulo?.color && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#252424] text-[#cdc3d4] border border-[#333333]">
                                      {item.articulo.color}
                                    </span>
                                  )}
                                  {item.articulo?.tipo_empaque && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#1a1919] text-[#75d1ff] border border-[#75d1ff]/30">
                                      {item.articulo.tipo_empaque}
                                    </span>
                                  )}
                                  {item.articulo?.rotacion_abc && (
                                    <span className="px-1 py-0.1 rounded text-[9px] bg-[#252424] border border-[#333333] font-bold text-[#dab9ff]">
                                      {item.articulo.rotacion_abc}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Cliente */}
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-xs text-[#e5e2e1] truncate max-w-[130px]">
                              {item.cliente?.razon_social || '-'}
                            </div>
                            <span className="text-[10px] text-[#978d9d] font-mono block">
                              {item.cliente?.unidad_negocio || '3PL'}
                            </span>
                          </td>

                          {/* Lotes */}
                          <td className="py-2.5 px-3">
                            {item.lotes && item.lotes.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[180px]">
                                {item.lotes.slice(0, 2).map((l: any, lIdx: number) => (
                                  <span
                                    key={lIdx}
                                    className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-[#201330] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#dab9ff]/30"
                                    title={`Vto: ${l.fecha_vencimiento ? formatDate(l.fecha_vencimiento) : 'N/A'}`}
                                  >
                                    <Tags className="w-2.5 h-2.5" />
                                    <span>{l.numero_lote} ({l.cantidad})</span>
                                  </span>
                                ))}
                                {item.lotes.length > 2 && (
                                  <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono self-center">
                                    +{item.lotes.length - 2} más
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-[#978d9d] text-[10px] italic">Sin lote</span>
                            )}
                          </td>

                          {/* Ubicaciones y Pallets */}
                          <td className="py-2.5 px-3 font-mono text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 dark:bg-[#75d1ff]/10 border border-sky-200 dark:border-[#75d1ff]/30 text-sky-700 dark:text-[#75d1ff] text-[10px] font-bold">
                                <MapPin className="w-2.5 h-2.5" />
                                <span>{item.ubicaciones?.length || 0} pos.</span>
                              </span>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 dark:bg-[#dab9ff]/10 border border-violet-200 dark:border-[#dab9ff]/30 text-violet-700 dark:text-[#dab9ff] text-[10px] font-bold">
                                <Barcode className="w-2.5 h-2.5" />
                                <span>{item.pallets?.length || 0} LPN</span>
                              </span>
                            </div>
                          </td>

                          {/* Cantidad Total de Stock y datos secundarios */}
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div className="font-extrabold text-sm text-slate-900 dark:text-[#e5e2e1]">
                              {formatNumber(item.stockFisico ?? (Number(item.cantidad_disponible || 0) + Number(item.cantidad_reservada || 0)), 0)}{' '}
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-[#978d9d]">un.</span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 text-[10px] mt-0.5 text-slate-500 dark:text-[#cdc3d4]">
                              <span>Futuro: {formatNumber(item.stockFuturo ?? item.cantidad_disponible ?? 0, 0)}</span>
                              {Number(item.cantidad_reservada || 0) > 0 && (
                                <span className="text-amber-600 dark:text-[#eab308] font-bold">
                                  • Res: {formatNumber(item.cantidad_reservada, 0)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Volumen M3 con barra */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] tabular-nums text-xs">
                              {formatM3(item.volumen_m3 || 0)}
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-[#252424] h-1.5 rounded-full overflow-hidden mt-1 border border-slate-200 dark:border-[#333333]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(5, m3Ratio)}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 dark:from-[#bb86fc] dark:to-[#dab9ff] rounded-full"
                              />
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickKardexArticulo({
                                    articuloId: item.articulo_id,
                                    clienteId: item.cliente_id,
                                    nombre: item.articulo?.nombre || 'Artículo',
                                    sku: item.articulo?.sku || 'SKU',
                                    id_producto: item.articulo?.id_producto,
                                    color: item.articulo?.color,
                                    tipo_empaque: item.articulo?.tipo_empaque,
                                  });
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 hover:bg-violet-100 dark:bg-[#201330] dark:hover:bg-[#2d1a45] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#dab9ff]/40 transition-colors shadow-xs"
                                title="Ver vista rápida de movimientos Kardex de este artículo"
                              >
                                <History className="w-3 h-3" />
                                <span>Kardex</span>
                              </button>
                            </div>
                          </td>
                        </AnimatedTableRow>
                      );
                    })}

                  {/* --- 2. RENDER VISTA POR LOTE --- */}
                  {vistaActiva === 'lote' &&
                    paginatedRecords.map((item, idx) => {
                      const m3Ratio = Math.min(100, (Number(item.volumen_m3 || 0) / maxM3) * 100);

                      return (
                        <AnimatedTableRow
                          key={item.id}
                          index={idx}
                          isClickable={true}
                          onClick={() => {
                            if (item.items && item.items.length > 0) {
                              onSelectItem(item.items[0]);
                            }
                          }}
                        >
                          {/* Lote / Vto */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Tags className="w-3.5 h-3.5 text-[#dab9ff] shrink-0" />
                              <div>
                                <span className="font-mono font-bold text-xs text-[#dab9ff]">
                                  {item.numero_lote}
                                </span>
                                {item.fecha_vencimiento ? (
                                  <span className="text-[10px] text-[#cdc3d4] block">
                                    Vto: {formatDate(item.fecha_vencimiento)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-[#978d9d] block">Sin vto.</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Artículo */}
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-xs text-[#e5e2e1] truncate max-w-[200px]">
                              {item.articulo?.nombre || 'Artículo'}
                            </div>
                            <span className="font-mono text-[10px] text-[#cdc3d4]">
                              SKU: {item.articulo?.sku || '-'}
                            </span>
                          </td>

                          {/* Cliente */}
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-xs text-[#e5e2e1] truncate max-w-[130px]">
                              {item.cliente?.razon_social || '-'}
                            </div>
                          </td>

                          {/* Posiciones y Pallets */}
                          <td className="py-2.5 px-3 font-mono text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#75d1ff]/10 border border-[#75d1ff]/30 text-[#75d1ff] text-[10px]">
                                <MapPin className="w-2.5 h-2.5" />
                                <span>{item.ubicaciones?.length || 0} pos.</span>
                              </span>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#dab9ff]/10 border border-[#dab9ff]/30 text-[#dab9ff] text-[10px]">
                                <Barcode className="w-2.5 h-2.5" />
                                <span>{item.pallets?.length || 0} LPN</span>
                              </span>
                            </div>
                          </td>

                          {/* Cantidad Total de Stock y datos secundarios */}
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div className="font-extrabold text-sm text-slate-900 dark:text-[#e5e2e1]">
                              {formatNumber(item.stockFisico ?? (Number(item.cantidad_disponible || 0) + Number(item.cantidad_reservada || 0)), 0)}{' '}
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-[#978d9d]">un.</span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 text-[10px] mt-0.5 text-slate-500 dark:text-[#cdc3d4]">
                              <span>Futuro: {formatNumber(item.stockFuturo ?? item.cantidad_disponible ?? 0, 0)}</span>
                              {Number(item.cantidad_reservada || 0) > 0 && (
                                <span className="text-amber-600 dark:text-[#eab308] font-bold">
                                  • Res: {formatNumber(item.cantidad_reservada, 0)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Volumen */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="font-mono font-bold text-[#dab9ff] tabular-nums text-xs">
                              {formatM3(item.volumen_m3 || 0)}
                            </div>
                            <div className="w-full bg-[#252424] h-1.5 rounded-full overflow-hidden mt-1 border border-[#333333]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(5, m3Ratio)}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                className="h-full bg-gradient-to-r from-[#bb86fc] to-[#dab9ff] rounded-full"
                              />
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickKardexArticulo({
                                  articuloId: item.articulo_id,
                                  clienteId: item.cliente_id,
                                  nombre: item.articulo?.nombre || 'Artículo',
                                  sku: item.articulo?.sku || 'SKU',
                                  id_producto: item.articulo?.id_producto,
                                  color: item.articulo?.color,
                                  tipo_empaque: item.articulo?.tipo_empaque,
                                });
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-50 hover:bg-violet-100 dark:bg-[#201330] dark:hover:bg-[#2d1a45] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#dab9ff]/40 transition-colors shadow-xs"
                              title="Ver movimientos Kardex de este artículo y lote"
                            >
                              <History className="w-3 h-3" />
                              <span>Kardex</span>
                            </button>
                          </td>
                        </AnimatedTableRow>
                      );
                    })}

                  {/* --- 3. RENDER VISTA POR CLIENTE --- */}
                  {vistaActiva === 'cliente' &&
                    paginatedRecords.map((item, idx) => {
                      const m3Ratio = Math.min(100, (Number(item.volumen_m3 || 0) / maxM3) * 100);

                      return (
                        <AnimatedTableRow key={item.id} index={idx} isClickable={false}>
                          {/* Cliente */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-[#dab9ff] shrink-0" />
                              <div>
                                <div className="font-bold text-xs text-[#e5e2e1]">
                                  {item.cliente?.razon_social || 'Cliente'}
                                </div>
                                <span className="text-[10px] text-[#978d9d] font-mono">
                                  {item.cliente?.unidad_negocio || '3PL'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Artículos Únicos */}
                          <td className="py-2.5 px-3 font-mono font-bold text-xs text-slate-900 dark:text-[#e5e2e1]">
                            <span className="px-2 py-0.5 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-violet-700 dark:text-[#dab9ff]">
                              {item.articulos_count} SKUs
                            </span>
                          </td>

                          {/* Lotes Activos */}
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-600 dark:text-[#cdc3d4]">
                            <span className="px-2 py-0.5 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                              {item.lotes_count} Lotes
                            </span>
                          </td>

                          {/* Ocupación */}
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-600 dark:text-[#cdc3d4]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-violet-700 dark:text-[#dab9ff] font-bold">{item.pallets_count} LPNs</span>
                              <span>en</span>
                              <span className="text-sky-700 dark:text-[#75d1ff] font-bold">{item.ubicaciones_count} Racks</span>
                            </div>
                          </td>

                          {/* Cantidad Total de Stock y datos secundarios */}
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div className="font-extrabold text-sm text-slate-900 dark:text-[#e5e2e1]">
                              {formatNumber(item.stockFisico ?? (Number(item.cantidad_disponible || 0) + Number(item.cantidad_reservada || 0)), 0)}{' '}
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-[#978d9d]">un.</span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 text-[10px] mt-0.5 text-slate-500 dark:text-[#cdc3d4]">
                              <span>Futuro: {formatNumber(item.stockFuturo ?? item.cantidad_disponible ?? 0, 0)}</span>
                              {Number(item.cantidad_reservada || 0) > 0 && (
                                <span className="text-amber-600 dark:text-[#eab308] font-bold">
                                  • Res: {formatNumber(item.cantidad_reservada, 0)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Volumen */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="font-mono font-bold text-[#dab9ff] tabular-nums text-xs">
                              {formatM3(item.volumen_m3 || 0)}
                            </div>
                            <div className="w-full bg-[#252424] h-1.5 rounded-full overflow-hidden mt-1 border border-[#333333]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(5, m3Ratio)}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                className="h-full bg-gradient-to-r from-[#bb86fc] to-[#dab9ff] rounded-full"
                              />
                            </div>
                          </td>
                        </AnimatedTableRow>
                      );
                    })}

                  {/* --- 4. RENDER VISTA DETALLADA (PALLET / UBICACIÓN) --- */}
                  {vistaActiva === 'detalle' &&
                    paginatedRecords.map((item, idx) => {
                      const isSelected = selectedItem?.id === item.id;
                      const m3Ratio = Math.min(100, (Number(item.volumen_m3 || 0) / maxM3) * 100);

                      return (
                        <AnimatedTableRow
                          key={item.id}
                          index={idx}
                          isSelected={isSelected}
                          onClick={() => onSelectItem(item)}
                        >
                          {/* Artículo */}
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'w-2 h-2 rounded-full shrink-0 transition-transform',
                                  isSelected ? 'bg-[#dab9ff] scale-125 shadow-sm shadow-[#dab9ff]' : 'bg-[#75d1ff]'
                                )}
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-xs text-[#e5e2e1] group-hover:text-[#dab9ff] transition-colors truncate">
                                  {item.articulo?.nombre || 'Artículo sin nombre'}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#cdc3d4]">
                                  <span>SKU: {item.articulo?.sku || '-'}</span>
                                  {item.articulo?.rotacion_abc && (
                                    <span className="px-1 py-0.1 rounded text-[9px] bg-[#252424] border border-[#333333] font-bold text-[#dab9ff]">
                                      {item.articulo.rotacion_abc}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Cliente */}
                          <td className="py-2 px-3">
                            <div className="font-medium text-xs text-[#e5e2e1] truncate max-w-[130px]">
                              {item.cliente?.razon_social || '-'}
                            </div>
                            <span className="text-[10px] text-[#978d9d] font-mono block">
                              {item.cliente?.unidad_negocio || '3PL'}
                            </span>
                          </td>

                          {/* Pallet LPN */}
                          <td className="py-2 px-3 font-mono">
                            {item.pallet?.codigo_lpn ? (
                              <div className="inline-flex items-center gap-1 text-[#dab9ff] font-bold text-[11px] px-1.5 py-0.5 rounded bg-[#dab9ff]/10 border border-[#dab9ff]/20">
                                <Barcode className="w-3 h-3" />
                                <span>{item.pallet.codigo_lpn}</span>
                              </div>
                            ) : (
                              <span className="text-[#978d9d] text-[10px] italic">Sin pallet</span>
                            )}
                          </td>

                          {/* Ubicación */}
                          <td className="py-2 px-3 font-mono">
                            <div className="inline-flex items-center gap-1 text-[#75d1ff] font-bold text-[11px] px-1.5 py-0.5 rounded bg-[#75d1ff]/10 border border-[#75d1ff]/20">
                              <MapPin className="w-3 h-3 text-[#75d1ff]" />
                              <span>{item.ubicacion?.codigo_etiqueta || 'S/A'}</span>
                            </div>
                          </td>

                          {/* Lote / Vto */}
                          <td className="py-2 px-3">
                            <div className="font-mono text-[11px] text-[#e5e2e1] font-semibold">
                              {item.lote?.numero_lote || '-'}
                            </div>
                            <span className="text-[10px] text-[#978d9d] block">
                              {formatDate(item.lote?.fecha_vencimiento)}
                            </span>
                          </td>

                          {/* Cantidad Total de Stock y datos secundarios */}
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-xs">
                            <div className="font-extrabold text-sm text-slate-900 dark:text-[#e5e2e1]">
                              {formatNumber(Number(item.cantidad_disponible || 0) + Number(item.cantidad_reservada || 0), 0)}{' '}
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-[#978d9d]">un.</span>
                            </div>
                            <div className="flex items-center justify-end gap-1 text-[10px] mt-0.5 text-slate-500 dark:text-[#cdc3d4]">
                              <span>Futuro: {formatNumber(item.cantidad_disponible || 0, 0)}</span>
                              {Number(item.cantidad_reservada || 0) > 0 && (
                                <span className="text-amber-600 dark:text-[#eab308] font-bold">
                                  • Res: {formatNumber(item.cantidad_reservada, 0)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Volumen M3 con barra animada */}
                          <td className="py-2 px-3 text-right">
                            <div className="font-mono font-bold text-[#dab9ff] tabular-nums text-xs">
                              {formatM3(item.volumen_m3 || 0)}
                            </div>
                            <div className="w-full bg-[#252424] h-1 rounded-full overflow-hidden mt-1 border border-[#333333]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(5, m3Ratio)}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                className="h-full bg-gradient-to-r from-[#bb86fc] to-[#dab9ff] rounded-full"
                              />
                            </div>
                          </td>
                        </AnimatedTableRow>
                      );
                    })}
                </AnimatePresence>
              )}
            </tbody>

            {activeRecords.length > 0 && !isLoading && (
              <tfoot className="bg-slate-100/95 dark:bg-[#181717] border-t-2 border-slate-200 dark:border-[#44424a] text-xs font-semibold text-slate-800 dark:text-[#e5e2e1] sticky bottom-0 z-10 shadow-xs dark:shadow-lg backdrop-blur-xs">
                {vistaActiva === 'articulo' && (
                  <tr>
                    <td colSpan={4} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider font-extrabold text-violet-700 dark:text-[#dab9ff]">
                          TOTALES POR ARTÍCULO
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono">
                          ({totalsVista.totalRegistros} artículos)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Stock Total</div>
                      <span className="text-sm font-extrabold text-sky-700 dark:text-[#75d1ff] tabular-nums">
                        {formatNumber(totalsVista.totalCantidad, 0)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Volumen Total</div>
                      <span className="text-sm font-extrabold text-violet-700 dark:text-[#dab9ff] tabular-nums">
                        {formatM3(totalsVista.totalVolumenM3)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3" />
                  </tr>
                )}

                {vistaActiva === 'lote' && (
                  <tr>
                    <td colSpan={4} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider font-extrabold text-violet-700 dark:text-[#dab9ff]">
                          TOTALES POR LOTE
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono">
                          ({totalsVista.totalRegistros} lotes)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Stock en Lotes</div>
                      <span className="text-sm font-extrabold text-sky-700 dark:text-[#75d1ff] tabular-nums">
                        {formatNumber(totalsVista.totalCantidad, 0)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Volumen Total</div>
                      <span className="text-sm font-extrabold text-violet-700 dark:text-[#dab9ff] tabular-nums">
                        {formatM3(totalsVista.totalVolumenM3)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3" />
                  </tr>
                )}

                {vistaActiva === 'cliente' && (
                  <tr>
                    <td colSpan={4} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider font-extrabold text-violet-700 dark:text-[#dab9ff]">
                          TOTALES POR CLIENTE
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono">
                          ({totalsVista.totalRegistros} clientes)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Stock Total</div>
                      <span className="text-sm font-extrabold text-sky-700 dark:text-[#75d1ff] tabular-nums">
                        {formatNumber(totalsVista.totalCantidad, 0)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Volumen Ocupado</div>
                      <span className="text-sm font-extrabold text-violet-700 dark:text-[#dab9ff] tabular-nums">
                        {formatM3(totalsVista.totalVolumenM3)}
                      </span>
                    </td>
                  </tr>
                )}

                {vistaActiva === 'detalle' && (
                  <tr>
                    <td colSpan={5} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider font-extrabold text-violet-700 dark:text-[#dab9ff]">
                          TOTALES DETALLE POSICIONES
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono">
                          ({totalsVista.totalRegistros} posiciones)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Cantidad Total</div>
                      <span className="text-sm font-extrabold text-sky-700 dark:text-[#75d1ff] tabular-nums">
                        {formatNumber(totalsVista.totalCantidad, 0)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-xs">
                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal uppercase">Volumen Total</div>
                      <span className="text-sm font-extrabold text-violet-700 dark:text-[#dab9ff] tabular-nums">
                        {formatM3(totalsVista.totalVolumenM3)}
                      </span>
                    </td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination Footer */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={sortedRecords.length}
          itemsPerPage={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          onPageChange={setCurrentPage}
        />
      </TableContainer>

      {/* Modal de Vista Rápida de Movimientos Kardex de un Producto */}
      {quickKardexArticulo && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-xs animate-fadeIn">
            <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#dab9ff]/40 rounded-xl shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1]">
              {/* Header Modal */}
              <div className="p-4 bg-slate-50 dark:bg-[#201330] border-b border-slate-200 dark:border-[#dab9ff]/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-violet-100 dark:bg-[#dab9ff]/20 text-violet-700 dark:text-[#dab9ff]">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-violet-700 dark:text-[#dab9ff]">
                        Movimientos de Kardex
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-100 text-violet-700 dark:bg-[#dab9ff]/20 dark:text-[#dab9ff] font-bold">
                        SKU: {quickKardexArticulo.sku}
                      </span>
                      {quickKardexArticulo.id_producto && quickKardexArticulo.id_producto !== quickKardexArticulo.sku && (
                        <span className="text-[10px] font-mono text-slate-500 dark:text-[#cdc3d4]">
                          (ID: {quickKardexArticulo.id_producto})
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] mt-0.5">
                      {quickKardexArticulo.nombre}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onViewKardex && (
                    <button
                      type="button"
                      onClick={() => {
                        onViewKardex(quickKardexArticulo.clienteId || '', quickKardexArticulo.articuloId);
                        setQuickKardexArticulo(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 dark:bg-[#dab9ff] hover:bg-violet-700 dark:hover:bg-[#eedbff] text-white dark:text-[#460283] transition-colors shadow-xs"
                      title="Abrir este producto en la pantalla completa de Kardex con filtros y exportación"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Kardex Completo</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setQuickKardexArticulo(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body: Tabla de movimientos */}
              <div className="p-4 overflow-y-auto max-h-[65vh]">
                {loadingQuickKardex ? (
                  <div className="py-12 text-center text-xs text-slate-500 dark:text-[#cdc3d4]">
                    <div className="animate-spin w-6 h-6 border-2 border-violet-600 dark:border-[#dab9ff] border-t-transparent rounded-full mx-auto mb-2" />
                    Cargando trazabilidad y movimientos de este producto...
                  </div>
                ) : quickKardexMovimientos.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 dark:text-[#cdc3d4] text-xs">
                    <History className="w-8 h-8 text-slate-400 dark:text-[#978d9d] mx-auto mb-2 opacity-50" />
                    No se registran movimientos históricos para este artículo en el Kardex.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#333333]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-[#161515] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333]">
                        <tr>
                          <th className="py-2 px-3 font-semibold">Fecha / Hora</th>
                          <th className="py-2 px-3 font-semibold">Tipo Movimiento</th>
                          <th className="py-2 px-3 font-semibold">Lote / Vencimiento</th>
                          <th className="py-2 px-3 font-semibold">Origen → Destino</th>
                          <th className="py-2 px-3 font-semibold text-right">Cantidad</th>
                          <th className="py-2 px-3 font-semibold text-right">Volumen (m³)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-[#333333] bg-white dark:bg-[#1a1919]">
                        {quickKardexMovimientos.map((m) => {
                          const esEntrada =
                            m.tipo_movimiento === 'recepcion' ||
                            m.tipo_movimiento === 'ingreso_inicial' ||
                            m.tipo_movimiento === 'ajuste_positivo' ||
                            m.tipo_movimiento === 'putaway';

                          const esSalida =
                            m.tipo_movimiento === 'despacho' ||
                            m.tipo_movimiento === 'picking' ||
                            m.tipo_movimiento === 'merma' ||
                            m.tipo_movimiento === 'ajuste_negativo';

                          return (
                            <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-[#201f1f] transition-colors">
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                                {formatDateTime(m.fecha_hora)}
                              </td>
                              <td className="py-2 px-3">{getTipoBadge(m.tipo_movimiento)}</td>
                              <td className="py-2 px-3">
                                <div className="font-mono text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                                  {m.lote?.numero_lote || '-'}
                                </div>
                                {m.lote?.fecha_vencimiento && (
                                  <span className="text-[10px] text-slate-500 dark:text-[#978d9d] block">
                                    Vto: {formatDate(m.lote.fecha_vencimiento)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px]">
                                <span className="text-slate-600 dark:text-[#cdc3d4]">
                                  {m.origen?.codigo_etiqueta || 'Exterior'}
                                </span>
                                <span className="text-slate-400 dark:text-[#978d9d] mx-1">&rarr;</span>
                                <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                                  {m.destino?.codigo_etiqueta || 'Despacho'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold">
                                {esEntrada ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800/40">
                                    <ArrowDownLeft className="w-2.5 h-2.5" />
                                    <span>+{formatNumber(m.cantidad || 0, 0)}</span>
                                  </span>
                                ) : esSalida ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800/40">
                                    <ArrowUpRight className="w-2.5 h-2.5" />
                                    <span>-{formatNumber(m.cantidad || 0, 0)}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200 dark:text-slate-300 dark:bg-slate-800/60 dark:border-slate-700/60">
                                    <span>↔</span>
                                    <span>{formatNumber(m.cantidad || 0, 0)}</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-xs text-violet-700 dark:text-[#dab9ff]">
                                {formatM3(m.volumen_m3 || 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {quickKardexMovimientos.length > 0 && (
                        <tfoot className="bg-slate-100 dark:bg-[#141414] border-t-2 border-slate-300 dark:border-[#333333] text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                          <tr>
                            <td colSpan={4} className="py-2.5 px-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] uppercase font-bold text-violet-700 dark:text-[#dab9ff]">
                                  Saldo Físico Neto ({quickKardexMovimientos.length} movs.)
                                </span>
                                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                                  +{formatNumber(quickKardexTotals.totalEntradas, 0)} Entradas
                                </span>
                                <span className="text-slate-400 dark:text-[#978d9d] text-[10px]">•</span>
                                <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400 font-semibold">
                                  -{formatNumber(quickKardexTotals.totalSalidas, 0)} Salidas
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-xs text-sky-700 dark:text-[#75d1ff]">
                              {formatNumber(quickKardexTotals.netoCantidad, 0)} un.
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-xs text-violet-700 dark:text-[#dab9ff]">
                              {formatM3(quickKardexTotals.totalVolumenM3)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>

              {/* Footer Modal */}
              <div className="p-3 bg-slate-50 dark:bg-[#171616] border-t border-slate-200 dark:border-[#333333] flex items-center justify-between text-xs text-slate-600 dark:text-[#cdc3d4] flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span>
                    Asientos:{' '}
                    <strong className="text-violet-700 dark:text-[#dab9ff]">{quickKardexMovimientos.length}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Entradas (+):{' '}
                    <strong className="text-emerald-700 dark:text-emerald-400 font-mono">+{formatNumber(quickKardexTotals.totalEntradas, 0)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Salidas (-):{' '}
                    <strong className="text-rose-700 dark:text-rose-400 font-mono">-{formatNumber(quickKardexTotals.totalSalidas, 0)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Saldo Físico:{' '}
                    <strong className="text-sky-700 dark:text-[#75d1ff] font-mono font-bold">{formatNumber(quickKardexTotals.netoCantidad, 0)} un.</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Volumen Total:{' '}
                    <strong className="text-violet-700 dark:text-[#dab9ff] font-mono">{formatM3(quickKardexTotals.totalVolumenM3)}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickKardexArticulo(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#201f1f] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-800 dark:text-[#e5e2e1] font-semibold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
};
