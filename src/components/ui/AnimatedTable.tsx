import React from 'react';
import { motion, AnimatePresence, HTMLMotionProps } from 'framer-motion';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  PackageSearch,
  Search,
  X,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------------
// 1. Table Container (Glassmorphic dark wrapper)
// -----------------------------------------------------------------------------
interface TableContainerProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export const TableContainer: React.FC<TableContainerProps> = ({
  children,
  className,
  glow = false,
}) => {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1a1919]/90 backdrop-blur-md overflow-hidden flex flex-col shadow-xs dark:shadow-xl transition-all duration-300',
        glow && 'ring-1 ring-violet-400/30 dark:ring-[#dab9ff]/30 shadow-violet-500/5 dark:shadow-[#dab9ff]/5',
        className
      )}
    >
      {children}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 2. Sortable Header Cell
// -----------------------------------------------------------------------------
export type SortDirection = 'asc' | 'desc' | null;

export interface SortableHeaderCellProps {
  label: string;
  field?: string;
  sortKey?: string;
  currentSortField?: string | null;
  sortAsc?: boolean;
  currentSortDirection?: SortDirection;
  onSort?: (field: any) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const SortableHeaderCell: React.FC<SortableHeaderCellProps> = ({
  label,
  field,
  sortKey,
  currentSortField,
  sortAsc = false,
  currentSortDirection,
  onSort,
  align = 'left',
  className,
}) => {
  const actualField = field || sortKey;
  const isSorted = Boolean(actualField && currentSortField === actualField);
  const isAsc = currentSortDirection !== undefined ? currentSortDirection === 'asc' : sortAsc;
  const isClickable = Boolean(actualField && onSort);

  return (
    <th
      onClick={() => isClickable && onSort!(actualField)}
      className={cn(
        'py-2 px-3 font-semibold text-[11px] tracking-wider uppercase select-none text-slate-700 dark:text-[#cdc3d4]',
        isClickable && 'cursor-pointer hover:text-slate-900 dark:hover:text-[#e5e2e1] group transition-colors',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      <div
        className={cn(
          'inline-flex items-center gap-1.5',
          align === 'right' && 'justify-end flex-row-reverse'
        )}
      >
        <span>{label}</span>
        {isClickable && (
          <motion.span
            animate={{
              rotate: isSorted ? (isAsc ? 0 : 180) : 0,
              scale: isSorted ? 1.1 : 0.9,
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className={cn(
              'p-0.5 rounded transition-colors',
              isSorted
                ? 'text-violet-700 dark:text-[#dab9ff] bg-violet-100 dark:bg-[#dab9ff]/10'
                : 'text-slate-400 dark:text-[#978d9d] group-hover:text-slate-700 dark:group-hover:text-[#cdc3d4]'
            )}
          >
            {isSorted ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowUpDown className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
            )}
          </motion.span>
        )}
      </div>
    </th>
  );
};

// -----------------------------------------------------------------------------
// 3. Animated Table Row (motion.tr)
// -----------------------------------------------------------------------------
interface AnimatedTableRowProps extends HTMLMotionProps<'tr'> {
  isSelected?: boolean;
  isClickable?: boolean;
  index?: number;
  children: React.ReactNode;
}

export const AnimatedTableRow: React.FC<AnimatedTableRowProps> = ({
  isSelected = false,
  isClickable = true,
  index = 0,
  children,
  className,
  ...props
}) => {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'group transition-colors duration-100 border-b border-slate-200 dark:border-[#44424a]',
        isClickable && 'cursor-pointer',
        isSelected
          ? 'bg-violet-50 dark:bg-gradient-to-r dark:from-[#dab9ff]/15 dark:via-[#201330] dark:to-transparent font-medium border-l-2 border-l-violet-600 dark:border-l-[#dab9ff]'
          : 'hover:bg-slate-50 dark:hover:bg-[#222125]',
        className
      )}
      {...props}
    >
      {children}
    </motion.tr>
  );
};

// -----------------------------------------------------------------------------
// 4. Animated Table Skeleton Loading
// -----------------------------------------------------------------------------
interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  columns,
  rows = 5,
}) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-slate-200 dark:border-[#44424a]">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="py-2 px-3">
              <motion.div
                animate={{
                  opacity: [0.35, 0.75, 0.35],
                }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: (i * 0.08) + (j * 0.04),
                }}
                className={cn(
                  'h-3.5 rounded bg-slate-200 dark:bg-[#2a2a2a]',
                  j === 0 ? 'w-3/4' : j === columns - 1 ? 'w-1/2 ml-auto' : 'w-4/5'
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};

// -----------------------------------------------------------------------------
// 5. Table Empty State
// -----------------------------------------------------------------------------
interface TableEmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  colSpan: number;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
  };
}

