import React from "react";
import { Layers, Sparkles, Package } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy } from "./economyCommon";

export const WildcardsGoldenPackWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();

  const wcTrack = economy?.wc_track_pos ?? 0;
  const goldenProgress = economy?.golden_pack_progress ?? 0;

  return (
    <WidgetShell
      title="Wildcards & Golden Pack"
      subtitle="Crafting Resources & Pack Wheels"
      icon={<Layers className="w-3.5 h-3.5 text-amber-400" />}
      isLoading={loading}
      isEmpty={!economy && !loading}
      emptyMessage="No economy data detected yet. Log into MTGA to track."
    >
      <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5">
        {/* Wildcard 4-Tier Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {/* Common */}
          <div className="bg-white/[0.02] border border-slate-500/20 hover:border-slate-500/40 p-2 flex flex-col items-center justify-center transition-colors">
            <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-slate-300">
              Common
            </span>
            <span className="text-lg font-mono font-bold text-slate-200 tabular-nums mt-0.5">
              {economy?.wc_common ?? 0}
            </span>
            <span className="w-2 h-0.5 bg-slate-400 rounded-full mt-1" />
          </div>

          {/* Uncommon */}
          <div className="bg-white/[0.02] border border-sky-500/20 hover:border-sky-500/40 p-2 flex flex-col items-center justify-center transition-colors">
            <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-sky-300">
              Uncommon
            </span>
            <span className="text-lg font-mono font-bold text-sky-300 tabular-nums mt-0.5">
              {economy?.wc_uncommon ?? 0}
            </span>
            <span className="w-2 h-0.5 bg-sky-400 rounded-full mt-1" />
          </div>

          {/* Rare */}
          <div className="bg-white/[0.02] border border-amber-500/30 hover:border-amber-500/50 p-2 flex flex-col items-center justify-center transition-colors">
            <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-amber-300">
              Rare
            </span>
            <span className="text-lg font-mono font-bold text-amber-300 tabular-nums mt-0.5">
              {economy?.wc_rare ?? 0}
            </span>
            <span className="w-2 h-0.5 bg-amber-400 rounded-full mt-1" />
          </div>

          {/* Mythic */}
          <div className="bg-white/[0.02] border border-orange-500/30 hover:border-orange-500/50 p-2 flex flex-col items-center justify-center transition-colors">
            <span className="text-[9px] font-sans font-semibold uppercase tracking-wider text-orange-300">
              Mythic
            </span>
            <span className="text-lg font-mono font-bold text-orange-300 tabular-nums mt-0.5">
              {economy?.wc_mythic ?? 0}
            </span>
            <span className="w-2 h-0.5 bg-orange-400 rounded-full mt-1" />
          </div>
        </div>

        {/* Wildcard Wheel Progress (6 Pips) */}
        <div className="bg-white/[0.02] border border-white/10 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-sans">
            <div className="flex items-center gap-1.5 text-neutral-300 font-semibold uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Wildcard Wheel</span>
            </div>
            <span className="font-mono text-neutral-400 tabular-nums">
              <strong className="text-white font-bold">{wcTrack}</strong> / 6 packs
            </span>
          </div>

          {/* 6 Segmented Pips */}
          <div className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = idx < wcTrack;
              return (
                <div
                  key={idx}
                  className={`h-2 border transition-all ${
                    isFilled
                      ? "bg-amber-400 border-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.3)]"
                      : "bg-neutral-900 border-white/10"
                  }`}
                  title={`Pip ${idx + 1} of 6`}
                />
              );
            })}
          </div>

          <div className="text-[9px] font-sans text-neutral-500 flex justify-between">
            <span>Progress towards next Rare / Mythic wildcard</span>
            <span>{6 - wcTrack} packs away</span>
          </div>
        </div>

        {/* Golden Pack Progress (10 Pips) */}
        <div className="bg-white/[0.02] border border-amber-500/20 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-sans">
            <div className="flex items-center gap-1.5 text-amber-300 font-semibold uppercase tracking-wider">
              <Package className="w-3 h-3 text-amber-400" />
              <span>Golden Pack Progress</span>
            </div>
            <span className="font-mono text-neutral-400 tabular-nums">
              <strong className="text-amber-300 font-bold">{goldenProgress}</strong> / 10 packs
            </span>
          </div>

          {/* 10 Segmented Pips */}
          <div className="grid grid-cols-10 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => {
              const isFilled = idx < goldenProgress;
              return (
                <div
                  key={idx}
                  className={`h-2 border transition-all ${
                    isFilled
                      ? "bg-gradient-to-r from-amber-400 to-yellow-300 border-yellow-200 shadow-[0_0_6px_rgba(234,179,8,0.3)]"
                      : "bg-neutral-900 border-white/10"
                  }`}
                  title={`Store pack ${idx + 1} of 10`}
                />
              );
            })}
          </div>

          <div className="text-[9px] font-sans text-neutral-500 flex justify-between">
            <span>Earn 1 Golden Pack (6 Rares/Mythics) every 10 packs</span>
            <span className="text-amber-400/80">{10 - goldenProgress} packs to Golden Pack</span>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
});
