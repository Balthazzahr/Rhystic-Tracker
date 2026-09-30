use serde::{Deserialize, Serialize};
use serde_json::json;

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_LAYOUT_ID: &str = "default";

pub const VALID_WIDGET_KINDS: &[&str] = &[
    "win_rate_summary",
    "today",
    "current_streak",
    "win_rate_trend",
    "recent_matches",
    "format_breakdown",
    "format_distribution",
    "deck_spotlight",
    "recent_achievements",
    "featured_leaderboard",
    "fun_facts",
    "frequent_opponents",
    "play_vs_draw",
    "victory_breakdown",
    "life_closeness",
    "activity_heatmap",
    "lucky_cursed_cards",
    "guild_mastery",
    "radial_format_dial",
    "mulligan_meter",
    "archetype_clash",
    "currencies_vault",
    "wildcards_golden_pack",
    "economy_overview",
    "economy_trends",
    "active_quests",
    "reward_tracks",
    "quests_rewards_overview",
    "ranked_ladder",
];

fn default_widget_width() -> u32 {
    4
}

fn default_widget_height() -> u32 {
    3
}

fn default_widget_page() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WidgetInstance {
    pub id: String,
    pub kind: String,
    #[serde(default = "default_widget_page")]
    pub page: u32,
    #[serde(default)]
    pub x: u32,
    #[serde(default)]
    pub y: u32,
    #[serde(default = "default_widget_width")]
    pub width: u32,
    #[serde(default = "default_widget_height")]
    pub height: u32,
    #[serde(default = "default_widget_settings")]
    pub settings: serde_json::Value,
}

fn default_widget_settings() -> serde_json::Value {
    json!({})
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DashboardLayoutPayload {
    pub schema_version: u32,
    pub widgets: Vec<WidgetInstance>,
}

pub fn default_dashboard_layout() -> DashboardLayoutPayload {
    DashboardLayoutPayload {
        schema_version: CURRENT_SCHEMA_VERSION,
        widgets: vec![
            WidgetInstance {
                id: "widget-win-rate-summary".to_string(),
                kind: "win_rate_summary".to_string(),
                page: 1,
                x: 0,
                y: 0,
                width: 4,
                height: 1,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-today".to_string(),
                kind: "today".to_string(),
                page: 1,
                x: 4,
                y: 0,
                width: 4,
                height: 1,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-current-streak".to_string(),
                kind: "current_streak".to_string(),
                page: 1,
                x: 8,
                y: 0,
                width: 4,
                height: 1,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-win-rate-trend".to_string(),
                kind: "win_rate_trend".to_string(),
                page: 1,
                x: 0,
                y: 1,
                width: 7,
                height: 3,
                settings: json!({
                    "timeRange": "14D",
                    "formatFilter": "ALL"
                }),
            },
            WidgetInstance {
                id: "widget-deck-spotlight".to_string(),
                kind: "deck_spotlight".to_string(),
                page: 1,
                x: 7,
                y: 1,
                width: 5,
                height: 3,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-recent-matches".to_string(),
                kind: "recent_matches".to_string(),
                page: 1,
                x: 0,
                y: 4,
                width: 5,
                height: 3,
                settings: json!({
                    "limit": 10
                }),
            },
            WidgetInstance {
                id: "widget-format-distribution".to_string(),
                kind: "format_distribution".to_string(),
                page: 1,
                x: 5,
                y: 4,
                width: 4,
                height: 2,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-fun-facts".to_string(),
                kind: "fun_facts".to_string(),
                page: 1,
                x: 8,
                y: 4,
                width: 4,
                height: 3,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-recent-achievements".to_string(),
                kind: "recent_achievements".to_string(),
                page: 1,
                x: 0,
                y: 7,
                width: 6,
                height: 3,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-featured-leaderboard".to_string(),
                kind: "featured_leaderboard".to_string(),
                page: 1,
                x: 6,
                y: 7,
                width: 6,
                height: 3,
                settings: json!({}),
            },
            WidgetInstance {
                id: "widget-frequent-opponents".to_string(),
                kind: "frequent_opponents".to_string(),
                page: 1,
                x: 0,
                y: 10,
                width: 6,
                height: 3,
                settings: json!({
                    "limit": 6
                }),
            },
            WidgetInstance {
                id: "widget-play-vs-draw".to_string(),
                kind: "play_vs_draw".to_string(),
                page: 1,
                x: 6,
                y: 10,
                width: 6,
                height: 3,
                settings: json!({}),
            },
        ],
    }
}

pub fn validate_layout(layout: &DashboardLayoutPayload) -> Result<(), String> {
    if layout.schema_version != CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported schema version {}, expected {}",
            layout.schema_version, CURRENT_SCHEMA_VERSION
        ));
    }
    if layout.widgets.is_empty() {
        return Err("Layout must contain at least one widget".to_string());
    }
    for w in &layout.widgets {
        if w.id.trim().is_empty() {
            return Err("Widget id cannot be empty".to_string());
        }
        if !VALID_WIDGET_KINDS.contains(&w.kind.as_str()) {
            return Err(format!("Invalid widget kind '{}'", w.kind));
        }
        if w.width == 0 || w.width > 12 {
            return Err(format!("Widget width must be between 1 and 12, got {}", w.width));
        }
        if w.height == 0 || w.height > 24 {
            return Err(format!("Widget height must be between 1 and 24, got {}", w.height));
        }
        if w.x >= 12 {
            return Err(format!("Widget x coordinate must be between 0 and 11, got {}", w.x));
        }
        if w.page == 0 || w.page > 50 {
            return Err(format!("Widget page must be between 1 and 50, got {}", w.page));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_dashboard_layout_valid() {
        let layout = default_dashboard_layout();
        assert_eq!(layout.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(layout.widgets.len(), 12);
        assert!(validate_layout(&layout).is_ok());
    }

    #[test]
    fn test_validate_layout_invalid_kind() {
        let mut layout = default_dashboard_layout();
        layout.widgets[0].kind = "unsupported_widget_kind".to_string();
        let res = validate_layout(&layout);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Invalid widget kind"));
    }

    #[test]
    fn test_validate_layout_invalid_dimensions() {
        let mut layout = default_dashboard_layout();
        layout.widgets[0].width = 0;
        assert!(validate_layout(&layout).is_err());

        layout.widgets[0].width = 13;
        assert!(validate_layout(&layout).is_err());

        layout.widgets[0].width = 4;
        layout.widgets[0].height = 0;
        assert!(validate_layout(&layout).is_err());

        layout.widgets[0].height = 25;
        assert!(validate_layout(&layout).is_err());

        layout.widgets[0].height = 1;
        layout.widgets[0].x = 12;
        assert!(validate_layout(&layout).is_err());
    }

    #[test]
    fn test_validate_layout_invalid_schema_version() {
        let mut layout = default_dashboard_layout();
        layout.schema_version = 99;
        assert!(validate_layout(&layout).is_err());
    }

    #[test]
    fn test_validate_layout_empty_widgets() {
        let layout = DashboardLayoutPayload {
            schema_version: 1,
            widgets: vec![],
        };
        assert!(validate_layout(&layout).is_err());
    }

    #[test]
    fn test_validate_layout_invalid_page() {
        let mut layout = default_dashboard_layout();
        layout.widgets[0].page = 0;
        assert!(validate_layout(&layout).is_err());

        layout.widgets[0].page = 51;
        assert!(validate_layout(&layout).is_err());
    }
}
