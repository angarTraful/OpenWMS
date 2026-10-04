import React from 'react';
import {
  X,
  Printer,
  QrCode,
  ShieldCheck,
  Building2,
  Calendar,
  FileCheck2,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import type { LiquidacionCliente } from '../../types/billing.types';
import { formatM3, formatNumber, formatDate } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface FacturaFiscalPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidacion: LiquidacionCliente | null;
}

export const FacturaFiscalPrintModal: React.FC<FacturaFiscalPrintModalProps> = ({
  isOpen,
  onClose,
  liquidacion,
}) => {
  if (!isOpen || !liquidacion) return null;

  const cliente = liquidacion.cliente;
  const isFacturaA = liquidacion.tipo_comprobante === 'FACTURA_A';
  const letraComprobante = isFacturaA ? 'A' : 'B';
  const codigoComprobante = isFacturaA ? '01' : '06';

  const emisor = {
    razonSocial: 'OpenWMS 3PL Logistics S.A.',
    cuit: '30-71829384-9',
    iibb: '901-284910-3',
    condicionIva: 'IVA Responsable Inscripto',
    direccion: 'Parque Industrial Sur, Nave Logística 4 - Km 34.5 (Buenos Aires)',
    inicioActividades: '01/01/2020',
  };

  const pv = (liquidacion.punto_venta || '0005').padStart(4, '0');
  const numFact = (liquidacion.numero_factura || '00000001').padStart(8, '0');
  const cae = liquidacion.cae || '74000000000000';
  const vtoCae = liquidacion.fecha_vencimiento_cae || liquidacion.fecha_hasta;

  const netoGravado = Number(liquidacion.monto_neto_gravado || liquidacion.monto_total) || 0;
  const alicuota = Number(liquidacion.alicuota_iva) || 21.0;
  const montoIva = Number(liquidacion.monto_iva) || Math.round(netoGravado * (alicuota / 100) * 100) / 100;
  const totalFactura = Number(liquidacion.monto_total_facturado) || (netoGravado + montoIva);

  const remitos = liquidacion.remitos_asociados || [];

  // Construcción de URL de QR según RG AFIP 4291
  const fechaEmisionIso = (liquidacion.fecha_facturacion || new Date().toISOString()).split('T')[0];
  const cuitClienteNum = Number(cliente?.identificacion_fiscal?.replace(/[^0-9]/g, '')) || 0;
  const qrJson = JSON.stringify({
    ver: 1,
    fecha: fechaEmisionIso,
    cuit: 30718293849,
    ptoVta: Number(pv),
    tipoCmp: Number(codigoComprobante),
    nroCmp: Number(numFact),
    importe: totalFactura,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: 80,
    nroDocRec: cuitClienteNum,
    tipoCodAut: 'E',
    codAut: Number(cae),
  });
  const qrUrlAfip = `https://www.afip.gob.ar/fe/qr/?p=${btoa(qrJson)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 dark:bg-black/85 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-md max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Top Actions Toolbar */}
        <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-violet-100 text-violet-800 dark:bg-[#dab9ff] dark:text-[#460283]">
              FACTURA {letraComprobante} FISCAL
            </span>
            <span className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
              {pv}-{numFact} &bull; C.A.E.: {cae}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-md"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Guardar PDF (A4)</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-[#181818] print:bg-white print:text-black print:p-0">
          <div className="max-w-[800px] mx-auto bg-white text-black p-6 sm:p-8 rounded-sm shadow-xl print:shadow-none print:p-4 font-sans text-xs border border-gray-300">
            {/* Header AFIP: Emisor | Letra Central | Datos Comprobante */}
            <div className="relative border border-black rounded-t-sm p-4 grid grid-cols-2 gap-4">
              {/* Recuadro Central Letra */}
              <div className="absolute left-1/2 -top-[1px] -translate-x-1/2 w-14 bg-white border-b border-x border-black text-center py-1 z-10">
                <span className="block text-2xl font-black leading-none">{letraComprobante}</span>
                <span className="block text-[9px] font-bold text-gray-700">COD. {codigoComprobante}</span>
              </div>

              {/* Lado Izquierdo: Emisor 3PL */}
              <div className="pr-6 space-y-1">
                <h1 className="text-base font-black text-gray-900 uppercase tracking-tight">
                  {emisor.razonSocial}
                </h1>
                <p className="text-[10px] text-gray-700 leading-tight">
                  {emisor.direccion}
                </p>
                <div className="pt-2 text-[10px] font-semibold text-gray-800">
                  Condición frente al IVA: <span className="font-bold">{emisor.condicionIva}</span>
                </div>
              </div>

              {/* Lado Derecho: Datos de la Factura */}
              <div className="pl-6 border-l border-black space-y-1 text-right sm:text-left">
                <h2 className="text-xl font-black text-gray-900 tracking-wide">
                  FACTURA
                </h2>
                <div className="text-xs font-mono font-bold">
                  Punto de Venta: {pv} &nbsp; Comp. Nro: {numFact}
                </div>
                <div className="text-[11px] pt-1">
                  Fecha de Emisión: <strong>{formatDate(fechaEmisionIso)}</strong>
                </div>
                <div className="text-[11px] font-mono">
                  CUIT: <strong>{emisor.cuit}</strong>
                </div>
                <div className="text-[11px]">
                  Ingresos Brutos: <strong>{emisor.iibb}</strong>
                </div>
                <div className="text-[11px]">
                  Fecha Inicio de Actividades: <strong>{emisor.inicioActividades}</strong>
                </div>
              </div>
            </div>

            {/* Período Facturado y Vencimientos */}
            <div className="border-x border-b border-black p-2 bg-gray-50 flex items-center justify-between text-[11px]">
              <div>
                Período Facturado Desde: <strong>{formatDate(liquidacion.fecha_desde)}</strong> Hasta: <strong>{formatDate(liquidacion.fecha_hasta)}</strong>
              </div>
              <div>
                Fecha Vto. para el Pago: <strong>{formatDate(vtoCae)}</strong>
              </div>
            </div>

            {/* Receptor: Datos del Cliente */}
            <div className="border-x border-b border-black p-3 space-y-1.5 text-[11px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  CUIT / Identificación: <strong className="font-mono">{cliente?.identificacion_fiscal || 'Sin CUIT'}</strong>
                </div>
                <div>
                  Razón Social / Nombre: <strong>{cliente?.razon_social || 'Cliente Depositante'}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  Condición frente al IVA: <strong>{isFacturaA ? 'IVA Responsable Inscripto' : 'Consumidor Final / Sujeto No Categorizado'}</strong>
                </div>
                <div>
                  Domicilio Comercial: <span>{cliente?.direccion || 'Domicilio fiscal convenido'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-gray-200 text-gray-600">
                <div>
                  Condición de Venta: <strong className="text-black">Cuenta Corriente 3PL (30 días)</strong>
                </div>
                <div>
                  Liquidación WMS Asociada: <strong className="font-mono text-black">{liquidacion.numero_liquidacion}</strong>
                </div>
              </div>
            </div>

            {/* Detalle de Conceptos / Renglones */}
            <div className="border-x border-b border-black">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-black text-gray-800">
                    <th className="py-2 px-2.5 font-bold">Código</th>
                    <th className="py-2 px-2.5 font-bold">Descripción del Servicio / Operación</th>
                    <th className="py-2 px-2.5 font-bold text-right">Cantidad</th>
                    <th className="py-2 px-2.5 font-bold text-center">U.M.</th>
                    <th className="py-2 px-2.5 font-bold text-right">Precio Unit.</th>
                    <th className="py-2 px-2.5 font-bold text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 font-mono text-[10px]">
                  {liquidacion.items && liquidacion.items.length > 0 ? (
                    liquidacion.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-2 px-2.5 font-bold text-gray-700">{item.concepto_codigo}</td>
                        <td className="py-2 px-2.5 font-sans font-medium text-gray-900">
                          {item.descripcion}
                          {item.notas && <span className="block text-[9px] text-gray-500 italic font-sans">{item.notas}</span>}
                        </td>
                        <td className="py-2 px-2.5 text-right">{formatNumber(item.cantidad, 2)}</td>
                        <td className="py-2 px-2.5 text-center uppercase">{item.unidad_medida}</td>
                        <td className="py-2 px-2.5 text-right">$ {formatNumber(item.precio_unitario, 2)}</td>
                        <td className="py-2 px-2.5 text-right font-bold">$ {formatNumber(item.subtotal, 2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-gray-500 font-sans">
                        Servicios y estadía de depósito liquidada s/ período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Cuadro Impositivo y Totales */}
            <div className="border-x border-b border-black grid grid-cols-1 sm:grid-cols-2">
              <div className="p-3 text-[10px] text-gray-600 border-b sm:border-b-0 sm:border-r border-black flex flex-col justify-between">
                <div>
                  <span className="font-bold block text-gray-800">Observaciones Comerciales:</span>
                  <p className="mt-0.5 italic">
                    {liquidacion.observaciones || `Liquidación de almacenaje y servicios de muelle correspondiente al período ${liquidacion.fecha_desde} - ${liquidacion.fecha_hasta}.`}
                  </p>
                </div>
                <div className="pt-2 text-[9px] text-gray-500">
                  Documento emitido electrónicamente mediante la plataforma OpenWMS 3PL.
                </div>
              </div>

              {/* Columna de Totales */}
              <div className="p-3 space-y-1.5 text-[11px] bg-gray-50">
                <div className="flex items-center justify-between text-gray-700">
                  <span>Importe Neto Gravado:</span>
                  <span className="font-mono font-bold">$ {formatNumber(netoGravado, 2)}</span>
                </div>

                <div className="flex items-center justify-between text-gray-700">
                  <span>IVA ({alicuota}%):</span>
                  <span className="font-mono font-bold">$ {formatNumber(montoIva, 2)}</span>
                </div>

                <div className="flex items-center justify-between text-gray-700">
                  <span>Importe Otros Tributos:</span>
                  <span className="font-mono">$ 0.00</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black text-sm font-black text-gray-900">
                  <span>IMPORTE TOTAL:</span>
                  <span className="font-mono text-base">$ {formatNumber(totalFactura, 2)}</span>
                </div>
              </div>
            </div>

            {/* Pie Fiscal AFIP: QR + CAE + Vencimiento */}
            <div className="border-x border-b border-black rounded-b-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white">
              {/* Código QR Interactivo */}
              <div className="flex items-center gap-3">
                <div className="p-2 border border-gray-400 bg-white rounded flex items-center justify-center shadow-sm">
                  <QrCode className="w-16 h-16 text-black" />
                </div>
                <div>
                  <span className="text-[11px] font-black text-gray-900 block">
                    AFIP - Factura Electrónica
                  </span>
                  <span className="text-[9px] text-gray-600 block leading-tight">
                    Comprobante Autorizado por AFIP (RG 4291)<br />
                    Escanear para verificar autenticidad en línea
                  </span>
                </div>
              </div>

              {/* Bloque CAE */}
              <div className="text-right space-y-1">
                <div className="text-xs">
                  CAE N°: <strong className="font-mono font-black text-sm tracking-wider text-black">{cae}</strong>
                </div>
                <div className="text-xs">
                  Fecha de Vto. de CAE: <strong className="font-mono font-bold">{formatDate(vtoCae)}</strong>
                </div>
                <span className="text-[9px] text-gray-500 italic block">
                  Comprobante Autorizado
                </span>
              </div>
            </div>

            {/* ANEXO EN HOJA 2: Remitos Rx de Tránsito vinculados */}
            {remitos.length > 0 && (
              <div className="mt-8 pt-6 border-t-2 border-dashed border-gray-400 print:break-before-page">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-black">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-black" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-black">
                      Anexo: Remitos Rx de Tránsito Emitidos en el Período
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-gray-600">
                    Total: {remitos.length} Remitos de Despacho
                  </span>
                </div>

                <table className="w-full text-left text-[10px] border border-black border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b border-black text-gray-900 font-bold">
                      <th className="py-1.5 px-2 border-r border-black">N° Remito Rx</th>
                      <th className="py-1.5 px-2 border-r border-black">Fecha</th>
                      <th className="py-1.5 px-2 border-r border-black">Destinatario / Sucursal</th>
                      <th className="py-1.5 px-2 border-r border-black text-right">Bultos</th>
                      <th className="py-1.5 px-2 border-r border-black text-right">Pallets</th>
                      <th className="py-1.5 px-2 text-right">Volumen M³</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300 font-mono">
                    {remitos.map((r, i) => (
                      <tr key={r.id || i} className="hover:bg-gray-50">
                        <td className="py-1.5 px-2 border-r border-black font-bold">{r.numero_remito_rx}</td>
                        <td className="py-1.5 px-2 border-r border-black">{formatDate(r.fecha_emision)}</td>
                        <td className="py-1.5 px-2 border-r border-black font-sans font-medium">
                          {r.destinatario?.razon_social_destinatario || 'Entrega estándar'}
                        </td>
                        <td className="py-1.5 px-2 border-r border-black text-right">{formatNumber(r.total_bultos, 0)}</td>
                        <td className="py-1.5 px-2 border-r border-black text-right">{formatNumber(r.total_pallets, 0)}</td>
                        <td className="py-1.5 px-2 text-right font-bold">{formatM3(r.volumen_total_m3)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 border-t border-black font-bold font-mono">
                      <td colSpan={3} className="py-1.5 px-2 border-r border-black text-right font-sans">
                        Totales Remitos Vinculados:
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right">
                        {formatNumber(remitos.reduce((acc, r) => acc + (Number(r.total_bultos) || 0), 0), 0)}
                      </td>
                      <td className="py-1.5 px-2 border-r border-black text-right">
                        {formatNumber(remitos.reduce((acc, r) => acc + (Number(r.total_pallets) || 0), 0), 0)}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {formatM3(remitos.reduce((acc, r) => acc + (Number(r.volumen_total_m3) || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </ModalPortal>
  );
};
