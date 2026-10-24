import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Truck,
  Warehouse,
  Search,
} from 'lucide-react';
import { formatM3, formatNumber } from '@/lib/utils';
import { articulosApi, Articulo, getDescripcionFull } from '@/api/articulosApi';
import { clientesApi } from '@/api/clientesApi';
import { pedidosApi } from '@/api/pedidosApi';
import { inventarioApi } from '@/api/inventarioApi';
import { almacenApi, Almacen } from '@/api/almacenApi';
import { QuickSelect } from '@/components/ui/QuickSelect';
import { DestinatarioModal } from '@/components/masters/DestinatarioModal';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface RenglonPedido {
  id: string;
  articulo_id: string;
  cantidad_solicitada: number;
  lote_id?: string | null;
  ubicacion_id?: string | null;
}

interface ArticuloOutboundSearchPickerProps {
  articulos: Articulo[];
  stockResumen: Record<string, { disponible: number; reservado: number; total: number; stockFisico?: number; stockFuturo?: number }>;
  selectedArticuloId: string;
  onSelect: (artId: string) => void;
  permitirSinStock: boolean;
  disabled?: boolean;
}

const ArticuloOutboundSearchPicker: React.FC<ArticuloOutboundSearchPickerProps> = ({
  articulos,
  stockResumen,
  selectedArticuloId,
  onSelect,
  permitirSinStock,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedArt = useMemo(
    () => articulos.find((a) => a.id === selectedArticuloId),
    [articulos, selectedArticuloId]
  );

  // Filtrado reactivo por texto y disponibilidad de stock
  const articulosFiltrados = useMemo(() => {
    return articulos.filter((a) => {
      const stock = stockResumen[a.id]?.disponible ?? 0;
      if (!permitirSinStock && stock <= 0) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const descFull = ((a as any).descripcion_full || getDescripcionFull(a) || a.descripcion || '').toLowerCase();
      const nombre = (a.nombre || '').toLowerCase();
      const barcode = (a.codigo_barras || (a as any).ean13 || '').toLowerCase();
      return nombre.includes(q) || descFull.includes(q) || barcode.includes(q);
    });
  }, [articulos, stockResumen, permitirSinStock, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            disabled={disabled}
            value={
              isOpen
                ? query
                : selectedArt
                  ? `[${selectedArt.nombre}] ${(selectedArt as any).descripcion_full || getDescripcionFull(selectedArt) || selectedArt.descripcion || ''}`
                  : ''
            }
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              setQuery('');
            }}
            placeholder={
              permitirSinStock
                ? 'Buscar por SKU o descripción (Catálogo completo)...'
                : 'Buscar por SKU o descripción (Solo con stock)...'
            }
            className={`w-full pl-7 pr-6 py-1.5 text-xs rounded-lg border bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] outline-none truncate font-medium placeholder:text-slate-400 dark:placeholder:text-[#6b6471] ${selectedArt
                ? 'border-violet-300 dark:border-[#521394] focus:border-violet-500'
                : 'border-slate-300 dark:border-[#333333] focus:border-violet-500'
              }`}
          />
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#978d9d] absolute left-2 top-2 pointer-events-none" />
          {selectedArticuloId && !isOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect('');
                setQuery('');
              }}
              className="absolute right-1.5 top-1.5 p-0.5 text-slate-400 hover:text-rose-500 dark:text-[#978d9d] dark:hover:text-[#ffb4ab] rounded"
              title="Quitar artículo seleccionado"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[320px] max-w-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#44424a] rounded-xl shadow-2xl z-50 overflow-hidden text-xs animate-fadeIn">
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2a2a2a]">
            {articulosFiltrados.length === 0 ? (
              <div className="p-4 text-center text-slate-400 dark:text-[#978d9d] text-xs space-y-1">
                <p>No se encontraron artículos {permitirSinStock ? 'con ese criterio' : 'con stock disponible'}.</p>
                {!permitirSinStock && (
                  <p className="text-[10px] text-amber-600 dark:text-[#ffddb8] font-medium">
                    💡 Activa el check "Plan B: Permitir sin stock" para ver el catálogo completo.
                  </p>
                )}
              </div>
            ) : (
              articulosFiltrados.map((art) => {
                const stock = stockResumen[art.id]?.disponible ?? 0;
                const isSelected = art.id === selectedArticuloId;

                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => {
                      onSelect(art.id);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start justify-between gap-2 hover:bg-slate-50 dark:hover:bg-[#26242a] transition-colors ${isSelected
                        ? 'bg-violet-50 text-violet-700 dark:bg-[#2a173d]/60 dark:text-[#dab9ff]'
                        : 'text-slate-800 dark:text-[#e5e2e1]'
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] bg-slate-100 dark:bg-[#131313] px-1.5 py-0.2 rounded border border-slate-200 dark:border-[#333333] text-[10px] shrink-0">
                          {art.nombre}
                        </span>
                        <span className="font-semibold text-xs truncate">
                          {(art as any).descripcion_full || getDescripcionFull(art) || art.descripcion || art.nombre}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-[#978d9d] font-mono mt-0.5">
                        Emb: {art.unidades_por_bulto || 1} un/bulto · {formatM3(art.volumen_unitario_m3 || 0)} · {art.peso_unitario_kg || 0} kg
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {stock > 0 ? (
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#142e1d] dark:text-[#69f0ae] dark:border-[#225735]">
                          Stock: {stock}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-50 text-amber-700 border border-amber-200 dark:bg-[#38260a] dark:text-[#ffddb8] dark:border-[#7a4c10]">
                          Sin stock (0)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [modalidadEntrega, setModalidadEntrega] = useState<'envio_domicilio' | 'retiro_deposito'>('envio_domicilio');
  const [almacenOrigenId, setAlmacenOrigenId] = useState<string>('');
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
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
  const [inventarioDetallado, setInventarioDetallado] = useState<any[]>([]);

  // UI & Submission state
  const [permitirSinStock, setPermitirSinStock] = useState(false);
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
      setPermitirSinStock(false);
      setRenglones([]);
      setModalidadEntrega('envio_domicilio');

      // Cargar almacenes para retiro pick-up
      almacenApi.listarAlmacenes(true).then((alms) => {
        setAlmacenes(alms || []);
        if (alms && alms.length > 0) {
          setAlmacenOrigenId(alms[0].id);
        }
      }).catch((err) => {
        console.warn('Error cargando almacenes:', err);
      });
    }
  }, [isOpen, defaultClienteId, clientes]);

  // Load Destinatarios, Articulos and Stock when Cliente changes
  useEffect(() => {
    if (!clienteId) {
      setDestinatarios([]);
      setArticulos([]);
      setStockResumen({});
      setInventarioDetallado([]);
      setDestinatarioId('');
      return;
    }

    const cargarDatosCliente = async () => {
      setLoadingCatalogos(true);
      setErrorMsg(null);
      try {
        const [destResult, artsResult, stockResult, invResult] = await Promise.allSettled([
          clientesApi.listarDestinatariosPorCliente(clienteId),
          articulosApi.listarPorCliente(clienteId),
          inventarioApi.obtenerStockConsolidadoPorCliente(clienteId),
          inventarioApi.consultarStock({ clienteId }),
        ]);

        const destData = destResult.status === 'fulfilled' ? destResult.value : [];
        const artsData = artsResult.status === 'fulfilled' ? artsResult.value : [];
        const stockData = stockResult.status === 'fulfilled' ? stockResult.value : {};
        const invData = invResult.status === 'fulfilled' ? invResult.value : [];

        if (destResult.status === 'rejected') {
          console.error('Error cargando destinatarios de cliente:', destResult.reason);
        }
        if (artsResult.status === 'rejected') {
          console.error('Error cargando artículos de cliente:', artsResult.reason);
        }
        if (stockResult.status === 'rejected') {
          console.error('Error cargando stock consolidado:', stockResult.reason);
        }
        if (invResult.status === 'rejected') {
          console.error('Error cargando inventario detallado:', invResult.reason);
        }

        setDestinatarios(destData || []);
        if (destData && destData.length > 0) {
          setDestinatarioId(destData[0].id);
        } else {
          setDestinatarioId('');
        }
        setArticulos(artsData || []);
        setStockResumen(stockData || {});
        setInventarioDetallado(invData || []);

        // Preseleccionar por defecto un artículo con stock disponible si existe
        const primerConStock = (artsData || []).find((a: any) => (stockData[a.id]?.disponible ?? 0) > 0);
        if (primerConStock) {
          setRenglones([
            {
              id: generateRowId(),
              articulo_id: primerConStock.id,
              cantidad_solicitada: 0,
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
    const defaultArt = !permitirSinStock
      ? (articulos.find((a) => (stockResumen[a.id]?.disponible ?? 0) > 0) || articulos[0])
      : articulos[0];
    setRenglones([
      ...renglones,
      {
        id: generateRowId(),
        articulo_id: defaultArt.id,
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
    if (modalidadEntrega === 'envio_domicilio' && !destinatarioId) {
      setErrorMsg('Debe seleccionar un Destinatario o Sucursal de entrega para el envío.');
      return;
    }
    if (modalidadEntrega === 'retiro_deposito' && !almacenOrigenId) {
      setErrorMsg('Debe seleccionar el almacén/depósito donde retira el cliente.');
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
          destinatario_id: modalidadEntrega === 'envio_domicilio' ? destinatarioId : (destinatarioId || null),
          almacen_origen_id: almacenOrigenId || null,
          modalidad_entrega: modalidadEntrega,
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
          lote_id: r.lote_id || null,
          ubicacion_id: r.ubicacion_id || null,
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

  const isFormDirty = Boolean(renglones.length > 0 || ordenCompraCliente || observaciones);

  return (
    <ModalPortal
      onClose={onClose}
      isDirty={isFormDirty}
      confirmMessage="¿Está seguro de cerrar el formulario del pedido? Se perderán las líneas de artículos agregadas al borrador."
    >
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
            <div className="space-y-3 p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
              {/* Selector de Modalidad: Envío vs Retiro Pick-up */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#333333]">
                <div className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4]">
                  Modalidad de Salida / Entrega:
                </div>
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-200/70 dark:bg-[#131313] border border-slate-300 dark:border-[#333333]">
                  <button
                    type="button"
                    onClick={() => setModalidadEntrega('envio_domicilio')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${modalidadEntrega === 'envio_domicilio'
                        ? 'bg-white dark:bg-[#28153c] text-violet-700 dark:text-[#dab9ff] shadow-sm border border-slate-200 dark:border-[#6b21a8]'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
                      }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Envío con Flete / Reparto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalidadEntrega('retiro_deposito')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${modalidadEntrega === 'retiro_deposito'
                        ? 'bg-white dark:bg-[#142e1d] text-emerald-700 dark:text-[#78d492] shadow-sm border border-slate-200 dark:border-[#2a683b]'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
                      }`}
                  >
                    <Warehouse className="w-3.5 h-3.5" />
                    <span>🏢 Retira el Cliente (Pick-up)</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                {modalidadEntrega === 'envio_domicilio' ? (
                  <div>
                    <QuickSelect
                      label="Destinatario / Sucursal de Entrega"
                      required
                      value={destinatarioId}
                      onChange={setDestinatarioId}
                      placeholder={
                        destinatarios.length === 0
                          ? 'No hay sucursales/destinatarios habilitados'
                          : 'Seleccionar sucursal de entrega...'
                      }
                      addNewLabel="+ Agregar nuevo destinatario/sucursal"
                      onAddNew={() => setModalDestinatarioOpen(true)}
                      disabled={loadingCatalogos}
                      options={destinatarios.map((d) => ({
                        value: d.id,
                        label: `${d.razon_social}${d.es_sucursal_propia ? ' [Sucursal Propia]' : ''}`,
                        sublabel: `${[d.localidad, d.ciudad].filter(Boolean).join(', ') || d.direccion_entrega}${d.codigo_sucursal ? ` • Cód: ${d.codigo_sucursal}` : ''
                          }`,
                      }))}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5 flex items-center gap-1.5">
                      <Warehouse className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Almacén / Depósito de Retiro *</span>
                    </label>
                    <select
                      value={almacenOrigenId}
                      onChange={(e) => setAlmacenOrigenId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-emerald-300 dark:border-emerald-700/50 text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    >
                      {almacenes.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre} {a.direccion ? `(${a.direccion})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

              {modalidadEntrega === 'retiro_deposito' && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <Warehouse className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <strong>Retira el Cliente en Planta:</strong> La mercadería se preparará para retiro por mostrador/muelle del depósito asignado. No se rutea en camión de reparto.
                  </span>
                </div>
              )}
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
                <div className="flex flex-wrap items-center gap-2">
                  {/* Plan B toggle: Permitir sin stock */}
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#201f1f] dark:hover:bg-[#2a2a2a] border border-slate-300 dark:border-[#333333] text-xs cursor-pointer select-none transition-colors" title="Plan B: Marcar para permitir seleccionar y cargar artículos sin stock disponible en el almacén (Backorder / Preventa)">
                    <input
                      type="checkbox"
                      checked={permitirSinStock}
                      onChange={(e) => setPermitirSinStock(e.target.checked)}
                      className="rounded text-violet-600 focus:ring-violet-500 w-3.5 h-3.5 accent-violet-600"
                    />
                    <span className="text-slate-700 dark:text-[#cdc3d4] font-medium text-[11px]">
                      Plan B: Permitir sin stock
                    </span>
                  </label>

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
                        <span className={`text-xs font-medium ${fastPasteFeedback.tipo === 'success' ? 'text-emerald-600 dark:text-[#69f0ae]' : fastPasteFeedback.tipo === 'warning' ? 'text-amber-600 dark:text-[#ffddb8]' : 'text-rose-600 dark:text-[#ffb4ab]'
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
                <div className="space-y-3 overflow-visible pb-12">
                  {renglones.map((r, idx) => {
                    const art = articulosMap.get(r.articulo_id);
                    const subtotalPeso = art ? (r.cantidad_solicitada || 0) * (art.peso_unitario_kg || 0) : 0;
                    const subtotalM3 = art ? (r.cantidad_solicitada || 0) * (art.volumen_unitario_m3 || 0) : 0;
                    const stockInfo = stockResumen[r.articulo_id];
                    const disp = stockInfo?.disponible ?? 0;
                    const res = stockInfo?.reservado ?? 0;
                    const stockActualFisico = (stockInfo as any)?.stockFisico ?? (disp + res);
                    const stockFuturoProyectado = (stockInfo as any)?.stockFuturo ?? disp;
                    const tieneFaltante = (r.cantidad_solicitada || 0) > disp;

                    // Existencias detalladas de este artículo en almacén
                    const existenciasArt = inventarioDetallado.filter(
                      (item) => item.articulo_id === r.articulo_id && (Number(item.cantidad_disponible || 0) > 0 || Number(item.cantidad_reservada || 0) > 0)
                    );

                    // Agrupar lotes disponibles con stock
                    const lotesMap = new Map<string, { lote_id: string; numero_lote: string; fecha_vencimiento: string | null; disponible: number }>();
                    existenciasArt.forEach((item) => {
                      if (Number(item.cantidad_disponible || 0) <= 0) return;
                      const lKey = item.lote_id || 'sin_lote';
                      if (!lotesMap.has(lKey)) {
                        lotesMap.set(lKey, {
                          lote_id: item.lote_id || '',
                          numero_lote: item.lote?.numero_lote || 'Sin Lote / General',
                          fecha_vencimiento: item.lote?.fecha_vencimiento || null,
                          disponible: 0,
                        });
                      }
                      lotesMap.get(lKey)!.disponible += Number(item.cantidad_disponible || 0);
                    });
                    const lotesDisponibles = Array.from(lotesMap.values());

                    // Ubicaciones disponibles (filtradas por el lote elegido si hay uno)
                    const ubicacionesDisponibles = existenciasArt.filter((item) => {
                      if (Number(item.cantidad_disponible || 0) <= 0) return false;
                      if (r.lote_id) return (item.lote_id || '') === r.lote_id;
                      return true;
                    });

                    return (
                      <div
                        key={r.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#181717] hover:border-violet-300 dark:hover:border-[#6b21a8]/60 transition-all shadow-xs relative"
                        style={{ zIndex: renglones.length - idx + 10 }}
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                          {/* 1. Selector de Artículo & Buscador */}
                          <div className="lg:col-span-6 relative">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold text-slate-500 dark:text-[#978d9d] uppercase flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 dark:bg-[#28153c] dark:text-[#dab9ff] flex items-center justify-center text-[10px] font-mono font-black">
                                  {idx + 1}
                                </span>
                                <span>Artículo / SKU</span>
                              </label>
                              {art && (
                                <span className="text-[10px] font-mono text-slate-400 dark:text-[#888]">
                                  U.M: {art.unidad_medida || 'u'}
                                </span>
                              )}
                            </div>

                            <ArticuloOutboundSearchPicker
                              articulos={articulos}
                              stockResumen={stockResumen}
                              selectedArticuloId={r.articulo_id}
                              onSelect={(artId) => handleUpdateRenglon(r.id, 'articulo_id', artId)}
                              permitirSinStock={permitirSinStock}
                            />

                            {/* Stock badges and metadata */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                              <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-[#201f1f] dark:text-[#cdc3d4] dark:border-[#383838]">
                                Stock Físico: {stockActualFisico} un.
                              </span>

                              <span className={`px-2 py-0.5 rounded font-bold ${disp >= (r.cantidad_solicitada || 0)
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#152e1f] dark:text-[#69f0ae] dark:border-[#235836]'
                                  : disp > 0
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-[#3b2a10] dark:text-[#ffddb8] dark:border-[#6d4c1b]'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
                                }`}>
                                Disp. Futuro: {stockFuturoProyectado} un.
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
                          </div>

                          {/* 2. Cantidad Solicitada */}
                          <div className="lg:col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-[#978d9d] uppercase mb-1 block text-center">
                              Cant. Solicitada
                            </label>
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
                              className={`w-full px-3 py-1.5 text-center font-mono font-bold rounded-lg bg-white dark:bg-[#131313] border text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 ${tieneFaltante ? 'border-amber-400 text-amber-600 dark:border-[#ffddb8] dark:text-[#ffddb8]' : 'border-slate-300 dark:border-[#333333] focus:border-violet-500 dark:focus:border-[#dab9ff]'
                                }`}
                            />
                          </div>

                          {/* 3. Subtotales Peso y Volumen */}
                          <div className="lg:col-span-3 flex items-center justify-between sm:justify-around gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#2f2f2f] text-[11px] font-mono">
                            <div>
                              <span className="text-[9px] text-slate-400 dark:text-[#888] block uppercase">Peso Est.</span>
                              <span className="font-semibold text-slate-700 dark:text-[#cdc3d4]">{formatNumber(subtotalPeso, 2)} kg</span>
                            </div>
                            <div className="border-l border-slate-200 dark:border-[#333] pl-2.5">
                              <span className="text-[9px] text-slate-400 dark:text-[#888] block uppercase">Volumen</span>
                              <span className="font-bold text-sky-600 dark:text-[#75d1ff]">{formatM3(subtotalM3)}</span>
                            </div>
                          </div>

                          {/* 4. Botón Eliminar */}
                          <div className="lg:col-span-1 text-right lg:text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRenglon(r.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#381015] transition-colors"
                              title="Eliminar renglón"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* 5. Selectores de Lote de Reserva y Ubicación de Picking (Elección manual del usuario) */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#262525] grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/60 dark:bg-[#1a1919] p-2.5 rounded-lg">
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5 mb-1">
                              <Calendar className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                              <span>Lote de Reserva (Elegir Lote):</span>
                            </label>
                            <select
                              value={r.lote_id || ''}
                              onChange={(e) => handleUpdateRenglon(r.id, 'lote_id', e.target.value || null)}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#383838] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:ring-1 focus:ring-violet-500 font-mono"
                            >
                              <option value="">✨ Auto: Asignación por FEFO / FIFO (Recomendado)</option>
                              {lotesDisponibles.map((l) => (
                                <option key={l.lote_id || 'sin_lote'} value={l.lote_id}>
                                  Lote: {l.numero_lote} {l.fecha_vencimiento ? `(Vto: ${l.fecha_vencimiento.slice(0, 10)})` : ''} — Disp: {l.disponible} un.
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-600 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5 mb-1">
                              <Warehouse className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff]" />
                              <span>Ubicación / Posición de Picking:</span>
                            </label>
                            <select
                              value={r.ubicacion_id || ''}
                              onChange={(e) => handleUpdateRenglon(r.id, 'ubicacion_id', e.target.value || null)}
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#383838] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:ring-1 focus:ring-sky-500 font-mono"
                            >
                              <option value="">✨ Auto: Cualquier ubicación con stock</option>
                              {ubicacionesDisponibles.map((u) => (
                                <option key={u.id} value={u.ubicacion_id}>
                                  Pos: {u.ubicacion?.codigo_etiqueta || 'N/A'} {u.pallet?.codigo_lpn ? `(Pallet: ${u.pallet.codigo_lpn})` : ''} {u.lote?.numero_lote && !r.lote_id ? `[Lote: ${u.lote.numero_lote}]` : ''} — Disp: {u.cantidad_disponible} un.
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
      </div>
    </ModalPortal>
  );
};

