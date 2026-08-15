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
    pub hero_seat_id: u32,
    pub player_deck_name: String,
    pub player_commander_id: Option<u32>,
    pub player_commander_name: Option<String>,
    pub player_life_end: Option<i32>,
    pub opponent_name: Option<String>,
    pub opponent_commander_id: Option<u32>,
    pub opponent_commander_name: Option<String>,
    pub opponent_mulligans: Option<u32>,
    pub opponent_life_end: Option<i32>,
    pub result_reason: Option<String>,
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

#[derive(Debug, Clone)]
pub struct MatchImpactfulRecord {
    pub grp_id: u32,
    pub seat_id: u32,
    pub total_damage: i32,
    pub max_hit: i32,
}

pub struct MatchAssembler {
    pub active_match: Option<MatchRecord>,
    pub player_seat_id: u32,
    pub player_user_id: Option<String>,
    pub cached_deck_name: Option<String>,
    pub cached_deck_id: Option<String>,
    pub cached_commander_id: Option<u32>,
    /// True when the current (or cached) deck is a legitimate user deck, not a
    /// preset. Only legitimate matches feed the draw-based collection.
    pub match_legitimate: bool,
    /// grp_ids of my cards drawn from my own library into my hand during a
    /// legitimate match. Drained by the tailer into collection_cards.
    pub collection_draws: Vec<u32>,
    pub current_player_life: i32,
    pub current_opp_life: i32,
    pub player_cards_seen: HashMap<u32, u32>,
    pub opp_cards_seen: HashMap<u32, u32>,
    pub instance_map: HashMap<u32, u32>, // instanceId -> grpId
    pub instance_zone_map: HashMap<u32, u32>, // instanceId -> current zoneId
    pub instance_owner_map: HashMap<u32, u32>, // instanceId -> ownerSeatId
    pub recorded_actions: HashSet<(u32, u32, String)>, // (turn_number, instance_id, event_type)
    pub turn_events: Vec<MatchTurnEventRecord>,
    pub turn_event_seqs: Vec<u64>,
    pub life_events: Vec<(u32, i32, i32, u32, u64)>, // (turn, old_life, new_life, seat_id, seq)
    pub feed_seq: u64,
    pub current_turn: u32,
    pub impactful_cards: HashMap<u32, (u32, i32, i32)>, // grp_id -> (seat_id, total_damage, max_hit)
    pub processed_msg_ids: HashSet<u64>,
    pub last_completed: Option<(MatchRecord, chrono::DateTime<Utc>)>,
}

