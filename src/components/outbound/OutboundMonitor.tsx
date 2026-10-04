import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  FileText,
  Truck,
  MapPin,
  RefreshCw,
  Send,
  PackageCheck,
  Plus,
  Zap,
  Printer,
  Calendar,
  AlertTriangle,
  Layers,
  Box,
  Scale,
  DollarSign,
  ChevronRight,
  FileSpreadsheet,
  Navigation,
  ExternalLink,
  Tablet,
  Check,
  Eye,
  Paperclip,
  Camera,
  ShieldCheck,
  AlertCircle,
  X,
  Sparkles,
  Image as ImageIcon,
  Phone,
  User,
  Cloud,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime, formatNumber, formatM3, compressImage } from '@/lib/utils';
import { pedidosApi } from '@/api/pedidosApi';
import { despachosApi } from '@/api/despachosApi';
import { calcularEtasRuta } from '@/lib/etaService';
import {
  subirDocumentoAGoogleDrive,
  normalizarUrlGoogleDrive,
  obtenerUrlVisorGoogleDrive,
  isGoogleDriveConfigured,
} from '@/lib/googleDriveService';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { NuevoPedidoModal } from './NuevoPedidoModal';
import { ImportarPedidosModal } from './ImportarPedidosModal';
import { PackingStationModal } from './PackingStationModal';
import { RemitoPrintModal } from './RemitoPrintModal';
import { AsignarRutaModal } from './AsignarRutaModal';
import { HojaRutaPrintModal } from './HojaRutaPrintModal';
import { GoogleDriveConfigModal } from '@/components/common/GoogleDriveConfigModal';

interface OutboundMonitorProps {
  pedidos: any[];
  ordenesSalida: any[];
  onRefresh: () => void;
  isDark: boolean;
  clientes?: any[];
  almacenes?: any[];
  selectedClienteId?: string;
  selectedAlmacenId?: string;
  onOpenTabletChofer?: (rutaId?: string) => void;
}

