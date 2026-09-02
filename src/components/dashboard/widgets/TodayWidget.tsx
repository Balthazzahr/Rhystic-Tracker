import React from "react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { Calendar } from "lucide-react";

export const TodayWidget: React.FC<WidgetProps> = ({
  stats,
  customColors,
  isLoading = false,
}) => {
  const isEmpty = stats.todayCount === 0;
  const outcomeColor =
    stats.todayWinRate >= 50
      ? customColors?.todayWinRate?.positive || "#10B981"
      : customColors?.todayWinRate?.negative || "#EF4444";

  return (
    <WidgetShell
      title="Today Win Rate"
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No matches played today"
    >
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div
            className="text-[40px] font-display font-bold tracking-wide leading-none my-1 tabular-nums"
            style={{ color: outcomeColor }}
          >
            {stats.todayWinRate.toFixed(1)}%
          </div>
        </div>

        <div className="text-xs font-sans text-neutral-400 font-normal tabular-nums pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-medium">{stats.todayWins}W</span>
            <span className="opacity-30">/</span>
            <span className="text-rose-400 font-medium">{stats.todayLosses}L</span>
          </div>
          <div className="text-neutral-400">
            {stats.todayCount} {stats.todayCount === 1 ? "match" : "matches"}
          </div>
        </div>
      </div>
    </WidgetShell>
  );
};
