use std::collections::{HashMap, HashSet};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRecord {
    pub match_id: String,
    pub timestamp: DateTime<Utc>,
    pub date_str: String,
    pub format_name: String,
    pub result: String, // "win", "loss", or "unknown"
    pub duration_seconds: u32,
    pub turns: u32,
    pub going_first: bool,
    pub player_deck_name: String,
    pub player_commander_id: Option<u32>,
    pub player_life_end: Option<i32>,
    pub opponent_name: Option<String>,
    pub opponent_commander_id: Option<u32>,
    pub opponent_mulligans: Option<u32>,
    pub opponent_life_end: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct MatchCardRecord {
    pub grp_id: u32,
    pub is_opponent: bool,
    pub count: u32,
}

#[derive(Debug, Clone)]
pub struct MatchTurnEventRecord {
    pub turn_number: u32,
    pub seat_id: u32,
    pub event_type: String,
    pub grp_id: u32,
    pub timestamp: String,
}

pub struct MatchAssembler {
    pub active_match: Option<MatchRecord>,
    pub player_seat_id: u32,
    pub player_user_id: Option<String>,
    pub cached_deck_name: Option<String>,
    pub cached_commander_id: Option<u32>,
    pub current_player_life: i32,
    pub current_opp_life: i32,
    pub player_cards_seen: HashMap<u32, u32>,
    pub opp_cards_seen: HashMap<u32, u32>,
    pub instance_map: HashMap<u32, u32>, // instanceId -> grpId
    pub instance_zone_map: HashMap<u32, u32>, // instanceId -> current zoneId
    pub recorded_actions: HashSet<(u32, u32, String)>, // (turn_number, instance_id, event_type)
    pub turn_events: Vec<MatchTurnEventRecord>,
    pub current_turn: u32,
    pub processed_msg_ids: HashSet<u64>,
}

impl MatchAssembler {
    pub fn new() -> Self {
        Self {
            active_match: None,
            player_seat_id: 1,
            player_user_id: None,
            cached_deck_name: None,
            cached_commander_id: None,
            current_player_life: 20,
            current_opp_life: 20,
            player_cards_seen: HashMap::new(),
            opp_cards_seen: HashMap::new(),
            instance_map: HashMap::new(),
            instance_zone_map: HashMap::new(),
            recorded_actions: HashSet::new(),
            turn_events: Vec::new(),
            current_turn: 1,
            processed_msg_ids: HashSet::new(),
        }
    }

    pub fn set_player_user_id(&mut self, user_id: String) {
        self.player_user_id = Some(user_id);
    }

    pub fn start_match(&mut self, match_id: String, format_name: String) {
        let now = Utc::now();
        let default_life = if format_name.to_lowercase().contains("brawl") { 25 } else { 20 };

        self.current_player_life = default_life;
        self.current_opp_life = default_life;
        self.player_cards_seen.clear();
        self.opp_cards_seen.clear();
        self.processed_msg_ids.clear();
        self.player_seat_id = 1;

        let deck_name = self.cached_deck_name.clone().unwrap_or_else(|| "Selected Deck".to_string());
        let commander_id = self.cached_commander_id;

        self.active_match = Some(MatchRecord {
            match_id,
            timestamp: now,
            date_str: now.format("%Y-%m-%d %H:%M:%S").to_string(),
            format_name,
            result: "unknown".to_string(),
            duration_seconds: 0,
            turns: 0,
            going_first: true,
            player_deck_name: deck_name,
            player_commander_id: commander_id,
            player_life_end: Some(default_life),
            opponent_name: None,
            opponent_commander_id: None,
            opponent_mulligans: Some(0),
            opponent_life_end: Some(default_life),
        });
    }

    pub fn update_reserved_players(&mut self, reserved_players: &serde_json::Value) {
        if let Some(players) = reserved_players.as_array() {
            for p in players {
                let pid = p.get("userId").and_then(|u| u.as_str()).unwrap_or("");
                let system_seat = p.get("systemSeatId").and_then(|s| s.as_u64()).unwrap_or(0) as u32;

                let is_me = self.player_user_id.as_ref().map_or(false, |uid| uid == pid);

                if is_me {
                    if system_seat > 0 {
                        self.player_seat_id = system_seat;
                    }
                } else if !pid.contains("Familiar") {
                    if let Some(opp_name) = p.get("playerName").and_then(|n| n.as_str()) {
                        if let Some(m) = &mut self.active_match {
                            m.opponent_name = Some(opp_name.to_string());
                        }
                    }

                    // Stage 2: Extract Opponent Commander from deckSummary.commanderCards
                    if let Some(deck_summary) = p.get("deckSummary") {
                        if let Some(comm_cards) = deck_summary.get("commanderCards").and_then(|c| c.as_array()) {
                            if let Some(comm_id) = comm_cards.first().and_then(|c| c.as_u64()) {
                                if let Some(m) = &mut self.active_match {
                                    m.opponent_commander_id = Some(comm_id as u32);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn set_deck(&mut self, deck_name: String, commander_id: Option<u32>, main_deck: Vec<u32>) {
        self.cached_deck_name = Some(deck_name.clone());
        if commander_id.is_some() {
            self.cached_commander_id = commander_id;
        }
        if let Some(m) = &mut self.active_match {
            m.player_deck_name = deck_name;
            if commander_id.is_some() {
                m.player_commander_id = commander_id;
            }
        }
        for grp_id in main_deck {
            *self.player_cards_seen.entry(grp_id).or_insert(0) += 1;
        }
    }

    pub fn process_game_object(&mut self, instance_id: u32, grp_id: Option<u32>, owner_seat: Option<u32>, zone_id: u32) -> Option<(u32, u32, String)> {
        // Update instance_map if grp_id provided
        if let Some(gid) = grp_id {
            if gid > 0 {
                self.instance_map.insert(instance_id, gid);
            }
        }

        let resolved_grp_id = grp_id.or_else(|| self.instance_map.get(&instance_id).copied())?;
        let seat_id = owner_seat.unwrap_or(self.player_seat_id);

        let previous_zone = self.instance_zone_map.get(&instance_id).copied();
        self.instance_zone_map.insert(instance_id, zone_id);

        // Determine event type from zone transition
        let is_hand = zone_id == 31 || zone_id == 35;
        let is_play_zone = zone_id == 27 || zone_id == 28;

        let mut event_type = None;
        if is_hand && previous_zone != Some(zone_id) {
            event_type = Some("draw".to_string());
        } else if is_play_zone && previous_zone != Some(zone_id) {
            event_type = Some("play".to_string());
        }

        if let Some(etype) = event_type {
            let key = (self.current_turn, instance_id, etype.clone());
            if !self.recorded_actions.contains(&key) {
                self.recorded_actions.insert(key);

                let is_opponent = seat_id != self.player_seat_id;
                let target_map = if is_opponent { &mut self.opp_cards_seen } else { &mut self.player_cards_seen };
                *target_map.entry(resolved_grp_id).or_insert(0) += 1;

                self.turn_events.push(MatchTurnEventRecord {
                    turn_number: self.current_turn,
                    seat_id,
                    event_type: etype.clone(),
                    grp_id: resolved_grp_id,
                    timestamp: Utc::now().to_rfc3339(),
                });

                return Some((resolved_grp_id, seat_id, etype));
            }
        }

        None
    }

    pub fn update_game_state(&mut self, msg_id: Option<u64>, turn: u32, p_life: Option<i32>, o_life: Option<i32>, active_seat: u32) {
        if let Some(mid) = msg_id {
            if self.processed_msg_ids.contains(&mid) {
                return;
            }
            self.processed_msg_ids.insert(mid);
        }

        if turn > 0 {
            self.current_turn = turn;
        }

        if let Some(p) = p_life { self.current_player_life = p; }
        if let Some(o) = o_life { self.current_opp_life = o; }

        if let Some(m) = &mut self.active_match {
            if turn > m.turns {
                m.turns = turn;
            }
            m.player_life_end = Some(self.current_player_life);
            m.opponent_life_end = Some(self.current_opp_life);
            if turn == 1 && active_seat != self.player_seat_id {
                m.going_first = false;
            }
        }
    }

    pub fn complete_match(&mut self, winning_team_id: u32, _reason: &str) -> Option<(MatchRecord, Vec<MatchCardRecord>, Vec<MatchTurnEventRecord>)> {
        if let Some(mut m) = self.active_match.take() {
            let is_win = winning_team_id == self.player_seat_id;
            m.result = if is_win { "win".to_string() } else { "loss".to_string() };
            m.player_life_end = Some(self.current_player_life);
            m.opponent_life_end = Some(self.current_opp_life);

            let mut card_records = Vec::new();
            for (grp_id, count) in &self.player_cards_seen {
                card_records.push(MatchCardRecord {
                    grp_id: *grp_id,
                    is_opponent: false,
                    count: *count,
                });
            }
            for (grp_id, count) in &self.opp_cards_seen {
                card_records.push(MatchCardRecord {
                    grp_id: *grp_id,
                    is_opponent: true,
                    count: *count,
                });
            }

            let turn_events = std::mem::take(&mut self.turn_events);
            return Some((m, card_records, turn_events));
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_ordering_deck_submitted_before_match_created() {
        let mut assembler = MatchAssembler::new();

        // 1. Simulate Event 3 (DeckSubmitted) arriving BEFORE Event 2 (MatchCreated)
        assembler.set_deck(
            "Dying Lands".to_string(),
            Some(91719),
            vec![101, 102, 103],
        );

        assert_eq!(assembler.cached_deck_name, Some("Dying Lands".to_string()));
        assert_eq!(assembler.cached_commander_id, Some(91719));

        // 2. Simulate Event 2 (MatchCreated) arriving AFTER Event 3
        assembler.start_match("test-match-uuid-123".to_string(), "Brawl".to_string());

        let active = assembler.active_match.as_ref().expect("Active match should exist");

        // 3. Assert pre-cached deck_name and commander_id were preserved and NOT wiped to fallback
        assert_eq!(active.player_deck_name, "Dying Lands");
        assert_eq!(active.player_commander_id, Some(91719));
    }
}
