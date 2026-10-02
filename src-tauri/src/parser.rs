use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthPayload {
    #[serde(rename = "clientId")]
    pub client_id: Option<String>,
    #[serde(rename = "screenName")]
    pub screen_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameStateStep {
    pub msg_id: Option<u64>,
    pub turn_number: u32,
    pub active_seat: u32,
    pub objects: Vec<(u32, Option<u32>, Option<u32>, u32, bool, bool, Option<String>)>, // (inst_id, grp_id, owner_seat, zone_id, is_card, is_token, token_name)
    pub diff_deleted_ids: Vec<u32>,
    pub ability_associations: Vec<(u32, u32)>,
    pub object_id_changes: Vec<(u32, u32)>, // (orig_id, new_id)
    pub damage_events: Vec<(u32, u32, u32, i32, u32)>, // (ann_id, affector_id, target_id, amount, dtype)
    pub counter_events: Vec<(u32, u32, i32)>, // (target_instance_id, counter_type, amount)
    pub life_by_seat: Vec<(u32, i32)>,
    pub life_modifications: Vec<(u32, u32, i32)>, // (affector_id, target_seat, delta)
    pub draw_events: Vec<(u32, u32, u32)>, // (affector_id, zone_dest, count)
    pub mulligan_events: Vec<(u32, bool, Option<u32>)>, // (seat_id, is_mulligan, num_cards)
    pub counter_spell_events: Vec<(u32, u32)>, // (affector_id, target_instance_id)
    pub zone_transfer_events: Vec<(u32, Vec<u32>, String, u32, u32)>, // (affector_id, affected_ids, category, zone_src, zone_dest)
    pub mana_paid_events: Vec<(u32, u32)>, // (affector_id, count)
    pub creature_instance_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PlayerEconomyRecord {
    pub gold: u32,
    pub gems: u32,
    pub vault_progress_tenths: u32,
    pub wc_track_pos: u32,
    pub wc_common: u32,
    pub wc_uncommon: u32,
    pub wc_rare: u32,
    pub wc_mythic: u32,
    pub draft_tokens: u32,
    pub jump_in_tokens: u32,
    pub golden_pack_progress: u32,
    pub mastery_orbs: std::collections::HashMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct BoosterOpeningRecord {
    pub pack_id: Option<String>,
    pub cards_added: Vec<u32>,
    pub wildcards: std::collections::HashMap<String, u32>,
    pub vault_progress_delta: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct RawQuestData {
    pub quest_id: String,
    pub loc_key: String,
    pub goal: u32,
    pub starting_progress: u32,
    pub ending_progress: u32,
    pub can_swap: bool,
    pub reward_gold: u32,
    pub reward_xp: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlayerRankRecord {
    pub season_ordinal: i64,
    pub constructed_tier: String,    // "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Mythic"
    pub constructed_level: i32,      // 4, 3, 2, 1
    pub constructed_step: i32,       // 0 to 6
    pub constructed_wins: i32,
    pub constructed_losses: i32,
    pub limited_tier: String,
    pub limited_level: i32,
    pub limited_step: i32,
    pub limited_wins: i32,
    pub limited_losses: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SeasonDetailsRecord {
    pub season_ordinal: i64,
    pub season_start_time: Option<String>,
    pub season_end_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct MasteryPassRecord {
    pub pass_id: String,
    pub set_code: String,
    pub current_level: u32,
    pub current_xp: u32,
    pub xp_per_level: u32,
    pub is_premium: bool,
    pub orbs: u32,
    pub max_level: u32,
    pub claimed_levels: Vec<u32>,
}

#[derive(Debug, Clone)]
pub enum ParsedEvent {
    Auth { screen_name: String, client_id: String },
    MatchCreated { match_id: String, format_name: String, assigned_deck_event: bool, reserved_players: serde_json::Value },
    DeckSubmitted { deck_name: String, total_cards: usize, main_deck: Vec<u32>, commander_id: Option<u32>, deck_id: Option<String> },
    DeckCatalogBatch { decks: Vec<(String, String, Option<u32>, Vec<u32>)> },
    GameStateUpdates {
        steps: Vec<GameStateStep>,
    },
    MulliganEvent { seat_id: u32, is_mulligan: bool, num_cards: Option<u32> },
    MatchCompleted { match_id: String, winning_team_id: u32, reason: String },
    InventoryUpdate(PlayerEconomyRecord),
    BoosterOpened(BoosterOpeningRecord),
    QuestUpdate {
        quests: Vec<RawQuestData>,
        can_swap: bool,
    },
    PeriodicRewardsUpdate {
        daily_reset_timestamp: String,
        weekly_reset_timestamp: String,
        daily_wins: Option<u32>,
        weekly_wins: Option<u32>,
    },
    RankUpdate(PlayerRankRecord),
    SeasonUpdate(SeasonDetailsRecord),
    MasteryPassUpdate(MasteryPassRecord),
    Compound(Vec<ParsedEvent>),
    Unknown,
}

pub fn parse_line(line: &str) -> ParsedEvent {
    // 1. Authentication Response
    if line.contains("authenticateResponse") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let auth_val = v.get("authenticateResponse")
                    .or_else(|| v.get("AuthenticateResponse"))
                    .or_else(|| v.get("Payload").and_then(|p| p.get("authenticateResponse")));
                
                if let Some(auth) = auth_val {
                    if let Ok(payload) = serde_json::from_value::<AuthPayload>(auth.clone()) {
                        let screen_name = payload.screen_name.unwrap_or_else(|| "REDACTED_USER".to_string());
                        let client_id = payload.client_id.unwrap_or_else(|| "REDACTED_ID".to_string());
                        return ParsedEvent::Auth { screen_name, client_id };
                    }
                }
            }
        }
    }

    // 2. Match Created & Match Completed (Event 2 & Game End)
    if line.contains("matchGameRoomStateChangedEvent") || line.contains("Connecting to matchId") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let room = v.get("matchGameRoomStateChangedEvent").and_then(|e| e.get("gameRoomInfo"));
                if let Some(r) = room {
                    let state_type = r.get("stateType").and_then(|s| s.as_str()).unwrap_or("");
                    let cfg = r.get("gameRoomConfig");
                    
                    let mid = cfg.and_then(|c| c.get("matchId"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("UNKNOWN_MATCH_ID")
                        .to_string();

                    // Check for Match Completed state
                    if state_type == "MatchGameRoomStateType_MatchCompleted" || r.get("finalMatchResult").is_some() {
                        let mut winning_team = 0;
                        let mut reason = "Unknown".to_string();
                        if let Some(fmr) = r.get("finalMatchResult") {
                            if let Some(results) = fmr.get("resultList").and_then(|l| l.as_array()) {
                                for res in results {
                                    if res.get("scope").and_then(|s| s.as_str()) == Some("MatchScope_Match") {
                                        winning_team = res.get("winningTeamId").and_then(|w| w.as_u64()).unwrap_or(0) as u32;
                                        reason = res.get("reason").and_then(|r| r.as_str()).unwrap_or("MatchCompleted").to_string();
                                    }
                                }
                            }
                        }
                        return ParsedEvent::MatchCompleted { match_id: mid, winning_team_id: winning_team, reason };
                    }

                    let reserved_players = cfg.and_then(|c| c.get("reservedPlayers")).cloned().unwrap_or(serde_json::Value::Array(vec![]));

                    // Extract raw format_name / eventId from reservedPlayers
                    let mut raw_format = cfg.and_then(|c| c.get("eventId")).and_then(|e| e.as_str()).unwrap_or("").to_string();
                    if raw_format.is_empty() {
                        if let Some(players) = reserved_players.as_array() {
                            for p in players {
                                if let Some(eid) = p.get("eventId").and_then(|e| e.as_str()) {
                                    if !eid.is_empty() {
                                        raw_format = eid.to_string();
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    return ParsedEvent::MatchCreated {
                        match_id: mid,
                        format_name: normalize_format(&raw_format),
                        assigned_deck_event: is_assigned_deck_event(&raw_format),
                        reserved_players,
                    };
                }
            }
        }
    }

    // 3. Deck Catalog Broadcast / Course Summary (EventGetCourses / DeckCatalogBatch)
    if line.contains("EventGetCourses") || line.contains("CourseDeckSummary") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let mut catalog = Vec::new();

                // Check payload / Payload nesting
                let target = v.get("payload")
                    .or_else(|| v.get("Payload"))
                    .unwrap_or(&v);

                if let Some(courses) = target.get("courses").or_else(|| target.get("Courses")).and_then(|c| c.as_array()) {
                    for course in courses {
                        if let Some(sum) = course.get("CourseDeckSummary").or_else(|| course.get("courseDeckSummary")) {
                            let did = sum.get("DeckId").or_else(|| sum.get("deckId")).and_then(|d| d.as_str()).unwrap_or("").to_string();
                            let raw_dname = sum.get("Name").or_else(|| sum.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
                            let dname = crate::client_loc::resolve_deck_name(&raw_dname);
                            let mut main_deck = Vec::new();
                            let mut cmd_id = None;
                            if let Some(deck) = course.get("CourseDeck").or_else(|| course.get("courseDeck")) {
                                if let Some(main) = deck.get("MainDeck").or_else(|| deck.get("mainDeck")).and_then(|m| m.as_array()) {
                                    for c in main {
                                        if let Some(cid) = c.get("cardId").and_then(|x| x.as_u64()) {
                                            let qty = c.get("quantity").and_then(|q| q.as_u64()).unwrap_or(1);
                                            for _ in 0..qty {
                                                main_deck.push(cid as u32);
                                            }
                                        }
                                    }
                                }
                                if let Some(cmd) = deck.get("CommandZone").or_else(|| deck.get("commandZone")).and_then(|c| c.as_array()) {
                                    if let Some(first) = cmd.first() {
                                        cmd_id = first.get("cardId").and_then(|c| c.as_u64()).map(|c| c as u32);
                                    }
                                }
                            }
                            if !did.is_empty() || !dname.is_empty() {
                                catalog.push((did, dname, cmd_id, main_deck));
                            }
                        }
                    }
                }

                if !catalog.is_empty() {
                    return ParsedEvent::DeckCatalogBatch { decks: catalog };
                }
            }
        }
    }

    // 4. Deck Selection / Submission / Upsert (Event 3)
    // Real Arena logs emit `EventSetDeckV2`, `EventSetDeckV3`, `DeckUpsertDeckV3`,
    // `CourseDeckSummary`, and `deckSubmit` payloads.
    if line.contains("EventSetDeck") || line.contains("DeckUpsertDeck") || line.contains("deckSubmit") || line.contains("CourseDeckSummary") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let mut deck_name = String::new();
                let mut deck_id = None;
                let mut main_deck = Vec::new();
                let mut commander_id = None;

                let target_obj = if let Some(req_str) = v.get("request").and_then(|r| r.as_str()) {
                    serde_json::from_str::<serde_json::Value>(req_str).ok()
                } else {
                    Some(v.clone())
                };

                if let Some(obj) = target_obj {
                    if let Some(summary) = obj.get("Summary").or_else(|| obj.get("CourseDeckSummary")) {
                        if let Some(name) = summary.get("Name").and_then(|n| n.as_str()) {
                            deck_name = name.to_string();
                        }
                        if let Some(id) = summary.get("DeckId").and_then(|d| d.as_str()) {
                            deck_id = Some(id.to_string());
                        }
                    } else {
                        // Direct top-level fields (e.g. DeckId / Name in response)
                        if let Some(name) = obj.get("Name").and_then(|n| n.as_str()) {
                            deck_name = name.to_string();
                        }
                        if let Some(id) = obj.get("DeckId").and_then(|d| d.as_str()) {
                            deck_id = Some(id.to_string());
                        }
                    }

                    if let Some(deck) = obj.get("Deck").or_else(|| obj.get("CourseDeck")) {
                        if let Some(main) = deck.get("MainDeck").and_then(|m| m.as_array()) {
                            for card in main {
                                if let Some(cid) = card.get("cardId").and_then(|c| c.as_u64()) {
                                    let qty = card.get("quantity").and_then(|q| q.as_u64()).unwrap_or(1);
                                    for _ in 0..qty {
                                        main_deck.push(cid as u32);
                                    }
                                }
                            }
                        }
                        if let Some(cmd) = deck.get("CommandZone").and_then(|c| c.as_array()) {
                            if let Some(first) = cmd.first() {
                                if let Some(cid) = first.get("cardId").and_then(|c| c.as_u64()) {
                                    commander_id = Some(cid as u32);
                                }
                            }
                        }
                    }
                }

                // If we extracted a deck name, deck ID, or main deck cards, emit DeckSubmitted
                if !deck_name.is_empty() || !main_deck.is_empty() || deck_id.is_some() {
                    let total_cards = main_deck.len();
                    let resolved_deck_name = crate::client_loc::resolve_deck_name(&deck_name);
                    return ParsedEvent::DeckSubmitted {
                        deck_name: resolved_deck_name,
                        total_cards,
                        main_deck,
                        commander_id,
                        deck_id,
                    };
                }
            }
        }
    }

    // Ingress and process real-time GameStateMessages (zone transitions, board states, turn changes)
    if line.contains("GREMessageType_GameStateMessage") || line.contains("GREMessageType_PromptReq") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let messages = v.get("greToClientEvent")
                    .and_then(|e| e.get("greToClientMessages"))
                    .and_then(|m| m.as_array());

                if let Some(msgs) = messages {
                    let mut steps: Vec<GameStateStep> = Vec::new();

                    for msg in msgs {
                        let mtype = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if mtype == "GREMessageType_GameStateMessage" {
                            let mut step = GameStateStep::default();
                            step.msg_id = msg.get("msgId").and_then(|m| m.as_u64());
                            if let Some(gsm) = msg.get("gameStateMessage") {
                                if let Some(objs) = gsm.get("gameObjects").and_then(|o| o.as_array()) {
                                    for obj in objs {
                                        let obj_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                        let parent_id = obj.get("parentId").and_then(|p| p.as_u64()).map(|p| p as u32);
                                        let is_token = obj_type.contains("Token") || obj.get("isToken").and_then(|b| b.as_bool()).unwrap_or(false);
                                        let is_ability = (obj_type.contains("Ability") || obj_type.contains("Trigger")) && !is_token;
                                        let is_back_face = (obj_type.ends_with("Back") || obj_type.contains("Back")) && parent_id.is_some();
                                        let is_card = !is_ability && !is_back_face;

                                        let token_name = if is_token {
                                            let mut names: Vec<String> = Vec::new();
                                            if let Some(subtypes) = obj.get("subtypes").and_then(|s| s.as_array()) {
                                                for s in subtypes.iter().filter_map(|s| s.as_str()) {
                                                    let clean = s.strip_prefix("SubType_").unwrap_or(s).trim();
                                                    if !clean.is_empty() {
                                                        names.push(clean.to_string());
                                                    }
                                                }
                                            }
                                            if names.is_empty() {
                                                if let Some(ctypes) = obj.get("cardTypes").and_then(|c| c.as_array()) {
                                                    for c in ctypes.iter().filter_map(|c| c.as_str()) {
                                                        let clean = c.strip_prefix("CardType_").unwrap_or(c).trim();
                                                        if !clean.is_empty() {
                                                            names.push(clean.to_string());
                                                        }
                                                    }
                                                }
                                            }
                                            if !names.is_empty() {
                                                Some(format!("{} Token", names.join(" ")))
                                            } else {
                                                Some("Token".to_string())
                                            }
                                        } else {
                                            None
                                        };

                                        if let Some(inst_id) = obj.get("instanceId").and_then(|i| i.as_u64()) {
                                            let zone_id = obj.get("zoneId").and_then(|z| z.as_u64()).map(|z| z as u32).unwrap_or(0);
                                            let grp_id = if is_ability {
                                                obj.get("objectSourceGrpId")
                                                    .or_else(|| obj.get("overlayGrpId"))
                                                    .or_else(|| obj.get("grpId"))
                                                    .and_then(|g| g.as_u64())
                                                    .map(|g| g as u32)
                                            } else {
                                                obj.get("grpId")
                                                    .or_else(|| obj.get("overlayGrpId"))
                                                    .or_else(|| obj.get("objectSourceGrpId"))
                                                    .and_then(|g| g.as_u64())
                                                    .map(|g| g as u32)
                                            };
                                            let owner_seat = obj.get("ownerSeatId").or_else(|| obj.get("controllerSeatId")).and_then(|s| s.as_u64()).map(|s| s as u32);
                                            if let Some(pid) = parent_id {
                                                if pid > 0 {
                                                    step.ability_associations.push((inst_id as u32, pid));
                                                }
                                            }
                                            let is_creature = obj.get("cardTypes")
                                                .and_then(|c| c.as_array())
                                                .map(|arr| arr.iter().any(|v| v.as_str().unwrap_or("").contains("Creature")))
                                                .unwrap_or(false)
                                                || obj_type.contains("Creature")
                                                || token_name.as_ref().map(|n| n.contains("Creature")).unwrap_or(false);
                                            if is_creature {
                                                step.creature_instance_ids.push(inst_id as u32);
                                            }
                                            step.objects.push((inst_id as u32, grp_id, owner_seat, zone_id, is_card, is_token, token_name));
                                        }
                                    }
                                }

                                if let Some(dels) = gsm.get("diffDeletedInstanceIds").and_then(|d| d.as_array()) {
                                    for d in dels {
                                        if let Some(did) = d.as_u64() {
                                            step.diff_deleted_ids.push(did as u32);
                                        }
                                    }
                                }

                                let turn_info = gsm.get("turnInfo");
                                let turn_number = turn_info.and_then(|t| t.get("turnNumber")).and_then(|n| n.as_u64()).unwrap_or(0) as u32;
                                if turn_number > 0 {
                                    step.turn_number = turn_number;
                                    let active_seat = turn_info
                                        .and_then(|t| t.get("activeSeatId").or_else(|| t.get("activePlayer")))
                                        .and_then(|s| s.as_u64())
                                        .unwrap_or(1) as u32;
                                    step.active_seat = active_seat;
                                }

                                if let Some(players) = gsm.get("players").and_then(|p| p.as_array()) {
                                    for p in players {
                                        let seat_id = p.get("systemSeatNumber")
                                            .or_else(|| p.get("systemSeatId"))
                                            .and_then(|s| s.as_u64())
                                            .unwrap_or(0);

                                        if let Some(life) = p.get("lifeTotal").and_then(|l| l.as_i64()).map(|l| l as i32) {
                                            if seat_id > 0 {
                                                step.life_by_seat.push((seat_id as u32, life));
                                            }
                                        }
                                    }
                                }

                                // Extract annotations for damage attribution, ability parent links, extra card draw tracking, counters, life mods, and object IDs.
                                if let Some(anns) = gsm.get("annotations").and_then(|a| a.as_array()) {
                                    for a in anns {
                                        let ann_id = a.get("id").and_then(|i| i.as_u64()).unwrap_or(0) as u32;
                                        let ann_type = a.get("type").and_then(|t| t.as_array())
                                            .and_then(|arr| arr.first())
                                            .and_then(|t| t.as_str())
                                            .unwrap_or("");

                                        if ann_type.contains("DamageDealt") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            if affector_id == 0 {
                                                continue;
                                            }
                                            let affected_ids: Vec<u32> = a.get("affectedIds")
                                                .and_then(|arr| arr.as_array())
                                                .map(|arr| arr.iter().filter_map(|x| x.as_u64().map(|v| v as u32)).collect())
                                                .unwrap_or_default();

                                            let mut amount = 0i32;
                                            let mut dtype = 1u32; // Default to combat (1)

                                            if let Some(details) = a.get("details").and_then(|d| d.as_array()) {
                                                for d in details {
                                                    let key = d.get("key").and_then(|k| k.as_str()).unwrap_or("");
                                                    if key == "damage" {
                                                        amount = d.get("valueInt32").and_then(|v| v.as_array())
                                                            .and_then(|arr| arr.first())
                                                            .and_then(|x| x.as_i64())
                                                            .unwrap_or(0) as i32;
                                                    } else if key == "type" {
                                                        dtype = d.get("valueInt32").and_then(|v| v.as_array())
                                                            .and_then(|arr| arr.first())
                                                            .and_then(|x| x.as_u64())
                                                            .unwrap_or(1) as u32;
                                                    }
                                                }
                                            }

                                            if amount != 0 {
                                                if affected_ids.is_empty() {
                                                    step.damage_events.push((ann_id, affector_id, 0, amount, dtype));
                                                } else {
                                                    for target_id in affected_ids {
                                                        step.damage_events.push((ann_id, affector_id, target_id, amount, dtype));
                                                    }
                                                }
                                            }
                                        } else if ann_type.contains("ModifiedLife") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            let affected_ids: Vec<u32> = a.get("affectedIds")
                                                .and_then(|arr| arr.as_array())
                                                .map(|arr| arr.iter().filter_map(|x| x.as_u64().map(|v| v as u32)).collect())
                                                .unwrap_or_default();
                                            let mut life_delta = 0i32;
                                            if let Some(details) = a.get("details").and_then(|d| d.as_array()) {
                                                for d in details {
                                                    let key = d.get("key").and_then(|k| k.as_str()).unwrap_or("");
                                                    if key == "life" {
                                                        if let Some(l) = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()) {
                                                            life_delta = l as i32;
                                                        }
                                                    }
                                                }
                                            }
                                            for target_seat in affected_ids {
                                                step.life_modifications.push((affector_id, target_seat, life_delta));
                                            }
                                        } else if ann_type.contains("ObjectIdChanged") {
                                            let mut orig_id = 0u32;
                                            let mut new_id = 0u32;
                                            if let Some(details) = a.get("details").and_then(|d| d.as_array()) {
                                                for d in details {
                                                    let key = d.get("key").and_then(|k| k.as_str()).unwrap_or("");
                                                    if key == "orig_id" {
                                                        orig_id = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()).unwrap_or(0) as u32;
                                                    } else if key == "new_id" {
                                                        new_id = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()).unwrap_or(0) as u32;
                                                    }
                                                }
                                            }
                                            if orig_id > 0 && new_id > 0 {
                                                step.object_id_changes.push((orig_id, new_id));
                                            }
                                        } else if ann_type.contains("CounterAdded") || ann_type.contains("CounterRemoved") || ann_type.contains("Counter") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            let affected_ids: Vec<u32> = a.get("affectedIds")
                                                .and_then(|arr| arr.as_array())
                                                .map(|arr| arr.iter().filter_map(|x| x.as_u64().map(|v| v as u32)).collect())
                                                .unwrap_or_default();

                                            let mut counter_type = 1u32; // 1 = +1/+1 counter
                                            let mut amount = 1i32;
                                            let is_removed = ann_type.contains("CounterRemoved");

                                            if let Some(details) = a.get("details").and_then(|d| d.as_array()) {
                                                for d in details {
                                                    let key = d.get("key").and_then(|k| k.as_str()).unwrap_or("");
                                                    if key == "counter_type" {
                                                        if let Some(ct) = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()) {
                                                            counter_type = ct as u32;
                                                        }
                                                    } else if key == "transaction_amount" {
                                                        if let Some(amt) = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()) {
                                                            amount = amt.abs() as i32;
                                                        }
                                                    }
                                                }
                                            }

                                            let signed_amount = if is_removed { -amount } else { amount };

                                            if affected_ids.is_empty() && affector_id > 0 {
                                                step.counter_events.push((affector_id, counter_type, signed_amount));
                                            } else {
                                                for target_id in affected_ids {
                                                    step.counter_events.push((target_id, counter_type, signed_amount));
                                                }
                                            }
                                        } else if ann_type.contains("AbilityInstanceCreated") || ann_type.contains("AbilityInstanceDeleted") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            if affector_id > 0 {
                                                if let Some(affected_ids) = a.get("affectedIds").and_then(|arr| arr.as_array()) {
                                                    for aff_id in affected_ids.iter().filter_map(|x| x.as_u64().map(|v| v as u32)) {
                                                        step.ability_associations.push((aff_id, affector_id));
                                                    }
                                                }
                                            }
                                        } else if ann_type.contains("ZoneTransfer") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            let affected_ids: Vec<u32> = a.get("affectedIds")
                                                .and_then(|arr| arr.as_array())
                                                .map(|arr| arr.iter().filter_map(|x| x.as_u64().map(|v| v as u32)).collect())
                                                .unwrap_or_default();

                                            let mut category = String::new();
                                            let mut zone_src = 0u32;
                                            let mut zone_dest = 0u32;
                                            if let Some(details) = a.get("details").and_then(|d| d.as_array()) {
                                                for d in details {
                                                    let key = d.get("key").and_then(|k| k.as_str()).unwrap_or("");
                                                    if key == "category" {
                                                        if let Some(cat_str) = d.get("valueString").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|s| s.as_str()) {
                                                            category = cat_str.to_string();
                                                        }
                                                    } else if key == "zone_src" {
                                                        if let Some(zs) = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()) {
                                                            zone_src = zs as u32;
                                                        }
                                                    } else if key == "zone_dest" {
                                                        if let Some(zd) = d.get("valueInt32").and_then(|v| v.as_array()).and_then(|arr| arr.first()).and_then(|x| x.as_i64()) {
                                                            zone_dest = zd as u32;
                                                        }
                                                    }
                                                }
                                            }

                                            if category.eq_ignore_ascii_case("Draw") && affector_id > 0 {
                                                let count = if affected_ids.is_empty() { 1 } else { affected_ids.len() as u32 };
                                                step.draw_events.push((affector_id, zone_dest, count));
                                            } else if category.eq_ignore_ascii_case("Countered") {
                                                for target_id in &affected_ids {
                                                    step.counter_spell_events.push((affector_id, *target_id));
                                                }
                                            }

                                            if affector_id > 0 || !category.is_empty() || zone_src > 0 || zone_dest > 0 {
                                                step.zone_transfer_events.push((affector_id, affected_ids, category, zone_src, zone_dest));
                                            }
                                        } else if ann_type.contains("ManaPaid") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            if affector_id > 0 {
                                                step.mana_paid_events.push((affector_id, 1));
                                            }
                                        }
                                    }
                                }

                                if !step.objects.is_empty() || step.turn_number > 0 || !step.life_by_seat.is_empty() || !step.damage_events.is_empty() || !step.counter_events.is_empty() || !step.draw_events.is_empty() || !step.diff_deleted_ids.is_empty() || !step.ability_associations.is_empty() || !step.object_id_changes.is_empty() || !step.life_modifications.is_empty() || !step.counter_spell_events.is_empty() || !step.zone_transfer_events.is_empty() || !step.mana_paid_events.is_empty() {
                                    steps.push(step);
                                }
                            }
                        } else if mtype == "GREMessageType_PromptReq" {
                            // PromptReq prompts the client to make a choice (e.g. Prompt 36 = Mulligan or Keep).
                            // The actual user decision is reported via ClientMessageType_MulliganResp (or mulliganResp).
                        }
                    }

                    if !steps.is_empty() {
                        return ParsedEvent::GameStateUpdates { steps };
                    }
                }
            }
        }
    }

    // 5. Client Mulligan Response (Direct Decision)
    if line.contains("ClientMessageType_MulliganResp") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let target_obj = v.get("mulliganResp")
                    .or_else(|| v.get("clientToGreMessage").and_then(|c| c.get("mulliganResp")))
                    .or_else(|| v.get("payload").and_then(|p| p.get("mulliganResp")));
                if let Some(resp) = target_obj {
                    let decision = resp.get("decision").and_then(|d| d.as_str()).unwrap_or("");
                    if decision.contains("Accept") || decision.contains("Keep") {
                        return ParsedEvent::MulliganEvent { seat_id: 0, is_mulligan: false, num_cards: None };
                    } else if decision.contains("Mulligan") {
                        return ParsedEvent::MulliganEvent { seat_id: 0, is_mulligan: true, num_cards: None };
                    }
                }
            }
        }
    }

    // 6. Player Inventory & Periodic Rewards (StartHook / EventJoin / Store / Claim / PeriodicRewardsGetStatus)
    if line.contains("InventoryInfo")
        || line.contains("inventoryInfo")
        || line.contains("ClientPeriodicRewards")
        || line.contains("clientPeriodicRewards")
        || line.contains("PeriodicRewardsGetStatus")
        || line.contains("_dailyRewardResetTimestamp")
    {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let maybe_eco = extract_inventory_info(&v).map(ParsedEvent::InventoryUpdate);
                let maybe_rewards = extract_periodic_rewards(&v);

                match (maybe_eco, maybe_rewards) {
                    (Some(eco), Some(rewards)) => {
                        return ParsedEvent::Compound(vec![eco, rewards]);
                    }
                    (Some(eco), None) => {
                        return eco;
                    }
                    (None, Some(rewards)) => {
                        return rewards;
                    }
                    (None, None) => {}
                }
            }
        }
    }

    // 7. Booster Pack Opening (OpenBooster / CardsAdded)
    if line.contains("OpenBooster") || line.contains("openBooster") || line.contains("CardsAdded") || line.contains("cardsAdded") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(booster) = extract_booster_opening(&v) {
                    return ParsedEvent::BoosterOpened(booster);
                }
            }
        }
    }

    // 8. Daily Quests Update (QuestGetQuests)
    if line.contains("\"quests\"") || line.contains("QuestGetQuests") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(quests_array) = v.get("quests").and_then(|q| q.as_array()) {
                    let can_swap = v.get("canSwap")
                        .or_else(|| v.get("can_swap"))
                        .and_then(|x| x.as_bool())
                        .unwrap_or(false);
                    let mut raw_quests = Vec::new();
                    for q in quests_array {
                        if let Some(raw) = extract_raw_quest(q) {
                            raw_quests.push(raw);
                        }
                    }
                    return ParsedEvent::QuestUpdate {
                        quests: raw_quests,
                        can_swap,
                    };
                }
            }
        }
    }

    // 9. Ranked Ladder Update (RankGetCombinedRankInfo)
    if line.contains("constructedSeasonOrdinal") || line.contains("limitedSeasonOrdinal") || line.contains("RankGetCombinedRankInfo") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(record) = extract_rank_info(&v) {
                    return ParsedEvent::RankUpdate(record);
                }
            }
        }
    }

    // 10. Season Details Update (RankGetSeasonAndRankDetails)
    if (line.contains("seasonStartTime") && line.contains("seasonEndTime")) || line.contains("RankGetSeasonAndRankDetails") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(record) = extract_season_details(&v) {
                    return ParsedEvent::SeasonUpdate(record);
                }
            }
        }
    }

    // 11. Mastery Pass Update (GraphGetGraphState for BattlePass or LevelTrack_Level_)
    if line.contains("LevelTrack_Level_") || line.contains("BattlePass_") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(record) = extract_mastery_pass(&v, line) {
                    return ParsedEvent::MasteryPassUpdate(record);
                }
            }
        }
    }

    ParsedEvent::Unknown
}

