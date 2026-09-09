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

// Helper to determine contrasting text color (black vs white) based on background hex
const getContrastTextColor = (hexColor: string): string => {
  const cleanHex = hexColor.replace("#", "");
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((c) => c + c)
          .join("")
      : cleanHex;
  const num = parseInt(fullHex, 16);
  if (isNaN(num)) return "#FFFFFF";
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  // Standard sRGB luminance calculation
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#FFFFFF";
};

export const CurrentStreakWidget: React.FC<WidgetProps> = React.memo(({
  widget: _widget,
  stats,
  winLossMatches,
  customColors,
  isLoading = false,
}) => {
  const isWin = stats.curStreakType === "win";
  const streakCount = stats.curStreak || 0;
  const isEmpty = stats.allCount === 0;

  // Custom colors for win streak vs loss streak
  const winColor = customColors?.currentStreak?.win || "#10B981";
  const lossColor = customColors?.currentStreak?.loss || "#EF4444";
  const streakColor =
    streakCount === 0
      ? "#94A3B8"
      : isWin
        ? winColor
        : lossColor;

  // Display up to 10 matches maximum
  const maxDots = 10;

  // Recent matches in chronological order (oldest -> newest on the right)
  const recentTrail = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return [];
    const chrono = [...winLossMatches].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return chrono.slice(-maxDots);
  }, [winLossMatches]);

  // All-time best win streak calculation
  const bestWinStreak = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return 0;
    const chrono = [...winLossMatches].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    let curLen = 0;
    let maxWin = 0;
    for (const m of chrono) {
      if (m.result === "win") {
        curLen++;
        if (curLen > maxWin) maxWin = curLen;
      } else {
        curLen = 0;
      }
    }
    return maxWin;
  }, [winLossMatches]);

  // Time since last win (for losing streak)
  const timeSinceLastWin = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return null;
    const desc = [...winLossMatches].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const lastWin = desc.find((m) => m.result === "win");
    if (!lastWin) return null;
    return formatTimeSince(lastWin.timestamp);
  }, [winLossMatches]);

  return (
    <WidgetShell
      title="Current Streak"
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No matches recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-0.5">
        {/* Centered Streak Boxes & Right-side Streak Count */}
        <div className="my-auto flex items-center gap-3 w-full py-1">
          {recentTrail.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {recentTrail.map((m, idx) => {
                const isMatchWin = m.result === "win";
                const dotColor = isMatchWin ? winColor : lossColor;
                const textColor = getContrastTextColor(dotColor);

                // Check if this dot is part of the active streak (the rightmost streakCount games)
                const isInActiveStreak =
                  streakCount > 0 &&
                  idx >= recentTrail.length - streakCount &&
                  m.result === stats.curStreakType;

                return (
                  <div
                    key={m.id || idx}
                    className={`transition-all rounded-none cursor-pointer flex-1 min-w-0 h-7 sm:h-8 flex items-center justify-center ${
                      isInActiveStreak
                        ? "opacity-100 ring-2 ring-white/90 shadow-md z-10"
                        : "opacity-40 hover:opacity-80 border border-white/10"
                    }`}
                    style={{
                      backgroundColor: dotColor,
                    }}
                    title={`${isMatchWin ? "Win" : "Loss"} · ${
                      m.deck_name || "Match"
                    } (${new Date(m.timestamp).toLocaleDateString()})`}
                  >
                    <span
                      className="text-[11px] sm:text-xs font-mono font-bold select-none leading-none"
                      style={{ color: textColor }}
                    >
                      {isMatchWin ? "W" : "L"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 text-xs font-mono text-neutral-500 italic">
              No recent matches
            </div>
          )}

          {/* Right of the boxes: number + word (e.g. 4 Wins / 1 Win / 3 Losses) */}
          <div className="shrink-0 text-right pl-1">
            <span
              className="text-lg sm:text-xl font-mono font-bold tracking-tight tabular-nums whitespace-nowrap"
              style={{ color: streakColor }}
            >
              {streakCount === 0
                ? "No Streak"
                : `${streakCount} ${
                    isWin
                      ? streakCount === 1
                        ? "Win"
                        : "Wins"
                      : streakCount === 1
                        ? "Loss"
                        : "Losses"
                  }`}
            </span>
          </div>
        </div>

        {/* Below the dots: Contextual caption */}
        <div className="text-xs font-sans text-neutral-400 font-normal tabular-nums pt-2 border-t border-white/5 flex items-center justify-between">
          <span className="text-neutral-300 truncate">
            {streakCount === 0 ? (
              "Play a match to build your streak"
            ) : !isWin ? (
              timeSinceLastWin ? (
                <>
                  <span className="font-semibold text-white">
                    {timeSinceLastWin}
                  </span>{" "}
                  since last win
                </>
              ) : (
                "Active losing run"
              )
            ) : bestWinStreak > 0 ? (
              <>
                Lifetime best:{" "}
                <span className="font-semibold text-white">
                  {bestWinStreak} wins
                </span>
              </>
            ) : (
              "Active winning run"
            )}
          </span>
        </div>
      </div>
    </WidgetShell>
  );
});
