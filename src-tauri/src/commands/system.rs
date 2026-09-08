use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use crate::db::{self, DatabaseManager};
use crate::card_db;
use crate::settings;
use crate::tailer;
use crate::theme::{get_mana_theme, ManaTheme};
use crate::commands::collection::{card_img_cache_dir, clear_universe_cache};

#[derive(serde::Serialize)]
pub struct AppEnvironmentInfo {
    environment: String,
    is_test: bool,
    db_name: String,
}

#[tauri::command]
pub fn get_app_environment() -> AppEnvironmentInfo {
    let env = db::DatabaseManager::resolve_env();
    let is_prod = env.to_lowercase() == "production";
    AppEnvironmentInfo {
        environment: if is_prod { "production".to_string() } else { "development".to_string() },
        is_test: !is_prod,
        db_name: if is_prod { "rhystic.db".to_string() } else { "rhystic_dev.db".to_string() },
    }
}

#[tauri::command]
pub fn get_active_theme(theme_id: String) -> ManaTheme {
    get_mana_theme(&theme_id)
}

// Resolve the effective MTGA log path: stored override > RHYSTIC_MTGA_LOG >
// auto-discovery. Returns an empty string when none can be found.
pub fn resolve_effective_log_path() -> String {
    let settings = settings::load_settings();
    if let Some(p) = settings.mtga_log_path.as_deref() {
        if !p.is_empty() {
            return p.to_string();
        }
    }
    if let Ok(p) = std::env::var("RHYSTIC_MTGA_LOG") {
        if !p.is_empty() {
            return p;
        }
    }
    tailer::discover_log_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Shared runtime state so the frontend can query the active log path and have
/// the tailer restart when the user changes it.
pub struct LogPathState {
    pub path_tx: tokio::sync::watch::Sender<String>,
}

#[tauri::command]
pub fn get_log_path(state: tauri::State<LogPathState>) -> String {
    state.path_tx.borrow().clone()
}

#[tauri::command]
pub fn set_log_path(state: tauri::State<LogPathState>, path: String) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    let mut settings = settings::load_settings();
    settings.mtga_log_path = if trimmed.is_empty() { None } else { Some(trimmed.clone()) };
    settings::save_settings(&settings)?;
    let effective = resolve_effective_log_path();
    state.path_tx.send(effective.clone()).map_err(|_| "log path channel closed".to_string())?;
    Ok(effective)
}

#[tauri::command]
pub fn get_minimize_to_tray() -> bool {
    settings::load_settings().minimize_to_tray
}

#[tauri::command]
pub fn set_minimize_to_tray(enabled: bool) -> Result<bool, String> {
    let mut settings = settings::load_settings();
    settings.minimize_to_tray = enabled;
    settings::save_settings(&settings)?;
    Ok(enabled)
}


#[derive(serde::Serialize)]
pub struct CacheStats {
    size_bytes: u64,
    file_count: usize,
}

#[tauri::command]
pub fn get_cache_stats(app: tauri::AppHandle) -> Result<CacheStats, String> {
    let dir = card_img_cache_dir(&app)?;
    let mut total_size = 0u64;
    let mut count = 0usize;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_size += meta.len();
                    count += 1;
                }
            }
        }
    }
    Ok(CacheStats { size_bytes: total_size, file_count: count })
}

#[tauri::command]
pub fn clear_image_cache(app: tauri::AppHandle) -> Result<CacheStats, String> {
    let dir = card_img_cache_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(CacheStats { size_bytes: 0, file_count: 0 })
}

/// Directory where MTGA avatar bust images are cached locally on demand.
/// Lives under Tauri's appConfigDir (~/.config/rhystic-tracker/avatars)
/// covered by Tauri assetProtocol scope.
fn avatar_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let avatar_dir = dir.join("avatars");
    std::fs::create_dir_all(&avatar_dir).map_err(|e| e.to_string())?;
    Ok(avatar_dir)
}

