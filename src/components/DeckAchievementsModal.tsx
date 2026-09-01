import React, { useEffect } from 'react';
import { Trophy, X, Award } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { CardImage } from './CardImage';
import { getAchievementMeta } from '../utils/achievementBadges';

interface DeckAchievementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  groupedAchievements?: Array<{
    achievement: string;
    total_awards: number;
    cards: Array<{ grp_id: number; card_name: string; count: number; tier?: string }>;
  }>;
  palette?: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const DeckAchievementsModal: React.FC<DeckAchievementsModalProps> = ({
  isOpen,
  onClose,
  deckName,
  groupedAchievements = [],
  onShowCard,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter out any stray token entries just in case
  const cleanGroups = (groupedAchievements || []).map((g) => ({
    ...g,
    cards: (g.cards || []).filter(
      (c) => !c.card_name?.toLowerCase().includes('token')
    ),
  })).filter((g) => g.cards.length > 0);

  const totalHonors = cleanGroups.reduce((sum, g) => sum + g.cards.reduce((cSum, c) => cSum + (c.count || 1), 0), 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] border border-white/20 bg-neutral-950/95 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold uppercase tracking-wide text-white text-base leading-tight">
                  Card Achievements
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-300 tabular-nums">
                  {totalHonors} Total
                </span>
              </div>
              <p className="text-xs font-mono text-neutral-400 truncate max-w-[450px]">
                {deckName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 bg-neutral-900/60 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {cleanGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2.5">
              <div className="w-12 h-12 bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500">
                <Award className="w-6 h-6 opacity-40" />
              </div>
              <p className="font-display font-bold uppercase tracking-wider text-sm text-white">
                No Card Achievements Earned Yet
              </p>
              <p className="text-xs font-sans text-neutral-400 max-w-sm">
                Play matches with this deck on MTGA to earn combat badges, lethal strikes, and lifetime card honors!
              </p>
            </div>
          ) : (
            cleanGroups.map((group) => {
              const meta = getAchievementMeta(group.achievement);
              const topTier = group.cards[0]?.tier;
              const groupAwards = group.cards.reduce((sum, c) => sum + (c.count || 1), 0);

              return (
                <div
                  key={group.achievement}
                  className="border border-white/10 bg-black/40 p-3.5 space-y-3"
                >
                  {/* Achievement Group Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <h4 className="font-display font-bold uppercase tracking-wide text-xs text-white">
                      {meta.title}
                    </h4>
                    <span className="text-[10.5px] font-mono font-bold text-neutral-400 tabular-nums">
                      {groupAwards === 1 ? '1 Award' : `${groupAwards} Awards`}
                    </span>
                  </div>

                  {/* Body with Badge on Left, Cards on Right */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4 pt-1">
                    {/* Left: Badge Icon Showcase */}
                    <div className="shrink-0 flex items-center justify-center p-2 w-24 min-h-[80px]">
                      <AchievementBadge
                        title={group.achievement}
                        tier={topTier}
                        count={groupAwards}
                        size="2xl"
                        showTitle={false}
                        showCount={false}
                      />
                    </div>

                    {/* Right: Grid of cards that earned this achievement */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 w-full min-w-0">
                      {group.cards.map((card: any) => (
                        <button
                          key={`${card.grp_id}-${card.card_name}`}
                          onClick={() => onShowCard && onShowCard({ name: card.card_name, grp_id: card.grp_id }, false)}
                          className="flex items-center gap-2.5 p-1.5 border border-white/10 bg-neutral-900/50 hover:bg-white/5 transition-colors text-left group overflow-hidden cursor-pointer"
                          title="Click to view card details"
                        >
                          <div className="w-9 h-9 overflow-hidden shrink-0 border border-white/10 bg-neutral-900">
                            <CardImage
                              name={card.card_name}
                              version="art_crop"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="font-sans font-bold text-xs truncate flex-1 min-w-0 text-neutral-200 group-hover:text-white group-hover:underline">
                            {card.card_name}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.2 border border-white/10 bg-black/50 text-neutral-300 tabular-nums">
                            {card.count > 1 ? `×${card.count}` : '1×'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
