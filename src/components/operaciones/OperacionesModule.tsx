import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Boxes,
  ArrowDownToLine,
  PackageCheck,
  ArrowUpFromLine,
  Truck,
  RefreshCw,
  Search,
  Filter,
  Download,
  AlertTriangle,
  Building2,
  Calendar,
  Clock,
  FileText,
  User,
  Eye,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
  RotateCcw,
  ExternalLink,
  GitFork,
  ArrowRight,
  List,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  TableContainer,
  SortableHeaderCell,
  AnimatedTableRow,
  TableSkeleton,
  TableEmptyState,
  TablePagination,
} from '@/components/ui/AnimatedTable';
import { formatDateTime, formatDate, formatNumber, formatM3, cn } from '@/lib/utils';
import {
  operacionesApi,
  type Operacion,
  type FiltrosOperaciones,
  type EstadisticasOperaciones,
} from '@/api/operacionesApi';
import { OperacionDetalleModal } from './OperacionDetalleModal';

interface OperacionesModuleProps {
  clientes?: any[];
  selectedClienteId?: string;
  isDark?: boolean;
}

export type GroupByOption = 'ninguno' | 'pedido' | 'lote';

export interface OperacionesGroup {
  key: string;
  tipo: 'pedido' | 'lote' | 'general';
  titulo: string;
  clienteNombre: string;
  unidadNegocio?: string | null;
  items: Operacion[];
  totalCantidad: number;
  totalM3: number;
  etapas: {
    pedido?: { existe: boolean; estado: string };
    salida?: { existe: boolean; estado: string };
    entrega?: { existe: boolean; estado: string };
    entrada?: { existe: boolean; estado: string };
  };
  hasDesvio: boolean;
  fechaReciente: string;
}

