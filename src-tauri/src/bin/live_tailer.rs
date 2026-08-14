use std::path::PathBuf;
use tokio::sync::mpsc;
use rhystic_tracker::tailer::{FileTailer, TailerEvent};
use rhystic_tracker::parser::{parse_line, ParsedEvent};
use rhystic_tracker::match_assembler::MatchAssembler;
use rhystic_tracker::db::DatabaseManager;

fn redact_str(s: &str) -> String {
    if s.len() <= 6 {
        "[REDACTED]".to_string()
    } else {
        format!("{}...{}", &s[..3], &s[s.len()-3..])
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_manager = DatabaseManager::init().await?;
    println!("[LIVE TEST RUNNER] Initialized database: {}", db_manager.db_filename);

    let log_path = PathBuf::from(
        "/mnt/Games/SteamLibrary/steamapps/compatdata/2141910/pfx/drive_c/users/steamuser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log"
    );

    let (tx, mut rx) = mpsc::channel::<TailerEvent>(2000);
    let tailer = FileTailer::new_from_end(log_path, tx);

    tokio::spawn(async move {
        tailer.run().await;
    });

    println!("[LIVE TEST RUNNER] Tailer actively listening strictly from EOF. Ready for live game match!");

    let mut assembler = MatchAssembler::new();

    while let Some(event) = rx.recv().await {
        if let TailerEvent::Line(line) = event {
            match parse_line(&line) {
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
                    assembler.set_deck(deck_name.clone(), commander_id, main_deck);
                    println!(
                        "[EVENT 3: DECK_SUBMITTED] Deck = \"{}\", Commander GRPID = {:?}, Total Cards = {}",
                        deck_name,
                        commander_id,
                        total_cards
                    );
                }
                ParsedEvent::GameStateUpdateCombined { msg_id, objects, turn_number, life_by_seat, active_seat, damage_events } => {
                    if turn_number > 0 { assembler.current_turn = turn_number; }
                    for (instance_id, grp_id, owner_seat, zone_id) in objects {
                        assembler.process_game_object(instance_id, grp_id, owner_seat, zone_id);
                    }
                    for (instance_id, amount) in damage_events {
                        assembler.process_damage_event(instance_id, amount);
                    }
                    assembler.update_game_state(msg_id, turn_number, &life_by_seat, active_seat);
                }
                ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                    if let Some((record, card_records, turn_event_records, impactful_records)) = assembler.complete_match(winning_team_id, &reason) {
                        println!(
                            "[EVENT 6: MATCH_COMPLETED] Match ID = \"{}\", Result = \"{}\", Reason = \"{}\", Player End Life = {:?}, Opp End Life = {:?}",
                            redact_str(&record.match_id),
                            record.result,
                            reason,
                            record.player_life_end,
                            record.opponent_life_end
                        );
                        let _ = db_manager.upsert_match(&record, &card_records, &turn_event_records, &impactful_records).await;
                        println!("[LIVE TEST RUNNER] Upserted match record into rhystic_dev.db!");
                    }
                }
                ParsedEvent::Unknown => {}
            }
        }
    }

    Ok(())
}
