import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  FileSpreadsheet,
  Download,
  Building2,
  Calendar,
  Layers,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';
import { romaneoApi } from '@/api/romaneoApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface PlanillaRomaneoPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
}

export const PlanillaRomaneoPrintModal: React.FC<PlanillaRomaneoPrintModalProps> = ({
  isOpen,
  onClose,
  pedido,
}) => {
  const [romaneoData, setRomaneoData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && pedido) {
      cargarRomaneo();
    }
  }, [isOpen, pedido]);

  const cargarRomaneo = async () => {
    if (!pedido?.id) return;
    setLoading(true);
    try {
      const data = await romaneoApi.listarRomaneoPedido(pedido.id);
      setRomaneoData(data || []);
    } catch (err) {
      console.error('Error al cargar romaneo del pedido:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !pedido) return null;

  const handlePrint = () => {
    window.print();
  };

  // Agrupar y calcular totales del romaneo
  const detalles = pedido.detalles || [];
  
  // Calcular resumen por artículo
  const resumenPorArticulo = detalles.map((det: any) => {
    const sku = det.articulo?.sku || 'N/A';
    const nombre = det.articulo?.nombre || 'Producto sin nombre';
    const unidad = det.articulo?.unidad_medida || 'mts';
    const bultosTotales = Number(det.cantidad_solicitada || 0);
    const medidaStd = Number(det.articulo?.unidades_por_bulto || 50);

    // Buscar si hay excepciones grabadas para este SKU
    const excepcionesArticulo = romaneoData.filter(
      (r) => r.articulo_id === det.articulo_id
    );

    const bultosExcepcion = excepcionesArticulo.length;
    const bultosEstandar = Math.max(0, bultosTotales - bultosExcepcion);

    const totalMetrosEstandar = bultosEstandar * medidaStd;
    const totalMetrosExcepcion = excepcionesArticulo.reduce(
      (sum, r) => sum + Number(r.medida_real || 0),
      0
    );
    const totalMetros = totalMetrosEstandar + totalMetrosExcepcion;

    return {
      articulo_id: det.articulo_id,
      sku,
      nombre,
      unidad,
      medidaStd,
      bultosTotales,
      bultosEstandar,
      bultosExcepcion,
      totalMetrosEstandar,
      totalMetrosExcepcion,
      totalMetros,
      excepciones: excepcionesArticulo,
    };
  });

  const granTotalBultos = resumenPorArticulo.reduce((acc: number, item: any) => acc + item.bultosTotales, 0);
  const granTotalMetros = resumenPorArticulo.reduce((acc: number, item: any) => acc + item.totalMetros, 0);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
          
          {/* Header Modal - No Imprimible */}
          <div className="print:hidden p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-lg">Planilla de Romaneo</h3>
                <p className="text-xs text-slate-400">
                  Documento independiente para adjuntar al Remito ({pedido.numero_pedido})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors shadow-lg shadow-emerald-600/20"
              >
                <Printer className="w-4 h-4" />
                Imprimir / PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cuerpo Documento Imprimible */}
          <div className="flex-1 overflow-y-auto p-8 bg-slate-900 print:bg-white print:text-black print:p-0">
            <div className="max-w-3xl mx-auto bg-white text-slate-900 p-8 rounded-xl shadow-xl print:shadow-none print:p-0">
              
              {/* Header Imprimible */}
              <div className="border-b-2 border-slate-900 pb-6 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                      Planilla de Romaneo
                    </h1>
                    <p className="text-sm font-semibold text-slate-600 mt-0.5">
                      Detalle de Medición por Rollo / Bulto
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-sm text-slate-800">
                      PEDIDO N° {pedido.numero_pedido}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      Fecha: {formatDate(pedido.fecha_solicitud || new Date().toISOString())}
                    </p>
                  </div>
                </div>

                {/* Info Cliente */}
                <div className="mt-6 grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[10px]">
                      Cliente Depositante:
                    </span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">
                      {pedido.cliente?.razon_social || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[10px]">
                      Destinatario / Entregar en:
                    </span>
                    <p className="font-bold text-slate-800 text-sm mt-0.5">
                      {pedido.destinatario?.razon_social || 'N/A'}
                    </p>
                    <p className="text-slate-600 text-[11px]">
                      {pedido.destinatario?.direccion_entrega || ''}
                      {[pedido.destinatario?.localidad, pedido.destinatario?.ciudad].filter(Boolean).length > 0
                        ? ` - ${[pedido.destinatario?.localidad, pedido.destinatario?.ciudad].filter(Boolean).join(' • ')}`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumen Global por SKU */}
              <div className="mb-6">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Resumen General por Producto
                </h2>
                <table className="w-full text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-800 text-white font-semibold">
                      <th className="p-2 text-left border border-slate-700">SKU / Producto</th>
                      <th className="p-2 text-center border border-slate-700">Medida Std</th>
                      <th className="p-2 text-center border border-slate-700">Rollos Std</th>
                      <th className="p-2 text-center border border-slate-700">Rollos Var.</th>
                      <th className="p-2 text-center border border-slate-700">Bultos Totales</th>
                      <th className="p-2 text-right border border-slate-700">Total Medida (mts/kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenPorArticulo.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-2 font-medium">
                          <span className="font-mono text-slate-500 font-semibold mr-2">[{item.sku}]</span>
                          {item.nombre}
                        </td>
                        <td className="p-2 text-center text-slate-600">{formatNumber(item.medidaStd)} {item.unidad}</td>
                        <td className="p-2 text-center font-semibold">{item.bultosEstandar}</td>
                        <td className="p-2 text-center font-semibold text-amber-700">
                          {item.bultosExcepcion > 0 ? item.bultosExcepcion : '-'}
                        </td>
                        <td className="p-2 text-center font-bold text-slate-900">{item.bultosTotales}</td>
                        <td className="p-2 text-right font-bold text-slate-900">
                          {formatNumber(item.totalMetros)} {item.unidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-800 text-xs">
                      <td colSpan={4} className="p-2.5 text-right uppercase">Total General:</td>
                      <td className="p-2.5 text-center text-slate-900 text-sm">{granTotalBultos} bultos</td>
                      <td className="p-2.5 text-right text-slate-900 text-sm">{formatNumber(granTotalMetros)} mts/kg</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Detalle de Rollos Especiales / Excepciones */}
              <div className="mb-8">
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Desglose Individual de Rollos / Bultos Especiales (Romaneo por Pieza)
                </h2>
                {romaneoData.length === 0 ? (
                  <div className="p-4 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500 italic">
                    Todos los rollos de este pedido cumplen con la medida estándar de fábrica.
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold">
                        <th className="p-2 text-center border border-slate-300 w-12">#</th>
                        <th className="p-2 text-left border border-slate-300">Etiqueta LPN / Rollo</th>
                        <th className="p-2 text-left border border-slate-300">Producto</th>
                        <th className="p-2 text-center border border-slate-300">Medida Std</th>
                        <th className="p-2 text-center border border-slate-300">Medida Real</th>
                        <th className="p-2 text-right border border-slate-300">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {romaneoData.map((ex: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-200">
                          <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2 font-mono font-bold text-slate-800">
                            {ex.codigo_etiqueta_lpn || `RL-${String(idx + 1).padStart(3, '0')}`}
                          </td>
                          <td className="p-2 text-slate-700">
                            {ex.articulo?.nombre || ex.articulo_id}
                          </td>
                          <td className="p-2 text-center text-slate-500">{formatNumber(ex.medida_estandar)} {ex.unidad_medida}</td>
                          <td className="p-2 text-center font-bold text-emerald-700">{formatNumber(ex.medida_real)} {ex.unidad_medida}</td>
                          <td className={`p-2 text-right font-semibold ${
                            ex.medida_real - ex.medida_estandar >= 0 ? 'text-blue-700' : 'text-red-600'
                          }`}>
                            {ex.medida_real - ex.medida_estandar > 0 ? '+' : ''}
                            {formatNumber(ex.medida_real - ex.medida_estandar)} {ex.unidad_medida}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Firmas / Pie de Pagina */}
              <div className="pt-12 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
                  <p className="font-semibold text-slate-700">Firma Operador Almacén</p>
                  <p className="text-[10px] text-slate-400">Control de Romaneo y Peso</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
                  <p className="font-semibold text-slate-700">Conformidad Transporte / Cliente</p>
                  <p className="text-[10px] text-slate-400">Recepción de Bultos</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </ModalPortal>
  );
};
