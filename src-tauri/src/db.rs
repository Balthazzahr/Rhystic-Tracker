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
CREATE TABLE IF NOT EXISTS deleted_matches (
    match_id TEXT PRIMARY KEY,
    deleted_at TEXT NOT NULL
);
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
    hero_mulligans INTEGER DEFAULT 0,
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
    max_hit_combat INTEGER NOT NULL DEFAULT 0,
    max_hit_spell INTEGER NOT NULL DEFAULT 0,
    damage_to_player INTEGER NOT NULL DEFAULT 0,
    damage_to_permanents INTEGER NOT NULL DEFAULT 0,
    damage_combat INTEGER NOT NULL DEFAULT 0,
    damage_spell INTEGER NOT NULL DEFAULT 0,
    titles TEXT DEFAULT '[]',
    cards_drawn INTEGER NOT NULL DEFAULT 0,
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
    updated_at TEXT NOT NULL,
    deck_id TEXT
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
CREATE INDEX IF NOT EXISTS idx_match_decks_deck_id ON match_decks(deck_id);
-- Set display metadata (name + release date + icon) fetched from Scryfall. Used
-- by the Collection view for set-name labels, release-date sorting, and the set
-- filter list (icon + name). Refreshed on demand via the Settings "Update Set
-- Lists" button.
CREATE TABLE IF NOT EXISTS sets_metadata (
    set_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    released_at TEXT,
    icon_svg_uri TEXT,
    updated_at TEXT NOT NULL
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
        if env_mode.eq_ignore_ascii_case("development") || env_mode.eq_ignore_ascii_case("dev") || env_mode.eq_ignore_ascii_case("test") {
            println!("[DB SECURITY] Running in DEV mode -> Connecting to rhystic_dev.db");
            "rhystic_dev.db".to_string()
        } else {
            println!("[DB SECURITY] Running in PRODUCTION mode -> Connecting to rhystic.db");
            "rhystic.db".to_string()
        }
    }

    /// Resolves the effective environment mode. Precedence:
    /// 1. `production-env` cargo feature enabled (default for release/bundled
    ///    builds) -> always "production".
    /// 2. If RHYSTIC_ENV is "development", "dev", or "test" -> "development".
    /// 3. Otherwise (including when unset) -> "production".
    pub fn resolve_env() -> String {
        if cfg!(feature = "production-env") {
            return "production".to_string();
        }
        let val = std::env::var("RHYSTIC_ENV").unwrap_or_else(|_| "production".to_string());
        if val.eq_ignore_ascii_case("development") || val.eq_ignore_ascii_case("dev") || val.eq_ignore_ascii_case("test") {
            "development".to_string()
        } else {
            "production".to_string()
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

        let env_mode = Self::resolve_env();

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
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&conn_str)
            .await?;

        // Prevent SQLITE_BUSY "database is locked" during concurrent tailer + UI reads
        let _ = sqlx::query("PRAGMA journal_mode=WAL;").execute(&pool).await;
        let _ = sqlx::query("PRAGMA busy_timeout=5000;").execute(&pool).await;
        let _ = sqlx::query("PRAGMA synchronous=NORMAL;").execute(&pool).await;

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

        // Migration: add hero_mulligans column to matches
        let hero_mul_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('matches') WHERE name = 'hero_mulligans'"
        )
        .fetch_optional(&pool)
        .await?;

        if hero_mul_check.is_none() {
            sqlx::query("ALTER TABLE matches ADD COLUMN hero_mulligans INTEGER DEFAULT 0")
                .execute(&pool)
                .await?;
            println!("[DB MIGRATION] Added hero_mulligans column to matches table");
        }

        // Migration: add deck_id column to deck_lists for MTGA UUID synchronization & auto-renaming
        let deck_id_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('deck_lists') WHERE name = 'deck_id'"
        )
        .fetch_optional(&pool)
        .await?;

        if deck_id_check.is_none() {
            let _ = sqlx::query("ALTER TABLE deck_lists ADD COLUMN deck_id TEXT")
                .execute(&pool)
                .await;
            let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_deck_lists_deck_id ON deck_lists(deck_id)")
                .execute(&pool)
                .await;
            let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_match_decks_deck_id ON match_decks(deck_id)")
                .execute(&pool)
                .await;
            println!("[DB MIGRATION] Added deck_id column and indexes to deck_lists and match_decks");

            // Migration: Backfill deck_lists.deck_id from match_decks
            let _ = sqlx::query(
                r#"
                UPDATE deck_lists
                SET deck_id = (
                    SELECT m.deck_id
                    FROM match_decks m
                    WHERE m.deck_name = deck_lists.deck_name AND m.deck_id IS NOT NULL AND m.deck_id != ''
                    ORDER BY m.submitted_at DESC
                    LIMIT 1
                )
                WHERE deck_id IS NULL;
                "#
            )
            .execute(&pool)
            .await;

            // Auto-merge duplicate deck names sharing the same deck_id (keeping latest name)
            let dupes: Vec<(String, String)> = sqlx::query_as(
                r#"
                SELECT m1.deck_name as old_name, m2.deck_name as new_name
                FROM match_decks m1
                JOIN match_decks m2 ON m1.deck_id = m2.deck_id AND m1.deck_name != m2.deck_name
                WHERE m1.deck_id IS NOT NULL AND m1.deck_id != ''
                  AND m1.submitted_at <= m2.submitted_at
                GROUP BY m1.deck_name, m2.deck_name
                "#
            )
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            for (old_name, new_name) in dupes {
                if old_name != new_name {
                    println!("[DB MIGRATION] Merging historical renamed deck \"{}\" -> \"{}\"", old_name, new_name);
                    let _ = sqlx::query("UPDATE matches SET hero_deck_name = ? WHERE hero_deck_name = ?")
                        .bind(&new_name)
                        .bind(&old_name)
                        .execute(&pool)
                        .await;
                    let _ = sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?")
                        .bind(&old_name)
                        .execute(&pool)
                        .await;
                }
            }
        }

        // Migration: Clean up invalid hero_commander_id on non-Brawl matches
        let _ = sqlx::query(
            r#"
            UPDATE matches 
            SET hero_commander_id = NULL 
            WHERE hero_commander_id IS NOT NULL 
              AND LOWER(format) NOT LIKE '%brawl%' 
              AND LOWER(format) NOT LIKE '%commander%';
            "#
        )
        .execute(&pool)
        .await;

        // Migration: Reconcile historical ranked / ladder format names to clean format titles
        let _ = sqlx::query(
            r#"
            UPDATE matches SET format = 'Standard Ranked' WHERE format IN ('Ladder', 'Traditional Ladder', 'Standard (Ranked)', 'Standard_Ladder', 'Ladder_Play');
            UPDATE matches SET format = 'Historic Ranked' WHERE format IN ('Historic (Ranked)', 'Historic_Ladder');
            UPDATE matches SET format = 'Alchemy Ranked' WHERE format IN ('Alchemy (Ranked)', 'Alchemy_Ladder');
            UPDATE matches SET format = 'Timeless Ranked' WHERE format IN ('Timeless (Ranked)', 'Timeless_Ladder');
            UPDATE matches SET format = 'Explorer Ranked' WHERE format IN ('Explorer (Ranked)', 'Explorer_Ladder');
            UPDATE matches SET format = 'Pioneer Ranked' WHERE format IN ('Pioneer (Ranked)', 'Pioneer_Ladder');
            UPDATE matches SET format = 'Brawl - Standard' WHERE format IN ('Standard Brawl', 'Standard_Brawl', 'Brawl_Standard');
            UPDATE matches SET format = 'Brawl - Competitive' WHERE format IN ('Competitive Brawl', 'Competitive_Brawl', 'Brawl (Ranked)', 'Brawl Ranked', 'Brawl_Ladder');
            "#
        )
        .execute(&pool)
        .await;

        // Migration: add icon_svg_uri column to sets_metadata for databases created
        // before the set-icon feature. CREATE TABLE IF NOT EXISTS won't add columns
        // to an existing table, so the Collection set filter would fail otherwise.
        let set_icon_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('sets_metadata') WHERE name = 'icon_svg_uri'"
        )
        .fetch_optional(&pool)
        .await?;

        if set_icon_check.is_none() {
            sqlx::query("ALTER TABLE sets_metadata ADD COLUMN icon_svg_uri TEXT")
                .execute(&pool)
                .await?;
            println!("[DB MIGRATION] Added icon_svg_uri column to sets_metadata table");
        }

        // Migration: add detailed damage tracking columns to match_impactful_cards
        let imp_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('match_impactful_cards') WHERE name = 'damage_to_player'"
        )
        .fetch_optional(&pool)
        .await?;

        if imp_check.is_none() {
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN damage_to_player INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN damage_to_permanents INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN damage_combat INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN damage_spell INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            println!("[DB MIGRATION] Added damage target and type columns to match_impactful_cards table");
        }

        // Migration: add max_hit_combat and max_hit_spell columns to match_impactful_cards
        let max_hit_combat_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('match_impactful_cards') WHERE name = 'max_hit_combat'"
        )
        .fetch_optional(&pool)
        .await?;

        if max_hit_combat_check.is_none() {
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN max_hit_combat INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN max_hit_spell INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            let _ = sqlx::query("UPDATE match_impactful_cards SET max_hit_combat = max_hit WHERE damage_combat > 0 AND damage_spell = 0").execute(&pool).await;
            let _ = sqlx::query("UPDATE match_impactful_cards SET max_hit_spell = max_hit WHERE damage_spell > 0 AND damage_combat = 0").execute(&pool).await;
            let _ = sqlx::query("UPDATE match_impactful_cards SET max_hit_combat = max_hit WHERE damage_combat > 0 AND max_hit_combat = 0").execute(&pool).await;
            println!("[DB MIGRATION] Added max_hit_combat and max_hit_spell columns to match_impactful_cards table");
        }

        // Migration: add titles column to match_impactful_cards
        let titles_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('match_impactful_cards') WHERE name = 'titles'"
        )
        .fetch_optional(&pool)
        .await?;

        if titles_check.is_none() {
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN titles TEXT DEFAULT '[]'").execute(&pool).await;
            println!("[DB MIGRATION] Added titles column to match_impactful_cards table");
        }

        // Migration: add cards_drawn column to match_impactful_cards
        let cards_drawn_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('match_impactful_cards') WHERE name = 'cards_drawn'"
        )
        .fetch_optional(&pool)
        .await?;

        if cards_drawn_check.is_none() {
            let _ = sqlx::query("ALTER TABLE match_impactful_cards ADD COLUMN cards_drawn INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            println!("[DB MIGRATION] Added cards_drawn column to match_impactful_cards table");
        }

        // Migration: deduplicate any duplicate rows in match_cards, match_turn_events,
        // and match_impactful_cards caused by previous multi-instance or non-idempotent upserts.
        let _ = sqlx::query(
            r#"
            DELETE FROM match_cards
            WHERE id NOT IN (
                SELECT MIN(id) FROM match_cards GROUP BY match_id, grp_id, is_opponent
            );
            "#
        ).execute(&pool).await;

        let _ = sqlx::query(
            r#"
            DELETE FROM match_turn_events
            WHERE id NOT IN (
                SELECT MIN(id) FROM match_turn_events GROUP BY match_id, turn_number, seat_id, event_type, grp_id, timestamp
            );
            "#
        ).execute(&pool).await;

        let _ = sqlx::query(
            r#"
            DELETE FROM match_impactful_cards
            WHERE id NOT IN (
                SELECT MIN(id) FROM match_impactful_cards GROUP BY match_id, grp_id, seat_id
            );
            "#
        ).execute(&pool).await;

        // Migration: purge ability IDs and non-card grp_ids from match_turn_events
        let _ = sqlx::query(
            r#"
            DELETE FROM match_turn_events
            WHERE event_type IN ('play', 'draw')
              AND grp_id > 0
              AND grp_id NOT IN (SELECT grp_id FROM cards_cache);
            "#
        ).execute(&pool).await;

        // Migration: sanitize Scoop Inducer titles so lands and cheap non-bombs (< CMC 5) never retain Scoop Inducer
        if let Ok(rows) = sqlx::query_as::<_, (i64, i64, String, i32)>(
            "SELECT i.id, i.grp_id, i.titles, i.total_damage FROM match_impactful_cards i WHERE i.titles LIKE '%Scoop Inducer%'"
        ).fetch_all(&pool).await {
            for (row_id, grp_id, titles_json, total_dmg) in rows {
                if let Ok(mut titles) = serde_json::from_str::<Vec<String>>(&titles_json) {
                    let card_info = sqlx::query_as::<_, (Option<String>, Option<i64>)>(
                        "SELECT card_type, cmc FROM cards_cache WHERE grp_id = ?"
                    ).bind(grp_id).fetch_optional(&pool).await.unwrap_or(None);

                    let is_invalid = if let Some((card_type, cmc)) = card_info {
                        let type_str = card_type.unwrap_or_default().to_lowercase();
                        type_str.contains("land") || (cmc.unwrap_or(0) < 5 && total_dmg < 5)
                    } else {
                        false
                    };

                    if is_invalid {
                        titles.retain(|t| t != "Scoop Inducer");
                        let new_json = serde_json::to_string(&titles).unwrap_or_else(|_| "[]".to_string());
                        let _ = sqlx::query("UPDATE match_impactful_cards SET titles = ? WHERE id = ?")
                            .bind(new_json)
                            .bind(row_id)
                            .execute(&pool)
                            .await;
                    }
                }
            }
        }

        // Migration: Reset achievements on pre-v1.2.0 matches so achievements & leaderboards begin fresh with v1.2.0
        let _ = sqlx::query(
            "UPDATE match_impactful_cards SET titles = '[]' WHERE match_id IN (SELECT id FROM matches WHERE timestamp < '2026-08-23T06:30:00')"
        ).execute(&pool).await;

        // Migration: Record test match into deleted_matches and purge
        let _ = sqlx::query("INSERT OR IGNORE INTO deleted_matches (match_id, deleted_at) VALUES ('02c2e7d6-40cd-412a-b587-3c0dcf97f5d1', '2026-08-23T06:50:00Z')").execute(&pool).await;
        let _ = sqlx::query("DELETE FROM match_cards WHERE match_id = '02c2e7d6-40cd-412a-b587-3c0dcf97f5d1'").execute(&pool).await;
        let _ = sqlx::query("DELETE FROM match_turn_events WHERE match_id = '02c2e7d6-40cd-412a-b587-3c0dcf97f5d1'").execute(&pool).await;
        let _ = sqlx::query("DELETE FROM match_impactful_cards WHERE match_id = '02c2e7d6-40cd-412a-b587-3c0dcf97f5d1'").execute(&pool).await;
        let _ = sqlx::query("DELETE FROM match_decks WHERE match_id = '02c2e7d6-40cd-412a-b587-3c0dcf97f5d1'").execute(&pool).await;
        let _ = sqlx::query("DELETE FROM matches WHERE id = '02c2e7d6-40cd-412a-b587-3c0dcf97f5d1'").execute(&pool).await;

        // Migration: Purge non-impactful zero-damage and non-titled records from match_impactful_cards
        let _ = sqlx::query("DELETE FROM match_impactful_cards WHERE total_damage = 0 AND (titles IS NULL OR titles = '' OR titles = '[]') AND (cards_drawn = 0 OR cards_drawn IS NULL)").execute(&pool).await;

        // Migration: Reclassify creature fight damage from damage_spell to damage_combat
        let _ = sqlx::query(
            r#"
            UPDATE match_impactful_cards
            SET damage_combat = damage_combat + damage_spell,
                damage_spell = 0
            WHERE grp_id IN (94073, 90681, 66975) AND damage_spell > 0
            "#
        ).execute(&pool).await;

        // Migration: Update existing Scoop Inducer titles to tiered titles
        let _ = sqlx::query(
            "UPDATE match_impactful_cards SET titles = '[\"Scoop Inducer (Gold)\"]' WHERE grp_id = 91719 AND titles = '[\"Scoop Inducer\"]'"
        ).execute(&pool).await;
        let _ = sqlx::query(
            "UPDATE match_impactful_cards SET titles = '[\"Scoop Inducer (Bronze)\"]' WHERE grp_id = 72447 AND titles = '[\"Scoop Inducer\"]'"
        ).execute(&pool).await;

        // Migration: Award Haymaker (Bronze) to cards with 10+ max hit from v1.2.0 epoch
        let _ = sqlx::query(
            r#"
            UPDATE match_impactful_cards
            SET titles = '["Haymaker (Bronze)"]'
            WHERE max_hit >= 10 AND max_hit < 20 
              AND (titles IS NULL OR titles = '' OR titles = '[]')
              AND match_id IN (SELECT id FROM matches WHERE timestamp >= '2026-08-23T06:30:00')
            "#
        ).execute(&pool).await;

        // Migration: Reconcile going_first for matches where turn 1 event seat indicates opponent played first
        let _ = sqlx::query(
            r#"
            UPDATE matches
            SET going_first = 0
            WHERE id IN (
                SELECT m.id
                FROM matches m
                JOIN match_turn_events e ON m.id = e.match_id AND e.turn_number = 1
                WHERE m.hero_seat_id > 0 AND e.seat_id > 0 AND e.seat_id != m.hero_seat_id AND m.going_first = 1
            );
            "#
        ).execute(&pool).await;

        // Migration: Reconcile duration_seconds for historical matches using turn events span
        let _ = sqlx::query(
            r#"
            UPDATE matches
            SET duration_seconds = (
                SELECT CAST(MAX(0, ROUND((JULIANDAY(MAX(e.timestamp)) - JULIANDAY(MIN(e.timestamp))) * 86400)) AS INTEGER)
                FROM match_turn_events e
                WHERE e.match_id = matches.id
            )
            WHERE duration_seconds = 0
              AND id IN (
                  SELECT match_id
                  FROM match_turn_events
                  GROUP BY match_id
                  HAVING COUNT(id) > 1
              );
            "#
        ).execute(&pool).await;

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

        // Migration: automatically resolve any historical matches where hero_deck_name = 'Selected Deck' or empty
        let selected_deck_matches = sqlx::query(
            "SELECT id, hero_commander_id FROM matches WHERE hero_deck_name = 'Selected Deck' OR hero_deck_name IS NULL OR hero_deck_name = ''"
        )
        .fetch_all(&pool)
        .await?;

        if !selected_deck_matches.is_empty() {
            let temp_mgr = Self { pool: pool.clone(), db_filename: db_filename.clone() };
            for m_row in selected_deck_matches {
                let mid: String = m_row.get("id");
                let cmd_id: Option<i64> = m_row.get("hero_commander_id");

                let hero_card_rows = sqlx::query(
                    "SELECT grp_id FROM match_cards WHERE match_id = ? AND is_opponent = 0"
                )
                .bind(&mid)
                .fetch_all(&pool)
                .await?;

                let hero_gids: Vec<i64> = hero_card_rows.iter().map(|r| r.get("grp_id")).collect();
                if let Ok(Some(resolved_name)) = temp_mgr.resolve_deck_for_cards(&hero_gids, cmd_id).await {
                    let preset = crate::deck_legitimacy::preset_deck_reason(&resolved_name).is_some();
                    let reason = crate::deck_legitimacy::preset_deck_reason(&resolved_name);

                    sqlx::query("UPDATE matches SET hero_deck_name = ? WHERE id = ?")
                        .bind(&resolved_name)
                        .bind(&mid)
                        .execute(&pool)
                        .await?;

                    sqlx::query(
                        r#"
                        INSERT INTO match_decks (match_id, deck_name, preset_deck, exclusion_reason, submitted_at)
                        VALUES (?, ?, ?, ?, datetime('now'))
                        ON CONFLICT(match_id) DO UPDATE SET
                            deck_name = excluded.deck_name,
                            preset_deck = excluded.preset_deck,
                            exclusion_reason = excluded.exclusion_reason
                        "#
                    )
                    .bind(&mid)
                    .bind(&resolved_name)
                    .bind(preset)
                    .bind(reason)
                    .execute(&pool)
                    .await?;

                    println!("[DB MIGRATION] Resolved match {} ('Selected Deck') -> '{}'", mid, resolved_name);
                }
            }
        }

        // Backfill draw records from logs additively for any historical matches missing draw stats
        Self::backfill_draw_records_from_logs(&pool).await;

        Ok(Self { pool, db_filename })
    }

    async fn backfill_draw_records_from_logs(pool: &Pool<Sqlite>) {
        let _ = sqlx::query("DELETE FROM match_impactful_cards WHERE grp_id NOT IN (SELECT grp_id FROM cards_cache)").execute(pool).await;

        let log_path = match crate::tailer::discover_log_path() {
            Some(p) => p,
            None => return,
        };

        if !log_path.exists() {
            return;
        }

        let file = match std::fs::File::open(&log_path) {
            Ok(f) => f,
            Err(_) => return,
        };
        let reader = std::io::BufReader::new(file);

        use std::io::BufRead;
        let mut current_match_id: Option<String> = None;
        let mut inst_map: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
        let mut inst_owner: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
        let mut ability_parent: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
        let mut hero_seat: u32 = 1;

        for line in reader.lines().flatten() {
            if line.contains("matchGameRoomStateChangedEvent") || line.contains("Connecting to matchId") {
                if let Some(start) = line.find('{') {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line[start..]) {
                        if let Some(r) = v.get("matchGameRoomStateChangedEvent").and_then(|e| e.get("gameRoomInfo")) {
                            if let Some(mid) = r.get("gameRoomConfig").and_then(|c| c.get("matchId")).and_then(|m| m.as_str()) {
                                current_match_id = Some(mid.to_string());
                                inst_map.clear();
                                inst_owner.clear();
                                ability_parent.clear();
                                if let Ok(Some(hs)) = sqlx::query_scalar::<_, i64>("SELECT hero_seat_id FROM matches WHERE id = ?").bind(mid).fetch_optional(pool).await {
                                    hero_seat = hs as u32;
                                } else {
                                    hero_seat = 1;
                                }
                            }
                        }
                    }
                }
            }

            if line.contains("GREMessageType_GameStateMessage") {
                if let (Some(ref mid), Some(start)) = (&current_match_id, line.find('{')) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line[start..]) {
                        if let Some(msgs) = v.get("greToClientEvent").and_then(|e| e.get("greToClientMessages")).and_then(|m| m.as_array()) {
                            for msg in msgs {
                                if msg.get("type").and_then(|t| t.as_str()) == Some("GREMessageType_GameStateMessage") {
                                    if let Some(gsm) = msg.get("gameStateMessage") {
                                        if let Some(objs) = gsm.get("gameObjects").and_then(|o| o.as_array()) {
                                            for obj in objs {
                                                if let Some(iid) = obj.get("instanceId").and_then(|i| i.as_u64()).map(|i| i as u32) {
                                                    let obj_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                                    let is_ability = obj_type.contains("Ability") || obj_type.contains("Trigger") || obj.get("objectSourceGrpId").is_some();
                                                    let gid = if is_ability {
                                                        obj.get("objectSourceGrpId")
                                                            .or_else(|| obj.get("overlayGrpId"))
                                                            .and_then(|g| g.as_u64())
                                                            .map(|g| g as u32)
                                                    } else {
                                                        obj.get("grpId")
                                                            .or_else(|| obj.get("overlayGrpId"))
                                                            .or_else(|| obj.get("objectSourceGrpId"))
                                                            .and_then(|g| g.as_u64())
                                                            .map(|g| g as u32)
                                                    };
                                                    let owner = obj.get("ownerSeatId")
                                                        .or_else(|| obj.get("controllerSeatId"))
                                                        .and_then(|s| s.as_u64())
                                                        .map(|s| s as u32);
                                                    if let Some(g) = gid {
                                                        inst_map.insert(iid, g);
                                                    }
                                                    if let Some(o) = owner {
                                                        inst_owner.insert(iid, o);
                                                    }
                                                    if let Some(pid) = obj.get("parentId").and_then(|p| p.as_u64()).map(|p| p as u32) {
                                                        ability_parent.insert(iid, pid);
                                                        if let Some(pgid) = inst_map.get(&pid).copied() {
                                                            inst_map.entry(iid).or_insert(pgid);
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        if let Some(anns) = gsm.get("annotations").and_then(|a| a.as_array()) {
                                            for a in anns {
                                                let ann_types = a.get("type").and_then(|t| t.as_array());
                                                let is_ability_link = ann_types.as_ref().map(|arr| arr.iter().any(|s| {
                                                    let st = s.as_str().unwrap_or("");
                                                    st.contains("AbilityInstanceCreated") || st.contains("AbilityInstanceDeleted")
                                                })).unwrap_or(false);

                                                if is_ability_link {
                                                    let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                    if affector_id > 0 {
                                                        if let Some(affected_ids) = a.get("affectedIds").and_then(|arr| arr.as_array()) {
                                                            for aff_id in affected_ids.iter().filter_map(|x| x.as_u64().map(|v| v as u32)) {
                                                                ability_parent.insert(aff_id, affector_id);
                                                            }
                                                        }
                                                    }
                                                }

                                                let is_zone_transfer = ann_types.map(|arr| arr.iter().any(|s| s.as_str() == Some("AnnotationType_ZoneTransfer"))).unwrap_or(false);
                                                if is_zone_transfer {
                                                    let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                                    if affector_id > 0 {
                                                        let is_draw = a.get("details").and_then(|d| d.as_array()).map(|details| {
                                                            details.iter().any(|d| {
                                                                d.get("key").and_then(|k| k.as_str()) == Some("category")
                                                                    && d.get("valueString").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|s| s.as_str()).map(|s| s.eq_ignore_ascii_case("Draw")).unwrap_or(false)
                                                            })
                                                        }).unwrap_or(false);

                                                        if is_draw {
                                                            let affected_count = a.get("affectedIds").and_then(|arr| arr.as_array()).map(|arr| arr.len()).unwrap_or(1).max(1) as i64;
                                                            let mut resolved_grp = inst_map.get(&affector_id).copied();
                                                            if resolved_grp.is_none() {
                                                                if let Some(pid) = ability_parent.get(&affector_id).copied() {
                                                                    resolved_grp = inst_map.get(&pid).copied();
                                                                }
                                                            }

                                                            if let Some(src_grp) = resolved_grp {
                                                                let seat = inst_owner.get(&affector_id)
                                                                    .or_else(|| ability_parent.get(&affector_id).and_then(|pid| inst_owner.get(pid)))
                                                                    .copied()
                                                                    .unwrap_or(hero_seat);
                                                                
                                                                let match_exists: Option<i64> = sqlx::query_scalar("SELECT 1 FROM matches WHERE id = ?")
                                                                    .bind(mid)
                                                                    .fetch_optional(pool)
                                                                    .await
                                                                    .unwrap_or(None);

                                                                if match_exists.is_some() {
                                                                    let existing_id: Option<(i64, i64)> = sqlx::query_as("SELECT id, cards_drawn FROM match_impactful_cards WHERE match_id = ? AND grp_id = ?")
                                                                        .bind(mid)
                                                                        .bind(src_grp as i64)
                                                                        .fetch_optional(pool)
                                                                        .await
                                                                        .unwrap_or(None);

                                                                    if let Some((row_id, curr_drawn)) = existing_id {
                                                                        if curr_drawn < affected_count {
                                                                            let _ = sqlx::query("UPDATE match_impactful_cards SET cards_drawn = ?, seat_id = ? WHERE id = ?")
                                                                                .bind(affected_count)
                                                                                .bind(seat as i64)
                                                                                .bind(row_id)
                                                                                .execute(pool)
                                                                                .await;
                                                                        }
                                                                    } else {
                                                                        let _ = sqlx::query(
                                                                            r#"
                                                                            INSERT INTO match_impactful_cards (
                                                                                match_id, grp_id, seat_id, total_damage, max_hit, max_hit_combat, max_hit_spell,
                                                                                damage_to_player, damage_to_permanents, damage_combat, damage_spell, titles, cards_drawn
                                                                            ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, '[]', ?)
                                                                            "#
                                                                        )
                                                                        .bind(mid)
                                                                        .bind(src_grp as i64)
                                                                        .bind(seat as i64)
                                                                        .bind(affected_count)
                                                                        .execute(pool)
                                                                        .await;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
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

    /// Resolves the deck name by fingerprinting hero played card IDs against known decklists in SQLite.
    pub async fn resolve_deck_for_cards(&self, hero_grp_ids: &[i64], commander_id: Option<i64>) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        if hero_grp_ids.is_empty() && commander_id.is_none() {
            return Ok(None);
        }

        // Fetch all deck lists
        let deck_rows = sqlx::query(
            "SELECT deck_name, cards_json, commander_grp_id FROM deck_lists"
        )
        .fetch_all(&self.pool)
        .await?;

        if deck_rows.is_empty() {
            return Ok(None);
        }

        // Fetch all cards cache for name mapping
        let card_rows = sqlx::query(
            "SELECT grp_id, name, card_type FROM cards_cache"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut card_map: std::collections::HashMap<i64, (String, String)> = std::collections::HashMap::new();
        for r in &card_rows {
            let gid: i64 = r.get("grp_id");
            let name: String = r.get("name");
            let ctype: Option<String> = r.get("card_type");
            card_map.insert(gid, (name, ctype.unwrap_or_default()));
        }

        let basic_lands: std::collections::HashSet<&str> = [
            "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
            "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
            "Snow-Covered Mountain", "Snow-Covered Forest",
        ].into_iter().collect();

        // 1. Check commander match first
        if let Some(cmd_id) = commander_id {
            if cmd_id > 0 {
                let cmd_name = card_map.get(&cmd_id).map(|(n, _)| n.as_str());
                for r in &deck_rows {
                    let dname: String = r.get("deck_name");
                    let d_cmd_id: Option<i64> = r.get("commander_grp_id");
                    if d_cmd_id == Some(cmd_id) {
                        return Ok(Some(dname));
                    }
                    if let (Some(cn), Some(d_cid)) = (cmd_name, d_cmd_id) {
                        if let Some((d_cn, _)) = card_map.get(&d_cid) {
                            if d_cn == cn {
                                return Ok(Some(dname));
                            }
                        }
                    }
                }
            }
        }

        // 2. Collect hero non-basic card names
        let mut hero_non_basics = Vec::new();
        for gid in hero_grp_ids {
            if let Some((cname, ctype)) = card_map.get(gid) {
                if !basic_lands.contains(cname.as_str()) && !ctype.contains("Basic Land") {
                    hero_non_basics.push(cname.as_str());
                }
            }
        }

        if hero_non_basics.is_empty() {
            return Ok(None);
        }

        let mut best_deck = None;
        let mut best_score = i32::MIN;

        for r in &deck_rows {
            let dname: String = r.get("deck_name");
            let cards_json: String = r.get("cards_json");

            let mut deck_card_names = std::collections::HashSet::new();
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cards_json) {
                if let Some(arr) = v.as_array() {
                    for item in arr {
                        let gid_opt = item.get("grp_id").and_then(|g| g.as_i64())
                            .or_else(|| item.as_i64());
                        if let Some(gid) = gid_opt {
                            if let Some((name, _)) = card_map.get(&gid) {
                                deck_card_names.insert(name.as_str());
                            }
                        }
                    }
                }
            }

            if deck_card_names.is_empty() {
                continue;
            }

            let mut overlap = 0i32;
            let mut mismatches = 0i32;

            for name in &hero_non_basics {
                if deck_card_names.contains(name) {
                    overlap += 1;
                } else {
                    mismatches += 1;
                }
            }

            if overlap == 0 {
                continue;
            }

            let score = overlap * 3 - mismatches * 10;
            if score > best_score && (mismatches == 0 || overlap >= 4) {
                best_score = score;
                best_deck = Some(dname);
            }
        }

        Ok(best_deck)
    }

    pub async fn upsert_match(&self, match_rec: &MatchRecord, cards: &[MatchCardRecord], turn_events: &[MatchTurnEventRecord], impactful: &[MatchImpactfulRecord]) -> Result<(), Box<dyn std::error::Error>> {
        let is_deleted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM deleted_matches WHERE match_id = ?")
            .bind(&match_rec.match_id)
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        if is_deleted > 0 {
            return Ok(());
        }

        let mut resolved_deck_name = match_rec.player_deck_name.clone();
        if resolved_deck_name.is_empty() || resolved_deck_name == "Selected Deck" {
            let hero_gids: Vec<i64> = cards.iter().filter(|c| !c.is_opponent).map(|c| c.grp_id as i64).collect();
            if let Ok(Some(name)) = self.resolve_deck_for_cards(&hero_gids, match_rec.player_commander_id.map(|c| c as i64)).await {
                resolved_deck_name = name;
            }
        }

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO matches (
                id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_seat_id,
                hero_deck_name, hero_commander_id, hero_life_end, hero_mulligans, opponent_name, opponent_commander_id,
                opponent_mulligans, opponent_life_end, result_reason, raw_payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                result = excluded.result,
                duration_seconds = excluded.duration_seconds,
                turns = excluded.turns,
                hero_deck_name = CASE WHEN excluded.hero_deck_name != 'Selected Deck' THEN excluded.hero_deck_name ELSE matches.hero_deck_name END,
                hero_commander_id = COALESCE(excluded.hero_commander_id, matches.hero_commander_id),
                hero_life_end = excluded.hero_life_end,
                hero_mulligans = excluded.hero_mulligans,
                opponent_mulligans = excluded.opponent_mulligans,
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
        .bind(&resolved_deck_name)
        .bind(match_rec.player_commander_id.map(|c| c as i64))
        .bind(match_rec.player_life_end)
        .bind(match_rec.player_mulligans.map(|m| m as i64))
        .bind(&match_rec.opponent_name)
        .bind(match_rec.opponent_commander_id.map(|c| c as i64))
        .bind(match_rec.opponent_mulligans.map(|m| m as i64))
        .bind(match_rec.opponent_life_end)
        .bind(&match_rec.result_reason)
        .bind("{}")
        .execute(&mut *tx)
        .await?;

        // Purge any prior child records for this match_id so re-upserting (or replaying)
        // is strictly idempotent and does not accumulate duplicate turn events or card rows.
        sqlx::query("DELETE FROM match_cards WHERE match_id = ?")
            .bind(&match_rec.match_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM match_turn_events WHERE match_id = ?")
            .bind(&match_rec.match_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM match_impactful_cards WHERE match_id = ?")
            .bind(&match_rec.match_id)
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

        // Save impactful card records (damage/life swings and achievement titles attributed to specific cards)
        for imp in impactful {
            let titles_json = serde_json::to_string(&imp.titles).unwrap_or_else(|_| "[]".to_string());
            sqlx::query(
                r#"
                INSERT INTO match_impactful_cards (
                    match_id, grp_id, seat_id, total_damage, max_hit, max_hit_combat, max_hit_spell,
                    damage_to_player, damage_to_permanents, damage_combat, damage_spell, titles, cards_drawn
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#
            )
            .bind(&match_rec.match_id)
            .bind(imp.grp_id as i64)
            .bind(imp.seat_id as i64)
            .bind(imp.total_damage as i64)
            .bind(imp.max_hit as i64)
            .bind(imp.max_hit_combat as i64)
            .bind(imp.max_hit_spell as i64)
            .bind(imp.damage_to_player as i64)
            .bind(imp.damage_to_permanents as i64)
            .bind(imp.damage_combat as i64)
            .bind(imp.damage_spell as i64)
            .bind(titles_json)
            .bind(imp.cards_drawn)
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

    pub async fn delete_match(&self, match_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        let _ = sqlx::query("INSERT OR IGNORE INTO deleted_matches (match_id, deleted_at) VALUES (?, ?)")
            .bind(match_id)
            .bind(now)
            .execute(&self.pool)
            .await;

        let mut tx = self.pool.begin().await?;
        let _ = sqlx::query("DELETE FROM match_cards WHERE match_id = ?").bind(match_id).execute(&mut *tx).await;
        let _ = sqlx::query("DELETE FROM match_turn_events WHERE match_id = ?").bind(match_id).execute(&mut *tx).await;
        let _ = sqlx::query("DELETE FROM match_impactful_cards WHERE match_id = ?").bind(match_id).execute(&mut *tx).await;
        let _ = sqlx::query("DELETE FROM match_decks WHERE match_id = ?").bind(match_id).execute(&mut *tx).await;
        let _ = sqlx::query("DELETE FROM matches WHERE id = ?").bind(match_id).execute(&mut *tx).await;
        tx.commit().await?;
        Ok(())
    }

    pub async fn get_recent_matches(&self, limit: i64) -> Result<Vec<MatchRecord>, Box<dyn std::error::Error>> {
        let rows = sqlx::query(
            r#"
            SELECT m.id, m.timestamp, m.date_str, m.format, m.result, m.duration_seconds, m.turns, m.going_first,
                   m.hero_deck_name, m.hero_commander_id, m.hero_life_end, m.hero_mulligans, m.opponent_name, m.opponent_commander_id,
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
                player_mulligans: row.try_get::<Option<i64>, _>("hero_mulligans").ok().flatten().map(|m| m as u32),
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

    /// Automatically save a True Decklist and update collection cards from a submitted deck in a match.
    /// If deck_id is recognized under an older name, renames the deck and migrates past matches.
    /// Skips preset/tutorial decks, empty decks, or "Selected Deck".
    pub async fn save_auto_deck_list(
        &self,
        deck_name: &str,
        deck_id: Option<&str>,
        commander_grp_id: Option<u32>,
        main_deck: &[u32],
    ) -> Result<(), Box<dyn std::error::Error>> {
        let trimmed = deck_name.trim();
        if trimmed.is_empty() || trimmed == "Selected Deck" || main_deck.is_empty() {
            return Ok(());
        }
        if crate::deck_legitimacy::preset_deck_reason(trimmed).is_some() {
            return Ok(());
        }

        // If a deck_id is present, check if this deck was previously stored under a different name
        if let Some(did) = deck_id {
            if !did.is_empty() {
                let existing_from_lists: Option<(String,)> = sqlx::query_as(
                    "SELECT deck_name FROM deck_lists WHERE deck_id = ? AND deck_name != ?"
                )
                .bind(did)
                .bind(trimmed)
                .fetch_optional(&self.pool)
                .await
                .unwrap_or(None);

                let existing_from_matches: Option<(String,)> = if existing_from_lists.is_none() {
                    sqlx::query_as(
                        "SELECT deck_name FROM match_decks WHERE deck_id = ? AND deck_name IS NOT NULL AND deck_name != '' AND deck_name != ? ORDER BY submitted_at DESC LIMIT 1"
                    )
                    .bind(did)
                    .bind(trimmed)
                    .fetch_optional(&self.pool)
                    .await
                    .unwrap_or(None)
                } else {
                    None
                };

                let old_name_opt = existing_from_lists.or(existing_from_matches).map(|(n,)| n);

                if let Some(old_name) = old_name_opt {
                    println!("[DECK RENAMED] Auto-renaming deck from \"{}\" -> \"{}\" (UUID: {}) and migrating matches", old_name, trimmed, did);
                    // Remove old name if a conflict row for trimmed already exists
                    let _ = sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?")
                        .bind(trimmed)
                        .execute(&self.pool)
                        .await;
                    let _ = sqlx::query("UPDATE deck_lists SET deck_name = ?, updated_at = datetime('now') WHERE deck_name = ?")
                        .bind(trimmed)
                        .bind(&old_name)
                        .execute(&self.pool)
                        .await;
                    // Migrate match history and audit records seamlessly
                    let _ = sqlx::query("UPDATE matches SET hero_deck_name = ? WHERE hero_deck_name = ?")
                        .bind(trimmed)
                        .bind(&old_name)
                        .execute(&self.pool)
                        .await;
                    let _ = sqlx::query("UPDATE match_decks SET deck_name = ? WHERE deck_name = ?")
                        .bind(trimmed)
                        .bind(&old_name)
                        .execute(&self.pool)
                        .await;
                }
            }
        }

        use std::collections::BTreeMap;
        let mut card_counts: BTreeMap<i64, i64> = BTreeMap::new();
        for grp in main_deck {
            if *grp > 0 {
                *card_counts.entry(*grp as i64).or_insert(0) += 1;
            }
        }
        // Include commander in the card list if present (e.g. Brawl 99 main + 1 commander = 100 cards)
        if let Some(cmdr) = commander_grp_id {
            if cmdr > 0 {
                card_counts.entry(cmdr as i64).or_insert(1);
            }
        }
        if card_counts.is_empty() {
            return Ok(());
        }

        let cards_vec: Vec<(i64, i64)> = card_counts.into_iter().collect();
        let cards_json = crate::deck_list::cards_to_json(&cards_vec);
        let now = chrono::Utc::now().to_rfc3339();
        let cmdr_id = commander_grp_id.map(|c| c as i64);

        sqlx::query(
            r#"
            INSERT INTO deck_lists (deck_name, cards_json, sideboard_json, commander_grp_id, source, created_at, updated_at, deck_id)
            VALUES (?, ?, '[]', ?, 'auto', ?, ?, ?)
            ON CONFLICT(deck_name) DO UPDATE SET
                cards_json = excluded.cards_json,
                commander_grp_id = COALESCE(excluded.commander_grp_id, deck_lists.commander_grp_id),
                updated_at = excluded.updated_at,
                deck_id = COALESCE(excluded.deck_id, deck_lists.deck_id)
            "#
        )
        .bind(trimmed)
        .bind(&cards_json)
        .bind(cmdr_id)
        .bind(&now)
        .bind(&now)
        .bind(deck_id)
        .execute(&self.pool)
        .await?;

        for (grp_id, count) in &cards_vec {
            let _ = self.upsert_collection_from_decklist(*grp_id, *count).await;
        }

        println!("[AUTO DECKLIST] Saved True Decklist & Collection for \"{}\" ({} unique cards, ID: {:?})", trimmed, cards_vec.len(), deck_id);
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
    fn test_db_isolation_defaults_to_dev_when_specified() {
        // Filename mapping: dev/development/test maps to dev DB name.
        assert_eq!(DatabaseManager::resolve_db_filename("development"), "rhystic_dev.db");
        assert_eq!(DatabaseManager::resolve_db_filename("DEVELOPMENT"), "rhystic_dev.db");
        assert_eq!(DatabaseManager::resolve_db_filename("dev"), "rhystic_dev.db");
        assert_eq!(DatabaseManager::resolve_db_filename("test"), "rhystic_dev.db");
    }

    #[test]
    fn test_db_isolation_production_and_fallback() {
        // Unset, default, or explicit production maps to production DB name.
        assert_eq!(DatabaseManager::resolve_db_filename("production"), "rhystic.db");
        assert_eq!(DatabaseManager::resolve_db_filename("PRODUCTION"), "rhystic.db");
        assert_eq!(DatabaseManager::resolve_db_filename(""), "rhystic.db");
        assert_eq!(DatabaseManager::resolve_db_filename("default"), "rhystic.db");
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

    #[tokio::test]
    async fn test_upsert_match_is_strictly_idempotent() {
        let db = in_memory_db().await;
        let match_rec = MatchRecord {
            match_id: "match-dup-test-1".to_string(),
            timestamp: Utc::now(),
            date_str: "2026-08-19 12:00:00".to_string(),
            format_name: "Brawl".to_string(),
            result: "win".to_string(),
            duration_seconds: 120,
            turns: 5,
            going_first: true,
            hero_seat_id: 1,
            player_deck_name: "Test Deck".to_string(),
            player_commander_id: None,
            player_commander_name: None,
            player_life_end: Some(25),
            player_mulligans: Some(0),
            opponent_name: Some("Opponent".to_string()),
            opponent_commander_id: None,
            opponent_commander_name: None,
            opponent_mulligans: Some(0),
            opponent_life_end: Some(0),
            result_reason: Some("Conceded".to_string()),
        };

        let cards = vec![
            MatchCardRecord { grp_id: 100, is_opponent: false, count: 1 },
            MatchCardRecord { grp_id: 200, is_opponent: true, count: 1 },
        ];
        let turn_events = vec![
            MatchTurnEventRecord { turn_number: 1, seat_id: 1, event_type: "draw".to_string(), grp_id: 100, timestamp: "2026-08-19T12:00:01Z".to_string() },
            MatchTurnEventRecord { turn_number: 1, seat_id: 1, event_type: "play".to_string(), grp_id: 100, timestamp: "2026-08-19T12:00:05Z".to_string() },
        ];
        let impactful = vec![
            MatchImpactfulRecord { grp_id: 100, seat_id: 1, total_damage: 5, max_hit: 5, max_hit_combat: 5, max_hit_spell: 0, damage_to_player: 5, damage_to_permanents: 0, damage_combat: 5, damage_spell: 0, titles: vec![], cards_drawn: 0 },
        ];

        // Call upsert_match once
        db.upsert_match(&match_rec, &cards, &turn_events, &impactful).await.unwrap();

        // Call upsert_match a second time (simulating re-upsert / multi-instance replay)
        db.upsert_match(&match_rec, &cards, &turn_events, &impactful).await.unwrap();

        let card_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM match_cards WHERE match_id = 'match-dup-test-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
        let event_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM match_turn_events WHERE match_id = 'match-dup-test-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
        let imp_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM match_impactful_cards WHERE match_id = 'match-dup-test-1'")
            .fetch_one(db.pool())
            .await
            .unwrap();

        assert_eq!(card_count, 2, "match_cards should have 2 rows, not doubled");
        assert_eq!(event_count, 2, "match_turn_events should have 2 rows, not doubled");
        assert_eq!(imp_count, 1, "match_impactful_cards should have 1 row, not doubled");
    }

    #[tokio::test]
    async fn test_resolve_deck_for_cards() {
        let db = in_memory_db().await;

        // Insert cards into cards_cache
        sqlx::query(
            "INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, rarity, last_updated, card_type) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)"
        )
        .bind(86715).bind("Spellbook Vendor").bind("o1oW").bind(2).bind(2).bind("Creature — Human Peasant")
        .execute(db.pool()).await.unwrap();

        sqlx::query(
            "INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, rarity, last_updated, card_type) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)"
        )
        .bind(97964).bind("Skyward Spider").bind("o2oW").bind(3).bind(1).bind("Creature — Spider")
        .execute(db.pool()).await.unwrap();

        sqlx::query(
            "INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, rarity, last_updated, card_type) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)"
        )
        .bind(83677).bind("Plains").bind("").bind(0).bind(0).bind("Basic Land — Plains")
        .execute(db.pool()).await.unwrap();

        // Insert deck list
        sqlx::query(
            "INSERT INTO deck_lists (deck_name, cards_json, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))"
        )
        .bind("MonoWhite - Auras (Standard)")
        .bind(r#"[{"grp_id": 86715, "count": 4}, {"grp_id": 97964, "count": 4}, {"grp_id": 83677, "count": 20}]"#)
        .execute(db.pool()).await.unwrap();

        let hero_gids = vec![86715, 97964, 83677];
        let resolved = db.resolve_deck_for_cards(&hero_gids, None).await.unwrap();
        assert_eq!(resolved, Some("MonoWhite - Auras (Standard)".to_string()));
    }

    #[tokio::test]
    async fn test_save_auto_deck_list() {
        let db = in_memory_db().await;

        let main_deck = vec![86715, 86715, 86715, 86715, 97964, 83677];
        db.save_auto_deck_list("Custom Test Deck", Some("uuid-deck-1"), Some(86715), &main_deck).await.unwrap();

        let row: Option<(String, Option<i64>, Option<String>)> = sqlx::query_as(
            "SELECT cards_json, commander_grp_id, deck_id FROM deck_lists WHERE deck_name = 'Custom Test Deck'"
        )
        .fetch_optional(db.pool())
        .await
        .unwrap();

        assert!(row.is_some(), "deck_lists should have Custom Test Deck row");
        let (cards_json, cmdr, did) = row.unwrap();
        assert_eq!(cmdr, Some(86715));
        assert_eq!(did, Some("uuid-deck-1".to_string()));
        assert!(cards_json.contains(r#"{"count":4,"grp_id":86715}"#));
        assert!(cards_json.contains(r#"{"count":1,"grp_id":97964}"#));

        // Insert a dummy match with the original name
        let match_rec = MatchRecord {
            match_id: "m-rename-test".to_string(),
            timestamp: Utc::now(),
            date_str: "2026-08-19 12:00:00".to_string(),
            format_name: "Brawl".to_string(),
            result: "win".to_string(),
            duration_seconds: 120,
            turns: 5,
            going_first: true,
            hero_seat_id: 1,
            player_deck_name: "Custom Test Deck".to_string(),
            player_commander_id: None,
            player_commander_name: None,
            player_life_end: Some(25),
            player_mulligans: Some(0),
            opponent_name: Some("Opponent".to_string()),
            opponent_commander_id: None,
            opponent_commander_name: None,
            opponent_mulligans: Some(0),
            opponent_life_end: Some(0),
            result_reason: Some("Conceded".to_string()),
        };
        db.upsert_match(&match_rec, &[], &[], &[]).await.unwrap();

        // Now simulate renaming the deck to "Renamed Test Deck" with the same UUID
        db.save_auto_deck_list("Renamed Test Deck", Some("uuid-deck-1"), Some(86715), &main_deck).await.unwrap();

        // Check that deck_lists row was renamed
        let old_row: Option<(String,)> = sqlx::query_as("SELECT deck_name FROM deck_lists WHERE deck_name = 'Custom Test Deck'")
            .fetch_optional(db.pool()).await.unwrap();
        assert!(old_row.is_none(), "Old deck name should be replaced");

        let new_row: Option<(String, Option<String>)> = sqlx::query_as("SELECT deck_name, deck_id FROM deck_lists WHERE deck_name = 'Renamed Test Deck'")
            .fetch_optional(db.pool()).await.unwrap();
        assert!(new_row.is_some(), "New deck name should exist");
        assert_eq!(new_row.unwrap().1, Some("uuid-deck-1".to_string()));

        // Check that match history was migrated to the new name
        let match_deck: String = sqlx::query_scalar("SELECT hero_deck_name FROM matches WHERE id = 'm-rename-test'")
            .fetch_one(db.pool()).await.unwrap();
        assert_eq!(match_deck, "Renamed Test Deck");

        // Verify collection_cards was also populated
        let owned_86715: i64 = sqlx::query_scalar("SELECT owned_count FROM collection_cards WHERE grp_id = 86715")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(owned_86715, 4);
    }
}


