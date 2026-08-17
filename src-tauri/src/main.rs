mod tailer;
mod parser;
mod match_assembler;
mod db;
mod theme;
mod card_db;
mod deck_list;
mod settings;
mod deck_legitimacy;

use tokio::sync::mpsc;
use std::path::PathBuf;
use tailer::{FileTailer, TailerEvent};
use parser::{parse_line, ParsedEvent};
use match_assembler::{MatchAssembler, MatchRecord};
use db::DatabaseManager;
use theme::{get_mana_theme, ManaTheme};
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButtonState, MouseButton};
use tauri::image::Image;
use sqlx::Row;

fn redact_str(s: &str) -> String {
    if s.len() <= 6 {
        "[REDACTED]".to_string()
    } else {
        format!("{}...{}", &s[..3], &s[s.len()-3..])
    }
}

#[tauri::command]
fn get_active_theme(theme_id: String) -> ManaTheme {
    get_mana_theme(&theme_id)
}

// Resolve the effective MTGA log path: stored override > RHYSTIC_MTGA_LOG >
// auto-discovery. Returns an empty string when none can be found.
fn resolve_effective_log_path() -> String {
    let settings = settings::load_settings();
    if let Some(p) = settings.mtga_log_path.as_deref() {
        if !p.is_empty() {
            return p.to_string();
        }
    }
    if let Ok(p) = std::env::var("RHYSTIC_MTGA_LOG") {
        if !p.is_empty() {
            return p;
        }
    }
    tailer::discover_log_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Shared runtime state so the frontend can query the active log path and have
/// the tailer restart when the user changes it.
pub struct LogPathState {
    pub path_tx: tokio::sync::watch::Sender<String>,
}

#[tauri::command]
fn get_log_path(state: tauri::State<LogPathState>) -> String {
    state.path_tx.borrow().clone()
}

#[tauri::command]
fn set_log_path(state: tauri::State<LogPathState>, path: String) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    let mut settings = settings::load_settings();
    settings.mtga_log_path = if trimmed.is_empty() { None } else { Some(trimmed.clone()) };
    settings::save_settings(&settings)?;
    let effective = resolve_effective_log_path();
    state.path_tx.send(effective.clone()).map_err(|_| "log path channel closed".to_string())?;
    Ok(effective)
}

#[tauri::command]
fn get_minimize_to_tray() -> bool {
    settings::load_settings().minimize_to_tray
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool) -> Result<bool, String> {
    let mut settings = settings::load_settings();
    settings.minimize_to_tray = enabled;
    settings::save_settings(&settings)?;
    Ok(enabled)
}

#[tauri::command]
async fn get_matches_count() -> Result<i64, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.get_match_count().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_recent_matches(limit: Option<i64>) -> Result<Vec<serde_json::Value>, String> {
    let start_t = std::time::Instant::now();
    println!("[PROFILE] get_recent_matches IPC started");

    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let db_t = start_t.elapsed();
    println!("[PROFILE] DB init completed in {:?}", db_t);

    let raw_matches = db.get_recent_matches(limit.unwrap_or(100)).await.map_err(|e| e.to_string())?;
    let fetch_matches_t = start_t.elapsed();
    println!("[PROFILE] Fetched {} raw match records in {:?}", raw_matches.len(), fetch_matches_t);

    // 1 SINGLE BULK JOIN QUERY to load all played card metadata for all matches in memory
    let query_cards_start = std::time::Instant::now();
    let bulk_rows = sqlx::query(
        r#"
        SELECT mc.match_id, mc.is_opponent, c.mana_cost, c.color_identity, c.colors, mc.count
        FROM match_cards mc
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        "#
    )
    .fetch_all(db.pool())
    .await
    .unwrap_or_default();

    println!("[PROFILE] Bulk SQL query fetched {} card rows across all matches in {:?}", bulk_rows.len(), query_cards_start.elapsed());

    // Build fast in-memory map of match_id -> (curve, player_colors, opponent_colors)
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
        let count: i64 = r.get("count");

        let entry = map.entry(match_id).or_insert_with(|| MatchCardAggregate {
            curve: vec![0i64; 7],
            colors: HashSet::new(),
            opponent_colors: HashSet::new(),
        });

        if let Some(cost) = &mana_cost {
            let cmc = card_db::parse_mtga_cmc(cost);
            let bin = match cmc as usize {
                0 => 0,
                1 => 0,
                2 => 1,
                3 => 2,
                4 => 3,
                5 => 4,
                6 => 5,
                _ => 6,
            };
            entry.curve[bin] += count;
        }

        // Player cards contribute to the mana curve AND player colors; opponent cards
        // contribute only to opponent colors (opponent curve is not displayed).
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
        let curve = agg.as_ref().map(|a| a.curve.clone()).unwrap_or_else(|| vec![0i64; 7]);
        
        let mut colors_arr: Vec<String> = agg
            .as_ref()
            .map(|a| a.colors.iter().cloned().collect())
            .unwrap_or_default();
        colors_arr.sort_by_key(|c| order.iter().position(|&x| x == c).unwrap_or(99));

        let mut opponent_colors_arr: Vec<String> = agg
            .map(|a| a.opponent_colors.into_iter().collect())
            .unwrap_or_default();
        opponent_colors_arr.sort_by_key(|c| order.iter().position(|&x| x == c).unwrap_or(99));

        let clean_format = parser::normalize_format(&m.format_name);

        result.push(serde_json::json!({
            "match_id": m.match_id,
            "timestamp": m.timestamp,
            "date_str": m.date_str,
            "format_name": clean_format,
            "result": m.result,
            "result_reason": m.result_reason,
            "duration_seconds": m.duration_seconds,
            "turns": m.turns,
            "going_first": m.going_first,
            "player_deck_name": m.player_deck_name,
            "player_commander_id": m.player_commander_id,
            "player_commander_name": m.player_commander_name,
            "player_life_end": m.player_life_end,
            "opponent_name": m.opponent_name,
            "opponent_commander_id": m.opponent_commander_id,
            "opponent_commander_name": m.opponent_commander_name,
            "opponent_mulligans": m.opponent_mulligans,
            "opponent_life_end": m.opponent_life_end,
            "mana_curve": curve,
            "deck_colors": colors_arr,
            "opponent_colors": opponent_colors_arr,
        }));
    }

    println!("[PROFILE] Total get_recent_matches IPC query time: {:?}", start_t.elapsed());

    Ok(result)
}

#[tauri::command]
async fn get_deck_stats() -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.get_deck_stats().await.map_err(|e| e.to_string())
}

