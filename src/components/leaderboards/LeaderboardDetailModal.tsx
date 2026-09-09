import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { GlassSearchInput } from '../common';
import CardImage from '../CardImage';
import { ManaFontPip } from '../ManaFontPip';
import { parseMtgaManaCost } from '../../utils/manaUtils';
import { LeaderboardCategory } from './types';

interface LeaderboardDetailModalProps {
  category: LeaderboardCategory | null;
  onClose: () => void;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const LeaderboardDetailModal: React.FC<LeaderboardDetailModalProps> = ({
  category,
  onClose,
  onShowCard,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSearchQuery('');
  }, [category]);

  useEffect(() => {
    if (!category) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [category, onClose]);

  if (!category) return null;

  const allItems = category.data || [];
  const top3 = allItems.slice(0, 3);
  const rank3Value = top3[2]?.value ?? (top3[0]?.value ?? 0);
  const cleanQuery = searchQuery.toLowerCase().trim();
  const isSearchActive = cleanQuery.length > 0;

  const matchesBeyondTop3 = isSearchActive
    ? allItems.filter((item) => item.rank > 3 && item.card_name.toLowerCase().includes(cleanQuery))
    : [];

  const top3HasMatch = isSearchActive
    ? top3.some((item) => item.card_name.toLowerCase().includes(cleanQuery))
    : false;

  const hasMatches = !isSearchActive ? true : top3HasMatch || matchesBeyondTop3.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none overflow-y-auto custom-scrollbar"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center justify-center max-w-4xl w-full my-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Top Header (No background frame) */}
        <div className="w-full flex items-center justify-between px-1 pb-3 relative z-20">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`${category.iconClass} text-2xl shrink-0`}
              style={{ color: category.color }}
            />
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <h2 className="text-[26px] font-display font-bold uppercase tracking-[0.14em] text-white drop-shadow-lg truncate">
                {category.title}
              </h2>
              <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 border border-white/20 bg-white/10 text-neutral-200 uppercase tracking-wider">
                {isSearchActive ? 'Search All Records' : 'Top 25'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white border border-white/10 transition-all cursor-pointer shrink-0 ml-4"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Modal Window (Transparent Frosted Glass) */}
        <div className="w-full h-[78vh] max-h-[800px] flex flex-col bg-neutral-950/75 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden relative z-10">
          {/* Subheader banner inside window */}
          <div className="px-5 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center justify-between gap-4 shrink-0">
            <GlassSearchInput
              className="flex-1 max-w-sm"
              placeholder={`Search all cards in ${category.title}...`}
              value={searchQuery}
              onChange={setSearchQuery}
              autoFocus
            />

            <div className="flex items-center gap-3 text-xs font-mono text-neutral-400 shrink-0">
              <span className="hidden sm:inline text-neutral-400">{category.subtitle}</span>
              <span className="text-neutral-300 font-bold tabular-nums">({allItems.length} Total Cards)</span>
            </div>
          </div>

          {/* Single Continuous Table List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
            {allItems.length === 0 ? (
              <div className="py-28 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                No match records logged yet
              </div>
            ) : !isSearchActive ? (
              /* Top 25 Normal View */
              allItems.slice(0, 25).map((item) => {
                const isFirst = item.rank === 1;
                const isSecond = item.rank === 2;
                const isThird = item.rank === 3;

                return (
                  <div
                    key={`modal-${category.id}-${item.grp_id}-${item.rank}`}
                    onClick={() => {
                      onClose();
                      if (onShowCard) onShowCard({ name: item.card_name, grp_id: item.grp_id }, false);
                    }}
                    className={`flex items-center justify-between px-4 h-[60px] transition-colors cursor-pointer group shrink-0 ${
                      isFirst
                        ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]'
                        : isSecond
                        ? 'bg-slate-400/[0.03] hover:bg-slate-400/[0.07]'
                        : isThird
                        ? 'bg-amber-900/[0.04] hover:bg-amber-900/[0.08]'
                        : 'hover:bg-white/[0.04]'
                    }`}
                    title="Click to inspect card details"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                      <div className="w-8 shrink-0 flex items-center justify-center">
                        <span
                          className={`text-xs font-mono font-bold ${
                            isFirst
                              ? 'text-amber-400'
                              : isSecond
                              ? 'text-slate-300'
                              : isThird
                              ? 'text-amber-500'
                              : 'text-neutral-500'
                          }`}
                        >
                          #{item.rank}
                        </span>
                      </div>

                      <div className="w-9 h-9 border border-white/10 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                        <CardImage
                          name={item.card_name}
                          version="art_crop"
                          alt={item.card_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight text-neutral-100 group-hover:text-white">
                          {item.card_name}
                        </p>
                        {item.mana_cost && (
                          <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                            {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => (
                              <ManaFontPip key={i} symbol={s} size={11} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2.5 text-right">
                      <span
                        className={`text-xs font-mono font-bold px-3 py-1 border tabular-nums ${
                          isFirst
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : isSecond
                            ? 'bg-slate-400/10 text-slate-200 border-slate-400/30'
                            : isThird
                            ? 'bg-amber-900/20 text-amber-200 border-amber-800/30'
                            : 'border-white/10 bg-neutral-900 text-neutral-200'
                        }`}
                      >
                        {item.value} <span className="text-[10px] font-normal opacity-75">{item.unit}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              /* Search View: Always display Top 3 Podium Benchmark + Search Matches */
              <div className="divide-y divide-white/5">
                {/* Top 3 Podium Benchmark Header */}
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 px-4 py-2 bg-white/[0.02] flex items-center justify-between border-b border-white/5">
                  <span>Top 3 Podium Benchmark</span>
                  <span className="text-[10px] text-neutral-500 font-normal">Baseline for comparison</span>
                </div>

                {/* Top 3 Podium Cards */}
                {top3.map((item) => {
                  const isFirst = item.rank === 1;
                  const isSecond = item.rank === 2;
                  const isThird = item.rank === 3;
                  const isMatch = item.card_name.toLowerCase().includes(cleanQuery);

                  return (
                    <div
                      key={`modal-top3-${category.id}-${item.grp_id}-${item.rank}`}
                      onClick={() => {
                        onClose();
                        if (onShowCard) onShowCard({ name: item.card_name, grp_id: item.grp_id }, false);
                      }}
                      className={`flex items-center justify-between px-4 h-[60px] transition-colors cursor-pointer group shrink-0 ${
                        isMatch
                          ? 'bg-sky-500/15 hover:bg-sky-500/25'
                          : isFirst
                          ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]'
                          : isSecond
                          ? 'bg-slate-400/[0.03] hover:bg-slate-400/[0.07]'
                          : isThird
                          ? 'bg-amber-900/[0.04] hover:bg-amber-900/[0.08]'
                          : 'hover:bg-white/[0.04]'
                      }`}
                      title="Click to inspect card details"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                        <div className="w-8 shrink-0 flex items-center justify-center">
                          <span
                            className={`text-xs font-mono font-bold ${
                              isFirst
                                ? 'text-amber-400'
                                : isSecond
                                ? 'text-slate-300'
                                : isThird
                                ? 'text-amber-500'
                                : 'text-neutral-500'
                            }`}
                          >
                            #{item.rank}
                          </span>
                        </div>

                        <div className="w-9 h-9 border border-white/10 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                          <CardImage
                            name={item.card_name}
                            version="art_crop"
                            alt={item.card_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight ${
                              isMatch ? 'text-sky-300 font-bold' : 'text-neutral-100 group-hover:text-white'
                            }`}
                          >
                            {item.card_name}
                          </p>
                          {item.mana_cost && (
                            <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                              {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => (
                                <ManaFontPip key={i} symbol={s} size={11} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2.5 text-right">
                        <span
                          className={`text-xs font-mono font-bold px-3 py-1 border tabular-nums ${
                            isFirst
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : isSecond
                              ? 'bg-slate-400/10 text-slate-200 border-slate-400/30'
                            : isThird
                              ? 'bg-amber-900/20 text-amber-200 border-amber-800/30'
                            : 'border-white/10 bg-neutral-900 text-neutral-200'
                          }`}
                        >
                          {item.value} <span className="text-[10px] font-normal opacity-75">{item.unit}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Matches Outside Top 3 */}
                {matchesBeyondTop3.length > 0 && (
                  <>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 px-4 py-2 bg-sky-950/20 flex items-center justify-between border-b border-sky-500/20">
                      <span>Cards Outside of Top 3 ({matchesBeyondTop3.length})</span>
                      <span className="text-[10px] text-sky-300/70 font-normal">Gap to Podium</span>
                    </div>
                    {matchesBeyondTop3.map((item) => {
                      const diff = item.value - rank3Value;
                      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

                      return (
                        <div
                          key={`modal-match-${category.id}-${item.grp_id}-${item.rank}`}
                          onClick={() => {
                            onClose();
                            if (onShowCard) onShowCard({ name: item.card_name, grp_id: item.grp_id }, false);
                          }}
                          className="flex items-center justify-between px-4 h-[60px] bg-sky-500/10 hover:bg-sky-500/20 transition-colors cursor-pointer group shrink-0"
                          title="Click to inspect card details"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                            <div className="w-8 shrink-0 flex items-center justify-center">
                              <span className="text-xs font-mono font-bold text-sky-300">
                                #{item.rank}
                              </span>
                            </div>

                            <div className="w-9 h-9 border border-white/10 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                              <CardImage
                                name={item.card_name}
                                version="art_crop"
                                alt={item.card_name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight text-sky-300">
                                {item.card_name}
                              </p>
                              {item.mana_cost && (
                                <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                  {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => (
                                    <ManaFontPip key={i} symbol={s} size={11} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2.5 text-right">
                            <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 border border-rose-500/30 bg-rose-500/20 text-rose-300">
                              {diffStr} to #3
                            </span>
                            <span className="text-xs font-mono font-bold px-3 py-1 border border-white/10 bg-neutral-900 text-neutral-200 tabular-nums">
                              {item.value} <span className="text-[10px] font-normal opacity-75">{item.unit}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {!hasMatches && (
                  <div className="py-16 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                    No cards found matching "{searchQuery}"
                  </div>
                )}

                {hasMatches && matchesBeyondTop3.length === 0 && top3HasMatch && (
                  <div className="py-8 text-center text-xs font-mono text-neutral-500">
                    No additional matches found outside the Top 3 Podium
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
