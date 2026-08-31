import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Columns3,
  ChevronUp,
  ChevronDown,
  GripVertical,
  X,
  RotateCcw,
  Check,
  ChevronRight,
  ChevronLeft,
  Home,
  Swords,
  Trash2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ManaPip } from './ManaPip';
import { CardNameTooltip } from './CardNameTooltip';

// Helper: Scryfall card art crop URL
const scryfallArtUrl = (name: string): string => {
  if (!name) return '';
  const clean = name.split(' // ')[0].trim();
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(clean)}&format=image&version=art_crop`;
};

// Date Formatters matching Dashboard
const formatTimeAgo = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
};

const formatDateShort = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]}, ${hours}:${mins}`;
};

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
};

// Helper: Calculate high-contrast text color (black vs white) based on background hex
const getContrastTextColor = (hexColor?: string): string => {
  if (!hexColor) return '#FFFFFF';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length < 6) return '#FFFFFF';
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#09090B' : '#FFFFFF';
};

const formatChipColor = (format: string): { bg: string; fg: string; border: string } => {
  const f = (format || '').toLowerCase();
  if (f.includes('standard brawl')) {
    return { bg: '#8a719d18', fg: '#b39ec4', border: '#8a719d38' };
  } else if (f.includes('brawl')) {
    return { bg: '#4A7FA318', fg: '#7FAAC9', border: '#4A7FA338' };
  } else if (f.includes('standard')) {
    return { bg: '#B8503A18', fg: '#D57C69', border: '#B8503A38' };
  } else if (f.includes('historic')) {
    return { bg: '#4A785618', fg: '#76A382', border: '#4A785638' };
  } else if (f.includes('timeless')) {
    return { bg: '#8a719d18', fg: '#b39ec4', border: '#8a719d38' };
  } else if (f.includes('alchemy')) {
    return { bg: '#D4A23718', fg: '#E2BF6F', border: '#D4A23738' };
  } else if (f.includes('explorer') || f.includes('pioneer')) {
    return { bg: '#5B699418', fg: '#8C9AC4', border: '#5B699438' };
  } else if (f.includes('draft') || f.includes('sealed') || f.includes('limited')) {
    return { bg: '#D4A23718', fg: '#E2BF6F', border: '#D4A23738' };
  } else if (f.includes('bot') || f.includes('sparky')) {
    return { bg: '#3D7D7D18', fg: '#6EA8A8', border: '#3D7D7D38' };
  } else if (f.includes('direct') || f.includes('challenge') || f.includes('friendly')) {
    return { bg: '#B8503A18', fg: '#D57C69', border: '#B8503A38' };
  } else if (f.includes('mwm') || f.includes('midweek')) {
    return { bg: '#9E5B8E18', fg: '#C48EB6', border: '#9E5B8E38' };
  } else if (f.includes('gladiator')) {
    return { bg: '#6E8A4218', fg: '#98B36D', border: '#6E8A4238' };
  }
  return { bg: '#94A3B818', fg: '#CBD5E1', border: '#94A3B838' };
};

export interface MatchRecord {
  match_id: string;
  timestamp: string;
  date_str: string;
  format_name: string;
  result: string;
  result_reason?: string;
  duration_seconds: number;
  turns: number;
  going_first: boolean;
  player_deck_name: string;
  player_commander_id?: number;
  player_commander_name?: string;
  player_life_end?: number;
  player_mulligans?: number;
  opponent_name?: string;
  opponent_commander_id?: number;
  opponent_commander_name?: string;
  opponent_mulligans?: number;
  opponent_life_end?: number;
  mana_curve?: number[];
  deck_colors?: string[];
  opponent_colors?: string[];
}

export interface ColumnDef {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'matchup', label: 'Matchup', description: 'Player Deck vs Opponent (combined)', visible: true, width: 'flex-1 min-w-[200px]', align: 'left' },
  { key: 'date', label: 'Date & Time', description: 'Match timestamp and relative time', visible: true, width: 'w-[130px]', align: 'center' },
  { key: 'result', label: 'Result', description: 'Win/Loss indicator and status badge', visible: true, width: 'w-[100px]', align: 'center' },
  { key: 'colors', label: 'Colors', description: 'Player deck mana color identity', visible: true, width: 'w-[90px]', align: 'center' },
  { key: 'format', label: 'Format', description: 'Game format badge', visible: true, width: 'w-[130px]', align: 'center' },
  { key: 'play_draw', label: 'Play', description: 'Opening turn position (Play / Draw)', visible: true, width: 'w-[80px]', align: 'center' },
  { key: 'mana_curve', label: 'Mana Curve', description: 'Mini deck mana histogram', visible: true, width: 'w-[130px]', align: 'center' },
  { key: 'deck', label: 'Deck', description: 'Player deck artwork thumbnail and name', visible: false, width: 'flex-1 min-w-[160px]', align: 'left' },
  { key: 'opponent', label: 'Opponent', description: 'Opponent username (click to filter)', visible: false, width: 'w-[150px]', align: 'left' },
  { key: 'game_stats', label: 'Game Stats', description: 'Turns elapsed and duration', visible: false, width: 'w-[120px]', align: 'center' },
  { key: 'key_cards', label: 'Key Cards', description: 'Mini portraits of notable cards played', visible: false, width: 'w-[105px]', align: 'center' },
  { key: 'life_totals', label: 'Final Life', description: 'Ending life score (You - Opp)', visible: false, width: 'w-[100px]', align: 'center' },
  { key: 'mulligans', label: 'Mulligans', description: 'Opening hand mulligans taken', visible: false, width: 'w-[100px]', align: 'center' },
  { key: 'end_reason', label: 'End Reason', description: 'Victory/defeat condition', visible: false, width: 'w-[110px]', align: 'center' },
  { key: 'opp_colors', label: 'Opp Colors', description: 'Detected opponent deck colors', visible: false, width: 'w-[95px]', align: 'center' },
  { key: 'commanders', label: 'Commanders', description: 'Brawl Commander portraits', visible: false, width: 'w-[120px]', align: 'center' },
  { key: 'delete', label: 'Delete', description: 'Permanently remove match from database', visible: true, width: 'w-[70px]', align: 'center' },
];

