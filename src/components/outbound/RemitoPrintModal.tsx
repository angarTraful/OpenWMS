import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  FileCheck2,
  QrCode,
  Truck,
  Building2,
  Calendar,
  AlertCircle,
  RefreshCw,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { formatM3, formatNumber, formatDate, formatDateTime } from '@/lib/utils';
import { pedidosApi } from '@/api/pedidosApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface RemitoPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  onSuccess?: () => void;
}

export const RemitoPrintModal: React.FC<RemitoPrintModalProps> = ({
  isOpen,
  onClose,
  pedido,
  onSuccess,
}) => {
  const [numeroRemito, setNumeroRemito] = useState<string>('');
  const [cae, setCae] = useState<string>('');
  const [remitoEmitido, setRemitoEmitido] = useState<any | null>(null);
  const [pedidoCompleto, setPedidoCompleto] = useState<any>(pedido);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check if remito already exists for this pedido and load full details if needed
  useEffect(() => {
    if (isOpen && pedido) {
      setErrorMsg(null);
      const defaultRemitoNum = `0001-${String(Math.floor(10000000 + Math.random() * 90000000)).slice(0, 8)}`;
      setNumeroRemito(defaultRemitoNum);
      setCae('');

      const cargarDatos = async () => {
        setLoading(true);
        try {
          const [dataRemito, dataPedido] = await Promise.all([
            pedidosApi.obtenerRemitoPorPedido(pedido.id),
            (!pedido.detalles || pedido.detalles.length === 0)
              ? pedidosApi.obtenerPedidoConDetalle(pedido.id)
              : Promise.resolve(pedido),
          ]);

          if (dataRemito) {
            setRemitoEmitido(dataRemito);
          } else {
            setRemitoEmitido(null);
          }
          if (dataPedido) {
            setPedidoCompleto(dataPedido);
          }
        } catch (err: any) {
          console.error('Error buscando remito o detalle:', err);
        } finally {
          setLoading(false);
        }
      };

      cargarDatos();
    }
  }, [isOpen, pedido]);

  const handleEmitir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido) return;
    setErrorMsg(null);

    if (!numeroRemito.trim()) {
      setErrorMsg('Debe ingresar un número de Remito fiscal.');
      return;
    }

    setIsSubmitting(true);
    try {
      await pedidosApi.emitirRemitoRx({
        pedidoId: pedido.id,
        numeroRemitoRx: numeroRemito.trim(),
        cae: cae.trim() || undefined,
      });

      // Reload extended remito
      const updated = await pedidosApi.obtenerRemitoPorPedido(pedido.id);
      setRemitoEmitido(updated);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error al emitir remito Rx:', err);
      setErrorMsg(err.message || 'Error al emitir el remito fiscal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen || !pedido) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-md animate-fade-in print:p-0 print:bg-white">
      <div className="relative w-full max-w-4xl max-h-[96vh] rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-[#e5e2e1] print:max-w-none print:max-h-none print:border-none print:shadow-none print:bg-white print:text-black">
        
        {/* Modal Top Bar (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-emerald-50 dark:bg-[#0f241a] border border-emerald-200 dark:border-[#1b4332] text-emerald-700 dark:text-[#69f0ae]">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                Remito Rx de Tránsito y Despacho
                {remitoEmitido && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-50 dark:bg-[#0f241a] text-emerald-700 dark:text-[#69f0ae] border border-emerald-200 dark:border-[#1b4332]">
                    {remitoEmitido.numero_remito_rx}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Documento de amparo de mercadería en tránsito para transportista y destinatario.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {remitoEmitido && (
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir Documento
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 print:p-0 print:overflow-visible">
          {errorMsg && (
            <div className="p-3.5 rounded bg-rose-50 border border-rose-200 text-rose-700 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-sm flex items-start gap-3 print:hidden">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-[#ffb4ab] mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500 dark:text-[#cdc3d4]">
              <RefreshCw className="w-6 h-6 animate-spin text-violet-600 dark:text-[#dab9ff] mr-2" />
              <span>Cargando datos del remito...</span>
            </div>
          ) : !remitoEmitido ? (
            /* Emission Form */
            <div className="max-w-xl mx-auto p-6 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-5 shadow-sm">
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1]">Emitir Remito Rx Oficial</h3>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                  Ingresa o valida el número fiscal y código de autorización antes de despachar.
                </p>
              </div>

              <form onSubmit={handleEmitir} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                    Número de Remito Rx (Formato Punto de Venta) *
                  </label>
                  <input
                    type="text"
                    value={numeroRemito}
                    onChange={(e) => setNumeroRemito(e.target.value)}
                    placeholder="ej: 0001-00045892"
                    className="w-full px-3.5 py-2.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]/70 mt-1 block">
                    Puedes ajustar el prefijo y número correlativo según tu talonario fiscal o ERP.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                    Código de Autorización Fiscal Electrónica (CAE / Ref Fiscal Opcional)
                  </label>
                  <input
                    type="text"
                    value={cae}
                    onChange={(e) => setCae(e.target.value)}
                    placeholder="ej: 72418930481234"
                    className="w-full px-3.5 py-2.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>

                <div className="p-3 rounded bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs space-y-1 text-slate-600 dark:text-[#cdc3d4]">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#cdc3d4]/80">Pedido a amparar:</span>
                    <span className="font-mono text-slate-900 dark:text-[#e5e2e1] font-semibold">{pedido.numero_pedido}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#cdc3d4]/80">Cliente:</span>
                    <span className="text-slate-900 dark:text-[#e5e2e1] font-medium">{pedido.cliente?.razon_social}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-[#cdc3d4]/80">Destinatario:</span>
                    <span className="text-slate-900 dark:text-[#e5e2e1] font-medium">{pedido.destinatario?.razon_social}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Emitiendo Remito Rx...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar y Generar Remito Rx
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Printable Voucher Card (Simulates official legal shipping note) */
            <div className="bg-white text-slate-900 p-6 sm:p-8 rounded-2xl shadow-md border border-slate-200 font-sans print:shadow-none print:border-none print:p-4 text-xs">
              
              {/* Header: Company & Voucher Info */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-700 text-white font-bold flex items-center justify-center text-sm">
                      WMS
                    </div>
                    <div>
                      <h1 className="text-base font-extrabold tracking-tight text-slate-950 uppercase">
                        OpenWMS 3PL LOGISTICS S.A.
                      </h1>
                      <p className="text-[10px] text-slate-600">
                        Operador Logístico 3PL & Centro de Distribución
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">
                    RUT / CUIT: 30-71489201-9 | Ingresos Brutos: 901-284910-1
                  </p>
                  <p className="text-[10px] text-slate-600">
                    Casa Central / Depósito Fiscal: Av. Industrial 4500, Sector Logístico
                  </p>
                </div>

                {/* Central Letter 'R' / Document Type */}
                <div className="text-center px-4 py-1 border-2 border-slate-900 rounded-lg">
                  <div className="text-2xl font-black">R</div>
                  <div className="text-[9px] uppercase font-bold tracking-wider">Cód. 091</div>
                </div>

                {/* Right side: Remito number & Date */}
                <div className="text-right">
                  <div className="text-sm font-extrabold font-mono text-slate-950">
                    REMITO Rx DE TRÁNSITO
                  </div>
                  <div className="text-base font-mono font-bold text-blue-800">
                    N° {remitoEmitido.numero_remito_rx}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1">
                    Fecha de Emisión: {formatDateTime(remitoEmitido.fecha_emision)}
                  </div>
                  {remitoEmitido.cae_o_autorizacion_fiscal && (
                    <div className="text-[10px] font-mono text-slate-800 mt-0.5">
                      C.A.E.: <strong>{remitoEmitido.cae_o_autorizacion_fiscal}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Two-box section: Cliente Depositante & Destinatario */}
              <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-lg p-3 mb-4 bg-slate-50/50">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Cliente Depositante (Propietario 3PL)
                  </h4>
                  <div className="font-bold text-slate-950 text-xs">
                    {remitoEmitido.cliente?.razon_social || pedido.cliente?.razon_social}
                  </div>
                  <div className="text-[10px] text-slate-700">
                    ID Fiscal: {remitoEmitido.cliente?.identificacion_fiscal || 'Sin CUIT registrado'}
                  </div>
                  <div className="text-[10px] text-slate-700">
                    Unidad de Negocio: {remitoEmitido.cliente?.unidad_negocio || 'General'}
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Lugar y Datos de Entrega (Destinatario)
                  </h4>
                  <div className="font-bold text-slate-950 text-xs">
                    {remitoEmitido.destinatario?.razon_social || pedido.destinatario?.razon_social}
                  </div>
                  <div className="text-[10px] text-slate-700">
                    Dirección: {remitoEmitido.destinatario?.direccion_entrega || pedido.destinatario?.direccion_entrega}
                  </div>
                  <div className="text-[10px] text-slate-700">
                    Ciudad / Localidad: {remitoEmitido.destinatario?.ciudad || 'No especificada'}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-4">
                <table className="w-full border-collapse border border-slate-300 text-left">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-r border-slate-300 w-24">Código SKU</th>
                      <th className="p-2 border-r border-slate-300">Descripción del Artículo</th>
                      <th className="p-2 border-r border-slate-300 text-center w-24">Cant. Bultos</th>
                      <th className="p-2 border-r border-slate-300 text-right w-24">Peso (kg)</th>
                      <th className="p-2 text-right w-24">Volumen (M³)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(pedidoCompleto?.detalles || pedido.detalles)?.map((d: any) => {
                      const art = d.articulo;
                      const cant = d.cantidad_separada || d.cantidad_solicitada || 0;
                      const p = art ? cant * (art.peso_unitario_kg || 0) : 0;
                      const v = art ? cant * (art.volumen_unitario_m3 || 0) : 0;

                      return (
                        <tr key={d.id}>
                          <td className="p-2 font-mono border-r border-slate-300 text-[11px]">
                            {art?.sku || 'SKU'}
                          </td>
                          <td className="p-2 border-r border-slate-300 font-medium">
                            {art?.nombre || 'Artículo'}
                          </td>
                          <td className="p-2 text-center border-r border-slate-300 font-mono font-bold">
                            {cant}
                          </td>
                          <td className="p-2 text-right border-r border-slate-300 font-mono">
                            {formatNumber(p, 2)}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {formatM3(v)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Logistic Totals Ribbon */}
              <div className="grid grid-cols-5 gap-2 border border-slate-900 rounded-lg p-3 bg-slate-50 mb-6 text-center font-mono">
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Total Bultos</div>
                  <div className="text-sm font-bold text-slate-950">{remitoEmitido.total_bultos}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Total Pallets</div>
                  <div className="text-sm font-bold text-slate-950">{remitoEmitido.total_pallets}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Peso Bruto</div>
                  <div className="text-sm font-bold text-slate-950">{formatNumber(remitoEmitido.peso_total_kg, 2)} kg</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Volumen M³</div>
                  <div className="text-sm font-bold text-blue-700">{formatM3(remitoEmitido.volumen_total_m3)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Val. Declarado</div>
                  <div className="text-sm font-bold text-emerald-700">${formatNumber(remitoEmitido.valor_declarado_total, 2)}</div>
                </div>
              </div>

              {/* Signatures & Conformity Slips */}
              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-300 text-center">
                <div className="border border-dashed border-slate-400 p-4 rounded-lg flex flex-col justify-between h-28">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">
                    Transportista / Conductor
                  </div>
                  <div className="border-t border-slate-400 pt-1 text-[10px] text-slate-700">
                    Firma, Aclaración y DNI del Conductor
                  </div>
                </div>

                <div className="border border-dashed border-slate-400 p-4 rounded-lg flex flex-col justify-between h-28">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">
                    Recepción Conforme (Destinatario)
                  </div>
                  <div className="border-t border-slate-400 pt-1 text-[10px] text-slate-700">
                    Firma, Sello, Aclaración y Fecha de Recepción
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[9px] text-slate-400 flex items-center justify-between">
                <span>Comprobante de traslado interjurisdiccional amparado por AFIP/DGI.</span>
                <span>Documento generado por OpenWMS 3PL System</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </ModalPortal>
  );
};
