import React, { useMemo } from "react";
import { X, Calendar, Clock, ArrowLeftRight, ExternalLink } from "lucide-react";
import { MatchRecord } from "../types";
import { useModalEscape } from "../../../utils/modalStack";

export interface VictoryCategoryModalData {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  pct: number;
  color: string;
}

interface VictoryBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: VictoryCategoryModalData | null;
  viewMode: "win" | "loss";
  allMatches: MatchRecord[];
  onSelectMatch?: (matchId: string) => void;
}

export const VictoryBreakdownModal: React.FC<VictoryBreakdownModalProps> = ({
  isOpen,
  onClose,
  category,
  viewMode,
  allMatches,
  onSelectMatch,
}) => {
  useModalEscape(isOpen, onClose, 20);

  const { matchingMatches, stats } = useMemo(() => {
    if (!category) return { matchingMatches: [], stats: null };

    // Filter matches that fit this category
    const list: (MatchRecord & { isLegacy: boolean })[] = [];

    for (const m of allMatches) {
      if (m.result !== viewMode) continue;

      const reason = (m.result_reason || "").toLowerCase();
      const oppLife = m.opponent_life_end;
      const playerLife = m.player_life_end;
      const endLife = viewMode === "win" ? oppLife : playerLife;
      const turns = m.turns || 0;
      const isTracked = !!m.result_reason || (endLife !== undefined && endLife !== null);

      let catId = "";

      if (isTracked) {
        if (reason.includes("concede") || reason.includes("scoop")) {
          catId = turns <= 5 ? "early_concede" : "late_concede";
        } else if (reason.includes("timeout") || reason.includes("timer")) {
          catId = "timeout";
        } else if (endLife !== undefined && endLife !== null && endLife <= 0) {
          catId = "lethal";
        } else if (reason.includes("damage") || reason.includes("lethal")) {
          catId = "lethal";
        } else if (reason.includes("game") && endLife !== undefined && endLife !== null && endLife > 0) {
          catId = "deckout";
        } else if (endLife !== undefined && endLife !== null && endLife > 0) {
          catId = turns <= 5 ? "early_concede" : "late_concede";
        } else {
          catId = "lethal";
        }
      } else {
        // Legacy match: assign primary bracket for drill-down listing
        if (turns <= 5) {
          catId = "early_concede";
        } else if (turns >= 15) {
          // Grindy legacy matches distributed across late concede and lethal
          catId = "late_concede";
        } else {
          catId = "late_concede";
        }
      }

      if (catId === category.id) {
        list.push({ ...m, isLegacy: !isTracked });
      }
    }

    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Compute aggregated telemetry
    const totalSample = list.length;
    let turnSum = 0;
    let durSum = 0;
    let onPlayCount = 0;
    const deckFreq: Record<string, number> = {};

    for (const m of list) {
      turnSum += m.turns || 0;
      durSum += m.duration_seconds || 0;
      if (m.going_first === true) onPlayCount++;
      const deck = m.player_deck_name || "Unknown Deck";
      deckFreq[deck] = (deckFreq[deck] || 0) + 1;
    }

    const topDeck = Object.entries(deckFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
    const avgTurns = totalSample > 0 ? (turnSum / totalSample).toFixed(1) : "0";
    const avgSeconds = totalSample > 0 ? Math.round(durSum / totalSample) : 0;
    const avgDuration = `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`;
    const playPct = totalSample > 0 ? Math.round((onPlayCount / totalSample) * 100) : 50;

    return {
      matchingMatches: list,
      stats: {
        totalSample,
        avgTurns,
        avgDuration,
        topDeck,
        playPct,
      },
    };
  }, [category, viewMode, allMatches]);

  if (!isOpen || !category) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 select-none">
      <div className="bg-neutral-950 border border-white/20 shadow-2xl rounded-none w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-none flex items-center justify-center border"
              style={{
                backgroundColor: `${category.color}20`,
                borderColor: `${category.color}60`,
              }}
            >
              {category.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-sans font-bold uppercase tracking-wider text-white">
                  {category.label}
                </h2>
                <span
                  className="px-1.5 py-0.2 text-[10px] font-mono font-bold uppercase border"
                  style={{
                    backgroundColor: `${category.color}15`,
                    borderColor: `${category.color}40`,
                    color: category.color,
                  }}
                >
                  {category.pct.toFixed(1)}% Share
                </span>
              </div>
              <div className="text-xs font-sans text-neutral-400">
                {category.description} · {category.count} total games
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white border border-transparent hover:border-white/20 transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* Key KPI Metric Strip */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white/[0.03] border border-white/10 p-2.5 flex flex-col">
                <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-neutral-400">
                  Total Recorded
                </span>
                <span className="text-lg font-mono font-bold text-white tabular-nums mt-0.5">
                  {category.count} <span className="text-xs font-normal text-neutral-400">games</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-400 mt-1">
                  {category.pct.toFixed(1)}% of all {viewMode === "win" ? "victories" : "defeats"}
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/10 p-2.5 flex flex-col">
                <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-neutral-400" />
                  <span>Pacing</span>
                </span>
                <span className="text-lg font-mono font-bold text-white tabular-nums mt-0.5">
                  {stats.avgTurns} <span className="text-xs font-normal text-neutral-400">turns avg</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-400 mt-1">
                  {stats.avgDuration} average match
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/10 p-2.5 flex flex-col">
                <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <ArrowLeftRight className="w-3 h-3 text-neutral-400" />
                  <span>Play vs Draw</span>
                </span>
                <span className="text-lg font-mono font-bold text-white tabular-nums mt-0.5">
                  {stats.playPct}% <span className="text-xs font-normal text-neutral-400">Play</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-400 mt-1">
                  {100 - stats.playPct}% on the Draw
                </span>
              </div>

              <div className="bg-white/[0.03] border border-white/10 p-2.5 flex flex-col">
                <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-neutral-400 truncate">
                  Top Deck Profile
                </span>
                <span className="text-sm font-sans font-semibold text-white truncate mt-1">
                  {stats.topDeck}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 mt-1">
                  Most frequent deck in set
                </span>
              </div>
            </div>
          )}

          {/* Recent Matching Matches Table */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-sans font-semibold text-neutral-300">
              <span className="uppercase tracking-wider">
                Matching Matches ({matchingMatches.length} Sampled)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                Sorted by most recent
              </span>
            </div>

            <div className="border border-white/10 overflow-hidden bg-black/40">
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-white/5">
                {matchingMatches.slice(0, 50).map((m) => {
                  const endLife = viewMode === "win" ? m.opponent_life_end : m.player_life_end;
                  const mins = Math.floor((m.duration_seconds || 0) / 60);
                  const secs = (m.duration_seconds || 0) % 60;

                  return (
                    <div
                      key={m.match_id}
                      onClick={() => onSelectMatch && onSelectMatch(m.match_id)}
                      className={`flex items-center justify-between p-2.5 transition-colors text-xs ${
                        onSelectMatch
                          ? "hover:bg-white/[0.05] cursor-pointer"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-sans font-medium text-white truncate max-w-[180px]">
                              {m.player_deck_name || "Unknown Deck"}
                            </span>
                            <span className="text-neutral-500 text-[10px]">vs</span>
                            <span className="font-sans text-neutral-300 truncate max-w-[140px]">
                              {m.opponent_name || "Opponent"}
                            </span>
                            {m.isLegacy && (
                              <span className="px-1 py-0.2 text-[9px] font-mono bg-white/10 text-neutral-400 border border-white/10">
                                Legacy
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-0.5">
                            <span>{m.date_str || m.timestamp?.slice(0, 10)}</span>
                            <span>·</span>
                            <span>{m.format_name || "Standard"}</span>
                            <span>·</span>
                            <span>{m.going_first ? "On Play" : "On Draw"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-mono text-xs tabular-nums text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-neutral-200">
                            Turn {m.turns || 0}
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            {mins}m {secs}s
                          </span>
                        </div>

                        {endLife !== undefined && endLife !== null && (
                          <div className="w-12 text-right">
                            <span
                              className={`text-xs font-bold ${
                                endLife <= 0 ? "text-rose-400" : "text-neutral-300"
                              }`}
                            >
                              {endLife} HP
                            </span>
                          </div>
                        )}

                        {onSelectMatch && (
                          <ExternalLink className="w-3.5 h-3.5 text-neutral-400 hover:text-white shrink-0 ml-1" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-3 border-t border-white/10 text-xs font-mono text-neutral-400 bg-neutral-900/50">
          <span>Click any match to inspect its full combat timeline & statistics</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-sans transition-colors cursor-pointer rounded-none border border-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
