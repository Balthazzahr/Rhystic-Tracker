import { useState, useMemo, useCallback } from 'react';

export interface BaseColumn {
  key: string;
  label: string;
  description?: string;
  visible: boolean;
  [key: string]: any;
}

export interface UseColumnManagerOptions<T extends BaseColumn> {
  storageKey: string;
  defaultColumns: T[];
  filterColumn?: (col: T) => boolean;
}

export interface UseColumnManagerReturn<T extends BaseColumn> {
  columns: T[];
  visibleColumns: T[];
  showColumnModal: boolean;
  setShowColumnModal: (show: boolean) => void;
  toggleColumnVisibility: (key: string) => void;
  moveColumn: (fromIdx: number, toIdx: number) => void;
  resetColumns: () => void;
  setColumns: (cols: T[]) => void;
}

export function useColumnManager<T extends BaseColumn>({
  storageKey,
  defaultColumns,
  filterColumn,
}: UseColumnManagerOptions<T>): UseColumnManagerReturn<T> {
  const [columns, setColumnsState] = useState<T[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: T[] = JSON.parse(saved);
        const existingKeys = new Set(parsed.map((c) => c.key));
        const missing = defaultColumns.filter((c) => !existingKeys.has(c.key));
        return [...parsed, ...missing];
      }
    } catch (e) {
      console.error(`Failed to load column configuration for ${storageKey}:`, e);
    }
    return defaultColumns;
  });

  const [showColumnModal, setShowColumnModal] = useState(false);

  const saveColumns = useCallback((newCols: T[]) => {
    setColumnsState(newCols);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newCols));
    } catch (e) {
      console.error(`Failed to persist columns for ${storageKey}:`, e);
    }
  }, [storageKey]);

  const toggleColumnVisibility = useCallback((key: string) => {
    setColumnsState((prev) => {
      const updated = prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c));
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (e) {
        console.error(`Failed to persist columns for ${storageKey}:`, e);
      }
      return updated;
    });
  }, [storageKey]);

  const moveColumn = useCallback((fromIdx: number, toIdx: number) => {
    setColumnsState((prev) => {
      if (toIdx < 0 || toIdx >= prev.length || fromIdx === toIdx) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (e) {
        console.error(`Failed to persist columns for ${storageKey}:`, e);
      }
      return updated;
    });
  }, [storageKey]);

  const resetColumns = useCallback(() => {
    saveColumns(defaultColumns);
  }, [saveColumns, defaultColumns]);

  const visibleColumns = useMemo(() => {
    return columns.filter((c) => c.visible && (!filterColumn || filterColumn(c)));
  }, [columns, filterColumn]);

  return {
    columns,
    visibleColumns,
    showColumnModal,
    setShowColumnModal,
    toggleColumnVisibility,
    moveColumn,
    resetColumns,
    setColumns: saveColumns,
  };
}
