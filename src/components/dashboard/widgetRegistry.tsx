import React from "react";
import { WidgetDefinition, DashboardLayout } from "./types";
import { WinRateSummaryWidget } from "./widgets/WinRateSummaryWidget";
import { TodayWidget } from "./widgets/TodayWidget";
import { CurrentStreakWidget } from "./widgets/CurrentStreakWidget";
import { WinRateTrendWidget } from "./widgets/WinRateTrendWidget";
import { RecentMatchesWidget } from "./widgets/RecentMatchesWidget";
import { FormatBreakdownWidget } from "./widgets/FormatBreakdownWidget";
import { DeckSpotlightWidget } from "./widgets/DeckSpotlightWidget";
import { RecentAchievementsWidget } from "./widgets/RecentAchievementsWidget";
import { FeaturedLeaderboardWidget } from "./widgets/FeaturedLeaderboardWidget";
import { FunFactsWidget } from "./widgets/FunFactsWidget";
import {
  Trophy,
  Calendar,
  Flame,
  TrendingUp,
  Swords,
  Layers,
  Sparkles,
  Award,
  Crown,
  Lightbulb,
} from "lucide-react";

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  win_rate_summary: {
    kind: "win_rate_summary",
    title: "All-Time Win Rate",
    subtitle: "Lifetime record",
    icon: <Trophy className="w-3.5 h-3.5" />,
    defaultWidth: 4,
    defaultHeight: 1,
    defaultSettings: {},
    component: WinRateSummaryWidget,
  },
  today: {
    kind: "today",
    title: "Today Win Rate",
    subtitle: "Current session",
    icon: <Calendar className="w-3.5 h-3.5" />,
    defaultWidth: 4,
    defaultHeight: 1,
    defaultSettings: {},
    component: TodayWidget,
  },
  current_streak: {
    kind: "current_streak",
    title: "Current Streak",
    subtitle: "Active streak",
    icon: <Flame className="w-3.5 h-3.5" />,
    defaultWidth: 4,
    defaultHeight: 1,
    defaultSettings: {},
    component: CurrentStreakWidget,
  },
  win_rate_trend: {
    kind: "win_rate_trend",
    title: "Trending Win Rate",
    subtitle: "Rolling performance",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    defaultWidth: 7,
    defaultHeight: 3,
    defaultSettings: {
      timeRange: "14D",
      formatFilter: "ALL",
    },
    component: WinRateTrendWidget,
  },
  deck_spotlight: {
    kind: "deck_spotlight",
    title: "Deck Spotlight",
    subtitle: "Featured deck",
    icon: <Sparkles className="w-3.5 h-3.5" />,
    defaultWidth: 5,
    defaultHeight: 3,
    defaultSettings: {},
    component: DeckSpotlightWidget,
  },
  recent_matches: {
    kind: "recent_matches",
    title: "Recent Matches",
    subtitle: "Latest activity",
    icon: <Swords className="w-3.5 h-3.5" />,
    defaultWidth: 5,
    defaultHeight: 3,
    defaultSettings: {
      limit: 10,
    },
    component: RecentMatchesWidget,
  },
  format_breakdown: {
    kind: "format_breakdown",
    title: "Format Breakdown",
    subtitle: "By game mode",
    icon: <Layers className="w-3.5 h-3.5" />,
    defaultWidth: 3,
    defaultHeight: 3,
    defaultSettings: {
      limit: 8,
    },
    component: FormatBreakdownWidget,
  },
  fun_facts: {
    kind: "fun_facts",
    title: "Fun Facts",
    subtitle: "Play telemetry",
    icon: <Lightbulb className="w-3.5 h-3.5" />,
    defaultWidth: 4,
    defaultHeight: 3,
    defaultSettings: {},
    component: FunFactsWidget,
  },
  recent_achievements: {
    kind: "recent_achievements",
    title: "Recent Achievements",
    subtitle: "Latest trophies",
    icon: <Award className="w-3.5 h-3.5" />,
    defaultWidth: 6,
    defaultHeight: 3,
    defaultSettings: {
      limit: 4,
    },
    component: RecentAchievementsWidget,
  },
  featured_leaderboard: {
    kind: "featured_leaderboard",
    title: "Featured Leaderboard",
    subtitle: "Hall of fame records",
    icon: <Crown className="w-3.5 h-3.5" />,
    defaultWidth: 6,
    defaultHeight: 3,
    defaultSettings: {
      category: "combat_single_hit",
    },
    component: FeaturedLeaderboardWidget,
  },
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  schema_version: 1,
  widgets: [
    {
      id: "widget-win-rate-summary",
      kind: "win_rate_summary",
      x: 0,
      y: 0,
      width: 4,
      height: 1,
      settings: {},
    },
    {
      id: "widget-today",
      kind: "today",
      x: 4,
      y: 0,
      width: 4,
      height: 1,
      settings: {},
    },
    {
      id: "widget-current-streak",
      kind: "current_streak",
      x: 8,
      y: 0,
      width: 4,
      height: 1,
      settings: {},
    },
    {
      id: "widget-win-rate-trend",
      kind: "win_rate_trend",
      x: 0,
      y: 1,
      width: 7,
      height: 3,
      settings: {
        timeRange: "14D",
        formatFilter: "ALL",
      },
    },
    {
      id: "widget-deck-spotlight",
      kind: "deck_spotlight",
      x: 7,
      y: 1,
      width: 5,
      height: 3,
      settings: {},
    },
    {
      id: "widget-recent-matches",
      kind: "recent_matches",
      x: 0,
      y: 4,
      width: 5,
      height: 3,
      settings: {
        limit: 10,
      },
    },
    {
      id: "widget-format-breakdown",
      kind: "format_breakdown",
      x: 5,
      y: 4,
      width: 3,
      height: 3,
      settings: {
        limit: 8,
      },
    },
    {
      id: "widget-fun-facts",
      kind: "fun_facts",
      x: 8,
      y: 4,
      width: 4,
      height: 3,
      settings: {},
    },
    {
      id: "widget-recent-achievements",
      kind: "recent_achievements",
      x: 0,
      y: 7,
      width: 6,
      height: 3,
      settings: {
        limit: 4,
      },
    },
    {
      id: "widget-featured-leaderboard",
      kind: "featured_leaderboard",
      x: 6,
      y: 7,
      width: 6,
      height: 3,
      settings: {
        category: "combat_single_hit",
      },
    },
  ],
};
