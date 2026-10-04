import React, { useState, useEffect } from 'react';
import {
  ArrowDownToLine,
  Box,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  ChevronRight,
  Sparkles,
  Calendar,
  Building2,
} from 'lucide-react';
import { rfApi, type RfPutawayTask } from '../../api/rfApi';
import { RfScannerInput } from './RfScannerInput';
import { rfSoundService } from '../../lib/rfSoundService';
import { formatM3, formatNumber, formatDate } from '@/lib/utils';

interface RfPutawayViewProps {
  almacenId: string;
  operarioNombre: string;
  onBack: () => void;
  triggerFlash: (type: 'success' | 'error') => void;
}

export const RfPutawayView: React.FC<RfPutawayViewProps> = ({
  almacenId,
  operarioNombre,
  onBack,
  triggerFlash,
}) => {
  const [tasks, setTasks] = useState<RfPutawayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<RfPutawayTask | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const cargarTareas = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await rfApi.obtenerTareasPutawayPendientes(almacenId);
      setTasks(data || []);
    } catch (err: any) {
      console.error('Error cargando tareas putaway:', err);
      setErrorMsg('Error al consultar tareas de guardado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTareas();
  }, [almacenId]);

  // Escaneo del Pallet LPN en el Paso 1
  const handleScanLpn = (scannedCode: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const code = scannedCode.trim().toUpperCase();

    // Buscar tarea que coincida con Número de Recepción, LPN, SKU o ID
    const matched = tasks.find(
      (t) =>
        t.recepcion?.numero_recepcion?.toUpperCase() === code ||
        t.pallet?.codigo_lpn?.toUpperCase() === code ||
        t.articulo?.sku?.toUpperCase() === code ||
        t.id.toUpperCase() === code
    );

    if (matched) {
      rfSoundService.playSuccess();
      triggerFlash('success');
      setSelectedTask(matched);
    } else {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(`No se encontró orden o pallet de guardado pendiente para "${scannedCode}".`);
    }
  };

  // Escaneo de Ubicación Destino en el Paso 2
  const handleScanUbicacion = async (scannedCode: string) => {
    if (!selectedTask) return;
    setErrorMsg(null);
    setConfirming(true);

    try {
      // Buscar ubicación física por código de etiqueta
      const ubicacion = await rfApi.buscarUbicacionPorEtiqueta(scannedCode, almacenId);

      if (!ubicacion) {
        rfSoundService.playError();
        triggerFlash('error');
        setErrorMsg(`La etiqueta de ubicación "${scannedCode}" no existe en este almacén.`);
        setConfirming(false);
        return;
      }

      if (ubicacion.estado === 'bloqueada') {
        rfSoundService.playError();
        triggerFlash('error');
        setErrorMsg(`La ubicación "${ubicacion.codigo_etiqueta}" está bloqueada.`);
        setConfirming(false);
        return;
      }

      // Confirmar guardado
      await rfApi.confirmarPutaway({
        tareaId: selectedTask.id,
        cantidadRecibida: selectedTask.cantidad_esperada,
        codigoLpn: selectedTask.pallet?.codigo_lpn,
        ubicacionDestinoId: ubicacion.id,
      });

      rfSoundService.playSuccess();
      triggerFlash('success');
      setSuccessMsg(
        `¡Pallet ${selectedTask.pallet?.codigo_lpn || 'LPN'} almacenado con éxito en ${ubicacion.codigo_etiqueta}!`
      );
      setSelectedTask(null);
      await cargarTareas();
    } catch (err: any) {
      console.error('Error confirmando guardado:', err);
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error al confirmar guardado en el servidor.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de Título del Módulo */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#333333]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-violet-100 text-violet-700 border border-violet-200 dark:bg-[#201330] dark:text-[#dab9ff] dark:border-[#4b4452]">
            <ArrowDownToLine className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
              Guardado / Putaway RF
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
              {tasks.length} pallets/tareas pendientes
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={cargarTareas}
          disabled={loading}
          className="p-2 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] dark:text-[#cdc3d4] dark:border-[#333333] shadow-xs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Banner de Éxito / Error */}
      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-[#0f241a] dark:border-[#1d4d38] dark:text-[#69f0ae] text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2a0e12] dark:border-[#690005] dark:text-[#ffb4ab] text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* PASO 1: Escanear Pallet LPN */}
      {!selectedTask ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
            <span className="text-[10px] font-mono uppercase tracking-widest text-violet-700 dark:text-[#dab9ff] font-bold block">
              Paso 1 de 2
            </span>
            <RfScannerInput
              label="Escanear Orden de Recepción, LPN o SKU"
              placeholder="Ej: REC-2026-0002 o PLT-2026-000001"
              onScan={handleScanLpn}
              sampleCodes={
                tasks
                  .slice(0, 4)
                  .map((t) => t.recepcion?.numero_recepcion || t.pallet?.codigo_lpn || t.articulo?.sku)
                  .filter(Boolean) as string[]
              }
            />
          </div>

          {/* Lista de Tareas Pendientes en Muelle */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
              O seleccionar orden / pallet de la lista ({tasks.length}):
            </span>

            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-[#cdc3d4]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-600 dark:text-[#dab9ff]" />
                <span>Cargando órdenes y tareas de guardado...</span>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#1c1b1b] border border-dashed border-slate-300 dark:border-[#333333] rounded-lg">
                No hay órdenes ni pallets pendientes de guardado en este almacén.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      rfSoundService.playBeep();
                      setSelectedTask(task);
                    }}
                    className="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/40 dark:border-[#333333] dark:bg-[#1c1b1b] dark:hover:border-[#dab9ff] dark:hover:bg-[#201f1f] transition-all flex items-center justify-between gap-3 group active:scale-[0.98] shadow-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-100 text-violet-700 border border-violet-200 dark:bg-[#dab9ff]/20 dark:text-[#dab9ff] dark:border-[#dab9ff]/30">
                          {task.recepcion?.numero_recepcion || 'Orden Recepción'}
                        </span>
                        {task.pallet?.codigo_lpn ? (
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">
                            {task.pallet.codigo_lpn}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono">
                            Muelle Inbound
                          </span>
                        )}
                        {task.recepcion?.cliente?.razon_social && (
                          <span className="text-[10px] text-slate-600 dark:text-[#cdc3d4] truncate">
                            &bull; {task.recepcion.cliente.razon_social}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-[#e5e2e1] truncate">
                        {task.articulo?.sku} - {task.articulo?.nombre}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] flex items-center gap-2 font-mono">
                        <span>Bultos: <strong className="text-emerald-600 dark:text-[#69f0ae]">{task.cantidad_esperada}</strong></span>
                        {task.lote?.numero_lote && <span>Lote: <strong>{task.lote.numero_lote}</strong></span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block">Sugerida</span>
                      <span className="font-mono font-bold text-xs text-sky-600 dark:text-[#75d1ff]">
                        {task.ubicacion_sugerida?.codigo_etiqueta || 'Muelle'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-[#cdc3d4] ml-auto mt-1 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* PASO 2: Confirmar Ubicación de Rack */
        <div className="space-y-4 animate-fadeIn">
          {/* Ficha Resumen del Pallet en Mano */}
          <div className="p-4 rounded-xl border-2 border-violet-300 dark:border-[#dab9ff] bg-violet-50/50 dark:bg-[#1a1424] space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-violet-700 dark:text-[#dab9ff] font-bold">
                Paso 2 de 2 &bull; Confirmar Guardado en Rack
              </span>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="text-xs text-slate-500 hover:text-rose-600 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] underline"
              >
                Cambiar Pallet
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-violet-200 dark:border-[#4b4452] pb-2">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block">Pallet LPN</span>
                <span className="text-base font-black font-mono text-violet-700 dark:text-[#dab9ff]">
                  {selectedTask.pallet?.codigo_lpn || 'PLT-AUTOMÁTICO'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block">Bultos a Guardar</span>
                <span className="text-base font-black font-mono text-emerald-600 dark:text-[#69f0ae]">
                  {selectedTask.cantidad_esperada}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-800 dark:text-[#e5e2e1] space-y-0.5">
              <div className="font-bold">{selectedTask.articulo?.sku} - {selectedTask.articulo?.nombre}</div>
              <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] flex items-center gap-3 font-mono">
                {selectedTask.lote?.numero_lote && <span>Lote: <strong>{selectedTask.lote.numero_lote}</strong></span>}
                {selectedTask.lote?.fecha_vencimiento && <span>Vto: <strong>{formatDate(selectedTask.lote.fecha_vencimiento)}</strong></span>}
              </div>
            </div>

            {/* Cartel Gigante de Ubicación Sugerida */}
            <div className="p-3 rounded-lg bg-white dark:bg-[#201330] border border-violet-200 dark:border-[#635378] text-center space-y-1 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-[#cdc3d4] flex items-center justify-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                <span>Ubicación Física Sugerida en Rack</span>
              </span>
              <div className="text-2xl font-black font-mono tracking-wider text-violet-700 dark:text-[#dab9ff]">
                {selectedTask.ubicacion_sugerida?.codigo_etiqueta || 'SIN ASIGNAR'}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block">
                Acérquese a la posición y escanee el código de barra del rack
              </span>
            </div>
          </div>

          {/* Input de Escaneo de la Ubicación de Rack */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
            <RfScannerInput
              label="Escanear Etiqueta de Ubicación Rack"
              placeholder="Ej: A1-P02-E01-N03"
              disabled={confirming}
              onScan={handleScanUbicacion}
              sampleCodes={
                selectedTask.ubicacion_sugerida?.codigo_etiqueta
                  ? [selectedTask.ubicacion_sugerida.codigo_etiqueta]
                  : []
              }
            />

            {confirming && (
              <div className="p-3 text-center text-xs font-semibold text-violet-700 dark:text-[#dab9ff] flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Confirmando guardado en rack...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
