import React from "react";

export type WildcardRarity = "common" | "uncommon" | "rare" | "mythic";

interface WildcardLotusCardProps {
  rarity: WildcardRarity;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const WildcardLotusCard: React.FC<WildcardLotusCardProps> = ({
  rarity,
  size = "md",
  className = "",
}) => {
  // MTGA Authentic Wildcard Card dimensions (2.5 : 3.5 aspect ratio)
  const dimensions = {
    sm: { w: 22, h: 30, iconSize: "text-xs" },
    md: { w: 28, h: 38, iconSize: "text-sm" },
    lg: { w: 36, h: 50, iconSize: "text-base" },
  }[size];

  const theme = {
    common: {
      border: "border-slate-400/70",
      bgGradient: "from-slate-500/80 via-neutral-900 to-black",
      innerBorder: "border-slate-400/40",
      iconColor: "text-slate-200",
      glow: "shadow-[0_0_10px_rgba(148,163,184,0.3)]",
      dropGlow: "drop-shadow-[0_0_4px_rgba(203,213,225,0.8)]",
      title: "Common Wildcard",
    },
    uncommon: {
      border: "border-sky-400/80",
      bgGradient: "from-sky-500/80 via-cyan-950 to-black",
      innerBorder: "border-sky-400/40",
      iconColor: "text-sky-200",
      glow: "shadow-[0_0_12px_rgba(56,189,248,0.4)]",
      dropGlow: "drop-shadow-[0_0_4px_rgba(56,189,248,0.9)]",
      title: "Uncommon Wildcard",
    },
    rare: {
      border: "border-amber-400/90",
      bgGradient: "from-amber-500/90 via-amber-950 to-black",
      innerBorder: "border-amber-400/40",
      iconColor: "text-amber-200",
      glow: "shadow-[0_0_14px_rgba(245,158,11,0.5)]",
      dropGlow: "drop-shadow-[0_0_5px_rgba(245,158,11,0.9)]",
      title: "Rare Wildcard",
    },
    mythic: {
      border: "border-orange-500",
      bgGradient: "from-orange-500 via-red-950 to-black",
      innerBorder: "border-orange-400/50",
      iconColor: "text-orange-200",
      glow: "shadow-[0_0_15px_rgba(249,115,22,0.6)]",
      dropGlow: "drop-shadow-[0_0_5px_rgba(249,115,22,0.9)]",
      title: "Mythic Rare Wildcard",
    },
  }[rarity];

  return (
    <div
      className={`relative rounded-[3px] border-2 bg-gradient-to-b flex flex-col items-center justify-center shrink-0 overflow-hidden transition-all duration-200 hover:scale-105 ${theme.border} ${theme.bgGradient} ${theme.glow} ${className}`}
      style={{
        width: `${dimensions.w}px`,
        height: `${dimensions.h}px`,
      }}
      title={theme.title}
    >
      {/* Authentic inner card border frame */}
      <div
        className={`absolute inset-[1.5px] rounded-[1.5px] border ${theme.innerBorder} pointer-events-none`}
      />

      {/* Center oval vignette matching authentic MTG card back oval */}
      <div
        className="w-[72%] h-[72%] rounded-full bg-black/50 border border-white/10 flex items-center justify-center pointer-events-none shadow-inner"
      >
        <i
          className={`ms ms-planeswalker ${theme.iconColor} ${dimensions.iconSize} ${theme.dropGlow} leading-none`}
        />
      </div>
    </div>
  );
};
