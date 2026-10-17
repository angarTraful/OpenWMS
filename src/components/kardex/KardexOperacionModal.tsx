import React from 'react';
import {
  X,
  History,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Package,
  Layers,
  MapPin,
  Calendar,
  Clock,
  Building2,
  FileText,
  Barcode,
  Scale,
  Box,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { formatDateTime, formatDate, formatNumber, formatM3 } from '@/lib/utils';
import { getDescripcionFull } from '@/api/articulosApi';
import { esMovimientoEntrada, esMovimientoSalida, esMovimientoInterno } from './KardexView';

interface KardexOperacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  movimiento: any | null;
}

export const KardexOperacionModal: React.FC<KardexOperacionModalProps> = ({
  isOpen,
  onClose,
  movimiento,
}) => {
  if (!isOpen || !movimiento) return null;

  const esEntrada = esMovimientoEntrada(movimiento.tipo_movimiento);
  const esSalida = esMovimientoSalida(movimiento.tipo_movimiento);
  const esInterno = esMovimientoInterno(movimiento.tipo_movimiento);

  const getTipoVisual = (tipo: string) => {
    switch (tipo) {
      case 'putaway':
      case 'recepcion':
      case 'ingreso_inicial':
        return {
          label: 'Ingreso',
          badge: <Badge variant="success" dot pulse>Ingreso</Badge>,
          icon: <ArrowDownLeft className="w-5 h-5 text-emerald-600 dark:text-[#75d1ff]" />,
          bgHeader: 'bg-emerald-50/70 border-emerald-200 dark:bg-[#0f241a]/60 dark:border-[#1d4d38]',
        };
      case 'despacho':
        return {
          label: 'Salida / Despacho',
          badge: <Badge variant="danger" dot>Salida / Despacho</Badge>,
          icon: <ArrowUpRight className="w-5 h-5 text-rose-600 dark:text-[#ffb4ab]" />,
          bgHeader: 'bg-rose-50/70 border-rose-200 dark:bg-[#2a0e12]/60 dark:border-[#690005]',
        };
      case 'picking':
        return {
          label: 'Picking / Preparación',
          badge: <Badge variant="warning" dot>Picking / Preparación</Badge>,
          icon: <ArrowUpRight className="w-5 h-5 text-amber-600 dark:text-[#fef08a]" />,
          bgHeader: 'bg-amber-50/70 border-amber-200 dark:bg-[#2a1e08]/60 dark:border-[#713f12]',
        };
      case 'transferencia':
      case 'transferencia_interna':
        return {
          label: 'Transferencia Interna',
          badge: <Badge variant="outline" dot>Transferencia Interna</Badge>,
          icon: <ArrowRightLeft className="w-5 h-5 text-blue-600 dark:text-[#75d1ff]" />,
          bgHeader: 'bg-blue-50/70 border-blue-200 dark:bg-[#0f2434]/60 dark:border-[#1b435d]',
        };
      case 'ajuste_positivo':
        return {
          label: 'Ajuste (+)',
          badge: <Badge variant="info" dot>Ajuste (+)</Badge>,
          icon: <ArrowDownLeft className="w-5 h-5 text-blue-600 dark:text-[#75d1ff]" />,
          bgHeader: 'bg-blue-50/70 border-blue-200 dark:bg-[#0f2434]/60 dark:border-[#1b435d]',
        };
      case 'ajuste_negativo':
        return {
          label: 'Ajuste (-)',
          badge: <Badge variant="danger" dot>Ajuste (-)</Badge>,
          icon: <ArrowUpRight className="w-5 h-5 text-rose-600 dark:text-[#ffb4ab]" />,
          bgHeader: 'bg-rose-50/70 border-rose-200 dark:bg-[#2a0e12]/60 dark:border-[#690005]',
        };
      case 'merma':
        return {
          label: 'Merma / Scrap',
          badge: <Badge variant="danger" dot>Merma / Scrap</Badge>,
          icon: <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-[#ffb4ab]" />,
          bgHeader: 'bg-rose-50/70 border-rose-200 dark:bg-[#2a0e12]/60 dark:border-[#690005]',
        };
      default:
        return {
          label: movimiento.tipo_movimiento || 'Movimiento',
          badge: <Badge variant="outline" dot>{movimiento.tipo_movimiento}</Badge>,
          icon: <History className="w-5 h-5 text-slate-600 dark:text-[#cdc3d4]" />,
          bgHeader: 'bg-slate-50 border-slate-200 dark:bg-[#201f1f] dark:border-[#333333]',
        };
    }
  };

  const tipoVisual = getTipoVisual(movimiento.tipo_movimiento);
  const art = movimiento.articulo || {};
  const lote = movimiento.lote || {};
  const cliente = movimiento.cliente || {};
  const origen = movimiento.origen || movimiento.ubicacion_origen || {};
  const destino = movimiento.destino || movimiento.ubicacion_destino || {};

  const cantidad = Number(movimiento.cantidad || 0);
  const volumenM3 = Number(movimiento.volumen_m3 || movimiento.volumen_total_m3 || 0);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 dark:bg-[#201330] dark:text-[#dab9ff] border border-violet-200 dark:border-[#4b4452] flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                    Operación de Kardex
                  </h3>
                  {tipoVisual.badge}
                </div>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDateTime(movimiento.fecha_hora)}</span>
                  <span>•</span>
                  <span className="font-mono text-[10px]">ID: {movimiento.id?.slice(0, 8)}...</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Content Scrollable */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            
            {/* Tarjeta Principal de Magnitud */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${tipoVisual.bgHeader}`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-[#131313]/80 border border-slate-200 dark:border-[#333333] shadow-xs">
                  {tipoVisual.icon}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#cdc3d4]">
                    Tipo de Movimiento
                  </div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-[#e5e2e1]">
                    {tipoVisual.label}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#cdc3d4]">
                  Cantidad Operada
                </div>
                <div className="text-xl font-black font-mono tracking-tight">
                  <span className={esEntrada ? 'text-emerald-700 dark:text-[#75d1ff]' : esSalida ? 'text-rose-700 dark:text-[#ffb4ab]' : 'text-slate-800 dark:text-[#e5e2e1]'}>
                    {esEntrada ? '+' : esSalida ? '-' : ''}
                    {formatNumber(cantidad, 0)} {art.unidad_medida || 'bultos'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-[#cdc3d4]">
                  {formatM3(volumenM3)}
                </div>
              </div>
            </div>

            {/* Ficha 1: Artículo & Producto */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181717] border border-slate-200 dark:border-[#333333] space-y-2">
              <div className="text-xs font-bold text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                <span>Artículo / Producto</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">SKU / Código:</span>
                  <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] text-sm">
                    {art.sku || art.id_producto || 'Sin código'}
                  </span>
                  {art.id_producto && art.id_producto !== art.sku && (
                    <span className="text-[10px] text-slate-400 ml-1 font-mono">({art.id_producto})</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Nombre / Denominación:</span>
                  <span className="font-semibold text-slate-900 dark:text-[#e5e2e1] block">
                    {art.nombre || 'Artículo sin nombre'}
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Descripción Completa:</span>
                  <span className="text-slate-700 dark:text-[#cdc3d4] block">
                    {(art as any)?.descripcion_full || getDescripcionFull(art) || art.descripcion || 'Sin descripción adicional'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Color / Variante:</span>
                  <span className="text-slate-800 dark:text-[#e5e2e1]">{art.color || '-'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold">Tipo Empaque & Std:</span>
                  <span className="text-slate-800 dark:text-[#e5e2e1]">
                    {art.tipo_empaque || 'Bulto'} {art.unidades_por_bulto ? `(${art.unidades_por_bulto} un/bulto)` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Ficha 2: Ubicaciones (Flujo Físico) */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181717] border border-slate-200 dark:border-[#333333] space-y-2">
              <div className="text-xs font-bold text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-[#75d1ff]" />
                <span>Trayectoria de Ubicaciones (Origen → Destino)</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 rounded-lg bg-white dark:bg-[#1f1e1e] border border-slate-200 dark:border-[#333333]">
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold mb-0.5">Ubicación Origen:</span>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-[#e5e2e1] block">
                    {origen.codigo_etiqueta || 'Exterior / Proveedor'}
                  </span>
                  {origen.pasillo && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      Pasillo {origen.pasillo} • Est. {origen.estante} • Nivel {origen.nivel}
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-white dark:bg-[#1f1e1e] border border-slate-200 dark:border-[#333333]">
                  <span className="text-[10px] text-slate-400 dark:text-[#978d9d] block uppercase font-semibold mb-0.5">Ubicación Destino:</span>
                  <span className="font-mono font-bold text-sm text-violet-700 dark:text-[#dab9ff] block">
                    {destino.codigo_etiqueta || 'Despacho / Cliente'}
                  </span>
                  {destino.pasillo && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      Pasillo {destino.pasillo} • Est. {destino.estante} • Nivel {destino.nivel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ficha 3: Lote, Pallet LPN y Documento de Referencia */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181717] border border-slate-200 dark:border-[#333333] space-y-1.5 text-xs">
                <div className="text-[10px] font-bold text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-1">
                  <Barcode className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Lote & Vencimiento</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Lote:</span>
                  <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] text-sm">
                    {lote.numero_lote || '-'}
                  </span>
                </div>
                {lote.fecha_vencimiento && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">Vencimiento:</span>
                    <span className="text-slate-800 dark:text-[#e5e2e1] font-mono">{formatDate(lote.fecha_vencimiento)}</span>
                  </div>
                )}
                {movimiento.pallet?.codigo_lpn && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">Pallet LPN:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">{movimiento.pallet.codigo_lpn}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181717] border border-slate-200 dark:border-[#333333] space-y-1.5 text-xs">
                <div className="text-[10px] font-bold text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Cliente & Referencia</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Cliente Depositante:</span>
                  <span className="font-semibold text-slate-900 dark:text-[#e5e2e1] block">
                    {cliente.razon_social || '-'}
                  </span>
                  {cliente.identificacion_fiscal && (
                    <span className="text-[10px] text-slate-500 font-mono">CUIT: {cliente.identificacion_fiscal}</span>
                  )}
                </div>
                {movimiento.documento_referencia && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">Doc. Referencia:</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-[#75d1ff]">
                      {movimiento.documento_referencia}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Observaciones o Notas */}
            {movimiento.notas && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#181717] border border-slate-200 dark:border-[#333333] text-xs">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold mb-0.5">Notas / Observaciones del Operador:</span>
                <p className="text-slate-800 dark:text-[#e5e2e1] italic">"{movimiento.notas}"</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-t border-slate-200 dark:border-[#333333] flex justify-between items-center text-xs">
            <span className="text-slate-500 dark:text-[#cdc3d4] font-mono text-[11px]">
              Trazabilidad certificada en Supabase WMS Ledger
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-[#2a2a2a] dark:hover:bg-[#333333] text-slate-800 dark:text-[#e5e2e1] rounded-xl transition-colors"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
