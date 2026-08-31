import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, X, ShieldCheck, Download, Gamepad2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import defaultAvatarImg from '../assets/avatars/_npe_Player.png';
import { getAvatarCacheStats } from '../utils/avatarImageCache';

interface AvatarOnboardingModalProps {
  onClose: () => void;
}

export const AvatarOnboardingModal: React.FC<AvatarOnboardingModalProps> = ({ onClose }) => {
  const [extracting, setExtracting] = useState(false);
  const [extractedCount, setExtractedCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExtract = async () => {
    setExtracting(true);
    setErrorMsg(null);
    try {
      // 1. Trigger client extraction
      const res = await invoke<{ success: boolean; count: number; message: string }>('extract_avatars_from_mtga_client');
      const stats = await getAvatarCacheStats();
      setExtractedCount(stats.file_count || res.count);
      localStorage.setItem('rhystic_avatar_onboarding_dismissed', 'true');
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (e: any) {
      console.error('Failed to extract client avatars:', e);
      setErrorMsg(e?.toString() || 'Failed to extract avatars from MTGA client.');
    } finally {
      setExtracting(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('rhystic_avatar_onboarding_dismissed', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-neutral-950 border border-white/20 shadow-2xl p-6 relative flex flex-col gap-5 text-left animate-scale-in"
      >
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Dismiss notice"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Avatar Artwork */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 shrink-0 bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
            <img 
              src={defaultAvatarImg} 
              alt="Avatar Feature" 
              className="w-full h-full object-contain object-bottom drop-shadow-md"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[#E2BF6F] text-xs font-mono font-bold tracking-wider uppercase mb-1">
              <Sparkles className="w-3.5 h-3.5" /> What's New
            </div>
            <h2 className="text-xl font-bold font-display uppercase tracking-wide text-white leading-tight">
              Arena Avatars & Platform Telemetry
            </h2>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-neutral-300 leading-relaxed">
          The <strong>Match History Inspector</strong> now features authentic Arena character avatars, arcade-style face-off staging, and live device platform detection (Steam, PC, iOS, Android).
        </p>

        <div className="p-3.5 bg-white/[0.03] border border-white/10 text-xs text-neutral-300 space-y-1.5">
          <div className="text-white font-semibold flex items-center gap-1.5">
            <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />
            1-Click Client Asset Sync
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Rhystic Tracker can extract the transparent avatar library directly from your local <em>Magic: The Gathering Arena</em> client files with zero cloud dependencies.
          </p>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-red-950/40 border border-red-500/30 text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        {extractedCount !== null && (
          <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Successfully synced {extractedCount} avatars to local storage!
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
          <button
            onClick={handleDismiss}
            className="px-3.5 py-2 text-xs font-mono text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Remind Me Later
          </button>
          <button
            onClick={handleExtract}
            disabled={extracting || extractedCount !== null}
            className="px-4 py-2 text-xs font-bold font-display uppercase tracking-wider bg-[#4A7856] hover:bg-[#5A8D68] text-white border border-[#76A382]/40 transition-colors flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${extracting ? 'animate-spin' : ''}`} />
            {extracting ? 'Extracting Avatars...' : 'Extract Avatars from Client'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarOnboardingModal;
