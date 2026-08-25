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
  palette: any;
  onShowCard?: (card: { name: string; grp_id?: number }, isCommander?: boolean) => void;
}

export const DeckAchievementsModal: React.FC<DeckAchievementsModalProps> = ({
  isOpen,
  onClose,
  deckName,
  groupedAchievements = [],
  palette,
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

  const totalHonors = groupedAchievements.reduce((sum, g) => sum + g.total_awards, 0);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-black/75 backdrop-blur-xl animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{ backgroundColor: palette?.surface || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-5 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: palette?.border }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner"
              style={{ backgroundColor: `${palette?.accent || '#FACC15'}1a`, borderColor: `${palette?.accent || '#FACC15'}44` }}
            >
              <Trophy className="w-5 h-5" style={{ color: palette?.accent || '#FACC15' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                  Card Achievements
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {totalHonors} Total
                </span>
              </div>
              <p className="text-xs font-mono opacity-60 truncate max-w-[450px]">
                {deckName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5 transition-opacity"
            style={{ borderColor: palette?.border }}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {groupedAchievements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500">
                <Award className="w-8 h-8 opacity-40" />
              </div>
              <p className="text-base font-bold font-outfit" style={{ color: palette?.text }}>
                No Card Achievements Earned Yet
              </p>
              <p className="text-xs font-mono opacity-50 max-w-sm">
                Play matches with this deck on MTGA to earn combat badges, lethal strikes, and lifetime card honors!
              </p>
            </div>
          ) : (
            groupedAchievements.map((group) => {
              const meta = getAchievementMeta(group.achievement);
              const topTier = group.cards[0]?.tier;
              return (
                <div
                  key={group.achievement}
                  className="rounded-2xl border p-4 space-y-3 transition-colors"
                  style={{ backgroundColor: `${palette?.mantle || '#0b0f17'}88`, borderColor: `${palette?.border}88` }}
                >
                  {/* Achievement Group Header */}
                  <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: `${palette?.border}55` }}>
                    <h4 className="text-base font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                      {meta.title}
                    </h4>
                    <span className="text-[11px] font-mono font-bold opacity-60">
                      {group.total_awards === 1 ? '1 Card Award' : `${group.total_awards} Card Awards`}
                    </span>
                  </div>

                  {/* Body with Badge on Left, Cards on Right */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4 pt-1">
                    {/* Left: Large Badge Icon Showcase */}
                    <div className="shrink-0 flex items-center justify-center p-2 w-28 min-h-[90px] group-hover:scale-105 transition-transform">
                      <AchievementBadge
                        title={group.achievement}
                        tier={topTier}
                        count={group.total_awards}
                        size="2xl"
                        showTitle={false}
                        showCount={false}
                      />
                    </div>

                    {/* Right: Grid of cards that earned this achievement */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 w-full min-w-0">
                      {group.cards.map((card: any) => (
                        <button
                          key={`${card.grp_id}-${card.card_name}`}
                          onClick={() => onShowCard && onShowCard({ name: card.card_name, grp_id: card.grp_id }, false)}
                          className="flex items-center gap-3 p-2 rounded-xl border bg-black/25 hover:bg-white/5 transition-all text-left group overflow-hidden"
                          style={{ borderColor: `${palette?.border}66` }}
                          title="Click to view card details"
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-slate-900">
                            <CardImage
                              name={card.card_name}
                              version="art_crop"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span
                            className="font-bold text-xs truncate flex-1 min-w-0 transition-colors group-hover:underline"
                            style={{ color: palette?.text }}
                          >
                            {card.card_name}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
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
