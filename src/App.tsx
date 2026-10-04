import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  TrendingUp,
  AlertCircle,
  Database as DbIcon,
  ShieldCheck,
  Building2,
  Box,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Sidebar, TabType } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { KpiCard } from './components/ui/KpiCard';
import { PageTransition } from './components/ui/PageTransition';
import { StorageVolumeChart } from './components/charts/StorageVolumeChart';
import { FlowTrendsChart } from './components/charts/FlowTrendsChart';
import { InventoryTable } from './components/inventory/InventoryTable';
import { PalletDetailPanel } from './components/inventory/PalletDetailPanel';
import { InboundMonitor } from './components/inbound/InboundMonitor';
import { OutboundMonitor } from './components/outbound/OutboundMonitor';
import { KardexView } from './components/kardex/KardexView';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard';
import { BillingSettlementView } from './components/billing/BillingSettlementView';
import { MastersManagementView } from './components/masters/MastersManagementView';
import { ClienteModal } from './components/masters/ClienteModal';
import { RfTerminalView } from './components/rf/RfTerminalView';
import { ChoferRutaTabletView } from './components/outbound/ChoferRutaTabletView';


import {
  clientesApi,
  almacenApi,
  inventarioApi,
  recepcionesApi,
  pedidosApi,
  despachosApi,
} from './api';
import { formatM3, formatNumber } from './lib/utils';

