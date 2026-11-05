import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface MasteryPassStatus {
  pass_id: string;
  set_code: string;
  pass_name: string;
  current_level: number;
  current_xp: number;
  xp_per_level: number;
  is_premium: boolean;
  orbs: number;
  max_level: number;
  claimed_levels: number[];
  updated_at: string;
}

let cachedMasteryPass: MasteryPassStatus | null = null;
let cachedMasteryJson = "";
let lastMasteryFetchAt = 0;
let inFlightMasteryPromise: Promise<MasteryPassStatus | null> | null = null;

export function useMasteryPass() {
  const [pass, setPass] = useState<MasteryPassStatus | null>(cachedMasteryPass);
  const [loading, setLoading] = useState(cachedMasteryPass === null);

  const fetchPass = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedMasteryPass !== null && now - lastMasteryFetchAt < 5000) {
      setPass((prev) => (prev === cachedMasteryPass ? prev : cachedMasteryPass));
      setLoading(false);
      return;
    }

    try {
      if (!inFlightMasteryPromise) {
        inFlightMasteryPromise = invoke<MasteryPassStatus | null>("get_mastery_pass_status").finally(() => {
          inFlightMasteryPromise = null;
        });
      }
      const res = await inFlightMasteryPromise;
      lastMasteryFetchAt = Date.now();
      const nextJson = JSON.stringify(res);
      if (nextJson !== cachedMasteryJson) {
        cachedMasteryJson = nextJson;
        cachedMasteryPass = res;
      }
      setPass((prev) => (prev === cachedMasteryPass ? prev : cachedMasteryPass));
    } catch (e) {
      console.error("Failed to fetch mastery pass status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPass();
    const interval = setInterval(() => fetchPass(false), 60000);
    return () => clearInterval(interval);
  }, [fetchPass]);

  return { pass, loading, refetch: () => fetchPass(true) };
}
