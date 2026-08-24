import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAchievementMeta, getBadgeSvgUrl, getTierFromCount, extractTierFromTitle, cleanAchievementTitle, AchievementTier } from '../utils/achievementBadges';

interface AchievementBadgeProps {
  title: string;
  count?: number;
  tier?: AchievementTier;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showTitle?: boolean;
  showCount?: boolean;
  showTooltip?: boolean;
  className?: string;
  onClick?: () => void;
}

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  title,
  count = 1,
  tier: overrideTier,
  size = 'md',
  showTitle = true,
  showCount = true,
  showTooltip = true,
  className = '',
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placeBelow: boolean } | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  const meta = getAchievementMeta(title);
  const explicitTier = extractTierFromTitle(title);
  const activeTier = overrideTier || explicitTier || getTierFromCount(count);
  const displayTitle = cleanAchievementTitle(title) || meta.title;
  const svgUrl = getBadgeSvgUrl(meta.id, activeTier);

  // Styling maps based on tier
  const tierStyles = {
    bronze: {
      pillBg: 'bg-amber-950/30 hover:bg-amber-950/50 border-amber-800/50 text-amber-200',
      tagBg: 'bg-amber-900/40 text-amber-400 border-amber-700/50',
      countBg: 'bg-black/60 border-amber-700/40 text-amber-300',
      label: 'Bronze Tier',
      nextGoal: count < 3 ? `Next Tier: 3× (Silver)` : 'Max Tier'
    },
    silver: {
      pillBg: 'bg-slate-800/70 hover:bg-slate-800 border-slate-600 text-slate-100',
      tagBg: 'bg-slate-800 text-slate-200 border-slate-600',
      countBg: 'bg-black/60 border-slate-500/40 text-slate-200',
      label: 'Silver Tier',
      nextGoal: count < 5 ? `Next Tier: 5× (Gold)` : 'Max Tier'
    },
    gold: {
      pillBg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/40 text-amber-300',
      tagBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      countBg: 'bg-black/60 border-amber-400/40 text-amber-300',
      label: 'Gold Tier (Mastered)',
      nextGoal: 'Mastered Tier'
    }
  }[activeTier];

  // Sizing definitions
  const sizeMap = {
    sm: {
      pill: 'px-2 py-0.5 text-[11px] gap-1.5 rounded-lg',
      icon: 'w-4 h-4',
      count: 'text-[9px] px-1 py-0.1',
      title: 'text-[11px] font-bold font-outfit'
    },
    md: {
      pill: 'px-2.5 py-1 text-xs gap-2 rounded-xl',
      icon: 'w-5 h-5',
      count: 'text-[10px] font-mono px-1.5 py-0.2',
      title: 'text-xs font-bold font-outfit tracking-wide'
    },
    lg: {
      pill: 'px-3.5 py-1.5 text-sm gap-2.5 rounded-xl',
      icon: 'w-8 h-8',
      count: 'text-xs font-mono px-2 py-0.5',
      title: 'text-sm font-extrabold font-outfit tracking-wide'
    },
    xl: {
      pill: 'p-2 text-base gap-3 rounded-2xl',
      icon: 'w-16 h-16',
      count: 'text-xs font-mono px-2.5 py-1',
      title: 'text-base font-extrabold font-outfit tracking-wide'
    },
    '2xl': {
      pill: 'p-3 text-lg gap-3.5 rounded-3xl',
      icon: 'w-24 h-24',
      count: 'text-sm font-mono px-3 py-1',
      title: 'text-lg font-black font-outfit tracking-wide'
    }
  }[size];

  const handleMouseEnter = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      const placeBelow = rect.top < 180;
      setTooltipPos({
        top: placeBelow ? rect.bottom + 8 : rect.top - 8,
        left: Math.max(160, Math.min(window.innerWidth - 160, rect.left + rect.width / 2)),
        placeBelow
      });
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const isStandaloneLarge = !showTitle && !showCount && (size === 'xl' || size === '2xl' || size === 'lg');

  return (
    <>
      <div 
        ref={badgeRef}
        className={`relative inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          onClick={onClick}
          className={
            isStandaloneLarge
              ? `inline-flex items-center justify-center cursor-pointer select-none ${onClick ? 'active:scale-95' : ''}`
              : `inline-flex items-center border transition-colors duration-150 cursor-pointer shadow-sm select-none ${(!showTitle && !showCount) ? 'p-1 rounded-lg' : sizeMap.pill} ${tierStyles.pillBg} ${onClick ? 'active:scale-95' : ''}`
          }
        >
          {/* SVG Emblem */}
          {svgUrl && (
            <div className={`shrink-0 flex items-center justify-center ${sizeMap.icon}`}>
              <img src={svgUrl} alt={meta.title} className="w-full h-full object-contain" />
            </div>
          )}

          {/* Title */}
          {showTitle && (
            <span className={`${sizeMap.title} truncate`}>{meta.title}</span>
          )}

          {/* Multiplier Sub-Pill */}
          {showCount && count > 1 && (
            <span className={`rounded-full border font-bold font-mono opacity-95 ${sizeMap.count} ${tierStyles.countBg}`}>
              ×{count}
            </span>
          )}
        </div>
      </div>

      {/* Top-Layer Portaled Tooltip (Eliminates all modal / scroll container overflow clipping) */}
      {showTooltip && isHovered && tooltipPos && createPortal(
        <div 
          className="fixed z-[99999] pointer-events-none w-72 p-3.5 rounded-xl bg-[#0b0f17]/95 border border-slate-700/90 shadow-2xl space-y-2 text-left animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl"
          style={{
            top: tooltipPos.placeBelow ? `${tooltipPos.top}px` : undefined,
            bottom: !tooltipPos.placeBelow ? `calc(100vh - ${tooltipPos.top}px)` : undefined,
            left: `${tooltipPos.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              {svgUrl && (
                <div className="w-5 h-5 shrink-0">
                  <img src={svgUrl} alt={meta.title} className="w-full h-full object-contain" />
                </div>
              )}
              <span className="text-xs font-black font-outfit text-white tracking-wide">
                {meta.title}
              </span>
            </div>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${tierStyles.tagBg}`}>
              {tierStyles.label}
            </span>
          </div>

          {/* Description Body - Dynamic Objective Description */}
          <p className="text-xs leading-relaxed text-slate-300 font-sans">
            {meta.tierDescriptions?.[activeTier] || meta.description}
          </p>

          {/* Flavor Text Quote (Enlarged and refined) */}
          {meta.flavorQuote && (
            <div className="pt-2.5 border-t border-slate-800/80 space-y-1">
              <p className="text-[13px] italic text-slate-200 font-serif leading-relaxed">
                "{meta.flavorQuote}"
              </p>
              {meta.flavorAttribution && (
                <p className="text-[10px] font-mono font-medium text-slate-400 text-right not-italic">
                  — {meta.flavorAttribution}
                </p>
              )}
            </div>
          )}

          {/* Footer Stats */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="font-semibold text-slate-300">
              {count === 1 ? '1 Match Honor' : `${count} Match Honors`}
            </span>
            <span className="text-[9px] opacity-75 uppercase">{tierStyles.label}</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
