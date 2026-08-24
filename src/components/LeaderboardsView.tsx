import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Crown, Swords, Flame, Sparkles, Wand2, Shield, Search, X, Zap, BookOpen, Layers, Maximize2 } from 'lucide-react';
import { ManaFontPip } from './ManaFontPip';
import { parseMtgaManaCost } from '../utils/manaUtils';

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
      domainIcon: Swords,
      domainColor: '#F97316',
      categories: [
        {
          id: 'combat_single_hit',
          title: 'Highest Single-Hit Strike',
          subtitle: 'Haymakers — Most combat damage in a single swing',
          icon: Flame,
          color: '#F97316',
          data: (leaderboards?.combat_single_hit || []) as any[],
        },
        {
          id: 'combat_match_damage',
          title: 'Match Combat Record',
          subtitle: 'Juggernauts — Most combat damage in a single game',
          icon: Shield,
          color: '#EA580C',
          data: (leaderboards?.combat_match_damage || []) as any[],
        },
        {
          id: 'combat_lifetime_damage',
          title: 'Lifetime Combat Dominance',
          subtitle: 'Pure Muscle — Total cumulative combat damage',
          icon: Swords,
          color: '#EF4444',
          data: (leaderboards?.combat_lifetime_damage || []) as any[],
        },
      ],
    },
    {
      domainId: 'spells',
      domainTitle: 'Non-Combat (Spells & Abilities) Damage',
      domainSubtitle: 'Direct burns, triggered abilities, and multi-target board wipes',
      domainIcon: Wand2,
      domainColor: '#A855F7',
      categories: [
        {
          id: 'spell_single_hit',
          title: 'Highest Single Cast / Hit',
          subtitle: 'Annihilators — Most damage in 1 cast (AoE summed)',
          icon: Zap,
          color: '#C084FC',
          data: (leaderboards?.spell_single_hit || []) as any[],
        },
        {
          id: 'spell_match_damage',
          title: 'Match Spell Record',
          subtitle: 'Arcane Nukes — Most spell damage in a single game',
          icon: Wand2,
          color: '#A855F7',
          data: (leaderboards?.spell_match_damage || []) as any[],
        },
        {
          id: 'spell_lifetime_damage',
          title: 'Lifetime Spell Power',
          subtitle: 'Burn Masters — Total cumulative spell/ability damage',
          icon: Sparkles,
          color: '#9333EA',
          data: (leaderboards?.spell_lifetime_damage || []) as any[],
        },
      ],
    },
    {
      domainId: 'mastery',
      domainTitle: 'Honors & Mastery',
      domainSubtitle: 'Lifetime honors, lethal finishers, and battlefield deployments',
      domainIcon: Crown,
      domainColor: '#10B981',
      categories: [
        {
          id: 'most_decorated',
          title: 'Most Decorated Cards',
          subtitle: 'Honor Titans — Most lifetime achievement titles',
          icon: Crown,
          color: '#10B981',
          data: (leaderboards?.most_decorated || []) as any[],
        },
        {
          id: 'card_draw_engines',
          title: 'Card Draw Engines',
          subtitle: 'Master Architects — Most extra cards drawn lifetime',
          icon: BookOpen,
          color: '#FACC15',
          data: (leaderboards?.card_draw_engines || []) as any[],
        },
        {
          id: 'battlefield_stalwarts',
          title: 'Battlefield Stalwarts',
          subtitle: 'Core Workhorses — Most times cast (non-lands)',
          icon: Layers,
          color: '#38BDF8',
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

  return (
    <div className="flex-1 relative flex flex-col space-y-3 overflow-hidden select-none h-full p-0">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Leaderboards
          </h1>
        </div>
      </div>

      <div
        className="shrink-0 rounded-2xl border p-2 flex items-center justify-start gap-2.5"
        style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
      >
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            type="text"
            placeholder="Search any card across all 9 leaderboards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border bg-black/30 focus:outline-none"
            style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
          />
          {isSearchActive && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-white/10"
              style={{ color: palette?.text }}
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-0">
        {loading ? (
          <div className="py-24 text-center opacity-50 font-mono text-sm">
            Calculating Hall of Fame records...
          </div>
        ) : (
          sections.map((sec) => {
            const DomainIcon = sec.domainIcon;

            return (
              <div key={sec.domainId} className="space-y-1">
                <div className="flex items-center gap-2 px-1">
                  <div 
                    className="w-6 h-6 rounded-lg flex items-center justify-center border shrink-0"
                    style={{ backgroundColor: `${sec.domainColor}20`, borderColor: `${sec.domainColor}50` }}
                  >
                    <DomainIcon className="w-3.5 h-3.5" style={{ color: sec.domainColor }} />
                  </div>
                  <h2 className="text-sm font-black font-outfit uppercase tracking-wider text-white">
                    {sec.domainTitle}
                  </h2>
                  <span className="text-[11px] font-mono opacity-60 hidden sm:inline">
                    — {sec.domainSubtitle}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sec.categories.map((cat) => {
                    const CatIcon = cat.icon;
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
                        className="rounded-2xl border flex flex-col overflow-hidden shadow-lg"
                        style={{ backgroundColor: palette?.surface || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
                      >
                        <div className="px-3 py-2 border-b flex items-center justify-between shrink-0" style={{ borderColor: `${palette?.border}66` }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div 
                              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                              style={{ backgroundColor: `${cat.color}1a`, borderColor: `${cat.color}44` }}
                            >
                              <CatIcon className="w-3.5 h-3.5" style={{ color: cat.color }} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-xs md:text-sm font-black font-outfit uppercase tracking-wide truncate" style={{ color: palette?.text }}>
                                {cat.title}
                              </h3>
                              <p className="text-[10px] font-mono opacity-60 truncate">
                                {cat.subtitle}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setExpandedCategory(cat);
                              setExpandedSearchQuery('');
                            }}
                            className="p-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-all shrink-0 ml-1"
                            title="Expand Leaderboard (Top 25)"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="p-2 space-y-1 h-[318px] overflow-y-auto custom-scrollbar flex flex-col justify-start">
                          {allItems.length === 0 ? (
                            <div className="py-24 text-center text-xs font-mono opacity-40 my-auto">
                              No match records logged yet
                            </div>
                          ) : !isSearchActive ? (
                            displayItems.map((item: any) => {
                              const isTop3 = item.rank <= 3;
                              const isFirst = item.rank === 1;
                              const isSecond = item.rank === 2;
                              const isThird = item.rank === 3;

                              if (isTop3) {
                                return (
                                  <div
                                    key={`${cat.id}-${item.grp_id}-${item.rank}`}
                                    onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                    className={`flex items-center justify-between px-3 h-[58px] rounded-xl border transition-colors duration-150 cursor-pointer group shrink-0 ${
                                      isFirst ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' : isSecond ? 'bg-slate-500/10 border-slate-500/30' : 'bg-amber-900/15 border-amber-800/30'
                                    }`}
                                    title="Click to view card details"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                      <div className="w-5 shrink-0 flex items-center justify-center">
                                        {isFirst ? <span className="text-base leading-none">👑</span> : isSecond ? <span className="text-xs font-black font-mono text-slate-300">#2</span> : <span className="text-xs font-black font-mono text-amber-500">#3</span>}
                                      </div>
                                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                        <img src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`} alt={item.card_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-sm sm:text-[15px] truncate group-hover:underline leading-tight ${
                                          isFirst ? 'text-amber-400 font-extrabold' : 'text-white font-bold'
                                        }`}>
                                          {item.card_name}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2 text-right">
                                      {item.mana_cost && (
                                        <div className="flex items-center gap-0.5 opacity-80">
                                          {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                                        </div>
                                      )}
                                      <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-lg border ${isFirst ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : isSecond ? 'bg-slate-500/20 text-slate-200 border-slate-500/40' : 'bg-amber-900/30 text-amber-300 border-amber-800/40'}`}>
                                        {item.value} <span className="text-[10px] font-normal opacity-70">{item.unit}</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={`${cat.id}-${item.grp_id}-${item.rank}`}
                                  onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                                  className="flex items-center justify-between px-3 h-[58px] rounded-xl border bg-black/20 border-white/5 hover:bg-white/5 transition-colors duration-150 cursor-pointer group shrink-0"
                                  title="Click to view card details"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                    <div className="w-5 shrink-0 flex items-center justify-center">
                                      <span className="text-[11px] font-mono opacity-50">#{item.rank}</span>
                                    </div>
                                    <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                      <img src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`} alt={item.card_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs md:text-[13px] font-bold truncate group-hover:underline leading-tight text-white">{item.card_name}</p>
                                      {item.mana_cost && (
                                        <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                          {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg border bg-black/40 text-white/90 border-white/10">
                                      {item.value} <span className="text-[10px] font-normal opacity-70">{item.unit}</span>
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="space-y-1 flex-1">
                              <div className="text-[9px] font-mono font-bold uppercase tracking-wider opacity-50 px-1 pt-0.5">Top 3 Podium Benchmark</div>
                              {top3.map((item: any) => {
                                const isMatch = item.card_name.toLowerCase().includes(cleanQuery);
                                const isFirst = item.rank === 1;
                                const isSecond = item.rank === 2;
                                const isThird = item.rank === 3;
                                return (
                                  <div key={`${cat.id}-top3-${item.grp_id}-${item.rank}`} onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)} className={`flex items-center justify-between px-3 h-[58px] rounded-xl border transition-colors duration-150 cursor-pointer group shrink-0 ${isMatch ? 'ring-2 ring-sky-400 bg-sky-500/25 border-sky-400 shadow-md shadow-sky-500/20' : isFirst ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' : isSecond ? 'bg-slate-500/10 border-slate-500/30' : 'bg-amber-900/15 border-amber-800/30'}`} title="Click to view card details">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                      <div className="w-5 shrink-0 flex items-center justify-center">{isFirst ? <span className="text-base leading-none">👑</span> : isSecond ? <span className="text-xs font-black font-mono text-slate-300">#2</span> : <span className="text-xs font-black font-mono text-amber-500">#3</span>}</div>
                                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                        <img src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`} alt={item.card_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-sm sm:text-[15px] truncate group-hover:underline leading-tight ${
                                          isMatch ? 'text-yellow-300 font-bold' : isFirst ? 'text-amber-400 font-extrabold' : 'text-white font-bold'
                                        }`}>
                                          {item.card_name}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-2 text-right">
                                      {item.mana_cost && (
                                        <div className="flex items-center gap-0.5 opacity-80">
                                          {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                                        </div>
                                      )}
                                      <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg border bg-black/40 text-white/90 border-white/10">{item.value} <span className="text-[10px] font-normal opacity-70">{item.unit}</span></span>
                                    </div>
                                  </div>
                                );
                              })}
                              {matchedBeyondTop3.length > 0 && (
                                <>
                                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-sky-400 px-1 pt-1 flex items-center justify-between"><span>Search Matches ({matchedBeyondTop3.length})</span><span className="text-[9px] opacity-70 font-normal">Diff to #3 Podium</span></div>
                                  {matchedBeyondTop3.map((item: any) => {
                                    const diff = item.value - rank3Value;
                                    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                                    return (
                                      <div key={`${cat.id}-match-${item.grp_id}-${item.rank}`} onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)} className="flex items-center justify-between px-3 h-[58px] rounded-xl border-2 border-sky-400 bg-sky-500/25 ring-1 ring-sky-400/50 hover:bg-sky-500/35 transition-colors duration-150 cursor-pointer group shrink-0 shadow-md shadow-sky-500/20" title="Click to view card details">
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                          <div className="w-7 shrink-0 text-center"><span className="text-xs font-mono font-black text-sky-300">#{item.rank}</span></div>
                                          <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow"><img src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`} alt={item.card_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs md:text-[13px] font-bold truncate group-hover:underline leading-tight text-yellow-300">{item.card_name}</p>
                                            {item.mana_cost && (
                                              <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                                                {parseMtgaManaCost(item.mana_cost).slice(0, 4).map((s, i) => <ManaFontPip key={i} symbol={s} size={11} />)}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-1.5 text-right">
                                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">{diffStr} to #3</span>
                                          <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg border bg-black/40 text-white/90 border-white/10">{item.value} <span className="text-[10px] font-normal opacity-70">{item.unit}</span></span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                              {!hasSearchMatch && <div className="py-4 text-center text-[11px] font-mono opacity-40">No match in this category</div>}
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

      {expandedCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150" onClick={() => setExpandedCategory(null)}>
          <div className="w-full max-w-3xl lg:max-w-4xl h-[94vh] max-h-[940px] rounded-3xl border flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150" style={{ backgroundColor: palette?.surface || '#12141A', borderColor: palette?.border || '#2A2F3D' }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b flex items-center justify-between shrink-0" style={{ borderColor: `${palette?.border}66` }}>
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border" style={{ backgroundColor: `${expandedCategory.color}1a`, borderColor: `${expandedCategory.color}44` }}>
                  {React.createElement(expandedCategory.icon, { className: "w-6 h-6", style: { color: expandedCategory.color } })}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-black font-outfit uppercase tracking-wide truncate text-white">{expandedCategory.title}</h2>
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/15">Top 25</span>
                  </div>
                  <p className="text-xs sm:text-sm font-mono opacity-70 truncate mt-0.5">{expandedCategory.subtitle}</p>
                </div>
              </div>
              <button onClick={() => setExpandedCategory(null)} className="p-2.5 rounded-xl border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0" title="Close (Esc)">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="px-5 sm:px-6 py-3.5 border-b shrink-0 flex items-center gap-3 bg-black/20" style={{ borderColor: `${palette?.border}44` }}>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
                <input type="text" placeholder={`Search cards in ${expandedCategory.title}...`} value={expandedSearchQuery} onChange={(e) => setExpandedSearchQuery(e.target.value)} className="w-full pl-10 pr-9 py-2.5 text-sm sm:text-base rounded-xl border bg-black/30 focus:outline-none" style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }} autoFocus />
                {expandedSearchQuery && (
                  <button onClick={() => setExpandedSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors hover:bg-white/10" style={{ color: palette?.text }}><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              <div className="text-xs sm:text-sm font-mono opacity-60 shrink-0 font-bold">{expAllItems.length} Total Cards</div>
            </div>

            {/* Modal Card List: Shows top 25, or filtered matches beyond 25 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-2 min-h-0">
              {expAllItems.length === 0 ? (
                <div className="py-36 text-center text-sm font-mono opacity-40">No match records logged yet</div>
              ) : !expHasMatches ? (
                <div className="py-28 text-center text-sm font-mono opacity-40">No cards found matching "{expandedSearchQuery}"</div>
              ) : (
                <>
                  {expTop25.map((item: any) => {
                    const isTop3 = item.rank <= 3;
                    const isMatch = isExpSearchActive && item.card_name.toLowerCase().includes(expCleanQuery);
                    const isFirst = item.rank === 1;
                    const isSecond = item.rank === 2;
                    const isThird = item.rank === 3;
                    return (
                      <div key={`exp-${expandedCategory.id}-${item.grp_id}-${item.rank}`} onClick={() => { setExpandedCategory(null); if (onShowCard) onShowCard({ name: item.card_name, grp_id: item.grp_id }, false); }} className={`flex items-center justify-between px-4 h-[68px] rounded-2xl border transition-colors duration-150 cursor-pointer group shrink-0 ${isMatch ? 'ring-2 ring-sky-400 bg-sky-500/25 border-sky-400 shadow-md shadow-sky-500/20' : isFirst ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' : isSecond ? 'bg-slate-500/10 border-slate-500/30' : isThird ? 'bg-amber-900/15 border-amber-800/30' : 'bg-black/20 border-white/5 hover:bg-white/5'}`} title="Click to view card details">
                        <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                          <div className="w-8 shrink-0 flex items-center justify-center">{isFirst ? <span className="text-xl leading-none">👑</span> : isSecond ? <span className="text-sm font-black font-mono text-slate-300">#2</span> : isThird ? <span className="text-sm font-black font-mono text-amber-500">#3</span> : <span className="text-xs sm:text-sm font-mono opacity-50 font-bold">#{item.rank}</span>}</div>
                          <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow"><img src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`} alt={item.card_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-base sm:text-lg font-bold truncate group-hover:underline leading-tight ${
                              isMatch ? 'text-yellow-300' : isFirst ? 'text-amber-400 font-extrabold' : 'text-white'
                            }`}>
                              {item.card_name}
                            </p>
                            {!isTop3 && item.mana_cost && (
                              <div className="flex items-center gap-1 mt-1 opacity-85">
                                {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => <ManaFontPip key={i} symbol={s} size={13} />)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2.5 text-right">
                          {isTop3 && item.mana_cost && (
                            <div className="flex items-center gap-1 opacity-85">
                              {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => <ManaFontPip key={i} symbol={s} size={13} />)}
                            </div>
                          )}
                          <span className={`text-xs sm:text-sm font-mono font-black px-3.5 py-1.5 rounded-xl border ${isFirst ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : isSecond ? 'bg-slate-500/20 text-slate-200 border-slate-500/40' : isThird ? 'bg-amber-900/30 text-amber-300 border-amber-800/40' : 'bg-black/40 text-white/90 border-white/10'}`}>{item.value} <span className="text-xs font-normal opacity-75">{item.unit}</span></span>
                        </div>
                      </div>
                    );
                  })}
                  {expMatchesBeyond25.length > 0 && (
                    <>
                      <div className="text-xs font-mono font-bold uppercase tracking-wider text-sky-400 px-1 pt-4 pb-1.5 flex items-center justify-between border-t border-white/10 mt-4"><span>Matches Beyond Rank 25 ({expMatchesBeyond25.length})</span><span className="text-xs opacity-70 font-normal">Diff to #3 Podium</span></div>
                      {expMatchesBeyond25.map((item: any) => {
                        const diff = item.value - expRank3Value;
                        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                        return (
                          <div key={`exp-match-${expandedCategory.id}-${item.grp_id}-${item.rank}`} onClick={() => { setExpandedCategory(null); if (onShowCard) onShowCard({ name: item.card_name, grp_id: item.grp_id }, false); }} className="flex items-center justify-between px-4 h-[68px] rounded-2xl border-2 border-sky-400 bg-sky-500/25 ring-1 ring-sky-400/50 hover:bg-sky-500/35 transition-colors duration-150 cursor-pointer group shrink-0 shadow-md shadow-sky-500/20" title="Click to view card details">
                            <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                              <div className="w-8 shrink-0 text-center"><span className="text-sm font-mono font-black text-sky-300">#{item.rank}</span></div>
                              <div className="w-11 h-11 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow"><img src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`} alt={item.card_name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm sm:text-base font-bold truncate group-hover:underline leading-tight text-yellow-300">{item.card_name}</p>
                                {item.mana_cost && (
                                  <div className="flex items-center gap-1 mt-1 opacity-85">
                                    {parseMtgaManaCost(item.mana_cost).slice(0, 5).map((s, i) => <ManaFontPip key={i} symbol={s} size={13} />)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2.5 text-right">
                              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30">{diffStr} to #3</span>
                              <span className="text-xs sm:text-sm font-mono font-black px-3.5 py-1.5 rounded-xl border bg-black/40 text-white/90 border-white/10">{item.value} <span className="text-xs font-normal opacity-75">{item.unit}</span></span>
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
