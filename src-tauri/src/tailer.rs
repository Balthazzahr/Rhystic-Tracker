use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::sleep;

/// Event emitted by the file tailer
#[derive(Debug, Clone)]
pub enum TailerEvent {
    Line(String),
    Rotated,
}

/// Returns the first MTGA Player.log found from the standard install locations,
/// including Wine/Proton prefixes (Steam compatdata). Returns None if none exist
/// yet (the tailer will wait for the file to appear). Set RHYSTIC_MTGA_LOG to
/// point at a specific file.
pub fn discover_log_path() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("RHYSTIC_MTGA_LOG") {
        if !explicit.is_empty() {
            return Some(PathBuf::from(explicit));
        }
    }

    // macOS layout (Epic Games Store / standalone): Unity writes to
    // ~/Library/Logs/Wizards Of The Coast/MTGA/Player.log
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let p = home.join("Library/Logs/Wizards Of The Coast/MTGA/Player.log");
            if p.exists() {
                return Some(p);
            }
        }
    }
    
    // Candidate Steam library roots (both native layout and mounted libraries).
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/Steam"));
        roots.push(home.join(".steam/steam"));
        roots.push(home.join(".steam/root"));
    }
    // Any mounted Steam library folders (e.g. /mnt/*/SteamLibrary).
    if let Ok(entries) = std::fs::read_dir("/mnt") {
        for entry in entries.flatten() {
            let p = entry.path().join("SteamLibrary");
            if p.join("steamapps").exists() {
                roots.push(p);
            }
        }
    }
    roots.dedup();

    // 1. Native Linux layout: MTGA_Data/Downloads/Player.log
    let native = roots.iter().map(|r| {
        r.join("steamapps/common/MTGA/MTGA_Data/Downloads/Player.log")
    });
    if let Some(p) = native.into_iter().find(|p| p.exists()) {
        return Some(p);
    }

    // 2. Wine/Proton compatdata prefixes:
    //    <root>/steamapps/compatdata/*/pfx/drive_c/users/*/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log
    for root in &roots {
        let compat_dir = root.join("steamapps/compatdata");
        let Ok(appids) = std::fs::read_dir(&compat_dir) else { continue };
        for app in appids.flatten() {
            let users_dir = app.path().join("pfx/drive_c/users");
            let Ok(users) = std::fs::read_dir(&users_dir) else { continue };
            for user in users.flatten() {
                let p = user
                    .path()
                    .join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 3. Standalone Wine (no Steam): default prefix + user profile.
    if let Some(home) = dirs::home_dir() {
        let p = home.join(
            ".wine/drive_c/users/Public/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log",
        );
        if p.exists() {
            return Some(p);
        }
        // Fall back to the first real user under the default prefix.
        let users_dir = home.join(".wine/drive_c/users");
        if let Ok(users) = std::fs::read_dir(&users_dir) {
            for user in users.flatten() {
                let p = user
                    .path()
                    .join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    None
}

pub struct FileTailer {
    path: PathBuf,
    sender: mpsc::Sender<TailerEvent>,
    running: Arc<AtomicBool>,
    read_from_start: bool,
}

impl FileTailer {
    pub fn new(path: PathBuf, sender: mpsc::Sender<TailerEvent>) -> Self {
        Self {
            path,
            sender,
            running: Arc::new(AtomicBool::new(true)),
            read_from_start: true,
        }
    }

    pub fn new_from_end(path: PathBuf, sender: mpsc::Sender<TailerEvent>) -> Self {
        Self {
            path,
            sender,
            running: Arc::new(AtomicBool::new(true)),
            read_from_start: false,
        }
    }

    pub fn stop_handle(&self) -> Arc<AtomicBool> {
        self.running.clone()
    }

    pub async fn run(self) {
        println!("[TAILER] Starting log tailer for path: {:?}", self.path);

        // Wait for file to exist
        while self.running.load(Ordering::Relaxed) && !self.path.exists() {
            println!("[TAILER] Waiting for file {:?} to exist...", self.path);
            sleep(Duration::from_secs(1)).await;
        }

        let current_file = match File::open(&self.path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[TAILER] Error opening file: {}", e);
                return;
            }
        };

        let current_meta = match current_file.metadata() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[TAILER] Error reading metadata: {}", e);
                return;
            }
        };

        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;

        #[cfg(unix)]
        let mut current_ino = current_meta.ino();

        let mut reader = BufReader::new(current_file);

        if !self.read_from_start {
            // Seek backwards up to 512KB to catch recent pre-match deck submissions (EventSetDeckV3) or Auth packets if launched mid-queue
            let file_len = current_meta.len();
            let lookback = 512 * 1024; // 512KB
            let start_pos = if file_len > lookback {
                file_len - lookback
            } else {
                0
            };
            if let Err(e) = reader.seek(SeekFrom::Start(start_pos)) {
                eprintln!("[TAILER] Error seeking startup lookback: {}", e);
            } else if start_pos > 0 {
                // Discard the first line as it may be a partial line from mid-byte seek
                let mut discard = String::new();
                let _ = reader.read_line(&mut discard);
            }
        } else {
            println!("[TAILER] Reading log from beginning (catching existing game state)...");
        }

        let mut line_buf = String::new();

        while self.running.load(Ordering::Relaxed) {
            // Check for file rotation/recreation or truncation
            if let Ok(new_meta) = std::fs::metadata(&self.path) {
                #[cfg(unix)]
                let new_ino = new_meta.ino();
                let new_len = new_meta.len();

                let rotated = {
                    #[cfg(unix)]
                    { new_ino != current_ino }
                    #[cfg(not(unix))]
                    {
                        let current_pos = reader.stream_position().unwrap_or(0);
                        new_len < current_pos
                    }
                };

                if rotated {
                    println!("[TAILER] Log rotation/truncation detected! Reopening {:?}", self.path);
                    sleep(Duration::from_millis(200)).await;
                    if let Ok(new_file) = File::open(&self.path) {
                        #[cfg(unix)]
                        {
                            current_ino = new_ino;
                        }
                        reader = BufReader::new(new_file);
                        let _ = self.sender.send(TailerEvent::Rotated).await;
                    }
                }
            }

            // Read lines until EOF
            loop {
                line_buf.clear();
                match reader.read_line(&mut line_buf) {
                    Ok(0) => break, // EOF reached, sleep and wait for new data
                    Ok(_) => {
                        let trimmed = line_buf.trim_end_matches(&['\r', '\n'][..]).to_string();
                        if let Err(_) = self.sender.send(TailerEvent::Line(trimmed)).await {
                            return; // Channel closed
                        }
                    }
                    Err(e) => {
                        eprintln!("[TAILER] Read error: {}", e);
                        break;
                    }
                }
            }

            sleep(Duration::from_millis(250)).await;
        }
    }
}
