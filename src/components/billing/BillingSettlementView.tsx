import React, { useState, useEffect } from 'react';
import {
  ReceiptText,
  Calendar,
  Layers,
  Box,
  Truck,
  Plus,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Trash2,
  Sliders,
  DollarSign,
  Clock,
  ChevronRight,
  TrendingUp,
  Edit3,
  FileCheck,
  FileX2,
} from 'lucide-react';
import { formatNumber, formatM3, formatDate } from '@/lib/utils';
import { billingApi } from '../../api/billingApi';
import type { LiquidacionCliente, LiquidacionClienteTramo, LiquidacionClienteItem } from '../../types/billing.types';
import type { Database } from '../../../types/database.types';
import { EditarTarifasModal } from './EditarTarifasModal';
import { AgregarItemManualModal } from './AgregarItemManualModal';
import { EditarItemConceptoModal } from './EditarItemConceptoModal';
import { EmitirFacturaModal } from './EmitirFacturaModal';
import { FacturaFiscalPrintModal } from './FacturaFiscalPrintModal';
import { AnularFacturaModal } from './AnularFacturaModal';

interface BillingSettlementViewProps {
  clientes: Database['public']['Tables']['clientes']['Row'][];
  selectedClienteId: string;
  onSelectCliente: (id: string) => void;
}

