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
    /// SHARED DARK BASE: Grounded neutral darks with subtle warm undertones.
    /// Each theme tints its mantle/surface/border with a restrained amount of its
    /// mana identity hue so panels and cells take on an authentic material cast.

    /// 1. Blue (Island / Progress — Steel Sapphire Slate Accent)
    pub fn blue() -> Self {
        Self {
            id: "blue".to_string(),
            name: "Blue (Progress)".to_string(),
            is_dark: true,
            base: "#0F1317".to_string(),
            mantle: "#14191E".to_string(),
            surface: "#1B222A".to_string(),
            border: "#27333F".to_string(),
            text: "#F4F4F6".to_string(),
            subtext: "#9297A0".to_string(),
            accent: "#4A7FA3".to_string(),
            accent_hover: "#6097BC".to_string(),
            green: "#4A7856".to_string(),
            red: "#B8503A".to_string(),
            yellow: "#D4A237".to_string(),
            blue: "#4A7FA3".to_string(),
        }
    }

    /// 2. White (Plains / Order — Warm Ivory / Parchment Accent)
    pub fn white() -> Self {
        Self {
            id: "white".to_string(),
            name: "White (Order)".to_string(),
            is_dark: true,
            base: "#131313".to_string(),
            mantle: "#181817".to_string(),
            surface: "#21211F".to_string(),
            border: "#32312D".to_string(),
            text: "#F5F3EC".to_string(),
            subtext: "#9B988E".to_string(),
            accent: "#E8E2CC".to_string(),
            accent_hover: "#F4EEDB".to_string(),
            green: "#4A7856".to_string(),
            red: "#B8503A".to_string(),
            yellow: "#D4A237".to_string(),
            blue: "#4A7FA3".to_string(),
        }
    }

    /// 3. Black (Swamp / Ambition — Deep Obsidian Violet Accent)
    pub fn black() -> Self {
        Self {
            id: "black".to_string(),
            name: "Black (Ambition)".to_string(),
            is_dark: true,
            base: "#0E0D10".to_string(),
            mantle: "#141217".to_string(),
            surface: "#1D1922".to_string(),
            border: "#2C2534".to_string(),
            text: "#F4F4F6".to_string(),
            subtext: "#928E99".to_string(),
            accent: "#8a719d".to_string(),
            accent_hover: "#a28bb5".to_string(),
            green: "#4A7856".to_string(),
            red: "#B8503A".to_string(),
            yellow: "#D4A237".to_string(),
            blue: "#4A7FA3".to_string(),
        }
    }

    /// 4. Red (Mountain / Chaos — Brick & Ember Crimson Accent)
    pub fn red() -> Self {
        Self {
            id: "red".to_string(),
            name: "Red (Chaos)".to_string(),
            is_dark: true,
            base: "#141010".to_string(),
            mantle: "#1A1414".to_string(),
            surface: "#241B1B".to_string(),
            border: "#372727".to_string(),
            text: "#F5F4F4".to_string(),
            subtext: "#9B9090".to_string(),
            accent: "#B8503A".to_string(),
            accent_hover: "#D0644C".to_string(),
            green: "#4A7856".to_string(),
            red: "#B8503A".to_string(),
            yellow: "#D4A237".to_string(),
            blue: "#4A7FA3".to_string(),
        }
    }

    /// 5. Green (Forest / Nature — Forest Moss & Sylvan Accent)
    pub fn green() -> Self {
        Self {
            id: "green".to_string(),
            name: "Green (Nature)".to_string(),
            is_dark: true,
            base: "#0F1310".to_string(),
            mantle: "#141915".to_string(),
            surface: "#1B231D".to_string(),
            border: "#27342B".to_string(),
            text: "#F4F5F4".to_string(),
            subtext: "#909892".to_string(),
            accent: "#4A7856".to_string(),
            accent_hover: "#5E946E".to_string(),
            green: "#4A7856".to_string(),
            red: "#B8503A".to_string(),
            yellow: "#D4A237".to_string(),
            blue: "#4A7FA3".to_string(),
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
