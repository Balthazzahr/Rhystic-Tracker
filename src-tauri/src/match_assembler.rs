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
    pub hero_platform: Option<String>,
    pub hero_avatar: Option<String>,
    pub opponent_name: Option<String>,
    pub opponent_commander_id: Option<u32>,
    pub opponent_commander_name: Option<String>,
    pub opponent_mulligans: Option<u32>,
    pub opponent_life_end: Option<i32>,
    pub opponent_platform: Option<String>,
    pub opponent_avatar: Option<String>,
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
    pub instance_id: Option<u32>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchImpactfulRecord {
    pub grp_id: u32,
    pub seat_id: u32,
    pub total_damage: i32,
    pub max_hit: i32,
    pub max_hit_combat: i32,
    pub max_hit_spell: i32,
    pub damage_to_player: i32,
    pub damage_to_permanents: i32,
    pub damage_combat: i32,
    pub damage_spell: i32,
    pub titles: Vec<String>,
    pub cards_drawn: i64,
    pub counters_added: i64,
}

#[derive(Debug, Clone, Default)]
pub struct CardDamageStats {
    pub seat_id: u32,
    pub total_damage: i32,
    pub max_hit: i32,
    pub max_hit_combat: i32,
    pub max_hit_spell: i32,
    pub damage_to_player: i32,
    pub damage_to_permanents: i32,
    pub damage_combat: i32,
    pub damage_spell: i32,
    pub titles: Vec<String>,
    pub cards_drawn: i64,
    pub counters_added: i64,
    pub life_drained: i64,
    pub creatures_eliminated: u32,
    pub cards_stolen: u32,
    pub permanents_stolen: u32,
    pub times_flickered: u32,
    pub times_reanimated: u32,
    pub tokens_spawned: u32,
    pub max_turn_mana: u32,
    pub damage_absorbed_on_block: i32,
    pub taxes_paid_by_opp: u32,
    pub max_opp_wiped: usize,
    pub max_total_wiped: usize,
    pub toughness_boosted: i32,
}

pub fn add_tiered_title(titles: &mut Vec<String>, base_title: &str, tier: &str) {
    if tier.is_empty() {
        return;
    }
    let title = format!("{} ({})", base_title, tier);
    let rank = match tier.to_lowercase().as_str() {
        "gold" => 3,
        "silver" => 2,
        _ => 1,
    };
    let already_has_higher_or_equal = titles.iter().any(|t| {
        if !t.starts_with(base_title) {
            return false;
        }
        let current_rank = if t.contains("Gold") || t.contains("gold") {
            3
        } else if t.contains("Silver") || t.contains("silver") {
            2
        } else {
            1
        };
        current_rank >= rank
    });
    if !already_has_higher_or_equal {
        titles.retain(|t| !t.starts_with(base_title));
        titles.push(title);
    }
}

#[derive(Debug, Clone)]
pub struct LiveDamageFeedEvent {
    pub source_instance_id: u32,
    pub target_instance_id: u32,
    pub amount: i32,
    pub damage_type: u32, // 1 = combat, 2 = non-combat/spell
    pub turn_number: u32,
}

/// Placeholder deck name for assigned-deck events (Welcome Deck Duels, Jump In)
/// where Arena never emits a deck submission. Deliberately NOT "Selected Deck":
/// the post-match fingerprint resolvers key on that exact string and would
/// re-misattribute the match to a real deck with >= 3 card overlap.
pub const PRESET_EVENT_DECK_NAME: &str = "Preset / Event Deck";

pub struct MatchAssembler {
    pub active_match: Option<MatchRecord>,
    pub player_seat_id: u32,
    pub player_user_id: Option<String>,
    pub player_screen_name: Option<String>,
    pub cached_deck_name: Option<String>,
    pub cached_deck_id: Option<String>,
    pub cached_commander_id: Option<u32>,
    pub known_decks: HashMap<String, (String, Option<u32>, Vec<u32>)>,
    /// True when the current (or cached) deck is a legitimate user deck, not a
    /// preset. Only legitimate matches feed the draw-based collection.
    pub match_legitimate: bool,
    /// True when the active (or just completed) match belongs to an
    /// assigned-deck event (see `is_assigned_deck_event` in the parser). Read
    /// by the match-decks audit so it records the event preset instead of the
    /// stale cached deck.
    pub last_assigned_deck_event: bool,
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
    pub instance_previous_zone_map: HashMap<u32, u32>, // instanceId -> previous zoneId
    pub instance_owner_map: HashMap<u32, u32>, // instanceId -> ownerSeatId
    pub instance_controller_map: HashMap<u32, u32>, // instanceId -> controllerSeatId
    pub instance_flicker_pending: HashSet<u32>, // instanceIds that went 28 -> 29
    pub ability_parent_map: HashMap<u32, u32>, // abilityInstanceId -> parentInstanceId
    pub token_instance_names: HashMap<u32, String>, // instanceId -> token name
    pub token_instance_ids: HashSet<u32>,
    pub token_grp_ids: HashSet<u32>,
    pub recorded_actions: HashSet<(u32, u32, String)>, // (turn_number, instance_id, event_type)
    pub turn_events: Vec<MatchTurnEventRecord>,
    pub turn_event_seqs: Vec<u64>,
    pub life_events: Vec<(u32, i32, i32, u32, Option<u32>, u64)>, // (turn, old_life, new_life, seat_id, source_grp_id, seq)
    pub damage_feed_events: Vec<(LiveDamageFeedEvent, u64)>, // (damage_event, seq)
    pub seen_damage_annotation_ids: HashSet<u32>,
    pub active_life_sources: HashMap<u32, u32>, // target_seat -> source_instance_id
    pub turn_damage_taken_by_instance: HashMap<u32, i32>, // instanceId -> combat damage taken this turn
    pub turn_damage_to_seat: HashMap<u32, i32>, // seat_id -> damage taken this turn
    pub turn_mana_by_instance: HashMap<u32, u32>, // permanent_instance_id -> mana generated this turn
    pub token_spawner_map: HashMap<u32, u32>, // token_instance_id -> spawner_grp_id
    pub pending_counter_events: Vec<(u32, u32)>, // (affector_grp_id, target_grp_id)
    pub card_cmc_map: HashMap<u32, u32>, // grp_id -> cmc
    pub feed_seq: u64,
    pub current_turn: u32,
    pub turn_1_active_seat: Option<u32>,
    pub match_start_time: Option<chrono::DateTime<Utc>>,
    pub impactful_cards: HashMap<u32, CardDamageStats>, // grp_id -> CardDamageStats
    pub last_hero_damage_hit: Option<(u32, i32, i32)>, // (grp_id, amount, opp_life_before)
    pub current_turn_hero_hits: Vec<(u32, i32, i32)>, // (grp_id, magnitude, opp_life_before) dealt to opponent in current turn
    pub opp_life_before_combat: i32,
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
            player_screen_name: None,
            cached_deck_name: None,
            cached_deck_id: None,
            cached_commander_id: None,
            known_decks: HashMap::new(),
            match_legitimate: true,
            last_assigned_deck_event: false,
            collection_draws: Vec::new(),
            current_player_life: 20,
            current_opp_life: 20,
            opp_life_before_combat: 20,
            current_turn_hero_hits: Vec::new(),
            player_mulligans: 0,
            opponent_mulligans: 0,
            player_opening_hand: Vec::new(),
            opening_hand_finalized: false,
            player_cards_seen: HashMap::new(),
            opp_cards_seen: HashMap::new(),
            instance_map: HashMap::new(),
            instance_zone_map: HashMap::new(),
            instance_previous_zone_map: HashMap::new(),
            instance_owner_map: HashMap::new(),
            instance_controller_map: HashMap::new(),
            instance_flicker_pending: HashSet::new(),
            ability_parent_map: HashMap::new(),
            token_instance_names: HashMap::new(),
            token_instance_ids: HashSet::new(),
            token_grp_ids: HashSet::new(),
            recorded_actions: HashSet::new(),
            turn_events: Vec::new(),
            turn_event_seqs: Vec::new(),
            life_events: Vec::new(),
            damage_feed_events: Vec::new(),
            seen_damage_annotation_ids: HashSet::new(),
            active_life_sources: HashMap::new(),
            turn_damage_taken_by_instance: HashMap::new(),
            turn_damage_to_seat: HashMap::new(),
            turn_mana_by_instance: HashMap::new(),
            token_spawner_map: HashMap::new(),
            pending_counter_events: Vec::new(),
            card_cmc_map: HashMap::new(),
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

