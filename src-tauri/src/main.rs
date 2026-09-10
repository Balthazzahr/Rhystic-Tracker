mod tailer;
mod parser;
mod match_assembler;
mod db;
mod theme;
mod card_db;
mod deck_list;
mod settings;
mod deck_legitimacy;
mod dashboard;
mod client_loc;

use tokio::sync::mpsc;
use std::path::PathBuf;
use tailer::{FileTailer, TailerEvent};
use parser::{parse_line, ParsedEvent};
use match_assembler::{MatchAssembler, PRESET_EVENT_DECK_NAME};
use db::DatabaseManager;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButtonState, MouseButton};
use tauri::image::Image;

fn redact_str(s: &str) -> String {
    if s.len() <= 6 {
        "[REDACTED]".to_string()
    } else {
        format!("{}...{}", &s[..3], &s[s.len()-3..])
    }
}

pub mod commands;
pub use commands::*;


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

async fn record_match_deck_audit(
    db_manager: &DatabaseManager,
    assembler: &MatchAssembler,
    match_id: &str,
    resolved_deck_name: Option<&str>,
) {
    if assembler.last_assigned_deck_event {
        let deck_title = resolved_deck_name.unwrap_or(PRESET_EVENT_DECK_NAME);
        let _ = db_manager
            .upsert_match_deck(
                match_id,
                Some(deck_title),
                None,
                true,
                Some("assigned-deck event (no deck submitted)"),
            )
            .await;
        return;
    }
    let deck_name = resolved_deck_name
        .map(|s| s.to_string())
        .or_else(|| assembler.cached_deck_name.clone());
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

/// Evaluates and awards deck-level achievements upon match completion
async fn evaluate_deck_achievements(
    db_manager: &DatabaseManager,
    record: &match_assembler::MatchRecord,
    min_player_life: i32,
) {
    if record.result != "win" {
        return;
    }
    let deck_name = &record.player_deck_name;
    if deck_name.is_empty() || deck_name == "Selected Deck" || deck_name == PRESET_EVENT_DECK_NAME {
        return;
    }
    if crate::deck_legitimacy::preset_deck_reason(deck_name).is_some() {
        return;
    }

    let match_id = Some(record.match_id.as_str());

    // 1. On a Roll: Consecutive match win streak with this deck
    // Fetch recent match results for this deck before this match
    let recent_results: Vec<String> = sqlx::query_scalar(
        "SELECT result FROM matches WHERE hero_deck_name = ? AND id != ? ORDER BY timestamp DESC LIMIT 20"
    )
    .bind(deck_name)
    .bind(&record.match_id)
    .fetch_all(db_manager.pool())
    .await
    .unwrap_or_default();

    let mut streak = 1usize; // including this win
    for res in recent_results {
        if res.eq_ignore_ascii_case("win") {
            streak += 1;
        } else {
            break;
        }
    }

    if streak >= 2 {
        let tier = if streak >= 5 { "gold" } else if streak >= 3 { "silver" } else { "bronze" };
        let _ = db_manager.record_deck_achievement(deck_name, "on_a_roll", tier, match_id).await;
    }

    // 2. Comeback Kid: Won match after player life dipped to critical danger
    if min_player_life <= 8 {
        let tier = if min_player_life <= 2 { "gold" } else if min_player_life <= 5 { "silver" } else { "bronze" };
        let _ = db_manager.record_deck_achievement(deck_name, "comeback_kid", tier, match_id).await;
    }

    // 3. Blitzkrieg: Lightning-fast win in few turns (strictly excluding opponent concedes)
    let is_concede = record.result_reason.as_deref()
        .map(|r| r.to_lowercase().contains("concede") || r.to_lowercase().contains("scoop"))
        .unwrap_or(false);

    if !is_concede && record.turns > 0 && record.turns <= 7 {
        let tier = if record.turns <= 4 { "gold" } else if record.turns <= 5 { "silver" } else { "bronze" };
        let _ = db_manager.record_deck_achievement(deck_name, "blitzkrieg", tier, match_id).await;
    }

    // 4. Iron Fortress: Ending match with huge player life total
    if let Some(end_life) = record.player_life_end {
        if end_life >= 30 {
            let tier = if end_life >= 100 { "gold" } else if end_life >= 50 { "silver" } else { "bronze" };
            let _ = db_manager.record_deck_achievement(deck_name, "iron_fortress", tier, match_id).await;
        }
    }

    // 5. Marathon Master: Won on turn 8+, 12+, 16+
    if record.turns >= 8 {
        let tier = if record.turns >= 16 { "gold" } else if record.turns >= 12 { "silver" } else { "bronze" };
        let _ = db_manager.record_deck_achievement(deck_name, "marathon", tier, match_id).await;
    }

    // 6. Deck Dominance: Lifetime career match wins with this deck
    let total_career_wins: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM matches WHERE hero_deck_name = ? AND result = 'win'"
    )
    .bind(deck_name)
    .fetch_one(db_manager.pool())
    .await
    .unwrap_or(1);

    if total_career_wins >= 3 {
        let tier = if total_career_wins >= 10 { "gold" } else if total_career_wins >= 5 { "silver" } else { "bronze" };
        let _ = db_manager.record_deck_achievement(deck_name, "dominance", tier, match_id).await;
    }
}

