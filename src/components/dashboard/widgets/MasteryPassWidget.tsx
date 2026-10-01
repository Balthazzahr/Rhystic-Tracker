import React, { useRef, useEffect, useState } from "react";
import { Sparkles, Check, ChevronLeft, ChevronRight, Lock, Crown, User, PawPrint, Layers, Coins, Gem, Ticket } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { useMasteryPass } from "./masteryCommon";

export interface RewardItem {
  type: "pack" | "orb" | "mythic" | "rare" | "style" | "avatar" | "pet" | "sleeve" | "draft_token" | "gems" | "gold";
  label: string;
  count?: number;
  description: string;
}

export interface LevelRewards {
  free: RewardItem[];
  premium: RewardItem[];
}

export function getRewardsForLevel(level: number, setCode: string): LevelRewards {
  const free: RewardItem[] = [];
  const premium: RewardItem[] = [];

  // Free Track:
  // Packs at even levels: 2, 4, 6, 8, 10, etc.
  // Mastery Orbs at levels: 5, 11, 17, 23, 29, 35, 41
  if (level === 5 || level === 11 || level === 17 || level === 23 || level === 29 || level === 35 || level === 41) {
    free.push({
      type: "orb",
      label: "Mastery Orb",
      count: 1,
      description: "Spend in the Mastery Tree to unlock card styles and avatars.",
    });
  } else if (level % 2 === 0) {
    free.push({
      type: "pack",
      label: `${setCode.toUpperCase()} Booster Pack`,
      count: 1,
      description: `1 Booster Pack of ${setCode.toUpperCase()}`,
    });
  }

  // Premium Track:
  if (level === 1) {
    premium.push(
      { type: "avatar", label: "Special Avatar", description: "Exclusive Mastery Pass Avatar cosmetic" },
      { type: "pet", label: "Companion Pet", description: "Interactive companion pet on the battlefield" },
      { type: "sleeve", label: "Mastery Card Sleeves", description: "Exquisite themed deck card sleeves" }
    );
  } else if (level === 2) {
    premium.push({
      type: "style",
      label: "Card Style",
      count: 1,
      description: "Parallax cosmetic style",
    });
  } else if (level === 3) {
    premium.push({
      type: "mythic",
      label: "Mythic Rare ICRs",
      count: 3,
      description: "3 Individual Mythic Rare Cards from the active set",
    });
  } else if (level === 4) {
    premium.push({
      type: "style",
      label: "Card Style",
      count: 1,
      description: "Parallax cosmetic style",
    });
  } else if (level === 5) {
    premium.push(
      { type: "orb", label: "Mastery Orb", count: 1, description: "1 Mastery Tree Orb" },
      { type: "style", label: "Card Style", count: 1, description: "Parallax cosmetic style" }
    );
  } else if (level === 6) {
    premium.push(
      { type: "orb", label: "Mastery Orb", count: 1, description: "1 Mastery Tree Orb" },
      { type: "style", label: "Card Style", count: 1, description: "Parallax cosmetic style" }
    );
  } else if (level === 7) {
    premium.push(
      { type: "orb", label: "Mastery Orb", count: 1, description: "1 Mastery Tree Orb" },
      { type: "style", label: "Card Style", count: 1, description: "Parallax cosmetic style" }
    );
  } else if (level === 8) {
    premium.push({
      type: "pack",
      label: "Mythic Booster Pack",
      count: 1,
      description: "Special Mythic Booster Pack (Guaranteed Rare/Mythic)",
    });
  } else if (level === 9 || level === 10) {
    premium.push(
      { type: "orb", label: "Mastery Orb", count: 1, description: "1 Mastery Tree Orb" },
      { type: "style", label: "Card Style", count: 1, description: "Parallax cosmetic style" }
    );
  } else if (level === 15) {
    premium.push({
      type: "draft_token",
      label: "Player Draft Token",
      count: 1,
      description: "Entry token to any Premier Draft or Traditional Draft event",
    });
  } else if (level === 20 || level === 30 || level === 40) {
    premium.push({
      type: "gems",
      label: "400 Gems",
      count: 400,
      description: "Premium currency to use in drafts or store items",
    });
  } else if (level % 10 === 5) {
    premium.push({
      type: "gold",
      label: "1,000 Gold",
      count: 1000,
      description: "1,000 Arena Gold currency",
    });
  } else if (level % 4 === 0) {
    premium.push({
      type: "mythic",
      label: "Mythic Rare ICR",
      count: 1,
      description: "1 Individual Mythic Rare Card",
    });
  } else if (level % 2 === 1) {
    premium.push(
      { type: "orb", label: "Mastery Orb", count: 1, description: "1 Mastery Tree Orb" },
      { type: "style", label: "Card Style", count: 1, description: "Parallax cosmetic style" }
    );
  } else {
    premium.push({
      type: "style",
      label: "Card Style",
      count: 1,
      description: "Parallax cosmetic card style",
    });
  }

  return { free, premium };
}