fn avatar_filename(avatar_id: &str) -> String {
    let mut s: String = avatar_id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    s.truncate(80);
    format!("{}.png", s)
}

#[tauri::command]
pub fn get_avatar_cache_stats(app: tauri::AppHandle) -> Result<CacheStats, String> {
    let dir = avatar_cache_dir(&app)?;
    let mut total_size = 0u64;
    let mut count = 0usize;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_size += meta.len();
                    count += 1;
                }
            }
        }
    }
    Ok(CacheStats { size_bytes: total_size, file_count: count })
}

#[tauri::command]
pub fn clear_avatar_cache(app: tauri::AppHandle) -> Result<CacheStats, String> {
    let dir = avatar_cache_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(CacheStats { size_bytes: 0, file_count: 0 })
}

#[derive(Serialize)]
pub struct AvatarExtractResult {
    success: bool,
    count: u32,
    message: String,
}

/// Directory where custom background images uploaded by the user are stored.
fn background_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let bg_dir = dir.join("backgrounds");
    std::fs::create_dir_all(&bg_dir).map_err(|e| e.to_string())?;
    Ok(bg_dir)
}

#[tauri::command]
pub fn save_custom_background(app: tauri::AppHandle, filename: String, data: Vec<u8>) -> Result<String, String> {
    let dir = background_cache_dir(&app)?;
    // Sanitize filename to avoid directory traversal
    let safe_name: String = filename.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '_' })
        .collect();
    let safe_name = if safe_name.is_empty() { "background.webp".to_string() } else { safe_name };
    let path = dir.join(&safe_name);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

const EMBEDDED_AVATAR_EXTRACTOR_SCRIPT: &str = include_str!("../../scripts/extract_mtga_avatars.py");

#[tauri::command]
pub async fn extract_avatars_from_mtga_client(app: tauri::AppHandle) -> Result<AvatarExtractResult, String> {
    let out_dir = avatar_cache_dir(&app)?;
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    // Derive active MTGA raw directory or log path
    let raw_dir = crate::card_db::find_latest_raw_card_db()
        .and_then(|f| f.parent().map(|p| p.to_path_buf()));
    let raw_arg = raw_dir.as_ref().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

    let settings = crate::settings::load_settings();
    let log_path = settings.mtga_log_path
        .map(PathBuf::from)
        .or_else(|| crate::tailer::discover_log_path());
    let log_arg = log_path.as_ref().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

    // Try locating extractor script on disk first
    let mut script_candidates = Vec::new();
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            script_candidates.push(parent.join("scripts/extract_mtga_avatars.py"));
            script_candidates.push(parent.join("../../scripts/extract_mtga_avatars.py"));
        }
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        script_candidates.push(res_dir.join("scripts/extract_mtga_avatars.py"));
    }

    // Also check standard app config directory
    if let Ok(cfg_dir) = app.path().app_config_dir() {
        script_candidates.push(cfg_dir.join("scripts/extract_mtga_avatars.py"));
    }

    let script = if let Some(found) = script_candidates.into_iter().find(|p| p.exists()) {
        found
    } else {
        // Materialize the embedded script to app config dir or temp dir
        let target_script_dir = match app.path().app_config_dir() {
            Ok(cfg_dir) => cfg_dir.join("scripts"),
            Err(_) => std::env::temp_dir().join("rhystic-tracker-scripts"),
        };
        let _ = std::fs::create_dir_all(&target_script_dir);
        let embedded_path = target_script_dir.join("extract_mtga_avatars.py");
        std::fs::write(&embedded_path, EMBEDDED_AVATAR_EXTRACTOR_SCRIPT)
            .map_err(|e| format!("Failed to materialize embedded avatar extractor script: {}", e))?;
        embedded_path
    };

    let py_bins = ["/tmp/unity_env/bin/python3", "python3", "python"];
    let mut script_ran = false;
    let mut last_error = String::new();

    for py in &py_bins {
        let output = std::process::Command::new(py)
            .arg(&script)
            .arg(&raw_arg)
            .arg(&out_dir)
            .arg(&log_arg)
            .output();

        match output {
            Ok(out) => {
                script_ran = true;
                if out.status.success() {
                    last_error.clear();
                    break;
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                    let combined = format!("{} {}", stdout.trim(), stderr.trim());
                    last_error = combined.trim().to_string();
                }
            }
            Err(e) => {
                last_error = format!("Failed to launch {}: {}", py, e);
            }
        }
    }

    let count = match std::fs::read_dir(&out_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("png"))
            .count() as u32,
        Err(_) => 0,
    };

    if !script_ran {
        return Ok(AvatarExtractResult {
            success: false,
            count,
            message: "Python 3 is required to extract MTGA avatars. Please ensure python3 with UnityPy and Pillow is installed.".to_string(),
        });
    }

    if count == 0 && !last_error.is_empty() {
        return Ok(AvatarExtractResult {
            success: false,
            count: 0,
            message: format!("Avatar extraction failed: {}", last_error),
        });
    }

    Ok(AvatarExtractResult {
        success: true,
        count,
        message: format!("Successfully synced {} avatars in local storage.", count),
    })
}