pub fn extract_rank_info(v: &serde_json::Value) -> Option<PlayerRankRecord> {
    let payload = if v.get("constructedSeasonOrdinal").is_some() || v.get("limitedSeasonOrdinal").is_some() {
        v
    } else if let Some(p) = v.get("Payload").or_else(|| v.get("payload")) {
        p
    } else {
        v
    };

    let season_ordinal = payload.get("constructedSeasonOrdinal")
        .or_else(|| payload.get("limitedSeasonOrdinal"))
        .or_else(|| payload.get("seasonOrdinal"))
        .and_then(|s| s.as_i64())?;

    // MTGA omits constructedClass or limitedClass when Bronze
    let constructed_tier = payload.get("constructedClass")
        .or_else(|| payload.get("ConstructedClass"))
        .and_then(|c| c.as_str())
        .unwrap_or("Bronze")
        .to_string();
    let constructed_level = payload.get("constructedLevel")
        .or_else(|| payload.get("ConstructedLevel"))
        .and_then(|l| l.as_i64())
        .unwrap_or(4) as i32;
    let constructed_step = payload.get("constructedStep")
        .or_else(|| payload.get("ConstructedStep"))
        .and_then(|s| s.as_i64())
        .unwrap_or(0) as i32;
    let constructed_wins = payload.get("constructedMatchesWon")
        .or_else(|| payload.get("ConstructedMatchesWon"))
        .and_then(|w| w.as_i64())
        .unwrap_or(0) as i32;
    let constructed_losses = payload.get("constructedMatchesLost")
        .or_else(|| payload.get("ConstructedMatchesLost"))
        .and_then(|l| l.as_i64())
        .unwrap_or(0) as i32;

    let limited_tier = payload.get("limitedClass")
        .or_else(|| payload.get("LimitedClass"))
        .and_then(|c| c.as_str())
        .unwrap_or("Bronze")
        .to_string();
    let limited_level = payload.get("limitedLevel")
        .or_else(|| payload.get("LimitedLevel"))
        .and_then(|l| l.as_i64())
        .unwrap_or(4) as i32;
    let limited_step = payload.get("limitedStep")
        .or_else(|| payload.get("LimitedStep"))
        .and_then(|s| s.as_i64())
        .unwrap_or(0) as i32;
    let limited_wins = payload.get("limitedMatchesWon")
        .or_else(|| payload.get("LimitedMatchesWon"))
        .and_then(|w| w.as_i64())
        .unwrap_or(0) as i32;
    let limited_losses = payload.get("limitedMatchesLost")
        .or_else(|| payload.get("LimitedMatchesLost"))
        .and_then(|l| l.as_i64())
        .unwrap_or(0) as i32;

    Some(PlayerRankRecord {
        season_ordinal,
        constructed_tier,
        constructed_level,
        constructed_step,
        constructed_wins,
        constructed_losses,
        limited_tier,
        limited_level,
        limited_step,
        limited_wins,
        limited_losses,
    })
}

