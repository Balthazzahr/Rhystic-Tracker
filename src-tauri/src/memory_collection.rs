//! Authoritative collection sync, read straight out of the running Arena client
//! by the `rhystic-memread` helper (see src/bin/rhystic-memread).
//!
//! Arena stopped logging the collection in 2021, so everything Player.log gives
//! us is a lower bound (cards seen in draws, decklists, boosters). The client
//! still holds the real `grpId → count` map in memory; the helper reads it the
//! way Untapped.gg does — read-only, nothing injected. Reading another process's
//! memory needs CAP_SYS_PTRACE on most distros, which is why it's a separate,
//! tiny binary the user grants that one capability to, and why the UI walks
//! them through doing so.

use crate::db::DatabaseManager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

pub const HELPER: &str = "rhystic-memread";
const HELPER_TIMEOUT: Duration = Duration::from_secs(20);
/// Long enough for someone to notice and fill in the polkit password prompt.
const ELEVATED_TIMEOUT: Duration = Duration::from_secs(180);
const AUTO_SYNC_INTERVAL: Duration = Duration::from_secs(120);

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Attach {
    Ok,
    Denied,
    Impossible,
    Unsupported,
}

#[derive(Deserialize)]
struct HelperStatus {
    ptrace_scope: Option<u8>,
    mtga_pid: Option<u32>,
    attach: Attach,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Access {
    /// Memory reading is only implemented for Linux.
    Unsupported,
    HelperMissing { searched: Vec<String> },
    NeedsPermission { helper: String, ptrace_scope: Option<u8> },
    /// Yama `ptrace_scope=3`: attaching is disabled for everyone until reboot.
    Blocked { helper: String },
    Ready { helper: String, mtga_running: bool },
}

/// Which set of setup instructions applies; detected so the UI can open on the
/// right one.
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Nixos,
    Steamos,
    Arch,
    Linux,
    Macos,
    Windows,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum SyncReport {
    Synced { at: String, cards: usize },
    Unchanged { at: String, cards: usize },
    Failed { at: String, error: String, detail: String },
}

#[derive(Serialize)]
pub struct MemoryCollectionStatus {
    access: Access,
    platform: Platform,
    /// Whether the one-off "sync as admin" route is on offer.
    can_elevate: bool,
    last_sync: Option<SyncReport>,
}

struct LastSync {
    report: SyncReport,
    /// The snapshot last written, so an unchanged collection doesn't rewrite
    /// ~8k rows every interval.
    written: Option<Vec<(u32, i64)>>,
}

static LAST_SYNC: Mutex<Option<LastSync>> = Mutex::new(None);

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn platform() -> Platform {
    match std::env::consts::OS {
        "macos" => return Platform::Macos,
        "windows" => return Platform::Windows,
        _ => {}
    }
    let os_release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let field = |key: &str| {
        os_release
            .lines()
            .find_map(|l| l.strip_prefix(key)?.strip_prefix('='))
            .map(|v| v.trim_matches('"').to_string())
            .unwrap_or_default()
    };
    let id = field("ID");
    let id_like = field("ID_LIKE");
    match id.as_str() {
        "nixos" => Platform::Nixos,
        "steamos" => Platform::Steamos,
        _ if id == "arch" || id_like.split(' ').any(|l| l == "arch") => Platform::Arch,
        _ => Platform::Linux,
    }
}

/// Places a helper can live, most-privileged first: a NixOS
/// `security.wrappers` entry, then wherever packaging or the user put it,
/// then next to our own binary (where the release tarball ships it, without
/// the capability).
fn candidates() -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/run/wrappers/bin"), PathBuf::from("/usr/local/bin"), PathBuf::from("/usr/bin")];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/bin"));
    }
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    if let Some(own) = std::env::current_exe().ok().and_then(|e| e.parent().map(PathBuf::from)) {
        dirs.push(own);
    }
    let mut seen = std::collections::HashSet::new();
    dirs.into_iter()
        .map(|d| d.join(HELPER))
        .filter(|p| seen.insert(p.clone()))
        .collect()
}

/// How the helper gets its permission to read Arena's memory.
#[derive(Clone, Copy)]
enum Run {
    /// It already has it (capability, NixOS wrapper, or permissive Yama).
    Direct,
    /// One-off run as root through polkit, for people who'd rather type a
    /// password per sync than grant a standing capability.
    Elevated,
}