/// Rich per-deck overview for the Decks & Stats view: base W-L plus format
/// breakdown, commander breakdown (grouped by resolved name, printings merged),
/// color identity, and a mana curve derived from cards seen across the deck's matches.
#[tauri::command]
async fn get_deck_overview() -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // 1. Base stats per deck (mirrors get_deck_stats).
    let base_rows = sqlx::query(
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
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 2. Format breakdown per deck.
    let format_rows = sqlx::query(
        r#"
        SELECT hero_deck_name as deck_name, format, COUNT(*) as n
        FROM matches
        WHERE hero_deck_name IS NOT NULL AND hero_deck_name != ''
        GROUP BY hero_deck_name, format
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 3. Commander breakdown per deck: group by RESOLVED NAME (merge printings),
    //    count matches per commander, join cards_cache for the name.
    let commander_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, c.name as commander_name,
               COUNT(*) as n
        FROM matches m
        LEFT JOIN cards_cache c ON m.hero_commander_id = c.grp_id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND m.hero_commander_id IS NOT NULL
        GROUP BY m.hero_deck_name, c.name
        ORDER BY m.hero_deck_name, n DESC
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 3b. Dominant commander per deck (top by count), including a grp_id for art lookup.
    let top_commander_rows = sqlx::query(
        r#"
        SELECT deck_name, commander_name, grp_id, n FROM (
            SELECT m.hero_deck_name as deck_name, c.name as commander_name,
                   MIN(m.hero_commander_id) as grp_id, COUNT(*) as n,
                   ROW_NUMBER() OVER (PARTITION BY m.hero_deck_name ORDER BY COUNT(*) DESC, c.name ASC) as rn
            FROM matches m
            JOIN cards_cache c ON m.hero_commander_id = c.grp_id
            WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
              AND m.hero_commander_id IS NOT NULL
            GROUP BY m.hero_deck_name, c.name
        ) WHERE rn = 1
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 3c. Random non-land card per deck from cards seen (for non-commander
    //     decks). Non-land ensures the thumbnail is a spell, not a basic land;
    //     ORDER BY random() gives a different representative each refresh.
    let top_card_rows = sqlx::query(
        r#"
        SELECT deck_name, card_name, grp_id FROM (
            SELECT m.hero_deck_name as deck_name, c.name as card_name,
                   MIN(c.grp_id) as grp_id,
                   ROW_NUMBER() OVER (PARTITION BY m.hero_deck_name ORDER BY RANDOM()) as rn
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            JOIN cards_cache c ON mc.grp_id = c.grp_id
            WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
              AND mc.is_opponent = 0
              AND c.card_type IS NOT NULL
              AND lower(c.card_type) NOT LIKE '%land%'
              AND c.card_type != ''
            GROUP BY m.hero_deck_name, c.name, c.grp_id
        ) WHERE rn = 1
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4. Colors + mana curve per deck from cards seen (match_cards -> cards_cache).
    //    Aggregate by grp_id so `count` is the total occurrences across ALL of the
    //    deck's matches (mc.count is per-match, usually 1, which would make the
    //    relative-frequency threshold compare 1 against a 10+ cutoff and fail for
    //    every card -> empty colors). This mirrors the verified aggregation.
    let card_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, c.mana_cost, c.color_identity, c.colors,
               SUM(mc.count) as count
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND mc.is_opponent = 0
        GROUP BY m.hero_deck_name, c.grp_id, c.mana_cost, c.color_identity, c.colors
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4b. Every non-land card per deck (for the Key Cards column). These are the
    //     highest-MV creature / highest-MV spell / highest-MV other in the deck.
    let key_card_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name,
               c.name, MIN(c.grp_id) as grp_id,
               MAX(c.cmc) as cmc,
               c.card_type, c.mana_cost, c.rarity, c.set_code, c.color_identity
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND mc.is_opponent = 0
          AND c.card_type IS NOT NULL
          AND c.card_type != ''
          AND lower(c.card_type) NOT LIKE '%land%'
        GROUP BY m.hero_deck_name, c.name, c.card_type, c.mana_cost, c.rarity, c.set_code, c.color_identity
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4c. True Decklists (imported) — when present, key cards must be drawn from
    //     these grp_ids, not the logged cards. Load the stored grp_ids per deck.
    let list_rows = sqlx::query(
        "SELECT deck_name, cards_json, commander_grp_id FROM deck_lists"
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4d. Collection ownership for the "% owned" column: every grp_id with
    //     owned_count > 0, plus each deck's logged player-side grp_ids.
    let owned = owned_grp_ids(db.pool()).await?;
    let logged_grp_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, mc.grp_id as grp_id
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND mc.is_opponent = 0
        GROUP BY m.hero_deck_name, mc.grp_id
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;
    let mut logged_grps: std::collections::HashMap<String, std::collections::HashSet<i64>> = std::collections::HashMap::new();
    for r in &logged_grp_rows {
        let dname: String = r.get("deck_name");
        let gid: i64 = r.get("grp_id");
        logged_grps.entry(dname).or_default().insert(gid);
    }

    // 4f. Brawl commander color identity per deck (for filtering logged cards).
    let brawl_cmd_rows = sqlx::query(
        r#"
        SELECT top.hero_deck_name as deck_name, c.color_identity FROM (
            SELECT m.hero_deck_name, m.hero_commander_id,
                   ROW_NUMBER() OVER (PARTITION BY m.hero_deck_name ORDER BY COUNT(*) DESC) as rn
            FROM matches m
            WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
              AND m.hero_commander_id IS NOT NULL
            GROUP BY m.hero_deck_name, m.hero_commander_id
        ) top
        JOIN cards_cache c ON top.hero_commander_id = c.grp_id
        WHERE top.rn = 1
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4e. Pre-compute the key-card candidate source per deck:
    //     - True Decklist grp_ids when an import exists
    //     - else logged cards, filtered by commander identity for Brawl decks.
    let mut true_list_grps: std::collections::HashMap<String, Vec<i64>> = std::collections::HashMap::new();
    let mut all_true_grps: Vec<i64> = Vec::new();
    for lr in &list_rows {
        let dname: String = lr.get("deck_name");
        let cards_json: String = lr.get("cards_json");
        let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        let grps: Vec<i64> = entries.iter()
            .filter_map(|e| e.get("grp_id").and_then(|v| v.as_i64()))
            .collect();
        if !grps.is_empty() {
            true_list_grps.insert(dname.clone(), grps.clone());
            for g in grps { if !all_true_grps.contains(&g) { all_true_grps.push(g); } }
        }
    }

    // Batch metadata for every true-list grp_id (avoids N+1 queries).
    let mut meta_by_grp: std::collections::HashMap<i64, serde_json::Value> = std::collections::HashMap::new();
    if !all_true_grps.is_empty() {
        let placeholders = all_true_grps.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let q = format!(
            r#"
            SELECT grp_id, name, card_type, mana_cost, cmc, rarity, set_code, color_identity
            FROM cards_cache WHERE grp_id IN ({})
            "#, placeholders
        );
        let mut q = sqlx::query(&q);
        for g in &all_true_grps { q = q.bind(*g); }
        let meta_rows = q.fetch_all(db.pool()).await.map_err(|e| e.to_string())?;
        for m in meta_rows {
            let grp: i64 = m.get("grp_id");
            meta_by_grp.insert(grp, serde_json::json!({
                "name": m.get::<Option<String>,_>("name"),
                "card_type": m.get::<Option<String>,_>("card_type"),
                "mana_cost": m.get::<Option<String>,_>("mana_cost"),
                "cmc": m.get::<i64,_>("cmc"),
                "rarity": m.get::<i64,_>("rarity"),
                "set_code": m.get::<Option<String>,_>("set_code"),
                "color_identity": m.get::<Option<String>,_>("color_identity"),
            }));
        }
    }

    // Brawl commander identity per deck (parsed colors, empty for non-Brawl).
    let mut deck_identity: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for br in &brawl_cmd_rows {
        let dname: String = br.get("deck_name");
        let ci: Option<String> = br.get("color_identity");
        deck_identity.insert(dname, parse_identity(ci.unwrap_or_default()));
    }

    // Assemble.
    let order = ["W", "U", "B", "R", "G"];
    let mut result = Vec::new();
    for row in base_rows {
        let deck_name: String = row.get("deck_name");
        let total: i64 = row.get("total_matches");
        let wins: i64 = row.get("wins");
        let losses: i64 = row.get("losses");
        let winrate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

        // Format breakdown.
        let mut formats: Vec<serde_json::Value> = Vec::new();
        for f in &format_rows {
            let fdeck: String = f.get("deck_name");
            if fdeck == deck_name {
                formats.push(serde_json::json!({
                    "format": f.get::<String,_>("format"),
                    "count": f.get::<i64,_>("n"),
                }));
            }
        }
        formats.sort_by(|a, b| {
            b.get("count").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&a.get("count").and_then(|v| v.as_i64()).unwrap_or(0))
        });

        // Commander breakdown (names merged across printings).
        let mut commanders: Vec<serde_json::Value> = Vec::new();
        for c in &commander_rows {
            let cdeck: String = c.get("deck_name");
            if cdeck == deck_name {
                commanders.push(serde_json::json!({
                    "name": c.get::<String,_>("commander_name"),
                    "count": c.get::<i64,_>("n"),
                }));
            }
        }

        // Colors + curve.
        use std::collections::HashSet;
        let mut colors: HashSet<String> = HashSet::new();
        let mut curve = vec![0i64; 7];
        // Color-identity pollution guard: only count a card's colors toward the deck's
        // identity if it appeared in >=20% of the deck's matches (min 2). This filters
        // one-off anomalies (stolen/borrowed cards, legacy is_opponent mislabels) while
        // preserving genuine multicolor decks. Mana curve still uses all cards-seen.
        let color_min_count = std::cmp::max(2i64, (total as f64 * 0.20).round() as i64);
        for card in &card_rows {
            let cdeck: String = card.get("deck_name");
            if cdeck != deck_name { continue; }
            let mana_cost: Option<String> = card.get("mana_cost");
            let color_identity: Option<String> = card.get("color_identity");
            let colors_str: Option<String> = card.get("colors");
            let count: i64 = card.get("count");

            if let Some(cost) = &mana_cost {
                let cmc = card_db::parse_mtga_cmc(cost);
                let bin = match cmc as usize {
                    0 => 0,
                    1 => 0,
                    2 => 1,
                    3 => 2,
                    4 => 3,
                    5 => 4,
                    6 => 5,
                    _ => 6,
                };
                curve[bin] += count;
            }
            if count >= color_min_count {
                for src in [color_identity, colors_str].into_iter().flatten() {
                    for ch in src.chars() {
                        if !ch.is_ascii_alphanumeric() { continue; }
                        match ch {
                            '1' | 'W' => { colors.insert("W".to_string()); },
                            '2' | 'U' => { colors.insert("U".to_string()); },
                            '3' | 'B' => { colors.insert("B".to_string()); },
                            '4' | 'R' => { colors.insert("R".to_string()); },
                            '5' | 'G' => { colors.insert("G".to_string()); },
                            _ => {}
                        }
                    }
                }
            }
        }
        let mut colors_arr: Vec<String> = order.iter()
            .filter(|c| colors.contains(**c)).map(|c| c.to_string()).collect();

        // Dominant commander (top by count) + highest-CMC card for art/representation.
        let mut top_commander_name: Option<String> = None;
        let mut top_commander_grp: Option<i64> = None;
        for tc in &top_commander_rows {
            let tdeck: String = tc.get("deck_name");
            if tdeck == deck_name {
                top_commander_name = tc.get("commander_name");
                top_commander_grp = tc.get("grp_id");
                break;
            }
        }
        let mut top_card_name: Option<String> = None;
        let mut top_card_grp: Option<i64> = None;
        for tc in &top_card_rows {
            let tdeck: String = tc.get("deck_name");
            if tdeck == deck_name {
                top_card_name = tc.get("card_name");
                top_card_grp = tc.get("grp_id");
                break;
            }
        }

        // Key Cards: three representative non-commander cards — highest-MV
        // creature, highest-MV spell (instant/sorcery), highest-MV other
        // (non-creature, non-instant/sorcery, non-land). Fallbacks if a
        // category is missing: extra spell if no creatures, extra creature if
        // no spells, extra creature if no others.
        //
        // Candidate source: the imported True Decklist when one exists; else
        // logged cards filtered to the commander's color identity (Brawl).
        let mut candidates: Vec<serde_json::Value> = Vec::new();
        let is_brawl = deck_identity.get(&deck_name).map(|v| !v.is_empty()).unwrap_or(false);
        if let Some(grps) = true_list_grps.get(&deck_name) {
            for g in grps {
                if let Some(meta) = meta_by_grp.get(g) {
                    candidates.push(serde_json::json!({
                        "name": meta.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        "grp_id": g,
                        "cmc": meta.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0),
                        "card_type": meta.get("card_type"),
                        "mana_cost": meta.get("mana_cost"),
                        "rarity": meta.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0),
                        "set_code": meta.get("set_code"),
                    }));
                }
            }
        } else {
            let identity = deck_identity.get(&deck_name).cloned().unwrap_or_default();
            for kc in &key_card_rows {
                let kdeck: String = kc.get("deck_name");
                if kdeck != deck_name { continue; }
                // Brawl color-identity filter on logged cards.
                if is_brawl && !identity.is_empty() {
                    let ci: Option<String> = kc.get("color_identity");
                    let card_identity = parse_identity(ci.unwrap_or_default());
                    let within = card_identity.is_empty() || card_identity.iter().all(|c| identity.contains(c));
                    if !within { continue; }
                }
                candidates.push(serde_json::json!({
                    "name": kc.get::<String,_>("name"),
                    "grp_id": kc.get::<i64,_>("grp_id"),
                    "cmc": kc.get::<i64,_>("cmc"),
                    "card_type": kc.get::<Option<String>,_>("card_type"),
                    "mana_cost": kc.get::<Option<String>,_>("mana_cost"),
                    "rarity": kc.get::<i64,_>("rarity"),
                    "set_code": kc.get::<Option<String>,_>("set_code"),
                }));
            }
        }

        // Key cards: 6 representative non-commander cards — two highest-CMC
        // creatures, two highest-CMC spells (instant/sorcery), two highest-CMC
        // other (non-creature, non-instant/sorcery, non-land). Fallbacks if a
        // category is short: pull the best remaining card from the other
        // categories so all 6 slots fill when possible.
        let mut key_cards: Vec<serde_json::Value> = Vec::new();
        let mut used: Vec<String> = Vec::new();

        // Slot mapping: [0,1]=creature, [2,3]=spell, [4,5]=other.
        let slot_kinds = ["creature", "creature", "spell", "spell", "other", "other"];

        // First pass: best (highest CMC) unused card per exact kind.
        for (slot, kind) in slot_kinds.iter().enumerate() {
            let mut best: Option<serde_json::Value> = None;
            for cand in &candidates {
                let name: String = cand.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let card_type = cand.get("card_type").and_then(|v| v.as_str()).unwrap_or("");
                let ct = card_type.to_lowercase();
                if top_commander_name.as_deref() == Some(name.as_str()) { continue; }
                if used.contains(&name) { continue; }

                let is_creature = ct.contains("creature");
                let is_spell = ct.contains("instant") || ct.contains("sorcery");
                let is_other = !is_creature && !is_spell;
                let matches_kind = match *kind {
                    "creature" => is_creature,
                    "spell" => is_spell,
                    _ => is_other,
                };
                if !matches_kind { continue; }

                let cmc: i64 = cand.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
                let replace = match &best {
                    Some(b) => cmc > b.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0),
                    None => true,
                };
                if replace { best = Some(cand.clone()); }
            }
            if let Some(card) = best {
                if let Some(n) = card.get("name").and_then(|v| v.as_str()) { used.push(n.to_string()); }
                key_cards.push(card);
            } else {
                key_cards.push(serde_json::Value::Null);
            }
        }

        // Second pass: fill any empty slots with the best remaining card,
        // preferring that slot's kind, then others (mirrors old fallbacks).
        let fill_order = [
            (0usize, vec!["creature", "spell", "other"]),
            (1usize, vec!["creature", "spell", "other"]),
            (2usize, vec!["spell", "creature", "other"]),
            (3usize, vec!["spell", "creature", "other"]),
            (4usize, vec!["other", "creature", "spell"]),
            (5usize, vec!["other", "creature", "spell"]),
        ];
        for (slot, priority) in &fill_order {
            if key_cards[*slot].is_null() {
                for kind in priority {
                    let mut best: Option<serde_json::Value> = None;
                    for cand in &candidates {
                        let name: String = cand.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if used.contains(&name) { continue; }
                        if top_commander_name.as_deref() == Some(name.as_str()) { continue; }
                        let card_type = cand.get("card_type").and_then(|v| v.as_str()).unwrap_or("");
                        let ct = card_type.to_lowercase();
                        let is_creature = ct.contains("creature");
                        let is_spell = ct.contains("instant") || ct.contains("sorcery");
                        let is_other = !is_creature && !is_spell;
                        let matches_kind = match *kind {
                            "creature" => is_creature,
                            "spell" => is_spell,
                            _ => is_other,
                        };
                        if !matches_kind { continue; }
                        let cmc: i64 = cand.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
                        let replace = match &best {
                            Some(b) => cmc > b.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0),
                            None => true,
                        };
                        if replace { best = Some(cand.clone()); }
                    }
                    if let Some(card) = best {
                        if let Some(n) = card.get("name").and_then(|v| v.as_str()) { used.push(n.to_string()); }
                        key_cards[*slot] = card;
                        break;
                    }
                }
            }
        }
        // Drop null placeholders, cap at 6.
        key_cards.retain(|v| !v.is_null());
        key_cards.truncate(6);

        // "% owned": true decklist grp_ids when imported, else logged player-side
        // grp_ids. Card-level — distinct cards, not copies.
        let deck_grps: std::collections::HashSet<i64> = match true_list_grps.get(&deck_name) {
            Some(grps) => grps.iter().cloned().collect(),
            None => logged_grps.get(&deck_name).cloned().unwrap_or_default(),
        };
        let (owned_cards, total_ownedable, pct) = ownership_stats(&deck_grps, &owned);
        let owned_pct = if total_ownedable > 0 { Some((pct * 10.0).round() / 10.0) } else { None };

        result.push(serde_json::json!({
            "deck_name": deck_name,
            "has_list": true_list_grps.contains_key(&deck_name),
            "total_matches": total,
            "wins": wins,
            "losses": losses,
            "winrate": format!("{:.1}%", winrate),
            "formats": formats,
            "commanders": commanders,
            "colors": colors_arr,
            "mana_curve": curve,
            "top_commander_name": top_commander_name,
            "top_commander_grp_id": top_commander_grp,
            "top_card_name": top_card_name,
            "top_card_grp_id": top_card_grp,
            "key_cards": key_cards,
            "owned_pct": owned_pct,
            "owned_cards": owned_cards,
            "total_ownedable": total_ownedable,
        }));
        let _ = &mut colors_arr;
    }

    Ok(result)
}

/// Full detail for a single deck (Deck Detail view, Stage 1):
/// base W-L / winrate, play vs draw split, dominant commander, deck colors,
/// and the 5 most recent matches.
#[tauri::command]
async fn get_deck_detail(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // Base stats.
    let base_row = sqlx::query(
        r#"
        SELECT COUNT(*) as total,
               SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches
        WHERE hero_deck_name = ?
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let total: i64 = base_row.as_ref().map(|r| r.get("total")).unwrap_or(0);
    let wins: i64 = base_row.as_ref().map(|r| r.get("wins")).unwrap_or(0);
    let losses: i64 = base_row.as_ref().map(|r| r.get("losses")).unwrap_or(0);
    let winrate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

    // Play vs draw split (going_first = 1 play, 0 draw). Exclude NULL (unknown
    // order, legacy matches) from both buckets.
    let split_rows = sqlx::query(
        r#"
        SELECT going_first,
               SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches
        WHERE hero_deck_name = ? AND going_first IS NOT NULL
        GROUP BY going_first
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut play = serde_json::json!({ "wins": 0, "losses": 0 });
    let mut draw = serde_json::json!({ "wins": 0, "losses": 0 });
    for r in &split_rows {
        let gf: bool = r.get("going_first");
        let w: i64 = r.get("wins");
        let l: i64 = r.get("losses");
        let obj = if gf { &mut play } else { &mut draw };
        obj["wins"] = serde_json::json!(w);
        obj["losses"] = serde_json::json!(l);
    }

    // Dominant commander (top by count, printings merged), with a grp_id for art.
    let commander_row = sqlx::query(
        r#"
        SELECT commander_name, grp_id FROM (
            SELECT c.name as commander_name, MIN(m.hero_commander_id) as grp_id, COUNT(*) as n,
                   ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, c.name ASC) as rn
            FROM matches m
            JOIN cards_cache c ON m.hero_commander_id = c.grp_id
            WHERE m.hero_deck_name = ?
              AND m.hero_commander_id IS NOT NULL
            GROUP BY c.name
        ) WHERE rn = 1
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;
    let commander_name: Option<String> = commander_row.as_ref().map(|r| r.get("commander_name"));
    let commander_grp_id: Option<i64> = commander_row.as_ref().map(|r| r.get("grp_id"));

    // Deck colors using the 20% relative-frequency threshold (same as overview).
    let deck_total: i64 = total;
    let color_min_count = std::cmp::max(2i64, (deck_total as f64 * 0.20).round() as i64);
    let color_rows = sqlx::query(
        r#"
        SELECT c.color_identity, c.colors, SUM(mc.count) as count
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
        GROUP BY m.hero_deck_name, c.grp_id, c.color_identity, c.colors
        HAVING SUM(mc.count) >= ?
        "#
    )
    .bind(&deck_name)
    .bind(color_min_count)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let order = ["W", "U", "B", "R", "G"];
    use std::collections::HashSet;
    let mut colors: HashSet<String> = HashSet::new();
    for r in &color_rows {
        let ci: Option<String> = r.get("color_identity");
        let cols: Option<String> = r.get("colors");
        for src in [ci, cols].into_iter().flatten() {
            for ch in src.chars() {
                if !ch.is_ascii_alphanumeric() { continue; }
                match ch {
                    '1' | 'W' => { colors.insert("W".to_string()); },
                    '2' | 'U' => { colors.insert("U".to_string()); },
                    '3' | 'B' => { colors.insert("B".to_string()); },
                    '4' | 'R' => { colors.insert("R".to_string()); },
                    '5' | 'G' => { colors.insert("G".to_string()); },
                    _ => {}
                }
            }
        }
    }
    let colors_arr: Vec<String> = order.iter()
        .filter(|c| colors.contains(**c)).map(|c| c.to_string()).collect();

    // Last 5 matches.
    let recent_rows = sqlx::query(
        r#"
        SELECT id, timestamp, opponent_name, result, hero_life_end, opponent_life_end, going_first
        FROM matches
        WHERE hero_deck_name = ?
        ORDER BY timestamp DESC
        LIMIT 5
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut recent: Vec<serde_json::Value> = Vec::new();
    for r in recent_rows {
        recent.push(serde_json::json!({
            "match_id": r.get::<String,_>("id"),
            "timestamp": r.get::<String,_>("timestamp"),
            "opponent_name": r.get::<Option<String>,_>("opponent_name"),
            "result": r.get::<String,_>("result"),
            "hero_life_end": r.get::<Option<i64>,_>("hero_life_end"),
            "opponent_life_end": r.get::<Option<i64>,_>("opponent_life_end"),
            "going_first": r.get::<Option<bool>,_>("going_first"),
        }));
    }

    // Stage 2 chart data: mana value histogram, card-type distribution, and
    // mana-color distribution. Each card counts ONCE (distinct grp_id) so the
    // distributions reflect deck composition, not match frequency.
    //
    // When a True Decklist has been imported, the charts follow it — the stored
    // grp_ids ARE the authoritative deck composition. Otherwise fall back to
    // aggregated logged cards.
    let list_row = sqlx::query(
        "SELECT cards_json FROM deck_lists WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let chart_rows = if let Some(row) = list_row {
        let cards_json: String = row.get("cards_json");
        let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        let grp_ids: Vec<i64> = entries.iter()
            .filter_map(|e| e.get("grp_id").and_then(|v| v.as_i64()))
            .collect();

        if grp_ids.is_empty() {
            Vec::new()
        } else {
            // Query card metadata for the stored grp_ids (deck composition).
            let placeholders = grp_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let q = format!(
                r#"
                SELECT c.card_type, c.mana_cost, c.color_identity, c.colors
                FROM cards_cache c
                WHERE c.grp_id IN ({})
                "#
            , placeholders);
            let mut q = sqlx::query(&q);
            for id in &grp_ids {
                q = q.bind(*id);
            }
            q.fetch_all(db.pool()).await.map_err(|e| e.to_string())?
        }
    } else {
        sqlx::query(
            r#"
            SELECT c.card_type, c.mana_cost, c.color_identity, c.colors
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            JOIN cards_cache c ON mc.grp_id = c.grp_id
            WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
            GROUP BY c.grp_id
            "#
        )
        .bind(&deck_name)
        .fetch_all(db.pool())
        .await
        .map_err(|e| e.to_string())?
    };

    // For Brawl decks, the mana-color distribution must stay within the
    // commander's color identity (cards outside it are legacy leaks). Detect
    // the format + dominant commander identity so off-identity cards are
    // excluded from the color counts.
    let format_row = sqlx::query(
        "SELECT format FROM matches WHERE hero_deck_name = ? LIMIT 1"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;
    let is_brawl = format_row.as_ref()
        .and_then(|r| r.get::<Option<String>,_>("format"))
        .map(|f| f.eq_ignore_ascii_case("brawl"))
        .unwrap_or(false);

    let mut commander_identity: Vec<String> = Vec::new();
    if is_brawl {
        let cmd_row = sqlx::query(
            r#"
            SELECT c.color_identity FROM (
                SELECT m.hero_commander_id, COUNT(*) as n
                FROM matches m
                WHERE m.hero_deck_name = ? AND m.hero_commander_id IS NOT NULL
                GROUP BY m.hero_commander_id
                ORDER BY n DESC LIMIT 1
            ) top
            JOIN cards_cache c ON top.hero_commander_id = c.grp_id
            "#
        )
        .bind(&deck_name)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;
        if let Some(r) = cmd_row {
            if let Some(ci) = r.get::<Option<String>,_>("color_identity") {
                commander_identity = parse_identity(ci);
            }
        }
    }

    // Mana value histogram: bin by CMC (bins 0, 1, 2, 3, 4, 5, 6, 7+).
    // Lands are excluded entirely — the curve reflects spell costs only.
    let mut curve = vec![0i64; 8];
    // Card type distribution: map primary type (last keyword wins).
    let mut type_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    // Mana color distribution: each card counts once toward each of its colors.
    let mut color_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    // Win-rate pie is computed from total/wins/losses already available.

    fn chart_category(ct: &str) -> String {
        let lower = ct.to_lowercase();
        for kw in ["planeswalker", "battle", "creature", "land", "enchantment", "artifact", "instant", "sorcery"] {
            if lower.contains(kw) {
                return kw[..1].to_uppercase() + &kw[1..];
            }
        }
        if lower.contains("token") { return "Token".to_string(); }
        "Other".to_string()
    }

    for r in &chart_rows {
        let ct: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let ci: Option<String> = r.get("color_identity");
        let cols: Option<String> = r.get("colors");

        let is_land = ct.as_deref().map(|t| t.to_lowercase().contains("land")).unwrap_or(false);

        // Mana value bin (spells only — lands/tokens without a cost excluded).
        if let Some(cost) = &mana_cost {
            if !is_land {
                let cmc = card_db::parse_mtga_cmc(cost);
                let bin = match cmc as usize {
                    0 => 0, 1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6, _ => 7,
                };
                curve[bin] += 1;
            }
        }

        // Card type.
        let cat = chart_category(ct.as_deref().unwrap_or("Other"));
        *type_map.entry(cat).or_insert(0) += 1;

        // Mana colors (each card counts once per color it has). Lands are
        // excluded — this distribution reflects spell colors only.
        if !is_land {
            // Brawl color-identity guard: cards outside the commander's identity
            // are legacy leaks and must not pollute the color distribution.
            if is_brawl && !commander_identity.is_empty() {
                let card_identity = parse_identity(ci.clone().unwrap_or_default());
                let within = card_identity.is_empty() || card_identity.iter().all(|c| commander_identity.contains(c));
                if !within { continue; }
            }
            let mut card_colors: Vec<String> = Vec::new();
            for src in [ci, cols].into_iter().flatten() {
                for ch in src.chars() {
                    if !ch.is_ascii_alphanumeric() { continue; }
                    let c = match ch {
                        '1' | 'W' => "W", '2' | 'U' => "U", '3' | 'B' => "B", '4' | 'R' => "R", '5' | 'G' => "G",
                        _ => "",
                    };
                    if !c.is_empty() && !card_colors.contains(&c.to_string()) {
                        card_colors.push(c.to_string());
                    }
                }
            }
            if card_colors.is_empty() {
                *color_counts.entry("C".to_string()).or_insert(0) += 1;
            } else {
                for c in card_colors { *color_counts.entry(c).or_insert(0) += 1; }
            }
        }
    }

    let color_order = ["W", "U", "B", "R", "G", "C"];
    let color_dist: Vec<serde_json::Value> = color_order.iter()
        .filter_map(|c| color_counts.get(*c).map(|n| serde_json::json!({ "color": c, "count": n })))
        .collect();

    let mut types_sorted: Vec<serde_json::Value> = type_map.into_iter()
        .map(|(t, n)| serde_json::json!({ "type": t, "count": n }))
        .collect();
    types_sorted.sort_by(|a, b| b.get("count").and_then(|v| v.as_i64()).unwrap_or(0)
        .cmp(&a.get("count").and_then(|v| v.as_i64()).unwrap_or(0)));

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "total": total,
        "wins": wins,
        "losses": losses,
        "winrate": format!("{:.1}%", winrate),
        "play": play,
        "draw": draw,
        "commander_name": commander_name,
        "commander_grp_id": commander_grp_id,
        "colors": colors_arr,
        "recent_matches": recent,
        "mana_curve": curve,
        "card_types": types_sorted,
        "mana_distribution": color_dist,
    }))
}

#[tauri::command]
async fn get_card_info(grp_id: i64) -> Result<Option<card_db::CardMetadata>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    card_db::get_card_metadata(db.pool(), grp_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_card_info_by_name(name: String) -> Result<Option<card_db::CardMetadata>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    card_db::get_card_metadata_by_name(db.pool(), &name).await.map_err(|e| e.to_string())
}

/// Every printing of a card (by name) with per-printing set info, plus stats
/// aggregated across all printings: how many decks contain it, how often it was
/// an impactful card, and total/max damage dealt. Used by the card viewer's
/// set/art selector and the stats sidebar.
#[tauri::command]
async fn get_card_printings(name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let pool = db.pool();

    // All printings of this card name in the local cache, joined with set metadata.
    let printings_rows = sqlx::query(
        r#"
        SELECT c.grp_id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity,
               c.set_code, c.rarity, c.card_type, c.collector_number,
               sm.name as set_name, sm.released_at as set_released_at
        FROM cards_cache c
        LEFT JOIN sets_metadata sm ON c.set_code = sm.set_code
        WHERE c.name = ?
        ORDER BY sm.released_at DESC, c.set_code ASC
        "#
    )
    .bind(&name)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if printings_rows.is_empty() {
        return Ok(serde_json::json!({ "printings": [], "stats": null }));
    }

    let grp_ids: Vec<i64> = printings_rows.iter().map(|r| r.get::<i64, _>("grp_id")).collect();
    let placeholders = grp_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    // Decks containing this card (any printing).
    let decks_sql = format!(
        r#"
        SELECT dl.deck_name as deck_name
        FROM deck_lists dl, json_each(dl.cards_json) je
        WHERE je.value->>'grp_id' IN ({})
        ORDER BY dl.deck_name
        "#,
        placeholders
    );
    let mut decks_q = sqlx::query_as::<_, (String,)>(&decks_sql);
    for id in &grp_ids {
        decks_q = decks_q.bind(*id);
    }
    let decks = decks_q.fetch_all(pool).await.map_err(|e| e.to_string())?;

    // Impactful-card and damage stats aggregated across all printings (PLAYER ONLY).
    let impactful_sql = format!(
        r#"
        SELECT COUNT(*) as times_impactful,
               COALESCE(SUM(i.total_damage), 0) as total_damage,
               COALESCE(MAX(i.max_hit), 0) as max_hit,
               COALESCE(SUM(i.damage_to_player), 0) as damage_to_player,
               COALESCE(SUM(i.damage_to_permanents), 0) as damage_to_permanents,
               COALESCE(SUM(i.damage_combat), 0) as damage_combat,
               COALESCE(SUM(i.damage_spell), 0) as damage_spell
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        WHERE i.grp_id IN ({}) AND i.seat_id = m.hero_seat_id
        "#,
        placeholders
    );
    let mut impactful_q = sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64, i64)>(&impactful_sql);
    for id in &grp_ids {
        impactful_q = impactful_q.bind(*id);
    }
    let impactful = impactful_q.fetch_one(pool).await.map_err(|e| e.to_string())?;

    // Matches played + win rate when played (PLAYER ONLY):
    // Count distinct matches where this card was played by the player, and how many of those were wins.
    let played_sql = format!(
        r#"
        SELECT 
            COUNT(DISTINCT m.id) as matches_played,
            COALESCE(SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END), 0) as wins_when_played
        FROM matches m
        JOIN match_turn_events e ON m.id = e.match_id
        WHERE e.event_type = 'play' AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id
        "#,
        placeholders
    );
    let mut played_q = sqlx::query_as::<_, (i64, i64)>(&played_sql);
    for id in &grp_ids {
        played_q = played_q.bind(*id);
    }
    let (matches_played, wins_when_played) = played_q.fetch_one(pool).await.unwrap_or((0, 0));

    // Turn cast distribution (rounds 1 through 6+) (PLAYER ONLY):
    // In MTGA, turn_number is incremented for every half-turn (Turn 1 = Player 1 Turn 1, Turn 2 = Player 2 Turn 1, etc.).
    // We map this to game rounds: round = (turn_number + 1) / 2 so "Turn 3" matches Player Round 3.
    let turn_dist_sql = format!(
        r#"
        SELECT ((e.turn_number + 1) / 2) as game_round, COUNT(*) as cnt
        FROM match_turn_events e
        JOIN matches m ON e.match_id = m.id
        WHERE e.event_type = 'play' AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id
        GROUP BY game_round
        ORDER BY game_round ASC
        "#,
        placeholders
    );
    let mut turn_dist_q = sqlx::query_as::<_, (i64, i64)>(&turn_dist_sql);
    for id in &grp_ids {
        turn_dist_q = turn_dist_q.bind(*id);
    }
    let turn_rows = turn_dist_q.fetch_all(pool).await.unwrap_or_default();
    let mut turn_distribution: Vec<serde_json::Value> = Vec::new();
    let mut total_cast_turns = 0f64;
    let mut total_casts = 0f64;
    for (rnd, cnt) in turn_rows {
        total_cast_turns += (rnd as f64) * (cnt as f64);
        total_casts += cnt as f64;
        turn_distribution.push(serde_json::json!({
            "turn": rnd,
            "count": cnt,
        }));
    }
    let avg_cast_turn = if total_casts > 0.0 {
        (total_cast_turns / total_casts * 10.0).round() / 10.0
    } else {
        0.0
    };

    // Best performing deck (PLAYER ONLY):
    let best_deck_sql = format!(
        r#"
        SELECT m.player_deck_name,
               COUNT(DISTINCT m.id) as deck_matches,
               SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as deck_wins
        FROM matches m
        JOIN match_turn_events e ON m.id = e.match_id
        WHERE e.event_type = 'play' AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id AND m.player_deck_name IS NOT NULL AND m.player_deck_name != ''
        GROUP BY m.player_deck_name
        HAVING deck_matches >= 1
        ORDER BY (CAST(deck_wins AS FLOAT) / deck_matches) DESC, deck_matches DESC
        LIMIT 1
        "#,
        placeholders
    );
    let mut best_deck_q = sqlx::query_as::<_, (String, i64, i64)>(&best_deck_sql);
    for id in &grp_ids {
        best_deck_q = best_deck_q.bind(*id);
    }
    let best_deck = best_deck_q.fetch_optional(pool).await.ok().flatten().map(|(name, m_cnt, w_cnt)| {
        let wr = if m_cnt > 0 { (w_cnt as f64 / m_cnt as f64) * 100.0 } else { 0.0 };
        serde_json::json!({
            "name": name,
            "matches": m_cnt,
            "wins": w_cnt,
            "win_rate": wr.round() as i64,
        })
    });

    let printings: Vec<serde_json::Value> = printings_rows.iter().map(|r| {
        let raw_cmc: i64 = r.get("cmc");
        let mana_cost: Option<String> = r.get("mana_cost");
        let cmc = if raw_cmc == 0 { card_db::parse_mtga_cmc(mana_cost.as_deref().unwrap_or("")) } else { raw_cmc };
        serde_json::json!({
            "grp_id": r.get::<i64, _>("grp_id"),
            "name": r.get::<Option<String>, _>("name"),
            "mana_cost": mana_cost,
            "cmc": cmc,
            "colors": r.get::<Option<String>, _>("colors"),
            "color_identity": r.get::<Option<String>, _>("color_identity"),
            "set_code": r.get::<Option<String>, _>("set_code"),
            "set_name": r.get::<Option<String>, _>("set_name"),
            "set_released_at": r.get::<Option<String>, _>("set_released_at"),
            "rarity": r.get::<i64, _>("rarity"),
            "card_type": r.get::<Option<String>, _>("card_type"),
            "collector_number": r.get::<Option<String>, _>("collector_number"),
        })
    }).collect();

    let decks_list: Vec<String> = decks.iter().map(|(d,)| d.clone()).collect();

    let win_rate = if matches_played > 0 {
        ((wins_when_played as f64 / matches_played as f64) * 100.0).round() as i64
    } else {
        0
    };

    Ok(serde_json::json!({
        "printings": printings,
        "stats": {
            "deck_count": decks_list.len(),
            "decks": decks_list,
            "matches_played": matches_played,
            "wins_when_played": wins_when_played,
            "losses_when_played": matches_played.saturating_sub(wins_when_played),
            "win_rate": win_rate,
            "times_impactful": impactful.0,
            "total_damage": impactful.1,
            "max_hit": impactful.2,
            "damage_to_player": impactful.3,
            "damage_to_permanents": impactful.4,
            "damage_combat": impactful.5,
            "damage_spell": impactful.6,
            "turn_distribution": turn_distribution,
            "avg_cast_turn": avg_cast_turn,
            "best_deck": best_deck,
        },
    }))
}

