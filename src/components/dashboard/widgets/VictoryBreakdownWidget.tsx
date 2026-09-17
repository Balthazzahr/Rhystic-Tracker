import React, { useMemo } from "react";
import { Flag, Swords, Clock, Skull, Trophy } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

interface VictoryCategory {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  pct: number;
  color: string;
}

export const VictoryBreakdownWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";

  const { categories, totalWins, totalAnalyzed } = useMemo(() => {
    let concedes = 0;
    let lethalDamage = 0;
    let timeouts = 0;
    let otherWins = 0;
    let winsCount = 0;

    for (const m of winLossMatches || []) {
      if (m.result !== "win") continue;
      winsCount++;

      const reason = (m.result_reason || "").toLowerCase();
      const oppLife = m.opponent_life_end;

      if (reason.includes("concede") || reason.includes("scoop")) {
        concedes++;
      } else if (reason.includes("timeout") || reason.includes("timer")) {
        timeouts++;
      } else if (oppLife !== undefined && oppLife !== null && oppLife <= 0) {
        lethalDamage++;
      } else if (reason.includes("damage") || reason.includes("lethal")) {
        lethalDamage++;
      } else {
        // If opponent conceded without explicit tag or scooped at positive life
        if (oppLife !== undefined && oppLife > 0) {
          concedes++;
        } else {
          otherWins++;
        }
      }
    }

    const calcCat = (
      id: string,
      label: string,
      description: string,
      icon: React.ReactNode,
      count: number,
      color: string
    ): VictoryCategory => ({
      id,
      label,
      description,
      icon,
      count,
      pct: winsCount > 0 ? Math.round((count / winsCount) * 1000) / 10 : 0,
      color,
    });

    const cats: VictoryCategory[] = [
      calcCat("concede", "Opponent Conceded", "Early scoop or surrender", <Flag className="w-3.5 h-3.5 text-amber-400" />, concedes, "#F59E0B"),
      calcCat("lethal", "Lethal Combat / Damage", "Reduced opponent to 0 HP", <Swords className="w-3.5 h-3.5 text-rose-400" />, lethalDamage, "#F43F5E"),
      calcCat("timeout", "Opponent Timeout", "Clock / timer expiration", <Clock className="w-3.5 h-3.5 text-sky-400" />, timeouts, "#38BDF8"),
      calcCat("other", "Other / Strategic Win", "Mill, alternate win condition", <Skull className="w-3.5 h-3.5 text-purple-400" />, otherWins, "#A855F7"),
    ];

    return {
      categories: cats,
      totalWins: winsCount,
      totalAnalyzed: winLossMatches ? winLossMatches.length : 0,
    };
  }, [winLossMatches]);

  const hasData = totalWins > 0;

  return (
    <WidgetShell
      title="Victory Breakdown"
      subtitle={`${totalWins} total victories`}
      icon={<Trophy className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No victory records found"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2.5">
        {/* Multi-segment distribution bar */}
        <div className="space-y-1">
          <div className="h-3 w-full bg-black/50 border border-white/10 flex overflow-hidden">
            {categories.map((cat) =>
              cat.pct > 0 ? (
                <div
                  key={cat.id}
                  className="h-full transition-all duration-500 hover:opacity-90"
                  style={{
                    width: `${cat.pct}%`,
                    backgroundColor: cat.color,
                  }}
                  title={`${cat.label}: ${cat.count} wins (${cat.pct.toFixed(1)}%)`}
                />
              ) : null
            )}
          </div>
        </div>

        {/* Detailed Breakdown Cards */}
        <div className="space-y-1.5 flex-1 justify-center flex flex-col">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
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

              <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0">
                <span className="text-neutral-300 font-bold">
                  {cat.count} wins
                </span>
                <span className="text-neutral-500 text-[11px]">
                  ({cat.pct.toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>Based on {totalWins} wins across {totalAnalyzed} matches</span>
          <span>
            Concede Rate:{" "}
            {categories.find((c) => c.id === "concede")?.pct.toFixed(1) || 0}%
          </span>
        </div>
      </div>
    </WidgetShell>
  );
});

VictoryBreakdownWidget.displayName = "VictoryBreakdownWidget";
