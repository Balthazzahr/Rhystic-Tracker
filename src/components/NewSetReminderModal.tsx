import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, RefreshCw, Check, Calendar } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export interface DetectedSet {
  code: string;
  name: string;
  released_at?: string | null;
  icon_svg_uri?: string | null;
  set_type?: string;
}

interface NewSetReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  newSets: DetectedSet[];
  allScryfallSets: any[];
  palette?: any;
  onSyncComplete?: () => void;
}

const MTG_COLORS = {
  blue: {
    bg: '#0F2A4A',
    border: '#1E4A78',
    text: '#4A7FA3',
    hover: '#183B63',
  },
  green: {
    bg: '#0D3320',
    border: '#1B5E3C',
    text: '#4A7856',
  },
};

export const NewSetReminderModal: React.FC<NewSetReminderModalProps> = ({
  isOpen,
  onClose,
  newSets,
  allScryfallSets,
  onSyncComplete,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSyncing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSyncing]);

  if (!isOpen || newSets.length === 0) return null;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      // 1. Refresh set metadata with all Scryfall sets
      const setsPayload = allScryfallSets.map((s: any) => ({
        code: s.code,
        name: s.name,
        released_at: s.released_at || null,
        icon_svg_uri: s.icon_svg_uri || null,
      }));
      await invoke('refresh_set_metadata', { sets: setsPayload });

      // 2. Synchronize MTGA card database
      await invoke('sync_card_database');

      // 3. Mark dismissed/acknowledged in localStorage
      const existingDismissed = JSON.parse(localStorage.getItem('rhystic_dismissed_sets') || '[]');
      const newCodes = newSets.map((s) => s.code.toUpperCase());
      const updatedDismissed = Array.from(new Set([...existingDismissed, ...newCodes]));
      localStorage.setItem('rhystic_dismissed_sets', JSON.stringify(updatedDismissed));

      setSyncSuccess(true);
      onSyncComplete?.();

      window.dispatchEvent(new Event('rhystic_settings_changed'));
      window.dispatchEvent(new CustomEvent('rhystic-collection-updated', { detail: {} }));

      setTimeout(() => {
        setIsSyncing(false);
        setSyncSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to sync library and sets:', err);
      setSyncError(err?.toString() || 'Synchronization failed');
      setIsSyncing(false);
    }
  };

  const handleDismiss = () => {
    const existingDismissed = JSON.parse(localStorage.getItem('rhystic_dismissed_sets') || '[]');
    const newCodes = newSets.map((s) => s.code.toUpperCase());
    const updatedDismissed = Array.from(new Set([...existingDismissed, ...newCodes]));
    localStorage.setItem('rhystic_dismissed_sets', JSON.stringify(updatedDismissed));
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none"
      onClick={!isSyncing ? onClose : undefined}
    >
      <div
        className="w-full max-w-lg bg-neutral-950 border border-white/20 shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <div className="flex items-center gap-2.5" style={{ color: MTG_COLORS.blue.text }}>
            <Sparkles className="w-5 h-5" />
            <h3 className="text-sm font-sans font-bold uppercase tracking-wide text-white">
              New Magic Sets Detected
            </h3>
          </div>
          {!isSyncing && (
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <p className="text-xs text-neutral-300 font-sans leading-relaxed">
            Scryfall has registered new Magic set releases. Synchronize your card database and set catalog to update card imagery, legality rules, and collection tracking.
          </p>

          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-bold">
              Detected Sets ({newSets.length})
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar border border-white/10 bg-white/[0.02] p-2">
              {newSets.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center justify-between p-2 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase bg-white/10 text-amber-300 border border-amber-300/30 shrink-0">
                      {s.code.toUpperCase()}
                    </span>
                    <span className="text-xs font-sans text-neutral-200 truncate">
                      {s.name}
                    </span>
                  </div>
                  {s.released_at && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 shrink-0 ml-2">
                      <Calendar className="w-3 h-3 text-neutral-500" />
                      <span>{s.released_at}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {syncError && (
            <p className="text-xs font-mono text-red-400 bg-red-950/40 border border-red-800/50 p-2.5">
              {syncError}
            </p>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between gap-3 bg-neutral-900/60 shrink-0">
          <button
            onClick={handleDismiss}
            disabled={isSyncing}
            className="px-4 py-2 border border-white/10 hover:border-white/20 text-xs font-mono uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            Remind Me Later
          </button>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            style={
              syncSuccess
                ? { backgroundColor: MTG_COLORS.green.bg, borderColor: MTG_COLORS.green.border }
                : { backgroundColor: MTG_COLORS.blue.bg, borderColor: MTG_COLORS.blue.border }
            }
            className="px-4 py-2 border hover:brightness-125 active:scale-95 text-xs font-mono font-bold uppercase tracking-wider text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: MTG_COLORS.blue.text }} />
                <span>Synchronizing…</span>
              </>
            ) : syncSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span>Synced Successfully!</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" style={{ color: MTG_COLORS.blue.text }} />
                <span>Sync Library & Sets</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
