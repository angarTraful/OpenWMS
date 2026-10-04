import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Box,
  Truck,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { clientesApi } from '@/api/clientesApi';
import { articulosApi, Articulo } from '@/api/articulosApi';
import { inventarioApi } from '@/api/inventarioApi';
import { pedidosApi } from '@/api/pedidosApi';
import { QuickSelect } from '@/components/ui/QuickSelect';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface ImportarPedidosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clientes: any[];
  defaultClienteId?: string;
}

interface ParsedRow {
  index: number;
  numeroPedido: string;
  clienteIdentificador: string;
  destinatarioIdentificador: string;
  sku: string;
  cantidad: number;
  prioridad: 'baja' | 'normal' | 'urgente';
  ordenCompra: string;
  fechaCompromiso: string;
  observaciones: string;
  // Resolved references
  clienteIdResolved?: string;
  destinatarioIdResolved?: string;
  articuloIdResolved?: string;
  articuloNombreResolved?: string;
  stockDisponible?: number;
  status: 'valid' | 'warning' | 'error';
  errores: string[];
  advertencias: string[];
}

export const ImportarPedidosModal: React.FC<ImportarPedidosModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clientes,
  defaultClienteId,
}) => {
  // Step 1: Input, Step 2: Preview & Validation, Step 3: Success
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);

  // Catalogs cache per client
  const [cacheDestinatarios, setCacheDestinatarios] = useState<Record<string, any[]>>({});
  const [cacheArticulos, setCacheArticulos] = useState<Record<string, Articulo[]>>({});
  const [cacheStock, setCacheStock] = useState<Record<string, Record<string, { disponible: number }>>>({});
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);

  // Parsing & Validation
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedClienteId(defaultClienteId || (clientes.length > 0 ? clientes[0].id : ''));
      setRawText('');
      setFileName(null);
      setParsedRows([]);
      setSubmitError(null);
    }
  }, [isOpen, defaultClienteId, clientes]);

  // Pre-load catalogs for default/selected client
  useEffect(() => {
    if (!selectedClienteId || cacheArticulos[selectedClienteId]) return;

    const cargarCatalogos = async () => {
      setLoadingCatalogos(true);
      try {
        const [dests, arts, stock] = await Promise.all([
          clientesApi.listarDestinatariosPorCliente(selectedClienteId),
          articulosApi.listarPorCliente(selectedClienteId),
          inventarioApi.obtenerStockConsolidadoPorCliente(selectedClienteId),
        ]);
        setCacheDestinatarios((prev) => ({ ...prev, [selectedClienteId]: dests || [] }));
        setCacheArticulos((prev) => ({ ...prev, [selectedClienteId]: arts || [] }));
        setCacheStock((prev) => ({ ...prev, [selectedClienteId]: stock || {} }));
      } catch (err) {
        console.error('Error pre-cargando catálogos:', err);
      } finally {
        setLoadingCatalogos(false);
      }
    };
    cargarCatalogos();
  }, [selectedClienteId, cacheArticulos]);

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const csvContent =
      'NUMERO_PEDIDO,CLIENTE_CUIT,DESTINATARIO_CODIGO,SKU,CANTIDAD,PRIORIDAD,ORDEN_COMPRA,FECHA_COMPROMISO,OBSERVACIONES\n' +
      'PED-2026-9001,,SUC-01,SKU-001,15,normal,OC-1002,2026-10-15,Entrega turno mañana\n' +
      'PED-2026-9001,,SUC-01,SKU-002,30,normal,OC-1002,2026-10-15,Entrega turno mañana\n' +
      'PED-2026-9002,,SUC-02,SKU-003,50,urgente,OC-1005,2026-10-12,Carga prioritaria con remito valorizado\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_pedidos_wms.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content || '');
    };
    reader.readAsText(file);
  };

  // Parse and validate rows
  const handleValidate = async () => {
    if (!rawText.trim()) {
      setSubmitError('Debe ingresar o subir un archivo de texto con datos de pedidos.');
      return;
    }

    setIsValidating(true);
    setSubmitError(null);

    try {
      const lines = rawText.trim().split(/\r?\n/);
      if (lines.length === 0) {
        setSubmitError('El archivo no contiene líneas válidas.');
        setIsValidating(false);
        return;
      }

      // Ensure catalogs for default client are loaded
      let curDests = cacheDestinatarios[selectedClienteId];
      let curArts = cacheArticulos[selectedClienteId];
      let curStock = cacheStock[selectedClienteId];

      if (!curArts && selectedClienteId) {
        const [dests, arts, stock] = await Promise.all([
          clientesApi.listarDestinatariosPorCliente(selectedClienteId),
          articulosApi.listarPorCliente(selectedClienteId),
          inventarioApi.obtenerStockConsolidadoPorCliente(selectedClienteId),
        ]);
        curDests = dests || [];
        curArts = arts || [];
        curStock = stock || {};
        setCacheDestinatarios((prev) => ({ ...prev, [selectedClienteId]: curDests }));
        setCacheArticulos((prev) => ({ ...prev, [selectedClienteId]: curArts }));
        setCacheStock((prev) => ({ ...prev, [selectedClienteId]: curStock }));
      }

      const rows: ParsedRow[] = [];
      let startIdx = 0;

      // Detect header
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('sku') || firstLine.includes('pedido') || firstLine.includes('cantidad')) {
        startIdx = 1;
      }

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        // Split by comma or semicolon or tab
        const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
        const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));

        const numPed = cols[0] || `PED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const cliIden = cols[1] || '';
        const destIden = cols[2] || '';
        const rawSku = cols[3] || '';
        const rawCant = parseInt(cols[4], 10) || 0;
        const rawPrio = (cols[5]?.toLowerCase() === 'urgente' || cols[5]?.toLowerCase() === 'baja') ? cols[5].toLowerCase() as any : 'normal';
        const oc = cols[6] || '';
        const fecha = cols[7] || '';
        const obs = cols[8] || '';

        const errores: string[] = [];
        const advertencias: string[] = [];

        // 1. Resolve client
        let targetClienteId = selectedClienteId;
        if (cliIden) {
          const matchedCli = clientes.find((c) => 
            c.cuit?.toLowerCase() === cliIden.toLowerCase() ||
            c.razon_social?.toLowerCase().includes(cliIden.toLowerCase())
          );
          if (matchedCli) {
            targetClienteId = matchedCli.id;
          } else {
            errores.push(`Cliente "${cliIden}" no encontrado.`);
          }
        } else if (!targetClienteId) {
          errores.push('Falta cliente depositante (no seleccionado en modal ni en fila).');
        }

        // Load catalogs if different client
        let clientDests = curDests || [];
        let clientArts = curArts || [];
        let clientStock = curStock || {};

        if (targetClienteId && targetClienteId !== selectedClienteId) {
          if (!cacheArticulos[targetClienteId]) {
            const [dests, arts, stock] = await Promise.all([
              clientesApi.listarDestinatariosPorCliente(targetClienteId),
              articulosApi.listarPorCliente(targetClienteId),
              inventarioApi.obtenerStockConsolidadoPorCliente(targetClienteId),
            ]);
            clientDests = dests || [];
            clientArts = arts || [];
            clientStock = stock || {};
            setCacheDestinatarios((prev) => ({ ...prev, [targetClienteId]: clientDests }));
            setCacheArticulos((prev) => ({ ...prev, [targetClienteId]: clientArts }));
            setCacheStock((prev) => ({ ...prev, [targetClienteId]: clientStock }));
          } else {
            clientDests = cacheDestinatarios[targetClienteId] || [];
            clientArts = cacheArticulos[targetClienteId] || [];
            clientStock = cacheStock[targetClienteId] || {};
          }
        }

        // 2. Resolve Destinatario
        let destResolvedId: string | undefined;
        if (destIden) {
          const matchedDest = clientDests.find((d: any) =>
            d.codigo?.toLowerCase() === destIden.toLowerCase() ||
            d.cuit?.toLowerCase() === destIden.toLowerCase() ||
            d.razon_social?.toLowerCase().includes(destIden.toLowerCase())
          );
          if (matchedDest) {
            destResolvedId = matchedDest.id;
          } else {
            // If only 1 destinatario exists for this client, default to it with warning
            if (clientDests.length === 1) {
              destResolvedId = clientDests[0].id;
              advertencias.push(`Destinatario no exacto, asignado a "${clientDests[0].razon_social}".`);
            } else {
              errores.push(`Destinatario "${destIden}" no identificado para el cliente.`);
            }
          }
        } else {
          if (clientDests.length > 0) {
            destResolvedId = clientDests[0].id;
            advertencias.push(`Destinatario vacío: asignado por defecto a "${clientDests[0].razon_social}".`);
          } else {
            errores.push('El cliente no tiene destinatarios registrados.');
          }
        }

        // 3. Resolve SKU & Stock
        let artResolvedId: string | undefined;
        let artNombre: string | undefined;
        let dispStock = 0;

        if (!rawSku) {
          errores.push('SKU de artículo vacío.');
        } else {
          const matchedArt = clientArts.find((a) =>
            a.sku?.trim().toLowerCase() === rawSku.trim().toLowerCase() ||
            a.nombre?.trim().toLowerCase() === rawSku.trim().toLowerCase()
          );

          if (matchedArt) {
            artResolvedId = matchedArt.id;
            artNombre = matchedArt.nombre;
            dispStock = clientStock[matchedArt.id]?.disponible ?? 0;

            if (rawCant <= 0) {
              errores.push('La cantidad solicitada debe ser mayor a 0.');
            } else if (rawCant > dispStock) {
              advertencias.push(`Demanda (${rawCant}) supera stock disponible (${dispStock}). Se creará en backorder.`);
            }
          } else {
            errores.push(`Artículo SKU "${rawSku}" no existe en el catálogo.`);
          }
        }

        const status: 'valid' | 'warning' | 'error' =
          errores.length > 0 ? 'error' : advertencias.length > 0 ? 'warning' : 'valid';

        rows.push({
          index: i + 1,
          numeroPedido: numPed,
          clienteIdentificador: cliIden,
          destinatarioIdentificador: destIden,
          sku: rawSku,
          cantidad: rawCant,
          prioridad: rawPrio,
          ordenCompra: oc,
          fechaCompromiso: fecha,
          observaciones: obs,
          clienteIdResolved: targetClienteId,
          destinatarioIdResolved: destResolvedId,
          articuloIdResolved: artResolvedId,
          articuloNombreResolved: artNombre,
          stockDisponible: dispStock,
          status,
          errores,
          advertencias,
        });
      }

      setParsedRows(rows);
      setStep(2);
    } catch (err: any) {
      console.error('Error validando archivo:', err);
      setSubmitError(err.message || 'Error al procesar el archivo.');
    } finally {
      setIsValidating(false);
    }
  };

  // Group into orders to submit
  const stats = useMemo(() => {
    const totalLineas = parsedRows.length;
    const conError = parsedRows.filter((r) => r.status === 'error').length;
    const conWarning = parsedRows.filter((r) => r.status === 'warning').length;
    const validas = parsedRows.filter((r) => r.status !== 'error').length;

    // Distinct orders
    const ordersMap = new Map<string, number>();
    parsedRows.filter((r) => r.status !== 'error').forEach((r) => {
      ordersMap.set(r.numeroPedido, (ordersMap.get(r.numeroPedido) || 0) + 1);
    });

    return {
      totalLineas,
      conError,
      conWarning,
      validas,
      totalPedidos: ordersMap.size,
    };
  }, [parsedRows]);

  // Submit batch
  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.status !== 'error');
    if (validRows.length === 0) {
      setSubmitError('No hay renglones válidos para importar.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Group by numeroPedido
      const grouped = new Map<string, {
        clienteId: string;
        destinatarioId: string;
        numeroPedido: string;
        ordenCompra: string;
        prioridad: 'baja' | 'normal' | 'urgente';
        fechaCompromiso?: string;
        observaciones?: string;
        detalles: Array<{ articulo_id: string; cantidad_solicitada: number }>;
      }>();

      for (const row of validRows) {
        if (!row.clienteIdResolved || !row.destinatarioIdResolved || !row.articuloIdResolved) continue;

        if (!grouped.has(row.numeroPedido)) {
          grouped.set(row.numeroPedido, {
            clienteId: row.clienteIdResolved,
            destinatarioId: row.destinatarioIdResolved,
            numeroPedido: row.numeroPedido,
            ordenCompra: row.ordenCompra,
            prioridad: row.prioridad,
            fechaCompromiso: row.fechaCompromiso || undefined,
            observaciones: row.observaciones || undefined,
            detalles: [],
          });
        }

        const ped = grouped.get(row.numeroPedido)!;
        ped.detalles.push({
          articulo_id: row.articuloIdResolved,
          cantidad_solicitada: row.cantidad,
        });
      }

      const batchToInsert = Array.from(grouped.values()).map((p) => ({
        pedido: {
          cliente_id: p.clienteId,
          destinatario_id: p.destinatarioId,
          numero_pedido: p.numeroPedido,
          orden_compra_cliente: p.ordenCompra || null,
          prioridad: p.prioridad,
          fecha_compromiso_entrega: p.fechaCompromiso || null,
          observaciones: p.observaciones || null,
          estado: 'ingresado' as any,
        },
        detalles: p.detalles,
      }));

      const results = await pedidosApi.crearPedidosMasivos(batchToInsert);
      const exitosos = results.filter((r) => r.exito).length;
      const fallidos = results.filter((r) => !r.exito);

      if (fallidos.length > 0) {
        setSubmitError(`Se importaron ${exitosos} pedidos, pero ${fallidos.length} fallaron: ${fallidos[0].error}`);
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error('Error en importación batch:', err);
      setSubmitError(err.message || 'Error al persistir pedidos en la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#181717] border border-slate-200 dark:border-[#333333] rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-[#e5e2e1]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-[#26133b] border border-violet-200 dark:border-[#dab9ff]/30 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-violet-700 dark:text-[#dab9ff]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                Importación Masiva de Pedidos Outbound
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Carga por lote desde archivo CSV o pegado de Excel con validación de SKU y stock en tiempo real
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#333333] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {submitError && (
            <div className="flex items-start gap-2.5 p-3 rounded bg-[#381015]/60 border border-[#690005] text-xs text-[#ffb4ab]">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-5">
              {/* Cliente Selector Default */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                    Cliente Depositante por Defecto *
                  </label>
                  <select
                    value={selectedClienteId}
                    onChange={(e) => setSelectedClienteId(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  >
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razon_social} {c.cuit ? `(CUIT: ${c.cuit})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-1">
                    Se utilizará para resolver destinatarios y artículos si la fila no especifica CUIT_CLIENTE.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded border border-violet-200 dark:border-[#dab9ff]/40 bg-violet-50 hover:bg-violet-100 dark:bg-[#26133b] dark:hover:bg-[#351a52] text-violet-700 dark:text-[#dab9ff] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar Plantilla CSV de Ejemplo
                  </button>
                </div>
              </div>

              {/* Drag and drop upload zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-violet-500 dark:border-[#333333] dark:hover:border-[#dab9ff] rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-violet-50/30 dark:bg-[#1c1b1b]"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-violet-600 dark:text-[#dab9ff] mx-auto mb-2 opacity-80" />
                <p className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                  {fileName ? `Archivo cargado: ${fileName}` : 'Haz clic para seleccionar o arrastra un archivo CSV'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#978d9d] mt-1">
                  Formatos soportados: CSV con separación por coma (,) o punto y coma (;)
                </p>
              </div>

              {/* Raw text area for copy & paste */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4]">
                    O pega el contenido copiado de Excel aquí:
                  </label>
                  {rawText && (
                    <button
                      type="button"
                      onClick={() => setRawText('')}
                      className="text-[11px] text-rose-600 dark:text-[#ffb4ab] hover:underline"
                    >
                      Limpiar texto
                    </button>
                  )}
                </div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`NUMERO_PEDIDO,CLIENTE_CUIT,DESTINATARIO_CODIGO,SKU,CANTIDAD,PRIORIDAD,ORDEN_COMPRA\nPED-001,,SUC-01,SKU-100,10,normal,OC-55\nPED-001,,SUC-01,SKU-101,25,normal,OC-55`}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>
          ) : (
            /* STEP 2: PREVIEW & VALIDATION */
            <div className="space-y-4">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Pedidos a Crear</div>
                  <div className="font-bold text-slate-900 dark:text-[#e5e2e1] text-base font-mono">{stats.totalPedidos}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Renglones Válidos</div>
                  <div className="font-bold text-emerald-600 dark:text-[#69f0ae] text-base font-mono">{stats.validas}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Con Backorder</div>
                  <div className="font-bold text-amber-600 dark:text-[#ffddb8] text-base font-mono">{stats.conWarning}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] uppercase font-medium">Errores / Bloqueados</div>
                  <div className={`font-bold text-base font-mono ${stats.conError > 0 ? 'text-rose-600 dark:text-[#ffb4ab]' : 'text-slate-500 dark:text-[#cdc3d4]'}`}>
                    {stats.conError}
                  </div>
                </div>
              </div>

              {stats.conError > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-[#381015]/40 border border-rose-200 dark:border-[#690005] text-xs text-rose-800 dark:text-[#ffb4ab]">
                  ⚠️ Hay {stats.conError} renglón(es) con errores que serán ignorados en la importación.
                </div>
              )}

              {/* Table Preview */}
              <div className="border border-slate-200 dark:border-[#333333] rounded-xl overflow-x-auto max-h-[46vh] shadow-xs">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-12 text-center font-semibold">Fila</th>
                      <th className="px-3 py-2 font-semibold">N° Pedido</th>
                      <th className="px-3 py-2 font-semibold">Destinatario</th>
                      <th className="px-3 py-2 font-semibold">Artículo / SKU</th>
                      <th className="px-3 py-2 font-semibold text-center w-20">Cant.</th>
                      <th className="px-3 py-2 font-semibold text-center w-24">Stock Disp.</th>
                      <th className="px-3 py-2 font-semibold">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#333333]">
                    {parsedRows.map((r) => (
                      <tr
                        key={r.index}
                        className={`hover:bg-slate-50 dark:hover:bg-[#201f1f]/50 transition-colors ${
                          r.status === 'error'
                            ? 'bg-rose-50/50 dark:bg-[#381015]/20'
                            : r.status === 'warning'
                            ? 'bg-amber-50/50 dark:bg-[#3b2a10]/15'
                            : ''
                        }`}
                      >
                        <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400 dark:text-[#978d9d]">
                          {r.index}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                          {r.numeroPedido}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-[#cdc3d4]">
                          {r.destinatarioIdentificador || 'Default'}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          <span className="text-violet-700 dark:text-[#dab9ff] font-bold">[{r.sku}]</span>{' '}
                          <span className="text-slate-800 dark:text-[#e5e2e1]">{r.articuloNombreResolved || '-'}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                          {r.cantidad}
                        </td>
                        <td className="px-3 py-2 text-center font-mono">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            (r.stockDisponible || 0) >= r.cantidad
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-[#69f0ae] dark:bg-[#152e1f]'
                              : (r.stockDisponible || 0) > 0
                              ? 'text-amber-700 bg-amber-50 border border-amber-200 dark:text-[#ffddb8] dark:bg-[#3b2a10]'
                              : 'text-rose-700 bg-rose-50 border border-rose-200 dark:text-[#ffb4ab] dark:bg-[#381015]'
                          }`}>
                            {r.stockDisponible ?? 0} un.
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.errores.length > 0 ? (
                            <div className="text-rose-600 dark:text-[#ffb4ab] font-medium flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{r.errores.join(', ')}</span>
                            </div>
                          ) : r.advertencias.length > 0 ? (
                            <div className="text-amber-600 dark:text-[#ffddb8] flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>{r.advertencias.join(', ')}</span>
                            </div>
                          ) : (
                            <div className="text-emerald-600 dark:text-[#69f0ae] flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              <span>Listo para creación</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
            >
              ← Volver y corregir
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
            >
              Cancelar
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || !rawText.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {isValidating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Validando líneas y stock...
                </>
              ) : (
                <>
                  <span>Previsualizar y Validar</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isSubmitting || stats.validas === 0}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creando {stats.totalPedidos} Pedidos...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar e Importar ({stats.totalPedidos} Pedidos)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  </ModalPortal>
  );
};
