import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  GripVertical,
  X,
  RotateCcw,
  Check,
  ChevronRight,
  Swords,
} from 'lucide-react';
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
  if (f.includes('brawl - standard') || f.includes('standard brawl')) {
    return { bg: '#4A7FA318', fg: '#7FAAC9', border: '#4A7FA338' };
  } else if (f.includes('brawl - competitive') || f.includes('competitive brawl')) {
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
  { key: 'result', label: 'Result', description: 'Win/Loss indicator and status badge', visible: true, width: 'w-[100px]', align: 'left' },
  { key: 'date', label: 'Date & Time', description: 'Match timestamp and relative time', visible: true, width: 'w-[130px]', align: 'left' },
  { key: 'matchup', label: 'Matchup', description: 'Player Deck vs Opponent (combined)', visible: true, width: 'flex-1 min-w-[200px]', align: 'left' },
  { key: 'deck', label: 'Deck', description: 'Player deck artwork thumbnail and name', visible: false, width: 'flex-1 min-w-[160px]', align: 'left' },
  { key: 'opponent', label: 'Opponent', description: 'Opponent username (click to filter)', visible: false, width: 'w-[150px]', align: 'left' },
  { key: 'format', label: 'Format', description: 'Game format badge', visible: true, width: 'w-[130px]', align: 'center' },
  { key: 'colors', label: 'Colors', description: 'Player deck mana color identity', visible: true, width: 'w-[90px]', align: 'center' },
  { key: 'game_stats', label: 'Game Stats', description: 'Turns elapsed and duration', visible: true, width: 'w-[120px]', align: 'center' },
  { key: 'play_draw', label: 'Play / Draw', description: 'Opening turn position', visible: true, width: 'w-[95px]', align: 'center' },
  { key: 'key_cards', label: 'Key Cards', description: 'Mini portraits of notable cards played', visible: true, width: 'w-[105px]', align: 'center' },
  { key: 'mana_curve', label: 'Mana Curve', description: 'Mini deck mana histogram', visible: false, width: 'w-[130px]', align: 'center' },
  { key: 'life_totals', label: 'Final Life', description: 'Ending life score (You - Opp)', visible: false, width: 'w-[100px]', align: 'center' },
  { key: 'mulligans', label: 'Mulligans', description: 'Opening hand mulligans taken', visible: false, width: 'w-[100px]', align: 'center' },
  { key: 'end_reason', label: 'End Reason', description: 'Victory/defeat condition', visible: false, width: 'w-[110px]', align: 'center' },
  { key: 'opp_colors', label: 'Opp Colors', description: 'Detected opponent deck colors', visible: false, width: 'w-[95px]', align: 'center' },
  { key: 'commanders', label: 'Commanders', description: 'Brawl Commander portraits', visible: false, width: 'w-[120px]', align: 'center' },
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
}) => {
  const accentColor = palette?.accent || '#A855F7';

  // --- Filter State ---
  const [searchTerm, setSearchTerm] = useState(initialSearch || '');
  const [formatFilter, setFormatFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'win' | 'loss'>('ALL');

  useEffect(() => {
    if (initialSearch !== undefined && initialSearch !== '') setSearchTerm(initialSearch);
  }, [initialSearch]);

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
    const now = Date.now();
    const cleanSearch = searchTerm.trim().toLowerCase();

    return matches.filter((m) => {
      // 1. Result filter
      if (resultFilter !== 'ALL' && m.result !== resultFilter) return false;

      // 2. Format filter
      if (formatFilter !== 'ALL') {
        const f = (m.format_name || '').toUpperCase();
        if (f !== formatFilter.toUpperCase()) return false;
      }

      // 3. Time period filter
      if (timeFilter !== 'ALL') {
        const matchTime = new Date(m.timestamp).getTime();
        const diffMs = now - matchTime;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (timeFilter === 'TODAY' && diffDays > 1) return false;
        if (timeFilter === '7D' && diffDays > 7) return false;
        if (timeFilter === '14D' && diffDays > 14) return false;
        if (timeFilter === '30D' && diffDays > 30) return false;
        if (timeFilter === 'YEAR' && diffDays > 365) return false;
      }

      // 4. Search term (deck name, opponent name, commander)
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
  }, [matches, searchTerm, formatFilter, timeFilter, resultFilter]);

  // --- Dynamic Reactive KPI Summary Stats ---
  const stats = useMemo(() => {
    const total = filteredMatches.length;
    const wins = filteredMatches.filter((m) => m.result === 'win').length;
    const losses = filteredMatches.filter((m) => m.result === 'loss').length;
    const winrate = total > 0 ? (wins / total) * 100 : 0;

    // Play vs Draw
    const onPlayMatches = filteredMatches.filter((m) => m.going_first === true);
    const onPlayWins = onPlayMatches.filter((m) => m.result === 'win').length;
    const onPlayWR = onPlayMatches.length > 0 ? (onPlayWins / onPlayMatches.length) * 100 : 0;

    const onDrawMatches = filteredMatches.filter((m) => m.going_first === false);
    const onDrawWins = onDrawMatches.filter((m) => m.result === 'win').length;
    const onDrawWR = onDrawMatches.length > 0 ? (onDrawWins / onDrawMatches.length) * 100 : 0;

    // Averages
    const totalTurns = filteredMatches.reduce((acc, m) => acc + (m.turns || 0), 0);
    const avgTurns = total > 0 ? (totalTurns / total).toFixed(1) : '0';

    const totalSec = filteredMatches.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
    const avgSec = total > 0 ? Math.round(totalSec / total) : 0;

    // Current Streak in this filtered subset
    const sorted = [...filteredMatches].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    let streakType: 'win' | 'loss' | '' = (sorted[0]?.result as any) || '';
    let streakCount = 0;
    for (const m of sorted) {
      if (m.result === streakType) streakCount++;
      else break;
    }

    return {
      total,
      wins,
      losses,
      winrate,
      onPlayCount: onPlayMatches.length,
      onPlayWR,
      onDrawCount: onDrawMatches.length,
      onDrawWR,
      avgTurns,
      avgSec,
      streakType,
      streakCount,
    };
  }, [filteredMatches]);

  // --- Virtualized Table Setup ---
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredMatches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 54, // Modern crisp row height: 54px
    overscan: 12,
  });

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  // Mini mana histogram renderer
  const renderMiniHistogram = (curve?: number[]) => {
    if (!curve || curve.length === 0) return <span className="opacity-30">—</span>;
    const maxVal = Math.max(...curve, 1);
    return (
      <div className="flex items-end gap-1 h-5 w-24">
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
          <div className="flex items-center gap-2">
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
          <div className="flex flex-col text-left leading-tight font-sans">
            <span className="text-neutral-200 text-xs font-medium">{formatDateShort(m.timestamp)}</span>
            <span className="text-[10px] text-neutral-500 font-mono">{formatTimeAgo(m.timestamp)}</span>
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
          <div className="flex items-center gap-1.5 truncate">
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
          <span
            className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border whitespace-nowrap"
            style={{ backgroundColor: chip.bg, borderColor: chip.border, color: chip.fg }}
          >
            {fmtName}
          </span>
        );
      }

      case 'colors':
        return m.deck_colors && m.deck_colors.length > 0 ? (
          <div className="flex items-center justify-center gap-0.5">
            {m.deck_colors.map((c) => (
              <ManaPip key={c} symbol={c} size={14} />
            ))}
          </div>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      case 'game_stats':
        return (
          <div className="text-xs font-mono text-neutral-300 tabular-nums">
            <span className="text-white font-medium">T{m.turns || '?'}</span>
            <span className="opacity-40 mx-1">·</span>
            <span className="text-neutral-400">{formatDuration(m.duration_seconds)}</span>
          </div>
        );

      case 'play_draw':
        return m.going_first !== undefined ? (
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 border ${
              m.going_first
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
            }`}
          >
            {m.going_first ? 'PLAY' : 'DRAW'}
          </span>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      case 'key_cards': {
        const keyCards = (deckKeyCardsMap.get(m.player_deck_name) || []).slice(0, 3);
        return keyCards.length > 0 ? (
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
        );
      }

      case 'mana_curve':
        return renderMiniHistogram(m.mana_curve);

      case 'life_totals':
        return m.player_life_end !== undefined ? (
          <span className="text-xs font-mono tabular-nums text-neutral-300 font-semibold">
            <span className={m.player_life_end > 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {m.player_life_end}
            </span>
            <span className="opacity-40 mx-1">—</span>
            <span className={m.opponent_life_end && m.opponent_life_end <= 0 ? 'text-rose-400' : 'text-neutral-400'}>
              {m.opponent_life_end ?? '?'}
            </span>
          </span>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      case 'mulligans':
        return m.player_mulligans !== undefined ? (
          <span className="text-xs font-mono tabular-nums text-neutral-400">
            {m.player_mulligans} / {m.opponent_mulligans ?? 0}
          </span>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      case 'end_reason':
        return m.result_reason ? (
          <span className="text-[11px] font-mono text-neutral-400 capitalize truncate max-w-[100px]" title={m.result_reason}>
            {m.result_reason}
          </span>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      case 'opp_colors':
        return m.opponent_colors && m.opponent_colors.length > 0 ? (
          <div className="flex items-center justify-center gap-0.5">
            {m.opponent_colors.map((c) => (
              <ManaPip key={c} symbol={c} size={14} />
            ))}
          </div>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      case 'commanders':
        return m.player_commander_name || m.opponent_commander_name ? (
          <div className="flex items-center justify-center gap-1.5">
            {m.player_commander_name && (
              <CardNameTooltip name={m.player_commander_name}>
                <img
                  src={scryfallArtUrl(m.player_commander_name)}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover border border-white/20"
                />
              </CardNameTooltip>
            )}
            {m.opponent_commander_name && (
              <CardNameTooltip name={m.opponent_commander_name}>
                <img
                  src={scryfallArtUrl(m.opponent_commander_name)}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover border border-rose-500/40"
                />
              </CardNameTooltip>
            )}
          </div>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4 px-8 py-4 overflow-hidden">
      {/* 1. TOP HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-battle text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            MATCH HISTORY
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({stats.total.toLocaleString()} games recorded across all formats)
          </span>
        </div>
      </div>

      {/* 2. DYNAMIC REACTIVE KPI SUMMARY BAR */}
      {(() => {
        const isOutcomeFiltered = resultFilter !== 'ALL';

        return (
          <div className="grid grid-cols-4 gap-4 p-3.5 bg-white/[0.02] border border-white/5 shrink-0">
            {/* Metric 1: Filtered Win Rate */}
            <div className={`transition-opacity duration-200 ${isOutcomeFiltered ? 'opacity-25 select-none grayscale' : ''}`}>
              <div className="text-[11px] font-sans font-medium tracking-[0.16em] uppercase text-neutral-400 opacity-70">
                WIN RATE
              </div>
              <div className="text-[34px] font-display font-bold text-white tracking-tight leading-none my-0.5 tabular-nums">
                {isOutcomeFiltered ? '—' : `${stats.winrate.toFixed(1)}%`}
              </div>
              <div className="text-xs font-sans text-neutral-400 opacity-75 tabular-nums">
                {isOutcomeFiltered
                  ? `${stats.total} ${resultFilter === 'win' ? 'wins' : 'losses'} in view`
                  : `${stats.wins} wins / ${stats.losses} losses / ${stats.total} matches`}
              </div>
            </div>

            {/* Metric 2: Win/Loss Streak */}
            <div className={`transition-opacity duration-200 ${isOutcomeFiltered ? 'opacity-25 select-none grayscale' : ''}`}>
              <div className="text-[11px] font-sans font-medium tracking-[0.16em] uppercase text-neutral-400 opacity-70">
                CURRENT STREAK
              </div>
              <div className="text-[34px] font-display font-bold text-white tracking-tight leading-none my-0.5 tabular-nums flex items-center gap-2">
                {isOutcomeFiltered ? (
                  <span className="opacity-40">—</span>
                ) : stats.streakCount > 0 ? (
                  <span style={{ color: stats.streakType === 'win' ? accentColor : '#71717A' }}>
                    {stats.streakType === 'win' ? 'W' : 'L'}{stats.streakCount}
                  </span>
                ) : (
                  <span className="opacity-40">0</span>
                )}
                {!isOutcomeFiltered && (
                  <span className="text-xs font-sans font-normal text-neutral-400">
                    {stats.streakType === 'win' ? 'Win Streak' : stats.streakType === 'loss' ? 'Loss Streak' : 'No streak'}
                  </span>
                )}
              </div>
              <div className="text-xs font-sans text-neutral-400 opacity-75">
                {isOutcomeFiltered ? 'Unavailable in filtered outcome view' : 'Active in current filter view'}
              </div>
            </div>

            {/* Metric 3: Play vs Draw */}
            <div className={`transition-opacity duration-200 ${isOutcomeFiltered ? 'opacity-25 select-none grayscale' : ''}`}>
              <div className="text-[11px] font-sans font-medium tracking-[0.16em] uppercase text-neutral-400 opacity-70">
                PLAY VS DRAW
              </div>
              <div className="text-[20px] font-display font-bold text-white tracking-tight leading-snug mt-1 tabular-nums">
                {isOutcomeFiltered ? (
                  <span className="opacity-40">Play: — · Draw: —</span>
                ) : (
                  <>
                    Play: <span className="text-amber-300">{stats.onPlayWR.toFixed(0)}%</span> <span className="opacity-40 font-mono text-xs font-normal">({stats.onPlayCount}g)</span>
                    <span className="opacity-40 mx-2">·</span>
                    Draw: <span className="text-blue-300">{stats.onDrawWR.toFixed(0)}%</span> <span className="opacity-40 font-mono text-xs font-normal">({stats.onDrawCount}g)</span>
                  </>
                )}
              </div>
              <div className="text-xs font-sans text-neutral-400 opacity-75">
                {isOutcomeFiltered ? 'Unavailable in filtered outcome view' : 'Opening turn impact on win rate'}
              </div>
            </div>

            {/* Metric 4: Match Length (Always Active & Accurate for Wins/Losses/All) */}
            <div>
              <div className="text-[11px] font-sans font-medium tracking-[0.16em] uppercase text-neutral-400 opacity-70 flex items-center justify-between">
                <span>AVG MATCH LENGTH</span>
                {isOutcomeFiltered && (
                  <span
                    className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 border"
                    style={{
                      color: resultFilter === 'win' ? accentColor : '#A1A1AA',
                      borderColor: resultFilter === 'win' ? `${accentColor}44` : '#3F3F46',
                      backgroundColor: resultFilter === 'win' ? `${accentColor}12` : '#27272A',
                    }}
                  >
                    {resultFilter === 'win' ? 'WINS ONLY' : 'LOSSES ONLY'}
                  </span>
                )}
              </div>
              <div className="text-[20px] font-display font-bold text-white tracking-tight leading-snug mt-1 tabular-nums">
                {stats.avgTurns} <span className="text-sm font-sans font-normal text-neutral-400">turns</span>
                <span className="opacity-40 mx-2">·</span>
                {formatDuration(stats.avgSec)}
              </div>
              <div className="text-xs font-sans text-neutral-400 opacity-75">
                {resultFilter === 'win'
                  ? 'Average duration for won games'
                  : resultFilter === 'loss'
                  ? 'Average duration for lost games'
                  : 'Average organic game duration'}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. FILTER CONTROLS & SEARCH TOOLBAR ROW */}
      <div className="flex items-center justify-between gap-3 pb-2 shrink-0 flex-wrap">
        {/* Left: Format -> Time Period -> Outcome */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 1. Format Selector */}
          <div className="relative inline-flex items-center bg-white/[0.03] border border-white/10 px-2.5 py-1">
            <span className="text-[11px] font-mono text-neutral-400 uppercase mr-2">Format:</span>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="text-xs font-sans bg-transparent border-0 text-white cursor-pointer pr-4 appearance-none focus:outline-none"
            >
              <option value="ALL" className="bg-neutral-900 text-white">All Formats</option>
              {normalizedFormatOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronRight className="w-2.5 h-2.5 rotate-90 absolute right-2 pointer-events-none text-neutral-400" />
          </div>

          {/* 2. Time Period Filter Pills */}
          <div className="flex items-center gap-1 bg-white/[0.02] border border-white/5 p-0.5">
            {[
              { id: 'ALL', label: 'All Time' },
              { id: 'TODAY', label: 'Today' },
              { id: '7D', label: '7D' },
              { id: '14D', label: '14D' },
              { id: '30D', label: '30D' },
              { id: 'YEAR', label: 'Year' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeFilter(t.id)}
                className={`text-xs font-sans px-2.5 py-1 transition-colors cursor-pointer ${
                  timeFilter === t.id
                    ? 'bg-white/[0.08] text-white font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                style={{
                  color: timeFilter === t.id ? accentColor : undefined,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 3. Outcome Filter (All | Wins | Losses) */}
          <div className="flex items-center gap-1 bg-white/[0.02] border border-white/5 p-0.5">
            {[
              { id: 'ALL', label: 'All Results' },
              { id: 'win', label: 'Wins Only' },
              { id: 'loss', label: 'Losses Only' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setResultFilter(r.id as any)}
                className={`text-xs font-sans px-2.5 py-1 transition-colors cursor-pointer ${
                  resultFilter === r.id
                    ? 'bg-white/[0.08] text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
                style={{
                  color: resultFilter === r.id ? (r.id === 'win' ? accentColor : r.id === 'loss' ? '#71717A' : '#FFF') : undefined,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right (right-justified): Search on left, Columns button on far right */}
        <div className="flex items-center gap-2.5 ml-auto">
          {/* Search Filter */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search deck, opponent..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none border border-white/10 bg-white/[0.03] text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition-colors font-sans"
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

          {/* Customize Columns Button */}
          <button
            onClick={() => setShowColumnModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-neutral-200 transition-colors cursor-pointer shrink-0"
            title="Modify, add/remove, and reorder table columns"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: accentColor }} />
            <span>COLUMNS ({visibleColumns.length})</span>
          </button>
        </div>
      </div>

      {/* 4. MAIN DATA TABLE (Virtualized, Sticky Header, Customizable Columns) */}
      <div className="flex-1 min-h-0 border border-white/10 bg-black/20 flex flex-col overflow-hidden">
        {/* Sticky Table Header */}
        <div className="flex items-center py-2.5 px-4 bg-neutral-950 border-b border-white/10 shrink-0 select-none text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400">
          {visibleColumns.map((col) => (
            <div
              key={col.key}
              className={`${col.width || 'flex-1'} px-1.5 ${
                col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
              }`}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Virtualized Rows Viewport */}
        <div ref={parentRef} className="flex-1 overflow-y-auto relative custom-scrollbar divide-y divide-white/5">
          {filteredMatches.length === 0 ? (
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
                const m = filteredMatches[virtualRow.index];
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
                    {visibleColumns.map((col) => (
                      <div
                        key={col.key}
                        className={`${col.width || 'flex-1'} px-1.5 min-w-0 ${
                          col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {renderCellContent(col, m)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. CUSTOMIZE COLUMNS MODAL (Drag & Drop + Toggle Visibility + Persistence) */}
      {/* ========================================================================= */}
      {showColumnModal && (
        <div
          onClick={() => setShowColumnModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5" style={{ color: accentColor }} />
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
              {columns.map((col, idx) => {
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
    </div>
  );
};
