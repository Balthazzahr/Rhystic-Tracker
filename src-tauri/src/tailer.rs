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
            let p = PathBuf::from(explicit);
            if p.exists() {
                return Some(p);
            }
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
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Some(home) = dirs::home_dir() {
        // Steam standard & Flatpak
        roots.push(home.join(".local/share/Steam"));
        roots.push(home.join(".steam/steam"));
        roots.push(home.join(".steam/root"));
        roots.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"));
        roots.push(home.join(".var/app/com.valvesoftware.Steam/.steam/steam"));

        // Lutris prefixes
        let lutris_bases = [
            home.join("Games/magic-the-gathering-arena"),
            home.join("Games/mtga"),
            home.join("Games/Magic-The-Gathering-Arena"),
            home.join(".local/share/lutris/runners/wine"),
        ];
        for base in lutris_bases {
            if base.exists() {
                // Check direct prefix drive_c/users
                let users_dir = base.join("drive_c/users");
                if let Ok(users) = std::fs::read_dir(&users_dir) {
                    for u in users.flatten() {
                        let p = u.path().join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                        if p.exists() { candidates.push(p); }
                    }
                }
            }
        }

        // Bottles prefixes
        let bottles_dir = home.join(".var/app/com.usebottles.bottles/data/bottles/bottles");
        if let Ok(bottles) = std::fs::read_dir(&bottles_dir) {
            for b in bottles.flatten() {
                let users_dir = b.path().join("drive_c/users");
                if let Ok(users) = std::fs::read_dir(&users_dir) {
                    for u in users.flatten() {
                        let p = u.path().join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                        if p.exists() { candidates.push(p); }
                    }
                }
            }
        }

        // Heroic prefixes
        let heroic_dir = home.join("Games/Heroic/Prefixes");
        if let Ok(prefixes) = std::fs::read_dir(&heroic_dir) {
            for pfx in prefixes.flatten() {
                let users_dir = pfx.path().join("drive_c/users");
                if let Ok(users) = std::fs::read_dir(&users_dir) {
                    for u in users.flatten() {
                        let p = u.path().join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                        if p.exists() { candidates.push(p); }
                    }
                }
            }
        }

        // Wine standard prefix
        let wine_users = home.join(".wine/drive_c/users");
        if let Ok(users) = std::fs::read_dir(&wine_users) {
            for u in users.flatten() {
                let p = u.path().join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                if p.exists() { candidates.push(p); }
            }
        }
    }

    // Mounted disks (/mnt, /media, /run/media/*, /teradrive)
    let scan_mount_roots = ["/mnt", "/media", "/teradrive"];
    for mount_root in scan_mount_roots {
        if let Ok(entries) = std::fs::read_dir(mount_root) {
            for entry in entries.flatten() {
                let p = entry.path().join("SteamLibrary");
                if p.join("steamapps").exists() {
                    roots.push(p);
                }
                let p_direct = entry.path();
                if p_direct.join("steamapps").exists() {
                    roots.push(p_direct);
                }
            }
        }
    }
    if let Ok(users) = std::fs::read_dir("/run/media") {
        for u in users.flatten() {
            if let Ok(drives) = std::fs::read_dir(u.path()) {
                for drive in drives.flatten() {
                    let p = drive.path().join("SteamLibrary");
                    if p.join("steamapps").exists() {
                        roots.push(p);
                    }
                    let p_direct = drive.path();
                    if p_direct.join("steamapps").exists() {
                        roots.push(p_direct);
                    }
                }
            }
        }
    }

    roots.dedup();

    // Check Steam compatdata in all roots
    for root in &roots {
        // Native layout
        let native = root.join("steamapps/common/MTGA/MTGA_Data/Downloads/Player.log");
        if native.exists() { candidates.push(native); }

        let compat_dir = root.join("steamapps/compatdata");
        if let Ok(appids) = std::fs::read_dir(&compat_dir) {
            for app in appids.flatten() {
                let users_dir = app.path().join("pfx/drive_c/users");
                if let Ok(users) = std::fs::read_dir(&users_dir) {
                    for user in users.flatten() {
                        let p = user.path().join("AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
                        if p.exists() { candidates.push(p); }
                    }
                }
            }
        }
    }

    candidates.dedup();

    // Sort by most recently modified timestamp descending so the active game client is preferred
    candidates.sort_by(|a, b| {
        let time_a = std::fs::metadata(a).and_then(|m| m.modified()).ok();
        let time_b = std::fs::metadata(b).and_then(|m| m.modified()).ok();
        time_b.cmp(&time_a)
    });

    candidates.into_iter().next()
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
            // Seek backwards up to 16MB to catch recent pre-match deck submissions (EventSetDeckV3), Auth packets, and active MatchGameRoomStateChangedEvent if launched mid-game
            let file_len = current_meta.len();
            let lookback = 16 * 1024 * 1024; // 16MB
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
