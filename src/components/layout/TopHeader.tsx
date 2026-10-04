import React from 'react';
import { motion } from 'framer-motion';
import {
  Warehouse,
  Users,
  RefreshCw,
  Sun,
  Moon,
  Menu,
  Activity,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  BarChart3,
  ReceiptText,
  Database as DbIcon,
  Smartphone,
  Truck,
  Cloud,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TabType } from './Sidebar';
import { isGoogleDriveConfigured } from '@/lib/googleDriveService';
import { GoogleDriveConfigModal } from '@/components/common/GoogleDriveConfigModal';

interface TopHeaderProps {
  currentTab: TabType;
  isDark: boolean;
  onToggleTheme: () => void;
  almacenes: any[];
  selectedAlmacenId: string;
  onSelectAlmacen: (id: string) => void;
  clientes: any[];
  selectedClienteId: string;
  onSelectCliente: (id: string) => void;
  onOpenNuevoCliente?: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenMobileMenu?: () => void;
}

const TAB_TITLES: Record<TabType, { title: string; subtitle: string; icon: React.ElementType }> = {
  overview: {
    title: 'Tablero Operativo',
    subtitle: 'Métricas de almacenamiento y flujo en tiempo real',
    icon: Activity,
  },
  inventory: {
    title: 'Inventario & Gestión M3',
    subtitle: 'Existencias físicas valorizadas por cliente depositante',
    icon: Layers,
  },
  inbound: {
    title: 'Inbound / Recepciones',
    subtitle: 'Descarga, control de muelle y guardado en racks (Putaway)',
    icon: ArrowDownToLine,
  },
  outbound: {
    title: 'Picking & Despachos',
    subtitle: 'Preparación de pedidos, packing, remitos y hojas de ruta',
    icon: ArrowUpFromLine,
  },
  kardex: {
    title: 'Kardex & Trazabilidad',
    subtitle: 'Auditoría inmutable de movimientos de stock',
    icon: History,
  },
  analytics: {
    title: 'Analítica & Reportes',
    subtitle: 'Rotación ABC, ocupación de racks y KPIs de rendimiento',
    icon: BarChart3,
  },
  billing: {
    title: 'Facturación & Liquidaciones',
    subtitle: 'Cálculo de estadía por m³*día y servicios operativos 3PL',
    icon: ReceiptText,
  },
  masters: {
    title: 'Maestros & ABMs',
    subtitle: 'Catálogos de depositantes, artículos, ubicaciones y lotes',
    icon: DbIcon,
  },
  rf: {
    title: 'Terminal Colector RF',
    subtitle: 'Interfaz optimizada para escáneres móviles de almacén',
    icon: Smartphone,
  },
  chofer: {
    title: 'Tablet Chofer & Ruteo',
    subtitle: 'Itinerario de reparto, navegación Google Maps y firma digital POD',
    icon: Truck,
  },
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentTab,
  isDark,
  onToggleTheme,
  almacenes,
  selectedAlmacenId,
  onSelectAlmacen,
  clientes,
  selectedClienteId,
  onSelectCliente,
  onOpenNuevoCliente,
  isRefreshing,
  onRefresh,
  onOpenMobileMenu,
}) => {
  const [gDriveModalOpen, setGDriveModalOpen] = React.useState(false);
  const currentInfo = TAB_TITLES[currentTab] || TAB_TITLES.overview;
  const TabIcon = currentInfo.icon;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 dark:border-[#2d2c2c] bg-white/95 dark:bg-[#161515]/95 backdrop-blur-md shadow-xs transition-colors duration-200">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-3 sm:gap-4">
          {/* Left: Mobile Menu Toggle & Breadcrumb / Current Tab Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {onOpenMobileMenu && (
              <button
                onClick={onOpenMobileMenu}
                aria-label="Abrir menú"
                className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-[#333333] text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100 dark:hover:bg-[#201f1f] transition-colors"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-[#241138] border border-violet-200 dark:border-[#522b7c] text-violet-600 dark:text-[#dab9ff] flex items-center justify-center shrink-0 shadow-xs">
                <TabIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-[#e5e2e1] truncate tracking-tight">
                  {currentInfo.title}
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-[#978d9d] truncate hidden md:block">
                  {currentInfo.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Center / Right: Quick Selectors (Warehouse & Client) */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Almacén selector */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#1a1919] text-xs hover:border-slate-300 dark:hover:border-[#4b4452] transition-colors shadow-xs">
              <Warehouse className="w-3.5 h-3.5 text-slate-500 dark:text-[#cdc3d4] shrink-0" />
              <select
                id="header-almacen-select"
                aria-label="Seleccionar Almacén"
                value={selectedAlmacenId}
                onChange={(e) => onSelectAlmacen(e.target.value)}
                className="bg-transparent border-none text-slate-800 dark:text-[#e5e2e1] font-medium text-xs focus:outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="" className="bg-white dark:bg-[#1c1b1b] text-slate-800 dark:text-[#e5e2e1]">
                  Todos los Almacenes
                </option>
                {almacenes.map((alm) => (
                  <option key={alm.id} value={alm.id} className="bg-white dark:bg-[#1c1b1b] text-slate-800 dark:text-[#e5e2e1]">
                    {alm.nombre} ({alm.codigo})
                  </option>
                ))}
              </select>
            </div>

            {/* Cliente Depositante selector */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#1a1919] text-xs hover:border-slate-300 dark:hover:border-[#4b4452] transition-colors shadow-xs">
              <Users className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff] shrink-0" />
              <select
                id="header-cliente-select"
                aria-label="Filtrar por Cliente 3PL"
                value={selectedClienteId}
                onChange={(e) => {
                  if (e.target.value === '__NEW_CLIENT__') {
                    if (onOpenNuevoCliente) onOpenNuevoCliente();
                    return;
                  }
                  onSelectCliente(e.target.value);
                }}
                className="bg-transparent border-none text-slate-800 dark:text-[#e5e2e1] font-medium text-xs focus:outline-none cursor-pointer max-w-[170px] truncate"
              >
                <option value="__NEW_CLIENT__" className="bg-violet-50 dark:bg-[#241138] text-violet-700 dark:text-[#dab9ff] font-bold">
                  ✨ + Registrar nuevo cliente...
                </option>
                <option value="" className="bg-white dark:bg-[#1c1b1b] text-slate-800 dark:text-[#e5e2e1]">
                  Todos los Clientes 3PL
                </option>
                {clientes.map((cli) => (
                  <option key={cli.id} value={cli.id} className="bg-white dark:bg-[#1c1b1b] text-slate-800 dark:text-[#e5e2e1]">
                    {cli.razon_social} ({cli.codigo})
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Actualizar datos"
              aria-label="Actualizar datos"
              className={cn(
                'p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-[#333333] text-slate-600 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#1a1919]',
                'hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:border-slate-300 dark:hover:border-[#4b4452] hover:bg-slate-100 dark:hover:bg-[#201f1f] transition-colors shadow-xs',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', isRefreshing && 'animate-spin text-violet-600 dark:text-[#dab9ff]')}
              />
            </motion.button>

            {/* Theme toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleTheme}
              title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-[#333333] text-slate-600 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#1a1919] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:border-slate-300 dark:hover:border-[#4b4452] hover:bg-slate-100 dark:hover:bg-[#201f1f] transition-all shadow-xs"
            >
              {isDark ? (
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
              ) : (
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-600 drop-shadow-[0_0_6px_rgba(124,58,237,0.35)]" />
              )}
            </motion.button>

            {/* Google Drive Status & Config Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setGDriveModalOpen(true)}
              title={
                isGoogleDriveConfigured()
                  ? 'Google Drive Conectado (Carpeta: OpenWMS_Documentos)'
                  : 'Configurar Google Drive para fotos y remitos'
              }
              aria-label="Google Drive"
              className={cn(
                'p-1.5 sm:p-2 rounded-lg border transition-colors shadow-xs flex items-center gap-1.5',
                isGoogleDriveConfigured()
                  ? 'border-emerald-500/30 dark:border-[#1b5037] text-emerald-700 dark:text-[#69f0ae] bg-emerald-50 dark:bg-[#0f281e] hover:bg-emerald-100 dark:hover:bg-[#16382a]'
                  : 'border-slate-200 dark:border-[#333333] text-slate-600 dark:text-[#cdc3d4] bg-slate-50 dark:bg-[#1a1919] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:border-slate-300 dark:hover:border-[#4b4452]'
              )}
            >
              <Cloud className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', isGoogleDriveConfigured() ? 'text-emerald-600 dark:text-[#69f0ae]' : 'text-slate-400 dark:text-[#978d9d]')} />
              <span className="hidden xl:inline text-[11px] font-bold">
                {isGoogleDriveConfigured() ? 'Drive OK' : 'Google Drive'}
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Modal de Configuración de Google Drive */}
      <GoogleDriveConfigModal
        isOpen={gDriveModalOpen}
        onClose={() => setGDriveModalOpen(false)}
      />
    </header>
  );
};
