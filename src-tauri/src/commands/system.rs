use std::path::{Path, PathBuf};
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

#[derive(serde::Serialize)]
pub struct MemoryStats {
    main_kb: u64,
    webkit_kb: u64,
    network_kb: u64,
    total_kb: u64,
}

fn read_rss_kb(pid: i32) -> Option<u64> {
    let status = std::fs::read_to_string(format!("/proc/{}/status", pid)).ok()?;
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            let kb: u64 = rest.trim().split_whitespace().next()?.parse().ok()?;
            return Some(kb);
        }
    }
    None
}

fn child_rss_with_name(name_substring: &str) -> u64 {
    let self_pid = std::process::id() as i32;
    let Ok(entries) = std::fs::read_dir("/proc") else { return 0 };
    for entry in entries.flatten() {
        let pid_str = entry.file_name().to_string_lossy().to_string();
        let Ok(pid) = pid_str.parse::<i32>() else { continue };
        if pid == self_pid { continue; }
        // Confirm it is a direct child of this process
        let Ok(status) = std::fs::read_to_string(format!("/proc/{}/status", pid)) else { continue };
        let is_child = status.lines().any(|l| l.starts_with("PPid:") && l.trim_end().ends_with(&self_pid.to_string()));
        if !is_child { continue; }
        let Ok(cmdline) = std::fs::read(format!("/proc/{}/cmdline", pid)) else { continue };
        let cmd = String::from_utf8_lossy(&cmdline);
        if cmd.contains(name_substring) {
            return read_rss_kb(pid).unwrap_or(0);
        }
    }
    0
}

/// Read the RSS of the main process and its WebKit child processes (Linux).
/// Dev/test diagnostic only — the frontend gates this behind isTestEnv.
#[tauri::command]
#[cfg(target_os = "linux")]
pub fn get_memory_stats() -> MemoryStats {
    let main_kb = read_rss_kb(std::process::id() as i32).unwrap_or(0);
    let webkit_kb = child_rss_with_name("WebKitWebProcess");
    let network_kb = child_rss_with_name("WebKitNetworkProcess");
    MemoryStats {
        main_kb,
        webkit_kb,
        network_kb,
        total_kb: main_kb + webkit_kb + network_kb,
    }
}

#[tauri::command]
#[cfg(not(target_os = "linux"))]
pub fn get_memory_stats() -> MemoryStats {
    MemoryStats { main_kb: 0, webkit_kb: 0, network_kb: 0, total_kb: 0 }
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

#[derive(Serialize)]
pub struct AvatarSyncStatus {
    new_avatars_available: bool,
    client_detected: bool,
    client_bundle_mtime: u64,
    last_synced_mtime: u64,
    cached_avatar_count: u32,
}

/// Discovers the MTGA Downloads directory containing AssetBundle and ALT folders.
fn find_mtga_downloads_dir() -> Option<PathBuf> {
    // 1. Try from raw card db
    if let Some(raw) = crate::card_db::find_latest_raw_card_db() {
        if let Some(parent) = raw.parent() {
            if parent.file_name().and_then(|s| s.to_str()) == Some("Raw") {
                if let Some(dl) = parent.parent() {
                    if dl.join("AssetBundle").exists() || dl.join("ALT").exists() {
                        return Some(dl.to_path_buf());
                    }
                }
            } else if parent.join("AssetBundle").exists() || parent.join("ALT").exists() {
                return Some(parent.to_path_buf());
            }
        }
    }

    // 2. Try from settings / log path
    let settings = crate::settings::load_settings();
    let log_path = settings.mtga_log_path
        .map(PathBuf::from)
        .or_else(|| crate::tailer::discover_log_path());

    if let Some(lp) = log_path {
        let mut curr = lp.parent();
        for _ in 0..8 {
            if let Some(c) = curr {
                let cand = c.join("MTGA_Data/Downloads");
                if cand.exists() {
                    return Some(cand);
                }
                if c.file_name().and_then(|s| s.to_str()) == Some("drive_c") {
                    for sub in [
                        "Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads",
                        "Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads",
                        "Program Files/MTGA/MTGA_Data/Downloads",
                        "Program Files (x86)/MTGA/MTGA_Data/Downloads",
                        "MTGA/MTGA_Data/Downloads",
                        "Games/MTGA/MTGA_Data/Downloads",
                    ] {
                        let sc = c.join(sub);
                        if sc.exists() {
                            return Some(sc);
                        }
                    }
                }
                curr = c.parent();
            } else {
                break;
            }
        }
    }

    // 3. Scan common paths
    if let Some(home) = dirs::home_dir() {
        let candidates = [
            home.join(".steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            home.join(".steam/root/steamapps/common/MTGA/MTGA_Data/Downloads"),
            home.join(".local/share/Steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            home.join(".var/app/com.valvesoftware.Steam/.steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            home.join("Games/magic-the-gathering-arena/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            home.join("Games/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            home.join("Games/Magic-The-Gathering-Arena/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            home.join(".local/share/lutris/runners/wine/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            home.join(".wine/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            home.join(".wine/drive_c/Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }

    None
}

/// Finds the newest modification time among avatar asset bundles and ALT files.
fn get_latest_client_avatar_mtime(downloads_dir: &Path) -> u64 {
    let mut latest_mtime = 0u64;

    // Check ALT directory
    let alt_dir = downloads_dir.join("ALT");
    if let Ok(entries) = std::fs::read_dir(&alt_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                if name.starts_with("ALT_Avatar_") && name.ends_with(".mtga") {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                                latest_mtime = latest_mtime.max(duration.as_secs());
                            }
                        }
                    }
                }
            }
        }
    }

    // Check AssetBundle directory for BustPayload
    let bundle_dir = downloads_dir.join("AssetBundle");
    if let Ok(entries) = std::fs::read_dir(&bundle_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                if name.starts_with("Bucket_Avatar.BustPayload_") && name.ends_with(".mtga") {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                                latest_mtime = latest_mtime.max(duration.as_secs());
                            }
                        }
                    }
                }
            }
        }
    }

    latest_mtime
}