/// Manual collection correction (backend capability this milestone; UI lands
/// with the Collection milestone). Sets a card's owned_count to an explicit
/// value clamped to [0,4]. A value of 0 removes the card from the collection.
#[tauri::command]
async fn update_collection_card_count(grp_id: i64, count: i64) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.set_collection_card_count(grp_id, count).await.map_err(|e| e.to_string())?;
    let owned = db.is_card_owned(grp_id).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "grp_id": grp_id, "owned": owned }))
}

type CollectionQuery<'q> = sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>;

#[derive(Clone, Debug, PartialEq)]
enum QBind {
    Str(String),
    Int(i64),
}

fn apply_binds<'q>(q: CollectionQuery<'q>, binds: &'q [QBind]) -> CollectionQuery<'q> {
    let mut q = q;
    for b in binds {
        match b {
            QBind::Str(s) => { q = q.bind(s.as_str()); }
            QBind::Int(i) => { q = q.bind(i); }
        }
    }
    q
}

/// grp_id -> owned_count for every owned card. Ownership is monotonic from
/// draws/decklist uploads, so `owned_count > 0` is the single owned predicate.
async fn owned_counts(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<std::collections::HashMap<i64, i64>, String> {
    let rows = sqlx::query("SELECT grp_id, owned_count FROM collection_cards WHERE owned_count > 0")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for r in rows {
        map.insert(r.get::<i64, _>("grp_id"), r.get::<i64, _>("owned_count"));
    }
    Ok(map)
}

/// All grp_ids currently owned, as a set (for membership checks).
async fn owned_grp_ids(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<std::collections::HashSet<i64>, String> {
    Ok(owned_counts(pool).await?.into_keys().collect())
}

/// Card-level ownership of a deck: how many of its distinct grp_ids are owned.
/// Returns (owned_cards, total_cards, pct). pct is 0.0 when total is 0.
fn ownership_stats(
    deck_grps: &std::collections::HashSet<i64>,
    owned: &std::collections::HashSet<i64>,
) -> (i64, i64, f64) {
    let total = deck_grps.len() as i64;
    let owned_cards = deck_grps.iter().filter(|g| owned.contains(g)).count() as i64;
    let pct = if total > 0 { (owned_cards as f64 / total as f64) * 100.0 } else { 0.0 };
    (owned_cards, total, pct)
}

/// Dynamic WHERE clauses + bind values for the collection query over cards_cache
/// (`c.` alias). Supports multi-select sets, multi-select colors (incl. colorless
/// "C"), multi-select rarities, card type substring, name search, and an exact
/// mana value (CMC) filter.
fn collection_filter_clauses(
    sets: &[String],
    colors: &[String],
    rarities: &[i64],
    types: &[String],
    search: &Option<String>,
    cmc: &Option<i64>,
) -> (Vec<String>, Vec<QBind>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut binds: Vec<QBind> = Vec::new();

    if !sets.is_empty() {
        let placeholders = sets.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        clauses.push(format!("c.set_code IN ({})", placeholders));
        for s in sets { binds.push(QBind::Str(s.clone())); }
    }

    // color_identity stores MTGA numeric codes (1=W 2=U 3=B 4=R 5=G), wrapped
    // in commas so a single-letter match can't hit multi-digit codes. Colorless
    // "C" matches empty/null identity.
    let mut color_clauses: Vec<String> = Vec::new();
    for color in colors {
        match color.as_str() {
            "W" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',1,') > 0".to_string()); }
            "U" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',2,') > 0".to_string()); }
            "B" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',3,') > 0".to_string()); }
            "R" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',4,') > 0".to_string()); }
            "G" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',5,') > 0".to_string()); }
            "C" => { color_clauses.push("(c.color_identity IS NULL OR c.color_identity = '')".to_string()); }
            _ => {}
        }
    }
    if !color_clauses.is_empty() {
        // Multi-select colors behave like Deck Library: OR across selected
        // colors (a card matching any selected identity color is shown).
        clauses.push(format!("({})", color_clauses.join(" OR ")));
    }

    if !rarities.is_empty() {
        let placeholders = rarities.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        clauses.push(format!("c.rarity IN ({})", placeholders));
        for r in rarities { binds.push(QBind::Int(*r)); }
    }

    if !types.is_empty() {
        let mut type_clauses: Vec<String> = Vec::new();
        for t in types {
            type_clauses.push("LOWER(COALESCE(c.card_type, '')) LIKE ?".to_string());
            binds.push(QBind::Str(format!("%{}%", t.to_lowercase())));
        }
        clauses.push(format!("({})", type_clauses.join(" OR ")));
    }

    if let Some(search) = search {
        clauses.push("LOWER(c.name) LIKE ?".to_string());
        binds.push(QBind::Str(format!("%{}%", search.to_lowercase())));
    }

    // Exact mana value (CMC). The cache's cmc column is reliable (backfilled).
    // "8+" (cmc value 8) means 8 or more.
    if let Some(mv) = cmc {
        if *mv >= 8 {
            clauses.push("c.cmc >= ?".to_string());
            binds.push(QBind::Int(*mv));
        } else {
            clauses.push("c.cmc = ?".to_string());
            binds.push(QBind::Int(*mv));
        }
    }

    (clauses, binds)
}

fn collection_name_key(v: &serde_json::Value) -> String {
    v.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase()
}

