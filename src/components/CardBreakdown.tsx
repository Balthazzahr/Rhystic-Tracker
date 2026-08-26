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
  onCardClick?: (card: CardItem) => void;
  impactfulGrpIds?: Set<number>;
}

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

export function CardBreakdown({ cards, palette, onCardClick, impactfulGrpIds }: CardBreakdownProps) {
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
      <div className="flex-1 flex flex-col h-full overflow-hidden border border-white/10 bg-neutral-950/80 min-h-0">
        {/* Column Header */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/50">
          <span className="text-xs font-bold font-display uppercase tracking-wider text-white">
            {title} ({totalCount})
          </span>
          <span className="text-[10px] font-mono text-neutral-500 uppercase">
            {isOpponentSide ? 'Revealed in Play' : 'Full Deck List'}
          </span>
        </div>

        {/* Grouped & Sorted Cards List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3.5 custom-scrollbar min-h-0">
          {totalCount === 0 ? (
            <div className="p-8 border border-dashed border-white/10 text-center text-xs text-neutral-500 font-mono">
              No recorded cards for {title.toLowerCase()}
            </div>
          ) : (
            Object.entries(grouped).map(([category, list]) => {
              if (list.length === 0) return null;
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 border-b border-white/10 pb-1 px-0.5">
                    <span>{category}</span>
                    <span className="tabular-nums">{list.reduce((acc, c) => acc + c.count, 0)}</span>
                  </div>

                  <div className="space-y-0.5">
                    {list.map((card, idx) => {
                      const isImpactful = impactfulGrpIds?.has(card.grp_id) || false;
                      return (
                        <div
                          key={idx}
                          onClick={() => onCardClick && onCardClick(card)}
                          className={`flex items-center justify-between px-2.5 py-1.5 border transition-colors cursor-pointer group ${
                            isImpactful
                              ? 'border-amber-500/30 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]'
                              : 'border-white/5 bg-white/[0.015] hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 border border-white/10 bg-black/40 text-neutral-300 shrink-0 tabular-nums">
                              {card.count}×
                            </span>
                            <span className="text-xs font-bold font-display uppercase tracking-wide truncate group-hover:underline text-white leading-tight">
                              {card.name}
                            </span>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {isImpactful && (
                              <span className="ms ms-ability-duels-renowned text-xs text-amber-400" title="Match MVP Card" />
                            )}
                            <RenderManaCost costStr={card.mana_cost} size={14} />
                          </div>
                        </div>
                      );
                    })}
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
    <div className="h-full flex gap-3 overflow-hidden min-h-0">
      {renderCardColumn('Your Deck', playerGrouped, false)}
      {renderCardColumn('Opponent Cards', opponentGrouped, true)}
    </div>
  );
}

export default CardBreakdown;
