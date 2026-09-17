import React, { useMemo, useState } from "react";
import { PieChart, RotateCcw } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

const FORMAT_COLORS: Record<string, string> = {
  Brawl: "#F59E0B",
  "Standard Brawl": "#EC4899",
  "Brawl - Standard": "#EC4899",
  "Brawl - Competitive": "#F59E0B",
  Standard: "#38BDF8",
  "Standard Ranked": "#38BDF8",
  Historic: "#A855F7",
  "Historic Ranked": "#A855F7",
  Timeless: "#EC4899",
  "Timeless Ranked": "#EC4899",
  Explorer: "#10B981",
  "Explorer Ranked": "#10B981",
  Draft: "#6366F1",
  "Midweek Magic": "#818CF8",
  Commander: "#8B5CF6",
  Alchemy: "#F97316",
  "Alchemy Ranked": "#F97316",
  "Bot Match": "#64748B",
  "Direct Challenge": "#B8503A",
  Gladiator: "#6E8A42",
  Sealed: "#6366F1",
  Pioneer: "#10B981",
  "Pioneer Ranked": "#10B981",
  Other: "#64748B",
};

interface DonutSegment {
  key: string;
  label: string;
  count: number;
  pct: number;
  winRate: number;
  color: string;
  pathD: string;
}

function getDonutArc(
  cx: number,
  cy: number,
  r: number,
  ir: number,
  startAngle: number,
  endAngle: number
): string {
  const angle = endAngle - startAngle;
  if (angle >= 359.99) {
    const midAngle = startAngle + 180;
    return `${getDonutArc(cx, cy, r, ir, startAngle, midAngle)} ${getDonutArc(cx, cy, r, ir, midAngle, endAngle)}`;
  }

  const startRad = ((startAngle - 90) * Math.PI) / 180.0;
  const endRad = ((endAngle - 90) * Math.PI) / 180.0;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  const ix1 = cx + ir * Math.cos(endRad);
  const iy1 = cy + ir * Math.sin(endRad);
  const ix2 = cx + ir * Math.cos(startRad);
  const iy2 = cy + ir * Math.sin(startRad);

  const largeArc = angle > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
}