impl MatchAssembler {
    pub fn new() -> Self {
        Self {
            active_match: None,
            player_seat_id: 1,
            player_user_id: None,
            cached_deck_name: None,
            cached_deck_id: None,
            cached_commander_id: None,
            match_legitimate: false,
            collection_draws: Vec::new(),
            current_player_life: 20,
            current_opp_life: 20,
            player_cards_seen: HashMap::new(),
            opp_cards_seen: HashMap::new(),
            instance_map: HashMap::new(),
            instance_zone_map: HashMap::new(),
            instance_owner_map: HashMap::new(),
            recorded_actions: HashSet::new(),
            turn_events: Vec::new(),
            turn_event_seqs: Vec::new(),
            life_events: Vec::new(),
            feed_seq: 0,
            current_turn: 1,
            impactful_cards: HashMap::new(),
            processed_msg_ids: HashSet::new(),
            last_completed: None,
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
        self.life_events.clear();
        self.current_turn = 1;
        self.turn_event_seqs.clear();
        self.feed_seq = 0;
        self.player_seat_id = 1;
        self.collection_draws.clear();

        // Legitimacy is based on the cached deck (submitted pre-match via
        // EventSetDeckV2). If no deck identity is known (e.g. course-deck /
        // DeckSelect path), the match is treated as NOT legitimate.
        self.match_legitimate = self.cached_deck_name.as_deref()
            .map(crate::deck_legitimacy::preset_deck_reason)
            .unwrap_or(Some("no deck identity"))
            .is_none();

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
            hero_seat_id: self.player_seat_id,
            player_deck_name: deck_name,
            player_commander_id: commander_id,
            player_commander_name: None,
            player_life_end: Some(default_life),
            opponent_name: None,
            opponent_commander_id: None,
            opponent_commander_name: None,
            opponent_mulligans: Some(0),
            opponent_life_end: Some(default_life),
            result_reason: None,
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
                        if let Some(m) = &mut self.active_match {
                            m.hero_seat_id = system_seat;
                        }
                    }
                } else {
                    if let Some(opp_name) = p.get("playerName").and_then(|n| n.as_str()) {
                        if !opp_name.is_empty() {
                            if let Some(m) = &mut self.active_match {
                                m.opponent_name = Some(opp_name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn set_deck(&mut self, deck_name: String, deck_id: Option<String>, commander_id: Option<u32>, main_deck: Vec<u32>) {
        self.cached_deck_name = Some(deck_name.clone());
        if deck_id.is_some() {
            self.cached_deck_id = deck_id;
        }
        self.match_legitimate = crate::deck_legitimacy::preset_deck_reason(&deck_name).is_none();
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

    /// Drain the grp_ids of cards I drew from my own library into my hand during
    /// this (legitimate) match. Consumed by the tailer to feed collection_cards.
    pub fn drain_collection_draws(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.collection_draws)
    }

    pub fn process_game_object(&mut self, instance_id: u32, grp_id: Option<u32>, owner_seat: Option<u32>, zone_id: u32) -> Option<(u32, u32, String)> {
        // Track whether this call is the first time we learn the grp_id for this instance.
        // MTGA can emit a game object with a null grpId first (card already in hand/library),
        // then send the grpId in a later GameStateMessage. In that case the zone hasn't changed
        // (previous_zone == zone_id) but we should still register the draw that was missed.
        let mut learning_grp_now = false;
        if let Some(gid) = grp_id {
            if gid > 0 {
                if !self.instance_map.contains_key(&instance_id) {
                    learning_grp_now = true;
                }
                self.instance_map.insert(instance_id, gid);
                if let Some(seat) = owner_seat {
                    if seat > 0 {
                        self.instance_owner_map.insert(instance_id, seat);
                    }
                }

                // Command Zone (ZoneId 26) Commander Detection Fallback
                if zone_id == 26 {
                    let seat = owner_seat.unwrap_or(0);
                    if let Some(m) = &mut self.active_match {
                        if seat == self.player_seat_id && m.player_commander_id.is_none() {
                            m.player_commander_id = Some(gid);
                        } else if seat > 0 && seat != self.player_seat_id && m.opponent_commander_id.is_none() {
                            m.opponent_commander_id = Some(gid);
                        }
                    }
                }
            }
        }

        let resolved_grp_id = grp_id.or_else(|| self.instance_map.get(&instance_id).copied())?;
        let seat_id = owner_seat.unwrap_or(self.player_seat_id);

        let previous_zone = self.instance_zone_map.get(&instance_id).copied();
        self.instance_zone_map.insert(instance_id, zone_id);

        // Zone IDs (verified against real MTGA logs):
        //   Hand = 31/35, Library = 32/36, Battlefield = 28, Stack = 27,
        //   Graveyard = 33, Exile = 29, Command = 26, Sideboard = 34.
        const LIBRARY_ZONES: [u32; 2] = [32, 36];
        const HAND_ZONES: [u32; 2] = [31, 35];

        // Determine event type from zone transition.
        // "draw" is strictly a card entering hand from the player's own library
        // (natural draws, tutors, searches) OR a card already in hand that we're
        // first learning about (opening hand — which also came from our library).
        // Cards entering hand from graveyard/exile/stack, cast-from-opponent-
        // library effects, spell copies, and tokens are NOT draws and do NOT
        // indicate ownership. Borrowed cards (opponent-owned, stolen into hand)
        // carry the opponent's ownerSeatId and are excluded downstream.
        let is_hand = HAND_ZONES.contains(&zone_id);
        let was_library = previous_zone.map(|p| LIBRARY_ZONES.contains(&p)).unwrap_or(false);
        let learned_in_hand = learning_grp_now && is_hand
            && previous_zone.map(|p| HAND_ZONES.contains(&p)).unwrap_or(false);
        let is_play_zone = zone_id == 27 || zone_id == 28;

        let mut event_type = None;
        if is_hand && (previous_zone != Some(zone_id) || (previous_zone.is_some() && learning_grp_now)) {
            if was_library || learned_in_hand {
                event_type = Some("draw".to_string());
            }
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

                // Collection signal: a draw of MY card (from my library into my
                // hand) during a legitimate match. Borrowed cards (stolen from
                // opponent) carry the opponent's ownerSeatId and are excluded.
                if etype == "draw" && !is_opponent && self.match_legitimate {
                    self.collection_draws.push(resolved_grp_id);
                }

                self.turn_events.push(MatchTurnEventRecord {
                    turn_number: self.current_turn,
                    seat_id,
                    event_type: etype.clone(),
                    grp_id: resolved_grp_id,
                    timestamp: Utc::now().to_rfc3339(),
                });
                self.turn_event_seqs.push(self.feed_seq);
                self.feed_seq += 1;

                return Some((resolved_grp_id, seat_id, etype));
            }
        }

        None
    }

    /// Record damage/life-loss attributed to a card instance (from ModifiedLife /
    /// DamageDealt annotations). Aggregates total impact and biggest single swing per card.
    pub fn process_damage_event(&mut self, instance_id: u32, amount: i32) {
        let grp_id = self.instance_map.get(&instance_id).copied().unwrap_or(0);
        if grp_id == 0 {
            return;
        }
        let seat_id = self.instance_owner_map.get(&instance_id).copied().unwrap_or(0);
        let magnitude = amount.abs();
        let entry = self.impactful_cards.entry(grp_id).or_insert((seat_id, 0, 0));
        entry.1 += magnitude;
        if magnitude > entry.2 {
            entry.2 = magnitude;
        }
        // Ensure seat is populated if it wasn't when the entry was created.
        if entry.0 == 0 {
            entry.0 = seat_id;
        }
    }

    pub fn update_game_state(&mut self, msg_id: Option<u64>, turn: u32, life_by_seat: &[(u32, i32)], active_seat: u32) {
        if let Some(mid) = msg_id {
            if self.processed_msg_ids.contains(&mid) {
                return;
            }
            self.processed_msg_ids.insert(mid);
        }

        if turn > 0 {
            self.current_turn = turn;
        }

        // Map life totals by seat using the player's known seat id, recording
        // a live "life" feed entry whenever a total changes.
        let mut new_player_life: Option<i32> = None;
        let mut new_opp_life: Option<i32> = None;
        for (seat_id, life) in life_by_seat {
            if *seat_id == self.player_seat_id {
                new_player_life = Some(*life);
            } else {
                new_opp_life = Some(*life);
            }
        }
        if let Some(life) = new_player_life {
            if life != self.current_player_life {
                self.life_events.push((self.current_turn, self.current_player_life, life, self.player_seat_id, self.feed_seq));
                self.feed_seq += 1;
                self.current_player_life = life;
            }
        }
        if let Some(life) = new_opp_life {
            if life != self.current_opp_life {
                self.life_events.push((self.current_turn, self.current_opp_life, life, self.player_seat_id + 1, self.feed_seq));
                self.feed_seq += 1;
                self.current_opp_life = life;
            }
        }

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

    pub fn complete_match(&mut self, winning_team_id: u32, reason: &str) -> Option<(MatchRecord, Vec<MatchCardRecord>, Vec<MatchTurnEventRecord>, Vec<MatchImpactfulRecord>)> {
        if let Some(mut m) = self.active_match.take() {
            let is_win = winning_team_id == self.player_seat_id;
            m.result = if is_win { "win".to_string() } else { "loss".to_string() };
            m.player_life_end = Some(self.current_player_life);
            m.opponent_life_end = Some(self.current_opp_life);
            let reason_clean = if reason.is_empty() { None } else { Some(reason.to_string()) };
            m.result_reason = reason_clean;

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

            let impactful_records: Vec<MatchImpactfulRecord> = self.impactful_cards.iter()
                .map(|(grp_id, (seat_id, total, max_hit))| MatchImpactfulRecord {
                    grp_id: *grp_id,
                    seat_id: *seat_id,
                    total_damage: *total,
                    max_hit: *max_hit,
                })
                .collect();

            self.last_completed = Some((m.clone(), Utc::now()));
            return Some((m, card_records, turn_events, impactful_records));
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
            None,
            Some(91719),
            vec![101, 102, 103],
        );

        assert_eq!(assembler.cached_deck_name, Some("Dying Lands".to_string()));
        assert_eq!(assembler.cached_commander_id, Some(91719));
        assert!(assembler.match_legitimate);

        // 2. Simulate Event 2 (MatchCreated) arriving AFTER Event 3
        assembler.start_match("test-match-uuid-123".to_string(), "Brawl".to_string());

        let active = assembler.active_match.as_ref().expect("Active match should exist");

        // 3. Assert pre-cached deck_name and commander_id were preserved and NOT wiped to fallback
        assert_eq!(active.player_deck_name, "Dying Lands");
        assert_eq!(active.player_commander_id, Some(91719));
    }
}
