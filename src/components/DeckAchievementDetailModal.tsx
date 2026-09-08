import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DeckAchievementBadge } from './DeckAchievementBadge';
import { getDeckAchievementMeta, AchievementTier } from '../utils/achievementBadges';

export interface DeckAchievementDetailModalProps {
  achievement: any;
  onClose: () => void;
  palette?: any;
}

export const DeckAchievementDetailModal: React.FC<DeckAchievementDetailModalProps> = ({
  achievement,
  onClose,
  palette,
}) => {
  useEffect(() => {
    if (!achievement) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [achievement, onClose]);

  if (!achievement) return null;

  const accentColor = palette?.accent || '#EAB308';
  const meta = getDeckAchievementMeta(achievement.achievement_id || achievement.achievement);
  const earnedTier = achievement.highest_tier || achievement.tier;

  const isTierAchieved = (targetTier: 'gold' | 'silver' | 'bronze') => {
    if (!achievement || achievement.is_unearned) return false;
    const tier = earnedTier?.toLowerCase();
    if (tier === 'gold') return true;
    if (tier === 'silver') return targetTier === 'silver' || targetTier === 'bronze';
    if (tier === 'bronze') return targetTier === 'bronze';
    return false;
  };

  const decksList: Array<{ deck_name: string; tier: AchievementTier; earned_at?: string }> = achievement.decks || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none overflow-y-auto custom-scrollbar animate-fade-in"
      onClick={onClose}
    >
      <div className="flex flex-col items-center justify-center max-w-5xl w-full my-auto relative pt-12">
        {/* Medallion Badge Hero Icon Floating Top-Left */}
        <div className="absolute -left-10 -top-8 w-[160px] h-[160px] z-30 drop-shadow-[0_16px_32px_rgba(0,0,0,0.95)] pointer-events-none">
          <DeckAchievementBadge
            title={meta.id}
            tier={earnedTier || 'bronze'}
            size="hero"
            showTitle={false}
            showCount={false}
            showTooltip={false}
          />
        </div>

        {/* Floating Header */}
        <div
          className="w-full flex items-center justify-between pl-44 pr-2 pb-3.5 relative z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <h2 className="text-[28px] font-display font-bold tracking-[0.14em] uppercase text-white drop-shadow-lg truncate">
              {meta?.title}
            </h2>
            {earnedTier ? (
              <>
                <span
                  className={`text-[12px] font-mono font-bold px-2.5 py-0.5 border uppercase tracking-wider ${
                    earnedTier === 'gold'
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-sm'
                      : earnedTier === 'silver'
                      ? 'bg-slate-400/25 text-slate-200 border-slate-400/60 shadow-sm'
                      : 'bg-amber-900/35 text-amber-200 border-amber-700/60 shadow-sm'
                  }`}
                >
                  {earnedTier} Tier
                </span>
                <span className="text-[12px] font-mono font-medium px-2.5 py-0.5 border border-white/15 bg-white/10 text-neutral-200">
                  {decksList.length} {decksList.length === 1 ? 'Deck' : 'Decks'} Achieved
                </span>
              </>
            ) : (
              <span className="text-[12px] font-mono font-bold px-2.5 py-0.5 border border-white/20 bg-white/10 text-neutral-300 uppercase">
                Unearned
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white border border-white/10 transition-all cursor-pointer shrink-0 ml-4"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Window */}
        <div
          className="w-full max-h-[74vh] flex flex-col bg-neutral-950/75 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
            {/* Left Column: Decks Decorated */}
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar border-b md:border-b-0 md:border-r border-white/10">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="ms ms-ability-adventure text-base" style={{ color: accentColor }} />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Decks Awarded This Milestone
                    </span>
                  </div>
                  <span className="text-xs font-mono text-neutral-400">
                    {decksList.length} {decksList.length === 1 ? 'Deck' : 'Decks'}
                  </span>
                </div>

                {decksList.length === 0 ? (
                  <div className="py-20 text-center space-y-2">
                    <p className="font-display font-bold uppercase tracking-wider text-sm text-neutral-400">
                      No Decks Have Earned This Milestone Yet
                    </p>
                    <p className="text-xs font-sans text-neutral-500 max-w-sm mx-auto">
                      Meet the match criteria in MTGA matches to claim this crown and laurel medallion!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {decksList.map((d) => {
                      const dTier = d.tier || 'bronze';
                      const dateStr = d.earned_at
                        ? new Date(d.earned_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '';

                      return (
                        <div
                          key={d.deck_name}
                          className="flex items-center justify-between p-3.5 bg-black/40 border border-white/10 hover:border-white/25 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <span className="font-display font-bold text-sm text-white truncate block">
                              {d.deck_name}
                            </span>
                            {dateStr && (
                              <span className="text-[10px] font-mono text-neutral-400">
                                {dateStr}
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border uppercase tracking-wider shrink-0 ${
                            dTier === 'gold'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                              : dTier === 'silver'
                              ? 'bg-slate-400/15 text-slate-200 border-slate-400/35'
                              : 'bg-amber-900/25 text-amber-200 border-amber-700/35'
                          }`}>
                            {dTier}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Tier Milestones & Achievement Criteria */}
            <div className="w-full md:w-80 p-5 flex flex-col justify-between space-y-4 bg-neutral-900/20 shrink-0">
              <div className="space-y-3">
                {/* Description */}
                <div className="pb-3 border-b border-white/10 space-y-1 text-left">
                  <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-wider block">
                    Deck Milestone
                  </span>
                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    {meta?.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                  <span className="ms ms-ability-adventure text-sm" style={{ color: accentColor }} />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    Tier Requirements
                  </span>
                </div>

                {/* Gold Tier */}
                <div
                  className={`p-3 border transition-all ${
                    isTierAchieved('gold')
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                      : 'bg-black/20 border-white/10 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-400 flex items-center gap-1.5">
                      <span className="ms ms-ability-adventure text-xs text-amber-300" /> Gold Tier
                    </span>
                    {isTierAchieved('gold') && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-500/20 text-amber-300 border-amber-500/40 uppercase">
                        Achieved
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                    {meta?.tierDescriptions?.gold || meta?.criteria?.gold}
                  </p>
                </div>

                {/* Silver Tier */}
                <div
                  className={`p-3 border transition-all ${
                    isTierAchieved('silver')
                      ? 'bg-slate-400/10 border-slate-400/40 shadow-sm'
                      : 'bg-black/20 border-white/10 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold font-display uppercase tracking-wide text-slate-200 flex items-center gap-1.5">
                      <span className="ms ms-ability-adventure text-xs text-slate-300" /> Silver Tier
                    </span>
                    {isTierAchieved('silver') && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-slate-500/20 text-slate-200 border-slate-500/40 uppercase">
                        Achieved
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                    {meta?.tierDescriptions?.silver || meta?.criteria?.silver}
                  </p>
                </div>

                {/* Bronze Tier */}
                <div
                  className={`p-3 border transition-all ${
                    isTierAchieved('bronze')
                      ? 'bg-amber-900/20 border-amber-700/40 shadow-sm'
                      : 'bg-black/20 border-white/10 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-200 flex items-center gap-1.5">
                      <span className="ms ms-ability-adventure text-xs text-amber-200" /> Bronze Tier
                    </span>
                    {isTierAchieved('bronze') && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-900/30 text-amber-200 border-amber-700/40 uppercase">
                        Achieved
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                    {meta?.tierDescriptions?.bronze || meta?.criteria?.bronze}
                  </p>
                </div>
              </div>

              {/* Flavor Quote Bottom Card */}
              {meta?.flavorQuote && (
                <div className="pt-3 border-t border-white/10">
                  <p className="text-xs font-serif italic text-neutral-400 leading-relaxed">
                    "{meta.flavorQuote}"
                  </p>
                  {meta.flavorAttribution && (
                    <span className="text-[10px] font-sans text-neutral-500 block text-right mt-1 font-medium">
                      — {meta.flavorAttribution}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
