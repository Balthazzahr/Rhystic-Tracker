import React, { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

export const PlayVsDrawWidget: React.FC<WidgetProps> = React.memo(({
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const { playStats, drawStats, delta, totalRecorded } = useMemo(() => {
    let playWins = 0;
    let playLosses = 0;
    let drawWins = 0;
    let drawLosses = 0;

    for (const m of winLossMatches || []) {
      if (m.going_first === true) {
        if (m.result === "win") playWins++;
        else if (m.result === "loss") playLosses++;
      } else if (m.going_first === false) {
        if (m.result === "win") drawWins++;
        else if (m.result === "loss") drawLosses++;
      }
    }

    const playTotal = playWins + playLosses;
    const drawTotal = drawWins + drawLosses;
    const playWR = playTotal > 0 ? (playWins / playTotal) * 100 : 0;
    const drawWR = drawTotal > 0 ? (drawWins / drawTotal) * 100 : 0;
    const diff = playWR - drawWR;

    return {
      playStats: {
        wins: playWins,
        losses: playLosses,
        total: playTotal,
        winRate: Math.round(playWR * 10) / 10,
      },
      drawStats: {
        wins: drawWins,
        losses: drawLosses,
        total: drawTotal,
        winRate: Math.round(drawWR * 10) / 10,
      },
      delta: Math.round(diff * 10) / 10,
      totalRecorded: playTotal + drawTotal,
    };
  }, [winLossMatches]);

  const hasData = totalRecorded > 0;

  return (
    <WidgetShell
      title="Play vs. Draw"
      subtitle="First-turn advantage"
      icon={<ArrowLeftRight className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No turn order recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1">
        {/* Dual Bars Container */}
        <div className="space-y-4 my-auto">
          {/* ON THE PLAY BAR */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 px-1.5 py-0.5 border border-sky-500/20 text-[10px]">
                  PLAY
                </span>
                <span className="font-sans font-medium text-neutral-200">
                  On the Play (Going First)
                </span>
              </div>
              <div className="flex items-center gap-2 tabular-nums font-mono text-xs">
                <span className="text-neutral-400 text-[11px]">
                  {playStats.wins}W - {playStats.losses}L
                </span>
                <span className="text-neutral-600">·</span>
                <span
                  className="font-bold text-sm"
                  style={{
                    color:
                      playStats.winRate >= 50
                        ? winColor
                        : playStats.winRate > 0
                          ? lossColor
                          : "#94A3B8",
                  }}
                >
                  {playStats.winRate.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Visual Bar */}
            <div className="w-full h-3 bg-neutral-900 border border-white/10 flex overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${playStats.winRate}%`,
                  backgroundColor: playStats.winRate >= 50 ? winColor : lossColor,
                }}
              />
              <div
                className="h-full opacity-20"
                style={{
                  width: `${100 - playStats.winRate}%`,
                  backgroundColor: "#64748B",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-neutral-500">
              <span>{playStats.total} games</span>
              <span>50% baseline</span>
            </div>
          </div>

          {/* ON THE DRAW BAR */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-1.5 py-0.5 border border-purple-500/20 text-[10px]">
                  DRAW
                </span>
                <span className="font-sans font-medium text-neutral-200">
                  On the Draw (Going Second)
                </span>
              </div>
              <div className="flex items-center gap-2 tabular-nums font-mono text-xs">
                <span className="text-neutral-400 text-[11px]">
                  {drawStats.wins}W - {drawStats.losses}L
                </span>
                <span className="text-neutral-600">·</span>
                <span
                  className="font-bold text-sm"
                  style={{
                    color:
                      drawStats.winRate >= 50
                        ? winColor
                        : drawStats.winRate > 0
                          ? lossColor
                          : "#94A3B8",
                  }}
                >
                  {drawStats.winRate.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Visual Bar */}
            <div className="w-full h-3 bg-neutral-900 border border-white/10 flex overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${drawStats.winRate}%`,
                  backgroundColor: drawStats.winRate >= 50 ? winColor : lossColor,
                }}
              />
              <div
                className="h-full opacity-20"
                style={{
                  width: `${100 - drawStats.winRate}%`,
                  backgroundColor: "#64748B",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-neutral-500">
              <span>{drawStats.total} games</span>
              <span>50% baseline</span>
            </div>
          </div>
        </div>

        {/* Footer Summary / Delta Tag */}
        <div className="text-xs font-sans text-neutral-400 font-normal tabular-nums pt-2 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span>Advantage:</span>
            <span
              className="font-mono font-bold"
              style={{
                color: delta > 0 ? winColor : delta < 0 ? lossColor : "#94A3B8",
              }}
            >
              {delta > 0 ? `+${delta}% on Play` : delta < 0 ? `+${Math.abs(delta)}% on Draw` : "Even"}
            </span>
          </div>
          <span className="text-neutral-500 font-mono text-[10px]">
            {totalRecorded} total games
          </span>
        </div>
      </div>
    </WidgetShell>
  );
});
