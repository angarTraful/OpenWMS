import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Filter,
  Search,
  HelpCircle,
  BarChart3,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { formatNumber, formatM3 } from '@/lib/utils';

interface AbcSlottingAuditProps {
  inventario: any[];
  kardex: any[];
  clientes: any[];
  selectedClienteId?: string;
}

export const AbcSlottingAudit: React.FC<AbcSlottingAuditProps> = ({
  inventario,
  kardex,
  clientes,
  selectedClienteId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroDesvio, setFiltroDesvio] = useState<'todos' | 'desvio' | 'alineado'>('todos');
  const [filtroRotacion, setFiltroRotacion] = useState<'todos' | 'A' | 'B' | 'C'>('todos');

  // Aggregate picking and putaway movements per article
  const metricasPorArticulo = useMemo(() => {
    const map = new Map<
      string,
      {
        articuloId: string;
        sku: string;
        nombre: string;
        clienteNombre: string;
        rotacionCatalogo: 'A' | 'B' | 'C';
        pickCount: number;
        pickQty: number;
        putawayQty: number;
        totalMovimientos: number;
        stockActual: number;
        volumenM3Actual: number;
        ubicacionesActuales: Set<string>;
      }
    >();

    // 1. First collect all articles from inventory
    inventario.forEach((inv) => {
      if (!inv.articulo_id) return;
      const art = inv.articulo;
      const id = inv.articulo_id;

      const existing = map.get(id) || {
        articuloId: id,
        sku: art?.sku || 'SKU',
        nombre: art?.nombre || 'Artículo',
        clienteNombre: inv.cliente?.razon_social || 'Cliente',
        rotacionCatalogo: (art?.rotacion_abc as any) || 'B',
        pickCount: 0,
        pickQty: 0,
        putawayQty: 0,
        totalMovimientos: 0,
        stockActual: 0,
        volumenM3Actual: 0,
        ubicacionesActuales: new Set<string>(),
      };

      existing.stockActual += Number(inv.cantidad_disponible || 0);
      existing.volumenM3Actual += Number(inv.volumen_m3 || 0);
      if (inv.ubicacion?.codigo_etiqueta) {
        existing.ubicacionesActuales.add(inv.ubicacion.codigo_etiqueta);
      }
      map.set(id, existing);
    });

    // 2. Count real movements from Kardex
    kardex.forEach((mov) => {
      if (!mov.articulo_id) return;
      const existing = map.get(mov.articulo_id);
      if (existing) {
        existing.totalMovimientos += 1;
        if (mov.tipo_movimiento === 'picking') {
          existing.pickCount += 1;
          existing.pickQty += Number(mov.cantidad || 0);
        } else if (mov.tipo_movimiento === 'putaway' || mov.tipo_movimiento === 'recepcion') {
          existing.putawayQty += Number(mov.cantidad || 0);
        }
      }
    });

    const list = Array.from(map.values());

    // 3. Sort by real activity (total movements + pick count) to calculate Pareto 80/20
    list.sort((a, b) => b.totalMovimientos - a.totalMovimientos);

    const totalSKUs = list.length;
    const top20Index = Math.max(1, Math.floor(totalSKUs * 0.2));
    const next30Index = Math.max(top20Index + 1, Math.floor(totalSKUs * 0.5));

    return list.map((item, idx) => {
      let rotacionReal: 'A' | 'B' | 'C' = 'C';
      if (item.totalMovimientos > 0) {
        if (idx < top20Index) {
          rotacionReal = 'A';
        } else if (idx < next30Index) {
          rotacionReal = 'B';
        } else {
          rotacionReal = 'C';
        }
      }

      // Check alignment and diagnose slotting
      const tieneDesvio = item.rotacionCatalogo !== rotacionReal;
      let diagnostico = 'Posición adecuada y alineada a su demanda.';
      let gravedad: 'ok' | 'alerta' | 'critico' = 'ok';
      let sugerencia = 'Mantener slotting actual.';

      if (item.rotacionCatalogo === 'C' && rotacionReal === 'A') {
        diagnostico = 'Ítem de muy alta rotación en Kardex catalogado como C.';
        gravedad = 'critico';
        sugerencia = 'Reubicar en Nivel 1 (Pick-to-clean) cerca de playa de despacho.';
      } else if (item.rotacionCatalogo === 'A' && (rotacionReal === 'C' || item.totalMovimientos === 0)) {
        diagnostico = 'Ítem A estancado sin picking reciente ocupando espacio privilegiado.';
        gravedad = 'alerta';
        sugerencia = 'Trasladar a Niveles altos (Nivel 3/4) y liberar slot rápido.';
      } else if (item.rotacionCatalogo === 'B' && rotacionReal === 'A') {
        diagnostico = 'Incremento notable de demanda en picking.';
        gravedad = 'alerta';
        sugerencia = 'Evaluar descenso de estante para acortar recorrido del operario.';
      }

      return {
        ...item,
        rotacionReal,
        tieneDesvio,
        diagnostico,
        gravedad,
        sugerencia,
        ubicacionesStr: Array.from(item.ubicacionesActuales).join(', ') || 'Sin rack asignado',
      };
    });
  }, [inventario, kardex]);

  // Overall statistics
  const estadisticas = useMemo(() => {
    const total = metricasPorArticulo.length;
    if (total === 0) return { total: 0, alineados: 0, desvios: 0, scoreAlineacion: 100, criticos: 0 };

    const alineados = metricasPorArticulo.filter((m) => !m.tieneDesvio).length;
    const desvios = metricasPorArticulo.filter((m) => m.tieneDesvio).length;
    const criticos = metricasPorArticulo.filter((m) => m.gravedad === 'critico').length;
    const scoreAlineacion = Math.round((alineados / total) * 100);

    return { total, alineados, desvios, scoreAlineacion, criticos };
  }, [metricasPorArticulo]);

  // Filtered table
  const articulosFiltrados = useMemo(() => {
    return metricasPorArticulo.filter((a) => {
      if (filtroDesvio === 'desvio' && !a.tieneDesvio) return false;
      if (filtroDesvio === 'alineado' && a.tieneDesvio) return false;
      if (filtroRotacion !== 'todos' && a.rotacionCatalogo !== filtroRotacion) return false;
      if (
        searchTerm &&
        !a.nombre.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !a.sku.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !a.clienteNombre.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [metricasPorArticulo, filtroDesvio, filtroRotacion, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Top Audit Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">
            Eficiencia de Slotting
          </span>
          <div className="text-2xl font-bold font-mono text-[#e5e2e1] mt-1">
            {estadisticas.scoreAlineacion}%
          </div>
          <p className="text-[10px] text-[#cdc3d4] mt-1">
            {estadisticas.alineados} de {estadisticas.total} artículos optimizados
          </p>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#ffb4ab] uppercase font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab]" />
            Desvíos Críticos de Demanda
          </span>
          <div className="text-2xl font-bold font-mono text-[#ffb4ab] mt-1">
            {estadisticas.criticos}
          </div>
          <p className="text-[10px] text-[#cdc3d4] mt-1">
            Artículos 'C' con alta demanda picking
          </p>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#ffddb8] uppercase font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#ffddb8]" />
            Reubicaciones Sugeridas
          </span>
          <div className="text-2xl font-bold font-mono text-[#ffddb8] mt-1">
            {estadisticas.desvios}
          </div>
          <p className="text-[10px] text-[#cdc3d4] mt-1">
            Ajustes para reducir tiempos de recorrido
          </p>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#75d1ff] uppercase font-medium flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5 text-[#75d1ff]" />
            Base de Kardex Auditada
          </span>
          <div className="text-2xl font-bold font-mono text-[#75d1ff] mt-1">
            {kardex.length}
          </div>
          <p className="text-[10px] text-[#cdc3d4] mt-1">
            Movimientos históricos analizados
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#1c1b1b] border border-[#333333] rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-[#cdc3d4] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por SKU, Nombre de artículo o Cliente depositante..."
              className="w-full pl-9 pr-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] focus:outline-none focus:border-[#dab9ff]"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#cdc3d4] font-medium">Diagnóstico:</span>
            <select
              value={filtroDesvio}
              onChange={(e) => setFiltroDesvio(e.target.value as any)}
              className="px-2.5 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] font-medium focus:border-[#dab9ff]"
            >
              <option value="todos">Todos los diagnósticos</option>
              <option value="desvio">⚠️ Solo con Desvío / Sugerencia</option>
              <option value="alineado">✓ Correctamente Alineados</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#cdc3d4] font-medium">Rotación Catálogo:</span>
            <select
              value={filtroRotacion}
              onChange={(e) => setFiltroRotacion(e.target.value as any)}
              className="px-2.5 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] font-medium focus:border-[#dab9ff]"
            >
              <option value="todos">Todas (A, B, C)</option>
              <option value="A">Clase A (Alta)</option>
              <option value="B">Clase B (Media)</option>
              <option value="C">Clase C (Baja)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-[#1c1b1b] border border-[#333333] rounded-md overflow-hidden">
        <div className="p-4 bg-[#201f1f] border-b border-[#333333] flex items-center justify-between">
          <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#ffddb8]" />
            Auditoría de Demanda vs Slotting en Racks ({articulosFiltrados.length} artículos)
          </span>
          <span className="text-[11px] text-[#cdc3d4] font-mono">
            Optimización de recorridos del operario de picking
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#201f1f] text-[#cdc3d4] border-b border-[#333333]">
              <tr>
                <th className="px-4 py-3 font-semibold">SKU / Artículo</th>
                <th className="px-4 py-3 font-semibold">Cliente Depositante</th>
                <th className="px-3 py-3 font-semibold text-center w-24">Catálogo</th>
                <th className="px-3 py-3 font-semibold text-center w-24">Kardex Real</th>
                <th className="px-3 py-3 font-semibold text-center w-24">Picks</th>
                <th className="px-3 py-3 font-semibold text-right w-24">Stock Actual</th>
                <th className="px-4 py-3 font-semibold">Ubicaciones Actuales</th>
                <th className="px-4 py-3 font-semibold">Sugerencia de Slotting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333333]">
              {articulosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#cdc3d4]">
                    No se encontraron artículos con los criterios seleccionados.
                  </td>
                </tr>
              ) : (
                articulosFiltrados.map((art) => (
                  <tr
                    key={art.articuloId}
                    className={`hover:bg-[#201f1f]/50 transition-colors ${
                      art.gravedad === 'critico'
                        ? 'bg-[#381015]/20'
                        : art.gravedad === 'alerta'
                        ? 'bg-[#38260a]/20'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#e5e2e1]">{art.nombre}</div>
                      <span className="text-[10px] font-mono text-[#cdc3d4]">SKU: {art.sku}</span>
                    </td>

                    <td className="px-4 py-3 text-[#cdc3d4]">{art.clienteNombre}</td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                          art.rotacionCatalogo === 'A'
                            ? 'bg-[#0f241a] text-[#69f0ae] border border-[#1b4332]'
                            : art.rotacionCatalogo === 'B'
                            ? 'bg-[#28153c] text-[#dab9ff] border border-[#6b21a8]'
                            : 'bg-[#131313] text-[#cdc3d4] border border-[#333333]'
                        }`}
                      >
                        {art.rotacionCatalogo}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                          art.rotacionReal === 'A'
                            ? 'bg-[#0f241a] text-[#69f0ae] border border-[#1b4332] font-extrabold'
                            : art.rotacionReal === 'B'
                            ? 'bg-[#28153c] text-[#dab9ff] border border-[#6b21a8]'
                            : 'bg-[#131313] text-[#cdc3d4] border border-[#333333]'
                        }`}
                      >
                        {art.rotacionReal}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center font-mono font-bold text-[#e5e2e1]">
                      {art.pickCount}
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-[#e5e2e1]">
                      {formatNumber(art.stockActual, 0)} b.
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-[#cdc3d4]">
                      {art.ubicacionesStr}
                    </td>

                    <td className="px-4 py-3">
                      {art.tieneDesvio ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ffddb8]">
                            <ArrowRight className="w-3.5 h-3.5 text-[#ffddb8]" />
                            <span>{art.sugerencia}</span>
                          </div>
                          <p className="text-[10px] text-[#cdc3d4]">{art.diagnostico}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-[#69f0ae] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Posición óptima</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
