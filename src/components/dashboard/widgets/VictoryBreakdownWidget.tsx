import React, { useMemo, useState } from "react";
import { Flag, Swords, Clock, Skull, Trophy, Flame } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { VictoryBreakdownModal, VictoryCategoryModalData } from "./VictoryBreakdownModal";

interface DonutSegment {
  key: string;
  label: string;
  count: number;
  pct: number;
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

export const VictoryBreakdownWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  onSelectMatch,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const [viewMode, setViewMode] = useState<"win" | "loss">("win");
  const [hoveredCatId, setHoveredCatId] = useState<string | null>(null);
  const [modalCategory, setModalCategory] = useState<VictoryCategoryModalData | null>(null);

  const prefix = viewMode === "win" ? "Opponent" : "Player";

  const { categories, totalModeMatches, totalAnalyzed } = useMemo(() => {
    let trackedEarly = 0;
    let trackedLate = 0;
    let trackedLethal = 0;
    let trackedTimeout = 0;
    let trackedDeckout = 0;
    let trackedTotal = 0;

    const legacyList: { turns: number }[] = [];

    const bracketCounts: Record<
      string,
      { early: number; late: number; lethal: number; timeout: number; deckout: number; total: number }
    > = {
      le_5: { early: 0, late: 0, lethal: 0, timeout: 0, deckout: 0, total: 0 },
      t_6_7: { early: 0, late: 0, lethal: 0, timeout: 0, deckout: 0, total: 0 },
      t_8_10: { early: 0, late: 0, lethal: 0, timeout: 0, deckout: 0, total: 0 },
      t_11_14: { early: 0, late: 0, lethal: 0, timeout: 0, deckout: 0, total: 0 },
      t_15_plus: { early: 0, late: 0, lethal: 0, timeout: 0, deckout: 0, total: 0 },
    };

    const getBracket = (t: number): string => {
      if (!t || t <= 5) return "le_5";
      if (t <= 7) return "t_6_7";
      if (t <= 10) return "t_8_10";
      if (t <= 14) return "t_11_14";
      return "t_15_plus";
    };

    for (const m of winLossMatches || []) {
      if (m.result !== viewMode) continue;

      const reason = (m.result_reason || "").toLowerCase();
      const oppLife = m.opponent_life_end;
      const playerLife = m.player_life_end;
      const endLife = viewMode === "win" ? oppLife : playerLife;
      const turns = m.turns || 0;
      const isTracked = !!m.result_reason || (endLife !== undefined && endLife !== null);

      if (isTracked) {
        trackedTotal++;
        const brk = bracketCounts[getBracket(turns)];
        brk.total++;

        if (reason.includes("concede") || reason.includes("scoop")) {
          if (turns <= 5) {
            trackedEarly++;
            brk.early++;
          } else {
            trackedLate++;
            brk.late++;
          }
        } else if (reason.includes("timeout") || reason.includes("timer")) {
          trackedTimeout++;
          brk.timeout++;
        } else if (endLife !== undefined && endLife !== null && endLife <= 0) {
          trackedLethal++;
          brk.lethal++;
        } else if (reason.includes("damage") || reason.includes("lethal")) {
          trackedLethal++;
          brk.lethal++;
        } else if (reason.includes("game") && endLife !== undefined && endLife !== null && endLife > 0) {
          trackedDeckout++;
          brk.deckout++;
        } else if (endLife !== undefined && endLife !== null && endLife > 0) {
          if (turns <= 5) {
            trackedEarly++;
            brk.early++;
          } else {
            trackedLate++;
            brk.late++;
          }
        } else {
          trackedLethal++;
          brk.lethal++;
        }
      } else {
        legacyList.push({ turns });
      }
    }

    // Apply Method 2 (Turn-bracket stratified heuristic) for legacy matches
    let legEarly = 0;
    let legLate = 0;
    let legLethal = 0;
    let legTimeout = 0;
    let legDeckout = 0;

    for (const m of legacyList) {
      const turns = m.turns || 0;
      const brkKey = getBracket(turns);
      const brk = bracketCounts[brkKey];

      if (brk && brk.total > 0) {
        legEarly += brk.early / brk.total;
        legLate += brk.late / brk.total;
        legLethal += brk.lethal / brk.total;
        legTimeout += brk.timeout / brk.total;
        legDeckout += brk.deckout / brk.total;
      } else if (trackedTotal > 0) {
        legEarly += trackedEarly / trackedTotal;
        legLate += trackedLate / trackedTotal;
        legLethal += trackedLethal / trackedTotal;
        legTimeout += trackedTimeout / trackedTotal;
        legDeckout += trackedDeckout / trackedTotal;
      } else {
        if (turns <= 5) legEarly += 1;
        else legLate += 0.8;
        legLethal += 0.15;
        legTimeout += 0.03;
        legDeckout += 0.02;
      }
    }

    let finalEarly = trackedEarly + Math.round(legEarly);
    let finalLate = trackedLate + Math.round(legLate);
    let finalLethal = trackedLethal + Math.round(legLethal);
    let finalTimeout = trackedTimeout + Math.round(legTimeout);
    let finalDeckout = trackedDeckout + Math.round(legDeckout);

    const totalTarget = trackedTotal + legacyList.length;
    const computedSum = finalEarly + finalLate + finalLethal + finalTimeout + finalDeckout;
    if (computedSum !== totalTarget && totalTarget > 0) {
      finalLate += totalTarget - computedSum;
    }

    const calcCat = (
      id: string,
      label: string,
      description: string,
      icon: React.ReactNode,
      count: number,
      color: string
    ): VictoryCategoryModalData => ({
      id,
      label,
      description,
      icon,
      count,
      pct: totalTarget > 0 ? Math.round((count / totalTarget) * 1000) / 10 : 0,
      color,
    });

    const isWin = viewMode === "win";

    const cats: VictoryCategoryModalData[] = [
      calcCat(
        "late_concede",
        `${prefix} Late Concede (Tactical Surrender)`,
        isWin ? "Opponent surrendered after turn 5" : "You surrendered after turn 5",
        <Flag className="w-3.5 h-3.5 text-indigo-400" />,
        finalLate,
        "#6366F1"
      ),
      calcCat(
        "lethal",
        `${prefix} Lethal Combat / Damage`,
        isWin ? "Reduced opponent to 0 or negative HP" : "Player reduced to 0 or negative HP",
        <Swords className="w-3.5 h-3.5 text-rose-400" />,
        finalLethal,
        "#F43F5E"
      ),
      calcCat(
        "early_concede",
        `${prefix} Early Concede (Salty Scoop)`,
        isWin ? "Opponent bailed on turn 0–5" : "You bailed on turn 0–5",
        <Flame className="w-3.5 h-3.5 text-amber-500" />,
        finalEarly,
        "#F59E0B"
      ),
      calcCat(
        "timeout",
        `${prefix} Timeout`,
        isWin ? "Opponent clock / timer expired" : "Player clock / timer expired",
        <Clock className="w-3.5 h-3.5 text-sky-400" />,
        finalTimeout,
        "#38BDF8"
      ),
      calcCat(
        "deckout",
        isWin ? `${prefix} Deck-Out / Alternate Win` : `${prefix} Deck-Out / Alternate Loss`,
        isWin
          ? "Opponent library depleted or alternate condition"
          : "Player library depleted or alternate condition",
        <Skull className="w-3.5 h-3.5 text-purple-400" />,
        finalDeckout,
        "#A855F7"
      ),
    ];

    return {
      categories: cats,
      totalModeMatches: totalTarget,
      totalAnalyzed: winLossMatches ? winLossMatches.length : 0,
    };
  }, [winLossMatches, viewMode, prefix]);

