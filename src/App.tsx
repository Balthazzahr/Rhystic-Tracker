import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Swords, 
  Activity, 
  Layers, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  BookOpen,
  Settings,
  Trophy,
  CheckCircle2,
  XCircle,
  BarChart3,
  Search,
  Filter,
  ListFilter,
  Clock
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ManaPip } from './components/ManaPip';
import { SettingsView } from './components/SettingsView';
import { CustomDropdown } from './components/CustomDropdown';
import { CardBreakdown, CardItem } from './components/CardBreakdown';
import { MatchTimeline } from './components/MatchTimeline';
import { HoverArtPreview } from './components/HoverArtPreview';
import { FullMatchInfoModal } from './components/FullMatchInfoModal';
import { OpponentH2HModal } from './components/OpponentH2HModal';
import { DeckDetailView } from './components/DeckDetailView';
import logoImg from './assets/logo.png';

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
  player_life_end?: number;
  player_mulligans?: number;
  opponent_name?: string;
  opponent_commander_id?: number;
  opponent_mulligans?: number;
  opponent_life_end?: number;
  mana_curve?: number[];
  deck_colors?: string[];
  opponent_colors?: string[];
}

export default function App() {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Responsive Breakpoints
  const DRAWER_BREAKPOINT = 1200;
  const SIDEBAR_BREAKPOINT = 900;

  // Manual Overrides
  const [isSidebarCollapsedManual, setIsSidebarCollapsedManual] = useState<boolean | null>(null);
  const [isDrawerOpenManual, setIsDrawerOpenManual] = useState<boolean>(false);

  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<'matches' | 'live' | 'decks' | 'deckstats' | 'draft' | 'collection' | 'settings'>('matches');
  const [searchTerm, setSearchTerm] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');

  // Match Inspection & Real Data State
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatchCards, setSelectedMatchCards] = useState<CardItem[]>([]);
  const [drawerSubTab, setDrawerSubTab] = useState<'cards' | 'timeline'>('cards');
  const [hoveredCard, setHoveredCard] = useState<CardItem | null>(null);
  const [isFullInfoOpen, setIsFullInfoOpen] = useState<boolean>(false);
  const [targetOpponentName, setTargetOpponentName] = useState<string | null>(null);
  const [isH2HOpen, setIsH2HOpen] = useState<boolean>(false);
  const [impactfulCards, setImpactfulCards] = useState<any[]>([]);
  const [impactfulIndex, setImpactfulIndex] = useState<number>(0);
  const [deckOverview, setDeckOverview] = useState<any[]>([]);
  const [selectedDeckName, setSelectedDeckName] = useState<string | null>(null);
  const [deckDetail, setDeckDetail] = useState<any>(null);
  const [deckSearch, setDeckSearch] = useState('');
  const [commanderFilter, setCommanderFilter] = useState<string>('ALL');
  const [commanderSearch, setCommanderSearch] = useState('');
  const [deckFormatFilter, setDeckFormatFilter] = useState<string>('ALL');
  const [deckColorFilter, setDeckColorFilter] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
  const [commanderSearchOpen, setCommanderSearchOpen] = useState<boolean>(false);
  const [deckSortKey, setDeckSortKey] = useState<string>('total_matches');
  const [deckSortDir, setDeckSortDir] = useState<'asc' | 'desc'>('desc');

  // Hover state for theme selector preview
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);

  // Workspace Container Width Reference for Container-Based Column Collapsing
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState<number>(1000);

  // Mana Theme Engine State
  const [activeThemeId, setActiveThemeId] = useState<string>('blue');
  const [palette, setPalette] = useState<ManaTheme | null>(null);

  // Load Mana Theme via Tauri IPC
  const loadTheme = async (themeId: string) => {
    try {
      const manaTheme = await invoke<ManaTheme>('get_active_theme', { themeId });
      setPalette(manaTheme);
    } catch (e) {
      console.error('Failed to load mana theme:', e);
    }
  };

  const loadData = async (autoSelectLatest = false) => {
    try {
      const count = await invoke<number>('get_matches_count');
      setMatchCount(count);
      const recentMatches = await invoke<MatchRecord[]>('get_recent_matches', { limit: 3000 });
      setMatches([...recentMatches]);
      if (recentMatches.length > 0 && (!selectedMatchId || autoSelectLatest)) {
        setSelectedMatchId(recentMatches[0].match_id);
      }
    } catch (e) {
      console.error('Failed to load SQLite match data:', e);
    }
  };

  const loadDeckOverview = async () => {
    try {
      const decks = await invoke<any[]>('get_deck_overview');
      setDeckOverview(decks);
    } catch (e) {
      console.error('Failed to load deck overview:', e);
    }
  };

  // Load deck detail when a deck is selected.
  useEffect(() => {
    if (!selectedDeckName) { setDeckDetail(null); return; }
    const fetchDetail = async () => {
      try {
        const detail = await invoke<any>('get_deck_detail', { deckName: selectedDeckName });
        setDeckDetail(detail);
      } catch (e) {
        console.error('Failed to load deck detail:', e);
        setDeckDetail(null);
      }
    };
    fetchDetail();
  }, [selectedDeckName]);

  const [commanderInfo, setCommanderInfo] = useState<{ player_commander: any; opponent_commander: any } | null>(null);

  // Load cards and commander metadata for selected match via Tauri IPC
  useEffect(() => {
    if (!selectedMatchId) return;
    const fetchMatchCards = async () => {
      try {
        const cards = await invoke<CardItem[]>('get_match_cards', { matchId: selectedMatchId });
        setSelectedMatchCards(cards);

        const currentMatch = matches.find(m => m.match_id === selectedMatchId);
        if (currentMatch) {
          const commanderInfoRes = await invoke<{ player_commander: any; opponent_commander: any }>('get_commander_info', {
            playerCommanderId: currentMatch.player_commander_id ?? null,
            opponentCommanderId: currentMatch.opponent_commander_id ?? null
          });
          setCommanderInfo(commanderInfoRes);
        }

        // Fetch impactful cards (cards that dealt damage / caused life swings).
        try {
          const impactfulRes = await invoke<any>('get_impactful_cards', { matchId: selectedMatchId });
          const impactful = (impactfulRes && impactfulRes.cards) ? impactfulRes.cards : [];
          setImpactfulCards(impactful);
          setImpactfulIndex(0);
        } catch (e) {
          console.error('Failed to fetch impactful cards:', e);
          setImpactfulCards([]);
        }
      } catch (e) {
        console.error('Failed to fetch match cards:', e);
      }
    };
    fetchMatchCards();
  }, [selectedMatchId, matches]);

  // Impactful cards carousel: cycle through cards on a timer.
  useEffect(() => {
    if (impactfulCards.length <= 1) return;
    const timer = setInterval(() => {
      setImpactfulIndex((prev) => (prev + 1) % impactfulCards.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [impactfulCards]);

  const [liveMatchState, setLiveMatchState] = useState<{
    status: string;
    match_id?: string;
    turn?: number;
    round?: number;
    format?: string;
    player_life?: number;
    opponent_life?: number;
    opponent_name?: string;
    player_deck_name?: string;
    player_commander?: { grp_id: number; name: string };
    opponent_commander?: { grp_id: number; name: string };
    player_colors?: string[];
    opponent_colors?: string[];
    player_cards_seen?: number;
    opponent_cards_seen?: number;
    last_event?: { type: string; grp_id: number; seat_id: number; is_player: boolean };
    recent_events?: { type: string; grp_id: number; seat_id: number; is_player: boolean; name: string; delta?: number }[];
    just_completed?: boolean;
    result?: string;
    result_reason?: string;
    reason_label?: string;
  } | null>(null);

  useEffect(() => {
    loadTheme(activeThemeId);
    loadData();
    loadDeckOverview();

    let wasActive = false;

    const pollInterval = setInterval(async () => {
      try {
        const liveState = await invoke<any>('get_live_match_state');
        if (liveState && liveState.is_active) {
          wasActive = true;
          setLiveMatchState({
            status: 'IN_MATCH',
            match_id: liveState.match_id,
            turn: liveState.turn || 1,
            round: liveState.round || 1,
            format: liveState.format,
            player_life: liveState.player_life ?? 20,
            opponent_life: liveState.opponent_life ?? 20,
            opponent_name: liveState.opponent_name,
            player_deck_name: liveState.player_deck_name,
            player_commander: liveState.player_commander,
            opponent_commander: liveState.opponent_commander,
            player_colors: liveState.player_colors || [],
            opponent_colors: liveState.opponent_colors || [],
            player_cards_seen: liveState.player_cards_seen || 0,
            opponent_cards_seen: liveState.opponent_cards_seen || 0,
            last_event: liveState.last_event,
            recent_events: liveState.recent_events || [],
          });
        } else if (liveState && liveState.just_completed) {
          // Keep the HUD up showing the result overlay instead of blanking.
          setLiveMatchState({
            status: 'COMPLETED',
            match_id: liveState.match_id,
            format: liveState.format,
            player_deck_name: liveState.player_deck_name,
            opponent_name: liveState.opponent_name,
            player_life: liveState.player_life,
            opponent_life: liveState.opponent_life,
            just_completed: true,
            result: liveState.result,
            result_reason: liveState.result_reason,
            reason_label: liveState.reason_label,
            recent_events: [],
          });
          if (wasActive) {
            wasActive = false;
            await loadData(true);
          }
        } else {
          setLiveMatchState(null);
          if (wasActive) {
            wasActive = false;
            await loadData(true);
          }
        }
      } catch (e) {
        console.error('Failed polling live match state:', e);
      }
    }, 1500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [activeThemeId]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (workspaceRef.current) {
        setWorkspaceWidth(workspaceRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isSidebarCollapsed = isSidebarCollapsedManual !== null 
    ? isSidebarCollapsedManual 
    : windowWidth < SIDEBAR_BREAKPOINT;

  const isDrawerOpen = isDrawerOpenManual;
  const isDrawerOverlay = windowWidth < DRAWER_BREAKPOINT;

  // Selected Match Object
  const selectedMatch = useMemo(() => {
    return matches.find(m => m.match_id === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  // Deck Win/Loss Streak Calculation for Selected Match
  const deckStreak = useMemo(() => {
    if (!selectedMatch) return null;
    const deckMatches = matches.filter(m => m.player_deck_name === selectedMatch.player_deck_name);
    const selIdx = deckMatches.findIndex(m => m.match_id === selectedMatch.match_id);
    if (selIdx === -1) return null;

    const streakType = selectedMatch.result;
    let count = 0;
    for (let i = selIdx; i < deckMatches.length; i++) {
      if (deckMatches[i].result === streakType) {
        count++;
      } else {
        break;
      }
    }
    return { type: streakType, count };
  }, [matches, selectedMatch]);

  // Filter Computations
  const filteredMatches = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay()); // Sunday start
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return matches.filter(m => {
      const matchesSearch = 
        m.player_deck_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.format_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.opponent_name && m.opponent_name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesFormat = formatFilter === 'ALL' || m.format_name.toUpperCase() === formatFilter.toUpperCase();
      const matchesResult = resultFilter === 'ALL' || m.result.toLowerCase() === resultFilter.toLowerCase();

      const matchDate = new Date(m.timestamp);
      let matchesTime = true;
      if (timeFilter === 'TODAY') {
        matchesTime = matchDate >= startOfToday;
      } else if (timeFilter === 'WEEK') {
        matchesTime = matchDate >= startOfWeek;
      } else if (timeFilter === 'MONTH') {
        matchesTime = matchDate >= startOfMonth;
      } else if (timeFilter === 'YEAR') {
        matchesTime = matchDate >= startOfYear;
      }

      return matchesSearch && matchesFormat && matchesResult && matchesTime;
    });
  }, [matches, searchTerm, formatFilter, resultFilter, timeFilter]);

  // Aggregate stats over the filtered dataset
  const winsCount = useMemo(() => filteredMatches.filter(m => m.result === 'win').length, [filteredMatches]);
  const lossesCount = useMemo(() => filteredMatches.filter(m => m.result === 'loss').length, [filteredMatches]);
  const winrateVal = filteredMatches.length > 0 ? ((winsCount / filteredMatches.length) * 100).toFixed(1) : '0.0';

  // Commander filter options (unique commander names across all decks)
  const commanderOptions = useMemo(() => {
    const names = new Set<string>();
    for (const d of deckOverview) {
      for (const c of (d.commanders || [])) {
        if (c.name) names.add(c.name);
      }
    }
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
    return [
      { value: 'ALL', label: 'All Commanders' },
      { value: 'N/A', label: 'No Commander (N/A)' },
      ...sorted.map(n => ({ value: n, label: n })),
    ];
  }, [deckOverview]);

  // Commander type-ahead: narrowed list based on the search text.
  const commanderSearchResults = useMemo(() => {
    const q = commanderSearch.toLowerCase().trim();
    const results = commanderOptions.filter(o => o.value !== 'ALL' && (o.value === 'N/A' || o.label.toLowerCase().includes(q)));
    return results.slice(0, 30);
  }, [commanderOptions, commanderSearch]);

  // Deck Library KPI computations (client-side from deckOverview).
  const deckKPIs = useMemo(() => {
    // Canonical WUBRG order for order-independent combo keys.
    const WUBRG = ['W', 'U', 'B', 'R', 'G'];
    const canon = (cols: string[]) => [...cols].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b)).join('');

    // Most common format across decks.
    const formatCounts: Record<string, number> = {};
    for (const d of deckOverview) {
      const f = (d.formats || [])[0]?.format;
      if (f) formatCounts[f] = (formatCounts[f] || 0) + 1;
    }
    let topFormat = '—';
    let topFormatCount = 0;
    for (const [f, c] of Object.entries(formatCounts)) {
      if (c > topFormatCount) { topFormat = f; topFormatCount = c; }
    }

    // Color configuration tallies. Exclude decks with 0 resolved colors (colorless or
    // all-below-threshold) so they don't count toward any color bucket.
    const colorName: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const dualName: Record<string, string> = {
      WU: 'Azorius', WB: 'Orzhov', WR: 'Boros', WG: 'Selesnya',
      UB: 'Dimir', UR: 'Izzet', UG: 'Simic', BR: 'Rakdos', BG: 'Golgari', RG: 'Gruul',
    };
    const triName: Record<string, string> = {
      // Shards
      WUG: 'Bant', WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya',
      // Wedges
      WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
    };

    const monoCounts: Record<string, number> = {};
    const dualCounts: Record<string, number> = {};
    const triCounts: Record<string, number> = {};
    for (const d of deckOverview) {
      const cols = d.colors || [];
      if (cols.length === 0) continue;
      if (cols.length === 1) {
        monoCounts[cols[0]] = (monoCounts[cols[0]] || 0) + 1;
      } else if (cols.length === 2) {
        const key = canon(cols);
        dualCounts[key] = (dualCounts[key] || 0) + 1;
      } else if (cols.length === 3) {
        const key = canon(cols);
        triCounts[key] = (triCounts[key] || 0) + 1;
      }
      // 4-color and 5-color (Domain) are intentionally skipped.
    }

    let topMono = '—';
    let topMonoKey = '';
    let topMonoCount = 0;
    for (const [c, n] of Object.entries(monoCounts)) {
      if (n > topMonoCount) { topMono = colorName[c] || c; topMonoKey = c; topMonoCount = n; }
    }
    let topDual = '—';
    let topDualKey = '';
    let topDualCount = 0;
    for (const [c, n] of Object.entries(dualCounts)) {
      if (n > topDualCount) { topDual = dualName[c] || c; topDualKey = c; topDualCount = n; }
    }
    let topTri = '—';
    let topTriKey = '';
    let topTriCount = 0;
    for (const [c, n] of Object.entries(triCounts)) {
      if (n > topTriCount) { topTri = triName[c] || c; topTriKey = c; topTriCount = n; }
    }

    return {
      total: deckOverview.length,
      topFormat,
      topMono, topMonoKey,
      topDual, topDualKey,
      topTri, topTriKey,
    };
  }, [deckOverview]);

  // Filtered deck list: by search term and commander filter
  const filteredDecks = useMemo(() => {
    const WUBRG = ['W', 'U', 'B', 'R', 'G'];
    const colorRank = (c: string[]) => {
      if (!c || c.length === 0) return 999;
      let min = 999;
      for (const ch of c) {
        const idx = WUBRG.indexOf(ch);
        if (idx !== -1 && idx < min) min = idx;
      }
      return min;
    };

    const list = deckOverview.filter(d => {
      const matchesSearch = d.deck_name.toLowerCase().includes(deckSearch.toLowerCase());

      // Commander filter: 'ALL' -> no filter; 'N/A' -> only decks with no commander;
      // specific name -> only decks that include that commander (non-commander decks drop out).
      let matchesCommander = true;
      if (commanderFilter === 'N/A') {
        matchesCommander = !(d.commanders || []).some(c => c.name);
      } else if (commanderFilter !== 'ALL') {
        matchesCommander = (d.commanders || []).some(c => c.name === commanderFilter);
      }

      // Format filter: match if deck has that format.
      const matchesFormat = deckFormatFilter === 'ALL' || (d.formats || []).some(f => f.format === deckFormatFilter);

      // Color filter: EXACT match on the full color identity.
      // - 'C' (colorless) selected -> only decks with 0 resolved colors
      // - otherwise the deck's colors must exactly equal the selected set
      let matchesColor = true;
      if (deckColorFilter.length > 0) {
        if (deckColorFilter.includes('C')) {
          matchesColor = (d.colors || []).length === 0;
        } else {
          const deckCols = [...(d.colors || [])].sort();
          const selCols = [...deckColorFilter.filter(c => c !== 'C')].sort();
          matchesColor = deckCols.length === selCols.length && deckCols.every((c, i) => c === selCols[i]);
        }
      }

      return matchesSearch && matchesCommander && matchesFormat && matchesColor;
    });

    const dir = deckSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (deckSortKey) {
        case 'deck_name':
          cmp = (a.deck_name || '').localeCompare(b.deck_name || '');
          break;
        case 'colors':
          cmp = colorRank(a.colors) - colorRank(b.colors);
          break;
        case 'format': {
          const af = (a.formats || [])[0]?.format || '';
          const bf = (b.formats || [])[0]?.format || '';
          cmp = af.localeCompare(bf);
          break;
        }
        case 'games':
          cmp = (a.total_matches || 0) - (b.total_matches || 0);
          break;
        case 'record': {
          const aw = a.wins || 0, al = a.losses || 0;
          const bw = b.wins || 0, bl = b.losses || 0;
          cmp = (aw - al) - (bw - bl);
          break;
        }
        case 'winrate': {
          const awr = parseFloat(a.winrate) || 0;
          const bwr = parseFloat(b.winrate) || 0;
          cmp = awr - bwr;
          break;
        }
        default:
          cmp = (a.total_matches || 0) - (b.total_matches || 0);
      }
      return cmp * dir;
    });
    return list;
  }, [deckOverview, deckSearch, commanderFilter, deckFormatFilter, deckColorFilter, deckSortKey, deckSortDir]);

  // Deck table virtualization (separate from the match history virtualizer)
  const deckTableParentRef = useRef<HTMLDivElement>(null);
  const deckRowVirtualizer = useVirtualizer({
    count: filteredDecks.length,
    getScrollElement: () => deckTableParentRef.current,
    estimateSize: () => 72, // Exact row height: 72px
    overscan: 10,
  });

  const toggleDeckSort = (key: string) => {
    if (deckSortKey === key) {
      setDeckSortDir(deckSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setDeckSortKey(key);
      setDeckSortDir('desc');
    }
  };

  // Table Virtualization Container Reference
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredMatches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Exact row height: 80px
    overscan: 10,
  });

  const manaThemeOptions = [
    { id: 'white', label: 'White (Order)', symbol: 'W', color: '#F8F6D8' },
    { id: 'blue', label: 'Blue (Progress)', symbol: 'U', color: '#38BDF8' },
    { id: 'black', label: 'Black (Ambition)', symbol: 'B', color: '#A855F7' },
    { id: 'red', label: 'Red (Chaos)', symbol: 'R', color: '#F87171' },
    { id: 'green', label: 'Green (Nature)', symbol: 'G', color: '#34D399' },
  ];

  const navItems = [
    { id: 'matches', label: 'Match History', icon: Swords },
    { id: 'live', label: 'Live Match HUD', icon: Activity },
    { id: 'decks', label: 'Deck Library', icon: Layers },
    { id: 'deckstats', label: 'Play Stats', icon: BarChart3 },
    { id: 'draft', label: 'Draft (v2)', icon: Sparkles, badge: 'SOON' },
    { id: 'collection', label: 'Collection (v2)', icon: BookOpen, badge: 'SOON' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const formatOptions = [
    { value: 'ALL', label: 'All Formats' },
    { value: 'BRAWL', label: 'Brawl' },
    { value: 'STANDARD', label: 'Standard' },
    { value: 'HISTORIC', label: 'Historic' },
  ];

  const timeOptions = [
    { value: 'ALL', label: 'All Time' },
    { value: 'YEAR', label: 'This Year' },
    { value: 'MONTH', label: 'This Month' },
    { value: 'WEEK', label: 'This Week' },
    { value: 'TODAY', label: 'Today' },
  ];

  const renderManaHistogram = (curve?: number[]) => {
    const bins = curve || [0, 0, 0, 0, 0, 0, 0];
    const maxVal = Math.max(...bins, 1);
    return (
      <div className="flex items-end gap-1 h-8 w-24 px-1 py-0.5 rounded bg-black/40 border border-white/5" title={`Mana Curve Bins (1..7+): ${bins.join(', ')}`}>
        {bins.map((val, idx) => {
          const heightPct = Math.max((val / maxVal) * 100, 15);
          return (
            <div 
              key={idx} 
              className="flex-1 rounded-t-sm"
              style={{ 
                height: `${heightPct}%`, 
                backgroundColor: val > 0 ? (palette?.accent || '#38BDF8') : 'rgba(255,255,255,0.1)'
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderDeckColorIdentity = (colors?: string[]) => {
    if (!colors || colors.length === 0) {
      return <ManaPip symbol="C" size={14} className="shrink-0" />;
    }
    return (
      <div className="flex flex-wrap items-center justify-center gap-0.5 w-[56px] max-w-[56px] shrink-0">
        {colors.map((c) => (
          <ManaPip key={c} symbol={c} size={14} className="shrink-0" />
        ))}
      </div>
    );
  };

  // Format timestamp as "14 Aug 26 14:52" (day, short month, 2-digit year, HH:MM)
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

  // Scryfall art crop URL for a card name (same named-card endpoint HoverArtPreview uses).
  const scryfallArtUrl = (name: string) =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

  // Representative art thumbnail for a deck row: dominant commander (Brawl) or
  // highest-CMC card (non-commander). Falls back to a placeholder on load error.
  const renderDeckArt = (d: any, size: string = 'w-10 h-10') => {
    const artName = d.top_commander_name || d.top_card_name;
    if (!artName) {
      return (
        <div className={`${size} rounded-lg bg-black/40 border shrink-0 flex items-center justify-center`} style={{ borderColor: palette?.border }}>
          <Layers className="w-4 h-4 opacity-30" />
        </div>
      );
    }
    return (
      <img
        src={scryfallArtUrl(artName)}
        alt={artName}
        className={`${size} rounded-lg object-cover shrink-0 border`}
        style={{ borderColor: `${palette?.border}66` }}
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
      />
    );
  };

  // Sortable column header: click to toggle asc/desc.
  const renderDeckColHeader = (label: string, sortKey: string) => {
    const active = deckSortKey === sortKey;
    return (
      <button
        onClick={() => toggleDeckSort(sortKey)}
        className="flex items-center gap-1 hover:opacity-100 transition-opacity uppercase text-xs font-semibold"
        style={{ color: active ? (palette?.accent || '#38BDF8') : palette?.subtext }}
        title={`Sort by ${label}`}
      >
        {label}
        <span className="text-[9px] font-mono opacity-70">
          {active ? (deckSortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    );
  };

  // Short result reason shown under the victory/defeat icon in the drawer header:
  // "Opponent Concede" / "Player Concede" / "Player Lost" / "Opponent Lost".
  const matchReason = (m: MatchRecord): string => {
    const reason = m.result_reason || '';
    if (reason.includes('Concede')) {
      return m.result === 'win' ? 'Opponent Concede' : 'Player Concede';
    }
    if (reason.includes('Timeout')) {
      return m.result === 'win' ? 'Opponent Timeout' : 'Player Timeout';
    }
    return m.result === 'win' ? 'Opponent Lost' : 'Player Lost';
  };

  // Live HUD deck colors: show "-" until colors are known (rather than a colorless
  // pip, which implies a genuinely colorless deck).
  const renderLiveDeckColors = (colors?: string[]) => {
    if (!colors || colors.length === 0) {
      return <span className="text-xs font-mono opacity-50">-</span>;
    }
    return renderDeckColorIdentity(colors);
  };

  // Render a single live action-feed row, handling life-change entries with
  // green/red +/- deltas and card play/draw entries with their badge.
  const renderFeedItem = (e: { type: string; name?: string; delta?: number }, idx: number) => {
    if (e.type === 'life') {
      const positive = (e.delta ?? 0) >= 0;
      return (
        <div key={idx} className="text-xs font-mono flex items-center gap-1.5 py-0.5 border-b border-white/5">
          <span className={`px-1 rounded text-[10px] font-bold uppercase ${positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            LIFE {positive ? `+${e.delta}` : e.delta}
          </span>
          <span className={`truncate ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>{e.name}</span>
        </div>
      );
    }
    return (
      <div key={idx} className="text-xs font-mono flex items-center gap-1.5 py-0.5 border-b border-white/5">
        <span className={`px-1 rounded text-[10px] font-bold uppercase ${e.type === 'play' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-purple-500/10 text-purple-400'}`}>
          {e.type === 'draw' ? 'DRAW' : 'PLAY'}
        </span>
        <span className="truncate opacity-90">{e.name}</span>
      </div>
    );
  };

  // Container Width Responsive Breakpoints:
  const showColorsCol = workspaceWidth >= 750;
  const isShortDate = workspaceWidth < 600;
  const showCurveCol = workspaceWidth >= 520;

  return (
    <div 
      className="flex h-screen overflow-hidden select-none min-w-[768px] relative transition-colors duration-200"
      style={{ backgroundColor: palette?.base || '#0B0C10', color: palette?.text || '#F8FAFC' }}
    >
      {/* COLUMN 1: Left Sidebar */}
      <aside 
        className="h-full border-r flex flex-col justify-between p-4 shrink-0 transition-all duration-300 ease-in-out z-20"
        style={{ 
          backgroundColor: palette?.mantle || '#12141A', 
          borderColor: palette?.border || '#2A2F3D',
          width: isSidebarCollapsed ? '72px' : '260px'
        }}
      >
        <div className="space-y-6">
          {/* Logo Brand Section */}
          <div 
            className={`py-3 border-b flex items-center justify-center transition-all ${
              isSidebarCollapsed ? 'px-0' : 'px-2'
            }`}
            style={{ borderColor: palette?.border || '#2A2F3D' }}
          >
            <img 
              src={logoImg} 
              alt="Rhystic Tracker" 
              className={`w-full object-contain drop-shadow-md transition-all ${
                isSidebarCollapsed ? 'max-h-8' : 'max-h-12'
              }`}
            />
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  title={isSidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center py-3 rounded-xl font-medium text-sm transition-all ${
                    isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'
                  }`}
                  style={{
                    backgroundColor: isActive ? `${palette?.accent || '#38BDF8'}1F` : 'transparent',
                    color: isActive ? (palette?.accent || '#38BDF8') : (palette?.text || '#F8FAFC'),
                    borderLeft: !isSidebarCollapsed && isActive ? `4px solid ${palette?.accent || '#38BDF8'}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Icon 
                      className={`w-4 h-4 shrink-0 ${item.id === 'live' && isActive ? 'animate-pulse' : ''}`}
                      style={{ color: isActive ? palette?.accent : undefined }}
                    />
                    {!isSidebarCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </div>
                  {!isSidebarCollapsed && item.badge && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Color-Lit Mana Theme Selector */}
        <div className="space-y-3">
          <div 
            className={`p-2.5 rounded-xl border flex items-center transition-all ${
              isSidebarCollapsed ? 'flex-col space-y-2' : 'justify-between gap-1'
            }`}
            style={{ 
              backgroundColor: `${palette?.surface || '#1A1D24'}99`, 
              borderColor: palette?.border || '#2A2F3D' 
            }}
          >
            {manaThemeOptions.map((t) => {
              const isSelected = activeThemeId === t.id;
              const isHovered = hoveredThemeId === t.id;
              const isLit = isSelected || isHovered;

              return (
                <button
                  key={t.id}
                  onClick={() => setActiveThemeId(t.id)}
                  onMouseEnter={() => setHoveredThemeId(t.id)}
                  onMouseLeave={() => setHoveredThemeId(null)}
                  title={t.label}
                  className={`transition-all duration-200 p-0.5 ${
                    isLit ? 'scale-125' : 'opacity-60 scale-100 hover:opacity-100'
                  }`}
                >
                  <ManaPip 
                    symbol={t.symbol} 
                    size={isSidebarCollapsed ? 18 : 22} 
                    colorOverride={t.color}
                    grayscale={!isLit}
                  />
                </button>
              );
            })}
          </div>

          <button 
            onClick={() => setIsSidebarCollapsedManual(!isSidebarCollapsed)}
            className="w-full py-2 px-3 border rounded-xl font-mono text-xs flex items-center justify-center gap-2 transition-all hover:bg-white/5"
            style={{ 
              backgroundColor: `${palette?.surface || '#1A1D24'}99`,
              borderColor: palette?.border || '#2A2F3D',
              color: palette?.subtext || '#94A3B8'
            }}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[11px] uppercase tracking-wider font-semibold">Collapse Menu</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* COLUMN 2: Main Workspace Container */}
      <main ref={workspaceRef} className="flex-1 min-w-[400px] h-full p-6 overflow-hidden flex flex-col space-y-4 transition-all duration-300 relative">
        
        {/* Persistent Live Match Banner */}
        {liveMatchState && activeTab !== 'live' && (
          <div 
            onClick={() => setActiveTab('live')}
            className="w-full p-3.5 rounded-2xl border flex items-center justify-between shadow-lg cursor-pointer hover:opacity-90 transition-all animate-pulse"
            style={{ backgroundColor: `${palette?.accent}1F`, borderColor: palette?.accent }}
          >
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5" style={{ color: palette?.accent }} />
              <div>
                <span className="text-xs font-bold font-outfit uppercase tracking-wide" style={{ color: palette?.accent }}>
                  MATCH IN PROGRESS — LIVE TRACKING ACTIVE
                </span>
                <p className="text-[11px] opacity-80 font-mono">
                  Round {liveMatchState.round ?? Math.ceil((liveMatchState.turn || 1) / 2)} • Your HP: {liveMatchState.player_life ?? 20} • Opp HP: {liveMatchState.opponent_life ?? 20}
                  {liveMatchState.last_event ? ` • ${liveMatchState.last_event.is_player ? 'You' : (liveMatchState.opponent_name || 'Opp')} ${liveMatchState.last_event.type === 'draw' ? 'drew' : 'played'}` : ''}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border bg-black/40 text-emerald-400 border-emerald-500/30">
              CLICK TO VIEW HUD →
            </span>
          </div>
        )}
        
        {/* VIEW 1: Settings Screen */}
        {activeTab === 'settings' && (
          <SettingsView 
            palette={palette} 
            activeThemeId={activeThemeId} 
            setActiveThemeId={setActiveThemeId} 
          />
        )}

        {/* VIEW 2: Decks & Collection */}
        {(activeTab === 'draft' || activeTab === 'collection') && (
          <div className="flex-1 border border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3" style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}>
            <Sparkles className="w-10 h-10 opacity-40 animate-bounce" style={{ color: palette?.accent }} />
            <h3 className="text-lg font-bold">Feature Coming Soon (v2 Scope)</h3>
            <p className="text-xs opacity-60 max-w-sm">
              {activeTab === 'draft' 
                ? '17Lands live draft assistant & pick evaluator integration will arrive in v2.'
                : 'Local card collection binder & deck completion tracking will arrive in v2.'}
            </p>
          </div>
        )}

        {/* VIEW 3: Live Match HUD (Stage 4) */}
        {activeTab === 'live' && (
          <div className="flex-1 border rounded-2xl p-6 flex flex-col justify-between space-y-6" style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}>
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: `${palette?.border}66` }}>
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 animate-pulse" style={{ color: palette?.accent }} />
                <div>
                  <h3 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                    Live Match HUD
                  </h3>
                  <p className="text-xs opacity-60 font-mono">
                    {liveMatchState ? `Active Game (ID: ${liveMatchState.match_id?.slice(0, 8)}...)` : 'No active match currently detected'}
                  </p>
                </div>
              </div>
              <span className={`text-xs font-mono font-bold px-3 py-1 rounded-full border ${
                liveMatchState ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-white/5 opacity-50 border-white/10'
              }`}>
                {liveMatchState ? 'MATCH IN PROGRESS' : 'IDLE / WAITING FOR MATCH'}
              </span>
            </div>

            {liveMatchState ? (
              <div className="flex-1 flex flex-col space-y-4 relative">
                {/* Match Result Overlay: shown for a short window after the game ends */}
                {liveMatchState.just_completed && (
                  <div className={`absolute inset-0 z-10 rounded-2xl border flex flex-col items-center justify-center space-y-4 backdrop-blur-xl animate-fade-in ${
                    liveMatchState.result === 'win' ? 'bg-emerald-950/80 border-emerald-500/40' : 'bg-rose-950/80 border-rose-500/40'
                  }`}>
                    <div className={`text-6xl font-black font-outfit uppercase tracking-widest ${liveMatchState.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {liveMatchState.result === 'win' ? 'VICTORY' : 'DEFEAT'}
                    </div>
                    <div className="text-xl font-bold font-mono" style={{ color: palette?.text }}>
                      {liveMatchState.reason_label || 'Match Ended'}
                    </div>
                    <div className="flex items-center gap-6 text-sm font-mono opacity-80">
                      <span className="text-emerald-400">{liveMatchState.player_life ?? 20} HP</span>
                      <span className="opacity-40">VS</span>
                      <span className="text-rose-400">{liveMatchState.opponent_life ?? 0} HP</span>
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-wider opacity-50">
                      {liveMatchState.format} • {liveMatchState.opponent_name || 'Opponent'}
                    </div>
                  </div>
                )}
                {/* Top Row: Match Context — Format, Deck, Opponent, Round */}
                <div className="flex items-center justify-between p-4 rounded-2xl border bg-black/40" style={{ borderColor: palette?.border }}>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[11px] font-mono uppercase opacity-60">Format</p>
                      <p className="text-sm font-bold font-outfit" style={{ color: palette?.accent }}>{liveMatchState.format || '—'}</p>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div>
                      <p className="text-[11px] font-mono uppercase opacity-60">Your Deck</p>
                      <p className="text-sm font-bold truncate max-w-[220px]">{liveMatchState.player_deck_name || '—'}</p>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div>
                      <p className="text-[11px] font-mono uppercase opacity-60">Opponent</p>
                      <p className="text-sm font-bold truncate max-w-[160px]">{liveMatchState.opponent_name || 'Opponent'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    ROUND {liveMatchState.round ?? Math.ceil((liveMatchState.turn || 1) / 2)}
                  </span>
                </div>

                {/* Middle Row: Player vs Opponent — Health on top, live actions below */}
                <div className="grid grid-cols-2 gap-4 flex-1 items-stretch min-h-0">
                  {/* Player Panel */}
                  <div className="p-5 rounded-2xl border bg-black/40 flex flex-col space-y-3 min-h-0" style={{ borderColor: palette?.border }}>
                    <div className="flex items-center justify-between shrink-0">
                      <span className="text-sm font-mono uppercase opacity-60">Your Life</span>
                      <span className="text-xs font-mono opacity-50">{liveMatchState.player_cards_seen ?? 0} cards seen</span>
                    </div>
                    <div className="text-5xl font-black text-emerald-400 font-mono shrink-0">{liveMatchState.player_life ?? 20} HP</div>

                    {liveMatchState.format?.toUpperCase() === 'BRAWL' && liveMatchState.player_commander && (
                      <div className="text-sm shrink-0">
                        <span className="opacity-50 text-[11px] uppercase font-semibold block mb-1">Commander</span>
                        <span className="font-bold">{liveMatchState.player_commander.name}</span>
                      </div>
                    )}

                    <div className="shrink-0">
                      <span className="opacity-50 text-[11px] uppercase font-semibold block mb-1">Deck Colors</span>
                      {renderLiveDeckColors(liveMatchState.player_colors)}
                    </div>

                    {/* Live Action Feed (Player) */}
                    <div className="flex-1 min-h-0 rounded-xl border p-2 overflow-y-auto custom-scrollbar" style={{ borderColor: `${palette?.border}66`, backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <p className="text-[10px] font-mono uppercase opacity-50 mb-1 sticky top-0 bg-black/60 py-0.5">Your Actions</p>
                      {(liveMatchState.recent_events || []).filter(e => e.is_player).length === 0 ? (
                        <p className="text-xs font-mono opacity-30">No actions yet</p>
                      ) : (
                        (liveMatchState.recent_events || []).filter(e => e.is_player).slice().reverse().map((e, idx) => renderFeedItem(e, idx))
                      )}
                    </div>
                  </div>

                  {/* Opponent Panel */}
                  <div className="p-5 rounded-2xl border bg-black/40 flex flex-col space-y-3 min-h-0" style={{ borderColor: palette?.border }}>
                    <div className="flex items-center justify-between shrink-0">
                      <span className="text-sm font-mono uppercase opacity-60">Opponent Life</span>
                      <span className="text-xs font-mono opacity-50">{liveMatchState.opponent_cards_seen ?? 0} cards seen</span>
                    </div>
                    <div className="text-5xl font-black text-rose-400 font-mono shrink-0">{liveMatchState.opponent_life ?? 20} HP</div>

                    {liveMatchState.format?.toUpperCase() === 'BRAWL' && liveMatchState.opponent_commander && (
                      <div className="text-sm shrink-0">
                        <span className="opacity-50 text-[11px] uppercase font-semibold block mb-1">Commander</span>
                        <span className="font-bold">{liveMatchState.opponent_commander.name}</span>
                      </div>
                    )}

                    <div className="shrink-0">
                      <span className="opacity-50 text-[11px] uppercase font-semibold block mb-1">Deck Colors</span>
                      {renderLiveDeckColors(liveMatchState.opponent_colors)}
                    </div>

                    {/* Live Action Feed (Opponent) */}
                    <div className="flex-1 min-h-0 rounded-xl border p-2 overflow-y-auto custom-scrollbar" style={{ borderColor: `${palette?.border}66`, backgroundColor: 'rgba(0,0,0,0.3)' }}>
                      <p className="text-[10px] font-mono uppercase opacity-50 mb-1 sticky top-0 bg-black/60 py-0.5">Opponent Actions</p>
                      {(liveMatchState.recent_events || []).filter(e => !e.is_player).length === 0 ? (
                        <p className="text-xs font-mono opacity-30">No actions yet</p>
                      ) : (
                        (liveMatchState.recent_events || []).filter(e => !e.is_player).slice().reverse().map((e, idx) => renderFeedItem(e, idx))
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Last Event Feed */}
                <div className="p-3.5 rounded-2xl border bg-black/40 flex items-center gap-3" style={{ borderColor: palette?.border }}>
                  <Activity className="w-4 h-4 shrink-0 animate-pulse" style={{ color: palette?.accent }} />
                  <span className="text-[11px] font-mono uppercase opacity-50 shrink-0">Last Action</span>
                  <span className="text-sm font-bold font-mono truncate">
                    {liveMatchState.last_event ? (
                      <>
                        <span style={{ color: liveMatchState.last_event.is_player ? '#38BDF8' : '#FBBF24' }}>
                          {liveMatchState.last_event.is_player ? 'YOU' : (liveMatchState.opponent_name || 'OPPONENT').toUpperCase()}
                        </span>
                        <span className="opacity-60"> {liveMatchState.last_event.type === 'draw' ? 'DREW A CARD' : 'PLAYED A CARD'}</span>
                      </>
                    ) : (
                      <span className="opacity-40">Awaiting first action...</span>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
                {/* Large desaturated, semi-transparent Rhystic Tracker logo in the background */}
                <img
                  src={logoImg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain opacity-20"
                  style={{ filter: 'grayscale(100%) saturate(0%)' }}
                />

                {/* IDLE / WAITING FOR MATCH pill */}
                <div className="relative z-10 px-8 py-3 rounded-full border bg-black/60 backdrop-blur-md shadow-2xl" style={{ borderColor: palette?.border }}>
                  <span className="text-sm font-black font-mono uppercase tracking-widest" style={{ color: palette?.subtext }}>
                    Idle / Waiting for Match
                  </span>
                </div>

                {/* Launch prompt at the bottom */}
                <div className="absolute bottom-8 left-0 right-0 z-10 text-center">
                  <p className="text-sm font-mono opacity-60">Launch a match to start tracking stats</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4A: Deck Library */}
        {activeTab === 'decks' && (
          <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 shrink-0">
              <div>
                <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                  Deck Library
                </h1>
              </div>
              <div className="flex items-center gap-3">
                {/* Deck Search */}
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    type="text"
                    placeholder="Search decks..."
                    value={deckSearch}
                    onChange={(e) => setDeckSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border bg-black/30 focus:outline-none"
                    style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
                  />
                </div>
                {/* Filters Button */}
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all hover:bg-white/5 ${
                    showFilterPanel || deckFormatFilter !== 'ALL' || deckColorFilter.length > 0 || commanderFilter !== 'ALL' ? 'opacity-100' : 'opacity-70'
                  }`}
                  style={{ backgroundColor: palette?.surface, borderColor: palette?.border, color: palette?.text }}
                >
                  <Filter className="w-3.5 h-3.5" style={{ color: palette?.accent }} />
                  Filters
                  {(deckFormatFilter !== 'ALL' || deckColorFilter.length > 0 || commanderFilter !== 'ALL') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Deck Library KPI Boxes */}
            <div className="grid grid-cols-5 gap-4 shrink-0">
              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Total Decks</p>
                  <h3 className="text-2xl font-extrabold font-outfit mt-0.5">{deckKPIs.total}</h3>
                </div>
                <BarChart3 className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Most Common Format</p>
                  <h3 className="text-xl font-extrabold font-outfit mt-0.5" style={{ color: palette?.accent || '#38BDF8' }}>{deckKPIs.topFormat}</h3>
                </div>
                <Filter className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Most Common Mono-Color</p>
                  <h3 className="text-xl font-extrabold font-outfit mt-0.5">{deckKPIs.topMono}</h3>
                </div>
                {deckKPIs.topMonoKey ? <ManaPip symbol={deckKPIs.topMonoKey as any} size={20} className="opacity-40" /> : <span className="text-[10px] opacity-30">—</span>}
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Most Common Dual-Color</p>
                  <h3 className="text-xl font-extrabold font-outfit mt-0.5">{deckKPIs.topDual}</h3>
                </div>
                <div className="flex gap-0.5">
                  {(deckKPIs.topDualKey || '').split('').map((c) => <ManaPip key={c} symbol={c as any} size={20} className="opacity-40" />)}
                  {!deckKPIs.topDualKey && <span className="text-[10px] opacity-30">—</span>}
                </div>
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Most Common Tri-Color</p>
                  <h3 className="text-xl font-extrabold font-outfit mt-0.5">{deckKPIs.topTri}</h3>
                </div>
                <div className="flex gap-0.5">
                  {(deckKPIs.topTriKey || '').split('').map((c) => <ManaPip key={c} symbol={c as any} size={20} className="opacity-40" />)}
                  {!deckKPIs.topTriKey && <span className="text-[10px] opacity-30">—</span>}
                </div>
              </div>
            </div>

            {/* Filter Panel (dropdown) */}
            {showFilterPanel && (
              <div className="shrink-0 rounded-2xl border shadow-xl p-4 space-y-4" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <div className="flex items-center justify-between">
                  <Filter className="w-4 h-4" style={{ color: palette?.accent }} />
                  <button
                    onClick={() => { setShowFilterPanel(false); setDeckFormatFilter('ALL'); setDeckColorFilter([]); setCommanderFilter('ALL'); setCommanderSearch(''); }}
                    className="text-[10px] font-mono opacity-60 hover:opacity-100 underline"
                  >
                    Clear all
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  {/* Format filter */}
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Format</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setDeckFormatFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                          deckFormatFilter === 'ALL' ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: deckFormatFilter === 'ALL' ? `${palette?.accent || '#38BDF8'}25` : 'transparent', borderColor: deckFormatFilter === 'ALL' ? (palette?.accent || '#38BDF8') : palette?.border, color: deckFormatFilter === 'ALL' ? (palette?.accent || '#38BDF8') : palette?.text }}
                      >
                        All
                      </button>
                      {Array.from(new Set(deckOverview.flatMap((d: any) => (d.formats || []).map((f: any) => f.format)))).sort().map((f) => (
                        <button
                          key={f}
                          onClick={() => setDeckFormatFilter(deckFormatFilter === f ? 'ALL' : f)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                            deckFormatFilter === f ? 'opacity-100' : 'opacity-50 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: deckFormatFilter === f ? `${palette?.accent || '#38BDF8'}25` : 'transparent', borderColor: deckFormatFilter === f ? (palette?.accent || '#38BDF8') : palette?.border, color: deckFormatFilter === f ? (palette?.accent || '#38BDF8') : palette?.text }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color filter (multi-select, exact-match) */}
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Color Identity</p>
                    <div className="flex items-center gap-2">
                      {['W', 'U', 'B', 'R', 'G'].map((c) => {
                        const active = deckColorFilter.includes(c);
                        return (
                          <button
                            key={c}
                            onClick={() => {
                              setDeckColorFilter(prev => active ? prev.filter(x => x !== c) : [...prev, c]);
                            }}
                            className={`transition-all ${active ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                            title={`Toggle ${c}`}
                          >
                            <ManaPip symbol={c} size={24} />
                          </button>
                        );
                      })}
                      {/* Colorless option */}
                      <button
                        onClick={() => {
                          setDeckColorFilter(prev => prev.includes('C') ? prev.filter(x => x !== 'C') : [...prev, 'C']);
                        }}
                        className={`transition-all ${deckColorFilter.includes('C') ? 'scale-110' : 'opacity-30 hover:opacity-70'}`}
                        title="Toggle Colorless"
                      >
                        <ManaPip symbol="C" size={24} />
                      </button>
                    </div>
                    <p className="text-[9px] font-mono opacity-40 mt-2">Exact match on full color identity</p>
                  </div>

                  {/* Commander filter (type-ahead) */}
                  <div>
                    <p className="text-[10px] uppercase font-semibold opacity-60 mb-2">Commander (Brawl only)</p>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search commander..."
                        value={commanderSearch}
                        onChange={(e) => setCommanderSearch(e.target.value)}
                        onFocus={() => setCommanderSearchOpen(true)}
                        onBlur={() => setTimeout(() => setCommanderSearchOpen(false), 150)}
                        className="w-full pl-3 pr-3 py-1.5 text-xs rounded-lg border bg-black/30 focus:outline-none"
                        style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
                      />
                      {commanderSearchOpen && commanderSearchResults.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border shadow-2xl overflow-y-auto max-h-56 custom-scrollbar" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                          {commanderSearchResults.map((o) => {
                            const isSelected = commanderFilter === o.value;
                            return (
                              <button
                                key={o.value}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setCommanderFilter(o.value); setCommanderSearch(o.value === 'N/A' ? '' : o.label); setCommanderSearchOpen(false); }}
                                className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-white/10 flex items-center justify-between"
                                style={{ color: isSelected ? (palette?.accent || '#38BDF8') : (palette?.text || '#F8FAFC') }}
                              >
                                <span className="truncate">{o.label}</span>
                                {isSelected && <span className="text-[10px] font-mono">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] font-mono opacity-40 mt-2">Selecting a commander hides non-commander decks</p>
                  </div>
                </div>
              </div>
            )}

            {/* Deck Library content: table */}
            <div className="flex-1 rounded-2xl border overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
              {/* Table Header */}
              <div className="sticky top-0 z-10 border-b backdrop-blur-md" style={{ backgroundColor: `${palette?.mantle || '#12141A'}EE`, borderColor: palette?.border || '#2A2F3D' }}>
                <div className="flex items-center py-3 px-4 gap-3" style={{ color: palette?.subtext }}>
                  <div className="flex-1 min-w-[200px]">{renderDeckColHeader('Deck', 'deck_name')}</div>
                  <div className="w-[90px] shrink-0 text-center">{renderDeckColHeader('Colors', 'colors')}</div>
                  <div className="w-[80px] shrink-0 text-center">{renderDeckColHeader('Format', 'format')}</div>
                  <div className="w-[90px] shrink-0 text-center">{renderDeckColHeader('Games', 'games')}</div>
                  <div className="w-[90px] shrink-0 text-center">{renderDeckColHeader('W/L', 'record')}</div>
                  <div className="w-[90px] shrink-0 text-center">{renderDeckColHeader('Win Rate', 'winrate')}</div>
                </div>
              </div>

              {/* Virtualized Rows */}
              <div ref={deckTableParentRef} className="flex-1 overflow-y-auto relative custom-scrollbar">
                {filteredDecks.length === 0 ? (
                  <div className="p-10 text-center text-xs opacity-40 font-mono">No decks match the current filters</div>
                ) : (
                  <div style={{ height: `${deckRowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {deckRowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const d = filteredDecks[virtualRow.index];
                      return (
                        <div
                          key={d.deck_name}
                          onClick={() => setSelectedDeckName(d.deck_name)}
                          className="absolute top-0 left-0 w-full flex items-center gap-3 px-4 border-b transition-colors cursor-pointer hover:bg-white/5"
                          style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                            borderColor: `${palette?.border || '#2A2F3D'}44`,
                          }}
                        >
                          {/* Deck Art + Name (left-aligned) */}
                          <div className="flex-1 min-w-[200px] flex items-center gap-3">
                            {renderDeckArt(d)}
                            <div className="min-w-0">
                              <div className="text-lg font-bold truncate" style={{ color: palette?.accent || '#38BDF8' }}>
                                {d.deck_name}
                              </div>
                            </div>
                          </div>

                          {/* Colors */}
                          <div className="w-[90px] shrink-0 flex justify-center">
                            {renderDeckColorIdentity(d.colors)}
                          </div>

                          {/* Format chips (centered) */}
                          <div className="w-[80px] shrink-0 flex flex-wrap gap-1 justify-center">
                            {(d.formats || []).map((f: any, i: number) => (
                              <span key={i} className="text-[9px] font-mono px-1 py-0.5 rounded bg-black/40 border" style={{ borderColor: palette?.border, color: palette?.subtext }}>
                                {f.format}
                              </span>
                            ))}
                          </div>

                          {/* Games */}
                          <div className="w-[90px] shrink-0 text-center font-mono text-sm font-bold" style={{ color: palette?.text }}>
                            {d.total_matches}
                          </div>

                          {/* W/L */}
                          <div className="w-[90px] shrink-0 text-center font-mono text-sm font-bold" style={{ color: palette?.text }}>
                            {d.wins}/{d.losses}
                          </div>

                          {/* Win Rate */}
                          <div className={`w-[90px] shrink-0 text-center font-mono text-sm font-bold ${parseFloat(d.winrate) >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {d.winrate}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4B: Play Stats */}
        {activeTab === 'deckstats' && (
          <div className="flex-1 border border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3" style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}>
            <BarChart3 className="w-10 h-10 opacity-40" style={{ color: palette?.accent }} />
            <h3 className="text-lg font-bold">Play Stats — Coming Soon</h3>
            <p className="text-xs opacity-60 max-w-sm">Aggregated play statistics will arrive in a future iteration.</p>
          </div>
        )}

        {/* VIEW 5: Match History View */}
        {activeTab === 'matches' && (
          <>
            {/* Top Workspace Header Bar */}
            <div className="flex items-center justify-between gap-4 shrink-0">
              <div>
                <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                  Match History
                </h1>
              </div>

              <div className="flex items-center gap-3">
                {/* Search Filter Input */}
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    type="text"
                    placeholder="Search deck or opponent..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border bg-black/30 focus:outline-none"
                    style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
                  />
                </div>
              </div>
            </div>

            {/* Top Summary KPI Cards */}
            <div className="grid grid-cols-5 gap-4 shrink-0">
              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Total Matches</p>
                  <h3 className="text-2xl font-extrabold font-outfit mt-0.5">{filteredMatches.length}</h3>
                </div>
                <BarChart3 className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Winrate</p>
                  <h3 className="text-2xl font-extrabold font-outfit mt-0.5" style={{ color: palette?.accent || '#38BDF8' }}>{winrateVal}%</h3>
                </div>
                <Trophy className="w-6 h-6 opacity-40" style={{ color: palette?.accent }} />
              </div>

              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">W / L Record</p>
                  <h3 className="text-2xl font-extrabold font-outfit mt-0.5">{winsCount} - {lossesCount}</h3>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-400/40" />
              </div>

              {/* Custom Dropdown Component */}
              <div className="p-3.5 rounded-2xl border flex flex-col justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <p className="text-[10px] uppercase font-semibold opacity-60 flex items-center gap-1">
                  <Filter className="w-3 h-3" style={{ color: palette?.accent }} /> Format
                </p>
                <CustomDropdown
                  options={formatOptions}
                  value={formatFilter}
                  onChange={(val) => setFormatFilter(val)}
                  palette={palette}
                />
              </div>

              {/* Time Period Filter Dropdown */}
              <div className="p-3.5 rounded-2xl border flex flex-col justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <p className="text-[10px] uppercase font-semibold opacity-60 flex items-center gap-1">
                  <Clock className="w-3 h-3" style={{ color: palette?.accent }} /> Period
                </p>
                <CustomDropdown
                  options={timeOptions}
                  value={timeFilter}
                  onChange={(val) => setTimeFilter(val)}
                  palette={palette}
                />
              </div>
            </div>

            {/* Virtualized Infinite Scroll Match History Table */}
            <div className="flex-1 rounded-2xl border overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
              {/* Sticky Table Header with Rebalanced Column Layout */}
              <div className="sticky top-0 z-10 border-b backdrop-blur-md" style={{ backgroundColor: `${palette?.mantle || '#12141A'}EE`, borderColor: palette?.border || '#2A2F3D' }}>
                <div className="flex items-center uppercase text-sm font-semibold py-3 px-4 gap-2" style={{ color: palette?.subtext }}>
                  <div className="w-[160px] shrink-0">Date</div>
                  <div className="w-[80px] shrink-0">Result</div>
                  <div className="w-[95px] shrink-0">Format</div>
                  {showColorsCol && <div className="w-[65px] shrink-0">Colors</div>}
                  <div className="flex-1 min-w-[160px] truncate">Deck Name</div>
                  <div className="w-[150px] shrink-0 truncate">Opponent</div>
                  {showCurveCol && <div className="w-[120px] shrink-0">Mana Curve</div>}
                </div>
              </div>

              {/* Virtualized Infinite Scroll Container */}
              <div ref={parentRef} className="flex-1 overflow-y-auto relative">
                <div 
                  style={{ 
                    height: `${rowVirtualizer.getTotalSize()}px`, 
                    width: '100%', 
                    position: 'relative' 
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const m = filteredMatches[virtualRow.index];
                    return (
                      <div
                        key={m.match_id}
                        onClick={() => {
                          setSelectedMatchId(m.match_id);
                          setIsDrawerOpenManual(true);
                        }}
                        className={`absolute top-0 left-0 w-full flex items-center text-base py-2 px-4 gap-2 border-b transition-colors cursor-pointer hover:bg-white/5 ${
                          selectedMatchId === m.match_id ? 'bg-white/10' : ''
                        }`}
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          borderColor: `${palette?.border || '#2A2F3D'}44`,
                        }}
                      >
                        {/* 1. Date: 160px */}
                        <div className="w-[160px] shrink-0 opacity-60 font-mono text-sm truncate">
                          {formatDateShort(m.timestamp)}
                        </div>

                        {/* 2. Result: 80px */}
                        <div className="w-[80px] shrink-0">
                          {m.result === 'win' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> WIN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              <XCircle className="w-3 h-3" /> LOSS
                            </span>
                          )}
                        </div>

                        {/* 3. Format: 95px */}
                        <div className="w-[95px] shrink-0 font-semibold truncate">
                          <span className="px-2 py-0.5 rounded text-sm font-mono border bg-black/40" style={{ borderColor: palette?.border }}>
                            {m.format_name}
                          </span>
                        </div>

                        {/* 4. Colors: 65px (2-row wrapped for 5-color decks) */}
                        {showColorsCol && (
                          <div className="w-[65px] shrink-0 overflow-hidden">
                            {renderDeckColorIdentity(m.deck_colors)}
                          </div>
                        )}

                        {/* 5. Deck Name: flex-1 (+4 points) */}
                        <div className="flex-1 min-w-[160px] font-bold text-lg truncate" style={{ color: palette?.accent || '#38BDF8' }}>
                          {m.player_deck_name}
                        </div>

                        {/* 6. Opponent Name: 150px */}
                        <div className="w-[150px] shrink-0 font-medium opacity-80 truncate">
                          {m.opponent_name || 'Opponent'}
                        </div>

                        {/* 7. Mana Curve: 120px */}
                        {showCurveCol && (
                          <div className="w-[120px] shrink-0">
                            {renderManaHistogram(m.mana_curve)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Edge-of-Screen Chevron Toggle for Drawer */}
        {!isDrawerOpen && (
          <button
            onClick={() => setIsDrawerOpenManual(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-30 p-2 rounded-l-xl border-l border-t border-b shadow-2xl transition-all hover:pr-3 group"
            style={{
              backgroundColor: palette?.surface || '#1A1D24',
              borderColor: palette?.border || '#2A2F3D',
              color: palette?.accent || '#38BDF8',
            }}
            title="Open Inspector Drawer"
          >
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}
      </main>

      {/* COLUMN 3: Lightweight Key Match Stats Summary Drawer */}
      <aside 
        className={`h-full border-l p-5 flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out ${
          isDrawerOverlay 
            ? 'fixed right-0 top-0 bottom-0 z-40 shadow-2xl backdrop-blur-xl' 
            : 'relative z-20'
        } ${isDrawerOpen ? 'w-[432px] translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0 p-0 border-none pointer-events-none'}`}
        style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
      >
        <div className="flex flex-col flex-1 space-y-4 overflow-y-auto pr-0.5 custom-scrollbar">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: palette?.border }}>
            <p className="flex-1 text-2xl font-black font-outfit uppercase tracking-wide text-center" style={{ color: palette?.text }}>Key Match Stats</p>
            <button 
              onClick={() => setIsDrawerOpenManual(false)}
              className="text-xs font-mono opacity-60 hover:opacity-100 p-1.5 rounded-lg border hover:bg-white/5"
              style={{ borderColor: palette?.border }}
              title="Close Drawer"
            >
              ✕
            </button>
          </div>

          {selectedMatch && (
            <div className="space-y-4">
              {/* 2. Fighting-Game-Style VS Header */}
              <div className="p-4 rounded-2xl border text-center space-y-2.5 shadow-lg" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                {/* Player deck name with colors inline */}
                <div className="flex items-center justify-center gap-2">
                  <button 
                    onClick={() => setActiveTab('decks')}
                    className="text-lg font-extrabold font-outfit uppercase tracking-wide truncate hover:underline cursor-pointer text-center max-w-[60%]" 
                    style={{ color: palette?.accent || '#38BDF8' }}
                    title="View Deck Details"
                  >
                    {selectedMatch.player_deck_name}
                  </button>
                  <span className="shrink-0">{renderDeckColorIdentity(selectedMatch.deck_colors)}</span>
                </div>

                <p className="text-sm font-mono font-bold opacity-40">VS</p>

                {/* Opponent name with colors inline */}
                <div className="flex items-center justify-center gap-2">
                  <button 
                    onClick={() => {
                      setTargetOpponentName(selectedMatch.opponent_name || 'Opponent');
                      setIsH2HOpen(true);
                    }}
                    className="text-base font-bold font-outfit uppercase tracking-wide truncate hover:underline cursor-pointer text-center max-w-[60%]" 
                    style={{ color: palette?.text }}
                    title="View Opponent Head-to-Head Stats"
                  >
                    {selectedMatch.opponent_name || 'Opponent'}
                  </button>
                  <span className="shrink-0">{renderDeckColorIdentity(selectedMatch.opponent_colors)}</span>
                </div>

                {/* Victory / Defeat Status Banner with reason underneath */}
                <div className="pt-1 flex flex-col items-center justify-center space-y-1">
                  {selectedMatch.result === 'win' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-4 h-4" /> VICTORY
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      <XCircle className="w-4 h-4" /> DEFEAT
                    </span>
                  )}
                  <span className={`text-xs font-mono font-semibold ${selectedMatch.result === 'win' ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                    {matchReason(selectedMatch)}
                  </span>
                  {/* Deck Win Streak (moved up under the result) */}
                  <span className="text-[10px] font-mono opacity-60">
                    {deckStreak ? (
                      `${deckStreak.count}${deckStreak.count === 1 ? 'st' : deckStreak.count === 2 ? 'nd' : deckStreak.count === 3 ? 'rd' : 'th'} ${deckStreak.type.toUpperCase()} STREAK`
                    ) : (
                      '1st Game'
                    )}
                  </span>
                </div>
              </div>

              {/* 3+4. Combined Player vs Opponent: label, commander (Brawl), then stats */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Player Column */}
                <div className="p-3.5 rounded-2xl border space-y-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-xs uppercase font-bold text-emerald-400 font-mono">Player</p>

                  {/* Player Commander (Brawl Only) */}
                  {selectedMatch.format_name.toUpperCase() === 'BRAWL' && (
                    <div className="text-center space-y-1">
                      {commanderInfo?.player_commander ? (
                        <>
                          <img 
                            src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderInfo.player_commander.name)}&format=image&version=art_crop`}
                            alt={commanderInfo.player_commander.name}
                            className="w-full h-20 object-cover rounded-lg border border-white/10"
                          />
                          <p className="text-xs font-bold truncate" style={{ color: palette?.text }}>{commanderInfo.player_commander.name}</p>
                        </>
                      ) : (
                        <div className="h-20 rounded-lg border border-dashed flex items-center justify-center text-[11px] opacity-40 font-mono" style={{ borderColor: palette?.border }}>
                          No Cmdr
                        </div>
                      )}
                    </div>
                  )}

                  {/* Player Stats */}
                  <div className="space-y-1.5">
                    <div>
                      <span className="opacity-50 text-[11px]">Order: </span>
                      <span className="font-bold text-amber-400">{selectedMatch.going_first ? 'Play (1st)' : 'Draw (2nd)'}</span>
                    </div>
                    <div>
                      <span className="opacity-50 text-[11px]">Mulligans: </span>
                      <span className="font-bold font-mono">{selectedMatch.player_mulligans ?? 0}</span>
                    </div>
                    <div>
                      <span className="opacity-50 text-[11px]">End HP: </span>
                      <span className="font-bold text-emerald-400 font-mono">{selectedMatch.player_life_end ?? 20} HP</span>
                    </div>
                  </div>

                  {/* Player Cards Played */}
                  <div className="pt-1">
                    <p className="text-[10px] uppercase opacity-50 mb-1">Cards Played</p>
                    <span className="font-mono text-sm font-bold">{selectedMatchCards.filter(c => !c.is_opponent).reduce((acc, c) => acc + c.count, 0)} Cards</span>
                  </div>
                </div>

                {/* Opponent Column */}
                <div className="p-3.5 rounded-2xl border space-y-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-xs uppercase font-bold text-rose-400 font-mono">Opponent</p>

                  {/* Opponent Commander (Brawl Only) */}
                  {selectedMatch.format_name.toUpperCase() === 'BRAWL' && (
                    <div className="text-center space-y-1">
                      {commanderInfo?.opponent_commander ? (
                        <>
                          <img 
                            src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderInfo.opponent_commander.name)}&format=image&version=art_crop`}
                            alt={commanderInfo.opponent_commander.name}
                            className="w-full h-20 object-cover rounded-lg border border-white/10"
                          />
                          <p className="text-xs font-bold truncate" style={{ color: palette?.text }}>{commanderInfo.opponent_commander.name}</p>
                        </>
                      ) : (
                        <div className="h-20 rounded-lg border border-dashed flex flex-col items-center justify-center text-[10px] opacity-40 font-mono px-1 text-center" style={{ borderColor: palette?.border }}>
                          <span>Uncast /</span>
                          <span>Unknown</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Opponent Stats */}
                  <div className="space-y-1.5">
                    <div>
                      <span className="opacity-50 text-[11px]">Order: </span>
                      <span className="font-bold text-amber-400">{selectedMatch.going_first ? 'Draw (2nd)' : 'Play (1st)'}</span>
                    </div>
                    <div>
                      <span className="opacity-50 text-[11px]">Mulligans: </span>
                      <span className="font-bold font-mono">{selectedMatch.opponent_mulligans ?? 0}</span>
                    </div>
                    <div>
                      <span className="opacity-50 text-[11px]">End HP: </span>
                      <span className="font-bold text-rose-400 font-mono">{selectedMatch.opponent_life_end ?? 0} HP</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <p className="text-[10px] uppercase opacity-50 mb-1">Cards Seen</p>
                    <span className="font-mono text-sm font-bold">{selectedMatchCards.filter(c => c.is_opponent).reduce((acc, c) => acc + c.count, 0)} Cards</span>
                  </div>
                </div>
              </div>

              {/* Impactful Cards Played: full-size card carousel with player attribution */}
              <div className="p-3.5 rounded-2xl border space-y-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <p className="text-xs font-mono uppercase tracking-wider font-bold opacity-60 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: palette?.accent }} /> Impactful Cards Played
                </p>
                {impactfulCards.length === 0 ? (
                  <div className="p-4 border border-dashed rounded-xl text-center text-[10px] font-mono opacity-40" style={{ borderColor: palette?.border }}>
                    No impactful plays detected
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const card = impactfulCards[Math.min(impactfulIndex, impactfulCards.length - 1)];
                      const byOpponent = card.is_opponent;
                      return (
                        <div className="space-y-1.5">
                          {/* Card image with green (player) / red (opponent) border (90% width) */}
                          <div className="mx-auto w-[90%]">
                            <div className={`rounded-xl overflow-hidden border-2 ${byOpponent ? 'border-rose-500/70' : 'border-emerald-500/70'}`}>
                              <img
                                src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=normal`}
                                alt={card.name}
                                className="w-full h-auto object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          </div>
                          {/* Below the card: just "Player" or "Opponent" */}
                          <div className={`text-sm font-mono font-bold uppercase tracking-widest text-center ${byOpponent ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {byOpponent ? 'Opponent' : 'Player'}
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold truncate" style={{ color: palette?.text }}>{card.name}</span>
                            <span className="text-[10px] font-mono opacity-60 shrink-0 ml-2">
                              {card.total_damage > 0 ? `${card.total_damage} dmg` : (card.max_hit > 0 ? `${card.max_hit} swing` : '')}
                            </span>
                          </div>
                          {/* Carousel dots */}
                          {impactfulCards.length > 1 && (
                            <div className="flex items-center justify-center gap-1 pt-0.5">
                              {impactfulCards.map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => setImpactfulIndex(i)}
                                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === impactfulIndex ? 'bg-white/80 w-3' : 'bg-white/25 hover:bg-white/50'}`}
                                  aria-label={`Card ${i + 1}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom-anchored: Open Full Match Info button (always visible at bottom, scrolls under) */}
        {selectedMatch && (
          <div className="pt-4 border-t mt-4 shrink-0" style={{ borderColor: `${palette?.border}66` }}>
            <button
              onClick={() => setIsFullInfoOpen(true)}
              className="w-full box-border py-4 px-3 rounded-xl font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl border transition-all hover:bg-white/10 truncate"
              style={{
                backgroundColor: palette?.accent || '#38BDF8',
                color: '#000000',
                borderColor: palette?.accent || '#38BDF8',
              }}
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span className="truncate">Open Full Match Info</span>
            </button>
          </div>
        )}
      </aside>

      {/* Dark Overlay Backdrop */}
      {isDrawerOverlay && isDrawerOpen && (
        <div 
          onClick={() => setIsDrawerOpenManual(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity"
        />
      )}

      {/* Deck Detail Modal (overlay, browser-style back) */}
      <DeckDetailView
        isOpen={!!selectedDeckName}
        deckName={selectedDeckName || ''}
        detail={deckDetail}
        palette={palette}
        onBack={() => setSelectedDeckName(null)}
        onSelectMatch={(matchId) => {
          setSelectedMatchId(matchId);
          setIsFullInfoOpen(true);
        }}
        onViewAll={() => {
          setSelectedDeckName(null);
          setDeckSearch(deckDetail?.deck_name || '');
          setActiveTab('matches');
        }}
        onDeckListImported={async () => {
          // Refresh deck detail (charts follow the True Decklist now).
          if (!selectedDeckName) return;
          try {
            const detail = await invoke<any>('get_deck_detail', { deckName: selectedDeckName });
            setDeckDetail(detail);
          } catch (e) {
            console.error('Failed to refresh deck detail after import:', e);
          }
        }}
        formatDateShort={formatDateShort}
      />

      {/* Stage 5B: Full Match Info Overlay Modal */}
      <FullMatchInfoModal
        isOpen={isFullInfoOpen}
        onClose={() => setIsFullInfoOpen(false)}
        selectedMatch={selectedMatch}
        cards={selectedMatchCards}
        commanderInfo={commanderInfo}
        palette={palette}
        impactfulGrpIds={new Set(impactfulCards.map((c) => c.grp_id))}
        onSelectDeck={(deckName) => {
          setIsFullInfoOpen(false);
          setActiveTab('decks');
        }}
        onSelectOpponent={(oppName) => {
          setIsFullInfoOpen(false);
          setTargetOpponentName(oppName);
          setIsH2HOpen(true);
        }}
      />

      {/* Stage 5D: Opponent Head-to-Head Statistics Modal */}
      <OpponentH2HModal
        isOpen={isH2HOpen}
        onClose={() => setIsH2HOpen(false)}
        opponentName={targetOpponentName}
        palette={palette}
        onSelectMatch={(matchId) => {
          setSelectedMatchId(matchId);
          setIsDrawerOpenManual(true);
        }}
      />
    </div>
  );
}
