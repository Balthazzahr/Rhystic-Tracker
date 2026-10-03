import React, { useState } from "react";
import { Layers, Package, History } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerEconomy, getWildcardWheelProgress } from "./economyCommon";
import { WildcardLotusCard } from "./WildcardLotusCard";
import { WildcardHistoryModal } from "./WildcardHistoryModal";

export const WildcardsGoldenPackWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { economy, loading } = usePlayerEconomy();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedRarity, setSelectedRarity] = useState<"all" | "mythic" | "rare" | "uncommon" | "common">("all");

  const wcTrack = economy?.wc_track_pos ?? 0;
  const wheels = getWildcardWheelProgress(wcTrack);
  const goldenProgress = economy?.golden_pack_progress ?? 0;

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
        title="Wildcards & Golden Pack"
        subtitle="Crafting Resources & Pack Wheels"
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

      <WildcardHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        initialFilterRarity={selectedRarity}
      />
    </>
  );
});