export function App() {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('openwms-theme');
      if (saved === 'light') return false;
      if (saved === 'dark') return true;
    } catch {}
    return document.documentElement.classList.contains('dark');
  });

  // Keep DOM class and localStorage in sync
  useEffect(() => {
    try {
      if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('openwms-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('openwms-theme', 'light');
      }
    } catch (e) {
      console.error('Error syncing theme:', e);
    }
  }, [isDark]);

  // Theme toggle
  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<TabType>('overview');

  // Sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Selectors
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [selectedAlmacenId, setSelectedAlmacenId] = useState<string>('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [modalNuevoClienteGlobalOpen, setModalNuevoClienteGlobalOpen] = useState(false);
  const [choferSelectedRutaId, setChoferSelectedRutaId] = useState<string | null>(null);

  // Operational Data
  const [inventario, setInventario] = useState<any[]>([]);
  const [recepciones, setRecepciones] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [ordenesSalida, setOrdenesSalida] = useState<any[]>([]);
  const [kardex, setKardex] = useState<any[]>([]);
  const [kardexFiltroArticuloId, setKardexFiltroArticuloId] = useState<string | null>(null);

  // Selected item for Master-Detail side panel
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any | null>(null);

  // Loading & status
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load master data: almacenes & clientes
  useEffect(() => {
    Promise.all([almacenApi.listarAlmacenes(), clientesApi.listarClientes(false)])
      .then(([almList, cliList]) => {
        setAlmacenes(almList || []);
        if (almList && almList.length > 0) {
          setSelectedAlmacenId(almList[0].id);
        }
        setClientes(cliList || []);
      })
      .catch((err) => {
        console.error('Error cargando catálogos iniciales:', err);
      });
  }, []);

  // Fetch all operational data
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const [invData, recData, pedData, osData, kdxData] = await Promise.all([
        inventarioApi.consultarStock({
          clienteId: selectedClienteId || undefined,
          almacenId: selectedAlmacenId || undefined,
        }),
        recepcionesApi.listarRecepciones(selectedClienteId || undefined),
        pedidosApi.listarPedidos(selectedClienteId || undefined),
        despachosApi.listarOrdenesSalida(),
        inventarioApi.consultarKardex(selectedClienteId || undefined, undefined, 500),
      ]);

      setInventario(invData || []);
      setRecepciones(recData || []);
      setPedidos(pedData || []);
      setOrdenesSalida(osData || []);
      setKardex(kdxData || []);
    } catch (err: any) {
      console.error('Error al consultar datos de Supabase:', err);
      setErrorMessage(err.message || 'Error de conexión con la base de datos de OpenWMS');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedClienteId, selectedAlmacenId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cubic Volume aggregation by client for 3PL billing
  const volumeByClient = useMemo(() => {
    const map = new Map<string, { totalM3: number; bultos: number; nombre: string }>();

    inventario.forEach((item) => {
      const cliNombre = item.cliente?.razon_social || 'Cliente General';
      const m3 = Number(item.volumen_m3 || 0);
      const bultos = Number(item.cantidad_disponible || 0);

      const existing = map.get(cliNombre) || { totalM3: 0, bultos: 0, nombre: cliNombre };
      existing.totalM3 += m3;
      existing.bultos += bultos;
      map.set(cliNombre, existing);
    });

    const totalGlobal = Array.from(map.values()).reduce((acc, v) => acc + v.totalM3, 0);

    return Array.from(map.values())
      .map((item) => ({
        clienteNombre: item.nombre,
        totalM3: Number(item.totalM3.toFixed(3)),
        totalBultos: item.bultos,
        porcentaje: totalGlobal > 0 ? Number(((item.totalM3 / totalGlobal) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.totalM3 - a.totalM3);
  }, [inventario]);

  // Overall KPIs
  const totalMercaderia = useMemo(() => {
    return inventario.reduce(
      (acc, item) => acc + Number(item.cantidad_disponible || 0) + Number(item.cantidad_reservada || 0),
      0
    );
  }, [inventario]);

  const totalBultosDisponibles = useMemo(() => {
    return inventario.reduce((acc, item) => acc + Number(item.cantidad_disponible || 0), 0);
  }, [inventario]);

  const totalM3Ocupados = useMemo(() => {
    return inventario.reduce((acc, item) => acc + Number(item.volumen_m3 || 0), 0);
  }, [inventario]);

  const totalPalletsLpn = useMemo(() => {
    const lpns = new Set<string>();
    inventario.forEach((item) => {
      if (item.pallet?.codigo_lpn) lpns.add(item.pallet.codigo_lpn);
    });
    return lpns.size;
  }, [inventario]);

  const recepcionesActivas = useMemo(() => {
    return recepciones.filter((r) => r.estado !== 'finalizada' && r.estado !== 'cancelada').length;
  }, [recepciones]);

  const pedidosPendientes = useMemo(() => {
    return pedidos.filter((p) => p.estado !== 'despachado').length;
  }, [pedidos]);

  const flowData = useMemo(() => {
    const recPend = recepciones.filter((r) => r.estado !== 'finalizada').length;
    const recFin = recepciones.filter((r) => r.estado === 'finalizada').length;
    const pedPend = pedidos.filter((p) => p.estado === 'solicitado' || p.estado === 'en_picking').length;
    const pedSep = pedidos.filter((p) => p.estado === 'separado' || p.estado === 'despachado').length;
    const remEmit = ordenesSalida.reduce((acc, os) => acc + (os.remitos?.length || 0), 0);

    return {
      recepcionesPendientes: recPend,
      recepcionesFinalizadas: recFin,
      pedidosPendientes: pedPend,
      pedidosSeparados: pedSep,
      remitosEmitidos: remEmit,
    };
  }, [recepciones, pedidos, ordenesSalida]);

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#131313] text-[#0f172a] dark:text-[#e5e2e1] flex selection:bg-purple-500/25 selection:text-purple-700 dark:selection:bg-[#dab9ff]/25 dark:selection:text-[#dab9ff] transition-colors duration-200">
      {/* Left Sidebar Menu */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          currentTab={currentTab}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          almacenes={almacenes}
          selectedAlmacenId={selectedAlmacenId}
          onSelectAlmacen={setSelectedAlmacenId}
          clientes={clientes}
          selectedClienteId={selectedClienteId}
          onSelectCliente={setSelectedClienteId}
          onOpenNuevoCliente={() => setModalNuevoClienteGlobalOpen(true)}
          isRefreshing={isRefreshing}
          onRefresh={fetchData}
        />

        <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Error Alert if any */}
          {errorMessage && (
            <div className="p-3.5 rounded border border-[#690005] bg-[#2a0e12] flex items-center justify-between text-[#ffb4ab] text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#ffb4ab]" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={fetchData}
                className="px-2.5 py-1 rounded bg-[#93000a] hover:bg-[#690005] text-[#ffdad6] font-medium"
              >
                Reintentar
              </button>
            </div>
          )}

        {/* Dynamic Tab Views with AnimatePresence & PageTransition */}
        <AnimatePresence>
          <PageTransition key={currentTab}>
            {currentTab === 'overview' && (
              <div className="space-y-6">
                {/* Tablero Operativo KPIs */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <KpiCard
                    title="Total Mercadería"
                    value={formatNumber(totalMercaderia, 0)}
                    subtitle={`${formatNumber(totalBultosDisponibles, 0)} disponibles`}
                    icon={Package}
                    delay={0}
                    highlight={true}
                    trend={{
                      value: `${inventario.length} líneas`,
                      isPositive: true,
                      label: 'Stock en Almacén',
                    }}
                  />

                  <KpiCard
                    title="Volumen 3PL Ocupado"
                    value={formatM3(totalM3Ocupados)}
                    subtitle="Espacio físico ocupado en almacén"
                    icon={Box}
                    delay={0.05}
                    trend={{
                      value: `${((totalM3Ocupados / 5000) * 100).toFixed(1)}%`,
                      isPositive: totalM3Ocupados < 4500,
                      label: 'Capacidad Almacén',
                    }}
                  />

                  <KpiCard
                    title="Pallets LPN Activos"
                    value={formatNumber(totalPalletsLpn, 0)}
                    subtitle="Posiciones paletizadas en racks"
                    icon={Layers}
                    delay={0.1}
                    trend={{
                      value: '+4 hoy',
                      isPositive: true,
                      label: 'Flujo de Guardado',
                    }}
                  />

                  <KpiCard
                    title="Inbound en Curso"
                    value={formatNumber(recepcionesActivas, 0)}
                    subtitle="Contenedores y OC en playa/descarga"
                    icon={ArrowDownToLine}
                    delay={0.15}
                    trend={{
                      value: `${recepciones.length} totales`,
                      isNeutral: true,
                      label: 'Órdenes Arribadas',
                    }}
                  />

                  <KpiCard
                    title="Pedidos & Picking"
                    value={formatNumber(pedidosPendientes, 0)}
                    subtitle="Órdenes de clientes para recolección"
                    icon={ArrowUpFromLine}
                    delay={0.2}
                    trend={{
                      value: `${flowData.pedidosSeparados} listos`,
                      isPositive: true,
                      label: 'Listos para Despacho',
                    }}
                  />
                </section>

                {/* Storage Volume per Client Chart (1 per row analytical standard) */}
                <StorageVolumeChart
                  data={volumeByClient}
                  capacidadTotalM3={5000}
                  isDark={isDark}
                />

                {/* Operational Flow Funnel Chart */}
                <FlowTrendsChart data={flowData} isDark={isDark} />

                {/* Quick Preview of Active Stock */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#cdc3d4] flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-[#dab9ff]" />
                      Existencias Destacadas en Depósito
                    </h3>
                    <button
                      onClick={() => setCurrentTab('inventory')}
                      className="text-xs font-medium text-[#dab9ff] hover:text-[#eedbff] transition-colors"
                    >
                      Abrir Módulo Completo de Inventario &rarr;
                    </button>
                  </div>

                  <InventoryTable
                    items={inventario.slice(0, 10)}
                    selectedItem={selectedInventoryItem}
                    onSelectItem={(item) => {
                      setSelectedInventoryItem(item);
                      setCurrentTab('inventory');
                    }}
                    isLoading={isLoading}
                  />
                </div>
              </div>
            )}

            {currentTab === 'inventory' && (
              <div className="w-full space-y-4">
                <InventoryTable
                  items={inventario}
                  selectedItem={selectedInventoryItem}
                  onSelectItem={(item) =>
                    setSelectedInventoryItem(
                      selectedInventoryItem?.id === item.id ? null : item
                    )
                  }
                  onViewKardex={(cliId, artId) => {
                    if (cliId) setSelectedClienteId(cliId);
                    setKardexFiltroArticuloId(artId || null);
                    setCurrentTab('kardex');
                  }}
                  isLoading={isLoading}
                />

                {selectedInventoryItem && (
                  <PalletDetailPanel
                    item={selectedInventoryItem}
                    onClose={() => setSelectedInventoryItem(null)}
                    onViewKardex={(cliId, artId) => {
                      if (cliId) setSelectedClienteId(cliId);
                      setKardexFiltroArticuloId(artId || null);
                      setCurrentTab('kardex');
                    }}
                  />
                )}
              </div>
            )}

            {currentTab === 'inbound' && (
              <InboundMonitor
                recepciones={recepciones}
                onRefresh={fetchData}
                isDark={isDark}
                almacenes={almacenes}
                clientes={clientes}
                selectedAlmacenId={selectedAlmacenId}
                selectedClienteId={selectedClienteId}
              />
            )}

            {currentTab === 'outbound' && (
              <OutboundMonitor
                pedidos={pedidos}
                ordenesSalida={ordenesSalida}
                onRefresh={fetchData}
                isDark={isDark}
                clientes={clientes}
                almacenes={almacenes}
                selectedClienteId={selectedClienteId}
                selectedAlmacenId={selectedAlmacenId}
                onOpenTabletChofer={(rutaId) => {
                  setChoferSelectedRutaId(rutaId || null);
                  setCurrentTab('chofer');
                }}
              />
            )}

            {currentTab === 'kardex' && (
              <KardexView
                movimientos={kardex}
                inventario={inventario}
                pedidos={pedidos}
                onRefresh={fetchData}
                isLoading={isLoading}
                filtroArticuloId={kardexFiltroArticuloId}
                onClearArticuloFilter={() => setKardexFiltroArticuloId(null)}
              />
            )}

            {currentTab === 'analytics' && (
              <AnalyticsDashboard
                inventario={inventario}
                kardex={kardex}
                almacenes={almacenes}
                clientes={clientes}
                selectedAlmacenId={selectedAlmacenId}
                selectedClienteId={selectedClienteId}
                onRefresh={fetchData}
                isDark={isDark}
              />
            )}

            {currentTab === 'billing' && (
              <BillingSettlementView
                clientes={clientes}
                selectedClienteId={selectedClienteId}
                onSelectCliente={setSelectedClienteId}
              />
            )}

            {currentTab === 'masters' && (
              <MastersManagementView
                clientes={clientes}
                almacenes={almacenes}
                selectedClienteId={selectedClienteId}
                selectedAlmacenId={selectedAlmacenId}
                onRefresh={fetchData}
              />
            )}

            {currentTab === 'rf' && (
              <RfTerminalView
                almacenes={almacenes}
                selectedAlmacenId={selectedAlmacenId}
                onExitTerminal={() => setCurrentTab('overview')}
              />
            )}

            {currentTab === 'chofer' && (
              <ChoferRutaTabletView
                initialRutaId={choferSelectedRutaId || undefined}
                onBack={() => setCurrentTab('outbound')}
                almacenes={almacenes}
              />
            )}
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Footer (Oculto en Terminal RF y Tablet Chofer para maximizar pantalla del dispositivo) */}
      {currentTab !== 'rf' && currentTab !== 'chofer' && (
        <footer className="border-t border-[#333333] bg-[#131313] py-4 mt-auto">
          <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#cdc3d4] gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#e5e2e1]">OpenWMS 3PL</span>
              <span>&bull;</span>
              <span>PostgreSQL 17 ACID Transaccional</span>
              <span>&bull;</span>
              <span className="font-mono text-[11px] text-[#dab9ff]">
                Cálculo M3 para Facturación de Espacio
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[#75d1ff]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#75d1ff]" />
                Sesión Segura RLS
              </span>
            </div>
          </div>
        </footer>
      )}
      </div>

      {/* Modal Global para Alta Rápida de Cliente Depositante */}
      <ClienteModal
        isOpen={modalNuevoClienteGlobalOpen}
        onClose={() => setModalNuevoClienteGlobalOpen(false)}
        cliente={null}
        onSuccess={fetchData}
        onCreated={(nuevoCli) => {
          setClientes((prev) => [...prev, nuevoCli]);
          setSelectedClienteId(nuevoCli.id);
        }}
      />
    </div>
  );
}


export default App;