fn sort_collection_cards(cards: &mut Vec<serde_json::Value>, sort: &str, sort_dir: &str) {
    match sort {
        "cmc" => cards.sort_by(|a, b| {
            a.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&b.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "rarity" => cards.sort_by(|a, b| {
            a.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&b.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "set" => cards.sort_by(|a, b| {
            a.get("set_code").and_then(|v| v.as_str()).unwrap_or("")
                .cmp(b.get("set_code").and_then(|v| v.as_str()).unwrap_or(""))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "count" => cards.sort_by(|a, b| {
            b.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&a.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "released" => cards.sort_by(|a, b| {
            a.get("set_released_at").and_then(|v| v.as_str()).unwrap_or("")
                .cmp(b.get("set_released_at").and_then(|v| v.as_str()).unwrap_or(""))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        _ => cards.sort_by(|a, b| collection_name_key(a).cmp(&collection_name_key(b))),
    }
    if sort_dir.eq_ignore_ascii_case("desc") {
        cards.reverse();
    }
}

/// Full collection browse/filter query, shared by the IPC command and tests.
///
/// Universe: every card in the local MTGA card database (cards_cache). This is
/// the full set of Arena cards (incl. all printings across sets), so filtering
/// by "Not Collected" + a set shows every card that set contains, not just the
/// ones that appear in uploaded True Decklists. `owned_count` comes from
/// collection_cards (0 when a card has no ownership signal).
///
/// `owned` filter: "all" = every cached card, "owned" = owned_count > 0,
/// "unowned" = cached cards with owned_count = 0.
///
/// Multi-select filters: `sets` (Vec<String> set codes), `colors`
/// A single printing's card metadata (no ownership — that's joined per-query).
#[derive(Clone)]
struct UniverseCard {
    grp_id: i64,
    name: String,
    mana_cost: Option<String>,
    cmc: i64,
    colors: Option<String>,
    color_identity: Option<String>,
    set_code: Option<String>,
    set_name: Option<String>,
    set_released_at: Option<String>,
    rarity: i64,
    card_type: Option<String>,
}

/// Process-wide cache of the full card universe (every printing in cards_cache,
/// ~26k rows), keyed by database filename so parallel tests (each with their own
/// temp DB) never collide. cards_cache is static during a run, so the cache only
/// needs invalidating when set metadata changes.
static UNIVERSE_CACHE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<Vec<UniverseCard>>>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// Identity of a pool's database file (cache key).
fn universe_db_key(pool: &sqlx::Pool<sqlx::Sqlite>) -> String {
    pool.connect_options().as_ref().clone().get_filename().to_string_lossy().to_string()
}

/// Load every printing's metadata from cards_cache (joined to sets_metadata for
/// set display names / release dates). This is the slow query — cached after the
/// first build so subsequent collection queries run entirely in memory.
async fn build_universe(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<Vec<UniverseCard>, String> {
    let rows = sqlx::query(
        r#"
        SELECT c.grp_id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity,
               c.set_code, c.rarity, c.card_type,
               sm.name as set_name, sm.released_at as set_released_at
        FROM cards_cache c
        LEFT JOIN sets_metadata sm ON c.set_code = sm.set_code
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let raw_cmc: i64 = r.get("cmc");
        let mana_cost: Option<String> = r.get("mana_cost");
        let cmc = if raw_cmc == 0 { card_db::parse_mtga_cmc(mana_cost.as_deref().unwrap_or("")) } else { raw_cmc };
        out.push(UniverseCard {
            grp_id: r.get("grp_id"),
            name: r.get::<String, _>("name"),
            mana_cost,
            cmc,
            colors: r.get("colors"),
            color_identity: r.get("color_identity"),
            set_code: r.get("set_code"),
            set_name: r.get("set_name"),
            set_released_at: r.get("set_released_at"),
            rarity: r.get("rarity"),
            card_type: r.get("card_type"),
        });
    }
    Ok(out)
}

/// Return the cached card universe, building it lazily on first call. The build
/// (a 26k-row query) happens at most once per process; pre-warmed at startup so
/// the first Card Library visit is instant.
async fn get_universe(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<std::sync::Arc<Vec<UniverseCard>>, String> {
    let key = universe_db_key(pool);
    {
        let guard = UNIVERSE_CACHE.lock().unwrap();
        if let Some(u) = guard.get(&key) {
            return Ok(u.clone());
        }
    }
    let built = std::sync::Arc::new(build_universe(pool).await?);
    let mut guard = UNIVERSE_CACHE.lock().unwrap();
    guard.entry(key).or_insert_with(|| built.clone());
    Ok(built)
}

/// Drop the cached universe for every database. Used when set metadata is
/// refreshed and by tests that seed their own cards_cache.
fn clear_universe_cache() {
    UNIVERSE_CACHE.lock().unwrap().clear();
}

/// Merge per-printing card entries by name into a single row per card (like
/// Arena's collection). Owned copies sum across printings, capped at 4; the
/// representative keeps the newest printing's set/art.
fn merge_collection_by_name(cards: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    let mut merged: Vec<serde_json::Value> = Vec::new();
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for card in cards {
        let name = card.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if let Some(&i) = index.get(&name) {
            let existing = &mut merged[i];
            let have = existing.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let add = card.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0);
            existing["owned_count"] = serde_json::json!((have + add).min(4));
            // Keep the newer printing (higher release date) for set/art.
            let cur_rel = existing.get("set_released_at").and_then(|v| v.as_str()).unwrap_or("");
            let new_rel = card.get("set_released_at").and_then(|v| v.as_str()).unwrap_or("");
            if new_rel > cur_rel {
                *existing = card;
                existing["owned_count"] = serde_json::json!((have + add).min(4));
            }
        } else {
            index.insert(name.clone(), merged.len());
            merged.push(card);
        }
    }
    merged
}

/// (Vec<String> W/U/B/R/G/C), `rarities` (Vec<i64>), `types` (Vec<String>
/// card-type substrings), plus `search` (name substring). `sort` + `sort_dir`.
///
/// Returns the FULL filtered/sorted/merged list (no server-side pagination) so
/// the frontend can re-slice instantly on window resize. The card universe is
/// served from a process-wide cache built once (see `get_universe`), making
/// every query run in memory (milliseconds) instead of re-loading all ~26k
/// cards from SQLite.
async fn query_collection(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    filters: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let owned_filter = filters.get("owned").and_then(|v| v.as_str()).unwrap_or("all").to_string();

    let sets: Vec<String> = filters.get("sets")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let colors: Vec<String> = filters.get("colors")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let rarities: Vec<i64> = filters.get("rarities")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|r| r.as_i64()).collect())
        .unwrap_or_default();
    let types: Vec<String> = filters.get("types")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let search_filter = filters.get("search").and_then(|v| v.as_str())
        .map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let cmc_filter = filters.get("cmc").and_then(|v| v.as_i64());
    let sort = filters.get("sort").and_then(|v| v.as_str()).unwrap_or("name").to_string();
    let sort_dir = filters.get("sort_dir").and_then(|v| v.as_str()).unwrap_or("asc").to_string();

    // Cached full card universe (all printings) + fresh owned counts.
    let universe = get_universe(pool).await?;
    let owned = owned_counts(pool).await?;

    // 1. Build a full metadata list with owned_count joined in.
    let mut cards: Vec<serde_json::Value> = Vec::with_capacity(universe.len());
    for uc in universe.iter() {
        let owned_count = owned.get(&uc.grp_id).copied().unwrap_or(0);
        cards.push(serde_json::json!({
            "grp_id": uc.grp_id,
            "name": uc.name,
            "mana_cost": uc.mana_cost,
            "cmc": uc.cmc,
            "colors": uc.colors,
            "color_identity": uc.color_identity,
            "set_code": uc.set_code,
            "set_name": uc.set_name,
            "set_released_at": uc.set_released_at,
            "rarity": uc.rarity,
            "card_type": uc.card_type,
            "owned_count": owned_count,
        }));
    }

    // 1b. Global collection stats over the FULL universe (every card in the
    //     client), independent of the current filters — the footer's
    //     "owned / all cards in client" figure. Merged by name so the counts
    //     reflect unique cards, like the collection grid.
    let global_merged = merge_collection_by_name(cards.clone());
    let total_cards_global = global_merged.len() as i64;
    let total_owned_cards_global = global_merged.iter()
        .filter(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0)
        .count() as i64;
    let total_owned_copies_all_global: i64 = global_merged.iter()
        .filter_map(|c| c.get("owned_count").and_then(|v| v.as_i64()))
        .sum();

    // 2. Metadata filters in memory (mirrors the previous SQL WHERE clauses,
    //    applied per-printing BEFORE the by-name merge so results match).
    if !sets.is_empty() {
        cards.retain(|c| {
            c.get("set_code").and_then(|v| v.as_str())
                .map(|s| sets.iter().any(|x| x == s)).unwrap_or(false)
        });
    }
    if !colors.is_empty() {
        cards.retain(|c| {
            let ci = c.get("color_identity").and_then(|v| v.as_str()).unwrap_or("");
            colors.iter().any(|col| match col.as_str() {
                "C" => ci.trim().is_empty(),
                "W" => ci.split(',').any(|p| p == "1"),
                "U" => ci.split(',').any(|p| p == "2"),
                "B" => ci.split(',').any(|p| p == "3"),
                "R" => ci.split(',').any(|p| p == "4"),
                "G" => ci.split(',').any(|p| p == "5"),
                _ => false,
            })
        });
    }
    if !rarities.is_empty() {
        cards.retain(|c| {
            c.get("rarity").and_then(|v| v.as_i64())
                .map(|r| rarities.contains(&r)).unwrap_or(false)
        });
    }
    if !types.is_empty() {
        cards.retain(|c| {
            let ct = c.get("card_type").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            types.iter().any(|t| ct.contains(&t.to_lowercase()))
        });
    }
    if let Some(search) = &search_filter {
        let q = search.to_lowercase();
        cards.retain(|c| {
            c.get("name").and_then(|v| v.as_str())
                .map(|n| n.to_lowercase().contains(&q)).unwrap_or(false)
        });
    }
    if let Some(mv) = cmc_filter {
        cards.retain(|c| {
            let cmc = c.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
            if mv >= 8 { cmc >= mv } else { cmc == mv }
        });
    }

    // 3. Merge duplicate printings of the same card name into a single entry
    //    (like Arena's collection: one row per card, not per printing). Copies
    //    sum across printings, capped at 4. The representative keeps the newest
    //    printing's set/art.
    cards = merge_collection_by_name(cards);

    // 4. Ownership filter. `owned` = collected (>=1), `unowned` = not collected.
    //    An exact `copies` value (1..=4) narrows to exactly that many copies.
    let copies = filters.get("copies").and_then(|v| v.as_u64());
    if owned_filter == "owned" {
        cards.retain(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0);
    } else if owned_filter == "unowned" {
        cards.retain(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) == 0);
    }
    if let Some(n) = copies {
        let n = n.min(4) as i64;
        cards.retain(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) == n);
    }

    sort_collection_cards(&mut cards, &sort, &sort_dir);

    let filtered_count = cards.len() as i64;

    // Ownership stats over the filtered set (page-scoped, unused by the UI).
    let total_owned_cards_filtered = cards.iter()
        .filter(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0)
        .count() as i64;
    let owned_grp_ids: Vec<i64> = cards.iter()
        .filter(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0)
        .filter_map(|c| c.get("grp_id").and_then(|v| v.as_i64()))
        .collect();
    let total_owned_copies_filtered: i64 = cards.iter()
        .filter_map(|c| c.get("owned_count").and_then(|v| v.as_i64()))
        .sum();

    Ok(serde_json::json!({
        "cards": cards,
        "page": 1,
        "page_size": filtered_count,
        "total_pages": 1,
        "summary": {
            "total_cards": total_cards_global,
            "owned_cards": total_owned_cards_filtered,
            "owned_grp_ids": owned_grp_ids,
            "total_owned_copies": total_owned_copies_filtered,
            "total_owned_cards": total_owned_cards_global,
            "total_owned_copies_all": total_owned_copies_all_global,
        },
    }))
}

#[tauri::command]
async fn get_collection(filters: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let filters = filters.unwrap_or_else(|| serde_json::json!({}));
    query_collection(db.pool(), &filters).await
}

/// Set display metadata (name + release date) for sets present in the user's
/// collection (decklist-derived cards), sorted by release date (newest first).
/// Also reports how many sets are known locally and when they were last updated.
#[tauri::command]
async fn get_set_metadata() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let rows = sqlx::query(
        r#"
        SELECT DISTINCT c.set_code as set_code, sm.name as name, sm.released_at as released_at,
               sm.icon_svg_uri as icon_svg_uri
        FROM cards_cache c
        JOIN (
            SELECT je.value->>'grp_id' as grp_id
            FROM deck_lists dl, json_each(dl.cards_json) je
        ) d ON c.grp_id = d.grp_id
        LEFT JOIN sets_metadata sm ON c.set_code = sm.set_code
        WHERE c.set_code IS NOT NULL AND c.set_code != ''
        ORDER BY sm.released_at DESC, sm.name ASC
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let sets: Vec<serde_json::Value> = rows.iter().map(|r| {
        serde_json::json!({
            "set_code": r.get::<Option<String>,_>("set_code"),
            "name": r.get::<Option<String>,_>("name"),
            "released_at": r.get::<Option<String>,_>("released_at"),
            "icon_svg_uri": r.get::<Option<String>,_>("icon_svg_uri"),
        })
    }).collect();

    let meta_row = sqlx::query_scalar::<_, Option<String>>(
        "SELECT MAX(updated_at) FROM sets_metadata"
    )
    .fetch_one(db.pool())
    .await
    .map_err(|e| e.to_string())?;
    let known_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sets_metadata")
        .fetch_one(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "sets": sets,
        "known_count": known_count,
        "last_updated": meta_row,
    }))
}

/// Persist Scryfall set metadata (name + release date) into sets_metadata.
/// The frontend fetches https://api.scryfall.com/sets and passes the list here.
#[tauri::command]
async fn refresh_set_metadata(sets: serde_json::Value) -> Result<serde_json::Value, String> {
    // Set names/release dates feed the cached card universe, so drop it so the
    // next collection query rebuilds with the fresh metadata.
    clear_universe_cache();
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let arr = sets.as_array().cloned().unwrap_or_default();
    let mut count = 0usize;
    for s in &arr {
        // Accept both scryfall field names and our normalised names.
        let code = s.get("code")
            .or_else(|| s.get("set_code"))
            .and_then(|v| v.as_str())
            .map(|c| c.to_uppercase())
            .unwrap_or_default();
        let name = s.get("name")
            .or_else(|| s.get("set_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("").to_string();
        let released_at = s.get("released_at").and_then(|v| v.as_str()).map(|s| s.to_string());
        let icon_svg_uri = s.get("icon_svg_uri").and_then(|v| v.as_str()).map(|s| s.to_string());
        if code.is_empty() || name.is_empty() {
            continue;
        }
        sqlx::query(
            r#"
            INSERT INTO sets_metadata (set_code, name, released_at, icon_svg_uri, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(set_code) DO UPDATE SET
                name = excluded.name,
                released_at = COALESCE(excluded.released_at, sets_metadata.released_at),
                icon_svg_uri = COALESCE(excluded.icon_svg_uri, sets_metadata.icon_svg_uri),
                updated_at = excluded.updated_at
            "#
        )
        .bind(&code)
        .bind(&name)
        .bind(&released_at)
        .bind(&icon_svg_uri)
        .bind(&now)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(serde_json::json!({ "updated": count, "at": now }))
}

/// Directory where downloaded Scryfall card images are cached locally so they
/// never need re-fetching (avoids the API rate limit on repeat renders).
/// Lives under Tauri's appConfigDir (~/.config/com.rhystic.tracker) so the
/// asset protocol scope ($APPCONFIG/cardimg/*) covers it.
fn card_img_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let img_dir = dir.join("cardimg");
    std::fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;
    Ok(img_dir)
}

fn card_img_filename(name: &str, version: &str) -> String {
    // Sanitized name + version; stable across calls for the same card.
    let mut s: String = name.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    s.truncate(80);
    format!("{}_{}.img", s, version)
}

/// Save a downloaded card image (bytes) to the local cache. Returns the file
/// path the frontend can pass to convertFileSrc.
#[tauri::command]
fn save_card_image(app: tauri::AppHandle, name: String, version: String, data: Vec<u8>) -> Result<String, String> {
    let path = card_img_cache_dir(&app)?.join(card_img_filename(&name, &version));
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// If a card image is already cached locally, return its file path (for
/// convertFileSrc); otherwise null.
#[tauri::command]
fn has_card_image(app: tauri::AppHandle, name: String, version: String) -> Result<Option<String>, String> {
    let path = card_img_cache_dir(&app)?.join(card_img_filename(&name, &version));
    if path.exists() {
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Per-deck "% owned" stats. Uses the True Decklist when one is imported,
/// else falls back to the deck's logged player-side cards. pct is card-level
/// (owned distinct grp_ids / total distinct grp_ids).
async fn query_deck_owned_stats(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    deck_name: &str,
) -> Result<serde_json::Value, String> {
    use std::collections::{HashMap, HashSet};

    let list_row = sqlx::query("SELECT cards_json FROM deck_lists WHERE deck_name = ?")
        .bind(deck_name)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let has_list = list_row.is_some();

    let mut by_card: Vec<serde_json::Value> = Vec::new();
    let mut deck_grps: HashSet<i64> = HashSet::new();

    if let Some(row) = list_row {
        let cards_json: String = row.get("cards_json");
        let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        for entry in entries {
            let grp_id: i64 = entry.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let count: i64 = entry.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            if grp_id > 0 {
                deck_grps.insert(grp_id);
                by_card.push(serde_json::json!({ "grp_id": grp_id, "count": count, "name": null, "owned_count": 0 }));
            }
        }
    } else {
        let rows = sqlx::query(
            r#"
            SELECT mc.grp_id as grp_id, MAX(mc.count) as count
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
            GROUP BY mc.grp_id
            "#
        )
        .bind(deck_name)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        for r in rows {
            let grp_id: i64 = r.get("grp_id");
            let count: i64 = r.get("count");
            deck_grps.insert(grp_id);
            by_card.push(serde_json::json!({ "grp_id": grp_id, "count": count, "name": null, "owned_count": 0 }));
        }
    }

    let owned_map = owned_counts(pool).await?;
    let owned_set: HashSet<i64> = owned_map.keys().cloned().collect();

    let all_ids: Vec<i64> = deck_grps.iter().cloned().collect();
    let mut name_map: HashMap<i64, String> = HashMap::new();
    if !all_ids.is_empty() {
        let placeholders = all_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let q = format!("SELECT grp_id, name FROM cards_cache WHERE grp_id IN ({})", placeholders);
        let mut q = sqlx::query(&q);
        for id in &all_ids { q = q.bind(*id); }
        let rows = q.fetch_all(pool).await.map_err(|e| e.to_string())?;
        for r in rows {
            name_map.insert(r.get::<i64, _>("grp_id"), r.get::<String, _>("name"));
        }
    }

    for card in &mut by_card {
        let gid = card.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
        card["name"] = serde_json::json!(
            name_map.get(&gid).cloned().unwrap_or_else(|| format!("Unknown Card (#{})", gid))
        );
        card["owned_count"] = serde_json::json!(owned_map.get(&gid).copied().unwrap_or(0));
    }

    let (owned_cards, total_cards, pct) = ownership_stats(&deck_grps, &owned_set);
    let owned_pct = if total_cards > 0 { (pct * 10.0).round() / 10.0 } else { 0.0 };

    Ok(serde_json::json!({
        "has_list": has_list,
        "total_cards": total_cards,
        "owned_cards": owned_cards,
        "owned_pct": owned_pct,
        "by_card": by_card,
    }))
}

#[tauri::command]
async fn get_deck_owned_stats(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    query_deck_owned_stats(db.pool(), &deck_name).await
}

#[tauri::command]
async fn get_commander_info(
    player_commander_id: Option<i64>, 
    opponent_commander_id: Option<i64>
) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let player_commander = if let Some(grp_id) = player_commander_id {
        card_db::get_card_metadata(db.pool(), grp_id).await.ok().flatten()
    } else {
        None
    };

    let opponent_commander = if let Some(grp_id) = opponent_commander_id {
        card_db::get_card_metadata(db.pool(), grp_id).await.ok().flatten()
    } else {
        None
    };

    Ok(serde_json::json!({
        "player_commander": player_commander,
        "opponent_commander": opponent_commander,
    }))
}

#[tauri::command]
async fn get_opponent_h2h_stats(opponent_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let row = sqlx::query(
        r#"
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches
        WHERE opponent_name = ?
        "#
    )
    .bind(&opponent_name)
    .fetch_one(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let total: i64 = row.get("total");
    let wins: i64 = row.get("wins");
    let losses: i64 = row.get("losses");
    let winrate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

    Ok(serde_json::json!({
        "opponent_name": opponent_name,
        "total_matches": total,
        "wins": wins,
        "losses": losses,
        "winrate": format!("{:.1}", winrate)
    }))
}

#[tauri::command]
async fn get_opponent_matches(opponent_name: String) -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    
    let raw_matches = sqlx::query(
        r#"
        SELECT id, timestamp, date_str, format, result, duration_seconds, turns, going_first,
               hero_deck_name, hero_commander_id, hero_life_end, opponent_name, opponent_commander_id,
               opponent_mulligans, opponent_life_end
        FROM matches
        WHERE opponent_name = ?
        ORDER BY timestamp DESC
        "#
    )
    .bind(&opponent_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in raw_matches {
        let match_id: String = row.get("id");
        let date_str: String = row.get("date_str");
        let format_name: String = row.get("format");
        let res: String = row.get("result");
        let turns: i64 = row.get("turns");
        let deck_name: Option<String> = row.get("hero_deck_name");
        let opp_name: Option<String> = row.get("opponent_name");

        let clean_format = parser::normalize_format(&format_name);

        result.push(serde_json::json!({
            "match_id": match_id,
            "date_str": date_str,
            "format_name": clean_format,
            "result": res,
            "turns": turns,
            "player_deck_name": deck_name.unwrap_or_else(|| "Unknown Deck".to_string()),
            "opponent_name": opp_name.unwrap_or_else(|| "Opponent".to_string()),
        }));
    }

    Ok(result)
}

/// Aggregates every distinct card the player logged while playing a deck
/// ("All Logged Cards"). Cards are grouped by resolved name (printings merged),
/// with a canonical grp_id for art, the max copies seen in any single match
/// (the practical deck count), the summed copies across all matches, and how
/// many of the deck's matches the card appeared in.
///
/// For Brawl decks, a commander color-identity filter is applied: cards whose
/// identity includes a color outside the commander's identity are dropped as
/// they cannot be part of the deck (a byproduct of legacy is_opponent logging
/// leaks). Colorless cards are always kept.
#[tauri::command]
async fn get_deck_cards(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // Determine the deck's format (single-format per deck in practice).
    let format: Option<String> = sqlx::query(
        r#"
        SELECT format FROM matches WHERE hero_deck_name = ? LIMIT 1
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.get("format"));

    let is_brawl = format.as_deref().map(|f| f.eq_ignore_ascii_case("brawl")).unwrap_or(false);

    // Dominant commander color identity for Brawl decks.
    let mut commander_identity: Vec<String> = Vec::new();
    let mut commander_name: Option<String> = None;
    let mut commander_grp_id: Option<i64> = None;
    let mut commander_mana_cost: Option<String> = None;
    let mut commander_rarity: Option<i64> = None;
    if is_brawl {
        let cmd_row = sqlx::query(
            r#"
            SELECT c.name, c.grp_id, c.color_identity, c.mana_cost, c.rarity FROM (
                SELECT m.hero_commander_id, COUNT(*) as n
                FROM matches m
                WHERE m.hero_deck_name = ? AND m.hero_commander_id IS NOT NULL
                GROUP BY m.hero_commander_id
                ORDER BY n DESC LIMIT 1
            ) top
            JOIN cards_cache c ON top.hero_commander_id = c.grp_id
            "#
        )
        .bind(&deck_name)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;

        if let Some(r) = cmd_row {
            let ci: Option<String> = r.get("color_identity");
            if let Some(ci) = ci {
                commander_identity = parse_identity(ci);
            }
            commander_name = r.get("name");
            commander_grp_id = r.get("grp_id");
            commander_mana_cost = r.get("mana_cost");
            commander_rarity = r.get("rarity");
        }
    }

    let rows = sqlx::query(
        r#"
        SELECT c.name,
               MIN(c.grp_id) as grp_id,
               MAX(mc.count) as max_count,
               SUM(mc.count) as total_count,
               COUNT(DISTINCT mc.match_id) as match_freq,
               c.mana_cost, c.card_type, c.colors, c.color_identity, c.cmc, c.rarity, c.set_code
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
        GROUP BY c.name
        ORDER BY c.name ASC
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let total_matches: i64 = sqlx::query(
        r#"
        SELECT COUNT(*) as n FROM matches WHERE hero_deck_name = ?
        "#
    )
    .bind(&deck_name)
    .fetch_one(db.pool())
    .await
    .map_err(|e| e.to_string())?
    .get("n");

    let mut cards: Vec<serde_json::Value> = Vec::new();
    let mut filtered_identity: i64 = 0;
    for r in &rows {
        let name: Option<String> = r.get("name");
        let grp_id: i64 = r.get("grp_id");
        let max_count: i64 = r.get("max_count");
        let total_count: i64 = r.get("total_count");
        let match_freq: i64 = r.get("match_freq");

        // Brawl color-identity filter: drop cards outside the commander's identity.
        if is_brawl && !commander_identity.is_empty() {
            let ci: Option<String> = r.get("color_identity");
            let card_identity = parse_identity(ci.unwrap_or_default());
            let within = card_identity.is_empty() || card_identity.iter().all(|c| commander_identity.contains(c));
            if !within {
                filtered_identity += 1;
                continue;
            }
        }

        // Brawl singleton rule: only one copy of any card except basic lands.
        // Legacy logs sometimes recorded inflated counts (e.g. 3x of a singleton
        // Brawl card); the true-deck upload will fix that at the source, but for
        // now display Brawl decks as the rules dictate. Lands keep their count.
        let card_type = r.get::<Option<String>,_>("card_type");
        let is_land = card_type.as_deref().map(|t| t.to_lowercase().contains("land")).unwrap_or(false);
        let display_count = if is_brawl && !is_land {
            std::cmp::min(max_count, 1)
        } else {
            max_count
        };

        cards.push(serde_json::json!({
            "grp_id": grp_id,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "max_count": display_count,
            "total_count": total_count,
            "match_freq": match_freq,
            "mana_cost": r.get::<Option<String>,_>("mana_cost"),
            "card_type": card_type,
            "colors": r.get::<Option<String>,_>("colors"),
            "color_identity": r.get::<Option<String>,_>("color_identity"),
            "cmc": r.get::<i64,_>("cmc"),
            "rarity": r.get::<i64,_>("rarity"),
            "set_code": r.get::<Option<String>,_>("set_code"),
        }));
    }

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "format": format,
        "is_brawl": is_brawl,
        "commander_name": commander_name,
        "commander_grp_id": commander_grp_id,
        "commander_mana_cost": commander_mana_cost,
        "commander_rarity": commander_rarity,
        "commander_identity": commander_identity,
        "filtered_identity_count": filtered_identity,
        "total_matches": total_matches,
        "cards": cards,
        "card_count": cards.len(),
    }))
}

/// Parses an MTGA color_identity string (comma-separated codes, 1=W 2=U 3=B 4=R
/// 5=G) into a list of color letters. Colorless/empty returns an empty list.
fn parse_identity(s: String) -> Vec<String> {
    let mut out = Vec::new();
    for ch in s.chars() {
        let c = match ch {
            '1' | 'W' => "W",
            '2' | 'U' => "U",
            '3' | 'B' => "B",
            '4' | 'R' => "R",
            '5' | 'G' => "G",
            _ => "",
        };
        if !c.is_empty() && !out.iter().any(|o| o == c) {
            out.push(c.to_string());
        }
    }
    out
}

/// Imports a pasted MTGA deck export for a given deck, resolving every card to
/// a grp_id at import time and storing [{grp_id, count}] JSON. Import never
/// touches match_cards — it is an authoritative canonical list used for the
/// "True Decklist" view.
#[tauri::command]
async fn save_deck_list(deck_name: String, export_text: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let parsed = deck_list::parse_deck_export(db.pool(), &export_text).await?;

    let commander_grp = deck_list::commander_to_grp(db.pool(), parsed.commander.clone()).await
        .map_err(|e| e.to_string())?;
    let cards_json = deck_list::cards_to_json(&parsed.cards);
    let sideboard_json = deck_list::cards_to_json(&parsed.sideboard);

    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO deck_lists (deck_name, cards_json, sideboard_json, commander_grp_id, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'export', ?, ?)
        ON CONFLICT(deck_name) DO UPDATE SET
            cards_json = excluded.cards_json,
            sideboard_json = excluded.sideboard_json,
            commander_grp_id = excluded.commander_grp_id,
            updated_at = excluded.updated_at
        "#
    )
    .bind(&deck_name)
    .bind(&cards_json)
    .bind(&sideboard_json)
    .bind(commander_grp)
    .bind(&now)
    .bind(&now)
    .execute(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // Feed the draw-based collection from the TrueDeckList upload: each maindeck
    // card's owned_count is raised to max(current, min(listed, 4)) — monotonic,
    // never decreased (5th+ copies convert to Vault/gems in Arena, not ownership).
    for (grp_id, count) in &parsed.cards {
        if *grp_id > 0 {
            let _ = db.upsert_collection_from_decklist(*grp_id, *count).await;
        }
    }

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "card_count": parsed.cards.len(),
        "sideboard_count": parsed.sideboard.len(),
        "commander": parsed.commander,
        "unresolved": parsed.unresolved,
        "saved_at": now,
    }))
}

/// Delete a deck. Always removes its True Decklist (if any). When
/// `delete_matches` is true, also removes ALL of its match history (cascades
/// via FK to match_cards / match_turn_events / match_impactful_cards /
/// match_decks). When false, the deck's match history is kept. Deleting a deck
/// never touches collection_cards — cards remain owned in the library.
#[tauri::command]
async fn delete_deck(deck_name: String, delete_matches: bool) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // Remove the True Decklist row (no-op if there was none).
    sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?")
        .bind(&deck_name)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    let mut deleted_matches: u64 = 0;
    if delete_matches {
        let match_result = sqlx::query("DELETE FROM matches WHERE hero_deck_name = ?")
            .bind(&deck_name)
            .execute(db.pool())
            .await
            .map_err(|e| e.to_string())?;
        deleted_matches = match_result.rows_affected();
    }

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "delete_matches": delete_matches,
        "deleted_matches": deleted_matches,
    }))
}

/// Returns the stored True Decklist for a deck (resolved grp_ids), with card
/// metadata joined in, or null if none has been imported.
#[tauri::command]
async fn get_deck_list(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        r#"
        SELECT cards_json, sideboard_json, commander_grp_id, created_at, updated_at
        FROM deck_lists WHERE deck_name = ?
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Ok(serde_json::json!(null));
    };

    let cards_json: String = row.get("cards_json");
    let sideboard_json: Option<String> = row.get("sideboard_json");
    let commander_grp_id: Option<i64> = row.get("commander_grp_id");
    let created_at: String = row.get("created_at");
    let updated_at: String = row.get("updated_at");

    // Join card metadata for the stored grp_ids.
    let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
    let mut cards: Vec<serde_json::Value> = Vec::new();
    for entry in entries {
        let grp_id: i64 = entry.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let count: i64 = entry.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
        let meta = card_db::get_card_metadata(db.pool(), grp_id).await
            .map_err(|e| e.to_string())?
            .unwrap_or(card_db::CardMetadata {
                grp_id,
                name: format!("Unknown Card (#{})", grp_id),
                mana_cost: None, cmc: 0, colors: None, color_identity: None,
                set_code: None, rarity: 0, collector_number: None, card_type: None,
            });
        cards.push(serde_json::json!({
            "grp_id": grp_id,
            "count": count,
            "name": meta.name,
            "mana_cost": meta.mana_cost,
            "card_type": meta.card_type,
            "colors": meta.colors,
            "color_identity": meta.color_identity,
            "cmc": meta.cmc,
            "rarity": meta.rarity,
            "set_code": meta.set_code,
        }));
    }

    let sideboard: Vec<serde_json::Value> = match sideboard_json {
        Some(sj) => {
            let entries: Vec<serde_json::Value> = serde_json::from_str(&sj).unwrap_or_default();
            let mut out = Vec::new();
            for entry in entries {
                let grp_id: i64 = entry.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
                let count: i64 = entry.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
                let meta = card_db::get_card_metadata(db.pool(), grp_id).await
                    .map_err(|e| e.to_string())?
                    .unwrap_or(card_db::CardMetadata {
                        grp_id,
                        name: format!("Unknown Card (#{})", grp_id),
                        mana_cost: None, cmc: 0, colors: None, color_identity: None,
                        set_code: None, rarity: 0, collector_number: None, card_type: None,
                    });
                out.push(serde_json::json!({
                    "grp_id": grp_id, "count": count, "name": meta.name,
                    "mana_cost": meta.mana_cost, "card_type": meta.card_type,
                    "cmc": meta.cmc, "rarity": meta.rarity, "set_code": meta.set_code,
                }));
            }
            out
        }
        None => Vec::new(),
    };

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "commander_grp_id": commander_grp_id,
        "created_at": created_at,
        "updated_at": updated_at,
        "cards": cards,
        "sideboard": sideboard,
    }))
}

