import React, { useState, useEffect, useMemo } from "react";
import { X, History, Sparkles, Filter, ArrowDownRight, ArrowUpRight, Calendar, AlertCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { EconomySnapshot } from "./economyCommon";
import { WildcardLotusCard } from "./WildcardLotusCard";

export interface WildcardTransaction {
  id: number;
  timestamp: string;
  formattedDate: string;
  formattedTime: string;
  type: "crafted" | "added" | "mixed";
  deltaMythic: number;
  deltaRare: number;
  deltaUncommon: number;
  deltaCommon: number;
  currentMythic: number;
  currentRare: number;
  currentUncommon: number;
  currentCommon: number;
}

interface WildcardHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFilterRarity?: "all" | "mythic" | "rare" | "uncommon" | "common";
}

export const WildcardHistoryModal: React.FC<WildcardHistoryModalProps> = ({
  isOpen,
  onClose,
  initialFilterRarity = "all",
}) => {
  const [history, setHistory] = useState<EconomySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "crafted" | "added">("all");
  const [filterRarity, setFilterRarity] = useState<"all" | "mythic" | "rare" | "uncommon" | "common">(initialFilterRarity);

  useEffect(() => {
    if (initialFilterRarity) {
      setFilterRarity(initialFilterRarity);
    }
  }, [initialFilterRarity]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const data = await invoke<EconomySnapshot[]>("get_economy_history", { limit: 500 });
        if (isMounted) {
          // Snapshots are returned newest first (ORDER BY id DESC)
          setHistory(data);
        }
      } catch (err) {
        console.error("Failed to fetch economy history for wildcards:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen]);

  // Derive transactions by comparing adjacent snapshots
  const transactions: WildcardTransaction[] = useMemo(() => {
    if (history.length < 2) return [];

    const txs: WildcardTransaction[] = [];
    // history is ordered newest first: index 0 is newest, index 1 is previous to index 0
    for (let i = 0; i < history.length - 1; i++) {
      const curr = history[i];
      const prev = history[i + 1];

      const dM = curr.wc_mythic - prev.wc_mythic;
      const dR = curr.wc_rare - prev.wc_rare;
      const dU = curr.wc_uncommon - prev.wc_uncommon;
      const dC = curr.wc_common - prev.wc_common;

      // Only record if any wildcard count changed
      if (dM !== 0 || dR !== 0 || dU !== 0 || dC !== 0) {
        const hasDecrease = dM < 0 || dR < 0 || dU < 0 || dC < 0;
        const hasIncrease = dM > 0 || dR > 0 || dU > 0 || dC > 0;

        let type: "crafted" | "added" | "mixed" = "mixed";
        if (hasDecrease && !hasIncrease) type = "crafted";
        else if (hasIncrease && !hasDecrease) type = "added";

        const dateObj = new Date(curr.timestamp);
        const formattedDate = isNaN(dateObj.getTime())
          ? curr.timestamp.slice(0, 10)
          : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const formattedTime = isNaN(dateObj.getTime())
          ? curr.timestamp
          : dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

        txs.push({
          id: curr.id,
          timestamp: curr.timestamp,
          formattedDate,
          formattedTime,
          type,
          deltaMythic: dM,
          deltaRare: dR,
          deltaUncommon: dU,
          deltaCommon: dC,
          currentMythic: curr.wc_mythic,
          currentRare: curr.wc_rare,
          currentUncommon: curr.wc_uncommon,
          currentCommon: curr.wc_common,
        });
      }
    }
    return txs;
  }, [history]);

  // Aggregate stats
  const stats = useMemo(() => {
    let craftedM = 0;
    let craftedR = 0;
    let craftedU = 0;
    let craftedC = 0;

    let addedM = 0;
    let addedR = 0;
    let addedU = 0;
    let addedC = 0;

    for (const tx of transactions) {
      if (tx.deltaMythic < 0) craftedM += Math.abs(tx.deltaMythic);
      else if (tx.deltaMythic > 0) addedM += tx.deltaMythic;

      if (tx.deltaRare < 0) craftedR += Math.abs(tx.deltaRare);
      else if (tx.deltaRare > 0) addedR += tx.deltaRare;

      if (tx.deltaUncommon < 0) craftedU += Math.abs(tx.deltaUncommon);
      else if (tx.deltaUncommon > 0) addedU += tx.deltaUncommon;

      if (tx.deltaCommon < 0) craftedC += Math.abs(tx.deltaCommon);
      else if (tx.deltaCommon > 0) addedC += tx.deltaCommon;
    }

    return {
      totalCrafted: craftedM + craftedR + craftedU + craftedC,
      totalAdded: addedM + addedR + addedU + addedC,
      craftedM,
      craftedR,
      craftedU,
      craftedC,
      addedM,
      addedR,
      addedU,
      addedC,
    };
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Type filter
      if (filterType === "crafted" && tx.type !== "crafted" && !(tx.type === "mixed" && (tx.deltaMythic < 0 || tx.deltaRare < 0 || tx.deltaUncommon < 0 || tx.deltaCommon < 0))) {
        return false;
      }
      if (filterType === "added" && tx.type !== "added" && !(tx.type === "mixed" && (tx.deltaMythic > 0 || tx.deltaRare > 0 || tx.deltaUncommon > 0 || tx.deltaCommon > 0))) {
        return false;
      }

      // Rarity filter
      if (filterRarity === "mythic" && tx.deltaMythic === 0) return false;
      if (filterRarity === "rare" && tx.deltaRare === 0) return false;
      if (filterRarity === "uncommon" && tx.deltaUncommon === 0) return false;
      if (filterRarity === "common" && tx.deltaCommon === 0) return false;

      return true;
    });
  }, [transactions, filterType, filterRarity]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="bg-neutral-950 border border-white/20 shadow-2xl rounded-none w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-none bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <History className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span>Wildcard Spending & History</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white/10 border border-white/10 text-neutral-300 font-normal">
                  {transactions.length} Events Recorded
                </span>
              </h2>
              <div className="text-xs font-sans text-neutral-400">
                Audit trail of cards crafted and wildcards acquired from packs & vault
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white border border-transparent hover:border-white/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Quick Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Mythic Summary */}
            <div className="bg-white/[0.02] border border-orange-500/20 p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-1">
                  <WildcardLotusCard rarity="mythic" size="sm" />
                  Mythic
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs font-mono">
                <span className="text-rose-400 font-bold" title="Total Mythics Crafted">
                  -{stats.craftedM} crafted
                </span>
                <span className="text-emerald-400 font-semibold" title="Total Mythics Added">
                  +{stats.addedM}
                </span>
              </div>
            </div>

            {/* Rare Summary */}
            <div className="bg-white/[0.02] border border-amber-500/20 p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                  <WildcardLotusCard rarity="rare" size="sm" />
                  Rare
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs font-mono">
                <span className="text-rose-400 font-bold" title="Total Rares Crafted">
                  -{stats.craftedR} crafted
                </span>
                <span className="text-emerald-400 font-semibold" title="Total Rares Added">
                  +{stats.addedR}
                </span>
              </div>
            </div>

            {/* Uncommon Summary */}
            <div className="bg-white/[0.02] border border-sky-500/20 p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-sky-300 flex items-center gap-1">
                  <WildcardLotusCard rarity="uncommon" size="sm" />
                  Uncommon
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs font-mono">
                <span className="text-rose-400 font-bold" title="Total Uncommons Crafted">
                  -{stats.craftedU} crafted
                </span>
                <span className="text-emerald-400 font-semibold" title="Total Uncommons Added">
                  +{stats.addedU}
                </span>
              </div>
            </div>

            {/* Common Summary */}
            <div className="bg-white/[0.02] border border-slate-500/20 p-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                  <WildcardLotusCard rarity="common" size="sm" />
                  Common
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs font-mono">
                <span className="text-rose-400 font-bold" title="Total Commons Crafted">
                  -{stats.craftedC} crafted
                </span>
                <span className="text-emerald-400 font-semibold" title="Total Commons Added">
                  +{stats.addedC}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.02] border border-white/10 p-2">
            {/* Type Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-sans uppercase font-bold text-neutral-400 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-neutral-400" />
                Type:
              </span>
              <button
                onClick={() => setFilterType("all")}
                className={`px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
                  filterType === "all"
                    ? "bg-white/[0.12] text-white border-white/20"
                    : "text-neutral-400 border-transparent hover:text-neutral-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("crafted")}
                className={`px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
                  filterType === "crafted"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    : "text-neutral-400 border-transparent hover:text-rose-300"
                }`}
              >
                Crafted Only
              </button>
              <button
                onClick={() => setFilterType("added")}
                className={`px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
                  filterType === "added"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "text-neutral-400 border-transparent hover:text-emerald-300"
                }`}
              >
                Added Only
              </button>
            </div>

            {/* Rarity Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-sans uppercase font-bold text-neutral-400 mr-1">Rarity:</span>
              {(["all", "mythic", "rare", "uncommon", "common"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRarity(r)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase transition-colors cursor-pointer border ${
                    filterRarity === r
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "text-neutral-400 border-transparent hover:text-neutral-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions List */}
          <div className="space-y-1.5">
            {loading ? (
              <div className="py-12 text-center text-xs font-sans text-neutral-400">
                Loading wildcard transaction history...
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-white/10 p-6 space-y-1 text-neutral-400">
                <AlertCircle className="w-5 h-5 mx-auto text-neutral-500 mb-1" />
                <div className="text-xs font-sans font-semibold text-neutral-300">No wildcard transactions match your filter</div>
                <div className="text-[11px] font-sans text-neutral-500">
                  Transactions appear whenever wildcards are spent to craft cards or earned from packs and the Vault.
                </div>
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                return (
                  <div
                    key={tx.id}
                    className="bg-white/[0.02] border border-white/10 hover:border-white/20 p-2.5 transition-colors flex items-center justify-between gap-3"
                  >
                    {/* Left: Type Badge & Timestamp */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 flex items-center justify-center border shrink-0 ${
                          tx.type === "crafted"
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                            : tx.type === "added"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        }`}
                        title={tx.type === "crafted" ? "Cards Crafted" : tx.type === "added" ? "Wildcards Earned" : "Mixed Transaction"}
                      >
                        {tx.type === "crafted" ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : tx.type === "added" ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.2 border ${
                              tx.type === "crafted"
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                : tx.type === "added"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            }`}
                          >
                            {tx.type === "crafted" ? "Crafted" : tx.type === "added" ? "Earned" : "Adjusted"}
                          </span>
                          <span className="text-xs font-mono font-medium text-white">
                            {tx.formattedDate}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">
                            {tx.formattedTime}
                          </span>
                        </div>
                        <div className="text-[10px] font-sans text-neutral-500 mt-0.5">
                          Balance: {tx.currentMythic}M / {tx.currentRare}R / {tx.currentUncommon}U / {tx.currentCommon}C
                        </div>
                      </div>
                    </div>

                    {/* Right: Deltas with Lotus Badges */}
                    <div className="flex items-center gap-2">
                      {tx.deltaMythic !== 0 && (
                        <div
                          className={`flex items-center gap-1 px-1.5 py-0.5 border text-xs font-mono font-bold ${
                            tx.deltaMythic < 0
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          <WildcardLotusCard rarity="mythic" size="sm" />
                          <span>{tx.deltaMythic > 0 ? `+${tx.deltaMythic}` : tx.deltaMythic} M</span>
                        </div>
                      )}

                      {tx.deltaRare !== 0 && (
                        <div
                          className={`flex items-center gap-1 px-1.5 py-0.5 border text-xs font-mono font-bold ${
                            tx.deltaRare < 0
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          <WildcardLotusCard rarity="rare" size="sm" />
                          <span>{tx.deltaRare > 0 ? `+${tx.deltaRare}` : tx.deltaRare} R</span>
                        </div>
                      )}

                      {tx.deltaUncommon !== 0 && (
                        <div
                          className={`flex items-center gap-1 px-1.5 py-0.5 border text-xs font-mono font-bold ${
                            tx.deltaUncommon < 0
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          <WildcardLotusCard rarity="uncommon" size="sm" />
                          <span>{tx.deltaUncommon > 0 ? `+${tx.deltaUncommon}` : tx.deltaUncommon} U</span>
                        </div>
                      )}

                      {tx.deltaCommon !== 0 && (
                        <div
                          className={`flex items-center gap-1 px-1.5 py-0.5 border text-xs font-mono font-bold ${
                            tx.deltaCommon < 0
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          <WildcardLotusCard rarity="common" size="sm" />
                          <span>{tx.deltaCommon > 0 ? `+${tx.deltaCommon}` : tx.deltaCommon} C</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-white/10 flex items-center justify-between text-[11px] font-sans text-neutral-400 bg-white/[0.01]">
          <span>
            Tracking updates automatically whenever MTGA logs inventory or crafting changes.
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white font-sans text-xs uppercase font-semibold border border-white/10 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
