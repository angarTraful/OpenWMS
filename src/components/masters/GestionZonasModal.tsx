import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Plus,
  Edit3,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Check,
  RefreshCw,
  Search,
  Box,
} from 'lucide-react';
import { almacenApi, type Almacen, type Zona } from '../../api/almacenApi';
import { ZonaModal } from './ZonaModal';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface GestionZonasModalProps {
  isOpen: boolean;
  onClose: () => void;
  almacenes: Almacen[];
  selectedAlmacenId: string;
  onZonasUpdated: () => void;
}

const TIPO_BADGES: Record<string, { label: string; color: string }> = {
  almacenamiento: { label: 'Almacenamiento / Racks', color: 'bg-violet-900/30 text-[#dab9ff] border-violet-800/50' },
  picking: { label: 'Picking / Fraccionado', color: 'bg-sky-900/30 text-sky-300 border-sky-800/50' },
  recepcion: { label: 'Recepción / Inbound', color: 'bg-emerald-900/30 text-emerald-300 border-emerald-800/50' },
  despacho: { label: 'Despacho / Outbound', color: 'bg-amber-900/30 text-amber-300 border-amber-800/50' },
  cuarentena: { label: 'Cuarentena / Calidad', color: 'bg-rose-900/30 text-rose-300 border-rose-800/50' },
  mermas: { label: 'Mermas / Averías', color: 'bg-red-900/30 text-red-300 border-red-800/50' },
};

