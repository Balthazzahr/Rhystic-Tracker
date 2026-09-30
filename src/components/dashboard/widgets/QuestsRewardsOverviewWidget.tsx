import React, { useState } from "react";
import { Target, Trophy, Clock, Coins, Sparkles, Layers, Check, RefreshCw, BarChart2, CheckCircle2 } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { useActiveQuests, useRewardTracks, useCountdown, formatQuestCategory } from "./questCommon";
import { QuestStatisticsModal } from "./QuestStatisticsModal";
import { ManaPip } from "../../ManaPip";

export const QuestsRewardsOverviewWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { data: questsData, loading: questsLoading } = useActiveQuests();
  const { status: tracksStatus, loading: tracksLoading } = useRewardTracks();
  const [modalOpen, setModalOpen] = useState(false);

  const dailyCountdown = useCountdown(tracksStatus?.daily_reset_timestamp);
  const weeklyCountdown = useCountdown(tracksStatus?.weekly_reset_timestamp);

  const quests = questsData?.quests ?? [];
  const canSwap = questsData?.can_swap ?? false;
  const dailyWins = Math.max(0, tracksStatus?.daily_wins ?? 0);
  const weeklyWins = Math.max(0, tracksStatus?.weekly_wins ?? 0);
  const dailyMilestones = tracksStatus?.daily_milestones ?? [];
  const nextDailyReward = tracksStatus?.next_daily_reward;

  const dailyPct = Math.min(100, Math.round((Math.min(dailyWins, 15) / 15) * 100));
  const weeklyPct = Math.min(100, Math.round((Math.min(weeklyWins, 15) / 15) * 100));

  return (
    <>
      <WidgetShell
        title="Quests & Win Rewards"
        subtitle="Complete Player Progression"
        icon={<Target className="w-3.5 h-3.5 text-amber-400" />}
        isLoading={questsLoading || tracksLoading}
        headerActions={
          <div className="flex items-center gap-1.5">
            {canSwap && (
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Reroll Ready</span>
              </span>
            )}
            <button
              onClick={() => setModalOpen(true)}
              className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 hover:border-white/30 text-neutral-300 hover:text-white transition-all flex items-center gap-1"
              title="Open Quest Analytics & Appearance Probabilities"
            >
              <BarChart2 className="w-3 h-3 text-amber-400" />
              <span>Quest Analytics</span>
            </button>
          </div>
        }
      >
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 min-h-0">
          {/* Left Column: Active Daily Quests */}
          <div className="flex-1 min-h-0 flex flex-col justify-between gap-2">
            <div className="text-[11px] font-sans font-bold tracking-wider uppercase text-neutral-300 flex items-center justify-between pb-1 border-b border-white/5 shrink-0">
              <span className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>Active Daily Quests</span>
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                {quests.length} / 3 Active
              </span>
            </div>

            {quests.length === 0 ? (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 text-center bg-white/[0.01] border border-white/5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/90 mb-2" />
                <div className="text-xs sm:text-sm font-sans font-bold uppercase tracking-wider text-neutral-200">
                  All Quests Completed
                </div>
                {dailyCountdown && (
                  <div className="text-xs font-mono text-amber-400/90 mt-1.5">
                    Next quest in {dailyCountdown}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col justify-between gap-2">
                {quests.map((q) => {
                  const pct = Math.min(100, Math.round((q.current_progress / q.goal) * 100));
                  const is750 = q.reward_gold >= 750;

                  return (
                    <div
                      key={q.quest_id}
                      className={`flex-1 min-h-0 bg-white/[0.02] border p-2.5 sm:p-3 flex flex-col justify-between transition-colors ${
                        is750
                          ? "border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.02]"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-display font-bold tracking-wide uppercase text-white truncate">
                              {q.title}
                            </span>
                            {q.colors && q.colors.length > 0 && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                {q.colors.map((c) => (
                                  <ManaPip key={c} symbol={c} size={12} />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] font-sans text-neutral-400 mt-0.5 line-clamp-1">
                            {formatQuestCategory(q.category)} • Goal: {q.goal}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 border ${
                              is750
                                ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold"
                                : "bg-white/[0.04] border-white/10 text-neutral-300"
                            }`}
                          >
                            {q.reward_gold}g
                          </span>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[9px] font-mono text-neutral-400">
                          <span>Progress</span>
                          <span>
                            <strong className="text-white">{q.current_progress}</strong> / {q.goal} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1 w-full bg-neutral-900 border border-white/5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${is750 ? "bg-amber-400" : "bg-cyan-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Daily & Weekly Win Tracks Continuum */}
          <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5">
            {/* Daily Wins */}
            <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/10 p-2.5 sm:p-3 flex flex-col justify-between">
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
                {dailyCountdown && (
                  <div className="flex items-center gap-1 text-[9px] font-mono text-neutral-400 shrink-0">
                    <Clock className="w-2.5 h-2.5 text-neutral-400" />
                    <span>{dailyCountdown}</span>
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
                      key={`d-${m.win_number}`}
                      className={`h-full min-h-[20px] border rounded-[2px] flex items-center justify-center transition-all ${
                        isEarned
                          ? isCard
                            ? "bg-gradient-to-t from-purple-600/50 to-purple-500/20 border-purple-400/80 text-purple-200 shadow-[0_0_6px_rgba(168,85,247,0.3)]"
                            : "bg-gradient-to-t from-amber-600/50 to-amber-500/20 border-amber-400/80 text-amber-200 shadow-[0_0_6px_rgba(245,158,11,0.3)]"
                          : isNext
                          ? "border-amber-400 bg-amber-400/20 text-white ring-1 ring-amber-400/80 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                          : "bg-white/[0.03] border-white/10 text-neutral-500 hover:border-white/20"
                      }`}
                      title={`Win #${m.win_number}: ${m.has_card ? "Uncommon Card (ICR)" : `${m.gold}g`}${m.xp ? ` + ${m.xp} XP` : ""}`}
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

            {/* Weekly Wins */}
            <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/10 p-2.5 sm:p-3 flex flex-col justify-between">
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
                {weeklyCountdown && (
                  <div className="flex items-center gap-1 text-[9px] font-mono text-neutral-400 shrink-0">
                    <Clock className="w-2.5 h-2.5 text-neutral-400" />
                    <span>{weeklyCountdown}</span>
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
                {Array.from({ length: 15 }, (_, i) => i + 1).map((w) => {
                  const isEarned = w <= weeklyWins;
                  const isNext = w === weeklyWins + 1;
                  return (
                    <div
                      key={`w-${w}`}
                      className={`h-full min-h-[20px] border rounded-[2px] flex items-center justify-center transition-all ${
                        isEarned
                          ? "bg-gradient-to-t from-cyan-600/50 to-cyan-500/20 border-cyan-400/80 text-cyan-200 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
                          : isNext
                          ? "border-cyan-400 bg-cyan-400/20 text-white ring-1 ring-cyan-400/80 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                          : "bg-white/[0.03] border-white/10 text-neutral-500 hover:border-white/20"
                      }`}
                      title={`Win #${w}: 250 Mastery Pass XP`}
                    >
                      {isEarned ? (
                        <Check className="w-3 h-3 text-current stroke-[2.5]" />
                      ) : (
                        <span className="text-[8px] sm:text-[9px] font-mono opacity-60 leading-none">{w}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Weekly Footer Info */}
              <div className="text-[9.5px] font-sans flex items-center justify-between text-neutral-400 pt-1 border-t border-white/5 shrink-0">
                <span className="text-neutral-500 text-[8.5px]">250 XP per win</span>
                <span className="font-mono text-[8.5px] text-cyan-400/90 shrink-0 ml-1">
                  {(Math.min(weeklyWins, 15) * 250).toLocaleString()} / 3,750 XP (3.75 Lvls)
                </span>
              </div>
            </div>
          </div>
        </div>
      </WidgetShell>

      <QuestStatisticsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
});
