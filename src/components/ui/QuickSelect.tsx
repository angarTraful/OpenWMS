import React from 'react';
import { Plus } from 'lucide-react';

export interface QuickSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

interface QuickSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: QuickSelectOption[];
  placeholder?: string;
  addNewLabel: string;
  onAddNew: () => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  selectClassName?: string;
  showPlusButton?: boolean;
  id?: string;
  name?: string;
}

export const QuickSelect: React.FC<QuickSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  addNewLabel,
  onAddNew,
  disabled = false,
  required = false,
  className = '',
  selectClassName = '',
  showPlusButton = true,
  id,
  name,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === '__ADD_NEW__') {
      // Interceptar selección de nuevo registro para abrir modal y preservar estado anterior
      onAddNew();
      return;
    }
    onChange(selected);
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase tracking-wider">
            {label} {required && <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>}
          </label>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <select
            id={id}
            name={name}
            value={value}
            onChange={handleChange}
            disabled={disabled}
            required={required}
            className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs ${selectClassName}`}
          >
            {/* Primer ítem destacado para alta rápida */}
            <option
              value="__ADD_NEW__"
              className="bg-violet-50 dark:bg-[#241138] text-violet-700 dark:text-[#dab9ff] font-bold py-1.5"
            >
              ✨ {addNewLabel}
            </option>

            {placeholder && (
              <option value="" className="bg-white dark:bg-[#1c1b1b] text-slate-400 dark:text-[#978d9d]">
                {placeholder}
              </option>
            )}

            {options.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]"
              >
                {opt.label} {opt.sublabel ? `— ${opt.sublabel}` : ''}
              </option>
            ))}
          </select>
        </div>

        {showPlusButton && (
          <button
            type="button"
            onClick={onAddNew}
            disabled={disabled}
            title={addNewLabel}
            aria-label={addNewLabel}
            className="p-2 rounded-lg bg-violet-50 hover:bg-violet-100 dark:bg-[#201330] dark:hover:bg-[#2d1845] border border-violet-200 dark:border-[#522b7c] text-violet-700 hover:text-violet-900 dark:text-[#dab9ff] dark:hover:text-[#eedbff] transition-all hover:scale-105 active:scale-95 flex items-center justify-center shrink-0 disabled:opacity-40 disabled:hover:scale-100 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        )}
      </div>
    </div>
  );
};
