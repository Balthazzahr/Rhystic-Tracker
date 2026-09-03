import React from "react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { Trophy } from "lucide-react";

export const WinRateSummaryWidget: React.FC<WidgetProps> = ({
  stats,
  customColors,
  isLoading = false,
}) => {
  const isEmpty = stats.allCount === 0;
  const winColor = customColors?.allTimeWinRate?.positive || "#10B981";
  const lossColor = customColors?.allTimeWinRate?.negative || "#EF4444";
  const outcomeColor = stats.allWinRate >= 50 ? winColor : lossColor;

  return (
    <WidgetShell
      title="All-Time Win Rate"
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No matches recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div
            className="text-[40px] font-display font-bold tracking-wide leading-none my-1 tabular-nums"
            style={{ color: outcomeColor }}
          >
            {stats.allWinRate.toFixed(1)}%
          </div>
        </div>

        <div className="text-xs font-sans text-neutral-400 font-normal tabular-nums pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-medium" style={{ color: winColor }}>
              {stats.allWins}W
            </span>
            <span className="opacity-30">/</span>
            <span className="font-medium" style={{ color: lossColor }}>
              {stats.allLosses}L
            </span>
          </div>
          <div className="text-neutral-400">
            {stats.allCount} {stats.allCount === 1 ? "game" : "games"}
          </div>
        </div>
      </div>
    </WidgetShell>
  );
};
