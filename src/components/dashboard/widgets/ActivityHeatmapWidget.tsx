import React, { useMemo } from "react";
import { Calendar, Flame, Clock } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const ActivityHeatmapWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const { dayStats, bestDay, peakDay, totalMatches } = useMemo(() => {
    const dMap: Record<number, { wins: number; losses: number; total: number }> = {
      0: { wins: 0, losses: 0, total: 0 }, // Sun
      1: { wins: 0, losses: 0, total: 0 }, // Mon
      2: { wins: 0, losses: 0, total: 0 }, // Tue
      3: { wins: 0, losses: 0, total: 0 }, // Wed
      4: { wins: 0, losses: 0, total: 0 }, // Thu
      5: { wins: 0, losses: 0, total: 0 }, // Fri
      6: { wins: 0, losses: 0, total: 0 }, // Sat
    };

    let total = 0;

    for (const m of winLossMatches || []) {
      const d = new Date(m.timestamp);
      if (isNaN(d.getTime())) continue;

      const dayIdx = d.getDay(); // 0 = Sun, 1 = Mon ...
      dMap[dayIdx].total++;
      total++;
      if (m.result === "win") dMap[dayIdx].wins++;
      else dMap[dayIdx].losses++;
    }

    // Map to Monday-first order: [1, 2, 3, 4, 5, 6, 0]
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const maxDayTotal = Math.max(...dayOrder.map((idx) => dMap[idx].total), 1);

    const stats = dayOrder.map((dayIdx, i) => {
      const data = dMap[dayIdx];
      const wr = data.total > 0 ? Math.round((data.wins / data.total) * 1000) / 10 : 0;
      return {
        name: DAYS[i],
        dayIdx,
        wins: data.wins,
        losses: data.losses,
        total: data.total,
        winRate: wr,
        intensity: Math.min(100, Math.round((data.total / maxDayTotal) * 100)),
      };
    });

    let bestWr = -1;
    let bDayName = "—";
    let maxVolume = 0;
    let pDayName = "—";

    for (const s of stats) {
      if (s.total >= 3 && s.winRate > bestWr) {
        bestWr = s.winRate;
        bDayName = `${s.name} (${s.winRate.toFixed(1)}%)`;
      }
      if (s.total > maxVolume) {
        maxVolume = s.total;
        pDayName = `${s.name} (${s.total}G)`;
      }
    }

    return {
      dayStats: stats,
      bestDay: bDayName,
      peakDay: pDayName,
      totalMatches: total,
    };
  }, [winLossMatches]);

  const hasData = totalMatches > 0;

  return (
    <WidgetShell
      title="Activity & Win Rate by Day"
      subtitle={`Best: ${bestDay} · Peak: ${peakDay}`}
      icon={<Calendar className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No match activity recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2.5">
        {/* 7-Day Heat Columns */}
        <div className="grid grid-cols-7 gap-1.5 flex-1 items-stretch">
          {dayStats.map((d) => (
            <div
              key={d.name}
              className="flex flex-col items-center justify-between p-1.5 bg-white/[0.02] border border-white/5 hover:border-white/20 transition-colors"
              title={`${d.name}: ${d.total} matches, ${d.wins}W - ${d.losses}L (${d.total > 0 ? `${d.winRate.toFixed(1)}% WR` : "No matches"})`}
            >
              {/* Day Label */}
              <span className="font-mono text-[10.5px] font-bold text-neutral-300 uppercase">
                {d.name}
              </span>

              {/* Intensity Pillar / Height Bar */}
              <div className="w-full flex-1 my-1.5 bg-black/40 flex flex-col justify-end p-0.5 border border-white/5 min-h-[50px]">
                <div
                  className="w-full transition-all duration-500"
                  style={{
                    height: `${Math.max(8, d.intensity)}%`,
                    backgroundColor:
                      d.total === 0
                        ? "rgba(255,255,255,0.05)"
                        : d.winRate >= 50
                        ? winColor
                        : lossColor,
                    opacity: d.total === 0 ? 0.3 : 0.85,
                  }}
                />
              </div>

              {/* Match Count & Win Rate */}
              <div className="flex flex-col items-center text-center">
                <span className="font-mono font-bold text-[10px] text-white tabular-nums">
                  {d.total}G
                </span>
                <span
                  className="font-mono text-[9.5px] font-semibold tabular-nums mt-0.5"
                  style={{
                    color:
                      d.total === 0
                        ? "#71717A"
                        : d.winRate >= 50
                        ? winColor
                        : lossColor,
                  }}
                >
                  {d.total > 0 ? `${Math.round(d.winRate)}%` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>{totalMatches} matches analyzed</span>
          <span>Best Performing: {bestDay}</span>
        </div>
      </div>
    </WidgetShell>
  );
});

ActivityHeatmapWidget.displayName = "ActivityHeatmapWidget";
