/**
 * OPENWMS 3PL - Servicio de Almacenamiento en Google Drive
 * 
 * Permite subir fotos, remitos conformados y documentos directamente a una
 * carpeta exclusiva en Google Drive ("OpenWMS_Documentos"), almacenando
 * en la base de datos únicamente el enlace permanente (URL), evitando
 * sobrecargar y saturar la base de datos PostgreSQL con datos base64 o binarios.
 */

import { supabase } from '@/api/supabaseClient';

const STORAGE_KEY = 'wms_google_drive_webhook_url';
const DEDUP_CACHE_KEY = 'wms_drive_upload_dedup_v1';
const DEFAULT_ROOT_FOLDER = 'OpenWMS_Documentos';

export interface SubirArchivoParams {
  file?: File | null;
  base64?: string | null;
  fileName?: string;
  mimeType?: string;
  folder?: 'Remitos_Conformados' | 'Recepciones' | 'Despachos' | 'Pedidos_IA' | 'Packing_Lists_IA' | 'CSV_Exportados' | 'General' | string;
  rootFolder?: string;
  /** Si es true, reemplaza el archivo existente con el mismo nombre (ej. actualización de CSV conciliado) */
  overwrite?: boolean;
  /** Si es false, desactiva el control anti-duplicados (por defecto es true) */
  deduplicate?: boolean;
}

export interface SubirArchivoResult {
  success: boolean;
  url: string;
  viewUrl?: string;
  fileId?: string;
  fileName?: string;
  provider: 'google_drive' | 'supabase_storage' | 'base64_fallback';
  deduplicated?: boolean;
  error?: string;
}

const inFlightUploads = new Map<string, Promise<SubirArchivoResult>>();

/**
 * Calcula un hash SHA-256 corto (12 chars hex) sobre el contenido base64 para evitar
 * volver a subir la misma imagen/PDF/CSV a Google Drive si el usuario reintenta.
 */
async function computeContentHash(base64Data: string): Promise<string> {
  const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(clean);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 12);
    }
  } catch {}
  // Fallback FNV-1a rápido si crypto.subtle no está disponible
  let h = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + '_' + clean.length;
}

function getCachedUpload(dedupKey: string): SubirArchivoResult | null {
  try {
    const raw = localStorage.getItem(DEDUP_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[dedupKey] || null;
  } catch {
    return null;
  }
}

function setCachedUpload(dedupKey: string, res: SubirArchivoResult): void {
  try {
    const raw = localStorage.getItem(DEDUP_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const keys = Object.keys(map);
    if (keys.length > 200) {
      delete map[keys[0]];
    }
    map[dedupKey] = res;
    localStorage.setItem(DEDUP_CACHE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Obtiene la URL configurada del Webhook / Web App de Google Drive.
 * Prioridad: 1. LocalStorage (configurable desde la UI) 2. Variable de entorno .env
 */
export function getGoogleDriveWebhookUrl(): string {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local && local.trim().startsWith('http')) {
      return local.trim();
    }
  } catch {}

  const envUrl = (import.meta as any).env?.VITE_GOOGLE_DRIVE_WEBHOOK_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().startsWith('http')) {
    return envUrl.trim();
  }

  return '';
}

/**
 * Guarda la URL del Webhook de Google Drive en LocalStorage.
 */
export function setGoogleDriveWebhookUrl(url: string): void {
  try {
    if (!url || !url.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, url.trim());
    }
  } catch (err) {
    console.error('Error guardando webhook de Google Drive en localStorage:', err);
  }
}

/**
 * Verifica si Google Drive está configurado.
 */
export function isGoogleDriveConfigured(): boolean {
  return getGoogleDriveWebhookUrl().length > 0;
}

/**
 * Prueba la conexión con el Webhook de Google Apps Script.
 */
export async function probarConexionGoogleDrive(urlOverride?: string): Promise<{ success: boolean; message: string }> {
  const url = (urlOverride || getGoogleDriveWebhookUrl()).trim();
  if (!url) {
    return { success: false, message: 'No hay ninguna URL de Google Drive configurada.' };
  }

  try {
    // 1. Enviar solicitud GET con redirect: 'follow'
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.status === 'online' || data.success)) {
        return { success: true, message: '¡Conexión exitosa con Google Drive! El servicio está listo y respondiendo correctamente.' };
      }
      return { success: true, message: '¡Conexión exitosa con Google Drive!' };
    }

    // 2. Si GET dio error, probar con un POST ligero para ver si el canal de subida responde
    try {
      const postRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ping: true }),
        mode: 'cors',
        redirect: 'follow',
      });
      if (postRes.ok) {
        return { success: true, message: '¡Conexión exitosa con Google Drive (canal de carga verificado)!' };
      }
    } catch {}

    if (res.status === 404) {
      return {
        success: false,
        message: 'Código HTTP 404: La URL de Google Apps Script no encontró la versión publicada. En script.google.com ve a: Implementar ➔ Gestionar implementaciones ➔ Editar (icono lápiz) ➔ Versión: "Nueva versión" ➔ Guardar.',
      };
    }

    return { success: false, message: `El servidor respondió con código HTTP ${res.status}.` };
  } catch (err: any) {
    return {
      success: false,
      message: `Error conectando con Google Drive: ${err.message || 'Verifica la URL y que esté publicada como "Cualquiera" (Anyone)'}`,
    };
  }
}

