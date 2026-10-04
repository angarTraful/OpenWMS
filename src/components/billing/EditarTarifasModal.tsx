import React, { useState, useEffect } from 'react';
import { X, DollarSign, Save, RefreshCw, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { billingApi } from '../../api/billingApi';
import type { TarifaClienteConcepto } from '../../types/billing.types';
import type { Database } from '../../../types/database.types';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface EditarTarifasModalProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Database['public']['Tables']['clientes']['Row'] | null;
  onTarifasUpdated: () => void;
}

const CONCEPTOS_BASE = [
  { codigo: 'ESTADIA_M3_DIA', descripcion: 'Tarifa por M³/día de estadía', unidad: 'm3_dia', defecto: 0.85 },
  { codigo: 'REC_CONTAINER_20', 'descripcion': 'Recepción de mercadería Container 20\'', unidad: 'operacion', defecto: 120.0 },
  { codigo: 'REC_CONTAINER_40_HC', 'descripcion': 'Recepción de mercadería Container 40\' HC', unidad: 'operacion', defecto: 180.0 },
  { codigo: 'REC_CARGA_SUELTA', 'descripcion': 'Recepción de mercadería Carga Suelta', unidad: 'operacion', defecto: 75.0 },
  { codigo: 'INBOUND_CLASIF_BULTO', 'descripcion': 'Bulto ingresado clasificación (Inbound)', unidad: 'bulto', defecto: 0.15 },
  { codigo: 'PICKING_BULTO', 'descripcion': 'Bulto preparado (Picking)', unidad: 'bulto', defecto: 0.22 },
  { codigo: 'SERVICIO_CARGA_OUT', 'descripcion': 'Servicio a la Carga (OUT)', unidad: 'servicio', defecto: 35.0 },
];

