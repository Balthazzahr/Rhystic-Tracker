import React from 'react';
import { RenderManaCost, parseMtgaManaCost } from '../utils/manaUtils';
import { cleanCardName } from '../utils/cardImageCache';

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
  searchTerm?: string;
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

const CATEGORY_CONFIG: Record<string, { icon: string; color: string }> = {
  Creatures: { icon: 'ms-creature', color: '#76A382' },
  Planeswalkers: { icon: 'ms-planeswalker', color: '#E5A93C' },
  Instants: { icon: 'ms-instant', color: '#4A7FA3' },
  Sorceries: { icon: 'ms-sorcery', color: '#B8503A' },
  Artifacts: { icon: 'ms-artifact', color: '#94A3B8' },
  Enchantments: { icon: 'ms-enchantment', color: '#9B6BA0' },
  Battles: { icon: 'ms-battle', color: '#D57C69' },
  Lands: { icon: 'ms-land', color: '#A89F91' },
  'Spells / Other': { icon: 'ms-multicolor', color: '#CBD5E1' },
};

export function CardBreakdown({ cards, onCardClick, impactfulGrpIds, searchTerm = '' }: CardBreakdownProps) {
  const playerCards = cards.filter((c) => !c.is_opponent);
  const opponentCards = cards.filter((c) => c.is_opponent);
  const cleanQuery = searchTerm.trim().toLowerCase();

  const groupAndSortCards = (cardList: CardItem[]) => {
    const categories: Record<string, CardItem[]> = {
      Creatures: [],
      Planeswalkers: [],
      Instants: [],
      Sorceries: [],
      Artifacts: [],
      Enchantments: [],
      Battles: [],
      Lands: [],
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
      <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
        {/* Column Title Bar (Clean flat header) */}
        <div className="pb-2.5 mb-2 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-white">
              {title}
            </span>
            <span className="font-mono text-[11px] text-neutral-400 tabular-nums">
              ({totalCount} {totalCount === 1 ? 'card' : 'cards'})
            </span>
          </div>
        </div>

        {/* Flat Unboxed Card List */}
        <div className="flex-1 overflow-y-auto pr-1.5 space-y-4 custom-scrollbar min-h-0">
          {totalCount === 0 ? (
            <div className="p-8 border border-dashed border-white/10 text-center text-xs text-neutral-500 font-mono">
              No recorded cards for {title.toLowerCase()}
            </div>
          ) : (
            Object.entries(grouped).map(([category, list]) => {
              if (list.length === 0) return null;
              const catTotal = list.reduce((acc, c) => acc + c.count, 0);
              const catMeta = CATEGORY_CONFIG[category] || { icon: 'ms-multicolor', color: '#CBD5E1' };

              return (
                <div key={category} className="space-y-1">
                  {/* Category Header with MTG Mana Font Icon */}
                  <div className="flex items-center justify-between text-[11px] font-sans font-semibold uppercase tracking-wider text-neutral-300 border-b border-white/10 pb-1 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`ms ${catMeta.icon} text-xs`} style={{ color: catMeta.color }} />
                      <span>{category}</span>
                    </div>
                    <span className="font-mono text-[10.5px] tabular-nums text-neutral-400">
                      {catTotal}
                    </span>
                  </div>

                  {/* Card Rows with Search Highlighting & De-emphasis */}
                  <div className="divide-y divide-white/[0.04]">
                    {list.map((card, idx) => {
                      const isImpactful = impactfulGrpIds?.has(card.grp_id) || false;
                      const isMatch = Boolean(cleanQuery && card.name && card.name.toLowerCase().includes(cleanQuery));
                      const isDeemphasized = Boolean(cleanQuery && !isMatch);

                      return (
                        <div
                          key={idx}
                          onClick={() => onCardClick && onCardClick(card)}
                          className={`flex items-center justify-between py-1.5 px-2 cursor-pointer group select-none ${
                            isMatch
                              ? 'bg-[#4A7FA3]/20'
                              : isDeemphasized
                              ? 'opacity-30'
                              : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <span className="font-mono text-xs font-bold text-neutral-400 shrink-0 tabular-nums w-5 text-right">
                              {card.count}×
                            </span>
                            <span
                              className={`text-xs font-sans truncate group-hover:underline leading-tight ${
                                isMatch
                                  ? 'text-[#7FAAC9] font-bold'
                                  : isImpactful
                                  ? 'text-[#E2BF6F] font-bold'
                                  : 'font-medium text-white'
                              }`}
                            >
                              {cleanCardName(card.name)}
                            </span>
                            {isImpactful && (
                              <span
                                className="ms ms-ability-duels-renowned text-xs text-[#E2BF6F] shrink-0"
                                title="Match MVP Card"
                              />
                            )}
                          </div>
                          <div className="shrink-0 flex items-center">
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
    <div className="h-full flex gap-6 p-4 overflow-hidden min-h-0 divide-x divide-white/10">
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {renderCardColumn('Cards You Played', playerGrouped, false)}
      </div>
      <div className="flex-1 min-w-0 h-full overflow-hidden pl-6">
        {renderCardColumn('Cards Opponent Played', opponentGrouped, true)}
      </div>
    </div>
  );
}

export default CardBreakdown;