export const BillingSettlementView: React.FC<BillingSettlementViewProps> = ({
  clientes,
  selectedClienteId,
  onSelectCliente,
}) => {
  // Rango de fechas por defecto: primer día del mes actual al día de hoy
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const formatDateISO = (d: Date) => d.toISOString().split('T')[0];

  const [fechaDesde, setFechaDesde] = useState(formatDateISO(primerDiaMes));
  const [fechaHasta, setFechaHasta] = useState(formatDateISO(hoy));

  // Estados de datos
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [currentLiquidacion, setCurrentLiquidacion] = useState<LiquidacionCliente | null>(null);
  const [historialLiquidaciones, setHistorialLiquidaciones] = useState<LiquidacionCliente[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Modales
  const [tarifasModalOpen, setTarifasModalOpen] = useState(false);
  const [itemManualModalOpen, setItemManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LiquidacionClienteItem | null>(null);
  const [emitirFacturaModalOpen, setEmitirFacturaModalOpen] = useState(false);
  const [facturaPrintModalOpen, setFacturaPrintModalOpen] = useState(false);
  const [anularFacturaModalOpen, setAnularFacturaModalOpen] = useState(false);

  const clienteActivo = clientes.find((c) => c.id === selectedClienteId) || null;

  // Cargar historial al cambiar cliente
  useEffect(() => {
    if (selectedClienteId) {
      cargarHistorial();
    } else {
      setHistorialLiquidaciones([]);
      setCurrentLiquidacion(null);
    }
  }, [selectedClienteId]);

  const cargarHistorial = async () => {
    if (!selectedClienteId) return;
    setLoading(true);
    try {
      const data = await billingApi.listarLiquidaciones(selectedClienteId);
      setHistorialLiquidaciones(data);
      if (data.length > 0 && !currentLiquidacion) {
        // Cargar la más reciente
        handleSeleccionarLiquidacion(data[0].id);
      }
    } catch (err: any) {
      console.error('Error al cargar historial de liquidaciones:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeleccionarLiquidacion = async (id: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const detalle = await billingApi.obtenerLiquidacionDetalle(id);
      setCurrentLiquidacion(detalle);
      if (detalle) {
        setFechaDesde(detalle.fecha_desde);
        setFechaHasta(detalle.fecha_hasta);
      }
    } catch (err: any) {
      console.error('Error al obtener detalle de liquidación:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarLiquidacion = async (recalcular: boolean = false) => {
    if (!selectedClienteId) {
      setFeedback({ type: 'err', msg: 'Debe seleccionar un cliente depositante.' });
      return;
    }
    if (!fechaDesde || !fechaHasta) {
      setFeedback({ type: 'err', msg: 'Debe especificar el rango de fechas a liquidar.' });
      return;
    }

    setCalculating(true);
    setFeedback(null);

    try {
      const res = await billingApi.liquidarPeriodo(selectedClienteId, fechaDesde, fechaHasta, recalcular);
      if (res && res.liquidacion_id) {
        await handleSeleccionarLiquidacion(res.liquidacion_id);
        await cargarHistorial();
        setFeedback({
          type: 'ok',
          msg: `Liquidación ${res.numero_liquidacion} calculada exitosamente.`,
        });
      }
    } catch (err: any) {
      console.error('Error calculando liquidación:', err);
      setFeedback({
        type: 'err',
        msg: err.message || 'Error al procesar la liquidación en la base de datos.',
      });
    } finally {
      setCalculating(false);
    }
  };

  const handleAprobarLiquidacion = async () => {
    if (!currentLiquidacion) return;
    setApproving(true);
    try {
      await billingApi.aprobarLiquidacion(currentLiquidacion.id);
      await handleSeleccionarLiquidacion(currentLiquidacion.id);
      await cargarHistorial();
      setFeedback({
        type: 'ok',
        msg: `Liquidación ${currentLiquidacion.numero_liquidacion} aprobada y congelada exitosamente.`,
      });
    } catch (err: any) {
      console.error('Error al aprobar liquidación:', err);
      setFeedback({ type: 'err', msg: err.message || 'No se pudo aprobar la liquidación.' });
    } finally {
      setApproving(false);
    }
  };

  const handleEliminarItem = async (item: LiquidacionClienteItem) => {
    if (!currentLiquidacion || currentLiquidacion.estado !== 'borrador') return;
    const confirmMsg = item.origen === 'automatico'
      ? `¿Está seguro de eliminar el concepto de sistema "${item.descripcion}"? (Esta acción lo removerá de la liquidación actual)`
      : `¿Está seguro de eliminar el concepto "${item.descripcion}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await billingApi.eliminarItem(item.id);
      await handleSeleccionarLiquidacion(currentLiquidacion.id);
      setFeedback({
        type: 'ok',
        msg: `Concepto "${item.descripcion}" eliminado de la liquidación.`,
      });
    } catch (err: any) {
      console.error('Error al eliminar concepto:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar concepto.' });
    }
  };

  const handleFacturarLiquidacion = async () => {
    if (!currentLiquidacion || currentLiquidacion.estado !== 'aprobada') return;
    if (!window.confirm(`¿Confirmar pase a FACTURADA de la liquidación ${currentLiquidacion.numero_liquidacion}? Una vez facturada, los conceptos y el período quedan 100% bloqueados y no podrán volver a liquidarse.`)) return;

    setInvoicing(true);
    try {
      await billingApi.facturarLiquidacion(currentLiquidacion.id);
      await handleSeleccionarLiquidacion(currentLiquidacion.id);
      await cargarHistorial();
      setFeedback({
        type: 'ok',
        msg: `Liquidación ${currentLiquidacion.numero_liquidacion} marcada como FACTURADA exitosamente.`,
      });
    } catch (err: any) {
      console.error('Error al facturar liquidación:', err);
      setFeedback({ type: 'err', msg: err.message || 'No se pudo marcar la liquidación como facturada.' });
    } finally {
      setInvoicing(false);
    }
  };

  // Presets rápidos de fechas
  const setPresetFechas = (tipo: 'quincena_1' | 'quincena_2' | 'mes_actual' | 'mes_anterior') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (tipo === 'quincena_1') {
      setFechaDesde(formatDateISO(new Date(y, m, 1)));
      setFechaHasta(formatDateISO(new Date(y, m, 15)));
    } else if (tipo === 'quincena_2') {
      const ultimoDia = new Date(y, m + 1, 0);
      setFechaDesde(formatDateISO(new Date(y, m, 16)));
      setFechaHasta(formatDateISO(ultimoDia));
    } else if (tipo === 'mes_actual') {
      setFechaDesde(formatDateISO(new Date(y, m, 1)));
      setFechaHasta(formatDateISO(now));
    } else if (tipo === 'mes_anterior') {
      const primerDiaAnt = new Date(y, m - 1, 1);
      const ultimoDiaAnt = new Date(y, m, 0);
      setFechaDesde(formatDateISO(primerDiaAnt));
      setFechaHasta(formatDateISO(ultimoDiaAnt));
    }
  };

  const isBorrador = currentLiquidacion?.estado === 'borrador';

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Barra de Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#333333] gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-[#dab9ff]" />
            Facturación 3PL & Liquidación de Estadía por M³
          </h2>
          <p className="text-xs text-[#cdc3d4] mt-0.5">
            Cálculo de tramos de stock constante, valorización de servicios de muelle y auditoría ACID de Kardex
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTarifasModalOpen(true)}
            disabled={!selectedClienteId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-[#333333] bg-[#1c1b1b] hover:bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors disabled:opacity-40"
          >
            <DollarSign className="w-3.5 h-3.5 text-[#dab9ff]" />
            <span>Tarifario Comercial</span>
          </button>

          {currentLiquidacion && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-[#333333] bg-[#1c1b1b] hover:bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-[#75d1ff]" />
              <span>Imprimir Proforma</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Panel Selector de Parámetros y Presets */}
      <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Selector Cliente */}
          <div className="md:col-span-4">
            <label className="text-xs font-semibold text-[#cdc3d4] block mb-1">
              Cliente Depositante 3PL
            </label>
            <select
              value={selectedClienteId}
              onChange={(e) => onSelectCliente(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[#131313] border border-[#333333] rounded text-[#e5e2e1] focus:border-[#dab9ff] focus:outline-none"
            >
              <option value="">-- Seleccionar Cliente --</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {c.razon_social}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha Desde */}
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-[#cdc3d4] block mb-1">
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono bg-[#131313] border border-[#333333] rounded text-[#e5e2e1] focus:border-[#dab9ff] focus:outline-none"
            />
          </div>

          {/* Fecha Hasta */}
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-[#cdc3d4] block mb-1">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono bg-[#131313] border border-[#333333] rounded text-[#e5e2e1] focus:border-[#dab9ff] focus:outline-none"
            />
          </div>

          {/* Botón de Ejecución */}
          <div className="md:col-span-4 flex items-center gap-2">
            <button
              onClick={() => handleGenerarLiquidacion(false)}
              disabled={calculating || !selectedClienteId}
              className="flex-1 py-1.5 px-3 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {calculating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Calculando...</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  <span>Liquidar Período M³</span>
                </>
              )}
            </button>

            {currentLiquidacion && isBorrador && (
              <button
                onClick={() => handleGenerarLiquidacion(true)}
                disabled={calculating}
                title="Recalcular desde cero los tramos y movimientos"
                className="py-1.5 px-2.5 rounded text-xs font-semibold border border-[#333333] bg-[#201f1f] hover:bg-[#2a2a2a] text-[#cdc3d4] hover:text-[#e5e2e1] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Presets Rápidos */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#333333]/60 text-[11px] text-[#cdc3d4]">
          <span className="font-mono text-[#978d9d]">Períodos Rápidos:</span>
          <button
            type="button"
            onClick={() => setPresetFechas('quincena_1')}
            className="px-2 py-0.5 rounded bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#333333] transition-colors"
          >
            1ra Quincena (1 - 15)
          </button>
          <button
            type="button"
            onClick={() => setPresetFechas('quincena_2')}
            className="px-2 py-0.5 rounded bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#333333] transition-colors"
          >
            2da Quincena (16 - Fin)
          </button>
          <button
            type="button"
            onClick={() => setPresetFechas('mes_actual')}
            className="px-2 py-0.5 rounded bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#333333] transition-colors"
          >
            Mes en Curso
          </button>
          <button
            type="button"
            onClick={() => setPresetFechas('mes_anterior')}
            className="px-2 py-0.5 rounded bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#333333] transition-colors"
          >
            Mes Anterior Completo
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3 rounded text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-[#0f241a] text-[#75d1ff] border border-[#1d4d38]'
              : 'bg-[#2a0e12] text-[#ffb4ab] border border-[#690005]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#69f0ae]" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#ffb4ab]" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-75 hover:opacity-100">
            &times;
          </button>
        </div>
      )}

      {/* 3. Panel Principal: Liquidación Activa */}
      {currentLiquidacion ? (
        <div className="space-y-6">
          {/* 3.a Alerta de Auditoría ACID Kardex */}
          <div
            className={`p-3.5 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              currentLiquidacion.auditoria_desvios_detectados?.estado === 'OK'
                ? 'bg-[#0f241a] border-[#1d4d38]'
                : 'bg-[#281b0a] border-[#533914]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck
                className={`w-5 h-5 shrink-0 ${
                  currentLiquidacion.auditoria_desvios_detectados?.estado === 'OK'
                    ? 'text-[#69f0ae]'
                    : 'text-[#ffd27a]'
                }`}
              />
              <div>
                <div className="text-xs font-semibold text-[#e5e2e1] flex items-center gap-2">
                  <span>Auditoría Preventiva de Integridad Kardex vs. Stock:</span>
                  <span
                    className={`font-mono px-1.5 py-0.5 rounded text-[10px] ${
                      currentLiquidacion.auditoria_desvios_detectados?.estado === 'OK'
                        ? 'bg-[#1b4332] text-[#69f0ae]'
                        : 'bg-[#7a4c10] text-[#ffd27a]'
                    }`}
                  >
                    {currentLiquidacion.auditoria_desvios_detectados?.estado === 'OK'
                      ? 'ACID 100% VERIFICADO'
                      : 'DESVÍO DETECTADO'}
                  </span>
                </div>
                <p className="text-[11px] text-[#cdc3d4] mt-0.5">
                  {currentLiquidacion.auditoria_desvios_detectados?.mensaje ||
                    'Consistencia matemática entre movimientos inmutables y existencias verificada.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded border font-mono ${
                  currentLiquidacion.estado === 'aprobada'
                    ? 'bg-[#0f241a] text-[#69f0ae] border-[#1d4d38]'
                    : currentLiquidacion.estado === 'facturada'
                    ? 'bg-[#201330] text-[#dab9ff] border-[#4b4452]'
                    : currentLiquidacion.estado === 'anulada'
                    ? 'bg-[#2a0e12] text-[#ffb4ab] border-[#690005]'
                    : 'bg-[#281b0a] text-[#ffd27a] border-[#533914]'
                }`}
              >
                {currentLiquidacion.estado}
              </span>

              {isBorrador && (
                <button
                  onClick={handleAprobarLiquidacion}
                  disabled={approving}
                  className="px-3 py-1 rounded text-xs font-semibold bg-[#69f0ae] hover:bg-[#85f4c0] text-[#0f241a] transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Aprobar Liquidación</span>
                </button>
              )}

              {currentLiquidacion.estado === 'aprobada' && (
                <button
                  onClick={() => setEmitirFacturaModalOpen(true)}
                  className="px-3.5 py-1 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm font-bold"
                >
                  <ReceiptText className="w-3.5 h-3.5" />
                  <span>Emitir Factura Fiscal Electrónica</span>
                </button>
              )}

              {currentLiquidacion.estado === 'facturada' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFacturaPrintModalOpen(true)}
                    className="px-3 py-1 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm font-bold"
                  >
                    <ReceiptText className="w-3.5 h-3.5" />
                    <span>Factura AFIP</span>
                  </button>

                  <button
                    onClick={() => setAnularFacturaModalOpen(true)}
                    className="px-2.5 py-1 rounded text-xs font-semibold border border-[#690005] bg-[#2a0e12] hover:bg-[#3d1318] text-[#ffb4ab] transition-colors flex items-center gap-1"
                    title="Anular comprobante o registrar Nota de Crédito"
                  >
                    <FileX2 className="w-3.5 h-3.5" />
                    <span>Anular / NC</span>
                  </button>
                </div>
              )}

              {currentLiquidacion.estado === 'anulada' && (
                <span className="text-[11px] font-mono text-[#ffb4ab] bg-[#2a0e12] border border-[#690005] px-2.5 py-1 rounded flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>ANULADA {currentLiquidacion.motivo_anulacion ? `(${currentLiquidacion.motivo_anulacion})` : ''}</span>
                </span>
              )}
            </div>
          </div>

          {/* 3.a.bis Tarjeta de Datos Fiscales AFIP si está Facturada */}
          {currentLiquidacion.estado === 'facturada' && (
            <div className="p-4 rounded-md border border-[#4b4452] bg-[#1a1424] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#2c1d3f] border border-[#635378] text-[#dab9ff] flex items-center justify-center font-bold shrink-0">
                  <ReceiptText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#e5e2e1]">
                      {currentLiquidacion.tipo_comprobante || 'FACTURA_A'} {currentLiquidacion.punto_venta || '0005'}-{currentLiquidacion.numero_factura || '00000000'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#1b4332] text-[#69f0ae] border border-[#2d6a4f]">
                      AUTORIZADA AFIP
                    </span>
                    {currentLiquidacion.remitos_asociados && currentLiquidacion.remitos_asociados.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#201330] text-[#dab9ff] border border-[#4b4452] flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        <span>{currentLiquidacion.remitos_asociados.length} Remitos Rx</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#cdc3d4] flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 font-mono">
                    <span>CAE: <strong className="text-[#dab9ff]">{currentLiquidacion.cae}</strong></span>
                    <span>&bull;</span>
                    <span>Vto CAE: <strong className="text-[#e5e2e1]">{formatDate(currentLiquidacion.fecha_vencimiento_cae || '')}</strong></span>
                    <span>&bull;</span>
                    <span>Neto: <strong className="text-[#e5e2e1]">${formatNumber(currentLiquidacion.monto_neto_gravado || currentLiquidacion.monto_total, 2)}</strong></span>
                    <span>&bull;</span>
                    <span>IVA ({currentLiquidacion.alicuota_iva || 21}%): <strong className="text-[#dab9ff]">${formatNumber(currentLiquidacion.monto_iva || 0, 2)}</strong></span>
                    <span>&bull;</span>
                    <span>Total Facturado: <strong className="text-[#69f0ae]">${formatNumber(currentLiquidacion.monto_total_facturado || currentLiquidacion.monto_total, 2)}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setFacturaPrintModalOpen(true)}
                  className="px-3.5 py-1.5 rounded text-xs font-semibold bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors flex items-center gap-1.5 shadow-md font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Factura A4 con QR</span>
                </button>
              </div>
            </div>
          )}

          {/* 3.b Resumen Ejecutivo (KPIs) */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* Monto Total */}
            <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333] col-span-2">
              <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">
                Monto Total Liquidación
              </span>
              <div className="text-2xl font-bold font-mono text-[#dab9ff] mt-1">
                ${Number(currentLiquidacion.monto_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#cdc3d4] flex items-center gap-2 mt-1">
                <span>Comprobante: <strong className="text-[#e5e2e1] font-mono">{currentLiquidacion.numero_liquidacion}</strong></span>
                <span>•</span>
                <span>{currentLiquidacion.total_dias_periodo} días</span>
              </div>
            </div>

            {/* M3*Días Acumulados */}
            <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
              <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">
                M³ * Días Totales
              </span>
              <div className="text-lg font-bold font-mono text-[#75d1ff] mt-1">
                {Number(currentLiquidacion.total_m3_dias).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-[#cdc3d4] mt-0.5">Volumen ponderado</p>
            </div>

            {/* Subtotal Estadía M3 */}
            <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
              <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">
                Subtotal Estadía
              </span>
              <div className="text-lg font-bold font-mono text-[#e5e2e1] mt-1">
                ${Number(currentLiquidacion.subtotal_estadia).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-[#cdc3d4] mt-0.5">Almacenamiento M³</p>
            </div>

            {/* Subtotal Operativo */}
            <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
              <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">
                Subtotal Operativo
              </span>
              <div className="text-lg font-bold font-mono text-[#e5e2e1] mt-1">
                ${Number(currentLiquidacion.subtotal_operativo).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-[#cdc3d4] mt-0.5">Inbound + Picking</p>
            </div>

            {/* Bultos Totales Promedio (Dato extra solicitado) */}
            <div className="p-3.5 rounded-md bg-[#1c1b1b] border border-[#333333]">
              <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">
                Bultos Promedio Stock
              </span>
              <div className="text-lg font-bold font-mono text-[#ffd27a] mt-1">
                {Math.round(Number(currentLiquidacion.total_bultos_stock)).toLocaleString('en-US')}
              </div>
              <p className="text-[10px] text-[#cdc3d4] mt-0.5">Dato volumétrico extra</p>
            </div>
          </div>

          {/* 3.c Tramos de Stock Constante (Sumarización de Días con Mismo Nivel de Stock) */}
          <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
            <div className="p-3 bg-[#201f1f] border-b border-[#333333] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#e5e2e1] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#dab9ff]" />
                  Tramos de Stock Constante (Días con mismo nivel de M³)
                </span>
                <p className="text-[11px] text-[#cdc3d4]">
                  Sumariza los días continuos donde el cliente mantuvo idéntico volumen de almacenamiento.
                </p>
              </div>
              <span className="text-xs font-mono text-[#cdc3d4]">
                {currentLiquidacion.tramos?.length || 0} tramo(s) detectado(s)
              </span>
            </div>

            {/* Visual Timeline bar of tramos */}
            {currentLiquidacion.tramos && currentLiquidacion.tramos.length > 0 && (
              <div className="p-3 border-b border-[#333333] bg-[#171717]">
                <div className="text-[10px] text-[#cdc3d4] uppercase font-medium mb-1.5 flex justify-between">
                  <span>Línea Temporal de Ocupación por Tramo</span>
                  <span>{currentLiquidacion.fecha_desde} al {currentLiquidacion.fecha_hasta}</span>
                </div>
                <div className="flex h-5 w-full rounded overflow-hidden border border-[#333333]">
                  {currentLiquidacion.tramos.map((t, idx) => {
                    const pct = Math.max(5, (t.dias_en_tramo / currentLiquidacion.total_dias_periodo) * 100);
                    const bgColors = ['bg-[#460283]', 'bg-[#2a0e45]', 'bg-[#1b2b45]', 'bg-[#17382c]', 'bg-[#3b2b1b]'];
                    const color = bgColors[idx % bgColors.length];
                    return (
                      <div
                        key={t.id || idx}
                        style={{ width: `${pct}%` }}
                        title={`Tramo ${t.orden_tramo}: ${t.dias_en_tramo} días @ ${t.volumen_m3} M³`}
                        className={`${color} border-r border-[#333333] flex items-center justify-center text-[10px] font-mono text-[#e5e2e1] overflow-hidden px-1`}
                      >
                        {t.dias_en_tramo}d ({t.volumen_m3}m³)
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabla de Tramos */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#44424a] bg-[#201f1f]/50 text-[#cdc3d4] font-medium text-[11px]">
                    <th className="py-2.5 px-3"># Tramo</th>
                    <th className="py-2.5 px-3">Período de Stock Constante</th>
                    <th className="py-2.5 px-3 text-right">Días</th>
                    <th className="py-2.5 px-3 text-right text-[#75d1ff]">Nivel de Stock (M³)</th>
                    <th className="py-2.5 px-3 text-right text-[#ffd27a]">Bultos Totales</th>
                    <th className="py-2.5 px-3 text-right">M³ * Días</th>
                    <th className="py-2.5 px-3 text-right">Tarifa $/M³</th>
                    <th className="py-2.5 px-3 text-right text-[#dab9ff]">Subtotal ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#44424a]">
                  {currentLiquidacion.tramos && currentLiquidacion.tramos.length > 0 ? (
                    currentLiquidacion.tramos.map((tramo) => (
                      <tr key={tramo.id} className="hover:bg-[#201f1f]/40 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-[#e5e2e1]">
                          #{tramo.orden_tramo}
                        </td>
                        <td className="py-2 px-3 font-mono text-[#cdc3d4]">
                          {tramo.fecha_inicio} &rarr; {tramo.fecha_fin}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#e5e2e1]">
                          {tramo.dias_en_tramo}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-[#75d1ff]">
                          {Number(tramo.volumen_m3).toFixed(4)} m³
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#ffd27a]">
                          {Number(tramo.bultos_totales).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#cdc3d4]">
                          {Number(tramo.m3_dias_acumulados).toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#cdc3d4]">
                          ${Number(tramo.tarifa_m3_aplicada).toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#dab9ff]">
                          ${Number(tramo.subtotal_tramo).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-[#cdc3d4] text-xs">
                        No se han generado tramos para este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3.d Conceptos & Renglones Facturados (Automáticos + Manuales a Mano) */}
          <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
            <div className="p-3 bg-[#201f1f] border-b border-[#333333] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#e5e2e1] uppercase tracking-wider flex items-center gap-1.5">
                  <ReceiptText className="w-3.5 h-3.5 text-[#dab9ff]" />
                  Conceptos de Facturación & Renglones Operativos
                </span>
                <p className="text-[11px] text-[#cdc3d4]">
                  Servicios automáticos del período y conceptos insertados a mano.
                </p>
              </div>

              {isBorrador && (
                <button
                  onClick={() => setItemManualModalOpen(true)}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insertar Concepto a Mano</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#44424a] bg-[#201f1f]/50 text-[#cdc3d4] font-medium text-[11px]">
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Descripción del Servicio</th>
                    <th className="py-2.5 px-3 text-right">Cantidad</th>
                    <th className="py-2.5 px-3">Unidad</th>
                    <th className="py-2.5 px-3 text-right">Precio Unit. ($)</th>
                    <th className="py-2.5 px-3 text-right text-[#dab9ff]">Subtotal ($)</th>
                    {isBorrador && <th className="py-2.5 px-3 text-center">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#44424a]">
                  {currentLiquidacion.items && currentLiquidacion.items.length > 0 ? (
                    currentLiquidacion.items.map((item) => (
                      <tr key={item.id} className="hover:bg-[#201f1f]/40 transition-colors">
                        <td className="py-2 px-3">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${
                              item.origen === 'manual'
                                ? 'bg-[#281b0a] text-[#ffd27a] border-[#533914]'
                                : 'bg-[#1b2b45] text-[#75d1ff] border-[#1d4d38]'
                            }`}
                          >
                            {item.origen === 'manual' ? 'MANUAL' : 'SISTEMA'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-[#cdc3d4]">
                          {item.concepto_codigo}
                        </td>
                        <td className="py-2 px-3 text-[#e5e2e1]">
                          <div className="font-medium">{item.descripcion}</div>
                          {item.notas && (
                            <div className="text-[10px] text-[#cdc3d4] italic mt-0.5">
                              {item.notas}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-[#e5e2e1]">
                          {Number(item.cantidad).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-[#cdc3d4] font-mono text-[11px]">
                          {item.unidad_medida}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#cdc3d4]">
                          ${Number(item.precio_unitario).toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#dab9ff]">
                          ${Number(item.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        {isBorrador && (
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setEditingItem(item)}
                                title="Modificar valores (cantidad, precio unitario, descripción)"
                                className="p-1 rounded text-[#cdc3d4] hover:text-[#dab9ff] hover:bg-[#2a2a2a] transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleEliminarItem(item)}
                                title="Eliminar concepto de la liquidación"
                                className="p-1 rounded text-[#cdc3d4] hover:text-[#ffb4ab] hover:bg-[#2a2a2a] transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isBorrador ? 8 : 7} className="py-6 text-center text-[#cdc3d4] text-xs">
                        No hay conceptos registrados en esta liquidación.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#333333] bg-[#201f1f] font-semibold text-xs text-[#e5e2e1]">
                    <td colSpan={6} className="py-2.5 px-3 text-right uppercase tracking-wider">
                      Total General de la Liquidación ($):
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-[#dab9ff]">
                      ${Number(currentLiquidacion.monto_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    {isBorrador && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-[#cdc3d4] rounded-md bg-[#1c1b1b] border border-[#333333] space-y-3">
          <ReceiptText className="w-10 h-10 mx-auto text-[#978d9d] opacity-50" />
          <p className="text-xs">
            Selecciona un cliente y haz clic en <strong>"Liquidar Período M³"</strong> para generar el resumen de tramos de stock constante y conceptos facturables.
          </p>
        </div>
      )}

      {/* 4. Historial de Liquidaciones Anteriores del Cliente */}
      {historialLiquidaciones.length > 0 && (
        <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
          <div className="p-3 bg-[#201f1f] border-b border-[#333333] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#e5e2e1] uppercase tracking-wider">
              Historial de Liquidaciones Emitidas ({historialLiquidaciones.length})
            </span>
            <span className="text-[11px] text-[#cdc3d4] font-mono">
              Cliente: {clienteActivo?.razon_social}
            </span>
          </div>

          <div className="divide-y divide-[#44424a]">
            {historialLiquidaciones.map((liq) => {
              const isSelected = currentLiquidacion?.id === liq.id;
              return (
                <div
                  key={liq.id}
                  onClick={() => handleSeleccionarLiquidacion(liq.id)}
                  className={`p-3 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#201f1f] border-l-2 border-[#dab9ff]'
                      : 'hover:bg-[#201f1f]/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ReceiptText
                      className={`w-4 h-4 ${isSelected ? 'text-[#dab9ff]' : 'text-[#978d9d]'}`}
                    />
                    <div>
                      <div className="text-xs font-semibold font-mono text-[#e5e2e1]">
                        {liq.numero_liquidacion}
                      </div>
                      <div className="text-[11px] text-[#cdc3d4] flex items-center gap-2 mt-0.5">
                        <span>
                          Período: {liq.fecha_desde} &rarr; {liq.fecha_hasta}
                        </span>
                        <span>•</span>
                        <span>{liq.total_dias_periodo} días</span>
                        <span>•</span>
                        <span>{Number(liq.total_m3_dias).toFixed(2)} M³*días</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border font-mono ${
                        liq.estado === 'aprobada'
                          ? 'bg-[#0f241a] text-[#69f0ae] border-[#1d4d38]'
                          : liq.estado === 'facturada'
                          ? 'bg-[#201330] text-[#dab9ff] border-[#4b4452]'
                          : liq.estado === 'anulada'
                          ? 'bg-[#2a0e12] text-[#ffb4ab] border-[#690005]'
                          : 'bg-[#281b0a] text-[#ffd27a] border-[#533914]'
                      }`}
                    >
                      {liq.estado}
                    </span>

                    <span className="text-xs font-mono font-bold text-[#dab9ff]">
                      ${Number(liq.monto_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>

                    <ChevronRight className="w-4 h-4 text-[#cdc3d4]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Modales Auxiliares */}
      <EditarTarifasModal
        isOpen={tarifasModalOpen}
        onClose={() => setTarifasModalOpen(false)}
        cliente={clienteActivo}
        onTarifasUpdated={() => {
          if (currentLiquidacion && isBorrador) {
            handleGenerarLiquidacion(true);
          }
        }}
      />

      {currentLiquidacion && (
        <AgregarItemManualModal
          isOpen={itemManualModalOpen}
          onClose={() => setItemManualModalOpen(false)}
          liquidacionId={currentLiquidacion.id}
          onItemAgregado={() => {
            handleSeleccionarLiquidacion(currentLiquidacion.id);
          }}
        />
      )}

      {/* Modal para editar valores de conceptos (sistema o manual) */}
      <EditarItemConceptoModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        onSuccess={() => {
          if (currentLiquidacion) {
            handleSeleccionarLiquidacion(currentLiquidacion.id);
          }
        }}
      />

      {/* Modal para Emisión de Factura Fiscal Electrónica AFIP */}
      <EmitirFacturaModal
        isOpen={emitirFacturaModalOpen}
        onClose={() => setEmitirFacturaModalOpen(false)}
        liquidacion={currentLiquidacion}
        cliente={clienteActivo}
        onSuccess={async () => {
          if (currentLiquidacion) {
            await handleSeleccionarLiquidacion(currentLiquidacion.id);
            await cargarHistorial();
            setFeedback({
              type: 'ok',
              msg: `Factura Fiscal emitida y asociada exitosamente a la liquidación ${currentLiquidacion.numero_liquidacion}.`,
            });
            setFacturaPrintModalOpen(true);
          }
        }}
      />

      {/* Modal Imprimible A4 de Factura Fiscal Oficial AFIP con QR */}
      <FacturaFiscalPrintModal
        isOpen={facturaPrintModalOpen}
        onClose={() => setFacturaPrintModalOpen(false)}
        liquidacion={currentLiquidacion}
      />

      {/* Modal de Anulación / Nota de Crédito */}
      <AnularFacturaModal
        isOpen={anularFacturaModalOpen}
        onClose={() => setAnularFacturaModalOpen(false)}
        liquidacion={currentLiquidacion}
        onSuccess={async () => {
          if (currentLiquidacion) {
            await handleSeleccionarLiquidacion(currentLiquidacion.id);
            await cargarHistorial();
            setFeedback({
              type: 'ok',
              msg: `Factura / Liquidación ${currentLiquidacion.numero_liquidacion} anulada correctamente.`,
            });
          }
        }}
      />
    </div>
  );
};
