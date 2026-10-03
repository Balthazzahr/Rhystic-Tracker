import React, { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Coins, Layers, CheckCircle2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { EconomySnapshot } from "./economyCommon";

type TrendTab = "currencies" | "vault" | "wildcards";
type TimeRange = "24h" | "7d" | "30d" | "all";

export const EconomyTrendsWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const [history, setHistory] = useState<EconomySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TrendTab>("currencies");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const data = await invoke<EconomySnapshot[]>("get_economy_history", { limit: 500 });
        if (isMounted) {
          // Reverse so oldest snapshot is first, progressing left-to-right to newest
          setHistory([...data].reverse());
        }
      } catch (err) {
        console.error("Failed to fetch economy history:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const chartData = useMemo(() => {
    if (history.length === 0) return [];

    const now = Date.now();
    let filtered = history;

    if (timeRange === "24h") {
      const cutoff = now - 24 * 3600 * 1000;
      filtered = history.filter((s) => {
        const t = new Date(s.timestamp).getTime();
        return isNaN(t) || t >= cutoff;
      });
      // If cutoff removed everything except latest, keep at least the last 2 snapshots so a line can draw
      if (filtered.length < 2 && history.length >= 2) {
        filtered = history.slice(-2);
      }
    } else if (timeRange === "7d") {
      const cutoff = now - 7 * 86400 * 1000;
      filtered = history.filter((s) => {
        const t = new Date(s.timestamp).getTime();
        return isNaN(t) || t >= cutoff;
      });
      if (filtered.length < 2 && history.length >= 2) {
        filtered = history.slice(-2);
      }
    } else if (timeRange === "30d") {
      const cutoff = now - 30 * 86400 * 1000;
      filtered = history.filter((s) => {
        const t = new Date(s.timestamp).getTime();
        return isNaN(t) || t >= cutoff;
      });
      if (filtered.length < 2 && history.length >= 2) {
        filtered = history.slice(-2);
      }
    }

    // For 7d, 30d, and all: Aggregate snapshots by calendar day (taking the latest snapshot per day)
    // BUT always keep the latest snapshot so current live balance is exact.
    if (timeRange !== "24h" && filtered.length > 5) {
      const byDay = new Map<string, EconomySnapshot>();
      for (const snap of filtered) {
        const d = new Date(snap.timestamp);
        const dayKey = isNaN(d.getTime()) ? snap.timestamp.slice(0, 10) : d.toISOString().slice(0, 10);
        // Overwrite so last snapshot of that day is preserved
        byDay.set(dayKey, snap);
      }

      // Ensure the very first snapshot is preserved as baseline
      const aggregated = Array.from(byDay.values());
      if (filtered.length > 0 && aggregated.length > 0 && aggregated[0].id !== filtered[0].id) {
        aggregated.unshift(filtered[0]);
      }
      filtered = aggregated;
    }

    return filtered.map((snap) => {
      const date = new Date(snap.timestamp);
      let timeStr: string;

      if (isNaN(date.getTime())) {
        timeStr = snap.timestamp;
      } else if (timeRange === "24h") {
        timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      } else {
        timeStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }

      return {
        timestamp: snap.timestamp,
        formattedTime: timeStr,
        gold: snap.gold,
        gems: snap.gems,
        vault_pct: snap.vault_progress_pct,
        wc_common: snap.wc_common,
        wc_uncommon: snap.wc_uncommon,
        wc_rare: snap.wc_rare,
        wc_mythic: snap.wc_mythic,
      };
    }).map((item, idx, arr) => {
      // Compute delta relative to previous point in timeline
      const prev = idx > 0 ? arr[idx - 1] : null;
      const deltaM = prev ? item.wc_mythic - prev.wc_mythic : 0;
      const deltaR = prev ? item.wc_rare - prev.wc_rare : 0;
      const deltaU = prev ? item.wc_uncommon - prev.wc_uncommon : 0;
      const deltaC = prev ? item.wc_common - prev.wc_common : 0;

      const hasCrafted = deltaM < 0 || deltaR < 0 || deltaU < 0 || deltaC < 0;
      const hasAdded = deltaM > 0 || deltaR > 0 || deltaU > 0 || deltaC > 0;

      return {
        ...item,
        deltaM,
        deltaR,
        deltaU,
        deltaC,
        hasCrafted,
        hasAdded,
      };
    });
  }, [history, timeRange]);

  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Time Range Selector */}
      <div className="flex items-center bg-white/[0.04] p-0.5 border border-white/10 rounded-xs">
        {(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase transition-colors cursor-pointer ${
              timeRange === r
                ? "bg-white/[0.12] text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Metric Tabs */}
      <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 border border-white/10 rounded-xs">
        <button
          onClick={() => setActiveTab("currencies")}
          className={`px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeTab === "currencies"
              ? "bg-white/[0.12] text-amber-300"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Currencies
        </button>
        <button
          onClick={() => setActiveTab("vault")}
          className={`px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeTab === "vault"
              ? "bg-white/[0.12] text-purple-300"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Vault %
        </button>
        <button
          onClick={() => setActiveTab("wildcards")}
          className={`px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeTab === "wildcards"
              ? "bg-white/[0.12] text-sky-300"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Wildcards
        </button>
      </div>
    </div>
  );

  return (
    <WidgetShell
      title="Economy Trends"
      subtitle={`${chartData.length} data points (${timeRange.toUpperCase()})`}
      icon={<TrendingUp className="w-3.5 h-3.5 text-amber-400" />}
      headerActions={headerActions}
      isLoading={loading}
      isEmpty={history.length === 0 && !loading}
      emptyMessage="No economy snapshots recorded yet."
    >
      <div className="flex-1 min-h-[160px] w-full flex flex-col pt-1">
        {history.length === 1 && (
          <div className="text-[10px] font-sans text-neutral-400 pb-1 flex items-center justify-between">
            <span>First baseline snapshot recorded. Subsequent changes (earnings & purchases) will extend the timeline.</span>
          </div>
        )}

        <div className="flex-1 min-h-[150px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {activeTab === "currencies" ? (
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <XAxis
                  dataKey="formattedTime"
                  stroke="#525252"
                  tick={{ fill: "#a3a3a3", fontSize: 10 }}
                  tickLine={false}
                />
                {/* Left YAxis: Gold */}
                <YAxis
                  yAxisId="gold"
                  stroke="#f59e0b"
                  tick={{ fill: "#f59e0b", fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  domain={["auto", "auto"]}
                />
                {/* Right YAxis: Gems */}
                <YAxis
                  yAxisId="gems"
                  orientation="right"
                  stroke="#06b6d4"
                  tick={{ fill: "#06b6d4", fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(10, 10, 10, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.15)",
                    borderRadius: "2px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                  labelStyle={{ color: "#ffffff", fontWeight: "bold", marginBottom: "4px" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", fontFamily: "sans-serif" }}
                />
                <Line
                  yAxisId="gold"
                  type="monotone"
                  dataKey="gold"
                  name="Gold"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f59e0b" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="gems"
                  type="monotone"
                  dataKey="gems"
                  name="Gems"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#06b6d4" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : activeTab === "vault" ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="vaultGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c084fc" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="formattedTime"
                  stroke="#525252"
                  tick={{ fill: "#a3a3a3", fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#c084fc"
                  tick={{ fill: "#c084fc", fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, (dataMax: number) => Math.max(120, Math.ceil(dataMax / 50) * 50)]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(10, 10, 10, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.15)",
                    borderRadius: "2px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                  formatter={(val: any) => [`${Number(val).toFixed(1)}%`, "Vault Progress"]}
                  labelStyle={{ color: "#ffffff", fontWeight: "bold" }}
                />
                <ReferenceLine
                  y={100}
                  stroke="#eab308"
                  strokeDasharray="3 3"
                  label={{ value: "100% Ready", fill: "#eab308", fontSize: 10, position: "insideTopLeft" }}
                />
                <Area
                  type="monotone"
                  dataKey="vault_pct"
                  name="Vault Progress"
                  stroke="#c084fc"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#vaultGradient)"
                  dot={{ r: 3, fill: "#c084fc" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <XAxis
                  dataKey="formattedTime"
                  stroke="#525252"
                  tick={{ fill: "#a3a3a3", fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#a3a3a3"
                  tick={{ fill: "#a3a3a3", fontSize: 10 }}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const dataPoint = payload[0]?.payload;
                    const hasCrafted = dataPoint?.hasCrafted;
                    const hasAdded = dataPoint?.hasAdded;

                    return (
                      <div className="bg-neutral-950/95 border border-white/20 p-2.5 shadow-xl text-xs font-mono min-w-[190px]">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
                          <span className="font-bold text-white">{label}</span>
                          {dataPoint?.timestamp && (
                            <span className="text-[10px] text-neutral-400">
                              {new Date(dataPoint.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>

                        {/* Crafting / Added Badges */}
                        {hasCrafted && (
                          <div className="mb-2 p-1.5 bg-rose-500/15 border border-rose-500/40 text-rose-300 font-sans text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <span className="font-mono font-bold text-rose-400">✕</span>
                              <span>Crafted Cards</span>
                            </span>
                            <span className="font-mono text-[10px] text-rose-200">
                              {[
                                dataPoint.deltaM < 0 ? `${dataPoint.deltaM}M` : null,
                                dataPoint.deltaR < 0 ? `${dataPoint.deltaR}R` : null,
                                dataPoint.deltaU < 0 ? `${dataPoint.deltaU}U` : null,
                                dataPoint.deltaC < 0 ? `${dataPoint.deltaC}C` : null,
                              ].filter(Boolean).join(" ")}
                            </span>
                          </div>
                        )}

                        {hasAdded && (
                          <div className="mb-2 p-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-sans text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <span className="font-mono font-bold text-emerald-400">◆</span>
                              <span>Added Wildcards</span>
                            </span>
                            <span className="font-mono text-[10px] text-emerald-200">
                              {[
                                dataPoint.deltaM > 0 ? `+${dataPoint.deltaM}M` : null,
                                dataPoint.deltaR > 0 ? `+${dataPoint.deltaR}R` : null,
                                dataPoint.deltaU > 0 ? `+${dataPoint.deltaU}U` : null,
                                dataPoint.deltaC > 0 ? `+${dataPoint.deltaC}C` : null,
                              ].filter(Boolean).join(" ")}
                            </span>
                          </div>
                        )}

                        {/* Balance lines */}
                        <div className="space-y-1">
                          {payload.map((entry: any) => (
                            <div key={entry.dataKey} className="flex items-center justify-between text-[11px]">
                              <span style={{ color: entry.color }} className="font-sans font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                {entry.name}:
                              </span>
                              <span className="font-bold text-neutral-200 tabular-nums">
                                {entry.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "sans-serif" }} />
                <Line
                  type="monotone"
                  dataKey="wc_mythic"
                  name="Mythic"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!cx || !cy) return <React.Fragment key={`dot-m-${cx}-${cy}`} />;
                    if (payload?.deltaM < 0) {
                      return (
                        <g key={`craft-m-${cx}-${cy}`}>
                          <circle cx={cx} cy={cy} r={7} fill="rgba(244, 63, 94, 0.25)" />
                          <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" />
                          <line x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy - 4} stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" />
                        </g>
                      );
                    }
                    if (payload?.deltaM > 0) {
                      return (
                        <g key={`add-m-${cx}-${cy}`}>
                          <polygon
                            points={`${cx},${cy - 5.5} ${cx + 5.5},${cy} ${cx},${cy + 5.5} ${cx - 5.5},${cy}`}
                            fill="#10b981"
                            stroke="#34d399"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    }
                    return <circle key={`dot-m-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="#f97316" />;
                  }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="wc_rare"
                  name="Rare"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!cx || !cy) return <React.Fragment key={`dot-r-${cx}-${cy}`} />;
                    if (payload?.deltaR < 0) {
                      return (
                        <g key={`craft-r-${cx}-${cy}`}>
                          <circle cx={cx} cy={cy} r={7} fill="rgba(244, 63, 94, 0.25)" />
                          <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" />
                          <line x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy - 4} stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" />
                        </g>
                      );
                    }
                    if (payload?.deltaR > 0) {
                      return (
                        <g key={`add-r-${cx}-${cy}`}>
                          <polygon
                            points={`${cx},${cy - 5.5} ${cx + 5.5},${cy} ${cx},${cy + 5.5} ${cx - 5.5},${cy}`}
                            fill="#10b981"
                            stroke="#34d399"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    }
                    return <circle key={`dot-r-${cx}-${cy}`} cx={cx} cy={cy} r={3} fill="#fbbf24" />;
                  }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="wc_uncommon"
                  name="Uncommon"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!cx || !cy) return <React.Fragment key={`dot-u-${cx}-${cy}`} />;
                    if (payload?.deltaU < 0) {
                      return (
                        <g key={`craft-u-${cx}-${cy}`}>
                          <circle cx={cx} cy={cy} r={6} fill="rgba(244, 63, 94, 0.25)" />
                          <line x1={cx - 3.5} y1={cy - 3.5} x2={cx + 3.5} y2={cy + 3.5} stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" />
                          <line x1={cx - 3.5} y1={cy + 3.5} x2={cx + 3.5} y2={cy - 3.5} stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" />
                        </g>
                      );
                    }
                    if (payload?.deltaU > 0) {
                      return (
                        <g key={`add-u-${cx}-${cy}`}>
                          <polygon
                            points={`${cx},${cy - 4.5} ${cx + 4.5},${cy} ${cx},${cy + 4.5} ${cx - 4.5},${cy}`}
                            fill="#10b981"
                            stroke="#34d399"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    }
                    return <circle key={`dot-u-${cx}-${cy}`} cx={cx} cy={cy} r={2.5} fill="#38bdf8" />;
                  }}
                  activeDot={{ r: 4.5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="wc_common"
                  name="Common"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!cx || !cy) return <React.Fragment key={`dot-c-${cx}-${cy}`} />;
                    if (payload?.deltaC < 0) {
                      return (
                        <g key={`craft-c-${cx}-${cy}`}>
                          <circle cx={cx} cy={cy} r={6} fill="rgba(244, 63, 94, 0.25)" />
                          <line x1={cx - 3.5} y1={cy - 3.5} x2={cx + 3.5} y2={cy + 3.5} stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" />
                          <line x1={cx - 3.5} y1={cy + 3.5} x2={cx + 3.5} y2={cy - 3.5} stroke="#f43f5e" strokeWidth={2} strokeLinecap="round" />
                        </g>
                      );
                    }
                    if (payload?.deltaC > 0) {
                      return (
                        <g key={`add-c-${cx}-${cy}`}>
                          <polygon
                            points={`${cx},${cy - 4.5} ${cx + 4.5},${cy} ${cx},${cy + 4.5} ${cx - 4.5},${cy}`}
                            fill="#10b981"
                            stroke="#34d399"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    }
                    return <circle key={`dot-c-${cx}-${cy}`} cx={cx} cy={cy} r={2.5} fill="#94a3b8" />;
                  }}
                  activeDot={{ r: 4.5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </WidgetShell>
  );
});
