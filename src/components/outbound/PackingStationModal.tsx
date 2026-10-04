import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  PackageCheck,
  Box,
  Scale,
  Layers,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  QrCode,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { formatM3, formatNumber } from '@/lib/utils';
import { pedidosApi } from '@/api/pedidosApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface PackingStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paletizadoData?: any) => void;
  pedido: any;
  onEmitirRemitoPrompt?: (pedido: any) => void;
}

export const PackingStationModal: React.FC<PackingStationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  pedido,
  onEmitirRemitoPrompt,
}) => {
  const [pedidoDetallado, setPedidoDetallado] = useState<any>(pedido);
  const [isLoadingDetalle, setIsLoadingDetalle] = useState<boolean>(false);

  const [palletSalidaLpn, setPalletSalidaLpn] = useState<string>('');
  const [totalBultos, setTotalBultos] = useState<number>(1);
  const [pesoEstimadoKg, setPesoEstimadoKg] = useState<number>(0);
  const [volumenEstimadoM3, setVolumenEstimadoM3] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdPallet, setCreatedPallet] = useState<any | null>(null);

  // 1. Cargar detalles del pedido completos si no vienen precargados
  useEffect(() => {
    if (!isOpen || !pedido?.id) {
      setPedidoDetallado(null);
      return;
    }

    let isMounted = true;

    const cargarDetalles = async () => {
      // Si el pedido ya tiene detalles y los articulos están poblados
      if (
        pedido.detalles &&
        Array.isArray(pedido.detalles) &&
        pedido.detalles.length > 0 &&
        pedido.detalles[0].articulo
      ) {
        setPedidoDetallado(pedido);
        return;
      }

      setIsLoadingDetalle(true);
      try {
        const full = await pedidosApi.obtenerPedidoConDetalle(pedido.id);
        if (isMounted) {
          setPedidoDetallado(full || pedido);
        }
      } catch (err: any) {
        console.error('Error al cargar detalle en Packing Station:', err);
        if (isMounted) setPedidoDetallado(pedido);
      } finally {
        if (isMounted) setIsLoadingDetalle(false);
      }
    };

    cargarDetalles();

    return () => {
      isMounted = false;
    };
  }, [isOpen, pedido?.id]);

  // 2. Calcular métricas sugeridas (Bultos, Peso, Volumen) en base a los artículos
  useEffect(() => {
    if (isOpen && pedidoDetallado) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setPalletSalidaLpn((prev) => (prev ? prev : `PLT-OUT-${new Date().getFullYear()}-${randomSuffix}`));
      setIsSuccess(false);
      setCreatedPallet(null);
      setErrorMsg(null);

      let bultosCalc = 0;
      let pesoCalc = 0;
      let volCalc = 0;

      const detalles = pedidoDetallado.detalles || [];
      if (Array.isArray(detalles) && detalles.length > 0) {
        detalles.forEach((d: any) => {
          const art = Array.isArray(d.articulo) ? d.articulo[0] : d.articulo;
          const cantSeparada = Number(d.cantidad_separada) || 0;
          const cantSolicitada = Number(d.cantidad_solicitada) || 0;
          const cantEfectiva = cantSeparada > 0 ? cantSeparada : cantSolicitada;

          if (art) {
            const unPorBulto = Math.max(1, Number(art.unidades_por_bulto) || 1);
            bultosCalc += Math.ceil(cantEfectiva / unPorBulto);
            pesoCalc += cantEfectiva * (Number(art.peso_unitario_kg) || 0);
            volCalc += cantEfectiva * (Number(art.volumen_unitario_m3) || 0);
          } else {
            bultosCalc += Math.max(1, cantEfectiva);
          }
        });
      }

      setTotalBultos(Math.max(1, bultosCalc));
      setPesoEstimadoKg(Math.round(pesoCalc * 1000) / 1000);
      setVolumenEstimadoM3(Math.round(volCalc * 10000) / 10000);
    }
  }, [isOpen, pedidoDetallado]);

  // Resumen de totales de los renglones
  const resumenArticulos = useMemo(() => {
    const detalles = pedidoDetallado?.detalles || [];
    let totalUnidades = 0;
    let totalPeso = 0;
    let totalVolumen = 0;

    detalles.forEach((d: any) => {
      const art = Array.isArray(d.articulo) ? d.articulo[0] : d.articulo;
      const cantSeparada = Number(d.cantidad_separada) || 0;
      const cantSolicitada = Number(d.cantidad_solicitada) || 0;
      const cant = cantSeparada > 0 ? cantSeparada : cantSolicitada;

      totalUnidades += cant;
      if (art) {
        totalPeso += cant * (Number(art.peso_unitario_kg) || 0);
        totalVolumen += cant * (Number(art.volumen_unitario_m3) || 0);
      }
    });

    return {
      cantidadRenglones: detalles.length,
      totalUnidades,
      totalPeso,
      totalVolumen,
    };
  }, [pedidoDetallado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedidoDetallado && !pedido) return;
    setErrorMsg(null);

    const pedId = pedidoDetallado?.id || pedido?.id;

    if (!palletSalidaLpn.trim()) {
      setErrorMsg('El código de Pallet LPN de salida es obligatorio.');
      return;
    }
    if (totalBultos <= 0) {
      setErrorMsg('El total de bultos debe ser al menos 1.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await pedidosApi.consolidarPalletDespacho({
        pedidoId: pedId,
        palletSalidaLpn: palletSalidaLpn.trim(),
        totalBultos: Number(totalBultos),
        pesoEstimadoKg: Number(pesoEstimadoKg),
        volumenEstimadoM3: Number(volumenEstimadoM3),
      });

      setCreatedPallet(res);
      setIsSuccess(true);
      onSuccess(res);
    } catch (err: any) {
      console.error('Error al consolidar pallet de despacho:', err);
      setErrorMsg(err.message || 'Error al guardar el paletizado de despacho.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || (!pedido && !pedidoDetallado)) return null;

  const currentPedido = pedidoDetallado || pedido;
  const detalles = currentPedido.detalles || [];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-[#38260a] border border-amber-200 dark:border-[#7a4c10] text-amber-800 dark:text-[#ffddb8]">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                Mesa de Control y Paletizado (Packing Station)
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-amber-100 text-amber-800 border border-amber-200 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10]">
                  {currentPedido.numero_pedido}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Consolidación de bultos recolectados en Pallet LPN para emisión de Remito Rx.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-[#ffb4ab] mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isSuccess ? (
            <div className="p-6 rounded-xl bg-emerald-50 dark:bg-[#0f241a] border border-emerald-200 dark:border-[#1b4332] text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-[#153426] border border-emerald-300 dark:border-[#1b4332] text-emerald-700 dark:text-[#69f0ae] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1]">
                  ¡Pallet de Salida Consolidado Exitosamente!
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#cdc3d4] mt-1">
                  Se generó el LPN <span className="font-mono text-emerald-700 dark:text-[#69f0ae] font-bold">{palletSalidaLpn}</span> con {totalBultos} bultos ({formatM3(volumenEstimadoM3)}).
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
                >
                  Cerrar
                </button>
                {onEmitirRemitoPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEmitirRemitoPrompt(currentPedido);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded bg-[#dab9ff] hover:bg-[#eedbff] text-[#460283] transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    Proceder a Emitir Remito Rx
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Order Info Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-xs">
                <div>
                  <span className="text-slate-500 dark:text-[#cdc3d4] block mb-0.5">Cliente Depositante</span>
                  <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">{currentPedido.cliente?.razon_social || 'Cliente 3PL'}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#cdc3d4] block mb-0.5">Destinatario / Entrega</span>
                  <span className="font-bold text-slate-900 dark:text-[#e5e2e1]">{currentPedido.destinatario?.razon_social || 'Destinatario'}</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] block truncate">{currentPedido.destinatario?.direccion_entrega}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-[#cdc3d4] block mb-0.5">Estado del Pedido</span>
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332] uppercase font-mono">
                    {currentPedido.estado}
                  </span>
                </div>
              </div>

              {/* Items Picked Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-600 dark:text-[#ffddb8]" />
                    Artículos Separados para Empaque ({isLoadingDetalle ? '...' : detalles.length})
                  </h3>
                  {isLoadingDetalle && (
                    <span className="text-[11px] text-violet-600 dark:text-[#dab9ff] flex items-center gap-1.5 font-mono">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Cargando catálogo...
                    </span>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
                  {isLoadingDetalle ? (
                    <div className="p-8 text-center bg-slate-50 dark:bg-[#201f1f] flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-violet-600 dark:text-[#dab9ff]" />
                      <span className="text-xs text-slate-500 dark:text-[#cdc3d4]">Cargando detalle de artículos y cantidades del pedido...</span>
                    </div>
                  ) : detalles.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#201f1f]">
                      No se encontraron artículos registrados para este pedido.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333]">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Artículo / SKU</th>
                          <th className="px-3 py-2.5 font-semibold text-center">Separado / Solicitado</th>
                          <th className="px-3 py-2.5 font-semibold text-center">Bultos Est.</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Peso Est.</th>
                          <th className="px-3 py-2.5 font-semibold text-right">Volumen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-[#333333]">
                        {detalles.map((d: any) => {
                          const art = Array.isArray(d.articulo) ? d.articulo[0] : d.articulo;
                          const cantSeparada = Number(d.cantidad_separada) || 0;
                          const cantSolicitada = Number(d.cantidad_solicitada) || 0;
                          const cantEfectiva = cantSeparada > 0 ? cantSeparada : cantSolicitada;
                          const unPorBulto = Math.max(1, Number(art?.unidades_por_bulto) || 1);
                          const bultosRenglon = Math.ceil(cantEfectiva / unPorBulto);
                          const subPeso = art ? cantEfectiva * (Number(art.peso_unitario_kg) || 0) : 0;
                          const subVol = art ? cantEfectiva * (Number(art.volumen_unitario_m3) || 0) : 0;

                          return (
                            <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="font-semibold text-slate-900 dark:text-[#e5e2e1] block">{art?.nombre || 'Artículo sin nombre'}</span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#cdc3d4] font-mono mt-0.5">
                                  <span>SKU: {art?.sku || 'N/A'}</span>
                                  {art?.unidad_medida && (
                                    <span className="text-slate-400 dark:text-[#a593b0]">({art.unidad_medida})</span>
                                  )}
                                  {unPorBulto > 1 && (
                                    <span className="text-violet-600 dark:text-[#dab9ff] font-medium">{unPorBulto} un/bulto</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono">
                                <span className="font-bold text-emerald-600 dark:text-[#69f0ae]">{cantSeparada}</span>
                                <span className="text-slate-400 dark:text-[#cdc3d4] text-[10px]"> / {cantSolicitada} un.</span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono font-bold text-amber-600 dark:text-[#ffddb8]">
                                {bultosRenglon} bto{bultosRenglon > 1 ? 's' : ''}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-[#cdc3d4]">
                                {formatNumber(subPeso, 2)} kg
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-semibold text-sky-600 dark:text-[#75d1ff]">
                                {formatM3(subVol)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-100 dark:bg-[#201f1f] border-t border-slate-200 dark:border-[#333333] text-[11px] font-bold text-slate-800 dark:text-[#e5e2e1]">
                        <tr>
                          <td className="px-4 py-2.5">
                            Total Pedido ({resumenArticulos.cantidadRenglones} renglones)
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-emerald-600 dark:text-[#69f0ae]">
                            {resumenArticulos.totalUnidades} un.
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-amber-600 dark:text-[#ffddb8]">
                            {totalBultos} btos
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-[#cdc3d4]">
                            {formatNumber(resumenArticulos.totalPeso, 2)} kg
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-sky-600 dark:text-[#75d1ff]">
                            {formatM3(resumenArticulos.totalVolumen)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>

              {/* Form Pallet LPN and Dimensions */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5 flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-[#ffddb8]" />
                      Código Pallet LPN de Salida *
                    </label>
                    <input
                      type="text"
                      value={palletSalidaLpn}
                      onChange={(e) => setPalletSalidaLpn(e.target.value)}
                      placeholder="ej: PLT-OUT-2026-0042"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                    <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] mt-1 block">
                      Etiqueta física adherida al pallet o caja madre de transporte.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                      Total de Bultos / Cajas Consolidadas *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={totalBultos}
                      onChange={(e) => setTotalBultos(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5 flex items-center gap-1.5">
                      <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                      Peso Bruto Estimado (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pesoEstimadoKg}
                      onChange={(e) => setPesoEstimadoKg(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5 flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff]" />
                      Volumen Ocupado (M³)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={volumenEstimadoM3}
                      onChange={(e) => setVolumenEstimadoM3(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-all shadow-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Consolidando...
                      </>
                    ) : (
                      <>
                        <PackageCheck className="w-4 h-4" />
                        Confirmar Paletizado de Despacho
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  </ModalPortal>
  );
};
