import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Minus,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
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

interface CollectionSummary {
  total_cards: number;
  owned_cards: number;
  total_owned_copies: number;
}

interface CollectionResponse {
  cards: CollectionCard[];
  page: number;
  page_size: number;
  total_pages: number;
  summary: CollectionSummary;
}

const RARITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Land', color: '#9CA3AF' },
  2: { label: 'Common', color: '#E5E7EB' },
  3: { label: 'Uncommon', color: '#CBD5E1' },
  4: { label: 'Rare', color: '#D4AF37' },
  5: { label: 'Mythic', color: '#F97316' },
};

const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Planeswalker', 'Battle', 'Other'];

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'cmc', label: 'Mana Value' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'set', label: 'Set' },
  { value: 'released', label: 'Release Date' },
  { value: 'count', label: 'Owned Count' },
];

const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

function CollectionView({ palette, onShowCard }: CollectionViewProps) {
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyGrp, setBusyGrp] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'unowned'>('all');
  const [selectedSets, setSelectedSets] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [sort, setSort] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const [setOptions, setSetOptions] = useState<{ set_code: string; name: string | null; released_at: string | null }[]>([]);
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

  const pageSize = view === 'table' ? 100 : cardSize === 'small' ? 42 : 20;

  useEffect(() => {
    localStorage.setItem('collectionView', view);
    localStorage.setItem('collectionCardSize', cardSize);
  }, [view, cardSize]);

  // Load available set metadata (present in the collection) once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke<any>('get_set_metadata');
        if (!cancelled) {
          setSetOptions((res?.sets || []).filter((s: any) => s.set_code));
        }
      } catch (e) {
        console.error('Failed to load set metadata:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchCollection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<any>('get_collection', {
        filters: {
          owned: ownedFilter,
          sets: selectedSets.length ? selectedSets : null,
          colors: selectedColors.length ? selectedColors : null,
          rarities: selectedRarities.length ? selectedRarities : null,
          types: selectedTypes.length ? selectedTypes : null,
          search: search.trim() === '' ? null : search.trim(),
          sort,
          sort_dir: sortDir,
          page,
          page_size: pageSize,
        },
      });
      const parsed: CollectionResponse = res;
      setCards(parsed?.cards || []);
      setSummary(parsed?.summary || null);
      setTotalPages(Math.max(1, parsed?.total_pages || 1));
    } catch (e) {
      console.error('Failed to load collection:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [ownedFilter, selectedSets, selectedColors, selectedRarities, selectedTypes, search, sort, sortDir, page, pageSize]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  // Reset to page 1 whenever filters/sort change (but not when only paging).
  const filterKey = [ownedFilter, selectedSets.join(','), selectedColors.join(','), selectedRarities.join(','), selectedTypes.join(','), search, sort, sortDir].join('|');
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  const hasActiveFilters =
    ownedFilter !== 'all' || selectedSets.length > 0 || selectedColors.length > 0 ||
    selectedRarities.length > 0 || selectedTypes.length > 0 || search.trim() !== '';

  const clearAllFilters = () => {
    setOwnedFilter('all');
    setSelectedSets([]);
    setSelectedColors([]);
    setSelectedRarities([]);
    setSelectedTypes([]);
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

  const toggleIn = (list: string[], v: string, setter: (n: string[]) => void) => {
    setter(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

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

  const setLabel = (code: string) => {
    const s = setOptions.find((x) => x.set_code === code);
    return s?.name ? `${s.name} (${code})` : code;
  };

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

  const renderCardTile = (card: CollectionCard) => {
    const isOwned = card.owned_count > 0;
    const rarity = RARITY_INFO[card.rarity] || { label: '-', color: '#9CA3AF' };
    const symbols = parseMtgaManaCost(card.mana_cost || '');
    const cardName = card.name || `Unknown Card (#${card.grp_id})`;
    const small = cardSize === 'small';

    return (
      <button
        key={card.grp_id}
        onClick={() => onShowCard({ name: cardName, grp_id: card.grp_id }, false)}
        className="group relative rounded-2xl border overflow-hidden text-left transition-all hover:scale-[1.03] hover:z-10 hover:shadow-xl flex flex-col"
        style={{
          borderColor: isOwned ? rarity.color : `${palette?.border}88`,
          minHeight: small ? 120 : 190,
          backgroundImage: card.name ? `url(${scryfallArtUrl(card.name)})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Scrim so text stays readable over the art */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/20" />
        <div className="relative flex-1 flex flex-col p-2.5" style={{ minHeight: small ? 120 : 190 }}>
          <div className="flex items-start justify-between gap-1">
            <p className="font-bold leading-snug line-clamp-2" style={{ color: '#FFF', fontSize: small ? 11 : 13 }}>
              {cardName}
            </p>
            <span className="shrink-0 flex items-center gap-0.5 drop-shadow">
              {symbols.length > 0 ? (
                symbols.map((s, i) => <ManaFontPip key={i} symbol={s} size={small ? 13 : 16} />)
              ) : (
                <span className="text-[10px] font-mono opacity-50">—</span>
              )}
            </span>
          </div>

          <div className="mt-auto pt-2">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono uppercase font-semibold" style={{ color: rarity.color }}>
                {rarity.label}
              </span>
              <span className="text-[10px] font-mono opacity-60 truncate">
                {card.set_name || card.set_code || '—'}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
              {renderOwnedControl(card)}
            </div>
          </div>
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

  return (
    <div className="flex-1 relative flex flex-col space-y-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Collection
          </h1>
          <p className="text-[11px] font-mono opacity-50 mt-0.5">
            {summary?.owned_cards ?? 0} / {summary?.total_cards ?? 0} cards owned • {summary?.total_owned_copies ?? 0} total copies
          </p>
        </div>
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border bg-black/30 focus:outline-none"
            style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div className="shrink-0 rounded-2xl border p-3 flex items-center flex-wrap gap-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
        {/* Filters button */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 ${
            showFilterPanel || hasActiveFilters ? 'opacity-100' : 'opacity-70'
          }`}
          style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
        >
          <Filter className="w-3.5 h-3.5" style={{ color: palette?.accent }} />
          Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
        </button>

        {/* Ownership segmented control */}
        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: palette?.border }}>
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
                {o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Unowned'}
              </button>
            );
          })}
        </div>

        {/* Color pips */}
        <div className="flex items-center gap-1.5">
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

        {/* Sort dropdown */}
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

        {/* Card size toggle (cards view only) */}
        {view === 'cards' && (
          <button
            onClick={() => setCardSize(cardSize === 'small' ? 'large' : 'small')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all hover:bg-white/5"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
            title={cardSize === 'small' ? 'Switch to large cards' : 'Switch to small cards'}
          >
            {cardSize === 'small' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            {cardSize === 'small' ? 'Large' : 'Small'}
          </button>
        )}

        {error && <span className="text-[11px] font-mono text-rose-400">{error}</span>}
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <div className="shrink-0 rounded-2xl border shadow-xl p-4 space-y-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
          <div className="flex items-center justify-between">
            <Filter className="w-4 h-4" style={{ color: palette?.accent }} />
            <button
              onClick={clearAllFilters}
              className="text-[10px] font-mono opacity-60 hover:opacity-100 underline"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-4 gap-6">
            {/* Set filter: searchable, multi-select chips */}
            <div>
              <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Set</p>
              <input
                type="text"
                placeholder="Search sets..."
                value={setNameQuery}
                onChange={(e) => setSetNameQuery(e.target.value)}
                className="w-full pl-2.5 pr-2.5 py-1.5 text-xs rounded-lg border bg-black/30 focus:outline-none mb-2"
                style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
              />
              <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                {sortedSets.map((s) => {
                  const active = selectedSets.includes(s.set_code);
                  return (
                    <button
                      key={s.set_code}
                      onClick={() => toggleIn(selectedSets, s.set_code, setSelectedSets)}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                        active ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: active ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                        borderColor: active ? (palette?.accent || '#38BDF8') : palette?.border,
                        color: active ? (palette?.accent || '#38BDF8') : palette?.text,
                      }}
                      title={s.released_at ? `Released ${s.released_at}` : s.set_code}
                    >
                      <span className="truncate">{setLabel(s.set_code)}</span>
                      {active && <span className="text-[10px] font-mono shrink-0">✓</span>}
                    </button>
                  );
                })}
                {sortedSets.length === 0 && (
                  <p className="text-[10px] font-mono opacity-40">No sets match</p>
                )}
              </div>
            </div>

            {/* Color filter */}
            <div>
              <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Color Identity</p>
              <div className="flex items-center gap-2">
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
              </div>
              <p className="text-[9px] font-mono opacity-40 mt-2">Any selected color identity</p>
            </div>

            {/* Rarity filter */}
            <div>
              <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Rarity</p>
              <div className="flex flex-wrap gap-1.5">
                {[2, 3, 4, 5, 1].map((r) => {
                  const active = selectedRarities.includes(r);
                  const info = RARITY_INFO[r];
                  return (
                    <button
                      key={r}
                      onClick={() => setSelectedRarities(active ? selectedRarities.filter((x) => x !== r) : [...selectedRarities, r])}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                        active ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: active ? `${palette?.accent || '#38BDF8'}25` : 'transparent',
                        borderColor: active ? (palette?.accent || '#38BDF8') : palette?.border,
                        color: active ? (palette?.accent || '#38BDF8') : info.color,
                      }}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card type filter */}
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
        </div>
      )}

      {/* Content: cards grid or table */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="p-10 text-center text-xs font-mono opacity-40">Loading collection…</div>
        ) : cards.length === 0 ? (
          <div className="p-10 text-center text-xs font-mono opacity-40">
            No cards match the current filters
          </div>
        ) : view === 'table' ? (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: palette?.border }}>
            <table className="w-full text-left border-collapse" style={{ color: palette?.text }}>
              <thead>
                <tr className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: palette?.subtext, backgroundColor: `${palette?.surface}` }}>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">MV</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Set</th>
                  <th className="px-3 py-2">Rarity</th>
                  <th className="px-3 py-2">Owned</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(renderTableRow)}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className="grid gap-3 pb-4"
            style={{ gridTemplateColumns: cardSize === 'small' ? 'repeat(8, 1fr)' : 'repeat(4, 1fr)' }}
          >
            {cards.map(renderCardTile)}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-4 pt-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-[11px] font-mono opacity-60">
            Page {page} of {totalPages} • {summary?.total_cards ?? 0} cards
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default CollectionView;
