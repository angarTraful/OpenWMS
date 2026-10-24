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
  Sliders,
  Warehouse,
  Plus,
  Trash2,
  Boxes,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { pedidosApi } from '@/api/pedidosApi';
import { usuariosApi, type Usuario } from '@/api/usuariosApi';
import { inventarioApi } from '@/api/inventarioApi';
import { lotesApi } from '@/api/lotesApi';
import { supabase } from '@/api/supabaseClient';
import { rfSoundService } from '@/lib/rfSoundService';

interface AsignacionPickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  onSuccess: (data: any) => void;
}

interface ManualAllocationItem {
  id: string; // ID temporal para el key en React
  loteId: string;
  ubicacionId: string;
  palletId?: string;
  cantidad: number;
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

  // Inventario disponible para el cliente y los artículos del pedido
  const [inventario, setInventario] = useState<any[]>([]);
  const [todosLotesCliente, setTodosLotesCliente] = useState<any[]>([]);
  const [todasUbicaciones, setTodasUbicaciones] = useState<any[]>([]);
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [isBorrarLoading, setIsBorrarLoading] = useState(false);

  // Modo de asignación por renglón ('auto' = FEFO/FIFO | 'manual' = Lote Hardcodeado)
  const [modoAsignacion, setModoAsignacion] = useState<Record<string, 'auto' | 'manual'>>({});
  // Asignaciones manuales por cada pedido_detalle_id
  const [manualAllocations, setManualAllocations] = useState<Record<string, ManualAllocationItem[]>>({});

