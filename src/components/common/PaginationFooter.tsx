import React from 'react';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';

export interface PaginationFooterProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number, dir?: 'prev' | 'next') => void;
  totalCount?: number;
  unitLabel?: string;
  unitPluralLabel?: string;
  countSuffix?: string; // e.g. "recorded" -> "12 matches recorded"
  rightSummary?: React.ReactNode;
  className?: string;
}

export const PaginationFooter: React.FC<PaginationFooterProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalCount,
  unitLabel,
  unitPluralLabel,
  countSuffix = '',
  rightSummary,
  className = '',
}) => {
  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const hasMultiplePages = totalPages > 1;

  const defaultPlural = unitLabel
    ? unitPluralLabel || (unitLabel.endsWith('h') || unitLabel.endsWith('s') ? `${unitLabel}es` : `${unitLabel}s`)
    : '';

  return (
    <div className={`shrink-0 flex items-center gap-3 pt-2 ${className}`}>
      {hasMultiplePages && (
        <>
          <div className="flex-1 flex justify-start">
            <button
              onClick={() => onPageChange(1, 'prev')}
              disabled={safePage <= 1}
              className="flex items-center justify-center p-1.5 text-xs font-bold bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-400 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
              title="First page"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onPageChange(Math.max(1, safePage - 1), 'prev')}
              disabled={safePage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs font-mono text-neutral-400 px-2">
              Page <span className="text-white font-bold">{safePage}</span> of <span className="text-neutral-400">{totalPages}</span>
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1), 'next')}
              disabled={safePage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
      <div className="flex-1 flex justify-end">
        {rightSummary ? (
          rightSummary
        ) : typeof totalCount === 'number' && unitLabel ? (
          <span className="text-xs font-mono text-neutral-400 tabular-nums">
            <span className="text-white font-bold">{totalCount.toLocaleString()}</span>{' '}
            {totalCount === 1 ? unitLabel : defaultPlural}
            {countSuffix ? ` ${countSuffix}` : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
};
