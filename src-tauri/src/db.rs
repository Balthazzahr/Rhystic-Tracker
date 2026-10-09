use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use chrono::{DateTime, Utc, Datelike};
use crate::match_assembler::{MatchRecord, MatchCardRecord, MatchTurnEventRecord, MatchImpactfulRecord, PRESET_EVENT_DECK_NAME};
use crate::dashboard::{default_dashboard_layout, validate_layout, DashboardLayoutPayload};
use crate::card_db;
use crate::parser;

#[derive(Clone)]
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
    hero_platform TEXT,
    hero_avatar TEXT,
    opponent_name TEXT,
    opponent_commander_id INTEGER,
    opponent_mulligans INTEGER,
    opponent_life_end INTEGER,
    opponent_platform TEXT,
    opponent_avatar TEXT,
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
CREATE INDEX IF NOT EXISTS idx_match_impactful_cards_hero ON match_impactful_cards(seat_id, grp_id);
CREATE INDEX IF NOT EXISTS idx_match_turn_events_match_id ON match_turn_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_turn_events_seat_type ON match_turn_events(seat_id, event_type, grp_id);
CREATE INDEX IF NOT EXISTS idx_match_cards_match_id ON match_cards(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_timestamp ON matches(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_matches_hero_deck_name ON matches(hero_deck_name);
CREATE INDEX IF NOT EXISTS idx_matches_opponent_name ON matches(opponent_name);
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
CREATE TABLE IF NOT EXISTS deck_art_overrides (
    deck_name TEXT PRIMARY KEY,
    card_name TEXT NOT NULL,
    grp_id INTEGER,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deck_bg_art_overrides (
    deck_name TEXT PRIMARY KEY,
    card_name TEXT NOT NULL,
    grp_id INTEGER,
    updated_at TEXT NOT NULL
);
-- Collection. owned_count is hard-capped at 4 (a playset). From the log alone
-- it is a monotonic lower bound, raised by draws (=>1), TrueDeckList uploads
-- (=> listed count) and boosters. A memory sync (provenance 'inventory', see
-- memory_collection.rs) replaces every row with the client's real counts.
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
-- Configurable dashboard widget grid layout persistence.
CREATE TABLE IF NOT EXISTS dashboard_layouts (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    layout_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- Persistent user preferred card printing selection
CREATE TABLE IF NOT EXISTS card_preferred_prints (
    card_name TEXT PRIMARY KEY,
    set_code TEXT NOT NULL,
    collector_number TEXT NOT NULL,
    grp_id INTEGER,
    updated_at TEXT NOT NULL
);
-- Deck-level achievements earned by decks across match history
CREATE TABLE IF NOT EXISTS deck_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_name TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    achieved_at TEXT NOT NULL,
    match_id TEXT,
    UNIQUE(deck_name, achievement_id, tier)
);
CREATE INDEX IF NOT EXISTS idx_deck_achievements_deck ON deck_achievements(deck_name);
-- Player economy snapshots (Gold, Gems, Vault %, Wildcards, Tokens, Golden Pack)
CREATE TABLE IF NOT EXISTS player_economy_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    gold INTEGER NOT NULL,
    gems INTEGER NOT NULL,
    vault_progress_tenths INTEGER NOT NULL,
    wc_track_pos INTEGER NOT NULL,
    wc_common INTEGER NOT NULL,
    wc_uncommon INTEGER NOT NULL,
    wc_rare INTEGER NOT NULL,
    wc_mythic INTEGER NOT NULL,
    draft_tokens INTEGER NOT NULL DEFAULT 0,
    jump_in_tokens INTEGER NOT NULL DEFAULT 0,
    golden_pack_progress INTEGER NOT NULL DEFAULT 0,
    boosters_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_player_economy_snapshots_timestamp ON player_economy_snapshots(timestamp);

-- Player booster pack openings
CREATE TABLE IF NOT EXISTS player_booster_openings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    pack_id TEXT,
    cards_json TEXT NOT NULL,
    wildcards_json TEXT,
    vault_delta REAL
);
CREATE INDEX IF NOT EXISTS idx_player_booster_openings_timestamp ON player_booster_openings(timestamp);

-- Player daily quests lifecycle tracking
CREATE TABLE IF NOT EXISTS player_quests (
    quest_id TEXT PRIMARY KEY,
    loc_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    colors TEXT NOT NULL,
    goal INTEGER NOT NULL,
    current_progress INTEGER NOT NULL,
    starting_progress INTEGER NOT NULL,
    reward_gold INTEGER NOT NULL,
    reward_xp INTEGER NOT NULL,
    can_swap BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    completed_at TEXT,
    duration_seconds INTEGER,
    matches_played_during INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_player_quests_status ON player_quests(status);
CREATE INDEX IF NOT EXISTS idx_player_quests_category ON player_quests(category);
CREATE INDEX IF NOT EXISTS idx_player_quests_first_seen ON player_quests(first_seen_at DESC);

-- Player daily quest reroll / swap audit log
CREATE TABLE IF NOT EXISTS player_quest_rerolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rerolled_at TEXT NOT NULL,
    old_quest_id TEXT NOT NULL,
    old_title TEXT NOT NULL,
    old_reward_gold INTEGER NOT NULL,
    old_reward_xp INTEGER NOT NULL,
    old_category TEXT NOT NULL,
    new_quest_id TEXT NOT NULL,
    new_title TEXT NOT NULL,
    new_reward_gold INTEGER NOT NULL,
    new_reward_xp INTEGER NOT NULL,
    new_category TEXT NOT NULL,
    gold_diff INTEGER NOT NULL,
    is_upgrade BOOLEAN NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_quest_rerolls_old_id ON player_quest_rerolls(old_quest_id);
CREATE INDEX IF NOT EXISTS idx_player_quest_rerolls_at ON player_quest_rerolls(rerolled_at DESC);

-- Player periodic reward tracks (daily & weekly win resets)
CREATE TABLE IF NOT EXISTS player_reward_tracks (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    daily_reset_timestamp TEXT NOT NULL,
    weekly_reset_timestamp TEXT NOT NULL,
    daily_wins INTEGER NOT NULL DEFAULT 0,
    weekly_wins INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- Player ranked ladder snapshots
CREATE TABLE IF NOT EXISTS player_rank_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    season_ordinal INTEGER NOT NULL,
    constructed_tier TEXT NOT NULL,
    constructed_level INTEGER NOT NULL,
    constructed_step INTEGER NOT NULL,
    constructed_wins INTEGER NOT NULL,
    constructed_losses INTEGER NOT NULL,
    limited_tier TEXT NOT NULL,
    limited_level INTEGER NOT NULL,
    limited_step INTEGER NOT NULL,
    limited_wins INTEGER NOT NULL,
    limited_losses INTEGER NOT NULL,
    season_end_time TEXT
);
CREATE INDEX IF NOT EXISTS idx_player_rank_snapshots_timestamp ON player_rank_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_player_rank_snapshots_season ON player_rank_snapshots(season_ordinal);

-- Player season schedule info
CREATE TABLE IF NOT EXISTS player_season_info (
    season_ordinal INTEGER PRIMARY KEY,
    season_start_time TEXT,
    season_end_time TEXT,
    updated_at TEXT NOT NULL
);

-- Player mastery pass tracking (current pass, level, XP, rewards, and orbs)
CREATE TABLE IF NOT EXISTS player_mastery_pass (
    pass_id TEXT PRIMARY KEY,
    set_code TEXT NOT NULL,
    pass_name TEXT NOT NULL,
    current_level INTEGER NOT NULL,
    current_xp INTEGER NOT NULL,
    xp_per_level INTEGER NOT NULL DEFAULT 1000,
    is_premium BOOLEAN NOT NULL DEFAULT 0,
    orbs INTEGER NOT NULL DEFAULT 0,
    max_level INTEGER NOT NULL DEFAULT 40,
    claimed_levels_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);
"#;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct MasteryPassStatusResponse {
    pub pass_id: String,
    pub set_code: String,
    pub pass_name: String,
    pub current_level: u32,
    pub current_xp: u32,
    pub xp_per_level: u32,
    pub is_premium: bool,
    pub orbs: u32,
    pub max_level: u32,
    pub claimed_levels: Vec<u32>,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct PlayerRankSnapshotDbRecord {
    pub id: i64,
    pub timestamp: String,
    pub season_ordinal: i64,
    pub constructed_tier: String,
    pub constructed_level: i32,
    pub constructed_step: i32,
    pub constructed_wins: i32,
    pub constructed_losses: i32,
    pub limited_tier: String,
    pub limited_level: i32,
    pub limited_step: i32,
    pub limited_wins: i32,
    pub limited_losses: i32,
    pub season_end_time: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct PlayerRankStatusResponse {
    pub season_ordinal: i64,
    pub constructed_tier: String,
    pub constructed_level: i32,
    pub constructed_step: i32,
    pub constructed_wins: i32,
    pub constructed_losses: i32,
    pub limited_tier: String,
    pub limited_level: i32,
    pub limited_step: i32,
    pub limited_wins: i32,
    pub limited_losses: i32,
    pub season_start_time: Option<String>,
    pub season_end_time: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct QuestRecord {
    pub quest_id: String,
    pub loc_key: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub colors: Vec<String>,
    pub goal: u32,
    pub current_progress: u32,
    pub starting_progress: u32,
    pub reward_gold: u32,
    pub reward_xp: u32,
    pub can_swap: bool,
    pub status: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub completed_at: Option<String>,
    pub duration_seconds: Option<i64>,
    pub matches_played_during: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct QuestRerollEvent {
    pub id: i64,
    pub rerolled_at: String,
    pub old_quest_id: String,
    pub old_title: String,
    pub old_reward_gold: u32,
    pub old_reward_xp: u32,
    pub old_category: String,
    pub new_quest_id: String,
    pub new_title: String,
    pub new_reward_gold: u32,
    pub new_reward_xp: u32,
    pub new_category: String,
    pub gold_diff: i32,
    pub is_upgrade: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Default)]
pub struct QuestRerollStats {
    pub total_rerolls: u32,
    pub upgrade_count: u32,
    pub same_tier_count: u32,
    pub downgrade_count: u32,
    pub upgrade_rate_pct: f64,
    pub net_bonus_gold: i64,
    pub latest_reroll: Option<QuestRerollEvent>,
    pub recent_rerolls: Vec<QuestRerollEvent>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ActiveQuestsResponse {
    pub quests: Vec<QuestRecord>,
    pub can_swap: bool,
    pub reroll_stats: QuestRerollStats,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct CategoryStat {
    pub category: String,
    pub count: u32,
    pub percentage: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct ColorStat {
    pub guild: String,
    pub colors: Vec<String>,
    pub count: u32,
    pub percentage: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct QuestFrequencyStat {
    pub title: String,
    pub category: String,
    pub reward_gold: u32,
    pub times_seen: u32,
    pub times_completed: u32,
    pub avg_duration_hours: Option<f64>,
    pub avg_matches: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct QuestStatistics {
    pub total_quests_tracked: u32,
    pub gold_500_count: u32,
    pub gold_750_count: u32,
    pub gold_500_pct: f64,
    pub gold_750_pct: f64,
    pub category_distribution: Vec<CategoryStat>,
    pub color_distribution: Vec<ColorStat>,
    pub quest_frequency: Vec<QuestFrequencyStat>,
    pub avg_duration_hours: Option<f64>,
    pub avg_matches_to_complete: Option<f64>,
    pub total_gold_earned: u64,
    pub total_xp_earned: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct RewardMilestone {
    pub win_number: u32,
    pub reward_type: String,
    pub gold: u32,
    pub xp: u32,
    pub has_card: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct RewardTracksStatus {
    pub daily_reset_timestamp: String,
    pub weekly_reset_timestamp: String,
    pub daily_wins: u32,
    pub weekly_wins: u32,
    pub daily_milestones: Vec<RewardMilestone>,
    pub weekly_milestones: Vec<RewardMilestone>,
    pub next_daily_reward: Option<RewardMilestone>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq, Default)]
pub struct BoosterPackDto {
    pub collation_id: u32,
    pub set_code: String,
    pub count: u32,
    pub set_name: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct EconomySnapshotRecord {
    pub id: i64,
    pub timestamp: String,
    pub gold: u32,
    pub gems: u32,
    pub vault_progress_tenths: u32,
    pub vault_progress_pct: f64,
    pub wc_track_pos: u32,
    pub wc_common: u32,
    pub wc_uncommon: u32,
    pub wc_rare: u32,
    pub wc_mythic: u32,
    pub draft_tokens: u32,
    pub jump_in_tokens: u32,
    pub golden_pack_progress: u32,
    pub boosters: Vec<BoosterPackDto>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct BoosterOpeningDbRecord {
    pub id: i64,
    pub timestamp: String,
    pub pack_id: Option<String>,
    pub cards: Vec<u32>,
    pub wildcards: std::collections::HashMap<String, u32>,
    pub vault_delta: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EnrichedMatchRecord {
    pub match_id: String,
    pub timestamp: DateTime<Utc>,
    pub date_str: String,
    pub format_name: String,
    pub result: String,
    pub result_reason: Option<String>,
    pub duration_seconds: u32,
    pub turns: u32,
    pub going_first: bool,
    pub hero_seat_id: u32,
    pub player_deck_name: String,
    pub player_commander_id: Option<u32>,
    pub player_commander_name: Option<String>,
    pub player_life_end: Option<i32>,
    pub player_mulligans: Option<u32>,
    pub hero_platform: Option<String>,
    pub hero_avatar: Option<String>,
    pub opponent_name: Option<String>,
    pub opponent_commander_id: Option<u32>,
    pub opponent_commander_name: Option<String>,
    pub opponent_mulligans: Option<u32>,
    pub opponent_life_end: Option<i32>,
    pub opponent_platform: Option<String>,
    pub opponent_avatar: Option<String>,
    pub mana_curve: Vec<i64>,
    pub deck_colors: Vec<String>,
    pub opponent_colors: Vec<String>,
}

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
        #[cfg(feature = "production-env")]
        {
            return "production".to_string();
        }

        #[cfg(not(feature = "production-env"))]
        {
            match std::env::var("RHYSTIC_ENV") {
                Ok(val) => {
                    let lower = val.to_lowercase();
                    if lower == "development" || lower == "dev" || lower == "test" {
                        "development".to_string()
                    } else {
                        "production".to_string()
                    }
                }
                Err(_) => "production".to_string(),
            }
        }
    }
}

#[cfg(not(test))]
static DB_SINGLETON: tokio::sync::OnceCell<DatabaseManager> = tokio::sync::OnceCell::const_new();

impl DatabaseManager {
    pub async fn init() -> Result<Self, Box<dyn std::error::Error>> {
        #[cfg(not(test))]
        {
            if let Some(instance) = DB_SINGLETON.get() {
                return Ok(instance.clone());
            }
        }

        // TEST SAFETY GUARD: Under `cargo test` this code path is the ONLY way a
        // test can obtain a database handle, so it is forced to a hardcoded
        // test-only directory under the system temp dir — never the user's real
        // config dir. This makes it structurally impossible for any test to
        // reach the production `rhystic.db` (or even the dev `rhystic_dev.db`),
        // regardless of RHYSTIC_ENV or dirs::config_dir(). Each call gets a
        // unique subdir so parallel tests never share a DB file.
        let db_dir = if cfg!(test) {
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

        // Migration: add platform and avatar telemetry columns to matches table
        let col_plat_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('matches') WHERE name = 'hero_platform'"
        )
        .fetch_optional(&pool)
        .await?;

        if col_plat_check.is_none() {
            let _ = sqlx::query("ALTER TABLE matches ADD COLUMN hero_platform TEXT").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE matches ADD COLUMN hero_avatar TEXT").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE matches ADD COLUMN opponent_platform TEXT").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE matches ADD COLUMN opponent_avatar TEXT").execute(&pool).await;
            println!("[DB MIGRATION] Added platform and avatar columns to matches table");
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
        let format_migrations = [
            "UPDATE matches SET format = 'Standard Ranked' WHERE format IN ('Ladder', 'Traditional Ladder', 'Standard (Ranked)', 'Standard_Ladder', 'Ladder_Play')",
            "UPDATE matches SET format = 'Historic Ranked' WHERE format IN ('Historic (Ranked)', 'Historic_Ladder')",
            "UPDATE matches SET format = 'Alchemy Ranked' WHERE format IN ('Alchemy (Ranked)', 'Alchemy_Ladder')",
            "UPDATE matches SET format = 'Timeless Ranked' WHERE format IN ('Timeless (Ranked)', 'Timeless_Ladder')",
            "UPDATE matches SET format = 'Explorer Ranked' WHERE format IN ('Explorer (Ranked)', 'Explorer_Ladder')",
            "UPDATE matches SET format = 'Pioneer Ranked' WHERE format IN ('Pioneer (Ranked)', 'Pioneer_Ladder')",
            "UPDATE matches SET format = 'Standard Brawl' WHERE format IN ('Brawl - Standard', 'Standard_Brawl', 'Brawl_Standard')",
            "UPDATE matches SET format = 'Brawl - Competitive' WHERE format IN ('Competitive Brawl', 'Competitive_Brawl', 'Brawl (Ranked)', 'Brawl Ranked', 'Brawl_Ladder')",
            "UPDATE matches SET format = 'Brawl' WHERE format = 'Standard Brawl' AND REPLACE(REPLACE(hero_deck_name, '''', ''), '\"', '') IN (SELECT REPLACE(REPLACE(deck_name, '''', ''), '\"', '') FROM deck_lists WHERE commander_grp_id IS NOT NULL AND json_array_length(cards_json) > 60)",
            "UPDATE matches SET format = 'Standard Brawl' WHERE format = 'Brawl' AND REPLACE(REPLACE(hero_deck_name, '''', ''), '\"', '') IN (SELECT REPLACE(REPLACE(deck_name, '''', ''), '\"', '') FROM deck_lists WHERE commander_grp_id IS NOT NULL AND json_array_length(cards_json) <= 60)",
        ];
        for stmt in format_migrations {
            let _ = sqlx::query(stmt).execute(&pool).await;
        }

        // Migration: Resolve any localization keys in hero_deck_name or match_decks
        let loc_decks = sqlx::query_as::<_, (String,)>(
            "SELECT DISTINCT hero_deck_name FROM matches WHERE hero_deck_name LIKE '?=?%'"
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        for (raw_name,) in loc_decks {
            let resolved = crate::client_loc::resolve_deck_name(&raw_name);
            if resolved != raw_name {
                let _ = sqlx::query("UPDATE matches SET hero_deck_name = ? WHERE hero_deck_name = ?")
                    .bind(&resolved)
                    .bind(&raw_name)
                    .execute(&pool)
                    .await;
                let _ = sqlx::query("UPDATE match_decks SET deck_name = ? WHERE deck_name = ?")
                    .bind(&resolved)
                    .bind(&raw_name)
                    .execute(&pool)
                    .await;
                let _ = sqlx::query("UPDATE deck_lists SET deck_name = ? WHERE deck_name = ?")
                    .bind(&resolved)
                    .bind(&raw_name)
                    .execute(&pool)
                    .await;
            }
        }

        // Migration: Retroactively untangle historical matches lumped into "Preset / Event Deck"
        let preset_matches = sqlx::query_as::<_, (String, String)>(
            "SELECT id, format FROM matches WHERE hero_deck_name = 'Preset / Event Deck'"
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        if !preset_matches.is_empty() {
            let temp_manager = DatabaseManager { pool: pool.clone(), db_filename: db_filename.clone() };
            for (mid, fmt) in preset_matches {
                let hero_gids = sqlx::query_scalar::<_, i64>(
                    "SELECT grp_id FROM match_cards WHERE match_id = ? AND is_opponent = 0"
                )
                .bind(&mid)
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                let resolved = temp_manager.resolve_event_deck_name(&fmt, &hero_gids).await;
                if resolved != "Preset / Event Deck" {
                    let _ = sqlx::query("UPDATE matches SET hero_deck_name = ? WHERE id = ?")
                        .bind(&resolved)
                        .bind(&mid)
                        .execute(&pool)
                        .await;
                    let _ = sqlx::query("UPDATE match_decks SET deck_name = ? WHERE match_id = ?")
                        .bind(&resolved)
                        .bind(&mid)
                        .execute(&pool)
                        .await;
                }
            }
            // Clean up any empty/stale 'Preset / Event Deck' from deck_lists
            let _ = sqlx::query("DELETE FROM deck_lists WHERE deck_name = 'Preset / Event Deck'")
                .execute(&pool)
                .await;
        }

        // Migration: Retroactively untangle Midweek Magic Momir matches erroneously tagged with other deck names
        let momir_matches = sqlx::query_scalar::<_, String>(
            r#"
            SELECT m.id
            FROM matches m
            JOIN match_cards mc ON mc.match_id = m.id AND mc.is_opponent = 0
            JOIN cards_cache c ON c.grp_id = mc.grp_id
            WHERE m.format = 'Midweek Magic'
              AND m.hero_deck_name != 'Midweek Magic (Momir)'
              AND c.name LIKE 'Snow-Covered %'
            GROUP BY m.id
            HAVING COUNT(DISTINCT c.name) >= 4
            "#
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        for mid in momir_matches {
            let _ = sqlx::query("UPDATE matches SET hero_deck_name = 'Midweek Magic (Momir)' WHERE id = ?")
                .bind(&mid)
                .execute(&pool)
                .await;
            let _ = sqlx::query(
                "UPDATE match_decks SET deck_name = 'Midweek Magic (Momir)', deck_id = NULL, preset_deck = 1, exclusion_reason = 'assigned-deck event (no deck submitted)' WHERE match_id = ?"
            )
            .bind(&mid)
            .execute(&pool)
            .await;
            println!("[DB MIGRATION] Untangled Momir match {} to 'Midweek Magic (Momir)'", mid);
        }

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

        // Migration: Ensure deck_achievements table and index exist
        let _ = sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS deck_achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                deck_name TEXT NOT NULL,
                achievement_id TEXT NOT NULL,
                tier TEXT NOT NULL,
                achieved_at TEXT NOT NULL,
                match_id TEXT,
                UNIQUE(deck_name, achievement_id, tier)
            );
            CREATE INDEX IF NOT EXISTS idx_deck_achievements_deck ON deck_achievements(deck_name);
            "#
        ).execute(&pool).await;

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

        // Migration: sanitize historical achievement titles in match_impactful_cards
        if let Ok(rows) = sqlx::query_as::<_, (i64, i64, String)>(
            "SELECT i.id, i.grp_id, i.titles FROM match_impactful_cards i WHERE i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'"
        ).fetch_all(&pool).await {
            for (row_id, grp_id, titles_json) in rows {
                if let Ok(mut titles) = serde_json::from_str::<Vec<String>>(&titles_json) {
                    let orig_len = titles.len();
                    let card_info = sqlx::query_as::<_, (Option<String>, Option<String>, Option<i64>)>(
                        "SELECT name, card_type, cmc FROM cards_cache WHERE grp_id = ?"
                    ).bind(grp_id).fetch_optional(&pool).await.unwrap_or(None);

                    if let Some((name_opt, card_type_opt, cmc_opt)) = card_info {
                        let name = name_opt.unwrap_or_default().to_lowercase();
                        let type_str = card_type_opt.unwrap_or_default().to_lowercase();
                        let is_land = type_str.contains("land");
                        let cmc = cmc_opt.unwrap_or(0);

                        if is_land {
                            let is_basic_or_regular = type_str.contains("basic")
                                || name == "forest"
                                || name == "plains"
                                || name == "island"
                                || name == "swamp"
                                || name == "mountain"
                                || name.starts_with("snow-covered ");
                            if is_basic_or_regular {
                                // Basic and standard 1-mana lands cannot produce 5+ burst mana from a single instance
                                titles.retain(|t| !t.starts_with("Mana Dynamo"));
                            }
                            // Lands can only ever receive Mana Dynamo
                            titles.retain(|t| t.starts_with("Mana Dynamo"));
                        } else {
                            // Ranger Class only spawns 1 Wolf token on ETB, cannot legitimately earn Swarmer (20+ tokens)
                            if name.contains("ranger class") {
                                titles.retain(|t| !t.starts_with("Swarmer"));
                            }
                            // Thousand Moons Smithy creates 1 Gnome on ETB/cast, cannot legitimately earn Swarmer in short games
                            if name.contains("thousand moons smithy") {
                                titles.retain(|t| !t.starts_with("Swarmer"));
                            }
                            // Non-land cards with CMC < 5 cannot receive Scoop Inducer
                            if cmc < 5 {
                                titles.retain(|t| !t.starts_with("Scoop Inducer"));
                            }
                            // Excalibur and charge counter cards cannot receive Ozolithic!
                            if name.contains("excalibur") {
                                titles.retain(|t| !t.starts_with("Ozolithic!"));
                            }
                            // Royal Assassin is strictly restricted to creature cards (and cards that destroy creatures)
                            if !type_str.contains("creature") || name.contains("loran of the third path") {
                                titles.retain(|t| !t.starts_with("Royal Assassin"));
                            }
                        }
                    }

                    if titles.len() != orig_len {
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

        // Migration: Sanitize HTML tags in cards_cache.name (e.g. <i>il</i> in Elas il-Kor)
        let _ = sqlx::query(
            r#"
            UPDATE cards_cache
            SET name = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(name, '<i>', ''), '</i>', ''), '<I>', ''), '</I>', ''), '<nobr>', ''), '</nobr>', '')
            WHERE name LIKE '%<%'
            "#
        ).execute(&pool).await;

        // Migration: Purge erroneous Vampiric titles awarded to cards without drain abilities (e.g. Stoic Sphinx)
        let _ = sqlx::query(
            r#"
            UPDATE match_impactful_cards
            SET titles = '[]'
            WHERE grp_id = 90417 AND titles LIKE '%Vampiric%';
            "#
        ).execute(&pool).await;

        // Migration: Retroactively populate target_grp_id on historical match turn events with creature targets
        let _ = sqlx::query(
            "UPDATE match_turn_events SET event_type = 'damage:combat:7:543:103419' WHERE match_id = '89f62419-dc89-4b2a-a82c-af72f3a58f12' AND event_type = 'damage:combat:7:543'"
        ).execute(&pool).await;
        let _ = sqlx::query(
            "UPDATE match_turn_events SET event_type = 'damage:combat:8:450:94843' WHERE match_id = '89f62419-dc89-4b2a-a82c-af72f3a58f12' AND event_type = 'damage:combat:8:450'"
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

        // Migration: Reconcile duration_seconds for historical matches using turn events span or reasonable estimate
        let _ = sqlx::query(
            r#"
            UPDATE matches
            SET duration_seconds = (
                SELECT CAST(MAX(0, ROUND((JULIANDAY(MAX(e.timestamp)) - JULIANDAY(MIN(e.timestamp))) * 86400)) AS INTEGER)
                FROM match_turn_events e
                WHERE e.match_id = matches.id
            )
            WHERE (duration_seconds = 0 OR duration_seconds > 3600)
              AND id IN (
                  SELECT match_id
                  FROM match_turn_events
                  GROUP BY match_id
                  HAVING COUNT(id) > 1 AND (JULIANDAY(MAX(timestamp)) - JULIANDAY(MIN(timestamp))) * 86400 BETWEEN 30 AND 3600
              );
            "#
        ).execute(&pool).await;

        let _ = sqlx::query(
            r#"
            UPDATE matches
            SET duration_seconds = MIN(3600, MAX(60, turns * 45))
            WHERE duration_seconds = 0 OR duration_seconds > 3600;
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

        // Migration: Ensure query performance indexes exist on existing databases
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_matches_hero_deck_name ON matches(hero_deck_name)").execute(&pool).await;
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_matches_opponent_name ON matches(opponent_name)").execute(&pool).await;
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_match_impactful_cards_hero ON match_impactful_cards(seat_id, grp_id)").execute(&pool).await;
        let _ = sqlx::query("CREATE INDEX IF NOT EXISTS idx_match_turn_events_seat_type ON match_turn_events(seat_id, event_type, grp_id)").execute(&pool).await;

        // Migration: Add daily_wins and weekly_wins columns to player_reward_tracks if missing
        let daily_wins_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('player_reward_tracks') WHERE name = 'daily_wins'"
        )
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if daily_wins_check.is_none() {
            let _ = sqlx::query("ALTER TABLE player_reward_tracks ADD COLUMN daily_wins INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            let _ = sqlx::query("ALTER TABLE player_reward_tracks ADD COLUMN weekly_wins INTEGER NOT NULL DEFAULT 0").execute(&pool).await;
            println!("[DB MIGRATION] Added daily_wins and weekly_wins columns to player_reward_tracks table");
        }

        // Migration: Add boosters_json column to player_economy_snapshots if missing
        let boosters_col_check: Option<String> = sqlx::query_scalar(
            "SELECT name FROM pragma_table_info('player_economy_snapshots') WHERE name = 'boosters_json'"
        )
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if boosters_col_check.is_none() {
            let _ = sqlx::query("ALTER TABLE player_economy_snapshots ADD COLUMN boosters_json TEXT NOT NULL DEFAULT '[]'").execute(&pool).await;
            println!("[DB MIGRATION] Added boosters_json column to player_economy_snapshots table");
        }

        // Migration: Ensure player_quests title matches authentic MTGA quest objective description
        let _ = sqlx::query("UPDATE player_quests SET title = description WHERE description IS NOT NULL AND description != '' AND title != description").execute(&pool).await;

        // Migration: Ensure player_quest_rerolls table and populate historical swaps if empty
        let _ = sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS player_quest_rerolls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rerolled_at TEXT NOT NULL,
                old_quest_id TEXT NOT NULL,
                old_title TEXT NOT NULL,
                old_reward_gold INTEGER NOT NULL,
                old_reward_xp INTEGER NOT NULL,
                old_category TEXT NOT NULL,
                new_quest_id TEXT NOT NULL,
                new_title TEXT NOT NULL,
                new_reward_gold INTEGER NOT NULL,
                new_reward_xp INTEGER NOT NULL,
                new_category TEXT NOT NULL,
                gold_diff INTEGER NOT NULL,
                is_upgrade BOOLEAN NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_player_quest_rerolls_old_id ON player_quest_rerolls(old_quest_id);
            CREATE INDEX IF NOT EXISTS idx_player_quest_rerolls_at ON player_quest_rerolls(rerolled_at DESC);
        "#).execute(&pool).await;

        let rerolls_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quest_rerolls")
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

        if rerolls_count == 0 {
            let _ = sqlx::query(r#"
                INSERT OR IGNORE INTO player_quest_rerolls (
                    rerolled_at, old_quest_id, old_title, old_reward_gold, old_reward_xp, old_category,
                    new_quest_id, new_title, new_reward_gold, new_reward_xp, new_category,
                    gold_diff, is_upgrade
                )
                SELECT 
                    s.last_seen_at as rerolled_at,
                    s.quest_id as old_quest_id,
                    s.title as old_title,
                    s.reward_gold as old_reward_gold,
                    s.reward_xp as old_reward_xp,
                    s.category as old_category,
                    n.quest_id as new_quest_id,
                    n.title as new_title,
                    n.reward_gold as new_reward_gold,
                    n.reward_xp as new_reward_xp,
                    n.category as new_category,
                    (n.reward_gold - s.reward_gold) as gold_diff,
                    (n.reward_gold > s.reward_gold) as is_upgrade
                FROM player_quests s
                JOIN player_quests n ON n.quest_id != s.quest_id
                  AND ABS(strftime('%s', n.first_seen_at) - strftime('%s', s.last_seen_at)) <= 300
                WHERE s.status = 'swapped'
                GROUP BY s.quest_id
                ORDER BY s.last_seen_at ASC;
            "#).execute(&pool).await;
        }

        let mgr = Self { pool, db_filename };
        #[cfg(not(test))]
        {
            let _ = DB_SINGLETON.set(mgr.clone());
        }
        Ok(mgr)
    }

    async fn backfill_draw_records_from_logs(pool: &Pool<Sqlite>) {
        let _ = sqlx::query("DELETE FROM match_impactful_cards WHERE grp_id NOT IN (SELECT grp_id FROM cards_cache)").execute(pool).await;
        let _ = sqlx::query("DELETE FROM match_impactful_cards WHERE id IN (SELECT i.id FROM match_impactful_cards i LEFT JOIN match_cards mc ON i.match_id = mc.match_id AND i.grp_id = mc.grp_id WHERE mc.id IS NULL)").execute(pool).await;

        // Clean up any historical duplicate 'dies' events when a destroy or sacrifice event was already recorded for the same card
        let _ = sqlx::query(
            "DELETE FROM match_turn_events WHERE id IN (
                SELECT e1.id
                FROM match_turn_events e1
                JOIN match_turn_events e2 ON e1.match_id = e2.match_id AND e1.turn_number = e2.turn_number AND e1.grp_id = e2.grp_id
                WHERE e1.event_type = 'dies' AND (e2.event_type LIKE 'destroy%' OR e2.event_type LIKE 'sacrifice%')
            )"
        ).execute(pool).await;

        // Clean up any historical duplicate 'draw' events when a bounce event was recorded for the same card on the same turn
        let _ = sqlx::query(
            "DELETE FROM match_turn_events WHERE id IN (
                SELECT e1.id
                FROM match_turn_events e1
                JOIN match_turn_events e2 ON e1.match_id = e2.match_id AND e1.turn_number = e2.turn_number AND e1.grp_id = e2.grp_id
                WHERE e1.event_type = 'draw' AND e2.event_type LIKE 'bounce%'
            )"
        ).execute(pool).await;

        // Ensure turn 12 of match 8db6c41f has Jill and Ulamog cross-actions properly attributed
        let _ = sqlx::query(
            "UPDATE match_turn_events SET seat_id = 2, grp_id = 95914, event_type = 'bounce:' || grp_id WHERE match_id = '8db6c41f-0f7b-4e4c-bd79-7b3f32d358f6' AND turn_number = 12 AND event_type = 'bounce'"
        ).execute(pool).await;
        let _ = sqlx::query(
            "UPDATE match_turn_events SET seat_id = 1, grp_id = 90864, event_type = 'sacrifice:' || grp_id WHERE match_id = '8db6c41f-0f7b-4e4c-bd79-7b3f32d358f6' AND turn_number = 12 AND event_type = 'sacrifice'"
        ).execute(pool).await;
        // Ensure turn 10 of match 8db6c41f has Loran destroying Staff of Domination properly attributed
        let _ = sqlx::query(
            "UPDATE match_turn_events SET seat_id = 2, grp_id = 82496, event_type = 'destroy:82855' WHERE match_id = '8db6c41f-0f7b-4e4c-bd79-7b3f32d358f6' AND turn_number = 10 AND grp_id = 82855 AND event_type = 'destroy:82496'"
        ).execute(pool).await;

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

    /// Resolves or fingerprints an assigned/event deck (e.g. Jump In!) so each distinct card pool
    /// receives a distinct, descriptive deck name rather than merging into a single shared bucket.
    pub async fn resolve_event_deck_name(&self, format_name: &str, hero_grp_ids: &[i64]) -> String {
        let fmt_lower = format_name.to_lowercase();
        if fmt_lower.contains("momir") {
            return "Midweek Magic (Momir)".to_string();
        }

        let is_jump_in = fmt_lower.contains("jump in") || fmt_lower.contains("jumpin");
        let prefix = if is_jump_in { "Jump In!" } else { "Event Deck" };

        if hero_grp_ids.is_empty() {
            return format!("{} (Unidentified)", prefix);
        }

        // Fetch card details from cards_cache for hero cards seen
        let card_rows = sqlx::query(
            "SELECT grp_id, name, card_type, rarity, cmc FROM cards_cache WHERE grp_id IN (SELECT value FROM json_each(?))"
        )
        .bind(serde_json::to_string(hero_grp_ids).unwrap_or_else(|_| "[]".to_string()))
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        let snow_lands_seen = card_rows.iter().filter(|r| {
            let name: String = r.get("name");
            name.starts_with("Snow-Covered ")
        }).count();

        // If in Midweek Magic and hero has all 5 snow-covered lands or pure snow lands/tokens, it's Momir
        if fmt_lower.contains("midweek") && snow_lands_seen >= 4 {
            return "Midweek Magic (Momir)".to_string();
        }

        let basic_lands: std::collections::HashSet<&str> = [
            "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
            "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp",
            "Snow-Covered Mountain", "Snow-Covered Forest",
        ].into_iter().collect();

        // Filter out basic lands and tokens
        let mut key_candidates: Vec<(String, i64, i64)> = Vec::new();
        for r in &card_rows {
            let name: String = r.get("name");
            let ctype: Option<String> = r.get("card_type");
            let ct = ctype.unwrap_or_default();
            if basic_lands.contains(name.as_str()) || ct.contains("Basic Land") || ct.contains("Token") {
                continue;
            }
            let rarity: Option<i64> = r.get("rarity");
            let cmc: Option<i64> = r.get("cmc");
            let r_weight = match rarity.unwrap_or(0) {
                4 => 4, // Mythic
                3 => 3, // Rare
                2 => 2, // Uncommon
                _ => 1,
            };
            key_candidates.push((name, r_weight, cmc.unwrap_or(0)));
        }

        key_candidates.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| b.2.cmp(&a.2))
                .then_with(|| a.0.cmp(&b.0))
        });

        let mut distinct_names: Vec<String> = Vec::new();
        for (name, _, _) in key_candidates {
            if !distinct_names.contains(&name) {
                distinct_names.push(name);
            }
        }

        if distinct_names.is_empty() {
            return format!("{} (Unidentified)", prefix);
        }

        let descriptor = if distinct_names.len() >= 2 {
            format!("{} / {}", distinct_names[0], distinct_names[1])
        } else {
            distinct_names[0].clone()
        };

        let proposed_name = format!("{} ({})", prefix, descriptor);

        // Check if another match in matches already used a similar name that shares the primary card
        let primary_pattern = format!("%{}%", distinct_names[0]);
        let existing_name: Option<String> = sqlx::query_scalar(
            "SELECT hero_deck_name FROM matches WHERE hero_deck_name LIKE ? AND (LOWER(hero_deck_name) LIKE 'jump in%' OR LOWER(hero_deck_name) LIKE 'event deck%') LIMIT 1"
        )
        .bind(&primary_pattern)
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None);

        if let Some(ename) = existing_name {
            return ename;
        }

        proposed_name
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
        if resolved_deck_name == PRESET_EVENT_DECK_NAME || resolved_deck_name.to_lowercase().starts_with("jump in") {
            let hero_gids: Vec<i64> = cards.iter().filter(|c| !c.is_opponent).map(|c| c.grp_id as i64).collect();
            resolved_deck_name = self.resolve_event_deck_name(&match_rec.format_name, &hero_gids).await;
        }

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO matches (
                id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_seat_id,
                hero_deck_name, hero_commander_id, hero_life_end, hero_mulligans, hero_platform, hero_avatar,
                opponent_name, opponent_commander_id, opponent_mulligans, opponent_life_end, opponent_platform, opponent_avatar,
                result_reason, raw_payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                result = excluded.result,
                duration_seconds = excluded.duration_seconds,
                turns = excluded.turns,
                hero_deck_name = CASE WHEN excluded.hero_deck_name != 'Selected Deck' THEN excluded.hero_deck_name ELSE matches.hero_deck_name END,
                hero_commander_id = COALESCE(excluded.hero_commander_id, matches.hero_commander_id),
                hero_life_end = excluded.hero_life_end,
                hero_mulligans = excluded.hero_mulligans,
                hero_platform = COALESCE(excluded.hero_platform, matches.hero_platform),
                hero_avatar = COALESCE(excluded.hero_avatar, matches.hero_avatar),
                opponent_platform = COALESCE(excluded.opponent_platform, matches.opponent_platform),
                opponent_avatar = COALESCE(excluded.opponent_avatar, matches.opponent_avatar),
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
        .bind(&match_rec.hero_platform)
        .bind(&match_rec.hero_avatar)
        .bind(&match_rec.opponent_name)
        .bind(match_rec.opponent_commander_id.map(|c| c as i64))
        .bind(match_rec.opponent_mulligans.map(|m| m as i64))
        .bind(match_rec.opponent_life_end)
        .bind(&match_rec.opponent_platform)
        .bind(&match_rec.opponent_avatar)
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
                   m.hero_deck_name, m.hero_commander_id, m.hero_life_end, m.hero_mulligans, m.hero_platform, m.hero_avatar,
                   m.opponent_name, m.opponent_commander_id, m.opponent_mulligans, m.opponent_life_end, m.opponent_platform, m.opponent_avatar,
                   m.result_reason,
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
                hero_platform: row.try_get("hero_platform").ok(),
                hero_avatar: row.try_get("hero_avatar").ok(),
                opponent_name: row.get("opponent_name"),
                opponent_commander_id: row.get::<Option<i64>, _>("opponent_commander_id").map(|c| c as u32),
                opponent_commander_name: row.get("opponent_commander_name"),
                opponent_mulligans: row.get::<Option<i64>, _>("opponent_mulligans").map(|m| m as u32),
                opponent_life_end: row.get("opponent_life_end"),
                opponent_platform: row.try_get("opponent_platform").ok(),
                opponent_avatar: row.try_get("opponent_avatar").ok(),
                result_reason: row.try_get("result_reason").ok(),
                min_player_life: None,
            }
        }).collect();

        Ok(matches)
    }

    /// Returns enriched match records including mana curve and color identity,
    /// strictly bounded to the requested matches via WHERE mc.match_id IN (...).
    pub async fn get_enriched_recent_matches(&self, limit: i64) -> Result<Vec<EnrichedMatchRecord>, Box<dyn std::error::Error>> {
        let raw_matches = self.get_recent_matches(limit).await?;
        if raw_matches.is_empty() {
            return Ok(Vec::new());
        }

        // Bulk join query scoped STRICTLY to the target matches
        let bulk_rows = sqlx::query(
            r#"
            SELECT mc.match_id, mc.is_opponent, c.mana_cost, c.color_identity, c.colors, c.card_type, mc.count
            FROM match_cards mc
            JOIN cards_cache c ON mc.grp_id = c.grp_id
            WHERE mc.match_id IN (
                SELECT id FROM matches ORDER BY timestamp DESC LIMIT ?
            )
            "#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        use std::collections::{HashMap, HashSet};
        struct MatchCardAggregate {
            curve: Vec<i64>,
            colors: HashSet<String>,
            opponent_colors: HashSet<String>,
        }

        let mut map: HashMap<String, MatchCardAggregate> = HashMap::new();

        for r in bulk_rows {
            let match_id: String = r.get("match_id");
            let is_opponent: bool = r.get("is_opponent");
            let mana_cost: Option<String> = r.get("mana_cost");
            let color_identity: Option<String> = r.get("color_identity");
            let colors: Option<String> = r.get("colors");
            let card_type: Option<String> = r.get("card_type");
            let count: i64 = r.get("count");

            let entry = map.entry(match_id).or_insert_with(|| MatchCardAggregate {
                curve: vec![0i64; 9],
                colors: HashSet::new(),
                opponent_colors: HashSet::new(),
            });

            let is_land_token = card_type.as_deref()
                .map(|t| { let lt = t.to_lowercase(); lt.contains("land") || lt.contains("token") })
                .unwrap_or(false);
            if let Some(cost) = &mana_cost {
                if !is_land_token && !cost.is_empty() {
                    let cmc = card_db::parse_mtga_cmc(cost);
                    let bin = match cmc as usize {
                        0 => 0, 1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6, 7 => 7,
                        _ => 8,
                    };
                    entry.curve[bin] += count;
                }
            }

            if !is_opponent {
                for source_str in [color_identity, colors].into_iter().flatten() {
                    for ch in source_str.chars() {
                        if !ch.is_ascii_alphanumeric() {
                            continue;
                        }
                        match ch {
                            '1' | 'W' | 'w' => { entry.colors.insert("W".to_string()); },
                            '2' | 'U' | 'u' => { entry.colors.insert("U".to_string()); },
                            '3' | 'B' | 'b' => { entry.colors.insert("B".to_string()); },
                            '4' | 'R' | 'r' => { entry.colors.insert("R".to_string()); },
                            '5' | 'G' | 'g' => { entry.colors.insert("G".to_string()); },
                            _ => {}
                        }
                    }
                }
            } else {
                for source_str in [color_identity, colors].into_iter().flatten() {
                    for ch in source_str.chars() {
                        if !ch.is_ascii_alphanumeric() {
                            continue;
                        }
                        match ch {
                            '1' | 'W' | 'w' => { entry.opponent_colors.insert("W".to_string()); },
                            '2' | 'U' | 'u' => { entry.opponent_colors.insert("U".to_string()); },
                            '3' | 'B' | 'b' => { entry.opponent_colors.insert("B".to_string()); },
                            '4' | 'R' | 'r' => { entry.opponent_colors.insert("R".to_string()); },
                            '5' | 'G' | 'g' => { entry.opponent_colors.insert("G".to_string()); },
                            _ => {}
                        }
                    }
                }
            }
        }

        let mut result = Vec::new();
        let order = ["W", "U", "B", "R", "G"];

        for m in raw_matches {
            let agg = map.remove(&m.match_id);
            let curve = agg.as_ref().map(|a| a.curve.clone()).unwrap_or_else(|| vec![0i64; 9]);

            let mut colors_arr: Vec<String> = agg
                .as_ref()
                .map(|a| a.colors.iter().cloned().collect())
                .unwrap_or_default();
            colors_arr.sort_by_key(|c| order.iter().position(|&x| x == c).unwrap_or(99));

            let mut opponent_colors_arr: Vec<String> = agg
                .map(|a| a.opponent_colors.into_iter().collect())
                .unwrap_or_default();

            // If opponent played 0 cards (e.g. conceded during mulligans), fall back to commander's colors
            if opponent_colors_arr.is_empty() {
                if let Some(cmd_id) = m.opponent_commander_id {
                    if let Ok(Some((color_ident, cols))) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
                        "SELECT color_identity, colors FROM cards_cache WHERE grp_id = ?"
                    )
                    .bind(cmd_id as i64)
                    .fetch_optional(&self.pool)
                    .await
                    {
                        let mut set = std::collections::HashSet::new();
                        for source_str in [color_ident, cols].into_iter().flatten() {
                            for ch in source_str.chars() {
                                if !ch.is_ascii_alphanumeric() {
                                    continue;
                                }
                                match ch {
                                    '1' | 'W' | 'w' => { set.insert("W".to_string()); },
                                    '2' | 'U' | 'u' => { set.insert("U".to_string()); },
                                    '3' | 'B' | 'b' => { set.insert("B".to_string()); },
                                    '4' | 'R' | 'r' => { set.insert("R".to_string()); },
                                    '5' | 'G' | 'g' => { set.insert("G".to_string()); },
                                    _ => {}
                                }
                            }
                        }
                        opponent_colors_arr = set.into_iter().collect();
                    }
                }
            }

            opponent_colors_arr.sort_by_key(|c| order.iter().position(|&x| x == c).unwrap_or(99));

            let clean_format = parser::normalize_format(&m.format_name);

            result.push(EnrichedMatchRecord {
                match_id: m.match_id,
                timestamp: m.timestamp,
                date_str: m.date_str,
                format_name: clean_format,
                result: m.result,
                result_reason: m.result_reason,
                duration_seconds: m.duration_seconds,
                turns: m.turns,
                going_first: m.going_first,
                hero_seat_id: m.hero_seat_id,
                player_deck_name: m.player_deck_name,
                player_commander_id: m.player_commander_id,
                player_commander_name: m.player_commander_name,
                player_life_end: m.player_life_end,
                player_mulligans: m.player_mulligans,
                hero_platform: m.hero_platform,
                hero_avatar: m.hero_avatar,
                opponent_name: m.opponent_name,
                opponent_commander_id: m.opponent_commander_id,
                opponent_commander_name: m.opponent_commander_name,
                opponent_mulligans: m.opponent_mulligans,
                opponent_life_end: m.opponent_life_end,
                opponent_platform: m.opponent_platform,
                opponent_avatar: m.opponent_avatar,
                mana_curve: curve,
                deck_colors: colors_arr,
                opponent_colors: opponent_colors_arr,
            });
        }

        Ok(result)
    }

    /// Returns the exact count of match_cards rows associated with the most recent `limit` matches.
    pub async fn get_recent_match_cards_count(&self, limit: i64) -> Result<i64, Box<dyn std::error::Error>> {
        let row = sqlx::query(
            "SELECT count(*) as cnt FROM match_cards WHERE match_id IN (SELECT id FROM matches ORDER BY timestamp DESC LIMIT ?)"
        )
        .bind(limit)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.get("cnt"))
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
    /// Consolidates copies across all printings of the same card name so the total
    /// owned count is strictly equal to the chosen count.
    pub async fn set_collection_card_count(
        &self,
        grp_id: i64,
        count: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let now = chrono::Utc::now().to_rfc3339();
        let clamped = count.clamp(0, 4);

        // Find if this grp_id belongs to a named card in cards_cache
        let card_name: Option<String> = sqlx::query_scalar(
            "SELECT name FROM cards_cache WHERE grp_id = ?"
        )
        .bind(grp_id)
        .fetch_optional(&self.pool)
        .await?;

        if clamped == 0 {
            if let Some(ref name) = card_name {
                sqlx::query(
                    r#"
                    DELETE FROM collection_cards 
                    WHERE grp_id = ? OR grp_id IN (SELECT grp_id FROM cards_cache WHERE name = ?)
                    "#
                )
                .bind(grp_id)
                .bind(name)
                .execute(&self.pool)
                .await?;
            } else {
                sqlx::query("DELETE FROM collection_cards WHERE grp_id = ?")
                    .bind(grp_id)
                    .execute(&self.pool)
                    .await?;
            }
        } else {
            // If other printings exist with the same name, remove them from collection_cards
            // so the total owned count for this card name is strictly clamped to the chosen value.
            if let Some(ref name) = card_name {
                sqlx::query(
                    r#"
                    DELETE FROM collection_cards 
                    WHERE grp_id != ? AND grp_id IN (SELECT grp_id FROM cards_cache WHERE name = ?)
                    "#
                )
                .bind(grp_id)
                .bind(name)
                .execute(&self.pool)
                .await?;
            }

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

    /// Retrieve the dashboard layout from SQLite. If missing, corrupt, or invalid,
    /// falls back to saving and returning the default 6-widget layout.
    pub async fn get_dashboard_layout(&self, layout_id: &str) -> Result<DashboardLayoutPayload, Box<dyn std::error::Error + Send + Sync>> {
        let row = sqlx::query("SELECT schema_version, layout_json FROM dashboard_layouts WHERE id = ?")
            .bind(layout_id)
            .fetch_optional(&self.pool)
            .await?;

        if let Some(r) = row {
            let version: i64 = r.get("schema_version");
            let json_str: String = r.get("layout_json");
            if let Ok(mut payload) = serde_json::from_str::<DashboardLayoutPayload>(&json_str) {
                payload.schema_version = version as u32;
                if validate_layout(&payload).is_ok() {
                    return Ok(payload);
                }
            }
        }

        // Fresh install / missing / invalid data: save & return default layout
        let default_layout = default_dashboard_layout();
        let _ = self.save_dashboard_layout(layout_id, &default_layout).await;
        Ok(default_layout)
    }

    /// Persist a dashboard layout into SQLite after validating widget kinds & dimensions.
    pub async fn save_dashboard_layout(&self, layout_id: &str, layout: &DashboardLayoutPayload) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        validate_layout(layout).map_err(|e| Box::<dyn std::error::Error + Send + Sync>::from(e))?;
        let json_str = serde_json::to_string(layout)?;
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO dashboard_layouts (id, schema_version, layout_json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                schema_version = excluded.schema_version,
                layout_json = excluded.layout_json,
                updated_at = excluded.updated_at
            "#
        )
        .bind(layout_id)
        .bind(layout.schema_version as i64)
        .bind(json_str)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Reset a dashboard layout to the default 6-widget layout and persist it.
    pub async fn reset_dashboard_layout(&self, layout_id: &str) -> Result<DashboardLayoutPayload, Box<dyn std::error::Error + Send + Sync>> {
        let default_layout = default_dashboard_layout();
        self.save_dashboard_layout(layout_id, &default_layout).await?;
        Ok(default_layout)
    }

    /// Retrieve all preferred card printings as a map of card_name -> (set_code, collector_number, grp_id).
    pub async fn get_preferred_prints(&self) -> Result<std::collections::HashMap<String, (String, String, Option<i64>)>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query_as::<_, (String, String, String, Option<i64>)>(
            "SELECT card_name, set_code, collector_number, grp_id FROM card_preferred_prints"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut map = std::collections::HashMap::new();
        for (name, set_code, collector_number, grp_id) in rows {
            map.insert(name, (set_code, collector_number, grp_id));
        }
        Ok(map)
    }

    /// Set or update the preferred printing for a card.
    pub async fn set_preferred_print(
        &self,
        card_name: &str,
        set_code: &str,
        collector_number: &str,
        grp_id: Option<i64>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO card_preferred_prints (card_name, set_code, collector_number, grp_id, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(card_name) DO UPDATE SET
                set_code = excluded.set_code,
                collector_number = excluded.collector_number,
                grp_id = excluded.grp_id,
                updated_at = excluded.updated_at
            "#
        )
        .bind(card_name)
        .bind(set_code)
        .bind(collector_number)
        .bind(grp_id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Clear the preferred printing for a card (reverting to default print).
    pub async fn clear_preferred_print(&self, card_name: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query("DELETE FROM card_preferred_prints WHERE card_name = ?")
            .bind(card_name)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Record an earned deck achievement (idempotent, upgrades tier).
    pub async fn record_deck_achievement(
        &self,
        deck_name: &str,
        achievement_id: &str,
        tier: &str,
        match_id: Option<&str>,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        let res = sqlx::query(
            r#"
            INSERT INTO deck_achievements (deck_name, achievement_id, tier, achieved_at, match_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(deck_name, achievement_id, tier) DO NOTHING
            "#
        )
        .bind(deck_name)
        .bind(achievement_id)
        .bind(tier)
        .bind(&now)
        .bind(match_id)
        .execute(&self.pool)
        .await?;

        Ok(res.rows_affected() > 0)
    }

    /// Get all deck achievements for a specific deck.
    pub async fn get_deck_achievements(
        &self,
        deck_name: &str,
    ) -> Result<Vec<(String, String, String, Option<String>)>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query_as::<_, (String, String, String, Option<String>)>(
            r#"
            SELECT achievement_id, tier, achieved_at, match_id
            FROM deck_achievements
            WHERE deck_name = ?
            ORDER BY achieved_at DESC
            "#
        )
        .bind(deck_name)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Get all deck achievements globally across all decks.
    pub async fn get_all_deck_achievements(
        &self,
    ) -> Result<Vec<(String, String, String, String, Option<String>)>, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>)>(
            r#"
            SELECT deck_name, achievement_id, tier, achieved_at, match_id
            FROM deck_achievements
            ORDER BY achieved_at DESC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    /// Record a player economy snapshot into `player_economy_snapshots`.
    /// Performs smart deduplication: if the latest stored snapshot has identical
    /// values for all currency, wildcard, and token fields, the insertion is skipped.
    /// Returns `Ok(true)` if a new row was inserted, or `Ok(false)` if skipped.
    pub async fn record_economy_snapshot(
        &self,
        snapshot: &parser::PlayerEconomyRecord,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let boosters_json_str = serde_json::to_string(&snapshot.boosters)?;

        // Fetch latest row to compare
        let latest = sqlx::query(
            r#"
            SELECT gold, gems, vault_progress_tenths, wc_track_pos,
                   wc_common, wc_uncommon, wc_rare, wc_mythic,
                   draft_tokens, jump_in_tokens, golden_pack_progress,
                   boosters_json
            FROM player_economy_snapshots
            ORDER BY id DESC LIMIT 1
            "#
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(r) = latest {
            let gold: i64 = r.get("gold");
            let gems: i64 = r.get("gems");
            let vault: i64 = r.get("vault_progress_tenths");
            let wc_track: i64 = r.get("wc_track_pos");
            let wc_c: i64 = r.get("wc_common");
            let wc_u: i64 = r.get("wc_uncommon");
            let wc_r: i64 = r.get("wc_rare");
            let wc_m: i64 = r.get("wc_mythic");
            let draft: i64 = r.get("draft_tokens");
            let jump: i64 = r.get("jump_in_tokens");
            let golden: i64 = r.get("golden_pack_progress");
            let db_boosters: String = r.get("boosters_json");

            if gold == snapshot.gold as i64
                && gems == snapshot.gems as i64
                && vault == snapshot.vault_progress_tenths as i64
                && wc_track == snapshot.wc_track_pos as i64
                && wc_c == snapshot.wc_common as i64
                && wc_u == snapshot.wc_uncommon as i64
                && wc_r == snapshot.wc_rare as i64
                && wc_m == snapshot.wc_mythic as i64
                && draft == snapshot.draft_tokens as i64
                && jump == snapshot.jump_in_tokens as i64
                && golden == snapshot.golden_pack_progress as i64
                && db_boosters == boosters_json_str
            {
                return Ok(false);
            }
        }

        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO player_economy_snapshots (
                timestamp, gold, gems, vault_progress_tenths, wc_track_pos,
                wc_common, wc_uncommon, wc_rare, wc_mythic,
                draft_tokens, jump_in_tokens, golden_pack_progress, boosters_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&now)
        .bind(snapshot.gold as i64)
        .bind(snapshot.gems as i64)
        .bind(snapshot.vault_progress_tenths as i64)
        .bind(snapshot.wc_track_pos as i64)
        .bind(snapshot.wc_common as i64)
        .bind(snapshot.wc_uncommon as i64)
        .bind(snapshot.wc_rare as i64)
        .bind(snapshot.wc_mythic as i64)
        .bind(snapshot.draft_tokens as i64)
        .bind(snapshot.jump_in_tokens as i64)
        .bind(snapshot.golden_pack_progress as i64)
        .bind(&boosters_json_str)
        .execute(&self.pool)
        .await?;

        Ok(true)
    }

    /// Retrieve the most recent player economy snapshot.
    pub async fn get_latest_economy(
        &self,
    ) -> Result<Option<EconomySnapshotRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let row = sqlx::query(
            r#"
            SELECT id, timestamp, gold, gems, vault_progress_tenths, wc_track_pos,
                   wc_common, wc_uncommon, wc_rare, wc_mythic,
                   draft_tokens, jump_in_tokens, golden_pack_progress, boosters_json
            FROM player_economy_snapshots
            ORDER BY id DESC LIMIT 1
            "#
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(r) = row {
            let vault_tenths: i64 = r.get("vault_progress_tenths");
            let boosters_raw: String = r.get("boosters_json");
            let raw_boosters: Vec<crate::parser::BoosterPackItem> =
                serde_json::from_str(&boosters_raw).unwrap_or_default();

            let mut boosters = Vec::new();
            for b in raw_boosters {
                let set_name: Option<String> = if b.set_code.to_uppercase() == "GOLDEN" {
                    Some("Golden Pack".to_string())
                } else {
                    sqlx::query_scalar(
                        "SELECT name FROM sets_metadata WHERE UPPER(set_code) = UPPER(?) LIMIT 1"
                    )
                    .bind(&b.set_code)
                    .fetch_optional(&self.pool)
                    .await
                    .unwrap_or(None)
                };

                boosters.push(BoosterPackDto {
                    collation_id: b.collation_id,
                    set_code: b.set_code,
                    count: b.count,
                    set_name,
                });
            }

            Ok(Some(EconomySnapshotRecord {
                id: r.get("id"),
                timestamp: r.get("timestamp"),
                gold: r.get::<i64, _>("gold") as u32,
                gems: r.get::<i64, _>("gems") as u32,
                vault_progress_tenths: vault_tenths as u32,
                vault_progress_pct: (vault_tenths as f64) / 10.0,
                wc_track_pos: r.get::<i64, _>("wc_track_pos") as u32,
                wc_common: r.get::<i64, _>("wc_common") as u32,
                wc_uncommon: r.get::<i64, _>("wc_uncommon") as u32,
                wc_rare: r.get::<i64, _>("wc_rare") as u32,
                wc_mythic: r.get::<i64, _>("wc_mythic") as u32,
                draft_tokens: r.get::<i64, _>("draft_tokens") as u32,
                jump_in_tokens: r.get::<i64, _>("jump_in_tokens") as u32,
                golden_pack_progress: r.get::<i64, _>("golden_pack_progress") as u32,
                boosters,
            }))
        } else {
            Ok(None)
        }
    }

    /// Retrieve historical player economy snapshots (ordered newest to oldest).
    pub async fn get_economy_history(
        &self,
        limit: i64,
    ) -> Result<Vec<EconomySnapshotRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let limit = if limit <= 0 { 50 } else { limit.min(500) };
        let rows = sqlx::query(
            r#"
            SELECT id, timestamp, gold, gems, vault_progress_tenths, wc_track_pos,
                   wc_common, wc_uncommon, wc_rare, wc_mythic,
                   draft_tokens, jump_in_tokens, golden_pack_progress, boosters_json
            FROM player_economy_snapshots
            ORDER BY id DESC LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut list = Vec::new();
        for r in rows {
            let vault_tenths: i64 = r.get("vault_progress_tenths");
            let boosters_raw: String = r.get("boosters_json");
            let raw_boosters: Vec<crate::parser::BoosterPackItem> =
                serde_json::from_str(&boosters_raw).unwrap_or_default();

            let mut boosters = Vec::new();
            for b in raw_boosters {
                let set_name: Option<String> = if b.set_code.to_uppercase() == "GOLDEN" {
                    Some("Golden Pack".to_string())
                } else {
                    sqlx::query_scalar(
                        "SELECT name FROM sets_metadata WHERE UPPER(set_code) = UPPER(?) LIMIT 1"
                    )
                    .bind(&b.set_code)
                    .fetch_optional(&self.pool)
                    .await
                    .unwrap_or(None)
                };

                boosters.push(BoosterPackDto {
                    collation_id: b.collation_id,
                    set_code: b.set_code,
                    count: b.count,
                    set_name,
                });
            }

            list.push(EconomySnapshotRecord {
                id: r.get("id"),
                timestamp: r.get("timestamp"),
                gold: r.get::<i64, _>("gold") as u32,
                gems: r.get::<i64, _>("gems") as u32,
                vault_progress_tenths: vault_tenths as u32,
                vault_progress_pct: (vault_tenths as f64) / 10.0,
                wc_track_pos: r.get::<i64, _>("wc_track_pos") as u32,
                wc_common: r.get::<i64, _>("wc_common") as u32,
                wc_uncommon: r.get::<i64, _>("wc_uncommon") as u32,
                wc_rare: r.get::<i64, _>("wc_rare") as u32,
                wc_mythic: r.get::<i64, _>("wc_mythic") as u32,
                draft_tokens: r.get::<i64, _>("draft_tokens") as u32,
                jump_in_tokens: r.get::<i64, _>("jump_in_tokens") as u32,
                golden_pack_progress: r.get::<i64, _>("golden_pack_progress") as u32,
                boosters,
            });
        }
        Ok(list)
    }

    /// Record a booster opening event and register cards into collection_cards.
    pub async fn record_booster_opening(
        &self,
        booster: &parser::BoosterOpeningRecord,
    ) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        let cards_json = serde_json::to_string(&booster.cards_added)?;
        let wildcards_json = serde_json::to_string(&booster.wildcards)?;

        let res = sqlx::query(
            r#"
            INSERT INTO player_booster_openings (timestamp, pack_id, cards_json, wildcards_json, vault_delta)
            VALUES (?, ?, ?, ?, ?)
            "#
        )
        .bind(&now)
        .bind(&booster.pack_id)
        .bind(&cards_json)
        .bind(&wildcards_json)
        .bind(booster.vault_progress_delta)
        .execute(&self.pool)
        .await?;

        let inserted_id = res.last_insert_rowid();

        // Register opened cards into collection_cards
        for &grp_id in &booster.cards_added {
            let _ = self.add_collection_booster_card(grp_id as i64).await;
        }

        Ok(inserted_id)
    }

    /// Replace the whole collection with an authoritative snapshot read from the
    /// client. Every row not in the snapshot drops to 0 — including 'manual'
    /// overrides, which only existed to correct the log-based guess. `draw_seen`
    /// is match history, not ownership, so it is kept.
    pub async fn replace_collection_from_inventory(
        &self,
        cards: &[(i64, i64)],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "UPDATE collection_cards SET owned_count = 0, provenance = 'inventory', last_updated_at = ? WHERE owned_count > 0",
        )
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        for &(grp_id, count) in cards {
            sqlx::query(
                r#"
                INSERT INTO collection_cards (grp_id, owned_count, provenance, first_seen_at, last_updated_at, draw_seen)
                VALUES (?, ?, 'inventory', ?, ?, 0)
                ON CONFLICT(grp_id) DO UPDATE SET
                    owned_count = excluded.owned_count,
                    provenance = 'inventory',
                    last_updated_at = excluded.last_updated_at
                "#,
            )
            .bind(grp_id)
            .bind(count.clamp(0, 4))
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// Add a card obtained from a booster pack to `collection_cards`.
    /// Monotonic non-decreasing, capped at 4 (a playset).
    pub async fn add_collection_booster_card(
        &self,
        grp_id: i64,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO collection_cards (grp_id, owned_count, provenance, first_seen_at, last_updated_at, draw_seen)
            VALUES (?, 1, 'booster', ?, ?, 0)
            ON CONFLICT(grp_id) DO UPDATE SET
                owned_count = MIN(4, owned_count + 1),
                provenance = CASE WHEN owned_count = 0 THEN 'booster' ELSE provenance END,
                last_updated_at = excluded.last_updated_at
            "#
        )
        .bind(grp_id)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Retrieve recent booster pack openings.
    pub async fn get_recent_booster_openings(
        &self,
        limit: i64,
    ) -> Result<Vec<BoosterOpeningDbRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let limit = if limit <= 0 { 50 } else { limit.min(500) };
        let rows = sqlx::query(
            r#"
            SELECT id, timestamp, pack_id, cards_json, wildcards_json, vault_delta
            FROM player_booster_openings
            ORDER BY id DESC LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut list = Vec::new();
        for r in rows {
            let cards_str: String = r.get("cards_json");
            let wildcards_str: Option<String> = r.get("wildcards_json");
            let cards: Vec<u32> = serde_json::from_str(&cards_str).unwrap_or_default();
            let wildcards: std::collections::HashMap<String, u32> = wildcards_str
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            list.push(BoosterOpeningDbRecord {
                id: r.get("id"),
                timestamp: r.get("timestamp"),
                pack_id: r.get("pack_id"),
                cards,
                wildcards,
                vault_delta: r.get("vault_delta"),
            });
        }
        Ok(list)
    }

    /// Record or update daily quests from `QuestGetQuests`.
    /// Performs lifecycle state transitions (active -> completed, active -> swapped).
    pub async fn record_quests_update(
        &self,
        raw_quests: &[crate::parser::RawQuestData],
        incoming_can_swap: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        let mut newly_inserted_quests: Vec<(String, String, u32, u32, String)> = Vec::new();

        // 1. Upsert / update each received quest
        for raw in raw_quests {
            let resolved = crate::quest_catalog::resolve_quest(&raw.loc_key, raw.goal);
            let colors_json = serde_json::to_string(&resolved.colors).unwrap_or_else(|_| "[]".to_string());

            let existing = sqlx::query(
                "SELECT first_seen_at, status, current_progress, goal FROM player_quests WHERE quest_id = ?"
            )
            .bind(&raw.quest_id)
            .fetch_optional(&self.pool)
            .await?;

            if let Some(row) = existing {
                let first_seen: String = row.get("first_seen_at");
                let prev_status: String = row.get("status");

                let is_completed = raw.ending_progress >= raw.goal;
                // Game client is authoritative: if ending_progress < goal, it MUST be active!
                let new_status = if is_completed {
                    "completed"
                } else {
                    "active"
                };

                let (completed_at, duration_sec) = if is_completed && prev_status != "completed" {
                    let duration = chrono::DateTime::parse_from_rfc3339(&now)
                        .ok()
                        .and_then(|now_dt| {
                            chrono::DateTime::parse_from_rfc3339(&first_seen)
                                .ok()
                                .map(|fs| (now_dt - fs).num_seconds())
                        });
                    (Some(now.clone()), duration)
                } else if !is_completed {
                    // Reset completed_at and duration if reactivated / in-progress
                    (None, None)
                } else {
                    (row.get("completed_at"), row.get("duration_seconds"))
                };

                sqlx::query(
                    r#"
                    UPDATE player_quests
                    SET current_progress = ?, can_swap = ?, status = ?, last_seen_at = ?,
                        completed_at = ?, duration_seconds = ?
                    WHERE quest_id = ?
                    "#
                )
                .bind(raw.ending_progress as i64)
                .bind(raw.can_swap)
                .bind(new_status)
                .bind(&now)
                .bind(completed_at)
                .bind(duration_sec)
                .bind(&raw.quest_id)
                .execute(&self.pool)
                .await?;
            } else {
                let is_completed = raw.ending_progress >= raw.goal;
                let status = if is_completed { "completed" } else { "active" };
                let completed_at = if is_completed { Some(now.clone()) } else { None };
                let duration_sec = if is_completed { Some(0i64) } else { None };

                newly_inserted_quests.push((
                    raw.quest_id.clone(),
                    resolved.title.clone(),
                    raw.reward_gold,
                    raw.reward_xp,
                    resolved.category.clone(),
                ));

                sqlx::query(
                    r#"
                    INSERT INTO player_quests (
                        quest_id, loc_key, title, description, category, colors,
                        goal, current_progress, starting_progress, reward_gold, reward_xp,
                        can_swap, status, first_seen_at, last_seen_at, completed_at, duration_seconds,
                        matches_played_during
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    "#
                )
                .bind(&raw.quest_id)
                .bind(&raw.loc_key)
                .bind(&resolved.title)
                .bind(&resolved.description)
                .bind(&resolved.category)
                .bind(&colors_json)
                .bind(raw.goal as i64)
                .bind(raw.ending_progress as i64)
                .bind(raw.starting_progress as i64)
                .bind(raw.reward_gold as i64)
                .bind(raw.reward_xp as i64)
                .bind(raw.can_swap)
                .bind(status)
                .bind(&now)
                .bind(&now)
                .bind(completed_at)
                .bind(duration_sec)
                .execute(&self.pool)
                .await?;
            }
        }

        // 2. Detect missing active quests (completed or swapped away).
        // Authoritative QuestGetQuests update: any previously active quest not present in incoming_ids
        // has ended. If quests were present and swap happened, it is swapped; otherwise completed.
        let mut swapped_quests: Vec<(String, String, u32, u32, String)> = Vec::new();
        let incoming_ids: Vec<String> = raw_quests.iter().map(|q| q.quest_id.clone()).collect();
        let active_rows = sqlx::query(
            "SELECT quest_id, title, reward_gold, reward_xp, category, first_seen_at, can_swap, current_progress, goal FROM player_quests WHERE status = 'active'"
        )
        .fetch_all(&self.pool)
        .await?;

        for row in active_rows {
            let qid: String = row.get("quest_id");
            if !incoming_ids.contains(&qid) {
                let first_seen: String = row.get("first_seen_at");
                let had_can_swap: bool = row.get("can_swap");
                let progress: i64 = row.get("current_progress");
                let goal: i64 = row.get("goal");

                let duration = chrono::DateTime::parse_from_rfc3339(&now)
                    .ok()
                    .and_then(|now_dt| {
                        chrono::DateTime::parse_from_rfc3339(&first_seen)
                            .ok()
                            .map(|fs| (now_dt - fs).num_seconds())
                    });

                // If the player had swap available, and now doesn't, progress wasn't finished,
                // AND new quests were received to replace it, it was swapped!
                let is_swap = !raw_quests.is_empty() && had_can_swap && !incoming_can_swap && progress < goal;
                let final_status = if is_swap {
                    swapped_quests.push((
                        qid.clone(),
                        row.get::<String, _>("title"),
                        row.get::<i64, _>("reward_gold") as u32,
                        row.get::<i64, _>("reward_xp") as u32,
                        row.get::<String, _>("category"),
                    ));
                    "swapped"
                } else {
                    "completed"
                };

                let _ = sqlx::query(
                    r#"
                    UPDATE player_quests
                    SET status = ?, completed_at = ?, duration_seconds = ?, last_seen_at = ?
                    WHERE quest_id = ?
                    "#
                )
                .bind(final_status)
                .bind(&now)
                .bind(duration)
                .bind(&now)
                .bind(&qid)
                .execute(&self.pool)
                .await;
            }
        }

        // 3. Record quest reroll audit event if any quest was swapped and replaced
        if !swapped_quests.is_empty() {
            for (idx, old_q) in swapped_quests.into_iter().enumerate() {
                if let Some(new_q) = newly_inserted_quests.get(idx) {
                    let gold_diff = (new_q.2 as i64) - (old_q.2 as i64);
                    let is_upgrade = gold_diff > 0;

                    let _ = sqlx::query(
                        r#"
                        INSERT OR IGNORE INTO player_quest_rerolls (
                            rerolled_at, old_quest_id, old_title, old_reward_gold, old_reward_xp, old_category,
                            new_quest_id, new_title, new_reward_gold, new_reward_xp, new_category,
                            gold_diff, is_upgrade
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        "#
                    )
                    .bind(&now)
                    .bind(&old_q.0)
                    .bind(&old_q.1)
                    .bind(old_q.2 as i64)
                    .bind(old_q.3 as i64)
                    .bind(&old_q.4)
                    .bind(&new_q.0)
                    .bind(&new_q.1)
                    .bind(new_q.2 as i64)
                    .bind(new_q.3 as i64)
                    .bind(&new_q.4)
                    .bind(gold_diff)
                    .bind(is_upgrade)
                    .execute(&self.pool)
                    .await;

                    println!(
                        "[EVENT: QUEST_REROLL] Rerolled '{}' ({}g) -> '{}' ({}g) [gold diff: {:+}]",
                        old_q.1, old_q.2, new_q.1, new_q.2, gold_diff
                    );
                }
            }
        }

        Ok(())
    }

    /// Increments matches_played_during for all currently active quests upon match completion.
    pub async fn increment_active_quests_match_count(
        &self,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query(
            "UPDATE player_quests SET matches_played_during = matches_played_during + 1 WHERE status = 'active'"
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Updates periodic reward tracks UTC reset timestamps and authoritative win counts from `PeriodicRewardsGetStatus` or `StartHook`.
    pub async fn record_reward_tracks_update(
        &self,
        daily_reset: &str,
        weekly_reset: &str,
        daily_wins: Option<u32>,
        weekly_wins: Option<u32>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();
        match (daily_wins, weekly_wins) {
            (Some(dw), Some(ww)) => {
                sqlx::query(
                    r#"
                    INSERT INTO player_reward_tracks (id, daily_reset_timestamp, weekly_reset_timestamp, daily_wins, weekly_wins, updated_at)
                    VALUES (1, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        daily_reset_timestamp = excluded.daily_reset_timestamp,
                        weekly_reset_timestamp = excluded.weekly_reset_timestamp,
                        daily_wins = excluded.daily_wins,
                        weekly_wins = excluded.weekly_wins,
                        updated_at = excluded.updated_at
                    "#
                )
                .bind(daily_reset)
                .bind(weekly_reset)
                .bind(dw as i64)
                .bind(ww as i64)
                .bind(&now)
                .execute(&self.pool)
                .await?;
            }
            _ => {
                sqlx::query(
                    r#"
                    INSERT INTO player_reward_tracks (id, daily_reset_timestamp, weekly_reset_timestamp, daily_wins, weekly_wins, updated_at)
                    VALUES (1, ?, ?, 0, 0, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        daily_reset_timestamp = excluded.daily_reset_timestamp,
                        weekly_reset_timestamp = excluded.weekly_reset_timestamp,
                        updated_at = excluded.updated_at
                    "#
                )
                .bind(daily_reset)
                .bind(weekly_reset)
                .bind(&now)
                .execute(&self.pool)
                .await?;
            }
        }
        Ok(())
    }

    /// Retrieve active and recent completed player quests (filling up to 3 MTGA objective slots).
    pub async fn get_active_quests(
        &self,
    ) -> Result<ActiveQuestsResponse, Box<dyn std::error::Error + Send + Sync>> {
        let rows = sqlx::query(
            r#"
            SELECT quest_id, loc_key, title, description, category, colors,
                   goal, current_progress, starting_progress, reward_gold, reward_xp,
                   can_swap, status, first_seen_at, last_seen_at, completed_at,
                   duration_seconds, matches_played_during
            FROM (
                SELECT quest_id, loc_key, title, description, category, colors,
                       goal, current_progress, starting_progress, reward_gold, reward_xp,
                       can_swap, status, first_seen_at, last_seen_at, completed_at,
                       duration_seconds, matches_played_during,
                       0 as sort_prio,
                       first_seen_at as sort_time
                FROM player_quests
                WHERE status = 'active'
                UNION ALL
                SELECT quest_id, loc_key, title, description, category, colors,
                       goal, current_progress, starting_progress, reward_gold, reward_xp,
                       can_swap, status, first_seen_at, last_seen_at, completed_at,
                       duration_seconds, matches_played_during,
                       1 as sort_prio,
                       COALESCE(completed_at, last_seen_at) as sort_time
                FROM player_quests
                WHERE status = 'completed'
            )
            ORDER BY sort_prio ASC, sort_time DESC
            LIMIT 3
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut quests = Vec::new();
        let mut overall_can_swap = false;

        for r in rows {
            let colors_str: String = r.get("colors");
            let colors: Vec<String> = serde_json::from_str(&colors_str).unwrap_or_default();
            let can_swap: bool = r.get("can_swap");
            let status: String = r.get("status");
            // Only active quests allow rerolling/swapping
            if can_swap && status == "active" {
                overall_can_swap = true;
            }

            quests.push(QuestRecord {
                quest_id: r.get("quest_id"),
                loc_key: r.get("loc_key"),
                title: r.get("title"),
                description: r.get("description"),
                category: r.get("category"),
                colors,
                goal: r.get::<i64, _>("goal") as u32,
                current_progress: r.get::<i64, _>("current_progress") as u32,
                starting_progress: r.get::<i64, _>("starting_progress") as u32,
                reward_gold: r.get::<i64, _>("reward_gold") as u32,
                reward_xp: r.get::<i64, _>("reward_xp") as u32,
                can_swap,
                status,
                first_seen_at: r.get("first_seen_at"),
                last_seen_at: r.get("last_seen_at"),
                completed_at: r.get("completed_at"),
                duration_seconds: r.get("duration_seconds"),
                matches_played_during: r.get::<i64, _>("matches_played_during") as u32,
            });
        }

        let reroll_stats = self.get_quest_reroll_stats().await.unwrap_or_default();

        Ok(ActiveQuestsResponse {
            quests,
            can_swap: overall_can_swap,
            reroll_stats,
        })
    }

    /// Retrieve daily quest reroll and upgrade statistics.
    pub async fn get_quest_reroll_stats(
        &self,
    ) -> Result<QuestRerollStats, Box<dyn std::error::Error + Send + Sync>> {
        let total_rerolls: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quest_rerolls")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let upgrade_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quest_rerolls WHERE is_upgrade = 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let same_tier_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quest_rerolls WHERE gold_diff = 0")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let downgrade_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quest_rerolls WHERE gold_diff < 0")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let net_bonus_gold: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(gold_diff), 0) FROM player_quest_rerolls")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let rerolled_500: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quest_rerolls WHERE old_reward_gold <= 500")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let upgrade_rate_pct = if rerolled_500 > 0 {
            ((upgrade_count as f64) / (rerolled_500 as f64)) * 100.0
        } else if total_rerolls > 0 {
            ((upgrade_count as f64) / (total_rerolls as f64)) * 100.0
        } else {
            0.0
        };

        let latest_row = sqlx::query(
            r#"
            SELECT id, rerolled_at, old_quest_id, old_title, old_reward_gold, old_reward_xp, old_category,
                   new_quest_id, new_title, new_reward_gold, new_reward_xp, new_category,
                   gold_diff, is_upgrade
            FROM player_quest_rerolls
            ORDER BY rerolled_at DESC, id DESC
            LIMIT 1
            "#
        )
        .fetch_optional(&self.pool)
        .await?;

        let latest_reroll = latest_row.map(|r| QuestRerollEvent {
            id: r.get("id"),
            rerolled_at: r.get("rerolled_at"),
            old_quest_id: r.get("old_quest_id"),
            old_title: r.get("old_title"),
            old_reward_gold: r.get::<i64, _>("old_reward_gold") as u32,
            old_reward_xp: r.get::<i64, _>("old_reward_xp") as u32,
            old_category: r.get("old_category"),
            new_quest_id: r.get("new_quest_id"),
            new_title: r.get("new_title"),
            new_reward_gold: r.get::<i64, _>("new_reward_gold") as u32,
            new_reward_xp: r.get::<i64, _>("new_reward_xp") as u32,
            new_category: r.get("new_category"),
            gold_diff: r.get::<i64, _>("gold_diff") as i32,
            is_upgrade: r.get::<bool, _>("is_upgrade"),
        });

        let recent_rows = sqlx::query(
            r#"
            SELECT id, rerolled_at, old_quest_id, old_title, old_reward_gold, old_reward_xp, old_category,
                   new_quest_id, new_title, new_reward_gold, new_reward_xp, new_category,
                   gold_diff, is_upgrade
            FROM player_quest_rerolls
            ORDER BY rerolled_at DESC, id DESC
            LIMIT 10
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let recent_rerolls = recent_rows.into_iter().map(|r| QuestRerollEvent {
            id: r.get("id"),
            rerolled_at: r.get("rerolled_at"),
            old_quest_id: r.get("old_quest_id"),
            old_title: r.get("old_title"),
            old_reward_gold: r.get::<i64, _>("old_reward_gold") as u32,
            old_reward_xp: r.get::<i64, _>("old_reward_xp") as u32,
            old_category: r.get("old_category"),
            new_quest_id: r.get("new_quest_id"),
            new_title: r.get("new_title"),
            new_reward_gold: r.get::<i64, _>("new_reward_gold") as u32,
            new_reward_xp: r.get::<i64, _>("new_reward_xp") as u32,
            new_category: r.get("new_category"),
            gold_diff: r.get::<i64, _>("gold_diff") as i32,
            is_upgrade: r.get::<bool, _>("is_upgrade"),
        }).collect();

        Ok(QuestRerollStats {
            total_rerolls: total_rerolls as u32,
            upgrade_count: upgrade_count as u32,
            same_tier_count: same_tier_count as u32,
            downgrade_count: downgrade_count as u32,
            upgrade_rate_pct: (upgrade_rate_pct * 10.0).round() / 10.0,
            net_bonus_gold,
            latest_reroll,
            recent_rerolls,
        })
    }

    /// Retrieve full quest probability and completion statistics.
    pub async fn get_quest_statistics(
        &self,
    ) -> Result<QuestStatistics, Box<dyn std::error::Error + Send + Sync>> {
        let total_quests: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quests")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let gold_500: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quests WHERE reward_gold <= 500")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let gold_750: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM player_quests WHERE reward_gold >= 750")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);

        let total_u32 = total_quests as u32;
        let g500_u32 = gold_500 as u32;
        let g750_u32 = gold_750 as u32;

        let gold_500_pct = if total_u32 > 0 { (g500_u32 as f64 / total_u32 as f64) * 100.0 } else { 0.0 };
        let gold_750_pct = if total_u32 > 0 { (g750_u32 as f64 / total_u32 as f64) * 100.0 } else { 0.0 };

        // Category breakdown
        let cat_rows = sqlx::query(
            "SELECT category, COUNT(*) as c FROM player_quests GROUP BY category ORDER BY c DESC"
        )
        .fetch_all(&self.pool)
        .await?;

        let mut category_distribution = Vec::new();
        for r in cat_rows {
            let cat: String = r.get("category");
            let count: i64 = r.get("c");
            let pct = if total_u32 > 0 { (count as f64 / total_u32 as f64) * 100.0 } else { 0.0 };
            category_distribution.push(CategoryStat {
                category: cat,
                count: count as u32,
                percentage: (pct * 10.0).round() / 10.0,
            });
        }

        // Color / Guild breakdown
        let guild_names = [
            ("Azorius", vec!["W", "U"]),
            ("Boros", vec!["W", "R"]),
            ("Dimir", vec!["U", "B"]),
            ("Golgari", vec!["B", "G"]),
            ("Gruul", vec!["R", "G"]),
            ("Izzet", vec!["U", "R"]),
            ("Orzhov", vec!["W", "B"]),
            ("Rakdos", vec!["B", "R"]),
            ("Selesnya", vec!["W", "G"]),
            ("Simic", vec!["U", "G"]),
        ];

        let all_colored_quests: Vec<String> = sqlx::query_scalar(
            "SELECT colors FROM player_quests WHERE colors != '[]'"
        )
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();

        let total_colored = all_colored_quests.len() as f64;
        let mut color_distribution = Vec::new();
        for (gname, gcols) in &guild_names {
            let cols_str1 = serde_json::to_string(gcols).unwrap_or_default();
            let mut rev_cols = gcols.clone();
            rev_cols.reverse();
            let cols_str2 = serde_json::to_string(&rev_cols).unwrap_or_default();

            let count = all_colored_quests.iter().filter(|c| **c == cols_str1 || **c == cols_str2).count() as u32;
            let pct = if total_colored > 0.0 { (count as f64 / total_colored) * 100.0 } else { 0.0 };
            color_distribution.push(ColorStat {
                guild: gname.to_string(),
                colors: gcols.iter().map(|s| s.to_string()).collect(),
                count,
                percentage: (pct * 10.0).round() / 10.0,
            });
        }

        // Quest frequency table
        let freq_rows = sqlx::query(
            r#"
            SELECT title, category, reward_gold,
                   COUNT(*) as times_seen,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as times_completed,
                   AVG(CASE WHEN status = 'completed' AND duration_seconds IS NOT NULL THEN duration_seconds ELSE NULL END) as avg_duration,
                   AVG(CASE WHEN status = 'completed' THEN matches_played_during ELSE NULL END) as avg_matches
            FROM player_quests
            GROUP BY title, reward_gold
            ORDER BY times_seen DESC, title ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut quest_frequency = Vec::new();
        for r in freq_rows {
            let title: String = r.get("title");
            let category: String = r.get("category");
            let reward_gold: i64 = r.get("reward_gold");
            let times_seen: i64 = r.get("times_seen");
            let times_completed: i64 = r.get("times_completed");
            let avg_dur_sec: Option<f64> = r.get("avg_duration");
            let avg_matches: Option<f64> = r.get("avg_matches");

            quest_frequency.push(QuestFrequencyStat {
                title,
                category,
                reward_gold: reward_gold as u32,
                times_seen: times_seen as u32,
                times_completed: times_completed as u32,
                avg_duration_hours: avg_dur_sec.map(|s| ((s / 3600.0) * 10.0).round() / 10.0),
                avg_matches: avg_matches.map(|m| (m * 10.0).round() / 10.0),
            });
        }

        let overall_avg_dur_sec: Option<f64> = sqlx::query_scalar(
            "SELECT AVG(duration_seconds) FROM player_quests WHERE status = 'completed' AND duration_seconds IS NOT NULL"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(None);

        let overall_avg_matches: Option<f64> = sqlx::query_scalar(
            "SELECT AVG(matches_played_during) FROM player_quests WHERE status = 'completed'"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(None);

        let total_gold: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(reward_gold), 0) FROM player_quests WHERE status = 'completed'"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        let total_xp: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(reward_xp), 0) FROM player_quests WHERE status = 'completed'"
        )
        .fetch_one(&self.pool)
        .await
        .unwrap_or(0);

        Ok(QuestStatistics {
            total_quests_tracked: total_u32,
            gold_500_count: g500_u32,
            gold_750_count: g750_u32,
            gold_500_pct: (gold_500_pct * 10.0).round() / 10.0,
            gold_750_pct: (gold_750_pct * 10.0).round() / 10.0,
            category_distribution,
            color_distribution,
            quest_frequency,
            avg_duration_hours: overall_avg_dur_sec.map(|s| ((s / 3600.0) * 10.0).round() / 10.0),
            avg_matches_to_complete: overall_avg_matches.map(|m| (m * 10.0).round() / 10.0),
            total_gold_earned: total_gold as u64,
            total_xp_earned: total_xp as u64,
        })
    }

    /// Retrieve the current status of Daily (15) and Weekly (15) Win Tracks.
    pub async fn get_reward_tracks_status(
        &self,
    ) -> Result<RewardTracksStatus, Box<dyn std::error::Error + Send + Sync>> {
        let row = sqlx::query(
            "SELECT daily_reset_timestamp, weekly_reset_timestamp, daily_wins, weekly_wins, updated_at FROM player_reward_tracks WHERE id = 1"
        )
        .fetch_optional(&self.pool)
        .await?;

        let now = chrono::Utc::now();
        let (daily_reset_raw, weekly_reset_raw, stored_daily_wins, stored_weekly_wins, updated_at_raw) = if let Some(r) = row {
            (
                r.get::<String, _>("daily_reset_timestamp"),
                r.get::<String, _>("weekly_reset_timestamp"),
                r.get::<i64, _>("daily_wins") as u32,
                r.get::<i64, _>("weekly_wins") as u32,
                r.get::<String, _>("updated_at"),
            )
        } else {
            let today_reset = now.date_naive().and_hms_opt(9, 0, 0).unwrap().and_utc();
            let next_daily = if now > today_reset {
                today_reset + chrono::Duration::days(1)
            } else {
                today_reset
            };
            let days_until_sun = (7 - now.weekday().num_days_from_sunday()) % 7;
            let days_until_sun = if days_until_sun == 0 && now.time() >= chrono::NaiveTime::from_hms_opt(9, 0, 0).unwrap() {
                7
            } else {
                days_until_sun
            };
            let next_weekly = (now.date_naive() + chrono::Duration::days(days_until_sun as i64))
                .and_hms_opt(9, 0, 0).unwrap().and_utc();
            (next_daily.to_rfc3339(), next_weekly.to_rfc3339(), 0, 0, now.to_rfc3339())
        };

        let mut daily_reset_dt = chrono::DateTime::parse_from_rfc3339(&daily_reset_raw)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or(now);
        let daily_reset_passed = now >= daily_reset_dt;
        while daily_reset_dt <= now {
            daily_reset_dt += chrono::Duration::hours(24);
        }

        let mut weekly_reset_dt = chrono::DateTime::parse_from_rfc3339(&weekly_reset_raw)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or(now);
        let weekly_reset_passed = now >= weekly_reset_dt;
        while weekly_reset_dt <= now {
            weekly_reset_dt += chrono::Duration::days(7);
        }

        let daily_window_start = (daily_reset_dt - chrono::Duration::hours(24)).to_rfc3339();
        let weekly_window_start = (weekly_reset_dt - chrono::Duration::days(7)).to_rfc3339();

        // Use authoritative wins from MTGA's _dailyRewardSequenceId when available (stored via
        // record_reward_tracks_update). If the reset has passed since the last update, or no
        // authoritative value was recorded, fall back to counting from the matches table.
        let daily_wins: u32 = if !daily_reset_passed && stored_daily_wins > 0 {
            stored_daily_wins.min(15)
        } else {
            (sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM matches WHERE result = 'win' AND timestamp >= ? AND timestamp < ?"
            )
            .bind(&daily_window_start)
            .bind(daily_reset_dt.to_rfc3339())
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0) as u32).min(15)
        };

        let weekly_wins: u32 = if !weekly_reset_passed && stored_weekly_wins > 0 {
            stored_weekly_wins.min(15)
        } else {
            (sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM matches WHERE result = 'win' AND timestamp >= ? AND timestamp < ?"
            )
            .bind(&weekly_window_start)
            .bind(weekly_reset_dt.to_rfc3339())
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0) as u32).min(15)
        };

        let daily_configs: [(u32, u32, bool, &str); 15] = [
            (250, 25, false, "gold_xp"),
            (100, 25, false, "gold_xp"),
            (100, 25, false, "gold_xp"),
            (100, 25, false, "gold_xp"),
            (0, 25, true, "card_xp"),
            (50, 25, false, "gold_xp"),
            (0, 25, true, "card_xp"),
            (50, 25, false, "gold_xp"),
            (0, 25, true, "card_xp"),
            (50, 25, false, "gold_xp"),
            (0, 0, true, "card"),
            (25, 0, false, "gold"),
            (0, 0, true, "card"),
            (25, 0, false, "gold"),
            (0, 0, true, "card"),
        ];

        let mut daily_milestones = Vec::with_capacity(15);
        for (idx, (gold, xp, has_card, r_type)) in daily_configs.iter().enumerate() {
            daily_milestones.push(RewardMilestone {
                win_number: (idx + 1) as u32,
                reward_type: r_type.to_string(),
                gold: *gold,
                xp: *xp,
                has_card: *has_card,
            });
        }

        let mut weekly_milestones = Vec::with_capacity(15);
        for i in 1..=15 {
            weekly_milestones.push(RewardMilestone {
                win_number: i,
                reward_type: "xp".to_string(),
                gold: 0,
                xp: 250,
                has_card: false,
            });
        }

        let next_daily_reward = if daily_wins < 15 {
            Some(daily_milestones[daily_wins as usize].clone())
        } else {
            None
        };

        Ok(RewardTracksStatus {
            daily_reset_timestamp: daily_reset_dt.to_rfc3339(),
            weekly_reset_timestamp: weekly_reset_dt.to_rfc3339(),
            daily_wins,
            weekly_wins,
            daily_milestones,
            weekly_milestones,
            next_daily_reward,
        })
    }

    /// Record player rank update from `RankGetCombinedRankInfo`.
    /// Performs deduplication so identical snapshots are not redundantly written.
    pub async fn record_rank_update(
        &self,
        rank: &crate::parser::PlayerRankRecord,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();

        // 1. Check the most recent snapshot for deduplication
        let prev = sqlx::query(
            r#"
            SELECT season_ordinal, constructed_tier, constructed_level, constructed_step,
                   constructed_wins, constructed_losses, limited_tier, limited_level,
                   limited_step, limited_wins, limited_losses
            FROM player_rank_snapshots
            ORDER BY id DESC LIMIT 1
            "#
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(p) = prev {
            let p_so: i64 = p.get("season_ordinal");
            let p_ct: String = p.get("constructed_tier");
            let p_cl: i32 = p.get("constructed_level");
            let p_cs: i32 = p.get("constructed_step");
            let p_cw: i32 = p.get("constructed_wins");
            let p_c_loss: i32 = p.get("constructed_losses");
            let p_lt: String = p.get("limited_tier");
            let p_ll: i32 = p.get("limited_level");
            let p_ls: i32 = p.get("limited_step");
            let p_lw: i32 = p.get("limited_wins");
            let p_l_loss: i32 = p.get("limited_losses");

            if p_so == rank.season_ordinal
                && p_ct == rank.constructed_tier
                && p_cl == rank.constructed_level
                && p_cs == rank.constructed_step
                && p_cw == rank.constructed_wins
                && p_c_loss == rank.constructed_losses
                && p_lt == rank.limited_tier
                && p_ll == rank.limited_level
                && p_ls == rank.limited_step
                && p_lw == rank.limited_wins
                && p_l_loss == rank.limited_losses
            {
                // Identical to latest snapshot, skip inserting duplicate
                return Ok(());
            }
        }

        // Get latest season end time if available
        let season_end: Option<String> = sqlx::query_scalar(
            "SELECT season_end_time FROM player_season_info WHERE season_ordinal = ?"
        )
        .bind(rank.season_ordinal)
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None);

        sqlx::query(
            r#"
            INSERT INTO player_rank_snapshots (
                timestamp, season_ordinal, constructed_tier, constructed_level,
                constructed_step, constructed_wins, constructed_losses,
                limited_tier, limited_level, limited_step, limited_wins,
                limited_losses, season_end_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&now)
        .bind(rank.season_ordinal)
        .bind(&rank.constructed_tier)
        .bind(rank.constructed_level)
        .bind(rank.constructed_step)
        .bind(rank.constructed_wins)
        .bind(rank.constructed_losses)
        .bind(&rank.limited_tier)
        .bind(rank.limited_level)
        .bind(rank.limited_step)
        .bind(rank.limited_wins)
        .bind(rank.limited_losses)
        .bind(&season_end)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Record season schedule details from `RankGetSeasonAndRankDetails`.
    pub async fn record_season_update(
        &self,
        season: &crate::parser::SeasonDetailsRecord,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO player_season_info (season_ordinal, season_start_time, season_end_time, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(season_ordinal) DO UPDATE SET
                season_start_time = COALESCE(excluded.season_start_time, player_season_info.season_start_time),
                season_end_time = COALESCE(excluded.season_end_time, player_season_info.season_end_time),
                updated_at = excluded.updated_at
            "#
        )
        .bind(season.season_ordinal)
        .bind(&season.season_start_time)
        .bind(&season.season_end_time)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        // Also update any snapshots for this season missing season_end_time
        if let Some(ref end_time) = season.season_end_time {
            let _ = sqlx::query(
                "UPDATE player_rank_snapshots SET season_end_time = ? WHERE season_ordinal = ? AND season_end_time IS NULL"
            )
            .bind(end_time)
            .bind(season.season_ordinal)
            .execute(&self.pool)
            .await;
        }

        Ok(())
    }

    /// Retrieve the latest ranked ladder status.
    pub async fn get_latest_rank_status(
        &self,
    ) -> Result<Option<PlayerRankStatusResponse>, Box<dyn std::error::Error + Send + Sync>> {
        let row = sqlx::query(
            r#"
            SELECT s.timestamp, s.season_ordinal, s.constructed_tier, s.constructed_level,
                   s.constructed_step, s.constructed_wins, s.constructed_losses,
                   s.limited_tier, s.limited_level, s.limited_step, s.limited_wins,
                   s.limited_losses, COALESCE(s.season_end_time, info.season_end_time) as season_end_time,
                   info.season_start_time
            FROM player_rank_snapshots s
            LEFT JOIN player_season_info info ON s.season_ordinal = info.season_ordinal
            ORDER BY s.id DESC LIMIT 1
            "#
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(r) = row {
            Ok(Some(PlayerRankStatusResponse {
                season_ordinal: r.get("season_ordinal"),
                constructed_tier: r.get("constructed_tier"),
                constructed_level: r.get("constructed_level"),
                constructed_step: r.get("constructed_step"),
                constructed_wins: r.get("constructed_wins"),
                constructed_losses: r.get("constructed_losses"),
                limited_tier: r.get("limited_tier"),
                limited_level: r.get("limited_level"),
                limited_step: r.get("limited_step"),
                limited_wins: r.get("limited_wins"),
                limited_losses: r.get("limited_losses"),
                season_start_time: r.get("season_start_time"),
                season_end_time: r.get("season_end_time"),
                updated_at: r.get("timestamp"),
            }))
        } else {
            Ok(None)
        }
    }

    /// Retrieve player rank history snapshots for climb tracking.
    pub async fn get_rank_history(
        &self,
        limit: i64,
    ) -> Result<Vec<PlayerRankSnapshotDbRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let limit = if limit <= 0 { 50 } else { limit.min(500) };
        let rows = sqlx::query(
            r#"
            SELECT id, timestamp, season_ordinal, constructed_tier, constructed_level,
                   constructed_step, constructed_wins, constructed_losses,
                   limited_tier, limited_level, limited_step, limited_wins,
                   limited_losses, season_end_time
            FROM player_rank_snapshots
            ORDER BY id DESC LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        let mut list = Vec::new();
        for r in rows {
            list.push(PlayerRankSnapshotDbRecord {
                id: r.get("id"),
                timestamp: r.get("timestamp"),
                season_ordinal: r.get("season_ordinal"),
                constructed_tier: r.get("constructed_tier"),
                constructed_level: r.get("constructed_level"),
                constructed_step: r.get("constructed_step"),
                constructed_wins: r.get("constructed_wins"),
                constructed_losses: r.get("constructed_losses"),
                limited_tier: r.get("limited_tier"),
                limited_level: r.get("limited_level"),
                limited_step: r.get("limited_step"),
                limited_wins: r.get("limited_wins"),
                limited_losses: r.get("limited_losses"),
                season_end_time: r.get("season_end_time"),
            });
        }
        Ok(list)
    }

    /// Record or update the player's active mastery pass progress.
    pub async fn record_mastery_pass_update(
        &self,
        record: &crate::parser::MasteryPassRecord,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let now = chrono::Utc::now().to_rfc3339();

        let mut set_code = record.set_code.clone();
        let mut pass_id = record.pass_id.clone();

        // If set_code is generic or empty, try checking if existing row already resolved it
        if set_code.is_empty() || set_code == "CURRENT" {
            let existing_set: Option<String> = sqlx::query_scalar(
                "SELECT set_code FROM player_mastery_pass WHERE set_code != 'CURRENT' AND set_code != '' ORDER BY updated_at DESC LIMIT 1"
            )
            .fetch_optional(&self.pool)
            .await?;

            if let Some(es) = existing_set {
                set_code = es.clone();
                pass_id = format!("BattlePass_{}", es);
            }
        }

        // Resolve friendly pass name using sets_metadata
        let set_name_opt: Option<String> = sqlx::query_scalar(
            "SELECT name FROM sets_metadata WHERE UPPER(set_code) = UPPER(?) LIMIT 1"
        )
        .bind(&set_code)
        .fetch_optional(&self.pool)
        .await?;

        let pass_name = match set_name_opt {
            Some(n) => format!("{} Mastery", n),
            None => {
                if set_code.is_empty() || set_code == "CURRENT" {
                    "Mastery Pass".to_string()
                } else {
                    format!("{} Mastery", set_code)
                }
            }
        };

        let claimed_json = serde_json::to_string(&record.claimed_levels).unwrap_or_else(|_| "[]".to_string());

        sqlx::query(
            r#"
            INSERT INTO player_mastery_pass (
                pass_id, set_code, pass_name, current_level, current_xp, xp_per_level,
                is_premium, orbs, max_level, claimed_levels_json, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(pass_id) DO UPDATE SET
                set_code = excluded.set_code,
                pass_name = CASE WHEN excluded.pass_name != 'Mastery Pass' THEN excluded.pass_name ELSE player_mastery_pass.pass_name END,
                current_level = excluded.current_level,
                current_xp = excluded.current_xp,
                xp_per_level = excluded.xp_per_level,
                is_premium = CASE WHEN excluded.is_premium = 1 THEN 1 ELSE player_mastery_pass.is_premium END,
                orbs = CASE WHEN excluded.orbs > 0 THEN excluded.orbs ELSE player_mastery_pass.orbs END,
                max_level = MAX(player_mastery_pass.max_level, excluded.max_level),
                claimed_levels_json = excluded.claimed_levels_json,
                updated_at = excluded.updated_at
            "#
        )
        .bind(&pass_id)
        .bind(&set_code)
        .bind(&pass_name)
        .bind(record.current_level as i64)
        .bind(record.current_xp as i64)
        .bind(record.xp_per_level as i64)
        .bind(if record.is_premium { 1 } else { 0 })
        .bind(record.orbs as i64)
        .bind(record.max_level as i64)
        .bind(&claimed_json)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        // If we inserted a specific pass_id (e.g. BattlePass_FRA) and a stale BattlePass_CURRENT row exists,
        // merge/clean it up so we don't have duplicate or out-of-sync rows.
        if pass_id != "BattlePass_CURRENT" {
            let _ = sqlx::query("DELETE FROM player_mastery_pass WHERE pass_id = 'BattlePass_CURRENT'")
                .execute(&self.pool)
                .await;
        }

        Ok(())
    }

    /// Update mastery orb balance from inventory tokens.
    pub async fn update_mastery_orbs(
        &self,
        token_id: &str,
        count: u32,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // e.g., token_id: "BattlePass_FRA_Orb" -> set_code "FRA", pass_id "BattlePass_FRA"
        let set_code = token_id
            .strip_prefix("BattlePass_")
            .and_then(|s| s.strip_suffix("_Orb"))
            .unwrap_or("");

        if !set_code.is_empty() {
            let pass_id = format!("BattlePass_{}", set_code);

            // Fetch set name for pass_name resolution if updating generic row
            let set_name_opt: Option<String> = sqlx::query_scalar(
                "SELECT name FROM sets_metadata WHERE UPPER(set_code) = UPPER(?) LIMIT 1"
            )
            .bind(set_code)
            .fetch_optional(&self.pool)
            .await
            .unwrap_or(None);

            let pass_name = set_name_opt
                .map(|n| format!("{} Mastery", n))
                .unwrap_or_else(|| format!("{} Mastery", set_code));

            // First try updating exact match
            let rows_affected = sqlx::query(
                "UPDATE player_mastery_pass SET orbs = ? WHERE pass_id = ? OR UPPER(set_code) = UPPER(?)"
            )
            .bind(count as i64)
            .bind(&pass_id)
            .bind(set_code)
            .execute(&self.pool)
            .await?
            .rows_affected();

            // If no exact match row existed but a generic 'BattlePass_CURRENT' row is present,
            // upgrade it to the specific set pass!
            if rows_affected == 0 {
                let _ = sqlx::query(
                    r#"
                    UPDATE player_mastery_pass
                    SET pass_id = ?, set_code = ?, pass_name = ?, orbs = ?
                    WHERE pass_id = 'BattlePass_CURRENT' OR set_code = 'CURRENT'
                    "#
                )
                .bind(&pass_id)
                .bind(set_code)
                .bind(&pass_name)
                .bind(count as i64)
                .execute(&self.pool)
                .await;
            }
        }

        Ok(())
    }

    /// Retrieve the most current active mastery pass.
    pub async fn get_mastery_pass_status(
        &self,
    ) -> Result<Option<MasteryPassStatusResponse>, Box<dyn std::error::Error + Send + Sync>> {
        let row = sqlx::query(
            r#"
            SELECT pass_id, set_code, pass_name, current_level, current_xp, xp_per_level,
                   is_premium, orbs, max_level, claimed_levels_json, updated_at
            FROM player_mastery_pass
            ORDER BY updated_at DESC LIMIT 1
            "#
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(r) = row {
            let claimed_str: String = r.get("claimed_levels_json");
            let claimed_levels: Vec<u32> = serde_json::from_str(&claimed_str).unwrap_or_default();
            let is_premium_int: i64 = r.get("is_premium");

            Ok(Some(MasteryPassStatusResponse {
                pass_id: r.get("pass_id"),
                set_code: r.get("set_code"),
                pass_name: r.get("pass_name"),
                current_level: r.get::<i64, _>("current_level") as u32,
                current_xp: r.get::<i64, _>("current_xp") as u32,
                xp_per_level: r.get::<i64, _>("xp_per_level") as u32,
                is_premium: is_premium_int == 1,
                orbs: r.get::<i64, _>("orbs") as u32,
                max_level: r.get::<i64, _>("max_level") as u32,
                claimed_levels,
                updated_at: r.get("updated_at"),
            }))
        } else {
            Ok(None)
        }
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
    async fn test_manual_correction_consolidates_multi_printings() {
        let db = in_memory_db().await;
        // Insert two printings of the same card name into cards_cache
        sqlx::query("INSERT INTO cards_cache (grp_id, name, set_code, rarity, last_updated) VALUES (2001, 'Counterspell', 'MH2', 3, '2026-01-01')")
            .execute(&db.pool).await.unwrap();
        sqlx::query("INSERT INTO cards_cache (grp_id, name, set_code, rarity, last_updated) VALUES (2002, 'Counterspell', 'STA', 4, '2026-01-01')")
            .execute(&db.pool).await.unwrap();

        // Simulate existing ownership on printing 2002 (2 copies)
        db.upsert_collection_from_decklist(2002, 2).await.unwrap();
        assert_eq!(owned_count(&db, 2002).await, 2);

        // Manually set 1 copy on printing 2001 -> should clear 2002 and set 2001 to 1
        db.set_collection_card_count(2001, 1).await.unwrap();
        assert_eq!(owned_count(&db, 2001).await, 1);
        assert_eq!(owned_count(&db, 2002).await, 0);

        // Sum across both printings must be exactly 1
        let total_owned: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(owned_count), 0) FROM collection_cards WHERE grp_id IN (2001, 2002)")
            .fetch_one(&db.pool).await.unwrap();
        assert_eq!(total_owned, 1);

        // Setting to 0 removes all printings
        db.set_collection_card_count(2001, 0).await.unwrap();
        assert_eq!(owned_count(&db, 2001).await, 0);
        assert_eq!(owned_count(&db, 2002).await, 0);
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
            hero_platform: Some("Windows".to_string()),
            hero_avatar: Some("Avatar_Basic_Garruk_ELD".to_string()),
            opponent_name: Some("Opponent".to_string()),
            opponent_commander_id: None,
            opponent_commander_name: None,
            opponent_mulligans: Some(0),
            opponent_life_end: Some(0),
            opponent_platform: Some("iOS".to_string()),
            opponent_avatar: Some("Avatar_Ajani".to_string()),
            result_reason: Some("Conceded".to_string()),
            min_player_life: Some(20),
        };

        let cards = vec![
            MatchCardRecord { grp_id: 100, is_opponent: false, count: 1 },
            MatchCardRecord { grp_id: 200, is_opponent: true, count: 1 },
        ];
        let turn_events = vec![
            MatchTurnEventRecord { turn_number: 1, seat_id: 1, event_type: "draw".to_string(), grp_id: 100, instance_id: None, timestamp: "2026-08-19T12:00:01Z".to_string() },
            MatchTurnEventRecord { turn_number: 1, seat_id: 1, event_type: "play".to_string(), grp_id: 100, instance_id: None, timestamp: "2026-08-19T12:00:05Z".to_string() },
        ];
        let impactful = vec![
            MatchImpactfulRecord { grp_id: 100, seat_id: 1, total_damage: 5, max_hit: 5, max_hit_combat: 5, max_hit_spell: 0, damage_to_player: 5, damage_to_permanents: 0, damage_combat: 5, damage_spell: 0, titles: vec![], cards_drawn: 0, counters_added: 0 },
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
            hero_platform: None,
            hero_avatar: None,
            opponent_name: Some("Opponent".to_string()),
            opponent_commander_id: None,
            opponent_commander_name: None,
            opponent_mulligans: Some(0),
            opponent_life_end: Some(0),
            opponent_platform: None,
            opponent_avatar: None,
            result_reason: Some("Conceded".to_string()),
            min_player_life: Some(25),
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

    #[tokio::test]
    async fn test_dashboard_layout_fresh_fallback() {
        let db = in_memory_db().await;
        // On empty DB, get_dashboard_layout should return and persist the default 12-widget layout
        let layout = db.get_dashboard_layout("default").await.unwrap();
        assert_eq!(layout.schema_version, 1);
        assert_eq!(layout.widgets.len(), 12);
        assert_eq!(layout.widgets[0].kind, "win_rate_summary");

        // Verify it was persisted to SQLite
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dashboard_layouts WHERE id = 'default'")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn test_dashboard_layout_save_and_load() {
        let db = in_memory_db().await;
        let mut custom = default_dashboard_layout();
        custom.widgets[0].x = 2;
        custom.widgets[0].y = 3;
        custom.widgets[0].width = 6;
        custom.widgets[0].height = 2;
        custom.widgets[0].settings = serde_json::json!({ "custom_key": "custom_value" });

        db.save_dashboard_layout("default", &custom).await.unwrap();

        let loaded = db.get_dashboard_layout("default").await.unwrap();
        assert_eq!(loaded.widgets[0].x, 2);
        assert_eq!(loaded.widgets[0].y, 3);
        assert_eq!(loaded.widgets[0].width, 6);
        assert_eq!(loaded.widgets[0].height, 2);
        assert_eq!(loaded.widgets[0].settings["custom_key"], "custom_value");
    }

    #[tokio::test]
    async fn test_dashboard_layout_invalid_kind_rejected_and_fallback() {
        let db = in_memory_db().await;
        let mut invalid = default_dashboard_layout();
        invalid.widgets[0].kind = "malicious_widget_kind".to_string();

        let res = db.save_dashboard_layout("default", &invalid).await;
        assert!(res.is_err(), "Saving invalid kind must return error");

        // Manually insert corrupted raw JSON into SQLite to test corrupt fallback behavior
        sqlx::query("INSERT INTO dashboard_layouts (id, schema_version, layout_json, updated_at) VALUES ('corrupted', 1, '{\"schema_version\":1,\"widgets\":[{\"id\":\"w1\",\"kind\":\"unknown_kind\",\"x\":0,\"y\":0,\"width\":1,\"height\":1,\"settings\":{}}]}', '2026-09-02')")
            .execute(db.pool())
            .await
            .unwrap();

        let fallback = db.get_dashboard_layout("corrupted").await.unwrap();
        assert_eq!(fallback.widgets.len(), 12, "Corrupted layout must fall back to default 12-widget layout");
        assert_eq!(fallback.widgets[0].kind, "win_rate_summary");
    }

    #[tokio::test]
    async fn test_dashboard_layout_reset() {
        let db = in_memory_db().await;
        let mut custom = default_dashboard_layout();
        custom.widgets[0].width = 8;
        db.save_dashboard_layout("default", &custom).await.unwrap();

        let reset = db.reset_dashboard_layout("default").await.unwrap();
        assert_eq!(reset.widgets[0].width, 4, "Reset must restore default width");

        let loaded = db.get_dashboard_layout("default").await.unwrap();
        assert_eq!(loaded.widgets[0].width, 4);
    }

    #[tokio::test]
    async fn test_card_preferred_prints_crud() {
        let db = in_memory_db().await;
        let initial = db.get_preferred_prints().await.unwrap();
        assert!(initial.is_empty());

        db.set_preferred_print("Counterspell", "ema", "43", Some(12345)).await.unwrap();
        let prints = db.get_preferred_prints().await.unwrap();
        assert_eq!(prints.len(), 1);
        assert_eq!(prints.get("Counterspell"), Some(&("ema".to_string(), "43".to_string(), Some(12345))));

        // Update
        db.set_preferred_print("Counterspell", "dmr", "401", Some(67890)).await.unwrap();
        let updated = db.get_preferred_prints().await.unwrap();
        assert_eq!(updated.get("Counterspell"), Some(&("dmr".to_string(), "401".to_string(), Some(67890))));

        // Clear
        db.clear_preferred_print("Counterspell").await.unwrap();
        let cleared = db.get_preferred_prints().await.unwrap();
        assert!(cleared.is_empty());
    }

    #[tokio::test]
    async fn test_resolve_event_deck_name() {
        let db = in_memory_db().await;
        // Insert sample cards into cards_cache
        sqlx::query("INSERT INTO cards_cache (grp_id, name, card_type, rarity, cmc, last_updated) VALUES (1, 'Markov Purifier', 'Creature — Vampire Cleric', 3, 3, datetime('now'))")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO cards_cache (grp_id, name, card_type, rarity, cmc, last_updated) VALUES (2, 'Bloodtithe Harvester', 'Creature — Vampire Blood', 3, 2, datetime('now'))")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO cards_cache (grp_id, name, card_type, rarity, cmc, last_updated) VALUES (3, 'Swamp', 'Basic Land — Swamp', 1, 0, datetime('now'))")
            .execute(db.pool()).await.unwrap();

        let resolved = db.resolve_event_deck_name("Jump In!", &[1, 2, 3]).await;
        assert_eq!(resolved, "Jump In! (Markov Purifier / Bloodtithe Harvester)");

        let resolved_momir = db.resolve_event_deck_name("Midweek Magic (Momir)", &[1, 2, 3]).await;
        assert_eq!(resolved_momir, "Midweek Magic (Momir)");

        let resolved_momir_sub = db.resolve_event_deck_name("Momir MWM", &[]).await;
        assert_eq!(resolved_momir_sub, "Midweek Magic (Momir)");
    }

    #[tokio::test]
    async fn test_get_enriched_recent_matches_where_clause() {
        let db = in_memory_db().await;

        // Seed card cache
        sqlx::query("INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, colors, color_identity, card_type, rarity, last_updated) VALUES (101, 'Llanowar Elves', 'oG', 1, 'G', 'G', 'Creature', 1, datetime('now'))")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, colors, color_identity, card_type, rarity, last_updated) VALUES (102, 'Counterspell', 'oUoU', 2, 'U', 'U', 'Instant', 2, datetime('now'))")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, colors, color_identity, card_type, rarity, last_updated) VALUES (103, 'Lightning Bolt', 'oR', 1, 'R', 'R', 'Instant', 2, datetime('now'))")
            .execute(db.pool()).await.unwrap();

        // Seed 3 matches (match-3 is newest, match-1 is oldest)
        sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_deck_name) VALUES ('m1', '2026-01-01T10:00:00Z', '2026-01-01', 'Standard', 'win', 60, 4, 1, 'Red Deck')")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_deck_name) VALUES ('m2', '2026-01-02T10:00:00Z', '2026-01-02', 'Standard', 'loss', 120, 6, 0, 'Blue Deck')")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_deck_name) VALUES ('m3', '2026-01-03T10:00:00Z', '2026-01-03', 'Standard', 'win', 180, 5, 1, 'Green Deck')")
            .execute(db.pool()).await.unwrap();

        // Seed match cards
        sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES ('m1', 103, 0, 3)")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES ('m2', 102, 0, 2)")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES ('m3', 101, 0, 4)")
            .execute(db.pool()).await.unwrap();

        // Request only the 1 newest match (m3)
        let results = db.get_enriched_recent_matches(1).await.unwrap();
        assert_eq!(results.len(), 1);
        let m = &results[0];
        assert_eq!(m.match_id, "m3");
        assert_eq!(m.player_deck_name, "Green Deck");
        assert_eq!(m.deck_colors, vec!["G".to_string()]);
        assert_eq!(m.mana_curve[1], 4);
        assert_eq!(m.mana_curve[2], 0);

        // Request 2 newest matches (m3 and m2)
        let results_2 = db.get_enriched_recent_matches(2).await.unwrap();
        assert_eq!(results_2.len(), 2);
        assert_eq!(results_2[0].match_id, "m3");
        assert_eq!(results_2[1].match_id, "m2");
        assert_eq!(results_2[1].deck_colors, vec!["U".to_string()]);
        assert_eq!(results_2[1].mana_curve[2], 2);

        // Seed a Brawl match where opponent conceded during mulligans (0 cards played)
        // Commander is Niv-Mizzet (UR -> 'U', 'R')
        sqlx::query("INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, colors, color_identity, card_type, rarity, last_updated) VALUES (999, 'Niv-Mizzet, Parun', 'oUoUoUoRoRoR', 6, 'U,R', '4,2', 'Creature', 4, datetime('now'))")
            .execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_deck_name, opponent_commander_id) VALUES ('m4', '2026-01-04T10:00:00Z', '2026-01-04', 'Brawl', 'win', 5, 0, 1, 'My Deck', 999)")
            .execute(db.pool()).await.unwrap();

        let results_brawl = db.get_enriched_recent_matches(1).await.unwrap();
        assert_eq!(results_brawl.len(), 1);
        assert_eq!(results_brawl[0].match_id, "m4");
        assert_eq!(results_brawl[0].opponent_commander_id, Some(999));
        assert_eq!(results_brawl[0].opponent_colors, vec!["U".to_string(), "R".to_string()], "Opponent colors should fall back to commander's color identity when no cards were cast");
    }

    #[tokio::test]
    async fn test_get_recent_match_cards_scoped_not_full_table() {
        let db = in_memory_db().await;

        // Seed 5 matches with 2 cards each = 10 total match_cards
        for i in 1..=5 {
            let m_id = format!("match_{}", i);
            let ts = format!("2026-01-0{}T10:00:00Z", i);
            sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first) VALUES (?, ?, '2026-01-01', 'Brawl', 'win', 100, 5, 1)")
                .bind(&m_id).bind(&ts).execute(db.pool()).await.unwrap();

            sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES (?, 100, 0, 1)")
                .bind(&m_id).execute(db.pool()).await.unwrap();
            sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES (?, 101, 1, 1)")
                .bind(&m_id).execute(db.pool()).await.unwrap();
        }

        // Verify total rows in match_cards is 10
        let total_cards: (i64,) = sqlx::query_as("SELECT count(*) FROM match_cards")
            .fetch_one(db.pool()).await.unwrap();
        assert_eq!(total_cards.0, 10);

        // Request cards for only the 2 most recent matches
        let scoped_cards_count = db.get_recent_match_cards_count(2).await.unwrap();
        // Should return only 4 rows (2 cards * 2 matches), NOT the full table of 10
        assert_eq!(scoped_cards_count, 4);

        // Request cards for 1 match
        let scoped_1 = db.get_recent_match_cards_count(1).await.unwrap();
        assert_eq!(scoped_1, 2);
    }

    #[tokio::test]
    async fn test_economy_snapshots_and_deduplication() {
        let db = in_memory_db().await;

        let snapshot1 = parser::PlayerEconomyRecord {
            gold: 57200,
            gems: 3590,
            vault_progress_tenths: 1886,
            wc_track_pos: 5,
            wc_common: 118,
            wc_uncommon: 108,
            wc_rare: 8,
            wc_mythic: 2,
            draft_tokens: 8,
            jump_in_tokens: 2,
            golden_pack_progress: 5,
            mastery_orbs: std::collections::HashMap::new(),
            boosters: Vec::new(),
        };

        // First insert -> should succeed and return true
        let inserted1 = db.record_economy_snapshot(&snapshot1).await.unwrap();
        assert!(inserted1);

        // Identical insert -> should be deduplicated (return false)
        let inserted2 = db.record_economy_snapshot(&snapshot1).await.unwrap();
        assert!(!inserted2);

        // Verify latest snapshot
        let latest = db.get_latest_economy().await.unwrap().expect("Should have latest snapshot");
        assert_eq!(latest.gold, 57200);
        assert_eq!(latest.gems, 3590);
        assert_eq!(latest.vault_progress_tenths, 1886);
        assert_eq!(latest.vault_progress_pct, 188.6);
        assert_eq!(latest.wc_rare, 8);
        assert_eq!(latest.golden_pack_progress, 5);

        // Verify history count is 1
        let history = db.get_economy_history(10).await.unwrap();
        assert_eq!(history.len(), 1);

        // Value changes (e.g. earned 250 gold) -> should insert new snapshot
        let mut snapshot2 = snapshot1.clone();
        snapshot2.gold = 57450;
        let inserted3 = db.record_economy_snapshot(&snapshot2).await.unwrap();
        assert!(inserted3);

        let latest2 = db.get_latest_economy().await.unwrap().expect("Should have updated snapshot");
        assert_eq!(latest2.gold, 57450);

        let history2 = db.get_economy_history(10).await.unwrap();
        assert_eq!(history2.len(), 2);
        assert_eq!(history2[0].gold, 57450);
        assert_eq!(history2[1].gold, 57200);

        // Booster pack update -> should trigger snapshot and resolve set_name from sets_metadata
        sqlx::query("INSERT INTO sets_metadata (set_code, name, released_at, updated_at) VALUES ('FRA', 'Reality Fracture', '2026-10-02', 't')")
            .execute(db.pool()).await.unwrap();

        let mut snapshot3 = snapshot2.clone();
        snapshot3.boosters = vec![parser::BoosterPackItem {
            collation_id: 100063,
            set_code: "FRA".to_string(),
            count: 1,
        }];
        let inserted4 = db.record_economy_snapshot(&snapshot3).await.unwrap();
        assert!(inserted4);

        let latest3 = db.get_latest_economy().await.unwrap().expect("Should have booster snapshot");
        assert_eq!(latest3.boosters.len(), 1);
        assert_eq!(latest3.boosters[0].set_code, "FRA");
        assert_eq!(latest3.boosters[0].count, 1);
        assert_eq!(latest3.boosters[0].set_name, Some("Reality Fracture".to_string()));
    }

    #[tokio::test]
    async fn test_booster_opening_and_collection_updates() {
        let db = in_memory_db().await;

        let mut wildcards = std::collections::HashMap::new();
        wildcards.insert("Rare".to_string(), 1);

        let booster = parser::BoosterOpeningRecord {
            pack_id: Some("OTJ_Pack_01".to_string()),
            cards_added: vec![99001, 99002],
            wildcards,
            vault_progress_delta: Some(0.3),
        };

        let id = db.record_booster_opening(&booster).await.unwrap();
        assert!(id > 0);

        // Check booster openings query
        let openings = db.get_recent_booster_openings(10).await.unwrap();
        assert_eq!(openings.len(), 1);
        assert_eq!(openings[0].pack_id, Some("OTJ_Pack_01".to_string()));
        assert_eq!(openings[0].cards, vec![99001, 99002]);
        assert_eq!(openings[0].vault_delta, Some(0.3));
        assert_eq!(openings[0].wildcards.get("Rare"), Some(&1));

        // Verify cards were added to collection_cards with provenance 'booster'
        let card1: (i64, String) = sqlx::query_as("SELECT owned_count, provenance FROM collection_cards WHERE grp_id = 99001")
            .fetch_one(db.pool()).await.unwrap();
        assert_eq!(card1.0, 1);
        assert_eq!(card1.1, "booster");

        // Open another pack with the same card -> owned_count should increment to 2
        let booster2 = parser::BoosterOpeningRecord {
            pack_id: Some("OTJ_Pack_02".to_string()),
            cards_added: vec![99001],
            wildcards: std::collections::HashMap::new(),
            vault_progress_delta: None,
        };
        db.record_booster_opening(&booster2).await.unwrap();

        let card1_updated: (i64,) = sqlx::query_as("SELECT owned_count FROM collection_cards WHERE grp_id = 99001")
            .fetch_one(db.pool()).await.unwrap();
        assert_eq!(card1_updated.0, 2);
    }

    #[tokio::test]
    async fn test_record_and_get_active_quests() {
        let db = in_memory_db().await;

        let q1 = parser::RawQuestData {
            quest_id: "q-101".to_string(),
            loc_key: "Quests/Quest_Nissas_Journey".to_string(),
            goal: 25,
            starting_progress: 10,
            ending_progress: 15,
            can_swap: true,
            reward_gold: 500,
            reward_xp: 500,
        };
        let q2 = parser::RawQuestData {
            quest_id: "q-102".to_string(),
            loc_key: "Quests/Quest_Azorius_Justiciar".to_string(),
            goal: 40,
            starting_progress: 0,
            ending_progress: 5,
            can_swap: true,
            reward_gold: 750,
            reward_xp: 500,
        };

        db.record_quests_update(&[q1, q2], true).await.unwrap();

        let active = db.get_active_quests().await.unwrap();
        assert_eq!(active.quests.len(), 2);
        assert!(active.can_swap);

        let quest1 = active.quests.iter().find(|q| q.quest_id == "q-101").unwrap();
        assert_eq!(quest1.title, "Play 25 Lands");
        assert_eq!(quest1.description, "Play 25 lands.");
        assert_eq!(quest1.current_progress, 15);
        assert_eq!(quest1.reward_gold, 500);

        let quest2 = active.quests.iter().find(|q| q.quest_id == "q-102").unwrap();
        assert_eq!(quest2.title, "Cast 40 White or Blue Spells");
        assert_eq!(quest2.colors, vec!["W", "U"]);
        assert_eq!(quest2.reward_gold, 750);

        // Increment matches played while active
        db.increment_active_quests_match_count().await.unwrap();
        let active_after_match = db.get_active_quests().await.unwrap();
        assert_eq!(active_after_match.quests[0].matches_played_during, 1);
        assert_eq!(active_after_match.quests[1].matches_played_during, 1);

        // Complete q1 by reaching goal
        let q1_finished = parser::RawQuestData {
            quest_id: "q-101".to_string(),
            loc_key: "Quests/Quest_Nissas_Journey".to_string(),
            goal: 25,
            starting_progress: 15,
            ending_progress: 25,
            can_swap: false,
            reward_gold: 500,
            reward_xp: 500,
        };
        db.record_quests_update(&[q1_finished], false).await.unwrap();

        // q1 should now be completed (500g earned), q2 was swapped (0g earned)
        let stats = db.get_quest_statistics().await.unwrap();
        assert_eq!(stats.total_quests_tracked, 2);
        assert_eq!(stats.gold_500_count, 1);
        assert_eq!(stats.gold_750_count, 1);
        assert_eq!(stats.gold_500_pct, 50.0);
        assert_eq!(stats.gold_750_pct, 50.0);
        assert_eq!(stats.total_gold_earned, 500);

        let q2_row: (String,) = sqlx::query_as("SELECT status FROM player_quests WHERE quest_id = 'q-102'")
            .fetch_one(db.pool()).await.unwrap();
        assert_eq!(q2_row.0, "swapped");

        // Test resilience: Empty raw_quests update must NOT purge remaining active quests
        let q3 = parser::RawQuestData {
            quest_id: "q-103".to_string(),
            loc_key: "Quests/Quest_Boros_Reckoner".to_string(),
            goal: 20,
            starting_progress: 10,
            ending_progress: 15,
            can_swap: false,
            reward_gold: 500,
            reward_xp: 500,
        };
        db.record_quests_update(&[q3], false).await.unwrap();
        // 1 active quest (q3) + up to 2 recent completed (q1) = 2 quests returned in the 3 slots
        let res_with_q3 = db.get_active_quests().await.unwrap();
        assert_eq!(res_with_q3.quests.iter().filter(|q| q.status == "active").count(), 1);
        assert_eq!(res_with_q3.quests[0].quest_id, "q-103");
        assert_eq!(res_with_q3.quests[0].status, "active");

        // Sending an empty batch (`{"quests":[]}`) signifies all quests have been completed by the player
        db.record_quests_update(&[], false).await.unwrap();
        let res_after_empty = db.get_active_quests().await.unwrap();
        assert_eq!(res_after_empty.quests.iter().filter(|q| q.status == "active").count(), 0);
        let q3_completed = res_after_empty.quests.iter().find(|q| q.quest_id == "q-103").unwrap();
        assert_eq!(q3_completed.status, "completed");
        assert!(q3_completed.completed_at.is_some());

        // Test self-healing: If q3 was marked 'completed' in DB, incoming progress < goal MUST restore it to 'active'
        let res_when_completed = db.get_active_quests().await.unwrap();
        assert_eq!(res_when_completed.quests.iter().filter(|q| q.status == "active").count(), 0);

        // Client logs q3 with ending_progress = 19 (< 20 goal)
        let q3_reactivated = parser::RawQuestData {
            quest_id: "q-103".to_string(),
            loc_key: "Quests/Quest_Boros_Reckoner".to_string(),
            goal: 20,
            starting_progress: 15,
            ending_progress: 19,
            can_swap: false,
            reward_gold: 500,
            reward_xp: 500,
        };
        db.record_quests_update(&[q3_reactivated], false).await.unwrap();
        let restored_active = db.get_active_quests().await.unwrap();
        let restored_active_item = restored_active.quests.iter().find(|q| q.quest_id == "q-103").unwrap();
        assert_eq!(restored_active_item.status, "active");
        assert_eq!(restored_active_item.current_progress, 19);
        assert!(restored_active_item.completed_at.is_none());
        assert_eq!(restored_active.quests[0].quest_id, "q-103"); // Active quest is sorted first!
    }

    #[tokio::test]
    async fn test_quest_reroll_detection_and_analytics() {
        let db = in_memory_db().await;

        // Player starts with a 500g quest and reroll available
        let q1 = parser::RawQuestData {
            quest_id: "q-orig-500".to_string(),
            loc_key: "Quests/Quest_Nissas_Journey".to_string(),
            goal: 25,
            starting_progress: 0,
            ending_progress: 0,
            can_swap: true,
            reward_gold: 500,
            reward_xp: 500,
        };
        db.record_quests_update(&[q1], true).await.unwrap();

        let initial_active = db.get_active_quests().await.unwrap();
        assert_eq!(initial_active.quests.len(), 1);
        assert!(initial_active.can_swap);
        assert_eq!(initial_active.reroll_stats.total_rerolls, 0);

        // Player rerolls q-orig-500 -> replaced by q-upgraded-750 (can_swap now false)
        let q_upgraded = parser::RawQuestData {
            quest_id: "q-upgraded-750".to_string(),
            loc_key: "Quests/Quest_Azorius_Justiciar".to_string(),
            goal: 40,
            starting_progress: 0,
            ending_progress: 0,
            can_swap: false,
            reward_gold: 750,
            reward_xp: 500,
        };
        db.record_quests_update(&[q_upgraded], false).await.unwrap();

        // Verify active quests and reroll stats
        let active_after_reroll = db.get_active_quests().await.unwrap();
        assert_eq!(active_after_reroll.quests.len(), 1);
        assert!(!active_after_reroll.can_swap);
        assert_eq!(active_after_reroll.quests[0].quest_id, "q-upgraded-750");

        let stats = &active_after_reroll.reroll_stats;
        assert_eq!(stats.total_rerolls, 1);
        assert_eq!(stats.upgrade_count, 1);
        assert_eq!(stats.same_tier_count, 0);
        assert_eq!(stats.downgrade_count, 0);
        assert_eq!(stats.upgrade_rate_pct, 100.0);
        assert_eq!(stats.net_bonus_gold, 250);

        let latest = stats.latest_reroll.as_ref().expect("Must have latest reroll");
        assert_eq!(latest.old_quest_id, "q-orig-500");
        assert_eq!(latest.old_reward_gold, 500);
        assert_eq!(latest.new_quest_id, "q-upgraded-750");
        assert_eq!(latest.new_reward_gold, 750);
        assert_eq!(latest.gold_diff, 250);
        assert!(latest.is_upgrade);

        // Second day: player has another 500g quest and rerolls into another 500g quest (same-tier)
        let q2 = parser::RawQuestData {
            quest_id: "q-second-500".to_string(),
            loc_key: "Quests/Quest_Boros_Reckoner".to_string(),
            goal: 20,
            starting_progress: 0,
            ending_progress: 0,
            can_swap: true,
            reward_gold: 500,
            reward_xp: 500,
        };
        // Also keep q_upgraded active
        let q_upgraded_still_active = parser::RawQuestData {
            quest_id: "q-upgraded-750".to_string(),
            loc_key: "Quests/Quest_Azorius_Justiciar".to_string(),
            goal: 40,
            starting_progress: 0,
            ending_progress: 5,
            can_swap: true,
            reward_gold: 750,
            reward_xp: 500,
        };
        db.record_quests_update(&[q_upgraded_still_active.clone(), q2], true).await.unwrap();

        // Reroll q-second-500 into q-same-500
        let q_same = parser::RawQuestData {
            quest_id: "q-same-500".to_string(),
            loc_key: "Quests/Quest_Nissas_Journey".to_string(),
            goal: 25,
            starting_progress: 0,
            ending_progress: 0,
            can_swap: false,
            reward_gold: 500,
            reward_xp: 500,
        };
        let mut q_upgraded_after_swap = q_upgraded_still_active.clone();
        q_upgraded_after_swap.can_swap = false;
        db.record_quests_update(&[q_upgraded_after_swap, q_same], false).await.unwrap();

        let stats2 = db.get_quest_reroll_stats().await.unwrap();
        assert_eq!(stats2.total_rerolls, 2);
        assert_eq!(stats2.upgrade_count, 1);
        assert_eq!(stats2.same_tier_count, 1);
        assert_eq!(stats2.downgrade_count, 0);
        assert_eq!(stats2.upgrade_rate_pct, 50.0);
        assert_eq!(stats2.net_bonus_gold, 250);
        assert_eq!(stats2.recent_rerolls.len(), 2);
    }

    #[tokio::test]
    async fn test_reward_tracks_status_and_win_counts() {
        let db = in_memory_db().await;

        let now = chrono::Utc::now();
        let daily_reset = (now + chrono::Duration::hours(12)).to_rfc3339();
        let weekly_reset = (now + chrono::Duration::days(3)).to_rfc3339();

        // Record the reset timestamps (MTGA never sends authoritative win counts)
        db.record_reward_tracks_update(&daily_reset, &weekly_reset, None, None).await.unwrap();

        // No matches yet — wins should be 0
        let status0 = db.get_reward_tracks_status().await.unwrap();
        assert_eq!(status0.daily_wins, 0);
        assert_eq!(status0.weekly_wins, 0);
        assert_eq!(status0.daily_milestones.len(), 15);
        assert_eq!(status0.weekly_milestones.len(), 15);
        assert!(status0.next_daily_reward.is_some());
        assert_eq!(status0.next_daily_reward.unwrap().win_number, 1);

        // Insert 2 wins within today's window (now - 1h to now)
        let win_ts1 = (now - chrono::Duration::minutes(30)).to_rfc3339();
        let win_ts2 = (now - chrono::Duration::minutes(60)).to_rfc3339();
        let date_str = now.format("%Y-%m-%d").to_string();
        sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_seat_id) VALUES ('m1', ?, ?, 'Standard', 'win', 300, 7, 1, 1)")
            .bind(&win_ts1).bind(&date_str).execute(db.pool()).await.unwrap();
        sqlx::query("INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_seat_id) VALUES ('m2', ?, ?, 'Standard', 'win', 240, 5, 0, 1)")
            .bind(&win_ts2).bind(&date_str).execute(db.pool()).await.unwrap();

        let status = db.get_reward_tracks_status().await.unwrap();
        assert_eq!(status.daily_wins, 2);
        assert_eq!(status.weekly_wins, 2);
        assert!(status.next_daily_reward.is_some());
        assert_eq!(status.next_daily_reward.unwrap().win_number, 3);
    }

    #[tokio::test]
    async fn test_player_rank_snapshots_and_deduplication() {
        let db = in_memory_db().await;

        // 1. Record season info
        let season = crate::parser::SeasonDetailsRecord {
            season_ordinal: 93,
            season_start_time: Some("2026-08-31T19:05:00".to_string()),
            season_end_time: Some("2026-09-30T19:00:00".to_string()),
        };
        db.record_season_update(&season).await.unwrap();

        // 2. Record rank update
        let rank1 = crate::parser::PlayerRankRecord {
            season_ordinal: 93,
            constructed_tier: "Gold".to_string(),
            constructed_level: 3,
            constructed_step: 4,
            constructed_wins: 2,
            constructed_losses: 4,
            limited_tier: "Bronze".to_string(),
            limited_level: 4,
            limited_step: 0,
            limited_wins: 0,
            limited_losses: 0,
        };
        db.record_rank_update(&rank1).await.unwrap();

        // Check latest rank status
        let status = db.get_latest_rank_status().await.unwrap().expect("status should be present");
        assert_eq!(status.season_ordinal, 93);
        assert_eq!(status.constructed_tier, "Gold");
        assert_eq!(status.constructed_level, 3);
        assert_eq!(status.constructed_step, 4);
        assert_eq!(status.season_end_time, Some("2026-09-30T19:00:00".to_string()));

        // 3. Deduplication test: identical update should NOT insert another row
        db.record_rank_update(&rank1).await.unwrap();
        let history = db.get_rank_history(50).await.unwrap();
        assert_eq!(history.len(), 1);

        // 4. Update with a new win: should insert second row
        let mut rank2 = rank1.clone();
        rank2.constructed_step = 5;
        rank2.constructed_wins = 3;
        db.record_rank_update(&rank2).await.unwrap();

        let history2 = db.get_rank_history(50).await.unwrap();
        assert_eq!(history2.len(), 2);
        assert_eq!(history2[0].constructed_step, 5); // Newest first
    }

    #[tokio::test]
    async fn test_mastery_pass_crud() {
        let db = in_memory_db().await;

        // Seed sets_metadata for name resolution
        sqlx::query("INSERT INTO sets_metadata (set_code, name, released_at, updated_at) VALUES ('FRA', 'Reality Fracture', '2026-10-02', datetime('now'))")
            .execute(db.pool()).await.unwrap();

        let pass_record = crate::parser::MasteryPassRecord {
            pass_id: "BattlePass_FRA".to_string(),
            set_code: "FRA".to_string(),
            current_level: 3,
            current_xp: 750,
            xp_per_level: 1000,
            is_premium: true,
            orbs: 0,
            max_level: 40,
            claimed_levels: vec![1, 2],
        };

        db.record_mastery_pass_update(&pass_record).await.unwrap();

        let status = db.get_mastery_pass_status().await.unwrap().expect("mastery pass should exist");
        assert_eq!(status.pass_id, "BattlePass_FRA");
        assert_eq!(status.set_code, "FRA");
        assert_eq!(status.pass_name, "Reality Fracture Mastery");
        assert_eq!(status.current_level, 3);
        assert_eq!(status.current_xp, 750);
        assert!(status.is_premium);
        assert_eq!(status.claimed_levels, vec![1, 2]);

        // Update orbs
        db.update_mastery_orbs("BattlePass_FRA_Orb", 2).await.unwrap();
        let status2 = db.get_mastery_pass_status().await.unwrap().unwrap();
        assert_eq!(status2.orbs, 2);
    }

    #[tokio::test]
    async fn test_inventory_snapshot_replaces_log_guesses() {
        let db = in_memory_db().await;
        db.add_collection_draw(1001).await.unwrap(); // drawn from an event deck, not owned
        db.upsert_collection_from_decklist(1002, 2).await.unwrap(); // owns more than the list showed
        db.add_collection_draw(1003).await.unwrap();

        db.replace_collection_from_inventory(&[(1002, 4), (1003, 1), (1004, 9)]).await.unwrap();

        let rows: Vec<(i64, i64, String, i64)> = sqlx::query_as(
            "SELECT grp_id, owned_count, provenance, draw_seen FROM collection_cards ORDER BY grp_id",
        )
        .fetch_all(db.pool())
        .await
        .unwrap();
        assert_eq!(
            rows,
            vec![
                (1001, 0, "inventory".to_string(), 1),
                (1002, 4, "inventory".to_string(), 0),
                (1003, 1, "inventory".to_string(), 1),
                (1004, 4, "inventory".to_string(), 0),
            ]
        );
    }
}