async fn dispatch_parsed_event(
    event: ParsedEvent,
    assembler: &mut MatchAssembler,
    db_manager: &DatabaseManager,
) {
    match event {
        ParsedEvent::Auth { screen_name, client_id } => {
            assembler.set_player_info(client_id.clone(), screen_name.clone());
            println!(
                "[EVENT 1: AUTH] Authenticated User: screen_name = \"{}\", client_id = \"{}\"",
                redact_str(&screen_name),
                redact_str(&client_id)
            );
        }
        ParsedEvent::MatchCreated { match_id, format_name, assigned_deck_event, reserved_players } => {
            assembler.start_match(match_id.clone(), format_name.clone(), assigned_deck_event);
            assembler.update_reserved_players(&reserved_players);
            println!(
                "[EVENT 2: MATCH_CREATED] Match ID = \"{}\", Format = \"{}\", Assigned-Deck Event = {}, Player Seat = {}, Opponent = \"{}\"",
                redact_str(&match_id),
                format_name,
                assigned_deck_event,
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
            if assembler.match_legitimate && !main_deck.is_empty() {
                let _ = db_manager.save_auto_deck_list(&deck_name, deck_id.as_deref(), commander_id, &main_deck).await;
            }
        }
        ParsedEvent::DeckCatalogBatch { decks } => {
            let count = decks.len();
            for (did, dname, cmd_id, main_deck) in &decks {
                if !main_deck.is_empty() && !dname.is_empty() {
                    let _ = db_manager.save_auto_deck_list(dname, Some(did.as_str()), *cmd_id, main_deck).await;
                }
            }
            assembler.register_deck_catalog(decks);
            println!("[EVENT: DECK_CATALOG] Registered {} decks into memory catalog & saved decklists", count);
        }
        ParsedEvent::GameStateUpdates { steps } => {
            for step in steps {
                for (orig_id, new_id) in step.object_id_changes {
                    assembler.handle_object_id_changed(orig_id, new_id);
                }
                for (ability_id, parent_id) in step.ability_associations {
                    assembler.register_ability_parent(ability_id, parent_id);
                }
                for (affector_id, affected_ids, category, zone_src, zone_dest) in step.zone_transfer_events {
                    assembler.process_zone_transfer_event(affector_id, &affected_ids, &category, zone_src, zone_dest);
                }
                for (instance_id, grp_id, owner_seat, zone_id, is_card, is_token, token_name) in step.objects {
                    assembler.process_game_object(instance_id, grp_id, owner_seat, zone_id, is_card, is_token, token_name);
                }
                for (ann_id, instance_id, target_id, amount, dtype) in step.damage_events {
                    assembler.process_damage_event(ann_id, instance_id, target_id, amount, dtype);
                }
                for (affector_id, target_seat, delta) in step.life_modifications {
                    assembler.process_life_modification(affector_id, target_seat, delta);
                }
                if step.turn_number > 0 {
                    assembler.update_game_state(step.msg_id, step.turn_number, &step.life_by_seat, step.active_seat);
                } else if !step.life_by_seat.is_empty() {
                    assembler.update_game_state(step.msg_id, assembler.current_turn, &step.life_by_seat, step.active_seat);
                }
                for (m_seat, is_mul, num_cards) in step.mulligan_events {
                    assembler.handle_mulligan_decision(m_seat, is_mul, num_cards);
                }
                if !step.diff_deleted_ids.is_empty() {
                    assembler.handle_deleted_instances(&step.diff_deleted_ids);
                }
                for (target_id, counter_type, amount) in step.counter_events {
                    assembler.process_counter_event(target_id, counter_type, amount);
                }
                for (affector_id, count) in step.draw_events {
                    assembler.process_draw_event(affector_id, count);
                }
                for (affector_id, target_id) in step.counter_spell_events {
                    assembler.process_counterspell_event(affector_id, target_id, None);
                }
                for (affector_id, count) in step.mana_paid_events {
                    assembler.process_mana_paid_event(affector_id, count);
                }
            }
            let draws = assembler.drain_collection_draws();
            if !draws.is_empty() {
                for g in draws {
                    let _ = db_manager.add_collection_draw(g as i64).await;
                }
            }
        }
        ParsedEvent::MulliganEvent { seat_id, is_mulligan, num_cards } => {
            assembler.handle_mulligan_decision(seat_id, is_mulligan, num_cards);
        }
        ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
            if let Some((mut record, card_records, turn_events, impactful)) = assembler.complete_match(winning_team_id, &reason) {
                let hero_gids: Vec<i64> = card_records.iter().filter(|c| !c.is_opponent).map(|c| c.grp_id as i64).collect();
                if record.player_deck_name.is_empty() || record.player_deck_name == "Selected Deck" {
                    if let Ok(Some(resolved_name)) = db_manager.resolve_deck_for_cards(&hero_gids, record.player_commander_id.map(|c| c as i64)).await {
                        record.player_deck_name = resolved_name.clone();
                        assembler.cached_deck_name = Some(resolved_name.clone());
                        assembler.match_legitimate = crate::deck_legitimacy::preset_deck_reason(&resolved_name).is_none();
                    }
                }
                if record.player_deck_name == PRESET_EVENT_DECK_NAME || record.player_deck_name.to_lowercase().starts_with("jump in") {
                    let resolved = db_manager.resolve_event_deck_name(&record.format_name, &hero_gids).await;
                    record.player_deck_name = resolved.clone();
                    assembler.cached_deck_name = Some(resolved);
                    assembler.match_legitimate = false;
                }

                let mut validated_impactful = impactful.clone();

                // Validate and award Negator titles based on countered spell CMCs from cards_cache
                let pending_counters = std::mem::take(&mut assembler.pending_counter_events);
                for (affector_grp, target_grp) in &pending_counters {
                    // Only award Negator if the spell was cast by hero (exists in card_records and not opponent)
                    if !card_records.iter().any(|c| !c.is_opponent && c.grp_id == *affector_grp) {
                        continue;
                    }
                    let target_cmc: Option<i64> = sqlx::query_scalar(
                        "SELECT cmc FROM cards_cache WHERE grp_id = ?"
                    ).bind(*target_grp as i64).fetch_optional(db_manager.pool()).await.unwrap_or(None);

                    if let Some(cmc) = target_cmc {
                        if cmc >= 4 {
                            let tier = if cmc >= 10 {
                                "Legendary"
                            } else if cmc >= 8 {
                                "Platinum"
                            } else if cmc >= 7 {
                                "Gold"
                            } else if cmc >= 6 {
                                "Silver"
                            } else if cmc >= 5 {
                                "Bronze"
                            } else {
                                "Iron"
                            };
                            if let Some(imp) = validated_impactful.iter_mut().find(|i| i.grp_id == *affector_grp) {
                                match_assembler::add_tiered_title(&mut imp.titles, "Negator", tier);
                            } else {
                                validated_impactful.push(match_assembler::MatchImpactfulRecord {
                                    grp_id: *affector_grp,
                                    seat_id: assembler.player_seat_id,
                                    total_damage: 0,
                                    max_hit: 0,
                                    max_hit_combat: 0,
                                    max_hit_spell: 0,
                                    damage_to_player: 0,
                                    damage_to_permanents: 0,
                                    damage_combat: 0,
                                    damage_spell: 0,
                                    titles: vec![format!("Negator ({})", tier)],
                                    cards_drawn: 0,
                                    counters_added: 0,
                                });
                            }
                        }
                    }
                }

                for imp in &mut validated_impactful {
                    let card_info = sqlx::query_as::<_, (Option<String>, Option<i64>)>(
                        "SELECT card_type, cmc FROM cards_cache WHERE grp_id = ?"
                    ).bind(imp.grp_id as i64).fetch_optional(db_manager.pool()).await.unwrap_or(None);

                    if let Some((card_type, cmc)) = card_info {
                        let type_str = card_type.unwrap_or_default().to_lowercase();
                        let is_land = type_str.contains("land");
                        let cmc_val = cmc.unwrap_or(0);

                        if is_land {
                            // Lands can never receive non-mana titles (e.g. Scoop Inducer, Tax Collector, Cat Burglar, etc.)
                            imp.titles.retain(|t| t.starts_with("Mana Dynamo"));
                        } else if cmc_val < 5 {
                            // Non-land cards with CMC < 5 cannot receive Scoop Inducer
                            imp.titles.retain(|t| !t.starts_with("Scoop Inducer"));
                        }
                    }
                }

                println!(
                    "[EVENT 6: MATCH_COMPLETED] Match ID = \"{}\", Deck = \"{}\", Result = \"{}\", Reason = \"{}\", Player End Life = {:?}, Opp End Life = {:?}, Turn Events Recorded = {}, Impactful Cards = {}",
                    redact_str(&record.match_id),
                    record.player_deck_name,
                    record.result,
                    reason,
                    record.player_life_end,
                    record.opponent_life_end,
                    turn_events.len(),
                    validated_impactful.len()
                );
                let _ = db_manager.upsert_match(&record, &card_records, &turn_events, &validated_impactful).await;
                record_match_deck_audit(db_manager, assembler, &record.match_id, Some(&record.player_deck_name)).await;
                let min_life = record.min_player_life.unwrap_or(assembler.min_player_life);
                evaluate_deck_achievements(db_manager, &record, min_life).await;
            }
        }
        ParsedEvent::Unknown => {}
    }
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
        match event {
            TailerEvent::InitialCatchupComplete => {
                let mut assembler = assembler_ref.lock().await;
                assembler.is_live = true;
                println!("[PROCESSOR] Tailer caught up with log. Live match event processing active.");
            }
            TailerEvent::Rotated => {
                println!("[PROCESSOR] Log rotated.");
            }
            TailerEvent::Line(line) => {
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
                        let parsed = parse_line(&payload_str);
                        dispatch_parsed_event(parsed, &mut assembler, &db_manager).await;
                    }
                } else {
                    let mut assembler = assembler_ref.lock().await;
                    let parsed = parse_line(&line);
                    dispatch_parsed_event(parsed, &mut assembler, &db_manager).await;
                }
            }
        }
    }
}



