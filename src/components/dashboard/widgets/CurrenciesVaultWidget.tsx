import React from "react";
import { Gem, Coins, Award, Package, Lock, Unlock, ShieldAlert } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, formatCurrency, BoosterPack } from "./economyCommon";

// Map MTGA set code aliases to Keyrune classes
const KEYRUNE_CODE_ALIAS: Record<string, string> = {
  DAR: "dom",
  CONF: "con",
  TLA: "tla",
  HOB: "hob",
  ZNR: "znr",
  THB: "thb",
  MSH: "msh",
  FRA: "fra",
};
const keyruneClass = (code: string) =>
  `ss ss-${(KEYRUNE_CODE_ALIAS[code.toUpperCase()] || code).toLowerCase()}`;

/**
 * Authentic MTGA Physical Booster Pack Component
 * Renders metallic foil packaging, crimp seals, set logo, and 3D stack effect for multi-packs.
 */
interface BoosterPackCardProps {
  booster: BoosterPack;
  isSingleSet: boolean;
}

const BoosterPackCard: React.FC<BoosterPackCardProps> = ({ booster, isSingleSet }) => {
  const isMulti = booster.count > 1;

  return (
    <div
      className={`relative group overflow-hidden bg-gradient-to-br from-neutral-900/90 via-neutral-950 to-neutral-900/90 border border-amber-500/25 hover:border-amber-400/50 p-2 flex items-center justify-between transition-all duration-200 shadow-sm ${
        isSingleSet ? "col-span-full" : ""
      }`}
    >
      {/* Background Foil Shimmer Sweep on Hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-300/[0.06] to-transparent pointer-events-none -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />

      {/* Left: Booster Pack Visual Badge */}
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <div className="relative shrink-0 flex items-center justify-center">
          {/* Back Pack Shadow Layer (Only for Multi-packs) */}
          {isMulti && (
            <div className="absolute -top-0.5 -right-0.5 w-7 h-9 rounded-[2px] bg-neutral-800 border border-amber-500/30 rotate-3 opacity-70 shadow-sm pointer-events-none" />
          )}

          {/* Front Booster Foil Pack */}
          <div className="relative w-7 h-9 rounded-[2px] bg-gradient-to-b from-neutral-800 via-neutral-900 to-neutral-950 border border-amber-400/50 flex flex-col items-center justify-between shadow-sm overflow-hidden z-10 group-hover:scale-105 transition-transform duration-150">
            {/* Top Crimp Lines (Metallic Heat-Sealed) */}
            <div className="w-full h-1 bg-gradient-to-r from-amber-600/40 via-amber-400/60 to-amber-600/40 border-b border-amber-400/30" />

            {/* Center: Set Logo Emblem */}
            <div className="relative flex-1 flex flex-col items-center justify-center w-full px-0.5">
              <i
                className={`${keyruneClass(
                  booster.set_code
                )} text-amber-300 text-base leading-none drop-shadow-[0_0_6px_rgba(245,158,11,0.5)] group-hover:text-amber-200 transition-colors`}
              />
            </div>

            {/* Bottom Crimp Lines */}
            <div className="w-full h-1 bg-gradient-to-r from-amber-600/40 via-amber-400/60 to-amber-600/40 border-t border-amber-400/30" />
          </div>
        </div>

        {/* Set Details (Clean title, no redundant set code or 'Booster Pack') */}
        <div className="min-w-0 flex flex-col justify-center">
          <span
            className="text-neutral-100 text-xs font-sans font-semibold truncate leading-tight group-hover:text-amber-200 transition-colors"
            title={booster.set_name || booster.set_code}
          >
            {booster.set_name || booster.set_code}
          </span>
        </div>
      </div>

      {/* Right: Quantity Badge */}
      <div className="flex items-center pl-1.5 shrink-0">
        <span
          className={`px-2 py-0.5 font-mono font-bold text-[11px] tracking-wider flex items-center gap-1 border shadow-sm transition-all ${
            isMulti
              ? "bg-amber-500/20 border-amber-400/60 text-amber-200"
              : "bg-white/[0.04] border-white/10 text-neutral-300"
          }`}
        >
          {isMulti && <Package className="w-2.5 h-2.5 text-amber-400" />}
          <span>{booster.count} {booster.count === 1 ? "PACK" : "PACKS"}</span>
        </span>
      </div>
    </div>
  );
};

