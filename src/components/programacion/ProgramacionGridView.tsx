import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table as TableIcon,
  Search,
  Filter,
  Download,
  Printer,
  Plus,
  Share2,
  RefreshCw,
  Building2,
  Warehouse,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  Truck,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Edit2,
  Save,
  X,
  FileSpreadsheet,
  Globe,
  Sparkles,
  Lock,
  FileText,
  FileCheck2,
  UserCheck,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import {
  programacionApi,
  solicitudesParalelasApi,
  validarTokenAccesoCliente,
  ProgramacionItem,
  EstadoProgramacion,
  formatFechaCorta,
} from '@/api/programacionApi';
import { exportProgramacionExcel, exportToCSV } from '@/lib/exportExcelUtils';
import { NuevoItemProgramacionModal } from './NuevoItemProgramacionModal';
import { CompartirAccesoClienteModal } from './CompartirAccesoClienteModal';
import { DocumentoVisorModal } from './DocumentoVisorModal';
import { SolicitudesParalelasDrawer } from './SolicitudesParalelasDrawer';

interface ProgramacionGridViewProps {
  clientes?: any[];
  almacenes?: any[];
  selectedClienteId?: string;
  isStandalonePortal?: boolean;
  initialClienteNombre?: string;
  onExitPortal?: () => void;
}

type ViewStyle = 'excel' | 'modern';