    pub fn set_player_info(&mut self, user_id: String, screen_name: String) {
        self.player_user_id = Some(user_id);
        self.player_screen_name = Some(screen_name);
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

    pub fn start_match(&mut self, match_id: String, format_name: String, assigned_deck_event: bool) {
        let now = Utc::now();
        let is_brawl = format_name.to_lowercase().contains("brawl") || format_name.to_lowercase().contains("commander");
        if !is_brawl {
            self.cached_commander_id = None;
        }
        self.last_assigned_deck_event = assigned_deck_event;

        let default_life = if is_brawl { 25 } else { 20 };

        self.current_player_life = default_life;
        self.current_opp_life = default_life;
        self.opp_life_before_combat = default_life;
        self.current_turn_hero_hits.clear();
        self.player_mulligans = 0;
        self.opponent_mulligans = 0;
        self.player_opening_hand.clear();
        self.opening_hand_finalized = false;
        self.player_cards_seen.clear();
        self.opp_cards_seen.clear();
        self.instance_map.clear();
        self.instance_zone_map.clear();
        self.instance_owner_map.clear();
        self.ability_parent_map.clear();
        self.token_instance_names.clear();
        self.recorded_actions.clear();
        self.turn_events.clear();
        self.turn_event_seqs.clear();
        self.life_events.clear();
        self.damage_feed_events.clear();
        self.seen_damage_annotation_ids.clear();
        self.active_life_sources.clear();
        self.impactful_cards.clear();
        self.pending_counter_events.clear();
        self.processed_msg_ids.clear();
        self.token_instance_ids.clear();
        self.token_grp_ids.clear();
        self.token_spawner_map.clear();
        self.turn_mana_by_instance.clear();
        self.turn_damage_to_seat.clear();
        self.current_turn = 0;
        self.feed_seq = 0;
        self.player_seat_id = 1;
        self.collection_draws.clear();
        self.turn_1_active_seat = None;
        self.match_start_time = Some(now);

        // Resolve deck name from cached deck or catalog lookup by cached_deck_id.
        //
        // Assigned-deck events (Welcome Deck Duels, Jump In) pick a packet/precon
        // deck in the event UI and NEVER emit EventSetDeck/deckSubmit, so the
        // cache would still hold the previous queue's deck ("stale deck name"
        // bug). Bypass the cache AND the catalog lookup for this match — the
        // cache itself is left intact because the next deck-submitting queue
        // overwrites it anyway.
        let mut deck_name = if assigned_deck_event {
            String::new()
        } else {
            self.cached_deck_name.clone().unwrap_or_default()
        };
        let mut commander_id = if is_brawl { self.cached_commander_id } else { None };

        if !assigned_deck_event && (deck_name.is_empty() || deck_name == "Selected Deck") {
            if let Some(did) = &self.cached_deck_id {
                if let Some((name, cmd, _)) = self.known_decks.get(did) {
                    if !name.is_empty() {
                        deck_name = name.clone();
                        self.cached_deck_name = Some(name.clone());
                    }
                    if is_brawl && commander_id.is_none() && cmd.is_some() {
                        commander_id = *cmd;
                        self.cached_commander_id = *cmd;
                    }
                }
            }
        }

        if deck_name.is_empty() {
            deck_name = if assigned_deck_event {
                PRESET_EVENT_DECK_NAME.to_string()
            } else {
                "Selected Deck".to_string()
            };
        }

        // Assigned-deck decks are lent by the event, not owned: their draws must
        // never feed the collection, regardless of what the deck name looks like.
        self.match_legitimate = !assigned_deck_event
            && crate::deck_legitimacy::preset_deck_reason(&deck_name).is_none();

        self.active_match = Some(MatchRecord {
            match_id,
            timestamp: now,
            date_str: now.format("%Y-%m-%d %H:%M:%S").to_string(),
            format_name,
            player_deck_name: deck_name,
            player_commander_id: commander_id,
            player_commander_name: None,
            opponent_name: None,
            opponent_commander_id: None,
            opponent_commander_name: None,
            result: "in_progress".to_string(),
            turns: 0,
            player_life_end: None,
            opponent_life_end: None,
            going_first: false,
            player_mulligans: None,
            hero_platform: None,
            hero_avatar: None,
            opponent_mulligans: None,
            opponent_platform: None,
            opponent_avatar: None,
            duration_seconds: 0,
            result_reason: None,
            hero_seat_id: self.player_seat_id,
        });
    }

    pub fn update_reserved_players(&mut self, players: &serde_json::Value) {
        let extract_platform = |p: &serde_json::Value| -> Option<String> {
            p.get("platformId")
                .or_else(|| p.get("platform"))
                .or_else(|| p.get("clientPlatform"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        };

        let extract_avatar = |p: &serde_json::Value| -> Option<String> {
            p.get("courseId")
                .or_else(|| p.get("avatarSelection"))
                .or_else(|| p.get("avatarId"))
                .or_else(|| p.get("avatar"))
                .or_else(|| p.get("characterId"))
                .or_else(|| p.get("courseDeckSummary").and_then(|c| c.get("avatarSelection").or_else(|| c.get("avatarId"))))
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
        };

        if let Some(arr) = players.as_array() {
            // First pass: identify hero seat ID by matching userId or screen_name
            for p in arr {
                let uid = p.get("userId").and_then(|v| v.as_str()).unwrap_or("");
                let pname = p.get("playerName").and_then(|v| v.as_str()).unwrap_or("");
                let system_seat = p.get("systemSeatId").or_else(|| p.get("seatId")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;

                let is_hero = if let Some(my_uid) = &self.player_user_id {
                    uid == my_uid || (uid.is_empty() && system_seat == 1)
                } else if let Some(my_name) = &self.player_screen_name {
                    pname == my_name
                } else {
                    false
                };

                if is_hero && system_seat > 0 {
                    self.player_seat_id = system_seat;
                    if let Some(m) = &mut self.active_match {
                        m.hero_seat_id = system_seat;
                        if let Some(plat) = extract_platform(p) {
                            m.hero_platform = Some(plat);
                        }
                        if let Some(av) = extract_avatar(p) {
                            m.hero_avatar = Some(av);
                        }
                    }
                }
            }

            // Second pass: identify opponent details for the seat that is not hero
            for p in arr {
                let pname = p.get("playerName").and_then(|v| v.as_str()).unwrap_or("");
                let system_seat = p.get("systemSeatId").or_else(|| p.get("seatId")).and_then(|v| v.as_u64()).unwrap_or(0) as u32;

                if system_seat != self.player_seat_id {
                    if let Some(m) = &mut self.active_match {
                        if !pname.is_empty() {
                            m.opponent_name = Some(pname.to_string());
                        }
                        if let Some(plat) = extract_platform(p) {
                            m.opponent_platform = Some(plat);
                        }
                        if let Some(av) = extract_avatar(p) {
                            m.opponent_avatar = Some(av);
                        }
                    }
                }
            }
        }
    }

    pub fn handle_object_id_changed(&mut self, orig_id: u32, new_id: u32) {
        if let Some(gid) = self.instance_map.get(&orig_id).copied() {
            self.instance_map.insert(new_id, gid);
        }
        if let Some(seat) = self.instance_owner_map.get(&orig_id).copied() {
            self.instance_owner_map.insert(new_id, seat);
        }
        if let Some(zone) = self.instance_zone_map.get(&orig_id).copied() {
            self.instance_zone_map.insert(new_id, zone);
        }
    }

    pub fn handle_deleted_instances(&mut self, deleted_ids: &[u32]) {
        if self.current_turn == 0 && !self.opening_hand_finalized && !self.player_opening_hand.is_empty() {
            let deleted_hand_count = self.player_opening_hand.iter().filter(|(i, _)| deleted_ids.contains(i)).count();
            if deleted_hand_count > 0 && deleted_hand_count < 5 {
                // Individual cards deleted before turn 1 -> London mulligan put on bottom of library
                for inst_id in deleted_ids {
                    if let Some(pos) = self.player_opening_hand.iter().position(|(i, _)| i == inst_id) {
                        let (_, gid) = self.player_opening_hand.remove(pos);
                        self.turn_events.push(MatchTurnEventRecord {
                            turn_number: 0,
                            seat_id: self.player_seat_id,
                            event_type: "bottom".to_string(),
                            grp_id: gid,
                            instance_id: Some(*inst_id),
                            timestamp: Utc::now().to_rfc3339(),
                        });
                        self.turn_event_seqs.push(self.feed_seq);
                        self.feed_seq += 1;
                    }
                }
            }
        }

        // Check if any deleted instance was on the Battlefield (Zone 28)
        for inst_id in deleted_ids {
            if self.instance_zone_map.get(inst_id) == Some(&28) {
                self.instance_zone_map.insert(*inst_id, 33);
                if let Some(resolved_grp_id) = self.instance_map.get(inst_id).copied() {
                    let seat_id = self.instance_owner_map.get(inst_id).copied().unwrap_or(self.player_seat_id);
                    if !self.recorded_actions.iter().any(|(_, i, t)| *i == *inst_id && t == "dies") {
                        self.recorded_actions.insert((self.current_turn, *inst_id, "dies".to_string()));
                        self.turn_events.push(MatchTurnEventRecord {
                            turn_number: self.current_turn,
                            seat_id,
                            event_type: "dies".to_string(),
                            grp_id: resolved_grp_id,
                            instance_id: Some(*inst_id),
                            timestamp: Utc::now().to_rfc3339(),
                        });
                        self.turn_event_seqs.push(self.feed_seq);
                        self.feed_seq += 1;
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
        self.cached_commander_id = commander_id;
        if let Some(m) = &mut self.active_match {
            if !deck_name.is_empty() {
                m.player_deck_name = deck_name;
            }
            m.player_commander_id = commander_id;
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
                        instance_id: None,
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
                    instance_id: None,
                    timestamp: Utc::now().to_rfc3339(),
                });
                self.turn_event_seqs.push(self.feed_seq);
                self.feed_seq += 1;
            }
        } else {
            // Hand kept: if no mulligans taken, finalize immediately.
            // If mulligans were taken, keep opening hand active so bottomed cards can be recorded,
            // then finalize remaining kept cards when turn 1 begins.
            if is_player && self.player_mulligans == 0 {
                self.finalize_opening_hand();
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
                instance_id: None,
                timestamp: Utc::now().to_rfc3339(),
            });
            self.turn_event_seqs.push(self.feed_seq);
            self.feed_seq += 1;
        }
    }

    pub fn process_game_object(&mut self, instance_id: u32, grp_id: Option<u32>, owner_seat: Option<u32>, zone_id: u32, is_card: bool, is_token: bool, token_name: Option<String>) -> Option<(u32, u32, String)> {
        let mut learning_grp_now = false;
        if let Some(tname) = token_name {
            self.token_instance_names.insert(instance_id, tname);
        }
        if is_token {
            self.token_instance_ids.insert(instance_id);
        }
        if let Some(gid) = grp_id {
            if gid > 0 {
                if is_token {
                    self.token_grp_ids.insert(gid);
                }
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
                if is_card && zone_id == 26 {
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

        if !is_card && !is_token {
            return None;
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

        let mut event_type = None;
        if zone_id == 28 {
            self.recorded_actions.retain(|(_, inst, act)| !(*inst == instance_id && (act == "dies" || act == "exile" || act == "blink")));
            // Blinkmaster: Returned to battlefield from Exile (29) or Limbo (30)
            let is_flicker = (previous_zone == Some(29) || previous_zone == Some(30) || self.instance_flicker_pending.contains(&instance_id)) && previous_zone != Some(28);
            self.instance_flicker_pending.remove(&instance_id);
            if is_flicker {
                if seat_id == self.player_seat_id && !is_token && !self.token_grp_ids.contains(&resolved_grp_id) {
                    let entry = self.impactful_cards.entry(resolved_grp_id).or_default();
                    if entry.seat_id == 0 { entry.seat_id = seat_id; }
                    entry.times_flickered += 1;
                    if entry.times_flickered >= 3 {
                        let tier = if entry.times_flickered >= 7 { "Gold" } else if entry.times_flickered >= 5 { "Silver" } else { "Bronze" };
                        add_tiered_title(&mut entry.titles, "Blinkmaster", tier);
                    }
                }
                event_type = Some("blink".to_string());
            }

            // Immortal: Returned to battlefield from Graveyard (33)
            if previous_zone == Some(33) {
                if seat_id == self.player_seat_id && !is_token && !self.token_grp_ids.contains(&resolved_grp_id) {
                    let entry = self.impactful_cards.entry(resolved_grp_id).or_default();
                    if entry.seat_id == 0 { entry.seat_id = seat_id; }
                    entry.times_reanimated += 1;
                    if entry.times_reanimated >= 3 {
                        let tier = if entry.times_reanimated >= 7 { "Gold" } else if entry.times_reanimated >= 5 { "Silver" } else { "Bronze" };
                        add_tiered_title(&mut entry.titles, "Immortal", tier);
                    }
                }
            }
        }

        if is_hand && (previous_zone != Some(zone_id) || learning_grp_now) {
            // Card returned to hand -> clear previous play history for recastability
            self.recorded_actions.retain(|(_, inst, act)| !(*inst == instance_id && (act == "play" || act == "dies" || act == "exile")));
            if !from_non_draw {
                event_type = Some("draw".to_string());
            }
        } else if is_token && zone_id == 28 {
            // Token created directly on the battlefield
            event_type = Some("token".to_string());
            if seat_id == self.player_seat_id {
                let spawner_grp = self.token_spawner_map.get(&instance_id).copied()
                    .or_else(|| {
                        self.ability_parent_map.get(&instance_id)
                            .and_then(|p| self.instance_map.get(p))
                            .copied()
                    });
                if let Some(s_grp) = spawner_grp {
                    if s_grp > 0 && !self.token_grp_ids.contains(&s_grp) {
                        let entry = self.impactful_cards.entry(s_grp).or_default();
                        if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                        entry.tokens_spawned += 1;
                        if entry.tokens_spawned >= 20 {
                            let tier = if entry.tokens_spawned >= 50 { "Gold" } else if entry.tokens_spawned >= 35 { "Silver" } else { "Bronze" };
                            add_tiered_title(&mut entry.titles, "Swarmer", tier);
                        }
                    }
                }
            }
        } else if event_type.is_none() && (zone_id == 27 || (zone_id == 28 && previous_zone != Some(27))) && previous_zone != Some(zone_id) {
            // Entered stack (cast), or entered battlefield directly without passing through stack (lands, puts, non-token creatures)
            event_type = Some("play".to_string());

            // Cat Burglar: Stealing/casting cards owned by opponent via a hero ability
            if seat_id != self.player_seat_id && previous_zone.map(|z| z != 28).unwrap_or(true) {
                if let Some(parent_id) = self.ability_parent_map.get(&instance_id) {
                    let parent_seat = self.instance_owner_map.get(parent_id).copied().unwrap_or(0);
                    let parent_grp = self.instance_map.get(parent_id).copied().unwrap_or(0);
                    if parent_seat == self.player_seat_id && parent_grp > 0 && !self.token_grp_ids.contains(&parent_grp) {
                        let entry = self.impactful_cards.entry(parent_grp).or_default();
                        if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                        entry.cards_stolen += 1;
                        if entry.cards_stolen >= 3 {
                            let tier = if entry.cards_stolen >= 7 { "Gold" } else if entry.cards_stolen >= 5 { "Silver" } else { "Bronze" };
                            add_tiered_title(&mut entry.titles, "Cat Burglar", tier);
                        }
                    }
                }
            }
        } else if previous_zone == Some(28) && (zone_id == 33 || zone_id == 37) {
            // Battlefield -> Graveyard (33) or Pending (37) = Dies / Destroyed / Sacrificed
            event_type = Some("dies".to_string());
        } else if previous_zone == Some(28) && zone_id == 29 {
            // Battlefield -> Exile (29) = Exiled
            event_type = Some("exile".to_string());
            self.instance_flicker_pending.insert(instance_id);
        }

        if let Some(etype) = event_type {
            if (etype == "play" || etype == "dies" || etype == "exile" || etype == "token")
                && self.recorded_actions.iter().any(|(_, i, t)| *i == instance_id && *t == etype)
            {
                return None;
            }
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
                    instance_id: Some(instance_id),
                    timestamp: Utc::now().to_rfc3339(),
                });
                self.turn_event_seqs.push(self.feed_seq);
                self.feed_seq += 1;

                return Some((resolved_grp_id, seat_id, etype.clone()));
            }
        }

        None
    }

    /// Record damage/life-loss attributed to a card instance (from DamageDealt annotations).
    /// Aggregates total impact, biggest single swing, and face vs permanent splits.
    pub fn process_damage_event(
        &mut self,
        ann_id: u32,
        instance_id: u32,
        target_instance_id: u32,
        amount: i32,
        damage_type: u32, // 1 = combat, 2 = non-combat/spell
    ) {
        if ann_id > 0 && !self.seen_damage_annotation_ids.insert(ann_id) {
            // Already processed this exact damage annotation -> avoid duplicate entry
            return;
        }
        let grp_id = self.instance_map.get(&instance_id).copied().unwrap_or(0);
        if grp_id == 0 {
            return;
        }
        let seat_id = self.instance_owner_map.get(&instance_id).copied().unwrap_or(0);
        let magnitude = amount.abs();

        let is_to_player = target_instance_id == 1 || target_instance_id == 2;
        let is_combat = damage_type == 1 || damage_type == 3; // 1 = combat, 2 = direct/spell, 3 = fight

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
            if magnitude > entry.max_hit_combat {
                entry.max_hit_combat = magnitude;
            }
        } else {
            entry.damage_spell += magnitude;
            if magnitude > entry.max_hit_spell {
                entry.max_hit_spell = magnitude;
            }
        }

        // Award Heavy Hitter achievement titles with single-match magnitude tiering (Hero non-token cards only)
        if seat_id == self.player_seat_id && !self.token_grp_ids.contains(&grp_id) && !self.token_instance_ids.contains(&instance_id) {
            if magnitude >= 10 {
                let hm_tier = if magnitude >= 30 {
                    "Gold"
                } else if magnitude >= 20 {
                    "Silver"
                } else {
                    "Bronze"
                };
                let hm_title = format!("Haymaker ({})", hm_tier);
                entry.titles.retain(|t| !t.starts_with("Haymaker"));
                entry.titles.push(hm_title);
            }
            if entry.total_damage >= 25 {
                let jg_tier = if entry.total_damage >= 60 {
                    "Gold"
                } else if entry.total_damage >= 40 {
                    "Silver"
                } else {
                    "Bronze"
                };
                let jg_title = format!("Juggernaut ({})", jg_tier);
                entry.titles.retain(|t| !t.starts_with("Juggernaut"));
                entry.titles.push(jg_title);
            }
        }

        // Track hero damage hits against opponent for lethal Executioner/Over-Killer
        let opp_seat = if self.player_seat_id == 1 { 2 } else { 1 };
        if (target_instance_id == 1 || target_instance_id == 2) && target_instance_id == opp_seat {
            *self.turn_damage_to_seat.entry(target_instance_id).or_insert(0) += magnitude;
            if seat_id == self.player_seat_id {
                self.current_turn_hero_hits.push((grp_id, magnitude, self.current_opp_life));
                self.last_hero_damage_hit = Some((grp_id, magnitude, self.current_opp_life));
            }
        }

        // Check if this is self-damage to player (e.g. Talisman, painland, shockland)
        let is_self_damage = (target_instance_id == seat_id)
            || (seat_id == self.player_seat_id && target_instance_id == self.player_seat_id)
            || (seat_id != self.player_seat_id && (target_instance_id == 1 || target_instance_id == 2) && target_instance_id != self.player_seat_id);

        if !is_self_damage {
            // Also record to live damage feed for the HUD
            self.damage_feed_events.push((
                LiveDamageFeedEvent {
                    source_instance_id: instance_id,
                    target_instance_id,
                    amount: magnitude,
                    damage_type,
                    turn_number: self.current_turn,
                },
                self.feed_seq,
            ));

            // If target_instance_id is a creature/planeswalker (> 2), resolve its grp_id from instance_map or ability_parent_map
            let target_grp_id = if target_instance_id > 2 {
                self.instance_map.get(&target_instance_id).copied()
                    .or_else(|| {
                        self.ability_parent_map.get(&target_instance_id)
                            .and_then(|pid| self.instance_map.get(pid).copied())
                    })
                    .unwrap_or(0)
            } else {
                0
            };

            // Stash into turn_events so the match play timeline also reflects combat & spell damage
            let dmg_event_type = if is_combat {
                if target_grp_id > 0 {
                    format!("damage:combat:{}:{}:{}", magnitude, target_instance_id, target_grp_id)
                } else {
                    format!("damage:combat:{}:{}", magnitude, target_instance_id)
                }
            } else {
                if target_grp_id > 0 {
                    format!("damage:spell:{}:{}:{}", magnitude, target_instance_id, target_grp_id)
                } else {
                    format!("damage:spell:{}:{}", magnitude, target_instance_id)
                }
            };
            self.turn_events.push(MatchTurnEventRecord {
                turn_number: self.current_turn,
                seat_id,
                event_type: dmg_event_type,
                grp_id,
                instance_id: Some(instance_id),
                timestamp: Utc::now().to_rfc3339(),
            });
            self.turn_event_seqs.push(self.feed_seq);
            self.feed_seq += 1;
        }
    }

    pub fn register_ability_parent(&mut self, ability_id: u32, parent_id: u32) {
        if ability_id > 0 && parent_id > 0 {
            self.ability_parent_map.insert(ability_id, parent_id);
            if let Some(pgid) = self.instance_map.get(&parent_id).copied() {
                self.instance_map.entry(ability_id).or_insert(pgid);
            }
            if let Some(powner) = self.instance_owner_map.get(&parent_id).copied() {
                self.instance_owner_map.entry(ability_id).or_insert(powner);
            }
        }
    }

    /// Record extra card draws caused by a spell/ability/card instance.
    /// Aggregates lifetime draw engine metrics and awards Rhystic Tracker honors.
    pub fn process_draw_event(&mut self, affector_instance_id: u32, count: u32) {
        if affector_instance_id == 0 || count == 0 {
            return;
        }
        let mut grp_id = self.instance_map.get(&affector_instance_id).copied().unwrap_or(0);
        let mut seat_id = self.instance_owner_map.get(&affector_instance_id).copied().unwrap_or(0);

        // Resolve through ability_parent_map if missing or not a known card in match
        if (grp_id == 0 || (!self.player_cards_seen.contains_key(&grp_id) && !self.opp_cards_seen.contains_key(&grp_id)))
            && self.ability_parent_map.contains_key(&affector_instance_id)
        {
            if let Some(parent_id) = self.ability_parent_map.get(&affector_instance_id).copied() {
                if let Some(pgid) = self.instance_map.get(&parent_id).copied() {
                    grp_id = pgid;
                }
                if seat_id == 0 {
                    seat_id = self.instance_owner_map.get(&parent_id).copied().unwrap_or(0);
                }
            }
        }

        if seat_id == 0 {
            seat_id = self.player_seat_id;
        }

        if grp_id == 0 {
            // Heuristic fallback: attribute to most recent card played by this seat within 2 turns
            if let Some(last_play) = self.turn_events.iter().rev().find(|e| e.seat_id == seat_id && e.event_type == "play" && e.turn_number >= self.current_turn.saturating_sub(1)) {
                grp_id = last_play.grp_id;
            }
        }

        if grp_id == 0 {
            println!("[DRAW DEBUG] affector {} could not be resolved to a grp_id (available keys: {:?})", affector_instance_id, self.instance_map.keys().take(5).collect::<Vec<_>>());
            return;
        }

        println!("[DRAW] affector {} -> grp {} seat {} count {} (hero_seat {})", affector_instance_id, grp_id, seat_id, count, self.player_seat_id);

        let entry = self.impactful_cards.entry(grp_id).or_default();
        if entry.seat_id == 0 {
            entry.seat_id = seat_id;
        }
        entry.cards_drawn += count as i64;

        // Award Rhystic Tracker achievement if hero card draws 5 or more extra cards in match (non-token only)
        if seat_id == self.player_seat_id && !self.token_grp_ids.contains(&grp_id) && entry.cards_drawn >= 5 {
            let rt_tier = if entry.cards_drawn >= 12 {
                "Gold"
            } else if entry.cards_drawn >= 8 {
                "Silver"
            } else {
                "Bronze"
            };
            let rt_title = format!("Rhystic Tracker ({})", rt_tier);
            entry.titles.retain(|t| !t.starts_with("Rhystic Tracker"));
            entry.titles.push(rt_title);
        }
    }

    /// Process counters placed on permanents (+1/+1 counters, loyalty, etc.).
    /// Evaluates Hardened and Ozolithic! achievements.
    pub fn process_counter_event(&mut self, target_instance_id: u32, counter_type: u32, amount: i32) {
        if target_instance_id == 0 || amount == 0 {
            return;
        }
        let grp_id = self.instance_map.get(&target_instance_id).copied().unwrap_or(0);
        if grp_id == 0 {
            return;
        }
        let seat_id = self.instance_owner_map.get(&target_instance_id).copied().unwrap_or(self.player_seat_id);

        let counter_name = if counter_type == 1 { "+1/+1" } else { "counter" };
        let event_type = format!("counter:{}:{}", counter_name, amount);

        self.turn_events.push(MatchTurnEventRecord {
            turn_number: self.current_turn,
            seat_id,
            event_type,
            grp_id,
            instance_id: Some(target_instance_id),
            timestamp: Utc::now().to_rfc3339(),
        });
        self.turn_event_seqs.push(self.feed_seq);
        self.feed_seq += 1;

        // ONLY +1/+1 counters (counter_type == 1) qualify for Ozolithic! and Hardened counter tracking
        if amount > 0 && counter_type == 1 {
            let entry = self.impactful_cards.entry(grp_id).or_default();
            if entry.seat_id == 0 {
                entry.seat_id = seat_id;
            }
            entry.counters_added += amount as i64;
            entry.toughness_boosted += amount as i32;

            if seat_id == self.player_seat_id && !self.token_grp_ids.contains(&grp_id) && !self.token_instance_ids.contains(&target_instance_id) {
                // Ozolithic!: 10+ (Bronze), 15+ (Silver), 20+ (Gold) [+1/+1 counters only]
                if entry.counters_added >= 10 {
                    let o_tier = if entry.counters_added >= 20 {
                        "Gold"
                    } else if entry.counters_added >= 15 {
                        "Silver"
                    } else {
                        "Bronze"
                    };
                    add_tiered_title(&mut entry.titles, "Ozolithic!", o_tier);
                }

                // Hardened: 7+ (Bronze), 12+ (Silver), 20+ (Gold) [Toughness increase via counters/buffs/equipment]
                if entry.toughness_boosted >= 7 {
                    let h_tier = if entry.toughness_boosted >= 20 {
                        "Gold"
                    } else if entry.toughness_boosted >= 12 {
                        "Silver"
                    } else {
                        "Bronze"
                    };
                    add_tiered_title(&mut entry.titles, "Hardened", h_tier);
                }
            }
        }
    }

    /// Record a non-counter toughness increase (from a spell, aura, equipment, or ability).
    pub fn process_toughness_buff(&mut self, affector_id: u32, target_instance_id: u32, toughness_delta: i32) {
        if toughness_delta <= 0 {
            return;
        }
        let mut grp_id = self.instance_map.get(&affector_id).copied().unwrap_or(0);
        let mut seat_id = self.instance_owner_map.get(&affector_id).copied().unwrap_or(0);

        if (grp_id == 0 || seat_id == 0) && self.ability_parent_map.contains_key(&affector_id) {
            if let Some(parent_id) = self.ability_parent_map.get(&affector_id).copied() {
                if let Some(pgid) = self.instance_map.get(&parent_id).copied() { grp_id = pgid; }
                if seat_id == 0 { seat_id = self.instance_owner_map.get(&parent_id).copied().unwrap_or(0); }
            }
        }

        // If affector is not resolved, attribute to target creature
        if grp_id == 0 {
            grp_id = self.instance_map.get(&target_instance_id).copied().unwrap_or(0);
            seat_id = self.instance_owner_map.get(&target_instance_id).copied().unwrap_or(self.player_seat_id);
        }

        if seat_id == self.player_seat_id && grp_id > 0 && !self.token_grp_ids.contains(&grp_id) {
            let entry = self.impactful_cards.entry(grp_id).or_default();
            if entry.seat_id == 0 { entry.seat_id = seat_id; }
            entry.toughness_boosted += toughness_delta;

            if entry.toughness_boosted >= 7 {
                let h_tier = if entry.toughness_boosted >= 20 {
                    "Gold"
                } else if entry.toughness_boosted >= 12 {
                    "Silver"
                } else {
                    "Bronze"
                };
                add_tiered_title(&mut entry.titles, "Hardened", h_tier);
            }
        }
    }

    pub fn process_life_modification(&mut self, affector_id: u32, target_seat: u32, delta: i32) {
        if affector_id > 0 && target_seat > 0 {
            self.active_life_sources.insert(target_seat, affector_id);

            // Vampiric: Non-combat life drain from opponent (delta < 0 on opponent)
            // If damage was dealt to this seat on this turn that accounts for this life loss, it is damage resolution, not aristocrat life drain.
            let dmg_to_seat = self.turn_damage_to_seat.get(&target_seat).copied().unwrap_or(0);
            let is_damage_resolution = dmg_to_seat >= delta.abs();

            if delta < 0 && target_seat != self.player_seat_id && !is_damage_resolution {
                let mut grp_id = self.instance_map.get(&affector_id).copied().unwrap_or(0);
                let mut seat_id = self.instance_owner_map.get(&affector_id).copied().unwrap_or(0);
                if (grp_id == 0 || seat_id == 0) && self.ability_parent_map.contains_key(&affector_id) {
                    if let Some(parent_id) = self.ability_parent_map.get(&affector_id).copied() {
                        if let Some(pgid) = self.instance_map.get(&parent_id).copied() { grp_id = pgid; }
                        if seat_id == 0 { seat_id = self.instance_owner_map.get(&parent_id).copied().unwrap_or(0); }
                    }
                }
                if seat_id == self.player_seat_id && grp_id > 0 && !self.token_grp_ids.contains(&grp_id) {
                    let entry = self.impactful_cards.entry(grp_id).or_default();
                    if entry.seat_id == 0 { entry.seat_id = seat_id; }
                    entry.life_drained += delta.abs() as i64;
                    if entry.life_drained >= 10 {
                        let tier = if entry.life_drained >= 30 {
                            "Gold"
                        } else if entry.life_drained >= 20 {
                            "Silver"
                        } else {
                            "Bronze"
                        };
                        add_tiered_title(&mut entry.titles, "Vampiric", tier);
                    }
                }
            }
        }
    }

    pub fn set_card_cmc(&mut self, grp_id: u32, cmc: u32) {
        self.card_cmc_map.insert(grp_id, cmc);
    }

    pub fn process_counterspell_event(&mut self, affector_id: u32, target_id: u32, target_cmc_override: Option<u32>) {
        if affector_id == 0 || target_id == 0 {
            return;
        }
        let mut affector_grp = self.instance_map.get(&affector_id).copied().unwrap_or(0);
        let mut affector_seat = self.instance_owner_map.get(&affector_id).copied().unwrap_or(0);

        if (affector_grp == 0 || affector_seat == 0) && self.ability_parent_map.contains_key(&affector_id) {
            if let Some(parent_id) = self.ability_parent_map.get(&affector_id).copied() {
                if let Some(pgid) = self.instance_map.get(&parent_id).copied() { affector_grp = pgid; }
                if affector_seat == 0 { affector_seat = self.instance_owner_map.get(&parent_id).copied().unwrap_or(0); }
            }
        }

        if affector_seat == 0 {
            if self.player_cards_seen.contains_key(&affector_grp) {
                affector_seat = self.player_seat_id;
            } else if self.opp_cards_seen.contains_key(&affector_grp) {
                affector_seat = if self.player_seat_id == 1 { 2 } else { 1 };
            }
        }

        let target_grp = self.instance_map.get(&target_id).copied().unwrap_or(0);

        if affector_seat == self.player_seat_id && affector_grp > 0 && !self.token_grp_ids.contains(&affector_grp) {
            let entry = self.impactful_cards.entry(affector_grp).or_default();
            if entry.seat_id == 0 { entry.seat_id = affector_seat; }

            let target_cmc = target_cmc_override
                .or_else(|| if target_grp > 0 { self.card_cmc_map.get(&target_grp).copied() } else { None });

            if let Some(cmc) = target_cmc {
                if cmc >= 5 {
                    let tier = if cmc >= 10 {
                        "Gold"
                    } else if cmc >= 7 {
                        "Silver"
                    } else {
                        "Bronze"
                    };
                    add_tiered_title(&mut entry.titles, "Negator", tier);
                }
            }

            if target_grp > 0 {
                self.pending_counter_events.push((affector_grp, target_grp));
            }

            self.turn_events.push(MatchTurnEventRecord {
                turn_number: self.current_turn,
                seat_id: affector_seat,
                event_type: format!("counter:{}", target_grp),
                grp_id: affector_grp,
                instance_id: Some(affector_id),
                timestamp: Utc::now().to_rfc3339(),
            });
            self.turn_event_seqs.push(self.feed_seq);
            self.feed_seq += 1;
        }
    }

    pub fn process_zone_transfer_event(&mut self, affector_id: u32, affected_ids: &[u32], category: &str, zone_src: u32, zone_dest: u32) {
        if affector_id == 0 || affected_ids.is_empty() {
            return;
        }
        let mut affector_grp = self.instance_map.get(&affector_id).copied().unwrap_or(0);
        let mut affector_seat = self.instance_owner_map.get(&affector_id).copied().unwrap_or(0);

        if (affector_grp == 0 || affector_seat == 0) && self.ability_parent_map.contains_key(&affector_id) {
            if let Some(parent_id) = self.ability_parent_map.get(&affector_id).copied() {
                if let Some(pgid) = self.instance_map.get(&parent_id).copied() { affector_grp = pgid; }
                if affector_seat == 0 { affector_seat = self.instance_owner_map.get(&parent_id).copied().unwrap_or(0); }
            }
        }

        // Handle Mill events (library to graveyard or category Mill)
        if category.eq_ignore_ascii_case("Mill") || (zone_src == 36 && zone_dest == 37) {
            let count = affected_ids.len();
            let seat = if affector_seat > 0 { affector_seat } else { self.player_seat_id };
            
            // Check if last turn event was a mill from the same source on the same turn
            if let Some(last) = self.turn_events.last_mut() {
                if last.turn_number == self.current_turn && last.seat_id == seat && last.grp_id == affector_grp && last.event_type.starts_with("mill:") {
                    let existing: usize = last.event_type.split(':').nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
                    last.event_type = format!("mill:{}", existing + count);
                    return;
                }
            }

            self.turn_events.push(MatchTurnEventRecord {
                turn_number: self.current_turn,
                seat_id: seat,
                event_type: format!("mill:{}", count),
                grp_id: affector_grp,
                instance_id: Some(affector_id),
                timestamp: Utc::now().to_rfc3339(),
            });
            self.turn_event_seqs.push(self.feed_seq);
            self.feed_seq += 1;
            return;
        }

        // Handle Flicker tracking (return to battlefield from exile/limbo)
        if category.eq_ignore_ascii_case("Return") && zone_dest == 28 {
            for target_id in affected_ids {
                self.instance_flicker_pending.insert(*target_id);
            }
        }
        if category.eq_ignore_ascii_case("Exile") && zone_src == 28 && (zone_dest == 29 || zone_dest == 30) {
            for target_id in affected_ids {
                self.instance_flicker_pending.insert(*target_id);
            }
        }

        if affector_seat != self.player_seat_id || affector_grp == 0 || self.token_grp_ids.contains(&affector_grp) {
            return;
        }

        for target_id in affected_ids {
            self.token_spawner_map.insert(*target_id, affector_grp);
        }

        let is_wipe_category = category.eq_ignore_ascii_case("Destroy")
            || category.eq_ignore_ascii_case("Exile")
            || category.eq_ignore_ascii_case("Sacrifice")
            || (zone_src == 28 && (zone_dest == 33 || zone_dest == 29 || zone_dest == 37));

        if is_wipe_category {
            let mut opp_wiped = 0usize;
            let mut total_wiped = 0usize;

            for tgt_id in affected_ids {
                let tgt_owner = self.instance_owner_map.get(tgt_id).copied().unwrap_or(0);
                let tgt_zone = self.instance_zone_map.get(tgt_id).copied().unwrap_or(zone_src);
                if tgt_zone == 28 || zone_src == 28 {
                    total_wiped += 1;
                    if tgt_owner > 0 && tgt_owner != self.player_seat_id {
                        opp_wiped += 1;
                    }
                }
            }

            let entry = self.impactful_cards.entry(affector_grp).or_default();
            if entry.seat_id == 0 { entry.seat_id = affector_seat; }

            if opp_wiped > entry.max_opp_wiped { entry.max_opp_wiped = opp_wiped; }
            if total_wiped > entry.max_total_wiped { entry.max_total_wiped = total_wiped; }

            // Sweeper: Destroyed/exiled 8+ (Bronze), 12+ (Silver), 18+ (Gold) opponent permanents
            if opp_wiped >= 8 {
                let tier = if opp_wiped >= 18 {
                    "Gold"
                } else if opp_wiped >= 12 {
                    "Silver"
                } else {
                    "Bronze"
                };
                add_tiered_title(&mut entry.titles, "Sweeper", tier);
            }

            // Cataclysm: Destroyed/exiled 12+ (Bronze), 18+ (Silver), 25+ (Gold) total permanents
            if total_wiped >= 12 {
                let tier = if total_wiped >= 25 {
                    "Gold"
                } else if total_wiped >= 18 {
                    "Silver"
                } else {
                    "Bronze"
                };
                add_tiered_title(&mut entry.titles, "Cataclysm", tier);
            }

            // Royal Assassin: targeted elimination of 1-3 opponent creatures
            if opp_wiped >= 1 && opp_wiped <= 3 {
                entry.creatures_eliminated += opp_wiped as u32;
                if entry.creatures_eliminated >= 3 {
                    let tier = if entry.creatures_eliminated >= 7 {
                        "Gold"
                    } else if entry.creatures_eliminated >= 5 {
                        "Silver"
                    } else {
                        "Bronze"
                    };
                    add_tiered_title(&mut entry.titles, "Royal Assassin", tier);
                }
            }
        }
    }

    pub fn process_mana_paid_event(&mut self, affector_id: u32, count: u32) {
        if affector_id == 0 || count == 0 {
            return;
        }
        let mut grp_id = self.instance_map.get(&affector_id).copied().unwrap_or(0);
        let mut seat_id = self.instance_owner_map.get(&affector_id).copied().unwrap_or(0);

        let permanent_instance_id = if let Some(parent_id) = self.ability_parent_map.get(&affector_id).copied() {
            if let Some(pgid) = self.instance_map.get(&parent_id).copied() { grp_id = pgid; }
            if seat_id == 0 { seat_id = self.instance_owner_map.get(&parent_id).copied().unwrap_or(0); }
            parent_id
        } else {
            affector_id
        };

        if grp_id == 0 {
            return;
        }

        if seat_id == self.player_seat_id && !self.token_grp_ids.contains(&grp_id) {
            // Mana Dynamo tracking (Hero permanent generating mana in turn)
            let entry = self.impactful_cards.entry(grp_id).or_default();
            if entry.seat_id == 0 { entry.seat_id = seat_id; }
            let turn_val = self.turn_mana_by_instance.entry(permanent_instance_id).or_insert(0);
            *turn_val += count;
            if *turn_val > entry.max_turn_mana {
                entry.max_turn_mana = *turn_val;
            }
            if entry.max_turn_mana >= 5 {
                let tier = if entry.max_turn_mana >= 15 {
                    "Gold"
                } else if entry.max_turn_mana >= 8 {
                    "Silver"
                } else {
                    "Bronze"
                };
                add_tiered_title(&mut entry.titles, "Mana Dynamo", tier);
            }
        } else if seat_id != self.player_seat_id {
            // Opponent paid mana -> only attribute if affector_id maps to a hero permanent via ability_parent_map
            if let Some(parent_id) = self.ability_parent_map.get(&affector_id) {
                let parent_seat = self.instance_owner_map.get(parent_id).copied().unwrap_or(0);
                let parent_grp = self.instance_map.get(parent_id).copied().unwrap_or(0);
                if parent_seat == self.player_seat_id && parent_grp > 0 && !self.token_grp_ids.contains(&parent_grp) {
                    let entry = self.impactful_cards.entry(parent_grp).or_default();
                    if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                    entry.taxes_paid_by_opp += count;
                    if entry.taxes_paid_by_opp >= 4 {
                        let tier = if entry.taxes_paid_by_opp >= 10 {
                            "Gold"
                        } else if entry.taxes_paid_by_opp >= 7 {
                            "Silver"
                        } else {
                            "Bronze"
                        };
                        add_tiered_title(&mut entry.titles, "Tax Collector", tier);
                    }
                }
            }
        }
    }

    pub fn evaluate_ironclad(&mut self) {
        for (inst_id, damage) in &self.turn_damage_taken_by_instance {
            if *damage >= 10 {
                let grp_id = self.instance_map.get(inst_id).copied().unwrap_or(0);
                let current_zone = self.instance_zone_map.get(inst_id).copied().unwrap_or(0);
                let seat_id = self.instance_owner_map.get(inst_id).copied().unwrap_or(0);
                // Survived on battlefield (zone 28)
                if seat_id == self.player_seat_id && current_zone == 28 && grp_id > 0 && !self.token_grp_ids.contains(&grp_id) {
                    let entry = self.impactful_cards.entry(grp_id).or_default();
                    if entry.seat_id == 0 { entry.seat_id = seat_id; }
                    if *damage > entry.damage_absorbed_on_block {
                        entry.damage_absorbed_on_block = *damage;
                    }
                    let tier = if *damage >= 20 {
                        "Gold"
                    } else if *damage >= 15 {
                        "Silver"
                    } else {
                        "Bronze"
                    };
                    add_tiered_title(&mut entry.titles, "Ironclad", tier);
                }
            }
        }
        self.turn_damage_taken_by_instance.clear();
    }

    pub fn update_game_state(&mut self, msg_id: Option<u64>, turn: u32, life_by_seat: &[(u32, i32)], active_seat: u32) {
        if let Some(mid) = msg_id {
            if self.processed_msg_ids.contains(&mid) {
                return;
            }
            self.processed_msg_ids.insert(mid);
        }

        if turn > 0 {
            if turn > self.current_turn {
                self.evaluate_ironclad();
                self.turn_mana_by_instance.clear();
                self.turn_damage_to_seat.clear();
                self.current_turn_hero_hits.clear();
                self.opp_life_before_combat = self.current_opp_life;
            }
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
            let source_inst = self.active_life_sources.remove(seat);
            let source_grp = source_inst.and_then(|inst| self.instance_map.get(&inst).copied());
            let is_hero = *seat == self.player_seat_id;
            let current_life = if is_hero { self.current_player_life } else { self.current_opp_life };

            if current_life != *life {
                let delta = *life - current_life;
                // If life decreased due to combat damage events to this seat on this turn,
                // the damage events already document the hit in the HUD feed.
                let total_combat_dmg: i32 = self.damage_feed_events.iter()
                    .filter(|(dmg, _)| {
                        dmg.turn_number == self.current_turn
                            && dmg.target_instance_id == *seat
                            && (dmg.damage_type == 1 || dmg.damage_type == 3)
                    })
                    .map(|(dmg, _)| dmg.amount)
                    .sum();
                let was_combat_damage = delta < 0 && total_combat_dmg >= delta.abs();

                if !was_combat_damage {
                    self.life_events.push((self.current_turn, current_life, *life, *seat, source_grp, self.feed_seq));
                    self.turn_events.push(MatchTurnEventRecord {
                        turn_number: self.current_turn,
                        seat_id: *seat,
                        event_type: if let Some(grp) = source_grp {
                            format!("life:{}:{}:{}", delta, *life, grp)
                        } else {
                            format!("life:{}:{}", delta, *life)
                        },
                        grp_id: source_grp.unwrap_or(0),
                        instance_id: source_inst,
                        timestamp: Utc::now().to_rfc3339(),
                    });
                    self.turn_event_seqs.push(self.feed_seq);
                    self.feed_seq += 1;
                }

                if is_hero {
                    self.current_player_life = *life;
                } else {
                    self.current_opp_life = *life;
                }
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

            // Evaluate Closer achievements with individual damage magnitude tiering
            if is_win {
                if self.current_opp_life <= 0 {
                    let mut lethal_hits = self.current_turn_hero_hits.clone();
                    if lethal_hits.is_empty() {
                        if let Some((grp, amt, life_before)) = self.last_hero_damage_hit {
                            lethal_hits.push((grp, amt, life_before));
                        }
                    }

                    for (grp, amt, _) in &lethal_hits {
                        if self.token_grp_ids.contains(grp) {
                            continue;
                        }
                        let entry = self.impactful_cards.entry(*grp).or_default();
                        if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                        let exec_tier = if *amt >= 15 {
                            "Gold"
                        } else if *amt >= 10 {
                            "Silver"
                        } else if *amt >= 7 {
                            "Bronze"
                        } else {
                            ""
                        };
                        if !exec_tier.is_empty() {
                            let exec_title = format!("Executioner ({})", exec_tier);
                            // Avoid overwriting a higher tier if already present
                            let already_has_higher = entry.titles.iter().any(|t| {
                                if !t.starts_with("Executioner") { return false; }
                                if exec_tier == "Bronze" { return t.contains("Silver") || t.contains("Gold"); }
                                if exec_tier == "Silver" { return t.contains("Gold"); }
                                false
                            });
                            if !already_has_higher {
                                entry.titles.retain(|t| !t.starts_with("Executioner"));
                                entry.titles.push(exec_title);
                            }
                        }
                    }

                    // Overkill calculation: individual creature must single-handedly account for the excess overkill threshold beyond pre-combat life
                    for (grp, amt, life_before) in &lethal_hits {
                        if self.token_grp_ids.contains(grp) {
                            continue;
                        }
                        let pre_life = (*life_before).max(0);
                        let ind_overkill = *amt - pre_life;
                        if ind_overkill >= 7 {
                            let ok_tier = if ind_overkill >= 15 {
                                "Gold"
                            } else if ind_overkill >= 10 {
                                "Silver"
                            } else {
                                "Bronze"
                            };
                            let ok_title = format!("Over-Killer ({})", ok_tier);
                            let entry = self.impactful_cards.entry(*grp).or_default();
                            if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                            let already_has_higher = entry.titles.iter().any(|t| {
                                if !t.starts_with("Over-Killer") { return false; }
                                if ok_tier == "Bronze" { return t.contains("Silver") || t.contains("Gold"); }
                                if ok_tier == "Silver" { return t.contains("Gold"); }
                                false
                            });
                            if !already_has_higher {
                                entry.titles.retain(|t| !t.starts_with("Over-Killer"));
                                entry.titles.push(ok_title);
                            }
                        }
                    }
                } else if reason.to_lowercase().contains("concede") {
                    // Scoop Inducer candidate: evaluated by round and opponent life (non-token only)
                    if let Some(last_play) = self.turn_events.iter().rev().find(|e| e.seat_id == self.player_seat_id && e.event_type == "play" && !self.token_grp_ids.contains(&e.grp_id) && e.turn_number >= self.current_turn.saturating_sub(1)) {
                        let entry = self.impactful_cards.entry(last_play.grp_id).or_default();
                        if entry.seat_id == 0 { entry.seat_id = self.player_seat_id; }
                        let round = (self.current_turn + 1) / 2;
                        let opp_life = self.current_opp_life;
                        let tier = if round <= 4 && opp_life >= 25 {
                            Some("Gold")
                        } else if round <= 5 && opp_life >= 25 {
                            Some("Silver")
                        } else if round <= 6 && opp_life >= 20 {
                            Some("Bronze")
                        } else {
                            None
                        };
                        if let Some(t) = tier {
                            let title = format!("Scoop Inducer ({})", t);
                            if !entry.titles.iter().any(|t| t.starts_with("Scoop Inducer")) {
                                entry.titles.push(title);
                            }
                        }
                    }
                }
            }

            self.evaluate_ironclad();

            let turn_events = std::mem::take(&mut self.turn_events);
            self.pending_counter_events.clear();

            let impactful_records: Vec<MatchImpactfulRecord> = self.impactful_cards.drain()
                .filter(|(_, stats)| stats.total_damage > 0 || stats.cards_drawn > 0 || stats.counters_added > 0 || !stats.titles.is_empty())
                .map(|(grp_id, stats)| MatchImpactfulRecord {
                    grp_id,
                    seat_id: stats.seat_id,
                    total_damage: stats.total_damage,
                    max_hit: stats.max_hit,
                    max_hit_combat: stats.max_hit_combat,
                    max_hit_spell: stats.max_hit_spell,
                    damage_to_player: stats.damage_to_player,
                    damage_to_permanents: stats.damage_to_permanents,
                    damage_combat: stats.damage_combat,
                    damage_spell: stats.damage_spell,
                    titles: stats.titles.clone(),
                    cards_drawn: stats.cards_drawn,
                    counters_added: stats.counters_added,
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
    use crate::parser::is_assigned_deck_event;

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
        assembler.start_match("test-match-uuid-123".to_string(), "Brawl".to_string(), false);

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
        assembler.start_match("match-123".to_string(), "Bot Match".to_string(), false);

        let active = assembler.active_match.as_ref().expect("Active match should exist");
        assert_eq!(active.player_deck_name, "MonoWhite - Auras (Standard)");
        assert!(assembler.match_legitimate);
    }

    #[test]
    fn test_assigned_deck_event_bypasses_stale_cache() {
        // Reproduces the "welcome deck duel uses the previous queue's deck" bug:
        // a deck-submitting queue runs first, then WelcomeDeckDuels starts with
        // no EventSetDeck in between.
        let mut assembler = MatchAssembler::new();

        assembler.set_deck(
            "Mono White".to_string(),
            Some("deck-mwm-brawl".to_string()),
            Some(103392),
            vec![67692, 97817, 88930],
        );
        assert!(assembler.match_legitimate);

        assembler.start_match(
            "match-wdd".to_string(),
            "WelcomeDeckDuels HOB 20260811".to_string(),
            true,
        );

        let active = assembler.active_match.as_ref().expect("Active match should exist");
        // The stale cached deck name must NOT be attributed to this match.
        assert_eq!(active.player_deck_name, PRESET_EVENT_DECK_NAME);
        assert_ne!(active.player_deck_name, "Mono White");
        // Lent event decks never feed the draw-based collection.
        assert!(!assembler.match_legitimate);
        assert!(assembler.last_assigned_deck_event);

        // The cache itself is bypassed, not destroyed: the deck id/name remain
        // available for their other consumers (catalog backfill, rename sync).
        assert_eq!(assembler.cached_deck_name, Some("Mono White".to_string()));
        assert_eq!(assembler.cached_deck_id, Some("deck-mwm-brawl".to_string()));
    }

    #[test]
    fn test_assigned_deck_event_no_fingerprint_reattribute_and_no_collection() {
        let mut assembler = MatchAssembler::new();

        // Known deck sharing cards with the event deck (Jump In packets share
        // staples with constructed decks all the time).
        assembler.register_deck_catalog(vec![
            ("deck-auras".to_string(), "MonoWhite - Auras (Standard)".to_string(), None, vec![86715, 97964, 92090, 92081]),
        ]);
        assembler.start_match("match-jumpin".to_string(), "Jump In 2024".to_string(), true);

        // Draw an opening hand of cards that overlap a known deck by >= 3 cards
        // so the fingerprint resolver WOULD misattribute if it ran.
        let hand: [u32; 7] = [86715, 97964, 92090, 92081, 70001, 70002, 70003];
        for (i, gid) in hand.iter().enumerate() {
            let inst = (i + 1) as u32;
            assembler.process_game_object(inst, Some(*gid), Some(1), 31, true, false, None);
        }
        assembler.update_game_state(Some(10), 1, &[(1, 20), (2, 20)], 1);

        let (rec, _, _, _) = assembler.complete_match(1, "Concede").expect("match should complete");

        // The placeholder must survive completion: both fingerprint resolvers
        // key on "Selected Deck"/empty, so this name cannot be that string.
        assert_eq!(rec.player_deck_name, PRESET_EVENT_DECK_NAME);
        assert!(!assembler.match_legitimate);
        // No draws from a lent event deck may be collected as ownership.
        assert!(assembler.collection_draws.is_empty(),
            "assigned-deck event draws must not feed the collection");
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
        assembler.start_match("match-play".to_string(), "Standard".to_string(), false);

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
        assembler_draw.start_match("match-draw".to_string(), "Standard".to_string(), false);

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
        assembler.start_match("match-dur".to_string(), "Standard".to_string(), false);

        // Manually adjust start time back by 120 seconds to simulate a 2-minute game
        assembler.match_start_time = Some(Utc::now() - chrono::Duration::seconds(120));

        let (rec, _, _, _) = assembler.complete_match(1, "Concede").expect("match should complete");
        assert!(rec.duration_seconds >= 120, "Duration should be at least 120 seconds, got {}", rec.duration_seconds);
    }

    #[test]
    fn test_opening_hand_no_mulligans() {
        let mut assembler = MatchAssembler::new();
        assembler.start_match("match-no-mul".to_string(), "Standard".to_string(), false);

        // 7 opening hand cards arrive at turn 0
        for i in 1..=7 {
            assembler.process_game_object(i, Some(100 + i), Some(1), 31, true, false, None); // Hand zone
        }

        // Turn 1 starts, active player seat 1
        assembler.update_game_state(Some(10), 1, &[(1, 20), (2, 20)], 1);

        // Turn 1 play: player casts card 1
        assembler.process_game_object(1, Some(101), Some(1), 28, true, false, None); // Battlefield

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
        assembler.start_match("match-mul".to_string(), "Standard".to_string(), false);

        // 1. Initial 7 cards dealt to Hero (inst 1..=7)
        for i in 1..=7 {
            assembler.process_game_object(i, Some(100 + i), Some(1), 31, true, false, None);
        }

        // 2. Opponent takes a mulligan (Prompt 36 for seat 2)
        assembler.handle_mulligan_decision(2, true, Some(6));

        // 3. Hero takes a mulligan (Prompt 36 for seat 1)
        assembler.handle_mulligan_decision(1, true, Some(6));

        // 4. Hero gets 7 new cards (inst 11..=17)
        for i in 11..=17 {
            assembler.process_game_object(i, Some(200 + i), Some(1), 31, true, false, None);
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
        assembler.start_match("match-achieve".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 1);

        // Instance 1 = Grp 101 (deals 15 dmg -> Haymaker Bronze)
        // Instance 2 = Grp 102 (deals 25 dmg -> Haymaker Silver + Juggernaut Bronze + Executioner + Over-Killer)
        assembler.process_game_object(1, Some(101), Some(1), 28, true, false, None);
        assembler.process_game_object(2, Some(102), Some(1), 28, true, false, None);

        // Hit 1: 15 damage to opponent (Opp life 20 -> 5)
        assembler.process_damage_event(1, 1, 2, 15, 1);
        assembler.update_game_state(Some(2), 1, &[(1, 20), (2, 5)], 1);

        // Hit 2: 25 damage to opponent (Opp life 5 -> -20, killing blow with 20 overkill)
        assembler.process_damage_event(2, 2, 2, 25, 1);
        assembler.update_game_state(Some(3), 1, &[(1, 20), (2, -20)], 1);

        let (_, _, _, impactful) = assembler.complete_match(1, "Loss_Life").expect("match should complete");

        let imp_101 = impactful.iter().find(|i| i.grp_id == 101).expect("grp 101 should exist");
        let imp_102 = impactful.iter().find(|i| i.grp_id == 102).expect("grp 102 should exist");

        assert!(imp_101.titles.iter().any(|t| t.starts_with("Haymaker")), "Card 101 should have Haymaker title");
        assert!(!imp_101.titles.iter().any(|t| t.starts_with("Juggernaut")), "Card 101 should not have Juggernaut title");

        assert!(imp_102.titles.iter().any(|t| t.starts_with("Juggernaut")), "Card 102 should have Juggernaut title");
        assert!(imp_102.titles.iter().any(|t| t.starts_with("Executioner")), "Card 102 should have Executioner title");
        assert!(imp_102.titles.iter().any(|t| t.starts_with("Over-Killer")), "Card 102 should have Over-Killer title");
    }

    #[test]
    fn test_achievement_title_scoop_inducer() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-scoop".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 4, &[(1, 20), (2, 25)], 1);

        // Hero casts a big bomb (Instance 10 -> Grp 999)
        assembler.process_game_object(10, Some(999), Some(1), 28, true, false, None);

        // Opponent immediately concedes
        let (_, _, _, impactful) = assembler.complete_match(1, "ResultReason_Concede").expect("match should complete");

        let imp_999 = impactful.iter().find(|i| i.grp_id == 999).expect("grp 999 should be in impactful cards");
        assert!(imp_999.titles.iter().any(|t| t.starts_with("Scoop Inducer")), "Card 999 should have Scoop Inducer title");
    }

    #[test]
    fn test_card_draw_engine_and_rhystic_tracker_achievement() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-draw-engine".to_string(), "Commander".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 40), (2, 40)], 1);

        // Instance 50 = Rhystic Study (Grp 12345)
        assembler.process_game_object(50, Some(12345), Some(1), 28, true, false, None);

        // Trigger draw 3 cards
        assembler.process_draw_event(50, 3);
        // Trigger draw 3 more cards (total 6 -> Rhystic Tracker Bronze)
        assembler.process_draw_event(50, 3);

        let (_, _, _, impactful) = assembler.complete_match(1, "Loss_Life").expect("match should complete");
        let rhystic_entry = impactful.iter().find(|i| i.grp_id == 12345).expect("Rhystic Study should be impactful");

        assert_eq!(rhystic_entry.cards_drawn, 6, "Rhystic Study should have 6 cards drawn");
        assert!(rhystic_entry.titles.iter().any(|t| t == "Rhystic Tracker (Bronze)"), "Should award Rhystic Tracker (Bronze) badge");
    }

    #[test]
    fn test_aura_ability_parent_draw_attribution() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-feather-draw".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 1, "teamId": 1 },
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 2);

        // Instance 324 = Feather of Flight (Grp 91549), cast by Hero (seat 2)
        assembler.process_game_object(324, Some(91549), Some(2), 28, true, false, None);

        // Ability instance 327 created with parent 324
        assembler.register_ability_parent(327, 324);

        // ZoneTransfer Draw event triggered with affectorId 327 (the ability instance)
        assembler.process_draw_event(327, 1);

        let (_, _, _, impactful) = assembler.complete_match(2, "Loss_Life").expect("match should complete");
        let feather_entry = impactful.iter().find(|i| i.grp_id == 91549).expect("Feather of Flight should be impactful");

        assert_eq!(feather_entry.cards_drawn, 1, "Feather of Flight should have 1 card drawn");
        assert_eq!(feather_entry.seat_id, 2, "Feather of Flight seat should be hero seat 2");
    }

    #[test]
    fn test_abilities_do_not_generate_play_events() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-abilities".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 1);

        // Ability instance 999 (e.g. Equip ability id 1319) is placed on stack (zone 27) with is_card = false
        assembler.process_game_object(999, Some(1319), Some(1), 27, false, false, None);

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match should complete");
        let play_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "play").collect();

        assert_eq!(play_events.len(), 0, "Abilities must not generate 'play' turn events");
    }

    #[test]
    fn test_non_brawl_deck_clears_commander_id() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());

        // Match 1: Brawl deck with Commander (grp 91719)
        assembler.set_deck("Hobbits Brawl".to_string(), Some("deck-brawl".to_string()), Some(91719), vec![101, 102]);
        assembler.start_match("m1".to_string(), "Brawl".to_string(), false);
        let (m1, _, _, _) = assembler.complete_match(1, "Loss_Life").expect("m1 complete");
        assert_eq!(m1.player_commander_id, Some(91719), "Brawl match should have commander");

        // Match 2: Standard deck without Commander
        assembler.set_deck("Aura Farming (STD)".to_string(), Some("deck-std".to_string()), None, vec![201, 202]);
        assembler.start_match("m2".to_string(), "Standard".to_string(), false);
        let (m2, _, _, _) = assembler.complete_match(1, "Loss_Life").expect("m2 complete");
        assert_eq!(m2.player_commander_id, None, "Standard match must NOT inherit commander from previous Brawl match");
    }

    #[test]
    fn test_executioner_multi_attacker_individual_thresholds() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("m-exec-multi".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 5, &[(1, 20), (2, 17)], 1);

        // Instance 10 = Optimistic Scavenger (Grp 501, 10 DMG)
        // Instance 11 = Spellbook Vendor (Grp 502, 12 DMG)
        assembler.process_game_object(10, Some(501), Some(1), 28, true, false, None);
        assembler.process_game_object(11, Some(502), Some(1), 28, true, false, None);

        // Both swing in for 10 DMG and 12 DMG (total 22 DMG vs 17 Life)
        assembler.process_damage_event(10, 10, 2, 10, 1);
        assembler.process_damage_event(11, 11, 2, 12, 1);
        assembler.update_game_state(Some(2), 5, &[(1, 20), (2, 0)], 1);

        let (_, _, _, impactful) = assembler.complete_match(1, "Loss_Life").expect("match complete");

        let imp_scavenger = impactful.iter().find(|i| i.grp_id == 501).expect("scavenger exists");
        let imp_vendor = impactful.iter().find(|i| i.grp_id == 502).expect("vendor exists");

        // Both individually dealt 10-14 damage, so both should be Silver Executioner (NOT Gold)
        assert!(imp_scavenger.titles.iter().any(|t| t == "Executioner (Silver)"), "Scavenger dealt 10 DMG -> Executioner (Silver)");
        assert!(imp_vendor.titles.iter().any(|t| t == "Executioner (Silver)"), "Spellbook Vendor dealt 12 DMG -> Executioner (Silver)");
        assert!(!imp_vendor.titles.iter().any(|t| t.contains("Gold")), "Spellbook Vendor must NOT receive Gold Executioner");
    }