export const CurrenciesVaultWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();

  const vaultPct = economy?.vault_progress_pct ?? 0;
  const fullVaults = Math.floor(vaultPct / 100);
  const remainingPct = vaultPct % 100;
  const isVaultCracked = fullVaults > 0;
  const boosters = economy?.boosters ?? [];
  const totalBoosterCount = boosters.reduce((sum, b) => sum + (b.count || 0), 0);

  // Safe Dial Angle (0 to 360 degrees mapped from remaining progress towards next tier)
  const dialRotation = Math.round((remainingPct / 100) * 360);

  return (
    <WidgetShell
      title="Currencies & Inventory"
      subtitle="Gold, Gems, Boosters, Tokens & Vault"
      icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
      isLoading={loading}
      isEmpty={!economy && !loading}
      emptyMessage="No economy data detected yet. Log into MTGA to track."
    >
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 h-full">
        {/* 1. Top Quadrant of 4: Gold & Gems, then Draft & Jump In Tokens */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          {/* Gold */}
          <div className="bg-white/[0.03] border border-amber-500/25 hover:border-amber-500/40 px-3 py-2 flex items-center justify-between transition-colors shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                <span className="ms ms-counter-gold text-amber-400 text-sm leading-none" />
              </div>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-amber-400/90 truncate">
                Gold
              </span>
            </div>
            <div className="text-lg font-mono font-bold text-amber-300 tabular-nums truncate pl-2">
              {formatCurrency(economy?.gold)}
            </div>
          </div>

          {/* Gems */}
          <div className="bg-white/[0.03] border border-cyan-500/25 hover:border-cyan-500/40 px-3 py-2 flex items-center justify-between transition-colors shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                <Gem className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-cyan-400/90 truncate">
                Gems
              </span>
            </div>
            <div className="text-lg font-mono font-bold text-cyan-300 tabular-nums truncate pl-2">
              {formatCurrency(economy?.gems)}
            </div>
          </div>

          {/* Draft Tokens */}
          <div className="bg-white/[0.02] border border-white/10 hover:border-white/20 px-3 py-2 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <span className="ms ms-ticket text-amber-400 text-xs leading-none" />
              </div>
              <span className="text-neutral-300 text-xs font-sans font-medium truncate">Draft Tokens</span>
            </div>
            <span className="font-mono font-bold text-sm text-neutral-100 tabular-nums pl-2">
              {economy?.draft_tokens ?? 0}
            </span>
          </div>

          {/* Jump In! Tokens */}
          <div className="bg-white/[0.02] border border-white/10 hover:border-white/20 px-3 py-2 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <span className="ms ms-token text-emerald-400 text-xs leading-none" />
              </div>
              <span className="text-neutral-300 text-xs font-sans font-medium truncate">Jump In!</span>
            </div>
            <span className="font-mono font-bold text-sm text-neutral-100 tabular-nums pl-2">
              {economy?.jump_in_tokens ?? 0}
            </span>
          </div>
        </div>

        {/* 2. Unopened Booster Packs Section (Scrollable on overflow to avoid clipping Vault) */}
        <div className="flex-1 min-h-0 flex flex-col space-y-1.5 overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 px-0.5 shrink-0">
            <span className="flex items-center gap-1.5 text-amber-300/90">
              <Package className="w-3 h-3 text-amber-400" />
              <span>Unopened Packs ({totalBoosterCount})</span>
            </span>
            <span className="text-neutral-500 font-mono text-[9px]">Available in Client</span>
          </div>

          {totalBoosterCount > 0 ? (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5 content-start">
              {boosters.map((b) => (
                <BoosterPackCard
                  key={`${b.set_code}_${b.collation_id}`}
                  booster={b}
                  isSingleSet={boosters.length === 1}
                />
              ))}
            </div>
          ) : (
            <div className="w-full py-2.5 px-3 border border-dashed border-white/10 bg-white/[0.01] flex items-center justify-center gap-2 text-neutral-500 text-xs font-sans">
              <Package className="w-3.5 h-3.5 opacity-40" />
              <span>No unopened booster packs currently in inventory</span>
            </div>
          )}
        </div>

        {/* 3. Vault Section with Safe Aesthetics & Centered Percentage Bar */}
        <div className="relative overflow-hidden bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-900 border border-purple-500/30 p-3 space-y-2 shadow-[0_4px_16px_rgba(0,0,0,0.6)] shrink-0">
          {/* Subtle Steel Rivet Corner Accents */}
          <div className="absolute top-1 left-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />
          <div className="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />
          <div className="absolute bottom-1 left-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />
          <div className="absolute bottom-1 right-1.5 w-1 h-1 rounded-full bg-neutral-600/70 shadow-inner" />

          {/* Safe Header: "Vault" on Left, Unlocked Tiers on Right */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Rotary Combination Dial Graphic */}
              <div className="relative w-7 h-7 rounded-full bg-gradient-to-tr from-neutral-950 via-neutral-800 to-neutral-700 border border-purple-400/60 flex items-center justify-center shadow-[0_0_8px_rgba(168,85,247,0.3)] shrink-0">
                {/* Radial Dial Tick Marks */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[1px] h-full bg-white/20" />
                  <div className="h-[1px] w-full bg-white/20" />
                  <div className="w-[1px] h-full bg-white/20 rotate-45" />
                  <div className="h-[1px] w-full bg-white/20 rotate-45" />
                </div>

                {/* Rotating Needle / Tumbler Core */}
                <div
                  className="w-4 h-4 rounded-full bg-neutral-900 border border-purple-300 flex items-center justify-center transition-transform duration-700 ease-out"
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
                <span>Vault</span>
              </div>
            </div>

            {/* Achievement Badge Pushed to Right */}
            {fullVaults > 0 ? (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 bg-gradient-to-r from-purple-600/30 to-amber-500/30 border border-amber-400/50 text-amber-200 flex items-center gap-1 shadow-[0_0_10px_rgba(234,179,8,0.25)] font-bold">
                <Award className="w-3 h-3 text-amber-300" />
                {fullVaults} {fullVaults === 1 ? "Vault tier" : "Vault tiers"} Unlocked
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
            <span className="relative z-20 font-mono font-black text-xs tracking-wider text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] filter drop-shadow-[0_0_2px_rgba(0,0,0,1)] select-none">
              {vaultPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
});

