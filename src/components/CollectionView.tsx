import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Search,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Home,
  LayoutGrid,
  Table2,
  SlidersHorizontal,
  Columns3,
  GripVertical,
  RotateCcw,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CardImage } from './CardImage';
import { getCardStylePref } from '../utils/cardStylePrefs';
import { ManaPip } from './ManaPip';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';
import { CustomDropdown } from './CustomDropdown';

interface CollectionViewProps {
  palette: any;
  onShowCard: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
  refreshTrigger?: number;
}

interface CollectionCard {
  grp_id: number;
  name: string | null;
  mana_cost?: string | null;
  cmc: number;
  colors?: string | null;
  color_identity?: string | null;
  set_code?: string | null;
  set_name?: string | null;
  set_released_at?: string | null;
  rarity: number;
  card_type?: string | null;
  collector_number?: string | null;
  owned_count: number;
}

interface CollectionResponse {
  cards: CollectionCard[];
  page: number;
  page_size: number;
  total_pages: number;
}

const RARITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Land', color: '#9CA3AF' },
  2: { label: 'Common', color: '#E5E7EB' },
  3: { label: 'Uncommon', color: '#CBD5E1' },
  4: { label: 'Rare', color: '#D4AF37' },
  5: { label: 'Mythic', color: '#F97316' },
};

// MTGA rarity codes, shown in Arena order: Basic Land, Common, Uncommon, Rare, Mythic.
const RARITY_ORDER: { value: number; label: string }[] = [
  { value: 1, label: 'Basic Land' },
  { value: 2, label: 'Common' },
  { value: 3, label: 'Uncommon' },
  { value: 4, label: 'Rare' },
  { value: 5, label: 'Mythic' },
];

const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Planeswalker', 'Battle', 'Other'];

// Mana Value options: 0..7 exact, 8 means "8 or more" (like MTGA's 8+ pip).
const CMC_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'cmc', label: 'Mana Value' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'set', label: 'Set' },
  { value: 'released', label: 'Release Date' },
  { value: 'count', label: 'Owned Count' },
];

export interface CollectionColumnDef {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortKey?: string;
}

const DEFAULT_COLLECTION_COLUMNS: CollectionColumnDef[] = [
  { key: 'art', label: 'Art', description: 'Card art crop thumbnail preview', visible: true, width: 'w-[52px]', align: 'center' },
  { key: 'name', label: 'Name', description: 'Card title', visible: true, width: 'flex-1 min-w-[200px]', align: 'left', sortKey: 'name' },
  { key: 'mana_cost', label: 'Cost', description: 'Mana casting cost symbols', visible: true, width: 'w-[110px]', align: 'center', sortKey: 'cmc' },
  { key: 'cmc', label: 'MV', description: 'Converted mana value (CMC)', visible: true, width: 'w-[65px]', align: 'center', sortKey: 'cmc' },
  { key: 'card_type', label: 'Card Type', description: 'Card type and subtypes', visible: true, width: 'w-[170px]', align: 'center' },
  { key: 'set', label: 'Set', description: 'Expansion set (sorted by release date)', visible: true, width: 'w-[160px]', align: 'center', sortKey: 'set' },
  { key: 'rarity', label: 'Rarity', description: 'Card rarity tier', visible: true, width: 'w-[100px]', align: 'center', sortKey: 'rarity' },
  { key: 'owned', label: 'Owned', description: 'Collected copies control (0–4)', visible: true, width: 'w-[130px]', align: 'center', sortKey: 'count' },
  { key: 'colors', label: 'Colors', description: 'Card color identity', visible: false, width: 'w-[90px]', align: 'center' },
  { key: 'collector_number', label: 'CN', description: 'Collector number in set', visible: false, width: 'w-[75px]', align: 'center' },
  { key: 'released', label: 'Release Date', description: 'Expansion release date', visible: false, width: 'w-[120px]', align: 'center', sortKey: 'released' },
  { key: 'grp_id', label: 'GRP ID', description: 'MTGA internal card identifier', visible: false, width: 'w-[80px]', align: 'center' },
];

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

