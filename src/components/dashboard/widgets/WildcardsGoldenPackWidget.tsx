import React, { useState } from "react";
import { Layers, Lock, Unlock, Award, History } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, getWildcardWheelProgress } from "./economyCommon";
import { WildcardLotusCard } from "./WildcardLotusCard";
import { WildcardHistoryModal } from "./WildcardHistoryModal";

export const WildcardsVaultWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedRarity, setSelectedRarity] = useState<"all" | "mythic" | "rare" | "uncommon" | "common">("all");

  const wcTrack = economy?.wc_track_pos ?? 0;
  const wheels = getWildcardWheelProgress(wcTrack);

  // Vault computations
  const vaultPct = (economy?.vault_progress ?? 0) / 10; // e.g. 1563 pips = 156.3%
  const fullVaults = Math.floor(vaultPct / 100);
  const remainingPct = vaultPct % 100;
  const isVaultCracked = vaultPct >= 100;
  // Rotate safe combination dial based on vault progress (each 100% = full 360 deg turn)
  const dialRotation = Math.round((vaultPct % 100) * 3.6);

  const openHistory = (rarity: "all" | "mythic" | "rare" | "uncommon" | "common" = "all") => {
    setSelectedRarity(rarity);
    setHistoryModalOpen(true);
  };

  const headerActions = (
    <button
      onClick={() => openHistory("all")}
      className="flex items-center gap-1 px-1.5 py-0.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 hover:border-amber-400/40 text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 hover:text-amber-300 transition-colors cursor-pointer"
      title="View Wildcard Crafting & Acquisition History"
    >
      <History className="w-3 h-3 text-amber-400" />
      <span>History</span>
    </button>
  );

  return (
    <>
      <WidgetShell
        title="Wildcards & Vault"
        subtitle="Crafting Resources & Vault Progress"
        icon={<Layers className="w-3.5 h-3.5 text-amber-400" />}
        headerActions={headerActions}
        isLoading={loading}
        isEmpty={!economy && !loading}
        emptyMessage="No economy data detected yet. Log into MTGA to track."
      >
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5">
          {/* Wildcard 4-Tier Grid with Centered Lotus Cards */}
          <div className="grid grid-cols-4 gap-2">
            {/* Common */}
            <div
              onClick={() => openHistory("common")}
              className="bg-white/[0.02] border border-slate-500/20 hover:border-slate-400/60 hover:bg-white/[0.05] p-2.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
              title="Click to view Common wildcard history"
            >
              <WildcardLotusCard rarity="common" size="lg" className="mb-1.5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-slate-300 group-hover:text-white">
                Common
              </span>
              <span className="text-xl font-mono font-bold text-slate-200 tabular-nums mt-0.5">
                {economy?.wc_common ?? 0}
              </span>
            </div>

            {/* Uncommon */}
            <div
              onClick={() => openHistory("uncommon")}
              className="bg-white/[0.02] border border-sky-500/20 hover:border-sky-400/60 hover:bg-white/[0.05] p-2.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
              title="Click to view Uncommon wildcard history"
            >
              <WildcardLotusCard rarity="uncommon" size="lg" className="mb-1.5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-sky-300 group-hover:text-white">
                Uncommon
              </span>
              <span className="text-xl font-mono font-bold text-sky-300 tabular-nums mt-0.5">
                {economy?.wc_uncommon ?? 0}
              </span>
            </div>

            {/* Rare */}
            <div
              onClick={() => openHistory("rare")}
              className="bg-white/[0.02] border border-amber-500/30 hover:border-amber-400/60 hover:bg-white/[0.05] p-2.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
              title="Click to view Rare wildcard history"
            >
              <WildcardLotusCard rarity="rare" size="lg" className="mb-1.5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-amber-300 group-hover:text-white">
                Rare
              </span>
              <span className="text-xl font-mono font-bold text-amber-300 tabular-nums mt-0.5">
                {economy?.wc_rare ?? 0}
              </span>
            </div>

            {/* Mythic */}
            <div
              onClick={() => openHistory("mythic")}
              className="bg-white/[0.02] border border-orange-500/30 hover:border-orange-400/60 hover:bg-white/[0.05] p-2.5 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
              title="Click to view Mythic wildcard history"
            >
              <WildcardLotusCard rarity="mythic" size="lg" className="mb-1.5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-orange-300 group-hover:text-white">
                Mythic
              </span>
              <span className="text-xl font-mono font-bold text-orange-300 tabular-nums mt-0.5">
                {economy?.wc_mythic ?? 0}
              </span>
            </div>
          </div>

          {/* Dual Wildcard Wheels: Rare/Mythic & Uncommon */}
          <div className="bg-white/[0.02] border border-white/10 p-2.5 space-y-2.5">
            {/* Rare / Mythic Wheel */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-sans">
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Rare / Mythic Wheel</span>
                </div>
                <span className="font-mono text-neutral-400 tabular-nums">
                  <strong className="text-amber-300 font-bold">{wheels.rareWheel}</strong> / 6 packs
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = idx < wheels.rareWheel;
                  return (
                    <div
                      key={idx}
                      className={`h-2 border transition-all ${
                        isFilled
                          ? "bg-amber-400 border-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.35)]"
                          : "bg-neutral-900 border-white/10"
                      }`}
                      title={`Rare/Mythic pip ${idx + 1} of 6`}
                    />
                  );
                })}
              </div>

              <div className="text-[9px] font-sans text-neutral-500 flex justify-between">
                <span>Next reward: Rare or Mythic Wildcard</span>
                <span className="text-amber-400/80">{wheels.packsToRare} packs away</span>
              </div>
            </div>

            {/* Uncommon Wheel */}
            <div className="space-y-1 border-t border-white/5 pt-2">
              <div className="flex items-center justify-between text-[10px] font-sans">
                <div className="flex items-center gap-1.5 text-sky-300 font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>Uncommon Wheel</span>
                </div>
                <span className="font-mono text-neutral-400 tabular-nums">
                  <strong className="text-sky-300 font-bold">{wheels.uncommonWheel}</strong> / 6 packs
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = idx < wheels.uncommonWheel;
                  return (
                    <div
                      key={idx}
                      className={`h-2 border transition-all ${
                        isFilled
                          ? "bg-sky-400 border-sky-300 shadow-[0_0_6px_rgba(56,189,248,0.35)]"
                          : "bg-neutral-900 border-white/10"
                      }`}
                      title={`Uncommon pip ${idx + 1} of 6`}
                    />
                  );
                })}
              </div>

              <div className="text-[9px] font-sans text-neutral-500 flex justify-between">
                <span>Next reward: Uncommon Wildcard</span>
                <span className="text-sky-400/80">{wheels.packsToUncommon} packs away</span>
              </div>
            </div>
          </div>

          {/* Vault Section with Safe Aesthetics & Centered Percentage Bar */}
          <div className="relative overflow-hidden bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-900 border border-purple-500/30 p-2.5 space-y-2 shadow-[0_4px_16px_rgba(0,0,0,0.6)] shrink-0">
            {/* Subtle Steel Rivet Corner Accents */}
            <div className="absolute top-1 left-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />
            <div className="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />
            <div className="absolute bottom-1 left-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />
            <div className="absolute bottom-1 right-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />

            {/* Safe Header: "Vault" on Left, Unlocked Tiers on Right */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Rotary Combination Dial Graphic */}
                <div className="relative w-6 h-6 rounded-full bg-gradient-to-tr from-neutral-950 via-neutral-800 to-neutral-700 border border-purple-400/60 flex items-center justify-center shadow-[0_0_8px_rgba(168,85,247,0.3)] shrink-0">
                  {/* Radial Dial Tick Marks */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[1px] h-full bg-white/20" />
                    <div className="h-[1px] w-full bg-white/20" />
                    <div className="w-[1px] h-full bg-white/20 rotate-45" />
                    <div className="h-[1px] w-full bg-white/20 rotate-45" />
                  </div>

                  {/* Rotating Needle / Tumbler Core */}
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-neutral-900 border border-purple-300 flex items-center justify-center transition-transform duration-700 ease-out"
                    style={{ transform: `rotate(${dialRotation}deg)` }}
                  >
                    <div className="w-0.5 h-1.5 bg-gradient-to-t from-purple-400 to-amber-300 rounded-t-full -translate-y-0.5" />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-purple-300">
                  {isVaultCracked ? (
                    <Unlock className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-purple-400" />
                  )}
                  <span>Vault Progress</span>
                </div>
              </div>

              {/* Achievement Badge Pushed to Right */}
              {fullVaults > 0 ? (
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 bg-gradient-to-r from-purple-600/30 to-amber-500/30 border border-amber-400/50 text-amber-200 flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.25)] font-bold">
                  <Award className="w-3 h-3 text-amber-300" />
                  {fullVaults} {fullVaults === 1 ? "Tier" : "Tiers"} Unlocked
                </span>
              ) : null}
            </div>

            {/* Taller Stepped Safe Progress Bar with Rivets, Combination Ticks & Centered Percentage */}
            <div className="relative w-full h-6 bg-neutral-950 border border-purple-900/80 overflow-hidden shadow-inner flex items-center justify-center rounded-[2px]">
              {/* Safe Combination Ticks & Rivets along the bar */}
              <div className="absolute inset-0 flex justify-between items-center pointer-events-none z-10 px-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white/25 shadow-inner" />
                <span className="w-[1px] h-3 bg-white/20" />
                <span className="w-[1px] h-2 bg-white/10" />
                <span className="w-[1px] h-3 bg-white/20" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/25 shadow-inner" />
                <span className="w-[1px] h-3 bg-white/20" />
                <span className="w-[1px] h-2 bg-white/10" />
                <span className="w-[1px] h-3 bg-white/20" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/25 shadow-inner" />
              </div>

              {/* Fluid Lock Tumbler Progress Fill */}
              <div
                className={`absolute left-0 top-0 bottom-0 transition-all duration-700 ease-out ${
                  isVaultCracked
                    ? "bg-gradient-to-r from-purple-700 via-fuchsia-600 to-amber-400 shadow-[0_0_14px_rgba(234,179,8,0.6)]"
                    : "bg-gradient-to-r from-purple-900 via-purple-700 to-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                }`}
                style={{
                  width: `${Math.min(100, isVaultCracked ? remainingPct || 100 : vaultPct)}%`,
                }}
              />

              {/* High-Contrast Centered Vault Percentage */}
              <span className="relative z-20 font-mono font-black text-xs tracking-wider text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] select-none">
                {vaultPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </WidgetShell>

      <WildcardHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        initialFilterRarity={selectedRarity}
      />
    </>
  );
});

// Alias export for backwards compatibility
export const WildcardsGoldenPackWidget = WildcardsVaultWidget;
