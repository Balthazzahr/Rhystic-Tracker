import React, { useEffect, useState } from "react";
import { X, Sparkles, Coins, Zap, Clock, Swords, CheckCircle2, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { QuestStatistics, QuestRerollStats, formatQuestCategory } from "./questCommon";
import { ManaPip } from "../../ManaPip";

interface QuestStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rerollStats?: QuestRerollStats;
}

export const QuestStatisticsModal: React.FC<QuestStatisticsModalProps> = ({ isOpen, onClose, rerollStats }) => {
  const [stats, setStats] = useState<QuestStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await invoke<QuestStatistics>("get_quest_statistics");
        setStats(res);
      } catch (e) {
        console.error("Failed to load quest statistics:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-neutral-950 border border-white/20 shadow-2xl rounded-none w-[94vw] max-w-7xl max-h-[90vh] flex flex-col overflow-hidden text-neutral-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 bg-neutral-900/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="ms ms-counter-gold text-amber-400 text-sm" />
              <h2 className="text-base font-display font-bold tracking-wider uppercase text-white">
                Quest Analytics & Probability
              </h2>
            </div>
            <p className="text-[11px] font-sans text-neutral-400 mt-0.5">
              Historical appearance frequencies, reward payout splits, and completion velocity
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-none border border-white/10 hover:border-white/30 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-neutral-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              <span className="text-xs font-sans uppercase tracking-wider">Analyzing Quest History...</span>
            </div>
          ) : !stats || stats.total_quests_tracked === 0 ? (
            <div className="text-center py-16 text-neutral-400 text-xs font-sans">
              No historical quest data logged yet. Quests will be catalogued as you play in MTGA.
            </div>
          ) : (
            <>
              {/* Top Hero Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white/[0.02] border border-white/10 p-3.5 flex flex-col justify-between">
                  <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400">
                    Total Tracked
                  </div>
                  <div className="text-2xl font-mono font-bold text-white tabular-nums mt-1">
                    {stats.total_quests_tracked}
                  </div>
                  <div className="text-[10px] font-sans text-neutral-500 mt-1">
                    Lifetime logged quests
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-amber-500/20 p-3.5 flex flex-col justify-between">
                  <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-amber-400/90 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-amber-400" />
                    <span>Gold Earned</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-amber-300 tabular-nums mt-1">
                    {stats.total_gold_earned.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-sans text-amber-400/60 mt-1">
                    +{(stats.total_xp_earned).toLocaleString()} Mastery XP
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/10 p-3.5 flex flex-col justify-between">
                  <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>Avg Duration</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-cyan-300 tabular-nums mt-1">
                    {stats.avg_duration_hours !== null && stats.avg_duration_hours !== undefined
                      ? `${stats.avg_duration_hours}h`
                      : "—"}
                  </div>
                  <div className="text-[10px] font-sans text-neutral-500 mt-1">
                    To complete after appearing
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/10 p-3.5 flex flex-col justify-between">
                  <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <Swords className="w-3 h-3 text-emerald-400" />
                    <span>Avg Matches</span>
                  </div>
                  <div className="text-2xl font-mono font-bold text-emerald-300 tabular-nums mt-1">
                    {stats.avg_matches_to_complete !== null && stats.avg_matches_to_complete !== undefined
                      ? `${stats.avg_matches_to_complete}`
                      : "—"}
                  </div>
                  <div className="text-[10px] font-sans text-neutral-500 mt-1">
                    Matches played to finish
                  </div>
                </div>
              </div>

              {/* Reward Distribution & Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 500g vs 750g Split */}
                <div className="bg-white/[0.02] border border-white/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-bold tracking-wider uppercase text-neutral-200 flex items-center gap-1.5">
                      <span className="ms ms-counter-gold text-amber-400 text-xs" />
                      <span>Reward Value Ratio (500g vs 750g)</span>
                    </h3>
                  </div>

                  {/* Dual split progress bar */}
                  <div className="h-4 w-full bg-neutral-900 border border-white/10 flex overflow-hidden">
                    <div
                      className="bg-amber-500/80 transition-all duration-300"
                      style={{ width: `${stats.gold_750_pct}%` }}
                      title={`750 Gold: ${stats.gold_750_count} (${stats.gold_750_pct}%)`}
                    />
                    <div
                      className="bg-amber-900/60 transition-all duration-300"
                      style={{ width: `${stats.gold_500_pct}%` }}
                      title={`500 Gold: ${stats.gold_500_count} (${stats.gold_500_pct}%)`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="bg-amber-500/10 border border-amber-500/30 p-2">
                      <div className="text-[10px] font-sans uppercase text-amber-400 font-semibold flex items-center justify-between">
                        <span>750 Gold Quests</span>
                        <span className="tabular-nums">{stats.gold_750_pct}%</span>
                      </div>
                      <div className="text-lg font-bold text-amber-300 mt-0.5 tabular-nums">
                        {stats.gold_750_count} <span className="text-[10px] text-neutral-400 font-normal">quests</span>
                      </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/10 p-2">
                      <div className="text-[10px] font-sans uppercase text-neutral-400 font-semibold flex items-center justify-between">
                        <span>500 Gold Quests</span>
                        <span className="tabular-nums">{stats.gold_500_pct}%</span>
                      </div>
                      <div className="text-lg font-bold text-neutral-200 mt-0.5 tabular-nums">
                        {stats.gold_500_count} <span className="text-[10px] text-neutral-400 font-normal">quests</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] font-sans text-neutral-400 border-t border-white/5 pt-2 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Tip: Always reroll 500 Gold quests to maximize your chance of upgrading to 750 Gold.</span>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="bg-white/[0.02] border border-white/10 p-4 space-y-3">
                  <h3 className="text-xs font-sans font-bold tracking-wider uppercase text-neutral-200">
                    Objective Categories
                  </h3>
                  <div className="space-y-2">
                    {stats.category_distribution.map((cat) => (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-sans">
                          <span className="text-neutral-200 font-medium">{formatQuestCategory(cat.category)}</span>
                          <span className="font-mono text-neutral-400 tabular-nums">
                            {cat.count} ({cat.percentage}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-neutral-900 overflow-hidden">
                          <div
                            className="h-full bg-cyan-500/70 transition-all duration-300"
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Guild Color Frequency */}
              {stats.color_distribution.length > 0 && (
                <div className="bg-white/[0.02] border border-white/10 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-bold tracking-wider uppercase text-neutral-200">
                      Guild Color Pair Frequency (2-Color Quests)
                    </h3>
                    <span className="text-[10px] font-sans text-neutral-400 uppercase tracking-wider hidden sm:inline">
                      10 Guild Pairings
                    </span>
                  </div>
                  <div className="grid grid-cols-5 lg:grid-cols-10 gap-1.5">
                    {stats.color_distribution.map((g) => (
                      <div
                        key={g.guild}
                        className="bg-white/[0.02] border border-white/10 p-2 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-sans font-semibold text-neutral-200 truncate" title={g.guild}>
                            {g.guild}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {g.colors.map((c) => (
                              <ManaPip key={c} symbol={c} size={11} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-baseline justify-between font-mono text-xs mt-0.5">
                          <span className="font-bold text-white tabular-nums">{g.count}</span>
                          <span className="text-[9px] text-neutral-400 tabular-nums">{g.percentage}%</span>
                        </div>
                        <div className="h-1 w-full bg-neutral-900 mt-1 overflow-hidden">
                          <div
                            className="h-full bg-amber-400/80 transition-all"
                            style={{ width: `${Math.min(100, g.percentage * 3)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quest Rerolls & Upgrades Section */}
              <div className="bg-white/[0.02] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-white">
                      Daily Quest Rerolls & Upgrades
                    </h3>
                  </div>
                  {rerollStats && rerollStats.total_rerolls > 0 && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-neutral-400">Total Swaps: <strong className="text-white">{rerollStats.total_rerolls}</strong></span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-amber-400 font-bold">
                        {rerollStats.upgrade_count} Upgrades ({rerollStats.upgrade_rate_pct.toFixed(1)}%)
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-emerald-400 font-bold">
                        +{rerollStats.net_bonus_gold}g Extra Gold
                      </span>
                    </div>
                  )}
                </div>

                {rerollStats && rerollStats.total_rerolls > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-white/[0.02] border border-white/10 p-2.5 flex flex-col justify-between">
                        <span className="text-[10px] font-sans font-semibold text-neutral-400 uppercase tracking-wider">
                          Total Rerolls
                        </span>
                        <div className="text-lg font-mono font-bold text-white tabular-nums mt-1">
                          {rerollStats.total_rerolls}
                        </div>
                        <span className="text-[9px] font-sans text-neutral-500 mt-0.5">
                          Daily swaps tracked
                        </span>
                      </div>

                      <div className="bg-white/[0.02] border border-amber-500/20 p-2.5 flex flex-col justify-between">
                        <span className="text-[10px] font-sans font-semibold text-amber-400/90 uppercase tracking-wider">
                          500g → 750g Upgrades
                        </span>
                        <div className="text-lg font-mono font-bold text-amber-300 tabular-nums mt-1">
                          {rerollStats.upgrade_count} <span className="text-xs text-amber-400/70 font-normal">({rerollStats.upgrade_rate_pct.toFixed(0)}%)</span>
                        </div>
                        <span className="text-[9px] font-sans text-amber-400/60 mt-0.5">
                          Higher payout tier
                        </span>
                      </div>

                      <div className="bg-white/[0.02] border border-emerald-500/20 p-2.5 flex flex-col justify-between">
                        <span className="text-[10px] font-sans font-semibold text-emerald-400/90 uppercase tracking-wider flex items-center gap-1">
                          <Coins className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Net Gold Gained</span>
                        </span>
                        <div className="text-lg font-mono font-bold text-emerald-300 tabular-nums mt-1">
                          +{rerollStats.net_bonus_gold}g
                        </div>
                        <span className="text-[9px] font-sans text-emerald-400/60 mt-0.5">
                          +250g per successful upgrade
                        </span>
                      </div>

                      <div className="bg-white/[0.02] border border-white/10 p-2.5 flex flex-col justify-between">
                        <span className="text-[10px] font-sans font-semibold text-neutral-400 uppercase tracking-wider">
                          Same-Tier Swaps
                        </span>
                        <div className="text-lg font-mono font-bold text-neutral-300 tabular-nums mt-1">
                          {rerollStats.same_tier_count}
                        </div>
                        <span className="text-[9px] font-sans text-neutral-500 mt-0.5">
                          Objective/color adjustments
                        </span>
                      </div>
                    </div>

                    {/* Reroll History Table */}
                    <div className="border border-white/5 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/[0.03] border-b border-white/10 text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400">
                            <th className="py-2 px-3 text-left">Date</th>
                            <th className="py-2 px-3 text-left">Original Quest</th>
                            <th className="py-2 px-3 text-left">Replacement Quest</th>
                            <th className="py-2 px-3 text-center">Gold Impact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-[11px] font-mono">
                          {rerollStats.recent_rerolls.map((r) => {
                            const dateStr = new Date(r.rerolled_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            });

                            return (
                              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="py-2 px-3 text-neutral-400 font-sans text-[10px] whitespace-nowrap">
                                  {dateStr}
                                </td>
                                <td className="py-2 px-3 text-neutral-300 font-sans">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-neutral-200">{r.old_title}</span>
                                    <span className="text-[10px] font-mono px-1 py-0.2 bg-white/[0.04] border border-white/10 text-neutral-400">
                                      {r.old_reward_gold}g
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-neutral-300 font-sans">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-white font-medium">{r.new_title}</span>
                                    <span
                                      className={`text-[10px] font-mono px-1 py-0.2 border ${
                                        r.new_reward_gold >= 750
                                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold"
                                          : "bg-white/[0.04] border-white/10 text-neutral-300"
                                      }`}
                                    >
                                      {r.new_reward_gold}g
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 border ${
                                      r.gold_diff > 0
                                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                        : r.gold_diff === 0
                                        ? "bg-white/[0.02] border-white/10 text-neutral-400"
                                        : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                                    }`}
                                  >
                                    {r.gold_diff > 0
                                      ? `+${r.gold_diff}g (Upgrade)`
                                      : r.gold_diff === 0
                                      ? "0g (Sidegrade)"
                                      : `${r.gold_diff}g`}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-neutral-500 text-xs font-sans">
                    No quest rerolls tracked yet. Reroll history will appear here whenever you swap a daily quest in MTGA.
                  </div>
                )}
              </div>

              {/* Quest Frequency Table */}
              <div className="bg-white/[0.02] border border-white/10 p-4 space-y-3">
                <h3 className="text-xs font-sans font-bold tracking-wider uppercase text-neutral-200">
                  Individual Quest Records & Velocity
                </h3>
                <div className="border border-white/10 overflow-hidden">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-neutral-900/80 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 border-b border-white/10">
                      <tr>
                        <th className="py-2.5 px-3">Quest Title</th>
                        <th className="py-2.5 px-2 text-center">Category</th>
                        <th className="py-2.5 px-2 text-center">Reward</th>
                        <th className="py-2.5 px-2 text-center">Seen</th>
                        <th className="py-2.5 px-2 text-center">Done</th>
                        <th className="py-2.5 px-2 text-center">Avg Time</th>
                        <th className="py-2.5 px-2 text-center">Avg Matches</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {stats.quest_frequency.map((q, idx) => (
                        <tr key={`${q.title}-${q.reward_gold}-${idx}`} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-2 px-3 font-sans font-medium text-neutral-200">
                            {q.title}
                          </td>
                          <td className="py-2 px-2 text-center text-neutral-400 font-sans text-[11px]">
                            {formatQuestCategory(q.category)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 border ${
                                q.reward_gold >= 750
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300 font-bold"
                                  : "bg-white/[0.03] border-white/10 text-neutral-300"
                              }`}
                            >
                              {q.reward_gold}g
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center text-white tabular-nums">
                            {q.times_seen}
                          </td>
                          <td className="py-2 px-2 text-center text-emerald-400 tabular-nums">
                            {q.times_completed}
                          </td>
                          <td className="py-2 px-2 text-center text-neutral-300 tabular-nums">
                            {q.avg_duration_hours !== null && q.avg_duration_hours !== undefined
                              ? `${q.avg_duration_hours}h`
                              : "—"}
                          </td>
                          <td className="py-2 px-2 text-center text-neutral-300 tabular-nums">
                            {q.avg_matches !== null && q.avg_matches !== undefined
                              ? `${q.avg_matches}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
