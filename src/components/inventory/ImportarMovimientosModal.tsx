import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ArrowRightLeft,
  ChevronRight,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Check,
} from 'lucide-react';
import { formatNumber, formatM3 } from '@/lib/utils';
import { clientesApi } from '@/api/clientesApi';
import { articulosApi, Articulo, getDescripcionFull } from '@/api/articulosApi';
import { inventarioApi, MovimientoInventarioInput, ResultadoImportacionMovimientos } from '@/api/inventarioApi';
import { supabase } from '@/api/supabaseClient';
import { QuickSelect } from '@/components/ui/QuickSelect';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { Badge } from '@/components/ui/Badge';

export interface ImportarMovimientosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clientes?: any[];
  almacenes?: any[];
  defaultClienteId?: string;
  defaultAlmacenId?: string;
}

interface ParsedMovimientoRow {
  index: number;
  clienteTerm: string;
  skuTerm: string;
  tipoMovimiento: string;
  tipoNormalizado: string;
  cantidad: number;
  lote: string;
  fechaVencimiento?: string | null;
  ubicacionOrigen: string;
  ubicacionDestino: string;
  almacenTerm: string;
  pallet: string;
  documentoReferencia: string;
  notas: string;
  // Entidades resueltas
  clienteIdResolved?: string;
  clienteCodigoResolved?: string;
  clienteRazonSocialResolved?: string;
  articuloIdResolved?: string;
  articuloSkuResolved?: string;
  articuloNombreResolved?: string;
  articuloVolumenUnitarioM3?: number;
  volumenTotalM3?: number;
  ubicacionOrigenIdResolved?: string;
  ubicacionOrigenCodigoResolved?: string;
  ubicacionDestinoIdResolved?: string;
  ubicacionDestinoCodigoResolved?: string;
  almacenIdResolved?: string;
  stockDisponibleEnOrigen?: number;
  esLoteNuevo?: boolean;
  status: 'valid' | 'warning' | 'error';
  errores: string[];
  advertencias: string[];
}