#[tauri::command]
pub async fn check_new_avatars_status(app: tauri::AppHandle) -> Result<AvatarSyncStatus, String> {
    let out_dir = avatar_cache_dir(&app)?;
    let cached_avatar_count = match std::fs::read_dir(&out_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("png"))
            .count() as u32,
        Err(_) => 0,
    };

    let downloads_opt = find_mtga_downloads_dir();
    let client_detected = downloads_opt.is_some();

    let client_bundle_mtime = if let Some(ref dl) = downloads_opt {
        get_latest_client_avatar_mtime(dl)
    } else {
        0
    };

    let settings = crate::settings::load_settings();
    let last_synced_mtime = settings.last_avatar_sync_bundle_mtime;

    // New avatars are available if:
    // 1. Client has avatar bundles, AND
    // 2. Either cached avatar count is 0 (first sync needed), OR
    //    client bundles have a newer mtime than what was previously synced.
    let new_avatars_available = client_detected
        && client_bundle_mtime > 0
        && (cached_avatar_count == 0 || client_bundle_mtime > last_synced_mtime);

    Ok(AvatarSyncStatus {
        new_avatars_available,
        client_detected,
        client_bundle_mtime,
        last_synced_mtime,
        cached_avatar_count,
    })
}

/// Ensures a working Python environment with UnityPy and Pillow is available.
/// Returns the path to the python binary.
fn resolve_or_bootstrap_python(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. Check dedicated rhystic-tracker data directory venv: ~/.local/share/rhystic-tracker/venv/bin/python3
    let mut candidate_pythons = Vec::new();

    if let Some(data_dir) = dirs::data_dir() {
        candidate_pythons.push(data_dir.join("rhystic-tracker/venv/bin/python3"));
        candidate_pythons.push(data_dir.join("rhystic-tracker/venv/bin/python"));
    }

    // 2. Check app config dir venv
    if let Ok(cfg_dir) = app.path().app_config_dir() {
        candidate_pythons.push(cfg_dir.join("venv/bin/python3"));
        candidate_pythons.push(cfg_dir.join("venv/bin/python"));
    }

    // 3. Check legacy /tmp/unity_env/bin/python3
    candidate_pythons.push(PathBuf::from("/tmp/unity_env/bin/python3"));

    // 4. System pythons
    candidate_pythons.push(PathBuf::from("python3"));
    candidate_pythons.push(PathBuf::from("python"));

    // Check if any existing candidate already has UnityPy and PIL installed
    for py in &candidate_pythons {
        let test_output = std::process::Command::new(py)
            .args(["-c", "import UnityPy, PIL; print('OK')"])
            .output();

        if let Ok(out) = test_output {
            if out.status.success() {
                return Ok(py.clone());
            }
        }
    }

    // If none has UnityPy installed, bootstrap a persistent virtual environment in data_dir
    let venv_dir = dirs::data_dir()
        .map(|d| d.join("rhystic-tracker/venv"))
        .or_else(|| app.path().app_config_dir().ok().map(|d| d.join("venv")))
        .unwrap_or_else(|| std::env::temp_dir().join("rhystic-tracker-venv"));

    let venv_python = if cfg!(windows) {
        venv_dir.join("Scripts/python.exe")
    } else {
        venv_dir.join("bin/python3")
    };

    let venv_pip = if cfg!(windows) {
        venv_dir.join("Scripts/pip.exe")
    } else {
        venv_dir.join("bin/pip")
    };

    // If the venv doesn't exist, create it
    if !venv_python.exists() {
        if let Some(parent) = venv_dir.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let create_status = std::process::Command::new("python3")
            .args(["-m", "venv", &venv_dir.to_string_lossy()])
            .output();

        if let Err(e) = create_status {
            return Err(format!("Failed to create Python virtual environment via python3: {}", e));
        }
    }

    // Install UnityPy and Pillow
    if venv_pip.exists() {
        let install_status = std::process::Command::new(&venv_pip)
            .args(["install", "UnityPy", "Pillow"])
            .output();

        if let Ok(out) = install_status {
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr);
                return Err(format!("pip install UnityPy Pillow failed: {}", err));
            }
        } else if let Err(e) = install_status {
            return Err(format!("Failed to run pip install: {}", e));
        }
    }

    // Verify newly bootstrapped python
    let verify = std::process::Command::new(&venv_python)
        .args(["-c", "import UnityPy, PIL; print('OK')"])
        .output();

    if let Ok(out) = verify {
        if out.status.success() {
            return Ok(venv_python);
        }
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Bootstrapped python failed verification: {}", err));
    }

    Err("Could not configure a valid Python environment with UnityPy and Pillow.".to_string())
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

    let py_bin = match resolve_or_bootstrap_python(&app) {
        Ok(p) => p,
        Err(bootstrap_err) => {
            return Ok(AvatarExtractResult {
                success: false,
                count: 0,
                message: format!("Python environment error: {}. Please ensure Python 3 is installed.", bootstrap_err),
            });
        }
    };

    let output = std::process::Command::new(&py_bin)
        .arg(&script)
        .arg(&raw_arg)
        .arg(&out_dir)
        .arg(&log_arg)
        .output();

    let mut last_error = String::new();
    match output {
        Ok(out) => {
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let combined = format!("{} {}", stdout.trim(), stderr.trim());
                last_error = combined.trim().to_string();
            }
        }
        Err(e) => {
            last_error = format!("Failed to launch {:?}: {}", py_bin, e);
        }
    }

    // Ensure default adventurer / NPE avatar fallback exists in local cache
    let def_avatar = out_dir.join("default_adventurer.png");
    if !def_avatar.exists() {
        // If an NPE image was extracted, copy it over
        let npe_cand = out_dir.join("Avatar_Basic_NPE.png");
        if npe_cand.exists() {
            let _ = std::fs::copy(&npe_cand, &def_avatar);
        }
    }

    let count = match std::fs::read_dir(&out_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("png"))
            .count() as u32,
        Err(_) => 0,
    };

    if count == 0 && !last_error.is_empty() {
        return Ok(AvatarExtractResult {
            success: false,
            count: 0,
            message: format!("Avatar extraction failed: {}", last_error),
        });
    }

    // Update settings with latest synced bundle mtime if MTGA downloads dir is found
    if let Some(dl) = find_mtga_downloads_dir() {
        let latest_mtime = get_latest_client_avatar_mtime(&dl);
        if latest_mtime > 0 {
            let mut updated_settings = crate::settings::load_settings();
            updated_settings.last_avatar_sync_bundle_mtime = latest_mtime;
            let _ = crate::settings::save_settings(&updated_settings);
        }
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

