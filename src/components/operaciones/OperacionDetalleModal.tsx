import React, { useState, useEffect } from 'react';
import {
  X,
  Boxes,
  ArrowDownToLine,
  PackageCheck,
  ArrowUpFromLine,
  Truck,
  Building2,
  Calendar,
  Clock,
  FileText,
  AlertTriangle,
  User,
  CheckCircle2,
  Save,
  Layers,
  Sparkles,
  ExternalLink,
  Printer,
  FileCheck2,
  MapPin,
  Phone,
  ShieldCheck,
  RefreshCw,
  Hash,
  Scale,
  Box,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { formatDateTime, formatM3, formatNumber } from '@/lib/utils';
import {
  operacionesApi,
  type Operacion,
  type OperacionDetalleCompleto,
  type DocumentoRespaldoOperacion,
} from '@/api/operacionesApi';
import { RemitoPrintModal } from '@/components/outbound/RemitoPrintModal';
import { HojaTrabajoOperativaPrintModal } from '@/components/outbound/HojaTrabajoOperativaPrintModal';

interface OperacionDetalleModalProps {
  isOpen: boolean;
  onClose: () => void;
  operacion: Operacion | null;
  onOperacionUpdated?: () => void;
}

export const OperacionDetalleModal: React.FC<OperacionDetalleModalProps> = ({
  isOpen,
  onClose,
  operacion,
  onOperacionUpdated,
}) => {
  if (!isOpen || !operacion) return null;

  const [activeTab, setActiveTab] = useState<'resumen' | 'documentos' | 'items'>('resumen');
  const [novedadDesvio, setNovedadDesvio] = useState(operacion.novedad_desvio || '');
  const [docMovimiento, setDocMovimiento] = useState(operacion.documento_movimiento || '');
  const [docHeredado, setDocHeredado] = useState(operacion.documento_heredado || '');
  const [estado, setEstado] = useState<'en_proceso' | 'completada' | 'cancelada'>(
    (operacion.estado as any) || 'en_proceso'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Detalle profundo
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [detalleData, setDetalleData] = useState<OperacionDetalleCompleto | null>(null);

  // Modales secundarios de documentación
  const [remitoModalOpen, setRemitoModalOpen] = useState(false);
  const [selectedPedidoForRemito, setSelectedPedidoForRemito] = useState<any | null>(null);
  const [hojaTrabajoModalOpen, setHojaTrabajoModalOpen] = useState(false);
  const [selectedPedidoForHoja, setSelectedPedidoForHoja] = useState<any | null>(null);

  useEffect(() => {
    if (operacion) {
      setNovedadDesvio(operacion.novedad_desvio || '');
      setDocMovimiento(operacion.documento_movimiento || '');
      setDocHeredado(operacion.documento_heredado || '');
      setEstado((operacion.estado as any) || 'en_proceso');

      // Cargar detalles completos de la operación
      setLoadingDetalle(true);
      operacionesApi
        .obtenerDetalleCompletoOperacion(operacion)
        .then((res) => {
          setDetalleData(res);
        })
        .catch((err) => {
          console.warn('Error al cargar detalle de operacion:', err);
        })
        .finally(() => {
          setLoadingDetalle(false);
        });
    }
  }, [operacion]);

  const getTipoInfo = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return {
          label: 'Entrada / Inbound',
          icon: ArrowDownToLine,
          badge: <Badge variant="success" dot pulse>Entrada</Badge>,
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10 border-emerald-500/20',
          docDesc: 'Contenedor / Guía de Transporte',
          heredadoDesc: 'Despacho de Aduana / Proveedor',
        };
      case 'pedido':
        return {
          label: 'Pedido / Picking',
          icon: PackageCheck,
          badge: <Badge variant="info" dot>Pedido</Badge>,
          color: 'text-[#dab9ff]',
          bgColor: 'bg-[#dab9ff]/10 border-[#dab9ff]/20',
          docDesc: 'Orden de Compra Cliente',
          heredadoDesc: 'OC Cliente / Solicitud Comercial',
        };
      case 'salida':
        return {
          label: 'Salida / Outbound',
          icon: ArrowUpFromLine,
          badge: <Badge variant="warning" dot>Salida</Badge>,
          color: 'text-amber-400',
          bgColor: 'bg-amber-500/10 border-amber-500/20',
          docDesc: 'Remito de Salida / Expedición',
          heredadoDesc: 'Pedidos de Picking Asignados',
        };
      case 'entrega':
        return {
          label: 'Entrega / Ruteo',
          icon: Truck,
          badge: <Badge variant="default" dot>Entrega</Badge>,
          color: 'text-sky-400',
          bgColor: 'bg-sky-500/10 border-sky-500/20',
          docDesc: 'Remito R-X Conformado',
          heredadoDesc: 'Hoja de Ruta / Itinerario de Entrega',
        };
      default:
        return {
          label: 'Operación WMS',
          icon: Boxes,
          badge: <Badge variant="default">{tipo}</Badge>,
          color: 'text-slate-400',
          bgColor: 'bg-slate-500/10 border-slate-500/20',
          docDesc: 'Documento Respaldo',
          heredadoDesc: 'Origen',
        };
    }
  };

  const tipoInfo = getTipoInfo(operacion.tipo_op);
  const TipoIcon = tipoInfo.icon;

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);

    try {
      const updates: any = {
        novedad_desvio: novedadDesvio.trim() || null,
        documento_movimiento: docMovimiento.trim() || null,
        documento_heredado: docHeredado.trim() || null,
        estado,
      };

      if (estado === 'completada' && !operacion.fechahora_fin) {
        updates.fechahora_fin = new Date().toISOString();
      }

      await operacionesApi.actualizarOperacion(operacion.id, updates);
      setSuccessMsg('Operación actualizada correctamente');
      if (onOperacionUpdated) {
        onOperacionUpdated();
      }
      setTimeout(() => {
        setSuccessMsg(null);
      }, 2500);
    } catch (err: any) {
      alert('Error al guardar cambios: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDocAction = (doc: DocumentoRespaldoOperacion) => {
    if (doc.accion === 'ver_remito' && doc.data) {
      setSelectedPedidoForRemito(doc.data);
      setRemitoModalOpen(true);
    } else if (doc.accion === 'ver_hoja_trabajo' && doc.data) {
      setSelectedPedidoForHoja(doc.data);
      setHojaTrabajoModalOpen(true);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#161616] border border-[#333333] rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${tipoInfo.bgColor}`}>
                <TipoIcon className={`w-5 h-5 ${tipoInfo.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#e5e2e1] font-mono">
                    {operacion.id_operacion}
                  </h2>
                  {tipoInfo.badge}
                  <span
                    className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${
                      operacion.estado === 'completada'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : operacion.estado === 'cancelada'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {operacion.estado === 'completada'
                      ? 'Completada'
                      : operacion.estado === 'cancelada'
                      ? 'Cancelada'
                      : 'En Proceso'}
                  </span>
                </div>
                <p className="text-xs text-[#cdc3d4] mt-0.5">
                  Colector de datos consolidado &bull; {tipoInfo.label} &bull; Ref: {operacion.cliente_nombre || 'General'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#252525] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#2a2a2a] bg-[#161616]">
            <button
              type="button"
              onClick={() => setActiveTab('resumen')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'resumen'
                  ? 'border-[#dab9ff] text-[#dab9ff]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Resumen Operativo & Auditoría
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('documentos')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'documentos'
                  ? 'border-[#dab9ff] text-[#dab9ff]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Documentación & Respaldo
              {detalleData?.documentos && detalleData.documentos.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#dab9ff]/20 text-[#dab9ff] font-mono">
                  {detalleData.documentos.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'items'
                  ? 'border-[#dab9ff] text-[#dab9ff]'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              Detalle de Ítems / Mercadería
              {detalleData?.items && detalleData.items.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                  {detalleData.items.length}
                </span>
              )}
            </button>

            {loadingDetalle && (
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[#dab9ff] animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Sincronizando detalles...</span>
              </div>
            )}
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-[#cdc3d4]">
            {/* TAB 1: RESUMEN Y AUDITORIA */}
            {activeTab === 'resumen' && (
              <div className="space-y-6">
                {/* Quick Metrics Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#1f1e1e] border border-[#2e2d2d]">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Cantidad Total
                    </span>
                    <span className="text-lg font-bold text-[#e5e2e1] font-mono">
                      {formatNumber(operacion.cantidad_total || 0)}
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">unidades</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Volumen M3 Total
                    </span>
                    <span className="text-lg font-bold text-[#dab9ff] font-mono">
                      {formatM3(operacion.m3_totales || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Fecha Alta
                    </span>
                    <span className="text-xs font-medium text-[#e5e2e1] block mt-1">
                      {formatDateTime(operacion.fechahora_alta)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                      Fecha Fin / Cierre
                    </span>
                    <span className="text-xs font-medium text-[#e5e2e1] block mt-1">
                      {operacion.fechahora_fin ? formatDateTime(operacion.fechahora_fin) : 'En Proceso...'}
                    </span>
                  </div>
                </div>

                {/* General Metadata Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Cliente & Negocio */}
                  <div className="p-4 rounded-xl bg-[#1a1919] border border-[#2b2a2a] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#dab9ff]">
                      <Building2 className="w-4 h-4" />
                      Depositante & Unidad de Negocio
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-[#e5e2e1]">
                        {operacion.cliente_nombre || 'Cliente General'}
                      </div>
                      <div className="inline-block px-2 py-0.5 text-[11px] font-mono rounded bg-[#242323] text-slate-300 border border-[#333333]">
                        {operacion.unidad_negocio || 'Sin Unidad Asignada'}
                      </div>
                    </div>
                  </div>

                  {/* Lotes y Aduana */}
                  <div className="p-4 rounded-xl bg-[#1a1919] border border-[#2b2a2a] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#75d1ff]">
                      <Layers className="w-4 h-4" />
                      Lotes / Despachos de Aduana
                    </div>
                    <div className="text-xs font-mono text-[#e5e2e1] bg-[#201f1f] p-2 rounded-lg border border-[#333333] break-words">
                      {operacion.lotes_despacho || 'No registra lotes específicos'}
                    </div>
                  </div>
                </div>

                {/* Datos de Transporte y Entidad si están cargados */}
                {(detalleData?.transporte || detalleData?.entidad_relacionada) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {detalleData.entidad_relacionada && (
                      <div className="p-4 rounded-xl bg-[#1a1919] border border-[#2b2a2a] space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                          <User className="w-4 h-4" />
                          {detalleData.entidad_relacionada.tipo === 'proveedor'
                            ? 'Proveedor de Origen'
                            : 'Destinatario de Entrega'}
                        </div>
                        <div className="text-xs text-[#e5e2e1] font-medium">
                          {detalleData.entidad_relacionada.nombre}
                        </div>
                        {detalleData.entidad_relacionada.direccion && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>
                              {detalleData.entidad_relacionada.direccion}
                              {detalleData.entidad_relacionada.localidad
                                ? ` - ${detalleData.entidad_relacionada.localidad}`
                                : ''}
                            </span>
                          </div>
                        )}
                        {detalleData.entidad_relacionada.contacto && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{detalleData.entidad_relacionada.contacto}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {detalleData.transporte && (
                      <div className="p-4 rounded-xl bg-[#1a1919] border border-[#2b2a2a] space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-400">
                          <Truck className="w-4 h-4" />
                          Vehículo, Chofer y Transporte
                        </div>
                        <div className="text-xs text-[#e5e2e1] font-medium flex items-center justify-between">
                          <span>{detalleData.transporte.empresa || 'Transporte Asignado'}</span>
                          {detalleData.transporte.patente && (
                            <span className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-[#222] border border-[#333] text-amber-300">
                              Pat: {detalleData.transporte.patente}
                            </span>
                          )}
                        </div>
                        {detalleData.transporte.chofer && (
                          <div className="text-[11px] text-slate-400">
                            Chofer: <strong className="text-slate-200">{detalleData.transporte.chofer}</strong>
                          </div>
                        )}
                        {detalleData.transporte.muelle && (
                          <div className="text-[11px] text-slate-400">
                            Muelle WMS: <span className="text-[#dab9ff] font-semibold">{detalleData.transporte.muelle}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Form to Edit Movement Documents, Status, and Incident / Deviation */}
                <form onSubmit={handleGuardar} className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#1a1919] border border-[#2b2a2a] space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-400" />
                        Documentación de Respaldo & Trazabilidad
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Operador: <strong className="text-slate-200">{operacion.usuario_creador || 'Sistema'}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Doc. del Movimiento ({tipoInfo.docDesc})
                        </label>
                        <input
                          type="text"
                          value={docMovimiento}
                          onChange={(e) => setDocMovimiento(e.target.value)}
                          placeholder="Ej: Contenedor ABCD1234567, Remito R-001..."
                          className="w-full bg-[#121212] border border-[#383838] focus:border-[#dab9ff] rounded-lg px-3 py-2 text-xs text-[#e5e2e1] outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Doc. Heredado ({tipoInfo.heredadoDesc})
                        </label>
                        <input
                          type="text"
                          value={docHeredado}
                          onChange={(e) => setDocHeredado(e.target.value)}
                          placeholder="Ej: Hoja de Ruta HR-001, Despacho 24001IC04..."
                          className="w-full bg-[#121212] border border-[#383838] focus:border-[#dab9ff] rounded-lg px-3 py-2 text-xs text-[#e5e2e1] outline-none"
                        />
                      </div>
                    </div>

                    {/* Estado */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Estado de la Operación
                      </label>
                      <select
                        value={estado}
                        onChange={(e) => setEstado(e.target.value as any)}
                        className="w-full bg-[#121212] border border-[#383838] focus:border-[#dab9ff] rounded-lg px-3 py-2 text-xs text-[#e5e2e1] outline-none"
                      >
                        <option value="en_proceso">En Proceso (Abierta / En Ejecución)</option>
                        <option value="completada">Completada (Cerrada / Despachada / Entregada)</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </div>

                    {/* Novedad / Desvío */}
                    <div>
                      <label className="block text-[11px] font-medium text-amber-400 mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Novedad / Desvío Operativo (Faltantes, Roturas, Retrasos o Discrepancias)
                      </label>
                      <textarea
                        rows={3}
                        value={novedadDesvio}
                        onChange={(e) => setNovedadDesvio(e.target.value)}
                        placeholder="Registrar desvíos de descarga, diferencias de bultos o precintos dañados..."
                        className="w-full bg-[#121212] border border-amber-900/50 focus:border-amber-400 rounded-lg p-3 text-xs text-[#e5e2e1] outline-none resize-none placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  {/* Botón de Guardado */}
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      {successMsg && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium animate-in fade-in">
                          <CheckCircle2 className="w-4 h-4" />
                          {successMsg}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-[#252525] transition-colors"
                      >
                        Cerrar
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-black bg-[#dab9ff] hover:bg-[#eedbff] disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Guardando...' : 'Guardar Novedad & Cambios'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: DOCUMENTACION DE RESPALDO */}
            {activeTab === 'documentos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#2a2a2a]">
                  <div>
                    <h3 className="text-sm font-bold text-[#e5e2e1] flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-[#dab9ff]" />
                      Documentos Oficiales & Vínculos de Trazabilidad
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Visualizá y abrí los comprobantes vinculados a esta operación para impresión o auditoría.
                    </p>
                  </div>
                </div>

                {detalleData?.documentos && detalleData.documentos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {detalleData.documentos.map((doc, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-[#1a1919] border border-[#2e2d2d] hover:border-[#444] transition-all flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#dab9ff] bg-[#dab9ff]/10 px-2 py-0.5 rounded border border-[#dab9ff]/20">
                              {doc.tipo.replace('_', ' ')}
                            </span>
                            {doc.estado && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#242323] text-slate-300">
                                {doc.estado}
                              </span>
                            )}
                          </div>

                          <div className="text-sm font-bold text-[#e5e2e1] font-mono mt-1">
                            {doc.numero}
                          </div>
                          <div className="text-xs text-slate-300 font-medium">
                            {doc.titulo}
                          </div>

                          {doc.fecha && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              <span>{formatDateTime(doc.fecha)}</span>
                            </div>
                          )}

                          {doc.detalles && (
                            <div className="text-[11px] text-slate-400 bg-[#201f1f] p-2 rounded border border-[#2b2a2a]">
                              {doc.detalles}
                            </div>
                          )}
                        </div>

                        {/* Botones de acción directa */}
                        {doc.accion && (
                          <div className="pt-2 border-t border-[#262525]">
                            {doc.accion === 'ver_remito' && (
                              <button
                                type="button"
                                onClick={() => handleOpenDocAction(doc)}
                                className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Ver / Imprimir Remito Oficial
                              </button>
                            )}

                            {doc.accion === 'ver_hoja_trabajo' && (
                              <button
                                type="button"
                                onClick={() => handleOpenDocAction(doc)}
                                className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#dab9ff]/10 text-[#dab9ff] border border-[#dab9ff]/30 hover:bg-[#dab9ff]/20 transition-all"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Ver Hoja de Trabajo Operativa
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center bg-[#1a1919] border border-dashed border-[#2f2e2e] rounded-xl space-y-2">
                    <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      No se encontraron comprobantes específicos vinculados o aún se encuentran en preparación.
                    </p>
                    <div className="text-[11px] text-slate-500">
                      Doc. Movimiento: <strong>{operacion.documento_movimiento || 'Sin asignar'}</strong> &bull; Heredado:{' '}
                      <strong>{operacion.documento_heredado || 'Sin asignar'}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DETALLE DE ITEMS / MERCADERIA */}
            {activeTab === 'items' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#2a2a2a]">
                  <div>
                    <h3 className="text-sm font-bold text-[#e5e2e1] flex items-center gap-2">
                      <Box className="w-4 h-4 text-emerald-400" />
                      Desglose de Mercadería & Lotes de la Operación
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Artículos, partidas/lotes, ubicaciones de almacén y cantidades consolidadas.
                    </p>
                  </div>

                  {detalleData?.items && detalleData.items.length > 0 && (
                    <span className="text-xs font-mono text-slate-400">
                      Total renglones: <strong>{detalleData.items.length}</strong>
                    </span>
                  )}
                </div>

                {detalleData?.items && detalleData.items.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-[#2b2a2a]">
                    <table className="w-full text-left text-xs text-[#cdc3d4]">
                      <thead className="bg-[#1f1e1e] text-[10px] uppercase tracking-wider text-slate-400 border-b border-[#2b2a2a]">
                        <tr>
                          <th className="py-2.5 px-3">SKU</th>
                          <th className="py-2.5 px-3">Descripción</th>
                          <th className="py-2.5 px-3">Lote / Partida</th>
                          <th className="py-2.5 px-3">Ubicación</th>
                          <th className="py-2.5 px-3 text-right">Cant. Solicitada</th>
                          <th className="py-2.5 px-3 text-right">Cant. Efectiva</th>
                          <th className="py-2.5 px-3 text-right">Vol. M3</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#242323] bg-[#161616]">
                        {detalleData.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-[#1c1b1b] transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-[#e5e2e1]">
                              {item.articulo_codigo}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-200">
                              {item.articulo_descripcion}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.lote ? (
                                <span className="px-1.5 py-0.5 text-[11px] font-mono rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  {item.lote}
                                </span>
                              ) : (
                                <span className="text-slate-600 italic">Sin lote</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.ubicacion ? (
                                <span className="px-1.5 py-0.5 text-[11px] font-mono rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                  {item.ubicacion}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatNumber(item.cantidad_solicitada || 0)}{' '}
                              <span className="text-[10px] text-slate-500">{item.unidad_medida || 'UN'}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                              {formatNumber(item.cantidad_efectiva || 0)}{' '}
                              <span className="text-[10px] text-slate-500">{item.unidad_medida || 'UN'}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#dab9ff]">
                              {formatM3(item.volumen_m3 || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#1a1919] border-t border-[#2b2a2a] text-xs font-semibold text-[#e5e2e1]">
                        <tr>
                          <td colSpan={4} className="py-2.5 px-3 text-right uppercase tracking-wider text-slate-400">
                            Totales Consolidados:
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {formatNumber(
                              detalleData.items.reduce((acc, i) => acc + (i.cantidad_solicitada || 0), 0)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-bold">
                            {formatNumber(
                              detalleData.items.reduce((acc, i) => acc + (i.cantidad_efectiva || 0), 0)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#dab9ff]">
                            {formatM3(
                              detalleData.items.reduce((acc, i) => acc + (i.volumen_m3 || 0), 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-[#1a1919] border border-dashed border-[#2f2e2e] rounded-xl space-y-2">
                    <Box className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      No se encontraron líneas de artículos individuales para esta operación.
                    </p>
                    <div className="text-[11px] text-slate-500">
                      Total registrado en cabecera: <strong>{formatNumber(operacion.cantidad_total || 0)} unidades</strong> &bull;{' '}
                      <strong>{formatM3(operacion.m3_totales || 0)} m³</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Secundario: Visualizador / Impresión de Remito R-X Oficial */}
      {remitoModalOpen && selectedPedidoForRemito && (
        <RemitoPrintModal
          isOpen={remitoModalOpen}
          onClose={() => {
            setRemitoModalOpen(false);
            setSelectedPedidoForRemito(null);
          }}
          pedido={selectedPedidoForRemito}
        />
      )}

      {/* Modal Secundario: Visualizador / Impresión de Hoja de Trabajo Operativa */}
      {hojaTrabajoModalOpen && selectedPedidoForHoja && (
        <HojaTrabajoOperativaPrintModal
          isOpen={hojaTrabajoModalOpen}
          onClose={() => {
            setHojaTrabajoModalOpen(false);
            setSelectedPedidoForHoja(null);
          }}
          pedido={selectedPedidoForHoja}
        />
      )}
    </ModalPortal>
  );
};
