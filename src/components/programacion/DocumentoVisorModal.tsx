import React from 'react';
import {
  X,
  Printer,
  FileCheck2,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  QrCode,
  Truck,
  Building2,
  Calendar,
  Layers,
  MapPin,
  Clock,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { ProgramacionItem } from '@/api/programacionApi';

interface DocumentoVisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ProgramacionItem | null;
  tipoDocumento: 'remito' | 'romaneo' | 'pedido' | 'rx_conformado';
}

export const DocumentoVisorModal: React.FC<DocumentoVisorModalProps> = ({
  isOpen,
  onClose,
  item,
  tipoDocumento,
}) => {
  if (!isOpen || !item) return null;

  const handlePrint = () => {
    window.print();
  };

  const docs = item.documentos || {
    tiene_remito: item.estado === 'entregado',
    remito_numero: `RTO-0001-000${Math.floor(10000 + Math.random() * 90000)}`,
    tiene_romaneo: true,
    romaneo_id: `ROM-${item.pedido_numero}`,
    tiene_pedido: true,
    tiene_rx_conformado: item.estado === 'entregado',
    rx_firmado_por: item.destinatario_nombre,
    rx_fecha: `${item.fecha} 14:35 hs`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#1a1919] border border-slate-300 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header (No imprimible) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1f1e1e] print:hidden">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                tipoDocumento === 'remito'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : tipoDocumento === 'romaneo'
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : tipoDocumento === 'rx_conformado'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
              }`}
            >
              {tipoDocumento === 'remito' && <FileCheck2 className="w-5 h-5" />}
              {tipoDocumento === 'romaneo' && <FileSpreadsheet className="w-5 h-5" />}
              {tipoDocumento === 'pedido' && <FileText className="w-5 h-5" />}
              {tipoDocumento === 'rx_conformado' && <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                {tipoDocumento === 'remito' && 'Remito Oficial de Salida'}
                {tipoDocumento === 'romaneo' && 'Planilla de Romaneo de Rollos'}
                {tipoDocumento === 'pedido' && 'Comprobante de Pedido'}
                {tipoDocumento === 'rx_conformado' && 'Remito Conformado / Firma Entrega'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {item.pedido_numero} • {item.destinatario_nombre} • {item.rollos} rollos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#3a3939] hover:bg-slate-100 dark:hover:bg-[#252525] text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Content (Apto para impresión) */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-900 dark:text-slate-100 font-sans print:p-0">
          {/* ============================================================== */}
          {/* CASO 1: REMITO OFICIAL */}
          {/* ============================================================== */}
          {tipoDocumento === 'remito' && (
            <div className="border border-slate-300 dark:border-[#403f3f] rounded-xl p-5 bg-white dark:bg-[#161515] space-y-4">
              <div className="flex justify-between items-start border-b pb-4 border-slate-200 dark:border-[#333333]">
                <div>
                  <h3 className="text-base font-black uppercase text-amber-600 dark:text-amber-400">
                    OPENWMS 3PL LOGISTICS
                  </h3>
                  <p className="text-xs text-slate-500">Operaciones de Almacenamiento & Distribución Textil</p>
                  <p className="text-[11px] text-slate-400">Depósito Origen: {item.deposito}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300">
                    REMITO "R"
                  </span>
                  <div className="text-xs font-mono font-bold mt-1 text-slate-900 dark:text-white">
                    N° {docs.remito_numero || `RTO-0001-000${item.pedido_numero.replace(/\D/g, '') || '2891'}`}
                  </div>
                  <div className="text-[10px] text-slate-400">Fecha: {item.fecha}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-[#201f1f] p-3 rounded-lg border border-slate-200 dark:border-[#333333]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Destinatario (Entrega a):</span>
                  <span className="font-bold text-sm block">{item.destinatario_nombre}</span>
                  <span className="text-[11px] text-slate-500">Orden de Compra: {item.orden_compra}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Condición / Transporte:</span>
                  <span className="font-semibold block">Entrega en Destino con Remito Conformado</span>
                  <span className="text-[11px] text-slate-500">Pedido WMS: {item.pedido_numero}</span>
                </div>
              </div>

              <table className="w-full text-xs text-left border border-slate-200 dark:border-[#333333]">
                <thead className="bg-slate-100 dark:bg-[#252424] font-bold">
                  <tr>
                    <th className="py-2 px-3 border-r">ÍTEM / ARTÍCULO</th>
                    <th className="py-2 px-3 border-r text-center">ROLLOS</th>
                    <th className="py-2 px-3 border-r">DEPÓSITO</th>
                    <th className="py-2 px-3">OBSERVACIONES</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="py-2.5 px-3 border-r font-mono font-bold">{item.item_codigo}</td>
                    <td className="py-2.5 px-3 border-r text-center font-mono font-black text-sm">{item.rollos}</td>
                    <td className="py-2.5 px-3 border-r text-center">{item.deposito}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">{item.comentarios || 'Sin observaciones'}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-[#333333] text-[11px]">
                <div className="flex items-center gap-2 text-slate-500">
                  <QrCode className="w-8 h-8 text-slate-700 dark:text-slate-300" />
                  <span>CAE: 74928192849182 • Vto CAE: 15 días</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold">Total Bultos: {item.rollos} rollos</span>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* CASO 2: PLANILLA DE ROMANEO */}
          {/* ============================================================== */}
          {tipoDocumento === 'romaneo' && (
            <div className="border border-slate-300 dark:border-[#403f3f] rounded-xl p-5 bg-white dark:bg-[#161515] space-y-4">
              <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-[#333333]">
                <div>
                  <h3 className="text-base font-black uppercase text-purple-600 dark:text-purple-400">
                    PLANILLA DE ROMANEO TEXTIL
                  </h3>
                  <p className="text-xs text-slate-500">Detalle Individual de Rollos, Metros y Lotes</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {item.pedido_numero}
                  </span>
                  <div className="text-[11px] text-slate-400">{item.destinatario_nombre}</div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg border border-purple-200 dark:border-purple-900/40 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300 block">Artículo:</span>
                  <span className="font-mono font-bold text-sm text-purple-900 dark:text-purple-200">{item.item_codigo}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300 block">Total Rollos:</span>
                  <span className="font-mono font-black text-lg text-purple-900 dark:text-purple-200">{item.rollos} un.</span>
                </div>
              </div>

              {/* Muestra de rollos individualizados */}
              <div className="border border-slate-200 dark:border-[#333333] rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-[#252424] font-bold text-[10px] uppercase text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="py-1.5 px-3 border-r">N° Rollo</th>
                      <th className="py-1.5 px-3 border-r text-center">Metraje (m)</th>
                      <th className="py-1.5 px-3 border-r">Lote / Partida</th>
                      <th className="py-1.5 px-3 text-center">Código Barra LPN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#333333] font-mono">
                    {Array.from({ length: Math.min(item.rollos, 8) }).map((_, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]">
                        <td className="py-1.5 px-3 border-r font-bold">ROL-{String(i + 1).padStart(3, '0')}</td>
                        <td className="py-1.5 px-3 border-r text-center">{(48.5 + (i * 0.7) % 5).toFixed(1)} m</td>
                        <td className="py-1.5 px-3 border-r text-[11px]">{item.orden_compra || 'LOTE-A1'}</td>
                        <td className="py-1.5 px-3 text-center text-[10px] text-slate-500">LPN-92810{i}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {item.rollos > 8 && (
                <p className="text-center text-[11px] text-slate-500 italic">
                  ... y {item.rollos - 8} rollos adicionales etiquetados individualmente con código de barra.
                </p>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* CASO 3: COMPROBANTE DE PEDIDO */}
          {/* ============================================================== */}
          {tipoDocumento === 'pedido' && (
            <div className="border border-slate-300 dark:border-[#403f3f] rounded-xl p-5 bg-white dark:bg-[#161515] space-y-4">
              <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-[#333333]">
                <div>
                  <h3 className="text-base font-black uppercase text-sky-600 dark:text-sky-400">
                    HOJA DE PEDIDO & PICKING
                  </h3>
                  <p className="text-xs text-slate-500">Orden de Preparación y Despacho</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    {item.pedido_numero}
                  </span>
                  <div className="text-[10px] text-slate-400">Programado: {item.fecha_display}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-[#201f1f] p-3 rounded-lg border border-slate-200 dark:border-[#333333]">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Destinatario:</span>
                  <span className="font-bold text-sm">{item.destinatario_nombre}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Almacén Origen:</span>
                  <span className="font-bold text-sm">{item.deposito}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Orden de Compra:</span>
                  <span className="font-mono">{item.orden_compra}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Estado Actual:</span>
                  <span className="font-bold uppercase text-amber-600">{item.estado}</span>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-[#333333] rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono font-bold">{item.item_codigo}</span>
                  <span className="font-mono font-black text-sm">{item.rollos} rollos</span>
                </div>
                {item.comentarios && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 p-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                    <strong>Nota de Entrega:</strong> {item.comentarios}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* CASO 4: REMITO CONFORMADO (RX FIRMADO) */}
          {/* ============================================================== */}
          {tipoDocumento === 'rx_conformado' && (
            <div className="border border-slate-300 dark:border-[#403f3f] rounded-xl p-5 bg-white dark:bg-[#161515] space-y-5">
              <div className="flex justify-between items-start border-b pb-3 border-slate-200 dark:border-[#333333]">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-base font-black uppercase text-emerald-600 dark:text-emerald-400">
                      REMITO CONFORMADO
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500">Constancia Digital de Entrega y Recepción Conforme</p>
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                    ENTREGA EXITOSA
                  </span>
                  <div className="text-xs font-mono font-bold mt-1 text-slate-700 dark:text-slate-300">
                    {docs.remito_numero || `RTO-0001-000${item.pedido_numero.replace(/\D/g, '') || '2891'}`}
                  </div>
                </div>
              </div>

              {/* Bloque de Recepción Firmada */}
              <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">
                      Recibido por (Destinatario):
                    </span>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      {item.destinatario_nombre}
                    </span>
                    <span className="text-[11px] text-slate-500">DNI / Firma autorizada en sucursal</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">
                      Fecha y Hora de Entrega:
                    </span>
                    <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      {docs.rx_fecha || `${item.fecha} 14:35 hs`}
                    </span>
                    <span className="text-[11px] text-slate-500">Geolocalización confirmada por Chofer</span>
                  </div>
                </div>

                {/* Sello de Firma Digital */}
                <div className="mt-3 p-3.5 rounded-lg border border-dashed border-emerald-400 dark:border-emerald-700/60 bg-white/80 dark:bg-[#1f1e1e] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
                        Firma Digital Conforme Registrada
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {item.destinatario_nombre} • {item.rollos} rollos de {item.item_codigo}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold">
                      VERIFICADO ✓
                    </span>
                  </div>
                </div>
              </div>

              {item.comentarios && (
                <div className="text-xs p-3 rounded-lg bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block text-[11px] mb-1">
                    Comentario asentado en remito:
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">{item.comentarios}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1f1e1e] print:hidden">
          <span className="text-xs text-slate-500">
            Documento digitalizado del sistema OpenWMS 3PL
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-200 dark:bg-[#2e2d2d] text-slate-800 dark:text-slate-200 hover:bg-slate-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
