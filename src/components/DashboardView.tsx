import React, { useMemo, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
} from 'recharts';
import { ChevronRight, X } from 'lucide-react';
import { ManaPip } from './ManaPip';
import { CardNameTooltip } from './CardNameTooltip';
import { AchievementBadge } from './AchievementBadge';
import { getAchievementMeta } from '../utils/achievementBadges';
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

const scryfallArtUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

const scryfallCardUrl = (name: string) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;

const localDateKey = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

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

const formatTimeAgo = (ts: string): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
};

const formatEarnedDate = (ts?: string): string => {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  matches,
  deckOverview,
  palette,
  formatOptions = [],
  onSelectMatch,
  onSelectDeck,
  onShowCard,
  hideBrandHeader = false,
  isTestEnv = false,
}) => {
  const [chartFormat, setChartFormat] = useState('ALL');
  const [chartTime, setChartTime] = useState('14D');
  const [rawAchievements, setRawAchievements] = useState<any[]>([]);
  const [recentAchievements, setRecentAchievements] = useState<any[]>([]);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [featuredLeaderboard, setFeaturedLeaderboard] = useState<any>(null);

  const todayKey = useMemo(() => localDateKey(new Date()), []);

  const winLossMatches = useMemo(
    () => matches.filter((m) => m.result === 'win' || m.result === 'loss'),
    [matches]
  );

  // Escape key listener for achievement drilldown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAchievement(null);
    };
    if (selectedAchievement) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedAchievement]);

  // ---- Fetch Global Achievements for Highlights & Drilldown ----
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: any = await invoke('get_global_achievements');
        if (!isMounted || !res?.achievements) return;
        setRawAchievements(res.achievements);
        const allEarnedCards: any[] = [];
        for (const ach of res.achievements) {
          for (const card of ach.cards || []) {
            allEarnedCards.push({
              achievement: ach.achievement,
              tier: card.highest_tier || ach.highest_tier || 'bronze',
              cardName: card.card_name,
              grpId: card.grp_id,
              count: card.count,
              earnedAt: card.earned_at || '',
              rawAch: ach,
            });
          }
        }
        allEarnedCards.sort((a, b) => (b.earnedAt || '').localeCompare(a.earnedAt || ''));
        setRecentAchievements(allEarnedCards.slice(0, 3));
      } catch (err) {
        console.error('Failed to load achievements in dashboard:', err);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // ---- Fetch Global Leaderboards for Featured Leaderboard ----
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res: any = await invoke('get_global_leaderboards');
        if (!isMounted || !res) return;
        const categories = [
          { key: 'combat_single_hit', title: 'Highest Single-Hit Strike', description: 'Most combat damage dealt in a single swing', unit: 'dmg' },
          { key: 'combat_match_damage', title: 'Match Combat Record', description: 'Most combat damage dealt in a single game', unit: 'dmg' },
          { key: 'combat_lifetime_damage', title: 'Lifetime Combat Dominance', description: 'Cumulative combat damage across all matches', unit: 'dmg' },
          { key: 'spell_single_hit', title: 'Highest Single Cast / Hit', description: 'Most non-combat / spell damage in a single cast', unit: 'dmg' },
          { key: 'spell_match_damage', title: 'Match Spell Record', description: 'Most non-combat / spell damage in a single game', unit: 'dmg' },
        ];
        const validCats = categories.filter((c) => (res[c.key] || []).length > 0);
        if (validCats.length > 0) {
          const picked = validCats[Math.floor(Math.random() * validCats.length)];
          setFeaturedLeaderboard({
            title: picked.title,
            description: picked.description,
            unit: picked.unit,
            items: (res[picked.key] || []).slice(0, 5),
          });
        }
      } catch (err) {
        console.error('Failed to load leaderboards in dashboard:', err);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // ---- Statistics Calculation ----
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

  // ---- Trending Win Rate Chart Data (Bucketing for TODAY, 7D, 14D, 30D, YEAR, ALL) ----
  const chartData = useMemo(() => {
    const now = new Date();
    const start7D = new Date(now.getTime() - 7 * 86400000);
    const start14D = new Date(now.getTime() - 14 * 86400000);
    const start30D = new Date(now.getTime() - 30 * 86400000);
    const startYear = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    if (chartTime === 'TODAY') {
      const hourly = new Map<number, { wins: number; losses: number }>();
      let minHour = 23;
      let maxHour = 0;
      let hasMatches = false;

      for (const m of winLossMatches) {
        if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) continue;
        if (matchDayKey(m) !== todayKey) continue;
        const d = new Date(m.timestamp);
        const h = d.getHours();
        minHour = Math.min(minHour, h);
        maxHour = Math.max(maxHour, h);
        hasMatches = true;
        const e = hourly.get(h) || { wins: 0, losses: 0 };
        if (m.result === 'win') e.wins++;
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
        const label = `${String(h).padStart(2, '0')}:00`;
        const total = e.wins + e.losses;
        const winRate = total > 0 ? Math.round((e.wins / total) * 1000) / 10 : null;
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

    if (chartTime === 'YEAR') {
      const monthly = new Map<string, { wins: number; losses: number; label: string; time: number }>();
      for (const m of winLossMatches) {
        if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) continue;
        const d = new Date(m.timestamp);
        if (d < startYear) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${months[d.getMonth()]}`;
        const e = monthly.get(key) || { wins: 0, losses: 0, label, time: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
        if (m.result === 'win') e.wins++;
        else e.losses++;
        monthly.set(key, e);
      }

      const monthsArr = [...monthly.entries()].sort((a, b) => a[1].time - b[1].time);
      let lastKnownTrend = stats.allWinRate || 50.0;
      return monthsArr.map(([date, { wins, losses, label }], idx) => {
        const total = wins + losses;
        const windowStart = Math.max(0, idx - 2);
        let windowWins = 0;
        let windowTotal = 0;
        for (let j = windowStart; j <= idx; j++) {
          const e = monthsArr[j][1];
          windowWins += e.wins;
          windowTotal += (e.wins + e.losses);
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

    if (chartTime === 'ALL') {
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
      let lastKnownTrend = stats.allWinRate || 50.0;
      return monthsArr.map(([date, { wins, losses, label }], idx) => {
        const total = wins + losses;
        const windowStart = Math.max(0, idx - 3);
        let windowWins = 0;
        let windowTotal = 0;
        for (let j = windowStart; j <= idx; j++) {
          const e = monthsArr[j][1];
          windowWins += e.wins;
          windowTotal += (e.wins + e.losses);
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
    let lastKnownTrend = stats.allWinRate || 50.0;
    const priorMatches = winLossMatches.filter((m) => {
      if (chartFormat !== 'ALL' && m.format_name.toUpperCase() !== chartFormat) return false;
      const d = new Date(m.timestamp);
      return d < (chartTime === '7D' ? start7D : chartTime === '14D' ? start14D : start30D);
    });
    if (priorMatches.length > 0) {
      const pWins = priorMatches.filter((m) => m.result === 'win').length;
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
        total,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null,
        trend: Math.round(lastKnownTrend * 10) / 10,
      };
    });
  }, [winLossMatches, chartTime, chartFormat, todayKey, stats.allWinRate, stats.todayWinRate]);

  const maxPlays = useMemo(() => {
    const busiest = chartData.reduce((max, r) => Math.max(max, r.total), 0);
    return Math.max(Math.ceil(busiest * 1.25), 4);
  }, [chartData]);

  const getDeckArt = (deckName: string, commanderName?: string) => {
    if (commanderName) return commanderName;
    const d = deckOverview.find((item) => item.deck_name === deckName);
    if (d) {
      if (d.top_commander_name) return d.top_commander_name;
      if (d.key_cards && d.key_cards.length > 0) return d.key_cards[0].name;
      if (d.top_card_name) return d.top_card_name;
    }
    return null;
  };

  // ---- Recent Matches ----
  const recentMatches = useMemo(() => {
    return [...winLossMatches]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 16);
  }, [winLossMatches]);

  // ---- Format Breakdown ----
  const formatBreakdown = useMemo(() => {
    const map = new Map<string, { format: string; wins: number; losses: number; total: number }>();
    for (const m of winLossMatches) {
      const f = m.format_name || 'Other';
      const e = map.get(f) || { format: f, wins: 0, losses: 0, total: 0 };
      e.total++;
      if (m.result === 'win') e.wins++;
      else e.losses++;
      map.set(f, e);
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [winLossMatches]);

  // Map deck names to their key cards for recent matches portraits
  const deckKeyCardsMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; grp_id?: number }>>();
    for (const d of deckOverview) {
      if (d.deck_name && d.key_cards) {
        map.set(d.deck_name, d.key_cards);
      }
    }
    return map;
  }, [deckOverview]);

  // ---- Deck Spotlight ----
  const eligibleDecks = useMemo(
    () =>
      deckOverview.filter(
        (d) => (d.total_matches || 0) >= 10 && (parseFloat(d.winrate) || 0) >= 50
      ),
    [deckOverview]
  );

  const spotlight = useMemo(() => {
    if (eligibleDecks.length > 0) {
      const idx = Math.floor(Date.now() / (5 * 60 * 1000)) % eligibleDecks.length;
      return eligibleDecks[idx];
    }
    return deckOverview[0] || null;
  }, [eligibleDecks, deckOverview]);

  const spotlightIsBrawl = useMemo(
    () =>
      (spotlight?.formats || []).some((f: any) =>
        String(f.format || '').toLowerCase().includes('brawl')
      ),
    [spotlight]
  );

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

  const spotlightKeyCards = useMemo(() => {
    if (!spotlight) return [];
    const BASIC_LANDS = new Set([
      'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
      'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
      'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes'
    ]);
    const rawKeys: any[] = spotlight.key_cards || [];
    const nonLandKeys = rawKeys.filter((k) => !BASIC_LANDS.has(k.name));

    const cardsList: any[] = spotlight.cards || spotlight.main_deck || [];
    const addedNames = new Set(nonLandKeys.map((k) => k.name));
    if (spotlightMarquee) addedNames.add(spotlightMarquee.name);

    const extraCards = cardsList.filter((c) => !BASIC_LANDS.has(c.name) && !addedNames.has(c.name));
    return [...nonLandKeys, ...extraCards].slice(0, 8);
  }, [spotlight, spotlightMarquee]);

  // ---- Fun Facts ----
  const funFacts = useMemo(() => {
    const onPlay = winLossMatches.filter((m) => m.going_first === true).length;
    const onDraw = winLossMatches.filter((m) => m.going_first === false).length;
    const playTotal = onPlay + onDraw;
    const playWins = winLossMatches.filter((m) => m.going_first === true && m.result === 'win').length;
    const drawWins = winLossMatches.filter((m) => m.going_first === false && m.result === 'win').length;

    // Arch nemesis: worst win rate opponent commander, min 25 games
    const agg = new Map<string, { name: string; count: number; wins: number; grp_id?: number; colors: string[]; _freq?: Map<string, number> }>();
    for (const m of winLossMatches) {
      const name = m.opponent_commander_name;
      if (!name) continue;
      const e = agg.get(name) || { name, count: 0, wins: 0, colors: [] };
      e.count++;
      if (m.result === 'win') e.wins++;
      if (m.opponent_commander_id && !e.grp_id) e.grp_id = m.opponent_commander_id;
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

    // Longest streaks
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

    // Most played deck
    let mostPlayed: any = null;
    for (const d of deckOverview) {
      if (!mostPlayed || (d.total_matches || 0) > (mostPlayed.total_matches || 0)) mostPlayed = d;
    }
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

    // Match color affinity across games played
    const matchColorCount: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    for (const m of winLossMatches) {
      const cols = (m.deck_colors || []).slice();
      for (const c of cols) if (c in matchColorCount) matchColorCount[c]++;
    }
    const favColorMatch = Object.entries(matchColorCount).sort((a, b) => b[1] - a[1])[0];
    const leastColorMatch = Object.entries(matchColorCount)
      .filter(([, n]) => n > 0)
      .sort((a, b) => a[1] - b[1])[0] || Object.entries(matchColorCount).sort((a, b) => a[1] - b[1])[0];

    // Average match duration, turns, fastest organic win, and longest game
    let totalSec = 0;
    let totalTurns = 0;
    let validDurations = 0;
    let fastestOrganicWin: { turns: number; duration: number } | null = null;
    let longestGame: { turns: number; duration: number } | null = null;

    const isConceded = (m: MatchRecord) => {
      const r = (m.result_reason || '').toLowerCase();
      return r.includes('conced') || r.includes('surrender') || r.includes('quit');
    };

    for (const m of winLossMatches) {
      if (m.duration_seconds > 0) {
        totalSec += m.duration_seconds;
        validDurations++;
      }
      if (m.turns > 0) {
        totalTurns += m.turns;
      }

      // Fastest organic victory: must be win, turns > 0, and not ended by concession
      if (m.result === 'win' && m.turns > 0 && !isConceded(m)) {
        if (!fastestOrganicWin || m.turns < fastestOrganicWin.turns || (m.turns === fastestOrganicWin.turns && m.duration_seconds < fastestOrganicWin.duration)) {
          fastestOrganicWin = { turns: m.turns, duration: m.duration_seconds };
        }
      }

      // Longest game (no filter on concede)
      if (m.turns > 0 || m.duration_seconds > 0) {
        if (!longestGame || m.turns > longestGame.turns || (m.turns === longestGame.turns && m.duration_seconds > longestGame.duration)) {
          longestGame = { turns: m.turns, duration: m.duration_seconds };
        }
      }
    }

    const avgTurns = winLossMatches.length > 0 ? totalTurns / winLossMatches.length : 0;
    const avgSec = validDurations > 0 ? totalSec / validDurations : 0;

    return {
      totalGames: winLossMatches.length,
      onPlay,
      onDraw,
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
      favColorMatch,
      leastColorMatch,
      avgTurns,
      avgSec,
      fastestOrganicWin,
      longestGame,
    };
  }, [winLossMatches, deckOverview]);

  const accentColor = palette?.accent || '#A855F7';

  // Win bars = pure theme color, Loss bars = very dark desaturated theme color
  const winBarColor = accentColor;
  const lossBarColor = `${accentColor}28`;

  const renderColorPips = (colors: string[], size = 12) => {
    if (!colors || colors.length === 0) return null;
    return (
      <div className="flex items-center gap-0.5">
        {colors.map((c) => (
          <ManaPip key={c} symbol={c} size={size} />
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar px-8 py-4">
      {/* 0. BRAND LOGO + TEST ENVIRONMENT BADGE */}
      <div
        className={`flex flex-col items-center justify-center shrink-0 transition-opacity duration-500 pt-1 pb-2 ${
          hideBrandHeader ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex items-center justify-center gap-3">
          <img src={iconSvg} alt="" className="h-[48px] w-auto object-contain drop-shadow-md" />
          <img src={logoSvg} alt="Rhystic Tracker" className="h-[56px] w-auto object-contain drop-shadow-md" />
        </div>
        {isTestEnv && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded text-xs font-mono font-bold tracking-wider bg-purple-950/70 border border-purple-500/50 text-purple-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>TEST ENVIRONMENT</span>
            <span className="opacity-40">•</span>
            <span className="opacity-70 text-[10px] lowercase font-normal">rhystic_dev.db</span>
          </div>
        )}
      </div>

      {/* TWO-COLUMN ASYMMETRIC MAIN WORKSPACE */}
      <div className="flex-1 min-h-0 flex flex-row gap-8">
        {/* ========================================================================= */}
        {/* LEFT COLUMN (~60%): ALL-TIME HERO + TODAY SPLIT, TRENDING GRAPH, RECENT   */}
        {/* ========================================================================= */}
        <div className="flex-[1.45] min-w-0 flex flex-col justify-between space-y-6 pr-2">
          {/* 1. TOP STAT ROW: ALL-TIME (LEFT) + TODAY INFO (RIGHT JUSTIFIED) */}
          <div className="flex items-end justify-between gap-6 pb-2 border-b border-white/10">
            {/* Left: All-Time Win Rate */}
            <div>
              <div className="text-[11px] font-sans font-medium tracking-[0.18em] uppercase text-neutral-400 opacity-70">
                ALL-TIME WIN RATE
              </div>
              <div className="text-[64px] font-display font-bold text-white tracking-tight leading-none my-1 tabular-nums">
                {stats.allWinRate.toFixed(1)}%
              </div>
              <div className="text-xs font-sans text-neutral-400 opacity-70 font-normal">
                {stats.allWins} wins <span className="opacity-40">/</span> {stats.allLosses} losses <span className="opacity-40">/</span> {stats.allCount} games
              </div>
            </div>

            {/* Right: TODAY (Exact 3-row layout matching left column) */}
            <div className="flex flex-col items-end text-right">
              <div className="text-[11px] font-sans font-medium tracking-[0.18em] uppercase text-neutral-400 opacity-70">
                TODAY
              </div>
              <div className="text-[64px] font-display font-bold text-white tracking-tight leading-none my-1 tabular-nums">
                {stats.todayWinRate.toFixed(1)}%
              </div>
              <div className="text-xs font-sans text-neutral-400 opacity-70 font-normal tabular-nums flex items-center justify-end gap-1.5">
                <span>{stats.todayCount} matches</span>
                <span className="opacity-40">-</span>
                <span>{stats.todayWins} win / {stats.todayLosses} loss</span>
                <span className="opacity-40">-</span>
                <span>
                  Streak {stats.curStreak > 0 ? (
                    <span
                      className="font-semibold"
                      style={{ color: stats.curStreakType === 'win' ? accentColor : '#71717A' }}
                    >
                      {stats.curStreakType === 'win' ? 'W' : 'L'}{stats.curStreak}
                    </span>
                  ) : (
                    '0'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* 2. TRENDING WIN RATE (No line under heading, expanded filters, subtle legends/axes) */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
              <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                TRENDING WIN RATE
              </h2>
              <div className="flex items-center gap-3">
                {/* Format Filter */}
                {formatOptions.length > 0 && (
                  <div className="relative inline-flex items-center">
                    <select
                      value={chartFormat}
                      onChange={(e) => setChartFormat(e.target.value)}
                      className="text-[11px] font-sans bg-transparent border-0 text-neutral-400 hover:text-white cursor-pointer pr-4 appearance-none focus:outline-none"
                    >
                      {formatOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-neutral-900 text-white">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="w-2.5 h-2.5 rotate-90 absolute right-0 pointer-events-none text-neutral-500" />
                  </div>
                )}

                {/* Extended Time Filters: Today, 7D, 14D, 30D, Year, All */}
                <div className="flex items-center gap-2.5">
                  {[
                    { id: 'TODAY', label: 'Today' },
                    { id: '7D', label: '7D' },
                    { id: '14D', label: '14D' },
                    { id: '30D', label: '30D' },
                    { id: 'YEAR', label: 'Year' },
                    { id: 'ALL', label: 'All' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setChartTime(t.id)}
                      className={`text-[11px] font-sans transition-colors cursor-pointer ${
                        chartTime === t.id
                          ? 'text-white font-semibold underline underline-offset-4'
                          : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tall headline chart (320px) with subtle axes and bright white legend */}
            <div className="h-[320px] w-full pt-3 pb-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="label"
                    axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                    tickLine={false}
                    tick={{ fill: 'rgba(255, 255, 255, 0.35)', fontSize: 10, fontFamily: 'monospace' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="played"
                    orientation="left"
                    domain={[0, maxPlays]}
                    axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                    tickLine={false}
                    tick={{ fill: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'monospace' }}
                    width={22}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    domain={[0, 100]}
                    ticks={[0, 50, 100]}
                    tickFormatter={(v) => `${v}%`}
                    axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                    tickLine={false}
                    tick={{ fill: 'rgba(255, 255, 255, 0.3)', fontSize: 10, fontFamily: 'monospace' }}
                    width={32}
                  />

                  {/* 50% Benchmark line (neutral dashed) */}
                  <ReferenceLine yAxisId="rate" y={50} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />

                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="px-3 py-2 bg-neutral-900/95 border border-white/20 text-xs font-sans text-white shadow-2xl backdrop-blur-md">
                            <div className="font-semibold text-neutral-200">{d.label}</div>
                            <div className="mt-1">
                              Trending WR: <span className="font-semibold text-white">{d.trend}%</span>
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

                  {/* Readable Legend with pure white labels */}
                  <Legend
                    verticalAlign="bottom"
                    height={22}
                    formatter={(value) => <span className="text-white font-sans text-[11px] font-semibold tracking-wide">{value}</span>}
                    wrapperStyle={{ paddingTop: 6, fontSize: 11, fontFamily: 'sans-serif' }}
                  />

                  {/* Layer 1: Histogram Volume Bars (Theme win / dark desaturated theme loss) */}
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

                  {/* Layer 2: Headline Trend Line (Theme accent color) */}
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
            <div className="border-b border-white/10" />
          </div>

          {/* 3. RECENT MATCHES (Fight Matchup X vs Y, Impactful Card Mini Portraits, Aligned Outcome) */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="pb-1.5 border-b border-white/10">
              <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                RECENT MATCHES
              </h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar divide-y divide-white/5 pr-1">
              {recentMatches.length === 0 ? (
                <div className="py-6 text-sm font-sans italic text-neutral-500">No matches recorded yet.</div>
              ) : (
                recentMatches.slice(0, 10).map((m) => {
                  const isWin = m.result === 'win';
                  const deckArt = getDeckArt(m.player_deck_name, m.player_commander_name);
                  const keyCards = (deckKeyCardsMap.get(m.player_deck_name) || []).slice(0, 3);
                  return (
                    <div
                      key={m.match_id}
                      onClick={() => onSelectMatch(m.match_id)}
                      className="py-2 px-1.5 flex items-center justify-between gap-4 cursor-pointer group hover:bg-white/[0.03] transition-colors"
                    >
                      {/* Left: Glowing dot + Card art + Fight Matchup + Format badge */}
                      <div className="flex items-center gap-3 min-w-0 flex-1 pl-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isWin ? accentColor : '#52525B',
                            boxShadow: isWin ? `0 0 8px ${accentColor}cc` : 'none',
                          }}
                        />
                        {deckArt && (
                          <div className="w-7 h-7 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900">
                            <img
                              src={deckArt}
                              alt={m.player_deck_name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2 truncate text-[15px] min-w-0">
                          <span className="font-semibold text-neutral-100 group-hover:text-white truncate">
                            {m.player_deck_name}
                          </span>
                          <span className="text-amber-400/80 font-mono text-xs uppercase px-0.5 shrink-0">
                            vs
                          </span>
                          <span
                            className="font-semibold truncate"
                            style={{ color: accentColor }}
                          >
                            {m.opponent_name || 'Opponent'}
                          </span>
                        </div>
                        {m.format_name && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400/80 bg-white/[0.03] px-1.5 py-0.5 border border-white/5 shrink-0">
                            {m.format_name}
                          </span>
                        )}
                      </div>

                      {/* Middle-Right: 3 Mini Impactful Card Portraits from the match deck */}
                      {keyCards.length > 0 && (
                        <div className="hidden lg:flex items-center gap-1 shrink-0 px-2">
                          {keyCards.map((k) => (
                            <CardNameTooltip key={k.grp_id ?? k.name} name={k.name}>
                              <div
                                className="w-6 h-6 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900 cursor-zoom-in hover:scale-125 transition-transform"
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
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.visibility = 'hidden';
                                  }}
                                />
                              </div>
                            </CardNameTooltip>
                          ))}
                        </div>
                      )}

                      {/* Right: Fixed-width columns for rock-solid vertical alignment */}
                      <div className="shrink-0 flex items-center justify-end gap-2 text-right tabular-nums">
                        <span
                          className="w-12 text-left font-semibold text-[13px] tracking-wider"
                          style={{ color: isWin ? accentColor : '#71717A' }}
                        >
                          {isWin ? 'WIN' : 'LOSS'}
                        </span>
                        <span className="opacity-30">·</span>
                        <span className="w-8 text-right text-xs text-neutral-400 opacity-80">
                          {formatTimeAgo(m.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 4. FORMAT BREAKDOWN (3 Columns, up to 6 Formats) */}
          {formatBreakdown.length > 0 && (
            <div className="flex flex-col pt-4 pb-2 border-t border-white/10 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                  FORMAT BREAKDOWN
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-0.5">
                {formatBreakdown.slice(0, 6).map((f) => {
                  const wr = f.total > 0 ? Math.round((f.wins / f.total) * 100) : 0;
                  return (
                    <div key={f.format} className="flex items-center justify-between text-xs font-sans py-2.5 px-3 bg-white/[0.02] border border-white/10">
                      <span className="text-neutral-200 font-medium truncate mr-2">{f.format}</span>
                      <span className="tabular-nums text-neutral-400 shrink-0">
                        {f.total} {f.total === 1 ? 'game' : 'games'} <span className="opacity-40">-</span> WR: <span className="font-semibold text-white">{wr}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* VERTICAL DIVIDER                                                          */}
        {/* ========================================================================= */}
        <div className="w-px self-stretch bg-white/10 shrink-0" />

        {/* ========================================================================= */}
        {/* RIGHT COLUMN (~40% DYNAMIC): DECK SPOTLIGHT, FUN FACTS, ACHIEVEMENTS...   */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-[420px] max-w-[620px] flex flex-col space-y-7 pl-2">
          {/* 1. DECK SPOTLIGHT (Feature Card perfectly matching 2x3 Notable Cards height) */}
          <div className="flex flex-col">
            <div className="pb-1.5 border-b border-white/10">
              <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                DECK SPOTLIGHT
              </h2>
            </div>
            {spotlight ? (
              <div className="pt-3.5">
                <div className="flex gap-4 items-start">
                  {spotlightMarquee && (
                    <div
                      className="w-[184px] h-[257px] shrink-0 overflow-hidden cursor-zoom-in group shadow-2xl transition-transform hover:scale-105 border border-white/10 bg-neutral-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowCard({ name: spotlightMarquee.name, grp_id: spotlightMarquee.grp_id }, spotlightMarquee.isCommander);
                      }}
                    >
                      <img
                        src={scryfallCardUrl(spotlightMarquee.name)}
                        alt={spotlightMarquee.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                      />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
                    <div>
                      <div
                        onClick={() => onSelectDeck(spotlight.deck_name)}
                        className="text-[26px] font-display font-bold text-white truncate leading-tight cursor-pointer hover:underline"
                        title={spotlight.deck_name}
                      >
                        {spotlight.deck_name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {renderColorPips(spotlight.colors || [], 12)}
                        {spotlightMarquee?.isCommander && (
                          <span className="text-xs font-sans text-neutral-400 truncate opacity-80">
                            {spotlightMarquee.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-sans text-neutral-300 mt-1.5 tabular-nums">
                        {spotlight.total_matches} games <span className="opacity-40">·</span> <span className="font-semibold text-white">{String(spotlight.winrate || '').replace(/%/g, '')}% WR</span>
                      </div>
                    </div>

                    {/* Notable Cards In Deck: 2 rows of 4 compact cards (8 total) */}
                    {spotlightKeyCards.length > 0 && (
                      <div className="mt-2.5">
                        <div className="text-[10px] font-sans uppercase tracking-wider text-neutral-400 mb-1.5 opacity-80 font-medium">
                          NOTABLE CARDS IN DECK
                        </div>
                        <div className="grid grid-cols-4 gap-2 w-fit">
                          {spotlightKeyCards.slice(0, 8).map((k) => (
                            <div key={k.grp_id ?? k.name} className="w-[50px] h-[70px] shrink-0">
                              <CardNameTooltip name={k.name}>
                                <div
                                  className="w-[50px] h-[70px] overflow-hidden border border-white/15 cursor-zoom-in hover:scale-105 transition-transform shadow-md bg-neutral-900"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onShowCard({ name: k.name, grp_id: k.grp_id }, false);
                                  }}
                                >
                                  <img
                                    src={scryfallCardUrl(k.name)}
                                    alt={k.name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = scryfallArtUrl(k.name);
                                    }}
                                  />
                                </div>
                              </CardNameTooltip>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-3 text-xs font-sans italic text-neutral-500">
                No qualifying deck (requires 10+ games and 50%+ win rate).
              </div>
            )}
          </div>

          {/* 2. FUN FACTS (Expanded Statistics Suite) */}
          <div className="flex flex-col">
            <div className="pb-1.5 border-b border-white/10">
              <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                FUN FACTS
              </h2>
            </div>
            <div className="pt-2.5 space-y-2 text-xs font-sans">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Games played</span>
                <span className="font-semibold text-white tabular-nums">{funFacts.totalGames.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">On play %</span>
                <span className="font-semibold text-white tabular-nums">
                  {funFacts.onPlayPct.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Win Rate - Play vs Draw</span>
                <span className="font-semibold text-white tabular-nums">
                  {funFacts.playWinRate.toFixed(0)}% / {funFacts.drawWinRate.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Average match length</span>
                <span className="font-semibold text-white tabular-nums">
                  {funFacts.avgTurns.toFixed(1)} turns ({Math.floor(funFacts.avgSec / 60)}m {Math.floor(funFacts.avgSec % 60)}s)
                </span>
              </div>
              {funFacts.fastestOrganicWin && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Fastest game (no concedes)</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    Turn {funFacts.fastestOrganicWin.turns} ({Math.floor(funFacts.fastestOrganicWin.duration / 60)}m {Math.floor(funFacts.fastestOrganicWin.duration % 60)}s)
                  </span>
                </div>
              )}
              {funFacts.longestGame && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Longest game</span>
                  <span className="font-semibold text-amber-300 tabular-nums">
                    Turn {funFacts.longestGame.turns} ({Math.floor(funFacts.longestGame.duration / 60)}m {Math.floor(funFacts.longestGame.duration % 60)}s)
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Longest win streak</span>
                <span className="font-semibold text-white tabular-nums">
                  {funFacts.bestWin.len > 0 ? `${funFacts.bestWin.len} games` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Longest loss streak</span>
                <span className="font-semibold text-neutral-300 tabular-nums">
                  {funFacts.bestLoss.len > 0 ? `${funFacts.bestLoss.len} games` : '—'}
                </span>
              </div>
              {funFacts.favColorMatch && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Most favorite deck color</span>
                  <span className="flex items-center gap-1 font-semibold text-white">
                    <ManaPip symbol={funFacts.favColorMatch[0]} size={12} />
                    <span>({funFacts.favColorMatch[1]} games)</span>
                  </span>
                </div>
              )}
              {funFacts.leastColorMatch && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Least used deck color</span>
                  <span className="flex items-center gap-1 font-semibold text-white">
                    <ManaPip symbol={funFacts.leastColorMatch[0]} size={12} />
                    <span>({funFacts.leastColorMatch[1]} games)</span>
                  </span>
                </div>
              )}
              {funFacts.mostPlayed && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400 shrink-0">Most played deck</span>
                  <div
                    onClick={() => onSelectDeck(funFacts.mostPlayed.deck_name)}
                    className="flex items-center gap-1.5 font-semibold text-white truncate max-w-[220px] cursor-pointer hover:underline"
                    style={{ color: accentColor }}
                  >
                    {renderColorPips(funFacts.mostPlayed.colors || [], 11)}
                    <span className="truncate">{funFacts.mostPlayed.deck_name}</span>
                    <span className="text-neutral-400 font-normal">({funFacts.mostPlayed.total_matches}g)</span>
                  </div>
                </div>
              )}
              {funFacts.nemesis && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400 shrink-0">Arch Nemesis</span>
                  <div
                    onClick={() => onShowCard({ name: funFacts.nemesis.name, grp_id: funFacts.nemesis.grp_id }, true)}
                    className="flex items-center gap-1.5 font-semibold text-white min-w-0 cursor-pointer hover:underline"
                  >
                    {renderColorPips(funFacts.nemesis.colors || [], 11)}
                    <span className="truncate max-w-[190px]" title={funFacts.nemesis.name}>{funFacts.nemesis.name}</span>
                    <span className="text-rose-400 tabular-nums shrink-0">({funFacts.nemesis.winrate.toFixed(0)}% WR)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. RECENT ACHIEVEMENTS (Renamed, Actual Achievement Title, "Achieved on XXXX", Click opens Achievement Previewer) */}
          <div className="flex flex-col">
            <div className="pb-1.5 border-b border-white/10">
              <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                RECENT ACHIEVEMENTS
              </h2>
            </div>
            <div className="pt-2.5 space-y-2">
              {recentAchievements.length === 0 ? (
                <div className="text-xs font-sans italic text-neutral-500 py-2">
                  No earned achievements recorded yet.
                </div>
              ) : (
                recentAchievements.map((item, idx) => (
                  <div
                    key={`${item.achievement}-${item.cardName}-${idx}`}
                    onClick={() => {
                      const found = rawAchievements.find((a) => a.achievement === item.achievement) || {
                        achievement: item.achievement,
                        highest_tier: item.tier,
                        total_awards: item.count,
                        cards: [{ card_name: item.cardName, grp_id: item.grpId, count: item.count }],
                      };
                      setSelectedAchievement(found);
                    }}
                    className="flex items-center justify-between gap-3 p-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AchievementBadge
                        title={item.achievement}
                        tier={item.tier}
                        count={item.count}
                        size="sm"
                        showTitle={true}
                        showCount={false}
                      />
                      {item.earnedAt && (
                        <span className="text-[11px] font-sans text-neutral-500 group-hover:text-neutral-400 truncate">
                          Achieved on {formatEarnedDate(item.earnedAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-sans font-medium text-neutral-200 group-hover:text-white truncate max-w-[130px]">
                        {item.cardName}
                      </span>
                      <div className="w-8 h-8 shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900">
                        <img
                          src={scryfallArtUrl(item.cardName)}
                          alt={item.cardName}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 4. FEATURED LEADERBOARD (Top 5 records with description, no stock icon) */}
          {featuredLeaderboard && (
            <div className="flex flex-col">
              <div className="pb-1.5 border-b border-white/10">
                <h2 className="text-[17px] font-display font-bold tracking-[0.12em] uppercase text-neutral-100">
                  FEATURED LEADERBOARD
                </h2>
              </div>
              <div className="pt-2">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className="text-[12px] font-sans font-bold text-neutral-200 uppercase tracking-wider">
                    {featuredLeaderboard.title}
                  </span>
                  <span className="text-[11px] font-sans text-neutral-400 italic truncate opacity-80">
                    {featuredLeaderboard.description}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {featuredLeaderboard.items.map((entry: any, i: number) => (
                    <div
                      key={entry.grp_id ?? i}
                      onClick={() => onShowCard({ name: entry.card_name, grp_id: entry.grp_id }, false)}
                      className="flex items-center justify-between gap-2.5 p-1.5 bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group text-xs font-sans"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-4 text-center font-bold font-mono text-[11px] ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-neutral-500'}`}>
                          #{i + 1}
                        </span>
                        <div className="w-6 h-6 shrink-0 overflow-hidden border border-white/10 bg-neutral-900">
                          <img
                            src={scryfallArtUrl(entry.card_name)}
                            alt={entry.card_name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                          />
                        </div>
                        <span className="font-medium text-neutral-200 group-hover:text-white truncate">
                          {entry.card_name}
                        </span>
                      </div>
                      <span className="font-bold text-white tabular-nums shrink-0">
                        {entry.value} {featuredLeaderboard.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ACHIEVEMENT PREVIEWER MODAL */}
      {selectedAchievement && (
        <div
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center p-6 bg-black/85 backdrop-blur-2xl select-none"
          onClick={() => setSelectedAchievement(null)}
        >
          <div
            className="flex flex-col max-w-2xl w-full max-h-[85vh] rounded-2xl border border-white/20 shadow-2xl overflow-hidden bg-neutral-900/95 backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <AchievementBadge
                  title={selectedAchievement.achievement}
                  tier={selectedAchievement.highest_tier}
                  count={selectedAchievement.total_awards}
                  size="xl"
                  showTitle={false}
                  showCount={false}
                />
                <div>
                  <h3 className="text-lg font-display font-bold text-white leading-tight">
                    {getAchievementMeta(selectedAchievement.achievement).title}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {getAchievementMeta(selectedAchievement.achievement).description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAchievement(null)}
                className="p-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Awarded Cards List */}
            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar space-y-3">
              <div className="text-xs font-sans uppercase tracking-wider text-neutral-400 font-semibold">
                Awarded Cards ({selectedAchievement.cards?.length || 0})
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {(selectedAchievement.cards || []).map((c: any, i: number) => (
                  <div
                    key={c.grp_id ?? i}
                    onClick={() => {
                      setSelectedAchievement(null);
                      onShowCard({ name: c.card_name, grp_id: c.grp_id }, false);
                    }}
                    className="flex items-center justify-between p-2.5 bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-colors cursor-pointer text-xs group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 shrink-0 overflow-hidden border border-white/10 bg-neutral-950">
                        <img
                          src={scryfallArtUrl(c.card_name)}
                          alt={c.card_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      </div>
                      <span className="font-semibold text-white truncate">{c.card_name}</span>
                    </div>
                    <span className="text-neutral-400 tabular-nums font-mono">{c.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