#[tauri::command]
pub fn save_avatar_image(app: tauri::AppHandle, avatar_id: String, data: Vec<u8>) -> Result<String, String> {
    let dir = avatar_cache_dir(&app)?;
    let path = dir.join(avatar_filename(&avatar_id));
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn has_avatar_image(app: tauri::AppHandle, avatar_id: String) -> Result<Option<String>, String> {
    let dir = avatar_cache_dir(&app)?;
    let clean = avatar_id.trim();
    if clean.is_empty() {
        let def = dir.join("default_adventurer.png");
        if def.exists() {
            return Ok(Some(def.to_string_lossy().to_string()));
        }
        return Ok(None);
    }

    // Generate candidates
    let mut candidates = vec![avatar_filename(clean)];

    // If Avatar_Basic_Character_SET
    let stripped_prefix = clean
        .strip_prefix("Avatar_Basic_")
        .or_else(|| clean.strip_prefix("Avatar_Portrait_"))
        .or_else(|| clean.strip_prefix("Avatar_Standard_"))
        .or_else(|| clean.strip_prefix("Avatar_"))
        .unwrap_or(clean);

    candidates.push(format!("{}.png", stripped_prefix));

    if let Some((char_name, set_code)) = stripped_prefix.rsplit_once('_') {
        candidates.push(format!("{}_{}.png", set_code, char_name));
        candidates.push(format!("{}.png", char_name));
    }

    for c in &candidates {
        let p = dir.join(c);
        if p.exists() {
            return Ok(Some(p.to_string_lossy().to_string()));
        }
    }

    // Try case-insensitive / substring lookup
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let lower_clean = clean.to_lowercase();
        let lower_stripped = stripped_prefix.to_lowercase();
        let mut best_match: Option<PathBuf> = None;

        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(fname) = path.file_stem().and_then(|s| s.to_str()) {
                let f_lower = fname.to_lowercase();
                if f_lower == lower_clean || f_lower == lower_stripped {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
                if f_lower.contains(&lower_stripped) || lower_stripped.contains(&f_lower) {
                    best_match = Some(path.clone());
                }
            }
        }
        if let Some(p) = best_match {
            return Ok(Some(p.to_string_lossy().to_string()));
        }
    }

    // Guaranteed fallback to default_adventurer if present
    let def = dir.join("default_adventurer.png");
    if def.exists() {
        return Ok(Some(def.to_string_lossy().to_string()));
    }

    Ok(None)
}

#[derive(serde::Serialize)]
pub struct DatabaseStats {
    db_filename: String,
    db_path: String,
    size_bytes: u64,
    match_count: i64,
}

