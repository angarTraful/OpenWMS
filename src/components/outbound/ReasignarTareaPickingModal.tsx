import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Sliders,
  ArrowRight,
  Warehouse,
  RotateCcw,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { inventarioApi } from '@/api/inventarioApi';
import { lotesApi } from '@/api/lotesApi';
import { pedidosApi } from '@/api/pedidosApi';
import { supabase } from '@/api/supabaseClient';
import { rfSoundService } from '@/lib/rfSoundService';

interface ReasignarTareaPickingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tarea: any;
  clienteId?: string;
  onSuccess: () => void;
}

export const ReasignarTareaPickingModal: React.FC<ReasignarTareaPickingModalProps> = ({
  isOpen,
  onClose,
  tarea,
  clienteId,
  onSuccess,
}) => {
  const [inventario, setInventario] = useState<any[]>([]);
  const [todosLotesCliente, setTodosLotesCliente] = useState<any[]>([]);
  const [todasUbicaciones, setTodasUbicaciones] = useState<any[]>([]);
  const [loadingInventario, setLoadingInventario] = useState(false);

  const [selectedLoteId, setSelectedLoteId] = useState<string>('');
  const [selectedUbicacionId, setSelectedUbicacionId] = useState<string>('');
  const [cantidad, setCantidad] = useState<number>(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar inventario, lotes registrados del cliente y posiciones del almacén
  useEffect(() => {
    if (!isOpen || !tarea?.articulo_id) return;
    setErrorMsg(null);
    setLoadingInventario(true);
    setCantidad(Number(tarea.cantidad_a_recolectar || 1));

    const targetClienteId = clienteId || tarea.pedido?.cliente_id || tarea.cliente_id;

    Promise.all([
      // 1. Stock en inventario para este artículo (sin descartar los reservados)
      inventarioApi.consultarStock({
        clienteId: targetClienteId,
        articuloId: tarea.articulo_id,
      }),
      // 2. Todos los lotes del cliente desde lotes_cliente
      targetClienteId ? lotesApi.listarLotes({ clienteId: targetClienteId }) : Promise.resolve([]),
      // 3. Catálogo de ubicaciones de rack del almacén
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

        // Preseleccionar lote actual de la tarea o el primer disponible
        const currentLote = tarea.lote_id || (rows.length > 0 ? rows[0].lote_id : '');
        setSelectedLoteId(currentLote || '');

        const currentUbic = tarea.ubicacion_origen_id || (rows.length > 0 ? rows[0].ubicacion_id : '');
        setSelectedUbicacionId(currentUbic || '');
      })
      .catch((err) => {
        console.error('Error cargando existencias y lotes para reasignación:', err);
        setErrorMsg('Error cargando existencias y catálogo de lotes.');
      })
      .finally(() => {
        setLoadingInventario(false);
      });
  }, [isOpen, tarea, clienteId]);

  // Agrupar todos los lotes posibles (lotes_cliente + inventario + tarea actual)
  const lotesDisponibles = useMemo(() => {
    const map = new Map<
      string,
      { lote_id: string; numero_lote: string; fecha_vencimiento: string | null; disponible: number }
    >();

    // 1. Registrar todos los lotes del cliente de la base de datos
    todosLotesCliente.forEach((l) => {
      map.set(l.id, {
        lote_id: l.id,
        numero_lote: l.numero_lote,
        fecha_vencimiento: l.fecha_vencimiento || null,
        disponible: 0,
      });
    });

    // 2. Si la tarea ya viene con un lote asignado, asegurar que esté presente
    if (tarea?.lote_id && !map.has(tarea.lote_id)) {
      map.set(tarea.lote_id, {
        lote_id: tarea.lote_id,
        numero_lote: tarea.lote?.numero_lote || 'Lote Actual',
        fecha_vencimiento: tarea.lote?.fecha_vencimiento || null,
        disponible: 0,
      });
    }

    // 3. Sumar existencias desde el inventario del artículo
    inventario.forEach((item) => {
      const k = item.lote_id || 'sin_lote';
      if (!map.has(k)) {
        map.set(k, {
          lote_id: item.lote_id || '',
          numero_lote: item.lote?.numero_lote || (item.lote_id ? 'Lote Registrado' : 'Sin Lote / General'),
          fecha_vencimiento: item.lote?.fecha_vencimiento || null,
          disponible: 0,
        });
      }
      let disp = Number(item.cantidad_disponible || 0);
      // Si este item es el lote y ubicación origen de la tarea actual, sumar la reserva propia de la tarea
      if (item.lote_id === tarea?.lote_id && item.ubicacion_id === tarea?.ubicacion_origen_id) {
        disp += Number(tarea?.cantidad_a_recolectar || 0);
      }
      map.get(k)!.disponible += disp;
    });

    return Array.from(map.values());
  }, [todosLotesCliente, inventario, tarea]);

  // Ubicaciones correspondientes al lote elegido
  const ubicacionesDisponibles = useMemo(() => {
    const matchesInventario = inventario.filter((item) => {
      if (selectedLoteId) {
        return (item.lote_id || '') === selectedLoteId;
      }
      return true;
    });

    if (matchesInventario.length > 0) {
      return matchesInventario.map((inv) => {
        let disp = Number(inv.cantidad_disponible || 0);
        if (inv.lote_id === tarea?.lote_id && inv.ubicacion_id === tarea?.ubicacion_origen_id) {
          disp += Number(tarea?.cantidad_a_recolectar || 0);
        }
        return {
          id: inv.id,
          ubicacion_id: inv.ubicacion_id,
          codigo_etiqueta: inv.ubicacion?.codigo_etiqueta || 'Posición',
          pallet_lpn: inv.pallet?.codigo_lpn || null,
          disponible: disp,
          esDeInventario: true,
        };
      });
    }

    // Si el lote no tiene inventario con stock registrado en rack, permitir elegir entre las ubicaciones del almacén
    return todasUbicaciones.map((u) => ({
      id: u.id,
      ubicacion_id: u.id,
      codigo_etiqueta: u.codigo_etiqueta,
      pallet_lpn: null,
      disponible: 0,
      esDeInventario: false,
    }));
  }, [inventario, selectedLoteId, todasUbicaciones, tarea]);

  // Cuando cambia el lote, ajustar la ubicación por defecto
  const handleLoteChange = (loteId: string) => {
    setSelectedLoteId(loteId);
    const ubicacionesDelLote = inventario.filter((i) => (i.lote_id || '') === loteId);
    if (ubicacionesDelLote.length > 0) {
      setSelectedUbicacionId(ubicacionesDelLote[0].ubicacion_id || '');
    } else if (todasUbicaciones.length > 0) {
      setSelectedUbicacionId(todasUbicaciones[0].id || '');
    } else {
      setSelectedUbicacionId('');
    }
  };

  const ubicacionSeleccionadaObj = useMemo(() => {
    return ubicacionesDisponibles.find((u) => u.ubicacion_id === selectedUbicacionId);
  }, [ubicacionesDisponibles, selectedUbicacionId]);

  const maxDisponible = ubicacionSeleccionadaObj ? ubicacionSeleccionadaObj.disponible : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tarea?.id || !selectedUbicacionId) {
      setErrorMsg('Debes seleccionar un lote y una ubicación física válida.');
      return;
    }

    if (cantidad <= 0) {
      setErrorMsg('La cantidad a recolectar debe ser mayor a 0.');
      return;
    }

    if (cantidad > maxDisponible && maxDisponible > 0) {
      setErrorMsg(
        `La cantidad seleccionada (${cantidad} un.) supera el stock disponible en esta posición (${maxDisponible} un.).`
      );
      return;
    }

    if (maxDisponible <= 0) {
      const continuar = window.confirm(
        `La posición física seleccionada no registra existencias disponibles en el rack (0 un.). ¿Deseas reasignar la tarea de picking con este lote de todos modos?`
      );
      if (!continuar) return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await pedidosApi.reasignarTareaPicking({
        tareaPickingId: tarea.id,
        nuevoLoteId: selectedLoteId || tarea.articulo_id, // fallback lote
        nuevaUbicacionId: selectedUbicacionId,
        nuevaCantidad: cantidad,
      });

      rfSoundService.playSuccess();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error reasignando tarea de picking:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al reasignar lote y ubicación.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !tarea) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-fadeIn">
        <div className="relative w-full max-w-lg bg-white dark:bg-[#181717] rounded-2xl border border-slate-200 dark:border-[#2f2e2e] shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2a2929] bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-[#2e1d0d] dark:to-[#1a120b] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center shadow-xs">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                  Reasignar Lote / Ubicación de Tarea
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
                  Tarea #{tarea.id?.slice(0, 8)} • {tarea.articulo?.nombre || 'Artículo'}
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

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2b0d12] dark:border-[#6b0914] dark:text-[#ffb4ab] text-xs font-bold flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Asignación Actual */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#2d2d2d] text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Asignación Actual (Origen):
              </span>
              <div className="flex items-center justify-between font-mono">
                <span>
                  Cant: <b>{tarea.cantidad_a_recolectar} un.</b>
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  Lote: {tarea.lote?.numero_lote || 'Sin Lote'}
                </span>
                <span className="text-sky-600 dark:text-[#75d1ff]">
                  Pos: {tarea.ubicacion_origen?.codigo_etiqueta || 'N/A'}
                </span>
              </div>
            </div>

            {loadingInventario ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                <span>Consultando existencias de lotes disponibles...</span>
              </div>
            ) : lotesDisponibles.length === 0 ? (
              <div className="p-4 text-center text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-xl border border-amber-500/20">
                No hay lotes registrados para este cliente ni existencias en almacén.
              </div>
            ) : (
              <>
                {/* 1. Selector de Nuevo Lote */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    <span>Nuevo Lote Físico (Hardcodeado):</span>
                  </label>
                  <select
                    value={selectedLoteId}
                    onChange={(e) => handleLoteChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-amber-500 outline-none"
                  >
                    <option value="">-- Seleccionar Lote --</option>
                    {lotesDisponibles.map((l) => (
                      <option key={l.lote_id || 'sin_lote'} value={l.lote_id}>
                        Lote: {l.numero_lote} {l.fecha_vencimiento ? `(Vto: ${l.fecha_vencimiento.slice(0, 10)})` : ''} — {l.disponible > 0 ? `Disp: ${l.disponible} un.` : '(Sin existencias en rack / 0 un.)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Selector de Nueva Ubicación Física */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                    <Warehouse className="w-3.5 h-3.5 text-sky-500" />
                    <span>Nueva Ubicación / Posición de Rack:</span>
                  </label>
                  <select
                    value={selectedUbicacionId}
                    onChange={(e) => setSelectedUbicacionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-sky-500 outline-none"
                  >
                    <option value="">-- Posición en Rack --</option>
                    {ubicacionesDisponibles.map((u) => (
                      <option key={u.id} value={u.ubicacion_id}>
                        Pos: {u.codigo_etiqueta || 'N/A'} {u.pallet_lpn ? `(Pallet: ${u.pallet_lpn})` : ''} — Disp: {u.disponible} un.
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Cantidad a Recolectar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Cantidad a Extraer:</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      Stock en posición: <b>{maxDisponible}</b> un.
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-emerald-500 outline-none text-center"
                  />
                </div>
              </>
            )}

            {/* Footer Buttons */}
            <div className="pt-4 border-t border-slate-200 dark:border-[#2a2929] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#3b3a3a] text-slate-700 dark:text-[#cdc3d4] text-xs font-bold hover:bg-slate-100 dark:hover:bg-[#252424] transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting || inventario.length === 0}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Reasignando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Reasignación</span>
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
