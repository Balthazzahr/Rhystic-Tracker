import React from "react";
import { X, Award, Shield, Swords, Calendar, Clock, Trophy } from "lucide-react";
import { PlayerRankStatus, usePlayerRankHistory, formatRomanLevel, getTierTheme } from "./rankCommon";

interface RankHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRank: PlayerRankStatus | null;
}

export const RankHistoryModal: React.FC<RankHistoryModalProps> = ({ isOpen, onClose, currentRank }) => {
  const { history, loading } = usePlayerRankHistory(50);

  if (!isOpen) return null;

  const constructedTheme = currentRank ? getTierTheme(currentRank.constructed_tier) : getTierTheme("Bronze");
  const limitedTheme = currentRank ? getTierTheme(currentRank.limited_tier) : getTierTheme("Bronze");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="bg-neutral-950 border border-white/20 shadow-2xl rounded-none w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-none bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Award className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold uppercase tracking-wider text-white">
                Ranked Ladder & Season Progression
              </h2>
              <div className="text-xs font-sans text-neutral-400">
                Season {currentRank?.season_ordinal ?? 93} Climb & Pip History
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white border border-transparent hover:border-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Current Rank Badges Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Constructed */}
            <div className={`p-3 border flex flex-col justify-between ${constructedTheme.badgeBg} ${constructedTheme.badgeBorder}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-current" />
                  <span>Constructed Rank</span>
                </span>
                <span className="text-xs font-mono font-bold text-white uppercase">
                  {currentRank?.constructed_tier} {currentRank?.constructed_tier.toLowerCase() !== "mythic" && formatRomanLevel(currentRank?.constructed_level ?? 4)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-mono text-neutral-300">
                  Step {currentRank?.constructed_step ?? 0} pips
                </span>
                <span className="text-xs font-mono font-bold text-amber-300">
                  {currentRank?.constructed_wins ?? 0}W - {currentRank?.constructed_losses ?? 0}L
                </span>
              </div>
            </div>

            {/* Limited */}
            <div className={`p-3 border flex flex-col justify-between ${limitedTheme.badgeBg} ${limitedTheme.badgeBorder}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-current" />
                  <span>Limited Rank</span>
                </span>
                <span className="text-xs font-mono font-bold text-white uppercase">
                  {currentRank?.limited_tier} {currentRank?.limited_tier.toLowerCase() !== "mythic" && formatRomanLevel(currentRank?.limited_level ?? 4)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-mono text-neutral-300">
                  Step {currentRank?.limited_step ?? 0} pips
                </span>
                <span className="text-xs font-mono font-bold text-cyan-300">
                  {currentRank?.limited_wins ?? 0}W - {currentRank?.limited_losses ?? 0}L
                </span>
              </div>
            </div>
          </div>

          {/* History Timeline */}
          <div className="space-y-2">
            <div className="text-xs font-sans font-bold tracking-wider uppercase text-neutral-300 flex items-center gap-2 pb-1 border-b border-white/5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Snapshot Log ({history.length} snapshots)</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs font-sans text-neutral-500">
                Loading rank history...
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-xs font-sans text-neutral-500 italic">
                No rank snapshots recorded yet. Log into MTGA or play a match to track.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                {history.map((snap) => {
                  const snapTheme = getTierTheme(snap.constructed_tier);
                  const date = new Date(snap.timestamp);
                  const formattedDate = date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={snap.id}
                      className="bg-white/[0.02] border border-white/5 hover:border-white/10 p-2.5 flex items-center justify-between gap-3 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${snapTheme.pipActive}`} />
                        <span className="font-mono text-neutral-400 text-[11px] shrink-0">
                          {formattedDate}
                        </span>
                        <span className="font-sans font-bold text-white uppercase truncate">
                          {snap.constructed_tier} {formatRomanLevel(snap.constructed_level)}
                        </span>
                        <span className="font-mono text-neutral-400 text-[11px]">
                          (Pip {snap.constructed_step})
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                        <span className="text-neutral-300">
                          {snap.constructed_wins}W - {snap.constructed_losses}L
                        </span>
                        <span className="text-neutral-500 text-[10px]">
                          Lim: {snap.limited_tier} {formatRomanLevel(snap.limited_level)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 bg-neutral-900/50 flex items-center justify-between text-[11px] font-sans text-neutral-400 shrink-0">
          <span>Season {currentRank?.season_ordinal ?? 93}</span>
          <span>Automatic ladder & pip synchronization</span>
        </div>
      </div>
    </div>
  );
};