/**
 * Convierte un File a Base64 string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convierte cualquier URL de Google Drive (view, uc, etc.) en un enlace de visualización directa
 * optimizado para etiquetas <img> sin problemas de CORS ni cookies de Google.
 */
export function normalizarUrlGoogleDrive(url: string | null | undefined): string {
  if (!url) return '';
  if (typeof url !== 'string') return '';

  // Extraer ID si es un link de Google Drive
  const driveRegex = /(?:id=|file\/d\/|open\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  if (match && match[1]) {
    const fileId = match[1];
    // La URL de thumbnail de Google Drive sirve imágenes de alta calidad (w1200) de manera pública y rápida
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
  }

  return url;
}

/**
 * Obtiene el enlace de Google Drive para abrirlo en visor nativo en una nueva pestaña.
 */
export function obtenerUrlVisorGoogleDrive(url: string | null | undefined): string {
  if (!url) return '';
  const driveRegex = /(?:id=|file\/d\/|open\?id=)([a-zA-Z0-9_-]{25,})/;
  const match = url.match(driveRegex);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/view?usp=sharing`;
  }
  return url;
}

/**
 * Sube un archivo a Google Drive (en la carpeta exclusiva OpenWMS_Documentos).
 * Si no está configurado Google Drive, intenta Supabase Storage como fallback para
 * proteger la base de datos de llenarse con texto base64.
 */
export async function subirDocumentoAGoogleDrive(params: SubirArchivoParams): Promise<SubirArchivoResult> {
  let base64Data = params.base64 || null;
  let fileName = params.fileName;
  let mimeType = params.mimeType || 'image/jpeg';

  if (params.file) {
    if (!fileName) fileName = params.file.name;
    mimeType = params.file.type || params.mimeType || 'image/jpeg';
    if (!base64Data) {
      base64Data = await fileToBase64(params.file);
    }
  }

  if (!base64Data) {
    return {
      success: false,
      url: '',
      provider: 'base64_fallback',
      error: 'No se suministró archivo ni datos en base64 para subir.',
    };
  }

  const folderName = params.folder || 'Remitos_Conformados';
  const deduplicate = params.deduplicate !== false;
  const overwrite = params.overwrite === true;
  const contentHash = await computeContentHash(base64Data);

  if (!fileName) {
    const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('csv') ? 'csv' : 'jpg';
    fileName = `Doc_${contentHash}.${ext}`;
  }

  const dedupKey = `${folderName}:${contentHash}`;

  // 0. CONTROL ANTI-DUPLICADOS: Si el mismo archivo (mismo hash de contenido) ya se subió
  //    a esta carpeta, devolver instantáneamente el link existente sin volver a subirlo a Drive.
  if (deduplicate && !overwrite) {
    const cached = getCachedUpload(dedupKey);
    if (cached && cached.success && cached.url) {
      return { ...cached, deduplicated: true };
    }
    const inFlight = inFlightUploads.get(dedupKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const uploadTask = (async (): Promise<SubirArchivoResult> => {
    const webhookUrl = getGoogleDriveWebhookUrl();

    // =========================================================================
    // 1. MÉTODO PRIMARIO: SUBIDA A GOOGLE DRIVE
    // =========================================================================
    if (webhookUrl) {
      try {
        const payload = {
          base64: base64Data,
          fileName,
          fileHash: contentHash,
          overwrite,
          deduplicate,
          mimeType,
          folder: folderName,
          rootFolder: params.rootFolder || DEFAULT_ROOT_FOLDER,
        };

        // Usar text/plain para evitar solicitudes de pre-flight CORS complejas en Google Apps Script
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify(payload),
          mode: 'cors',
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(`Google Apps Script retornó error HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result && result.success && (result.url || result.thumbnailUrl || result.viewUrl)) {
          const finalUrl = result.url || result.thumbnailUrl || result.viewUrl;
          const driveRes: SubirArchivoResult = {
            success: true,
            url: finalUrl,
            viewUrl: result.viewUrl || finalUrl,
            fileId: result.fileId,
            fileName,
            provider: 'google_drive',
            deduplicated: Boolean(result.deduplicated),
          };
          setCachedUpload(dedupKey, driveRes);
          return driveRes;
        } else {
          throw new Error(result?.error || 'Respuesta inválida de Google Apps Script');
        }
      } catch (gDriveErr: any) {
        console.warn('Fallo al subir a Google Drive, intentando fallback en Supabase Storage:', gDriveErr);
      }
    }

    // =========================================================================
    // 2. MÉTODO SECUNDARIO (FALLBACK): BUCKET SUPABASE STORAGE
    //    (Evita igualmente contaminar la base de datos con base64 gigantes)
    // =========================================================================
    try {
      const bucketName = 'documentos-remitos';
      const cleanFileName = fileName!.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${folderName}/${contentHash}_${cleanFileName}`;

      // Convertir base64 a Blob para Supabase Storage
      const base64Clean = base64Data!.includes(',') ? base64Data!.split(',')[1] : base64Data!;
      const byteCharacters = atob(base64Clean);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (!error && data) {
        const { data: pubData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(storagePath);

        if (pubData?.publicUrl) {
          const storageRes: SubirArchivoResult = {
            success: true,
            url: pubData.publicUrl,
            viewUrl: pubData.publicUrl,
            fileName,
            provider: 'supabase_storage',
          };
          setCachedUpload(dedupKey, storageRes);
          return storageRes;
        }
      }
    } catch (storageErr) {
      console.warn('Supabase Storage tampoco disponible:', storageErr);
    }

    // =========================================================================
    // 3. FALLBACK DE EMERGENCIA (Local base64 con advertencia)
    // =========================================================================
    return {
      success: true,
      url: base64Data!,
      viewUrl: base64Data!,
      fileName,
      provider: 'base64_fallback',
    };
  })();

  if (deduplicate && !overwrite) {
    inFlightUploads.set(dedupKey, uploadTask);
  }
  try {
    return await uploadTask;
  } finally {
    inFlightUploads.delete(dedupKey);
  }
}

/**
 * Convierte un contenido de texto CSV en un archivo .csv y lo sube a Google Drive
 * (en la subcarpeta CSV_Exportados dentro de OpenWMS_Documentos) para que tanto
 * la API de importación como los sistemas externos de los clientes puedan acceder.
 */
export async function subirCSVAGoogleDrive(params: {
  csvContent: string;
  fileName: string;
  folder?: string;
  overwrite?: boolean;
}): Promise<SubirArchivoResult> {
  const cleanFileName = params.fileName.endsWith('.csv') ? params.fileName : `${params.fileName}.csv`;
  const blob = new Blob(['\uFEFF' + params.csvContent], { type: 'text/csv;charset=utf-8;' });
  const file = new File([blob], cleanFileName, { type: 'text/csv' });

  return subirDocumentoAGoogleDrive({
    file,
    fileName: cleanFileName,
    mimeType: 'text/csv',
    folder: params.folder || 'CSV_Exportados',
    overwrite: params.overwrite ?? true,
  });
}
