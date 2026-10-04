import React, { useEffect, useState } from 'react';
import {
  X,
  Package,
  Layers,
  Calendar,
  MapPin,
  Barcode,
  History,
  TrendingUp,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { formatNumber, formatM3, formatDate, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { inventarioApi } from '@/api/inventarioApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface PalletDetailPanelProps {
  item: any;
  onClose: () => void;
  onViewKardex?: (clienteId: string, articuloId: string) => void;
}

export const PalletDetailPanel: React.FC<PalletDetailPanelProps> = ({
  item,
  onClose,
  onViewKardex,
}) => {
  const [palletCompleto, setPalletCompleto] = useState<any>(null);
  const [loadingPallet, setLoadingPallet] = useState<boolean>(false);

  useEffect(() => {
    if (item?.pallet?.codigo_lpn) {
      setLoadingPallet(true);
      inventarioApi
        .obtenerPalletPorCodigo(item.pallet.codigo_lpn)
        .then((data) => setPalletCompleto(data))
        .catch((err) => console.error('Error fetching pallet details:', err))
        .finally(() => setLoadingPallet(false));
    } else {
      setPalletCompleto(null);
    }
  }, [item?.pallet?.codigo_lpn]);

  if (!item) return null;

  const articulo = item.articulo;
  const cliente = item.cliente;
  const lote = item.lote;
  const ubicacion = item.ubicacion;
  const pallet = item.pallet;

  return (
    <ModalPortal>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      >
        <div 
          className="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-lg shadow-2xl overflow-hidden transition-all text-slate-800 dark:text-[#e5e2e1]"
          onClick={(e) => e.stopPropagation()}
        >
      {/* Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#4b4452] text-violet-700 dark:text-[#dab9ff]">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
              Detalle de Posición & Pallet
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4] font-mono">
              ID: {item.id ? item.id.substring(0, 13) + '...' : '-'}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Cerrar panel de detalle"
          className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* Article Summary Box */}
        <div className="bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono font-medium uppercase text-slate-500 dark:text-[#cdc3d4] tracking-wider">
                Artículo / SKU
              </span>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] leading-snug">
                {articulo?.nombre || 'Artículo sin nombre'}
              </h4>
            </div>
            {articulo?.rotacion_abc && (
              <Badge variant={articulo.rotacion_abc === 'A' ? 'success' : articulo.rotacion_abc === 'B' ? 'warning' : 'default'}>
                Rotación {articulo.rotacion_abc}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
            <div>
              <span className="text-slate-500 dark:text-[#cdc3d4] text-[10px] block">SKU:</span>
              <span className="font-semibold text-slate-900 dark:text-[#e5e2e1]">{articulo?.sku || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#cdc3d4] text-[10px] block">Unidad de Medida:</span>
              <span className="font-semibold text-slate-900 dark:text-[#e5e2e1]">{articulo?.unidad_medida || 'bulto'}</span>
            </div>
          </div>
        </div>

        {/* 3PL Depositor Client */}
        <div className="bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded p-3">
          <span className="text-[10px] font-mono font-medium uppercase text-slate-500 dark:text-[#cdc3d4] tracking-wider block mb-1">
            Cliente Depositante 3PL
          </span>
          <div className="flex items-center justify-between">
            <div className="font-semibold text-xs text-slate-900 dark:text-[#e5e2e1]">
              {cliente?.razon_social || 'Cliente General'}
            </div>
            {cliente?.unidad_negocio && (
              <Badge variant="info" size="sm">
                {cliente.unidad_negocio}
              </Badge>
            )}
          </div>
        </div>

        {/* Pallet LPN & Location */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded p-3">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-[#cdc3d4] text-[11px] mb-1">
              <Barcode className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
              <span>Pallet LPN</span>
            </div>
            <div className="font-mono font-bold text-xs text-slate-900 dark:text-[#e5e2e1] truncate">
              {pallet?.codigo_lpn || 'Sin LPN (Piso)'}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block mt-0.5">
              Estado: {pallet?.estado || 'activo'}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded p-3">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-[#cdc3d4] text-[11px] mb-1">
              <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff]" />
              <span>Ubicación Rack</span>
            </div>
            <div className="font-mono font-bold text-xs text-sky-600 dark:text-[#75d1ff]">
              {ubicacion?.codigo_etiqueta || 'Sin Asignar'}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block mt-0.5">
              {ubicacion?.pasillo ? `Pasillo ${ubicacion.pasillo} | Estante ${ubicacion.estante}` : 'Zona General'}
            </span>
          </div>
        </div>

        {/* Cubic Volume M3 Metrics */}
        <div className="p-3.5 rounded border border-violet-200 dark:border-[#4b4452] bg-violet-50 dark:bg-[#201330]/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-violet-700 dark:text-[#dab9ff] text-xs font-semibold">
              <Layers className="w-3.5 h-3.5" />
              <span>Cubicaje & Existencias</span>
            </div>
            <Badge variant="info" size="sm">
              Facturación 3PL
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-600 dark:text-[#cdc3d4] text-[11px] block">Cantidad Física:</span>
              <span className="font-mono font-bold text-base text-slate-900 dark:text-[#e5e2e1] tabular-nums">
                {formatNumber(item.cantidad_disponible || 0, 0)} bultos
              </span>
            </div>

            <div>
              <span className="text-slate-600 dark:text-[#cdc3d4] text-[11px] block">Volumen Ocupado:</span>
              <span className="font-mono font-bold text-base text-violet-700 dark:text-[#dab9ff] tabular-nums">
                {formatM3(item.volumen_m3 || 0)}
              </span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-violet-200 dark:border-[#4b4452]/60 flex items-center justify-between text-[11px] text-slate-600 dark:text-[#cdc3d4]">
            <span>Volumen unitario:</span>
            <span className="font-mono font-medium text-slate-900 dark:text-[#e5e2e1]">
              {articulo?.volumen_unitario_m3 ? `${articulo.volumen_unitario_m3} m³/ud` : '-'}
            </span>
          </div>
        </div>

        {/* Lot & Expiry Data */}
        <div className="bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded p-3">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-[#cdc3d4] text-[11px] mb-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-[#ffd27a]" />
            <span>Trazabilidad de Lote</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500 dark:text-[#cdc3d4] text-[10px] block">Nº de Lote:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                {lote?.numero_lote || item.lote_id || 'Sin Lote'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-[#cdc3d4] text-[10px] block">Vencimiento:</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-[#e5e2e1]">
                {formatDate(lote?.fecha_vencimiento)}
              </span>
            </div>
          </div>
        </div>

        {/* Pallet Contents if available */}
        {palletCompleto && (
          <div className="bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-900 dark:text-[#e5e2e1]">
                Contenido Pallet ({palletCompleto.existencias?.length || 0} ítems)
              </span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-[#cdc3d4]">
                Carga consolidada
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {palletCompleto.existencias?.map((ex: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-[#333333] last:border-none"
                >
                  <span className="text-slate-600 dark:text-[#cdc3d4] truncate max-w-[140px]">
                    {ex.articulo?.sku || 'Item'}
                  </span>
                  <div className="font-mono text-[11px] text-right">
                    <span className="font-bold text-slate-900 dark:text-[#e5e2e1] tabular-nums">
                      {ex.cantidad_disponible}
                    </span>
                    <span className="text-violet-700 dark:text-[#dab9ff] ml-1">({formatM3(ex.volumen_m3 || 0)})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] flex items-center gap-2">
        <button
          onClick={() => {
            if (onViewKardex && item.cliente_id && item.articulo_id) {
              onViewKardex(item.cliente_id, item.articulo_id);
            }
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-sm"
        >
          <History className="w-3.5 h-3.5" />
          <span>Ver Historial Kardex</span>
        </button>

        <button
          onClick={onClose}
          className="px-3 py-2 rounded text-xs font-semibold border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
        >
          Cerrar
        </button>
        </div>
      </div>
    </div>
  </ModalPortal>
);
};
