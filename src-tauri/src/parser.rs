use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthPayload {
    #[serde(rename = "clientId")]
    pub client_id: Option<String>,
    #[serde(rename = "screenName")]
    pub screen_name: Option<String>,
}

#[derive(Debug, Clone)]
pub enum ParsedEvent {
    Auth { screen_name: String, client_id: String },
    MatchCreated { match_id: String, format_name: String, assigned_deck_event: bool, reserved_players: serde_json::Value },
    DeckSubmitted { deck_name: String, total_cards: usize, main_deck: Vec<u32>, commander_id: Option<u32>, deck_id: Option<String> },
    DeckCatalogBatch { decks: Vec<(String, String, Option<u32>, Vec<u32>)> },
    GameStateUpdateCombined {
        msg_id: Option<u64>,
        objects: Vec<(u32, Option<u32>, Option<u32>, u32, bool)>, // (inst_id, grp_id, owner_seat, zone_id, is_card)
        turn_number: u32,
        life_by_seat: Vec<(u32, i32)>,
        active_seat: u32,
        damage_events: Vec<(u32, u32, i32, u32)>,
        draw_events: Vec<(u32, u32)>,
        diff_deleted_ids: Vec<u32>,
        mulligan_events: Vec<(u32, bool, Option<u32>)>, // (seat_id, is_mulligan, num_cards)
        ability_associations: Vec<(u32, u32)>,    // (ability_instance_id, parent_instance_id)
    },
    MulliganEvent { seat_id: u32, is_mulligan: bool, num_cards: Option<u32> },
    MatchCompleted { match_id: String, winning_team_id: u32, reason: String },
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
                            let dname = sum.get("Name").or_else(|| sum.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string();
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
                    return ParsedEvent::DeckSubmitted {
                        deck_name,
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
                    let mut batch: Vec<(u32, Option<u32>, Option<u32>, u32, bool)> = Vec::new();
                    let mut last_turn: u32 = 0;
                    let mut life_by_seat: Vec<(u32, i32)> = Vec::new();
                    let mut last_active: u32 = 1;
                    let mut damage_events: Vec<(u32, u32, i32, u32)> = Vec::new();
                    let mut draw_events: Vec<(u32, u32)> = Vec::new();
                    let mut diff_deleted_ids: Vec<u32> = Vec::new();
                    let mut mulligan_events: Vec<(u32, bool, Option<u32>)> = Vec::new();
                    let mut ability_associations: Vec<(u32, u32)> = Vec::new();
                    let mut any_content = false;

                    for msg in msgs {
                        let mtype = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if mtype == "GREMessageType_GameStateMessage" {
                            let msg_id = msg.get("msgId").and_then(|m| m.as_u64());
                            if let Some(gsm) = msg.get("gameStateMessage") {
                                if let Some(objs) = gsm.get("gameObjects").and_then(|o| o.as_array()) {
                                    for obj in objs {
                                        let obj_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                        let is_ability = obj_type.contains("Ability") || obj_type.contains("Trigger") || obj.get("objectSourceGrpId").is_some();
                                        let is_card = !is_ability;

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
                                            if let Some(pid) = obj.get("parentId").and_then(|p| p.as_u64()).map(|p| p as u32) {
                                                if pid > 0 {
                                                    ability_associations.push((inst_id as u32, pid));
                                                }
                                            }
                                            batch.push((inst_id as u32, grp_id, owner_seat, zone_id, is_card));
                                        }
                                    }
                                }

                                if let Some(dels) = gsm.get("diffDeletedInstanceIds").and_then(|d| d.as_array()) {
                                    for d in dels {
                                        if let Some(did) = d.as_u64() {
                                            diff_deleted_ids.push(did as u32);
                                        }
                                    }
                                }

                                let turn_info = gsm.get("turnInfo");
                                let turn_number = turn_info.and_then(|t| t.get("turnNumber")).and_then(|n| n.as_u64()).unwrap_or(0) as u32;
                                if turn_number > 0 {
                                    last_turn = turn_number;
                                    let active_seat = turn_info
                                        .and_then(|t| t.get("activeSeatId").or_else(|| t.get("activePlayer")))
                                        .and_then(|s| s.as_u64())
                                        .unwrap_or(1) as u32;
                                    last_active = active_seat;
                                }

                                if let Some(players) = gsm.get("players").and_then(|p| p.as_array()) {
                                    for p in players {
                                        let seat_id = p.get("systemSeatNumber")
                                            .or_else(|| p.get("systemSeatId"))
                                            .and_then(|s| s.as_u64())
                                            .unwrap_or(0);

                                        if let Some(life) = p.get("lifeTotal").and_then(|l| l.as_i64()).map(|l| l as i32) {
                                            if seat_id > 0 {
                                                life_by_seat.push((seat_id as u32, life));
                                            }
                                        }
                                    }
                                }

                                // Extract annotations for damage attribution, ability parent links, and extra card draw tracking.
                                if let Some(anns) = gsm.get("annotations").and_then(|a| a.as_array()) {
                                    for a in anns {
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
                                                    damage_events.push((affector_id, 0, amount, dtype));
                                                } else {
                                                    for target_id in affected_ids {
                                                        damage_events.push((affector_id, target_id, amount, dtype));
                                                    }
                                                }
                                            }
                                        } else if ann_type.contains("AbilityInstanceCreated") || ann_type.contains("AbilityInstanceDeleted") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            if affector_id > 0 {
                                                if let Some(affected_ids) = a.get("affectedIds").and_then(|arr| arr.as_array()) {
                                                    for aff_id in affected_ids.iter().filter_map(|x| x.as_u64().map(|v| v as u32)) {
                                                        ability_associations.push((aff_id, affector_id));
                                                    }
                                                }
                                            }
                                        } else if ann_type.contains("ZoneTransfer") {
                                            let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                            if affector_id > 0 {
                                                let affected_ids: Vec<u32> = a.get("affectedIds")
                                                    .and_then(|arr| arr.as_array())
                                                    .map(|arr| arr.iter().filter_map(|x| x.as_u64().map(|v| v as u32)).collect())
                                                    .unwrap_or_default();

                                                let mut is_draw = false;
                                                if let Some(details) = a.get("details").and_then(|d| d.as_array()) {
                                                    for d in details {
                                                        let key = d.get("key").and_then(|k| k.as_str()).unwrap_or("");
                                                        if key == "category" {
                                                            let cat_str = d.get("valueString").and_then(|v| v.as_array())
                                                                .and_then(|arr| arr.first())
                                                                .and_then(|s| s.as_str())
                                                                .unwrap_or("");
                                                            if cat_str.eq_ignore_ascii_case("Draw") {
                                                                is_draw = true;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }

                                                if is_draw {
                                                    let count = if affected_ids.is_empty() { 1 } else { affected_ids.len() as u32 };
                                                    draw_events.push((affector_id, count));
                                                }
                                            }
                                        }
                                    }
                                }

                                if !batch.is_empty() || last_turn > 0 || !life_by_seat.is_empty() || !damage_events.is_empty() || !draw_events.is_empty() || !diff_deleted_ids.is_empty() || !ability_associations.is_empty() {
                                    any_content = true;
                                }
                                let _ = msg_id;
                            }
                        } else if mtype == "GREMessageType_PromptReq" {
                            if let Some(prompt) = msg.get("prompt") {
                                let prompt_id = prompt.get("promptId").and_then(|p| p.as_u64()).unwrap_or(0);
                                let mut player_id = 0u32;
                                let mut num_cards = None;
                                if let Some(params) = prompt.get("parameters").and_then(|p| p.as_array()) {
                                    for param in params {
                                        let pname = param.get("parameterName").and_then(|p| p.as_str()).unwrap_or("");
                                        if pname == "PlayerId" {
                                            if let Some(ref_obj) = param.get("reference") {
                                                player_id = ref_obj.get("id").and_then(|i| i.as_u64()).unwrap_or(0) as u32;
                                            }
                                        } else if pname == "NumberOfCards" {
                                            num_cards = param.get("numberValue").and_then(|n| n.as_u64()).map(|n| n as u32);
                                        }
                                    }
                                }
                                if prompt_id == 36 && player_id > 0 {
                                    mulligan_events.push((player_id, true, num_cards));
                                    any_content = true;
                                } else if prompt_id == 37 && player_id > 0 {
                                    mulligan_events.push((player_id, false, None));
                                    any_content = true;
                                }
                            }
                        }
                    }

