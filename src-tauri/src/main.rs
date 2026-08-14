mod tailer;
mod parser;
mod match_assembler;
mod db;
mod theme;
mod card_db;
mod deck_list;

use std::path::PathBuf;
use tokio::sync::mpsc;
use tailer::{FileTailer, TailerEvent};
use parser::{parse_line, ParsedEvent};
use match_assembler::{MatchAssembler, MatchRecord};
use db::DatabaseManager;
use theme::{get_mana_theme, ManaTheme};
use tauri::Emitter;
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
            "player_life_end": m.player_life_end,
            "opponent_name": m.opponent_name,
            "opponent_commander_id": m.opponent_commander_id,
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

    // 4d. Brawl commander color identity per deck (for filtering logged cards).
    let brawl_cmd_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, c.color_identity FROM (
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

        let mut key_cards: Vec<serde_json::Value> = Vec::new();
        let mut used: Vec<String> = Vec::new();
        for cand in &candidates {
            let name: String = cand.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let card_type: Option<&serde_json::Value> = cand.get("card_type");
            let ct = card_type.and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            if top_commander_name.as_deref() == Some(name.as_str()) { continue; }
            if used.contains(&name) { continue; }

            let is_creature = ct.contains("creature");
            let is_spell = ct.contains("instant") || ct.contains("sorcery");

            // Target slot index: 0=creature, 1=spell, 2=other.
            let slot = if is_creature { 0 } else if is_spell { 1 } else { 2 };
            // If this slot's card would be a better fit (higher CMC), replace it.
            let cmc: i64 = cand.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
            let replace = match key_cards.get(slot) {
                Some(existing) => {
                    let existing_cmc = existing.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
                    cmc > existing_cmc
                }
                None => true,
            };
            if replace {
                let entry = cand.clone();
                if key_cards.len() <= slot {
                    while key_cards.len() < slot { key_cards.push(serde_json::Value::Null); }
                    key_cards.push(entry);
                } else {
                    // Replacing an existing slot: free up the old name.
                    if let Some(old) = key_cards[slot].get("name").and_then(|v| v.as_str()) {
                        if let Some(pos) = used.iter().position(|u| u == old) { used.remove(pos); }
                    }
                    key_cards[slot] = entry;
                }
                used.push(name);
            }
        }

        // Fill gaps with fallback logic (extra creature/spell/other).
        let fill_order = [
            // fill creature slot -> prefer another creature, else spell, else other
            (0usize, vec!["creature", "spell", "other"]),
            (1usize, vec!["spell", "creature", "other"]),
            (2usize, vec!["other", "creature", "spell"]),
        ];
        // Rescan candidates for the best remaining candidate per priority.
        for (slot, priority) in &fill_order {
            if key_cards.len() > *slot && !key_cards[*slot].is_null() { continue; }
            // Gather remaining unused candidates in priority order.
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
                    if replace {
                        best = Some(cand.clone());
                    }
                }
                if let Some(card) = best {
                    if let Some(n) = card.get("name").and_then(|v| v.as_str()) {
                        used.push(n.to_string());
                    }
                    while key_cards.len() < *slot { key_cards.push(serde_json::Value::Null); }
                    key_cards.insert(*slot, card);
                    break;
                }
            }
        }
        // Drop null placeholders, cap at 3.
        key_cards.retain(|v| !v.is_null());
        key_cards.truncate(3);

        result.push(serde_json::json!({
            "deck_name": deck_name,
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

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "card_count": parsed.cards.len(),
        "sideboard_count": parsed.sideboard.len(),
        "commander": parsed.commander,
        "unresolved": parsed.unresolved,
        "saved_at": now,
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
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let rarity: Option<i64> = r.get("rarity");

        // Resolve mana value via get_card_metadata which falls back to parsing
        // the stored mana cost when cmc is 0 in the cache.
        let cmc = card_db::get_card_metadata(db.pool(), grp_id)
            .await.ok().flatten().map(|c| c.cmc).unwrap_or(0);

        // Impactful threshold: at least 6 total damage dealt, OR cast for 5+ CMC.
        if total_damage < 6 && cmc < 5 {
            continue;
        }

        seen_grp.insert(grp_id);
        result.push(serde_json::json!({
            "grp_id": grp_id,
            "seat_id": seat_id,
            "is_opponent": seat_id != 0 && seat_id != hero_seat_id,
            "total_damage": total_damage,
            "max_hit": max_hit,
            "cmc": cmc,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
            "rarity": rarity.unwrap_or(0),
        }));
    }

    for r in played_rows {
        let grp_id: i64 = r.get("grp_id");
        if seen_grp.contains(&grp_id) {
            continue;
        }
        let seat_id: i64 = r.get("seat_id");
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let rarity: Option<i64> = r.get("rarity");

        let cmc = card_db::get_card_metadata(db.pool(), grp_id)
            .await.ok().flatten().map(|c| c.cmc).unwrap_or(0);

        // Only include high-mana plays (5+ CMC) that weren't already flagged by damage.
        if cmc < 5 {
            continue;
        }

        seen_grp.insert(grp_id);
        result.push(serde_json::json!({
            "grp_id": grp_id,
            "seat_id": seat_id,
            "is_opponent": seat_id != 0 && seat_id != hero_seat_id,
            "total_damage": 0,
            "max_hit": 0,
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
                let name = card_db::get_card_metadata(db_for_names.pool(), e.grp_id as i64)
                    .await.ok().flatten().map(|c| c.name).unwrap_or_else(|| format!("#{}", e.grp_id));
                merged.push((*seq, serde_json::json!({
                    "type": e.event_type,
                    "seat_id": e.seat_id,
                    "is_player": e.seat_id == assembler.player_seat_id,
                    "name": name,
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

            merged.sort_by_key(|(seq, _)| *seq);
            // Keep only the most recent 30 entries.
            let mstart = merged.len().saturating_sub(30);
            recent_events = merged.into_iter().skip(mstart).map(|(_, ev)| ev).collect();
        }

        // Resolve commander names and deck colors from the card cache so the HUD can
        // display them without an extra IPC round-trip.
        let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
        let player_cmdr = if let Some(gid) = active.player_commander_id {
            card_db::get_card_metadata(db.pool(), gid as i64).await.ok().flatten()
        } else { None };
        let opp_cmdr = if let Some(gid) = active.opponent_commander_id {
            card_db::get_card_metadata(db.pool(), gid as i64).await.ok().flatten()
        } else { None };

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
        // for a short window (e.g. 30s) so the HUD can show a result overlay.
        if let Some((record, completed_at)) = &assembler.last_completed {
            let elapsed = chrono::Utc::now().signed_duration_since(*completed_at);
            if elapsed.num_seconds() < 30 {
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

fn main() {
    // CRITICAL: Must be set BEFORE GTK/WebKit initializes any display connections to prevent DMA-BUF Wayland protocol crashes on NVIDIA drivers
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let shared_assembler = std::sync::Arc::new(tokio::sync::Mutex::new(MatchAssembler::new()));
    let shared_state = SharedMatchState(shared_assembler.clone());

    // Launch Tauri Native App Window with tokio async setup
    tauri::Builder::default()
        .manage(shared_state)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let assembler_ref = shared_assembler.clone();

            tauri::async_runtime::spawn(async move {
                let db_manager = match DatabaseManager::init().await {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[ERROR] DB init failed: {}", e);
                        return;
                    }
                };

                let log_path = PathBuf::from(
                    "/mnt/Games/SteamLibrary/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log"
                );

                let (tx, mut rx) = mpsc::channel::<TailerEvent>(2000);
                let tailer = FileTailer::new_from_end(log_path, tx);

                tokio::spawn(async move {
                    tailer.run().await;
                });

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
                                    ParsedEvent::DeckSubmitted { deck_name, commander_id, main_deck, total_cards } => {
                                        assembler.set_deck(deck_name.clone(), commander_id, main_deck.clone());
                                        println!(
                                            "[EVENT 3: DECK_SUBMITTED] Deck = \"{}\", Commander GRPID = {:?}, Total Cards = {}",
                                            deck_name,
                                            commander_id,
                                            total_cards
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
                                        for (instance_id, amount) in damage_events {
                                            assembler.process_damage_event(instance_id, amount);
                                        }
                                        assembler.update_game_state(msg_id, turn_number, &life_by_seat, active_seat);
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
                                ParsedEvent::DeckSubmitted { deck_name, commander_id, main_deck, total_cards } => {
                                    assembler.set_deck(deck_name.clone(), commander_id, main_deck.clone());
                                    println!(
                                        "[EVENT 3: DECK_SUBMITTED] Deck = \"{}\", Commander GRPID = {:?}, Total Cards = {}",
                                        deck_name,
                                        commander_id,
                                        total_cards
                                    );
                                }
                                ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                                    if let Some((record, card_records, turn_events, impactful)) = assembler.complete_match(winning_team_id, &reason) {
                                        let _ = db_manager.upsert_match(&record, &card_records, &turn_events, &impactful).await;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            });
            Ok(())
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
            get_deck_list,
            get_deck_list_status,
            export_decklist,
            get_card_info,
            get_commander_info,
            get_opponent_h2h_stats,
            get_opponent_matches,
            get_match_cards,
            get_match_turn_events,
            get_impactful_cards,
            get_live_match_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
