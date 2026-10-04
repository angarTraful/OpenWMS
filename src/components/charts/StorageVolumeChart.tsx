import React from 'react';
import ReactECharts from 'echarts-for-react';
import { Box, Info } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface VolumeData {
  clienteNombre: string;
  totalM3: number;
  totalBultos: number;
  porcentaje: number;
}

interface StorageVolumeChartProps {
  data: VolumeData[];
  capacidadTotalM3?: number;
  isDark: boolean;
}

const PALETTE = [
  '#dab9ff', // Primary Purple
  '#75d1ff', // Tertiary Cyan
  '#ffb1c5', // Secondary Rose
  '#ffd27a', // Amber
  '#a7f3d0', // Mint
  '#ff8f7d', // Coral
  '#bb86fc', // Purple container
  '#2aaadd', // Cyan container
  '#fca5a5', // Soft red
  '#c2e8ff', // Ice blue
];

export const StorageVolumeChart: React.FC<StorageVolumeChartProps> = ({
  data,
  capacidadTotalM3 = 5000,
  isDark,
}) => {
  const m3Ocupados = data.reduce((acc, curr) => acc + curr.totalM3, 0);
  const porcentajeOcupacion = Math.min(100, (m3Ocupados / capacidadTotalM3) * 100);
  const m3Disponibles = Math.max(0, capacidadTotalM3 - m3Ocupados);

  const textColor = isDark ? '#e5e2e1' : '#0f172a';
  const subTextColor = isDark ? '#cdc3d4' : '#64748b';
  const splitLineColor = isDark ? '#2a2a2a' : '#f1f5f9';
  const axisLineColor = isDark ? '#333333' : '#e2e8f0';
  const tooltipBg = isDark ? '#201f1f' : '#ffffff';
  const tooltipBorder = isDark ? '#333333' : '#e2e8f0';
  const tooltipTextColor = isDark ? '#e5e2e1' : '#0f172a';

  // Option 1: Horizontal Bar Chart of M3 per Client
  const barOption = {
    color: PALETTE,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      padding: [8, 12],
      textStyle: { color: tooltipTextColor, fontFamily: 'Hanken Grotesk' },
      formatter: (params: any) => {
        const item = params[0];
        const raw = data.find((d) => d.clienteNombre === item.name);
        return `
          <div style="font-weight: 600; font-size: 13px; color: ${tooltipTextColor}; margin-bottom: 4px;">${item.name}</div>
          <div style="font-size: 12px; color: ${isDark ? '#dab9ff' : '#7c3aed'}; font-weight: 600;">
            Volumen: ${formatNumber(item.value, 2)} m³
          </div>
          ${raw ? `<div style="font-size: 11px; color: ${subTextColor}; margin-top: 2px;">Bultos: ${raw.totalBultos}</div>` : ''}
        `;
      },
    },
    grid: {
      top: '12%',
      left: '3%',
      right: '6%',
      bottom: '5%',
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      name: 'm³ Ocupados',
      nameTextStyle: { color: subTextColor, fontSize: 11 },
      axisLabel: { color: subTextColor, fontFamily: 'JetBrains Mono' },
      splitLine: {
        lineStyle: {
          color: splitLineColor,
          type: 'dashed',
        },
      },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.clienteNombre),
      axisLabel: {
        color: textColor,
        fontFamily: 'Hanken Grotesk',
        formatter: (val: string) => (val.length > 20 ? val.substring(0, 18) + '...' : val),
      },
      axisLine: { lineStyle: { color: axisLineColor } },
    },
    series: [
      {
        name: 'Volumen m³',
        type: 'bar',
        data: data.map((d, idx) => ({
          value: d.totalM3,
          itemStyle: {
            color: PALETTE[idx % PALETTE.length],
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 24,
        label: {
          show: true,
          position: 'right',
          color: textColor,
          fontFamily: 'JetBrains Mono',
          fontSize: 11,
          formatter: (p: any) => `${formatNumber(p.value, 1)} m³`,
        },
      },
    ],
  };

  // Option 2: Donut of Warehouse Capacity vs Occupancy
  const donutOption = {
    color: [isDark ? '#dab9ff' : '#7c3aed', isDark ? '#2a2a2a' : '#e2e8f0'],
    tooltip: {
      trigger: 'item',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      padding: [8, 12],
      textStyle: { color: tooltipTextColor, fontFamily: 'Hanken Grotesk' },
      formatter: '{b}: <b>{c} m³</b> ({d}%)',
    },
    legend: {
      bottom: '2%',
      left: 'center',
      textStyle: { color: subTextColor, fontSize: 11, fontFamily: 'Hanken Grotesk' },
    },
    series: [
      {
        name: 'Ocupación Almacén',
        type: 'pie',
        radius: ['62%', '84%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center',
          formatter: () => `{val|${porcentajeOcupacion.toFixed(1)}%}\n{label|Ocupación}`,
          rich: {
            val: {
              fontSize: 24,
              fontWeight: '600',
              color: textColor,
              fontFamily: 'JetBrains Mono',
            },
            label: {
              fontSize: 11,
              color: subTextColor,
              padding: [4, 0, 0, 0],
              fontFamily: 'Hanken Grotesk',
            },
          },
        },
        emphasis: {
          label: { show: true },
        },
        data: [
          { value: Number(m3Ocupados.toFixed(2)), name: 'Ocupado 3PL' },
          { value: Number(m3Disponibles.toFixed(2)), name: 'Espacio Libre' },
        ],
      },
    ],
  };

  return (
    <div className="bg-[#1c1b1b] rounded-md border border-[#333333] p-5 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[#333333] gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[#dab9ff]" />
            <h2 className="text-sm font-semibold text-[#e5e2e1] uppercase tracking-wider">
              Distribución de Volumen Cúbico (M3) por Cliente Depositante
            </h2>
          </div>
          <p className="text-xs text-[#cdc3d4] mt-0.5">
            Métrica central para la valorización y facturación de almacenamiento 3PL
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-[#cdc3d4] uppercase tracking-wider block">
              Capacidad Nominal
            </span>
            <span className="font-mono text-xs font-semibold text-[#e5e2e1] tabular-nums">
              {formatNumber(capacidadTotalM3, 0)} m³
            </span>
          </div>
          <div className="text-right pl-3 border-l border-[#333333]">
            <span className="text-[10px] text-[#cdc3d4] uppercase tracking-wider block">
              Ocupado Actual
            </span>
            <span className="font-mono text-xs font-bold text-[#dab9ff] tabular-nums">
              {formatNumber(m3Ocupados, 2)} m³
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
        {/* Main Bar Chart taking 2 cols */}
        <div className="lg:col-span-2">
          {data.length === 0 ? (
            <div className="h-[280px] flex flex-col items-center justify-center text-[#cdc3d4] border border-dashed border-[#333333] rounded">
              <Info className="w-5 h-5 mb-2 text-[#978d9d]" />
              <p className="text-xs">Sin registros de cubicaje para el filtro seleccionado</p>
            </div>
          ) : (
            <ReactECharts
              option={barOption}
              style={{ height: '300px', width: '100%' }}
              theme={isDark ? 'dark' : undefined}
            />
          )}
        </div>

        {/* Donut Gauge taking 1 col */}
        <div className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-[#333333] pt-4 lg:pt-0 lg:pl-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#cdc3d4] mb-2 text-center">
            Capacidad Global Almacén
          </h3>
          <ReactECharts
            option={donutOption}
            style={{ height: '240px', width: '100%' }}
            theme={isDark ? 'dark' : undefined}
          />
        </div>
      </div>
    </div>
  );
};
