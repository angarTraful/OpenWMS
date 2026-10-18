import React, { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Users,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Sparkles,
  Calendar,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { pedidosApi } from '@/api/pedidosApi';
import { usuariosApi, type Usuario } from '@/api/usuariosApi';
import { rfSoundService } from '@/lib/rfSoundService';

interface AsignacionPickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  onSuccess: (data: any) => void;
}

export const AsignacionPickingModal: React.FC<AsignacionPickingModalProps> = ({
  isOpen,
  onClose,
  pedido,
  onSuccess,
}) => {
  const [estrategia, setEstrategia] = useState<'FEFO' | 'FIFO'>('FEFO');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // Selected Roles
  const [operadorId, setOperadorId] = useState<string>('');
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [controllerId, setControllerId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar usuarios activos del sistema
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setLoadingUsuarios(true);

    usuariosApi
      .listarUsuarios(true)
      .then((data) => {
        setUsuarios(data || []);

        // Auto-seleccionar primer operador y supervisor disponibles
        const ops = (data || []).filter((u) =>
          u.roles?.some((r) => r.tipo_rol === 'operador' || r.tipo_rol === 'supervisor')
        );
        const sups = (data || []).filter((u) =>
          u.roles?.some((r) => r.tipo_rol === 'supervisor' || r.tipo_rol === 'admin')
        );

        if (ops.length > 0) setOperadorId(ops[0].id);
        if (sups.length > 0) setSupervisorId(sups[0].id);
        if (sups.length > 0) setControllerId(sups[0].id);
      })
      .catch((err) => {
        console.error('Error cargando usuarios para picking:', err);
      })
      .finally(() => {
        setLoadingUsuarios(false);
      });
  }, [isOpen]);

  // Clasificación de usuarios con capacidades de rol
  const { operadoresDisponibles, supervisoresDisponibles, controllersDisponibles } = useMemo(() => {
    const ops = usuarios.filter((u) =>
      u.roles?.some((r) => r.tipo_rol === 'operador' || r.tipo_rol === 'supervisor')
    );
    const sups = usuarios.filter((u) =>
      u.roles?.some((r) => r.tipo_rol === 'supervisor' || r.tipo_rol === 'admin')
    );
    const ctrls = usuarios.filter((u) =>
      u.roles?.some((r) => r.tipo_rol === 'supervisor' || r.tipo_rol === 'admin' || (r.tipo_rol as any) === 'controller')
    );

    return {
      operadoresDisponibles: ops,
      supervisoresDisponibles: sups,
      controllersDisponibles: ctrls.length > 0 ? ctrls : sups,
    };
  }, [usuarios]);

  // Verificar si el operador seleccionado tiene doble rol (Operador + Supervisor)
  const operadorSeleccionadoObj = usuarios.find((u) => u.id === operadorId);
  const supervisorSeleccionadoObj = usuarios.find((u) => u.id === supervisorId);
  const controllerSeleccionadoObj = usuarios.find((u) => u.id === controllerId);

  const operadorTieneDobleRol = useMemo(() => {
    if (!operadorSeleccionadoObj?.roles) return false;
    const tieneOp = operadorSeleccionadoObj.roles.some((r) => r.tipo_rol === 'operador');
    const tieneSup = operadorSeleccionadoObj.roles.some((r) => r.tipo_rol === 'supervisor');
    return tieneOp && tieneSup;
  }, [operadorSeleccionadoObj]);

  const esMismoOperadorYSupervisor = operadorId && supervisorId && operadorId === supervisorId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido?.id) return;

    // Validación de regla de negocio: Si el usuario realiza ambas tareas (operador y supervisor), debe contar con ambos roles
    if (esMismoOperadorYSupervisor && !operadorTieneDobleRol) {
      setErrorMsg(
        `El usuario "${operadorSeleccionadoObj?.nombre_usuario}" no posee ambos roles (Operador y Supervisor). Para ejecutar ambas funciones simultáneamente, el usuario debe tener ambos roles asignados.`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res: any = await pedidosApi.asignarPickingConEstrategia({
        pedidoId: pedido.id,
        estrategia,
        operadorId: operadorId || undefined,
        supervisorId: supervisorId || undefined,
        controllerId: controllerId || undefined,
        operadorNombre: operadorSeleccionadoObj?.nombre_usuario,
        supervisorNombre: supervisorSeleccionadoObj?.nombre_usuario,
        controllerNombre: controllerSeleccionadoObj?.nombre_usuario,
      });

      if (res && res.exito === false) {
        rfSoundService.playError();
        setErrorMsg(res.mensaje || 'No hay existencias disponibles para reservar este pedido.');
      } else {
        rfSoundService.playSuccess();
        onSuccess(res);
        onClose();
      }
    } catch (err: any) {
      console.error('Error al asignar picking con estrategia:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al ejecutar alocación y asignación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !pedido) return null;

  const totalLineas = pedido.detalles?.length || 0;
  const totalUnidades = (pedido.detalles || []).reduce(
    (acc: number, d: any) => acc + Number(d.cantidad_solicitada || 0),
    0
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-fadeIn">
        <div className="relative w-full max-w-2xl bg-white dark:bg-[#181717] rounded-2xl border border-slate-200 dark:border-[#2f2e2e] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2a2929] bg-gradient-to-r from-violet-50 to-indigo-50/50 dark:from-[#241334] dark:to-[#171322] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] flex items-center justify-center shadow-xs">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                  Alocación y Asignación de Picking
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
                  Pedido {pedido.numero_pedido} • {pedido.cliente?.razon_social} ({totalLineas} art. / {totalUnidades} un.)
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

          <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2b0d12] dark:border-[#6b0914] dark:text-[#ffb4ab] text-xs font-bold flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* SELECCIÓN DE ESTRATEGIA: FEFO vs FIFO */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                <span>Estrategia de Rotación de Stock</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opción FEFO */}
                <div
                  onClick={() => setEstrategia('FEFO')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    estrategia === 'FEFO'
                      ? 'border-violet-600 bg-violet-50/70 dark:border-[#dab9ff] dark:bg-[#dab9ff]/10 shadow-xs'
                      : 'border-slate-200 dark:border-[#2f2e2e] bg-slate-50 dark:bg-[#121212] hover:border-slate-300 dark:hover:border-[#444]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-violet-600 dark:bg-[#dab9ff]" />
                      FEFO (Vencimiento)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-200 text-violet-900 dark:bg-[#dab9ff]/30 dark:text-[#dab9ff]">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-[#cdc3d4] mt-1.5 leading-relaxed">
                    Prioriza el lote con fecha de vencimiento más próxima (First Expired, First Out). Ideal para productos perecederos, alimentos y farmacia.
                  </p>
                </div>

                {/* Opción FIFO */}
                <div
                  onClick={() => setEstrategia('FIFO')}
                  className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    estrategia === 'FIFO'
                      ? 'border-sky-600 bg-sky-50/70 dark:border-[#75d1ff] dark:bg-[#75d1ff]/10 shadow-xs'
                      : 'border-slate-200 dark:border-[#2f2e2e] bg-slate-50 dark:bg-[#121212] hover:border-slate-300 dark:hover:border-[#444]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-600 dark:bg-[#75d1ff]" />
                      FIFO (Antigüedad)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-200 text-sky-900 dark:bg-[#75d1ff]/30 dark:text-[#75d1ff]">
                      Ingreso
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-[#cdc3d4] mt-1.5 leading-relaxed">
                    Prioriza los pallets o existencias ingresadas más antiguas (First In, First Out). Ideal para mercadería industrial, retail o sin caducidad crítica.
                  </p>
                </div>
              </div>
            </div>

            {/* ASIGNACIÓN DE ROLES OPERATIVOS */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#2a2929]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Asignación de Usuarios para Picking y Control</span>
                </label>
                <span className="text-[10px] font-mono text-slate-500 dark:text-[#978d9d]">
                  {loadingUsuarios ? 'Cargando usuarios...' : `${usuarios.length} usuarios activos`}
                </span>
              </div>

              {/* Informative alert sobre doble rol */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131212] border border-slate-200 dark:border-[#2b2a2a] text-[11px] text-slate-600 dark:text-[#cdc3d4] flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 text-violet-600 dark:text-[#dab9ff] mt-0.5" />
                <span>
                  <b>Regla Operativa:</b> Si un mismo usuario desempeña las tareas de Operador y Supervisor al mismo tiempo, el sistema valida que posea formalmente ambos roles asignados.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. OPERADOR */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                    <span>Operador (Picker):</span>
                  </label>
                  <select
                    value={operadorId}
                    onChange={(e) => setOperadorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-xs font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 outline-none"
                  >
                    <option value="">-- Sin asignar --</option>
                    {operadoresDisponibles.map((u) => {
                      const tieneDoble = u.roles?.some((r) => r.tipo_rol === 'operador') && u.roles?.some((r) => r.tipo_rol === 'supervisor');
                      return (
                        <option key={u.id} value={u.id}>
                          {u.nombre_usuario} {tieneDoble ? '⭐ (Op + Sup)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {operadorTieneDobleRol && (
                    <span className="text-[10px] text-emerald-600 dark:text-[#69f0ae] font-bold block">
                      ✓ Habilitado para doble tarea
                    </span>
                  )}
                </div>

                {/* 2. SUPERVISOR */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff]" />
                    <span>Supervisor Logístico:</span>
                  </label>
                  <select
                    value={supervisorId}
                    onChange={(e) => setSupervisorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-xs font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-sky-500 outline-none"
                  >
                    <option value="">-- Sin asignar --</option>
                    {supervisoresDisponibles.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre_usuario}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. CONTROLLER */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                    <span>Controller / Calidad:</span>
                  </label>
                  <select
                    value={controllerId}
                    onChange={(e) => setControllerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-xs font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-emerald-500 outline-none"
                  >
                    <option value="">-- Sin asignar --</option>
                    {controllersDisponibles.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre_usuario}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-200 dark:border-[#2a2929] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#3b3a3a] text-slate-700 dark:text-[#cdc3d4] text-xs font-bold hover:bg-slate-100 dark:hover:bg-[#252424] transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Reservando Stock...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Ejecutar Picking ({estrategia})</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
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
