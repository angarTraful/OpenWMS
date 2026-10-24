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
  Package,
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
  Barcode,
  Warehouse,
  Scissors,
  FileCheck,
  ClipboardCheck,
  Edit3,
  Users,
  Sliders,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime, formatNumber, formatM3 } from '@/lib/utils';
import { pedidosApi } from '@/api/pedidosApi';
import { despachosApi } from '@/api/despachosApi';
import { usuariosApi } from '@/api/usuariosApi';
import { calcularEtasRuta } from '@/lib/etaService';
import {
  subirDocumentoAGoogleDrive,
  normalizarUrlGoogleDrive,
  obtenerUrlVisorGoogleDrive,
  isGoogleDriveConfigured,
} from '@/lib/googleDriveService';
import { rfSoundService } from '@/lib/rfSoundService';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { getDescripcionFull } from '@/api/articulosApi';
import { NuevoPedidoModal } from './NuevoPedidoModal';
import { ImportarPedidosModal } from './ImportarPedidosModal';
import { PackingStationModal } from './PackingStationModal';
import { RemitoPrintModal } from './RemitoPrintModal';
import { PlanillaRomaneoPrintModal } from './PlanillaRomaneoPrintModal';
import { RotuloExpresoPrintModal } from './RotuloExpresoPrintModal';
import { HojaTrabajoOperativaPrintModal } from './HojaTrabajoOperativaPrintModal';
import { RomaneoEditorModal } from '@/components/common/RomaneoEditorModal';
import { BrotherLabelPrinterModal } from '@/components/common/BrotherLabelPrinterModal';
import { AsignarRutaModal } from './AsignarRutaModal';
import { HojaRutaPrintModal } from './HojaRutaPrintModal';
import { GoogleDriveConfigModal } from '@/components/common/GoogleDriveConfigModal';
import { AsignacionPickingModal } from './AsignacionPickingModal';
import { ControlMuestreoModal } from './ControlMuestreoModal';
import { ParcializarPedidoModal } from './ParcializarPedidoModal';
import { ControlCargaModal } from './ControlCargaModal';
import { EditarRutaSupervisorModal } from './EditarRutaSupervisorModal';
import { ReasignarTareaPickingModal } from './ReasignarTareaPickingModal';

