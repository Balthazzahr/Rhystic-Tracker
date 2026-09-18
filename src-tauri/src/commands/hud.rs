use crate::db::DatabaseManager;
use crate::card_db;
use crate::match_assembler::MatchAssembler;
use sqlx::Row;

#[derive(Clone)]
pub struct SharedMatchState(pub std::sync::Arc<tokio::sync::Mutex<MatchAssembler>>);

#[tauri::command]
pub async fn get_live_match_state(state: tauri::State<'_, SharedMatchState>) -> Result<serde_json::Value, String> {
    let (active_opt, completed_opt) = {
        let assembler = state.0.lock().await;
        if let Some(active) = &assembler.active_match {
            let round = (assembler.current_turn + 1) / 2;
            let last_event = assembler.turn_events.last().map(|e| serde_json::json!({
                "type": e.event_type,
                "grp_id": e.grp_id,
                "seat_id": e.seat_id,
                "is_player": e.seat_id == assembler.player_seat_id,
            }));
            let going_first = assembler.turn_1_active_seat.map(|seat| seat == assembler.player_seat_id).unwrap_or(active.going_first);
            (
                Some((
                    active.clone(),
                    assembler.current_turn,
                    round,
                    going_first,
                    assembler.current_player_life,
                    assembler.current_opp_life,
                    assembler.player_seat_id,
                    assembler.cached_commander_id,
                    assembler.turn_events.clone(),
                    assembler.turn_event_seqs.clone(),
                    assembler.token_instance_names.clone(),
                    assembler.life_events.clone(),
                    assembler.damage_feed_events.clone(),
                    assembler.instance_map.clone(),
                    assembler.instance_owner_map.clone(),
                    assembler.ability_parent_map.clone(),
                    assembler.player_cards_seen.keys().copied().collect::<Vec<u32>>(),
                    assembler.opp_cards_seen.keys().copied().collect::<Vec<u32>>(),
                    last_event,
                )),
                None,
            )
        } else {
            (None, assembler.last_completed.clone())
        }
    };

    if let Some((
        active,
        current_turn,
        round,
        going_first,
        current_player_life,
        current_opp_life,
        player_seat_id,
        cached_commander_id,
        turn_events,
        turn_event_seqs,
        token_instance_names,
        life_events,
        damage_feed_events,
        instance_map,
        instance_owner_map,
        ability_parent_map,
        player_cards_seen,
        opp_cards_seen,
        last_event,
    )) = active_opt {
        let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

        // Collect all unique grp_ids across turn events, life events, damage events, commanders, and seen cards
        let mut needed_gids: std::collections::HashSet<i64> = std::collections::HashSet::new();
        for e in &turn_events {
            if e.grp_id > 0 { needed_gids.insert(e.grp_id as i64); }
            if e.event_type.starts_with("counterspell:") || e.event_type.starts_with("bounce:") || e.event_type.starts_with("sacrifice:") {
                if let Some(tgid) = e.event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                    needed_gids.insert(tgid);
                }
            } else if e.event_type.starts_with("countered:") || e.event_type.starts_with("destroy:") {
                if let Some(agid) = e.event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                    needed_gids.insert(agid);
                }
            }
        }
        for (_, _, _, _, src_grp, _) in &life_events {
            if let Some(gid) = src_grp {
                if *gid > 0 { needed_gids.insert(*gid as i64); }
            }
        }
        for (dmg, _) in &damage_feed_events {
            let src_grp = instance_map.get(&dmg.source_instance_id).copied().unwrap_or(0);
            if src_grp > 0 { needed_gids.insert(src_grp as i64); }
            let tgt_grp = instance_map.get(&dmg.target_instance_id).copied()
                .or_else(|| ability_parent_map.get(&dmg.target_instance_id).and_then(|pid| instance_map.get(pid).copied()))
                .unwrap_or(0);
            if tgt_grp > 0 { needed_gids.insert(tgt_grp as i64); }
        }
        if let Some(gid) = cached_commander_id { needed_gids.insert(gid as i64); }
        if let Some(gid) = active.opponent_commander_id { needed_gids.insert(gid as i64); }
        for &gid in &player_cards_seen { needed_gids.insert(gid as i64); }
        for &gid in &opp_cards_seen { needed_gids.insert(gid as i64); }

        let gid_list: Vec<i64> = needed_gids.into_iter().collect();
        let meta_map = card_db::get_batch_card_metadata(db.pool(), &gid_list).await.unwrap_or_default();

        // Build merged chronological feed of card actions + life changes for live HUD
        let mut merged: Vec<(u64, serde_json::Value)> = Vec::new();

        for (e, seq) in turn_events.iter().zip(turn_event_seqs.iter()) {
            if e.event_type.starts_with("damage:") || e.event_type.starts_with("life:") {
                continue;
            }
            let (name, card_type) = if e.event_type == "token" {
                let tname = e.instance_id.and_then(|inst| token_instance_names.get(&inst)).cloned();
                if let Some(name) = tname {
                    (name, Some("Token".to_string()))
                } else {
                    let meta = meta_map.get(&(e.grp_id as i64));
                    if let Some(m) = meta {
                        if m.card_type.as_deref().map(|t| t.contains("Token")).unwrap_or(false) {
                            (m.name.clone(), m.card_type.clone())
                        } else {
                            (format!("{} Token", m.name), Some("Token".to_string()))
                        }
                    } else {
                        ("Token".to_string(), Some("Token".to_string()))
                    }
                }
            } else if e.grp_id == 0 {
                let default_name = if e.event_type == "mulligan" {
                    "Mulligan".to_string()
                } else if e.event_type == "bottom" {
                    "Card Bottomed".to_string()
                } else {
                    "Unknown Action".to_string()
                };
                (default_name, None)
            } else {
                let meta = meta_map.get(&(e.grp_id as i64));
                let name = meta.as_ref().map(|c| c.name.clone()).unwrap_or_else(|| format!("#{}", e.grp_id));
                let card_type = meta.as_ref().and_then(|c| c.card_type.clone());
                (name, card_type)
            };

            let mut target_name: Option<String> = None;
            let mut target_card_type: Option<String> = None;
            let mut source_name: Option<String> = None;
            let mut count: Option<usize> = None;

            if e.event_type.starts_with("counterspell:") || e.event_type.starts_with("bounce:") || e.event_type.starts_with("sacrifice:") {
                if let Some(tgid) = e.event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                    if let Some(meta) = meta_map.get(&tgid) {
                        target_name = Some(meta.name.clone());
                        target_card_type = meta.card_type.clone();
                    }
                }
            } else if e.event_type.starts_with("countered:") || e.event_type.starts_with("destroy:") {
                if let Some(agid) = e.event_type.split(':').nth(1).and_then(|s| s.parse::<i64>().ok()) {
                    if let Some(meta) = meta_map.get(&agid) {
                        source_name = Some(meta.name.clone());
                        target_name = Some(meta.name.clone());
                        target_card_type = meta.card_type.clone();
                    }
                }
            } else if e.event_type.starts_with("mill:") {
                count = e.event_type.split(':').nth(1).and_then(|s| s.parse::<usize>().ok());
            }

            merged.push((*seq, serde_json::json!({
                "type": e.event_type,
                "seat_id": e.seat_id,
                "is_player": e.seat_id == player_seat_id,
                "name": name,
                "target_name": target_name,
                "target_card_type": target_card_type,
                "source_name": source_name,
                "count": count,
                "card_type": card_type,
                "grp_id": e.grp_id,
                "turn": e.turn_number,
            })));
        }

        for (turn, old, new, seat, src_grp, seq) in &life_events {
            let delta = new - old;
            let source_name = if let Some(gid) = src_grp {
                if *gid > 0 {
                    meta_map.get(&(*gid as i64)).map(|c| c.name.clone())
                } else {
                    None
                }
            } else {
                None
            };

            let display_str = if let Some(ref sname) = source_name {
                sname.clone()
            } else {
                "Life Total Change".to_string()
            };

            merged.push((*seq, serde_json::json!({
                "type": "life",
                "event_type": format!("life:{}:{}", delta, new),
                "seat_id": seat,
                "is_player": *seat == player_seat_id,
                "name": display_str,
                "source_name": source_name,
                "delta": delta,
                "amount": delta,
                "turn": turn,
                "grp_id": src_grp.unwrap_or(0),
            })));
        }

        for (dmg, seq) in &damage_feed_events {
            let src_grp = instance_map.get(&dmg.source_instance_id).copied().unwrap_or(0);
            let src_seat = instance_owner_map.get(&dmg.source_instance_id).copied().unwrap_or(player_seat_id);
            let meta = meta_map.get(&(src_grp as i64));
            let src_name = meta.as_ref().map(|c| c.name.clone()).unwrap_or_else(|| format!("#{}", src_grp));
            let card_type = meta.as_ref().and_then(|c| c.card_type.clone());

            let (target_name, tgt_grp) = if dmg.target_instance_id == player_seat_id {
                ("You".to_string(), 0u32)
            } else if dmg.target_instance_id == 1 || dmg.target_instance_id == 2 {
                (active.opponent_name.clone().unwrap_or_else(|| "Opponent".to_string()), 0u32)
            } else {
                let tgt_grp = instance_map.get(&dmg.target_instance_id).copied()
                    .or_else(|| {
                        ability_parent_map.get(&dmg.target_instance_id)
                            .and_then(|pid| instance_map.get(pid).copied())
                    })
                    .unwrap_or(0);
                let name = if tgt_grp > 0 {
                    meta_map.get(&(tgt_grp as i64)).map(|c| c.name.clone())
                        .unwrap_or_else(|| format!("Target #{}", dmg.target_instance_id))
                } else {
                    format!("Target #{}", dmg.target_instance_id)
                };
                (name, tgt_grp)
            };

            let dtype_str = if dmg.damage_type == 1 { "combat" } else if dmg.damage_type == 3 { "fight" } else { "spell" };
            merged.push((*seq, serde_json::json!({
                "type": "damage",
                "event_type": format!("damage:{}:{}:{}:{}", dtype_str, dmg.amount, dmg.target_instance_id, tgt_grp),
                "seat_id": src_seat,
                "is_player": src_seat == player_seat_id,
                "name": src_name,
                "card_type": card_type,
                "target_name": target_name,
                "amount": dmg.amount,
                "damage_type": if dmg.damage_type == 1 { "Combat" } else if dmg.damage_type == 3 { "Fight" } else { "Spell" },
                "grp_id": src_grp,
                "turn": dmg.turn_number,
            })));
        }

        merged.sort_by_key(|(seq, _)| *seq);
        let recent_events: Vec<serde_json::Value> = merged.into_iter().map(|(_, ev)| ev).collect();

        let player_cmdr = cached_commander_id.and_then(|gid| meta_map.get(&(gid as i64))).cloned();
        let opp_cmdr = active.opponent_commander_id.and_then(|gid| meta_map.get(&(gid as i64))).cloned();

        let mut player_colors: Vec<String> = Vec::new();
        let mut opp_colors: Vec<String> = Vec::new();
        let order = ["W", "U", "B", "R", "G"];

        {
            use std::collections::HashSet;
            let mut ps = HashSet::new();
            let mut os = HashSet::new();
            for gid in &player_cards_seen {
                if let Some(meta) = meta_map.get(&(*gid as i64)) {
                    for src in [&meta.color_identity, &meta.colors].into_iter().flatten() {
                        for ch in src.chars() {
                            if !ch.is_ascii_alphanumeric() { continue; }
                            match ch {
                                '1' | 'W' => { ps.insert("W".to_string()); },
                                '2' | 'U' => { ps.insert("U".to_string()); },
                                '3' | 'B' => { ps.insert("B".to_string()); },
                                '4' | 'R' => { ps.insert("R".to_string()); },
                                '5' | 'G' => { ps.insert("G".to_string()); },
                                _ => {}
                            }
                        }
                    }
                }
            }
            for gid in &opp_cards_seen {
                if let Some(meta) = meta_map.get(&(*gid as i64)) {
                    for src in [&meta.color_identity, &meta.colors].into_iter().flatten() {
                        for ch in src.chars() {
                            if !ch.is_ascii_alphanumeric() { continue; }
                            match ch {
                                '1' | 'W' => { os.insert("W".to_string()); },
                                '2' | 'U' => { os.insert("U".to_string()); },
                                '3' | 'B' => { os.insert("B".to_string()); },
                                '4' | 'R' => { os.insert("R".to_string()); },
                                '5' | 'G' => { os.insert("G".to_string()); },
                                _ => {}
                            }
                        }
                    }
                }
            }
            player_colors = order.iter().filter(|c| ps.contains(**c)).map(|c| c.to_string()).collect();
            opp_colors = order.iter().filter(|c| os.contains(**c)).map(|c| c.to_string()).collect();
        }

        Ok(serde_json::json!({
            "is_active": true,
            "match_id": active.match_id,
            "format": active.format_name,
            "turn": current_turn,
            "round": round,
            "going_first": going_first,
            "player_life": current_player_life,
            "opponent_life": current_opp_life,
            "opponent_name": active.opponent_name.as_deref().unwrap_or("Opponent"),
            "player_deck_name": active.player_deck_name,
            "player_commander": player_cmdr.map(|c| serde_json::json!({"grp_id": c.grp_id, "name": c.name})),
            "opponent_commander": opp_cmdr.map(|c| serde_json::json!({"grp_id": c.grp_id, "name": c.name})),
            "player_colors": player_colors,
            "opponent_colors": opp_colors,
            "player_cards_seen": player_cards_seen.len(),
            "opponent_cards_seen": opp_cards_seen.len(),
            "turn_events_count": turn_events.len(),
            "last_event": last_event,
            "recent_events": recent_events,
        }))
    } else {
        // No active match. If a match just completed, keep reporting its result
        // for a short window (10s) so the HUD can show a result overlay.
        if let Some((record, completed_at)) = completed_opt {
            let elapsed = chrono::Utc::now().signed_duration_since(completed_at);
            if elapsed.num_seconds() < 13 {
                let reason = record.result_reason.as_deref().unwrap_or("");
                let reason_label = if reason.contains("Concede") {
                    if record.result == "win" { "Opponent Conceded" } else { "Player Conceded" }
                } else if reason.contains("Timeout") {
                    "Time Expired"
                } else {
                    if record.result == "win" { "Victory" } else { "Defeat" }
                };

                let db = DatabaseManager::init().await.ok();
                let mut impactful_cards_arr = Vec::new();
                let mut earned_achievements_arr = Vec::new();

                fn parse_title_and_tier(raw: &str) -> (String, String) {
                    let trimmed = raw.trim();
                    if trimmed.to_lowercase().contains("(gold)") {
                        (trimmed.replace("(Gold)", "").replace("(gold)", "").trim().to_string(), "gold".to_string())
                    } else if trimmed.to_lowercase().contains("(silver)") {
                        (trimmed.replace("(Silver)", "").replace("(silver)", "").trim().to_string(), "silver".to_string())
                    } else if trimmed.to_lowercase().contains("(bronze)") {
                        (trimmed.replace("(Bronze)", "").replace("(bronze)", "").trim().to_string(), "bronze".to_string())
                    } else {
                        (trimmed.to_string(), "bronze".to_string())
                    }
                }

                if let Some(db_mgr) = &db {
                    let pool = db_mgr.pool();
                    let rows = sqlx::query(
                        r#"
                        SELECT i.grp_id, COALESCE(c.name, 'Unknown') as card_name,
                               i.total_damage, i.max_hit, i.damage_combat, i.damage_spell,
                               i.titles
                        FROM match_impactful_cards i
                        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
                        WHERE i.match_id = ? AND i.seat_id = ?
                          AND (i.total_damage > 0 OR (i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'))
                        ORDER BY i.total_damage DESC, i.max_hit DESC
                        LIMIT 12
                        "#
                    )
                    .bind(&record.match_id)
                    .bind(record.hero_seat_id as i64)
                    .fetch_all(pool)
                    .await
                    .unwrap_or_default();

                    for r in rows {
                        let gid: i64 = r.get("grp_id");
                        let name: String = r.get("card_name");
                        let total_dmg: i64 = r.get("total_damage");
                        let max_hit: i64 = r.get("max_hit");
                        let dmg_combat: i64 = r.get("damage_combat");
                        let dmg_spell: i64 = r.get("damage_spell");
                        let titles_json: Option<String> = r.try_get("titles").ok();
                        let titles: Vec<String> = titles_json
                            .as_deref()
                            .and_then(|s| serde_json::from_str(s).ok())
                            .unwrap_or_default();

                        impactful_cards_arr.push(serde_json::json!({
                            "grp_id": gid,
                            "name": name,
                            "total_damage": total_dmg,
                            "max_hit": max_hit,
                            "damage_combat": dmg_combat,
                            "damage_spell": dmg_spell,
                            "titles": titles,
                        }));
                    }

                    let ach_rows = sqlx::query(
                        r#"
                        SELECT i.grp_id, COALESCE(c.name, 'Unknown') as card_name, i.titles
                        FROM match_impactful_cards i
                        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
                        WHERE i.match_id = ? AND i.seat_id = ?
                          AND i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'
                        ORDER BY i.total_damage DESC
                        "#
                    )
                    .bind(&record.match_id)
                    .bind(record.hero_seat_id as i64)
                    .fetch_all(pool)
                    .await
                    .unwrap_or_default();

                    for r in ach_rows {
                        let gid: i64 = r.get("grp_id");
                        let name: String = r.get("card_name");
                        let titles_json: String = r.get("titles");
                        if let Ok(titles) = serde_json::from_str::<Vec<String>>(&titles_json) {
                            for raw_title in titles {
                                if !raw_title.is_empty() {
                                    let (clean_title, tier) = parse_title_and_tier(&raw_title);
                                    earned_achievements_arr.push(serde_json::json!({
                                        "is_deck": false,
                                        "grp_id": gid,
                                        "card_name": name,
                                        "title": clean_title,
                                        "raw_title": raw_title,
                                        "tier": tier,
                                    }));
                                }
                            }
                        }
                    }



                    let event_rows = sqlx::query(
                        r#"
                        SELECT e.turn_number, e.seat_id, e.event_type, e.grp_id,
                               c.name, c.card_type
                        FROM match_turn_events e
                        LEFT JOIN cards_cache c ON e.grp_id = c.grp_id
                        WHERE e.match_id = ?
                        ORDER BY e.turn_number ASC, e.id ASC
                        "#
                    )
                    .bind(&record.match_id)
                    .fetch_all(pool)
                    .await
                    .unwrap_or_default();

                    let mut completed_recent_events = Vec::new();
                    for er in event_rows {
                        let t_num: i64 = er.get("turn_number");
                        let s_id: i64 = er.get("seat_id");
                        let ev_type: String = er.get("event_type");
                        let gid: i64 = er.get("grp_id");
                        let name_opt: Option<String> = er.get("name");
                        let card_type_opt: Option<String> = er.get("card_type");

                        let is_hero = (s_id as u32) == record.hero_seat_id;

                        if ev_type.starts_with("life:") {
                            let parts: Vec<&str> = ev_type.split(':').collect();
                            let delta: i32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
                            let new_total: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                            let old_total = new_total - delta;
                            let src_name = name_opt.clone();
                            let display_str = if let Some(ref sn) = src_name {
                                sn.clone()
                            } else {
                                "Life Total Change".to_string()
                            };
                            completed_recent_events.push(serde_json::json!({
                                "type": "life",
                                "event_type": ev_type,
                                "seat_id": s_id,
                                "is_player": is_hero,
                                "name": display_str,
                                "source_name": src_name,
                                "delta": delta,
                                "amount": delta,
                                "turn": t_num,
                                "grp_id": gid,
                            }));
                        } else if ev_type.starts_with("damage:") {
                            let parts: Vec<&str> = ev_type.split(':').collect();
                            let (amount, tgt_id, tgt_gid) = if parts.len() >= 5 {
                                let amt: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                                let tid: u32 = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
                                let g: i64 = parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);
                                (amt, tid, g)
                            } else if parts.len() == 4 {
                                let amt: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                                let tid: u32 = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
                                (amt, tid, 0)
                            } else {
                                let tid: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
                                let amt: i32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
                                (amt, tid, 0)
                            };
                            let target_name = if tgt_id == record.hero_seat_id {
                                "You".to_string()
                            } else if tgt_id == 1 || tgt_id == 2 || tgt_id == 0 {
                                record.opponent_name.clone().unwrap_or_else(|| "Opponent".to_string())
                            } else if tgt_gid > 0 {
                                if let Ok(Some(meta)) = card_db::get_card_metadata(pool, tgt_gid).await {
                                    meta.name
                                } else {
                                    format!("Target #{}", tgt_id)
                                }
                            } else {
                                format!("Target #{}", tgt_id)
                            };
                            completed_recent_events.push(serde_json::json!({
                                "type": "damage",
                                "event_type": ev_type,
                                "seat_id": s_id,
                                "is_player": is_hero,
                                "name": name_opt.unwrap_or_else(|| format!("#{}", gid)),
                                "target_name": target_name,
                                "card_type": card_type_opt,
                                "amount": amount,
                                "turn": t_num,
                                "grp_id": gid,
                            }));
                        } else {
                            let default_name = if ev_type == "mulligan" {
                                "Mulligan".to_string()
                            } else if ev_type == "bottom" {
                                "Card Bottomed".to_string()
                            } else {
                                "Unknown Action".to_string()
                            };
                            completed_recent_events.push(serde_json::json!({
                                "type": ev_type,
                                "seat_id": s_id,
                                "is_player": is_hero,
                                "name": name_opt.unwrap_or(default_name),
                                "card_type": card_type_opt,
                                "grp_id": gid,
                                "turn": t_num,
                            }));
                        }
                    }

                    return Ok(serde_json::json!({
                        "is_active": false,
                        "just_completed": true,
                        "result": record.result,
                        "result_reason": record.result_reason,
                        "reason_label": reason_label,
                        "match_id": record.match_id,
                        "format": record.format_name,
                        "going_first": record.going_first,
                        "player_deck_name": record.player_deck_name,
                        "opponent_name": record.opponent_name,
                        "player_life": record.player_life_end.unwrap_or(20),
                        "opponent_life": record.opponent_life_end.unwrap_or(0),
                        "duration_seconds": record.duration_seconds,
                        "turns": record.turns,
                        "timestamp": record.date_str,
                        "impactful_cards": impactful_cards_arr,
                        "earned_achievements": earned_achievements_arr,
                        "recent_events": completed_recent_events,
                    }));
                }

                return Ok(serde_json::json!({
                    "is_active": false,
                    "just_completed": true,
                    "result": record.result,
                    "result_reason": record.result_reason,
                    "reason_label": reason_label,
                    "match_id": record.match_id,
                    "format": record.format_name,
                    "going_first": record.going_first,
                    "player_deck_name": record.player_deck_name,
                    "opponent_name": record.opponent_name,
                    "player_life": record.player_life_end.unwrap_or(20),
                    "opponent_life": record.opponent_life_end.unwrap_or(0),
                    "duration_seconds": record.duration_seconds,
                    "turns": record.turns,
                    "timestamp": record.date_str,
                    "impactful_cards": impactful_cards_arr,
                    "earned_achievements": earned_achievements_arr,
                }));
            }
        }
        Ok(serde_json::json!({
            "is_active": false
        }))
    }
}
