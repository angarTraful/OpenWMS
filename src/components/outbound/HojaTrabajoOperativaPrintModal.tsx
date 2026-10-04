import React from 'react';
import {
  X,
  Printer,
  FileText,
  Building2,
  Calendar,
  Layers,
  QrCode,
  PackageCheck,
} from 'lucide-react';
import { formatNumber, formatM3, formatDate, formatDateTime } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { OpenCargoSkylineLogo } from '@/components/common/OpenCargoSkylineLogo';

interface HojaTrabajoOperativaPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
}

export const HojaTrabajoOperativaPrintModal: React.FC<HojaTrabajoOperativaPrintModalProps> = ({
  isOpen,
  onClose,
  pedido,
}) => {
  if (!isOpen || !pedido) return null;

  const handlePrint = () => {
    window.print();
  };

  const detalles = pedido.detalles || [];
  const cliente = pedido.cliente || {};
  const destinatario = pedido.destinatario || {};

  const totalBultos = detalles.reduce(
    (acc: number, d: any) => acc + Number(d.cantidad_solicitada || d.cantidad_esperada || 1),
    0
  );
  const totalPeso = detalles.reduce(
    (acc: number, d: any) =>
      acc +
      Number(d.cantidad_solicitada || 1) *
        Number(d.articulo?.peso_unitario_kg || 0),
    0
  );
  const totalVolumen = detalles.reduce(
    (acc: number, d: any) =>
      acc +
      Number(d.cantidad_solicitada || 1) *
        Number(d.articulo?.volumen_unitario_m3 || 0),
    0
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
          
          {/* Header Modal - No Imprimible */}
          <div className="print:hidden p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-lg">Hoja de Trabajo Operativa / Picking</h3>
                <p className="text-xs text-slate-400">
                  Documento impreso para conteo y control físico en depósito ({pedido.numero_pedido})
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
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950 print:bg-white print:p-0">
            <div className="max-w-3xl mx-auto bg-white text-black p-6 rounded-none shadow-xl print:shadow-none print:p-0">
              
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
                    🛒 Nro. de Pedido: <span className="font-mono text-base">{pedido.numero_pedido}</span>
                  </p>
                  <p className="text-[10px] font-mono text-slate-600">
                    ID OP Pedido: {pedido.id?.slice(0, 8) || '3c1015d5'}
                  </p>
                </div>
              </div>

              {/* Recuadro 2: Datos de Operación, Tiempos y Resumen */}
              <div className="border-2 border-black grid grid-cols-12 mb-4 text-xs">
                
                {/* Columna Izquierda: Fecha, Horas y Observaciones */}
                <div className="col-span-7 border-r-2 border-black p-2 flex flex-col justify-between space-y-2">
                  <div>
                    <span className="font-bold text-black block">
                      Fecha Hora de Entrega: {formatDateTime(pedido.fecha_compromiso_entrega || new Date().toISOString())}
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-slate-300 pt-1 mt-1">
                      <span>Inicio: __________________</span>
                      <span>Fin: __________________</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-300 pt-1 text-[11px] text-slate-700">
                    <span className="font-bold text-black">OBSERVACIONES:</span> {pedido.observaciones || 'Sin observaciones'}
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

              {/* Seccion Tabla: Detalle de Mercaderías */}
              <div className="mb-4">
                <h2 className="text-xs font-bold italic text-slate-800 uppercase mb-1">
                  Detalle de mercaderías en Pedido
                </h2>
                <table className="w-full text-[11px] border-collapse border-2 border-black">
                  <thead>
                    <tr className="bg-slate-100 text-black font-bold border-b-2 border-black">
                      <th className="p-1.5 text-left border-r border-black w-20">Lote</th>
                      <th className="p-1.5 text-left border-r border-black">ID Articulo</th>
                      <th className="p-1.5 text-left border-r border-black">Descripcion</th>
                      <th className="p-1.5 text-center border-r border-black">Ubicacion</th>
                      <th className="p-1.5 text-center border-r border-black text-[10px]">Stock</th>
                      <th className="p-1.5 text-center border-r-2 border-black font-black bg-slate-200">CANTIDAD</th>
                      <th className="p-1.5 text-center border-r border-black w-16">Conteo</th>
                      <th className="p-1.5 text-center w-16">Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalles.map((det: any, idx: number) => {
                      const art = det.articulo || {};
                      const cant = det.cantidad_solicitada || det.cantidad_esperada || 1;
                      const ubicacion = det.ubicacion_sugerida?.codigo_etiqueta || art.posicion || 'Rondeau';

                      return (
                        <tr key={idx} className="border-b border-black">
                          <td className="p-1.5 font-mono text-[10px] border-r border-black">
                            {det.lote_declarado || '26SJ0125-1'}
                          </td>
                          <td className="p-1.5 font-bold uppercase border-r border-black">
                            {art.sku || 'ART-001'}
                            <span className="block text-[10px] font-normal text-slate-600">{art.nombre}</span>
                          </td>
                          <td className="p-1.5 text-[10px] border-r border-black">
                            {art.descripcion || '170X250 - 2PLZAS'}
                          </td>
                          <td className="p-1.5 text-center font-semibold border-r border-black">
                            {ubicacion}
                          </td>
                          <td className="p-1.5 text-center text-[9px] border-r border-black font-mono">
                            Actual: {art.stock_actual || 29}
                            <span className="block text-slate-500">Futuro: {art.stock_futuro || 28}</span>
                          </td>
                          <td className="p-1.5 text-center font-black text-sm border-r-2 border-black bg-slate-50">
                            {cant}
                          </td>
                          <td className="p-1.5 border-r border-black"></td>
                          <td className="p-1.5"></td>
                        </tr>
                      );
                    })}
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
