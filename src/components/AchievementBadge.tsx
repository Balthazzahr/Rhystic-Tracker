import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getAchievementMeta,
  getBadgeSvgUrl,
  getTierFromCount,
  extractTierFromTitle,
  cleanAchievementTitle,
  AchievementTier,
} from '../utils/achievementBadges';

interface AchievementBadgeProps {
  title: string;
  count?: number;
  tier?: AchievementTier;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'hero';
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
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placeBelow: boolean } | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  const meta = getAchievementMeta(title);
  const explicitTier = extractTierFromTitle(title);
  const activeTier = overrideTier || explicitTier || getTierFromCount(count);
  const displayTitle = cleanAchievementTitle(title) || meta.title;
  const svgUrl = getBadgeSvgUrl(meta.id, activeTier);

  // Tier styling parameters & gradients for MTG Legendary frame
  const tierConfig = {
    bronze: {
      outerBorder: '#B45309',
      innerBg: 'from-amber-950/80 via-[#1c1208]/90 to-amber-950/80',
      crownGradient: 'from-amber-700 via-amber-500 to-amber-800',
      textGlow: 'text-amber-200',
      countBg: 'bg-black/70 border-amber-600/50 text-amber-300',
      label: 'Bronze Tier',
      tagBg: 'bg-amber-900/40 text-amber-400 border-amber-700/50',
    },
    silver: {
      outerBorder: '#94A3B8',
      innerBg: 'from-slate-900/90 via-[#0f172a]/95 to-slate-900/90',
      crownGradient: 'from-slate-400 via-slate-200 to-slate-500',
      textGlow: 'text-slate-100',
      countBg: 'bg-black/70 border-slate-400/50 text-slate-200',
      label: 'Silver Tier',
      tagBg: 'bg-slate-800 text-slate-200 border-slate-600',
    },
    gold: {
      outerBorder: '#F59E0B',
      innerBg: 'from-[#2e1d05]/95 via-[#1a1103]/95 to-[#2e1d05]/95',
      crownGradient: 'from-yellow-400 via-amber-300 to-yellow-600',
      textGlow: 'text-amber-300',
      countBg: 'bg-black/70 border-amber-400/60 text-amber-300',
      label: 'Gold Tier (Mastered)',
      tagBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    },
  }[activeTier];

  // Sizing definitions
  const sizeMap = {
    sm: {
      icon: 'w-4 h-4',
      text: 'text-[11px] font-display font-bold tracking-wider',
      count: 'text-[9px] px-1 py-0.1',
      padding: 'px-2.5 py-1',
      crownHeight: 4,
    },
    md: {
      icon: 'w-5 h-5',
      text: 'text-xs font-display font-bold tracking-wider',
      count: 'text-[10px] font-mono px-1.5 py-0.2',
      padding: 'px-3 py-1.5',
      crownHeight: 5,
    },
    lg: {
      icon: 'w-7 h-7',
      text: 'text-sm font-display font-bold tracking-wider',
      count: 'text-xs font-mono px-2 py-0.5',
      padding: 'px-4 py-2',
      crownHeight: 6,
    },
    xl: {
      icon: 'w-14 h-14',
      text: 'text-base font-display font-bold tracking-wider',
      count: 'text-xs font-mono px-2.5 py-1',
      padding: 'px-5 py-2.5',
      crownHeight: 8,
    },
    '2xl': {
      icon: 'w-20 h-20',
      text: 'text-lg font-display font-bold tracking-wider',
      count: 'text-sm font-mono px-3 py-1',
      padding: 'px-6 py-3',
      crownHeight: 10,
    },
    '3xl': {
      icon: 'w-28 h-28',
      text: 'text-xl font-display font-bold tracking-wider',
      count: 'text-base font-mono px-3.5 py-1',
      padding: 'px-7 py-3.5',
      crownHeight: 12,
    },
    hero: {
      icon: 'w-36 h-36',
      text: 'text-2xl font-display font-bold tracking-wider',
      count: 'text-lg font-mono px-4 py-1.5',
      padding: 'px-8 py-4',
      crownHeight: 14,
    },
  }[size];

  const handleMouseEnter = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      const placeBelow = rect.top < 180;
      setTooltipPos({
        top: placeBelow ? rect.bottom + 8 : rect.top - 8,
        left: Math.max(160, Math.min(window.innerWidth - 160, rect.left + rect.width / 2)),
        placeBelow,
      });
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const isStandaloneLarge = !showTitle && !showCount;

  return (
    <>
      <div
        ref={badgeRef}
        className={`relative inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      >
        {isStandaloneLarge ? (
          <div className={`flex items-center justify-center transition-all ${className}`}>
            {svgUrl && (
              <div className={`shrink-0 flex items-center justify-center ${sizeMap.icon}`}>
                <img src={svgUrl} alt={displayTitle} className="w-full h-full object-contain drop-shadow-md" />
              </div>
            )}
          </div>
        ) : (
          /* Sharp MTG Card Title Bar Frame */
          <div
            className={`relative inline-flex items-center select-none transition-all group ${
              onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
            }`}
          >
            <div
              className={`relative inline-flex items-center gap-2 border bg-gradient-to-r ${tierConfig.innerBg} ${sizeMap.padding} shadow-md rounded-none`}
              style={{
                borderColor: tierConfig.outerBorder,
              }}
            >
              {/* SVG Badge Emblem */}
              {svgUrl && (
                <div className={`shrink-0 flex items-center justify-center ${sizeMap.icon}`}>
                  <img
                    src={svgUrl}
                    alt={displayTitle}
                    className="w-full h-full object-contain drop-shadow"
                  />
                </div>
              )}

              {/* Title */}
              {showTitle && (
                <span
                  className={`${sizeMap.text} ${tierConfig.textGlow} drop-shadow-sm uppercase truncate font-semibold`}
                >
                  {displayTitle}
                </span>
              )}

              {/* Multiplier Sub-Pill */}
              {showCount && count > 1 && (
                <span
                  className={`rounded-none border font-bold font-mono ${sizeMap.count} ${tierConfig.countBg}`}
                >
                  ×{count}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top-Layer Portaled Tooltip */}
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
              <span className="text-sm font-bold font-display text-white tracking-wide">
                {meta.title}
              </span>
            </div>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${tierConfig.tagBg}`}>
              {tierConfig.label}
            </span>
          </div>

          {/* Description Body */}
          <p className="rt-narrative-sm text-slate-300">
            {meta.tierDescriptions?.[activeTier] || meta.description}
          </p>

          {/* Flavor Text Quote */}
          {meta.flavorQuote && (
            <div className="pt-2.5 border-t border-slate-800/80 space-y-1">
              <p className="text-[13px] font-plantin italic text-slate-200 leading-relaxed">
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
            <span className="text-[9px] opacity-75 uppercase">{tierConfig.label}</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
