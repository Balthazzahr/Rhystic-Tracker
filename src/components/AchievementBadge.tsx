import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  getAchievementMeta,
  getBadgeSvgUrl,
  getTierFromCount,
  extractTierFromTitle,
  cleanAchievementTitle,
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
  artCard?: { name: string; setCode?: string; collectorNumber?: string };
  fallbackTitle?: string;
  className?: string;
}> = ({ tier, artCard, className = '' }) => {
  const normSet = normalizeScryfallSetCode(artCard?.setCode);
  const cleanCn = cleanCollectorNumber(artCard?.collectorNumber);
  const cacheKey = artCard
    ? `art_crop:${artCard.name}${normSet ? `|${normSet}` : ''}${cleanCn ? `|${cleanCn}` : ''}`
    : '';
  const [imgSrc, setImgSrc] = useState<string | null>(() => (cacheKey ? srcCache.get(cacheKey) || null : null));
  const uid = useId().replace(/[:]/g, '_');

  useEffect(() => {
    if (!artCard) return;
    let cancelled = false;
    ensureLocalImage(artCard.name, 'art_crop', {
      setCode: artCard.setCode,
      collectorNumber: artCard.collectorNumber,
    }).then((url) => {
      if (!cancelled && url) setImgSrc(url);
    });
    return () => { cancelled = true; };
  }, [artCard?.name, artCard?.setCode, artCard?.collectorNumber]);

  if (tier === 'gold') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 136 120" className={`w-full h-full drop-shadow-xl select-none ${className}`}>
        <defs>
          <linearGradient id={`goldBevel-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFBEB" />
            <stop offset="25%" stopColor="#FEF08A" />
            <stop offset="65%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#451A03" />
          </linearGradient>
          <linearGradient id={`goldRim-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FEF08A" />
          </linearGradient>
          <linearGradient id={`goldInner-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
          <radialGradient id={`goldField-${uid}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#451A03" />
            <stop offset="60%" stopColor="#1E0B02" />
            <stop offset="100%" stopColor="#080200" />
          </radialGradient>
          <radialGradient id={`artVignette-${uid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
          </radialGradient>
          <filter id={`badgeShadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.5" />
          </filter>
          <clipPath id={`shieldClip-${uid}`}>
            <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" />
          </clipPath>
        </defs>

        {/* Gold Frame with Widened Laurels & Crown */}
        <g filter={`url(#badgeShadow-${uid})`}>
          <polygon points="4,44 22,34 22,52 0,64" fill={`url(#goldBevel-${uid})`} />
          <polygon points="2,64 22,54 22,72 6,82" fill={`url(#goldBevel-${uid})`} />
          <polygon points="132,44 114,34 114,52 136,64" fill={`url(#goldBevel-${uid})`} />
          <polygon points="134,64 114,54 114,72 130,82" fill={`url(#goldBevel-${uid})`} />
        </g>
        <polygon points="50,108 68,119 86,108 68,104" fill={`url(#goldBevel-${uid})`} filter={`url(#badgeShadow-${uid})`} />

        {/* Widened Shield Body Layers */}
        <path d="M 68 4 L 116 20 C 123 48 118 84 68 116 C 18 84 13 48 20 20 Z" fill={`url(#goldBevel-${uid})`} filter={`url(#badgeShadow-${uid})`} />
        <path d="M 68 9 L 110 23 C 116 48 112 79 68 108 C 24 79 20 48 26 23 Z" fill={`url(#goldRim-${uid})`} />
        <path d="M 68 13 L 105 26 C 110 48 106 76 68 103 C 30 76 26 48 31 26 Z" fill={`url(#goldInner-${uid})`} />
        <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill={`url(#goldField-${uid})`} />

        {/* Card Artwork inside the Shield */}
        {imgSrc && (
          <g clipPath={`url(#shieldClip-${uid})`}>
            <image href={imgSrc} x="27" y="16" width="82" height="82" preserveAspectRatio="xMidYMid slice" />
            <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill={`url(#artVignette-${uid})`} />
          </g>
        )}

        <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill="none" stroke={`url(#goldInner-${uid})`} strokeWidth="1.2" />

        {/* Top Crown & Flank Jewels */}
        <polygon points="68,0 74,8 62,8" fill={`url(#goldBevel-${uid})`} />
        <polygon points="68,2 69.5,6 74,7 70,8.5 68,12 66,8.5 62,7 66.5,6" fill="#FFFBEB" />
        <circle cx="28" cy="24" r="2.2" fill="#FFFBEB" stroke="#78350F" strokeWidth="0.8" />
        <circle cx="108" cy="24" r="2.2" fill="#FFFBEB" stroke="#78350F" strokeWidth="0.8" />
      </svg>
    );
  }

  if (tier === 'silver') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 136 120" className={`w-full h-full drop-shadow-xl select-none ${className}`}>
        <defs>
          <linearGradient id={`silverBevel-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="25%" stopColor="#E2E8F0" />
            <stop offset="65%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
          <linearGradient id={`silverRim-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="50%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#F8FAFC" />
          </linearGradient>
          <linearGradient id={`silverInner-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <radialGradient id={`silverField-${uid}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="60%" stopColor="#0F172A" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
          <radialGradient id={`artVignette-${uid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="70%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
          </radialGradient>
          <filter id={`badgeShadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.5" />
          </filter>
          <clipPath id={`shieldClip-${uid}`}>
            <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" />
          </clipPath>
        </defs>

        {/* Silver Frame with Widened Wing Flanges */}
        <polygon points="8,42 22,32 22,62 8,72" fill={`url(#silverBevel-${uid})`} filter={`url(#badgeShadow-${uid})`} />
        <polygon points="128,42 114,32 114,62 128,72" fill={`url(#silverBevel-${uid})`} filter={`url(#badgeShadow-${uid})`} />
        <circle cx="15" cy="52" r="1.8" fill="#FFFFFF" stroke="#475569" strokeWidth="0.6" />
        <circle cx="121" cy="52" r="1.8" fill="#FFFFFF" stroke="#475569" strokeWidth="0.6" />

        {/* Widened Shield Body Layers */}
        <path d="M 68 4 L 116 20 C 123 48 118 84 68 116 C 18 84 13 48 20 20 Z" fill={`url(#silverBevel-${uid})`} filter={`url(#badgeShadow-${uid})`} />
        <path d="M 68 9 L 110 23 C 116 48 112 79 68 108 C 24 79 20 48 26 23 Z" fill={`url(#silverRim-${uid})`} />
        <path d="M 68 13 L 105 26 C 110 48 106 76 68 103 C 30 76 26 48 31 26 Z" fill={`url(#silverInner-${uid})`} />
        <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill={`url(#silverField-${uid})`} />

        {/* Card Artwork inside the Shield */}
        {imgSrc && (
          <g clipPath={`url(#shieldClip-${uid})`}>
            <image href={imgSrc} x="27" y="16" width="82" height="82" preserveAspectRatio="xMidYMid slice" />
            <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill={`url(#artVignette-${uid})`} />
          </g>
        )}

        <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill="none" stroke={`url(#silverInner-${uid})`} strokeWidth="1.2" />
        <circle cx="68" cy="13" r="2" fill="#FFFFFF" stroke="#475569" strokeWidth="0.6" />
      </svg>
    );
  }

  // Bronze Tier
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 136 120" className={`w-full h-full drop-shadow-xl select-none ${className}`}>
      <defs>
        <linearGradient id={`bronzeBevel-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFEDD5" />
          <stop offset="25%" stopColor="#FB923C" />
          <stop offset="65%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#431407" />
        </linearGradient>
        <linearGradient id={`bronzeRim-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#431407" />
          <stop offset="50%" stopColor="#EA580C" />
          <stop offset="100%" stopColor="#FED7AA" />
        </linearGradient>
        <linearGradient id={`bronzeInner-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FED7AA" />
          <stop offset="50%" stopColor="#9A3412" />
          <stop offset="100%" stopColor="#431407" />
        </linearGradient>
        <radialGradient id={`bronzeField-${uid}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#431407" />
          <stop offset="60%" stopColor="#1F0702" />
          <stop offset="100%" stopColor="#080201" />
        </radialGradient>
        <radialGradient id={`artVignette-${uid}`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="70%" stopColor="#000000" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
        </radialGradient>
        <filter id={`badgeShadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <clipPath id={`shieldClip-${uid}`}>
          <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" />
        </clipPath>
      </defs>

      {/* Widened Shield Body Layers */}
      <path d="M 68 4 L 116 20 C 123 48 118 84 68 116 C 18 84 13 48 20 20 Z" fill={`url(#bronzeBevel-${uid})`} filter={`url(#badgeShadow-${uid})`} />
      <path d="M 68 9 L 110 23 C 116 48 112 79 68 108 C 24 79 20 48 26 23 Z" fill={`url(#bronzeRim-${uid})`} />
      <path d="M 68 13 L 105 26 C 110 48 106 76 68 103 C 30 76 26 48 31 26 Z" fill={`url(#bronzeInner-${uid})`} />
      <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill={`url(#bronzeField-${uid})`} />

      {/* Card Artwork inside the Shield */}
      {imgSrc && (
        <g clipPath={`url(#shieldClip-${uid})`}>
          <image href={imgSrc} x="27" y="16" width="82" height="82" preserveAspectRatio="xMidYMid slice" />
          <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill={`url(#artVignette-${uid})`} />
        </g>
      )}

      <path d="M 68 16 L 101 28 C 105 48 101 72 68 98 C 35 72 31 48 35 28 Z" fill="none" stroke={`url(#bronzeInner-${uid})`} strokeWidth="1.2" />
      <circle cx="68" cy="13" r="2" fill="#FFEDD5" />
    </svg>
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

  // Sizing definitions (w-to-h ratio matched to 136:120)
  const sizeMap = {
    sm: {
      icon: 'w-[18px] h-4',
      text: 'text-[11px] font-display font-bold tracking-wider',
      count: 'text-[9px] px-1 py-0.1',
      padding: 'px-2.5 py-1',
      crownHeight: 4,
    },
    md: {
      icon: 'w-[22px] h-5',
      text: 'text-xs font-display font-bold tracking-wider',
      count: 'text-[10px] font-mono px-1.5 py-0.2',
      padding: 'px-3 py-1.5',
      crownHeight: 5,
    },
    lg: {
      icon: 'w-[32px] h-7',
      text: 'text-sm font-display font-bold tracking-wider',
      count: 'text-xs font-mono px-2 py-0.5',
      padding: 'px-4 py-2',
      crownHeight: 6,
    },
    xl: {
      icon: 'w-[64px] h-14',
      text: 'text-base font-display font-bold tracking-wider',
      count: 'text-xs font-mono px-2.5 py-1',
      padding: 'px-5 py-2.5',
      crownHeight: 8,
    },
    '2xl': {
      icon: 'w-[90px] h-20',
      text: 'text-lg font-display font-bold tracking-wider',
      count: 'text-sm font-mono px-3 py-1',
      padding: 'px-6 py-3',
      crownHeight: 10,
    },
    '3xl': {
      icon: 'w-[126px] h-28',
      text: 'text-xl font-display font-bold tracking-wider',
      count: 'text-base font-mono px-3.5 py-1',
      padding: 'px-7 py-3.5',
      crownHeight: 12,
    },
    hero: {
      icon: 'w-[210px] h-[185px]',
      text: 'text-2xl font-display font-bold tracking-wider',
      count: 'text-lg font-mono px-4 py-1.5',
      padding: 'px-8 py-4',
      crownHeight: 14,
    },
  }[size];

  const handleMouseEnter = () => {
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      const tooltipEstimatedHeight = 280;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      
      // If not enough room above (less than 290px), place below unless below is even tighter
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
        className={`relative inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      >
        {isStandaloneLarge ? (
          <div className={`flex items-center justify-center transition-all ${className}`}>
            <div className={`shrink-0 flex items-center justify-center ${sizeMap.icon}`}>
              <AchievementShieldArtBadge tier={activeTier} artCard={meta.artCard} fallbackTitle={displayTitle} />
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
                <AchievementShieldArtBadge tier={activeTier} artCard={meta.artCard} fallbackTitle={displayTitle} />
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
              <div className="w-[22px] h-5 shrink-0">
                <AchievementShieldArtBadge tier={activeTier} artCard={meta.artCard} fallbackTitle={meta.title} />
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
