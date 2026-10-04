import React, { useState, useEffect } from 'react';
import {
  X,
  ReceiptText,
  FileCheck2,
  Calendar,
  AlertCircle,
  RefreshCw,
  Truck,
  CheckCircle2,
  Layers,
  Box,
  Building2,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { billingApi } from '../../api/billingApi';
import type { LiquidacionCliente, RemitoRxAsociado } from '../../types/billing.types';
import { formatM3, formatNumber, formatDate } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface EmitirFacturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidacion: LiquidacionCliente | null;
  cliente: any | null;
  onSuccess: () => void;
}

export const EmitirFacturaModal: React.FC<EmitirFacturaModalProps> = ({
  isOpen,
  onClose,
  liquidacion,
  cliente,
  onSuccess,
}) => {
  const [tipoComprobante, setTipoComprobante] = useState<'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C'>('FACTURA_A');
  const [puntoVenta, setPuntoVenta] = useState('0005');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [alicuotaIva, setAlicuotaIva] = useState<number>(21.0);
  const [cae, setCae] = useState('');
  const [fechaVencimientoCae, setFechaVencimientoCae] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Remitos Rx del período
  const [remitosPeriodo, setRemitosPeriodo] = useState<RemitoRxAsociado[]>([]);
  const [loadingRemitos, setLoadingRemitos] = useState(false);
  const [showRemitosDetail, setShowRemitosDetail] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generador de correlativo y CAE sugeridos
  const sugerirCorrelativo = () => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `0000${rand}`.slice(-8);
  };

  const generarCaePrueba = () => {
    // CAE de 14 dígitos numéricos conforme estándar AFIP
    const prefijo = '74';
    const rand12 = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    const caenew = `${prefijo}${rand12}`;
    setCae(caenew);

    // Vencimiento a 10 días corridos de hoy
    const vto = new Date();
    vto.setDate(vto.getDate() + 10);
    setFechaVencimientoCae(vto.toISOString().split('T')[0]);
  };

  useEffect(() => {
    if (isOpen && liquidacion) {
      setErrorMessage(null);
      setNumeroFactura(sugerirCorrelativo());
      generarCaePrueba();
      setObservaciones(`Liquidación de servicios logísticos y estadía M³ período ${liquidacion.fecha_desde} al ${liquidacion.fecha_hasta}`);

      // Detección inteligente de tipo de factura según CUIT
      const cuit = cliente?.identificacion_fiscal?.replace(/[^0-9]/g, '');
      if (cuit && cuit.length === 11) {
        setTipoComprobante('FACTURA_A');
      } else {
        setTipoComprobante('FACTURA_B');
      }

      // Cargar remitos Rx del período
      setLoadingRemitos(true);
      billingApi
        .listarRemitosPorPeriodo(liquidacion.cliente_id, liquidacion.fecha_desde, liquidacion.fecha_hasta)
        .then((rems) => setRemitosPeriodo(rems || []))
        .catch((err) => console.error('Error cargando remitos para factura:', err))
        .finally(() => setLoadingRemitos(false));
    }
  }, [isOpen, liquidacion, cliente]);

  if (!isOpen || !liquidacion) return null;

  // Cálculos impositivos
  const netoGravado = Number(liquidacion.monto_total) || 0;
  const montoIva = Math.round(netoGravado * (alicuotaIva / 100) * 100) / 100;
  const totalFacturado = netoGravado + montoIva;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const pvClean = puntoVenta.replace(/[^0-9]/g, '');
    const numClean = numeroFactura.replace(/[^0-9]/g, '');

    if (!pvClean) {
      setErrorMessage('Debe indicar un punto de venta numérico (ej. 0005).');
      return;
    }
    if (!numClean) {
      setErrorMessage('Debe indicar un número correlativo de comprobante.');
      return;
    }
    if (!cae.trim() || cae.trim().length !== 14) {
      setErrorMessage('El CAE debe contener exactamente 14 dígitos numéricos.');
      return;
    }
    if (!fechaVencimientoCae) {
      setErrorMessage('Debe especificar la fecha de vencimiento del CAE.');
      return;
    }

    setIsSubmitting(true);
    try {
      await billingApi.emitirFacturaFiscal({
        liquidacionId: liquidacion.id,
        tipoComprobante,
        puntoVenta: pvClean.padStart(4, '0'),
        numeroFactura: numClean.padStart(8, '0'),
        cae: cae.trim(),
        fechaVencimientoCae,
        alicuotaIva,
        remitos: remitosPeriodo,
        datosEmisor: {
          razon_social: 'OpenWMS 3PL Logistics S.A.',
          cuit: '30-71829384-9',
          iibb: '901-284910-3',
          condicion_iva: 'IVA Responsable Inscripto',
          direccion: 'Parque Industrial Sur, Nave Logística 4 - Km 34.5',
          inicio_actividades: '01/01/2020',
        },
        observaciones: observaciones.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al emitir factura fiscal:', err);
      setErrorMessage(err.message || 'Error al emitir el comprobante fiscal en la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-md max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-4.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#4b4452] text-violet-700 dark:text-[#dab9ff] flex items-center justify-center font-bold">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                Emisión de Factura Fiscal Electrónica
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Liquidación <strong className="font-mono text-violet-600 dark:text-[#dab9ff]">{liquidacion.numero_liquidacion}</strong> &bull; Período {formatDate(liquidacion.fecha_desde)} al {formatDate(liquidacion.fecha_hasta)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Bloque 1: Datos del Cliente y Receptor */}
          <div className="p-3.5 rounded border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#161616] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
              <div>
                <span className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                  {cliente?.razon_social || 'Cliente Depositante'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] block">
                  CUIT: <strong className="font-mono text-slate-900 dark:text-[#e5e2e1]">{cliente?.identificacion_fiscal || 'Sin CUIT registrado'}</strong> &bull; {cliente?.direccion || 'Domicilio fiscal no informado'}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider block font-semibold">
                Condición Sugerida
              </span>
              <span className="text-xs font-mono font-bold text-violet-600 dark:text-[#dab9ff]">
                {tipoComprobante === 'FACTURA_A' ? 'IVA Resp. Inscripto (Factura A)' : 'Consumidor Final / Exento (Factura B)'}
              </span>
            </div>
          </div>

          {/* Bloque 2: Configuración Fiscal del Comprobante */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
              <span>1. Configuración del Comprobante Fiscal AFIP</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tipo de Comprobante */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Tipo de Comprobante <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <select
                  value={tipoComprobante}
                  onChange={(e) => setTipoComprobante(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-semibold focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none cursor-pointer"
                >
                  <option value="FACTURA_A" className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">Factura "A" (Cód. 01)</option>
                  <option value="FACTURA_B" className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">Factura "B" (Cód. 06)</option>
                  <option value="FACTURA_C" className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">Factura "C" (Cód. 11)</option>
                </select>
              </div>

              {/* Punto de Venta */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Punto de Venta (PV) <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  value={puntoVenta}
                  onChange={(e) => setPuntoVenta(e.target.value)}
                  placeholder="0005"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                />
              </div>

              {/* Número de Comprobante */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block">
                    N° Comprobante <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setNumeroFactura(sugerirCorrelativo())}
                    className="text-[10px] text-violet-600 dark:text-[#dab9ff] hover:underline flex items-center gap-0.5"
                    title="Auto-generar correlativo sugerido"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Sugerir</span>
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={8}
                  required
                  value={numeroFactura}
                  onChange={(e) => setNumeroFactura(e.target.value)}
                  placeholder="00001042"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono font-bold focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Bloque 3: CAE Dual (Auto-generación o Carga Real) */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#333333]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                <span>2. Código de Autorización Electrónico (C.A.E.)</span>
              </h4>

              <button
                type="button"
                onClick={generarCaePrueba}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border border-violet-200 dark:border-[#4b4452] bg-violet-50 dark:bg-[#201330] text-violet-700 dark:text-[#dab9ff] hover:bg-violet-100 dark:hover:bg-[#311c47] transition-colors"
                title="Generar CAE simulado válido conforme RG 4291"
              >
                <Sparkles className="w-3 h-3" />
                <span>Simular CAE de Prueba AFIP</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Número de C.A.E. (14 dígitos) <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={14}
                  value={cae}
                  onChange={(e) => setCae(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="74829104829104"
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono tracking-widest font-bold focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                />
                <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] mt-0.5 block">
                  Código de 14 dígitos obtenido vía Web Services o Facturador AFIP
                </span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Vencimiento del C.A.E. <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={fechaVencimientoCae}
                  onChange={(e) => setFechaVencimientoCae(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                />
                <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] mt-0.5 block">
                  Fecha límite informada por AFIP para validez fiscal
                </span>
              </div>
            </div>
          </div>

          {/* Bloque 4: Anexo de Remitos Rx de Tránsito vinculados */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#333333]">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                  <span>3. Remitos Rx de Tránsito del Período</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                  {loadingRemitos ? (
                    'Consultando remitos de salida emitidos en el período...'
                  ) : (
                    <>
                      Se vincularán <strong className="text-slate-900 dark:text-[#e5e2e1]">{remitosPeriodo.length}</strong> remitos de tránsito como anexo de respaldo operativo
                    </>
                  )}
                </p>
              </div>

              {remitosPeriodo.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRemitosDetail(!showRemitosDetail)}
                  className="text-xs text-violet-600 dark:text-[#dab9ff] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>{showRemitosDetail ? 'Ocultar Detalle' : 'Ver Remitos Vinculados'}</span>
                  {showRemitosDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Tabla desplegable de Remitos */}
            {showRemitosDetail && remitosPeriodo.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#161616] divide-y divide-slate-200 dark:divide-[#2a2a2a] text-xs">
                {remitosPeriodo.map((rem) => (
                  <div key={rem.id} className="p-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff] shrink-0" />
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                          Remito Rx {rem.numero_remito_rx}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] block">
                          {formatDate(rem.fecha_emision)} &bull; {rem.destinatario?.razon_social_destinatario || 'Destinatario'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right text-[11px] font-mono text-slate-500 dark:text-[#cdc3d4]">
                      <div>{formatNumber(rem.total_bultos, 0)} bultos &bull; {formatNumber(rem.total_pallets, 0)} pallets</div>
                      <div className="text-violet-600 dark:text-[#dab9ff] font-semibold">{formatM3(rem.volumen_total_m3)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bloque 5: Liquidación Impositiva & Totales en Vivo */}
          <div className="p-4 rounded-md border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#181818] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-[#cdc3d4]">Alícuota de IVA aplicable:</span>
              <div className="flex items-center gap-2">
                {[21.0, 10.5, 0.0].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setAlicuotaIva(rate)}
                    className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition-colors ${
                      alicuotaIva === rate
                        ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283]'
                        : 'bg-white dark:bg-[#252525] border border-slate-200 dark:border-transparent text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-[#333333] space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600 dark:text-[#cdc3d4]">
                <span>Subtotal Neto Gravado (Servicios & Estadía):</span>
                <span className="font-mono font-medium text-slate-900 dark:text-[#e5e2e1]">
                  $ {formatNumber(netoGravado, 2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600 dark:text-[#cdc3d4]">
                <span>I.V.A. ({alicuotaIva}%):</span>
                <span className="font-mono font-medium text-violet-600 dark:text-[#dab9ff]">
                  $ {formatNumber(montoIva, 2)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#333333] text-sm font-bold">
                <span className="text-slate-900 dark:text-[#e5e2e1]">Total Factura Electrónica:</span>
                <span className="font-mono text-base text-violet-600 dark:text-[#dab9ff]">
                  $ {formatNumber(totalFacturado, 2)}
                </span>
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-t border-slate-200 dark:border-[#333333] flex items-center justify-between gap-4">
          <div className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
            Comprobante: <strong className="font-mono text-violet-600 dark:text-[#dab9ff]">{tipoComprobante} {puntoVenta}-{numeroFactura}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-md font-bold"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Emitiendo Factura...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Emitir Factura Fiscal Electrónica</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  </ModalPortal>
  );
};