export const ImportarMovimientosModal: React.FC<ImportarMovimientosModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clientes: clientesProp = [],
  almacenes: almacenesProp = [],
  defaultClienteId,
  defaultAlmacenId,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clientes, setClientes] = useState<any[]>(clientesProp);
  const [almacenes, setAlmacenes] = useState<any[]>(almacenesProp);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [selectedAlmacenId, setSelectedAlmacenId] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [ignorarErrores, setIgnorarErrores] = useState<boolean>(false);

  // Cachés de catálogos para validación previa
  const [cacheArticulos, setCacheArticulos] = useState<Record<string, Articulo[]>>({});
  const [cacheLotes, setCacheLotes] = useState<Record<string, any[]>>({});
  const [cacheStock, setCacheStock] = useState<Record<string, any[]>>({});
  const [dbUbicaciones, setDbUbicaciones] = useState<any[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState<boolean>(false);

  // Filas parseadas y estado de procesamiento
  const [parsedRows, setParsedRows] = useState<ParsedMovimientoRow[]>([]);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoImportacionMovimientos | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inicializar estado cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setRawText('');
      setFileName(null);
      setParsedRows([]);
      setSubmitError(null);
      setResultadoFinal(null);

      // Cargar lista de clientes si está vacía
      if (clientesProp.length > 0) {
        setClientes(clientesProp);
        setSelectedClienteId(defaultClienteId || clientesProp[0].id);
      } else {
        clientesApi.listarClientes(true).then((list) => {
          setClientes(list || []);
          if (list && list.length > 0) {
            setSelectedClienteId(defaultClienteId || list[0].id);
          }
        }).catch((err) => console.warn('Error al cargar clientes:', err));
      }

      // Cargar almacenes si está vacío
      if (almacenesProp.length > 0) {
        setAlmacenes(almacenesProp);
        setSelectedAlmacenId(defaultAlmacenId || almacenesProp[0].id);
      } else {
        supabase.from('almacenes').select('*').eq('activo', true).then(({ data }) => {
          setAlmacenes(data || []);
          if (data && data.length > 0) {
            setSelectedAlmacenId(defaultAlmacenId || data[0].id);
          }
        });
      }

      // Cargar ubicaciones generales para resolución rápida
      supabase.from('ubicaciones').select('id, codigo_etiqueta, almacen_id').then(({ data }) => {
        setDbUbicaciones(data || []);
      });
    }
  }, [isOpen, defaultClienteId, defaultAlmacenId, clientesProp, almacenesProp]);

  // Precargar catálogos del cliente seleccionado
  useEffect(() => {
    if (!selectedClienteId || cacheArticulos[selectedClienteId]) return;

    const cargarCatalogosCliente = async () => {
      setLoadingCatalogos(true);
      try {
        const [arts, lotes, stock] = await Promise.all([
          articulosApi.listarPorCliente(selectedClienteId),
          supabase.from('lotes_cliente').select('id, numero_lote, fecha_vencimiento').eq('cliente_id', selectedClienteId),
          inventarioApi.consultarStock({ clienteId: selectedClienteId }),
        ]);

        setCacheArticulos((prev) => ({ ...prev, [selectedClienteId]: arts || [] }));
        setCacheLotes((prev) => ({ ...prev, [selectedClienteId]: lotes.data || [] }));
        setCacheStock((prev) => ({ ...prev, [selectedClienteId]: stock || [] }));
      } catch (err) {
        console.warn('Error al precargar catálogos del cliente:', err);
      } finally {
        setLoadingCatalogos(false);
      }
    };

    cargarCatalogosCliente();
  }, [selectedClienteId, cacheArticulos]);

  // Descargar plantilla CSV de ejemplo
  const handleDownloadTemplate = () => {
    const csvContent =
      'CLIENTE,SKU,TIPO_MOVIMIENTO,CANTIDAD,LOTE,FECHA_VENCIMIENTO,UBICACION_ORIGEN,UBICACION_DESTINO,ALMACEN,PALLET,DOCUMENTO_REFERENCIA,NOTAS\n' +
      'CLI-001,SKU-ALIM-001,recepcion,50,L-2026-A1,2027-06-30,,REC-01,ALM-CENTRAL,PLT-001,REC-INB-9901,Ingreso inicial proveedor\n' +
      'CLI-001,SKU-ALIM-001,putaway,50,L-2026-A1,,REC-01,A1-P01-E01-N01,ALM-CENTRAL,PLT-001,PUT-8812,Reubicación a rack definitivo\n' +
      'CLI-001,SKU-ALIM-001,transferencia,10,L-2026-A1,,A1-P01-E01-N01,PICK-01,ALM-CENTRAL,,TRF-1022,Traslado a zona de picking\n' +
      'CLI-001,SKU-ALIM-001,despacho,5,L-2026-A1,,PICK-01,,ALM-CENTRAL,,REM-5541,Salida con remito de despacho\n' +
      'CLI-001,SKU-ALIM-001,merma,1,L-2026-A1,,A1-P01-E01-N01,ALM-CENTRAL,,MER-004,Rotura en estantería\n' +
      'CLI-001,SKU-ALIM-001,ajuste_positivo,2,L-2026-A1,,A1-P01-E01-N01,ALM-CENTRAL,,AJU-001,Recuento físico de inventario';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_movimientos_inventario.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Manejo de carga de archivos (Drag & Drop o input file)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawText(text);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawText(text);
    };
    reader.readAsText(file);
  };

  // Normalización de tipo de movimiento
  const normalizarTipoMov = (raw: string): string => {
    const t = raw.toLowerCase().trim();
    if (['recepcion', 'ingreso', 'ingreso_inicial', 'entrada'].includes(t)) return 'recepcion';
    if (['ajuste_positivo', 'ajuste+', 'ajuste_pos', '+'].includes(t)) return 'ajuste_positivo';
    if (['despacho', 'salida', 'egreso'].includes(t)) return 'despacho';
    if (['ajuste_negativo', 'ajuste-', 'ajuste_neg', '-'].includes(t)) return 'ajuste_negativo';
    if (['merma', 'scrap', 'baja', 'rotura'].includes(t)) return 'merma';
    if (['transferencia', 'transferencia_interna', 'traslado', 'reubicacion'].includes(t)) return 'transferencia';
    if (['putaway'].includes(t)) return 'putaway';
    if (['picking'].includes(t)) return 'picking';
    if (['despaletizado'].includes(t)) return 'despaletizado';
    if (['paletizado_despacho'].includes(t)) return 'paletizado_despacho';
    return t;
  };

  // Validación y parseo inteligente
  const handleValidate = async () => {
    if (!rawText.trim()) {
      setSubmitError('Debe ingresar o cargar texto CSV con los movimientos.');
      return;
    }

    setIsValidating(true);
    setSubmitError(null);

    try {
      const lines = rawText.trim().split(/\r?\n/);
      if (lines.length === 0) {
        setSubmitError('El contenido está vacío.');
        setIsValidating(false);
        return;
      }

      // Asegurar catálogos del cliente por defecto
      let curArts = cacheArticulos[selectedClienteId];
      let curLotes = cacheLotes[selectedClienteId];
      let curStock = cacheStock[selectedClienteId];

      if (!curArts && selectedClienteId) {
        const [arts, lotes, stock] = await Promise.all([
          articulosApi.listarPorCliente(selectedClienteId),
          supabase.from('lotes_cliente').select('id, numero_lote, fecha_vencimiento').eq('cliente_id', selectedClienteId),
          inventarioApi.consultarStock({ clienteId: selectedClienteId }),
        ]);
        curArts = arts || [];
        curLotes = lotes.data || [];
        curStock = stock || [];
        setCacheArticulos((prev) => ({ ...prev, [selectedClienteId]: curArts }));
        setCacheLotes((prev) => ({ ...prev, [selectedClienteId]: curLotes }));
        setCacheStock((prev) => ({ ...prev, [selectedClienteId]: curStock }));
      }

      // Asegurar ubicaciones
      let ubics = dbUbicaciones;
      if (ubics.length === 0) {
        const { data: uData } = await supabase.from('ubicaciones').select('id, codigo_etiqueta, almacen_id');
        ubics = uData || [];
        setDbUbicaciones(ubics);
      }

      // Detectar si la primera fila es encabezado
      const firstLineLower = lines[0].toLowerCase();
      let hasHeader = false;
      let headerMap: Record<string, number> = {};
      let startIdx = 0;

      if (
        firstLineLower.includes('sku') ||
        firstLineLower.includes('tipo') ||
        firstLineLower.includes('cantidad') ||
        firstLineLower.includes('movimiento')
      ) {
        hasHeader = true;
        startIdx = 1;
        const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

        headers.forEach((h, idx) => {
          if (h.includes('cliente')) headerMap['cliente'] = idx;
          else if (h.includes('sku') || h.includes('articulo') || h.includes('producto')) headerMap['sku'] = idx;
          else if (h.includes('tipo') || h.includes('movimiento') || h.includes('operacion')) headerMap['tipo'] = idx;
          else if (h.includes('cant') || h.includes('qty')) headerMap['cantidad'] = idx;
          else if (h.includes('lote') || h.includes('batch')) headerMap['lote'] = idx;
          else if (h.includes('venc') || h.includes('f_vto')) headerMap['vencimiento'] = idx;
          else if (h.includes('origen') || h.includes('desde')) headerMap['origen'] = idx;
          else if (h.includes('destino') || h.includes('hacia')) headerMap['destino'] = idx;
          else if (h.includes('almacen') || h.includes('deposito')) headerMap['almacen'] = idx;
          else if (h.includes('pallet') || h.includes('lpn')) headerMap['pallet'] = idx;
          else if (h.includes('ref') || h.includes('remito') || h.includes('doc')) headerMap['referencia'] = idx;
          else if (h.includes('nota') || h.includes('obs') || h.includes('motivo')) headerMap['notas'] = idx;
        });
      }

      const rows: ParsedMovimientoRow[] = [];

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;

        const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
        const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));

        const getCol = (namedKey: string, defaultPos: number): string => {
          if (hasHeader && headerMap[namedKey] !== undefined) {
            return cols[headerMap[namedKey]] || '';
          }
          return cols[defaultPos] || '';
        };

        const cliTerm = getCol('cliente', 0) || '';
        const skuTerm = getCol('sku', 1) || '';
        const tipoTerm = getCol('tipo', 2) || '';
        const rawCant = parseFloat(getCol('cantidad', 3).replace(',', '.')) || 0;
        const loteTerm = getCol('lote', 4) || 'LOTE-GENERAL';
        const fVenc = getCol('vencimiento', 5) || null;
        const origTerm = getCol('origen', 6) || '';
        const destTerm = getCol('destino', 7) || '';
        const almTerm = getCol('almacen', 8) || '';
        const pltTerm = getCol('pallet', 9) || '';
        const docRef = getCol('referencia', 10) || '';
        const notas = getCol('notas', 11) || '';

        const errores: string[] = [];
        const advertencias: string[] = [];

        // 1. Resolver Cliente
        let targetClienteId = selectedClienteId;
        let targetCliente: any = null;

        if (cliTerm) {
          const match = clientes.find(
            (c) =>
              c.id.toLowerCase() === cliTerm.toLowerCase() ||
              c.codigo?.toLowerCase() === cliTerm.toLowerCase() ||
              c.razon_social?.toLowerCase().includes(cliTerm.toLowerCase()) ||
              c.cuit?.toLowerCase() === cliTerm.toLowerCase()
          );
          if (match) {
            targetClienteId = match.id;
            targetCliente = match;
          } else {
            errores.push(`Cliente "${cliTerm}" no encontrado en el sistema.`);
          }
        } else if (targetClienteId) {
          targetCliente = clientes.find((c) => c.id === targetClienteId);
        } else {
          errores.push('Falta cliente (no especificado en fila ni preseleccionado).');
        }

        // Cargar catálogos dinámicamente si el cliente es distinto
        let clientArts = curArts || [];
        let clientLotes = curLotes || [];
        let clientStock = curStock || [];

        if (targetClienteId && targetClienteId !== selectedClienteId) {
          if (!cacheArticulos[targetClienteId]) {
            const [arts, lotes, stock] = await Promise.all([
              articulosApi.listarPorCliente(targetClienteId),
              supabase.from('lotes_cliente').select('id, numero_lote, fecha_vencimiento').eq('cliente_id', targetClienteId),
              inventarioApi.consultarStock({ clienteId: targetClienteId }),
            ]);
            clientArts = arts || [];
            clientLotes = lotes.data || [];
            clientStock = stock || [];
            setCacheArticulos((prev) => ({ ...prev, [targetClienteId]: clientArts }));
            setCacheLotes((prev) => ({ ...prev, [targetClienteId]: clientLotes }));
            setCacheStock((prev) => ({ ...prev, [targetClienteId]: clientStock }));
          } else {
            clientArts = cacheArticulos[targetClienteId] || [];
            clientLotes = cacheLotes[targetClienteId] || [];
            clientStock = cacheStock[targetClienteId] || [];
          }
        }

        // 2. Resolver Artículo
        let matchedArt: Articulo | undefined;
        if (skuTerm) {
          matchedArt = clientArts.find(
            (a) =>
              a.sku?.toLowerCase() === skuTerm.toLowerCase() ||
              a.codigo_barras === skuTerm ||
              a.id === skuTerm ||
              a.nombre?.toLowerCase() === skuTerm.toLowerCase()
          );
          if (!matchedArt) {
            errores.push(`SKU / Artículo "${skuTerm}" no existe para el cliente.`);
          }
        } else {
          errores.push('SKU / Artículo no especificado.');
        }

        // 3. Validar Tipo de Movimiento
        const tipoNorm = normalizarTipoMov(tipoTerm);
        const tiposValidos = [
          'recepcion',
          'ajuste_positivo',
          'despacho',
          'ajuste_negativo',
          'merma',
          'transferencia',
          'putaway',
          'picking',
          'despaletizado',
          'paletizado_despacho',
        ];
        if (!tipoNorm || !tiposValidos.includes(tipoNorm)) {
          errores.push(
            `Tipo de movimiento inválido: "${tipoTerm}". Permitidos: recepcion, ajuste_positivo, despacho, ajuste_negativo, merma, transferencia, putaway, picking.`
          );
        }

        // 4. Validar Cantidad
        if (rawCant <= 0 || isNaN(rawCant)) {
          errores.push(`Cantidad inválida (${rawCant}). Debe ser mayor a 0.`);
        }

        // 5. Validar Lote
        let esLoteNuevo = false;
        if (loteTerm) {
          const matchedLote = clientLotes.find((l) => l.numero_lote?.toLowerCase() === loteTerm.toLowerCase());
          if (!matchedLote) {
            esLoteNuevo = true;
            advertencias.push(`Lote "${loteTerm}" no registrado previamente. Se creará automáticamente.`);
          }
        }

        // 6. Validar Ubicaciones
        let origIdResolved: string | undefined;
        let origCodigoResolved: string | undefined;
        let destIdResolved: string | undefined;
        let destCodigoResolved: string | undefined;

        if (origTerm) {
          const matchUbic = ubics.find(
            (u) => u.id === origTerm || u.codigo_etiqueta.toLowerCase() === origTerm.toLowerCase()
          );
          if (matchUbic) {
            origIdResolved = matchUbic.id;
            origCodigoResolved = matchUbic.codigo_etiqueta;
          } else {
            errores.push(`Ubicación de origen "${origTerm}" no existe en el depósito.`);
          }
        }

        if (destTerm) {
          const matchUbic = ubics.find(
            (u) => u.id === destTerm || u.codigo_etiqueta.toLowerCase() === destTerm.toLowerCase()
          );
          if (matchUbic) {
            destIdResolved = matchUbic.id;
            destCodigoResolved = matchUbic.codigo_etiqueta;
          } else {
            errores.push(`Ubicación de destino "${destTerm}" no existe en el depósito.`);
          }
        }

        // Reglas específicas según tipo
        const esEntrada = ['recepcion', 'ajuste_positivo'].includes(tipoNorm);
        const esSalida = ['despacho', 'ajuste_negativo', 'merma'].includes(tipoNorm);
        const esTraslado = ['transferencia', 'putaway', 'picking', 'despaletizado', 'paletizado_despacho'].includes(tipoNorm);

        if (esEntrada) {
          if (!destTerm) {
            advertencias.push('Sin ubicación de destino especificada: se asignará la ubicación de recepción por defecto.');
          }
        }

        // Validar stock disponible para Salidas y Traslados
        let stockDispEnOrigen = 0;
        if (matchedArt) {
          const stockFilas = clientStock.filter((s) => s.articulo_id === matchedArt?.id);

          if (origIdResolved) {
            const stockEnUbic = stockFilas.find((s) => s.ubicacion_id === origIdResolved);
            stockDispEnOrigen = Number(stockEnUbic?.cantidad_disponible || 0);
          } else {
            // Suma total disponible si no se indicó ubicación precisa aún
            stockDispEnOrigen = stockFilas.reduce((acc, s) => acc + Number(s.cantidad_disponible || 0), 0);
          }

          if (esSalida || esTraslado) {
            if (!origTerm) {
              if (stockDispEnOrigen < rawCant) {
                errores.push(`Stock insuficiente para salida. Disponible total: ${stockDispEnOrigen}, Requerido: ${rawCant}.`);
              } else {
                advertencias.push('Ubicación de origen omitida: el sistema seleccionará automáticamente el rack con stock.');
              }
            } else {
              if (stockDispEnOrigen < rawCant) {
                errores.push(
                  `Stock insuficiente en ${origCodigoResolved || origTerm}. Disponible: ${stockDispEnOrigen}, Requerido: ${rawCant}.`
                );
              }
            }
          }
        }

        if (esTraslado) {
          if (!destTerm) {
            errores.push('Debe especificarse la ubicación de destino para el traslado / putaway.');
          }
          if (origTerm && destTerm && origTerm.toLowerCase() === destTerm.toLowerCase()) {
            errores.push('La ubicación de origen y destino no pueden ser iguales.');
          }
        }

        // Cálculo de cubicaje
        const volUnit = Number(matchedArt?.volumen_unitario_m3 || 0);
        const volTotal = Math.round(rawCant * volUnit * 10000) / 10000;

        let status: 'valid' | 'warning' | 'error' = 'valid';
        if (errores.length > 0) status = 'error';
        else if (advertencias.length > 0) status = 'warning';

        rows.push({
          index: i + 1,
          clienteTerm: cliTerm || targetCliente?.codigo || 'N/A',
          skuTerm,
          tipoMovimiento: tipoTerm,
          tipoNormalizado: tipoNorm,
          cantidad: rawCant,
          lote: loteTerm,
          fechaVencimiento: fVenc,
          ubicacionOrigen: origTerm,
          ubicacionDestino: destTerm,
          almacenTerm: almTerm || selectedAlmacenId,
          pallet: pltTerm,
          documentoReferencia: docRef,
          notas,
          clienteIdResolved: targetClienteId,
          clienteCodigoResolved: targetCliente?.codigo,
          clienteRazonSocialResolved: targetCliente?.razon_social,
          articuloIdResolved: matchedArt?.id,
          articuloSkuResolved: matchedArt?.sku,
          articuloNombreResolved: matchedArt ? getDescripcionFull(matchedArt) : undefined,
          articuloVolumenUnitarioM3: volUnit,
          volumenTotalM3: volTotal,
          ubicacionOrigenIdResolved: origIdResolved,
          ubicacionOrigenCodigoResolved: origCodigoResolved,
          ubicacionDestinoIdResolved: destIdResolved,
          ubicacionDestinoCodigoResolved: destCodigoResolved,
          almacenIdResolved: selectedAlmacenId,
          stockDisponibleEnOrigen: stockDispEnOrigen,
          esLoteNuevo,
          status,
          errores,
          advertencias,
        });
      }

      setParsedRows(rows);
      setStep(2);
    } catch (err: any) {
      console.error('Error al procesar el archivo CSV:', err);
      setSubmitError(err?.message || 'Error inesperado durante la validación del archivo.');
    } finally {
      setIsValidating(false);
    }
  };

  // Contadores de validación
  const countValidos = useMemo(() => parsedRows.filter((r) => r.status === 'valid').length, [parsedRows]);
  const countAdvertencias = useMemo(() => parsedRows.filter((r) => r.status === 'warning').length, [parsedRows]);
  const countErrores = useMemo(() => parsedRows.filter((r) => r.status === 'error').length, [parsedRows]);

  // Ejecución final de la importación
  const handleSubmit = async () => {
    // Si no se ignoran errores y hay filas con error, frenar
    if (!ignorarErrores && countErrores > 0) {
      setSubmitError('Debe corregir las filas con error o activar la opción de continuar ante errores parciales.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Filtrar filas aplicables
      const filasAImportar = ignorarErrores ? parsedRows.filter((r) => r.status !== 'error') : parsedRows;

      if (filasAImportar.length === 0) {
        throw new Error('No hay filas válidas para procesar.');
      }

      const payload: MovimientoInventarioInput[] = filasAImportar.map((row) => ({
        cliente_id: row.clienteIdResolved,
        cliente_codigo: row.clienteCodigoResolved,
        articulo_id: row.articuloIdResolved,
        sku: row.articuloSkuResolved || row.skuTerm,
        tipo_movimiento: row.tipoNormalizado,
        cantidad: row.cantidad,
        lote: row.lote,
        fecha_vencimiento: row.fechaVencimiento,
        ubicacion_origen: row.ubicacionOrigenCodigoResolved || row.ubicacionOrigen,
        ubicacion_origen_id: row.ubicacionOrigenIdResolved,
        ubicacion_destino: row.ubicacionDestinoCodigoResolved || row.ubicacionDestino,
        ubicacion_destino_id: row.ubicacionDestinoIdResolved,
        almacen_id: row.almacenIdResolved,
        pallet: row.pallet,
        documento_referencia: row.documentoReferencia,
        notas: row.notas,
      }));

      const res = await inventarioApi.importarMovimientosMasivos(payload, ignorarErrores);
      setResultadoFinal(res);
      setStep(3);
    } catch (err: any) {
      console.error('Error al importar movimientos de inventario:', err);
      setSubmitError(err?.message || 'Error durante la aplicación de los movimientos en la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-5xl my-auto bg-white dark:bg-[#1a1919] border border-slate-200 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50/70 dark:bg-[#201f1f]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-100 text-violet-700 dark:bg-[#dab9ff]/10 dark:text-[#dab9ff]">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                  <span>Importador de Movimientos de Inventario (CSV)</span>
                  <Badge variant="outline" className="text-[10px] tracking-wide font-mono">
                    Kardex & Stock Físico
                  </Badge>
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                  Carga masiva con generación o descuento de stock en depósito y trazabilidad inmutable
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#282727] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Wizard Indicator */}
          <div className="grid grid-cols-3 border-b border-slate-200 dark:border-[#333333] text-xs font-semibold text-center bg-white dark:bg-[#1a1919]">
            <div
              className={`py-2.5 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
                step === 1
                  ? 'border-violet-600 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff] bg-violet-50/40 dark:bg-[#dab9ff]/5'
                  : 'border-transparent text-slate-500 dark:text-[#8e8d8d]'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-slate-200 dark:bg-[#333333]">
                1
              </span>
              <span>Carga & Configuración</span>
            </div>

            <div
              className={`py-2.5 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
                step === 2
                  ? 'border-violet-600 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff] bg-violet-50/40 dark:bg-[#dab9ff]/5'
                  : 'border-transparent text-slate-500 dark:text-[#8e8d8d]'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-slate-200 dark:bg-[#333333]">
                2
              </span>
              <span>Vista Previa & Validación</span>
            </div>

            <div
              className={`py-2.5 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
                step === 3
                  ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-500/5'
                  : 'border-transparent text-slate-500 dark:text-[#8e8d8d]'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-slate-200 dark:bg-[#333333]">
                3
              </span>
              <span>Resultado de Importación</span>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {submitError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Ocurrió un error:</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{submitError}</p>
                </div>
              </motion.div>
            )}

            {/* STEP 1: Carga y Configuración */}
            {step === 1 && (
              <div className="space-y-6">
                {/* Selectores de Cliente y Almacén Predeterminados */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                      Cliente Depositante Predeterminado
                    </label>
                    <QuickSelect
                      options={clientes.map((c) => ({
                        value: c.id,
                        label: `${c.codigo || ''} - ${c.razon_social || c.nombre || 'Sin Nombre'}`.trim(),
                      }))}
                      value={selectedClienteId}
                      onChange={(val) => setSelectedClienteId(val)}
                      placeholder="Seleccionar cliente..."
                      className="w-full text-xs"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-[#8e8d8d] mt-1">
                      Se aplicará a las filas que no especifiquen la columna CLIENTE.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                      Almacén / Depósito de Operación
                    </label>
                    <QuickSelect
                      options={almacenes.map((a) => ({
                        value: a.id,
                        label: `${a.codigo || ''} - ${a.nombre || 'Almacén'}`.trim(),
                      }))}
                      value={selectedAlmacenId}
                      onChange={(val) => setSelectedAlmacenId(val)}
                      placeholder="Seleccionar almacén..."
                      className="w-full text-xs"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-[#8e8d8d] mt-1">
                      Almacén físico de referencia para las ubicaciones del archivo.
                    </p>
                  </div>
                </div>

                {/* Zona Drag & Drop / Selección de Archivo */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative border-2 border-dashed border-slate-300 dark:border-[#44424a] hover:border-violet-500 dark:hover:border-[#dab9ff] rounded-2xl p-8 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-[#201f1f]/40 hover:bg-violet-50/20 dark:hover:bg-[#dab9ff]/5"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-[#282727] text-violet-600 dark:text-[#dab9ff] shadow-sm group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] mt-1">
                      {fileName ? `Archivo seleccionado: ${fileName}` : 'Haga clic para subir o arrastre su archivo CSV / TSV'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-[#cdc3d4] max-w-md">
                      Formatos compatibles: .CSV (separado por comas o punto y coma) o .TSV exportado de Excel / Sheets.
                    </p>
                  </div>
                </div>

                {/* Área de texto para pegar directamente */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-2">
                      <span>O bien pegue el contenido de la planilla aquí:</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-[#dab9ff] dark:hover:text-[#eedbff] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar Plantilla CSV de Ejemplo</span>
                    </button>
                  </div>

                  <textarea
                    rows={6}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="CLIENTE,SKU,TIPO_MOVIMIENTO,CANTIDAD,LOTE,FECHA_VENCIMIENTO,UBICACION_ORIGEN,UBICACION_DESTINO,ALMACEN,PALLET,DOCUMENTO_REFERENCIA,NOTAS&#10;CLI-001,SKU-001,recepcion,50,L-2026-01,2027-01-01,,REC-01,ALM-CENTRAL,PLT-001,REM-991,Ingreso inicial&#10;CLI-001,SKU-001,transferencia,10,L-2026-01,,REC-01,A1-P01-E01-N01,ALM-CENTRAL,,TRF-001,Traslado a rack"
                    className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1a1919] text-slate-800 dark:text-[#e5e2e1] focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-hidden"
                  />
                </div>

                {/* Instrucciones de Columnas */}
                <div className="p-3.5 rounded-xl bg-violet-50/70 dark:bg-[#201330] border border-violet-200 dark:border-[#dab9ff]/30 text-xs text-violet-900 dark:text-[#eedbff] space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                    <span>Reglas de Negocio según el Tipo de Movimiento:</span>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 pl-1">
                    <li>
                      <strong>Entradas (`recepcion`, `ajuste_positivo`):</strong> Requiere ubicación de destino (o asigna por defecto). Aumenta stock disponible y volumen M3 en depósito.
                    </li>
                    <li>
                      <strong>Salidas (`despacho`, `ajuste_negativo`, `merma`):</strong> Requiere ubicación de origen (o la deduce por disponibilidad). Valida stock suficiente y descuenta existencias.
                    </li>
                    <li>
                      <strong>Traslados (`transferencia`, `putaway`, `picking`):</strong> Requiere origen y destino distintos. Valida y descuenta en origen y suma en destino sin variar el total global.
                    </li>
                    <li>
                      <strong>Lotes y Pallets:</strong> Si el lote especificado no existe para el cliente, se registra automáticamente.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* STEP 2: Vista Previa y Validación */}
            {step === 2 && (
              <div className="space-y-4">
                {/* Métricas de Validación */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#8e8d8d]">
                      Total Filas
                    </span>
                    <p className="text-lg font-extrabold text-slate-900 dark:text-[#e5e2e1]">{parsedRows.length}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Válidas
                    </span>
                    <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">{countValidos}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                    <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Advertencias
                    </span>
                    <p className="text-lg font-extrabold text-amber-800 dark:text-amber-300">{countAdvertencias}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                    <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Errores Críticos
                    </span>
                    <p className="text-lg font-extrabold text-rose-800 dark:text-rose-300">{countErrores}</p>
                  </div>
                </div>

                {/* Opción de tolerancia a errores */}
                {countErrores > 0 && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>
                        Se encontraron <strong>{countErrores} fila(s) con errores</strong>. Puede optar por procesar solo las filas válidas ({countValidos + countAdvertencias}) o volver para corregirlas.
                      </span>
                    </div>
                    <label className="flex items-center gap-2 font-semibold text-rose-900 dark:text-rose-100 cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={ignorarErrores}
                        onChange={(e) => setIgnorarErrores(e.target.checked)}
                        className="rounded text-violet-600 focus:ring-violet-500 w-4 h-4"
                      />
                      <span>Continuar con filas válidas</span>
                    </label>
                  </div>
                )}

                {/* Tabla de Previsualización */}
                <div className="border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden max-h-[46vh] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-[#252424] text-slate-700 dark:text-[#cdc3d4] font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-[#333333] z-10">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Estado</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Artículo / SKU</th>
                        <th className="py-2.5 px-3">Lote</th>
                        <th className="py-2.5 px-3 text-right">Cantidad</th>
                        <th className="py-2.5 px-3 text-right">M³ Est.</th>
                        <th className="py-2.5 px-3">Origen &rarr; Destino</th>
                        <th className="py-2.5 px-3">Observaciones / Errores</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#282727] bg-white dark:bg-[#1a1919]">
                      {parsedRows.map((row) => {
                        const esEntrada = ['recepcion', 'ajuste_positivo'].includes(row.tipoNormalizado);
                        const esSalida = ['despacho', 'ajuste_negativo', 'merma'].includes(row.tipoNormalizado);

                        return (
                          <tr
                            key={row.index}
                            className={`hover:bg-slate-50 dark:hover:bg-[#201f1f] transition-colors ${
                              row.status === 'error'
                                ? 'bg-rose-50/40 dark:bg-rose-950/20'
                                : row.status === 'warning'
                                ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                : ''
                            }`}
                          >
                            <td className="py-2 px-3 font-mono text-slate-400 dark:text-[#8e8d8d]">{row.index}</td>
                            <td className="py-2 px-3">
                              {row.status === 'valid' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <Check className="w-3.5 h-3.5" /> Válido
                                </span>
                              )}
                              {row.status === 'warning' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Advertencia
                                </span>
                              )}
                              {row.status === 'error' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                  <X className="w-3.5 h-3.5" /> Error
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  esEntrada
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : esSalida
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                                    : 'bg-violet-100 text-violet-800 dark:bg-[#dab9ff]/20 dark:text-[#dab9ff]'
                                }`}
                              >
                                {row.tipoNormalizado}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-800 dark:text-[#e5e2e1]">
                                {row.articuloSkuResolved || row.skuTerm}
                              </div>
                              {row.articuloNombreResolved && (
                                <div className="text-[11px] text-slate-500 dark:text-[#8e8d8d] truncate max-w-xs">
                                  {row.articuloNombreResolved}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono">
                              <span className="text-slate-700 dark:text-[#cdc3d4]">{row.lote}</span>
                              {row.esLoteNuevo && (
                                <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400 font-sans font-bold">
                                  (Nuevo)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">
                              {formatNumber(row.cantidad)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-[#cdc3d4]">
                              {row.volumenTotalM3 ? formatM3(row.volumenTotalM3) : '-'}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1 font-mono text-[11px]">
                                <span
                                  className={`px-1.5 py-0.5 rounded ${
                                    row.ubicacionOrigenCodigoResolved
                                      ? 'bg-slate-100 dark:bg-[#282727] text-slate-800 dark:text-[#e5e2e1]'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {row.ubicacionOrigenCodigoResolved || row.ubicacionOrigen || '(N/A)'}
                                </span>
                                <span className="text-slate-400">&rarr;</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded ${
                                    row.ubicacionDestinoCodigoResolved
                                      ? 'bg-violet-50 text-violet-800 dark:bg-[#dab9ff]/10 dark:text-[#dab9ff]'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {row.ubicacionDestinoCodigoResolved || row.ubicacionDestino || '(Auto)'}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              {row.errores.length > 0 ? (
                                <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                                  {row.errores.join('; ')}
                                </span>
                              ) : row.advertencias.length > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400 text-[11px]">
                                  {row.advertencias.join('; ')}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STEP 3: Resultados */}
            {step === 3 && resultadoFinal && (
              <div className="space-y-6 text-center py-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-[#e5e2e1]">
                    ¡Importación Procesada Exitosamente!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mt-1 max-w-md mx-auto">
                    Se han generado los asientos inmutables en el Kardex y actualizado el stock físico disponible en el inventario.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
                    <span className="text-xs font-semibold text-slate-500 dark:text-[#8e8d8d]">Total Filas</span>
                    <p className="text-2xl font-black text-slate-800 dark:text-[#e5e2e1] mt-0.5">
                      {resultadoFinal.total}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Procesados</span>
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {resultadoFinal.procesados}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Omitidos / Error</span>
                    <p className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-0.5">
                      {resultadoFinal.fallidos}
                    </p>
                  </div>
                </div>

                {resultadoFinal.errores && resultadoFinal.errores.length > 0 && (
                  <div className="text-left max-w-xl mx-auto p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50">
                    <h4 className="text-xs font-bold text-rose-800 dark:text-rose-200 mb-2">
                      Detalle de Filas Omitidas:
                    </h4>
                    <ul className="text-[11px] text-rose-700 dark:text-rose-300 space-y-1 list-disc list-inside">
                      {resultadoFinal.errores.map((e, idx) => (
                        <li key={idx}>
                          Fila {e.fila}: {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-[#333333] bg-slate-50/70 dark:bg-[#201f1f] flex items-center justify-between">
            {step === 1 && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-200/60 dark:hover:bg-[#282727] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating || !rawText.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validando datos...</span>
                    </>
                  ) : (
                    <>
                      <span>Validar Movimientos</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-200/60 dark:hover:bg-[#282727] transition-colors"
                >
                  &larr; Volver a Editar
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || (!ignorarErrores && countErrores > 0) || (countValidos === 0 && countAdvertencias === 0)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Procesando en Kardex e Inventario...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        Confirmar e Importar ({ignorarErrores ? countValidos + countAdvertencias : parsedRows.length} movimientos)
                      </span>
                    </>
                  )}
                </button>
              </>
            )}

            {step === 3 && (
              <div className="w-full flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 transition-all"
                >
                  Finalizar & Actualizar Kardex
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </ModalPortal>
  );
};
