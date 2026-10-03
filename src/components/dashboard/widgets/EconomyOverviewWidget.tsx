import React from "react";
import { Coins, Gem, Layers, Package, CheckCircle2 } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, formatCurrency, getWildcardWheelProgress } from "./economyCommon";
import { WildcardLotusCard } from "./WildcardLotusCard";

export const EconomyOverviewWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();

  const vaultPct = economy?.vault_progress_pct ?? 0;
  const isVaultReady = vaultPct >= 100;
  const fullVaults = Math.floor(vaultPct / 100);
  const remainingVaultPct = vaultPct % 100;

  const wcTrack = economy?.wc_track_pos ?? 0;
  const wheels = getWildcardWheelProgress(wcTrack);
  const goldenProgress = economy?.golden_pack_progress ?? 0;

  return (
    <WidgetShell
      title="Economy Overview"
      subtitle="Complete MTGA Player Treasury & Resources"
      icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
      isLoading={loading}
      isEmpty={!economy && !loading}
      emptyMessage="No economy data detected yet. Log into MTGA to track."
    >
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Column 1: Primary Currencies & Vault */}
        <div className="bg-white/[0.02] border border-white/10 p-3 flex flex-col justify-between gap-3">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3 h-3 text-amber-400" />
              <span>Currencies & Vault</span>
            </span>
          </div>

          {/* Gold & Gems Row with Large Centered Icons */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Gold */}
            <div className="p-3 bg-amber-500/[0.04] border border-amber-500/20 hover:border-amber-500/40 flex flex-col items-center justify-center text-center transition-colors">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                <Coins className="w-5 h-5 text-yellow-400 drop-shadow-[0_0_6px_rgba(234,179,8,0.6)]" />
              </div>
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-amber-400/80">
                Gold
              </span>
              <div className="text-xl font-mono font-bold text-amber-300 tabular-nums truncate max-w-full mt-0.5">
                {formatCurrency(economy?.gold)}
              </div>
            </div>

            {/* Gems */}
            <div className="p-3 bg-cyan-500/[0.04] border border-cyan-500/20 hover:border-cyan-500/40 flex flex-col items-center justify-center text-center transition-colors">
              <div className="w-9 h-9 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center mb-1.5 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
                <Gem className="w-4.5 h-4.5 text-cyan-400" />
              </div>
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-cyan-400/80">
                Gems
              </span>
              <div className="text-xl font-mono font-bold text-cyan-300 tabular-nums truncate max-w-full mt-0.5">
                {formatCurrency(economy?.gems)}
              </div>
            </div>
          </div>

          {/* Vault Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] font-sans">
              <span className="text-purple-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <span className="ms ms-ability-adventure text-purple-400 text-xs" />
                <span>Vault Progress</span>
              </span>
              <div className="flex items-center gap-1.5">
                {fullVaults > 0 && (
                  <span className="text-[9px] font-mono text-purple-200 bg-purple-500/20 px-1.5 py-0.2 border border-purple-400/30 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-purple-300" />
                    {fullVaults} {fullVaults === 1 ? "Vault tier" : "Vault tiers"} achieved
                  </span>
                )}
                <span className="font-mono font-bold text-purple-300 tabular-nums">
                  {vaultPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full h-2 bg-neutral-900 border border-purple-900/40 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isVaultReady
                    ? "bg-gradient-to-r from-purple-500 via-fuchsia-400 to-amber-300"
                    : "bg-purple-500"
                }`}
                style={{ width: `${Math.min(100, isVaultReady ? remainingVaultPct || 100 : vaultPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Column 2: Wildcards & Crafting Wheels */}
        <div className="bg-white/[0.02] border border-white/10 p-3 flex flex-col justify-between gap-3">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Wildcards</span>
            </span>
          </div>

          {/* 4 Wildcard Cards with Centered Lotus Cards */}
          <div className="grid grid-cols-4 gap-1.5">
            {/* Common */}
            <div className="bg-white/[0.02] border border-slate-500/20 hover:border-slate-500/40 p-2 flex flex-col items-center justify-center text-center transition-colors">
              <WildcardLotusCard rarity="common" size="md" className="mb-1" />
              <div className="text-[9px] font-sans font-semibold uppercase tracking-wider text-slate-400">
                C
              </div>
              <div className="text-base font-mono font-bold text-slate-200 tabular-nums mt-0.5">
                {economy?.wc_common ?? 0}
              </div>
            </div>

            {/* Uncommon */}
            <div className="bg-white/[0.02] border border-sky-500/20 hover:border-sky-500/40 p-2 flex flex-col items-center justify-center text-center transition-colors">
              <WildcardLotusCard rarity="uncommon" size="md" className="mb-1" />
              <div className="text-[9px] font-sans font-semibold uppercase tracking-wider text-sky-400">
                U
              </div>
              <div className="text-base font-mono font-bold text-sky-300 tabular-nums mt-0.5">
                {economy?.wc_uncommon ?? 0}
              </div>
            </div>

            {/* Rare */}
            <div className="bg-white/[0.02] border border-amber-500/30 hover:border-amber-500/50 p-2 flex flex-col items-center justify-center text-center transition-colors">
              <WildcardLotusCard rarity="rare" size="md" className="mb-1" />
              <div className="text-[9px] font-sans font-semibold uppercase tracking-wider text-amber-400">
                R
              </div>
              <div className="text-base font-mono font-bold text-amber-300 tabular-nums mt-0.5">
                {economy?.wc_rare ?? 0}
              </div>
            </div>

            {/* Mythic */}
            <div className="bg-white/[0.02] border border-orange-500/30 hover:border-orange-500/50 p-2 flex flex-col items-center justify-center text-center transition-colors">
              <WildcardLotusCard rarity="mythic" size="md" className="mb-1" />
              <div className="text-[9px] font-sans font-semibold uppercase tracking-wider text-orange-400">
                M
              </div>
              <div className="text-base font-mono font-bold text-orange-300 tabular-nums mt-0.5">
                {economy?.wc_mythic ?? 0}
              </div>
            </div>
          </div>

          {/* Two Distinct Wheels: Rare/Mythic & Uncommon */}
          <div className="space-y-2 pt-0.5">
            {/* Rare / Mythic Wheel */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-sans">
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Rare / Mythic Wheel</span>
                </span>
                <span className="font-mono text-neutral-300 tabular-nums">
                  <strong className="text-amber-300">{wheels.rareWheel}</strong> / 6
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 border transition-all ${
                      idx < wheels.rareWheel
                        ? "bg-amber-400 border-amber-300 shadow-[0_0_4px_rgba(251,191,36,0.4)]"
                        : "bg-neutral-900 border-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Uncommon Wheel */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-sans">
                <span className="text-sky-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  <span>Uncommon Wheel</span>
                </span>
                <span className="font-mono text-neutral-300 tabular-nums">
                  <strong className="text-sky-300">{wheels.uncommonWheel}</strong> / 6
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 border transition-all ${
                      idx < wheels.uncommonWheel
                        ? "bg-sky-400 border-sky-300 shadow-[0_0_4px_rgba(56,189,248,0.4)]"
                        : "bg-neutral-900 border-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Tokens & Golden Pack Progress */}
        <div className="bg-white/[0.02] border border-white/10 p-3 flex flex-col justify-between gap-3">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Package className="w-3 h-3 text-amber-400" />
              <span>Event Tokens & Packs</span>
            </span>
          </div>

          {/* Tokens Row with Centered Icons */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Draft Tokens */}
            <div className="p-3 bg-white/[0.02] border border-amber-500/20 hover:border-amber-500/40 flex flex-col items-center justify-center text-center transition-colors">
              <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-1.5">
                <span className="ms ms-ticket text-amber-400 text-lg leading-none" />
              </div>
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-neutral-400">
                Draft Tokens
              </span>
              <div className="text-xl font-mono font-bold text-neutral-100 tabular-nums mt-0.5">
                {economy?.draft_tokens ?? 0}
              </div>
            </div>

            {/* Jump In! Tokens */}
            <div className="p-3 bg-white/[0.02] border border-emerald-500/20 hover:border-emerald-500/40 flex flex-col items-center justify-center text-center transition-colors">
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-1.5">
                <span className="ms ms-token text-emerald-400 text-lg leading-none" />
              </div>
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-neutral-400">
                Jump In!
              </span>
              <div className="text-xl font-mono font-bold text-neutral-100 tabular-nums mt-0.5">
                {economy?.jump_in_tokens ?? 0}
              </div>
            </div>
          </div>

          {/* Golden Pack Progress (10 Pips) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[10px] font-sans">
              <span className="text-amber-400/90 font-medium">Golden Pack Progress</span>
              <span className="font-mono text-neutral-300 tabular-nums">
                <strong className="text-amber-300">{goldenProgress}</strong> / 10
              </span>
            </div>
            <div className="grid grid-cols-10 gap-0.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                <div
                  key={idx}
                  className={`h-2 border transition-all ${
                    idx < goldenProgress
                      ? "bg-amber-400 border-yellow-200 shadow-[0_0_4px_rgba(234,179,8,0.3)]"
                      : "bg-neutral-900 border-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
});