export function getRewardTheme(item: RewardItem) {
  switch (item.type) {
    case "mythic":
      return {
        bg: "from-orange-600/30 via-red-950/40 to-neutral-950",
        border: "border-orange-500/60 hover:border-orange-400",
        glow: "shadow-[0_0_12px_rgba(249,115,22,0.35)]",
        badgeBg: "bg-orange-500/20 text-orange-300 border-orange-500/50",
        accent: "text-orange-400",
      };
    case "rare":
      return {
        bg: "from-amber-600/30 via-amber-950/40 to-neutral-950",
        border: "border-amber-500/60 hover:border-amber-400",
        glow: "shadow-[0_0_12px_rgba(245,158,11,0.3)]",
        badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/50",
        accent: "text-amber-400",
      };
    case "orb":
      return {
        bg: "from-sky-600/25 via-sky-950/40 to-neutral-950",
        border: "border-sky-500/50 hover:border-sky-400",
        glow: "shadow-[0_0_12px_rgba(56,189,248,0.25)]",
        badgeBg: "bg-sky-500/20 text-sky-300 border-sky-500/50",
        accent: "text-sky-400",
      };
    case "pack":
      return {
        bg: "from-amber-500/20 via-neutral-900/60 to-neutral-950",
        border: "border-amber-500/40 hover:border-amber-300",
        glow: "shadow-[0_0_10px_rgba(245,158,11,0.2)]",
        badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
        accent: "text-amber-300",
      };
    case "draft_token":
      return {
        bg: "from-emerald-600/30 via-emerald-950/40 to-neutral-950",
        border: "border-emerald-500/60 hover:border-emerald-400",
        glow: "shadow-[0_0_12px_rgba(16,185,129,0.3)]",
        badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
        accent: "text-emerald-400",
      };
    case "gems":
      return {
        bg: "from-cyan-600/30 via-cyan-950/40 to-neutral-950",
        border: "border-cyan-500/60 hover:border-cyan-400",
        glow: "shadow-[0_0_12px_rgba(6,182,212,0.3)]",
        badgeBg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/50",
        accent: "text-cyan-400",
      };
    case "gold":
      return {
        bg: "from-yellow-600/30 via-yellow-950/40 to-neutral-950",
        border: "border-yellow-500/60 hover:border-yellow-400",
        glow: "shadow-[0_0_12px_rgba(234,179,8,0.3)]",
        badgeBg: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50",
        accent: "text-yellow-400",
      };
    case "avatar":
    case "pet":
    case "sleeve":
      return {
        bg: "from-purple-600/25 via-purple-950/40 to-neutral-950",
        border: "border-purple-500/50 hover:border-purple-400",
        glow: "shadow-[0_0_10px_rgba(168,85,247,0.25)]",
        badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/40",
        accent: "text-purple-300",
      };
    default:
      return {
        bg: "from-amber-600/20 via-neutral-900/40 to-neutral-950",
        border: "border-white/10 hover:border-amber-400/50",
        glow: "shadow-none",
        badgeBg: "bg-white/10 text-neutral-300 border-white/20",
        accent: "text-amber-300",
      };
  }
}

