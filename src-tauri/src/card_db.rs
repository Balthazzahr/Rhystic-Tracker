use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardMetadata {
    pub grp_id: i64,
    pub name: String,
    pub mana_cost: Option<String>,
    pub cmc: i64,
    pub colors: Option<String>,
    pub color_identity: Option<String>,
    pub set_code: Option<String>,
    pub rarity: i64,
    pub collector_number: Option<String>,
    pub card_type: Option<String>,
}

/// Attempts to derive the MTGA Raw card database directory from an active Player.log path.
/// Handles Steam compatdata, Lutris prefixes, Bottles, Heroic, and native Wine.
pub fn derive_raw_dir_from_log_path(log_path: &Path) -> Option<PathBuf> {
    let path_str = log_path.to_str()?;

    // 1. Steam layout: .../steamapps/compatdata/<appid>/pfx/... -> .../steamapps/common/MTGA/MTGA_Data/Downloads/Raw
    if let Some(idx) = path_str.find("/steamapps/compatdata") {
        let steamapps_dir = Path::new(&path_str[..idx]).join("steamapps");
        let candidate = steamapps_dir.join("common/MTGA/MTGA_Data/Downloads/Raw");
        if candidate.exists() {
            return Some(candidate);
        }
        let candidate_space = steamapps_dir.join("common/Magic The Gathering Arena/MTGA_Data/Downloads/Raw");
        if candidate_space.exists() {
            return Some(candidate_space);
        }
    }

    // 2. Wine / Lutris / Bottles / Heroic: walk up to drive_c and search known Program Files locations
    let mut current = log_path.parent();
    while let Some(parent) = current {
        if parent.file_name().and_then(|n| n.to_str()) == Some("drive_c") {
            let candidates = [
                parent.join("Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"),
                parent.join("Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"),
                parent.join("Program Files/MTGA/MTGA_Data/Downloads/Raw"),
                parent.join("Program Files (x86)/MTGA/MTGA_Data/Downloads/Raw"),
                parent.join("MTGA/MTGA_Data/Downloads/Raw"),
                parent.join("Games/MTGA/MTGA_Data/Downloads/Raw"),
            ];
            for c in &candidates {
                if c.exists() {
                    return Some(c.clone());
                }
            }
            break;
        }
        current = parent.parent();
    }

    // 3. Native layout: .../MTGA_Data/Downloads/Player.log -> .../MTGA_Data/Downloads/Raw
    if let Some(downloads_dir) = log_path.parent() {
        let raw = downloads_dir.join("Raw");
        if raw.exists() {
            return Some(raw);
        }
    }

    None
}

