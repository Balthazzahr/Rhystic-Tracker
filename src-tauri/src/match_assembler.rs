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
    pub player_mulligans: Option<u32>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchImpactfulRecord {
    pub grp_id: u32,
    pub seat_id: u32,
    pub total_damage: i32,
    pub max_hit: i32,
    pub damage_to_player: i32,
    pub damage_to_permanents: i32,
    pub damage_combat: i32,
    pub damage_spell: i32,
    pub titles: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CardDamageStats {
    pub seat_id: u32,
    pub total_damage: i32,
    pub max_hit: i32,
    pub damage_to_player: i32,
    pub damage_to_permanents: i32,
    pub damage_combat: i32,
    pub damage_spell: i32,
    pub titles: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LiveDamageFeedEvent {
    pub source_instance_id: u32,
    pub target_instance_id: u32,
    pub amount: i32,
    pub damage_type: u32, // 1 = combat, 2 = non-combat/spell
}

pub struct MatchAssembler {
    pub active_match: Option<MatchRecord>,
    pub player_seat_id: u32,
    pub player_user_id: Option<String>,
    pub cached_deck_name: Option<String>,
    pub cached_deck_id: Option<String>,
    pub cached_commander_id: Option<u32>,
    pub known_decks: HashMap<String, (String, Option<u32>, Vec<u32>)>,
    /// True when the current (or cached) deck is a legitimate user deck, not a
    /// preset. Only legitimate matches feed the draw-based collection.
    pub match_legitimate: bool,
    /// grp_ids of my cards drawn from my own library into my hand during a
    /// legitimate match. Drained by the tailer into collection_cards.
    pub collection_draws: Vec<u32>,
    pub current_player_life: i32,
    pub current_opp_life: i32,
    pub player_mulligans: u32,
    pub opponent_mulligans: u32,
    pub player_opening_hand: Vec<(u32, u32)>, // (instance_id, grp_id)
    pub opening_hand_finalized: bool,
    pub player_cards_seen: HashMap<u32, u32>,
    pub opp_cards_seen: HashMap<u32, u32>,
    pub instance_map: HashMap<u32, u32>, // instanceId -> grpId
    pub instance_zone_map: HashMap<u32, u32>, // instanceId -> current zoneId
    pub instance_owner_map: HashMap<u32, u32>, // instanceId -> ownerSeatId
    pub recorded_actions: HashSet<(u32, u32, String)>, // (turn_number, instance_id, event_type)
    pub turn_events: Vec<MatchTurnEventRecord>,
    pub turn_event_seqs: Vec<u64>,
    pub life_events: Vec<(u32, i32, i32, u32, u64)>, // (turn, old_life, new_life, seat_id, seq)
    pub damage_feed_events: Vec<(LiveDamageFeedEvent, u64)>, // (damage_event, seq)
    pub feed_seq: u64,
    pub current_turn: u32,
    pub turn_1_active_seat: Option<u32>,
    pub match_start_time: Option<chrono::DateTime<Utc>>,
    pub impactful_cards: HashMap<u32, CardDamageStats>, // grp_id -> CardDamageStats
    pub last_hero_damage_hit: Option<(u32, i32, i32)>, // (grp_id, amount, opp_life_before)
    pub processed_msg_ids: HashSet<u64>,
    pub last_completed: Option<(MatchRecord, chrono::DateTime<Utc>)>,
    pub is_live: bool,
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
            known_decks: HashMap::new(),
            match_legitimate: true,
            collection_draws: Vec::new(),
            current_player_life: 20,
            current_opp_life: 20,
            player_mulligans: 0,
            opponent_mulligans: 0,
            player_opening_hand: Vec::new(),
            opening_hand_finalized: false,
            player_cards_seen: HashMap::new(),
            opp_cards_seen: HashMap::new(),
            instance_map: HashMap::new(),
            instance_zone_map: HashMap::new(),
            instance_owner_map: HashMap::new(),
            recorded_actions: HashSet::new(),
            turn_events: Vec::new(),
            turn_event_seqs: Vec::new(),
            life_events: Vec::new(),
            damage_feed_events: Vec::new(),
            feed_seq: 0,
            current_turn: 0,
            turn_1_active_seat: None,
            match_start_time: None,
            impactful_cards: HashMap::new(),
            last_hero_damage_hit: None,
            processed_msg_ids: HashSet::new(),
            last_completed: None,
            is_live: false,
        }
    }

    pub fn set_player_user_id(&mut self, user_id: String) {
        self.player_user_id = Some(user_id);
    }

    pub fn register_deck_catalog(&mut self, decks: Vec<(String, String, Option<u32>, Vec<u32>)>) {
        for (did, dname, cmd, main) in decks {
            if !did.is_empty() {
                self.known_decks.insert(did.clone(), (dname.clone(), cmd, main));
                if self.cached_deck_id.as_deref() == Some(&did) {
                    if self.cached_deck_name.is_none() || self.cached_deck_name.as_deref() == Some("Selected Deck") {
                        if !dname.is_empty() {
                            self.cached_deck_name = Some(dname.clone());
                            self.match_legitimate = crate::deck_legitimacy::preset_deck_reason(&dname).is_none();
                        }
                    }
                    if self.cached_commander_id.is_none() && cmd.is_some() {
                        self.cached_commander_id = cmd;
                    }
                }
            }
        }
    }

    pub fn start_match(&mut self, match_id: String, format_name: String) {
        let now = Utc::now();
        let default_life = if format_name.to_lowercase().contains("brawl") { 25 } else { 20 };

        self.current_player_life = default_life;
        self.current_opp_life = default_life;
        self.player_mulligans = 0;
        self.opponent_mulligans = 0;
        self.player_opening_hand.clear();
        self.opening_hand_finalized = false;
        self.player_cards_seen.clear();
        self.opp_cards_seen.clear();
        self.instance_map.clear();
        self.instance_zone_map.clear();
        self.instance_owner_map.clear();
        self.recorded_actions.clear();
        self.turn_events.clear();
        self.turn_event_seqs.clear();
        self.life_events.clear();
        self.damage_feed_events.clear();
        self.impactful_cards.clear();
        self.processed_msg_ids.clear();
        self.current_turn = 0;
        self.feed_seq = 0;
        self.player_seat_id = 1;
        self.collection_draws.clear();
        self.turn_1_active_seat = None;
        self.match_start_time = Some(now);

        // Resolve deck name from cached deck or catalog lookup by cached_deck_id
        let mut deck_name = self.cached_deck_name.clone().unwrap_or_default();
        let mut commander_id = self.cached_commander_id;

        if deck_name.is_empty() || deck_name == "Selected Deck" {
            if let Some(did) = &self.cached_deck_id {
                if let Some((name, cmd, _)) = self.known_decks.get(did) {
                    if !name.is_empty() {
                        deck_name = name.clone();
                        self.cached_deck_name = Some(name.clone());
                    }
                    if commander_id.is_none() && cmd.is_some() {
                        commander_id = *cmd;
                        self.cached_commander_id = *cmd;
                    }
                }
            }
        }

        if deck_name.is_empty() {
            deck_name = "Selected Deck".to_string();
        }

        self.match_legitimate = crate::deck_legitimacy::preset_deck_reason(&deck_name).is_none();

        self.active_match = Some(MatchRecord {
            match_id,
            timestamp: now,
            date_str: now.format("%Y-%m-%d %H:%M:%S").to_string(),
            format_name,
            result: "unknown".to_string(),
            duration_seconds: 0,
            turns: 0,
            going_first: true, // Will be resolved dynamically when turn 1 active seat is processed
            hero_seat_id: self.player_seat_id,
            player_deck_name: deck_name,
            player_commander_id: commander_id,
            player_commander_name: None,
            player_life_end: Some(default_life),
            player_mulligans: Some(0),
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
                            if let Some(t1_seat) = self.turn_1_active_seat {
                                m.going_first = t1_seat == system_seat;
                            }
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

    pub fn set_deck(&mut self, mut deck_name: String, deck_id: Option<String>, mut commander_id: Option<u32>, mut main_deck: Vec<u32>) {
        if deck_name.is_empty() {
            if let Some(did) = &deck_id {
                if let Some((name, cmd, main)) = self.known_decks.get(did) {
                    deck_name = name.clone();
                    if commander_id.is_none() {
                        commander_id = *cmd;
                    }
                    if main_deck.is_empty() {
                        main_deck = main.clone();
                    }
                }
            }
        }

        if !deck_name.is_empty() {
            self.cached_deck_name = Some(deck_name.clone());
            self.match_legitimate = crate::deck_legitimacy::preset_deck_reason(&deck_name).is_none();
        }
        if let Some(did) = &deck_id {
            self.cached_deck_id = Some(did.clone());
            if !deck_name.is_empty() {
                self.known_decks.insert(did.clone(), (deck_name.clone(), commander_id, main_deck.clone()));
            }
        }
        if commander_id.is_some() {
            self.cached_commander_id = commander_id;
        }
        if let Some(m) = &mut self.active_match {
            if !deck_name.is_empty() {
                m.player_deck_name = deck_name;
            }
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

    pub fn handle_mulligan_decision(&mut self, seat_id: u32, is_mulligan: bool, _num_cards: Option<u32>) {
        let is_player = seat_id == 0 || seat_id == self.player_seat_id;
        if is_mulligan {
            if is_player {
                self.player_mulligans += 1;
                if let Some(m) = &mut self.active_match {
                    m.player_mulligans = Some(self.player_mulligans);
                }
                let cards_to_mulligan: Vec<u32> = self.player_opening_hand.drain(..).map(|(_, gid)| gid).collect();
                for gid in cards_to_mulligan {
                    self.turn_events.push(MatchTurnEventRecord {
                        turn_number: 0,
                        seat_id: self.player_seat_id,
                        event_type: "mulligan".to_string(),
                        grp_id: gid,
                        timestamp: Utc::now().to_rfc3339(),
                    });
                    self.turn_event_seqs.push(self.feed_seq);
                    self.feed_seq += 1;
                }
            } else {
                self.opponent_mulligans += 1;
                if let Some(m) = &mut self.active_match {
                    m.opponent_mulligans = Some(self.opponent_mulligans);
                }
                self.turn_events.push(MatchTurnEventRecord {
                    turn_number: 0,
                    seat_id,
                    event_type: "mulligan".to_string(),
                    grp_id: 0,
                    timestamp: Utc::now().to_rfc3339(),
                });
                self.turn_event_seqs.push(self.feed_seq);
                self.feed_seq += 1;
            }
        } else {
            // Hand kept
            if is_player {
                self.finalize_opening_hand();
            }
        }
    }

    pub fn handle_deleted_instances(&mut self, deleted_ids: &[u32]) {
        if self.current_turn == 0 && !self.opening_hand_finalized && !self.player_opening_hand.is_empty() {
            let deleted_hand_count = self.player_opening_hand.iter().filter(|(i, _)| deleted_ids.contains(i)).count();
            if deleted_hand_count >= 5 {
                // Full opening hand was deleted -> Mulligan taken
                self.handle_mulligan_decision(self.player_seat_id, true, None);
            } else if deleted_hand_count > 0 {
                // Individual cards deleted before turn 1 -> London mulligan put on bottom of library
                for inst_id in deleted_ids {
                    if let Some(pos) = self.player_opening_hand.iter().position(|(i, _)| i == inst_id) {
                        let (_, gid) = self.player_opening_hand.remove(pos);
                        self.turn_events.push(MatchTurnEventRecord {
                            turn_number: 0,
                            seat_id: self.player_seat_id,
                            event_type: "bottom".to_string(),
                            grp_id: gid,
                            timestamp: Utc::now().to_rfc3339(),
                        });
                        self.turn_event_seqs.push(self.feed_seq);
                        self.feed_seq += 1;
                    }
                }
            }
        }
    }

    pub fn finalize_opening_hand(&mut self) {
        if self.opening_hand_finalized {
            return;
        }
        self.opening_hand_finalized = true;
        let kept_cards: Vec<u32> = self.player_opening_hand.drain(..).map(|(_, gid)| gid).collect();
        for gid in kept_cards {
            *self.player_cards_seen.entry(gid).or_insert(0) += 1;
            if self.match_legitimate {
                self.collection_draws.push(gid);
            }
            self.turn_events.push(MatchTurnEventRecord {
                turn_number: 0,
                seat_id: self.player_seat_id,
                event_type: "draw".to_string(),
                grp_id: gid,
                timestamp: Utc::now().to_rfc3339(),
            });
            self.turn_event_seqs.push(self.feed_seq);
            self.feed_seq += 1;
        }
    }

    pub fn process_game_object(&mut self, instance_id: u32, grp_id: Option<u32>, owner_seat: Option<u32>, zone_id: u32) -> Option<(u32, u32, String)> {
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
        //   Graveyard = 33, Exile = 29, Command = 26, Sideboard = 34, Limbo = 30.
        const HAND_ZONES: [u32; 2] = [31, 35];
        const NON_DRAW_SOURCE_ZONES: [u32; 4] = [27, 28, 29, 33]; // Stack, Battlefield, Exile, Graveyard

        let is_hand = HAND_ZONES.contains(&zone_id);

        // Pre-game opening hand buffering (Turn 0)
        if self.current_turn == 0 {
            if is_hand && seat_id == self.player_seat_id {
                if !self.opening_hand_finalized {
                    if !self.player_opening_hand.iter().any(|(i, _)| *i == instance_id) {
                        self.player_opening_hand.push((instance_id, resolved_grp_id));
                    }
                    return None;
                }
            }
        } else if !self.opening_hand_finalized {
            self.finalize_opening_hand();
        }

        let from_non_draw = previous_zone.map(|p| NON_DRAW_SOURCE_ZONES.contains(&p)).unwrap_or(false);
        let is_play_zone = zone_id == 27 || zone_id == 28;

        let mut event_type = None;
        if is_hand && (previous_zone != Some(zone_id) || learning_grp_now) {
            if !from_non_draw {
                event_type = Some("draw".to_string());
            }
        } else if zone_id == 28 && previous_zone.is_none() && !learning_grp_now {
            // New object appearing directly on the battlefield without having passed through hand or stack
            event_type = Some("token".to_string());
        } else if is_play_zone && previous_zone != Some(zone_id) {
            event_type = Some("play".to_string());
        } else if previous_zone == Some(28) && zone_id == 33 {
            // Battlefield -> Graveyard = Dies / Destroyed / Sacrificed
            event_type = Some("dies".to_string());
        } else if previous_zone == Some(28) && zone_id == 29 {
            // Battlefield -> Exile = Exiled
            event_type = Some("exile".to_string());
        }

        if let Some(etype) = event_type {
            let key = (self.current_turn, instance_id, etype.clone());
            if !self.recorded_actions.contains(&key) {
                self.recorded_actions.insert(key);

                let is_opponent = seat_id != self.player_seat_id;
                let target_map = if is_opponent { &mut self.opp_cards_seen } else { &mut self.player_cards_seen };
                *target_map.entry(resolved_grp_id).or_insert(0) += 1;

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

    /// Record damage/life-loss attributed to a card instance (from DamageDealt annotations).
    /// Aggregates total impact, biggest single swing, and face vs permanent splits.
    pub fn process_damage_event(
        &mut self,
        instance_id: u32,
        target_instance_id: u32,
        amount: i32,
        damage_type: u32, // 1 = combat, 2 = non-combat/spell
    ) {
        let grp_id = self.instance_map.get(&instance_id).copied().unwrap_or(0);
        if grp_id == 0 {
            return;
        }
        let seat_id = self.instance_owner_map.get(&instance_id).copied().unwrap_or(0);
        let magnitude = amount.abs();

        let is_to_player = target_instance_id == 1 || target_instance_id == 2;
        let is_combat = damage_type == 1;

        let entry = self.impactful_cards.entry(grp_id).or_default();
        if entry.seat_id == 0 {
            entry.seat_id = seat_id;
        }
        entry.total_damage += magnitude;
        if magnitude > entry.max_hit {
            entry.max_hit = magnitude;
        }
        if is_to_player {
            entry.damage_to_player += magnitude;
        } else {
            entry.damage_to_permanents += magnitude;
        }
        if is_combat {
            entry.damage_combat += magnitude;
        } else {
            entry.damage_spell += magnitude;
        }

        // Award Heavy Hitter achievement titles
        if magnitude >= 15 {
            if !entry.titles.contains(&"Juggernaut".to_string()) {
                entry.titles.push("Juggernaut".to_string());
            }
        } else if magnitude >= 8 {
            if !entry.titles.contains(&"Haymaker".to_string()) {
                entry.titles.push("Haymaker".to_string());
            }
        }

        // Track hero damage hits against opponent for lethal Executioner/Over-Killer
        let opp_seat = if self.player_seat_id == 1 { 2 } else { 1 };
        if seat_id == self.player_seat_id && target_instance_id == opp_seat {
            self.last_hero_damage_hit = Some((grp_id, magnitude, self.current_opp_life));
        }

        // Also record to live damage feed for the HUD
        self.damage_feed_events.push((
            LiveDamageFeedEvent {
                source_instance_id: instance_id,
                target_instance_id,
                amount: magnitude,
                damage_type,
            },
            self.feed_seq,
        ));

        // Stash into turn_events so the match play timeline also reflects combat & spell damage
        let dmg_event_type = if is_combat {
            format!("damage:combat:{}:{}", magnitude, target_instance_id)
        } else {
            format!("damage:spell:{}:{}", magnitude, target_instance_id)
        };
        self.turn_events.push(MatchTurnEventRecord {
            turn_number: self.current_turn,
            seat_id,
            event_type: dmg_event_type,
            grp_id,
            timestamp: Utc::now().to_rfc3339(),
        });
        self.turn_event_seqs.push(self.feed_seq);
        self.feed_seq += 1;
    }

    pub fn update_game_state(&mut self, msg_id: Option<u64>, turn: u32, life_by_seat: &[(u32, i32)], active_seat: u32) {
        if let Some(mid) = msg_id {
            if self.processed_msg_ids.contains(&mid) {
                return;
            }
            self.processed_msg_ids.insert(mid);
        }

        if turn > 0 {
            self.finalize_opening_hand();
            self.current_turn = turn;
        }

        if (turn == 1 || self.current_turn == 1) && active_seat > 0 && self.turn_1_active_seat.is_none() {
            self.turn_1_active_seat = Some(active_seat);
            if let Some(m) = &mut self.active_match {
                m.going_first = active_seat == self.player_seat_id;
            }
        }

        for (seat, life) in life_by_seat {
            if *seat == self.player_seat_id {
                let old = self.current_player_life;
                if old != *life {
                    self.life_events.push((self.current_turn, old, *life, *seat, self.feed_seq));
                    self.feed_seq += 1;
                }
                self.current_player_life = *life;
            } else if *seat > 0 {
                let old = self.current_opp_life;
                if old != *life {
                    self.life_events.push((self.current_turn, old, *life, *seat, self.feed_seq));
                    self.feed_seq += 1;
                }
                self.current_opp_life = *life;
            }
        }
    }

    pub fn complete_match(&mut self, winning_team_id: u32, reason: &str) -> Option<(MatchRecord, Vec<MatchCardRecord>, Vec<MatchTurnEventRecord>, Vec<MatchImpactfulRecord>)> {
        self.finalize_opening_hand();

        if let Some(mut m) = self.active_match.take() {
            let is_win = winning_team_id == self.player_seat_id;
            m.result = if is_win { "win".to_string() } else { "loss".to_string() };
            m.turns = self.current_turn;
            m.player_life_end = Some(self.current_player_life);
            m.opponent_life_end = Some(self.current_opp_life);
            m.player_commander_id = self.cached_commander_id;
            m.player_mulligans = Some(self.player_mulligans);
            m.opponent_mulligans = Some(self.opponent_mulligans);

            // Resolve going_first accurately from turn 1 active seat or turn 1 events
            if let Some(t1_seat) = self.turn_1_active_seat {
                m.going_first = t1_seat == self.player_seat_id;
            } else if let Some(first_t1) = self.turn_events.iter().find(|e| e.turn_number == 1 && e.seat_id > 0) {
                m.going_first = first_t1.seat_id == self.player_seat_id;
            } else {
                m.going_first = self.player_seat_id == 1;
            }

            // Calculate match duration in seconds (use turn event timestamps if available to cover mid-match restarts)
            let mut event_span = 0u32;
            if let (Some(first), Some(last)) = (self.turn_events.first(), self.turn_events.last()) {
                if let (Ok(t_start), Ok(t_end)) = (
                    chrono::DateTime::parse_from_rfc3339(&first.timestamp),
                    chrono::DateTime::parse_from_rfc3339(&last.timestamp),
                ) {
                    let diff = (t_end - t_start).num_seconds();
                    if diff > 0 {
                        event_span = diff as u32;
                    }
                }
            }

            let now = Utc::now();
            let wall_elapsed = self.match_start_time.map(|st| (now - st).num_seconds().max(0) as u32).unwrap_or(0);
            m.duration_seconds = event_span.max(wall_elapsed);

            let reason_clean = if reason.is_empty() { None } else { Some(reason.to_string()) };
            m.result_reason = reason_clean.clone();

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

            // Evaluate Closer achievements
            if is_win {
                if self.current_opp_life <= 0 {
                    if let Some((grp, amt, life_before)) = self.last_hero_damage_hit {
                        let entry = self.impactful_cards.entry(grp).or_default();
                        if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                        if !entry.titles.contains(&"Executioner".to_string()) {
                            entry.titles.push("Executioner".to_string());
                        }
                        if amt - life_before >= 8 {
                            if !entry.titles.contains(&"Over-Killer".to_string()) {
                                entry.titles.push("Over-Killer".to_string());
                            }
                        }
                    }
                } else if reason.to_lowercase().contains("concede") {
                    // Scoop Inducer: last resolved card played by hero in final turns
                    if let Some(last_play) = self.turn_events.iter().rev().find(|e| e.seat_id == self.player_seat_id && e.event_type == "play" && e.turn_number >= self.current_turn.saturating_sub(1)) {
                        let entry = self.impactful_cards.entry(last_play.grp_id).or_default();
                        if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                        if !entry.titles.contains(&"Scoop Inducer".to_string()) {
                            entry.titles.push("Scoop Inducer".to_string());
                        }
                    }
                }
            }

            let turn_events = std::mem::take(&mut self.turn_events);

            let impactful_records: Vec<MatchImpactfulRecord> = self.impactful_cards.iter()
                .filter(|(_, stats)| stats.total_damage > 0 || !stats.titles.is_empty())
                .map(|(grp_id, stats)| MatchImpactfulRecord {
                    grp_id: *grp_id,
                    seat_id: stats.seat_id,
                    total_damage: stats.total_damage,
                    max_hit: stats.max_hit,
                    damage_to_player: stats.damage_to_player,
                    damage_to_permanents: stats.damage_to_permanents,
                    damage_combat: stats.damage_combat,
                    damage_spell: stats.damage_spell,
                    titles: stats.titles.clone(),
                })
                .collect();

            // Attempt in-memory deck resolution if player_deck_name is still "Selected Deck" or empty
            if m.player_deck_name.is_empty() || m.player_deck_name == "Selected Deck" {
                if let Some(resolved) = self.resolve_deck_from_match(&card_records, m.player_commander_id) {
                    m.player_deck_name = resolved.clone();
                    self.cached_deck_name = Some(resolved.clone());
                    self.match_legitimate = crate::deck_legitimacy::preset_deck_reason(&resolved).is_none();
                }
            }

            if self.is_live {
                self.last_completed = Some((m.clone(), Utc::now()));
            }
            return Some((m, card_records, turn_events, impactful_records));
        }
        None
    }

    pub fn resolve_deck_from_match(&self, hero_cards: &[MatchCardRecord], commander_id: Option<u32>) -> Option<String> {
        let hero_card_set: HashSet<u32> = hero_cards.iter().filter(|c| !c.is_opponent).map(|c| c.grp_id).collect();
        if hero_card_set.is_empty() {
            return None;
        }

        // 1. Match by commander if available
        if let Some(cmd) = commander_id {
            for (_, (name, c_cmd, _)) in &self.known_decks {
                if *c_cmd == Some(cmd) && !name.is_empty() {
                    return Some(name.clone());
                }
            }
        }

        // 2. Match by card overlap against known decks
        let mut best_name = None;
        let mut best_score = 0;

        for (_, (name, _, main)) in &self.known_decks {
            if main.is_empty() || name.is_empty() {
                continue;
            }
            let main_set: HashSet<u32> = main.iter().copied().collect();
            let overlap = hero_card_set.intersection(&main_set).count();
            if overlap > best_score && overlap >= 3 {
                best_score = overlap;
                best_name = Some(name.clone());
            }
        }

        best_name
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

    #[test]
    fn test_deck_catalog_lookup_on_start_match() {
        let mut assembler = MatchAssembler::new();

        // 1. Ingest catalog from StartHook / Courses
        assembler.register_deck_catalog(vec![
            ("deck-uuid-1".to_string(), "MonoWhite - Auras (Standard)".to_string(), None, vec![86715, 97964, 92090]),
        ]);

        // 2. Simulate match queued with only cached_deck_id (e.g. headless deck submission)
        assembler.cached_deck_id = Some("deck-uuid-1".to_string());
        assembler.start_match("match-123".to_string(), "Bot Match".to_string());

        let active = assembler.active_match.as_ref().expect("Active match should exist");
        assert_eq!(active.player_deck_name, "MonoWhite - Auras (Standard)");
        assert!(assembler.match_legitimate);
    }

    #[test]
    fn test_resolve_deck_from_match_fingerprint() {
        let mut assembler = MatchAssembler::new();

        assembler.register_deck_catalog(vec![
            ("deck-auras".to_string(), "MonoWhite - Auras (Standard)".to_string(), None, vec![86715, 97964, 92090, 92081, 96608]),
            ("deck-mono-red".to_string(), "MonoRed Burn".to_string(), None, vec![101, 102, 103, 104, 105]),
        ]);

        let hero_cards = vec![
            MatchCardRecord { grp_id: 86715, is_opponent: false, count: 4 },
            MatchCardRecord { grp_id: 97964, is_opponent: false, count: 2 },
            MatchCardRecord { grp_id: 92090, is_opponent: false, count: 2 },
            MatchCardRecord { grp_id: 92081, is_opponent: false, count: 2 },
        ];

        let resolved = assembler.resolve_deck_from_match(&hero_cards, None);
        assert_eq!(resolved, Some("MonoWhite - Auras (Standard)".to_string()));
    }

    #[test]
    fn test_going_first_play_vs_draw() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("user-hero".to_string());
        assembler.start_match("match-play".to_string(), "Standard".to_string());

        // Hero is seat 1, opponent is seat 2
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "user-hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "user-opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Turn 1 active player is seat 1 -> On the play!
        assembler.update_game_state(Some(100), 1, &[(1, 20), (2, 20)], 1);

        let (rec, _, _, _) = assembler.complete_match(1, "Concede").expect("match should complete");
        assert!(rec.going_first, "Hero should be on the play when active player on turn 1 is hero seat");

        // Now test On the draw
        let mut assembler_draw = MatchAssembler::new();
        assembler_draw.set_player_user_id("user-hero".to_string());
        assembler_draw.start_match("match-draw".to_string(), "Standard".to_string());

        assembler_draw.update_reserved_players(&serde_json::json!([
            { "userId": "user-hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "user-opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Turn 1 active player is seat 2 (opponent) -> On the draw!
        assembler_draw.update_game_state(Some(200), 1, &[(1, 20), (2, 20)], 2);

        let (rec_draw, _, _, _) = assembler_draw.complete_match(2, "Concede").expect("match should complete");
        assert!(!rec_draw.going_first, "Hero should be on the draw when active player on turn 1 is opponent seat");
    }

    #[test]
    fn test_match_duration_calculation() {
        let mut assembler = MatchAssembler::new();
        assembler.start_match("match-dur".to_string(), "Standard".to_string());

        // Manually adjust start time back by 120 seconds to simulate a 2-minute game
        assembler.match_start_time = Some(Utc::now() - chrono::Duration::seconds(120));

        let (rec, _, _, _) = assembler.complete_match(1, "Concede").expect("match should complete");
        assert!(rec.duration_seconds >= 120, "Duration should be at least 120 seconds, got {}", rec.duration_seconds);
    }

    #[test]
    fn test_opening_hand_no_mulligans() {
        let mut assembler = MatchAssembler::new();
        assembler.start_match("match-no-mul".to_string(), "Standard".to_string());

        // 7 opening hand cards arrive at turn 0
        for i in 1..=7 {
            assembler.process_game_object(i, Some(100 + i), Some(1), 31); // Hand zone
        }

        // Turn 1 starts, active player seat 1
        assembler.update_game_state(Some(10), 1, &[(1, 20), (2, 20)], 1);

        // Turn 1 play: player casts card 1
        assembler.process_game_object(1, Some(101), Some(1), 28); // Battlefield

        let (rec, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match should complete");
        assert_eq!(rec.player_mulligans, Some(0));
        assert_eq!(rec.opponent_mulligans, Some(0));

        // Exactly 7 draw events at turn 0, 1 play event at turn 1
        let turn_0_draws: Vec<_> = turn_events.iter().filter(|e| e.turn_number == 0 && e.event_type == "draw").collect();
        let turn_1_events: Vec<_> = turn_events.iter().filter(|e| e.turn_number == 1).collect();
        assert_eq!(turn_0_draws.len(), 7);
        assert_eq!(turn_1_events.len(), 1);
        assert_eq!(turn_1_events[0].event_type, "play");
    }

    #[test]
    fn test_hero_and_opponent_mulligan_cycle() {
        let mut assembler = MatchAssembler::new();
        assembler.start_match("match-mul".to_string(), "Standard".to_string());

        // 1. Initial 7 cards dealt to Hero (inst 1..=7)
        for i in 1..=7 {
            assembler.process_game_object(i, Some(100 + i), Some(1), 31);
        }

        // 2. Opponent takes a mulligan (Prompt 36 for seat 2)
        assembler.handle_mulligan_decision(2, true, Some(6));

        // 3. Hero takes a mulligan (Prompt 36 for seat 1)
        assembler.handle_mulligan_decision(1, true, Some(6));

        // 4. Hero gets 7 new cards (inst 11..=17)
        for i in 11..=17 {
            assembler.process_game_object(i, Some(200 + i), Some(1), 31);
        }

        // 5. London mulligan bottoming: 1 card (inst 17) bottomed
        assembler.handle_deleted_instances(&[17]);

        // 6. Hero keeps hand (Prompt 37 for seat 1)
        assembler.handle_mulligan_decision(1, false, None);

        // Turn 1 begins
        assembler.update_game_state(Some(20), 1, &[(1, 20), (2, 20)], 1);

        let (rec, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match should complete");
        assert_eq!(rec.player_mulligans, Some(1));
        assert_eq!(rec.opponent_mulligans, Some(1));

        // Check turn 0 event breakdown:
        // - 1 opponent mulligan event
        // - 7 hero mulligan events
        // - 1 hero bottom event
        // - 6 hero draw events (the kept cards)
        let opp_mulligans: Vec<_> = turn_events.iter().filter(|e| e.turn_number == 0 && e.seat_id == 2 && e.event_type == "mulligan").collect();
        let hero_mulligans: Vec<_> = turn_events.iter().filter(|e| e.turn_number == 0 && e.seat_id == 1 && e.event_type == "mulligan").collect();
        let hero_bottoms: Vec<_> = turn_events.iter().filter(|e| e.turn_number == 0 && e.seat_id == 1 && e.event_type == "bottom").collect();
        let hero_draws: Vec<_> = turn_events.iter().filter(|e| e.turn_number == 0 && e.seat_id == 1 && e.event_type == "draw").collect();

        assert_eq!(opp_mulligans.len(), 1);
        assert_eq!(hero_mulligans.len(), 7);
        assert_eq!(hero_bottoms.len(), 1);
        assert_eq!(hero_draws.len(), 6);
    }

    #[test]
    fn test_achievement_titles_heavy_hitters_and_closers() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-achieve".to_string(), "Standard".to_string());
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 1);

        // Instance 1 = Grp 101 (deals 8 dmg -> Haymaker)
        // Instance 2 = Grp 102 (deals 16 dmg -> Juggernaut + Executioner + Over-Killer)
        assembler.process_game_object(1, Some(101), Some(1), 28);
        assembler.process_game_object(2, Some(102), Some(1), 28);

        // Hit 1: 8 damage to opponent (Opp life 20 -> 12)
        assembler.process_damage_event(1, 2, 8, 1);
        assembler.update_game_state(Some(2), 1, &[(1, 20), (2, 12)], 1);

        // Hit 2: 16 damage to opponent (Opp life 12 -> -4, killing blow with 4 overkill)
        assembler.process_damage_event(2, 2, 16, 1);
        assembler.update_game_state(Some(3), 1, &[(1, 20), (2, -4)], 1);

        let (_, _, _, impactful) = assembler.complete_match(1, "Loss_Life").expect("match should complete");

        let imp_101 = impactful.iter().find(|i| i.grp_id == 101).expect("grp 101 should exist");
        let imp_102 = impactful.iter().find(|i| i.grp_id == 102).expect("grp 102 should exist");

        assert!(imp_101.titles.contains(&"Haymaker".to_string()), "Card 101 should have Haymaker title");
        assert!(!imp_101.titles.contains(&"Juggernaut".to_string()), "Card 101 should not have Juggernaut title");

        assert!(imp_102.titles.contains(&"Juggernaut".to_string()), "Card 102 should have Juggernaut title");
        assert!(imp_102.titles.contains(&"Executioner".to_string()), "Card 102 should have Executioner title");
    }

    #[test]
    fn test_achievement_title_scoop_inducer() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-scoop".to_string(), "Standard".to_string());
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 4, &[(1, 20), (2, 20)], 1);

        // Hero casts a big bomb (Instance 10 -> Grp 999)
        assembler.process_game_object(10, Some(999), Some(1), 28);

        // Opponent immediately concedes
        let (_, _, _, impactful) = assembler.complete_match(1, "ResultReason_Concede").expect("match should complete");

        let imp_999 = impactful.iter().find(|i| i.grp_id == 999).expect("grp 999 should be in impactful cards");
        assert!(imp_999.titles.contains(&"Scoop Inducer".to_string()), "Card 999 should have Scoop Inducer title");
    }
}