#[tauri::command]
pub async fn get_database_stats() -> Result<DatabaseStats, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let match_count = db.get_match_count().await.unwrap_or(0);
    let db_filename = db.db_filename.clone();

    let env_mode = db::DatabaseManager::resolve_env();
    let is_prod = env_mode.to_lowercase() == "production";
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("rhystic-tracker");
    let actual_path = config_dir.join(if is_prod { "rhystic.db" } else { "rhystic_dev.db" });

    let size_bytes = std::fs::metadata(&actual_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(DatabaseStats {
        db_filename,
        db_path: actual_path.to_string_lossy().to_string(),
        size_bytes,
        match_count,
    })
}

#[derive(serde::Serialize)]
pub struct SetupStatus {
    setup_completed: bool,
    card_count: i64,
    log_path: Option<String>,
    raw_path: Option<String>,
}

#[tauri::command]
pub async fn get_setup_status() -> Result<SetupStatus, String> {
    let settings = settings::load_settings();
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let card_count: i64 = sqlx::query_scalar("SELECT count(*) FROM cards_cache")
        .fetch_one(db.pool())
        .await
        .unwrap_or(0);

    let log_path = settings.mtga_log_path.clone().or_else(|| {
        tailer::discover_log_path().map(|p| p.to_string_lossy().to_string())
    });

    let raw_path = card_db::find_latest_raw_card_db().map(|p| p.to_string_lossy().to_string());

    Ok(SetupStatus {
        setup_completed: settings.setup_completed && card_count > 0,
        card_count,
        log_path,
        raw_path,
    })
}

#[tauri::command]
pub async fn complete_setup() -> Result<(), String> {
    let mut settings = settings::load_settings();
    settings.setup_completed = true;
    settings::save_settings(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_setup_wizard() -> Result<(), String> {
    let mut settings = settings::load_settings();
    settings.setup_completed = false;
    settings::save_settings(&settings).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct SyncCardDbResult {
    success: bool,
    card_count: usize,
    elapsed_ms: u128,
    raw_path: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn sync_card_database() -> Result<SyncCardDbResult, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let raw_path = card_db::find_latest_raw_card_db().map(|p| p.to_string_lossy().to_string());

    match card_db::sync_card_cache(db.pool()).await {
        Ok((count, elapsed_ms)) => {
            clear_universe_cache();
            Ok(SyncCardDbResult {
                success: true,
                card_count: count,
                elapsed_ms,
                raw_path,
                error: None,
            })
        }
        Err(e) => {
            Ok(SyncCardDbResult {
                success: false,
                card_count: 0,
                elapsed_ms: 0,
                raw_path,
                error: Some(e.to_string()),
            })
        }
    }
}

#[tauri::command]
pub async fn get_raw_card_db_status() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM cards_cache")
        .fetch_one(db.pool())
        .await
        .unwrap_or(0);
    let raw_path = card_db::find_latest_raw_card_db().map(|p| p.to_string_lossy().to_string());
    Ok(serde_json::json!({
        "card_count": count,
        "raw_path": raw_path,
    }))
}

#[tauri::command]
pub async fn set_raw_path(path: String) -> Result<String, String> {
    let mut settings = settings::load_settings();
    let trimmed = path.trim().to_string();
    settings.mtga_raw_dir = if trimmed.is_empty() { None } else { Some(trimmed.clone()) };
    settings::save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(trimmed)
}

#[tauri::command]
pub async fn export_database_backup(destination_path: String) -> Result<String, String> {
    let env_mode = db::DatabaseManager::resolve_env();
    let is_prod = env_mode.to_lowercase() == "production";
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("rhystic-tracker");
    let src_path = config_dir.join(if is_prod { "rhystic.db" } else { "rhystic_dev.db" });

    if !src_path.exists() {
        return Err("Source database file does not exist".to_string());
    }

    let dest = std::path::PathBuf::from(&destination_path);
    std::fs::copy(&src_path, &dest).map_err(|e| format!("Failed to copy database: {}", e))?;
    Ok(format!("Database backup successfully created at {:?}", destination_path))
}


/// Sets the window always-on-top state.
#[tauri::command]
pub async fn set_always_on_top(window: tauri::Window, enabled: bool) -> Result<(), String> {
    window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

