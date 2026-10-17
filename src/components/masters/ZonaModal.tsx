import React, { useState, useEffect } from 'react';
import { X, Layers, Save, AlertCircle, Sparkles, Check, ShieldCheck, Box } from 'lucide-react';
import { almacenApi, type Almacen, type Zona, type ZonaInsert, type ZonaUpdate } from '../../api/almacenApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

export interface ZonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  zona: Zona | null;
  almacenes: Almacen[];
  defaultAlmacenId?: string;
  onSuccess?: () => void;
  onCreated?: (nueva: Zona) => void;
}

const TIPOS_ZONA = [
  {
    value: 'almacenamiento',
    label: 'Almacenamiento General / Racks',
    desc: 'Posiciones de racks convencionales, selectivos o compactos',
    color: 'text-violet-400 bg-violet-950/40 border-violet-800/60',
  },
  {
    value: 'picking',
    label: 'Área de Picking & Fraccionado',
    desc: 'Nivel bajo o estantería liviana para preparación de pedidos',
    color: 'text-sky-400 bg-sky-950/40 border-sky-800/60',
  },
  {
    value: 'recepcion',
    label: 'Playa de Recepción & Inbound',
    desc: 'Playa de descarga, control de remitos y pulmón de ingreso',
    color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60',
  },
  {
    value: 'despacho',
    label: 'Playa de Despacho & Outbound',
    desc: 'Playa de consolidación de pallets, remisión y precintado',
    color: 'text-amber-400 bg-amber-950/40 border-amber-800/60',
  },
  {
    value: 'cuarentena',
    label: 'Área de Cuarentena & Calidad',
    desc: 'Aislamiento de mercadería observada o en control',
    color: 'text-rose-400 bg-rose-950/40 border-rose-800/60',
  },
  {
    value: 'mermas',
    label: 'Área de Mermas & Bajas',
    desc: 'Productos averiados, rotos o en disposición final',
    color: 'text-red-400 bg-red-950/40 border-red-800/60',
  },
];

const PLANTILLAS_RAPIDAS = [
  { codigo: 'Z-RCK-A', nombre: 'Racks Convencionales Pasillo A', tipo: 'almacenamiento', autoestiba: false },
  { codigo: 'Z-PCK-01', nombre: 'Zona de Picking Nivel 0', tipo: 'picking', autoestiba: false },
  { codigo: 'Z-REC-01', nombre: 'Playa de Recepción Inbound', tipo: 'recepcion', autoestiba: true },
  { codigo: 'Z-DES-01', nombre: 'Playa de Despacho Outbound', tipo: 'despacho', autoestiba: true },
  { codigo: 'Z-QUA-01', nombre: 'Área de Cuarentena y Calidad', tipo: 'cuarentena', autoestiba: false },
  { codigo: 'Z-PISO-01', nombre: 'Autoestiba / Pulmón al Piso', tipo: 'almacenamiento', autoestiba: true },
];

