import React from 'react';
import {
  X,
  Printer,
  QrCode,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { OpenCargoSkylineLogo } from './OpenCargoSkylineLogo';

export interface EtiquetaRolloItem {
  idSecuencia: string; // ej: 89e252e6-1 o 9b09399-0001
  secuenciaNum: number;
  sku: string;
  nombreArticulo: string;
  cliente: string;
  medidaReal: number;
  medidaStd: number;
  unidadMedida: string; // 'mts' o 'kgs'
  tipoEmpaque?: string; // 'Rollo', 'Caja', 'Bulto'
  esExcepcion: boolean;
  lote?: string;
  nroPedidoOrOc?: string;
}

interface BrotherLabelPrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  etiquetaData?: EtiquetaRolloItem | null;
  listaEtiquetas?: EtiquetaRolloItem[];
  nroPedido?: string;
  clienteNombre?: string;
}

export const BrotherLabelPrinterModal: React.FC<BrotherLabelPrinterModalProps> = ({
  isOpen,
  onClose,
  etiquetaData,
  listaEtiquetas,
  nroPedido = 'ef3d6ce3',
  clienteNombre = 'POSTO BLANCO SRL',
}) => {
  if (!isOpen) return null;

  const itemsToPrint: EtiquetaRolloItem[] = (listaEtiquetas && listaEtiquetas.length > 0)
    ? listaEtiquetas
    : [
        etiquetaData || {
          idSecuencia: '89e252e6-1',
          secuenciaNum: 1,
          sku: '9b09399',
          nombreArticulo: 'ACOLCHADO GRIS 16-3850TCX (170X250 - 2PLZAS)',
          cliente: clienteNombre,
          medidaReal: 54.5,
          medidaStd: 50.0,
          unidadMedida: 'mts',
          tipoEmpaque: 'Rollo',
          esExcepcion: true,
          lote: 'd2334dd4',
          nroPedidoOrOc: nroPedido,
        },
      ];

  const handleImprimir = () => {
    window.print();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
          
          {/* Header Modal */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 print:hidden">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">Impresora Brother QL-820NWB</h3>
                <p className="text-xs text-slate-400">
                  Etiqueta de Rollo LPN (29mm x 62mm) &bull; Total: <span className="text-red-400 font-bold">{itemsToPrint.length} etiquetas</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleImprimir}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-600/20"
              >
                <Printer className="w-4 h-4" />
                Imprimir Tirada ({itemsToPrint.length})
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Área de Visualización e Impresión (29mm x 62mm) */}
          <style>{`
            @media print {
              @page {
                size: 29mm 62mm;
                margin: 0 !important;
              }
              body {
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .print-modal-wrapper {
                background: white !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .print-label-item {
                width: 29mm !important;
                height: 62mm !important;
                page-break-after: always !important;
                break-after: page !important;
                margin: 0 !important;
                padding: 1mm !important;
                box-sizing: border-box !important;
                border: 1px solid black !important;
              }
            }
          `}</style>
          <div className="print-modal-wrapper p-6 bg-slate-800 flex flex-col items-center gap-6 overflow-y-auto max-h-[75vh] print:bg-white print:p-0 print:gap-0">
            {itemsToPrint.map((item, idx) => (
              <div
                key={idx}
                className="print-label-item bg-white text-black p-1 rounded-none shadow-2xl border-2 border-black w-[210px] h-[450px] flex flex-col justify-between overflow-hidden print:shadow-none print:border-2 print:border-black print:w-[29mm] print:h-[62mm]"
              >
                <div className="flex flex-col flex-1 justify-between w-full">
                  
                  {/* Frame 1: QR Code Prominente Superior */}
                  <div className="border border-black p-1 bg-white flex flex-col items-center justify-center flex-1">
                    <div className="border border-dashed border-black p-1 flex flex-col items-center justify-center bg-slate-50 w-full h-full">
                      <QrCode className="w-22 h-22 text-black" />
                      <span className="text-[7px] font-mono font-bold mt-0.5 text-slate-800 text-center">
                        {item.idSecuencia}
                      </span>
                    </div>
                  </div>

                  {/* Frame 2: BANNER OPEN CARGO */}
                  <div className="border border-black -mt-[1px] py-1 px-1 text-center bg-black text-white font-black text-xs uppercase tracking-wider leading-none">
                    OPEN CARGO
                  </div>

                  {/* Frame 3: RECUADRO RESALTADO DEBAJO DE OPEN CARGO (ARTÍCULO COMPUESTO ID-NUM) */}
                  <div className="border-2 border-black -mt-[1px] py-1.5 px-0.5 text-center font-black text-sm font-mono tracking-tight text-black bg-amber-100 print:bg-slate-100 leading-none">
                    {item.idSecuencia}
                  </div>

                  {/* Frame 4: Proceso / OC */}
                  <div className="border border-black -mt-[1px] p-1 text-left font-mono leading-tight bg-white">
                    <span className="text-[8px] font-sans font-semibold text-slate-700 block">Proceso/OC:</span>
                    <span className="text-xs font-black font-mono text-black block truncate">
                      {item.nroPedidoOrOc || nroPedido}
                    </span>
                  </div>

                  {/* Frame 5: Cliente Depositante */}
                  <div className="border border-black -mt-[1px] p-1 text-left font-mono leading-tight bg-white">
                    <span className="text-[8px] font-sans font-semibold text-slate-700 block">Cliente:</span>
                    <span className="text-[9px] font-bold uppercase font-sans text-black block truncate">
                      {item.cliente || clienteNombre}
                    </span>
                  </div>

                  {/* Frame 6: ARTÍCULO (SKU ARRIBA + DESCRIPCIÓN ABAJO) */}
                  <div className="border border-black -mt-[1px] p-1 text-left font-mono leading-tight bg-white">
                    <span className="text-[8px] font-sans font-semibold text-slate-700 block">Articulo:</span>
                    <span className="text-[11px] font-black italic font-mono text-black block truncate">
                      {item.sku}
                    </span>
                    <span className="text-[8px] font-bold text-slate-800 block truncate">
                      {item.nombreArticulo}
                    </span>
                  </div>

                  {/* Frame 7: Lote */}
                  <div className="border border-black -mt-[1px] p-1 text-left font-mono leading-tight bg-white flex justify-between items-center">
                    <span className="text-[8px] font-sans font-semibold text-slate-700">Lote:</span>
                    <span className="text-xs font-black font-mono text-black">
                      {item.lote || 'd2334dd4'}
                    </span>
                  </div>

                  {/* Frame 8: MEDIDA / PESO CON PROPIEDADES DE EMPAQUE (Tipo Empaque x Unidades/Medida) */}
                  <div className="border border-black -mt-[1px] p-1 bg-slate-100 text-left font-mono leading-tight">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-sans font-bold text-black uppercase">Medida / Empaque:</span>
                      {item.esExcepcion && (
                        <span className="text-[7px] font-sans font-black bg-black text-white px-1 rounded uppercase">
                          VAR
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-black font-mono text-black block mt-0.5">
                      {item.tipoEmpaque || 'Rollo'} x {item.medidaReal} {item.unidadMedida}
                    </span>
                  </div>

                </div>

                {/* Frame 9: Footer Skyline Open Cargo */}
                <div className="border border-black -mt-[1px] pt-1 pb-0.5 px-1 flex justify-between items-end bg-white">
                  <OpenCargoSkylineLogo className="w-full h-3.5 text-black" />
                </div>

              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-950 border-t border-slate-800 text-center text-[11px] text-slate-400 print:hidden">
            Etiqueta Brother 29x62mm: ID compuesto resaltado, SKU + Descripción, Lote y Empaque x Unidades.
          </div>

        </div>
      </div>
    </ModalPortal>
  );
};
