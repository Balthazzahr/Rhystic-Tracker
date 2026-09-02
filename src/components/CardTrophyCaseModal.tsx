import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Award } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { getAchievementMeta } from '../utils/achievementBadges';

interface CardTrophyCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardName: string;
  titles: Record<string, number>;
  palette?: any;
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

  const accentColor = palette?.accent || '#EAB308';

  // Group achievements by base title, selecting highest tier and summing awards
  const aggregatedTrophies = useMemo(() => {
    const map = new Map<string, { title: string; highestTier: 'gold' | 'silver' | 'bronze'; totalCount: number }>();
    const tierRank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };

    for (const [rawTitle, count] of Object.entries(titles || {})) {
      const cleanTitle = rawTitle.replace(/\s*\((Gold|Silver|Bronze)\)/i, '').trim();
      const tierMatch = rawTitle.match(/\((Gold|Silver|Bronze)\)/i);
      const tier = (tierMatch ? tierMatch[1].toLowerCase() : 'bronze') as 'gold' | 'silver' | 'bronze';
      const c = typeof count === 'number' ? count : 1;

      const existing = map.get(cleanTitle);
      if (!existing) {
        map.set(cleanTitle, { title: cleanTitle, highestTier: tier, totalCount: c });
      } else {
        existing.totalCount += c;
        if ((tierRank[tier] || 1) > (tierRank[existing.highestTier] || 1)) {
          existing.highestTier = tier;
        }
      }
    }
    return Array.from(map.values());
  }, [titles]);

  const totalHonors = Object.values(titles || {}).reduce((sum, cnt) => sum + (typeof cnt === 'number' ? cnt : 1), 0);

  if (!isOpen) return null;

  const handleOpenAchievement = (achTitle: string) => {
    onClose();
    window.dispatchEvent(
      new CustomEvent('rhystic-open-achievement', {
        detail: { name: achTitle },
      })
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none overflow-y-auto custom-scrollbar"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center justify-center max-w-4xl w-full my-auto relative pt-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Large Laurel Wreath Emblem Floating Over Top-Left Corner */}
        <div className="absolute -left-10 -top-4 w-[110px] h-[110px] z-30 drop-shadow-[0_16px_32px_rgba(0,0,0,0.95)] flex items-center justify-center pointer-events-none">
          <span
            className="ms ms-ability-duels-renowned text-6xl"
            style={{ color: accentColor }}
          />
        </div>

        {/* Floating Top Header (No background frame, generous left padding) */}
        <div className="w-full flex items-center justify-between pl-24 pr-2 pb-3.5 relative z-20">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h2 className="text-[28px] font-display font-bold uppercase tracking-[0.14em] text-white drop-shadow-lg truncate">
              {cardName}
            </h2>
            <span className="text-[12px] font-mono font-bold px-2.5 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-300 tabular-nums">
              {totalHonors} {totalHonors === 1 ? 'Honor' : 'Honors Total'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white border border-white/10 transition-all cursor-pointer shrink-0 ml-4"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Modal Window (Transparent Frosted Glass) */}
        <div className="w-full max-h-[78vh] flex flex-col bg-neutral-950/75 backdrop-blur-md border border-white/20 shadow-2xl overflow-hidden relative z-10">
          {/* Subheader banner inside window */}
          <div className="px-5 py-3 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0">
            <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">
              Card Trophy Cabinet
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              {aggregatedTrophies.length} {aggregatedTrophies.length === 1 ? 'Distinction' : 'Distinctions'}
            </span>
          </div>

          {/* Content Body: 75% Larger Trophies spreading out from center */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            {aggregatedTrophies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2.5">
                <div className="w-12 h-12 bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500">
                  <Award className="w-6 h-6 opacity-40" />
                </div>
                <p className="font-display font-bold uppercase tracking-wider text-sm text-white">
                  No Match Honors Earned
                </p>
                <p className="text-xs font-sans text-neutral-400 max-w-sm">
                  Cast this card in games to earn lethal strikes, massive combat blows, and lifetime achievements.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-5">
                {aggregatedTrophies.map((trophy) => {
                  const meta = getAchievementMeta(trophy.title);

                  return (
                    <div
                      key={trophy.title}
                      onClick={() => handleOpenAchievement(trophy.title)}
                      className="flex flex-col items-center justify-between p-5 border border-white/10 bg-black/40 hover:bg-white/10 hover:border-white/30 hover:scale-[1.04] transition-all text-center min-w-[230px] max-w-[260px] min-h-[260px] space-y-3 shadow-xl group cursor-pointer"
                      title="Click to inspect this achievement and all decorated cards in the library"
                    >
                      {/* 75% Larger Hero Badge Emblem */}
                      <div className="w-[170px] h-[145px] flex items-center justify-center group-hover:scale-110 transition-transform origin-center">
                        <AchievementBadge
                          title={trophy.title}
                          tier={trophy.highestTier}
                          count={trophy.totalCount}
                          size="hero"
                          showTitle={false}
                          showCount={false}
                          showTooltip={false}
                        />
                      </div>

                      <div className="space-y-0.5 min-w-0 w-full px-1">
                        <p className="text-sm font-display font-bold uppercase truncate tracking-wide text-white group-hover:text-amber-300 group-hover:underline">
                          {meta.title}
                        </p>
                        <p className="text-[10.5px] font-mono text-neutral-400 truncate uppercase">
                          {meta.category} · <span className="text-amber-300 font-bold">{trophy.highestTier.toUpperCase()}</span>
                        </p>
                      </div>

                      <span className="text-[11px] font-mono font-bold px-3 py-0.5 border border-white/15 bg-neutral-900 text-neutral-200 tabular-nums">
                        {trophy.totalCount > 1 ? `Awarded ×${trophy.totalCount}` : 'Awarded 1×'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CardTrophyCaseModal;

