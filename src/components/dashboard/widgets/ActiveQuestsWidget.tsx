import React, { useState } from "react";
import { Target, CheckCircle2, BarChart2, RefreshCw, Coins } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { useActiveQuests, formatQuestCategory } from "./questCommon";
import { QuestStatisticsModal } from "./QuestStatisticsModal";
import { ManaPip } from "../../ManaPip";

export const ActiveQuestsWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { data, loading, refetch } = useActiveQuests();
  const [modalOpen, setModalOpen] = useState(false);

  const quests = data?.quests ?? [];
  const canSwap = data?.can_swap ?? false;

  return (
    <>
      <WidgetShell
        title="Active Quests"
        subtitle="Daily Objectives"
        icon={<Target className="w-3.5 h-3.5 text-amber-400" />}
        isLoading={loading}
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
              <span>Analytics</span>
            </button>
          </div>
        }
      >
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5">
          {quests.length === 0 ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 text-center bg-white/[0.01] border border-white/5">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/90 mb-2" />
              <div className="text-sm font-sans font-bold uppercase tracking-wider text-neutral-200">
                All Daily Quests Completed
              </div>
              <div className="text-xs font-sans text-neutral-400 mt-0.5">
                New daily quest arrives at reset
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-2">
              {quests.map((q) => {
                const pct = Math.min(100, Math.round((q.current_progress / q.goal) * 100));
                const is750 = q.reward_gold >= 750;

                return (
                  <div
                    key={q.quest_id}
                    className={`flex-1 min-h-0 bg-white/[0.02] border p-3 flex flex-col justify-between transition-colors ${
                      is750
                        ? "border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.02]"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    {/* Top Row: Title, Colors & Rewards */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-display font-bold tracking-wide uppercase text-white truncate">
                            {q.title}
                          </span>
                          {q.colors && q.colors.length > 0 && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              {q.colors.map((c) => (
                                <ManaPip key={c} symbol={c} size={13} />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] font-sans text-neutral-400 mt-0.5 leading-snug">
                          {formatQuestCategory(q.category)} • Goal: {q.goal}
                        </div>
                      </div>

                      {/* Rewards Badge */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 border flex items-center gap-1 ${
                            is750
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold shadow-xs"
                              : "bg-white/[0.04] border-white/10 text-neutral-300 font-medium"
                          }`}
                        >
                          <Coins className="w-2.5 h-2.5 text-amber-400" />
                          <span>{q.reward_gold}g</span>
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                          {q.reward_xp} XP
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar & Counter */}
                    <div className="space-y-1 mt-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-neutral-500 uppercase tracking-wider font-sans text-[9px]">
                          Progress
                        </span>
                        <span className="text-neutral-300 tabular-nums">
                          <strong className="text-white">{q.current_progress}</strong> / {q.goal}
                          <span className="text-neutral-500 ml-1.5">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-900 border border-white/5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            is750 ? "bg-amber-400" : "bg-cyan-500"
                          }`}
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
      </WidgetShell>

      <QuestStatisticsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
});
