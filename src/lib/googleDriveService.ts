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
const DEFAULT_ROOT_FOLDER = 'OpenWMS_Documentos';

export interface SubirArchivoParams {
  file?: File | null;
  base64?: string | null;
  fileName?: string;
  folder?: 'Remitos_Conformados' | 'Recepciones' | 'Despachos' | 'General';
  rootFolder?: string;
}

export interface SubirArchivoResult {
  success: boolean;
  url: string;
  viewUrl?: string;
  fileId?: string;
  fileName?: string;
  provider: 'google_drive' | 'supabase_storage' | 'base64_fallback';
  error?: string;
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
  let mimeType = 'image/jpeg';

  if (params.file) {
    if (!fileName) fileName = params.file.name;
    mimeType = params.file.type || 'image/jpeg';
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

  if (!fileName) {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    fileName = `Remito_${timestamp}.jpg`;
  }

  const webhookUrl = getGoogleDriveWebhookUrl();

  // =========================================================================
  // 1. MÉTODO PRIMARIO: SUBIDA A GOOGLE DRIVE
  // =========================================================================
  if (webhookUrl) {
    try {
      const payload = {
        base64: base64Data,
        fileName,
        mimeType,
        folder: params.folder || 'Remitos_Conformados',
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
        return {
          success: true,
          url: finalUrl,
          viewUrl: result.viewUrl || finalUrl,
          fileId: result.fileId,
          fileName,
          provider: 'google_drive',
        };
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
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${params.folder || 'remitos'}/${Date.now()}_${cleanFileName}`;

    // Convertir base64 a Blob para Supabase Storage
    const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
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
        return {
          success: true,
          url: pubData.publicUrl,
          viewUrl: pubData.publicUrl,
          fileName,
          provider: 'supabase_storage',
        };
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
    url: base64Data,
    viewUrl: base64Data,
    fileName,
    provider: 'base64_fallback',
  };
}
