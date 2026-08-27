import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  Table2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  GripVertical,
  RotateCcw,
  Check,
  Trash2,
  Layers,
} from 'lucide-react';
import { ThemePalette } from '../types';
import CardImage from './CardImage';
import { CardNameTooltip } from './CardNameTooltip';
import { ManaPip } from './ManaPip';

const NerdIcon = ({ glyph, className = '', style }: { glyph: string; className?: string; style?: React.CSSProperties }) => (
  <i className={`nf ${glyph} ${className}`} style={style} aria-hidden="true" />
);

export interface DeckColumnDef {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  width: string;
  align: 'left' | 'center' | 'right';
  sortKey?: string;
}

const DEFAULT_DECK_COLUMNS: DeckColumnDef[] = [
  { key: 'deck', label: 'Deck', description: 'Deck name and preview art thumbnail', visible: true, width: 'flex-[4] min-w-[220px]', align: 'left', sortKey: 'deck_name' },
  { key: 'key_cards', label: 'Key Cards', description: 'Up to 3 high-impact card art crops', visible: true, width: 'w-[140px]', align: 'center' },
  { key: 'colors', label: 'Colors', description: 'Color identity mana pips', visible: true, width: 'w-[100px]', align: 'center', sortKey: 'colors' },
  { key: 'mana_curve', label: 'Curve', description: 'Mana value distribution curve', visible: true, width: 'w-[110px]', align: 'center' },
  { key: 'format', label: 'Format', description: 'Played formats tag pill', visible: true, width: 'w-[100px]', align: 'center', sortKey: 'format' },
  { key: 'games', label: 'Games', description: 'Total matches recorded', visible: true, width: 'w-[75px]', align: 'center', sortKey: 'games' },
  { key: 'record', label: 'W / L', description: 'Total wins and losses split', visible: true, width: 'w-[90px]', align: 'center', sortKey: 'record' },
  { key: 'winrate', label: 'Win Rate', description: 'Percentage of matches won', visible: true, width: 'w-[90px]', align: 'center', sortKey: 'winrate' },
  { key: 'source', label: 'Source', description: 'True decklist vs match log source', visible: true, width: 'w-[65px]', align: 'center' },
  { key: 'commanders', label: 'Commanders', description: 'Dominant or registered commander cards', visible: false, width: 'w-[140px]', align: 'left', sortKey: 'commander' },
  { key: 'last_played', label: 'Last Played', description: 'Date or relative time of the most recent match', visible: false, width: 'w-[115px]', align: 'center', sortKey: 'last_played' },
  { key: 'wins', label: 'Wins', description: 'Total won matches count', visible: false, width: 'w-[65px]', align: 'center', sortKey: 'wins' },
  { key: 'losses', label: 'Losses', description: 'Total lost matches count', visible: false, width: 'w-[65px]', align: 'center', sortKey: 'losses' },
];

const DECK_COLUMNS_STORAGE_KEY = 'rhystic_deck_columns_v2';

