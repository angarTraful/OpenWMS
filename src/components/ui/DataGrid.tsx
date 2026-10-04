import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Filter,
  ArrowUpDown,
  ArrowUp,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TableContainer,
  SortableHeaderCell,
  AnimatedTableRow,
  TableSkeleton,
  TableEmptyState,
  TablePagination,
  ColumnFilterInput,
  ColumnFilterSelect,
} from './AnimatedTable';

export interface DataGridColumn<T> {
  id: string;
  header: string;
  accessor?: (row: T) => any;
  sortable?: boolean;
  sortAccessor?: (row: T) => any;
  filterable?: boolean;
  filterType?: 'text' | 'select';
  filterOptions?: { label: string; value: string }[];
  filterPlaceholder?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
  width?: string;
  cell?: (row: T, index: number) => React.ReactNode;
}

export interface DataGridProps<T> {
  data: T[];
  columns: DataGridColumn<T>[];
  initialSortField?: string;
  initialSortAsc?: boolean;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  showGlobalSearch?: boolean;
  showColumnFiltersToggle?: boolean;
  defaultShowColumnFilters?: boolean;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | number;
  getRowId?: (row: T) => string | number;
  extraToolbarActions?: React.ReactNode;
  title?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  glow?: boolean;
  className?: string;
}

