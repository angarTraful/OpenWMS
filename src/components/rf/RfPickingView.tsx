import React, { useState, useEffect } from 'react';
import {
  ArrowUpFromLine,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Box,
  ChevronRight,
  PackageCheck,
  Truck,
  ScanBarcode,
  ArrowLeft,
  AlertCircle,
  FileText,
  UserCheck,
  Check,
  Sparkles,
  Info,
} from 'lucide-react';
import { rfApi, type RfPickingTask } from '../../api/rfApi';
import { RfScannerInput } from './RfScannerInput';
import { rfSoundService } from '../../lib/rfSoundService';
import { formatNumber } from '@/lib/utils';

interface RfPickingViewProps {
  almacenId: string;
  operarioNombre: string;
  onBack: () => void;
  triggerFlash: (type: 'success' | 'error') => void;
}

export const RfPickingView: React.FC<RfPickingViewProps> = ({
  almacenId,
  operarioNombre,
  onBack,
  triggerFlash,
}) => {
  const [tasks, setTasks] = useState<RfPickingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number | null>(null);

  // Sub-pasos guiados: 'verificar_ubicacion' -> 'verificar_articulo' -> 'confirmar_cantidad'
  const [pickStep, setPickStep] = useState<
    'verificar_ubicacion' | 'verificar_articulo' | 'confirmar_cantidad'
  >('verificar_ubicacion');
  const [cantRecolectada, setCantRecolectada] = useState<number>(1);
  const [motivoFaltante, setMotivoFaltante] = useState<string>('Faltante físico en estante');
  const [detalleFaltante, setDetalleFaltante] = useState<string>('');

  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const cargarTareas = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await rfApi.obtenerTareasPickingPendientes(almacenId);
      setTasks(data || []);
      if (data && data.length > 0 && currentTaskIndex !== null && currentTaskIndex >= data.length) {
        setCurrentTaskIndex(0);
      }
    } catch (err: any) {
      console.error('Error cargando picking:', err);
      setErrorMsg('Error al consultar tareas de picking.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTareas();
  }, [almacenId]);

  const activeTask: RfPickingTask | null =
    currentTaskIndex !== null && tasks[currentTaskIndex] ? tasks[currentTaskIndex] : null;

  // Iniciar tarea
  const startTask = (index: number) => {
    const t = tasks[index];
    if (!t) return;
    setCurrentTaskIndex(index);
    setPickStep('verificar_ubicacion');
    const pendiente = Math.max(1, t.cantidad_a_recolectar - (t.cantidad_recolectada || 0));
    setCantRecolectada(pendiente);
    setMotivoFaltante('Faltante físico en estante');
    setDetalleFaltante('');
    setErrorMsg(null);
    setSuccessMsg(null);
    rfSoundService.playBeep();
  };

  // Sub-paso 1: Escanear Ubicación Origen
  const handleScanUbicacion = (code: string) => {
    if (!activeTask) return;
    setErrorMsg(null);

    const expected = (activeTask.ubicacion_origen?.codigo_etiqueta || '').trim().toUpperCase();
    const scanned = code.trim().toUpperCase();

    if (expected && scanned === expected) {
      rfSoundService.playSuccess();
      triggerFlash('success');
      setPickStep('verificar_articulo');
    } else {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(`Ubicación incorrecta. Debe escanear "${expected || 'S/D'}", escaneó "${code}".`);
    }
  };

  // Sub-paso 2: Escanear SKU o Código de Barras del Artículo
  const handleScanArticulo = (code: string) => {
    if (!activeTask) return;
    setErrorMsg(null);

    const c = code.trim().toUpperCase();
    const skuExpected = (activeTask.articulo?.sku || '').trim().toUpperCase();
    const barcodeExpected = (activeTask.articulo?.codigo_barras || '').trim().toUpperCase();

    if ((skuExpected && c === skuExpected) || (barcodeExpected && c === barcodeExpected)) {
      rfSoundService.playSuccess();
      triggerFlash('success');
      setPickStep('confirmar_cantidad');
    } else {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(
        `Artículo incorrecto. Se esperaba SKU "${activeTask.articulo?.sku || 'S/D'}", escaneó "${code}".`
      );
    }
  };

  // Sub-paso 3: Confirmar Cantidad Recolectada
  const handleConfirmarCantidad = async () => {
    if (!activeTask) return;
    if (cantRecolectada < 0) {
      setErrorMsg('La cantidad recolectada no puede ser menor a 0.');
      return;
    }

    const cantidadRequerida =
      activeTask.cantidad_a_recolectar - (activeTask.cantidad_recolectada || 0);
    const hayFaltante = cantRecolectada < cantidadRequerida;

    let novedadText: string | undefined = undefined;
    if (hayFaltante) {
      novedadText = `${motivoFaltante}${detalleFaltante ? ` - ${detalleFaltante}` : ''}`;
    }

    setConfirming(true);
    setErrorMsg(null);
    try {
      await rfApi.confirmarPicking({
        tareaPickingId: activeTask.id,
        cantidadRecolectada: cantRecolectada,
        novedad: novedadText,
      });

      rfSoundService.playSuccess();
      triggerFlash('success');
      setSuccessMsg(
        hayFaltante
          ? `Pickeo registrado con novedad: ${cantRecolectada}/${cantidadRequerida} u. (${motivoFaltante})`
          : `¡Pickeo exitoso! ${cantRecolectada} u. de ${activeTask.articulo?.sku || 'ítem'} preparadas.`
      );

      // Pasar a la siguiente tarea o volver a lista
      await cargarTareas();
      setCurrentTaskIndex(null);
      setPickStep('verificar_ubicacion');
    } catch (err: any) {
      console.error('Error confirmando picking:', err);
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error confirmando picking en la base de datos.');
    } finally {
      setConfirming(false);
    }
  };

  const cantidadRequeridaActiva = activeTask
    ? activeTask.cantidad_a_recolectar - (activeTask.cantidad_recolectada || 0)
    : 0;
  const esFaltante = activeTask ? cantRecolectada < cantidadRequeridaActiva : false;

  return (
    <div className="space-y-4">
      {/* Barra Superior del Módulo de Picking */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#222222]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-[#0a2318] dark:text-[#69f0ae] dark:border-[#1b4d36] shadow-xs">
            <ArrowUpFromLine className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
                Picking Guiado RF
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#69f0ae]/15 dark:text-[#69f0ae] dark:border-[#69f0ae]/30">
                OUTBOUND
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-[#978d9d]">
              {tasks.length} {tasks.length === 1 ? 'parada pendiente' : 'paradas pendientes'} de recolección
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={cargarTareas}
            disabled={loading}
            title="Actualizar tareas de picking"
            className="p-2 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#191919] dark:hover:bg-[#252525] dark:text-[#cdc3d4] dark:border-[#333333] transition-colors shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600 dark:text-[#69f0ae]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Banners Informativos de Estado */}
      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-[#082217] dark:border-[#19563c] dark:text-[#69f0ae] text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="flex-1">{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-[10px] underline text-emerald-700 hover:text-emerald-900 dark:text-[#69f0ae]/70 dark:hover:text-[#69f0ae]"
          >
            Cerrar
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2a0e12] dark:border-[#690005] dark:text-[#ffb4ab] text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-[10px] underline text-rose-700 hover:text-rose-900 dark:text-[#ffb4ab]/70 dark:hover:text-[#ffb4ab]"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: Lista de Órdenes y Paradas de Picking Pendientes                 */}
      {/* ========================================================================= */}
      {!activeTask ? (
        <div className="space-y-4">
          {/* Barra de Búsqueda y Escaneo Rápido con Pistola Láser */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#273a30] bg-white dark:bg-[#101915]/90 space-y-2.5 shadow-xs">
            <RfScannerInput
              accentColor="green"
              label="Escanear Pedido, SKU o Ubicación"
              placeholder="Ej: PED-2026-0001, A1-P01-E01-N01, o SKU..."
              onScan={(scanned) => {
                const code = scanned.trim().toUpperCase();
                const idx = tasks.findIndex(
                  (t) =>
                    t.pedido?.numero_pedido?.toUpperCase() === code ||
                    t.articulo?.sku?.toUpperCase() === code ||
                    t.articulo?.codigo_barras?.toUpperCase() === code ||
                    t.ubicacion_origen?.codigo_etiqueta?.toUpperCase() === code
                );
                if (idx !== -1) {
                  startTask(idx);
                } else {
                  rfSoundService.playError();
                  triggerFlash('error');
                  setErrorMsg(`No se encontró parada de picking para el código "${scanned}".`);
                }
              }}
              sampleCodes={
                tasks
                  .slice(0, 6)
                  .map((t) => t.pedido?.numero_pedido || t.articulo?.sku || t.ubicacion_origen?.codigo_etiqueta)
                  .filter(Boolean) as string[]
              }
            />
          </div>

          {/* Grilla de Tareas / Paradas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4]">
              <span>Órdenes pendientes ({tasks.length}):</span>
              <span className="text-[10px] font-mono font-normal text-slate-400 dark:text-[#978d9d]">
                Ruta optimizada por pasillo
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#222222] rounded-xl space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 dark:text-[#69f0ae]" />
                <p className="font-semibold text-slate-800 dark:text-[#e5e2e1]">Cargando paradas de picking...</p>
                <p className="text-[11px] text-slate-400 dark:text-[#777777]">Sincronizando con base de datos del almacén</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#141414] border border-dashed border-slate-300 dark:border-[#333333] rounded-xl space-y-2">
                <PackageCheck className="w-8 h-8 mx-auto text-emerald-600/60 dark:text-[#69f0ae]/60" />
                <p className="font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">¡Sin tareas pendientes!</p>
                <p className="text-[11px] text-slate-400 dark:text-[#978d9d]">
                  No hay pedidos pendientes de recolección en este almacén.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {tasks.map((task, idx) => {
                  const pend = task.cantidad_a_recolectar - (task.cantidad_recolectada || 0);
                  const dest =
                    (task.pedido?.destinatario as any)?.razon_social ||
                    (task.pedido?.destinatario as any)?.razon_social_destinatario ||
                    'Cliente Final';
                  const rackEtiqueta = task.ubicacion_origen?.codigo_etiqueta || 'SIN ASIGNAR';

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => startTask(idx)}
                      className="w-full text-left p-3.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-[#23352c] dark:bg-[#0e1613] dark:hover:border-[#69f0ae] dark:hover:bg-[#14231d] transition-all flex items-center justify-between gap-3 group active:scale-[0.99] shadow-xs"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        {/* Cabecera de la Parada */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-black bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#69f0ae]/20 dark:text-[#69f0ae] dark:border-[#69f0ae]/40">
                            {task.pedido?.numero_pedido || 'Pedido'}
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 dark:text-[#a3f3cb] dark:bg-[#1a2d24] px-1.5 py-0.5 rounded">
                            Parada #{idx + 1}
                          </span>
                          {task.pedido?.cliente?.razon_social && (
                            <span className="text-[11px] text-slate-500 dark:text-[#978d9d] truncate">
                              &bull; {task.pedido.cliente.razon_social}
                            </span>
                          )}
                        </div>

                        {/* Artículo */}
                        <div className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] truncate flex items-center gap-1.5">
                          <Box className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae] shrink-0" />
                          <span>
                            {task.articulo?.sku || 'SKU'} &mdash; {task.articulo?.nombre || 'Artículo'}
                          </span>
                        </div>

                        {/* Metadatos y Cantidad */}
                        <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono flex items-center gap-2 flex-wrap">
                          <span>
                            Pickear:{' '}
                            <strong className="text-emerald-600 dark:text-[#69f0ae] font-bold text-xs">
                              {pend} {task.articulo?.unidad_medida || 'u.'}
                            </strong>
                          </span>
                          <span className="text-slate-300 dark:text-[#555555]">&bull;</span>
                          <span className="truncate max-w-[200px]" title={dest}>
                            Dest: <span className="text-slate-900 dark:text-[#e5e2e1] font-semibold">{dest}</span>
                          </span>
                        </div>
                      </div>

                      {/* Posición de Rack en Lateral */}
                      <div className="text-right shrink-0 pl-2 border-l border-slate-200 dark:border-[#1f2f27]">
                        <span className="text-[10px] text-slate-400 dark:text-[#978d9d] uppercase font-semibold block">
                          Rack
                        </span>
                        <span className="font-mono font-black text-xs text-sky-700 dark:text-[#75d1ff] block">
                          {rackEtiqueta}
                        </span>
                        <ChevronRight className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae] ml-auto mt-1.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VISTA 2: Flujo Guiado Paso a Paso para la Parada Activa                   */
        /* ========================================================================= */
        <div className="space-y-4 animate-fadeIn">
          {/* Barra de Navegación de la Tarea Activa */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#252525]">
            <button
              type="button"
              onClick={() => {
                if (confirming) return;
                setCurrentTaskIndex(null);
                setPickStep('verificar_ubicacion');
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-700 dark:text-[#cdc3d4] dark:hover:text-[#69f0ae] transition-colors py-1 px-2 rounded hover:bg-slate-100 dark:hover:bg-[#1a1a1a]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a la Lista</span>
            </button>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-500 dark:text-[#978d9d]">Parada</span>
              <span className="px-2 py-0.5 rounded font-black bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-[#69f0ae]/20 dark:text-[#69f0ae] dark:border-[#69f0ae]/30">
                #{(currentTaskIndex ?? 0) + 1} de {tasks.length}
              </span>
            </div>
          </div>

          {/* Stepper de Progreso (3 Pasos Claros) */}
          <div className="grid grid-cols-3 gap-2">
            {/* Paso 1 */}
            <div
              className={`p-2 rounded-lg border text-center transition-all ${
                pickStep === 'verificar_ubicacion'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500/50 dark:bg-[#0f281d] dark:border-[#69f0ae] dark:text-[#69f0ae] dark:ring-[#69f0ae]/50'
                  : 'bg-emerald-50/50 border-emerald-200 text-emerald-700 dark:bg-[#151c18] dark:border-[#223329] dark:text-[#69f0ae]/70'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold font-mono">
                {pickStep !== 'verificar_ubicacion' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d] flex items-center justify-center text-[9px] font-black">
                    1
                  </span>
                )}
                <span>1. Ubicación</span>
              </div>
            </div>

            {/* Paso 2 */}
            <div
              className={`p-2 rounded-lg border text-center transition-all ${
                pickStep === 'verificar_articulo'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500/50 dark:bg-[#0f281d] dark:border-[#69f0ae] dark:text-[#69f0ae] dark:ring-[#69f0ae]/50'
                  : pickStep === 'confirmar_cantidad'
                  ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700 dark:bg-[#151c18] dark:border-[#223329] dark:text-[#69f0ae]/70'
                  : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-[#141414] dark:border-[#252525] dark:text-[#666666]'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold font-mono">
                {pickStep === 'confirmar_cantidad' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                ) : (
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${
                      pickStep === 'verificar_articulo'
                        ? 'bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]'
                        : 'bg-slate-200 text-slate-600 dark:bg-[#2a2a2a] dark:text-[#777777]'
                    }`}
                  >
                    2
                  </span>
                )}
                <span>2. Artículo</span>
              </div>
            </div>

            {/* Paso 3 */}
            <div
              className={`p-2 rounded-lg border text-center transition-all ${
                pickStep === 'confirmar_cantidad'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500/50 dark:bg-[#0f281d] dark:border-[#69f0ae] dark:text-[#69f0ae] dark:ring-[#69f0ae]/50'
                  : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-[#141414] dark:border-[#252525] dark:text-[#666666]'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold font-mono">
                <span
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${
                    pickStep === 'confirmar_cantidad'
                      ? 'bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]'
                      : 'bg-slate-200 text-slate-600 dark:bg-[#2a2a2a] dark:text-[#777777]'
                  }`}
                >
                  3
                </span>
                <span>3. Cantidad</span>
              </div>
            </div>
          </div>

          {/* Tarjeta de Instrucción de la Parada (High Contrast) */}
          <div className="p-4 rounded-xl border-2 border-emerald-200 dark:border-[#274636] bg-emerald-50/40 dark:bg-[#0c1a14] space-y-3.5 shadow-xs">
            {/* Cabecera de la Orden */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-800 dark:text-[#69f0ae] font-bold">
                Pedido {activeTask.pedido?.numero_pedido || 'S/N'}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] truncate max-w-[200px]">
                {(activeTask.pedido?.destinatario as any)?.razon_social ||
                  (activeTask.pedido?.destinatario as any)?.razon_social_destinatario ||
                  'Cliente Final'}
              </span>
            </div>

            {/* Posición de Rack Gigante e Industrial */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#07140f] border-2 border-emerald-300 dark:border-[#1c553d] text-center space-y-1 shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-[#978d9d] flex items-center justify-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                <span>Ubicación en Almacén</span>
              </span>
              <div className="text-3xl font-black font-mono tracking-wider text-emerald-700 dark:text-[#69f0ae]">
                {activeTask.ubicacion_origen?.codigo_etiqueta || 'SIN ASIGNAR'}
              </div>
              <div className="text-xs text-slate-600 dark:text-[#cdc3d4] font-mono flex items-center justify-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 dark:bg-[#13261e] dark:border-[#254235]">
                  Pasillo: <strong className="text-slate-900 dark:text-[#e5e2e1]">{activeTask.ubicacion_origen?.pasillo || '-'}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 dark:bg-[#13261e] dark:border-[#254235]">
                  Estante: <strong className="text-slate-900 dark:text-[#e5e2e1]">{activeTask.ubicacion_origen?.estante || '-'}</strong>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 dark:bg-[#13261e] dark:border-[#254235]">
                  Nivel: <strong className="text-slate-900 dark:text-[#e5e2e1]">{activeTask.ubicacion_origen?.nivel || '-'}</strong>
                </span>
              </div>
            </div>

            {/* Datos del Artículo a Recolectar */}
            <div className="p-3 rounded-lg bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#273a30] flex items-center justify-between gap-3 shadow-xs">
              <div className="min-w-0 space-y-0.5">
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] uppercase font-bold block">
                  Artículo Solicitado
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] block truncate font-mono">
                  {activeTask.articulo?.sku || 'SKU'}
                </span>
                <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block truncate">
                  {activeTask.articulo?.nombre || 'Artículo sin nombre'}
                </span>
                {activeTask.lote?.numero_lote && (
                  <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200 dark:bg-[#75d1ff]/15 dark:text-[#75d1ff] dark:border-[#75d1ff]/30">
                    Lote: {activeTask.lote.numero_lote}
                  </span>
                )}
              </div>

              <div className="text-right shrink-0 pl-3 border-l border-slate-200 dark:border-[#252525]">
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] uppercase font-bold block">
                  A Recolectar
                </span>
                <span className="text-2xl font-black font-mono text-emerald-700 dark:text-[#69f0ae]">
                  {cantidadRequeridaActiva}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] block font-mono">
                  {activeTask.articulo?.unidad_medida || 'unidades'}
                </span>
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* PASO 1: Confirmar Ubicación Escaneando el Rack                          */}
          {/* ======================================================================= */}
          {pickStep === 'verificar_ubicacion' && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#223329] bg-white dark:bg-[#121a16] space-y-3 animate-fadeIn shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-[#69f0ae] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  <span>1. Confirme su presencia en el Rack</span>
                </span>
                <p className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                  Diríjase al rack{' '}
                  <strong className="text-emerald-700 dark:text-[#69f0ae] font-mono">
                    {activeTask.ubicacion_origen?.codigo_etiqueta}
                  </strong>{' '}
                  y escanee la etiqueta física de la ubicación con el lector láser.
                </p>
              </div>

              <RfScannerInput
                accentColor="green"
                label="Escanear Etiqueta de la Ubicación"
                placeholder={activeTask.ubicacion_origen?.codigo_etiqueta || 'A1-P01-E01-N01'}
                onScan={handleScanUbicacion}
                sampleCodes={[activeTask.ubicacion_origen?.codigo_etiqueta].filter(Boolean) as string[]}
              />
            </div>
          )}

          {/* ======================================================================= */}
          {/* PASO 2: Confirmar Artículo Escaneando SKU / Código de Barras            */}
          {/* ======================================================================= */}
          {pickStep === 'verificar_articulo' && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#223329] bg-white dark:bg-[#121a16] space-y-3 animate-fadeIn shadow-xs">
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800 dark:bg-[#092217] dark:border-[#1b4d36] dark:text-[#69f0ae] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Ubicación {activeTask.ubicacion_origen?.codigo_etiqueta} confirmada
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setPickStep('verificar_ubicacion')}
                  className="text-[10px] underline text-emerald-700 hover:text-emerald-900 dark:text-[#69f0ae]/80 dark:hover:text-[#69f0ae]"
                >
                  Cambiar
                </button>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-[#69f0ae] flex items-center gap-1.5">
                  <ScanBarcode className="w-4 h-4" />
                  <span>2. Escanear Código del Artículo</span>
                </span>
                <p className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
                  Tome el producto del estante y escanee su código de barras o código SKU{' '}
                  <strong className="text-slate-900 dark:text-[#e5e2e1] font-mono">{activeTask.articulo?.sku}</strong>.
                </p>
              </div>

              <RfScannerInput
                accentColor="green"
                label="Escanear Código de Barras o SKU"
                placeholder={`Escanear SKU ${activeTask.articulo?.sku}...`}
                onScan={handleScanArticulo}
                sampleCodes={
                  [activeTask.articulo?.sku, activeTask.articulo?.codigo_barras].filter(
                    Boolean
                  ) as string[]
                }
              />
            </div>
          )}

          {/* ======================================================================= */}
          {/* PASO 3: Confirmar Cantidad Recolectada & Novedades / Faltantes           */}
          {/* ======================================================================= */}
          {pickStep === 'confirmar_cantidad' && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#223329] bg-white dark:bg-[#121a16] space-y-4 animate-fadeIn shadow-xs">
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800 dark:bg-[#092217] dark:border-[#1b4d36] dark:text-[#69f0ae] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Artículo {activeTask.articulo?.sku} validado correctamente</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPickStep('verificar_articulo')}
                  className="text-[10px] underline text-emerald-700 hover:text-emerald-900 dark:text-[#69f0ae]/80 dark:hover:text-[#69f0ae]"
                >
                  Re-escanear
                </button>
              </div>

              {/* Selector de Cantidad Recolectada */}
              <div className="space-y-2">
                <label className="text-xs text-slate-700 dark:text-[#cdc3d4] block font-bold uppercase tracking-wider">
                  Cantidad recolectada:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCantRecolectada((prev) => Math.max(0, prev - 1))}
                    className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] dark:active:bg-[#2e2e2e] dark:text-[#e5e2e1] text-2xl font-bold border border-slate-300 dark:border-[#333333] transition-colors"
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min="0"
                    max={cantidadRequeridaActiva}
                    value={cantRecolectada}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCantRecolectada(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="flex-1 py-2.5 bg-slate-50 dark:bg-[#0a0a0a] border-2 border-emerald-500 rounded-xl text-center text-3xl font-mono font-black text-emerald-700 dark:text-[#69f0ae] outline-none shadow-inner"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setCantRecolectada((prev) =>
                        Math.min(cantidadRequeridaActiva, prev + 1)
                      )
                    }
                    className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] dark:active:bg-[#2e2e2e] dark:text-[#e5e2e1] text-2xl font-bold border border-slate-300 dark:border-[#333333] transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Atajos Rápidos de Cantidad */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => setCantRecolectada(cantidadRequeridaActiva)}
                    className={`px-3 py-1 rounded font-mono text-xs font-bold transition-all border ${
                      cantRecolectada === cantidadRequeridaActiva
                        ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-[#69f0ae] dark:text-[#00391d] dark:border-[#69f0ae]'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 dark:bg-[#1b1b1b] dark:text-[#cdc3d4] dark:border-[#333333] dark:hover:border-[#69f0ae]/50'
                    }`}
                  >
                    Recolectar Todo ({cantidadRequeridaActiva})
                  </button>

                  <button
                    type="button"
                    onClick={() => setCantRecolectada(0)}
                    className={`px-3 py-1 rounded font-mono text-xs font-bold transition-all border ${
                      cantRecolectada === 0
                        ? 'bg-rose-600 text-white border-rose-600 dark:bg-[#93000a] dark:text-[#ffdad6] dark:border-[#ba1a1a]'
                        : 'bg-slate-100 hover:bg-slate-200 text-rose-700 border-rose-200 dark:bg-[#1b1b1b] dark:text-[#ffb4ab] dark:border-[#333333] dark:hover:border-[#ba1a1a]/50'
                    }`}
                  >
                    Cero / Faltante Total
                  </button>
                </div>
              </div>

              {/* Sección de Discrepancia / Faltante Si no se recolecta el 100% */}
              {esFaltante && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-[#2a1708] border border-amber-200 dark:border-[#6b3c10] text-amber-900 dark:text-[#ffba28] space-y-2.5 animate-fadeIn">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-[#ffba28]" />
                    <span>
                      Diferencia Detectada: Faltan {cantidadRequeridaActiva - cantRecolectada}{' '}
                      {activeTask.articulo?.unidad_medida || 'unidades'}
                    </span>
                  </div>

                  <p className="text-[11px] text-amber-800 dark:text-[#e0cfbd]">
                    Seleccione el motivo del faltante. El sistema registrará la novedad y liberará
                    la reserva de inventario en Kardex.
                  </p>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {[
                      'Faltante físico en estante',
                      'Mercadería dañada / averiada',
                      'Lote o vencimiento incorrecto',
                      'Ubicación vacía',
                    ].map((motivo) => (
                      <button
                        key={motivo}
                        type="button"
                        onClick={() => setMotivoFaltante(motivo)}
                        className={`p-2 rounded text-[11px] text-left border transition-colors leading-tight ${
                          motivoFaltante === motivo
                            ? 'bg-amber-600 text-white font-bold border-amber-600 dark:bg-[#ffba28] dark:text-[#3e2600] dark:border-[#ffba28]'
                            : 'bg-white hover:bg-amber-100/60 text-amber-900 border-amber-200 dark:bg-[#1b1008] dark:text-[#e0cfbd] dark:border-[#4f2a0b] dark:hover:border-[#ffba28]/40'
                        }`}
                      >
                        {motivo}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={detalleFaltante}
                    onChange={(e) => setDetalleFaltante(e.target.value)}
                    placeholder="Detalle o nota adicional (opcional)..."
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#140c06] border border-amber-300 dark:border-[#5d300b] rounded text-xs text-slate-800 dark:text-[#ffdad6] placeholder:text-slate-400 dark:placeholder:text-[#886950] outline-none"
                  />
                </div>
              )}

              {/* Botón Principal de Confirmación */}
              <button
                type="button"
                onClick={handleConfirmarCantidad}
                disabled={confirming}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:active:bg-[#58d498] dark:text-[#00391d] font-black text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {confirming ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Confirmando Pickeo en Servidor...</span>
                  </>
                ) : (
                  <>
                    <PackageCheck className="w-5 h-5" />
                    <span>
                      {esFaltante
                        ? `Confirmar Picking Parcial (${cantRecolectada} u.)`
                        : `Confirmar Recolección Completa (${cantRecolectada} u.)`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
