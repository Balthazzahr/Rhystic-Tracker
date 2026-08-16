import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table2,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CardImage } from './CardImage';
import { ManaPip } from './ManaPip';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';
import { CustomDropdown } from './CustomDropdown';

interface CollectionViewProps {
  palette: any;
  onShowCard: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
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

function CollectionView({ palette, onShowCard }: CollectionViewProps) {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGrp, setBusyGrp] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'unowned'>(() => {
    const saved = localStorage.getItem('collectionOwnedFilter');
    return saved === 'all' || saved === 'unowned' ? saved : 'owned';
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

  // Fixed card footprint (exact image ratio 63:88). Cards never scale with the
  // window — extra space becomes padding, and new rows/columns appear only when
  // enough room accumulates for another full card. Sized so the current default
  // window (1701x1392, 1433px content) fills with 6 across (large) / 7 across
  // (small) leaving ~5px/3px of horizontal padding.
  const CARD_W_LARGE = 228;
  const CARD_W_SMALL = 194;
  const CARD_RATIO = 88 / 63;
  const cardW = cardSize === 'small' ? CARD_W_SMALL : CARD_W_LARGE;
  const cardH = Math.round(cardW * CARD_RATIO);
  const GRID_GAP = 12;

  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Measure the card-grid area so we can auto-fit columns/rows of fixed cards.
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
  }, [view]);

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
      // Fetch all matching cards in one shot; pagination is client-side so the
      // grid can auto-fit rows/cols on resize without refetching.
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
          page: 1,
          page_size: 100000,
        },
      });
      const parsed: CollectionResponse = res;
      setCards(parsed?.cards || []);
    } catch (e) {
      console.error('Failed to load collection:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ownedFilter, selectedSets, selectedColors, selectedRarities, selectedTypes, cmcFilter, copiesFilter, search, sort, sortDir]);

  // CMC has no backend support yet, so filter client-side on the full result
  // set. `copies` IS backend-filtered, but the summary/pagination below run on
  // the same filtered list so both stay consistent.
  const filteredCards = useMemo(() => {
    if (cmcFilter === null) return cards;
    return cards.filter((c) => (cmcFilter === 8 ? c.cmc >= 8 : c.cmc === cmcFilter));
  }, [cards, cmcFilter]);

  // Client-side pagination derived at render (never feeds the network fetch).
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const displayedCards = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, safePage, pageSize]);

  const ownedCount = useMemo(() => cards.filter((c) => c.owned_count > 0).length, [cards]);
  const ownedCopies = useMemo(() => cards.reduce((s, c) => s + c.owned_count, 0), [cards]);

  useEffect(() => {
    fetchCollection();
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
    ownedFilter !== 'all' || selectedSets.length > 0 || selectedColors.length > 0 ||
    selectedRarities.length > 0 || selectedTypes.length > 0 || cmcFilter !== null ||
    copiesFilter !== null;

  const hasActiveFilters =
    hasActiveAdvancedFilters || search.trim() !== '';

  const clearAllFilters = () => {
    setOwnedFilter('all');
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
    const busy = busyGrp === card.grp_id;
    if (!isOwned) {
      return (
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] font-mono font-bold tabular-nums opacity-40">0 / 4</span>
          <span className="text-[10px] font-mono opacity-40">not owned</span>
        </div>
      );
    }
    return (
      <>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => adjustCount(card, -1)}
            disabled={busy || card.owned_count <= 0}
            title="Reduce owned copies"
            className="p-1 rounded-lg border transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ borderColor: `${palette?.border}66`, color: palette?.text }}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span
            className="text-[13px] font-mono font-bold tabular-nums min-w-[14px] text-center"
            style={{ color: card.owned_count >= 4 ? '#34D399' : palette?.text }}
          >
            {card.owned_count}
          </span>
          <button
            onClick={() => adjustCount(card, 1)}
            disabled={busy || card.owned_count >= 4}
            title="Increase owned copies"
            className="p-1 rounded-lg border transition-colors hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ borderColor: `${palette?.border}66`, color: palette?.text }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono opacity-50">/ 4</span>
        </div>
      </>
    );
  };

  const renderCardTile = (card: CollectionCard, pageKey: number) => {
    const isOwned = card.owned_count > 0;
    const cardName = card.name || `Unknown Card (#${card.grp_id})`;
    const slideClass = pageDirRef.current === 'next' ? 'animate-page-right' : 'animate-page-left';

    return (
      <button
        key={`${pageKey}-${card.grp_id}`}
        onClick={() => onShowCard({ name: cardName, grp_id: card.grp_id }, false)}
        className={`group relative rounded-[6px] overflow-hidden text-left transition-all hover:scale-[1.02] hover:z-10 hover:shadow-xl shrink-0 ${slideClass}`}
        style={{ width: cardW, height: cardH }}
        title={cardName}
      >
        <div className="absolute inset-0" style={{ filter: isOwned ? 'none' : 'saturate(5%)' }}>
          {card.name ? (
            <CardImage
              name={card.name}
              version="normal"
              alt={cardName}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 w-full h-full bg-black" />
          )}
        </div>
        {/* Ownership dots: big dots = owned copies, small dots = remaining,
            shown bottom-center left-to-right. */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex items-end gap-1">
          {[0, 1, 2, 3].map((i) => {
            const owned = i < card.owned_count;
            return (
              <span
                key={i}
                className="rounded-full"
                style={{
                  width: owned ? 9 : 6,
                  height: owned ? 9 : 6,
                  backgroundColor: owned ? '#34D399' : 'rgba(255,255,255,0.45)',
                  boxShadow: '0 0 3px rgba(0,0,0,0.8)',
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

  const activeChips: { key: string; icon: React.ReactNode; label: string; onRemove: () => void }[] = [];
  for (const sc of selectedSets) {
    const s = setOptions.find((x) => x.set_code === sc);
    activeChips.push({
      key: `set-${sc}`,
      icon: <i className={`${keyruneClass(sc)} shrink-0`} style={{ fontSize: 15, color: palette?.text }} />,
      label: s?.name || sc,
      onRemove: () => toggleIn(selectedSets, sc, setSelectedSets),
    });
  }
  for (const t of selectedTypes) {
    activeChips.push({
      key: `type-${t}`,
      icon: <i className={`ms ${typeIconClass[t] || 'ms-multicolor'} shrink-0`} style={{ fontSize: 13, color: palette?.text }} />,
      label: t,
      onRemove: () => toggleIn(selectedTypes, t, setSelectedTypes),
    });
  }
  if (cmcFilter !== null) {
    activeChips.push({
      key: 'cmc',
      icon: <ManaPip symbol={cmcFilter === 8 ? '8' : String(cmcFilter)} size={15} />,
      label: `Mana value ${cmcFilter === 8 ? '8+' : cmcFilter}`,
      onRemove: () => setCmcFilter(null),
    });
  }
  for (const r of selectedRarities) {
    const info = RARITY_INFO[r] || { label: 'Rarity', color: '#9CA3AF' };
    activeChips.push({
      key: `rar-${r}`,
      icon: <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} />,
      label: info.label,
      onRemove: () => setSelectedRarities(selectedRarities.filter((x) => x !== r)),
    });
  }
  if (ownedFilter === 'owned') {
    activeChips.push({
      key: 'owned',
      icon: <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#34D399' }} />,
      label: 'Collected',
      onRemove: () => setOwnedFilter('all'),
    });
  } else if (ownedFilter === 'unowned') {
    activeChips.push({
      key: 'unowned',
      icon: <span className="w-2.5 h-2.5 rounded-full shrink-0 border" style={{ borderColor: palette?.text, backgroundColor: 'transparent' }} />,
      label: 'Not Collected',
      onRemove: () => setOwnedFilter('all'),
    });
  }
  if (copiesFilter !== null) {
    activeChips.push({
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
                backgroundColor: i < copiesFilter ? '#34D399' : `${palette?.text}44`,
              }}
            />
          ))}
        </span>
      ),
      label: `${copiesFilter} copy${copiesFilter === 1 ? '' : 's'}`,
      onRemove: () => setCopiesFilter(null),
    });
  }

  return (
    <div className="flex-1 relative flex flex-col space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Collection
          </h1>
          <p className="text-[11px] font-mono opacity-50 mt-0.5">
            {ownedCount} / {cards.length} cards owned • {ownedCopies} total copies
          </p>
        </div>
        {error && <span className="text-[11px] font-mono text-rose-400">{error}</span>}
      </div>

      {/* Top bar */}
      <div
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
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border bg-black/30 focus:outline-none"
            style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
          />
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

        {/* Advanced Filter */}
        <button
          onClick={() => setShowAdvModal(true)}
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border transition-all hover:bg-white/5 ${
            hasActiveAdvancedFilters ? '' : 'opacity-60 hover:opacity-100'
          }`}
          style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
          title="Advanced filters"
        >
          <SlidersHorizontal
            className="w-3.5 h-3.5"
            style={{ color: hasActiveAdvancedFilters ? '#FBBF24' : palette?.text }}
          />
          {hasActiveAdvancedFilters && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
        </button>

        {/* Sort dropdown + direction toggle */}
        <div className="w-40">
          <CustomDropdown
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
            palette={palette}
          />
        </div>
        <button
          onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1 px-2.5 py-2 text-xs font-bold rounded-xl border transition-all hover:bg-white/5"
          style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
          title="Toggle sort direction"
        >
          {sortDir === 'asc' ? '▲' : '▼'}
        </button>

        <div className="flex-1" />

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

        {/* Card size toggle (cards view only): the icon shows what you'll
            switch TO — zoom-in when currently small, zoom-out when large. */}
        {view === 'cards' && (
          <button
            onClick={() => setCardSize(cardSize === 'small' ? 'large' : 'small')}
            className="flex items-center justify-center px-2.5 py-2 rounded-xl border transition-all hover:bg-white/5"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
            title={cardSize === 'small' ? 'Switch to large cards' : 'Switch to small cards'}
          >
            {cardSize === 'small' ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Active-filters pop-down: shown when advanced filters are applied
          (excludes search + top-bar color pips, which are visible in the bar) */}
      {activeChips.length > 0 && (
        <div
          className="shrink-0 rounded-2xl border px-3 py-2 flex items-center flex-wrap gap-x-3 gap-y-1.5 animate-page-right"
          style={{ backgroundColor: palette?.surface, borderColor: `${palette?.accent || '#38BDF8'}55` }}
        >
          <span className="text-[10px] font-mono uppercase tracking-wide font-bold shrink-0" style={{ color: palette?.accent || '#38BDF8' }}>
            Filtered by
          </span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              onClick={chip.onRemove}
              className="group flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors hover:bg-white/10"
              style={{ borderColor: palette?.border, color: palette?.text, backgroundColor: `${palette?.accent || '#38BDF8'}10` }}
              title="Remove this filter"
            >
              {chip.icon}
              <span>{chip.label}</span>
              <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}

      {/* Content: cards grid or table */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative">
        {view === 'cards' && (
          <div
            ref={gridWrapRef}
            className="h-full min-h-0 flex flex-wrap content-center items-start justify-center gap-3"
            style={{ paddingTop: 4, paddingBottom: 4 }}
          >
            {displayedCards.map((c) => renderCardTile(c, safePage))}
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
                      <th key={col} className="px-3 py-2">
                        {sortable ? (
                          <button
                            onClick={() => sortByColumn(key!)}
                            className="group flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold hover:opacity-100"
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
        {/* Loading / empty overlays on top of the mounted grid */}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <span className="text-xs font-mono opacity-70">Loading collection…</span>
          </div>
        ) : cards.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-mono opacity-40">No cards match the current filters</span>
          </div>
        ) : null}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-4 pt-1">
          <button
            onClick={() => goPage('prev')}
            disabled={safePage <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-[11px] font-mono opacity-60">
            Page {safePage} of {totalPages} • {cards.length} cards
          </span>
          <button
            onClick={() => goPage('next')}
            disabled={safePage >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