export const EditarTarifasModal: React.FC<EditarTarifasModalProps> = ({
  isOpen,
  onClose,
  cliente,
  onTarifasUpdated,
}) => {
  const [tarifas, setTarifas] = useState<{ [codigo: string]: { id?: string; precio: number; unidad: string; descripcion: string } }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Nuevo concepto personalizado
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customCodigo, setCustomCodigo] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customPrecio, setCustomPrecio] = useState('0.00');
  const [customUnidad, setCustomUnidad] = useState('servicio');

  useEffect(() => {
    if (isOpen && cliente) {
      cargarTarifas();
    }
  }, [isOpen, cliente]);

  const cargarTarifas = async () => {
    if (!cliente) return;
    setLoading(true);
    setMsg(null);
    try {
      const data = await billingApi.listarTarifasCliente(cliente.id);
      const mapa: { [codigo: string]: { id?: string; precio: number; unidad: string; descripcion: string } } = {};
      
      // Llenar con base por defecto
      CONCEPTOS_BASE.forEach((c) => {
        mapa[c.codigo] = { precio: c.defecto, unidad: c.unidad, descripcion: c.descripcion };
      });

      // Sobrescribir con lo que venga de BD
      data.forEach((t) => {
        mapa[t.concepto_codigo] = {
          id: t.id,
          precio: Number(t.precio_unitario),
          unidad: t.tipo_unidad,
          descripcion: t.descripcion,
        };
      });

      setTarifas(mapa);
    } catch (err: any) {
      console.error('Error cargando tarifas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrecioChange = (codigo: string, valor: string) => {
    const num = parseFloat(valor);
    setTarifas((prev) => ({
      ...prev,
      [codigo]: {
        ...prev[codigo],
        precio: isNaN(num) ? 0 : num,
      },
    }));
  };

  const handleGuardarTarifas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente) return;
    setSaving(true);
    setMsg(null);

    try {
      for (const [codigo, data] of Object.entries(tarifas)) {
        await billingApi.guardarTarifaConcepto({
          cliente_id: cliente.id,
          concepto_codigo: codigo,
          descripcion: data.descripcion,
          tipo_unidad: data.unidad as any,
          precio_unitario: data.precio,
          moneda: '$',
          activo: true,
        });
      }

      setMsg({ type: 'ok', text: 'Tarifario comercial actualizado exitosamente.' });
      onTarifasUpdated();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error guardando tarifas:', err);
      setMsg({ type: 'err', text: err.message || 'Error al guardar tarifas.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomConcepto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCodigo.trim() || !customDesc.trim()) return;

    const codClean = customCodigo.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    setTarifas((prev) => ({
      ...prev,
      [codClean]: {
        precio: parseFloat(customPrecio) || 0,
        unidad: customUnidad,
        descripcion: customDesc.trim(),
      },
    }));

    setCustomCodigo('');
    setCustomDesc('');
    setCustomPrecio('0.00');
    setShowAddCustom(false);
  };

  if (!isOpen || !cliente) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-md max-w-2xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#333333]">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-violet-600 dark:text-[#dab9ff]" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                Tarifario Comercial 3PL: {cliente.razon_social}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Tarifas base en $ aplicadas a la liquidación de M³, recepciones y preparación.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#201f1f] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback message */}
        {msg && (
          <div
            className={`p-3 rounded text-xs flex items-center gap-2 ${
              msg.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#75d1ff] dark:border-[#1d4d38]'
                : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005]'
            }`}
          >
            {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Body Form */}
        <form onSubmit={handleGuardarTarifas} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-[#cdc3d4] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-violet-600 dark:text-[#dab9ff]" />
              <span>Cargando tarifario del cliente...</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider block">
                  Conceptos Operativos & Estadía M³
                </span>
                
                <div className="space-y-2">
                  {Object.entries(tarifas).map(([codigo, data]) => (
                    <div
                      key={codigo}
                      className="p-2.5 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-900 dark:text-[#e5e2e1]">
                          {data.descripcion}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-[#cdc3d4] font-mono flex items-center gap-2 mt-0.5">
                          <span className="text-violet-600 dark:text-[#dab9ff] font-semibold">{codigo}</span>
                          <span>•</span>
                          <span>Unidad: {data.unidad}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-slate-400 dark:text-[#cdc3d4]">$</span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={data.precio}
                          onChange={(e) => handlePrecioChange(codigo, e.target.value)}
                          className="w-28 px-2 py-1 text-xs font-mono text-right bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botón para concepto personalizado */}
              {!showAddCustom ? (
                <button
                  type="button"
                  onClick={() => setShowAddCustom(true)}
                  className="w-full py-2 px-3 rounded border border-dashed border-slate-300 dark:border-[#333333] hover:border-violet-500 dark:hover:border-[#dab9ff] text-xs font-medium text-slate-600 dark:text-[#cdc3d4] hover:text-violet-600 dark:hover:text-[#dab9ff] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Concepto de Tarifa Adicional</span>
                </button>
              ) : (
                <div className="p-3 rounded bg-slate-50 dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#333333] space-y-3">
                  <div className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">Nuevo Concepto Comercial</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-600 dark:text-[#cdc3d4] block mb-1">Código Único (Ej: RETIQUETADO_BULTO)</label>
                      <input
                        type="text"
                        value={customCodigo}
                        onChange={(e) => setCustomCodigo(e.target.value)}
                        placeholder="CODIGO_CONCEPTO"
                        className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-600 dark:text-[#cdc3d4] block mb-1">Descripción para la Factura</label>
                      <input
                        type="text"
                        value={customDesc}
                        onChange={(e) => setCustomDesc(e.target.value)}
                        placeholder="Descripción del servicio"
                        className="w-full px-2 py-1 text-xs bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-600 dark:text-[#cdc3d4] block mb-1">Unidad de Medida</label>
                      <select
                        value={customUnidad}
                        onChange={(e) => setCustomUnidad(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1]"
                      >
                        <option value="servicio">Servicio / Evento</option>
                        <option value="bulto">Bulto</option>
                        <option value="pallet">Pallet</option>
                        <option value="hora">Hora</option>
                        <option value="m3_dia">M3/Día</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-600 dark:text-[#cdc3d4] block mb-1">Precio Unitario ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={customPrecio}
                        onChange={(e) => setCustomPrecio(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded text-slate-900 dark:text-[#e5e2e1]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddCustom(false)}
                      className="px-3 py-1 text-xs rounded border border-slate-300 dark:border-[#333333] text-slate-600 dark:text-[#cdc3d4] hover:bg-slate-200 dark:hover:bg-[#201f1f]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCustomConcepto}
                      className="px-3 py-1 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:text-[#460283]"
                    >
                      Añadir a la Lista
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-[#333333] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-5 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 disabled:opacity-40 shadow-sm"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Tarifario</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
