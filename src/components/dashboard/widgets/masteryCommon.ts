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

export function useMasteryPass() {
  const [pass, setPass] = useState<MasteryPassStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPass = useCallback(async () => {
    try {
      const res = await invoke<MasteryPassStatus | null>("get_mastery_pass_status");
      setPass(res);
    } catch (e) {
      console.error("Failed to fetch mastery pass status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPass();
    const interval = setInterval(fetchPass, 60000);
    return () => clearInterval(interval);
  }, [fetchPass]);

  return { pass, loading, refetch: fetchPass };
}
