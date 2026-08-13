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
    DeckSubmitted { deck_name: String, total_cards: usize, main_deck: Vec<u32>, commander_id: Option<u32> },
    GameStateUpdateCombined { msg_id: Option<u64>, objects: Vec<(u32, Option<u32>, Option<u32>, u32)>, turn_number: u32, player_life: Option<i32>, opponent_life: Option<i32>, active_seat: u32 },
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

    // 3. Deck Selection / Submission (Event 3)
    if line.contains("EventSetDeckV3") || line.contains("deckSubmit") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let mut deck_name = String::new();
                let mut main_deck = Vec::new();
                let mut commander_id = None;

                if let Some(req_str) = v.get("request").and_then(|r| r.as_str()) {
                    if let Ok(req_val) = serde_json::from_str::<serde_json::Value>(req_str) {
                        if let Some(summary) = req_val.get("Summary") {
                            if let Some(name) = summary.get("Name").and_then(|n| n.as_str()) {
                                deck_name = name.to_string();
                            }
                        }
                        if let Some(deck) = req_val.get("Deck") {
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
                }

                if !main_deck.is_empty() {
                    if deck_name.is_empty() {
                        deck_name = "Selected Deck".to_string();
                    }
                    let total_cards = main_deck.len();
                    return ParsedEvent::DeckSubmitted {
                        deck_name,
                        total_cards,
                        main_deck,
                        commander_id,
                    };
                }
            }
        }
    }

    // 4. Game State Message (Event 4)
    if line.contains("GREMessageType_GameStateMessage") {
        if let Some(start) = line.find('{') {
            let json_str = &line[start..];
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) {
                let messages = v.get("greToClientEvent")
                    .and_then(|e| e.get("greToClientMessages"))
                    .and_then(|m| m.as_array());

                if let Some(msgs) = messages {
                    for msg in msgs {
                        if msg.get("type").and_then(|t| t.as_str()) == Some("GREMessageType_GameStateMessage") {
                            let msg_id = msg.get("msgId").and_then(|m| m.as_u64());
                            if let Some(gsm) = msg.get("gameStateMessage") {
                                let mut batch = Vec::new();
                                if let Some(objs) = gsm.get("gameObjects").and_then(|o| o.as_array()) {
                                    for obj in objs {
                                        if let (Some(inst_id), Some(zone_id)) = (
                                            obj.get("instanceId").and_then(|i| i.as_u64()),
                                            obj.get("zoneId").and_then(|z| z.as_u64())
                                        ) {
                                            let grp_id = obj.get("grpId").and_then(|g| g.as_u64()).map(|g| g as u32);
                                            let owner_seat = obj.get("ownerSeatId").or_else(|| obj.get("controllerSeatId")).and_then(|s| s.as_u64()).map(|s| s as u32);
                                            batch.push((inst_id as u32, grp_id, owner_seat, zone_id as u32));
                                        }
                                    }
                                }

                                let turn_info = gsm.get("turnInfo");
                                let turn_number = turn_info.and_then(|t| t.get("turnNumber")).and_then(|n| n.as_u64()).unwrap_or(0) as u32;
                                let active_seat = turn_info.and_then(|t| t.get("activeSeatId")).and_then(|s| s.as_u64()).unwrap_or(1) as u32;

                                let mut player_life = None;
                                let mut opponent_life = None;

                                if let Some(players) = gsm.get("players").and_then(|p| p.as_array()) {
                                    for p in players {
                                        let seat_id = p.get("systemSeatNumber")
                                            .or_else(|| p.get("systemSeatId"))
                                            .and_then(|s| s.as_u64())
                                            .unwrap_or(0);
                                        
                                        let life = p.get("lifeTotal").and_then(|l| l.as_i64()).map(|l| l as i32);
                                        if seat_id == 1 {
                                            player_life = life;
                                        } else if seat_id == 2 {
                                            opponent_life = life;
                                        }
                                    }
                                }

                                if !batch.is_empty() || turn_number > 0 || player_life.is_some() || opponent_life.is_some() {
                                    return ParsedEvent::GameStateUpdateCombined {
                                        msg_id,
                                        objects: batch,
                                        turn_number,
                                        player_life,
                                        opponent_life,
                                        active_seat,
                                    };
                                }
                            }
                        }
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

    // Check specific MTG Arena format keywords
    if s.contains("brawl") || s.contains("commander") {
        // TODO: "Standard Brawl" string patterns (e.g. Standard_Brawl_Play) are an assumption based on naming conventions, 
        // not yet verified against a live Standard Brawl log payload. Verify against a real live match when played.
        if s.contains("standard") {
            "Standard Brawl".to_string()
        } else {
            "Brawl".to_string()
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
    } else if s.contains("draft") || s.contains("sealed") || s.contains("limited") {
        "Limited".to_string()
    } else if s == "play" || s.contains("standard") {
        if s.contains("ranked") {
            "Standard (Ranked)".to_string()
        } else {
            "Standard".to_string()
        }
    } else if s.contains("bot") || s.contains("aibot") {
        "Bot Match".to_string()
    } else if s.contains("mwm") {
        // Generic Midweek Magic fallback if format keyword is not matched above
        "Midweek Magic".to_string()
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

        // Brawl vs Standard Brawl Distinction Tests
        assert_eq!(normalize_format("MWM_Brawl_20260811"), "Brawl");
        assert_eq!(normalize_format("Brawl_Play"), "Brawl");
        assert_eq!(normalize_format("Standard_Brawl_Play"), "Standard Brawl");
        assert_eq!(normalize_format("MWM_Standard_Brawl_20260101"), "Standard Brawl");

        // Generic MWM & Limited Tests
        assert_eq!(normalize_format("MWM_Standard_20260101"), "Standard");
        assert_eq!(normalize_format("MWM_SpecialEvent"), "Midweek Magic");
        assert_eq!(normalize_format("PremierDraft_WOE_2023"), "Limited");
        assert_eq!(normalize_format("AIBotMatch_Rebalanced"), "Bot Match");
    }
}
