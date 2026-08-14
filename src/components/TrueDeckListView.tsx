import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

interface TrueDeckListViewProps {
  data: any; // from get_deck_list: { cards, sideboard, commander_grp_id, updated_at }
  totalMatches: number;
  status?: any; // from get_deck_list_status: { missing_count, logged_count }
  palette: any;
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
  Other: 'ms-multicolor',
};

// Primary card type, last keyword wins (mirrors backend chart_category).
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

// MTGA rarity codes: 1=Land, 2=Common, 3=Uncommon, 4=Rare, 5=Mythic.
const RARITY_INFO: Record<number, { label: string; color: string }> = {
  1: { label: 'Land', color: '#9CA3AF' },
  2: { label: 'Common', color: '#E5E7EB' },
  3: { label: 'Uncommon', color: '#CBD5E1' },
  4: { label: 'Rare', color: '#D4AF37' },
  5: { label: 'Mythic', color: '#F97316' },
};
const rarityLabel = (r: number) => RARITY_INFO[r]?.label || '-';
const rarityColor = (r: number) => RARITY_INFO[r]?.color || '#9CA3AF';

function TrueDeckListView({ data, totalMatches, status, palette }: TrueDeckListViewProps) {
  const [selectedCard, setSelectedCard] = useState<CardEntry | null>(null);

  useEffect(() => {
    if (!selectedCard) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedCard(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCard]);

  const cards: CardEntry[] = data?.cards || [];
  const sideboard: CardEntry[] = data?.sideboard || [];

  // Group main deck by type.
  const groups = new Map<string, CardEntry[]>();
  for (const c of cards) {
    const cat = categorize(c.card_type);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(c);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  }
  const ordered = TYPE_ORDER.filter(t => groups.has(t));

  // Distribute into two independent columns by card count.
  const colA: string[] = [];
  const colB: string[] = [];
  const hA = () => colA.reduce((s, g) => s + groups.get(g)!.length, 0);
  const hB = () => colB.reduce((s, g) => s + groups.get(g)!.length, 0);
  for (const cat of ordered) {
    if (hA() <= hB()) colA.push(cat); else colB.push(cat);
  }

  const renderRow = (card: CardEntry) => {
    const symbols = parseMtgaManaCost(card.mana_cost || '');
    return (
      <div
        key={card.grp_id}
        className="flex items-center gap-2 py-0.5 rounded px-1 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setSelectedCard(card)}
      >
        <span className="w-10 shrink-0 text-[15px] font-mono font-bold tabular-nums" style={{ color: palette?.text }}>
          {card.count}x
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
  };

  const renderGroup = (cat: string) => (
    <div key={cat} className="min-w-0">
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b" style={{ borderColor: `${palette?.border}66` }}>
        <span className={`ms ${TYPE_ICONS[cat] || 'ms-multicolor'} shrink-0`} style={{ fontSize: 20, color: palette?.text }} />
        <span className="text-[15px] font-mono uppercase tracking-wider font-bold truncate" style={{ color: palette?.text }}>
          {cat}
        </span>
        <span className="text-[12px] font-mono opacity-40 shrink-0">({groups.get(cat)!.length})</span>
      </div>
      <div className="space-y-0.5">
        {groups.get(cat)!.map(renderRow)}
      </div>
    </div>
  );

  const totalCards = cards.reduce((s, c) => s + c.count, 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-[14px] font-mono uppercase tracking-wider font-bold" style={{ color: palette?.accent }}>
          True Decklist
        </p>
        <p className="text-[12px] font-mono opacity-50">
          {cards.length} distinct • {totalCards} cards
          {data?.updated_at ? ` • imported ${new Date(data.updated_at).toLocaleDateString()}` : ''}
        </p>
      </div>

      {/* Stale-mismatch hint */}
      {status?.missing_count > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border text-[10px] font-mono leading-relaxed shrink-0"
          style={{ borderColor: `${palette?.accent}44`, backgroundColor: `${palette?.surface}88` }}>
          <span style={{ color: palette?.text }} className="opacity-80">
            {status.missing_count} cards seen in recent matches aren't in your imported
            list — the deck may have changed.
          </span>
        </div>
      )}

      {/* Card columns */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        <div className="grid gap-x-8 gap-y-5 items-start" style={{ gridTemplateColumns: `repeat(2, minmax(0,1fr))` }}>
          <div className="min-w-0 space-y-5">
            {colA.map(renderGroup)}
          </div>
          <div className="min-w-0 space-y-5">
            {colB.map(renderGroup)}
          </div>
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

      {/* Card overlay modal on click */}
      {selectedCard && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in"
          onClick={() => setSelectedCard(null)}
        >
          <div className="flex flex-col items-center max-h-full overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedCard(null)}
              className="self-end mb-2 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider font-bold opacity-70 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5 transition-opacity"
              style={{ color: palette?.text, borderColor: palette?.border }}
              title="Close (Esc)"
            >
              <X className="w-4 h-4" /> Close
            </button>
            <div className="w-[340px] rounded-xl overflow-hidden border shadow-2xl" style={{ borderColor: palette?.border }}>
              <img
                src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(selectedCard.name)}&format=image&version=normal`}
                alt={selectedCard.name}
                className="w-full"
              />
            </div>
            <div className="mt-3 w-[340px] rounded-xl border p-4 space-y-2.5" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold leading-tight" style={{ color: palette?.text }}>{selectedCard.name}</p>
                <span className="shrink-0 flex items-center gap-0.5">
                  {parseMtgaManaCost(selectedCard.mana_cost || '').map((s, i) => <ManaFontPip key={i} symbol={s} size={18} />)}
                </span>
              </div>
              <p className="text-[11px] font-mono uppercase tracking-wide opacity-70" style={{ color: palette?.text }}>
                {selectedCard.card_type || 'Card'}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                <div>
                  <p className="text-[9px] font-mono uppercase opacity-50">Rarity</p>
                  <p className="text-[13px] font-mono font-bold" style={{ color: rarityColor(selectedCard.rarity) }}>
                    {rarityLabel(selectedCard.rarity)}
                  </p>
                </div>
                {selectedCard.set_code && (
                  <div>
                    <p className="text-[9px] font-mono uppercase opacity-50">Set</p>
                    <p className="text-[13px] font-mono font-bold" style={{ color: palette?.text }}>{selectedCard.set_code}</p>
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-mono uppercase opacity-50">In Deck</p>
                  <p className="text-[13px] font-mono font-bold" style={{ color: palette?.text }}>{selectedCard.count}x</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrueDeckListView;
