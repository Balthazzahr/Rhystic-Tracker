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
    pub damage_to_player: i32,
    pub damage_to_permanents: i32,
    pub damage_combat: i32,
    pub damage_spell: i32,
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
    pub impactful_cards: HashMap<u32, CardDamageStats>, // grp_id -> CardDamageStats
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
            known_decks: HashMap::new(),
            match_legitimate: true,
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
            damage_feed_events: Vec::new(),
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
        self.current_turn = 1;
        self.feed_seq = 0;
        self.player_seat_id = 1;
        self.collection_draws.clear();

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
        //   Graveyard = 33, Exile = 29, Command = 26, Sideboard = 34, Limbo = 30.
        const HAND_ZONES: [u32; 2] = [31, 35];
        const NON_DRAW_SOURCE_ZONES: [u32; 4] = [27, 28, 29, 33]; // Stack, Battlefield, Exile, Graveyard

        // Determine event type from zone transition.
        // "draw" is a card entering hand from the player's own library (natural draws, tutors, searches)
        // or a card already in hand that we're first learning about (opening hand).
        // Cards entering hand from graveyard/exile/battlefield/stack are bounces/returns, NOT draws.
        let is_hand = HAND_ZONES.contains(&zone_id);
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
            self.current_turn = turn;
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
        if let Some(mut m) = self.active_match.take() {
            let is_win = winning_team_id == self.player_seat_id;
            m.result = if is_win { "win".to_string() } else { "loss".to_string() };
            m.turns = self.current_turn;
            m.player_life_end = Some(self.current_player_life);
            m.opponent_life_end = Some(self.current_opp_life);
            m.player_commander_id = self.cached_commander_id;

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
                .map(|(grp_id, stats)| MatchImpactfulRecord {
                    grp_id: *grp_id,
                    seat_id: stats.seat_id,
                    total_damage: stats.total_damage,
                    max_hit: stats.max_hit,
                    damage_to_player: stats.damage_to_player,
                    damage_to_permanents: stats.damage_to_permanents,
                    damage_combat: stats.damage_combat,
                    damage_spell: stats.damage_spell,
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

            self.last_completed = Some((m.clone(), Utc::now()));
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
}