  // Selected Roles
  const [operadorId, setOperadorId] = useState<string>('');
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [controllerId, setControllerId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar usuarios activos del sistema, inventario completo, lotes y ubicaciones
  useEffect(() => {
    if (!isOpen || !pedido) return;
    setErrorMsg(null);
    setLoadingUsuarios(true);
    setLoadingInventario(true);

    // 1. Cargar usuarios
    usuariosApi
      .listarUsuarios(true)
      .then((data) => {
        setUsuarios(data || []);

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

    // 2. Cargar inventario, catálogo completo de lotes del cliente y posiciones de rack
    if (pedido.cliente_id) {
      Promise.all([
        inventarioApi.consultarStock({ clienteId: pedido.cliente_id }),
        lotesApi.listarLotes({ clienteId: pedido.cliente_id }),
        supabase
          .from('ubicaciones')
          .select('id, codigo_etiqueta, pasillo, estante, nivel')
          .order('codigo_etiqueta'),
      ])
        .then(([stockData, lotesData, ubicData]) => {
          const rows = stockData || [];
          setInventario(rows);
          setTodosLotesCliente(lotesData || []);
          setTodasUbicaciones(ubicData?.data || []);

          // Inicializar modos por renglón
          const initialModos: Record<string, 'auto' | 'manual'> = {};
          const initialAllocations: Record<string, ManualAllocationItem[]> = {};

          (pedido.detalles || []).forEach((det: any) => {
            // Si el renglón ya venía con un lote_id preseleccionado desde el pedido, iniciar en manual
            if (det.lote_id) {
              initialModos[det.id] = 'manual';
              const stockItem = rows.find(
                (r: any) => r.articulo_id === det.articulo_id && r.lote_id === det.lote_id
              );
              initialAllocations[det.id] = [
                {
                  id: `alloc-${det.id}-0`,
                  loteId: det.lote_id,
                  ubicacionId: det.ubicacion_id || stockItem?.ubicacion_id || '',
                  palletId: stockItem?.pallet_id || undefined,
                  cantidad: Number(det.cantidad_solicitada || 1),
                },
              ];
            } else {
              initialModos[det.id] = 'auto';
            }
          });

          setModoAsignacion(initialModos);
          setManualAllocations(initialAllocations);
        })
        .catch((err) => {
          console.error('Error cargando inventario y lotes en modal:', err);
        })
        .finally(() => {
          setLoadingInventario(false);
        });
    }
  }, [isOpen, pedido]);

  // Borrar asignaciones existentes para arrancar de 0
  const handleBorrarAsignaciones = async () => {
    if (
      !window.confirm(
        `¿Deseas borrar todas las asignaciones y tareas de picking del pedido ${pedido.numero_pedido}?\n\n• Se cancelarán las tareas de picking.\n• Se liberará el stock reservado.\n• El pedido volverá a estado 'ingresado' para reasignar desde cero.`
      )
    ) {
      return;
    }

    setIsBorrarLoading(true);
    try {
      await pedidosApi.deshacerAsignacionPicking(pedido.id);
      rfSoundService.playSuccess();
      onSuccess({ exito: true, reset: true });
      onClose();
    } catch (err: any) {
      console.error('Error al deshacer asignaciones:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al deshacer asignaciones.');
    } finally {
      setIsBorrarLoading(false);
    }
  };

  // Clasificación de usuarios con capacidades de rol
  const { operadoresDisponibles, supervisoresDisponibles, controllersDisponibles } = useMemo(() => {
    const ops = usuarios.filter((u) =>
      u.roles?.some((r) => r.tipo_rol === 'operador' || r.tipo_rol === 'supervisor')
    );
    const sups = usuarios.filter((u) =>
      u.roles?.some((r) => r.tipo_rol === 'supervisor' || r.tipo_rol === 'admin')
    );
    const ctrls = usuarios.filter((u) =>
      u.roles?.some(
        (r) =>
          r.tipo_rol === 'supervisor' || r.tipo_rol === 'admin' || (r.tipo_rol as any) === 'controller'
      )
    );

    return {
      operadoresDisponibles: ops,
      supervisoresDisponibles: sups,
      controllersDisponibles: ctrls.length > 0 ? ctrls : sups,
    };
  }, [usuarios]);

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

  // Helpers de asignación manual de lotes
  const handleToggleModo = (detId: string, modo: 'auto' | 'manual', articuloId: string, cantSol: number) => {
    setModoAsignacion((prev) => ({ ...prev, [detId]: modo }));

    if (modo === 'manual' && (!manualAllocations[detId] || manualAllocations[detId].length === 0)) {
      // Encontrar primera opción disponible de inventario para este artículo
      const stockArt = inventario.filter((i) => i.articulo_id === articuloId);
      if (stockArt.length > 0) {
        const first = stockArt[0];
        setManualAllocations((prev) => ({
          ...prev,
          [detId]: [
            {
              id: `alloc-${detId}-${Date.now()}`,
              loteId: first.lote_id || '',
              ubicacionId: first.ubicacion_id || '',
              palletId: first.pallet_id || undefined,
              cantidad: Math.min(cantSol, Number(first.cantidad_disponible || cantSol)),
            },
          ],
        }));
      } else {
        setManualAllocations((prev) => ({
          ...prev,
          [detId]: [
            {
              id: `alloc-${detId}-${Date.now()}`,
              loteId: '',
              ubicacionId: '',
              cantidad: cantSol,
            },
          ],
        }));
      }
    }
  };

  const handleAddManualChunk = (detId: string, articuloId: string) => {
    const stockArt = inventario.filter((i) => i.articulo_id === articuloId);
    const first = stockArt[0];

    const currentItems = manualAllocations[detId] || [];
    const newItem: ManualAllocationItem = {
      id: `alloc-${detId}-${Date.now()}-${currentItems.length}`,
      loteId: first?.lote_id || '',
      ubicacionId: first?.ubicacion_id || '',
      palletId: first?.pallet_id || undefined,
      cantidad: 1,
    };

    setManualAllocations((prev) => ({
      ...prev,
      [detId]: [...currentItems, newItem],
    }));
  };

  const handleUpdateManualChunk = (
    detId: string,
    chunkId: string,
    field: keyof ManualAllocationItem,
    val: any
  ) => {
    setManualAllocations((prev) => {
      const items = (prev[detId] || []).map((it) => {
        if (it.id !== chunkId) return it;
        const updated = { ...it, [field]: val };

        // Si cambió el lote, auto-ajustar ubicación a la primera ubicación de ese lote
        if (field === 'loteId') {
          const matchUbic = inventario.find(
            (inv) => inv.articulo_id && (inv.lote_id || '') === val
          );
          if (matchUbic) {
            updated.ubicacionId = matchUbic.ubicacion_id || '';
            updated.palletId = matchUbic.pallet_id || undefined;
          }
        }
        return updated;
      });
      return { ...prev, [detId]: items };
    });
  };

  const handleRemoveManualChunk = (detId: string, chunkId: string) => {
    setManualAllocations((prev) => ({
      ...prev,
      [detId]: (prev[detId] || []).filter((it) => it.id !== chunkId),
    }));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido?.id) return;

    if (esMismoOperadorYSupervisor && !operadorTieneDobleRol) {
      setErrorMsg(
        `El usuario "${operadorSeleccionadoObj?.nombre_usuario}" no posee ambos roles (Operador y Supervisor). Para ejecutar ambas funciones simultáneamente, el usuario debe tener ambos roles asignados.`
      );
      return;
    }

    // Compilar asignaciones manuales hardcodeadas
    const asignacionesManualesParaRpc: any[] = [];
    Object.entries(manualAllocations).forEach(([detId, chunks]) => {
      if (modoAsignacion[detId] !== 'manual') return;
      const det = (pedido.detalles || []).find((d: any) => d.id === detId);
      if (!det) return;

      chunks.forEach((chunk) => {
        if (chunk.ubicacionId && chunk.cantidad > 0) {
          asignacionesManualesParaRpc.push({
            pedido_detalle_id: detId,
            articulo_id: det.articulo_id,
            lote_id: chunk.loteId || null,
            ubicacion_id: chunk.ubicacionId,
            pallet_id: chunk.palletId || null,
            cantidad: chunk.cantidad,
          });
        }
      });
    });

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
        asignacionesManuales:
          asignacionesManualesParaRpc.length > 0 ? asignacionesManualesParaRpc : undefined,
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
        <div className="relative w-full max-w-3xl bg-white dark:bg-[#181717] rounded-2xl border border-slate-200 dark:border-[#2f2e2e] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 dark:text-[#e5e2e1]">
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

            <div className="flex items-center gap-2">
              {(pedido.estado === 'asignado_picking' || pedido.estado === 'en_picking') && (
                <button
                  type="button"
                  onClick={handleBorrarAsignaciones}
                  disabled={isSubmitting || isBorrarLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#341014] dark:hover:bg-[#48171c] dark:text-[#ffb4ab] dark:border-[#690005] transition-colors shadow-xs"
                  title="Borrar las asignaciones y tareas de picking de este pedido, liberar reservas y arrancar de 0"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isBorrarLoading ? 'animate-spin' : ''}`} />
                  <span>Borrar Asignaciones (Arrancar de 0)</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting || isBorrarLoading}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#252424] dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
                <span>Estrategia Global de Rotación</span>
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
                    Prioriza el lote con fecha de vencimiento más próxima (First Expired, First Out).
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
                    Prioriza los pallets ingresados más antiguos (First In, First Out).
                  </p>
                </div>
              </div>
            </div>

            {/* SECCIÓN NUEVA: PLANIFICACIÓN DE LOTES Y TAREAS (AUTO vs LOTE HARDCODEADO) */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-[#2a2929]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Planificación de Tareas & Lotes por Renglón</span>
                </label>
                <span className="text-[10px] font-mono text-slate-500 dark:text-[#978d9d]">
                  {loadingInventario ? 'Consultando stock...' : 'Elegir Lote Hardcodeado o Auto'}
                </span>
              </div>

              <div className="space-y-3">
                {(pedido.detalles || []).map((det: any, idx: number) => {
                  const modo = modoAsignacion[det.id] || 'auto';
                  const chunks = manualAllocations[det.id] || [];
                  const sumaManual = chunks.reduce((acc, c) => acc + Number(c.cantidad || 0), 0);
                  const cantSol = Number(det.cantidad_solicitada || 0);

                  // Filtrar existencias de este artículo en inventario
                  const stockArt = inventario.filter((i) => i.articulo_id === det.articulo_id);

                  // Agrupar lotes disponibles para este artículo (todos los lotes del cliente + inventario)
                  const lotesMap = new Map<
                    string,
                    { lote_id: string; numero_lote: string; fecha_vencimiento: string | null; disponible: number }
                  >();

                  // 1. Registrar todos los lotes del cliente
                  todosLotesCliente.forEach((l) => {
                    lotesMap.set(l.id, {
                      lote_id: l.id,
                      numero_lote: l.numero_lote,
                      fecha_vencimiento: l.fecha_vencimiento || null,
                      disponible: 0,
                    });
                  });

                  // 2. Si el renglón viene con un lote preseleccionado
                  if (det.lote_id && !lotesMap.has(det.lote_id)) {
                    lotesMap.set(det.lote_id, {
                      lote_id: det.lote_id,
                      numero_lote: det.lote?.numero_lote || 'Lote Preseleccionado',
                      fecha_vencimiento: det.lote?.fecha_vencimiento || null,
                      disponible: 0,
                    });
                  }

                  // 3. Sumar existencias desde el inventario del artículo
                  stockArt.forEach((i) => {
                    const k = i.lote_id || 'sin_lote';
                    if (!lotesMap.has(k)) {
                      lotesMap.set(k, {
                        lote_id: i.lote_id || '',
                        numero_lote: i.lote?.numero_lote || (i.lote_id ? 'Lote Registrado' : 'Sin Lote / General'),
                        fecha_vencimiento: i.lote?.fecha_vencimiento || null,
                        disponible: 0,
                      });
                    }
                    let disp = Number(i.cantidad_disponible || 0);
                    // Si este pedido tiene tareas de picking para este lote, sumar la reserva propia
                    const tareasDelLote = (det.tareas_picking || []).filter((t: any) => t.lote_id === i.lote_id);
                    const cantTareas = tareasDelLote.reduce((acc: number, t: any) => acc + Number(t.cantidad_a_recolectar || 0), 0);
                    disp += cantTareas;
                    lotesMap.get(k)!.disponible += disp;
                  });
                  const lotesDisponibles = Array.from(lotesMap.values());

                  return (
                    <div
                      key={det.id || idx}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-[#2d2d2d] bg-slate-50/50 dark:bg-[#151414] space-y-3"
                    >
                      {/* Cabecera del Renglón */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                              {det.articulo?.sku || 'SKU'}
                            </span>
                            <span className="text-xs font-bold text-slate-800 dark:text-[#e5e2e1]">
                              {det.articulo?.nombre || 'Artículo'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Solicitado: <b>{cantSol} un.</b> • Stock disponible: <b>{stockArt.reduce((a, b) => a + Number(b.cantidad_disponible || 0), 0)} un.</b>
                          </div>
                        </div>

                        {/* Switch Modo: Auto vs Lote Hardcodeado */}
                        <div className="flex items-center gap-1 bg-slate-200 dark:bg-[#202020] p-1 rounded-lg self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => handleToggleModo(det.id, 'auto', det.articulo_id, cantSol)}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                              modo === 'auto'
                                ? 'bg-white dark:bg-[#111] text-violet-700 dark:text-[#dab9ff] shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            ✨ Auto ({estrategia})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleModo(det.id, 'manual', det.articulo_id, cantSol)}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                              modo === 'manual'
                                ? 'bg-amber-400 text-black shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            🎯 Lote Hardcodeado
                          </button>
                        </div>
                      </div>

                      {/* Configuración Manual de Lote y Ubicación */}
                      {modo === 'manual' && (
                        <div className="pt-2.5 border-t border-slate-200 dark:border-[#262626] space-y-2.5 animate-fadeIn">
                          {chunks.map((chunk, chunkIdx) => {
                            // Ubicaciones correspondientes al lote elegido en este chunk
                            const matchUbic = stockArt.filter((i) =>
                              chunk.loteId ? (i.lote_id || '') === chunk.loteId : true
                            );
                            const ubicacionesDelLote = matchUbic.length > 0
                              ? matchUbic.map((inv) => ({
                                  id: inv.id,
                                  ubicacion_id: inv.ubicacion_id,
                                  codigo_etiqueta: inv.ubicacion?.codigo_etiqueta || 'Posición',
                                  pallet_lpn: inv.pallet?.codigo_lpn || null,
                                  cantidad_disponible: Number(inv.cantidad_disponible || 0),
                                }))
                              : todasUbicaciones.map((u) => ({
                                  id: u.id,
                                  ubicacion_id: u.id,
                                  codigo_etiqueta: u.codigo_etiqueta || 'Posición',
                                  pallet_lpn: null,
                                  cantidad_disponible: 0,
                                }));

                            const ubicSeleccionadaObj = ubicacionesDelLote.find(
                              (u) => u.ubicacion_id === chunk.ubicacionId
                            );
                            const dispEnUbic = Number(ubicSeleccionadaObj?.cantidad_disponible || 0);

                            return (
                              <div
                                key={chunk.id}
                                className="p-2.5 rounded-lg bg-white dark:bg-[#1a1919] border border-amber-500/30 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                              >
                                {/* 1. Selector de Lote */}
                                <div className="sm:col-span-5">
                                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#978d9d] block mb-0.5">
                                    Lote de Origen:
                                  </label>
                                  <select
                                    value={chunk.loteId}
                                    onChange={(e) =>
                                      handleUpdateManualChunk(det.id, chunk.id, 'loteId', e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#111] border border-slate-300 dark:border-[#383838] text-[11px] font-mono text-slate-800 dark:text-[#e5e2e1] outline-none focus:border-amber-500"
                                  >
                                    <option value="">-- Seleccionar Lote --</option>
                                    {lotesDisponibles.map((l) => (
                                      <option key={l.lote_id || 'sin_lote'} value={l.lote_id}>
                                        {l.numero_lote} {l.fecha_vencimiento ? `(Vto: ${l.fecha_vencimiento.slice(0, 10)})` : ''} — {l.disponible > 0 ? `Disp: ${l.disponible} un.` : '(Sin existencias en rack)'}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* 2. Selector de Ubicación */}
                                <div className="sm:col-span-4">
                                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#978d9d] block mb-0.5">
                                    Ubicación / Posición:
                                  </label>
                                  <select
                                    value={chunk.ubicacionId}
                                    onChange={(e) =>
                                      handleUpdateManualChunk(det.id, chunk.id, 'ubicacionId', e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#111] border border-slate-300 dark:border-[#383838] text-[11px] font-mono text-slate-800 dark:text-[#e5e2e1] outline-none focus:border-sky-500"
                                  >
                                    <option value="">-- Posición --</option>
                                    {ubicacionesDelLote.map((u) => (
                                      <option key={u.id} value={u.ubicacion_id}>
                                        Pos: {u.codigo_etiqueta || 'N/A'} {u.pallet_lpn ? `[PL: ${u.pallet_lpn}]` : ''} ({u.cantidad_disponible} un.)
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* 3. Cantidad */}
                                <div className="sm:col-span-2">
                                  <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#978d9d] block mb-0.5">
                                    Cant. a Extraer:
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={dispEnUbic || cantSol}
                                    value={chunk.cantidad}
                                    onChange={(e) =>
                                      handleUpdateManualChunk(
                                        det.id,
                                        chunk.id,
                                        'cantidad',
                                        Math.max(1, parseInt(e.target.value) || 1)
                                      )
                                    }
                                    className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#111] border border-slate-300 dark:border-[#383838] text-[11px] font-mono font-bold text-center text-slate-800 dark:text-[#e5e2e1] outline-none focus:border-amber-500"
                                  />
                                </div>

                                {/* 4. Eliminar Chunk */}
                                <div className="sm:col-span-1 text-right sm:text-center pt-2 sm:pt-4">
                                  {chunks.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveManualChunk(det.id, chunk.id)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-500"
                                      title="Eliminar línea de lote"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Botón Agregar División & Estado de Cobertura */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                            <button
                              type="button"
                              onClick={() => handleAddManualChunk(det.id, det.articulo_id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>+ Dividir en otro Lote / Posición</span>
                            </button>

                            <div className="text-[11px] font-mono">
                              <span>Asignado: <b>{sumaManual}</b> / {cantSol} un.</span>
                              {sumaManual < cantSol && (
                                <span className="ml-2 text-violet-600 dark:text-[#dab9ff]">
                                  (Saldo de {cantSol - sumaManual} un. completará vía {estrategia})
                                </span>
                              )}
                              {sumaManual === cantSol && (
                                <span className="ml-2 text-emerald-600 dark:text-[#69f0ae] font-bold">
                                  ✓ Cubierto 100%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ASIGNACIÓN DE ROLES OPERATIVOS */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-[#2a2929]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Asignación de Usuarios para Picking y Control</span>
                </label>
                <span className="text-[10px] font-mono text-slate-500 dark:text-[#978d9d]">
                  {loadingUsuarios ? 'Cargando usuarios...' : `${usuarios.length} usuarios activos`}
                </span>
              </div>

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
                      const tieneDoble =
                        u.roles?.some((r) => r.tipo_rol === 'operador') &&
                        u.roles?.some((r) => r.tipo_rol === 'supervisor');
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
            <div className="pt-4 border-t border-slate-200 dark:border-[#2a2929] flex items-center justify-between gap-3">
              {(pedido.estado === 'asignado_picking' || pedido.estado === 'en_picking') ? (
                <button
                  type="button"
                  onClick={handleBorrarAsignaciones}
                  disabled={isSubmitting || isBorrarLoading}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 dark:bg-[#341014] dark:hover:bg-[#48171c] dark:text-[#ffb4ab] dark:border-[#690005] font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isBorrarLoading ? 'animate-spin' : ''}`} />
                  <span>Borrar Asignaciones (Arrancar de 0)</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting || isBorrarLoading}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#3b3a3a] text-slate-700 dark:text-[#cdc3d4] text-xs font-bold hover:bg-slate-100 dark:hover:bg-[#252424] transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || isBorrarLoading}
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
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
