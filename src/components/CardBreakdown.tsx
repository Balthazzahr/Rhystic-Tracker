import React from 'react';
import { RenderManaCost, parseMtgaManaCost } from '../utils/manaUtils';

export interface CardItem {
  grp_id: number;
  is_opponent: boolean;
  count: number;
  name: string;
  mana_cost?: string;
  colors?: string;
  set_code?: string;
  rarity?: number;
  card_type?: string;
}

interface CardBreakdownProps {
  cards: CardItem[];
  palette: any;
  onHoverCard?: (card: CardItem | null) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
}

// Calculate CMC from parsed MTGA mana symbols
function getCardCmc(costStr?: string): number {
  if (!costStr) return 0;
  const symbols = parseMtgaManaCost(costStr);
  let cmc = 0;
  for (const sym of symbols) {
    if (/^\d+$/.test(sym)) {
      const val = parseInt(sym, 10);
      if (!isNaN(val)) cmc += val;
    } else {
      cmc += 1;
    }
  }
  return cmc;
}

// Categorize cards by MTG Card Type
function getCardCategory(name?: string, typeStr?: string): string {
  const safeName = name || '';
  const safeType = typeStr || '';
  const t = (safeType || safeName).toLowerCase();
  if (t.includes('creature')) return 'Creatures';
  if (t.includes('planeswalker')) return 'Planeswalkers';
  if (t.includes('instant')) return 'Instants';
  if (t.includes('sorceries') || t.includes('sorcery')) return 'Sorceries';
  if (t.includes('artifact')) return 'Artifacts';
  if (t.includes('enchantment')) return 'Enchantments';
  if (t.includes('battle')) return 'Battles';
  if (t.includes('land')) return 'Lands';
  return 'Spells / Other';
}

export function CardBreakdown({ cards, palette, onHoverCard, onMouseMove }: CardBreakdownProps) {
  const playerCards = cards.filter(c => !c.is_opponent);
  const opponentCards = cards.filter(c => c.is_opponent);

  const groupAndSortCards = (cardList: CardItem[]) => {
    const categories: Record<string, CardItem[]> = {
      'Creatures': [],
      'Planeswalkers': [],
      'Instants': [],
      'Sorceries': [],
      'Artifacts': [],
      'Enchantments': [],
      'Battles': [],
      'Lands': [],
      'Spells / Other': [],
    };

    for (const card of cardList) {
      const cat = getCardCategory(card.name, card.card_type);
      categories[cat].push(card);
    }

    // Sort each group ascending by CMC
    for (const cat in categories) {
      categories[cat].sort((a, b) => getCardCmc(a.mana_cost) - getCardCmc(b.mana_cost));
    }

    return categories;
  };

  const playerGrouped = groupAndSortCards(playerCards);
  const opponentGrouped = groupAndSortCards(opponentCards);

  const renderCardColumn = (title: string, grouped: Record<string, CardItem[]>, isOpponentSide: boolean) => {
    const totalCount = Object.values(grouped).flat().reduce((acc, c) => acc + c.count, 0);

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden rounded-2xl border bg-black/30" style={{ borderColor: palette?.border }}>
        {/* Column Header */}
        <div className="p-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: palette?.border }}>
          <span className="text-xs font-extrabold uppercase font-outfit tracking-wider" style={{ color: isOpponentSide ? palette?.text : (palette?.accent || '#38BDF8') }}>
            {title} ({totalCount})
          </span>
          <span className="text-[10px] font-mono opacity-50">
            {isOpponentSide ? 'Revealed in Play' : 'Full Deck List'}
          </span>
        </div>

        {/* Grouped & Sorted Cards List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
          {totalCount === 0 ? (
            <div className="p-6 border border-dashed rounded-xl text-center text-xs opacity-40 font-mono" style={{ borderColor: palette?.border }}>
              No recorded cards for {title.toLowerCase()}
            </div>
          ) : (
            Object.entries(grouped).map(([category, list]) => {
              if (list.length === 0) return null;
              return (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider opacity-60 border-b pb-1" style={{ borderColor: `${palette?.border}66` }}>
                    <span>{category}</span>
                    <span>{list.reduce((acc, c) => acc + c.count, 0)}</span>
                  </div>

                  <div className="space-y-1">
                    {list.map((card, idx) => (
                      <div
                        key={idx}
                        onMouseEnter={() => onHoverCard && onHoverCard(card)}
                        onMouseLeave={() => onHoverCard && onHoverCard(null)}
                        onMouseMove={onMouseMove}
                        className="flex items-center justify-between p-2 rounded-lg border transition-all hover:bg-white/10 cursor-pointer group"
                        style={{ backgroundColor: `${palette?.surface}99`, borderColor: `${palette?.border}66` }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded bg-black/50 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border" style={{ borderColor: palette?.border, color: palette?.accent }}>
                            {card.count}×
                          </span>
                          <span className="text-xs font-semibold truncate group-hover:underline" style={{ color: palette?.text }}>
                            {card.name}
                          </span>
                        </div>
                        <div className="shrink-0 ml-2">
                          <RenderManaCost costStr={card.mana_cost} size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-4 h-full">
      {renderCardColumn('Your Cards', playerGrouped, false)}
      {renderCardColumn('Opponent Cards', opponentGrouped, true)}
    </div>
  );
}