pub fn extract_season_details(v: &serde_json::Value) -> Option<SeasonDetailsRecord> {
    let payload = if v.get("currentSeason").is_some() || v.get("CurrentSeason").is_some() {
        v
    } else if let Some(p) = v.get("Payload").or_else(|| v.get("payload")) {
        p
    } else {
        v
    };

    let current_season = payload.get("currentSeason").or_else(|| payload.get("CurrentSeason"))?;
    let season_ordinal = current_season.get("seasonOrdinal")
        .or_else(|| current_season.get("SeasonOrdinal"))
        .and_then(|s| s.as_i64())?;
    let season_start_time = current_season.get("seasonStartTime")
        .or_else(|| current_season.get("SeasonStartTime"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());
    let season_end_time = current_season.get("seasonEndTime")
        .or_else(|| current_season.get("SeasonEndTime"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    Some(SeasonDetailsRecord {
        season_ordinal,
        season_start_time,
        season_end_time,
    })
}

pub fn extract_raw_quest(q: &serde_json::Value) -> Option<RawQuestData> {
    let quest_id = q.get("questId")
        .or_else(|| q.get("quest_id"))
        .and_then(|x| x.as_str())?
        .to_string();
    let loc_key = q.get("locKey")
        .or_else(|| q.get("loc_key"))
        .and_then(|x| x.as_str())?
        .to_string();
    let goal = q.get("goal").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let starting_progress = q.get("startingProgress")
        .or_else(|| q.get("starting_progress"))
        .and_then(|x| x.as_u64())
        .unwrap_or(0) as u32;
    let ending_progress = q.get("endingProgress")
        .or_else(|| q.get("ending_progress"))
        .or_else(|| q.get("currentProgress"))
        .or_else(|| q.get("current_progress"))
        .and_then(|x| x.as_u64())
        .unwrap_or(starting_progress as u64) as u32;
    let can_swap = q.get("canSwap")
        .or_else(|| q.get("can_swap"))
        .and_then(|x| x.as_bool())
        .unwrap_or(false);

    let chest = q.get("chestDescription").or_else(|| q.get("chest_description"));
    let mut reward_gold = 500;
    let mut reward_xp = 500;

    if let Some(c) = chest {
        if let Some(qty_str) = c.get("quantity").and_then(|x| x.as_str()) {
            if let Ok(val) = qty_str.parse::<u32>() {
                if val > 0 {
                    reward_gold = val;
                }
            }
        } else if let Some(qty_num) = c.get("quantity").and_then(|x| x.as_u64()) {
            if qty_num > 0 {
                reward_gold = qty_num as u32;
            }
        }
        if let Some(loc_params) = c.get("locParams").or_else(|| c.get("loc_params")) {
            if let Some(n1) = loc_params.get("number1").and_then(|x| x.as_u64()) {
                if n1 > 0 {
                    reward_gold = n1 as u32;
                }
            }
            if let Some(n2) = loc_params.get("number2").and_then(|x| x.as_u64()) {
                if n2 > 0 {
                    reward_xp = n2 as u32;
                }
            }
        }
    }

    Some(RawQuestData {
        quest_id,
        loc_key,
        goal,
        starting_progress,
        ending_progress,
        can_swap,
        reward_gold,
        reward_xp,
    })
}

pub fn extract_inventory_info(v: &serde_json::Value) -> Option<PlayerEconomyRecord> {
    let inv = v.get("InventoryInfo")
        .or_else(|| v.get("inventoryInfo"))
        .or_else(|| v.get("Payload").and_then(|p| p.get("InventoryInfo").or_else(|| p.get("inventoryInfo"))))
        .or_else(|| v.get("payload").and_then(|p| p.get("InventoryInfo").or_else(|| p.get("inventoryInfo"))))?;

    let gold = inv.get("Gold").or_else(|| inv.get("gold")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let gems = inv.get("Gems").or_else(|| inv.get("gems")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let vault_progress_tenths = inv.get("TotalVaultProgress").or_else(|| inv.get("totalVaultProgress")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let wc_track_pos = inv.get("WcTrackPosition").or_else(|| inv.get("wcTrackPosition")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let wc_common = inv.get("WildCardCommons").or_else(|| inv.get("wildCardCommons")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let wc_uncommon = inv.get("WildCardUnCommons").or_else(|| inv.get("wildCardUnCommons")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let wc_rare = inv.get("WildCardRares").or_else(|| inv.get("wildCardRares")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let wc_mythic = inv.get("WildCardMythics").or_else(|| inv.get("wildCardMythics")).and_then(|x| x.as_u64()).unwrap_or(0) as u32;

    let custom_tokens = inv.get("CustomTokens").or_else(|| inv.get("customTokens"));
    let draft_tokens = custom_tokens.and_then(|c| c.get("DraftToken").or_else(|| c.get("draftToken"))).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let jump_in_tokens = custom_tokens.and_then(|c| c.get("Token_JumpIn").or_else(|| c.get("token_JumpIn"))).and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let golden_pack_progress = custom_tokens.and_then(|c| c.get("BonusPackProgress").or_else(|| c.get("bonusPackProgress"))).and_then(|x| x.as_u64()).unwrap_or(0) as u32;

    let mut mastery_orbs = std::collections::HashMap::new();
    if let Some(ct_map) = custom_tokens.and_then(|c| c.as_object()) {
        for (k, val) in ct_map {
            if (k.starts_with("BattlePass_") && k.ends_with("_Orb")) || k.contains("Orb") {
                if let Some(num) = val.as_u64() {
                    mastery_orbs.insert(k.clone(), num as u32);
                }
            }
        }
    }

    Some(PlayerEconomyRecord {
        gold,
        gems,
        vault_progress_tenths,
        wc_track_pos,
        wc_common,
        wc_uncommon,
        wc_rare,
        wc_mythic,
        draft_tokens,
        jump_in_tokens,
        golden_pack_progress,
        mastery_orbs,
    })
}

pub fn extract_periodic_rewards(v: &serde_json::Value) -> Option<ParsedEvent> {
    // 1. From StartHook: "ClientPeriodicRewards"
    let cpr = v.get("ClientPeriodicRewards")
        .or_else(|| v.get("clientPeriodicRewards"))
        .or_else(|| v.get("Payload").and_then(|p| p.get("ClientPeriodicRewards").or_else(|| p.get("clientPeriodicRewards"))))
        .or_else(|| v.get("payload").and_then(|p| p.get("ClientPeriodicRewards").or_else(|| p.get("clientPeriodicRewards"))));

    if let Some(cpr_val) = cpr {
        if let Some(daily_reset) = cpr_val.get("DailyRewardResetTimestampInternal")
            .or_else(|| cpr_val.get("dailyRewardResetTimestampInternal"))
            .or_else(|| cpr_val.get("_dailyRewardResetTimestamp"))
            .and_then(|x| x.as_str())
        {
            let weekly_reset = cpr_val.get("WeeklyRewardResetTimestampInternal")
                .or_else(|| cpr_val.get("weeklyRewardResetTimestampInternal"))
                .or_else(|| cpr_val.get("_weeklyRewardResetTimestamp"))
                .and_then(|x| x.as_str())
                .unwrap_or("");

            let daily_seq = cpr_val.get("DailyRewardSequenceId")
                .or_else(|| cpr_val.get("dailyRewardSequenceId"))
                .and_then(|x| x.as_i64());

            let weekly_seq = cpr_val.get("WeeklyRewardSequenceId")
                .or_else(|| cpr_val.get("weeklyRewardSequenceId"))
                .and_then(|x| x.as_i64());

            let daily_wins = daily_seq.map(|s| if s <= 0 { 0 } else { (s as u32).min(15) });
            let weekly_wins = weekly_seq.map(|s| if s <= 0 { 0 } else { (s as u32).min(15) });

            return Some(ParsedEvent::PeriodicRewardsUpdate {
                daily_reset_timestamp: daily_reset.to_string(),
                weekly_reset_timestamp: weekly_reset.to_string(),
                daily_wins,
                weekly_wins,
            });
        }
    }

    // 2. From PeriodicRewardsGetStatus: "_dailyRewardResetTimestamp"
    if let Some(daily_reset) = v.get("_dailyRewardResetTimestamp").or_else(|| v.get("dailyRewardResetTimestamp")).and_then(|x| x.as_str()) {
        let weekly_reset = v.get("_weeklyRewardResetTimestamp")
            .or_else(|| v.get("weeklyRewardResetTimestamp"))
            .and_then(|x| x.as_str())
            .unwrap_or("");

        let daily_seq = v.get("DailyRewardSequenceId")
            .or_else(|| v.get("dailyRewardSequenceId"))
            .or_else(|| v.get("_dailyRewardSequenceId"))
            .and_then(|x| x.as_i64());

        let weekly_seq = v.get("WeeklyRewardSequenceId")
            .or_else(|| v.get("weeklyRewardSequenceId"))
            .or_else(|| v.get("_weeklyRewardSequenceId"))
            .and_then(|x| x.as_i64());

        let daily_wins = daily_seq.map(|s| if s <= 0 { 0 } else { (s as u32).min(15) });
        let weekly_wins = weekly_seq.map(|s| if s <= 0 { 0 } else { (s as u32).min(15) });

        return Some(ParsedEvent::PeriodicRewardsUpdate {
            daily_reset_timestamp: daily_reset.to_string(),
            weekly_reset_timestamp: weekly_reset.to_string(),
            daily_wins,
            weekly_wins,
        });
    }

    None
}

pub fn extract_booster_opening(v: &serde_json::Value) -> Option<BoosterOpeningRecord> {
    let payload = v.get("payload")
        .or_else(|| v.get("Payload"))
        .unwrap_or(v);
    let target = payload.get("OpenBooster")
        .or_else(|| payload.get("openBooster"))
        .unwrap_or(payload);

    let cards_val = target.get("CardsAdded")
        .or_else(|| target.get("cardsAdded"))
        .or_else(|| target.get("Cards"))
        .or_else(|| target.get("cards"))?;

    let mut cards_added = Vec::new();
    if let Some(arr) = cards_val.as_array() {
        for c in arr {
            if let Some(num) = c.as_u64() {
                cards_added.push(num as u32);
            } else if let Some(gid) = c.get("grpId").or_else(|| c.get("cardId")).or_else(|| c.get("id")).and_then(|x| x.as_u64()) {
                cards_added.push(gid as u32);
            }
        }
    }

    if cards_added.is_empty() {
        return None;
    }

    let pack_id = target.get("BoosterId")
        .or_else(|| target.get("boosterId"))
        .or_else(|| target.get("packId"))
        .or_else(|| target.get("PackId"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    let mut wildcards = std::collections::HashMap::new();
    if let Some(wc_obj) = target.get("Wildcards").or_else(|| target.get("wildcards")) {
        if let Some(map) = wc_obj.as_object() {
            for (k, val) in map {
                if let Some(cnt) = val.as_u64() {
                    wildcards.insert(k.clone(), cnt as u32);
                }
            }
        }
    }

    let vault_progress_delta = target.get("VaultProgressDelta")
        .or_else(|| target.get("vaultProgressDelta"))
        .and_then(|x| x.as_f64());

    Some(BoosterOpeningRecord {
        pack_id,
        cards_added,
        wildcards,
        vault_progress_delta,
    })
}

pub fn extract_mastery_pass(v: &serde_json::Value, raw_line: &str) -> Option<MasteryPassRecord> {
    let payload = if v.get("NodeStates").is_some() {
        v
    } else if let Some(p) = v.get("Payload").or_else(|| v.get("payload")) {
        p
    } else {
        v
    };

    let node_states = payload.get("NodeStates").and_then(|n| n.as_object())?;

    // Check if this graph contains LevelTrack_Level nodes
    let has_level_track = node_states.keys().any(|k| k.starts_with("LevelTrack_Level_"));
    if !has_level_track {
        return None;
    }

    // Try extracting pass_id and set_code
    let mut pass_id = String::new();
    let mut set_code = String::new();

    // 1. From payload or raw_line
    if let Some(gid) = payload.get("GraphId").or_else(|| payload.get("graphId")).and_then(|g| g.as_str()) {
        pass_id = gid.to_string();
        if let Some(sc) = gid.strip_prefix("BattlePass_") {
            set_code = sc.to_string();
        }
    }

    if pass_id.is_empty() {
        if let Some(pos) = raw_line.find("BattlePass_") {
            let rest = &raw_line[pos..];
            let id_len = rest.find(|c: char| !c.is_alphanumeric() && c != '_').unwrap_or(rest.len());
            pass_id = rest[..id_len].to_string();
            if let Some(sc) = pass_id.strip_prefix("BattlePass_") {
                set_code = sc.to_string();
            }
        }
    }

    if pass_id.is_empty() {
        pass_id = "BattlePass_CURRENT".to_string();
        set_code = "CURRENT".to_string();
    }

    let mut current_level = 1u32;
    let mut current_xp = 0u32;
    let mut max_level = 0u32;
    let mut claimed_levels = Vec::new();
    let mut is_premium = false;

    // Check if user owns premium pass (RewardTierUpgrade or TierRewardNodeState has premium)
    if let Some(tier_upgrade) = node_states.get("RewardTierUpgrade") {
        if tier_upgrade.get("Status").and_then(|s| s.as_str()) == Some("Completed") {
            is_premium = true;
        }
    }

    for (node_name, state) in node_states {
        if node_name.starts_with("LevelTrack_Level_") && !node_name.ends_with("_Reward") {
            if let Some(num_str) = node_name.strip_prefix("LevelTrack_Level_") {
                if let Ok(lvl) = num_str.parse::<u32>() {
                    if lvl > max_level {
                        max_level = lvl;
                    }
                    let status = state.get("Status").and_then(|s| s.as_str()).unwrap_or("");
                    if status == "Completed" {
                        claimed_levels.push(lvl);
                        if lvl >= current_level {
                            current_level = lvl;
                        }
                    } else if status == "Available" {
                        current_level = lvl;
                        if let Some(p) = state.get("ProgressNodeState") {
                            if let Some(xp) = p.get("CurrentProgress").and_then(|x| x.as_u64()) {
                                current_xp = xp as u32;
                            }
                        }
                    }
                }
            }
        } else if node_name.ends_with("_Reward") {
            if let Some(tr) = state.get("TierRewardNodeState") {
                if let Some(tiers) = tr.get("CurrentTiers").and_then(|t| t.as_array()) {
                    for t in tiers {
                        if t.as_str() == Some("premium") {
                            is_premium = true;
                        }
                    }
                }
            }
        }
    }

    claimed_levels.sort_unstable();

    // If max level was reached and completed, current_level is max_level
    if current_level < 1 {
        current_level = 1;
    }
    if max_level < 44 {
        max_level = 44;
    }
    if max_level < current_level {
        max_level = current_level;
    }

    Some(MasteryPassRecord {
        pass_id,
        set_code,
        current_level,
        current_xp,
        xp_per_level: 1000,
        is_premium,
        orbs: 0, // Ingested/reconciled with inventory orbs
        max_level,
        claimed_levels,
    })
}

pub fn normalize_format(raw_event_id: &str) -> String {
    let s = raw_event_id.to_lowercase();
    if s.is_empty() {
        return "Standard".to_string();
    }

    // Check high-priority event types first (these can encompass sub-formats like MWM_HistoricPauper, Direct_Standard, etc.)
    if s.contains("mwm") || s.contains("midweek") {
        "Midweek Magic".to_string()
    } else if s.contains("bot") || s.contains("aibot") || s.contains("sparky") || s.contains("practice") {
        "Bot Match".to_string()
    } else if s.contains("direct") || s.contains("challenge") || s.contains("friendly") {
        "Direct Challenge".to_string()
    } else if s.contains("colorchallenge") || s.contains("tutorial") {
        "Color Challenge".to_string()
    } else if s.contains("gladiator") {
        "Gladiator".to_string()
    } else if s.contains("brawl") || s.contains("commander") {
        if s.contains("ranked") || s.contains("competitive") || s.contains("ladder") {
            "Brawl - Competitive".to_string()
        } else if s.contains("historic") || s.contains("100") {
            "Brawl".to_string()
        } else if s.contains("standard")
            || s == "play_brawl"
            || s == "brawl_play"
            || s == "standard brawl"
            || s == "brawl - standard"
            || (s.starts_with("play_brawl") && !s.contains("historic"))
        {
            "Standard Brawl".to_string()
        } else {
            "Brawl".to_string()
        }
    } else if s.contains("competitive_brawl") || s.contains("competitivebrawl") {
        "Brawl - Competitive".to_string()
    } else if s.contains("timeless") {
        if s.contains("ranked") || s.contains("ladder") {
            "Timeless Ranked".to_string()
        } else {
            "Timeless".to_string()
        }
    } else if s.contains("historic") {
        if s.contains("ranked") || s.contains("ladder") {
            "Historic Ranked".to_string()
        } else {
            "Historic".to_string()
        }
    } else if s.contains("alchemy") {
        if s.contains("ranked") || s.contains("ladder") {
            "Alchemy Ranked".to_string()
        } else {
            "Alchemy".to_string()
        }
    } else if s.contains("pioneer") {
        if s.contains("ranked") || s.contains("ladder") {
            "Pioneer Ranked".to_string()
        } else {
            "Pioneer".to_string()
        }
    } else if s.contains("explorer") {
        if s.contains("ranked") || s.contains("ladder") {
            "Explorer Ranked".to_string()
        } else {
            "Explorer".to_string()
        }
    } else if s.contains("draft") {
        "Draft".to_string()
    } else if s.contains("sealed") {
        "Sealed".to_string()
    } else if s.contains("limited") {
        "Limited".to_string()
    } else if s == "play" || s.contains("standard") || s.contains("ladder") || s.contains("ranked") {
        if s.contains("ranked") || s.contains("ladder") {
            "Standard Ranked".to_string()
        } else {
            "Standard".to_string()
        }
    } else {
        raw_event_id.replace('_', " ")
    }
}

/// True for events where Arena assigns the deck (packet/precon selection in the
/// event UI) and therefore NEVER emits an `EventSetDeck`/`deckSubmit` line for
/// the match. Verified against real logs for Welcome Deck Duels
/// (`WelcomeDeckDuels_HOB_20260811`) and Jump In (`Jump_In_2024`): the queue
/// goes `EventEnterPairing` -> `MatchCreated` with no deck submission between,
/// so any cached deck from the previous queue would be stale. Both sides are
/// lowercased so the check is accurate regardless of casing.
pub fn is_assigned_deck_event(raw_event_id: &str) -> bool {
    let lower = raw_event_id.to_lowercase();
    lower.contains("welcomedeckduels")
        || lower.contains("jump_in")
        || lower.contains("jumpin")
        || lower.contains("momir")
        || lower.contains("omniscience")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_normalization() {
        // Standard & Ranked Standard (including generic Ladder)
        assert_eq!(normalize_format("Play"), "Standard");
        assert_eq!(normalize_format("Standard_Play"), "Standard");
        assert_eq!(normalize_format("Ladder"), "Standard Ranked");
        assert_eq!(normalize_format("Traditional_Ladder"), "Standard Ranked");
        assert_eq!(normalize_format("Standard_Ranked"), "Standard Ranked");
        assert_eq!(normalize_format("Standard_Ladder"), "Standard Ranked");

        // Historic
        assert_eq!(normalize_format("Historic_Play"), "Historic");
        assert_eq!(normalize_format("Historic_Ranked"), "Historic Ranked");
        assert_eq!(normalize_format("Historic_Ladder"), "Historic Ranked");
        assert_eq!(normalize_format("Traditional_Historic_Ladder"), "Historic Ranked");

        // Timeless
        assert_eq!(normalize_format("Timeless_Play"), "Timeless");
        assert_eq!(normalize_format("Timeless_Ranked"), "Timeless Ranked");
        assert_eq!(normalize_format("Timeless_Ladder"), "Timeless Ranked");

        // Alchemy
        assert_eq!(normalize_format("Alchemy_Play"), "Alchemy");
        assert_eq!(normalize_format("Alchemy_Ranked"), "Alchemy Ranked");
        assert_eq!(normalize_format("Alchemy_Ladder"), "Alchemy Ranked");

        // Explorer & Pioneer
        assert_eq!(normalize_format("Explorer_Play"), "Explorer");
        assert_eq!(normalize_format("Explorer_Ranked"), "Explorer Ranked");
        assert_eq!(normalize_format("Explorer_Ladder"), "Explorer Ranked");
        assert_eq!(normalize_format("Pioneer_Play"), "Pioneer");
        assert_eq!(normalize_format("Pioneer_Ranked"), "Pioneer Ranked");
        assert_eq!(normalize_format("Pioneer_Ladder"), "Pioneer Ranked");

        // Brawl variants
        assert_eq!(normalize_format("Play_Brawl"), "Standard Brawl");
        assert_eq!(normalize_format("Brawl_Play"), "Standard Brawl");
        assert_eq!(normalize_format("Standard_Brawl_Play"), "Standard Brawl");
        assert_eq!(normalize_format("Play_Standard_Brawl"), "Standard Brawl");
        assert_eq!(normalize_format("Standard_Brawl"), "Standard Brawl");
        assert_eq!(normalize_format("Brawl_Standard"), "Standard Brawl");
        assert_eq!(normalize_format("Play_Brawl_Historic"), "Brawl");
        assert_eq!(normalize_format("Brawl_Historic"), "Brawl");
        assert_eq!(normalize_format("Historic_Brawl"), "Brawl");
        assert_eq!(normalize_format("Play_HistoricBrawl"), "Brawl");
        assert_eq!(normalize_format("Competitive_Brawl"), "Brawl - Competitive");
        assert_eq!(normalize_format("Brawl_Ranked"), "Brawl - Competitive");
        assert_eq!(normalize_format("Brawl_Ladder"), "Brawl - Competitive");

        // Midweek Magic Tests (regardless of underlying format e.g. Historic Pauper, Brawl, Standard)
        assert_eq!(normalize_format("MWM_HistoricPauper_20260818"), "Midweek Magic");
        assert_eq!(normalize_format("MWM_Brawl_20260811"), "Midweek Magic");
        assert_eq!(normalize_format("MWM_Standard_Brawl_20260101"), "Midweek Magic");
        assert_eq!(normalize_format("MWM_SpecialEvent"), "Midweek Magic");

        // Limited & Casual Tests
        assert_eq!(normalize_format("PremierDraft_WOE_2023"), "Draft");
        assert_eq!(normalize_format("Sealed_FDN_2024"), "Sealed");
        assert_eq!(normalize_format("AIBotMatch_Rebalanced"), "Bot Match");
        assert_eq!(normalize_format("DirectGame_Challenge"), "Direct Challenge");
        assert_eq!(normalize_format("Gladiator_Play"), "Gladiator");
    }

    #[test]
    fn test_assigned_deck_event_detection() {
        // Real event IDs from Player.log (queue -> MatchCreated eventId).
        assert!(is_assigned_deck_event("WelcomeDeckDuels_HOB_20260811"));
        assert!(is_assigned_deck_event("Jump_In_2024"));
        assert!(is_assigned_deck_event("MWM_Momir_20260908"));
        assert!(is_assigned_deck_event("MWM_Omniscience_Dragons"));
        // Casing must not matter on either side.
        assert!(is_assigned_deck_event("welcomedeckduels_hob_20260811"));
        assert!(is_assigned_deck_event("JUMP_IN_2024"));
        assert!(is_assigned_deck_event("jump_in"));
        assert!(is_assigned_deck_event("mwm_momir_20260908"));

        // Deck-submitting queues must NOT be flagged: they always emit a fresh
        // EventSetDeck before MatchCreated, so the cache is never stale there.
        assert!(!is_assigned_deck_event("Historic_Ladder"));
        assert!(!is_assigned_deck_event("Historic_Play"));
        assert!(!is_assigned_deck_event("MWM_BrawlBuilder_20260825"));
        assert!(!is_assigned_deck_event("Standard_Ranked"));
        assert!(!is_assigned_deck_event("Ladder"));
        // Bot matches resolve their deck via the catalog on purpose — keep false.
        assert!(!is_assigned_deck_event("AIBotMatch_Rebalanced"));
        assert!(!is_assigned_deck_event(""));
    }

    #[test]
    fn test_match_created_flags_assigned_deck_event() {
        // Real MatchGameRoomStateChangedEvent payload (trimmed) from Player.log.
        let welcome = r#"{"matchGameRoomStateChangedEvent":{"gameRoomInfo":{"gameRoomConfig":{"reservedPlayers":[{"userId":"opp","playerName":"Discy","systemSeatId":1,"teamId":1,"eventId":"WelcomeDeckDuels_HOB_20260811"},{"userId":"me","playerName":"luckypanda","systemSeatId":2,"teamId":2,"eventId":"WelcomeDeckDuels_HOB_20260811"}],"matchId":"5fca06f3-6d40-4248-88dc-d8aef5cb96d0"},"stateType":"MatchGameRoomStateType_Playing"}}}"#;
        match parse_line(welcome) {
            ParsedEvent::MatchCreated { assigned_deck_event, .. } => {
                assert!(assigned_deck_event, "WelcomeDeckDuels match must be flagged as assigned-deck event");
            }
            other => panic!("expected MatchCreated, got {:?}", other),
        }

        let historic = r#"{"matchGameRoomStateChangedEvent":{"gameRoomInfo":{"gameRoomConfig":{"reservedPlayers":[{"userId":"a","playerName":"Jorge","systemSeatId":1,"teamId":1,"eventId":"Historic_Ladder"},{"userId":"b","playerName":"luckypanda","systemSeatId":2,"teamId":2,"eventId":"Historic_Ladder"}],"matchId":"310bb394-5e44-423d-b3ac-bb3750ba0263"},"stateType":"MatchGameRoomStateType_Playing"}}}"#;
        match parse_line(historic) {
            ParsedEvent::MatchCreated { assigned_deck_event, .. } => {
                assert!(!assigned_deck_event, "Historic_Ladder submits a deck; must not be flagged");
            }
            other => panic!("expected MatchCreated, got {:?}", other),
        }
    }

    #[test]
    fn test_game_state_accumulates_objects_across_messages_on_one_line() {
        let line = r#"[UnityCrossThreadLogger]==> {"greToClientEvent":{"greToClientMessages":[
            {"type":"GREMessageType_GameStateMessage","msgId":1,"gameStateMessage":{"type":"GameStateType_Diff","gameObjects":[{"instanceId":100,"grpId":83677,"type":"GameObjectType_Card","zoneId":35,"ownerSeatId":2}]}},
            {"type":"GREMessageType_GameStateMessage","msgId":2,"gameStateMessage":{"type":"GameStateType_Diff","turnInfo":{"turnNumber":3,"activePlayer":2},"gameObjects":[{"instanceId":200,"grpId":91549,"type":"GameObjectType_Card","zoneId":35,"ownerSeatId":2}]}}
        ]}}"#;

        match parse_line(line) {
            ParsedEvent::GameStateUpdates { steps } => {
                assert_eq!(steps.len(), 2, "should yield 2 discrete steps");
                assert_eq!(steps[0].objects[0].0, 100);
                assert_eq!(steps[1].objects[0].0, 200);
                assert_eq!(steps[1].turn_number, 3);
            }
            other => panic!("expected GameStateUpdates, got {:?}", other),
        }
    }

    #[test]
    fn test_eventsetdeck_v2_parses_deck_id_and_name() {
        // Real Arena logs emit EventSetDeckV2 with Summary.DeckId + Summary.Name.
        // Previously the parser keyed only on EventSetDeckV3/deckSubmit, silently
        // labeling every match "Selected Deck".
        let line = r#"[UnityCrossThreadLogger]==> EventSetDeckV2 {"id":"abc","request":"{\"EventName\":\"Play_Brawl_Historic\",\"Summary\":{\"DeckId\":\"5338cece-283c-4b13-9e06-0e456f39d18c\",\"Name\":\"Artifact Affinity Burn\",\"IsNetDeck\":false},\"Deck\":{\"MainDeck\":[{\"cardId\":75662,\"quantity\":2},{\"cardId\":83789,\"quantity\":1}],\"CommandZone\":[{\"cardId\":91039,\"quantity\":1}]}}"}"#;

        match parse_line(line) {
            ParsedEvent::DeckSubmitted { deck_name, deck_id, commander_id, main_deck, total_cards } => {
                assert_eq!(deck_name, "Artifact Affinity Burn");
                assert_eq!(deck_id.as_deref(), Some("5338cece-283c-4b13-9e06-0e456f39d18c"));
                assert_eq!(commander_id, Some(91039));
                assert_eq!(main_deck.len(), 3);
                assert_eq!(total_cards, 3);
            }
            other => panic!("expected DeckSubmitted, got {:?}", other),
        }
    }

    #[test]
    fn test_eventsetdeck_v2_response_line_ignored() {
        // The `<== EventSetDeckV2(id)` acknowledgement line has no JSON body and
        // must not be mistaken for a deck submission.
        let line = "[UnityCrossThreadLogger]<== EventSetDeckV2(02dfca08-fdc0-4432-9727-3bac97e3e96e)";
        match parse_line(line) {
            ParsedEvent::Unknown => {}
            other => panic!("expected Unknown for bare response line, got {:?}", other),
        }
    }

    #[test]
    fn test_deck_catalog_batch_parsing() {
        let line = r#"{"Courses":[{"CourseId":"c1","CourseDeckSummary":{"DeckId":"d1","Name":"MonoWhite - Auras (Standard)"},"CourseDeck":{"MainDeck":[{"cardId":86715,"quantity":4}]}}]}"#;
        match parse_line(line) {
            ParsedEvent::DeckCatalogBatch { decks } => {
                assert_eq!(decks.len(), 1);
                assert_eq!(decks[0].0, "d1");
                assert_eq!(decks[0].1, "MonoWhite - Auras (Standard)");
                assert_eq!(decks[0].3.len(), 4);
            }
            other => panic!("expected DeckCatalogBatch, got {:?}", other),
        }
    }

    #[test]
    fn test_zone_transfer_draw_annotation_parsing() {
        let line = r#"{"greToClientEvent":{"greToClientMessages":[
            {"type":"GREMessageType_GameStateMessage","msgId":10,"gameStateMessage":{"type":"GameStateType_Diff","gameObjects":[{"instanceId":870,"grpId":90869,"type":"GameObjectType_Ability","zoneId":27,"ownerSeatId":1}],"annotations":[
                {"id":489,"affectorId":870,"affectedIds":[874,875],"type":["AnnotationType_ZoneTransfer"],"details":[{"key":"zone_src","type":"KeyValuePairValueType_int32","valueInt32":[32]},{"key":"zone_dest","type":"KeyValuePairValueType_int32","valueInt32":[31]},{"key":"category","type":"KeyValuePairValueType_string","valueString":["Draw"]}]}
            ]}}
        ]}}"#;

        match parse_line(line) {
            ParsedEvent::GameStateUpdates { steps } => {
                assert_eq!(steps.len(), 1);
                assert_eq!(steps[0].objects.len(), 1);
                assert_eq!(steps[0].draw_events.len(), 1);
                assert_eq!(steps[0].draw_events[0].0, 870, "affectorId should match");
                assert_eq!(steps[0].draw_events[0].1, 31, "zone_dest should match (hero hand)");
                assert_eq!(steps[0].draw_events[0].2, 2, "affectedIds count should match");
            }
            other => panic!("expected GameStateUpdates, got {:?}", other),
        }
    }

    #[test]
    fn test_ability_association_parsing() {
        let line = r#"{"greToClientEvent":{"greToClientMessages":[
            {"type":"GREMessageType_GameStateMessage","msgId":11,"gameStateMessage":{"type":"GameStateType_Diff","gameObjects":[
                {"instanceId":327,"grpId":86788,"type":"GameObjectType_Ability","parentId":324,"objectSourceGrpId":91549,"zoneId":27,"ownerSeatId":2}
            ],"annotations":[
                {"id":519,"affectorId":324,"affectedIds":[327],"type":["AnnotationType_AbilityInstanceCreated"]},
                {"id":525,"affectorId":324,"affectedIds":[327],"type":["AnnotationType_AbilityInstanceDeleted"]}
            ]}}
        ]}}"#;

        match parse_line(line) {
            ParsedEvent::GameStateUpdates { steps } => {
                assert_eq!(steps.len(), 1);
                assert_eq!(steps[0].objects.len(), 1);
                assert!(steps[0].ability_associations.contains(&(327, 324)));
            }
            other => panic!("expected GameStateUpdates, got {:?}", other),
        }
    }

    #[test]
    fn test_counter_added_annotation_parsing() {
        let line = r#"{"greToClientEvent":{"greToClientMessages":[
            {"type":"GREMessageType_GameStateMessage","msgId":12,"gameStateMessage":{"type":"GameStateType_Diff","annotations":[
                {"id":221,"affectorId":552,"affectedIds":[548],"type":["AnnotationType_CounterAdded"],"details":[{"key":"counter_type","type":"KeyValuePairValueType_int32","valueInt32":[1]},{"key":"transaction_amount","type":"KeyValuePairValueType_int32","valueInt32":[1]}]}
            ]}}
        ]}}"#;

        match parse_line(line) {
            ParsedEvent::GameStateUpdates { steps } => {
                assert_eq!(steps.len(), 1);
                assert_eq!(steps[0].counter_events.len(), 1);
                assert_eq!(steps[0].counter_events[0], (548, 1, 1));
            }
            other => panic!("expected GameStateUpdates with counter event, got {:?}", other),
        }
    }

    #[test]
    fn test_mulligan_payload_wrapped_parsing() {
        let line_mulligan = r#"{"clientToMatchServiceMessageType":"ClientToMatchServiceMessageType_ClientToGREMessage","payload":{"type":"ClientMessageType_MulliganResp","mulliganResp":{"decision":"MulliganOption_Mulligan"}}}"#;
        match parse_line(line_mulligan) {
            ParsedEvent::MulliganEvent { is_mulligan, .. } => {
                assert!(is_mulligan, "Should detect mulligan from payload");
            }
            other => panic!("expected MulliganEvent, got {:?}", other),
        }

        let line_accept = r#"{"clientToMatchServiceMessageType":"ClientToMatchServiceMessageType_ClientToGREMessage","payload":{"type":"ClientMessageType_MulliganResp","mulliganResp":{"decision":"MulliganOption_Accept"}}}"#;
        match parse_line(line_accept) {
            ParsedEvent::MulliganEvent { is_mulligan, .. } => {
                assert!(!is_mulligan, "Should detect accept from payload");
            }
            other => panic!("expected MulliganEvent accept, got {:?}", other),
        }
    }

    #[test]
    fn test_extract_inventory_info() {
        let line = r#"{ "InventoryInfo": { "SeqId": 1, "Gems": 3590, "Gold": 57200, "TotalVaultProgress": 1886, "WcTrackPosition": 5, "WildCardCommons": 118, "WildCardUnCommons": 108, "WildCardRares": 8, "WildCardMythics": 2, "CustomTokens": { "DraftToken": 8, "Token_JumpIn": 2, "BonusPackProgress": 5 } } }"#;
        match parse_line(line) {
            ParsedEvent::InventoryUpdate(eco) => {
                assert_eq!(eco.gems, 3590);
                assert_eq!(eco.gold, 57200);
                assert_eq!(eco.vault_progress_tenths, 1886);
                assert_eq!(eco.wc_track_pos, 5);
                assert_eq!(eco.wc_common, 118);
                assert_eq!(eco.wc_uncommon, 108);
                assert_eq!(eco.wc_rare, 8);
                assert_eq!(eco.wc_mythic, 2);
                assert_eq!(eco.draft_tokens, 8);
                assert_eq!(eco.jump_in_tokens, 2);
                assert_eq!(eco.golden_pack_progress, 5);
            }
            other => panic!("expected InventoryUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_extract_booster_opening() {
        let line = r#"{"payload":{"OpenBooster":{"BoosterId":"FDN_Pack_1","CardsAdded":[{"grpId":86715},{"grpId":91549}],"Wildcards":{"WildCardRare":1},"VaultProgressDelta":0.3}}}"#;
        match parse_line(line) {
            ParsedEvent::BoosterOpened(booster) => {
                assert_eq!(booster.pack_id.as_deref(), Some("FDN_Pack_1"));
                assert_eq!(booster.cards_added, vec![86715, 91549]);
                assert_eq!(booster.wildcards.get("WildCardRare").copied(), Some(1));
                assert_eq!(booster.vault_progress_delta, Some(0.3));
            }
            other => panic!("expected BoosterOpened, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_quest_update() {
        let line = r#"{"canSwap":true,"quests":[{"questId":"39892322-3ea8-4131-911d-fa6386c7b2d4","locKey":"Quests/Quest_Nissas_Journey","goal":25,"startingProgress":18,"endingProgress":20,"canSwap":true,"chestDescription":{"quantity":"500","locParams":{"number1":500,"number2":500}}}]}"#;
        match parse_line(line) {
            ParsedEvent::QuestUpdate { quests, can_swap } => {
                assert!(can_swap);
                assert_eq!(quests.len(), 1);
                let q = &quests[0];
                assert_eq!(q.quest_id, "39892322-3ea8-4131-911d-fa6386c7b2d4");
                assert_eq!(q.loc_key, "Quests/Quest_Nissas_Journey");
                assert_eq!(q.goal, 25);
                assert_eq!(q.starting_progress, 18);
                assert_eq!(q.ending_progress, 20);
                assert!(q.can_swap);
                assert_eq!(q.reward_gold, 500);
                assert_eq!(q.reward_xp, 500);
            }
            other => panic!("expected QuestUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_periodic_rewards_update() {
        let line = r#"{"_dailyRewardResetTimestamp":"2026-09-30T09:00:00Z","_weeklyRewardResetTimestamp":"2026-10-04T09:00:00Z","_dailyRewardChestDescriptions":{}}"#;
        match parse_line(line) {
            ParsedEvent::PeriodicRewardsUpdate { daily_reset_timestamp, weekly_reset_timestamp, daily_wins, weekly_wins } => {
                assert_eq!(daily_reset_timestamp, "2026-09-30T09:00:00Z");
                assert_eq!(weekly_reset_timestamp, "2026-10-04T09:00:00Z");
                assert_eq!(daily_wins, None);
                assert_eq!(weekly_wins, None);
            }
            other => panic!("expected PeriodicRewardsUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_starthook_compound_with_periodic_rewards() {
        let line = r#"{"InventoryInfo":{"SeqId":1,"Gems":3590,"Gold":57200,"TotalVaultProgress":1886,"WcTrackPosition":5,"WildCardCommons":118,"WildCardUnCommons":108,"WildCardRares":11,"WildCardMythics":3},"ClientPeriodicRewards":{"DailyRewardSequenceId":-1,"DailyRewardResetTimestampInternal":"2026-09-30T09:00:00Z","WeeklyRewardSequenceId":-1,"WeeklyRewardResetTimestampInternal":"2026-10-04T09:00:00Z"}}"#;
        match parse_line(line) {
            ParsedEvent::Compound(events) => {
                assert_eq!(events.len(), 2);
                match &events[0] {
                    ParsedEvent::InventoryUpdate(eco) => {
                        assert_eq!(eco.gold, 57200);
                        assert_eq!(eco.gems, 3590);
                    }
                    other => panic!("expected InventoryUpdate, got {:?}", other),
                }
                match &events[1] {
                    ParsedEvent::PeriodicRewardsUpdate { daily_reset_timestamp, weekly_reset_timestamp, daily_wins, weekly_wins } => {
                        assert_eq!(daily_reset_timestamp, "2026-09-30T09:00:00Z");
                        assert_eq!(weekly_reset_timestamp, "2026-10-04T09:00:00Z");
                        assert_eq!(*daily_wins, Some(0));
                        assert_eq!(*weekly_wins, Some(0));
                    }
                    other => panic!("expected PeriodicRewardsUpdate, got {:?}", other),
                }
            }
            other => panic!("expected Compound event, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_rank_combined_info() {
        let line = r#"{"constructedSeasonOrdinal":93,"constructedLevel":3,"constructedStep":4,"constructedMatchesWon":2,"constructedMatchesLost":4,"limitedSeasonOrdinal":93,"limitedLevel":4}"#;
        match parse_line(line) {
            ParsedEvent::RankUpdate(rank) => {
                assert_eq!(rank.season_ordinal, 93);
                assert_eq!(rank.constructed_tier, "Bronze"); // default when omitted
                assert_eq!(rank.constructed_level, 3);
                assert_eq!(rank.constructed_step, 4);
                assert_eq!(rank.constructed_wins, 2);
                assert_eq!(rank.constructed_losses, 4);
                assert_eq!(rank.limited_tier, "Bronze");
                assert_eq!(rank.limited_level, 4);
                assert_eq!(rank.limited_step, 0);
            }
            other => panic!("expected RankUpdate, got {:?}", other),
        }

        let line_with_class = r#"{"constructedSeasonOrdinal":93,"constructedClass":"Gold","constructedLevel":1,"constructedStep":5,"constructedMatchesWon":12,"constructedMatchesLost":3,"limitedSeasonOrdinal":93,"limitedClass":"Silver","limitedLevel":2,"limitedStep":1,"limitedMatchesWon":4,"limitedMatchesLost":1}"#;
        match parse_line(line_with_class) {
            ParsedEvent::RankUpdate(rank) => {
                assert_eq!(rank.constructed_tier, "Gold");
                assert_eq!(rank.constructed_level, 1);
                assert_eq!(rank.constructed_step, 5);
                assert_eq!(rank.limited_tier, "Silver");
                assert_eq!(rank.limited_level, 2);
                assert_eq!(rank.limited_step, 1);
            }
            other => panic!("expected RankUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_season_details() {
        let line = r#"{"currentSeason":{"seasonOrdinal":93,"seasonStartTime":"2026-08-31T19:05:00","seasonEndTime":"2026-09-30T19:00:00"}}"#;
        match parse_line(line) {
            ParsedEvent::SeasonUpdate(season) => {
                assert_eq!(season.season_ordinal, 93);
                assert_eq!(season.season_start_time, Some("2026-08-31T19:05:00".to_string()));
                assert_eq!(season.season_end_time, Some("2026-09-30T19:00:00".to_string()));
            }
            other => panic!("expected SeasonUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_mastery_pass() {
        let line = r#"{"GraphId":"BattlePass_FRA","NodeStates":{"MasteryPassCSAdmin":{"Status":"Available"},"RewardTierUpgrade":{"Status":"Completed"},"LevelTrack_Level_1":{"Status":"Completed"},"LevelTrack_Level_1_Reward":{"Status":"Completed","TierRewardNodeState":{"CurrentTiers":["basic","premium"]}},"LevelTrack_Level_2":{"Status":"Completed"},"LevelTrack_Level_3":{"Status":"Available","ProgressNodeState":{"CurrentProgress":750}}}}"#;
        match parse_line(line) {
            ParsedEvent::MasteryPassUpdate(pass) => {
                assert_eq!(pass.pass_id, "BattlePass_FRA");
                assert_eq!(pass.set_code, "FRA");
                assert_eq!(pass.current_level, 3);
                assert_eq!(pass.current_xp, 750);
                assert_eq!(pass.xp_per_level, 1000);
                assert!(pass.is_premium);
                assert_eq!(pass.claimed_levels, vec![1, 2]);
                assert_eq!(pass.max_level, 44);
            }
            other => panic!("expected MasteryPassUpdate, got {:?}", other),
        }
    }
}
