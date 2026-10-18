import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Download,
  CheckCircle2,
  Clock,
  Trash2,
  Calendar,
  Building2,
  Layers,
  Package,
  FileSpreadsheet,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  solicitudesParalelasApi,
  SolicitudParalelaItem,
  ProgramacionItem,
} from '@/api/programacionApi';
import { exportToCSV } from '@/lib/exportExcelUtils';

interface SolicitudesParalelasDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clienteNombre?: string;
  isClientPortal?: boolean;
  onSolicitudAprobada?: (itemOficial: ProgramacionItem) => void;
}

export const SolicitudesParalelasDrawer: React.FC<SolicitudesParalelasDrawerProps> = ({
  isOpen,
  onClose,
  clienteNombre,
  isClientPortal = false,
  onSolicitudAprobada,
}) => {
  const [solicitudes, setSolicitudes] = useState<SolicitudParalelaItem[]>([]);
  const [isNewOpen, setIsNewOpen] = useState(false);

  // Form states
  const [destinatario, setDestinatario] = useState('MITRE');
  const [rollos, setRollos] = useState(50);
  const [itemCodigo, setItemCodigo] = useState('');
  const [ordenCompra, setOrdenCompra] = useState('');
  const [fechaSolicitada, setFechaSolicitada] = useState(() => new Date().toISOString().slice(0, 10));
  const [deposito, setDeposito] = useState('RONDEAU');
  const [comentarios, setComentarios] = useState('');

  const cargarSolicitudes = () => {
    const list = solicitudesParalelasApi.listar(clienteNombre);
    setSolicitudes(list);
  };

  useEffect(() => {
    if (isOpen) {
      cargarSolicitudes();
    }
  }, [isOpen, clienteNombre]);

  if (!isOpen) return null;

  const handleCrearSolicitud = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCodigo.trim() || !destinatario.trim()) {
      alert('Por favor complete Destinatario y Artículo');
      return;
    }

    solicitudesParalelasApi.agregar({
      cliente_nombre: clienteNombre || 'CLIENTE',
      destinatario_nombre: destinatario.toUpperCase().trim(),
      rollos: Number(rollos) || 1,
      item_codigo: itemCodigo.toUpperCase().trim(),
      orden_compra: ordenCompra.toUpperCase().trim() || 'S/N',
      fecha_solicitada: fechaSolicitada,
      deposito_preferido: deposito,
      comentarios: comentarios.trim(),
    });

    setIsNewOpen(false);
    setItemCodigo('');
    setOrdenCompra('');
    setComentarios('');
    cargarSolicitudes();
  };

  const handleAprobar = (id: string) => {
    const itemOficial = solicitudesParalelasApi.aprobarEIncorporar(id);
    if (itemOficial && onSolicitudAprobada) {
      onSolicitudAprobada(itemOficial);
    }
    cargarSolicitudes();
  };

  const handleEliminar = (id: string) => {
    solicitudesParalelasApi.eliminar(id);
    cargarSolicitudes();
  };

  const handleExportarCSV = () => {
    exportToCSV({
      filename: `Solicitudes_Paralelas_${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: 'FECHA_SOLICITADA', key: 'fecha_solicitada' },
        { header: 'DESTINATARIO', key: 'destinatario_nombre' },
        { header: 'ROLLOS', key: 'rollos' },
        { header: 'ITEM', key: 'item_codigo' },
        { header: 'ORDEN_COMPRA', key: 'orden_compra' },
        { header: 'DEPOSITO_PREFERIDO', key: 'deposito_preferido' },
        { header: 'ESTADO', key: 'estado' },
        { header: 'COMENTARIOS', key: 'comentarios' },
      ],
      rows: solicitudes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl h-full bg-white dark:bg-[#1a1919] border-l border-slate-300 dark:border-[#333333] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1f1e1e]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-amber-500" />
              Solicitudes y Borradores (Tabla Paralela)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isClientPortal
                ? 'Agrega tus solicitudes de entrega sin alterar la planilla oficial'
                : 'Borradores enviados por clientes pendientes de normalización o importación'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-[#2a2a2a] bg-slate-50/50 dark:bg-[#161515] flex items-center justify-between gap-2">
          <button
            onClick={() => setIsNewOpen(!isNewOpen)}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {isNewOpen ? 'Cancelar Carga' : '+ Nueva Solicitud'}
          </button>

          {!isClientPortal && solicitudes.length > 0 && (
            <button
              onClick={handleExportarCSV}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
              title="Descargar como CSV para normalizar e importar masivamente"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          )}
        </div>

        {/* New Request Form (Collapsible) */}
        {isNewOpen && (
          <form
            onSubmit={handleCrearSolicitud}
            className="p-4 border-b border-amber-300/60 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 space-y-3 animate-in slide-in-from-top-2"
          >
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
              Registrar Nueva Solicitud de Entrega (Borrador)
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Destinatario (Entrega a)
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. MITRE, LAVALLE..."
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Fecha Solicitada
                </label>
                <input
                  type="date"
                  required
                  value={fechaSolicitada}
                  onChange={(e) => setFechaSolicitada(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Rollos
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={rollos}
                  onChange={(e) => setRollos(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white"
                />
              </div>

              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Artículo / Item
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. 3642 TRACKER, 550 BENGALIN..."
                  value={itemCodigo}
                  onChange={(e) => setItemCodigo(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Orden de Compra (OC)
                </label>
                <input
                  type="text"
                  placeholder="ej. 2036 HL ABC..."
                  value={ordenCompra}
                  onChange={(e) => setOrdenCompra(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Depósito Preferido
                </label>
                <select
                  value={deposito}
                  onChange={(e) => setDeposito(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white"
                >
                  <option value="RONDEAU">RONDEAU</option>
                  <option value="MENDEZ">MENDEZ</option>
                  <option value="HEREDIA">HEREDIA</option>
                  <option value="LARRALDE">LARRALDE</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                Comentarios / Instrucciones de Entrega
              </label>
              <input
                type="text"
                placeholder="ej. Entregar por la mañana, pallet filmado..."
                value={comentarios}
                onChange={(e) => setComentarios(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#252525] text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333333] rounded"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded shadow"
              >
                Guardar Borrador
              </button>
            </div>
          </form>
        )}

        {/* List of Requests */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {solicitudes.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No hay solicitudes en borrador.</p>
            </div>
          ) : (
            solicitudes.map((sol) => (
              <div
                key={sol.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#201f1f] shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white block uppercase">
                      {sol.destinatario_nombre}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Fecha pedida: {sol.fecha_solicitada} • Depósito: {sol.deposito_preferido}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      sol.estado === 'aprobado'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {sol.estado === 'aprobado' ? '✓ Aprobado en Planilla' : '⏳ Pendiente'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-[#181717] p-2 rounded-lg font-mono">
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {sol.rollos} rollos
                  </span>
                  <span className="font-bold">{sol.item_codigo}</span>
                  <span className="text-[11px] text-slate-400">OC: {sol.orden_compra}</span>
                </div>

                {sol.comentarios && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                    "{sol.comentarios}"
                  </p>
                )}

                {/* Actions for Operator */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#2a2a2a]">
                  <span className="text-[10px] text-slate-400">
                    Registrado: {new Date(sol.creado_en).toLocaleDateString('es-AR')}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {!isClientPortal && sol.estado !== 'aprobado' && (
                      <button
                        onClick={() => handleAprobar(sol.id)}
                        className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
                        title="Incorporar directamente a la Planilla de Programación Oficial"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Aprobar Oficial
                      </button>
                    )}

                    <button
                      onClick={() => handleEliminar(sol.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      title="Eliminar borrador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1f1e1e] flex justify-between items-center text-xs">
          <span className="text-slate-500">
            {solicitudes.length} solicitudes en tabla paralela
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-bold rounded-lg bg-slate-200 dark:bg-[#2e2d2d] text-slate-800 dark:text-slate-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