/// Reports whether a True Decklist exists for a deck and how many of the deck's
/// logged cards are absent from it (stale-mismatch indicator for the UI).
#[tauri::command]
async fn get_deck_list_status(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        "SELECT cards_json FROM deck_lists WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Ok(serde_json::json!({ "has_list": false }));
    };

    let cards_json: String = row.get("cards_json");
    let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
    let stored_names: std::collections::HashSet<String> = {
        let mut set = std::collections::HashSet::new();
        for e in entries {
            if let Some(id) = e.get("grp_id").and_then(|v| v.as_i64()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), id).await {
                    set.insert(meta.name);
                }
            }
        }
        set
    };

    // Logged distinct card names for this deck (player side).
    let logged_rows = sqlx::query(
        r#"
        SELECT DISTINCT c.name
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let logged_names: std::collections::HashSet<String> =
        logged_rows.iter().map(|r| r.get::<String,_>("name")).collect();
    let missing: Vec<&String> = logged_names.iter()
        .filter(|n| !stored_names.contains(*n))
        .collect();

    Ok(serde_json::json!({
        "has_list": true,
        "logged_count": logged_names.len(),
        "stored_count": stored_names.len(),
        "missing_count": missing.len(),
    }))
}

/// Exports a deck in the exact MTGA clipboard format the import accepts:
/// optional Commander section, then Deck, then optional Sideboard, with each
/// line "N Name (SET) collector_number". `source` selects the True Decklist
/// (from deck_lists) or All Logged Cards (aggregated from match_cards).
#[tauri::command]
async fn export_decklist(deck_name: String, source: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let use_true = source.eq_ignore_ascii_case("true");

    // Collect (grp_id, count) pairs for the chosen source.
    let mut commander_grp: Option<i64> = None;
    let mut entries: Vec<(i64, i64)> = Vec::new();

    if use_true {
        let row = sqlx::query(
            "SELECT cards_json, sideboard_json, commander_grp_id FROM deck_lists WHERE deck_name = ?"
        )
        .bind(&deck_name)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;

        let Some(row) = row else {
            return Ok(serde_json::json!({ "error": "No true decklist imported for this deck", "text": "" }));
        };

        commander_grp = row.get("commander_grp_id");
        let cards_json: String = row.get("cards_json");
        let v: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        for e in v {
            let grp = e.get("grp_id").and_then(|x| x.as_i64()).unwrap_or(0);
            let count = e.get("count").and_then(|x| x.as_i64()).unwrap_or(1);
            if grp > 0 { entries.push((grp, count)); }
        }
    } else {
        // Aggregated logged cards: distinct by name, canonical grp_id, sum of
        // per-match max copies as the count.
        let rows = sqlx::query(
            r#"
            SELECT c.name, MIN(c.grp_id) as grp_id, MAX(mc.count) as max_count
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            JOIN cards_cache c ON mc.grp_id = c.grp_id
            WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
            GROUP BY c.name
            ORDER BY c.name ASC
            "#
        )
        .bind(&deck_name)
        .fetch_all(db.pool())
        .await
        .map_err(|e| e.to_string())?;
        for r in &rows {
            let grp: i64 = r.get("grp_id");
            let count: i64 = r.get("max_count");
            entries.push((grp, count));
        }
    }

    // Format: "About\nName <deck>\n\nCommander\n...\n\nDeck\n..." — matches the
    // Moxfield/MTGA deck-name convention so re-imports preserve the deck name.
    let mut lines: Vec<String> = Vec::new();
    lines.push("About".to_string());
    lines.push(format!("Name {}", deck_name));

    if let Some(cgrp) = commander_grp {
        if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), cgrp).await {
            if let (Some(set), Some(num)) = (meta.set_code, meta.collector_number) {
                lines.push("".to_string());
                lines.push("Commander".to_string());
                lines.push(format!("1 {} ({}) {}", meta.name, set, num));
            }
        }
    }

    lines.push("".to_string());
    lines.push("Deck".to_string());
    for (grp, count) in &entries {
        if commander_grp == Some(*grp) { continue; } // commander already listed
        if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), *grp).await {
            match (meta.set_code, meta.collector_number) {
                (Some(set), Some(num)) => {
                    lines.push(format!("{} {} ({}) {}", count, meta.name, set, num));
                }
                _ => {
                    lines.push(format!("{} {}", count, meta.name));
                }
            }
        }
    }

    Ok(serde_json::json!({ "text": lines.join("\n") }))
}

