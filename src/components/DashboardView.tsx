import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  Trophy,
  TrendingUp,
  Calendar,
  Flame,
  Swords,
  Layers,
  Clock,
  Target,
  Crosshair,
  Activity,
  ChevronRight,
  History,
  Gamepad2,
  Library,
  Palette,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardNameTooltip } from './CardNameTooltip';
import logoSvg from '../assets/RhysticTrackerLogo.svg';
import iconSvg from '../assets/RhysticTrackerICON.svg';

interface ManaTheme {
  id: string;
  name: string;
  is_dark: boolean;
  base: string;
  mantle: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  accent: string;
  accent_hover: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
}

interface MatchRecord {
  match_id: string;
  timestamp: string;
  date_str: string;
  format_name: string;
  result: string;
  result_reason?: string;
  duration_seconds: number;
  turns: number;
  going_first: boolean;
  player_deck_name: string;
  player_commander_id?: number;
  player_commander_name?: string;
  player_life_end?: number;
  player_mulligans?: number;
  opponent_name?: string;
  opponent_commander_id?: number;
  opponent_commander_name?: string;
  opponent_mulligans?: number;
  opponent_life_end?: number;
  mana_curve?: number[];
  deck_colors?: string[];
  opponent_colors?: string[];
}

interface DashboardViewProps {
  matches: MatchRecord[];
  deckOverview: any[];
  palette: ManaTheme | null;
  formatOptions: { value: string; label: string }[];
  timeOptions: { value: string; label: string }[];
  onSelectMatch: (matchId: string) => void;
  onSelectDeck: (deckName: string) => void;
  onShowCard: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
  hideBrandHeader?: boolean;
  isTestEnv?: boolean;
}

// ---- small helpers (duplicated locally to keep the component self-contained) ----

const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

// Flat win-rate color: green above 50%, red below 50% (no gradient).
const flatWinRateColor = (rate: number): string => (rate >= 50 ? '#34D399' : '#F87171');

const scryfallCardUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;

const winRateColor = (rate: string): string => (parseFloat(rate) || 0) >= 50 ? '#34D399' : '#F87171';

const localDateKey = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

// Local calendar-day key for a match timestamp. date_str is stored in UTC, so we
// must derive the day from the local timestamp to group by the player's day.
const matchDayKey = (m: { timestamp: string }): string => {
  const d = new Date(m.timestamp);
  if (isNaN(d.getTime())) return '';
  return localDateKey(d);
};

const dayLabel = (key: string, todayKey: string): string => {
  if (key === todayKey) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === localDateKey(y)) return 'Yesterday';
  const parts = key.split('-');
  if (parts.length !== 3) return key;
  const [, mo, dy] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(dy, 10)} ${months[parseInt(mo, 10) - 1]}`;
};

const formatTimeOnly = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateShort = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts || '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate();
  const mon = months[d.getMonth()];
  const yr = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yr} ${hh}:${mm}`;
};

// ---- Dashboard View ----

