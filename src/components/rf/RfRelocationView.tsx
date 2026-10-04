import React, { useState } from 'react';
import {
  Layers,
  ArrowRightLeft,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Box,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { rfApi, type RfInquiryResult } from '../../api/rfApi';
import { RfScannerInput } from './RfScannerInput';
import { rfSoundService } from '../../lib/rfSoundService';
import { formatM3, formatNumber } from '@/lib/utils';

interface RfRelocationViewProps {
  almacenId: string;
  operarioNombre: string;
  triggerFlash: (type: 'success' | 'error') => void;
}

export const RfRelocationView: React.FC<RfRelocationViewProps> = ({
  almacenId,
  operarioNombre,
  triggerFlash,
}) => {
  const [mode, setMode] = useState<'pallet' | 'parcial'>('pallet');

  // Estado para Pallet Completo
  const [scannedPallet, setScannedPallet] = useState<any | null>(null);

  // Estado para Parcial
  const [originLocation, setOriginLocation] = useState<any | null>(null);
  const [selectedInvItem, setSelectedInvItem] = useState<any | null>(null);
  const [cantMover, setCantMover] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Escaneo del Pallet LPN a reubicar
  const handleScanPallet = async (code: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await rfApi.consultaLibre(code, almacenId);
      if (res && res.encontrado && res.tipo === 'pallet') {
        rfSoundService.playSuccess();
        triggerFlash('success');
        setScannedPallet(res.pallet);
      } else {
        rfSoundService.playError();
        triggerFlash('error');
        setErrorMsg(`"${code}" no es un Pallet LPN válido en el sistema.`);
      }
    } catch (err: any) {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error al consultar pallet.');
    } finally {
      setLoading(false);
    }
  };

  // Escaneo de Ubicación Destino para Pallet Completo
  const handleScanDestinoPallet = async (code: string) => {
    if (!scannedPallet) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const uDest = await rfApi.buscarUbicacionPorEtiqueta(code, almacenId);
      if (!uDest) {
        rfSoundService.playError();
        triggerFlash('error');
        setErrorMsg(`La ubicación destino "${code}" no existe.`);
        setLoading(false);
        return;
      }

      await rfApi.reubicarStock({
        palletId: scannedPallet.id,
        ubicacionDestinoId: uDest.id,
        usuarioNombre: operarioNombre,
      });

      rfSoundService.playSuccess();
      triggerFlash('success');
      setSuccessMsg(`¡Pallet ${scannedPallet.codigo_lpn} transferido con éxito a ${uDest.codigo_etiqueta}!`);
      setScannedPallet(null);
    } catch (err: any) {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error al reubicar pallet.');
    } finally {
      setLoading(false);
    }
  };

  // Modo Parcial: Escaneo de Ubicación Origen
  const handleScanOrigenParcial = async (code: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await rfApi.consultaLibre(code, almacenId);
      if (res && res.encontrado && res.tipo === 'ubicacion') {
        rfSoundService.playSuccess();
        triggerFlash('success');
        setOriginLocation(res.ubicacion);
        setSelectedInvItem(null);
      } else {
        rfSoundService.playError();
        triggerFlash('error');
        setErrorMsg(`"${code}" no es una ubicación válida.`);
      }
    } catch (err: any) {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error consultando ubicación.');
    } finally {
      setLoading(false);
    }
  };

  // Modo Parcial: Confirmar Destino
  const handleScanDestinoParcial = async (code: string) => {
    if (!selectedInvItem) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const uDest = await rfApi.buscarUbicacionPorEtiqueta(code, almacenId);
      if (!uDest) {
        rfSoundService.playError();
        triggerFlash('error');
        setErrorMsg(`La ubicación destino "${code}" no existe.`);
        setLoading(false);
        return;
      }

      await rfApi.reubicarStock({
        inventarioId: selectedInvItem.inventario_id,
        ubicacionDestinoId: uDest.id,
        cantidadMover: cantMover,
        usuarioNombre: operarioNombre,
      });

      rfSoundService.playSuccess();
      triggerFlash('success');
      setSuccessMsg(`¡Se transfirieron ${cantMover} bultos a ${uDest.codigo_etiqueta}!`);
      setSelectedInvItem(null);
      setOriginLocation(null);
    } catch (err: any) {
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error al reubicar bultos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-[#333333]">
        <div className="p-2 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 dark:bg-[#201330] dark:text-[#dab9ff] dark:border-[#4b4452]">
          <ArrowRightLeft className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
            Reubicación Interna entre Racks
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
            Transferencias físicas de stock en depósito
          </span>
        </div>
      </div>

      {/* Selector de Modo: Pallet Completo vs Bultos Parciales */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-[#161616] border border-slate-200 dark:border-[#333333]">
        <button
          type="button"
          onClick={() => {
            setMode('pallet');
            setScannedPallet(null);
            setOriginLocation(null);
            setSelectedInvItem(null);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mode === 'pallet'
              ? 'bg-violet-600 text-white shadow-xs dark:bg-[#dab9ff] dark:text-[#460283] dark:shadow-md'
              : 'text-slate-600 hover:text-slate-900 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Pallet LPN Completo</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode('parcial');
            setScannedPallet(null);
            setOriginLocation(null);
            setSelectedInvItem(null);
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-2 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mode === 'parcial'
              ? 'bg-violet-600 text-white shadow-xs dark:bg-[#dab9ff] dark:text-[#460283] dark:shadow-md'
              : 'text-slate-600 hover:text-slate-900 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]'
          }`}
        >
          <Box className="w-4 h-4" />
          <span>Bultos Parciales</span>
        </button>
      </div>

      {/* Banners */}
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

      {/* ============================================================== */}
      {/* FLUJO A: REUBICAR PALLET LPN COMPLETO                          */}
      {/* ============================================================== */}
      {mode === 'pallet' && (
        <div className="space-y-4">
          {!scannedPallet ? (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-violet-700 dark:text-[#dab9ff]">
                Paso 1: Escanear Pallet LPN a Mover
              </span>
              <RfScannerInput
                label="Escanear Código del Pallet LPN"
                placeholder="Ej: PLT-2026-000001"
                onScan={handleScanPallet}
                sampleCodes={['PLT-2026-000001', 'PLT-2026-000002']}
                disabled={loading}
              />
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl border-2 border-violet-300 dark:border-[#dab9ff] bg-violet-50/50 dark:bg-[#1a1424] space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase font-bold text-violet-700 dark:text-[#dab9ff]">
                    Pallet Seleccionado
                  </span>
                  <button
                    type="button"
                    onClick={() => setScannedPallet(null)}
                    className="text-xs text-slate-500 hover:text-rose-600 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] underline"
                  >
                    Cambiar
                  </button>
                </div>
                <div className="text-xl font-black font-mono text-violet-700 dark:text-[#dab9ff]">
                  {scannedPallet.codigo_lpn}
                </div>
                <div className="text-xs text-slate-600 dark:text-[#cdc3d4] font-mono">
                  Cliente: <strong className="text-slate-900 dark:text-[#e5e2e1]">{scannedPallet.cliente_razon_social}</strong> &bull; {formatM3(scannedPallet.volumen_total_m3)}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-[#69f0ae]">
                  Paso 2: Escanear Nueva Ubicación Destino
                </span>
                <RfScannerInput
                  label="Escanear Etiqueta de Rack Destino"
                  placeholder="Ej: A1-P03-E02-N01"
                  onScan={handleScanDestinoPallet}
                  sampleCodes={['A1-P01-E02-N02', 'A1-P02-E01-N01']}
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* FLUJO B: TRANSFERENCIA PARCIAL DE BULTOS                       */}
      {/* ============================================================== */}
      {mode === 'parcial' && (
        <div className="space-y-4">
          {!originLocation ? (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-violet-700 dark:text-[#dab9ff]">
                Paso 1: Escanear Ubicación Origen
              </span>
              <RfScannerInput
                label="Escanear Código de Ubicación Origen"
                placeholder="Ej: A1-P01-E01-N01"
                onScan={handleScanOrigenParcial}
                sampleCodes={['A1-P01-E01-N01', 'A1-P01-E02-N01']}
                disabled={loading}
              />
            </div>
          ) : !selectedInvItem ? (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4]">
                  Origen: <strong className="font-mono text-violet-700 dark:text-[#dab9ff]">{originLocation.codigo_etiqueta}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setOriginLocation(null)}
                  className="text-xs text-slate-500 hover:text-rose-600 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] underline"
                >
                  Cambiar Ubicación
                </button>
              </div>

              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
                Seleccione el artículo a transferir:
              </span>

              {/* Botón de fallback para pruebas de selección */}
              <button
                type="button"
                onClick={() => {
                  setSelectedInvItem({
                    inventario_id: 'test-item',
                    sku: 'BEV-JUG-001',
                    nombre: 'Jugo de Naranja 1L',
                    cantidad_disponible: 20,
                  });
                  setCantMover(5);
                }}
                className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] hover:border-violet-400 dark:hover:border-[#dab9ff] hover:bg-violet-50/40 dark:hover:bg-[#201f1f] text-xs space-y-1 shadow-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold text-violet-700 dark:text-[#dab9ff]">BEV-JUG-001</span>
                  <span className="font-bold text-emerald-600 dark:text-[#69f0ae]">20 bultos disponibles</span>
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-[#e5e2e1]">Jugo de Naranja 1L (Caja x 12)</div>
                <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4]">Haga clic para transferir bultos de este ítem</div>
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-[#cdc3d4]">Artículo a Mover:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedInvItem(null)}
                    className="text-slate-500 hover:text-rose-600 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] underline"
                  >
                    Cambiar
                  </button>
                </div>
                <div className="font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">{selectedInvItem.sku} - {selectedInvItem.nombre}</div>

                <div>
                  <label className="text-xs text-slate-700 dark:text-[#cdc3d4] block mb-1 font-semibold">
                    Cantidad de bultos a transferir:
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCantMover((prev) => Math.max(1, prev - 1))}
                      className="w-10 h-10 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#201f1f] text-slate-800 dark:text-[#e5e2e1] font-bold border border-slate-200 dark:border-[#333333]"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={selectedInvItem.cantidad_disponible}
                      value={cantMover}
                      onChange={(e) => setCantMover(Number(e.target.value))}
                      className="flex-1 py-2 bg-slate-50 dark:bg-[#131313] border border-violet-400 dark:border-[#dab9ff] rounded text-center text-xl font-mono font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCantMover((prev) => Math.min(selectedInvItem.cantidad_disponible, prev + 1))}
                      className="w-10 h-10 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#201f1f] text-slate-800 dark:text-[#e5e2e1] font-bold border border-slate-200 dark:border-[#333333]"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
                <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-[#69f0ae]">
                  Paso Final: Escanear Ubicación Destino
                </span>
                <RfScannerInput
                  label="Escanear Etiqueta de Rack Destino"
                  placeholder="Ej: A1-P02-E01-N03"
                  onScan={handleScanDestinoParcial}
                  sampleCodes={['A1-P01-E02-N01', 'A1-P02-E01-N02']}
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
