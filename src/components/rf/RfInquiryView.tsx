import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Layers,
  Box,
  AlertTriangle,
  RefreshCw,
  Building2,
  Calendar,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { rfApi, type RfInquiryResult } from '../../api/rfApi';
import { RfScannerInput } from './RfScannerInput';
import { rfSoundService } from '../../lib/rfSoundService';
import { formatM3, formatNumber, formatDate } from '@/lib/utils';

interface RfInquiryViewProps {
  almacenId: string;
  triggerFlash: (type: 'success' | 'error') => void;
}

export const RfInquiryView: React.FC<RfInquiryViewProps> = ({
  almacenId,
  triggerFlash,
}) => {
  const [result, setResult] = useState<RfInquiryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleScan = async (code: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await rfApi.consultaLibre(code, almacenId);
      if (data && data.encontrado) {
        rfSoundService.playSuccess();
        triggerFlash('success');
        setResult(data);
      } else {
        rfSoundService.playError();
        triggerFlash('error');
        setResult(null);
        setErrorMsg(data?.mensaje || `No se encontró información para el código "${code}".`);
      }
    } catch (err: any) {
      console.error('Error en consulta libre:', err);
      rfSoundService.playError();
      triggerFlash('error');
      setErrorMsg(err.message || 'Error al consultar código.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-[#333333]">
        <div className="p-2 rounded-lg bg-sky-100 text-sky-700 border border-sky-200 dark:bg-[#201330] dark:text-[#dab9ff] dark:border-[#4b4452]">
          <Search className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
            Consulta Libre de Stock (Inquiry)
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
            Escanee cualquier LPN, Ubicación o SKU
          </span>
        </div>
      </div>

      {/* Input de Escaneo Universal */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-3 shadow-xs">
        <RfScannerInput
          label="Escanear Código (LPN / Rack / SKU)"
          placeholder="Ej: PLT-2026-000001, A1-P02-E01-N03, o SKU..."
          onScan={handleScan}
          disabled={loading}
          sampleCodes={['PLT-2026-000001', 'A1-P01-E01-N01', 'BEV-JUG-001']}
        />

        {loading && (
          <div className="p-3 text-center text-xs text-sky-700 dark:text-[#dab9ff] flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Consultando base de datos...</span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2a0e12] dark:border-[#690005] dark:text-[#ffb4ab] text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* RESULTADO 1: Ubicación Física de Rack */}
      {result && result.tipo === 'ubicacion' && result.ubicacion && (
        <div className="p-4 rounded-xl border-2 border-sky-300 dark:border-[#dab9ff] bg-white dark:bg-[#1a1424] space-y-4 animate-fadeIn shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-sky-700 dark:text-[#dab9ff] flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>Resultado: Ubicación Física</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                result.ubicacion.estado === 'activa'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#1b4332] dark:text-[#69f0ae]'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#690005] dark:text-[#ffb4ab]'
              }`}
            >
              {result.ubicacion.estado.toUpperCase()}
            </span>
          </div>

          <div className="text-center p-3 rounded-lg bg-sky-50 dark:bg-[#201330] border border-sky-200 dark:border-[#4b4452]">
            <div className="text-2xl font-black font-mono tracking-wider text-sky-700 dark:text-[#dab9ff]">
              {result.ubicacion.codigo_etiqueta}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono mt-0.5">
              Pasillo {result.ubicacion.pasillo} &bull; Estante {result.ubicacion.estante} &bull; Nivel {result.ubicacion.nivel}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] mt-1">
              Capacidad: <strong>{formatM3(result.ubicacion.capacidad_volumen_m3)}</strong> &bull; {result.ubicacion.almacen_nombre} ({result.ubicacion.zona_nombre || 'General'})
            </div>
          </div>

          {/* Existencias en esta ubicación */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
              Contenido en esta posición ({result.items?.length || 0}):
            </span>

            {(!result.items || result.items.length === 0) ? (
              <div className="p-4 rounded border border-dashed border-slate-200 dark:border-[#333333] text-center text-xs text-slate-500 dark:text-[#cdc3d4]">
                Ubicación vacía. Lista para recibir mercadería.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.items.map((item, idx) => (
                  <div
                    key={item.inventario_id || idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#131313] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-violet-700 dark:text-[#dab9ff] font-bold">
                        {item.lpn_codigo || 'Bultos sueltos'}
                      </span>
                      <span className="text-emerald-600 dark:text-[#69f0ae] font-bold">
                        {formatNumber(item.cantidad_disponible, 0)} {item.unidad_medida}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-[#e5e2e1]">
                      {item.sku} - {item.articulo_nombre}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#cdc3d4] flex items-center justify-between font-mono">
                      <span>Cliente: {item.cliente_codigo}</span>
                      {item.lote_numero && <span>Lote: {item.lote_numero}</span>}
                      <span>{formatM3(item.volumen_m3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTADO 2: Pallet LPN */}
      {result && result.tipo === 'pallet' && result.pallet && (
        <div className="p-4 rounded-xl border-2 border-violet-300 dark:border-[#dab9ff] bg-white dark:bg-[#1a1424] space-y-4 animate-fadeIn shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-violet-700 dark:text-[#dab9ff] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Resultado: Pallet LPN</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#1b4332] dark:text-[#69f0ae]">
              {result.pallet.estado.toUpperCase()}
            </span>
          </div>

          <div className="text-center p-3 rounded-lg bg-violet-50 dark:bg-[#201330] border border-violet-200 dark:border-[#4b4452]">
            <div className="text-2xl font-black font-mono tracking-wider text-violet-700 dark:text-[#dab9ff]">
              {result.pallet.codigo_lpn}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono mt-0.5">
              Cliente: <strong className="text-slate-900 dark:text-[#e5e2e1]">{result.pallet.cliente_razon_social} ({result.pallet.cliente_codigo})</strong>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono mt-1 flex items-center justify-center gap-3">
              <span>Volumen: <strong className="text-violet-700 dark:text-[#dab9ff]">{formatM3(result.pallet.volumen_total_m3)}</strong></span>
              <span>&bull;</span>
              <span>Peso: <strong className="text-slate-900 dark:text-[#e5e2e1]">{formatNumber(result.pallet.peso_total_kg, 1)} kg</strong></span>
            </div>
          </div>

          {/* Artículos sobre este pallet */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
              Mercadería en este pallet ({result.items?.length || 0}):
            </span>

            {result.items && result.items.map((item, idx) => (
              <div
                key={item.inventario_id || idx}
                className="p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#131313] space-y-1 text-xs"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">{item.sku}</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-[#69f0ae]">
                    {formatNumber(item.cantidad_disponible, 0)} bultos
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-[#cdc3d4]">{item.articulo_nombre}</div>
                <div className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono flex items-center justify-between pt-1 border-t border-slate-200 dark:border-[#252525]">
                  <span>Ubicación: <strong className="text-sky-600 dark:text-[#75d1ff]">{item.ubicacion_codigo || 'Muelle'}</strong></span>
                  {item.lote_numero && <span>Lote: {item.lote_numero}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RESULTADO 3: Artículo por SKU / Código de Barras */}
      {result && result.tipo === 'articulo' && result.articulo && (
        <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-[#dab9ff] bg-white dark:bg-[#1a1424] space-y-4 animate-fadeIn shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase font-bold text-amber-800 dark:text-[#dab9ff] flex items-center gap-1">
              <Box className="w-3.5 h-3.5" />
              <span>Resultado: Artículo / SKU</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-[#201330] dark:text-[#dab9ff] dark:border-[#4b4452]">
              {result.articulo.cliente_codigo}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-[#201330] border border-amber-200 dark:border-[#4b4452] space-y-1">
            <div className="text-lg font-black font-mono text-amber-800 dark:text-[#dab9ff]">
              {result.articulo.sku}
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">
              {result.articulo.nombre}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-mono flex items-center gap-3 pt-1">
              {result.articulo.codigo_barras && (
                <span>EAN: <strong>{result.articulo.codigo_barras}</strong></span>
              )}
              <span>Vol: {formatM3(result.articulo.volumen_unitario_m3)}/u</span>
              <span>Peso: {result.articulo.peso_unitario_kg} kg/u</span>
            </div>
          </div>

          {/* Posiciones de stock */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] block">
              Posiciones de almacenamiento con stock ({result.stock_ubicaciones?.length || 0}):
            </span>

            {(!result.stock_ubicaciones || result.stock_ubicaciones.length === 0) ? (
              <div className="p-4 rounded border border-dashed border-slate-200 dark:border-[#333333] text-center text-xs text-slate-500 dark:text-[#cdc3d4]">
                Sin existencias en los racks de este almacén.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.stock_ubicaciones.map((pos, idx) => (
                  <div
                    key={pos.inventario_id || idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#131313] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-sm text-sky-700 dark:text-[#75d1ff]">
                        {pos.ubicacion_codigo}
                      </span>
                      <span className="font-bold text-sm text-emerald-600 dark:text-[#69f0ae]">
                        {formatNumber(pos.cantidad_disponible, 0)} bultos
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono flex items-center justify-between">
                      <span>LPN: {pos.lpn_codigo || 'Suelto'}</span>
                      {pos.lote_numero && <span>Lote: {pos.lote_numero}</span>}
                      {pos.lote_vencimiento && <span>Vto: {formatDate(pos.lote_vencimiento)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
