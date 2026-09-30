import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface PlayerRankStatus {
  season_ordinal: number;
  constructed_tier: string;
  constructed_level: number;
  constructed_step: number;
  constructed_wins: number;
  constructed_losses: number;
  limited_tier: string;
  limited_level: number;
  limited_step: number;
  limited_wins: number;
  limited_losses: number;
  season_start_time?: string;
  season_end_time?: string;
  updated_at: string;
}

export interface PlayerRankSnapshot {
  id: number;
  timestamp: string;
  season_ordinal: number;
  constructed_tier: string;
  constructed_level: number;
  constructed_step: number;
  constructed_wins: number;
  constructed_losses: number;
  limited_tier: string;
  limited_level: number;
  limited_step: number;
  limited_wins: number;
  limited_losses: number;
  season_end_time?: string;
}

export function formatRomanLevel(level: number): string {
  switch (level) {
    case 1:
      return "I";
    case 2:
      return "II";
    case 3:
      return "III";
    case 4:
      return "IV";
    default:
      return `${level}`;
  }
}

export function getTierTheme(tier: string): {
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  pipActive: string;
  glow: string;
} {
  const t = tier.toLowerCase();
  switch (t) {
    case "mythic":
      return {
        badgeBg: "bg-gradient-to-br from-amber-500/20 via-rose-500/20 to-purple-600/30",
        badgeBorder: "border-amber-400/70",
        textColor: "text-amber-300",
        pipActive: "bg-gradient-to-r from-amber-400 to-rose-400 border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
        glow: "shadow-[0_0_12px_rgba(245,158,11,0.25)]",
      };
    case "diamond":
      return {
        badgeBg: "bg-gradient-to-br from-cyan-500/20 to-blue-600/30",
        badgeBorder: "border-cyan-400/70",
        textColor: "text-cyan-300",
        pipActive: "bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.5)]",
        glow: "shadow-[0_0_10px_rgba(6,182,212,0.25)]",
      };
    case "platinum":
      return {
        badgeBg: "bg-gradient-to-br from-teal-500/20 to-emerald-600/30",
        badgeBorder: "border-teal-400/70",
        textColor: "text-teal-300",
        pipActive: "bg-teal-400 border-teal-300 shadow-[0_0_8px_rgba(20,184,166,0.5)]",
        glow: "shadow-[0_0_10px_rgba(20,184,166,0.25)]",
      };
    case "gold":
      return {
        badgeBg: "bg-gradient-to-br from-amber-500/20 to-yellow-600/30",
        badgeBorder: "border-amber-500/70",
        textColor: "text-amber-400",
        pipActive: "bg-amber-400 border-yellow-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
        glow: "shadow-[0_0_10px_rgba(245,158,11,0.25)]",
      };
    case "silver":
      return {
        badgeBg: "bg-gradient-to-br from-slate-400/20 to-zinc-500/30",
        badgeBorder: "border-slate-400/70",
        textColor: "text-slate-200",
        pipActive: "bg-slate-300 border-slate-200 shadow-[0_0_6px_rgba(203,213,225,0.4)]",
        glow: "shadow-[0_0_8px_rgba(203,213,225,0.2)]",
      };
    case "bronze":
    default:
      return {
        badgeBg: "bg-gradient-to-br from-amber-700/20 to-orange-900/30",
        badgeBorder: "border-amber-700/60",
        textColor: "text-amber-500",
        pipActive: "bg-amber-600 border-amber-500 shadow-[0_0_6px_rgba(217,119,6,0.4)]",
        glow: "shadow-[0_0_8px_rgba(217,119,6,0.2)]",
      };
  }
}

export function getMaxStepsForTier(tier: string, isLimited: boolean): number {
  const t = tier.toLowerCase();
  if (t === "mythic") return 1;
  if (isLimited) {
    if (t === "bronze") return 4;
    return 5;
  }
  return 6;
}

export function usePlayerRank() {
  const [rank, setRank] = useState<PlayerRankStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRank = useCallback(async () => {
    try {
      const res = await invoke<PlayerRankStatus | null>("get_player_rank_status");
      setRank(res);
    } catch (e) {
      console.error("Failed to fetch player rank status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRank();
    const interval = setInterval(fetchRank, 15000);
    return () => clearInterval(interval);
  }, [fetchRank]);

  return { rank, loading, refetch: fetchRank };
}

export function usePlayerRankHistory(limit = 50) {
  const [history, setHistory] = useState<PlayerRankSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await invoke<PlayerRankSnapshot[]>("get_player_rank_history", { limit });
      setHistory(res || []);
    } catch (e) {
      console.error("Failed to fetch rank history:", e);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, refetch: fetchHistory };
}