export const FormatDistributionWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const width = widget.width ?? 4;
  const height = widget.height ?? 2;

  // Determine view mode based on widget dimensions
  const isCompact = width <= 3 || height <= 1;

  const { formatList, overallStats, totalMatches } = useMemo(() => {
    const fMap = new Map<string, { wins: number; losses: number }>();
    let totalWins = 0;
    let totalLosses = 0;

    for (const m of winLossMatches || []) {
      const fmt = m.format_name || "Standard";
      const existing = fMap.get(fmt) || { wins: 0, losses: 0 };
      if (m.result === "win") {
        existing.wins++;
        totalWins++;
      } else {
        existing.losses++;
        totalLosses++;
      }
      fMap.set(fmt, existing);
    }

    const total = totalWins + totalLosses;
    const overallWR = total > 0 ? (totalWins / total) * 100 : 0;

    const list = Array.from(fMap.entries())
      .map(([fmt, data]) => {
        const fTotal = data.wins + data.losses;
        return {
          format: fmt,
          wins: data.wins,
          losses: data.losses,
          total: fTotal,
          winRate: fTotal > 0 ? (data.wins / fTotal) * 100 : 0,
          pct: total > 0 ? (fTotal / total) * 100 : 0,
          color: FORMAT_COLORS[fmt] || FORMAT_COLORS.Other,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      formatList: list,
      overallStats: {
        wins: totalWins,
        losses: totalLosses,
        winRate: overallWR,
      },
      totalMatches: total,
    };
  }, [winLossMatches]);

  const selectedData = useMemo(() => {
    if (!selectedFormat) return null;
    return formatList.find((f) => f.format === selectedFormat) || null;
  }, [selectedFormat, formatList]);

  // Donut geometry in 160x160 viewBox
  const cx = 80;
  const cy = 80;
  const radius = 74;
  const innerRadius = 48;

  // Build Donut Segments (either All Formats or Selected Format W/L)
  const donutSegments: DonutSegment[] = useMemo(() => {
    if (selectedData) {
      // Selected Format: Win/Loss Donut
      const sTotal = selectedData.total;
      if (sTotal === 0) return [];

      const winAngle = (selectedData.wins / sTotal) * 360;
      const lossAngle = (selectedData.losses / sTotal) * 360;

      const segs: DonutSegment[] = [];
      let curAngle = 0;

      if (selectedData.wins > 0) {
        const start = curAngle;
        const end = curAngle + winAngle;
        curAngle = end;
        segs.push({
          key: "wins",
          label: "Wins",
          count: selectedData.wins,
          pct: (selectedData.wins / sTotal) * 100,
          winRate: selectedData.winRate,
          color: winColor,
          pathD: getDonutArc(cx, cy, radius, innerRadius, start, end),
        });
      }

      if (selectedData.losses > 0) {
        const start = curAngle;
        const end = curAngle + lossAngle;
        segs.push({
          key: "losses",
          label: "Losses",
          count: selectedData.losses,
          pct: (selectedData.losses / sTotal) * 100,
          winRate: selectedData.winRate,
          color: lossColor,
          pathD: getDonutArc(cx, cy, radius, innerRadius, start, end),
        });
      }

      return segs;
    }

    // Default: All Formats Donut
    let curAngle = 0;
    const segs: DonutSegment[] = [];

    for (const item of formatList) {
      if (item.total === 0) continue;
      const angleSize = (item.pct / 100) * 360;
      const start = curAngle;
      const end = curAngle + angleSize;
      curAngle = end;

      segs.push({
        key: item.format,
        label: item.format,
        count: item.total,
        pct: item.pct,
        winRate: item.winRate,
        color: item.color,
        pathD: getDonutArc(cx, cy, radius, innerRadius, start, end),
      });
    }

    return segs;
  }, [selectedData, formatList, radius, innerRadius, winColor, lossColor]);

  const activeHover = hoveredFormat
    ? formatList.find((s) => s.format === hoveredFormat)
    : null;

  const hasData = totalMatches > 0;

  const handleFormatClick = (fmt: string) => {
    if (selectedFormat === fmt) {
      setSelectedFormat(null);
    } else {
      setSelectedFormat(fmt);
    }
  };

  return (
    <WidgetShell
      title="Format Distribution"
      icon={<PieChart className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No format records found"
    >
      <div className="flex-1 flex flex-col justify-center select-none min-h-0 pt-0.5">
        {isCompact ? (
          // Compact / Narrow Mode: High-density list only (Pie Chart hidden)
          <div className="flex-1 flex flex-col justify-center space-y-1.5 overflow-y-auto custom-scrollbar pr-0.5">
            {formatList.map((f) => {
              const isSelected = selectedFormat === f.format;
              return (
                <div
                  key={f.format}
                  onClick={() => handleFormatClick(f.format)}
                  className={`flex items-center justify-between p-1.5 border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white/10 border-white/40 shadow-sm"
                      : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 mr-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="font-sans font-semibold text-white truncate text-xs">
                      {f.format}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs shrink-0">
                    <span className="text-neutral-400 text-[11px]">
                      {f.total}G
                    </span>
                    <span className="text-neutral-600">·</span>
                    <span
                      className="font-bold text-xs"
                      style={{ color: f.winRate >= 50 ? winColor : lossColor }}
                    >
                      {f.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Standard / Large Mode: Dynamically expanding Donut on Left, Compact Table on Right
          <div className="flex items-center justify-between gap-3 sm:gap-4 flex-1 min-h-0 w-full">
            {/* Left: Expanding Interactive SVG Pie Chart */}
            <div className="flex-1 min-w-0 h-full flex flex-col items-center justify-center p-1">
              {/* Header Label Above Pie Chart (Visible on Hover/Select only) */}
              <div className="h-5 flex items-center justify-center mb-1">
                {selectedData ? (
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 truncate max-w-[200px]">
                    {selectedData.format}
                  </span>
                ) : activeHover ? (
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 truncate max-w-[200px]">
                    {activeHover.format}
                  </span>
                ) : null}
              </div>

              {/* Responsive Auto-Sizing SVG Donut Container */}
              <div
                className="relative w-full flex-1 max-h-[88%] aspect-square flex items-center justify-center cursor-pointer"
                onClick={(e) => {
                  if (e.target === e.currentTarget && selectedFormat) {
                    setSelectedFormat(null);
                  }
                }}
              >
                <svg
                  viewBox="0 0 160 160"
                  className="w-full h-full max-h-full max-w-full drop-shadow-md transform transition-transform"
                >
                  {donutSegments.map((seg) => {
                    const isDimmed =
                      !selectedData &&
                      hoveredFormat !== null &&
                      hoveredFormat !== seg.key;

                    return (
                      <path
                        key={seg.key}
                        d={seg.pathD}
                        fill={seg.color}
                        opacity={isDimmed ? 0.25 : 0.95}
                        className="cursor-pointer transition-all duration-300 hover:opacity-100 hover:brightness-110"
                        onMouseEnter={() => !selectedData && setHoveredFormat(seg.key)}
                        onMouseLeave={() => !selectedData && setHoveredFormat(null)}
                        onClick={() => !selectedData && handleFormatClick(seg.key)}
                      />
                    );
                  })}
                </svg>

                {/* Central Hub Display: Big Win Rate % on Hover/Select; Game Count only at Resting State */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
                  {selectedData ? (
                    // Selected Format Win/Loss Hub
                    <>
                      <span
                        className="text-xl sm:text-2xl md:text-3xl font-mono font-black tabular-nums leading-none"
                        style={{
                          color:
                            selectedData.winRate >= 50 ? winColor : lossColor,
                        }}
                      >
                        {selectedData.winRate.toFixed(0)}%
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono text-neutral-400 mt-1 tabular-nums">
                        {selectedData.wins}W - {selectedData.losses}L
                      </span>
                    </>
                  ) : activeHover ? (
                    // Hover Preview Hub
                    <>
                      <span
                        className="text-xl sm:text-2xl md:text-3xl font-mono font-black tabular-nums leading-none"
                        style={{
                          color:
                            activeHover.winRate >= 50 ? winColor : lossColor,
                        }}
                      >
                        {activeHover.winRate.toFixed(0)}%
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono text-neutral-400 mt-1 tabular-nums">
                        {activeHover.total} {activeHover.total === 1 ? "Game" : "Games"}
                      </span>
                    </>
                  ) : (
                    // Resting Non-Hovered State: Only amount of games
                    <>
                      <span className="text-lg sm:text-xl md:text-2xl font-mono font-bold text-white tabular-nums leading-none">
                        {totalMatches}
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono text-neutral-400 mt-0.5">
                        {totalMatches === 1 ? "Game" : "Games"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Compact, Clean Table (Format Name, Games, Win Rate) */}
            <div className="w-48 sm:w-52 md:w-60 shrink-0 flex flex-col justify-center space-y-1 overflow-y-auto max-h-full custom-scrollbar pr-0.5">
              {/* Selected Format Reset Banner */}
              {selectedData && (
                <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-white/10">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase">
                    Win/Loss Mode
                  </span>
                  <button
                    onClick={() => setSelectedFormat(null)}
                    className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Return to all formats"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> All Formats
                  </button>
                </div>
              )}

              {formatList.map((seg) => {
                const isSelected = selectedFormat === seg.format;
                const isHovered = !selectedFormat && hoveredFormat === seg.format;

                return (
                  <div
                    key={seg.format}
                    onClick={() => handleFormatClick(seg.format)}
                    onMouseEnter={() => !selectedFormat && setHoveredFormat(seg.format)}
                    onMouseLeave={() => !selectedFormat && setHoveredFormat(null)}
                    className={`flex items-center justify-between p-1.5 border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-white/10 border-white/40 shadow-sm"
                        : isHovered
                        ? "bg-white/[0.06] border-white/20"
                        : "bg-white/[0.02] border-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 mr-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-xs font-sans font-semibold text-white truncate">
                        {seg.format}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs shrink-0">
                      <span className="text-neutral-400 text-[11px]">
                        {seg.total}G
                      </span>
                      <span className="text-neutral-600">·</span>
                      <span
                        className="font-bold text-xs"
                        style={{
                          color: seg.winRate >= 50 ? winColor : lossColor,
                        }}
                      >
                        {seg.winRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
});

FormatDistributionWidget.displayName = "FormatDistributionWidget";
