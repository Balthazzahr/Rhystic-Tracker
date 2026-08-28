import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Database, 
  FileText, 
  Layers, 
  ArrowRight, 
  ArrowLeft,
  Sparkles,
  Check,
  FolderOpen,
  LayoutDashboard,
  Swords,
  Clock,
  BookOpen,
  Compass,
  Palette,
  ExternalLink,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { LogoQuill } from './LogoQuill';
import { ManaPip } from './ManaPip';

interface SetupStatus {
  setup_completed: boolean;
  card_count: number;
  log_path: string | null;
  raw_path: string | null;
}

interface FirstTimeSetupWizardProps {
  theme: any;
  activeThemeId?: string;
  setActiveThemeId?: (id: string) => void;
  onFinish: () => void;
}

export const FirstTimeSetupWizard: React.FC<FirstTimeSetupWizardProps> = ({ 
  theme, 
  activeThemeId = 'blue', 
  setActiveThemeId, 
  onFinish 
}) => {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  
  const [customLogPath, setCustomLogPath] = useState<string>('');
  const [customRawPath, setCustomRawPath] = useState<string>('');
  const [isEditingPaths, setIsEditingPaths] = useState<boolean>(false);
  
  const [syncResult, setSyncResult] = useState<{ success: boolean; count: number; elapsedMs: number; error?: string } | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await invoke<SetupStatus>('get_setup_status');
      setSetupStatus(res);
      if (res.log_path) setCustomLogPath(res.log_path);
      if (res.raw_path) setCustomRawPath(res.raw_path);
    } catch (err) {
      console.error('Failed to get setup status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleBrowseLog = async () => {
    try {
      const selected = await open({
        title: 'Select MTG Arena Player.log',
        filters: [{ name: 'Player Log', extensions: ['log'] }],
        multiple: false,
      });
      if (typeof selected === 'string' && selected) {
        const effective = await invoke<string>('set_log_path', { path: selected });
        setCustomLogPath(effective);
        await fetchStatus();
      }
    } catch (e) {
      console.error('Failed to pick log path:', e);
    }
  };

  const handleBrowseRawDir = async () => {
    try {
      const selected = await open({
        title: 'Select MTGA "Raw" Downloads Directory',
        directory: true,
        multiple: false,
      });
      if (typeof selected === 'string' && selected) {
        await invoke('set_raw_path', { path: selected });
        setCustomRawPath(selected);
        await fetchStatus();
      }
    } catch (e) {
      console.error('Failed to pick raw directory:', e);
    }
  };

  const handleSaveLogPath = async () => {
    try {
      await invoke('set_log_path', { path: customLogPath });
      await fetchStatus();
      setIsEditingPaths(false);
    } catch (err) {
      console.error('Failed to save log path:', err);
    }
  };

  const handleSaveRawPath = async () => {
    try {
      await invoke('set_raw_path', { path: customRawPath });
      await fetchStatus();
      setIsEditingPaths(false);
    } catch (err) {
      console.error('Failed to save raw path:', err);
    }
  };

  const handleSyncDatabase = async () => {
    try {
      setSyncing(true);
      const res = await invoke<{ success: boolean; card_count: number; elapsed_ms: number; raw_path: string | null; error: string | null }>('sync_card_database');
      setSyncResult({
        success: res.success,
        count: res.card_count,
        elapsedMs: Number(res.elapsed_ms),
        error: res.error || undefined
      });
      await fetchStatus();
    } catch (err: any) {
      setSyncResult({
        success: false,
        count: 0,
        elapsedMs: 0,
        error: err?.toString() || 'Unknown sync error'
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleComplete = async () => {
    try {
      await invoke('complete_setup');
      onFinish();
    } catch (err) {
      console.error('Failed to complete setup:', err);
      onFinish();
    }
  };

  const manaThemeOptions = [
    { id: 'white', label: 'White', symbol: 'W', color: '#E8E2CC' },
    { id: 'blue', label: 'Blue', symbol: 'U', color: '#4A7FA3' },
    { id: 'black', label: 'Black', symbol: 'B', color: '#8a719d' },
    { id: 'red', label: 'Red', symbol: 'R', color: '#B8503A' },
    { id: 'green', label: 'Green', symbol: 'G', color: '#4A7856' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div 
        className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-all duration-300"
        style={{ 
          backgroundColor: theme.mantle, 
          borderColor: theme.border,
          boxShadow: `0 25px 60px -15px ${theme.primary}25`
        }}
      >
        {/* Modal Header */}
        <div 
          className="p-5 sm:p-6 border-b flex items-center justify-between"
          style={{ borderColor: theme.border, backgroundColor: theme.surface }}
        >
          <div className="flex items-center space-x-3.5">
            <LogoQuill size={34} accentColor={theme.primary || theme.accent} />
            <div>
              <h2 className="rt-card-title leading-tight" style={{ color: theme.text || '#FFFFFF' }}>
                Rhystic Tracker Setup Guide
              </h2>
              <p className="rt-label opacity-60 mt-0.5" style={{ color: theme.subtext || '#94A3B8' }}>
                Step {step} of 5 — Getting Started on Linux
              </p>
            </div>
          </div>

          {/* Stepper Indicator */}
          <div className="flex items-center space-x-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <div 
                key={s} 
                className={`h-2 rounded-full transition-all duration-300 ${
                  s === step 
                    ? 'w-6' 
                    : s < step 
                    ? 'w-2 bg-emerald-500' 
                    : 'w-2 bg-neutral-700'
                }`}
                style={s === step ? { backgroundColor: theme.primary || theme.accent } : {}}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6 text-sm custom-scrollbar">
          {/* STEP 1: Log Discovery & MTGA Detailed Logs */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="rt-section-header flex items-center gap-2 text-white">
                  <FileText className="w-5 h-5 text-sky-400" />
                  Step 1: MTG Arena Log Discovery
                </h3>
                <p className="rt-narrative-sm opacity-70 mt-1">
                  Rhystic Tracker operates out-of-process without memory hooks, reading game actions directly from MTGA's client log.
                </p>
              </div>

              {/* Status Box */}
              <div 
                className="p-4 rounded-xl border flex flex-col space-y-3"
                style={{ backgroundColor: theme.base, borderColor: theme.border }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {setupStatus?.log_path ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="rt-label opacity-90" style={{ color: theme.text || '#FFFFFF' }}>
                        {setupStatus?.log_path ? 'Log File Auto-Detected' : 'Searching for MTGA Log'}
                      </div>
                      <div className="text-xs text-neutral-300 font-mono break-all mt-1.5 bg-black/40 p-2 rounded border border-white/5">
                        {setupStatus?.log_path || 'No Player.log found in default Steam / Wine / Lutris paths yet.'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleBrowseLog}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 text-white bg-white/5 hover:bg-white/10 transition-colors shrink-0 ml-3 flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-sky-400" /> Browse…
                  </button>
                </div>
              </div>

              {/* Detailed Logging Requirement Tip */}
              <div 
                className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-200 text-xs space-y-2"
              >
                <div className="rt-section-header flex items-center gap-1.5 text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  Action Required: Enable Detailed Logs in MTG Arena
                </div>
                <p className="rt-narrative-sm text-neutral-200 leading-relaxed">
                  1. Launch <strong>Magic: The Gathering Arena</strong>.<br />
                  2. Click the <strong>Gear Icon (Options)</strong> in the top-right &gt; <strong>Account</strong>.<br />
                  3. Check <strong>"Detailed Logs (Plugin Support)"</strong> and restart MTG Arena.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Card Database Sync & Structure Guide */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="rt-section-header flex items-center gap-2 text-white">
                  <Database className="w-5 h-5 text-indigo-400" />
                  Step 2: Local MTGA Card Database Indexing
                </h3>
                <p className="rt-narrative-sm opacity-70 mt-1">
                  Rhystic Tracker reads MTGA's local card database to resolve card names, types, mana values, and artwork locally with zero latency.
                </p>
              </div>

              {/* Status & Sync Card */}
              <div 
                className="p-4 rounded-xl border space-y-4"
                style={{ backgroundColor: theme.base, borderColor: theme.border }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="rt-label opacity-60">Indexed Database Status</div>
                    <div className="text-xl font-bold font-display text-white mt-1 flex items-center gap-2">
                      {setupStatus && setupStatus.card_count > 0 ? (
                        <>
                          <span className="text-emerald-400 font-mono tabular-nums">{setupStatus.card_count.toLocaleString()}</span> Cards Ready
                        </>
                      ) : (
                        <span className="text-amber-400">Not Indexed Yet (0 cards)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBrowseRawDir}
                      className="text-xs px-3 py-2 rounded-xl border border-white/10 hover:border-white/30 text-white bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-indigo-400" /> Browse Folder…
                    </button>
                    <button
                      onClick={handleSyncDatabase}
                      disabled={syncing}
                      className="px-4 py-2 rounded-xl text-xs font-bold font-display uppercase tracking-wider text-white flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: theme.primary || theme.accent }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Indexing Database...' : (setupStatus && setupStatus.card_count > 0 ? 'Re-sync Cards' : 'Start Card Sync')}
                    </button>
                  </div>
                </div>

                {/* Detected Path Preview */}
                <div className="text-xs text-neutral-300 font-mono break-all bg-black/40 p-2.5 rounded border border-white/5 space-y-1">
                  <div className="rt-label opacity-60">Detected MTGA Raw Database Location:</div>
                  <div>{setupStatus?.raw_path || 'Scanning standard Steam / Lutris / Wine locations...'}</div>
                </div>

                {/* Path Structure Tooltip / Guidance */}
                <div className="p-3.5 rounded-lg border border-white/5 bg-white/[0.02] space-y-1.5">
                  <div className="rt-section-header text-white flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                    How MTG Arena Stores Card Data on Linux:
                  </div>
                  <p className="rt-narrative-sm opacity-75 leading-relaxed">
                    Regardless of whether you use Steam, Lutris, Bottles, or Wine, MTGA always stores its SQLite card index in:
                    <br />
                    <code className="font-mono text-neutral-300 bg-black/50 px-1 py-0.5 rounded text-[11px]">.../MTGA/MTGA_Data/Downloads/Raw/Raw_CardDatabase_&lt;hash&gt;.mtga</code>
                    <br />
                    If your installation is on a custom external drive, simply use the <strong>Browse Folder</strong> button above to select your <code className="font-mono text-[11px]">.../Raw/</code> directory.
                  </p>
                </div>

                {/* Sync Result Banner */}
                {syncResult && (
                  <div className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
                    syncResult.success 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}>
                    {syncResult.success ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span className="rt-narrative-sm font-bold">Successfully indexed {syncResult.count.toLocaleString()} cards in {syncResult.elapsedMs} ms!</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                        <span className="rt-narrative-sm">Sync failed: {syncResult.error || 'Could not locate Raw_CardDatabase_*.mtga'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: True Decklist Import & Protection */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="rt-section-header flex items-center gap-2 text-white">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  Step 3: True Decklists & Theft Protection
                </h3>
                <p className="rt-narrative-sm opacity-70 mt-1">
                  Learn how Rhystic Tracker derives your genuine collection without card pollution from theft or copy mechanics.
                </p>
              </div>

              {/* Step-by-Step Decklist Import Box */}
              <div 
                className="p-4 rounded-xl border space-y-3"
                style={{ backgroundColor: theme.base, borderColor: theme.border }}
              >
                <div className="rt-label opacity-90 flex items-center gap-2" style={{ color: theme.text || '#FFFFFF' }}>
                  <Check className="w-4 h-4 text-emerald-400" />
                  How to Import a True Decklist (3 Simple Steps)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                    <div className="text-xs font-bold font-display uppercase tracking-wider text-sky-400">1. In MTG Arena</div>
                    <p className="rt-narrative-sm opacity-75">
                      Open your Decks in MTGA, click your deck, and click the <strong>Export</strong> button at the bottom.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                    <div className="text-xs font-bold font-display uppercase tracking-wider text-sky-400">2. In Rhystic Tracker</div>
                    <p className="rt-narrative-sm opacity-75">
                      Navigate to the <strong>Deck Library</strong> tab, select your logged deck, and click <strong>True Decklist Import</strong>.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5 space-y-1">
                    <div className="text-xs font-bold font-display uppercase tracking-wider text-sky-400">3. Paste & Save</div>
                    <p className="rt-narrative-sm opacity-75">
                      Paste the MTGA export format text. Rhystic Tracker validates all cards and registers them into your owned collection!
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rt-narrative-sm">
                  <strong>Why True Decklists?</strong> In-game cards created via <em>Heist, Theft, Conjure, or Token Copy</em> mechanics will never pollute your collection or alter your genuine ownership metrics.
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Full App & Sidebar Tour */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h3 className="rt-section-header flex items-center gap-2 text-white">
                  <Compass className="w-5 h-5 text-purple-400" />
                  Step 4: Application Feature Overview
                </h3>
                <p className="rt-narrative-sm opacity-70 mt-1">
                  Here is what each section in the navigation menu does:
                </p>
              </div>

              {/* Nav Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-white/5 bg-black/30 space-y-1">
                  <div className="font-bold font-display uppercase tracking-wide text-xs text-white flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-sky-400" />
                    Dashboard
                  </div>
                  <p className="rt-narrative-sm opacity-70 leading-relaxed">
                    Today's & all-time win rates, current winning streaks, daily match summaries, and MVP deck spotlights.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-white/5 bg-black/30 space-y-1">
                  <div className="font-bold font-display uppercase tracking-wide text-xs text-white flex items-center gap-2">
                    <Swords className="w-4 h-4 text-rose-400" />
                    Live Match HUD
                  </div>
                  <p className="rt-narrative-sm opacity-70 leading-relaxed">
                    Real-time in-game overlay showing life swings, turn plays, token creations, and combat/spell damage attributions.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-white/5 bg-black/30 space-y-1">
                  <div className="font-bold font-display uppercase tracking-wide text-xs text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    Match History & Inspector
                  </div>
                  <p className="rt-narrative-sm opacity-70 leading-relaxed">
                    Turn-by-turn combat replay timeline, damage badges (<code className="text-neutral-300 font-mono">[4 DMG]</code>), and Head-to-Head opponent histories.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-white/5 bg-black/30 space-y-1">
                  <div className="font-bold font-display uppercase tracking-wide text-xs text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Deck Library
                  </div>
                  <p className="rt-narrative-sm opacity-70 leading-relaxed">
                    Mana curve distributions, color breakdowns, responsive 3-column deck lists, and True Decklist management.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-white/5 bg-black/30 space-y-1 sm:col-span-2">
                  <div className="font-bold font-display uppercase tracking-wide text-xs text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    Card Library & Combat Analytics
                  </div>
                  <p className="rt-narrative-sm opacity-70 leading-relaxed">
                    26,000+ card browser in full card frame view, 4-diamond interactive ownership adjusters, and persistent per-card combat analytics.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Customization & Launch */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h3 className="rt-section-header flex items-center gap-2 text-white">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  Step 5: Personalization & Ready to Play!
                </h3>
                <p className="rt-narrative-sm opacity-70 mt-1">
                  Select your favorite MTG color-identity theme. All configuration options can be adjusted later in Settings.
                </p>
              </div>

              {/* Theme Picker */}
              <div 
                className="p-4 rounded-xl border space-y-3"
                style={{ backgroundColor: theme.base, borderColor: theme.border }}
              >
                <div className="flex items-center justify-between">
                  <span className="rt-label opacity-70 flex items-center gap-2" style={{ color: theme.text || '#FFFFFF' }}>
                    <Palette className="w-4 h-4 text-sky-400" />
                    Choose Your Mana Theme
                  </span>
                  <span className="text-xs font-mono font-bold text-white capitalize">
                    {activeThemeId} Theme Active
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2.5 pt-1">
                  {manaThemeOptions.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveThemeId?.(t.id)}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                        activeThemeId === t.id ? 'ring-2 ring-white scale-105 shadow-lg' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                    >
                      <ManaPip symbol={t.symbol} size={24} colorOverride={t.color} />
                      <span className="text-[11px] font-bold font-display uppercase tracking-wide text-white">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ready Confirmation */}
              <div 
                className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center space-x-3"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="rt-section-header text-emerald-300">You're All Set!</div>
                  <div className="rt-narrative-sm text-neutral-200 mt-0.5">
                    Launch MTG Arena and play a match. Rhystic Tracker will continuously track your combat, turns, and deck stats.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div 
          className="p-4 border-t flex items-center justify-between"
          style={{ borderColor: theme.border, backgroundColor: theme.surface }}
        >
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 rounded-xl text-xs font-bold font-display uppercase tracking-wider text-neutral-300 hover:text-white border border-white/10 hover:border-white/25 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              onClick={() => {
                if (step === 1 && (!setupStatus || setupStatus.card_count === 0) && !syncResult) {
                  handleSyncDatabase();
                }
                setStep(step + 1);
              }}
              className="px-5 py-2.5 rounded-xl text-xs font-bold font-display uppercase tracking-wider text-white flex items-center gap-2 transition-all shadow-md active:scale-95"
              style={{ backgroundColor: theme.primary || theme.accent }}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-6 py-2.5 rounded-xl text-xs font-bold font-display uppercase tracking-wider text-white flex items-center gap-2 transition-all shadow-lg active:scale-95 bg-emerald-600 hover:bg-emerald-500"
            >
              Launch Rhystic Tracker <Sparkles className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
