import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Truck,
  MapPin,
  Calendar,
  Layers,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  User,
  Phone,
  FileCheck,
} from 'lucide-react';
import { formatNumber, formatM3 } from '@/lib/utils';
import { despachosApi } from '@/api/despachosApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface AsignarRutaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  almacenes: any[];
  pedidosDisponibles: any[];
}

export const AsignarRutaModal: React.FC<AsignarRutaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  almacenes,
  pedidosDisponibles,
}) => {
  const [almacenId, setAlmacenId] = useState<string>('');
  const [numeroOrdenSalida, setNumeroOrdenSalida] = useState<string>('');
  const [fechaSalidaProgramada, setFechaSalidaProgramada] = useState<string>('');

  // Transport & Driver state
  const [codigoRuta, setCodigoRuta] = useState<string>('');
  const [transporteEmpresa, setTransporteEmpresa] = useState<string>('');
  const [vehiculoPatente, setVehiculoPatente] = useState<string>('');
  const [tipoVehiculo, setTipoVehiculo] = useState<string>('Furgón 3500kg');
  const [choferNombre, setChoferNombre] = useState<string>('');
  const [choferDocumento, setChoferDocumento] = useState<string>('');
  const [choferTelefono, setChoferTelefono] = useState<string>('');

  // Selected orders & stops sequence
  const [selectedPedidosIds, setSelectedPedidosIds] = useState<string[]>([]);
  const [paradasOrdenadas, setParadasOrdenadas] = useState<any[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setAlmacenId(almacenes.length > 0 ? almacenes[0].id : '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setNumeroOrdenSalida(`OS-${new Date().getFullYear()}-${randomSuffix}`);
      setCodigoRuta(`RUTA-${new Date().getFullYear()}-${randomSuffix}`);
      setFechaSalidaProgramada(new Date().toISOString().slice(0, 16));
      setTransporteEmpresa('');
      setVehiculoPatente('');
      setChoferNombre('');
      setChoferDocumento('');
      setChoferTelefono('');

      // Pre-select prepared orders if available
      const prepIds = pedidosDisponibles
        .filter((p) => p.estado === 'preparado' || p.estado === 'agrupado_salida')
        .map((p) => p.id);
      setSelectedPedidosIds(prepIds);
    }
  }, [isOpen, almacenes, pedidosDisponibles]);

  // Update stops order whenever selected orders change
  useEffect(() => {
    const pedidosMap = new Map(pedidosDisponibles.map((p) => [p.id, p]));
    const paradas = selectedPedidosIds
      .map((id) => pedidosMap.get(id))
      .filter(Boolean);
    setParadasOrdenadas(paradas);
  }, [selectedPedidosIds, pedidosDisponibles]);

  const togglePedidoSelection = (id: string) => {
    setSelectedPedidosIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const moveStop = (index: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= paradasOrdenadas.length) return;

    const list = [...paradasOrdenadas];
    const [moved] = list.splice(index, 1);
    list.splice(newIdx, 0, moved);
    setParadasOrdenadas(list);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!almacenId) {
      setErrorMsg('Debe seleccionar el Almacén de origen.');
      return;
    }
    if (selectedPedidosIds.length === 0) {
      setErrorMsg('Debe seleccionar al menos un pedido para consolidar en el viaje.');
      return;
    }
    if (!transporteEmpresa.trim() || !vehiculoPatente.trim() || !choferNombre.trim()) {
      setErrorMsg('Empresa de transporte, patente y chofer son obligatorios.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Crear Orden de Salida
      const orden = await despachosApi.crearOrdenSalida(
        almacenId,
        numeroOrdenSalida.trim(),
        selectedPedidosIds,
        fechaSalidaProgramada ? new Date(fechaSalidaProgramada).toISOString() : undefined
      );

      // 2. Asignar Ruta e Itinerario con paradas ordenadas
      await despachosApi.asignarRuta(
        {
          orden_salida_id: orden.id,
          codigo_ruta: codigoRuta.trim(),
          transporte_empresa: transporteEmpresa.trim(),
          vehiculo_patente: vehiculoPatente.trim().toUpperCase(),
          tipo_vehiculo: tipoVehiculo.trim() || null,
          chofer_nombre: choferNombre.trim(),
          chofer_documento: choferDocumento.trim() || null,
          chofer_telefono: choferTelefono.trim() || null,
          fecha_hora_salida_estimada: fechaSalidaProgramada ? new Date(fechaSalidaProgramada).toISOString() : null,
          estado: 'programada',
        },
        paradasOrdenadas.map((p, idx) => ({
          destinatario_id: p.destinatario_id,
          pedido_id: p.id,
          secuencia_parada: idx + 1,
        }))
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al generar ruta y orden de salida:', err);
      setErrorMsg(err.message || 'Error al guardar la orden de salida y hoja de ruta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-[#e5e2e1]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-violet-100 dark:bg-[#28153c] border border-violet-200 dark:border-[#6b21a8] text-violet-700 dark:text-[#dab9ff]">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
                Consolidar Salida y Asignar Hoja de Ruta
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-violet-100 text-violet-700 border border-violet-200 dark:bg-[#28153c] dark:text-[#dab9ff] dark:border-[#6b21a8]">
                  Transport Dispatch
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                Agrupación de pedidos preparados, asignación de vehículo/chofer y secuencia de paradas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 dark:text-[#ffb4ab] mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section: Departure Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333]">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                Almacén de Egreso *
              </label>
              <select
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
              >
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                N° Orden de Salida *
              </label>
              <input
                type="text"
                value={numeroOrdenSalida}
                onChange={(e) => setNumeroOrdenSalida(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                Fecha/Hora Salida Programada
              </label>
              <input
                type="datetime-local"
                value={fechaSalidaProgramada}
                onChange={(e) => setFechaSalidaProgramada(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          {/* Section: Transport & Driver Details */}
          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-4">
            <h3 className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-2">
              <Truck className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
              Unidad de Transporte y Conductor
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                  Empresa de Transporte / Fletero *
                </label>
                <input
                  type="text"
                  value={transporteEmpresa}
                  onChange={(e) => setTransporteEmpresa(e.target.value)}
                  placeholder="ej: Expreso Logística Sur"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                  Patente / Placa del Vehículo *
                </label>
                <input
                  type="text"
                  value={vehiculoPatente}
                  onChange={(e) => setVehiculoPatente(e.target.value)}
                  placeholder="ej: AF123XY"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] uppercase font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                  Tipo de Vehículo
                </label>
                <input
                  type="text"
                  value={tipoVehiculo}
                  onChange={(e) => setTipoVehiculo(e.target.value)}
                  placeholder="ej: Furgón térmico, Chasis 8 ton"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                  Nombre del Conductor *
                </label>
                <input
                  type="text"
                  value={choferNombre}
                  onChange={(e) => setChoferNombre(e.target.value)}
                  placeholder="ej: Mario R. Benítez"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                  DNI / Documento del Conductor
                </label>
                <input
                  type="text"
                  value={choferDocumento}
                  onChange={(e) => setChoferDocumento(e.target.value)}
                  placeholder="ej: 34.567.890"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] mb-1.5">
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  value={choferTelefono}
                  onChange={(e) => setChoferTelefono(e.target.value)}
                  placeholder="ej: +54 9 11 4455-6677"
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-sm text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>
          </div>

          {/* Section: Select Pedidos to Consolidate */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                Seleccionar Pedidos a Despachar ({selectedPedidosIds.length} seleccionados)
              </span>
            </h3>

            {pedidosDisponibles.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-center text-xs text-slate-500 dark:text-[#cdc3d4]">
                No hay pedidos en estado preparado o remitido para asociar a una orden de salida.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">Sel.</th>
                      <th className="px-3 py-2 font-semibold">N° Pedido</th>
                      <th className="px-3 py-2 font-semibold">Cliente Depositante</th>
                      <th className="px-3 py-2 font-semibold">Destinatario / Ciudad</th>
                      <th className="px-3 py-2 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-[#333333]">
                    {pedidosDisponibles.map((ped) => {
                      const isSelected = selectedPedidosIds.includes(ped.id);
                      return (
                        <tr
                          key={ped.id}
                          onClick={() => togglePedidoSelection(ped.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-violet-50 dark:bg-[#28153c]/40 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-[#201f1f]/50'
                          }`}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded border-slate-300 dark:border-[#333333] text-violet-600 focus:ring-0"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                            {ped.numero_pedido}
                          </td>
                          <td className="px-3 py-2 text-slate-800 dark:text-[#e5e2e1]">
                            {ped.cliente?.razon_social}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-[#cdc3d4]">
                            {ped.destinatario?.razon_social} ({ped.destinatario?.ciudad || 'Destino'})
                          </td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-100 text-slate-700 dark:bg-[#131313] dark:text-[#cdc3d4] border border-slate-200 dark:border-[#333333]">
                              {ped.estado}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section: Itinerary Sequence / Paradas */}
          {paradasOrdenadas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                Secuencia de Paradas del Itinerario (Orden de Entrega)
              </h3>

              <div className="space-y-2">
                {paradasOrdenadas.map((parada, idx) => (
                  <div
                    key={parada.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-[#28153c] border border-violet-200 dark:border-[#6b21a8] text-violet-700 dark:text-[#dab9ff] font-bold flex items-center justify-center font-mono text-[11px]">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-[#e5e2e1]">
                          {parada.destinatario?.razon_social}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                          {parada.destinatario?.direccion_entrega}, {parada.destinatario?.ciudad} | Pedido: <span className="font-mono text-violet-700 dark:text-[#dab9ff] font-bold">{parada.numero_pedido}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveStop(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-[#2a2a2a] text-slate-500 hover:text-slate-800 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] disabled:opacity-20 transition-colors"
                        title="Mover parada antes"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStop(idx, 'down')}
                        disabled={idx === paradasOrdenadas.length - 1}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-[#2a2a2a] text-slate-500 hover:text-slate-800 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] disabled:opacity-20 transition-colors"
                        title="Mover parada después"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedPedidosIds.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] shadow-md disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Asignando Ruta...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Generar Hoja de Ruta y Despacho
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
