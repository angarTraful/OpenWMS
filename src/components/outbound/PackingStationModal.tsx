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
  Printer,
  Tag,
} from 'lucide-react';
import { formatM3, formatNumber } from '@/lib/utils';
import { pedidosApi } from '@/api/pedidosApi';
import { getDescripcionFull } from '@/api/articulosApi';
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
  const [cantidadPallets, setCantidadPallets] = useState<number>(1);
  const [palletBreakdown, setPalletBreakdown] = useState<
    Array<{ id: string; suffix: string; codigoLpn: string; bultos: number; pesoKg: number; volumenM3: number }>
  >([]);
  const [pesoEstimadoKg, setPesoEstimadoKg] = useState<number>(0);
  const [volumenEstimadoM3, setVolumenEstimadoM3] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdPallet, setCreatedPallet] = useState<any | null>(null);

  // Modales de impresión
  const [printPlacardOpen, setPrintPlacardOpen] = useState(false);
  const [printCartonOpen, setPrintCartonOpen] = useState(false);

  // Estadio de Packing & Re-empaque (Clasificación por Tipo, Color y Temporada)
  const [clasificacionCalidad, setClasificacionCalidad] = useState<'A' | 'B' | 'C'>('A');
  const [temporada, setTemporada] = useState<string>('Temporada Actual');
  const [colorVariante, setColorVariante] = useState<string>('');
  const [motivoReempaque, setMotivoReempaque] = useState<string>('');

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
        const targetId = pedido.id || pedido.pedido_id;
        if (!targetId) {
          if (isMounted) setPedidoDetallado(pedido);
          return;
        }
        const full = await pedidosApi.obtenerPedidoConDetalle(targetId);
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

      const tBultos = Math.max(1, bultosCalc);
      const tPeso = Math.round(pesoCalc * 1000) / 1000;
      const tVol = Math.round(volCalc * 10000) / 10000;
      setTotalBultos(tBultos);
      setPesoEstimadoKg(tPeso);
      setVolumenEstimadoM3(tVol);

      // Calcular desglose inicial de pallets
      const initialPallets = Math.max(1, Math.ceil(tBultos / 25));
      setCantidadPallets(initialPallets);
      recalcularDesglose(initialPallets, tBultos, palletSalidaLpn || `PLT-OUT-${new Date().getFullYear()}-${randomSuffix}`, tPeso, tVol);
    }
  }, [isOpen, pedidoDetallado]);

  // Recalcular grupos de pallets proporcionalmente
  const recalcularDesglose = (
    numPallets: number,
    bultosTotales: number,
    baseLpn: string,
    pesoTotal: number = pesoEstimadoKg,
    volTotal: number = volumenEstimadoM3
  ) => {
    const n = Math.max(1, numPallets);
    const basePerPallet = Math.floor(bultosTotales / n);
    const newItems = Array.from({ length: n }).map((_, i) => {
      const isLast = i === n - 1;
      const bultosGrupo = isLast
        ? Math.max(1, bultosTotales - basePerPallet * (n - 1))
        : basePerPallet;
      const suffix = n > 1 ? `/${String(i + 1).padStart(2, '0')}` : '';
      const codigoLpn = `${baseLpn.split('/')[0]}${suffix}`;
      const prop = bultosTotales > 0 ? bultosGrupo / bultosTotales : 1 / n;

      return {
        id: `plt-${i}`,
        suffix: suffix || '/01',
        codigoLpn,
        bultos: bultosGrupo,
        pesoKg: Math.round(pesoTotal * prop * 100) / 100,
        volumenM3: Math.round(volTotal * prop * 1000) / 1000,
      };
    });
    setPalletBreakdown(newItems);
  };

  const handleUpdateBultosPallet = (idx: number, nuevosBultos: number) => {
    setPalletBreakdown((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = {
          ...copy[idx],
          bultos: Math.max(1, nuevosBultos),
        };
      }
      return copy;
    });
  };

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
      // Consolidar todos los pallets LPN configurados en el desglose
      const palletsAGuardar = palletBreakdown.length > 0
        ? palletBreakdown
        : [{
            id: 'plt-0',
            suffix: '/01',
            codigoLpn: palletSalidaLpn.trim(),
            bultos: Number(totalBultos),
            pesoKg: Number(pesoEstimadoKg),
            volumenM3: Number(volumenEstimadoM3),
          }];

      let ultimoRes: any = null;
      for (const p of palletsAGuardar) {
        ultimoRes = await pedidosApi.consolidarPalletDespacho({
          pedidoId: pedId,
          palletSalidaLpn: p.codigoLpn,
          totalBultos: Number(p.bultos),
          pesoEstimadoKg: Number(p.pesoKg),
          volumenEstimadoM3: Number(p.volumenM3),
        });
      }

      setCreatedPallet(ultimoRes);
      setIsSuccess(true);
      onSuccess(ultimoRes);
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

  const isFormDirty = Boolean(palletSalidaLpn || totalBultos > 1);

  return (
    <ModalPortal
      onClose={onClose}
      isDirty={isFormDirty}
      confirmMessage="¿Está seguro de cerrar la estación de empaque? Los bultos armados sin guardar se perderán."
    >
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
                  ¡Pallets de Salida Consolidados Exitosamente!
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#cdc3d4] mt-1">
                  Se generaron <strong className="text-emerald-700 dark:text-[#69f0ae] font-bold">{palletBreakdown.length} pallets LPN</strong> con un total de <strong>{totalBultos} bultos</strong> ({formatM3(volumenEstimadoM3)}).
                </p>
              </div>

              {/* Botones de Impresión Inmediata */}
              <div className="p-4 rounded-xl bg-white dark:bg-[#151515] border border-emerald-200 dark:border-[#223329] grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
                <button
                  type="button"
                  onClick={() => setPrintPlacardOpen(true)}
                  className="p-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-[#2b1f0c] dark:border-[#523d18] text-amber-900 dark:text-[#ffba28] transition-all flex items-center gap-2.5 shadow-xs"
                >
                  <Printer className="w-5 h-5 text-amber-600 dark:text-[#ffba28] shrink-0" />
                  <div>
                    <span className="text-xs font-bold block">Imprimir Rótulos de Pallet</span>
                    <span className="text-[10px] text-slate-500 dark:text-[#aaa] block">
                      {palletBreakdown.length} rótulos LPN para los pallets
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintCartonOpen(true)}
                  className="p-3 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-[#201330] dark:border-[#521394] text-violet-900 dark:text-[#dab9ff] transition-all flex items-center gap-2.5 shadow-xs"
                >
                  <Tag className="w-5 h-5 text-violet-600 dark:text-[#dab9ff] shrink-0" />
                  <div>
                    <span className="text-xs font-bold block">Imprimir Etiquetas de Bultos</span>
                    <span className="text-[10px] text-slate-500 dark:text-[#aaa] block">
                      {totalBultos} etiquetas individuales de cajas
                    </span>
                  </div>
                </button>
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
                  <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] block truncate">
                    {currentPedido.destinatario?.direccion_entrega}
                    {[currentPedido.destinatario?.localidad, currentPedido.destinatario?.ciudad].filter(Boolean).length > 0
                      ? ` • ${[currentPedido.destinatario?.localidad, currentPedido.destinatario?.ciudad].filter(Boolean).join(', ')}`
                      : ''}
                  </span>
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
                                <span className="font-mono font-bold text-slate-900 dark:text-[#e5e2e1] block">{art?.nombre || 'Artículo'}</span>
                                <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block">{(art as any)?.descripcion_full || getDescripcionFull(art) || art?.descripcion || ''}</span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#cdc3d4] font-mono mt-0.5">
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

              {/* Estadio de Clasificación, Re-empaque y Calidad */}
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-[#271d12] border border-amber-200 dark:border-[#5a3814] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-900 dark:text-[#ffddb8] uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-600 dark:text-[#ffb960]" />
                    Estadio de Clasificación y Re-Empaque
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-200 text-amber-900 dark:bg-[#4a2e0e] dark:text-[#ffddb8]">
                    Clasificación Actual: Clase {clasificacionCalidad}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1">
                      Color / Variante
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Azul Marino, Rojo, Estampado"
                      value={colorVariante}
                      onChange={(e) => setColorVariante(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1">
                      Temporada del Lote
                    </label>
                    <select
                      value={temporada}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTemporada(val);
                        if (val === 'Fuera de Temporada') {
                          setClasificacionCalidad('C');
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1]"
                    >
                      <option value="Temporada Actual">Temporada Actual (Vigente)</option>
                      <option value="Verano 2026">Verano 2026</option>
                      <option value="Invierno 2025">Invierno 2025</option>
                      <option value="Fuera de Temporada">Fuera de Temporada (Auto C)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1">
                      Clasificación de Calidad
                    </label>
                    <select
                      value={clasificacionCalidad}
                      onChange={(e) => setClasificacionCalidad(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-bold"
                    >
                      <option value="A">Clase A - Primera Calidad / Temporada</option>
                      <option value="B">Clase B - Segunda Calidad / Detalle</option>
                      <option value="C">Clase C - Fuera de Temporada / Discontinuo</option>
                    </select>
                  </div>
                </div>

                {clasificacionCalidad === 'C' && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-[#ffb4ab] text-[11px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span>
                      <strong>Atención:</strong> Asignado como <strong>Clase C</strong> por estar fuera de temporada o requerir reacondicionamiento comercial.
                    </span>
                  </div>
                )}
              </div>

              {/* Form Pallet LPN and Dimensions */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                {/* Configuración de División en Múltiples Pallets */}
                <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                        Total Bultos / Cajas *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={totalBultos}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setTotalBultos(val);
                          recalcularDesglose(cantidadPallets, val, palletSalidaLpn);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm font-mono font-bold text-slate-900 dark:text-[#e5e2e1]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1 flex items-center gap-1.5">
                        <PackageCheck className="w-3.5 h-3.5 text-amber-600 dark:text-[#ffddb8]" />
                        Cantidad de Pallets a Consolidar *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        step="1"
                        value={cantidadPallets}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setCantidadPallets(val);
                          recalcularDesglose(val, totalBultos, palletSalidaLpn);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm font-mono font-bold text-slate-900 dark:text-[#e5e2e1]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1 flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                        Prefijo Base Pallet LPN
                      </label>
                      <input
                        type="text"
                        value={palletSalidaLpn}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPalletSalidaLpn(val);
                          recalcularDesglose(cantidadPallets, totalBultos, val);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1]"
                      />
                    </div>
                  </div>

                  {/* Desglose dinámico de grupos de pallets */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#2b2b2b]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-[#e5e2e1]">
                        Distribución en {palletBreakdown.length} Pallet(s) de Salida:
                      </span>
                      <span className="font-mono text-xs text-slate-500 dark:text-[#aaa]">
                        Suma bultos: <strong>{palletBreakdown.reduce((acc, p) => acc + p.bultos, 0)}</strong> / {totalBultos}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto">
                      {palletBreakdown.map((p, idx) => (
                        <div
                          key={p.id}
                          className="p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#171717] space-y-1.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-[#201330] dark:text-[#dab9ff] font-mono">
                              Pallet #{idx + 1}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {p.pesoKg} kg
                            </span>
                          </div>

                          <div className="font-mono text-xs font-bold text-slate-900 dark:text-[#e5e2e1] truncate" title={p.codigoLpn}>
                            {p.codigoLpn}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#222]">
                            <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">Cajas/Bultos:</span>
                            <input
                              type="number"
                              min="1"
                              value={p.bultos}
                              onChange={(e) => handleUpdateBultosPallet(idx, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-0.5 text-center font-mono font-bold text-xs rounded border border-slate-300 dark:border-[#444] bg-slate-50 dark:bg-[#202020] text-slate-900 dark:text-[#e5e2e1]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Acciones de Impresión Previas */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-[#2b2b2b]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintPlacardOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-[#2b1f0c] dark:border-[#523d18] text-amber-900 dark:text-[#ffba28] text-xs font-bold transition-all shadow-xs"
                        title="Imprimir rótulos con código de barras para cada uno de los pallets LPN"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Rótulos Pallet ({palletBreakdown.length} PLT)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrintCartonOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-[#201330] dark:border-[#521394] text-violet-900 dark:text-[#dab9ff] text-xs font-bold transition-all shadow-xs"
                        title="Imprimir etiquetas de bulto individuales"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Etiquetas Bulto ({totalBultos} etq)</span>
                      </button>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500">
                      Peso Total: <b>{pesoEstimadoKg} kg</b> • Vol: <b>{formatM3(volumenEstimadoM3)}</b>
                    </div>
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

    {/* ========================================================================= */}
    {/* MODAL IMPRESIÓN: RÓTULOS DE PALLET LPN (PLT-OUT-...)                      */}
    {/* ========================================================================= */}
    {printPlacardOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
        <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-200 dark:border-[#333] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-[#e5e2e1]">
          <div className="p-4 border-b border-slate-200 dark:border-[#333] flex items-center justify-between bg-slate-50 dark:bg-[#202020]">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-black uppercase">
                  Impresión de Rótulos de Pallet LPN ({palletBreakdown.length} Pallets)
                </h3>
                <span className="text-[10px] text-slate-500">
                  Formato de Placard para fijar en los pallets de despacho
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Todos ({palletBreakdown.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintPlacardOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-[#eee]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {palletBreakdown.map((p, idx) => (
              <div
                key={p.id}
                className="p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-[#444] bg-slate-50 dark:bg-[#151515] space-y-2 font-mono"
              >
                <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-[#333]">
                  <span className="text-xs font-black px-2 py-0.5 rounded bg-violet-600 text-white">
                    PALLET {idx + 1} DE {palletBreakdown.length}
                  </span>
                  <span className="text-xs font-bold text-slate-600 dark:text-[#aaa]">
                    PEDIDO: {currentPedido.numero_pedido}
                  </span>
                </div>

                <div className="py-2 text-center">
                  <span className="text-xs text-slate-400 uppercase block font-sans font-semibold">Identificador LPN</span>
                  <span className="text-2xl font-black text-amber-700 dark:text-[#ffba28] tracking-widest block">
                    {p.codigoLpn}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#888] font-sans mt-0.5 block">
                    ||||| | |||| ||||| || |||||| |||| | |||||
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200 dark:border-[#333]">
                  <div>
                    <span className="text-[10px] text-slate-400 font-sans block">Destinatario:</span>
                    <span className="font-bold truncate block">{currentPedido.destinatario?.razon_social}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-sans block">Bultos Consolidados:</span>
                    <span className="text-base font-black text-emerald-600 dark:text-[#69f0ae]">{p.bultos} Cajas / Bultos</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* ========================================================================= */}
    {/* MODAL IMPRESIÓN: ETIQUETAS INDIVIDUALES DE BULTOS                         */}
    {/* ========================================================================= */}
    {printCartonOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
        <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-200 dark:border-[#333] shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-[#e5e2e1]">
          <div className="p-4 border-b border-slate-200 dark:border-[#333] flex items-center justify-between bg-slate-50 dark:bg-[#202020]">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-violet-600" />
              <div>
                <h3 className="text-sm font-black uppercase">
                  Impresión de Etiquetas de Bultos ({totalBultos} Etiquetas)
                </h3>
                <span className="text-[10px] text-slate-500">
                  Etiquetas Brother DK / adhesivas para cada una de las cajas
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir ({totalBultos} etq)</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintCartonOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-[#eee]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="p-3 bg-violet-50 dark:bg-[#201330] rounded-xl border border-violet-200 text-xs text-violet-800 dark:text-[#dab9ff] flex items-center justify-between">
              <span>Se enviarán a la impresora térmica <b>{totalBultos} etiquetas consecutivas</b> (Bulto 1/{totalBultos} a {totalBultos}/{totalBultos}).</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Array.from({ length: Math.min(totalBultos, 12) }).map((_, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#181818] font-mono text-xs space-y-1"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{currentPedido.numero_pedido}</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-[#333] text-[10px]">
                      Bto {i + 1} de {totalBultos}
                    </span>
                  </div>
                  <div className="text-[11px] font-sans truncate text-slate-700 dark:text-[#ccc]">
                    {currentPedido.destinatario?.razon_social}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Ref LPN: {palletBreakdown[Math.floor(i / (totalBultos / Math.max(1, palletBreakdown.length)))]?.codigoLpn || palletSalidaLpn}
                  </div>
                </div>
              ))}
            </div>

            {totalBultos > 12 && (
              <p className="text-center text-xs text-slate-500 italic">
                ... y {totalBultos - 12} etiquetas más listas para impresión térmica.
              </p>
            )}
          </div>
        </div>
      </div>
    )}
  </ModalPortal>
  );
};
