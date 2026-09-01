import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

interface TrueDeckListViewProps {
  data: any; // from get_deck_list: { cards, sideboard, commander_grp_id, updated_at }
  totalMatches: number;
  status?: any; // from get_deck_list_status: { missing_count, logged_count }
  palette?: any;
  searchTerm?: string;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

interface CardEntry {
  grp_id: number;
  count: number;
  name: string;
  mana_cost?: string | null;
  card_type?: string | null;
  cmc: number;
  rarity: number;
  set_code?: string | null;
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
  Other: 'ms-other',
};

// MTGA rarity codes: 1=Land, 2=Common, 3=Uncommon, 4=Rare, 5=Mythic.
const RARITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Land', color: '#9CA3AF' },
  2: { label: 'Common', color: '#E5E7EB' },
  3: { label: 'Uncommon', color: '#CBD5E1' },
  4: { label: 'Rare', color: '#D4AF37' },
  5: { label: 'Mythic', color: '#F97316' },
};

function categorize(cardType?: string | null): string {
  if (!cardType) return 'Other';
  const lower = cardType.toLowerCase();
  for (const kw of ['planeswalker', 'battle', 'creature', 'land', 'enchantment', 'artifact', 'instant', 'sorcery']) {
    if (lower.includes(kw)) {
      return kw[0].toUpperCase() + kw.slice(1);
    }
  }
  return 'Other';
}

const rarityLabel = (r: number) => RARITY_INFO[r]?.label || 'Common';
const rarityColor = (r: number) => RARITY_INFO[r]?.color || '#9CA3AF';

function TrueDeckListView({ data, totalMatches, status, palette, searchTerm = '', onShowCard }: TrueDeckListViewProps) {
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
  const cleanQuery = searchTerm.trim().toLowerCase();

  const cards: CardEntry[] = data?.cards || [];
  const sideboard: CardEntry[] = data?.sideboard || [];

  // Commander (Brawl imports list it first). Split it out so it renders as its
  // own section at the top; the commander is also part of the deck.
  const commanderCard = data?.commander_grp_id
    ? cards.find(c => c.grp_id === data.commander_grp_id)
    : undefined;
  const deckCards = commanderCard ? cards.filter(c => c.grp_id !== commanderCard.grp_id) : cards;

  // Group main deck by type.
  const groups = new Map<string, CardEntry[]>();
  for (const c of deckCards) {
    const cat = categorize(c.card_type);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(c);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  }
  const ordered = TYPE_ORDER.filter(t => groups.has(t));

  // Distribute into 2 or 3 balanced columns by estimated item height
  const colA: string[] = [];
  const colB: string[] = [];
  const colC: string[] = [];

  const hA = () => colA.reduce((s, g) => s + (groups.get(g)?.length || 0) + 2, 0);
  const hB = () => colB.reduce((s, g) => s + (groups.get(g)?.length || 0) + 2, 0);
  const hC = () => colC.reduce((s, g) => s + (groups.get(g)?.length || 0) + 2, 0);

  for (const cat of ordered) {
    if (numCols === 3) {
      const minH = Math.min(hA(), hB(), hC());
      if (hA() === minH) colA.push(cat);
      else if (hB() === minH) colB.push(cat);
      else colC.push(cat);
    } else {
      if (hA() <= hB()) colA.push(cat);
      else colB.push(cat);
    }
  }

  const renderRow = (card: CardEntry) => {
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
            {card.count}×
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
        <span className={`ms ${TYPE_ICONS[cat] || 'ms-other'} shrink-0 text-sm text-neutral-400`} />
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

  const totalCards = cards.reduce((s, c) => s + c.count, 0);

  const renderCommander = () => {
    if (!commanderCard) return null;
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
          {renderRow(commanderCard)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Summary */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-[12px] font-mono opacity-50">
          {deckCards.length} distinct • {totalCards} cards
          {data?.updated_at ? ` • imported ${new Date(data.updated_at).toLocaleDateString()}` : ''}
        </p>
      </div>

      {/* Card columns */}
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

        {/* Sideboard */}
        {sideboard.length > 0 && (
          <div className="mt-5 min-w-0">
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b" style={{ borderColor: `${palette?.border}66` }}>
              <span className="ms ms-shrink-0" style={{ fontSize: 20, color: palette?.text }}>⌐</span>
              <span className="text-[15px] font-mono uppercase tracking-wider font-bold truncate" style={{ color: palette?.text }}>
                Sideboard
              </span>
              <span className="text-[12px] font-mono opacity-40 shrink-0">({sideboard.length})</span>
            </div>
            <div className="space-y-0.5">
              {sideboard.map(renderRow)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TrueDeckListView;
