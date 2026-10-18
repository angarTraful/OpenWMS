import React, { useState } from 'react';
import { X, Plus, Calendar, Building2, Package, Layers, Hash, Warehouse, FileText } from 'lucide-react';
import { EstadoProgramacion, ProgramacionItem, formatFechaCorta } from '@/api/programacionApi';

interface NuevoItemProgramacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGuardar: (item: Omit<ProgramacionItem, 'id'>) => Promise<void>;
  clientes: any[];
  almacenes: any[];
  defaultClienteNombre?: string;
}

export const NuevoItemProgramacionModal: React.FC<NuevoItemProgramacionModalProps> = ({
  isOpen,
  onClose,
  onGuardar,
  clientes,
  almacenes,
  defaultClienteNombre,
}) => {
  const [fecha, setFecha] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [clienteNombre, setClienteNombre] = useState<string>(defaultClienteNombre || 'MITRE');
  const [rollos, setRollos] = useState<number>(50);
  const [itemCodigo, setItemCodigo] = useState<string>('');
  const [ordenCompra, setOrdenCompra] = useState<string>('');
  const [pedidoNumero, setPedidoNumero] = useState<string>('');
  const [deposito, setDeposito] = useState<string>('RONDEAU');
  const [estado, setEstado] = useState<EstadoProgramacion>('programado');
  const [comentarios, setComentarios] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCodigo.trim() || !pedidoNumero.trim()) {
      alert('Por favor complete el Artículo y el Número de Pedido');
      return;
    }

    try {
      setIsSaving(true);
      await onGuardar({
        pedido_id: `ped-local-${Date.now()}`,
        fecha,
        fecha_display: formatFechaCorta(fecha),
        cliente_nombre: clienteNombre.toUpperCase().trim(),
        destinatario_nombre: clienteNombre.toUpperCase().trim(),
        rollos: Number(rollos) || 1,
        item_codigo: itemCodigo.toUpperCase().trim(),
        orden_compra: ordenCompra.toUpperCase().trim() || 'S/N',
        pedido_numero: pedidoNumero.toUpperCase().trim(),
        deposito: deposito.toUpperCase().trim(),
        estado,
        comentarios: comentarios.trim(),
        comentarios_highlight: comentarios.toLowerCase().includes('entrega') || comentarios.toLowerCase().includes('falta') || comentarios.toLowerCase().includes('devol'),
        documentos: {
          tiene_remito: estado === 'entregado',
          remito_numero: estado === 'entregado' ? `RTO-${pedidoNumero.toUpperCase().trim()}` : undefined,
          tiene_romaneo: true,
          tiene_pedido: true,
          tiene_rx_conformado: estado === 'entregado',
          rx_firmado_por: estado === 'entregado' ? clienteNombre.toUpperCase().trim() : undefined,
        },
      });
      onClose();
    } catch (err: any) {
      alert(`Error al guardar: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#1a1919] border border-slate-200 dark:border-[#333333] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#2a2a2a] bg-slate-50/50 dark:bg-[#1e1d1d]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Nuevo Renglón de Programación
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Registrar pedido o entrega en la planilla
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          <div className="grid grid-cols-2 gap-4">
            {/* Fecha */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Fecha
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              />
            </div>

            {/* Destinatario (Cliente) */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Destinatario (Cliente)
              </label>
              <input
                type="text"
                required
                placeholder="ej. MITRE, LAVALLE..."
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                list="clientes-list"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              />
              <datalist id="clientes-list">
                {clientes.map((c) => (
                  <option key={c.id} value={c.razon_social} />
                ))}
                <option value="MITRE" />
                <option value="LAVALLE" />
                <option value="LINIK" />
                <option value="JPAN (CELINA)" />
                <option value="JAIME SALEM" />
                <option value="FLOWER TIME" />
                <option value="HUBER" />
                <option value="NICARRABLA" />
                <option value="OMEPETEX" />
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Rollos / Cantidad */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                Rollos
              </label>
              <input
                type="number"
                min="1"
                required
                value={rollos}
                onChange={(e) => setRollos(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              />
            </div>

            {/* Número de Pedido */}
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                N° Pedido
              </label>
              <input
                type="text"
                required
                placeholder="ej. PEDIDO 840 o FLOWER"
                value={pedidoNumero}
                onChange={(e) => setPedidoNumero(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              />
            </div>
          </div>

          {/* Item / Articulo */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              Item / Artículo
            </label>
            <input
              type="text"
              required
              placeholder="ej. 3642 TRACKER, 2111, 98 TAFETA, 550 BENGALIN..."
              value={itemCodigo}
              onChange={(e) => setItemCodigo(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Orden de Compra */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Orden de Compra (OC)
              </label>
              <input
                type="text"
                placeholder="ej. 2036 HL ABC, SOSG24..."
                value={ordenCompra}
                onChange={(e) => setOrdenCompra(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              />
            </div>

            {/* Depósito */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                Depósito
              </label>
              <select
                value={deposito}
                onChange={(e) => setDeposito(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
              >
                <option value="RONDEAU">RONDEAU</option>
                <option value="MENDEZ">MENDEZ</option>
                <option value="HEREDIA">HEREDIA</option>
                <option value="LARRALDE">LARRALDE</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.nombre}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Estado / Color */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
              Estado de la Entrega (Color en Planilla)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEstado('programado')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${estado === 'programado'
                    ? 'border-sky-500 bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 ring-2 ring-sky-400/40'
                    : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span className="w-4 h-4 rounded-full bg-[#BDD7EE] border border-sky-600 inline-block shrink-0 shadow-sm" />
                <div>
                  <span className="text-xs font-bold block">🔵 Programado</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">En preparación / picking</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEstado('entregado')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${estado === 'entregado'
                    ? 'border-amber-500 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400/40'
                    : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span className="w-4 h-4 rounded-full bg-[#FFC000] border border-amber-600 inline-block shrink-0 shadow-sm" />
                <div>
                  <span className="text-xs font-bold block">🟠 Entregado</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Despachado / cumplido</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEstado('en_transito')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${estado === 'en_transito'
                    ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-400/40'
                    : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span className="w-4 h-4 rounded-full bg-emerald-400 border border-emerald-600 inline-block shrink-0 shadow-sm" />
                <div>
                  <span className="text-xs font-bold block">🟢 En Tránsito</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">En ruta de reparto</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEstado('pendiente')}
                className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${estado === 'pendiente'
                    ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white ring-2 ring-slate-400/40'
                    : 'border-slate-200 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-200 border border-slate-400 inline-block shrink-0 shadow-sm" />
                <div>
                  <span className="text-xs font-bold block">⚪ Pendiente</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Sin iniciar</span>
                </div>
              </button>
            </div>
          </div>

          {/* Comentarios */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              Comentarios / Observaciones de Entrega
            </label>
            <input
              type="text"
              placeholder="ej. SE ENTREGA 09/06, FALTA 4 ROSA VIEJO, SE ENTREGAN EN 4 VIAJES..."
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#242424] text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/30 focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#2a2a2a]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 active:scale-95 rounded-lg shadow-md transition-all flex items-center gap-1.5"
            >
              {isSaving ? 'Guardando...' : 'Agregar a Planilla'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
