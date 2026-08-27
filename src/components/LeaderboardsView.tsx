import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, X, Maximize2 } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';
import CardImage from './CardImage';

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedCategory) {
        setExpandedCategory(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedCategory]);

  const loadLeaderboards = async () => {
    setLoading(true);
    try {
      const res = await invoke('get_global_leaderboards');
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
          data: (leaderboards?.combat_single_hit || []) as any[],
        },
        {
          id: 'combat_match_damage',
          title: 'Match Combat Record',
          subtitle: 'Juggernauts — Most combat damage in a single game',
          iconClass: 'ms ms-ability-double-strike',
          color: '#D97706',
          data: (leaderboards?.combat_match_damage || []) as any[],
        },
        {
          id: 'combat_lifetime_damage',
          title: 'Lifetime Combat Dominance',
          subtitle: 'Pure Muscle — Total cumulative combat damage',
          iconClass: 'ms ms-ability-ferocious',
          color: '#D97706',
          data: (leaderboards?.combat_lifetime_damage || []) as any[],
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
          data: (leaderboards?.spell_single_hit || []) as any[],
        },
        {
          id: 'spell_match_damage',
          title: 'Match Spell Record',
          subtitle: 'Arcane Nukes — Most spell damage in a single game',
          iconClass: 'ms ms-instant',
          color: '#8B70CD',
          data: (leaderboards?.spell_match_damage || []) as any[],
        },
        {
          id: 'spell_lifetime_damage',
          title: 'Lifetime Spell Power',
          subtitle: 'Burn Masters — Total cumulative spell/ability damage',
          iconClass: 'ms ms-ability-prowess',
          color: '#8B70CD',
          data: (leaderboards?.spell_lifetime_damage || []) as any[],
        },
      ],
    },
    {
      domainId: 'mastery',
      domainTitle: 'Honors & Mastery',
      domainSubtitle: 'Lifetime honors, lethal finishers, and battlefield deployments',
      domainIconClass: 'ms ms-ability-duels-renowned',
      domainColor: '#E5E7EB',
      categories: [
        {
          id: 'most_decorated',
          title: 'Most Decorated Cards',
          subtitle: 'Honor Titans — Most lifetime achievement titles',
          iconClass: 'ms ms-ability-duels-renowned',
          color: '#EAB308',
          data: (leaderboards?.most_decorated || []) as any[],
        },
        {
          id: 'card_draw_engines',
          title: 'Card Draw Engines',
          subtitle: 'Master Architects — Most extra cards drawn lifetime',
          iconClass: 'ms ms-library',
          color: '#38BDF8',
          data: (leaderboards?.card_draw_engines || []) as any[],
        },
        {
          id: 'battlefield_stalwarts',
          title: 'Battlefield Stalwarts',
          subtitle: 'Core Workhorses — Most times cast (non-lands)',
          iconClass: 'ms ms-ability-convoke',
          color: '#10B981',
          data: (leaderboards?.battlefield_stalwarts || []) as any[],
        },
      ],
    },
  ], [leaderboards]);

  const isSearchActive = searchQuery.trim().length > 0;
  const cleanQuery = searchQuery.toLowerCase().trim();

  const expAllItems = expandedCategory?.data || [];
  const expTop25 = expAllItems.slice(0, 25);
  const expRank3Value = expTop25[2]?.value ?? (expTop25[0]?.value ?? 0);
  const expCleanQuery = expandedSearchQuery.toLowerCase().trim();
  const isExpSearchActive = expCleanQuery.length > 0;

  const expMatchesBeyond25 = isExpSearchActive
    ? expAllItems.filter((item: any) => item.rank > 25 && item.card_name.toLowerCase().includes(expCleanQuery))
    : [];

  const expHasMatches = !isExpSearchActive
    ? true
    : expTop25.some((item: any) => item.card_name.toLowerCase().includes(expCleanQuery)) || expMatchesBeyond25.length > 0;

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
      <div className="shrink-0 border border-white/10 bg-white/[0.02] p-2 flex items-center justify-between gap-2.5 flex-wrap">
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search for card..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs font-mono border border-white/10 bg-black/40 text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
          />
          {isSearchActive && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-3 h-3" />
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
                        className="border border-white/10 bg-neutral-950 shadow-xl flex flex-col overflow-hidden"
                      >
                        {/* Leaderboard Card Header */}
                        <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                            <span className={`${cat.iconClass} text-base shrink-0`} style={{ color: cat.color }} />
                            <h3 className="text-sm font-bold font-display uppercase tracking-wide text-white truncate">
                              {cat.title}
                            </h3>
                          </div>
                          <button
                            onClick={() => {
                              setExpandedCategory(cat);
                              setExpandedSearchQuery('');
                            }}
                            className="p-1 text-neutral-400 hover:text-white border border-transparent hover:border-white/10 hover:bg-white/5 transition-colors shrink-0 ml-1 cursor-pointer"
                            title="Expand Leaderboard (Top 25)"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* List items with exact h-[343px] container and h-[63px] item rows */}
                        <div className="p-2 space-y-1 h-[343px] overflow-y-auto custom-scrollbar flex flex-col justify-start">
                          {allItems.length === 0 ? (
                            <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500 my-auto">
                              No match records logged yet
                            </div>
                          ) : !isSearchActive ? (
                            displayItems.map((item: any) => {
                              const isTop3 = item.rank <= 3;
                              const isFirst = item.rank === 1;
                              const isSecond = item.rank === 2;

                              if (isTop3) {
                                return (
                                  <div
                                    key={`${cat.id}-${item.grp_id}-${item.rank}`}
                                    onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                    className={`flex items-center justify-between px-2.5 h-[63px] border transition-colors cursor-pointer group shrink-0 ${
                                      isFirst
                                        ? 'bg-amber-500/[0.03] border-amber-500/25 hover:border-amber-500/40'
                                        : isSecond
                                        ? 'bg-slate-400/[0.02] border-slate-400/20 hover:border-slate-400/35'
                                        : 'bg-amber-900/[0.03] border-amber-800/20 hover:border-amber-800/35'
                                    }`}
                                    title="Click to view card details"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                      <div className="w-5 shrink-0 flex items-center justify-center">
                                        {isFirst ? (
                                          <span className="ms ms-ability-duels-renowned text-amber-400 text-xs" />
                                        ) : isSecond ? (
                                          <span className="text-[10.5px] font-mono font-bold text-slate-300">#2</span>
                                        ) : (
                                          <span className="text-[10.5px] font-mono font-bold text-amber-600">#3</span>
                                        )}
                                      </div>
                                      <div className="w-10 h-10 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                        <CardImage
                                          name={item.card_name}
                                          version="art_crop"
                                          alt={item.card_name}
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold font-display uppercase tracking-wide truncate group-hover:underline leading-tight text-white">
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
                                      <span className={`text-xs font-mono font-bold px-2 py-0.5 border ${
                                        isFirst
                                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                                          : isSecond
                                          ? 'bg-slate-400/10 text-slate-200 border-slate-400/25'
                                          : 'bg-amber-900/20 text-amber-200 border-amber-800/25'
                                      }`}>
                                        {item.value} <span className="text-[9.5px] font-normal opacity-70">{item.unit}</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={`${cat.id}-${item.grp_id}-${item.rank}`}
                                  onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                  className="flex items-center justify-between px-2.5 h-[63px] border border-white/5 bg-white/[0.015] hover:bg-white/[0.04] transition-colors cursor-pointer group shrink-0"
                                  title="Click to view card details"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                    <div className="w-5 shrink-0 flex items-center justify-center">
                                      <span className="text-[10px] font-mono text-neutral-500">#{item.rank}</span>
                                    </div>
                                    <div className="w-10 h-10 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                      <CardImage
                                        name={item.card_name}
                                        version="art_crop"
                                        alt={item.card_name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold font-display uppercase tracking-wide truncate group-hover:underline leading-tight text-neutral-200 hover:text-white">
                                        {item.card_name}
                                      </p>
                                      {item.mana_cost && (
                                        <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                          {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={10} />)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className="text-xs font-mono font-bold px-2 py-0.5 border border-white/10 bg-black/40 text-neutral-300">
                                      {item.value} <span className="text-[9.5px] font-normal opacity-70">{item.unit}</span>
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="space-y-1 flex-1">
                              <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-500 px-1 pt-0.5">
                                Top 3 Podium Benchmark
                              </div>
                              {top3.map((item: any) => {
                                const isMatch = item.card_name.toLowerCase().includes(cleanQuery);
                                const isFirst = item.rank === 1;
                                const isSecond = item.rank === 2;
                                return (
                                  <div
                                    key={`${cat.id}-top3-${item.grp_id}-${item.rank}`}
                                    onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                    className={`flex items-center justify-between px-2.5 h-[63px] border transition-colors cursor-pointer group shrink-0 ${
                                      isMatch
                                        ? 'border-sky-400 bg-sky-500/20 shadow-md shadow-sky-500/20'
                                        : isFirst
                                        ? 'bg-amber-500/[0.03] border-amber-500/25'
                                        : isSecond
                                        ? 'bg-slate-400/[0.02] border-slate-400/20'
                                        : 'bg-amber-900/[0.03] border-amber-800/20'
                                    }`}
                                    title="Click to view card details"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                      <div className="w-5 shrink-0 flex items-center justify-center">
                                        {isFirst ? (
                                          <span className="ms ms-ability-duels-renowned text-amber-400 text-xs" />
                                        ) : isSecond ? (
                                          <span className="text-[10.5px] font-mono font-bold text-slate-300">#2</span>
                                        ) : (
                                          <span className="text-[10.5px] font-mono font-bold text-amber-600">#3</span>
                                        )}
                                      </div>
                                      <div className="w-10 h-10 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                        <CardImage
                                          name={item.card_name}
                                          version="art_crop"
                                          alt={item.card_name}
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold font-display uppercase tracking-wide truncate group-hover:underline leading-tight text-white">
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
                                      <span className="text-xs font-mono font-bold px-2 py-0.5 border border-white/10 bg-black/40 text-neutral-300">
                                        {item.value} <span className="text-[9.5px] font-normal opacity-70">{item.unit}</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                              {matchedBeyondTop3.length > 0 && (
                                <>
                                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-sky-400 px-1 pt-1 flex items-center justify-between">
                                    <span>Search Matches ({matchedBeyondTop3.length})</span>
                                    <span className="text-[9px] opacity-70 font-normal">Diff to #3 Podium</span>
                                  </div>
                                  {matchedBeyondTop3.map((item: any) => {
                                    const diff = item.value - rank3Value;
                                    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                                    return (
                                      <div
                                        key={`${cat.id}-match-${item.grp_id}-${item.rank}`}
                                        onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                        className="flex items-center justify-between px-2.5 h-[63px] border border-sky-400/80 bg-sky-500/15 hover:bg-sky-500/25 transition-colors cursor-pointer group shrink-0"
                                        title="Click to view card details"
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                          <div className="w-7 shrink-0 text-center">
                                            <span className="text-xs font-mono font-bold text-sky-300">#{item.rank}</span>
                                          </div>
                                          <div className="w-10 h-10 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                            <CardImage
                                              name={item.card_name}
                                              version="art_crop"
                                              alt={item.card_name}
                                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                            />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold font-display uppercase tracking-wide truncate group-hover:underline leading-tight text-sky-300">
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
                                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 border border-rose-500/30 bg-rose-500/20 text-rose-300">
                                            {diffStr} to #3
                                          </span>
                                          <span className="text-xs font-mono font-bold px-2 py-0.5 border border-white/10 bg-black/40 text-neutral-300">
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
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. EXPANDED MODAL (TOP 25) */}
      {expandedCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md select-none"
          onClick={() => setExpandedCategory(null)}
        >
          <div
            className="w-full max-w-3xl lg:max-w-4xl h-[90vh] max-h-[900px] border border-white/20 bg-neutral-950 flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div className="flex items-center gap-3.5 min-w-0">
                <span className={`${expandedCategory.iconClass} text-xl shrink-0`} style={{ color: expandedCategory.color }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold font-display uppercase tracking-wide text-white truncate">
                      {expandedCategory.title}
                    </h2>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-white/15 bg-white/10 text-neutral-300 uppercase">
                      Top 25
                    </span>
                  </div>
                  <p className="text-xs font-mono text-neutral-400 truncate mt-0.5">
                    {expandedCategory.subtitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExpandedCategory(null)}
                className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors shrink-0 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="px-5 py-2.5 border-b border-white/10 shrink-0 flex items-center gap-3 bg-neutral-900/30">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder={`Search cards in ${expandedCategory.title}...`}
                  value={expandedSearchQuery}
                  onChange={(e) => setExpandedSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs font-mono border border-white/10 bg-black/40 text-white placeholder:text-neutral-500 focus:outline-none focus:border-white/30"
                  autoFocus
                />
                {expandedSearchQuery && (
                  <button
                    onClick={() => setExpandedSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs font-mono text-neutral-400 shrink-0 font-bold tabular-nums">
                {expAllItems.length} Total Cards
              </div>
            </div>

            {/* Modal Card List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1.5 min-h-0">
              {expAllItems.length === 0 ? (
                <div className="py-36 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                  No match records logged yet
                </div>
              ) : !expHasMatches ? (
                <div className="py-28 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                  No cards found matching "{expandedSearchQuery}"
                </div>
              ) : (
                <>
                  {expTop25.map((item: any) => {
                    const isTop3 = item.rank <= 3;
                    const isMatch = isExpSearchActive && item.card_name.toLowerCase().includes(expCleanQuery);
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
                        className={`flex items-center justify-between px-3 h-[64px] border transition-colors cursor-pointer group shrink-0 ${
                          isMatch
                            ? 'border-sky-400 bg-sky-500/20 shadow-md shadow-sky-500/20'
                            : isFirst
                            ? 'bg-amber-500/[0.03] border-amber-500/25'
                            : isSecond
                            ? 'bg-slate-400/[0.02] border-slate-400/20'
                            : isThird
                            ? 'bg-amber-900/[0.03] border-amber-800/20'
                            : 'border-white/5 bg-white/[0.015] hover:bg-white/[0.04]'
                        }`}
                        title="Click to view card details"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                          <div className="w-8 shrink-0 flex items-center justify-center">
                            {isFirst ? (
                              <span className="ms ms-ability-duels-renowned text-amber-400 text-sm" />
                            ) : isSecond ? (
                              <span className="text-xs font-mono font-bold text-slate-300">#2</span>
                            ) : isThird ? (
                              <span className="text-xs font-mono font-bold text-amber-600">#3</span>
                            ) : (
                              <span className="text-xs font-mono text-neutral-500 font-bold">#{item.rank}</span>
                            )}
                          </div>
                          <div className="w-10 h-10 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                            <CardImage
                              name={item.card_name}
                              version="art_crop"
                              alt={item.card_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold font-display uppercase tracking-wide truncate group-hover:underline leading-tight ${
                              isMatch ? 'text-sky-300' : 'text-white'
                            }`}>
                              {item.card_name}
                            </p>
                            {!isTop3 && item.mana_cost && (
                              <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2.5 text-right">
                          {isTop3 && item.mana_cost && (
                            <div className="flex items-center gap-0.5 opacity-80">
                              {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                            </div>
                          )}
                          <span className={`text-xs font-mono font-bold px-3 py-1 border ${
                            isFirst
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                              : isSecond
                              ? 'bg-slate-400/10 text-slate-200 border-slate-400/25'
                              : isThird
                              ? 'bg-amber-900/20 text-amber-200 border-amber-800/25'
                              : 'bg-black/40 text-neutral-300 border-white/10'
                          }`}>
                            {item.value} <span className="text-[10px] font-normal opacity-75">{item.unit}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {expMatchesBeyond25.length > 0 && (
                    <>
                      <div className="text-xs font-mono font-bold uppercase tracking-wider text-sky-400 px-1 pt-3 pb-1 flex items-center justify-between border-t border-white/10 mt-3">
                        <span>Matches Beyond Rank 25 ({expMatchesBeyond25.length})</span>
                        <span className="text-xs opacity-70 font-normal">Diff to #3 Podium</span>
                      </div>
                      {expMatchesBeyond25.map((item: any) => {
                        const diff = item.value - expRank3Value;
                        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                        return (
                          <div
                            key={`exp-match-${expandedCategory.id}-${item.grp_id}-${item.rank}`}
                            onClick={() => {
                              setExpandedCategory(null);
                              if (onShowCard) onShowCard({ name: item.card_name, grp_id: item.grp_id }, false);
                            }}
                            className="flex items-center justify-between px-3 h-[64px] border border-sky-400/80 bg-sky-500/15 hover:bg-sky-500/25 transition-colors cursor-pointer group shrink-0"
                            title="Click to view card details"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                              <div className="w-8 shrink-0 text-center">
                                <span className="text-xs font-mono font-bold text-sky-300">#{item.rank}</span>
                              </div>
                              <div className="w-10 h-10 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                <CardImage
                                  name={item.card_name}
                                  version="art_crop"
                                  alt={item.card_name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold font-display uppercase tracking-wide truncate group-hover:underline leading-tight text-sky-300">
                                  {item.card_name}
                                </p>
                                {item.mana_cost && (
                                  <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                    {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2 text-right">
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-rose-500/30 bg-rose-500/20 text-rose-300">
                                {diffStr} to #3
                              </span>
                              <span className="text-xs font-mono font-bold px-3 py-1 border border-white/10 bg-black/40 text-neutral-300">
                                {item.value} <span className="text-[10px] font-normal opacity-75">{item.unit}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaderboardsView;
