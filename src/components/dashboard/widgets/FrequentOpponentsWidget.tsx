import React, { useMemo } from "react";
import { Users, ExternalLink } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

interface OpponentStat {
  name: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  lastPlayed: string;
}

export const FrequentOpponentsWidget: React.FC<WidgetProps> = React.memo(({
  widget,
  winLossMatches,
  palette,
  onFilterOpponent,
  customColors,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const limit = widget.settings?.limit || 6;
  const winColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const topOpponents = useMemo(() => {
    if (!winLossMatches || winLossMatches.length === 0) return [];

    const oppMap = new Map<string, OpponentStat>();

    for (const m of winLossMatches) {
      const name = (m.opponent_name || "").trim();
      if (!name) continue;

      const existing = oppMap.get(name) || {
        name,
        wins: 0,
        losses: 0,
        total: 0,
        winRate: 0,
        lastPlayed: m.timestamp,
      };

      existing.total++;
      if (m.result === "win") existing.wins++;
      else existing.losses++;

      if (
        new Date(m.timestamp).getTime() > new Date(existing.lastPlayed).getTime()
      ) {
        existing.lastPlayed = m.timestamp;
      }

      oppMap.set(name, existing);
    }

    const list = Array.from(oppMap.values()).map((item) => ({
      ...item,
      winRate: Math.round((item.wins / item.total) * 1000) / 10,
    }));

    // Sort primarily by matches played descending, secondarily by lastPlayed descending
    list.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime();
    });

    return list.slice(0, limit);
  }, [winLossMatches, limit]);

  return (
    <WidgetShell
      title="Frequent Opponents"
      subtitle={`${topOpponents.length} tracked rivals`}
      icon={<Users className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={topOpponents.length === 0}
      emptyMessage="No opponent history recorded yet"
    >
      <div className="flex flex-col space-y-2 w-full pt-1">
        {topOpponents.map((opp) => {
          const winPct = opp.total > 0 ? (opp.wins / opp.total) * 100 : 0;

          return (
            <div
              key={opp.name}
              onClick={() => onFilterOpponent?.(opp.name)}
              className="group relative flex flex-col p-2 bg-white/[0.02] border border-white/5 hover:border-white/20 hover:bg-white/[0.05] transition-all cursor-pointer select-none"
              title={`View match history vs ${opp.name}`}
            >
              {/* Top Row: Name and W-L / Win Rate */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-sans font-semibold text-neutral-200 group-hover:text-white truncate transition-colors">
                    {opp.name}
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>

                <div className="flex items-center gap-2 shrink-0 tabular-nums text-xs font-mono">
                  <span className="text-neutral-400 text-[11px]">
                    <span style={{ color: winColor }} className="font-bold">
                      {opp.wins}W
                    </span>
                    {" - "}
                    <span style={{ color: lossColor }} className="font-bold">
                      {opp.losses}L
                    </span>
                  </span>
                  <span className="text-neutral-600">·</span>
                  <span
                    className="font-bold text-xs"
                    style={{
                      color:
                        opp.winRate >= 50
                          ? winColor
                          : opp.winRate > 0
                            ? lossColor
                            : "#94A3B8",
                    }}
                  >
                    {opp.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Progress Bar: Visual Win vs Loss distribution */}
              <div className="w-full h-1.5 bg-neutral-800 flex overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${winPct}%`,
                    backgroundColor: winColor,
                  }}
                />
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${100 - winPct}%`,
                    backgroundColor: lossColor,
                  }}
                />
              </div>

              {/* Footer info: Total games and last played */}
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mt-1">
                <span>
                  {opp.total} {opp.total === 1 ? "match" : "matches"}
                </span>
                <span>
                  Last: {new Date(opp.lastPlayed).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
});