fn main() {
    // CRITICAL: Must be set BEFORE GTK/WebKit initializes any display connections to prevent DMA-BUF Wayland protocol crashes and black screens on NVIDIA/Linux drivers
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    if std::env::var("GDK_BACKEND").is_err() {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    let shared_assembler = std::sync::Arc::new(tokio::sync::Mutex::new(MatchAssembler::new()));
    let shared_state = SharedMatchState(shared_assembler.clone());

    // Launch Tauri Native App Window with single-instance enforcement and tokio async setup
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
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

            // Background card database auto-sync on startup if cards_cache is empty
            tauri::async_runtime::spawn(async move {
                let db_manager = match DatabaseManager::init().await {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[ERROR] DB init failed: {}", e);
                        return;
                    }
                };
                let count: i64 = sqlx::query_scalar("SELECT count(*) FROM cards_cache")
                    .fetch_one(db_manager.pool())
                    .await
                    .unwrap_or(0);
                if count == 0 {
                    println!("[STARTUP] cards_cache is empty. Triggering automatic background card sync...");
                    if let Ok((synced_count, elapsed_ms)) = card_db::sync_card_cache(db_manager.pool()).await {
                        println!("[STARTUP] Auto-synced {} cards into cards_cache in {} ms", synced_count, elapsed_ms);
                    }
                }
                let _ = get_universe(db_manager.pool()).await;
            });

            let is_prod = db::DatabaseManager::resolve_env().to_lowercase() == "production";

            if let Some(window) = app.get_webview_window("main") {
                if !is_prod {
                    let _ = window.set_title("Rhystic Tracker (Test Environment)");
                }
            }

            // 1. Build and register System Tray Icon
            let icon_bytes = if is_prod {
                include_bytes!("../icons/icon.png").as_slice()
            } else {
                include_bytes!("../icons/icon_test.png").as_slice()
            };
            let icon_live_bytes = include_bytes!("../icons/icon_live.png");
            let default_tray_icon = Image::from_bytes(icon_bytes)?;
            let live_tray_icon = Image::from_bytes(icon_live_bytes)?;

            let open_label = if is_prod { "Open Rhystic Tracker" } else { "Open Rhystic Tracker (Test)" };
            let open_item = MenuItem::with_id(app, "open", open_label, true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Rhystic Tracker", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let default_tooltip = if is_prod {
                "Rhystic Tracker".to_string()
            } else {
                "Rhystic Tracker (Test Environment)".to_string()
            };

            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(default_tray_icon.clone())
                .tooltip(&default_tooltip)
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
                        "live_match" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate-to-tab", "live");
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

            // Background task: monitor live match state and update Tray Icon & Context Menu
            let app_handle = app.handle().clone();
            let monitor_assembler = shared_assembler.clone();
            let default_tooltip_clone = default_tooltip.clone();
            tauri::async_runtime::spawn(async move {
                let mut was_in_match = false;
                loop {
                    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                    let (is_active, format, opp_name, turn) = {
                        let asm = monitor_assembler.lock().await;
                        if let Some(ref m) = asm.active_match {
                            (true, m.format_name.clone(), m.opponent_name.clone().unwrap_or_default(), asm.current_turn)
                        } else {
                            (false, String::new(), String::new(), 0)
                        }
                    };

                    if is_active != was_in_match {
                        was_in_match = is_active;
                        if let Some(tray_icon_handle) = app_handle.tray_by_id("main-tray") {
                            if is_active {
                                let _ = tray_icon_handle.set_icon(Some(live_tray_icon.clone()));
                                let round = (turn + 1) / 2;
                                let match_label = format!("⚔️ Live Match: {} (Round {})\n   vs {}", format, round, if opp_name.is_empty() { "Opponent" } else { &opp_name });
                                let _ = tray_icon_handle.set_tooltip(Some(format!("Rhystic Tracker — In Match (vs {})", if opp_name.is_empty() { "Opponent" } else { &opp_name })));
                                
                                if let Ok(live_item) = MenuItem::with_id(&app_handle, "live_match", &match_label, true, None::<&str>) {
                                    if let Ok(open_item) = MenuItem::with_id(&app_handle, "open", open_label, true, None::<&str>) {
                                        if let Ok(quit_item) = MenuItem::with_id(&app_handle, "quit", "Quit Rhystic Tracker", true, None::<&str>) {
                                            if let Ok(updated_menu) = Menu::with_items(&app_handle, &[&live_item, &open_item, &quit_item]) {
                                                let _ = tray_icon_handle.set_menu(Some(updated_menu));
                                            }
                                        }
                                    }
                                }
                            } else {
                                let _ = tray_icon_handle.set_icon(Some(default_tray_icon.clone()));
                                let _ = tray_icon_handle.set_tooltip(Some(&default_tooltip_clone));
                                if let Ok(open_item) = MenuItem::with_id(&app_handle, "open", open_label, true, None::<&str>) {
                                    if let Ok(quit_item) = MenuItem::with_id(&app_handle, "quit", "Quit Rhystic Tracker", true, None::<&str>) {
                                        if let Ok(default_menu) = Menu::with_items(&app_handle, &[&open_item, &quit_item]) {
                                            let _ = tray_icon_handle.set_menu(Some(default_menu));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

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
            get_app_environment,
            get_memory_stats,
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
            set_minimize_to_tray,
            get_cache_stats,
            clear_image_cache,
            get_avatar_cache_stats,
            clear_avatar_cache,
            save_avatar_image,
            has_avatar_image,
            extract_avatars_from_mtga_client,
            get_database_stats,
            export_database_backup,
            get_setup_status,
            complete_setup,
            reset_setup_wizard,
            sync_card_database,
            get_raw_card_db_status,
            set_raw_path,
            get_global_achievements,
            get_global_leaderboards,
            get_deck_achievements,
            get_all_deck_achievements,
            set_deck_custom_art,
            reset_deck_custom_art,
            set_deck_custom_bg_art,
            reset_deck_custom_bg_art,
            delete_match,
            set_always_on_top,
            get_dashboard_layout,
            save_dashboard_layout,
            reset_dashboard_layout,
            save_custom_background,
            get_preferred_prints,
            set_preferred_print,
            clear_preferred_print
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
             VALUES (?, ?, ?, 0, '', ?, ?, ?, ?, ?, DATETIME('now'))"
        )
        .bind(grp_id).bind(name).bind(mana_cost).bind(ci).bind(set).bind(rarity).bind(grp_id.to_string()).bind(card_type)
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
        seed_card(pool, 1007, "Teferi", "o1oWoU", "1,2", "DOM", 5, "Legendary Planeswalker").await;

        set_owned(pool, 1001, 2).await;
        set_owned(pool, 1002, 1).await;
        set_owned(pool, 1003, 4).await;
        set_owned(pool, 1004, 1).await;
        set_owned(pool, 1006, 1).await;
        set_owned(pool, 1007, 1).await;

        // Universe = the full cards_cache (all seeded cards are visible).
        seed_decklist(pool, "My Deck", r#"[{"grp_id":1001,"count":4},{"grp_id":1002,"count":2},{"grp_id":1003,"count":3},{"grp_id":1004,"count":1},{"grp_id":1006,"count":1},{"grp_id":1007,"count":1}]"#).await;
        seed_match(pool, "m1", "My Deck").await;
        seed_match_card(pool, "m1", 1005, false, 1).await;

        let set = query_collection(pool, &serde_json::json!({"sets": ["LEA"]})).await.unwrap();
        assert_eq!(set.get("cards").and_then(|v| v.as_array()).unwrap().len(), 4);

        // Strict mono-white: only Knight of Dawn and Serra Angel (not Teferi WU)
        let w = query_collection(pool, &serde_json::json!({"colors": ["W"]})).await.unwrap();
        assert_eq!(w.get("cards").and_then(|v| v.as_array()).unwrap().len(), 2);

        // Strict mono-blue: only Counterspell (not Teferi WU)
        let u = query_collection(pool, &serde_json::json!({"colors": ["U"]})).await.unwrap();
        assert_eq!(u.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);

        // Strict dual-color WU (Azorius): only Teferi
        let wu = query_collection(pool, &serde_json::json!({"colors": ["W", "U"]})).await.unwrap();
        assert_eq!(wu.get("cards").and_then(|v| v.as_array()).unwrap().len(), 1);
        assert_eq!(wu.get("cards").and_then(|v| v.as_array()).unwrap()[0].get("name").and_then(|v| v.as_str()).unwrap(), "Teferi");

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
