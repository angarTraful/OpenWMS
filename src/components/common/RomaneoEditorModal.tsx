import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Barcode,
  Layers,
} from 'lucide-react';
import { romaneoApi, RomaneoExcepcion } from '@/api/romaneoApi';
import { formatNumber } from '@/lib/utils';
import { getDescripcionFull } from '@/api/articulosApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface RomaneoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'recepcion' | 'pedido';
  idEntidad: string; // recepcionId o pedidoId
  numeroReferencia: string; // ej: REC-4688 o PED-3611
  detallesArticulos?: any[];
  onSuccess?: () => void;
}

export const RomaneoEditorModal: React.FC<RomaneoEditorModalProps> = ({
  isOpen,
  onClose,
  tipo,
  idEntidad,
  numeroReferencia,
  detallesArticulos = [],
  onSuccess,
}) => {
  const [excepciones, setExcepciones] = useState<RomaneoExcepcion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulario nueva excepción
  const [selectedArticuloId, setSelectedArticuloId] = useState<string>('');
  const [nroSecuencia, setNroSecuencia] = useState<number>(1);
  const [codigoLpn, setCodigoLpn] = useState<string>('');
  const [medidaEstandar, setMedidaEstandar] = useState<number>(50);
  const [medidaReal, setMedidaReal] = useState<number>(54.5);
  const [unidadMedida, setUnidadMedida] = useState<string>('mts');
  const [observaciones, setObservaciones] = useState<string>('');

  useEffect(() => {
    if (isOpen && idEntidad) {
      cargarDatosRomaneo();
    }
  }, [isOpen, idEntidad]);

  // Autoseleccionar primer artículo si está disponible
  useEffect(() => {
    if (detallesArticulos && detallesArticulos.length > 0) {
      const art = detallesArticulos[0].articulo || {};
      setSelectedArticuloId(art.id || detallesArticulos[0].articulo_id || '');
      setMedidaEstandar(Number(art.unidades_por_bulto || 50));
      setUnidadMedida(art.unidad_medida || 'mts');
    }
  }, [detallesArticulos]);

  const cargarDatosRomaneo = async () => {
    setLoading(true);
    try {
      if (tipo === 'recepcion') {
        const data = await romaneoApi.listarExcepcionesRecepcion(idEntidad);
        setExcepciones(data || []);
      } else {
        const data = await romaneoApi.listarRomaneoPedido(idEntidad);
        setExcepciones(data || []);
      }
    } catch (err) {
      console.error('Error al cargar romaneo:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleArticuloChange = (articuloId: string) => {
    setSelectedArticuloId(articuloId);
    const det = detallesArticulos.find(
      (d) => (d.articulo?.id || d.articulo_id) === articuloId
    );
    if (det) {
      const art = det.articulo || {};
      const std = Number(art.unidades_por_bulto || 50);
      setMedidaEstandar(std);
      setUnidadMedida(art.unidad_medida || 'mts');
    }
  };

  const handleAgregarFila = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticuloId || medidaReal <= 0) return;

    setSaving(true);
    setFeedback(null);
    try {
      const artSelect = detallesArticulos.find(
        (d) => (d.articulo?.id || d.articulo_id) === selectedArticuloId
      )?.articulo;

      const nuevoRegistro: RomaneoExcepcion = {
        recepcion_id: tipo === 'recepcion' ? idEntidad : undefined,
        pedido_id: tipo === 'pedido' ? idEntidad : undefined,
        articulo_id: selectedArticuloId,
        nro_secuencia: nroSecuencia,
        codigo_etiqueta_lpn: codigoLpn.trim() || `${artSelect?.nombre || artSelect?.sku || 'ART'}-${String(nroSecuencia).padStart(4, '0')}`,
        medida_estandar: medidaEstandar,
        medida_real: medidaReal,
        unidad_medida: unidadMedida,
        observaciones: observaciones.trim() || undefined,
      };

      if (tipo === 'recepcion') {
        await romaneoApi.guardarExcepcionesRecepcion([nuevoRegistro]);
      } else {
        await romaneoApi.guardarRomaneoPedido([nuevoRegistro]);
      }

      await cargarDatosRomaneo();
      setNroSecuencia((prev) => prev + 1);
      setCodigoLpn('');
      setObservaciones('');
      setFeedback({ type: 'success', text: 'Rollo especial agregado al romaneo.' });

      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error al guardar romaneo:', err);
      setFeedback({ type: 'error', text: err.message || 'Error al guardar el rollo en el romaneo.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 dark:text-[#e5e2e1]">
          
          {/* Header Modal */}
          <div className="p-5 border-b border-slate-200 dark:border-[#333333] flex items-center justify-between bg-slate-50 dark:bg-[#201f1f]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-[#0f1d34] dark:text-[#75d1ff] dark:border-[#1b345d] rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-[#e5e2e1] text-lg">Carga y Corrección de Romaneo</h3>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                  Registro de Rollos / Bultos No Estándar &bull; Referencia: <span className="font-mono text-blue-600 dark:text-[#75d1ff] font-bold">{numeroReferencia}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Formulario de Carga Directa */}
          <div className="p-5 border-b border-slate-200 dark:border-[#333333] bg-slate-50/50 dark:bg-[#201f1f]/50">
            <form onSubmit={handleAgregarFila} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1">
                    Seleccionar Artículo / SKU *
                  </label>
                  <select
                    value={selectedArticuloId}
                    onChange={(e) => handleArticuloChange(e.target.value)}
                    className="w-full bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#e5e2e1] font-bold outline-none focus:border-blue-500"
                  >
                    {detallesArticulos.map((d: any) => {
                      const art = d.articulo || {};
                      const artId = art.id || d.articulo_id;
                      return (
                        <option key={artId} value={artId}>
                          [{art.nombre || art.sku || 'ART'}] {(art as any)?.descripcion_full || getDescripcionFull(art) || art.descripcion || art.nombre || 'Producto'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1">
                    Etiqueta / Código LPN
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 9b09399-0001 (Automático si se deja vacío)"
                    value={codigoLpn}
                    onChange={(e) => setCodigoLpn(e.target.value)}
                    className="w-full bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#e5e2e1] font-mono outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1">
                    Secuencia N°
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={nroSecuencia}
                    onChange={(e) => setNroSecuencia(parseInt(e.target.value) || 1)}
                    className="w-full bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#e5e2e1] font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1">
                    Medida Estándar
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={medidaEstandar}
                    onChange={(e) => setMedidaEstandar(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-100 dark:bg-[#181818] border border-slate-300 dark:border-[#333333] rounded-xl px-3 py-2 text-xs text-slate-600 dark:text-[#cdc3d4] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1">
                    Medida Real (Rollo) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={medidaReal}
                    onChange={(e) => setMedidaReal(parseFloat(e.target.value) || 0)}
                    className="w-full bg-emerald-50 dark:bg-[#0f241a] border border-emerald-300 dark:border-[#1b4332] rounded-xl px-3 py-2 text-xs text-emerald-800 dark:text-[#69f0ae] font-black font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-[#cdc3d4] mb-1">
                    Unidad
                  </label>
                  <select
                    value={unidadMedida}
                    onChange={(e) => setUnidadMedida(e.target.value)}
                    className="w-full bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-[#e5e2e1] outline-none"
                  >
                    <option value="mts">mts (Metros)</option>
                    <option value="kgs">kgs (Kilogramos)</option>
                  </select>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={saving || medidaReal <= 0}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {saving ? 'Guardando...' : 'Agregar a Romaneo'}
                  </button>
                </div>
              </div>
            </form>

            {feedback && (
              <div className={`mt-3 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332]'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-[#381015] dark:text-[#ffb4ab] dark:border-[#690005]'
              }`}>
                {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{feedback.text}</span>
              </div>
            )}
          </div>

          {/* Grilla de Rollos Registrados */}
          <div className="p-5 flex-1 overflow-y-auto">
            <h4 className="text-xs font-bold text-slate-500 dark:text-[#cdc3d4] uppercase tracking-wider mb-3">
              Rollos con Medida Variable / Excepciones Registradas ({excepciones.length})
            </h4>

            {loading ? (
              <div className="text-center py-8 text-slate-400 dark:text-[#cdc3d4] text-xs">Cargando romaneo...</div>
            ) : excepciones.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-[#cdc3d4] text-xs border border-dashed border-slate-300 dark:border-[#333333] rounded-xl">
                No hay rollos no estándar registrados. Todos se consideran en medida estándar.
              </div>
            ) : (
              <table className="w-full text-xs text-left text-slate-800 dark:text-[#e5e2e1] border-collapse">
                <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">N° Secuencia</th>
                    <th className="p-2.5">Código LPN</th>
                    <th className="p-2.5">Producto / SKU</th>
                    <th className="p-2.5 text-center">Medida Std</th>
                    <th className="p-2.5 text-center">Medida Real</th>
                    <th className="p-2.5 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#333333]">
                  {excepciones.map((ex, idx) => {
                    const diff = Number(ex.medida_real) - Number(ex.medida_estandar);
                    return (
                      <tr key={ex.id || idx} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/60">
                        <td className="p-2.5 font-mono text-slate-500 dark:text-[#cdc3d4]">#{ex.nro_secuencia}</td>
                        <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-[#e5e2e1]">{ex.codigo_etiqueta_lpn}</td>
                        <td className="p-2.5">
                          <span className="font-mono text-slate-500 dark:text-[#cdc3d4] mr-1.5">[{ex.articulo?.nombre || ex.articulo?.sku || 'ART'}]</span>
                          {(ex.articulo as any)?.descripcion_full || getDescripcionFull(ex.articulo) || ex.articulo?.descripcion || ex.articulo?.nombre || ''}
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-500 dark:text-[#cdc3d4]">
                          {formatNumber(ex.medida_estandar)} {ex.unidad_medida}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-emerald-700 dark:text-[#69f0ae]">
                          {formatNumber(ex.medida_real)} {ex.unidad_medida}
                        </td>
                        <td className={`p-2.5 text-right font-mono font-bold ${diff >= 0 ? 'text-blue-600 dark:text-[#75d1ff]' : 'text-amber-600 dark:text-[#ffddb8]'}`}>
                          {diff > 0 ? '+' : ''}{formatNumber(diff)} {ex.unidad_medida}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] flex justify-between items-center">
            <span className="text-xs text-slate-500 dark:text-[#cdc3d4]">
              El romaneo corregido se actualizará en los remitos y planillas de salida.
            </span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-[#2a2a2a] dark:hover:bg-[#333333] text-slate-800 dark:text-[#e5e2e1] text-xs font-semibold rounded-xl transition-colors"
            >
              Cerrar y Volver
            </button>
          </div>

        </div>
      </div>
    </ModalPortal>
  );
};
