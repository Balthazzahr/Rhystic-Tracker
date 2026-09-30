import React, { useState } from "react";
import { Award, Shield, Trophy, Clock, History, Swords, Sparkles, TrendingUp } from "lucide-react";
import { WidgetProps } from "../types";
import { WidgetShell } from "../WidgetShell";
import { usePlayerRank, formatRomanLevel, getTierTheme, getMaxStepsForTier } from "./rankCommon";
import { useCountdown } from "./questCommon";
import { RankHistoryModal } from "./RankHistoryModal";

export const RankedLadderWidget: React.FC<WidgetProps> = React.memo(({ widget }) => {
  const { rank, loading } = usePlayerRank();
  const [modalOpen, setModalOpen] = useState(false);

  const countdown = useCountdown(rank?.season_end_time);

  const constructedTier = rank?.constructed_tier || "Bronze";
  const constructedLevel = rank?.constructed_level ?? 4;
  const constructedStep = rank?.constructed_step ?? 0;
  const constructedWins = rank?.constructed_wins ?? 0;
  const constructedLosses = rank?.constructed_losses ?? 0;
  const constructedTotal = constructedWins + constructedLosses;
  const constructedWr = constructedTotal > 0 ? Math.round((constructedWins / constructedTotal) * 100) : 0;
  const constructedTheme = getTierTheme(constructedTier);
  const constructedMaxSteps = getMaxStepsForTier(constructedTier, false);

  const limitedTier = rank?.limited_tier || "Bronze";
  const limitedLevel = rank?.limited_level ?? 4;
  const limitedStep = rank?.limited_step ?? 0;
  const limitedWins = rank?.limited_wins ?? 0;
  const limitedLosses = rank?.limited_losses ?? 0;
  const limitedTotal = limitedWins + limitedLosses;
  const limitedWr = limitedTotal > 0 ? Math.round((limitedWins / limitedTotal) * 100) : 0;
  const limitedTheme = getTierTheme(limitedTier);
  const limitedMaxSteps = getMaxStepsForTier(limitedTier, true);

  return (
    <>
      <WidgetShell
        title="Ranked Ladder"
        subtitle={`Season ${rank?.season_ordinal ?? 93}`}
        icon={<Award className="w-3.5 h-3.5 text-amber-400" />}
        isLoading={loading}
        isEmpty={!rank && !loading}
        emptyMessage="No ranked data detected yet. Log into MTGA to track."
        headerActions={
          <div className="flex items-center gap-1.5">
            {countdown && (
              <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-neutral-400 px-1.5 py-0.5 bg-white/[0.03] border border-white/5">
                <Clock className="w-2.5 h-2.5 text-neutral-400" />
                <span>Ends in {countdown}</span>
              </div>
            )}
            <button
              onClick={() => setModalOpen(true)}
              className="text-[10px] font-sans font-semibold uppercase tracking-wider px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 hover:border-white/30 text-neutral-300 hover:text-white transition-all flex items-center gap-1"
              title="Open Season Ladder Climb History"
            >
              <History className="w-3 h-3 text-amber-400" />
              <span>Climb History</span>
            </button>
          </div>
        }
      >
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5">
          {/* Constructed Rank Card */}
          <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/10 p-2.5 sm:p-3 flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between gap-1 shrink-0 pb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Shield className={`w-3.5 h-3.5 shrink-0 ${constructedTheme.textColor}`} />
                <span className="text-[11px] font-sans font-bold tracking-wider uppercase text-neutral-200 truncate">
                  Constructed
                </span>
                <span className={`text-xs font-sans font-bold uppercase tracking-wider px-1.5 py-0.2 border ${constructedTheme.badgeBg} ${constructedTheme.badgeBorder} ${constructedTheme.textColor} shrink-0`}>
                  {constructedTier} {constructedTier.toLowerCase() !== "mythic" && formatRomanLevel(constructedLevel)}
                </span>
              </div>

              {/* Record / Win Rate */}
              <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                <span className="text-white font-bold">
                  {constructedWins}W - {constructedLosses}L
                </span>
                {constructedTotal > 0 && (
                  <span className={`text-[10px] font-semibold px-1 py-0.2 border ${
                    constructedWr >= 50
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                      : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                  }`}>
                    {constructedWr}%
                  </span>
                )}
              </div>
            </div>

            {/* Pips Segmented Continuum Rail */}
            <div
              className="flex-1 min-h-[20px] max-h-[44px] my-1.5 w-full items-stretch"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${constructedMaxSteps}, minmax(0, 1fr))`,
                gap: "3px",
              }}
            >
              {Array.from({ length: constructedMaxSteps }, (_, idx) => {
                const isEarned = idx < constructedStep;
                const isNext = idx === constructedStep;

                return (
                  <div
                    key={`constructed-pip-${idx}`}
                    className={`h-full min-h-[18px] border rounded-[2px] flex items-center justify-center transition-all ${
                      isEarned
                        ? constructedTheme.pipActive
                        : isNext
                        ? "border-amber-400/80 bg-amber-400/10 text-neutral-300 ring-1 ring-amber-400/40 animate-pulse"
                        : "bg-white/[0.03] border-white/10 text-neutral-600 hover:border-white/20"
                    }`}
                    title={`Pip ${idx + 1} of ${constructedMaxSteps}`}
                  >
                    <span className="text-[8px] font-mono opacity-60 leading-none">
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="text-[9.5px] font-sans flex items-center justify-between text-neutral-400 pt-1 border-t border-white/5 shrink-0">
              <span className="font-mono text-neutral-300">
                Step <strong className="text-white">{constructedStep}</strong> / {constructedMaxSteps} Pips
              </span>
              <span className="text-neutral-500 text-[8.5px]">
                {constructedTier.toLowerCase() === "mythic" ? "Mythic Rank Active" : `Ranked Tier Advancement`}
              </span>
            </div>
          </div>

          {/* Limited Rank Card */}
          <div className="flex-1 min-h-0 bg-white/[0.02] border border-white/10 p-2.5 sm:p-3 flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between gap-1 shrink-0 pb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Trophy className={`w-3.5 h-3.5 shrink-0 ${limitedTheme.textColor}`} />
                <span className="text-[11px] font-sans font-bold tracking-wider uppercase text-neutral-200 truncate">
                  Limited
                </span>
                <span className={`text-xs font-sans font-bold uppercase tracking-wider px-1.5 py-0.2 border ${limitedTheme.badgeBg} ${limitedTheme.badgeBorder} ${limitedTheme.textColor} shrink-0`}>
                  {limitedTier} {limitedTier.toLowerCase() !== "mythic" && formatRomanLevel(limitedLevel)}
                </span>
              </div>

              {/* Record / Win Rate */}
              <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                <span className="text-white font-bold">
                  {limitedWins}W - {limitedLosses}L
                </span>
                {limitedTotal > 0 && (
                  <span className={`text-[10px] font-semibold px-1 py-0.2 border ${
                    limitedWr >= 50
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                      : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                  }`}>
                    {limitedWr}%
                  </span>
                )}
              </div>
            </div>

            {/* Pips Segmented Continuum Rail */}
            <div
              className="flex-1 min-h-[20px] max-h-[44px] my-1.5 w-full items-stretch"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${limitedMaxSteps}, minmax(0, 1fr))`,
                gap: "3px",
              }}
            >
              {Array.from({ length: limitedMaxSteps }, (_, idx) => {
                const isEarned = idx < limitedStep;
                const isNext = idx === limitedStep;

                return (
                  <div
                    key={`limited-pip-${idx}`}
                    className={`h-full min-h-[18px] border rounded-[2px] flex items-center justify-center transition-all ${
                      isEarned
                        ? limitedTheme.pipActive
                        : isNext
                        ? "border-cyan-400/80 bg-cyan-400/10 text-neutral-300 ring-1 ring-cyan-400/40 animate-pulse"
                        : "bg-white/[0.03] border-white/10 text-neutral-600 hover:border-white/20"
                    }`}
                    title={`Pip ${idx + 1} of ${limitedMaxSteps}`}
                  >
                    <span className="text-[8px] font-mono opacity-60 leading-none">
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="text-[9.5px] font-sans flex items-center justify-between text-neutral-400 pt-1 border-t border-white/5 shrink-0">
              <span className="font-mono text-neutral-300">
                Step <strong className="text-white">{limitedStep}</strong> / {limitedMaxSteps} Pips
              </span>
              <span className="text-neutral-500 text-[8.5px]">
                Draft & Sealed Tier Advancement
              </span>
            </div>
          </div>
        </div>
      </WidgetShell>

      <RankHistoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        currentRank={rank}
      />
    </>
  );
});
