/**
 * OPENWMS 3PL - Servicio de Reconocimiento Multimodal con IA (Gemini 3.8 Flash),
 * Almacenamiento en Google Drive (Archivos Originales + CSV) y Conciliación de Pre-Órdenes.
 *
 * Permite procesar:
 * - Imágenes (fotos de remitos, listas manuscritas, capturas de WhatsApp/ERP)
 * - Documentos PDF (Packing Lists, Órdenes de Compra, Manifiestos de Carga)
 * - Correos electrónicos / Mensajes de texto (Cuerpo de mail o mensajes de bot)
 *
 * Flujo integral:
 * 1. Sube el archivo multimedia original a Google Drive (OpenWMS_Documentos/Pedidos_IA o Packing_Lists_IA).
 * 2. Extrae cabecera y renglones con `gemini-3.8-flash` (Interactions API `v1beta/interactions` rev `2026-05-20`),
 *    cruzando contra el catálogo real del cliente, destinatarios y lotes con stock disponible.
 * 3. Genera el archivo CSV estandarizado y lo sube a Google Drive (OpenWMS_Documentos/CSV_Exportados)
 *    para importación por API y acceso desde sistemas externos del cliente.
 * 4. Permite guardar como Pre-Orden en Conciliación (`pre_ordenes_conciliacion`) para que tanto el
 *    cliente (vía Bot/Portal) como el personal del depósito puedan ajustar cantidades y lotes si
 *    no hay stock suficiente antes de aceptar la orden y pasarla a IN / Picking / Outbound / Ruta.
 */

import { supabase } from '@/api/supabaseClient';
import {
  subirDocumentoAGoogleDrive,
  subirCSVAGoogleDrive,
} from '@/lib/googleDriveService';

const GEMINI_KEY_STORAGE = 'wms_gemini_api_key';
const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export type TipoOperacionIA = 'outbound' | 'inbound';

export interface LoteDisponibleItem {
  lote_id: string | null;
  numero_lote: string;
  fecha_vencimiento?: string | null;
  disponible: number;
}

export interface RenglonExtraidoIA {
  renglon_id: string;
  sku: string;
  articulo_id?: string | null;
  articulo_nombre: string;
  lote: string;
  lote_id?: string | null;
  fecha_vencimiento?: string | null;
  cantidad_original_ia: number;
  cantidad_conciliada: number;
  stock_disponible_total?: number;
  stock_disponible_lote?: number;
  lotes_disponibles?: LoteDisponibleItem[];
  tiene_faltante_stock?: boolean;
  observaciones?: string;
}

export interface ResultadoExtraccionIA {
  tipo_operacion: TipoOperacionIA;
  numero_referencia: string;
  orden_compra: string;
  destinatario_sugerido: string;
  destinatario_id?: string;
  prioridad: 'baja' | 'normal' | 'urgente';
  fecha_compromiso: string;
  transporte_datos: {
    nro_contenedor_oc?: string;
    tipo_contenedor?: string;
    transporte_empresa?: string;
    patente_camion?: string;
    chofer_nombre?: string;
    chofer_documento?: string;
    despacho_aduana?: string;
    lote_operacion?: string;
  };
  notas_generales: string;
  renglones: RenglonExtraidoIA[];
  documento_origen_url?: string;
  documento_origen_nombre?: string;
  documento_origen_mime?: string;
  csv_generado_url?: string;
  csv_contenido: string;
}