function CollectionView({ palette, onShowCard, refreshTrigger }: CollectionViewProps) {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGrp, setBusyGrp] = useState<number | null>(null);
  const [serverTotalCards, setServerTotalCards] = useState(0);
  const [serverTotalOwned, setServerTotalOwned] = useState(0);
  const [serverTotalOwnedCopies, setServerTotalOwnedCopies] = useState(0);

  const [search, setSearch] = useState('');
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'unowned'>(() => {
    const saved = localStorage.getItem('collectionOwnedFilter');
    return saved === 'all' || saved === 'owned' || saved === 'unowned' ? saved : 'owned';
  });
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [cmcFilter, setCmcFilter] = useState<number | null>(null);
  const [copiesFilter, setCopiesFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<string>(() => {
    const saved = localStorage.getItem('defaultCollectionSort');
    if (saved && ['name', 'cmc', 'rarity', 'set', 'released', 'count'].includes(saved)) {
      return saved;
    }
    return 'released';
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const saved = localStorage.getItem('defaultCollectionSort');
    return saved === 'released' || !saved ? 'desc' : 'asc';
  });
  const [showAdvModal, setShowAdvModal] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const SORT_LABEL: Record<string, string> = {
    name: 'NAME',
    cmc: 'MANA VALUE',
    rarity: 'RARITY',
    set: 'SET',
    released: 'RELEASE DATE',
    count: 'OWNED COUNT',
  };
  useEffect(() => {
    if (!sortOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sortOpen]);

  const [setOptions, setSetOptions] = useState<{ set_code: string; name: string | null; released_at: string | null; icon_svg_uri: string | null }[]>([]);
  const [setNameQuery, setSetNameQuery] = useState('');

  // View mode + card size + art mode, persisted locally.
  const [view, setView] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('collectionView');
    return saved === 'table' ? 'table' : 'cards';
  });
  const [cardSize, setCardSize] = useState<'small' | 'large'>(() => {
    const saved = localStorage.getItem('collectionCardSize');
    return saved === 'small' ? 'small' : 'large';
  });
  // artMode removed (Crop view eliminated — always full card view now).
  // Purge any stale localStorage key left over from the removed toggle.
  useEffect(() => {
    localStorage.removeItem('collectionArtMode');
  }, []);

  const [styleRev, setStyleRev] = useState(0);
  useEffect(() => {
    const handleStyleChange = () => setStyleRev((r) => r + 1);
    window.addEventListener('rhystic-card-style-changed', handleStyleChange);
    return () => window.removeEventListener('rhystic-card-style-changed', handleStyleChange);
  }, []);

  // --- Table View Column Customizer State ---
  const [columns, setColumns] = useState<CollectionColumnDef[]>(() => {
    try {
      const saved = localStorage.getItem('rhystic_collection_columns_v2') || localStorage.getItem('rhystic_collection_columns');
      if (saved) {
        const parsed: CollectionColumnDef[] = JSON.parse(saved);
        const existingKeys = new Set(parsed.map((c) => c.key));
        const missing = DEFAULT_COLLECTION_COLUMNS.filter((c) => !existingKeys.has(c.key));
        const combined = [...parsed, ...missing];
        if (!existingKeys.has('art')) {
          const artDef = DEFAULT_COLLECTION_COLUMNS.find((c) => c.key === 'art');
          if (artDef) {
            return [artDef, ...parsed];
          }
        }
        return combined;
      }
    } catch (e) {
      console.error('Failed to load collection columns:', e);
    }
    return DEFAULT_COLLECTION_COLUMNS;
  });

  const [showColumnModal, setShowColumnModal] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveColumns = (newCols: CollectionColumnDef[]) => {
    setColumns(newCols);
    try {
      localStorage.setItem('rhystic_collection_columns_v2', JSON.stringify(newCols));
    } catch (e) {
      console.error('Failed to persist collection columns:', e);
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
    saveColumns(DEFAULT_COLLECTION_COLUMNS);
  };

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  useEffect(() => {
    setStyleRev((r) => r + 1);
  }, [refreshTrigger]);

  // Full Card (Portrait 63:88 aspect ratio):
  //   Small: 184 x 257 (Guarantees 4 rows minimum and 7 cols)
  //   Large: 260 x 363 (Calibrated 4-column x 3-row grid, 12 cards per page)
  const CARD_W_SMALL = 184;
  const CARD_H_SMALL = 257;
  const CARD_W_LARGE = 260;
  const CARD_H_LARGE = 363;
  const GRID_GAP = 12;

  const gridWrapRef = useRef<HTMLDivElement>(null);
  const gridSizeRORef = useRef<ResizeObserver | null>(null);
  const [gridSize, setGridSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure the content area so we can auto-fit columns/rows of fixed cards in card view.
  // Only drives CLIENT-SIDE pagination (never the network fetch), so resizing
  // the window can't cause refetch loops. Callback ref ensures the grid is
  // measured the moment it mounts (including after a table→cards switch).
  const setGridWrapRef = useCallback((node: HTMLDivElement | null) => {
    gridWrapRef.current = node;
    if (gridSizeRORef.current) {
      gridSizeRORef.current.disconnect();
      gridSizeRORef.current = null;
    }
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setGridSize((prev) => {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    };
    measure();
    gridSizeRORef.current = new ResizeObserver(measure);
    gridSizeRORef.current.observe(node);
  }, []);

  // Cards have a FIXED footprint per size mode. The grid fits as many rows and
  // columns as the available space allows — both are driven purely by window
  // dimensions (never by card scaling), so a taller window adds a row and a
  // wider window adds a column, instantly.
  const cardW = cardSize === 'small' ? CARD_W_SMALL : CARD_W_LARGE;
  const cardH = cardSize === 'small' ? CARD_H_SMALL : CARD_H_LARGE;

  const cols = gridSize.w > 0 ? Math.max(1, Math.floor((gridSize.w + GRID_GAP) / (cardW + GRID_GAP))) : 1;
  const rows = gridSize.h > 0 ? Math.max(1, Math.floor((gridSize.h + GRID_GAP) / (cardH + GRID_GAP))) : 1;
  // Page size is client-side only; the backend fetch is decoupled from it.
  const pageSize = view === 'table' ? 100 : cols * rows;

  useEffect(() => {
    localStorage.setItem('collectionView', view);
    localStorage.setItem('collectionCardSize', cardSize);
  }, [view, cardSize]);

  useEffect(() => {
    localStorage.setItem('collectionOwnedFilter', ownedFilter);
  }, [ownedFilter]);

  // Load available set metadata (present in the collection) once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke<any>('get_set_metadata');
        if (!cancelled) {
          setSetOptions((res?.sets || []).filter((s: any) => s.set_code));
          // First run: populate set names/release dates from Scryfall so the
          // set filter shows names (not 3-letter codes) without visiting Settings.
          if (!res?.known_count) {
            try {
              const resp = await fetch('https://api.scryfall.com/sets');
              if (resp.ok) {
                const data = await resp.json();
                const sets = (data.data || []).map((s: any) => ({
                  code: s.code,
                  name: s.name,
                  released_at: s.released_at || null,
                }));
                await invoke('refresh_set_metadata', { sets });
                const res2 = await invoke<any>('get_set_metadata');
                if (!cancelled && res2) setSetOptions((res2.sets || []).filter((s: any) => s.set_code));
              }
            } catch (e) {
              console.error('Failed to auto-populate set metadata:', e);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load set metadata:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Close the advanced-filter modal on Escape.
  useEffect(() => {
    if (!showAdvModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAdvModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdvModal]);

  const fetchCollection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The backend returns the FULL filtered/sorted/merged list (served from a
      // cached card universe, filtered in memory). Pagination is client-side,
      // so window resizes never refetch — only filters/sort do.
      const res = await invoke<any>('get_collection', {
        filters: {
          owned: ownedFilter,
          sets: selectedSets.length ? selectedSets : null,
          colors: selectedColors.length ? selectedColors : null,
          rarities: selectedRarities.length ? selectedRarities : null,
          types: selectedTypes.length ? selectedTypes : null,
          cmc: cmcFilter,
          copies: copiesFilter,
          search: search.trim() === '' ? null : search.trim(),
          sort,
          sort_dir: sortDir,
        },
      });
      const parsed: CollectionResponse = res;
      setCards(parsed?.cards || []);
      setServerTotalCards(parsed?.summary?.total_cards ?? parsed?.cards?.length ?? 0);
      setServerTotalOwned(parsed?.summary?.total_owned_cards ?? 0);
      setServerTotalOwnedCopies(parsed?.summary?.total_owned_copies_all ?? 0);
    } catch (e) {
      console.error('Failed to load collection:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ownedFilter, selectedSets, selectedColors, selectedRarities, selectedTypes, cmcFilter, copiesFilter, search, sort, sortDir]);

  // Client-side pagination: total pages and the visible slice are derived from
  // the fetched list + current grid geometry every render, so resizing is
  // instant with no server round-trip and no overflow/scroll.
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayedCards = cards.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    // In table view, pageSize is fixed at 100 so we can fetch immediately.
    // In card view, we wait until gridSize is measured (or fetch immediately if already measured).
    if (view === 'table' || (gridSize.w > 0 && gridSize.h > 0)) {
      fetchCollection();
    }
  }, [fetchCollection, view, gridSize.w > 0 && gridSize.h > 0, refreshTrigger]);

  // Also listen for collection update events
  useEffect(() => {
    const handleCollectionUpdate = (e: any) => {
      const { grpId, count } = e.detail || {};
      if (grpId !== undefined && count !== undefined) {
        setCards((prev) =>
          prev.map((c) => (c.grp_id === grpId ? { ...c, owned_count: count } : c))
        );
      }
      fetchCollection();
    };
    window.addEventListener('rhystic-collection-updated', handleCollectionUpdate);
    return () => window.removeEventListener('rhystic-collection-updated', handleCollectionUpdate);
  }, [fetchCollection]);

  // Reset to page 1 whenever filters/sort change (but not when only paging).
  const filterKey = [ownedFilter, selectedSets.join(','), selectedColors.join(','), selectedRarities.join(','), selectedTypes.join(','), cmcFilter, copiesFilter, search, sort, sortDir].join('|');
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  // Any advanced-filter state active -> the top-bar sliders icon turns gold.
  const hasActiveAdvancedFilters =
    ownedFilter === 'all' || ownedFilter === 'unowned' || selectedSets.length > 0 ||
    selectedColors.length > 0 || selectedRarities.length > 0 || selectedTypes.length > 0 ||
    cmcFilter !== null || copiesFilter !== null;

  const hasActiveFilters =
    hasActiveAdvancedFilters || search.trim() !== '';

  const clearAllFilters = () => {
    setOwnedFilter('owned');
    setSelectedSets([]);
    setSelectedColors([]);
    setSelectedRarities([]);
    setSelectedTypes([]);
    setCmcFilter(null);
    setCopiesFilter(null);
    setSearch('');
    setSort('name');
    setSortDir('asc');
    setPage(1);
  };

  const adjustCount = async (card: CollectionCard, delta: number) => {
    const newCount = Math.max(0, Math.min(4, card.owned_count + delta));
    if (newCount === card.owned_count) return;
    setBusyGrp(card.grp_id);
    try {
      await invoke('update_collection_card_count', { grpId: card.grp_id, count: newCount });
      await fetchCollection();
    } catch (e) {
      console.error('Failed to update collection count:', e);
    } finally {
      setBusyGrp(null);
    }
  };

  // Wheel-to-change-page: scroll down -> next page (right), scroll up ->
  // previous page (left). Debounced so a single wheel tick flips exactly one
  // page. Uses a native listener (React's synthetic onWheel can be swallowed
  // by the parent overflow-y-auto container) with preventDefault.
  const wheelLock = useRef(false);
  const pageCountRef = useRef(1);
  const setPageRef = useRef(setPage);
  const pageDirRef = useRef<'next' | 'prev'>('next');
  setPageRef.current = setPage;
  pageCountRef.current = totalPages;

  // Page-turn animation. The grid stays mounted — we replay a Web Animation on
  // the wrapper when new data arrives instead of remounting it. Replaying (with
  // an explicit cancel) means the animation can never double-fire or overlap,
  // and the image tiles keep their state (no spinner flash mid-transition).
  const gridAnimRef = useRef<HTMLDivElement>(null);
  const prevCardsPageSizeRef = useRef<number>(0);
  useEffect(() => {
    const el = gridAnimRef.current;
    if (!el) return;
    const cardsPageSize = cols * rows;
    const layoutChanged = prevCardsPageSizeRef.current > 0 && prevCardsPageSizeRef.current !== cardsPageSize;
    prevCardsPageSizeRef.current = cardsPageSize;
    if (layoutChanged) return; // reflow-driven page clamp — no animation
    el.getAnimations().forEach((a) => a.cancel());
    const next = pageDirRef.current === 'next';
    el.animate(
      [
        { opacity: 0.25, transform: next ? 'translateX(14px)' : 'translateX(-14px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 250, easing: 'ease-out' },
    );
  }, [safePage, cols, rows]);

  const goPage = (dir: 'next' | 'prev') => {
    pageDirRef.current = dir;
    if (dir === 'next') {
      setPageRef.current((p) => Math.min(pageCountRef.current, p + 1));
    } else {
      setPageRef.current((p) => Math.max(1, p - 1));
    }
  };

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el || view !== 'cards') return;
    const onWheel = (e: WheelEvent) => {
      if (wheelLock.current) return;
      if (pageCountRef.current <= 1) return;
      if (Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      wheelLock.current = true;
      if (e.deltaY > 0) {
        goPage('next');
      } else {
        goPage('prev');
      }
      setTimeout(() => { wheelLock.current = false; }, 450);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, gridSize]);

  const toggleIn = (list: string[], v: string, setter: (n: string[]) => void) => {
    setter(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  // A few MTGA set codes differ from Keyrune's icon codes; map them so the
  // correct keyrune glyph renders.
  const KEYRUNE_CODE_ALIAS: Record<string, string> = {
    DAR: 'dom', // Dominaria
    CONF: 'con', // Conflux
  };
  const keyruneClass = (code: string) => `ss ss-${(KEYRUNE_CODE_ALIAS[code] || code).toLowerCase()}`;

  // Clicking a table column header sets the sort key and toggles direction.
  const sortByColumn = (key: string) => {
    if (sort === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key);
      if (key === 'set' || key === 'count' || key === 'rarity') {
        setSortDir('desc');
      } else {
        setSortDir('asc');
      }
    }
  };

  const sortArrow = (key: string) => {
    if (sort !== key) return <span className="opacity-0 group-hover:opacity-40 text-neutral-500 font-mono">↕</span>;
    return <span className="font-bold text-white font-mono">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // Column sort keys map to backend sort values.
  const colSortKey = (label: string): string | null => {
    switch (label) {
      case 'Name': return 'name';
      case 'Cost': return 'cmc';
      case 'MV': return 'cmc';
      case 'Type': return null;
      case 'Set': return 'set';
      case 'Rarity': return 'rarity';
      case 'Owned': return 'count';
      default: return null;
    }
  };

  // Sets sorted by most-recent release date first, filtered by the search box.
  const sortedSets = useMemo(() => {
    const q = setNameQuery.trim().toLowerCase();
    const filtered = setOptions.filter((s) =>
      !q || (s.set_code || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q)
    );
    return [...filtered].sort((a, b) =>
      (b.released_at || '').localeCompare(a.released_at || '') ||
      (a.name || a.set_code || '').localeCompare(b.name || b.set_code || '')
    );
  }, [setOptions, setNameQuery]);

  const renderOwnedControl = (card: CollectionCard) => {
    const isOwned = card.owned_count > 0;
    if (!isOwned) {
      return (
        <span className="text-[13.5px] font-mono opacity-30 text-center block w-full">—</span>
      );
    }
    return (
      <span
        className="text-[13.5px] font-mono font-bold tabular-nums text-center block w-full"
        style={{ color: card.owned_count >= 4 ? '#34D399' : palette?.text }}
      >
        {card.owned_count}
      </span>
    );
  };

  const renderCardTile = (card: CollectionCard) => {
    const isOwned = card.owned_count > 0;
    const cardName = card.name || `Unknown Card (#${card.grp_id})`;
    const stylePref = card.name ? getCardStylePref(card.name) : null;
    const activePrinting = stylePref || (card.set_code && card.collector_number ? { setCode: card.set_code, collectorNumber: card.collector_number } : undefined);

    return (
      <button
        key={`${card.grp_id}-${styleRev}-${activePrinting?.setCode || ''}-${activePrinting?.collectorNumber || ''}`}
        onClick={() => onShowCard({ name: cardName, grp_id: card.grp_id }, false)}
        className="group relative rounded-[6px] overflow-hidden text-left transition-shadow hover:shadow-xl hover:ring-2 theme-ring shrink-0"
        style={{ width: cardW, height: cardH }}
        title={cardName}
      >
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.015]" style={{ filter: isOwned ? 'none' : 'saturate(5%)' }}>
          {card.name ? (
            <CardImage
              name={card.name}
              version={isOwned ? 'normal' : 'small'}
              printing={activePrinting}
              alt={cardName}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-black" />
          )}
        </div>

        {/* Ownership diamonds: filled diamonds = owned copies, outline diamonds = unowned,
            shown bottom-center left-to-right. */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => {
            const owned = i < card.owned_count;
            return (
              <span
                key={i}
                className="inline-block w-2 h-2 rotate-45 transition-colors border"
                style={{
                  backgroundColor: owned ? (palette?.accent || '#38BDF8') : 'transparent',
                  borderColor: owned ? (palette?.accent || '#38BDF8') : 'rgba(255,255,255,0.45)',
                  boxShadow: owned ? `0 0 4px ${palette?.accent || '#38BDF8'}aa` : '0 0 2px rgba(0,0,0,0.8)',
                }}
              />
            );
          })}
        </div>
      </button>
    );
  };

  const renderCellContent = (col: CollectionColumnDef, card: CollectionCard) => {
    const rarity = RARITY_INFO[card.rarity] || { label: '—', color: '#9CA3AF' };
    const symbols = parseMtgaManaCost(card.mana_cost || '');
    const cardName = card.name || `Unknown Card (#${card.grp_id})`;

    switch (col.key) {
      case 'art':
        return (
          <div className="flex items-center justify-center">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onShowCard({ name: cardName, grp_id: card.grp_id }, false);
              }}
              className="w-7 h-7 border border-white/10 overflow-hidden shrink-0 cursor-zoom-in transition-all duration-150 hover:scale-125 hover:brightness-110 hover:border-white/50 z-10 bg-neutral-900 shadow-sm"
            >
              <CardImage
                name={cardName}
                version="art_crop"
                alt={cardName}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        );

      case 'name':
        return (
          <div className="flex items-center gap-2 truncate">
            <span
              className="font-semibold text-neutral-100 hover:text-white truncate hover:underline cursor-pointer text-[14px]"
            >
              {cardName}
            </span>
          </div>
        );

      case 'mana_cost':
        return (
          <div className="flex items-center justify-center gap-0.5 w-full">
            {symbols.length > 0 ? (
              symbols.map((s, i) => (
                <ManaFontPip key={i} symbol={s} size={14} />
              ))
            ) : (
              <span className="opacity-30 text-xs font-mono">—</span>
            )}
          </div>
        );

      case 'cmc':
        return (
          <span className="text-xs font-mono text-neutral-300 tabular-nums font-semibold">
            {card.cmc}
          </span>
        );

      case 'card_type': {
        const typeIconClassMap: Record<string, string> = {
          Creature: 'ms-creature',
          Instant: 'ms-instant',
          Sorcery: 'ms-sorcery',
          Artifact: 'ms-artifact',
          Enchantment: 'ms-enchantment',
          Planeswalker: 'ms-planeswalker',
          Battle: 'ms-battle',
          Land: 'ms-land',
        };
        const t = (card.card_type || '').toLowerCase();
        let iconName = 'ms-multicolor';
        let iconColor = '#E2E8F0';
        if (t.includes('creature')) { iconName = 'ms-creature'; iconColor = '#34D399'; }
        else if (t.includes('instant')) { iconName = 'ms-instant'; iconColor = '#F87171'; }
        else if (t.includes('sorcery')) { iconName = 'ms-sorcery'; iconColor = '#FBBF24'; }
        else if (t.includes('artifact')) { iconName = 'ms-artifact'; iconColor = '#94A3B8'; }
        else if (t.includes('enchantment')) { iconName = 'ms-enchantment'; iconColor = '#C084FC'; }
        else if (t.includes('planeswalker')) { iconName = 'ms-planeswalker'; iconColor = '#FB923C'; }
        else if (t.includes('battle')) { iconName = 'ms-battle'; iconColor = '#F43F5E'; }
        else if (t.includes('land')) { iconName = 'ms-land'; iconColor = '#D97706'; }

        return (
          <div className="flex items-center justify-center gap-1.5 w-full truncate" title={card.card_type || ''}>
            <span className={`ms ${iconName} text-sm shrink-0`} style={{ color: iconColor }} />
            <span className="text-xs text-neutral-300 truncate">
              {card.card_type || '—'}
            </span>
          </div>
        );
      }

      case 'set':
        return (
          <div className="flex items-center justify-center gap-1.5 w-full truncate" title={card.set_name || card.set_code || ''}>
            {card.set_code && (
              <i className={`${keyruneClass(card.set_code)} text-sm shrink-0`} style={{ color: palette?.text }} />
            )}
            <span className="text-xs text-neutral-300 truncate">
              {card.set_name || card.set_code || '—'}
            </span>
          </div>
        );

      case 'rarity': {
        const rarityPillStyle: Record<number, { bg: string; fg: string; border: string }> = {
          1: { bg: '#9CA3AF18', fg: '#9CA3AF', border: '#9CA3AF38' }, // Land
          2: { bg: '#E5E7EB14', fg: '#E5E7EB', border: '#E5E7EB30' }, // Common
          3: { bg: '#60A5FA18', fg: '#93C5FD', border: '#60A5FA38' }, // Uncommon (Silver/Blue)
          4: { bg: '#D4AF3718', fg: '#FCD34D', border: '#D4AF3738' }, // Rare (Gold)
          5: { bg: '#F9731618', fg: '#FB923C', border: '#F9731638' }, // Mythic (Orange)
        };
        const style = rarityPillStyle[card.rarity] || { bg: '#9CA3AF18', fg: '#9CA3AF', border: '#9CA3AF38' };
        return (
          <div className="flex items-center justify-center w-full">
            <span
              className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-0.5 border whitespace-nowrap inline-block"
              style={{ backgroundColor: style.bg, borderColor: style.border, color: style.fg }}
            >
              {rarity.label}
            </span>
          </div>
        );
      }

      case 'owned':
        return (
          <div className="flex items-center justify-center">
            {renderOwnedControl(card)}
          </div>
        );

      case 'colors': {
        const colorSyms = parseMtgaManaCost(card.color_identity || card.colors || '');
        return colorSyms.length > 0 ? (
          <div className="flex items-center justify-center gap-0.5">
            {colorSyms.map((s, i) => (
              <ManaPip key={i} symbol={s} size={14} />
            ))}
          </div>
        ) : (
          <span className="opacity-30 text-xs font-mono">—</span>
        );
      }

      case 'collector_number':
        return (
          <span className="text-xs font-mono text-neutral-400 tabular-nums">
            #{card.collector_number || '—'}
          </span>
        );

      case 'released':
        return (
          <span className="text-xs font-mono text-neutral-400 tabular-nums">
            {card.set_released_at || '—'}
          </span>
        );

      case 'grp_id':
        return (
          <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
            {card.grp_id}
          </span>
        );

      default:
        return null;
    }
  };

  // Active advanced-filter chips shown in a pop-down below the top bar. Search
  // text and the top-bar color pips are excluded (already visible in the bar).
  const typeIconClass: Record<string, string> = {
    Creature: 'ms-creature',
    Planeswalker: 'ms-planeswalker',
    Battle: 'ms-battle',
    Instant: 'ms-instant',
    Sorcery: 'ms-sorcery',
    Enchantment: 'ms-enchantment',
    Artifact: 'ms-artifact',
    Land: 'ms-land',
    Other: 'ms-multicolor',
  };

  // Active advanced-filter chips. Memoized so its reference is stable across
  // renders — the chip-measurement effects depend on it, and a fresh array
  // every render caused an infinite re-render loop (black screen).
  const activeChips = useMemo<{ key: string; icon: React.ReactNode; label: string; onRemove: () => void }[]>(() => {
    const chips: { key: string; icon: React.ReactNode; label: string; onRemove: () => void }[] = [];
    for (const sc of selectedSets) {
      const s = setOptions.find((x) => x.set_code === sc);
      chips.push({
        key: `set-${sc}`,
        icon: <i className={`${keyruneClass(sc)} shrink-0`} style={{ fontSize: 15, color: palette?.text }} />,
        label: s?.name || sc,
        onRemove: () => toggleIn(selectedSets, sc, setSelectedSets),
      });
    }
    for (const t of selectedTypes) {
      chips.push({
        key: `type-${t}`,
        icon: <i className={`ms ${typeIconClass[t] || 'ms-multicolor'} shrink-0`} style={{ fontSize: 13, color: palette?.text }} />,
        label: t,
        onRemove: () => toggleIn(selectedTypes, t, setSelectedTypes),
      });
    }
    if (cmcFilter !== null) {
      chips.push({
        key: 'cmc',
        icon: <ManaPip symbol={cmcFilter === 8 ? '8' : String(cmcFilter)} size={15} />,
        label: `Mana value ${cmcFilter === 8 ? '8+' : cmcFilter}`,
        onRemove: () => setCmcFilter(null),
      });
    }
    for (const r of selectedRarities) {
      const info = RARITY_INFO[r] || { label: 'Rarity', color: '#9CA3AF' };
      chips.push({
        key: `rar-${r}`,
        icon: <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} />,
        label: info.label,
        onRemove: () => setSelectedRarities(selectedRarities.filter((x) => x !== r)),
      });
    }
    if (ownedFilter === 'all') {
      chips.push({
        key: 'all',
        icon: <span className="w-2.5 h-2.5 rounded-full shrink-0 border" style={{ borderColor: palette?.accent || '#38BDF8', backgroundColor: 'transparent' }} />,
        label: 'All cards',
        onRemove: () => setOwnedFilter('owned'),
      });
    } else if (ownedFilter === 'unowned') {
      chips.push({
        key: 'unowned',
        icon: <span className="w-2.5 h-2.5 rounded-full shrink-0 border" style={{ borderColor: palette?.text, backgroundColor: 'transparent' }} />,
        label: 'Not Collected',
        onRemove: () => setOwnedFilter('owned'),
      });
    }
    if (copiesFilter !== null) {
      chips.push({
        key: 'copies',
        icon: (
          <span className="flex items-end gap-0.5 shrink-0">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="rounded-full"
                style={{
                  width: i < copiesFilter ? 6 : 4,
                  height: i < copiesFilter ? 6 : 4,
                  backgroundColor: i < copiesFilter ? (palette?.accent || '#38BDF8') : `${palette?.text}44`,
                }}
              />
            ))}
          </span>
        ),
        label: `${copiesFilter} copy${copiesFilter === 1 ? '' : 's'}`,
        onRemove: () => setCopiesFilter(null),
      });
    }
    return chips;
  }, [selectedSets, selectedTypes, cmcFilter, selectedRarities, ownedFilter, copiesFilter, setOptions, palette]);

  // Measured chip visibility: the applied-filter chips live in a single flex
  // row that shows as many WHOLE chips as fit before the sort selector, then a
  // "…" indicator. A hidden off-screen measurer reads each chip's natural width;
  // the available chip space is (spacer + row) which is constant regardless of
  // how many chips are rendered, so it can be read on any layout.
  const chipRowRef = useRef<HTMLSpanElement>(null);
  const measurerRef = useRef<HTMLSpanElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [chipWidths, setChipWidths] = useState<number[]>([]);
  const [ellipsisWidth, setEllipsisWidth] = useState(0);
  const [visibleChips, setVisibleChips] = useState(activeChips.length);
  const CHIP_GAP = 4; // matches the row's gap-1

  const countFitChips = (widths: number[], ellipsisW: number, available: number): number => {
    const safety = 16;
    let used = 0;
    let count = 0;
    for (let i = 0; i < widths.length; i++) {
      const add = widths[i] + (i > 0 ? CHIP_GAP : 0);
      if (used + add > available - safety) break;
      used += add;
      count++;
    }
    // If not everything fits, make room for the "…" indicator and retry.
    if (count < widths.length && ellipsisW > 0) {
      used = ellipsisW + CHIP_GAP;
      count = 0;
      for (let i = 0; i < widths.length; i++) {
        const add = widths[i] + (i > 0 ? CHIP_GAP : 0);
        if (used + add > available - safety) break;
        used += add;
        count++;
      }
    }
    return count;
  };

  // Shared chip renderers (used by both the visible row and the hidden measurer
  // so their widths match exactly).
  const renderChip = (chip: { key: string; icon: React.ReactNode; label: string; onRemove: () => void }) => (
    <span
      key={chip.key}
      onClick={(e) => { e.stopPropagation(); chip.onRemove(); }}
      className="group flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold cursor-pointer transition-colors hover:bg-white/10"
      style={{ borderColor: palette?.border, color: palette?.text, backgroundColor: `${palette?.accent || '#38BDF8'}10` }}
      title="Remove this filter"
    >
      {chip.icon}
      <span>{chip.label}</span>
      <X className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
    </span>
  );

  const renderEllipsisChip = () => (
    <span
      onClick={(e) => { e.stopPropagation(); setShowAdvModal(true); }}
      className="flex shrink-0 items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-bold leading-none cursor-pointer transition-colors hover:bg-white/10"
      style={{ borderColor: palette?.border, color: palette?.accent || '#38BDF8', backgroundColor: `${palette?.accent || '#38BDF8'}10` }}
      title="More filters — open advanced filters"
    >
      …
    </span>
  );

  // Measure chip widths + recompute how many fit whenever the filter chips change.
  useLayoutEffect(() => {
    const measurer = measurerRef.current;
    const row = chipRowRef.current;
    const spacer = spacerRef.current;
    if (!measurer || !row || !spacer || measurer.children.length === 0) return;
    const widths = Array.from(measurer.children).map((el) => (el as HTMLElement).offsetWidth);
    const chipW = widths.slice(0, -1);
    const ellW = widths[widths.length - 1] || 0;
    const available = spacer.offsetWidth + row.offsetWidth;
    setChipWidths(chipW);
    setEllipsisWidth(ellW);
    setVisibleChips(countFitChips(chipW, ellW, available));
  }, [activeChips]);

  // Recompute on window / top-bar resize.
  useLayoutEffect(() => {
    const bar = topBarRef.current;
    const row = chipRowRef.current;
    const spacer = spacerRef.current;
    if (!bar || !row || !spacer || chipWidths.length === 0) return;
    const recompute = () => {
      const available = spacer.offsetWidth + row.offsetWidth;
      setVisibleChips(countFitChips(chipWidths, ellipsisWidth, available));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [chipWidths, ellipsisWidth]);

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-library text-2xl" style={{ color: palette?.accent || '#A855F7' }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            CARD LIBRARY
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({serverTotalCards.toLocaleString()} cards · {serverTotalOwned.toLocaleString()} collected · {serverTotalOwnedCopies.toLocaleString()} copies)
          </span>
        </div>
        {error && <span className="text-[11px] font-mono text-rose-400">{error}</span>}
      </div>

      {/* 2. TOP FILTER & CONTROLS TOOLBAR */}
      <div
        ref={topBarRef}
        className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap"
      >
        {/* Search */}
        <div className="relative w-64 shrink-0 h-8 flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
          />
          {search.length > 0 && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Color pips: multi-select, toggles selectedColors. */}
        <div className="flex items-center gap-1.5 pl-0.5">
          {['W', 'U', 'B', 'R', 'G', 'C'].map((c) => {
            const active = selectedColors.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleIn(selectedColors, c, setSelectedColors)}
                className={`transition-all cursor-pointer ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                title={c === 'C' ? 'Colorless' : `Filter ${c}`}
              >
                <ManaPip symbol={c} size={22} />
              </button>
            );
          })}
        </div>

        {/* Advanced Filter — expands to show applied filters inline when active */}
        <button
          onClick={() => setShowAdvModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer min-w-0 ${
            hasActiveAdvancedFilters
              ? 'bg-white/[0.08] text-white font-bold'
              : 'bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white'
          }`}
          title="Advanced filters"
        >
          <SlidersHorizontal
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: hasActiveAdvancedFilters ? '#FBBF24' : undefined }}
          />
          {hasActiveAdvancedFilters && activeChips.length === 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          )}
          {activeChips.length > 0 && (
            <>
              <span className="text-[10px] font-mono uppercase tracking-wide font-bold shrink-0" style={{ color: palette?.accent || '#A855F7' }}>
                Filtered by
              </span>
              {/* Chip row: single line, whole chips only, "…" indicator for the rest */}
              <span ref={chipRowRef} className="flex items-center gap-1 min-w-0 overflow-hidden">
                {activeChips.slice(0, visibleChips).map(renderChip)}
                {visibleChips < activeChips.length && renderEllipsisChip()}
              </span>
              {/* Clear all filters — bold red X */}
              <span
                onClick={(e) => { e.stopPropagation(); clearAllFilters(); }}
                className="shrink-0 p-0.5 rounded-none cursor-pointer transition-colors hover:bg-red-500/20"
                style={{ color: '#F87171' }}
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
            </>
          )}
        </button>

        <div ref={spacerRef} className="flex-1" />

        {/* SORT (cards) / COLUMNS (table) — left of view toggle */}
        <div className="relative">
          {view === 'table' ? (
            <button
              onClick={() => setShowColumnModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all cursor-pointer"
              title="Modify, add/remove, and reorder table columns"
            >
              <Columns3 className="w-3.5 h-3.5" style={{ color: palette?.accent || '#A855F7' }} />
              <span>({visibleColumns.length})</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all cursor-pointer"
                title="Sort cards"
              >
                {sortDir === 'asc'
                  ? <ArrowUpNarrowWide className="w-3.5 h-3.5 -scale-x-100" />
                  : <ArrowDownWideNarrow className="w-3.5 h-3.5 -scale-x-100" />}
                <span>: {SORT_LABEL[sort] || sort.toUpperCase()}</span>
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-30 w-52 border border-white/15 bg-neutral-950 shadow-xl">
                    {(['name','cmc','rarity','set','released','count'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => { sortByColumn(k as any); setSortOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:bg-white/[0.06] transition-colors cursor-pointer ${sort === k ? 'text-white font-bold bg-white/[0.08]' : 'text-neutral-400'}`}
                      >
                        {SORT_LABEL[k]}<span className="float-right font-mono text-[10px]">{sort === k ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-white/[0.03] p-0.5 overflow-hidden gap-0.5">
          <button
            onClick={() => setView('cards')}
            title="Card view"
            className={`flex items-center justify-center px-2 py-1 transition-all cursor-pointer ${
              view === 'cards' ? 'bg-white/[0.12] text-white shadow-sm font-bold' : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView('table')}
            title="Table view"
            className={`flex items-center justify-center px-2 py-1 transition-all cursor-pointer ${
              view === 'table' ? 'bg-white/[0.12] text-white shadow-sm font-bold' : 'opacity-40 hover:opacity-90 hover:bg-white/[0.05] text-neutral-400'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card size toggle */}
        <button
          onClick={() => view === 'cards' && setCardSize(cardSize === 'small' ? 'large' : 'small')}
          disabled={view !== 'cards'}
          className={`flex items-center justify-center px-2.5 py-1.5 bg-transparent hover:bg-white/[0.08] active:scale-95 transition-all ${
            view === 'cards' ? 'text-neutral-300 hover:text-white cursor-pointer' : 'opacity-20 cursor-not-allowed text-neutral-600'
          }`}
          title={view === 'cards' ? (cardSize === 'small' ? 'Switch to large cards' : 'Switch to small cards') : 'Card size only applies to card view'}
        >
          {cardSize === 'small' ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
        </button>
      </div>

      {/* Hidden measurer: all chips + ellipsis at natural width, used to compute
          how many whole chips fit in the row above. */}
      {activeChips.length > 0 && (
        <span
          ref={measurerRef}
          aria-hidden="true"
          className="absolute left-[-9999px] top-0 flex items-center gap-1 whitespace-nowrap invisible"
        >
          {activeChips.map(renderChip)}
          {renderEllipsisChip()}
        </span>
      )}

      {/* Content: cards grid or table */}
      {view === 'cards' ? (
        <div
          ref={setGridWrapRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar relative"
        >
          <div
            className="h-full min-h-0 flex flex-wrap content-center items-start justify-center gap-3"
            style={{ paddingTop: 4, paddingBottom: 4 }}
          >
            <div
              ref={gridAnimRef}
              className="h-full min-h-0 w-full flex flex-wrap content-center items-start justify-center gap-3"
            >
              {displayedCards.map((c) => renderCardTile(c))}
            </div>
          </div>
          {loading && displayedCards.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
              <span className="text-xs font-mono opacity-70">Loading collection…</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-mono opacity-40">No cards match the current filters</span>
            </div>
          ) : null}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
          {/* Floating Frozen Table Header */}
          <div className="flex items-center h-[34px] px-4 shrink-0 select-none text-xs font-sans font-bold text-white">
            {visibleColumns.map((col) => {
              const sortable = col.sortKey != null;
              const isNameCol = col.key === 'name';
              return (
                <div
                  key={col.key}
                  className={`${col.width || 'flex-1'} px-1.5 ${
                    isNameCol ? 'text-left' : 'text-center'
                  }`}
                >
                  {sortable ? (
                    <button
                      onClick={() => sortByColumn(col.sortKey!)}
                      className={`group inline-flex items-center gap-1 hover:text-neutral-200 transition-colors cursor-pointer text-white font-bold ${
                        isNameCol ? 'justify-start' : 'justify-center w-full'
                      }`}
                      style={{ color: sort === col.sortKey ? (palette?.accent || '#A855F7') : '#FFFFFF' }}
                    >
                      <span>{col.label}</span>
                      <span className="text-[9px]">{sortArrow(col.sortKey!)}</span>
                    </button>
                  ) : (
                    <div className={`flex items-center ${isNameCol ? 'justify-start' : 'justify-center'}`}>
                      <span>{col.label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Table Rows Body Container with Scrollbar */}
          <div className="border border-white/10 bg-neutral-950/50 backdrop-blur-md overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="divide-y divide-white/5 overflow-y-auto custom-scrollbar flex-1">
              {displayedCards.map((card) => (
                <div
                  key={card.grp_id}
                  onClick={() => onShowCard({ name: card.name || `Unknown Card (#${card.grp_id})`, grp_id: card.grp_id }, false)}
                  className="flex items-center py-2 px-4 transition-colors cursor-pointer group hover:bg-white/[0.04]"
                >
                  {visibleColumns.map((col) => {
                    const isNameCol = col.key === 'name';
                    return (
                      <div
                        key={col.key}
                        className={`${col.width || 'flex-1'} px-1.5 min-w-0 ${
                          isNameCol ? 'text-left' : 'text-center flex items-center justify-center'
                        }`}
                      >
                        {renderCellContent(col, card)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {loading && displayedCards.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
              <span className="text-xs font-mono opacity-70">Loading collection…</span>
            </div>
          ) : cards.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-mono opacity-40">No cards match the current filters</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Footer: pagination controls + total card count */}
      <div className="shrink-0 flex items-center gap-3 pt-2">
        {totalPages > 1 && (
          <>
            <div className="flex-1 flex justify-start">
              <button
                onClick={() => {
                  pageDirRef.current = 'prev';
                  setPage(1);
                }}
                disabled={safePage <= 1}
                className="flex items-center justify-center p-1.5 text-xs font-bold bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-400 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
                title="First page"
              >
                <Home className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => goPage('prev')}
                disabled={safePage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-transparent hover:bg-white/[0.08] active:scale-95 text-neutral-300 hover:text-white transition-all disabled:opacity-20 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs font-mono text-neutral-400 px-2">
                Page <span className="text-white font-bold">{safePage}</span> of <span className="text-neutral-400">{totalPages}</span>
              </span>
              <button
                onClick={() => goPage('next')}
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
            <span className="text-white font-bold">{serverTotalOwned.toLocaleString()}</span> / {serverTotalCards.toLocaleString()} cards owned
          </span>
        </div>
      </div>

      {/* 3. ADVANCED FILTERS MODAL */}
      {showAdvModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setShowAdvModal(false)}
        >
          <div
            className="w-[900px] max-w-full max-h-[85vh] flex flex-col bg-neutral-950/92 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5" style={{ color: palette?.accent || '#A855F7' }} />
                <h2 className="text-lg font-display font-bold tracking-[0.14em] uppercase text-white">
                  ADVANCED CARD FILTERS
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAllFilters}
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

            {/* Modal Body: Two Columns */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* Left Column: Colors / Mana Value / Collected / Copies / Rarity / Type */}
              <div className="w-[55%] shrink-0 border-r border-white/10 overflow-y-auto custom-scrollbar p-6 space-y-5 bg-neutral-950/60">
                {/* 1. Mana Cost / Color Identity */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                    MANA COST / COLOR IDENTITY
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['W', 'U', 'B', 'R', 'G', 'C'].map((c) => {
                      const active = selectedColors.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => toggleIn(selectedColors, c, setSelectedColors)}
                          className={`transition-all cursor-pointer ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                          title={c === 'C' ? 'Colorless' : `Toggle ${c}`}
                        >
                          <ManaPip symbol={c} size={24} />
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setSelectedColors([])}
                      className={`ml-1 px-2.5 py-1 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                        selectedColors.length === 0
                          ? 'border-white/40 bg-white/[0.1] text-white font-bold shadow-sm'
                          : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white'
                      }`}
                      title="Clear color filter (show all colors)"
                    >
                      All Colors
                    </button>
                  </div>
                </div>

                {/* 2. Mana Value (CMC) */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                    MANA VALUE (CMC)
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CMC_OPTIONS.map((v) => {
                      const active = cmcFilter === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setCmcFilter(active ? null : v)}
                          className={`transition-all cursor-pointer ${active ? 'scale-110' : 'opacity-35 hover:opacity-75'}`}
                          title={v === 8 ? '8 or more mana' : `Mana value ${v}`}
                        >
                          {v === 8 ? (
                            <span className="relative inline-block">
                              <ManaPip symbol="8" size={24} />
                              <span
                                className="absolute -top-1 -right-1.5 text-[11px] font-black leading-none"
                                style={{ color: '#94A3B8', textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
                              >
                                +
                              </span>
                            </span>
                          ) : (
                            <ManaPip symbol={String(v)} size={24} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Collected / Uncollected */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                    COLLECTION STATUS
                  </p>
                  <div className="flex border border-white/10 bg-white/[0.02] overflow-hidden w-fit">
                    {(['all', 'owned', 'unowned'] as const).map((o) => {
                      const active = ownedFilter === o;
                      return (
                        <button
                          key={o}
                          onClick={() => setOwnedFilter(o)}
                          className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer border-r border-white/10 last:border-r-0 ${
                            active
                              ? 'bg-white/[0.1] text-white font-bold shadow-sm'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                          style={{
                            color: active ? (palette?.accent || '#A855F7') : undefined,
                          }}
                        >
                          {o === 'all' ? 'All' : o === 'owned' ? 'Collected' : 'Not Collected'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Copies Owned */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                    EXACT COPIES OWNED
                  </p>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4].map((n) => {
                      const active = copiesFilter === n;
                      return (
                        <button
                          key={n}
                          onClick={() => setCopiesFilter(active ? null : n)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                            active
                              ? 'border-white/40 bg-white/[0.1] text-white font-bold shadow-sm'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-neutral-400 hover:text-white'
                          }`}
                          style={{
                            borderColor: active ? (palette?.accent || '#A855F7') : undefined,
                          }}
                          title={`Filter cards with exactly ${n} copies owned`}
                        >
                          <span className="flex items-center gap-0.5 text-xs font-mono">
                            {[1, 2, 3, 4].map((i) => (
                              <span
                                key={i}
                                className={
                                  i <= n
                                    ? active
                                      ? 'text-cyan-400 font-bold'
                                      : 'text-neutral-300'
                                    : 'text-neutral-600'
                                }
                              >
                                {i <= n ? '◆' : '◇'}
                              </span>
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Rarity */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                    RARITY TIER
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {RARITY_ORDER.map((r) => {
                      const active = selectedRarities.includes(r.value);
                      const info = RARITY_INFO[r.value] || { color: '#9CA3AF' };
                      return (
                        <button
                          key={r.value}
                          onClick={() => setSelectedRarities(active ? selectedRarities.filter((x) => x !== r.value) : [...selectedRarities, r.value])}
                          className={`px-3 py-1 text-xs font-mono uppercase tracking-wider border transition-all cursor-pointer font-bold ${
                            active
                              ? 'border-white/40 shadow-sm'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] opacity-75 hover:opacity-100'
                          }`}
                          style={{
                            borderColor: active ? info.color : undefined,
                            color: info.color,
                            backgroundColor: active ? `${info.color}20` : undefined,
                          }}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Card Type */}
                <div>
                  <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                    CARD TYPE
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CARD_TYPES.map((t) => {
                      const active = selectedTypes.includes(t);
                      const typeIcon = {
                        Creature: 'ms ms-creature',
                        Instant: 'ms ms-instant',
                        Sorcery: 'ms ms-sorcery',
                        Enchantment: 'ms ms-enchantment',
                        Artifact: 'ms ms-artifact',
                        Planeswalker: 'ms ms-planeswalker',
                        Land: 'ms ms-land',
                        Battle: 'ms ms-battle',
                      }[t] || 'ms ms-multiple';

                      return (
                        <button
                          key={t}
                          onClick={() => toggleIn(selectedTypes, t, setSelectedTypes)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                            active
                              ? 'border-white/40 bg-white/[0.1] text-white font-bold shadow-sm'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-neutral-400 hover:text-white'
                          }`}
                          style={{
                            borderColor: active ? (palette?.accent || '#A855F7') : undefined,
                            color: active ? (palette?.accent || '#A855F7') : undefined,
                          }}
                        >
                          <span className={`${typeIcon} text-xs shrink-0`} />
                          <span>{t}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Set Filter */}
              <div className="flex-1 min-w-0 flex flex-col p-6 bg-neutral-950/60">
                <p className="text-[11px] font-sans font-semibold tracking-[0.14em] uppercase text-neutral-400 opacity-75 mb-2">
                  EXPANSION SET <span className="normal-case opacity-50">({selectedSets.length} selected)</span>
                </p>
                <input
                  type="text"
                  placeholder="Search sets..."
                  value={setNameQuery}
                  onChange={(e) => setSetNameQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-none border border-white/10 bg-white/[0.03] text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30 transition-colors font-sans mb-3"
                />
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                  {sortedSets.map((s) => {
                    const active = selectedSets.includes(s.set_code);
                    return (
                      <button
                        key={s.set_code}
                        onClick={() => toggleIn(selectedSets, s.set_code, setSelectedSets)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 border text-xs font-sans transition-colors cursor-pointer ${
                          active
                            ? 'border-white/30 bg-white/[0.08] text-white font-bold shadow-sm'
                            : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.04] text-neutral-400 hover:text-white'
                        }`}
                        style={{
                          borderColor: active ? (palette?.accent || '#A855F7') : undefined,
                          color: active ? (palette?.accent || '#A855F7') : undefined,
                        }}
                        title={s.released_at ? `Released ${s.released_at}` : s.set_code}
                      >
                        <i
                          className={`${keyruneClass(s.set_code || '')} text-base shrink-0`}
                          style={{ color: active ? (palette?.accent || '#A855F7') : '#A1A1AA' }}
                          title={s.set_code}
                        />
                        <span className="truncate flex-1 text-left">{s.name || s.set_code}</span>
                        {active && <span className="text-[10px] font-mono shrink-0">✓</span>}
                      </button>
                    );
                  })}
                  {sortedSets.length === 0 && (
                    <p className="text-xs font-mono opacity-40 py-2">No sets match</p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
              <button
                onClick={() => setShowAdvModal(false)}
                className="px-5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold shadow-md transition-all cursor-pointer hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: palette?.accent || '#A855F7',
                  color: getContrastTextColor(palette?.accent || '#A855F7'),
                }}
              >
                Done
              </button>
            </div>
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
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-neutral-950/92 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div>
                <div className="flex items-center gap-2">
                  <Columns3 className="w-5 h-5" style={{ color: palette?.accent || '#A855F7' }} />
                  <h2 className="text-lg font-display font-bold tracking-[0.14em] uppercase text-white">
                    CUSTOMIZE CARD TABLE COLUMNS
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-sans">
                  Toggle column visibility and drag or click arrows to reorder library table columns.
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
                      borderColor: isTarget ? (palette?.accent || '#A855F7') : undefined,
                      backgroundColor: isTarget ? `${palette?.accent || '#A855F7'}18` : undefined,
                      boxShadow: isTarget ? `0 0 15px ${palette?.accent || '#A855F7'}44` : undefined,
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
                          backgroundColor: col.visible ? (palette?.accent || '#A855F7') : 'transparent',
                          borderColor: col.visible ? (palette?.accent || '#A855F7') : undefined,
                        }}
                      >
                        {col.visible && (
                          <Check
                            className="w-3 h-3 stroke-[3]"
                            style={{ color: getContrastTextColor(palette?.accent || '#A855F7') }}
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
                                color: palette?.accent || '#A855F7',
                                borderColor: `${palette?.accent || '#A855F7'}66`,
                                backgroundColor: `${palette?.accent || '#A855F7'}20`,
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Defaults</span>
              </button>
              <button
                onClick={() => setShowColumnModal(false)}
                className="px-5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold shadow-md transition-all cursor-pointer hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: palette?.accent || '#A855F7',
                  color: getContrastTextColor(palette?.accent || '#A855F7'),
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
}

export default CollectionView;
