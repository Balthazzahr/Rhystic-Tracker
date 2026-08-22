import React, { useEffect, useState } from 'react';
import { 
  FolderOpen, 
  Palette, 
  Database, 
  ShieldCheck, 
  Check, 
  FileText,
  AlertCircle,
  Search,
  RefreshCw,
  Sliders,
  Download,
  Trash2,
  HardDrive,
  Compass,
  Radio,
  Image as ImageIcon
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

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  palette, 
  activeThemeId, 
  setActiveThemeId,
  version = APP_VERSION,
  isTestEnv = false,
}) => {
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

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Load Minimize to Tray setting on mount
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

  // Load cache stats
  const loadCacheStats = async () => {
    try {
      const res = await invoke<any>('get_cache_stats');
      if (res) setCacheStats(res);
    } catch (e) {
      console.error('Failed to get cache stats:', e);
    }
  };

  // Load database stats
  const loadDbStats = async () => {
    try {
      const res = await invoke<any>('get_database_stats');
      if (res) setDbStats(res);
    } catch (e) {
      console.error('Failed to get database stats:', e);
    }
  };

  // Load card database status
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

  // Load set metadata status on mount.
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

  // Fetch Scryfall set list and persist names + release dates locally.
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

  // Load the currently active log path (stored override or auto-detected).
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

  // Open a native file picker; auto-applies the selection immediately.
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
    { id: 'white', label: 'White (Order)', symbol: 'W', color: '#F8F6D8' },
    { id: 'blue', label: 'Blue (Progress)', symbol: 'U', color: '#38BDF8' },
    { id: 'black', label: 'Black (Ambition)', symbol: 'B', color: '#8E59C1' },
    { id: 'red', label: 'Red (Chaos)', symbol: 'R', color: '#F87171' },
    { id: 'green', label: 'Green (Nature)', symbol: 'G', color: '#34D399' },
  ];

  const startupTabOptions = [
    { value: 'dashboard', label: 'Dashboard (Overview)' },
    { value: 'live', label: 'Live Match HUD' },
    { value: 'matches', label: 'Match History' },
    { value: 'decks', label: 'Deck Library' },
    { value: 'collection', label: 'Card Library / Collection' },
  ];

  const collectionSortOptions = [
    { value: 'released', label: 'Release Date (Newest First)' },
    { value: 'cmc', label: 'Mana Value (CMC)' },
    { value: 'rarity', label: 'Rarity (Mythic to Common)' },
    { value: 'name', label: 'Card Name (Alphabetical)' },
    { value: 'count', label: 'Ownership Count (4 to 0)' },
  ];

  return (
    <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar space-y-6 pb-6">
      {/* Header Row: Title on Left, Version Badge on Right */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b" style={{ borderColor: `${palette?.border || '#2A2F3D'}66` }}>
        <h1 className="text-4xl font-black font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
          SETTINGS AND CONFIGURATION
        </h1>
        <div className="flex items-center gap-2">
          <div 
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-black/40 shadow-sm"
            style={{ borderColor: palette?.border }}
          >
            <span className="text-xs font-mono font-bold tracking-wider" style={{ color: palette?.accent || '#38BDF8' }}>
              v{version}
            </span>
            {isTestEnv && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                🧙 TEST ENV
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic 2-Column Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Log Configuration, Background Behavior, Preferences        */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Section 1: MTG Arena Log Path Discovery */}
          <div 
            className="p-6 rounded-2xl border space-y-4 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" style={{ color: palette?.accent }} />
              <h3 className="text-base font-bold">MTGA Log Path Configuration</h3>
            </div>
            <p className="text-xs opacity-70 leading-relaxed">
              MTG Arena's active <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-emerald-400">Player.log</code> is auto-detected on launch from standard Steam and Wine/Proton locations. If it can't be found, use <strong>Browse</strong> to select it manually.
            </p>

            {/* Where to find Player.log — common install scenarios */}
            <div className="rounded-xl border p-3.5 space-y-2.5" style={{ borderColor: `${palette?.border || '#2A2F3D'}88`, backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: palette?.accent }}>
                Where to find Player.log
              </p>
              <div className="text-[11px] font-mono space-y-1.5 leading-relaxed">
                <div>
                  <span className="opacity-60">Steam (Proton):</span>{' '}
                  <span className="break-all" style={{ color: palette?.text }}>
                    &lt;SteamLibrary&gt;/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log
                  </span>
                </div>
                <div>
                  <span className="opacity-60">Steam (native Linux):</span>{' '}
                  <span className="break-all" style={{ color: palette?.text }}>
                    &lt;SteamLibrary&gt;/steamapps/common/MTGA/MTGA_Data/Downloads/Player.log
                  </span>
                </div>
                <div>
                  <span className="opacity-60">Without Steam (Wine):</span>{' '}
                  <span className="break-all" style={{ color: palette?.text }}>
                    &lt;wine-prefix&gt;/drive_c/users/&lt;user&gt;/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log
                  </span>
                </div>
              </div>
              <p className="text-[10px] font-mono opacity-50">
                Tip: <code className="opacity-80">SteamLibrary</code> is wherever your Steam games folder lives (e.g. <code className="opacity-80">~/Steam</code>, <code className="opacity-80">~/.local/share/Steam</code>, or a mounted drive).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase opacity-60">Active Player.log Path</label>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    type="text"
                    value={logPath}
                    onChange={(e) => setLogPath(e.target.value)}
                    placeholder={loadingPath ? 'Loading…' : 'No log detected — use Browse to select'}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-xs font-mono bg-black/30 focus:outline-none"
                    style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
                  />
                </div>
                <button
                  onClick={handleBrowse}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 shrink-0"
                  style={{ backgroundColor: palette?.accent, color: '#0B0C10' }}
                >
                  {browseSuccess ? <Check className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                  {browseSuccess ? 'Applied' : 'Browse…'}
                </button>
                <button
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 border shrink-0"
                  style={{ backgroundColor: `${palette?.surface || '#1A1D24'}99`, borderColor: palette?.border, color: palette?.text }}
                >
                  {savedSuccess ? <Check className="w-4 h-4" /> : null}
                  {savedSuccess ? 'Saved' : 'Save Config'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Desktop & Background Behavior */}
          <div 
            className="p-6 rounded-2xl border space-y-4 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" style={{ color: palette?.accent }} />
              <h3 className="text-base font-bold">Desktop & Background Behavior</h3>
            </div>

            {/* Minimize to Tray */}
            <div className="flex items-center justify-between pt-1">
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-bold" style={{ color: palette?.text }}>Minimize to System Tray on Close</p>
                <p className="text-[11px] opacity-60">Keep Rhystic Tracker actively tracking matches in the background when the main window is closed.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={minimizeToTray}
                onClick={() => handleToggleMinimizeToTray(!minimizeToTray)}
                className="relative inline-flex items-center h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none"
                style={{
                  backgroundColor: minimizeToTray ? (palette?.accent || '#38BDF8') : '#181B22',
                  borderColor: minimizeToTray ? (palette?.accent || '#38BDF8') : '#2E3545',
                }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-md transition-all duration-200 ease-in-out"
                  style={{
                    transform: minimizeToTray ? 'translateX(22px)' : 'translateX(2px)',
                    backgroundColor: minimizeToTray ? '#000000' : '#94A3B8',
                  }}
                />
              </button>
            </div>

            {/* Auto-switch to Live HUD */}
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: `${palette?.border}66` }}>
              <div className="space-y-0.5 pr-4">
                <p className="text-xs font-bold" style={{ color: palette?.text }}>Auto-Switch to Live Match HUD on Game Start</p>
                <p className="text-[11px] opacity-60">Automatically switch view to the Live Match HUD tab whenever a new match begins in MTGA.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoSwitchLiveHud}
                onClick={() => handleToggleAutoSwitchLiveHud(!autoSwitchLiveHud)}
                className="relative inline-flex items-center h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none"
                style={{
                  backgroundColor: autoSwitchLiveHud ? (palette?.accent || '#38BDF8') : '#181B22',
                  borderColor: autoSwitchLiveHud ? (palette?.accent || '#38BDF8') : '#2E3545',
                }}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-md transition-all duration-200 ease-in-out"
                  style={{
                    transform: autoSwitchLiveHud ? 'translateX(22px)' : 'translateX(2px)',
                    backgroundColor: autoSwitchLiveHud ? '#000000' : '#94A3B8',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Section 3: Navigation & Collection Preferences */}
          <div 
            className="p-6 rounded-2xl border space-y-4 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5" style={{ color: palette?.accent }} />
              <h3 className="text-base font-bold">Application & Collection Preferences</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Default Startup Tab */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase opacity-60">Default Startup Tab</label>
                <CustomDropdown
                  options={startupTabOptions}
                  value={defaultStartupTab}
                  onChange={handleChangeDefaultStartupTab}
                  palette={palette}
                />
                <p className="text-[10px] opacity-50">Select which tab opens automatically when Rhystic Tracker launches.</p>
              </div>

              {/* Default Collection Sort */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase opacity-60">Default Collection Sort</label>
                <CustomDropdown
                  options={collectionSortOptions}
                  value={defaultCollectionSort}
                  onChange={handleChangeDefaultCollectionSort}
                  palette={palette}
                />
                <p className="text-[10px] opacity-50">Initial card sort order applied when opening the Card Library view.</p>
              </div>
            </div>
          </div>

          {/* Section 4: 5-Mana Color Theme Picker */}
          <div 
            className="p-6 rounded-2xl border space-y-4 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5" style={{ color: palette?.accent }} />
                <h3 className="text-base font-bold">Mana Theme Customization</h3>
              </div>
              <span className="text-xs font-mono font-semibold px-3 py-1 rounded-full border bg-black/30" style={{ borderColor: palette?.border, color: palette?.accent }}>
                Active: {palette?.name}
              </span>
            </div>
            <p className="text-xs opacity-70">
              Select one of the 5 Magic color identity presets. All themes maintain the dark base UI while switching accent highlights.
            </p>

            <div className="grid grid-cols-5 gap-3 pt-1">
              {manaThemeOptions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveThemeId(t.id)}
                  className={`p-3.5 rounded-xl border flex flex-col items-center gap-2.5 transition-all ${
                    activeThemeId === t.id ? 'ring-2 ring-white/60 scale-105 shadow-lg' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border }}
                >
                  <ManaPip symbol={t.symbol} size={26} colorOverride={t.color} />
                  <span className="text-[11px] font-bold">{t.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Image Cache, Database Storage, Metadata, Legal Notices     */}
        {/* ========================================================================= */}
        <div className="space-y-6">
          {/* Section 5: Local Card Image Cache Manager */}
          <div 
            className="p-6 rounded-2xl border space-y-4 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" style={{ color: palette?.accent }} />
                <h3 className="text-base font-bold">Local Card Image Cache</h3>
              </div>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded border bg-black/30 opacity-75" style={{ borderColor: palette?.border }}>
                {formatBytes(cacheStats?.size_bytes ?? 0)}
              </span>
            </div>
            <p className="text-xs opacity-70 leading-relaxed">
              Scryfall card illustrations are cached locally on disk so card lists render instantly with zero network lag and full offline capability.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
                <p className="text-[10px] uppercase font-semibold opacity-60">Cached Images</p>
                <p className="text-lg font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
                  {cacheStats?.file_count?.toLocaleString() ?? 0} files
                </p>
              </div>
              <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
                <p className="text-[10px] uppercase font-semibold opacity-60">Storage Used</p>
                <p className="text-lg font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
                  {formatBytes(cacheStats?.size_bytes ?? 0)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handlePreDownloadArt}
                disabled={cacheDownloading}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 disabled:opacity-50 border"
                style={{ backgroundColor: `${palette?.accent}22`, borderColor: `${palette?.accent}66`, color: palette?.accent }}
              >
                <Download className={`w-3.5 h-3.5 ${cacheDownloading ? 'animate-bounce' : ''}`} />
                {cacheDownloading ? 'Pre-downloading…' : 'Pre-download Collection Art'}
              </button>
              <button
                onClick={handleClearCache}
                disabled={cacheClearing || (cacheStats?.file_count ?? 0) === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 disabled:opacity-40 border hover:bg-rose-500/20 text-rose-400"
                style={{ borderColor: 'rgba(244, 63, 94, 0.3)', backgroundColor: 'rgba(244, 63, 94, 0.08)' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {cacheClearing ? 'Clearing…' : 'Clear Image Cache'}
              </button>
            </div>
            {downloadProgress && (
              <p className="text-[11px] font-mono text-emerald-400 animate-pulse">{downloadProgress}</p>
            )}
            {cacheClearSuccess && (
              <p className="text-[11px] font-mono text-emerald-400">Card image cache successfully cleared.</p>
            )}
          </div>

          {/* Section 6: Database & Storage Management */}
          <div 
            className="p-6 rounded-2xl border space-y-4 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5" style={{ color: palette?.accent }} />
                <h3 className="text-base font-bold">Database & Storage Management</h3>
              </div>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded border bg-black/30 opacity-75" style={{ borderColor: palette?.border }}>
                {dbStats?.db_filename ?? 'rhystic.db'}
              </span>
            </div>
            <p className="text-xs opacity-70 leading-relaxed">
              Rhystic Tracker stores all match timelines, decklists, and collection logs 100% locally in an embedded SQLite database.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
                <p className="text-[10px] uppercase font-semibold opacity-60">Total Match Records</p>
                <p className="text-lg font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
                  {dbStats?.match_count?.toLocaleString() ?? 0}
                </p>
              </div>
              <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
                <p className="text-[10px] uppercase font-semibold opacity-60">Database Size</p>
                <p className="text-lg font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
                  {formatBytes(dbStats?.size_bytes ?? 0)}
                </p>
              </div>
            </div>

            {/* MTGA Card Database Indexing Status */}
            <div className="p-3.5 rounded-xl border space-y-2.5 bg-black/25" style={{ borderColor: palette?.border }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-semibold opacity-60">MTGA Indexed Card Universe</p>
                  <p className="text-sm font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
                    {cardDbStatus?.card_count ? (
                      <span className="text-emerald-400">{cardDbStatus.card_count.toLocaleString()} Cards Indexed</span>
                    ) : (
                      <span className="text-amber-400">0 Cards (Sync Required)</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleSyncCardDb}
                  disabled={cardDbSyncing}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 hover:opacity-90 active:scale-95 disabled:opacity-50 border"
                  style={{ backgroundColor: `${palette?.accent}22`, borderColor: `${palette?.accent}66`, color: palette?.accent }}
                >
                  <RefreshCw className={`w-3 h-3 ${cardDbSyncing ? 'animate-spin' : ''}`} />
                  {cardDbSyncing ? 'Indexing…' : 'Re-sync Cards'}
                </button>
              </div>
              <p className="text-[10px] font-mono break-all opacity-60">
                Raw DB: {cardDbStatus?.raw_path || 'Auto-scanning Steam / Lutris / Wine'}
              </p>
              {cardDbSyncResult && (
                <p className={`text-[11px] font-mono ${cardDbSyncResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {cardDbSyncResult.success ? `Indexed ${cardDbSyncResult.count.toLocaleString()} cards in ${cardDbSyncResult.elapsedMs}ms` : `Error: ${cardDbSyncResult.error}`}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase font-semibold opacity-50">Active Database Path</p>
              <p className="text-[11px] font-mono break-all px-2.5 py-1.5 rounded-lg border bg-black/40 opacity-75" style={{ borderColor: palette?.border }}>
                {dbStats?.db_path ?? '—'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={handleExportDb}
                disabled={dbExporting}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95"
                style={{ backgroundColor: palette?.accent, color: '#0B0C10' }}
              >
                <Download className="w-3.5 h-3.5" />
                {dbExporting ? 'Exporting…' : 'Backup / Export Database…'}
              </button>

              <button
                onClick={() => setShowResetWizardModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 border border-white/10 hover:border-white/30 text-neutral-300 hover:text-white"
                style={{ backgroundColor: `${palette?.mantle || '#12141A'}` }}
              >
                <Sliders className="w-3.5 h-3.5" />
                Re-run Setup Wizard…
              </button>
            </div>
            {dbExportSuccess && (
              <p className="text-xs font-mono text-emerald-400">{dbExportSuccess}</p>
            )}
          </div>

          {/* Section 7: Set Metadata (names + release dates) */}
          <div
            className="p-6 rounded-2xl border space-y-3 shadow-xl"
            style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" style={{ color: palette?.accent }} />
                <h3 className="text-base font-bold">Set Metadata</h3>
              </div>
              <button
                onClick={handleRefreshSets}
                disabled={setMetaBusy}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 disabled:opacity-50 border"
                style={{ backgroundColor: `${palette?.surface || '#1A1D24'}99`, borderColor: palette?.border, color: palette?.text }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${setMetaBusy ? 'animate-spin' : ''}`} />
                {setMetaBusy ? 'Updating…' : 'Update Set Lists'}
              </button>
            </div>
            <p className="text-xs opacity-70">
              Fetches set names and release dates from Scryfall so the Collection view can label sets and sort them by release date.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
                <p className="text-[10px] uppercase font-semibold opacity-60">Known Sets</p>
                <p className="text-lg font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
                  {setMetaStatus?.known_count ?? '—'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
                <p className="text-[10px] uppercase font-semibold opacity-60">Last Updated</p>
                <p className="text-xs font-mono opacity-80 mt-1.5">
                  {setMetaStatus?.last_updated ? new Date(setMetaStatus.last_updated).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
            {setMetaResult && (
              <p className="text-xs font-mono text-emerald-400">{setMetaResult}</p>
            )}
            {setMetaError && (
              <p className="text-xs font-mono text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {setMetaError}
              </p>
            )}
          </div>

          {/* Section 8: Wizards of the Coast & Scryfall Legal Attribution Notice */}
          <div 
            className="p-6 rounded-2xl border space-y-3 shadow-xl bg-black/30"
            style={{ borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Fan Content & Copyright Disclosures</h3>
            </div>
            <div className="text-xs opacity-75 space-y-2 leading-relaxed font-sans">
              <p>
                <strong>Rhystic Tracker</strong> is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.
              </p>
              <p>
                Card metadata, symbol artwork, and mana pips are fetched via <strong>Scryfall's API</strong> under Scryfall's Free Attribution License. Rhystic Tracker is free and open-source software.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL: RE-RUN SETUP WIZARD */}
      {showResetWizardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div 
            className="w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl"
            style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border || '#2A2F3D' }}
          >
            <div className="flex items-center space-x-3 text-sky-400">
              <Sliders className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Re-run First-Time Setup Wizard?</h3>
            </div>
            
            <p className="text-xs text-neutral-300 leading-relaxed">
              This will re-open the initial setup wizard to verify your MTGA log path and re-index the card database. 
              <br /><br />
              <strong className="text-emerald-400">Your match history and deck lists will not be deleted.</strong>
            </p>

            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowResetWizardModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-300 hover:text-white border border-white/10 hover:border-white/25 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResetWizard}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 transition-colors shadow-lg active:scale-95"
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