  // Donut geometry in 160x160 viewBox
  const cx = 80;
  const cy = 80;
  const radius = 74;
  const innerRadius = 46;

  const donutSegments: DonutSegment[] = useMemo(() => {
    if (totalModeMatches === 0) return [];

    let curAngle = 0;
    const segs: DonutSegment[] = [];

    for (const cat of categories) {
      if (cat.count === 0) continue;
      const angleSize = (cat.count / totalModeMatches) * 360;
      const start = curAngle;
      const end = curAngle + angleSize;
      curAngle = end;

      segs.push({
        key: cat.id,
        label: cat.label,
        count: cat.count,
        pct: cat.pct,
        color: cat.color,
        pathD: getDonutArc(cx, cy, radius, innerRadius, start, end),
      });
    }

    return segs;
  }, [categories, totalModeMatches, radius, innerRadius]);

  const activeHover = hoveredCatId
    ? categories.find((c) => c.id === hoveredCatId) || null
    : null;

  const hasData = totalModeMatches > 0;

  const lateConcede = categories.find((c) => c.id === "late_concede");
  const earlyConcede = categories.find((c) => c.id === "early_concede");
  const totalConcedeRate = ((lateConcede?.pct || 0) + (earlyConcede?.pct || 0)).toFixed(1);

  return (
    <WidgetShell
      title={viewMode === "win" ? "Victory Breakdown" : "Defeat Breakdown"}
      subtitle={`${totalModeMatches} total ${viewMode === "win" ? "victories" : "defeats"}`}
      icon={<Trophy className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage={`No ${viewMode === "win" ? "victory" : "defeat"} records found`}
      headerActions={
        <div className="flex items-center border border-white/10 bg-black/40 p-0.5 rounded-none text-[10px] font-mono">
          <button
            type="button"
            onClick={() => {
              setViewMode("win");
              setHoveredCatId(null);
            }}
            className={`px-2 py-0.5 transition-colors cursor-pointer ${
              viewMode === "win"
                ? "bg-white/15 text-white font-bold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Victories
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("loss");
              setHoveredCatId(null);
            }}
            className={`px-2 py-0.5 transition-colors cursor-pointer ${
              viewMode === "loss"
                ? "bg-white/15 text-white font-bold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Defeats
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1">
        {/* Main Content Area: Donut Chart on Left, Categorized List on Right */}
        <div className="flex items-center justify-between gap-4 flex-1 min-h-0 w-full">
          {/* Left: Interactive SVG Pie / Donut Chart */}
          <div className="flex-1 min-w-[120px] max-w-[42%] h-full flex flex-col items-center justify-center p-1">
            <div className="relative w-full flex-1 min-h-0 max-h-[96%] aspect-square flex items-center justify-center">
              <svg viewBox="0 0 160 160" className="w-full h-full max-h-full max-w-full">
                {donutSegments.map((seg) => {
                  const isDimmed = hoveredCatId !== null && hoveredCatId !== seg.key;

                  return (
                    <path
                      key={seg.key}
                      d={seg.pathD}
                      fill={seg.color}
                      opacity={isDimmed ? 0.3 : 0.95}
                      className="cursor-pointer transition-opacity duration-200 hover:opacity-100"
                      onMouseEnter={() => setHoveredCatId(seg.key)}
                      onMouseLeave={() => setHoveredCatId(null)}
                      onClick={() => {
                        const target = categories.find((c) => c.id === seg.key);
                        if (target) setModalCategory(target);
                      }}
                    />
                  );
                })}
              </svg>

              {/* Central Hub Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
                {activeHover ? (
                  <>
                    <span
                      className="text-xl sm:text-2xl font-mono font-black tabular-nums leading-none"
                      style={{ color: activeHover.color }}
                    >
                      {activeHover.pct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] sm:text-xs font-mono text-neutral-300 mt-1 tabular-nums">
                      {activeHover.count} {viewMode === "win" ? "wins" : "losses"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums leading-none">
                      {totalModeMatches}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 mt-0.5 uppercase tracking-wider">
                      {viewMode === "win" ? "Victories" : "Defeats"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Detailed Breakdown Cards */}
          <div className="flex-1 min-w-[160px] max-w-[58%] flex flex-col justify-center space-y-1 overflow-y-auto max-h-full custom-scrollbar pr-0.5">
            {categories.map((cat) => {
              const isHovered = hoveredCatId === cat.id;

              return (
                <div
                  key={cat.id}
                  onClick={() => setModalCategory(cat)}
                  onMouseEnter={() => setHoveredCatId(cat.id)}
                  onMouseLeave={() => setHoveredCatId(null)}
                  className={`flex items-center justify-between py-1.5 px-2 border transition-all cursor-pointer ${
                    isHovered
                      ? "bg-white/[0.05] border-white/30"
                      : "bg-white/[0.02] border-white/5 hover:border-white/20"
                  }`}
                  title="Click to view match history and detailed breakdown"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.icon}
                    <div className="flex flex-col min-w-0">
                      <span className="font-sans font-semibold text-xs text-neutral-200 truncate leading-tight">
                        {cat.label}
                      </span>
                      <span className="text-[10px] font-sans text-neutral-400 truncate">
                        {cat.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0 ml-2">
                    <span className="text-neutral-300 font-bold">
                      {cat.count}
                    </span>
                    <span className="text-neutral-500 text-[11px]">
                      ({cat.pct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1.5 mt-1 border-t border-white/5">
          <span>
            Based on {totalModeMatches} {viewMode === "win" ? "wins" : "losses"} across {totalAnalyzed} matches
          </span>
          <span>
            Total Concede Rate: {totalConcedeRate}%
          </span>
        </div>
      </div>

      {/* Pop-up Window for Detailed Resolution Telemetry */}
      <VictoryBreakdownModal
        isOpen={!!modalCategory}
        onClose={() => setModalCategory(null)}
        category={modalCategory}
        viewMode={viewMode}
        allMatches={winLossMatches || []}
        onSelectMatch={onSelectMatch}
      />
    </WidgetShell>
  );
});

VictoryBreakdownWidget.displayName = "VictoryBreakdownWidget";