async fn run_helper(helper: &PathBuf, arg: &str, run: Run) -> Result<Vec<u8>, (String, String)> {
    let (mut cmd, timeout) = match run {
        Run::Direct => (tokio::process::Command::new(helper), HELPER_TIMEOUT),
        Run::Elevated => {
            let mut c = tokio::process::Command::new("pkexec");
            c.arg(helper);
            (c, ELEVATED_TIMEOUT)
        }
    };
    let output = tokio::time::timeout(timeout, cmd.arg(arg).kill_on_drop(true).output())
        .await
        .map_err(|_| ("helper_failed".to_string(), format!("{} {arg} timed out", helper.display())))?
        .map_err(|e| match run {
            Run::Elevated if e.kind() == std::io::ErrorKind::NotFound => {
                ("no_pkexec".to_string(), "pkexec (polkit) is not installed".to_string())
            }
            _ => ("helper_failed".to_string(), format!("{}: {e}", helper.display())),
        })?;
    // pkexec's own exit codes: 126 = the prompt was dismissed, 127 = not
    // authorised or pkexec itself failed. The helper never exits with either.
    if let Run::Elevated = run {
        match output.status.code() {
            Some(126) => return Err(("elevation_cancelled".to_string(), "the password prompt was dismissed".to_string())),
            Some(127) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(("elevation_failed".to_string(), stderr));
            }
            _ => {}
        }
    }
    Ok(output.stdout)
}

fn pkexec_available() -> bool {
    std::env::var_os("PATH")
        .is_some_and(|path| std::env::split_paths(&path).any(|d| d.join("pkexec").is_file()))
}

pub async fn access() -> Access {
    if std::env::consts::OS != "linux" {
        return Access::Unsupported;
    }
    let candidates = candidates();
    let mut found: Vec<(PathBuf, HelperStatus)> = Vec::new();
    for path in candidates.iter().filter(|p| p.is_file()) {
        let Ok(stdout) = run_helper(path, "status", Run::Direct).await else { continue };
        let Ok(status) = serde_json::from_slice::<HelperStatus>(&stdout) else { continue };
        if matches!(status.attach, Attach::Ok) {
            return Access::Ready {
                helper: path.display().to_string(),
                mtga_running: status.mtga_pid.is_some(),
            };
        }
        found.push((path.clone(), status));
    }
    match found.into_iter().next() {
        None => Access::HelperMissing {
            searched: candidates.iter().map(|p| p.display().to_string()).collect(),
        },
        Some((path, status)) => match status.attach {
            Attach::Impossible => Access::Blocked { helper: path.display().to_string() },
            Attach::Unsupported => Access::Unsupported,
            Attach::Ok | Attach::Denied => Access::NeedsPermission {
                helper: path.display().to_string(),
                ptrace_scope: status.ptrace_scope,
            },
        },
    }
}

/// The helper's `collection` output, parsed at the boundary.
fn parse_collection(stdout: &[u8]) -> Result<Vec<(u32, i64)>, (String, String)> {
    #[derive(Deserialize)]
    struct Raw {
        ok: bool,
        cards: Option<HashMap<String, i64>>,
        error: Option<String>,
        detail: Option<String>,
    }
    let raw: Raw = serde_json::from_slice(stdout)
        .map_err(|e| ("bad_output".to_string(), format!("helper output was not valid JSON: {e}")))?;
    match (raw.ok, raw.cards) {
        (true, Some(cards)) => {
            let mut parsed = cards
                .into_iter()
                .map(|(grp, n)| grp.parse::<u32>().map(|g| (g, n)))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| ("bad_output".to_string(), format!("non-numeric grpId: {e}")))?;
            parsed.sort_unstable();
            Ok(parsed)
        }
        _ => Err((
            raw.error.unwrap_or_else(|| "bad_output".to_string()),
            raw.detail.unwrap_or_default(),
        )),
    }
}

pub async fn sync(db: &DatabaseManager) -> SyncReport {
    match access().await {
        Access::Ready { helper, .. } => sync_with(db, PathBuf::from(helper), Run::Direct).await,
        other => SyncReport::Failed {
            at: now(),
            error: "no_access".to_string(),
            detail: format!("{other:?}"),
        },
    }
}

