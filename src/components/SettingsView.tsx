import React, { useEffect, useState } from 'react';
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
  Monitor
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { ManaPip } from './ManaPip';
import { CustomDropdown } from './CustomDropdown';
import { APP_VERSION } from '../version';

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
  const [compactCardsMode, setCompactCardsMode] = useState(() => {
    return localStorage.getItem('compactCardsMode') === 'true';
  });
  const [deckBoxFlair, setDeckBoxFlair] = useState(() => {
    return localStorage.getItem('deckBoxFlair') !== 'false';
  });

  // Cache stats & actions
  const [cacheStats, setCacheStats] = useState<{ size_bytes: number; file_count: number } | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);
  const [cacheDownloading, setCacheDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

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

  const handleToggleCompactCardsMode = (val: boolean) => {
    setCompactCardsMode(val);
    localStorage.setItem('compactCardsMode', String(val));
  };

  const handleToggleDeckBoxFlair = (val: boolean) => {
    setDeckBoxFlair(val);
    localStorage.setItem('deckBoxFlair', String(val));
    window.dispatchEvent(new Event('rhystic_settings_changed'));
  };

  const loadCacheStats = async () => {
    try {
      const res = await invoke<any>('get_cache_stats');
      if (res) setCacheStats(res);
    } catch (e) {
      console.error('Failed to get cache stats:', e);
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
    loadDbStats();
    loadCardDbStatus();
  }, []);

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
    { id: 'black', label: 'Black (Ambition)', symbol: 'B', color: '#8a719d', desc: 'Deep obsidian & violet glow' },
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

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General & Behavior', icon: 'ms-ability-prototype' },
    { id: 'appearance', label: 'Appearance & Themes', icon: 'ms-ability-party' },
    { id: 'connection', label: 'MTGA Connection', icon: 'ms-ability-adventure' },
    { id: 'storage', label: 'Storage & Database', icon: 'ms-library' },
    { id: 'about', label: 'About & Legal', icon: 'ms-battle' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
      {/* Top Header Bar */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/40">
        <div className="flex items-center gap-3">
          <span className="ms ms-ability-prototype text-2xl text-amber-400" />
          <h1 className="text-xl sm:text-2xl font-bold font-display uppercase tracking-wide text-white">
            Settings & Configuration
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 border border-white/15 bg-black/40">
            <span className="text-xs font-mono font-bold tracking-wider text-white">
              v{version}
            </span>
            {isTestEnv && (
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 border border-purple-500/30 bg-purple-500/10 text-purple-300">
                Test Environment
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="px-4 pt-3 shrink-0 bg-neutral-900/20 border-b border-white/10">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer border-t border-l border-r ${
                  isActive
                    ? 'border-white/20 bg-neutral-950 text-white -mb-px relative z-10'
                    : 'border-transparent text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className={`ms ${tab.icon} text-sm`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar min-h-0 bg-neutral-950">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* ========================================================================= */}
          {/* TAB 1: GENERAL & BEHAVIOR                                                */}
          {/* ========================================================================= */}
          {activeTab === 'general' && (
            <div className="space-y-5 animate-fade-in">
              {/* Application Behavior */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                    Application Behavior
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">Desktop Lifecycle</span>
                </div>

                {/* Minimize to Tray */}
                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5 pr-4">
                    <p className="text-xs font-bold text-white uppercase font-display tracking-wide">
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
                    className={`relative inline-flex items-center h-6 w-11 shrink-0 cursor-pointer border transition-colors ${
                      minimizeToTray ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-black/60 border-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform transition-transform ${
                        minimizeToTray ? 'translate-x-6 bg-emerald-400' : 'translate-x-1 bg-neutral-500'
                      }`}
                    />
                  </button>
                </div>

                {/* Auto Switch Live HUD */}
                <div className="flex items-center justify-between py-1 border-t border-white/10 pt-3">
                  <div className="space-y-0.5 pr-4">
                    <p className="text-xs font-bold text-white uppercase font-display tracking-wide">
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
                    className={`relative inline-flex items-center h-6 w-11 shrink-0 cursor-pointer border transition-colors ${
                      autoSwitchLiveHud ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-black/60 border-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform transition-transform ${
                        autoSwitchLiveHud ? 'translate-x-6 bg-emerald-400' : 'translate-x-1 bg-neutral-500'
                      }`}
                    />
                  </button>
                </div>

                {/* Confirm Deck Delete */}
                <div className="flex items-center justify-between py-1 border-t border-white/10 pt-3">
                  <div className="space-y-0.5 pr-4">
                    <p className="text-xs font-bold text-white uppercase font-display tracking-wide">
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
                    className={`relative inline-flex items-center h-6 w-11 shrink-0 cursor-pointer border transition-colors ${
                      confirmDeckDelete ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-black/60 border-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform transition-transform ${
                        confirmDeckDelete ? 'translate-x-6 bg-emerald-400' : 'translate-x-1 bg-neutral-500'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Startup & Navigation */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                    Startup & Default View
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">Navigation</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
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

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                      First-Time Setup Assistant
                    </label>
                    <div>
                      <button
                        onClick={() => setShowResetWizardModal(true)}
                        className="w-full px-4 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" /> Re-run Setup Wizard
                      </button>
                    </div>
                    <p className="text-[11px] font-sans text-neutral-500">
                      Re-opens the wizard to re-scan log paths and card databases.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: APPEARANCE & THEMES                                               */}
          {/* ========================================================================= */}
          {activeTab === 'appearance' && (
            <div className="space-y-5 animate-fade-in">
              {/* Mana Color Themes */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                      5-Color Mana Theme Presets
                    </h3>
                    <p className="text-xs font-sans text-neutral-400 mt-0.5">
                      Select your Magic color identity. All themes use a master dark obsidian base with custom mana accents.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 border border-white/15 bg-black/40 text-neutral-300">
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
                          : 'border-white/10 bg-black/40 hover:border-white/20 hover:bg-white/5 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <ManaPip symbol={t.symbol} size={28} colorOverride={t.color} />
                      <span className="text-xs font-bold font-display uppercase tracking-wide text-white">
                        {t.label.split(' ')[0]}
                      </span>
                      <span className="text-[9.5px] font-sans text-neutral-500 text-center leading-tight">
                        {t.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Card & Library Display Options */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                    Card & Library Display
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">Visuals</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                      Compact Card Preview
                    </label>
                    <div className="flex items-center justify-between p-2 border border-white/10 bg-black/40 h-10">
                      <span className="text-xs font-mono text-neutral-300">Slim Card Rows in Lists</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={compactCardsMode}
                        onClick={() => handleToggleCompactCardsMode(!compactCardsMode)}
                        className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                          compactCardsMode ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-black/60 border-white/15'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform transition-transform ${
                            compactCardsMode ? 'translate-x-5 bg-emerald-400' : 'translate-x-1 bg-neutral-500'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-[11px] font-sans text-neutral-500">
                      Optimizes vertical card height for dense match breakdowns.
                    </p>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 font-bold">
                      Deck Box Visual Flair
                    </label>
                    <div className="flex items-center justify-between p-2 border border-white/10 bg-black/40 h-10">
                      <span className="text-xs font-mono text-neutral-300">Mana Pip Stickers & Win Rate Stamps</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={deckBoxFlair}
                        onClick={() => handleToggleDeckBoxFlair(!deckBoxFlair)}
                        className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                          deckBoxFlair ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-black/60 border-white/15'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform transition-transform ${
                            deckBoxFlair ? 'translate-x-5 bg-emerald-400' : 'translate-x-1 bg-neutral-500'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-[11px] font-sans text-neutral-500">
                      Display mana pip stickers and hand-drawn win rate percentage on deck library boxes. Turning this off displays minimal boxes with deck title only.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: MTGA CONNECTION & LOGS                                            */}
          {/* ========================================================================= */}
          {activeTab === 'connection' && (
            <div className="space-y-5 animate-fade-in">
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                      MTGA Active Log Path Configuration
                    </h3>
                    <p className="text-xs font-sans text-neutral-400 mt-0.5">
                      Rhystic Tracker reads MTG Arena's active <code className="font-mono text-emerald-400">Player.log</code> in real time with high-performance incremental tailing.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                    <Radio className="w-3 h-3 animate-pulse" /> Live Tailer Active
                  </span>
                </div>

                <div className="space-y-2">
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
                        className="w-full pl-9 pr-3 py-2 border border-white/10 bg-black/60 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
                      />
                    </div>
                    <button
                      onClick={handleBrowse}
                      className="px-4 py-2 border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-mono font-bold uppercase tracking-wider text-white transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {browseSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FolderOpen className="w-3.5 h-3.5" />}
                      {browseSuccess ? 'Applied' : 'Browse…'}
                    </button>
                    <button
                      onClick={handleSaveConfig}
                      className="px-4 py-2 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-mono font-bold uppercase tracking-wider text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {savedSuccess ? <Check className="w-3.5 h-3.5" /> : null}
                      {savedSuccess ? 'Saved' : 'Save Config'}
                    </button>
                  </div>
                </div>

                {/* Where to find Player.log assistant guide */}
                <div className="border border-white/10 bg-neutral-950 p-3.5 space-y-2">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                    Common MTGA Install Locations
                  </p>
                  <div className="text-[11px] font-mono space-y-1 text-neutral-300">
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
                  <p className="text-[10px] font-sans italic text-neutral-500 pt-1 border-t border-white/5">
                    Note: Detailed logging must be enabled in MTGA (Options → Account → Detailed Logs Plugin Support).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: STORAGE, CACHE & DATABASE                                         */}
          {/* ========================================================================= */}
          {activeTab === 'storage' && (
            <div className="space-y-5 animate-fade-in">
              {/* SQLite Database Stats & Backup */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                    SQLite Database Management
                  </h3>
                  <span className="text-xs font-mono text-neutral-400">
                    {dbStats?.db_filename ?? 'rhystic.db'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-white/10 bg-neutral-950 p-3">
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500">Total Recorded Matches</p>
                    <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                      {dbStats?.match_count?.toLocaleString() ?? 0}
                    </p>
                  </div>
                  <div className="border border-white/10 bg-neutral-950 p-3">
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500">Database File Size</p>
                    <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                      {formatBytes(dbStats?.size_bytes ?? 0)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[9.5px] font-mono uppercase text-neutral-500">Database Disk Path</p>
                  <p className="text-xs font-mono text-neutral-400 break-all p-2 border border-white/10 bg-black/60">
                    {dbStats?.db_path ?? '—'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={handleExportDb}
                    disabled={dbExporting}
                    className="px-4 py-2 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-mono font-bold uppercase tracking-wider text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {dbExporting ? 'Exporting…' : 'Backup Database to File…'}
                  </button>
                  {dbExportSuccess && (
                    <span className="text-xs font-mono text-emerald-400">{dbExportSuccess}</span>
                  )}
                </div>
              </div>

              {/* Local Card Image Cache */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                    Local Card Image Cache
                  </h3>
                  <span className="text-xs font-mono text-neutral-400">
                    {formatBytes(cacheStats?.size_bytes ?? 0)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-white/10 bg-neutral-950 p-3">
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cached Card Illustrations</p>
                    <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                      {cacheStats?.file_count?.toLocaleString() ?? 0} files
                    </p>
                  </div>
                  <div className="border border-white/10 bg-neutral-950 p-3">
                    <p className="text-[9.5px] font-mono uppercase text-neutral-500">Cache Storage Used</p>
                    <p className="text-xl font-mono font-bold text-white tabular-nums mt-0.5">
                      {formatBytes(cacheStats?.size_bytes ?? 0)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={handlePreDownloadArt}
                    disabled={cacheDownloading}
                    className="px-4 py-2 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-xs font-mono font-bold uppercase tracking-wider text-sky-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${cacheDownloading ? 'animate-bounce' : ''}`} />
                    {cacheDownloading ? 'Pre-downloading…' : 'Pre-download Collection Art'}
                  </button>
                  <button
                    onClick={handleClearCache}
                    disabled={cacheClearing || (cacheStats?.file_count ?? 0) === 0}
                    className="px-4 py-2 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-mono font-bold uppercase tracking-wider text-rose-400 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {cacheClearing ? 'Clearing…' : 'Clear Image Cache'}
                  </button>
                </div>
                {downloadProgress && (
                  <p className="text-xs font-mono text-emerald-400 animate-pulse">{downloadProgress}</p>
                )}
                {cacheClearSuccess && (
                  <p className="text-xs font-mono text-emerald-400">Card image cache successfully cleared.</p>
                )}
              </div>

              {/* MTGA Card Database & Scryfall Metadata Sync */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-display font-bold uppercase tracking-wide text-white">
                    MTGA Universe & Scryfall Sync
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">Metadata Sources</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card DB Index */}
                  <div className="border border-white/10 bg-neutral-950 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">MTGA Card Universe</p>
                      <button
                        onClick={handleSyncCardDb}
                        disabled={cardDbSyncing}
                        className="text-[10px] font-mono font-bold text-sky-400 hover:underline uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${cardDbSyncing ? 'animate-spin' : ''}`} />
                        {cardDbSyncing ? 'Syncing…' : 'Re-sync'}
                      </button>
                    </div>
                    <p className="text-base font-mono font-bold text-white tabular-nums">
                      {cardDbStatus?.card_count ? (
                        <span className="text-emerald-400">{cardDbStatus.card_count.toLocaleString()} Cards</span>
                      ) : (
                        <span className="text-amber-400">0 Cards</span>
                      )}
                    </p>
                    <p className="text-[9.5px] font-mono text-neutral-500 break-all truncate">
                      {cardDbStatus?.raw_path || 'Auto-scan enabled'}
                    </p>
                  </div>

                  {/* Scryfall Set Metadata */}
                  <div className="border border-white/10 bg-neutral-950 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-mono uppercase text-neutral-400 font-bold">Scryfall Set Catalog</p>
                      <button
                        onClick={handleRefreshSets}
                        disabled={setMetaBusy}
                        className="text-[10px] font-mono font-bold text-sky-400 hover:underline uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: ABOUT & LEGAL                                                     */}
          {/* ========================================================================= */}
          {activeTab === 'about' && (
            <div className="space-y-5 animate-fade-in">
              {/* App Summary */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-4">
                <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold font-display uppercase tracking-wide text-white">
                      Rhystic Tracker
                    </h3>
                    <p className="text-xs font-sans text-neutral-400">
                      The Next-Generation Native MTG Arena Combat Analytics & Match Companion.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-amber-400">v{version}</span>
                    <p className="text-[10px] font-mono text-neutral-500">Tauri 2.0 / Rust / React</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="border border-white/10 bg-neutral-950 p-2.5">
                    <p className="text-[9px] font-mono uppercase text-neutral-500">Framework</p>
                    <p className="text-xs font-mono font-bold text-white mt-0.5">Tauri 2.0</p>
                  </div>
                  <div className="border border-white/10 bg-neutral-950 p-2.5">
                    <p className="text-[9px] font-mono uppercase text-neutral-500">Engine</p>
                    <p className="text-xs font-mono font-bold text-white mt-0.5">Rust (WebKit)</p>
                  </div>
                  <div className="border border-white/10 bg-neutral-950 p-2.5">
                    <p className="text-[9px] font-mono uppercase text-neutral-500">Database</p>
                    <p className="text-xs font-mono font-bold text-white mt-0.5">SQLite 3</p>
                  </div>
                  <div className="border border-white/10 bg-neutral-950 p-2.5">
                    <p className="text-[9px] font-mono uppercase text-neutral-500">License</p>
                    <p className="text-xs font-mono font-bold text-emerald-400 mt-0.5">Open Source</p>
                  </div>
                </div>
              </div>

              {/* Legal Attribution */}
              <div className="border border-white/10 bg-black/40 p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                  <h4 className="text-xs font-display font-bold uppercase tracking-wider">
                    Fan Content Policy & Legal Disclosures
                  </h4>
                </div>
                <div className="text-xs text-neutral-400 space-y-2 leading-relaxed font-sans">
                  <p>
                    <strong className="text-white">Rhystic Tracker</strong> is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.
                  </p>
                  <p>
                    Card metadata, symbol artwork, and mana pips are fetched via <strong className="text-white">Scryfall's API</strong> under Scryfall's Free Attribution License. Rhystic Tracker is free, open-source software built for the Magic: The Gathering community.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Re-run Setup Wizard Modal */}
      {showResetWizardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="w-full max-w-md border border-white/20 bg-neutral-950 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-sky-400">
              <Sliders className="w-5 h-5" />
              <h3 className="text-base font-bold font-display uppercase tracking-wide text-white">
                Re-run Setup Wizard?
              </h3>
            </div>
            
            <p className="text-xs text-neutral-300 leading-relaxed font-sans">
              This will re-launch the initial setup wizard to verify your MTGA log path and re-index the card database. 
              <br /><br />
              <strong className="text-emerald-400">Your match history and deck lists will not be affected or deleted.</strong>
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowResetWizardModal(false)}
                className="px-4 py-1.5 border border-white/10 hover:border-white/20 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResetWizard}
                className="px-4 py-1.5 border border-sky-500/40 bg-sky-500/20 hover:bg-sky-500/30 text-xs font-mono font-bold uppercase tracking-wider text-sky-300 transition-colors cursor-pointer"
              >
                Launch Setup Wizard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;