export function DataGrid<T extends Record<string, any>>({
  data,
  columns,
  initialSortField,
  initialSortAsc = true,
  initialPageSize = 15,
  pageSizeOptions = [10, 25, 50, 100],
  isLoading = false,
  searchPlaceholder = 'Buscar en la tabla...',
  showGlobalSearch = true,
  showColumnFiltersToggle = true,
  defaultShowColumnFilters = false,
  onRowClick,
  selectedRowId,
  getRowId,
  extraToolbarActions,
  title,
  emptyTitle = 'No se encontraron registros',
  emptyDescription = 'No hay datos coincidentes con los filtros aplicados.',
  glow = false,
  className,
}: DataGridProps<T>) {
  // State
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFiltersRow, setShowFiltersRow] = useState(defaultShowColumnFilters);
  const [sortField, setSortField] = useState<string | null>(initialSortField || null);
  const [sortAsc, setSortAsc] = useState<boolean>(initialSortAsc);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return Object.values(columnFilters).filter((v) => v && v.trim() !== '').length;
  }, [columnFilters]);

  // Set individual column filter
  const handleColumnFilterChange = (colId: string, val: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (!val || val.trim() === '') {
        delete next[colId];
      } else {
        next[colId] = val;
      }
      return next;
    });
    setCurrentPage(1);
  };

  // Clear all filters
  const handleClearAllFilters = () => {
    setGlobalSearch('');
    setColumnFilters({});
    setCurrentPage(1);
  };

  // Sort toggle
  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortAsc) {
        setSortAsc(false); // second click -> desc
      } else {
        setSortField(null); // third click -> reset sort
        setSortAsc(true);
      }
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // 1. Filtered Data
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      // Global search
      if (globalSearch.trim()) {
        const query = globalSearch.toLowerCase();
        const matchesGlobal = columns.some((col) => {
          let val: any;
          if (col.accessor) {
            val = col.accessor(row);
          } else {
            val = row[col.id];
          }
          if (val == null) return false;
          return String(val).toLowerCase().includes(query);
        });
        if (!matchesGlobal) return false;
      }

      // Column filters
      for (const [colId, filterVal] of Object.entries(columnFilters)) {
        if (!filterVal || filterVal.trim() === '') continue;
        const col = columns.find((c) => c.id === colId);
        if (!col) continue;

        let val: any;
        if (col.accessor) {
          val = col.accessor(row);
        } else {
          val = row[col.id];
        }

        if (val == null) return false;

        if (col.filterType === 'select') {
          if (String(val).toLowerCase() !== filterVal.toLowerCase()) {
            return false;
          }
        } else {
          if (!String(val).toLowerCase().includes(filterVal.toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    });
  }, [data, columns, globalSearch, columnFilters]);

  // 2. Sorted Data
  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;

    const col = columns.find((c) => c.id === sortField);
    if (!col) return filteredData;

    return [...filteredData].sort((a, b) => {
      let valA: any;
      let valB: any;

      if (col.sortAccessor) {
        valA = col.sortAccessor(a);
        valB = col.sortAccessor(b);
      } else if (col.accessor) {
        valA = col.accessor(a);
        valB = col.accessor(b);
      } else {
        valA = a[sortField];
        valB = b[sortField];
      }

      // Handle nulls
      if (valA == null && valB == null) return 0;
      if (valA == null) return sortAsc ? 1 : -1;
      if (valB == null) return sortAsc ? -1 : 1;

      // Numbers
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }

      // Booleans
      if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        return sortAsc ? (valA === valB ? 0 : valA ? -1 : 1) : (valA === valB ? 0 : valA ? 1 : -1);
      }

      // Strings & Dates
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredData, sortField, sortAsc, columns]);

  // 3. Paginated Data
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, safeCurrentPage, pageSize]);

  // Automatically reset to page 1 if current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const hasActiveFilters = Boolean(globalSearch.trim() || activeFiltersCount > 0);

  return (
    <TableContainer glow={glow} className={className}>
      {/* Table Toolbar */}
      <div className="p-3.5 border-b border-[#333333] bg-[#1a1919] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[280px]">
          {title && <div className="text-sm font-bold text-[#e5e2e1]">{title}</div>}

          {/* Global Search */}
          {showGlobalSearch && (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-[#978d9d] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[#333333] bg-[#131313] text-[#e5e2e1] placeholder-[#6b6272] focus:outline-none focus:border-[#dab9ff] font-normal transition-colors"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearch('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#978d9d] hover:text-[#e5e2e1] p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Column Filters Toggle Button */}
          {showColumnFiltersToggle && (
            <button
              type="button"
              onClick={() => setShowFiltersRow(!showFiltersRow)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                showFiltersRow || activeFiltersCount > 0
                  ? 'border-[#dab9ff]/50 bg-[#28153c] text-[#dab9ff]'
                  : 'border-[#333333] bg-[#201f1f] text-[#cdc3d4] hover:text-[#e5e2e1] hover:border-[#4b4452]'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros Columna</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#dab9ff] text-[#460283] text-[10px] font-bold inline-flex items-center justify-center ml-0.5">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          )}

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              title="Restablecer todos los filtros"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#ffb4ab] hover:text-[#ffdad6] hover:bg-[#381015]/40 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center gap-2">
          {extraToolbarActions}
          <div className="text-xs text-[#cdc3d4] font-mono px-2 hidden md:block">
            <span className="text-[#dab9ff] font-bold">{sortedData.length}</span>
            {sortedData.length !== data.length && (
              <span className="text-[#978d9d]"> de {data.length}</span>
            )}{' '}
            registros
          </div>
        </div>
      </div>

      {/* Table Body Container */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-[#1c1b1b] text-[#cdc3d4] border-b border-[#44424a] select-none z-10">
            {/* Headers row */}
            <tr>
              {columns.map((col) => {
                if (col.sortable) {
                  return (
                    <SortableHeaderCell
                      key={col.id}
                      label={col.header}
                      field={col.id}
                      currentSortField={sortField || undefined}
                      sortAsc={sortAsc}
                      onSort={handleSort}
                      align={col.align}
                      className={cn(col.headerClassName, col.width && `w-[${col.width}]`)}
                    />
                  );
                }

                return (
                  <th
                    key={col.id}
                    className={cn(
                      'py-3 px-3 font-semibold text-xs tracking-wider uppercase text-[#cdc3d4]',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.headerClassName,
                      col.width && `w-[${col.width}]`
                    )}
                  >
                    {col.header}
                  </th>
                );
              })}
            </tr>

            {/* Subheader Column Filters Row */}
            {showFiltersRow && (
              <tr className="bg-[#161515] border-b border-[#333333]">
                {columns.map((col) => {
                  if (!col.filterable) {
                    return <th key={`filter-${col.id}`} className="py-1.5 px-2 font-normal" />;
                  }

                  const currentValue = columnFilters[col.id] || '';

                  return (
                    <th key={`filter-${col.id}`} className="py-1.5 px-2 font-normal">
                      {col.filterType === 'select' && col.filterOptions ? (
                        <ColumnFilterSelect
                          value={currentValue}
                          onChange={(val) => handleColumnFilterChange(col.id, val)}
                          options={col.filterOptions}
                          placeholder={col.filterPlaceholder || 'Todos'}
                        />
                      ) : (
                        <ColumnFilterInput
                          value={currentValue}
                          onChange={(val) => handleColumnFilterChange(col.id, val)}
                          placeholder={col.filterPlaceholder || `Filtrar...`}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-[#44424a]">
            {isLoading ? (
              <TableSkeleton columns={columns.length} rows={pageSize > 15 ? 10 : pageSize} />
            ) : paginatedData.length === 0 ? (
              <TableEmptyState
                colSpan={columns.length}
                title={emptyTitle}
                description={emptyDescription}
              />
            ) : (
              paginatedData.map((row, idx) => {
                const rowId = getRowId ? getRowId(row) : row.id ?? idx;
                const isSelected = selectedRowId != null && selectedRowId === rowId;

                return (
                  <AnimatedTableRow
                    key={String(rowId)}
                    index={idx}
                    isSelected={isSelected}
                    isClickable={Boolean(onRowClick)}
                    onClick={() => onRowClick && onRowClick(row)}
                  >
                    {columns.map((col) => {
                      let content: React.ReactNode;
                      if (col.cell) {
                        content = col.cell(row, idx);
                      } else if (col.accessor) {
                        content = col.accessor(row);
                      } else {
                        content = row[col.id];
                      }

                      return (
                        <td
                          key={col.id}
                          className={cn(
                            'py-3 px-3',
                            col.align === 'right' && 'text-right',
                            col.align === 'center' && 'text-center',
                            col.className
                          )}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </AnimatedTableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer with Page Size Selector */}
      <TablePagination
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalRecords={sortedData.length}
        itemsPerPage={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
      />
    </TableContainer>
  );
}
