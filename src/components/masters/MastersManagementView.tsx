import React, { useState } from 'react';
import { Building2, Package, MapPin, Database, Tag, Calendar, Truck } from 'lucide-react';
import type { Cliente } from '../../api/clientesApi';
import type { Almacen } from '../../api/almacenApi';
import { ClientesAbm } from './ClientesAbm';
import { ArticulosAbm } from './ArticulosAbm';
import { CategoriasAbm } from './CategoriasAbm';
import { DestinatariosAbm } from './DestinatariosAbm';
import { LotesAbm } from './LotesAbm';
import { UbicacionesAbm } from './UbicacionesAbm';

export type MasterSubTab = 'clientes' | 'articulos' | 'categorias' | 'destinatarios' | 'lotes' | 'ubicaciones';

interface MastersManagementViewProps {
  clientes: Cliente[];
  almacenes: Almacen[];
  selectedClienteId?: string;
  selectedAlmacenId?: string;
  onRefresh: () => void;
}

export const MastersManagementView: React.FC<MastersManagementViewProps> = ({
  clientes,
  almacenes,
  selectedClienteId,
  selectedAlmacenId,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<MasterSubTab>('clientes');

  const subTabs = [
    {
      id: 'clientes' as const,
      label: 'Clientes 3PL',
      icon: Building2,
      desc: 'Cuentas corrientes, CUIT y datos de contacto',
    },
    {
      id: 'articulos' as const,
      label: 'Artículos & SKUs',
      icon: Package,
      desc: 'Cubicaje M³, pesos, rotación ABC y embalajes',
    },
    {
      id: 'categorias' as const,
      label: 'Categorías & Familias',
      icon: Tag,
      desc: 'Clasificación de catálogo y subfamilias',
    },
    {
      id: 'destinatarios' as const,
      label: 'Destinatarios / Sucursales',
      icon: Truck,
      desc: 'Puntos de entrega, direcciones y horarios',
    },
    {
      id: 'lotes' as const,
      label: 'Lotes & Cuarentena',
      icon: Calendar,
      desc: 'Control FEFO, vencimientos y bloqueos',
    },
    {
      id: 'ubicaciones' as const,
      label: 'Ubicaciones & Racks',
      icon: MapPin,
      desc: 'Layout de pasillos, estantes, niveles y capacidades',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-[#333333] gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e2e1] uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-[#dab9ff]" />
            Administración de Maestros & ABMs Operativos
          </h2>
          <p className="text-xs text-[#cdc3d4] mt-0.5">
            Configuración y mantenimiento de catálogos base para operaciones logísticas, control de stock y facturación 3PL
          </p>
        </div>

        {/* Sub-tab Navigation Pills */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-md bg-[#1c1b1b] border border-[#333333]">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#dab9ff] text-[#460283] shadow-sm'
                    : 'text-[#cdc3d4] hover:text-[#e5e2e1] hover:bg-[#201f1f]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main SubTab Content */}
      <div className="animate-fadeIn">
        {activeSubTab === 'clientes' && (
          <ClientesAbm onRefreshParent={onRefresh} />
        )}

        {activeSubTab === 'articulos' && (
          <ArticulosAbm
            clientes={clientes}
            selectedClienteId={selectedClienteId}
            onRefreshParent={onRefresh}
          />
        )}

        {activeSubTab === 'categorias' && (
          <CategoriasAbm onRefreshParent={onRefresh} />
        )}

        {activeSubTab === 'destinatarios' && (
          <DestinatariosAbm
            clientes={clientes}
            selectedClienteId={selectedClienteId}
            onRefreshParent={onRefresh}
          />
        )}

        {activeSubTab === 'lotes' && (
          <LotesAbm
            clientes={clientes}
            selectedClienteId={selectedClienteId}
            onRefreshParent={onRefresh}
          />
        )}

        {activeSubTab === 'ubicaciones' && (
          <UbicacionesAbm
            almacenes={almacenes}
            selectedAlmacenId={selectedAlmacenId}
            onRefreshParent={onRefresh}
          />
        )}
      </div>
    </div>
  );
};
