import React, { useState, useEffect } from 'react';
import { X, MapPin, Save, AlertCircle } from 'lucide-react';
import { almacenApi, type Almacen, type Ubicacion } from '../../api/almacenApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface UbicacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ubicacion: Ubicacion | null;
  almacenes: Almacen[];
  defaultAlmacenId?: string;
  onSuccess: () => void;
}

export const UbicacionModal: React.FC<UbicacionModalProps> = ({
  isOpen,
  onClose,
  ubicacion,
  almacenes,
  defaultAlmacenId,
  onSuccess,
}) => {
  const isEditing = Boolean(ubicacion);

  const [almacenId, setAlmacenId] = useState('');
  const [zonas, setZonas] = useState<any[]>([]);
  const [zonaId, setZonaId] = useState('');
  const [codigoEtiqueta, setCodigoEtiqueta] = useState('');
  const [pasillo, setPasillo] = useState('');
  const [estante, setEstante] = useState('');
  const [nivel, setNivel] = useState('');
  const [posicion, setPosicion] = useState('');
  const [capacidadPesoKg, setCapacidadPesoKg] = useState<number>(1500);
  const [capacidadVolumenM3, setCapacidadVolumenM3] = useState<number>(2.4);
  const [permiteMezclaClientes, setPermiteMezclaClientes] = useState(false);
  const [estado, setEstado] = useState<'activa' | 'bloqueada'>('activa');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar zonas cuando cambia el almacén
  useEffect(() => {
    if (almacenId) {
      almacenApi
        .listarZonas(almacenId)
        .then((z) => {
          setZonas(z || []);
          if (!zonaId && z && z.length > 0) {
            setZonaId(z[0].id);
          }
        })
        .catch((err) => console.error('Error cargando zonas:', err));
    } else {
      setZonas([]);
    }
  }, [almacenId]);

  useEffect(() => {
    if (isOpen) {
      if (ubicacion) {
        setAlmacenId(ubicacion.almacen_id || '');
        setZonaId(ubicacion.zona_id || '');
        setCodigoEtiqueta(ubicacion.codigo_etiqueta || '');
        setPasillo(ubicacion.pasillo || '');
        setEstante(ubicacion.estante || '');
        setNivel(ubicacion.nivel || '');
        setPosicion(ubicacion.posicion || '');
        setCapacidadPesoKg(Number(ubicacion.capacidad_peso_kg) || 1500);
        setCapacidadVolumenM3(Number(ubicacion.capacidad_volumen_m3) || 2.4);
        setPermiteMezclaClientes(ubicacion.permite_mezcla_clientes || false);
        setEstado((ubicacion.estado as any) === 'bloqueada' ? 'bloqueada' : 'activa');
      } else {
        const alm = defaultAlmacenId || (almacenes[0]?.id ?? '');
        setAlmacenId(alm);
        setCodigoEtiqueta('');
        setPasillo('');
        setEstante('');
        setNivel('');
        setPosicion('');
        setCapacidadPesoKg(1500);
        setCapacidadVolumenM3(2.4);
        setPermiteMezclaClientes(false);
        setEstado('activa');
      }
      setErrorMsg(null);
    }
  }, [isOpen, ubicacion, defaultAlmacenId, almacenes]);

  if (!isOpen) return null;

  // Sugerir código de etiqueta automático si se ingresan coordenadas
  const sugerirEtiqueta = () => {
    const p = pasillo.trim() || 'A';
    const e = estante.trim().padStart(2, '0') || '01';
    const n = nivel.trim() || '1';
    const pos = posicion.trim() || '1';
    setCodigoEtiqueta(`RCK-${p}-${e}-${n}${pos !== '1' ? '-' + pos : ''}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!almacenId) {
      setErrorMsg('Debe seleccionar el almacén físico.');
      return;
    }
    if (!zonaId) {
      setErrorMsg('Debe seleccionar la zona del almacén.');
      return;
    }
    if (!codigoEtiqueta.trim()) {
      setErrorMsg('El código de etiqueta de la ubicación es obligatorio.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing && ubicacion) {
        await almacenApi.actualizarUbicacion(ubicacion.id, {
          almacen_id: almacenId,
          zona_id: zonaId,
          codigo_etiqueta: codigoEtiqueta.trim().toUpperCase(),
          pasillo: pasillo.trim() || null,
          estante: estante.trim() || null,
          nivel: nivel.trim() || null,
          posicion: posicion.trim() || null,
          capacidad_peso_kg: capacidadPesoKg,
          capacidad_volumen_m3: capacidadVolumenM3,
          permite_mezcla_clientes: permiteMezclaClientes,
          estado,
        });
      } else {
        await almacenApi.crearUbicacion({
          almacen_id: almacenId,
          zona_id: zonaId,
          codigo_etiqueta: codigoEtiqueta.trim().toUpperCase(),
          pasillo: pasillo.trim() || null,
          estante: estante.trim() || null,
          nivel: nivel.trim() || null,
          posicion: posicion.trim() || null,
          capacidad_peso_kg: capacidadPesoKg,
          capacidad_volumen_m3: capacidadVolumenM3,
          permite_mezcla_clientes: permiteMezclaClientes,
          estado,
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando ubicación:', err);
      setErrorMsg(err.message || 'Error al guardar la ubicación en la base de datos.');
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
            <div className="p-2 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                {isEditing ? 'Editar Ubicación de Rack' : 'Nueva Posición de Almacenamiento'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Gestión de posiciones físicas, pasillos y capacidades volumétricas
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
                Almacén Físico <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <select
                required
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-medium focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] cursor-pointer"
              >
                <option value="" disabled>Seleccione almacén...</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} ({a.codigo})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Zona Operativa <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <select
                required
                value={zonaId}
                onChange={(e) => setZonaId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] cursor-pointer"
              >
                <option value="" disabled>Seleccione zona...</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre} ({z.codigo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Código de Etiqueta */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase">
                Código de Etiqueta / Barcode <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <button
                type="button"
                onClick={sugerirEtiqueta}
                className="text-[10px] text-violet-600 dark:text-[#dab9ff] hover:underline"
              >
                Auto-armar según coordenadas
              </button>
            </div>
            <input
              type="text"
              required
              value={codigoEtiqueta}
              onChange={(e) => setCodigoEtiqueta(e.target.value.toUpperCase())}
              placeholder="Ej: RCK-A-01-01"
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          {/* Coordenadas Físicas */}
          <div className="p-3 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider block">
              Coordenadas Espaciales del Rack
            </span>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Pasillo
                </label>
                <input
                  type="text"
                  value={pasillo}
                  onChange={(e) => setPasillo(e.target.value.toUpperCase())}
                  placeholder="A"
                  className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Estante
                </label>
                <input
                  type="text"
                  value={estante}
                  onChange={(e) => setEstante(e.target.value)}
                  placeholder="01"
                  className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Nivel
                </label>
                <input
                  type="text"
                  value={nivel}
                  onChange={(e) => setNivel(e.target.value)}
                  placeholder="1"
                  className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase mb-1">
                  Posición
                </label>
                <input
                  type="text"
                  value={posicion}
                  onChange={(e) => setPosicion(e.target.value)}
                  placeholder="1"
                  className="w-full px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-center text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>
          </div>

          {/* Capacidades & Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Capacidad Peso Máx (Kg)
              </label>
              <input
                type="number"
                step="50"
                min="0"
                value={capacidadPesoKg}
                onChange={(e) => setCapacidadPesoKg(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Capacidad Volumen Máx (M³)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={capacidadVolumenM3}
                onChange={(e) => setCapacidadVolumenM3(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-violet-700 dark:text-[#dab9ff] font-bold focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          {/* Estado & Mezcla */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 dark:border-[#333333]">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-800 dark:text-[#e5e2e1]">
              <input
                type="checkbox"
                checked={permiteMezclaClientes}
                onChange={(e) => setPermiteMezclaClientes(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313]"
              />
              <span>Permite mezcla de diferentes clientes en posición</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase">Estado:</span>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as any)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold border cursor-pointer ${
                  estado === 'activa'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                    : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
                }`}
              >
                <option value="activa">ACTIVA</option>
                <option value="bloqueada">BLOQUEADA</option>
              </select>
            </div>
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
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Ubicación'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
