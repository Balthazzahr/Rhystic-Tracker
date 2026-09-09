import React from 'react';
import { Sliders } from 'lucide-react';
import { CustomDropdown } from '../CustomDropdown';
import { MTG_COLORS } from './types';

export interface GeneralTabProps {
  palette: any;
  isSearching: boolean;
  // Search flags
  matchMinimize: boolean;
  matchAutoSwitch: boolean;
  matchAlwaysOnTop: boolean;
  matchAudioCues: boolean;
  matchExcludeSparky: boolean;
  matchConfirmDelete: boolean;
  matchAllowDelete: boolean;
  matchAutoExport: boolean;
  matchStartupTab: boolean;
  matchSetupWizard: boolean;

  // State values
  minimizeToTray: boolean;
  autoSwitchLiveHud: boolean;
  liveHudAlwaysOnTop: boolean;
  excludeSparkyMatches: boolean;
  enableAudioCues: boolean;
  confirmDeckDelete: boolean;
  allowMatchDeletion: boolean;
  autoExportMatches: boolean;
  autoExportFormat: string;
  defaultStartupTab: string;

  // Options
  autoExportFormatOptions: { value: string; label: string }[];
  startupTabOptions: { value: string; label: string }[];

  // Action Handlers
  onToggleMinimizeToTray: (val: boolean) => void;
  onToggleAutoSwitchLiveHud: (val: boolean) => void;
  onToggleAlwaysOnTop: (val: boolean) => void;
  onToggleExcludeSparky: (val: boolean) => void;
  onToggleAudioCues: (val: boolean) => void;
  onToggleConfirmDeckDelete: (val: boolean) => void;
  onToggleAllowMatchDeletion: (val: boolean) => void;
  onToggleAutoExport: (val: boolean) => void;
  onChangeAutoExportFormat: (val: string) => void;
  onChangeDefaultStartupTab: (val: string) => void;
  onOpenResetWizardModal: () => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
  palette,
  isSearching,
  matchMinimize,
  matchAutoSwitch,
  matchAlwaysOnTop,
  matchAudioCues,
  matchExcludeSparky,
  matchConfirmDelete,
  matchAllowDelete,
  matchAutoExport,
  matchStartupTab,
  matchSetupWizard,
  minimizeToTray,
  autoSwitchLiveHud,
  liveHudAlwaysOnTop,
  excludeSparkyMatches,
  enableAudioCues,
  confirmDeckDelete,
  allowMatchDeletion,
  autoExportMatches,
  autoExportFormat,
  defaultStartupTab,
  autoExportFormatOptions,
  startupTabOptions,
  onToggleMinimizeToTray,
  onToggleAutoSwitchLiveHud,
  onToggleAlwaysOnTop,
  onToggleExcludeSparky,
  onToggleAudioCues,
  onToggleConfirmDeckDelete,
  onToggleAllowMatchDeletion,
  onToggleAutoExport,
  onChangeAutoExportFormat,
  onChangeDefaultStartupTab,
  onOpenResetWizardModal,
}) => {
  return (
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
                  onClick={() => onToggleMinimizeToTray(!minimizeToTray)}
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
                  onClick={() => onToggleAutoSwitchLiveHud(!autoSwitchLiveHud)}
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
                  onClick={() => onToggleAlwaysOnTop(!liveHudAlwaysOnTop)}
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
                  onClick={() => onToggleExcludeSparky(!excludeSparkyMatches)}
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
                  onClick={() => onToggleAudioCues(!enableAudioCues)}
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
                  onClick={() => onToggleConfirmDeckDelete(!confirmDeckDelete)}
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
                  onClick={() => onToggleAllowMatchDeletion(!allowMatchDeletion)}
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
                onClick={() => onToggleAutoExport(!autoExportMatches)}
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
                onChange={onChangeAutoExportFormat}
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
                  onChange={onChangeDefaultStartupTab}
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
                    onClick={onOpenResetWizardModal}
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
  );
};
