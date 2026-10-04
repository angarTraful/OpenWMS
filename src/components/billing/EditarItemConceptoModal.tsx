import React, { useState, useEffect } from 'react';
import { X, Edit3, DollarSign, Calculator, AlertCircle, Save } from 'lucide-react';
import type { LiquidacionClienteItem } from '../../types/billing.types';
import { billingApi } from '../../api/billingApi';
import { formatNumber } from '../../lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface EditarItemConceptoModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: LiquidacionClienteItem | null;
  onSuccess: () => void;
}

export const EditarItemConceptoModal: React.FC<EditarItemConceptoModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess,
}) => {
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [precioUnitario, setPrecioUnitario] = useState<number>(0);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && item) {
      setDescripcion(item.descripcion || '');
      setCantidad(item.cantidad || 0);
      setPrecioUnitario(item.precio_unitario || 0);
      setNotas(item.notas || '');
      setErrorMsg(null);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const subtotalCalculado = Math.round(cantidad * precioUnitario * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (cantidad < 0) {
      setErrorMsg('La cantidad no puede ser negativa.');
      return;
    }
    if (precioUnitario < 0) {
      setErrorMsg('El precio unitario no puede ser negativo.');
      return;
    }

    setLoading(true);
    try {
      await billingApi.actualizarItemLiquidacion(item.id, {
        cantidad,
        precio_unitario: precioUnitario,
        descripcion: descripcion.trim() || undefined,
        notas: notas.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error actualizando concepto de liquidación:', err);
      setErrorMsg(err.message || 'Error al guardar los cambios del concepto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-amber-50 dark:bg-[#38260a] border border-amber-200 dark:border-[#7a4c10] text-amber-800 dark:text-[#ffddb8]">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                Modificar Valores de Concepto
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                  item.origen === 'manual'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-[#3b2d1d] dark:text-[#ffddb8] dark:border-[#7a4c10]'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                }`}>
                  {item.origen === 'manual' ? 'Manual' : 'Sistema'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Ajuste los valores facturables antes de la aprobación final.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Descripción del Concepto
            </label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              required
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
            <span className="text-[10px] text-slate-500 dark:text-[#8e8a94] mt-0.5 block font-mono">
              Código interno: {item.concepto_codigo} ({item.unidad_medida})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Cantidad ({item.unidad_medida})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={cantidad}
                onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                required
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Precio Unitario ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 dark:text-[#8e8a94] font-mono">$</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={precioUnitario}
                  onChange={(e) => setPrecioUnitario(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full pl-7 pr-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-emerald-600 dark:text-[#69f0ae] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>
          </div>

          {/* Subtotal Preview Card */}
          <div className="p-3 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
              <span className="text-xs font-semibold text-slate-600 dark:text-[#cdc3d4]">Subtotal Resultante</span>
            </div>
            <span className="text-sm font-bold font-mono text-violet-600 dark:text-[#dab9ff]">
              $ {formatNumber(subtotalCalculado, 2)}
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Notas u Observaciones (Opcional)
            </label>
            <textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Motivo del ajuste de tarifa o cantidad..."
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-1.5 rounded text-xs border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
