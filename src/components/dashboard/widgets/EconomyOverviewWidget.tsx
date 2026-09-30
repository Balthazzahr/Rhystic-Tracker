import React from "react";
import { Coins, Gem, Ticket, Sparkles, Layers, Package, CheckCircle2 } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, formatCurrency } from "./economyCommon";

export const EconomyOverviewWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();

  const vaultPct = economy?.vault_progress_pct ?? 0;
  const isVaultReady = vaultPct >= 100;
  const fullVaults = Math.floor(vaultPct / 100);
  const remainingVaultPct = vaultPct % 100;

  const wcTrack = economy?.wc_track_pos ?? 0;
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
        <div className="bg-white/[0.02] border border-white/10 p-3 flex flex-col justify-between gap-2.5">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Coins className="w-3 h-3 text-amber-400" />
              <span>Currencies & Vault</span>
            </span>
          </div>

          {/* Gold & Gems Row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-amber-500/5 border border-amber-500/20">
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-amber-400/80">
                Gold
              </span>
              <div className="text-lg font-mono font-bold text-amber-300 tabular-nums truncate">
                {formatCurrency(economy?.gold)}
              </div>
            </div>
            <div className="p-2 bg-cyan-500/5 border border-cyan-500/20">
              <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-cyan-400/80">
                Gems
              </span>
              <div className="text-lg font-mono font-bold text-cyan-300 tabular-nums truncate">
                {formatCurrency(economy?.gems)}
              </div>
            </div>
          </div>

          {/* Vault Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-sans">
              <span className="text-purple-300 font-semibold uppercase tracking-wider">Vault Progress</span>
              <div className="flex items-center gap-1.5">
                {isVaultReady && (
                  <span className="text-[9px] font-mono text-purple-200 bg-purple-500/20 px-1 py-0.2 border border-purple-400/30 flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-purple-300" />
                    {fullVaults}x Open
                  </span>
                )}
                <span className="font-mono font-bold text-purple-300 tabular-nums">
                  {vaultPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 bg-neutral-900 border border-purple-900/40 overflow-hidden">
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

        {/* Column 2: Wildcards & Crafting Wheel */}
        <div className="bg-white/[0.02] border border-white/10 p-3 flex flex-col justify-between gap-2.5">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Wildcards</span>
            </span>
          </div>

          {/* 4 Wildcard Badges */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-white/[0.02] border border-slate-500/20 p-1.5 text-center">
              <div className="text-[8px] font-sans font-semibold uppercase text-slate-400">C</div>
              <div className="text-base font-mono font-bold text-slate-200 tabular-nums">
                {economy?.wc_common ?? 0}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-sky-500/20 p-1.5 text-center">
              <div className="text-[8px] font-sans font-semibold uppercase text-sky-400">U</div>
              <div className="text-base font-mono font-bold text-sky-300 tabular-nums">
                {economy?.wc_uncommon ?? 0}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-amber-500/30 p-1.5 text-center">
              <div className="text-[8px] font-sans font-semibold uppercase text-amber-400">R</div>
              <div className="text-base font-mono font-bold text-amber-300 tabular-nums">
                {economy?.wc_rare ?? 0}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-orange-500/30 p-1.5 text-center">
              <div className="text-[8px] font-sans font-semibold uppercase text-orange-400">M</div>
              <div className="text-base font-mono font-bold text-orange-300 tabular-nums">
                {economy?.wc_mythic ?? 0}
              </div>
            </div>
          </div>

          {/* Wildcard Wheel (6 Pips) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-sans">
              <span className="text-neutral-400">Rare/Mythic Wheel</span>
              <span className="font-mono text-neutral-300">
                <strong className="text-white">{wcTrack}</strong> / 6
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className={`h-1.5 border transition-all ${
                    idx < wcTrack
                      ? "bg-amber-400 border-amber-300 shadow-[0_0_4px_rgba(251,191,36,0.3)]"
                      : "bg-neutral-900 border-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Column 3: Tokens & Golden Pack Progress */}
        <div className="bg-white/[0.02] border border-white/10 p-3 flex flex-col justify-between gap-2.5">
          <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-300 flex items-center justify-between border-b border-white/5 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Package className="w-3 h-3 text-amber-400" />
              <span>Event Tokens & Packs</span>
            </span>
          </div>

          {/* Tokens Row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.02] border border-white/10 p-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-sans text-neutral-400">
                <Ticket className="w-3 h-3 text-amber-400" />
                <span>Draft</span>
              </div>
              <span className="font-mono font-bold text-sm text-neutral-200">
                {economy?.draft_tokens ?? 0}
              </span>
            </div>
            <div className="bg-white/[0.02] border border-white/10 p-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-sans text-neutral-400">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>Jump In!</span>
              </div>
              <span className="font-mono font-bold text-sm text-neutral-200">
                {economy?.jump_in_tokens ?? 0}
              </span>
            </div>
          </div>

          {/* Golden Pack Progress (10 Pips) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-sans">
              <span className="text-amber-400/90">Golden Pack Progress</span>
              <span className="font-mono text-neutral-300">
                <strong className="text-amber-300">{goldenProgress}</strong> / 10
              </span>
            </div>
            <div className="grid grid-cols-10 gap-0.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                <div
                  key={idx}
                  className={`h-1.5 border transition-all ${
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
