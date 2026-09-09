import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, X, GripVertical, Check, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { BaseColumn } from '../hooks/useColumnManager';

function getContrastTextColor(hexColor?: string): string {
  if (!hexColor) return '#FFFFFF';
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#FFFFFF';
}

export interface ColumnCustomizerModalProps<T extends BaseColumn> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  columns: T[];
  accentColor?: string;
  filterColumn?: (col: T) => boolean;
  onToggleVisibility: (key: string) => void;
  onMoveColumn: (fromIdx: number, toIdx: number) => void;
  onResetColumns: () => void;
}

export function ColumnCustomizerModal<T extends BaseColumn>({
  isOpen,
  onClose,
  title = 'CUSTOMIZE TABLE COLUMNS',
  subtitle = 'Toggle column visibility and drag or click arrows to reorder table columns.',
  columns,
  accentColor = '#A855F7',
  filterColumn,
  onToggleVisibility,
  onMoveColumn,
  onResetColumns,
}: ColumnCustomizerModalProps<T>) {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayColumns = filterColumn ? columns.filter(filterColumn) : columns;

  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedKey(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverKey !== key) {
      setDragOverKey(key);
    }
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    const sourceKey = draggedKey || e.dataTransfer.getData('text/plain');
    if (sourceKey && sourceKey !== targetKey) {
      const fromIdx = columns.findIndex((c) => c.key === sourceKey);
      const toIdx = columns.findIndex((c) => c.key === targetKey);
      if (fromIdx !== -1 && toIdx !== -1) {
        onMoveColumn(fromIdx, toIdx);
      }
    }
    setDraggedKey(null);
    setDragOverKey(null);
  };

  const handleDragEnd = () => {
    setDraggedKey(null);
    setDragOverKey(null);
  };

  const handleMoveRelative = (key: string, direction: -1 | 1) => {
    const displayIdx = displayColumns.findIndex((c) => c.key === key);
    const targetDisplayIdx = displayIdx + direction;
    if (targetDisplayIdx >= 0 && targetDisplayIdx < displayColumns.length) {
      const targetKey = displayColumns[targetDisplayIdx].key;
      const fromIdx = columns.findIndex((c) => c.key === key);
      const toIdx = columns.findIndex((c) => c.key === targetKey);
      if (fromIdx !== -1 && toIdx !== -1) {
        onMoveColumn(fromIdx, toIdx);
      }
    }
  };

  const contrastColor = getContrastTextColor(accentColor);

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-neutral-950/92 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <div>
            <div className="flex items-center gap-2">
              <Columns3 className="w-5 h-5" style={{ color: accentColor }} />
              <h2 className="text-lg font-display font-bold tracking-[0.14em] uppercase text-white">
                {title}
              </h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1 font-sans">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Column List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2">
          {displayColumns.map((col, idx) => {
            const isDragging = draggedKey === col.key;
            const isTarget = dragOverKey === col.key && draggedKey !== null && draggedKey !== col.key;

            return (
              <div
                key={col.key}
                draggable
                onDragStart={(e) => handleDragStart(e, col.key)}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDrop={(e) => handleDrop(e, col.key)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between p-3 border transition-all cursor-move select-none ${
                  isDragging
                    ? 'opacity-30 border-dashed border-white/40 scale-[0.98]'
                    : isTarget
                    ? 'border-2 scale-[1.02] shadow-xl ring-1'
                    : col.visible
                    ? 'bg-white/[0.04] border-white/15 hover:border-white/30'
                    : 'bg-white/[0.01] border-white/5 opacity-50'
                }`}
                style={{
                  borderColor: isTarget ? accentColor : undefined,
                  backgroundColor: isTarget ? `${accentColor}18` : undefined,
                  boxShadow: isTarget ? `0 0 15px ${accentColor}44` : undefined,
                }}
              >
                {/* Left: Grip Handle + Checkbox + Column Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <GripVertical
                    className={`w-4 h-4 shrink-0 cursor-grab active:cursor-grabbing transition-colors ${
                      isTarget ? 'text-white' : 'text-neutral-500'
                    }`}
                  />
                  <button
                    onClick={() => onToggleVisibility(col.key)}
                    className={`w-4 h-4 flex items-center justify-center border text-xs cursor-pointer transition-colors ${
                      col.visible
                        ? 'border-white/40 text-white shadow-sm'
                        : 'border-white/20 text-transparent'
                    }`}
                    style={{
                      backgroundColor: col.visible ? accentColor : 'transparent',
                      borderColor: col.visible ? accentColor : undefined,
                    }}
                  >
                    {col.visible && (
                      <Check className="w-3 h-3 stroke-[3]" style={{ color: contrastColor }} />
                    )}
                  </button>
                  <div>
                    <div className="text-xs font-sans font-bold text-white tracking-wide flex items-center gap-2">
                      <span>{col.label}</span>
                      {col.sortKey && (
                        <span className="text-[9px] font-sans font-normal px-1 py-0.2 bg-white/5 border border-white/10 text-neutral-400">
                          Sortable
                        </span>
                      )}
                      {isTarget && (
                        <span
                          className="text-[9px] font-mono uppercase px-1.5 py-0.2 border font-bold"
                          style={{
                            color: accentColor,
                            borderColor: `${accentColor}66`,
                            backgroundColor: `${accentColor}20`,
                          }}
                        >
                          ⇄ SWAP TO POS #{idx + 1}
                        </span>
                      )}
                    </div>
                    {col.description && (
                      <div className="text-[10.5px] font-mono text-neutral-400 leading-tight">
                        {col.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Reorder Up/Down buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={idx === 0}
                    onClick={() => handleMoveRelative(col.key, -1)}
                    className="p-1 border border-white/10 hover:border-white/30 disabled:opacity-20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    title="Move column left / up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={idx === displayColumns.length - 1}
                    onClick={() => handleMoveRelative(col.key, 1)}
                    className="p-1 border border-white/10 hover:border-white/30 disabled:opacity-20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    title="Move column right / down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <button
            onClick={onResetColumns}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Default</span>
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 text-xs font-sans font-bold tracking-wider uppercase shadow-md transition-colors cursor-pointer"
            style={{
              backgroundColor: accentColor,
              color: contrastColor,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
