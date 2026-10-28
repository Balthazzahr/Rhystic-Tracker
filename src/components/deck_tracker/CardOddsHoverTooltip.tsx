import React from 'react';
import CardImage from '../CardImage';
import { RenderManaCost } from '../../utils/manaUtils';

export interface TrackerCardItem {
  grp_id: number;
  name: string;
  mana_cost?: string | null;
  cmc: number;
  rarity: number;
  card_type?: string | null;
  is_land: boolean;
  initial_count: number;
  remaining_count: number;
  in_hand?: number;
  on_battlefield?: number;
  in_graveyard?: number;
  in_exile?: number;
  odds_next: number;
  odds_in_2: number;
  odds_in_3: number;
}

interface CardOddsHoverTooltipProps {
  card: TrackerCardItem;
  libraryTotal: number;
  coords: { x: number; y: number };
}

export const CardOddsHoverTooltip: React.FC<CardOddsHoverTooltipProps> = ({
  card,
  libraryTotal,
  coords,
}) => {
  // If panel is on the left, tooltip should appear to its right (coords.x + 12)
  const isNearRight = coords.x > window.innerWidth - 300;
  const left = isNearRight ? Math.max(12, coords.x - 290) : coords.x + 12;
  const top = Math.min(Math.max(12, coords.y - 20), window.innerHeight - 440);

  return (
    <div
      style={{ left: `${left}px`, top: `${top}px` }}
      className="fixed z-50 pointer-events-none w-[270px] bg-neutral-950 border border-white/20 shadow-2xl p-2.5 rounded-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2"
    >
      {/* High-res / Scryfall Card Image Preview */}
      <div className="w-full flex justify-center bg-black/40 p-1 border border-white/10">
        <CardImage
          name={card.name}
          version="normal"
          className="w-[240px] h-auto object-contain shadow-lg"
        />
      </div>

      {/* Card Info Header */}
      <div className="flex flex-col gap-0.5 border-t border-white/10 pt-2">
        <div className="flex items-center justify-between gap-1.5">
          <span className="font-bold text-xs text-white truncate">{card.name}</span>
          {card.mana_cost && (
            <div className="flex items-center gap-0.5 shrink-0 scale-90 origin-right">
              <RenderManaCost costStr={card.mana_cost} size={14} />
            </div>
          )}
        </div>
        {card.card_type && (
          <span className="text-[10px] text-neutral-400 font-sans uppercase tracking-wider">
            {card.card_type}
          </span>
        )}
      </div>

      {/* Draw Probabilities Breakdown */}
      <div className="bg-neutral-900/90 border border-white/10 p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] pb-1 border-b border-white/10">
          <span className="text-neutral-400 font-sans uppercase tracking-wider text-[10px]">Copies In Deck</span>
          <span className="font-mono font-bold text-white">
            <span className={card.remaining_count > 0 ? 'text-emerald-400' : 'text-neutral-500'}>
              {card.remaining_count}
            </span>
            <span className="text-neutral-500"> / {card.initial_count}</span>
            <span className="text-[10px] text-neutral-400 ml-1.5">({libraryTotal} cards left)</span>
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 pt-0.5 text-center">
          <div className="bg-black/40 border border-white/5 py-1 px-0.5">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-sans">Next Draw</div>
            <div className={`font-mono text-xs font-extrabold ${card.remaining_count > 0 ? 'text-amber-300' : 'text-neutral-600'}`}>
              {Math.round(card.odds_next)}%
            </div>
          </div>
          <div className="bg-black/40 border border-white/5 py-1 px-0.5">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-sans">Within 2</div>
            <div className={`font-mono text-xs font-extrabold ${card.remaining_count > 0 ? 'text-amber-300' : 'text-neutral-600'}`}>
              {Math.round(card.odds_in_2)}%
            </div>
          </div>
          <div className="bg-black/40 border border-white/5 py-1 px-0.5">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-sans">Within 3</div>
            <div className={`font-mono text-xs font-extrabold ${card.remaining_count > 0 ? 'text-amber-300' : 'text-neutral-600'}`}>
              {Math.round(card.odds_in_3)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
