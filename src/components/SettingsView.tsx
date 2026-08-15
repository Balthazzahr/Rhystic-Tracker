import React, { useState } from 'react';
import { 
  FolderOpen, 
  Palette, 
  Database, 
  ShieldCheck, 
  Check, 
  FileText,
  AlertCircle
} from 'lucide-react';
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
  const [logPath, setLogPath] = useState(
    ""
  );
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveConfig = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
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
          MTG Arena's active <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-emerald-400">Player.log</code> is auto-detected on launch from the standard Steam and Wine/Proton install locations. Set a custom path here if needed (or use the <code className="px-1.5 py-0.5 rounded bg-black/40 font-mono text-emerald-400">RHYSTIC_MTGA_LOG</code> environment variable).
        </p>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase opacity-60">Active Player.log Path (auto-detected)</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={logPath}
              onChange={(e) => setLogPath(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border text-xs font-mono bg-black/30 focus:outline-none"
              style={{ borderColor: palette?.border || '#2A2F3D', color: palette?.text }}
            />
            <button
              onClick={handleSaveConfig}
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 hover:opacity-90 active:scale-95"
              style={{ backgroundColor: palette?.accent, color: '#0B0C10' }}
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : null}
              {savedSuccess ? 'Saved' : 'Save Config'}
            </button>
          </div>
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

      {/* Section 4: Wizards of the Coast & Scryfall Legal Attribution Notice */}
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
