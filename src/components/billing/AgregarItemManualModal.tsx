import React, { useState } from 'react';
import { X, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { billingApi } from '../../api/billingApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface AgregarItemManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidacionId: string;
  onItemAgregado: () => void;
}

export const AgregarItemManualModal: React.FC<AgregarItemManualModalProps> = ({
  isOpen,
  onClose,
  liquidacionId,
  onItemAgregado,
}) => {
  const [conceptoCodigo, setConceptoCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [unidadMedida, setUnidadMedida] = useState('servicio');
  const [precioUnitario, setPrecioUnitario] = useState('0.00');
  const [notas, setNotas] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const cantNum = parseFloat(cantidad) || 0;
  const precioNum = parseFloat(precioUnitario) || 0;
  const subtotalCalculado = Math.round(cantNum * precioNum * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) {
      setErrorMsg('Debe ingresar una descripción para el concepto.');
      return;
    }
    if (cantNum <= 0) {
      setErrorMsg('La cantidad debe ser mayor a 0.');
      return;
    }
    if (precioNum < 0) {
      setErrorMsg('El precio unitario no puede ser negativo.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await billingApi.agregarItemManual(liquidacionId, {
        concepto_codigo: conceptoCodigo.trim() ? conceptoCodigo.trim().toUpperCase() : 'MANUAL_AD_HOC',
        descripcion: descripcion.trim(),
        cantidad: cantNum,
        unidad_medida: unidadMedida,
        precio_unitario: precioNum,
        notas: notas.trim() || undefined,
      });

      onItemAgregado();
      onClose();
    } catch (err: any) {
      console.error('Error al agregar ítem manual:', err);
      setErrorMsg(err.message || 'Error al registrar el concepto en la liquidación.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-md max-w-md w-full p-5 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#333333]">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
              Agregar Concepto a Mano
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#201f1f] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2a0e12] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
              Descripción del Concepto / Servicio <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
            </label>
            <input
              type="text"
              required
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Horas extras autoelevador, embalaje especial, precintado"
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
                Cantidad <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
                Unidad
              </label>
              <select
                value={unidadMedida}
                onChange={(e) => setUnidadMedida(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none"
              >
                <option value="servicio">Servicio / Evento</option>
                <option value="hora">Hora</option>
                <option value="pallet">Pallet</option>
                <option value="bulto">Bulto</option>
                <option value="m3">M³</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
                Precio Unitario ($) <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
                Subtotal Calculado
              </label>
              <div className="px-3 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded text-violet-600 dark:text-[#dab9ff]">
                ${subtotalCalculado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
              Código de Referencia (Opcional)
            </label>
            <input
              type="text"
              value={conceptoCodigo}
              onChange={(e) => setConceptoCodigo(e.target.value)}
              placeholder="MANUAL_EXTRA_01"
              className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 dark:text-[#cdc3d4] block mb-1">
              Observaciones / Justificación
            </label>
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalle o autorización del gasto..."
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-[#333333] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 disabled:opacity-40 shadow-sm"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Insertando...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar a la Liquidación</span>
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
