import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, RefreshCw, Check, Gamepad2, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface NewAvatarReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  cachedCount: number;
  bundleMtime: number;
  onSyncComplete?: (newCount: number) => void;
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

export const NewAvatarReminderModal: React.FC<NewAvatarReminderModalProps> = ({
  isOpen,
  onClose,
  cachedCount,
  bundleMtime,
  onSyncComplete,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);
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

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await invoke<{ success: boolean; count: number; message: string }>('extract_avatars_from_mtga_client');
      if (res.success) {
        setSyncedCount(res.count);
        setSyncSuccess(true);
        if (bundleMtime > 0) {
          localStorage.setItem('rhystic_dismissed_avatar_bundle_mtime', String(bundleMtime));
        }
        onSyncComplete?.(res.count);
        window.dispatchEvent(new Event('rhystic_avatars_synced'));
        setTimeout(() => {
          setIsSyncing(false);
          setSyncSuccess(false);
          onClose();
        }, 1500);
      } else {
        setSyncError(res.message || 'Avatar synchronization failed');
        setIsSyncing(false);
      }
    } catch (err: any) {
      console.error('Failed to sync client avatars:', err);
      setSyncError(err?.toString() || 'Avatar synchronization failed');
      setIsSyncing(false);
    }
  };

  const handleDismiss = () => {
    if (bundleMtime > 0) {
      localStorage.setItem('rhystic_dismissed_avatar_bundle_mtime', String(bundleMtime));
    }
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in select-none"
      onClick={!isSyncing ? onClose : undefined}
    >
      <div
        className="w-full max-w-lg bg-neutral-950 border border-white/20 shadow-2xl flex flex-col overflow-hidden animate-scale-in rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-neutral-900/60">
          <div className="flex items-center gap-2.5" style={{ color: MTG_COLORS.blue.text }}>
            <Gamepad2 className="w-5 h-5" />
            <h3 className="text-sm font-sans font-bold uppercase tracking-wide text-white">
              New MTGA Avatars Available
            </h3>
          </div>
          {!isSyncing && (
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-none"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <p className="text-xs text-neutral-300 font-sans leading-relaxed">
            Magic: The Gathering Arena has downloaded updated asset packages containing new player avatars and character artwork. Synchronize them now to display authentic avatars across all match history, player profiles, and telemetry.
          </p>

          <div className="p-3.5 bg-neutral-900/70 border border-white/10 flex items-center justify-between">
            <span className="text-xs font-sans text-neutral-400 uppercase tracking-wider">
              Currently Cached Avatars
            </span>
            <span className="text-xs font-mono font-bold text-white tabular-nums">
              {cachedCount}
            </span>
          </div>

          {syncError && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono leading-relaxed break-words">
                {syncError}
              </div>
            </div>
          )}

          {syncSuccess && (
            <div
              className="p-3 border flex items-center gap-2.5 text-xs font-sans font-medium"
              style={{
                backgroundColor: MTG_COLORS.green.bg,
                borderColor: MTG_COLORS.green.border,
                color: '#86efac',
              }}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>Avatars successfully synchronized ({syncedCount} total)!</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-neutral-900/40 flex items-center justify-end gap-3 shrink-0">
          <button
            onClick={handleDismiss}
            disabled={isSyncing}
            className="px-4 py-2 border border-white/10 text-xs font-sans font-bold uppercase tracking-wider text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-none"
          >
            Remind Later
          </button>
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="px-5 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed rounded-none"
            style={{
              backgroundColor: MTG_COLORS.blue.bg,
              border: `1px solid ${MTG_COLORS.blue.border}`,
            }}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Extracting Avatars...</span>
              </>
            ) : syncSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Synchronized</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Extract Avatars</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
