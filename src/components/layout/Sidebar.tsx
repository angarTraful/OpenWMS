import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Boxes,
  Warehouse,
  Users,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Activity,
  RefreshCw,
  BarChart3,
  ReceiptText,
  Database as DbIcon,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Sun,
  Moon,
  Sparkles,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabType =
  | 'overview'
  | 'inventory'
  | 'inbound'
  | 'outbound'
  | 'kardex'
  | 'analytics'
  | 'billing'
  | 'masters'
  | 'rf'
  | 'chofer';

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ElementType;
  isSpecial?: boolean;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const sections: NavSection[] = [
    {
      title: 'Operaciones',
      items: [
        { id: 'overview', label: 'Tablero Operativo', icon: Activity },
        { id: 'inventory', label: 'Inventario & M3', icon: Layers },
        { id: 'inbound', label: 'Inbound / Recepción', icon: ArrowDownToLine },
        { id: 'outbound', label: 'Picking & Despacho', icon: ArrowUpFromLine },
        { id: 'kardex', label: 'Kardex Trazabilidad', icon: History },
      ],
    },
    {
      title: 'Gestión & Costos',
      items: [
        { id: 'analytics', label: 'Analítica & Reportes', icon: BarChart3 },
        { id: 'billing', label: 'Facturación & M3', icon: ReceiptText },
        { id: 'masters', label: 'Maestros & ABMs', icon: DbIcon },
      ],
    },
    {
      title: 'Dispositivos',
      items: [
        { id: 'rf', label: 'Terminal RF', icon: Smartphone, isSpecial: true, badge: 'Móvil' },
        { id: 'chofer', label: 'Tablet Chofer', icon: Truck, isSpecial: true, badge: 'Android' },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 z-40 bg-white dark:bg-[#161515] border-r border-slate-200 dark:border-[#2d2c2c] flex flex-col justify-between transition-all duration-300 select-none shadow-md dark:shadow-2xl shrink-0',
        isCollapsed ? 'w-18' : 'w-64'
      )}
    >
      {/* Top Header / Brand Logo */}
      <div className="p-4 border-b border-slate-200 dark:border-[#2d2c2c] flex items-center justify-between">
        <div
          onClick={() => onTabChange('overview')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <motion.div
            whileHover={{ rotate: 8, scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 dark:from-[#dab9ff] dark:to-[#bb86fc] text-white dark:text-[#340066] shadow-md shadow-violet-500/20 dark:shadow-[#dab9ff]/20 shrink-0"
          >
            <Boxes className="w-5 h-5 stroke-[2.4]" />
          </motion.div>

          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-base text-slate-900 dark:text-[#e5e2e1] group-hover:text-violet-600 dark:group-hover:text-[#dab9ff] transition-colors">
                  OpenWMS
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-violet-50 dark:bg-[#241138] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#5a2e8c]">
                  3PL
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-[#978d9d] font-normal leading-tight mt-0.5 truncate">
                Gestión Logística & M3
              </p>
            </motion.div>
          )}
        </div>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-label={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
            className={cn(
              'p-1.5 rounded-lg border border-slate-200 dark:border-[#333333] text-slate-500 dark:text-[#978d9d] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100 dark:hover:bg-[#222121] hover:border-slate-300 dark:hover:border-[#4b4452] transition-colors',
              isCollapsed && 'mx-auto mt-2'
            )}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-[#2d2c2c]">
        {sections.map((section, sIdx) => (
          <div key={section.title || sIdx} className="space-y-1">
            {!isCollapsed ? (
              <h4 className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#797280]">
                {section.title}
              </h4>
            ) : (
              <div className="h-px bg-slate-200 dark:bg-[#2d2c2c] my-2 mx-1" />
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      'relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                      isActive
                        ? 'text-violet-700 dark:text-[#dab9ff] font-semibold bg-violet-50 dark:bg-gradient-to-r dark:from-[#29173d] dark:to-[#1c1426] border border-violet-200 dark:border-[#dab9ff]/30 shadow-xs'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100/80 dark:hover:bg-[#201f1f]',
                      isCollapsed && 'justify-center px-0'
                    )}
                  >
                    {/* Active Accent Bar on Left */}
                    {isActive && (
                      <motion.div
                        layoutId="activeSidebarIndicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-violet-600 dark:bg-[#dab9ff]"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}

                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-violet-600 dark:text-[#dab9ff]'
                          : 'text-slate-400 dark:text-[#978d9d] group-hover:text-slate-700 dark:group-hover:text-[#cdc3d4]'
                      )}
                    />

                    {!isCollapsed && (
                      <span className="flex-1 text-left truncate">{item.label}</span>
                    )}

                    {!isCollapsed && item.isSpecial && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-violet-100 dark:bg-[#dab9ff]/20 text-violet-700 dark:text-[#dab9ff] border border-violet-300 dark:border-[#dab9ff]/40">
                        {item.badge || 'RF'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Footer: System Status */}
      <div className="p-3 border-t border-slate-200 dark:border-[#2d2c2c] bg-slate-50/90 dark:bg-[#131313]/90">
        {!isCollapsed ? (
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#cdc3d4]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 dark:bg-[#75d1ff] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 dark:bg-[#75d1ff]" />
              </span>
              <span className="font-mono text-[10px] text-emerald-600 dark:text-[#75d1ff] font-semibold">PG-17 Live</span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-[#797280] font-mono">v1.2</span>
          </div>
        ) : (
          <div className="flex justify-center" title="PostgreSQL 17 ACID Activo">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 dark:bg-[#75d1ff] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 dark:bg-[#75d1ff]" />
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
