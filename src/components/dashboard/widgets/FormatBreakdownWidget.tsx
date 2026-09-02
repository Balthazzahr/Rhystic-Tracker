import React, { useMemo } from "react";
import { Layers } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

export const FormatBreakdownWidget: React.FC<WidgetProps> = ({
  widget,
  winLossMatches,
  palette,
  isLoading = false,
}) => {
  const accentColor = palette?.accent || "#38BDF8";
  const limit = widget.settings?.limit || 8;

  const formatBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { format: string; wins: number; losses: number; total: number }
    >();
    for (const m of winLossMatches) {
      const f = m.format_name || "Other";
      const e = map.get(f) || { format: f, wins: 0, losses: 0, total: 0 };
      e.total++;
      if (m.result === "win") e.wins++;
      else e.losses++;
      map.set(f, e);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
  }, [winLossMatches, limit]);

  return (
    <WidgetShell
      title="Format Breakdown"
      subtitle={`${formatBreakdown.length} formats`}
      icon={<Layers className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      isLoading={isLoading}
      isEmpty={formatBreakdown.length === 0}
      emptyMessage="No format data recorded"
    >
      <div className="flex flex-col space-y-1.5 w-full">
        {formatBreakdown.map((f) => {
          const wr = f.total > 0 ? Math.round((f.wins / f.total) * 100) : 0;
          return (
            <div
              key={f.format}
              className="flex items-center justify-between text-xs font-sans py-1.5 px-2.5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors rounded-xs"
            >
              <span className="text-neutral-200 font-medium truncate mr-2">
                {f.format}
              </span>
              <div className="flex items-center gap-2 shrink-0 tabular-nums text-[11px]">
                <span className="text-neutral-400">
                  {f.total} {f.total === 1 ? "game" : "games"}
                </span>
                <span className="text-white/40">·</span>
                <span className={`font-semibold ${wr >= 50 ? "text-white" : "text-neutral-400"}`}>
                  {wr}% <span className="font-normal text-neutral-500">WR</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
};
