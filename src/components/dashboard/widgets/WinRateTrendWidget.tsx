import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { ChevronRight, TrendingUp } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";

const localDateKey = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const matchDayKey = (m: { timestamp: string }): string => {
  const d = new Date(m.timestamp);
  if (isNaN(d.getTime())) return "";
  return localDateKey(d);
};

const dayLabel = (key: string, todayKey: string): string => {
  if (key === todayKey) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === localDateKey(y)) return "Yesterday";
  const parts = key.split("-");
  if (parts.length !== 3) return key;
  const [, mo, dy] = parts;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${parseInt(dy, 10)} ${months[parseInt(mo, 10) - 1]}`;
};

export const WinRateTrendWidget: React.FC<WidgetProps> = ({
  widget,
  winLossMatches,
  stats,
  palette,
  formatOptions = [],
  onUpdateSettings,
  customColors,
  isLoading = false,
}) => {
  const initialTimeRange = widget.settings?.timeRange || "14D";
  const initialFormat = widget.settings?.formatFilter || "ALL";

  const [chartTime, setChartTime] = useState<string>(initialTimeRange);
  const [chartFormat, setChartFormat] = useState<string>(initialFormat);

  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const accentColor = palette?.accent || "#38BDF8";
  const winBarColor = customColors?.trendingWinRate?.win || "#10B981";
  const lossBarColor = customColors?.trendingWinRate?.loss || "#EF4444";

  const handleTimeChange = (t: string) => {
    setChartTime(t);
    onUpdateSettings?.({ ...widget.settings, timeRange: t });
  };

  const handleFormatChange = (f: string) => {
    setChartFormat(f);
    onUpdateSettings?.({ ...widget.settings, formatFilter: f });
  };

  const chartData = useMemo(() => {
    const now = new Date();
    const start7D = new Date(now.getTime() - 7 * 86400000);
    const start14D = new Date(now.getTime() - 14 * 86400000);
    const start30D = new Date(now.getTime() - 30 * 86400000);
    const startYear = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    if (chartTime === "TODAY") {
      const hourly = new Map<number, { wins: number; losses: number }>();
      let minHour = 23;
      let maxHour = 0;
      let hasMatches = false;

      for (const m of winLossMatches) {
        if (
          chartFormat !== "ALL" &&
          m.format_name.toUpperCase() !== chartFormat
        )
          continue;
        if (matchDayKey(m) !== todayKey) continue;
        const d = new Date(m.timestamp);
        const h = d.getHours();
        minHour = Math.min(minHour, h);
        maxHour = Math.max(maxHour, h);
        hasMatches = true;
        const e = hourly.get(h) || { wins: 0, losses: 0 };
        if (m.result === "win") e.wins++;
        else e.losses++;
        hourly.set(h, e);
      }

      if (!hasMatches) {
        minHour = Math.max(0, now.getHours() - 6);
        maxHour = now.getHours();
      } else {
        minHour = Math.max(0, minHour - 1);
        maxHour = Math.min(23, maxHour + 1);
      }

      const rows = [];
      for (let h = minHour; h <= maxHour; h++) {
        const e = hourly.get(h) || { wins: 0, losses: 0 };
        const label = `${String(h).padStart(2, "0")}:00`;
        const total = e.wins + e.losses;
        const winRate =
          total > 0 ? Math.round((e.wins / total) * 1000) / 10 : null;
        rows.push({
          date: `hour-${h}`,
          label,
          wins: e.wins,
          losses: e.losses,
          total,
          winRate,
          trend: winRate ?? stats.todayWinRate,
        });
      }
      return rows;
    }

    if (chartTime === "YEAR") {
      const monthly = new Map<
        string,
        { wins: number; losses: number; label: string; time: number }
      >();
      for (const m of winLossMatches) {
        if (
          chartFormat !== "ALL" &&
          m.format_name.toUpperCase() !== chartFormat
        )
          continue;
        const d = new Date(m.timestamp);
        if (d < startYear) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const label = `${months[d.getMonth()]}`;
        const e = monthly.get(key) || {
          wins: 0,
          losses: 0,
          label,
          time: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
        };
        if (m.result === "win") e.wins++;
        else e.losses++;
        monthly.set(key, e);
      }

      const monthsArr = [...monthly.entries()].sort(
        (a, b) => a[1].time - b[1].time,
      );
      let lastKnownTrend = stats.allWinRate || 50.0;
      return monthsArr.map(([date, { wins, losses, label }], idx) => {
        const total = wins + losses;
        const windowStart = Math.max(0, idx - 2);
        let windowWins = 0;
        let windowTotal = 0;
        for (let j = windowStart; j <= idx; j++) {
          const e = monthsArr[j][1];
          windowWins += e.wins;
          windowTotal += e.wins + e.losses;
        }
        if (windowTotal > 0) lastKnownTrend = (windowWins / windowTotal) * 100;
        return {
          date,
          label,
          wins,
          losses,
          total,
          winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null,
          trend: Math.round(lastKnownTrend * 10) / 10,
        };
      });
    }

    if (chartTime === "ALL") {
      const monthly = new Map<
        string,
        { wins: number; losses: number; label: string; time: number }
      >();
      for (const m of winLossMatches) {
        if (
          chartFormat !== "ALL" &&
          m.format_name.toUpperCase() !== chartFormat
        )
          continue;
        const d = new Date(m.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const label = `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
        const e = monthly.get(key) || {
          wins: 0,
          losses: 0,
          label,
          time: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
        };
        if (m.result === "win") e.wins++;
        else e.losses++;
        monthly.set(key, e);
      }

      const monthsArr = [...monthly.entries()].sort(
        (a, b) => a[1].time - b[1].time,
      );
      let lastKnownTrend = stats.allWinRate || 50.0;
      return monthsArr.map(([date, { wins, losses, label }], idx) => {
        const total = wins + losses;
        const windowStart = Math.max(0, idx - 3);
        let windowWins = 0;
        let windowTotal = 0;
        for (let j = windowStart; j <= idx; j++) {
          const e = monthsArr[j][1];
          windowWins += e.wins;
          windowTotal += e.wins + e.losses;
        }
        if (windowTotal > 0) lastKnownTrend = (windowWins / windowTotal) * 100;
        return {
          date,
          label,
          wins,
          losses,
          total,
          winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null,
          trend: Math.round(lastKnownTrend * 10) / 10,
        };
      });
    }

    const numDays = chartTime === "7D" ? 7 : chartTime === "14D" ? 14 : 30;
    const daily = new Map<string, { wins: number; losses: number }>();
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = localDateKey(d);
      daily.set(key, { wins: 0, losses: 0 });
    }

    for (const m of winLossMatches) {
      if (chartFormat !== "ALL" && m.format_name.toUpperCase() !== chartFormat)
        continue;
      const key = matchDayKey(m);
      if (!key || !daily.has(key)) continue;
      const e = daily.get(key)!;
      if (m.result === "win") e.wins++;
      else e.losses++;
    }

    const days = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let lastKnownTrend = stats.allWinRate || 50.0;
    const priorMatches = winLossMatches.filter((m) => {
      if (chartFormat !== "ALL" && m.format_name.toUpperCase() !== chartFormat)
        return false;
      const d = new Date(m.timestamp);
      return (
        d <
        (chartTime === "7D"
          ? start7D
          : chartTime === "14D"
            ? start14D
            : start30D)
      );
    });
    if (priorMatches.length > 0) {
      const pWins = priorMatches.filter((m) => m.result === "win").length;
      lastKnownTrend = (pWins / priorMatches.length) * 100;
    }

    return days.map(([date, { wins, losses }], idx) => {
      const total = wins + losses;
      const windowStart = Math.max(0, idx - 4);
      let windowWins = 0;
      let windowTotal = 0;
      for (let j = windowStart; j <= idx; j++) {
        const e = days[j][1];
        windowWins += e.wins;
        windowTotal += e.wins + e.losses;
      }
      if (windowTotal > 0) {
        lastKnownTrend = (windowWins / windowTotal) * 100;
      }
      return {
        date,
        label: dayLabel(date, todayKey),
        wins,
        losses,
        total,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null,
        trend: Math.round(lastKnownTrend * 10) / 10,
      };
    });
  }, [
    winLossMatches,
    chartTime,
    chartFormat,
    todayKey,
    stats.allWinRate,
    stats.todayWinRate,
  ]);

  const maxPlays = useMemo(() => {
    const busiest = chartData.reduce((max, r) => Math.max(max, r.total), 0);
    return Math.max(Math.ceil(busiest * 1.25), 4);
  }, [chartData]);

  const headerActions = (
    <div className="flex items-center gap-3">
      {/* Format Filter */}
      {formatOptions.length > 0 && (
        <div className="relative inline-flex items-center">
          <select
            value={chartFormat}
            onChange={(e) => handleFormatChange(e.target.value)}
            className="text-[11px] font-sans bg-transparent border-0 text-neutral-400 hover:text-white cursor-pointer pr-4 appearance-none focus:outline-none"
          >
            {formatOptions.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-neutral-900 text-white"
              >
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronRight className="w-2.5 h-2.5 rotate-90 absolute right-0 pointer-events-none text-neutral-500" />
        </div>
      )}

      {/* Time Filters */}
      <div className="flex items-center gap-2">
        {[
          { id: "TODAY", label: "Today" },
          { id: "7D", label: "7D" },
          { id: "14D", label: "14D" },
          { id: "30D", label: "30D" },
          { id: "YEAR", label: "Year" },
          { id: "ALL", label: "All" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => handleTimeChange(t.id)}
            className={`text-[11px] font-sans transition-colors cursor-pointer ${
              chartTime === t.id
                ? "text-white font-semibold underline underline-offset-4"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <WidgetShell
      title="Trending Win Rate"
      icon={<TrendingUp className="w-3.5 h-3.5" style={{ color: accentColor }} />}
      headerActions={headerActions}
      isLoading={isLoading}
      isEmpty={winLossMatches.length === 0}
      emptyMessage="No match history recorded yet"
    >
      <div className="flex-1 w-full min-h-[220px] pt-1 pb-0 flex flex-col justify-end">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="label"
              axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
              tickLine={false}
              tick={{
                fill: "rgba(255, 255, 255, 0.35)",
                fontSize: 10,
                fontFamily: "monospace",
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="played"
              orientation="left"
              domain={[0, maxPlays]}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
              tickLine={false}
              tick={{
                fill: "rgba(255, 255, 255, 0.3)",
                fontSize: 10,
                fontFamily: "monospace",
              }}
              width={22}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(v) => `${v}%`}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.12)" }}
              tickLine={false}
              tick={{
                fill: "rgba(255, 255, 255, 0.3)",
                fontSize: 10,
                fontFamily: "monospace",
              }}
              width={32}
            />

            {/* 50% Benchmark line */}
            <ReferenceLine
              yAxisId="rate"
              y={50}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="3 3"
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="px-3 py-2 bg-neutral-900/95 border border-white/20 text-xs font-sans text-white shadow-2xl backdrop-blur-md">
                      <div className="font-semibold text-neutral-200">
                        {d.label}
                      </div>
                      <div className="mt-1">
                        Trending WR:{" "}
                        <span className="font-semibold text-white">
                          {d.trend}%
                        </span>
                      </div>
                      {d.total > 0 && (
                        <div className="text-[11px] text-neutral-400 mt-0.5">
                          Day Rate: {d.winRate}% ({d.wins}W - {d.losses}L)
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }}
            />

            <Legend
              verticalAlign="bottom"
              height={22}
              formatter={(value) => (
                <span className="text-white font-sans text-[11px] font-semibold tracking-wide">
                  {value}
                </span>
              )}
              wrapperStyle={{
                paddingTop: 4,
                fontSize: 11,
                fontFamily: "sans-serif",
              }}
            />

            <Bar
              yAxisId="played"
              dataKey="wins"
              name="Wins"
              stackId="matches"
              fill={winBarColor}
              fillOpacity={0.65}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="played"
              dataKey="losses"
              name="Losses"
              stackId="matches"
              fill={lossBarColor}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
              fillOpacity={0.4}
              isAnimationActive={false}
            />

            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="trend"
              name="Win Rate (%)"
              stroke={accentColor}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </WidgetShell>
  );
};
