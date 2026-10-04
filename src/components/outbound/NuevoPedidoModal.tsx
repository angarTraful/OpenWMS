import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  RefreshCw,
  Box,
  Scale,
  Layers,
  AlertCircle,
  CheckCircle2,
  Calendar,
  FileText,
  UserCheck,
  Zap,
  Upload,
} from 'lucide-react';
import { formatM3, formatNumber } from '@/lib/utils';
import { articulosApi, Articulo } from '@/api/articulosApi';
import { clientesApi } from '@/api/clientesApi';
import { pedidosApi } from '@/api/pedidosApi';
import { inventarioApi } from '@/api/inventarioApi';
import { QuickSelect } from '@/components/ui/QuickSelect';
import { DestinatarioModal } from '@/components/masters/DestinatarioModal';
import { ArticuloModal } from '@/components/masters/ArticuloModal';
import { ModalPortal } from '@/components/ui/ModalPortal';


interface RenglonPedido {
  id: string;
  articulo_id: string;
  cantidad_solicitada: number;
}

interface NuevoPedidoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clientes: any[];
  defaultClienteId?: string;
}

const generateRowId = () => 'row-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

export const NuevoPedidoModal: React.FC<NuevoPedidoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clientes,
  defaultClienteId,
}) => {
  // Form Header State
  const [clienteId, setClienteId] = useState<string>('');
  const [destinatarioId, setDestinatarioId] = useState<string>('');
  const [numeroPedido, setNumeroPedido] = useState<string>('');
  const [ordenCompraCliente, setOrdenCompraCliente] = useState<string>('');
  const [prioridad, setPrioridad] = useState<'normal' | 'urgente' | 'baja'>('normal');
  const [fechaCompromisoEntrega, setFechaCompromisoEntrega] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Dependent data
  const [destinatarios, setDestinatarios] = useState<any[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [stockResumen, setStockResumen] = useState<Record<string, { disponible: number; reservado: number; total: number }>>({});
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);

  // Line items
  const [renglones, setRenglones] = useState<RenglonPedido[]>([]);

  // Fast paste / CSV lines in modal
  const [fastPasteOpen, setFastPasteOpen] = useState(false);
  const [fastPasteText, setFastPasteText] = useState('');
  const [fastPasteFeedback, setFastPasteFeedback] = useState<{ tipo: 'success' | 'warning' | 'error'; mensaje: string } | null>(null);

  // Submodals para alta rápida
  const [modalDestinatarioOpen, setModalDestinatarioOpen] = useState(false);
  const [modalArticuloOpen, setModalArticuloOpen] = useState(false);
  const [targetRenglonId, setTargetRenglonId] = useState<string | null>(null);

  // UI & Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize defaults
  useEffect(() => {
    if (isOpen) {
      const selectedCliente = defaultClienteId || (clientes.length > 0 ? clientes[0].id : '');
      setClienteId(selectedCliente);
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setNumeroPedido(`PED-${new Date().getFullYear()}-${randomSuffix}`);
      setOrdenCompraCliente('');
      setPrioridad('normal');
      setFechaCompromisoEntrega(new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]);
      setObservaciones('');
      setErrorMsg(null);
      setFastPasteOpen(false);
      setFastPasteFeedback(null);
      setRenglones([]);
    }
  }, [isOpen, defaultClienteId, clientes]);

  // Load Destinatarios, Articulos and Stock when Cliente changes
  useEffect(() => {
    if (!clienteId) {
      setDestinatarios([]);
      setArticulos([]);
      setStockResumen({});
      setDestinatarioId('');
      return;
    }

    const cargarDatosCliente = async () => {
      setLoadingCatalogos(true);
      setErrorMsg(null);
      try {
        const [destResult, artsResult, stockResult] = await Promise.allSettled([
          clientesApi.listarDestinatariosPorCliente(clienteId),
          articulosApi.listarPorCliente(clienteId),
          inventarioApi.obtenerStockConsolidadoPorCliente(clienteId),
        ]);

        const destData = destResult.status === 'fulfilled' ? destResult.value : [];
        const artsData = artsResult.status === 'fulfilled' ? artsResult.value : [];
        const stockData = stockResult.status === 'fulfilled' ? stockResult.value : {};

        if (destResult.status === 'rejected') {
          console.error('Error cargando destinatarios de cliente:', destResult.reason);
        }
        if (artsResult.status === 'rejected') {
          console.error('Error cargando artículos de cliente:', artsResult.reason);
        }
        if (stockResult.status === 'rejected') {
          console.error('Error cargando stock consolidado:', stockResult.reason);
        }

        setDestinatarios(destData || []);
        if (destData && destData.length > 0) {
          setDestinatarioId(destData[0].id);
        } else {
          setDestinatarioId('');
        }
        setArticulos(artsData || []);
        setStockResumen(stockData || {});

        // Start with one line if available
        if (artsData && artsData.length > 0) {
          setRenglones([
            {
              id: generateRowId(),
              articulo_id: artsData[0].id,
              cantidad_solicitada: 10,
            },
          ]);
        } else {
          setRenglones([]);
        }

        if (destResult.status === 'rejected' && artsResult.status === 'rejected') {
          const detail = (destResult.reason as any)?.message || (artsResult.reason as any)?.message || 'Error de conexión';
          setErrorMsg(`No se pudieron cargar los artículos o destinatarios del cliente seleccionado: ${detail}`);
        }
      } catch (err: any) {
        console.error('Error cargando catálogos de cliente:', err);
        setErrorMsg(`Error al cargar datos del cliente: ${err?.message || 'Error desconocido'}`);
      } finally {
        setLoadingCatalogos(false);
      }
    };

    cargarDatosCliente();
  }, [clienteId]);

  // Calculations
  const articulosMap = useMemo(() => {
    const map = new Map<string, Articulo>();
    articulos.forEach((a) => map.set(a.id, a));
    return map;
  }, [articulos]);

  const totales = useMemo(() => {
    let unidades = 0;
    let pesoKg = 0;
    let volumenM3 = 0;
    let valorDeclarado = 0;
    let itemsConBackorder = 0;
    let unidadesFaltantes = 0;

    renglones.forEach((r) => {
      const art = articulosMap.get(r.articulo_id);
      const cant = Number(r.cantidad_solicitada) || 0;
      unidades += cant;
      if (art) {
        pesoKg += cant * (art.peso_unitario_kg || 0);
        volumenM3 += cant * (art.volumen_unitario_m3 || 0);
        valorDeclarado += cant * (art.valor_declarado || 0);
      }

      const disp = stockResumen[r.articulo_id]?.disponible ?? 0;
      if (cant > disp) {
        itemsConBackorder++;
        unidadesFaltantes += (cant - disp);
      }
    });

    return {
      unidades,
      pesoKg: Math.round(pesoKg * 1000) / 1000,
      volumenM3: Math.round(volumenM3 * 10000) / 10000,
      valorDeclarado: Math.round(valorDeclarado * 100) / 100,
      itemsConBackorder,
      unidadesFaltantes,
    };
  }, [renglones, articulosMap, stockResumen]);

  // Fast paste processor
  const handleProcessFastPaste = () => {
    if (!fastPasteText.trim()) return;
    setFastPasteFeedback(null);

    const lines = fastPasteText.trim().split(/\r?\n/);
    const skuMap = new Map<string, Articulo>();
    articulos.forEach((a) => {
      skuMap.set(a.sku.trim().toLowerCase(), a);
      skuMap.set(a.nombre.trim().toLowerCase(), a);
    });

    const newRows: RenglonPedido[] = [];
    let recognized = 0;
    let errors = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.toLowerCase().startsWith('sku')) continue;

      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length < 2) continue;

      const rawSku = parts[0].toLowerCase();
      const rawCant = parseInt(parts[1], 10);

      const foundArt = skuMap.get(rawSku);
      if (foundArt && !isNaN(rawCant) && rawCant > 0) {
        newRows.push({
          id: generateRowId(),
          articulo_id: foundArt.id,
          cantidad_solicitada: rawCant,
        });
        recognized++;
      } else {
        errors++;
      }
    }

    if (newRows.length > 0) {
      setRenglones((prev) => [...prev, ...newRows]);
      setFastPasteFeedback({
        tipo: errors > 0 ? 'warning' : 'success',
        mensaje: `Se importaron ${recognized} renglones.${errors > 0 ? ` (${errors} líneas ignoradas por SKU desconocido o cantidad inválida).` : ''}`,
      });
      setFastPasteText('');
    } else {
      setFastPasteFeedback({
        tipo: 'error',
        mensaje: 'No se reconocieron líneas válidas. Formato requerido: SKU, Cantidad (ej: SKU-100, 5)',
      });
    }
  };

  // Line item handlers
  const handleAddRenglon = () => {
    if (articulos.length === 0) return;
    setRenglones([
      ...renglones,
      {
        id: generateRowId(),
        articulo_id: articulos[0].id,
        cantidad_solicitada: 1,
      },
    ]);
  };

  const handleUpdateRenglon = (id: string, field: keyof RenglonPedido, value: any) => {
    setRenglones((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleRemoveRenglon = (id: string) => {
    setRenglones((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!clienteId) {
      setErrorMsg('Debe seleccionar un Cliente depositante.');
      return;
    }
    if (!destinatarioId) {
      setErrorMsg('Debe seleccionar un Destinatario o Sucursal de entrega.');
      return;
    }
    if (!numeroPedido.trim()) {
      setErrorMsg('El número de pedido es obligatorio.');
      return;
    }
    if (renglones.length === 0) {
      setErrorMsg('Debe incluir al menos un artículo en el pedido.');
      return;
    }

    for (const r of renglones) {
      if (!r.articulo_id) {
        setErrorMsg('Todos los renglones deben tener un artículo seleccionado.');
        return;
      }
      if (!r.cantidad_solicitada || r.cantidad_solicitada <= 0) {
        setErrorMsg('La cantidad solicitada debe ser mayor a 0 en cada artículo.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await pedidosApi.crearPedido(
        {
          cliente_id: clienteId,
          destinatario_id: destinatarioId,
          numero_pedido: numeroPedido.trim(),
          orden_compra_cliente: ordenCompraCliente.trim() || null,
          prioridad: prioridad as any,
          fecha_compromiso_entrega: fechaCompromisoEntrega ? `${fechaCompromisoEntrega}T18:00:00Z` : null,
          observaciones: observaciones.trim() || null,
          estado: 'ingresado',
        },
        renglones.map((r) => ({
          articulo_id: r.articulo_id,
          cantidad_solicitada: Number(r.cantidad_solicitada),
        }))
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al registrar pedido:', err);
      setErrorMsg(err.message || 'Error inesperado al guardar el pedido en base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-[#28153c] border border-violet-200 dark:border-[#6b21a8] text-violet-700 dark:text-[#dab9ff]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                Nuevo Pedido Outbound
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-violet-100 text-violet-700 border border-violet-200 dark:bg-[#28153c] dark:text-[#dab9ff] dark:border-[#6b21a8]">
                  3PL Client Order
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Registra la solicitud de salida, destinatario y artículos a preparar.
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

          {/* Section: Client & Destination */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                Cliente Depositante *
              </label>
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                disabled={clientes.length === 0}
              >
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.codigo}] {c.razon_social}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <QuickSelect
                label="Destinatario / Sucursal de Entrega"
                required
                value={destinatarioId}
                onChange={setDestinatarioId}
                placeholder={destinatarios.length === 0 ? 'No hay destinatarios registrados' : 'Seleccionar sucursal de entrega...'}
                addNewLabel="+ Agregar nuevo destinatario/sucursal"
                onAddNew={() => setModalDestinatarioOpen(true)}
                disabled={loadingCatalogos}
                options={destinatarios.map((d) => ({
                  value: d.id,
                  label: d.razon_social,
                  sublabel: d.ciudad || d.direccion_entrega,
                }))}
              />
            </div>


            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                Prioridad de Preparación
              </label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
              >
                <option value="normal">Normal (Estándar)</option>
                <option value="urgente">⚡ Urgente (Prioridad Alta)</option>
                <option value="baja">Baja (Sin urgencia)</option>
              </select>
            </div>
          </div>

          {/* Section: Operational Reference */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                N° de Pedido Interno *
              </label>
              <input
                type="text"
                value={numeroPedido}
                onChange={(e) => setNumeroPedido(e.target.value)}
                placeholder="ej: PED-2026-0042"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                N° Orden de Compra Cliente (OC / Ref Externa)
              </label>
              <input
                type="text"
                value={ordenCompraCliente}
                onChange={(e) => setOrdenCompraCliente(e.target.value)}
                placeholder="ej: OC-77491-X"
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                Fecha Compromiso de Entrega
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={fechaCompromisoEntrega}
                  onChange={(e) => setFechaCompromisoEntrega(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>
          </div>

          {/* Section: Line Items (Artículos) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-2">
                <Box className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                Artículos Solicitados ({renglones.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFastPasteOpen(!fastPasteOpen)}
                  disabled={articulos.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 text-violet-700 dark:bg-[#201f1f] dark:hover:bg-[#2a2a2a] dark:text-[#dab9ff] transition-colors shadow-xs"
                  title="Pegar o importar renglones rápidamente por SKU y Cantidad"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{fastPasteOpen ? 'Ocultar Pegado Rápido' : 'Pegar / CSV Renglones'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddRenglon}
                  disabled={articulos.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Artículo
                </button>
              </div>
            </div>

            {/* Fast Paste Drawer */}
            {fastPasteOpen && (
              <div className="p-3.5 rounded-xl bg-violet-50/60 dark:bg-[#181220] border border-violet-200 dark:border-[#dab9ff]/30 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-[#e5e2e1] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                    Pegar Renglones desde Excel / CSV (SKU, Cantidad):
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">Separado por coma (,) o tabulación</span>
                </div>
                <textarea
                  value={fastPasteText}
                  onChange={(e) => setFastPasteText(e.target.value)}
                  placeholder={"SKU-1001, 15\nSKU-1002, 30\nSKU-1003, 5"}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {fastPasteFeedback && (
                      <span className={`text-xs font-medium ${
                        fastPasteFeedback.tipo === 'success' ? 'text-emerald-600 dark:text-[#69f0ae]' : fastPasteFeedback.tipo === 'warning' ? 'text-amber-600 dark:text-[#ffddb8]' : 'text-rose-600 dark:text-[#ffb4ab]'
                      }`}>
                        {fastPasteFeedback.mensaje}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFastPasteOpen(false)}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleProcessFastPaste}
                      className="px-3 py-1 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283]"
                    >
                      Procesar e Incorporar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {loadingCatalogos ? (
              <div className="flex items-center justify-center p-8 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                <RefreshCw className="w-5 h-5 text-violet-600 dark:text-[#dab9ff] animate-spin mr-2" />
                <span className="text-sm text-slate-600 dark:text-[#cdc3d4]">Cargando catálogo y existencias de stock del cliente...</span>
              </div>
            ) : articulos.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-center">
                <p className="text-sm text-slate-600 dark:text-[#cdc3d4]">
                  El cliente seleccionado no tiene artículos registrados en el catálogo.
                </p>
              </div>
            ) : renglones.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-dashed border-slate-300 dark:border-[#333333] text-center">
                <p className="text-sm text-slate-600 dark:text-[#cdc3d4]">
                  No hay artículos agregados. Haz clic en "Agregar Artículo" o usa "Pegar / CSV Renglones".
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Artículo / SKU & Stock Disponible</th>
                      <th className="px-3 py-2.5 font-semibold text-center w-28">Cant. Solicitada</th>
                      <th className="px-3 py-2.5 font-semibold text-right w-24">Peso Est.</th>
                      <th className="px-3 py-2.5 font-semibold text-right w-24">Volumen</th>
                      <th className="px-3 py-2.5 font-semibold text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#333333]">
                    {renglones.map((r) => {
                      const art = articulosMap.get(r.articulo_id);
                      const subtotalPeso = art ? (r.cantidad_solicitada || 0) * (art.peso_unitario_kg || 0) : 0;
                      const subtotalM3 = art ? (r.cantidad_solicitada || 0) * (art.volumen_unitario_m3 || 0) : 0;
                      const stockInfo = stockResumen[r.articulo_id];
                      const disp = stockInfo?.disponible ?? 0;
                      const tieneFaltante = (r.cantidad_solicitada || 0) > disp;

                      return (
                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <select
                              value={r.articulo_id}
                              onChange={(e) => {
                                if (e.target.value === '__ADD_NEW__') {
                                  setTargetRenglonId(r.id);
                                  setModalArticuloOpen(true);
                                  return;
                                }
                                handleUpdateRenglon(r.id, 'articulo_id', e.target.value);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                            >
                              <option value="__ADD_NEW__" className="text-violet-600 font-bold bg-violet-50 dark:bg-[#26133b] dark:text-[#dab9ff]">
                                ✨ + Agregar nuevo artículo al catálogo...
                              </option>
                              {articulos.map((a) => (
                                <option key={a.id} value={a.id}>
                                  [{a.sku}] {a.nombre} {a.unidad_medida ? `(${a.unidad_medida})` : ''}
                                </option>
                              ))}
                            </select>

                            {/* Stock badges and metadata */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                disp >= (r.cantidad_solicitada || 0)
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#152e1f] dark:text-[#69f0ae] dark:border-[#235836]'
                                  : disp > 0
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-[#3b2a10] dark:text-[#ffddb8] dark:border-[#6d4c1b]'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
                              }`}>
                                Stock Disp: {disp} un.
                              </span>

                              {tieneFaltante && (
                                <span className="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-[#3b2a10] dark:text-[#ffddb8] dark:border-[#6d4c1b] flex items-center gap-1">
                                  ⚠️ Faltante: {(r.cantidad_solicitada || 0) - disp} un. (Backorder)
                                </span>
                              )}

                              {art && (
                                <>
                                  <span className="text-slate-500 dark:text-[#cdc3d4]">Emb: {art.unidades_por_bulto || 1} un/bulto</span>
                                  <span className="text-slate-500 dark:text-[#cdc3d4]">Vol: {formatM3(art.volumen_unitario_m3 || 0)}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={r.cantidad_solicitada}
                              onChange={(e) =>
                                handleUpdateRenglon(
                                  r.id,
                                  'cantidad_solicitada',
                                  Math.max(1, parseInt(e.target.value) || 1)
                                )
                              }
                              className={`w-full px-2 py-1.5 text-center font-mono rounded-lg bg-white dark:bg-[#131313] border text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none ${
                                tieneFaltante ? 'border-amber-400 text-amber-600 dark:border-[#ffddb8] dark:text-[#ffddb8]' : 'border-slate-300 dark:border-[#333333] focus:border-violet-500 dark:focus:border-[#dab9ff]'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-[#cdc3d4]">
                            {formatNumber(subtotalPeso, 2)} kg
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-sky-600 dark:text-[#75d1ff]">
                            {formatM3(subtotalM3)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRenglon(r.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#381015] transition-colors"
                              title="Eliminar renglón"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section: Observaciones */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
              Observaciones e Instrucciones de Despacho
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Instrucciones para picking, embalaje especial o restricciones de descarga en destinatario..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          {/* Backorder / Shortfall Warning Notice */}
          {totales.itemsConBackorder > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-[#381015]/40 border border-amber-200 dark:border-[#690005] text-xs text-amber-800 dark:text-[#ffb4ab]">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-[#ffb4ab] flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Aviso de Stock Parcial / Backorder ({totales.itemsConBackorder} artículos):</span>
                <p className="text-[11px] text-amber-700 dark:text-[#ffb4ab]/90 mt-0.5">
                  Hay {totales.unidadesFaltantes} unidades solicitadas que superan las existencias disponibles en almacén.
                  El pedido se creará con normalidad. Durante la asignación FEFO se reservará el stock disponible y el saldo quedará registrado como faltante pendiente.
                </p>
              </div>
            </div>
          )}

          {/* Summary Metric Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-xs">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-violet-600 dark:text-[#dab9ff] flex-shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Total Unidades</div>
                <div className="font-bold text-slate-900 dark:text-[#e5e2e1] font-mono text-sm">{formatNumber(totales.unidades, 0)}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae] flex-shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Peso Estimado</div>
                <div className="font-semibold text-slate-800 dark:text-[#e5e2e1] font-mono">{formatNumber(totales.pesoKg, 2)} kg</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Box className="w-4 h-4 text-sky-600 dark:text-[#75d1ff] flex-shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Volumen Estimado</div>
                <div className="font-bold text-sky-600 dark:text-[#75d1ff] font-mono text-sm">{formatM3(totales.volumenM3)}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-500 dark:text-[#ffddb8] flex-shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Valor Declarado</div>
                <div className="font-semibold text-slate-800 dark:text-[#ffddb8] font-mono">${formatNumber(totales.valorDeclarado, 2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || renglones.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Registrando Pedido...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirmar y Crear Pedido
              </>
            )}
          </button>
        </div>
      </div>

      {/* Submodal para Crear Destinatario Rápido */}
      <DestinatarioModal
        isOpen={modalDestinatarioOpen}
        onClose={() => setModalDestinatarioOpen(false)}
        destinatario={null}
        clientes={clientes}
        defaultClienteId={clienteId}
        onCreated={(nuevoDest) => {
          clientesApi.listarDestinatariosPorCliente(clienteId).then((data) => setDestinatarios(data || []));
          setDestinatarioId(nuevoDest.id);
        }}
      />

      {/* Submodal para Crear Artículo Rápido */}
      <ArticuloModal
        isOpen={modalArticuloOpen}
        onClose={() => setModalArticuloOpen(false)}
        articulo={null}
        clientes={clientes}
        defaultClienteId={clienteId}
        onSuccess={() => {}}
        onCreated={(nuevoArt) => {
          articulosApi.listarPorCliente(clienteId).then((data) => setArticulos(data || []));
          if (targetRenglonId) {
            handleUpdateRenglon(targetRenglonId, 'articulo_id', nuevoArt.id);
          } else {
            setRenglones((prev) => [
              ...prev,
              { id: 'item-' + Date.now(), articulo_id: nuevoArt.id, cantidad_solicitada: 1 },
            ]);
          }
        }}
      />
    </div>
    </ModalPortal>
  );
};

