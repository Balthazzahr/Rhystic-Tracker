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
  Clock,
  X,
  LayoutDashboard,
  Table2,
  LayoutGrid,
  Trash2,
  ZoomIn,
  ZoomOut,
  PanelLeftClose,
  PanelLeftOpen,
  Award,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ManaPip } from './components/ManaPip';
import { ManaFontPip } from './components/ManaFontPip';
import { parseMtgaManaCost } from './utils/manaUtils';
import { getCardStylePref, setCardStylePref } from './utils/cardStylePrefs';
import { SettingsView } from './components/SettingsView';
import { CustomDropdown } from './components/CustomDropdown';
import { CardItem } from './components/CardBreakdown';
import { HoverArtPreview } from './components/HoverArtPreview';
import { FullMatchInfoModal } from './components/FullMatchInfoModal';
import { AchievementBadge } from './components/AchievementBadge';
import { OpponentH2HModal } from './components/OpponentH2HModal';
import { DeckDetailView } from './components/DeckDetailView';
import { DashboardView } from './components/DashboardView';
import { CardNameTooltip } from './components/CardNameTooltip';
import { CardImage } from './components/CardImage';
import { CardTrophyCaseModal } from './components/CardTrophyCaseModal';
import { AchievementsView } from './components/AchievementsView';
import { LeaderboardsView } from './components/LeaderboardsView';
import CollectionView from './components/CollectionView';
import { MatchHistoryView } from './components/MatchHistoryView';
import { DeckLibraryView } from './components/DeckLibraryView';
import { LiveHUDView } from './components/LiveHUDView';
import { CardInspectorModal } from './components/CardInspectorModal';
import { FirstTimeSetupWizard } from './components/FirstTimeSetupWizard';
import logoImg from './assets/RhysticTrackerLogo.svg';
import symbolIcon from './assets/RhysticTrackerICON.svg';
import { APP_VERSION } from './version';

// Renders a Nerd Font glyph (from the bundled NerdFontSymbols font) as an
// inline icon. `glyph` is one of the `.nf-*` classes defined in index.css.
const NerdIcon = ({ glyph, className = '', style }: { glyph: string; className?: string; style?: React.CSSProperties }) => (
  <i className={`nf ${glyph} ${className}`} style={style} aria-hidden="true" />
);