#[tauri::command]
async fn get_match_cards(match_id: String) -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        r#"
        SELECT m.grp_id, m.is_opponent, m.count,
               c.name, c.card_type, c.mana_cost, c.colors, c.color_identity, c.set_code, c.rarity
        FROM match_cards m
        LEFT JOIN cards_cache c ON m.grp_id = c.grp_id
        WHERE m.match_id = ?
        ORDER BY m.is_opponent ASC, c.name ASC
        "#
    )
    .bind(match_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        let grp_id: i64 = r.get("grp_id");
        let is_opponent: bool = r.get("is_opponent");
        let count: i64 = r.get("count");
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let colors: Option<String> = r.get("colors");
        let set_code: Option<String> = r.get("set_code");
        let rarity: Option<i64> = r.get("rarity");

        result.push(serde_json::json!({
            "grp_id": grp_id,
            "is_opponent": is_opponent,
            "count": count,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
            "colors": colors,
            "set_code": set_code,
            "rarity": rarity.unwrap_or(0),
        }));
    }

    Ok(result)
}

#[tauri::command]
async fn get_match_turn_events(match_id: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    
    let match_row = sqlx::query("SELECT hero_seat_id, hero_deck_name, opponent_name FROM matches WHERE id = ?")
        .bind(&match_id)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    let hero_seat_id: u32 = match_row.as_ref().and_then(|r| r.try_get::<i64, _>("hero_seat_id").ok()).map(|s| s as u32).unwrap_or(1);

    let rows = sqlx::query(
        r#"
        SELECT e.turn_number, e.seat_id, e.event_type, e.grp_id, e.timestamp,
               c.name, c.card_type, c.mana_cost
        FROM match_turn_events e
        LEFT JOIN cards_cache c ON e.grp_id = c.grp_id
        WHERE e.match_id = ?
        ORDER BY e.turn_number ASC, e.id ASC
        "#
    )
    .bind(&match_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut events = Vec::new();
    for r in rows {
        let turn_number: i64 = r.get("turn_number");
        let seat_id: i64 = r.get("seat_id");
        let event_type: String = r.get("event_type");
        let grp_id: i64 = r.get("grp_id");
        let timestamp: String = r.get("timestamp");
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");

        events.push(serde_json::json!({
            "turn_number": turn_number,
            "seat_id": seat_id,
            "is_player": (seat_id as u32) == hero_seat_id,
            "event_type": event_type,
            "grp_id": grp_id,
            "timestamp": timestamp,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
        }));
    }

    Ok(serde_json::json!({
        "hero_seat_id": hero_seat_id,
        "events": events
    }))
}

#[tauri::command]
async fn get_impactful_cards(match_id: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let hero_row = sqlx::query("SELECT hero_seat_id FROM matches WHERE id = ?")
        .bind(&match_id)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;
    let hero_seat_id: i64 = hero_row.as_ref().and_then(|r| r.try_get("hero_seat_id").ok()).unwrap_or(1);

    // 1. Damage-tracked impactful cards (dealt damage during the match).
    let rows = sqlx::query(
        r#"
        SELECT i.grp_id, i.seat_id, i.total_damage, i.max_hit,
               i.damage_to_player, i.damage_to_permanents, i.damage_combat, i.damage_spell,
               c.name, c.card_type, c.mana_cost, c.rarity
        FROM match_impactful_cards i
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.match_id = ?
        "#
    )
    .bind(&match_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 2. High-mana cards that were actually PLAYED (cast) in the match, even if they
    //    dealt no damage. MTGA does not emit damage annotations for non-damaging cards,
    //    so we derive them from the play timeline + cards_cache mana cost.
    let played_rows = sqlx::query(
        r#"
        SELECT DISTINCT e.grp_id, e.seat_id,
               c.name, c.card_type, c.mana_cost, c.rarity
        FROM match_turn_events e
        LEFT JOIN cards_cache c ON e.grp_id = c.grp_id
        WHERE e.match_id = ? AND e.event_type = 'play'
        "#
    )
    .bind(&match_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // Merge: keep damage cards as-is; add high-CMC played cards not already present.
    let mut result: Vec<serde_json::Value> = Vec::new();
    let mut seen_grp: std::collections::HashSet<i64> = std::collections::HashSet::new();

    for r in rows {
        let grp_id: i64 = r.get("grp_id");
        let seat_id: i64 = r.get("seat_id");
        let total_damage: i64 = r.get("total_damage");
        let max_hit: i64 = r.get("max_hit");
        let damage_to_player: i64 = r.try_get("damage_to_player").unwrap_or(0);
        let damage_to_permanents: i64 = r.try_get("damage_to_permanents").unwrap_or(0);
        let damage_combat: i64 = r.try_get("damage_combat").unwrap_or(0);
        let damage_spell: i64 = r.try_get("damage_spell").unwrap_or(0);
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let rarity: Option<i64> = r.get("rarity");

        // Resolve mana value via get_card_metadata which falls back to parsing
        // the stored mana cost when cmc is 0 in the cache.
        let cmc = card_db::get_card_metadata(db.pool(), grp_id)
            .await.ok().flatten().map(|c| c.cmc).unwrap_or(0);

        // Impactful threshold: at least 5 total damage dealt.
        if total_damage < 5 {
            continue;
        }

        seen_grp.insert(grp_id);
        result.push(serde_json::json!({
            "grp_id": grp_id,
            "seat_id": seat_id,
            "is_opponent": seat_id != 0 && seat_id != hero_seat_id,
            "total_damage": total_damage,
            "max_hit": max_hit,
            "damage_to_player": damage_to_player,
            "damage_to_permanents": damage_to_permanents,
            "damage_combat": damage_combat,
            "damage_spell": damage_spell,
            "cmc": cmc,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
            "rarity": rarity.unwrap_or(0),
        }));
    }

    // Sort: damage cards first (by damage), then high-mana cards.
    result.sort_by(|a, b| {
        let da = a.get("total_damage").and_then(|v| v.as_i64()).unwrap_or(0);
        let db_ = b.get("total_damage").and_then(|v| v.as_i64()).unwrap_or(0);
        db_.cmp(&da)
    });

    Ok(serde_json::json!({
        "hero_seat_id": hero_seat_id,
        "cards": result
    }))
}

#[derive(Clone)]
pub struct SharedMatchState(pub std::sync::Arc<tokio::sync::Mutex<MatchAssembler>>);

#[tauri::command]
async fn get_live_match_state(state: tauri::State<'_, SharedMatchState>) -> Result<serde_json::Value, String> {
    let assembler = state.0.lock().await;
    if let Some(active) = &assembler.active_match {
        // Round = a full cycle where each player takes one turn. MTGA's turnNumber
        // increments once per player-turn, so Round 1 = turns 1 & 2, Round 2 = turns 3 & 4, etc.
        let round = (assembler.current_turn + 1) / 2;
        let last_event = assembler.turn_events.last().map(|e| serde_json::json!({
            "type": e.event_type,
            "grp_id": e.grp_id,
            "seat_id": e.seat_id,
            "is_player": e.seat_id == assembler.player_seat_id,
        }));

        // Build a merged chronological feed of card actions + life changes for the live HUD.
        let mut recent_events: Vec<serde_json::Value> = Vec::new();
        {
            let db_for_names = DatabaseManager::init().await.map_err(|e| e.to_string())?;

            // Build all feed entries tagged with their record sequence so card actions
            // and life changes interleave in the correct chronological order.
            let mut merged: Vec<(u64, serde_json::Value)> = Vec::new();

            for (e, seq) in assembler.turn_events.iter().zip(assembler.turn_event_seqs.iter()) {
                // Damage events are already formatted and provided via damage_feed_events.
                // Skip damage records here so they aren't processed as 'play' actions in the HUD feed.
                if e.event_type.starts_with("damage:") {
                    continue;
                }
                let meta = card_db::get_card_metadata(db_for_names.pool(), e.grp_id as i64).await.ok().flatten();
                let name = meta.as_ref().map(|c| c.name.clone()).unwrap_or_else(|| format!("#{}", e.grp_id));
                let card_type = meta.as_ref().and_then(|c| c.card_type.clone());
                merged.push((*seq, serde_json::json!({
                    "type": e.event_type,
                    "seat_id": e.seat_id,
                    "is_player": e.seat_id == assembler.player_seat_id,
                    "name": name,
                    "card_type": card_type,
                    "grp_id": e.grp_id,
                })));
            }

            for (turn, old, new, seat, seq) in assembler.life_events.iter() {
                let delta = new - old;
                merged.push((*seq, serde_json::json!({
                    "type": "life",
                    "seat_id": seat,
                    "is_player": *seat == assembler.player_seat_id,
                    "name": format!("{} → {} ({} {})", old, new, if delta >= 0 { "+" } else { "" }, delta),
                    "delta": delta,
                    "turn": turn,
                    "grp_id": 0,
                })));
            }

            for (dmg, seq) in assembler.damage_feed_events.iter() {
                let src_grp = assembler.instance_map.get(&dmg.source_instance_id).copied().unwrap_or(0);
                let src_seat = assembler.instance_owner_map.get(&dmg.source_instance_id).copied().unwrap_or(assembler.player_seat_id);
                let meta = card_db::get_card_metadata(db_for_names.pool(), src_grp as i64).await.ok().flatten();
                let src_name = meta.as_ref().map(|c| c.name.clone()).unwrap_or_else(|| format!("#{}", src_grp));
                let card_type = meta.as_ref().and_then(|c| c.card_type.clone());

                let target_name = if dmg.target_instance_id == assembler.player_seat_id {
                    "You".to_string()
                } else if dmg.target_instance_id == 1 || dmg.target_instance_id == 2 {
                    active.opponent_name.clone().unwrap_or_else(|| "Opponent".to_string())
                } else {
                    let tgt_grp = assembler.instance_map.get(&dmg.target_instance_id).copied().unwrap_or(0);
                    card_db::get_card_metadata(db_for_names.pool(), tgt_grp as i64)
                        .await.ok().flatten().map(|c| c.name).unwrap_or_else(|| "Permanent".to_string())
                };

                merged.push((*seq, serde_json::json!({
                    "type": "damage",
                    "seat_id": src_seat,
                    "is_player": src_seat == assembler.player_seat_id,
                    "name": src_name,
                    "card_type": card_type,
                    "target_name": target_name,
                    "amount": dmg.amount,
                    "damage_type": if dmg.damage_type == 1 { "Combat" } else { "Spell" },
                    "grp_id": src_grp,
                })));
            }

            merged.sort_by_key(|(seq, _)| *seq);
            // Keep only the most recent 30 entries.
            let mstart = merged.len().saturating_sub(30);
            recent_events = merged.into_iter().skip(mstart).map(|(_, ev)| ev).collect();
        }

        // Resolve commander names and deck colors from the card cache so the HUD can
        // display them without an extra IPC round-trip.
        let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
        let mut player_cmdr = None;
        let mut opp_cmdr = None;
        if let Some(gid) = assembler.cached_commander_id {
            player_cmdr = card_db::get_card_metadata(db.pool(), gid as i64).await.ok().flatten();
        }
        if let Some(gid) = active.opponent_commander_id {
            opp_cmdr = card_db::get_card_metadata(db.pool(), gid as i64).await.ok().flatten();
        }

        let mut player_colors: Vec<String> = Vec::new();
        let mut opp_colors: Vec<String> = Vec::new();
        let order = ["W", "U", "B", "R", "G"];

        // Aggregate colors from cards seen so far (live deck color identity).
        {
            use std::collections::HashSet;
            let mut ps = HashSet::new();
            let mut os = HashSet::new();
            for gid in assembler.player_cards_seen.keys() {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), *gid as i64).await {
                    for src in [meta.color_identity, meta.colors].into_iter().flatten() {
                        for ch in src.chars() {
                            if !ch.is_ascii_alphanumeric() { continue; }
                            match ch {
                                '1' | 'W' => { ps.insert("W".to_string()); },
                                '2' | 'U' => { ps.insert("U".to_string()); },
                                '3' | 'B' => { ps.insert("B".to_string()); },
                                '4' | 'R' => { ps.insert("R".to_string()); },
                                '5' | 'G' => { ps.insert("G".to_string()); },
                                _ => {}
                            }
                        }
                    }
                }
            }
            for gid in assembler.opp_cards_seen.keys() {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), *gid as i64).await {
                    for src in [meta.color_identity, meta.colors].into_iter().flatten() {
                        for ch in src.chars() {
                            if !ch.is_ascii_alphanumeric() { continue; }
                            match ch {
                                '1' | 'W' => { os.insert("W".to_string()); },
                                '2' | 'U' => { os.insert("U".to_string()); },
                                '3' | 'B' => { os.insert("B".to_string()); },
                                '4' | 'R' => { os.insert("R".to_string()); },
                                '5' | 'G' => { os.insert("G".to_string()); },
                                _ => {}
                            }
                        }
                    }
                }
            }
            player_colors = order.iter().filter(|c| ps.contains(**c)).map(|c| c.to_string()).collect();
            opp_colors = order.iter().filter(|c| os.contains(**c)).map(|c| c.to_string()).collect();
        }

        Ok(serde_json::json!({
            "is_active": true,
            "match_id": active.match_id,
            "format": active.format_name,
            "turn": assembler.current_turn,
            "round": round,
            "player_life": assembler.current_player_life,
            "opponent_life": assembler.current_opp_life,
            "opponent_name": active.opponent_name.as_deref().unwrap_or("Opponent"),
            "player_deck_name": active.player_deck_name,
            "player_commander": player_cmdr.map(|c| serde_json::json!({"grp_id": c.grp_id, "name": c.name})),
            "opponent_commander": opp_cmdr.map(|c| serde_json::json!({"grp_id": c.grp_id, "name": c.name})),
            "player_colors": player_colors,
            "opponent_colors": opp_colors,
            "player_cards_seen": assembler.player_cards_seen.len(),
            "opponent_cards_seen": assembler.opp_cards_seen.len(),
            "turn_events_count": assembler.turn_events.len(),
            "last_event": last_event,
            "recent_events": recent_events,
        }))
    } else {
        // No active match. If a match just completed, keep reporting its result
        // for a short window (10s) so the HUD can show a result overlay.
        if let Some((record, completed_at)) = &assembler.last_completed {
            let elapsed = chrono::Utc::now().signed_duration_since(*completed_at);
            if elapsed.num_seconds() < 10 {
                let reason = record.result_reason.as_deref().unwrap_or("");
                let reason_label = if reason.contains("Concede") {
                    if record.result == "win" { "Opponent Conceded" } else { "Player Conceded" }
                } else if reason.contains("Timeout") {
                    "Time Expired"
                } else {
                    if record.result == "win" { "Victory" } else { "Defeat" }
                };
                return Ok(serde_json::json!({
                    "is_active": false,
                    "just_completed": true,
                    "result": record.result,
                    "result_reason": record.result_reason,
                    "reason_label": reason_label,
                    "match_id": record.match_id,
                    "format": record.format_name,
                    "player_deck_name": record.player_deck_name,
                    "opponent_name": record.opponent_name,
                    "player_life": record.player_life_end.unwrap_or(20),
                    "opponent_life": record.opponent_life_end.unwrap_or(0),
                }));
            }
        }
        Ok(serde_json::json!({
            "is_active": false
        }))
    }
}