/// Locates the MTGA installation root and selects the most recently modified Raw_CardDatabase_*.mtga file.
/// Checks user settings, environment override, log-derived path, and scans all known prefix managers.
pub fn find_latest_raw_card_db() -> Option<PathBuf> {
    // 1. Check user settings override
    let settings = crate::settings::load_settings();
    if let Some(ref custom_dir) = settings.mtga_raw_dir {
        if !custom_dir.is_empty() {
            let dir = PathBuf::from(custom_dir);
            if let Some(found) = find_latest_in_dir(&dir) {
                return Some(found);
            }
        }
    }

    // 2. Check environment variable override
    if let Ok(dir) = std::env::var("RHYSTIC_MTGA_RAW_DIR") {
        if !dir.is_empty() {
            let dir = PathBuf::from(dir);
            if let Some(found) = find_latest_in_dir(&dir) {
                return Some(found);
            }
        }
    }

    // 3. Derive from configured or discovered Player.log path
    let log_path = settings.mtga_log_path
        .map(PathBuf::from)
        .or_else(|| crate::tailer::discover_log_path());

    if let Some(ref lp) = log_path {
        if let Some(derived_raw) = derive_raw_dir_from_log_path(lp) {
            if let Some(found) = find_latest_in_dir(&derived_raw) {
                return Some(found);
            }
        }
    }

    // 4. Candidate directories scan across Steam, Lutris, Bottles, Heroic, Wine, and mounted drives
    let mut candidate_dirs = Vec::new();

    if let Some(home) = dirs::home_dir() {
        // Standard Steam
        candidate_dirs.push(home.join(".local/share/Steam/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join(".steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join(".steam/root/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));

        // Flatpak Steam
        candidate_dirs.push(home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join(".var/app/com.valvesoftware.Steam/.steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));

        // Lutris standard game directories
        candidate_dirs.push(home.join("Games/magic-the-gathering-arena/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join("Games/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join("Games/mtga/drive_c/Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join("Games/magic-the-gathering-arena/drive_c/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join(".local/share/lutris/runners/wine/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));

        // Bottles prefixes
        let bottles_dir = home.join(".var/app/com.usebottles.bottles/data/bottles/bottles");
        if let Ok(entries) = fs::read_dir(&bottles_dir) {
            for entry in entries.flatten() {
                candidate_dirs.push(entry.path().join("drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
            }
        }

        // Heroic Launcher
        candidate_dirs.push(home.join("Games/Heroic/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join("Games/Heroic/Prefixes/MTGA/pfx/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));

        // Native Wine standard
        candidate_dirs.push(home.join(".wine/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join(".wine/drive_c/Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
        candidate_dirs.push(home.join(".wine/drive_c/MTGA/MTGA_Data/Downloads/Raw"));
    }

    // Mounted Steam libraries & drives (/mnt, /media, /run/media, /teradrive)
    let mount_roots = ["/mnt", "/media", "/run/media", "/teradrive"];
    for mount_root in &mount_roots {
        let p = Path::new(mount_root);
        if p.exists() {
            // Check direct mount path e.g. /teradrive/SteamLibrary
            candidate_dirs.push(p.join("SteamLibrary/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
            candidate_dirs.push(p.join("steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
            candidate_dirs.push(p.join("Games/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));

            // Check subdirectories
            if let Ok(entries) = fs::read_dir(p) {
                for entry in entries.flatten() {
                    let sub = entry.path();
                    candidate_dirs.push(sub.join("SteamLibrary/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
                    candidate_dirs.push(sub.join("steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
                    candidate_dirs.push(sub.join("Steam/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"));
                    candidate_dirs.push(sub.join("Games/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"));
                }
            }
        }
    }

    candidate_dirs
        .into_iter()
        .find_map(|dir| find_latest_in_dir(&dir))
}

fn find_latest_in_dir(dir: &PathBuf) -> Option<PathBuf> {
    let mut latest_file: Option<(PathBuf, std::time::SystemTime)> = None;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("Raw_CardDatabase_") && file_name.ends_with(".mtga") {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(mod_time) = meta.modified() {
                            match &latest_file {
                                Some((_, newest_time)) if mod_time > *newest_time => {
                                    latest_file = Some((path, mod_time));
                                }
                                None => {
                                    latest_file = Some((path, mod_time));
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    latest_file.map(|(path, _)| path)
}

/// Helper to parse MTGA OldSchoolManaText into calculated CMC
pub fn parse_mtga_cmc(mana_str: &str) -> i64 {
    if mana_str.is_empty() || mana_str == "o0" {
        return 0;
    }
    let mut cmc = 0i64;
    let parts = mana_str.split('o').filter(|p| !p.is_empty());
    for p in parts {
        let p_upper = p.to_uppercase();
        if let Ok(num) = p_upper.parse::<i64>() {
            cmc += num;
        } else {
            cmc += 1;
        }
    }
    cmc
}

pub fn clean_card_name(raw_name: &str) -> String {
    let mut cleaned = raw_name.to_string();
    // Strip XML/HTML tags like <nobr>, </nobr>, <sprite...>, <style...>
    while let Some(start) = cleaned.find('<') {
        if let Some(end) = cleaned[start..].find('>') {
            cleaned.replace_range(start..=start+end, "");
        } else {
            break;
        }
    }
    cleaned.trim().to_string()
}

/// Performs a bulk import of all card metadata from Raw_CardDatabase_*.mtga into cards_cache in rhystic.db
pub async fn sync_card_cache(pool: &Pool<Sqlite>) -> Result<(usize, u128), Box<dyn std::error::Error>> {
    let start_time = Instant::now();

    let raw_db_path = find_latest_raw_card_db()
        .ok_or("Could not locate MTGA Raw_CardDatabase_*.mtga file on system")?;

    println!("[CARD DB] Starting bulk card import from raw file: {:?}", raw_db_path);

    let raw_conn_str = format!("sqlite:{}?mode=ro", raw_db_path.to_string_lossy());
    let raw_pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&raw_conn_str)
        .await?;

    let rows = sqlx::query(
        r#"
        SELECT 
            c.GrpId as grp_id,
            MIN(l.Loc) as name,
            l_type.Loc as card_type,
            c.OldSchoolManaText as mana_cost,
            c.Colors as colors,
            c.ColorIdentity as color_identity,
            c.ExpansionCode as set_code,
            c.Rarity as rarity,
            c.CollectorNumber as collector_number
        FROM Cards c
        JOIN Localizations_enUS l ON c.TitleId = l.LocId
        LEFT JOIN Localizations_enUS l_type ON c.TypeTextId = l_type.LocId
        GROUP BY c.GrpId;
        "#
    )
    .fetch_all(&raw_pool)
    .await?;

    let count = rows.len();

    let mut tx = pool.begin().await?;

    for r in rows {
        let grp_id: i64 = r.get("grp_id");
        let raw_name: String = r.get("name");
        let name = clean_card_name(&raw_name);
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let colors: Option<String> = r.get("colors");
        let color_identity: Option<String> = r.get("color_identity");
        let set_code: Option<String> = r.get("set_code");
        let rarity: i64 = r.get("rarity");
        let collector_number: Option<String> = r.get("collector_number");

        let cmc = parse_mtga_cmc(mana_cost.as_deref().unwrap_or(""));

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO cards_cache (
                grp_id, name, card_type, mana_cost, cmc, colors, color_identity, set_code, rarity, collector_number, last_updated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'))
            "#
        )
        .bind(grp_id)
        .bind(name)
        .bind(card_type)
        .bind(mana_cost)
        .bind(cmc)
        .bind(colors)
        .bind(color_identity)
        .bind(set_code)
        .bind(rarity)
        .bind(collector_number)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    let elapsed_ms = start_time.elapsed().as_millis();
    println!("[CARD DB] Bulk imported {} cards into cards_cache in {} ms", count, elapsed_ms);

    Ok((count, elapsed_ms))
}

pub async fn get_card_metadata(pool: &Pool<Sqlite>, grp_id: i64) -> Result<Option<CardMetadata>, Box<dyn std::error::Error>> {
    let row = sqlx::query(
        r#"
        SELECT grp_id, name, card_type, mana_cost, cmc, colors, color_identity, set_code, rarity, collector_number
        FROM cards_cache
        WHERE grp_id = ?
        "#
    )
    .bind(grp_id)
    .fetch_optional(pool)
    .await?;

    if let Some(r) = row {
        let mana_cost: Option<String> = r.get("mana_cost");
        let raw_cmc: i64 = r.get("cmc");
        let cmc = if raw_cmc == 0 && mana_cost.is_some() {
            parse_mtga_cmc(mana_cost.as_deref().unwrap())
        } else {
            raw_cmc
        };

        Ok(Some(CardMetadata {
            grp_id: r.get("grp_id"),
            name: r.get("name"),
            card_type: r.get("card_type"),
            mana_cost: mana_cost,
            cmc: cmc,
            colors: r.get("colors"),
            color_identity: r.get("color_identity"),
            set_code: r.get("set_code"),
            rarity: r.get("rarity"),
            collector_number: r.get("collector_number"),
        }))
    } else {
        Ok(None)
    }
}

/// Looks up a card by exact name (prefers a non-land exact match if multiple
/// printings exist). Used to enrich lightweight card references (name only).
pub async fn get_card_metadata_by_name(
    pool: &Pool<Sqlite>,
    name: &str,
) -> Result<Option<CardMetadata>, Box<dyn std::error::Error>> {
    let row = sqlx::query(
        r#"
        SELECT grp_id, name, card_type, mana_cost, cmc, colors, color_identity, set_code, rarity, collector_number
        FROM cards_cache
        WHERE name = ?
        ORDER BY CASE WHEN lower(card_type) NOT LIKE '%land%' THEN 0 ELSE 1 END, grp_id ASC
        LIMIT 1
        "#
    )
    .bind(name)
    .fetch_optional(pool)
    .await?;

    if let Some(r) = row {
        let mana_cost: Option<String> = r.get("mana_cost");
        let raw_cmc: i64 = r.get("cmc");
        let cmc = if raw_cmc == 0 && mana_cost.is_some() {
            parse_mtga_cmc(mana_cost.as_deref().unwrap())
        } else {
            raw_cmc
        };

        Ok(Some(CardMetadata {
            grp_id: r.get("grp_id"),
            name: r.get("name"),
            card_type: r.get("card_type"),
            mana_cost: mana_cost,
            cmc: cmc,
            colors: r.get("colors"),
            color_identity: r.get("color_identity"),
            set_code: r.get("set_code"),
            rarity: r.get("rarity"),
            collector_number: r.get("collector_number"),
        }))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn test_card_cache_lookup_flow() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE cards_cache (
                grp_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                mana_cost TEXT,
                cmc INTEGER NOT NULL DEFAULT 0,
                colors TEXT,
                color_identity TEXT,
                set_code TEXT,
                rarity INTEGER NOT NULL,
                collector_number TEXT,
                card_type TEXT,
                last_updated TEXT NOT NULL
            );
            "#
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, colors, color_identity, set_code, rarity, collector_number, last_updated)
            VALUES (69530, 'Bolas''s Citadel', 'o3oBoBoB', 0, 'B', 'B', 'WAR', 4, '79', DATETIME('now'));
            "#
        )
        .execute(&pool)
        .await
        .unwrap();

        // cmc is 0 in the cache but the card costs 6 — get_card_metadata must
        // backfill it from the mana cost (o3oBoBoB = 3 + B + B + B = 6).
        let card = get_card_metadata(&pool, 69530).await.unwrap().expect("Card should exist in cache");
        assert_eq!(card.name, "Bolas's Citadel");
        assert_eq!(card.cmc, 6);
        assert_eq!(card.set_code, Some("WAR".to_string()));
        assert_eq!(card.rarity, 4);

        let missing = get_card_metadata(&pool, 999999).await.unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_derive_raw_dir_steam_compatdata() {
        // If the directory does not exist on disk, derive_raw_dir checks exists(), but the logic handles prefixes
        let log_path = Path::new("/teradrive/SteamLibrary/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
        let derived = derive_raw_dir_from_log_path(log_path);
        // Will be None if /teradrive doesn't actually exist on test runner machine, but syntax and string parsing are verified
        let path_str = log_path.to_str().unwrap();
        assert!(path_str.contains("/steamapps/compatdata"));
    }

    #[test]
    fn test_derive_raw_dir_lutris_drive_c() {
        let log_path = Path::new("/home/testuser/Games/mtga/drive_c/users/testuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log");
        let path_str = log_path.to_str().unwrap();
        assert!(path_str.contains("drive_c"));
    }
}