    #[test]
    fn test_overkiller_individual_thresholds() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("m-overkiller".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Opponent at 2 life before combat
        assembler.update_game_state(Some(1), 6, &[(1, 20), (2, 2)], 1);

        // Instance 20 = Big Creature (Grp 601, 18 DMG -> 18 - 2 = 16 excess -> Gold Over-Killer)
        // Instance 21 = Med Creature (Grp 602, 9 DMG -> 9 - 2 = 7 excess -> Bronze Over-Killer)
        // Instance 22 = Small Chump (Grp 603, 3 DMG -> 3 - 2 = 1 excess -> No Over-Killer)
        assembler.process_game_object(20, Some(601), Some(1), 28, true, false, None);
        assembler.process_game_object(21, Some(602), Some(1), 28, true, false, None);
        assembler.process_game_object(22, Some(603), Some(1), 28, true, false, None);

        assembler.process_damage_event(20, 20, 2, 18, 1);
        assembler.process_damage_event(21, 21, 2, 9, 1);
        assembler.process_damage_event(22, 22, 2, 3, 1);
        assembler.update_game_state(Some(2), 6, &[(1, 20), (2, -28)], 1);

        let (_, _, _, impactful) = assembler.complete_match(1, "Loss_Life").expect("match complete");

        let imp_big = impactful.iter().find(|i| i.grp_id == 601).expect("big exists");
        let imp_med = impactful.iter().find(|i| i.grp_id == 602).expect("med exists");
        let imp_small = impactful.iter().find(|i| i.grp_id == 603).expect("small exists");

        assert!(imp_big.titles.iter().any(|t| t == "Over-Killer (Gold)"), "Big creature 18-2=16 excess -> Over-Killer (Gold)");
        assert!(imp_med.titles.iter().any(|t| t == "Over-Killer (Bronze)"), "Med creature 9-2=7 excess -> Over-Killer (Bronze)");
        assert!(!imp_small.titles.iter().any(|t| t.starts_with("Over-Killer")), "Small creature 3-2=1 excess must NOT receive Over-Killer");
    }

