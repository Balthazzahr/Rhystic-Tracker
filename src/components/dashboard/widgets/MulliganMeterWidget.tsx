import React, { useMemo } from "react";
import { Gauge, Sparkles, Layers, ShieldAlert, Award } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

interface MulliganTier {
  mulligans: number;
  handSize: number;
  label: string;
  sublabel: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  retentionRate: number; // vs 7-card baseline
  color: string;
}

export const MulliganMeterWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const { tiers, overallResilience, base7WR, totalTracked } = useMemo(() => {
    const buckets: Record<number, { wins: number; losses: number }> = {
      0: { wins: 0, losses: 0 },
      1: { wins: 0, losses: 0 },
      2: { wins: 0, losses: 0 },
      3: { wins: 0, losses: 0 }, // 3+
    };

    let total = 0;
    for (const m of winLossMatches || []) {
      if (m.player_mulligans === undefined || m.player_mulligans === null) continue;
      const mulls = Math.min(Math.max(0, m.player_mulligans), 3);
      if (m.result === "win") {
        buckets[mulls].wins++;
      } else {
        buckets[mulls].losses++;
      }
      total++;
    }

    const t0 = buckets[0].wins + buckets[0].losses;
    const baseWinRate = t0 > 0 ? (buckets[0].wins / t0) * 100 : 50;

    const tierList: MulliganTier[] = [
      {
        mulligans: 0,
        handSize: 7,
        label: "Keep 7 Cards",
        sublabel: "0 Mulligans (Clean Hand)",
        wins: buckets[0].wins,
        losses: buckets[0].losses,
        total: t0,
        winRate: t0 > 0 ? (buckets[0].wins / t0) * 100 : 0,
        retentionRate: 100,
        color: "#10B981", // Emerald
      },
      {
        mulligans: 1,
        handSize: 6,
        label: "Mull to 6",
        sublabel: "1 Mulligan (London Scry)",
        wins: buckets[1].wins,
        losses: buckets[1].losses,
        total: buckets[1].wins + buckets[1].losses,
        winRate: (buckets[1].wins + buckets[1].losses) > 0 ? (buckets[1].wins / (buckets[1].wins + buckets[1].losses)) * 100 : 0,
        retentionRate: baseWinRate > 0 && (buckets[1].wins + buckets[1].losses) > 0 ? (((buckets[1].wins / (buckets[1].wins + buckets[1].losses)) * 100) / baseWinRate) * 100 : 0,
        color: "#38BDF8", // Sky blue
      },
      {
        mulligans: 2,
        handSize: 5,
        label: "Mull to 5",
        sublabel: "2 Mulligans (Deep Dig)",
        wins: buckets[2].wins,
        losses: buckets[2].losses,
        total: buckets[2].wins + buckets[2].losses,
        winRate: (buckets[2].wins + buckets[2].losses) > 0 ? (buckets[2].wins / (buckets[2].wins + buckets[2].losses)) * 100 : 0,
        retentionRate: baseWinRate > 0 && (buckets[2].wins + buckets[2].losses) > 0 ? (((buckets[2].wins / (buckets[2].wins + buckets[2].losses)) * 100) / baseWinRate) * 100 : 0,
        color: "#F59E0B", // Amber
      },
      {
        mulligans: 3,
        handSize: 4,
        label: "Mull ≤4",
        sublabel: "3+ Mulligans (Desperation)",
        wins: buckets[3].wins,
        losses: buckets[3].losses,
        total: buckets[3].wins + buckets[3].losses,
        winRate: (buckets[3].wins + buckets[3].losses) > 0 ? (buckets[3].wins / (buckets[3].wins + buckets[3].losses)) * 100 : 0,
        retentionRate: baseWinRate > 0 && (buckets[3].wins + buckets[3].losses) > 0 ? (((buckets[3].wins / (buckets[3].wins + buckets[3].losses)) * 100) / baseWinRate) * 100 : 0,
        color: "#EF4444", // Red
      },
    ];

    // Resilience score: average weighted retention of 6 and 5 relative to 7
    const m6 = tierList[1];
    const m5 = tierList[2];
    let score = 0;
    let weights = 0;
    if (m6.total > 0) {
      score += m6.winRate * 2;
      weights += 2;
    }
    if (m5.total > 0) {
      score += m5.winRate * 1;
      weights += 1;
    }
    const resilienceScore = weights > 0 ? score / weights : baseWinRate;

    return {
      tiers: tierList,
      overallResilience: Math.round(resilienceScore),
      base7WR: baseWinRate,
      totalTracked: total,
    };
  }, [winLossMatches]);

  const hasData = totalTracked > 0;

  // Gauge angle calculation (0 to 180 deg)
  const gaugeAngle = Math.min(180, Math.max(0, (overallResilience / 100) * 180));

  return (
    <WidgetShell
      title="Mulligan Resilience Meter"
      subtitle="Win rate degradation across opening hands"
      icon={<Gauge className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={!hasData}
      emptyMessage="No mulligan telemetry recorded yet"
    >
      <div className="flex-1 flex flex-col justify-between select-none min-h-0 pt-1 space-y-2">
        {/* Top: Speedometer Gauge + Retention Summary */}
        <div className="flex items-center justify-between gap-4 p-2 bg-white/[0.02] border border-white/10">
          {/* Semicircular Radial Gauge */}
          <div className="relative w-28 h-16 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 120 70" className="w-full h-full overflow-visible">
              {/* Background Arc */}
              <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              {/* Colored Performance Gradient Segments */}
              <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                stroke="url(#mulliganGrad)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="157"
                strokeDashoffset={157 - (gaugeAngle / 180) * 157}
                className="transition-all duration-700 ease-out"
              />
              <defs>
                <linearGradient id="mulliganGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EF4444" />
                  <stop offset="50%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#10B981" />
                </linearGradient>
              </defs>

              {/* Needle Indicator */}
              <g transform={`rotate(${gaugeAngle - 90}, 60, 60)`} className="transition-transform duration-700 ease-out">
                <line x1="60" y1="60" x2="60" y2="18" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="60" cy="60" r="4" fill="#FFFFFF" />
              </g>
            </svg>

            {/* Needle value badge */}
            <div className="absolute bottom-0 text-center flex flex-col items-center">
              <span className="font-mono font-black text-xs text-white tabular-nums">
                {overallResilience}%
              </span>
            </div>
          </div>

          {/* Text Metrics & Rating */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-neutral-400">
                Mulligan Discipline Rating
              </span>
              <span
                className="text-[11px] font-mono font-black uppercase"
                style={{ color: overallResilience >= 50 ? winColor : lossColor }}
              >
                {overallResilience >= 55 ? "⚡ Elite Recoveries" : overallResilience >= 45 ? "🛡️ Solid Resilience" : "⚠️ High Drop-Off"}
              </span>
            </div>
            <p className="text-[11px] font-sans text-neutral-300 mt-0.5 leading-snug">
              Baseline on 7 is <span className="font-mono font-bold text-white">{base7WR.toFixed(0)}%</span>. When forced to mulligan, you maintain an average win rate of <span className="font-mono font-bold text-white">{overallResilience}%</span>.
            </p>
          </div>
        </div>

        {/* Bottom: 4 Tier Hand Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 items-stretch">
          {tiers.map((tier) => {
            const isBase = tier.mulligans === 0;
            return (
              <div
                key={`tier-${tier.mulligans}`}
                className="flex flex-col justify-between p-2 bg-white/[0.02] border border-white/10 hover:border-white/30 transition-all group"
              >
                {/* Header: Hand Size & Mini Visual Cards */}
                <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    {/* Fan of Mini Cards */}
                    <div className="flex -space-x-1 items-center">
                      {Array.from({ length: Math.min(tier.handSize, 4) }).map((_, i) => (
                        <div
                          key={i}
                          className="w-2.5 h-3.5 border border-black/40 rounded-[1px] shadow-sm transform group-hover:-translate-y-0.5 transition-transform"
                          style={{
                            backgroundColor: tier.color,
                            transform: `rotate(${(i - 1.5) * 4}deg)`,
                          }}
                        />
                      ))}
                    </div>
                    <span className="font-mono font-black text-xs text-white">
                      {tier.handSize} Cards
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-neutral-400">
                    {tier.mulligans === 0 ? "0 Mulls" : `${tier.mulligans} Mull${tier.mulligans > 1 ? "s" : ""}`}
                  </span>
                </div>

                {/* Win Rate Display */}
                <div className="my-1.5 flex flex-col items-center text-center">
                  <span
                    className="font-mono font-black text-base tabular-nums"
                    style={{ color: tier.total > 0 ? (tier.winRate >= 50 ? winColor : lossColor) : "#737373" }}
                  >
                    {tier.total > 0 ? `${tier.winRate.toFixed(0)}%` : "N/A"}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                    {tier.wins}W - {tier.losses}L ({tier.total}G)
                  </span>
                </div>

                {/* Drop-off relative to 7 */}
                <div className="text-[9.5px] font-mono text-center pt-1 border-t border-white/5 truncate">
                  {isBase ? (
                    <span className="text-emerald-400 font-bold">Standard Baseline</span>
                  ) : tier.total > 0 ? (
                    <span className={tier.winRate >= base7WR ? "text-emerald-400 font-bold" : "text-neutral-400"}>
                      {tier.winRate >= base7WR ? "+" : ""}{(tier.winRate - base7WR).toFixed(0)}% vs 7-card
                    </span>
                  ) : (
                    <span className="text-neutral-600">No data</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footnote */}
        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
          <span>{totalTracked} opening hands analyzed</span>
          <span>London Mulligan System</span>
        </div>
      </div>
    </WidgetShell>
  );
});

MulliganMeterWidget.displayName = "MulliganMeterWidget";
