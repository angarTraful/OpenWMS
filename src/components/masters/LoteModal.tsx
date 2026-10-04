import React, { useState, useEffect } from 'react';
import { X, Calendar, Save, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { lotesApi, LoteCliente, LoteClienteInsert, LoteClienteUpdate } from '../../api/lotesApi';
import type { Cliente } from '../../api/clientesApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface LoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  lote: LoteCliente | null;
  clientes: Cliente[];
  defaultClienteId?: string;
  defaultNumeroLote?: string;
  onSuccess?: () => void;
  onCreated?: (nuevo: LoteCliente) => void;
}

export const LoteModal: React.FC<LoteModalProps> = ({
  isOpen,
  onClose,
  lote,
  clientes,
  defaultClienteId,
  defaultNumeroLote,
  onSuccess,
  onCreated,
}) => {
  const isEditing = Boolean(lote);

  const [clienteId, setClienteId] = useState('');
  const [numeroLote, setNumeroLote] = useState('');
  const [fechaFabricacion, setFechaFabricacion] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const [motivoBloqueo, setMotivoBloqueo] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (lote) {
        setClienteId(lote.cliente_id || '');
        setNumeroLote(lote.numero_lote || '');
        setFechaFabricacion(lote.fecha_fabricacion ? lote.fecha_fabricacion.split('T')[0] : '');
        setFechaVencimiento(lote.fecha_vencimiento ? lote.fecha_vencimiento.split('T')[0] : '');
        setBloqueado(Boolean(lote.bloqueado));
        setMotivoBloqueo(lote.motivo_bloqueo || '');
      } else {
        setClienteId(defaultClienteId || (clientes[0]?.id ?? ''));
        setNumeroLote(defaultNumeroLote || '');
        setFechaFabricacion(new Date().toISOString().split('T')[0]);
        // Default vencimiento 1 año
        const unAno = new Date();
        unAno.setFullYear(unAno.getFullYear() + 1);
        setFechaVencimiento(unAno.toISOString().split('T')[0]);
        setBloqueado(false);
        setMotivoBloqueo('');
      }
      setErrorMsg(null);
    }
  }, [isOpen, lote, defaultClienteId, defaultNumeroLote, clientes]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) {
      setErrorMsg('Debe seleccionar el cliente titular del lote.');
      return;
    }
    if (!numeroLote.trim()) {
      setErrorMsg('El número o código de lote es obligatorio.');
      return;
    }
    if (bloqueado && !motivoBloqueo.trim()) {
      setErrorMsg('Debe especificar un motivo si el lote queda bloqueado o en cuarentena.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (isEditing && lote) {
        const cambios: LoteClienteUpdate = {
          cliente_id: clienteId,
          numero_lote: numeroLote.trim(),
          fecha_fabricacion: fechaFabricacion || null,
          fecha_vencimiento: fechaVencimiento || null,
          bloqueado,
          motivo_bloqueo: bloqueado ? motivoBloqueo.trim() : null,
        };
        const updated = await lotesApi.actualizarLote(lote.id, cambios);
        if (onCreated) onCreated(updated);
      } else {
        const nuevo: LoteClienteInsert = {
          cliente_id: clienteId,
          numero_lote: numeroLote.trim(),
          fecha_fabricacion: fechaFabricacion || null,
          fecha_vencimiento: fechaVencimiento || null,
          bloqueado,
          motivo_bloqueo: bloqueado ? motivoBloqueo.trim() : null,
        };
        const created = await lotesApi.crearLote(nuevo);
        if (onCreated) onCreated(created);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando lote:', err);
      setErrorMsg(err.message || 'Error al guardar el lote en la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded border ${bloqueado ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-[#370005] dark:border-[#ffb4ab]/40 dark:text-[#ffb4ab]' : 'bg-violet-100 border-violet-200 text-violet-700 dark:bg-[#201330] dark:border-[#522b7c] dark:text-[#dab9ff]'}`}>
              {bloqueado ? <ShieldAlert className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                {isEditing ? 'Editar Lote de Producción' : 'Registrar Nuevo Lote'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Trazabilidad FEFO y control de calidad / cuarentena
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#370005] dark:border-[#ffb4ab]/40 dark:text-[#ffb4ab] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Cliente titular */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Cliente Depositante Titular <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
            </label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={isEditing}
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] disabled:opacity-60 cursor-pointer"
            >
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social} ({c.codigo})
                </option>
              ))}
            </select>
          </div>

          {/* Número de Lote */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Número / Código de Lote <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
            </label>
            <input
              type="text"
              required
              value={numeroLote}
              onChange={(e) => setNumeroLote(e.target.value)}
              placeholder="Ej: L-2026-09A o LT-99412"
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          {/* Fechas de Fabricación y Vencimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Fecha de Fabricación
              </label>
              <input
                type="date"
                value={fechaFabricacion}
                onChange={(e) => setFechaFabricacion(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Fecha de Vencimiento (FEFO)
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          {/* Bloqueo / Cuarentena */}
          <div className="p-3 rounded bg-slate-50 dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] space-y-2.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bloqueado}
                onChange={(e) => setBloqueado(e.target.checked)}
                className="w-4 h-4 rounded bg-white dark:bg-[#131313] border-slate-300 dark:border-[#333333] text-rose-600 dark:text-[#ffb4ab] focus:ring-0 cursor-pointer"
              />
              <span className={`text-xs font-semibold ${bloqueado ? 'text-rose-600 dark:text-[#ffb4ab]' : 'text-slate-700 dark:text-[#cdc3d4]'}`}>
                Bloquear Lote / Cuarentena Preventiva
              </span>
            </label>

            {bloqueado && (
              <div>
                <label className="block text-[10px] font-semibold text-rose-600 dark:text-[#ffb4ab] uppercase mb-1">
                  Motivo del Bloqueo <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <textarea
                  rows={2}
                  required={bloqueado}
                  value={motivoBloqueo}
                  onChange={(e) => setMotivoBloqueo(e.target.value)}
                  placeholder="Detallar causa: ANMAT, rotura de empaque, control bacteriológico, etc."
                  className="w-full px-3 py-1.5 rounded bg-white dark:bg-[#131313] border border-rose-300 dark:border-[#ffb4ab]/40 text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-rose-500 dark:focus:border-[#ffb4ab]"
                />
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#252525] text-xs font-semibold text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#c99eff] dark:text-[#460283] text-xs font-bold transition-all disabled:opacity-50 shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Lote'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
