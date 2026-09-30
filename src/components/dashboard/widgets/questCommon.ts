import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface QuestRecord {
  quest_id: string;
  loc_key: string;
  title: string;
  description: string;
  category: string;
  colors: string[];
  goal: number;
  current_progress: number;
  starting_progress: number;
  reward_gold: number;
  reward_xp: number;
  can_swap: boolean;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  completed_at?: string;
  duration_seconds?: number;
  matches_played_during: number;
}

export interface ActiveQuestsResponse {
  quests: QuestRecord[];
  can_swap: boolean;
}

export interface CategoryStat {
  category: string;
  count: number;
  percentage: number;
}

export interface ColorStat {
  guild: string;
  colors: string[];
  count: number;
  percentage: number;
}

export interface QuestFrequencyStat {
  title: string;
  category: string;
  reward_gold: number;
  times_seen: number;
  times_completed: number;
  avg_duration_hours?: number;
  avg_matches?: number;
}

export interface QuestStatistics {
  total_quests_tracked: number;
  gold_500_count: number;
  gold_750_count: number;
  gold_500_pct: number;
  gold_750_pct: number;
  category_distribution: CategoryStat[];
  color_distribution: ColorStat[];
  quest_frequency: QuestFrequencyStat[];
  avg_duration_hours?: number;
  avg_matches_to_complete?: number;
  total_gold_earned: number;
  total_xp_earned: number;
}

export interface RewardMilestone {
  win_number: number;
  reward_type: string;
  gold: number;
  xp: number;
  has_card: boolean;
}

export interface RewardTracksStatus {
  daily_reset_timestamp: string;
  weekly_reset_timestamp: string;
  daily_wins: number;
  weekly_wins: number;
  daily_milestones: RewardMilestone[];
  weekly_milestones: RewardMilestone[];
  next_daily_reward?: RewardMilestone;
}

export function useActiveQuests() {
  const [data, setData] = useState<ActiveQuestsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchQuests = useCallback(async () => {
    try {
      const res = await invoke<ActiveQuestsResponse>("get_active_quests");
      setData(res);
    } catch (e) {
      console.error("Failed to load active quests:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuests();
    const interval = setInterval(fetchQuests, 8000);
    return () => clearInterval(interval);
  }, [fetchQuests]);

  return { data, loading, refetch: fetchQuests };
}

export function useRewardTracks() {
  const [status, setStatus] = useState<RewardTracksStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTracks = useCallback(async () => {
    try {
      const res = await invoke<RewardTracksStatus>("get_reward_tracks_status");
      setStatus(res);
    } catch (e) {
      console.error("Failed to load reward tracks status:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks();
    const interval = setInterval(fetchTracks, 8000);
    return () => clearInterval(interval);
  }, [fetchTracks]);

  return { status, loading, refetch: fetchTracks };
}

export function useCountdown(targetIso?: string) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetIso) {
      setTimeLeft("");
      return;
    }

    const update = () => {
      const target = new Date(targetIso).getTime();
      const now = Date.now();
      const diff = Math.max(0, target - now);

      if (diff <= 0) {
        setTimeLeft("00:00:00");
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${mins}m`);
      } else {
        const hh = String(hours).padStart(2, "0");
        const mm = String(mins).padStart(2, "0");
        const ss = String(secs).padStart(2, "0");
        setTimeLeft(`${hh}:${mm}:${ss}`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetIso]);

  return timeLeft;
}

export function formatQuestCategory(cat?: string): string {
  if (!cat) return "Other";
  switch (cat.toLowerCase()) {
    case "spells_guild":
    case "guild_spells":
      return "Guild Spells";
    case "lands":
      return "Play Lands";
    case "creatures_attack":
    case "attacks":
      return "Attack";
    case "creatures_cast":
    case "creatures":
      return "Cast Creatures";
    case "kill_creatures":
    case "kills":
      return "Kill Creatures";
    case "spells":
      return "Cast Spells";
    case "wins":
      return "Win Games";
    default:
      return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

