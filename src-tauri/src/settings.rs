use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub mtga_log_path: Option<String>,
    #[serde(default)]
    pub mtga_raw_dir: Option<String>,
    #[serde(default = "default_minimize_to_tray")]
    pub minimize_to_tray: bool,
    #[serde(default)]
    pub setup_completed: bool,
}

fn default_minimize_to_tray() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            mtga_log_path: None,
            mtga_raw_dir: None,
            minimize_to_tray: true,
            setup_completed: false,
        }
    }
}

fn settings_path() -> Option<PathBuf> {
    let mut dir = dirs::config_dir()?;
    dir.push("rhystic-tracker");
    let env_mode = crate::db::DatabaseManager::resolve_env();
    if env_mode.eq_ignore_ascii_case("development") {
        dir.push("settings_dev.json");
    } else {
        dir.push("settings.json");
    }
    Some(dir)
}

pub fn load_settings() -> AppSettings {
    let Some(path) = settings_path() else {
        return AppSettings::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let Some(path) = settings_path() else {
        return Err("Could not resolve user config dir".to_string());
    };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}
