import React from "react";
import { Gem, Coins, CheckCircle2 } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, formatCurrency } from "./economyCommon";

export const CurrenciesVaultWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();

  const vaultPct = economy?.vault_progress_pct ?? 0;
  const isVaultReady = vaultPct >= 100;
  const fullVaults = Math.floor(vaultPct / 100);
  const remainingPct = vaultPct % 100;

  return (
    <WidgetShell
      title="Currencies & Vault"
      subtitle="Gold, Gems, Tokens & Vault"
      icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
      isLoading={loading}
      isEmpty={!economy && !loading}
      emptyMessage="No economy data detected yet. Log into MTGA to track."
    >
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-3">
        {/* Top Currency Cards with Centered Icons */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Gold */}
          <div className="bg-white/[0.03] border border-amber-500/20 hover:border-amber-500/40 p-3 flex flex-col items-center justify-center text-center transition-colors">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
              <span className="ms ms-counter-gold text-amber-400 text-xl leading-none" />
            </div>
            <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-amber-400/80">
              Gold
            </span>
            <div className="text-2xl font-mono font-bold text-amber-300 tabular-nums truncate max-w-full mt-0.5">
              {formatCurrency(economy?.gold)}
            </div>
          </div>

          {/* Gems */}
          <div className="bg-white/[0.03] border border-cyan-500/20 hover:border-cyan-500/40 p-3 flex flex-col items-center justify-center text-center transition-colors">
            <div className="w-10 h-10 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center mb-1.5 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
              <Gem className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-cyan-400/80">
              Gems
            </span>
            <div className="text-2xl font-mono font-bold text-cyan-300 tabular-nums truncate max-w-full mt-0.5">
              {formatCurrency(economy?.gems)}
            </div>
          </div>
        </div>

        {/* Tokens Row with Centered Icons */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-white/[0.02] border border-white/10 hover:border-white/20 p-2 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <span className="ms ms-ticket text-amber-400 text-sm leading-none" />
              </div>
              <span className="text-neutral-300 text-xs font-sans font-medium">Draft Tokens</span>
            </div>
            <span className="font-mono font-bold text-base text-neutral-100 tabular-nums pr-1">
              {economy?.draft_tokens ?? 0}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/10 hover:border-white/20 p-2 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <span className="ms ms-token text-emerald-400 text-sm leading-none" />
              </div>
              <span className="text-neutral-300 text-xs font-sans font-medium">Jump In!</span>
            </div>
            <span className="font-mono font-bold text-base text-neutral-100 tabular-nums pr-1">
              {economy?.jump_in_tokens ?? 0}
            </span>
          </div>
        </div>

        {/* Vault Progress Section */}
        <div className="bg-white/[0.02] border border-purple-500/20 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-purple-300">
              <span className="ms ms-ability-adventure text-purple-400 text-xs" />
              <span>Vault Progress</span>
            </div>
            <div className="flex items-center gap-2">
              {isVaultReady && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.2 bg-purple-500/20 border border-purple-400/40 text-purple-200 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-purple-300" />
                  {fullVaults} Ready to Open
                </span>
              )}
              <span className="font-mono font-bold text-sm text-purple-300 tabular-nums">
                {vaultPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-neutral-900 border border-purple-900/40 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-500 ${
                isVaultReady
                  ? "bg-gradient-to-r from-purple-500 via-fuchsia-400 to-amber-300"
                  : "bg-purple-500"
              }`}
              style={{ width: `${Math.min(100, isVaultReady ? remainingPct || 100 : vaultPct)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-sans text-neutral-400 pt-0.5">
            <span>
              {isVaultReady
                ? `+${remainingPct.toFixed(1)}% towards vault #${fullVaults + 1}`
                : `${(100 - vaultPct).toFixed(1)}% needed to open`}
            </span>
            <span className="text-neutral-500">1,000 pips = 100%</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
});
