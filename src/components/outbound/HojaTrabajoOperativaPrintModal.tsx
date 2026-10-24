import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  FileText,
  Building2,
  Calendar,
  Layers,
  QrCode,
  PackageCheck,
  RefreshCw,
} from 'lucide-react';
import { formatNumber, formatM3, formatDate, formatDateTime } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { OpenCargoSkylineLogo } from '@/components/common/OpenCargoSkylineLogo';
import { getDescripcionFull } from '@/api/articulosApi';
import { pedidosApi } from '@/api/pedidosApi';
import { inventarioApi, StockConsolidadoArticulo } from '@/api/inventarioApi';

interface HojaTrabajoOperativaPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
}

interface RenglonHojaImpresion {
  key: string;
  artId: string;
  loteDisplay: string;
  articuloCodigo: string;
  articuloDescripcion: string;
  ubicacionDisplay: string;
  palletLpn?: string | null;
  stockActual: number;
  stockFuturo: number;
  cantidad: number;
  esTareaPicking: boolean;
}

const extractLoteFromObs = (obs?: string | null): string | null => {
  if (!obs) return null;
  const match = obs.match(/Lote:\s*([^\s)]+)/i);
  return match ? match[1] : null;
};

const extractPosFromObs = (obs?: string | null): string | null => {
  if (!obs) return null;
  const match = obs.match(/en Pos:\s*([^\s)]+)/i);
  return match ? match[1] : null;
};

