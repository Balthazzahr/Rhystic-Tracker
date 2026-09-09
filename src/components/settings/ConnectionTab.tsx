import React from 'react';
import { Search, FolderOpen, Check, Radio } from 'lucide-react';
import { MTG_COLORS } from './types';

export interface ConnectionTabProps {
  palette: any;
  isSearching: boolean;

  // Search matches
  matchLogPath: boolean;
  matchBo3Sideboard: boolean;
  matchInstallLocations: boolean;

  // Log Path State & Handlers
  logPath: string;
  setLogPath: (path: string) => void;
  loadingPath: boolean;
  browseSuccess: boolean;
  savedSuccess: boolean;
  onBrowse: () => void;
  onSaveConfig: () => void;

  // Bo3 Sideboard
  bo3SideboardTracking: boolean;
  onToggleBo3Sideboard: (val: boolean) => void;
}

export const ConnectionTab: React.FC<ConnectionTabProps> = ({
  isSearching,
  matchLogPath,
  matchBo3Sideboard,
  matchInstallLocations,
  logPath,
  setLogPath,
  loadingPath,
  browseSuccess,
  savedSuccess,
  onBrowse,
  onSaveConfig,
  bo3SideboardTracking,
  onToggleBo3Sideboard,
}) => {
  return (
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
                onClick={onBrowse}
                className="px-4 py-2 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {browseSuccess ? <Check className="w-3.5 h-3.5" style={{ color: MTG_COLORS.green.text }} /> : <FolderOpen className="w-3.5 h-3.5" />}
                {browseSuccess ? 'Applied' : 'Browse…'}
              </button>
              <button
                onClick={onSaveConfig}
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
              onClick={() => onToggleBo3Sideboard(!bo3SideboardTracking)}
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
  );
};