export const RewardVisual: React.FC<{ item: RewardItem; setCode: string; size?: "sm" | "md" | "lg" }> = ({
  item,
  setCode,
  size = "md",
}) => {
  const cardDims = {
    sm: "w-7 h-9",
    md: "w-9 h-12 sm:w-10 sm:h-14 md:w-11 md:h-16",
    lg: "w-12 h-17 sm:w-14 sm:h-20",
  }[size];

  const orbDims = {
    sm: "w-6 h-6",
    md: "w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11",
    lg: "w-12 h-12 sm:w-14 sm:h-14",
  }[size];

  switch (item.type) {
    case "mythic":
      return (
        <div className="relative flex flex-col items-center justify-center">
          <div className={`${cardDims} rounded-[3px] bg-gradient-to-b from-orange-500 via-red-950 to-neutral-950 border-2 border-orange-500 shadow-[0_0_14px_rgba(249,115,22,0.6)] flex flex-col items-center justify-center relative overflow-hidden transition-transform duration-150 group-hover:scale-105`}>
            <div className="w-[60%] h-[60%] rounded-full bg-gradient-to-b from-orange-400/40 to-black/80 flex items-center justify-center shadow-inner">
              <i className="ms ms-planeswalker text-orange-200 text-sm sm:text-base drop-shadow-[0_0_4px_rgba(249,115,22,0.9)]" />
            </div>
            {item.count && item.count > 1 && (
              <span className="absolute bottom-0.5 font-mono text-[9px] sm:text-[10px] font-black text-white px-1 rounded-sm bg-black/85 shadow">
                {item.count}
              </span>
            )}
          </div>
        </div>
      );
    case "pack":
      return (
        <div className="flex flex-col items-center justify-center">
          <div className={`${cardDims} rounded-[3px] bg-gradient-to-b from-neutral-800 via-neutral-900 to-black border-2 border-amber-500/60 flex flex-col items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.3)] transition-transform duration-150 group-hover:scale-105`}>
            <i className={`ss ss-${setCode.toLowerCase() || "c19"} text-amber-400 text-base sm:text-lg drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]`} />
            <span className="text-[7px] sm:text-[8px] font-sans font-black uppercase text-amber-300 mt-1 leading-none tracking-tight">PACK</span>
          </div>
        </div>
      );
    case "orb":
      return (
        <div className="relative flex items-center justify-center">
          <div className={`${orbDims} rounded-full bg-gradient-to-b from-sky-400 via-sky-700 to-indigo-950 border-2 border-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.7)] flex items-center justify-center animate-pulse transition-transform duration-150 group-hover:scale-105`}>
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.95)]" />
          </div>
        </div>
      );
    case "style":
      return (
        <div className={`${cardDims} rounded-[3px] bg-gradient-to-b from-sky-900/60 via-purple-950/60 to-black border-2 border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.3)] flex flex-col items-center justify-center relative transition-transform duration-150 group-hover:scale-105`}>
          <Sparkles className="w-5 h-5 text-cyan-300 drop-shadow-[0_0_4px_rgba(6,182,212,0.8)]" />
          <span className="text-[7px] sm:text-[8px] font-sans font-bold uppercase text-cyan-300 mt-1 leading-none">STYLE</span>
        </div>
      );
    case "avatar":
      return (
        <div className={`${orbDims} rounded-full bg-purple-500/20 border-2 border-purple-400/70 flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.4)]`}>
          <User className="w-5 h-5 text-purple-200" />
        </div>
      );
    case "pet":
      return (
        <div className={`${orbDims} rounded-full bg-purple-500/20 border-2 border-purple-400/70 flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.4)]`}>
          <PawPrint className="w-5 h-5 text-purple-200" />
        </div>
      );
    case "sleeve":
      return (
        <div className={`${cardDims} rounded-[3px] bg-purple-900/50 border-2 border-purple-400/70 flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.4)]`}>
          <Layers className="w-5 h-5 text-purple-200" />
        </div>
      );
    case "draft_token":
      return (
        <div className={`${orbDims} rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_14px_rgba(16,185,129,0.5)]`}>
          <Ticket className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300" />
        </div>
      );
    case "gems":
      return (
        <div className="flex flex-col items-center justify-center">
          <Gem className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.7)]" />
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-cyan-300 leading-none mt-1">{item.count}</span>
        </div>
      );
    case "gold":
      return (
        <div className="flex flex-col items-center justify-center">
          <Coins className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.7)]" />
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-yellow-300 leading-none mt-1">{item.count}</span>
        </div>
      );
    default:
      return <div className="w-3 h-3 rounded-full bg-white/20" />;
  }
};

