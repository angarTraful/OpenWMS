import React, { useState } from 'react';
import {
  X,
  Printer,
  Truck,
  Building2,
  MapPin,
  Package,
  QrCode,
  FileText,
} from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { OpenCargoSkylineLogo } from '@/components/common/OpenCargoSkylineLogo';

interface RotuloExpresoPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  bultoActual?: number;
  totalBultos?: number;
  transporteNombre?: string;
}

export const RotuloExpresoPrintModal: React.FC<RotuloExpresoPrintModalProps> = ({
  isOpen,
  onClose,
  pedido,
  bultoActual = 1,
  totalBultos = 1,
  transporteNombre = 'EXPRESO INTERIOR',
}) => {
  const [copias, setCopias] = useState<number>(totalBultos);

  if (!isOpen || !pedido) return null;

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

  const destinatario = pedido.destinatario || {};
  const cliente = pedido.cliente || {};

  return (
    <ModalPortal>
      <style>{`
        @media print {
          @page {
            size: 100mm 62mm;
            margin: 0 !important;
          }
        }
      `}</style>
      <div
        data-print-container="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto print:static print:block print:p-0 print:m-0 print:bg-white print:backdrop-blur-none print:w-full print:h-auto print:overflow-visible"
      >
        <div
          data-print-content="true"
          className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col print:static print:block print:w-full print:max-w-none print:h-auto print:max-h-none print:border-none print:shadow-none print:rounded-none print:bg-white print:text-black print:overflow-visible print:m-0 print:p-0"
        >
          
          {/* Header Modal */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 print:hidden">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-lg">Rótulo para Expreso (Interior)</h3>
                <p className="text-xs text-slate-400">
                  Impresora Brother (62mm x 100mm - DK-11202)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-xl text-xs transition-colors shadow-lg shadow-amber-600/20"
              >
                <Printer className="w-4 h-4" />
                Imprimir Rótulos ({copias})
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Rótulos Imprimibles Correlativos 1/N a N/N */}
          <div className="p-8 bg-slate-950 flex flex-col items-center gap-6 print:bg-white print:p-0 print:gap-0">
            {Array.from({ length: copias }).map((_, idx) => {
              const numBulto = idx + 1;
              return (
                <div
                  key={idx}
                  className="bg-white text-black p-4 rounded-xl shadow-2xl border-2 border-slate-400 w-[420px] h-[260px] flex flex-col justify-between print:shadow-none print:border-2 print:border-black print:w-[100mm] print:h-[62mm] print:rounded-none print:break-after-page"
                >
                  {/* Sección 1: Remitente & CUIT */}
                  <div className="text-[11px] font-sans leading-tight">
                    <p className="font-medium text-slate-800">
                      <span className="font-semibold text-black">Remitente:</span> {cliente.razon_social || 'OPEN CARGO LOGISTICS'}
                      <span className="mx-2 text-slate-400 font-bold">//</span>
                      <span className="font-semibold text-black">CUIT:</span> {cliente.identificacion_fiscal || '30-71234567-8'}
                    </p>
                    <p className="font-medium text-slate-800 mt-0.5">
                      <span className="font-semibold text-black">Dirección:</span> {cliente.direccion || 'Av. Principal 1234, Depósito Central'}
                    </p>
                  </div>

                  {/* Sección 2: Recuadro Punteado de DESTINATARIO */}
                  <div className="border-2 border-dashed border-black p-2.5 my-1 rounded-sm">
                    <p className="text-xs font-sans">
                      <span className="font-bold underline italic text-black mr-1">DESTINATARIO:</span>
                      <span className="font-bold text-sm uppercase text-black">{destinatario.razon_social || 'CLIENTE DESTINO'}</span>
                      <span className="font-semibold text-slate-800 ml-2">
                        ({destinatario.identificacion_fiscal || destinatario.telefono || 'Sin CUIT/Tel'})
                      </span>
                    </p>
                    <p className="text-xs font-medium text-slate-900 mt-1">
                      <span className="font-semibold text-black">Dirección:</span> {destinatario.direccion_entrega || 'Dirección de Entrega no especificada'}
                      {(destinatario.localidad || destinatario.ciudad) && (
                        <span className="font-bold text-black uppercase">
                          {' '}• {[destinatario.localidad, destinatario.ciudad].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Sección 3: TRANSPORTE */}
                  <div className="text-center font-bold text-sm font-sans uppercase my-0.5 text-black">
                    TRANSPORTE: <span className="font-black border-b-2 border-black pb-0.5">{transporteNombre || 'EXPRESO INTERIOR'}</span>
                  </div>

                  {/* Sección 4: Pie dividido en 2 columnas (Bulto Nro + Logo Open Cargo) */}
                  <div className="grid grid-cols-2 gap-3 items-stretch mt-1">
                    
                    {/* Columna Izquierda: Bulto Nro Ca / To */}
                    <div className="border-2 border-black p-1.5 flex flex-col justify-between items-center text-center">
                      <span className="text-[11px] font-black underline uppercase text-black block leading-none">
                        BULTO Nro.
                      </span>
                      <div className="text-2xl font-black font-mono flex items-center justify-center gap-1 my-1">
                        <span>{numBulto}</span>
                        <span className="text-3xl font-light text-slate-600">/</span>
                        <span>{copias}</span>
                      </div>
                    </div>

                    {/* Columna Derecha: OPEN CARGO Logistic Services */}
                    <div className="border-2 border-black p-1.5 flex flex-col justify-between text-center bg-white relative overflow-hidden">
                      {/* Skyline decorativo idéntico al vector oficial */}
                      <OpenCargoSkylineLogo className="w-full h-auto text-black mb-0.5" />
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-tight text-black leading-none">
                          OPEN CARGO <span className="text-[10px] font-semibold tracking-normal text-slate-800">Logistic Services</span>
                        </h3>
                      </div>
                      <p className="text-[10px] font-medium italic text-black mt-1">
                        RefId.: <span className="font-bold font-mono text-xs not-italic">{pedido.numero_pedido}</span>
                      </p>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </ModalPortal>
  );
};
