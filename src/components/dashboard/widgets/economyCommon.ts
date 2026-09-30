import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface EconomySnapshot {
  id: number;
  timestamp: string;
  gold: number;
  gems: number;
  vault_progress_tenths: number;
  vault_progress_pct: number;
  wc_track_pos: number;
  wc_common: number;
  wc_uncommon: number;
  wc_rare: number;
  wc_mythic: number;
  draft_tokens: number;
  jump_in_tokens: number;
  golden_pack_progress: number;
}

export function formatCurrency(val: number | undefined | null): string {
  if (val === undefined || val === null) return "0";
  return val.toLocaleString("en-US");
}

export function usePlayerEconomy(pollIntervalMs = 15000) {
  const [economy, setEconomy] = useState<EconomySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEconomy = useCallback(async () => {
    try {
      const data = await invoke<EconomySnapshot | null>("get_player_economy");
      setEconomy(data);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load player economy:", err);
      setError(err?.toString() || "Failed to load economy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEconomy();

    const interval = setInterval(fetchEconomy, pollIntervalMs);
    const handleFocus = () => fetchEconomy();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchEconomy, pollIntervalMs]);

  return { economy, loading, error, refetch: fetchEconomy };
}