const PodiumIcon = ({ className = 'w-4 h-4', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <path d="M4 21v-7h4v7H4z" />
    <path d="M10 21V9h4v12h-4z" />
    <path d="M16 21v-4h4v4h-4z" />
  </svg>
);

const DEFAULT_SIDEBAR_ICONS: Record<string, string> = {
  dashboard: 'ms-ability-party',
  matches: 'ms-battle',
  collection: 'ms-library',
  decks: 'ms-ability-adventure',
  achievements: 'ms-ability-duels-renowned',
  leaderboards: 'ms-ability-kicker',
  live: 'ms-instant',
  settings: 'ms-ability-prototype',
};

// In-memory cache of Scryfall card JSON (keyed by card name) so repeated overlay
// opens don't re-hit the rate-limited API while the app is running.
const scryfallCardCache = new Map<string, any>();

// Normalize MTGA set codes to Scryfall set codes (e.g. DAR -> DOM)
export const normalizeScryfallSetCode = (code?: string | null): string => {
  if (!code) return '';
  const c = code.trim().toLowerCase();
  if (c === 'dar') return 'dom';
  if (c === 'arenasup') return 'spg';
  if (c === 'conf') return 'con';
  return c;
};

// Clean MTGA raw collector number strings (e.g. "'16'" -> "16", "0" -> "")
export const cleanCollectorNumber = (cn?: string | number | null): string => {
  if (cn === undefined || cn === null) return '';
  const s = String(cn).replace(/['"]/g, '').trim();
  return (s === '' || s === '0') ? '' : s;
};

// Key a printing uniquely by set + collector number (the dropdown value).
const printingKey = (p: any) => `${normalizeScryfallSetCode(p.set_code)}|${cleanCollectorNumber(p.collector_number)}`;

// Build the Scryfall image URL for a specific printing. The /cards/{set}/{cn}
// image endpoint resolves to that exact printing; fall back to the named URL
// (newest printing) when set/collector are missing OR the collector number is 0
// (many MTGA cache rows store 0, which Scryfall 404s on).
const scryfallPrintingImageUrl = (name: string, p?: any): string => {
  const setCode = normalizeScryfallSetCode(p?.set_code);
  const cn = cleanCollectorNumber(p?.collector_number);
  if (setCode && cn) {
    return `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(cn)}?format=image&version=normal`;
  }
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
};

export const formatMatchDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '< 1m';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
};

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
  const SIDEBAR_BREAKPOINT = 900;

  // Manual Overrides (sidebar collapse persisted)
  const [isSidebarCollapsedManual, setIsSidebarCollapsedManual] = useState<boolean | null>(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return null;
  });
  useEffect(() => {
    if (isSidebarCollapsedManual !== null) {
      localStorage.setItem('sidebarCollapsed', String(isSidebarCollapsedManual));
    }
  }, [isSidebarCollapsedManual]);

  // Navigation & Filter State: Respect defaultStartupTab from settings, falling back to 'dashboard'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'matches' | 'live' | 'decks' | 'collection' | 'achievements' | 'leaderboards' | 'settings'>(() => {
    const savedDefault = localStorage.getItem('defaultStartupTab');
    if (savedDefault && ['dashboard', 'matches', 'live', 'decks', 'collection', 'achievements', 'leaderboards', 'settings'].includes(savedDefault)) {
      return savedDefault as any;
    }
    return 'dashboard';
  });
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // Sidebar custom MTG icon selections
  const [sidebarIcons, setSidebarIcons] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('sidebarIcons');
      return saved ? { ...DEFAULT_SIDEBAR_ICONS, ...JSON.parse(saved) } : DEFAULT_SIDEBAR_ICONS;
    } catch {
      return DEFAULT_SIDEBAR_ICONS;
    }
  });
  const [showIconPreviewModal, setShowIconPreviewModal] = useState<boolean>(false);

  const updateSidebarIcon = (tabId: string, iconClass: string) => {
    const updated = { ...sidebarIcons, [tabId]: iconClass };
    setSidebarIcons(updated);
    localStorage.setItem('sidebarIcons', JSON.stringify(updated));
  };

  // Deck Box Visual Flair state from Settings
  const [deckBoxFlair, setDeckBoxFlair] = useState(() => {
    return localStorage.getItem('deckBoxFlair') !== 'false';
  });
  useEffect(() => {
    const handleSettingsChange = () => {
      setDeckBoxFlair(localStorage.getItem('deckBoxFlair') !== 'false');
    };
    window.addEventListener('rhystic_settings_changed', handleSettingsChange);
    window.addEventListener('storage', handleSettingsChange);
    return () => {
      window.removeEventListener('rhystic_settings_changed', handleSettingsChange);
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, []);

  // First-launch Splash Screen State (2.0s duration, instant dismiss)
  const [showSplash, setShowSplash] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setShowSplash(false);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // Listen for navigation events from the system tray menu
  useEffect(() => {
    const unlisten = listen<string>('navigate-to-tab', (event) => {
      if (event.payload === 'live' || event.payload === 'dashboard' || event.payload === 'matches' || event.payload === 'decks' || event.payload === 'collection' || event.payload === 'settings') {
        setActiveTab(event.payload as any);
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Environment info (test environment vs production)
  const [envInfo, setEnvInfo] = useState<{ environment: string; is_test: boolean; db_name: string } | null>(null);
  useEffect(() => {
    invoke<any>('get_app_environment')
      .then(info => setEnvInfo(info))
      .catch(err => console.error('Failed to get app environment:', err));
  }, []);

  // First-time Setup Wizard State
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  useEffect(() => {
    invoke<{ setup_completed: boolean; card_count: number }>('get_setup_status')
      .then(status => {
        if (!status.setup_completed) {
          setShowSetupWizard(true);
        }
      })
      .catch(err => console.error('Failed to check setup status:', err));

    const handleOpenWizard = () => setShowSetupWizard(true);
    window.addEventListener('open-setup-wizard', handleOpenWizard);
    return () => window.removeEventListener('open-setup-wizard', handleOpenWizard);
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [matchHistorySearch, setMatchHistorySearch] = useState('');

  // Match Inspection & Real Data State
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatchCards, setSelectedMatchCards] = useState<CardItem[]>([]);
  const [hoveredCard, setHoveredCard] = useState<CardItem | null>(null);
  const [isFullInfoOpen, setIsFullInfoOpen] = useState<boolean>(false);
  const [targetOpponentName, setTargetOpponentName] = useState<string | null>(null);
  const [isH2HOpen, setIsH2HOpen] = useState<boolean>(false);
  const [impactfulCards, setImpactfulCards] = useState<any[]>([]);
  const [impactfulIndex, setImpactfulIndex] = useState<number>(0);
  const [deckOverview, setDeckOverview] = useState<any[]>([]);
  const [selectedDeckName, setSelectedDeckName] = useState<string | null>(null);
  const [deckToDelete, setDeckToDelete] = useState<string | null>(null);
  const [deckDetail, setDeckDetail] = useState<any>(null);
  const [deckCardOverlay, setDeckCardOverlay] = useState<any>(null);
  const [cardTrophyModalOpen, setCardTrophyModalOpen] = useState(false);
  const [overlayPrintings, setOverlayPrintings] = useState<any[]>([]);
  const [overlayPrintingsLoading, setOverlayPrintingsLoading] = useState(false);
  const [overlayStats, setOverlayStats] = useState<any>(null);
  const [overlayScryfall, setOverlayScryfall] = useState<any>(null);
  const [overlayScryfallLoading, setOverlayScryfallLoading] = useState(false);
  const [overlaySelected, setOverlaySelected] = useState<string | null>(null);
  const [overlayImgFailed, setOverlayImgFailed] = useState(false);
  const [overlayImgTriedNamed, setOverlayImgTriedNamed] = useState(false);
  const [overlayFlavors, setOverlayFlavors] = useState<Record<string, string>>({});
  const [collectionRefreshTrigger, setCollectionRefreshTrigger] = useState(0);

  // Open the card overlay, enriching lightweight card refs ({name}/{grp_id})
  // with full metadata (cmc, mana_cost, card_type, set_code, rarity) from the
  // local cards cache so the detail panel always has complete info.
  const openCardOverlay = async (card: any, isCommander: boolean) => {
    const hasMeta =
      card &&
      (card.cmc !== undefined || card.mana_cost !== undefined) &&
      (card.set_code !== undefined || card.rarity !== undefined);
    if (card && !hasMeta) {
      try {
        let meta: any = null;
        if (card.grp_id) {
          meta = await invoke('get_card_info', { grpId: card.grp_id });
        }
        if (!meta && card.name) {
          meta = await invoke('get_card_info_by_name', { name: card.name });
        }
        if (meta) {
          setDeckCardOverlay({ card: { ...card, ...meta }, isCommander });
          return;
        }
      } catch (e) {
        console.error('Failed to enrich card metadata:', e);
      }
    }
    setOverlayImgFailed(false);
    setOverlayImgTriedNamed(false);
    setDeckCardOverlay({ card, isCommander });
  };
  const [deckSearch, setDeckSearch] = useState('');
  const [deckColorFilter, setDeckColorFilter] = useState<string[]>([]);

  // Deck Library view mode: 'cards' (default) or 'table', persisted locally.
  const [deckView, setDeckView] = useState<'cards' | 'table'>(() => {
    const saved = localStorage.getItem('deckLibraryView');
    return saved === 'table' ? 'table' : 'cards';
  });
  const [deckCardSort, setDeckCardSort] = useState<string>(() => localStorage.getItem('deckCardSort') || 'deck_name');
  const [deckCardSortDir, setDeckCardSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('deckCardSortDir') === 'desc' ? 'desc' : 'asc'));
  useEffect(() => {
    localStorage.setItem('deckCardSort', deckCardSort);
    localStorage.setItem('deckCardSortDir', deckCardSortDir);
  }, [deckCardSort, deckCardSortDir]);

  // Deck card size: two levels (small / large) matching the Card Library.
  // Small = fixed landscape footprint; large = fills the grid height with a
  // fixed number of landscape rows, width derived from the ratio.
  const [deckCardSize, setDeckCardSize] = useState<'small' | 'large'>(() => {
    const saved = localStorage.getItem('deckCardSize');
    return saved === 'small' ? 'small' : 'large';
  });
  useEffect(() => {
    localStorage.setItem('deckCardSize', deckCardSize);
  }, [deckCardSize]);
  // Measure the available area of the card grid to derive the card size.
  const cardAreaRef = useRef<HTMLDivElement>(null);
  const [cardArea, setCardArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = cardAreaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCardArea((prev) => {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (prev.w === w && prev.h === h) return prev;
        return { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [deckView, activeTab]);
  // Landscape deck card ratio (wider than tall). Small uses a fixed footprint
  // with DECK_SMALL_ROWS rows; large fills the height with DECK_LARGE_ROWS rows
  // and widens slightly (up to DECK_LARGE_WIDEN) to reduce side padding.
  const DECK_RATIO = 3 / 2;
  const DECK_LARGE_ROWS = 4;
  const DECK_SMALL_ROWS = 6;
  const DECK_GAP = 16;
  const DECK_WRAP_PAD = 0; // grid has no vertical padding
  const DECK_LARGE_HEIGHT_SHRINK = 0.97; // small height reduction (no-overflow margin)
  const DECK_LARGE_WIDEN = 1.15; // allow cards to be up to 15% wider than 3:2
  const deckLargeCardH = cardArea.h > (DECK_LARGE_ROWS - 1) * DECK_GAP + DECK_WRAP_PAD
    ? ((cardArea.h - (DECK_LARGE_ROWS - 1) * DECK_GAP - DECK_WRAP_PAD) / DECK_LARGE_ROWS) * DECK_LARGE_HEIGHT_SHRINK
    : 0;
  const deckLargeCardW = deckLargeCardH > 0
    ? Math.min(deckLargeCardH * DECK_RATIO * DECK_LARGE_WIDEN, deckLargeCardH * DECK_RATIO + 60)
    : 0;
  // Small: fixed 260px wide landscape footprint.
  const deckSmallCardW = 260;
  const deckSmallCardH = Math.round(deckSmallCardW / DECK_RATIO);
  const deckRows = deckCardSize === 'small' ? DECK_SMALL_ROWS : DECK_LARGE_ROWS;
  const deckCardW = deckCardSize === 'small' ? deckSmallCardW : deckLargeCardW;
  const deckCardH = deckCardSize === 'small' ? deckSmallCardH : deckLargeCardH;

  useEffect(() => {
    localStorage.setItem('deckLibraryView', deckView);
  }, [deckView]);

  // Hover state for theme selector preview
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);

  // Workspace Container Width Reference for Container-Based Column Collapsing
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState<number>(1000);

  // Mana Theme Engine State (persisted)
  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    const saved = localStorage.getItem('activeThemeId');
    return ['white', 'blue', 'black', 'red', 'green'].includes(saved || '') ? (saved as string) : 'blue';
  });
  const [palette, setPalette] = useState<ManaTheme | null>(null);

  useEffect(() => {
    localStorage.setItem('activeThemeId', activeThemeId);
  }, [activeThemeId]);

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
      loadDeckOverview();
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

  // Delete a deck: removes its true decklist (if any) and all its match history.
  // Cards stay in the library's collection — only the deck + its matches go.
  const confirmDeleteDeck = async (deleteMatches: boolean) => {
    if (!deckToDelete) return;
    try {
      await invoke('delete_deck', { deckName: deckToDelete, deleteMatches });
      // Close the (possibly open) deck detail, refresh the deck overview, and
      // refresh match history (matches may have been removed for this deck).
      if (selectedDeckName === deckToDelete) setSelectedDeckName(null);
      setDeckToDelete(null);
      await loadDeckOverview();
      await loadData();
    } catch (e) {
      console.error('Failed to delete deck:', e);
      setDeckToDelete(null);
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
    if (!selectedMatchId) {
      setSelectedMatchCards([]);
      setImpactfulCards([]);
      setCommanderInfo(null);
      return;
    }
    // Clear previous match data immediately to prevent card art flash
    setSelectedMatchCards([]);
    setImpactfulCards([]);
    setCommanderInfo(null);

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

  // Close the deck library card overlay with Escape.
  useEffect(() => {
    if (!deckCardOverlay) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDeckCardOverlay(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deckCardOverlay]);

  // Fetch printings + stats (IPC) and Scryfall card JSON whenever the overlay opens.
  useEffect(() => {
    setOverlayPrintings([]);
    setOverlayPrintingsLoading(false);
    setOverlayStats(null);
    setOverlayScryfall(null);
    setOverlayScryfallLoading(false);
    setOverlaySelected(null);
    const name = deckCardOverlay?.card?.name as string | undefined;
    if (!name) return;
    let cancelled = false;

    setOverlayPrintingsLoading(true);
    (async () => {
      try {
        const res = await invoke<any>('get_card_printings', { name });
        if (cancelled) return;
        const printings = res?.printings || [];
        setOverlayPrintings(printings);
        setOverlayStats(res?.stats || null);
        if (printings.length > 0) {
          // Prefer the saved card-style preference; else the newest printing.
          const pref = getCardStylePref(name);
          const prefKey = pref?.setCode && pref?.collectorNumber
            ? `${normalizeScryfallSetCode(pref.setCode)}|${cleanCollectorNumber(pref.collectorNumber)}`
            : null;
          const saved = prefKey
            ? printings.find((p) => printingKey(p) === prefKey)
            : null;
          setOverlaySelected(saved ? printingKey(saved) : (prefKey || printingKey(printings[0])));
        }
        // Fetch flavor text for each printing so it matches the selected art.
        const flavors: Record<string, string> = {};
        for (const p of printings) {
          const key = printingKey(p);
          try {
            const url = p.set_code && p.collector_number
              ? `https://api.scryfall.com/cards/${String(p.set_code).toLowerCase()}/${encodeURIComponent(String(p.collector_number))}?format=json`
              : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=json`;
            const resp = await fetch(url);
            if (resp.ok) {
              const data = await resp.json();
              const face = data.card_faces?.[0] || null;
              const ft = data.flavor_text || face?.flavor_text || '';
              if (ft) flavors[key] = ft;
            }
          } catch (e) {
            // ignore individual printing failures
          }
        }
        if (!cancelled) setOverlayFlavors(flavors);
      } catch (e) {
        console.error('Failed to fetch card printings:', e);
      } finally {
        if (!cancelled) setOverlayPrintingsLoading(false);
      }
    })();

    setOverlayScryfallLoading(true);
    (async () => {
      try {
        let data = scryfallCardCache.get(name);
        if (!data) {
          const resp = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=json`);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          data = await resp.json();
          scryfallCardCache.set(name, data);
        }
        if (!cancelled) setOverlayScryfall(data);
      } catch (e) {
        console.error('Failed to fetch Scryfall card:', e);
      } finally {
        if (!cancelled) setOverlayScryfallLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [deckCardOverlay]);

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
    duration_seconds?: number;
    turns?: number;
    timestamp?: string;
    impactful_cards?: { grp_id: number; name: string; total_damage: number; max_hit: number; damage_combat: number; damage_spell: number }[];
    earned_achievements?: { grp_id: number; card_name: string; title: string; raw_title: string; tier: string }[];
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
          if (!wasActive) {
            wasActive = true;
            if (localStorage.getItem('autoSwitchLiveHud') === 'true') {
              setActiveTab('live');
            }
          }
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
            duration_seconds: liveState.duration_seconds,
            turns: liveState.turns,
            timestamp: liveState.timestamp,
            impactful_cards: (liveState.impactful_cards || []).filter((c: any) => c.max_hit > 8 || c.total_damage > 12),
            earned_achievements: liveState.earned_achievements || [],
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
    if (activeTab === 'decks') {
      loadDeckOverview();
    }
  }, [activeTab]);

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
      } else if (timeFilter === '7D' || timeFilter === 'WEEK') {
        matchesTime = matchDate.getTime() >= now.getTime() - 7 * 86400000;
      } else if (timeFilter === '14D') {
        matchesTime = matchDate.getTime() >= now.getTime() - 14 * 86400000;
      } else if (timeFilter === '30D' || timeFilter === 'MONTH') {
        matchesTime = matchDate.getTime() >= now.getTime() - 30 * 86400000;
      } else if (timeFilter === '12M' || timeFilter === 'YEAR') {
        matchesTime = matchDate.getTime() >= now.getTime() - 365 * 86400000;
      }

      return matchesSearch && matchesFormat && matchesResult && matchesTime;
    });
  }, [matches, searchTerm, formatFilter, resultFilter, timeFilter]);

  // Aggregate stats over the filtered dataset
  const winsCount = useMemo(() => filteredMatches.filter(m => m.result === 'win').length, [filteredMatches]);
  const lossesCount = useMemo(() => filteredMatches.filter(m => m.result === 'loss').length, [filteredMatches]);
  const winrateVal = filteredMatches.length > 0 ? ((winsCount / filteredMatches.length) * 100).toFixed(1) : '0.0';

  // Filtered deck list: by search term, color identity, and sort.
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
      const q = deckSearch.toLowerCase();
      const matchesDeckName = d.deck_name.toLowerCase().includes(q);
      const matchesCommanderSearch = (d.commanders || []).some((c: any) => (c.name || '').toLowerCase().includes(q));
      const matchesSearch = q === '' || matchesDeckName || matchesCommanderSearch;

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

      return matchesSearch && matchesColor;
    });

    const dir = deckCardSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (deckCardSort) {
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
  }, [deckOverview, deckSearch, deckColorFilter, deckCardSort, deckCardSortDir]);

  // Card view uses the same filtered+sorted deck list as the table.
  const sortedCardDecks = filteredDecks;

  // Deck card view pagination: show only rows × cols that fit the grid (no
  // scrolling), and page like the Card Library (incl. mouse wheel).
  const deckCols = cardArea.w > 0 && deckCardW > 0
    ? Math.max(1, Math.floor((cardArea.w + DECK_GAP) / (deckCardW + DECK_GAP)))
    : 1;
  const deckPageSize = deckCols * deckRows;
  const [deckPage, setDeckPage] = useState(1);
  const deckTotalPages = Math.max(1, Math.ceil(sortedCardDecks.length / deckPageSize));
  const safeDeckPage = Math.min(deckPage, deckTotalPages);
  const deckDisplayed = sortedCardDecks.slice((safeDeckPage - 1) * deckPageSize, safeDeckPage * deckPageSize);

  // Reset to page 1 when filters/sort/page-size change.
  const deckPageKey = [
    deckSearch,
    deckColorFilter.join(','),
    deckCardSort,
    deckCardSortDir,
    deckView,
    deckPageSize,
  ].join('|');
  useEffect(() => {
    setDeckPage(1);
  }, [deckPageKey]);

  // Mouse wheel flips the deck card page (scroll down = next, up = prev).
  const deckWheelRef = useRef<HTMLDivElement>(null);
  const deckPageDirRef = useRef<'next' | 'prev'>('next');
  const goDeckPage = (dir: 'next' | 'prev') => {
    deckPageDirRef.current = dir;
    if (dir === 'next') setDeckPage((p) => Math.min(deckTotalPages, p + 1));
    else setDeckPage((p) => Math.max(1, p - 1));
  };
  useEffect(() => {
    const el = deckWheelRef.current;
    if (!el || deckView !== 'cards') return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (lock) return;
      if (deckTotalPages <= 1) return;
      if (Math.abs(e.deltaY) < 10) return;
      e.preventDefault();
      lock = true;
      if (e.deltaY > 0) goDeckPage('next');
      else goDeckPage('prev');
      setTimeout(() => { lock = false; }, 450);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [deckView, deckTotalPages]);

  // Deck page-turn animation: same approach as the Card Library — the grid stays
  // mounted and the animation is replayed via the Web Animations API (cancelling
  // any in-flight one first) so it never double-fires or overlaps.
  const deckGridAnimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = deckGridAnimRef.current;
    if (!el || deckView !== 'cards') return;
    el.getAnimations().forEach((a) => a.cancel());
    const next = deckPageDirRef.current === 'next';
    el.animate(
      [
        { opacity: 0.25, transform: next ? 'translateX(14px)' : 'translateX(-14px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 250, easing: 'ease-out' },
    );
  }, [deckPage, deckView]);

  // Deck table virtualization (separate from the match history virtualizer)
  const deckTableParentRef = useRef<HTMLDivElement>(null);
  const deckRowVirtualizer = useVirtualizer({
    count: filteredDecks.length,
    getScrollElement: () => deckTableParentRef.current,
    estimateSize: () => 92, // Exact row height: 92px
    overscan: 10,
  });

  const toggleDeckSort = (key: string) => {
    if (deckCardSort === key) {
      setDeckCardSortDir(deckCardSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setDeckCardSort(key);
      setDeckCardSortDir('desc');
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
    { id: 'white', label: 'White (Order)', symbol: 'W', color: '#E8E2CC' },
    { id: 'blue', label: 'Blue (Progress)', symbol: 'U', color: '#4A7FA3' },
    { id: 'black', label: 'Black (Ambition)', symbol: 'B', color: '#8a719d' },
    { id: 'red', label: 'Red (Chaos)', symbol: 'R', color: '#B8503A' },
    { id: 'green', label: 'Green (Nature)', symbol: 'G', color: '#4A7856' },
  ];

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', manaIcon: 'ms-ability-party' },
    { id: 'matches', label: 'Match History', manaIcon: 'ms-battle' },
    { id: 'collection', label: 'Card Library', manaIcon: 'ms-library' },
    { id: 'decks', label: 'Deck Library', manaIcon: 'ms-ability-adventure' },
    { id: 'achievements', label: 'Achievements', manaIcon: 'ms-ability-duels-renowned' },
    { id: 'leaderboards', label: 'Leaderboards', manaIcon: 'ms-ability-kicker' },
    { id: 'live', label: 'Live Match HUD', manaIcon: 'ms-instant' },
    { id: 'settings', label: 'Settings', manaIcon: 'ms-ability-prototype' },
  ];

  const formatOptions = useMemo(() => {
    const baseFormats = [
      'Alchemy',
      'Alchemy Ranked',
      'Bot Match',
      'Brawl',
      'Brawl - Competitive',
      'Brawl - Standard',
      'Direct Challenge',
      'Draft',
      'Explorer',
      'Explorer Ranked',
      'Gladiator',
      'Historic',
      'Historic Ranked',
      'Midweek Magic',
      'Pioneer',
      'Pioneer Ranked',
      'Sealed',
      'Standard',
      'Standard Ranked',
      'Timeless',
      'Timeless Ranked',
    ];
    const seen = new Set<string>();
    const formatList: string[] = [];

    // 1. Gather formats present in match history
    for (const m of matches) {
      if (m.format_name && !seen.has(m.format_name.toUpperCase())) {
        seen.add(m.format_name.toUpperCase());
        formatList.push(m.format_name);
      }
    }

    // 2. Append base curated formats
    for (const bf of baseFormats) {
      if (!seen.has(bf.toUpperCase())) {
        seen.add(bf.toUpperCase());
        formatList.push(bf);
      }
    }

    // 3. Sort alphabetically (case-insensitive)
    formatList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return [
      { value: 'ALL', label: 'All Formats' },
      ...formatList.map(fmt => ({ value: fmt.toUpperCase(), label: fmt }))
    ];
  }, [matches]);

  const timeOptions = [
    { value: 'TODAY', label: 'Today' },
    { value: '7D', label: 'Past 7 Days' },
    { value: '14D', label: 'Past 14 Days' },
    { value: '30D', label: 'Past 30 Days' },
    { value: '12M', label: 'Past 12 Months' },
    { value: 'ALL', label: 'All Time' },
  ];

  const renderManaHistogram = (curve?: number[]) => {
    const bins = curve || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const startIdx = (bins[0] || 0) > 0 ? 0 : 1;
    const visible = bins.slice(startIdx);
    const maxVal = Math.max(...visible, 1);

    return (
      <div 
        className="flex items-end gap-1 h-[32px] w-[136px] px-1.5 py-1 rounded bg-black/40 border border-white/5 mx-auto" 
        title={`Mana Curve (${startIdx === 0 ? '0-8+' : '1-8+'}): ${visible.join(', ')}`}
      >
        {visible.map((val, idx) => {
          const heightPct = val > 0 ? Math.max((val / maxVal) * 100, 15) : 0;
          return (
            <div 
              key={idx} 
              className="flex-1 rounded-t-sm transition-all duration-200"
              style={{ 
                height: `${heightPct}%`, 
                backgroundColor: val > 0 ? (palette?.accent || '#38BDF8') : 'rgba(255,255,255,0.06)'
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderDeckColorIdentity = (colors?: string[], size: number = 14, justify: string = 'justify-center') => {
    if (!colors || colors.length === 0) {
      return <ManaPip symbol="C" size={size} className="shrink-0" />;
    }
    return (
      <div className={`flex flex-wrap items-center ${justify} gap-1 shrink-0`}>
        {colors.map((c) => (
          <ManaPip key={c} symbol={c} size={size} className="shrink-0" />
        ))}
      </div>
    );
  };

  // MTGA rarity codes: 0=unknown/token, 1=Land, 2=Common, 3=Uncommon, 4=Rare, 5=Mythic.
  const cardRarityLabel = (r: number): string => {
    const labels: Record<number, string> = {
      1: 'Land',
      2: 'Common',
      3: 'Uncommon',
      4: 'Rare',
      5: 'Mythic',
    };
    return labels[r] ?? '-';
  };

  // Rarity colors matching the rest of the app: white common, silver uncommon,
  // gold rare, orange mythic.
  const cardRarityColor = (r: number): string => {
    const colors: Record<number, string> = {
      1: '#9CA3AF',
      2: '#E5E7EB',
      3: '#CBD5E1',
      4: '#D4AF37',
      5: '#F97316',
    };
    return colors[r] ?? '#9CA3AF';
  };
  const getRarityColor = cardRarityColor;

  // Muted format-chip colors, inspired by the mana pip palette but toned down.
  const formatChipColor = (format: string): { bg: string; fg: string; border: string } => {
    const f = (format || '').toLowerCase();
    if (f.includes('brawl - standard') || f.includes('standard brawl')) {
      return { bg: '#4A7FA318', fg: '#7FAAC9', border: '#4A7FA338' };
    } else if (f.includes('brawl - competitive') || f.includes('competitive brawl')) {
      return { bg: '#8a719d18', fg: '#b39ec4', border: '#8a719d38' };
    } else if (f.includes('brawl')) {
      return { bg: '#4A7FA318', fg: '#7FAAC9', border: '#4A7FA338' };
    } else if (f.includes('standard')) {
      return { bg: '#B8503A18', fg: '#D57C69', border: '#B8503A38' };
    } else if (f.includes('historic')) {
      return { bg: '#4A785618', fg: '#76A382', border: '#4A785638' };
    } else if (f.includes('timeless')) {
      return { bg: '#8a719d18', fg: '#b39ec4', border: '#8a719d38' };
    } else if (f.includes('alchemy')) {
      return { bg: '#D4A23718', fg: '#E2BF6F', border: '#D4A23738' };
    } else if (f.includes('explorer') || f.includes('pioneer')) {
      return { bg: '#5B699418', fg: '#8C9AC4', border: '#5B699438' };
    } else if (f.includes('draft') || f.includes('sealed') || f.includes('limited')) {
      return { bg: '#D4A23718', fg: '#E2BF6F', border: '#D4A23738' };
    } else if (f.includes('bot') || f.includes('sparky')) {
      return { bg: '#3D7D7D18', fg: '#6EA8A8', border: '#3D7D7D38' };
    } else if (f.includes('direct') || f.includes('challenge') || f.includes('friendly')) {
      return { bg: '#B8503A18', fg: '#D57C69', border: '#B8503A38' };
    } else if (f.includes('mwm') || f.includes('midweek')) {
      return { bg: '#9E5B8E18', fg: '#C48EB6', border: '#9E5B8E38' };
    } else if (f.includes('gladiator')) {
      return { bg: '#6E8A4218', fg: '#98B36D', border: '#6E8A4238' };
    }
    return { bg: '#94A3B818', fg: '#CBD5E1', border: '#94A3B838' };
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

  // Win-rate gradient: interpolate between the ManaPip theme colors — red
  // (#F87171) at 0%, yellow mid, green (#34D399) at 100%. Matches the app's
  // mana pip palette rather than a fluorescent HSL ramp.
  const winRateColor = (rate: string): string => {
    const pct = Math.max(0, Math.min(100, parseFloat(rate) || 0)) / 100;
    const red: [number, number, number] = [0xF8, 0x71, 0x71];
    const yellow: [number, number, number] = [0xF8, 0xCB, 0x6B];
    const green: [number, number, number] = [0x34, 0xD3, 0x99];
    let r: number, g: number, b: number;
    if (pct <= 0.5) {
      const t = pct * 2;
      r = red[0] + (yellow[0] - red[0]) * t;
      g = red[1] + (yellow[1] - red[1]) * t;
      b = red[2] + (yellow[2] - red[2]) * t;
    } else {
      const t = (pct - 0.5) * 2;
      r = yellow[0] + (green[0] - yellow[0]) * t;
      g = yellow[1] + (green[1] - yellow[1]) * t;
      b = yellow[2] + (green[2] - yellow[2]) * t;
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  };

  // Representative art thumbnail for a deck row: dominant commander (Brawl) or
  // random non-land card (non-commander). Clicking opens the card overlay.
  const renderDeckArt = (d: any, size: string = 'w-7 h-7') => {
    const artName = d.top_commander_name || d.top_card_name;
    const openOverlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      const entry = d.key_cards?.find((k: any) => k.name === artName)
        || (artName ? { name: artName, grp_id: d.top_commander_grp_id || d.top_card_grp_id } : null);
      if (entry) openCardOverlay(entry, d.top_commander_name === artName);
    };
    if (!artName) {
      return (
        <div className={`${size} rounded-none bg-black/40 border border-white/10 shrink-0 flex items-center justify-center`}>
          <Layers className="w-3.5 h-3.5 opacity-30" />
        </div>
      );
    }
    return (
      <CardNameTooltip name={artName}>
        <div className={`${size} shrink-0 overflow-hidden border border-white/10 shadow-sm bg-neutral-900`}>
          <CardImage
            name={artName}
            version="art_crop"
            alt={artName}
            onClick={openOverlay}
            className="w-full h-full object-cover shrink-0 cursor-pointer transition-transform duration-150 group-hover:scale-110 hover:brightness-110"
          />
        </div>
      </CardNameTooltip>
    );
  };

  // Sortable column header: click to toggle asc/desc (no-op when sortKey empty).
  const renderDeckColHeader = (label: string, sortKey: string) => {
    const active = sortKey ? deckCardSort === sortKey : false;
    return (
      <button
        onClick={() => sortKey && toggleDeckSort(sortKey)}
        className="flex items-center gap-1 hover:opacity-100 transition-opacity uppercase text-xs font-semibold"
        style={{ color: active ? (palette?.accent || '#38BDF8') : palette?.subtext }}
        title={sortKey ? `Sort by ${label}` : undefined}
      >
        {label}
        {sortKey && (
          <span className="text-[9px] font-mono opacity-70">
            {active ? (deckCardSortDir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        )}
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
  // pip, which implies a genuinely colorless deck). Left-aligned and larger size (18px).
  const renderLiveDeckColors = (colors?: string[]) => {
    if (!colors || colors.length === 0) {
      return <span className="text-xs font-mono opacity-50 block text-left">-</span>;
    }
    return renderDeckColorIdentity(colors, 18, 'justify-start');
  };

  // Helper: Card type classification with Keyrune/mana-font icons and specific palette colors
  const CARD_TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
    Creature: { icon: 'ms-creature', color: '#34D399', bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.3)' }, // Green
    Instant: { icon: 'ms-instant', color: '#F87171', bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.3)' }, // Red
    Sorcery: { icon: 'ms-sorcery', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.3)' }, // Yellow
    Artifact: { icon: 'ms-artifact', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)' }, // Cool blue-grey
    Enchantment: { icon: 'ms-enchantment', color: '#C084FC', bg: 'rgba(192, 132, 252, 0.1)', border: 'rgba(192, 132, 252, 0.3)' }, // Purple
    Planeswalker: { icon: 'ms-planeswalker', color: '#FB923C', bg: 'rgba(251, 146, 60, 0.1)', border: 'rgba(251, 146, 60, 0.3)' }, // Orange/Rose
    Battle: { icon: 'ms-battle', color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.3)' }, // Rose
    Land: { icon: 'ms-land', color: '#D97706', bg: 'rgba(217, 119, 6, 0.1)', border: 'rgba(217, 119, 6, 0.3)' }, // Light brown/amber
    Token: { icon: 'ms-token', color: '#A1A1AA', bg: 'rgba(161, 161, 170, 0.1)', border: 'rgba(161, 161, 170, 0.3)' },
    Other: { icon: 'ms-multicolor', color: '#E2E8F0', bg: 'rgba(226, 232, 240, 0.1)', border: 'rgba(226, 232, 240, 0.3)' },
  };

  const getCardTypeBadge = (rawType?: string) => {
    if (!rawType) return null;
    const lower = rawType.toLowerCase();
    let category = 'Other';
    if (lower.includes('token')) category = 'Token';
    else {
      for (const kw of ['planeswalker', 'battle', 'creature', 'land', 'enchantment', 'artifact', 'instant', 'sorcery']) {
        if (lower.includes(kw)) {
          category = kw[0].toUpperCase() + kw.slice(1);
          break;
        }
      }
    }
    const conf = CARD_TYPE_CONFIG[category] || CARD_TYPE_CONFIG.Other;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0"
        style={{ color: conf.color, backgroundColor: conf.bg, borderColor: conf.border }}
        title={rawType}
      >
        <span className={`ms ${conf.icon} text-[12px] leading-none`} style={{ color: conf.color }} />
        <span>{category}</span>
      </span>
    );
  };

  // Render a single live action-feed row, handling life-change entries, damage entries,
  // and card play/draw entries with their badges.
  const renderFeedItem = (e: { type: string; name?: string; card_type?: string; delta?: number; amount?: number; target_name?: string; damage_type?: string }, idx: number) => {
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
    if (e.type === 'damage') {
      return (
        <div key={idx} className="text-xs font-mono flex items-center gap-1.5 py-0.5 border-b border-white/5">
          <span className="px-1 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
            {e.amount} DMG
          </span>
          <span className="truncate font-semibold opacity-95" style={{ color: palette?.text }}>
            {e.name}
          </span>
          {getCardTypeBadge(e.card_type)}
          <span className="opacity-40 text-[10px] shrink-0">→</span>
          <span className="truncate text-amber-300/90 text-[11px]">
            {e.target_name}
          </span>
        </div>
      );
    }
    let badgeText = 'PLAY';
    let badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (e.type === 'mulligan') {
      badgeText = 'MULLIGAN';
      badgeStyle = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    } else if (e.type === 'bottom') {
      badgeText = 'BOTTOM';
      badgeStyle = 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    } else if (e.type === 'draw') {
      badgeText = 'DRAW';
      badgeStyle = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    } else if (e.type === 'token') {
      badgeText = 'TOKEN';
      badgeStyle = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    } else if (e.type === 'dies') {
      badgeText = 'DIES';
      badgeStyle = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    } else if (e.type === 'exile') {
      badgeText = 'EXILE';
      badgeStyle = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
    }

    return (
      <div key={idx} className="text-xs font-mono flex items-center gap-1.5 py-0.5 border-b border-white/5">
        <span className={`px-1 rounded text-[10px] font-bold uppercase border shrink-0 ${badgeStyle}`}>
          {badgeText}
        </span>
        <span className="truncate opacity-90">{e.name}</span>
        {getCardTypeBadge(e.card_type)}
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
      style={{
        backgroundColor: palette?.base || 'var(--rt-base)',
        color: palette?.text || 'var(--rt-text)',
        ['--rt-base' as any]: palette?.base || '#0E0E10',
        ['--rt-mantle' as any]: palette?.mantle || '#151518',
        ['--rt-surface' as any]: palette?.surface || '#1D1D22',
        ['--rt-border' as any]: palette?.border || '#2A2A32',
        ['--rt-text' as any]: palette?.text || '#F4F4F6',
        ['--rt-subtext' as any]: palette?.subtext || '#92929D',
        ['--rt-accent' as any]: palette?.accent || '#4A7FA3',
        ['--rt-accent-hover' as any]: palette?.accent_hover || '#6097BC',
        ['--rt-green' as any]: palette?.green || '#3FA66C',
        ['--rt-red' as any]: palette?.red || '#C24E42',
        ['--rt-yellow' as any]: palette?.yellow || '#D4A237',
        ['--rt-blue' as any]: palette?.blue || '#4A7FA3',
        ['--rt-track' as any]: palette?.surface || '#1D1D22',
      }}
    >
      {/* COLUMN 1: Left Sidebar (in-flow bar) */}
      <aside 
        className="h-full border-r flex flex-col justify-between p-4 shrink-0 transition-all duration-300 ease-in-out z-20"
        style={{ 
          backgroundColor: palette?.mantle || '#12141A', 
          borderColor: palette?.border || '#2A2F3D',
          width: isSidebarCollapsed ? '72px' : '220px'
        }}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo Brand Section: symbol icon always shown, centered. */}
          <div 
            className={`flex flex-col items-center justify-center shrink-0 transition-all pt-3 pb-4 ${
              isSidebarCollapsed ? 'px-0' : 'px-2'
            }`}
          >
            <img 
              src={symbolIcon} 
              alt="Rhystic Tracker" 
              className={`object-contain w-auto drop-shadow-md transition-all ${
                isSidebarCollapsed ? 'h-8' : 'h-[75px]'
              }`}
            />
            {envInfo?.is_test && (
              <div 
                className={`mt-2.5 rounded-full border font-mono font-bold tracking-wider transition-all select-none flex items-center justify-center gap-1.5 shadow-sm ${
                  isSidebarCollapsed ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-3 py-0.5'
                }`}
                style={{
                  backgroundColor: 'rgba(147, 51, 234, 0.2)',
                  borderColor: 'rgba(168, 85, 247, 0.5)',
                  color: '#E9D5FF',
                }}
                title="Running in safe isolated test environment against rhystic_dev.db"
              >
                <span className="text-[11px] leading-none">🧙</span>
                {!isSidebarCollapsed && <span>TEST ENV</span>}
              </div>
            )}
          </div>

          {/* Navigation Links — stays in place below the icon whether the sidebar
              is open or collapsed (no vertical centering on collapse). */}
          <nav className={`transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'space-y-0.5' : 'space-y-1.5'
          }`}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const isLiveMatchActive = item.id === 'live' && liveMatchState && liveMatchState.status === 'IN_MATCH';

              let itemColor = isActive ? (palette?.accent || '#38BDF8') : (palette?.text || '#F8FAFC');
              let itemBg = isActive ? `${palette?.accent || '#38BDF8'}1F` : 'transparent';
              let itemBorder = !isSidebarCollapsed && isActive ? `3px solid ${palette?.accent || '#38BDF8'}` : 'none';

              if (isLiveMatchActive) {
                itemColor = '#F97316'; // Bright orange
                if (isActive) {
                  itemBg = 'rgba(249, 115, 22, 0.2)';
                  itemBorder = '3px solid #F97316';
                }
              }

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  title={isSidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center py-2.5 rounded-none font-medium text-sm transition-all cursor-pointer hover:bg-white/[0.04] ${
                    isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'
                  } ${isLiveMatchActive ? 'animate-pulse font-bold' : ''}`}
                  style={{
                    backgroundColor: itemBg,
                    color: itemColor,
                    borderLeft: itemBorder,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`ms ${item.manaIcon} text-[16px] w-5 text-center shrink-0 leading-none`}
                      style={{ color: itemColor }}
                    />
                    {!isSidebarCollapsed && (
                      <span className="truncate tracking-wide">{item.label}</span>
                    )}
                  </div>
                  {!isSidebarCollapsed && !isLiveMatchActive && (item as any).badge && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-none bg-black/40 text-amber-300 border border-amber-500/30">
                      {(item as any).badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: mana theme selector + collapse chevron. When the
            sidebar is open the chevron sits on the left of the pips in one row;
            when collapsed the pips stack vertically with the chevron below. */}
        <div className={`flex items-center transition-all ${
          isSidebarCollapsed ? 'flex-col' : 'justify-center gap-3'
        }`}>
          {/* Collapse chevron — bare icon, no pill/button around it */}
          <button
            onClick={() => setIsSidebarCollapsedManual(!isSidebarCollapsed)}
            className={`shrink-0 p-1 transition-opacity hover:opacity-70 ${isSidebarCollapsed ? 'order-2 mt-8' : 'order-1'}`}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed
              ? <PanelLeftOpen className="w-[18px] h-[18px]" style={{ color: palette?.subtext || '#94A3B8' }} />
              : <PanelLeftClose className="w-[18px] h-[18px]" style={{ color: palette?.subtext || '#94A3B8' }} />}
          </button>

          {/* Mana theme pips */}
          <div className={`flex items-center transition-all ${
            isSidebarCollapsed ? 'flex-col space-y-1 order-1' : 'gap-0.5 order-2'
          }`}>
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
        </div>
      </aside>

      {/* COLUMN 2: Main Workspace Container */}
      <main ref={workspaceRef} className="flex-1 min-w-[400px] h-full p-6 overflow-hidden flex flex-col space-y-4 transition-all duration-300 relative">
        
        {/* VIEW 1: Dashboard (default landing view) */}
        {activeTab === 'dashboard' && (
          <DashboardView
            matches={matches}
            deckOverview={deckOverview}
            palette={palette}
            formatOptions={formatOptions}
            timeOptions={timeOptions}
            onSelectMatch={(matchId) => {
              setSelectedMatchId(matchId);
              setIsFullInfoOpen(true);
            }}
            onSelectDeck={(deckName) => setSelectedDeckName(deckName)}
            onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
            isTestEnv={envInfo?.is_test}
          />
        )}

        {/* VIEW 2: Settings Screen */}
        {activeTab === 'settings' && (
          <SettingsView 
            palette={palette} 
            activeThemeId={activeThemeId} 
            setActiveThemeId={setActiveThemeId}
            version={APP_VERSION}
            isTestEnv={envInfo?.is_test}
          />
        )}

        {/* VIEW 2: Collection */}
        {activeTab === 'collection' && (
          <CollectionView
            palette={palette}
            onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
            refreshTrigger={collectionRefreshTrigger}
          />
        )}

        {/* VIEW 3: Live Match HUD */}
        {activeTab === 'live' && (
          <LiveHUDView
            palette={palette}
            liveMatchState={liveMatchState}
            onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
            formatChipColor={formatChipColor}
          />
        )}

        {/* VIEW 4A: Deck Library */}
        {activeTab === 'decks' && (
          <div className="flex-1 min-h-0 flex flex-col" style={{ display: selectedDeckName ? 'none' : 'flex' }}>
            <DeckLibraryView
              deckOverview={deckOverview}
              palette={palette}
              showFlair={deckBoxFlair}
              onSelectDeck={(deckName) => setSelectedDeckName(deckName)}
              onDeleteDeck={(deckName) => setDeckToDelete(deckName)}
              onOpenCardOverlay={(card, isOpponent) => openCardOverlay(card, isOpponent)}
              formatChipColor={formatChipColor}
              winRateColor={winRateColor}
              renderDeckArt={renderDeckArt}
              renderDeckColorIdentity={renderDeckColorIdentity}
              renderManaHistogram={renderManaHistogram}
            />
          </div>
        )}

        {/* VIEW 2: Overhauled Modern Match History View */}
        {activeTab === 'matches' && (
          <MatchHistoryView
            matches={matches}
            deckOverview={deckOverview}
            palette={palette}
            formatOptions={formatOptions}
            onSelectMatch={(matchId) => {
              setSelectedMatchId(matchId);
              setIsFullInfoOpen(true);
            }}
            onSelectDeck={(deckName) => {
              setSelectedDeck(deckName);
              setSelectedDeckDetail(null);
            }}
            onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
            initialSearch={matchHistorySearch}
          />
        )}

        {/* VIEW 5: Global Achievements */}
        {activeTab === 'achievements' && (
          <AchievementsView
            palette={palette}
            onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
          />
        )}

        {/* VIEW 6: Global Leaderboards */}
        {activeTab === 'leaderboards' && (
          <LeaderboardsView
            palette={palette}
            onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
          />
        )}
      </main>

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
          setMatchHistorySearch(deckDetail?.deck_name || '');
          setSelectedDeckName(null);
          setActiveTab('matches');
        }}
        onDeckListImported={async () => {
          // Refresh deck detail (charts follow the True Decklist now) AND the
          // deck overview, so the true-decklist source icon updates live.
          if (!selectedDeckName) return;
          try {
            const detail = await invoke<any>('get_deck_detail', { deckName: selectedDeckName });
            setDeckDetail(detail);
            await loadDeckOverview();
          } catch (e) {
            console.error('Failed to refresh deck detail after import:', e);
          }
        }}
        formatDateShort={formatDateShort}
        onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
        onDeleteDeck={(name) => setDeckToDelete(name)}
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
        impactfulCards={impactfulCards}
        onSelectDeck={(deckName) => {
          setIsFullInfoOpen(false);
          setSelectedDeckName(deckName);
        }}
        onSelectOpponent={(oppName) => {
          setIsFullInfoOpen(false);
          setTargetOpponentName(oppName);
          setIsH2HOpen(true);
        }}
        onShowCard={(card, isCommander) => openCardOverlay(card, isCommander)}
      />

      {/* Stage 5D: Opponent Head-to-Head Statistics Modal */}
      <OpponentH2HModal
        isOpen={isH2HOpen}
        onClose={() => setIsH2HOpen(false)}
        opponentName={targetOpponentName}
        palette={palette}
        onSelectMatch={(matchId) => {
          setSelectedMatchId(matchId);
          setIsFullInfoOpen(true);
        }}
      />
      {/* Card Inspector Modal */}
      <CardInspectorModal
        isOpen={!!deckCardOverlay}
        onClose={() => setDeckCardOverlay(null)}
        deckCardOverlay={deckCardOverlay}
        palette={palette}
        overlayPrintings={overlayPrintings}
        overlayPrintingsLoading={overlayPrintingsLoading}
        overlaySelected={overlaySelected}
        setOverlaySelected={setOverlaySelected}
        overlayScryfall={overlayScryfall}
        overlayScryfallLoading={overlayScryfallLoading}
        overlayFlavors={overlayFlavors}
        overlayStats={overlayStats}
        setOverlayStats={setOverlayStats}
        setDeckCardOverlay={setDeckCardOverlay}
        onSelectDeck={(deckName) => setSelectedDeckName(deckName)}
        onOpenTrophyCase={() => setCardTrophyModalOpen(true)}
        onStyleChanged={() => setCollectionRefreshTrigger((t) => t + 1)}
      />

      {/* Individual Card Trophy Case Modal */}
      <CardTrophyCaseModal
        isOpen={cardTrophyModalOpen}
        onClose={() => setCardTrophyModalOpen(false)}
        cardName={deckCardOverlay?.card?.name || 'Card'}
        titles={overlayStats?.lifetime_titles || {}}
        palette={palette}
      />

      {/* Delete-deck confirmation modal */}
      {deckToDelete && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-fade-in"
          onClick={() => setDeckToDelete(null)}
        >
          <div
            className="w-[440px] max-w-full rounded-2xl border shadow-2xl p-6 space-y-4"
            style={{ backgroundColor: palette?.surface, borderColor: palette?.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="rt-card-title" style={{ color: '#F87171' }}>
              Delete Deck
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: palette?.text }}>
              Deleting <strong>{deckToDelete}</strong> will remove its deck list from the library.
            </p>
            <p className="text-sm" style={{ color: palette?.text }}>
              Do you want to keep the match history, or delete the deck and its matches too?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                onClick={() => setDeckToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors hover:bg-white/5"
                style={{ borderColor: palette?.border, color: palette?.text }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteDeck(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-colors"
                style={{ borderColor: palette?.border, color: palette?.text, backgroundColor: palette?.mantle }}
              >
                Keep Match History
              </button>
              <button
                onClick={() => confirmDeleteDeck(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                style={{ backgroundColor: '#DC2626', color: '#FFF' }}
              >
                Delete Both
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIRST-TIME SETUP WIZARD */}
      {showSetupWizard && !showSplash && (
        <FirstTimeSetupWizard
          theme={palette}
          activeThemeId={activeThemeId}
          setActiveThemeId={setActiveThemeId}
          onFinish={() => {
            setShowSetupWizard(false);
            setCollectionRefreshTrigger(prev => prev + 1);
          }}
        />
      )}

      {/* SPLASH SCREEN */}
      {showSplash && (
        <div
          onClick={() => setShowSplash(false)}
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer select-none bg-black/85 backdrop-blur-md"
        >
          <div className="flex flex-col items-center justify-center space-y-6">
            <img
              src={symbolIcon}
              alt="Rhystic Tracker"
              className="w-auto h-[145px] object-contain drop-shadow-[0_20px_50px_rgba(56,189,248,0.6)]"
            />
            <img
              src={logoImg}
              alt="Rhystic Tracker"
              className="w-auto h-[110px] max-w-[85vw] object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.95)]"
            />
            <div className="pt-3 text-center">
              <span className="text-base font-mono font-extrabold tracking-widest text-white drop-shadow-md uppercase">
                v{APP_VERSION}{envInfo?.is_test ? ' — Test Environment' : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