    #[test]
    fn test_token_creation_events() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-tokens".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);

        // Scute Swarm triggers and creates 3 insect tokens (grp 70000)
        for i in 100..=102 {
            let res = assembler.process_game_object(i, Some(70000), Some(1), 28, true, true, Some("Insect Token".to_string()));
            assert_eq!(res, Some((70000, 1, "token".to_string())));
        }

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match complete");
        let token_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "token").collect();
        assert_eq!(token_events.len(), 3, "Should record 3 token creation events");
        assert_eq!(assembler.token_instance_names.get(&100), Some(&"Insect Token".to_string()));
    }

    #[test]
    fn test_counter_event_and_hardened_ozolithic_achievements() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-counters".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 2, &[(1, 20), (2, 20)], 1);

        // Instance 548 = Voice of the Blessed (Grp 78901)
        assembler.process_game_object(548, Some(78901), Some(1), 28, true, false, None);

        // Add 7 +1/+1 counters -> Hardened (Bronze)
        for _ in 0..7 {
            assembler.process_counter_event(548, 1, 1);
        }

        // Add 8 more +1/+1 counters (total 15) -> Ozolithic! (Silver) + Hardened (Silver)
        assembler.process_counter_event(548, 1, 8);

        // Add 5 more +1/+1 counters (total 20) -> Ozolithic! (Gold) + Hardened (Gold)
        assembler.process_counter_event(548, 1, 5);

        let (_, _, turn_events, impactful) = assembler.complete_match(1, "Concede").expect("match complete");

        let counter_events: Vec<_> = turn_events.iter().filter(|e| e.event_type.starts_with("counter:")).collect();
        assert_eq!(counter_events.len(), 9, "Should have 9 counter events");
        assert_eq!(counter_events[0].grp_id, 78901);

        let voice_entry = impactful.iter().find(|i| i.grp_id == 78901).expect("Voice should be impactful");
        assert_eq!(voice_entry.counters_added, 20);
        assert!(voice_entry.titles.iter().any(|t| t == "Hardened (Gold)"), "Should award Hardened (Gold)");
        assert!(voice_entry.titles.iter().any(|t| t == "Ozolithic! (Gold)"), "Should award Ozolithic! (Gold)");
    }

    #[test]
    fn test_excalibur_charge_counters_do_not_award_ozolithic() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-excalibur".to_string(), "Brawl".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 2, &[(1, 20), (2, 20)], 1);

        // Instance 600 = Excalibur II (Grp 99123)
        assembler.process_game_object(600, Some(99123), Some(1), 28, true, false, None);

        // Excalibur gains 15 charge counters (counter_type = 6, NOT +1/+1 counters)
        assembler.process_counter_event(600, 6, 15);

        // Excalibur equips to creature and gives +15/+15 toughness buff
        assembler.process_toughness_buff(600, 601, 15);

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("match complete");
        let excalibur_entry = impactful.iter().find(|i| i.grp_id == 99123).expect("Excalibur should be impactful");

        assert_eq!(excalibur_entry.counters_added, 0, "Charge counters must not be counted as +1/+1 counters");
        assert!(!excalibur_entry.titles.iter().any(|t| t.starts_with("Ozolithic!")), "Excalibur must NOT receive Ozolithic!");
        assert!(excalibur_entry.titles.iter().any(|t| t == "Hardened (Silver)"), "Excalibur MUST receive Hardened (Silver) for +15 toughness increase");
    }

    #[test]
    fn test_life_events_persisted_to_turn_events() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-life".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 1);
        // Life gain on Turn 2
        assembler.update_game_state(Some(2), 2, &[(1, 21), (2, 19)], 1);

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match complete");
        let life_events: Vec<_> = turn_events.iter().filter(|e| e.event_type.starts_with("life:")).collect();

        assert_eq!(life_events.len(), 2, "Should record 2 life change events");
        assert!(life_events.iter().any(|e| e.seat_id == 1 && e.event_type == "life:1:21"));
        assert!(life_events.iter().any(|e| e.seat_id == 2 && e.event_type == "life:-1:19"));
    }

    #[test]
    fn test_board_wipe_and_creature_death_not_repeated_across_rounds() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-boardwipe".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Turn 3: Hero plays 5 creatures
        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);
        for inst in 101..=105 {
            assembler.process_game_object(inst, Some(inst * 10), Some(1), 28, true, false, None);
        }

        // Turn 4: Opponent casts Wrath of God -> 5 creatures move from 28 to 33 (Graveyard)
        assembler.update_game_state(Some(2), 4, &[(1, 20), (2, 20)], 2);
        for inst in 101..=105 {
            let res = assembler.process_game_object(inst, Some(inst * 10), Some(1), 33, true, false, None);
            assert_eq!(res, Some((inst * 10, 1, "dies".to_string())));
        }

        // Turn 5: New turn begins, game state messages continue
        assembler.update_game_state(Some(3), 5, &[(1, 20), (2, 20)], 1);
        for inst in 101..=105 {
            // Processing graveyard instances on turn 5 must NOT re-emit 'dies'
            let res = assembler.process_game_object(inst, Some(inst * 10), Some(1), 33, true, false, None);
            assert_eq!(res, None, "Instance already died; must not emit duplicate dies event on turn 5");
        }

        // Turn 6: Next turn continues
        assembler.update_game_state(Some(4), 6, &[(1, 20), (2, 20)], 2);
        for inst in 101..=105 {
            let res = assembler.process_game_object(inst, Some(inst * 10), Some(1), 33, true, false, None);
            assert_eq!(res, None, "Instance already died; must not emit duplicate dies event on turn 6");
        }

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match complete");
        let dies_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "dies").collect();

        assert_eq!(dies_events.len(), 5, "Exactly 5 dies events must be recorded in total");
        for d in dies_events {
            assert_eq!(d.turn_number, 4, "All deaths must be attributed to Turn 4");
        }
    }

    #[test]
    fn test_damage_annotation_deduplication() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-dmg-dedup".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 2, &[(1, 20), (2, 20)], 2);
        // Opponent plays Phoenix Chick (Grp 701, Inst 552)
        assembler.process_game_object(552, Some(701), Some(2), 28, true, false, None);

        // Annotation ID 134 sends 1 combat damage to Player (Seat 1)
        assembler.process_damage_event(134, 552, 1, 1, 1);
        // Duplicate message containing the same annotation ID 134
        assembler.process_damage_event(134, 552, 1, 1, 1);

        assert_eq!(assembler.damage_feed_events.len(), 1, "Duplicate damage annotation must be skipped");
        assert_eq!(assembler.damage_feed_events[0].0.amount, 1);
    }

    #[test]
    fn test_lethal_damage_deletion_records_dies() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-lethal".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);
        // Hero plays Lunarch Veteran (Grp 78354, Inst 547)
        assembler.process_game_object(547, Some(78354), Some(1), 28, true, false, None);

        // Opponent casts Cathartic Pyre dealing 3 damage to Lunarch Veteran on Turn 4
        assembler.update_game_state(Some(2), 4, &[(1, 20), (2, 20)], 2);
        assembler.process_damage_event(217, 560, 547, 3, 2);

        // Arena deletes instance 547 from battlefield
        assembler.handle_deleted_instances(&[547]);

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match complete");
        let dies_event = turn_events.iter().find(|e| e.event_type == "dies").expect("Must record dies event");

        assert_eq!(dies_event.grp_id, 78354);
        assert_eq!(dies_event.turn_number, 4);
        assert_eq!(dies_event.seat_id, 1);
    }

    #[test]
    fn test_self_damage_filtered_from_combat_events() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-self-dmg".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 5, &[(1, 25), (2, 25)], 1);
        // Hero controls Talisman of Indulgence (Grp 87235, Inst 711)
        assembler.process_game_object(711, Some(87235), Some(1), 28, true, false, None);

        // Talisman deals 1 damage to its controller (Seat 1)
        assembler.process_damage_event(100, 711, 1, 1, 1);

        // Verified: Self-damage must NOT be pushed into damage_feed_events or turn_events
        assert_eq!(assembler.damage_feed_events.len(), 0, "Self damage must not appear in damage feed");
        assert_eq!(assembler.turn_events.iter().filter(|e| e.event_type.starts_with("damage:")).count(), 0, "Self damage must not appear as damage turn event");
        assert_eq!(assembler.turn_damage_to_seat.get(&1).copied().unwrap_or(0), 0, "Self damage must not count towards lethal hits");
    }

    #[test]
    fn test_creature_damage_target_grp_id_resolved() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-creature-tgt".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 8, &[(1, 20), (2, 20)], 1);
        // Opponent controls Sorin of House Markov (Grp 90816, Inst 948)
        assembler.process_game_object(948, Some(90816), Some(2), 28, true, false, None);
        // Hero controls Chandra (Grp 75695, Inst 952)
        assembler.process_game_object(952, Some(75695), Some(1), 28, true, false, None);

        // Chandra deals 4 direct damage to Sorin (Inst 948)
        assembler.process_damage_event(200, 952, 948, 4, 2);

        let dmg_event = assembler.turn_events.iter().find(|e| e.event_type.starts_with("damage:")).expect("Damage event exists");
        assert_eq!(dmg_event.event_type, "damage:spell:4:948:90816", "Event type must encode target grp_id");
    }

    #[test]
    fn test_life_source_attribution() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("match-life-source".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);
        // Hero plays Authority of the Consuls (Grp 87040, Inst 572)
        assembler.process_game_object(572, Some(87040), Some(1), 28, true, false, None);

        // Opponent enters a creature -> Authority modifies Hero's life by +1
        assembler.process_life_modification(572, 1, 1);
        assembler.update_game_state(Some(2), 3, &[(1, 21), (2, 20)], 1);

        assert_eq!(assembler.life_events.len(), 1);
        assert_eq!(assembler.life_events[0].4, Some(87040), "Source card grp_id should be Authority of the Consuls");

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("match complete");
        let life_event = turn_events.iter().find(|e| e.event_type.starts_with("life:")).expect("Life event");
        assert_eq!(life_event.grp_id, 87040);
        assert_eq!(life_event.event_type, "life:1:21:87040");
    }

    #[test]
    fn test_single_mulligan_records_exactly_seven_cards_mulliganed() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("m-mull-1".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Turn 0: Deal 7 initial cards to player hand (Zone 31)
        for i in 1..=7 {
            assembler.process_game_object(i, Some(100 + i), Some(1), 31, true, false, None);
        }

        // Hero takes 1 mulligan
        assembler.handle_mulligan_decision(1, true, None);

        // Arena sends diffDeletedInstanceIds for those 7 cards
        assembler.handle_deleted_instances(&[1, 2, 3, 4, 5, 6, 7]);

        // Draw new 7-card hand
        for i in 8..=14 {
            assembler.process_game_object(i, Some(200 + i), Some(1), 31, true, false, None);
        }

        // Hero keeps hand
        assembler.handle_mulligan_decision(1, false, None);
        // Bottom 1 card
        assembler.handle_deleted_instances(&[14]);

        // Turn 1 begins
        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 1);

        let (m, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("complete");
        assert_eq!(m.player_mulligans, Some(1), "Player mulligans should be exactly 1");

        let mull_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "mulligan" && e.seat_id == 1).collect();
        let draw_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "draw" && e.seat_id == 1).collect();
        let bottom_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "bottom" && e.seat_id == 1).collect();

        assert_eq!(mull_events.len(), 7, "Exactly 7 cards should be marked as mulliganed");
        assert_eq!(bottom_events.len(), 1, "Exactly 1 card should be marked as bottomed");
        assert_eq!(draw_events.len(), 6, "Kept hand contains 6 drawn cards");
    }

    #[test]
    fn test_token_not_repeated_across_turns() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("m-token-repeat".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Turn 3: Overlord creates Land Token (Inst 880, Grp 999)
        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);
        let res1 = assembler.process_game_object(880, Some(999), Some(1), 28, false, true, Some("Forest Token".to_string()));
        assert_eq!(res1, Some((999, 1, "token".to_string())));

        // Turn 4: Game state continues on opponent turn
        assembler.update_game_state(Some(2), 4, &[(1, 20), (2, 20)], 2);
        let res2 = assembler.process_game_object(880, Some(999), Some(1), 28, false, true, Some("Forest Token".to_string()));
        assert_eq!(res2, None, "Existing token must NOT re-emit on turn 4");

        // Turn 5: Next round continues
        assembler.update_game_state(Some(3), 5, &[(1, 20), (2, 20)], 1);
        let res3 = assembler.process_game_object(880, Some(999), Some(1), 28, false, true, Some("Forest Token".to_string()));
        assert_eq!(res3, None, "Existing token must NOT re-emit on turn 5");

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("complete");
        let token_events: Vec<_> = turn_events.iter().filter(|e| e.event_type == "token").collect();
        assert_eq!(token_events.len(), 1, "Exactly 1 token event must be recorded overall");
    }

    #[test]
    fn test_counter_removed_negative_amount() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_user_id("hero".to_string());
        assembler.start_match("m-counter-rem".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);
        assembler.process_game_object(500, Some(81886), Some(1), 28, true, false, None);

        // Counter added: 4 time counters
        assembler.process_counter_event(500, 2, 4);
        // Counter removed on turn 5: -1
        assembler.update_game_state(Some(2), 5, &[(1, 20), (2, 20)], 1);
        assembler.process_counter_event(500, 2, -1);

        let (_, _, turn_events, _) = assembler.complete_match(1, "Concede").expect("complete");
        let c_events: Vec<_> = turn_events.iter().filter(|e| e.event_type.starts_with("counter:")).collect();
        assert_eq!(c_events.len(), 2);
        assert_eq!(c_events[0].event_type, "counter:counter:4");
        assert_eq!(c_events[1].event_type, "counter:counter:-1");
    }

    #[test]
    fn test_opponent_name_resolved_when_hero_is_seat_2() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("6E43B5C35F1E3AA7".to_string(), "Balthazzar".to_string());
        assembler.start_match("m-seat2-opp".to_string(), "Brawl".to_string(), false);

        // Opponent is Seat 1, Hero is Seat 2 (in order received from Arena)
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "ISLP2MPXWJH5HCW2ZJSQTWANLQ", "playerName": "ItsAviTime", "systemSeatId": 1, "teamId": 1 },
            { "userId": "6E43B5C35F1E3AA7", "playerName": "Balthazzar", "systemSeatId": 2, "teamId": 2 }
        ]));

        assert_eq!(assembler.player_seat_id, 2, "Hero seat should be 2");
        assert_eq!(
            assembler.active_match.as_ref().and_then(|m| m.opponent_name.as_deref()),
            Some("ItsAviTime"),
            "Opponent name must be ItsAviTime even when Hero is Seat 2"
        );
    }

    #[test]
    fn test_achievement_negator_tales_end_countering_the_great_henge() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-negator".to_string(), "Brawl".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 1, "teamId": 1 },
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 13, &[(1, 20), (2, 20)], 1);

        // Opponent casts The Great Henge (grp 70308, instance 1112)
        assembler.process_game_object(1112, Some(70308), Some(1), 27, true, false, None);

        // Hero casts Tale's End (grp 69862, instance 1115)
        assembler.process_game_object(1115, Some(69862), Some(2), 27, true, false, None);

        // Set Great Henge CMC to 9
        assembler.set_card_cmc(70308, 9);

        // Tale's End counters The Great Henge
        assembler.process_counterspell_event(1115, 1112, None);

        let (_, _, _, impactful) = assembler.complete_match(2, "Concede").expect("complete");
        let tales_end = impactful.iter().find(|i| i.grp_id == 69862).expect("Tale's End impactful record");
        assert!(tales_end.titles.contains(&"Negator (Silver)".to_string()), "Tale's End must receive Negator (Silver) for countering CMC 9");
    }

    #[test]
    fn test_achievement_vampiric_life_drain() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-vamp".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 3, &[(1, 20), (2, 20)], 1);
        // Blood Artist on battlefield
        assembler.process_game_object(100, Some(55555), Some(1), 28, true, false, None);

        // Opponent loses 22 life across match from non-combat drain
        assembler.process_life_modification(100, 2, -22);

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let artist = impactful.iter().find(|i| i.grp_id == 55555).expect("Blood Artist impactful");
        assert!(artist.titles.contains(&"Vampiric (Silver)".to_string()), "Blood Artist must earn Vampiric (Silver) for 22 drained life");
    }

    #[test]
    fn test_achievement_sweeper_and_cataclysm() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-sweeper".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 5, &[(1, 20), (2, 20)], 1);

        // Wrath of God on stack
        assembler.process_game_object(200, Some(11111), Some(1), 27, true, false, None);

        // 14 opponent creatures + 4 hero creatures on field
        let mut affected = Vec::new();
        for i in 1..=14 {
            assembler.process_game_object(300 + i, Some(900 + i), Some(2), 28, true, false, None);
            affected.push(300 + i);
        }
        for i in 1..=4 {
            assembler.process_game_object(400 + i, Some(800 + i), Some(1), 28, true, false, None);
            affected.push(400 + i);
        }

        // Wrath destroys all 18 permanents (14 opp -> Sweeper Silver, 18 total -> Cataclysm Silver)
        assembler.process_zone_transfer_event(200, &affected, "Destroy", 28, 33);

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let wrath = impactful.iter().find(|i| i.grp_id == 11111).expect("Wrath record");
        assert!(wrath.titles.contains(&"Sweeper (Silver)".to_string()), "Wrath must earn Sweeper (Silver)");
        assert!(wrath.titles.contains(&"Cataclysm (Silver)".to_string()), "Wrath must earn Cataclysm (Silver)");
    }

    #[test]
    fn test_achievement_blinkmaster_and_immortal() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-blink".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 2, &[(1, 20), (2, 20)], 1);

        // Yorion (grp 77777, inst 50) flickers 5 times (28 -> 29 -> 28)
        for turn in 3..=7 {
            assembler.update_game_state(Some(turn as u64), turn, &[(1, 20), (2, 20)], 1);
            assembler.process_game_object(50, Some(77777), Some(1), 28, true, false, None);
            assembler.process_game_object(50, Some(77777), Some(1), 29, true, false, None);
            assembler.process_game_object(50, Some(77777), Some(1), 28, true, false, None);
        }

        // Kroxa (grp 88888, inst 60) returns from graveyard 3 times (33 -> 28)
        for turn in 8..=10 {
            assembler.update_game_state(Some(turn as u64), turn, &[(1, 20), (2, 20)], 1);
            assembler.process_game_object(60, Some(88888), Some(1), 33, true, false, None);
            assembler.process_game_object(60, Some(88888), Some(1), 28, true, false, None);
        }

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let yorion = impactful.iter().find(|i| i.grp_id == 77777).expect("Yorion");
        assert!(yorion.titles.contains(&"Blinkmaster (Silver)".to_string()), "Yorion must earn Blinkmaster (Silver) for 5 flickers");

        let kroxa = impactful.iter().find(|i| i.grp_id == 88888).expect("Kroxa");
        assert!(kroxa.titles.contains(&"Immortal (Bronze)".to_string()), "Kroxa must earn Immortal (Bronze) for 3 reanimations");
    }

    #[test]
    fn test_flicker_limbo_and_mill_events() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-flicker-mill".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 2, &[(1, 20), (2, 20)], 1);

        // Aang (grp 97481, inst 70) flickers through Limbo (30) 3 times: 28 -> 30 -> 28
        for turn in 3..=5 {
            assembler.update_game_state(Some(turn as u64), turn, &[(1, 20), (2, 20)], 1);
            assembler.process_game_object(70, Some(97481), Some(1), 28, true, false, None);
            assembler.process_game_object(70, Some(97481), Some(1), 30, true, false, None);
            let res = assembler.process_game_object(70, Some(97481), Some(1), 28, true, false, None);
            assert_eq!(res, Some((97481, 1, "blink".to_string())), "Returning from limbo must emit blink");
        }

        // Opponent casts Terisian Mindbreaker and mills 10 cards across 2 batch transfers on Turn 6
        assembler.update_game_state(Some(6), 6, &[(1, 20), (2, 20)], 2);
        // Terisian Mindbreaker is on battlefield
        assembler.process_game_object(963, Some(82567), Some(2), 28, true, false, None);
        // Zone transfer annotations for mill
        assembler.process_zone_transfer_event(963, &[101, 102, 103, 104, 105], "Mill", 36, 37);
        assembler.process_zone_transfer_event(963, &[106, 107, 108, 109, 110], "Mill", 36, 37);

        let (_, _, turn_events, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let aang = impactful.iter().find(|i| i.grp_id == 97481).expect("Aang");
        assert!(aang.titles.contains(&"Blinkmaster (Bronze)".to_string()), "Aang must earn Blinkmaster (Bronze) through Limbo flicker");

        let mill_events: Vec<_> = turn_events.iter().filter(|e| e.event_type.starts_with("mill:")).collect();
        assert_eq!(mill_events.len(), 1, "Consecutive mill events from same source on same turn must consolidate");
        assert_eq!(mill_events[0].event_type, "mill:10", "10 total cards milled");
        assert_eq!(mill_events[0].grp_id, 82567, "Attributed to Terisian Mindbreaker");
        assert_eq!(mill_events[0].seat_id, 2, "Attributed to opponent");
    }

    #[test]
    fn test_achievement_swarmer_and_mana_dynamo() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-swarm".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 4, &[(1, 20), (2, 20)], 1);

        // Scute Swarm played (grp 33333, inst 70)
        assembler.process_game_object(70, Some(33333), Some(1), 27, true, false, None);
        assembler.process_game_object(70, Some(33333), Some(1), 28, true, false, None);

        // Spawns 25 Insect tokens
        for i in 1..=25 {
            assembler.register_ability_parent(1000 + i, 70);
            assembler.process_game_object(1000 + i, Some(99999), Some(1), 28, false, true, Some("Insect".to_string()));
        }

        // Caged Sun (grp 44444, inst 80) generates 10 mana in a turn
        assembler.process_game_object(80, Some(44444), Some(1), 28, true, false, None);
        assembler.process_mana_paid_event(80, 10);

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let scute = impactful.iter().find(|i| i.grp_id == 33333).expect("Scute Swarm");
        assert!(scute.titles.contains(&"Swarmer (Bronze)".to_string()), "Scute Swarm must earn Swarmer (Bronze) for 25 tokens");

        let caged = impactful.iter().find(|i| i.grp_id == 44444).expect("Caged Sun");
        assert!(caged.titles.contains(&"Mana Dynamo (Silver)".to_string()), "Caged Sun must earn Mana Dynamo (Silver) for 10 mana burst");
    }

    #[test]
    fn test_land_not_awarded_cat_burglar_or_tax_collector() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-land-test".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 1, &[(1, 20), (2, 20)], 1);

        // Hero plays Snow-Covered Island (grp 8888, inst 10)
        assembler.process_game_object(10, Some(8888), Some(1), 28, true, false, None);

        // Turn 2: Opponent's turn
        assembler.update_game_state(Some(2), 2, &[(1, 20), (2, 20)], 2);

        // Opponent casts their own spells (inst 20, 21, 22)
        assembler.process_game_object(20, Some(7771), Some(2), 27, true, false, None);
        assembler.process_game_object(21, Some(7772), Some(2), 27, true, false, None);
        assembler.process_game_object(22, Some(7773), Some(2), 27, true, false, None);

        // Opponent pays mana
        assembler.process_mana_paid_event(20, 3);
        assembler.process_mana_paid_event(21, 4);

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        if let Some(island) = impactful.iter().find(|i| i.grp_id == 8888) {
            assert!(!island.titles.iter().any(|t| t.starts_with("Cat Burglar")), "Island must NOT receive Cat Burglar");
            assert!(!island.titles.iter().any(|t| t.starts_with("Tax Collector")), "Island must NOT receive Tax Collector");
        }
    }

    #[test]
    fn test_multiple_basic_lands_do_not_earn_mana_dynamo() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-forest-test".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 5, &[(1, 20), (2, 20)], 1);

        // Hero plays 5 separate Snow-Covered Forests (same grp_id 74213, different instance IDs 101..=105)
        for inst in 101..=105 {
            assembler.process_game_object(inst, Some(74213), Some(1), 28, true, false, None);
        }

        // In turn 5, each forest taps for 1 mana (total 5 mana paid by hero across 5 different instances)
        for inst in 101..=105 {
            assembler.process_mana_paid_event(inst, 1);
        }

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        if let Some(forest) = impactful.iter().find(|i| i.grp_id == 74213) {
            assert!(!forest.titles.iter().any(|t| t.starts_with("Mana Dynamo")), "5 basic lands generating 1 mana each must NOT award Mana Dynamo");
        }
    }

    #[test]
    fn test_single_land_burst_mana_earns_mana_dynamo() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-nykthos-test".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 5, &[(1, 20), (2, 20)], 1);

        // Hero plays Nykthos, Shrine to Nyx (grp 45678, inst 50)
        assembler.process_game_object(50, Some(45678), Some(1), 28, true, false, None);

        // Nykthos produces 8 mana in turn 5 from its single instance
        assembler.process_mana_paid_event(50, 8);

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let nykthos = impactful.iter().find(|i| i.grp_id == 45678).expect("Nykthos must be impactful");
        assert!(nykthos.titles.contains(&"Mana Dynamo (Silver)".to_string()), "Single land generating 8 burst mana must earn Mana Dynamo (Silver)");
    }

    #[test]
    fn test_ranger_class_single_token_does_not_earn_swarmer_from_unlinked_tokens() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-ranger-test".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        // Turn 2: Cast Ranger Class (grp 77519, inst 60)
        assembler.update_game_state(Some(1), 2, &[(1, 20), (2, 20)], 1);
        assembler.process_game_object(60, Some(77519), Some(1), 27, true, false, None);
        assembler.process_game_object(60, Some(77519), Some(1), 28, true, false, None);

        // 1 Wolf token spawned by Ranger Class (inst 100)
        assembler.register_ability_parent(100, 60);
        assembler.process_game_object(100, Some(99001), Some(1), 28, false, true, Some("Wolf".to_string()));

        // Turn 3: 25 unlinked tokens enter the battlefield (no link to Ranger Class)
        assembler.update_game_state(Some(2), 3, &[(1, 20), (2, 20)], 1);
        for i in 1..=25 {
            assembler.process_game_object(200 + i, Some(99002), Some(1), 28, false, true, Some("Elemental".to_string()));
        }

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        if let Some(ranger) = impactful.iter().find(|i| i.grp_id == 77519) {
            assert!(!ranger.titles.iter().any(|t| t.starts_with("Swarmer")), "Ranger Class must NOT receive Swarmer from unlinked tokens");
        }
    }

    #[test]
    fn test_combat_damage_does_not_award_vampiric_or_duplicate_life_event() {
        let mut assembler = MatchAssembler::new();
        assembler.set_player_info("hero_id".to_string(), "Hero".to_string());
        assembler.start_match("m-combat-vamp".to_string(), "Standard".to_string(), false);
        assembler.update_reserved_players(&serde_json::json!([
            { "userId": "hero_id", "playerName": "Hero", "systemSeatId": 1, "teamId": 1 },
            { "userId": "opp_id", "playerName": "Opponent", "systemSeatId": 2, "teamId": 2 }
        ]));

        assembler.update_game_state(Some(1), 6, &[(1, 20), (2, 20)], 1);

        // Hero creatures on battlefield:
        // 1. Stoic Sphinx (grp 90417, inst 10)
        // 2. The Lord of the Eagles (grp 103419, inst 20)
        // 3. Cemetery Illuminator (grp 78836, inst 30)
        // 4. Spectral Sailor (grp 93877, inst 40)
        assembler.process_game_object(10, Some(90417), Some(1), 28, true, false, None);
        assembler.process_game_object(20, Some(103419), Some(1), 28, true, false, None);
        assembler.process_game_object(30, Some(78836), Some(1), 28, true, false, None);
        assembler.process_game_object(40, Some(93877), Some(1), 28, true, false, None);

        // Turn 6 Combat: 4 creatures deal 5 + 8 + 2 + 1 = 16 combat damage to Seat 2 (Opponent)
        assembler.process_damage_event(1, 10, 2, 5, 1);
        assembler.process_damage_event(2, 20, 2, 8, 1);
        assembler.process_damage_event(3, 30, 2, 2, 1);
        assembler.process_damage_event(4, 40, 2, 1, 1);

        // MTGA emits ModifiedLife (-16 life on seat 2, affectorId = 10 (Stoic Sphinx))
        assembler.process_life_modification(10, 2, -16);

        // Game state life update: Opponent life goes 20 -> 4
        assembler.update_game_state(Some(2), 6, &[(1, 20), (2, 4)], 1);

        // Verify turn events has damage events and NO redundant life:-16:4 event
        let life_events_on_turn_6: Vec<_> = assembler.turn_events.iter()
            .filter(|e| e.turn_number == 6 && e.event_type.starts_with("life:"))
            .collect();
        assert_eq!(life_events_on_turn_6.len(), 0, "No duplicate life event should be recorded when life decrease was caused by combat damage");

        let (_, _, _, impactful) = assembler.complete_match(1, "Concede").expect("complete");
        let sphinx = impactful.iter().find(|i| i.grp_id == 90417).expect("Stoic Sphinx impactful");
        assert!(!sphinx.titles.iter().any(|t| t.starts_with("Vampiric")), "Stoic Sphinx must NOT receive Vampiric from combat damage");
        assert_eq!(sphinx.damage_combat, 5);
    }
}
