import React from 'react';

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortKey?: string;
  description?: string;
}

export interface TableShellProps<T = any> {
  columns: TableColumn[];
  // Sorting state & handler owned by parent view
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (sortKey: string) => void;
  accentColor?: string;

  // Render modes
  items?: T[];
  renderRow?: (item: T, index: number) => React.ReactNode;
  children?: React.ReactNode; // For virtualized or custom table viewports

  // Empty state
  empty?: boolean;
  emptyIcon?: React.ReactNode;
  emptyMessage?: React.ReactNode;

  // Virtualization / scroll container ref
  scrollRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

export function TableShell<T = any>({
  columns,
  sortKey,
  sortDir = 'desc',
  onSortChange,
  accentColor = '#A855F7',
  items,
  renderRow,
  children,
  empty = false,
  emptyIcon,
  emptyMessage = 'No records found matching your filter criteria.',
  scrollRef,
  className = '',
}: TableShellProps<T>) {
  const sortArrow = (key: string) => {
    if (sortKey !== key) return null;
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const isPrimaryLeft = (col: TableColumn) => {
    if (col.align === 'left') return true;
    if (col.align === 'center') return false;
    // Default fallback: match common entity columns
    return col.key === 'matchup' || col.key === 'deck' || col.key === 'name' || col.key === 'achievement';
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 overflow-hidden relative ${className}`}>
      {/* Floating Frozen Table Header */}
      <div className="flex items-center h-[34px] px-4 shrink-0 select-none text-xs font-sans font-bold text-white">
        {columns.map((col) => {
          const sortable = Boolean(col.sortKey && onSortChange);
          const leftAligned = isPrimaryLeft(col);

          return (
            <div
              key={col.key}
              className={`${col.width || 'flex-1'} px-1.5 min-w-0 ${
                leftAligned ? 'text-left' : 'text-center'
              }`}
            >
              {sortable ? (
                <button
                  type="button"
                  onClick={() => col.sortKey && onSortChange?.(col.sortKey)}
                  className={`group inline-flex items-center gap-1 hover:text-neutral-200 transition-colors cursor-pointer text-white font-bold ${
                    leftAligned ? 'justify-start' : 'justify-center w-full'
                  }`}
                  style={{ color: sortKey === col.sortKey ? accentColor : '#FFFFFF' }}
                >
                  <span className="truncate">{col.label}</span>
                  <span className="text-[9px] font-mono shrink-0">{sortArrow(col.sortKey!)}</span>
                </button>
              ) : (
                <div className={`flex items-center ${leftAligned ? 'justify-start' : 'justify-center'}`}>
                  <span className="truncate">{col.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Table Body Container Frame */}
      <div className="border border-white/10 bg-neutral-950/50 backdrop-blur-md overflow-hidden flex flex-col flex-1 min-h-0 relative">
        {/* Scrollable Rows Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative custom-scrollbar divide-y divide-white/5">
          {empty ? (
            <div className="flex flex-col items-center justify-center h-48 text-neutral-500 font-sans italic p-8 text-center">
              {emptyIcon && <div className="opacity-20 mb-2">{emptyIcon}</div>}
              <span className="text-xs">{emptyMessage}</span>
            </div>
          ) : children ? (
            children
          ) : items && renderRow ? (
            items.map((item, index) => renderRow(item, index))
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default TableShell;
