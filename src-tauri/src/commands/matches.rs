use crate::db::{DatabaseManager, EnrichedMatchRecord};
use crate::card_db;
use crate::parser;
use sqlx::Row;

#[tauri::command]
pub async fn get_matches_count() -> Result<i64, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.get_match_count().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_recent_matches(limit: Option<i64>) -> Result<Vec<EnrichedMatchRecord>, String> {
    let start_t = std::time::Instant::now();
    println!("[PROFILE] get_recent_matches IPC started");

    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let db_t = start_t.elapsed();
    println!("[PROFILE] DB init completed in {:?}", db_t);

    let matches = db.get_enriched_recent_matches(limit.unwrap_or(100)).await.map_err(|e| e.to_string())?;
    println!("[PROFILE] Total get_recent_matches IPC query time: {:?}", start_t.elapsed());

    Ok(matches)
}

#[tauri::command]
pub async fn get_match_cards(match_id: String) -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        r#"
        SELECT mc.grp_id, mc.is_opponent, mc.count,
               c.name, c.card_type, c.mana_cost, c.rarity, c.set_code
        FROM match_cards mc
        LEFT JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE mc.match_id = ?
        ORDER BY mc.is_opponent ASC, c.name ASC
        "#
    )
    .bind(&match_id)
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
        let rarity: Option<i64> = r.get("rarity");
        let set_code: Option<String> = r.get("set_code");

        result.push(serde_json::json!({
            "grp_id": grp_id,
            "is_opponent": is_opponent,
            "count": count,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
            "rarity": rarity.unwrap_or(0),
            "set_code": set_code,
        }));
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_match_turn_events(match_id: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let hero_row = sqlx::query("SELECT hero_seat_id, opponent_name FROM matches WHERE id = ?")
        .bind(&match_id)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;
    let (hero_seat_id, opp_name) = match hero_row {
        Some(r) => {
            let s: i64 = r.try_get("hero_seat_id").unwrap_or(1);
            let o: String = r.try_get("opponent_name").unwrap_or_else(|_| "Opponent".to_string());
            (s as u32, o)
        }
        None => (1, "Opponent".to_string()),
    };

    let titles_rows = sqlx::query(
        "SELECT grp_id, titles FROM match_impactful_cards WHERE match_id = ? AND titles IS NOT NULL AND titles != '[]'"
    )
    .bind(&match_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut titles_map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
    for tr in titles_rows {
        let gid: i64 = tr.get("grp_id");
        let t_str: String = tr.get("titles");
        if let Ok(titles) = serde_json::from_str::<Vec<String>>(&t_str) {
            titles_map.insert(gid, titles);
        }
    }

    let rows = sqlx::query(
        r#"
        SELECT e.turn_number, e.seat_id, e.event_type, e.grp_id, e.timestamp,
               c.name, c.card_type, c.mana_cost
        FROM match_turn_events e
        LEFT JOIN cards_cache c ON e.grp_id = c.grp_id
        WHERE e.match_id = ?
        ORDER BY e.id ASC
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
        let titles = titles_map.get(&grp_id).cloned().unwrap_or_default();

        let mut amount: Option<i32> = None;
        let mut delta: Option<i32> = None;
        let display_name = if event_type.starts_with("life:") {
            let parts: Vec<&str> = event_type.split(':').collect();
            let d: i32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            delta = Some(d);
            amount = Some(d);
            if let Some(ref card_name) = name {
                card_name.clone()
            } else if grp_id > 0 {
                format!("Unknown Card (#{})", grp_id)
            } else {
                "Life Total Change".to_string()
            }
        } else {
            name.clone().unwrap_or_else(|| if grp_id == 0 { "Unknown Action".to_string() } else { format!("Unknown Card (#{})", grp_id) })
        };

        let mut target_name: Option<String> = None;
        let mut target_card_type: Option<String> = None;
        if event_type.starts_with("damage:") {
            let parts: Vec<&str> = event_type.split(':').collect();
            let (_amt, tid, tgt_gid) = if parts.len() >= 5 {
                let a: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                let t: u32 = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
                let g: i64 = parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);
                amount = Some(a);
                (a, t, g)
            } else if parts.len() == 4 {
                let a: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                let t: u32 = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
                amount = Some(a);
                (a, t, 0)
            } else {
                let t: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
                let a: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                amount = Some(a);
                (a, t, 0)
            };

            let t_name = if tid == hero_seat_id {
                "You".to_string()
            } else if tid == 1 || tid == 2 || tid == 0 {
                opp_name.clone()
            } else if tgt_gid > 0 {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), tgt_gid).await {
                    target_card_type = meta.card_type;
                    meta.name
                } else {
                    format!("Target #{}", tid)
                }
            } else {
                format!("Target #{}", tid)
            };
            target_name = Some(t_name);
        } else if event_type.starts_with("counterspell:") {
            if let Some(target_grp) = event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), target_grp).await {
                    target_name = Some(meta.name);
                    target_card_type = meta.card_type;
                }
            }
        } else if event_type.starts_with("countered:") {
            if let Some(affector_grp) = event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), affector_grp).await {
                    target_name = Some(meta.name);
                    target_card_type = meta.card_type;
                }
            }
        } else if event_type.starts_with("destroy:") {
            if let Some(affector_grp) = event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), affector_grp).await {
                    target_name = Some(meta.name);
                    target_card_type = meta.card_type;
                }
            }
        } else if event_type.starts_with("bounce:") {
            if let Some(target_grp) = event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), target_grp).await {
                    target_name = Some(meta.name);
                    target_card_type = meta.card_type;
                }
            }
        } else if event_type.starts_with("sacrifice:") {
            if let Some(target_grp) = event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), target_grp).await {
                    target_name = Some(meta.name);
                    target_card_type = meta.card_type;
                }
            }
        }

        events.push(serde_json::json!({
            "turn_number": turn_number,
            "seat_id": seat_id,
            "is_player": (seat_id as u32) == hero_seat_id,
            "event_type": event_type,
            "grp_id": grp_id,
            "timestamp": timestamp,
            "name": display_name,
            "source_name": name,
            "target_name": target_name,
            "target_card_type": target_card_type,
            "card_type": card_type,
            "mana_cost": mana_cost,
            "amount": amount,
            "delta": delta,
            "titles": titles,
        }));
    }

    Ok(serde_json::json!({
        "hero_seat_id": hero_seat_id,
        "events": events
    }))
}

