import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Search, X, Maximize2 } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';
import CardImage from './CardImage';

function isTokenCard(card: any): boolean {
  if (!card) return false;
  const name = (card.card_name || card.name || '').toLowerCase();
  const type = (card.card_type || '').toLowerCase();
  const rarity = (card.rarity || '').toLowerCase();
  if (type.includes('token') || rarity === 'token' || name.includes('token')) return true;
  if (type.includes('creature') && (!card.mana_cost || card.mana_cost.trim() === '')) return true;
  return false;
}

interface LeaderboardsViewProps {
  palette: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const LeaderboardsView: React.FC<LeaderboardsViewProps> = ({ palette, onShowCard }) => {
  const [loading, setLoading] = useState(true);
  const [leaderboards, setLeaderboards] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<any>(null);
  const [expandedSearchQuery, setExpandedSearchQuery] = useState('');

  useEffect(() => {
    loadLeaderboards();
  }, []);

  useEffect(() => {
    if (!expandedCategory) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedCategory(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedCategory]);

  const loadLeaderboards = async () => {
    setLoading(true);
    try {
      const res: any = await invoke('get_global_leaderboards');
      setLeaderboards(res);
    } catch (err) {
      console.error('Failed to load leaderboards:', err);
    } finally {
      setLoading(false);
    }
  };

  const sections = useMemo(() => [
    {
      domainId: 'combat',
      domainTitle: 'Combat Damage',
      domainSubtitle: 'Attacking power & battle strikes across combat phases',
      domainIconClass: 'ms ms-ability-menace',
      domainColor: '#D97706',
      categories: [
        {
          id: 'combat_single_hit',
          title: 'Highest Single-Hit Strike',
          subtitle: 'Haymakers — Most combat damage in a single swing',
          iconClass: 'ms ms-ability-trample',
          color: '#D97706',
          data: ((leaderboards?.combat_single_hit || []) as any[]).filter((c) => !isTokenCard(c)),
        },
        {
          id: 'combat_match_damage',
          title: 'Match Combat Record',
          subtitle: 'Juggernauts — Most combat damage in a single game',
          iconClass: 'ms ms-ability-double-strike',
          color: '#D97706',
          data: ((leaderboards?.combat_match_damage || []) as any[]).filter((c) => !isTokenCard(c)),
        },
        {
          id: 'combat_lifetime_damage',
          title: 'Lifetime Combat Dominance',
          subtitle: 'Pure Muscle — Total cumulative combat damage',
          iconClass: 'ms ms-ability-ferocious',
          color: '#D97706',
          data: ((leaderboards?.combat_lifetime_damage || []) as any[]).filter((c) => !isTokenCard(c)),
        },
      ],
    },
    {
      domainId: 'spells',
      domainTitle: 'Non-Combat (Spells & Abilities) Damage',
      domainSubtitle: 'Direct burns, triggered abilities, and multi-target board wipes',
      domainIconClass: 'ms ms-instant',
      domainColor: '#8B70CD',
      categories: [
        {
          id: 'spell_single_hit',
          title: 'Highest Single Cast / Hit',
          subtitle: 'Annihilators — Most damage in 1 cast (AoE summed)',
          iconClass: 'ms ms-ability-annihilator',
          color: '#8B70CD',
          data: ((leaderboards?.spell_single_hit || []) as any[]).filter((c) => !isTokenCard(c)),
        },
        {
          id: 'spell_match_damage',
          title: 'Match Spell Record',
          subtitle: 'Arcane Nukes — Most spell damage in a single game',
          iconClass: 'ms ms-instant',
          color: '#8B70CD',
          data: ((leaderboards?.spell_match_damage || []) as any[]).filter((c) => !isTokenCard(c)),
        },
        {
          id: 'spell_lifetime_damage',
          title: 'Lifetime Spell Dominance',
          subtitle: 'Spell Slingers — Total cumulative non-combat damage',
          iconClass: 'ms ms-planeswalker',
          color: '#8B70CD',
          data: ((leaderboards?.spell_lifetime_damage || []) as any[]).filter((c) => !isTokenCard(c)),
        },
      ],
    },
    {
      domainId: 'honors',
      domainTitle: 'Honors, Engine & Utility Dominance',
      domainSubtitle: 'Card advantage, cast frequencies, and match awards',
      domainIconClass: 'ms ms-ability-duels-renowned',
      domainColor: '#10B981',
      categories: [
        {
          id: 'most_decorated',
          title: 'Most Decorated Cards',
          subtitle: 'Honors — Most lifetime achievements won',
          iconClass: 'ms ms-ability-duels-renowned',
          color: '#10B981',
          data: ((leaderboards?.most_decorated || []) as any[]).filter((c) => !isTokenCard(c)),
        },
        {
          id: 'card_draw_engines',
          title: 'Card Draw Engines',
          subtitle: 'Gas In The Tank — Most total cards drawn',
          iconClass: 'ms ms-ability-cycling',
          color: '#10B981',
          data: ((leaderboards?.card_draw_engines || []) as any[]).filter((c) => !isTokenCard(c)),
        },
        {
          id: 'battlefield_stalwarts',
          title: 'Battlefield Stalwarts',
          subtitle: 'Trusty Steeds — Most times cast or played',
          iconClass: 'ms ms-ability-convoke',
          color: '#10B981',
          data: ((leaderboards?.battlefield_stalwarts || []) as any[]).filter((c) => !isTokenCard(c)),
        },
      ],
    },
  ], [leaderboards]);

  const isSearchActive = searchQuery.trim().length > 0;
  const cleanQuery = searchQuery.toLowerCase().trim();

  const expAllItems = expandedCategory?.data || [];
  const expTop3 = expAllItems.slice(0, 3);
  const expRank3Value = expTop3[2]?.value ?? (expTop3[0]?.value ?? 0);
  const expCleanQuery = expandedSearchQuery.toLowerCase().trim();
  const isExpSearchActive = expCleanQuery.length > 0;

  const expMatchesBeyondTop3 = isExpSearchActive
    ? expAllItems.filter((item: any) => item.rank > 3 && item.card_name.toLowerCase().includes(expCleanQuery))
    : [];

  const expTop3HasMatch = isExpSearchActive
    ? expTop3.some((item: any) => item.card_name.toLowerCase().includes(expCleanQuery))
    : false;

  const expHasMatches = !isExpSearchActive
    ? true
    : expTop3HasMatch || expMatchesBeyondTop3.length > 0;

  const accentColor = palette?.accent || '#A855F7';

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-kicker text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            LEADERBOARDS
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            (Top performers & all-time records across 9 combat & arcane domains)
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER / SEARCH TOOLBAR */}
      <div className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap">
        <div className="relative w-64 shrink-0 h-8 flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search for card..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
          />
          {isSearchActive && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. MAIN SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 min-h-0">
        {loading ? (
          <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
            Calculating Hall of Fame records...
          </div>
        ) : (
          sections.map((sec) => {
            return (
              <div key={sec.domainId} className="space-y-0">
                {/* 3 Columns Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sec.categories.map((cat) => {
                    const allItems = cat.data;
                    const top3 = allItems.slice(0, 3);
                    const rank3Value = top3[2]?.value ?? (top3[0]?.value ?? 0);

                    let displayItems = allItems.slice(0, 10);
                    let matchedBeyondTop3: any[] = [];
                    let hasSearchMatch = false;

                    if (isSearchActive) {
                      matchedBeyondTop3 = allItems.filter(
                        (item) => item.rank > 3 && item.card_name.toLowerCase().includes(cleanQuery)
                      );
                      const top3HasMatch = top3.some((item) => item.card_name.toLowerCase().includes(cleanQuery));
                      hasSearchMatch = top3HasMatch || matchedBeyondTop3.length > 0;
                    }

                    return (
                      <div
                        key={cat.id}
                        className="flex flex-col overflow-hidden"
                      >
                        {/* Floating Header Row */}
                        <div className="flex items-center h-[34px] px-3 shrink-0 select-none text-xs font-sans font-bold text-white">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className={`${cat.iconClass} text-sm shrink-0`} style={{ color: cat.color }} />
                            <span className="font-sans font-bold uppercase tracking-wide text-neutral-100 truncate">
                              {cat.title}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setExpandedCategory(cat);
                              setExpandedSearchQuery('');
                            }}
                            className="ml-1 p-1 text-neutral-400 hover:text-white bg-transparent hover:bg-white/[0.08] active:scale-95 transition-all shrink-0 cursor-pointer"
                            title="Expand Leaderboard (Top 25)"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Table Body */}
                        <div className="h-[343px] border border-white/10 bg-black/20 flex flex-col overflow-hidden">
                          <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {allItems.length === 0 ? (
                              <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                                No match records logged yet
                              </div>
                            ) : !isSearchActive ? (
                              displayItems.map((item: any) => {
                                const isFirst = item.rank === 1;
                                const isSecond = item.rank === 2;
                                const isThird = item.rank === 3;

                                return (
                                  <div
                                    key={`${cat.id}-${item.grp_id}-${item.rank}`}
                                    onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                    className="flex items-center justify-between px-2.5 h-[63px] transition-colors cursor-pointer group shrink-0 hover:bg-white/[0.04]"
                                    title="Click to view card details"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                      <div className="w-6 shrink-0 flex items-center justify-center">
                                        <span className={`text-xs font-mono font-bold ${
                                          isFirst
                                            ? 'text-amber-400'
                                            : isSecond
                                            ? 'text-slate-300'
                                            : isThird
                                            ? 'text-amber-600'
                                            : 'text-neutral-500'
                                        }`}>
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
                                            {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={10} />)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2 text-right">
                                      <span className={`text-xs font-mono font-bold tabular-nums ${
                                        isFirst
                                          ? 'text-amber-300'
                                          : isSecond
                                          ? 'text-slate-200'
                                          : isThird
                                          ? 'text-amber-500'
                                          : 'text-neutral-300'
                                      }`}>
                                        {item.value} <span className="text-[9.5px] font-normal opacity-70">{item.unit}</span>
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
                                {top3.map((item: any) => {
                                  const isMatch = item.card_name.toLowerCase().includes(cleanQuery);
                                  const isFirst = item.rank === 1;
                                  const isSecond = item.rank === 2;
                                  const isThird = item.rank === 3;
                                  return (
                                    <div
                                      key={`${cat.id}-top3-${item.grp_id}-${item.rank}`}
                                      onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                      className={`flex items-center justify-between px-2.5 h-[63px] transition-colors cursor-pointer group shrink-0 ${
                                        isMatch
                                          ? 'bg-sky-500/15 hover:bg-sky-500/25'
                                          : 'hover:bg-white/[0.04]'
                                      }`}
                                      title="Click to view card details"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                        <div className="w-6 shrink-0 flex items-center justify-center">
                                          <span className={`text-xs font-mono font-bold ${
                                            isFirst
                                              ? 'text-amber-400'
                                              : isSecond
                                              ? 'text-slate-300'
                                              : isThird
                                              ? 'text-amber-600'
                                              : 'text-neutral-500'
                                          }`}>
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
                                          <p className={`text-xs font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight ${isMatch ? 'text-sky-300' : 'text-neutral-100 group-hover:text-white'}`}>
                                            {item.card_name}
                                          </p>
                                          {item.mana_cost && (
                                            <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                              {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={10} />)}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="shrink-0 flex items-center gap-2 text-right">
                                        <span className={`text-xs font-mono font-bold tabular-nums ${
                                          isFirst
                                            ? 'text-amber-300'
                                            : isSecond
                                            ? 'text-slate-200'
                                            : isThird
                                            ? 'text-amber-500'
                                            : 'text-neutral-300'
                                        }`}>
                                          {item.value} <span className="text-[9.5px] font-normal opacity-70">{item.unit}</span>
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
                                    {matchedBeyondTop3.map((item: any) => {
                                      const diff = item.value - rank3Value;
                                      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                                      return (
                                        <div
                                          key={`${cat.id}-match-${item.grp_id}-${item.rank}`}
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
                                                  {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={10} />)}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          <div className="shrink-0 flex items-center gap-1.5 text-right">
                                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border border-rose-500/30 bg-rose-500/20 text-rose-300">
                                              {diffStr} to #3
                                            </span>
                                            <span className="text-xs font-mono font-bold text-neutral-300 tabular-nums">
                                              {item.value} <span className="text-[9.5px] font-normal opacity-70">{item.unit}</span>
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
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. EXPANDED MODAL (TOP 25 / SEARCH ALL CARDS) */}
      {expandedCategory && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none overflow-y-auto custom-scrollbar"
          onClick={() => setExpandedCategory(null)}
        >
          <div
            className="flex flex-col items-center justify-center max-w-4xl w-full my-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating Top Header (No background frame) */}
            <div className="w-full flex items-center justify-between px-1 pb-3 relative z-20">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`${expandedCategory.iconClass} text-2xl shrink-0`}
                  style={{ color: expandedCategory.color }}
                />
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <h2 className="text-[26px] font-display font-bold uppercase tracking-[0.14em] text-white drop-shadow-lg truncate">
                    {expandedCategory.title}
                  </h2>
                  <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 border border-white/20 bg-white/10 text-neutral-200 uppercase tracking-wider">
                    {isExpSearchActive ? 'Search All Records' : 'Top 25'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setExpandedCategory(null)}
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
                <div className="relative flex-1 max-w-sm h-8 flex items-center">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Search all cards in ${expandedCategory.title}...`}
                    value={expandedSearchQuery}
                    onChange={(e) => setExpandedSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
                    autoFocus
                  />
                  {expandedSearchQuery && (
                    <button
                      onClick={() => setExpandedSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs font-mono text-neutral-400 shrink-0">
                  <span className="hidden sm:inline text-neutral-400">{expandedCategory.subtitle}</span>
                  <span className="text-neutral-300 font-bold tabular-nums">({expAllItems.length} Total Cards)</span>
                </div>
              </div>

              {/* Single Continuous Table List (No boxes within boxes!) */}
              <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                {expAllItems.length === 0 ? (
                  <div className="py-28 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                    No match records logged yet
                  </div>
                ) : !isExpSearchActive ? (
                  /* Top 25 Normal View */
                  expAllItems.slice(0, 25).map((item: any) => {
                    const isFirst = item.rank === 1;
                    const isSecond = item.rank === 2;
                    const isThird = item.rank === 3;

                    return (
                      <div
                        key={`exp-${expandedCategory.id}-${item.grp_id}-${item.rank}`}
                        onClick={() => {
                          setExpandedCategory(null);
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
                            <span className={`text-xs font-mono font-bold ${
                              isFirst
                                ? 'text-amber-400'
                                : isSecond
                                ? 'text-slate-300'
                                : isThird
                                ? 'text-amber-500'
                                : 'text-neutral-500'
                            }`}>
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
                          <span className={`text-xs font-mono font-bold px-3 py-1 border tabular-nums ${
                            isFirst
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : isSecond
                              ? 'bg-slate-400/10 text-slate-200 border-slate-400/30'
                              : isThird
                              ? 'bg-amber-900/20 text-amber-200 border-amber-800/30'
                              : 'border-white/10 bg-neutral-900 text-neutral-200'
                          }`}>
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
                    {expTop3.map((item: any) => {
                      const isFirst = item.rank === 1;
                      const isSecond = item.rank === 2;
                      const isThird = item.rank === 3;
                      const isMatch = item.card_name.toLowerCase().includes(expCleanQuery);

                      return (
                        <div
                          key={`exp-top3-${expandedCategory.id}-${item.grp_id}-${item.rank}`}
                          onClick={() => {
                            setExpandedCategory(null);
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
                              <span className={`text-xs font-mono font-bold ${
                                isFirst
                                  ? 'text-amber-400'
                                  : isSecond
                                  ? 'text-slate-300'
                                  : isThird
                                  ? 'text-amber-500'
                                  : 'text-neutral-500'
                              }`}>
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
                              <p className={`text-sm font-sans font-semibold uppercase tracking-wide truncate group-hover:underline leading-tight ${
                                isMatch ? 'text-sky-300 font-bold' : 'text-neutral-100 group-hover:text-white'
                              }`}>
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
                            <span className={`text-xs font-mono font-bold px-3 py-1 border tabular-nums ${
                              isFirst
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : isSecond
                                ? 'bg-slate-400/10 text-slate-200 border-slate-400/30'
                                : isThird
                                ? 'bg-amber-900/20 text-amber-200 border-amber-800/30'
                                : 'border-white/10 bg-neutral-900 text-neutral-200'
                            }`}>
                              {item.value} <span className="text-[10px] font-normal opacity-75">{item.unit}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Matches Outside Top 3 */}
                    {expMatchesBeyondTop3.length > 0 && (
                      <>
                        <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 px-4 py-2 bg-sky-950/20 flex items-center justify-between border-b border-sky-500/20">
                          <span>Cards Outside of Top 3 ({expMatchesBeyondTop3.length})</span>
                          <span className="text-[10px] text-sky-300/70 font-normal">Gap to Podium</span>
                        </div>
                        {expMatchesBeyondTop3.map((item: any) => {
                          const diff = item.value - expRank3Value;
                          const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

                          return (
                            <div
                              key={`exp-match-${expandedCategory.id}-${item.grp_id}-${item.rank}`}
                              onClick={() => {
                                setExpandedCategory(null);
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

                    {!expHasMatches && (
                      <div className="py-16 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                        No cards found matching "{expandedSearchQuery}"
                      </div>
                    )}

                    {expHasMatches && expMatchesBeyondTop3.length === 0 && expTop3HasMatch && (
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
      )}
    </div>
  );
};

export default LeaderboardsView;
