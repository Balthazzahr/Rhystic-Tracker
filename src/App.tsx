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
  duration_seconds: number;
  turns: number;
  going_first: boolean;
  player_deck_name: string;
  player_commander_id?: number;
  player_life_end?: number;
  opponent_name?: string;
  opponent_commander_id?: number;
  opponent_mulligans?: number;
  opponent_life_end?: number;
  mana_curve?: number[];
  deck_colors?: string[];
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
  const [activeTab, setActiveTab] = useState<'matches' | 'live' | 'decks' | 'draft' | 'collection' | 'settings'>('matches');
  const [searchTerm, setSearchTerm] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('ALL');
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
          const commanderInfoRes = await invoke<{ player_commander: any; opponent_commander: any }>('get_match_commanders', {
            matchId: selectedMatchId
          });
          setCommanderInfo(commanderInfoRes);
        }
      } catch (e) {
        console.error('Failed to fetch match cards:', e);
      }
    };
    fetchMatchCards();
  }, [selectedMatchId, matches]);

  const [liveMatchState, setLiveMatchState] = useState<{
    status: string;
    match_id?: string;
    turn?: number;
    player_life?: number;
    opponent_life?: number;
    last_event?: string;
  } | null>(null);

  useEffect(() => {
    loadTheme(activeThemeId);
    loadData();

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
            player_life: liveState.player_life ?? 20,
            opponent_life: liveState.opponent_life ?? 20,
            last_event: liveState.last_event
          });
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
    return matches.filter(m => {
      const matchesSearch = 
        m.player_deck_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.format_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.opponent_name && m.opponent_name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesFormat = formatFilter === 'ALL' || m.format_name.toUpperCase() === formatFilter.toUpperCase();
      const matchesResult = resultFilter === 'ALL' || m.result.toLowerCase() === resultFilter.toLowerCase();

      return matchesSearch && matchesFormat && matchesResult;
    });
  }, [matches, searchTerm, formatFilter, resultFilter]);

  // Aggregate stats over full dataset
  const winsCount = useMemo(() => matches.filter(m => m.result === 'win').length, [matches]);
  const lossesCount = useMemo(() => matches.filter(m => m.result === 'loss').length, [matches]);
  const winrateVal = matches.length > 0 ? ((winsCount / matches.length) * 100).toFixed(1) : '0.0';

  // Table Virtualization Container Reference
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredMatches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Exact row height: 64px
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
    { id: 'decks', label: 'Decks & Stats', icon: Layers },
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

  const renderManaHistogram = (curve?: number[]) => {
    const bins = curve || [0, 0, 0, 0, 0, 0, 0];
    const maxVal = Math.max(...bins, 1);
    return (
      <div className="flex items-end gap-1 h-6 w-20 px-1 py-0.5 rounded bg-black/40 border border-white/5" title={`Mana Curve Bins (1..7+): ${bins.join(', ')}`}>
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
                  className={`w-full flex items-center justify-between py-3 rounded-xl font-medium text-sm transition-all ${
                    isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5'
                  }`}
                  style={{
                    backgroundColor: isActive ? `${palette?.accent || '#38BDF8'}1F` : 'transparent',
                    color: isActive ? (palette?.accent || '#38BDF8') : (palette?.text || '#F8FAFC'),
                    borderLeft: !isSidebarCollapsed && isActive ? `4px solid ${palette?.accent || '#38BDF8'}` : '4px solid transparent',
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
                  Turn {liveMatchState.turn || 1} • Your HP: {liveMatchState.player_life ?? 20} • Opp HP: {liveMatchState.opponent_life ?? 20}
                  {liveMatchState.last_event ? ` • ${liveMatchState.last_event}` : ''}
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
                  <h3 className="text-lg font-bold font-outfit uppercase tracking-wide">Live Gameplay Tracker</h3>
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
              <div className="grid grid-cols-3 gap-6 flex-1 items-center">
                {/* Player Status */}
                <div className="p-6 rounded-2xl border bg-black/40 text-center space-y-2" style={{ borderColor: palette?.border }}>
                  <span className="text-xs font-mono uppercase opacity-60">Your Life</span>
                  <div className="text-4xl font-black text-emerald-400 font-mono">{liveMatchState.player_life ?? 20} HP</div>
                </div>

                {/* Turn Status */}
                <div className="p-6 rounded-2xl border bg-black/40 text-center space-y-2" style={{ borderColor: palette?.border }}>
                  <span className="text-xs font-mono uppercase opacity-60">Current Turn</span>
                  <div className="text-4xl font-black font-mono" style={{ color: palette?.accent }}>Turn {liveMatchState.turn ?? 1}</div>
                  {liveMatchState.last_event && (
                    <span className="text-[10px] font-mono opacity-60 block truncate">Last: {liveMatchState.last_event}</span>
                  )}
                </div>

                {/* Opponent Status */}
                <div className="p-6 rounded-2xl border bg-black/40 text-center space-y-2" style={{ borderColor: palette?.border }}>
                  <span className="text-xs font-mono uppercase opacity-60">Opponent Life</span>
                  <div className="text-4xl font-black text-rose-400 font-mono">{liveMatchState.opponent_life ?? 20} HP</div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                <Sparkles className="w-8 h-8 animate-bounce" style={{ color: palette?.accent }} />
                <p className="text-xs font-mono">Launch a match in MTGA — Rhystic Tracker will automatically display live turn numbers, life totals, and played cards here in real time!</p>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: Decks & Stats */}
        {activeTab === 'decks' && (
          <div className="flex-1 border border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3" style={{ borderColor: palette?.border, backgroundColor: palette?.surface }}>
            <Layers className="w-10 h-10 opacity-40" style={{ color: palette?.accent }} />
            <h3 className="text-lg font-bold">Deck Performance & Stats</h3>
            <p className="text-xs opacity-60 max-w-sm">Aggregated deck winrates and archetype breakdown from rhystic.db...</p>
          </div>
        )}

        {/* VIEW 5: Match History View */}
        {activeTab === 'matches' && (
          <>
            {/* Top Workspace Header Bar */}
            <div className="flex items-center justify-between gap-4 shrink-0">
              <div>
                <h1 className="text-xl font-bold font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
                  Match History — Recent Games
                </h1>
                <p className="text-xs opacity-60">Showing {filteredMatches.length} of {matchCount} recorded matches from rhystic.db</p>
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
            <div className="grid grid-cols-4 gap-4 shrink-0">
              <div className="p-4 rounded-2xl border flex items-center justify-between shadow-lg" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">Total Matches</p>
                  <h3 className="text-2xl font-extrabold font-outfit mt-0.5">{matches.length}</h3>
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
                  <Filter className="w-3 h-3" style={{ color: palette?.accent }} /> Format Filter
                </p>
                <CustomDropdown
                  options={formatOptions}
                  value={formatFilter}
                  onChange={(val) => setFormatFilter(val)}
                  palette={palette}
                />
              </div>
            </div>

            {/* Virtualized Infinite Scroll Match History Table */}
            <div className="flex-1 rounded-2xl border overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}>
              {/* Sticky Table Header with Rebalanced Column Layout */}
              <div className="sticky top-0 z-10 border-b backdrop-blur-md" style={{ backgroundColor: `${palette?.mantle || '#12141A'}EE`, borderColor: palette?.border || '#2A2F3D' }}>
                <div className="flex items-center uppercase text-[10px] font-semibold py-3 px-4 gap-2" style={{ color: palette?.subtext }}>
                  <div className="w-[140px] shrink-0">Date</div>
                  <div className="w-[70px] shrink-0">Result</div>
                  <div className="w-[85px] shrink-0">Format</div>
                  {showColorsCol && <div className="w-[60px] shrink-0">Colors</div>}
                  <div className="flex-1 min-w-[160px] truncate">Deck Name</div>
                  <div className="w-[130px] shrink-0 truncate">Opponent</div>
                  {showCurveCol && <div className="w-[100px] shrink-0">Mana Curve</div>}
                  <div className="w-[50px] shrink-0 text-right">Turns</div>
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
                        className={`absolute top-0 left-0 w-full flex items-center text-xs py-2 px-4 gap-2 border-b transition-colors cursor-pointer hover:bg-white/5 ${
                          selectedMatchId === m.match_id ? 'bg-white/10' : ''
                        }`}
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          borderColor: `${palette?.border || '#2A2F3D'}44`,
                        }}
                      >
                        {/* 1. Date: 140px */}
                        <div className="w-[140px] shrink-0 opacity-60 font-mono text-[11px] truncate">
                          {isShortDate ? m.date_str.split(' ')[0] : m.date_str}
                        </div>

                        {/* 2. Result: 70px */}
                        <div className="w-[70px] shrink-0">
                          {m.result === 'win' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-2.5 h-2.5" /> WIN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                              <XCircle className="w-2.5 h-2.5" /> LOSS
                            </span>
                          )}
                        </div>

                        {/* 3. Format: 85px */}
                        <div className="w-[85px] shrink-0 font-semibold truncate">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono border bg-black/40" style={{ borderColor: palette?.border }}>
                            {m.format_name}
                          </span>
                        </div>

                        {/* 4. Colors: 60px (2-row wrapped for 5-color decks) */}
                        {showColorsCol && (
                          <div className="w-[60px] shrink-0 overflow-hidden">
                            {renderDeckColorIdentity(m.deck_colors)}
                          </div>
                        )}

                        {/* 5. Deck Name: flex-1 */}
                        <div className="flex-1 min-w-[160px] font-bold truncate" style={{ color: palette?.accent || '#38BDF8' }}>
                          {m.player_deck_name}
                        </div>

                        {/* 6. Opponent Name: 130px */}
                        <div className="w-[130px] shrink-0 font-medium opacity-80 truncate">
                          {m.opponent_name || 'Opponent'}
                        </div>

                        {/* 7. Mana Curve: 100px */}
                        {showCurveCol && (
                          <div className="w-[100px] shrink-0">
                            {renderManaHistogram(m.mana_curve)}
                          </div>
                        )}

                        {/* 8. Turns: 50px */}
                        <div className="w-[50px] shrink-0 text-right font-mono text-xs opacity-70">
                          {m.turns}
                        </div>
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
        } ${isDrawerOpen ? 'w-[360px] translate-x-0 opacity-100' : 'w-0 translate-x-full opacity-0 p-0 border-none pointer-events-none'}`}
        style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
      >
        <div className="flex flex-col flex-1 space-y-4 overflow-y-auto pr-0.5 custom-scrollbar">
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: palette?.border }}>
            <p className="text-[10px] font-mono uppercase tracking-wider font-bold" style={{ color: palette?.accent }}>Key Match Stats</p>
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
              <div className="p-4 rounded-2xl border text-center space-y-2 shadow-lg" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <div className="space-y-1">
                  <button 
                    onClick={() => setActiveTab('decks')}
                    className="text-base font-extrabold font-outfit uppercase tracking-wide truncate hover:underline cursor-pointer block w-full text-center" 
                    style={{ color: palette?.accent || '#38BDF8' }}
                    title="View Deck Details"
                  >
                    {selectedMatch.player_deck_name}
                  </button>
                  <p className="text-xs font-mono font-bold opacity-40">VS</p>
                  <button 
                    onClick={() => {
                      setTargetOpponentName(selectedMatch.opponent_name || 'Opponent');
                      setIsH2HOpen(true);
                    }}
                    className="text-sm font-bold font-outfit uppercase tracking-wide truncate hover:underline cursor-pointer block w-full text-center" 
                    style={{ color: palette?.text }}
                    title="View Opponent Head-to-Head Stats"
                  >
                    {selectedMatch.opponent_name || 'Opponent'}
                  </button>
                </div>

                {/* Victory / Defeat Status Banner */}
                <div className="pt-1 flex items-center justify-center">
                  {selectedMatch.result === 'win' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-4 h-4" /> VICTORY
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      <XCircle className="w-4 h-4" /> DEFEAT
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Commander Cards Side-by-Side (Brawl Matches Only) */}
              {selectedMatch.format_name.toUpperCase() === 'BRAWL' && (
                <div className="p-3 rounded-2xl border space-y-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-60">Commanders</p>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Player Commander */}
                    <div className="p-2 rounded-xl border bg-black/40 text-center space-y-1" style={{ borderColor: palette?.border }}>
                      <p className="text-[9px] font-mono opacity-50 uppercase">Player</p>
                      {commanderInfo?.player_commander ? (
                        <>
                          <img 
                            src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderInfo.player_commander.name)}&format=image&version=art_crop`}
                            alt={commanderInfo.player_commander.name}
                            className="w-full h-20 object-cover rounded-lg border border-white/10"
                          />
                          <p className="text-[11px] font-bold truncate" style={{ color: palette?.text }}>{commanderInfo.player_commander.name}</p>
                        </>
                      ) : (
                        <div className="h-20 rounded-lg border border-dashed flex items-center justify-center text-[10px] opacity-40 font-mono" style={{ borderColor: palette?.border }}>
                          No Cmdr
                        </div>
                      )}
                    </div>

                    {/* Opponent Commander */}
                    <div className="p-2 rounded-xl border bg-black/40 text-center space-y-1" style={{ borderColor: palette?.border }}>
                      <p className="text-[9px] font-mono opacity-50 uppercase">Opponent</p>
                      {commanderInfo?.opponent_commander ? (
                        <>
                          <img 
                            src={`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderInfo.opponent_commander.name)}&format=image&version=art_crop`}
                            alt={commanderInfo.opponent_commander.name}
                            className="w-full h-20 object-cover rounded-lg border border-white/10"
                          />
                          <p className="text-[11px] font-bold truncate" style={{ color: palette?.text }}>{commanderInfo.opponent_commander.name}</p>
                        </>
                      ) : (
                        <div className="h-20 rounded-lg border border-dashed flex flex-col items-center justify-center text-[9px] opacity-40 font-mono px-1 text-center" style={{ borderColor: palette?.border }}>
                          <span>Uncast /</span>
                          <span>Unknown</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Side-by-Side Equal-Weight Player vs Opponent Stats */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Player Stat Panel */}
                <div className="p-3 rounded-2xl border space-y-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-[10px] uppercase font-bold text-emerald-400 font-mono">Player Stats</p>
                  <div className="space-y-1">
                    <div>
                      <span className="opacity-50 text-[10px]">End HP: </span>
                      <span className="font-bold text-emerald-400 font-mono">{selectedMatch.player_life_end ?? 20} HP</span>
                    </div>
                    <div>
                      <span className="opacity-50 text-[10px]">Order: </span>
                      <span className="font-bold text-amber-400">{selectedMatch.going_first ? 'Play (1st)' : 'Draw (2nd)'}</span>
                    </div>
                  </div>

                  {/* 5A. Player Mana Curve Mini-Chart */}
                  <div className="pt-1">
                    <p className="text-[9px] uppercase opacity-50 mb-1">Mana Curve</p>
                    {renderManaHistogram(selectedMatch.mana_curve)}
                  </div>
                </div>

                {/* Opponent Stat Panel */}
                <div className="p-3 rounded-2xl border space-y-2" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                  <p className="text-[10px] uppercase font-bold text-rose-400 font-mono">Opponent Stats</p>
                  <div className="space-y-1">
                    <div>
                      <span className="opacity-50 text-[10px]">End HP: </span>
                      <span className="font-bold text-rose-400 font-mono">{selectedMatch.opponent_life_end ?? 0} HP</span>
                    </div>
                    <div>
                      <span className="opacity-50 text-[10px]">Mulligans: </span>
                      <span className="font-bold font-mono">{selectedMatch.opponent_mulligans ?? 0}</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <p className="text-[9px] uppercase opacity-50 mb-1">Cards Seen</p>
                    <span className="font-mono text-xs font-bold">{selectedMatchCards.filter(c => c.is_opponent).reduce((acc, c) => acc + c.count, 0)} Cards</span>
                  </div>
                </div>
              </div>

              {/* Match Details Bar: Format, Deck Colors, and Deck Win/Loss Streak */}
              <div className="p-3 rounded-2xl border space-y-2 text-xs" style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}>
                <div className="flex items-center justify-between">
                  <span className="opacity-60 text-[10px] uppercase font-semibold">Deck Color Identity</span>
                  {renderDeckColorIdentity(selectedMatch.deck_colors)}
                </div>

                <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: `${palette?.border}66` }}>
                  <span className="opacity-60 text-[10px] uppercase font-semibold">Deck Win Streak</span>
                  {deckStreak ? (
                    <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                      deckStreak.type === 'win' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {deckStreak.count}{deckStreak.count === 1 ? 'st' : deckStreak.count === 2 ? 'nd' : deckStreak.count === 3 ? 'rd' : 'th'} {deckStreak.type.toUpperCase()} STREAK
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] opacity-40">1st Game</span>
                  )}
                </div>
              </div>

              {/* 6. Fixed Sized "Open Full Match Info" Action Button */}
              <div className="pt-1">
                <button
                  onClick={() => setIsFullInfoOpen(true)}
                  className="w-full box-border py-3 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl border transition-all hover:bg-white/10 truncate"
                  style={{
                    backgroundColor: palette?.accent || '#38BDF8',
                    color: '#000000',
                    borderColor: palette?.accent || '#38BDF8',
                  }}
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span className="truncate">Open Full Match Info</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Dark Overlay Backdrop */}
      {isDrawerOverlay && isDrawerOpen && (
        <div 
          onClick={() => setIsDrawerOpenManual(false)}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 transition-opacity"
        />
      )}

      {/* Stage 5B: Full Match Info Overlay Modal */}
      <FullMatchInfoModal
        isOpen={isFullInfoOpen}
        onClose={() => setIsFullInfoOpen(false)}
        selectedMatch={selectedMatch}
        cards={selectedMatchCards}
        commanderInfo={commanderInfo}
        palette={palette}
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
