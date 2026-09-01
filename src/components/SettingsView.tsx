import React, { useEffect, useState, useMemo } from 'react';
import { 
  FolderOpen, 
  Palette, 
  Database, 
  ShieldCheck, 
  Check, 
  Search, 
  RefreshCw, 
  Sliders, 
  Download, 
  Trash2, 
  HardDrive, 
  Compass, 
  Radio, 
  Image as ImageIcon,
  ExternalLink,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  Monitor,
  Shuffle,
  ImageOff,
  Plus,
  X as XIcon,
  Volume2,
  VolumeX,
  Pin,
  FileSpreadsheet,
  Save,
  Archive,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ManaPip } from './ManaPip';
import { CustomDropdown } from './CustomDropdown';
import { CardImage } from './CardImage';
import { APP_VERSION } from '../version';
import mtgaAvatarCatalog from '../data/mtgaAvatars.json';

// Authentic MTG Mana Theme Palettes (replacing fluorescent accents)
const MTG_COLORS = {
  green: {
    base: '#4A7856',
    bg: 'rgba(74, 120, 86, 0.2)',
    border: 'rgba(74, 120, 86, 0.5)',
    text: '#76A382',
    hoverBg: 'rgba(74, 120, 86, 0.3)',
  },
  blue: {
    base: '#4A7FA3',
    bg: 'rgba(74, 127, 163, 0.2)',
    border: 'rgba(74, 127, 163, 0.5)',
    text: '#7FAAC9',
    hoverBg: 'rgba(74, 127, 163, 0.3)',
  },
  red: {
    base: '#B8503A',
    bg: 'rgba(184, 80, 58, 0.2)',
    border: 'rgba(184, 80, 58, 0.5)',
    text: '#D57C69',
    hoverBg: 'rgba(184, 80, 58, 0.3)',
  },
  purple: {
    base: '#374151',
    bg: 'rgba(138, 113, 157, 0.2)',
    border: 'rgba(138, 113, 157, 0.5)',
    text: '#b39ec4',
    hoverBg: 'rgba(138, 113, 157, 0.3)',
  },
  gold: {
    base: '#C5A059',
    bg: 'rgba(197, 160, 89, 0.2)',
    border: 'rgba(197, 160, 89, 0.5)',
    text: '#E5C678',
    hoverBg: 'rgba(197, 160, 89, 0.3)',
  },
};

// Background preset window list
const BG_WINDOWS = [
  { id: 'dashboard', label: 'Dashboard', iconClass: 'ms ms-ability-party' },
  { id: 'matches', label: 'Match History', iconClass: 'ms ms-battle' },
  { id: 'decks', label: 'Deck Library', iconClass: 'ms ms-ability-adventure' },
  { id: 'collection', label: 'Card Library', iconClass: 'ms ms-library' },
  { id: 'achievements', label: 'Achievements', iconClass: 'ms ms-ability-duels-renowned' },
  { id: 'leaderboards', label: 'Leaderboards', iconClass: 'ms ms-ability-kicker' },
  { id: 'live', label: 'Live HUD', iconClass: 'ms ms-instant' },
  { id: 'settings', label: 'Settings', iconClass: 'ms ms-ability-prototype' },
];

interface SettingsViewProps {
  palette: any;
  activeThemeId: string;
  setActiveThemeId: (id: string) => void;
  version?: string;
  isTestEnv?: boolean;
}

