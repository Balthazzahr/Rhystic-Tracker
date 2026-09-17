import React, { useMemo } from "react";
import { HeartPulse, ShieldCheck, ShieldAlert, Zap, Award } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

interface LifeTier {
  id: string;
  label: string;
  rangeLabel: string;
  icon: React.ReactNode;
  count: number;
  pct: number;
  color: string;
}

export const LifeClosenessWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";

  const { tiers, totalWinsWithLife, avgWinLife, lowestWinLife, flawlessWins } = useMemo(() => {
    let dominant = 0;
    let standard = 0;
    let clutch = 0;
    let lifeSum = 0;
    let minLife = 999;
    let flawless = 0;
    let count = 0;

    for (const m of winLossMatches || []) {
      if (m.result !== "win") continue;
      const life = m.player_life_end;
      if (life === undefined || life === null) continue;

      count++;
      lifeSum += life;
      if (life < minLife) minLife = life;
      if (life >= 20) flawless++;

      if (life >= 16) {
        dominant++;
      } else if (life >= 6) {
        standard++;
      } else {
        clutch++;
      }
    }

    const calcTier = (
      id: string,
      label: string,
      rangeLabel: string,
      icon: React.ReactNode,
      c: number,
      color: string
    ): LifeTier => ({
      id,
      label,
      rangeLabel,
      icon,
      count: c,
      pct: count > 0 ? Math.round((c / count) * 1000) / 10 : 0,
      color,
    });

    const tierList: LifeTier[] = [
      calcTier("dominant", "Dominating", "16+ HP", <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, dominant, "#10B981"),
      calcTier("standard", "Comfortable", "6–15 HP", <Zap className="w-3.5 h-3.5 text-sky-400" />, standard, "#38BDF8"),
      calcTier("clutch", "Clutch / Close", "1–5 HP", <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />, clutch, "#F59E0B"),
    ];

    return {
      tiers: tierList,
      totalWinsWithLife: count,
      avgWinLife: count > 0 ? Math.round((lifeSum / count) * 10) / 10 : 0,
      lowestWinLife: minLife < 999 ? minLife : 0,
      flawlessWins: flawless,
    };
  }, [winLossMatches]);

  const hasData = totalWinsWithLife > 0;

  return (
    <WidgetShell
      title="End-Game Life Totals"
      subtitle={`${avgWinLife} avg HP at victory`}
      icon={<HeartPulse className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No player life telemetry recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2.5">
        {/* Top Summary Badges */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col p-2 bg-white/[0.02] border border-white/5 text-center">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-400">
              Avg HP at Victory
            </span>
            <span className="text-base font-mono font-bold text-emerald-400 mt-0.5">
              {avgWinLife} HP
            </span>
          </div>
          <div className="flex flex-col p-2 bg-white/[0.02] border border-white/5 text-center">
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-400">
              Lowest HP Victory
            </span>
            <span className="text-base font-mono font-bold text-amber-400 mt-0.5">
              {lowestWinLife} HP
            </span>
          </div>
        </div>

        {/* Life Tiers Breakdown */}
        <div className="space-y-1.5 flex-1 justify-center flex flex-col">
          {tiers.map((t) => (
            <div
              key={t.id}
              className="flex flex-col p-2 bg-white/[0.02] border border-white/5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-center justify-between gap-1 mb-1 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  {t.icon}
                  <span className="font-sans font-semibold text-neutral-200 truncate text-[11px]">
                    {t.label}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    ({t.rangeLabel})
                  </span>
                </div>

                <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs shrink-0">
                  <span className="text-neutral-300 font-bold">
                    {t.count} wins
                  </span>
                  <span className="text-neutral-500 text-[11px]">
                    ({t.pct.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full bg-black/50 border border-white/5 overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${t.pct}%`,
                    backgroundColor: t.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>Based on {totalWinsWithLife} wins with tracked life</span>
          <span>Flawless (≥20 HP): {flawlessWins}</span>
        </div>
      </div>
    </WidgetShell>
  );
});

LifeClosenessWidget.displayName = "LifeClosenessWidget";
