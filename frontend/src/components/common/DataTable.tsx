import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Download, Plus, RefreshCw, ChevronUp, ChevronDown, Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  width?: string;
  hidden?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  isLoading?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  onPageChange?: (page: number) => void;
  onSort?: (key: string, order: 'asc' | 'desc') => void;
  onRowClick?: (item: T) => void;
  onAdd?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  addLabel?: string;
  title?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  headerActions?: React.ReactNode;
  bulkActions?: React.ReactNode;
  selectedIds?: Set<number>;
  onSelectAll?: (checked: boolean) => void;
  onSelectRow?: (id: number, checked: boolean) => void;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  total = 0,
  page = 1,
  pageSize = 20,
  isLoading,
  searchPlaceholder = 'Search...',
  onSearch,
  onPageChange,
  onSort,
  onRowClick,
  onAdd,
  onExport,
  onRefresh,
  addLabel = 'Add New',
  title,
  emptyMessage = 'No records found.',
  emptyIcon,
  headerActions,
  bulkActions,
  selectedIds,
  onSelectAll,
  onSelectRow,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const totalPages = Math.ceil(total / pageSize) || 1;
  const hasSelection = selectedIds && onSelectAll && onSelectRow;
  const allSelected = hasSelection && data.length > 0 && data.every(item => selectedIds.has(item.id));
  const visibleColumns = columns.filter(c => !c.hidden);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    onSearch?.(q);
  };

  const handleSort = (key: string) => {
    const newOrder = sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortKey(key);
    setSortOrder(newOrder);
    onSort?.(key, newOrder);
  };

  const triggerAction = (action?: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    action?.();
  };

  return (
    <div className="card p-0 overflow-visible">
      {/* Header toolbar */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {title && <h3 className="font-semibold text-gray-900 text-[15px] whitespace-nowrap">{title}</h3>}
          {total > 0 && (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {Number(total ?? 0).toLocaleString('en-IN')}
            </span>
          )}
          {onSearch && (
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 w-56 bg-gray-50 focus:bg-white transition-all"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {bulkActions && selectedIds && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mr-2 pr-2 border-r border-gray-200">
              <span className="text-xs font-semibold text-primary-600">{selectedIds.size} selected</span>
              {bulkActions}
            </div>
          )}
          {headerActions}
          {onRefresh && (
            <button type="button" onClick={triggerAction(onRefresh)} className="btn-icon" title="Refresh">
              <RefreshCw size={16} />
            </button>
          )}
          {onExport && (
            <button type="button" onClick={triggerAction(onExport)} className="btn-secondary py-1.5 px-3 flex items-center gap-1.5 text-xs">
              <Download size={14} /> Export
            </button>
          )}
          {onAdd && (
            <button type="button" onClick={triggerAction(onAdd)} className="btn-primary py-1.5 px-3 flex items-center gap-1.5 text-xs">
              <Plus size={14} /> {addLabel}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-visible relative">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {hasSelection && (
                <th className="table-header w-10 pl-5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                  />
                </th>
              )}
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`table-header ${col.sortable ? 'cursor-pointer hover:text-gray-700 select-none' : ''} ${col.className || ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {col.sortable && sortKey === col.key && (
                      sortOrder === 'asc'
                        ? <ChevronUp size={13} className="text-primary-600" />
                        : <ChevronDown size={13} className="text-primary-600" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {hasSelection && <td className="table-cell pl-5"><div className="w-3.5 h-3.5 bg-gray-200 rounded" /></td>}
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="table-cell">
                      <div className="h-4 bg-gray-100 rounded-md w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (hasSelection ? 1 : 0)} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    {emptyIcon || <Inbox size={36} className="text-gray-300" />}
                    <p className="text-sm font-medium text-gray-400">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  className={`hover:bg-gray-50/80 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${
                    selectedIds?.has(item.id) ? 'bg-primary-50/40' : ''
                  }`}
                  onClick={() => onRowClick?.(item)}
                >
                  {hasSelection && (
                    <td className="table-cell pl-5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => onSelectRow(item.id, e.target.checked)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                      />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={`table-cell ${col.className || ''}`}>
                      {col.render ? col.render(item) : item[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <p className="text-xs text-gray-500 font-medium">
            Showing <span className="text-gray-700">{((page - 1) * pageSize) + 1}</span> to <span className="text-gray-700">{Math.min(page * pageSize, total)}</span> of <span className="text-gray-700">{Number(total ?? 0).toLocaleString('en-IN')}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange?.(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                    page === pageNum
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
