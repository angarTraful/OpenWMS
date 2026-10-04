import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  DollarSign,
  Users,
  Clock,
  Briefcase,
  AlertCircle,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { romaneoApi, RecursoDescarga } from '@/api/romaneoApi';
import { formatNumber } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface RecursosDescargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  recepcionId: string;
  numeroRecepcion: string;
  onSuccess?: () => void;
}

export const RecursosDescargaModal: React.FC<RecursosDescargaModalProps> = ({
  isOpen,
  onClose,
  recepcionId,
  numeroRecepcion,
  onSuccess,
}) => {
  const [recursos, setRecursos] = useState<RecursoDescarga[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulario nuevo recurso
  const [tipoRecurso, setTipoRecurso] = useState('personal_tercerizado');
  const [descripcion, setDescripcion] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('horas');
  const [cantidad, setCantidad] = useState<number>(1);
  const [costoUnitario, setCostoUnitario] = useState<number>(0);
  const [incluidoEnTarifario, setIncluidoEnTarifario] = useState(false);
  const [proveedorServicio, setProveedorServicio] = useState('');

  useEffect(() => {
    if (isOpen && recepcionId) {
      cargarRecursos();
    }
  }, [isOpen, recepcionId]);

  const cargarRecursos = async () => {
    setLoading(true);
    try {
      const data = await romaneoApi.listarRecursosRecepcion(recepcionId);
      setRecursos(data || []);
    } catch (err) {
      console.error('Error al cargar recursos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAgregarRecurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recepcionId || cantidad <= 0) return;

    setSaving(true);
    try {
      const nuevo = await romaneoApi.agregarRecursoRecepcion({
        recepcion_id: recepcionId,
        tipo_recurso: tipoRecurso,
        descripcion: descripcion.trim() || undefined,
        unidad_medida: unidadMedida,
        cantidad,
        costo_unitario: costoUnitario,
        incluido_en_tarifario: incluidoEnTarifario,
        proveedor_servicio: proveedorServicio.trim() || undefined,
      });

      setRecursos((prev) => [...prev, nuevo]);

      // Reset form
      setDescripcion('');
      setCantidad(1);
      setCostoUnitario(0);
      setProveedorServicio('');

      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error al guardar recurso:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEliminarRecurso = async (id: string) => {
    try {
      await romaneoApi.eliminarRecursoRecepcion(id);
      setRecursos((prev) => prev.filter((r) => r.id !== id));
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error al eliminar recurso:', err);
    }
  };

  if (!isOpen) return null;

  const totalCosto = recursos.reduce(
    (acc, item) => acc + (item.cantidad * item.costo_unitario),
    0
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col">
          
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-lg">Recursos y Servicios de Descarga</h3>
                <p className="text-xs text-slate-400">
                  Recepción <span className="font-mono text-blue-400 font-bold">{numeroRecepcion}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Formulario de Agregar */}
          <div className="p-5 border-b border-slate-800/80 bg-slate-900/50">
            <form onSubmit={handleAgregarRecurso} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tipo de Recurso
                  </label>
                  <select
                    value={tipoRecurso}
                    onChange={(e) => setTipoRecurso(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="personal_tercerizado">Personal Tercerizado</option>
                    <option value="horas_extras">Horas Extras Operativos</option>
                    <option value="autoelevador_especial">Alquiler Autoelevador / Grua</option>
                    <option value="servicio_cuadrilla">Servicio de Cuadrilla Externa</option>
                    <option value="otro">Otro Servicio Especial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Descripción / Motivo
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Descarga manual 400 rollos"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Proveedor / Empresa
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Logística Tercerizada S.A."
                    value={proveedorServicio}
                    onChange={(e) => setProveedorServicio(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Unidad de Medida
                  </label>
                  <select
                    value={unidadMedida}
                    onChange={(e) => setUnidadMedida(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="horas">Horas</option>
                    <option value="personas">Cantidad de Personas</option>
                    <option value="servicio">Servicio Global</option>
                    <option value="bultos">Por Bulto / Rollo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={cantidad}
                    onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Costo Unitario ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={saving || cantidad <= 0}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Recurso
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tarifarioCheck"
                  checked={incluidoEnTarifario}
                  onChange={(e) => setIncluidoEnTarifario(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="tarifarioCheck" className="text-xs text-slate-300 cursor-pointer">
                  Incluido en el tarifario estándar del cliente (no generar costo extra ad-hoc)
                </label>
              </div>
            </form>
          </div>

          {/* Lista de Recursos Registrados */}
          <div className="p-5 flex-1 overflow-y-auto min-h-[200px]">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Recursos / Costos Registrados
            </h4>
            {loading ? (
              <div className="text-center py-8 text-slate-500 text-xs">Cargando recursos...</div>
            ) : recursos.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                No hay recursos adicionales o personal tercerizado registrado en esta descarga.
              </div>
            ) : (
              <table className="w-full text-xs text-left text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5 rounded-l-lg">Tipo / Descripción</th>
                    <th className="p-2.5">Proveedor</th>
                    <th className="p-2.5 text-center">Cantidad</th>
                    <th className="p-2.5 text-right">Costo Unit.</th>
                    <th className="p-2.5 text-right">Total</th>
                    <th className="p-2.5 text-center">Tarifario</th>
                    <th className="p-2.5 text-center rounded-r-lg">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recursos.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-800/40">
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-100 capitalize block">
                          {rec.tipo_recurso.replace('_', ' ')}
                        </span>
                        {rec.descripcion && (
                          <span className="text-[11px] text-slate-400">{rec.descripcion}</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-400">{rec.proveedor_servicio || '-'}</td>
                      <td className="p-2.5 text-center font-bold text-slate-200">
                        {rec.cantidad} {rec.unidad_medida}
                      </td>
                      <td className="p-2.5 text-right font-mono">${formatNumber(rec.costo_unitario)}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                        ${formatNumber(rec.cantidad * rec.costo_unitario)}
                      </td>
                      <td className="p-2.5 text-center">
                        {rec.incluido_en_tarifario ? (
                          <span className="inline-block px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px] border border-emerald-500/20">
                            En Tarifario
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px] border border-amber-500/20">
                            Ad-hoc
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => rec.id && handleEliminarRecurso(rec.id)}
                          className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Eliminar recurso"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Modal */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-between items-center">
            <div className="text-xs text-slate-400">
              Total Costos Adicionales Descarga:{' '}
              <span className="font-mono text-base font-bold text-emerald-400 ml-1">
                ${formatNumber(totalCosto)}
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Cerrar
            </button>
          </div>

        </div>
      </div>
    </ModalPortal>
  );
};
