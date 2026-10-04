import React, { useState, useEffect } from 'react';
import { X, Zap, Save, AlertCircle, Layers, CheckCircle2 } from 'lucide-react';
import { almacenApi, type Almacen } from '../../api/almacenApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface GeneradorUbicacionesModalProps {
  isOpen: boolean;
  onClose: () => void;
  almacenes: Almacen[];
  defaultAlmacenId?: string;
  onSuccess: () => void;
}

export const GeneradorUbicacionesModal: React.FC<GeneradorUbicacionesModalProps> = ({
  isOpen,
  onClose,
  almacenes,
  defaultAlmacenId,
  onSuccess,
}) => {
  const [almacenId, setAlmacenId] = useState('');
  const [zonas, setZonas] = useState<any[]>([]);
  const [zonaId, setZonaId] = useState('');

  const [prefijo, setPrefijo] = useState('RCK-A');
  const [pasillo, setPasillo] = useState('A');
  const [estanteDesde, setEstanteDesde] = useState(1);
  const [estanteHasta, setEstanteHasta] = useState(5);
  const [nivelDesde, setNivelDesde] = useState(1);
  const [nivelHasta, setNivelHasta] = useState(4);
  const [posicionesPorNivel, setPosicionesPorNivel] = useState(2);

  const [capacidadPesoKg, setCapacidadPesoKg] = useState(1500);
  const [capacidadVolumenM3, setCapacidadVolumenM3] = useState(2.4);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const alm = defaultAlmacenId || (almacenes[0]?.id ?? '');
      setAlmacenId(alm);
      setErrorMsg(null);
    }
  }, [isOpen, defaultAlmacenId, almacenes]);

  useEffect(() => {
    if (almacenId) {
      almacenApi
        .listarZonas(almacenId)
        .then((z) => {
          setZonas(z || []);
          if (z && z.length > 0) setZonaId(z[0].id);
        })
        .catch((err) => console.error('Error cargando zonas:', err));
    }
  }, [almacenId]);

  if (!isOpen) return null;

  // Cálculo de ubicaciones a generar
  const cantidadEstantes = Math.max(0, estanteHasta - estanteDesde + 1);
  const cantidadNiveles = Math.max(0, nivelHasta - nivelDesde + 1);
  const totalAGenerar = cantidadEstantes * cantidadNiveles * posicionesPorNivel;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!almacenId || !zonaId) {
      setErrorMsg('Debe seleccionar el almacén y la zona de destino.');
      return;
    }
    if (totalAGenerar <= 0) {
      setErrorMsg('La combinación de rangos ingresada no genera ninguna ubicación.');
      return;
    }
    if (totalAGenerar > 500) {
      setErrorMsg('Por seguridad no genere más de 500 ubicaciones en un solo lote.');
      return;
    }

    const lote: any[] = [];
    for (let e = estanteDesde; e <= estanteHasta; e++) {
      const eStr = e.toString().padStart(2, '0');
      for (let n = nivelDesde; n <= nivelHasta; n++) {
        for (let p = 1; p <= posicionesPorNivel; p++) {
          const cod = `${prefijo}-${eStr}-${n}-${p}`;
          lote.push({
            almacen_id: almacenId,
            zona_id: zonaId,
            codigo_etiqueta: cod,
            pasillo: pasillo.trim().toUpperCase() || null,
            estante: eStr,
            nivel: n.toString(),
            posicion: p.toString(),
            capacidad_peso_kg: capacidadPesoKg,
            capacidad_volumen_m3: capacidadVolumenM3,
            permite_mezcla_clientes: false,
            estado: 'activa',
          });
        }
      }
    }

    setLoading(true);
    try {
      await almacenApi.crearUbicacionesLote(lote);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error en generación masiva de ubicaciones:', err);
      setErrorMsg(err.message || 'Error al insertar ubicaciones en lote. Verifique que no existan etiquetas duplicadas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-amber-100 border border-amber-300 text-amber-800 dark:bg-[#38260a] dark:border-[#7a4c10] dark:text-[#ffd27a]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                Generador Masivo de Racks & Posiciones
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Creación automática y matricial de pasillos, estantes y niveles
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Almacén y Zona */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Almacén
              </label>
              <select
                required
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
              >
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Zona de Racks
              </label>
              <select
                required
                value={zonaId}
                onChange={(e) => setZonaId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
              >
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prefijo y Pasillo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Prefijo Etiqueta
              </label>
              <input
                type="text"
                required
                value={prefijo}
                onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
                placeholder="RCK-A"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Pasillo Letra/Nro
              </label>
              <input
                type="text"
                value={pasillo}
                onChange={(e) => setPasillo(e.target.value.toUpperCase())}
                placeholder="A"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
              />
            </div>
          </div>

          {/* Matriz: Estantes, Niveles, Posiciones */}
          <div className="p-3 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-3">
            <span className="text-[11px] font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider block">
              Dimensiones de la Estructura (Matriz)
            </span>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Estantes (Desde - Hasta)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    value={estanteDesde}
                    onChange={(e) => setEstanteDesde(parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1]"
                  />
                  <span className="text-slate-400 dark:text-[#cdc3d4]">-</span>
                  <input
                    type="number"
                    min="1"
                    value={estanteHasta}
                    onChange={(e) => setEstanteHasta(parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Niveles (Desde - Hasta)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    value={nivelDesde}
                    onChange={(e) => setNivelDesde(parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1]"
                  />
                  <span className="text-slate-400 dark:text-[#cdc3d4]">-</span>
                  <input
                    type="number"
                    min="1"
                    value={nivelHasta}
                    onChange={(e) => setNivelHasta(parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Posiciones / Nivel
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={posicionesPorNivel}
                  onChange={(e) => setPosicionesPorNivel(parseInt(e.target.value) || 1)}
                  className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1]"
                />
              </div>
            </div>
          </div>

          {/* Capacidades */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Capacidad Peso (Kg / Posición)
              </label>
              <input
                type="number"
                min="0"
                value={capacidadPesoKg}
                onChange={(e) => setCapacidadPesoKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Capacidad Volumen (M³ / Posición)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={capacidadVolumenM3}
                onChange={(e) => setCapacidadVolumenM3(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff]"
              />
            </div>
          </div>

          {/* Preview resumen */}
          <div className="p-3 rounded bg-violet-50 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-700 dark:text-[#dab9ff]" />
              <span className="text-xs text-slate-800 dark:text-[#e5e2e1]">
                Total de ubicaciones a crear: <strong className="text-violet-700 dark:text-[#dab9ff] font-mono text-sm">{totalAGenerar}</strong>
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 dark:text-[#cdc3d4]">
              Ej: {prefijo}-01-1-1
            </span>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || totalAGenerar <= 0}
              className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loading ? 'Generando en BD...' : `Generar ${totalAGenerar} Ubicaciones`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
