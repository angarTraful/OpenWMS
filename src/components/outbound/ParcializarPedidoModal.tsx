import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Truck,
  AlertTriangle,
  X,
  Package,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { pedidosApi } from '@/api/pedidosApi';
import { rfSoundService } from '@/lib/rfSoundService';

interface ParcializarPedidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  onSuccess: (data: any) => void;
}

export const ParcializarPedidoModal: React.FC<ParcializarPedidoModalProps> = ({
  isOpen,
  onClose,
  pedido,
  onSuccess,
}) => {
  const [cantidadesViaje1, setCantidadesViaje1] = useState<Record<string, number>>({});
  const [motivo, setMotivo] = useState<string>('Capacidad volumétrica de unidad de transporte excedida');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detalles = pedido?.detalles || [];

  useEffect(() => {
    if (!isOpen || !pedido) return;
    setErrorMsg(null);
    setMotivo('Capacidad volumétrica de unidad de transporte excedida');

    // Inicializar cantidades por defecto con el total actual
    const initialMap: Record<string, number> = {};
    detalles.forEach((d: any) => {
      initialMap[d.id] = Number(d.cantidad_solicitada || 0);
    });
    setCantidadesViaje1(initialMap);
  }, [isOpen, pedido]);

  const handleCantidadChange = (detalleId: string, val: number, max: number) => {
    const clamped = Math.max(0, Math.min(val, max));
    setCantidadesViaje1((prev) => ({
      ...prev,
      [detalleId]: clamped,
    }));
  };

  // Calcular totales
  const totalOriginal = detalles.reduce((acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0), 0);
  const totalViaje1 = Object.values(cantidadesViaje1).reduce((acc: number, val: number) => acc + (val || 0), 0);
  const totalRemanente = Math.max(0, totalOriginal - totalViaje1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido?.id) return;

    if (totalViaje1 <= 0) {
      setErrorMsg('Debe despachar al menos 1 unidad en este primer viaje.');
      return;
    }
    if (totalRemanente <= 0) {
      setErrorMsg('Para parcializar el pedido, debe quedar al menos 1 unidad pendiente para el siguiente viaje.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const itemsPayload = Object.entries(cantidadesViaje1).map(([detalleId, cantidadADespachar]) => ({
        detalleId,
        cantidadADespachar,
      }));

      const res = await pedidosApi.parcializarPedido({
        pedidoOriginalId: pedido.id,
        itemsADespachar: itemsPayload,
        motivo,
      });

      rfSoundService.playSuccess();
      onSuccess(res);
      onClose();
    } catch (err: any) {
      console.error('Error al parcializar pedido:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al fraccionar el pedido.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !pedido) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-fadeIn">
        <div className="relative w-full max-w-2xl bg-white dark:bg-[#181717] rounded-2xl border border-slate-200 dark:border-[#2f2e2e] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2a2929] bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-[#2e1d09] dark:to-[#1b1105] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white dark:bg-[#ffba28] dark:text-[#3e2e00] flex items-center justify-center shadow-xs">
                <Scissors className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                  Parcializar Pedido por Capacidad de Carga
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
                  Pedido {pedido.numero_pedido} • Fraccionamiento Previo a Remito
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#252424] dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2b0d12] dark:border-[#6b0914] dark:text-[#ffb4ab] font-bold flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-[#271a06] border border-amber-200 dark:border-[#4d3209] text-amber-900 dark:text-[#ffddb8] leading-relaxed">
              <b>¿Cómo funciona la parcialización?</b>
              <p className="text-[11px] mt-1">
                Indique cuántas unidades caben en este <b>Viaje 1</b> (se emitirá el remito solo por esa cantidad). El saldo restante generará automáticamente un pedido hijo vinculado (<b>{pedido.numero_pedido}-PARTE2</b>) para consolidarse en el siguiente itinerario.
              </p>
            </div>

            {/* Grilla de Artículos con Ajuste de Cantidad */}
            <div className="space-y-2">
              <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
                Distribución de Unidades por Renglón:
              </span>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-[#2a2a2a] divide-y divide-slate-100 dark:divide-[#252525]">
                {detalles.map((det: any) => {
                  const maxCant = Number(det.cantidad_solicitada || 0);
                  const cantActual = cantidadesViaje1[det.id] ?? maxCant;
                  const saldo = Math.max(0, maxCant - cantActual);
                  const art = det.articulo || {};

                  return (
                    <div key={det.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#151414]">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                            {art.sku || 'SKU'}
                          </span>
                          <span className="text-slate-600 dark:text-[#cdc3d4] font-medium">
                            {art.nombre || 'Artículo'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-[#978d9d] font-mono block mt-0.5">
                          Total Solicitado: <b>{maxCant} {art.unidad_medida || 'un.'}</b>
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="space-y-1 text-center">
                          <label className="text-[10px] uppercase font-bold text-emerald-700 dark:text-[#69f0ae] block">
                            En este Viaje 1
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={maxCant}
                            value={cantActual}
                            onChange={(e) => handleCantidadChange(det.id, Number(e.target.value), maxCant)}
                            className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-[#444] bg-slate-50 dark:bg-[#1e1d1d] font-mono font-bold text-center text-slate-900 dark:text-[#e5e2e1] outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="space-y-1 text-center">
                          <label className="text-[10px] uppercase font-bold text-amber-700 dark:text-[#ffba28] block">
                            Saldo (Viaje 2)
                          </label>
                          <div className="w-20 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1a1919] border border-slate-200 dark:border-[#333] font-mono font-bold text-center text-amber-700 dark:text-[#ffba28]">
                            {saldo}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumen Totalizador */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#2a2a2a] text-center font-mono">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-sans">Total Pedido</span>
                <span className="font-bold text-sm text-slate-800 dark:text-[#e5e2e1]">{totalOriginal} un.</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-600 dark:text-[#69f0ae] uppercase block font-sans font-bold">Viaje 1 (Remito Rx)</span>
                <span className="font-black text-sm text-emerald-600 dark:text-[#69f0ae]">{totalViaje1} un.</span>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 dark:text-[#ffba28] uppercase block font-sans font-bold">Saldo Viaje 2</span>
                <span className="font-black text-sm text-amber-600 dark:text-[#ffba28]">{totalRemanente} un.</span>
              </div>
            </div>

            {/* Motivo */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                Motivo del Fraccionamiento:
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Camión completo, saldo a entregar mañana..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-slate-900 dark:text-[#e5e2e1] outline-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#2a2929] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#3b3a3a] text-slate-700 dark:text-[#cdc3d4] font-bold hover:bg-slate-100 dark:hover:bg-[#252424] transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting || totalRemanente <= 0}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white dark:bg-[#ffba28] dark:hover:bg-[#ffc652] dark:text-[#3e2e00] font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Dividiendo Pedido...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>Confirmar Fraccionamiento</span>
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
