use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use chrono::{DateTime, Utc};
use crate::match_assembler::{MatchRecord, MatchCardRecord, MatchTurnEventRecord, MatchImpactfulRecord};

pub struct DatabaseManager {
    pool: Pool<Sqlite>,
    pub db_filename: String,
}

impl DatabaseManager {
    pub fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }
    pub async fn init() -> Result<Self, Box<dyn std::error::Error>> {
        let mut db_dir = dirs::config_dir().ok_or("Could not resolve user config dir")?;
        db_dir.push("rhystic-tracker");
        tokio::fs::create_dir_all(&db_dir).await?;

        let env_mode = std::env::var("RHYSTIC_ENV").unwrap_or_else(|_| "development".to_string());
        
        let db_filename = if env_mode.to_lowercase() == "production" {
            println!("[DB SECURITY] Running in PRODUCTION mode -> Connecting to rhystic.db");
            "rhystic.db".to_string()
        } else {
            println!("[DB SECURITY] Running in DEV mode (Default) -> Connecting to rhystic_dev.db");
            "rhystic_dev.db".to_string()
        };

        let db_path = db_dir.join(&db_filename);
        let conn_str = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&conn_str)
            .await?;

        // Automatically initialize tables if initializing a new dev database
        sqlx::query(
            r#"
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
            "#
        )
        .execute(&pool)
        .await?;

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

    #[tokio::test]
    async fn test_db_isolation_defaults_to_dev() {
        let _guard = env_lock();
        std::env::set_var("RHYSTIC_ENV", "development");
        let db = DatabaseManager::init().await.expect("Failed to init DB");
        assert_eq!(db.db_filename, "rhystic_dev.db");
    }

    #[tokio::test]
    async fn test_db_isolation_requires_explicit_production_env() {
        let _guard = env_lock();
        std::env::set_var("RHYSTIC_ENV", "production");
        let db = DatabaseManager::init().await.expect("Failed to init DB");
        assert_eq!(db.db_filename, "rhystic.db");
        std::env::set_var("RHYSTIC_ENV", "development");
    }
}
