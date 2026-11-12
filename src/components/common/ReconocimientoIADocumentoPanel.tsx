import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Upload,
  FileText,
  Mail,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Key,
  Layers,
  ArrowRight,
  Save,
  Plus,
  Trash2,
  Eye,
} from 'lucide-react';
import {
  TipoOperacionIA,
  ResultadoExtraccionIA,
  RenglonExtraidoIA,
  PreOrdenConciliacionRecord,
  analizarDocumentoConIA,
  preOrdenesIaApi,
  getGeminiApiKey,
  setGeminiApiKey,
  generarCSVDesdeExtraccion,
  descargarCSVLocal,
} from '@/lib/aiDocumentService';
import { obtenerUrlVisorGoogleDrive } from '@/lib/googleDriveService';

interface ReconocimientoIADocumentoPanelProps {
  tipoOperacion: TipoOperacionIA;
  clienteId: string;
  clienteCodigoOrCuit?: string;
  almacenId?: string;
  articulosCatalogo: any[];
  destinatariosCatalogo?: any[];
  isClientPortal?: boolean;
  /** Callback cuando el usuario decide volcar lo extraído/conciliado al formulario o importador CSV padre */
  onAplicarExtraccion?: (resultado: ResultadoExtraccionIA) => void;
  /** Callback cuando se aprueba directamente una pre-orden y se convierte en Pedido o Recepción oficial */
  onPreOrdenAprobada?: (res: any) => void;
}

