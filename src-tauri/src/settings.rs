use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub mtga_log_path: Option<String>,
}

fn settings_path() -> Option<PathBuf> {
    let mut dir = dirs::config_dir()?;
    dir.push("rhystic-tracker");
    dir.push("settings.json");
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