const extraerPedidoKey = (op: Operacion): string => {
  if (op.tipo_op === 'pedido') {
    return op.id_operacion;
  }
  const textToSearch = `${op.documento_heredado || ''} ${op.documento_movimiento || ''} ${op.id_operacion || ''}`;
  const match = textToSearch.match(/(PED-[A-Za-z0-9_-]+)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  if (op.tipo_op === 'entrada') {
    return `Inbound: ${op.id_operacion}`;
  }
  return 'Otros / Sin Pedido';
};

const extraerLoteKey = (op: Operacion): string => {
  const lot = (op.lotes_despacho || '').trim();
  if (!lot || lot === 'S/L' || lot === 'Sin Lote' || lot === 'Sin Lote Específico' || lot === 'Consolidado Outbound') {
    return 'Sin Lote Específico';
  }
  return lot;
};

type SortField =
  | 'fechahora_alta'
  | 'id_operacion'
  | 'tipo_op'
  | 'cliente_nombre'
  | 'cantidad_total'
  | 'm3_totales'
  | 'estado';

export const OperacionesModule: React.FC<OperacionesModuleProps> = ({
  clientes = [],
  selectedClienteId = '',
  isDark = true,
}) => {
  // Estado de lista y estadísticas
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasOperaciones>({
    total: 0,
    entradas: 0,
    pedidos: 0,
    salidas: 0,
    entregas: 0,
    enProceso: 0,
    completadas: 0,
    conDesvios: 0,
    totalCantidad: 0,
    totalM3: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Agrupación de Flow
  const [agruparPor, setAgruparPor] = useState<GroupByOption>('ninguno');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipoOp, setFiltroTipoOp] = useState<'todos' | 'entrada' | 'pedido' | 'salida' | 'entrega'>('todos');
  const [filtroClienteId, setFiltroClienteId] = useState<string>(selectedClienteId || '');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'en_proceso' | 'completada'>('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [soloDesvios, setSoloDesvios] = useState(false);

  // Ordenamiento y Paginación
  const [sortField, setSortField] = useState<SortField>('fechahora_alta');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modal de Detalle / Edición
  const [operacionSeleccionada, setOperacionSeleccionada] = useState<Operacion | null>(null);

  // Sincronizar filtroClienteId cuando selectedClienteId cambie externamente
  useEffect(() => {
    if (selectedClienteId) {
      setFiltroClienteId(selectedClienteId);
    }
  }, [selectedClienteId]);

  // Cargar operaciones
  const cargarOperaciones = useCallback(async () => {
    setIsLoading(true);
    try {
      const filtros: FiltrosOperaciones = {
        clienteId: filtroClienteId || undefined,
        tipoOp: filtroTipoOp,
        estado: filtroEstado,
        search: searchTerm,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        soloConDesvios: soloDesvios,
      };

      const [data, stats] = await Promise.all([
        operacionesApi.listarOperaciones(filtros),
        operacionesApi.obtenerEstadisticas(filtroClienteId || undefined),
      ]);

      // Si la tabla aún no contiene datos, disparar recolección automática inicial
      if (data.length === 0 && !searchTerm && !fechaDesde && !fechaHasta) {
        const reco = await operacionesApi.recolectarHistoricoCompleto();
        if (reco.exito && reco.procesadas > 0) {
          const recargadas = await operacionesApi.listarOperaciones(filtros);
          const nuevasStats = await operacionesApi.obtenerEstadisticas(filtroClienteId || undefined);
          setOperaciones(recargadas);
          setEstadisticas(nuevasStats);
          setIsLoading(false);
          return;
        }
      }

      setOperaciones(data);
      setEstadisticas(stats);
    } catch (err: any) {
      console.error('Error cargando operaciones:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filtroClienteId, filtroTipoOp, filtroEstado, searchTerm, fechaDesde, fechaHasta, soloDesvios]);

  useEffect(() => {
    cargarOperaciones();
  }, [cargarOperaciones]);

  // Escuchar eventos globales de sincronización
  useEffect(() => {
    const handleDataChanged = () => {
      cargarOperaciones();
    };
    window.addEventListener('wms:data-changed', handleDataChanged);
    return () => window.removeEventListener('wms:data-changed', handleDataChanged);
  }, [cargarOperaciones]);

  // Acción manual de Recolectar / Sincronizar
  const handleSincronizar = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await operacionesApi.recolectarHistoricoCompleto();
      setSyncFeedback(res.mensaje);
      await cargarOperaciones();
      setTimeout(() => {
        setSyncFeedback(null);
      }, 4000);
    } catch (err: any) {
      setSyncFeedback('Error al sincronizar: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Ordenamiento
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const operacionesOrdenadas = useMemo(() => {
    const arr = [...operaciones];
    arr.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'fechahora_alta') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      } else if (sortField === 'cantidad_total' || sortField === 'm3_totales') {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [operaciones, sortField, sortAsc]);

  // Paginación y Agrupación
  const operacionesAgrupadas = useMemo((): OperacionesGroup[] => {
    if (agruparPor === 'ninguno') return [];

    const groupsMap = new Map<string, OperacionesGroup>();

    operacionesOrdenadas.forEach((op) => {
      const key = agruparPor === 'pedido' ? extraerPedidoKey(op) : extraerLoteKey(op);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          tipo: agruparPor === 'pedido' ? (key.startsWith('PED-') ? 'pedido' : 'general') : 'lote',
          titulo:
            agruparPor === 'pedido'
              ? key.startsWith('PED-')
                ? `Pedido ${key}`
                : key
              : `Lote / Aduana: ${key}`,
          clienteNombre: op.cliente_nombre || 'Cliente General',
          unidadNegocio: op.unidad_negocio || null,
          items: [],
          totalCantidad: 0,
          totalM3: 0,
          etapas: {},
          hasDesvio: false,
          fechaReciente: op.fechahora_alta,
        });
      }

      const g = groupsMap.get(key)!;
      g.items.push(op);
      g.totalCantidad += Number(op.cantidad_total || 0);
      g.totalM3 += Number(op.m3_totales || 0);
      if (op.novedad_desvio && op.novedad_desvio.trim().length > 0) {
        g.hasDesvio = true;
      }
      if (new Date(op.fechahora_alta).getTime() > new Date(g.fechaReciente).getTime()) {
        g.fechaReciente = op.fechahora_alta;
      }

      // Marcar etapas del flow
      if (op.tipo_op === 'pedido') {
        g.etapas.pedido = { existe: true, estado: op.estado };
      } else if (op.tipo_op === 'salida') {
        g.etapas.salida = { existe: true, estado: op.estado };
      } else if (op.tipo_op === 'entrega') {
        g.etapas.entrega = { existe: true, estado: op.estado };
      } else if (op.tipo_op === 'entrada') {
        g.etapas.entrada = { existe: true, estado: op.estado };
      }
    });

    const result = Array.from(groupsMap.values());
    result.sort((a, b) => new Date(b.fechaReciente).getTime() - new Date(a.fechaReciente).getTime());
    return result;
  }, [operacionesOrdenadas, agruparPor]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      (agruparPor === 'ninguno' ? operacionesOrdenadas.length : operacionesAgrupadas.length) / pageSize
    )
  );

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return operacionesOrdenadas.slice(start, start + pageSize);
  }, [operacionesOrdenadas, currentPage, pageSize]);

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return operacionesAgrupadas.slice(start, start + pageSize);
  }, [operacionesAgrupadas, currentPage, pageSize]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const current = prev[key] !== false; // default true
      return { ...prev, [key]: !current };
    });
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    operacionesAgrupadas.forEach((g) => {
      next[g.key] = true;
    });
    setExpandedGroups(next);
  };

  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {};
    operacionesAgrupadas.forEach((g) => {
      next[g.key] = false;
    });
    setExpandedGroups(next);
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    if (operacionesOrdenadas.length === 0) {
      alert('No hay operaciones para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'ID Operación',
      'Tipo OP',
      'Cliente',
      'Unidad Negocio',
      'Fecha Alta',
      'Fecha Fin',
      'Doc Movimiento',
      'Doc Heredado',
      'Lotes/Despachos',
      'Cantidad Total',
      'M3 Totales',
      'Novedad / Desvío',
      'Usuario Creador',
      'Estado',
    ];

    const rows = operacionesOrdenadas.map((op) => [
      `"${op.id_operacion || ''}"`,
      `"${op.tipo_op || ''}"`,
      `"${op.cliente_nombre || ''}"`,
      `"${op.unidad_negocio || ''}"`,
      `"${op.fechahora_alta ? new Date(op.fechahora_alta).toLocaleString() : ''}"`,
      `"${op.fechahora_fin ? new Date(op.fechahora_fin).toLocaleString() : ''}"`,
      `"${(op.documento_movimiento || '').replace(/"/g, '""')}"`,
      `"${(op.documento_heredado || '').replace(/"/g, '""')}"`,
      `"${(op.lotes_despacho || '').replace(/"/g, '""')}"`,
      op.cantidad_total || 0,
      op.m3_totales || 0,
      `"${(op.novedad_desvio || '').replace(/"/g, '""')}"`,
      `"${op.usuario_creador || ''}"`,
      `"${op.estado || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `operaciones_wms_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper visual de tipo
  const getBadgeTipo = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <ArrowDownToLine className="w-3 h-3 text-emerald-400" />
            Entrada (IN)
          </span>
        );
      case 'pedido':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-[#dab9ff]/15 text-[#dab9ff] border border-[#dab9ff]/30">
            <PackageCheck className="w-3 h-3 text-[#dab9ff]" />
            Pedido (Picking)
          </span>
        );
      case 'salida':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <ArrowUpFromLine className="w-3 h-3 text-amber-400" />
            Salida (OUT)
          </span>
        );
      case 'entrega':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Truck className="w-3 h-3 text-sky-400" />
            Entrega (Ruta)
          </span>
        );
      default:
        return <Badge variant="default">{tipo}</Badge>;
    }
  };

  const hasActiveFilters = Boolean(
    searchTerm ||
    filtroTipoOp !== 'todos' ||
    filtroClienteId ||
    filtroEstado !== 'todos' ||
    fechaDesde ||
    fechaHasta ||
    soloDesvios
  );

  const resetFilters = () => {
    setSearchTerm('');
    setFiltroTipoOp('todos');
    setFiltroClienteId('');
    setFiltroEstado('todos');
    setFechaDesde('');
    setFechaHasta('');
    setSoloDesvios(false);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5">
      {/* 1. Header con Título y Acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#161616] border border-[#2e2d2d] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-[#dab9ff]/20 to-violet-600/10 border border-[#dab9ff]/30 text-[#dab9ff]">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#e5e2e1] tracking-tight">
                Colector & Monitor de Operaciones
              </h1>
              <Badge variant="info" dot pulse>
                Totalizador WMS
              </Badge>
            </div>
            <p className="text-xs text-[#cdc3d4]">
              Consolidación de órdenes de Recepción, Pedidos de Picking, Salidas y Rutas de Entrega
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {syncFeedback && (
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg animate-in fade-in">
              {syncFeedback}
            </span>
          )}

          <button
            onClick={handleSincronizar}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#222222] hover:bg-[#2b2b2b] text-[#e5e2e1] border border-[#383838] transition-colors disabled:opacity-50"
            title="Escanea y recolecta todas las órdenes existentes para sincronizar la tabla operaciones"
          >
            <RefreshCw className={cn('w-4 h-4 text-[#dab9ff]', isSyncing && 'animate-spin')} />
            {isSyncing ? 'Recolectando...' : 'Recolectar / Sincronizar'}
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#dab9ff] hover:bg-[#eedbff] text-black transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* 2. Ribbon de Métricas Acumuladas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Operaciones */}
        <div className="p-3.5 rounded-xl bg-[#1a1919] border border-[#2e2d2d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Operaciones</span>
            <Boxes className="w-4 h-4 text-[#dab9ff]" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-[#e5e2e1] font-mono">{estadisticas.total}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {formatNumber(estadisticas.totalCantidad)} bultos &bull; {formatM3(estadisticas.totalM3)}
            </div>
          </div>
        </div>

        {/* Entradas */}
        <div className="p-3.5 rounded-xl bg-[#1a1919] border border-[#2e2d2d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Entradas (IN)</span>
            <ArrowDownToLine className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-emerald-400 font-mono">{estadisticas.entradas}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Contenedores & Aduana</div>
          </div>
        </div>

        {/* Pedidos */}
        <div className="p-3.5 rounded-xl bg-[#1a1919] border border-[#2e2d2d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pedidos</span>
            <PackageCheck className="w-4 h-4 text-[#dab9ff]" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-[#dab9ff] font-mono">{estadisticas.pedidos}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Órdenes de Picking</div>
          </div>
        </div>

        {/* Salidas */}
        <div className="p-3.5 rounded-xl bg-[#1a1919] border border-[#2e2d2d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Salidas (OUT)</span>
            <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-amber-400 font-mono">{estadisticas.salidas}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Expedición & Remitos</div>
          </div>
        </div>

        {/* Entregas */}
        <div className="p-3.5 rounded-xl bg-[#1a1919] border border-[#2e2d2d] flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Entregas</span>
            <Truck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-sky-400 font-mono">{estadisticas.entregas}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Rutas Reparto</div>
          </div>
        </div>

        {/* Con Desvíos */}
        <div className="p-3.5 rounded-xl bg-[#1a1919] border border-amber-900/30 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
              Con Desvíos
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-amber-400 font-mono">{estadisticas.conDesvios}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Novedades operativas</div>
          </div>
        </div>
      </div>

      {/* 3. Barra de Filtros y Búsqueda */}
      <div className="p-4 rounded-xl bg-[#161616] border border-[#2e2d2d] space-y-3">
        {/* Pills de Tipo OP y Selector de Agrupación de Flow */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-[#262626]">
          {/* Pills de Tipo OP */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mr-1.5">
              Tipo de Flujo:
            </span>
            {[
              { id: 'todos', label: 'Todos', icon: Boxes },
              { id: 'entrada', label: 'Entradas (IN)', icon: ArrowDownToLine },
              { id: 'pedido', label: 'Pedidos (Picking)', icon: PackageCheck },
              { id: 'salida', label: 'Salidas (OUT)', icon: ArrowUpFromLine },
              { id: 'entrega', label: 'Entregas (Remitos)', icon: Truck },
            ].map((tipo) => {
              const Icon = tipo.icon;
              const active = filtroTipoOp === tipo.id;
              return (
                <button
                  key={tipo.id}
                  onClick={() => {
                    setFiltroTipoOp(tipo.id as any);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    active
                      ? 'bg-[#dab9ff] text-black font-semibold shadow-xs'
                      : 'bg-[#202020] text-slate-300 hover:bg-[#282828] border border-[#333333]'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tipo.label}
                </button>
              );
            })}
          </div>

          {/* Selector de Agrupación de Flow */}
          <div className="flex items-center gap-1 bg-[#1a1a1a] p-1 rounded-xl border border-[#333333] self-start lg:self-auto">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-2 flex items-center gap-1.5">
              <GitFork className="w-3.5 h-3.5 text-[#dab9ff]" />
              Agrupar:
            </span>
            <button
              type="button"
              onClick={() => {
                setAgruparPor('ninguno');
                setCurrentPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all',
                agruparPor === 'ninguno'
                  ? 'bg-[#2b2a2a] text-[#e5e2e1] font-semibold shadow-xs border border-[#3d3d3d]'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <List className="w-3.5 h-3.5" />
              Lista Plana
            </button>
            <button
              type="button"
              onClick={() => {
                setAgruparPor('pedido');
                setCurrentPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all',
                agruparPor === 'pedido'
                  ? 'bg-[#dab9ff] text-black font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              Por Pedido
            </button>
            <button
              type="button"
              onClick={() => {
                setAgruparPor('lote');
                setCurrentPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all',
                agruparPor === 'lote'
                  ? 'bg-amber-400 text-black font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Por Lote / Aduana
            </button>
          </div>
        </div>

        {/* Inputs de Filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-1">
          {/* Buscador de texto libre */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por ID, Doc, Lote, Cliente o Novedad..."
              className="w-full bg-[#1e1e1e] border border-[#333333] focus:border-[#dab9ff] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#e5e2e1] outline-none placeholder:text-slate-500"
            />
          </div>

          {/* Filtro Cliente */}
          <div>
            <select
              value={filtroClienteId}
              onChange={(e) => {
                setFiltroClienteId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#1e1e1e] border border-[#333333] focus:border-[#dab9ff] rounded-lg px-2.5 py-1.5 text-xs text-[#e5e2e1] outline-none"
            >
              <option value="">Todos los Clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Estado */}
          <div>
            <select
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full bg-[#1e1e1e] border border-[#333333] focus:border-[#dab9ff] rounded-lg px-2.5 py-1.5 text-xs text-[#e5e2e1] outline-none"
            >
              <option value="todos">Todos los Estados</option>
              <option value="en_proceso">En Proceso</option>
              <option value="completada">Completada</option>
            </select>
          </div>

          {/* Fecha Desde */}
          <div>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#1e1e1e] border border-[#333333] focus:border-[#dab9ff] rounded-lg px-2.5 py-1.5 text-xs text-[#e5e2e1] outline-none"
              title="Fecha Alta Desde"
            />
          </div>

          {/* Fecha Hasta */}
          <div>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#1e1e1e] border border-[#333333] focus:border-[#dab9ff] rounded-lg px-2.5 py-1.5 text-xs text-[#e5e2e1] outline-none"
              title="Fecha Alta Hasta"
            />
          </div>
        </div>

        {/* Toggle desvíos y Limpiar Filtros */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => {
              setSoloDesvios(!soloDesvios);
              setCurrentPage(1);
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
              soloDesvios
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-semibold'
                : 'bg-[#1e1e1e] text-slate-400 border-[#333333] hover:text-slate-200'
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Solo con Desvíos / Novedades
          </button>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs text-[#dab9ff] hover:text-[#eedbff] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* 4. Tabla de Operaciones (Lista Plana o Agrupada por Flow) */}
      <TableContainer>
        {agruparPor !== 'ninguno' ? (
          <div className="p-4 space-y-3">
            {/* Barra de control de grupos */}
            <div className="flex items-center justify-between pb-3 border-b border-[#2d2d2d]">
              <div className="flex items-center gap-2">
                <GitFork className="w-4 h-4 text-[#dab9ff]" />
                <span className="text-xs font-semibold text-[#e5e2e1]">
                  {agruparPor === 'pedido'
                    ? 'Flujos Operativos agrupados por Pedido'
                    : 'Operaciones agrupadas por Lote / Despacho de Aduana'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#242323] text-[#dab9ff] text-[10px] font-mono border border-[#383838]">
                  {operacionesAgrupadas.length} grupos
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="text-[11px] text-slate-400 hover:text-white transition-colors"
                >
                  Expandir todos
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="text-[11px] text-slate-400 hover:text-white transition-colors"
                >
                  Colapsar todos
                </button>
              </div>
            </div>

            {/* Listado de Grupos */}
            {isLoading ? (
              <div className="py-8">
                <TableSkeleton columns={8} rows={4} />
              </div>
            ) : paginatedGroups.length === 0 ? (
              <TableEmptyState
                colSpan={12}
                title="No se encontraron operaciones para agrupar"
                description={
                  hasActiveFilters
                    ? 'No hay resultados que coincidan con los filtros seleccionados.'
                    : 'Haga clic en "Recolectar / Sincronizar" para importar las órdenes.'
                }
              />
            ) : (
              <div className="space-y-3">
                {paginatedGroups.map((g) => {
                  const isExpanded = expandedGroups[g.key] !== false; // expandido por defecto

                  return (
                    <div
                      key={g.key}
                      className="rounded-xl bg-[#171717] border border-[#2d2d2d] overflow-hidden transition-all shadow-sm"
                    >
                      {/* Cabecera del Grupo */}
                      <div
                        onClick={() => toggleGroup(g.key)}
                        className="flex flex-col lg:flex-row lg:items-center justify-between p-3.5 cursor-pointer hover:bg-[#1d1c1c] transition-colors border-b border-[#262626] gap-3 select-none"
                      >
                        {/* Izquierda: Chevron, Ícono, Título y Cliente */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="p-1 rounded-lg text-slate-400 hover:text-white bg-[#202020] border border-[#333333]"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(g.key);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#dab9ff]" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </button>

                          <div
                            className={cn(
                              'p-2 rounded-xl border',
                              g.tipo === 'pedido'
                                ? 'bg-[#dab9ff]/10 border-[#dab9ff]/30 text-[#dab9ff]'
                                : g.tipo === 'lote'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
                            )}
                          >
                            {g.tipo === 'pedido' ? (
                              <PackageCheck className="w-4 h-4" />
                            ) : g.tipo === 'lote' ? (
                              <Layers className="w-4 h-4" />
                            ) : (
                              <Boxes className="w-4 h-4" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold font-mono text-[#e5e2e1]">
                                {g.titulo}
                              </span>
                              <span className="text-[11px] font-medium text-slate-300 px-2 py-0.5 rounded-md bg-[#222222] border border-[#333333]">
                                {g.clienteNombre}
                              </span>
                              {g.hasDesvio && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                  <AlertTriangle className="w-3 h-3" /> Desvío
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {g.unidadNegocio ? `${g.unidadNegocio} • ` : ''}
                              Última act: {formatDateTime(g.fechaReciente)}
                            </div>
                          </div>
                        </div>

                        {/* Centro: Stepper del Flow (en agrupación por pedido) */}
                        {g.tipo === 'pedido' && (
                          <div className="flex items-center gap-1.5 py-1 px-3 bg-[#131313] rounded-xl border border-[#2b2b2b] self-start lg:self-auto">
                            {/* Paso 1: Picking */}
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1',
                                g.etapas.pedido?.estado === 'completada'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : g.etapas.pedido
                                  ? 'bg-[#dab9ff]/15 text-[#dab9ff] border-[#dab9ff]/30'
                                  : 'bg-slate-800/40 text-slate-500 border-slate-700/40'
                              )}
                            >
                              <PackageCheck className="w-3 h-3" />
                              Picking {g.etapas.pedido ? `(${g.etapas.pedido.estado})` : 'Pendiente'}
                            </span>

                            <ArrowRight className="w-3 h-3 text-slate-600" />

                            {/* Paso 2: Salida Expedición */}
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1',
                                g.etapas.salida?.estado === 'completada'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : g.etapas.salida
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-slate-800/40 text-slate-500 border-slate-700/40'
                              )}
                            >
                              <ArrowUpFromLine className="w-3 h-3" />
                              Expedición {g.etapas.salida ? `(${g.etapas.salida.estado})` : 'Pendiente'}
                            </span>

                            <ArrowRight className="w-3 h-3 text-slate-600" />

                            {/* Paso 3: Entrega Remito */}
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1',
                                g.etapas.entrega?.estado === 'completada'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : g.etapas.entrega
                                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                  : 'bg-slate-800/40 text-slate-500 border-slate-700/40'
                              )}
                            >
                              <Truck className="w-3 h-3" />
                              Entrega {g.etapas.entrega ? `(${g.etapas.entrega.estado})` : 'Pendiente'}
                            </span>
                          </div>
                        )}

                        {/* Derecha: Métricas y Totales del Grupo */}
                        <div className="flex items-center gap-4 text-xs font-mono self-end lg:self-auto">
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-slate-500 font-semibold block">
                              Cant. Total
                            </span>
                            <span className="text-slate-200 font-bold">
                              {formatNumber(g.totalCantidad)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-slate-500 font-semibold block">
                              Volumen M³
                            </span>
                            <span className="text-[#dab9ff] font-bold">
                              {formatM3(g.totalM3)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-slate-500 font-semibold block">
                              Operaciones
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#242323] text-slate-300 font-bold border border-[#333]">
                              {g.items.length}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Contenido Desplegable (Subtabla de operaciones del grupo) */}
                      {isExpanded && (
                        <div className="overflow-x-auto bg-[#141414]">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[#252525] bg-[#1a1919] text-[10px] uppercase tracking-wider text-slate-400">
                                <th className="py-2 px-3">Etapa / Tipo</th>
                                <th className="py-2 px-3">ID Operación</th>
                                <th className="py-2 px-3">Doc Movimiento</th>
                                <th className="py-2 px-3">Doc Heredado</th>
                                <th className="py-2 px-3">Lotes / Aduana</th>
                                <th className="py-2 px-3 text-right">Cant. Total</th>
                                <th className="py-2 px-3 text-right">Volumen M³</th>
                                <th className="py-2 px-3">Fecha Alta</th>
                                <th className="py-2 px-3 text-center">Estado</th>
                                <th className="py-2 px-3 text-center">Detalle</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#222222]">
                              {g.items.map((op, opIdx) => {
                                const hasOpDesvio = Boolean(
                                  op.novedad_desvio && op.novedad_desvio.trim().length > 0
                                );
                                return (
                                  <tr
                                    key={op.id || `${op.id_operacion}-${opIdx}`}
                                    onClick={() => setOperacionSeleccionada(op)}
                                    className={cn(
                                      'cursor-pointer hover:bg-[#1d1c1c] transition-colors',
                                      hasOpDesvio && 'bg-amber-950/10'
                                    )}
                                  >
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      {getBadgeTipo(op.tipo_op)}
                                    </td>
                                    <td className="py-2 px-3 font-mono font-bold text-[#e5e2e1]">
                                      {op.id_operacion}
                                    </td>
                                    <td
                                      className="py-2 px-3 text-[11px] font-medium text-slate-300 truncate max-w-[180px]"
                                      title={op.documento_movimiento || ''}
                                    >
                                      {op.documento_movimiento || '-'}
                                    </td>
                                    <td
                                      className="py-2 px-3 text-[11px] text-[#dab9ff] truncate max-w-[180px]"
                                      title={op.documento_heredado || ''}
                                    >
                                      {op.documento_heredado || '-'}
                                    </td>
                                    <td className="py-2 px-3 font-mono text-[11px] text-slate-300">
                                      <span className="px-1.5 py-0.5 rounded bg-[#201f1f] border border-[#2e2d2d] truncate block max-w-[150px]">
                                        {op.lotes_despacho || 'S/Lote'}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-[#e5e2e1]">
                                      {formatNumber(op.cantidad_total || 0)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#dab9ff]">
                                      {formatM3(op.m3_totales || 0)}
                                    </td>
                                    <td className="py-2 px-3 text-[11px] font-mono text-slate-400 whitespace-nowrap">
                                      {formatDateTime(op.fechahora_alta)}
                                    </td>
                                    <td className="py-2 px-3 text-center whitespace-nowrap">
                                      <span
                                        className={cn(
                                          'inline-block px-2 py-0.5 text-[10px] uppercase font-semibold rounded-full border',
                                          op.estado === 'completada'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                        )}
                                      >
                                        {op.estado === 'completada' ? 'Completada' : 'En Proceso'}
                                      </span>
                                    </td>
                                    <td
                                      className="py-2 px-3 text-center whitespace-nowrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setOperacionSeleccionada(op)}
                                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#2c2b2b] transition-colors"
                                        title="Ver detalle"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#2d2d2d] bg-[#141414]">
                  <SortableHeaderCell
                    label="ID Operación"
                    field="id_operacion"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                  />
                  <SortableHeaderCell
                    label="Tipo OP"
                    field="tipo_op"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                  />
                  <SortableHeaderCell
                    label="Cliente & Negocio"
                    field="cliente_nombre"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                  />
                  <SortableHeaderCell
                    label="Fecha/Hora Alta & Fin"
                    field="fechahora_alta"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                  />
                  <th className="py-2.5 px-3 font-semibold text-[11px] tracking-wider uppercase text-slate-400">
                    Doc. Movimiento / Heredado
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-[11px] tracking-wider uppercase text-slate-400">
                    Lotes / Despacho Aduana
                  </th>
                  <SortableHeaderCell
                    label="Cantidad Total"
                    field="cantidad_total"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                    align="right"
                  />
                  <SortableHeaderCell
                    label="M3 Totales"
                    field="m3_totales"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                    align="right"
                  />
                  <th className="py-2.5 px-3 font-semibold text-[11px] tracking-wider uppercase text-slate-400">
                    Novedad / Desvío
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-[11px] tracking-wider uppercase text-slate-400">
                    Creador
                  </th>
                  <SortableHeaderCell
                    label="Estado"
                    field="estado"
                    currentSortField={sortField}
                    sortAsc={sortAsc}
                    onSort={(f) => handleSort(f as SortField)}
                    align="center"
                  />
                  <th className="py-2.5 px-3 font-semibold text-[11px] tracking-wider uppercase text-slate-400 text-center">
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#242424]">
                {isLoading ? (
                  <TableSkeleton columns={12} rows={8} />
                ) : paginatedData.length === 0 ? (
                  <TableEmptyState
                    colSpan={12}
                    title="No se encontraron operaciones registradas"
                    description={
                      hasActiveFilters
                        ? 'No hay resultados que coincidan con los filtros seleccionados.'
                        : 'Haga clic en "Recolectar / Sincronizar" para importar y totalizar las órdenes existentes.'
                    }
                    action={
                      !hasActiveFilters
                        ? {
                            label: 'Recolectar Operaciones',
                            onClick: handleSincronizar,
                          }
                        : undefined
                    }
                  />
                ) : (
                  paginatedData.map((op, idx) => {
                    const hasDesvio = Boolean(op.novedad_desvio && op.novedad_desvio.trim().length > 0);

                    return (
                      <AnimatedTableRow
                        key={op.id || `${op.id_operacion}-${idx}`}
                        onClick={() => setOperacionSeleccionada(op)}
                        className={cn(
                          'cursor-pointer hover:bg-[#1f1e1e] transition-colors',
                          hasDesvio && 'bg-amber-950/10'
                        )}
                      >
                        {/* ID Operación */}
                        <td className="py-2.5 px-3 font-mono font-bold text-[#e5e2e1] whitespace-nowrap">
                          {op.id_operacion}
                        </td>

                        {/* Tipo OP */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getBadgeTipo(op.tipo_op)}
                        </td>

                        {/* Cliente & Negocio */}
                        <td className="py-2.5 px-3">
                          <div
                            className="font-medium text-[#e5e2e1] truncate max-w-[170px]"
                            title={op.cliente_nombre || ''}
                          >
                            {op.cliente_nombre || 'General'}
                          </div>
                          <div
                            className="text-[10px] text-slate-400 font-mono truncate max-w-[170px]"
                            title={op.unidad_negocio || ''}
                          >
                            {op.unidad_negocio || 'Sin Unidad'}
                          </div>
                        </td>

                        {/* Fechas Alta & Fin */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="text-[#e5e2e1] font-mono text-[11px]">
                            {formatDateTime(op.fechahora_alta)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {op.fechahora_fin ? `Fin: ${formatDateTime(op.fechahora_fin)}` : 'En curso...'}
                          </div>
                        </td>

                        {/* Doc Movimiento / Heredado */}
                        <td className="py-2.5 px-3 max-w-[200px]">
                          <div
                            className="font-semibold text-slate-200 truncate text-[11px]"
                            title={op.documento_movimiento || ''}
                          >
                            {op.documento_movimiento || 'S/D'}
                          </div>
                          <div
                            className="text-[10px] text-[#dab9ff] truncate"
                            title={op.documento_heredado || ''}
                          >
                            {op.documento_heredado ? `Hereda: ${op.documento_heredado}` : '-'}
                          </div>
                        </td>

                        {/* Lotes / Despacho Aduana */}
                        <td className="py-2.5 px-3 max-w-[180px]">
                          <span
                            className="font-mono text-[11px] text-slate-300 bg-[#222121] px-1.5 py-0.5 rounded border border-[#333] truncate block"
                            title={op.lotes_despacho || ''}
                          >
                            {op.lotes_despacho || 'S/Lote'}
                          </span>
                        </td>

                        {/* Cantidad Total */}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#e5e2e1]">
                          {formatNumber(op.cantidad_total || 0)}
                        </td>

                        {/* M3 Totales */}
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#dab9ff]">
                          {formatM3(op.m3_totales || 0)}
                        </td>

                        {/* Novedad / Desvío */}
                        <td className="py-2.5 px-3 max-w-[190px]">
                          {hasDesvio ? (
                            <div
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-medium truncate"
                              title={op.novedad_desvio || ''}
                            >
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{op.novedad_desvio}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500">Sin desvío</span>
                          )}
                        </td>

                        {/* Creador */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 text-[11px]">
                          {op.usuario_creador || 'Sistema'}
                        </td>

                        {/* Estado */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-block px-2 py-0.5 text-[10px] uppercase font-semibold rounded-full border',
                              op.estado === 'completada'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            )}
                          >
                            {op.estado === 'completada' ? 'Completada' : 'En Proceso'}
                          </span>
                        </td>

                        {/* Acciones */}
                        <td
                          className="py-2.5 px-3 text-center whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setOperacionSeleccionada(op)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#2c2b2b] transition-colors"
                            title="Ver detalle / Asentar desvío"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </AnimatedTableRow>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {(agruparPor === 'ninguno'
          ? operacionesOrdenadas.length > 0
          : operacionesAgrupadas.length > 0) && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={
              agruparPor === 'ninguno'
                ? operacionesOrdenadas.length
                : operacionesAgrupadas.length
            }
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        )}
      </TableContainer>

      {/* 5. Modal de Detalle y Edición de Novedad/Desvío */}
      <OperacionDetalleModal
        isOpen={Boolean(operacionSeleccionada)}
        onClose={() => setOperacionSeleccionada(null)}
        operacion={operacionSeleccionada}
        onOperacionUpdated={cargarOperaciones}
      />
    </div>
  );
};