export const ReconocimientoIADocumentoPanel: React.FC<ReconocimientoIADocumentoPanelProps> = ({
  tipoOperacion,
  clienteId,
  clienteCodigoOrCuit = '',
  almacenId,
  articulosCatalogo,
  destinatariosCatalogo = [],
  isClientPortal = false,
  onAplicarExtraccion,
  onPreOrdenAprobada,
}) => {
  const [activeTab, setActiveTab] = useState<'analizar' | 'conciliacion'>('analizar');

  // Configuración API Key Gemini
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getGeminiApiKey());
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);
  const [keySavedMsg, setKeySavedMsg] = useState<boolean>(false);

  // Inputs de archivo / texto de mail
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textoMail, setTextoMail] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resultado extraído editable antes de guardar/aplicar
  const [extraccion, setExtraccion] = useState<ResultadoExtraccionIA | null>(null);
  const [isSavingPreOrden, setIsSavingPreOrden] = useState<boolean>(false);

  // Bandeja de Pre-Órdenes en Conciliación
  const [preOrdenes, setPreOrdenes] = useState<PreOrdenConciliacionRecord[]>([]);
  const [loadingPreOrdenes, setLoadingPreOrdenes] = useState<boolean>(false);
  const [selectedPreOrden, setSelectedPreOrden] = useState<PreOrdenConciliacionRecord | null>(null);
  const [actorConciliacion, setActorConciliacion] = useState<'personal_deposito' | 'cliente_bot'>(
    isClientPortal ? 'cliente_bot' : 'personal_deposito'
  );
  const [notasConciliacion, setNotasConciliacion] = useState<string>('');
  const [isUpdatingPre, setIsUpdatingPre] = useState<boolean>(false);

  const cargarBandejaPreOrdenes = async () => {
    setLoadingPreOrdenes(true);
    try {
      const lista = await preOrdenesIaApi.listarPreOrdenes(clienteId || '000');
      const filtradas = lista.filter((p) => p.tipo_operacion === tipoOperacion);
      setPreOrdenes(filtradas);
    } catch (e: any) {
      console.warn('Error listando pre-órdenes:', e);
    } finally {
      setLoadingPreOrdenes(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'conciliacion') {
      cargarBandejaPreOrdenes();
    }
  }, [activeTab, clienteId, tipoOperacion]);

  const handleSaveApiKey = () => {
    setGeminiApiKey(apiKeyInput);
    setKeySavedMsg(true);
    setTimeout(() => {
      setKeySavedMsg(false);
      setShowKeyConfig(false);
    }, 1200);
  };

  const handleAnalizar = async () => {
    if (!selectedFile && !textoMail.trim()) {
      setErrorMsg('Adjuntá una imagen, PDF (Packing List / Orden) o pegá el texto del mail/mensaje.');
      return;
    }
    if (!clienteId) {
      setErrorMsg('Seleccioná primero el Cliente Depositante.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await analizarDocumentoConIA({
        tipoOperacion,
        clienteId,
        clienteCodigoOrCuit,
        file: selectedFile,
        textoMailOMensaje: textoMail,
        articulosCatalogo,
        destinatariosCatalogo,
        subirAGoogleDrive: true,
      });
      setExtraccion(res);
      setSuccessMsg(
        `¡Documento procesado con IA! Se detectaron ${res.renglones.length} renglones${
          res.documento_origen_url ? ' y se guardó el archivo original + CSV en Google Drive.' : '.'
        }`
      );
    } catch (err: any) {
      console.error('Error en reconocimiento IA:', err);
      setErrorMsg(err.message || 'Error al analizar el documento con IA.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Actualizar un renglón en la vista previa de extracción
  const actualizarRenglonExtraccion = (
    idx: number,
    campo: keyof RenglonExtraidoIA,
    valor: any
  ) => {
    if (!extraccion) return;
    const nuevos = extraccion.renglones.map((r, i) => {
      if (i !== idx) return r;
      const actualizado = { ...r, [campo]: valor };

      // Si cambió el lote seleccionado desde el desplegable de lotes disponibles
      if (campo === 'lote' && Array.isArray(r.lotes_disponibles)) {
        const loteMatch = r.lotes_disponibles.find(
          (l) => l.numero_lote.toLowerCase() === String(valor).toLowerCase()
        );
        if (loteMatch) {
          actualizado.lote_id = loteMatch.lote_id;
          actualizado.stock_disponible_lote = loteMatch.disponible;
        } else {
          actualizado.lote_id = null;
          actualizado.stock_disponible_lote = r.stock_disponible_total;
        }
      }

      const cant = Number(actualizado.cantidad_conciliada || 0);
      const disp = Number(
        actualizado.stock_disponible_lote ?? actualizado.stock_disponible_total ?? 0
      );
      actualizado.tiene_faltante_stock = tipoOperacion === 'outbound' && cant > disp;
      return actualizado;
    });

    const nuevoCsv = generarCSVDesdeExtraccion({
      tipoOperacion,
      clienteCodigoOrCuit,
      numeroReferencia: extraccion.numero_referencia,
      destinatarioCodigo: extraccion.destinatario_sugerido,
      prioridad: extraccion.prioridad,
      ordenCompra: extraccion.orden_compra,
      fechaCompromiso: extraccion.fecha_compromiso,
      renglones: nuevos,
    });

    setExtraccion({
      ...extraccion,
      renglones: nuevos,
      csv_contenido: nuevoCsv,
    });
  };

  // Guardar como Pre-Orden en Conciliación (para Bot + Cliente + Personal de Depósito)
  const handleGuardarPreOrdenConciliacion = async () => {
    if (!extraccion || extraccion.renglones.length === 0) return;
    setIsSavingPreOrden(true);
    setErrorMsg(null);

    try {
      const creada = await preOrdenesIaApi.crearPreOrden({
        tipo_operacion: tipoOperacion,
        origen_canal: isClientPortal ? 'portal_cliente_ia' : 'web_ia',
        cliente_id: clienteId,
        destinatario: extraccion.destinatario_sugerido,
        almacen_id: almacenId,
        numero_referencia: extraccion.numero_referencia,
        orden_compra: extraccion.orden_compra,
        prioridad: extraccion.prioridad,
        fecha_compromiso: extraccion.fecha_compromiso,
        transporte_datos: extraccion.transporte_datos,
        documento_origen_url: extraccion.documento_origen_url,
        documento_origen_nombre: extraccion.documento_origen_nombre,
        documento_origen_mime: extraccion.documento_origen_mime,
        csv_generado_url: extraccion.csv_generado_url,
        csv_contenido: extraccion.csv_contenido,
        renglones: extraccion.renglones,
        notas_conciliacion: extraccion.notas_generales,
        creado_por: isClientPortal ? 'cliente_portal' : 'personal_deposito',
      });

      setSuccessMsg(
        `Pre-Orden ${creada.codigo_pre_orden} guardada en Bandeja de Conciliación (${creada.estado_conciliacion}). Tanto el cliente (Bot/Portal) como el depósito pueden ajustar cantidades y lotes antes de aceptarla.`
      );
      setActiveTab('conciliacion');
      await cargarBandejaPreOrdenes();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar la Pre-Orden en conciliación.');
    } finally {
      setIsSavingPreOrden(false);
    }
  };

  // Guardar cambios de cantidades/lotes sobre una Pre-Orden existente en la Bandeja de Conciliación
  const handleGuardarCambiosConciliacion = async () => {
    if (!selectedPreOrden) return;
    setIsUpdatingPre(true);
    setErrorMsg(null);

    try {
      const res = await preOrdenesIaApi.modificarPreOrden({
        preOrdenId: selectedPreOrden.id,
        renglones: selectedPreOrden.renglones,
        actor: actorConciliacion,
        notas:
          notasConciliacion.trim() ||
          `Ajuste de cantidades/lotes por ${
            actorConciliacion === 'cliente_bot' ? 'Cliente (Bot/Portal)' : 'Personal de Depósito'
          }`,
        actualizarCsvEnDrive: true,
      });

      if (!res.exito) {
        setErrorMsg(res.error || 'No se pudo actualizar la pre-orden.');
      } else if (res.pre_orden) {
        setSelectedPreOrden(res.pre_orden);
        setSuccessMsg(
          `Conciliación actualizada (${res.pre_orden.codigo_pre_orden}) y CSV regenerado en Google Drive.`
        );
        await cargarBandejaPreOrdenes();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar ajustes de conciliación.');
    } finally {
      setIsUpdatingPre(false);
    }
  };

  // Aprobar definitivamente la Pre-Orden y pasarla a IN / Picking / Outbound
  const handleAprobarPreOrdenOficial = async (pre: PreOrdenConciliacionRecord) => {
    setIsUpdatingPre(true);
    setErrorMsg(null);
    try {
      const res = await preOrdenesIaApi.aprobarPreOrden(
        pre.id,
        actorConciliacion === 'cliente_bot' ? 'cliente_aprobacion' : 'personal_deposito'
      );
      if (!res.exito) {
        setErrorMsg(res.error || 'No se pudo aprobar la pre-orden.');
      } else {
        setSuccessMsg(
          `¡Orden ${pre.codigo_pre_orden} ACEPTADA! Ya ingresó al circuito oficial (${
            tipoOperacion === 'inbound'
              ? `Recepción ${res.numero_recepcion} en estado Programada`
              : `Pedido ${res.numero_pedido} en estado Ingresado para Picking`
          }).`
        );
        setSelectedPreOrden(null);
        await cargarBandejaPreOrdenes();
        if (onPreOrdenAprobada) {
          onPreOrdenAprobada(res);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al aprobar la pre-orden.');
    } finally {
      setIsUpdatingPre(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 dark:border-[#4b3266] bg-gradient-to-br from-violet-50/60 via-white to-slate-50 dark:from-[#1f162b]/80 dark:via-[#181717] dark:to-[#141314] p-4 space-y-4 shadow-sm">
      {/* Top Bar: Title + Tabs + API Key Config */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200/70 dark:border-[#362747] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
              <span>IA Multimodal (Gemini 3.8 Flash) + Drive + Conciliación</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-[#2d1a47] text-violet-700 dark:text-[#dab9ff] font-mono">
                {tipoOperacion === 'inbound' ? 'Packing List / Inbound' : 'Pedidos / Outbound'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
              Reconoce imágenes, PDFs y mails • Guarda original y CSV en Google Drive • Conciliación de lotes y stock (Cliente/Bot + Depósito)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('analizar')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'analizar'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border border-slate-200 dark:border-[#333333]'
            }`}
          >
            ✨ Escanear Doc / Mail
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('conciliacion')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${
              activeTab === 'conciliacion'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border border-slate-200 dark:border-[#333333]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Pre-Órdenes / Conciliación</span>
          </button>
          <button
            type="button"
            onClick={() => setShowKeyConfig(!showKeyConfig)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] hover:text-violet-600"
            title="Configurar Gemini API Key"
          >
            <Key className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsible Gemini API Key Config */}
      {showKeyConfig && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-[#201f1f] border border-slate-300 dark:border-[#333333] flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-[#cdc3d4]">
            Gemini API Key (`gemini-3.8-flash`):
          </span>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIzaSy..."
            className="flex-1 min-w-[220px] px-2.5 py-1 rounded border border-slate-300 dark:border-[#444] bg-white dark:bg-[#131313] text-slate-900 dark:text-white font-mono text-xs"
          />
          <button
            type="button"
            onClick={handleSaveApiKey}
            className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white font-bold"
          >
            {keySavedMsg ? '✓ Guardada' : 'Guardar Clave'}
          </button>
        </div>
      )}

      {/* Alerts */}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-[#381015]/60 border border-rose-200 dark:border-[#690005] text-xs text-rose-700 dark:text-[#ffb4ab] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-[#132a1c] border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-[#69f0ae] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'analizar' ? (
        <div className="space-y-4">
          {/* Input Grid: File Upload (Image/PDF) + Email/Message Text */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Upload Image or PDF */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-violet-300 hover:border-violet-500 dark:border-[#4b3266] dark:hover:border-[#dab9ff] rounded-xl p-4 text-center cursor-pointer transition-colors bg-white/80 dark:bg-[#181717] flex flex-col items-center justify-center min-h-[120px]"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.csv,.txt,.eml"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setSelectedFile(f);
                }}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-violet-600 dark:text-[#dab9ff] mb-1.5" />
              <p className="text-xs font-bold text-slate-800 dark:text-[#e5e2e1]">
                {selectedFile
                  ? `📎 ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                  : 'Subir Imagen (Foto/Captura) o PDF (Packing List / OC)'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-[#978d9d] mt-1">
                Se guardará el archivo original en Google Drive (`OpenWMS_Documentos`)
              </p>
            </div>

            {/* Paste Email or WhatsApp text */}
            <div className="flex flex-col">
              <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                <span>O pegá el Cuerpo del Mail / Mensaje de WhatsApp del Cliente:</span>
              </label>
              <textarea
                value={textoMail}
                onChange={(e) => setTextoMail(e.target.value)}
                rows={4}
                placeholder={
                  tipoOperacion === 'inbound'
                    ? 'Ej: Hola! Mañana ingresa el contenedor MSKU-998120 con Lote L-2026-09: 40 bultos de SKU-001 y 25 rollos de 3642 TRACKER...'
                    : 'Ej: Estimados, por favor preparar para sucursal MITRE (OC 4502): 20 un de SKU-001 (Lote L-10) y 15 un de SKU-002. Urgente.'
                }
                className="w-full flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-xs text-slate-900 dark:text-[#e5e2e1] outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAnalizar}
              disabled={isAnalyzing || (!selectedFile && !textoMail.trim())}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 transition-all"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analizando con Gemini 3.8 Flash y subiendo a Drive...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Reconocer Documento con IA + Generar CSV en Drive</span>
                </>
              )}
            </button>
          </div>

          {/* Resultado Extraído y Mesa de Conciliación Previa */}
          {extraccion && (
            <div className="space-y-3 pt-3 border-t border-violet-200 dark:border-[#362747]">
              {/* Links a Google Drive (Original + CSV) */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/90 dark:bg-[#201f1f] p-2.5 rounded-lg border border-slate-200 dark:border-[#333333]">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-slate-800 dark:text-[#e5e2e1]">
                    Ref: <span className="font-mono text-violet-700 dark:text-[#dab9ff]">{extraccion.numero_referencia}</span>
                  </span>
                  {extraccion.orden_compra && (
                    <span className="text-slate-600 dark:text-[#cdc3d4]">
                      • OC/Cntr: <strong className="font-mono">{extraccion.orden_compra}</strong>
                    </span>
                  )}
                  {extraccion.destinatario_sugerido && tipoOperacion === 'outbound' && (
                    <span className="text-slate-600 dark:text-[#cdc3d4]">
                      • Destino: <strong>{extraccion.destinatario_sugerido}</strong>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {extraccion.documento_origen_url && (
                    <a
                      href={obtenerUrlVisorGoogleDrive(extraccion.documento_origen_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] font-semibold hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Original en Drive</span>
                    </a>
                  )}
                  {extraccion.csv_generado_url && (
                    <a
                      href={obtenerUrlVisorGoogleDrive(extraccion.csv_generado_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold hover:underline"
                    >
                      <FileText className="w-3 h-3" />
                      <span>CSV en Drive (API)</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      descargarCSVLocal(
                        extraccion.csv_contenido,
                        `${extraccion.numero_referencia}_${tipoOperacion}.csv`
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-[#2a2a2a] border border-slate-300 dark:border-[#444] text-slate-700 dark:text-[#e5e2e1] text-[11px] font-semibold hover:bg-slate-50"
                  >
                    <Download className="w-3 h-3" />
                    <span>Descargar CSV</span>
                  </button>
                </div>
              </div>

              {/* Tabla editable de renglones (Cantidades, Lotes y Stock en vivo) */}
              <div className="border border-slate-200 dark:border-[#333333] rounded-lg overflow-x-auto bg-white dark:bg-[#141314]">
                <table className="w-full text-left text-xs min-w-[680px]">
                  <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333]">
                    <tr>
                      <th className="px-2.5 py-2 font-semibold">SKU / Artículo</th>
                      <th className="px-2.5 py-2 font-semibold w-44">Lote (Modificable)</th>
                      <th className="px-2.5 py-2 font-semibold text-center w-24">Cant. IA</th>
                      <th className="px-2.5 py-2 font-semibold text-center w-28">Cant. Conciliada</th>
                      {tipoOperacion === 'outbound' && (
                        <th className="px-2.5 py-2 font-semibold text-center w-28">Stock Disp.</th>
                      )}
                      <th className="px-2.5 py-2 font-semibold">Observaciones / Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#2a2a2a]">
                    {extraccion.renglones.map((r, idx) => (
                      <tr
                        key={r.renglon_id || idx}
                        className={
                          r.tiene_faltante_stock
                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                            : ''
                        }
                      >
                        <td className="px-2.5 py-2">
                          <div className="font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                            {r.sku}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-[#cdc3d4] truncate max-w-[220px]">
                            {r.articulo_nombre}
                          </div>
                        </td>
                        <td className="px-2.5 py-2">
                          {Array.isArray(r.lotes_disponibles) && r.lotes_disponibles.length > 0 ? (
                            <div className="space-y-1">
                              <select
                                value={r.lote || ''}
                                onChange={(e) =>
                                  actualizarRenglonExtraccion(idx, 'lote', e.target.value)
                                }
                                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-[#444] bg-white dark:bg-[#1c1b1b] text-xs font-mono"
                              >
                                <option value="">Auto FEFO / Todos ({r.stock_disponible_total ?? 0} disp.)</option>
                                {r.lotes_disponibles.map((l) => (
                                  <option key={l.numero_lote} value={l.numero_lote}>
                                    {l.numero_lote} ({l.disponible} un.)
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={r.lote || ''}
                              onChange={(e) =>
                                actualizarRenglonExtraccion(idx, 'lote', e.target.value)
                              }
                              placeholder="S/L o Lote..."
                              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-[#444] bg-white dark:bg-[#1c1b1b] text-xs font-mono"
                            />
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-center font-mono text-slate-500">
                          {r.cantidad_original_ia}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={r.cantidad_conciliada}
                            onChange={(e) =>
                              actualizarRenglonExtraccion(
                                idx,
                                'cantidad_conciliada',
                                Number(e.target.value) || 0
                              )
                            }
                            className="w-20 px-2 py-1 text-center font-mono font-bold rounded border border-violet-300 dark:border-[#6b21a8] bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-white"
                          />
                        </td>
                        {tipoOperacion === 'outbound' && (
                          <td className="px-2.5 py-2 text-center font-mono">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                !r.tiene_faltante_stock
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {r.stock_disponible_lote ?? r.stock_disponible_total ?? 0} un.
                            </span>
                            {r.tiene_faltante_stock &&
                              (r.stock_disponible_lote ?? r.stock_disponible_total ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    actualizarRenglonExtraccion(
                                      idx,
                                      'cantidad_conciliada',
                                      Number(
                                        r.stock_disponible_lote ?? r.stock_disponible_total ?? 0
                                      )
                                    )
                                  }
                                  className="block mx-auto mt-1 text-[10px] text-violet-600 dark:text-[#dab9ff] underline"
                                >
                                  Ajustar al stock
                                </button>
                              )}
                          </td>
                        )}
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={r.observaciones || ''}
                            onChange={(e) =>
                              actualizarRenglonExtraccion(idx, 'observaciones', e.target.value)
                            }
                            placeholder="Notas del renglón..."
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1c1b1b] text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botones de Acción sobre la Extracción */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGuardarPreOrdenConciliacion}
                  disabled={isSavingPreOrden}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400 dark:border-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 text-xs font-bold transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {isSavingPreOrden
                      ? 'Guardando Pre-Orden...'
                      : 'Guardar en Conciliación (Para ajustar Cliente/Bot o Depósito)'}
                  </span>
                </button>

                {onAplicarExtraccion && (
                  <button
                    type="button"
                    onClick={() => onAplicarExtraccion(extraccion)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
                  >
                    <span>Volcar Renglones y CSV al Formulario</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: BANDEJA DE PRE-ÓRDENES EN CONCILIACIÓN (BOT + CLIENTE + DEPÓSITO) */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600 dark:text-[#cdc3d4]">
              Las órdenes precargadas por IA o Bot pueden ser modificadas en cantidades y lotes por el cliente o por nuestro personal hasta que se acepten y pasen a <strong>IN / Picking / Outbound / Ruta</strong>.
            </p>
            <button
              type="button"
              onClick={cargarBandejaPreOrdenes}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-[#333] text-xs flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-[#222]"
            >
              <RefreshCw className={`w-3 h-3 ${loadingPreOrdenes ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>

          {preOrdenes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-300 dark:border-[#333] rounded-lg">
              No hay pre-órdenes de {tipoOperacion.toUpperCase()} en bandeja de conciliación para este cliente.
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {preOrdenes.map((pre) => {
                const isSelected = selectedPreOrden?.id === pre.id;
                return (
                  <div
                    key={pre.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1c1b1b] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-violet-700 dark:text-[#dab9ff]">
                          {pre.codigo_pre_orden}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-white">
                          Ref: {pre.numero_referencia}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            pre.estado_conciliacion === 'aprobada'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pre.estado_conciliacion === 'observada_sin_stock'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {pre.estado_conciliacion.toUpperCase().replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {pre.documento_origen_url && (
                          <a
                            href={obtenerUrlVisorGoogleDrive(pre.documento_origen_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Doc Drive</span>
                          </a>
                        )}
                        {pre.csv_generado_url && (
                          <a
                            href={obtenerUrlVisorGoogleDrive(pre.csv_generado_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            <span>CSV Drive</span>
                          </a>
                        )}
                        {pre.csv_contenido && (
                          <button
                            type="button"
                            onClick={() =>
                              descargarCSVLocal(
                                pre.csv_contenido || '',
                                `${pre.codigo_pre_orden}.csv`
                              )
                            }
                            className="px-2 py-1 rounded border border-slate-300 dark:border-[#444] text-[10px] font-semibold flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>CSV</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPreOrden(isSelected ? null : pre)}
                          className="px-2.5 py-1 rounded bg-violet-100 dark:bg-[#2a173d] text-violet-700 dark:text-[#dab9ff] text-[11px] font-bold"
                        >
                          {isSelected ? 'Cerrar Detalle' : 'Conciliar / Editar'}
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="pt-2 border-t border-slate-200 dark:border-[#333] space-y-2.5">
                        {/* Rol que edita */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">Modificando como:</span>
                            <select
                              value={actorConciliacion}
                              onChange={(e) => setActorConciliacion(e.target.value as any)}
                              className="px-2 py-1 rounded border border-slate-300 dark:border-[#444] bg-white dark:bg-[#131313] text-xs font-semibold"
                            >
                              <option value="personal_deposito">🏭 Personal Nuestro (Depósito)</option>
                              <option value="cliente_bot">📱 Cliente (Precarga / Bot / Portal)</option>
                            </select>
                          </div>
                          <input
                            type="text"
                            value={notasConciliacion}
                            onChange={(e) => setNotasConciliacion(e.target.value)}
                            placeholder="Motivo del cambio de lote o cantidad..."
                            className="flex-1 min-w-[200px] px-2.5 py-1 rounded border border-slate-300 dark:border-[#444] bg-white dark:bg-[#131313] text-xs"
                          />
                        </div>

                        {/* Renglones de la Pre-Orden */}
                        <div className="overflow-x-auto border border-slate-200 dark:border-[#333] rounded">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-[#201f1f]">
                              <tr>
                                <th className="px-2 py-1.5">SKU</th>
                                <th className="px-2 py-1.5">Lote</th>
                                <th className="px-2 py-1.5 text-center">Cant. Original</th>
                                <th className="px-2 py-1.5 text-center">Cant. Conciliada</th>
                                <th className="px-2 py-1.5 text-center">Stock Disp.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                              {(selectedPreOrden.renglones || []).map((r, rIdx) => (
                                <tr key={r.renglon_id || rIdx}>
                                  <td className="px-2 py-1.5 font-mono font-bold">
                                    {r.sku}{' '}
                                    <span className="font-sans font-normal text-slate-500">
                                      ({r.articulo_nombre})
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      disabled={selectedPreOrden.estado_conciliacion === 'aprobada'}
                                      value={r.lote || ''}
                                      onChange={(e) => {
                                        const nuevos = selectedPreOrden.renglones.map(
                                          (item, i) =>
                                            i === rIdx ? { ...item, lote: e.target.value } : item
                                        );
                                        setSelectedPreOrden({
                                          ...selectedPreOrden,
                                          renglones: nuevos,
                                        });
                                      }}
                                      placeholder="S/L o Lote..."
                                      className="w-28 px-2 py-0.5 rounded border border-slate-300 dark:border-[#444] bg-white dark:bg-[#131313] font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-center font-mono text-slate-500">
                                    {r.cantidad_original_ia}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      disabled={selectedPreOrden.estado_conciliacion === 'aprobada'}
                                      value={r.cantidad_conciliada}
                                      onChange={(e) => {
                                        const nuevos = selectedPreOrden.renglones.map(
                                          (item, i) =>
                                            i === rIdx
                                              ? {
                                                  ...item,
                                                  cantidad_conciliada:
                                                    Number(e.target.value) || 0,
                                                }
                                              : item
                                        );
                                        setSelectedPreOrden({
                                          ...selectedPreOrden,
                                          renglones: nuevos,
                                        });
                                      }}
                                      className="w-20 px-2 py-0.5 text-center font-mono font-bold rounded border border-violet-300 dark:border-[#6b21a8] bg-white dark:bg-[#131313]"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-center font-mono">
                                    {r.stock_disponible_lote ?? r.stock_disponible_total ?? 0} un.
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {selectedPreOrden.estado_conciliacion !== 'aprobada' && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={handleGuardarCambiosConciliacion}
                              disabled={isUpdatingPre}
                              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
                            >
                              💾 Guardar Modificación (Cantidades / Lotes) y Actualizar CSV
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAprobarPreOrdenOficial(selectedPreOrden)}
                              disabled={isUpdatingPre}
                              className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                Aceptar Orden y Pasar a{' '}
                                {tipoOperacion === 'inbound'
                                  ? 'IN / Recepción'
                                  : 'Picking / Outbound'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

