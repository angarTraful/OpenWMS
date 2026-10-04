import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Folder,
  ShieldCheck,
  X,
  FileCode,
  Check,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import {
  getGoogleDriveWebhookUrl,
  setGoogleDriveWebhookUrl,
  probarConexionGoogleDrive,
  isGoogleDriveConfigured,
} from '@/lib/googleDriveService';

interface GoogleDriveConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const GoogleDriveConfigModal: React.FC<GoogleDriveConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setWebhookUrl(getGoogleDriveWebhookUrl());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProbar = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({ success: false, message: 'Ingresa una URL antes de probar.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await probarConexionGoogleDrive(webhookUrl);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Error de conexión.' });
    } finally {
      setTesting(false);
    }
  };

  const handleGuardar = () => {
    setGoogleDriveWebhookUrl(webhookUrl);
    setTestResult({ success: true, message: '¡Configuración guardada correctamente!' });
    if (onSaved) onSaved();
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleCopiarCodigo = () => {
    const code = `/**
 * OPENWMS 3PL - Google Drive Uploader Web App
 * Guarda fotos de remitos conformados y documentos en una carpeta exclusiva de Drive.
 */
function doPost(e) {
  try {
    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // 1. Obtener o crear carpeta raíz exclusiva
    var rootFolderName = data.rootFolder || "OpenWMS_Documentos";
    var rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), rootFolderName);
    
    // 2. Obtener o crear subcarpeta (ej. Remitos_Conformados, Recepciones)
    var targetFolder = rootFolder;
    if (data.folder) {
      targetFolder = getOrCreateFolder(rootFolder, data.folder);
    }
    
    // 3. Procesar datos del archivo
    var base64Data = data.base64;
    if (base64Data.indexOf(",") > -1) {
      base64Data = base64Data.split(",")[1];
    }
    var decoded = Utilities.base64Decode(base64Data);
    var mimeType = data.mimeType || "image/jpeg";
    var fileName = data.fileName || ("Doc_" + Utilities.formatDate(new Date(), "GMT-3", "yyyyMMdd_HHmmss") + ".jpg");
    
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var file = targetFolder.createFile(blob);
    
    // 4. Compartir para visualización con enlace
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var fileId = file.getId();
    var viewUrl = file.getUrl();
    var directUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
    var thumbnailUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1200";
    
    var response = {
      success: true,
      fileId: fileId,
      fileName: fileName,
      folder: targetFolder.getName(),
      viewUrl: viewUrl,
      directUrl: directUrl,
      thumbnailUrl: thumbnailUrl,
      url: thumbnailUrl
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "online",
      message: "OpenWMS Google Drive Uploader activo.",
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parent.createFolder(name);
}`;

    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const isConfigured = isGoogleDriveConfigured();

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/85 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-[#181717] border border-slate-200 dark:border-[#2e2d2d] rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl text-slate-800 dark:text-[#e5e2e1] space-y-4 max-h-[92vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-[#282727] pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 dark:bg-[#0f281e] dark:border-[#1d523a] dark:text-[#69f0ae] flex items-center justify-center shrink-0 shadow-md">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-[#e5e2e1]">
                    Almacenamiento en Google Drive
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      isConfigured
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#0f281e] dark:text-[#69f0ae] dark:border-[#1b5037]'
                        : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-[#291e12] dark:text-[#ffba28] dark:border-[#613f17]'
                    }`}
                  >
                    {isConfigured ? 'Activo' : 'Sin configurar'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-[#978d9d]">
                  Guarda fotos y remitos conformados en una carpeta exclusiva de Google Drive, almacenando solo el link en la base de datos.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-[#978d9d] dark:hover:text-[#e5e2e1] dark:hover:bg-[#252424] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Banner de beneficios para la Base de Datos */}
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 dark:bg-[#112019] dark:border-[#1d4833] text-xs space-y-1">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-[#69f0ae] font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
              <span>Optimización de Almacenamiento PostgreSQL</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-[#cdc3d4]">
              Al activar Google Drive, los archivos pesados no consumen el límite de megabytes de la base de datos en Supabase. En la tabla se almacena únicamente el link público (~80 bytes), dejando tu base de datos rápida y ligera.
            </p>
          </div>

          {/* Campo de URL de la Aplicación Web de Google */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center justify-between">
              <span>URL de Aplicación Web (Google Apps Script)</span>
              <a
                href="https://script.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-sky-600 dark:text-[#75d1ff] hover:underline flex items-center gap-1 font-normal"
              >
                <span>script.google.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </label>
            <input
              type="url"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3a3a] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:border-emerald-500 dark:focus:border-[#69f0ae] outline-none"
            />
            <p className="text-[10px] text-slate-500 dark:text-[#978d9d]">
              La URL se guarda automáticamente en tu navegador o puedes incluirla en <code className="text-emerald-700 dark:text-[#69f0ae]">.env</code> como <code className="text-emerald-700 dark:text-[#69f0ae]">VITE_GOOGLE_DRIVE_WEBHOOK_URL</code>.
            </p>
          </div>

          {/* Feedback de Prueba */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-[#0b1f15] dark:border-[#1d4d38] dark:text-[#69f0ae]'
                  : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-[#2b0d12] dark:border-[#6b161f] dark:text-[#ffb4ab]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#69f0ae]" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Botonera de Prueba y Guardado */}
          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={handleProbar}
              disabled={testing || !webhookUrl.trim()}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#222121] dark:hover:bg-[#2c2b2b] text-slate-700 dark:text-[#cdc3d4] text-xs font-bold border border-slate-300 dark:border-[#383737] flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-emerald-600 dark:text-[#69f0ae]' : ''}`} />
              <span>{testing ? 'Verificando...' : 'Probar Conexión'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] text-slate-700 dark:text-[#cdc3d4] text-xs font-bold border border-slate-300 dark:border-transparent transition-colors"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleGuardar}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] text-xs font-black transition-all shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Guardar Configuración</span>
              </button>
            </div>
          </div>

          {/* Guía Rápida de 3 Pasos */}
          <div className="pt-3 border-t border-slate-200 dark:border-[#282727] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                <span>¿Cómo crear la carpeta y obtener la URL en 2 minutos?</span>
              </span>

              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="text-[11px] text-sky-600 dark:text-[#75d1ff] hover:underline flex items-center gap-1 font-mono"
              >
                <FileCode className="w-3 h-3" />
                <span>{showCode ? 'Ocultar Código' : 'Ver Código Apps Script'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#111111] dark:border-[#262626]">
                <strong className="text-emerald-700 dark:text-[#69f0ae] block">1. Script nuevo</strong>
                <span className="text-slate-600 dark:text-[#978d9d]">
                  Entra a script.google.com y crea un nuevo proyecto con el código provisto abajo.
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#111111] dark:border-[#262626]">
                <strong className="text-emerald-700 dark:text-[#69f0ae] block">2. Publicar Web App</strong>
                <span className="text-slate-600 dark:text-[#978d9d]">
                  Implementar ➔ Nueva implementación ➔ Aplicación web ➔ Acceso: &quot;Cualquiera&quot;.
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 dark:bg-[#111111] dark:border-[#262626]">
                <strong className="text-emerald-700 dark:text-[#69f0ae] block">3. Pegar y listo</strong>
                <span className="text-slate-600 dark:text-[#978d9d]">
                  Pega la URL arriba. El script crea la carpeta <code>OpenWMS_Documentos</code> solo.
                </span>
              </div>
            </div>

            {/* Código Apps Script Desplegable */}
            {showCode && (
              <div className="space-y-2 pt-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono">
                    Código para copiar y pegar en script.google.com:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopiarCodigo}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] text-emerald-700 dark:text-[#69f0ae] text-xs font-bold border border-slate-300 dark:border-[#333333] transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600 dark:text-[#69f0ae]" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3 rounded-xl bg-slate-900 border border-slate-700 dark:bg-[#0a0a0a] dark:border-[#262626] text-[10px] font-mono text-slate-200 dark:text-[#cdc3d4] max-h-48 overflow-y-auto whitespace-pre leading-relaxed select-all">
{`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var rootFolderName = data.rootFolder || "OpenWMS_Documentos";
    var rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), rootFolderName);
    var targetFolder = data.folder ? getOrCreateFolder(rootFolder, data.folder) : rootFolder;
    
    var base64Data = data.base64.indexOf(",") > -1 ? data.base64.split(",")[1] : data.base64;
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), data.mimeType || "image/jpeg", data.fileName);
    var file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200",
      viewUrl: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
function getOrCreateFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}`}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
