import React from 'react';
import { Maximize2 } from 'lucide-react';
import CardImage from '../CardImage';
import { ManaFontPip } from '../ManaFontPip';
import { parseMtgaManaCost } from '../../utils/manaUtils';
import { LeaderboardCategory, LeaderboardItem } from './types';

interface LeaderboardPodiumCardProps {
  category: LeaderboardCategory;
  isSearchActive: boolean;
  cleanQuery: string;
  onExpand: (category: LeaderboardCategory) => void;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const LeaderboardPodiumCard: React.FC<LeaderboardPodiumCardProps> = React.memo(({
  category,
  isSearchActive,
  cleanQuery,
  onExpand,
  onShowCard,
}) => {
  const allItems = category.data;
  const top3 = allItems.slice(0, 3);
  const rank3Value = top3[2]?.value ?? (top3[0]?.value ?? 0);

  let displayItems = allItems.slice(0, 10);
  let matchedBeyondTop3: LeaderboardItem[] = [];
  let hasSearchMatch = false;

  if (isSearchActive) {
    matchedBeyondTop3 = allItems.filter(
      (item) => item.rank > 3 && item.card_name.toLowerCase().includes(cleanQuery)
    );
    const top3HasMatch = top3.some((item) => item.card_name.toLowerCase().includes(cleanQuery));
    hasSearchMatch = top3HasMatch || matchedBeyondTop3.length > 0;
  }

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Floating Header Row */}
      <div className="flex items-center h-[34px] px-3 shrink-0 select-none text-xs font-sans font-bold text-white">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={`${category.iconClass} text-sm shrink-0`} style={{ color: category.color }} />
          <span className="font-sans font-bold uppercase tracking-wide text-neutral-100 truncate">
            {category.title}
          </span>
        </div>
        <button
          onClick={() => onExpand(category)}
          className="ml-1 p-1 text-neutral-400 hover:text-white bg-transparent hover:bg-white/[0.08] active:scale-95 transition-all shrink-0 cursor-pointer"
          title="Expand Leaderboard (Top 25)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Table Body Frame */}
      <div className="min-h-[315px] max-h-[350px] flex-1 border border-white/10 bg-black/20 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {allItems.length === 0 ? (
            <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
              No match records logged yet
            </div>
          ) : !isSearchActive ? (
            displayItems.map((item) => {
              const isFirst = item.rank === 1;
              const isSecond = item.rank === 2;
              const isThird = item.rank === 3;

              return (
                <div
                  key={`${category.id}-${item.grp_id}-${item.rank}`}
                  onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                  className="flex items-center justify-between px-2.5 h-[63px] transition-colors cursor-pointer group shrink-0 hover:bg-white/[0.04]"
                  title="Click to view card details"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <div className="w-6 shrink-0 flex items-center justify-center">
                      <span
                        className={`text-xs font-mono font-bold ${
                          isFirst
                            ? 'text-amber-400'
                            : isSecond
                            ? 'text-slate-300'
                            : isThird
                            ? 'text-amber-600'
                            : 'text-neutral-500'
                        }`}
                      >
                        #{item.rank}
                      </span>
                    </div>
                    <div className="w-10 h-10 border border-white/10 overflow-hidden shrink-0 bg-neutral-900">
                      <CardImage
                        name={item.card_name}
                        version="art_crop"
                        alt={item.card_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight text-neutral-100 group-hover:text-white">
                        {item.card_name}
                      </p>
                      {item.mana_cost && (
                        <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                          {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => (
                            <ManaFontPip key={i} symbol={s} size={10} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-right">
                    <span
                      className={`text-xs font-mono font-bold tabular-nums ${
                        isFirst
                          ? 'text-amber-300'
                          : isSecond
                          ? 'text-slate-200'
                          : isThird
                          ? 'text-amber-500'
                          : 'text-neutral-300'
                      }`}
                    >
                      {item.value}
                      <span className="hidden 2xl:inline text-[9.5px] font-normal opacity-70 ml-1">
                        {item.unit}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="space-y-0 flex-1">
              <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500 px-2 pt-1">
                Top 3 Podium Benchmark
              </div>
              {top3.map((item) => {
                const isMatch = item.card_name.toLowerCase().includes(cleanQuery);
                const isFirst = item.rank === 1;
                const isSecond = item.rank === 2;
                const isThird = item.rank === 3;
                return (
                  <div
                    key={`${category.id}-top3-${item.grp_id}-${item.rank}`}
                    onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                    className={`flex items-center justify-between px-2.5 h-[63px] transition-colors cursor-pointer group shrink-0 ${
                      isMatch ? 'bg-sky-500/15 hover:bg-sky-500/25' : 'hover:bg-white/[0.04]'
                    }`}
                    title="Click to view card details"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <div className="w-6 shrink-0 flex items-center justify-center">
                        <span
                          className={`text-xs font-mono font-bold ${
                            isFirst
                              ? 'text-amber-400'
                              : isSecond
                              ? 'text-slate-300'
                              : isThird
                              ? 'text-amber-600'
                              : 'text-neutral-500'
                          }`}
                        >
                          #{item.rank}
                        </span>
                      </div>
                      <div className="w-10 h-10 border border-white/10 overflow-hidden shrink-0 bg-neutral-900">
                        <CardImage
                          name={item.card_name}
                          version="art_crop"
                          alt={item.card_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight ${
                            isMatch ? 'text-sky-300' : 'text-neutral-100 group-hover:text-white'
                          }`}
                        >
                          {item.card_name}
                        </p>
                        {item.mana_cost && (
                          <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                            {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => (
                              <ManaFontPip key={i} symbol={s} size={10} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-right">
                      <span
                        className={`text-xs font-mono font-bold tabular-nums ${
                          isFirst
                            ? 'text-amber-300'
                            : isSecond
                            ? 'text-slate-200'
                            : isThird
                            ? 'text-amber-500'
                            : 'text-neutral-300'
                        }`}
                      >
                        {item.value}
                        <span className="hidden 2xl:inline text-[9.5px] font-normal opacity-70 ml-1">
                          {item.unit}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
              {matchedBeyondTop3.length > 0 && (
                <>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-sky-400 px-2 pt-2">
                    Matches Outside Top 3 ({matchedBeyondTop3.length})
                  </div>
                  {matchedBeyondTop3.map((item) => {
                    const diff = item.value - rank3Value;
                    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                    return (
                      <div
                        key={`${category.id}-match-${item.grp_id}-${item.rank}`}
                        onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                        className="flex items-center justify-between px-2.5 h-[63px] bg-sky-500/10 hover:bg-sky-500/20 transition-colors cursor-pointer group shrink-0"
                        title="Click to view card details"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                          <div className="w-6 shrink-0 flex items-center justify-center">
                            <span className="text-xs font-mono font-bold text-sky-300">
                              #{item.rank}
                            </span>
                          </div>
                          <div className="w-10 h-10 border border-white/10 overflow-hidden shrink-0 bg-neutral-900">
                            <CardImage
                              name={item.card_name}
                              version="art_crop"
                              alt={item.card_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight text-sky-300">
                              {item.card_name}
                            </p>
                            {item.mana_cost && (
                              <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => (
                                  <ManaFontPip key={i} symbol={s} size={10} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 text-right">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border border-rose-500/30 bg-rose-500/20 text-rose-300">
                            {diffStr} to #3
                          </span>
                          <span className="text-xs font-mono font-bold text-neutral-300 tabular-nums">
                            {item.value}
                            <span className="hidden 2xl:inline text-[9.5px] font-normal opacity-70 ml-1">
                              {item.unit}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {!hasSearchMatch && (
                <div className="py-4 text-center text-xs font-mono text-neutral-500">
                  No match in this category
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // 1. If category reference or callback reference changed, re-render
  if (prev.category !== next.category) return false;
  if (prev.onExpand !== next.onExpand) return false;
  if (prev.onShowCard !== next.onShowCard) return false;

  // 2. If search active status or query changed:
  if (prev.isSearchActive !== next.isSearchActive || prev.cleanQuery !== next.cleanQuery) {
    // If neither was active and neither is active, no need to re-render
    if (!prev.isSearchActive && !next.isSearchActive) return true;

    // Check if card match state actually changed for this category
    const prevHasMatch = prev.isSearchActive && prev.category.data.some((item) =>
      item.card_name.toLowerCase().includes(prev.cleanQuery)
    );
    const nextHasMatch = next.isSearchActive && next.category.data.some((item) =>
      item.card_name.toLowerCase().includes(next.cleanQuery)
    );

    // If both match or either matches, re-render to update the display
    if (prevHasMatch || nextHasMatch) return false;

    // If neither matches (e.g. query typed doesn't affect this category at all), bail out!
    return true;
  }

  return true;
});
