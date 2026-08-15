use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManaTheme {
    pub id: String,
    pub name: String,
    pub is_dark: bool,
    pub base: String,
    pub mantle: String,
    pub surface: String,
    pub border: String,
    pub text: String,
    pub subtext: String,
    pub accent: String,
    pub accent_hover: String,
    pub green: String,
    pub red: String,
    pub yellow: String,
    pub blue: String,
}

impl ManaTheme {
    /// SHARED DARK BASE (base identical across all 5 themes).
    /// Each theme tints its mantle/surface/border with a very subtle amount of
    /// its accent color so panels and cells take on a faint color cast.
    /// base: #0B0C10, text: #F8FAFC, subtext: #94A3B8

    /// 1. Blue (Primary / Default Theme — Sapphire Ice Blue Accent)
    /// NOTE: Blue (#38BDF8) is an intensified UI-tuned version of Scryfall's raw mana symbol hue (#C1D7E9) for dark mode contrast.
    pub fn blue() -> Self {
        Self {
            id: "blue".to_string(),
            name: "Blue (Progress)".to_string(),
            is_dark: true,
            base: "#0D1319".to_string(),
            mantle: "#14191F".to_string(),
            surface: "#1C232A".to_string(),
            border: "#242E37".to_string(),
            text: "#F8FAFC".to_string(),
            subtext: "#94A3B8".to_string(),
            accent: "#38BDF8".to_string(),
            accent_hover: "#7DD3FC".to_string(),
            green: "#34D399".to_string(),
            red: "#F87171".to_string(),
            yellow: "#FBBF24".to_string(),
            blue: "#38BDF8".to_string(),
        }
    }

    /// 2. White (Plains — Solar Ivory / Parchment Accent)
    /// NOTE: White (#F8F6D8) is the EXACT raw SVG fill color extracted directly from Scryfall's official White mana symbol asset (W.svg).
    pub fn white() -> Self {
        Self {
            id: "white".to_string(),
            name: "White (Order)".to_string(),
            is_dark: true,
            base: "#141518".to_string(),
            mantle: "#141516".to_string(),
            surface: "#1D1E20".to_string(),
            border: "#2B2D2E".to_string(),
            text: "#F8FAFC".to_string(),
            subtext: "#94A3B8".to_string(),
            accent: "#F8F6D8".to_string(),
            accent_hover: "#FFFFF0".to_string(),
            green: "#34D399".to_string(),
            red: "#F87171".to_string(),
            yellow: "#FBBF24".to_string(),
            blue: "#38BDF8".to_string(),
        }
    }

    /// 3. Black (Swamp — Necromantic Violet / Purple Accent)
    /// NOTE: Black uses a slightly darker, desaturated purple (#8E59C1) to keep
    /// the Magic black-mana identity readable on the dark UI without being too fluorescent.
    pub fn black() -> Self {
        Self {
            id: "black".to_string(),
            name: "Black (Ambition)".to_string(),
            is_dark: true,
            base: "#100F17".to_string(),
            mantle: "#17141E".to_string(),
            surface: "#201C2B".to_string(),
            border: "#2C2638".to_string(),
            text: "#F8FAFC".to_string(),
            subtext: "#94A3B8".to_string(),
            accent: "#8E59C1".to_string(),
            accent_hover: "#A87BD3".to_string(),
            green: "#34D399".to_string(),
            red: "#F87171".to_string(),
            yellow: "#FBBF24".to_string(),
            blue: "#38BDF8".to_string(),
        }
    }

    /// 4. Red (Mountain — Fiery Crimson / Ember Accent)
    /// NOTE: Red (#F87171) is an intensified UI-tuned version of Scryfall's raw mana symbol hue (#E49977) for dark mode contrast.
    pub fn red() -> Self {
        Self {
            id: "red".to_string(),
            name: "Red (Chaos)".to_string(),
            is_dark: true,
            base: "#141014".to_string(),
            mantle: "#1D181A".to_string(),
            surface: "#261F22".to_string(),
            border: "#352A2C".to_string(),
            text: "#F8FAFC".to_string(),
            subtext: "#94A3B8".to_string(),
            accent: "#F87171".to_string(),
            accent_hover: "#FCA5A5".to_string(),
            green: "#34D399".to_string(),
            red: "#F87171".to_string(),
            yellow: "#FBBF24".to_string(),
            blue: "#38BDF8".to_string(),
        }
    }

    /// 5. Green (Forest — Sylvan Emerald Accent)
    /// NOTE: Green (#34D399) is an intensified UI-tuned version of Scryfall's raw mana symbol hue (#A3C095) for dark mode contrast.
    pub fn green() -> Self {
        Self {
            id: "green".to_string(),
            name: "Green (Nature)".to_string(),
            is_dark: true,
            base: "#0D1415".to_string(),
            mantle: "#141D1A".to_string(),
            surface: "#1B2723".to_string(),
            border: "#283731".to_string(),
            text: "#F8FAFC".to_string(),
            subtext: "#94A3B8".to_string(),
            accent: "#34D399".to_string(),
            accent_hover: "#6EE7B7".to_string(),
            green: "#34D399".to_string(),
            red: "#F87171".to_string(),
            yellow: "#FBBF24".to_string(),
            blue: "#38BDF8".to_string(),
        }
    }
}

pub fn get_mana_theme(theme_id: &str) -> ManaTheme {
    match theme_id.to_lowercase().as_str() {
        "white" => ManaTheme::white(),
        "black" => ManaTheme::black(),
        "red" => ManaTheme::red(),
        "green" => ManaTheme::green(),
        _ => ManaTheme::blue(),
    }
}
