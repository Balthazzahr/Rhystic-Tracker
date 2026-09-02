import React, { useMemo } from "react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

const formatTimeSince = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) {
    const mins = Math.max(1, diffMins);
    return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"}`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ${diffDays === 1 ? "day" : "days"}`;
};

export const CurrentStreakWidget: React.FC<WidgetProps> = ({
  stats,
  winLossMatches,
  customColors,
  isLoading = false,
}) => {
  const isWin = stats.curStreakType === "win";
  const isEmpty = stats.allCount === 0 || stats.curStreak === 0;

  const timeSinceOpposite = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return null;
    const oppositeType = isWin ? "loss" : "win";
    const desc = [...winLossMatches].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const lastOpposite = desc.find((m) => m.result === oppositeType);
    if (!lastOpposite) return null;
    return formatTimeSince(lastOpposite.timestamp);
  }, [winLossMatches, isWin]);

  const streakCount = stats.curStreak || 0;
  const gameUnit = streakCount === 1 ? "Game" : "Games";
  const outcomeColor = isWin
    ? customColors?.currentStreak?.win || "#10B981"
    : customColors?.currentStreak?.loss || "#EF4444";

  return (
    <WidgetShell
      title="Current Streak"
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No streak active"
    >
      <div className="flex-1 flex flex-col justify-between">
        <div className="flex items-baseline gap-2.5 my-1">
          <div
            className="text-[38px] font-display font-bold tracking-wide leading-none tabular-nums"
            style={{ color: outcomeColor }}
          >
            {streakCount} {gameUnit}
          </div>
          <span className="text-xs font-sans text-neutral-400 font-semibold uppercase tracking-wider">
            {isWin ? "Winning Streak" : "Losing Streak"}
          </span>
        </div>

        <div className="text-xs font-sans text-neutral-400 font-normal tabular-nums pt-2 border-t border-white/5 flex items-center justify-between">
          <span className="text-neutral-300">
            {timeSinceOpposite ? (
              <>
                <span className="font-semibold text-white">{timeSinceOpposite}</span> since your last {isWin ? "loss" : "win"}
              </>
            ) : (
              `Active ${isWin ? "winning" : "losing"} run`
            )}
          </span>
        </div>
      </div>
    </WidgetShell>
  );
};
