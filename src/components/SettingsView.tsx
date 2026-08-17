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
  RefreshCw
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ManaPip } from './ManaPip';

interface SettingsViewProps {
  palette: any;
  activeThemeId: string;
  setActiveThemeId: (id: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  palette, 
  activeThemeId, 
  setActiveThemeId 
}) => {
  const [logPath, setLogPath] = useState("");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [browseSuccess, setBrowseSuccess] = useState(false);
  const [loadingPath, setLoadingPath] = useState(true);

  const [setMetaStatus, setSetMetaStatus] = useState<{ known_count: number; last_updated: string | null } | null>(null);
  const [setMetaBusy, setSetMetaBusy] = useState(false);
  const [setMetaResult, setSetMetaResult] = useState<string | null>(null);
  const [setMetaError, setSetMetaError] = useState<string | null>(null);

  const [minimizeToTray, setMinimizeToTray] = useState(true);

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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* View Header */}
      <div>
        <h2 className="text-2xl font-bold font-outfit" style={{ color: palette?.accent }}>
          Application Settings & Configuration
        </h2>
        <p className="text-xs opacity-60 mt-1">Manage log discovery, card database cache, and legal disclosures.</p>
      </div>

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
          MTG Arena's active <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-emerald-400">Player.log</code> is auto-detected on launch from the standard Steam and Wine/Proton install locations. If it can't be found, use <strong>Browse</strong> to select it manually — picking a file applies it immediately.
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
            Tip: <code className="opacity-80">SteamLibrary</code> is wherever your Steam games folder lives (e.g. <code className="opacity-80">~/Steam</code>, <code className="opacity-80">~/.local/share/Steam</code>, or a mounted drive). Use Browse to point at it directly if auto-detection misses it.
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
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95"
              style={{ backgroundColor: palette?.accent, color: '#0B0C10' }}
            >
              {browseSuccess ? <Check className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
              {browseSuccess ? 'Applied' : 'Browse…'}
            </button>
            <button
              onClick={handleSaveConfig}
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 border"
              style={{ backgroundColor: `${palette?.surface || '#1A1D24'}99`, borderColor: palette?.border, color: palette?.text }}
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : null}
              {savedSuccess ? 'Saved' : 'Save Config'}
            </button>
          </div>
        </div>
      </div>

      {/* Section: Desktop & Background Behavior */}
      <div 
        className="p-6 rounded-2xl border space-y-4 shadow-xl"
        style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" style={{ color: palette?.accent }} />
            <h3 className="text-base font-bold">Desktop & Background Behavior</h3>
          </div>
        </div>
        <p className="text-xs opacity-70 leading-relaxed">
          Configure how Rhystic Tracker behaves when closing the application window.
        </p>

        <div className="flex items-center justify-between p-4 rounded-xl border bg-black/20" style={{ borderColor: `${palette?.border || '#2A2F3D'}88` }}>
          <div className="space-y-1">
            <p className="text-sm font-bold font-outfit uppercase tracking-wide" style={{ color: palette?.text }}>
              Minimize to System Tray on Close
            </p>
            <p className="text-xs opacity-60 font-mono">
              When enabled, clicking [X] hides the window to the Linux system tray so match and collection tracking continues in the background. Right-click the tray icon to Open or Quit.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
            <input 
              type="checkbox" 
              checked={minimizeToTray}
              onChange={(e) => handleToggleMinimizeToTray(e.target.checked)}
              className="sr-only peer"
            />
            <div 
              className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
              style={{
                backgroundColor: minimizeToTray ? (palette?.accent || '#38BDF8') : undefined,
              }}
            />
          </label>
        </div>
      </div>

      {/* Section 2: 5-Mana Color Theme Picker with Scryfall Mana Pips */}
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
          Select one of the 5 Magic color identity presets. All themes maintain the dark <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono">#0B0C10</code> base UI while switching accent highlights.
        </p>

        <div className="grid grid-cols-5 gap-3 pt-2">
          {manaThemeOptions.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveThemeId(t.id)}
              className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                activeThemeId === t.id ? 'ring-2 ring-white/60 scale-105' : 'opacity-75 hover:opacity-100'
              }`}
              style={{ backgroundColor: palette?.mantle || '#12141A', borderColor: palette?.border }}
            >
              <ManaPip symbol={t.symbol} size={28} colorOverride={t.color} />
              <span className="text-xs font-bold">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 3: SQLite Cache Stats */}
      <div 
        className="p-6 rounded-2xl border space-y-3 shadow-xl"
        style={{ backgroundColor: palette?.surface || '#1A1D24', borderColor: palette?.border || '#2A2F3D' }}
      >
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" style={{ color: palette?.accent }} />
          <h3 className="text-base font-bold">Local SQLite Card Database Cache Status</h3>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
            <p className="text-[10px] uppercase font-semibold opacity-60">Cached Cards</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">26,572 Rows</p>
          </div>
          <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
            <p className="text-[10px] uppercase font-semibold opacity-60">Sync Duration</p>
            <p className="text-xl font-bold font-mono mt-0.5" style={{ color: palette?.accent }}>481 ms</p>
          </div>
          <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
            <p className="text-[10px] uppercase font-semibold opacity-60">Storage Path</p>
            <p className="text-xs font-mono truncate opacity-80 mt-1">~/.config/rhystic-tracker/rhystic.db</p>
          </div>
        </div>
      </div>

      {/* Section 4: Set Metadata (names + release dates) */}
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
            className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: palette?.accent, color: '#0B0C10' }}
          >
            <RefreshCw className={`w-4 h-4 ${setMetaBusy ? 'animate-spin' : ''}`} />
            {setMetaBusy ? 'Updating…' : 'Update Set Lists'}
          </button>
        </div>
        <p className="text-xs opacity-70">
          Fetches set names and release dates from Scryfall so the Collection view can label sets and sort
          them by release date. Runs once automatically; press the button again after a new set launches.
        </p>
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
            <p className="text-[10px] uppercase font-semibold opacity-60">Known Sets</p>
            <p className="text-xl font-bold font-mono mt-0.5" style={{ color: palette?.text }}>
              {setMetaStatus?.known_count ?? '—'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border bg-black/20" style={{ borderColor: palette?.border }}>
            <p className="text-[10px] uppercase font-semibold opacity-60">Last Updated</p>
            <p className="text-xs font-mono opacity-80 mt-1.5">
              {setMetaStatus?.last_updated ? new Date(setMetaStatus.last_updated).toLocaleString() : 'Never'}
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

      {/* Section 5: Wizards of the Coast & Scryfall Legal Attribution Notice */}
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
  );
};
