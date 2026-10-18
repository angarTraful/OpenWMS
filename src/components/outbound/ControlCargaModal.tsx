import React, { useState } from 'react';
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  ShieldCheck,
  Package,
  Layers,
  Sparkles,
  ClipboardCheck,
  Check,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { despachosApi } from '@/api/despachosApi';
import { rfSoundService } from '@/lib/rfSoundService';

interface ControlCargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruta: any;
  onSuccess: () => void;
  usuarioDefault?: string;
}

export const ControlCargaModal: React.FC<ControlCargaModalProps> = ({
  isOpen,
  onClose,
  ruta,
  onSuccess,
  usuarioDefault = '',
}) => {
  const [usuario, setUsuario] = useState(usuarioDefault || ruta?.chofer_nombre || '');
  const [precinto, setPrecinto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [remitosVerificados, setRemitosVerificados] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const paradas = ruta?.paradas || [];

  // Total bultos
  const totalBultos = paradas.reduce((acc: number, p: any) => {
    return acc + Number(p.remito?.total_bultos || 1);
  }, 0);

  const toggleRemitoCheck = (paradaId: string) => {
    setRemitosVerificados((prev) => ({
      ...prev,
      [paradaId]: !prev[paradaId],
    }));
  };

  const verificarTodosRemitos = () => {
    const all: Record<string, boolean> = {};
    paradas.forEach((p: any) => {
      all[p.id] = true;
    });
    setRemitosVerificados(all);
  };

  const todosVerificados = paradas.length === 0 || paradas.every((p: any) => remitosVerificados[p.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruta?.id) return;

    if (!usuario.trim()) {
      setErrorMsg('Debe indicar quién realiza la verificación de carga en muelle.');
      return;
    }

    if (!todosVerificados) {
      if (
        !window.confirm(
          'Hay remitos o paradas sin tildar como verificados a bordo. ¿Confirmas la carga de todas formas?'
        )
      ) {
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await despachosApi.registrarControlCarga({
        rutaId: ruta.id,
        usuario: usuario.trim(),
        precinto: precinto.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        bultosVerificados: totalBultos,
      });

      rfSoundService.playSuccess();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error registrando control de carga en muelle:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al guardar el control de carga.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !ruta) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-fadeIn">
        <div className="relative w-full max-w-2xl bg-white dark:bg-[#181717] rounded-2xl border border-slate-200 dark:border-[#2f2e2e] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2a2929] bg-gradient-to-r from-emerald-50 to-teal-50/50 dark:from-[#112a1d] dark:to-[#0c1e15] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d] flex items-center justify-center shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                  Control de Carga en Muelle
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
                  {ruta.codigo_ruta} • Patente: {ruta.vehiculo_patente} ({ruta.chofer_nombre})
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
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Banner de Regla de Muelle */}
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-[#122e20] border border-emerald-200 dark:border-[#1d4f36] text-emerald-900 dark:text-[#69f0ae] leading-relaxed">
              <b>Validación Obligatoria de Despacho:</b>
              <p className="text-[11px] mt-0.5">
                El vehículo no puede iniciar viaje sin la verificación física de bultos cargados y remitos conformados a bordo.
              </p>
            </div>

            {/* Lista de Remitos y Paradas a Bordo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Documentación y Bultos a Bordo ({paradas.length} paradas / ~{totalBultos} bultos):</span>
                </span>
                <button
                  type="button"
                  onClick={verificarTodosRemitos}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-[#69f0ae] underline"
                >
                  Verificar Todo
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-[#2a2a2a] divide-y divide-slate-100 dark:divide-[#252525]">
                {paradas.map((parada: any) => {
                  const isChecked = !!remitosVerificados[parada.id];
                  const remitoRx = parada.remito?.numero_remito_rx || 'Remito Pendiente';
                  const bultos = parada.remito?.total_bultos || 1;

                  return (
                    <div
                      key={parada.id}
                      onClick={() => toggleRemitoCheck(parada.id)}
                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-emerald-50/50 dark:bg-[#133222]/30'
                          : 'hover:bg-slate-50 dark:hover:bg-[#181818]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]'
                              : 'border-slate-300 dark:border-[#444] bg-white dark:bg-[#1c1b1b]'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">
                              Parada #{parada.secuencia_parada}: {parada.destinatario?.razon_social}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-[#978d9d] font-mono">
                            Remito: <b className="text-slate-700 dark:text-[#cdc3d4]">{remitoRx}</b> • {parada.destinatario?.direccion_entrega || 'Destino'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono font-bold text-emerald-700 dark:text-[#69f0ae] shrink-0">
                        {bultos} {bultos === 1 ? 'bulto' : 'bultos'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Datos de Control */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                  Verificador en Muelle / Chofer:
                </label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Nombre de quien controla la carga..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                  Número de Precinto de Seguridad:
                </label>
                <input
                  type="text"
                  value={precinto}
                  onChange={(e) => setPrecinto(e.target.value)}
                  placeholder="Ej: PRE-984321..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] font-mono font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                Observaciones del Control de Carga:
              </label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Estiba asegurada con fajas, precinto colocado correctamente..."
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
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Validando Carga...</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Aprobar Carga y Habilitar Salida</span>
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