export const OutboundMonitor: React.FC<OutboundMonitorProps> = ({
  pedidos,
  ordenesSalida,
  onRefresh,
  isDark,
  clientes = [],
  almacenes = [],
  selectedClienteId,
  selectedAlmacenId,
  onOpenTabletChofer,
}) => {
  // Navigation View Tab: 'pedidos' | 'remitos' | 'rutas'
  const [activeSubTab, setActiveSubTab] = useState<'pedidos' | 'remitos' | 'rutas'>('pedidos');

  // Selected Order Detail
  const [selectedPedido, setSelectedPedido] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailData, setDetailData] = useState<any | null>(null);

  // Modals state
  const [nuevoPedidoOpen, setNuevoPedidoOpen] = useState(false);
  const [importarModalOpen, setImportarModalOpen] = useState(false);
  const [packingModalOpen, setPackingModalOpen] = useState(false);
  const [remitoModalOpen, setRemitoModalOpen] = useState(false);
  const [asignarRutaOpen, setAsignarRutaOpen] = useState(false);
  const [pedidoForRemito, setPedidoForRemito] = useState<any | null>(null);

  // Picking Task Confirmation Modal
  const [pickingModalOpen, setPickingModalOpen] = useState(false);
  const [activePickingTask, setActivePickingTask] = useState<any | null>(null);
  const [cantidadRecolectada, setCantidadRecolectada] = useState<number>(0);
  const [novedadFaltante, setNovedadFaltante] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Status Filter for Orders
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');

  // Remitos & Rutas lists
  const [remitosList, setRemitosList] = useState<any[]>([]);
  const [rutasConParadas, setRutasConParadas] = useState<any[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [rutaParaImprimir, setRutaParaImprimir] = useState<any | null>(null);
  const [actualizandoRutaId, setActualizandoRutaId] = useState<string | null>(null);

  // Estados para Adjuntar Documentación y Visualización de Fotos POD
  const [paradaParaAdjuntarDoc, setParadaParaAdjuntarDoc] = useState<any | null>(null);
  const [fotoAdjuntoBase64, setFotoAdjuntoBase64] = useState<string | null>(null);
  const [obsAdjunto, setObsAdjunto] = useState('');
  const [isSubmittingAdjunto, setIsSubmittingAdjunto] = useState(false);
  const [fotoZoomUrl, setFotoZoomUrl] = useState<string | null>(null);
  const [googleDriveModalOpen, setGoogleDriveModalOpen] = useState(false);

  // Precargar rutas siempre para detectar si hay ruta activa en reparto (Hero Card)
  useEffect(() => {
    const cargarRutasIniciales = async () => {
      try {
        const rutData = await despachosApi.listarRutasConParadas(selectedAlmacenId || undefined);
        setRutasConParadas(rutData || []);
      } catch (err: any) {
        console.error('Error precargando rutas:', err);
      }
    };
    cargarRutasIniciales();
  }, [selectedAlmacenId]);

  // Fetch Remitos and Rutas when respective tabs are open
  useEffect(() => {
    if (activeSubTab === 'remitos' || activeSubTab === 'rutas') {
      const cargarExtras = async () => {
        setLoadingExtras(true);
        try {
          const [remData, rutData] = await Promise.all([
            despachosApi.listarRemitos(selectedClienteId || undefined),
            despachosApi.listarRutasConParadas(selectedAlmacenId || undefined),
          ]);
          setRemitosList(remData || []);
          setRutasConParadas(rutData || []);
        } catch (err: any) {
          console.error('Error cargando remitos y rutas:', err);
        } finally {
          setLoadingExtras(false);
        }
      };
      cargarExtras();
    }
  }, [activeSubTab, selectedClienteId, selectedAlmacenId]);

  const handleCambiarEstadoRuta = async (
    rutaId: string,
    nuevoEstado: 'programada' | 'en_carga' | 'en_viaje' | 'itinerario_cumplido'
  ) => {
    setActualizandoRutaId(rutaId);
    try {
      await despachosApi.actualizarEstadoRuta(rutaId, nuevoEstado);

      // Si la ruta pasa a 'en_viaje' o 'itinerario_cumplido', despachar automáticamente los pedidos asociados que aún estén preparados o agrupados
      if (nuevoEstado === 'en_viaje' || nuevoEstado === 'itinerario_cumplido') {
        const rutaActual = rutasConParadas.find((r) => r.id === rutaId);
        if (rutaActual && rutaActual.paradas) {
          for (const parada of rutaActual.paradas) {
            const pedidoId = parada.pedido_id || parada.pedido?.id;
            if (pedidoId) {
              const ped = pedidos.find((p) => p.id === pedidoId);
              if (ped && ped.estado !== 'despachado') {
                try {
                  await pedidosApi.despacharPedido(pedidoId);
                } catch (despErr) {
                  console.warn(`Error al auto-despachar pedido ${pedidoId} en salida de ruta:`, despErr);
                }
              }
            }
          }
        }
      }

      const rutData = await despachosApi.listarRutasConParadas(selectedAlmacenId || undefined);
      setRutasConParadas(rutData || []);
      onRefresh();
    } catch (err: any) {
      console.error('Error actualizando estado ruta:', err);
    } finally {
      setActualizandoRutaId(null);
    }
  };

  const handleSelectPedido = async (ped: any) => {
    setSelectedPedido(ped);
    setLoadingDetail(true);
    try {
      const data = await pedidosApi.obtenerPedidoConDetalle(ped.id);
      setDetailData(data);
    } catch (err: any) {
      console.error('Error fetching order detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDespacharPedido = async (pedidoId: string) => {
    if (
      !window.confirm(
        '¿Confirmas el despacho de este pedido? Esto descontará el stock físico reservado en almacén y registrará la salida definitiva en el Kardex.'
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res: any = await pedidosApi.despacharPedido(pedidoId);
      setFeedbackMsg({
        type: 'success',
        text: `¡Pedido despachado con éxito! Se descontaron ${res?.total_unidades_despachadas || 0} unidades del inventario físico.`,
      });
      if (selectedPedido?.id === pedidoId) {
        setSelectedPedido((prev: any) => (prev ? { ...prev, estado: 'despachado' } : null));
        try {
          const freshData = await pedidosApi.obtenerPedidoConDetalle(pedidoId);
          setDetailData(freshData);
        } catch (fetchErr) {
          console.warn('Aviso refrescando detalle:', fetchErr);
        }
      }
      onRefresh();
    } catch (err: any) {
      console.error('Error despachando pedido:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al despachar pedido',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjuntarDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paradaParaAdjuntarDoc) return;
    setIsSubmittingAdjunto(true);
    try {
      let finalDocUrl = fotoAdjuntoBase64;

      // Si es una imagen nueva en base64, subirla a Google Drive o Supabase Storage
      // para NO cargar la base de datos con megabytes de texto binario
      if (fotoAdjuntoBase64 && (fotoAdjuntoBase64.startsWith('data:') || fotoAdjuntoBase64.length > 500)) {
        const remitCode = paradaParaAdjuntarDoc.remito?.numero_remito_rx || 'Remito';
        const sec = paradaParaAdjuntarDoc.secuencia_parada || 1;
        const uploadRes = await subirDocumentoAGoogleDrive({
          base64: fotoAdjuntoBase64,
          fileName: `${remitCode}_Parada-${sec}_${Date.now()}.jpg`,
          folder: 'Remitos_Conformados',
        });
        finalDocUrl = uploadRes.url;
      }

      await despachosApi.adjuntarDocumentoParada({
        paradaId: paradaParaAdjuntarDoc.id,
        fotoRemitoUrl: finalDocUrl || '',
        observaciones: obsAdjunto || undefined,
      });

      const rutData = await despachosApi.listarRutasConParadas(selectedAlmacenId || undefined);
      setRutasConParadas(rutData || []);
      setFeedbackMsg({
        type: 'success',
        text: 'Documento respaldado en Google Drive / Nube y vinculado a la parada.',
      });
      setParadaParaAdjuntarDoc(null);
      setFotoAdjuntoBase64(null);
      setObsAdjunto('');
    } catch (err: any) {
      console.error('Error adjuntando documentación:', err);
      setFeedbackMsg({
        type: 'error',
        text: 'No se pudo guardar la documentación de entrega.',
      });
    } finally {
      setIsSubmittingAdjunto(false);
    }
  };

  // Trigger FEFO/FIFO Allocation RPC
  const handleAsignarFEFO = async (pedidoId: string) => {
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res: any = await pedidosApi.asignarPickingFEFO(pedidoId);
      if (res.exito === false) {
        setFeedbackMsg({
          type: 'error',
          text: `Aviso: ${res.mensaje || 'No hay existencias disponibles en almacén para reservar este pedido.'}`,
        });
      } else {
        const msgBackorder = res.tiene_backorder
          ? ` ⚠️ Aviso: Hubo faltante de ${res.faltante_total} unidades que quedaron en backorder pendiente.`
          : '';
        setFeedbackMsg({
          type: 'success',
          text: `¡Alocación FEFO exitosa! Se reservaron ${res.total_unidades_reservadas} unidades en ${res.tareas_creadas} tareas de picking.${msgBackorder}`,
        });
      }
      onRefresh();
      if (selectedPedido?.id === pedidoId) {
        handleSelectPedido(selectedPedido);
      }
    } catch (err: any) {
      console.error('Error en alocación FEFO:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al ejecutar alocación automática FEFO en base de datos',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Short-ship / Ajustar al stock preparado (corte de backorder)
  const handleAjustarStockPreparado = async (pedidoId: string) => {
    if (!window.confirm('¿Deseas recortar la cantidad solicitada al stock efectivamente reservado/separado para cerrar los faltantes de backorder y liberar el pedido?')) {
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res: any = await pedidosApi.ajustarPedidoStockPreparado(pedidoId);
      setFeedbackMsg({
        type: 'success',
        text: `¡Corte completado! Se recortaron ${res.unidades_recortadas} unidades en ${res.renglones_ajustados} renglón(es). Estado actual: ${res.nuevo_estado}.`,
      });
      onRefresh();
      if (selectedPedido?.id === pedidoId) {
        handleSelectPedido(selectedPedido);
      }
    } catch (err: any) {
      console.error('Error al ajustar a stock preparado:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al ejecutar corte de pedido en base de datos',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Picking with Shortage/Novelty Support
  const handleConfirmPicking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePickingTask) return;
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res: any = await pedidosApi.confirmarPicking({
        tareaPickingId: activePickingTask.id,
        cantidadRecolectada,
        novedad: novedadFaltante.trim() || undefined,
      });

      const msgFaltante = res.faltante > 0 ? ` (Faltante registrado: ${res.faltante} un.)` : '';
      setFeedbackMsg({
        type: 'success',
        text: `¡Picking confirmado! Stock descontado de ubicación y Kardex registrado${msgFaltante}.`,
      });

      setTimeout(() => {
        setPickingModalOpen(false);
        setActivePickingTask(null);
        setNovedadFaltante('');
        if (selectedPedido) handleSelectPedido(selectedPedido);
        onRefresh();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al ejecutar picking en base de datos',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPedidos = pedidos.filter((p) => {
    if (filtroEstado === 'todos') return true;
    if (filtroEstado === 'backorders') {
      const detalles = p.detalles || [];
      const totalSol = detalles.reduce((acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0), 0);
      const totalCubierto = detalles.reduce((acc: number, d: any) => acc + Math.max(Number(d.cantidad_reservada || 0), Number(d.cantidad_separada || 0)), 0);
      return totalSol > totalCubierto && p.estado !== 'despachado' && p.estado !== 'cancelado';
    }
    return p.estado === filtroEstado;
  });

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'despachado':
        return <Badge variant="success">Despachado</Badge>;
      case 'agrupado_salida':
        return <Badge variant="info">Remitido / Ruta</Badge>;
      case 'preparado':
        return <Badge variant="success">Preparado (Listo)</Badge>;
      case 'en_picking':
        return <Badge variant="warning">En Picking</Badge>;
      case 'asignado_picking':
        return <Badge variant="info">Asignado FEFO</Badge>;
      case 'ingresado':
        return <Badge variant="default">Ingresado (Pendiente)</Badge>;
      default:
        return <Badge variant="outline">{estado || 'Pendiente'}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
            <ArrowUpFromLine className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
            Gestión Integral de Outbound: Pedidos, Packing & Remitos Rx
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mt-0.5">
            Alocación FEFO/FIFO, recolección discreta, mesa de control de empaque y emisión de Remitos de Tránsito.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setNuevoPedidoOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Pedido</span>
          </button>

          <button
            onClick={() => setImportarModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-violet-200 dark:border-[#dab9ff]/40 bg-violet-50 dark:bg-[#26133b] hover:bg-violet-100 dark:hover:bg-[#351a52] text-violet-700 dark:text-[#dab9ff] transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Importar CSV / Excel</span>
          </button>

          <button
            onClick={() => setAsignarRutaOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#201f1f] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] text-pink-700 dark:text-[#ffb1c5] transition-colors shadow-xs"
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Despacho & Hoja de Ruta</span>
          </button>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] hover:bg-slate-50 dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-[#333333] gap-2 text-xs font-semibold pb-1">
        <button
          onClick={() => setActiveSubTab('pedidos')}
          className={`relative px-3.5 py-2 transition-colors rounded-lg flex items-center gap-2 ${
            activeSubTab === 'pedidos'
              ? 'text-violet-700 dark:text-[#dab9ff]'
              : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
          }`}
        >
          {activeSubTab === 'pedidos' && (
            <motion.div
              layoutId="outboundSubTabGlow"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              className="absolute inset-0 bg-violet-100 dark:bg-[#dab9ff]/15 border border-violet-300 dark:border-[#dab9ff]/40 rounded-lg -z-10 shadow-xs"
            />
          )}
          <Box className="w-3.5 h-3.5" />
          <span>Pedidos y Preparación ({pedidos.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('remitos')}
          className={`relative px-3.5 py-2 transition-colors rounded-lg flex items-center gap-2 ${
            activeSubTab === 'remitos'
              ? 'text-sky-700 dark:text-[#75d1ff]'
              : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
          }`}
        >
          {activeSubTab === 'remitos' && (
            <motion.div
              layoutId="outboundSubTabGlow"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              className="absolute inset-0 bg-sky-100 dark:bg-[#75d1ff]/15 border border-sky-300 dark:border-[#75d1ff]/40 rounded-lg -z-10 shadow-xs"
            />
          )}
          <FileText className="w-3.5 h-3.5" />
          <span>Remitos Rx de Tránsito Emitidos</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rutas')}
          className={`relative px-3.5 py-2 transition-colors rounded-lg flex items-center gap-2 ${
            activeSubTab === 'rutas'
              ? 'text-pink-700 dark:text-[#ffb1c5]'
              : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
          }`}
        >
          {activeSubTab === 'rutas' && (
            <motion.div
              layoutId="outboundSubTabGlow"
              transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              className="absolute inset-0 bg-pink-100 dark:bg-[#ffb1c5]/15 border border-pink-300 dark:border-[#ffb1c5]/40 rounded-lg -z-10 shadow-xs"
            />
          )}
          <Truck className="w-3.5 h-3.5" />
          <span>Hojas de Ruta e Itinerarios ({ordenesSalida.length})</span>
        </button>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded text-xs font-medium flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#75d1ff] dark:border-[#1d4d38]'
              : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005]'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: PEDIDOS & PICKING */}
      {activeSubTab === 'pedidos' && (
        <div className="w-full space-y-4">
          {/* Pedidos List */}
          <div className="w-full">
            <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
              <div className="p-3 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                  Órdenes de Pedido ({filteredPedidos.length})
                </span>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 dark:text-[#cdc3d4]">Filtrar:</span>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="px-2.5 py-1 rounded bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs font-medium text-slate-800 dark:text-[#e5e2e1] cursor-pointer focus:outline-none focus:border-violet-500 shadow-xs"
                  >
                    <option value="todos">Todos los Estados</option>
                    <option value="backorders">⚠️ Con Backorders / Faltantes</option>
                    <option value="ingresado">Ingresados (Sin asignar)</option>
                    <option value="asignado_picking">Asignados FEFO</option>
                    <option value="en_picking">En Picking</option>
                    <option value="preparado">Preparados (Para Packing)</option>
                    <option value="agrupado_salida">Remitidos / En Ruta</option>
                    <option value="despachado">Despachados</option>
                  </select>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-[#44424a]">
                {filteredPedidos.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 dark:text-[#cdc3d4]">
                    <PackageCheck className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-[#978d9d] opacity-50" />
                    <p className="text-xs">No hay pedidos que coincidan con el filtro seleccionado</p>
                  </div>
                ) : (
                  filteredPedidos.map((ped, pIdx) => {
                    const isSelected = selectedPedido?.id === ped.id;
                    return (
                      <motion.div
                        key={ped.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(pIdx * 0.025, 0.25) }}
                        whileHover={{ y: -1, transition: { duration: 0.12 } }}
                        onClick={() => handleSelectPedido(ped)}
                        className={`p-2.5 sm:p-3 cursor-pointer transition-all border-b border-slate-100 dark:border-[#44424a] ${
                          isSelected
                            ? 'bg-violet-50/80 dark:bg-gradient-to-r dark:from-[#dab9ff]/15 dark:via-[#201330] dark:to-[#1c1b1b] border-l-4 border-l-violet-600 dark:border-l-[#dab9ff]'
                            : 'hover:bg-slate-50/80 dark:hover:bg-[#201f1f]/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">
                                {ped.numero_pedido}
                              </span>
                              {getStatusBadge(ped.estado)}
                              {ped.prioridad === 'urgente' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]">
                                  ⚡ URGENTE
                                </span>
                              )}
                              {(() => {
                                const dets = ped.detalles || [];
                                const sol = dets.reduce((acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0), 0);
                                const cub = dets.reduce((acc: number, d: any) => acc + Math.max(Number(d.cantidad_reservada || 0), Number(d.cantidad_separada || 0)), 0);
                                const falt = sol - cub;
                                if (falt > 0 && ped.estado !== 'despachado' && ped.estado !== 'cancelado') {
                                  return (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-[#3b2a10] dark:text-[#ffddb8] dark:border-[#6d4c1b]">
                                      ⚠️ Backorder ({falt} un.)
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-medium mt-0.5">
                              Cliente: <b className="text-slate-800 dark:text-[#e5e2e1]">{ped.cliente?.razon_social || '-'}</b>
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-[#cdc3d4]">
                              {formatDate(ped.fecha_solicitud)}
                            </span>
                            {ped.orden_compra_cliente && (
                              <div className="text-[10px] font-mono text-slate-400 dark:text-[#978d9d]">
                                OC: {ped.orden_compra_cliente}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-4 mt-2 pt-2 border-t border-slate-100 dark:border-[#333333] text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                            <span>
                              Destino: <b className="text-slate-800 dark:text-[#e5e2e1]">{ped.destinatario?.razon_social || 'Sucursal Principal'}</b> ({ped.destinatario?.ciudad || 'Local'})
                            </span>
                          </div>

                          {/* Action Shortcut Buttons right inside row */}
                          <div className="flex items-center gap-2">
                            {ped.estado === 'ingresado' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAsignarFEFO(ped.id);
                                }}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-xs"
                              >
                                <Zap className="w-3 h-3" />
                                Asignar FEFO
                              </button>
                            )}

                            {ped.estado === 'preparado' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPedido(ped);
                                    setPackingModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-[#38260a] dark:hover:bg-[#4a3410] dark:text-[#ffddb8] dark:border-[#7a4c10] transition-colors shadow-xs"
                                >
                                  <PackageCheck className="w-3 h-3" />
                                  Packing Station
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPedido(ped);
                                    setPedidoForRemito(ped);
                                    setRemitoModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:hover:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332] transition-colors shadow-xs"
                                >
                                  <FileText className="w-3 h-3" />
                                  Emitir Remito
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDespacharPedido(ped.id);
                                  }}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#2a0e12] dark:hover:bg-[#3d1419] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                                  title="Deduce el stock físico reservado y registra la salida definitiva en el Kardex"
                                >
                                  <Truck className="w-3 h-3" />
                                  Despachar
                                </button>
                              </>
                            )}

                            {ped.estado === 'agrupado_salida' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPedido(ped);
                                    setPedidoForRemito(ped);
                                    setRemitoModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border border-emerald-300 dark:border-[#1b4332] text-emerald-700 dark:text-[#69f0ae] bg-white dark:bg-transparent hover:bg-emerald-50 transition-colors shadow-xs"
                                >
                                  <Printer className="w-3 h-3" />
                                  Ver Remito Rx
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDespacharPedido(ped.id);
                                  }}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#2a0e12] dark:hover:bg-[#3d1419] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                                  title="Deduce el stock físico reservado y registra la salida definitiva en el Kardex"
                                >
                                  <Truck className="w-3 h-3" />
                                  Despachar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail & Picking Tasks Centered Modal */}
      <AnimatePresence>
        {selectedPedido && (
          <ModalPortal>
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setSelectedPedido(null)}
            >
              <div
                className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-[#e5e2e1]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between flex-shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                      Detalle y Tareas: <span className="font-mono text-violet-700 dark:text-[#dab9ff]">{selectedPedido.numero_pedido}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                      Renglones solicitados y tareas de picking asignadas
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPedido(null)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Pedido Status Actions Header */}
                <div className="p-3.5 bg-slate-50/80 dark:bg-[#201f1f]/60 border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase block">Estado Actual</span>
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">{selectedPedido.estado}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedPedido.estado === 'ingresado' && (
                      <button
                        onClick={() => handleAsignarFEFO(selectedPedido.id)}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-xs"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Asignar Picking (FEFO/FIFO)
                      </button>
                    )}

                    {(selectedPedido.estado === 'preparado' || selectedPedido.estado === 'agrupado_salida') && (
                      <>
                        <button
                          onClick={() => setPackingModalOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 dark:bg-[#38260a] dark:hover:bg-[#4a3410] dark:text-[#ffddb8] dark:border-[#7a4c10] transition-colors shadow-xs"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Packing Station
                        </button>
                        <button
                          onClick={() => {
                            setPedidoForRemito(selectedPedido);
                            setRemitoModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:hover:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332] transition-colors shadow-xs"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Remito Rx
                        </button>
                        <button
                          onClick={() => handleDespacharPedido(selectedPedido.id)}
                          disabled={isSubmitting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#2a0e12] dark:hover:bg-[#3d1419] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                          title="Deduce el stock físico reservado y registra la salida definitiva en el Kardex"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Despachar Salida
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Backorder Banner and Short-Ship Action */}
                {(() => {
                  if (!detailData?.detalles) return null;
                  const totalSol = detailData.detalles.reduce((acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0), 0);
                  const totalCub = detailData.detalles.reduce((acc: number, d: any) => acc + Math.max(Number(d.cantidad_reservada || 0), Number(d.cantidad_separada || 0)), 0);
                  const faltante = totalSol - totalCub;

                  if (faltante > 0 && selectedPedido.estado !== 'despachado' && selectedPedido.estado !== 'cancelado') {
                    return (
                      <div className="p-3 bg-amber-50/70 border-b border-amber-200 dark:bg-[#3b2a10]/50 dark:border-[#6d4c1b] space-y-2 flex-shrink-0">
                        <div className="flex items-center justify-between text-xs text-amber-900 dark:text-[#ffddb8]">
                          <span className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-[#ffddb8]" />
                            Saldo en Backorder: {faltante} un. pendientes de stock
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800/90 dark:text-[#ffddb8]/90">
                          Hay unidades que no pudieron reservarse por falta de existencias. Puedes re-intentar alocación al recibir ingresos o recortar el pedido a lo preparado.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={() => handleAsignarFEFO(selectedPedido.id)}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-white hover:bg-slate-100 text-violet-700 border border-violet-300 dark:bg-[#201f1f] dark:hover:bg-[#2a2a2a] dark:text-[#dab9ff] dark:border-[#dab9ff]/30 transition-colors shadow-xs"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Re-intentar Alocación FEFO
                          </button>
                          <button
                            onClick={() => handleAjustarStockPreparado(selectedPedido.id)}
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-xs"
                          >
                            <Zap className="w-3 h-3" />
                            Ajustar al Stock Preparado (Corte)
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Modal Scrollable Body */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  {loadingDetail ? (
                    <div className="py-8 text-center text-slate-400 dark:text-[#cdc3d4]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-600 dark:text-[#dab9ff]" />
                      <span className="text-xs">Cargando renglones del pedido...</span>
                    </div>
                  ) : !detailData?.detalles || detailData.detalles.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 dark:text-[#cdc3d4] text-xs">
                      Sin renglones para este pedido.
                    </div>
                  ) : (
                    detailData.detalles.map((det: any) => {
                      const tareas = det.tareas_picking || [];

                      return (
                        <div
                          key={det.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50/70 dark:bg-[#201f1f] space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">
                                {det.articulo?.sku} - {det.articulo?.nombre}
                              </span>
                              <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] font-mono mt-0.5">
                                Emb: {det.articulo?.unidades_por_bulto || 1} un/bulto | Vol: {formatM3(det.articulo?.volumen_unitario_m3 || 0)}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 dark:text-[#cdc3d4] block uppercase">Solicitado</span>
                              <span className="font-mono font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">
                                {det.cantidad_solicitada} un.
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-slate-200 dark:border-[#333333] font-mono">
                            <div>
                              <span className="text-slate-500 dark:text-[#cdc3d4] block">Reservado:</span>
                              <span className="font-bold text-sky-700 dark:text-[#75d1ff]">{det.cantidad_reservada || 0} un.</span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-[#cdc3d4] block">Separado / Pickeado:</span>
                              <span className="font-bold text-emerald-700 dark:text-[#69f0ae]">{det.cantidad_separada || 0} un.</span>
                            </div>
                          </div>

                          {/* Picking Task info if allocated */}
                          {tareas.length > 0 && (
                            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#333333]">
                              {tareas.map((t: any) => (
                                <div
                                  key={t.id}
                                  className="p-2 rounded bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-[11px] space-y-1 shadow-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-800 dark:text-[#e5e2e1] font-medium">
                                      {t.observaciones_picking || 'Tarea de picking'}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                                        t.estado === 'completada'
                                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332]'
                                          : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10]'
                                      }`}
                                    >
                                      {t.estado}
                                    </span>
                                  </div>

                                  {t.novedad_faltante && (
                                    <div className="text-[10px] text-rose-600 dark:text-[#ffb4ab] flex items-center gap-1 font-medium">
                                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                      <span>Novedad: {t.novedad_faltante}</span>
                                    </div>
                                  )}

                                  {t.estado !== 'completada' && (
                                    <div className="pt-1.5 flex justify-end">
                                      <button
                                        onClick={() => {
                                          setActivePickingTask(t);
                                          setCantidadRecolectada(t.cantidad_a_recolectar);
                                          setNovedadFaltante('');
                                          setPickingModalOpen(true);
                                        }}
                                        className="px-2.5 py-1 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-xs"
                                      >
                                        Confirmar Recolección
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-3 bg-slate-50 dark:bg-[#201f1f] border-t border-slate-200 dark:border-[#333333] flex justify-end flex-shrink-0">
                  <button
                    onClick={() => setSelectedPedido(null)}
                    className="px-4 py-1.5 text-xs font-semibold rounded bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-[#2a2a2a] dark:hover:bg-[#333333] dark:text-[#e5e2e1] transition-colors shadow-xs"
                  >
                    Cerrar Detalle
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}
      </AnimatePresence>

      {/* TAB 2: REMITOS RX DE TRÁNSITO */}
      {activeSubTab === 'remitos' && (
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
              Remitos de Tránsito Rx Emitidos ({remitosList.length})
            </span>
            <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono">
              Comprobantes fiscales de amparo de carga en viaje
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a]">
                <tr>
                  <th className="px-3 py-2 text-[11px] font-semibold">N° Remito Rx</th>
                  <th className="px-3 py-2 text-[11px] font-semibold">Fecha Emisión</th>
                  <th className="px-3 py-2 text-[11px] font-semibold">Cliente Depositante</th>
                  <th className="px-3 py-2 text-[11px] font-semibold">Destinatario / Ciudad</th>
                  <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Bultos</th>
                  <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Pallets</th>
                  <th className="px-2.5 py-2 text-[11px] font-semibold text-right">Peso (kg)</th>
                  <th className="px-2.5 py-2 text-[11px] font-semibold text-right">Volumen (M³)</th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#44424a]">
                {loadingExtras ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 dark:text-[#cdc3d4]">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-600 dark:text-[#dab9ff]" />
                      Cargando remitos...
                    </td>
                  </tr>
                ) : remitosList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-[#cdc3d4]">
                      No hay remitos Rx emitidos aún. Consolidar un pedido preparado para emitir su remito.
                    </td>
                  </tr>
                ) : (
                  remitosList.map((rem) => (
                    <tr key={rem.id} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors">
                      <td className="px-3 py-1.5 font-mono font-bold text-emerald-700 dark:text-[#69f0ae]">
                        {rem.numero_remito_rx}
                        {rem.cae_o_autorizacion_fiscal && (
                          <span className="block text-[9px] text-slate-500 dark:text-[#cdc3d4] font-mono">
                            CAE: {rem.cae_o_autorizacion_fiscal}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-500 dark:text-[#cdc3d4] text-[11px]">
                        {formatDateTime(rem.fecha_emision)}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-[#e5e2e1]">
                        {rem.cliente?.razon_social}
                      </td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-[#cdc3d4]">
                        {rem.destinatario?.razon_social} ({rem.destinatario?.ciudad || 'Local'})
                      </td>
                      <td className="px-2.5 py-1.5 text-center font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                        {rem.total_bultos}
                      </td>
                      <td className="px-2.5 py-1.5 text-center font-mono text-slate-600 dark:text-[#cdc3d4]">
                        {rem.total_pallets}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-slate-600 dark:text-[#cdc3d4]">
                        {formatNumber(rem.peso_total_kg, 2)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-semibold text-sky-700 dark:text-[#75d1ff]">
                        {formatM3(rem.volumen_total_m3)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => {
                            setPedidoForRemito({ id: rem.pedido_id });
                            setRemitoModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332] dark:hover:bg-[#153426] transition-colors shadow-xs"
                        >
                          <Printer className="w-3 h-3" />
                          Imprimir Remito
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HOJAS DE RUTA E ITINERARIOS */}
      {activeSubTab === 'rutas' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-[#e5e2e1] flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                Hojas de Ruta de Reparto y Despacho Capilar
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                Planificación de cargas, asignación de choferes y seguimiento de entregas con Google Maps
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onOpenTabletChofer && (
                <button
                  type="button"
                  onClick={() => onOpenTabletChofer()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] transition-all shadow-sm active:scale-95"
                >
                  <Tablet className="w-3.5 h-3.5 text-emerald-700 dark:text-[#69f0ae]" />
                  <span>Modo Tablet Chofer</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setGoogleDriveModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all shadow-sm ${
                  isGoogleDriveConfigured()
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-[#0f281e] dark:hover:bg-[#16382a] dark:text-[#69f0ae] dark:border-[#1d523a]'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] dark:text-[#cdc3d4] dark:border-[#383737]'
                }`}
                title="Configuración de almacenamiento en Google Drive"
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                <span>{isGoogleDriveConfigured() ? 'Google Drive Activo' : 'Google Drive'}</span>
              </button>

              <button
                type="button"
                onClick={() => setAsignarRutaOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] transition-all shadow-sm active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Hoja de Ruta</span>
              </button>
            </div>
          </div>

          {/* HERO CARD: RUTA EN REPARTO ACTIVA (SI EXISTE) */}
          {(() => {
            const rutaEnReparto = rutasConParadas.find((r) => r.estado === 'en_viaje');
            if (!rutaEnReparto) return null;

            const paradas = rutaEnReparto.paradas || [];
            const etaReparto = calcularEtasRuta(
              paradas,
              rutaEnReparto.fecha_hora_salida_real,
              rutaEnReparto.fecha_hora_salida_estimada
            );
            const prox = etaReparto.proximaParada;
            const proxParadaObj = prox
              ? paradas.find((p: any) => p.id === prox.paradaId)
              : null;
            const destProx = proxParadaObj?.destinatario;
            const gMapProxUrl = destProx?.direccion_entrega
              ? despachosApi.generarGoogleMapsParadaUrl(destProx.direccion_entrega, destProx.ciudad)
              : null;
            const gMapRutaUrl = despachosApi.generarGoogleMapsRutaCompletaUrl(
              paradas,
              rutaEnReparto.orden_salida?.almacen?.direccion || rutaEnReparto.orden_salida?.almacen?.nombre
            );

            const pctReparto =
              etaReparto.totalParadas > 0
                ? Math.round((etaReparto.paradasCompletadas / etaReparto.totalParadas) * 100)
                : 0;

            return (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white to-slate-50 border-2 border-emerald-500/70 dark:from-[#12281e] dark:via-[#161c19] dark:to-[#0f1110] dark:border-[#69f0ae]/70 p-5 shadow-xl space-y-4">
                {/* Decorative glow */}
                <div className="absolute -top-16 -right-16 w-52 h-52 bg-emerald-400/10 dark:bg-[#69f0ae]/15 rounded-full blur-3xl pointer-events-none" />

                {/* Top Header: Badge + Route Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 border-b border-slate-200 dark:border-[#254d38]/60 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-800 dark:bg-[#143d2c] dark:border-[#2b664d] dark:text-[#69f0ae] flex items-center justify-center shrink-0 shadow-sm">
                      <Truck className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-black uppercase bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d] flex items-center gap-1.5 shadow-sm">
                          <span className="w-2 h-2 rounded-full bg-white dark:bg-[#00391d] animate-ping" />
                          RUTA EN REPARTO ACTIVA
                        </span>
                        <span className="font-mono font-black text-lg text-emerald-800 dark:text-[#69f0ae]">
                          {rutaEnReparto.codigo_ruta}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-[#cdc3d4] mt-0.5 font-medium">
                        Transporte: <b className="text-slate-900 dark:text-[#e5e2e1]">{rutaEnReparto.transporte_empresa}</b> • Chofer:{' '}
                        <b className="text-slate-900 dark:text-[#e5e2e1]">{rutaEnReparto.chofer_nombre}</b>
                        {rutaEnReparto.chofer_telefono && (
                          <span className="font-mono text-sky-700 dark:text-[#75d1ff] ml-1.5">
                            (Tel: {rutaEnReparto.chofer_telefono})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap self-end sm:self-center">
                    {onOpenTabletChofer && (
                      <button
                        type="button"
                        onClick={() => onOpenTabletChofer(rutaEnReparto.id)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-black rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] transition-all shadow-md active:scale-95"
                      >
                        <Tablet className="w-4 h-4" />
                        <span>Abrir en Tablet Chofer</span>
                      </button>
                    )}
                    {gMapRutaUrl && (
                      <a
                        href={gMapRutaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:hover:bg-[#163640] dark:text-[#75d1ff] dark:border-[#1e4859] transition-all shadow-sm"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Maps Ruta</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setRutaParaImprimir(rutaEnReparto)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] dark:text-[#cdc3d4] dark:border-[#3b3b3b] transition-all shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir Hoja</span>
                    </button>
                  </div>
                </div>

                {/* Center Grid: Spotlight Próxima Parada (ETA) + Metric Tiles */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 relative z-10">
                  {/* Spotlight Próxima Parada ETA */}
                  <div className="lg:col-span-2 p-4 rounded-xl bg-white dark:bg-[#0e1913] border border-slate-200 dark:border-[#23533c] shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-black uppercase text-emerald-700 dark:text-[#69f0ae] flex items-center gap-1.5 tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                        {prox ? `PRÓXIMO DESTINO A ENTREGAR (PARADA #${prox.secuencia})` : 'ITINERARIO CUMPLIDO'}
                      </span>
                      {prox && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-black font-mono bg-amber-50 border border-amber-300 text-amber-900 dark:bg-[#38260a] dark:border-[#7a4c10] dark:text-[#ffddb8] flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-[#ffba28]" />
                          ETA: {prox.etaHoraTexto} ({prox.minutosRestantesTexto})
                        </span>
                      )}
                    </div>

                    {prox && destProx ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-[#e5e2e1] truncate">
                            {destProx.razon_social}
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-[#978d9d] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae] shrink-0" />
                            <span className="text-slate-700 dark:text-[#cdc3d4]">
                              {destProx.direccion_entrega}
                              {destProx.ciudad ? ` • ${destProx.ciudad}` : ''}
                            </span>
                          </p>
                          {destProx.telefono && (
                            <span className="text-[11px] text-sky-700 dark:text-[#75d1ff] font-mono block mt-0.5">
                              Tel Contacto: {destProx.telefono}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {gMapProxUrl && (
                            <a
                              href={gMapProxUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] text-xs font-black transition-all shadow-sm active:scale-95"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>Navegar Maps</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-[#cdc3d4] italic">
                        Todas las paradas han sido entregadas o procesadas con novedad. El vehículo está retornando al depósito.
                      </p>
                    )}

                    {/* Progreso visual y tiempos faltantes acumulados */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#1d4330]">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-600 dark:text-[#cdc3d4]">
                          Avance: <b className="text-slate-900 dark:text-[#e5e2e1]">{etaReparto.paradasCompletadas}</b> de <b className="text-slate-900 dark:text-[#e5e2e1]">{etaReparto.totalParadas}</b> entregadas ({pctReparto}%)
                        </span>
                        <span className="text-emerald-700 dark:text-[#69f0ae] font-bold">
                          {etaReparto.paradasPendientes} pendientes
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-[#16201a] overflow-hidden border border-slate-300 dark:border-[#2a4d38] flex">
                        <div
                          className="bg-emerald-500 dark:bg-[#69f0ae] transition-all duration-500 h-full"
                          style={{ width: `${pctReparto}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Metrics & Remaining Trip Time */}
                  <div className="p-4 rounded-xl bg-white dark:bg-[#0e1913] border border-slate-200 dark:border-[#23533c] shadow-sm flex flex-col justify-between space-y-3">
                    <span className="text-[11px] font-mono font-black uppercase text-slate-500 dark:text-[#978d9d] tracking-wider block">
                      ESTIMACIÓN GLOBAL DE RUTA (ETA)
                    </span>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-600 dark:text-[#cdc3d4]">Tiempo Restante:</span>
                        <span className="text-lg font-mono font-black text-amber-600 dark:text-[#ffba28]">
                          ~{etaReparto.tiempoTotalRestanteTexto}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600 dark:text-[#cdc3d4]">Patente / Móvil:</span>
                        <span className="font-mono font-bold text-sky-700 dark:text-[#75d1ff]">
                          {rutaEnReparto.vehiculo_patente}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-600 dark:text-[#cdc3d4]">Total Bultos:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                          {rutaEnReparto.paradas?.reduce((sum: number, p: any) => sum + Number(p.remito?.total_bultos || 1), 0)} un.
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-[#1d4330] flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 dark:text-[#978d9d]">
                        Cierre automático o manual
                      </span>
                      <button
                        type="button"
                        disabled={actualizandoRutaId === rutaEnReparto.id}
                        onClick={() => {
                          if (
                            etaReparto.paradasPendientes > 0 &&
                            !window.confirm(
                              `Aún quedan ${etaReparto.paradasPendientes} paradas sin entregar. ¿Deseas cerrar el itinerario de todas formas?`
                            )
                          ) {
                            return;
                          }
                          handleCambiarEstadoRuta(rutaEnReparto.id, 'itinerario_cumplido');
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] transition-colors"
                      >
                        Cerrar Ruta
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingExtras ? (
              <div className="col-span-2 py-12 text-center text-slate-600 dark:text-[#cdc3d4] bg-white dark:bg-[#161515] border border-slate-200 dark:border-[#262626] rounded-xl space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 dark:text-[#69f0ae]" />
                <p className="font-semibold text-xs">Cargando hojas de ruta y paradas...</p>
              </div>
            ) : rutasConParadas.length === 0 ? (
              <div className="col-span-2 py-12 text-center text-slate-600 dark:text-[#cdc3d4] bg-white dark:bg-[#161515] border border-dashed border-slate-300 dark:border-[#333333] rounded-xl space-y-2">
                <Truck className="w-8 h-8 mx-auto opacity-40 text-emerald-600 dark:text-[#69f0ae]" />
                <p className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">No hay hojas de ruta generadas todavía.</p>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                  Haz clic en &quot;Nueva Hoja de Ruta&quot; para consolidar pedidos preparados en un itinerario de transporte.
                </p>
              </div>
            ) : (
              rutasConParadas.map((ruta) => {
                const paradas = ruta.paradas || [];
                const totalParadas = paradas.length;
                const paradasEntregadas = paradas.filter(
                  (p: any) => p.estado_entrega === 'entregado'
                ).length;
                const paradasNovedad = paradas.filter(
                  (p: any) => p.estado_entrega === 'con_novedad'
                ).length;
                const pct =
                  totalParadas > 0
                    ? Math.round((paradasEntregadas / totalParadas) * 100)
                    : 0;

                const rutaEtaInfo = calcularEtasRuta(
                  paradas,
                  ruta.fecha_hora_salida_real,
                  ruta.fecha_hora_salida_estimada
                );

                const googleMapsRutaUrl = despachosApi.generarGoogleMapsRutaCompletaUrl(
                  paradas,
                  ruta.orden_salida?.almacen?.direccion || ruta.orden_salida?.almacen?.nombre
                );

                return (
                  <div
                    key={ruta.id}
                    className="bg-white dark:bg-[#161515] border border-slate-200 dark:border-[#2b2b2b] rounded-2xl p-4 space-y-3.5 shadow-sm flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Cabecera de la Hoja de Ruta */}
                      <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#262626] pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-sm text-emerald-700 dark:text-[#69f0ae]">
                              {ruta.codigo_ruta}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                                ruta.estado === 'itinerario_cumplido'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#092418] dark:text-[#69f0ae] dark:border-[#1b5037]'
                                  : ruta.estado === 'en_viaje'
                                  ? 'bg-sky-50 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1d4d60]'
                                  : 'bg-amber-50 text-amber-800 border border-amber-300 dark:bg-[#291e12] dark:text-[#ffba28] dark:border-[#613f17]'
                              }`}
                            >
                              {ruta.estado.replace('_', ' ')}
                            </span>
                            {ruta.orden_salida?.numero_orden_salida && (
                              <span className="text-[10px] font-mono text-slate-500 dark:text-[#978d9d]">
                                OS: {ruta.orden_salida.numero_orden_salida}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-900 dark:text-[#e5e2e1] font-bold">
                            Transporte: {ruta.transporte_empresa}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono">
                            Vehículo: <strong className="text-sky-700 dark:text-[#75d1ff]">{ruta.vehiculo_patente}</strong>{' '}
                            ({ruta.tipo_vehiculo || 'Chasis'})
                          </div>
                        </div>

                        <div className="text-right text-xs">
                          <div className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                            {ruta.chofer_nombre}
                          </div>
                          {ruta.chofer_telefono && (
                            <div className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono">
                              Tel: {ruta.chofer_telefono}
                            </div>
                          )}
                          <div className="text-[10px] font-mono text-amber-700 dark:text-[#ffba28] mt-1 font-bold">
                            ETA: ~{rutaEtaInfo.tiempoTotalRestanteTexto}
                          </div>
                        </div>
                      </div>

                      {/* Progreso del Itinerario */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-slate-600 dark:text-[#cdc3d4]">
                            Progreso: <b>{paradasEntregadas}/{totalParadas}</b> entregadas
                          </span>
                          <span className="text-emerald-700 dark:text-[#69f0ae] font-bold">{pct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-[#201f1f] overflow-hidden border border-slate-300 dark:border-[#333333] flex">
                          <div
                            className="bg-emerald-500 dark:bg-[#69f0ae] transition-all duration-500 h-full"
                            style={{ width: `${pct}%` }}
                          />
                          {paradasNovedad > 0 && (
                            <div
                              className="bg-rose-400 dark:bg-[#ffb4ab] transition-all duration-500 h-full"
                              style={{ width: `${(paradasNovedad / totalParadas) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Lista de Paradas del Itinerario */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-[#978d9d] uppercase tracking-wider block">
                          Paradas secuenciadas ({totalParadas}):
                        </span>

                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {paradas.map((p: any) => {
                            const isEntregado = p.estado_entrega === 'entregado';
                            const isNovedad = p.estado_entrega === 'con_novedad';
                            const etaStop = rutaEtaInfo.paradasMap.get(p.id);

                            const gMapUrl = p.destinatario?.direccion_entrega
                              ? despachosApi.generarGoogleMapsParadaUrl(
                                  p.destinatario.direccion_entrega,
                                  p.destinatario.ciudad
                                )
                              : null;

                            return (
                              <div
                                key={p.id}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-xl border text-xs gap-2 ${
                                  isEntregado
                                    ? 'bg-emerald-50/70 border-emerald-200 text-slate-800 dark:bg-[#0a1811] dark:border-[#1b4332] dark:text-[#e5e2e1]'
                                    : isNovedad
                                    ? 'bg-rose-50/70 border-rose-200 text-slate-800 dark:bg-[#220d11] dark:border-[#5e141c] dark:text-[#e5e2e1]'
                                    : etaStop?.esProxima
                                    ? 'bg-emerald-50 border-emerald-400/80 ring-1 ring-emerald-400/30 dark:bg-[#181d1a] dark:border-[#69f0ae]/60'
                                    : 'bg-slate-50 border-slate-200 dark:bg-[#1a1919] dark:border-[#292929]'
                                }`}
                              >
                                <div className="flex items-start gap-2 min-w-0">
                                  <div
                                    className={`w-6 h-6 rounded-lg font-black font-mono text-[10px] flex items-center justify-center shrink-0 border mt-0.5 ${
                                      isEntregado
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-[#143d2c] dark:text-[#69f0ae] dark:border-[#256e4c]'
                                        : isNovedad
                                        ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-[#3b1218] dark:text-[#ffb4ab] dark:border-[#6b161f]'
                                        : etaStop?.esProxima
                                        ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-[#1b4332] dark:text-[#69f0ae] dark:border-[#69f0ae]'
                                        : 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-[#262626] dark:text-[#e5e2e1] dark:border-[#3a3a3a]'
                                    }`}
                                  >
                                    {isEntregado ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : p.secuencia_parada}
                                  </div>

                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold text-slate-900 dark:text-[#e5e2e1] truncate text-[11px]">
                                        {p.destinatario?.razon_social}
                                      </span>
                                      {etaStop?.esProxima && !isEntregado && !isNovedad && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]">
                                          PRÓXIMA
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-[#978d9d] truncate">
                                      {p.destinatario?.direccion_entrega}
                                      {p.destinatario?.ciudad ? ` • ${p.destinatario.ciudad}` : ''}
                                    </div>

                                    {/* Información protegida de entrega / desvío / ETA */}
                                    {isEntregado && (
                                      <div className="text-[10px] text-emerald-700 dark:text-[#69f0ae] font-medium flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-[#69f0ae]" />
                                        <span>
                                          Recibió: <b>{p.receptor_nombre || 'Conforme'}</b>{' '}
                                          {p.receptor_documento ? `(DNI: ${p.receptor_documento})` : ''}
                                        </span>
                                      </div>
                                    )}

                                    {isNovedad && (
                                      <div className="text-[10px] text-rose-700 dark:text-[#ffb4ab] font-medium flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3 text-rose-600 dark:text-[#ffb4ab]" />
                                        <span>Desvío: <b>{p.motivo_novedad || p.observaciones || 'Faltante de bultos'}</b></span>
                                      </div>
                                    )}

                                    {!isEntregado && !isNovedad && (
                                      <div className="text-[10px] font-mono text-amber-700 dark:text-[#ffba28] font-bold">
                                        ⏱️ ETA: {etaStop?.etaHoraTexto} ({etaStop?.minutosRestantesTexto})
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                                  {/* Ver foto de remito conformado si existe */}
                                  {p.foto_remito_url && (
                                    <button
                                      type="button"
                                      onClick={() => setFotoZoomUrl(p.foto_remito_url)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:hover:bg-[#163640] dark:text-[#75d1ff] dark:border-[#1e4859] text-[10px] font-bold transition-colors"
                                      title="Ver foto de remito conformado / POD"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Remito Rx</span>
                                    </button>
                                  )}

                                  {/* Botón Adjuntar Documentación (Solo disponible para paradas cerradas) */}
                                  {(isEntregado || isNovedad) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setParadaParaAdjuntarDoc(p);
                                        setFotoAdjuntoBase64(p.foto_remito_url || null);
                                        setObsAdjunto('');
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] text-[10px] font-bold transition-colors"
                                      title="Adjuntar o cambiar foto del remito conformado sin alterar datos de entrega"
                                    >
                                      <Paperclip className="w-3 h-3" />
                                      <span>{p.foto_remito_url ? 'Cambiar Doc' : 'Adjuntar Doc'}</span>
                                    </button>
                                  )}

                                  {gMapUrl && (
                                    <a
                                      href={gMapUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Abrir en Google Maps"
                                      className="p-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:hover:bg-[#163640] dark:text-[#75d1ff] dark:border-[#1e4859] transition-colors"
                                    >
                                      <Navigation className="w-3 h-3" />
                                    </a>
                                  )}

                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                                      isEntregado
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#092418] dark:text-[#69f0ae]'
                                        : isNovedad
                                        ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#2b0d12] dark:text-[#ffb4ab]'
                                        : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#222222] dark:text-[#978d9d]'
                                    }`}
                                  >
                                    {p.estado_entrega.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Botonera de Acciones de la Hoja de Ruta */}
                    <div className="pt-2 border-t border-slate-200 dark:border-[#262626] flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 1. Botón Tablet Chofer */}
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenTabletChofer) {
                              onOpenTabletChofer(ruta.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] transition-all shadow-sm active:scale-95"
                          title="Abrir vista optimizada para tablet del chofer"
                        >
                          <Tablet className="w-3.5 h-3.5" />
                          <span>Tablet Chofer</span>
                        </button>

                        {/* 2. Botón Google Maps Ruta Completa */}
                        {googleMapsRutaUrl && (
                          <a
                            href={googleMapsRutaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:hover:bg-[#163640] dark:text-[#75d1ff] dark:border-[#1e4859] transition-all shadow-sm active:scale-95"
                            title="Navegar ruta completa con Google Maps"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            <span>Maps</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}

                        {/* 3. Botón Imprimir Hoja de Ruta */}
                        <button
                          type="button"
                          onClick={() => setRutaParaImprimir(ruta)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] dark:text-[#cdc3d4] dark:border-[#3b3b3b] transition-all shadow-sm"
                          title="Imprimir manifiesto de carga y remitos"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-[#cdc3d4]" />
                          <span>Imprimir</span>
                        </button>
                      </div>

                      {/* 4. Cambio rápido de estado de la ruta */}
                      <div>
                        {ruta.estado === 'programada' && (
                          <button
                            type="button"
                            disabled={actualizandoRutaId === ruta.id}
                            onClick={() => handleCambiarEstadoRuta(ruta.id, 'en_viaje')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] transition-all shadow-sm"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Iniciar Viaje</span>
                          </button>
                        )}

                        {ruta.estado === 'en_viaje' && (
                          <button
                            type="button"
                            disabled={actualizandoRutaId === ruta.id}
                            onClick={() => handleCambiarEstadoRuta(ruta.id, 'itinerario_cumplido')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] transition-all shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Cerrar Ruta</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      )}

      {/* Picking Modal with Novelty Support */}
      {pickingModalOpen && activePickingTask && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl max-w-md w-full p-6 shadow-2xl">
              <h3 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1] mb-1 flex items-center gap-2">
                <Box className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                Confirmar Tarea de Picking
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mb-4">
                Extraer físicamente de la ubicación asignada. Si no encuentras la cantidad completa, registra lo encontrado y la novedad.
              </p>

              <form onSubmit={handleConfirmPicking} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Cantidad Recolectada (Unidades / Bultos) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={activePickingTask.cantidad_a_recolectar}
                    required
                    value={cantidadRecolectada}
                    onChange={(e) => setCantidadRecolectada(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono font-bold focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                  <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] mt-1 block">
                    Asignado en tarea: <b>{activePickingTask.cantidad_a_recolectar}</b> un.
                  </span>
                </div>

                {cantidadRecolectada < activePickingTask.cantidad_a_recolectar && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-[#38260a] border border-amber-200 dark:border-[#7a4c10] space-y-2">
                    <div className="text-xs font-semibold text-amber-800 dark:text-[#ffddb8] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Faltante Físico Detectado: {activePickingTask.cantidad_a_recolectar - cantidadRecolectada} un.
                    </div>
                    <div>
                      <label className="text-[11px] text-amber-900/80 dark:text-[#ffddb8]/80 block mb-1">
                        Motivo o Novedad de Discrepancia:
                      </label>
                      <input
                        type="text"
                        value={novedadFaltante}
                        onChange={(e) => setNovedadFaltante(e.target.value)}
                        placeholder="ej: Mercadería rota, saldo faltante en pallet"
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-amber-300 dark:border-[#7a4c10] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-amber-500 dark:focus:border-[#ffddb8]"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPickingModalOpen(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-100 hover:bg-slate-200 dark:bg-[#201f1f] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-xs font-semibold rounded bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmar Picking
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Nuevo Pedido Modal */}
      <NuevoPedidoModal
        isOpen={nuevoPedidoOpen}
        onClose={() => setNuevoPedidoOpen(false)}
        onSuccess={() => {
          onRefresh();
        }}
        clientes={clientes}
        defaultClienteId={selectedClienteId}
      />

      {/* Packing Station Modal */}
      {selectedPedido && (
        <PackingStationModal
          isOpen={packingModalOpen}
          onClose={() => setPackingModalOpen(false)}
          onSuccess={() => {
            onRefresh();
            handleSelectPedido(selectedPedido);
          }}
          pedido={detailData?.id === selectedPedido.id ? detailData : selectedPedido}
          onEmitirRemitoPrompt={(ped) => {
            setPedidoForRemito(ped);
            setRemitoModalOpen(true);
          }}
        />
      )}

      {/* Remito Rx Print Modal */}
      {pedidoForRemito && (
        <RemitoPrintModal
          isOpen={remitoModalOpen}
          onClose={() => {
            setRemitoModalOpen(false);
            setPedidoForRemito(null);
          }}
          pedido={detailData?.id === pedidoForRemito.id ? detailData : pedidoForRemito}
          onSuccess={() => {
            onRefresh();
          }}
        />
      )}

      {/* Asignar Ruta Modal */}
      <AsignarRutaModal
        isOpen={asignarRutaOpen}
        onClose={() => setAsignarRutaOpen(false)}
        onSuccess={() => {
          onRefresh();
          setActiveSubTab('rutas');
        }}
        almacenes={almacenes}
        pedidosDisponibles={pedidos}
      />

      {/* Importar Pedidos Masivos CSV / Excel */}
      <ImportarPedidosModal
        isOpen={importarModalOpen}
        onClose={() => setImportarModalOpen(false)}
        onSuccess={() => {
          onRefresh();
        }}
        clientes={clientes}
        defaultClienteId={selectedClienteId}
      />

      {/* Imprimir Hoja de Ruta Modal */}
      {rutaParaImprimir && (
        <HojaRutaPrintModal
          isOpen={!!rutaParaImprimir}
          onClose={() => setRutaParaImprimir(null)}
          ruta={rutaParaImprimir}
        />
      )}

      {/* Modal para Adjuntar Documentación / Remito Conformado a Parada Entregada */}
      {paradaParaAdjuntarDoc && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={() => {
              if (!isSubmittingAdjunto) {
                setParadaParaAdjuntarDoc(null);
                setFotoAdjuntoBase64(null);
                setObsAdjunto('');
              }
            }}
          >
            <div
              className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-2xl max-w-lg w-full p-5 shadow-2xl text-slate-800 dark:text-[#e5e2e1] space-y-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-[#2b2b2b] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#143d2c] dark:border-[#2b664d] dark:text-[#69f0ae] flex items-center justify-center shrink-0">
                    <Paperclip className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                      Adjuntar Documentación de Entrega (POD)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-[#978d9d] font-mono">
                      Parada #{paradaParaAdjuntarDoc.secuencia_parada} • {paradaParaAdjuntarDoc.destinatario?.razon_social}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setParadaParaAdjuntarDoc(null);
                    setFotoAdjuntoBase64(null);
                    setObsAdjunto('');
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:text-[#978d9d] dark:hover:text-[#e5e2e1] dark:hover:bg-[#262626] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Datos de Entrega Bloqueados (LOCKED) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#101010] border border-slate-200 dark:border-[#262626] space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-[#69f0ae] font-bold">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                    <span>Registro de Entrega Protegido</span>
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono uppercase bg-white dark:bg-[#201f1f] px-2 py-0.5 rounded border border-slate-200 dark:border-[#333333]">
                    Solo Lectura
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] space-y-0.5">
                  <p>
                    Receptor: <b className="text-slate-900 dark:text-[#e5e2e1]">{paradaParaAdjuntarDoc.receptor_nombre || 'Conforme'}</b>{' '}
                    {paradaParaAdjuntarDoc.receptor_documento && `(DNI: ${paradaParaAdjuntarDoc.receptor_documento})`}
                  </p>
                  <p>
                    Destino: <b className="text-slate-900 dark:text-[#e5e2e1]">{paradaParaAdjuntarDoc.destinatario?.direccion_entrega}</b>
                  </p>
                  {paradaParaAdjuntarDoc.observaciones && (
                    <p className="text-slate-400 dark:text-[#978d9d] italic">
                      Observación original: {paradaParaAdjuntarDoc.observaciones}
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleAdjuntarDocSubmit} className="space-y-4">
                {/* Selector / Captura de Remito Conformado */}
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-[#e5e2e1] block mb-1.5">
                    Foto o Archivo del Remito Conformado / Firma Física
                  </label>

                  {fotoAdjuntoBase64 ? (
                    <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500/60 dark:border-[#69f0ae]/60 bg-black max-h-56 flex items-center justify-center group">
                      <img
                        src={fotoAdjuntoBase64}
                        alt="Remito Conformado"
                        className="object-contain max-h-56 w-full"
                      />
                      <button
                        type="button"
                        onClick={() => setFotoAdjuntoBase64(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600/90 text-white hover:bg-red-700 transition-colors shadow-lg"
                        title="Quitar foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 hover:border-emerald-500 dark:border-[#3a3a3a] dark:hover:border-[#69f0ae] rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#141414] dark:hover:bg-[#181818] cursor-pointer transition-colors text-center space-y-2">
                      <div className="w-10 h-10 rounded-xl bg-white text-emerald-600 dark:bg-[#201f1f] dark:text-[#69f0ae] flex items-center justify-center shadow-xs">
                        <Camera className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-[#e5e2e1]">
                        Subir foto de Remito Conformado
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-[#978d9d]">
                        PNG, JPG o WebP (se comprime automáticamente)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const b64 = await compressImage(file);
                              setFotoAdjuntoBase64(b64);
                            } catch (err) {
                              console.error('Error comprimiendo imagen:', err);
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Observaciones complementarias */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Nota / Comentario de la Documentación (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={obsAdjunto}
                    onChange={(e) => setObsAdjunto(e.target.value)}
                    placeholder="Ej: Remito firmado y sellado por encargado de recepción depósito central..."
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#262626]">
                  <button
                    type="button"
                    onClick={() => {
                      setParadaParaAdjuntarDoc(null);
                      setFotoAdjuntoBase64(null);
                      setObsAdjunto('');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] text-slate-700 dark:text-[#cdc3d4] text-xs font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAdjunto || !fotoAdjuntoBase64}
                    className="px-5 py-2 rounded-xl bg-[#69f0ae] hover:bg-[#8bf4c1] text-[#00391d] text-xs font-black transition-all shadow-md flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {isSubmittingAdjunto ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Guardar Documento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Zoom de Foto de Remito Conformado */}
      {fotoZoomUrl && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 dark:bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={() => setFotoZoomUrl(null)}
          >
            <div
              className="bg-white dark:bg-[#161515] border border-slate-200 dark:border-[#333333] rounded-2xl max-w-3xl w-full p-4 shadow-2xl space-y-3 text-slate-800 dark:text-[#e5e2e1]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#2b2b2b]">
                <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Constancia de Remito Conformado / POD</span>
                </span>
                <div className="flex items-center gap-2">
                  {fotoZoomUrl && (fotoZoomUrl.includes('drive.google.com') || fotoZoomUrl.includes('google')) && (
                    <a
                      href={obtenerUrlVisorGoogleDrive(fotoZoomUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-[#0f281e] dark:text-[#69f0ae] dark:border-[#1b5037] dark:hover:bg-[#16382a] text-xs font-bold transition-colors"
                      title="Abrir archivo original en Google Drive"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Abrir en Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setFotoZoomUrl(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-[#978d9d] dark:hover:text-[#e5e2e1] dark:hover:bg-[#262626]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-100 dark:bg-black/50 rounded-xl p-2">
                <img
                  src={normalizarUrlGoogleDrive(fotoZoomUrl)}
                  alt="Remito Conformado"
                  className="max-h-[70vh] w-auto object-contain rounded-lg shadow-md"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setFotoZoomUrl(null)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 dark:border-transparent dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] text-slate-700 hover:text-slate-900 dark:text-[#e5e2e1] text-xs font-bold transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal de Configuración de Google Drive */}
      <GoogleDriveConfigModal
        isOpen={googleDriveModalOpen}
        onClose={() => setGoogleDriveModalOpen(false)}
      />
    </div>
  );
};

