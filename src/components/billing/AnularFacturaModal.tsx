import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  RefreshCw,
  FileX2,
  ShieldAlert,
} from 'lucide-react';
import { billingApi } from '../../api/billingApi';
import type { LiquidacionCliente } from '../../types/billing.types';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface AnularFacturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidacion: LiquidacionCliente | null;
  onSuccess: () => void;
}

export const AnularFacturaModal: React.FC<AnularFacturaModalProps> = ({
  isOpen,
  onClose,
  liquidacion,
  onSuccess,
}) => {
  const [motivo, setMotivo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !liquidacion) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setErrorMsg('Debe especificar obligatoriamente un motivo para la anulación o nota de crédito.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await billingApi.anularFacturaFiscal(liquidacion.id, motivo.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error anulando factura:', err);
      setErrorMsg(err.message || 'Error al anular la factura fiscal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1c1b1b] border border-rose-200 dark:border-[#690005] rounded-md max-w-lg w-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-rose-50 dark:bg-[#2a0e12] border-b border-rose-200 dark:border-[#690005] flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-rose-800 dark:text-[#ffb4ab]">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Anular Factura Fiscal / Nota de Crédito
              </h3>
              <p className="text-xs text-rose-600 dark:text-[#ffdad6]">
                Comprobante {liquidacion.tipo_comprobante} {liquidacion.punto_venta}-{liquidacion.numero_factura}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-100 dark:text-[#ffb4ab] dark:hover:text-[#ffdad6] dark:hover:bg-[#690005]/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#3b1216] dark:border-[#ffb4ab] dark:text-[#ffdad6] font-medium">
              {errorMsg}
            </div>
          )}

          <div className="p-3 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-1 text-slate-600 dark:text-[#cdc3d4]">
            <div>Liquidación: <strong className="font-mono text-slate-900 dark:text-[#e5e2e1]">{liquidacion.numero_liquidacion}</strong></div>
            <div>CAE: <strong className="font-mono text-violet-600 dark:text-[#dab9ff]">{liquidacion.cae}</strong></div>
            <div>Monto Total Facturado: <strong className="font-mono text-slate-900 dark:text-[#e5e2e1]">$ {liquidacion.monto_total_facturado || liquidacion.monto_total}</strong></div>
          </div>

          <div className="text-slate-600 dark:text-[#cdc3d4]">
            <p>
              Esta acción marcará el comprobante como <strong className="text-rose-600 dark:text-[#ffb4ab]">ANULADO</strong> en el sistema, registrando la fecha y motivo de anulación para auditoría y liberando el período en caso de requerir una reliquidación comercial.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
              Motivo de Anulación / Nota de Crédito <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Error en tarifa comercial acordada; refacturación con nota de crédito por cambio de alícuota..."
              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:border-rose-500 dark:focus:border-[#ffb4ab] outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !motivo.trim()}
              className="px-4 py-1.5 rounded font-bold bg-rose-600 hover:bg-rose-700 text-white dark:bg-[#93000a] dark:hover:bg-[#690005] dark:text-[#ffdad6] transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-md"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Anulando...</span>
                </>
              ) : (
                <>
                  <FileX2 className="w-4 h-4" />
                  <span>Confirmar Anulación</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