#[tauri::command]
pub async fn get_impactful_cards(match_id: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let hero_row = sqlx::query("SELECT hero_seat_id FROM matches WHERE id = ?")
        .bind(&match_id)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;
    let hero_seat_id: i64 = hero_row.as_ref().and_then(|r| r.try_get("hero_seat_id").ok()).unwrap_or(1);

    let rows = sqlx::query(
        r#"
        SELECT i.grp_id, i.seat_id, i.total_damage, i.max_hit,
               i.damage_to_player, i.damage_to_permanents, i.damage_combat, i.damage_spell,
               i.titles,
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
        let titles_str: Option<String> = r.try_get("titles").ok();
        let titles: Vec<String> = titles_str
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let rarity: Option<i64> = r.get("rarity");

        let cmc = card_db::get_card_metadata(db.pool(), grp_id)
            .await.ok().flatten().map(|c| c.cmc).unwrap_or(0);

        if total_damage < 5 && titles.is_empty() {
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
            "titles": titles,
            "cmc": cmc,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
            "rarity": rarity.unwrap_or(0),
        }));
    }

    result.sort_by(|a, b| {
        let t_a = a.get("titles").and_then(|v| v.as_array()).map(|arr| arr.len()).unwrap_or(0);
        let t_b = b.get("titles").and_then(|v| v.as_array()).map(|arr| arr.len()).unwrap_or(0);
        if t_a != t_b {
            return t_b.cmp(&t_a);
        }
        let da = a.get("total_damage").and_then(|v| v.as_i64()).unwrap_or(0);
        let db_ = b.get("total_damage").and_then(|v| v.as_i64()).unwrap_or(0);
        db_.cmp(&da)
    });

    Ok(serde_json::json!({
        "hero_seat_id": hero_seat_id,
        "cards": result
    }))
}

