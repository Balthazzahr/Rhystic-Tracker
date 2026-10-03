import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface BoosterPack {
  collation_id: number;
  set_code: string;
  count: number;
  set_name?: string | null;
}

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
  boosters?: BoosterPack[];
}

export function formatCurrency(val: number | undefined | null): string {
  if (val === undefined || val === null) return "0";
  return val.toLocaleString("en-US");
}

export interface WildcardWheelsProgress {
  rareWheel: number;
  uncommonWheel: number;
  packsToRare: number;
  packsToUncommon: number;
}

export function getWildcardWheelProgress(wcTrackPos: number = 0): WildcardWheelsProgress {
  // In MTGA, wcTrackPosition tracks progress along the 30-pack rotation (0..29).
  // Rare/Mythic completes every 6 packs with offset +1:
  const rareWheel = (wcTrackPos + 1) % 6;
  const packsToRare = rareWheel === 0 ? 6 : 6 - rareWheel;

  // Uncommon completes every 6 packs with offset +4:
  const uncommonWheel = (wcTrackPos + 4) % 6;
  const packsToUncommon = uncommonWheel === 0 ? 6 : 6 - uncommonWheel;

  return {
    rareWheel,
    uncommonWheel,
    packsToRare,
    packsToUncommon,
  };
}

export function usePlayerEconomy(pollIntervalMs = 60000) {
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
    // Immediate fetch on mount
    fetchEconomy();

    // Stagger interval start by a small random offset (0–4 s) so multiple
    // instances of this hook (CurrenciesVault + WildcardsGoldenPack) don't
    // fire their intervals at exactly the same time.
    const jitter = Math.floor(Math.random() * 4000);
    const jitterTimeout = setTimeout(() => {
      const interval = setInterval(fetchEconomy, pollIntervalMs);
      // Store interval ID on the timeout closure for cleanup
      (jitterTimeout as any).__interval = interval;
    }, jitter);

    const handleFocus = () => fetchEconomy();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearTimeout(jitterTimeout);
      const interval = (jitterTimeout as any).__interval;
      if (interval) clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchEconomy, pollIntervalMs]);

  return { economy, loading, error, refetch: fetchEconomy };
}
