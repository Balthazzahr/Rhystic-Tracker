use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use rhystic_tracker::match_assembler::MatchAssembler;
use rhystic_tracker::parser::{parse_line, ParsedEvent};

fn main() {
    let log_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("Player.log"));
    println!("Reading existing raw log: {:?}", log_path);

    let file = File::open(log_path).expect("Failed to open Player.log");
    let reader = BufReader::new(file);

    let mut assembler = MatchAssembler::new();
    let mut in_target_match = false;
    let target_match_id = "1cce218d-95e6-4068-8e28-08b284d6d2aa";

    for line in reader.lines() {
        if let Ok(line_str) = line {
            if line_str.contains(target_match_id) {
                in_target_match = true;
            }

            if !in_target_match {
                continue;
            }

            match parse_line(&line_str) {
                ParsedEvent::Auth { screen_name, client_id } => {
                    assembler.set_player_user_id(client_id);
                }
                ParsedEvent::MatchCreated { match_id, format_name, reserved_players } => {
                    assembler.start_match(match_id, format_name);
                    assembler.update_reserved_players(&reserved_players);
                }
                ParsedEvent::DeckSubmitted { deck_name, commander_id, main_deck, .. } => {
                    assembler.set_deck(deck_name, None, commander_id, main_deck);
                }
                ParsedEvent::GameStateUpdateCombined { msg_id, objects, turn_number, life_by_seat, active_seat, damage_events } => {
                    if turn_number > 0 { assembler.current_turn = turn_number; }
                    for (instance_id, grp_id, owner_seat, zone_id) in objects {
                        assembler.process_game_object(instance_id, grp_id, owner_seat, zone_id);
                    }
                    for (instance_id, target_id, amount, dtype) in damage_events {
                        assembler.process_damage_event(instance_id, target_id, amount, dtype);
                    }
                    assembler.update_game_state(msg_id, turn_number, &life_by_seat, active_seat);
                }
                ParsedEvent::MatchCompleted { winning_team_id, reason, .. } => {
                    let res = assembler.complete_match(winning_team_id, &reason);
                    if let Some((record, _cards, turn_events, _impactful)) = res {
                        println!("\n=== OFFLINE TEST MATCH COMPLETED ===");
                        println!("Match ID: {}", record.match_id);
                        println!("Player Deck: {:?}", record.player_deck_name);
                        println!("Opponent Name: {:?}", record.opponent_name);
                        println!("Result: {}", record.result);
                        println!("Total Turn Events Captured: {}", turn_events.len());
                        println!("\n--- Turn Events Sample ---");
                        for (i, evt) in turn_events.iter().enumerate() {
                            println!(
                                "  #{:02} [Turn {}] Seat {}: {} (GRP ID #{})",
                                i + 1,
                                evt.turn_number,
                                evt.seat_id,
                                evt.event_type.to_uppercase(),
                                evt.grp_id
                            );
                        }
                    }
                    break;
                }
                _ => {}
            }
        }
    }
}
