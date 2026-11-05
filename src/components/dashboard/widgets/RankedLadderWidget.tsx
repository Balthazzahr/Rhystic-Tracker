import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { Award, Shield, Trophy, Clock, History, TrendingUp } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import {
  usePlayerRank,
  usePlayerRankHistory,
  formatRomanLevel,
  getTierTheme,
  getMaxStepsForTier,
  getRankClimbScore,
  formatRankLabel,
} from "./rankCommon";
import { CountdownTimer } from "./questCommon";
import { RankHistoryModal } from "./RankHistoryModal";

interface RawPoint {
  d: Date;
  dateStr: string; // "YYYY-MM-DD"
  rawTimestamp: string;
  season: number;
  tier: string;
  level: number;
  step: number;
  score: number;
  wins: number;
  losses: number;
  winRate: number;
  label: string;
}

interface ChartPoint {
  key: string;
  xLabel: string;
  tooltipTime: string;
  score: number;
  tier: string;
  level: number;
  step: number;
  wins: number;
  losses: number;
  winRate: number;
  label: string;
  season?: number;
  matchesCount?: number;
  isSeasonReset?: boolean;
  [key: string]: any;
}

interface DivisionBand {
  y1: number;
  y2: number;
  tier: string;
  division: string;
  fill: string;
  fillOpacity: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthDay(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

// 24 units per Tier (4 divisions x 6 units).
// Gradients from darkest at division IV up to lighter at division I.
const ALL_DIVISION_BANDS: DivisionBand[] = [
  // Bronze: deep ember bronze ascending to warm burnished bronze
  { y1: 0, y2: 6, tier: "Bronze", division: "IV", fill: "#1a0f07", fillOpacity: 0.95 },
  { y1: 6, y2: 12, tier: "Bronze", division: "III", fill: "#27160a", fillOpacity: 0.95 },
  { y1: 12, y2: 18, tier: "Bronze", division: "II", fill: "#361e0e", fillOpacity: 0.95 },
  { y1: 18, y2: 24, tier: "Bronze", division: "I", fill: "#462812", fillOpacity: 0.95 },

  // Silver: dark steel slate ascending to cool bright silver
  { y1: 24, y2: 30, tier: "Silver", division: "IV", fill: "#141922", fillOpacity: 0.95 },
  { y1: 30, y2: 36, tier: "Silver", division: "III", fill: "#1e2532", fillOpacity: 0.95 },
  { y1: 36, y2: 42, tier: "Silver", division: "II", fill: "#293243", fillOpacity: 0.95 },
  { y1: 42, y2: 48, tier: "Silver", division: "I", fill: "#354156", fillOpacity: 0.95 },

  // Gold: deep warm gold ascending to lustrous aurum
  { y1: 48, y2: 54, tier: "Gold", division: "IV", fill: "#201a09", fillOpacity: 0.95 },
  { y1: 54, y2: 60, tier: "Gold", division: "III", fill: "#2d230c", fillOpacity: 0.95 },
  { y1: 60, y2: 66, tier: "Gold", division: "II", fill: "#3b2e0f", fillOpacity: 0.95 },
  { y1: 66, y2: 72, tier: "Gold", division: "I", fill: "#4c3b14", fillOpacity: 0.95 },

  // Platinum: deep teal-slate ascending to frosted celadon
  { y1: 72, y2: 78, tier: "Platinum", division: "IV", fill: "#10201e", fillOpacity: 0.95 },
  { y1: 78, y2: 84, tier: "Platinum", division: "III", fill: "#152a27", fillOpacity: 0.95 },
  { y1: 84, y2: 90, tier: "Platinum", division: "II", fill: "#1a3532", fillOpacity: 0.95 },
  { y1: 90, y2: 96, tier: "Platinum", division: "I", fill: "#21443f", fillOpacity: 0.95 },

  // Diamond: deep midnight cobalt ascending to sapphire crystal
  { y1: 96, y2: 102, tier: "Diamond", division: "IV", fill: "#0d1d27", fillOpacity: 0.95 },
  { y1: 102, y2: 108, tier: "Diamond", division: "III", fill: "#112633", fillOpacity: 0.95 },
  { y1: 108, y2: 114, tier: "Diamond", division: "II", fill: "#163142", fillOpacity: 0.95 },
  { y1: 114, y2: 120, tier: "Diamond", division: "I", fill: "#1c3d52", fillOpacity: 0.95 },

  // Mythic: arcane amethyst gradient
  { y1: 120, y2: 144, tier: "Mythic", division: "Leaderboard", fill: "#2b1434", fillOpacity: 0.95 },
];

export const RankedLadderWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const [activeTab, setActiveTab] = useState<"constructed" | "limited">("constructed");
  const [modalOpen, setModalOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<string>("season_current");

  const { rank, loading: rankLoading } = usePlayerRank();
  const { history, loading: historyLoading } = usePlayerRankHistory(500);

  const isLimited = activeTab === "limited";
  const tier = isLimited ? rank?.limited_tier || "Bronze" : rank?.constructed_tier || "Bronze";
  const level = isLimited ? rank?.limited_level ?? 4 : rank?.constructed_level ?? 4;
  const step = isLimited ? rank?.limited_step ?? 0 : rank?.constructed_step ?? 0;
  const wins = isLimited ? rank?.limited_wins ?? 0 : rank?.constructed_wins ?? 0;
  const losses = isLimited ? rank?.limited_losses ?? 0 : rank?.constructed_losses ?? 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const theme = getTierTheme(tier);
  const maxSteps = getMaxStepsForTier(tier, isLimited);

  // Map historical climb snapshots chronologically (oldest to newest)
  const rawPoints: RawPoint[] = useMemo(() => {
    if (!history || history.length === 0) return [];

    const sorted = [...history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const pts: RawPoint[] = [];

    for (const snap of sorted) {
      const pTier = isLimited ? snap.limited_tier : snap.constructed_tier;
      const pLevel = isLimited ? snap.limited_level : snap.constructed_level;
      const pStep = isLimited ? snap.limited_step : snap.constructed_step;
      const pWins = isLimited ? snap.limited_wins : snap.constructed_wins;
      const pLosses = isLimited ? snap.limited_losses : snap.constructed_losses;
      const pTotal = pWins + pLosses;
      const pWr = pTotal > 0 ? Math.round((pWins / pTotal) * 100) : 0;
      const pScore = getRankClimbScore(pTier, pLevel, pStep, isLimited);
      const pLabel = formatRankLabel(pTier, pLevel, pStep);

      const d = new Date(snap.timestamp);
      if (isNaN(d.getTime())) continue;

      pts.push({
        d,
        dateStr: getLocalDateStr(d),
        rawTimestamp: snap.timestamp,
        season: snap.season_ordinal,
        tier: pTier,
        level: pLevel,
        step: pStep,
        score: pScore,
        wins: pWins,
        losses: pLosses,
        winRate: pWr,
        label: pLabel,
      });
    }

    return pts;
  }, [history, isLimited]);

  // Discover distinct seasons present in history
  const distinctSeasons = useMemo(() => {
    const s = Array.from(new Set(rawPoints.map((p) => p.season)));
    return s.sort((a, b) => b - a);
  }, [rawPoints]);

  const currentSeason = distinctSeasons[0] ?? rank?.season_ordinal ?? 95;
  const previousSeason = distinctSeasons.find((s) => s < currentSeason) ?? (currentSeason > 1 ? currentSeason - 1 : null);

  // Build continuous time-series chart data
  const { chartData, filterSummary } = useMemo(() => {
    if (rawPoints.length === 0) {
      return { chartData: [], filterSummary: "0 snapshots" };
    }

    // 1. "1D" Filter: Intra-day match-by-match detail for today (or last 24h)
    if (timeFilter === "1d") {
      const todayStr = getLocalDateStr(new Date());
      let matchesToday = rawPoints.filter((p) => p.dateStr === todayStr);
      if (matchesToday.length < 2) {
        const cutoff = Date.now() - 24 * 3600 * 1000;
        matchesToday = rawPoints.filter((p) => p.d.getTime() >= cutoff);
      }
      if (matchesToday.length === 0) {
        matchesToday = [rawPoints[rawPoints.length - 1]];
      }

      const points: ChartPoint[] = matchesToday.map((pt, idx) => {
        const hours = pt.d.getHours();
        const mins = String(pt.d.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "p" : "a";
        const h12 = hours % 12 || 12;

        return {
          key: `1d-${pt.rawTimestamp}-${idx}`,
          xLabel: `${h12}:${mins}${ampm}`,
          tooltipTime: `${formatMonthDay(pt.d)}, ${h12}:${mins} ${hours >= 12 ? "PM" : "AM"}`,
          score: pt.score,
          tier: pt.tier,
          level: pt.level,
          step: pt.step,
          wins: pt.wins,
          losses: pt.losses,
          winRate: pt.winRate,
          label: pt.label,
          season: pt.season,
          matchesCount: 1,
          [`s_${pt.season}`]: pt.score,
        };
      });

      return {
        chartData: points,
        filterSummary: `${points.length} match${points.length > 1 ? "es" : ""} today`,
      };
    }

    // Helper to generate daily continuous timeline between two calendar dates
    const buildDailyTimeline = (startDate: Date, endDate: Date, labelStep = 1, fixedSeason?: number) => {
      const points: ChartPoint[] = [];
      const cur = new Date(startDate);
      cur.setHours(0, 0, 0, 0);

      const targetEnd = new Date(endDate);
      targetEnd.setHours(23, 59, 59, 999);

      // Carry forward the active rank state
      let activeState = rawPoints[0];
      for (const p of rawPoints) {
        if (p.d.getTime() <= cur.getTime()) {
          activeState = p;
        }
      }

      let dayIndex = 0;
      while (cur.getTime() <= targetEnd.getTime()) {
        const curStr = getLocalDateStr(cur);
        const daySnaps = rawPoints.filter((p) => {
          if (fixedSeason !== undefined && p.season !== fixedSeason) return false;
          return p.dateStr === curStr;
        });

        if (daySnaps.length > 0) {
          activeState = daySnaps[daySnaps.length - 1];
        }

        const shouldLabel =
          labelStep === 1 ||
          dayIndex === 0 ||
          cur.getTime() >= targetEnd.getTime() - 86400 * 1000 ||
          dayIndex % labelStep === 0;

        points.push({
          key: `daily-${curStr}`,
          xLabel: shouldLabel ? formatMonthDay(cur) : "",
          tooltipTime: cur.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          score: activeState.score,
          tier: activeState.tier,
          level: activeState.level,
          step: activeState.step,
          wins: activeState.wins,
          losses: activeState.losses,
          winRate: activeState.winRate,
          label: activeState.label,
          season: activeState.season,
          matchesCount: daySnaps.length,
          [`s_${activeState.season}`]: activeState.score,
        });

        cur.setDate(cur.getDate() + 1);
        dayIndex++;
      }

      return points;
    };

    // 2. "7D" Filter: Continuous 7 calendar days ending today
    if (timeFilter === "7d") {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const points = buildDailyTimeline(start, new Date(), 1);
      return { chartData: points, filterSummary: "7 days" };
    }

    // 3. "30D" Filter: Continuous 30 calendar days ending today
    if (timeFilter === "30d") {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      const points = buildDailyTimeline(start, new Date(), 5);
      return { chartData: points, filterSummary: "30 days" };
    }

    // 4. "This Season": All days that have passed since season started up to today
    if (timeFilter === "season_current") {
      const seasonSnaps = rawPoints.filter((p) => p.season === currentSeason);
      const start =
        seasonSnaps.length > 0
          ? new Date(seasonSnaps[0].d)
          : new Date(new Date().setDate(new Date().getDate() - 4));
      start.setHours(0, 0, 0, 0);

      const points = buildDailyTimeline(start, new Date(), 1, currentSeason);
      return {
        chartData: points,
        filterSummary: `${points.length} day${points.length > 1 ? "s" : ""} this season`,
      };
    }

    // 5. "Last Season": Days of previous season
    if (timeFilter === "season_previous" && previousSeason) {
      const seasonSnaps = rawPoints.filter((p) => p.season === previousSeason);
      if (seasonSnaps.length > 0) {
        const start = new Date(seasonSnaps[0].d);
        const end = new Date(seasonSnaps[seasonSnaps.length - 1].d);
        const points = buildDailyTimeline(start, end, 3, previousSeason);
        return {
          chartData: points,
          filterSummary: `Season ${previousSeason} (${points.length} days)`,
        };
      }
    }

    // 6. "All": Complete history across all seasons
    const start = new Date(rawPoints[0].d);
    const end = new Date();
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (86400 * 1000)));
    const stepInterval = diffDays > 60 ? 7 : diffDays > 20 ? 3 : 1;
    const points = buildDailyTimeline(start, end, stepInterval);

    return {
      chartData: points,
      filterSummary: `All Time (${points.length} days)`,
    };
  }, [rawPoints, timeFilter, currentSeason, previousSeason]);

  // Fast lookup for X-Axis tick labels by key
  const xLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pt of chartData) {
      map.set(pt.key, pt.xLabel);
    }
    return map;
  }, [chartData]);

  // Distinct seasons present in the current view for separate non-dipping curves
  const distinctSeasonsInView = useMemo(() => {
    const s = Array.from(new Set(chartData.map((d) => d.season)));
    return s.filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  }, [chartData]);

  // Discover season transitions in the current view
  const seasonTransitions = useMemo(() => {
    const transitions: {
      key: string;
      prevKey: string;
      prevSeason: number;
      currSeason: number;
      prevScore: number;
      currScore: number;
      startScore: number;
      isNearLeft: boolean;
    }[] = [];

    if (chartData.length < 2) return transitions;

    for (let i = 1; i < chartData.length; i++) {
      const prev = chartData[i - 1];
      const curr = chartData[i];
      if (curr.season && prev.season && curr.season !== prev.season) {
        const currDateStr = curr.key.replace(/^daily-/, "");
        const currSnaps = rawPoints.filter(
          (p) => p.dateStr === currDateStr && p.season === curr.season
        );
        const startScore = currSnaps.length > 0 ? currSnaps[0].score : curr.score;

        transitions.push({
          key: curr.key,
          prevKey: prev.key,
          prevSeason: prev.season,
          currSeason: curr.season,
          prevScore: prev.score,
          currScore: curr.score,
          startScore,
          isNearLeft: i <= 2,
        });
      }
    }
    return transitions;
  }, [chartData, rawPoints]);

  // Calculate guaranteed 1.5-tier visibility window (at least 36 units = 6 divisions)
  const { yMin, yMax, yTicks, visibleBands } = useMemo(() => {
    const currentScore = getRankClimbScore(tier, level, step, isLimited);
    const scores = chartData.map((d) => d.score);
    const maxScore = scores.length > 0 ? Math.max(...scores, currentScore) : currentScore;
    const minScore = scores.length > 0 ? Math.min(...scores, currentScore) : currentScore;

    const tierIdx = Math.floor(maxScore / 24); // 0 = Bronze, 1 = Silver, 2 = Gold...
    const tierBase = tierIdx * 24;

    const computedMin = tierIdx === 0 ? 0 : Math.max(0, Math.floor(minScore / 6) * 6 - 6);
    const computedMax = Math.max(tierBase + 36, Math.ceil((maxScore + 6) / 6) * 6);

    const min = Math.max(0, computedMin);
    const max = Math.min(144, computedMax);

    const ticks: number[] = [];
    for (let s = min; s <= max; s += 6) {
      ticks.push(s);
    }

    const bands = ALL_DIVISION_BANDS.filter((b) => b.y2 > min && b.y1 < max);

    return { yMin: min, yMax: max, yTicks: ticks, visibleBands: bands };
  }, [chartData, tier, level, step, isLimited]);

  // Color selection for line / gradient stroke based on tier
  const strokeColor = useMemo(() => {
    const t = tier.toLowerCase();
    switch (t) {
      case "mythic":
        return "#F59E0B";
      case "diamond":
        return "#06B6D4";
      case "platinum":
        return "#14B8A6";
      case "gold":
        return "#EAB308";
      case "silver":
        return "#CBD5E1";
      case "bronze":
      default:
        return "#D97706";
    }
  }, [tier]);

  const formatYTick = (val: number) => {
    if (val >= 120) return "Mythic";
    if (val >= 96) return `Dia ${formatRomanLevel(4 - Math.floor((val - 96) / 6))}`;
    if (val >= 72) return `Plat ${formatRomanLevel(4 - Math.floor((val - 72) / 6))}`;
    if (val >= 48) return `Gold ${formatRomanLevel(4 - Math.floor((val - 48) / 6))}`;
    if (val >= 24) return `Silv ${formatRomanLevel(4 - Math.floor((val - 24) / 6))}`;
    return `Brz ${formatRomanLevel(4 - Math.floor(val / 6))}`;
  };

  const renderYTick = ({ x, y, payload }: any) => {
    const val = payload.value;
    const label = formatYTick(val);
    const isTierBoundary = val > 0 && val % 24 === 0;

    let color = "#a3a3a3";
    if (val >= 120) color = "#f59e0b";
    else if (val >= 96) color = "#38bdf8";
    else if (val >= 72) color = "#2dd4bf";
    else if (val >= 48) color = "#facc15";
    else if (val >= 24) color = "#cbd5e1";
    else color = "#d97706";

    return (
      <text
        x={x - 4}
        y={y + 3}
        textAnchor="end"
        fill={color}
        fontSize={8.5}
        fontFamily="monospace"
        fontWeight={isTierBoundary ? 700 : 500}
      >
        {label}
      </text>
    );
  };

  // Custom label renderer placed strictly ABOVE the line (inside the higher tier space)
  // If a season transition occurs near the left edge, pushes past the break into the new season so it isn't cut in half
  const renderTierLineLabel = (tierName: string) => (props: any) => {
    const { viewBox } = props;
    if (!viewBox) return null;
    const hasLeftTransition = seasonTransitions.length > 0 && seasonTransitions[0].isNearLeft;
    const x = (viewBox.x ?? 0) + (hasLeftTransition ? 85 : 8);
    const y = (viewBox.y ?? 0) - 4; // 4px above the line, inside the silver space
    return (
      <text
        x={x}
        y={y}
        fill="rgba(255, 255, 255, 0.75)"
        fontSize={8}
        fontFamily="monospace"
        fontWeight={700}
        letterSpacing="0.1em"
      >
        {`── ${tierName} ──`}
      </text>
    );
  };

  // Render season transition with 50/50 day gap distribution, consistent 8px dark gap, capping borders, and rank curve continuity
  const renderSeasonBreak = (t: (typeof seasonTransitions)[number], props: any) => {
    const { x, y, width, height } = props;
    if (x == null || y == null || width == null || height == null || width <= 0) return null;

    const xMid = x + width / 2;
    const halfGap = Math.min(4, Math.max(1, (width - 2) / 2));
    const leftCapX = Math.round(xMid - halfGap);
    const rightCapX = Math.round(xMid + halfGap);
    const gapW = Math.max(2, rightCapX - leftCapX);
    const baseY = y + height;

    const scoreToY = (score: number) => {
      const s = Math.max(yMin, Math.min(yMax, score));
      return y + height - ((s - yMin) / Math.max(1, yMax - yMin)) * height;
    };

    const prevY = scoreToY(t.prevScore);
    const startY = scoreToY(t.startScore ?? t.currScore);
    const currY = scoreToY(t.currScore);

    const prevLabel = t.isNearLeft || leftCapX < 115 ? `S${t.prevSeason}` : `Season ${t.prevSeason}`;
    const showPrevLabel = leftCapX > 75;

    return (
      <g key={`season-break-g-${t.key}`} className="season-transition-break">
        {/* Previous season rank extension halfway to left capping border */}
        {leftCapX > x && (
          <>
            {prevY < baseY && (
              <polygon
                points={`${x},${prevY} ${leftCapX},${prevY} ${leftCapX},${baseY} ${x},${baseY}`}
                fill="url(#climbFill)"
                fillOpacity={0.6}
              />
            )}
            <line
              x1={x}
              y1={prevY}
              x2={leftCapX}
              y2={prevY}
              stroke={strokeColor}
              strokeWidth={2}
            />
          </>
        )}

        {/* Solid capping border on the end of the previous season */}
        <line
          x1={leftCapX}
          y1={y}
          x2={leftCapX}
          y2={baseY}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth={1}
        />

        {/* Small consistent dark gap between seasons */}
        <rect
          x={leftCapX}
          y={y}
          width={gapW}
          height={height}
          fill="#000000"
          fillOpacity={0.8}
        />

        {/* Solid capping border on the start of the new season */}
        <line
          x1={rightCapX}
          y1={y}
          x2={rightCapX}
          y2={baseY}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth={1}
        />

        {/* New season rank curve from right capping border into first snapshot */}
        {x + width > rightCapX && (
          <>
            {(startY < baseY || currY < baseY) && (
              <polygon
                points={`${rightCapX},${startY} ${x + width},${currY} ${x + width},${baseY} ${rightCapX},${baseY}`}
                fill="url(#climbFill)"
                fillOpacity={0.6}
              />
            )}
            <line
              x1={rightCapX}
              y1={startY}
              x2={x + width}
              y2={currY}
              stroke={strokeColor}
              strokeWidth={2}
            />
          </>
        )}

        {/* Season labels anchored on the capping borders */}
        {showPrevLabel && (
          <text
            x={leftCapX - 6}
            y={y + 14}
            textAnchor="end"
            fill="#38bdf8"
            fontSize={8}
            fontFamily="monospace"
            fontWeight={700}
            letterSpacing="0.06em"
            paintOrder="stroke"
            stroke="#0a0a0a"
            strokeWidth={2.5}
            strokeLinejoin="round"
          >
            {prevLabel}
          </text>
        )}

        <text
          x={rightCapX + 6}
          y={y + 14}
          textAnchor="start"
          fill="#38bdf8"
          fontSize={8}
          fontFamily="monospace"
          fontWeight={700}
          letterSpacing="0.06em"
          paintOrder="stroke"
          stroke="#0a0a0a"
          strokeWidth={2.5}
          strokeLinejoin="round"
        >
          {`Season ${t.currSeason}`}
        </text>
      </g>
    );
  };

  const renderChartDot = (props: any) => {
    const { cx, cy, value } = props;
    if (cx == null || cy == null || value == null) return null;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={2.5}
        fill={strokeColor}
        strokeWidth={0}
      />
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const activeItem = payload.find((p: any) => p.value != null) ?? payload[0];
    const pt: ChartPoint = activeItem?.payload;
    if (!pt) return null;
    const ptTheme = getTierTheme(pt.tier);

    return (
      <div className="bg-neutral-950 border border-white/20 p-2 shadow-2xl rounded-none text-xs font-mono min-w-[170px] z-50">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1 mb-1">
          <span className={`font-bold uppercase text-[10px] ${ptTheme.textColor}`}>
            {pt.tier} {pt.tier.toLowerCase() !== "mythic" && formatRomanLevel(pt.level)}
          </span>
          <span className="text-[9px] text-sky-400 font-bold">
            {pt.season ? `Season ${pt.season}` : ""}
          </span>
        </div>
        <div className="space-y-0.5 text-[11px]">
          <div className="flex justify-between text-neutral-300">
            <span className="text-neutral-500">Progress:</span>
            <span className="font-bold text-white">
              {pt.step} / {getMaxStepsForTier(pt.tier, isLimited)} Tier Points
            </span>
          </div>
          <div className="flex justify-between text-neutral-300">
            <span className="text-neutral-500">Record:</span>
            <span className="font-bold text-white">
              {pt.wins}W - {pt.losses}L ({pt.winRate}%)
            </span>
          </div>
          {pt.matchesCount !== undefined && (
            <div className="flex justify-between text-neutral-300">
              <span className="text-neutral-500">Activity:</span>
              <span
                className={`font-semibold ${
                  pt.matchesCount > 0 ? "text-amber-400" : "text-neutral-500"
                }`}
              >
                {pt.matchesCount > 0
                  ? `${pt.matchesCount} match${pt.matchesCount > 1 ? "es" : ""}`
                  : "No matches"}
              </span>
            </div>
          )}
          <div className="flex justify-between text-neutral-400 text-[10px] pt-1 border-t border-white/5">
            <span className="text-neutral-500">Date:</span>
            <span>{pt.tooltipTime}</span>
          </div>
        </div>
      </div>
    );
  };

  const hasData = !!rank;

  return (
    <>
      <WidgetShell
        title="Ranked Ladder"
        subtitle={`Season ${currentSeason}`}
        icon={<Award className="w-3.5 h-3.5 text-amber-400" />}
        isLoading={rankLoading && historyLoading}
        isEmpty={!hasData && !rankLoading}
        emptyMessage="No ranked data detected yet. Log into MTGA to track."
        headerActions={
          <div className="flex items-center gap-2">
            {/* Format Toggle Pill */}
            <div className="flex items-center border border-white/10 bg-black/40 p-0.5 rounded-none text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setActiveTab("constructed")}
                className={`px-2 py-0.5 transition-colors cursor-pointer flex items-center gap-1 ${
                  !isLimited
                    ? "bg-white/15 text-white font-bold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Shield className="w-3 h-3 text-current" />
                <span>Constructed</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("limited")}
                className={`px-2 py-0.5 transition-colors cursor-pointer flex items-center gap-1 ${
                  isLimited
                    ? "bg-white/15 text-white font-bold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Trophy className="w-3 h-3 text-current" />
                <span>Limited</span>
              </button>
            </div>

            {/* Season Countdown */}
            {rank?.season_end_time && (
              <div className="hidden lg:flex items-center gap-1 text-[9px] font-mono text-neutral-400 px-1.5 py-0.5 bg-white/[0.03] border border-white/5">
                <Clock className="w-2.5 h-2.5 text-neutral-400" />
                <span>Ends in <CountdownTimer targetIso={rank.season_end_time} /></span>
              </div>
            )}

            {/* Climb History Modal Button */}
            <button
              onClick={() => setModalOpen(true)}
              className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 hover:border-white/30 text-neutral-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              title="Open Full Season Climb History Modal"
            >
              <History className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">History</span>
            </button>
          </div>
        }
      >
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 select-none">
          {/* Top Section: Active Format Rank Card & Pips Rail */}
          <div className="bg-white/[0.02] border border-white/10 p-2 sm:p-2.5 flex flex-col justify-between shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between gap-1 shrink-0 pb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {isLimited ? (
                  <Trophy className={`w-3.5 h-3.5 shrink-0 ${theme.textColor}`} />
                ) : (
                  <Shield className={`w-3.5 h-3.5 shrink-0 ${theme.textColor}`} />
                )}
                <span className="text-[11px] font-sans font-bold tracking-wider uppercase text-neutral-200 truncate">
                  {isLimited ? "Limited" : "Constructed"}
                </span>
                <span
                  className={`text-xs font-sans font-bold uppercase tracking-wider px-1.5 py-0.2 border ${theme.badgeBg} ${theme.badgeBorder} ${theme.textColor} shrink-0`}
                >
                  {tier} {tier.toLowerCase() !== "mythic" && formatRomanLevel(level)}
                </span>
              </div>

              {/* Record / Win Rate */}
              <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                <span className="text-white font-bold">
                  {wins}W - {losses}L
                </span>
                {total > 0 && (
                  <span
                    className={`text-[10px] font-semibold px-1 py-0.2 border ${
                      winRate >= 50
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                    }`}
                  >
                    {winRate}%
                  </span>
                )}
              </div>
            </div>

            {/* Pips Segmented Continuum Rail */}
            <div
              className="min-h-[16px] max-h-[22px] my-1 w-full items-stretch"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${maxSteps}, minmax(0, 1fr))`,
                gap: "3px",
              }}
            >
              {Array.from({ length: maxSteps }).map((_, idx) => {
                const isEarned = idx < step;
                const isNext = idx === step;

                return (
                  <div
                    key={`pip-${idx}`}
                    className={`h-full min-h-[14px] flex items-center justify-center border transition-all duration-300 ${
                      isEarned
                        ? theme.pipActive
                        : isNext
                        ? "border-amber-400/80 bg-amber-400/10 text-neutral-300 ring-1 ring-amber-400/40"
                        : "bg-white/[0.03] border-white/10 text-neutral-600 hover:border-white/20"
                    }`}
                    title={`Tier Point ${idx + 1} of ${maxSteps}`}
                  >
                    <span className="text-[8px] font-mono opacity-60 leading-none">
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Card Footer */}
            <div className="text-[9px] font-sans flex items-center justify-between text-neutral-400 pt-1 border-t border-white/5 shrink-0">
              <span className="font-mono text-neutral-300">
                <strong className="text-white">{step}</strong> / {maxSteps} Tier Points
              </span>
              <span className="text-neutral-500 text-[8.5px]">
                {tier.toLowerCase() === "mythic"
                  ? "Mythic Leaderboard Active"
                  : isLimited
                  ? "Draft & Sealed Advancement"
                  : "Ranked Tier Advancement"}
              </span>
            </div>
          </div>

          {/* Bottom Section: Over-Time Climb Progression Graph */}
          <div className="flex-1 min-h-[135px] bg-white/[0.02] border border-white/10 p-2 sm:p-2.5 flex flex-col justify-between">
            {/* Graph Header & Filter Toolbar */}
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-neutral-400" />
                <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-300">
                  Ladder Climb
                </span>
                <span className="text-[9px] font-mono text-neutral-500 hidden sm:inline">
                  ({filterSummary})
                </span>
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center gap-1 text-[9px] font-sans">
                {/* 1D Filter (Intra-day match climb) */}
                <button
                  type="button"
                  onClick={() => setTimeFilter("1d")}
                  className={`px-1.5 py-0.5 border transition-colors cursor-pointer uppercase tracking-wider font-semibold ${
                    timeFilter === "1d"
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                  }`}
                  title="Today's Match Climb Breakdown"
                >
                  1D
                </button>

                {/* 7D Filter */}
                <button
                  type="button"
                  onClick={() => setTimeFilter("7d")}
                  className={`px-1.5 py-0.5 border transition-colors cursor-pointer uppercase tracking-wider font-semibold ${
                    timeFilter === "7d"
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                  }`}
                  title="Last 7 Calendar Days"
                >
                  7D
                </button>

                {/* 30D Filter */}
                <button
                  type="button"
                  onClick={() => setTimeFilter("30d")}
                  className={`px-1.5 py-0.5 border transition-colors cursor-pointer uppercase tracking-wider font-semibold ${
                    timeFilter === "30d"
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                  }`}
                  title="Last 30 Calendar Days"
                >
                  30D
                </button>

                {/* This Season */}
                <button
                  type="button"
                  onClick={() => setTimeFilter("season_current")}
                  className={`px-2 py-0.5 border transition-colors cursor-pointer uppercase tracking-wider font-semibold ${
                    timeFilter === "season_current"
                      ? "bg-amber-500/25 text-amber-300 border-amber-500/50"
                      : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                  }`}
                  title={`All Days in Season ${currentSeason}`}
                >
                  This Season
                </button>

                {/* Last Season */}
                {previousSeason && (
                  <button
                    type="button"
                    onClick={() => setTimeFilter("season_previous")}
                    className={`px-2 py-0.5 border transition-colors cursor-pointer uppercase tracking-wider font-semibold ${
                      timeFilter === "season_previous"
                        ? "bg-amber-500/25 text-amber-300 border-amber-500/50"
                        : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                    }`}
                    title={`Season ${previousSeason} Breakdown`}
                  >
                    Last Season
                  </button>
                )}

                {/* All */}
                <button
                  type="button"
                  onClick={() => setTimeFilter("all")}
                  className={`px-1.5 py-0.5 border transition-colors cursor-pointer uppercase tracking-wider font-semibold ${
                    timeFilter === "all"
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                  }`}
                  title="All Time Climb History"
                >
                  All
                </button>
              </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 w-full min-h-[95px] relative">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="climbFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={strokeColor} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>

                    {/* Colored Division Background Bands (consistent across entire chart) */}
                    {visibleBands.map((band) => (
                      <ReferenceArea
                        key={`band-${band.tier}-${band.division}-${band.y1}`}
                        y1={band.y1}
                        y2={band.y2}
                        fill={band.fill}
                        fillOpacity={band.fillOpacity}
                        ifOverflow="hidden"
                      />
                    ))}

                    {/* Tier Transition Lines (Silver label placed strictly ABOVE the line in the silver space) */}
                    {[24, 48, 72, 96, 120].map((tVal) => {
                      if (tVal > yMin && tVal < yMax) {
                        const tierName =
                          tVal === 24
                            ? "SILVER"
                            : tVal === 48
                            ? "GOLD"
                            : tVal === 72
                            ? "PLATINUM"
                            : tVal === 96
                            ? "DIAMOND"
                            : "MYTHIC";

                        return (
                          <ReferenceLine
                            key={`tier-line-${tVal}`}
                            y={tVal}
                            stroke="rgba(255, 255, 255, 0.35)"
                            strokeWidth={1}
                            strokeDasharray="4 2"
                            label={renderTierLineLabel(tierName)}
                          />
                        );
                      }
                      return null;
                    })}

                    {/* Subtle Division Grid Lines */}
                    {yTicks.map((tVal) => {
                      if (tVal % 24 !== 0 && tVal > yMin && tVal < yMax) {
                        return (
                          <ReferenceLine
                            key={`div-line-${tVal}`}
                            y={tVal}
                            stroke="rgba(255, 255, 255, 0.05)"
                            strokeDasharray="1 3"
                          />
                        );
                      }
                      return null;
                    })}

                    {/* Season Transition Capping Borders & Dark Gap (50/50 day split with 8px consistent gap) */}
                    {seasonTransitions.map((t) => (
                      <ReferenceArea
                        key={`season-trans-${t.key}`}
                        x1={t.prevKey}
                        x2={t.key}
                        y1={yMin}
                        y2={yMax}
                        shape={(props: any) => renderSeasonBreak(t, props)}
                        ifOverflow="hidden"
                      />
                    ))}

                    <XAxis
                      dataKey="key"
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                      tickFormatter={(val) => xLabelMap.get(val) ?? ""}
                      tick={{ fill: "#a3a3a3", fontSize: 9, fontFamily: "monospace" }}
                      interval={0}
                    />
                    <YAxis
                      domain={[yMin, yMax]}
                      ticks={yTicks}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                      tick={renderYTick}
                      width={54}
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {/* Independent season curves: each ends abruptly at season end without dipping */}
                    {distinctSeasonsInView.map((s) => (
                      <Area
                        key={`area-season-${s}`}
                        type="monotone"
                        dataKey={`s_${s}`}
                        stroke={strokeColor}
                        strokeWidth={2}
                        fill="url(#climbFill)"
                        fillOpacity={0.6}
                        dot={renderChartDot}
                        activeDot={{
                          r: 4.5,
                          stroke: "#fff",
                          strokeWidth: 1.5,
                          fill: strokeColor,
                        }}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] font-mono text-neutral-500">
                  No climb snapshots recorded in this period
                </div>
              )}
            </div>
          </div>
        </div>
      </WidgetShell>

      <RankHistoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        currentRank={rank}
      />
    </>
  );
});

RankedLadderWidget.displayName = "RankedLadderWidget";
