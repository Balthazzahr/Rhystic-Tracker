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
  widget,
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

  // Amount of games (dots) to show based on widget column width
  // 4 games per column: 4 for 1 col, 8 for 2 cols, 12 for 3 cols, 16 for 4 cols
  const colWidth = widget.width || 4;
  const maxDots = colWidth * 4;

  // Recent matches in chronological order (oldest -> newest on the right)
  const recentTrail = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return [];
    const chrono = [...winLossMatches].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return chrono.slice(-maxDots);
  }, [winLossMatches, maxDots]);

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

  // Streak headline label above dots: "X Game(s) Win/Loss Streak"
  const streakHeadline = useMemo(() => {
    if (streakCount === 0) return "No Active Streak";
    const gameWord = streakCount === 1 ? "Game" : "Games";
    return `${streakCount} ${gameWord} ${isWin ? "Win" : "Loss"} Streak`;
  }, [streakCount, isWin]);

  return (
    <WidgetShell
      title="Current Streak"
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="No matches recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-0.5">
        {/* Above the dots: Streak number + short label */}
        <div>
          <div
            className="text-2xl sm:text-3xl font-display font-bold tracking-wide leading-none capitalize truncate"
            style={{ color: streakColor }}
          >
            {streakHeadline}
          </div>
        </div>

        {/* Recent-Form Dot Trail Row (Stretches full width dynamically) */}
        {recentTrail.length > 0 && (
          <div className="my-auto py-2 w-full">
            <div className="flex items-center gap-1.5 w-full">
              {recentTrail.map((m, idx) => {
                const isMatchWin = m.result === "win";
                const dotColor = isMatchWin ? winColor : lossColor;

                // Check if this dot is part of the active streak (the rightmost streakCount games)
                const isInActiveStreak =
                  streakCount > 0 &&
                  idx >= recentTrail.length - streakCount &&
                  m.result === stats.curStreakType;

                return (
                  <div
                    key={m.id || idx}
                    className={`transition-all rounded-xs cursor-pointer flex-1 min-w-0 h-5 sm:h-6 flex items-center justify-center ${
                      isInActiveStreak
                        ? "opacity-100 ring-2 ring-white/90 shadow-md scale-y-105 z-10"
                        : "opacity-40 hover:opacity-80 border border-white/10"
                    }`}
                    style={{
                      backgroundColor: dotColor,
                    }}
                    title={`${isMatchWin ? "Win" : "Loss"} · ${
                      m.deck_name || "Match"
                    } (${new Date(m.timestamp).toLocaleDateString()})`}
                  >
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-white/70 select-none leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                      {isMatchWin ? "W" : "L"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
};
