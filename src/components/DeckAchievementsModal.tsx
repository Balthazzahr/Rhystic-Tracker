import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Award } from 'lucide-react';
import { AchievementBadge } from './AchievementBadge';
import { CardImage } from './CardImage';
import { getAchievementMeta } from '../utils/achievementBadges';

interface DeckAchievementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  deckArtName?: string;
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
  deckArtName,
  groupedAchievements = [],
  palette,
  onShowCard,
}) => {
  const [activeTab, setActiveTab] = useState<'card' | 'deck'>('card');

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

  // Deduplicate cards by card_name in each group so each distinct card is shown once with its highest tier and summed count
  const cleanGroups = useMemo(() => {
    return (groupedAchievements || []).map((g) => {
      const cardMap = new Map<string, { grp_id: number; card_name: string; count: number; tier?: string }>();
      const tierRank: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };

      for (const c of (g.cards || [])) {
        if (!c.card_name || c.card_name.toLowerCase().includes('token')) continue;
        const existing = cardMap.get(c.card_name);
        if (!existing) {
          cardMap.set(c.card_name, { ...c, count: c.count || 1 });
        } else {
          existing.count += (c.count || 1);
          const cTier = (c.tier?.toLowerCase() || 'bronze') as string;
          const exTier = (existing.tier?.toLowerCase() || 'bronze') as string;
          if ((tierRank[cTier] || 1) > (tierRank[exTier] || 1)) {
            existing.tier = c.tier;
          }
        }
      }
      return {
        ...g,
        cards: Array.from(cardMap.values()),
      };
    }).filter((g) => g.cards.length > 0);
  }, [groupedAchievements]);

  const totalHonors = cleanGroups.reduce((sum, g) => sum + g.cards.reduce((cSum, c) => cSum + (c.count || 1), 0), 0);

  // Fallback candidate deck art card name if not explicitly passed
  const effectiveDeckArt = deckArtName || cleanGroups[0]?.cards[0]?.card_name;

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
        className="flex flex-col items-center justify-center max-w-5xl w-full my-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Top Header (No background frame, deck art aligned inline with title) */}
        <div className="w-full flex items-center justify-between px-1 pb-3 relative z-20">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Medium-Sized Deck Art Square with Muted Border */}
            <div className="w-12 h-12 border border-white/20 bg-neutral-950 shadow-[0_8px_20px_rgba(0,0,0,0.85)] overflow-hidden flex items-center justify-center shrink-0">
              {effectiveDeckArt ? (
                <CardImage
                  name={effectiveDeckArt}
                  version="art_crop"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                  <span className="font-display font-bold text-xs uppercase tracking-wider text-neutral-400">
                    {deckName.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap min-w-0">
              <h2 className="text-[28px] font-display font-bold uppercase tracking-[0.14em] text-white drop-shadow-lg truncate">
                {deckName} Achievements
              </h2>
              <span className="text-[12px] font-mono font-bold px-2.5 py-0.5 border border-amber-500/30 bg-amber-500/10 text-amber-300 tabular-nums">
                {totalHonors} {totalHonors === 1 ? 'Honor' : 'Honors Total'}
              </span>
            </div>
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
          {/* Subheader Tab Selector inside window */}
          <div className="px-5 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('card')}
                className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                  activeTab === 'card'
                    ? 'bg-white/10 text-white border-white/30'
                    : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
                }`}
              >
                Card Achievements ({totalHonors})
              </button>
              <button
                onClick={() => setActiveTab('deck')}
                className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer border flex items-center gap-1.5 ${
                  activeTab === 'deck'
                    ? 'bg-white/10 text-white border-white/30'
                    : 'bg-transparent text-neutral-400 border-transparent hover:text-white'
                }`}
              >
                <span>Deck Achievements</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  SOON
                </span>
              </button>
            </div>

            <span className="text-[11px] font-mono text-neutral-400">
              {cleanGroups.length} {cleanGroups.length === 1 ? 'Category' : 'Categories'}
            </span>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
            {activeTab === 'deck' ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                <div className="w-14 h-14 bg-white/[0.02] border border-white/10 flex items-center justify-center text-neutral-500 mx-auto">
                  <span className="ms ms-ability-adventure text-3xl" style={{ color: accentColor }} />
                </div>
                <h4 className="text-base font-display font-bold uppercase tracking-wide text-white">
                  Deck-Level Achievements
                </h4>
                <p className="text-xs font-sans text-neutral-400 max-w-md leading-relaxed">
                  Deck Win Streaks, Comeback King, Archetype Dominance, and Tribal Mastery achievements for <strong className="text-white">{deckName}</strong> are currently in active design.
                </p>
              </div>
            ) : cleanGroups.length === 0 ? (
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
                    className="border border-white/10 bg-black/40 p-3.5 space-y-2.5"
                  >
                    {/* Achievement Group Header with Clickable Deep Link */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAchievement(group.achievement);
                        }}
                        className="font-display font-bold uppercase tracking-wide text-sm text-white hover:text-amber-300 hover:underline cursor-pointer transition-colors text-left"
                        title="Click to view all cards with this achievement"
                      >
                        {meta.title}
                      </button>
                      <span className="text-[10.5px] font-mono font-bold text-neutral-300 tabular-nums">
                        {groupAwards === 1 ? '1 Award' : `${groupAwards} Awards`}
                      </span>
                    </div>

                    {/* Body with Badge on Left, 3 Columns of Cards on Right */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-3 pt-0.5">
                      {/* Left: Badge Icon Showcase (Clickable to open Achievement) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAchievement(group.achievement);
                        }}
                        className="shrink-0 flex items-center justify-center p-1.5 w-24 min-h-[80px] cursor-pointer hover:scale-110 active:scale-95 transition-transform bg-transparent border-0"
                        title="Click to view full achievement drill-down"
                      >
                        <AchievementBadge
                          title={group.achievement}
                          tier={topTier}
                          count={groupAwards}
                          size="2xl"
                          showTitle={false}
                          showCount={false}
                          showTooltip={false}
                        />
                      </button>

                      {/* Right: 3-Column Grid of cards that earned this achievement */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 flex-1 w-full min-w-0">
                        {group.cards.map((card: any) => (
                          <button
                            key={`${card.grp_id}-${card.card_name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose();
                              onShowCard && onShowCard({ name: card.card_name, grp_id: card.grp_id }, false);
                            }}
                            className="flex items-center gap-2 p-1.5 border border-white/10 bg-neutral-900/50 hover:bg-white/10 transition-colors text-left group overflow-hidden cursor-pointer"
                            title="Click to view card details"
                          >
                            <div className="w-8 h-8 overflow-hidden shrink-0 border border-white/10 bg-neutral-900 shadow-sm">
                              <CardImage
                                name={card.card_name}
                                version="art_crop"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                            </div>
                            <span className="font-sans font-bold text-xs truncate flex-1 min-w-0 text-neutral-200 group-hover:text-white group-hover:underline">
                              {card.card_name}
                            </span>
                            <span className="shrink-0 text-[9.5px] font-mono font-bold px-1.5 py-0.2 border border-white/10 bg-black/60 text-neutral-200 tabular-nums">
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
    </div>,
    document.body
  );
};

export default DeckAchievementsModal;

