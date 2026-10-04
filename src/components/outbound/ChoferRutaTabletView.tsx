import React, { useState, useEffect, useRef } from 'react';
import {
  Truck,
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  User,
  Check,
  X,
  RefreshCw,
  RotateCcw,
  PenTool,
  ExternalLink,
  Calendar,
  Package,
  ArrowLeft,
  Camera,
  Paperclip,
  Image as ImageIcon,
  Eye,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  Sparkles,
  Cloud,
} from 'lucide-react';
import { despachosApi } from '@/api/despachosApi';
import { rfSoundService } from '@/lib/rfSoundService';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { calcularEtasRuta } from '@/lib/etaService';
import {
  subirDocumentoAGoogleDrive,
  normalizarUrlGoogleDrive,
  obtenerUrlVisorGoogleDrive,
} from '@/lib/googleDriveService';

interface ChoferRutaTabletViewProps {
  initialRutaId?: string;
  onBack?: () => void;
  almacenes?: any[];
}

// Utilidad para comprimir fotos tomadas con la cámara de la tablet
function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const ChoferRutaTabletView: React.FC<ChoferRutaTabletViewProps> = ({
  initialRutaId,
  onBack,
  almacenes = [],
}) => {
  const [rutasDisponibles, setRutasDisponibles] = useState<any[]>([]);
  const [selectedRutaId, setSelectedRutaId] = useState<string | null>(initialRutaId || null);
  const [rutaData, setRutaData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modales de acción por parada
  const [paradaParaEntrega, setParadaParaEntrega] = useState<any | null>(null);
  const [paradaParaNovedad, setParadaParaNovedad] = useState<any | null>(null);
  const [paradaParaAdjuntarDoc, setParadaParaAdjuntarDoc] = useState<any | null>(null);
  const [fotoZoomUrl, setFotoZoomUrl] = useState<string | null>(null);

  // Estados del formulario de Entrega Conforme (POD)
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorDni, setReceptorDni] = useState('');
  const [obsEntrega, setObsEntrega] = useState('');
  const [fotoRemitoBase64, setFotoRemitoBase64] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  // Estados del formulario de Novedad / Desvío
  const [motivoNovedad, setMotivoNovedad] = useState('Faltante de bultos');
  const [bultosEsperados, setBultosEsperados] = useState<number>(1);
  const [bultosEntregados, setBultosEntregados] = useState<number>(0);
  const [obsNovedad, setObsNovedad] = useState('');
  const [fotoNovedadBase64, setFotoNovedadBase64] = useState<string | null>(null);

  // Estados del modal de solo adjuntar documentación
  const [fotoAdjuntoBase64, setFotoAdjuntoBase64] = useState<string | null>(null);
  const [obsAdjunto, setObsAdjunto] = useState('');

  // 1. Cargar lista de rutas activas
  const cargarRutas = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await despachosApi.listarRutasConParadas();
      setRutasDisponibles(data || []);

      if (!selectedRutaId && data && data.length > 0) {
        const activa = data.find((r: any) => r.estado === 'en_viaje') || data[0];
        setSelectedRutaId(activa.id);
      }
    } catch (err: any) {
      console.error('Error cargando rutas para tablet chofer:', err);
      setErrorMsg('No se pudieron cargar las hojas de ruta.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Cargar detalle de la ruta seleccionada
  const cargarDetalleRuta = async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await despachosApi.obtenerRutaPorId(id);
      setRutaData(data);
    } catch (err: any) {
      console.error('Error obteniendo detalle de hoja de ruta:', err);
      setErrorMsg('Error al consultar el itinerario de la ruta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarRutas();
  }, []);

  useEffect(() => {
    if (selectedRutaId) {
      cargarDetalleRuta(selectedRutaId);
    } else {
      setRutaData(null);
    }
  }, [selectedRutaId]);

  // Manejo de Firma Digital en Canvas (Táctil para Tablets Android)
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 180;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    setHasSignature(false);
  };

  useEffect(() => {
    if (paradaParaEntrega) {
      const timer = setTimeout(() => {
        initCanvas();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [paradaParaEntrega]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    isDrawing.current = true;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
  };

  // Manejo de carga de foto con la cámara de la tablet
  const handlePhotoCapture = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setTarget: (val: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1200, 0.75);
      setTarget(compressed);
      rfSoundService.playBeep();
    } catch (err) {
      console.error('Error al procesar foto:', err);
    }
  };

  // Confirmar Entrega
  const handleConfirmarEntrega = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paradaParaEntrega || !selectedRutaId) return;

    setUpdating(true);
    setErrorMsg(null);

    let firmaBase64: string | undefined = undefined;
    if (hasSignature && canvasRef.current) {
      firmaBase64 = canvasRef.current.toDataURL('image/png');
    }

    try {
      let finalFotoUrl = fotoRemitoBase64 || undefined;
      // Subir foto a Google Drive para NO almacenar base64 pesados en PostgreSQL
      if (fotoRemitoBase64 && (fotoRemitoBase64.startsWith('data:') || fotoRemitoBase64.length > 500)) {
        const remitNum = paradaParaEntrega.remito?.numero_remito_rx || 'Remito';
        const sec = paradaParaEntrega.secuencia_parada || 1;
        const uploadRes = await subirDocumentoAGoogleDrive({
          base64: fotoRemitoBase64,
          fileName: `${remitNum}_Parada-${sec}_${Date.now()}.jpg`,
          folder: 'Remitos_Conformados',
        });
        finalFotoUrl = uploadRes.url;
      }

      await despachosApi.registrarEntregaParada({
        paradaId: paradaParaEntrega.id,
        rutaId: selectedRutaId,
        pedidoId: paradaParaEntrega.pedido_id,
        estadoEntrega: 'entregado',
        receptorNombre: receptorNombre.trim() || undefined,
        receptorDocumento: receptorDni.trim() || undefined,
        firmaDigital: firmaBase64,
        fotoRemitoUrl: finalFotoUrl,
        observaciones: obsEntrega.trim() || undefined,
      });

      rfSoundService.playSuccess();
      setSuccessMsg(
        `¡Parada #${paradaParaEntrega.secuencia_parada} entregada conforme a ${
          receptorNombre || paradaParaEntrega.destinatario?.razon_social
        }! Documento guardado.`
      );
      setParadaParaEntrega(null);
      setReceptorNombre('');
      setReceptorDni('');
      setObsEntrega('');
      setFotoRemitoBase64(null);
      setHasSignature(false);

      await cargarDetalleRuta(selectedRutaId);
      await cargarRutas();
    } catch (err: any) {
      console.error('Error al registrar entrega:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al guardar la entrega.');
    } finally {
      setUpdating(false);
    }
  };

  // Confirmar Novedad / Desvío Asentado
  const handleConfirmarNovedad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paradaParaNovedad || !selectedRutaId) return;

    setUpdating(true);
    setErrorMsg(null);

    let motivoTexto = motivoNovedad;
    if (motivoNovedad === 'Faltante de bultos') {
      const faltan = Math.max(0, bultosEsperados - bultosEntregados);
      motivoTexto = `Faltante de ${faltan} bultos (entregados ${bultosEntregados} de ${bultosEsperados})`;
    }

    try {
      let finalFotoUrl = fotoNovedadBase64 || undefined;
      // Subir foto de constancia/novedad a Google Drive
      if (fotoNovedadBase64 && (fotoNovedadBase64.startsWith('data:') || fotoNovedadBase64.length > 500)) {
        const remitNum = paradaParaNovedad.remito?.numero_remito_rx || 'Novedad';
        const sec = paradaParaNovedad.secuencia_parada || 1;
        const uploadRes = await subirDocumentoAGoogleDrive({
          base64: fotoNovedadBase64,
          fileName: `Desvio_${remitNum}_Parada-${sec}_${Date.now()}.jpg`,
          folder: 'Remitos_Conformados',
        });
        finalFotoUrl = uploadRes.url;
      }

      await despachosApi.registrarEntregaParada({
        paradaId: paradaParaNovedad.id,
        rutaId: selectedRutaId,
        pedidoId: paradaParaNovedad.pedido_id,
        estadoEntrega: 'con_novedad',
        motivoNovedad: motivoTexto,
        fotoRemitoUrl: finalFotoUrl,
        observaciones: obsNovedad.trim() || undefined,
      });

      rfSoundService.playError();
      setSuccessMsg(
        `Desvío asentado en parada #${paradaParaNovedad.secuencia_parada}: ${motivoTexto}. El viaje continúa.`
      );
      setParadaParaNovedad(null);
      setMotivoNovedad('Faltante de bultos');
      setObsNovedad('');
      setFotoNovedadBase64(null);

      await cargarDetalleRuta(selectedRutaId);
      await cargarRutas();
    } catch (err: any) {
      console.error('Error al registrar novedad:', err);
      setErrorMsg(err.message || 'Error al registrar la novedad.');
    } finally {
      setUpdating(false);
    }
  };

  // Guardar Documentación Adjunta a Parada ya Entregada
  const handleGuardarDocumentoAdjunto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paradaParaAdjuntarDoc || !fotoAdjuntoBase64) return;

    setUpdating(true);
    setErrorMsg(null);
    try {
      let finalFotoUrl = fotoAdjuntoBase64;
      // Subir a Google Drive
      if (fotoAdjuntoBase64 && (fotoAdjuntoBase64.startsWith('data:') || fotoAdjuntoBase64.length > 500)) {
        const remitNum = paradaParaAdjuntarDoc.remito?.numero_remito_rx || 'Remito';
        const sec = paradaParaAdjuntarDoc.secuencia_parada || 1;
        const uploadRes = await subirDocumentoAGoogleDrive({
          base64: fotoAdjuntoBase64,
          fileName: `${remitNum}_Parada-${sec}_${Date.now()}.jpg`,
          folder: 'Remitos_Conformados',
        });
        finalFotoUrl = uploadRes.url;
      }

      await despachosApi.adjuntarDocumentoParada({
        paradaId: paradaParaAdjuntarDoc.id,
        fotoRemitoUrl: finalFotoUrl,
        observaciones: obsAdjunto.trim() || undefined,
      });

      rfSoundService.playSuccess();
      setSuccessMsg(
        `Foto de remito / POD guardada en Google Drive y vinculada a la parada #${paradaParaAdjuntarDoc.secuencia_parada}.`
      );
      setParadaParaAdjuntarDoc(null);
      setFotoAdjuntoBase64(null);
      setObsAdjunto('');

      if (selectedRutaId) await cargarDetalleRuta(selectedRutaId);
    } catch (err: any) {
      console.error('Error adjuntando documento:', err);
      setErrorMsg(err.message || 'Error al guardar la documentación.');
    } finally {
      setUpdating(false);
    }
  };

  // Cambio de estado general de la ruta
  const handleCambiarEstadoRuta = async (
    nuevoEstado: 'programada' | 'en_carga' | 'en_viaje' | 'itinerario_cumplido'
  ) => {
    if (!selectedRutaId) return;
    setUpdating(true);
    try {
      await despachosApi.actualizarEstadoRuta(selectedRutaId, nuevoEstado);
      rfSoundService.playBeep();
      setSuccessMsg(`Estado de ruta actualizado a: ${nuevoEstado.replace('_', ' ').toUpperCase()}`);
      await cargarDetalleRuta(selectedRutaId);
      await cargarRutas();
    } catch (err: any) {
      console.error('Error actualizando estado de ruta:', err);
      setErrorMsg(err.message || 'Error al actualizar estado del viaje.');
    } finally {
      setUpdating(false);
    }
  };

  // Cálculo de ETAs y tiempos de paradas faltantes
  const etaSummary = calcularEtasRuta(
    rutaData?.paradas || [],
    rutaData?.fecha_hora_salida_real,
    rutaData?.fecha_hora_salida_estimada,
    25
  );

  const totalParadas = rutaData?.paradas?.length || 0;
  const paradasEntregadas =
    rutaData?.paradas?.filter((p: any) => p.estado_entrega === 'entregado').length || 0;
  const paradasConNovedad =
    rutaData?.paradas?.filter((p: any) => p.estado_entrega === 'con_novedad').length || 0;
  const paradasPendientes = totalParadas - paradasEntregadas - paradasConNovedad;
  const porcentajeAvance = totalParadas > 0 ? Math.round((paradasEntregadas / totalParadas) * 100) : 0;

  // URL Google Maps para el viaje completo
  const googleMapsUrlCompleta = rutaData?.paradas
    ? despachosApi.generarGoogleMapsRutaCompletaUrl(
        rutaData.paradas,
        rutaData.orden_salida?.almacen?.direccion || rutaData.orden_salida?.almacen?.nombre
      )
    : null;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#0e0e0e] text-slate-800 dark:text-[#e5e2e1] flex flex-col font-sans select-none transition-colors">
      {/* ========================================================================= */}
      {/* 1. BARRA SUPERIOR DE CABECERA TABLET CHOFER                               */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-30 bg-white dark:bg-[#161515] border-b border-slate-200 dark:border-[#2a2a2a] px-4 py-3 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] text-slate-700 dark:text-[#cdc3d4] border border-slate-300 dark:border-[#333333] transition-colors"
              title="Volver al WMS"
            >
              <ArrowLeft className="w-5 h-5 text-emerald-600 dark:text-[#69f0ae]" />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 dark:bg-[#143d2c] dark:border-[#276449] dark:text-[#69f0ae] flex items-center justify-center font-black shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
                  Itinerario Tablet Chofer
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#69f0ae]/20 dark:text-[#69f0ae] dark:border-[#69f0ae]/40">
                  ANDROID POD
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#978d9d] font-mono">
                {rutaData
                  ? `${rutaData.codigo_ruta} • Patente: ${rutaData.vehiculo_patente} • ${rutaData.chofer_nombre}`
                  : 'Seleccione una hoja de ruta para iniciar'}
              </p>
            </div>
          </div>
        </div>

        {/* Acciones de Cabecera */}
        <div className="flex items-center gap-2">
          {googleMapsUrlCompleta && (
            <a
              href={googleMapsUrlCompleta}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#1a382c] dark:hover:bg-[#224b3b] dark:text-[#69f0ae] border border-emerald-600 dark:border-[#2b664d] text-xs font-bold transition-all shadow-xs active:scale-95"
            >
              <Navigation className="w-4 h-4 text-white dark:text-[#69f0ae]" />
              <span>Abrir Google Maps</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </a>
          )}

          <button
            type="button"
            onClick={() => {
              cargarRutas();
              if (selectedRutaId) cargarDetalleRuta(selectedRutaId);
            }}
            disabled={loading || updating}
            className="p-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] text-slate-700 dark:text-[#cdc3d4] border border-slate-300 dark:border-[#333333] transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600 dark:text-[#69f0ae]' : ''}`} />
          </button>
        </div>
      </header>

      {/* Banners Informativos */}
      {successMsg && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-[#092418] dark:border-[#1b5037] dark:text-[#69f0ae] text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#69f0ae]" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-[11px] underline text-emerald-700 hover:text-emerald-900 dark:text-[#69f0ae]/70 dark:hover:text-[#69f0ae]"
          >
            Entendido
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2b0d12] dark:border-[#6b0914] dark:text-[#ffb4ab] text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-[11px] underline text-rose-700 hover:text-rose-900 dark:text-[#ffb4ab]/70 dark:hover:text-[#ffb4ab]"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CUERPO PRINCIPAL                                                       */}
      {/* ========================================================================= */}
      <main className="flex-1 p-3 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
        {/* Selector Táctil Rápido de Hoja de Ruta */}
        <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#161515] border border-slate-200 dark:border-[#2b2b2b] shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs uppercase font-bold text-slate-700 dark:text-[#cdc3d4] tracking-wider flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
              <span>Hoja de Ruta Activa:</span>
            </span>

            <div className="flex items-center gap-2 flex-1 sm:max-w-md">
              <select
                value={selectedRutaId || ''}
                onChange={(e) => setSelectedRutaId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3b3b] text-sm font-bold text-slate-900 dark:text-[#e5e2e1] focus:border-emerald-500 dark:focus:border-[#69f0ae] outline-none cursor-pointer"
              >
                {rutasDisponibles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.codigo_ruta} — Patente {r.vehiculo_patente} ({r.chofer_nombre}) [
                    {r.estado.replace('_', ' ').toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tarjeta de Resumen del Viaje con ETA */}
          {rutaData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-[#262626] text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#101010] border border-slate-200 dark:border-[#262626]">
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] uppercase block font-semibold">Chofer / DNI</span>
                <span className="font-bold text-slate-900 dark:text-[#e5e2e1] block truncate">
                  {rutaData.chofer_nombre}
                </span>
                <span className="text-[10px] text-sky-700 dark:text-[#75d1ff] font-medium">
                  DNI: {rutaData.chofer_documento || 'S/D'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#101010] border border-slate-200 dark:border-[#262626]">
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] uppercase block font-semibold">Vehículo / Patente</span>
                <span className="font-bold text-slate-900 dark:text-[#e5e2e1] block">
                  {rutaData.vehiculo_patente}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] truncate block">
                  {rutaData.tipo_vehiculo || 'Camión'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#101010] border border-slate-200 dark:border-[#262626]">
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] uppercase block font-semibold">Progreso Paradas</span>
                <span className="font-bold text-sm text-emerald-600 dark:text-[#69f0ae] block">
                  {paradasEntregadas} / {totalParadas}
                </span>
                <span className="text-[10px] text-slate-600 dark:text-[#cdc3d4]">
                  {porcentajeAvance}% completado
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#101010] border border-slate-200 dark:border-[#262626] flex flex-col justify-between">
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] uppercase block font-semibold">Tiempo Restante (ETA)</span>
                <span className="font-bold text-sm text-amber-700 dark:text-[#ffba28] block">
                  ~{etaSummary.tiempoTotalRestanteTexto}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d]">
                  {paradasPendientes} {paradasPendientes === 1 ? 'parada restante' : 'paradas restantes'}
                </span>
              </div>
            </div>
          )}

          {/* Barra de Progreso Visual */}
          {rutaData && totalParadas > 0 && (
            <div className="space-y-1 pt-1">
              <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-[#201f1f] overflow-hidden border border-slate-300 dark:border-[#333333] flex">
                <div
                  className="bg-emerald-500 dark:bg-[#69f0ae] transition-all duration-500 h-full"
                  style={{ width: `${porcentajeAvance}%` }}
                />
                {paradasConNovedad > 0 && (
                  <div
                    className="bg-rose-400 dark:bg-[#ffb4ab] transition-all duration-500 h-full"
                    style={{ width: `${(paradasConNovedad / totalParadas) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500 dark:text-[#978d9d]">
                <span>Entregadas: {paradasEntregadas}</span>
                {paradasConNovedad > 0 && (
                  <span className="text-rose-600 dark:text-[#ffb4ab]">Con desvío: {paradasConNovedad}</span>
                )}
                <span>Pendientes: {paradasPendientes}</span>
              </div>
            </div>
          )}

          {/* Botones de Control de Estado del Viaje */}
          {rutaData && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-[#262626]">
              {rutaData.estado === 'programada' && (
                <button
                  type="button"
                  onClick={() => handleCambiarEstadoRuta('en_viaje')}
                  disabled={updating}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
                >
                  <Truck className="w-5 h-5" />
                  <span>Iniciar Viaje (Salir a Reparto)</span>
                </button>
              )}

              {rutaData.estado === 'en_viaje' && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      paradasPendientes > 0 &&
                      !window.confirm(
                        `Todavía quedan ${paradasPendientes} paradas pendientes. ¿Confirmas finalizar el itinerario?`
                      )
                    ) {
                      return;
                    }
                    handleCambiarEstadoRuta('itinerario_cumplido');
                  }}
                  disabled={updating}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-emerald-500 dark:bg-[#143d2c] dark:hover:bg-[#1a4f38] dark:text-[#69f0ae] dark:border-[#2b664d] font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98]"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Finalizar Hoja de Ruta (Retorno al Almacén)</span>
                </button>
              )}

              {rutaData.estado === 'itinerario_cumplido' && (
                <div className="w-full py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-[#092418] dark:border-[#1b5037] dark:text-[#69f0ae] text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>¡Itinerario cumplido y cerrado! Todos los pedidos fueron procesados.</span>
                </div>
              )}

              {googleMapsUrlCompleta && (
                <a
                  href={googleMapsUrlCompleta}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-[#1b2f25] dark:hover:bg-[#254234] dark:text-[#69f0ae] dark:border-[#2b664d] font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all sm:hidden"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Ruta en Google Maps</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* ======================================================================= */}
        {/* 3. LISTADO TÁCTIL DE PARADAS E ITINERARIO                              */}
        {/* ======================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
              <span>Itinerario de Paradas ({totalParadas}):</span>
            </h2>
            <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono">
              Secuencia optimizada con cálculo de ETA
            </span>
          </div>

          {!rutaData || !rutaData.paradas || rutaData.paradas.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600 dark:text-[#cdc3d4] bg-white dark:bg-[#161515] border border-dashed border-slate-300 dark:border-[#333333] rounded-2xl space-y-2 shadow-xs">
              <Truck className="w-8 h-8 mx-auto text-emerald-600/50 dark:text-[#69f0ae]/50" />
              <p className="font-bold text-sm text-slate-900 dark:text-[#e5e2e1]">No hay paradas en esta ruta</p>
              <p className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                Seleccione otra hoja de ruta o genere una nueva desde el módulo de Salidas.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {rutaData.paradas.map((parada: any) => {
                const isEntregado = parada.estado_entrega === 'entregado';
                const isNovedad = parada.estado_entrega === 'con_novedad';
                const isCerrada = isEntregado || isNovedad;

                const dest = parada.destinatario;
                const pedido = parada.pedido;
                const remito = parada.remito;

                const etaInfo = etaSummary.paradasMap.get(parada.id);

                const googleMapsParadaUrl = dest?.direccion_entrega
                  ? despachosApi.generarGoogleMapsParadaUrl(dest.direccion_entrega, dest.ciudad)
                  : null;

                return (
                  <div
                    key={parada.id}
                    className={`rounded-2xl border-2 transition-all p-4 space-y-3.5 shadow-sm ${
                      isEntregado
                        ? 'bg-emerald-50/70 border-emerald-300 dark:bg-[#0b1712] dark:border-[#1d4d38]/80 text-slate-900 dark:text-[#e5e2e1]'
                        : isNovedad
                        ? 'bg-rose-50/70 border-rose-300 dark:bg-[#1c0f12] dark:border-[#6b161f]/80 text-slate-900 dark:text-[#e5e2e1]'
                        : etaInfo?.esProxima
                        ? 'bg-emerald-50 dark:bg-[#161d19] border-emerald-500 dark:border-[#69f0ae] ring-2 ring-emerald-500/30 dark:ring-[#69f0ae]/40 text-slate-900 dark:text-[#e5e2e1]'
                        : 'bg-white dark:bg-[#161515] border-slate-200 dark:border-[#2b2b2b] hover:border-emerald-400 dark:hover:border-[#69f0ae]/40 text-slate-900 dark:text-[#e5e2e1]'
                    }`}
                  >
                    {/* Cabecera de la Parada */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {/* Círculo con número de parada */}
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black font-mono text-lg shrink-0 shadow-inner border-2 ${
                            isEntregado
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-[#123827] dark:text-[#69f0ae] dark:border-[#256e4c]'
                              : isNovedad
                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-[#3b1218] dark:text-[#ffb4ab] dark:border-[#6b161f]'
                              : etaInfo?.esProxima
                              ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-[#1b4332] dark:text-[#69f0ae] dark:border-[#69f0ae]'
                              : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-[#222222] dark:text-[#e5e2e1] dark:border-[#3b3b3b]'
                          }`}
                        >
                          {isEntregado ? (
                            <Check className="w-6 h-6 stroke-[3]" />
                          ) : (
                            `#${parada.secuencia_parada}`
                          )}
                        </div>

                        {/* Datos del Cliente y Destino */}
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm sm:text-base text-slate-900 dark:text-[#e5e2e1]">
                              {dest?.razon_social || 'Cliente'}
                            </span>
                            {pedido?.cliente?.razon_social && (
                              <span className="text-[11px] text-slate-500 dark:text-[#978d9d]">
                                ({pedido.cliente.razon_social})
                              </span>
                            )}
                            {etaInfo?.esProxima && !isCerrada && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d] animate-pulse">
                                PRÓXIMA PARADA
                              </span>
                            )}
                          </div>

                          {/* Dirección de Entrega Destacada */}
                          <div className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-[#69f0ae] flex items-center gap-1.5 pt-0.5">
                            <MapPin className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#69f0ae]" />
                            <span>
                              {dest?.direccion_entrega || 'Dirección sin especificar'}{' '}
                              {dest?.ciudad ? `• ${dest.ciudad}` : ''}
                            </span>
                          </div>

                          {/* Horario y contacto */}
                          <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-[#cdc3d4] flex-wrap pt-0.5 font-mono">
                            {dest?.contacto_recepcion && (
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400 dark:text-[#978d9d]" />
                                <span>{dest.contacto_recepcion}</span>
                              </span>
                            )}
                            {dest?.telefono && (
                              <a
                                href={`tel:${dest.telefono}`}
                                className="flex items-center gap-1 text-sky-600 hover:underline dark:text-[#75d1ff]"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>{dest.telefono}</span>
                              </a>
                            )}
                            {dest?.ventana_horaria_entrega && (
                              <span className="flex items-center gap-1 text-amber-700 dark:text-[#ffba28]">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{dest.ventana_horaria_entrega}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Badge de Estado y ETA */}
                      <div className="text-right shrink-0 space-y-1">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase font-mono tracking-wider ${
                            isEntregado
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#092418] dark:text-[#69f0ae] dark:border-[#1b5037]'
                              : isNovedad
                              ? 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-[#2b0d12] dark:text-[#ffb4ab] dark:border-[#6b0914]'
                              : 'bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#222222] dark:text-[#cdc3d4] dark:border-[#3b3b3b]'
                          }`}
                        >
                          {parada.estado_entrega.replace('_', ' ')}
                        </span>

                        {/* ETA Badge */}
                        <div className="text-[11px] font-mono">
                          {isCerrada ? (
                            <span className="text-slate-500 dark:text-[#978d9d]">
                              Hora: <b>{etaInfo?.etaHoraTexto}</b>
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-[#ffba28] font-bold block">
                              ⏱️ ETA {etaInfo?.etaHoraTexto} ({etaInfo?.minutosRestantesTexto})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Datos del Pedido y Remito */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#101010] border border-slate-200 dark:border-[#222222] flex items-center justify-between gap-3 flex-wrap text-xs font-mono">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="px-2 py-0.5 rounded font-black bg-white dark:bg-[#222222] text-slate-800 dark:text-[#e5e2e1] border border-slate-300 dark:border-[#333333]">
                          Pedido: {pedido?.numero_pedido || 'S/N'}
                        </span>
                        {remito?.numero_remito_rx && (
                          <span className="px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#142820] dark:text-[#69f0ae] dark:border-[#214a38]">
                            Remito: {remito.numero_remito_rx}
                          </span>
                        )}
                        <span className="text-slate-600 dark:text-[#cdc3d4]">
                          Bultos: <strong className="text-slate-900 dark:text-[#e5e2e1]">{remito?.total_bultos || 1}</strong>
                        </span>
                        {remito?.peso_total_kg && (
                          <span className="text-slate-600 dark:text-[#cdc3d4]">
                            Peso: <strong className="text-slate-900 dark:text-[#e5e2e1]">{formatNumber(remito.peso_total_kg, 2)} kg</strong>
                          </span>
                        )}
                      </div>

                      {/* Documento adjunto si existe */}
                      {parada.foto_remito_url && (
                        <button
                          type="button"
                          onClick={() => setFotoZoomUrl(parada.foto_remito_url)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 dark:bg-[#10242b] dark:border-[#1e4859] dark:text-[#75d1ff] dark:hover:bg-[#163640] text-[11px] font-bold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Remito Conformado</span>
                        </button>
                      )}
                    </div>

                    {/* Resumen de POD / Novedad Asentada (LOCKED) */}
                    {isEntregado && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-[#081f15] dark:border-[#174630] text-xs space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-emerald-800 dark:text-[#69f0ae] font-semibold flex-wrap gap-2">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
                            <span>
                              Recibió:{' '}
                              <strong className="text-slate-900 dark:text-[#e5e2e1]">
                                {parada.receptor_nombre || 'Conforme'}
                              </strong>{' '}
                              {parada.receptor_documento && `(DNI: ${parada.receptor_documento})`}
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono">
                            Datos bloqueados (solo adjuntar)
                          </span>
                        </div>
                        {parada.observaciones && (
                          <p className="text-[11px] text-slate-600 dark:text-[#978d9d] italic">
                            Nota: {parada.observaciones}
                          </p>
                        )}
                      </div>
                    )}

                    {isNovedad && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 dark:bg-[#2b0d12] dark:border-[#6b0914] text-xs space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-rose-800 dark:text-[#ffb4ab] font-bold flex-wrap gap-2">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-[#ffb4ab]" />
                            <span>Desvío asentado: {parada.motivo_novedad || parada.observaciones || 'No entregado'}</span>
                          </span>
                          <span className="text-[10px] text-rose-700/80 dark:text-[#ffb4ab]/80 font-mono">
                            Desvío cerrado
                          </span>
                        </div>
                        {parada.observaciones && (
                          <p className="text-[11px] text-rose-700/80 dark:text-[#ffb4ab]/80 italic">
                            Detalle: {parada.observaciones}
                          </p>
                        )}
                      </div>
                    )}

                    {/* ============================================================= */}
                    {/* BOTONERA TÁCTIL INDUSTRIAL DE ACCIÓN                          */}
                    {/* ============================================================= */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      {/* 1. Botón Google Maps Navegar */}
                      {googleMapsParadaUrl ? (
                        <a
                          href={googleMapsParadaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-3 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-300 dark:bg-[#142820] dark:hover:bg-[#1a382c] dark:active:bg-[#204938] dark:text-[#69f0ae] dark:border-[#2b664d] text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-all shadow-xs"
                        >
                          <Navigation className="w-4 h-4" />
                          <span>Cómo llegar (Maps)</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      ) : (
                        <div />
                      )}

                      {/* 2. Botón Marcar Entregado (o Adjuntar Documentación si ya está entregado) */}
                      {!isCerrada ? (
                        <button
                          type="button"
                          onClick={() => {
                            setParadaParaEntrega(parada);
                            setReceptorNombre(dest?.contacto_recepcion || dest?.razon_social || '');
                            setReceptorDni('');
                            setObsEntrega('');
                            setFotoRemitoBase64(null);
                          }}
                          className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.98]"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Marcar Entregado</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setParadaParaAdjuntarDoc(parada);
                            setFotoAdjuntoBase64(parada.foto_remito_url || null);
                            setObsAdjunto('');
                          }}
                          className="py-3 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#10242b] dark:hover:bg-[#163640] dark:text-[#75d1ff] dark:border-[#1e4859] font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-xs active:scale-[0.98]"
                        >
                          <Paperclip className="w-4 h-4" />
                          <span>
                            {parada.foto_remito_url ? 'Actualizar Remito' : 'Adjuntar Remito Foto'}
                          </span>
                        </button>
                      )}

                      {/* 3. Botón Reportar Novedad / Desvío (Solo si no está entregada) */}
                      {!isCerrada ? (
                        <button
                          type="button"
                          onClick={() => {
                            setParadaParaNovedad(parada);
                            setMotivoNovedad('Faltante de bultos');
                            setBultosEsperados(remito?.total_bultos || 1);
                            setBultosEntregados(0);
                            setObsNovedad('');
                            setFotoNovedadBase64(null);
                          }}
                          className="py-3 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-[#221f1f] dark:hover:bg-[#2e2b2b] dark:text-[#cdc3d4] dark:border-[#3b3b3b] font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-[#ffba28]" />
                          <span>Reportar Novedad</span>
                        </button>
                      ) : (
                        <div className="flex items-center justify-center py-2 text-[11px] text-slate-500 dark:text-[#978d9d] font-mono">
                          ✓ Parada cerrada
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. MODAL TÁCTIL: CONFIRMAR ENTREGA CON FIRMA DIGITAL Y FOTO (POD)         */}
      {/* ========================================================================= */}
      {paradaParaEntrega && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-[#161515] border-2 border-emerald-500/70 dark:border-[#2b664d] rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-slate-800 dark:text-[#e5e2e1]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#2a2a2a]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-[#143d2c] dark:text-[#69f0ae] flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900 dark:text-[#e5e2e1]">
                      Prueba de Entrega (POD) &bull; Parada #{paradaParaEntrega.secuencia_parada}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-[#978d9d]">
                      {paradaParaEntrega.destinatario?.razon_social}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setParadaParaEntrega(null)}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#222222] dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmarEntrega} className="space-y-3.5">
                {/* Campos de Receptor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block mb-1">
                      Nombre y Apellido Receptor *
                    </label>
                    <input
                      type="text"
                      required
                      value={receptorNombre}
                      onChange={(e) => setReceptorNombre(e.target.value)}
                      placeholder="Ej: Marcelo Gomez"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3b3b] text-sm text-slate-900 dark:text-[#e5e2e1] font-semibold outline-none focus:border-emerald-500 dark:focus:border-[#69f0ae]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block mb-1">
                      DNI / Documento Receptor
                    </label>
                    <input
                      type="text"
                      value={receptorDni}
                      onChange={(e) => setReceptorDni(e.target.value)}
                      placeholder="Ej: 32.456.789"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3b3b] text-sm font-mono text-slate-900 dark:text-[#e5e2e1] outline-none focus:border-emerald-500 dark:focus:border-[#69f0ae]"
                    />
                  </div>
                </div>

                {/* Pad de Firma Digital en Pantalla Táctil */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5">
                      <PenTool className="w-3.5 h-3.5 text-emerald-600 dark:text-[#69f0ae]" />
                      <span>Firma Digital en Pantalla:</span>
                    </label>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-[#ffb4ab] hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Limpiar firma</span>
                    </button>
                  </div>

                  <div className="rounded-xl overflow-hidden border-2 border-slate-300 dark:border-[#3b3b3b] bg-white relative touch-none">
                    <canvas
                      ref={canvasRef}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="w-full h-[160px] cursor-crosshair block"
                    />
                    {!hasSignature && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 dark:text-[#aaaaaa] text-xs font-mono">
                        Firme aquí con el dedo o lápiz óptico
                      </div>
                    )}
                  </div>
                </div>

                {/* Foto Opcional del Remito Firmado / Conformado con Cámara */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-sky-600 dark:text-[#75d1ff]" />
                    <span>Foto del Remito Conformado / Sello (Opcional):</span>
                  </label>

                  <div className="flex items-center gap-3">
                    <label className="flex-1 py-2.5 px-3 rounded-xl border border-dashed border-slate-300 dark:border-[#444444] bg-slate-50 hover:bg-slate-100 dark:bg-[#121212] dark:hover:bg-[#1a1a1a] text-center cursor-pointer transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-sky-700 dark:text-[#75d1ff]">
                      <Camera className="w-4 h-4" />
                      <span>{fotoRemitoBase64 ? 'Cambiar Foto' : 'Tomar Foto con Cámara'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoCapture(e, setFotoRemitoBase64)}
                        className="hidden"
                      />
                    </label>

                    {fotoRemitoBase64 && (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-emerald-500 dark:border-[#69f0ae] shrink-0">
                        <img
                          src={fotoRemitoBase64}
                          alt="Remito"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setFotoRemitoBase64(null)}
                          className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block mb-1">
                    Observaciones / Notas de Entrega (Opcional)
                  </label>
                  <input
                    type="text"
                    value={obsEntrega}
                    onChange={(e) => setObsEntrega(e.target.value)}
                    placeholder="Ej: Recibido en portería, sin observaciones"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3b3b] text-xs text-slate-900 dark:text-[#e5e2e1] outline-none focus:border-emerald-500 dark:focus:border-[#69f0ae]"
                  />
                </div>

                {/* Botón de Confirmación Gigante Táctil */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={updating}
                    className="w-full py-4 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-40"
                  >
                    {updating ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Guardando entrega...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Confirmar Entrega Conforme</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL TÁCTIL: REGISTRAR NOVEDAD / DESVÍO ASENTADO                      */}
      {/* ========================================================================= */}
      {paradaParaNovedad && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-[#161515] border-2 border-rose-300 dark:border-[#6b161f] rounded-2xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto text-slate-800 dark:text-[#e5e2e1]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#2a2a2a]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 dark:bg-[#3b1218] dark:text-[#ffb4ab] flex items-center justify-center font-bold">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900 dark:text-[#e5e2e1]">
                      Asentar Desvío &bull; Parada #{paradaParaNovedad.secuencia_parada}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-[#978d9d]">
                      {paradaParaNovedad.destinatario?.razon_social}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setParadaParaNovedad(null)}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#222222] dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmarNovedad} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block mb-2">
                    Tipo de Desvío / Novedad:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      'Faltante de bultos',
                      'Mercadería dañada / averiada',
                      'Cliente ausente / cerrado',
                      'Dirección incorrecta / inaccesible',
                      'Falta de pago / rechazo comercial',
                      'Otro desvío...',
                    ].map((motivo) => (
                      <button
                        key={motivo}
                        type="button"
                        onClick={() => setMotivoNovedad(motivo)}
                        className={`p-2.5 rounded-xl text-xs font-bold text-left border transition-all ${
                          motivoNovedad === motivo
                            ? 'bg-rose-100 text-rose-900 border-rose-400 shadow-sm dark:bg-[#ffb4ab] dark:text-[#56000c] dark:border-[#ffb4ab]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-rose-400/60 dark:bg-[#0f0e0e] dark:text-[#cdc3d4] dark:border-[#3b3b3b] dark:hover:border-[#ffb4ab]/50'
                        }`}
                      >
                        {motivo}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Si la novedad es faltante de bultos, pedir desglose numérico */}
                {motivoNovedad === 'Faltante de bultos' && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-[#220e11] border border-rose-200 dark:border-[#5d1720] space-y-2 text-xs">
                    <span className="font-bold text-rose-800 dark:text-[#ffb4ab] block">
                      Desglose de Bultos:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-600 dark:text-[#cdc3d4] uppercase block">
                          Bultos Remito:
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={bultosEsperados}
                          onChange={(e) => setBultosEsperados(Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-white dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#444444] rounded text-sm font-mono font-bold text-slate-900 dark:text-[#e5e2e1]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-600 dark:text-[#cdc3d4] uppercase block">
                          Bultos Entregados:
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={bultosEsperados}
                          value={bultosEntregados}
                          onChange={(e) => setBultosEntregados(Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-white dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#444444] rounded text-sm font-mono font-bold text-emerald-700 dark:text-[#69f0ae]"
                        />
                      </div>
                    </div>
                    <div className="text-[11px] text-rose-700 dark:text-[#ffb4ab] font-bold">
                      Faltante resultante: {Math.max(0, bultosEsperados - bultosEntregados)} bultos.
                    </div>
                  </div>
                )}

                {/* Foto Opcional de la Novedad / Daño */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-600 dark:text-[#ffba28]" />
                    <span>Foto de la Novedad / Remito Aclarado (Opcional):</span>
                  </label>

                  <div className="flex items-center gap-3">
                    <label className="flex-1 py-2.5 px-3 rounded-xl border border-dashed border-rose-300 dark:border-[#5d1720] bg-rose-50/60 hover:bg-rose-100/60 dark:bg-[#120a0b] dark:hover:bg-[#1a0f11] text-center cursor-pointer transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-rose-800 dark:text-[#ffb4ab]">
                      <Camera className="w-4 h-4" />
                      <span>{fotoNovedadBase64 ? 'Cambiar Foto' : 'Tomar Foto de Constancia'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoCapture(e, setFotoNovedadBase64)}
                        className="hidden"
                      />
                    </label>

                    {fotoNovedadBase64 && (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-rose-400 dark:border-[#ffb4ab] shrink-0">
                        <img
                          src={fotoNovedadBase64}
                          alt="Novedad"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setFotoNovedadBase64(null)}
                          className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block mb-1">
                    Detalle Adicional del Desvío
                  </label>
                  <textarea
                    rows={2}
                    value={obsNovedad}
                    onChange={(e) => setObsNovedad(e.target.value)}
                    placeholder="Describa el motivo o aclaración que se dejó en el remito..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3b3b] text-xs text-slate-900 dark:text-[#e5e2e1] outline-none focus:border-rose-400 dark:focus:border-[#ffb4ab]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setParadaParaNovedad(null)}
                    disabled={updating}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#333333] bg-slate-100 hover:bg-slate-200 dark:bg-[#222222] text-xs font-bold text-slate-700 dark:text-[#cdc3d4] transition-colors"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={updating}
                    className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white dark:bg-[#ba1a1a] dark:hover:bg-[#de3730] font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
                  >
                    {updating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Asentando desvío...</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        <span>Asentar Desvío y Cerrar Parada</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL: ADJUNTAR DOCUMENTACIÓN A PARADA YA ENTREGADA (LOCKED)           */}
      {/* ========================================================================= */}
      {paradaParaAdjuntarDoc && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-[#161515] border-2 border-sky-300 dark:border-[#1e4859] rounded-2xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 text-slate-800 dark:text-[#e5e2e1]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#2a2a2a]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 dark:bg-[#10242b] dark:text-[#75d1ff] flex items-center justify-center font-bold">
                    <Paperclip className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-slate-900 dark:text-[#e5e2e1]">
                      Adjuntar Documento &bull; Parada #{paradaParaAdjuntarDoc.secuencia_parada}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-[#978d9d]">
                      {paradaParaAdjuntarDoc.destinatario?.razon_social} (Ya Entregada)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setParadaParaAdjuntarDoc(null)}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:bg-[#222222] dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 dark:bg-[#091e15] dark:border-[#16432f] dark:text-[#69f0ae]">
                ℹ️ Los datos de entrega ya fueron asentados. Aquí puedes subir o actualizar la
                foto del remito conformado con sello y firma física.
              </div>

              <form onSubmit={handleGuardarDocumentoAdjunto} className="space-y-3.5">
                {/* Selector de Foto / Cámara */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block">
                    Foto del Remito / Documento:
                  </label>

                  <label className="w-full py-6 px-4 rounded-xl border-2 border-dashed border-sky-300 hover:border-sky-400 bg-sky-50/50 hover:bg-sky-50 dark:border-[#2a4d5d] dark:bg-[#0c181e] dark:hover:bg-[#12232c] text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 text-xs font-bold text-sky-800 dark:text-[#75d1ff]">
                    <Camera className="w-8 h-8 text-sky-600 dark:text-[#75d1ff]" />
                    <span>
                      {fotoAdjuntoBase64
                        ? 'Cambiar Foto del Remito'
                        : 'Tomar Foto o Seleccionar Archivo'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal">
                      Cámara trasera o galería
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handlePhotoCapture(e, setFotoAdjuntoBase64)}
                      className="hidden"
                    />
                  </label>

                  {/* Vista Previa */}
                  {fotoAdjuntoBase64 && (
                    <div className="relative rounded-xl overflow-hidden border border-sky-400 dark:border-[#75d1ff] bg-slate-100 dark:bg-black max-h-48">
                      <img
                        src={fotoAdjuntoBase64}
                        alt="Documento adjunto"
                        className="w-full h-48 object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setFotoAdjuntoBase64(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white text-xs hover:bg-black"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase block mb-1">
                    Nota o Aclaración del Documento
                  </label>
                  <input
                    type="text"
                    value={obsAdjunto}
                    onChange={(e) => setObsAdjunto(e.target.value)}
                    placeholder="Ej: Remito sellado por Tesorería..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0f0e0e] border border-slate-300 dark:border-[#3b3b3b] text-xs text-slate-900 dark:text-[#e5e2e1] outline-none focus:border-sky-500 dark:focus:border-[#75d1ff]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setParadaParaAdjuntarDoc(null)}
                    disabled={updating}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#333333] bg-slate-100 hover:bg-slate-200 dark:bg-[#222222] text-xs font-bold text-slate-700 dark:text-[#cdc3d4] transition-colors"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={updating || !fotoAdjuntoBase64}
                    className="flex-1 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white dark:bg-[#75d1ff] dark:hover:bg-[#9fe0ff] dark:text-[#00344d] font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
                  >
                    {updating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Guardar Documento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL ZOOM / VISTA PREVIA DE REMITO CONFORMADO                         */}
      {/* ========================================================================= */}
      {fotoZoomUrl && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/80 dark:bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center">
              <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-700 dark:border-[#2b2b2b]">
                <span className="text-xs font-bold text-emerald-400 dark:text-[#69f0ae] flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-400 dark:text-[#69f0ae]" />
                  <span>Constancia de Remito Conformado / POD</span>
                </span>
                <div className="flex items-center gap-2">
                  {fotoZoomUrl && (fotoZoomUrl.includes('drive.google.com') || fotoZoomUrl.includes('google')) && (
                    <a
                      href={obtenerUrlVisorGoogleDrive(fotoZoomUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-600/50 text-xs font-bold transition-colors"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Abrir en Drive</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setFotoZoomUrl(null)}
                    className="p-1.5 text-white hover:text-emerald-400 dark:hover:text-[#69f0ae] text-sm font-bold flex items-center gap-1 transition-colors"
                  >
                    <X className="w-6 h-6" />
                    <span>Cerrar</span>
                  </button>
                </div>
              </div>
              <img
                src={normalizarUrlGoogleDrive(fotoZoomUrl)}
                alt="Remito Conformado"
                className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl border border-slate-700 dark:border-[#333333] bg-black/40"
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