#[tauri::command]
pub async fn delete_match(match_id: String) -> Result<serde_json::Value, String> {
    println!("[DELETE_MATCH] Received delete request for match_id: '{}'", match_id);
    let db = DatabaseManager::init().await.map_err(|e| {
        eprintln!("[DELETE_MATCH] Error initializing DB: {}", e);
        e.to_string()
    })?;
    db.delete_match(&match_id).await.map_err(|e| {
        eprintln!("[DELETE_MATCH] Error deleting match: {}", e);
        e.to_string()
    })?;
    println!("[DELETE_MATCH] Successfully deleted and blacklisted match_id: '{}'", match_id);
    Ok(serde_json::json!({ "success": true, "match_id": match_id }))
}

#[tauri::command]
pub async fn get_opponent_h2h_stats(opponent_name: String) -> Result<serde_json::Value, String> {
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
pub async fn get_opponent_matches(opponent_name: String) -> Result<Vec<serde_json::Value>, String> {
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct CardAutocompleteItem {
    pub name: String,
    pub card_type: Option<String>,
    pub mana_cost: Option<String>,
    pub rarity: Option<i64>,
    pub is_commander: bool,
}

#[tauri::command]
pub async fn search_card_autocomplete(
    query: String,
    commander_only: Option<bool>,
    limit: Option<usize>,
) -> Result<Vec<CardAutocompleteItem>, String> {
    let clean_query = query.trim();
    if clean_query.is_empty() {
        return Ok(Vec::new());
    }

    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let pool = db.pool();
    search_card_autocomplete_internal(pool, clean_query, commander_only.unwrap_or(false), limit.unwrap_or(20)).await
}

pub async fn search_card_autocomplete_internal(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    clean_query: &str,
    commander_only: bool,
    limit: usize,
) -> Result<Vec<CardAutocompleteItem>, String> {
    let max_limit = limit.min(50) as i64;
    let like_pattern = format!("%{}%", clean_query);
    let prefix_pattern = format!("{}%", clean_query);

    let rows = if commander_only {
        sqlx::query(
            r#"
            SELECT c.name, c.card_type, c.mana_cost, c.rarity,
                   1 as is_commander
            FROM cards_cache c
            WHERE c.name LIKE ?
              AND (
                c.card_type LIKE '%Legendary%Creature%'
                OR c.card_type LIKE '%Legendary%Planeswalker%'
                OR c.card_type LIKE '%Legendary%Artifact%Creature%'
                OR c.grp_id IN (
                    SELECT hero_commander_id FROM matches WHERE hero_commander_id IS NOT NULL
                    UNION
                    SELECT opponent_commander_id FROM matches WHERE opponent_commander_id IS NOT NULL
                    UNION
                    SELECT commander_grp_id FROM deck_lists WHERE commander_grp_id IS NOT NULL
                )
              )
            GROUP BY c.name
            ORDER BY
              CASE WHEN c.name LIKE ? THEN 0 ELSE 1 END,
              LENGTH(c.name) ASC,
              c.name ASC
            LIMIT ?
            "#
        )
        .bind(&like_pattern)
        .bind(&prefix_pattern)
        .bind(max_limit)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            r#"
            SELECT c.name, c.card_type, c.mana_cost, c.rarity,
                   (
                       c.card_type LIKE '%Legendary%Creature%'
                       OR c.card_type LIKE '%Legendary%Planeswalker%'
                       OR c.grp_id IN (
                           SELECT hero_commander_id FROM matches WHERE hero_commander_id IS NOT NULL
                           UNION
                           SELECT opponent_commander_id FROM matches WHERE opponent_commander_id IS NOT NULL
                           UNION
                           SELECT commander_grp_id FROM deck_lists WHERE commander_grp_id IS NOT NULL
                       )
                   ) as is_commander
            FROM cards_cache c
            WHERE c.name LIKE ?
            GROUP BY c.name
            ORDER BY
              CASE WHEN c.name LIKE ? THEN 0 ELSE 1 END,
              LENGTH(c.name) ASC,
              c.name ASC
            LIMIT ?
            "#
        )
        .bind(&like_pattern)
        .bind(&prefix_pattern)
        .bind(max_limit)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    };

    let mut results = Vec::new();
    for r in rows {
        let name: String = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let rarity: Option<i64> = r.get("rarity");
        let is_commander: bool = r.get::<i64, _>("is_commander") != 0;

        results.push(CardAutocompleteItem {
            name,
            card_type,
            mana_cost,
            rarity,
            is_commander,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_matches_with_cards(
    card_names: Vec<String>,
    match_all: Option<bool>,
) -> Result<Vec<String>, String> {
    if card_names.is_empty() {
        return Ok(Vec::new());
    }

    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let pool = db.pool();
    get_matches_with_cards_internal(pool, &card_names, match_all.unwrap_or(true)).await
}

pub async fn get_matches_with_cards_internal(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    card_names: &[String],
    match_all: bool,
) -> Result<Vec<String>, String> {
    if card_names.is_empty() {
        return Ok(Vec::new());
    }

    use std::collections::HashSet;
    let mut matching_match_ids: Option<HashSet<String>> = None;

    for card_name in card_names {
        let clean_name = card_name.trim();
        if clean_name.is_empty() {
            continue;
        }

        let rows = sqlx::query(
            r#"
            SELECT DISTINCT m.id
            FROM matches m
            WHERE m.id IN (
                SELECT mc.match_id
                FROM match_cards mc
                JOIN cards_cache c ON mc.grp_id = c.grp_id
                WHERE mc.is_opponent = 0 AND c.name = ?
                UNION
                SELECT m2.id
                FROM matches m2
                JOIN deck_lists dl ON m2.hero_deck_name = dl.deck_name AND dl.cards_json IS NOT NULL
                JOIN json_each(dl.cards_json) je
                LEFT JOIN cards_cache c2 ON (CAST(je.value->>'grp_id' AS INTEGER) = c2.grp_id)
                WHERE c2.name = ? OR je.value->>'name' = ?
            )
            "#
        )
        .bind(clean_name)
        .bind(clean_name)
        .bind(clean_name)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        let card_match_ids: HashSet<String> = rows.into_iter().map(|r| r.get("id")).collect();

        if match_all {
            match matching_match_ids.as_mut() {
                Some(existing) => {
                    *existing = existing.intersection(&card_match_ids).cloned().collect();
                }
                None => {
                    matching_match_ids = Some(card_match_ids);
                }
            }
        } else {
            match matching_match_ids.as_mut() {
                Some(existing) => {
                    existing.extend(card_match_ids);
                }
                None => {
                    matching_match_ids = Some(card_match_ids);
                }
            }
        }
    }

    let mut result_list: Vec<String> = matching_match_ids.unwrap_or_default().into_iter().collect();
    result_list.sort();
    Ok(result_list)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_test_db() -> sqlx::Pool<sqlx::Sqlite> {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS cards_cache (
                grp_id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                mana_cost TEXT,
                cmc REAL,
                colors TEXT,
                color_identity TEXT,
                set_code TEXT,
                rarity INTEGER,
                collector_number TEXT,
                card_type TEXT,
                last_updated TEXT
            );

            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                date_str TEXT,
                format TEXT,
                result TEXT,
                result_reason TEXT,
                duration_seconds INTEGER,
                turns INTEGER,
                going_first INTEGER,
                hero_seat_id INTEGER,
                hero_deck_name TEXT,
                hero_commander_id INTEGER,
                hero_life_end INTEGER,
                hero_mulligans INTEGER,
                opponent_name TEXT,
                opponent_commander_id INTEGER,
                opponent_life_end INTEGER,
                opponent_mulligans INTEGER,
                raw_payload TEXT
            );

            CREATE TABLE IF NOT EXISTS match_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id TEXT NOT NULL,
                grp_id INTEGER NOT NULL,
                is_opponent INTEGER NOT NULL,
                count INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS deck_lists (
                deck_name TEXT PRIMARY KEY,
                cards_json TEXT,
                sideboard_json TEXT,
                commander_grp_id INTEGER,
                source TEXT,
                created_at TEXT,
                updated_at TEXT,
                deck_id TEXT
            );
            "#
        )
        .execute(&pool)
        .await
        .unwrap();

        // Seed cards_cache
        sqlx::query(
            "INSERT INTO cards_cache (grp_id, name, mana_cost, card_type, rarity) VALUES
             (101, 'Atraxa, Grand Unifier', 'o3oWoUoBoG', 'Legendary Creature — Phyrexian Angel', 4),
             (102, 'Counterspell', 'oUoU', 'Instant', 2),
             (103, 'Lightning Bolt', 'oR', 'Instant', 2),
             (104, 'Swamp', '', 'Basic Land — Swamp', 1),
             (105, 'Urza, Lord High Artificer', 'o2oUoU', 'Legendary Creature — Human Artificer', 4)"
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[tokio::test]
    async fn test_search_card_autocomplete_all_and_commander() {
        let pool = setup_test_db().await;

        // Search all cards matching "counter"
        let res_all = search_card_autocomplete_internal(&pool, "counter", false, 10).await.unwrap();
        assert_eq!(res_all.len(), 1);
        assert_eq!(res_all[0].name, "Counterspell");
        assert!(!res_all[0].is_commander);

        // Search commander matching "atraxa"
        let res_comm = search_card_autocomplete_internal(&pool, "atraxa", true, 10).await.unwrap();
        assert_eq!(res_comm.len(), 1);
        assert_eq!(res_comm[0].name, "Atraxa, Grand Unifier");
        assert!(res_comm[0].is_commander);

        // Searching commander for non-legendary shouldn't return it
        let res_non_comm = search_card_autocomplete_internal(&pool, "bolt", true, 10).await.unwrap();
        assert_eq!(res_non_comm.len(), 0);
    }

    #[tokio::test]
    async fn test_get_matches_with_cards_from_match_cards_and_decklist() {
        let pool = setup_test_db().await;

        // Seed match 1: has Counterspell in match_cards
        sqlx::query("INSERT INTO matches (id, timestamp, hero_deck_name, result) VALUES ('m1', '2026-09-17T12:00:00Z', 'Deck A', 'win')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES ('m1', 102, 0, 2)").execute(&pool).await.unwrap();

        // Seed match 2: has Lightning Bolt in deck_lists
        sqlx::query("INSERT INTO matches (id, timestamp, hero_deck_name, result) VALUES ('m2', '2026-09-17T13:00:00Z', 'Burn Deck', 'win')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO deck_lists (deck_name, cards_json) VALUES ('Burn Deck', '[{\"grp_id\": 103, \"name\": \"Lightning Bolt\", \"count\": 4}]')").execute(&pool).await.unwrap();

        // Seed match 3: has both Counterspell and Lightning Bolt (in match_cards)
        sqlx::query("INSERT INTO matches (id, timestamp, hero_deck_name, result) VALUES ('m3', '2026-09-17T14:00:00Z', 'Izzet Deck', 'win')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO match_cards (match_id, grp_id, is_opponent, count) VALUES ('m3', 102, 0, 2), ('m3', 103, 0, 4)").execute(&pool).await.unwrap();

        // Test filtering single card: Counterspell -> matches m1 and m3
        let res_cs = get_matches_with_cards_internal(&pool, &["Counterspell".to_string()], true).await.unwrap();
        assert_eq!(res_cs, vec!["m1", "m3"]);

        // Test filtering single card: Lightning Bolt -> matches m2 and m3
        let res_bolt = get_matches_with_cards_internal(&pool, &["Lightning Bolt".to_string()], true).await.unwrap();
        assert_eq!(res_bolt, vec!["m2", "m3"]);

        // Test filtering multiple cards (AND): Counterspell AND Lightning Bolt -> matches only m3
        let res_both_and = get_matches_with_cards_internal(&pool, &["Counterspell".to_string(), "Lightning Bolt".to_string()], true).await.unwrap();
        assert_eq!(res_both_and, vec!["m3"]);

        // Test filtering multiple cards (OR): Counterspell OR Lightning Bolt -> matches m1, m2, m3
        let res_both_or = get_matches_with_cards_internal(&pool, &["Counterspell".to_string(), "Lightning Bolt".to_string()], false).await.unwrap();
        assert_eq!(res_both_or, vec!["m1", "m2", "m3"]);
    }
}