/// Restartable tailer supervisor. Reads the current effective log path from the
/// watch channel, runs the tailer + event processing, and restarts whenever the
/// path changes (e.g. after the user picks a new Player.log in Settings).
async fn run_tailer_supervisor(
    mut path_rx: tokio::sync::watch::Receiver<String>,
    db_manager: std::sync::Arc<DatabaseManager>,
    assembler_ref: std::sync::Arc<tokio::sync::Mutex<MatchAssembler>>,
) {
    loop {
        let path = PathBuf::from(path_rx.borrow().clone());
        println!("[TAILER] Supervisor starting tailer for path: {:?}", path);

        let (tx, rx) = mpsc::channel::<TailerEvent>(2000);
        let tailer = FileTailer::new_from_end(path, tx);
        let stop_handle = tailer.stop_handle();

        let tailer_task = tokio::spawn(tailer.run());
        let processing_task = tokio::spawn(process_tailer_events(rx, db_manager.clone(), assembler_ref.clone()));

        // Wait for either a path change (restart) or the event stream to end.
        // tokio::select! cancels the non-selected branches when one completes.
        tokio::select! {
            _ = path_rx.changed() => {
                println!("[TAILER] Log path changed; restarting tailer");
                stop_handle.store(false, std::sync::atomic::Ordering::Relaxed);
                let _ = tailer_task.await;
            }
            _ = processing_task => {
                println!("[TAILER] Event stream ended; restarting tailer");
                stop_handle.store(false, std::sync::atomic::Ordering::Relaxed);
                let _ = tailer_task.await;
            }
        }
    }
}

/// Record the submitted deck for a completed match in the `match_decks` audit
/// table (retained indefinitely). Used to detect preset decks that slip through
/// the keyword rules.
async fn record_match_deck_audit(
    db_manager: &std::sync::Arc<DatabaseManager>,
    assembler: &MatchAssembler,
    match_id: &str,
) {
    let deck_name = assembler.cached_deck_name.clone();
    let deck_id = assembler.cached_deck_id.clone();
    let (preset, reason) = match deck_name.as_deref() {
        Some(name) => match crate::deck_legitimacy::preset_deck_reason(name) {
            Some(r) => (true, Some(r)),
            None => (false, None),
        },
        None => (true, Some("no deck identity")),
    };
    let _ = db_manager.upsert_match_deck(match_id, deck_name.as_deref(), deck_id.as_deref(), preset, reason).await;
}

