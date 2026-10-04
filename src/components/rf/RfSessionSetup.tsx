import React, { useState } from 'react';
import {
  Smartphone,
  Warehouse,
  UserCheck,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import type { Database } from '../../../types/database.types';

interface RfSessionSetupProps {
  almacenes: Database['public']['Tables']['almacenes']['Row'][];
  selectedAlmacenId?: string;
  onStartSession: (almacenId: string, operarioNombre: string) => void;
  onExit: () => void;
}

export const RfSessionSetup: React.FC<RfSessionSetupProps> = ({
  almacenes,
  selectedAlmacenId,
  onStartSession,
  onExit,
}) => {
  const [almacenId, setAlmacenId] = useState(
    selectedAlmacenId || (almacenes[0]?.id ?? '')
  );
  const [operarioNombre, setOperarioNombre] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('openwms_rf_operario') || 'Operario Depósito #1';
    }
    return 'Operario Depósito #1';
  });

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!almacenId) return;
    const nombre = operarioNombre.trim() || 'Operario RF';
    if (typeof window !== 'undefined') {
      localStorage.setItem('openwms_rf_operario', nombre);
    }
    onStartSession(almacenId, nombre);
  };

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 space-y-6 animate-fadeIn">
      {/* Header Visual RF */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-100 text-violet-700 dark:bg-[#dab9ff] dark:text-[#460283] shadow-lg mb-2">
          <Smartphone className="w-8 h-8 stroke-[2.2]" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 dark:bg-[#69f0ae] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 dark:bg-[#69f0ae]"></span>
          </span>
          <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1]">
            Terminal Móvil Handheld RF
          </h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-[#cdc3d4]">
          Modo optimizado para pistolas de código de barras industriales y dispositivos Android
        </p>
      </div>

      {/* Formulario de Inicio de Turno */}
      <form onSubmit={handleStart} className="p-5 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] space-y-4 shadow-xl">
        {/* Selector de Almacén */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5 mb-1.5">
            <Warehouse className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
            <span>Almacén de Trabajo Activo</span>
          </label>
          <select
            value={almacenId}
            onChange={(e) => setAlmacenId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#131313] border-2 border-slate-300 dark:border-[#333333] focus:border-violet-600 dark:focus:border-[#dab9ff] rounded text-slate-900 dark:text-[#e5e2e1] font-semibold outline-none cursor-pointer"
          >
            {almacenes.map((alm) => (
              <option key={alm.id} value={alm.id} className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">
                {alm.codigo} - {alm.nombre}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] mt-1 block">
            Las ubicaciones y tareas se filtrarán por esta sede física
          </span>
        </div>

        {/* Nombre / Legajo del Operario */}
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5 mb-1.5">
            <UserCheck className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
            <span>Operario / Legajo de Turno</span>
          </label>
          <input
            type="text"
            required
            value={operarioNombre}
            onChange={(e) => setOperarioNombre(e.target.value)}
            placeholder="Ej: Juan Pérez (Legajo 402)"
            className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-[#131313] border-2 border-slate-300 dark:border-[#333333] focus:border-violet-600 dark:focus:border-[#dab9ff] rounded text-slate-900 dark:text-[#e5e2e1] font-medium outline-none"
          />
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] mt-1 block">
            Quedará registrado en el Kardex y tareas de guardado/picking
          </span>
        </div>

        {/* Botón de Entrada */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!almacenId}
            className="w-full py-3.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Iniciar Sesión en Terminal RF</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={onExit}
            className="text-xs text-slate-500 hover:text-slate-800 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] hover:underline"
          >
            Volver a la vista de escritorio
          </button>
        </div>
      </form>
    </div>
  );
};
