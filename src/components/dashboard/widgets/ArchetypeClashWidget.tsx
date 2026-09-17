import React, { useMemo } from "react";
import { Zap, Scale, Hourglass, Swords, Shield, Target } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

interface ArchetypePillar {
  key: "aggro" | "midrange" | "control";
  name: string;
  turnRange: string;
  desc: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  pctOfTotal: number;
}

export const ArchetypeClashWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const { pillars, dominantStyle, totalTracked } = useMemo(() => {
    let aggroW = 0, aggroL = 0;
    let midW = 0, midL = 0;
    let ctrlW = 0, ctrlL = 0;
    let total = 0;

    for (const m of winLossMatches || []) {
      const turns = m.turns || 0;
      if (turns <= 0) continue;

      if (turns <= 5) {
        if (m.result === "win") aggroW++;
        else aggroL++;
      } else if (turns <= 10) {
        if (m.result === "win") midW++;
        else midL++;
      } else {
        if (m.result === "win") ctrlW++;
        else ctrlL++;
      }
      total++;
    }

    const aggroTotal = aggroW + aggroL;
    const midTotal = midW + midL;
    const ctrlTotal = ctrlW + ctrlL;

    const pillarList: ArchetypePillar[] = [
      {
        key: "aggro",
        name: "Aggro / Blitz",
        turnRange: "≤ 5 Turns",
        desc: "Fast pressure & early finishes",
        icon: Zap,
        color: "#EF4444", // Red
        bgColor: "rgba(239, 68, 68, 0.08)",
        borderColor: "rgba(239, 68, 68, 0.3)",
        wins: aggroW,
        losses: aggroL,
        total: aggroTotal,
        winRate: aggroTotal > 0 ? (aggroW / aggroTotal) * 100 : 0,
        pctOfTotal: total > 0 ? (aggroTotal / total) * 100 : 0,
      },
      {
        key: "midrange",
        name: "Midrange / Value",
        turnRange: "6–10 Turns",
        desc: "Board presence & attrition curves",
        icon: Scale,
        color: "#F59E0B", // Amber
        bgColor: "rgba(245, 158, 11, 0.08)",
        borderColor: "rgba(245, 158, 11, 0.3)",
        wins: midW,
        losses: midL,
        total: midTotal,
        winRate: midTotal > 0 ? (midW / midTotal) * 100 : 0,
        pctOfTotal: total > 0 ? (midTotal / total) * 100 : 0,
      },
      {
        key: "control",
        name: "Control / Inevitability",
        turnRange: "11+ Turns",
        desc: "Late-game answers & victory locks",
        icon: Hourglass,
        color: "#38BDF8", // Cyan / Blue
        bgColor: "rgba(56, 189, 248, 0.08)",
        borderColor: "rgba(56, 189, 248, 0.3)",
        wins: ctrlW,
        losses: ctrlL,
        total: ctrlTotal,
        winRate: ctrlTotal > 0 ? (ctrlW / ctrlTotal) * 100 : 0,
        pctOfTotal: total > 0 ? (ctrlTotal / total) * 100 : 0,
      },
    ];

    // Find style with highest win rate (min 3 games) or highest volume
    const sortedBest = [...pillarList].filter((p) => p.total >= 2).sort((a, b) => b.winRate - a.winRate);
    const best = sortedBest[0] || pillarList[1];

    return {
      pillars: pillarList,
      dominantStyle: best,
      totalTracked: total,
    };
  }, [winLossMatches]);

  const hasData = totalTracked > 0;

  // Radar Triangle coordinates
  // Aggro: Top (x=70, y=15)
  // Midrange: Bottom Right (x=125, y=95)
  // Control: Bottom Left (x=15, y=95)
  const trianglePoints = useMemo(() => {
    const aggroWeight = Math.max(0.1, (pillars[0]?.winRate || 50) / 100);
    const midWeight = Math.max(0.1, (pillars[1]?.winRate || 50) / 100);
    const ctrlWeight = Math.max(0.1, (pillars[2]?.winRate || 50) / 100);

    const cx = 70, cy = 60;
    // Normalized displacement from center towards vertices
    const p1 = { x: cx, y: cy - 45 * aggroWeight }; // Top (Aggro)
    const p2 = { x: cx + 45 * midWeight * 0.866, y: cy + 45 * midWeight * 0.5 }; // Bottom Right (Midrange)
    const p3 = { x: cx - 45 * ctrlWeight * 0.866, y: cy + 45 * ctrlWeight * 0.5 }; // Bottom Left (Control)

    return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;
  }, [pillars]);

  return (
    <WidgetShell
      title="Archetype Pace Matrix"
      subtitle="Performance breakdown by game length & pace"
      icon={<Target className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No match turn records found"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2">
        {/* Top Split: Triangular Radar Map + Strongest Domain Header */}
        <div className="flex items-center justify-between gap-3 p-2 bg-white/[0.02] border border-white/10">
          {/* Triangular Radar SVG */}
          <div className="relative w-28 h-24 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 140 120" className="w-full h-full overflow-visible">
              {/* Outer Reference Triangle */}
              <polygon
                points="70,12 125,98 15,98"
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              {/* Internal Spoke Lines */}
              <line x1="70" y1="60" x2="70" y2="12" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <line x1="70" y1="60" x2="125" y2="98" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <line x1="70" y1="60" x2="15" y2="98" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

              {/* Dynamic Archetype Triangle */}
              <polygon
                points={trianglePoints}
                fill={dominantStyle.color}
                fillOpacity="0.25"
                stroke={dominantStyle.color}
                strokeWidth="2"
                className="transition-all duration-700 ease-out"
              />

              {/* Vertex Badges */}
              <circle cx="70" cy="12" r="3.5" fill="#EF4444" />
              <circle cx="125" cy="98" r="3.5" fill="#F59E0B" />
              <circle cx="15" cy="98" r="3.5" fill="#38BDF8" />
            </svg>
          </div>

          {/* Strongest Archetype Domain */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-neutral-400">
                Peak Proficiency Archetype
              </span>
              <span
                className="text-[11px] font-mono font-black uppercase px-2 py-0.5 border"
                style={{
                  color: dominantStyle.color,
                  borderColor: dominantStyle.borderColor,
                  backgroundColor: dominantStyle.bgColor,
                }}
              >
                {dominantStyle.name.split(" / ")[0]} Specialist
              </span>
            </div>
            <p className="text-[11px] font-sans text-neutral-300 mt-1 leading-snug">
              Highest win rate in <span className="font-bold text-white">{dominantStyle.name}</span> ({dominantStyle.turnRange}) with <span className="font-mono font-bold text-white">{dominantStyle.winRate.toFixed(0)}% WR</span> over {dominantStyle.total} matches.
            </p>
          </div>
        </div>

        {/* 3 Pillars Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1 items-stretch">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.key}
                className="flex flex-col justify-between p-2 border transition-all"
                style={{
                  backgroundColor: pillar.bgColor,
                  borderColor: pillar.borderColor,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: pillar.color }} />
                    <span className="font-sans font-bold text-xs text-white truncate">
                      {pillar.name.split(" / ")[0]}
                    </span>
                  </div>
                  <span className="text-[9.5px] font-mono font-bold" style={{ color: pillar.color }}>
                    {pillar.turnRange}
                  </span>
                </div>

                {/* Center WR */}
                <div className="my-1.5 flex flex-col items-center text-center">
                  <span
                    className="font-mono font-black text-base tabular-nums"
                    style={{ color: pillar.total > 0 ? (pillar.winRate >= 50 ? winColor : lossColor) : "#737373" }}
                  >
                    {pillar.total > 0 ? `${pillar.winRate.toFixed(0)}%` : "N/A"}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                    {pillar.wins}W - {pillar.losses}L ({pillar.pctOfTotal.toFixed(0)}% vol)
                  </span>
                </div>

                {/* Desc */}
                <div className="text-[9.5px] font-mono text-neutral-400 text-center pt-1 border-t border-white/5 truncate">
                  {pillar.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>{totalTracked} turn-tracked matches categorized</span>
          <span>Aggro (≤5) · Midrange (6-10) · Control (11+)</span>
        </div>
      </div>
    </WidgetShell>
  );
});

ArchetypeClashWidget.displayName = "ArchetypeClashWidget";