function loadSavedDeckColumns(): DeckColumnDef[] {
  try {
    const raw = localStorage.getItem(DECK_COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_DECK_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DECK_COLUMNS;

    const map = new Map(parsed.map((c: any) => [c.key, c]));
    const result: DeckColumnDef[] = [];

    // Keep stored order and visibility for known columns
    for (const saved of parsed) {
      if (saved.key === 'owned_pct') continue; // Remove removed collection % column
      const def = DEFAULT_DECK_COLUMNS.find((d) => d.key === saved.key);
      if (def) {
        result.push({
          ...def,
          visible: typeof saved.visible === 'boolean' ? saved.visible : def.visible,
        });
      }
    }

    // Add any newly introduced columns that weren't in saved list
    for (const def of DEFAULT_DECK_COLUMNS) {
      if (!map.has(def.key)) {
        result.push(def);
      }
    }
    return result;
  } catch {
    return DEFAULT_DECK_COLUMNS;
  }
}

function getContrastTextColor(hexColor: string): string {
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return '#FFFFFF';
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#09090B' : '#FFFFFF';
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

interface DeckLibraryViewProps {
  deckOverview: any[];
  palette: ThemePalette | null;
  onSelectDeck: (deckName: string) => void;
  onDeleteDeck: (deckName: string) => void;
  onOpenCardOverlay: (card: any, isOpponent?: boolean) => void;
  formatChipColor: (format: string) => { bg: string; fg: string; border: string };
  winRateColor: (wr: string) => string;
  renderDeckArt: (deck: any, sizeClass?: string) => React.ReactNode;
  renderDeckColorIdentity: (colors: string[], size?: number) => React.ReactNode;
  renderManaHistogram: (curve: number[]) => React.ReactNode;
}

export const DeckLibraryView: React.FC<DeckLibraryViewProps> = ({
  deckOverview,
  palette,
  onSelectDeck,
  onDeleteDeck,
  onOpenCardOverlay,
  formatChipColor,
  winRateColor,
  renderDeckArt,
  renderDeckColorIdentity,
  renderManaHistogram,
}) => {
  // State with LocalStorage Persistence
  const [deckSearch, setDeckSearch] = useState('');
  const [deckColorFilter, setDeckColorFilter] = useState<string[]>([]);
  const [deckView, setDeckView] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('rhystic_deck_view');
    return saved === 'cards' || saved === 'table' ? saved : 'cards';
  });
  const [deckCardSize, setDeckCardSize] = useState<'small' | 'large'>(() => {
    const saved = localStorage.getItem('rhystic_deck_card_size');
    return saved === 'small' || saved === 'large' ? saved : 'large';
  });
  const [deckSort, setDeckSort] = useState<string>(() => {
    return localStorage.getItem('rhystic_deck_sort') || 'games';
  });
  const [deckSortDir, setDeckSortDir] = useState<'asc' | 'desc'>(() => {
    const saved = localStorage.getItem('rhystic_deck_sort_dir');
    return saved === 'asc' || saved === 'desc' ? saved : 'desc';
  });

  useEffect(() => {
    localStorage.setItem('rhystic_deck_view', deckView);
  }, [deckView]);

  useEffect(() => {
    localStorage.setItem('rhystic_deck_card_size', deckCardSize);
  }, [deckCardSize]);

  useEffect(() => {
    localStorage.setItem('rhystic_deck_sort', deckSort);
    localStorage.setItem('rhystic_deck_sort_dir', deckSortDir);
  }, [deckSort, deckSortDir]);

  // Columns Configuration
  const [columns, setColumns] = useState<DeckColumnDef[]>(() => loadSavedDeckColumns());
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const SORT_LABEL: Record<string, string> = {
    deck_name: 'DECK NAME',
    games: 'GAMES',
    winrate: 'WIN RATE',
    last_played: 'LAST PLAYED',
  };

  useEffect(() => {
    if (!sortOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sortOpen]);

  const saveColumns = (newCols: DeckColumnDef[]) => {
    setColumns(newCols);
    try {
      localStorage.setItem(DECK_COLUMNS_STORAGE_KEY, JSON.stringify(newCols));
    } catch (e) {
      console.error('Failed to save deck columns:', e);
    }
  };

  const resetColumns = () => {
    saveColumns(DEFAULT_DECK_COLUMNS);
  };

  const toggleColumnVisible = (key: string) => {
    const updated = columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c));
    saveColumns(updated);
  };

  const moveColumn = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= columns.length || fromIdx === toIdx) return;
    const copy = [...columns];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    saveColumns(copy);
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

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  // Card view layout measurement
  const cardAreaRef = useRef<HTMLDivElement>(null);
  const [cardArea, setCardArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = cardAreaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCardArea((prev) => {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deckView]);

  const DECK_RATIO = 3 / 2;
  const DECK_LARGE_ROWS = 4;
  const DECK_SMALL_ROWS = 6;
  const DECK_GAP = 16;
  const DECK_WRAP_PAD = 0;
  const DECK_LARGE_HEIGHT_SHRINK = 0.97;
  const DECK_LARGE_WIDEN = 1.15;
  const deckLargeCardH = cardArea.h > (DECK_LARGE_ROWS - 1) * DECK_GAP + DECK_WRAP_PAD
    ? ((cardArea.h - (DECK_LARGE_ROWS - 1) * DECK_GAP - DECK_WRAP_PAD) / DECK_LARGE_ROWS) * DECK_LARGE_HEIGHT_SHRINK
    : 0;
  const deckLargeCardW = deckLargeCardH > 0
    ? Math.max(0, Math.min(deckLargeCardH * DECK_RATIO * DECK_LARGE_WIDEN, deckLargeCardH * DECK_RATIO + 60) - 23)
    : 0;
  const deckSmallCardW = 260;
  const deckSmallCardH = 178;
  const deckRows = deckCardSize === 'small' ? DECK_SMALL_ROWS : DECK_LARGE_ROWS;
  const deckCardW = deckCardSize === 'small' ? deckSmallCardW : deckLargeCardW;
  const deckCardH = deckCardSize === 'small' ? deckSmallCardH : deckLargeCardH;

  // Filter and sort decks
  const filteredDecks = useMemo(() => {
    // Sort logic for colors:
    // Single color decks first (count = 1), sorted alphabetically by color letter (B, G, R, U, W).
    // Then dual color decks (count = 2), sorted alphabetically (BG, BR, BU, BW, GR, GU, GW, RU, RW, UW).
    // Then tri, quad, five-color decks.
    const colorSortKey = (colors: string[]) => {
      const cols = colors || [];
      const count = cols.length;
      const letters = [...cols].sort().join('');
      return `${count}_${letters}`;
    };

    const list = deckOverview.filter((d) => {
      const q = deckSearch.toLowerCase();
      const matchesDeckName = (d.deck_name || '').toLowerCase().includes(q);
      const matchesCommanderSearch = (d.commanders || []).some((c: any) => (c.name || '').toLowerCase().includes(q));
      const matchesSearch = q === '' || matchesDeckName || matchesCommanderSearch;

      let matchesColor = true;
      if (deckColorFilter.length > 0) {
        if (deckColorFilter.includes('C')) {
          matchesColor = (d.colors || []).length === 0;
        } else {
          const deckCols = [...(d.colors || [])].sort();
          const selCols = [...deckColorFilter.filter((c) => c !== 'C')].sort();
          matchesColor = deckCols.length === selCols.length && deckCols.every((c, i) => c === selCols[i]);
        }
      }

      return matchesSearch && matchesColor;
    });

    const dir = deckSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (deckSort) {
        case 'deck_name':
          cmp = (a.deck_name || '').localeCompare(b.deck_name || '');
          break;
        case 'colors':
          cmp = colorSortKey(a.colors).localeCompare(colorSortKey(b.colors));
          break;
        case 'format': {
          const af = (a.formats || [])[0]?.format || '';
          const bf = (b.formats || [])[0]?.format || '';
          cmp = af.localeCompare(bf);
          break;
        }
        case 'games':
          cmp = (a.total_matches || 0) - (b.total_matches || 0);
          break;
        case 'wins':
          cmp = (a.wins || 0) - (b.wins || 0);
          break;
        case 'losses':
          cmp = (a.losses || 0) - (b.losses || 0);
          break;
        case 'record': {
          const aw = a.wins || 0, al = a.losses || 0;
          const bw = b.wins || 0, bl = b.losses || 0;
          cmp = (aw - al) - (bw - bl);
          break;
        }
        case 'winrate': {
          const awr = parseFloat(a.winrate) || 0;
          const bwr = parseFloat(b.winrate) || 0;
          cmp = awr - bwr;
          break;
        }
        case 'commander': {
          const ac = (a.top_commander_name || (a.commanders || [])[0]?.name || '');
          const bc = (b.top_commander_name || (b.commanders || [])[0]?.name || '');
          cmp = ac.localeCompare(bc);
          break;
        }
        case 'last_played': {
          const at = a.last_played ? new Date(a.last_played).getTime() : 0;
          const bt = b.last_played ? new Date(b.last_played).getTime() : 0;
          cmp = at - bt;
          break;
        }
        default:
          cmp = (a.total_matches || 0) - (b.total_matches || 0);
      }
      return cmp * dir;
    });
    return list;
  }, [deckOverview, deckSearch, deckColorFilter, deckSort, deckSortDir]);

  const deckCols = cardArea.w > 0 && deckCardW > 0
    ? Math.max(1, Math.floor((cardArea.w + DECK_GAP) / (deckCardW + DECK_GAP)))
    : 1;
  const deckPageSize = deckCols * deckRows;
  const [deckPage, setDeckPage] = useState(1);
  const deckTotalPages = Math.max(1, Math.ceil(filteredDecks.length / deckPageSize));
  const safeDeckPage = Math.min(deckPage, deckTotalPages);
  const deckDisplayed = filteredDecks.slice((safeDeckPage - 1) * deckPageSize, safeDeckPage * deckPageSize);

  useEffect(() => {
    setDeckPage(1);
  }, [deckSearch, deckColorFilter.join(','), deckSort, deckSortDir, deckView, deckPageSize]);

  // Wheel listener
  const deckWheelRef = useRef<HTMLDivElement>(null);
  const deckPageDirRef = useRef<'next' | 'prev'>('next');
  const goDeckPage = (dir: 'next' | 'prev') => {
    deckPageDirRef.current = dir;
    if (dir === 'next') setDeckPage((p) => Math.min(deckTotalPages, p + 1));
    else setDeckPage((p) => Math.max(1, p - 1));
  };

  useEffect(() => {
    const el = deckWheelRef.current;
    if (!el || deckView !== 'cards') return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (lock) return;
      if (deckTotalPages <= 1) return;
      if (Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      lock = true;
      if (e.deltaY > 0) goDeckPage('next');
      else goDeckPage('prev');
      setTimeout(() => { lock = false; }, 450);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [deckView, deckTotalPages]);

  // Page turn animation
  const deckGridAnimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = deckGridAnimRef.current;
    if (!el || deckView !== 'cards') return;
    el.getAnimations().forEach((a) => a.cancel());
    const next = deckPageDirRef.current === 'next';
    el.animate(
      [
        { opacity: 0.25, transform: next ? 'translateX(14px)' : 'translateX(-14px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 250, easing: 'ease-out' },
    );
  }, [deckPage, deckView]);

  const handleSortColumn = (key?: string) => {
    if (!key) return;
    if (deckSort === key) {
      setDeckSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setDeckSort(key);
      if (['games', 'winrate', 'wins', 'losses', 'record', 'last_played'].includes(key)) {
        setDeckSortDir('desc');
      } else {
        setDeckSortDir('asc');
      }
    }
  };

  const sortArrow = (key?: string) => {
    if (!key) return null;
    if (deckSort !== key) return <span className="opacity-0 group-hover:opacity-40 text-neutral-500 font-mono ml-1">↕</span>;
    return <span className="font-bold text-white font-mono ml-1">{deckSortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const totalMatchesAcrossDecks = useMemo(() => {
    return deckOverview.reduce((acc, d) => acc + (d.total_matches || 0), 0);
  }, [deckOverview]);

  const accentColor = palette?.accent || '#A855F7';

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-adventure text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            DECK LIBRARY
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({filteredDecks.length} {filteredDecks.length === 1 ? 'deck' : 'decks'})
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER & CONTROLS TOOLBAR */}
      <div className="shrink-0 border border-white/10 bg-white/[0.02] p-2 flex items-center gap-2.5 flex-wrap">
        {/* Search */}
        <div className="relative w-64 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search decks, commanders..."
            value={deckSearch}
            onChange={(e) => setDeckSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none border border-white/10 bg-white/[0.03] text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition-colors font-sans"
          />
          {deckSearch.length > 0 && (
            <button
              onClick={() => setDeckSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Color pips: multi-select */}
        <div className="flex items-center gap-1.5 pl-0.5">
          {['W', 'U', 'B', 'R', 'G', 'C'].map((c) => {
            const active = deckColorFilter.includes(c);
            return (
              <button
                key={c}
                onClick={() =>
                  setDeckColorFilter((prev) =>
                    active ? prev.filter((x) => x !== c) : [...prev, c]
                  )
                }
                className={`transition-all cursor-pointer ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                title={c === 'C' ? 'Colorless' : `Filter ${c}`}
              >
                <ManaPip symbol={c} size={22} />
              </button>
            );
          })}
          {deckColorFilter.length > 0 && (
            <button
              onClick={() => setDeckColorFilter([])}
              className="ml-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 bg-white/[0.02] text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Clear color filter"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* SORT (cards) / COLUMNS (table) — left of view toggle */}
        <div className="relative">
          {deckView === 'table' ? (
            <button
              onClick={() => setShowColumnModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-neutral-200 transition-colors cursor-pointer"
              title="Modify, add/remove, and reorder table columns"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: accentColor }} />
              <span>COLUMNS ({visibleColumns.length})</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] text-neutral-200 transition-colors cursor-pointer"
                title="Sort decks"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: accentColor }} />
                <span>SORT: {SORT_LABEL[deckSort] || deckSort.toUpperCase()}</span>
                <span className="font-mono text-[10px] ml-1">{deckSortDir === 'asc' ? '▲' : '▼'}</span>
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-30 w-44 border border-white/15 bg-neutral-950 shadow-xl">
                    {(['deck_name', 'games', 'winrate', 'last_played'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => { handleSortColumn(k); setSortOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:bg-white/[0.06] transition-colors cursor-pointer ${deckSort === k ? 'text-white font-bold bg-white/[0.08]' : 'text-neutral-400'}`}
                      >
                        {SORT_LABEL[k]}<span className="float-right font-mono text-[10px]">{deckSort === k ? (deckSortDir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-white/10 bg-white/[0.03] overflow-hidden">
          <button
            onClick={() => setDeckView('cards')}
            title="Card view"
            className={`flex items-center justify-center px-2.5 py-1.5 transition-all cursor-pointer ${
              deckView === 'cards' ? 'bg-white/[0.08] text-white font-bold' : 'opacity-40 hover:opacity-100 text-neutral-400'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDeckView('table')}
            title="Table view"
            className={`flex items-center justify-center px-2.5 py-1.5 transition-all cursor-pointer ${
              deckView === 'table' ? 'bg-white/[0.08] text-white font-bold' : 'opacity-40 hover:opacity-100 text-neutral-400'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card size toggle */}
        <button
          onClick={() => deckView === 'cards' && setDeckCardSize(deckCardSize === 'small' ? 'large' : 'small')}
          disabled={deckView !== 'cards'}
          className={`flex items-center justify-center px-2.5 py-1.5 border border-white/10 bg-white/[0.03] transition-all ${
            deckView === 'cards' ? 'hover:bg-white/[0.06] text-neutral-200 cursor-pointer' : 'opacity-20 cursor-not-allowed text-neutral-600'
          }`}
          title={deckView === 'cards' ? (deckCardSize === 'small' ? 'Switch to large cards' : 'Switch to small cards') : 'Card size only applies to card view'}
        >
          {deckCardSize === 'small' ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
        </button>
      </div>

      {/* 3. MAIN CONTENT: CARD VIEW vs TABLE VIEW */}
      {deckView === 'cards' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div ref={cardAreaRef} className="flex-1 min-h-0 overflow-hidden">
            {filteredDecks.length === 0 ? (
              <div className="p-16 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                No decks match the current filters
              </div>
            ) : (
              <div
                ref={deckWheelRef}
                className="h-full min-h-0 flex flex-wrap justify-center content-center items-start gap-4"
              >
                <div
                  ref={deckGridAnimRef}
                  className="h-full min-h-0 w-full flex flex-wrap justify-center content-center items-start gap-4"
                >
                  {deckDisplayed.map((d) => {
                    const artName = d.top_commander_name || d.top_card_name;
                    const fmt = (d.formats || [])[0]?.format;
                    const fmtChip = fmt ? formatChipColor(fmt) : null;
                    return (
                      <button
                        key={d.deck_name}
                        onClick={() => onSelectDeck(d.deck_name)}
                        className="group relative border border-white/10 hover:border-white/30 overflow-hidden shadow-xl text-left transition-all duration-200 cursor-pointer shrink-0 bg-neutral-950 rounded-none"
                        style={{ width: deckCardW, height: deckCardH }}
                      >
                        {/* Full artwork cover */}
                        {artName ? (
                          <CardImage
                            name={artName}
                            version="art_crop"
                            alt={artName}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                            <Layers className="w-8 h-8 opacity-30 text-white" />
                          </div>
                        )}

                        {/* Top Bar: Deck Name + Delete + Color Identity */}
                        <div className="absolute top-0 left-0 right-0 px-3 py-2 flex items-center justify-between gap-2 bg-black/75 backdrop-blur-sm transition-colors duration-200 group-hover:bg-black/60 border-b border-white/10">
                          <span className="text-[17px] font-bold font-display tracking-wide uppercase leading-tight truncate group/title flex items-center gap-1.5 text-white">
                            <span className="truncate">{d.deck_name}</span>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteDeck(d.deck_name);
                              }}
                              className="opacity-0 group-hover/title:opacity-100 shrink-0 p-1 transition-opacity hover:bg-red-500/20 text-rose-400 cursor-pointer"
                              title="Delete deck"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </span>
                          </span>
                          <span className="shrink-0 flex items-center gap-0.5">
                            {renderDeckColorIdentity(d.colors, 15)}
                          </span>
                        </div>

                        {/* Bottom Bar: Source + Format + Win Rate */}
                        <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-black/75 backdrop-blur-sm transition-colors duration-200 group-hover:bg-black/60 border-t border-white/10">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="shrink-0 flex items-center justify-center"
                                style={{ color: d.has_list ? '#FBBF24' : '#9CA3AF', fontSize: 13 }}
                                title={d.has_list ? 'True decklist uploaded' : 'Logged cards only (no true decklist)'}
                              >
                                <NerdIcon glyph={d.has_list ? 'nf-md-cards' : 'nf-oct-log'} />
                              </span>
                              {fmtChip ? (
                                <span
                                  className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 border"
                                  style={{ backgroundColor: fmtChip.bg, borderColor: fmtChip.border, color: fmtChip.fg }}
                                >
                                  {fmt}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono opacity-40 text-neutral-400">—</span>
                              )}
                            </span>
                            <span className="text-xs font-bold font-mono tracking-wider tabular-nums shrink-0" style={{ color: winRateColor(d.winrate) }}>
                              WR: {d.winrate}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Card View Pagination Footer */}
          {deckTotalPages > 1 && (
            <div className="shrink-0 flex items-center justify-center gap-4 pt-2 border-t border-white/5">
              <button
                onClick={() => goDeckPage('prev')}
                disabled={safeDeckPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-neutral-200 transition-colors disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs font-mono text-neutral-400 tabular-nums">
                Page <span className="text-white font-bold">{safeDeckPage}</span> of <span className="text-neutral-400">{deckTotalPages}</span> · {filteredDecks.length} decks
              </span>
              <button
                onClick={() => goDeckPage('next')}
                disabled={safeDeckPage >= deckTotalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-neutral-200 transition-colors disabled:opacity-30 cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="flex-1 border border-white/10 bg-white/[0.01] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              {/* Sticky Header */}
              <thead className="sticky top-0 z-20 bg-neutral-950/95 backdrop-blur-md border-b border-white/10">
                <tr>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSortColumn(col.sortKey)}
                      className={`py-2.5 px-3 text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 select-none ${col.width} ${
                        col.sortKey ? 'cursor-pointer hover:text-white group' : ''
                      } ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      <span className="inline-flex items-center">
                        {col.label}
                        {sortArrow(col.sortKey)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody className="divide-y divide-white/5">
                {filteredDecks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      className="py-16 text-center text-xs font-mono uppercase tracking-wider text-neutral-500"
                    >
                      No decks match the current filters
                    </td>
                  </tr>
                ) : (
                  filteredDecks.map((d) => (
                    <tr
                      key={d.deck_name}
                      onClick={() => onSelectDeck(d.deck_name)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      {visibleColumns.map((col) => {
                        switch (col.key) {
                          case 'deck':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="shrink-0 border border-white/10 overflow-hidden shadow-sm">
                                    {renderDeckArt(d, 'w-12 h-12')}
                                  </div>
                                  <div className="min-w-0 flex items-center gap-2">
                                    <span className="text-[19px] font-bold font-display tracking-wide uppercase truncate text-white transition-colors">
                                      {d.deck_name}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteDeck(d.deck_name);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-rose-400 transition-opacity cursor-pointer shrink-0"
                                      title="Delete deck"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                            );

                          case 'key_cards':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {(d.key_cards || []).slice(0, 3).map((k: any) => (
                                    <CardNameTooltip key={k.grp_id || k.name} name={k.name}>
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenCardOverlay(k, false);
                                        }}
                                        className="w-9 h-9 border border-white/15 overflow-hidden shrink-0 cursor-pointer transition-all duration-150 hover:scale-125 hover:brightness-110 hover:border-white/50 z-10"
                                      >
                                        <CardImage
                                          name={k.name}
                                          version="art_crop"
                                          alt={k.name}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    </CardNameTooltip>
                                  ))}
                                  {(!d.key_cards || d.key_cards.length === 0) && (
                                    <span className="text-xs font-mono text-neutral-600">—</span>
                                  )}
                                </div>
                              </td>
                            );

                          case 'colors':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center">
                                <div className="flex justify-center">
                                  {renderDeckColorIdentity(d.colors, 20)}
                                </div>
                              </td>
                            );

                          case 'mana_curve':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center">
                                <div className="flex justify-center">
                                  {renderManaHistogram(d.mana_curve)}
                                </div>
                              </td>
                            );

                          case 'format':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center">
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {(d.formats || []).map((f: any, i: number) => {
                                    const chip = formatChipColor(f.format);
                                    return (
                                      <span
                                        key={i}
                                        className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 border"
                                        style={{ backgroundColor: chip.bg, borderColor: chip.border, color: chip.fg }}
                                      >
                                        {f.format}
                                      </span>
                                    );
                                  })}
                                  {(!d.formats || d.formats.length === 0) && (
                                    <span className="text-xs font-mono text-neutral-600">—</span>
                                  )}
                                </div>
                              </td>
                            );

                          case 'games':
                            return (
                              <td
                                key={col.key}
                                className="py-2 px-3 align-middle text-center font-mono font-bold text-[18px] tabular-nums"
                                style={{ color: accentColor }}
                              >
                                {d.total_matches}
                              </td>
                            );

                          case 'record':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center font-mono text-xs font-bold tabular-nums">
                                <span className="text-emerald-400">{d.wins}</span>
                                <span className="text-neutral-600 px-1">/</span>
                                <span className="text-rose-400">{d.losses}</span>
                              </td>
                            );

                          case 'winrate':
                            return (
                              <td
                                key={col.key}
                                className="py-2 px-3 align-middle text-center font-mono font-bold text-xs tabular-nums"
                                style={{ color: winRateColor(d.winrate) }}
                              >
                                {d.winrate}
                              </td>
                            );

                          case 'source':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center">
                                <span
                                  className="inline-flex items-center justify-center"
                                  style={{ color: d.has_list ? '#FBBF24' : '#71717A', fontSize: 14 }}
                                  title={d.has_list ? 'True decklist uploaded' : 'Logged cards only (no true decklist)'}
                                >
                                  <NerdIcon glyph={d.has_list ? 'nf-md-cards' : 'nf-oct-log'} />
                                </span>
                              </td>
                            );

                          case 'commanders': {
                            const cmdName = d.top_commander_name || (d.commanders || [])[0]?.name;
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle">
                                {cmdName ? (
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-6 border border-white/10 shrink-0 overflow-hidden">
                                      <CardImage name={cmdName} version="art_crop" alt={cmdName} className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-xs font-sans text-neutral-300 truncate">{cmdName}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs font-mono text-neutral-600">—</span>
                                )}
                              </td>
                            );
                          }

                          case 'last_played':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center font-mono text-[11px] text-neutral-400 tabular-nums">
                                {formatRelativeTime(d.last_played)}
                              </td>
                            );

                          case 'wins':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center font-mono text-xs font-bold text-emerald-400 tabular-nums">
                                {d.wins ?? 0}
                              </td>
                            );

                          case 'losses':
                            return (
                              <td key={col.key} className="py-2 px-3 align-middle text-center font-mono text-xs font-bold text-rose-400 tabular-nums">
                                {d.losses ?? 0}
                              </td>
                            );

                          default:
                            return <td key={col.key} className="py-2 px-3" />;
                        }
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. CUSTOMIZE COLUMNS MODAL */}
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
                    CUSTOMIZE DECK COLUMNS
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-sans">
                  Toggle column visibility and drag or click arrows to reorder table columns.
                </p>
              </div>
              <button
                onClick={() => setShowColumnModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Drag & Drop Column List */}
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
                        onClick={() => toggleColumnVisible(col.key)}
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
                        title="Move column up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={idx === columns.length - 1}
                        onClick={() => moveColumn(idx, idx + 1)}
                        className="p-1 border border-white/10 hover:border-white/30 disabled:opacity-20 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                        title="Move column down"
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Defaults</span>
              </button>
              <button
                onClick={() => setShowColumnModal(false)}
                className="px-5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold shadow-md transition-all cursor-pointer hover:brightness-110 active:scale-95"
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
export default DeckLibraryView;