                    if any_content {
                        return ParsedEvent::GameStateUpdateCombined {
                            msg_id: None,
                            objects: batch,
                            turn_number: last_turn,
                            life_by_seat,
                            active_seat: last_active,
                            damage_events,
                            draw_events,
                            diff_deleted_ids,
                            mulligan_events,
                            ability_associations,
                        };
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
                    .or_else(|| v.get("clientToGreMessage").and_then(|c| c.get("mulliganResp")));
                if let Some(resp) = target_obj {
                    let decision = resp.get("decision").and_then(|d| d.as_str()).unwrap_or("");
                    if decision.contains("Mulligan") {
                        return ParsedEvent::MulliganEvent { seat_id: 0, is_mulligan: true, num_cards: None };
                    } else if decision.contains("Accept") || decision.contains("Keep") {
                        return ParsedEvent::MulliganEvent { seat_id: 0, is_mulligan: false, num_cards: None };
                    }
                }
            }
        }
    }

    ParsedEvent::Unknown
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
        if s.contains("standard") {
            "Brawl - Standard".to_string()
        } else if s.contains("ranked") || s.contains("competitive") || s.contains("ladder") {
            "Brawl - Competitive".to_string()
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
    lower.contains("welcomedeckduels") || lower.contains("jump_in")
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
        assert_eq!(normalize_format("Brawl_Play"), "Brawl");
        assert_eq!(normalize_format("Standard_Brawl_Play"), "Brawl - Standard");
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
        // Casing must not matter on either side.
        assert!(is_assigned_deck_event("welcomedeckduels_hob_20260811"));
        assert!(is_assigned_deck_event("JUMP_IN_2024"));
        assert!(is_assigned_deck_event("jump_in"));

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
        // A single MTGA log line can contain many GameStateMessage entries. The parser
        // must accumulate objects from ALL of them (not return on the first one) so that
        // per-turn draws/plays that appear in later messages on the same line are kept.
        let line = r#"[UnityCrossThreadLogger]==> {"greToClientEvent":{"greToClientMessages":[
            {"type":"GREMessageType_GameStateMessage","msgId":1,"gameStateMessage":{"type":"GameStateType_Diff","gameObjects":[{"instanceId":100,"grpId":83677,"type":"GameObjectType_Card","zoneId":35,"ownerSeatId":2}]}},
            {"type":"GREMessageType_GameStateMessage","msgId":2,"gameStateMessage":{"type":"GameStateType_Diff","turnInfo":{"turnNumber":3,"activePlayer":2},"gameObjects":[{"instanceId":200,"grpId":91549,"type":"GameObjectType_Card","zoneId":35,"ownerSeatId":2}]}}
        ]}}"#;

        match parse_line(line) {
            ParsedEvent::GameStateUpdateCombined { objects, turn_number, .. } => {
                assert_eq!(objects.len(), 2, "should accumulate objects from both messages");
                assert_eq!(turn_number, 3, "should use the turn from the latest message");
                assert!(objects.iter().any(|(inst, _, _, _, _)| *inst == 200));
                assert!(objects.iter().any(|(inst, _, _, _, _)| *inst == 100));
            }
            other => panic!("expected GameStateUpdateCombined, got {:?}", other),
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
            ParsedEvent::GameStateUpdateCombined { draw_events, objects, .. } => {
                assert_eq!(objects.len(), 1);
                assert_eq!(draw_events.len(), 1);
                assert_eq!(draw_events[0].0, 870, "affectorId should match");
                assert_eq!(draw_events[0].1, 2, "affectedIds count should match");
            }
            other => panic!("expected GameStateUpdateCombined, got {:?}", other),
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
            ParsedEvent::GameStateUpdateCombined { ability_associations, objects, .. } => {
                assert_eq!(objects.len(), 1);
                assert!(ability_associations.contains(&(327, 324)));
            }
            other => panic!("expected GameStateUpdateCombined, got {:?}", other),
        }
    }
}
