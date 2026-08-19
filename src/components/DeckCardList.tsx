import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

interface DeckCardListProps {
  deckName: string;
  palette: any;
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

// Primary card type, last keyword wins (mirrors backend chart_category).
// Tokens always categorize as "Token" regardless of their subtype.
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

// MTGA rarity codes: 0=unknown/token, 1=Land, 2=Common, 3=Uncommon, 4=Rare, 5=Mythic.
// Colors: common white, uncommon silver, rare gold, mythic deep orange.
const RARITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Land', color: '#9CA3AF' },
  2: { label: 'Common', color: '#E5E7EB' },
  3: { label: 'Uncommon', color: '#CBD5E1' },
  4: { label: 'Rare', color: '#D4AF37' },
  5: { label: 'Mythic', color: '#F97316' },
};

// Rarity labels for the card overlay. Unknown/token rarity shows a dash.
const rarityLabel = (r: number) => RARITY_INFO[r]?.label || 'Common';
const rarityColor = (r: number) => RARITY_INFO[r]?.color || '#E5E7EB';

export function DeckCardList({ deckName, palette, onShowCard }: DeckCardListProps) {
  const [isWide, setIsWide] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1400 : false);

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

  const [data, setData] = useState<DeckCardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!deckName) { setData(null); setLoading(false); return; }
    const fetchCards = async () => {
      setLoading(true);
      try {
        const res = await invoke<DeckCardsResponse>('get_deck_cards', { deckName });
        if (!cancelled) { setData(res); setError(null); }
      } catch (e: any) {
        if (!cancelled) { setError(String(e)); setData(null); }
      }
    };
    fetchCards();
    return () => { cancelled = true; };
  }, [deckName]);

  if (error) {
    return <div className="text-xs font-mono opacity-50">Failed to load deck cards: {error}</div>;
  }
  if (!data) {
    return <div className="text-xs font-mono opacity-40">Loading decklist…</div>;
  }

  // Group by primary type, preserve TYPE_ORDER. Exclude the commander from the
  // card groups when pinned separately (Brawl), to avoid duplication.
  const cmdName = data.is_brawl ? data.commander_name : null;
  const groups = new Map<string, LoggedCard[]>();
  for (const c of data.cards) {
    if (cmdName && c.name === cmdName) continue;
    const cat = categorize(c.card_type);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(c);
  }
  // Sort within group: CMC ascending (lowest to highest), then alphabetical.
  for (const arr of groups.values()) {
    arr.sort((a, b) =>
      a.cmc - b.cmc ||
      a.name.localeCompare(b.name));
  }

  const ordered = TYPE_ORDER.filter(t => groups.has(t));

  // Distribute groups into 2 or 3 balanced columns
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

  const renderGroup = (cat: string) => (
    <div key={cat} className="min-w-0">
      {/* Group header with mana-font type icon */}
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b" style={{ borderColor: `${palette?.border}66` }}>
        <span className={`ms ${TYPE_ICONS[cat] || 'ms-multicolor'} shrink-0`} style={{ fontSize: 20, color: palette?.text }} />
        <span className="text-[15px] font-mono uppercase tracking-wider font-bold truncate" style={{ color: palette?.text }}>
          {cat}
        </span>
        <span className="text-[12px] font-mono opacity-40 shrink-0">({groups.get(cat)!.length})</span>
      </div>

      {/* Card rows */}
      <div className="space-y-0.5">
        {groups.get(cat)!.map((card) => {
          const symbols = parseMtgaManaCost(card.mana_cost || '');
          return (
            <div
              key={card.grp_id}
              className="flex items-center gap-2 py-0.5 rounded px-1 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => onShowCard?.(card, false)}
            >
              <span className="w-10 shrink-0 text-[15px] font-mono font-bold tabular-nums" style={{ color: palette?.text }}>
                {card.max_count}x
              </span>
              <span className="flex-1 text-[15px] font-semibold truncate" style={{ color: palette?.text }}>
                {card.name}
              </span>
              <span className="shrink-0 flex items-center gap-0.5">
                {symbols.length > 0 ? (
                  symbols.map((s, i) => <ManaFontPip key={i} symbol={s} size={17} />)
                ) : (
                  <span className="text-[11px] font-mono opacity-30">—</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Commander section (Brawl decks) — same look as other groups; first item in
  // the top-left column.
  const commanderSymbols = parseMtgaManaCost(data.commander_mana_cost || '');
  const renderCommander = () => {
    if (!data.is_brawl || !data.commander_name) return null;
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-2 pb-1.5 border-b" style={{ borderColor: `${palette?.border}66` }}>
          <span className="ms ms-commander shrink-0" style={{ fontSize: 20, color: palette?.text }} />
          <span className="text-[15px] font-mono uppercase tracking-wider font-bold truncate" style={{ color: palette?.text }}>
            Commander
          </span>
          <span className="text-[12px] font-mono opacity-40 shrink-0">(1)</span>
        </div>
        <div className="space-y-0.5">
          <div
            className="flex items-center gap-2 py-0.5 rounded px-1 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => {
              if (!data.commander_name) return;
              onShowCard?.({
                grp_id: data.commander_grp_id || 0,
                name: data.commander_name!,
              }, true);
            }}
          >
            <span className="w-10 shrink-0 text-[15px] font-mono font-bold tabular-nums" style={{ color: palette?.text }}>
              1x
            </span>
            <span className="flex-1 text-[15px] font-semibold truncate" style={{ color: palette?.text }}>
              {data.commander_name}
            </span>
            <span className="shrink-0 flex items-center gap-0.5">
              {commanderSymbols.length > 0 ? (
                commanderSymbols.map((s, i) => <ManaFontPip key={i} symbol={s} size={17} />)
              ) : (
                <span className="text-[11px] font-mono opacity-30">—</span>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: source + summary */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-[14px] font-mono uppercase tracking-wider font-bold" style={{ color: palette?.accent }}>
          All Logged Cards
        </p>
        <p className="text-[12px] font-mono opacity-50">
          {data.card_count} distinct • {data.total_matches} matches
          {data.filtered_identity_count ? ` • ${data.filtered_identity_count} off-identity hidden` : ''}
        </p>
      </div>

      {/* Categorized card list */}
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
