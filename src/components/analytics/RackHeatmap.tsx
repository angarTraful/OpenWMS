import React, { useState, useEffect, useMemo } from 'react';
import {
  Grid,
  Warehouse,
  Box,
  Layers,
  Info,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw,
  Search,
  Filter,
  X,
  ExternalLink,
} from 'lucide-react';
import { formatM3, formatNumber } from '@/lib/utils';
import { almacenApi, Ubicacion } from '@/api/almacenApi';

interface RackHeatmapProps {
  almacenes: any[];
  selectedAlmacenId?: string;
  inventario: any[];
}

export const RackHeatmap: React.FC<RackHeatmapProps> = ({
  almacenes,
  selectedAlmacenId,
  inventario,
}) => {
  const [almacenId, setAlmacenId] = useState<string>('');
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPasillo, setSelectedPasillo] = useState<string>('todos');
  const [selectedUbicacion, setSelectedUbicacion] = useState<any | null>(null);
  const [filtroOcupacion, setFiltroOcupacion] = useState<'todos' | 'vacia' | 'parcial' | 'llena' | 'bloqueada'>('todos');

  // Sync warehouse selection
  useEffect(() => {
    if (selectedAlmacenId) {
      setAlmacenId(selectedAlmacenId);
    } else if (almacenes.length > 0 && !almacenId) {
      setAlmacenId(almacenes[0].id);
    }
  }, [selectedAlmacenId, almacenes]);

  // Fetch locations for current warehouse
  useEffect(() => {
    if (!almacenId) return;

    const cargarUbicaciones = async () => {
      setLoading(true);
      try {
        const data = await almacenApi.listarUbicacionesPorAlmacen(almacenId);
        setUbicaciones(data || []);
      } catch (err) {
        console.error('Error cargando ubicaciones para heatmap:', err);
      } finally {
        setLoading(false);
      }
    };

    cargarUbicaciones();
  }, [almacenId]);

  // Map inventory by location id
  const inventarioPorUbicacion = useMemo(() => {
    const map = new Map<string, any[]>();
    inventario.forEach((item) => {
      if (!item.ubicacion_id) return;
      const list = map.get(item.ubicacion_id) || [];
      list.push(item);
      map.set(item.ubicacion_id, list);
    });
    return map;
  }, [inventario]);

  // Enriched locations with real occupancy calculation
  const ubicacionesEnriquecidas = useMemo(() => {
    return ubicaciones.map((u) => {
      const items = inventarioPorUbicacion.get(u.id) || [];
      const m3Ocupados = items.reduce((acc, it) => acc + Number(it.volumen_m3 || 0), 0);
      const bultosTotales = items.reduce((acc, it) => acc + Number(it.cantidad_disponible || 0), 0);
      const capacidadM3 = Number(u.capacidad_volumen_m3) || 2.0; // default 2.0 M3 standard pallet
      const porcentaje = Math.min(100, Math.round((m3Ocupados / capacidadM3) * 100));

      let estadoLlenado: 'vacia' | 'parcial' | 'llena' | 'bloqueada' = 'vacia';
      if (u.estado === 'bloqueada') {
        estadoLlenado = 'bloqueada';
      } else if (porcentaje >= 85) {
        estadoLlenado = 'llena';
      } else if (porcentaje > 0) {
        estadoLlenado = 'parcial';
      }

      // Parse pasillo, estante, nivel if not explicitly stored
      let pasilloStr = u.pasillo || '';
      let estanteStr = u.estante || '';
      let nivelStr = u.nivel || '';

      if (!pasilloStr && u.codigo_etiqueta) {
        const parts = u.codigo_etiqueta.split('-');
        parts.forEach((p: string) => {
          if (p.startsWith('P')) pasilloStr = p;
          else if (p.startsWith('E')) estanteStr = p;
          else if (p.startsWith('N')) nivelStr = p;
        });
      }

      return {
        ...u,
        items,
        m3Ocupados: Math.round(m3Ocupados * 10000) / 10000,
        capacidadM3,
        porcentaje,
        bultosTotales,
        estadoLlenado,
        pasilloNormalizado: pasilloStr || 'P01',
        estanteNormalizado: estanteStr || 'E01',
        nivelNormalizado: nivelStr || 'N01',
      };
    });
  }, [ubicaciones, inventarioPorUbicacion]);

  // Distinct pasillos for tabs
  const pasillosDisponibles = useMemo(() => {
    const set = new Set<string>();
    ubicacionesEnriquecidas.forEach((u) => set.add(u.pasilloNormalizado));
    return Array.from(set).sort();
  }, [ubicacionesEnriquecidas]);

  // Filtered locations
  const ubicacionesFiltradas = useMemo(() => {
    return ubicacionesEnriquecidas.filter((u) => {
      if (selectedPasillo !== 'todos' && u.pasilloNormalizado !== selectedPasillo) return false;
      if (filtroOcupacion !== 'todos' && u.estadoLlenado !== filtroOcupacion) return false;
      return true;
    });
  }, [ubicacionesEnriquecidas, selectedPasillo, filtroOcupacion]);

  // Distinct levels and racks for matrix view
  const nivelesDisponibles = useMemo(() => {
    const set = new Set<string>();
    ubicacionesFiltradas.forEach((u) => set.add(u.nivelNormalizado));
    return Array.from(set).sort().reverse(); // Highest level on top
  }, [ubicacionesFiltradas]);

  const estantesDisponibles = useMemo(() => {
    const set = new Set<string>();
    ubicacionesFiltradas.forEach((u) => set.add(u.estanteNormalizado));
    return Array.from(set).sort();
  }, [ubicacionesFiltradas]);

  // Global slot metrics
  const metricasSlots = useMemo(() => {
    const total = ubicacionesEnriquecidas.length;
    if (total === 0) return { vacias: 0, parciales: 0, llenas: 0, bloqueadas: 0, ocupacionGlobalPct: 0 };

    const vacias = ubicacionesEnriquecidas.filter((u) => u.estadoLlenado === 'vacia').length;
    const parciales = ubicacionesEnriquecidas.filter((u) => u.estadoLlenado === 'parcial').length;
    const llenas = ubicacionesEnriquecidas.filter((u) => u.estadoLlenado === 'llena').length;
    const bloqueadas = ubicacionesEnriquecidas.filter((u) => u.estadoLlenado === 'bloqueada').length;

    const totalCapM3 = ubicacionesEnriquecidas.reduce((acc, u) => acc + u.capacidadM3, 0);
    const totalOcupM3 = ubicacionesEnriquecidas.reduce((acc, u) => acc + u.m3Ocupados, 0);
    const ocupacionGlobalPct = totalCapM3 > 0 ? Math.round((totalOcupM3 / totalCapM3) * 100) : 0;

    return { vacias, parciales, llenas, bloqueadas, ocupacionGlobalPct, total };
  }, [ubicacionesEnriquecidas]);

  const getColorClass = (estado: string) => {
    switch (estado) {
      case 'vacia':
        return 'bg-[#0f241a] border-[#1b4332] text-[#69f0ae] hover:bg-[#153426]';
      case 'parcial':
        return 'bg-[#38260a] border-[#7a4c10] text-[#ffddb8] hover:bg-[#4a3410]';
      case 'llena':
        return 'bg-[#28153c] border-[#6b21a8] text-[#dab9ff] hover:bg-[#3b1d5c]';
      case 'bloqueada':
        return 'bg-[#381015] border-[#690005] text-[#ffb4ab] hover:bg-[#4a181e]';
      default:
        return 'bg-[#131313] border-[#333333] text-[#cdc3d4]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#cdc3d4] uppercase font-medium">Ocupación Almacén</span>
          <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-1">
            {metricasSlots.ocupacionGlobalPct}%
          </div>
          <div className="w-full bg-[#131313] rounded-full h-1.5 mt-2">
            <div
              className="bg-[#dab9ff] h-1.5 rounded-full"
              style={{ width: `${metricasSlots.ocupacionGlobalPct}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#69f0ae] uppercase font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#69f0ae]" />
            Slots Vacíos
          </span>
          <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-1">
            {metricasSlots.vacias}
          </div>
          <span className="text-[10px] text-[#cdc3d4]">Listos para Putaway</span>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#ffddb8] uppercase font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ffddb8]" />
            Slots Parciales
          </span>
          <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-1">
            {metricasSlots.parciales}
          </div>
          <span className="text-[10px] text-[#cdc3d4]">&lt; 85% de capacidad</span>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#dab9ff] uppercase font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#dab9ff]" />
            Slots Llenos
          </span>
          <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-1">
            {metricasSlots.llenas}
          </div>
          <span className="text-[10px] text-[#cdc3d4]">≥ 85% de capacidad</span>
        </div>

        <div className="p-4 rounded-md bg-[#1c1b1b] border border-[#333333]">
          <span className="text-[11px] text-[#ffb4ab] uppercase font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ffb4ab]" />
            Slots Bloqueados
          </span>
          <div className="text-xl font-bold font-mono text-[#e5e2e1] mt-1">
            {metricasSlots.bloqueadas}
          </div>
          <span className="text-[10px] text-[#cdc3d4]">Cuarentena / Dañados</span>
        </div>
      </div>

      {/* Filter and Pasillos Ribbon */}
      <div className="bg-[#1c1b1b] border border-[#333333] rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Pasillos Selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-[#e5e2e1] whitespace-nowrap">
            Pasillo / Rack:
          </span>
          <button
            onClick={() => setSelectedPasillo('todos')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              selectedPasillo === 'todos'
                ? 'bg-[#dab9ff] text-[#460283]'
                : 'bg-[#131313] text-[#cdc3d4] border border-[#333333] hover:text-[#e5e2e1]'
            }`}
          >
            Todos
          </button>
          {pasillosDisponibles.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPasillo(p)}
              className={`px-3 py-1.5 rounded text-xs font-semibold font-mono transition-colors ${
                selectedPasillo === p
                  ? 'bg-[#dab9ff] text-[#460283]'
                  : 'bg-[#131313] text-[#cdc3d4] border border-[#333333] hover:text-[#e5e2e1]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* State Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#cdc3d4] font-medium">Estado:</span>
          <select
            value={filtroOcupacion}
            onChange={(e) => setFiltroOcupacion(e.target.value as any)}
            className="px-3 py-1.5 rounded bg-[#131313] border border-[#333333] text-xs text-[#e5e2e1] font-medium focus:outline-none focus:border-[#dab9ff]"
          >
            <option value="todos">Todas las Posiciones</option>
            <option value="vacia">🟢 Vacías (0%)</option>
            <option value="parcial">🟡 Parciales (&lt; 85%)</option>
            <option value="llena">🟣 Llenas (≥ 85%)</option>
            <option value="bloqueada">🔴 Bloqueadas</option>
          </select>
        </div>
      </div>

      {/* Main Heatmap Matrix and Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Heatmap 2D Grid */}
        <div className={selectedUbicacion ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <div className="bg-[#1c1b1b] border border-[#333333] rounded-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#e5e2e1] flex items-center gap-2">
                  <Grid className="w-4 h-4 text-[#dab9ff]" />
                  Elevación de Racks (Nivel Vertical x Módulo Horizontal)
                </h3>
                <p className="text-xs text-[#cdc3d4]">
                  Haz clic en cualquier celda para inspeccionar el pallet LPN, cliente y artículos alojados.
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[#cdc3d4] font-mono">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#0f241a] border border-[#1b4332]" /> Vacío
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#38260a] border border-[#7a4c10]" /> Parcial
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#28153c] border border-[#6b21a8]" /> Lleno
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-[#cdc3d4]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#dab9ff]" />
                <span className="text-xs">Cargando mapa de calor de racks...</span>
              </div>
            ) : ubicacionesFiltradas.length === 0 ? (
              <div className="py-16 text-center text-[#cdc3d4]">
                No hay ubicaciones registradas que coincidan con los filtros.
              </div>
            ) : (
              <div className="overflow-x-auto py-2">
                <div className="min-w-[650px] space-y-3">
                  {nivelesDisponibles.map((nivel) => (
                    <div key={nivel} className="flex items-center gap-3">
                      {/* Level Indicator on Left */}
                      <div className="w-16 flex-shrink-0 text-right pr-2">
                        <span className="font-mono text-xs font-bold text-[#cdc3d4]">
                          {nivel}
                        </span>
                      </div>

                      {/* Rack Slots Row */}
                      <div className="flex-1 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                        {estantesDisponibles.map((estante) => {
                          const slot = ubicacionesFiltradas.find(
                            (u) =>
                              u.nivelNormalizado === nivel && u.estanteNormalizado === estante
                          );

                          if (!slot) {
                            return (
                              <div
                                key={estante}
                                className="h-16 rounded border border-dashed border-[#333333] bg-[#131313]/60 flex items-center justify-center text-[10px] text-[#cdc3d4]/40 font-mono"
                              >
                                -
                              </div>
                            );
                          }

                          const isSelected = selectedUbicacion?.id === slot.id;

                          return (
                            <button
                              key={slot.id}
                              onClick={() => setSelectedUbicacion(slot)}
                              className={`h-16 p-2 rounded border transition-all text-left flex flex-col justify-between cursor-pointer ${getColorClass(
                                slot.estadoLlenado
                              )} ${
                                isSelected ? 'ring-2 ring-[#dab9ff] scale-[1.03]' : ''
                              }`}
                              title={`${slot.codigo_etiqueta}: ${slot.porcentaje}% ocupado`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="font-mono font-bold text-[10px] truncate">
                                  {slot.codigo_etiqueta}
                                </span>
                                {slot.estadoLlenado === 'bloqueada' ? (
                                  <Lock className="w-3 h-3 text-[#ffb4ab]" />
                                ) : (
                                  <span className="font-mono text-[9px] font-bold">
                                    {slot.porcentaje}%
                                  </span>
                                )}
                              </div>

                              <div className="w-full bg-black/30 rounded-full h-1 mt-1 overflow-hidden">
                                <div
                                  className="h-full bg-current transition-all"
                                  style={{ width: `${slot.porcentaje}%` }}
                                />
                              </div>

                              <div className="flex justify-between items-center text-[9px] font-mono opacity-80 mt-0.5">
                                <span>{formatM3(slot.m3Ocupados)}</span>
                                <span>{slot.bultosTotales} b.</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Estantes Bottom Labels */}
                  <div className="flex items-center gap-3 pt-2 border-t border-[#333333]">
                    <div className="w-16 flex-shrink-0" />
                    <div className="flex-1 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 text-center">
                      {estantesDisponibles.map((e) => (
                        <span key={e} className="font-mono text-[10px] text-[#cdc3d4]">
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Slot Detail Drawer */}
        {selectedUbicacion && (
          <div className="lg:col-span-4 bg-[#1c1b1b] border border-[#333333] rounded-md p-5 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#333333] pb-3">
              <div>
                <span className="text-[10px] text-[#cdc3d4] uppercase font-bold block">
                  Inspección de Posición
                </span>
                <h4 className="text-base font-bold font-mono text-[#e5e2e1] flex items-center gap-2">
                  {selectedUbicacion.codigo_etiqueta}
                </h4>
              </div>
              <button
                onClick={() => setSelectedUbicacion(null)}
                className="p-1 rounded text-[#cdc3d4] hover:text-[#e5e2e1] hover:bg-[#201f1f] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Capacity Meter */}
            <div className="p-3.5 rounded bg-[#201f1f] border border-[#333333] space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-[#cdc3d4]">Ocupación Volumétrica:</span>
                <span className="font-mono text-[#dab9ff]">{selectedUbicacion.porcentaje}%</span>
              </div>
              <div className="w-full bg-[#131313] rounded-full h-2">
                <div
                  className="bg-[#dab9ff] h-2 rounded-full transition-all"
                  style={{ width: `${selectedUbicacion.porcentaje}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-[#cdc3d4] pt-1">
                <span>Ocupado: {formatM3(selectedUbicacion.m3Ocupados)}</span>
                <span>Capacidad: {formatM3(selectedUbicacion.capacidadM3)}</span>
              </div>
            </div>

            {/* Slot Attributes */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded bg-[#201f1f] border border-[#333333]">
                <span className="text-[10px] text-[#cdc3d4] block">Zona de Almacén:</span>
                <span className="font-semibold text-[#e5e2e1]">
                  {selectedUbicacion.zona?.nombre || 'Almacenamiento'}
                </span>
              </div>
              <div className="p-2.5 rounded bg-[#201f1f] border border-[#333333]">
                <span className="text-[10px] text-[#cdc3d4] block">Mezcla Clientes:</span>
                <span className="font-semibold text-[#e5e2e1]">
                  {selectedUbicacion.permite_mezcla_clientes ? 'Permitida' : 'Exclusiva'}
                </span>
              </div>
            </div>

            {/* Items Stored in this Slot */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-[#e5e2e1] flex items-center justify-between">
                <span>Contenido Actual ({selectedUbicacion.items?.length || 0})</span>
                <span className="font-mono text-[11px] text-[#cdc3d4] font-normal">
                  {selectedUbicacion.bultosTotales} bultos totales
                </span>
              </span>

              {selectedUbicacion.items?.length === 0 ? (
                <div className="p-6 rounded bg-[#0f241a] border border-[#1b4332] text-center text-xs text-[#69f0ae]">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1 opacity-80" />
                  Posición vacía disponible para ingreso.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {selectedUbicacion.items.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3 rounded bg-[#201f1f] border border-[#333333] text-xs space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-[#e5e2e1]">
                            {item.articulo?.nombre || 'Artículo'}
                          </div>
                          <span className="text-[10px] font-mono text-[#cdc3d4]">
                            SKU: {item.articulo?.sku}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[#dab9ff] text-sm">
                          {item.cantidad_disponible} un.
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-[#cdc3d4] pt-1 border-t border-[#333333]">
                        <span>Lote: {item.lote?.numero_lote || 'S/L'}</span>
                        {item.pallet?.codigo_lpn && (
                          <span className="text-[#dab9ff] font-semibold">
                            LPN: {item.pallet.codigo_lpn}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-[#cdc3d4] truncate">
                        Cliente: <b className="text-[#e5e2e1]">{item.cliente?.razon_social}</b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
