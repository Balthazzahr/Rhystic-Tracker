import React from "react";
import { Trophy, Clock, Coins, Sparkles, Layers, Check } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { useRewardTracks, CountdownTimer, RewardMilestone } from "./questCommon";

export const RewardTracksWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { status, loading } = useRewardTracks();

  const dailyWins = Math.max(0, status?.daily_wins ?? 0);
  const weeklyWins = Math.max(0, status?.weekly_wins ?? 0);
  const dailyMilestones = status?.daily_milestones ?? [];
  const nextDailyReward = status?.next_daily_reward;

  return (
    <WidgetShell
      title="Win Reward Tracks"
      subtitle="Daily & Weekly Continuum"
      icon={<Trophy className="w-3.5 h-3.5 text-amber-400" />}
      isLoading={loading}
    >
      <div className="flex-1 flex flex-col justify-between gap-2.5 min-h-0">
        {/* Daily Win Track Continuum */}
        <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/10 p-2.5 sm:p-3 flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-center justify-between gap-1 shrink-0 pb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-sans font-bold tracking-wider uppercase text-amber-400 truncate">
                Daily Wins
              </span>
              <span className="text-xs font-mono font-bold text-white tabular-nums shrink-0">
                {dailyWins} <span className="text-neutral-500 font-normal text-[10px]">/ 15</span>
              </span>
            </div>

            {status?.daily_reset_timestamp && (
              <div className="flex items-center gap-1 text-[9px] font-mono text-neutral-400 shrink-0">
                <Clock className="w-2.5 h-2.5 text-neutral-400" />
                <CountdownTimer targetIso={status.daily_reset_timestamp} />
              </div>
            )}
          </div>

          {/* 15 Horizontal Milestone Segmented Rail */}
          <div
            className="flex-1 min-h-[22px] max-h-[48px] my-1.5 w-full items-stretch"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
              gap: "2px",
            }}
          >
            {dailyMilestones.map((m) => {
              const isEarned = m.win_number <= dailyWins;
              const isNext = m.win_number === dailyWins + 1;
              const isCard = m.has_card;

              return (
                <div
                  key={`daily-${m.win_number}`}
                  className={`h-full min-h-[20px] border rounded-[2px] flex items-center justify-center transition-all ${
                    isEarned
                      ? isCard
                        ? "bg-gradient-to-t from-purple-600/50 to-purple-500/20 border-purple-400/80 text-purple-200 shadow-[0_0_6px_rgba(168,85,247,0.3)]"
                        : "bg-gradient-to-t from-amber-600/50 to-amber-500/20 border-amber-400/80 text-amber-200 shadow-[0_0_6px_rgba(245,158,11,0.3)]"
                      : isNext
                      ? "border-amber-400 bg-amber-400/20 text-white ring-1 ring-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      : "bg-white/[0.03] border-white/10 text-neutral-500 hover:border-white/20"
                  }`}
                  title={`Win #${m.win_number}: ${
                    m.has_card
                      ? `Uncommon Card (ICR)${m.xp ? ` + ${m.xp} XP` : ""}`
                      : `${m.gold} Gold${m.xp ? ` + ${m.xp} XP` : ""}`
                  }`}
                >
                  {isEarned ? (
                    <Check className="w-3 h-3 text-current stroke-[2.5]" />
                  ) : isNext ? (
                    <span className="text-[8.5px] sm:text-[9.5px] font-mono font-bold leading-none">{m.win_number}</span>
                  ) : isCard ? (
                    <Layers className="w-2.5 h-2.5 text-purple-400/80" />
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-mono opacity-60 leading-none">{m.win_number}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Next Reward Status Footer */}
          <div className="text-[9.5px] font-sans flex items-center justify-between text-neutral-400 pt-1 border-t border-white/5 shrink-0">
            <div className="flex items-center gap-1 truncate">
              {nextDailyReward ? (
                <>
                  <span className="text-neutral-500 text-[8.5px] uppercase tracking-wider">Next:</span>
                  <span className="font-mono text-amber-300 font-medium">
                    {nextDailyReward.has_card ? "Uncommon Card" : `${nextDailyReward.gold}g`}
                    {nextDailyReward.xp > 0 && ` + ${nextDailyReward.xp} XP`}
                  </span>
                </>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                  <Check className="w-2.5 h-2.5" />
                  <span>All 15 Daily Rewards Claimed!</span>
                </span>
              )}
            </div>
            <span className="font-mono text-[8.5px] text-neutral-500 shrink-0 ml-1">
              Max 750g + 6 Cards
            </span>
          </div>
        </div>

        {/* Weekly Win Track Continuum */}
        <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/10 p-2.5 sm:p-3 flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-center justify-between gap-1 shrink-0 pb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-sans font-bold tracking-wider uppercase text-cyan-400 truncate">
                Weekly Mastery
              </span>
              <span className="text-xs font-mono font-bold text-white tabular-nums shrink-0">
                {Math.min(weeklyWins, 15)} <span className="text-neutral-500 font-normal text-[10px]">/ 15</span>
              </span>
            </div>

            {status?.weekly_reset_timestamp && (
              <div className="flex items-center gap-1 text-[9px] font-mono text-neutral-400 shrink-0">
                <Clock className="w-2.5 h-2.5 text-neutral-400" />
                <CountdownTimer targetIso={status.weekly_reset_timestamp} />
              </div>
            )}
          </div>

          {/* 15 Horizontal Milestone Segmented Rail */}
          <div
            className="flex-1 min-h-[22px] max-h-[48px] my-1.5 w-full items-stretch"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
              gap: "2px",
            }}
          >
            {Array.from({ length: 15 }, (_, i) => i + 1).map((winNum) => {
              const isEarned = winNum <= weeklyWins;
              const isNext = winNum === weeklyWins + 1;

              return (
                <div
                  key={`weekly-${winNum}`}
                  className={`h-full min-h-[20px] border rounded-[2px] flex items-center justify-center transition-all ${
                    isEarned
                      ? "bg-gradient-to-t from-cyan-600/50 to-cyan-500/20 border-cyan-400/80 text-cyan-200 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
                      : isNext
                      ? "border-cyan-400 bg-cyan-400/20 text-white ring-1 ring-cyan-400/80 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                      : "bg-white/[0.03] border-white/10 text-neutral-500 hover:border-white/20"
                  }`}
                  title={`Win #${winNum}: 250 Mastery Pass XP`}
                >
                  {isEarned ? (
                    <Check className="w-3 h-3 text-current stroke-[2.5]" />
                  ) : (
                    <span className="text-[8px] sm:text-[9px] font-mono opacity-60 leading-none">{winNum}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Weekly Footer Info */}
          <div className="text-[9.5px] font-sans flex items-center justify-between text-neutral-400 pt-1 border-t border-white/5 shrink-0">
            <span className="text-neutral-500 text-[8.5px]">
              250 XP per win
            </span>
            <span className="font-mono text-[8.5px] text-cyan-400/90 shrink-0 ml-1">
              {(Math.min(weeklyWins, 15) * 250).toLocaleString()} / 3,750 XP (3.75 Lvls)
            </span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
});
