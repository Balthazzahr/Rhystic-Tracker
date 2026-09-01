import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

interface DeckCardListProps {
  deckName: string;
  palette?: any;
  searchTerm?: string;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

interface LoggedCard {
  grp_id: number;
  name: string;
  max_count: number;
  total_count: number;
  match_freq: number;
  mana_cost?: string | null;
  card_type?: string | null;
  colors?: string | null;
  color_identity?: string | null;
  cmc: number;
  rarity: number;
  set_code?: string | null;
}

interface DeckCardsResponse {
  deck_name: string;
  total_matches: number;
  card_count: number;
  cards: LoggedCard[];
  filtered_identity_count?: number;
  is_brawl?: boolean;
  commander_name?: string | null;
  commander_grp_id?: number | null;
  commander_mana_cost?: string | null;
  commander_rarity?: number | null;
}

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Token', 'Other'];
const TYPE_ICONS: Record<string, string> = {
  Creature: 'ms-creature',
  Planeswalker: 'ms-planeswalker',
  Battle: 'ms-battle',
  Instant: 'ms-instant',
  Sorcery: 'ms-sorcery',
  Enchantment: 'ms-enchantment',
  Artifact: 'ms-artifact',
  Land: 'ms-land',
  Token: 'ms-token',
  Other: 'ms-multicolor',
};

function categorize(cardType?: string | null): string {
  const lower = (cardType || '').toLowerCase();
  if (lower.includes('token')) return 'Token';
  for (const kw of ['planeswalker', 'battle', 'creature', 'land', 'enchantment', 'artifact', 'instant', 'sorcery']) {
    if (lower.includes(kw)) {
      return kw[0].toUpperCase() + kw.slice(1);
    }
  }
  return 'Other';
}

const RARITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Land', color: '#9CA3AF' },
  2: { label: 'Common', color: '#E5E7EB' },
  3: { label: 'Uncommon', color: '#CBD5E1' },
  4: { label: 'Rare', color: '#D4AF37' },
  5: { label: 'Mythic', color: '#F97316' },
};