export const HojaTrabajoOperativaPrintModal: React.FC<HojaTrabajoOperativaPrintModalProps> = ({
  isOpen,
  onClose,
  pedido,
}) => {
  const [currentPedido, setCurrentPedido] = useState<any>(pedido);
  const [stockMap, setStockMap] = useState<Record<string, StockConsolidadoArticulo>>({});
  const [loading, setLoading] = useState(false);

  const handlePrint = () => {
    document.body.classList.add('printing-modal');
    window.print();
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-modal');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-modal');
    };
  }, []);

  // Cargar siempre la información más completa y el stock consolidado real del cliente
  useEffect(() => {
    if (!isOpen || !pedido?.id) return;
    setCurrentPedido(pedido);

    let isMounted = true;
    setLoading(true);

    Promise.allSettled([
      pedidosApi.obtenerPedidoConDetalle(pedido.id),
      pedido.cliente_id ? inventarioApi.obtenerStockConsolidadoPorCliente(pedido.cliente_id) : Promise.resolve({}),
    ])
      .then(([pedRes, stockRes]) => {
        if (!isMounted) return;
        if (pedRes.status === 'fulfilled' && pedRes.value) {
          setCurrentPedido(pedRes.value);
        }
        if (stockRes.status === 'fulfilled' && stockRes.value) {
          setStockMap(stockRes.value as Record<string, StockConsolidadoArticulo>);
        }
      })
      .catch((err) => {
        console.warn('Aviso cargando datos complementarios para hoja de trabajo:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, pedido?.id, pedido?.cliente_id]);

  const ped = currentPedido || pedido;
  const detalles = ped?.detalles || [];
  const cliente = ped?.cliente || {};
  const destinatario = ped?.destinatario || {};

  // Desglosar renglones: si un detalle tiene múltiples tareas_picking (distintos lotes o ubicaciones),
  // se genera un renglón separado para cada una de ellas
  const { renglonesImpresion, totalBultos, totalPeso, totalVolumen } = useMemo(() => {
    const items: RenglonHojaImpresion[] = [];
    let bultosAcc = 0;
    let pesoAcc = 0;
    let volAcc = 0;

    detalles.forEach((det: any, detIdx: number) => {
      const art = det.articulo || {};
      const artId = det.articulo_id || art.id;
      const stockInfo = stockMap[artId];
      const stockActual = stockInfo ? stockInfo.stockFisico : Number(art.stock_actual ?? 0);
      const stockFuturo = stockInfo ? stockInfo.stockFuturo : Number(art.stock_futuro ?? 0);

      const pesoUnit = Number(art.peso_unitario_kg || 0);
      const volUnit = Number(art.volumen_unitario_m3 || 0);

      const tareas = det.tareas_picking || [];

      if (tareas.length > 0) {
        tareas.forEach((t: any, tIdx: number) => {
          const cantTarea = Number(t.cantidad_a_recolectar ?? t.cantidad_recolectada ?? 0);
          const lote =
            t.lote?.numero_lote ||
            extractLoteFromObs(t.observaciones_picking) ||
            det.lote?.numero_lote ||
            det.lote_declarado ||
            (t.lote_id ? t.lote_id.slice(0, 8) : 'S/L');

          const ubic =
            t.ubicacion_origen?.codigo_etiqueta ||
            extractPosFromObs(t.observaciones_picking) ||
            det.ubicacion?.codigo_etiqueta ||
            det.ubicacion_sugerida?.codigo_etiqueta ||
            art.posicion ||
            'Depósito Central';

          const palletLpn = t.pallet_origen?.codigo_lpn || null;

          items.push({
            key: `tarea-${t.id || `${detIdx}-${tIdx}`}`,
            artId,
            loteDisplay: lote,
            articuloCodigo: art.nombre || art.sku || 'ART-001',
            articuloDescripcion: (art as any).descripcion_full || getDescripcionFull(art) || art.descripcion || '',
            ubicacionDisplay: ubic,
            palletLpn,
            stockActual,
            stockFuturo,
            cantidad: cantTarea,
            esTareaPicking: true,
          });

          bultosAcc += cantTarea;
          pesoAcc += cantTarea * pesoUnit;
          volAcc += cantTarea * volUnit;
        });
      } else {
        // Pedido no alocado aún: mostrar el renglón solicitado del pedido
        const cantDet = Number(det.cantidad_solicitada || det.cantidad_esperada || 1);
        const lote = det.lote?.numero_lote || det.lote_declarado || (det.lote_id ? det.lote_id.slice(0, 8) : 'FEFO / Disp.');
        const ubic =
          det.ubicacion?.codigo_etiqueta ||
          det.ubicacion_sugerida?.codigo_etiqueta ||
          art.posicion ||
          'Pendiente Asignación';

        items.push({
          key: `det-${det.id || detIdx}`,
          artId,
          loteDisplay: lote,
          articuloCodigo: art.nombre || art.sku || 'ART-001',
          articuloDescripcion: (art as any).descripcion_full || getDescripcionFull(art) || art.descripcion || '',
          ubicacionDisplay: ubic,
          palletLpn: null,
          stockActual,
          stockFuturo,
          cantidad: cantDet,
          esTareaPicking: false,
        });

        bultosAcc += cantDet;
        pesoAcc += cantDet * pesoUnit;
        volAcc += cantDet * volUnit;
      }
    });

    return {
      renglonesImpresion: items,
      totalBultos: bultosAcc,
      totalPeso: pesoAcc,
      totalVolumen: volAcc,
    };
  }, [detalles, stockMap]);

  if (!isOpen || !pedido) return null;

  return (
    <ModalPortal>
      <div
        data-print-container="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto print:static print:block print:p-0 print:m-0 print:bg-white print:backdrop-blur-none print:w-full print:h-auto print:overflow-visible"
      >
        <div
          data-print-content="true"
          className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden print:static print:block print:w-full print:max-w-none print:h-auto print:max-h-none print:border-none print:shadow-none print:rounded-none print:bg-white print:text-black print:overflow-visible print:m-0 print:p-0"
        >
          {/* Header Modal - No Imprimible */}
          <div className="print:hidden p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-lg flex items-center gap-2">
                  <span>Hoja de Trabajo Operativa / Picking</span>
                  {loading && <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />}
                </h3>
                <p className="text-xs text-slate-400">
                  Documento impreso con desglose por lote y ubicación física ({ped.numero_pedido})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-xl text-xs transition-colors shadow-lg shadow-sky-600/20"
              >
                <Printer className="w-4 h-4" />
                Imprimir Hoja de Trabajo
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cuerpo Documento Imprimible A4 100% idéntico a la plantilla Open Cargo */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950 print:bg-white print:p-0 print:m-0 print:overflow-visible print:block print:w-full">
            <div
              data-print-sheet="true"
              className="max-w-3xl print:max-w-none print:w-full mx-auto bg-white text-black p-6 rounded-none shadow-xl print:shadow-none print:p-0 print:m-0 print:border-none"
            >
              {/* Header con Skyline y Marca */}
              <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-3">
                <div className="w-52">
                  <OpenCargoSkylineLogo className="w-full h-auto text-black" />
                </div>
                <div className="text-right">
                  <h1 className="text-sm font-black tracking-tight text-black uppercase">
                    OPEN CARGO LOGISTIC SERVICES SRL
                  </h1>
                </div>
              </div>

              {/* Recuadro 1: Cliente & Destinatario vs Nro Pedido */}
              <div className="border-2 border-black grid grid-cols-12 mb-3">
                <div className="col-span-7 border-r-2 border-black p-2 text-xs font-sans">
                  <p className="font-bold">
                    <span className="font-semibold text-slate-700">Cliente:</span>{' '}
                    <span className="uppercase">{cliente.razon_social || 'N/A'}</span>
                  </p>
                  <p className="text-[11px] text-slate-700 mt-1 italic">
                    <span className="font-semibold not-italic">Destinatario:</span>{' '}
                    {destinatario.razon_social || 'N/A'}
                  </p>
                </div>
                <div className="col-span-5 p-2 bg-slate-50 text-right text-xs font-sans flex flex-col justify-between">
                  <p className="font-bold text-sm">
                    🛒 Nro. de Pedido:{' '}
                    <span className="font-mono text-base">
                      {ped.orden_compra_cliente ? `${ped.orden_compra_cliente}` : ped.numero_pedido}
                    </span>
                  </p>
                  <p className="text-[10px] font-mono text-slate-600">
                    ID OP WMS: {ped.numero_pedido}
                  </p>
                </div>
              </div>

              {/* Recuadro 2: Datos de Operación, Tiempos y Resumen */}
              <div className="border-2 border-black grid grid-cols-12 mb-4 text-xs">
                {/* Columna Izquierda: Fecha, Horas y Observaciones */}
                <div className="col-span-7 border-r-2 border-black p-2 flex flex-col justify-between space-y-2">
                  <div>
                    <span className="font-bold text-black block">
                      Fecha Hora de Entrega: {formatDateTime(ped.fecha_compromiso_entrega || new Date().toISOString())}
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-slate-300 pt-1 mt-1">
                      <span>Inicio: __________________</span>
                      <span>Fin: __________________</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-700">
                    <span className="font-bold text-black">OBSERVACIONES:</span> {ped.observaciones || 'Sin observaciones'}
                  </div>
                </div>

                {/* Columna Centro: QrOperacion */}
                <div className="col-span-2 border-r-2 border-black p-1 flex flex-col items-center justify-center text-center bg-slate-50">
                  <div className="w-12 h-12 border border-black flex items-center justify-center font-bold text-[8px] bg-white">
                    [QR]
                  </div>
                  <span className="text-[9px] font-mono font-bold mt-0.5">QrOperacion</span>
                </div>

                {/* Columna Derecha: Totales */}
                <div className="col-span-3 p-2 font-sans space-y-0.5 bg-slate-50">
                  <p className="font-black text-xs uppercase text-black">
                    TOTAL DE BULTOS: {totalBultos} <span className="text-[10px] font-normal italic">ctns</span>
                  </p>
                  <p className="text-[11px] font-bold text-slate-800">
                    Pallets: {Math.ceil(totalBultos / 40)}
                  </p>
                  <p className="text-[10px] font-mono">
                    M3 TOTAL: {formatM3(totalVolumen)} m3
                  </p>
                  <p className="text-[10px] font-mono font-bold">
                    PESO NETO TOTAL: {formatNumber(totalPeso, 2)} Kgs
                  </p>
                </div>
              </div>

              {/* Seccion Tabla: Detalle de Mercaderías con desglose por Lote y Ubicación */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xs font-bold italic text-slate-800 uppercase">
                    Detalle de mercaderías en Pedido ({renglonesImpresion.length} renglones de picking)
                  </h2>
                  <span className="text-[9px] font-mono text-slate-500">
                    * Desglose individual por cada Lote y Ubicación física
                  </span>
                </div>

                <table className="w-full text-[11px] border-collapse border-2 border-black">
                  <thead>
                    <tr className="bg-slate-100 text-black font-bold border-b-2 border-black">
                      <th className="p-1.5 text-left border-r border-black w-24">Lote</th>
                      <th className="p-1.5 text-left border-r border-black">ID Articulo</th>
                      <th className="p-1.5 text-left border-r border-black">Descripcion</th>
                      <th className="p-1.5 text-center border-r border-black">Ubicacion / LPN</th>
                      <th className="p-1.5 text-center border-r border-black text-[10px]">Stock</th>
                      <th className="p-1.5 text-center border-r-2 border-black font-black bg-slate-200">CANTIDAD</th>
                      <th className="p-1.5 text-center border-r border-black w-16">Conteo</th>
                      <th className="p-1.5 text-center w-16">Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renglonesImpresion.map((row) => (
                      <tr key={row.key} className="border-b border-black">
                        <td className="p-1.5 font-mono text-[10px] border-r border-black font-semibold">
                          {row.loteDisplay}
                        </td>
                        <td className="p-1.5 font-bold uppercase border-r border-black font-mono">
                          {row.articuloCodigo}
                        </td>
                        <td className="p-1.5 text-[10px] border-r border-black">
                          {row.articuloDescripcion}
                        </td>
                        <td className="p-1.5 text-center font-bold text-sky-950 border-r border-black">
                          {row.ubicacionDisplay}
                          {row.palletLpn && (
                            <span className="block text-[9px] font-mono font-normal text-slate-600">
                              LPN: {row.palletLpn}
                            </span>
                          )}
                        </td>
                        <td className="p-1.5 text-center text-[9px] border-r border-black font-mono">
                          Actual: {row.stockActual}
                          <span className="block text-slate-500">Futuro: {row.stockFuturo}</span>
                        </td>
                        <td className="p-1.5 text-center font-black text-sm border-r-2 border-black bg-slate-50">
                          {row.cantidad}
                        </td>
                        <td className="p-1.5 border-r border-black"></td>
                        <td className="p-1.5"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pie con firmas de Encargado, Operarios y Control */}
              <div className="border-2 border-black grid grid-cols-3 text-xs font-semibold p-2.5">
                <div>Encargado: ________________________</div>
                <div>Operarios: ________________________</div>
                <div>Control: ________________________</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