export interface PreOrdenConciliacionRecord {
  id: string;
  codigo_pre_orden: string;
  tipo_operacion: TipoOperacionIA;
  origen_canal: string;
  cliente_id: string;
  cliente_razon_social?: string;
  cliente_codigo?: string;
  destinatario_id?: string | null;
  destinatario_nombre?: string | null;
  almacen_id?: string | null;
  numero_referencia: string;
  orden_compra?: string | null;
  prioridad: 'baja' | 'normal' | 'urgente';
  fecha_compromiso?: string | null;
  transporte_datos?: Record<string, any>;
  documento_origen_url?: string | null;
  documento_origen_nombre?: string | null;
  documento_origen_mime?: string | null;
  csv_generado_url?: string | null;
  csv_contenido?: string | null;
  renglones: RenglonExtraidoIA[];
  estado_conciliacion:
    | 'pendiente_revision'
    | 'observada_sin_stock'
    | 'modificada_cliente'
    | 'modificada_deposito'
    | 'aprobada'
    | 'rechazada';
  notas_conciliacion?: string | null;
  historial_cambios?: Array<{
    fecha: string;
    actor: string;
    evento?: string;
    notas?: string;
    tiene_faltante_stock?: boolean;
  }>;
  pedido_oficial_id?: string | null;
  recepcion_oficial_id?: string | null;
  creado_en: string;
  actualizado_en: string;
}

/**
 * Obtiene la API Key de Gemini desde LocalStorage o variables de entorno (.env).
 */
export function getGeminiApiKey(): string {
  try {
    const saved = localStorage.getItem(GEMINI_KEY_STORAGE);
    if (saved && saved.trim()) return saved.trim();
  } catch {}

  const envKey =
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (import.meta as any).env?.GEMINI_API_KEY;
  return envKey ? String(envKey).trim() : '';
}

/**
 * Guarda la API Key de Gemini en LocalStorage.
 */
export function setGeminiApiKey(apiKey: string): void {
  try {
    if (!apiKey.trim()) {
      localStorage.removeItem(GEMINI_KEY_STORAGE);
    } else {
      localStorage.setItem(GEMINI_KEY_STORAGE, apiKey.trim());
    }
  } catch (e) {
    console.error('No se pudo guardar la API Key de Gemini en localStorage:', e);
  }
}

/**
 * Convierte un objeto File a base64 puro (sin prefijo data:...).
 */
async function fileToRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const clean = result.includes(',') ? result.split(',')[1] : result;
      resolve(clean);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Genera el contenido CSV estandarizado a partir de los renglones conciliados.
 * - Para Outbound: Compatible con ImportarPedidosModal y ERPs de clientes.
 * - Para Inbound: Compatible con ImportarMovimientosModal y Packing Lists.
 */