export const DashboardView: React.FC<DashboardViewProps> = ({
  matches,
  deckOverview,
  palette,
  formatOptions,
  timeOptions,
  onSelectMatch,
  onSelectDeck,
  onShowCard,
  hideBrandHeader = false,
  isTestEnv = false,
}) => {
  const [chartFormat, setChartFormat] = useState('ALL');
  const [chartTime, setChartTime] = useState('14D');

  // ---- Deck Spotlight fixed-design-size scaled unit ----
  // The marquee card + 6 key cards are designed once at a fixed reference size,
  // then the whole unit is scaled as one block via transform: scale() driven by
  // the available column width. This keeps both pieces in perfect lockstep.
  const SPOT_DESIGN_W = 360;
  const SPOT_DESIGN_H = 398;
  const SPOT_MARQUEE_W = 285;
  const SPOT_MARQUEE_H = 398;
  const SPOT_KEY_SIDE = 63;
  const SPOT_GAP = 12;
  const [spotScale, setSpotScale] = useState(1);
  const spotBtnRef = useRef<HTMLButtonElement>(null);
  const spotInfoRef = useRef<HTMLDivElement>(null);

  const todayKey = useMemo(() => localDateKey(new Date()), []);

  const winLossMatches = useMemo(
    () => matches.filter((m) => m.result === 'win' || m.result === 'loss'),
    [matches]
  );

  // ---- Top row stat cells ----

  const stats = useMemo(() => {
    const todayMatches = winLossMatches.filter((m) => matchDayKey(m) === todayKey);
    const todayWins = todayMatches.filter((m) => m.result === 'win').length;
    const todayLosses = todayMatches.filter((m) => m.result === 'loss').length;

    const allWins = winLossMatches.filter((m) => m.result === 'win').length;
    const allLosses = winLossMatches.filter((m) => m.result === 'loss').length;

    const desc = [...winLossMatches].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    let curType = desc[0]?.result || '';
    let curStreak = 0;
    for (const m of desc) {
      if (m.result === curType) curStreak++;
      else break;
    }

    return {
      todayWins,
      todayLosses,
      todayCount: todayMatches.length,
      todayWinRate: todayMatches.length > 0 ? (todayWins / todayMatches.length) * 100 : 0,
      allWins,
      allLosses,
      allCount: winLossMatches.length,
      allWinRate: winLossMatches.length > 0 ? (allWins / winLossMatches.length) * 100 : 0,
      curStreak,
      curStreakType: curType as 'win' | 'loss' | '',
    };
  }, [winLossMatches, todayKey]);

  // ---- Trending win rate chart ----

  const chartData = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start7D = new Date(now.getTime() - 7 * 86400000);
    const start14D = new Date(now.getTime() - 14 * 86400000);
    const start30D = new Date(now.getTime() - 30 * 86400000);
    const start12M = new Date(now.getTime() - 365 * 86400000);

    if (chartTime === 'TODAY') {
      // Hourly bucketing for Today (no trend line)
      const hourly = new Map<number, { wins: number; losses: number }>();
      for (const m of winLossMatches) {
        if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) continue;
        const d = new Date(m.timestamp);
        if (d < startOfToday) continue;
        const hour = d.getHours();
        const e = hourly.get(hour) || { wins: 0, losses: 0 };
        if (m.result === 'win') e.wins++;
        else e.losses++;
        hourly.set(hour, e);
      }

      let minHour = 24;
      let maxHour = 0;
      for (const h of hourly.keys()) {
        if (h < minHour) minHour = h;
        if (h > maxHour) maxHour = h;
      }
      if (minHour > maxHour) {
        minHour = 0;
        maxHour = now.getHours();
      } else {
        minHour = Math.max(0, minHour - 1);
        maxHour = Math.min(23, Math.max(maxHour + 1, now.getHours()));
      }

      const rows = [];
      for (let h = minHour; h <= maxHour; h++) {
        const e = hourly.get(h) || { wins: 0, losses: 0 };
        const label = `${String(h).padStart(2, '0')}:00`;
        const total = e.wins + e.losses;
        const winrate = total > 0 ? (e.wins / total) * 100 : 0;
        rows.push({
          date: `hour-${h}`,
          label,
          wins: e.wins,
          losses: e.losses,
          winrate: Math.round(winrate * 10) / 10,
          trend: 0,
        });
      }
      return rows;
    }

    if (chartTime === '12M') {
      // Week-by-week bucketing for Past 12 Months
      const weekly = new Map<string, { wins: number; losses: number; label: string; time: number }>();
      for (const m of winLossMatches) {
        if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) continue;
        const d = new Date(m.timestamp);
        if (d < start12M) continue;

        const dayOfWeek = (d.getDay() + 6) % 7;
        const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek);
        const key = localDateKey(weekStart);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${weekStart.getDate()} ${months[weekStart.getMonth()]}`;

        const e = weekly.get(key) || { wins: 0, losses: 0, label, time: weekStart.getTime() };
        if (m.result === 'win') e.wins++;
        else e.losses++;
        weekly.set(key, e);
      }

      const weeks = [...weekly.entries()].sort((a, b) => a[1].time - b[1].time);
      return weeks.map(([date, { wins, losses, label }], idx) => {
        const total = wins + losses;
        const winrate = total > 0 ? (wins / total) * 100 : 0;
        const windowStart = Math.max(0, idx - 3);
        let windowWins = 0;
        let windowTotal = 0;
        for (let j = windowStart; j <= idx; j++) {
          const e = weeks[j][1];
          windowWins += e.wins;
          windowTotal += (e.wins + e.losses);
        }
        const trend = windowTotal > 0 ? (windowWins / windowTotal) * 100 : 0;
        return {
          date,
          label,
          wins,
          losses,
          winrate: Math.round(winrate * 10) / 10,
          trend: Math.round(trend * 10) / 10,
        };
      });
    }

    if (chartTime === 'ALL') {
      // Monthly bucketing for All Time
      const monthly = new Map<string, { wins: number; losses: number; label: string; time: number }>();
      for (const m of winLossMatches) {
        if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) continue;
        const d = new Date(m.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;

        const e = monthly.get(key) || { wins: 0, losses: 0, label, time: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
        if (m.result === 'win') e.wins++;
        else e.losses++;
        monthly.set(key, e);
      }

      const monthsArr = [...monthly.entries()].sort((a, b) => a[1].time - b[1].time);
      return monthsArr.map(([date, { wins, losses, label }], idx) => {
        const total = wins + losses;
        const winrate = total > 0 ? (wins / total) * 100 : 0;
        const windowStart = Math.max(0, idx - 2);
        let windowWins = 0;
        let windowTotal = 0;
        for (let j = windowStart; j <= idx; j++) {
          const e = monthsArr[j][1];
          windowWins += e.wins;
          windowTotal += (e.wins + e.losses);
        }
        const trend = windowTotal > 0 ? (windowWins / windowTotal) * 100 : 0;
        return {
          date,
          label,
          wins,
          losses,
          winrate: Math.round(winrate * 10) / 10,
          trend: Math.round(trend * 10) / 10,
        };
      });
    }

    // Continuous daily bucketing for '7D', '14D' and '30D'
    const numDays = chartTime === '7D' ? 7 : chartTime === '14D' ? 14 : 30;
    const daily = new Map<string, { wins: number; losses: number }>();
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = localDateKey(d);
      daily.set(key, { wins: 0, losses: 0 });
    }

    for (const m of winLossMatches) {
      if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) continue;
      const key = matchDayKey(m);
      if (!key || !daily.has(key)) continue;
      const e = daily.get(key)!;
      if (m.result === 'win') e.wins++;
      else e.losses++;
    }

    const days = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let lastKnownTrend = 50.0;
    // Pre-seed lastKnownTrend from earlier matches if available
    const priorMatches = winLossMatches.filter((m) => {
      if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) return false;
      const d = new Date(m.timestamp);
      return d < (chartTime === '7D' ? start7D : chartTime === '14D' ? start14D : start30D);
    });
    if (priorMatches.length > 0) {
      const pWins = priorMatches.filter(m => m.result === 'win').length;
      lastKnownTrend = (pWins / priorMatches.length) * 100;
    }

    // Weighted rolling average across continuous days
    const rows = days.map(([date, { wins, losses }], idx) => {
      const total = wins + losses;
      const winrate = total > 0 ? (wins / total) * 100 : 0;
      const windowStart = Math.max(0, idx - 4);
      let windowWins = 0;
      let windowTotal = 0;
      for (let j = windowStart; j <= idx; j++) {
        const e = days[j][1];
        windowWins += e.wins;
        windowTotal += (e.wins + e.losses);
      }
      if (windowTotal > 0) {
        lastKnownTrend = (windowWins / windowTotal) * 100;
      }
      return {
        date,
        label: dayLabel(date, todayKey),
        wins,
        losses,
        winrate: total > 0 ? Math.round(winrate * 10) / 10 : null,
        trend: Math.round(lastKnownTrend * 10) / 10,
      };
    });
    return rows;
  }, [winLossMatches, chartFormat, chartTime, todayKey]);

  // Left-axis (played matches) scale: ~25% headroom above the busiest day in the
  // filtered range, so the stacked bars always scale to the data.
  const maxPlays = useMemo(() => {
    const busiest = chartData.reduce((max, r) => Math.max(max, r.wins + r.losses), 0);
    const scaled = Math.ceil(busiest * 1.25);
    return Math.max(scaled, 5);
  }, [chartData]);

  // Extend trendline & area to the absolute visual edges of the chart by padding edge boundary entries
  const extendedChartData = useMemo(() => {
    if (!chartData || chartData.length <= 1) return chartData;
    const first = chartData[0];
    const last = chartData[chartData.length - 1];

    const leftPad = {
      ...first,
      date: '__edge_start__',
      label: '',
      wins: 0,
      losses: 0,
      isPad: true,
    };

    const rightPad = {
      ...last,
      date: '__edge_end__',
      label: '',
      wins: 0,
      losses: 0,
      isPad: true,
    };

    return [leftPad, ...chartData, rightPad];
  }, [chartData]);

  // Horizontal gradient stops across the X-axis (left to right) for both the trend line and background shading
  const horizontalGradientStops = useMemo(() => {
    const data = extendedChartData;
    if (!data || data.length === 0) {
      return [{ offset: '0%', color: '#22C55E', lineOpacity: 1, areaOpacity: 0.24 }];
    }
    const n = data.length;
    if (n === 1) {
      const isGreen = (data[0].trend ?? 50) >= 50;
      const c = isGreen ? '#22C55E' : '#EF4444';
      return [
        { offset: '0%', color: c, lineOpacity: 1, areaOpacity: 0.24 },
        { offset: '100%', color: c, lineOpacity: 1, areaOpacity: 0.24 },
      ];
    }

    const stops: { offset: string; color: string; lineOpacity: number; areaOpacity: number }[] = [];

    data.forEach((d, idx) => {
      const pct = (idx / (n - 1)) * 100;
      const isGreen = (d.trend ?? 50) >= 50;
      const color = isGreen ? '#22C55E' : '#EF4444';
      const areaOpacity = 0.24;

      if (idx === 0) {
        stops.push({ offset: '0%', color, lineOpacity: 1, areaOpacity });
      } else {
        const prev = data[idx - 1];
        const prevIsGreen = (prev.trend ?? 50) >= 50;
        const prevColor = prevIsGreen ? '#22C55E' : '#EF4444';
        const prevPct = ((idx - 1) / (n - 1)) * 100;

        if (prevIsGreen !== isGreen) {
          // Crosses the 50% line between prev and current index!
          const t1 = prev.trend ?? 50;
          const t2 = d.trend ?? 50;
          const fraction = Math.abs(t2 - t1) > 0 ? (50 - t1) / (t2 - t1) : 0.5;
          const crossPct = prevPct + Math.max(0, Math.min(1, fraction)) * (pct - prevPct);
          const blendDelta = Math.min(1.5, (pct - prevPct) * 0.2);

          stops.push({
            offset: `${Math.max(0, crossPct - blendDelta).toFixed(2)}%`,
            color: prevColor,
            lineOpacity: 1,
            areaOpacity: 0.24,
          });
          stops.push({
            offset: `${Math.min(100, crossPct + blendDelta).toFixed(2)}%`,
            color,
            lineOpacity: 1,
            areaOpacity: 0.24,
          });
        }
        stops.push({ offset: `${pct.toFixed(2)}%`, color, lineOpacity: 1, areaOpacity });
      }
    });

    return stops;
  }, [extendedChartData]);

  // ---- Recent matches grouped by day ----

  const recentGroups = useMemo(() => {
    const recent = [...winLossMatches].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, 10);

    const groups: { label: string; items: MatchRecord[] }[] = [];
    for (const m of recent) {
      const key = matchDayKey(m);
      const label = dayLabel(key, todayKey);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
    return groups;
  }, [winLossMatches, todayKey]);

  // ---- Deck Spotlight ----

  const eligibleDecks = useMemo(
    () =>
      deckOverview.filter(
        (d) => (d.total_matches || 0) >= 10 && (parseFloat(d.winrate) || 0) >= 50
      ),
    [deckOverview]
  );

  const spotlight = useMemo(() => {
    if (eligibleDecks.length === 0) return null;
    const idx = Math.floor(Date.now() / (5 * 60 * 1000)) % eligibleDecks.length;
    return eligibleDecks[idx];
  }, [eligibleDecks]);

  const lastPlayedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matches) {
      const prev = map.get(m.player_deck_name);
      if (!prev || m.timestamp > prev) map.set(m.player_deck_name, m.timestamp);
    }
    return map;
  }, [matches]);

  const spotlightIsBrawl = useMemo(
    () =>
      (spotlight?.formats || []).some(
        (f: any) => String(f.format || '').toLowerCase().includes('brawl')
      ),
    [spotlight]
  );

  // Marquee card: always the commander for Brawl; otherwise the most impactful
  // highest-CMC non-land card (top candidate from the deck's key cards).
  const spotlightMarquee = useMemo(() => {
    if (!spotlight) return null;
    if (spotlightIsBrawl && spotlight.top_commander_name) {
      return { name: spotlight.top_commander_name, grp_id: spotlight.top_commander_grp_id, isCommander: true };
    }
    const keys: any[] = spotlight.key_cards || [];
    const best = keys.reduce<any | null>(
      (acc, k) => (!acc || (k.cmc || 0) > (acc.cmc || 0) ? k : acc),
      null
    );
    if (best) return { name: best.name, grp_id: best.grp_id, isCommander: false };
    if (spotlight.top_card_name) return { name: spotlight.top_card_name, grp_id: spotlight.top_card_grp_id, isCommander: false };
    return null;
  }, [spotlight, spotlightIsBrawl]);

  const spotlightKeyCards = useMemo(
    () => (spotlight?.key_cards || []).slice(0, 6) as any[],
    [spotlight]
  );

  // Measure the available width of the spotlight button and scale the fixed
  // design-size unit (marquee + 6 key cards) as one block.
  useEffect(() => {
    const btn = spotBtnRef.current;
    if (!btn) return;
    const compute = () => {
      const availW = Math.max(btn.clientWidth - 24, 100);
      const infoH = spotInfoRef.current?.offsetHeight ?? 180;
      const availH = Math.max(btn.clientHeight - 24 - infoH - 12, 100);
      const widthScale = availW / SPOT_DESIGN_W;
      const heightScale = availH / SPOT_DESIGN_H;
      const s = Math.min(widthScale, heightScale);
      setSpotScale(Math.max(0.3, Math.min(s, 1.5)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(btn);
    return () => ro.disconnect();
  }, [spotlight?.deck_name, spotlightKeyCards.length]);

  // ---- Fun Facts ----

  const funFacts = useMemo(() => {
    const onPlay = winLossMatches.filter((m) => m.going_first === true).length;
    const onDraw = winLossMatches.filter((m) => m.going_first === false).length;
    const playTotal = onPlay + onDraw;
    const playWins = winLossMatches.filter((m) => m.going_first === true && m.result === 'win').length;
    const drawWins = winLossMatches.filter((m) => m.going_first === false && m.result === 'win').length;

    // Arch nemesis: worst win rate opponent commander, min 25 games.
    const agg = new Map<string, { name: string; count: number; wins: number; grp_id?: number; colors: string[]; _freq?: Map<string, number> }>();
    for (const m of winLossMatches) {
      const name = m.opponent_commander_name;
      if (!name) continue;
      const e = agg.get(name) || { name, count: 0, wins: 0, colors: [] };
      e.count++;
      if (m.result === 'win') e.wins++;
      if (m.opponent_commander_id && !e.grp_id) e.grp_id = m.opponent_commander_id;
      // Track the most common opponent color identity (for the color pips).
      if (m.opponent_colors && m.opponent_colors.length > 0) {
        const key = [...m.opponent_colors].sort().join('');
        if (!e._freq) e._freq = new Map<string, number>();
        e._freq.set(key, (e._freq.get(key) || 0) + 1);
      }
      agg.set(name, e);
    }
    let nemesis: { name: string; count: number; winrate: number; grp_id?: number; colors: string[] } | null = null;
    for (const e of agg.values()) {
      if (e.count < 25) continue;
      const wr = (e.wins / e.count) * 100;
      if (!nemesis || wr < nemesis.winrate) {
        let colors: string[] = [];
        if (e._freq) {
          const top = [...e._freq.entries()].sort((a, b) => b[1] - a[1])[0];
          if (top) colors = top[0].split('');
        }
        nemesis = { name: e.name, count: e.count, winrate: wr, grp_id: e.grp_id, colors };
      }
    }

    // Longest streaks.
    const chrono = [...winLossMatches].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    let cur = { type: '', len: 0 };
    let bestWin = { len: 0, date: '' };
    let bestLoss = { len: 0, date: '' };
    for (const m of chrono) {
      if (cur.type === m.result) cur.len++;
      else cur = { type: m.result, len: 1 };
      if (m.result === 'win' && cur.len > bestWin.len) bestWin = { len: cur.len, date: matchDayKey(m) };
      if (m.result === 'loss' && cur.len > bestLoss.len) bestLoss = { len: cur.len, date: matchDayKey(m) };
    }

    // Color affinity across deck library: each deck counts once toward every
    // color present in its color identity (a mono-green deck and a Gruul deck
    // each count as one "green" deck), then pick the most/least common.
    const colorCount: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const d of deckOverview) {
      const cols = (d.colors || []).slice().sort();
      for (const c of cols) if (c in colorCount) colorCount[c]++;
    }
    const favColor = Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0];
    const leastColor = Object.entries(colorCount)
      .filter(([, n]) => n > 0)
      .sort((a, b) => a[1] - b[1])[0];

    // Most played deck.
    let mostPlayed: any = null;
    for (const d of deckOverview) {
      if (!mostPlayed || (d.total_matches || 0) > (mostPlayed.total_matches || 0)) mostPlayed = d;
    }

    // Most-played deck representation: commander for Brawl, else highest-CMC key card.
    let mostPlayedArt: { name: string; grp_id?: number; isCommander: boolean } | null = null;
    if (mostPlayed) {
      const isBrawl = (mostPlayed.formats || []).some((f: any) => String(f.format || '').toLowerCase().includes('brawl'));
      if (isBrawl && mostPlayed.top_commander_name) {
        mostPlayedArt = { name: mostPlayed.top_commander_name, grp_id: mostPlayed.top_commander_grp_id, isCommander: true };
      } else {
        const best = (mostPlayed.key_cards || []).reduce<any | null>(
          (acc, k) => (!acc || (k.cmc || 0) > (acc.cmc || 0) ? k : acc),
          null
        );
        if (best) mostPlayedArt = { name: best.name, grp_id: best.grp_id, isCommander: false };
        else if (mostPlayed.top_card_name) mostPlayedArt = { name: mostPlayed.top_card_name, grp_id: mostPlayed.top_card_grp_id, isCommander: false };
      }
    }

    return {
      totalGames: winLossMatches.length,
      onPlayPct: playTotal > 0 ? (onPlay / playTotal) * 100 : 0,
      onDrawPct: playTotal > 0 ? (onDraw / playTotal) * 100 : 0,
      playWinRate: onPlay > 0 ? (playWins / onPlay) * 100 : 0,
      drawWinRate: onDraw > 0 ? (drawWins / onDraw) * 100 : 0,
      librarySize: deckOverview.length,
      nemesis,
      mostPlayed,
      mostPlayedArt,
      bestWin,
      bestLoss,
      favColor,
      leastColor,
    };
  }, [winLossMatches, deckOverview]);

  const accent = palette?.accent || '#38BDF8';
  const surface = palette?.surface || '#1A1D24';
  const border = palette?.border || '#2A2F3D';
  const text = palette?.text || '#F8FAFC';
  const subtext = palette?.subtext || '#94A3B8';
  const green = palette?.green || '#34D399';
  const red = palette?.red || '#F87171';

  const renderColorPips = (colors: string[], size = 14) => {
    if (!colors || colors.length === 0) return <ManaPip symbol="C" size={size} />;
    return (
      <div className="flex items-center gap-0.5">
        {colors.map((c) => (
          <ManaPip key={c} symbol={c} size={size} />
        ))}
      </div>
    );
  };

  const renderStatCell = (label: string, value: React.ReactNode, icon: React.ReactNode, sub?: React.ReactNode, valueColor?: string) => (
    <div className="p-4 rounded-2xl border shadow-lg flex flex-col justify-between min-w-0" style={{ backgroundColor: surface, borderColor: border }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase font-semibold opacity-60 truncate">{label}</p>
        {icon}
      </div>
      <div className="mt-2 truncate" style={{ color: valueColor || text }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] font-mono opacity-60 truncate">{sub}</div>}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
      {/* Top-center brand: icon (left) + text logo (right), side by side */}
      <div 
        className={`flex flex-col items-center justify-center shrink-0 transition-opacity duration-500 ${
          hideBrandHeader ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex items-center justify-center gap-3">
          <img src={iconSvg} alt="" className="h-[72px] w-auto object-contain drop-shadow-md" />
          <img src={logoSvg} alt="Rhystic Tracker" className="h-[83px] w-auto object-contain drop-shadow-md" />
        </div>
        {isTestEnv && (
          <div className="mt-1 inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono font-bold tracking-wider bg-purple-950/70 border border-purple-500/50 text-purple-300 shadow-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>TEST ENVIRONMENT</span>
            <span className="opacity-40">•</span>
            <span className="opacity-70 text-[10px] lowercase font-normal">rhystic_dev.db</span>
          </div>
        )}
      </div>

      {/* Top row: 4 stat cells */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {renderStatCell(
          "Today's Win Rate",
          <span className="text-3xl font-extrabold font-outfit" style={{ color: winRateColor(stats.todayWinRate.toFixed(1)) }}>
            {stats.todayWinRate.toFixed(1)}%
          </span>,
          <TrendingUp className="w-5 h-5 opacity-40" style={{ color: accent }} />,
          `${stats.todayWins}W - ${stats.todayLosses}L`
        )}
        {renderStatCell(
          'All-Time Win Rate',
          <span className="text-3xl font-extrabold font-outfit" style={{ color: winRateColor(stats.allWinRate.toFixed(1)) }}>
            {stats.allWinRate.toFixed(1)}%
          </span>,
          <Trophy className="w-5 h-5 opacity-40" style={{ color: accent }} />,
          `${stats.allWins}W - ${stats.allLosses}L`
        )}
        {renderStatCell(
          'Matches Today',
          <span className="text-3xl font-extrabold font-outfit" style={{ color: text }}>
            {stats.todayCount}
          </span>,
          <Calendar className="w-5 h-5 opacity-40" style={{ color: accent }} />,
          'games played'
        )}
        {renderStatCell(
          'Current W/L Streak',
          <span className="text-3xl font-extrabold font-outfit" style={{ color: stats.curStreakType === 'win' ? green : stats.curStreakType === 'loss' ? red : subtext }}>
            {stats.curStreak > 0 ? `${stats.curStreak}${stats.curStreakType === 'win' ? 'W' : 'L'}` : '—'}
          </span>,
          <Flame className="w-5 h-5 opacity-40" style={{ color: stats.curStreakType === 'win' ? green : stats.curStreakType === 'loss' ? red : subtext }} />,
          stats.curStreakType === 'win' ? 'winning streak' : stats.curStreakType === 'loss' ? 'losing streak' : 'no result yet'
        )}
      </div>

      {/* Trending Win Rate chart (full width) */}
      <div className="flex-1 min-h-0 rounded-2xl border shadow-lg p-4 flex flex-col" style={{ backgroundColor: surface, borderColor: border }}>
        <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: accent }} />
            <h2 className="font-black font-outfit uppercase tracking-wide text-sm" style={{ color: text }}>
              Trending Win Rate
            </h2>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Format Dropdown Selector */}
            <div className="relative inline-flex items-center">
              <select
                value={chartFormat}
                onChange={(e) => setChartFormat(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all appearance-none pr-8 cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/20"
                style={{
                  backgroundColor: palette?.mantle || '#12141A',
                  borderColor: border,
                  color: '#FFFFFF',
                }}
              >
                {formatOptions.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    style={{ backgroundColor: '#12141A', color: '#FFFFFF' }}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronRight className="w-3.5 h-3.5 rotate-90 absolute right-2.5 pointer-events-none text-white/50" />
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl border" style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: border }}>
              {timeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChartTime(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                    chartTime === opt.value ? 'shadow-sm' : 'opacity-40 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: chartTime === opt.value ? `${accent}25` : 'transparent',
                    color: chartTime === opt.value ? accent : subtext,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 mt-3">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs font-mono opacity-40">No matches in this range</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={extendedChartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <defs>
                  {/* Horizontal left-to-right gradient for the trend line */}
                  <linearGradient id="winRateThresholdGradient" x1="0" y1="0" x2="1" y2="0">
                    {horizontalGradientStops.map((s, idx) => (
                      <stop key={idx} offset={s.offset} stopColor={s.color} stopOpacity={s.lineOpacity} />
                    ))}
                  </linearGradient>

                  {/* Lowest-layer horizontal background area shading underneath the trend line */}
                  <linearGradient id="winRateAreaGradient" x1="0" y1="0" x2="1" y2="0">
                    {horizontalGradientStops.map((s, idx) => (
                      <stop key={idx} offset={s.offset} stopColor={s.color} stopOpacity={s.areaOpacity} />
                    ))}
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={border} strokeOpacity={0.25} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: subtext, fontFamily: 'monospace' }}
                  stroke={border}
                  tickLine={false}
                  interval={chartTime === '7D' || chartTime === '14D' ? 0 : 'preserveStartEnd'}
                  minTickGap={6}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis
                  yAxisId="played"
                  domain={[0, maxPlays]}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: subtext, fontFamily: 'monospace' }}
                  stroke={border}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Played', angle: -90, position: 'insideLeft', style: { fill: subtext, fontSize: 10, fontFamily: 'monospace' } }}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: subtext, fontFamily: 'monospace' }}
                  stroke={border}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: any) => `${v}%`}
                  label={{ value: 'Win Rate', angle: 90, position: 'insideRight', style: { fill: subtext, fontSize: 10, fontFamily: 'monospace' } }}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0]?.payload;
                    if (!data || data.isPad) return null;

                    const total = (data.wins || 0) + (data.losses || 0);
                    const winRate = data.winrate !== null && data.winrate !== undefined ? data.winrate : (total > 0 ? Math.round((data.wins / total) * 1000) / 10 : null);
                    const isWinning = (winRate ?? 0) >= 50;

                    return (
                      <div
                        className="p-3 rounded-xl border shadow-2xl backdrop-blur-md flex flex-col gap-2 min-w-[190px]"
                        style={{
                          backgroundColor: `${palette?.mantle || '#12141A'}FA`,
                          borderColor: border || '#2A2F3D',
                          color: text || '#FFFFFF',
                        }}
                      >
                        <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: `${border || '#2A2F3D'}60` }}>
                          <span className="text-xs font-bold font-outfit text-white">{data.label}</span>
                          <span className="text-[10px] font-mono opacity-50">{data.date.startsWith('hour-') ? '' : data.date}</span>
                        </div>

                        {total > 0 ? (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-mono" style={{ color: subtext }}>Day Win Rate:</span>
                              <span
                                className="text-xs font-bold font-mono px-1.5 py-0.5 rounded border"
                                style={{
                                  backgroundColor: isWinning ? `${green}20` : `${red}20`,
                                  color: isWinning ? green : red,
                                  borderColor: isWinning ? `${green}40` : `${red}40`,
                                }}
                              >
                                {winRate}%
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-mono" style={{ color: subtext }}>Matches:</span>
                              <span className="text-xs font-mono font-bold">
                                <span style={{ color: green }}>{data.wins}W</span>
                                <span className="opacity-40 mx-1">-</span>
                                <span style={{ color: red }}>{data.losses}L</span>
                                <span className="text-[10px] opacity-50 ml-1.5">({total} played)</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-3 py-0.5">
                            <span className="text-[11px] font-mono opacity-60">Activity:</span>
                            <span className="text-xs font-mono opacity-80 italic">0 games played</span>
                          </div>
                        )}

                        {chartTime !== 'TODAY' && data.trend !== undefined && (
                          <div className="flex items-center justify-between gap-3 pt-1.5 border-t" style={{ borderColor: `${border || '#2A2F3D'}40` }}>
                            <span className="text-[11px] font-mono" style={{ color: subtext }}>Trending Avg:</span>
                            <span className="text-xs font-mono font-bold" style={{ color: data.trend >= 50 ? green : red }}>
                              {data.trend}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: subtext }} />

                {/* Layer 1 (Lowest): Subtle area shading underneath the trend line */}
                {chartTime !== 'TODAY' && (
                  <Area 
                    yAxisId="rate" 
                    type="monotone" 
                    dataKey="trend" 
                    fill="url(#winRateAreaGradient)" 
                    stroke="none"
                    isAnimationActive={false}
                    legendType="none"
                    tooltipType="none"
                  />
                )}

                {/* Layer 2: 50% Benchmark Dotted Reference Line */}
                <ReferenceLine yAxisId="rate" y={50} stroke={subtext} strokeDasharray="4 4" strokeOpacity={0.6} />

                {/* Layer 3: Game Histogram Stacked Bars with thin white outline */}
                <Bar 
                  yAxisId="played" 
                  dataKey="wins" 
                  stackId="a" 
                  fill={green} 
                  fillOpacity={0.82} 
                  stroke="rgba(255, 255, 255, 0.4)" 
                  strokeWidth={1} 
                  name="Wins" 
                  isAnimationActive={false} 
                />
                <Bar 
                  yAxisId="played" 
                  dataKey="losses" 
                  stackId="a" 
                  fill={red} 
                  fillOpacity={0.82} 
                  stroke="rgba(255, 255, 255, 0.4)" 
                  strokeWidth={1} 
                  name="Losses" 
                  isAnimationActive={false} 
                />

                {/* Layer 4 (Top): Trending Win Rate Line */}
                {chartTime !== 'TODAY' && (
                  <Line 
                    yAxisId="rate" 
                    type="monotone" 
                    dataKey="trend" 
                    stroke="url(#winRateThresholdGradient)" 
                    strokeWidth={3} 
                    dot={false}
                    isAnimationActive={false}
                    name="Trending Win Rate" 
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 3-column grid */}
      <div className="flex-[2] min-h-0 grid grid-cols-3 gap-4 overflow-hidden">
        {/* Left: Recent Matches */}
        <div className="rounded-2xl border shadow-lg p-4 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: surface, borderColor: border }}>
          <div className="flex items-center gap-2 shrink-0 mb-3">
            <History className="w-4 h-4" style={{ color: accent }} />
            <h2 className="font-black font-outfit uppercase tracking-wide text-sm" style={{ color: text }}>
              Recent Matches
            </h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pr-1">
            {recentGroups.length === 0 ? (
              <div className="text-center text-xs font-mono opacity-40 py-8">No matches yet</div>
            ) : (
              recentGroups.map((group) => (
                <div key={group.label}>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-50 mb-1.5" style={{ color: subtext }}>
                    {group.label}
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((m) => {
                      const won = m.result === 'win';
                      return (
                        <button
                          key={m.match_id}
                          onClick={() => onSelectMatch(m.match_id)}
                          className="w-full flex items-center gap-2 p-2 rounded-xl border transition-all hover:bg-white/5 text-left"
                          style={{ borderColor: `${border}55`, backgroundColor: won ? `${green}0D` : `${red}0D` }}
                        >
                          <span
                            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-black ${
                              won ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                            style={{ backgroundColor: won ? `${green}22` : `${red}22` }}
                          >
                            {won ? 'W' : 'L'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: text }}>
                              {m.opponent_name || 'Unknown Opponent'}
                            </div>
                            <div className="text-[10px] font-mono truncate" style={{ color: subtext }}>
                              {m.format_name?.toLowerCase().includes('brawl') && m.opponent_commander_name
                                ? m.opponent_commander_name
                                : m.player_deck_name}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <span className="text-[10px] font-mono opacity-60">{formatTimeOnly(m.timestamp)}</span>
                            {renderColorPips(m.opponent_colors || [], 11)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Middle: Deck Spotlight */}
        <div className="rounded-2xl border shadow-lg p-4 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: surface, borderColor: border }}>
          <div className="flex items-center gap-2 shrink-0 mb-3">
            <Layers className="w-4 h-4" style={{ color: accent }} />
            <h2 className="font-black font-outfit uppercase tracking-wide text-sm" style={{ color: text }}>
              Deck Spotlight
            </h2>
          </div>

          {!spotlight ? (
            <div className="flex-1 flex items-center justify-center text-xs font-mono opacity-40">
              No deck qualifies yet (need 10+ games & 50%+ win rate)
            </div>
          ) : (
            <button
              ref={spotBtnRef}
              onClick={() => onSelectDeck(spotlight.deck_name)}
              className="flex-1 min-h-0 flex flex-col rounded-xl border transition-all hover:bg-white/5 text-center overflow-hidden p-3"
              style={{ borderColor: `${border}66` }}
            >
              {/* Scaled unit: marquee + 6 key cards, designed at a fixed size and
                  scaled as one block so they stay in perfect lockstep. */}
              <div
                className="w-full flex justify-center shrink-0"
                style={{ height: SPOT_DESIGN_H * spotScale }}
              >
                <div
                  className="relative"
                  style={{ width: SPOT_DESIGN_W * spotScale, height: SPOT_DESIGN_H * spotScale }}
                >
                  <div
                    className="absolute top-0 left-0 flex"
                    style={{
                      width: SPOT_DESIGN_W,
                      height: SPOT_DESIGN_H,
                      gap: SPOT_GAP,
                      transform: `scale(${spotScale})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {spotlightMarquee && (
                      <div
                        className="shrink-0 rounded-xl overflow-hidden border shadow-xl cursor-zoom-in"
                        style={{ width: SPOT_MARQUEE_W, height: SPOT_MARQUEE_H, borderColor: border }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowCard({ name: spotlightMarquee.name, grp_id: spotlightMarquee.grp_id }, spotlightMarquee.isCommander);
                        }}
                      >
                        <img
                          src={scryfallCardUrl(spotlightMarquee.name)}
                          alt={spotlightMarquee.name}
                          className="w-full h-full object-contain transition-all duration-700 hover:scale-105"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      </div>
                    )}

                    {/* 6 key cards stacked to exactly the marquee card's height */}
                    <div
                      className="flex flex-col justify-between"
                      style={{ width: SPOT_KEY_SIDE, height: SPOT_DESIGN_H }}
                    >
                      {spotlightKeyCards.map((k, idx) => (
                        <CardNameTooltip key={k.grp_id ?? k.name} name={k.name}>
                          <div
                            className="rounded-md overflow-hidden border-2 cursor-zoom-in transition-all duration-150 hover:scale-110 hover:brightness-110 hover:ring-2 theme-ring-strong relative"
                            style={{ width: SPOT_KEY_SIDE, height: SPOT_KEY_SIDE, borderColor: '#00000088' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowCard({ name: k.name, grp_id: k.grp_id }, false);
                            }}
                          >
                            <img
                              src={scryfallArtUrl(k.name)}
                              alt={k.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                          </div>
                        </CardNameTooltip>
                      ))}
                      {spotlightKeyCards.length < 6 &&
                        Array.from({ length: 6 - spotlightKeyCards.length }).map((_, i) => (
                          <div key={`empty-${i}`} style={{ width: SPOT_KEY_SIDE, height: SPOT_KEY_SIDE }} />
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info block below the scaled cell (does NOT scale, reflows normally) */}
              <div ref={spotInfoRef} className="mt-3 min-w-0 w-full flex flex-col items-center">
                <div className="text-[22px] font-bold leading-tight text-center break-words w-full" style={{ color: accent }}>
                  {spotlight.deck_name}
                </div>
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  {renderColorPips(spotlight.colors || [], 18)}
                </div>
                {spotlightMarquee?.isCommander && (
                  <div className="text-xs font-mono text-center break-words mt-1 opacity-70 max-w-full" style={{ color: subtext }}>
                    {spotlightMarquee.name}
                  </div>
                )}

                <div className="flex items-center justify-center gap-6 mt-3">
                  <div>
                    <div className="text-2xl font-extrabold font-outfit" style={{ color: winRateColor(spotlight.winrate) }}>
                      {spotlight.winrate}
                    </div>
                    <div className="text-[9px] font-mono uppercase opacity-50" style={{ color: subtext }}>Win Rate</div>
                  </div>
                  <div className="w-px self-stretch" style={{ backgroundColor: `${border}55` }} />
                  <div>
                    <div className="text-2xl font-extrabold font-outfit" style={{ color: text }}>
                      {spotlight.total_matches}
                    </div>
                    <div className="text-[9px] font-mono uppercase opacity-50" style={{ color: subtext }}>Games</div>
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="text-[10px] font-mono opacity-60" style={{ color: subtext }}>
                    Last played {lastPlayedMap.get(spotlight.deck_name) ? formatDateShort(lastPlayedMap.get(spotlight.deck_name)!) : '—'}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: accent }}>
                  View Deck <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Right: Fun Facts */}
        <div className="rounded-2xl border shadow-lg p-4 flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: surface, borderColor: border }}>
          <div className="flex items-center gap-2 shrink-0 mb-3">
            <Target className="w-4 h-4" style={{ color: accent }} />
            <h2 className="font-black font-outfit uppercase tracking-wide text-sm" style={{ color: text }}>
              Fun Facts
            </h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
            {/* Games Played + Library Size (combined, split in half) */}
            <div className="rounded-xl border p-3 grid grid-cols-2 divide-x" style={{ borderColor: `${border}55` }}>
              <div className="flex items-center justify-center gap-3 px-2">
                <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14` }}>
                  <Gamepad2 className="w-4.5 h-4.5" style={{ color: accent }} />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Games Played</div>
                  <div className="text-3xl font-extrabold font-outfit" style={{ color: text }}>{funFacts.totalGames}</div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 px-2" style={{ borderColor: `${border}44` }}>
                <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14` }}>
                  <Library className="w-4.5 h-4.5" style={{ color: accent }} />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Library Size</div>
                  <div className="text-3xl font-extrabold font-outfit" style={{ color: text }}>{funFacts.librarySize}</div>
                </div>
              </div>
            </div>

            {/* Game Priority */}
            <div className="rounded-xl border p-3" style={{ borderColor: `${border}55` }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14` }}>
                  <Activity className="w-3 h-3" style={{ color: accent }} />
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Game Priority</div>
              </div>
              {/* Continuum: on-play (left, always blue) vs on-draw (right, always orange) */}
              <div className="mt-2.5">
                <div className="flex h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: `${border}44` }}>
                  <div className="h-full" style={{ width: `${funFacts.onPlayPct}%`, backgroundColor: '#38BDF8' }} />
                  <div className="h-full flex-1" style={{ backgroundColor: '#F97316' }} />
                </div>
                <div className="flex items-center justify-between mt-1 text-[10px] font-mono" style={{ color: subtext }}>
                  <span>On Play {funFacts.onPlayPct.toFixed(0)}%</span>
                  <span>On Draw {funFacts.onDrawPct.toFixed(0)}%</span>
                </div>
              </div>
              {/* Win rates: flat green >50%, red <50% */}
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span style={{ color: subtext }} className="w-14 shrink-0">Play WR</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${border}44` }}>
                    <div className="h-full" style={{ width: `${funFacts.playWinRate}%`, backgroundColor: flatWinRateColor(funFacts.playWinRate) }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-bold" style={{ color: flatWinRateColor(funFacts.playWinRate) }}>
                    {funFacts.playWinRate.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span style={{ color: subtext }} className="w-14 shrink-0">Draw WR</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${border}44` }}>
                    <div className="h-full" style={{ width: `${funFacts.drawWinRate}%`, backgroundColor: flatWinRateColor(funFacts.drawWinRate) }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-bold" style={{ color: flatWinRateColor(funFacts.drawWinRate) }}>
                    {funFacts.drawWinRate.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Arch Nemesis */}
            <div className="rounded-xl border p-3" style={{ borderColor: `${border}55` }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${red}14` }}>
                  <Crosshair className="w-3 h-3" style={{ color: red }} />
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Arch Nemesis</div>
              </div>
              {funFacts.nemesis ? (
                <div className="flex items-stretch gap-3 mt-2">
                  <CardNameTooltip name={funFacts.nemesis.name} position="bottom">
                    <div
                      className="w-14 shrink-0 rounded-lg overflow-hidden border cursor-zoom-in"
                      style={{ borderColor: `${border}66` }}
                      onClick={() => onShowCard({ name: funFacts.nemesis!.name, grp_id: funFacts.nemesis!.grp_id }, true)}
                    >
                      <img
                        src={scryfallArtUrl(funFacts.nemesis.name)}
                        alt={funFacts.nemesis.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    </div>
                  </CardNameTooltip>
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold leading-tight truncate" style={{ color: text }}>{funFacts.nemesis.name}</span>
                      {renderColorPips(funFacts.nemesis.colors || [], 14)}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[12px] font-mono" style={{ color: subtext }}>
                      <span style={{ color: winRateColor(funFacts.nemesis.winrate.toFixed(1)) }}>
                        {funFacts.nemesis.winrate.toFixed(1)}% WR
                      </span>
                      <span>• faced {funFacts.nemesis.count} times</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs font-mono opacity-40 mt-1">No opponent commander with 25+ games yet</div>
              )}
            </div>

            {/* Most Played Deck */}
            {funFacts.mostPlayed && (
              <button
                onClick={() => onSelectDeck(funFacts.mostPlayed.deck_name)}
                className="w-full rounded-xl border p-3 text-left transition-all hover:bg-white/5"
                style={{ borderColor: `${border}55` }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14` }}>
                    <Trophy className="w-3 h-3" style={{ color: accent }} />
                  </div>
                  <div className="text-[9px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Most Played Deck</div>
                </div>
                <div className="flex items-stretch gap-3 mt-2">
                  {funFacts.mostPlayedArt && (
                    <CardNameTooltip name={funFacts.mostPlayedArt.name} position="bottom">
                      <div
                        className="w-14 shrink-0 rounded-lg overflow-hidden border cursor-zoom-in"
                        style={{ borderColor: `${border}66` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowCard({ name: funFacts.mostPlayedArt!.name, grp_id: funFacts.mostPlayedArt!.grp_id }, funFacts.mostPlayedArt!.isCommander);
                        }}
                      >
                        <img
                          src={scryfallArtUrl(funFacts.mostPlayedArt.name)}
                          alt={funFacts.mostPlayedArt.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      </div>
                    </CardNameTooltip>
                  )}
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold leading-tight truncate" style={{ color: accent }}>{funFacts.mostPlayed.deck_name}</span>
                      {renderColorPips(funFacts.mostPlayed.colors || [], 14)}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[12px] font-mono" style={{ color: subtext }}>
                      <span style={{ color: winRateColor(funFacts.mostPlayed.winrate) }}>{funFacts.mostPlayed.winrate}</span>
                      <span>• {funFacts.mostPlayed.total_matches} games played</span>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Library Insights */}
            <div className="rounded-xl border p-3" style={{ borderColor: `${border}55` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}14` }}>
                  <Palette className="w-3 h-3" style={{ color: accent }} />
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Library Insights</div>
              </div>
              <div className="space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ backgroundColor: `${accent}0D`, color: subtext }}>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" style={{ color: green }} /> Favorite deck color
                  </span>
                  <span className="flex items-center gap-1.5 font-bold" style={{ color: text }}>
                    {funFacts.favColor?.[1] || 0}
                    {funFacts.favColor && <ManaPip symbol={funFacts.favColor[0]} size={14} />}
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ backgroundColor: `${red}0D`, color: subtext }}>
                  <span className="flex items-center gap-1.5">
                    <XCircle className="w-3 h-3" style={{ color: red }} /> Least favorite deck color
                  </span>
                  <span className="flex items-center gap-1.5 font-bold" style={{ color: text }}>
                    {funFacts.leastColor?.[1] || 0}
                    {funFacts.leastColor && <ManaPip symbol={funFacts.leastColor[0]} size={14} />}
                  </span>
                </div>
              </div>
            </div>

            {/* Longest Streaks */}
            <div className="rounded-xl border p-3" style={{ borderColor: `${border}55` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${green}14` }}>
                  <Flame className="w-3 h-3" style={{ color: green }} />
                </div>
                <div className="text-[9px] font-mono uppercase tracking-wider opacity-50" style={{ color: subtext }}>Longest Streaks</div>
              </div>
              <div className="space-y-1.5 text-[11px] font-mono" style={{ color: subtext }}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2" style={{ color: green }}>
                    <Flame className="w-4 h-4" /> Win streak
                  </span>
                  <span className="font-bold" style={{ color: text }}>
                    {funFacts.bestWin.len > 0 ? `${funFacts.bestWin.len} games` : '—'}
                    {funFacts.bestWin.len > 0 && funFacts.bestWin.date ? ` • ${funFacts.bestWin.date}` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2" style={{ color: red }}>
                    <Swords className="w-4 h-4" /> Loss streak
                  </span>
                  <span className="font-bold" style={{ color: text }}>
                    {funFacts.bestLoss.len > 0 ? `${funFacts.bestLoss.len} games` : '—'}
                    {funFacts.bestLoss.len > 0 && funFacts.bestLoss.date ? ` • ${funFacts.bestLoss.date}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] font-mono opacity-50" style={{ color: subtext }}>
              <Activity className="w-3 h-3" />
              {stats.allCount} tracked matches across {funFacts.librarySize} decks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
