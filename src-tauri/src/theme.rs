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
    /// SHARED DARK BASE (Identical across all 5 themes)
    /// base: #0B0C10, mantle: #12141A, surface: #1A1D24, border: #2A2F3D, text: #F8FAFC, subtext: #94A3B8

    /// 1. Blue (Primary / Default Theme — Sapphire Ice Blue Accent)
    /// NOTE: Blue (#38BDF8) is an intensified UI-tuned version of Scryfall's raw mana symbol hue (#C1D7E9) for dark mode contrast.
    pub fn blue() -> Self {
        Self {
            id: "blue".to_string(),
            name: "Blue (Progress)".to_string(),
            is_dark: true,
            base: "#0B0C10".to_string(),
            mantle: "#12141A".to_string(),
            surface: "#1A1D24".to_string(),
            border: "#2A2F3D".to_string(),
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
            base: "#0B0C10".to_string(),
            mantle: "#12141A".to_string(),
            surface: "#1A1D24".to_string(),
            border: "#2A2F3D".to_string(),
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
    /// NOTE: Black (#A855F7) is an intentional purple substitution to represent Magic's black-mana color identity without vanishing against the dark UI background.
    pub fn black() -> Self {
        Self {
            id: "black".to_string(),
            name: "Black (Ambition)".to_string(),
            is_dark: true,
            base: "#0B0C10".to_string(),
            mantle: "#12141A".to_string(),
            surface: "#1A1D24".to_string(),
            border: "#2A2F3D".to_string(),
            text: "#F8FAFC".to_string(),
            subtext: "#94A3B8".to_string(),
            accent: "#A855F7".to_string(),
            accent_hover: "#C084FC".to_string(),
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
            base: "#0B0C10".to_string(),
            mantle: "#12141A".to_string(),
            surface: "#1A1D24".to_string(),
            border: "#2A2F3D".to_string(),
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
            base: "#0B0C10".to_string(),
            mantle: "#12141A".to_string(),
            surface: "#1A1D24".to_string(),
            border: "#2A2F3D".to_string(),
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