interface MatchHistoryViewProps {
  matches: MatchRecord[];
  deckOverview?: any[];
  palette?: any;
  formatOptions?: Array<{ label: string; value: string }>;
  onSelectMatch: (matchId: string) => void;
  onSelectDeck?: (deckName: string) => void;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
  initialSearch?: string;
  onDeleteMatch?: (matchId: string) => void;
}

export const MatchHistoryView: React.FC<MatchHistoryViewProps> = ({
  matches,
  deckOverview = [],
  palette,
  formatOptions = [],
  onSelectMatch,
  onSelectDeck,
  onShowCard,
  initialSearch,
  onDeleteMatch,
}) => {
  const accentColor = palette?.accent || '#A855F7';

  // --- Filter State ---
  const [searchTerm, setSearchTerm] = useState(initialSearch || '');
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [formatFilter, setFormatFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | '7D' | 'LAST_WEEK' | '30D' | 'PREV_MONTH' | 'THIS_YEAR' | 'PREV_YEAR'>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'win' | 'loss'>('ALL');
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'play' | 'draw'>('ALL');
  const [showAdvModal, setShowAdvModal] = useState(false);

  // Match Deletion state
  const [allowMatchDeletion, setAllowMatchDeletion] = useState(() => {
    return localStorage.getItem('allowMatchDeletion') === 'true';
  });
  const [excludeSparkyMatches, setExcludeSparkyMatches] = useState(() => {
    return localStorage.getItem('excludeSparkyMatches') === 'true';
  });
  const [matchToDelete, setMatchToDelete] = useState<MatchRecord | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deletedMatchIds, setDeletedMatchIds] = useState<Set<string>>(new Set());
  const [isDeletingMatch, setIsDeletingMatch] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const handleSettingsChanged = () => {
      setAllowMatchDeletion(localStorage.getItem('allowMatchDeletion') === 'true');
      setExcludeSparkyMatches(localStorage.getItem('excludeSparkyMatches') === 'true');
    };
    window.addEventListener('rhystic_settings_changed', handleSettingsChanged);
    return () => window.removeEventListener('rhystic_settings_changed', handleSettingsChanged);
  }, []);

  const handleOpenDelete = (m: MatchRecord) => {
    setMatchToDelete(m);
    setDeleteStep(1);
    setDeleteError(null);
  };

  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    setIsDeletingMatch(true);
    setDeleteError(null);
    try {
      const id = matchToDelete.match_id;
      await invoke('delete_match', { matchId: id });
      setDeletedMatchIds((prev) => new Set(prev).add(id));
      if (onDeleteMatch) {
        onDeleteMatch(id);
      }
      setMatchToDelete(null);
      setDeleteStep(1);
    } catch (e: any) {
      console.error('Failed to delete match:', e);
      setDeleteError(e?.toString() || 'Failed to delete match');
    } finally {
      setIsDeletingMatch(false);
    }
  };

  useEffect(() => {
    if (initialSearch !== undefined && initialSearch !== '') setSearchTerm(initialSearch);
  }, [initialSearch]);

  // Close the advanced-filter modal on Escape
  useEffect(() => {
    if (!showAdvModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAdvModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdvModal]);

  const TIME_FILTER_OPTIONS: Array<{ id: 'ALL' | '7D' | 'LAST_WEEK' | '30D' | 'PREV_MONTH' | 'THIS_YEAR' | 'PREV_YEAR'; label: string; description: string }> = [
    { id: 'ALL', label: 'All Time', description: 'Entire recorded match history' },
    { id: '7D', label: 'Past 7 Days', description: 'Rolling 7 days from now' },
    { id: 'LAST_WEEK', label: 'Last Week', description: 'Monday to Sunday of previous calendar week' },
    { id: '30D', label: 'Past 30 Days', description: 'Rolling 30 days from now' },
    { id: 'PREV_MONTH', label: 'Previous Month', description: '1st to last day of previous calendar month' },
    { id: 'THIS_YEAR', label: 'This Year', description: 'Jan 1 of current year to present' },
    { id: 'PREV_YEAR', label: 'Previous Year', description: 'Jan 1 to Dec 31 of previous calendar year' },
  ];

  const isMatchInTimeFilter = (timestamp: string, tf: string): boolean => {
    if (tf === 'ALL') return true;
    const matchDate = new Date(timestamp);
    const matchTime = matchDate.getTime();
    if (isNaN(matchTime)) return false;

    const now = new Date();
    const nowTime = now.getTime();

    if (tf === '7D') {
      return matchTime >= nowTime - 7 * 24 * 60 * 60 * 1000;
    }

    if (tf === 'LAST_WEEK') {
      const currentDay = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const daysSinceMonday = (currentDay + 6) % 7; // Mon = 0, Tue = 1, ..., Sun = 6
      const startOfCurrentWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0).getTime();
      const startOfLastWeek = startOfCurrentWeek - 7 * 24 * 60 * 60 * 1000;
      return matchTime >= startOfLastWeek && matchTime < startOfCurrentWeek;
    }

    if (tf === '30D') {
      return matchTime >= nowTime - 30 * 24 * 60 * 60 * 1000;
    }

    if (tf === 'PREV_MONTH') {
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
      return matchTime >= startOfPrevMonth && matchTime < startOfCurrentMonth;
    }

    if (tf === 'THIS_YEAR') {
      const startOfThisYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
      return matchTime >= startOfThisYear;
    }

    if (tf === 'PREV_YEAR') {
      const startOfThisYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
      const startOfPrevYear = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0).getTime();
      return matchTime >= startOfPrevYear && matchTime < startOfThisYear;
    }

    return true;
  };

  // Normalize formatOptions defensively so it supports strings or objects seamlessly
  const normalizedFormatOptions = useMemo(() => {
    return formatOptions
      .map((opt: any) => {
        if (typeof opt === 'string') return { value: opt.toUpperCase(), label: opt };
        if (typeof opt === 'object' && opt !== null) {
          const val = typeof opt.value === 'string' ? opt.value : typeof opt.label === 'string' ? opt.label : '';
          const lbl = typeof opt.label === 'string' ? opt.label : val;
          return { value: val, label: lbl };
        }
        return { value: '', label: '' };
      })
      .filter((o) => o.value && o.value !== 'ALL');
  }, [formatOptions]);

  // --- Column Customizer State ---
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    try {
      const saved = localStorage.getItem('rhystic_match_history_columns');
      if (saved) {
        const parsed: ColumnDef[] = JSON.parse(saved);
        // Merge with any new columns that might have been added in updates
        const existingKeys = new Set(parsed.map((c) => c.key));
        const missing = DEFAULT_COLUMNS.filter((c) => !existingKeys.has(c.key));
        return [...parsed, ...missing];
      }
    } catch (e) {
      console.error('Failed to load column configuration:', e);
    }
    return DEFAULT_COLUMNS;
  });

  const [showColumnModal, setShowColumnModal] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveColumns = (newCols: ColumnDef[]) => {
    setColumns(newCols);
    try {
      localStorage.setItem('rhystic_match_history_columns', JSON.stringify(newCols));
    } catch (e) {
      console.error('Failed to persist columns:', e);
    }
  };

  const toggleColumnVisibility = (key: string) => {
    const updated = columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c));
    saveColumns(updated);
  };

  const moveColumn = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= columns.length || fromIdx === toIdx) return;
    const updated = [...columns];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    saveColumns(updated);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIdx =
      draggedIndex !== null
        ? draggedIndex
        : parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(sourceIdx) && sourceIdx !== targetIndex) {
      moveColumn(sourceIdx, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const resetColumns = () => {
    saveColumns(DEFAULT_COLUMNS);
  };

  // Map deck names to key cards for fast lookup
  const deckKeyCardsMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; grp_id?: number }>>();
    for (const d of deckOverview) {
      if (d.deck_name && d.key_cards) {
        map.set(d.deck_name, d.key_cards);
      }
    }
    return map;
  }, [deckOverview]);

  // Deck artwork lookup
  const getDeckArt = (deckName?: string, commanderName?: string): string => {
    if (commanderName) return commanderName;
    const found = deckOverview.find((d) => d.deck_name === deckName);
    if (found) {
      return found.top_commander_name || found.top_card_name || '';
    }
    return '';
  };

  // --- Filtering Logic ---
  const filteredMatches = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();

    return matches.filter((m) => {
      // 0. Exclude locally deleted matches immediately
      if (deletedMatchIds.has(m.match_id)) return false;

      // Exclude Sparky / Bot / Tutorial matches if enabled
      if (excludeSparkyMatches) {
        const opp = (m.opponent_name || '').toLowerCase();
        const fmt = (m.format_name || '').toLowerCase();
        if (opp.includes('sparky') || opp.includes('bot') || fmt.includes('bot') || fmt.includes('challenge') || fmt.includes('tutorial')) {
          return false;
        }
      }

      // 1. Result filter
      if (resultFilter !== 'ALL' && m.result !== resultFilter) return false;

      // 2. Format filter
      if (formatFilter !== 'ALL') {
        const f = (m.format_name || '').toUpperCase();
        if (f !== formatFilter.toUpperCase()) return false;
      }

      // 3. Time period filter
      if (!isMatchInTimeFilter(m.timestamp, timeFilter)) return false;

      // 4. Position filter (Play vs Draw)
      if (positionFilter !== 'ALL') {
        if (positionFilter === 'play' && !m.going_first) return false;
        if (positionFilter === 'draw' && m.going_first) return false;
      }

      // 5. Color filter (exact color identity matching)
      if (colorFilter.length > 0) {
        if (colorFilter.includes('C')) {
          if ((m.deck_colors || []).length !== 0) return false;
        } else {
          const deckCols = [...(m.deck_colors || [])].sort();
          const selCols = [...colorFilter.filter((c) => c !== 'C')].sort();
          const matchesColor = deckCols.length === selCols.length && deckCols.every((c, i) => c === selCols[i]);
          if (!matchesColor) return false;
        }
      }

      // 6. Search term (deck name, opponent name, commander)
      if (cleanSearch) {
        const dName = (m.player_deck_name || '').toLowerCase();
        const oName = (m.opponent_name || '').toLowerCase();
        const cName = (m.player_commander_name || '').toLowerCase();
        const ocName = (m.opponent_commander_name || '').toLowerCase();
        const matchId = (m.match_id || '').toLowerCase();
        if (
          !dName.includes(cleanSearch) &&
          !oName.includes(cleanSearch) &&
          !cName.includes(cleanSearch) &&
          !ocName.includes(cleanSearch) &&
          !matchId.includes(cleanSearch)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [matches, searchTerm, formatFilter, timeFilter, resultFilter, positionFilter, colorFilter]);

  const hasActiveAdvancedFilters = formatFilter !== 'ALL' || timeFilter !== 'ALL' || resultFilter !== 'ALL' || positionFilter !== 'ALL';

  const activeAdvancedFilterCount =
    (formatFilter !== 'ALL' ? 1 : 0) +
    (timeFilter !== 'ALL' ? 1 : 0) +
    (resultFilter !== 'ALL' ? 1 : 0) +
    (positionFilter !== 'ALL' ? 1 : 0);

  const clearAdvancedFilters = () => {
    setFormatFilter('ALL');
    setTimeFilter('ALL');
    setResultFilter('ALL');
    setPositionFilter('ALL');
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (formatFilter !== 'ALL') {
      const opt = normalizedFormatOptions.find((f) => f.value.toUpperCase() === formatFilter.toUpperCase());
      chips.push({
        key: 'format',
        label: `Format: ${opt?.label || formatFilter}`,
        onRemove: () => setFormatFilter('ALL'),
      });
    }

    if (timeFilter !== 'ALL') {
      const opt = TIME_FILTER_OPTIONS.find((t) => t.id === timeFilter);
      chips.push({
        key: 'time',
        label: opt?.label || timeFilter,
        onRemove: () => setTimeFilter('ALL'),
      });
    }

    if (resultFilter !== 'ALL') {
      chips.push({
        key: 'result',
        label: resultFilter === 'win' ? 'Wins Only' : 'Losses Only',
        onRemove: () => setResultFilter('ALL'),
      });
    }

    if (positionFilter !== 'ALL') {
      chips.push({
        key: 'position',
        label: positionFilter === 'play' ? 'On the Play' : 'On the Draw',
        onRemove: () => setPositionFilter('ALL'),
      });
    }

    return chips;
  }, [formatFilter, timeFilter, resultFilter, positionFilter, normalizedFormatOptions]);

  // --- Pagination (30 matches per page) ---
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  useEffect(() => {
    setPage(1);
  }, [searchTerm, formatFilter, timeFilter, resultFilter, positionFilter, colorFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedMatches = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredMatches.slice(start, start + PAGE_SIZE);
  }, [filteredMatches, safePage]);

  // --- Virtualized Table Setup ---
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: pagedMatches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 54, // Modern crisp row height: 54px
    overscan: 12,
  });

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible && (c.key !== 'delete' || allowMatchDeletion)),
    [columns, allowMatchDeletion]
  );

  // Mini mana histogram renderer
  const renderMiniHistogram = (curve?: number[]) => {
    if (!curve || curve.length === 0) return <span className="opacity-30">—</span>;
    const maxVal = Math.max(...curve, 1);
    return (
      <div className="flex items-end justify-center gap-1 h-5 w-24 mx-auto">
        {curve.slice(0, 7).map((val, idx) => {
          const heightPct = Math.max((val / maxVal) * 100, 15);
          return (
            <div
              key={idx}
              title={`CMC ${idx}: ${val} cards`}
              className="flex-1 bg-white/20 hover:bg-white/50 transition-colors"
              style={{
                height: `${heightPct}%`,
                backgroundColor: idx === 0 ? undefined : `${accentColor}88`,
              }}
            />
          );
        })}
      </div>
    );
  };

  // Render individual cell content based on column key
  const renderCellContent = (col: ColumnDef, m: MatchRecord) => {
    const isWin = m.result === 'win';

    switch (col.key) {
      case 'result':
        return (
          <div className="flex items-center justify-center gap-1.5 w-full">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: isWin ? accentColor : '#52525B',
                boxShadow: isWin ? `0 0 8px ${accentColor}bb` : 'none',
              }}
            />
            <span
              className="font-bold text-[13px] tracking-wider"
              style={{ color: isWin ? accentColor : '#71717A' }}
            >
              {isWin ? 'WIN' : 'LOSS'}
            </span>
          </div>
        );

      case 'date':
        return (
          <div className="flex items-center justify-center w-full text-center">
            <span className="text-neutral-200 text-xs font-medium font-sans">
              {formatDateShort(m.timestamp)}
            </span>
          </div>
        );

      case 'matchup': {
        const deckArt = getDeckArt(m.player_deck_name, m.player_commander_name);
        return (
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {deckArt && (
              <div className="w-7 h-7 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900">
                <img
                  src={scryfallArtUrl(deckArt)}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              </div>
            )}
            <div className="flex items-center gap-1.5 truncate text-[14px] min-w-0">
              <span
                onClick={(e) => {
                  if (onSelectDeck && m.player_deck_name) {
                    e.stopPropagation();
                    onSelectDeck(m.player_deck_name);
                  }
                }}
                className="font-semibold text-neutral-100 hover:text-white truncate hover:underline cursor-pointer"
              >
                {m.player_deck_name}
              </span>
              <span className="text-amber-400/80 font-mono text-[11px] uppercase px-0.5 shrink-0">
                vs
              </span>
              <span
                onClick={(e) => {
                  if (m.opponent_name) {
                    e.stopPropagation();
                    setSearchTerm(m.opponent_name);
                  }
                }}
                title="Click to filter matches by this opponent"
                className="font-semibold truncate hover:underline cursor-pointer"
                style={{ color: accentColor }}
              >
                {m.opponent_name || 'Opponent'}
              </span>
            </div>
          </div>
        );
      }

      case 'deck': {
        const deckArt = getDeckArt(m.player_deck_name, m.player_commander_name);
        return (
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {deckArt && (
              <div className="w-7 h-7 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900">
                <img
                  src={scryfallArtUrl(deckArt)}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              </div>
            )}
            <span
              onClick={(e) => {
                if (onSelectDeck && m.player_deck_name) {
                  e.stopPropagation();
                  onSelectDeck(m.player_deck_name);
                }
              }}
              className="font-semibold text-neutral-100 hover:text-white truncate hover:underline cursor-pointer text-[14px]"
            >
              {m.player_deck_name}
            </span>
          </div>
        );
      }

      case 'opponent':
        return (
          <div className="flex items-center justify-center w-full">
            <span
              onClick={(e) => {
                if (m.opponent_name) {
                  e.stopPropagation();
                  setSearchTerm(m.opponent_name);
                }
              }}
              title="Click to filter matches by this opponent"
              className="font-semibold truncate hover:underline cursor-pointer text-[14px]"
              style={{ color: accentColor }}
            >
              {m.opponent_name || 'Opponent'}
            </span>
          </div>
        );

      case 'format': {
        const fmtName = m.format_name || 'Constructed';
        const chip = formatChipColor(fmtName);
        return (
          <div className="flex items-center justify-center w-full">
            <span
              className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border whitespace-nowrap"
              style={{ backgroundColor: chip.bg, borderColor: chip.border, color: chip.fg }}
            >
              {fmtName}
            </span>
          </div>
        );
      }

      case 'colors':
        return (
          <div className="flex items-center justify-center w-full">
            {m.deck_colors && m.deck_colors.length > 0 ? (
              <div className="flex items-center justify-center gap-0.5">
                {m.deck_colors.map((c) => (
                  <ManaPip key={c} symbol={c} size={14} />
                ))}
              </div>
            ) : (
              <span className="opacity-30 text-xs font-mono">—</span>
            )}
          </div>
        );

      case 'game_stats':
        return (
          <div className="flex items-center justify-center w-full text-xs font-mono text-neutral-300 tabular-nums">
            <span className="text-white font-medium">T{m.turns || '?'}</span>
            <span className="opacity-40 mx-1">·</span>
            <span className="text-neutral-400">{formatDuration(m.duration_seconds)}</span>
          </div>
        );

      case 'play_draw':
        return (
          <div className="flex items-center justify-center w-full">
            {m.going_first !== undefined ? (
              <span
                style={
                  m.going_first
                    ? { backgroundColor: 'rgba(197, 160, 89, 0.15)', borderColor: 'rgba(197, 160, 89, 0.4)', color: '#E5C678' }
                    : { backgroundColor: 'rgba(74, 127, 163, 0.15)', borderColor: 'rgba(74, 127, 163, 0.4)', color: '#7FAAC9' }
                }
                className="text-[10px] font-mono font-bold px-1.5 py-0.5 border"
              >
                {m.going_first ? 'PLAY' : 'DRAW'}
              </span>
            ) : (
              <span className="opacity-30 text-xs font-mono">—</span>
            )}
          </div>
        );

      case 'key_cards': {
        const keyCards = (deckKeyCardsMap.get(m.player_deck_name) || []).slice(0, 3);
        return (
          <div className="flex items-center justify-center w-full">
            {keyCards.length > 0 ? (
              <div className="flex items-center justify-center gap-1">
                {keyCards.map((k) => (
                  <CardNameTooltip key={k.grp_id ?? k.name} name={k.name}>
                    <div
                      className="w-6 h-6 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900 cursor-zoom-in hover:scale-125 transition-transform"
                      onClick={(e) => {
                        if (onShowCard) {
                          e.stopPropagation();
                          onShowCard({ name: k.name, grp_id: k.grp_id }, false);
                        }
                      }}
                    >
                      <img
                        src={scryfallArtUrl(k.name)}
                        alt={k.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = 'hidden';
                        }}
                      />
                    </div>
                  </CardNameTooltip>
                ))}
              </div>
            ) : (
              <span className="opacity-30 text-xs font-mono">—</span>
            )}
          </div>
        );
      }

      case 'mana_curve':
        return (
          <div className="flex items-center justify-center w-full">
            {renderMiniHistogram(m.mana_curve)}
          </div>
        );

      case 'life_totals':
        return (
          <div className="flex items-center justify-center w-full text-center">
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {m.player_life_end ?? '—'} <span className="text-neutral-500 font-normal">:</span> {m.opponent_life_end ?? '—'}
            </span>
          </div>
        );

      case 'mulligans':
        return (
          <div className="flex items-center justify-center w-full text-center">
            <span className="text-xs font-mono text-neutral-300 tabular-nums">
              {m.player_mulligans ?? 0}
            </span>
          </div>
        );

      case 'end_reason':
        return (
          <div className="flex items-center justify-center w-full text-center">
            <span className="text-xs font-sans text-neutral-400 capitalize">
              {m.result_reason?.replace('ResultReason_', '') || '—'}
            </span>
          </div>
        );

      case 'opp_colors':
        return (
          <div className="flex items-center justify-center w-full">
            {m.opponent_colors && m.opponent_colors.length > 0 ? (
              <div className="flex items-center justify-center gap-0.5">
                {m.opponent_colors.map((c) => (
                  <ManaPip key={c} symbol={c} size={14} />
                ))}
              </div>
            ) : (
              <span className="opacity-30 text-xs font-mono">—</span>
            )}
          </div>
        );

      case 'commanders': {
        const pCmd = m.player_commander_name;
        const oCmd = m.opponent_commander_name;
        return (
          <div className="flex items-center justify-center w-full">
            {pCmd || oCmd ? (
              <div className="flex items-center justify-center gap-1.5">
                {pCmd && (
                  <CardNameTooltip name={pCmd}>
                    <img
                      src={scryfallArtUrl(pCmd)}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-white/20"
                    />
                  </CardNameTooltip>
                )}
                {pCmd && oCmd && <span className="text-[10px] text-neutral-500 font-mono">vs</span>}
                {oCmd && (
                  <CardNameTooltip name={oCmd}>
                    <img
                      src={scryfallArtUrl(oCmd)}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-rose-500/40"
                    />
                  </CardNameTooltip>
                )}
              </div>
            ) : (
              <span className="opacity-30 text-xs font-mono">—</span>
            )}
          </div>
        );
      }

      case 'delete':
        return (
          <div className="flex items-center justify-center w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDelete(m);
              }}
              className="p-1.5 text-neutral-400 hover:text-white transition-all cursor-pointer bg-transparent hover:bg-white/[0.08] active:scale-95"
              title="Delete this match permanently"
            >
              <Trash2 className="w-3.5 h-3.5" style={{ color: '#D57C69' }} />
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden">
      {/* 1. TOP HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-battle text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            MATCH HISTORY
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({filteredMatches.length.toLocaleString()} {filteredMatches.length === 1 ? 'match' : 'matches'} recorded across all formats)
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER & CONTROLS TOOLBAR */}
      <div className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap">
        {/* 1. Search Filter */}
        <div className="relative w-64 shrink-0 h-8 flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search deck, opponent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
              title="Clear search filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Mana Color Pips Filter (Exact Color Identity Matching) */}
        <div className="flex items-center gap-1.5 pl-0.5">
          {['W', 'U', 'B', 'R', 'G', 'C'].map((c) => {
            const active = colorFilter.includes(c);
            return (
              <button
                key={c}
                onClick={() =>
                  setColorFilter((prev) =>
                    active ? prev.filter((x) => x !== c) : [...prev, c]
                  )
                }
                className={`transition-all cursor-pointer ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                title={c === 'C' ? 'Colorless Decks Only' : `Filter ${c}`}
              >
                <ManaPip symbol={c} size={22} />
              </button>
            );
          })}
          {colorFilter.length > 0 && (
            <button
              onClick={() => setColorFilter([])}
              className="ml-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-neutral-400 hover:text-white transition-all cursor-pointer"
              title="Clear color filter"
            >
              Clear
            </button>
          )}
        </div>

        {/* 3. Advanced Filters Button */}
        <button
          onClick={() => setShowAdvModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
            hasActiveAdvancedFilters
              ? 'bg-white/[0.08] text-white font-bold'
              : 'bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white'
          }`}
          title="Open advanced match filters"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: accentColor }} />
          {activeAdvancedFilterCount > 0 && (
            <span
              className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full border ml-1"
              style={{
                backgroundColor: `${accentColor}20`,
                borderColor: `${accentColor}60`,
                color: accentColor,
              }}
            >
              {activeAdvancedFilterCount}
            </span>
          )}
        </button>

        {/* 4. Active Filter Chips */}
        {activeChips.map((chip) => (
          <span
            key={chip.key}
            onClick={(e) => { e.stopPropagation(); chip.onRemove(); }}
            className="group flex shrink-0 items-center gap-1 px-2 py-1 text-[11px] font-mono uppercase tracking-wider cursor-pointer transition-colors hover:bg-white/10"
            style={{
              color: '#FFFFFF',
              backgroundColor: `${accentColor}20`,
            }}
            title="Click to remove this filter"
          >
            <span>{chip.label}</span>
            <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
          </span>
        ))}

        <div className="flex-1" />

        {/* 5. Customize Columns Button */}
        <button
          onClick={() => setShowColumnModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all cursor-pointer shrink-0"
          title="Modify, add/remove, and reorder table columns"
        >
          <Columns3 className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span>({visibleColumns.length})</span>
        </button>
      </div>

      {/* 3. TABLE VIEW CONTAINER (Floating Header + Table Body) */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Floating Table Header */}
        <div className="flex items-center h-[34px] px-4 shrink-0 select-none text-xs font-sans font-bold text-white">
          {visibleColumns.map((col) => {
            const isMatchup = col.key === 'matchup' || col.key === 'deck';
            return (
              <div
                key={col.key}
                className={`${col.width || 'flex-1'} px-1.5 ${
                  isMatchup ? 'text-left' : 'text-center'
                }`}
              >
                {col.label}
              </div>
            );
          })}
        </div>

        {/* Main Data Table Body */}
        <div className="flex-1 min-h-0 border border-white/10 bg-neutral-950/50 backdrop-blur-md flex flex-col overflow-hidden">
          {/* Virtualized Rows Viewport */}
          <div ref={parentRef} className="flex-1 overflow-y-auto relative custom-scrollbar divide-y divide-white/5">
            {pagedMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-neutral-500 font-sans italic">
                <Swords className="w-8 h-8 opacity-20 mb-2" />
                <span>No matches found matching your active filter criteria.</span>
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const m = pagedMatches[virtualRow.index];
                  if (!m) return null;
                  return (
                    <div
                      key={m.match_id}
                      onClick={() => onSelectMatch(m.match_id)}
                      className="absolute top-0 left-0 w-full flex items-center py-2 px-4 border-b border-white/5 transition-colors cursor-pointer group hover:bg-white/[0.04]"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {visibleColumns.map((col) => {
                        const isMatchup = col.key === 'matchup' || col.key === 'deck' || col.key === 'opponent';
                        return (
                          <div
                            key={col.key}
                            className={`${col.width || 'flex-1'} px-1.5 min-w-0 ${
                              isMatchup ? 'text-left' : 'text-center flex items-center justify-center'
                            }`}
                          >
                            {renderCellContent(col, m)}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: pagination controls + total match count */}
      <div className="shrink-0 flex items-center gap-3 pt-2">
        {totalPages > 1 && (
          <>
            <div className="flex-1 flex justify-start">
              <button
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                className="flex items-center justify-center p-1.5 text-xs font-bold bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-400 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
                title="First page"
              >
                <Home className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs font-mono text-neutral-400 px-2">
                Page <span className="text-white font-bold">{safePage}</span> of <span className="text-neutral-400">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
        <div className="flex-1 flex justify-end">
          <span className="text-xs font-mono text-neutral-400 tabular-nums">
            <span className="text-white font-bold">{filteredMatches.length.toLocaleString()}</span> {filteredMatches.length === 1 ? 'match' : 'matches'} recorded
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. ADVANCED FILTERS MODAL */}
      {/* ========================================================================= */}
      {showAdvModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setShowAdvModal(false)}
        >
          <div
            className="w-[850px] max-w-full max-h-[85vh] flex flex-col bg-neutral-950/92 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5" style={{ color: accentColor }} />
                <h2 className="text-lg font-display font-bold tracking-[0.14em] uppercase text-white">
                  ADVANCED MATCH FILTERS
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAdvancedFilters}
                  className="text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer mr-2"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setShowAdvModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: 2 Columns */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Left Column: Format & Time Periods */}
              <div className="w-1/2 shrink-0 border-r border-white/10 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-neutral-950/60">
                {/* Format Selection */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2.5">
                    GAME FORMAT
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setFormatFilter('ALL')}
                      className={`px-2.5 py-1 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                        formatFilter === 'ALL'
                          ? 'border-white/40 bg-white/[0.1] text-white font-bold shadow-sm'
                          : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white'
                      }`}
                    >
                      All Formats
                    </button>
                    {normalizedFormatOptions.map((opt) => {
                      const active = formatFilter.toUpperCase() === opt.value.toUpperCase();
                      const chip = formatChipColor(opt.label);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setFormatFilter(opt.value)}
                          className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border transition-all cursor-pointer ${
                            active
                              ? 'scale-105 font-bold shadow-sm'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: active ? chip.bg : 'rgba(255,255,255,0.02)',
                            borderColor: active ? chip.border : 'rgba(255,255,255,0.1)',
                            color: active ? chip.fg : '#A1A1AA',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Period Filter */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2.5">
                    TIME PERIOD
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {TIME_FILTER_OPTIONS.map((t) => {
                      const active = timeFilter === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTimeFilter(t.id)}
                          className={`w-full text-left px-3 py-2 border transition-colors cursor-pointer flex items-center justify-between ${
                            active
                              ? 'border-white/40 bg-white/[0.08] text-white font-semibold'
                              : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: active ? accentColor : undefined }}>
                              {t.label}
                            </div>
                            <div className="text-[10px] text-neutral-500 font-sans mt-0.5">
                              {t.description}
                            </div>
                          </div>
                          {active && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Hero Deck & Result */}
              <div className="w-1/2 shrink-0 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-neutral-950/60">
                {/* Deck Selection */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2.5">
                    DECK PLAYED
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    <button
                      onClick={() => setDeckFilter('ALL')}
                      className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                        deckFilter === 'ALL'
                          ? 'border-white/40 bg-white/10 text-white font-bold'
                          : 'border-white/10 bg-black/40 text-neutral-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      All Decks
                    </button>
                    {deckOptions.map((deck) => (
                      <button
                        key={deck}
                        onClick={() => setDeckFilter(deck)}
                        className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border truncate max-w-[200px] ${
                          deckFilter === deck
                            ? 'border-white/40 bg-white/10 text-white font-bold'
                            : 'border-white/10 bg-black/40 text-neutral-400 hover:text-white hover:border-white/20'
                        }`}
                        title={deck}
                      >
                        {deck}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Match Result */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2.5">
                    MATCH RESULT
                  </p>
                  <div className="flex items-center gap-2">
                    {[
                      { id: 'ALL', label: 'All Results' },
                      { id: 'win', label: 'Wins Only' },
                      { id: 'loss', label: 'Losses Only' },
                    ].map((res) => (
                      <button
                        key={res.id}
                        onClick={() => setResultFilter(res.id)}
                        className={`flex-1 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border text-center ${
                          resultFilter === res.id
                            ? 'border-white/40 bg-white/10 text-white font-bold'
                            : 'border-white/10 bg-black/40 text-neutral-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Turn Position: Play vs Draw */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2.5">
                    TURN POSITION (PLAY / DRAW)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'ALL', label: 'All Positions' },
                      { id: 'play', label: 'On the Play' },
                      { id: 'draw', label: 'On the Draw' },
                    ].map((p) => {
                      const active = positionFilter === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setPositionFilter(p.id as any)}
                          className={`px-3 py-2 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer text-center ${
                            active
                              ? 'border-white/40 bg-white/[0.08] text-white font-bold shadow-sm'
                              : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white'
                          }`}
                          style={{
                            color: active ? (p.id === 'play' ? '#FCD34D' : p.id === 'draw' ? '#93C5FD' : accentColor) : undefined,
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-neutral-900/40 flex items-center justify-between shrink-0">
              <span className="text-xs font-mono text-neutral-400">
                <span className="text-white font-bold">{filteredMatches.length.toLocaleString()}</span> {filteredMatches.length === 1 ? 'match' : 'matches'} match active filters
              </span>
              <button
                onClick={() => setShowAdvModal(false)}
                className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider font-bold border border-white/20 bg-white/[0.08] hover:bg-white/[0.15] text-white transition-colors cursor-pointer"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CUSTOMIZE COLUMNS MODAL (Drag & Drop + Toggle Visibility + Persistence) */}
      {/* ========================================================================= */}
      {showColumnModal && (
        <div
          onClick={() => setShowColumnModal(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
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
                    CUSTOMIZE TABLE COLUMNS
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-sans">
                  Toggle column visibility and drag or click arrows to reorder table columns.
                </p>
              </div>
              <button
                onClick={() => setShowColumnModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Column List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2">
              {columns
                .filter((col) => col.key !== 'delete' || allowMatchDeletion)
                .map((col, idx) => {
                const isDragging = draggedIndex === idx;
                const isTarget = dragOverIndex === idx && draggedIndex !== null && draggedIndex !== idx;

                return (
                  <div
                    key={col.key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
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
                        onClick={() => toggleColumnVisibility(col.key)}
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
                          <Check
                            className="w-3 h-3 stroke-[3]"
                            style={{ color: getContrastTextColor(accentColor) }}
                          />
                        )}
                      </button>
                      <div>
                        <div className="text-xs font-sans font-bold text-white tracking-wide flex items-center gap-2">
                          <span>{col.label}</span>
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
                        <div className="text-[10.5px] font-mono text-neutral-400 leading-tight">
                          {col.description}
                        </div>
                      </div>
                    </div>

                    {/* Right: Reorder Up/Down buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        disabled={idx === 0}
                        onClick={() => moveColumn(idx, idx - 1)}
                        className="p-1 border border-white/10 hover:border-white/30 disabled:opacity-20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                        title="Move column left / up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === columns.length - 1}
                        onClick={() => moveColumn(idx, idx + 1)}
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
                onClick={resetColumns}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Default</span>
              </button>
              <button
                onClick={() => setShowColumnModal(false)}
                className="px-6 py-2 text-xs font-sans font-bold tracking-wider uppercase shadow-md transition-colors cursor-pointer"
                style={{
                  backgroundColor: accentColor,
                  color: getContrastTextColor(accentColor),
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. DELETE MATCH CONFIRMATION MODAL (2-Step Safety Verification)          */}
      {/* ========================================================================= */}
      {matchToDelete && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none"
          onClick={() => setMatchToDelete(null)}
        >
          <div 
            className="w-full max-w-md bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div className="flex items-center gap-2.5" style={{ color: '#D57C69' }}>
                <Trash2 className="w-5 h-5" />
                <h3 className="text-sm font-sans font-bold uppercase tracking-wide text-white">
                  {deleteStep === 1 ? 'Delete Match' : 'Are You Sure?'}
                </h3>
              </div>
              <button
                onClick={() => setMatchToDelete(null)}
                className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Body: Step 1 */}
            {deleteStep === 1 && (
              <div className="p-5 space-y-3">
                <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                  Confirm that you wish to delete this match from the match history database:
                </p>
                <div className="p-3 border border-white/10 bg-white/[0.02] space-y-1 font-mono text-xs">
                  <p className="text-white font-bold">
                    {matchToDelete.player_deck_name}{' '}
                    <span className="text-neutral-500 font-normal">vs</span>{' '}
                    {matchToDelete.opponent_name || 'Opponent'}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {formatDateShort(matchToDelete.timestamp)} · {matchToDelete.format_name || 'Constructed'} · {matchToDelete.result === 'win' ? 'Victory' : 'Defeat'}
                  </p>
                </div>
                <p className="text-[11px] font-sans italic" style={{ color: '#D57C69' }}>
                  This will remove all combat stats and turn events associated with this match.
                </p>
              </div>
            )}

            {/* Body: Step 2 */}
            {deleteStep === 2 && (
              <div className="p-5 space-y-3">
                <div className="p-3 border border-red-500/30 bg-red-500/10 space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#D57C69' }}>
                    Permanent & Irreversible Deletion
                  </p>
                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    Are you sure you want to permanently delete this match? The match record will be blacklisted to prevent it from ever being re-imported from past log files.
                  </p>
                </div>
                {deleteError && (
                  <p className="text-xs font-mono text-red-400 p-2 border border-red-500/40 bg-red-950/40">
                    Error: {deleteError}
                  </p>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2.5 bg-neutral-900/60">
              <button
                onClick={() => {
                  if (deleteStep === 2) {
                    setDeleteStep(1);
                  } else {
                    setMatchToDelete(null);
                  }
                }}
                className="px-4 py-1.5 border border-white/10 hover:border-white/20 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                {deleteStep === 2 ? 'Back' : 'Cancel'}
              </button>

              {deleteStep === 1 && (
                <button
                  onClick={() => setDeleteStep(2)}
                  style={{ backgroundColor: 'rgba(184, 80, 58, 0.25)', borderColor: 'rgba(184, 80, 58, 0.6)', color: '#FFFFFF' }}
                  className="px-4 py-1.5 border text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer hover:brightness-125 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Match
                </button>
              )}

              {deleteStep === 2 && (
                <button
                  onClick={handleConfirmDeleteMatch}
                  disabled={isDeletingMatch}
                  style={{ backgroundColor: '#B8503A', borderColor: '#B8503A', color: '#FFFFFF' }}
                  className="px-4 py-1.5 border text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5 shadow-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isDeletingMatch ? 'Deleting…' : 'Yes, Delete Permanently'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