type SettingsTab = 'general' | 'appearance' | 'connection' | 'storage' | 'about';

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  palette, 
  activeThemeId, 
  setActiveThemeId,
  version = APP_VERSION,
  isTestEnv = false,
}) => {
  const accentColor = palette?.accent || '#A855F7';
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [searchQuery, setSearchQuery] = useState('');

  // Log path state
  const [logPath, setLogPath] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [browseSuccess, setBrowseSuccess] = useState(false);
  const [loadingPath, setLoadingPath] = useState(true);

  // Set metadata state
  const [setMetaStatus, setSetMetaStatus] = useState<{ known_count: number; last_updated: string | null } | null>(null);
  const [setMetaBusy, setSetMetaBusy] = useState(false);
  const [setMetaResult, setSetMetaResult] = useState<string | null>(null);
  const [setMetaError, setSetMetaError] = useState<string | null>(null);

  // Desktop & background behavior
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [autoSwitchLiveHud, setAutoSwitchLiveHud] = useState(() => {
    return localStorage.getItem('autoSwitchLiveHud') === 'true';
  });
  const [liveHudAlwaysOnTop, setLiveHudAlwaysOnTop] = useState(() => {
    return localStorage.getItem('liveHudAlwaysOnTop') === 'true';
  });
  const [enableAudioCues, setEnableAudioCues] = useState(() => {
    return localStorage.getItem('enableAudioCues') !== 'false';
  });
  const [excludeSparkyMatches, setExcludeSparkyMatches] = useState(() => {
    return localStorage.getItem('excludeSparkyMatches') === 'true';
  });
  const [autoExportMatches, setAutoExportMatches] = useState(() => {
    return localStorage.getItem('autoExportMatches') === 'true';
  });
  const [autoExportFormat, setAutoExportFormat] = useState(() => {
    return localStorage.getItem('autoExportFormat') || 'json';
  });

  // App & collection preferences
  const [defaultStartupTab, setDefaultStartupTab] = useState(() => {
    return localStorage.getItem('defaultStartupTab') || 'dashboard';
  });
  const [defaultCollectionSort, setDefaultCollectionSort] = useState(() => {
    return localStorage.getItem('defaultCollectionSort') || 'released';
  });
  const [confirmDeckDelete, setConfirmDeckDelete] = useState(() => {
    return localStorage.getItem('confirmDeckDelete') !== 'false';
  });
  const [allowMatchDeletion, setAllowMatchDeletion] = useState(() => {
    return localStorage.getItem('allowMatchDeletion') === 'true';
  });
  const [compactCardsMode, setCompactCardsMode] = useState(() => {
    return localStorage.getItem('compactCardsMode') === 'true';
  });
  const [deckBoxFlair, setDeckBoxFlair] = useState(() => {
    return localStorage.getItem('deckBoxFlair') !== 'false';
  });
  const [glassOpacity, setGlassOpacity] = useState(() => {
    return localStorage.getItem('glassOpacity') || 'standard';
  });
  const [manaPipStyle, setManaPipStyle] = useState(() => {
    return localStorage.getItem('manaPipStyle') || 'graphic';
  });
  const [bo3SideboardTracking, setBo3SideboardTracking] = useState(() => {
    return localStorage.getItem('bo3SideboardTracking') !== 'false';
  });
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
    return localStorage.getItem('autoBackupEnabled') !== 'false';
  });
  const [imageCacheQuota, setImageCacheQuota] = useState(() => {
    return localStorage.getItem('imageCacheQuota') || '1gb';
  });

  // Background mode & presets
  const [bgMode, setBgMode] = useState<'random' | 'preset' | 'none'>(() => {
    return (localStorage.getItem('bgMode') as 'random' | 'preset' | 'none') || 'random';
  });
  const [bgPresets, setBgPresets] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('bgPresets') || '{}'); }
    catch { return {}; }
  });
  const [bgSearchOpen, setBgSearchOpen] = useState(false);
  const [bgSearchTab, setBgSearchTab] = useState('');
  const [bgSearchQuery, setBgSearchQuery] = useState('');
  const [bgSearchResults, setBgSearchResults] = useState<any[]>([]);
  const [bgSearchSelected, setBgSearchSelected] = useState<any>(null);
  const bgSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSetBgMode = (mode: 'random' | 'preset' | 'none') => {
    setBgMode(mode);
    localStorage.setItem('bgMode', mode);
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleOpenBgSearch = (tabId: string) => {
    setBgSearchTab(tabId);
    setBgSearchQuery('');
    setBgSearchResults([]);
    setBgSearchSelected(null);
    setBgSearchOpen(true);
  };

  const handleBgSearchChange = (q: string) => {
    setBgSearchQuery(q);
    setBgSearchSelected(null);
    if (bgSearchTimerRef.current) clearTimeout(bgSearchTimerRef.current);
    if (!q.trim()) { setBgSearchResults([]); return; }
    bgSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await invoke<any>('get_collection', {
          filters: { search: q.trim(), sort: 'name', sort_dir: 'asc' }
        });
        const cards = (res?.cards || []).slice(0, 20);
        const seen = new Map<string, any>();
        for (const c of cards) {
          const name = c.name as string;
          if (name && !seen.has(name)) seen.set(name, c);
        }
        setBgSearchResults(Array.from(seen.values()));
      } catch { setBgSearchResults([]); }
    }, 250);
  };

  const handleConfirmBgPreset = (cardName: string) => {
    const updated = { ...bgPresets, [bgSearchTab]: cardName };
    setBgPresets(updated);
    localStorage.setItem('bgPresets', JSON.stringify(updated));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
    setBgSearchOpen(false);
  };

  const handleRemoveBgPreset = (tabId: string) => {
    const updated = { ...bgPresets };
    delete updated[tabId];
    setBgPresets(updated);
    localStorage.setItem('bgPresets', JSON.stringify(updated));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  // Cache stats & actions
  const [cacheStats, setCacheStats] = useState<{ size_bytes: number; file_count: number } | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);
  const [cacheDownloading, setCacheDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  // Avatar cache stats & actions
  const [avatarCacheStats, setAvatarCacheStats] = useState<{ size_bytes: number; file_count: number } | null>(null);
  const [avatarClearing, setAvatarClearing] = useState(false);
  const [avatarClearSuccess, setAvatarClearSuccess] = useState(false);
  const [avatarDownloading, setAvatarDownloading] = useState(false);
  const [avatarDownloadProgress, setAvatarDownloadProgress] = useState<string | null>(null);

  // Database stats & backup
  const [dbStats, setDbStats] = useState<{ db_filename: string; db_path: string; size_bytes: number; match_count: number } | null>(null);
  const [dbExporting, setDbExporting] = useState(false);
  const [dbExportSuccess, setDbExportSuccess] = useState<string | null>(null);

  // Card Database sync & Wizard state
  const [cardDbStatus, setCardDbStatus] = useState<{ card_count: number; raw_path: string | null } | null>(null);
  const [cardDbSyncing, setCardDbSyncing] = useState(false);
  const [cardDbSyncResult, setCardDbSyncResult] = useState<{ success: boolean; count: number; elapsedMs: number; error?: string } | null>(null);
  const [showResetWizardModal, setShowResetWizardModal] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const val = await invoke<boolean>('get_minimize_to_tray');
        if (!cancelled) setMinimizeToTray(val);
      } catch (e) {
        console.error('Failed to load minimize to tray setting:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggleMinimizeToTray = async (val: boolean) => {
    setMinimizeToTray(val);
    try {
      await invoke('set_minimize_to_tray', { enabled: val });
    } catch (e) {
      console.error('Failed to save minimize to tray setting:', e);
    }
  };

  const handleToggleAutoSwitchLiveHud = (val: boolean) => {
    setAutoSwitchLiveHud(val);
    localStorage.setItem('autoSwitchLiveHud', String(val));
  };

  const handleToggleAlwaysOnTop = async (val: boolean) => {
    setLiveHudAlwaysOnTop(val);
    localStorage.setItem('liveHudAlwaysOnTop', String(val));
    try {
      await invoke('set_always_on_top', { enabled: val });
    } catch (e) {
      console.error('Failed to set always on top:', e);
    }
  };

  const handleToggleAudioCues = (val: boolean) => {
    setEnableAudioCues(val);
    localStorage.setItem('enableAudioCues', String(val));
  };

  const handleToggleExcludeSparky = (val: boolean) => {
    setExcludeSparkyMatches(val);
    localStorage.setItem('excludeSparkyMatches', String(val));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleToggleAutoExport = (val: boolean) => {
    setAutoExportMatches(val);
    localStorage.setItem('autoExportMatches', String(val));
  };

  const handleChangeAutoExportFormat = (val: string) => {
    setAutoExportFormat(val);
    localStorage.setItem('autoExportFormat', val);
  };

  const handleChangeDefaultStartupTab = (val: string) => {
    setDefaultStartupTab(val);
    localStorage.setItem('defaultStartupTab', val);
  };

  const handleChangeDefaultCollectionSort = (val: string) => {
    setDefaultCollectionSort(val);
    localStorage.setItem('defaultCollectionSort', val);
  };

  const handleToggleConfirmDeckDelete = (val: boolean) => {
    setConfirmDeckDelete(val);
    localStorage.setItem('confirmDeckDelete', String(val));
  };

  const handleToggleAllowMatchDeletion = (val: boolean) => {
    setAllowMatchDeletion(val);
    localStorage.setItem('allowMatchDeletion', String(val));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleToggleCompactCardsMode = (val: boolean) => {
    setCompactCardsMode(val);
    localStorage.setItem('compactCardsMode', String(val));
  };

  const handleToggleDeckBoxFlair = (val: boolean) => {
    setDeckBoxFlair(val);
    localStorage.setItem('deckBoxFlair', String(val));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleChangeGlassOpacity = (val: string) => {
    setGlassOpacity(val);
    localStorage.setItem('glassOpacity', val);
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleChangeManaPipStyle = (val: string) => {
    setManaPipStyle(val);
    localStorage.setItem('manaPipStyle', val);
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleToggleBo3Sideboard = (val: boolean) => {
    setBo3SideboardTracking(val);
    localStorage.setItem('bo3SideboardTracking', String(val));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const handleToggleAutoBackup = (val: boolean) => {
    setAutoBackupEnabled(val);
    localStorage.setItem('autoBackupEnabled', String(val));
  };

  const handleChangeImageCacheQuota = (val: string) => {
    setImageCacheQuota(val);
    localStorage.setItem('imageCacheQuota', val);
  };

  const loadCacheStats = async () => {
    try {
      const res = await invoke<any>('get_cache_stats');
      if (res) setCacheStats(res);
    } catch (e) {
      console.error('Failed to get cache stats:', e);
    }
  };

  const loadAvatarCacheStats = async () => {
    try {
      const res = await invoke<any>('get_avatar_cache_stats');
      if (res) setAvatarCacheStats(res);
    } catch (e) {
      console.error('Failed to get avatar cache stats:', e);
    }
  };

  const loadDbStats = async () => {
    try {
      const res = await invoke<any>('get_database_stats');
      if (res) setDbStats(res);
    } catch (e) {
      console.error('Failed to get database stats:', e);
    }
  };

  const loadCardDbStatus = async () => {
    try {
      const res = await invoke<any>('get_raw_card_db_status');
      if (res) setCardDbStatus(res);
    } catch (e) {
      console.error('Failed to get card database status:', e);
    }
  };

  useEffect(() => {
    loadCacheStats();
    loadAvatarCacheStats();
    loadDbStats();
    loadCardDbStatus();
  }, []);

  const handleClearAvatarCache = async () => {
    setAvatarClearing(true);
    setAvatarClearSuccess(false);
    try {
      const res = await invoke<any>('clear_avatar_cache');
      if (res) setAvatarCacheStats(res);
      setAvatarClearSuccess(true);
      setTimeout(() => setAvatarClearSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to clear avatar cache:', e);
    } finally {
      setAvatarClearing(false);
    }
  };

  const handleExtractAvatarsFromClient = async () => {
    setAvatarDownloading(true);
    setAvatarDownloadProgress('Extracting avatars from MTGA client...');
    try {
      const res = await invoke<{ success: boolean; count: number; message: string }>('extract_avatars_from_mtga_client');
      await loadAvatarCacheStats();
      setAvatarDownloadProgress(res.message);
      setTimeout(() => setAvatarDownloadProgress(null), 4000);
    } catch (e: any) {
      console.error('Extract avatars error:', e);
      setAvatarDownloadProgress(e?.toString() || 'Error extracting avatars from MTGA client');
    } finally {
      setAvatarDownloading(false);
    }
  };

  const handleSyncCardDb = async () => {
    setCardDbSyncing(true);
    setCardDbSyncResult(null);
    try {
      const res = await invoke<any>('sync_card_database');
      setCardDbSyncResult({
        success: res.success,
        count: res.card_count,
        elapsedMs: Number(res.elapsed_ms),
        error: res.error || undefined
      });
      await loadCardDbStatus();
      setTimeout(() => setCardDbSyncResult(null), 5000);
    } catch (e: any) {
      setCardDbSyncResult({
        success: false,
        count: 0,
        elapsedMs: 0,
        error: e?.toString() || 'Sync error'
      });
    } finally {
      setCardDbSyncing(false);
    }
  };

  const handleConfirmResetWizard = async () => {
    try {
      await invoke('reset_setup_wizard');
      setShowResetWizardModal(false);
      window.dispatchEvent(new CustomEvent('open-setup-wizard'));
    } catch (e) {
      console.error('Failed to reset setup wizard:', e);
    }
  };

  const handleClearCache = async () => {
    setCacheClearing(true);
    setCacheClearSuccess(false);
    try {
      const res = await invoke<any>('clear_image_cache');
      if (res) setCacheStats(res);
      setCacheClearSuccess(true);
      setTimeout(() => setCacheClearSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to clear image cache:', e);
    } finally {
      setCacheClearing(false);
    }
  };

  const handlePreDownloadArt = async () => {
    setCacheDownloading(true);
    setDownloadProgress('Starting scan...');
    try {
      const colData = await invoke<any>('get_collection');
      const cards: any[] = colData?.cards || [];
      const distinctNames = Array.from(new Set(cards.map(c => c.name).filter(Boolean)));
      let downloaded = 0;
      for (let i = 0; i < distinctNames.length; i++) {
        const name = distinctNames[i];
        try {
          const cached = await invoke<string | null>('has_card_image', { name, version: 'art_crop' });
          if (!cached) {
            const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;
            const resp = await fetch(url);
            if (resp.ok) {
              const blob = await resp.blob();
              const arrayBuf = await blob.arrayBuffer();
              const data = Array.from(new Uint8Array(arrayBuf));
              await invoke('save_card_image', { name, version: 'art_crop', data });
              downloaded++;
            }
            await new Promise(r => setTimeout(r, 60));
          }
        } catch {}
        if (i % 10 === 0 || i === distinctNames.length - 1) {
          setDownloadProgress(`${i + 1}/${distinctNames.length} scanned (${downloaded} downloaded)`);
        }
      }
      await loadCacheStats();
      setDownloadProgress(`Done! ${downloaded} new images cached.`);
      setTimeout(() => setDownloadProgress(null), 4000);
    } catch (e) {
      console.error('Pre-download error:', e);
      setDownloadProgress('Error pre-downloading images');
    } finally {
      setCacheDownloading(false);
    }
  };

  const handleExportDb = async () => {
    setDbExporting(true);
    setDbExportSuccess(null);
    try {
      const now = new Date().toISOString().split('T')[0];
      const defaultFilename = `rhystic_backup_${now}.db`;
      const selected = await save({
        title: 'Export Rhystic Database Backup',
        defaultPath: defaultFilename,
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
      });
      if (selected) {
        await invoke('export_database_backup', { destinationPath: selected });
        setDbExportSuccess('Backup saved successfully!');
        setTimeout(() => setDbExportSuccess(null), 4000);
      }
    } catch (e) {
      console.error('Failed to export DB:', e);
      setDbExportSuccess('Export failed: ' + String(e));
    } finally {
      setDbExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke<any>('get_set_metadata');
        if (!cancelled && res) {
          setSetMetaStatus({ known_count: res.known_count || 0, last_updated: res.last_updated || null });
        }
      } catch (e) {
        console.error('Failed to load set metadata status:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRefreshSets = async () => {
    setSetMetaBusy(true);
    setSetMetaResult(null);
    setSetMetaError(null);
    try {
      const resp = await fetch('https://api.scryfall.com/sets');
      if (!resp.ok) throw new Error(`Scryfall responded ${resp.status}`);
      const data = await resp.json();
      const sets = (data.data || []).map((s: any) => ({
        code: s.code,
        name: s.name,
        released_at: s.released_at || null,
      }));
      const res = await invoke<any>('refresh_set_metadata', { sets });
      setSetMetaResult(`Updated ${res.updated || 0} sets`);
      const status = await invoke<any>('get_set_metadata');
      if (status) setSetMetaStatus({ known_count: status.known_count || 0, last_updated: status.last_updated || null });
    } catch (e) {
      console.error('Failed to refresh set metadata:', e);
      setSetMetaError(String(e));
    } finally {
      setSetMetaBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const path = await invoke<string>('get_log_path');
        if (!cancelled) setLogPath(path);
      } catch (e) {
        console.error('Failed to load log path:', e);
      } finally {
        if (!cancelled) setLoadingPath(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSaveConfig = async () => {
    try {
      const effective = await invoke<string>('set_log_path', { path: logPath });
      setLogPath(effective);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to save log path:', e);
      setSavedSuccess(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        title: 'Select MTG Arena Player.log',
        filters: [{ name: 'Player Log', extensions: ['log'] }],
        multiple: false,
      });
      if (typeof selected === 'string' && selected) {
        const effective = await invoke<string>('set_log_path', { path: selected });
        setLogPath(effective);
        setBrowseSuccess(true);
        setTimeout(() => setBrowseSuccess(false), 3000);
      }
    } catch (e) {
      console.error('Failed to pick log path:', e);
    }
  };

  const manaThemeOptions = [
    { id: 'white', label: 'White (Order)', symbol: 'W', color: '#E8E2CC', desc: 'Ivory & parchment highlights' },
    { id: 'blue', label: 'Blue (Progress)', symbol: 'U', color: '#4A7FA3', desc: 'Steel sapphire & intellect' },
    { id: 'black', label: 'Black (Ambition)', symbol: 'B', color: '#6B7280', desc: 'Charcoal obsidian & dark slate' },
    { id: 'red', label: 'Red (Chaos)', symbol: 'R', color: '#B8503A', desc: 'Warm ember & brick passion' },
    { id: 'green', label: 'Green (Nature)', symbol: 'G', color: '#4A7856', desc: 'Forest moss & primeval vigor' },
  ];

  const startupTabOptions = [
    { value: 'dashboard', label: 'Dashboard (Overview)' },
    { value: 'live', label: 'Live Match HUD' },
    { value: 'matches', label: 'Match History' },
    { value: 'decks', label: 'Deck Library' },
    { value: 'collection', label: 'Card Library / Collection' },
    { value: 'achievements', label: 'Achievements (Trophy Case)' },
    { value: 'leaderboards', label: 'Leaderboards (Hall of Fame)' },
  ];

  const collectionSortOptions = [
    { value: 'released', label: 'Release Date (Newest First)' },
    { value: 'cmc', label: 'Mana Value (CMC)' },
    { value: 'rarity', label: 'Rarity (Mythic to Common)' },
    { value: 'name', label: 'Card Name (Alphabetical)' },
    { value: 'count', label: 'Ownership Count (4 to 0)' },
  ];

  const glassOpacityOptions = [
    { value: 'subtle', label: 'Subtle Glass (30% Tint · Max Ambient Art)' },
    { value: 'standard', label: 'Standard Obsidian Glass (50% Tint)' },
    { value: 'high', label: 'High Contrast Glass (75% Tint)' },
    { value: 'opaque', label: 'Opaque Obsidian (95% Tint · Min Art)' },
  ];

  const manaPipStyleOptions = [
    { value: 'graphic', label: 'Full Color Graphic Mana Pips' },
    { value: 'vector', label: 'Classic High-Contrast Vector Glyphs' },
    { value: 'text', label: 'Text Mana Codes {W}{U}{B}{R}{G}' },
  ];

  const autoExportFormatOptions = [
    { value: 'json', label: 'Full JSON Match Archive' },
    { value: 'csv', label: 'Standard CSV Spreadsheet Summary' },
  ];

  const imageCacheQuotaOptions = [
    { value: '500mb', label: '500 MB (Compact Cache)' },
    { value: '1gb', label: '1.0 GB (Recommended)' },
    { value: '2gb', label: '2.0 GB (Full Art Library)' },
    { value: 'unlimited', label: 'Unlimited (No Storage Cap)' },
  ];

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General & Behavior', icon: 'ms-ability-prototype' },
    { id: 'appearance', label: 'Appearance & Themes', icon: 'ms-ability-party' },
    { id: 'connection', label: 'MTGA Connection', icon: 'ms-ability-adventure' },
    { id: 'storage', label: 'Storage & Database', icon: 'ms-library' },
    { id: 'about', label: 'About & Legal', icon: 'ms-battle' },
  ];

  // Search keyword matcher
  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (terms: string[]) => {
    if (!q) return true;
    return terms.some(t => t.toLowerCase().includes(q));
  };

  // Specific setting search matches
  const matchMinimize = matchesSearch(['minimize', 'tray', 'background', 'system tray', 'close', 'desktop', 'lifecycle', 'window']);
  const matchAutoSwitch = matchesSearch(['auto-switch', 'auto switch', 'live match', 'live hud', 'game start', 'automatic', 'tab switch']);
  const matchAlwaysOnTop = matchesSearch(['always on top', 'pin window', 'floating', 'overlay', 'window pin', 'hud pin', 'borderless']);
  const matchAudioCues = matchesSearch(['audio', 'sound', 'cues', 'sound effects', 'alerts', 'notifications', 'victory fanfare', 'chime']);
  const matchExcludeSparky = matchesSearch(['sparky', 'bot', 'tutorial', 'color challenge', 'exclude bot', 'practice', 'filter bot']);
  const matchAutoExport = matchesSearch(['auto-export', 'export', 'csv', 'json', 'spreadsheet', 'match archive', 'dump']);
  const matchConfirmDelete = matchesSearch(['confirm', 'delete', 'deleting', 'decks', 'deck library', 'remove deck', 'modal', 'confirmation']);
  const matchAllowDelete = matchesSearch(['delete matches', 'delete match', 'match deletion', 'trash', 'remove match', 'bin', 'purge match', 'history']);
  const matchStartupTab = matchesSearch(['startup', 'tab', 'default startup', 'navigation', 'dashboard', 'live hud', 'initial view']);
  const matchSetupWizard = matchesSearch(['setup', 'wizard', 'assistant', 're-run', 'first-time', 'first time', 'scan', 'index', 'onboarding']);

  const matchThemes = matchesSearch(['theme', 'mana', 'color', 'identity', 'white', 'blue', 'black', 'red', 'green', 'accent', 'appearance', 'palette']);
  const matchGlassOpacity = matchesSearch(['glass', 'opacity', 'transparency', 'contrast', 'tint', 'backdrop', 'blur', 'obsidian']);
  const matchManaPipStyle = matchesSearch(['mana pip', 'pip style', 'symbols', 'vector', 'glyphs', 'text codes', 'graphic pips']);
  const matchCollectionSort = matchesSearch(['collection', 'sort', 'order', 'default sort', 'released', 'cmc', 'rarity', 'name', 'count', 'library']);
  const matchCompactMode = matchesSearch(['compact', 'card preview', 'slim', 'dense', 'rows', 'list']);
  const matchDeckFlair = matchesSearch(['deck box', 'visual flair', 'flair', 'stickers', 'win rate', 'stamps', 'mana pip', '3d', 'minimalist']);
  const matchBackground = matchesSearch(['background', 'card art', 'wallpaper', 'random', 'preset', 'no image', 'art', 'ambient']);

  const matchLogPath = matchesSearch(['log', 'player.log', 'mtga', 'path', 'tailer', 'active log', 'browse', 'directory', 'connection', 'save config']);
  const matchBo3Sideboard = matchesSearch(['sideboard', 'bo3', 'best of three', 'drawer', 'post-sideboard', 'game 2', 'game 3', 'segregation']);
  const matchInstallLocations = matchesSearch(['steam', 'proton', 'lutris', 'wine', 'native linux', 'locations', 'detailed logging', 'compatdata']);

  const matchDbStats = matchesSearch(['database', 'sqlite', 'db', 'backup', 'export', 'matches', 'file size', 'storage', 'disk path']);
  const matchAutoBackup = matchesSearch(['auto backup', 'automatic backup', 'weekly backup', 'scheduled backup', 'safety']);
  const matchImageCache = matchesSearch(['cache', 'image', 'illustrations', 'pre-download', 'clear cache', 'storage', 'scryfall', 'art crop']);
  const matchCacheQuota = matchesSearch(['quota', 'cache quota', 'storage cap', 'cache limit', 'disk space', '500mb', '1gb', '2gb']);
  const matchCardDbSync = matchesSearch(['universe', 'raw database', 'mtga universe', 'sync', 'cards', 're-sync', 'cards_cache', 'indexing']);
  const matchSetCatalog = matchesSearch(['scryfall', 'set catalog', 'sets', 'metadata', 'update sets', 'release dates', 'known sets']);

  const matchAboutSummary = matchesSearch(['about', 'version', 'rhystic tracker', 'tauri', 'rust', 'webkit', 'sqlite', 'license', 'open source', 'framework']);
  const matchLegal = matchesSearch(['legal', 'wizards of the coast', 'fan content', 'disclaimer', 'copyright', 'scryfall api', 'attribution', 'policy']);

  const matchingCount = useMemo(() => {
    if (!q) return 0;
    let count = 0;
    if (matchMinimize) count++;
    if (matchAutoSwitch) count++;
    if (matchAlwaysOnTop) count++;
    if (matchAudioCues) count++;
    if (matchExcludeSparky) count++;
    if (matchAutoExport) count++;
    if (matchConfirmDelete) count++;
    if (matchAllowDelete) count++;
    if (matchStartupTab) count++;
    if (matchSetupWizard) count++;
    if (matchThemes) count++;
    if (matchGlassOpacity) count++;
    if (matchManaPipStyle) count++;
    if (matchCollectionSort) count++;
    if (matchCompactMode) count++;
    if (matchDeckFlair) count++;
    if (matchBackground) count++;
    if (matchLogPath) count++;
    if (matchBo3Sideboard) count++;
    if (matchInstallLocations) count++;
    if (matchDbStats) count++;
    if (matchAutoBackup) count++;
    if (matchImageCache) count++;
    if (matchCacheQuota) count++;
    if (matchCardDbSync) count++;
    if (matchSetCatalog) count++;
    if (matchAboutSummary) count++;
    if (matchLegal) count++;
    return count;
  }, [
    q, matchMinimize, matchAutoSwitch, matchAlwaysOnTop, matchAudioCues, matchExcludeSparky, matchAutoExport,
    matchConfirmDelete, matchAllowDelete, matchStartupTab, matchSetupWizard, matchThemes, matchGlassOpacity,
    matchManaPipStyle, matchCollectionSort, matchCompactMode, matchDeckFlair, matchBackground,
    matchLogPath, matchBo3Sideboard, matchInstallLocations, matchDbStats, matchAutoBackup, matchImageCache,
    matchCacheQuota, matchCardDbSync, matchSetCatalog, matchAboutSummary, matchLegal
  ]);

  const isSearching = q.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3 px-8 py-4 overflow-hidden select-none">
      {/* 1. TOP HEADER */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="ms ms-ability-prototype text-2xl" style={{ color: accentColor }} />
          <h1 className="text-[26px] font-display font-bold tracking-[0.12em] uppercase text-white leading-none">
            SETTINGS
          </h1>
          <span className="text-xs text-neutral-400 font-sans ml-2">
            (v{version}{isTestEnv ? ' · Test Environment' : ''})
          </span>
        </div>
      </div>

      {/* 2. TOP FILTER & CONTROLS TOOLBAR */}
      <div className="shrink-0 flex items-center gap-2.5 pb-1 flex-wrap">
        {/* Universal Search Filter */}
        <div className="relative w-64 shrink-0 h-8 flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
              title="Clear search"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Navigation Tabs */}
        <div className="flex items-center bg-white/[0.03] p-0.5 gap-0.5">
          {tabs.map((tab) => {
            const isActive = !isSearching && activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (searchQuery) setSearchQuery('');
                }}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white/[0.12] text-white shadow-sm font-bold'
                    : 'opacity-60 hover:opacity-100 hover:bg-white/[0.05] text-neutral-300'
                }`}
              >
                <span className={`ms ${tab.icon} text-xs`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {isSearching && (
          <span className="text-xs font-mono text-neutral-400 ml-1">
            ({matchingCount} {matchingCount === 1 ? 'setting' : 'settings'} found)
          </span>
        )}
      </div>

      {/* 3. MAIN CONTENT BODY - Left Justified */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-neutral-950/50 backdrop-blur-md border border-white/10 p-6">
        <div className="max-w-4xl w-full space-y-6">

          {/* Empty Search Result */}
          {isSearching && matchingCount === 0 && (
            <div className="py-24 text-center space-y-3">
              <div className="w-14 h-14 bg-white/[0.02] border border-white/10 flex items-center justify-center text-neutral-500 mx-auto">
                <Search className="w-6 h-6 opacity-40" />
              </div>
              <h3 className="text-base font-sans font-bold tracking-wide uppercase text-white">
                No Settings Match "{searchQuery}"
              </h3>
              <p className="text-xs font-sans text-neutral-400 max-w-md mx-auto leading-relaxed">
                Try searching for keywords like <code className="font-mono text-neutral-300">tray</code>, <code className="font-mono text-neutral-300">delete</code>, <code className="font-mono text-neutral-300">theme</code>, <code className="font-mono text-neutral-300">sparky</code>, or <code className="font-mono text-neutral-300">backup</code>.
              </p>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION: GENERAL & BEHAVIOR                                              */}
          {/* ========================================================================= */}
          {(!isSearching ? activeTab === 'general' : (matchMinimize || matchAutoSwitch || matchAlwaysOnTop || matchAudioCues || matchExcludeSparky || matchAutoExport || matchConfirmDelete || matchAllowDelete || matchStartupTab || matchSetupWizard)) && (
            <div className="space-y-6">
              {/* Application Behavior Sub-section */}
              {(matchMinimize || matchAutoSwitch || matchAlwaysOnTop || matchAudioCues || matchExcludeSparky || matchConfirmDelete || matchAllowDelete || !isSearching) && (
                <div className="space-y-3">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Application Behavior
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                      Desktop Lifecycle
                    </span>
                  </div>

                  <div className="divide-y divide-white/5">
                    {/* Minimize to Tray */}
                    {(matchMinimize || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Minimize to System Tray on Close
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Keep Rhystic Tracker actively tracking matches in the background when the main window is closed.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={minimizeToTray}
                          onClick={() => handleToggleMinimizeToTray(!minimizeToTray)}
                          style={minimizeToTray ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            minimizeToTray ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={minimizeToTray ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              minimizeToTray ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Auto Switch Live HUD */}
                    {(matchAutoSwitch || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Auto-Switch to Live Match HUD on Game Start
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Automatically switch to the Live Match HUD tab whenever a new match begins in MTGA.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={autoSwitchLiveHud}
                          onClick={() => handleToggleAutoSwitchLiveHud(!autoSwitchLiveHud)}
                          style={autoSwitchLiveHud ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            autoSwitchLiveHud ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={autoSwitchLiveHud ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              autoSwitchLiveHud ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Live HUD Always on Top */}
                    {(matchAlwaysOnTop || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Pin Window Always on Top (In-Game Overlay)
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Keep Rhystic Tracker floating on top of MTG Arena when playing in windowed or borderless mode.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={liveHudAlwaysOnTop}
                          onClick={() => handleToggleAlwaysOnTop(!liveHudAlwaysOnTop)}
                          style={liveHudAlwaysOnTop ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            liveHudAlwaysOnTop ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={liveHudAlwaysOnTop ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              liveHudAlwaysOnTop ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Exclude Sparky / Bot Matches */}
                    {(matchExcludeSparky || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Exclude Sparky & Tutorial Matches
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Ignore practice matches against Sparky or tutorial challenges in match history and win-rate statistics.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={excludeSparkyMatches}
                          onClick={() => handleToggleExcludeSparky(!excludeSparkyMatches)}
                          style={excludeSparkyMatches ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            excludeSparkyMatches ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={excludeSparkyMatches ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              excludeSparkyMatches ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Audio Cues */}
                    {(matchAudioCues || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Sound Effects & Audio Cues
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Play subtle audio notifications when a match starts, when a victory/defeat is recorded, and on achievement unlock.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enableAudioCues}
                          onClick={() => handleToggleAudioCues(!enableAudioCues)}
                          style={enableAudioCues ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            enableAudioCues ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={enableAudioCues ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              enableAudioCues ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Confirm Deck Delete */}
                    {(matchConfirmDelete || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Confirm Before Deleting Decks
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Prompt with a confirmation dialog when deleting a deck from the Deck Library.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={confirmDeckDelete}
                          onClick={() => handleToggleConfirmDeckDelete(!confirmDeckDelete)}
                          style={confirmDeckDelete ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            confirmDeckDelete ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={confirmDeckDelete ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              confirmDeckDelete ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Allow Match Deletion in History */}
                    {(matchAllowDelete || !isSearching) && (
                      <div className="flex items-center justify-between py-3">
                        <div className="space-y-0.5 pr-4">
                          <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                            Enable Match Deletion in History
                          </p>
                          <p className="text-xs font-sans text-neutral-400">
                            Add a Delete column with a trash icon to Match History table view, allowing permanent removal of specific matches from the database.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowMatchDeletion}
                          onClick={() => handleToggleAllowMatchDeletion(!allowMatchDeletion)}
                          style={allowMatchDeletion ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                          className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                            allowMatchDeletion ? '' : 'bg-white/[0.04] border-white/15'
                          }`}
                        >
                          <span
                            style={allowMatchDeletion ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                            className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                              allowMatchDeletion ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Data Export Sub-section */}
              {(matchAutoExport || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Automated Data Export
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                      Match Archives
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="flex items-center justify-between p-3 border border-white/10 bg-white/[0.02]">
                      <div className="space-y-0.5 pr-2">
                        <p className="text-xs font-bold text-white font-sans uppercase">Auto-Export Completed Matches</p>
                        <p className="text-[11px] font-sans text-neutral-400">Save structured record files upon match end.</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoExportMatches}
                        onClick={() => handleToggleAutoExport(!autoExportMatches)}
                        style={autoExportMatches ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                        className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                          autoExportMatches ? '' : 'bg-white/[0.04] border-white/15'
                        }`}
                      >
                        <span
                          style={autoExportMatches ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                          className={`inline-block h-3 w-3 transform transition-transform ${
                            autoExportMatches ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                        Export File Format
                      </label>
                      <CustomDropdown
                        options={autoExportFormatOptions}
                        value={autoExportFormat}
                        onChange={handleChangeAutoExportFormat}
                        palette={palette}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Startup & Navigation Sub-section */}
              {(matchStartupTab || matchSetupWizard || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Startup & Navigation
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                      Workspaces
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                    {(matchStartupTab || !isSearching) && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          Default Startup Tab
                        </label>
                        <CustomDropdown
                          options={startupTabOptions}
                          value={defaultStartupTab}
                          onChange={handleChangeDefaultStartupTab}
                          palette={palette}
                        />
                        <p className="text-[11px] font-sans text-neutral-500">
                          View loaded automatically when Rhystic Tracker starts.
                        </p>
                      </div>
                    )}

                    {(matchSetupWizard || !isSearching) && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          First-Time Setup Assistant
                        </label>
                        <div>
                          <button
                            onClick={() => setShowResetWizardModal(true)}
                            className="w-full px-4 py-2 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Sliders className="w-3.5 h-3.5" style={{ color: MTG_COLORS.blue.text }} /> Re-run Setup Wizard
                          </button>
                        </div>
                        <p className="text-[11px] font-sans text-neutral-500">
                          Re-opens the wizard to re-scan log paths and card databases.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION: APPEARANCE & THEMES                                             */}
          {/* ========================================================================= */}
          {(!isSearching ? activeTab === 'appearance' : (matchThemes || matchGlassOpacity || matchManaPipStyle || matchCollectionSort || matchCompactMode || matchDeckFlair || matchBackground)) && (
            <div className="space-y-6">
              {/* Mana Color Themes */}
              {(matchThemes || !isSearching) && (
                <div className="space-y-3">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                        5-Color Mana Theme Presets
                      </span>
                      <p className="text-xs font-sans text-neutral-400 mt-0.5">
                        Select your Magic color identity. All themes use a master dark obsidian base with custom mana accents.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 border border-white/15 bg-white/[0.04] text-white">
                      Active: {palette?.name || activeThemeId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
                    {manaThemeOptions.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveThemeId(t.id)}
                        className={`p-3 border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                          activeThemeId === t.id
                            ? 'border-white/40 bg-white/10 shadow-lg'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05] opacity-80 hover:opacity-100'
                        }`}
                      >
                        <ManaPip symbol={t.symbol} size={28} colorOverride={t.color} />
                        <span className="text-xs font-bold font-sans uppercase tracking-wide text-white">
                          {t.label.split(' ')[0]}
                        </span>
                        <span className="text-[9.5px] font-sans text-neutral-400 text-center leading-tight">
                          {t.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Visual Theme & Contrast Options */}
              {(matchGlassOpacity || matchManaPipStyle || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Glassmorphism & Symbol Contrast
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Surface Tint</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {(matchGlassOpacity || !isSearching) && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          Backdrop Glass Opacity & Tint
                        </label>
                        <CustomDropdown
                          options={glassOpacityOptions}
                          value={glassOpacity}
                          onChange={handleChangeGlassOpacity}
                          palette={palette}
                        />
                        <p className="text-[11px] font-sans text-neutral-500">
                          Controls the opacity of obsidian containers over custom card art backgrounds.
                        </p>
                      </div>
                    )}

                    {(matchManaPipStyle || !isSearching) && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          Mana Pip Representation Style
                        </label>
                        <CustomDropdown
                          options={manaPipStyleOptions}
                          value={manaPipStyle}
                          onChange={handleChangeManaPipStyle}
                          palette={palette}
                        />
                        <p className="text-[11px] font-sans text-neutral-500">
                          Choose between graphical mana pips, classic vector glyphs, or raw text codes.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Card & Library Display Options */}
              {(matchCollectionSort || matchCompactMode || matchDeckFlair || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Card & Library Display
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Visuals</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {(matchCollectionSort || !isSearching) && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          Default Collection Sort Order
                        </label>
                        <CustomDropdown
                          options={collectionSortOptions}
                          value={defaultCollectionSort}
                          onChange={handleChangeDefaultCollectionSort}
                          palette={palette}
                        />
                        <p className="text-[11px] font-sans text-neutral-500">
                          Initial sorting method applied when opening the Card Library.
                        </p>
                      </div>
                    )}

                    {(matchCompactMode || !isSearching) && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          Compact Card Preview
                        </label>
                        <div className="flex items-center justify-between p-2 border border-white/10 bg-white/[0.02] h-10">
                          <span className="text-xs font-mono text-neutral-300">Slim Card Rows in Lists</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={compactCardsMode}
                            onClick={() => handleToggleCompactCardsMode(!compactCardsMode)}
                            style={compactCardsMode ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                            className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                              compactCardsMode ? '' : 'bg-white/[0.04] border-white/15'
                            }`}
                          >
                            <span
                              style={compactCardsMode ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                              className={`inline-block h-3 w-3 transform transition-transform ${
                                compactCardsMode ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="text-[11px] font-sans text-neutral-500">
                          Optimizes vertical card height for dense match breakdowns.
                        </p>
                      </div>
                    )}

                    {(matchDeckFlair || !isSearching) && (
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                          Deck Box Visual Flair
                        </label>
                        <div className="flex items-center justify-between p-2 border border-white/10 bg-white/[0.02] h-10">
                          <span className="text-xs font-mono text-neutral-300">Mana Pip Stickers & Win Rate Stamps</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={deckBoxFlair}
                            onClick={() => handleToggleDeckBoxFlair(!deckBoxFlair)}
                            style={deckBoxFlair ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                            className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                              deckBoxFlair ? '' : 'bg-white/[0.04] border-white/15'
                            }`}
                          >
                            <span
                              style={deckBoxFlair ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                              className={`inline-block h-3 w-3 transform transition-transform ${
                                deckBoxFlair ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="text-[11px] font-sans text-neutral-500">
                          Display mana pip stickers and hand-drawn win rate percentage on deck library boxes. Turning this off displays minimal boxes with deck title only.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Background Settings */}
              {(matchBackground || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Background Ambient Artwork
                    </span>
                    <p className="text-xs font-sans text-neutral-400 mt-0.5">
                      Card art backgrounds behind page content. Random uses cards from your tracked decks.
                    </p>
                  </div>

                  {/* Mode selector */}
                  <div className="flex gap-1.5 pt-1">
                    {[
                      { id: 'random' as const, label: 'Random', icon: <Shuffle className="w-3.5 h-3.5" /> },
                      { id: 'preset' as const, label: 'Preset', icon: <ImageIcon className="w-3.5 h-3.5" /> },
                      { id: 'none' as const, label: 'No Image', icon: <ImageOff className="w-3.5 h-3.5" /> },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleSetBgMode(opt.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                          bgMode === opt.id
                            ? 'border-white/40 bg-white/10 text-white font-bold'
                            : 'border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Preset list */}
                  {bgMode === 'preset' && (
                    <div className="space-y-1 pt-2">
                      {BG_WINDOWS.map((win) => {
                        const cardName = bgPresets[win.id];
                        return (
                          <div
                            key={win.id}
                            className="flex items-center justify-between px-3 py-2 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`${win.iconClass} text-sm shrink-0 text-neutral-400`} />
                              <span className="text-xs font-sans text-neutral-300">{win.label}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {cardName ? (
                                <span className="text-[11px] font-mono text-neutral-200 truncate max-w-[140px]">
                                  {cardName}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-neutral-500 italic">Random</span>
                              )}
                              <button
                                onClick={() => handleOpenBgSearch(win.id)}
                                className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white transition-colors cursor-pointer"
                              >
                                {cardName ? 'Change' : 'Set'}
                              </button>
                              {cardName && (
                                <button
                                  onClick={() => handleRemoveBgPreset(win.id)}
                                  className="text-[10px] font-mono hover:text-white transition-colors cursor-pointer px-1"
                                  style={{ color: MTG_COLORS.red.text }}
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION: MTGA CONNECTION & LOGS                                          */}
          {/* ========================================================================= */}
          {(!isSearching ? activeTab === 'connection' : (matchLogPath || matchBo3Sideboard || matchInstallLocations)) && (
            <div className="space-y-6">
              {(matchLogPath || !isSearching) && (
                <div className="space-y-3">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                        MTGA Active Log Path Configuration
                      </span>
                      <p className="text-xs font-sans text-neutral-400 mt-0.5">
                        Rhystic Tracker reads MTG Arena's active <code className="font-mono text-white font-bold" style={{ color: MTG_COLORS.green.text }}>Player.log</code> in real time with high-performance incremental tailing.
                      </p>
                    </div>
                    <span 
                      style={{ backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border, color: '#FFFFFF' }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border text-[10px] font-mono font-bold uppercase tracking-wider"
                    >
                      <Radio className="w-3 h-3 animate-pulse" style={{ color: MTG_COLORS.green.text }} /> Live Tailer Active
                    </span>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                      Active Player.log Path
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          value={logPath}
                          onChange={(e) => setLogPath(e.target.value)}
                          placeholder={loadingPath ? 'Loading…' : 'No log detected — use Browse to select'}
                          className="w-full pl-9 pr-3 py-2 border border-white/10 bg-white/[0.03] text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
                        />
                      </div>
                      <button
                        onClick={handleBrowse}
                        className="px-4 py-2 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {browseSuccess ? <Check className="w-3.5 h-3.5" style={{ color: MTG_COLORS.green.text }} /> : <FolderOpen className="w-3.5 h-3.5" />}
                        {browseSuccess ? 'Applied' : 'Browse…'}
                      </button>
                      <button
                        onClick={handleSaveConfig}
                        style={{ backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border }}
                        className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {savedSuccess ? <Check className="w-3.5 h-3.5" style={{ color: MTG_COLORS.green.text }} /> : null}
                        {savedSuccess ? 'Saved' : 'Save Config'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Best-of-Three Tracking */}
              {(matchBo3Sideboard || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Competitive Match Tracking
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Tournament Rules</span>
                  </div>

                  <div className="flex items-center justify-between py-2 border border-white/10 bg-white/[0.02] p-3">
                    <div className="space-y-0.5 pr-4">
                      <p className="text-xs font-bold text-white uppercase tracking-wide font-sans">
                        Best-of-Three Sideboard Segregation
                      </p>
                      <p className="text-xs font-sans text-neutral-400">
                        In Bo3 matches, track sideboarded cards brought in for games 2 & 3 in a dedicated Live HUD panel.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={bo3SideboardTracking}
                      onClick={() => handleToggleBo3Sideboard(!bo3SideboardTracking)}
                      style={bo3SideboardTracking ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                      className={`relative inline-flex items-center h-5 w-10 shrink-0 cursor-pointer border transition-colors ${
                        bo3SideboardTracking ? '' : 'bg-white/[0.04] border-white/15'
                      }`}
                    >
                      <span
                        style={bo3SideboardTracking ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                        className={`inline-block h-3.5 w-3.5 transform transition-transform ${
                          bo3SideboardTracking ? 'translate-x-5' : 'translate-x-0.5 bg-neutral-500'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Where to find Player.log assistant guide */}
              {(matchInstallLocations || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border border-white/10 bg-white/[0.02] p-4 space-y-2.5">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: MTG_COLORS.gold.text }}>
                      Common MTGA Install Locations
                    </p>
                    <div className="text-[11px] font-mono space-y-1.5 text-neutral-300">
                      <div>
                        <span className="text-neutral-500">Steam (Proton):</span>{' '}
                        <span className="text-neutral-200 break-all">&lt;SteamLibrary&gt;/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Lutris / Wine:</span>{' '}
                        <span className="text-neutral-200 break-all">&lt;wine-prefix&gt;/drive_c/users/&lt;user&gt;/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Native Linux:</span>{' '}
                        <span className="text-neutral-200 break-all">&lt;SteamLibrary&gt;/steamapps/common/MTGA/MTGA_Data/Downloads/Player.log</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-sans italic text-neutral-500 pt-2 border-t border-white/5">
                      Note: Detailed logging must be enabled in MTGA (Options → Account → Detailed Logs Plugin Support).
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION: STORAGE, CACHE & DATABASE                                       */}
          {/* ========================================================================= */}
          {(!isSearching ? activeTab === 'storage' : (matchDbStats || matchAutoBackup || matchImageCache || matchCacheQuota || matchCardDbSync || matchSetCatalog)) && (
            <div className="space-y-6">
              {/* SQLite Database Management */}
              {(matchDbStats || matchAutoBackup || !isSearching) && (
                <div className="space-y-3">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      SQLite Database Management
                    </span>
                    <span className="text-xs font-mono text-neutral-400">
                      {dbStats?.db_filename ?? 'rhystic.db'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500">Total Recorded Matches</p>
                      <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                        {dbStats?.match_count?.toLocaleString() ?? 0}
                      </p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500">Database File Size</p>
                      <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                        {formatBytes(dbStats?.size_bytes ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500">Database Disk Path</p>
                    <p className="text-xs font-mono text-neutral-400 break-all p-2 border border-white/10 bg-white/[0.02]">
                      {dbStats?.db_path ?? '—'}
                    </p>
                  </div>

                  {/* Auto-Backup Toggle */}
                  <div className="flex items-center justify-between p-3 border border-white/10 bg-white/[0.02]">
                    <div className="space-y-0.5 pr-2">
                      <p className="text-xs font-bold text-white font-sans uppercase">Automated Weekly Database Backups</p>
                      <p className="text-[11px] font-sans text-neutral-400">Automatically creates timestamped SQLite backups on app launch.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoBackupEnabled}
                      onClick={() => handleToggleAutoBackup(!autoBackupEnabled)}
                      style={autoBackupEnabled ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border } : undefined}
                      className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                        autoBackupEnabled ? '' : 'bg-white/[0.04] border-white/15'
                      }`}
                    >
                      <span
                        style={autoBackupEnabled ? { backgroundColor: MTG_COLORS.green.base } : undefined}
                        className={`inline-block h-3 w-3 transform transition-transform ${
                          autoBackupEnabled ? 'translate-x-5' : 'translate-x-1 bg-neutral-500'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={handleExportDb}
                      disabled={dbExporting}
                      style={{ backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border }}
                      className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" style={{ color: MTG_COLORS.green.text }} />
                      {dbExporting ? 'Exporting…' : 'Backup Database to File…'}
                    </button>
                    {dbExportSuccess && (
                      <span className="text-xs font-mono" style={{ color: MTG_COLORS.green.text }}>{dbExportSuccess}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Local Card Image Cache */}
              {(matchImageCache || matchCacheQuota || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Local Card Image Cache & Quota
                    </span>
                    <span className="text-xs font-mono text-neutral-400">
                      {formatBytes(cacheStats?.size_bytes ?? 0)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div className="border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cached Illustrations</p>
                      <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                        {cacheStats?.file_count?.toLocaleString() ?? 0} files
                      </p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cache Storage Used</p>
                      <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                        {formatBytes(cacheStats?.size_bytes ?? 0)}
                      </p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-3 space-y-1">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500 font-bold">Storage Cap</p>
                      <CustomDropdown
                        options={imageCacheQuotaOptions}
                        value={imageCacheQuota}
                        onChange={handleChangeImageCacheQuota}
                        palette={palette}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={handlePreDownloadArt}
                      disabled={cacheDownloading}
                      style={{ backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border }}
                      className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className={`w-3.5 h-3.5 ${cacheDownloading ? 'animate-bounce' : ''}`} style={{ color: MTG_COLORS.blue.text }} />
                      {cacheDownloading ? 'Pre-downloading…' : 'Pre-download Collection Art'}
                    </button>
                    <button
                      onClick={handleClearCache}
                      disabled={cacheClearing || (cacheStats?.file_count ?? 0) === 0}
                      style={{ backgroundColor: MTG_COLORS.red.bg, borderColor: MTG_COLORS.red.border }}
                      className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: MTG_COLORS.red.text }} />
                      {cacheClearing ? 'Clearing…' : 'Clear Image Cache'}
                    </button>
                  </div>
                  {downloadProgress && (
                    <p className="text-xs font-mono animate-pulse" style={{ color: MTG_COLORS.green.text }}>{downloadProgress}</p>
                  )}
                  {cacheClearSuccess && (
                    <p className="text-xs font-mono" style={{ color: MTG_COLORS.green.text }}>Card image cache successfully cleared.</p>
                  )}
                </div>
              )}

              {/* Arena Avatar Asset Cache */}
              {(matchImageCache || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      Arena Avatar Asset Cache
                    </span>
                    <span className="text-xs font-mono text-neutral-400">
                      {formatBytes(avatarCacheStats?.size_bytes ?? 0)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cached Avatars</p>
                      <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                        {avatarCacheStats?.file_count?.toLocaleString() ?? 0} avatars
                      </p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-3">
                      <p className="text-[9.5px] font-mono uppercase text-neutral-500">Avatar Storage Used</p>
                      <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                        {formatBytes(avatarCacheStats?.size_bytes ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={handleExtractAvatarsFromClient}
                      disabled={avatarDownloading}
                      style={{ backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border }}
                      className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className={`w-3.5 h-3.5 ${avatarDownloading ? 'animate-bounce' : ''}`} style={{ color: MTG_COLORS.blue.text }} />
                      {avatarDownloading ? 'Extracting…' : 'Extract Avatars from MTGA Client'}
                    </button>
                    <button
                      onClick={handleClearAvatarCache}
                      disabled={avatarClearing || (avatarCacheStats?.file_count ?? 0) === 0}
                      style={{ backgroundColor: MTG_COLORS.red.bg, borderColor: MTG_COLORS.red.border }}
                      className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: MTG_COLORS.red.text }} />
                      {avatarClearing ? 'Clearing…' : 'Clear Avatar Cache'}
                    </button>
                  </div>
                  {avatarDownloadProgress && (
                    <p className="text-xs font-mono animate-pulse" style={{ color: MTG_COLORS.green.text }}>{avatarDownloadProgress}</p>
                  )}
                  {avatarClearSuccess && (
                    <p className="text-xs font-mono" style={{ color: MTG_COLORS.green.text }}>Avatar cache successfully cleared.</p>
                  )}
                </div>
              )}

              {/* MTGA Card Database & Scryfall Metadata Sync */}
              {(matchCardDbSync || matchSetCatalog || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 font-sans">
                      MTGA Universe & Scryfall Metadata
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Catalog Sources</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Card DB Index */}
                    {(matchCardDbSync || !isSearching) && (
                      <div className="border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">MTGA Card Universe</p>
                          <button
                            onClick={handleSyncCardDb}
                            disabled={cardDbSyncing}
                            style={{ color: MTG_COLORS.blue.text }}
                            className="text-[10px] font-mono font-bold hover:underline uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${cardDbSyncing ? 'animate-spin' : ''}`} />
                            {cardDbSyncing ? 'Syncing…' : 'Re-sync'}
                          </button>
                        </div>
                        <p className="text-base font-mono font-bold text-white tabular-nums">
                          {cardDbStatus?.card_count ? (
                            <span style={{ color: MTG_COLORS.green.text }}>{cardDbStatus.card_count.toLocaleString()} Cards</span>
                          ) : (
                            <span style={{ color: MTG_COLORS.gold.text }}>0 Cards</span>
                          )}
                        </p>
                        <p className="text-[9.5px] font-mono text-neutral-500 break-all truncate">
                          {cardDbStatus?.raw_path || 'Auto-scan enabled'}
                        </p>
                      </div>
                    )}

                    {/* Scryfall Set Metadata */}
                    {(matchSetCatalog || !isSearching) && (
                      <div className="border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Scryfall Set Catalog</p>
                          <button
                            onClick={handleRefreshSets}
                            disabled={setMetaBusy}
                            style={{ color: MTG_COLORS.blue.text }}
                            className="text-[10px] font-mono font-bold hover:underline uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${setMetaBusy ? 'animate-spin' : ''}`} />
                            {setMetaBusy ? 'Updating…' : 'Update Sets'}
                          </button>
                        </div>
                        <p className="text-base font-mono font-bold text-white tabular-nums">
                          {setMetaStatus?.known_count ?? 0} Sets Known
                        </p>
                        <p className="text-[9.5px] font-mono text-neutral-500">
                          Last Updated: {setMetaStatus?.last_updated ? new Date(setMetaStatus.last_updated).toLocaleDateString() : 'Never'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION: ABOUT & LEGAL                                                   */}
          {/* ========================================================================= */}
          {(!isSearching ? activeTab === 'about' : (matchAboutSummary || matchLegal)) && (
            <div className="space-y-6">
              {/* App Summary */}
              {(matchAboutSummary || !isSearching) && (
                <div className="space-y-3">
                  <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold font-sans uppercase tracking-wide text-white">
                        Rhystic Tracker
                      </h3>
                      <p className="text-xs font-sans text-neutral-400">
                        The Next-Generation Native MTG Arena Combat Analytics & Match Companion.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono font-bold" style={{ color: MTG_COLORS.gold.text }}>v{version}</span>
                      <p className="text-[10px] font-mono text-neutral-500">Tauri 2.0 / Rust / React</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center pt-1">
                    <div className="border border-white/10 bg-white/[0.02] p-2.5">
                      <p className="text-[9px] font-mono uppercase text-neutral-500">Framework</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">Tauri 2.0</p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-2.5">
                      <p className="text-[9px] font-mono uppercase text-neutral-500">Engine</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">Rust (WebKit)</p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-2.5">
                      <p className="text-[9px] font-mono uppercase text-neutral-500">Database</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5">SQLite 3</p>
                    </div>
                    <div className="border border-white/10 bg-white/[0.02] p-2.5">
                      <p className="text-[9px] font-mono uppercase text-neutral-500">License</p>
                      <p className="text-xs font-mono font-bold text-white mt-0.5" style={{ color: MTG_COLORS.green.text }}>Open Source</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Legal Attribution */}
              {(matchLegal || !isSearching) && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2" style={{ color: MTG_COLORS.gold.text }}>
                    <ShieldCheck className="w-4 h-4" />
                    <span className="text-xs font-sans font-bold uppercase tracking-wider">
                      Fan Content Policy & Legal Disclosures
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400 space-y-2 leading-relaxed font-sans border border-white/10 bg-white/[0.02] p-4">
                    <p>
                      <strong className="text-white">Rhystic Tracker</strong> is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.
                    </p>
                    <p>
                      Card metadata, symbol artwork, and mana pips are fetched via <strong className="text-white">Scryfall's API</strong> under Scryfall's Free Attribution License. Rhystic Tracker is free, open-source software built for the Magic: The Gathering community.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Re-run Setup Wizard Modal */}
      {showResetWizardModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md select-none"
          onClick={() => setShowResetWizardModal(false)}
        >
          <div 
            className="w-full max-w-md bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <div className="flex items-center gap-2.5" style={{ color: MTG_COLORS.blue.text }}>
                <Sliders className="w-5 h-5" />
                <h3 className="text-sm font-sans font-bold uppercase tracking-wide text-white">
                  Re-run Setup Wizard?
                </h3>
              </div>
              <button
                onClick={() => setShowResetWizardModal(false)}
                className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                This will re-launch the initial setup wizard to verify your MTGA log path and re-index the card database. 
                <br /><br />
                <strong style={{ color: MTG_COLORS.green.text }}>Your match history and deck lists will not be affected or deleted.</strong>
              </p>
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2.5 bg-neutral-900/60">
              <button
                onClick={() => setShowResetWizardModal(false)}
                className="px-4 py-1.5 border border-white/10 hover:border-white/20 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResetWizard}
                style={{ backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border }}
                className="px-4 py-1.5 border hover:brightness-125 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all cursor-pointer"
              >
                Launch Setup Wizard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Card Search Modal */}
      {bgSearchOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setBgSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] flex flex-col bg-neutral-950 border border-white/20 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
              <h3 className="text-sm font-sans font-bold uppercase tracking-wide text-white">
                Set Background — {BG_WINDOWS.find(w => w.id === bgSearchTab)?.label}
              </h3>
              <button
                onClick={() => setBgSearchOpen(false)}
                className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Search input */}
            <div className="px-4 py-3 border-b border-white/10">
              <div className="relative h-8 flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-3 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search full card library..."
                  value={bgSearchQuery}
                  onChange={(e) => handleBgSearchChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-none bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] text-white placeholder:text-neutral-500 focus:outline-none transition-colors font-sans"
                  autoFocus
                />
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {bgSearchResults.length === 0 && bgSearchQuery.length > 0 && (
                <div className="py-12 text-center text-xs font-mono text-neutral-500">
                  No cards found for "{bgSearchQuery}"
                </div>
              )}
              {bgSearchResults.map((card: any) => (
                <button
                  key={card.grp_id || card.name}
                  onClick={() => setBgSearchSelected(card)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-white/5 transition-colors cursor-pointer ${
                    bgSearchSelected?.name === card.name
                      ? 'bg-white/[0.1] border-white/20'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="w-8 h-8 border border-white/10 bg-neutral-900 overflow-hidden shrink-0">
                    <CardImage
                      name={card.name}
                      version="art_crop"
                      className="w-full h-full"
                      alt=""
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-sans font-semibold text-neutral-100 truncate">{card.name}</p>
                    <p className="text-[10px] font-mono text-neutral-500 truncate">{card.set_name || card.set_code || ''}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Footer: Confirm */}
            <div className="p-4 border-t border-white/10 flex justify-end gap-2 bg-neutral-900/60">
              <button
                onClick={() => setBgSearchOpen(false)}
                className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {bgSearchSelected && (
                <button
                  onClick={() => handleConfirmBgPreset(bgSearchSelected.name)}
                  className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider font-bold text-white border border-white/30 bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  Confirm
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;
