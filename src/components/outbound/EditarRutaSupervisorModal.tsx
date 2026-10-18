import React, { useState, useEffect } from 'react';
import {
  Edit3,
  Calendar,
  Clock,
  Truck,
  User,
  Users,
  AlertTriangle,
  X,
  CheckCircle2,
  ShieldCheck,
  FileText,
  MapPin,
  Save,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { despachosApi } from '@/api/despachosApi';
import { rfSoundService } from '@/lib/rfSoundService';

interface EditarRutaSupervisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruta: any;
  onSuccess: () => void;
}

export const EditarRutaSupervisorModal: React.FC<EditarRutaSupervisorModalProps> = ({
  isOpen,
  onClose,
  ruta,
  onSuccess,
}) => {
  const [fechaSalidaEstimada, setFechaSalidaEstimada] = useState('');
  const [choferNombre, setChoferNombre] = useState('');
  const [choferDocumento, setChoferDocumento] = useState('');
  const [choferTelefono, setChoferTelefono] = useState('');
  const [acompananteNombre, setAcompananteNombre] = useState('');
  const [acompananteDocumento, setAcompananteDocumento] = useState('');
  const [vehiculoPatente, setVehiculoPatente] = useState('');
  const [tipoVehiculo, setTipoVehiculo] = useState('');
  const [transporteEmpresa, setTransporteEmpresa] = useState('');
  const [notasViaje, setNotasViaje] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !ruta) return;
    setErrorMsg(null);
    setFechaSalidaEstimada(
      ruta.fecha_hora_salida_estimada ? ruta.fecha_hora_salida_estimada.slice(0, 16) : ''
    );
    setChoferNombre(ruta.chofer_nombre || '');
    setChoferDocumento(ruta.chofer_documento || '');
    setChoferTelefono(ruta.chofer_telefono || '');
    setAcompananteNombre(ruta.acompanante_nombre || '');
    setAcompananteDocumento(ruta.acompanante_documento || '');
    setVehiculoPatente(ruta.vehiculo_patente || '');
    setTipoVehiculo(ruta.tipo_vehiculo || '');
    setTransporteEmpresa(ruta.transporte_empresa || '');
    setNotasViaje(ruta.notas_viaje || '');
  }, [isOpen, ruta]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruta?.id) return;

    if (!choferNombre.trim() || !vehiculoPatente.trim()) {
      setErrorMsg('Chofer y Patente son campos obligatorios.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await despachosApi.actualizarDatosRuta({
        rutaId: ruta.id,
        fechaHoraSalidaEstimada: fechaSalidaEstimada ? new Date(fechaSalidaEstimada).toISOString() : null,
        choferNombre: choferNombre.trim(),
        choferDocumento: choferDocumento.trim() || null,
        choferTelefono: choferTelefono.trim() || null,
        acompananteNombre: acompananteNombre.trim() || null,
        acompananteDocumento: acompananteDocumento.trim() || null,
        vehiculoPatente: vehiculoPatente.trim(),
        tipoVehiculo: tipoVehiculo.trim() || null,
        transporteEmpresa: transporteEmpresa.trim() || undefined,
        notasViaje: notasViaje.trim() || null,
      });

      rfSoundService.playSuccess();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error actualizando datos de hoja de ruta:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al guardar los cambios de la ruta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForzarCierre = async () => {
    if (!ruta?.id) return;
    const motivo = window.prompt(
      'Ingrese el motivo de cierre administrativo / forzado por supervisión:'
    );
    if (!motivo || !motivo.trim()) return;

    setIsSubmitting(true);
    try {
      await despachosApi.forzarCierreRuta(ruta.id, motivo.trim(), 'Supervisor Logístico');
      rfSoundService.playSuccess();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al forzar cierre de ruta:', err);
      rfSoundService.playError();
      setErrorMsg(err.message || 'Error al forzar el cierre.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !ruta) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-fadeIn">
        <div className="relative w-full max-w-2xl bg-white dark:bg-[#181717] rounded-2xl border border-slate-200 dark:border-[#2f2e2e] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 dark:text-[#e5e2e1]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-[#2a2929] bg-gradient-to-r from-sky-50 to-indigo-50/50 dark:from-[#0f2334] dark:to-[#121927] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white dark:bg-[#75d1ff] dark:text-[#00344d] flex items-center justify-center shadow-xs">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                  Supervisión y Edición de Hoja de Ruta
                </h2>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] font-mono">
                  {ruta.codigo_ruta} • Estado: {ruta.estado.toUpperCase()}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#252424] dark:hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#2b0d12] dark:border-[#6b0914] dark:text-[#ffb4ab] font-bold flex items-start gap-2 shadow-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Fecha y Hora Estimada de Salida */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
                  <span>Día y Horario Programado de Salida:</span>
                </label>
                <input
                  type="datetime-local"
                  value={fechaSalidaEstimada}
                  onChange={(e) => setFechaSalidaEstimada(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
                  <span>Empresa de Transporte:</span>
                </label>
                <input
                  type="text"
                  value={transporteEmpresa}
                  onChange={(e) => setTransporteEmpresa(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              </div>
            </div>

            {/* Vehículo y Patente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                  Patente del Vehículo:
                </label>
                <input
                  type="text"
                  value={vehiculoPatente}
                  onChange={(e) => setVehiculoPatente(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] font-mono font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                  Tipo de Vehículo / Capacidad:
                </label>
                <input
                  type="text"
                  value={tipoVehiculo}
                  onChange={(e) => setTipoVehiculo(e.target.value)}
                  placeholder="Ej: Furgón 3500kg, Camión Chasis..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-slate-900 dark:text-[#e5e2e1] outline-none"
                />
              </div>
            </div>

            {/* Chofer y Acompañante */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#2a2a2a] space-y-3">
              <span className="font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
                <span>Dotación de Tripulación:</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600 dark:text-[#978d9d]">Chofer Asignado:</label>
                  <input
                    type="text"
                    value={choferNombre}
                    onChange={(e) => setChoferNombre(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#3a3939] bg-white dark:bg-[#1b1a1a] font-bold text-slate-900 dark:text-[#e5e2e1] outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600 dark:text-[#978d9d]">DNI Chofer:</label>
                  <input
                    type="text"
                    value={choferDocumento}
                    onChange={(e) => setChoferDocumento(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#3a3939] bg-white dark:bg-[#1b1a1a] font-mono text-slate-900 dark:text-[#e5e2e1] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600 dark:text-[#978d9d]">Teléfono Chofer:</label>
                  <input
                    type="text"
                    value={choferTelefono}
                    onChange={(e) => setChoferTelefono(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#3a3939] bg-white dark:bg-[#1b1a1a] font-mono text-slate-900 dark:text-[#e5e2e1] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-[#222]">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600 dark:text-[#978d9d]">Acompañante / Custodio / Peón:</label>
                  <input
                    type="text"
                    value={acompananteNombre}
                    onChange={(e) => setAcompananteNombre(e.target.value)}
                    placeholder="Nombre del acompañante (opcional)..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#3a3939] bg-white dark:bg-[#1b1a1a] font-medium text-slate-900 dark:text-[#e5e2e1] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-600 dark:text-[#978d9d]">DNI Acompañante:</label>
                  <input
                    type="text"
                    value={acompananteDocumento}
                    onChange={(e) => setAcompananteDocumento(e.target.value)}
                    placeholder="DNI del acompañante..."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#3a3939] bg-white dark:bg-[#1b1a1a] font-mono text-slate-900 dark:text-[#e5e2e1] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Notas del Viaje */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-[#cdc3d4]">
                Instrucciones / Notas de Supervisión:
              </label>
              <textarea
                rows={2}
                value={notasViaje}
                onChange={(e) => setNotasViaje(e.target.value)}
                placeholder="Notas de itinerario, precintos, desvíos autorizados..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-300 dark:border-[#3a3939] text-slate-900 dark:text-[#e5e2e1] outline-none resize-none"
              />
            </div>

            {/* Paradas Onboard */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#2a2a2a] text-slate-600 dark:text-[#cdc3d4]">
              <span className="font-bold block mb-1">
                Pedidos e Itinerario Onboard ({ruta.paradas?.length || 0} paradas):
              </span>
              <div className="text-[11px] space-y-1 max-h-28 overflow-y-auto">
                {(ruta.paradas || []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between font-mono">
                    <span>
                      #{p.secuencia_parada} {p.destinatario?.razon_social} ({p.pedido?.numero_pedido})
                    </span>
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      [{p.estado_entrega}]
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#2a2929] flex items-center justify-between gap-3">
              {ruta.estado !== 'itinerario_cumplido' && (
                <button
                  type="button"
                  onClick={handleForzarCierre}
                  disabled={isSubmitting}
                  className="px-3 py-2 rounded-xl text-rose-700 dark:text-[#ffb4ab] border border-rose-300 dark:border-[#690005] hover:bg-rose-50 dark:hover:bg-[#2b0d12] font-bold text-xs transition-colors"
                  title="Cierre forzado en caso de contingencia o fin de recorrido en depósito"
                >
                  Forzar Cierre de Ruta
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#3b3a3a] text-slate-700 dark:text-[#cdc3d4] font-bold hover:bg-slate-100 dark:hover:bg-[#252424] transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white dark:bg-[#75d1ff] dark:hover:bg-[#9ee2ff] dark:text-[#002a3a] font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Guardar Cambios</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