export const GestionZonasModal: React.FC<GestionZonasModalProps> = ({
  isOpen,
  onClose,
  almacenes,
  selectedAlmacenId: initialAlmacenId,
  onZonasUpdated,
}) => {
  const [almacenId, setAlmacenId] = useState(initialAlmacenId);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Zona Modal state
  const [zonaModalOpen, setZonaModalOpen] = useState(false);
  const [zonaAEditar, setZonaAEditar] = useState<Zona | null>(null);

  // Confirm delete state
  const [zonaAEliminar, setZonaAEliminar] = useState<Zona | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAlmacenId(initialAlmacenId || (almacenes[0]?.id ?? ''));
      setFeedback(null);
      setSearchTerm('');
    }
  }, [isOpen, initialAlmacenId, almacenes]);

  const cargarZonas = async (almId?: string) => {
    const id = almId || almacenId;
    if (!id) return;
    setLoading(true);
    try {
      const data = await almacenApi.listarZonas(id);
      setZonas(data || []);
    } catch (err: any) {
      console.error('Error cargando zonas:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cargar zonas.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && almacenId) {
      cargarZonas(almacenId);
    }
  }, [isOpen, almacenId]);

  if (!isOpen) return null;

  const currentWarehouse = almacenes.find((a) => a.id === almacenId);

  const zonasFiltradas = zonas.filter((z) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (z.codigo || '').toLowerCase().includes(term) ||
      (z.nombre || '').toLowerCase().includes(term) ||
      (z.tipo_zona || '').toLowerCase().includes(term)
    );
  });

  const handleToggleActivo = async (z: Zona) => {
    try {
      await almacenApi.alternarEstadoZona(z.id, z.activo);
      setZonas((prev) =>
        prev.map((item) => (item.id === z.id ? { ...item, activo: !item.activo } : item))
      );
      onZonasUpdated();
      setFeedback({
        type: 'ok',
        msg: `Zona "${z.codigo}" marcada como ${!z.activo ? 'activa' : 'inactiva'}.`,
      });
    } catch (err: any) {
      console.error('Error alternando estado de zona:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al cambiar estado.' });
    }
  };

  const confirmarEliminar = async () => {
    if (!zonaAEliminar) return;
    setDeleting(true);
    setFeedback(null);
    try {
      await almacenApi.eliminarZona(zonaAEliminar.id);
      setZonas((prev) => prev.filter((item) => item.id !== zonaAEliminar.id));
      onZonasUpdated();
      setFeedback({ type: 'ok', msg: `Zona "${zonaAEliminar.codigo}" eliminada exitosamente.` });
      setZonaAEliminar(null);
    } catch (err: any) {
      console.error('Error eliminando zona:', err);
      setFeedback({ type: 'err', msg: err.message || 'Error al eliminar zona.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-sm animate-fadeIn">
        <div className="relative w-full max-w-3xl rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                  Gestión de Zonas Operativas de Almacén
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                  Administración de sectores lógicos y playas de almacenamiento
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 text-xs flex items-center justify-between border-b ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{feedback.msg}</span>
              </div>
              <button
                onClick={() => setFeedback(null)}
                className="text-[10px] uppercase font-mono tracking-wider hover:underline"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Control Bar: Select warehouse + Search + New Zone */}
          <div className="p-4 bg-slate-50/50 dark:bg-[#131313] border-b border-slate-200 dark:border-[#333333] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="w-56">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#cdc3d4] uppercase mb-1">
                  Depósito Seleccionado:
                </label>
                <select
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#201f1f] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none cursor-pointer"
                >
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} ({a.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 max-w-xs self-end">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#978d9d] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar por código o nombre..."
                  className="w-full pl-8 pr-3 py-1.5 rounded bg-white dark:bg-[#201f1f] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                />
              </div>

              <button
                onClick={() => cargarZonas()}
                title="Recargar zonas"
                className="self-end p-2 rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#201f1f] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-violet-600 dark:text-[#dab9ff]' : ''}`} />
              </button>
            </div>

            <button
              onClick={() => {
                setZonaAEditar(null);
                setZonaModalOpen(true);
              }}
              className="self-end flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-sm font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Zona</span>
            </button>
          </div>

          {/* Zones Table / Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-[#cdc3d4]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-violet-600 dark:text-[#dab9ff] mb-2" />
                Cargando zonas de {currentWarehouse?.nombre}...
              </div>
            ) : zonasFiltradas.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] flex items-center justify-center mx-auto text-violet-700 dark:text-[#dab9ff]">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-[#e5e2e1]">
                    {zonas.length === 0
                      ? 'No hay zonas registradas para este depósito'
                      : 'No se encontraron zonas coincidentes'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4] max-w-sm mx-auto mt-1">
                    {zonas.length === 0
                      ? `El depósito "${currentWarehouse?.nombre || 'seleccionado'}" necesita al menos una zona para poder ubicar mercadería.`
                      : 'Intenta con otro término de búsqueda o limpia el filtro.'}
                  </p>
                </div>
                {zonas.length === 0 && (
                  <button
                    onClick={() => {
                      setZonaAEditar(null);
                      setZonaModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:text-[#460283] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear Primera Zona</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-[#333333] rounded-md overflow-hidden bg-white dark:bg-[#131313]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] text-[10px] uppercase font-bold tracking-wider">
                      <th className="px-3 py-2.5">Código</th>
                      <th className="px-3 py-2.5">Nombre de Zona</th>
                      <th className="px-3 py-2.5">Tipo Operativo</th>
                      <th className="px-3 py-2.5 text-center">Autoestiba Piso</th>
                      <th className="px-3 py-2.5 text-center">Estado</th>
                      <th className="px-3 py-2.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#252525]">
                    {zonasFiltradas.map((z) => {
                      const badge = TIPO_BADGES[z.tipo_zona] || {
                        label: z.tipo_zona || 'General',
                        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#201f1f] dark:text-[#cdc3d4] dark:border-[#333333]',
                      };

                      return (
                        <tr
                          key={z.id}
                          className="hover:bg-slate-50 dark:hover:bg-[#1a1919] transition-colors"
                        >
                          <td className="px-3 py-2 font-mono font-bold text-violet-700 dark:text-[#dab9ff]">
                            {z.codigo}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900 dark:text-[#e5e2e1]">
                            {z.nombre}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {z.es_autoestiba_piso ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/40 text-emerald-400 border border-emerald-800/60">
                                Sí (Piso)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 dark:text-[#736c7a]">
                                Racks
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleToggleActivo(z)}
                              title={z.activo ? 'Clic para desactivar' : 'Clic para activar'}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border transition-colors ${
                                z.activo
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
                              }`}
                            >
                              {z.activo ? 'Activa' : 'Inactiva'}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => {
                                  setZonaAEditar(z);
                                  setZonaModalOpen(true);
                                }}
                                title="Editar Zona"
                                className="p-1 rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:text-[#cdc3d4] dark:hover:text-[#dab9ff] dark:hover:bg-[#201330] transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setZonaAEliminar(z)}
                                title="Eliminar Zona"
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#381015] transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
            <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
              Total: <strong className="font-mono text-slate-900 dark:text-[#e5e2e1]">{zonas.length}</strong> zonas en este depósito
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Submodal for Create / Edit Zona */}
        <ZonaModal
          isOpen={zonaModalOpen}
          onClose={() => {
            setZonaModalOpen(false);
            setZonaAEditar(null);
          }}
          zona={zonaAEditar}
          almacenes={almacenes}
          defaultAlmacenId={almacenId}
          onSuccess={() => {
            cargarZonas(almacenId);
            onZonasUpdated();
          }}
        />

        {/* Confirm Delete Modal */}
        {zonaAEliminar && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-md max-w-sm w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 text-rose-600 dark:text-[#ffb4ab]">
                <div className="p-2 rounded bg-rose-100 dark:bg-[#381015] border border-rose-200 dark:border-[#690005]">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
                    ¿Eliminar Zona?
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                    Zona: <span className="font-mono font-bold text-rose-600 dark:text-[#ffb4ab]">{zonaAEliminar.codigo}</span>
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-[#cdc3d4]">
                Se eliminará la zona <strong className="text-slate-900 dark:text-[#e5e2e1]">"{zonaAEliminar.nombre}"</strong>. Si existen ubicaciones asociadas a esta zona, el sistema impedirá su eliminación por seguridad.
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-[#333333]">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setZonaAEliminar(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmarEliminar}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white dark:bg-[#ba1a1a] dark:hover:bg-[#93000a] transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleting ? 'Eliminando...' : 'Eliminar Zona'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
};