import { MasteryLevelModal } from "./MasteryLevelModal";

export const MasteryPassWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { pass, loading } = useMasteryPass();
  const railScrollRef = useRef<HTMLDivElement>(null);
  const [selectedModalLevel, setSelectedModalLevel] = useState<number | null>(null);

  const currentLevel = pass?.current_level ?? 1;
  const currentXp = pass?.current_xp ?? 0;
  const xpPerLevel = pass?.xp_per_level ?? 1000;
  const xpPercent = Math.min(100, Math.round((currentXp / xpPerLevel) * 100));
  const isPremium = pass?.is_premium ?? false;
  const orbs = pass?.orbs ?? 0;
  const passName = pass?.pass_name ?? "Mastery Pass";
  const setCode = pass?.set_code ?? "";
  const claimedLevels = new Set(pass?.claimed_levels ?? []);
  const maxTrackLevel = Math.max(pass?.max_level ?? 44, 44);

  const allLevels: number[] = [];
  for (let l = 1; l <= maxTrackLevel; l++) {
    allLevels.push(l);
  }

  const handleScroll = (direction: "left" | "right") => {
    if (railScrollRef.current) {
      const scrollAmount = 400;
      railScrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    if (railScrollRef.current) {
      const targetElement = document.getElementById(`mastery-level-${currentLevel}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [currentLevel]);

  return (
    <WidgetShell
      title={passName}
      subtitle={isPremium ? "Mastery Pass Unlocked" : "Free Track"}
      icon={<i className={`ss ss-${setCode.toLowerCase()} text-amber-400 text-sm`} />}
      isLoading={loading}
      isEmpty={!pass && !loading}
      emptyMessage="No Mastery Pass progress logged yet."
      headerActions={
        <div className="flex items-center gap-2">
          {/* Spend Orbs Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
            <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-amber-300">
              {orbs} {orbs === 1 ? "Orb" : "Orbs"}
            </span>
          </div>

          {/* Premium Pass Crown Badge */}
          {isPremium ? (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-sans font-bold uppercase tracking-wider">
              <Crown className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">Pass Activated</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 text-neutral-400 text-[10px] font-sans">
              <Lock className="w-2.5 h-2.5 text-neutral-400" />
              <span className="hidden sm:inline">Free Track</span>
            </div>
          )}
        </div>
      }
    >
      <div className="flex-1 flex flex-col justify-between gap-1.5 min-h-0 pt-0.5 relative">
        {/* Header Ribbon: Level Crest & XP Bar */}
        <div className="shrink-0 flex items-center gap-3 bg-gradient-to-r from-amber-950/20 via-neutral-900/40 to-neutral-950/60 border border-white/10 p-2 relative overflow-hidden">
          <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-28 h-28 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />

          {/* Level Crest / Badge */}
          <div
            onClick={() => setSelectedModalLevel(currentLevel)}
            className="relative shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-b from-amber-900/60 via-neutral-900 to-neutral-950 border-2 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer hover:border-amber-400 hover:scale-105 transition-all"
            title="Click to view current level rewards"
          >
            <span className="text-[8px] font-sans font-bold uppercase tracking-widest text-amber-400/80 -mb-0.5">
              LVL
            </span>
            <span className="text-xl font-mono font-black text-amber-300 tracking-tight leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {currentLevel}
            </span>
            <div className="absolute -bottom-1 w-6 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          </div>

          {/* Level Progression & XP Track */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-xs font-sans font-bold uppercase tracking-wider text-white truncate">
                  Level {currentLevel}
                </span>
                <span className="text-[11px] font-sans text-neutral-400 truncate">
                  Progress to Level {currentLevel + 1}
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums font-semibold text-amber-300 shrink-0">
                {currentXp.toLocaleString()} <span className="text-neutral-500 font-normal">/ {xpPerLevel.toLocaleString()} XP</span>
                <span className="text-neutral-400 text-[10px] ml-1.5 font-normal">({xpPercent}%)</span>
              </div>
            </div>

            {/* Glowing XP Progress Bar */}
            <div className="w-full h-2.5 bg-neutral-900/90 border border-white/10 rounded-full overflow-hidden p-0.5 relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 shadow-[0_0_10px_rgba(245,158,11,0.6)] transition-all duration-500 relative"
                style={{ width: `${Math.max(3, xpPercent)}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              </div>
            </div>
          </div>

          {/* Scroll Navigation Arrows */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <button
              onClick={() => handleScroll("left")}
              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-all border border-white/10 hover:border-amber-400/40"
              title="Scroll Left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll("right")}
              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-all border border-white/10 hover:border-amber-400/40"
              title="Scroll Right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dual-Rail Mastery Track Preview with Horizontal Scroll */}
        <div className="flex-1 min-h-0 flex flex-col justify-between bg-black/30 border border-white/10 p-1.5">
          {/* Rails Header Label */}
          <div className="shrink-0 flex items-center justify-between text-[9px] font-sans uppercase font-bold tracking-wider text-neutral-400 pb-1 border-b border-white/5">
            <span className="text-neutral-400">All Levels (1 – {maxTrackLevel}) — Click any level to inspect rewards</span>
            <span className="text-amber-400/90 flex items-center gap-1">
              <Crown className="w-2.5 h-2.5" /> Mastery Reward Track
            </span>
          </div>

          {/* Horizontally Scrollable Track Rail Container */}
          <div
            ref={railScrollRef}
            className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden py-1.5 scrollbar-thin scrollbar-thumb-amber-500/30 scrollbar-track-transparent flex gap-2 items-stretch"
            style={{ scrollBehavior: "smooth" }}
          >
            {allLevels.map((lvl) => {
              const isCurrent = lvl === currentLevel;
              const isClaimed = claimedLevels.has(lvl);
              const isPast = lvl < currentLevel;
              const rewards = getRewardsForLevel(lvl, setCode);

              const primaryFree = rewards.free[0];
              const primaryPrem = rewards.premium[0];
              const premTheme = primaryPrem ? getRewardTheme(primaryPrem) : null;
              const freeTheme = primaryFree ? getRewardTheme(primaryFree) : null;

              return (
                <div
                  key={lvl}
                  id={`mastery-level-${lvl}`}
                  onClick={() => setSelectedModalLevel(lvl)}
                  role="button"
                  tabIndex={0}
                  className={`w-28 sm:w-32 md:w-36 shrink-0 flex flex-col rounded border relative cursor-pointer select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${
                    isCurrent
                      ? "bg-amber-950/30 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] ring-1 ring-amber-400 hover:border-amber-300"
                      : isPast || isClaimed
                      ? "bg-white/[0.02] border-white/10 hover:border-white/30"
                      : "bg-white/[0.01] border-white/5 opacity-90 hover:border-amber-400/40"
                  }`}
                >
                  {/* Current Level Indicator Header Bar */}
                  <div
                    className={`h-6 px-1 flex items-center justify-center shrink-0 border-b ${
                      isCurrent
                        ? "bg-amber-400 text-neutral-950 border-amber-300 font-black shadow-sm"
                        : "bg-white/[0.02] text-neutral-400 border-white/5 font-bold"
                    }`}
                  >
                    <span className="text-[10px] font-mono tracking-tight">
                      {isCurrent ? `★ Level ${lvl}` : `Level ${lvl}`}
                    </span>
                  </div>

                  {/* Free Track Rail (Top Box) */}
                  <div
                    className={`flex-1 min-h-0 flex flex-col items-center justify-center p-1.5 relative transition-colors ${
                      freeTheme
                        ? `bg-gradient-to-b ${freeTheme.bg} ${freeTheme.glow}`
                        : "bg-white/[0.01]"
                    }`}
                  >
                    {isClaimed || (isPast && !isCurrent) ? (
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/60 flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                        <Check className="w-3.5 h-3.5 text-amber-400 stroke-[3]" />
                      </div>
                    ) : rewards.free.length > 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1">
                        <RewardVisual item={rewards.free[0]} setCode={setCode} size="sm" />
                        <span className="text-[9px] font-sans font-semibold text-neutral-200 text-center truncate max-w-[100px] leading-none">
                          {rewards.free[0].label}
                        </span>
                      </div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/10" />
                    )}
                  </div>

                  {/* Premium Track Rail (Bottom Box) */}
                  <div
                    className={`flex-1 min-h-0 flex flex-col items-center justify-center p-1.5 border-t relative transition-colors ${
                      isPremium && premTheme
                        ? `bg-gradient-to-b ${premTheme.bg} ${premTheme.border} ${premTheme.glow}`
                        : isPremium
                        ? "border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-amber-950/20"
                        : "border-white/5 bg-black/40"
                    }`}
                  >
                    {isPremium && (isClaimed || (isPast && !isCurrent)) ? (
                      <div className="w-6 h-6 rounded-full bg-amber-500/30 border border-amber-400 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                        <Check className="w-3.5 h-3.5 text-amber-300 stroke-[3]" />
                      </div>
                    ) : isPremium && rewards.premium.length > 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1">
                        {rewards.premium.length > 1 ? (
                          <div className="flex items-center gap-1 justify-center">
                            {rewards.premium.slice(0, 3).map((item, idx) => (
                              <RewardVisual key={idx} item={item} setCode={setCode} size="sm" />
                            ))}
                          </div>
                        ) : (
                          <RewardVisual item={rewards.premium[0]} setCode={setCode} size="sm" />
                        )}
                        <span
                          className={`text-[9px] font-sans font-bold text-center truncate max-w-[100px] leading-none ${
                            premTheme ? premTheme.accent : "text-amber-300"
                          }`}
                        >
                          {rewards.premium.length > 1
                            ? `${rewards.premium.length} Rewards`
                            : rewards.premium[0].label}
                        </span>
                      </div>
                    ) : (
                      <Lock className="w-3 h-3 text-neutral-600" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Legend */}
          <div className="shrink-0 flex items-center justify-between text-[9px] font-sans text-neutral-400 pt-1">
            <span className="truncate">Earn XP through Daily & Weekly wins and Quests. Click any level to inspect rewards & progress.</span>
            <div className="flex items-center gap-3 shrink-0">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" /> Free
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Mastery Pass
              </span>
            </div>
          </div>
        </div>

        {/* Modal Popup for Level Details */}
        <MasteryLevelModal
          level={selectedModalLevel}
          pass={pass}
          onClose={() => setSelectedModalLevel(null)}
          onSelectLevel={(newLevel) => setSelectedModalLevel(newLevel)}
        />
      </div>
    </WidgetShell>
  );
});
