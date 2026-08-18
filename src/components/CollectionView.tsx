import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Search,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutGrid,
  Table2,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
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
  const [sort, setSort] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAdvModal, setShowAdvModal] = useState(false);

  const [setOptions, setSetOptions] = useState<{ set_code: string; name: string | null; released_at: string | null; icon_svg_uri: string | null }[]>([]);
  const [setNameQuery, setSetNameQuery] = useState('');

  // View mode + card size, persisted locally.
  const [view, setView] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('collectionView');
    return saved === 'table' ? 'table' : 'cards';
  });
  const [cardSize, setCardSize] = useState<'small' | 'large'>(() => {
    const saved = localStorage.getItem('collectionCardSize');
    return saved === 'small' ? 'small' : 'large';
  });

  // Cards keep a FIXED footprint per size mode (small / large). The grid fits
  // as many rows and columns as the available space allows — window width
  // drives columns, window height drives rows, both instantly.
  const CARD_W_SMALL = 194;
  const CARD_H_SMALL = 271;
  const CARD_W_LARGE = 250;
  const CARD_H_LARGE = 380;
  const GRID_GAP = 12;

  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure the content area so we can auto-fit columns/rows of fixed cards in card view.
  // Only drives CLIENT-SIDE pagination (never the network fetch), so resizing
  // the window can't cause refetch loops.
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setGridSize((prev) => {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
  useEffect(() => {
    const el = gridAnimRef.current;
    if (!el) return;
    // Cancel any still-running animation so rapid paging can't stack them.
    el.getAnimations().forEach((a) => a.cancel());
    const next = pageDirRef.current === 'next';
    el.animate(
      [
        { opacity: 0.25, transform: next ? 'translateX(14px)' : 'translateX(-14px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 250, easing: 'ease-out' },
    );
  }, [safePage]);

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
      setSortDir('asc');
    }
  };

  const sortArrow = (key: string) => {
    if (sort !== key) return <span className="opacity-0 group-hover:opacity-60">↕</span>;
    return sortDir === 'asc' ? '▲' : '▼';
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
        <span className="text-[12px] font-mono opacity-30 text-center block w-full">—</span>
      );
    }
    return (
      <span
        className="text-[12px] font-mono font-bold tabular-nums text-center block w-full"
        style={{ color: card.owned_count >= 4 ? '#34D399' : palette?.text }}
      >
        {card.owned_count}
      </span>
    );
  };

  const renderCardTile = (card: CollectionCard) => {
    const isOwned = card.owned_count > 0;
    const cardName = card.name || `Unknown Card (#${card.grp_id})`;

    return (
      <button
        key={card.grp_id}
        onClick={() => onShowCard({ name: cardName, grp_id: card.grp_id }, false)}
        className="group relative rounded-[6px] overflow-hidden text-left transition-all hover:shadow-xl hover:ring-2 theme-ring shrink-0"
        style={{ width: cardW, height: cardH }}
        title={cardName}
      >
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.015]" style={{ filter: isOwned ? 'none' : 'saturate(5%)' }}>
          {card.name ? (
            <CardImage
              name={card.name}
              version={isOwned ? 'normal' : 'small'}
              printing={getCardStylePref(card.name) || { setCode: card.set_code, collectorNumber: card.collector_number }}
              alt={cardName}
              className="absolute inset-0 w-full h-full object-cover"
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

  const renderTableRow = (card: CollectionCard) => {
    const isOwned = card.owned_count > 0;
    const rarity = RARITY_INFO[card.rarity] || { label: '-', color: '#9CA3AF' };
    const symbols = parseMtgaManaCost(card.mana_cost || '');
    const cardName = card.name || `Unknown Card (#${card.grp_id})`;
    return (
      <tr
        key={card.grp_id}
        onClick={() => onShowCard({ name: cardName, grp_id: card.grp_id }, false)}
        className="cursor-pointer transition-colors hover:bg-white/5"
        style={{ borderColor: `${palette?.border}44` }}
      >
        <td className="px-3 py-1.5 text-[12px] font-semibold truncate max-w-[260px]" style={{ color: palette?.text }}>
          {cardName}
        </td>
        <td className="px-3 py-1.5">
          <span className="flex items-center gap-0.5">
            {symbols.length > 0 ? symbols.map((s, i) => <ManaFontPip key={i} symbol={s} size={14} />) : <span className="opacity-30 text-[10px]">—</span>}
          </span>
        </td>
        <td className="px-3 py-1.5 text-[11px] font-mono opacity-70">{card.cmc}</td>
        <td className="px-3 py-1.5 text-[11px] opacity-70 truncate max-w-[180px]">{card.card_type || '—'}</td>
        <td className="px-3 py-1.5 text-[11px] opacity-70 truncate max-w-[160px]">{card.set_name || card.set_code || '—'}</td>
        <td className="px-3 py-1.5 text-[11px] font-mono" style={{ color: rarity.color }}>{rarity.label}</td>
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            {renderOwnedControl(card)}
          </div>
        </td>
      </tr>
    );
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
    <div className="flex-1 relative flex flex-col space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Card Library
          </h1>
        </div>
        {error && <span className="text-[11px] font-mono text-rose-400">{error}</span>}
      </div>

      {/* Top bar */}
      <div
        ref={topBarRef}
        className="shrink-0 rounded-2xl border p-2.5 flex items-center gap-2.5"
        style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
      >
        {/* Search */}
        <div className="relative w-64 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border bg-black/30 focus:outline-none"
            style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
          />
          {search.length > 0 && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-white/10"
              style={{ color: palette?.text }}
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
                className={`transition-all ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                title={c === 'C' ? 'Colorless' : `Filter ${c}`}
              >
                <ManaPip symbol={c} size={22} />
              </button>
            );
          })}
        </div>

        {/* Advanced Filter — expands to show applied filters inline when active.
            Chips stay on a single line and clip with an ellipsis if they don't
            fit, and the pill's height is capped so the top bar never grows. */}
        <button
          onClick={() => setShowAdvModal(true)}
          className={`flex items-center gap-1.5 px-2.5 h-[32px] rounded-xl border transition-all hover:bg-white/5 min-w-0 ${
            hasActiveAdvancedFilters ? '' : 'opacity-60 hover:opacity-100'
          }`}
          style={{
            backgroundColor: palette?.surface,
            borderColor: hasActiveAdvancedFilters ? `${palette?.accent || '#38BDF8'}55` : palette?.border,
            color: palette?.text,
          }}
          title="Advanced filters"
        >
          <SlidersHorizontal
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: hasActiveAdvancedFilters ? '#FBBF24' : palette?.text }}
          />
          {hasActiveAdvancedFilters && activeChips.length === 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          )}
          {activeChips.length > 0 && (
            <>
              <span className="text-[10px] font-mono uppercase tracking-wide font-bold shrink-0" style={{ color: palette?.accent || '#38BDF8' }}>
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
                className="shrink-0 p-0.5 rounded-md cursor-pointer transition-colors hover:bg-red-500/20"
                style={{ color: '#F87171' }}
                title="Clear all filters"
              >
                <X className="w-4 h-4" strokeWidth={3} />
              </span>
            </>
          )}
        </button>

        <div ref={spacerRef} className="flex-1" />

        {/* Sort dropdown with embedded direction toggle: clicking an item once
            selects it ascending; clicking the same item again toggles direction.
            The selected item is prefixed with an up/down arrow glyph. */}
        <div className="w-44">
          <CustomDropdown
            options={SORT_OPTIONS.map((o) => ({
              value: o.value,
              label: sort === o.value
                ? `${sortDir === 'asc' ? '▲' : '▼'} ${o.label}`
                : o.label,
            }))}
            value={sort}
            onChange={(val) => {
              if (val === sort) {
                setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
              } else {
                setSort(val);
                setSortDir('asc');
              }
            }}
            palette={palette}
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-xl border overflow-hidden" style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}>
          <button
            onClick={() => setView('cards')}
            title="Card view"
            className={`flex items-center justify-center px-2.5 py-2 transition-all ${view === 'cards' ? '' : 'opacity-50 hover:opacity-100'}`}
            style={{ color: palette?.text }}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView('table')}
            title="Table view"
            className={`flex items-center justify-center px-2.5 py-2 transition-all ${view === 'table' ? '' : 'opacity-50 hover:opacity-100'}`}
            style={{ color: palette?.text }}
          >
            <Table2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card size toggle: the icon shows what you'll switch TO (zoom-in when
            currently small, zoom-out when large). Kept visible in table view but
            disabled/greyed so the top bar stays consistent. */}
        <button
          onClick={() => view === 'cards' && setCardSize(cardSize === 'small' ? 'large' : 'small')}
          disabled={view !== 'cards'}
          className={`flex items-center justify-center px-2.5 py-2 rounded-xl border transition-all ${
            view === 'cards' ? 'hover:bg-white/5' : 'opacity-40 cursor-not-allowed'
          }`}
          style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
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
      <div
        ref={gridWrapRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar relative"
      >
        {view === 'cards' && (
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
        )}
        {view === 'table' && displayedCards.length > 0 && (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: palette?.border }}>
            <table className="w-full text-left border-collapse" style={{ color: palette?.text }}>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: palette?.subtext, backgroundColor: `${palette?.surface}` }}>
                  {['Name', 'Cost', 'MV', 'Type', 'Set', 'Rarity', 'Owned'].map((col) => {
                    const key = colSortKey(col);
                    const sortable = key != null;
                    return (
                      <th key={col} className={`px-3 py-2 ${col === 'Owned' ? 'text-center w-16' : ''}`}>
                        {sortable ? (
                          <button
                            onClick={() => sortByColumn(key!)}
                            className={`group flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold hover:opacity-100 ${col === 'Owned' ? 'justify-center w-full' : ''}`}
                            style={{ color: sort === key ? (palette?.accent || '#38BDF8') : palette?.subtext }}
                          >
                            {col}
                            <span className="text-[9px]">{sortArrow(key!)}</span>
                          </button>
                        ) : (
                          col
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayedCards.map(renderTableRow)}
              </tbody>
            </table>
          </div>
        )}
        {/* Loading / empty overlays on top of the mounted grid. The loading
            overlay only covers when there is nothing to show yet (initial load /
            filter change with empty cache) — during page flips the previous
            page stays visible so the page-turn reads cleanly, no dark flash. */}
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

      {/* Footer: pagination controls (when multiple pages) + global owned/total
          count (always visible, filter-independent) */}
      <div className="shrink-0 flex items-center gap-4 pt-1">
        {totalPages > 1 && (
          <>
            <button
              onClick={() => {
                pageDirRef.current = 'prev';
                setPage(1);
              }}
              disabled={safePage <= 1}
              className="flex items-center justify-center p-2 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
              title="First page"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => goPage('prev')}
              disabled={safePage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-[11px] font-mono opacity-60">
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => goPage('next')}
              disabled={safePage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
          </>
        )}
        <span className="text-[11px] font-mono opacity-70 ml-auto">
          {serverTotalOwned} / {serverTotalCards} cards owned
        </span>
      </div>

      {/* Advanced Filter modal (sibling of the grid — the grid stays mounted) */}
      {showAdvModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in"
          onClick={() => setShowAdvModal(false)}
        >
          <div
            className="w-[900px] max-w-full max-h-[50vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
            style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0"
              style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}
            >
              <p
                className="text-sm font-bold uppercase tracking-wide flex items-center gap-2"
                style={{ color: palette?.text }}
              >
                <SlidersHorizontal className="w-4 h-4" style={{ color: hasActiveAdvancedFilters ? '#FBBF24' : palette?.text }} />
                Advanced Filters
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAllFilters}
                  className="text-[10px] font-mono opacity-60 hover:opacity-100 underline"
                >
                  Clear all
                </button>
                <button
                  onClick={() => setShowAdvModal(false)}
                  className="p-1.5 rounded-lg border transition-colors hover:bg-white/10"
                  style={{ borderColor: `${palette?.border}66`, color: palette?.text }}
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal body: two columns */}
            <div className="flex-1 min-h-0 flex">
              {/* Left column: colors / cmc / collected / copies / rarity / types */}
              <div
                className="w-[56%] shrink-0 border-r overflow-y-auto custom-scrollbar p-5 space-y-5"
                style={{ borderColor: palette?.border }}
              >
                {/* Mana cost / color pips + All */}
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Mana Cost / Color</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['W', 'U', 'B', 'R', 'G', 'C'].map((c) => {
                      const active = selectedColors.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => toggleIn(selectedColors, c, setSelectedColors)}
                          className={`transition-all ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                          title={c === 'C' ? 'Colorless' : `Toggle ${c}`}
                        >
                          <ManaPip symbol={c} size={24} />
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setSelectedColors([])}
                      className={`ml-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                        selectedColors.length === 0 ? '' : 'opacity-50 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: selectedColors.length === 0 ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                        borderColor: selectedColors.length === 0 ? (palette?.accent || '#38BDF8') : palette?.border,
                        color: selectedColors.length === 0 ? (palette?.accent || '#38BDF8') : palette?.text,
                      }}
                      title="Clear color filter (show all colors)"
                    >
                      All
                    </button>
                  </div>
                  <p className="text-[9px] font-mono opacity-40 mt-2">Any selected color identity</p>
                </div>

                {/* Mana Value (CMC) */}
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Mana Value</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CMC_OPTIONS.map((v) => {
                      const active = cmcFilter === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setCmcFilter(active ? null : v)}
                          className={`transition-all ${active ? 'scale-110' : 'opacity-35 hover:opacity-75'}`}
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

                {/* Collected / Not Collected */}
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Collected</p>
                  <div className="flex rounded-xl border overflow-hidden w-fit" style={{ borderColor: palette?.border }}>
                    {(['all', 'owned', 'unowned'] as const).map((o) => {
                      const active = ownedFilter === o;
                      return (
                        <button
                          key={o}
                          onClick={() => setOwnedFilter(o)}
                          className={`px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-wide transition-colors ${
                            active ? '' : 'opacity-50 hover:opacity-80'
                          }`}
                          style={{
                            color: active ? (palette?.accent || '#38BDF8') : palette?.text,
                            backgroundColor: active ? `${palette?.accent || '#38BDF8'}1a` : 'transparent',
                            borderRight: `1px solid ${palette?.border || '#2A2F3D'}`,
                          }}
                        >
                          {o === 'all' ? 'All' : o === 'owned' ? 'Collected' : 'Not Collected'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Copy count filter */}
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Copies Owned</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4].map((n) => {
                      const active = copiesFilter === n;
                      return (
                        <button
                          key={n}
                          onClick={() => setCopiesFilter(active ? null : n)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition-all ${
                            active ? '' : 'opacity-50 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: active ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                            borderColor: active ? (palette?.accent || '#38BDF8') : palette?.border,
                            color: active ? (palette?.accent || '#38BDF8') : palette?.text,
                          }}
                          title={`Exactly ${n} copies owned`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Rarity */}
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Rarity</p>
                  <div className="flex flex-wrap gap-1.5">
                    {RARITY_ORDER.map((r) => {
                      const active = selectedRarities.includes(r.value);
                      const info = RARITY_INFO[r.value] || { color: '#9CA3AF' };
                      return (
                        <button
                          key={r.value}
                          onClick={() => setSelectedRarities(active ? selectedRarities.filter((x) => x !== r.value) : [...selectedRarities, r.value])}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                            active ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: active ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                            borderColor: active ? (palette?.accent || '#38BDF8') : palette?.border,
                            color: active ? (palette?.accent || '#38BDF8') : info.color,
                          }}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Card type */}
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Card Type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CARD_TYPES.map((t) => {
                      const active = selectedTypes.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleIn(selectedTypes, t, setSelectedTypes)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                            active ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: active ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                            borderColor: active ? (palette?.accent || '#38BDF8') : palette?.border,
                            color: active ? (palette?.accent || '#38BDF8') : palette?.text,
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right column: set filter */}
              <div className="flex-1 min-w-0 flex flex-col p-5">
                <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">
                  Set <span className="normal-case opacity-50">({selectedSets.length} selected)</span>
                </p>
                <input
                  type="text"
                  placeholder="Search sets..."
                  value={setNameQuery}
                  onChange={(e) => setSetNameQuery(e.target.value)}
                  className="w-full pl-2.5 pr-2.5 py-1.5 text-xs rounded-lg border bg-black/30 focus:outline-none mb-2"
                  style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
                />
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                  {sortedSets.map((s) => {
                    const active = selectedSets.includes(s.set_code);
                    return (
                      <button
                        key={s.set_code}
                        onClick={() => toggleIn(selectedSets, s.set_code, setSelectedSets)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                          active ? 'opacity-100' : 'opacity-55 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: active ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                          borderColor: active ? (palette?.accent || '#38BDF8') : palette?.border,
                          color: active ? (palette?.accent || '#38BDF8') : palette?.text,
                        }}
                        title={s.released_at ? `Released ${s.released_at}` : s.set_code}
                      >
                        {/* Keyrune set icon (ss ss-<code>), rendered from the bundled font */}
                        <i
                          className={`${keyruneClass(s.set_code || '')} shrink-0`}
                          style={{ fontSize: 16, color: active ? (palette?.accent || '#38BDF8') : palette?.text }}
                          title={s.set_code}
                        />
                        <span className="truncate flex-1 text-left">{s.name || s.set_code}</span>
                        {active && <span className="text-[10px] font-mono shrink-0">✓</span>}
                      </button>
                    );
                  })}
                  {sortedSets.length === 0 && (
                    <p className="text-[10px] font-mono opacity-40">No sets match</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionView;
