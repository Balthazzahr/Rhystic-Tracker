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
    MatchCreated { match_id: String, format_name: String, reserved_players: serde_json::Value },
    DeckSubmitted { deck_name: String, total_cards: usize, main_deck: Vec<u32>, commander_id: Option<u32>, deck_id: Option<String> },
    DeckCatalogBatch { decks: Vec<(String, String, Option<u32>, Vec<u32>)> },
    GameStateUpdateCombined {
        msg_id: Option<u64>,
        objects: Vec<(u32, Option<u32>, Option<u32>, u32)>,
        turn_number: u32,
        life_by_seat: Vec<(u32, i32)>,
        active_seat: u32,
        damage_events: Vec<(u32, u32, i32, u32)>,
        diff_deleted_ids: Vec<u32>,
        mulligan_events: Vec<(u32, bool, Option<u32>)>, // (seat_id, is_mulligan, num_cards)
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

                    let format_name = normalize_format(&raw_format);

                    return ParsedEvent::MatchCreated {
                        match_id: mid,
                        format_name,
                        reserved_players,
                    };
                }
            }
        }
    }

    // 3. Deck Catalog Ingestion (StartHook / DeckSummaries / EventGetCourses / Courses)
    if line.contains("DeckSummaries") || line.contains("Courses") || line.contains("EventGetCourses") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let mut catalog = Vec::new();

                // Check DeckSummaries (e.g. from StartHook or DeckGetSummaries)
                if let Some(summaries) = v.get("DeckSummaries").and_then(|s| s.as_array()) {
                    let decks_map = v.get("Decks");
                    for sum in summaries {
                        let did = sum.get("DeckId").and_then(|d| d.as_str()).unwrap_or("").to_string();
                        let dname = sum.get("Name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                        if !did.is_empty() || !dname.is_empty() {
                            let mut main_deck = Vec::new();
                            let mut cmd_id = None;
                            if let Some(dobj) = decks_map.and_then(|m| m.get(&did)) {
                                if let Some(main) = dobj.get("MainDeck").and_then(|m| m.as_array()) {
                                    for c in main {
                                        if let Some(cid) = c.get("cardId").and_then(|x| x.as_u64()) {
                                            let qty = c.get("quantity").and_then(|q| q.as_u64()).unwrap_or(1);
                                            for _ in 0..qty {
                                                main_deck.push(cid as u32);
                                            }
                                        }
                                    }
                                }
                                if let Some(cmd) = dobj.get("CommandZone").and_then(|c| c.as_array()) {
                                    if let Some(first) = cmd.first() {
                                        cmd_id = first.get("cardId").and_then(|c| c.as_u64()).map(|c| c as u32);
                                    }
                                }
                            }
                            catalog.push((did, dname, cmd_id, main_deck));
                        }
                    }
                }

                // Check Courses array (e.g. from EventGetCourses / EventGetCoursesV2)
                if let Some(courses) = v.get("Courses").and_then(|c| c.as_array()) {
                    for course in courses {
                        if let Some(sum) = course.get("CourseDeckSummary") {
                            let did = sum.get("DeckId").and_then(|d| d.as_str()).unwrap_or("").to_string();
                            let dname = sum.get("Name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                            let mut main_deck = Vec::new();
                            let mut cmd_id = None;
                            if let Some(deck) = course.get("CourseDeck") {
                                if let Some(main) = deck.get("MainDeck").and_then(|m| m.as_array()) {
                                    for c in main {
                                        if let Some(cid) = c.get("cardId").and_then(|x| x.as_u64()) {
                                            let qty = c.get("quantity").and_then(|q| q.as_u64()).unwrap_or(1);
                                            for _ in 0..qty {
                                                main_deck.push(cid as u32);
                                            }
                                        }
                                    }
                                }
                                if let Some(cmd) = deck.get("CommandZone").and_then(|c| c.as_array()) {
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

    // 4. Game State & In-Game Prompt Messages
    if line.contains("GREMessageType_GameStateMessage") || line.contains("GREMessageType_PromptReq") || line.contains("GREMessageType_MulliganReq") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let messages = v.get("greToClientEvent")
                    .and_then(|e| e.get("greToClientMessages"))
                    .and_then(|m| m.as_array());

                if let Some(msgs) = messages {
                    let mut batch: Vec<(u32, Option<u32>, Option<u32>, u32)> = Vec::new();
                    let mut last_turn: u32 = 0;
                    let mut life_by_seat: Vec<(u32, i32)> = Vec::new();
                    let mut last_active: u32 = 1;
                    let mut damage_events: Vec<(u32, u32, i32, u32)> = Vec::new();
                    let mut diff_deleted_ids: Vec<u32> = Vec::new();
                    let mut mulligan_events: Vec<(u32, bool, Option<u32>)> = Vec::new();
                    let mut any_content = false;

                    for msg in msgs {
                        let mtype = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if mtype == "GREMessageType_GameStateMessage" {
                            let msg_id = msg.get("msgId").and_then(|m| m.as_u64());
                            if let Some(gsm) = msg.get("gameStateMessage") {
                                if let Some(objs) = gsm.get("gameObjects").and_then(|o| o.as_array()) {
                                    for obj in objs {
                                        let obj_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                        // Only extract card objects (ignore raw abilities)
                                        if obj_type.contains("Card") || obj_type.is_empty() {
                                            if let (Some(inst_id), Some(zone_id)) = (
                                                obj.get("instanceId").and_then(|i| i.as_u64()),
                                                obj.get("zoneId").and_then(|z| z.as_u64())
                                            ) {
                                                let grp_id = obj.get("grpId")
                                                    .or_else(|| obj.get("overlayGrpId"))
                                                    .or_else(|| obj.get("objectSourceGrpId"))
                                                    .and_then(|g| g.as_u64())
                                                    .map(|g| g as u32);
                                                let owner_seat = obj.get("ownerSeatId").or_else(|| obj.get("controllerSeatId")).and_then(|s| s.as_u64()).map(|s| s as u32);
                                                batch.push((inst_id as u32, grp_id, owner_seat, zone_id as u32));
                                            }
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

                                // Extract impactful-play annotations for damage attribution.
                                if let Some(anns) = gsm.get("annotations").and_then(|a| a.as_array()) {
                                    for a in anns {
                                        let ann_type = a.get("type").and_then(|t| t.as_array())
                                            .and_then(|arr| arr.first())
                                            .and_then(|t| t.as_str())
                                            .unwrap_or("");
                                        if !ann_type.contains("DamageDealt") {
                                            continue;
                                        }
                                        let affector_id = a.get("affectorId").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                                        if affector_id == 0 {
                                            continue;
                                        }
                                        let target_id = a.get("affectedIds").and_then(|arr| arr.as_array())
                                            .and_then(|arr| arr.first())
                                            .and_then(|x| x.as_u64())
                                            .unwrap_or(0) as u32;

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
                                            damage_events.push((affector_id, target_id, amount, dtype));
                                        }
                                    }
                                }

                                if !batch.is_empty() || last_turn > 0 || !life_by_seat.is_empty() || !damage_events.is_empty() || !diff_deleted_ids.is_empty() {
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
                            diff_deleted_ids,
                            mulligan_events,
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
            "Standard Brawl".to_string()
        } else {
            "Brawl".to_string()
        }
    } else if s.contains("timeless") {
        if s.contains("ranked") {
            "Timeless (Ranked)".to_string()
        } else {
            "Timeless".to_string()
        }
    } else if s.contains("historic") {
        if s.contains("ranked") {
            "Historic (Ranked)".to_string()
        } else {
            "Historic".to_string()
        }
    } else if s.contains("alchemy") {
        if s.contains("ranked") {
            "Alchemy (Ranked)".to_string()
        } else {
            "Alchemy".to_string()
        }
    } else if s.contains("explorer") || s.contains("pioneer") {
        if s.contains("ranked") {
            "Explorer (Ranked)".to_string()
        } else {
            "Explorer".to_string()
        }
    } else if s.contains("draft") {
        "Draft".to_string()
    } else if s.contains("sealed") {
        "Sealed".to_string()
    } else if s.contains("limited") {
        "Limited".to_string()
    } else if s == "play" || s.contains("standard") {
        if s.contains("ranked") {
            "Standard (Ranked)".to_string()
        } else {
            "Standard".to_string()
        }
    } else {
        raw_event_id.replace('_', " ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_normalization() {
        assert_eq!(normalize_format("Play"), "Standard");
        assert_eq!(normalize_format("Standard_Ranked"), "Standard (Ranked)");
        assert_eq!(normalize_format("Historic_Play"), "Historic");
        assert_eq!(normalize_format("Historic_Ranked"), "Historic (Ranked)");
        assert_eq!(normalize_format("Timeless_Play"), "Timeless");
        assert_eq!(normalize_format("Timeless_Ranked"), "Timeless (Ranked)");
        assert_eq!(normalize_format("Alchemy_Play"), "Alchemy");
        assert_eq!(normalize_format("Explorer_Ranked"), "Explorer (Ranked)");

        // Brawl vs Standard Brawl Distinction Tests
        assert_eq!(normalize_format("Brawl_Play"), "Brawl");
        assert_eq!(normalize_format("Standard_Brawl_Play"), "Standard Brawl");

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
                assert!(objects.iter().any(|(inst, _, _, _)| *inst == 200));
                assert!(objects.iter().any(|(inst, _, _, _)| *inst == 100));
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
    fn test_headless_course_summary_parsing() {
        let line = r#"{"CourseDeckSummary":{"DeckId":"d2","Name":"MonoWhite - Auras (Standard)"}}"#;
        match parse_line(line) {
            ParsedEvent::DeckSubmitted { deck_name, deck_id, total_cards, .. } => {
                assert_eq!(deck_name, "MonoWhite - Auras (Standard)");
                assert_eq!(deck_id.as_deref(), Some("d2"));
                assert_eq!(total_cards, 0);
            }
            other => panic!("expected DeckSubmitted, got {:?}", other),
        }
    }
}