export function generarCSVDesdeExtraccion(params: {
  tipoOperacion: TipoOperacionIA;
  clienteCodigoOrCuit: string;
  numeroReferencia: string;
  destinatarioCodigo: string;
  prioridad?: string;
  ordenCompra?: string;
  fechaCompromiso?: string;
  renglones: RenglonExtraidoIA[];
}): string {
  const {
    tipoOperacion,
    clienteCodigoOrCuit,
    numeroReferencia,
    destinatarioCodigo,
    prioridad = 'normal',
    ordenCompra = '',
    fechaCompromiso = '',
    renglones,
  } = params;

  const sanitize = (val: string | number | null | undefined) =>
    String(val ?? '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/,/g, ' ')
      .trim();

  if (tipoOperacion === 'inbound') {
    const header =
      'CLIENTE,SKU,TIPO_MOVIMIENTO,CANTIDAD,LOTE,FECHA_VENCIMIENTO,UBICACION_DESTINO,DOCUMENTO_REFERENCIA,NOTAS';
    const rows = renglones.map((r) =>
      [
        sanitize(clienteCodigoOrCuit),
        sanitize(r.sku),
        'recepcion',
        Number(r.cantidad_conciliada || r.cantidad_original_ia || 0),
        sanitize(r.lote || numeroReferencia),
        sanitize(r.fecha_vencimiento || ''),
        'REC-01',
        sanitize(numeroReferencia),
        sanitize(r.observaciones || r.articulo_nombre),
      ].join(',')
    );
    return [header, ...rows].join('\n');
  } else {
    // Compatible tanto con el importador de 9 columnas (ImportarPedidosModal) como con lote en observaciones/extensión
    const header =
      'NUMERO_PEDIDO,CLIENTE_CUIT,DESTINATARIO_CODIGO,SKU,CANTIDAD,PRIORIDAD,ORDEN_COMPRA,FECHA_COMPROMISO,OBSERVACIONES,LOTE';
    const rows = renglones.map((r) =>
      [
        sanitize(numeroReferencia),
        sanitize(clienteCodigoOrCuit),
        sanitize(destinatarioCodigo || 'SUC-01'),
        sanitize(r.sku),
        Number(r.cantidad_conciliada || r.cantidad_original_ia || 0),
        sanitize(prioridad),
        sanitize(ordenCompra),
        sanitize(fechaCompromiso),
        sanitize(
          r.lote
            ? `[Lote: ${r.lote}] ${r.observaciones || ''}`.trim()
            : r.observaciones || ''
        ),
        sanitize(r.lote || ''),
      ].join(',')
    );
    return [header, ...rows].join('\n');
  }
}

/**
 * Descarga un string CSV directamente en el navegador del usuario.
 */
export function descargarCSVLocal(csvContent: string, fileName: string): void {
  const cleanName = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', cleanName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Esquema JSON estricto para Structured Output en Gemini 3.8 Flash (Interactions API).
 */
const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    numero_referencia: {
      type: 'string',
      description: 'Número de pedido, remito, packing list o referencia del documento.',
    },
    orden_compra: {
      type: 'string',
      description: 'Número de Orden de Compra (OC), contenedor o booking si figura en el documento.',
    },
    destinatario_sugerido: {
      type: 'string',
      description: 'Código de sucursal o nombre del destinatario / cliente final donde se entrega.',
    },
    prioridad: {
      type: 'string',
      enum: ['baja', 'normal', 'urgente'],
      description: 'Prioridad detectada en el pedido (urgente, normal, baja).',
    },
    fecha_compromiso: {
      type: 'string',
      description: 'Fecha solicitada de entrega o arribo en formato YYYY-MM-DD.',
    },
    transporte_datos: {
      type: 'object',
      properties: {
        nro_contenedor_oc: { type: 'string' },
        tipo_contenedor: { type: 'string' },
        transporte_empresa: { type: 'string' },
        patente_camion: { type: 'string' },
        chofer_nombre: { type: 'string' },
        chofer_documento: { type: 'string' },
        despacho_aduana: { type: 'string' },
        lote_operacion: { type: 'string' },
      },
    },
    notas_generales: {
      type: 'string',
      description: 'Instrucciones de entrega, horarios o notas relevantes del documento o mail.',
    },
    renglones: {
      type: 'array',
      description: 'Lista de artículos, SKUs, lotes y cantidades extraídos del documento.',
      items: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description: 'Código SKU o código de artículo exacto (preferir coincidencia con el catálogo provisto).',
          },
          articulo_nombre: {
            type: 'string',
            description: 'Descripción o nombre del producto.',
          },
          cantidad: {
            type: 'number',
            description: 'Cantidad numérica solicitada o declarada en el packing list.',
          },
          lote: {
            type: 'string',
            description: 'Código o número de lote o partida si se menciona (o vacío si no se especifica).',
          },
          fecha_vencimiento: {
            type: 'string',
            description: 'Fecha de vencimiento en formato YYYY-MM-DD si figura.',
          },
          observaciones: {
            type: 'string',
            description: 'Color, marca, rollos, bultos o aclaración específica del renglón.',
          },
        },
        required: ['sku', 'articulo_nombre', 'cantidad'],
      },
    },
  },
  required: ['numero_referencia', 'renglones'],
};

/**
 * Procesa un documento (Imagen, PDF o Texto de Mail/WhatsApp) con Gemini 3.8 Flash,
 * sube el archivo original a Google Drive, valida contra el catálogo y lotes en stock,
 * y genera + sube el archivo CSV resultante a Google Drive.
 */
