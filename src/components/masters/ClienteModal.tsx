import React, { useState, useEffect } from 'react';
import { X, Building2, Save, AlertCircle } from 'lucide-react';
import type { Cliente, ClienteInsert, ClienteUpdate } from '../../api/clientesApi';
import { clientesApi } from '../../api/clientesApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface ClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onSuccess: () => void;
  onCreated?: (nuevo: Cliente) => void;
}

export const ClienteModal: React.FC<ClienteModalProps> = ({
  isOpen,
  onClose,
  cliente,
  onSuccess,
  onCreated,
}) => {
  const isEditing = Boolean(cliente);

  const [codigo, setCodigo] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [unidadNegocio, setUnidadNegocio] = useState('');
  const [identificacionFiscal, setIdentificacionFiscal] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [activo, setActivo] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (cliente) {
        setCodigo(cliente.codigo || '');
        setRazonSocial(cliente.razon_social || '');
        setUnidadNegocio(cliente.unidad_negocio || '');
        setIdentificacionFiscal(cliente.identificacion_fiscal || '');
        setDireccion(cliente.direccion || '');
        setTelefono(cliente.telefono || '');
        setEmailContacto(cliente.email_contacto || '');
        setActivo(cliente.activo ?? true);
      } else {
        setCodigo('');
        setRazonSocial('');
        setUnidadNegocio('');
        setIdentificacionFiscal('');
        setDireccion('');
        setTelefono('');
        setEmailContacto('');
        setActivo(true);
      }
      setErrorMsg(null);
    }
  }, [isOpen, cliente]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!codigo.trim()) {
      setErrorMsg('El código del cliente es obligatorio.');
      return;
    }
    if (!razonSocial.trim()) {
      setErrorMsg('La razón social es obligatoria.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing && cliente) {
        const cambios: ClienteUpdate = {
          codigo: codigo.trim().toUpperCase(),
          razon_social: razonSocial.trim(),
          unidad_negocio: unidadNegocio.trim() || null,
          identificacion_fiscal: identificacionFiscal.trim() || null,
          direccion: direccion.trim() || null,
          telefono: telefono.trim() || null,
          email_contacto: emailContacto.trim() || null,
          activo,
          actualizado_en: new Date().toISOString(),
        };
        const updated = await clientesApi.actualizarCliente(cliente.id, cambios);
        if (onCreated) onCreated(updated);
      } else {
        const nuevo: ClienteInsert = {
          codigo: codigo.trim().toUpperCase(),
          razon_social: razonSocial.trim(),
          unidad_negocio: unidadNegocio.trim() || null,
          identificacion_fiscal: identificacionFiscal.trim() || null,
          direccion: direccion.trim() || null,
          telefono: telefono.trim() || null,
          email_contacto: emailContacto.trim() || null,
          activo,
        };
        const created = await clientesApi.crearCliente(nuevo);
        if (onCreated) onCreated(created);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando cliente:', err);
      setErrorMsg(err.message || 'Error al guardar los datos del cliente en la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                {isEditing ? 'Editar Cliente Depositante' : 'Nuevo Cliente Depositante 3PL'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Administración de cuentas corrientes y catálogos de depositantes
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
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Código Interno <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="CLI-001"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                CUIT / Identif. Fiscal
              </label>
              <input
                type="text"
                value={identificacionFiscal}
                onChange={(e) => setIdentificacionFiscal(e.target.value)}
                placeholder="30-71234567-9"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Razón Social / Nombre Comercial <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
            </label>
            <input
              type="text"
              required
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Ej: Logística Central S.A."
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Unidad de Negocio / Rubro
            </label>
            <input
              type="text"
              value={unidadNegocio}
              onChange={(e) => setUnidadNegocio(e.target.value)}
              placeholder="Ej: Retail, Alimentos, Farmacéutica..."
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Email de Contacto
              </label>
              <input
                type="email"
                value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)}
                placeholder="operaciones@cliente.com"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Teléfono de Contacto
              </label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+54 11 4000-0000"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Dirección Fiscal / Operativa
            </label>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Av. Logística 1234, Parque Industrial"
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          {/* Toggle Activo */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-[#333333]">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-800 dark:text-[#e5e2e1]">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="w-4 h-4 rounded text-violet-600 dark:text-[#dab9ff] border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] focus:ring-0"
              />
              <span className="font-medium">Cliente Activo para Operaciones WMS</span>
            </label>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
              activo
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#153426] dark:text-[#69f0ae] dark:border-[#1b4332]'
                : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
            }`}>
              {activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#333333]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Cliente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
