import React, { useState } from 'react';
import {
  Smartphone,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  ArrowRightLeft,
  ChevronLeft,
  LogOut,
  Warehouse,
  User,
  Radio,
  Sparkles,
} from 'lucide-react';
import type { Database } from '../../../types/database.types';
import { RfSessionSetup } from './RfSessionSetup';
import { RfPutawayView } from './RfPutawayView';
import { RfPickingView } from './RfPickingView';
import { RfInquiryView } from './RfInquiryView';
import { RfRelocationView } from './RfRelocationView';

export type RfMode = 'menu' | 'putaway' | 'picking' | 'inquiry' | 'relocation';

interface RfTerminalViewProps {
  almacenes: Database['public']['Tables']['almacenes']['Row'][];
  selectedAlmacenId?: string;
  onExitTerminal?: () => void;
}

export const RfTerminalView: React.FC<RfTerminalViewProps> = ({
  almacenes,
  selectedAlmacenId,
  onExitTerminal,
}) => {
  const [sessionActive, setSessionActive] = useState(false);
  const [almacenId, setAlmacenId] = useState(selectedAlmacenId || (almacenes[0]?.id ?? ''));
  const [operarioNombre, setOperarioNombre] = useState('Operario Depósito #1');
  const [currentMode, setCurrentMode] = useState<RfMode>('menu');

  // Flash visual para retroalimentación instantánea
  const [flashType, setFlashType] = useState<'success' | 'error' | null>(null);

  const triggerFlash = (type: 'success' | 'error') => {
    setFlashType(type);
    setTimeout(() => {
      setFlashType(null);
    }, 450);
  };

  const handleStartSession = (almId: string, nombre: string) => {
    setAlmacenId(almId);
    setOperarioNombre(nombre);
    setSessionActive(true);
    setCurrentMode('menu');
  };

  const currentAlmacen = almacenes.find((a) => a.id === almacenId) || almacenes[0];

  if (!sessionActive) {
    return (
      <RfSessionSetup
        almacenes={almacenes}
        selectedAlmacenId={almacenId}
        onStartSession={handleStartSession}
        onExit={onExitTerminal || (() => {})}
      />
    );
  }

  return (
    <div className="relative min-h-[82vh] max-w-xl mx-auto flex flex-col bg-white dark:bg-[#0d0d0d] border border-slate-200 dark:border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl animate-fadeIn">
      {/* Visual Flash Overlay */}
      {flashType && (
        <div
          className={`absolute inset-0 z-50 pointer-events-none transition-opacity duration-300 ${
            flashType === 'success'
              ? 'bg-emerald-500/20 border-4 border-emerald-500 dark:bg-[#69f0ae]/20 dark:border-[#69f0ae]'
              : 'bg-rose-500/25 border-4 border-rose-500 dark:bg-[#ffb4ab]/25 dark:border-[#ffb4ab]'
          }`}
        />
      )}

      {/* Top Status Bar del Terminal RF */}
      <header className="px-4 py-3 bg-slate-50 dark:bg-[#171717] border-b border-slate-200 dark:border-[#2a2a2a] flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {currentMode !== 'menu' ? (
            <button
              type="button"
              onClick={() => setCurrentMode('menu')}
              className="p-1.5 rounded-lg bg-white dark:bg-[#242424] hover:bg-slate-100 dark:hover:bg-[#333333] text-slate-800 dark:text-[#e5e2e1] border border-slate-200 dark:border-transparent transition-colors flex items-center gap-1 font-bold text-xs shrink-0 shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Menú</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 dark:bg-[#69f0ae] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 dark:bg-[#69f0ae]"></span>
              </span>
              <span className="font-mono font-black text-violet-700 dark:text-[#dab9ff] uppercase tracking-wider text-[11px]">
                RF ONLINE
              </span>
            </div>
          )}

          <div className="truncate text-slate-600 dark:text-[#cdc3d4] text-[11px] font-mono">
            <span className="text-slate-900 dark:text-[#e5e2e1] font-bold">{currentAlmacen?.nombre}</span>
            <span className="mx-1">&bull;</span>
            <span>{operarioNombre}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSessionActive(false)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#2a0e12] transition-colors shrink-0"
          title="Cambiar Almacén u Operario"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Terminal Body */}
      <main className="flex-1 p-4 sm:p-5 overflow-y-auto bg-slate-50/50 dark:bg-transparent">
        {/* ========================================================== */}
        {/* MENÚ PRINCIPAL: 4 TARJETAS TÁCTILES GIGANTES               */}
        {/* ========================================================== */}
        {currentMode === 'menu' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center pb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 dark:text-[#978d9d]">
                Menú Principal de Operaciones
              </span>
              <h2 className="text-base font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide">
                Seleccione Flujo de Depósito
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Botón 1: Guardado / Putaway */}
              <button
                type="button"
                onClick={() => setCurrentMode('putaway')}
                className="w-full text-left p-4 rounded-xl border-2 border-violet-200 dark:border-[#4b4452] bg-white hover:border-violet-500 hover:bg-violet-50/70 dark:bg-[#1a1424] dark:hover:border-[#dab9ff] dark:hover:bg-[#241738] transition-all flex items-center justify-between gap-4 group active:scale-[0.98] shadow-sm dark:shadow-lg"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-700 dark:bg-[#2e1948] dark:text-[#dab9ff] flex items-center justify-center font-bold shrink-0 border border-violet-200 dark:border-[#5d447a] group-hover:scale-105 transition-transform">
                    <ArrowDownToLine className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <div>
                    <span className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide block">
                      1. Guardado / Putaway
                    </span>
                    <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block">
                      Escaneo de Pallet LPN y asignación en racks
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-100 text-violet-700 dark:bg-[#dab9ff]/20 dark:text-[#dab9ff]">
                    INBOUND
                  </span>
                </div>
              </button>

              {/* Botón 2: Picking Guiado */}
              <button
                type="button"
                onClick={() => setCurrentMode('picking')}
                className="w-full text-left p-4 rounded-xl border-2 border-emerald-200 dark:border-[#1d4d38] bg-white hover:border-emerald-500 hover:bg-emerald-50/70 dark:bg-[#0c1f16] dark:hover:border-[#69f0ae] dark:hover:bg-[#122e21] transition-all flex items-center justify-between gap-4 group active:scale-[0.98] shadow-sm dark:shadow-lg"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-[#143d2c] dark:text-[#69f0ae] flex items-center justify-center font-bold shrink-0 border border-emerald-200 dark:border-[#2b664d] group-hover:scale-105 transition-transform">
                    <ArrowUpFromLine className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <div>
                    <span className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide block">
                      2. Picking Guiado
                    </span>
                    <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block">
                      Recorrido por pasillos y recolección de pedidos
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-700 dark:bg-[#69f0ae]/20 dark:text-[#69f0ae]">
                    OUTBOUND
                  </span>
                </div>
              </button>

              {/* Botón 3: Consulta Libre (Inquiry) */}
              <button
                type="button"
                onClick={() => setCurrentMode('inquiry')}
                className="w-full text-left p-4 rounded-xl border-2 border-sky-200 dark:border-[#1b3d52] bg-white hover:border-sky-500 hover:bg-sky-50/70 dark:bg-[#0c1a24] dark:hover:border-[#75d1ff] dark:hover:bg-[#122736] transition-all flex items-center justify-between gap-4 group active:scale-[0.98] shadow-sm dark:shadow-lg"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 dark:bg-[#143144] dark:text-[#75d1ff] flex items-center justify-center font-bold shrink-0 border border-sky-200 dark:border-[#265370] group-hover:scale-105 transition-transform">
                    <Search className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <div>
                    <span className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide block">
                      3. Consulta Libre
                    </span>
                    <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block">
                      Escanear LPN, Ubicación o SKU para ver stock
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-100 text-sky-700 dark:bg-[#75d1ff]/20 dark:text-[#75d1ff]">
                    INQUIRY
                  </span>
                </div>
              </button>

              {/* Botón 4: Reubicación Interna */}
              <button
                type="button"
                onClick={() => setCurrentMode('relocation')}
                className="w-full text-left p-4 rounded-xl border-2 border-amber-200 dark:border-[#543b18] bg-white hover:border-amber-500 hover:bg-amber-50/70 dark:bg-[#211608] dark:hover:border-[#ffd27a] dark:hover:bg-[#33220c] transition-all flex items-center justify-between gap-4 group active:scale-[0.98] shadow-sm dark:shadow-lg"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 dark:bg-[#3d2a12] dark:text-[#ffd27a] flex items-center justify-center font-bold shrink-0 border border-amber-200 dark:border-[#6b4c1f] group-hover:scale-105 transition-transform">
                    <ArrowRightLeft className="w-6 h-6 stroke-[2.2]" />
                  </div>
                  <div>
                    <span className="text-sm font-black text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wide block">
                      4. Reubicación entre Racks
                    </span>
                    <span className="text-xs text-slate-600 dark:text-[#cdc3d4] block">
                      Mover Pallet LPN completo o bultos parciales
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-[#ffd27a]/20 dark:text-[#ffd27a]">
                    INTERNO
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* SUBVISTAS OPERATIVAS                                       */}
        {/* ========================================================== */}
        {currentMode === 'putaway' && (
          <RfPutawayView
            almacenId={almacenId}
            operarioNombre={operarioNombre}
            onBack={() => setCurrentMode('menu')}
            triggerFlash={triggerFlash}
          />
        )}

        {currentMode === 'picking' && (
          <RfPickingView
            almacenId={almacenId}
            operarioNombre={operarioNombre}
            onBack={() => setCurrentMode('menu')}
            triggerFlash={triggerFlash}
          />
        )}

        {currentMode === 'inquiry' && (
          <RfInquiryView
            almacenId={almacenId}
            triggerFlash={triggerFlash}
          />
        )}

        {currentMode === 'relocation' && (
          <RfRelocationView
            almacenId={almacenId}
            operarioNombre={operarioNombre}
            triggerFlash={triggerFlash}
          />
        )}
      </main>

      {/* Terminal Footer */}
      <footer className="px-4 py-2.5 bg-slate-50 dark:bg-[#171717] border-t border-slate-200 dark:border-[#2a2a2a] flex items-center justify-between text-[11px] text-slate-600 dark:text-[#cdc3d4]">
        <div className="flex items-center gap-1.5 font-mono">
          <Smartphone className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
          <span>OpenWMS Handheld RF v2.0</span>
        </div>
        <button
          type="button"
          onClick={onExitTerminal}
          className="text-xs font-semibold text-violet-700 dark:text-[#dab9ff] hover:underline"
        >
          Cerrar Terminal
        </button>
      </footer>
    </div>
  );
};
