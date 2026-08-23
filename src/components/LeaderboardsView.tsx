import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Crown, Swords, Flame, Sparkles, Wand2, Shield, Search, X } from 'lucide-react';
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

  useEffect(() => {
    loadLeaderboards();
  }, []);

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

  const categories = useMemo(() => [
    {
      id: 'single_hit',
      title: 'Highest Single-Hit Strike',
      subtitle: 'Haymaker Hall of Fame — Most damage in a single blow',
      icon: Flame,
      color: '#F97316',
      data: (leaderboards?.single_hit || []) as any[],
    },
    {
      id: 'total_damage',
      title: 'Total Match Damage',
      subtitle: 'Juggernauts — Cumulative combat & spell damage dealt',
      icon: Swords,
      color: '#EF4444',
      data: (leaderboards?.total_damage || []) as any[],
    },
    {
      id: 'impactful',
      title: 'Impactful Match MVPs',
      subtitle: 'Key Game-Changers — Most matches earning impactful status',
      icon: Sparkles,
      color: '#FACC15',
      data: (leaderboards?.impactful || []) as any[],
    },
    {
      id: 'combat_damage',
      title: 'Combat Heavyweights',
      subtitle: 'Pure Attack Power — Total damage dealt in combat phases',
      icon: Shield,
      color: '#38BDF8',
      data: (leaderboards?.combat_damage || []) as any[],
    },
    {
      id: 'spell_damage',
      title: 'Spell & Ability Nukes',
      subtitle: 'Arcane Devastation — Non-combat spell & trigger damage',
      icon: Wand2,
      color: '#A855F7',
      data: (leaderboards?.spell_damage || []) as any[],
    },
    {
      id: 'most_honors',
      title: 'Most Decorated Champions',
      subtitle: 'Honor Titans — Most lifetime achievement titles awarded',
      icon: Crown,
      color: '#10B981',
      data: (leaderboards?.most_honors || []) as any[],
    },
  ], [leaderboards]);

  const isSearchActive = searchQuery.trim().length > 0;
  const cleanQuery = searchQuery.toLowerCase().trim();

  return (
    <div className="flex-1 relative flex flex-col space-y-4 overflow-hidden select-none h-full">
      {/* Header (Clean white bold text, matching Deck & Card Library) */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Leaderboards
          </h1>
        </div>
      </div>

      {/* Top bar (Only search bar on the left, right pills removed) */}
      <div
        className="shrink-0 rounded-2xl border p-2.5 flex items-center justify-start gap-2.5"
        style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
      >
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
          <input
            type="text"
            placeholder="Search any card across all leaderboards..."
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

      {/* Content Area: Stretches to fill full height without bottom gap */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
        {loading ? (
          <div className="py-24 text-center opacity-50 font-mono text-sm">
            Calculating Hall of Fame records...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 flex-1 min-h-0 pb-2">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const allItems = cat.data;
              const top3 = allItems.slice(0, 3);
              const rank3Value = top3[2]?.value ?? (top3[0]?.value ?? 0);

              // Calculate items to display based on search
              let displayItems: any[] = [];
              let matchedBeyondTop3: any[] = [];
              let hasSearchMatch = false;

              if (!isSearchActive) {
                // Default: Top 10 cards
                displayItems = allItems.slice(0, 10);
              } else {
                // Search Mode: Always show Top 3, plus matching cards
                matchedBeyondTop3 = allItems.filter(
                  (item) => item.rank > 3 && item.card_name.toLowerCase().includes(cleanQuery)
                );

                const top3HasMatch = top3.some((item) => item.card_name.toLowerCase().includes(cleanQuery));
                hasSearchMatch = top3HasMatch || matchedBeyondTop3.length > 0;
              }

              return (
                <div
                  key={cat.id}
                  className="rounded-3xl border flex flex-col overflow-hidden shadow-xl h-full"
                  style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
                >
                  {/* Category Header */}
                  <div className="p-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: `${palette?.border}66` }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div 
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                        style={{ backgroundColor: `${cat.color}1a`, borderColor: `${cat.color}44` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: cat.color }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black font-outfit uppercase tracking-wide truncate" style={{ color: palette?.text }}>
                          {cat.title}
                        </h3>
                        <p className="text-[10px] font-mono opacity-50 truncate">
                          {cat.subtitle}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cards List: Generously distributed to fill full height */}
                  <div className="p-2 space-y-1 flex-1 flex flex-col justify-between min-h-0 overflow-y-auto custom-scrollbar">
                    {allItems.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono opacity-40">
                        No match records logged yet
                      </div>
                    ) : !isSearchActive ? (
                      /* Standard Top 10 View */
                      displayItems.map((item: any) => {
                        const isFirst = item.rank === 1;
                        const isSecond = item.rank === 2;
                        const isThird = item.rank === 3;

                        return (
                          <div
                            key={`${cat.id}-${item.grp_id}-${item.rank}`}
                            onClick={() => onShowCard && onShowCard({ name: item.card_name, grp_id: item.grp_id }, false)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer group flex-1 min-h-[36px] ${
                              isFirst 
                                ? 'bg-amber-500/10 border-amber-500/40 shadow-sm' 
                                : isSecond
                                ? 'bg-slate-500/10 border-slate-500/30'
                                : isThird
                                ? 'bg-amber-900/15 border-amber-800/30'
                                : 'bg-black/20 border-white/5 hover:bg-white/5'
                            }`}
                            title="Click to view card details"
                          >
                            {/* Left: Rank & Card Thumbnail & Name */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                              {/* Rank Indicator */}
                              <div className="w-5 shrink-0 flex items-center justify-center">
                                {isFirst ? (
                                  <span className="text-sm leading-none" title="1st Place">👑</span>
                                ) : isSecond ? (
                                  <span className="text-xs font-black font-mono text-slate-300">#2</span>
                                ) : isThird ? (
                                  <span className="text-xs font-black font-mono text-amber-500">#3</span>
                                ) : (
                                  <span className="text-[10px] font-mono opacity-40">#{item.rank}</span>
                                )}
                              </div>

                              {/* Card Crop Thumbnail */}
                              <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                <img
                                  src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`}
                                  alt={item.card_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>

                              {/* Name & Mana Cost */}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate group-hover:underline leading-tight" style={{ color: palette?.text }}>
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

                            {/* Right: Record Value Pill */}
                            <div className="shrink-0 text-right">
                              <span className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-lg border ${
                                isFirst
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : isSecond
                                  ? 'bg-slate-500/20 text-slate-200 border-slate-500/40'
                                  : isThird
                                  ? 'bg-amber-900/30 text-amber-300 border-amber-800/40'
                                  : 'bg-black/40 text-white/90 border-white/10'
                              }`}>
                                {item.value} <span className="text-[9px] font-normal opacity-70">{item.unit}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      /* Search Mode: Always Top 3 Benchmark + Matching Cards */
                      <div className="space-y-1.5 flex-1">
                        {/* Pinned Top 3 Podium Benchmark */}
                        <div className="text-[9px] font-mono font-bold uppercase tracking-wider opacity-50 px-1 pt-0.5">
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
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer group min-h-[36px] ${
                                isMatch
                                  ? 'ring-2 ring-amber-400 bg-amber-500/20 border-amber-400'
                                  : isFirst 
                                  ? 'bg-amber-500/10 border-amber-500/40' 
                                  : isSecond
                                  ? 'bg-slate-500/10 border-slate-500/30'
                                  : 'bg-amber-900/15 border-amber-800/30'
                              }`}
                              title="Click to view card details"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                <div className="w-5 shrink-0 flex items-center justify-center">
                                  {isFirst ? (
                                    <span className="text-sm leading-none">👑</span>
                                  ) : isSecond ? (
                                    <span className="text-xs font-black font-mono text-slate-300">#2</span>
                                  ) : (
                                    <span className="text-xs font-black font-mono text-amber-500">#3</span>
                                  )}
                                </div>
                                <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                  <img
                                    src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`}
                                    alt={item.card_name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold truncate group-hover:underline leading-tight" style={{ color: palette?.text }}>
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
                              <div className="shrink-0 text-right">
                                <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-lg border bg-black/40 text-white/90 border-white/10">
                                  {item.value} <span className="text-[9px] font-normal opacity-70">{item.unit}</span>
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Search Matches Outside Top 3 */}
                        {matchedBeyondTop3.length > 0 && (
                          <>
                            <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 px-1 pt-2 flex items-center justify-between">
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
                                  className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-all cursor-pointer group min-h-[36px]"
                                  title="Click to view card details"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                                    <div className="w-7 shrink-0 text-center">
                                      <span className="text-xs font-mono font-black text-amber-300">
                                        #{item.rank}
                                      </span>
                                    </div>
                                    <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                      <img
                                        src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}&format=image&version=art_crop`}
                                        alt={item.card_name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-bold truncate group-hover:underline leading-tight text-white">
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
                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                      {diffStr} to #3
                                    </span>
                                    <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-lg border bg-black/40 text-white/90 border-white/10">
                                      {item.value} <span className="text-[9px] font-normal opacity-70">{item.unit}</span>
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}

                        {!hasSearchMatch && (
                          <div className="py-4 text-center text-[11px] font-mono opacity-40">
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
        )}
      </div>
    </div>
  );
};
