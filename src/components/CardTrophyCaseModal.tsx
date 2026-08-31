import React, { useEffect } from 'react';
import { Trophy, X, Award } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { getAchievementMeta } from '../utils/achievementBadges';

interface CardTrophyCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardName: string;
  titles: Record<string, number>;
  palette: any;
}

export const CardTrophyCaseModal: React.FC<CardTrophyCaseModalProps> = ({
  isOpen,
  onClose,
  cardName,
  titles = {},
  palette,
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

  const entries = Object.entries(titles);
  const totalHonors = entries.reduce((sum, [_, cnt]) => sum + (cnt as number), 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-2xl animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
        style={{ backgroundColor: `${palette?.surface || '#12141A'}E6`, borderColor: palette?.border || '#2A2F3D' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Centered Trophy Header */}
        <div
          className="p-6 border-b flex flex-col items-center justify-center text-center relative shrink-0"
          style={{ borderColor: palette?.border }}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5 transition-opacity"
            style={{ borderColor: palette?.border }}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center border shadow-xl mb-2.5"
            style={{ backgroundColor: `${palette?.accent || '#FACC15'}1a`, borderColor: `${palette?.accent || '#FACC15'}44` }}
          >
            <Trophy className="w-6 h-6" style={{ color: palette?.accent || '#FACC15' }} />
          </div>

          <h3 className="rt-card-title tracking-wide" style={{ color: palette?.text }}>
            {cardName}
          </h3>

          <div className="flex items-center gap-2 mt-1">
            <span className="rt-label opacity-60">Card Trophy Case</span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 tabular-nums">
              {totalHonors} {totalHonors === 1 ? 'Honor' : 'Honors'}
            </span>
          </div>
        </div>

        {/* Content Body: Trophies spreading out from center */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500">
                <Award className="w-8 h-8 opacity-40" />
              </div>
              <p className="rt-section-header" style={{ color: palette?.text }}>
                No Match Honors Earned
              </p>
              <p className="rt-narrative-sm opacity-50 max-w-sm">
                Cast this card in games to earn lethal strikes, massive combat blows, and lifetime achievements.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {entries.map(([rawTitle, count]) => {
                const cleanTitle = rawTitle.replace(/\s*\((Gold|Silver|Bronze)\)/i, '').trim();
                const tierMatch = rawTitle.match(/\((Gold|Silver|Bronze)\)/i);
                const tier = tierMatch ? (tierMatch[1].toLowerCase() as any) : undefined;
                const meta = getAchievementMeta(cleanTitle);

                return (
                  <div
                    key={rawTitle}
                    className="flex flex-col items-center justify-center p-6 rounded-3xl border bg-black/40 hover:bg-black/60 transition-all text-center min-w-[200px] max-w-[230px] space-y-3.5 shadow-2xl group"
                    style={{ borderColor: `${palette?.border}77` }}
                  >
                    {/* Large Badge Emblem with rich hover tooltip - no outline box, large scale */}
                    <div className="w-24 h-24 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <AchievementBadge
                        title={cleanTitle}
                        tier={tier}
                        count={count as number}
                        size="2xl"
                        showTitle={false}
                        showCount={false}
                      />
                    </div>

                    <div className="space-y-1 min-w-0 w-full px-1">
                      <p className="text-sm font-bold font-display truncate tracking-wide" style={{ color: palette?.text }}>
                        {meta.title}
                      </p>
                      <p className="text-[11px] font-mono opacity-60 truncate">
                        {meta.category}
                      </p>
                    </div>

                    <span className="text-[10px] font-mono font-bold px-3 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
                      {(count as number) > 1 ? `Awarded ×${count}` : 'Awarded 1×'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
