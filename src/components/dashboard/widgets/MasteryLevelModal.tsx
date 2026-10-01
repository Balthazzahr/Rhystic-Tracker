import React from "react";
import { createPortal } from "react-dom";
import { X, Check, Lock, Crown, ChevronRight, Zap, Gift } from "lucide-react";
import { getRewardsForLevel, getRewardTheme, RewardVisual } from "./MasteryPassWidget";
import { MasteryPassStatus } from "./masteryCommon";

interface MasteryLevelModalProps {
  level: number | null;
  pass: MasteryPassStatus | null;
  onClose: () => void;
  onSelectLevel?: (level: number) => void;
}

export const MasteryLevelModal: React.FC<MasteryLevelModalProps> = ({
  level,
  pass,
  onClose,
  onSelectLevel,
}) => {
  if (level === null) return null;

  const currentLevel = pass?.current_level ?? 1;
  const currentXp = pass?.current_xp ?? 0;
  const xpPerLevel = pass?.xp_per_level ?? 1000;
  const isPremium = pass?.is_premium ?? false;
  const setCode = pass?.set_code ?? "";
  const claimedLevels = new Set(pass?.claimed_levels ?? []);
  const maxLevel = Math.max(pass?.max_level ?? 44, 44);

  const isCurrent = level === currentLevel;
  const isCompleted = level < currentLevel || claimedLevels.has(level);
  const isFuture = level > currentLevel;

  const rewards = getRewardsForLevel(level, setCode);
  const nextRewards = level < maxLevel ? getRewardsForLevel(level + 1, setCode) : null;

  // XP calculations
  let xpRemainingToReach = 0;
  let winsOrQuestsDesc = "";

  if (isCompleted) {
    xpRemainingToReach = 0;
  } else if (isCurrent) {
    xpRemainingToReach = Math.max(0, xpPerLevel - currentXp);
    const questsNeeded = Math.ceil(xpRemainingToReach / 500);
    const winsNeeded = Math.ceil(xpRemainingToReach / 250);
    winsOrQuestsDesc = `~${questsNeeded} daily quest${questsNeeded > 1 ? "s" : ""} or ~${winsNeeded} weekly win${winsNeeded > 1 ? "s" : ""}`;
  } else {
    // future level
    const levelsApart = level - currentLevel;
    xpRemainingToReach = (levelsApart - 1) * xpPerLevel + Math.max(0, xpPerLevel - currentXp);
    const questsNeeded = Math.ceil(xpRemainingToReach / 500);
    const winsNeeded = Math.ceil(xpRemainingToReach / 250);
    winsOrQuestsDesc = `~${questsNeeded} daily quests or ~${winsNeeded} weekly wins`;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-neutral-950 border border-amber-500/40 shadow-[0_0_50px_rgba(0,0,0,0.9)] rounded-lg w-full max-w-lg flex flex-col overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Ribbon */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0 bg-gradient-to-r from-amber-950/40 via-neutral-900 to-neutral-950">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center border font-mono font-black shadow-md ${
                isCurrent
                  ? "bg-amber-500 text-neutral-950 border-amber-300 ring-2 ring-amber-400/50"
                  : isCompleted
                  ? "bg-neutral-800 text-amber-300 border-amber-500/40"
                  : "bg-neutral-900 text-neutral-400 border-white/10"
              }`}
            >
              <span className="text-[8px] uppercase tracking-widest leading-none font-bold opacity-80">LVL</span>
              <span className="text-base leading-tight">{level}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-sans font-black tracking-wide uppercase text-white">
                  Level {level} Rewards
                </h2>
                {isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/50">
                    Active Level
                  </span>
                )}
                {isCompleted && !isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" /> Unlocked
                  </span>
                )}
                {isFuture && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase bg-white/5 text-neutral-400 border border-white/10 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Upcoming
                  </span>
                )}
              </div>
              <p className="text-[11px] font-sans text-neutral-400">
                {pass?.pass_name ?? "Set Mastery Pass"} ({setCode.toUpperCase()})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded border border-white/10 hover:border-white/30 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
          {/* Status & XP Requirement Card */}
          <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-sans">
              <span className="text-neutral-400 font-semibold uppercase tracking-wider text-[10px]">
                XP & Requirement Status
              </span>
              <span className="font-mono font-bold text-amber-300">
                {isCompleted ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Already Completed
                  </span>
                ) : isCurrent ? (
                  `${currentXp.toLocaleString()} / ${xpPerLevel.toLocaleString()} XP (${Math.round(
                    (currentXp / xpPerLevel) * 100
                  )}%)`
                ) : (
                  `${xpRemainingToReach.toLocaleString()} XP needed from now`
                )}
              </span>
            </div>

            {/* Visual Mini Progress */}
            {isCurrent && (
              <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  style={{ width: `${Math.min(100, Math.round((currentXp / xpPerLevel) * 100))}%` }}
                />
              </div>
            )}

            <div className="text-[11px] font-sans text-neutral-300 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {isCompleted
                  ? "Earned by gaining XP in this season."
                  : isCurrent
                  ? `Earn ${xpRemainingToReach.toLocaleString()} more XP to complete this level (${winsOrQuestsDesc}).`
                  : `Requires ${xpRemainingToReach.toLocaleString()} total XP from current progress (${winsOrQuestsDesc}).`}
              </span>
            </div>
          </div>

          {/* Free Track Rewards */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-neutral-400" /> Free Track Rewards
              </span>
              <span className="text-[10px] font-sans text-neutral-500">
                {rewards.free.length > 0 ? `${rewards.free.length} item(s)` : "No reward this level"}
              </span>
            </div>

            {rewards.free.length > 0 ? (
              <div className="flex flex-col gap-2">
                {rewards.free.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-neutral-900/60 border border-white/10 flex items-center gap-3.5 hover:border-white/20 transition-colors"
                  >
                    <div className="shrink-0 flex items-center justify-center">
                      <RewardVisual item={item} setCode={setCode} size="md" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-sans font-bold text-white flex items-center gap-2">
                        <span>{item.label}</span>
                        {item.count && item.count > 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 text-neutral-300">
                            ×{item.count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-sans text-neutral-400 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white/[0.01] border border-dashed border-white/10 text-xs text-neutral-500 text-center font-sans">
                Free rewards alternate on even levels and select milestones.
              </div>
            )}
          </div>

          {/* Premium Mastery Pass Rewards */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" /> Mastery Pass Track
              </span>
              <span
                className={`text-[10px] font-sans font-semibold uppercase px-2 py-0.5 rounded ${
                  isPremium
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-white/5 text-neutral-500 border border-white/10"
                }`}
              >
                {isPremium ? "Unlocked with Pass" : "Requires Pass"}
              </span>
            </div>

            {rewards.premium.length > 0 ? (
              <div className="flex flex-col gap-2">
                {rewards.premium.map((item, idx) => {
                  const th = getRewardTheme(item);
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg bg-gradient-to-r ${th.bg} border ${th.border} flex items-center gap-3.5 shadow-sm transition-all`}
                    >
                      <div className="shrink-0 flex items-center justify-center">
                        <RewardVisual item={item} setCode={setCode} size="md" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-sans font-bold text-white flex items-center gap-2">
                          <span className={th.accent}>{item.label}</span>
                          {item.count && item.count > 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              ×{item.count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-sans text-neutral-300/90 mt-0.5 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white/[0.01] border border-dashed border-white/10 text-xs text-neutral-500 text-center font-sans">
                No specific bonus items listed on this tier.
              </div>
            )}
          </div>

          {/* Up Next Level Preview */}
          {nextRewards && (
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-sans">
              <div className="flex items-center gap-2 text-neutral-400">
                <ChevronRight className="w-4 h-4 text-amber-400" />
                <span>Up next at <strong>Level {level + 1}</strong>:</span>
                <span className="text-neutral-200">
                  {nextRewards.premium[0]?.label || nextRewards.free[0]?.label || "Mastery Reward"}
                </span>
              </div>
              {onSelectLevel && level < maxLevel && (
                <button
                  onClick={() => onSelectLevel(level + 1)}
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/50 text-amber-300 font-semibold text-[11px] transition-colors"
                >
                  View Level {level + 1} →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-neutral-900/60 flex items-center justify-between text-xs font-sans text-neutral-400 shrink-0">
          <div className="flex items-center gap-2">
            {onSelectLevel && level > 1 && (
              <button
                onClick={() => onSelectLevel(level - 1)}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-[11px] transition-colors"
              >
                ← Level {level - 1}
              </button>
            )}
            {onSelectLevel && level < maxLevel && (
              <button
                onClick={() => onSelectLevel(level + 1)}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-[11px] transition-colors"
              >
                Level {level + 1} →
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider transition-colors shadow"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