/// One sync as root via polkit. Works whenever the helper exists, whatever
/// the capability situation — except Yama mode 3, which stops root too.
pub async fn sync_elevated(db: &DatabaseManager) -> SyncReport {
    let helper = match access().await {
        Access::NeedsPermission { helper, .. } | Access::Ready { helper, .. } => helper,
        other => {
            return SyncReport::Failed { at: now(), error: "no_access".to_string(), detail: format!("{other:?}") };
        }
    };
    sync_with(db, PathBuf::from(helper), Run::Elevated).await
}

async fn sync_with(db: &DatabaseManager, helper: PathBuf, run: Run) -> SyncReport {
    let cards = run_helper(&helper, "collection", run).await.and_then(|stdout| parse_collection(&stdout));
    let cards = match cards {
        Ok(c) => c,
        Err((error, detail)) => {
            let report = SyncReport::Failed { at: now(), error, detail };
            remember(report.clone(), None);
            return report;
        }
    };

    let unchanged = LAST_SYNC
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|l| l.written.as_ref())
        .is_some_and(|w| *w == cards);
    if unchanged {
        let report = SyncReport::Unchanged { at: now(), cards: cards.len() };
        remember(report.clone(), Some(cards));
        return report;
    }

    let rows: Vec<(i64, i64)> = cards.iter().map(|&(g, n)| (g as i64, n)).collect();
    let report = match db.replace_collection_from_inventory(&rows).await {
        Ok(()) => {
            crate::commands::clear_universe_cache();
            SyncReport::Synced { at: now(), cards: cards.len() }
        }
        Err(e) => SyncReport::Failed { at: now(), error: "db".to_string(), detail: e.to_string() },
    };
    let written = matches!(report, SyncReport::Synced { .. }).then_some(cards);
    remember(report.clone(), written);
    report
}

fn remember(report: SyncReport, written: Option<Vec<(u32, i64)>>) {
    let mut guard = LAST_SYNC.lock().unwrap();
    // A failed read shouldn't forget what we last wrote, or the next good read
    // of the same collection would rewrite every row for nothing.
    let written = written.or_else(|| guard.take().and_then(|l| l.written));
    *guard = Some(LastSync { report, written });
}

pub async fn status() -> MemoryCollectionStatus {
    MemoryCollectionStatus {
        access: access().await,
        platform: platform(),
        can_elevate: std::env::consts::OS == "linux" && pkexec_available(),
        last_sync: LAST_SYNC.lock().unwrap().as_ref().map(|l| l.report.clone()),
    }
}

/// Keeps the collection current while Arena runs. Quietly does nothing when
/// the helper is missing or lacks permission — the Settings panel is where
/// that gets surfaced, not a log line every two minutes.
pub async fn auto_sync_loop(app: tauri::AppHandle) {
    use tauri::Emitter;
    if std::env::consts::OS != "linux" {
        return;
    }
    loop {
        tokio::time::sleep(AUTO_SYNC_INTERVAL).await;
        let Access::Ready { helper, mtga_running: true } = access().await else { continue };
        let Ok(db) = DatabaseManager::init().await else { continue };
        if let report @ SyncReport::Synced { .. } = sync_with(&db, PathBuf::from(helper), Run::Direct).await {
            let _ = app.emit("collection-synced", report);
        }
    }
}

#[tauri::command]
pub async fn get_memory_collection_status() -> MemoryCollectionStatus {
    status().await
}

#[tauri::command]
pub async fn sync_collection_from_memory() -> Result<SyncReport, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    Ok(sync(&db).await)
}

#[tauri::command]
pub async fn sync_collection_elevated() -> Result<SyncReport, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    Ok(sync_elevated(&db).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cards() {
        let out = br#"{"ok":true,"cards":{"77460":1,"19577":4}}"#;
        assert_eq!(parse_collection(out).unwrap(), vec![(19577, 4), (77460, 1)]);
    }

    #[test]
    fn parses_helper_error() {
        let out = br#"{"ok":false,"error":"not_logged_in","detail":"log in first"}"#;
        assert_eq!(
            parse_collection(out).unwrap_err(),
            ("not_logged_in".to_string(), "log in first".to_string())
        );
    }

    #[test]
    fn garbage_is_an_error_not_an_empty_collection() {
        assert!(parse_collection(b"segfault").is_err());
        assert!(parse_collection(br#"{"ok":true}"#).is_err());
    }
}
