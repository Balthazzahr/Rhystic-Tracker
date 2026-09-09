import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  getDeckAchievementMeta,
  cleanAchievementTitle,
  AchievementTier,
} from '../utils/achievementBadges';
import { ensureLocalImage, normalizeScryfallSetCode, cleanCollectorNumber, srcCache } from '../utils/cardImageCache';

interface DeckAchievementBadgeProps {
  title: string;
  tier?: AchievementTier;
  count?: number;
  deckName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'hero';
  showTitle?: boolean;
  showCount?: boolean;
  showTooltip?: boolean;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
  '2xl': 'w-24 h-24',
  '3xl': 'w-32 h-32',
  hero: 'w-[210px] h-[185px]',
};

export const DeckAchievementBadge: React.FC<DeckAchievementBadgeProps> = ({
  title,
  tier = 'bronze',
  count,
  deckName,
  size = 'md',
  showTitle = false,
  showCount = false,
  showTooltip = true,
  className = '',
  onClick,
}) => {
  const meta = getDeckAchievementMeta(title);
  const cleanTitle = cleanAchievementTitle(title) || meta.title;
  const artCard = meta.artCard;

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

  // Tooltip Portal State
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!showTooltip) return;
    if (badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect();
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    }
  };

  const handleMouseLeave = () => {
    setTooltipPos(null);
  };

  const tierColors = {
    gold: {
      text: 'text-amber-300',
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/10',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
    },
    silver: {
      text: 'text-slate-200',
      border: 'border-slate-400/40',
      bg: 'bg-slate-400/10',
      glow: 'shadow-[0_0_15px_rgba(203,213,225,0.2)]',
    },
    bronze: {
      text: 'text-orange-400',
      border: 'border-orange-600/40',
      bg: 'bg-orange-600/10',
      glow: 'shadow-[0_0_15px_rgba(234,88,12,0.2)]',
    },
  }[tier];

  return (
    <div
      ref={badgeRef}
      className={`relative inline-flex flex-col items-center justify-center select-none group ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div className={`relative ${SIZE_MAP[size]} flex items-center justify-center shrink-0`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 136 136"
          className="w-full h-full select-none"
        >
          <defs>
            {tier === 'gold' && (
              <>
                <linearGradient id={`grad-main-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFBEB" />
                  <stop offset="20%" stopColor="#FEF08A" />
                  <stop offset="60%" stopColor="#F59E0B" />
                  <stop offset="90%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#78350F" />
                </linearGradient>
                <linearGradient id={`grad-leaf-${uid}`} x1="0%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor="#FEF08A" />
                  <stop offset="50%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#B45309" />
                </linearGradient>
                <linearGradient id={`grad-shade-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#451A03" />
                </linearGradient>
                <radialGradient id={`vignette-${uid}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#000000" stopOpacity="0" />
                  <stop offset="60%" stopColor="#000000" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.75" />
                </radialGradient>
              </>
            )}

            {tier === 'silver' && (
              <>
                <linearGradient id={`grad-main-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="20%" stopColor="#F1F5F9" />
                  <stop offset="60%" stopColor="#94A3B8" />
                  <stop offset="90%" stopColor="#64748B" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>
                <linearGradient id={`grad-leaf-${uid}`} x1="0%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="50%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>
                <linearGradient id={`grad-shade-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#64748B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </linearGradient>
                <radialGradient id={`vignette-${uid}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#000000" stopOpacity="0" />
                  <stop offset="60%" stopColor="#000000" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.8" />
                </radialGradient>
              </>
            )}

            {tier === 'bronze' && (
              <>
                <linearGradient id={`grad-main-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFEDD5" />
                  <stop offset="20%" stopColor="#FDBA74" />
                  <stop offset="60%" stopColor="#EA580C" />
                  <stop offset="90%" stopColor="#C2410C" />
                  <stop offset="100%" stopColor="#431407" />
                </linearGradient>
                <linearGradient id={`grad-leaf-${uid}`} x1="0%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor="#FDBA74" />
                  <stop offset="50%" stopColor="#EA580C" />
                  <stop offset="100%" stopColor="#9A3412" />
                </linearGradient>
                <linearGradient id={`grad-shade-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#C2410C" />
                  <stop offset="100%" stopColor="#2A0B04" />
                </linearGradient>
                <radialGradient id={`vignette-${uid}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#000000" stopOpacity="0" />
                  <stop offset="60%" stopColor="#000000" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
                </radialGradient>
              </>
            )}

            <filter id={`shadow-${uid}`} x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.65" />
            </filter>
            {/* Circular Art Aperture Clip (center 68, 69, r=32) */}
            <clipPath id={`circleArtClip-${uid}`}>
              <circle cx="68" cy="69" r="32" />
            </clipPath>
          </defs>

          {/* 1. Background drop shadow group for wreath & base */}
          <g filter={`url(#shadow-${uid})`}>
            {/* Laurel Leaves (rising to 65% height, y=62) */}
            {/* Left Laurel Wreath Branch */}
            <path d="M 52,106 C 44,111 36,110 32,103 C 35,97 45,99 50,102 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 44,103 C 34,102 26,95 27,88 C 33,86 40,93 44,97 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 38,92 C 28,92 19,83 20,74 C 28,73 35,80 37,86 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 33,78 C 22,76 16,66 18,58 C 26,59 31,69 34,74 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 32,65 C 23,61 20,51 25,45 C 31,48 33,57 34,61 Z" fill={`url(#grad-leaf-${uid})`} />

            {/* Right Laurel Wreath Branch */}
            <path d="M 84,106 C 92,111 100,110 104,103 C 101,97 91,99 86,102 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 92,103 C 102,102 110,95 109,88 C 103,86 96,93 92,97 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 98,92 C 108,92 117,83 116,74 C 108,73 101,80 99,86 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 103,78 C 114,76 120,66 118,58 C 110,59 105,69 102,74 Z" fill={`url(#grad-leaf-${uid})`} />
            <path d="M 104,65 C 113,61 116,51 111,45 C 105,48 103,57 102,61 Z" fill={`url(#grad-leaf-${uid})`} />
          </g>

          {/* 2. Underlying Art Image (clipped to circle window) */}
          <g clipPath={`url(#circleArtClip-${uid})`}>
            {imgSrc ? (
              <image href={imgSrc} x="34" y="35" width="68" height="68" preserveAspectRatio="xMidYMid slice" />
            ) : (
              <rect x="34" y="35" width="68" height="68" fill="#151d2f" />
            )}
            {/* Vignette Overlay */}
            <circle cx="68" cy="69" r="32" fill={`url(#vignette-${uid})`} />
          </g>

          {/* 3. Circular Beveled Medallion Frame */}
          {/* Outer Border Ring */}
          <circle cx="68" cy="69" r="40" fill="none" stroke={`url(#grad-main-${uid})`} strokeWidth="4" />
          {/* Primary Heavy Bezel Ring (covers image edge completely: inner r=31.5, outer r=38.5) */}
          <circle cx="68" cy="69" r="35" fill="none" stroke={`url(#grad-main-${uid})`} strokeWidth="7" />
          {/* Inner Inset Rim (overlaps the aperture edge to ensure 100% clean occlusion) */}
          <circle cx="68" cy="69" r="32" fill="none" stroke={`url(#grad-shade-${uid})`} strokeWidth="1.8" opacity="0.9" />

          {/* 4. Medallion Crown (Apex Topper) */}
          <g filter={`url(#shadow-${uid})`}>
            {/* Crown Base Rim */}
            <path d="M 52,36 Q 68,34 84,36 L 83,38.5 Q 68,36.5 53,38.5 Z" fill={`url(#grad-main-${uid})`} />
            {/* Crown Spikes / Facets */}
            <polygon points="53,36 50,29 57,34" fill={`url(#grad-main-${uid})`} />
            <polygon points="57,34 60,26 64,34" fill={`url(#grad-main-${uid})`} />
            <polygon points="64,34 68,24 72,34" fill={`url(#grad-main-${uid})`} />
            <polygon points="72,34 76,26 79,34" fill={`url(#grad-main-${uid})`} />
            <polygon points="79,34 86,29 83,36" fill={`url(#grad-main-${uid})`} />
            {/* Center Crown Jewel / Tip */}
            <circle cx="68" cy="23.5" r="1.5" fill="#FFFFFF" opacity="0.9" />
            <circle cx="60" cy="25.5" r="1.2" fill="#FFFFFF" opacity="0.8" />
            <circle cx="76" cy="25.5" r="1.2" fill="#FFFFFF" opacity="0.8" />
          </g>

          {/* 5. Bottom Clasp / Ribbon Node */}
          <g filter={`url(#shadow-${uid})`}>
            <ellipse cx="68" cy="111" rx="9" ry="5.5" fill={`url(#grad-main-${uid})`} />
            <ellipse cx="68" cy="111" rx="5" ry="3" fill={`url(#grad-shade-${uid})`} />
            <circle cx="68" cy="111" r="2" fill="#FFFFFF" opacity="0.85" />
          </g>
        </svg>

        {showCount && typeof count === 'number' && count > 1 && (
          <span className="absolute -bottom-1 -right-1 bg-black/90 border border-white/20 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-lg z-10 leading-none">
            {count}
          </span>
        )}
      </div>

      {showTitle && (
        <span className="mt-1 text-[11px] font-sans font-medium text-neutral-300 text-center truncate max-w-[120px]">
          {cleanTitle}
        </span>
      )}

      {/* Floating Tooltip via React Portal */}
      {showTooltip && tooltipPos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className={`z-[9999] pointer-events-none w-64 p-3 bg-neutral-950/95 backdrop-blur-md border ${tierColors.border} ${tierColors.glow} shadow-2xl rounded-none text-left animate-fade-in`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
            <span className={`text-xs font-display font-bold uppercase tracking-wide ${tierColors.text}`}>
              {cleanTitle}
            </span>
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 border ${tierColors.border} ${tierColors.bg} ${tierColors.text} uppercase tracking-wider rounded-none`}>
              {tier}
            </span>
          </div>

          <p className="text-xs text-neutral-200 leading-relaxed font-sans mb-2">
            {meta.tierDescriptions[tier] || meta.description}
          </p>

          {meta.criteria[tier] && (
            <div className="bg-white/5 border border-white/10 px-2 py-1 mb-2 rounded-none">
              <span className="text-[10px] font-mono text-neutral-400 block uppercase">Requirement</span>
              <span className="text-[11px] font-sans text-neutral-200 font-medium">
                {meta.criteria[tier]}
              </span>
            </div>
          )}

          {deckName && (
            <div className="text-[10px] font-mono text-neutral-400 mb-1">
              Deck: <span className="text-white font-semibold">{deckName}</span>
            </div>
          )}

          {meta.flavorQuote && (
            <div className="border-t border-white/10 pt-1.5 mt-1.5">
              <p className="text-[11px] font-serif italic text-neutral-400 leading-tight">
                "{meta.flavorQuote}"
              </p>
              {meta.flavorAttribution && (
                <p className="text-[9.5px] font-sans text-neutral-400 text-right mt-0.5 font-medium">
                  — {meta.flavorAttribution}
                </p>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
