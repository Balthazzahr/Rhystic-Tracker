use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use chrono::{DateTime, Utc};
use crate::match_assembler::{MatchRecord, MatchCardRecord, MatchTurnEventRecord};

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
                hero_deck_name TEXT,
                hero_commander_id INTEGER,
                hero_life_end INTEGER,
                opponent_name TEXT,
                opponent_commander_id INTEGER,
                opponent_mulligans INTEGER,
                opponent_life_end INTEGER,
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
            CREATE INDEX IF NOT EXISTS idx_match_turn_events_match_id ON match_turn_events(match_id);
            "#
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool, db_filename })
    }

    pub async fn upsert_match(&self, match_rec: &MatchRecord, cards: &[MatchCardRecord], turn_events: &[MatchTurnEventRecord]) -> Result<(), Box<dyn std::error::Error>> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO matches (
                id, timestamp, date_str, format, result, duration_seconds, turns, going_first,
                hero_deck_name, hero_commander_id, hero_life_end, opponent_name, opponent_commander_id,
                opponent_mulligans, opponent_life_end, raw_payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                result = excluded.result,
                duration_seconds = excluded.duration_seconds,
                turns = excluded.turns,
                hero_life_end = excluded.hero_life_end,
                opponent_life_end = excluded.opponent_life_end
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
        .bind(&match_rec.player_deck_name)
        .bind(match_rec.player_commander_id.map(|c| c as i64))
        .bind(match_rec.player_life_end)
        .bind(&match_rec.opponent_name)
        .bind(match_rec.opponent_commander_id.map(|c| c as i64))
        .bind(match_rec.opponent_mulligans.map(|m| m as i64))
        .bind(match_rec.opponent_life_end)
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
            SELECT id, timestamp, date_str, format, result, duration_seconds, turns, going_first,
                   hero_deck_name, hero_commander_id, hero_life_end, opponent_name, opponent_commander_id,
                   opponent_mulligans, opponent_life_end
            FROM matches
            ORDER BY timestamp DESC
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
                player_deck_name: row.get("hero_deck_name"),
                player_commander_id: row.get::<Option<i64>, _>("hero_commander_id").map(|c| c as u32),
                player_life_end: row.get("hero_life_end"),
                opponent_name: row.get("opponent_name"),
                opponent_commander_id: row.get::<Option<i64>, _>("opponent_commander_id").map(|c| c as u32),
                opponent_mulligans: row.get::<Option<i64>, _>("opponent_mulligans").map(|m| m as u32),
                opponent_life_end: row.get("opponent_life_end"),
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

    #[tokio::test]
    async fn test_db_isolation_defaults_to_dev() {
        std::env::set_var("RHYSTIC_ENV", "development");
        let db = DatabaseManager::init().await.expect("Failed to init DB");
        assert_eq!(db.db_filename, "rhystic_dev.db");
    }

    #[tokio::test]
    async fn test_db_isolation_requires_explicit_production_env() {
        std::env::set_var("RHYSTIC_ENV", "production");
        let db = DatabaseManager::init().await.expect("Failed to init DB");
        assert_eq!(db.db_filename, "rhystic.db");
        std::env::set_var("RHYSTIC_ENV", "development");
    }
}
