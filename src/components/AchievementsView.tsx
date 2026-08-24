import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Award, Layers, Sparkles, X } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { getAchievementMeta, ACHIEVEMENTS_REGISTRY } from '../utils/achievementBadges';

interface AchievementsViewProps {
  palette: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const AchievementsView: React.FC<AchievementsViewProps> = ({ palette, onShowCard }) => {
  const [activeCategory, setActiveCategory] = useState<'card' | 'deck'>('card');
  const [loading, setLoading] = useState(true);
  const [achievementsData, setAchievementsData] = useState<any>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [showUnearned, setShowUnearned] = useState(false);

  useEffect(() => {
    loadAchievements();
  }, []);

  // Global Escape key listener to dismiss drill-down modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAchievement(null);
      }
    };
    if (selectedAchievement) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedAchievement]);

  const loadAchievements = async () => {
    setLoading(true);
    try {
      const res = await invoke('get_global_achievements');
      setAchievementsData(res);
    } catch (err) {
      console.error('Failed to load global achievements:', err);
    } finally {
      setLoading(false);
    }
  };

  const unlockedList = achievementsData?.achievements || [];

  // When showUnearned is true, display earned achievements first followed by all unearned achievements
  const displayList = useMemo(() => {
    if (!showUnearned) {
      return unlockedList;
    }

    const unlockedIds = new Set(
      unlockedList.map((a: any) => getAchievementMeta(a.achievement).id)
    );

    const unearnedList = Object.values(ACHIEVEMENTS_REGISTRY)
      .filter((meta) => !unlockedIds.has(meta.id))
      .map((meta) => ({
        achievement: meta.title,
        highest_tier: 'bronze' as const,
        total_awards: 0,
        cards: [],
        is_unearned: true,
        meta,
      }));

    return [...unlockedList, ...unearnedList];
  }, [unlockedList, showUnearned]);

  // Helper to determine if a specific tier has been achieved
  const isTierAchieved = (targetTier: 'gold' | 'silver' | 'bronze', ach: any) => {
    if (!ach || ach.total_awards === 0 || ach.is_unearned) return false;
    const tier = ach.highest_tier?.toLowerCase();
    if (tier === 'gold') return true; // Gold achieves all 3
    if (tier === 'silver') return targetTier === 'silver' || targetTier === 'bronze';
    if (tier === 'bronze') return targetTier === 'bronze';
    return false;
  };

  return (
    <div className="flex-1 relative flex flex-col space-y-4 overflow-hidden select-none h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
            Achievements
          </h1>
        </div>
      </div>

      {/* Top bar */}
      <div
        className="shrink-0 rounded-2xl border p-2.5 flex items-center justify-between gap-2.5 flex-wrap"
        style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
      >
        {/* Left: Category Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-0.5 rounded-xl border bg-black/40" style={{ borderColor: `${palette?.border}66` }}>
          <button
            onClick={() => setActiveCategory('card')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeCategory === 'card' 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                : 'opacity-60 hover:opacity-100 text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Card Achievements</span>
          </button>
          <button
            onClick={() => setActiveCategory('deck')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeCategory === 'deck' 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                : 'opacity-60 hover:opacity-100 text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Deck Achievements</span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/10 opacity-70">Soon</span>
          </button>
        </div>

        {/* Right: Summary Metrics Pills & Far-Right Toggle Switch */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-amber-500/10 border-amber-500/30 text-xs font-mono font-bold text-amber-300">
              <span>🥇</span>
              <span>{achievementsData?.gold_count ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-slate-500/10 border-slate-500/30 text-xs font-mono font-bold text-slate-200">
              <span>🥈</span>
              <span>{achievementsData?.silver_count ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-amber-900/20 border-amber-800/30 text-xs font-mono font-bold text-amber-200">
              <span>🥉</span>
              <span>{achievementsData?.bronze_count ?? 0}</span>
            </div>
            <div className="px-2.5 py-1 rounded-xl border bg-white/5 border-white/10 text-xs font-mono font-bold opacity-80">
              {achievementsData?.total_unlocked ?? 0} / {achievementsData?.total_possible ?? 21} Trophies
            </div>
          </div>

          {/* Far-Right Toggle Switch for Show Unearned */}
          {activeCategory === 'card' && (
            <div className="flex items-center gap-2.5 pl-2 border-l border-white/10">
              <span className="text-xs font-mono font-bold" style={{ color: palette?.text }}>
                Show Unearned
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showUnearned}
                onClick={() => setShowUnearned(!showUnearned)}
                className="relative inline-flex items-center h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none"
                style={{
                  backgroundColor: showUnearned ? (palette?.accent || '#FACC15') : '#181B22',
                  borderColor: showUnearned ? (palette?.accent || '#FACC15') : '#2E3545',
                }}
              >
                <span
                  className="pointer-events-none inline-block h-4 w-4 rounded-full shadow-md transition-all duration-200 ease-in-out"
                  style={{
                    transform: showUnearned ? 'translateX(22px)' : 'translateX(2px)',
                    backgroundColor: showUnearned ? '#000000' : '#94A3B8',
                  }}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center p-4 min-h-0">
        {activeCategory === 'card' ? (
          <>
            {loading ? (
              <div className="py-24 text-center opacity-50 font-mono text-sm">
                Loading achievements...
              </div>
            ) : displayList.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mx-auto">
                  <Award className="w-8 h-8 opacity-40" />
                </div>
                <p className="text-lg font-bold font-outfit" style={{ color: palette?.text }}>
                  No Achievements Unlocked Yet
                </p>
                <p className="text-xs font-mono opacity-50 max-w-md mx-auto">
                  Play matches on MTGA to earn combat titles, lethal strikes, massive token swarms, and card draw honors.
                </p>
              </div>
            ) : (
              /* Centered cluster of wide square cards */
              <div className="flex flex-wrap items-center justify-center content-center gap-6 w-full my-auto py-2">
                {displayList.map((ach: any) => {
                  const meta = getAchievementMeta(ach.achievement);
                  const topCard = ach.cards?.[0];
                  const isUnearnedItem = ach.is_unearned || ach.total_awards === 0;
                  const cardsCount = ach.cards?.length || 0;

                  return (
                    <div
                      key={ach.achievement}
                      onClick={() => setSelectedAchievement(ach)}
                      className={`w-[330px] h-[330px] shrink-0 p-5 rounded-3xl border transition-colors duration-150 flex flex-col items-center justify-between shadow-lg cursor-pointer text-center ${
                        isUnearnedItem 
                          ? 'bg-black/25 hover:bg-black/40 border-white/10 hover:border-white/20 opacity-60 hover:opacity-90' 
                          : 'bg-black/35 hover:bg-black/50 hover:border-white/30'
                      }`}
                      style={{ borderColor: isUnearnedItem ? undefined : `${palette?.border}88` }}
                    >
                      {/* 1. Centered Title at top */}
                      <h4 className="text-base font-black font-outfit uppercase tracking-wide text-white truncate w-full pt-1" title={meta.title}>
                        {meta.title}
                      </h4>

                      {/* 2. Larger Centered Badge Emblem */}
                      <div className={`w-28 h-28 flex items-center justify-center my-auto ${isUnearnedItem ? 'opacity-40' : ''}`}>
                        <AchievementBadge
                          title={ach.achievement}
                          tier={ach.highest_tier}
                          count={ach.total_awards}
                          size="2xl"
                          showTitle={false}
                          showCount={false}
                        />
                      </div>

                      {/* 3. Tier & Awarded to X Cards */}
                      <div className="space-y-1 mb-1">
                        {isUnearnedItem ? (
                          <>
                            <span className="px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase tracking-wider inline-block bg-white/5 text-slate-400 border-white/15">
                              Unearned
                            </span>
                            <p className="text-xs font-mono font-bold text-slate-400">
                              Awarded to 0 Cards
                            </p>
                          </>
                        ) : (
                          <>
                            <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-bold uppercase tracking-wider inline-block ${
                              ach.highest_tier === 'gold' 
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                                : ach.highest_tier === 'silver'
                                ? 'bg-slate-500/20 text-slate-200 border-slate-500/40'
                                : 'bg-amber-900/30 text-amber-200 border-amber-800/40'
                            }`}>
                              {ach.highest_tier} Tier
                            </span>
                            <p className="text-xs font-mono font-bold text-amber-400">
                              Awarded to {cardsCount} {cardsCount === 1 ? 'Card' : 'Cards'}
                            </p>
                          </>
                        )}
                      </div>

                      {/* 4. Full MVP Name + Art Thumbnail */}
                      <div className="w-full pt-2.5 border-t flex items-center justify-between gap-2 text-xs font-mono" style={{ borderColor: `${palette?.border}44` }}>
                        {isUnearnedItem ? (
                          <div className="flex items-center justify-center w-full text-slate-400 text-xs font-mono py-0.5 opacity-60">
                            <span>Click to view criteria</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {topCard && (
                              <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 shrink-0 bg-slate-900 shadow">
                                <img
                                  src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(topCard.card_name)}&format=image&version=art_crop`}
                                  alt={topCard.card_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1 text-left">
                              <span className="text-[9px] opacity-50 block leading-none">MVP</span>
                              <span className="text-xs font-bold text-white truncate block" title={topCard?.card_name}>
                                {topCard?.card_name || '—'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Placeholder for Deck Achievements */
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-lg mx-auto">
            <div 
              className="w-20 h-20 rounded-3xl flex items-center justify-center border shadow-2xl"
              style={{ backgroundColor: `${palette?.accent || '#FACC15'}1a`, borderColor: `${palette?.accent || '#FACC15'}44` }}
            >
              <Layers className="w-10 h-10" style={{ color: palette?.accent || '#FACC15' }} />
            </div>
            <h3 className="text-2xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
              Deck Achievements
            </h3>
            <p className="text-sm leading-relaxed opacity-70">
              Deck-level milestones, win streaks, comeback victories, and archetype dominance achievements are currently in active design.
            </p>
            <div className="p-4 rounded-2xl border bg-black/40 border-amber-500/30 text-xs font-mono text-amber-300 space-y-1 w-full text-left">
              <p className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Roadmap Feature
              </p>
              <p className="opacity-80">
                Check back in upcoming versions for Deck Win Streaks, Comeback King, and Archetype Mastery badges!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected Achievement Drill-Down Modal & Separate Side Tiers Card */}
      {selectedAchievement && (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-2xl animate-fade-in select-none"
          onClick={() => setSelectedAchievement(null)}
        >
          <div className="flex flex-col items-center justify-center max-w-5xl w-full max-h-[92vh]">
            <div 
              className="flex flex-col md:flex-row items-stretch justify-center gap-4 w-full max-h-[75vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1. Main Left Modal Card */}
              <div
                className="flex-1 rounded-3xl border shadow-2xl flex flex-col overflow-hidden min-h-0 animate-in fade-in zoom-in-95 duration-150"
                style={{ backgroundColor: palette?.surface || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
              >
                {/* Header */}
                <div
                  className="p-6 border-b flex flex-col space-y-4 shrink-0"
                  style={{ borderColor: palette?.border }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                        <AchievementBadge
                          title={selectedAchievement.achievement}
                          tier={selectedAchievement.highest_tier}
                          count={selectedAchievement.total_awards}
                          size="2xl"
                          showTitle={false}
                          showCount={false}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                            {getAchievementMeta(selectedAchievement.achievement).title}
                          </h3>
                          {selectedAchievement.total_awards > 0 ? (
                            <>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Awarded to {selectedAchievement.cards?.length || 0} {selectedAchievement.cards?.length === 1 ? 'Card' : 'Cards'}
                              </span>
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase ${
                                selectedAchievement.highest_tier === 'gold'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : selectedAchievement.highest_tier === 'silver'
                                  ? 'bg-slate-500/20 text-slate-200 border-slate-500/40'
                                  : 'bg-amber-900/30 text-amber-200 border-amber-800/40'
                              }`}>
                                {selectedAchievement.highest_tier} Tier
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-slate-400 border border-white/20 uppercase">
                              Unearned
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono opacity-60 mt-0.5">
                          {selectedAchievement.cards && selectedAchievement.cards.length > 0
                            ? `${selectedAchievement.cards.length} ${selectedAchievement.cards.length === 1 ? 'card has' : 'cards have'} earned this achievement`
                            : 'No cards have earned this achievement yet'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedAchievement(null)}
                      className="text-xs font-mono opacity-60 hover:opacity-100 p-2 rounded-xl border hover:bg-white/5 transition-opacity"
                      style={{ borderColor: palette?.border }}
                      title="Close (Esc)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Award Objective Description */}
                  <div className="px-1 pt-1">
                    <p className="text-xs leading-relaxed text-slate-300 font-sans">
                      {getAchievementMeta(selectedAchievement.achievement).tierDescriptions?.[selectedAchievement.highest_tier as 'bronze' | 'silver' | 'gold'] || getAchievementMeta(selectedAchievement.achievement).description}
                    </p>
                  </div>
                </div>

                {/* Cards List Section */}
                <div className="flex-1 overflow-hidden p-6 flex flex-col min-h-0">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 shrink-0">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                      Decorated Cards
                    </span>
                    <span className="text-xs font-mono opacity-50">
                      {selectedAchievement.cards?.length || 0} Total
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {!selectedAchievement.cards || selectedAchievement.cards.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 opacity-60">
                        <Award className="w-8 h-8 text-slate-500" />
                        <p className="text-xs font-mono text-slate-400">No cards have achieved this honor yet.</p>
                        <p className="text-[11px] font-sans text-slate-500 max-w-xs">
                          Review the tier requirements in the side card and fulfill them in MTGA matches to unlock this trophy!
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {selectedAchievement.cards.map((card: any) => (
                          <button
                            key={`${card.grp_id}-${card.card_name}`}
                            onClick={() => {
                              setSelectedAchievement(null);
                              if (onShowCard) onShowCard({ name: card.card_name, grp_id: card.grp_id }, false);
                            }}
                            className="flex items-center justify-between p-3 rounded-2xl border bg-black/25 hover:bg-white/5 transition-all text-left group"
                            style={{ borderColor: `${palette?.border}66` }}
                            title="Click to inspect card"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                              <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-white/10 bg-slate-900">
                                <img
                                  src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.card_name)}&format=image&version=art_crop`}
                                  alt={card.card_name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-xs truncate group-hover:underline text-white">
                                  {card.card_name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-[9px] font-mono uppercase font-bold ${
                                    card.highest_tier === 'gold' ? 'text-amber-300' : card.highest_tier === 'silver' ? 'text-slate-300' : 'text-amber-600'
                                  }`}>
                                    {card.highest_tier} Tier
                                  </span>
                                  {card.earned_at && (
                                    <span className="text-[9px] font-mono opacity-50">
                                      • {new Date(card.earned_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
                              ×{card.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Separate Standalone Tiers Card to the Right */}
              <div 
                className="w-full md:w-80 shrink-0 rounded-3xl border shadow-2xl p-6 flex flex-col justify-between overflow-hidden min-h-0 animate-in fade-in zoom-in-95 duration-150" 
                style={{ backgroundColor: palette?.surface || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
              >
                <div className="flex items-center gap-2 pb-3 border-b border-white/10 shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-black font-outfit uppercase tracking-wider text-white">
                    Achievement Tiers
                  </h4>
                </div>

                <div className="space-y-3.5 overflow-y-auto custom-scrollbar flex-1 py-3 pr-0.5 text-left">
                  {/* Gold Tier */}
                  <div className={`p-3.5 rounded-2xl border transition-all ${
                    isTierAchieved('gold', selectedAchievement)
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'bg-black/30 border-white/10 opacity-70'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black font-outfit text-amber-400 flex items-center gap-1.5">
                        <span>🥇</span> Gold Tier
                      </span>
                      {isTierAchieved('gold', selectedAchievement) && (
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Achieved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300 font-sans">
                      {getAchievementMeta(selectedAchievement.achievement).tierDescriptions?.gold || getAchievementMeta(selectedAchievement.achievement).criteria?.gold}
                    </p>
                  </div>

                  {/* Silver Tier */}
                  <div className={`p-3.5 rounded-2xl border transition-all ${
                    isTierAchieved('silver', selectedAchievement)
                      ? 'bg-slate-400/15 border-slate-400/50 shadow-[0_0_15px_rgba(148,163,184,0.15)]'
                      : 'bg-black/30 border-white/10 opacity-70'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black font-outfit text-slate-200 flex items-center gap-1.5">
                        <span>🥈</span> Silver Tier
                      </span>
                      {isTierAchieved('silver', selectedAchievement) && (
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-200 border border-slate-500/40">
                          Achieved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300 font-sans">
                      {getAchievementMeta(selectedAchievement.achievement).tierDescriptions?.silver || getAchievementMeta(selectedAchievement.achievement).criteria?.silver}
                    </p>
                  </div>

                  {/* Bronze Tier */}
                  <div className={`p-3.5 rounded-2xl border transition-all ${
                    isTierAchieved('bronze', selectedAchievement)
                      ? 'bg-amber-900/25 border-amber-700/50 shadow-[0_0_15px_rgba(180,83,9,0.15)]'
                      : 'bg-black/30 border-white/10 opacity-70'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black font-outfit text-amber-500 flex items-center gap-1.5">
                        <span>🥉</span> Bronze Tier
                      </span>
                      {isTierAchieved('bronze', selectedAchievement) && (
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-200 border border-amber-800/40">
                          Achieved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300 font-sans">
                      {getAchievementMeta(selectedAchievement.achievement).tierDescriptions?.bronze || getAchievementMeta(selectedAchievement.achievement).criteria?.bronze}
                    </p>
                  </div>
                </div>

                {/* Footer info note inside side card */}
                <div className="pt-3 border-t border-white/10 text-center shrink-0">
                  <span className="text-[10px] font-mono opacity-50">
                    {selectedAchievement.is_unearned || selectedAchievement.total_awards === 0
                      ? 'Objective criteria to unlock'
                      : `Highest Tier: ${selectedAchievement.highest_tier?.toUpperCase()}`}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Floating Flavor Quote Directly Below the Cards Row */}
            {getAchievementMeta(selectedAchievement.achievement).flavorQuote && (
              <div 
                className="w-full max-w-3xl pt-5 text-center space-y-1.5 animate-in fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-base md:text-lg italic font-serif text-white leading-relaxed drop-shadow-md">
                  "{getAchievementMeta(selectedAchievement.achievement).flavorQuote}"
                </p>
                {getAchievementMeta(selectedAchievement.achievement).flavorAttribution && (
                  <p className="text-xs font-mono font-medium text-slate-400">
                    — {getAchievementMeta(selectedAchievement.achievement).flavorAttribution}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


