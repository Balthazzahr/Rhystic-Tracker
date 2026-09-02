import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { CardImage } from './CardImage';
import { getAchievementMeta } from '../utils/achievementBadges';

export interface AchievementDetailModalProps {
  achievement: any;
  onClose: () => void;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
  palette?: any;
}

export const AchievementDetailModal: React.FC<AchievementDetailModalProps> = ({
  achievement,
  onClose,
  onShowCard,
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

  const accentColor = palette?.accent || '#A855F7';
  const meta = getAchievementMeta(achievement.achievement);

  const isTierAchieved = (targetTier: 'gold' | 'silver' | 'bronze') => {
    if (!achievement || achievement.total_awards === 0 || achievement.is_unearned) return false;
    const tier = achievement.highest_tier?.toLowerCase();
    if (tier === 'gold') return true;
    if (tier === 'silver') return targetTier === 'silver' || targetTier === 'bronze';
    if (tier === 'bronze') return targetTier === 'bronze';
    return false;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none overflow-y-auto custom-scrollbar animate-fade-in"
      onClick={onClose}
    >
      <div className="flex flex-col items-center justify-center max-w-5xl w-full my-auto relative pt-12">
        {/* Stamped Heraldic Shield Badge: Positioned far to the left, moved up by 10% */}
        <div className="absolute -left-12 -top-8 w-[180px] h-[155px] z-30 drop-shadow-[0_16px_32px_rgba(0,0,0,0.95)] pointer-events-none">
          <AchievementBadge
            title={achievement.achievement}
            tier={achievement.highest_tier}
            count={achievement.total_awards}
            size="hero"
            showTitle={false}
            showCount={false}
          />
        </div>

        {/* Completely Floating Header (No background frame, clear gap from badge) */}
        <div
          className="w-full flex items-center justify-between pl-48 pr-2 pb-3.5 relative z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <h2 className="text-[30px] font-display font-bold tracking-[0.14em] uppercase text-white drop-shadow-lg truncate">
              {meta?.title}
            </h2>
            {achievement.total_awards > 0 ? (
              <>
                <span
                  className={`text-[12px] font-mono font-bold px-2.5 py-0.5 border uppercase tracking-wider ${
                    achievement.highest_tier === 'gold'
                      ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-sm'
                      : achievement.highest_tier === 'silver'
                      ? 'bg-slate-400/25 text-slate-200 border-slate-400/60 shadow-sm'
                      : 'bg-amber-900/35 text-amber-200 border-amber-700/60 shadow-sm'
                  }`}
                >
                  {achievement.highest_tier} Tier
                </span>
                <span className="text-[12px] font-mono font-medium px-2.5 py-0.5 border border-white/15 bg-white/10 text-neutral-200">
                  {achievement.cards?.length || 0} {achievement.cards?.length === 1 ? 'Card' : 'Cards'} Decorated
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

        {/* Main Modal Window (Transparent Frosted Glass Body) */}
        <div
          className="w-full max-h-[75vh] flex flex-col bg-neutral-950/75 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Body: Left Decorated Cards + Right Tier Milestones */}
          <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden min-h-0">
            {/* Left Column: Decorated Cards List */}
            <div className="flex-1 flex flex-col min-h-0 p-5 overflow-hidden">
              {/* Centered Decorated Cards Header */}
              <div className="flex items-center justify-center pb-2 mb-3 border-b border-white/10 shrink-0 relative">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 text-center">
                  Decorated Cards
                </span>
                <span className="text-xs font-mono text-neutral-500 tabular-nums absolute right-0">
                  {achievement.cards?.length || 0} Total
                </span>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {!achievement.cards || achievement.cards.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 opacity-60">
                    <span className="ms ms-ability-duels-renowned text-4xl text-neutral-500" />
                    <p className="text-xs font-sans italic text-neutral-400">No cards have achieved this honor yet.</p>
                    <p className="text-[11px] font-sans text-neutral-500 max-w-xs">
                      Trigger the milestone conditions during a live MTG Arena match to decorate your first card.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {achievement.cards.map((c: any) => {
                      const cardName = c.card_name || c.name || `Card #${c.grp_id}`;
                      const awardCount = c.count || c.award_count || 1;
                      return (
                        <div
                          key={c.grp_id || cardName}
                          onClick={() => {
                            onClose();
                            onShowCard?.({ name: cardName, grp_id: c.grp_id }, false);
                          }}
                          className="p-2.5 border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] flex items-center justify-between gap-2.5 transition-colors cursor-pointer group"
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
                                  {c.highest_tier || achievement.highest_tier || 'bronze'}
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

            {/* Right Column: Tier Milestones & Achievement Criteria */}
            <div className="w-full md:w-80 p-5 flex flex-col justify-between space-y-4 bg-neutral-900/20 shrink-0">
              <div className="space-y-3">
                {/* Achievement Criteria (Clean Text, No Inner Box) */}
                <div className="pb-3 border-b border-white/10 space-y-1 text-left">
                  <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-wider block">
                    Achievement Criteria
                  </span>
                  <p className="text-xs text-neutral-300 font-sans leading-relaxed">
                    {meta?.tierDescriptions?.[achievement.highest_tier as 'bronze' | 'silver' | 'gold'] || meta?.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                  <span className="ms ms-ability-duels-renowned text-sm" style={{ color: accentColor }} />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                    Tier Milestones
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
                      <span className="ms ms-ability-duels-renowned text-xs text-amber-300" /> Gold Tier
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
                      <span className="ms ms-ability-duels-renowned text-xs text-slate-300" /> Silver Tier
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
                    <span className="text-xs font-bold font-display uppercase tracking-wide text-amber-500 flex items-center gap-1.5">
                      <span className="ms ms-ability-duels-renowned text-xs text-amber-600" /> Bronze Tier
                    </span>
                    {isTierAchieved('bronze') && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border bg-amber-900/30 text-amber-200 border-amber-800/40 uppercase">
                        Achieved
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-sans text-neutral-300 leading-relaxed">
                    {meta?.tierDescriptions?.bronze || meta?.criteria?.bronze}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 text-center">
                <span className="text-[10px] font-mono text-neutral-500">
                  {achievement.is_unearned || achievement.total_awards === 0
                    ? 'Objective criteria to unlock'
                    : `Highest Honor: ${achievement.highest_tier?.toUpperCase()}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Flavor Quote Outside & Below the Modal Window */}
        {meta?.flavorQuote && (
          <div
            className="w-full max-w-3xl pt-5 text-center space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-lg md:text-[20px] font-plantin italic text-white leading-relaxed drop-shadow-lg">
              "{meta.flavorQuote}"
            </p>
            {meta.flavorAttribution && (
              <p className="text-[14px] font-mono font-medium text-neutral-300">
                — {meta.flavorAttribution}
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
