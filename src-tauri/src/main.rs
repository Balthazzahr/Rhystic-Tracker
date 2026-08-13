mod tailer;
mod parser;
mod match_assembler;
mod db;
mod theme;
mod card_db;

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
        SELECT mc.match_id, c.mana_cost, c.color_identity, c.colors, mc.count
        FROM match_cards mc
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE mc.is_opponent = 0
        "#
    )
    .fetch_all(db.pool())
    .await
    .unwrap_or_default();

    println!("[PROFILE] Bulk SQL query fetched {} card rows across all matches in {:?}", bulk_rows.len(), query_cards_start.elapsed());

    // Build fast in-memory map of match_id -> (curve, color_set)
    use std::collections::{HashMap, HashSet};
    struct MatchCardAggregate {
        curve: Vec<i64>,
        colors: HashSet<String>,
    }

    let mut map: HashMap<String, MatchCardAggregate> = HashMap::new();

    for r in bulk_rows {
        let match_id: String = r.get("match_id");
        let mana_cost: Option<String> = r.get("mana_cost");
        let color_identity: Option<String> = r.get("color_identity");
        let colors: Option<String> = r.get("colors");
        let count: i64 = r.get("count");

        let entry = map.entry(match_id).or_insert_with(|| MatchCardAggregate {
            curve: vec![0i64; 7],
            colors: HashSet::new(),
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

        for source_str in [color_identity, colors].into_iter().flatten() {
            for ch in source_str.chars() {
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
    }

    let mut result = Vec::new();
    let order = ["W", "U", "B", "R", "G"];

    for m in raw_matches {
        let agg = map.remove(&m.match_id);
        let curve = agg.as_ref().map(|a| a.curve.clone()).unwrap_or_else(|| vec![0i64; 7]);
        
        let mut colors_arr: Vec<String> = agg
            .map(|a| a.colors.into_iter().collect())
            .unwrap_or_default();
        colors_arr.sort_by_key(|c| order.iter().position(|&x| x == c).unwrap_or(99));

        let clean_format = parser::normalize_format(&m.format_name);

        result.push(serde_json::json!({
            "match_id": m.match_id,
            "timestamp": m.timestamp,
            "date_str": m.date_str,
            "format_name": clean_format,
            "result": m.result,
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
async fn get_match_turn_events(match_id: String) -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
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
    .bind(match_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        let turn_number: i64 = r.get("turn_number");
        let seat_id: i64 = r.get("seat_id");
        let event_type: String = r.get("event_type");
        let grp_id: i64 = r.get("grp_id");
        let timestamp: String = r.get("timestamp");
        let name: Option<String> = r.get("name");
        let card_type: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");

        result.push(serde_json::json!({
            "turn_number": turn_number,
            "seat_id": seat_id,
            "event_type": event_type,
            "grp_id": grp_id,
            "timestamp": timestamp,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "card_type": card_type,
            "mana_cost": mana_cost,
        }));
    }

    Ok(result)
}

#[derive(Clone)]
pub struct SharedMatchState(pub std::sync::Arc<tokio::sync::Mutex<MatchAssembler>>);

#[tauri::command]
async fn get_live_match_state(state: tauri::State<'_, SharedMatchState>) -> Result<serde_json::Value, String> {
    let assembler = state.0.lock().await;
    if let Some(active) = &assembler.active_match {
        Ok(serde_json::json!({
            "is_active": true,
            "match_id": active.match_id,
            "format": active.format_name,
            "turn": assembler.current_turn,
            "player_life": assembler.current_player_life,
            "opponent_life": assembler.current_opp_life,
            "opponent_name": active.opponent_name.as_deref().unwrap_or("Opponent"),
            "player_deck_name": active.player_deck_name,
            "turn_events_count": assembler.turn_events.len(),
            "last_event": assembler.turn_events.last().map(|e| format!("{} (#{})", e.event_type.to_uppercase(), e.grp_id))
        }))
    } else {
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
                                    ParsedEvent::GameStateUpdateCombined { msg_id, objects, turn_number, player_life, opponent_life, active_seat } => {
                                        for (instance_id, grp_id, owner_seat, zone_id) in objects {
                                            assembler.process_game_object(instance_id, grp_id, owner_seat, zone_id);
                                        }
                                        assembler.update_game_state(msg_id, turn_number, player_life, opponent_life, active_seat);
                                    }
                                    ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                                        if let Some((record, card_records, turn_events)) = assembler.complete_match(winning_team_id, &reason) {
                                            println!(
                                                "[EVENT 6: MATCH_COMPLETED] Match ID = \"{}\", Result = \"{}\", Reason = \"{}\", Player End Life = {:?}, Opp End Life = {:?}, Turn Events Recorded = {}",
                                                redact_str(&record.match_id),
                                                record.result,
                                                reason,
                                                record.player_life_end,
                                                record.opponent_life_end,
                                                turn_events.len()
                                            );
                                            let _ = db_manager.upsert_match(&record, &card_records, &turn_events).await;
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
                                ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                                    if let Some((record, card_records, turn_events)) = assembler.complete_match(winning_team_id, &reason) {
                                        let _ = db_manager.upsert_match(&record, &card_records, &turn_events).await;
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
            get_card_info,
            get_commander_info,
            get_opponent_h2h_stats,
            get_opponent_matches,
            get_match_cards,
            get_match_turn_events,
            get_live_match_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
