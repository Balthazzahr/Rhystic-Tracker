import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Target, Sparkles } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { getAchievementMeta, ACHIEVEMENTS_REGISTRY } from '../utils/achievementBadges';
import CardImage from './CardImage';

interface AchievementsViewProps {
  palette: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

function getContrastTextColor(hexColor?: string): string {
  if (!hexColor) return '#FFFFFF';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length < 6) return '#FFFFFF';
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#09090B' : '#FFFFFF';
}

export const AchievementsView: React.FC<AchievementsViewProps> = ({ palette, onShowCard }) => {
  const [activeCategory, setActiveCategory] = useState<'card' | 'deck'>('card');
  const [loading, setLoading] = useState(true);
  const [achievementsData, setAchievementsData] = useState<any>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [showUnearned, setShowUnearned] = useState<boolean>(() => {
    const saved = localStorage.getItem('rhystic_achievements_show_unearned');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('rhystic_achievements_show_unearned', String(showUnearned));
  }, [showUnearned]);

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
    if (tier === 'gold') return true;
    if (tier === 'silver') return targetTier === 'silver' || targetTier === 'bronze';
    if (tier === 'bronze') return targetTier === 'bronze';
    return false;
  };

  const accentColor = palette?.accent || '#A855F7';
  const totalUnlocked = achievementsData?.total_unlocked ?? 0;
  const totalPossible = achievementsData?.total_possible ?? 21;

  const selectedMeta = selectedAchievement ? getAchievementMeta(selectedAchievement.achievement) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-duels-renowned text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            ACHIEVEMENTS
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({totalUnlocked} of {totalPossible} trophies unlocked)
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER & CONTROLS TOOLBAR */}
      <div className="shrink-0 border border-white/10 bg-white/[0.02] p-2 flex items-center justify-between gap-2.5 flex-wrap">
        {/* Left: Category Switcher Tabs (with MTG set icons) */}
        <div className="flex items-center border border-white/10 bg-white/[0.03] overflow-hidden">
          <button
            onClick={() => setActiveCategory('card')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
              activeCategory === 'card'
                ? 'bg-white/[0.08] text-white font-bold border-r border-white/10'
                : 'text-neutral-400 hover:text-white border-r border-white/5'
            }`}
          >
            <span className="ms ms-modal-dfc-instant text-sm" style={{ color: activeCategory === 'card' ? accentColor : undefined }} />
            <span>Card Achievements</span>
          </button>
          <button
            onClick={() => setActiveCategory('deck')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
              activeCategory === 'deck'
                ? 'bg-white/[0.08] text-white font-bold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <span className="ms ms-ability-adventure text-sm" style={{ color: activeCategory === 'deck' ? accentColor : undefined }} />
            <span>Deck Achievements</span>
            <span className="text-[9px] font-mono px-1 py-0.2 border border-white/10 bg-white/5 text-neutral-400">
              Soon
            </span>
          </button>
        </div>

        {/* Right: Summary Metrics Pills & Show Unearned Toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Trophies Summary Chips with MTG renowned icons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-amber-500/30 bg-amber-500/10 text-xs font-mono font-bold text-amber-300 tabular-nums">
              <span className="ms ms-ability-duels-renowned text-xs text-amber-300" />
              <span>{achievementsData?.gold_count ?? 0}</span>
              <span className="text-[10px] uppercase font-sans opacity-70 ml-0.5">Gold</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-slate-400/30 bg-slate-400/10 text-xs font-mono font-bold text-slate-200 tabular-nums">
              <span className="ms ms-ability-duels-renowned text-xs text-slate-300" />
              <span>{achievementsData?.silver_count ?? 0}</span>
              <span className="text-[10px] uppercase font-sans opacity-70 ml-0.5">Silver</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 border border-amber-700/30 bg-amber-900/20 text-xs font-mono font-bold text-amber-200 tabular-nums">
              <span className="ms ms-ability-duels-renowned text-xs text-amber-600" />
              <span>{achievementsData?.bronze_count ?? 0}</span>
              <span className="text-[10px] uppercase font-sans opacity-70 ml-0.5">Bronze</span>
            </div>
          </div>

          {/* Show Unearned Toggle */}
          {activeCategory === 'card' && (
            <div className="flex items-center gap-2 pl-3 border-l border-white/10">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                Show Unearned
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showUnearned}
                onClick={() => setShowUnearned(!showUnearned)}
                className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors duration-200 ${
                  showUnearned
                    ? 'border-white/40'
                    : 'border-white/10 bg-white/[0.04]'
                }`}
                style={{
                  backgroundColor: showUnearned ? accentColor : undefined,
                }}
              >
                <span
                  className="pointer-events-none inline-block h-3.5 w-3.5 shadow-sm transition-all duration-200"
                  style={{
                    transform: showUnearned ? 'translateX(17px)' : 'translateX(2px)',
                    backgroundColor: showUnearned ? getContrastTextColor(accentColor) : '#71717A',
                  }}
                />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1 min-h-0">
        {activeCategory === 'card' ? (
          <>
            {loading ? (
              <div className="py-24 text-center text-xs font-mono uppercase tracking-wider text-neutral-500">
                Loading achievements...
              </div>
            ) : displayList.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <div className="w-14 h-14 bg-white/[0.02] border border-white/10 flex items-center justify-center text-neutral-500 mx-auto">
                  <span className="ms ms-ability-duels-renowned text-3xl opacity-40" />
                </div>
                <h3 className="text-lg font-display font-bold tracking-wide uppercase text-white">
                  No Achievements Unlocked Yet
                </h3>
                <p className="text-xs font-sans text-neutral-400 max-w-md mx-auto leading-relaxed">
                  Play matches on MTG Arena to earn combat honors, lethal strikes, massive token swarms, and card draw titles.
                </p>
              </div>
            ) : (
              /* Centered grid of prominent, heroic achievement cards */
              <div className="flex flex-wrap items-center justify-center content-center gap-5 w-full py-2">
                {displayList.map((ach: any) => {
                  const meta = getAchievementMeta(ach.achievement);
                  const topCard = ach.cards?.[0];
                  const topCardName = topCard?.card_name || topCard?.name;
                  const isUnearnedItem = ach.is_unearned || ach.total_awards === 0;
                  const cardsCount = ach.cards?.length || 0;

                  return (
                    <div
                      key={ach.achievement}
                      onClick={() => setSelectedAchievement(ach)}
                      className={`w-[320px] h-[335px] shrink-0 p-4 border transition-all duration-200 flex flex-col items-center justify-between shadow-xl cursor-pointer text-center group ${
                        isUnearnedItem
                          ? 'bg-black/40 hover:bg-black/60 border-white/5 hover:border-white/20 opacity-55 hover:opacity-90'
                          : 'bg-neutral-950 hover:bg-white/[0.04] border-white/10 hover:border-white/30'
                      }`}
                    >
                      {/* Top: Title & Tier Badge */}
                      <div className="w-full flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                        <h4
                          className="text-[18px] font-bold font-display uppercase tracking-wide text-white truncate text-left flex-1"
                          title={meta.title}
                        >
                          {meta.title}
                        </h4>
                        {isUnearnedItem ? (
                          <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/5 text-neutral-400 shrink-0">
                            Unearned
                          </span>
                        ) : (
                          <span
                            className={`text-[9.5px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider shrink-0 ${
                              ach.highest_tier === 'gold'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                : ach.highest_tier === 'silver'
                                ? 'bg-slate-400/15 text-slate-200 border-slate-400/35'
                                : 'bg-amber-900/25 text-amber-200 border-amber-700/35'
                            }`}
                          >
                            {ach.highest_tier}
                          </span>
                        )}
                      </div>

                      {/* Center: Large Heroic Badge Emblem */}
                      <div className={`w-36 h-36 flex items-center justify-center my-auto transition-transform duration-300 group-hover:scale-105 ${isUnearnedItem ? 'opacity-35 grayscale' : ''}`}>
                        <AchievementBadge
                          title={ach.achievement}
                          tier={ach.highest_tier}
                          count={ach.total_awards}
                          size="hero"
                          showTitle={false}
                          showCount={false}
                        />
                      </div>

                      {/* Middle Stats */}
                      <div className="space-y-0.5 mb-1">
                        {isUnearnedItem ? (
                          <p className="text-[11px] font-mono text-neutral-500">
                            Click to inspect criteria
                          </p>
                        ) : (
                          <p className="text-[11px] font-mono text-neutral-400 tabular-nums">
                            Awarded to <span className="text-white font-bold">{cardsCount}</span> {cardsCount === 1 ? 'card' : 'cards'} ({ach.total_awards}× total)
                          </p>
                        )}
                      </div>

                      {/* Bottom Bar: MVP Card */}
                      <div className="w-full pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs font-mono">
                        {isUnearnedItem ? (
                          <div className="flex items-center justify-center w-full text-neutral-500 text-[11px] font-mono py-0.5">
                            <span>Locked · Not yet earned</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {topCardName && (
                              <div className="w-8 h-8 border border-white/15 overflow-hidden shrink-0 bg-neutral-900 shadow-sm">
                                <CardImage
                                  name={topCardName}
                                  version="art_crop"
                                  alt={topCardName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1 text-left">
                              <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider block leading-none">MVP</span>
                              <span className="text-[13px] font-bold font-display uppercase text-white truncate block tracking-wide" title={topCardName}>
                                {topCardName || '—'}
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
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-16 h-16 flex items-center justify-center border border-white/10 bg-white/[0.02] shadow-xl">
              <span className="ms ms-ability-adventure text-3xl" style={{ color: accentColor }} />
            </div>
            <h3 className="text-xl font-display font-bold uppercase tracking-wide text-white">
              Deck Achievements
            </h3>
            <p className="text-xs font-sans text-neutral-400 leading-relaxed max-w-md">
              Deck-level milestones, win streaks, comeback victories, and archetype dominance achievements are currently in active design.
            </p>
            <div className="p-4 border border-white/10 bg-white/[0.02] text-xs font-mono text-neutral-300 space-y-1.5 w-full text-left">
              <p className="font-bold flex items-center gap-1.5" style={{ color: accentColor }}>
                <Sparkles className="w-4 h-4" /> Roadmap Feature
              </p>
              <p className="text-neutral-400 font-sans text-[11.5px] leading-relaxed">
                Check back in upcoming releases for Deck Win Streaks, Comeback King, and Archetype Mastery badges!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 4. DRILL-DOWN MODAL & FLOATING FLAVOR QUOTE */}
      {selectedAchievement && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none overflow-y-auto custom-scrollbar"
          onClick={() => setSelectedAchievement(null)}
        >
          <div className="flex flex-col items-center justify-center max-w-5xl w-full my-auto">
            {/* Modal Frame */}
            <div
              className="w-full max-h-[78vh] flex flex-col bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-20 h-20 shrink-0 flex items-center justify-center">
                    <AchievementBadge
                      title={selectedAchievement.achievement}
                      tier={selectedAchievement.highest_tier}
                      count={selectedAchievement.total_awards}
                      size="2xl"
                      showTitle={false}
                      showCount={false}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl font-display font-bold tracking-[0.12em] uppercase text-white">
                        {selectedMeta?.title}
                      </h2>
                      {selectedAchievement.total_awards > 0 ? (
                        <>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider ${
                              selectedAchievement.highest_tier === 'gold'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                : selectedAchievement.highest_tier === 'silver'
                                ? 'bg-slate-400/15 text-slate-200 border-slate-400/40'
                                : 'bg-amber-900/25 text-amber-200 border-amber-700/40'
                            }`}
                          >
                            {selectedAchievement.highest_tier} Tier
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 border border-white/10 bg-white/5 text-neutral-300">
                            {selectedAchievement.cards?.length || 0} {selectedAchievement.cards?.length === 1 ? 'Card' : 'Cards'} Decorated
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-white/15 bg-white/5 text-neutral-400 uppercase">
                          Unearned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 font-sans">
                      {selectedMeta?.tierDescriptions?.[selectedAchievement.highest_tier as 'bronze' | 'silver' | 'gold'] || selectedMeta?.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedAchievement(null)}
                  className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body: Left Decorated Cards + Right Tier Milestones */}
              <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden min-h-0">
                {/* Left Column: Decorated Cards List */}
                <div className="flex-1 flex flex-col min-h-0 p-5 overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10 shrink-0">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300">
                      Decorated Cards
                    </span>
                    <span className="text-xs font-mono text-neutral-500 tabular-nums">
                      {selectedAchievement.cards?.length || 0} Total
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {!selectedAchievement.cards || selectedAchievement.cards.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 opacity-60">
                        <span className="ms ms-ability-duels-renowned text-4xl text-neutral-500" />
                        <p className="text-xs font-sans italic text-neutral-400">No cards have achieved this honor yet.</p>
                        <p className="text-[11px] font-sans text-neutral-500 max-w-xs">
                          Trigger the milestone conditions during a live MTG Arena match to decorate your first card.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {selectedAchievement.cards.map((c: any) => {
                          const cardName = c.card_name || c.name || `Card #${c.grp_id}`;
                          const awardCount = c.count || c.award_count || 1;
                          return (
                            <div
                              key={c.grp_id || cardName}
                              onClick={() => {
                                setSelectedAchievement(null);
                                onShowCard?.({ name: cardName, grp_id: c.grp_id }, false);
                              }}
                              className="p-2.5 border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] flex items-center justify-between gap-2.5 transition-colors cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {/* Card Art Thumbnail */}
                                <div className="w-11 h-11 shrink-0 border border-white/15 overflow-hidden bg-neutral-900 group-hover:border-white/50 transition-colors shadow-sm">
                                  <CardImage
                                    name={cardName}
                                    version="art_crop"
                                    alt={cardName}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <span
                                    className="text-xs font-bold font-display uppercase tracking-wide text-white truncate block text-left w-full group-hover:underline leading-snug"
                                    title={cardName}
                                  >
                                    {cardName}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 border uppercase ${
                                        c.highest_tier === 'gold'
                                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                          : c.highest_tier === 'silver'
                                          ? 'bg-slate-400/15 text-slate-200 border-slate-400/30'
                                          : 'bg-amber-900/25 text-amber-200 border-amber-700/30'
                                      }`}
                                    >
                                      {c.highest_tier}
                                    </span>
                                    {c.max_val > 0 && (
                                      <span className="text-[10px] font-mono text-neutral-400">
                                        Best: <strong className="text-white">{c.max_val}</strong>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Trigger Multiplier Count Pill */}
                              <div className="shrink-0 flex flex-col items-end gap-0.5">
                                <span className="text-xs font-mono font-bold px-2 py-0.5 border border-white/15 bg-white/[0.04] text-white">
                                  {awardCount > 1 ? `×${awardCount}` : '1×'}
                                </span>
                                <span className="text-[8.5px] font-mono uppercase tracking-wider text-neutral-500">
                                  Triggered
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Tier Milestones */}
                <div className="w-full md:w-80 p-5 flex flex-col justify-between space-y-4 bg-neutral-900/20 shrink-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                      <Target className="w-4 h-4" style={{ color: accentColor }} />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                        Tier Milestones
                      </span>
                    </div>

                    {/* Gold Tier */}
                    <div
                      className={`p-3 border transition-all ${
                        isTierAchieved('gold', selectedAchievement)
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                          : 'bg-black/20 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-400 flex items-center gap-1.5">
                          <span className="ms ms-ability-duels-renowned text-xs text-amber-300" /> Gold Tier
                        </span>
                        {isTierAchieved('gold', selectedAchievement) && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-500/20 text-amber-300 border-amber-500/40 uppercase">
                            Achieved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                        {selectedMeta?.tierDescriptions?.gold || selectedMeta?.criteria?.gold}
                      </p>
                    </div>

                    {/* Silver Tier */}
                    <div
                      className={`p-3 border transition-all ${
                        isTierAchieved('silver', selectedAchievement)
                          ? 'bg-slate-400/10 border-slate-400/40 shadow-sm'
                          : 'bg-black/20 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold font-display uppercase tracking-wide text-slate-200 flex items-center gap-1.5">
                          <span className="ms ms-ability-duels-renowned text-xs text-slate-300" /> Silver Tier
                        </span>
                        {isTierAchieved('silver', selectedAchievement) && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-slate-500/20 text-slate-200 border-slate-500/40 uppercase">
                            Achieved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                        {selectedMeta?.tierDescriptions?.silver || selectedMeta?.criteria?.silver}
                      </p>
                    </div>

                    {/* Bronze Tier */}
                    <div
                      className={`p-3 border transition-all ${
                        isTierAchieved('bronze', selectedAchievement)
                          ? 'bg-amber-900/20 border-amber-700/40 shadow-sm'
                          : 'bg-black/20 border-white/10 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
                          <span className="ms ms-ability-duels-renowned text-xs text-amber-600" /> Bronze Tier
                        </span>
                        {isTierAchieved('bronze', selectedAchievement) && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-900/30 text-amber-200 border-amber-800/40 uppercase">
                            Achieved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                        {selectedMeta?.tierDescriptions?.bronze || selectedMeta?.criteria?.bronze}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10 text-center">
                    <span className="text-[10px] font-mono text-neutral-500">
                      {selectedAchievement.is_unearned || selectedAchievement.total_awards === 0
                        ? 'Objective criteria to unlock'
                        : `Highest Honor: ${selectedAchievement.highest_tier?.toUpperCase()}`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Flavor Quote Outside & Below the Modal Window */}
            {selectedMeta?.flavorQuote && (
              <div
                className="w-full max-w-3xl pt-5 text-center space-y-1"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-base md:text-lg font-plantin italic text-white leading-relaxed drop-shadow-md">
                  "{selectedMeta.flavorQuote}"
                </p>
                {selectedMeta.flavorAttribution && (
                  <p className="text-xs font-mono font-medium text-neutral-400">
                    — {selectedMeta.flavorAttribution}
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

export default AchievementsView;
