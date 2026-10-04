import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck,
  ArrowDownToLine,
  CheckCircle2,
  CheckCheck,
  Clock,
  AlertTriangle,
  Barcode,
  MapPin,
  Plus,
  RefreshCw,
  Zap,
  Box,
  Layers,
  Scale,
  Sparkles,
  Paperclip,
  FileText,
  Eye,
  ExternalLink,
  X,
  Edit2,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime, formatNumber, formatM3 } from '@/lib/utils';
import { recepcionesApi } from '@/api/recepcionesApi';
import { almacenApi } from '@/api/almacenApi';
import { NuevaRecepcionModal } from './NuevaRecepcionModal';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface InboundMonitorProps {
  recepciones: any[];
  onRefresh: () => void;
  isDark: boolean;
  almacenes?: any[];
  clientes?: any[];
  selectedAlmacenId?: string;
  selectedClienteId?: string;
}

export const InboundMonitor: React.FC<InboundMonitorProps> = ({
  recepciones,
  onRefresh,
  almacenes = [],
  clientes = [],
  selectedAlmacenId,
  selectedClienteId,
}) => {
  const [selectedRecepcion, setSelectedRecepcion] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [selectedDocImg, setSelectedDocImg] = useState<{ url: string; nombre: string } | null>(null);
  const [isEditingLote, setIsEditingLote] = useState(false);
  const [loteEditado, setLoteEditado] = useState('');
  const [editingDetalleId, setEditingDetalleId] = useState<string | null>(null);
  const [loteDetalleEditado, setLoteDetalleEditado] = useState('');
  const [lotePutaway, setLotePutaway] = useState('');

  // Modal Nueva Recepción
  const [nuevaRecepcionModalOpen, setNuevaRecepcionModalOpen] = useState(false);

  // Modal Putaway
  const [putawayModalOpen, setPutawayModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<any | null>(null);
  const [activeDetalle, setActiveDetalle] = useState<any | null>(null);
  const [cantidadRecibida, setCantidadRecibida] = useState<number>(0);
  const [codigoLpn, setCodigoLpn] = useState<string>('');
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState<string>('');
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(false);
  const [esPaletizado, setEsPaletizado] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConformingAll, setIsConformingAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');

  // Cantidad de tareas pendientes de control en la inspección seleccionada
  const tareasPendientesTotal = detailData?.detalles?.reduce((acc: number, det: any) => {
    const pend = det.tareas?.filter((t: any) => t.estado === 'pendiente' || t.estado === 'en_traslado')?.length || 0;
    return acc + pend;
  }, 0) || 0;
  const tienePendientes = tareasPendientesTotal > 0;

  // Cargar ubicaciones físicas de rack
  const cargarUbicacionesAlmacen = async (almId: string) => {
    if (!almId) return;
    setLoadingUbicaciones(true);
    try {
      const data = await almacenApi.listarUbicacionesPorAlmacen(almId);
      setUbicaciones(data || []);
    } catch (err) {
      console.error('Error cargando ubicaciones para putaway:', err);
    } finally {
      setLoadingUbicaciones(false);
    }
  };

  const handleSelectRecepcion = async (rec: any) => {
    setSelectedRecepcion(rec);
    setLoadingDetail(true);
    try {
      const data = await recepcionesApi.obtenerRecepcionConDetalle(rec.id);
      setDetailData(data);
      if (rec.almacen_id) {
        cargarUbicacionesAlmacen(rec.almacen_id);
      }
    } catch (err: any) {
      console.error('Error fetching reception detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredRecepciones = React.useMemo(() => {
    return recepciones.filter((rec) => {
      if (filtroEstado !== 'todos' && rec.estado !== filtroEstado) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          rec.numero_recepcion?.toLowerCase().includes(q) ||
          rec.cliente?.razon_social?.toLowerCase().includes(q) ||
          rec.nro_contenedor_oc?.toLowerCase().includes(q) ||
          rec.transporte_empresa?.toLowerCase().includes(q) ||
          rec.patente_camion?.toLowerCase().includes(q) ||
          rec.almacen?.nombre?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [recepciones, filtroEstado, searchTerm]);

  const generarLpnAleatorio = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `PLT-${year}-${rand}`;
  };

  const handleAbrirPutaway = (det: any, tarea: any) => {
    setActiveTask(tarea);
    setActiveDetalle(det);
    setCantidadRecibida(Number(det.cantidad_esperada) || 1);
    // Por defecto carga suelta (no paletizado), stock gestionado por bultos
    setEsPaletizado(false);
    setCodigoLpn('');
    setUbicacionDestinoId(tarea.ubicacion_destino_id || det.ubicacion_sugerida_id || '');
    setLotePutaway(det.lote_declarado || '');
    setFeedbackMsg(null);
    setPutawayModalOpen(true);

    if (selectedRecepcion?.almacen_id && ubicaciones.length === 0) {
      cargarUbicacionesAlmacen(selectedRecepcion.almacen_id);
    }
  };

  const handleGuardarLoteRecepcion = async () => {
    if (!detailData || !loteEditado.trim()) return;
    try {
      await recepcionesApi.actualizarLoteRecepcion(detailData.id, loteEditado.trim());
      setIsEditingLote(false);
      const freshData = await recepcionesApi.obtenerRecepcionConDetalle(detailData.id);
      setDetailData(freshData);
      onRefresh();
    } catch (err: any) {
      console.error('Error actualizando lote:', err);
    }
  };

  const handleGuardarLoteDetalle = async (detalleId: string) => {
    if (!loteDetalleEditado.trim()) return;
    try {
      await recepcionesApi.actualizarLoteDetalle(detalleId, loteDetalleEditado.trim());
      setEditingDetalleId(null);
      if (selectedRecepcion) {
        const freshData = await recepcionesApi.obtenerRecepcionConDetalle(selectedRecepcion.id);
        setDetailData(freshData);
        onRefresh();
      }
    } catch (err: any) {
      console.error('Error actualizando lote del renglón:', err);
    }
  };

  const handleConfirmPutaway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || !activeDetalle) return;
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      if (lotePutaway.trim() && lotePutaway.trim() !== activeDetalle.lote_declarado) {
        await recepcionesApi.actualizarLoteDetalle(activeDetalle.id, lotePutaway.trim());
      }

      await recepcionesApi.confirmarPutaway({
        tareaId: activeTask.id,
        cantidadRecibida,
        codigoLpn: esPaletizado && codigoLpn.trim() ? codigoLpn.trim() : undefined,
        ubicacionDestinoId: ubicacionDestinoId.trim() || undefined,
      });

      // Refrescar datos en segundo plano
      let freshDetalles = detailData?.detalles || [];
      if (selectedRecepcion) {
        try {
          const freshData = await recepcionesApi.obtenerRecepcionConDetalle(selectedRecepcion.id);
          setDetailData(freshData);
          freshDetalles = freshData?.detalles || [];
          onRefresh();
        } catch (err) {
          console.warn('Error refrescando detalle:', err);
        }
      }

      // Buscar el siguiente artículo pendiente de control
      const currentDetalleId = activeDetalle.id;
      const currentIndex = freshDetalles.findIndex((d: any) => d.id === currentDetalleId);
      
      let nextDetalle: any = null;
      let nextTarea: any = null;

      // 1. Buscar en los renglones siguientes
      for (let i = currentIndex + 1; i < freshDetalles.length; i++) {
        const d = freshDetalles[i];
        const t = d.tareas?.find((task: any) => task.estado === 'pendiente' || task.estado === 'en_traslado');
        if (t) {
          nextDetalle = d;
          nextTarea = t;
          break;
        }
      }

      // 2. Si no hay posteriores, buscar desde el inicio
      if (!nextDetalle) {
        for (let i = 0; i < currentIndex; i++) {
          const d = freshDetalles[i];
          const t = d.tareas?.find((task: any) => task.estado === 'pendiente' || task.estado === 'en_traslado');
          if (t) {
            nextDetalle = d;
            nextTarea = t;
            break;
          }
        }
      }

      if (nextDetalle && nextTarea) {
        setFeedbackMsg({
          type: 'success',
          text: `¡Artículo guardado! Pasando a controlar: ${nextDetalle.articulo?.sku || 'Siguiente'}...`,
        });

        setTimeout(() => {
          setActiveTask(nextTarea);
          setActiveDetalle(nextDetalle);
          setCantidadRecibida(Number(nextDetalle.cantidad_esperada) || 1);
          setEsPaletizado(false);
          setCodigoLpn('');
          setUbicacionDestinoId(nextTarea.ubicacion_destino_id || nextDetalle.ubicacion_sugerida_id || '');
          setFeedbackMsg(null);
          setIsSubmitting(false);
        }, 700);
      } else {
        // Era el último renglón pendiente
        setFeedbackMsg({
          type: 'success',
          text: '¡Confronta finalizada! Todos los artículos de la recepción han sido controlados y guardados.',
        });

        setTimeout(() => {
          setPutawayModalOpen(false);
          setActiveTask(null);
          setActiveDetalle(null);
          if (selectedRecepcion) handleSelectRecepcion(selectedRecepcion);
          onRefresh();
          setIsSubmitting(false);
        }, 1000);
      }
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error al ejecutar la transacción de Putaway',
      });
      setIsSubmitting(false);
    }
  };

  const [isConformingDirectId, setIsConformingDirectId] = useState<string | null>(null);

  const handleConformarTodos = async () => {
    if (!selectedRecepcion || !tienePendientes) return;

    if (
      !window.confirm(
        `¿Recibir la recepción ${selectedRecepcion.numero_recepcion} sin contar? Se ingresarán al inventario los ${tareasPendientesTotal} artículo(s) pendientes conforme a las cantidades esperadas.`
      )
    ) {
      return;
    }

    setIsConformingAll(true);
    try {
      await recepcionesApi.conformarTodos(selectedRecepcion.id);
      await handleSelectRecepcion({ ...selectedRecepcion, estado: 'finalizada' });
      onRefresh();
    } catch (err: any) {
      console.error('Error conformando todos los renglones:', err);
      alert(err.message || 'Error al conformar todos los renglones');
    } finally {
      setIsConformingAll(false);
    }
  };

  const handleConformarRecepcionDirecta = async (rec: any) => {
    if (rec.estado === 'finalizada') return;

    if (
      !window.confirm(
        `¿Recibir la orden de recepción ${rec.numero_recepcion} sin contar? Se ingresarán todas las cantidades esperadas directamente al inventario.`
      )
    ) {
      return;
    }

    setIsConformingDirectId(rec.id);
    try {
      await recepcionesApi.conformarTodos(rec.id);
      if (selectedRecepcion?.id === rec.id) {
        await handleSelectRecepcion({ ...rec, estado: 'finalizada' });
      }
      onRefresh();
    } catch (err: any) {
      console.error('Error al recibir directo sin contar:', err);
      alert(err.message || 'Error al recibir sin contar');
    } finally {
      setIsConformingDirectId(null);
    }
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'finalizada':
        return <Badge variant="success" dot>Finalizada</Badge>;
      case 'en_control':
        return <Badge variant="warning" dot pulse>En Control</Badge>;
      case 'inbound':
        return <Badge variant="info" dot pulse>Inbound</Badge>;
      case 'en_descarga':
        return <Badge variant="info" dot pulse>En Descarga</Badge>;
      case 'en_playa':
        return <Badge variant="default" dot>En Playa</Badge>;
      default:
        return <Badge variant="outline" dot>{estado || 'Programada'}</Badge>;
    }
  };

  // Cálculo de discrepancia en modal de Putaway
  const discrepancia = Number(cantidadRecibida) - (Number(activeDetalle?.cantidad_esperada) || 0);
  const volumenImpactado =
    Number(cantidadRecibida) * Number(activeDetalle?.articulo?.volumen_unitario_m3 || 0);
  const pesoImpactado =
    Number(cantidadRecibida) * Number(activeDetalle?.articulo?.peso_unitario_kg || 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#333333] gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-[#dab9ff]" />
            Control de Inbound & Descarga de Contenedores
          </h2>
          <p className="text-xs text-[#cdc3d4] mt-0.5">
            Registro de arribo, confronta recibido vs. esperado y paletizado con código LPN
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNuevaRecepcionModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Recepción</span>
          </button>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Filtros de Inbound */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-xs">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por OC, cliente, transporte, recepción..."
              className="w-full pl-3 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] overflow-x-auto">
            {[
              { id: 'todos', label: 'Todas' },
              { id: 'inbound', label: 'Arribo' },
              { id: 'en_control', label: 'En Control' },
              { id: 'finalizada', label: 'Finalizadas' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFiltroEstado(st.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap ${
                  filtroEstado === st.id
                    ? 'bg-white shadow-xs text-violet-700 dark:bg-[#2a2a2a] dark:text-[#dab9ff]'
                    : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recepciones List (Full Width) */}
      <div className="w-full">
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#44424a] flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
              Órdenes de Recepción ({filteredRecepciones.length})
            </span>
            <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono">
              Ordenado por Arribo
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-[#44424a]">
            {filteredRecepciones.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-[#cdc3d4] space-y-3">
                <Truck className="w-8 h-8 mx-auto text-slate-400 dark:text-[#978d9d] opacity-50" />
                <p className="text-xs">No hay órdenes de recepción registradas con los filtros seleccionados</p>
                <button
                  onClick={() => setNuevaRecepcionModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:text-[#460283] dark:hover:bg-[#eedbff] transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar Primer Arribo</span>
                </button>
              </div>
            ) : (
              filteredRecepciones.map((rec, rIdx) => {
                const isSelected = selectedRecepcion?.id === rec.id;
                const totalArticulos = rec.total_articulos != null
                  ? Number(rec.total_articulos)
                  : (rec.detalles || []).reduce((acc: number, d: any) => acc + (Number(d.cantidad_esperada) || 0), 0);
                const totalRenglones = rec.detalles?.length || 0;

                return (
                  <motion.div
                    key={rec.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(rIdx * 0.02, 0.2) }}
                    onClick={() => handleSelectRecepcion(rec)}
                    className={`p-3.5 cursor-pointer transition-all border-b border-slate-200 dark:border-[#44424a] hover:bg-slate-50 dark:hover:bg-[#201f1f]/80 ${
                      isSelected ? 'bg-violet-50/70 dark:bg-[#201330]/40 border-l-4 border-l-violet-600 dark:border-l-[#dab9ff]' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">
                          {rec.numero_recepcion}
                        </span>
                        {getStatusBadge(rec.estado)}
                        <span className="text-xs text-slate-800 dark:text-[#e5e2e1] font-medium ml-1">
                          {rec.cliente?.razon_social || 'Cliente 3PL'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <span className="text-[11px] font-mono text-slate-500 dark:text-[#cdc3d4] mr-2">
                          {formatDateTime(rec.fecha_hora_arribo)}
                        </span>

                        {rec.estado !== 'finalizada' && (
                          <>
                            {rec.estado === 'inbound' && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await recepcionesApi.actualizarEstado(rec.id, 'en_control');
                                  onRefresh();
                                }}
                                className="px-2 py-1 text-[11px] font-medium rounded-lg border border-amber-300 dark:border-[#eab308]/40 bg-amber-50 dark:bg-[#2d240d] text-amber-800 dark:text-[#fef08a] hover:bg-amber-100 dark:hover:bg-[#3f3213] transition-colors"
                              >
                                Iniciar Control
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConformarRecepcionDirecta(rec);
                              }}
                              disabled={isConformingDirectId === rec.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-all shadow-sm disabled:opacity-50"
                            >
                              <Zap className="w-3 h-3 text-white dark:text-[#460283]" />
                              <span>{isConformingDirectId === rec.id ? 'Recibiendo...' : '⚡ Recibir sin contar'}</span>
                            </button>
                          </>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRecepcion(rec);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1a1919] dark:hover:bg-[#252424] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors shadow-xs"
                        >
                          Ver Detalle & Inspección &rarr;
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-[#2a2a2a] text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                      <div>
                        <span className="text-slate-400 dark:text-[#978d9d] block text-[10px] uppercase font-semibold">Contenedor / OC:</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-[#e5e2e1] truncate block">
                          {rec.nro_contenedor_oc || 'Directo'}{' '}
                          {rec.tipo_contenedor ? (
                            <span className="text-violet-600 dark:text-[#dab9ff] text-[10px] font-normal">({rec.tipo_contenedor})</span>
                          ) : null}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-[#978d9d] block text-[10px] uppercase font-semibold">Lote Operación:</span>
                        <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] truncate block">
                          {rec.lote_defecto || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-[#978d9d] block text-[10px] uppercase font-semibold">Despacho Aduana:</span>
                        <span className="font-mono text-slate-800 dark:text-[#e5e2e1] truncate block">
                          {rec.despacho_aduana || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-[#978d9d] block text-[10px] uppercase font-semibold">Total Artículos:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-[#dab9ff] truncate block">
                          {totalArticulos.toLocaleString('es-AR')} un.
                          {totalRenglones > 0 && (
                            <span className="text-[#978d9d] font-normal text-[10px] ml-1">
                              ({totalRenglones} {totalRenglones === 1 ? 'ítem' : 'ítems'})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="sm:text-right">
                        <span className="text-[#978d9d] block text-[10px]">Estado Operativo:</span>
                        <span className="text-[#dab9ff] font-semibold">
                          {rec.estado === 'inbound'
                            ? 'En muelle de descarga'
                            : rec.estado === 'en_control'
                            ? 'Confronta en progreso'
                            : 'Finalizada / En stock'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal de Inspección & Putaway (Reemplaza el panel lateral derecho) */}
      {selectedRecepcion && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1]">
              <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                    Inspección: {selectedRecepcion.numero_recepcion}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                    Renglones recibidos y confronta de control
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedRecepcion.estado === 'inbound' && (
                    <button
                      onClick={async () => {
                        await recepcionesApi.actualizarEstado(selectedRecepcion.id, 'en_control');
                        handleSelectRecepcion({ ...selectedRecepcion, estado: 'en_control' });
                        onRefresh();
                      }}
                      className="px-2 py-1 text-xs font-semibold rounded-lg border border-amber-300 dark:border-[#eab308]/40 bg-amber-50 dark:bg-[#2d240d] text-amber-800 dark:text-[#fef08a] hover:bg-amber-100 dark:hover:bg-[#3f3213] transition-colors"
                      title="Pasar la orden al estado En Control para iniciar conteo físico"
                    >
                      Iniciar Control &rarr;
                    </button>
                  )}
                  {selectedRecepcion.estado !== 'finalizada' && (
                    <button
                      onClick={handleConformarTodos}
                      disabled={isConformingAll || !tienePendientes}
                      title={
                        tienePendientes
                          ? `Ingresar directamente los ${tareasPendientesTotal} artículo(s) al stock sin contar`
                          : 'Todos los artículos ya fueron conformados'
                      }
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isConformingAll ? 'Ingresando...' : '⚡ Recibir sin contar'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedRecepcion(null)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] px-2 py-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-[#2a2a2a] transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                {/* Ficha Resumen de Cabecera Operativa */}
                {detailData && (
                  <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-[#171616] border border-slate-200 dark:border-[#333333] grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Fecha Arribo:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-[#e5e2e1]">{formatDateTime(detailData.fecha_hora_arribo)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Tipo CNTR / Carga:</span>
                      <span className="font-semibold text-slate-800 dark:text-[#e5e2e1]">{detailData.tipo_contenedor || 'No especificado'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Lote Operación:</span>
                      {isEditingLote ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="text"
                            value={loteEditado}
                            onChange={(e) => setLoteEditado(e.target.value)}
                            className="px-1.5 py-0.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-[#131313] border border-violet-500 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff] w-28 outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleGuardarLoteRecepcion();
                              if (e.key === 'Escape') setIsEditingLote(false);
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleGuardarLoteRecepcion}
                            className="p-1 rounded-lg bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] hover:bg-violet-700"
                            title="Guardar lote"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingLote(false)}
                            className="p-1 rounded-lg bg-slate-200 text-slate-700 dark:bg-[#2a2a2a] dark:text-[#cdc3d4] hover:bg-slate-300"
                            title="Cancelar"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff]">{detailData.lote_defecto || 'N/A'}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setLoteEditado(detailData.lote_defecto || '');
                              setIsEditingLote(true);
                            }}
                            className="p-0.5 text-slate-400 hover:text-violet-600 dark:text-[#cdc3d4] dark:hover:text-[#dab9ff] rounded hover:bg-slate-200 dark:hover:bg-[#2a2a2a] transition-colors"
                            title="Modificar lote de la recepción"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Despacho Aduana:</span>
                      <span className="font-mono text-slate-800 dark:text-[#e5e2e1]">{detailData.despacho_aduana || '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Transporte:</span>
                      <span className="text-slate-800 dark:text-[#e5e2e1] truncate block">
                        {detailData.transporte_empresa || 'Propio'} {detailData.patente_camion ? `(${detailData.patente_camion})` : ''}
                      </span>
                    </div>

                    {/* Documentación Adjunta si existe */}
                    {detailData.documentos_adjuntos && Array.isArray(detailData.documentos_adjuntos) && detailData.documentos_adjuntos.length > 0 && (
                      <div className="col-span-2 sm:col-span-5 pt-2 border-t border-slate-200 dark:border-[#2a2a2a]">
                        <span className="text-[10px] text-slate-500 dark:text-[#978d9d] block uppercase font-semibold mb-1.5 flex items-center gap-1">
                          <Paperclip className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
                          <span>Documentación Adjunta ({detailData.documentos_adjuntos.length}):</span>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {detailData.documentos_adjuntos.map((doc: any, docIdx: number) => (
                            <button
                              key={docIdx}
                              type="button"
                              onClick={() => setSelectedDocImg({ url: doc.url, nombre: doc.nombre })}
                              className="flex items-center gap-1.5 p-1 px-2 rounded-lg bg-white dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] hover:border-violet-500 text-left text-xs transition-colors group shadow-xs"
                            >
                              {doc.url && (doc.url.startsWith('data:image') || doc.url.match(/\.(jpeg|jpg|png|webp|gif)/i)) ? (
                                <img src={doc.url} alt={doc.nombre} className="w-6 h-6 object-cover rounded border border-slate-200 dark:border-[#44424a]" />
                              ) : (
                                <FileText className="w-4 h-4 text-slate-400 dark:text-[#cdc3d4]" />
                              )}
                              <div className="truncate max-w-[140px]">
                                <div className="font-semibold text-slate-800 dark:text-[#e5e2e1] truncate group-hover:text-violet-600 dark:group-hover:text-[#dab9ff]">{doc.nombre}</div>
                                <div className="text-[9px] text-slate-400 dark:text-[#978d9d]">{doc.tipo || 'Adjunto'}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {loadingDetail ? (
                  <div className="py-8 text-center text-slate-500 dark:text-[#cdc3d4] text-xs">Cargando detalles...</div>
                ) : !detailData?.detalles || detailData.detalles.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 dark:text-[#cdc3d4] text-xs">
                    No hay renglones registrados para esta orden.
                  </div>
                ) : (
                  detailData.detalles.map((det: any, dIdx: number) => {
                    const tareas = det.tareas || [];
                    const tareaPendiente = tareas.find(
                      (t: any) => t.estado === 'pendiente' || t.estado === 'en_traslado'
                    );

                    return (
                      <motion.div
                        key={det.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: dIdx * 0.04 }}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#201f1f]/90 space-y-2.5 shadow-xs hover:border-violet-300 dark:hover:border-[#dab9ff]/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">
                              {det.articulo?.sku} - {det.articulo?.nombre}
                            </span>
                            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] flex items-center gap-1.5 mt-0.5">
                              <span>Lote:</span>
                              {editingDetalleId === det.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={loteDetalleEditado}
                                    onChange={(e) => setLoteDetalleEditado(e.target.value)}
                                    className="px-1.5 py-0.5 text-xs font-mono font-bold rounded-lg bg-white dark:bg-[#131313] border border-violet-500 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff] w-28 outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleGuardarLoteDetalle(det.id);
                                      if (e.key === 'Escape') setEditingDetalleId(null);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleGuardarLoteDetalle(det.id)}
                                    className="p-1 rounded-lg bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283]"
                                    title="Guardar lote"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDetalleId(null)}
                                    className="p-1 rounded-lg bg-slate-200 text-slate-700 dark:bg-[#2a2a2a] dark:text-[#cdc3d4]"
                                    title="Cancelar"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff]">{det.lote_declarado || 'N/A'}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLoteDetalleEditado(det.lote_declarado || '');
                                      setEditingDetalleId(det.id);
                                    }}
                                    className="p-0.5 text-slate-400 hover:text-violet-600 dark:text-[#cdc3d4] dark:hover:text-[#dab9ff] rounded hover:bg-slate-200 dark:hover:bg-[#2a2a2a] transition-colors"
                                    title="Modificar lote de este artículo"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {det.fecha_vencimiento && (
                              <div className="text-[10px] text-slate-400 dark:text-[#978d9d]">
                                Vencimiento: {formatDate(det.fecha_vencimiento)}
                              </div>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block uppercase font-medium">Esperado</span>
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-[#e5e2e1] tabular-nums">
                              {det.cantidad_esperada} bultos
                            </span>
                          </div>
                        </div>

                        {/* Putaway task action */}
                        {tareaPendiente ? (
                          <div className="pt-2 border-t border-slate-100 dark:border-[#333333] flex items-center justify-between">
                            <div className="text-[11px] text-amber-700 dark:text-[#ffd27a] flex items-center gap-1 font-semibold">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Control Putaway Pendiente</span>
                            </div>
                            <button
                              onClick={() => handleAbrirPutaway(det, tareaPendiente)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <span>Confrontar & Guardar</span>
                            </button>
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-100 dark:border-[#333333] flex items-center justify-between text-[11px] text-sky-700 dark:text-[#75d1ff]">
                            <div className="flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Almacenado & Contabilizado</span>
                            </div>
                            <span className="font-mono font-bold text-slate-700 dark:text-[#cdc3d4]">
                              Recibido: {tareas[0]?.cantidad_recibida || det.cantidad_esperada} bultos
                            </span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal A: Nueva Recepción */}
      <NuevaRecepcionModal
        isOpen={nuevaRecepcionModalOpen}
        onClose={() => setNuevaRecepcionModalOpen(false)}
        onSuccess={() => {
          onRefresh();
          if (selectedRecepcion) handleSelectRecepcion(selectedRecepcion);
        }}
        almacenes={almacenes}
        clientes={clientes}
        defaultAlmacenId={selectedAlmacenId}
        defaultClienteId={selectedClienteId}
      />

      {/* Modal B: Confirmar Putaway & Paletizado LPN Mejorado */}
      {putawayModalOpen && activeTask && activeDetalle && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-slate-800 dark:text-[#e5e2e1]">
            {/* Header */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider mb-1 flex items-center gap-2">
                  <Box className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Confirmar Guardado & Ubicación (Putaway)</span>
                </h3>
                {tareasPendientesTotal > 0 && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 dark:bg-[#2a173d] dark:text-[#dab9ff] dark:border-[#522b7c]">
                    {tareasPendientesTotal} pendiente(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Confronta física en muelle e ingreso directo de bultos a rack o estantería (paletizado opcional).
              </p>
            </div>

            {/* Ficha Resumen Renglón */}
            <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                {activeDetalle.articulo?.sku} - {activeDetalle.articulo?.nombre}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] flex items-center gap-3">
                <span>
                  Lote: <strong className="font-mono text-violet-700 dark:text-[#dab9ff]">{lotePutaway || activeDetalle.lote_declarado}</strong>
                </span>
                <span>
                  Esperado: <strong className="font-mono text-slate-900 dark:text-[#e5e2e1]">{activeDetalle.cantidad_esperada} bultos</strong>
                </span>
                {activeDetalle.fecha_vencimiento && (
                  <span>Vto: {formatDate(activeDetalle.fecha_vencimiento)}</span>
                )}
              </div>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  feedbackMsg?.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#75d1ff] dark:border-[#1d4d38]'
                    : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005]'
                }`}
              >
                {feedbackMsg?.text}
              </div>
            )}

            <form onSubmit={handleConfirmPutaway} className="space-y-4">
              {/* 1. Confronta de Cantidad */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Cantidad Recibida Real (Bultos contados) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={cantidadRecibida}
                  onChange={(e) => setCantidadRecibida(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono font-bold focus:border-violet-500 outline-none"
                />

                {/* Detector de discrepancias */}
                <div className="mt-1.5">
                  {discrepancia === 0 ? (
                    <div className="text-[11px] font-semibold text-emerald-600 dark:text-[#75d1ff] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confronta conforme (100% de los bultos esperados recibidos)</span>
                    </div>
                  ) : discrepancia < 0 ? (
                    <div className="text-[11px] font-semibold text-amber-600 dark:text-[#ffd27a] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Diferencia detectada: Faltante de {Math.abs(discrepancia)} bultos</span>
                    </div>
                  ) : (
                    <div className="text-[11px] font-semibold text-violet-600 dark:text-[#dab9ff] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Diferencia detectada: Sobrante de +{discrepancia} bultos</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 1.5. Lote Físico Confrontado (Modificable si difiere del declarado) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] block">
                    Lote / Batch Físico Verificado <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-violet-600 dark:text-[#dab9ff]">
                    Modificable si difiere del declarado
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={lotePutaway}
                  onChange={(e) => setLotePutaway(e.target.value)}
                  placeholder={activeDetalle.lote_declarado || 'Ej: LOTE-2026-X'}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-violet-700 dark:text-[#dab9ff] font-mono font-bold focus:border-violet-500 outline-none"
                />
              </div>

              {/* 2. Modalidad de Paletizado (Opcional) */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-[#333333] bg-slate-50/80 dark:bg-[#201f1f] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                    <input
                      type="checkbox"
                      checked={esPaletizado}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEsPaletizado(checked);
                        if (checked && !codigoLpn.trim()) {
                          setCodigoLpn(generarLpnAleatorio());
                        } else if (!checked) {
                          setCodigoLpn('');
                        }
                      }}
                      className="w-4 h-4 rounded text-violet-600 border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313]"
                    />
                    <span>¿Carga Paletizada? Asignar Código Pallet LPN</span>
                  </label>

                  {esPaletizado ? (
                    <Badge variant="info" size="sm">Pallet LPN</Badge>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-500 dark:text-[#cdc3d4] font-mono">Bultos Sueltos</span>
                  )}
                </div>

                {esPaletizado ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4]">
                        Código de Etiqueta LPN:
                      </span>
                      <button
                        type="button"
                        onClick={() => setCodigoLpn(generarLpnAleatorio())}
                        className="text-[11px] font-semibold text-violet-600 dark:text-[#dab9ff] hover:underline flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Auto-Generar LPN</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={codigoLpn}
                        onChange={(e) => setCodigoLpn(e.target.value.toUpperCase())}
                        placeholder="PLT-2026-000101"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono uppercase focus:border-violet-500 outline-none"
                      />
                      <Barcode className="w-4 h-4 text-slate-400 dark:text-[#978d9d] absolute right-3 top-2.5" />
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-[#cdc3d4]">
                      Puede ingresar o escanear la etiqueta del pallet físico.
                    </p>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] flex items-center gap-2 pt-0.5">
                    <Box className="w-4 h-4 text-slate-400 dark:text-[#978d9d] shrink-0" />
                    <span>
                      <strong>Recepción por bulto suelto:</strong> El stock se ingresa directamente a la posición de rack o estantería por bulto sin asociar un pallet.
                    </span>
                  </div>
                )}
              </div>

              {/* 3. Selector de Ubicación Rack */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Ubicación Física Destino (Rack / Estante) <span className="text-rose-500">*</span>
                </label>
                {loadingUbicaciones ? (
                  <div className="text-xs text-slate-500 dark:text-[#cdc3d4] py-1.5">Cargando posiciones de rack...</div>
                ) : (
                  <select
                    required
                    value={ubicacionDestinoId}
                    onChange={(e) => setUbicacionDestinoId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 outline-none cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">Seleccione una ubicación en rack...</option>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id} className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">
                        {u.codigo_etiqueta} - {u.zona?.nombre || 'Zona'} (Pasillo {u.pasillo || '-'})
                      </option>
                    ))}
                  </select>
                )}
                {activeDetalle.ubicacion_sugerida_id && (
                  <p className="text-[10px] text-violet-600 dark:text-[#dab9ff] mt-1 flex items-center gap-1 font-semibold">
                    <Sparkles className="w-3 h-3" />
                    <span>Ubicación sugerida calculada según rotación de artículo</span>
                  </p>
                )}
              </div>

              {/* 4. Resumen de Impacto Volumétrico y Kardex */}
              <div className="p-3 rounded-xl bg-violet-50 dark:bg-[#201330] border border-violet-200 dark:border-[#4b4452] text-[11px] text-slate-700 dark:text-[#cdc3d4] flex items-center justify-between font-mono">
                <span>
                  Volumen: <strong className="text-sky-600 dark:text-[#dab9ff]">{formatM3(volumenImpactado)}</strong>
                </span>
                <span>
                  Peso: <strong className="text-slate-800 dark:text-[#e5e2e1]">{formatNumber(pesoImpactado)} kg</strong>
                </span>
              </div>

              {/* Botones de Acción */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setPutawayModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !ubicacionDestinoId ||
                    cantidadRecibida <= 0 ||
                    (esPaletizado && !codigoLpn.trim())
                  }
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando en BD...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar Guardado</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Modal de Vista Previa de Documento Adjunto */}
      {selectedDocImg && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 dark:bg-black/90 backdrop-blur-md animate-fadeIn"
            onClick={() => setSelectedDocImg(null)}
          >
            <div
              className="relative max-w-3xl max-h-[85vh] bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-lg shadow-2xl overflow-hidden flex flex-col p-2 text-slate-800 dark:text-[#e5e2e1]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-2 border-b border-slate-200 dark:border-[#333333] text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                <span className="truncate max-w-[80%]">{selectedDocImg.nombre}</span>
                <div className="flex items-center gap-2">
                  <a
                    href={selectedDocImg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-violet-700 dark:text-[#dab9ff]"
                    title="Abrir en pestaña nueva"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => setSelectedDocImg(null)}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-400 hover:text-slate-700 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-2 flex items-center justify-center overflow-auto max-h-[75vh]">
                {selectedDocImg.url.startsWith('data:image') ||
                selectedDocImg.url.match(/\.(jpeg|jpg|png|webp|gif)/i) ? (
                  <img
                    src={selectedDocImg.url}
                    alt={selectedDocImg.nombre}
                    className="max-h-[70vh] w-auto object-contain rounded"
                  />
                ) : (
                  <iframe
                    src={selectedDocImg.url}
                    title={selectedDocImg.nombre}
                    className="w-[80vw] max-w-2xl h-[70vh] rounded border-0"
                  />
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