/// Process tailer events (line parsing / JSON buffering / match assembly).
async fn process_tailer_events(
    mut rx: mpsc::Receiver<TailerEvent>,
    db_manager: std::sync::Arc<DatabaseManager>,
    assembler_ref: std::sync::Arc<tokio::sync::Mutex<MatchAssembler>>,
) {
    let mut json_buffer = String::new();
    let mut brace_depth = 0;
    let mut in_json = false;

    while let Some(event) = rx.recv().await {
        if let TailerEvent::Line(line) = event {
            let trimmed = line.trim();

            if !in_json && trimmed.starts_with('{') {
                in_json = true;
                json_buffer.clear();
            }

            if in_json {
                json_buffer.push_str(&line);
                json_buffer.push('\n');

                for ch in line.chars() {
                    if ch == '{' { brace_depth += 1; }
                    else if ch == '}' { brace_depth -= 1; }
                }

                if brace_depth <= 0 {
                    in_json = false;
                    brace_depth = 0;
                    let payload_str = json_buffer.clone();
                    json_buffer.clear();

                    let mut assembler = assembler_ref.lock().await;

                    match parse_line(&payload_str) {
                        ParsedEvent::Auth { screen_name, client_id } => {
                            assembler.set_player_user_id(client_id.clone());
                            println!(
                                "[EVENT 1: AUTH] Authenticated User: screen_name = \"{}\", client_id = \"{}\"",
                                redact_str(&screen_name),
                                redact_str(&client_id)
                            );
                        }
                        ParsedEvent::MatchCreated { match_id, format_name, reserved_players } => {
                            assembler.start_match(match_id.clone(), format_name.clone());
                            assembler.update_reserved_players(&reserved_players);
                            println!(
                                "[EVENT 2: MATCH_CREATED] Match ID = \"{}\", Format = \"{}\", Player Seat = {}, Opponent = \"{}\"",
                                redact_str(&match_id),
                                format_name,
                                assembler.player_seat_id,
                                redact_str(assembler.active_match.as_ref().and_then(|m| m.opponent_name.as_deref()).unwrap_or("Unknown"))
                            );
                        }
                        ParsedEvent::DeckSubmitted { deck_name, commander_id, main_deck, deck_id, total_cards } => {
                            assembler.set_deck(deck_name.clone(), deck_id.clone(), commander_id, main_deck.clone());
                            println!(
                                "[EVENT 3: DECK_SUBMITTED] Deck = \"{}\", Deck ID = {:?}, Commander GRPID = {:?}, Total Cards = {}, Legitimate = {}",
                                deck_name,
                                deck_id,
                                commander_id,
                                total_cards,
                                assembler.match_legitimate
                            );
                        }
                        ParsedEvent::GameStateUpdateCombined { msg_id, objects, turn_number, life_by_seat, active_seat, damage_events } => {
                            // Advance the turn BEFORE processing objects so plays/draws in this
                            // message are attributed to the correct turn. MTGA only emits turnNumber
                            // at turn boundaries, so without this, cards played in later turns get
                            // stamped with the previous turn (causing impossible "round 1" plays).
                            if turn_number > 0 {
                                assembler.current_turn = turn_number;
                            }
                            for (instance_id, grp_id, owner_seat, zone_id) in objects {
                                assembler.process_game_object(instance_id, grp_id, owner_seat, zone_id);
                            }
                            for (instance_id, target_id, amount, dtype) in damage_events {
                                assembler.process_damage_event(instance_id, target_id, amount, dtype);
                            }
                            assembler.update_game_state(msg_id, turn_number, &life_by_seat, active_seat);
                            let draws = assembler.drain_collection_draws();
                            if !draws.is_empty() {
                                for g in draws {
                                    let _ = db_manager.add_collection_draw(g as i64).await;
                                }
                            }
                        }
                        ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                            if let Some((record, card_records, turn_events, impactful)) = assembler.complete_match(winning_team_id, &reason) {
                                println!(
                                    "[EVENT 6: MATCH_COMPLETED] Match ID = \"{}\", Result = \"{}\", Reason = \"{}\", Player End Life = {:?}, Opp End Life = {:?}, Turn Events Recorded = {}, Impactful Cards = {}",
                                    redact_str(&record.match_id),
                                    record.result,
                                    reason,
                                    record.player_life_end,
                                    record.opponent_life_end,
                                    turn_events.len(),
                                    impactful.len()
                                );
                                let _ = db_manager.upsert_match(&record, &card_records, &turn_events, &impactful).await;
                                record_match_deck_audit(&db_manager, &assembler, &record.match_id).await;
                            }
                        }
                        ParsedEvent::Unknown => {}
                    }
                }
            } else {
                let mut assembler = assembler_ref.lock().await;
                match parse_line(&line) {
                    ParsedEvent::Auth { screen_name, client_id } => {
                        assembler.set_player_user_id(client_id.clone());
                    }
                    ParsedEvent::MatchCreated { match_id, format_name, reserved_players } => {
                        assembler.start_match(match_id.clone(), format_name.clone());
                        assembler.update_reserved_players(&reserved_players);
                    }
                    ParsedEvent::DeckSubmitted { deck_name, commander_id, main_deck, deck_id, total_cards } => {
                        assembler.set_deck(deck_name.clone(), deck_id.clone(), commander_id, main_deck.clone());
                        println!(
                            "[EVENT 3: DECK_SUBMITTED] Deck = \"{}\", Deck ID = {:?}, Commander GRPID = {:?}, Total Cards = {}, Legitimate = {}",
                            deck_name,
                            deck_id,
                            commander_id,
                            total_cards,
                            assembler.match_legitimate
                        );
                    }
                    ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                        if let Some((record, card_records, turn_events, impactful)) = assembler.complete_match(winning_team_id, &reason) {
                            let _ = db_manager.upsert_match(&record, &card_records, &turn_events, &impactful).await;
                            record_match_deck_audit(&db_manager, &assembler, &record.match_id).await;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

fn main() {
    // CRITICAL: Must be set BEFORE GTK/WebKit initializes any display connections to prevent DMA-BUF Wayland protocol crashes on NVIDIA drivers
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let shared_assembler = std::sync::Arc::new(tokio::sync::Mutex::new(MatchAssembler::new()));
    let shared_state = SharedMatchState(shared_assembler.clone());

    // Launch Tauri Native App Window with tokio async setup
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(shared_state)
        .setup(move |app| {
            let assembler_ref = shared_assembler.clone();

            // Watch channel: set_log_path() pushes a new effective path and the
            // supervisor restarts the tailer on it.
            let (path_tx, path_rx) = tokio::sync::watch::channel(resolve_effective_log_path());
            app.manage(LogPathState { path_tx });

            tauri::async_runtime::spawn(async move {
                let db_manager = match DatabaseManager::init().await {
                    Ok(d) => std::sync::Arc::new(d),
                    Err(e) => {
                        eprintln!("[ERROR] DB init failed: {}", e);
                        return;
                    }
                };

                run_tailer_supervisor(path_rx, db_manager, assembler_ref).await;
            });

            // Pre-warm the collection card universe in the background so the
            // first Card Library visit renders immediately.
            tauri::async_runtime::spawn(async move {
                let db_manager = match DatabaseManager::init().await {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[ERROR] DB init failed: {}", e);
                        return;
                    }
                };
                let _ = get_universe(db_manager.pool()).await;
            });

            // 1. Construct System Tray Context Menu
            let open_item = MenuItem::with_id(app, "open", "Open Rhystic Tracker", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Rhystic Tracker", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            // 2. Build and register System Tray Icon
            let icon_bytes = include_bytes!("../icons/icon.png");
            let tray_icon = Image::from_bytes(icon_bytes)?;

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("Rhystic Tracker")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let settings = settings::load_settings();
                if settings.minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_active_theme,
            get_matches_count,
            get_recent_matches,
            get_deck_stats,
            get_deck_overview,
            get_deck_detail,
            get_deck_cards,
            save_deck_list,
            delete_deck,
            get_deck_list,
            get_deck_list_status,
            export_decklist,
            get_card_info,
            get_card_info_by_name,
            get_card_printings,
            update_collection_card_count,
            get_collection,
            get_set_metadata,
            refresh_set_metadata,
            save_card_image,
            has_card_image,
            get_deck_owned_stats,
            get_commander_info,
            get_opponent_h2h_stats,
            get_opponent_matches,
            get_match_cards,
            get_match_turn_events,
            get_impactful_cards,
            get_live_match_state,
            get_log_path,
            set_log_path,
            get_minimize_to_tray,
            set_minimize_to_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn seed_card(pool: &sqlx::Pool<sqlx::Sqlite>, grp_id: i64, name: &str, mana_cost: &str, ci: &str, set: &str, rarity: i64, card_type: &str) {
        sqlx::query(
            "INSERT INTO cards_cache (grp_id, name, mana_cost, cmc, colors, color_identity, set_code, rarity, collector_number, card_type, last_updated) \
             VALUES (?, ?, ?, 0, '', ?, ?, ?, '0', ?, DATETIME('now'))"
        )
        .bind(grp_id).bind(name).bind(mana_cost).bind(ci).bind(set).bind(rarity).bind(card_type)
        .execute(pool).await.expect("seed card");
    }

    async fn set_owned(pool: &sqlx::Pool<sqlx::Sqlite>, grp_id: i64, count: i64) {
        sqlx::query(
            "INSERT INTO collection_cards (grp_id, owned_count, provenance, first_seen_at, last_updated_at, draw_seen) \
             VALUES (?, ?, 'draw', '2026-01-01', '2026-01-01', 1)"
        )
        .bind(grp_id).bind(count)
        .execute(pool).await.expect("seed collection");
    }

    async fn seed_match(pool: &sqlx::Pool<sqlx::Sqlite>, match_id: &str, deck_name: &str) {
        sqlx::query(
            "INSERT INTO matches (id, timestamp, date_str, format, result, duration_seconds, turns, going_first, hero_deck_name) \
             VALUES (?, '2026-01-01T00:00:00Z', '2026-01-01', 'Brawl', 'win', 60, 5, 1, ?)"
        )
        .bind(match_id).bind(deck_name)
        .execute(pool).await.expect("seed match");
    }

    async fn seed_match_card(pool: &sqlx::Pool<sqlx::Sqlite>, match_id: &str, grp_id: i64, is_opponent: bool, count: i64) {
        sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES (?, ?, ?, ?)")
            .bind(match_id).bind(grp_id).bind(is_opponent).bind(count)
            .execute(pool).await.expect("seed match card");
    }

    async fn seed_decklist(pool: &sqlx::Pool<sqlx::Sqlite>, deck_name: &str, cards_json: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO deck_lists (deck_name, cards_json, sideboard_json, commander_grp_id, source, created_at, updated_at) \
             VALUES (?, ?, NULL, NULL, 'export', ?, ?)"
        )
        .bind(deck_name).bind(cards_json).bind(&now).bind(&now)
        .execute(pool).await.expect("seed decklist");
    }

    #[test]
    fn test_ownership_stats() {
        let deck: std::collections::HashSet<i64> = [1, 2, 3, 4].iter().cloned().collect();
        let owned: std::collections::HashSet<i64> = [1, 3].iter().cloned().collect();
        let (oc, tc, pct) = ownership_stats(&deck, &owned);
        assert_eq!((oc, tc), (2, 4));
        assert!((pct - 50.0).abs() < 0.001);
        let empty: std::collections::HashSet<i64> = std::collections::HashSet::new();
        let (oc, tc, pct) = ownership_stats(&empty, &owned);
        assert_eq!((oc, tc), (0, 0));
        assert_eq!(pct, 0.0);
    }

    #[test]
    fn test_collection_filter_clauses() {
        // Sets, colors, rarities, types are all multi-select arrays.
        let (clauses, binds) = collection_filter_clauses(
            &["LEA".to_string()],
            &["W".to_string()],
            &[2],
            &["angel".to_string()],
            &Some("dawn".to_string()),
            &None,
        );
        assert_eq!(clauses.len(), 5, "set + color + rarity + type + search");
        assert_eq!(binds.len(), 4, "set(1) + rarity(1) + type(1) + search(1); color is inline");
        assert_eq!(binds[0], QBind::Str("LEA".to_string()));
        assert!(clauses[1].contains(",1,"), "W color clause");

        // Colorless maps to empty/null identity.
        let (clauses, binds) = collection_filter_clauses(&[], &["C".to_string()], &[], &[], &None, &None);
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains("color_identity IS NULL"));
        assert!(binds.is_empty());

        // Multi-color OR across selected colors.
        let (clauses, binds) = collection_filter_clauses(&[], &["W".to_string(), "U".to_string()], &[], &[], &None, &None);
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains(" OR "));
        assert!(binds.is_empty());

        // Multi-set IN clause.
        let (clauses, binds) = collection_filter_clauses(&["LEA".to_string(), "LEG".to_string()], &[], &[], &[], &None, &None);
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains("c.set_code IN ("), "clause: {}", clauses[0]);
        assert_eq!(binds.len(), 2);

        // Multi-rarity IN clause.
        let (clauses, binds) = collection_filter_clauses(&[], &[], &[2, 4], &[], &None, &None);
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains("c.rarity IN ("), "clause: {}", clauses[0]);
        assert_eq!(binds.len(), 2);

        // Card type as OR'd LIKE clauses.
        let (clauses, binds) = collection_filter_clauses(&[], &[], &[], &["land".to_string(), "artifact".to_string()], &None, &None);
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains(" OR "));
        assert_eq!(binds.len(), 2);

        // Exact CMC.
        let (clauses, binds) = collection_filter_clauses(&[], &[], &[], &[], &None, &Some(3));
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains("c.cmc = ?"), "clause: {}", clauses[0]);
        assert_eq!(binds, vec![QBind::Int(3)]);

        // CMC 8+.
        let (clauses, binds) = collection_filter_clauses(&[], &[], &[], &[], &None, &Some(8));
        assert_eq!(clauses.len(), 1);
        assert!(clauses[0].contains("c.cmc >= ?"), "clause: {}", clauses[0]);
        assert_eq!(binds, vec![QBind::Int(8)]);
    }

    #[tokio::test]
    async fn test_query_collection_all_owned_unowned() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        clear_universe_cache();

        seed_card(pool, 1001, "Knight of Dawn", "o2oW", "1", "LEA", 4, "Creature").await;
        seed_card(pool, 1002, "Serra Angel", "o3oWoW", "1", "LEA", 3, "Creature").await;
        seed_card(pool, 1003, "Counterspell", "oUoU", "2", "LEA", 2, "Instant").await;
        seed_card(pool, 1004, "Lightning Bolt", "oR", "4", "LEA", 2, "Instant").await;
        seed_card(pool, 1005, "Llanowar Elves", "oG", "5", "LEG", 3, "Creature").await;

        set_owned(pool, 1001, 2).await;
        set_owned(pool, 1002, 1).await;
        set_owned(pool, 1003, 4).await;

        // 1004 is only logged (never in a true decklist) -> must NOT appear.
        seed_match(pool, "m1", "My Deck").await;
        seed_match_card(pool, "m1", 1004, false, 1).await;
        // Opponent cards must never surface.
        seed_match_card(pool, "m1", 1005, true, 1).await;
        // Universe = decklist cards only: 1001, 1002, 1003 (owned), 1005 (unowned).
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4},{"grp_id":1002,"count":2},{"grp_id":1003,"count":3},{"grp_id":1005,"count":2}]"#).await;

        let all = query_collection(pool, &serde_json::json!({})).await.expect("all");
        let cards = all.get("cards").and_then(|v| v.as_array()).unwrap();
        // Universe = the full cards_cache, so all 5 seeded cards appear.
        assert_eq!(cards.len(), 5, "all = every card in cards_cache");
        let summary = all.get("summary").unwrap();
        assert_eq!(summary.get("total_cards").and_then(|v| v.as_i64()).unwrap(), 5);
        assert_eq!(summary.get("total_owned_cards").and_then(|v| v.as_i64()).unwrap(), 3);
        assert_eq!(summary.get("total_owned_copies_all").and_then(|v| v.as_i64()).unwrap(), 7);

        let owned = query_collection(pool, &serde_json::json!({"owned": "owned"})).await.expect("owned");
        assert_eq!(owned.get("cards").and_then(|v| v.as_array()).unwrap().len(), 3);

        let unowned = query_collection(pool, &serde_json::json!({"owned": "unowned"})).await.expect("unowned");
        let unowned_cards = unowned.get("cards").and_then(|v| v.as_array()).unwrap();
        // 1004 (logged only) and 1005 (in a decklist) are both unowned cards.
        assert_eq!(unowned_cards.len(), 2, "1004 (logged) + 1005 (decklist) both unowned");
        for c in unowned_cards {
            assert_eq!(c.get("owned_count").and_then(|v| v.as_i64()).unwrap(), 0);
        }
    }

    #[tokio::test]
    async fn test_query_collection_filters() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        clear_universe_cache();

        seed_card(pool, 1001, "Knight of Dawn", "o2oW", "1", "LEA", 4, "Creature").await;
        seed_card(pool, 1002, "Serra Angel", "o3oWoW", "1", "LEA", 3, "Creature").await;
        seed_card(pool, 1003, "Counterspell", "oUoU", "2", "LEA", 2, "Instant").await;
        seed_card(pool, 1004, "Lightning Bolt", "oR", "4", "LEA", 2, "Instant").await;
        seed_card(pool, 1005, "Llanowar Elves", "oG", "5", "LEG", 3, "Creature").await;
        seed_card(pool, 1006, "Mox Amber", "o0", "", "DOM", 4, "Legendary Artifact").await;

        set_owned(pool, 1001, 2).await;
        set_owned(pool, 1002, 1).await;
        set_owned(pool, 1003, 4).await;
        set_owned(pool, 1004, 1).await;
        set_owned(pool, 1006, 1).await;

        // Universe = the full cards_cache (all seeded cards are visible).
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4},{"grp_id":1002,"count":2},{"grp_id":1003,"count":3},{"grp_id":1004,"count":1},{"grp_id":1006,"count":1}]"#).await;
        seed_match(pool, "m1", "My Deck").await;
        seed_match_card(pool, "m1", 1005, false, 1).await;

        let set = query_collection(pool, &serde_json::json!({"sets": ["LEA"]})).await.unwrap();
        assert_eq!(set.get("cards").and_then(|v| v.as_array()).unwrap().len(), 4);

        let w = query_collection(pool, &serde_json::json!({"colors": ["W"]})).await.unwrap();
        assert_eq!(w.get("cards").and_then(|v| v.as_array()).unwrap().len(), 2);

        let u = query_collection(pool, &serde_json::json!({"colors": ["U"]})).await.unwrap();
        assert_eq!(u.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);

        let colorless = query_collection(pool, &serde_json::json!({"colors": ["C"]})).await.unwrap();
        assert_eq!(colorless.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);

        let rarity = query_collection(pool, &serde_json::json!({"rarities": [2]})).await.unwrap();
        assert_eq!(rarity.get("cards").and_then(|v| v.as_array()).unwrap().len(), 2);

        let search = query_collection(pool, &serde_json::json!({"search": "serra"})).await.unwrap();
        assert_eq!(search.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);

        let combined = query_collection(pool, &serde_json::json!({"sets": ["LEA"], "rarities": [2]})).await.unwrap();
        assert_eq!(combined.get("cards").and_then(|v| v.as_array()).unwrap().len(), 2);

        let types = query_collection(pool, &serde_json::json!({"types": ["artifact"]})).await.unwrap();
        assert_eq!(types.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);

        let cmc = query_collection(pool, &serde_json::json!({"sort": "cmc"})).await.unwrap();
        let cmcs: Vec<i64> = cmc.get("cards").and_then(|v| v.as_array()).unwrap().iter()
            .map(|c| c.get("cmc").and_then(|v| v.as_i64()).unwrap_or(-1)).collect();
        let mut expected = cmcs.clone();
        expected.sort();
        assert_eq!(cmcs, expected, "cmc sort order: {:?}", cmcs);

        let desc = query_collection(pool, &serde_json::json!({"sort": "cmc", "sort_dir": "desc"})).await.unwrap();
        let cmcs_desc: Vec<i64> = desc.get("cards").and_then(|v| v.as_array()).unwrap().iter()
            .map(|c| c.get("cmc").and_then(|v| v.as_i64()).unwrap_or(-1)).collect();
        assert_eq!(cmcs_desc, expected.iter().rev().cloned().collect::<Vec<i64>>(), "desc order");
    }

    #[tokio::test]
    async fn test_query_collection_pagination() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        clear_universe_cache();

        for i in 1..=5 {
            seed_card(pool, 1000 + i, &format!("Card {}", i), "o1", "1", "LEA", 2, "Creature").await;
        }
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":1},{"grp_id":1002,"count":1},{"grp_id":1003,"count":1},{"grp_id":1004,"count":1},{"grp_id":1005,"count":1}]"#).await;

        // Pagination is client-side now: the backend always returns the FULL
        // filtered list plus the summary, ignoring any page/page_size args.
        let all = query_collection(pool, &serde_json::json!({})).await.unwrap();
        assert_eq!(all.get("cards").and_then(|v| v.as_array()).unwrap().len(), 5);
        assert_eq!(all.get("summary").unwrap().get("total_cards").and_then(|v| v.as_i64()).unwrap(), 5);

        let with_page = query_collection(pool, &serde_json::json!({"page": 1, "page_size": 2})).await.unwrap();
        assert_eq!(with_page.get("cards").and_then(|v| v.as_array()).unwrap().len(), 5, "page args ignored; full list returned");
    }

    #[tokio::test]
    async fn test_query_collection_copies_filter() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        clear_universe_cache();

        seed_card(pool, 1001, "Knight of Dawn", "o2oW", "1", "LEA", 4, "Creature").await;
        seed_card(pool, 1002, "Serra Angel", "o3oWoW", "1", "LEA", 3, "Creature").await;
        seed_card(pool, 1003, "Counterspell", "oUoU", "2", "LEA", 2, "Instant").await;
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4},{"grp_id":1002,"count":3},{"grp_id":1003,"count":1}]"#).await;
        set_owned(pool, 1001, 2).await;
        set_owned(pool, 1002, 4).await;
        set_owned(pool, 1003, 1).await;

        let all = query_collection(pool, &serde_json::json!({})).await.unwrap();
        assert_eq!(all.get("cards").and_then(|v| v.as_array()).unwrap().len(), 3);

        // Exactly 2 copies -> only 1001.
        let two = query_collection(pool, &serde_json::json!({"copies": 2})).await.unwrap();
        let cards2 = two.get("cards").and_then(|v| v.as_array()).unwrap();
        assert_eq!(cards2.len(), 1);
        assert_eq!(cards2[0].get("grp_id").and_then(|v| v.as_i64()).unwrap(), 1001);

        // Exactly 4 copies -> only 1002.
        let four = query_collection(pool, &serde_json::json!({"copies": 4})).await.unwrap();
        let cards4 = four.get("cards").and_then(|v| v.as_array()).unwrap();
        assert_eq!(cards4.len(), 1);
        assert_eq!(cards4[0].get("grp_id").and_then(|v| v.as_i64()).unwrap(), 1002);

        // Exactly 1 copy -> only 1003.
        let one = query_collection(pool, &serde_json::json!({"copies": 1})).await.unwrap();
        let cards1 = one.get("cards").and_then(|v| v.as_array()).unwrap();
        assert_eq!(cards1.len(), 1);
        assert_eq!(cards1[0].get("grp_id").and_then(|v| v.as_i64()).unwrap(), 1003);

        // Combined: owned + exactly 2 copies -> 1001.
        let owned_two = query_collection(pool, &serde_json::json!({"owned": "owned", "copies": 2})).await.unwrap();
        assert_eq!(owned_two.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_query_collection_merges_duplicate_printings() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        clear_universe_cache();

        // Two printings of the same card name (e.g. Fabled Passage in ELD + BLB).
        seed_card(pool, 7001, "Fabled Passage", "o1", "", "ELD", 4, "Land").await;
        seed_card(pool, 7002, "Fabled Passage", "o1", "", "BLB", 4, "Land").await;
        seed_card(pool, 7003, "Counterspell", "oUoU", "2", "LEA", 2, "Instant").await;
        // Release dates so the merge keeps the newest printing (BLB).
        sqlx::query("INSERT INTO sets_metadata (set_code, name, released_at, updated_at) VALUES ('ELD','Throne of Eldraine','2019-10-04','t')")
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO sets_metadata (set_code, name, released_at, updated_at) VALUES ('BLB','Bloomburrow','2024-08-02','t')")
            .execute(pool).await.unwrap();
        seed_decklist(pool, "My Deck", r#"[{"grp_id":7001,"count":1},{"grp_id":7002,"count":1},{"grp_id":7003,"count":3}]"#).await;
        set_owned(pool, 7001, 1).await;
        set_owned(pool, 7002, 1).await;
        set_owned(pool, 7003, 2).await;

        let all = query_collection(pool, &serde_json::json!({})).await.unwrap();
        let cards = all.get("cards").and_then(|v| v.as_array()).unwrap();
        assert_eq!(cards.len(), 2, "two printings of Fabled Passage must merge into one entry");

        // Fabled Passage: copies summed (1+1=2), keeps the newest printing (BLB).
        let fabled = cards.iter().find(|c| c.get("name").and_then(|v| v.as_str()).unwrap_or("") == "Fabled Passage").unwrap();
        assert_eq!(fabled.get("owned_count").and_then(|v| v.as_i64()).unwrap(), 2);
        assert_eq!(fabled.get("set_code").and_then(|v| v.as_str()).unwrap(), "BLB");

        // Copies filter still works across the merged entry: both Fabled Passage
        // (merged to 2) and Counterspell (2) match copies=2.
        let two = query_collection(pool, &serde_json::json!({"copies": 2})).await.unwrap();
        let two_cards = two.get("cards").and_then(|v| v.as_array()).unwrap();
        assert_eq!(two_cards.len(), 2);
        assert!(two_cards.iter().any(|c| c.get("name").and_then(|v| v.as_str()).unwrap_or("") == "Fabled Passage"));
    }

    #[tokio::test]
    async fn test_query_collection_owned_not_in_decklist_excluded() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        clear_universe_cache();
        set_owned(pool, 9999, 2).await;
        // The universe is cards_cache; no cards are seeded there, so nothing is
        // returned even though 9999 is owned.
        let res = query_collection(pool, &serde_json::json!({})).await.unwrap();
        let cards = res.get("cards").and_then(|v| v.as_array()).unwrap();
        assert_eq!(cards.len(), 0);
        assert_eq!(res.get("summary").unwrap().get("total_cards").and_then(|v| v.as_i64()).unwrap(), 0);
    }

    #[tokio::test]
    async fn test_deck_owned_stats_decklist() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();

        seed_card(pool, 1001, "Knight of Dawn", "o2oW", "1", "LEA", 4, "Creature").await;
        seed_card(pool, 1002, "Serra Angel", "o3oWoW", "1", "LEA", 3, "Creature").await;
        seed_card(pool, 1004, "Lightning Bolt", "oR", "4", "LEA", 2, "Instant").await;
        set_owned(pool, 1001, 2).await;
        set_owned(pool, 1002, 1).await;
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4},{"grp_id":1002,"count":2},{"grp_id":1004,"count":1}]"#).await;

        let res = query_deck_owned_stats(pool, "My Deck").await.expect("stats");
        assert!(res.get("has_list").and_then(|v| v.as_bool()).unwrap());
        assert_eq!(res.get("total_cards").and_then(|v| v.as_i64()).unwrap(), 3);
        assert_eq!(res.get("owned_cards").and_then(|v| v.as_i64()).unwrap(), 2);
        assert!((res.get("owned_pct").and_then(|v| v.as_f64()).unwrap() - 66.7).abs() < 0.1);

        let by_card = res.get("by_card").and_then(|v| v.as_array()).unwrap();
        assert_eq!(by_card.len(), 3);
        let owned_of = |gid: i64| by_card.iter()
            .find(|c| c.get("grp_id").and_then(|v| v.as_i64()).unwrap() == gid)
            .and_then(|c| c.get("owned_count").and_then(|v| v.as_i64()))
            .unwrap_or(-1);
        assert_eq!(owned_of(1001), 2);
        assert_eq!(owned_of(1002), 1);
        assert_eq!(owned_of(1004), 0);
        assert!(by_card.iter().all(|c| c.get("name").and_then(|v| v.as_str()).is_some()));
    }

    #[tokio::test]
    async fn test_deck_owned_stats_fallback_logged() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();

        seed_card(pool, 1001, "Knight of Dawn", "o2oW", "1", "LEA", 4, "Creature").await;
        seed_card(pool, 1002, "Serra Angel", "o3oWoW", "1", "LEA", 3, "Creature").await;
        seed_card(pool, 1003, "Counterspell", "oUoU", "2", "LEA", 2, "Instant").await;
        set_owned(pool, 1001, 2).await;
        set_owned(pool, 1002, 1).await;

        seed_match(pool, "m1", "Logged Deck").await;
        seed_match_card(pool, "m1", 1001, false, 2).await;
        seed_match_card(pool, "m1", 1002, false, 1).await;
        seed_match_card(pool, "m1", 1003, false, 3).await;
        seed_match_card(pool, "m1", 9999, true, 1).await;

        let res = query_deck_owned_stats(pool, "Logged Deck").await.expect("stats");
        assert!(!res.get("has_list").and_then(|v| v.as_bool()).unwrap());
        assert_eq!(res.get("total_cards").and_then(|v| v.as_i64()).unwrap(), 3);
        assert_eq!(res.get("owned_cards").and_then(|v| v.as_i64()).unwrap(), 2);
        assert!((res.get("owned_pct").and_then(|v| v.as_f64()).unwrap() - 66.7).abs() < 0.1);
    }

    #[tokio::test]
    async fn test_deck_owned_stats_no_data() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();
        let res = query_deck_owned_stats(pool, "No Such Deck").await.expect("stats");
        assert!(!res.get("has_list").and_then(|v| v.as_bool()).unwrap());
        assert_eq!(res.get("total_cards").and_then(|v| v.as_i64()).unwrap(), 0);
        assert_eq!(res.get("owned_cards").and_then(|v| v.as_i64()).unwrap(), 0);
        assert_eq!(res.get("owned_pct").and_then(|v| v.as_f64()).unwrap(), 0.0);
    }

    #[tokio::test]
    async fn test_delete_deck_sql_removes_list_and_matches_keeps_collection() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();

        seed_card(pool, 1001, "Knight of Dawn", "o2oW", "1", "LEA", 4, "Creature").await;
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4}]"#).await;
        set_owned(pool, 1001, 4).await;
        seed_match(pool, "m1", "My Deck").await;
        seed_match_card(pool, "m1", 1001, false, 2).await;
        seed_match(pool, "m2", "My Deck").await;

        // Verify data exists before delete.
        let before_matches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matches WHERE hero_deck_name='My Deck'").fetch_one(pool).await.unwrap();
        assert_eq!(before_matches, 2);
        let before_list: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM deck_lists WHERE deck_name='My Deck'").fetch_one(pool).await.unwrap();
        assert_eq!(before_list, 1);
        let before_owned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM collection_cards WHERE grp_id=1001 AND owned_count>0").fetch_one(pool).await.unwrap();
        assert_eq!(before_owned, 1);

        // Mirror delete_deck's SQL: remove the decklist, then the matches.
        sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?").bind("My Deck").execute(pool).await.unwrap();
        let match_result = sqlx::query("DELETE FROM matches WHERE hero_deck_name = ?").bind("My Deck").execute(pool).await.unwrap();
        assert_eq!(match_result.rows_affected(), 2);

        // Deck list + matches gone (cascade cleans match_cards).
        let after_list: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM deck_lists WHERE deck_name='My Deck'").fetch_one(pool).await.unwrap();
        assert_eq!(after_list, 0);
        let after_matches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matches WHERE hero_deck_name='My Deck'").fetch_one(pool).await.unwrap();
        assert_eq!(after_matches, 0);
        let after_match_cards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM match_cards WHERE match_id='m1'").fetch_one(pool).await.unwrap();
        assert_eq!(after_match_cards, 0);

        // Collection ownership is untouched.
        let after_owned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM collection_cards WHERE grp_id=1001 AND owned_count>0").fetch_one(pool).await.unwrap();
        assert_eq!(after_owned, 1);
    }

    #[tokio::test]
    async fn test_delete_deck_keep_matches_path() {
        let db = DatabaseManager::init().await.expect("db init");
        let pool = db.pool();

        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4}]"#).await;
        seed_match(pool, "m1", "My Deck").await;
        seed_match(pool, "m2", "My Deck").await;

        // "Keep Match History": remove only the decklist, leave the matches.
        sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?").bind("My Deck").execute(pool).await.unwrap();

        let after_list: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM deck_lists WHERE deck_name='My Deck'").fetch_one(pool).await.unwrap();
        assert_eq!(after_list, 0);
        let after_matches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matches WHERE hero_deck_name='My Deck'").fetch_one(pool).await.unwrap();
        assert_eq!(after_matches, 2, "matches are kept when only the decklist is deleted");
    }
}