export const TableEmptyState: React.FC<TableEmptyStateProps> = ({
  icon: Icon = PackageSearch,
  title,
  description,
  colSpan,
  action,
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="py-16 text-center text-slate-600 dark:text-[#cdc3d4]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center space-y-3"
        >
          <motion.div
            animate={{
              y: [0, -6, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-12 h-12 rounded-full bg-violet-100 dark:bg-[#dab9ff]/10 border border-violet-200 dark:border-[#dab9ff]/20 flex items-center justify-center text-violet-600 dark:text-[#dab9ff]"
          >
            <Icon className="w-6 h-6 stroke-[1.8]" />
          </motion.div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1]">{title}</h4>
            {description && (
              <p className="text-xs text-slate-500 dark:text-[#978d9d] mt-1 max-w-sm mx-auto">
                {description}
              </p>
            )}
          </div>
          {action && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors shadow-sm mt-2"
            >
              {action.icon && <action.icon className="w-3.5 h-3.5" />}
              <span>{action.label}</span>
            </motion.button>
          )}
        </motion.div>
      </td>
    </tr>
  );
};

// -----------------------------------------------------------------------------
// 6. Animated Table Pagination
// -----------------------------------------------------------------------------
export interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords?: number;
  totalItems?: number;
  itemsPerPage?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  onPageChange: (page: number) => void;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalRecords,
  totalItems,
  itemsPerPage = 15,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageSizeChange,
  onPageChange,
  className,
}) => {
  const finalTotal = totalRecords ?? totalItems ?? 0;
  const finalPageSize = pageSize ?? itemsPerPage;
  const startItem = finalTotal === 0 ? 0 : (currentPage - 1) * finalPageSize + 1;
  const endItem = Math.min(currentPage * finalPageSize, finalTotal);

  return (
    <div
      className={cn(
        'py-2 px-3 border-t border-slate-200 dark:border-[#333333] bg-white dark:bg-[#1a1919] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-[#cdc3d4]',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="tabular-nums text-slate-900 dark:text-[#e5e2e1] font-semibold">
            {startItem}-{endItem}
          </span>
          <span className="text-slate-400 dark:text-[#978d9d]">de</span>
          <span className="tabular-nums text-violet-700 dark:text-[#dab9ff] font-bold">
            {finalTotal}
          </span>
          <span className="text-slate-400 dark:text-[#978d9d]">registros</span>
        </div>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-200 dark:border-[#333333]">
            <span className="text-[11px] text-slate-500 dark:text-[#978d9d] hidden sm:inline">Mostrar:</span>
            <select
              value={finalPageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Registros por página"
              className="bg-slate-50 dark:bg-[#201f1f] text-slate-800 dark:text-[#e5e2e1] border border-slate-200 dark:border-[#333333] hover:border-slate-300 dark:hover:border-[#4b4452] rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] cursor-pointer transition-colors"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-white dark:bg-[#1c1b1b] text-slate-800 dark:text-[#e5e2e1]">
                  {opt} por pág.
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-slate-500 dark:text-[#978d9d] mr-1 hidden sm:inline">
          Pág. <strong className="text-slate-900 dark:text-[#e5e2e1]">{currentPage}</strong> de{' '}
          <strong className="text-slate-900 dark:text-[#e5e2e1]">{totalPages || 1}</strong>
        </span>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          title="Primera página"
          aria-label="Primera página"
          className="p-1.5 rounded-md border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100 hover:border-slate-300 dark:hover:border-[#4b4452] disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          title="Página anterior"
          aria-label="Página anterior"
          className="p-1.5 rounded-md border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100 hover:border-slate-300 dark:hover:border-[#4b4452] disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Página siguiente"
          aria-label="Página siguiente"
          className="p-1.5 rounded-md border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100 hover:border-slate-300 dark:hover:border-[#4b4452] disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title="Última página"
          aria-label="Última página"
          className="p-1.5 rounded-md border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f] text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] hover:bg-slate-100 hover:border-slate-300 dark:hover:border-[#4b4452] disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// 7. Column Filter Controls (Compact in-header inputs)
// -----------------------------------------------------------------------------
interface ColumnFilterInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export const ColumnFilterInput: React.FC<ColumnFilterInputProps> = ({
  value,
  onChange,
  placeholder = 'Filtrar...',
  className,
}) => {
  return (
    <div className={cn('relative w-full min-w-[90px]', className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-6 pr-5 py-1 text-[11px] rounded bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-slate-900 dark:text-[#e5e2e1] placeholder-slate-400 dark:placeholder-[#6b6272] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] font-normal transition-colors"
      />
      <Search className="w-3 h-3 text-slate-400 dark:text-[#6b6272] absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#978d9d] hover:text-slate-700 dark:hover:text-[#e5e2e1] p-0.5"
          title="Limpiar"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
};

interface ColumnFilterSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  className?: string;
}

export const ColumnFilterSelect: React.FC<ColumnFilterSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Todos',
  className,
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full py-1 px-2 text-[11px] rounded bg-white dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] font-normal cursor-pointer transition-colors',
        className
      )}
    >
      <option value="" className="bg-white dark:bg-[#1c1b1b] text-slate-500 dark:text-[#978d9d]">
        {placeholder}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">
          {opt.label}
        </option>
      ))}
    </select>
  );
};
