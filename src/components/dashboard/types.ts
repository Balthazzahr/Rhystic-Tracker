import React from "react";

export interface WidgetInstance {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  settings: Record<string, any>;
}

export interface DashboardLayout {
  schema_version: number;
  widgets: WidgetInstance[];
}

export interface ManaTheme {
  id: string;
  name: string;
  is_dark: boolean;
  base: string;
  mantle: string;
  surface: string;
  border: string;
  text: string;
  subtext: string;
  accent: string;
  accent_hover: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
}

export interface MatchRecord {
  match_id: string;
  timestamp: string;
  date_str: string;
  format_name: string;
  result: string;
  result_reason?: string;
  duration_seconds: number;
  turns: number;
  going_first: boolean;
  player_deck_name: string;
  player_commander_id?: number;
  player_commander_name?: string;
  player_life_end?: number;
  player_mulligans?: number;
  opponent_name?: string;
  opponent_commander_id?: number;
  opponent_commander_name?: string;
  opponent_mulligans?: number;
  opponent_life_end?: number;
  mana_curve?: number[];
  deck_colors?: string[];
  opponent_colors?: string[];
}

export interface DashboardStats {
  todayWins: number;
  todayLosses: number;
  todayCount: number;
  todayWinRate: number;
  allWins: number;
  allLosses: number;
  allCount: number;
  allWinRate: number;
  curStreak: number;
  curStreakType: "win" | "loss" | "";
}

export interface WidgetProps {
  widget: WidgetInstance;
  matches: MatchRecord[];
  winLossMatches: MatchRecord[];
  stats: DashboardStats;
  deckOverview: any[];
  palette: ManaTheme | null;
  formatOptions: { value: string; label: string }[];
  timeOptions: { value: string; label: string }[];
  onSelectMatch: (matchId: string) => void;
  onSelectDeck: (deckName: string) => void;
  onShowCard: (card: { name: string; grp_id?: number }, isCommander: boolean) => void;
  onInspectAchievement?: (ach: any) => void;
  onInspectLeaderboard?: (cat: any) => void;
  onUpdateSettings?: (settings: Record<string, any>) => void;
  customColors?: any;
  isLoading?: boolean;
}

export interface WidgetDefinition {
  kind: string;
  title: string;
  subtitle?: string;
  icon: string | React.ReactNode;
  defaultWidth: number;
  defaultHeight: number;
  defaultSettings: Record<string, any>;
  component: React.ComponentType<WidgetProps>;
}
