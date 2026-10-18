import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  PackageCheck,
  Search,
  Check,
  Layers,
  FileCheck,
  Sparkles,
  ClipboardCheck,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { pedidosApi } from '@/api/pedidosApi';
import { rfSoundService } from '@/lib/rfSoundService';
import { usuariosApi, type Usuario } from '@/api/usuariosApi';

interface ControlMuestreoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  onSuccess: () => void;
}

export const ControlMuestreoModal: React.FC<ControlMuestreoModalProps> = ({
  isOpen,
  onClose,
  pedido,
  onSuccess,
}) => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [controllerUsuario, setControllerUsuario] = useState('');
  const [resultado, setResultado] = useState<'conforme' | 'con_observacion'>('conforme');
  const [observaciones, setObservaciones] = useState('');
  const [itemsAuditados, setItemsAuditados] = useState<Record<string, boolean>>({});
  const [cantidadesContadas, setCantidadesContadas] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detalles = pedido?.detalles || [];

  // Al abrir, precargar usuarios y seleccionar un muestreo sugerido
  useEffect(() => {
    if (!isOpen || !pedido) return;
    setErrorMsg(null);
    setObservaciones('');
    setResultado('conforme');

    // Muestreo automático sugerido: marcar los primeros items o el 50%
    const auditMap: Record<string, boolean> = {};
    const countMap: Record<string, number> = {};
    detalles.forEach((d: any, idx: number) => {
      // Muestrear al menos 1 artículo, o la mitad de los ítems
      if (idx === 0 || idx % 2 === 0) {
        auditMap[d.id] = true;
      }
      const total = Number(d.cantidad_solicitada || 1);
      // Muestra sugerida reducida si hay poco tiempo (ej. 5 un. o el total)
      countMap[d.id] = Math.min(5, total);
    });
    setItemsAuditados(auditMap);
    setCantidadesContadas(countMap);

    usuariosApi
      .listarUsuarios(true)
      .then((users) => {
        setUsuarios(users || []);
        const ctrl = users.find((u) =>
          u.roles?.some((r) => r.tipo_rol === 'supervisor' || r.tipo_rol === 'admin' || (r.tipo_rol as any) === 'controller')
        ) || users[0];
        if (ctrl) setControllerUsuario(ctrl.nombre_usuario);
      })
      .catch((err) => {
        console.warn('Aviso cargando usuarios para muestreo:', err);
      });
  }, [isOpen, pedido]);

  const toggleItemAudit = (detalleId: string) => {
    setItemsAuditados((prev) => ({
      ...prev,
      [detalleId]: !prev[detalleId],
    }));
  };

  const seleccionarTodos = () => {
    const all: Record<string, boolean> = {};
    detalles.forEach((d: any) => {
      all[d.id] = true;
    });
    setItemsAuditados(all);
  };

  const cantAuditados = Object.values(itemsAuditados).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido?.id) return;
    if (cantAuditados === 0) {
      setErrorMsg('Debe verificar al menos 1 artículo en la muestra de expedición.');
      return;
    }
    if (!controllerUsuario.trim()) {
      setErrorMsg('Debe especificar el Controller o Supervisor que firma la auditoría.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const resumenAuditado = detalles
        .filter((d: any) => itemsAuditados[d.id])
        .map((d: any) => `${d.articulo?.sku || 'SKU'}: ${cantidadesContadas[d.id] || 1}/${d.cantidad_solicitada} un.`)
        .join(', ');

      const obsFinal = `${observaciones.trim() ? `${observaciones.trim()} - ` : ''}[Muestra física: ${resumenAuditado}]`;

      await pedidosApi.registrarControlMuestreo({
        pedidoId: pedido.id,
        usuario: controllerUsuario.trim(),
        resultado,
        observaciones: obsFinal,
        itemsMuestreados: cantAuditados,
      });

      rfSoundService.playSuccess();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error registrando control de muestreo:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al asentar el control de expedición.');
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
          <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2a2929] bg-gradient-to-r from-emerald-50 to-teal-50/50 dark:from-[#112a1d] dark:to-[#0c1e15] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d] flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                  Control por Muestreo en Expediciones
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
                  Pedido {pedido.numero_pedido} • Zona de Expedición y Pre-Embarque
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

            {/* Checklist de Parámetros de Calidad */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#2a2a2a] space-y-2">
              <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
                Criterios de Inspección Física (Bahía de Despacho):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Embalaje y film stretch sin roturas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Lote y vencimiento legibles en bulto</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Cantidad física coincide con picking</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Rótulo LPN o identificador de pallet adherido</span>
                </div>
              </div>
            </div>

            {/* Grilla de Artículos para Marcar Muestreo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                  <span>Muestra de Artículos Inspeccionados ({cantAuditados} de {detalles.length}):</span>
                </span>
                <button
                  type="button"
                  onClick={seleccionarTodos}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-[#69f0ae] underline"
                >
                  Inspeccionar 100%
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-[#2a2a2a] divide-y divide-slate-100 dark:divide-[#252525]">
                {detalles.map((det: any) => {
                  const isChecked = !!itemsAuditados[det.id];
                  const art = det.articulo || {};
                  return (
                    <div
                      key={det.id}
                      onClick={() => toggleItemAudit(det.id)}
                      className={`p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-emerald-50/50 dark:bg-[#133222]/30'
                          : 'hover:bg-slate-50 dark:hover:bg-[#181818]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
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
                          <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                            {art.sku || 'SKU'}
                          </span>{' '}
                          <span className="text-slate-600 dark:text-[#cdc3d4]">
                            {art.nombre || 'Artículo'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isChecked && (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-semibold">
                              Cant. a contar:
                            </span>
                            <input
                              type="number"
                              min="1"
                              max={det.cantidad_solicitada || 9999}
                              value={cantidadesContadas[det.id] || 1}
                              onChange={(e) => {
                                const val = Math.max(1, Math.min(Number(e.target.value) || 1, Number(det.cantidad_solicitada || 1)));
                                setCantidadesContadas((prev) => ({
                                  ...prev,
                                  [det.id]: val,
                                }));
                              }}
                              className="w-16 px-2 py-1 text-center font-mono font-bold text-xs rounded border border-emerald-300 dark:border-[#225735] bg-white dark:bg-[#131313] text-emerald-800 dark:text-[#69f0ae] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <span className="text-[10px] text-slate-400 font-mono">
                              / {det.cantidad_solicitada}
                            </span>
                          </div>
                        )}

                        {!isChecked && (
                          <div className="text-right font-mono font-bold text-slate-800 dark:text-[#e5e2e1]">
                            {det.cantidad_solicitada} {art.unidad_medida || 'un.'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resultado de la Auditoría */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                  Dictamen del Control:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResultado('conforme')}
                    className={`flex-1 py-2 px-3 rounded-xl border text-center font-bold transition-all ${
                      resultado === 'conforme'
                        ? 'border-emerald-600 bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]'
                        : 'border-slate-300 dark:border-[#3a3939] text-slate-600 dark:text-[#cdc3d4]'
                    }`}
                  >
                    ✓ Aprobado Conforme
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultado('con_observacion')}
                    className={`flex-1 py-2 px-3 rounded-xl border text-center font-bold transition-all ${
                      resultado === 'con_observacion'
                        ? 'border-amber-600 bg-amber-600 text-white dark:bg-[#ffba28] dark:text-[#3e2e00]'
                        : 'border-slate-300 dark:border-[#3a3939] text-slate-600 dark:text-[#cdc3d4]'
                    }`}
                  >
                    ⚠️ Con Observación
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                  Controller / Supervisor Firmante:
                </label>
                <input
                  type="text"
                  value={controllerUsuario}
                  onChange={(e) => setControllerUsuario(e.target.value)}
                  placeholder="Nombre del auditor..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                  list="usuarios-list"
                />
                <datalist id="usuarios-list">
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.nombre_usuario} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Observaciones adicionales */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                Observaciones del Muestreo (Opcional):
              </label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Pallet reacondicionado, bultos y precintos verificados OK..."
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
                    <span>Guardando Control...</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Aprobar Control de Expedición</span>
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
