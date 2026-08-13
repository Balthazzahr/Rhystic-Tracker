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
            if let Err(e) = reader.seek(SeekFrom::End(0)) {
                eprintln!("[TAILER] Error seeking to end: {}", e);
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
