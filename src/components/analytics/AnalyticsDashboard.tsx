import React, { useState } from 'react';
import {
  BarChart3,
  Grid,
  TrendingUp,
  FileSpreadsheet,
  Layers,
  Box,
  Scale,
  Package,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { RackHeatmap } from './RackHeatmap';
import { AbcSlottingAudit } from './AbcSlottingAudit';
import { ExportReportsCenter } from './ExportReportsCenter';
import { formatNumber, formatM3 } from '@/lib/utils';

interface AnalyticsDashboardProps {
  inventario: any[];
  kardex: any[];
  almacenes: any[];
  clientes: any[];
  selectedAlmacenId?: string;
  selectedClienteId?: string;
  onRefresh: () => void;
  isDark: boolean;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  inventario,
  kardex,
  almacenes,
  clientes,
  selectedAlmacenId,
  selectedClienteId,
  onRefresh,
  isDark,
}) => {
  const [activeTab, setActiveTab] = useState<'heatmap' | 'abc' | 'reports'>('heatmap');

  // Executive Top Level Metrics
  const totalMercaderia = inventario.reduce(
    (acc, item) => acc + Number(item.cantidad_disponible || 0) + Number(item.cantidad_reservada || 0),
    0
  );
  const totalBultosDisponibles = inventario.reduce((acc, item) => acc + Number(item.cantidad_disponible || 0), 0);
  const totalM3 = inventario.reduce((acc, item) => acc + Number(item.volumen_m3 || 0), 0);

  const palletsSet = new Set<string>();
  inventario.forEach((item) => {
    if (item.pallet?.codigo_lpn) palletsSet.add(item.pallet.codigo_lpn);
  });
  const totalPallets = palletsSet.size;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Executive Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-[#333333] gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-violet-600 dark:text-[#dab9ff]" />
            Dashboard Ejecutivo & Analítica Avanzada WMS
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mt-0.5">
            Mapa de calor de racks, optimización de slotting ABC y cubicaje por cliente 3PL.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1c1b1b] hover:bg-slate-50 dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] transition-colors self-start sm:self-auto shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
          <span>Actualizar Métricas</span>
        </button>
      </div>

      {/* Top Quick Executive Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* 1. TOTAL MERCADERÍA (PRIMERO) */}
        <div className="p-4 rounded-xl bg-violet-50/50 dark:bg-[#1f162b]/60 border border-violet-200 dark:border-violet-900/50 shadow-xs transition-colors">
          <div className="flex items-center space-x-2 text-violet-700 dark:text-[#dab9ff] text-xs font-semibold">
            <Package className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
            <span>Total Mercadería</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#e5e2e1] mt-1 tabular-nums">
            {formatNumber(totalMercaderia, 0)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
            {formatNumber(totalBultosDisponibles, 0)} bultos disponibles
          </span>
        </div>

        {/* 2. VOLUMEN OCUPADO */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-xs transition-colors">
          <div className="flex items-center space-x-2 text-slate-600 dark:text-[#cdc3d4] text-xs font-semibold">
            <Box className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
            <span>Volumen Ocupado</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#e5e2e1] mt-1 tabular-nums">
            {formatM3(totalM3)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">Total en almacenamiento</span>
        </div>

        {/* 3. PALLETS LPN ACTIVOS */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-xs transition-colors">
          <div className="flex items-center space-x-2 text-slate-600 dark:text-[#cdc3d4] text-xs font-semibold">
            <Layers className="w-4 h-4 text-amber-600 dark:text-[#ffddb8]" />
            <span>Pallets LPN Activos</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#e5e2e1] mt-1 tabular-nums">
            {formatNumber(totalPallets, 0)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">Posiciones paletizadas</span>
        </div>

        {/* 4. CLIENTES DEPOSITANTES */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-xs transition-colors">
          <div className="flex items-center space-x-2 text-slate-600 dark:text-[#cdc3d4] text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-[#69f0ae]" />
            <span>Clientes Depositantes</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#e5e2e1] mt-1 tabular-nums">
            {clientes.length}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">{almacenes.length} almacenes activos</span>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-[#333333] gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('heatmap')}
          className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'heatmap'
              ? 'border-violet-600 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff]'
              : 'border-transparent text-slate-500 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>Mapa de Calor de Racks & Posiciones</span>
        </button>

        <button
          onClick={() => setActiveTab('abc')}
          className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'abc'
              ? 'border-violet-600 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff]'
              : 'border-transparent text-slate-500 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Rotación ABC & Auditoría de Slotting</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-2.5 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-violet-600 text-violet-700 dark:border-[#dab9ff] dark:text-[#dab9ff]'
              : 'border-transparent text-slate-500 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Centro de Reportes & Exportación</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'heatmap' && (
        <RackHeatmap
          almacenes={almacenes}
          selectedAlmacenId={selectedAlmacenId}
          inventario={inventario}
        />
      )}

      {activeTab === 'abc' && (
        <AbcSlottingAudit
          inventario={inventario}
          kardex={kardex}
          clientes={clientes}
          selectedClienteId={selectedClienteId}
        />
      )}

      {activeTab === 'reports' && (
        <ExportReportsCenter
          inventario={inventario}
          kardex={kardex}
          clientes={clientes}
          selectedClienteId={selectedClienteId}
        />
      )}
    </div>
  );
};