export const ProgramacionGridView: React.FC<ProgramacionGridViewProps> = ({
  clientes = [],
  almacenes = [],
  selectedClienteId,
  isStandalonePortal = false,
  initialClienteNombre,
  onExitPortal,
}) => {
  // 1. Detección y Validación de Token de Seguridad en URL (?token=...)
  const urlToken = useMemo(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.get('token');
    } catch {
      return null;
    }
  }, []);

  const tokenInfo = useMemo(() => {
    if (!urlToken) return null;
    return validarTokenAccesoCliente(urlToken);
  }, [urlToken]);

  // Si viene con token válido o es standalone portal, es un cliente externo (Modo Sólo Lectura)
  const isClienteUser = isStandalonePortal || !!tokenInfo?.valido;

  // Data state
  const [items, setItems] = useState<ProgramacionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // View style toggle: 'excel' (estilo fiel idéntico a la planilla física) vs 'modern' (estilo dark WMS)
  const [viewStyle, setViewStyle] = useState<ViewStyle>('excel');

  // Filter state
  const [filtroCliente, setFiltroCliente] = useState<string>(() => {
    if (tokenInfo?.clienteNombre) return tokenInfo.clienteNombre;
    if (initialClienteNombre) return initialClienteNombre.toUpperCase();
    if (selectedClienteId) return selectedClienteId;
    return 'todos';
  });
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroDeposito, setFiltroDeposito] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [isNuevoModalOpen, setIsNuevoModalOpen] = useState(false);
  const [isCompartirModalOpen, setIsCompartirModalOpen] = useState(false);
  const [isDrawerParalelasOpen, setIsDrawerParalelasOpen] = useState(false);

  // Document Viewer Modal state
  const [selectedDocItem, setSelectedDocItem] = useState<ProgramacionItem | null>(null);
  const [tipoDocumentoVisor, setTipoDocumentoVisor] = useState<
    'remito' | 'romaneo' | 'pedido' | 'rx_conformado'
  >('remito');

  // Inline editing state for comments & status (solo operadores)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState<string>('');

  // Fetch / Refresh data
  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await programacionApi.listarProgramacion(
        filtroCliente !== 'todos' ? filtroCliente : undefined
      );
      setItems(data);
    } catch (err) {
      console.error('Error cargando programación:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filtroCliente]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sincronizar filtro si viene fijado por token o deep-link
  useEffect(() => {
    if (tokenInfo?.clienteNombre) {
      setFiltroCliente(tokenInfo.clienteNombre);
    } else if (initialClienteNombre) {
      setFiltroCliente(initialClienteNombre.toUpperCase());
    } else if (selectedClienteId) {
      setFiltroCliente(selectedClienteId);
    }
  }, [tokenInfo, initialClienteNombre, selectedClienteId]);

  // Filtered Items logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Filtro por Destinatario o Cliente
      if (filtroCliente !== 'todos') {
        const dest = (item.destinatario_nombre || '').toLowerCase();
        const cli = (item.cliente_nombre || '').toLowerCase();
        const term = filtroCliente.toLowerCase();
        const matchesName = dest.includes(term) || cli.includes(term);
        const matchesId = item.cliente_id === filtroCliente || item.destinatario_id === filtroCliente;
        if (!matchesName && !matchesId) return false;
      }

      // Filtro por Estado
      if (filtroEstado !== 'todos' && item.estado !== filtroEstado) {
        return false;
      }

      // Filtro por Depósito
      if (filtroDeposito !== 'todos') {
        if (!item.deposito.toLowerCase().includes(filtroDeposito.toLowerCase())) return false;
      }

      // Búsqueda de texto amplia
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const searchMatches =
          item.item_codigo.toLowerCase().includes(term) ||
          item.pedido_numero.toLowerCase().includes(term) ||
          item.orden_compra.toLowerCase().includes(term) ||
          (item.destinatario_nombre && item.destinatario_nombre.toLowerCase().includes(term)) ||
          item.cliente_nombre.toLowerCase().includes(term) ||
          item.deposito.toLowerCase().includes(term) ||
          (item.comentarios && item.comentarios.toLowerCase().includes(term));
        if (!searchMatches) return false;
      }

      return true;
    });
  }, [items, filtroCliente, filtroEstado, filtroDeposito, searchTerm]);

  // KPI Metrics
  const stats = useMemo(() => {
    const totalRollos = filteredItems.reduce((acc, it) => acc + (Number(it.rollos) || 0), 0);
    const entregados = filteredItems.filter((it) => it.estado === 'entregado');
    const programados = filteredItems.filter((it) => it.estado === 'programado');
    const enTransito = filteredItems.filter((it) => it.estado === 'en_transito');
    const pendientes = filteredItems.filter((it) => it.estado === 'pendiente');

    return {
      totalRollos,
      totalPedidos: filteredItems.length,
      rollosEntregados: entregados.reduce((acc, it) => acc + (Number(it.rollos) || 0), 0),
      countEntregados: entregados.length,
      rollosProgramados: programados.reduce((acc, it) => acc + (Number(it.rollos) || 0), 0),
      countProgramados: programados.length,
      rollosEnTransito: enTransito.reduce((acc, it) => acc + (Number(it.rollos) || 0), 0),
      countEnTransito: enTransito.length,
      rollosPendientes: pendientes.reduce((acc, it) => acc + (Number(it.rollos) || 0), 0),
      countPendientes: pendientes.length,
    };
  }, [filteredItems]);

  // Handle Quick State Change (solo operadores)
  const handleCambiarEstado = async (item: ProgramacionItem, nuevoEstado: EstadoProgramacion) => {
    if (isClienteUser) return; // Clientes no pueden modificar el estado
    try {
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, estado: nuevoEstado } : it))
      );
      await programacionApi.actualizarItem(item.id, {
        pedido_id: item.pedido_id,
        estado: nuevoEstado,
      });
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  };

  // Handle Save Comment (solo operadores)
  const handleSaveComment = async (item: ProgramacionItem) => {
    if (isClienteUser) return;
    try {
      const isHigh =
        editCommentText.toLowerCase().includes('entrega') ||
        editCommentText.toLowerCase().includes('falta') ||
        editCommentText.toLowerCase().includes('devol');

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, comentarios: editCommentText, comentarios_highlight: isHigh }
            : it
        )
      );
      setEditingItemId(null);

      await programacionApi.actualizarItem(item.id, {
        pedido_id: item.pedido_id,
        comentarios: editCommentText,
        comentarios_highlight: isHigh,
      });
    } catch (err) {
      console.error('Error al actualizar comentario:', err);
    }
  };

  // Abrir Visor de Documentos
  const handleOpenDoc = (
    item: ProgramacionItem,
    tipo: 'remito' | 'romaneo' | 'pedido' | 'rx_conformado'
  ) => {
    setSelectedDocItem(item);
    setTipoDocumentoVisor(tipo);
  };

  // Handle New Item
  const handleGuardarNuevo = async (nuevo: Omit<ProgramacionItem, 'id'>) => {
    const created = await programacionApi.agregarItem(nuevo);
    setItems((prev) => [created, ...prev]);
  };

  // Export to Excel XML
  const handleExportExcel = () => {
    const filename = `Programacion_Entregas_${filtroCliente !== 'todos' ? filtroCliente : 'General'}_${new Date().toISOString().slice(0, 10)}`;
    exportProgramacionExcel({
      filename,
      clienteFiltro: filtroCliente !== 'todos' ? filtroCliente : undefined,
      items: filteredItems,
    });
  };

  // Export to CSV
  const handleExportCSV = () => {
    const filename = `Programacion_Entregas_${new Date().toISOString().slice(0, 10)}`;
    exportToCSV({
      filename,
      columns: [
        { header: 'FECHA', key: 'fecha_display' },
        { header: 'DESTINATARIO', key: 'destinatario_nombre' },
        { header: 'ROLLOS', key: 'rollos' },
        { header: 'ITEM', key: 'item_codigo' },
        { header: 'ORDEN DE COMPRA', key: 'orden_compra' },
        { header: 'PEDIDO', key: 'pedido_numero' },
        { header: 'DEPOSITO', key: 'deposito' },
        { header: 'ESTADO', key: 'estado' },
        { header: 'COMENTARIOS', key: 'comentarios' },
      ],
      rows: filteredItems,
    });
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  // =========================================================================
  // SI EL TOKEN DE ACCESO TEMPORAL ESTÁ EXPIRADO
  // =========================================================================
  if (tokenInfo?.expirado) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#1a1919] border border-rose-300 dark:border-rose-900/50 rounded-2xl p-6 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Enlace de Consulta Vencido
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              El token temporal de acceso para {tokenInfo.clienteNombre || 'el destinatario'} ha caducado por motivos de seguridad.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#201f1f] text-[11px] text-slate-600 dark:text-slate-400">
            Los enlaces de consulta de programación se actualizan periódicamente. Solicita un nuevo enlace por WhatsApp a la administración del depósito.
          </div>
          <a
            href="https://api.whatsapp.com/"
            target="_blank"
            rel="noreferrer"
            className="w-full py-2.5 px-4 rounded-xl font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center gap-2 text-xs transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Solicitar Nuevo Enlace por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans print:p-0 print:m-0">
      {/* Banner de Token de Seguridad si está en Portal Cliente */}
      {tokenInfo?.valido && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              <strong>Acceso Seguro Verificado:</strong> Estás consultando los pedidos de{' '}
              <strong>{tokenInfo.clienteNombre}</strong> (Modo Sólo Lectura).
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold bg-white/70 dark:bg-[#201f1f] px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Vigencia: {tokenInfo.tiempoRestanteTexto} (hasta {tokenInfo.expiraEnFecha})
          </div>
        </div>
      )}

      {/* Top Banner / Portal Header */}
      <div className="bg-white dark:bg-[#1b1a1a] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-[#2f2e2e] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white uppercase flex items-center gap-2">
                  Planilla de Programación
                </h1>
                {isClienteUser && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Portal Cliente / Destinatario
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Seguimiento de pedidos, entregas por destinatario y documentos adjuntos (Remitos, Romaneos y Conformes)
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Style */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#333333] p-0.5 bg-slate-100 dark:bg-[#252525]">
            <button
              onClick={() => setViewStyle('excel')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                viewStyle === 'excel'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
              title="Estilo fiel a la planilla original (colores naranja y celeste)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Vista Planilla
            </button>
            <button
              onClick={() => setViewStyle('modern')}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                viewStyle === 'modern'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
              title="Estilo WMS moderno oscuro con badges iluminados"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Vista WMS
            </button>
          </div>

          {/* Botón: Solicitudes y Borradores (Tabla Paralela) */}
          <button
            onClick={() => setIsDrawerParalelasOpen(true)}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
            title="Abrir tabla paralela de solicitudes y borradores"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Tabla Paralela /</span> Borradores
          </button>

          {/* Botón para Operadores: Compartir por WhatsApp con Token */}
          {!isClienteUser && (
            <button
              onClick={() => setIsCompartirModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
              title="Generar enlace seguro con vencimiento para enviar por WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
              <span className="hidden sm:inline">Acceso</span> WhatsApp
            </button>
          )}

          {/* Botón para Operadores: Nuevo Renglón Oficial */}
          {!isClienteUser && (
            <button
              onClick={() => setIsNuevoModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Renglón
            </button>
          )}

          {/* Exportar Excel */}
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#3a3939] hover:bg-slate-100 dark:hover:bg-[#252525] text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5"
            title="Exportar archivo compatible con Excel (.xls con colores)"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>

          {/* Imprimir */}
          <button
            onClick={handlePrint}
            className="p-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#333333] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 transition-colors"
            title="Imprimir planilla"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Refrescar */}
          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="p-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#333333] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 transition-colors"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards / Counters Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 print:hidden">
        {/* Total Rollos */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#302f2f] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Total Rollos
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
                {stats.totalRollos.toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                ({stats.totalPedidos} renglones)
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#282727] text-slate-700 dark:text-slate-300 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* 🟠 Entregados (Naranja) */}
        <div
          onClick={() => setFiltroEstado(filtroEstado === 'entregado' ? 'todos' : 'entregado')}
          className={`p-3.5 rounded-xl border shadow-sm cursor-pointer transition-all ${
            filtroEstado === 'entregado'
              ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/80 dark:bg-amber-950/40'
              : 'bg-white dark:bg-[#1c1b1b] border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-50/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFC000] border border-amber-600 inline-block" />
              🟠 Entregados
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300">
              {stats.countEntregados}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {stats.rollosEntregados.toLocaleString()}
            </span>
            <span className="text-[11px] text-amber-700/70 dark:text-amber-300/70">rollos</span>
          </div>
        </div>

        {/* 🔵 Programados (Celeste) */}
        <div
          onClick={() => setFiltroEstado(filtroEstado === 'programado' ? 'todos' : 'programado')}
          className={`p-3.5 rounded-xl border shadow-sm cursor-pointer transition-all ${
            filtroEstado === 'programado'
              ? 'ring-2 ring-sky-500 border-sky-500 bg-sky-50/80 dark:bg-sky-950/40'
              : 'bg-white dark:bg-[#1c1b1b] border-sky-200/60 dark:border-sky-900/40 hover:bg-sky-50/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 block flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#BDD7EE] border border-sky-600 inline-block" />
              🔵 Programados
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-800 dark:text-sky-300">
              {stats.countProgramados}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-sky-600 dark:text-sky-400 font-mono">
              {stats.rollosProgramados.toLocaleString()}
            </span>
            <span className="text-[11px] text-sky-700/70 dark:text-sky-300/70">rollos</span>
          </div>
        </div>

        {/* 🟢 En Tránsito */}
        <div
          onClick={() => setFiltroEstado(filtroEstado === 'en_transito' ? 'todos' : 'en_transito')}
          className={`p-3.5 rounded-xl border shadow-sm cursor-pointer transition-all ${
            filtroEstado === 'en_transito'
              ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40'
              : 'bg-white dark:bg-[#1c1b1b] border-emerald-200/60 dark:border-emerald-900/40 hover:bg-emerald-50/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-600 inline-block" />
              🟢 En Tránsito
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              {stats.countEnTransito}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {stats.rollosEnTransito.toLocaleString()}
            </span>
            <span className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70">rollos</span>
          </div>
        </div>

        {/* ⚪ Pendientes */}
        <div
          onClick={() => setFiltroEstado(filtroEstado === 'pendiente' ? 'todos' : 'pendiente')}
          className={`p-3.5 rounded-xl border shadow-sm cursor-pointer transition-all col-span-2 sm:col-span-4 lg:col-span-1 ${
            filtroEstado === 'pendiente'
              ? 'ring-2 ring-slate-400 border-slate-400 bg-slate-100 dark:bg-slate-800'
              : 'bg-white dark:bg-[#1c1b1b] border-slate-200 dark:border-[#302f2f] hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-500 inline-block" />
              ⚪ Pendientes
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {stats.countPendientes}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-black text-slate-700 dark:text-slate-300 font-mono">
              {stats.rollosPendientes.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-500">rollos</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-[#1c1b1b] rounded-xl p-3 border border-slate-200 dark:border-[#2f2e2e] shadow-sm flex flex-wrap items-center gap-2.5 print:hidden">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Pedido, Item, OC, Depósito, Destinatario o Comentario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#252525] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Destinatario / Cliente Filter Selector */}
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            disabled={isClienteUser}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#252525] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:opacity-80"
          >
            <option value="todos">Todos los Destinatarios</option>
            <option value="MITRE">MITRE</option>
            <option value="LAVALLE">LAVALLE</option>
            <option value="LINIK">LINIK</option>
            <option value="JPAN (CELINA)">JPAN (CELINA)</option>
            <option value="JAIME SALEM">JAIME SALEM</option>
            <option value="FLOWER TIME">FLOWER TIME</option>
            <option value="HUBER">HUBER</option>
            <option value="NICARRABLA">NICARRABLA</option>
            <option value="OMEPETEX">OMEPETEX</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.razon_social}>
                {c.razon_social}
              </option>
            ))}
          </select>
        </div>

        {/* Depósito Filter */}
        <div className="flex items-center gap-1.5">
          <Warehouse className="w-4 h-4 text-slate-400" />
          <select
            value={filtroDeposito}
            onChange={(e) => setFiltroDeposito(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#252525] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            <option value="todos">Todos los Depósitos</option>
            <option value="RONDEAU">RONDEAU</option>
            <option value="MENDEZ">MENDEZ</option>
            <option value="HEREDIA">HEREDIA</option>
            <option value="LARRALDE">LARRALDE</option>
            {almacenes.map((a) => (
              <option key={a.id} value={a.nombre}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filters */}
        {!isClienteUser &&
          (filtroCliente !== 'todos' || filtroEstado !== 'todos' || filtroDeposito !== 'todos' || searchTerm) && (
            <button
              onClick={() => {
                setFiltroCliente('todos');
                setFiltroEstado('todos');
                setFiltroDeposito('todos');
                setSearchTerm('');
              }}
              className="px-2.5 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
      </div>

      {/* Main Grid Spreadsheet Table */}
      <div className="bg-white dark:bg-[#1b1a1a] rounded-2xl border border-slate-300 dark:border-[#302f2f] shadow-lg overflow-hidden">
        {/* Printable Header */}
        <div className="hidden print:block p-4 border-b border-black text-center">
          <h2 className="text-xl font-bold uppercase tracking-wider">
            PLANILLA DE PROGRAMACIÓN DE PEDIDOS Y ENTREGAS
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Destinatario: {filtroCliente !== 'todos' ? filtroCliente : 'TODOS'} | Fecha de emisión: {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>

        <div className="overflow-x-auto max-h-[72vh] relative">
          <table className="w-full text-left border-collapse select-text">
            {/* Table Header */}
            <thead className="sticky top-0 z-20 bg-slate-200 dark:bg-[#282727] text-slate-800 dark:text-slate-100 uppercase text-[11px] font-black tracking-wider border-b-2 border-slate-400 dark:border-[#403f3f] shadow-sm">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center w-[85px]">
                  FECHA
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] w-[140px]">
                  DESTINATARIO (CLIENTE)
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center w-[75px]">
                  ROLLOS
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] w-[150px]">
                  ITEM
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] w-[170px]">
                  ORDEN DE COMPRA
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center w-[110px]">
                  PEDIDO
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center w-[95px]">
                  DEPOSITO
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center w-[160px] print:hidden">
                  DOCUMENTOS ADJUNTOS
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center w-[115px]">
                  ESTADO
                </th>
                <th className="py-2.5 px-3 min-w-[200px]">
                  COMENTARIOS
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200 dark:divide-[#2e2d2d] text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 dark:text-slate-500">
                    <RefreshCw className="w-7 h-7 animate-spin mx-auto mb-2 text-amber-500" />
                    Cargando planilla de programación...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 dark:text-slate-500">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No se encontraron pedidos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  let rowBgClass = '';

                  if (viewStyle === 'excel') {
                    if (item.estado === 'entregado') {
                      rowBgClass = 'bg-[#FFC000] hover:bg-[#F0B400] text-black font-medium border-b border-[#D4A000]';
                    } else if (item.estado === 'programado') {
                      rowBgClass = 'bg-[#BDD7EE] hover:bg-[#AACEEA] text-[#13294B] font-medium border-b border-[#97B8D9]';
                    } else if (item.estado === 'en_transito') {
                      rowBgClass = 'bg-[#C6EFCE] hover:bg-[#B5E6BE] text-[#006100] border-b border-[#A2D9AC]';
                    } else if (item.estado === 'con_novedad') {
                      rowBgClass = 'bg-[#FFC7CE] hover:bg-[#FBB9C1] text-[#9C0006] border-b border-[#EEA4AD]';
                    } else {
                      rowBgClass = 'bg-white dark:bg-[#1f1e1e] hover:bg-slate-50 dark:hover:bg-[#252424]';
                    }
                  } else {
                    if (item.estado === 'entregado') {
                      rowBgClass = 'bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500';
                    } else if (item.estado === 'programado') {
                      rowBgClass = 'bg-sky-500/5 hover:bg-sky-500/10 border-l-4 border-l-sky-500';
                    } else if (item.estado === 'en_transito') {
                      rowBgClass = 'bg-emerald-500/5 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500';
                    } else {
                      rowBgClass = 'hover:bg-slate-50 dark:hover:bg-[#252424]';
                    }
                  }

                  const isEditingComment = editingItemId === item.id;
                  const docs = item.documentos || {
                    tiene_remito: item.estado === 'entregado',
                    tiene_romaneo: true,
                    tiene_pedido: true,
                    tiene_rx_conformado: item.estado === 'entregado',
                  };

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors border-b ${rowBgClass}`}
                    >
                      {/* 1. FECHA */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 text-center font-mono font-bold whitespace-nowrap">
                        {item.fecha_display || formatFechaCorta(item.fecha)}
                      </td>

                      {/* 2. DESTINATARIO (CLIENTE) */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 font-bold tracking-tight uppercase whitespace-nowrap">
                        {item.destinatario_nombre || item.cliente_nombre}
                      </td>

                      {/* 3. ROLLOS */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 text-center font-mono font-black text-sm">
                        {item.rollos}
                      </td>

                      {/* 4. ITEM */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 font-mono font-bold uppercase whitespace-nowrap">
                        {item.item_codigo}
                      </td>

                      {/* 5. ORDEN DE COMPRA */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 font-mono text-[11px] whitespace-nowrap">
                        {item.orden_compra}
                      </td>

                      {/* 6. PEDIDO */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 text-center font-mono font-bold text-[11px] whitespace-nowrap">
                        {item.pedido_numero}
                      </td>

                      {/* 7. DEPOSITO */}
                      <td className="py-2 px-3 border-r border-black/10 dark:border-white/10 text-center font-bold text-[11px] uppercase whitespace-nowrap">
                        {item.deposito}
                      </td>

                      {/* 8. DOCUMENTOS ADJUNTOS (REMITO, ROMANEO, PEDIDO, RX CONFORMADO) */}
                      <td className="py-1.5 px-2 border-r border-black/10 dark:border-white/10 text-center whitespace-nowrap print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          {/* Remito */}
                          <button
                            onClick={() => handleOpenDoc(item, 'remito')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-0.5 ${
                              docs.tiene_remito
                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-400 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700 opacity-60'
                            }`}
                            title={docs.tiene_remito ? 'Ver Remito Oficial' : 'Remito en preparación'}
                          >
                            <FileCheck2 className="w-3 h-3" />
                            RTO
                          </button>

                          {/* Romaneo */}
                          <button
                            onClick={() => handleOpenDoc(item, 'romaneo')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-0.5 ${
                              docs.tiene_romaneo
                                ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-400 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700 opacity-60'
                            }`}
                            title="Ver Planilla de Romaneo de Rollos"
                          >
                            <FileSpreadsheet className="w-3 h-3" />
                            ROM
                          </button>

                          {/* Pedido */}
                          <button
                            onClick={() => handleOpenDoc(item, 'pedido')}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-400 shadow-sm flex items-center gap-0.5"
                            title="Ver Comprobante de Pedido"
                          >
                            <FileText className="w-3 h-3" />
                            PED
                          </button>

                          {/* Rx Conformado (Firmado) */}
                          <button
                            onClick={() => handleOpenDoc(item, 'rx_conformado')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-0.5 ${
                              docs.tiene_rx_conformado
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-500 font-black shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700 opacity-50'
                            }`}
                            title={
                              docs.tiene_rx_conformado
                                ? 'Ver Remito Conformado con Firma de Entrega'
                                : 'Pendiente de entrega / firma'
                            }
                          >
                            <UserCheck className="w-3 h-3" />
                            RX
                          </button>
                        </div>
                      </td>

                      {/* 9. ESTADO (Con selector para Operador o Badge para Cliente) */}
                      <td className="py-1.5 px-2.5 border-r border-black/10 dark:border-white/10 text-center whitespace-nowrap">
                        {isClienteUser ? (
                          // Modo Sólo Lectura para Clientes
                          <span
                            className={`inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-md border shadow-sm ${
                              item.estado === 'entregado'
                                ? 'bg-amber-400 text-amber-950 border-amber-600'
                                : item.estado === 'programado'
                                ? 'bg-sky-300 text-sky-950 border-sky-600'
                                : item.estado === 'en_transito'
                                ? 'bg-emerald-300 text-emerald-950 border-emerald-600'
                                : item.estado === 'con_novedad'
                                ? 'bg-rose-300 text-rose-950 border-rose-600'
                                : 'bg-slate-200 text-slate-800 border-slate-400'
                            }`}
                          >
                            {item.estado === 'entregado' && '🟠 Entregado'}
                            {item.estado === 'programado' && '🔵 Programado'}
                            {item.estado === 'en_transito' && '🟢 En Tránsito'}
                            {item.estado === 'pendiente' && '⚪ Pendiente'}
                            {item.estado === 'con_novedad' && '🔴 Con Novedad'}
                          </span>
                        ) : (
                          // Modo Operador WMS (Interactivo)
                          <select
                            value={item.estado}
                            onChange={(e) =>
                              handleCambiarEstado(item, e.target.value as EstadoProgramacion)
                            }
                            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border shadow-sm cursor-pointer transition-all ${
                              item.estado === 'entregado'
                                ? 'bg-amber-400 text-amber-950 border-amber-600 font-extrabold'
                                : item.estado === 'programado'
                                ? 'bg-sky-300 text-sky-950 border-sky-600 font-extrabold'
                                : item.estado === 'en_transito'
                                ? 'bg-emerald-300 text-emerald-950 border-emerald-600 font-extrabold'
                                : item.estado === 'con_novedad'
                                ? 'bg-rose-300 text-rose-950 border-rose-600 font-extrabold'
                                : 'bg-slate-200 text-slate-800 border-slate-400'
                            }`}
                          >
                            <option value="programado">🔵 Programado</option>
                            <option value="entregado">🟠 Entregado</option>
                            <option value="en_transito">🟢 En Tránsito</option>
                            <option value="pendiente">⚪ Pendiente</option>
                            <option value="con_novedad">🔴 Con Novedad</option>
                          </select>
                        )}
                      </td>

                      {/* 10. COMENTARIOS */}
                      <td className="py-2 px-3 font-semibold relative group">
                        {isEditingComment && !isClienteUser ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={editCommentText}
                              onChange={(e) => setEditCommentText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveComment(item);
                                if (e.key === 'Escape') setEditingItemId(null);
                              }}
                              className="w-full px-2 py-1 text-xs rounded border border-amber-500 bg-white dark:bg-[#252525] text-slate-900 dark:text-white focus:outline-none"
                              placeholder="Escribir comentario..."
                            />
                            <button
                              onClick={() => handleSaveComment(item)}
                              className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              title="Guardar"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingItemId(null)}
                              className="p-1 rounded bg-slate-300 text-slate-700 hover:bg-slate-400"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              if (!isClienteUser) {
                                setEditingItemId(item.id);
                                setEditCommentText(item.comentarios || '');
                              }
                            }}
                            className={`flex items-center justify-between gap-2 min-h-[20px] ${
                              !isClienteUser ? 'cursor-pointer' : ''
                            }`}
                            title={!isClienteUser ? 'Haga clic para editar comentarios' : undefined}
                          >
                            {item.comentarios ? (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                                  item.comentarios_highlight
                                    ? 'bg-[#FFC000] text-black border border-amber-600 font-black shadow-sm'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {item.comentarios}
                              </span>
                            ) : (
                              <span className="text-[10px] text-black/30 dark:text-white/30 italic">
                                {!isClienteUser ? '+ Agregar nota...' : '-'}
                              </span>
                            )}
                            {!isClienteUser && (
                              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-700 dark:text-slate-300 transition-opacity" />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Table Footer / Summary Row */}
            <tfoot className="sticky bottom-0 z-20 bg-slate-200 dark:bg-[#262525] text-slate-900 dark:text-white font-bold border-t-2 border-slate-400 dark:border-[#403f3f] shadow-md">
              <tr>
                <td className="py-2.5 px-3 text-center border-r border-slate-300 dark:border-[#3a3939] uppercase text-xs font-black">
                  TOTALES
                </td>
                <td className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-xs font-black">
                  {filtroCliente !== 'todos' ? filtroCliente : 'CONSOLIDADO'}
                </td>
                <td className="py-2.5 px-3 border-r border-slate-300 dark:border-[#3a3939] text-center font-mono font-black text-sm text-amber-600 dark:text-amber-400">
                  {stats.totalRollos.toLocaleString()}
                </td>
                <td
                  colSpan={7}
                  className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300"
                >
                  <span className="font-bold">{filteredItems.length}</span> pedidos |{' '}
                  <span className="text-amber-600 dark:text-amber-400 font-bold">
                    {stats.rollosEntregados}
                  </span>{' '}
                  rollos entregados |{' '}
                  <span className="text-sky-600 dark:text-sky-400 font-bold">
                    {stats.rollosProgramados}
                  </span>{' '}
                  rollos programados
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modals */}
      <NuevoItemProgramacionModal
        isOpen={isNuevoModalOpen}
        onClose={() => setIsNuevoModalOpen(false)}
        onGuardar={handleGuardarNuevo}
        clientes={clientes}
        almacenes={almacenes}
        defaultClienteNombre={filtroCliente !== 'todos' ? filtroCliente : undefined}
      />

      <CompartirAccesoClienteModal
        isOpen={isCompartirModalOpen}
        onClose={() => setIsCompartirModalOpen(false)}
        clientes={clientes}
        currentClienteNombre={filtroCliente !== 'todos' ? filtroCliente : undefined}
      />

      <DocumentoVisorModal
        isOpen={!!selectedDocItem}
        onClose={() => setSelectedDocItem(null)}
        item={selectedDocItem}
        tipoDocumento={tipoDocumentoVisor}
      />

      <SolicitudesParalelasDrawer
        isOpen={isDrawerParalelasOpen}
        onClose={() => setIsDrawerParalelasOpen(false)}
        clienteNombre={filtroCliente !== 'todos' ? filtroCliente : undefined}
        isClientPortal={isClienteUser}
        onSolicitudAprobada={(itemOficial) => {
          setItems((prev) => [itemOficial, ...prev]);
        }}
      />
    </div>
  );
};
