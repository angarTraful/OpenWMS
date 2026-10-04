import React, { useState, useRef, useEffect } from 'react';
import {
  ScanBarcode,
  Camera,
  ArrowRight,
  Sparkles,
  Volume2,
  Check,
  X,
} from 'lucide-react';
import { rfSoundService } from '../../lib/rfSoundService';

interface RfScannerInputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onScan: (code: string) => void;
  sampleCodes?: string[];
  disabled?: boolean;
  autoFocus?: boolean;
  accentColor?: 'purple' | 'green' | 'blue' | 'amber';
}

export const RfScannerInput: React.FC<RfScannerInputProps> = ({
  label = 'Escanear Código de Barras / QR',
  placeholder = 'Esperando lectura de pistola...',
  onScan,
  sampleCodes = [],
  disabled = false,
  autoFocus = true,
  accentColor = 'purple',
}) => {
  const [inputVal, setInputVal] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Mantener auto-focus para terminales de radiofrecuencia (pistolas láser)
  useEffect(() => {
    if (autoFocus && !disabled && !cameraActive) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled, cameraActive]);

  const handleSubmit = (codeToSubmit?: string) => {
    const code = (codeToSubmit !== undefined ? codeToSubmit : inputVal).trim();
    if (!code || disabled) return;

    rfSoundService.playBeep();
    onScan(code);
    setInputVal('');
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Soporte para escaneo con cámara web / móvil
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Si el navegador soporta la API nativa BarcodeDetector (Chrome/Android)
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'code_128', 'code_39', 'data_matrix'],
        });

        const detectLoop = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const detected = barcodes[0].rawValue;
              stopCamera();
              handleSubmit(detected);
              return;
            }
          } catch (err) {
            // Continúa detectando
          }
          if (streamRef.current) {
            requestAnimationFrame(detectLoop);
          }
        };
        requestAnimationFrame(detectLoop);
      }
    } catch (err: any) {
      console.error('Error cámara:', err);
      setCameraError('No se pudo acceder a la cámara. Verifique los permisos del navegador.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const colorThemes = {
    purple: {
      icon: 'text-violet-600 dark:text-[#dab9ff]',
      border: 'border-violet-300 dark:border-[#dab9ff]/70 focus:border-violet-600 dark:focus:border-[#dab9ff]',
      btn: 'bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283]',
      videoBorder: 'border-violet-500 dark:border-[#dab9ff]',
      chipText: 'text-violet-700 dark:text-[#dab9ff]',
      chipBg: 'bg-violet-50 hover:bg-violet-100 border-violet-200 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] dark:border-[#382a4d]',
    },
    green: {
      icon: 'text-emerald-600 dark:text-[#69f0ae]',
      border: 'border-emerald-300 dark:border-[#69f0ae]/70 focus:border-emerald-600 dark:focus:border-[#69f0ae]',
      btn: 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8ef4c1] dark:text-[#00391d]',
      videoBorder: 'border-emerald-500 dark:border-[#69f0ae]',
      chipText: 'text-emerald-700 dark:text-[#69f0ae]',
      chipBg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] dark:border-[#1b4d34]',
    },
    blue: {
      icon: 'text-sky-600 dark:text-[#75d1ff]',
      border: 'border-sky-300 dark:border-[#75d1ff]/70 focus:border-sky-600 dark:focus:border-[#75d1ff]',
      btn: 'bg-sky-600 hover:bg-sky-700 text-white dark:bg-[#75d1ff] dark:hover:bg-[#a3dfff] dark:text-[#00344d]',
      videoBorder: 'border-sky-500 dark:border-[#75d1ff]',
      chipText: 'text-sky-700 dark:text-[#75d1ff]',
      chipBg: 'bg-sky-50 hover:bg-sky-100 border-sky-200 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] dark:border-[#22485c]',
    },
    amber: {
      icon: 'text-amber-600 dark:text-[#ffba28]',
      border: 'border-amber-300 dark:border-[#ffba28]/70 focus:border-amber-600 dark:focus:border-[#ffba28]',
      btn: 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-[#ffba28] dark:hover:bg-[#ffd166] dark:text-[#422c00]',
      videoBorder: 'border-amber-500 dark:border-[#ffba28]',
      chipText: 'text-amber-800 dark:text-[#ffba28]',
      chipBg: 'bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] dark:border-[#523d14]',
    },
  };

  const theme = colorThemes[accentColor] || colorThemes.purple;
  const uniqueSampleCodes = Array.from(new Set(sampleCodes.filter(Boolean)));

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ScanBarcode className={`w-4 h-4 ${theme.icon}`} />
            <span>{label}</span>
          </span>
          <span className="text-[10px] text-sky-600 dark:text-[#75d1ff] font-mono font-normal">
            Láser Keyboard Wedge Activo
          </span>
        </label>
      )}

      {/* Input Principal de Escaneo con Pistola */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pl-3 pr-24 py-3 bg-white dark:bg-[#131313] border-2 ${theme.border} rounded text-base font-mono font-bold text-slate-900 dark:text-[#e5e2e1] shadow-inner outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-[#666666] placeholder:font-normal placeholder:text-xs`}
        />

        <div className="absolute right-1.5 flex items-center gap-1">
          {/* Botón Escanear Cámara */}
          <button
            type="button"
            onClick={cameraActive ? stopCamera : startCamera}
            disabled={disabled}
            className={`p-2 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
              cameraActive
                ? 'bg-rose-600 text-white dark:bg-[#93000a] dark:text-[#ffdad6]'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 dark:bg-[#201f1f] dark:hover:bg-[#2a2a2a] dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:border-[#333333]'
            }`}
            title="Activar cámara para escanear"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Botón Enter / Enviar */}
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={disabled || !inputVal.trim()}
            className={`p-2 rounded ${theme.btn} font-bold transition-colors disabled:opacity-30`}
            title="Confirmar código"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visor de Cámara integrado si está activa */}
      {cameraActive && (
        <div className={`relative rounded overflow-hidden border-2 ${theme.videoBorder} bg-black`}>
          <video
            ref={videoRef}
            className="w-full h-48 object-cover"
            playsInline
            muted
          />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className={`w-44 h-24 border-2 ${theme.videoBorder} rounded animate-pulse`} />
          </div>
          <button
            onClick={stopCamera}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white"
          >
            <X className="w-4 h-4" />
          </button>
          {cameraError && (
            <div className="absolute bottom-2 inset-x-2 p-1.5 bg-rose-50 dark:bg-[#2a0e12] border border-rose-200 dark:border-[#690005] text-rose-700 dark:text-[#ffb4ab] text-[10px] rounded text-center">
              {cameraError}
            </div>
          )}
        </div>
      )}

      {/* Botones de Prueba Rápida en Pantalla */}
      {uniqueSampleCodes.length > 0 && (
        <div className="pt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-slate-500 dark:text-[#978d9d] flex items-center gap-0.5">
            <Sparkles className={`w-2.5 h-2.5 ${theme.icon}`} />
            <span>Atajos:</span>
          </span>
          {uniqueSampleCodes.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => handleSubmit(code)}
              disabled={disabled}
              className={`px-2 py-0.5 rounded text-[11px] font-mono ${theme.chipBg} ${theme.chipText} border transition-colors`}
            >
              {code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