export type OutboundSubTab = 'pedidos' | 'salidas' | 'rutas';

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
  initialSubTab?: OutboundSubTab;
  onSubTabChange?: (tab: OutboundSubTab) => void;
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
  initialSubTab,
  onSubTabChange,
}) => {
  // Navigation View Tab: 'pedidos' (1- Pedidos/Picking) | 'salidas' (2- Salidas) | 'rutas' (3- Ruteos)
  const [activeSubTab, setActiveSubTab] = useState<OutboundSubTab>(initialSubTab || 'pedidos');

  useEffect(() => {
    if (initialSubTab && initialSubTab !== activeSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSubTabChange = (tab: OutboundSubTab) => {
    setActiveSubTab(tab);
    onSubTabChange?.(tab);
  };

  // Remitos & Rutas lists
  const [remitosList, setRemitosList] = useState<any[]>([]);
  const [rutasConParadas, setRutasConParadas] = useState<any[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [rutaParaImprimir, setRutaParaImprimir] = useState<any | null>(null);
  const [actualizandoRutaId, setActualizandoRutaId] = useState<string | null>(null);

  const pedidosPreparados = React.useMemo(() => {
    return pedidos.filter(
      (p) => p.estado === 'preparado' || p.estado === 'agrupado_salida'
    );
  }, [pedidos]);

  // Set de IDs de pedidos ya asignados a itinerarios / hojas de ruta
  const pedidosEnRutasIds = React.useMemo(() => {
    const ids = new Set<string>();
    rutasConParadas.forEach((r: any) => {
      (r.paradas || []).forEach((p: any) => {
        const pid = p.pedido_id || p.pedido?.id;
        if (pid) ids.add(pid);
      });
    });
    return ids;
  }, [rutasConParadas]);

  // Pedidos listos para salidas que AÚN NO están asignados a ningún itinerario
  const pedidosListosParaSalidas = React.useMemo(() => {
    return pedidosPreparados.filter((p) => !pedidosEnRutasIds.has(p.id));
  }, [pedidosPreparados, pedidosEnRutasIds]);

  // Mapa de pedidos asociados a Órdenes de Salida
  const pedidosEnOrdenesSalidaMap = React.useMemo(() => {
    const map = new Map<string, any>();
    (ordenesSalida || []).forEach((os: any) => {
      (os.pedidos_asociados || []).forEach((pa: any) => {
        const pid = pa.pedido_id || pa.pedido?.id;
        if (pid) {
          map.set(pid, os);
        }
      });
    });
    return map;
  }, [ordenesSalida]);

  // Pedidos en Ejecución / Picking Activo (Etapa 1)
  const pedidosEnEjecucionEtapa1 = React.useMemo(() => {
    return pedidos.filter(
      (p) => p.estado === 'ingresado' || p.estado === 'asignado_picking' || p.estado === 'en_picking'
    );
  }, [pedidos]);

  // Pedidos Cerrados / Histórico (Etapa 1)
  const pedidosHistoricosEtapa1 = React.useMemo(() => {
    return pedidos.filter(
      (p) =>
        p.estado === 'preparado' ||
        p.estado === 'agrupado_salida' ||
        p.estado === 'despachado' ||
        p.estado === 'cancelado'
    );
  }, [pedidos]);

  // Hojas de Ruta Activas vs Cumplidas (Etapa 3)
  const rutasActivas = React.useMemo(() => {
    return rutasConParadas.filter((r) => r.estado !== 'itinerario_cumplido');
  }, [rutasConParadas]);

  const rutasCumplidas = React.useMemo(() => {
    return rutasConParadas.filter((r) => r.estado === 'itinerario_cumplido');
  }, [rutasConParadas]);

  // Lista y mapa de usuarios del sistema para visualización de roles (Operador, Supervisor, Controller)
  const [usuariosList, setUsuariosList] = useState<any[]>([]);
  useEffect(() => {
    usuariosApi
      .listarUsuarios(true)
      .then((data) => {
        setUsuariosList(data || []);
      })
      .catch((err) => {
        console.warn('Error cargando usuarios en OutboundMonitor:', err);
      });
  }, []);

  const usuariosMap = React.useMemo(() => {
    const map = new Map<string, string>();
    usuariosList.forEach((u: any) => {
      map.set(u.id, u.nombre_completo || u.email || 'Usuario');
    });
    return map;
  }, [usuariosList]);

  // Selected Order Detail
  const [selectedPedido, setSelectedPedido] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailData, setDetailData] = useState<any | null>(null);

  // Modals state
  const [nuevoPedidoOpen, setNuevoPedidoOpen] = useState(false);
  const [importarModalOpen, setImportarModalOpen] = useState(false);
  const [packingModalOpen, setPackingModalOpen] = useState(false);
  const [remitoModalOpen, setRemitoModalOpen] = useState(false);
  const [romaneoModalOpen, setRomaneoModalOpen] = useState(false);
  const [romaneoEditorOpen, setRomaneoEditorOpen] = useState(false);
  const [rotuloExpresoModalOpen, setRotuloExpresoModalOpen] = useState(false);
  const [brotherLpnModalOpen, setBrotherLpnModalOpen] = useState(false);
  const [hojaTrabajoOpen, setHojaTrabajoOpen] = useState(false);
  const [asignarRutaOpen, setAsignarRutaOpen] = useState(false);
  const [pedidoForRemito, setPedidoForRemito] = useState<any | null>(null);

  // Estados para Nuevos Modales de Etapas
  const [asignacionPickingModalOpen, setAsignacionPickingModalOpen] = useState(false);
  const [pedidoParaAsignarPicking, setPedidoParaAsignarPicking] = useState<any | null>(null);

  const [controlMuestreoModalOpen, setControlMuestreoModalOpen] = useState(false);
  const [pedidoParaMuestreo, setPedidoParaMuestreo] = useState<any | null>(null);

  const [parcializarModalOpen, setParcializarModalOpen] = useState(false);
  const [pedidoParaParcializar, setPedidoParaParcializar] = useState<any | null>(null);

  const [controlCargaModalOpen, setControlCargaModalOpen] = useState(false);
  const [rutaParaControlCarga, setRutaParaControlCarga] = useState<any | null>(null);

  const [editarRutaModalOpen, setEditarRutaModalOpen] = useState(false);
  const [rutaParaEditar, setRutaParaEditar] = useState<any | null>(null);

  // Reasignar Lote de Tarea de Picking Modal
  const [reasignarTareaModalOpen, setReasignarTareaModalOpen] = useState(false);
  const [tareaParaReasignar, setTareaParaReasignar] = useState<any | null>(null);

  // Picking Task Confirmation Modal
  const [pickingModalOpen, setPickingModalOpen] = useState(false);
  const [activePickingTask, setActivePickingTask] = useState<any | null>(null);
  const [cantidadRecolectada, setCantidadRecolectada] = useState<number>(0);
  const [novedadFaltante, setNovedadFaltante] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Status Filter for Orders
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');

  // Estados para Adjuntar Documentación y Visualización de Fotos POD
  const [paradaParaAdjuntarDoc, setParadaParaAdjuntarDoc] = useState<any | null>(null);
  const [fotoAdjuntoBase64, setFotoAdjuntoBase64] = useState<string | null>(null);
  const [obsAdjunto, setObsAdjunto] = useState('');
  const [isSubmittingAdjunto, setIsSubmittingAdjunto] = useState(false);
  const [fotoZoomUrl, setFotoZoomUrl] = useState<string | null>(null);
  const [googleDriveModalOpen, setGoogleDriveModalOpen] = useState(false);

  // Modal Detalle Rápido de Pedido (Item 5)
  const [pedidoDetalleRapidoModalOpen, setPedidoDetalleRapidoModalOpen] = useState(false);
  const [pedidoDetalleRapidoData, setPedidoDetalleRapidoData] = useState<any | null>(null);

  // Modal Supervisión Marcar Entregado en Parada (Item 9)
  const [paradaParaEntregaSupervisor, setParadaParaEntregaSupervisor] = useState<any | null>(null);
  const [receptorSupervisorNombre, setReceptorSupervisorNombre] = useState('');
  const [receptorSupervisorDni, setReceptorSupervisorDni] = useState('');
  const [obsEntregaSupervisor, setObsEntregaSupervisor] = useState('');
  const [isSubmittingEntregaSupervisor, setIsSubmittingEntregaSupervisor] = useState(false);

  // Función unificada para recargar remitos y rutas (Item 10)
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

  // Refrescar sincronizadamente todo el monitor (pedidos + remitos + rutas)
  const refrescarTodo = async () => {
    onRefresh();
    await cargarExtras();
  };

  // Precargar rutas y remitos al montar o cambiar almacén/cliente
  useEffect(() => {
    cargarExtras();
  }, [selectedAlmacenId, selectedClienteId]);

  // Fetch Remitos and Rutas when respective tabs are open or orders update
  useEffect(() => {
    if (activeSubTab === 'salidas' || activeSubTab === 'rutas') {
      cargarExtras();
    }
  }, [activeSubTab]);

  useEffect(() => {
    cargarExtras();
  }, [pedidos, ordenesSalida]);

  useEffect(() => {
    const handleSync = () => {
      cargarExtras();
    };
    window.addEventListener('wms:data-changed', handleSync);
    return () => window.removeEventListener('wms:data-changed', handleSync);
  }, []);

  const handleCambiarEstadoRuta = async (
    rutaId: string,
    nuevoEstado: 'programada' | 'en_carga' | 'en_viaje' | 'itinerario_cumplido'
  ) => {
    // Validación Item 1: Si se inicia el viaje ('en_viaje'), validar que todas las paradas tengan Remito Rx emitido
    if (nuevoEstado === 'en_viaje') {
      const rutaTarget = rutasConParadas.find((r) => r.id === rutaId);
      const paradasSinRemito = (rutaTarget?.paradas || []).filter(
        (p: any) => !p.remito_id && !p.remito?.numero_remito_rx
      );
      if (paradasSinRemito.length > 0) {
        const pedNums = paradasSinRemito
          .map((p: any) => p.pedido?.numero_pedido || `Parada #${p.secuencia_parada}`)
          .join(', ');
        alert(
          `⛔ NO SE PUEDE INICIAR LA RUTA:\n\nHay ${paradasSinRemito.length} pedido(s) sin Remito Rx emitido:\n[${pedNums}].\n\nDebe emitirse el Remito Rx para cada pedido antes de autorizar la salida a reparto.`
        );
        return;
      }
    }

    setActualizandoRutaId(rutaId);
    try {
      await despachosApi.actualizarEstadoRuta(rutaId, nuevoEstado);

      // Si la ruta pasa a 'itinerario_cumplido', despachar formalmente los pedidos que hayan sido entregados
      if (nuevoEstado === 'itinerario_cumplido') {
        const rutaActual = rutasConParadas.find((r) => r.id === rutaId);
        if (rutaActual && rutaActual.paradas) {
          for (const parada of rutaActual.paradas) {
            const pedidoId = parada.pedido_id || parada.pedido?.id;
            if (pedidoId) {
              try {
                await pedidosApi.despacharPedido(pedidoId);
              } catch (despErr) {
                console.warn(`Error al auto-despachar pedido ${pedidoId} al cerrar ruta:`, despErr);
              }
            }
          }
        }
      }

      await refrescarTodo();
    } catch (err: any) {
      console.error('Error actualizando estado ruta:', err);
    } finally {
      setActualizandoRutaId(null);
    }
  };

  const handleIniciarViajeRuta = (ruta: any) => {
    // Validación Item 1: Faltantes de remito
    const paradasSinRemito = (ruta.paradas || []).filter(
      (p: any) => !p.remito_id && !p.remito?.numero_remito_rx
    );
    if (paradasSinRemito.length > 0) {
      const pedNums = paradasSinRemito
        .map((p: any) => p.pedido?.numero_pedido || `Parada #${p.secuencia_parada}`)
        .join(', ');
      alert(
        `⛔ NO SE PUEDE INICIAR LA RUTA:\n\nHay ${paradasSinRemito.length} pedido(s) sin Remito Rx emitido:\n[${pedNums}].\n\nDebe emitir el Remito Rx para cada pedido antes de autorizar la salida a reparto.`
      );
      return;
    }

    if (!ruta.control_carga_completado) {
      const abrir = window.confirm(
        '⚠️ El itinerario aún no cuenta con Control de Carga en Muelle verificado.\n\nEs obligatorio verificar los bultos/pallets físicos y registrar el precinto antes de iniciar el viaje.\n\n¿Deseas abrir el Control de Carga ahora?'
      );
      if (abrir) {
        setRutaParaControlCarga(ruta);
        setControlCargaModalOpen(true);
      }
      return;
    }
    handleCambiarEstadoRuta(ruta.id, 'en_viaje');
  };

  const handleConfirmarEntregaSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paradaParaEntregaSupervisor) return;
    setIsSubmittingEntregaSupervisor(true);
    try {
      await despachosApi.registrarEntregaParada({
        paradaId: paradaParaEntregaSupervisor.id,
        rutaId: paradaParaEntregaSupervisor.ruta_id,
        pedidoId: paradaParaEntregaSupervisor.pedido_id || (paradaParaEntregaSupervisor.pedido as any)?.id || (paradaParaEntregaSupervisor.remito as any)?.pedido_id,
        remitoId: paradaParaEntregaSupervisor.remito_id || (paradaParaEntregaSupervisor.remito as any)?.id,
        estadoEntrega: 'entregado',
        receptorNombre: receptorSupervisorNombre.trim() || 'Conforme Recepción',
        receptorDocumento: receptorSupervisorDni.trim() || undefined,
        observaciones: obsEntregaSupervisor.trim() || 'Entregado y validado por Supervisión WMS',
      });
      rfSoundService.playSuccess();
      setParadaParaEntregaSupervisor(null);
      setReceptorSupervisorNombre('');
      setReceptorSupervisorDni('');
      setObsEntregaSupervisor('');
      await refrescarTodo();
    } catch (err: any) {
      console.error('Error registrando entrega desde supervisión:', err);
      rfSoundService.playError();
      alert('Error registrando entrega: ' + (err.message || err));
    } finally {
      setIsSubmittingEntregaSupervisor(false);
    }
  };

  const handleVerDetallePedidoModal = async (pedido: any) => {
    if (!pedido?.id) return;
    try {
      const fresh = await pedidosApi.obtenerPedidoConDetalle(pedido.id);
      setPedidoDetalleRapidoData(fresh || pedido);
    } catch (err) {
      console.warn('Error cargando detalle rápido del pedido:', err);
      setPedidoDetalleRapidoData(pedido);
    }
    setPedidoDetalleRapidoModalOpen(true);
  };

  const handleSelectPedido = async (ped: any) => {
    if (!ped) return;
    setSelectedPedido(ped);
    setDetailData(ped);
    setLoadingDetail(true);
    try {
      const targetId = ped.pedido_id || ped.pedido?.id || ped.id;
      if (targetId) {
        const data = await pedidosApi.obtenerPedidoConDetalle(targetId);
        if (data) {
          setDetailData(data);
          setSelectedPedido(data);
        }
      }
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

        // Cargar pedido completo actualizado con tareas de picking y abrir automáticamente la Hoja de Trabajo para preparar
        try {
          const freshData = await pedidosApi.obtenerPedidoConDetalle(pedidoId);
          if (freshData) {
            setSelectedPedido(freshData);
            setDetailData(freshData);
            setPedidoForRemito(freshData);
            setHojaTrabajoOpen(true);
          }
        } catch (fetchErr) {
          console.warn('Aviso refrescando detalle para hoja de trabajo:', fetchErr);
        }
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

  // Borrar Asignaciones / Reiniciar a Ingresado desde cero
  const handleDeshacerAsignaciones = async (pedidoId: string) => {
    const ped = pedidos.find((p) => p.id === pedidoId) || selectedPedido || detailData;
    const numPed = ped?.numero_pedido || ped?.orden_compra_cliente || 'este pedido';

    if (
      !window.confirm(
        `¿Deseas borrar todas las asignaciones y tareas de picking del pedido ${numPed}?\n\n• Se cancelarán las tareas de picking pendientes.\n• Se liberará todo el stock reservado volviéndolo disponible.\n• El pedido volverá al estado 'ingresado' para arrancar de 0.`
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      await pedidosApi.deshacerAsignacionPicking(pedidoId);
      rfSoundService.playSuccess();
      setFeedbackMsg({
        type: 'success',
        text: `¡Asignaciones eliminadas! Se liberaron las reservas de stock y el pedido ${numPed} volvió a estado Ingresado para arrancar desde cero.`,
      });

      onRefresh();
      if (selectedPedido?.id === pedidoId) {
        try {
          const freshData = await pedidosApi.obtenerPedidoConDetalle(pedidoId);
          setDetailData(freshData);
          setSelectedPedido(freshData);
        } catch (fetchErr) {
          console.warn('Aviso refrescando detalle:', fetchErr);
        }
      }
    } catch (err: any) {
      console.error('Error al deshacer asignaciones de picking:', err);
      rfSoundService.playError();
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al deshacer asignaciones de picking en base de datos',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancelar una sola tarea de picking
  const handleCancelarTareaPicking = async (tareaId: string) => {
    if (
      !window.confirm(
        '¿Deseas cancelar esta tarea de picking? La cantidad reservada será devuelta al stock disponible.'
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      await pedidosApi.cancelarTareaPicking(tareaId);
      rfSoundService.playSuccess();
      setFeedbackMsg({
        type: 'success',
        text: 'Tarea de picking cancelada y stock liberado exitosamente.',
      });

      onRefresh();
      if (selectedPedido?.id) {
        try {
          const freshData = await pedidosApi.obtenerPedidoConDetalle(selectedPedido.id);
          setDetailData(freshData);
          setSelectedPedido(freshData);
        } catch (fetchErr) {
          console.warn('Aviso refrescando detalle:', fetchErr);
        }
      }
    } catch (err: any) {
      console.error('Error al cancelar tarea de picking:', err);
      rfSoundService.playError();
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al cancelar la tarea de picking',
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

  const pedidosEnEjecucionFiltrados = React.useMemo(() => {
    return pedidosEnEjecucionEtapa1.filter((p) => {
      if (filtroEstado === 'todos') return true;
      if (filtroEstado === 'backorders') {
        const detalles = p.detalles || [];
        const totalSol = detalles.reduce((acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0), 0);
        const totalCubierto = detalles.reduce(
          (acc: number, d: any) =>
            acc + Math.max(Number(d.cantidad_reservada || 0), Number(d.cantidad_separada || 0)),
          0
        );
        return totalSol > totalCubierto;
      }
      return p.estado === filtroEstado;
    });
  }, [pedidosEnEjecucionEtapa1, filtroEstado]);

  const getStatusBadge = (estado: string, modalidad?: string) => {
    switch (estado) {
      case 'despachado':
        if (modalidad === 'retiro_deposito') {
          return <Badge variant="success">Despachado</Badge>;
        }
        return <Badge variant="success">Entregado</Badge>;
      case 'agrupado_salida':
        return <Badge variant="info">Agrupado en Salida</Badge>;
      case 'preparado':
        return <Badge variant="success">Preparado (Listo)</Badge>;
      case 'en_picking':
        return <Badge variant="warning">En Picking</Badge>;
      case 'asignado_picking':
        return <Badge variant="info">Asignado (FEFO/FIFO)</Badge>;
      case 'ingresado':
        return <Badge variant="default">Ingresado (Pendiente)</Badge>;
      default:
        return <Badge variant="outline">{estado || 'Pendiente'}</Badge>;
    }
  };

  const getOrdenSalidaBadge = (estado: string) => {
    switch (estado) {
      case 'planificacion':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#201f1f] dark:text-[#cdc3d4] dark:border-[#383838]">
            🔘 Planificación
          </span>
        );
      case 'consolidando_pallets':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-[#2b1c09] dark:text-[#ffddb8] dark:border-[#7a4c10]">
            🟡 Consolidando Pallets
          </span>
        );
      case 'remitida':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859]">
            📄 Remitida (Rx 100%)
          </span>
        );
      case 'cargando':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-400 dark:bg-[#38260a] dark:text-[#ffba28] dark:border-[#7a4c10]">
            🟠 En Carga (Muelle)
          </span>
        );
      case 'en_transito':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#0f281e] dark:text-[#69f0ae] dark:border-[#1b5037] inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            🟢 En Tránsito
          </span>
        );
      case 'cerrada':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-300 dark:bg-[#251733] dark:text-[#e4b5ff] dark:border-[#4d2d6b]">
            🏁 Cerrada
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 dark:bg-[#222] dark:text-[#aaa]">
            {estado || 'Planificación'}
          </span>
        );
    }
  };

  const getRemitoBadge = (estado: string) => {
    switch (estado) {
      case 'emitido':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859]">
            📄 Emitido
          </span>
        );
      case 'en_transito':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#0f281e] dark:text-[#69f0ae] dark:border-[#1b5037] inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            🟢 En Tránsito
          </span>
        );
      case 'entregado_conforme':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 dark:bg-[#143d2c] dark:text-[#69f0ae] dark:border-[#256e4c]">
            ✅ Entregado Conforme
          </span>
        );
      case 'rechazado_parcial':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10]">
            ⚠️ Desvío / Novedad
          </span>
        );
      case 'rechazado_total':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-900 border border-rose-300 dark:bg-[#3b1218] dark:text-[#ffb4ab] dark:border-[#6b161f]">
            ⛔ Rechazado Total
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 dark:bg-[#222] dark:text-[#aaa]">
            {estado || 'Emitido'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
            <ArrowUpFromLine className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
            Flujo de Pedidos y Entregas (Outbound)
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mt-0.5">
            Flujo coordinado en 3 etapas: Pedidos/Picking ➔ Salidas (Remitos y Romaneos) ➔ Ruteos y Conformes.
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
            <span>Nueva Hoja de Ruta</span>
          </button>

          <button
            onClick={refrescarTodo}
            disabled={loadingExtras}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] hover:bg-slate-50 dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingExtras ? 'animate-spin text-emerald-600' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* 3-STEP OUTBOUND WORKFLOW STEPPER */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Step 1: Pedidos / Picking */}
        <button
          type="button"
          onClick={() => handleSubTabChange('pedidos')}
          className={`relative p-3 sm:p-3.5 rounded-xl border text-left transition-all min-w-0 overflow-hidden ${
            activeSubTab === 'pedidos'
              ? 'bg-violet-50/90 dark:bg-[#201330] border-violet-500 dark:border-[#dab9ff] shadow-md ring-2 ring-violet-500/20 dark:ring-[#dab9ff]/30'
              : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-[#2d2d2d] hover:bg-slate-50 dark:hover:bg-[#202020]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 gap-1.5">
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                activeSubTab === 'pedidos'
                  ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#320065]'
                  : 'bg-slate-100 text-slate-600 dark:bg-[#262626] dark:text-[#cdc3d4]'
              }`}
            >
              Etapa 1
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-[#cdc3d4] truncate">
              {pedidosEnEjecucionEtapa1.length} en curso • {pedidosHistoricosEtapa1.length} cerradas
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Box
              className={`w-4 h-4 shrink-0 ${
                activeSubTab === 'pedidos' ? 'text-violet-600 dark:text-[#dab9ff]' : 'text-slate-400'
              }`}
            />
            <h3 className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] truncate">
              1- Pedidos / Picking
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-1 leading-snug line-clamp-1">
            <b>Doc:</b> Órdenes, picking lists y hojas de trabajo
          </p>
        </button>

        {/* Step 2: Salidas */}
        <button
          type="button"
          onClick={() => handleSubTabChange('salidas')}
          className={`relative p-3 sm:p-3.5 rounded-xl border text-left transition-all min-w-0 overflow-hidden ${
            activeSubTab === 'salidas'
              ? 'bg-sky-50/90 dark:bg-[#10242b] border-sky-500 dark:border-[#75d1ff] shadow-md ring-2 ring-sky-500/20 dark:ring-[#75d1ff]/30'
              : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-[#2d2d2d] hover:bg-slate-50 dark:hover:bg-[#202020]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 gap-1.5">
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                activeSubTab === 'salidas'
                  ? 'bg-sky-600 text-white dark:bg-[#75d1ff] dark:text-[#002a3a]'
                  : 'bg-slate-100 text-slate-600 dark:bg-[#262626] dark:text-[#cdc3d4]'
              }`}
            >
              Etapa 2
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-[#cdc3d4] truncate">
              {pedidosListosParaSalidas.length} a remitir • {remitosList.length} remitos
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <ArrowUpFromLine
              className={`w-4 h-4 shrink-0 ${
                activeSubTab === 'salidas' ? 'text-sky-600 dark:text-[#75d1ff]' : 'text-slate-400'
              }`}
            />
            <h3 className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] truncate">
              2- Salidas
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-1 leading-snug line-clamp-1">
            <b>Doc:</b> Remitos Rx de tránsito, romaneos y rótulos
          </p>
        </button>

        {/* Step 3: Ruteos */}
        <button
          type="button"
          onClick={() => handleSubTabChange('rutas')}
          className={`relative p-3 sm:p-3.5 rounded-xl border text-left transition-all min-w-0 overflow-hidden ${
            activeSubTab === 'rutas'
              ? 'bg-emerald-50/90 dark:bg-[#0f281e] border-emerald-500 dark:border-[#69f0ae] shadow-md ring-2 ring-emerald-500/20 dark:ring-[#69f0ae]/30'
              : 'bg-white dark:bg-[#181818] border-slate-200 dark:border-[#2d2d2d] hover:bg-slate-50 dark:hover:bg-[#202020]'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5 gap-1.5">
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                activeSubTab === 'rutas'
                  ? 'bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]'
                  : 'bg-slate-100 text-slate-600 dark:bg-[#262626] dark:text-[#cdc3d4]'
              }`}
            >
              Etapa 3
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-[#cdc3d4] truncate">
              {rutasActivas.length} activas • {rutasCumplidas.length} cerradas
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Truck
              className={`w-4 h-4 shrink-0 ${
                activeSubTab === 'rutas' ? 'text-emerald-600 dark:text-[#69f0ae]' : 'text-slate-400'
              }`}
            />
            <h3 className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] truncate">
              3- Ruteos
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-1 leading-snug line-clamp-1">
            <b>Doc:</b> Hojas de ruta, control carga y conformes POD
          </p>
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
        <div className="w-full space-y-6">
          {/* Banner Documentación Etapa 1 */}
          <div className="p-3.5 bg-violet-50/70 dark:bg-[#1f132e] border border-violet-200 dark:border-[#dab9ff]/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#320065]">
                DOCUMENTACIÓN ETAPA 1
              </span>
              <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                Órdenes de Pedido y Picking (Hojas de Trabajo Operativa / Picking Lists)
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
              Alocación FEFO/FIFO con roles (Operador, Supervisor y Controller), recolección física en pasillos e impresión de hojas de trabajo antes del empaque.
            </div>
          </div>

          {/* SUB-SECCIÓN 1: ÓRDENES EN EJECUCIÓN / PICKING ACTIVO */}
          <div className="w-full">
            <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
                    <Box className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                    1. Órdenes en Ejecución / Picking Activo ({pedidosEnEjecucionFiltrados.length})
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                    Órdenes pendientes de alocación de stock o actualmente en proceso de recolección física en pasillos/racks.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 dark:text-[#cdc3d4]">Filtrar:</span>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="px-2.5 py-1 rounded bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs font-medium text-slate-800 dark:text-[#e5e2e1] cursor-pointer focus:outline-none focus:border-violet-500 shadow-xs"
                  >
                    <option value="todos">Todos en Ejecución</option>
                    <option value="backorders">⚠️ Con Backorders / Faltantes</option>
                    <option value="ingresado">Ingresados (Sin Asignar)</option>
                    <option value="asignado_picking">Asignados (FEFO / FIFO)</option>
                    <option value="en_picking">En Picking</option>
                  </select>
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-[#44424a]">
                {pedidosEnEjecucionFiltrados.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 dark:text-[#cdc3d4]">
                    <PackageCheck className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-[#978d9d] opacity-50" />
                    <p className="text-xs font-semibold">No hay órdenes en ejecución que coincidan con el filtro</p>
                    <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                      Crea un nuevo pedido o consulta las órdenes preparadas en el histórico abajo.
                    </p>
                  </div>
                ) : (
                  pedidosEnEjecucionFiltrados.map((ped) => {
                    const isSelected = selectedPedido?.id === ped.id;
                    const operadorNombre =
                      ped.operador_picking?.nombre_completo ||
                      usuariosMap.get(ped.operador_picking_id) ||
                      null;
                    const supervisorNombre =
                      ped.supervisor_picking?.nombre_completo ||
                      usuariosMap.get(ped.supervisor_picking_id) ||
                      null;
                    const controllerNombre =
                      ped.controller_picking?.nombre_completo ||
                      usuariosMap.get(ped.controller_picking_id) ||
                      null;

                    const totalSol = (ped.detalles || []).reduce(
                      (acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0),
                      0
                    );
                    const totalCub = (ped.detalles || []).reduce(
                      (acc: number, d: any) =>
                        acc + Math.max(Number(d.cantidad_reservada || 0), Number(d.cantidad_separada || 0)),
                      0
                    );
                    const faltante = totalSol - totalCub;

                    return (
                      <div
                        key={ped.id}
                        onClick={() => handleSelectPedido(ped)}
                        className={`p-3 sm:p-4 cursor-pointer transition-all border-b border-slate-100 dark:border-[#44424a] ${
                          isSelected
                            ? 'bg-violet-50/80 dark:bg-gradient-to-r dark:from-[#dab9ff]/15 dark:via-[#201330] dark:to-[#1c1b1b] border-l-4 border-l-violet-600 dark:border-l-[#dab9ff]'
                            : 'hover:bg-slate-50/80 dark:hover:bg-[#201f1f]/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">
                                {ped.numero_pedido}
                              </span>
                              {getStatusBadge(ped.estado, ped.modalidad_entrega)}
                              {ped.modalidad_entrega === 'retiro_deposito' ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#142e1d] dark:text-[#78d492] dark:border-[#2a683b] inline-flex items-center gap-1">
                                  <Warehouse className="w-3 h-3" />
                                  Pick-up Depósito
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-[#0f2534] dark:text-[#75d1ff] dark:border-[#1b435d] inline-flex items-center gap-1">
                                  <Truck className="w-3 h-3" />
                                  Flete
                                </span>
                              )}
                              {ped.prioridad === 'urgente' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]">
                                  ⚡ URGENTE
                                </span>
                              )}
                              {ped.es_parcializado && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-[#2e173e] dark:text-[#e4b5ff] dark:border-[#532675]">
                                  ✂️ Parcializado
                                </span>
                              )}
                              {faltante > 0 && ped.estado !== 'despachado' && ped.estado !== 'cancelado' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-[#3b2a10] dark:text-[#ffddb8] dark:border-[#6d4c1b]">
                                  ⚠️ Backorder ({faltante} un.)
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-[#cdc3d4] font-medium mt-1">
                              <span>
                                Cliente: <b className="text-slate-800 dark:text-[#e5e2e1]">{ped.cliente?.razon_social || '-'}</b>
                              </span>
                              {ped.modalidad_entrega === 'retiro_deposito' ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  • Retira en: {ped.almacen_origen?.nombre || 'Depósito SSD'}
                                </span>
                              ) : (
                                ped.destinatario?.razon_social && (
                                  <span className="text-slate-600 dark:text-[#cdc3d4]">
                                    • Destino: <b>{ped.destinatario.razon_social}</b> ({[ped.destinatario.localidad, ped.destinatario.ciudad].filter(Boolean).join(' • ') || 'Entrega'})
                                  </span>
                                )
                              )}
                            </div>
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

                        {/* Fila de Estrategia y Roles Asignados */}
                        <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-[#161515] border border-slate-200/80 dark:border-[#2d2d2d] flex flex-wrap items-center justify-between gap-2 text-[11px] mb-2.5">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-slate-500 dark:text-[#978d9d]">Estrategia:</span>
                              {ped.estrategia_alocacion ? (
                                <span className="px-2 py-0.5 rounded font-black text-[10px] bg-violet-100 text-violet-800 dark:bg-[#320065] dark:text-[#dab9ff] border border-violet-200 dark:border-[#521394]">
                                  {ped.estrategia_alocacion}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-[#978d9d] italic">Sin alocación</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-slate-600 dark:text-[#cdc3d4]">
                              <User className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                              <span>Operador: <b className="text-slate-900 dark:text-[#e5e2e1]">{operadorNombre || 'Sin asignar'}</b></span>
                            </div>

                            <div className="flex items-center gap-1 text-slate-600 dark:text-[#cdc3d4]">
                              <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff]" />
                              <span>Supervisor: <b className="text-slate-900 dark:text-[#e5e2e1]">{supervisorNombre || 'Sin asignar'}</b></span>
                            </div>

                            {controllerNombre && (
                              <div className="flex items-center gap-1 text-slate-600 dark:text-[#cdc3d4]">
                                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                                <span>Controller: <b className="text-slate-900 dark:text-[#e5e2e1]">{controllerNombre}</b></span>
                              </div>
                            )}
                          </div>

                          <div className="font-mono text-slate-600 dark:text-[#cdc3d4]">
                            Cantidades: <b>{totalCub}</b> de <b>{totalSol}</b> un. preparadas
                          </div>
                        </div>

                        {/* Botonera de Acciones de Etapa 1 */}
                        <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-4 pt-2 border-t border-slate-100 dark:border-[#333333] text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                            <span>
                              Destino: <b className="text-slate-800 dark:text-[#e5e2e1]">{ped.destinatario?.razon_social || 'Sucursal Principal'}</b> ({[ped.destinatario?.localidad, ped.destinatario?.ciudad].filter(Boolean).join(' • ') || 'Local'})
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* 1. Asignar Picking Auto (1-Click) o con Estrategia Modal */}
                            {ped.estado === 'ingresado' && (
                              <div className="inline-flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAsignarFEFO(ped.id);
                                  }}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-all shadow-sm active:scale-95"
                                  title="Asignación automática rápida (FEFO/FIFO) en un solo clic"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>⚡ Asignar Auto</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPedidoParaAsignarPicking(ped);
                                    setAsignacionPickingModalOpen(true);
                                  }}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 dark:bg-[#25143a] dark:text-[#dab9ff] dark:border-[#521394] transition-all shadow-xs"
                                  title="Personalizar estrategia (FEFO vs FIFO) y asignar operadores o roles"
                                >
                                  <Users className="w-3 h-3" />
                                  <span>Estrategia / Roles</span>
                                </button>
                              </div>
                            )}

                            {/* 2. Re-asignar roles si ya está asignado */}
                            {(ped.estado === 'asignado_picking' || ped.estado === 'en_picking') && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPedidoParaAsignarPicking(ped);
                                    setAsignacionPickingModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 dark:bg-[#25143a] dark:text-[#dab9ff] dark:border-[#521394] transition-colors shadow-xs"
                                  title="Modificar asignación de operador, supervisor o estrategia"
                                >
                                  <Users className="w-3 h-3" />
                                  <span>Roles / Estrategia</span>
                                </button>

                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setPedidoForRemito(ped);
                                    setSelectedPedido(ped);
                                    try {
                                      const fresh = await pedidosApi.obtenerPedidoConDetalle(ped.id);
                                      if (fresh) {
                                        setDetailData(fresh);
                                        setPedidoForRemito(fresh);
                                        setSelectedPedido(fresh);
                                      }
                                    } catch (err) {
                                      console.warn('Error precargando detalle para hoja de trabajo:', err);
                                    }
                                    setHojaTrabajoOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#0f2534] dark:hover:bg-[#153447] dark:text-[#75d1ff] dark:border-[#1b435d] transition-colors shadow-xs"
                                  title="Imprimir Hoja de Trabajo Operativa / Picking para preparar el pedido en almacén"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>Hoja de Trabajo</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPedidoForRemito(ped);
                                    setSelectedPedido(ped);
                                    setBrotherLpnModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#242323] dark:text-[#cdc3d4] dark:border-[#383737] transition-colors shadow-xs"
                                  title="Imprimir tirada de etiquetas Brother LPN para identificación en picking"
                                >
                                  <Barcode className="w-3 h-3" />
                                  <span>LPN</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeshacerAsignaciones(ped.id);
                                  }}
                                  disabled={isSubmitting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-[#341014] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                                  title="Borrar las asignaciones y tareas de picking de este pedido, liberar reservas y volver a ingresado desde 0"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reiniciar a 0</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectPedido(ped);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#1a1919] dark:text-[#e5e2e1] dark:border-[#383737] transition-colors shadow-xs"
                                >
                                  <Box className="w-3 h-3" />
                                  <span>Ver Tareas</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* SUB-SECCIÓN 2: HISTORIAL DE ÓRDENES CERRADAS / PREPARADAS (COMPACT TABLE) */}
          <div className="w-full mt-8 pt-4 border-t-2 border-dashed border-slate-200 dark:border-[#2d2d2d] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                  2. Historial de Órdenes Cerradas / Preparadas ({pedidosHistoricosEtapa1.length})
                </span>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                  Registro de órdenes con recolección completada, remitidas o despachadas. Trazabilidad de operaciones y acceso a documentación.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a]">
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-semibold">N° Pedido</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Fecha</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Cliente</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Destino / Tipo</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Unidades</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Estrategia & Roles</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Estado</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-center">Documentación & Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#44424a]">
                    {pedidosHistoricosEtapa1.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#cdc3d4]">
                          Aún no hay órdenes cerradas en el historial.
                        </td>
                      </tr>
                    ) : (
                      pedidosHistoricosEtapa1.map((ped) => {
                        const totalSol = (ped.detalles || []).reduce(
                          (acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0),
                          0
                        );
                        const totalCub = (ped.detalles || []).reduce(
                          (acc: number, d: any) =>
                            acc + Math.max(Number(d.cantidad_reservada || 0), Number(d.cantidad_separada || 0)),
                          0
                        );
                        const opNom =
                          ped.operador_picking?.nombre_completo ||
                          usuariosMap.get(ped.operador_picking_id) ||
                          '-';
                        const supNom =
                          ped.supervisor_picking?.nombre_completo ||
                          usuariosMap.get(ped.supervisor_picking_id) ||
                          '-';

                        return (
                          <tr
                            key={ped.id}
                            className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors"
                          >
                            <td className="px-3 py-2 font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                              {ped.numero_pedido}
                              {ped.orden_compra_cliente && (
                                <span className="block text-[10px] text-slate-400 font-mono">
                                  OC: {ped.orden_compra_cliente}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500 dark:text-[#cdc3d4] text-[11px]">
                              {formatDate(ped.fecha_solicitud)}
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-[#e5e2e1]">
                              {ped.cliente?.razon_social || '-'}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-[#cdc3d4]">
                              {ped.modalidad_entrega === 'retiro_deposito' ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                  <Warehouse className="w-3 h-3" />
                                  Pick-up
                                </span>
                              ) : (
                                <span>{ped.destinatario?.razon_social || 'Flete'}</span>
                              )}
                            </td>
                            <td className="px-2.5 py-2 text-center font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                              {totalCub}/{totalSol}
                            </td>
                            <td className="px-3 py-2 text-[11px]">
                              <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] mr-1">
                                [{ped.estrategia_alocacion || 'FEFO'}]
                              </span>
                              <span className="text-slate-600 dark:text-[#cdc3d4]">
                                Op: <b>{opNom}</b> • Sup: <b>{supNom}</b>
                              </span>
                            </td>
                            <td className="px-2.5 py-2 text-center">
                              {getStatusBadge(ped.estado, ped.modalidad_entrega)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPedidoForRemito(ped);
                                    setSelectedPedido(ped);
                                    setHojaTrabajoOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-sky-50 text-sky-800 border border-sky-200 dark:bg-[#0f2534] dark:text-[#75d1ff] dark:border-[#1b435d] hover:bg-sky-100 transition-colors"
                                  title="Ver e imprimir Hoja de Picking / Trabajo"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Hoja Picking</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setPedidoForRemito(ped);
                                    setSelectedPedido(ped);
                                    setBrotherLpnModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#201f1f] dark:text-[#cdc3d4] dark:border-[#383737] hover:bg-slate-200 transition-colors"
                                  title="Imprimir Etiquetas Brother LPN"
                                >
                                  <Barcode className="w-3 h-3" />
                                  <span>LPN</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSelectPedido(ped)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-slate-50 text-slate-700 border border-slate-200 dark:bg-[#151515] dark:text-[#e5e2e1] dark:border-[#333333] hover:bg-slate-100 transition-colors"
                                  title="Ver detalle del pedido y tareas recolectadas"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Detalle</span>
                                </button>

                                {ped.estado === 'preparado' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectPedido(ped);
                                      setPedidoForRemito(ped);
                                      handleSubTabChange('salidas');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-sky-600 hover:bg-sky-700 text-white dark:bg-[#75d1ff] dark:hover:bg-[#9ee2ff] dark:text-[#002a3a] transition-all shadow-xs active:scale-95"
                                    title="Avanzar pedido a Etapa 2 (Salidas) para Remito Rx, Romaneo y Planificación de Itinerario"
                                  >
                                    <ArrowUpFromLine className="w-3 h-3" />
                                    <span>Pasar a Salidas ➔</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail & Picking Tasks Centered Modal */}
      {selectedPedido && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm print:hidden"
            onClick={() => setSelectedPedido(null)}
          >
              <div
                className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-[#e5e2e1]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between flex-shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] flex flex-wrap items-center gap-2">
                      <span>Detalle y Tareas:</span>
                      <span className="font-mono text-violet-700 dark:text-[#dab9ff]">{selectedPedido.numero_pedido}</span>
                      {selectedPedido.modalidad_entrega === 'retiro_deposito' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-[#142e1d] dark:text-[#78d492] dark:border dark:border-[#2a683b] inline-flex items-center gap-1">
                          <Warehouse className="w-3 h-3" />
                          Retiro Pick-up ({selectedPedido.almacen_origen?.nombre || 'Depósito SSD'})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-[#0f2534] dark:text-[#75d1ff] dark:border dark:border-[#1b435d] inline-flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          Envío ({selectedPedido.destinatario?.razon_social || 'Reparto'})
                        </span>
                      )}
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
                    <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase block mb-1">Estado Actual</span>
                    <div className="flex items-center gap-1.5">
                      {getStatusBadge(selectedPedido.estado, selectedPedido.modalidad_entrega)}
                      <span className="font-mono text-xs text-slate-500 dark:text-[#cdc3d4]">({selectedPedido.estado})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedPedido.estado === 'ingresado' && (
                      <button
                        onClick={() => {
                          setPedidoParaAsignarPicking(selectedPedido);
                          setAsignacionPickingModalOpen(true);
                        }}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-xs"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Asignar Picking (FEFO/FIFO)
                      </button>
                    )}

                    {(selectedPedido.estado === 'asignado_picking' || selectedPedido.estado === 'en_picking') && (
                      <>
                        <button
                          onClick={() => {
                            setPedidoParaAsignarPicking(selectedPedido);
                            setAsignacionPickingModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 dark:bg-[#25143a] dark:text-[#dab9ff] dark:border-[#521394] transition-colors shadow-xs"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Roles / Estrategia
                        </button>
                        <button
                          onClick={() => {
                            setPedidoForRemito(detailData || selectedPedido);
                            setHojaTrabajoOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#0f2534] dark:hover:bg-[#153447] dark:text-[#75d1ff] dark:border-[#1b435d] transition-colors shadow-xs"
                          title="Imprimir Hoja de Trabajo Operativa / Picking para preparar el pedido en almacén"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Hoja de Trabajo
                        </button>
                        <button
                          onClick={() => {
                            setPedidoForRemito(selectedPedido);
                            setBrotherLpnModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 dark:bg-[#340f12] dark:hover:bg-[#471518] dark:text-[#ffb4ab] dark:border-[#5d1b1f] transition-colors shadow-xs"
                          title="Imprimir tirada de etiquetas Brother LPN para los rollos del pedido"
                        >
                          <Barcode className="w-3.5 h-3.5" />
                          Etiquetas LPN
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeshacerAsignaciones(selectedPedido.id)}
                          disabled={isSubmitting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#341014] dark:hover:bg-[#48171c] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                          title="Borrar las asignaciones y tareas de picking de este pedido, liberar reservas y volver a arrancar de 0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Borrar Asignaciones (Arrancar de 0)</span>
                        </button>
                      </>
                    )}

                    {(selectedPedido.estado === 'preparado' || selectedPedido.estado === 'agrupado_salida' || selectedPedido.estado === 'despachado') && (
                      <>
                        <button
                          onClick={() => {
                            setPedidoForRemito(selectedPedido);
                            setHojaTrabajoOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 dark:bg-[#0f2534] dark:hover:bg-[#153447] dark:text-[#75d1ff] dark:border-[#1b435d] transition-colors shadow-xs"
                          title="Imprimir Hoja de Trabajo Operativa / Picking para conteo y control físico"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Hoja de Trabajo
                        </button>

                        <button
                          onClick={() => {
                            setPedidoForRemito(selectedPedido);
                            setBrotherLpnModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 dark:bg-[#340f12] dark:hover:bg-[#471518] dark:text-[#ffb4ab] dark:border-[#5d1b1f] transition-colors shadow-xs"
                          title="Imprimir la tirada de etiquetas Brother LPN para los rollos del pedido"
                        >
                          <Barcode className="w-3.5 h-3.5" />
                          Etiquetas LPN
                        </button>

                        {/* En Etapa 1 nunca mostrar Remito o Despachar, sino botón para pasar a Etapa 2 */}
                        {activeSubTab === 'pedidos' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPedido(null);
                              setPedidoForRemito(selectedPedido);
                              handleSubTabChange('salidas');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white dark:bg-[#75d1ff] dark:hover:bg-[#9ee2ff] dark:text-[#002a3a] transition-all shadow-sm active:scale-95"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5" />
                            <span>Pasar a Salidas (Etapa 2) ➔</span>
                          </button>
                        ) : (
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
                              onClick={() => {
                                setPedidoForRemito(selectedPedido);
                                setRomaneoEditorOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:hover:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332] transition-colors shadow-xs"
                              title="Cargar o corregir los metros/kilos de los rollos no estándar al finalizar el pedido"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Cargar Romaneo
                            </button>

                            <button
                              onClick={() => {
                                setPedidoForRemito(selectedPedido);
                                setRomaneoModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 dark:bg-[#0f1d34] dark:hover:bg-[#152747] dark:text-[#75d1ff] dark:border-[#1b345d] transition-colors shadow-xs"
                              title="Imprimir Planilla de Romaneo independiente del Remito"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              Planilla Romaneo
                            </button>

                            <button
                              onClick={() => {
                                setPedidoForRemito(selectedPedido);
                                setRotuloExpresoModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 dark:bg-[#34240f] dark:hover:bg-[#473215] dark:text-[#ffddb8] dark:border-[#5d401b] transition-colors shadow-xs"
                              title="Imprimir tirada de rótulos 62x100mm para Expreso"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              Rótulos Expreso
                            </button>

                            {selectedPedido?.id && (
                              <button
                                onClick={() => handleDespacharPedido(selectedPedido.id)}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#2a0e12] dark:hover:bg-[#3d1419] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                                title="Deduce el stock físico reservado y registra la salida definitiva en el Kardex"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Despachar Salida
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Backorder Banner and Short-Ship Action */}
                {(() => {
                  if (!detailData?.detalles || !Array.isArray(detailData.detalles)) return null;
                  const totalSol = detailData.detalles.reduce((acc: number, d: any) => acc + Number(d?.cantidad_solicitada || 0), 0);
                  const totalCub = detailData.detalles.reduce((acc: number, d: any) => acc + Math.max(Number(d?.cantidad_reservada || 0), Number(d?.cantidad_separada || 0)), 0);
                  const faltante = totalSol - totalCub;

                  if (faltante > 0 && selectedPedido?.estado !== 'despachado' && selectedPedido?.estado !== 'cancelado') {
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
                          {selectedPedido?.id && (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Modal Scrollable Body */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  {!detailData?.detalles || !Array.isArray(detailData.detalles) || detailData.detalles.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 dark:text-[#cdc3d4] text-xs">
                      {loadingDetail ? 'Cargando renglones del pedido...' : 'Sin renglones para este pedido.'}
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
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-[#e5e2e1] block">
                                {det.articulo?.nombre || 'Artículo'}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block">
                                {(det.articulo as any)?.descripcion_full || getDescripcionFull(det.articulo) || det.articulo?.descripcion || ''}
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
                                    <div className="pt-1.5 flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleCancelarTareaPicking(t.id)}
                                        disabled={isSubmitting}
                                        className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-colors shadow-xs flex items-center gap-1.5"
                                        title="Cancelar y descartar esta tarea de picking específica, liberando su reserva al stock disponible"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Cancelar Tarea</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTareaParaReasignar({
                                            ...t,
                                            pedido: selectedPedido || detailData,
                                            articulo: det.articulo,
                                          });
                                          setReasignarTareaModalOpen(true);
                                        }}
                                        className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-colors shadow-xs flex items-center gap-1.5"
                                        title="Reasignar lote, posición física o cantidad de esta tarea"
                                      >
                                        <Sliders className="w-3.5 h-3.5" />
                                        <span>Reasignar Lote</span>
                                      </button>
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

      {/* TAB 2: SALIDAS (REMITOS Y ROMANEOS) */}
      {activeSubTab === 'salidas' && (
        <div className="space-y-4">
          {/* Banner Documentación Etapa 2 */}
          <div className="p-3.5 bg-sky-50/70 dark:bg-[#10242b] border border-sky-200 dark:border-[#75d1ff]/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-600 text-white dark:bg-[#75d1ff] dark:text-[#002a3a]">
                DOCUMENTACIÓN ETAPA 2
              </span>
              <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                Remitos Rx de Tránsito Oficiales, Planillas de Romaneo Textil / Cortes y Rótulos de Bulto
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
              Consolidación en mesa de empaque, detalle de piezas por bulto y emisión fiscal de remitos.
            </div>
          </div>

          {/* SUB-SECCIÓN 1: PEDIDOS PREPARADOS PENDIENTES DE PLANIFICACIÓN Y REMITO */}
          <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
                  <Box className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
                  1. Pedidos Preparados Pendientes de Planificación ({pedidosListosParaSalidas.length})
                </span>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                  Picking completado. Muestreo de control en expedición, coordinación con el destinatario, parcialización si excede la unidad, romaneos, rótulos de bulto y remito Rx.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAsignarRutaOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] transition-all shadow-xs active:scale-95"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Planificar en Hoja de Ruta</span>
                </button>
                {pedidosListosParaSalidas.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-100 text-sky-800 dark:bg-[#10242b] dark:text-[#75d1ff] border border-sky-300 dark:border-[#1e4859]">
                    {pedidosListosParaSalidas.length} sin asignar a ruta
                  </span>
                )}
              </div>
            </div>

            {pedidosListosParaSalidas.length === 0 ? (
              <div className="py-10 text-center text-slate-400 dark:text-[#978d9d] px-4">
                <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-40 text-sky-600 dark:text-[#75d1ff]" />
                <p className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4]">
                  No hay pedidos preparados pendientes de asignar a ruta.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                  {pedidosPreparados.length > 0
                    ? `Los ${pedidosPreparados.length} pedidos preparados ya se encuentran asignados en hojas de ruta de la Etapa 3.`
                    : 'Completa la recolección de las órdenes en la Etapa 1 (Pedidos / Picking) para prepararlas aquí.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a]">
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-semibold">N° Pedido</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Cliente</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Destino & Coordinación</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Unidades</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-center">Control Muestreo</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Estado</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-center">
                        Documentación & Acciones de Etapa 2
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#44424a]">
                    {pedidosListosParaSalidas.map((ped) => {
                      const totalUnidades = (ped.detalles || []).reduce(
                        (acc: number, d: any) =>
                          acc + Number(d.cantidad_separada || d.cantidad_solicitada || 0),
                        0
                      );
                      const muestreoOk = ped.control_muestreo_completado;
                      const remitoExistente = remitosList.find((r) => r.pedido_id === ped.id);

                      return (
                        <tr
                          key={ped.id}
                          className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors"
                        >
                          <td className="px-3 py-2 font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{ped.numero_pedido}</span>
                              {ped.es_parcializado && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-[#2e173e] dark:text-[#e4b5ff] dark:border-[#532675]">
                                  ✂️ Parcial
                                </span>
                              )}
                              {remitoExistente && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-[#142e1d] dark:text-[#69f0ae] dark:border-[#225735] inline-flex items-center gap-0.5" title={`Remito emitido: ${remitoExistente.numero_remito_rx}`}>
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  {remitoExistente.numero_remito_rx}
                                </span>
                              )}
                            </div>
                            {ped.orden_compra_cliente && (
                              <span className="block text-[10px] text-slate-400 dark:text-[#978d9d] font-mono">
                                OC: {ped.orden_compra_cliente}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-[#e5e2e1]">
                            {ped.cliente?.razon_social || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-[#cdc3d4]">
                            {ped.modalidad_entrega === 'retiro_deposito' ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                                <Warehouse className="w-3 h-3" />
                                Pick-up ({ped.almacen_origen?.nombre || 'Depósito SSD'})
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="font-medium text-slate-800 dark:text-[#e5e2e1]">
                                  {ped.destinatario?.razon_social || 'Flete Reparto'}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-[#978d9d]">
                                  {[ped.destinatario?.direccion_entrega, ped.destinatario?.localidad, ped.destinatario?.ciudad].filter(Boolean).join(' • ') || 'Dirección de entrega'}
                                </div>
                                {ped.destinatario?.telefono && (
                                  <div className="font-mono text-[10px] text-sky-700 dark:text-[#75d1ff] flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    <span>Tel: {ped.destinatario.telefono}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-center font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                            {totalUnidades}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {muestreoOk ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332] inline-flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" />
                                  Conforme
                                </span>
                                {ped.control_muestreo_usuario && (
                                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    Por: {ped.control_muestreo_usuario}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPedidoParaMuestreo(ped);
                                  setControlMuestreoModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10] transition-colors"
                                title="Auditar y controlar artículos por muestreo en zona de expediciones"
                              >
                                <ClipboardCheck className="w-3 h-3" />
                                <span>Muestreo</span>
                              </button>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {getStatusBadge(ped.estado, ped.modalidad_entrega)}
                              {pedidosEnOrdenesSalidaMap.get(ped.id) && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-violet-100 text-violet-800 dark:bg-[#321d4d] dark:text-[#dab9ff] border border-violet-200 dark:border-[#521394]" title={`Agrupado en ${pedidosEnOrdenesSalidaMap.get(ped.id)?.numero_orden_salida}`}>
                                  OS: {pedidosEnOrdenesSalidaMap.get(ped.id)?.numero_orden_salida}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {/* 1. Parcializar Pedido si no entra en la unidad */}
                              <button
                                type="button"
                                onClick={() => {
                                  setPedidoParaParcializar(ped);
                                  setParcializarModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 dark:bg-[#251733] dark:text-[#e4b5ff] dark:border-[#4d2d6b] transition-colors shadow-xs"
                                title="Dividir pedido en 2 viajes si la carga no entra completa en la unidad"
                              >
                                <Scissors className="w-3 h-3" />
                                <span>Parcializar</span>
                              </button>

                              {/* 2. Packing Station */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPedido(ped);
                                  setPedidoForRemito(ped);
                                  setPackingModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10] transition-colors shadow-xs"
                                title="Pesar, medir y consolidar bultos/pallets en mesa de empaque"
                              >
                                <PackageCheck className="w-3 h-3" />
                                <span>Packing</span>
                              </button>

                              {/* 3. Planilla de Romaneo */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPedido(ped);
                                  setPedidoForRemito(ped);
                                  setRomaneoModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859] transition-colors shadow-xs"
                                title="Imprimir planilla de romaneo con detalle de piezas/metros"
                              >
                                <FileSpreadsheet className="w-3 h-3" />
                                <span>Romaneo</span>
                              </button>

                              {/* 4. Editor de Romaneo */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPedido(ped);
                                  setPedidoForRemito(ped);
                                  setRomaneoEditorOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-[#1e1b38] dark:text-[#b3aaff] dark:border-[#3a356b] transition-colors shadow-xs"
                                title="Cargar o modificar excepciones y medidas reales de rollos/piezas"
                              >
                                <Layers className="w-3 h-3" />
                                <span>Editar</span>
                              </button>

                              {/* 5. Rótulo de Expreso */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPedido(ped);
                                  setPedidoForRemito(ped);
                                  setRotuloExpresoModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 dark:bg-[#251733] dark:text-[#e4b5ff] dark:border-[#4d2d6b] transition-colors shadow-xs"
                                title="Imprimir rótulos de bulto para transporte"
                              >
                                <Barcode className="w-3 h-3" />
                                <span>Rótulos</span>
                              </button>

                              {/* 6. Emitir / Ver Remito Rx */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPedido(ped);
                                  setPedidoForRemito(ped);
                                  setRemitoModalOpen(true);
                                }}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded transition-colors shadow-xs ${
                                  remitoExistente
                                    ? 'bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859]'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d]'
                                }`}
                                title={remitoExistente ? `Ver Remito Rx emitido: ${remitoExistente.numero_remito_rx}` : "Emitir Remito Rx oficial de tránsito"}
                              >
                                <FileText className="w-3 h-3" />
                                <span>{remitoExistente ? 'Ver Remito' : 'Emitir Remito Rx'}</span>
                              </button>

                              {/* 7. Despacho directo (si retiro cliente) */}
                              {ped.modalidad_entrega === 'retiro_deposito' && ped.estado !== 'despachado' && (
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => handleDespacharPedido(ped.id)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                                  title="Confirmar entrega directa y salida en Kardex"
                                >
                                  <Truck className="w-3 h-3" />
                                  <span>Salida Pick-up</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SUB-SECCIÓN 2: ÓRDENES DE SALIDA CONSOLIDADAS Y MÁQUINA DE ESTADOS */}
          <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
                  <Truck className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                  2. Órdenes de Salida Consolidadas ({ordenesSalida.length})
                </span>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                  Agrupación multi-pedido para expedición y seguimiento del ciclo de vida (Planificación ➔ Remitida ➔ En Carga ➔ En Tránsito ➔ Cerrada).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAsignarRutaOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva Salida / Ruta</span>
                </button>
              </div>
            </div>

            {ordenesSalida.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-[#978d9d] px-4">
                <Truck className="w-7 h-7 mx-auto mb-1.5 opacity-40 text-violet-600 dark:text-[#dab9ff]" />
                <p className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4]">
                  No hay órdenes de salida registradas.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                  Selecciona pedidos preparados arriba y haz clic en &quot;Planificar en Hoja de Ruta&quot; para consolidar una salida.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a]">
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-semibold">N° Orden Salida</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Almacén</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Fecha Programada</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Estado Flujo WMS</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Pedidos Asociados</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Remitos Rx</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Hoja de Ruta</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#44424a]">
                    {ordenesSalida.map((os: any) => {
                      const pedidosAsoc = os.pedidos_asociados || [];
                      const cantPedidos = pedidosAsoc.length;
                      const remitosVinculados = remitosList.filter((r: any) => r.orden_salida_id === os.id);
                      const cantRemitos = remitosVinculados.length;
                      const rutaInfo = Array.isArray(os.ruta) ? os.ruta[0] : os.ruta;

                      return (
                        <tr key={os.id} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors">
                          <td className="px-3 py-2 font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                            {os.numero_orden_salida}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-[#cdc3d4]">
                            {os.almacen?.nombre || 'Almacén Central'}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                            {os.fecha_salida_programada ? formatDate(os.fecha_salida_programada) : 'Inmediata'}
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            {getOrdenSalidaBadge(os.estado)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-slate-100 text-slate-800 dark:bg-[#2a2a2a] dark:text-[#e5e2e1] text-[10px]">
                                {cantPedidos} pedido(s)
                              </span>
                              {pedidosAsoc.slice(0, 3).map((pa: any) => (
                                <span
                                  key={pa.pedido?.id || Math.random()}
                                  className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 border border-violet-200 dark:bg-[#251733] dark:text-[#dab9ff] dark:border-[#521394]"
                                >
                                  {pa.pedido?.numero_pedido || 'Ped'}
                                </span>
                              ))}
                              {cantPedidos > 3 && (
                                <span className="text-[10px] text-slate-400">+{cantPedidos - 3} más</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                              cantRemitos >= cantPedidos && cantPedidos > 0
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#0f281e] dark:text-[#69f0ae]'
                                : cantRemitos > 0
                                ? 'bg-amber-50 text-amber-800 border border-amber-300 dark:bg-[#2b1c09] dark:text-[#ffddb8]'
                                : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#222] dark:text-[#999]'
                            }`}>
                              {cantRemitos} / {cantPedidos} Rx
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {rutaInfo ? (
                              <div className="space-y-0.5">
                                <span className="font-mono font-bold text-emerald-700 dark:text-[#69f0ae] text-[11px] block">
                                  {rutaInfo.codigo_ruta}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] block truncate">
                                  {rutaInfo.chofer_nombre} • {rutaInfo.vehiculo_patente}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Sin ruta asignada</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {rutaInfo ? (
                                <button
                                  type="button"
                                  onClick={() => handleSubTabChange('rutas')}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 dark:bg-[#142820] dark:text-[#69f0ae] dark:border-[#214a38] transition-colors"
                                  title="Ver en Etapa 3 (Ruteos)"
                                >
                                  <Truck className="w-3 h-3" />
                                  <span>Ver Ruta</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setAsignarRutaOpen(true)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859] transition-colors"
                                  title="Asignar Hoja de Ruta para esta Orden de Salida"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Asignar Ruta</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SUB-SECCIÓN 3: HISTORIAL DE REMITOS RX DE TRÁNSITO EMITIDOS */}
          <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                3. Remitos de Tránsito Rx Emitidos ({remitosList.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono">
                Comprobantes fiscales de amparo de carga en viaje y vinculación con Órdenes de Salida
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a]">
                  <tr>
                    <th className="px-3 py-2 text-[11px] font-semibold">N° Remito Rx</th>
                    <th className="px-3 py-2 text-[11px] font-semibold">Orden de Salida</th>
                    <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Estado Remito</th>
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
                      <td colSpan={11} className="py-8 text-center text-slate-400 dark:text-[#cdc3d4]">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-600 dark:text-[#dab9ff]" />
                        Cargando remitos...
                      </td>
                    </tr>
                  ) : remitosList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 dark:text-[#cdc3d4]">
                        No hay remitos Rx emitidos aún. Consolidar un pedido preparado arriba para emitir su remito.
                      </td>
                    </tr>
                  ) : (
                    remitosList.map((rem) => (
                      <tr
                        key={rem.id}
                        className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors"
                      >
                        <td className="px-3 py-1.5 font-mono font-bold text-emerald-700 dark:text-[#69f0ae]">
                          {rem.numero_remito_rx}
                          {rem.cae_o_autorizacion_fiscal && (
                            <span className="block text-[9px] text-slate-500 dark:text-[#cdc3d4] font-mono">
                              CAE: {rem.cae_o_autorizacion_fiscal}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {rem.orden_salida?.numero_orden_salida ? (
                            <div className="space-y-0.5">
                              <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] text-[11px] block">
                                {rem.orden_salida.numero_orden_salida}
                              </span>
                              {getOrdenSalidaBadge(rem.orden_salida.estado)}
                            </div>
                          ) : rem.orden_salida_id ? (
                            <span className="font-mono text-violet-700 dark:text-[#dab9ff] text-[10px]">
                              OS Vinculada
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Pick-up / Sin OS
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          {getRemitoBadge(rem.estado)}
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
                        <td className="px-2.5 py-2 text-right font-mono text-slate-600 dark:text-[#cdc3d4]">
                          {formatNumber(rem.peso_total_kg, 2)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono font-semibold text-sky-700 dark:text-[#75d1ff]">
                          {formatM3(rem.volumen_total_m3)}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setPedidoForRemito({ id: rem.pedido_id });
                                setRemitoModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332] dark:hover:bg-[#153426] transition-colors shadow-xs"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Remito Rx</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPedidoForRemito({ id: rem.pedido_id });
                                setRomaneoModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859] transition-colors shadow-xs"
                              title="Ver Planilla de Romaneo asociada"
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              <span>Romaneo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPedidoForRemito({ id: rem.pedido_id });
                                setRotuloExpresoModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 dark:bg-[#251733] dark:text-[#e4b5ff] dark:border-[#4d2d6b] transition-colors shadow-xs"
                              title="Reimprimir rótulos de bulto"
                            >
                              <Barcode className="w-3 h-3" />
                              <span>Rótulos</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HOJAS DE RUTA, CONTROL DE CARGA Y CONFORMES DE REMITOS */}
      {activeSubTab === 'rutas' && (
        <div className="space-y-4">
          {/* Banner Documentación Etapa 3 */}
          <div className="p-3.5 bg-emerald-50/70 dark:bg-[#0f281e] border border-emerald-200 dark:border-[#69f0ae]/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]">
                DOCUMENTACIÓN ETAPA 3
              </span>
              <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                Hojas de Ruta Oficiales, Manifiesto y Control de Carga en Muelle, y Conformes de Entrega (POD con fotos de remitos firmados)
              </span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
              Planificación del itinerario, validación de carga en camión y respaldo de conformes en Google Drive.
            </div>
          </div>

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

          {/* SUB-SECCIÓN 1: HOJAS DE RUTA ACTIVAS / EN OPERACIÓN */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                1. Hojas de Ruta Activas / En Reparto ({rutasActivas.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                Monitoreo en tiempo real de vehículos, paradas y control de carga en muelle
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loadingExtras ? (
                <div className="col-span-2 py-12 text-center text-slate-600 dark:text-[#cdc3d4] bg-white dark:bg-[#161515] border border-slate-200 dark:border-[#262626] rounded-xl space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 dark:text-[#69f0ae]" />
                  <p className="font-semibold text-xs">Cargando hojas de ruta y paradas...</p>
                </div>
              ) : rutasActivas.length === 0 ? (
                <div className="col-span-2 py-10 text-center text-slate-600 dark:text-[#cdc3d4] bg-white dark:bg-[#161515] border border-dashed border-slate-300 dark:border-[#333333] rounded-xl space-y-2">
                  <Truck className="w-8 h-8 mx-auto opacity-40 text-emerald-600 dark:text-[#69f0ae]" />
                  <p className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">No hay hojas de ruta activas en este momento.</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                    Haz clic en &quot;Nueva Hoja de Ruta&quot; arriba para planificar las entregas de los pedidos preparados o consulta el historial abajo.
                  </p>
                </div>
              ) : (
                rutasActivas.map((ruta) => {
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
                                    : ruta.estado === 'suspendida' || ruta.estado === 'cancelada'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-300 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
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
                              {ruta.motivo_suspension && (
                                <span className="text-[10px] font-bold text-rose-700 dark:text-[#ffb4ab] bg-rose-50 dark:bg-[#381015] px-2 py-0.5 rounded border border-rose-200 dark:border-[#690005]">
                                  Motivo suspensión: {ruta.motivo_suspension}
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
                            {ruta.acompanante_nombre && (
                              <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                                Acompañante: <strong className="text-slate-800 dark:text-[#e5e2e1]">{ruta.acompanante_nombre}</strong>
                                {ruta.acompanante_documento && <span className="text-[10px] font-mono text-slate-400 ml-1">(DNI: {ruta.acompanante_documento})</span>}
                              </div>
                            )}
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

                        {/* Control de Carga en Muelle Notice / Status */}
                        {ruta.control_carga_completado ? (
                          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-[#092418] border border-emerald-300 dark:border-[#1b5037] text-[11px] text-emerald-900 dark:text-[#69f0ae] flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-bold">
                              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae] shrink-0" />
                              <span>Carga Verificada en Muelle (Precinto: {ruta.control_carga_precinto || 'Sin precinto'} • Auditado: {ruta.control_carga_usuario || 'Supervisor'})</span>
                            </span>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-[#2b1c09] border border-amber-300 dark:border-[#7a4c10] text-[11px] text-amber-900 dark:text-[#ffddb8] flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-medium">
                              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-[#ffba28] shrink-0" />
                              <span><b>Control de Carga en Muelle:</b> Pendiente de verificación física de bultos antes de partir.</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setRutaParaControlCarga(ruta);
                                setControlCargaModalOpen(true);
                              }}
                              className="px-2 py-1 text-[10px] font-bold rounded bg-amber-600 text-white hover:bg-amber-700 dark:bg-[#ffba28] dark:text-[#2b1c09] transition-colors shrink-0"
                            >
                              Verificar Carga
                            </button>
                          </div>
                        )}

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
                                    [p.destinatario.localidad, p.destinatario.ciudad].filter(Boolean).join(', ') || undefined
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

                                      {/* Datos de Pedido, Remito y Bultos compactos (Item 5 y Item 1) */}
                                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                                        {p.pedido?.numero_pedido && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleVerDetallePedidoModal(p.pedido);
                                            }}
                                            className="px-1.5 py-0.5 rounded font-bold bg-white dark:bg-[#222222] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#521394] hover:bg-violet-50 transition-colors shadow-2xs"
                                            title="Tocar para ver detalle de artículos del pedido"
                                          >
                                            Ped: {p.pedido.numero_pedido}
                                          </button>
                                        )}
                                        {p.remito?.numero_remito_rx ? (
                                          <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#142820] dark:text-[#69f0ae] dark:border-[#214a38]">
                                            Rem: {p.remito.numero_remito_rx} ({p.remito.total_bultos || 1} bts)
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (p.pedido) {
                                                setPedidoForRemito(p.pedido);
                                                setRemitoModalOpen(true);
                                              } else {
                                                alert('No se encontró el pedido vinculado a esta parada.');
                                              }
                                            }}
                                            className="px-1.5 py-0.5 rounded font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-[#2b1c09] dark:hover:bg-[#38260a] dark:text-[#ffddb8] transition-colors"
                                            title="Emitir Remito Rx para esta parada"
                                          >
                                            + Emitir Remito Rx
                                          </button>
                                        )}
                                      </div>

                                      <div className="text-[10px] text-slate-500 dark:text-[#978d9d] truncate">
                                        {p.destinatario?.direccion_entrega}
                                        {[p.destinatario?.localidad, p.destinatario?.ciudad].filter(Boolean).length > 0
                                          ? ` • ${[p.destinatario?.localidad, p.destinatario?.ciudad].filter(Boolean).join(', ')}`
                                          : ''}
                                      </div>

                                      {/* Información de entrega / desvío / ETA y Geoposición */}
                                      {isEntregado && (
                                        <div className="text-[10px] text-emerald-700 dark:text-[#69f0ae] font-medium flex items-center gap-1.5 flex-wrap">
                                          <span className="flex items-center gap-1">
                                            <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-[#69f0ae]" />
                                            <span>Recibió: <b>{p.receptor_nombre || 'Conforme'}</b> {p.receptor_documento ? `(DNI: ${p.receptor_documento})` : ''}</span>
                                          </span>
                                          {p.latitud_entrega && p.longitud_entrega && (
                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-sky-50 text-sky-800 border border-sky-200 dark:bg-[#10242b] dark:text-[#75d1ff] dark:border-[#1e4859]">
                                              📍 GPS: {p.latitud_entrega.toFixed(4)}, {p.longitud_entrega.toFixed(4)}
                                            </span>
                                          )}
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
                                    {p.foto_remito_url ? (
                                      <>
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-[#143d2c] dark:text-[#69f0ae] border border-emerald-300 dark:border-[#256e4c]">
                                          ✅ POD
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setFotoZoomUrl(p.foto_remito_url)}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:hover:bg-[#163640] dark:text-[#75d1ff] dark:border-[#1e4859] text-[10px] font-bold transition-colors"
                                          title="Ver foto de remito conformado / POD"
                                        >
                                          <Eye className="w-3 h-3" />
                                          <span>Ver POD</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setParadaParaAdjuntarDoc(p);
                                            setFotoAdjuntoBase64(p.foto_remito_url || null);
                                            setObsAdjunto('');
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#201f1f] dark:hover:bg-[#2a2a2a] dark:text-[#cdc3d4] dark:border-[#383838] text-[10px] font-medium transition-colors"
                                          title="Cambiar foto o documento de entrega"
                                        >
                                          <Paperclip className="w-3 h-3" />
                                          <span>Cambiar</span>
                                        </button>
                                      </>
                                    ) : (
                                      (isEntregado || isNovedad) && (
                                        <>
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-[#38260a] dark:text-[#ffddb8] border border-amber-300 dark:border-[#7a4c10]">
                                            ⏳ Sin POD
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setParadaParaAdjuntarDoc(p);
                                              setFotoAdjuntoBase64(null);
                                              setObsAdjunto('');
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] text-[10px] font-bold transition-colors shadow-xs"
                                            title="Adjuntar foto del remito conformado / firmado por el receptor"
                                          >
                                            <Paperclip className="w-3 h-3" />
                                            <span>Adjuntar Conforme</span>
                                          </button>
                                        </>
                                      )
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

                                    {/* Marcar entregado desde supervisión (Item 9) */}
                                    {!isEntregado && !isNovedad && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setParadaParaEntregaSupervisor(p);
                                          setReceptorSupervisorNombre(p.destinatario?.contacto_recepcion || p.destinatario?.razon_social || '');
                                          setReceptorSupervisorDni('');
                                          setObsEntregaSupervisor('');
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] text-[10px] font-bold transition-all shadow-xs active:scale-95"
                                        title="Marcar entrega conforme desde supervisión"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Marcar Entregado</span>
                                      </button>
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

                          {/* 2. Botón Supervisar / Editar Ruta */}
                          <button
                            type="button"
                            onClick={() => {
                              setRutaParaEditar(ruta);
                              setEditarRutaModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-[#1e1b38] dark:text-[#b3aaff] dark:border-[#3a356b] transition-all shadow-sm"
                            title="Supervisar y editar datos de ruta, fecha, chofer, acompañante y pedidos onboard"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Supervisar / Editar</span>
                          </button>

                          {/* 3. Botón Google Maps Ruta Completa */}
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

                          {/* 4. Botón Imprimir Hoja de Ruta */}
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

                        {/* Cambio de estado con gating de Control de Carga */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ruta.estado === 'programada' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRutaParaControlCarga(ruta);
                                  setControlCargaModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10] transition-all shadow-sm"
                                title="Iniciar verificación física de bultos y pallets en muelle"
                              >
                                <Box className="w-3.5 h-3.5" />
                                <span>Control de Carga</span>
                              </button>
                              <button
                                type="button"
                                disabled={actualizandoRutaId === ruta.id}
                                onClick={() => handleIniciarViajeRuta(ruta)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] transition-all shadow-sm"
                                title={ruta.control_carga_completado ? 'Iniciar reparto capilar' : 'Requiere control de carga previo'}
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Iniciar Viaje</span>
                              </button>
                            </>
                          )}

                          {ruta.estado === 'en_carga' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRutaParaControlCarga(ruta);
                                  setControlCargaModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10] transition-all shadow-sm"
                              >
                                <Box className="w-3.5 h-3.5" />
                                <span>{ruta.control_carga_completado ? 'Ver Control Carga' : 'Verificar Carga'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={actualizandoRutaId === ruta.id}
                                onClick={() => handleIniciarViajeRuta(ruta)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-black rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] transition-all shadow-sm"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Carga Verificada: Iniciar Viaje</span>
                              </button>
                            </>
                          )}

                          {ruta.estado === 'en_viaje' && (
                            <button
                              type="button"
                              disabled={actualizandoRutaId === ruta.id}
                              onClick={() => {
                                const paradasPendientes = (ruta.paradas || []).filter(
                                  (p: any) => p.estado_entrega !== 'entregado' && p.estado_entrega !== 'con_novedad'
                                ).length;
                                if (
                                  paradasPendientes > 0 &&
                                  !window.confirm(
                                    `Aún restan ${paradasPendientes} paradas sin entregar ni registrar novedad. ¿Confirmas el cierre del itinerario de supervisión?`
                                  )
                                ) {
                                  return;
                                }
                                handleCambiarEstadoRuta(ruta.id, 'itinerario_cumplido');
                              }}
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

          {/* SUB-SECCIÓN 2: HISTORIAL DE ITINERARIOS CUMPLIDOS (COMPACT TABLE) */}
          <div className="w-full mt-8 pt-4 border-t-2 border-dashed border-slate-200 dark:border-[#2d2d2d] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                  2. Historial de Itinerarios Cumplidos ({rutasCumplidas.length})
                </span>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-0.5">
                  Registro de hojas de ruta cerradas con verificación de carga en muelle, conformes POD con remitos firmados y auditoría.
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#44424a]">
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-semibold">Código Ruta</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Transporte & Móvil</th>
                      <th className="px-3 py-2 text-[11px] font-semibold">Chofer & Acompañante</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Paradas</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-center">Control Carga</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Conformes POD</th>
                      <th className="px-2.5 py-2 text-[11px] font-semibold text-center">Estado</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#44424a]">
                    {rutasCumplidas.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-[#cdc3d4]">
                          Aún no hay hojas de ruta cerradas en el historial.
                        </td>
                      </tr>
                    ) : (
                      rutasCumplidas.map((ruta) => {
                        const paradas = ruta.paradas || [];
                        const paradasEnt = paradas.filter((p: any) => p.estado_entrega === 'entregado').length;
                        const paradasNov = paradas.filter((p: any) => p.estado_entrega === 'con_novedad').length;
                        const podsConFoto = paradas.filter((p: any) => Boolean(p.foto_remito_url)).length;
                        const podsConformes = paradas.filter((p: any) => p.estado_entrega === 'entregado' || Boolean(p.foto_remito_url)).length;

                        return (
                          <tr
                            key={ruta.id}
                            className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors"
                          >
                            <td className="px-3 py-2 font-mono font-bold text-emerald-700 dark:text-[#69f0ae]">
                              {ruta.codigo_ruta}
                              {ruta.orden_salida?.numero_orden_salida && (
                                <span className="block text-[10px] text-slate-400 font-mono">
                                  OS: {ruta.orden_salida.numero_orden_salida}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-800 dark:text-[#e5e2e1]">
                              <span className="font-semibold block">{ruta.transporte_empresa}</span>
                              <span className="font-mono text-[10px] text-sky-700 dark:text-[#75d1ff]">
                                {ruta.vehiculo_patente} ({ruta.tipo_vehiculo || 'Chasis'})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-[#cdc3d4]">
                              <span className="font-medium block">{ruta.chofer_nombre}</span>
                              {ruta.acompanante_nombre && (
                                <span className="text-[10px] text-slate-500 block">
                                  Acompañante: {ruta.acompanante_nombre}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2 text-center font-mono">
                              <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                                {paradasEnt}/{paradas.length}
                              </span>
                              {paradasNov > 0 && (
                                <span className="text-rose-600 font-bold ml-1 text-[10px]">
                                  ({paradasNov} desv.)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {ruta.control_carga_completado ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#092418] dark:text-[#69f0ae]">
                                  ✅ Precinto: {ruta.control_carga_precinto || 'OK'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Sin control muelle</span>
                              )}
                            </td>
                            <td className="px-2.5 py-2 text-center font-mono">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                podsConformes === paradas.length && paradas.length > 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#092418] dark:text-[#69f0ae]'
                                  : 'bg-amber-50 text-amber-800 border border-amber-300 dark:bg-[#38260a] dark:text-[#ffddb8]'
                              }`}>
                                {podsConformes}/{paradas.length} PODs
                                {podsConFoto > 0 && <span className="ml-1 text-[9px] text-emerald-700 dark:text-[#69f0ae]">📷</span>}
                              </span>
                            </td>
                            <td className="px-2.5 py-2 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-[#092418] dark:text-[#69f0ae] border border-emerald-300">
                                Cumplido
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setRutaParaImprimir(ruta)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#201f1f] dark:text-[#cdc3d4] dark:border-[#3b3b3b] hover:bg-slate-200 transition-colors"
                                  title="Imprimir Manifiesto de Carga y Hoja de Ruta"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Manifiesto</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRutaParaEditar(ruta);
                                    setEditarRutaModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-[#1e1b38] dark:text-[#b3aaff] dark:border-[#3a356b] hover:bg-indigo-100 transition-colors"
                                  title="Ver auditoría y detalles del itinerario"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Detalle</span>
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
            </div>
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
        pedidosDisponibles={pedidosListosParaSalidas}
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
                              const res = await subirDocumentoAGoogleDrive({ file, folder: 'Remitos_Conformados' });
                              if (res.success && res.url) {
                                setFotoAdjuntoBase64(res.url);
                              } else {
                                alert('Error al subir documento a Google Drive: ' + (res.error || 'Error desconocido'));
                              }
                            } catch (err: any) {
                              console.error('Error al subir a Google Drive:', err);
                              alert('Error al subir a Google Drive: ' + err.message);
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

      {/* Modal de Planilla de Romaneo Independiente */}
      <PlanillaRomaneoPrintModal
        isOpen={romaneoModalOpen}
        onClose={() => setRomaneoModalOpen(false)}
        pedido={(detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id)) ? detailData : (pedidoForRemito || selectedPedido)}
      />

      {/* Modal de Rótulos de Expreso al Interior (62x100mm) */}
      <RotuloExpresoPrintModal
        isOpen={rotuloExpresoModalOpen}
        onClose={() => setRotuloExpresoModalOpen(false)}
        pedido={(detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id)) ? detailData : (pedidoForRemito || selectedPedido)}
        totalBultos={(detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id))?.detalles?.length || selectedPedido?.detalles?.length || 1}
      />

      {/* Modal Carga / Edición de Romaneo al Finalizar Pedido */}
      <RomaneoEditorModal
        isOpen={romaneoEditorOpen}
        onClose={() => setRomaneoEditorOpen(false)}
        tipo="pedido"
        idEntidad={pedidoForRemito?.id || selectedPedido?.id || ''}
        numeroReferencia={pedidoForRemito?.numero_pedido || selectedPedido?.numero_pedido || ''}
        detallesArticulos={((detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id)) ? detailData.detalles : null) || pedidoForRemito?.detalles || selectedPedido?.detalles || []}
        onSuccess={refrescarTodo}
      />

      {/* Modal Impresión Etiqueta Brother LPN (29x62mm) al Finalizar Pedido */}
      <BrotherLabelPrinterModal
        isOpen={brotherLpnModalOpen}
        onClose={() => setBrotherLpnModalOpen(false)}
        nroPedido={(detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id))?.numero_pedido || pedidoForRemito?.numero_pedido || selectedPedido?.numero_pedido || 'PED-3611'}
        clienteNombre={(detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id))?.cliente?.razon_social || pedidoForRemito?.cliente?.razon_social || selectedPedido?.cliente?.razon_social || 'OPEN CARGO'}
      />

      {/* Modal de Hoja de Trabajo Operativa / Picking (A4) */}
      <HojaTrabajoOperativaPrintModal
        isOpen={hojaTrabajoOpen}
        onClose={() => setHojaTrabajoOpen(false)}
        pedido={(detailData && (detailData.id === pedidoForRemito?.id || detailData.id === selectedPedido?.id)) ? detailData : (pedidoForRemito || selectedPedido)}
      />

      {/* Modal Asignación de Picking (FEFO / FIFO + Roles) */}
      {asignacionPickingModalOpen && pedidoParaAsignarPicking && (
        <AsignacionPickingModal
          isOpen={asignacionPickingModalOpen}
          onClose={() => {
            setAsignacionPickingModalOpen(false);
            setPedidoParaAsignarPicking(null);
          }}
          pedido={pedidoParaAsignarPicking}
          onSuccess={() => {
            setAsignacionPickingModalOpen(false);
            setPedidoParaAsignarPicking(null);
            refrescarTodo();
          }}
        />
      )}

      {/* Modal Reasignar Lote / Posición de Tarea de Picking */}
      {reasignarTareaModalOpen && tareaParaReasignar && (
        <ReasignarTareaPickingModal
          isOpen={reasignarTareaModalOpen}
          onClose={() => {
            setReasignarTareaModalOpen(false);
            setTareaParaReasignar(null);
          }}
          tarea={tareaParaReasignar}
          clienteId={selectedPedido?.cliente_id || detailData?.cliente_id}
          onSuccess={() => {
            setReasignarTareaModalOpen(false);
            setTareaParaReasignar(null);
            if (selectedPedido) handleSelectPedido(selectedPedido);
            refrescarTodo();
          }}
        />
      )}

      {/* Modal Control por Muestreo en Expediciones */}
      {controlMuestreoModalOpen && pedidoParaMuestreo && (
        <ControlMuestreoModal
          isOpen={controlMuestreoModalOpen}
          onClose={() => {
            setControlMuestreoModalOpen(false);
            setPedidoParaMuestreo(null);
          }}
          pedido={pedidoParaMuestreo}
          onSuccess={() => {
            setControlMuestreoModalOpen(false);
            setPedidoParaMuestreo(null);
            refrescarTodo();
          }}
        />
      )}

      {/* Modal Parcializar Pedido para Varios Viajes */}
      {parcializarModalOpen && pedidoParaParcializar && (
        <ParcializarPedidoModal
          isOpen={parcializarModalOpen}
          onClose={() => {
            setParcializarModalOpen(false);
            setPedidoParaParcializar(null);
          }}
          pedido={pedidoParaParcializar}
          onSuccess={() => {
            setParcializarModalOpen(false);
            setPedidoParaParcializar(null);
            refrescarTodo();
          }}
        />
      )}

      {/* Modal Control de Carga en Muelle */}
      {controlCargaModalOpen && rutaParaControlCarga && (
        <ControlCargaModal
          isOpen={controlCargaModalOpen}
          onClose={() => {
            setControlCargaModalOpen(false);
            setRutaParaControlCarga(null);
          }}
          ruta={rutaParaControlCarga}
          onSuccess={() => {
            setControlCargaModalOpen(false);
            setRutaParaControlCarga(null);
            refrescarTodo();
          }}
        />
      )}

      {/* Modal Supervisión y Edición de Ruta */}
      {editarRutaModalOpen && rutaParaEditar && (
        <EditarRutaSupervisorModal
          isOpen={editarRutaModalOpen}
          onClose={() => {
            setEditarRutaModalOpen(false);
            setRutaParaEditar(null);
          }}
          ruta={rutaParaEditar}
          onSuccess={() => {
            setEditarRutaModalOpen(false);
            setRutaParaEditar(null);
            refrescarTodo();
          }}
        />
      )}

      {/* Modal Rápido Detalle de Pedido (Item 5) */}
      {pedidoDetalleRapidoModalOpen && pedidoDetalleRapidoData && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
            onClick={() => setPedidoDetalleRapidoModalOpen(false)}
          >
            <div
              className="w-full max-w-xl bg-white dark:bg-[#1c1b1b] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333333] overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200 dark:border-[#2a2a2a] flex items-center justify-between bg-slate-50 dark:bg-[#222222]">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-violet-600 dark:text-[#dab9ff]" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                      <span>Pedido: {pedidoDetalleRapidoData.numero_pedido || 'S/N'}</span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-violet-100 text-violet-800 dark:bg-[#321d4d] dark:text-[#dab9ff]">
                        {pedidoDetalleRapidoData.estado}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                      Cliente: {pedidoDetalleRapidoData.cliente?.razon_social || 'Cliente'} • Destino: {pedidoDetalleRapidoData.destinatario?.razon_social || 'Destino'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPedidoDetalleRapidoModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#2d2d2d] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-2 flex-1">
                <span className="text-xs font-bold text-slate-600 dark:text-[#cdc3d4] uppercase tracking-wider block">
                  Artículos / Renglones del Pedido:
                </span>
                {(!pedidoDetalleRapidoData.detalles || pedidoDetalleRapidoData.detalles.length === 0) ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No hay renglones cargados para este pedido.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a] border border-slate-200 dark:border-[#2a2a2a] rounded-xl overflow-hidden">
                    {pedidoDetalleRapidoData.detalles.map((det: any, idx: number) => (
                      <div key={det.id || idx} className="p-3 bg-white dark:bg-[#161515] flex items-center justify-between text-xs gap-3">
                        <div className="min-w-0">
                          <span className="font-mono text-[11px] font-bold text-sky-700 dark:text-[#75d1ff] block">
                            {det.articulo?.sku || 'SKU'}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-[#e5e2e1] block truncate">
                            {det.articulo?.nombre || 'Artículo'}
                          </span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <div className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                            Sol: {det.cantidad_solicitada} {det.articulo?.unidad_medida || 'un'}
                          </div>
                          {det.cantidad_separada != null && (
                            <div className="text-[11px] text-emerald-700 dark:text-[#69f0ae]">
                              Prep: {det.cantidad_separada} un
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#201f1f] border-t border-slate-200 dark:border-[#2a2a2a] flex justify-end">
                <button
                  type="button"
                  onClick={() => setPedidoDetalleRapidoModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-900 dark:bg-[#333] dark:hover:bg-[#444] text-xs font-bold transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Supervisión Marcar Entregado (Item 9) */}
      {paradaParaEntregaSupervisor && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
            onClick={() => {
              if (!isSubmittingEntregaSupervisor) setParadaParaEntregaSupervisor(null);
            }}
          >
            <div
              className="w-full max-w-md bg-white dark:bg-[#1c1b1b] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333333] overflow-hidden animate-scale-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-200 dark:border-[#2a2a2a] flex items-center justify-between bg-emerald-50/70 dark:bg-[#0c2217]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-[#69f0ae]" />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-[#e5e2e1]">
                      Marcar Entrega Conforme (Supervisión)
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                      Parada #{paradaParaEntregaSupervisor.secuencia_parada} • {paradaParaEntregaSupervisor.destinatario?.razon_social}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSubmittingEntregaSupervisor}
                  onClick={() => setParadaParaEntregaSupervisor(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#2d2d2d] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmarEntregaSupervisor} className="p-4 space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Nombre de quien recibe / Receptor:
                  </label>
                  <input
                    type="text"
                    required
                    value={receptorSupervisorNombre}
                    onChange={(e) => setReceptorSupervisorNombre(e.target.value)}
                    placeholder="Ej: Juan Pérez / Guardia"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#444] bg-slate-50 dark:bg-[#141414] text-slate-900 dark:text-[#e5e2e1] font-medium outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    DNI / Documento Receptor (Opcional):
                  </label>
                  <input
                    type="text"
                    value={receptorSupervisorDni}
                    onChange={(e) => setReceptorSupervisorDni(e.target.value)}
                    placeholder="Ej: 32.456.789"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#444] bg-slate-50 dark:bg-[#141414] text-slate-900 dark:text-[#e5e2e1] font-mono outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Observaciones / Conforme:
                  </label>
                  <textarea
                    rows={2}
                    value={obsEntregaSupervisor}
                    onChange={(e) => setObsEntregaSupervisor(e.target.value)}
                    placeholder="Ej: Mercadería recibida en muelle con remito firmado"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#444] bg-slate-50 dark:bg-[#141414] text-slate-900 dark:text-[#e5e2e1] font-medium outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#2a2a2a]">
                  <button
                    type="button"
                    disabled={isSubmittingEntregaSupervisor}
                    onClick={() => setParadaParaEntregaSupervisor(null)}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#444] text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-100 dark:hover:bg-[#252525] font-bold text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEntregaSupervisor}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wide flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmittingEntregaSupervisor ? 'Guardando...' : 'Confirmar Entrega'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

