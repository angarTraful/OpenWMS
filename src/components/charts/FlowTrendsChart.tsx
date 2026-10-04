import React from 'react';
import ReactECharts from 'echarts-for-react';
import { GitCommit, TrendingUp } from 'lucide-react';

interface FlowData {
  recepcionesPendientes: number;
  recepcionesFinalizadas: number;
  pedidosPendientes: number;
  pedidosSeparados: number;
  remitosEmitidos: number;
}

interface FlowTrendsChartProps {
  data: FlowData;
  isDark: boolean;
}

export const FlowTrendsChart: React.FC<FlowTrendsChartProps> = ({ data, isDark }) => {
  const textColor = isDark ? '#e5e2e1' : '#0f172a';
  const subTextColor = isDark ? '#cdc3d4' : '#64748b';
  const splitLineColor = isDark ? '#2a2a2a' : '#f1f5f9';
  const axisLineColor = isDark ? '#333333' : '#e2e8f0';
  const tooltipBg = isDark ? '#201f1f' : '#ffffff';
  const tooltipBorder = isDark ? '#333333' : '#e2e8f0';
  const tooltipTextColor = isDark ? '#e5e2e1' : '#0f172a';

  const stages = [
    { name: 'Recepciones Inbound', value: data.recepcionesPendientes + data.recepcionesFinalizadas, color: isDark ? '#dab9ff' : '#7c3aed' },
    { name: 'En Control / Putaway', value: data.recepcionesPendientes, color: '#f59e0b' },
    { name: 'Pedidos Solicitados', value: data.pedidosPendientes + data.pedidosSeparados, color: isDark ? '#ffb1c5' : '#ec4899' },
    { name: 'Picking Realizado', value: data.pedidosSeparados, color: isDark ? '#75d1ff' : '#0284c7' },
    { name: 'Despachos & Remitos Rx', value: data.remitosEmitidos, color: '#10b981' },
  ];

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      padding: [8, 12],
      textStyle: { color: tooltipTextColor, fontFamily: 'Hanken Grotesk' },
    },
    grid: {
      top: '12%',
      left: '3%',
      right: '4%',
      bottom: '6%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: stages.map((s) => s.name),
      axisLabel: {
        color: textColor,
        fontFamily: 'Hanken Grotesk',
        interval: 0,
        fontSize: 11,
      },
      axisLine: { lineStyle: { color: axisLineColor } },
    },
    yAxis: {
      type: 'value',
      name: 'Cantidad Documentos',
      nameTextStyle: { color: subTextColor, fontSize: 11 },
      axisLabel: { color: subTextColor, fontFamily: 'JetBrains Mono' },
      splitLine: {
        lineStyle: {
          color: splitLineColor,
          type: 'dashed',
        },
      },
    },
    series: [
      {
        name: 'Operaciones',
        type: 'bar',
        barMaxWidth: 36,
        data: stages.map((s) => ({
          value: s.value,
          itemStyle: {
            color: s.color,
            borderRadius: [4, 4, 0, 0],
          },
        })),
        label: {
          show: true,
          position: 'top',
          color: textColor,
          fontFamily: 'JetBrains Mono',
          fontSize: 12,
          fontWeight: 'bold',
        },
      },
    ],
  };

  return (
    <div className="bg-[#1c1b1b] rounded-md border border-[#333333] p-5 transition-colors">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#333333]">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#dab9ff]" />
            <h2 className="text-sm font-semibold text-[#e5e2e1] uppercase tracking-wider">
              Embudo de Operaciones Logísticas en Tiempo Real
            </h2>
          </div>
          <p className="text-xs text-[#cdc3d4] mt-0.5">
            Seguimiento de flujo continuo desde recepción de contenedores hasta remito de tránsito
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-[#cdc3d4] font-mono">
          <GitCommit className="w-3.5 h-3.5 text-[#dab9ff]" />
          <span>PostgreSQL Trigger Synchronized</span>
        </div>
      </div>

      <ReactECharts
        option={option}
        style={{ height: '260px', width: '100%' }}
        theme={isDark ? 'dark' : undefined}
      />
    </div>
  );
};
