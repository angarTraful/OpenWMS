import React, { useRef } from 'react';
import {
  X,
  Printer,
  Truck,
  MapPin,
  Calendar,
  Phone,
  User,
  Package,
  CheckCircle2,
  Building2,
  Navigation,
} from 'lucide-react';
import { formatNumber, formatM3, formatDateTime } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { despachosApi } from '@/api/despachosApi';

interface HojaRutaPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruta: any;
}

export const HojaRutaPrintModal: React.FC<HojaRutaPrintModalProps> = ({
  isOpen,
  onClose,
  ruta,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !ruta) return null;

  const paradas = ruta.paradas || [];
  const totalBultos = paradas.reduce(
    (acc: number, p: any) => acc + Number(p.remito?.total_bultos || 1),
    0
  );
  const totalPeso = paradas.reduce(
    (acc: number, p: any) => acc + Number(p.remito?.peso_total_kg || 0),
    0
  );
  const totalVolumen = paradas.reduce(
    (acc: number, p: any) => acc + Number(p.remito?.volumen_total_m3 || 0),
    0
  );

  const handlePrint = () => {
    window.print();
  };

  const googleMapsUrl = despachosApi.generarGoogleMapsRutaCompletaUrl(
    paradas,
    ruta.orden_salida?.almacen?.direccion || ruta.orden_salida?.almacen?.nombre
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#333333] rounded-2xl max-w-4xl w-full flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
          {/* Barra Superior con Botón de Imprimir */}
          <div className="p-4 border-b border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#141414] flex items-center justify-between print:hidden">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-[#143d2c] dark:text-[#69f0ae] flex items-center justify-center font-bold">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-slate-900 dark:text-[#e5e2e1]">
                  Hoja de Ruta de Reparto &bull; {ruta.codigo_ruta}
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                  Vista previa para impresión y despacho en muelle
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] font-black text-xs uppercase tracking-wide shadow-md transition-all active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Hoja de Ruta</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#222222] dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Área Imprimible (Hoja Blanca para papel A4 estándar) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-[#0a0a0a]">
            <div
              ref={printAreaRef}
              className="bg-white text-black p-6 sm:p-8 rounded-xl shadow-lg max-w-3xl mx-auto space-y-6 font-sans text-xs print:p-0 print:shadow-none print:max-w-none print:w-full"
            >
              {/* Encabezado del Manifiesto */}
              <div className="flex items-start justify-between border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-wider text-black">
                    OPENWMS 3PL LOGISTICS
                  </h1>
                  <p className="text-[11px] text-gray-700">
                    Operaciones de Almacenamiento & Distribución Capilar
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Origen: {ruta.orden_salida?.almacen?.nombre || 'Centro de Distribución Central'} (
                    {ruta.orden_salida?.almacen?.direccion || 'Planta Principal'})
                  </p>
                </div>

                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-black text-white font-mono font-black text-sm uppercase rounded">
                    HOJA DE RUTA
                  </span>
                  <div className="font-mono text-base font-black mt-1 text-black">
                    {ruta.codigo_ruta}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    Fecha Emisión: {formatDateTime(new Date().toISOString())}
                  </div>
                </div>
              </div>

              {/* Datos del Transporte y Vehículo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-100 rounded-lg border border-gray-300">
                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-600 block">
                    Transporte:
                  </span>
                  <span className="font-bold text-black text-xs block">
                    {ruta.transporte_empresa}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-600 block">
                    Patente / Vehículo:
                  </span>
                  <span className="font-black text-black text-xs block font-mono">
                    {ruta.vehiculo_patente}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {ruta.tipo_vehiculo || 'Camión'}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-600 block">
                    Chofer / DNI:
                  </span>
                  <span className="font-bold text-black text-xs block">
                    {ruta.chofer_nombre}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    DNI: {ruta.chofer_documento || 'S/D'}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-600 block">
                    Teléfono Chofer:
                  </span>
                  <span className="font-bold text-black text-xs block font-mono">
                    {ruta.chofer_telefono || 'S/D'}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    Salida: {formatDateTime(ruta.fecha_hora_salida_estimada)}
                  </span>
                </div>
              </div>

              {/* Resumen de Carga */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded font-mono text-[11px]">
                <span>
                  Total Paradas: <b>{paradas.length}</b>
                </span>
                <span>
                  Total Bultos: <b>{totalBultos}</b>
                </span>
                <span>
                  Peso Bruto: <b>{formatNumber(totalPeso, 2)} kg</b>
                </span>
                <span>
                  Volumen: <b>{formatM3(totalVolumen)}</b>
                </span>
              </div>

              {/* Tabla de Paradas e Itinerario */}
              <div className="space-y-2">
                <h2 className="text-xs font-black uppercase text-black">
                  Itinerario de Entrega & Conformidad de Recepción
                </h2>

                <table className="w-full border-collapse border border-gray-400 text-[10px]">
                  <thead>
                    <tr className="bg-gray-200 text-black font-black uppercase">
                      <th className="border border-gray-400 px-2 py-1.5 text-center w-8">#</th>
                      <th className="border border-gray-400 px-2 py-1.5 text-left">
                        Destinatario & Dirección
                      </th>
                      <th className="border border-gray-400 px-2 py-1.5 text-left">
                        Pedido / Remito
                      </th>
                      <th className="border border-gray-400 px-2 py-1.5 text-center w-14">
                        Bultos / Peso
                      </th>
                      <th className="border border-gray-400 px-2 py-1.5 text-left w-48">
                        Firma, Aclaración & DNI Receptor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paradas.map((p: any, idx: number) => {
                      const dest = p.destinatario;
                      const pedido = p.pedido;
                      const remito = p.remito;

                      return (
                        <tr key={p.id || idx} className="border-b border-gray-400">
                          <td className="border border-gray-400 px-2 py-3 text-center font-bold text-sm">
                            {p.secuencia_parada || idx + 1}
                          </td>
                          <td className="border border-gray-400 px-2 py-3 space-y-0.5">
                            <div className="font-bold text-black text-[11px]">
                              {dest?.razon_social || 'Cliente'}
                            </div>
                            <div className="text-gray-800">
                              {dest?.direccion_entrega || 'Dirección sin especificar'} (
                              {dest?.ciudad || 'Localidad'})
                            </div>
                            {dest?.contacto_recepcion && (
                              <div className="text-gray-600 text-[9px]">
                                Contacto: {dest.contacto_recepcion}{' '}
                                {dest.telefono ? `• Tel: ${dest.telefono}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="border border-gray-400 px-2 py-3 space-y-0.5 font-mono">
                            <div className="font-bold text-black">
                              {pedido?.numero_pedido || 'Pedido'}
                            </div>
                            <div className="text-gray-700">
                              Remito Rx: {remito?.numero_remito_rx || 'Pendiente'}
                            </div>
                            {pedido?.orden_compra_cliente && (
                              <div className="text-gray-500 text-[9px]">
                                OC: {pedido.orden_compra_cliente}
                              </div>
                            )}
                          </td>
                          <td className="border border-gray-400 px-2 py-3 text-center font-mono font-bold">
                            <div>{remito?.total_bultos || 1} un.</div>
                            <div className="text-[9px] text-gray-600 font-normal">
                              {formatNumber(remito?.peso_total_kg || 0, 1)} kg
                            </div>
                          </td>
                          <td className="border border-gray-400 px-2 py-3 align-bottom text-[9px] text-gray-500">
                            {p.estado_entrega === 'entregado' ? (
                              <div className="text-green-800 font-bold">
                                ✓ ENTREGADO
                                {p.receptor_nombre && ` a ${p.receptor_nombre}`}
                                {p.receptor_documento && ` (DNI: ${p.receptor_documento})`}
                              </div>
                            ) : p.estado_entrega === 'con_novedad' ? (
                              <div className="text-red-800 font-bold">
                                ⚠ NOVEDAD: {p.motivo_novedad || 'Rechazado'}
                              </div>
                            ) : (
                              <div className="border-b border-dotted border-gray-400 h-10 flex items-end">
                                <span>Firma / DNI: _______________________</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Firmas de Despacho y Chofer */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-300">
                <div className="text-center space-y-1">
                  <div className="border-t border-black w-48 mx-auto" />
                  <span className="font-bold block text-[10px] text-black">
                    Firma & Sello Despacho Almacén
                  </span>
                  <span className="text-[9px] text-gray-600">Control de Salida de Mercadería</span>
                </div>

                <div className="text-center space-y-1">
                  <div className="border-t border-black w-48 mx-auto" />
                  <span className="font-bold block text-[10px] text-black">
                    Firma del Chofer / Transportista
                  </span>
                  <span className="text-[9px] text-gray-600">
                    {ruta.chofer_nombre} &bull; Patente {ruta.vehiculo_patente}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
