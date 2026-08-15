use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use chrono::{DateTime, Utc};
use crate::match_assembler::{MatchRecord, MatchCardRecord, MatchTurnEventRecord, MatchImpactfulRecord};

pub struct DatabaseManager {
    pool: Pool<Sqlite>,
    pub db_filename: String,
}

/// All CREATE TABLE / CREATE INDEX statements, shared between production init
/// and test-only in-memory databases.
const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    date_str TEXT NOT NULL,
    format TEXT NOT NULL,
    result TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    turns INTEGER NOT NULL,
    going_first BOOLEAN NOT NULL,
    hero_seat_id INTEGER NOT NULL DEFAULT 1,
    hero_deck_name TEXT,
    hero_commander_id INTEGER,
    hero_life_end INTEGER,
    opponent_name TEXT,
    opponent_commander_id INTEGER,
    opponent_mulligans INTEGER,
    opponent_life_end INTEGER,
    result_reason TEXT,
    raw_payload TEXT
);
CREATE TABLE IF NOT EXISTS match_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    grp_id INTEGER NOT NULL,
    is_opponent BOOLEAN NOT NULL,
    count INTEGER NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cards_cache (
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
CREATE TABLE IF NOT EXISTS match_turn_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    grp_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS match_impactful_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    grp_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL,
    total_damage INTEGER NOT NULL DEFAULT 0,
    max_hit INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_match_impactful_cards_match_id ON match_impactful_cards(match_id);
CREATE INDEX IF NOT EXISTS idx_match_turn_events_match_id ON match_turn_events(match_id);
CREATE TABLE IF NOT EXISTS deck_lists (
    deck_name TEXT PRIMARY KEY,
    cards_json TEXT NOT NULL,
    sideboard_json TEXT,
    commander_grp_id INTEGER,
    source TEXT DEFAULT 'export',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- Collection (draw-based, log-only). owned_count is monotonic
-- non-decreasing, hard-capped at 4 (a playset). Only ever raised by
-- draws (=>1) or TrueDeckList uploads (=> listed count, cap 4).
CREATE TABLE IF NOT EXISTS collection_cards (
    grp_id INTEGER PRIMARY KEY,
    owned_count INTEGER NOT NULL DEFAULT 0,
    provenance TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT,
    last_updated_at TEXT,
    draw_seen INTEGER NOT NULL DEFAULT 0
);
-- Audit log of every match's submitted deck, retained indefinitely.
-- Used to detect preset deck types that slip past the exclusion rules.
CREATE TABLE IF NOT EXISTS match_decks (
    match_id TEXT PRIMARY KEY,
    deck_name TEXT,
    deck_id TEXT,
    preset_deck BOOLEAN NOT NULL DEFAULT 0,
    exclusion_reason TEXT,
    submitted_at TEXT,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
"#;

impl DatabaseManager {
    pub fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }

    /// Pure mapping from RHYSTIC_ENV to the DB filename. Kept as a standalone
    /// function (and tested without calling `init()`) so the production-mode
    /// logic is verified without ever opening a production handle in a test.
    fn resolve_db_filename(env_mode: &str) -> String {
        if env_mode.to_lowercase() == "production" {
            println!("[DB SECURITY] Running in PRODUCTION mode -> Connecting to rhystic.db");
            "rhystic.db".to_string()
        } else {
            println!("[DB SECURITY] Running in DEV mode (Default) -> Connecting to rhystic_dev.db");
            "rhystic_dev.db".to_string()
        }
    }
    pub async fn init() -> Result<Self, Box<dyn std::error::Error>> {
        // TEST SAFETY GUARD: Under `cargo test` this code path is the ONLY way a
        // test can obtain a database handle, so it is forced to a hardcoded
        // test-only directory under the system temp dir — never the user's real
        // config dir. This makes it structurally impossible for any test to
        // reach the production `rhystic.db` (or even the dev `rhystic_dev.db`),
        // regardless of RHYSTIC_ENV or dirs::config_dir(). Each call gets a
        // unique subdir so parallel tests never share a DB file.
        let mut db_dir = if cfg!(test) {
            use std::sync::atomic::{AtomicU64, Ordering};
            static COUNTER: AtomicU64 = AtomicU64::new(0);
            let n = COUNTER.fetch_add(1, Ordering::Relaxed);
            std::env::temp_dir().join(format!("rhystic-tracker-test-{}-{}", std::process::id(), n))
        } else {
            dirs::config_dir().ok_or("Could not resolve user config dir")?
                .join("rhystic-tracker")
        };
        tokio::fs::create_dir_all(&db_dir).await?;

        let env_mode = std::env::var("RHYSTIC_ENV").unwrap_or_else(|_| "development".to_string());

        let db_filename = Self::resolve_db_filename(&env_mode);

        #[cfg(test)]
        {
            // Belt-and-suspenders: never let a test resolve to the real config
            // dir, even if a future change bypasses the cfg!(test) branch above.
            let real_config = dirs::config_dir()
                .map(|d| d.join("rhystic-tracker"))
                .unwrap_or_default();
            if db_dir.starts_with(&real_config) {
                panic!(
                    "REFUSED: test build resolved the real production config dir ({:?}). \
                     Tests must never touch the production database.",
                    real_config
                );
            }
        }

        let db_path = db_dir.join(&db_filename);
        let conn_str = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&conn_str)
            .await?;

        // Automatically initialize tables if initializing a new dev database
        sqlx::query(SCHEMA_SQL)
        .execute(&pool)
        .await?;

        // Migration: an abandoned earlier Collection attempt created
        // `collection_cards` with a different schema (grp_id/quantity/last_updated,
        // all quantity=0). Drop it so SCHEMA_SQL recreates the draw-based schema.
        Self::migrate_stale_collection_schema(&pool, &db_dir).await?;

        // Migration: add result_reason column to matches for existing databases created
        // before the win/loss reason capture feature was introduced.
        let col_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('matches') WHERE name = 'result_reason'"
        )
        .fetch_optional(&pool)
        .await?;

        if col_check.is_none() {
            sqlx::query("ALTER TABLE matches ADD COLUMN result_reason TEXT")
                .execute(&pool)
                .await?;
            println!("[DB MIGRATION] Added result_reason column to matches table");
        }

        // Migration: backfill cards_cache.cmc from mana_cost. Early imports stored cmc=0
        // for every card. Recompute using the same parse_mtga_cmc() logic the rest of the
        // app relies on. Truly idempotent: only updates rows where the recomputed cmc
        // differs from the stored value, so genuine 0-cost cards (mana_cost 'o0' -> cmc 0)
        // are skipped on subsequent startups.
        let stale_rows = sqlx::query(
            r#"
            SELECT grp_id, mana_cost
            FROM cards_cache
            WHERE cmc = 0 AND mana_cost IS NOT NULL AND mana_cost != ''
            "#
        )
        .fetch_all(&pool)
        .await?;

        let mut backfilled = 0usize;
        if !stale_rows.is_empty() {
            let mut tx = pool.begin().await?;
            for row in &stale_rows {
                let grp_id: i64 = row.get("grp_id");
                let mana_cost: String = row.get("mana_cost");
                let cmc = crate::card_db::parse_mtga_cmc(&mana_cost);
                if cmc != 0 {
                    sqlx::query("UPDATE cards_cache SET cmc = ? WHERE grp_id = ?")
                        .bind(cmc)
                        .bind(grp_id)
                        .execute(&mut *tx)
                        .await?;
                    backfilled += 1;
                }
            }
            tx.commit().await?;
            if backfilled > 0 {
                println!("[DB MIGRATION] Backfilled cmc for {} cards in cards_cache", backfilled);
            }
        }

        Ok(Self { pool, db_filename })
    }

    /// Migration for the abandoned earlier Collection attempt that created
    /// `collection_cards` with a different schema (grp_id/quantity/last_updated,
    /// all quantity=0). Backs up the whole DB via VACUUM INTO, then drops the
    /// stale table so SCHEMA_SQL recreates the draw-based schema. No-op when the
    /// table already has the current schema.
    async fn migrate_stale_collection_schema(
        pool: &Pool<Sqlite>,
        db_dir: &std::path::Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let old_col: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('collection_cards') WHERE name = 'quantity'"
        )
        .fetch_optional(pool)
        .await?;
        if old_col.is_some() {
            let now = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
            let backup_path = db_dir.join(format!("rhystic.db.pre_collection_migration_{}.bak", now));
            let backup_sql = format!(
                "VACUUM INTO '{}'",
                backup_path.to_string_lossy().replace('\'', "''")
            );
            sqlx::query(&backup_sql).execute(pool).await.map_err(|e| {
                println!("[DB MIGRATION] WARNING: pre-drop backup failed ({e}); proceeding anyway");
                e
            })?;
            if backup_path.exists() {
                println!("[DB MIGRATION] Backed up pre-migration DB to {}", backup_path.display());
            }
            sqlx::query("DROP TABLE collection_cards").execute(pool).await?;
            sqlx::query(SCHEMA_SQL).execute(pool).await?;
            println!("[DB MIGRATION] Recreated collection_cards with draw-based schema (dropped stale table)");
        }
        Ok(())
    }

    pub async fn upsert_match(&self, match_rec: &MatchRecord, cards: &[MatchCardRecord], turn_events: &[MatchTurnEventRecord], impactful: &[MatchImpactfulRecord]) -> Result<(), Box<dyn std::error::Error>> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO matches (
                id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_seat_id,
                hero_deck_name, hero_commander_id, hero_life_end, opponent_name, opponent_commander_id,
                opponent_mulligans, opponent_life_end, result_reason, raw_payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                result = excluded.result,
                duration_seconds = excluded.duration_seconds,
                turns = excluded.turns,
                hero_life_end = excluded.hero_life_end,
                opponent_life_end = excluded.opponent_life_end,
                result_reason = excluded.result_reason
            "#
        )
        .bind(&match_rec.match_id)
        .bind(&match_rec.timestamp)
        .bind(&match_rec.date_str)
        .bind(&match_rec.format_name)
        .bind(&match_rec.result)
        .bind(match_rec.duration_seconds as i64)
        .bind(match_rec.turns as i64)
        .bind(match_rec.going_first)
        .bind(match_rec.hero_seat_id as i64)
        .bind(&match_rec.player_deck_name)
        .bind(match_rec.player_commander_id.map(|c| c as i64))
        .bind(match_rec.player_life_end)
        .bind(&match_rec.opponent_name)
        .bind(match_rec.opponent_commander_id.map(|c| c as i64))
        .bind(match_rec.opponent_mulligans.map(|m| m as i64))
        .bind(match_rec.opponent_life_end)
        .bind(&match_rec.result_reason)
        .bind("{}")
        .execute(&mut *tx)
        .await?;

        // Save cards seen to match_cards table
        for card in cards {
            sqlx::query(
                r#"
                INSERT INTO match_cards (match_id, grp_id, is_opponent, count)
                VALUES (?, ?, ?, ?)
                "#
            )
            .bind(&match_rec.match_id)
            .bind(card.grp_id as i64)
            .bind(card.is_opponent)
            .bind(card.count as i64)
            .execute(&mut *tx)
            .await?;
        }

        // Save turn events to match_turn_events table
        for ev in turn_events {
            sqlx::query(
                r#"
                INSERT INTO match_turn_events (match_id, turn_number, seat_id, event_type, grp_id, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(&match_rec.match_id)
            .bind(ev.turn_number as i64)
            .bind(ev.seat_id as i64)
            .bind(&ev.event_type)
            .bind(ev.grp_id as i64)
            .bind(&ev.timestamp)
            .execute(&mut *tx)
            .await?;
        }

        // Save impactful card records (damage/life swings attributed to specific cards)
        for imp in impactful {
            sqlx::query(
                r#"
                INSERT INTO match_impactful_cards (match_id, grp_id, seat_id, total_damage, max_hit)
                VALUES (?, ?, ?, ?, ?)
                "#
            )
            .bind(&match_rec.match_id)
            .bind(imp.grp_id as i64)
            .bind(imp.seat_id as i64)
            .bind(imp.total_damage as i64)
            .bind(imp.max_hit as i64)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn get_match_count(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM matches")
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("count");
        Ok(count)
    }

    pub async fn get_match_cards_count(&self) -> Result<i64, Box<dyn std::error::Error>> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM match_cards")
            .fetch_one(&self.pool)
            .await?;
        let count: i64 = row.get("count");
        Ok(count)
    }

    pub async fn get_recent_matches(&self, limit: i64) -> Result<Vec<MatchRecord>, Box<dyn std::error::Error>> {
        let rows = sqlx::query(
            r#"
            SELECT m.id, m.timestamp, m.date_str, m.format, m.result, m.duration_seconds, m.turns, m.going_first,
                   m.hero_deck_name, m.hero_commander_id, m.hero_life_end, m.opponent_name, m.opponent_commander_id,
                   m.opponent_mulligans, m.opponent_life_end, m.result_reason,
                   pc.name as hero_commander_name, oc.name as opponent_commander_name
            FROM matches m
            LEFT JOIN cards_cache pc ON m.hero_commander_id = pc.grp_id
            LEFT JOIN cards_cache oc ON m.opponent_commander_id = oc.grp_id
            ORDER BY m.timestamp DESC
            LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let matches = rows.into_iter().map(|row| {
            let timestamp_raw: String = row.get("timestamp");
            let parsed_ts = DateTime::parse_from_rfc3339(&timestamp_raw)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| {
                    chrono::NaiveDateTime::parse_from_str(&timestamp_raw, "%Y-%m-%dT%H:%M:%S")
                        .map(|ndt| DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc))
                        .unwrap_or_else(|_| Utc::now())
                });

            MatchRecord {
                match_id: row.get("id"),
                timestamp: parsed_ts,
                date_str: row.get("date_str"),
                format_name: row.get("format"),
                result: row.get("result"),
                duration_seconds: row.get::<i64, _>("duration_seconds") as u32,
                turns: row.get::<i64, _>("turns") as u32,
                going_first: row.get("going_first"),
                hero_seat_id: row.try_get::<i64, _>("hero_seat_id").unwrap_or(1) as u32,
                player_deck_name: row.get("hero_deck_name"),
                player_commander_id: row.get::<Option<i64>, _>("hero_commander_id").map(|c| c as u32),
                player_commander_name: row.get("hero_commander_name"),
                player_life_end: row.get("hero_life_end"),
                opponent_name: row.get("opponent_name"),
                opponent_commander_id: row.get::<Option<i64>, _>("opponent_commander_id").map(|c| c as u32),
                opponent_commander_name: row.get("opponent_commander_name"),
                opponent_mulligans: row.get::<Option<i64>, _>("opponent_mulligans").map(|m| m as u32),
                opponent_life_end: row.get("opponent_life_end"),
                result_reason: row.try_get("result_reason").ok(),
            }
        }).collect();

        Ok(matches)
    }

    pub async fn get_deck_stats(&self) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                hero_deck_name as deck_name,
                COUNT(*) as total_matches,
                SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
            FROM matches
            WHERE hero_deck_name IS NOT NULL AND hero_deck_name != ''
            GROUP BY hero_deck_name
            ORDER BY total_matches DESC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut stats = Vec::new();
        for row in rows {
            let deck_name: String = row.get("deck_name");
            let total: i64 = row.get("total_matches");
            let wins: i64 = row.get("wins");
            let losses: i64 = row.get("losses");
            let winrate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

            stats.push(serde_json::json!({
                "deck_name": deck_name,
                "total_matches": total,
                "wins": wins,
                "losses": losses,
                "winrate": format!("{:.1}%", winrate),
            }));
        }

        Ok(stats)
    }

    /// Record the deck submitted for a match (audit, retained indefinitely).
    pub async fn upsert_match_deck(
        &self,
        match_id: &str,
        deck_name: Option<&str>,
        deck_id: Option<&str>,
        preset_deck: bool,
        exclusion_reason: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        sqlx::query(
            r#"
            INSERT INTO match_decks (match_id, deck_name, deck_id, preset_deck, exclusion_reason, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                deck_name = excluded.deck_name,
                deck_id = excluded.deck_id,
                preset_deck = excluded.preset_deck,
                exclusion_reason = excluded.exclusion_reason,
                submitted_at = excluded.submitted_at
            "#
        )
        .bind(match_id)
        .bind(deck_name)
        .bind(deck_id)
        .bind(preset_deck)
        .bind(exclusion_reason)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Register a draw of a card in a legitimate match. Sets owned_count to 1 if
    /// it was 0 (monotonic; never decreases), increments draw_seen.
    pub async fn add_collection_draw(&self, grp_id: i64) -> Result<(), Box<dyn std::error::Error>> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO collection_cards (grp_id, owned_count, provenance, first_seen_at, last_updated_at, draw_seen)
            VALUES (?, 1, 'draw', ?, ?, 1)
            ON CONFLICT(grp_id) DO UPDATE SET
                owned_count = MAX(owned_count, 1),
                provenance = CASE WHEN owned_count < 1 THEN 'draw' ELSE provenance END,
                last_updated_at = excluded.last_updated_at,
                draw_seen = draw_seen + 1
            "#
        )
        .bind(grp_id)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// TrueDeckList upload: raise owned_count to max(current, min(listed, 4)).
    /// Monotonic — never decreases. Provenance set to 'decklist' when it raises.
    /// Cards listed with 0 copies are not a collection signal and are skipped.
    pub async fn upsert_collection_from_decklist(
        &self,
        grp_id: i64,
        listed_count: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let now = chrono::Utc::now().to_rfc3339();
        let capped = listed_count.min(4);
        if capped <= 0 {
            return Ok(());
        }
        sqlx::query(
            r#"
            INSERT INTO collection_cards (grp_id, owned_count, provenance, first_seen_at, last_updated_at, draw_seen)
            VALUES (?, ?, 'decklist', ?, ?, 0)
            ON CONFLICT(grp_id) DO UPDATE SET
                owned_count = CASE WHEN owned_count < excluded.owned_count THEN excluded.owned_count ELSE owned_count END,
                provenance = CASE WHEN owned_count < excluded.owned_count THEN 'decklist' ELSE provenance END,
                last_updated_at = excluded.last_updated_at
            "#
        )
        .bind(grp_id)
        .bind(capped)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Manual correction: set owned_count to an explicit value clamped to [0,4].
    /// Separate from the monotonic ingest path (user-initiated only).
    pub async fn set_collection_card_count(
        &self,
        grp_id: i64,
        count: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let now = chrono::Utc::now().to_rfc3339();
        let clamped = count.clamp(0, 4);
        if clamped == 0 {
            sqlx::query("DELETE FROM collection_cards WHERE grp_id = ?")
                .bind(grp_id)
                .execute(&self.pool)
                .await?;
        } else {
            sqlx::query(
                r#"
                INSERT INTO collection_cards (grp_id, owned_count, provenance, first_seen_at, last_updated_at, draw_seen)
                VALUES (?, ?, 'manual', ?, ?, 0)
                ON CONFLICT(grp_id) DO UPDATE SET
                    owned_count = excluded.owned_count,
                    provenance = 'manual',
                    last_updated_at = excluded.last_updated_at
                "#
            )
            .bind(grp_id)
            .bind(clamped)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    /// Whether a card is currently owned (owned_count > 0).
    pub async fn is_card_owned(&self, grp_id: i64) -> Result<bool, Box<dyn std::error::Error>> {
        let row: Option<(i64,)> = sqlx::query_as(
            "SELECT owned_count FROM collection_cards WHERE grp_id = ?",
        )
        .bind(grp_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|(c,)| c > 0).unwrap_or(false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // RHYSTIC_ENV is process-global, so tests that mutate it must not run in
    // parallel. A static lock serializes them to avoid a race.
    static ENV_LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn test_db_isolation_defaults_to_dev() {
        // Filename mapping: unset/unknown env defaults to the dev DB name.
        // Pure check — no production (or real dev) handle is opened.
        assert_eq!(DatabaseManager::resolve_db_filename("development"), "rhystic_dev.db");
        assert_eq!(DatabaseManager::resolve_db_filename("garbage"), "rhystic_dev.db");
    }

    #[test]
    fn test_db_isolation_requires_explicit_production_env() {
        // Tests the pure filename mapping WITHOUT ever opening a production DB
        // handle: a test must never call init() with RHYSTIC_ENV=production
        // against a live path. (The init()-time guard additionally redirects
        // any such call to /tmp, but this test doesn't rely on that.)
        assert_eq!(DatabaseManager::resolve_db_filename("production"), "rhystic.db");
        assert_eq!(DatabaseManager::resolve_db_filename("PRODUCTION"), "rhystic.db");
        assert_eq!(DatabaseManager::resolve_db_filename("development"), "rhystic_dev.db");
        assert_eq!(DatabaseManager::resolve_db_filename(""), "rhystic_dev.db");
    }

    #[tokio::test]
    async fn test_test_build_never_uses_real_config_dir() {
        // The critical regression guard: `DatabaseManager::init()` under cfg(test)
        // must always resolve to a hardcoded temp dir, never the user's real
        // ~/.config/rhystic-tracker — even when RHYSTIC_ENV=production. A future
        // change that breaks this should fail loudly (panic) here.
        let _guard = env_lock();
        let real = dirs::config_dir().map(|d| d.join("rhystic-tracker")).unwrap_or_default();
        assert!(
            !real.starts_with(&std::env::temp_dir()),
            "real config dir must not live under /tmp"
        );

        std::env::set_var("RHYSTIC_ENV", "production");
        let db = DatabaseManager::init().await.expect("Failed to init DB");
        std::env::set_var("RHYSTIC_ENV", "development");

        // The handle reports the production filename, but the underlying DB file
        // must live under the test temp dir, never ~/.config/rhystic-tracker.
        assert_eq!(db.db_filename, "rhystic.db");
        drop(db);

        // Direct proof: init() must have created the DB file under a temp subdir
        // matching this process, and NOT under the real config dir.
        let temp_root = std::env::temp_dir();
        let created_in_temp = std::fs::read_dir(&temp_root)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .any(|e| {
                let name = e.file_name();
                let name = name.to_string_lossy();
                if !name.starts_with(&format!("rhystic-tracker-test-{}", std::process::id())) {
                    return false;
                }
                e.path().join("rhystic.db").exists()
            });
        assert!(
            created_in_temp,
            "test init must create rhystic.db under a temp dir, not ~/.config"
        );

        // Belt-and-suspenders: the real production DB file must not have been
        // modified by this test run.
        let real_file = real.join("rhystic.db");
        let before = std::fs::metadata(&real_file).and_then(|m| m.modified()).ok();
        let _ = DatabaseManager::init().await.expect("Failed to init DB");
        std::env::set_var("RHYSTIC_ENV", "development");
        let after = std::fs::metadata(&real_file).and_then(|m| m.modified()).ok();
        assert_eq!(before, after, "production DB must not be touched by a test init");
    }

    async fn in_memory_db() -> DatabaseManager {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite");
        sqlx::query(SCHEMA_SQL).execute(&pool).await.expect("schema");
        DatabaseManager { pool, db_filename: ":memory:".to_string() }
    }

    #[test]
    fn schema_sql_detects_stale_collection_table() {
        // The abandoned earlier Collection attempt created collection_cards with
        // grp_id/quantity/last_updated. The migration drops it in favour of the
        // draw-based schema. Verify the detection query used by the migration
        // is consistent with SCHEMA_SQL's shape.
        assert!(SCHEMA_SQL.contains("owned_count"), "draw-based schema must define owned_count");
        assert!(SCHEMA_SQL.contains("draw_seen"), "draw-based schema must define draw_seen");
        assert!(!SCHEMA_SQL.contains("quantity INTEGER"), "old schema must not be in SCHEMA_SQL");
    }

    async fn owned_count(db: &DatabaseManager, grp_id: i64) -> i64 {
        let row: Option<(i64,)> = sqlx::query_as("SELECT owned_count FROM collection_cards WHERE grp_id = ?")
            .bind(grp_id)
            .fetch_optional(db.pool())
            .await
            .expect("query");
        row.map(|(c,)| c).unwrap_or(0)
    }

    #[tokio::test]
    async fn test_draw_sets_owned_to_one() {
        let db = in_memory_db().await;
        assert!(!db.is_card_owned(1001).await.unwrap());
        db.add_collection_draw(1001).await.unwrap();
        assert!(db.is_card_owned(1001).await.unwrap());
        assert_eq!(owned_count(&db, 1001).await, 1);
    }

    #[tokio::test]
    async fn test_draw_is_monotonic_and_idempotent() {
        let db = in_memory_db().await;
        db.add_collection_draw(1002).await.unwrap();
        db.add_collection_draw(1002).await.unwrap();
        db.add_collection_draw(1002).await.unwrap();
        assert_eq!(owned_count(&db, 1002).await, 1);
        let row: Option<(i64,)> = sqlx::query_as("SELECT draw_seen FROM collection_cards WHERE grp_id = ?")
            .bind(1002)
            .fetch_optional(db.pool())
            .await
            .unwrap();
        assert_eq!(row.map(|(d,)| d).unwrap_or(0), 3);
    }

    #[tokio::test]
    async fn test_decklist_caps_at_four() {
        let db = in_memory_db().await;
        db.upsert_collection_from_decklist(1003, 8).await.unwrap();
        assert_eq!(owned_count(&db, 1003).await, 4);
        db.upsert_collection_from_decklist(1003, 2).await.unwrap();
        assert_eq!(owned_count(&db, 1003).await, 4);
    }

    #[tokio::test]
    async fn test_decklist_never_decreases_below_draw() {
        let db = in_memory_db().await;
        db.add_collection_draw(1004).await.unwrap();
        db.upsert_collection_from_decklist(1004, 0).await.unwrap();
        assert_eq!(owned_count(&db, 1004).await, 1);
    }

    #[tokio::test]
    async fn test_zero_decklist_creates_no_row_and_draw_sets_owned() {
        let db = in_memory_db().await;
        // A decklist listing 0 copies is not a collection signal: no row created.
        db.upsert_collection_from_decklist(1009, 0).await.unwrap();
        assert!(!db.is_card_owned(1009).await.unwrap());
        assert_eq!(owned_count(&db, 1009).await, 0);
        // A later draw still raises owned_count to 1 (the 0-row case must not
        // block the monotonic draw signal).
        db.add_collection_draw(1009).await.unwrap();
        assert_eq!(owned_count(&db, 1009).await, 1);
        assert!(db.is_card_owned(1009).await.unwrap());
    }

    #[tokio::test]
    async fn test_decklist_raises_above_draw() {
        let db = in_memory_db().await;
        db.add_collection_draw(1005).await.unwrap();
        db.upsert_collection_from_decklist(1005, 3).await.unwrap();
        assert_eq!(owned_count(&db, 1005).await, 3);
    }

    #[tokio::test]
    async fn test_manual_correction_sets_and_clamps() {
        let db = in_memory_db().await;
        db.set_collection_card_count(1006, 2).await.unwrap();
        assert_eq!(owned_count(&db, 1006).await, 2);
        db.set_collection_card_count(1006, 99).await.unwrap();
        assert_eq!(owned_count(&db, 1006).await, 4);
        db.set_collection_card_count(1006, 0).await.unwrap();
        assert_eq!(owned_count(&db, 1006).await, 0);
        assert!(!db.is_card_owned(1006).await.unwrap());
    }

    #[tokio::test]
    async fn test_stale_collection_schema_migrates_with_backup() {
        // Simulate a DB carrying the abandoned earlier collection_cards schema and
        // verify the migration backs it up (VACUUM INTO), drops it, and recreates
        // the draw-based schema — and is a no-op once migrated.
        let dir = std::env::temp_dir().join(format!("rhystic-migtest-{}", std::process::id()));
        tokio::fs::create_dir_all(&dir).await.unwrap();

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&format!("sqlite:{}?mode=rwc", dir.join("t.db").to_string_lossy()))
            .await
            .unwrap();
        // Old abandoned schema (grp_id/quantity/last_updated).
        sqlx::query(
            "CREATE TABLE collection_cards (grp_id INTEGER PRIMARY KEY, quantity INTEGER NOT NULL DEFAULT 0, last_updated DATETIME NOT NULL)"
        )
        .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO collection_cards (grp_id, quantity, last_updated) VALUES (1001, 0, '2026-01-01')")
            .execute(&pool).await.unwrap();

        DatabaseManager::migrate_stale_collection_schema(&pool, &dir).await.unwrap();

        // Backup file created before the drop.
        let backups = std::fs::read_dir(&dir).unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("pre_collection_migration"))
            .count();
        assert!(backups >= 1, "expected a pre-drop backup, found {backups}");

        // Table now has the draw-based schema.
        let has_owned: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('collection_cards') WHERE name = 'owned_count'"
        )
        .fetch_optional(&pool).await.unwrap();
        assert!(has_owned.is_some(), "collection_cards must have owned_count after migration");
        let has_quantity: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('collection_cards') WHERE name = 'quantity'"
        )
        .fetch_optional(&pool).await.unwrap();
        assert!(has_quantity.is_none(), "old quantity column must be gone");

        // Running the migration again is a no-op (idempotent) — no new backup.
        DatabaseManager::migrate_stale_collection_schema(&pool, &dir).await.unwrap();
        let backups_after = std::fs::read_dir(&dir).unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("pre_collection_migration"))
            .count();
        assert_eq!(backups_after, backups, "idempotent: no second backup on re-run");

        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[tokio::test]
    async fn test_match_deck_audit_upsert() {
        let db = in_memory_db().await;
        sqlx::query(
            "INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first) \
             VALUES ('m1', '2026-01-01', '2026-01-01', 'Brawl', 'win', 60, 5, 1)"
        )
        .execute(db.pool())
        .await
        .unwrap();
        db.upsert_match_deck("m1", Some("Dying Lands"), Some("d1"), false, None).await.unwrap();
        db.upsert_match_deck("m1", Some("Dying Lands v2"), Some("d1"), false, None).await.unwrap();
        let row: Option<(String, bool)> = sqlx::query_as(
            "SELECT deck_name, preset_deck FROM match_decks WHERE match_id = 'm1'"
        )
        .fetch_optional(db.pool())
        .await
        .unwrap();
        assert_eq!(row.map(|(n, p)| (n, p)).unwrap(), ("Dying Lands v2".to_string(), false));
    }
}
