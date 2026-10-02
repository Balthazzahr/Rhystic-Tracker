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
                  contentStyle={{
                    backgroundColor: "rgba(10, 10, 10, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.15)",
                    borderRadius: "2px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                  labelStyle={{ color: "#ffffff", fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "sans-serif" }} />
                <Line
                  type="monotone"
                  dataKey="wc_mythic"
                  name="Mythic"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f97316" }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="wc_rare"
                  name="Rare"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#fbbf24" }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="wc_uncommon"
                  name="Uncommon"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={{ r: 2.5, fill: "#38bdf8" }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="wc_common"
                  name="Common"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={{ r: 2.5, fill: "#94a3b8" }}
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
