import React, { useState, useEffect } from 'react';
import { X, MapPin, Save, AlertCircle, Building2 } from 'lucide-react';
import { clientesApi, Destinatario, DestinatarioInsert, DestinatarioUpdate, Cliente } from '../../api/clientesApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface DestinatarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinatario: Destinatario | null;
  clientes: Cliente[];
  defaultClienteId?: string;
  onSuccess?: () => void;
  onCreated?: (nuevo: Destinatario) => void;
}

export const DestinatarioModal: React.FC<DestinatarioModalProps> = ({
  isOpen,
  onClose,
  destinatario,
  clientes,
  defaultClienteId,
  onSuccess,
  onCreated,
}) => {
  const isEditing = Boolean(destinatario);

  // Cliente titular principal (o primer seleccionado)
  const [clienteId, setClienteId] = useState('');
  const [selectedClienteIds, setSelectedClienteIds] = useState<string[]>([]);
  const [esSucursalPropia, setEsSucursalPropia] = useState(false);

  const [razonSocial, setRazonSocial] = useState('');
  const [codigoSucursal, setCodigoSucursal] = useState('');
  const [direccionEntrega, setDireccionEntrega] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [contactoRecepcion, setContactoRecepcion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ventanaHoraria, setVentanaHoraria] = useState('');
  const [activo, setActivo] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (destinatario) {
        setClienteId(destinatario.cliente_id || '');
        // Extraer los clientes habilitados si vienen en el objeto
        const habilitados = (destinatario.clientes_habilitados || []).map((ch) => ch.cliente_id);
        if (habilitados.length > 0) {
          setSelectedClienteIds(habilitados);
        } else if (destinatario.cliente_id) {
          setSelectedClienteIds([destinatario.cliente_id]);
        } else {
          setSelectedClienteIds([]);
        }

        const esPropia =
          destinatario.es_sucursal_propia ??
          Boolean(destinatario.clientes_habilitados?.some((ch) => ch.es_sucursal_propia));
        setEsSucursalPropia(esPropia);

        setRazonSocial(destinatario.razon_social || '');
        setCodigoSucursal(destinatario.codigo_sucursal || '');
        setDireccionEntrega(destinatario.direccion_entrega || '');
        setCiudad(destinatario.ciudad || '');
        setContactoRecepcion(destinatario.contacto_recepcion || '');
        setTelefono(destinatario.telefono || '');
        setVentanaHoraria(destinatario.ventana_horaria_entrega || '');
        setActivo(destinatario.activo ?? true);
      } else {
        const initCliId = defaultClienteId || (clientes[0]?.id ?? '');
        setClienteId(initCliId);
        setSelectedClienteIds(initCliId ? [initCliId] : []);
        setEsSucursalPropia(false);

        setRazonSocial('');
        setCodigoSucursal('');
        setDireccionEntrega('');
        setCiudad('');
        setContactoRecepcion('');
        setTelefono('');
        setVentanaHoraria('08:00 a 16:00 hs');
        setActivo(true);
      }
      setErrorMsg(null);
    }
  }, [isOpen, destinatario, defaultClienteId, clientes]);

  if (!isOpen) return null;

  const toggleCliente = (cId: string) => {
    setSelectedClienteIds((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    );
  };

  const handleSelectAllClientes = () => {
    setSelectedClienteIds(clientes.map((c) => c.id));
  };

  const handleDeselectAllClientes = () => {
    setSelectedClienteIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (esSucursalPropia && !clienteId) {
      setErrorMsg('Debe seleccionar el cliente depositante titular de la sucursal propia.');
      return;
    }
    if (!esSucursalPropia && selectedClienteIds.length === 0) {
      setErrorMsg('Debe habilitar este destinatario para al menos un cliente depositante.');
      return;
    }
    if (!razonSocial.trim()) {
      setErrorMsg('La razón social o nombre de sucursal es obligatorio.');
      return;
    }
    if (!direccionEntrega.trim()) {
      setErrorMsg('La dirección física de entrega es obligatoria para la hoja de ruta.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const finalClienteIds = esSucursalPropia ? (clienteId ? [clienteId] : []) : selectedClienteIds;
      const primaryClienteId = esSucursalPropia ? clienteId : (finalClienteIds[0] || null);

      if (isEditing && destinatario) {
        const cambios: DestinatarioUpdate = {
          cliente_id: primaryClienteId,
          razon_social: razonSocial.trim(),
          codigo_sucursal: codigoSucursal.trim() || null,
          direccion_entrega: direccionEntrega.trim(),
          ciudad: ciudad.trim() || null,
          contacto_recepcion: contactoRecepcion.trim() || null,
          telefono: telefono.trim() || null,
          ventana_horaria_entrega: ventanaHoraria.trim() || null,
          activo,
          actualizado_en: new Date().toISOString(),
        };
        const updated = await clientesApi.actualizarDestinatario(
          destinatario.id,
          cambios,
          finalClienteIds,
          esSucursalPropia
        );
        if (onCreated) onCreated(updated);
      } else {
        const nuevo: DestinatarioInsert = {
          cliente_id: primaryClienteId,
          razon_social: razonSocial.trim(),
          codigo_sucursal: codigoSucursal.trim() || null,
          direccion_entrega: direccionEntrega.trim(),
          ciudad: ciudad.trim() || null,
          contacto_recepcion: contactoRecepcion.trim() || null,
          telefono: telefono.trim() || null,
          ventana_horaria_entrega: ventanaHoraria.trim() || null,
          activo,
        };
        const created = await clientesApi.crearDestinatario(
          nuevo,
          finalClienteIds,
          esSucursalPropia
        );
        if (onCreated) onCreated(created);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando destinatario:', err);
      setErrorMsg(err.message || 'Error al guardar el destinatario.');
    } finally {
      setLoading(false);
    }
  };

  const isFormDirty = Boolean(razonSocial || direccionEntrega || telefono);

  return (
    <ModalPortal
      onClose={onClose}
      isDirty={isFormDirty}
      confirmMessage="¿Está seguro de cerrar la ventana de destinatario? Los datos ingresados no guardados se perderán."
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-[#131313]/85 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-violet-100 border border-violet-200 text-violet-700 dark:bg-[#201330] dark:border-[#522b7c] dark:text-[#dab9ff]">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                {isEditing ? 'Editar Destinatario / Sucursal' : 'Nuevo Destinatario / Sucursal'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Punto de entrega autorizado para pedidos y remitos RX
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 dark:bg-[#370005] dark:border-[#ffb4ab]/40 dark:text-[#ffb4ab] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tipo de Destino: Sucursal Propia vs Boca de Entrega Compartida */}
          <div className="p-3 rounded-lg border border-slate-200 dark:border-[#333333] bg-slate-50/70 dark:bg-[#201f1f] space-y-3">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="check-sucursal-propia"
                checked={esSucursalPropia}
                onChange={(e) => {
                  const val = e.target.checked;
                  setEsSucursalPropia(val);
                  if (val && clienteId) {
                    setSelectedClienteIds([clienteId]);
                  }
                }}
                className="mt-0.5 w-4 h-4 rounded text-violet-600 dark:text-[#dab9ff] border-slate-300 dark:border-[#444] focus:ring-0 cursor-pointer"
              />
              <label htmlFor="check-sucursal-propia" className="cursor-pointer select-none">
                <span className="block text-xs font-bold text-slate-900 dark:text-[#e5e2e1]">
                  Es sucursal o depósito propio del cliente
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                  Si está marcado, solo será visible para el cliente titular (ideal para envíos inter-sucursales).
                </span>
              </label>
            </div>

            {esSucursalPropia ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                  Cliente Titular de la Sucursal <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <select
                  value={clienteId}
                  onChange={(e) => {
                    setClienteId(e.target.value);
                    if (e.target.value) setSelectedClienteIds([e.target.value]);
                  }}
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] cursor-pointer"
                >
                  <option value="">Seleccionar cliente titular...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.codigo}] {c.razon_social}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase">
                    Clientes Habilitados para Despachar Aquí <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={handleSelectAllClientes}
                      className="text-violet-600 dark:text-[#dab9ff] hover:underline font-semibold"
                    >
                      Habilitar todos
                    </button>
                    <span className="text-slate-300 dark:text-[#444]">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllClientes}
                      className="text-slate-500 dark:text-[#cdc3d4] hover:underline"
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>

                <div className="max-h-36 overflow-y-auto p-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] space-y-1.5">
                  {clientes.map((c) => {
                    const isChecked = selectedClienteIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-violet-50 dark:bg-[#201330] text-violet-900 dark:text-[#dab9ff]'
                            : 'hover:bg-slate-50 dark:hover:bg-[#1c1b1b] text-slate-700 dark:text-[#cdc3d4]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCliente(c.id)}
                            className="w-3.5 h-3.5 rounded text-violet-600 dark:text-[#dab9ff] border-slate-300 dark:border-[#444] focus:ring-0 cursor-pointer"
                          />
                          <span className="text-xs font-medium">
                            <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 mr-1.5">
                              [{c.codigo}]
                            </span>
                            {c.razon_social}
                          </span>
                        </div>
                        {isChecked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-200/60 dark:bg-[#522b7c]/40 font-semibold">
                            Habilitado
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#cdc3d4] mt-1">
                  En el portal y bot solo verán este destinatario los clientes con casilla marcada.
                </p>
              </div>
            )}
          </div>

          {/* Razón Social & Código Sucursal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Razón Social / Nombre Sucursal <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="text"
                required
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="Ej: Farmacia Central - Sucursal 04"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Cód. Sucursal
              </label>
              <input
                type="text"
                value={codigoSucursal}
                onChange={(e) => setCodigoSucursal(e.target.value.toUpperCase())}
                placeholder="SUC-04"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          {/* Dirección & Ciudad */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Dirección de Entrega <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="text"
                required
                value={direccionEntrega}
                onChange={(e) => setDireccionEntrega(e.target.value)}
                placeholder="Av. Rivadavia 4500"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Ciudad / Localidad
              </label>
              <input
                type="text"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                placeholder="CABA"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          {/* Contacto & Teléfono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Contacto en Recepción
              </label>
              <input
                type="text"
                value={contactoRecepcion}
                onChange={(e) => setContactoRecepcion(e.target.value)}
                placeholder="Persona o dpto. receptor"
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
                placeholder="+54 11 4567-8900"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          {/* Ventana Horaria */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Ventana Horaria de Entrega
            </label>
            <input
              type="text"
              value={ventanaHoraria}
              onChange={(e) => setVentanaHoraria(e.target.value)}
              placeholder="Ej: Lunes a Viernes de 08:00 a 14:00 hs"
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          {/* Estado activo */}
          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="w-4 h-4 rounded bg-white dark:bg-[#131313] border-slate-300 dark:border-[#333333] text-violet-600 dark:text-[#dab9ff] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-slate-700 dark:text-[#e5e2e1]">Destinatario habilitado para recibir pedidos y despachos</span>
            </label>
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
              <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Destinatario'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