export const ZonaModal: React.FC<ZonaModalProps> = ({
  isOpen,
  onClose,
  zona,
  almacenes,
  defaultAlmacenId,
  onSuccess,
  onCreated,
}) => {
  const isEditing = Boolean(zona);

  const [almacenId, setAlmacenId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipoZona, setTipoZona] = useState('almacenamiento');
  const [esAutoestibaPiso, setEsAutoestibaPiso] = useState(true);
  const [activo, setActivo] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (zona) {
        setAlmacenId(zona.almacen_id || '');
        setCodigo(zona.codigo || '');
        setNombre(zona.nombre || '');
        setTipoZona(zona.tipo_zona || 'almacenamiento');
        setEsAutoestibaPiso(Boolean(zona.es_autoestiba_piso));
        setActivo(zona.activo ?? true);
      } else {
        const alm = defaultAlmacenId || (almacenes[0]?.id ?? '');
        setAlmacenId(alm);
        setCodigo('');
        setNombre('');
        setTipoZona('almacenamiento');
        setEsAutoestibaPiso(true);
        setActivo(true);
      }
      setErrorMsg(null);
    }
  }, [isOpen, zona, defaultAlmacenId, almacenes]);

  if (!isOpen) return null;

  const aplicarPlantilla = (p: typeof PLANTILLAS_RAPIDAS[0]) => {
    setCodigo(p.codigo);
    setNombre(p.nombre);
    setTipoZona(p.tipo);
    setEsAutoestibaPiso(p.autoestiba);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!almacenId) {
      setErrorMsg('Debe seleccionar el depósito o almacén asociado.');
      return;
    }
    if (!codigo.trim()) {
      setErrorMsg('El código de zona es obligatorio (ej: Z-RCK-A).');
      return;
    }
    if (!nombre.trim()) {
      setErrorMsg('El nombre descriptivo de la zona es obligatorio.');
      return;
    }

    setLoading(true);

    try {
      if (isEditing && zona) {
        const cambios: ZonaUpdate = {
          almacen_id: almacenId,
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          tipo_zona: tipoZona,
          es_autoestiba_piso: esAutoestibaPiso,
          activo,
        };
        const updated = await almacenApi.actualizarZona(zona.id, cambios);
        if (onCreated) onCreated(updated);
      } else {
        const nueva: ZonaInsert = {
          almacen_id: almacenId,
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          tipo_zona: tipoZona,
          es_autoestiba_piso: esAutoestibaPiso,
          activo,
        };
        const created = await almacenApi.crearZona(nueva);
        if (onCreated) onCreated(created);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando zona:', err);
      if (err.message && err.message.includes('zonas_almacen_codigo_uk')) {
        setErrorMsg(`Ya existe una zona con el código "${codigo.trim().toUpperCase()}" en este depósito.`);
      } else {
        setErrorMsg(err.message || 'Error al guardar la zona en la base de datos.');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedWarehouse = almacenes.find((a) => a.id === almacenId);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-sm animate-fadeIn">
        <div className="relative w-full max-w-lg rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                  {isEditing ? 'Editar Zona de Almacén' : 'Nueva Zona Operativa de Almacén'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                  {selectedWarehouse
                    ? `Depósito: ${selectedWarehouse.nombre} (${selectedWarehouse.codigo})`
                    : 'Configuración de sectores físicos y operacionales del WMS'}
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Quick Templates (only when creating) */}
            {!isEditing && (
              <div className="p-2.5 rounded bg-slate-50 dark:bg-[#131313] border border-slate-200 dark:border-[#333333]">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-600 dark:text-[#dab9ff] uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Plantillas Rápidas WMS (1 Clic)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PLANTILLAS_RAPIDAS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => aplicarPlantilla(p)}
                      className="px-2 py-1 rounded bg-white dark:bg-[#201f1f] hover:bg-violet-50 dark:hover:bg-[#2e213d] border border-slate-200 dark:border-[#44424a] text-[11px] text-slate-700 dark:text-[#cdc3d4] hover:text-violet-700 dark:hover:text-[#dab9ff] transition-all flex items-center gap-1"
                    >
                      <span className="font-mono font-bold text-[10px]">{p.codigo}</span>
                      <span className="opacity-75 text-[10px]">({p.tipo})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Almacén selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Depósito / Almacén Físico <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <select
                required
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                disabled={isEditing}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-medium focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] cursor-pointer disabled:opacity-60"
              >
                <option value="" disabled>Seleccione almacén...</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} ({a.codigo})
                  </option>
                ))}
              </select>
            </div>

            {/* Código y Nombre */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                  Código de Zona <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="Ej: Z-RCK-A"
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                  Nombre Descriptivo <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Racks Pasillo A"
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>

            {/* Tipo de Zona */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Tipo Operativo de Zona <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TIPOS_ZONA.map((t) => {
                  const isSelected = tipoZona === t.value;
                  return (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setTipoZona(t.value)}
                      className={`text-left p-2 rounded border transition-all ${isSelected
                          ? 'border-violet-500 dark:border-[#dab9ff] bg-violet-50 dark:bg-[#2e213d] shadow-sm'
                          : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#131313] hover:border-slate-300 dark:hover:border-[#4b4452]'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-bold ${isSelected ? 'text-violet-700 dark:text-[#dab9ff]' : 'text-slate-800 dark:text-[#e5e2e1]'}`}>
                          {t.label}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-[#978d9d] mt-0.5 line-clamp-1">
                        {t.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Opciones Adicionales */}
            <div className="p-3 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={esAutoestibaPiso}
                  onChange={(e) => setEsAutoestibaPiso(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <div>
                  <span className="text-[11px] font-semibold text-slate-800 dark:text-[#e5e2e1] block">
                    Permite Autoestiba al Piso (Sin Racks)
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-[#cdc3d4] block">
                    Habilita almacenar mercadería y pallets directamente en el piso de la zona sin requerir coordenadas fijas de pasillo/rack.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer pt-1 border-t border-slate-200 dark:border-[#333333]">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-[11px] font-semibold text-slate-800 dark:text-[#e5e2e1]">
                  Zona Activa para Operaciones Logísticas
                </span>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-[#333333]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 font-bold"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Zona'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
