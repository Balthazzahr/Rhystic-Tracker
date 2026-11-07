import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  Customized,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Shield,
  Trophy,
  Clock,
  TrendingUp,
  TrendingDown,
  Award,
  Swords,
  ChevronDown,
  Minus,
  Layers,
  Coins,
  Sparkles,
} from "lucide-react";
import {
  usePlayerRank,
  usePlayerRankHistory,
  formatRomanLevel,
  getTierTheme,
  getMaxStepsForTier,
  getRankClimbScore,
  formatRankLabel,
  TIER_ORDER,
} from "./dashboard/widgets/rankCommon";
import {
  ALL_DIVISION_BANDS,
  TIER_THRESHOLDS,
  getScoreTierColor,
} from "./dashboard/widgets/RankedLadderWidget";
import { CountdownTimer } from "./dashboard/widgets/questCommon";
import { ManaPip } from "./ManaPip";
import { MatchRecord } from "./MatchHistoryView";

interface RankedLadderViewProps {
  palette: any;
  matches: MatchRecord[];
  deckOverview?: any[];
  onSelectMatch: (matchId: string) => void;
  onSelectDeck?: (deckName: string) => void;
  onShowCard?: (cardName: string) => void;
}

interface RawPoint {
  d: Date;
  dateStr: string;
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
  [key: string]: any;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MANA_COLORS: Record<string, string> = {
  W: "#f8fafc",
  U: "#38bdf8",
  B: "#8a719d",
  R: "#ef4444",
  G: "#22c55e",
  C: "#94a3b8",
};

const DECK_PIE_COLORS = [
  "#4A7FA3", // Azorius Blue
  "#C5A059", // Plains Gold
  "#4A7856", // Forest Green
  "#B8503A", // Mountain Red
  "#8a719d", // Swamp Purple
  "#0ea5e9", // Cerulean
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Rose
  "#6366f1", // Indigo
];

const FILTER_OPTIONS = [
  { id: "1d", label: "1D", title: "One Day (Last 24 Hours)" },
  { id: "7d", label: "7D", title: "Seven Days" },
  { id: "30d", label: "30D", title: "Thirty Days" },
  { id: "60d", label: "60D", title: "Sixty Days" },
  { id: "full_season", label: "Full Season", title: "Full Season" },
  { id: "prev_season", label: "Previous Season", title: "Previous Season" },
  { id: "all_time", label: "All Time", title: "All Time" },
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

function formatRelativeTime(dateIso: string): string {
  const d = new Date(dateIso);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (isNaN(diffSec)) return dateIso;
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatMonthDay(d);
}

function getProjectedRewards(tier: string) {
  const t = (tier || "bronze").toLowerCase();
  switch (t) {
    case "mythic":
      return { packs: 5, gold: 1000, styles: 2, rewardText: "5 Packs + 1,000 Gold + 2 Card Styles" };
    case "diamond":
      return { packs: 4, gold: 1000, styles: 2, rewardText: "4 Packs + 1,000 Gold + 2 Card Styles" };
    case "platinum":
      return { packs: 3, gold: 1000, styles: 2, rewardText: "3 Packs + 1,000 Gold + 2 Card Styles" };
    case "gold":
      return { packs: 2, gold: 1000, styles: 1, rewardText: "2 Packs + 1,000 Gold + 1 Card Style" };
    case "silver":
      return { packs: 1, gold: 500, styles: 1, rewardText: "1 Pack + 500 Gold + 1 Card Style" };
    case "bronze":
    default:
      return { packs: 1, gold: 0, styles: 0, rewardText: "1 Pack" };
  }
}

function getTierColorClass(tier?: string | null): string {
  switch ((tier || "").toLowerCase()) {
    case "mythic":
      return "text-amber-400";
    case "diamond":
      return "text-cyan-400";
    case "platinum":
      return "text-teal-400";
    case "gold":
      return "text-yellow-400";
    case "silver":
      return "text-slate-200";
    case "bronze":
      return "text-amber-600";
    default:
      return "text-neutral-300";
  }
}

function getFormatColor(name: string, index: number): string {
  const n = (name || "").toLowerCase();
  if (n.includes("standard")) return "#4A7FA3";
  if (n.includes("historic")) return "#8a719d";
  if (n.includes("explorer") || n.includes("pioneer")) return "#C5A059";
  if (n.includes("alchemy")) return "#B8503A";
  if (n.includes("timeless")) return "#10b981";
  if (n.includes("draft") || n.includes("limited") || n.includes("sealed")) return "#0284c7";
  if (n.includes("brawl")) return "#f59e0b";
  return DECK_PIE_COLORS[index % DECK_PIE_COLORS.length];
}

export const RankedLadderView: React.FC<RankedLadderViewProps> = ({
  palette,
  matches,
  onSelectMatch,
  onSelectDeck,
}) => {
  const accentColor = palette?.primary || "#4A7FA3";

  // Mode & Filters State
  const [activeTab, setActiveTab] = useState<"constructed" | "limited">("constructed");
  const [timeFilter, setTimeFilter] = useState<string>("full_season");

  // Interactive Slice Selection (Deck & Format win/loss view)
  const [selectedDeckName, setSelectedDeckName] = useState<string | null>(null);
  const [selectedFormatName, setSelectedFormatName] = useState<string | null>(null);

  // Custom Season Dropdown State
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsSeasonOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSeasonOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Load Rank Data from hooks
  const { rank } = usePlayerRank();
  const { history } = usePlayerRankHistory(1000);

  const isLimited = activeTab === "limited";
  const currentSeason = rank?.season_ordinal ?? 95;

  // Parse Raw Historical Climb Snapshots chronologically
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

  // Distinct seasons present in history
  const distinctSeasons = useMemo(() => {
    const s = Array.from(new Set(rawPoints.map((p) => p.season)));
    return s.sort((a, b) => b - a);
  }, [rawPoints]);

  const previousSeason = useMemo(() => {
    return (
      distinctSeasons.find((s) => s < currentSeason) ??
      (currentSeason > 1 ? currentSeason - 1 : null)
    );
  }, [distinctSeasons, currentSeason]);

  // Selected season state (defaults to current season)
  const [selectedSeason, setSelectedSeason] = useState<number | "all">(
    distinctSeasons[0] ?? currentSeason
  );

  const isPastSeason = selectedSeason !== "all" && selectedSeason !== currentSeason;
  const isAllSeasons = selectedSeason === "all";

  // Filter raw points belonging to the selected season
  const seasonRawPoints = useMemo(() => {
    if (selectedSeason === "all") return rawPoints;
    return rawPoints.filter((p) => p.season === selectedSeason);
  }, [rawPoints, selectedSeason]);

  // Last snapshot of the selected season (for past seasons, this is the final end-of-season rank!)
  const endSeasonPoint = useMemo(() => {
    if (seasonRawPoints.length > 0) {
      return seasonRawPoints[seasonRawPoints.length - 1];
    }
    return null;
  }, [seasonRawPoints]);

  // Peak snapshot achieved in this season / all-time
  const peakStandingPoint = useMemo(() => {
    if (seasonRawPoints.length === 0) return null;
    let best = seasonRawPoints[0];
    for (const p of seasonRawPoints) {
      if (p.score > best.score) {
        best = p;
      }
    }
    return best;
  }, [seasonRawPoints]);

  const peakStandingLabel = useMemo(() => {
    if (!peakStandingPoint) return "—";
    const t = peakStandingPoint.tier;
    const l = t.toLowerCase() !== "mythic" ? ` ${formatRomanLevel(peakStandingPoint.level)}` : "";
    return `${t}${l} (${peakStandingPoint.step} Pips)`;
  }, [peakStandingPoint]);

  // Display Tier, Level, and Step:
  // When viewing a past season, show the final standing at season close!
  // When viewing current season or all seasons, show the live rank.
  const displayTier = isPastSeason && endSeasonPoint
    ? endSeasonPoint.tier
    : isLimited
    ? rank?.limited_tier || "Bronze"
    : rank?.constructed_tier || "Bronze";

  const displayLevel = isPastSeason && endSeasonPoint
    ? endSeasonPoint.level
    : isLimited
    ? rank?.limited_level ?? 4
    : rank?.constructed_level ?? 4;

  const displayStep = isPastSeason && endSeasonPoint
    ? endSeasonPoint.step
    : isLimited
    ? rank?.limited_step ?? 0
    : rank?.constructed_step ?? 0;

  const displayTheme = getTierTheme(displayTier);
  const displayMaxSteps = getMaxStepsForTier(displayTier, isLimited);

  // Compute exact season date boundaries from snapshots
  const seasonRanges = useMemo(() => {
    const map = new Map<number, { start: Date; end: Date }>();
    if (!history || history.length === 0) return map;

    const bySeason = new Map<number, typeof history>();
    for (const h of history) {
      const list = bySeason.get(h.season_ordinal) || [];
      list.push(h);
      bySeason.set(h.season_ordinal, list);
    }

    for (const [seasonNum, snaps] of bySeason.entries()) {
      const sorted = [...snaps].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const firstDate = new Date(sorted[0].timestamp);
      firstDate.setHours(0, 0, 0, 0);

      const lastSnap = sorted[sorted.length - 1];
      const endDate = lastSnap.season_end_time
        ? new Date(lastSnap.season_end_time)
        : new Date(new Date(lastSnap.timestamp).setHours(23, 59, 59, 999));

      map.set(seasonNum, { start: firstDate, end: endDate });
    }

    return map;
  }, [history]);

  // Continuous time-series graph points based on selected season & time horizon
  const { chartData } = useMemo(() => {
    if (rawPoints.length === 0) {
      return { chartData: [] };
    }

    // Granular continuous timeline generator that preserves every intraday climb/drop snapshot
    const buildContinuousTimeline = (
      startDate: Date,
      endDate: Date,
      labelStepDays = 1,
      fixedSeason?: number
    ) => {
      const points: ChartPoint[] = [];
      const cur = new Date(startDate);
      cur.setHours(0, 0, 0, 0);

      const targetEnd = new Date(endDate);
      targetEnd.setHours(23, 59, 59, 999);

      // Establish baseline rank entering the timeframe
      let activeState = rawPoints[0];
      for (const p of rawPoints) {
        if (p.d.getTime() <= cur.getTime()) {
          activeState = p;
        }
      }

      let dayIndex = 0;
      while (cur.getTime() <= targetEnd.getTime()) {
        const curStr = getLocalDateStr(cur);
        // All snapshots recorded on this calendar day in exact chronological order
        const daySnaps = rawPoints.filter((p) => {
          if (fixedSeason !== undefined && p.season !== fixedSeason) return false;
          return p.dateStr === curStr;
        });

        // Determine if this calendar day should display an X-Axis label in the legend
        const shouldLabel =
          labelStepDays === 1 ||
          dayIndex === 0 ||
          cur.getTime() >= targetEnd.getTime() - 86400 * 1000 ||
          dayIndex % labelStepDays === 0;

        const dayLabelText = shouldLabel ? formatMonthDay(cur) : "";

        if (daySnaps.length === 0) {
          // No matches played on this day: add a single continuity anchor point
          points.push({
            key: `daily-${curStr}`,
            xLabel: dayLabelText,
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
            matchesCount: 0,
            [`s_${activeState.season}`]: activeState.score,
          });
        } else {
          // Matches WERE played on this day!
          let hasPlacedDayLabel = false;

          // If the day's first snapshot changed from previous active score,
          // include a day-start anchor at 00:00 to anchor the starting baseline
          if (daySnaps[0].score !== activeState.score) {
            points.push({
              key: `daystart-${curStr}`,
              xLabel: dayLabelText,
              tooltipTime: `${cur.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })} (Day Start)`,
              score: activeState.score,
              tier: activeState.tier,
              level: activeState.level,
              step: activeState.step,
              wins: activeState.wins,
              losses: activeState.losses,
              winRate: activeState.winRate,
              label: activeState.label,
              season: activeState.season,
              matchesCount: 0,
              [`s_${activeState.season}`]: activeState.score,
            });
            hasPlacedDayLabel = true;
          }

          // Add EVERY individual snapshot recorded during this day (fine up/down granularity)
          for (let sIdx = 0; sIdx < daySnaps.length; sIdx++) {
            const snap = daySnaps[sIdx];
            activeState = snap;

            const isFirstPointOfDay = sIdx === 0 && !hasPlacedDayLabel;
            const ptLabel = isFirstPointOfDay ? dayLabelText : "";

            const timeStr = snap.d.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = snap.d.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });

            points.push({
              key: `snap-${curStr}-${sIdx}-${snap.rawTimestamp}`,
              xLabel: ptLabel,
              tooltipTime: `${dateStr}, ${timeStr}`,
              score: snap.score,
              tier: snap.tier,
              level: snap.level,
              step: snap.step,
              wins: snap.wins,
              losses: snap.losses,
              winRate: snap.winRate,
              label: snap.label,
              season: snap.season,
              matchesCount: 1,
              [`s_${snap.season}`]: snap.score,
            });
          }
        }

        cur.setDate(cur.getDate() + 1);
        dayIndex++;
      }

      return points;
    };

    const now = new Date();

    // 1. One Day (1D)
    if (timeFilter === "1d") {
      const oneDayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
      const snaps = rawPoints.filter(
        (p) => p.d >= oneDayAgo && (selectedSeason === "all" || p.season === selectedSeason)
      );
      if (snaps.length < 2) {
        return {
          chartData: buildContinuousTimeline(
            oneDayAgo,
            now,
            1,
            selectedSeason === "all"
              ? undefined
              : typeof selectedSeason === "number"
              ? selectedSeason
              : undefined
          ),
        };
      }
      const step = Math.max(1, Math.floor(snaps.length / 5));
      return {
        chartData: snaps.map((p, idx) => ({
          key: `snap-${idx}-${p.rawTimestamp}`,
          xLabel:
            idx === 0 || idx === snaps.length - 1 || idx % step === 0
              ? p.d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "",
          tooltipTime: `${p.d.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}, ${p.d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}`,
          score: p.score,
          tier: p.tier,
          level: p.level,
          step: p.step,
          wins: p.wins,
          losses: p.losses,
          winRate: p.winRate,
          label: p.label,
          season: p.season,
          matchesCount: 1,
          [`s_${p.season}`]: p.score,
        })),
      };
    }

    // 2. Seven Days (7D)
    if (timeFilter === "7d") {
      const start7 = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
      return {
        chartData: buildContinuousTimeline(
          start7,
          now,
          1,
          selectedSeason === "all"
            ? undefined
            : typeof selectedSeason === "number"
            ? selectedSeason
            : undefined
        ),
      };
    }

    // 3. Thirty Days (30D)
    if (timeFilter === "30d") {
      const start30 = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
      return {
        chartData: buildContinuousTimeline(
          start30,
          now,
          5,
          selectedSeason === "all"
            ? undefined
            : typeof selectedSeason === "number"
            ? selectedSeason
            : undefined
        ),
      };
    }

    // 4. Sixty Days (60D)
    if (timeFilter === "60d") {
      const start60 = new Date(now.getTime() - 59 * 24 * 3600 * 1000);
      return {
        chartData: buildContinuousTimeline(
          start60,
          now,
          7,
          selectedSeason === "all"
            ? undefined
            : typeof selectedSeason === "number"
            ? selectedSeason
            : undefined
        ),
      };
    }

    // 5. Previous Season
    if (timeFilter === "prev_season" && previousSeason !== null) {
      const range = seasonRanges.get(previousSeason);
      const pSnaps = rawPoints.filter((p) => p.season === previousSeason);
      if (range) {
        const diffDays = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (86400 * 1000)));
        const stepInterval = diffDays > 45 ? 7 : diffDays > 20 ? 5 : 2;
        return { chartData: buildContinuousTimeline(range.start, range.end, stepInterval, previousSeason) };
      } else if (pSnaps.length > 0) {
        const start = new Date(pSnaps[0].d);
        const end = new Date(pSnaps[pSnaps.length - 1].d);
        const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (86400 * 1000)));
        const stepInterval = diffDays > 45 ? 7 : diffDays > 20 ? 5 : 2;
        return { chartData: buildContinuousTimeline(start, end, stepInterval, previousSeason) };
      }
    }

    // 6. All Time
    if (timeFilter === "all_time") {
      const earliestDate = rawPoints[0].d;
      const diffDays = Math.max(1, Math.round((now.getTime() - earliestDate.getTime()) / (86400 * 1000)));
      const stepInterval = diffDays > 60 ? 10 : diffDays > 20 ? 5 : 2;
      return { chartData: buildContinuousTimeline(earliestDate, now, stepInterval) };
    }

    // 7. Full Season (default)
    const targetSeason = selectedSeason !== "all" ? selectedSeason : currentSeason;
    const range = seasonRanges.get(targetSeason);
    const start = range ? range.start : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = range
      ? range.end > now && targetSeason === currentSeason
        ? now
        : range.end
      : now;
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (86400 * 1000)));
    const stepInterval = diffDays > 45 ? 7 : diffDays > 20 ? 5 : 2;
    return { chartData: buildContinuousTimeline(start, end, stepInterval, targetSeason) };
  }, [rawPoints, selectedSeason, timeFilter, seasonRanges, currentSeason, previousSeason]);

  // Distinct seasons present in currently generated chart points
  const distinctSeasonsInView = useMemo(() => {
    const s = new Set<number>();
    for (const p of chartData) {
      if (p.season !== undefined) s.add(p.season);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [chartData]);

  // Detect season transition boundaries in the chart points
  const seasonTransitions = useMemo(() => {
    const trans: Array<{
      idx: number;
      key: string;
      prevKey: string;
      prevSeason: number;
      newSeason: number;
    }> = [];

    for (let i = 1; i < chartData.length; i++) {
      const prev = chartData[i - 1];
      const curr = chartData[i];
      if (
        prev.season !== undefined &&
        curr.season !== undefined &&
        prev.season !== curr.season
      ) {
        trans.push({
          idx: i,
          key: curr.key,
          prevKey: prev.key,
          prevSeason: prev.season,
          newSeason: curr.season,
        });
      }
    }

    return trans;
  }, [chartData]);

  // X-Axis tick label map
  const xLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of chartData) {
      if (p.xLabel) map.set(p.key, p.xLabel);
    }
    return map;
  }, [chartData]);

  // Calculate guaranteed 1.5-tier visibility window (at least 36 units = 6 divisions)
  // Mirroring RankedLadderWidget calculation so Silver & divisions are always fully visible
  const { yMin, yMax, yTicks, visibleBands } = useMemo(() => {
    const currentScore = getRankClimbScore(displayTier, displayLevel, displayStep, isLimited);
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
  }, [chartData, displayTier, displayLevel, displayStep, isLimited]);

  // Compute exact tier color stops for vertical chart gradient (stroke and shading)
  const { strokeStops, fillStops } = useMemo(() => {
    const span = Math.max(1, yMax - yMin);
    const stroke: { offset: string; color: string }[] = [];
    const fill: { offset: string; color: string; opacity: number }[] = [];

    const activeTiers = TIER_THRESHOLDS.filter((t) => t.max > yMin && t.min < yMax);
    for (const t of activeTiers) {
      const tTop = Math.min(yMax, t.max);
      const tBottom = Math.max(yMin, t.min);
      const offTop = ((yMax - tTop) / span) * 100;
      const offBottom = ((yMax - tBottom) / span) * 100;

      stroke.push({ offset: `${offTop.toFixed(2)}%`, color: t.color });
      stroke.push({ offset: `${offBottom.toFixed(2)}%`, color: t.color });

      fill.push({ offset: `${offTop.toFixed(2)}%`, color: t.color, opacity: 0.45 });
      fill.push({ offset: `${offBottom.toFixed(2)}%`, color: t.color, opacity: 0.12 });
    }

    return { strokeStops: stroke, fillStops: fill };
  }, [yMin, yMax]);

  // Dynamic SVG gradients mapped strictly to chart plotting coordinates in userSpaceOnUse
  // Robust Recharts props unpacking (props.yAxisMap[0] / offset fallback)
  const DynamicTierGradients = (props: any) => {
    const yAxis = props.yAxisMap ? props.yAxisMap[0] : null;
    const yTop = yAxis ? yAxis.scale(yMax) : (props.offset?.top ?? 10);
    const yBottom = yAxis
      ? yAxis.scale(yMin)
      : ((props.offset?.top ?? 10) + (props.offset?.height ?? 100));

    return (
      <defs>
        <linearGradient
          id="climbStroke"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={yTop}
          x2={0}
          y2={yBottom}
        >
          {strokeStops.map((s, idx) => (
            <stop key={`str-${idx}`} offset={s.offset} stopColor={s.color} stopOpacity={1} />
          ))}
        </linearGradient>
        <linearGradient
          id="climbFill"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={yTop}
          x2={0}
          y2={yBottom}
        >
          {fillStops.map((s, idx) => (
            <stop
              key={`fill-${idx}`}
              offset={s.offset}
              stopColor={s.color}
              stopOpacity={s.opacity}
            />
          ))}
        </linearGradient>
      </defs>
    );
  };

  // Render season break gap divider (8px dark gap, blue season tag, and boundary lines)
  const renderSeasonBreak = (trans: any, props: any) => {
    const { x, width, y, height } = props;
    if (x === undefined || width === undefined || y === undefined || height === undefined) {
      return null;
    }

    const midX = x + width / 2;
    const gapWidth = 8;
    const leftX = midX - gapWidth / 2;
    const rightX = midX + gapWidth / 2;

    return (
      <g key={`season-break-group-${trans.key}`}>
        <rect
          x={leftX}
          y={y}
          width={gapWidth}
          height={height}
          fill="#0c0d0e"
          fillOpacity={0.96}
        />
        <line
          x1={leftX}
          y1={y}
          x2={leftX}
          y2={y + height}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        <line
          x1={rightX}
          y1={y}
          x2={rightX}
          y2={y + height}
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        <g transform={`translate(${rightX + 4}, ${y + 14})`}>
          <rect
            x={0}
            y={-10}
            width={58}
            height={13}
            fill="#1e3a8a"
            fillOpacity={0.8}
            stroke="#3b82f6"
            strokeWidth={0.5}
          />
          <text
            x={4}
            y={0}
            fill="#93c5fd"
            fontSize={8}
            fontFamily="monospace"
            fontWeight="bold"
          >
            Season {trans.newSeason}
          </text>
        </g>
      </g>
    );
  };

  // Custom Chart Dot (Strictly colored by its tier, uniform size, no phantom dots for inactive seasons)
  const renderChartDot = (props: any) => {
    const { cx, cy, payload, value, dataKey } = props;
    if (cx === undefined || cy === undefined) return null;

    // Guard against phantom dots at top of chart for Area seasons without data at this point
    if (dataKey && (payload?.[dataKey] === undefined || payload?.[dataKey] === null)) {
      return null;
    }

    // Do not render dots on continuity anchor points where no matches were played
    if (payload?.matchesCount === 0) {
      return null;
    }

    const scoreVal = Array.isArray(value)
      ? value[1]
      : typeof value === "number"
      ? value
      : payload?.score;

    if (scoreVal === undefined || scoreVal === null || isNaN(scoreVal)) return null;

    let dotColor = "#d97706";
    if (scoreVal >= 120 || payload?.tier?.toLowerCase() === "mythic") dotColor = "#f59e0b";
    else if (scoreVal >= 96 || payload?.tier?.toLowerCase() === "diamond") dotColor = "#38bdf8";
    else if (scoreVal >= 72 || payload?.tier?.toLowerCase() === "platinum") dotColor = "#2dd4bf";
    else if (scoreVal >= 48 || payload?.tier?.toLowerCase() === "gold") dotColor = "#facc15";
    else if (scoreVal >= 24 || payload?.tier?.toLowerCase() === "silver") dotColor = "#cbd5e1";

    const dotRadius = chartData.length > 60 ? 2 : 3;

    return (
      <circle
        key={`dot-${payload?.key}-${dataKey || ""}-${cx}`}
        cx={cx}
        cy={cy}
        r={dotRadius}
        fill={dotColor}
        stroke="#121212"
        strokeWidth={1.5}
      />
    );
  };

  // Custom Active Hover Dot
  const renderActiveDot = (props: any) => {
    const { cx, cy, payload, value, dataKey } = props;
    if (cx === undefined || cy === undefined) return null;

    if (dataKey && (payload?.[dataKey] === undefined || payload?.[dataKey] === null)) {
      return null;
    }

    const scoreVal = Array.isArray(value)
      ? value[1]
      : typeof value === "number"
      ? value
      : payload?.score;

    if (scoreVal === undefined || scoreVal === null || isNaN(scoreVal)) return null;

    let dotColor = "#d97706";
    if (scoreVal >= 120 || payload?.tier?.toLowerCase() === "mythic") dotColor = "#f59e0b";
    else if (scoreVal >= 96 || payload?.tier?.toLowerCase() === "diamond") dotColor = "#38bdf8";
    else if (scoreVal >= 72 || payload?.tier?.toLowerCase() === "platinum") dotColor = "#2dd4bf";
    else if (scoreVal >= 48 || payload?.tier?.toLowerCase() === "gold") dotColor = "#facc15";
    else if (scoreVal >= 24 || payload?.tier?.toLowerCase() === "silver") dotColor = "#cbd5e1";

    return (
      <g key={`activedot-${cx}`}>
        <circle cx={cx} cy={cy} r={6} fill={dotColor} fillOpacity={0.3} />
        <circle cx={cx} cy={cy} r={3.5} fill={dotColor} stroke="#ffffff" strokeWidth={1.5} />
      </g>
    );
  };

  // Format Y-Tick text (e.g. Brz IV, Silv IV, Gold IV)
  const formatYTick = (val: number) => {
    if (val >= 120) return "Mythic";
    if (val >= 96) return `Dia ${formatRomanLevel(4 - Math.floor((val - 96) / 6))}`;
    if (val >= 72) return `Plat ${formatRomanLevel(4 - Math.floor((val - 72) / 6))}`;
    if (val >= 48) return `Gold ${formatRomanLevel(4 - Math.floor((val - 48) / 6))}`;
    if (val >= 24) return `Silv ${formatRomanLevel(4 - Math.floor((val - 24) / 6))}`;
    return `Brz ${formatRomanLevel(4 - Math.floor(val / 6))}`;
  };

  // Custom Y-Axis Tick with authentic tier colors
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

  // Custom Tier Line Label placed strictly ABOVE the line (inside the higher tier space)
  const renderTierLineLabel = (tierName: string) => (props: any) => {
    const { viewBox } = props;
    if (!viewBox) return null;
    return (
      <text
        x={(viewBox.x ?? 0) + 8}
        y={(viewBox.y ?? 0) - 4}
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

  // Custom Graph Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const pt: ChartPoint = payload[0].payload;
    const pTierTheme = getTierTheme(pt.tier);

    return (
      <div className="bg-neutral-950/95 border border-white/20 p-2.5 text-xs font-mono shadow-2xl backdrop-blur-md min-w-[200px] select-none rounded-none">
        <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">
            Season {pt.season ?? currentSeason}
          </span>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 border ${pTierTheme.badgeBg} ${pTierTheme.badgeBorder} ${pTierTheme.textColor}`}
          >
            {pt.label}
          </span>
        </div>

        <div className="space-y-1 pt-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-400">Score:</span>
            <span className="text-white font-bold">{pt.score} pts</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Progress:</span>
            <span className="text-neutral-200">
              {pt.step} / {getMaxStepsForTier(pt.tier, isLimited)} Tier Points
            </span>
          </div>
          {pt.wins + pt.losses > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Record:</span>
              <span className="text-neutral-200">
                {pt.wins}W - {pt.losses}L ({pt.winRate}%)
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

  // --- Filtered Ranked Matches (Global to entire view: matches, decks, stats) ---
  const filteredRankedMatches = useMemo(() => {
    if (!matches) return [];

    const now = Date.now();
    let timeCutoffStart: number | null = null;
    let timeCutoffEnd: number | null = null;

    if (timeFilter === "1d") {
      timeCutoffStart = now - 24 * 3600 * 1000;
    } else if (timeFilter === "7d") {
      timeCutoffStart = now - 7 * 24 * 3600 * 1000;
    } else if (timeFilter === "30d") {
      timeCutoffStart = now - 30 * 24 * 3600 * 1000;
    } else if (timeFilter === "60d") {
      timeCutoffStart = now - 60 * 24 * 3600 * 1000;
    } else if (timeFilter === "prev_season") {
      if (previousSeason !== null) {
        const range = seasonRanges.get(previousSeason);
        if (range) {
          timeCutoffStart = range.start.getTime();
          timeCutoffEnd = range.end.getTime();
        } else {
          const pSnaps = rawPoints.filter((p) => p.season === previousSeason);
          if (pSnaps.length > 0) {
            timeCutoffStart = pSnaps[0].d.getTime();
            timeCutoffEnd = pSnaps[pSnaps.length - 1].d.getTime();
          }
        }
      }
    } else if (timeFilter === "all_time") {
      timeCutoffStart = null;
      timeCutoffEnd = null;
    } else {
      // "full_season" / default: filter to selectedSeason if not "all"
      if (selectedSeason !== "all") {
        const range = seasonRanges.get(selectedSeason);
        if (range) {
          timeCutoffStart = range.start.getTime();
          timeCutoffEnd = range.end.getTime();
        }
      }
    }

    return matches.filter((m) => {
      const f = (m.format_name || "").toLowerCase();
      // Only ranked matches
      const isRanked =
        f.includes("ranked") ||
        f.includes("premier draft") ||
        f.includes("quick draft") ||
        f.includes("traditional draft");
      if (!isRanked) return false;

      // Format Mode filter (Constructed vs Limited)
      if (isLimited) {
        if (!f.includes("draft") && !f.includes("sealed")) return false;
      } else {
        if (f.includes("draft") || f.includes("sealed")) return false;
      }

      // Time & Season cutoff
      const mTime = new Date(m.timestamp).getTime();
      if (timeCutoffStart !== null && mTime < timeCutoffStart) return false;
      if (timeCutoffEnd !== null && mTime > timeCutoffEnd) return false;

      return true;
    });
  }, [matches, isLimited, timeFilter, selectedSeason, seasonRanges, previousSeason, rawPoints]);

  // Recalculate Win/Loss and Win Rate based on current filter selection
  const viewWins = useMemo(
    () => filteredRankedMatches.filter((m) => m.result === "win").length,
    [filteredRankedMatches]
  );
  const viewLosses = useMemo(
    () => filteredRankedMatches.filter((m) => m.result === "loss").length,
    [filteredRankedMatches]
  );
  const viewTotal = viewWins + viewLosses;
  const viewWinRate = viewTotal > 0 ? Math.round((viewWins / viewTotal) * 100) : 0;

  // Resolve match tier points impact using official MTGA rules based on tier active at match time
  const getMatchImpact = useCallback(
    (m: MatchRecord): number => {
      const isWin = m.result === "win";
      const isTraditional = (m.format_name || "").toLowerCase().includes("traditional");
      const multiplier = isTraditional ? 2 : 1;
      const mTime = new Date(m.timestamp).getTime();

      let matchTier = "bronze";
      if (rawPoints && rawPoints.length > 0) {
        for (const pt of rawPoints) {
          const ptTime = new Date(pt.rawTimestamp).getTime();
          if (ptTime <= mTime) {
            matchTier = (pt.tier || "bronze").toLowerCase();
          } else {
            break;
          }
        }
      }

      if (matchTier === "bronze") {
        return isWin ? 2 * multiplier : 0;
      } else if (matchTier === "silver") {
        return isWin ? 2 * multiplier : -1 * multiplier;
      } else {
        return isWin ? 1 * multiplier : -1 * multiplier;
      }
    },
    [rawPoints]
  );

  // Today's net tier points (for current season)
  const todaysNetPoints = useMemo(() => {
    const todayStr = getLocalDateStr(new Date());
    const todayPoints = rawPoints.filter((p) => p.dateStr === todayStr);
    if (todayPoints.length < 2) return 0;
    const firstScore = todayPoints[0].score;
    const lastScore = todayPoints[todayPoints.length - 1].score;
    return lastScore - firstScore;
  }, [rawPoints]);

  // Total Progress in the selected period:
  // For past season: net points from first snapshot to last snapshot of that season
  // For all seasons: net points from very first recorded snapshot to latest
  const totalSeasonNetPoints = useMemo(() => {
    if (seasonRawPoints.length >= 2) {
      const first = seasonRawPoints[0];
      const last = seasonRawPoints[seasonRawPoints.length - 1];
      return last.score - first.score;
    }
    if (filteredRankedMatches.length > 0) {
      return filteredRankedMatches.reduce((acc, m) => acc + getMatchImpact(m), 0);
    }
    return 0;
  }, [seasonRawPoints, filteredRankedMatches, getMatchImpact]);

  // Next division & next major rank (tier) distance
  const pointsToNextDivision = Math.max(0, displayMaxSteps - displayStep);
  const tierIdx = TIER_ORDER.indexOf(displayTier.toLowerCase() as any);
  const nextTierRaw = tierIdx >= 0 && tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  const nextTierName = nextTierRaw ? nextTierRaw.charAt(0).toUpperCase() + nextTierRaw.slice(1) : "";
  const nextTierTarget = nextTierName === "Mythic" ? "Mythic" : `${nextTierName} IV`;

  const remainingDivisionsAbove = Math.max(0, displayLevel - 1);
  const pointsToNextTier = pointsToNextDivision + remainingDivisionsAbove * displayMaxSteps;

  const nextDivisionTarget =
    displayLevel === 1 ? nextTierTarget : `${displayTier} ${formatRomanLevel(displayLevel - 1)}`;

  const isMythic = displayTier.toLowerCase() === "mythic";

  const nextDivisionLabel = isMythic
    ? "Leaderboard Active"
    : `${pointsToNextDivision} Tier Points to ${nextDivisionTarget}`;

  const nextTierLabel =
    isMythic || displayLevel === 1
      ? null
      : `${pointsToNextTier} Tier Points to ${nextTierTarget}`;

  const nextDivisionTier = displayLevel === 1 ? nextTierRaw : displayTier;

  // Projected or Earned Rewards
  const rewards = getProjectedRewards(displayTier);

  // Ranked Deck Performance Matrix (calculated directly from filtered matches)
  const rankedDeckStats = useMemo(() => {
    const deckMap = new Map<
      string,
      {
        name: string;
        colors: string[];
        wins: number;
        losses: number;
        netPoints: number;
      }
    >();

    for (const m of filteredRankedMatches) {
      const name = m.player_deck_name || "Unknown Deck";
      const existing = deckMap.get(name) || {
        name,
        colors: m.deck_colors || [],
        wins: 0,
        losses: 0,
        netPoints: 0,
      };

      if (m.result === "win") {
        existing.wins += 1;
      } else {
        existing.losses += 1;
      }
      existing.netPoints += getMatchImpact(m);

      deckMap.set(name, existing);
    }

    return Array.from(deckMap.values()).sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
  }, [filteredRankedMatches, getMatchImpact]);

  // Format Stats Breakdown (calculated directly from filtered matches)
  const formatStats = useMemo(() => {
    const fmtMap = new Map<string, { format: string; wins: number; losses: number }>();
    for (const m of filteredRankedMatches) {
      const fmt = m.format_name || "Ranked";
      const entry = fmtMap.get(fmt) || { format: fmt, wins: 0, losses: 0 };
      if (m.result === "win") entry.wins += 1;
      else entry.losses += 1;
      fmtMap.set(fmt, entry);
    }
    return Array.from(fmtMap.values()).sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
  }, [filteredRankedMatches]);

  // Pie Chart Data: Games played per deck (Dynamic predominant color or striped pattern)
  const deckPieData = useMemo(() => {
    const total = rankedDeckStats.reduce((acc, d) => acc + d.wins + d.losses, 0);
    return rankedDeckStats.map((d, idx) => {
      const games = d.wins + d.losses;
      const wr = games > 0 ? Math.round((d.wins / games) * 100) : 0;
      const pct = total > 0 ? Math.round((games / total) * 100) : 0;

      const safeColors = (d.colors || []).filter((c) => MANA_COLORS[c]);
      let fill = DECK_PIE_COLORS[idx % DECK_PIE_COLORS.length];
      let patternDef: { id: string; c1: string; c2: string } | undefined;

      if (safeColors.length === 1) {
        // Single color: strictly color by that authentic MTG color (e.g. Landfall -> Green)
        fill = MANA_COLORS[safeColors[0]];
      } else if (safeColors.length >= 2) {
        // Multi-color: authentic diagonal striped pattern (e.g. Aura Farming -> White & Blue stripes)
        const patId = `deck-stripe-${safeColors.join("")}-${idx}`;
        fill = `url(#${patId})`;
        patternDef = {
          id: patId,
          c1: MANA_COLORS[safeColors[0]],
          c2: MANA_COLORS[safeColors[1]],
        };
      }

      return {
        name: d.name,
        games,
        wins: d.wins,
        losses: d.losses,
        winRate: wr,
        percent: pct,
        colors: d.colors || [],
        fill,
        patternDef,
      };
    });
  }, [rankedDeckStats]);

  const totalDeckGames = useMemo(
    () => deckPieData.reduce((acc, d) => acc + d.games, 0),
    [deckPieData]
  );

  // Pie Chart Data: Games played per format
  const formatPieData = useMemo(() => {
    const total = formatStats.reduce((acc, f) => acc + f.wins + f.losses, 0);
    return formatStats.map((f) => {
      const games = f.wins + f.losses;
      const wr = games > 0 ? Math.round((f.wins / games) * 100) : 0;
      const pct = total > 0 ? Math.round((games / total) * 100) : 0;
      return {
        name: f.format,
        games,
        wins: f.wins,
        losses: f.losses,
        winRate: wr,
        percent: pct,
      };
    });
  }, [formatStats]);

  const totalFormatGames = useMemo(
    () => formatPieData.reduce((acc, f) => acc + f.games, 0),
    [formatPieData]
  );

  // Active Deck Stats for interactive Win/Loss breakdown
  const activeDeckStats = useMemo(() => {
    if (!selectedDeckName) return null;
    return rankedDeckStats.find((d) => d.name === selectedDeckName) || null;
  }, [selectedDeckName, rankedDeckStats]);

  const deckWinLossPieData = useMemo(() => {
    if (!activeDeckStats) return [];
    const total = activeDeckStats.wins + activeDeckStats.losses;
    const winPct = total > 0 ? Math.round((activeDeckStats.wins / total) * 100) : 0;
    const lossPct = total > 0 ? 100 - winPct : 0;
    return [
      {
        name: "Wins",
        games: activeDeckStats.wins,
        wins: activeDeckStats.wins,
        losses: activeDeckStats.losses,
        percent: winPct,
        fill: "#10b981", // Emerald green
      },
      {
        name: "Losses",
        games: activeDeckStats.losses,
        wins: activeDeckStats.wins,
        losses: activeDeckStats.losses,
        percent: lossPct,
        fill: "#f43f5e", // Rose red
      },
    ];
  }, [activeDeckStats]);

  // Active Format Stats for interactive Win/Loss breakdown
  const activeFormatStats = useMemo(() => {
    if (!selectedFormatName) return null;
    return formatStats.find((f) => f.format === selectedFormatName) || null;
  }, [selectedFormatName, formatStats]);

  const formatWinLossPieData = useMemo(() => {
    if (!activeFormatStats) return [];
    const total = activeFormatStats.wins + activeFormatStats.losses;
    const winPct = total > 0 ? Math.round((activeFormatStats.wins / total) * 100) : 0;
    const lossPct = total > 0 ? 100 - winPct : 0;
    return [
      {
        name: "Wins",
        games: activeFormatStats.wins,
        wins: activeFormatStats.wins,
        losses: activeFormatStats.losses,
        percent: winPct,
        fill: "#10b981", // Emerald green
      },
      {
        name: "Losses",
        games: activeFormatStats.losses,
        wins: activeFormatStats.wins,
        losses: activeFormatStats.losses,
        percent: lossPct,
        fill: "#f43f5e", // Rose red
      },
    ];
  }, [activeFormatStats]);

  // Custom Pie Chart Tooltip with Mana Pips, Win Rate, and drill-down hints
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isWinLoss = data.name === "Wins" || data.name === "Losses";

      return (
        <div className="bg-neutral-950/95 border border-white/20 p-2 text-xs font-mono shadow-2xl backdrop-blur-md rounded-none select-none">
          <div className="flex items-center gap-1.5 font-bold text-white truncate max-w-[200px]">
            {data.colors && data.colors.length > 0 && (
              <div className="flex items-center gap-0.5 shrink-0">
                {data.colors.map((c: string) => (
                  <ManaPip key={c} symbol={c} size={11} />
                ))}
              </div>
            )}
            <span className="truncate">{data.name}</span>
          </div>
          <div className="text-neutral-300 text-[11px] flex items-center gap-2 mt-1">
            <span>
              {data.games} {data.games === 1 ? (isWinLoss ? "match" : "game") : (isWinLoss ? "matches" : "games")}
            </span>
            <span className="text-amber-300 font-bold">({data.percent}%)</span>
            {data.winRate !== undefined && !isWinLoss && (
              <span
                className={
                  data.winRate >= 50
                    ? "text-emerald-400 font-semibold"
                    : "text-rose-400 font-semibold"
                }
              >
                {data.winRate}% WR
              </span>
            )}
          </div>
          <div className="text-[9px] text-neutral-500 font-sans mt-1">
            {isWinLoss ? "Click to return to overview" : "Click to view Win/Loss ratio"}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleFilterSelect = (filterId: string) => {
    setTimeFilter(filterId);

    if (filterId === "prev_season") {
      if (previousSeason !== null) {
        setSelectedSeason(previousSeason);
      }
    } else if (filterId === "all_time") {
      setSelectedSeason("all");
    } else if (filterId === "full_season") {
      if (selectedSeason === "all" || selectedSeason === previousSeason) {
        setSelectedSeason(currentSeason);
      }
    } else {
      // "1d", "7d", "30d", "60d"
      if (selectedSeason !== "all" && selectedSeason !== currentSeason) {
        setSelectedSeason(currentSeason);
      }
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full space-y-2.5 px-6 py-2.5 overflow-hidden select-none">
      {/* 1. PAGE HEADER */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-ascend text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            RANKED LADDER
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            ({isPastSeason ? `Season ${selectedSeason} Final` : isAllSeasons ? "All Seasons Overview" : `Season ${currentSeason}`} •{" "}
            {displayTier}{" "}
            {displayTier.toLowerCase() !== "mythic" && formatRomanLevel(displayLevel)} •{" "}
            {displayStep} / {displayMaxSteps} Tier Points)
          </span>
        </div>

        {/* Season Timer */}
        {rank?.season_end_time && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-300 px-2.5 py-1 bg-white/[0.03] border border-white/10">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Ends in <CountdownTimer targetIso={rank.season_end_time} />
            </span>
          </div>
        )}
      </div>

      {/* 2. TOP TOOLBAR: Far Left Season Dropdown, Far Right Constructed/Limited Mode Selector */}
      <div className="shrink-0 flex items-center justify-between pb-0.5 gap-2 select-none">
        {/* Far Left: Custom React Season Dropdown */}
        <div className="relative inline-flex items-center shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsSeasonOpen((prev) => !prev)}
            className="flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/15 hover:border-white/30 px-3 py-1.5 text-xs font-mono transition-colors shadow-sm cursor-pointer select-none backdrop-blur-md rounded-none"
          >
            <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-white font-bold uppercase tracking-wider">
              {selectedSeason === "all"
                ? "All Seasons"
                : `Season ${selectedSeason} ${selectedSeason === currentSeason ? "(Current)" : ""}`}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                isSeasonOpen ? "rotate-180 text-white" : ""
              }`}
            />
          </button>

          {isSeasonOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-neutral-900/95 backdrop-blur-xl border border-white/20 shadow-2xl z-50 py-1 font-mono text-xs max-h-60 overflow-y-auto custom-scrollbar rounded-none">
              {distinctSeasons.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSelectedSeason(s);
                    setIsSeasonOpen(false);
                    if (s === previousSeason) {
                      setTimeFilter("prev_season");
                    } else if (s === currentSeason) {
                      setTimeFilter("full_season");
                    } else {
                      setTimeFilter("full_season");
                    }
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer rounded-none ${
                    selectedSeason === s
                      ? "bg-white/15 text-white font-bold"
                      : "text-neutral-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>
                    Season {s} {s === currentSeason ? "(Current)" : ""}
                  </span>
                  {selectedSeason === s && (
                    <span className="text-amber-400 text-xs">◆</span>
                  )}
                </button>
              ))}
              <div className="border-t border-white/10 my-1" />
              <button
                type="button"
                onClick={() => {
                  setSelectedSeason("all");
                  setIsSeasonOpen(false);
                  setTimeFilter("all_time");
                }}
                className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer rounded-none ${
                  selectedSeason === "all"
                    ? "bg-white/15 text-white font-bold"
                    : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>All Seasons</span>
                {selectedSeason === "all" && (
                  <span className="text-amber-400 text-xs">◆</span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Far Right: Constructed / Limited Format Mode Selector Pills */}
        <div className="flex items-center border border-white/10 bg-black/40 p-0.5 rounded-none text-xs font-mono shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("constructed")}
            className={`px-2.5 py-1 transition-colors cursor-pointer flex items-center gap-1 rounded-none ${
              !isLimited
                ? "bg-white/15 text-white font-bold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-current" />
            <span>Constructed</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("limited")}
            className={`px-2.5 py-1 transition-colors cursor-pointer flex items-center gap-1 rounded-none ${
              isLimited
                ? "bg-white/15 text-white font-bold"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-current" />
            <span>Limited</span>
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT: Fixed height distribution, zero page scroll */}
      <div className="flex-1 min-h-0 flex flex-col space-y-2.5 overflow-hidden">
        {/* ========================================================================= */}
        {/* ZONE A: TOP STATUS PANEL (Current Rank vs End of Season Rank)              */}
        {/* ========================================================================= */}
        <div className="shrink-0 bg-neutral-950/85 backdrop-blur-md border border-white/10 p-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div>
              <h2 className="text-base sm:text-lg font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
                {isPastSeason
                  ? `SEASON ${selectedSeason} FINAL STANDING`
                  : isAllSeasons
                  ? "LADDER STANDING (ALL SEASONS)"
                  : "CURRENT RANK"}
              </h2>
              <p className="text-[11px] text-neutral-400 font-sans mt-0.5">
                {isPastSeason
                  ? `End of Season Rank & Final Placement`
                  : isAllSeasons
                  ? `All-Time Performance & Overview`
                  : `Active Tier Progress & Season Standing`}
              </p>
            </div>

            {/* Active Rank Tier Badge */}
            <div className="flex items-center gap-2">
              <span
                className={`text-xs sm:text-sm font-sans font-bold uppercase tracking-wider px-3 py-0.5 sm:py-1 border ${displayTheme.badgeBg} ${displayTheme.badgeBorder} ${displayTheme.textColor}`}
              >
                {isLimited ? "Limited" : "Constructed"} {displayTier}{" "}
                {displayTier.toLowerCase() !== "mythic" && formatRomanLevel(displayLevel)}
              </span>
            </div>
          </div>

          {/* Segmented Achievement Rail */}
          <div className="my-2.5">
            <div
              className="h-6 sm:h-7 w-full items-stretch select-none"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${displayMaxSteps}, minmax(0, 1fr))`,
                gap: "4px",
              }}
            >
              {Array.from({ length: displayMaxSteps }).map((_, idx) => {
                const isEarned = idx < displayStep;

                return (
                  <div
                    key={`pip-${idx}`}
                    className={`relative h-full flex items-center justify-center border transition-all duration-300 select-none overflow-hidden ${
                      isEarned
                        ? `${displayTheme.pipActive} ${displayTheme.pipText}`
                        : "bg-neutral-900/80 border-white/10 text-neutral-600"
                    }`}
                    title={`Tier Point ${idx + 1} of ${displayMaxSteps}${isEarned ? " (Earned)" : ""}`}
                  >
                    {/* MTG Card Frame Inset Double-Border */}
                    <div
                      className={`absolute inset-[2px] border pointer-events-none transition-colors ${
                        isEarned ? displayTheme.pipInnerBorder : "border-white/[0.04]"
                      }`}
                    />

                    {/* Corner Brackets / Embellishment Accent Ticks */}
                    <div className="absolute top-[2px] left-[2px] w-[3px] h-[3px] border-t border-l border-current opacity-50 pointer-events-none" />
                    <div className="absolute top-[2px] right-[2px] w-[3px] h-[3px] border-t border-r border-current opacity-50 pointer-events-none" />
                    <div className="absolute bottom-[2px] left-[2px] w-[3px] h-[3px] border-b border-l border-current opacity-50 pointer-events-none" />
                    <div className="absolute bottom-[2px] right-[2px] w-[3px] h-[3px] border-b border-r border-current opacity-50 pointer-events-none" />

                    {/* Achievement Diamond & Number */}
                    <div className="relative z-10 flex items-center justify-center gap-1 leading-none">
                      {isEarned && (
                        <span className="text-[7px] opacity-40 font-mono select-none">◆</span>
                      )}
                      <span className="text-[11px] font-sans font-bold leading-none tabular-nums">
                        {idx + 1}
                      </span>
                      {isEarned && (
                        <span className="text-[7px] opacity-40 font-mono select-none">◆</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rail Subtext */}
            <div className="flex items-center justify-between text-xs font-mono text-neutral-400 pt-1">
              <span className="text-white font-bold">
                {displayStep} / {displayMaxSteps}{" "}
                {isPastSeason ? "Final Tier Points" : "Tier Points Earned"}
              </span>
              <span className="text-neutral-500 text-[11px]">
                {isPastSeason
                  ? "Season Finished"
                  : nextTierLabel
                  ? `${nextDivisionLabel} (${pointsToNextTier} to ${nextTierTarget})`
                  : nextDivisionLabel}
              </span>
            </div>
          </div>

          {/* 4 Telemetry Stat Boxes */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-white/5">
            {/* Box 1: Record & Win Rate */}
            <div className="bg-white/[0.02] border border-white/5 p-2 flex flex-col justify-between">
              <span className="text-[10px] font-sans uppercase tracking-wider text-neutral-400 block mb-0.5">
                {isPastSeason
                  ? "Season Record"
                  : isAllSeasons
                  ? "All-Time Record"
                  : timeFilter === "1d"
                  ? "Today's Record"
                  : timeFilter === "7d"
                  ? "7-Day Record"
                  : timeFilter === "30d"
                  ? "30-Day Record"
                  : timeFilter === "60d"
                  ? "60-Day Record"
                  : "Current Season"}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-base sm:text-lg md:text-xl font-mono font-bold text-white tabular-nums leading-tight">
                  {viewWins}W - {viewLosses}L
                </span>
                {viewTotal > 0 && (
                  <span
                    className={`text-xs sm:text-sm font-mono font-bold px-1.5 py-0.5 border leading-tight ${
                      viewWinRate >= 50
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                    }`}
                  >
                    {viewWinRate}%
                  </span>
                )}
              </div>
            </div>

            {/* Box 2: Next Division vs Season Peak */}
            <div className="bg-white/[0.02] border border-white/5 p-2 flex flex-col justify-between">
              <span className="text-[10px] font-sans uppercase tracking-wider text-neutral-400 block mb-0.5">
                {isPastSeason
                  ? "Season Peak"
                  : isAllSeasons
                  ? "All-Time Peak"
                  : "Next Division & Rank"}
              </span>
              {isPastSeason || isAllSeasons ? (
                <span
                  className={`text-sm sm:text-base font-mono font-bold truncate block mt-0.5 leading-tight ${getTierColorClass(
                    peakStandingPoint?.tier
                  )}`}
                >
                  {peakStandingLabel}
                </span>
              ) : (
                <div className="space-y-0.5 mt-0.5">
                  <span
                    className={`text-xs sm:text-sm font-mono font-bold truncate block leading-tight ${getTierColorClass(
                      nextDivisionTier
                    )}`}
                  >
                    {nextDivisionLabel}
                  </span>
                  {nextTierLabel && (
                    <span
                      className={`text-[11px] sm:text-xs font-mono font-bold truncate block leading-tight ${getTierColorClass(
                        nextTierRaw
                      )}`}
                    >
                      {nextTierLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Box 3: Total Progress vs Today's Progress */}
            <div className="bg-white/[0.02] border border-white/5 p-2 flex flex-col justify-between">
              <span className="text-[10px] font-sans uppercase tracking-wider text-neutral-400 block mb-0.5">
                {isPastSeason
                  ? "Total Progress"
                  : isAllSeasons
                  ? "All-Time Progress"
                  : "Today's Progress"}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                {isPastSeason || isAllSeasons ? (
                  totalSeasonNetPoints > 0 ? (
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                  ) : totalSeasonNetPoints < 0 ? (
                    <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0" />
                  ) : (
                    <Minus className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500 shrink-0" />
                  )
                ) : todaysNetPoints > 0 ? (
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                ) : todaysNetPoints < 0 ? (
                  <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0" />
                ) : (
                  <Minus className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-500 shrink-0" />
                )}
                <div className="flex items-baseline gap-1.5 leading-tight">
                  <span
                    className={`text-base sm:text-lg md:text-xl font-mono font-bold tabular-nums leading-tight ${
                      (isPastSeason || isAllSeasons ? totalSeasonNetPoints : todaysNetPoints) > 0
                        ? "text-emerald-400"
                        : (isPastSeason || isAllSeasons ? totalSeasonNetPoints : todaysNetPoints) < 0
                        ? "text-rose-400"
                        : "text-neutral-400"
                    }`}
                  >
                    {(isPastSeason || isAllSeasons ? totalSeasonNetPoints : todaysNetPoints) > 0
                      ? `+${isPastSeason || isAllSeasons ? totalSeasonNetPoints : todaysNetPoints}`
                      : isPastSeason || isAllSeasons
                      ? totalSeasonNetPoints
                      : todaysNetPoints}
                  </span>
                  <span className="text-xs sm:text-sm font-mono text-neutral-400">
                    Tier Points
                  </span>
                </div>
              </div>
            </div>

            {/* Box 4: Projected Rewards vs Rewards Earned */}
            <div className="bg-white/[0.02] border border-white/5 p-2 flex flex-col justify-between">
              <span className="text-[10px] font-sans uppercase tracking-wider text-neutral-400 block mb-0.5">
                {isPastSeason ? "Rewards Earned" : "Projected Rewards"}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {/* Booster Packs */}
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gradient-to-r from-amber-950/60 to-neutral-900 border border-amber-500/40 text-amber-300 shadow-sm"
                  title={`${rewards.packs} ${rewards.packs === 1 ? "Booster Pack" : "Booster Packs"}`}
                >
                  <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-amber-200">
                    {rewards.packs} {rewards.packs === 1 ? "Pack" : "Packs"}
                  </span>
                </div>

                {/* Gold */}
                {rewards.gold > 0 && (
                  <div
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gradient-to-r from-yellow-950/60 to-neutral-900 border border-yellow-500/40 text-yellow-300 shadow-sm"
                    title={`${rewards.gold.toLocaleString()} Arena Gold`}
                  >
                    <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-yellow-200">
                      {rewards.gold.toLocaleString()} Gold
                    </span>
                  </div>
                )}

                {/* Card Styles */}
                {rewards.styles > 0 && (
                  <div
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gradient-to-r from-cyan-950/60 to-neutral-900 border border-cyan-500/40 text-cyan-300 shadow-sm"
                    title={`${rewards.styles} Parallax Card Cosmetic ${rewards.styles === 1 ? "Style" : "Styles"}`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-cyan-200">
                      {rewards.styles} {rewards.styles === 1 ? "Style" : "Styles"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ZONE B: GRAPH SECTION ("Season Progression" - Expanded by 50% in height)   */}
        {/* ========================================================================= */}
        <div className="shrink-0 bg-neutral-950/85 backdrop-blur-md border border-white/10 p-3">
          <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/10 gap-2 flex-wrap">
            <h2 className="text-sm sm:text-base font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
              Season Progression
            </h2>

            {/* Filter selection at the top of the Season Progression Graph */}
            <div className="flex items-center gap-1 text-xs font-mono flex-wrap justify-end">
              {FILTER_OPTIONS.map((item) => {
                const isSelected = timeFilter === item.id;
                const isDisabled = item.id === "prev_season" && previousSeason === null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleFilterSelect(item.id)}
                    title={item.title}
                    className={`px-2.5 py-1 border transition-colors cursor-pointer uppercase tracking-wider rounded-none ${
                      isSelected
                        ? "bg-white/20 text-white border-white/30 font-bold"
                        : isDisabled
                        ? "bg-white/[0.01] text-neutral-600 border-white/5 cursor-not-allowed"
                        : "bg-white/[0.03] text-neutral-400 border-white/5 hover:text-neutral-200 hover:border-white/20"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full h-[330px] sm:h-[365px] relative">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 12, right: 16, left: 6, bottom: 0 }}
                >
                  {/* Dynamic SVG Gradients strictly aligned to tier boundaries in userSpaceOnUse */}
                  <Customized component={DynamicTierGradients} />

                  {/* Colored Division Background Bands (Silver & Bronze divisions guaranteed visible) */}
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

                  {/* Tier Transition Lines */}
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

                  {/* Season Transition Capping Borders & Dark Gap */}
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
                    width={56}
                  />
                  <Tooltip content={<CustomTooltip />} />

                  {distinctSeasonsInView.map((s) => (
                    <Area
                      key={`area-season-${s}`}
                      type="monotone"
                      dataKey={`s_${s}`}
                      stroke="url(#climbStroke)"
                      strokeWidth={2.5}
                      fill="url(#climbFill)"
                      fillOpacity={1}
                      dot={renderChartDot}
                      activeDot={renderActiveDot}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-500">
                No climb snapshots recorded in this period
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ZONE C: BOTTOM SPLIT PANELS (Ranked Match History 50% & Performance 50%) */}
        {/* ========================================================================= */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 pb-1">
          {/* Left Panel: RANKED MATCH HISTORY (50% width) */}
          <div className="lg:flex-1 lg:w-1/2 w-full min-w-0 h-full flex flex-col bg-neutral-950/85 backdrop-blur-md border border-white/10 p-3">
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm sm:text-base font-display font-bold tracking-[0.12em] uppercase text-white">
                  RANKED MATCH HISTORY
                </h3>
              </div>
              <span className="text-xs font-mono text-neutral-400 tabular-nums">
                {filteredRankedMatches.length} {filteredRankedMatches.length === 1 ? "match" : "matches"}
              </span>
            </div>

            {/* Floating Frozen Table Header (No dark background, per design system) */}
            <div className="flex items-center h-[32px] px-2 shrink-0 select-none text-xs font-sans font-bold text-white border-b border-white/10">
              <div className="flex-1 min-w-0 text-left px-1">Matchup</div>
              <div className="w-16 text-center px-1 shrink-0">Result</div>
              <div className="w-14 text-center px-1 shrink-0">Impact</div>
              <div className="w-28 text-center px-1 shrink-0">Format</div>
              <div className="w-16 text-right px-1 shrink-0">Date</div>
            </div>

            {/* Scrollable Table: Fills remaining vertical space */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-white/5">
              {filteredRankedMatches.length > 0 ? (
                filteredRankedMatches.map((m) => {
                  const isWin = m.result === "win";
                  const impactNum = getMatchImpact(m);
                  const impact = impactNum > 0 ? `+${impactNum}` : `${impactNum}`;

                  return (
                    <div
                      key={m.match_id}
                      onClick={() => onSelectMatch(m.match_id)}
                      className="flex items-center py-1.5 px-2 hover:bg-white/[0.04] transition-colors cursor-pointer group text-xs font-mono"
                    >
                      {/* Matchup */}
                      <div className="flex-1 min-w-0 px-1 flex items-center gap-1.5 font-sans">
                        <div className="flex items-center gap-0.5 shrink-0">
                          {(m.deck_colors || []).map((c) => (
                            <ManaPip key={c} symbol={c} size={12} />
                          ))}
                        </div>
                        <span className="font-bold text-white truncate max-w-[130px] sm:max-w-[180px]" title={m.player_deck_name || "Unknown Deck"}>
                          {m.player_deck_name || "Unknown Deck"}
                        </span>
                        <span className="text-neutral-500 text-[10px] shrink-0 font-mono">vs</span>
                        <span className="text-neutral-300 truncate max-w-[90px] sm:max-w-[140px]" title={m.opponent_name || "Opponent"}>
                          {m.opponent_name || "Opponent"}
                        </span>
                      </div>

                      {/* Result */}
                      <div className="w-16 px-1 flex items-center justify-center shrink-0">
                        <span
                          className={`px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider border ${
                            isWin
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                              : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                          }`}
                        >
                          {isWin ? "WIN" : "LOSS"}
                        </span>
                      </div>

                      {/* Rank Impact */}
                      <div className="w-14 px-1 flex items-center justify-center shrink-0">
                        <span
                          className={`px-1.5 py-0.5 text-[9.5px] font-bold border tabular-nums ${
                            impact.startsWith("+")
                              ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/40"
                              : impact === "0"
                              ? "text-neutral-400 bg-white/[0.03] border-white/10"
                              : "text-rose-300 bg-rose-500/15 border-rose-500/40"
                          }`}
                        >
                          {impact}
                        </span>
                      </div>

                      {/* Format */}
                      <div className="w-28 px-1 text-center text-[10px] text-neutral-400 truncate shrink-0" title={m.format_name}>
                        {m.format_name}
                      </div>

                      {/* Date */}
                      <div className="w-16 px-1 text-right text-[10px] text-neutral-400 tabular-nums shrink-0">
                        {formatRelativeTime(m.timestamp)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex items-center justify-center text-xs font-mono text-neutral-500">
                  No ranked matches found for this timeframe
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: RANKED DECK PERFORMANCE & FORMAT STATS (50% width) */}
          <div className="lg:flex-1 lg:w-1/2 w-full min-w-0 h-full grid grid-rows-2 gap-2.5">
            {/* Upper: Ranked Deck Performance (Side-by-side: Pie on LEFT, Table on RIGHT) */}
            <div className="h-full min-h-0 flex flex-col bg-neutral-950/85 backdrop-blur-md border border-white/10 p-2.5">
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-display font-bold tracking-[0.12em] uppercase text-white">
                    RANKED DECK PERFORMANCE
                  </h3>
                  {selectedDeckName && (
                    <span className="text-[9.5px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2">
                      Win/Loss: {selectedDeckName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedDeckName && (
                    <button
                      type="button"
                      onClick={() => setSelectedDeckName(null)}
                      className="text-[9.5px] font-mono text-neutral-400 hover:text-white px-1.5 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                    >
                      ← All Decks
                    </button>
                  )}
                  <span className="text-[11px] font-mono text-neutral-400">
                    {rankedDeckStats.length} {rankedDeckStats.length === 1 ? "Deck" : "Decks"}
                  </span>
                </div>
              </div>

              {/* Side-by-side content: Donut Pie on LEFT, Table on RIGHT */}
              <div className="flex-1 min-h-0 flex flex-row items-center gap-3 w-full">
                {/* Left: Donut Pie Graph */}
                <div
                  className="w-36 sm:w-44 h-full shrink-0 relative flex items-center justify-center cursor-pointer"
                  onClick={() => {
                    if (selectedDeckName) setSelectedDeckName(null);
                  }}
                  title={selectedDeckName ? "Click to return to all decks" : undefined}
                >
                  {(selectedDeckName && activeDeckStats ? deckWinLossPieData : deckPieData).length > 0 ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                          {/* SVG Striped Patterns for multi-color decks */}
                          <defs>
                            {deckPieData.map(
                              (d) =>
                                d.patternDef && (
                                  <pattern
                                    key={d.patternDef.id}
                                    id={d.patternDef.id}
                                    width="8"
                                    height="8"
                                    patternTransform="rotate(45 0 0)"
                                    patternUnits="userSpaceOnUse"
                                  >
                                    <rect width="4" height="8" fill={d.patternDef.c1} />
                                    <rect x="4" width="4" height="8" fill={d.patternDef.c2} />
                                  </pattern>
                                )
                            )}
                          </defs>
                          <Pie
                            data={selectedDeckName && activeDeckStats ? deckWinLossPieData : deckPieData}
                            dataKey="games"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius="44%"
                            outerRadius="80%"
                            stroke="#121212"
                            strokeWidth={1.5}
                            paddingAngle={2}
                            isAnimationActive={false}
                            onClick={(entry: any) => {
                              if (selectedDeckName) {
                                setSelectedDeckName(null);
                              } else if (entry && entry.name) {
                                setSelectedDeckName(entry.name);
                              }
                            }}
                          >
                            {(selectedDeckName && activeDeckStats ? deckWinLossPieData : deckPieData).map((d, idx) => (
                              <Cell
                                key={`deck-cell-${d.name}-${idx}`}
                                fill={d.fill}
                                className="cursor-pointer transition-opacity hover:opacity-80"
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-none select-none">
                        {selectedDeckName && activeDeckStats ? (
                          <>
                            <span className="text-xs font-mono font-bold text-white tabular-nums">
                              {activeDeckStats.wins + activeDeckStats.losses > 0
                                ? Math.round((activeDeckStats.wins / (activeDeckStats.wins + activeDeckStats.losses)) * 100)
                                : 0}%
                            </span>
                            <span className="text-[7.5px] font-sans uppercase tracking-wider text-emerald-400 mt-0.5">
                              Win Rate
                            </span>
                            <span className="text-[7.5px] font-mono text-neutral-400 mt-0.5">
                              {activeDeckStats.wins}W - {activeDeckStats.losses}L
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-mono font-bold text-white tabular-nums">
                              {totalDeckGames}
                            </span>
                            <span className="text-[8px] font-sans uppercase tracking-wider text-neutral-400 mt-0.5">
                              Games
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-neutral-500">
                      No deck distribution
                    </div>
                  )}
                </div>

                {/* Right: Scrollable Deck List Table */}
                <div className="flex-1 min-w-0 h-full flex flex-col">
                  {/* Floating Frozen Header (No dark background, per design system) */}
                  <div className="flex items-center h-[28px] px-1.5 shrink-0 select-none text-[11px] font-sans font-bold text-white border-b border-white/10">
                    <div className="flex-1 min-w-0 text-left px-1">Deck</div>
                    <div className="w-16 text-center px-1 shrink-0">Points</div>
                    <div className="w-20 text-center px-1 shrink-0">Record</div>
                    <div className="w-16 text-right px-1 shrink-0">Win Rate</div>
                  </div>

                  {/* Scrollable Rows */}
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                    {rankedDeckStats.length > 0 ? (
                      rankedDeckStats.map((d) => {
                        const dTotal = d.wins + d.losses;
                        const dWr = dTotal > 0 ? Math.round((d.wins / dTotal) * 100) : 0;
                        const isSelected = selectedDeckName === d.name;

                        return (
                          <div
                            key={d.name}
                            onClick={() => {
                              setSelectedDeckName((prev) => (prev === d.name ? null : d.name));
                              if (onSelectDeck) onSelectDeck(d.name);
                            }}
                            className={`flex items-center py-1 px-1.5 transition-colors cursor-pointer text-[10.5px] font-mono ${
                              isSelected
                                ? "bg-white/[0.08] border-l-2 border-emerald-400"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex-1 min-w-0 px-1 flex items-center gap-1.5 font-sans">
                              <div className="flex items-center gap-0.5 shrink-0">
                                {d.colors.map((c) => (
                                  <ManaPip key={c} symbol={c} size={11} />
                                ))}
                              </div>
                              <span
                                className={`font-bold truncate max-w-[120px] sm:max-w-[160px] ${
                                  isSelected ? "text-white" : "text-neutral-200"
                                }`}
                                title={d.name}
                              >
                                {d.name}
                              </span>
                            </div>
                            <div className="w-16 px-1 text-center shrink-0">
                              <span
                                className={`font-bold tabular-nums ${
                                  d.netPoints > 0
                                    ? "text-emerald-400"
                                    : d.netPoints < 0
                                    ? "text-rose-400"
                                    : "text-neutral-400"
                                }`}
                              >
                                {d.netPoints > 0 ? `+${d.netPoints}` : d.netPoints}
                              </span>
                            </div>
                            <div className="w-20 px-1 text-center text-neutral-300 shrink-0 tabular-nums whitespace-nowrap">
                              {d.wins}W - {d.losses}L
                            </div>
                            <div className="w-16 px-1 text-right shrink-0 whitespace-nowrap">
                              <span
                                className={`inline-block px-1.5 py-0.2 text-[9px] font-bold border ${
                                  dWr >= 50
                                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                                    : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                                }`}
                              >
                                {dWr}%
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-2 text-center text-[11px] font-mono text-neutral-500">
                        No deck data for this timeframe
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Lower: FORMAT STATS (Side-by-side: Pie on LEFT, List on RIGHT) */}
            <div className="h-full min-h-0 flex flex-col bg-neutral-950/85 backdrop-blur-md border border-white/10 p-2.5">
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-display font-bold tracking-[0.12em] uppercase text-white">
                    FORMAT STATS
                  </h3>
                  {selectedFormatName && (
                    <span className="text-[9.5px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2">
                      Win/Loss: {selectedFormatName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedFormatName && (
                    <button
                      type="button"
                      onClick={() => setSelectedFormatName(null)}
                      className="text-[9.5px] font-mono text-neutral-400 hover:text-white px-1.5 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                    >
                      ← All Formats
                    </button>
                  )}
                  <span className="text-[11px] font-mono text-neutral-400">
                    {formatStats.length} {formatStats.length === 1 ? "Format" : "Formats"}
                  </span>
                </div>
              </div>

              {/* Side-by-side content: Donut Pie on LEFT, List on RIGHT */}
              <div className="flex-1 min-h-0 flex flex-row items-center gap-3 w-full">
                {/* Left: Donut Pie Graph */}
                <div
                  className="w-36 sm:w-44 h-full shrink-0 relative flex items-center justify-center cursor-pointer"
                  onClick={() => {
                    if (selectedFormatName) setSelectedFormatName(null);
                  }}
                  title={selectedFormatName ? "Click to return to all formats" : undefined}
                >
                  {(selectedFormatName && activeFormatStats ? formatWinLossPieData : formatPieData).length > 0 ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                          <Pie
                            data={selectedFormatName && activeFormatStats ? formatWinLossPieData : formatPieData}
                            dataKey="games"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius="44%"
                            outerRadius="80%"
                            stroke="#121212"
                            strokeWidth={1.5}
                            paddingAngle={2}
                            isAnimationActive={false}
                            onClick={(entry: any) => {
                              if (selectedFormatName) {
                                setSelectedFormatName(null);
                              } else if (entry && entry.name) {
                                setSelectedFormatName(entry.name);
                              }
                            }}
                          >
                            {(selectedFormatName && activeFormatStats ? formatWinLossPieData : formatPieData).map((f, idx) => (
                              <Cell
                                key={`format-cell-${f.name}-${idx}`}
                                fill={f.fill || getFormatColor(f.name, idx)}
                                className="cursor-pointer transition-opacity hover:opacity-80"
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomPieTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-none select-none">
                        {selectedFormatName && activeFormatStats ? (
                          <>
                            <span className="text-xs font-mono font-bold text-white tabular-nums">
                              {activeFormatStats.wins + activeFormatStats.losses > 0
                                ? Math.round((activeFormatStats.wins / (activeFormatStats.wins + activeFormatStats.losses)) * 100)
                                : 0}%
                            </span>
                            <span className="text-[7.5px] font-sans uppercase tracking-wider text-emerald-400 mt-0.5">
                              Win Rate
                            </span>
                            <span className="text-[7.5px] font-mono text-neutral-400 mt-0.5">
                              {activeFormatStats.wins}W - {activeFormatStats.losses}L
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-mono font-bold text-white tabular-nums">
                              {totalFormatGames}
                            </span>
                            <span className="text-[8px] font-sans uppercase tracking-wider text-neutral-400 mt-0.5">
                              Games
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-neutral-500">
                      No format distribution
                    </div>
                  )}
                </div>

                {/* Right: Scrollable Format List Table */}
                <div className="flex-1 min-w-0 h-full flex flex-col">
                  {/* Floating Frozen Header (No dark background, per design system) */}
                  <div className="flex items-center h-[28px] px-1.5 shrink-0 select-none text-[11px] font-sans font-bold text-white border-b border-white/10">
                    <div className="flex-1 min-w-0 text-left px-1">Format</div>
                    <div className="w-20 text-center px-1 shrink-0">Record</div>
                    <div className="w-16 text-right px-1 shrink-0">Win Rate</div>
                  </div>

                  {/* Scrollable Format List */}
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                    {formatStats.length > 0 ? (
                      formatStats.map((fmt, idx) => {
                        const fTotal = fmt.wins + fmt.losses;
                        const fWr = fTotal > 0 ? Math.round((fmt.wins / fTotal) * 100) : 0;
                        const color = getFormatColor(fmt.format, idx);
                        const isSelected = selectedFormatName === fmt.format;

                        return (
                          <div
                            key={fmt.format}
                            onClick={() =>
                              setSelectedFormatName((prev) => (prev === fmt.format ? null : fmt.format))
                            }
                            className={`flex items-center py-1 px-1.5 text-[10.5px] font-mono cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-white/[0.08] border-l-2 border-emerald-400 text-white font-bold"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex-1 min-w-0 px-1 flex items-center gap-1.5 font-sans">
                              <span
                                className="w-2 h-2 shrink-0 rounded-none"
                                style={{ backgroundColor: color }}
                              />
                              <span
                                className={`truncate max-w-[120px] sm:max-w-[160px] ${
                                  isSelected ? "text-white" : "text-neutral-200"
                                }`}
                                title={fmt.format}
                              >
                                {fmt.format}
                              </span>
                            </div>
                            <div className="w-20 px-1 text-center text-neutral-300 shrink-0 tabular-nums whitespace-nowrap">
                              {fmt.wins}W - {fmt.losses}L
                            </div>
                            <div className="w-16 px-1 text-right shrink-0 whitespace-nowrap">
                              <span
                                className={`inline-block px-1.5 py-0.2 text-[9px] font-bold border ${
                                  fWr >= 50
                                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                                    : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                                }`}
                              >
                                {fWr}%
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-2 text-center text-[11px] font-mono text-neutral-500">
                        No format stats for this timeframe
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
