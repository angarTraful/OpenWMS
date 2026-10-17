import React, { useState, useEffect } from 'react';
import {
  X,
  Truck,
  ArrowDownToLine,
  Warehouse,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Lock,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { recepcionesApi } from '@/api/recepcionesApi';
import { almacenApi } from '@/api/almacenApi';

interface AsignarMuelleModalProps {
  isOpen: boolean;
  onClose: () => void;
  recepcion: any;
  almacenes: any[];
  onSuccess: () => void;
}

export const AsignarMuelleModal: React.FC<AsignarMuelleModalProps> = ({
  isOpen,
  onClose,
  recepcion,
  almacenes = [],
  onSuccess,
}) => {
  const [almacenId, setAlmacenId] = useState<string>('');
  const [muelle, setMuelle] = useState<string>('Muelle 1 - Rampa Contenedores');
  const [muelleCustom, setMuelleCustom] = useState<string>('');
  const [isCustomMuelle, setIsCustomMuelle] = useState<boolean>(false);
  const [observaciones, setObservaciones] = useState<string>('');
  const [patenteCamion, setPatenteCamion] = useState<string>('');
  const [choferNombre, setChoferNombre] = useState<string>('');
  const [muellesDisponibles, setMuellesDisponibles] = useState<string[]>([]);
  const [loadingMuelles, setLoadingMuelles] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const muellesEstandar = [
    'Muelle 1 - Rampa Contenedores',
    'Muelle 2 - Descarga Lateral Sider',
    'Muelle 3 - Descarga Frontal',
    'Muelle 4 - Paquetería / Furgones',
    'Playa de Maniobras / Staging Inbound',
  ];

  useEffect(() => {
    if (isOpen && recepcion) {
      setAlmacenId(recepcion.almacen_id || (almacenes[0]?.id ?? ''));
      setPatenteCamion(recepcion.patente_camion || '');
      setChoferNombre(recepcion.chofer_nombre || '');
      setObservaciones(recepcion.observaciones || '');
      setErrorMsg(null);
      setIsCustomMuelle(false);
      setMuelleCustom('');

      // Cargar ubicaciones físicas de recepción del almacén
      const targetAlmId = recepcion.almacen_id || (almacenes[0]?.id ?? '');
      if (targetAlmId) {
        cargarMuellesAlmacen(targetAlmId);
      }
    }
  }, [isOpen, recepcion, almacenes]);

  const cargarMuellesAlmacen = async (targetAlmId: string) => {
    setLoadingMuelles(true);
    try {
      const ubics = await almacenApi.listarUbicacionesPorAlmacen(targetAlmId);
      const ubicsMuelle = (ubics || [])
        .filter((u: any) => u.zona?.tipo_zona === 'recepcion' || u.zona?.nombre?.toLowerCase().includes('muelle') || u.zona?.nombre?.toLowerCase().includes('playa'))
        .map((u: any) => u.codigo_etiqueta);

      if (ubicsMuelle.length > 0) {
        const unique = Array.from(new Set([...ubicsMuelle, ...muellesEstandar]));
        setMuellesDisponibles(unique);
        setMuelle(ubicsMuelle[0]);
      } else {
        setMuellesDisponibles(muellesEstandar);
        setMuelle(muellesEstandar[0]);
      }
    } catch (e) {
      setMuellesDisponibles(muellesEstandar);
      setMuelle(muellesEstandar[0]);
    } finally {
      setLoadingMuelles(false);
    }
  };

  const handleAlmacenChange = (newAlmacenId: string) => {
    setAlmacenId(newAlmacenId);
    cargarMuellesAlmacen(newAlmacenId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recepcion?.id) return;
    if (!almacenId) {
      setErrorMsg('Debe seleccionar el depósito de destino.');
      return;
    }

    const muelleFinal = isCustomMuelle ? muelleCustom.trim() : muelle;
    if (!muelleFinal) {
      setErrorMsg('Debe especificar el muelle o playa de descarga.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await recepcionesApi.registrarIngresoEnPlanta({
        recepcionId: recepcion.id,
        almacenId,
        muelle: muelleFinal,
        observaciones: observaciones.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al registrar IN de recepción:', err);
      setErrorMsg(err.message || 'Error al registrar el ingreso en planta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !recepcion) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="p-4 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 dark:bg-[#201330] dark:text-[#dab9ff] border border-violet-200 dark:border-[#4b4452] flex items-center justify-center">
                <ArrowDownToLine className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                  Ingreso a Planta & Asignación de Muelle
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                  Recepción: <span className="font-mono font-bold text-violet-600 dark:text-[#dab9ff]">{recepcion.numero_recepcion}</span>
                  {recepcion.cliente?.razon_social ? ` • ${recepcion.cliente.razon_social}` : ''}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={submitting}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Aviso Operativo de Paso a Control */}
            <div className="p-3 rounded-xl bg-violet-50/70 dark:bg-[#201330]/70 border border-violet-200 dark:border-[#522b7c] text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-[#dab9ff]">
                <Clock className="w-4 h-4" />
                <span>Check-In Operativo (Hacer IN)</span>
              </div>
              <p className="text-slate-600 dark:text-[#cdc3d4] text-[11px] leading-relaxed">
                Al confirmar el ingreso físico, la recepción pasará al estado <strong>A Controlar</strong>.
                En ese punto, <strong>el lote quedará bloqueado</strong> y se habilitará la confronta física tanto desde la Web como desde la Terminal RF.
              </p>
            </div>

            {/* Selector de Depósito / Almacén */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1.5 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-slate-500" />
                <span>Depósito / Almacén de Ingreso *</span>
              </label>
              <select
                value={almacenId}
                onChange={(e) => handleAlmacenChange(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none cursor-pointer"
              >
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} {a.codigo ? `(${a.codigo})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Muelle de Descarga */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                  <span>Muelle de Recepción / Descarga *</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomMuelle(!isCustomMuelle)}
                  className="text-[11px] text-violet-600 dark:text-[#dab9ff] hover:underline"
                >
                  {isCustomMuelle ? '← Elegir de lista' : '+ Escribir otro muelle'}
                </button>
              </div>

              {isCustomMuelle ? (
                <input
                  type="text"
                  value={muelleCustom}
                  onChange={(e) => setMuelleCustom(e.target.value)}
                  placeholder="Ej: Muelle 5 - Rampa Este / Bahía 2"
                  autoFocus
                  required
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-violet-400 dark:border-[#dab9ff] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              ) : (
                <select
                  value={muelle}
                  onChange={(e) => setMuelle(e.target.value)}
                  disabled={loadingMuelles}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none cursor-pointer"
                >
                  {muellesDisponibles.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Datos de Transporte (Opcional para confirmar) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#cdc3d4] block mb-1">
                  Patente Camión
                </label>
                <input
                  type="text"
                  value={patenteCamion}
                  onChange={(e) => setPatenteCamion(e.target.value.toUpperCase())}
                  placeholder="AA-123-BB"
                  className="w-full px-2.5 py-1.5 text-xs font-mono uppercase rounded-xl border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-[#cdc3d4] block mb-1">
                  Chofer / Conductor
                </label>
                <input
                  type="text"
                  value={choferNombre}
                  onChange={(e) => setChoferNombre(e.target.value)}
                  placeholder="Nombre y DNI"
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              </div>
            </div>

            {/* Observaciones de Ingreso */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-[#cdc3d4] block mb-1">
                Observaciones de Ingreso a Planta
              </label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Camión acoplado en muelle 1, precinto en regla..."
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] outline-none resize-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-[#333333]">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>{submitting ? 'Registrando IN...' : 'Hacer IN & Pasar a Control'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
