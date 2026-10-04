import React, { useState, useEffect } from 'react';
import { X, Tag, Save, AlertCircle } from 'lucide-react';
import { articulosApi, Categoria, CategoriaInsert, CategoriaUpdate } from '../../api/articulosApi';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface CategoriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoria: Categoria | null;
  onSuccess?: () => void;
  onCreated?: (nueva: Categoria) => void;
}

export const CategoriaModal: React.FC<CategoriaModalProps> = ({
  isOpen,
  onClose,
  categoria,
  onSuccess,
  onCreated,
}) => {
  const isEditing = Boolean(categoria);

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (categoria) {
        setCodigo(categoria.codigo || '');
        setNombre(categoria.nombre || '');
        setDescripcion(categoria.descripcion || '');
        setActivo(categoria.activo ?? true);
      } else {
        setCodigo('');
        setNombre('');
        setDescripcion('');
        setActivo(true);
      }
      setErrorMsg(null);
    }
  }, [isOpen, categoria]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim()) {
      setErrorMsg('El código de la categoría es obligatorio (ej: BEB, ELEC, FARM).');
      return;
    }
    if (!nombre.trim()) {
      setErrorMsg('El nombre de la categoría es obligatorio.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (isEditing && categoria) {
        const cambios: CategoriaUpdate = {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          activo,
        };
        const updated = await articulosApi.actualizarCategoria(categoria.id, cambios);
        if (onCreated) onCreated(updated);
      } else {
        const nueva: CategoriaInsert = {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          activo,
        };
        const created = await articulosApi.crearCategoria(nueva);
        if (onCreated) onCreated(created);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando categoría:', err);
      setErrorMsg(err.message || 'Error al guardar la categoría.');
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
            <div className="p-2 rounded bg-violet-100 border border-violet-200 text-violet-700 dark:bg-[#201330] dark:border-[#522b7c] dark:text-[#dab9ff]">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1]">
                {isEditing ? 'Editar Categoría de Catálogo' : 'Nueva Categoría de Catálogo'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                Familia para clasificación y rotación de artículos
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
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 dark:bg-[#370005] dark:border-[#ffb4ab]/40 dark:text-[#ffb4ab] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Código <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                placeholder="BEB"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                Nombre de Categoría <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Bebidas y Líquidos"
                className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
              Descripción
            </label>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles sobre características de almacenamiento o manipuleo de este grupo..."
              className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="w-4 h-4 rounded bg-white dark:bg-[#131313] border-slate-300 dark:border-[#333333] text-violet-600 dark:text-[#dab9ff] focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-slate-700 dark:text-[#e5e2e1]">Categoría activa para nuevos artículos</span>
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
              <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Categoría'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