export function DeckCardList({ deckName, palette, searchTerm = '', onShowCard }: DeckCardListProps) {
  const [isWide, setIsWide] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1400 : false);
  const [data, setData] = useState<DeckCardsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let rAF = 0;
    const onResize = () => {
      cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        setIsWide(window.innerWidth >= 1400);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rAF);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const numCols = isWide ? 3 : 2;
  const cleanQuery = searchTerm.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    invoke<DeckCardsResponse>('get_deck_cards', { deckName })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [deckName]);

  if (error) {
    return <div className="text-xs font-mono text-rose-400 p-4">Failed to load deck cards: {error}</div>;
  }
  if (!data) {
    return <div className="text-xs font-mono text-neutral-500 p-4">Loading logged cards…</div>;
  }

  const cmdName = data.is_brawl ? data.commander_name : null;
  const groups = new Map<string, LoggedCard[]>();
  for (const c of data.cards) {
    if (cmdName && c.name === cmdName) continue;
    const cat = categorize(c.card_type);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(c);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  }

  const ordered = TYPE_ORDER.filter(t => groups.has(t));

  const colA: string[] = [];
  const colB: string[] = [];
  const colC: string[] = [];
  const heightA = (n: number) => colA.reduce((s, g) => s + (groups.get(g)?.length || 0) + 2, n);
  const heightB = (n: number) => colB.reduce((s, g) => s + (groups.get(g)?.length || 0) + 2, n);
  const heightC = (n: number) => colC.reduce((s, g) => s + (groups.get(g)?.length || 0) + 2, n);

  for (const cat of ordered) {
    if (numCols === 3) {
      const minH = Math.min(heightA(0), heightB(0), heightC(0));
      if (heightA(0) === minH) colA.push(cat);
      else if (heightB(0) === minH) colB.push(cat);
      else colC.push(cat);
    } else {
      if (heightA(0) <= heightB(0)) colA.push(cat);
      else colB.push(cat);
    }
  }

  const renderRow = (card: LoggedCard) => {
    const symbols = parseMtgaManaCost(card.mana_cost || '');
    const isMatch = Boolean(cleanQuery && card.name && card.name.toLowerCase().includes(cleanQuery));
    const isDeemphasized = Boolean(cleanQuery && !isMatch);

    return (
      <div
        key={card.grp_id}
        className={`flex items-center justify-between py-1 px-2 cursor-pointer group select-none ${
          isMatch
            ? 'bg-[#4A7FA3]/20'
            : isDeemphasized
            ? 'opacity-30'
            : 'hover:bg-white/[0.05]'
        }`}
        onClick={() => onShowCard?.(card, false)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <span className="font-mono text-xs font-bold text-neutral-400 shrink-0 tabular-nums w-5 text-right">
            {card.max_count}×
          </span>
          <span
            className={`text-xs font-sans truncate group-hover:underline leading-tight ${
              isMatch ? 'text-[#7FAAC9] font-bold' : 'font-medium text-white'
            }`}
          >
            {card.name}
          </span>
        </div>
        <div className="shrink-0 flex items-center gap-0.5">
          {symbols.length > 0 ? (
            symbols.map((s, i) => <ManaFontPip key={i} symbol={s} size={13} />)
          ) : (
            <span className="text-[10px] font-mono text-neutral-600">—</span>
          )}
        </div>
      </div>
    );
  };

  const renderGroup = (cat: string) => (
    <div key={cat} className="min-w-0">
      <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-white/10">
        <span className={`ms ${TYPE_ICONS[cat] || 'ms-multicolor'} shrink-0 text-sm text-neutral-400`} />
        <span className="text-xs font-sans uppercase tracking-wider font-bold text-white truncate">
          {cat}
        </span>
        <span className="text-[10.5px] font-mono text-neutral-500 shrink-0">({groups.get(cat)!.length})</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {groups.get(cat)!.map(renderRow)}
      </div>
    </div>
  );

  const commanderSymbols = parseMtgaManaCost(data.commander_mana_cost || '');
  const renderCommander = () => {
    if (!data.is_brawl || !data.commander_name) return null;
    const isCmdMatch = Boolean(cleanQuery && data.commander_name && data.commander_name.toLowerCase().includes(cleanQuery));
    const isCmdDeemphasized = Boolean(cleanQuery && !isCmdMatch);

    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-white/10">
          <span className="ms ms-commander shrink-0 text-sm text-amber-400" />
          <span className="text-xs font-sans uppercase tracking-wider font-bold text-amber-300 truncate">
            Commander
          </span>
          <span className="text-[10.5px] font-mono text-amber-400/60 shrink-0">(1)</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          <div
            className={`flex items-center justify-between py-1 px-2 cursor-pointer group select-none ${
              isCmdMatch
                ? 'bg-[#4A7FA3]/20'
                : isCmdDeemphasized
                ? 'opacity-30'
                : 'hover:bg-white/[0.05]'
            }`}
            onClick={() => {
              if (!data.commander_name) return;
              onShowCard?.({
                grp_id: data.commander_grp_id || 0,
                name: data.commander_name!,
              }, true);
            }}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <span className="font-mono text-xs font-bold text-neutral-400 shrink-0 tabular-nums w-5 text-right">
                1×
              </span>
              <span
                className={`text-xs font-sans truncate group-hover:underline leading-tight ${
                  isCmdMatch ? 'text-[#7FAAC9] font-bold' : 'font-medium text-amber-200'
                }`}
              >
                {data.commander_name}
              </span>
            </div>
            <div className="shrink-0 flex items-center gap-0.5">
              {commanderSymbols.length > 0 ? (
                commanderSymbols.map((s, i) => <ManaFontPip key={i} symbol={s} size={13} />)
              ) : (
                <span className="text-[10px] font-mono text-neutral-600">—</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-[11px] font-mono uppercase tracking-wider font-bold text-neutral-400">
          All Logged Cards
        </p>
        <p className="text-[11px] font-mono text-neutral-500">
          {data.card_count} distinct • {data.total_matches} matches
          {data.filtered_identity_count ? ` • ${data.filtered_identity_count} off-identity hidden` : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        <div className="grid gap-x-6 gap-y-5 items-start" style={{ gridTemplateColumns: `repeat(${numCols}, minmax(0, 1fr))` }}>
          <div className="min-w-0 space-y-5">
            {renderCommander()}
            {colA.map(renderGroup)}
          </div>
          <div className="min-w-0 space-y-5">
            {colB.map(renderGroup)}
          </div>
          {numCols === 3 && (
            <div className="min-w-0 space-y-5">
              {colC.map(renderGroup)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeckCardList;