export async function analizarDocumentoConIA(params: {
  tipoOperacion: TipoOperacionIA;
  clienteId: string;
  clienteCodigoOrCuit?: string;
  file?: File | null;
  textoMailOMensaje?: string;
  articulosCatalogo?: any[];
  destinatariosCatalogo?: any[];
  subirAGoogleDrive?: boolean;
}): Promise<ResultadoExtraccionIA> {
  const {
    tipoOperacion,
    clienteId,
    clienteCodigoOrCuit = '',
    file,
    textoMailOMensaje = '',
    articulosCatalogo = [],
    destinatariosCatalogo = [],
    subirAGoogleDrive = true,
  } = params;

  const apiKey = getGeminiApiKey();
  const isBinaryMedia = Boolean(
    file &&
      (file.type.startsWith('image/') ||
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf'))
  );

  // 1. Preparar contexto compacto del catálogo del cliente y destinatarios para la IA
  const catalogoResumen = articulosCatalogo.slice(0, 250).map((a) => ({
    sku: a.sku || a.nombre,
    nombre: a.nombre,
    descripcion: a.descripcion || '',
    color: a.color || '',
    marca: a.marca_bulto || '',
  }));

  const destinatariosResumen = destinatariosCatalogo.slice(0, 100).map((d) => ({
    codigo: d.codigo_sucursal || d.codigo || '',
    razon_social: d.razon_social || '',
    direccion: d.direccion_entrega || '',
  }));

  // 2. Subir el archivo multimedia original a Google Drive con control anti-duplicados (sin Date.now() en el nombre)
  let docOrigenUrl = '';
  let docOrigenNombre = file?.name || '';
  let docOrigenMime = file?.type || (textoMailOMensaje ? 'text/plain' : '');

  const uploadOriginalPromise = (async () => {
    if (!file || !subirAGoogleDrive) return;
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const folder = tipoOperacion === 'inbound' ? 'Packing_Lists_IA' : 'Pedidos_IA';
      const res = await subirDocumentoAGoogleDrive({
        file,
        fileName: `${tipoOperacion.toUpperCase()}_IA_${cleanName}`,
        mimeType: file.type || 'application/octet-stream',
        folder,
        deduplicate: true,
        overwrite: false,
      });
      if (res.success && res.url) {
        docOrigenUrl = res.viewUrl || res.url;
      }
    } catch (err) {
      console.warn('No se pudo subir el documento original a Google Drive:', err);
    }
  })();

  let extractedRaw: any = null;

  if (apiKey || isBinaryMedia) {
    // Construir input multimodal para la API Interactions de Gemini 3.8 Flash
    const inputParts: any[] = [];

    const systemInstruction = `Sos un asistente experto en logística 3PL y WMS (OpenWMS).
Tu tarea es extraer con precisión los datos de un ${
      tipoOperacion === 'inbound'
        ? 'Packing List / Remito de Ingreso / Manifiesto de Descarga (Inbound)'
        : 'Pedido de Salida / Orden de Compra / Solicitud de Despacho (Outbound)'
    } a partir de imágenes, PDFs o correos electrónicos.
Reglas clave:
1. Cruzá cada ítem detectado contra el CATÁLOGO DEL CLIENTE provisto. Si el documento menciona un código parcial, nombre o descripción que coincide con un artículo del catálogo, devolvé el SKU exacto del catálogo.
2. Si el documento menciona sucursal o destinatario de entrega, cruzalo contra la LISTA DE DESTINATARIOS provista y devolvé su código o razón social.
3. Si se especifican lotes o partidas, extraelos en el campo "lote".
4. Generá un numero_referencia válido si el documento no tiene uno explícito (ej. "${
      tipoOperacion === 'inbound' ? 'REC' : 'PED'
    }-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}").`;

    const promptContext = `Extraé la cabecera y todos los renglones de este documento de ${tipoOperacion.toUpperCase()}.
CATÁLOGO DE ARTÍCULOS DEL CLIENTE (para matching de SKU):
${JSON.stringify(catalogoResumen)}

DESTINATARIOS / SUCURSALES DEL CLIENTE:
${JSON.stringify(destinatariosResumen)}

${textoMailOMensaje ? `TEXTO DEL MAIL / MENSAJE ADICIONAL:\n${textoMailOMensaje}\n` : ''}`;

    inputParts.push({ type: 'text', text: promptContext });

    if (file) {
      const base64Data = await fileToRawBase64(file);
      const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        inputParts.push({
          type: 'document',
          data: base64Data,
          mime_type: 'application/pdf',
        });
      } else if (mime.startsWith('image/')) {
        inputParts.push({
          type: 'image',
          data: base64Data,
          mime_type: mime,
        });
      } else {
        // Archivo de texto / eml / csv
        const textContent = await file.text();
        inputParts.push({
          type: 'text',
          text: `CONTENIDO DEL ARCHIVO (${file.name}):\n${textContent}`,
        });
      }
    }

    const requestPayload = {
      apiKey,
      model: GEMINI_MODEL,
      system_instruction: systemInstruction,
      input: inputParts,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: EXTRACTION_JSON_SCHEMA,
      },
    };

    let interactionData: any = null;

    // A) Llamada primaria vía Supabase Edge Function (`procesar-documento-ia`)
    //    Evita cualquier bloqueo CORS (Failed to fetch) en el navegador.
    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke(
        'procesar-documento-ia',
        {
          body: requestPayload,
        }
      );

      if (edgeErr) {
        throw edgeErr;
      }
      if (edgeData?.error) {
        throw new Error(edgeData.details ? `${edgeData.error}: ${edgeData.details}` : edgeData.error);
      }
      interactionData = edgeData;
    } catch (edgeException: any) {
      console.warn('Fallback directo a Gemini tras excepción en Edge Function:', edgeException);

      if (!apiKey) {
        throw new Error(
          'Falta configurar VITE_GEMINI_API_KEY en tu archivo .env (o en el icono de llave 🔑 arriba a la derecha).'
        );
      }

      // B) Fallback directo desde navegador usando ?key= en URL y sin headers preflight no-CORS
      const response = await fetch(
        `${GEMINI_INTERACTIONS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: GEMINI_MODEL,
            system_instruction: systemInstruction,
            input: inputParts,
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: EXTRACTION_JSON_SCHEMA,
            },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Error en Gemini API (${response.status}): ${errBody}`);
      }

      interactionData = await response.json();
    }

    // Extraer el texto JSON desde la estructura `steps` o `output_text` / `outputs`
    let jsonText = '';
    if (typeof interactionData?.output_text === 'string') {
      jsonText = interactionData.output_text;
    } else if (Array.isArray(interactionData?.steps)) {
      for (const step of interactionData.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          for (const part of step.content) {
            if (part.type === 'text' && part.text) {
              jsonText += part.text;
            }
          }
        }
      }
    } else if (Array.isArray(interactionData?.outputs)) {
      for (const out of interactionData.outputs) {
        if (out.type === 'text' && out.text) {
          jsonText += out.text;
        }
      }
    }

    if (!jsonText) {
      throw new Error('Gemini no devolvió texto estructurado en la respuesta.');
    }

    extractedRaw = JSON.parse(jsonText);
  } else {
    const sourceText = textoMailOMensaje || (file ? await file.text() : '');
    if (!sourceText.trim()) {
      throw new Error('Ingresá el texto del correo/mensaje o adjuntá un archivo para analizar.');
    }

    extractedRaw = parsearTextoHeuristicoLocal(sourceText, tipoOperacion, articulosCatalogo, destinatariosCatalogo);
  }

  await uploadOriginalPromise;

  const numRef =
    extractedRaw?.numero_referencia ||
    `${tipoOperacion === 'inbound' ? 'REC' : 'PED'}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const rawRenglones = Array.isArray(extractedRaw?.renglones) ? extractedRaw.renglones : [];

  // 3. Evaluar contra la base de datos en tiempo real (stock disponible, lotes alternativos y armado de CSV)
  const { data: evalData, error: evalErr } = await (supabase.rpc as any)(
    'wms_evaluar_renglones_pre_orden',
    {
      p_cliente_id: clienteId,
      p_tipo_operacion: tipoOperacion,
      p_numero_referencia: numRef,
      p_destinatario_codigo: extractedRaw?.destinatario_sugerido || 'SUC-01',
      p_prioridad: extractedRaw?.prioridad || 'normal',
      p_orden_compra: extractedRaw?.orden_compra || '',
      p_fecha_compromiso: extractedRaw?.fecha_compromiso || new Date().toISOString().slice(0, 10),
      p_renglones: rawRenglones.map((r: any, idx: number) => ({
        renglon_id: `row-${idx + 1}`,
        sku: r.sku || '',
        articulo_nombre: r.articulo_nombre || '',
        lote: r.lote || '',
        fecha_vencimiento: r.fecha_vencimiento || null,
        cantidad_original_ia: Number(r.cantidad || 1),
        cantidad_conciliada: Number(r.cantidad || 1),
        observaciones: r.observaciones || '',
      })),
    }
  );

  let renglonesEnriquecidos: RenglonExtraidoIA[] = [];
  if (!evalErr && evalData && Array.isArray(evalData.renglones)) {
    renglonesEnriquecidos = evalData.renglones;
  } else {
    renglonesEnriquecidos = rawRenglones.map((r: any, idx: number) => ({
      renglon_id: `row-${idx + 1}`,
      sku: r.sku || '',
      articulo_nombre: r.articulo_nombre || '',
      lote: r.lote || '',
      fecha_vencimiento: r.fecha_vencimiento || null,
      cantidad_original_ia: Number(r.cantidad || 1),
      cantidad_conciliada: Number(r.cantidad || 1),
      observaciones: r.observaciones || '',
    }));
  }

  const csvContenido = generarCSVDesdeExtraccion({
    tipoOperacion,
    clienteCodigoOrCuit,
    numeroReferencia: numRef,
    destinatarioCodigo: extractedRaw?.destinatario_sugerido || 'SUC-01',
    prioridad: extractedRaw?.prioridad || 'normal',
    ordenCompra: extractedRaw?.orden_compra || '',
    fechaCompromiso: extractedRaw?.fecha_compromiso || new Date().toISOString().slice(0, 10),
    renglones: renglonesEnriquecidos,
  });

  // 4. Subir el CSV generado a Google Drive para que quede disponible por URL para APIs y sistemas del cliente
  let csvGeneradoUrl = '';
  if (subirAGoogleDrive && renglonesEnriquecidos.length > 0) {
    try {
      const csvUpload = await subirCSVAGoogleDrive({
        csvContent: csvContenido,
        fileName: `${numRef}_${tipoOperacion.toUpperCase()}.csv`,
        folder: 'CSV_Exportados',
      });
      if (csvUpload.success && csvUpload.url) {
        csvGeneradoUrl = csvUpload.viewUrl || csvUpload.url;
      }
    } catch (csvErr) {
      console.warn('No se pudo subir el CSV generado a Google Drive:', csvErr);
    }
  }

  return {
    tipo_operacion: tipoOperacion,
    numero_referencia: numRef,
    orden_compra: extractedRaw?.orden_compra || '',
    destinatario_sugerido: extractedRaw?.destinatario_sugerido || '',
    prioridad:
      extractedRaw?.prioridad === 'urgente' || extractedRaw?.prioridad === 'baja'
        ? extractedRaw.prioridad
        : 'normal',
    fecha_compromiso: extractedRaw?.fecha_compromiso || new Date().toISOString().slice(0, 10),
    transporte_datos: extractedRaw?.transporte_datos || {},
    notas_generales: extractedRaw?.notas_generales || '',
    renglones: renglonesEnriquecidos,
    documento_origen_url: docOrigenUrl || undefined,
    documento_origen_nombre: docOrigenNombre || undefined,
    documento_origen_mime: docOrigenMime || undefined,
    csv_generado_url: csvGeneradoUrl || undefined,
    csv_contenido: csvContenido,
  };
}

/**
 * Parser heurístico inteligente para correos/mensajes de texto cuando no se configuró clave de Gemini.
 */
function parsearTextoHeuristicoLocal(
  texto: string,
  tipoOperacion: TipoOperacionIA,
  articulosCatalogo: any[],
  destinatariosCatalogo: any[]
): any {
  const lines = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let ordenCompra = '';
  let destinatarioSugerido = destinatariosCatalogo[0]?.codigo_sucursal || destinatariosCatalogo[0]?.razon_social || 'SUC-01';
  const renglones: any[] = [];

  for (const line of lines) {
    const ocMatch = line.match(/(?:OC|ORDEN DE COMPRA|CONTENEDOR|CNTR)[:\s#*-]*([A-Z0-9-]+)/i);
    if (ocMatch && ocMatch[1]) {
      ordenCompra = ocMatch[1];
    }

    for (const d of destinatariosCatalogo) {
      if (
        (d.razon_social && line.toLowerCase().includes(d.razon_social.toLowerCase())) ||
        (d.codigo_sucursal && line.toLowerCase().includes(d.codigo_sucursal.toLowerCase()))
      ) {
        destinatarioSugerido = d.codigo_sucursal || d.razon_social;
      }
    }

    // Buscar coincidencias con artículos del catálogo o patrones "cantidad x SKU" / "SKU - cantidad"
    let matchedArt: any = null;
    for (const art of articulosCatalogo) {
      const skuLower = (art.sku || '').toLowerCase();
      const nomLower = (art.nombre || '').toLowerCase();
      if (
        (skuLower && line.toLowerCase().includes(skuLower)) ||
        (nomLower && nomLower.length > 2 && line.toLowerCase().includes(nomLower))
      ) {
        matchedArt = art;
        break;
      }
    }

    const qtyMatch =
      line.match(/(?:cant(?:idad)?|rollos|bultos|unid(?:ades)?|x)[:\s]*(\d+(?:[.,]\d+)?)/i) ||
      line.match(/^(\d+)\s+(?:un|rollos|bultos|cajas|x\b)/i) ||
      line.match(/\b(\d+)\s*$/);

    const loteMatch = line.match(/(?:lote|partida|lt)[:\s#]*([A-Z0-9_-]+)/i);

    if (matchedArt && qtyMatch) {
      renglones.push({
        sku: matchedArt.sku || matchedArt.nombre,
        articulo_nombre: matchedArt.descripcion || matchedArt.nombre,
        cantidad: Number(String(qtyMatch[1]).replace(',', '.')) || 1,
        lote: loteMatch ? loteMatch[1] : '',
        observaciones: line,
      });
    }
  }

  return {
    numero_referencia: `${tipoOperacion === 'inbound' ? 'REC' : 'PED'}-${new Date().getFullYear()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`,
    orden_compra: ordenCompra,
    destinatario_sugerido: destinatarioSugerido,
    prioridad: texto.toLowerCase().includes('urgente') ? 'urgente' : 'normal',
    fecha_compromiso: new Date().toISOString().slice(0, 10),
    notas_generales: 'Extraído de mensaje de texto / correo electrónico',
    renglones,
  };
}

/**
 * Servicio API para operar sobre Pre-Órdenes en Conciliación (Web UI, Portal Cliente y Bot WhatsApp).
 */
export const preOrdenesIaApi = {
  /**
   * Crea una nueva Pre-Orden en estado de conciliación (`pendiente_revision` u `observada_sin_stock`).
   */
  async crearPreOrden(payload: {
    tipo_operacion: TipoOperacionIA;
    origen_canal?: string;
    cliente_id: string;
    destinatario_id?: string;
    destinatario?: string;
    almacen_id?: string;
    numero_referencia?: string;
    orden_compra?: string;
    prioridad?: string;
    fecha_compromiso?: string;
    transporte_datos?: Record<string, any>;
    documento_origen_url?: string;
    documento_origen_nombre?: string;
    documento_origen_mime?: string;
    csv_generado_url?: string;
    csv_contenido?: string;
    renglones: RenglonExtraidoIA[];
    notas_conciliacion?: string;
    creado_por?: string;
  }): Promise<PreOrdenConciliacionRecord> {
    const { data, error } = await (supabase.rpc as any)('wms_crear_pre_orden_ia', {
      p_payload: payload,
    });
    if (error) throw error;
    return data as PreOrdenConciliacionRecord;
  },

  /**
   * Lista las Pre-Órdenes de un cliente (o `'000'` para todos los clientes).
   */
  async listarPreOrdenes(
    cliente: string = '000',
    estado?: string
  ): Promise<PreOrdenConciliacionRecord[]> {
    const { data, error } = await (supabase.rpc as any)('wms_listar_pre_ordenes_cliente', {
      p_cliente: cliente || '000',
      p_estado: estado || null,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },

  /**
   * Modifica renglones (cantidades, lotes, observaciones) de una Pre-Orden durante la conciliación
   * antes de que sea aprobada, re-evaluando el stock y regenerando + subiendo el CSV actualizado a Drive.
   */
  async modificarPreOrden(params: {
    preOrdenId: string;
    numeroReferencia?: string;
    tipoOperacion?: TipoOperacionIA;
    renglones: RenglonExtraidoIA[];
    actor: 'cliente_bot' | 'cliente_portal' | 'personal_deposito' | string;
    notas?: string;
    actualizarCsvEnDrive?: boolean;
  }): Promise<{ exito: boolean; pre_orden?: PreOrdenConciliacionRecord; error?: string }> {
    const { data, error } = await (supabase.rpc as any)(
      'wms_modificar_pre_orden_conciliacion',
      {
        p_pre_orden_id: params.preOrdenId,
        p_renglones: params.renglones,
        p_actor: params.actor,
        p_notas: params.notas || null,
        p_csv_generado_url: null,
      }
    );

    if (error) throw error;

    // Si se solicitó actualizar el CSV en Google Drive con las nuevas cantidades/lotes conciliados:
    if (data?.exito && data?.pre_orden?.csv_contenido && params.actualizarCsvEnDrive !== false) {
      try {
        const pre = data.pre_orden as PreOrdenConciliacionRecord;
        const uploadRes = await subirCSVAGoogleDrive({
          csvContent: pre.csv_contenido || '',
          fileName: `${pre.codigo_pre_orden}_CONCILIADO.csv`,
          folder: 'CSV_Exportados',
        });
        if (uploadRes.success && uploadRes.url) {
          const newCsvUrl = uploadRes.viewUrl || uploadRes.url;
          await supabase
            .from('pre_ordenes_conciliacion' as any)
            .update({ csv_generado_url: newCsvUrl })
            .eq('id', pre.id);
          pre.csv_generado_url = newCsvUrl;
        }
      } catch (e) {
        console.warn('No se pudo actualizar el CSV en Google Drive tras la conciliación:', e);
      }
    }

    return data;
  },

  /**
   * Aprueba definitivamente la Pre-Orden, convirtiéndola atómicamente en un Pedido Outbound (`ingresado`)
   * o en una Orden de Recepción Inbound (`programada`), lista para seguir el flujo (IN, Picking, Outbound, Ruta).
   */
  async aprobarPreOrden(
    preOrdenId: string,
    aprobadoPor: string = 'personal_deposito'
  ): Promise<{
    exito: boolean;
    tipo_operacion?: TipoOperacionIA;
    codigo_pre_orden?: string;
    pedido_oficial_id?: string;
    numero_pedido?: string;
    recepcion_oficial_id?: string;
    numero_recepcion?: string;
    documento_origen_url?: string;
    csv_generado_url?: string;
    error?: string;
  }> {
    const { data, error } = await (supabase.rpc as any)(
      'wms_aprobar_pre_orden_conciliacion',
      {
        p_pre_orden_id: preOrdenId,
        p_aprobado_por: aprobadoPor,
      }
    );
    if (error) throw error;
    return data;
  },
};

