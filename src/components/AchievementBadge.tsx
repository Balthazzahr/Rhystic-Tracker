import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getAchievementMeta,
  getTierFromCount,
  extractTierFromTitle,
  cleanAchievementTitle,
  getBadgePngUrl,
  getCompositeBadgeUrl,
  hasCompositeBadge,
  AchievementTier,
} from '../utils/achievementBadges';
import { ensureLocalImage, normalizeScryfallSetCode, cleanCollectorNumber, srcCache } from '../utils/cardImageCache';

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

const AchievementShieldArtBadge: React.FC<{
  tier: AchievementTier;
  achievementId?: string;
  artCard?: { name: string; setCode?: string; collectorNumber?: string };
  fallbackTitle?: string;
  className?: string;
}> = ({ tier, achievementId, artCard, className = '' }) => {
  const isComposite = achievementId ? hasCompositeBadge(achievementId) : false;
  const compositeUrl = isComposite && achievementId ? getCompositeBadgeUrl(achievementId, tier) : null;
  const [compositeFailed, setCompositeFailed] = useState(false);

  const normSet = normalizeScryfallSetCode(artCard?.setCode);
  const cleanCn = cleanCollectorNumber(artCard?.collectorNumber);
  const cacheKey = !isComposite || compositeFailed
    ? (artCard ? `art_crop:${artCard.name}${normSet ? `|${normSet}` : ''}${cleanCn ? `|${cleanCn}` : ''}` : '')
    : '';
  const [imgSrc, setImgSrc] = useState<string | null>(() => (cacheKey ? srcCache.get(cacheKey) || null : null));

  useEffect(() => {
    if (isComposite && !compositeFailed) return;
    if (!artCard) return;
    let cancelled = false;
    ensureLocalImage(artCard.name, 'art_crop', {
      setCode: artCard.setCode,
      collectorNumber: artCard.collectorNumber,
    }).then((url) => {
      if (!cancelled && url) setImgSrc(url);
    });
    return () => { cancelled = true; };
  }, [isComposite, compositeFailed, artCard?.name, artCard?.setCode, artCard?.collectorNumber]);

  // If a pre-rendered composite badge exists, render it directly
  if (compositeUrl && !compositeFailed) {
    return (
      <div className={`relative w-full h-full select-none flex items-center justify-center ${className}`}>
        <img
          src={compositeUrl}
          alt={`${achievementId} ${tier} badge`}
          onError={() => setCompositeFailed(true)}
          className="w-full h-full object-contain pointer-events-none drop-shadow-md"
        />
      </div>
    );
  }

  const badgePng = getBadgePngUrl(tier);

  return (
    <div className={`relative w-full h-full select-none flex items-center justify-center ${className}`}>
      {/* Inner Card Art Cropped to Shield Cutout */}
      {imgSrc && (
        <div
          className="absolute inset-0 z-0 overflow-hidden"
          style={{
            clipPath: 'polygon(35.8% 31.2%, 64.3% 31.2%, 64.3% 66.8%, 50.0% 76.9%, 35.8% 66.8%)',
          }}
        >
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
            style={{
              objectPosition: 'center 45%',
            }}
          />
        </div>
      )}

      {/* Frame Badge PNG Overlay */}
      <img
        src={badgePng}
        alt={`${tier} badge`}
        className="relative z-10 w-full h-full object-contain pointer-events-none drop-shadow-md"
      />
    </div>
  );
};

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

  // Tier styling parameters & gradients for MTG Legendary frame
  const tierConfig = {
    iron: {
      outerBorder: '#71717A',
      innerBg: 'from-zinc-900/90 via-[#18181b]/95 to-zinc-900/90',
      textGlow: 'text-zinc-200',
      countBg: 'bg-black/70 border-zinc-500/50 text-zinc-300',
      label: 'Iron Tier',
      tagBg: 'bg-zinc-800/60 text-zinc-300 border-zinc-600/50',
    },
    bronze: {
      outerBorder: '#B45309',
      innerBg: 'from-amber-950/80 via-[#1c1208]/90 to-amber-950/80',
      textGlow: 'text-amber-200',
      countBg: 'bg-black/70 border-amber-600/50 text-amber-300',
      label: 'Bronze Tier',
      tagBg: 'bg-amber-900/40 text-amber-400 border-amber-700/50',
    },
    silver: {
      outerBorder: '#94A3B8',
      innerBg: 'from-slate-900/90 via-[#0f172a]/95 to-slate-900/90',
      textGlow: 'text-slate-100',
      countBg: 'bg-black/70 border-slate-400/50 text-slate-200',
      label: 'Silver Tier',
      tagBg: 'bg-slate-800 text-slate-200 border-slate-600',
    },
    gold: {
      outerBorder: '#F59E0B',
      innerBg: 'from-[#2e1d05]/95 via-[#1a1103]/95 to-[#2e1d05]/95',
      textGlow: 'text-amber-300',
      countBg: 'bg-black/70 border-amber-400/60 text-amber-300',
      label: 'Gold Tier',
      tagBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    },
    platinum: {
      outerBorder: '#4fbbb4',
      innerBg: 'from-[#0d2a2a]/95 via-[#133e3d]/95 to-[#0d2a2a]/95',
      textGlow: 'text-[#4fbbb4]',
      countBg: 'bg-black/70 border-[#4fbbb4]/60 text-[#4fbbb4]',
      label: 'Platinum Tier',
      tagBg: 'bg-[#4fbbb4]/20 text-[#4fbbb4] border-[#4fbbb4]/50',
    },
    legendary: {
      outerBorder: '#FB7185',
      innerBg: 'from-[#3b0a24]/95 via-[#4a1236]/90 to-[#280622]/95',
      textGlow: 'text-rose-200',
      countBg: 'bg-black/70 border-rose-400/60 text-rose-200',
      label: 'Legendary Tier',
      tagBg: 'bg-gradient-to-r from-rose-900/50 via-amber-900/40 to-purple-900/50 text-rose-200 border-rose-400/50',
    },
  }[activeTier];

  // Sizing definitions (w-to-h ratio matched to 765:928 ≈ 1:1.213)
  const sizeMap = {
    sm: {
      icon: 'w-4 h-[19px]',
      text: 'text-[11px] font-display font-bold tracking-wider',
      count: 'text-[9px] px-1 py-0.1',
      padding: 'px-2 py-0.5',
    },
    md: {
      icon: 'w-5 h-6',
      text: 'text-xs font-display font-bold tracking-wider',
      count: 'text-[10px] font-mono px-1.5 py-0.2',
      padding: 'px-2.5 py-1',
    },
    lg: {
      icon: 'w-7 h-[34px]',
      text: 'text-sm font-display font-bold tracking-wider',
      count: 'text-xs font-mono px-2 py-0.5',
      padding: 'px-3.5 py-1.5',
    },
    xl: {
      icon: 'w-12 h-[58px]',
      text: 'text-base font-display font-bold tracking-wider',
      count: 'text-xs font-mono px-2.5 py-1',
      padding: 'px-4 py-2',
    },
    '2xl': {
      icon: 'w-20 h-24',
      text: 'text-lg font-display font-bold tracking-wider',
      count: 'text-sm font-mono px-3 py-1',
      padding: 'px-5 py-2.5',
    },
    '3xl': {
      icon: 'w-28 h-[136px]',
      text: 'text-xl font-display font-bold tracking-wider',
      count: 'text-base font-mono px-3.5 py-1',
      padding: 'px-6 py-3',
    },
    hero: {
      icon: 'w-[195px] h-[236px]',
      text: 'text-2xl font-display font-bold tracking-wider',
      count: 'text-lg font-mono px-4 py-1.5',
      padding: 'px-8 py-4',
    },
  }[size];

  const handleMouseEnter = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      const tooltipEstimatedHeight = 280;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      
      const placeBelow = spaceAbove < tooltipEstimatedHeight || spaceBelow > spaceAbove;
      
      setTooltipPos({
        top: placeBelow ? Math.max(12, rect.bottom + 8) : undefined,
        bottom: !placeBelow ? Math.max(12, window.innerHeight - rect.top + 8) : undefined,
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
        className={`relative ${isStandaloneLarge ? 'w-full h-full flex items-center justify-center' : 'inline-block'} ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      >
        {isStandaloneLarge ? (
          <div className="w-full h-full flex items-center justify-center transition-all">
            <div className={`shrink-0 flex items-center justify-center ${sizeMap.icon}`}>
              <AchievementShieldArtBadge tier={activeTier} achievementId={meta.id} artCard={meta.artCard} fallbackTitle={displayTitle} />
            </div>
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
              {/* Shield Card Art Emblem */}
              <div className={`shrink-0 flex items-center justify-center ${sizeMap.icon}`}>
                <AchievementShieldArtBadge tier={activeTier} achievementId={meta.id} artCard={meta.artCard} fallbackTitle={displayTitle} />
              </div>

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
          className="fixed z-[99999] pointer-events-none w-72 p-3.5 border border-white/20 bg-neutral-950/95 shadow-2xl space-y-2 text-left animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl max-h-[calc(100vh-24px)] overflow-y-auto"
          style={{
            top: tooltipPos.top !== undefined ? `${tooltipPos.top}px` : undefined,
            bottom: tooltipPos.bottom !== undefined ? `${tooltipPos.bottom}px` : undefined,
            left: `${tooltipPos.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-6 shrink-0">
                <AchievementShieldArtBadge tier={activeTier} achievementId={meta.id} artCard={meta.artCard} fallbackTitle={meta.title} />
              </div>
              <span className="text-xs font-bold font-display uppercase text-white tracking-wide">
                {meta.title}
              </span>
            </div>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border uppercase ${tierConfig.tagBg}`}>
              {tierConfig.label}
            </span>
          </div>

          {/* Description Body */}
          <p className="rt-narrative-sm text-neutral-300">
            {meta.tierDescriptions?.[activeTier] || meta.description}
          </p>

          {/* Flavor Text Quote */}
          {meta.flavorQuote && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <p className="text-[12.5px] font-plantin italic text-neutral-300 leading-relaxed">
                "{meta.flavorQuote}"
              </p>
              {meta.flavorAttribution && (
                <p className="text-[10px] font-mono font-medium text-neutral-400 text-right not-italic">
                  — {meta.flavorAttribution}
                </p>
              )}
            </div>
          )}

          {/* Footer Stats */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-neutral-400">
            <span className="font-semibold text-neutral-200">
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
