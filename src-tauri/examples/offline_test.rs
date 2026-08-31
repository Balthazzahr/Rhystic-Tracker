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
                ParsedEvent::MatchCreated { match_id, format_name, assigned_deck_event, reserved_players } => {
                    assembler.start_match(match_id, format_name, assigned_deck_event);
                    assembler.update_reserved_players(&reserved_players);
                }
                ParsedEvent::DeckSubmitted { deck_name, commander_id, main_deck, .. } => {
                    assembler.set_deck(deck_name, None, commander_id, main_deck);
                }
                ParsedEvent::GameStateUpdates { steps } => {
                    for step in steps {
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
                        for (ability_id, parent_id) in step.ability_associations {
                            assembler.register_ability_parent(ability_id, parent_id);
                        }
                        for (instance_id, grp_id, owner_seat, zone_id, is_card, is_token, token_name) in step.objects {
                            assembler.process_game_object(instance_id, grp_id, owner_seat, zone_id, is_card, is_token, token_name);
                        }
                        for (ann_id, instance_id, target_id, amount, dtype) in step.damage_events {
                            assembler.process_damage_event(ann_id, instance_id, target_id, amount, dtype);
                        }
                        for (target_id, counter_type, amount) in step.counter_events {
                            assembler.process_counter_event(target_id, counter_type, amount);
                        }
                        for (affector_id, count) in step.draw_events {
                            assembler.process_draw_event(affector_id, count);
                        }
                    }
                }
                ParsedEvent::MulliganEvent { seat_id, is_mulligan, num_cards } => {
                    assembler.handle_mulligan_decision(seat_id, is_mulligan, num_cards);
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
