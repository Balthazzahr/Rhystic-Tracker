use crate::db::DatabaseManager;
use sqlx::Row;

#[tauri::command]
pub async fn get_deck_achievements(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let raw = db.get_deck_achievements(&deck_name).await.map_err(|e| e.to_string())?;
    let res: Vec<serde_json::Value> = raw.into_iter().map(|(ach_id, tier, achieved_at, match_id)| {
        serde_json::json!({
            "deck_name": deck_name,
            "achievement_id": ach_id,
            "tier": tier,
            "achieved_at": achieved_at,
            "match_id": match_id
        })
    }).collect();
    Ok(serde_json::json!(res))
}

#[tauri::command]
pub async fn get_all_deck_achievements() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let raw = db.get_all_deck_achievements().await.map_err(|e| e.to_string())?;
    let res: Vec<serde_json::Value> = raw.into_iter().map(|(deck_name, ach_id, tier, achieved_at, match_id)| {
        serde_json::json!({
            "deck_name": deck_name,
            "achievement_id": ach_id,
            "tier": tier,
            "achieved_at": achieved_at,
            "match_id": match_id
        })
    }).collect();
    Ok(serde_json::json!(res))
}

#[tauri::command]
pub async fn get_global_achievements() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let pool = db.pool();

    let rows = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code, i.titles, m.timestamp as match_timestamp
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id
          AND m.timestamp >= '2026-08-23T06:30:00'
          AND i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    fn parse_title_and_tier(raw: &str) -> (String, String) {
        let trimmed = raw.trim();
        let lower = trimmed.to_lowercase();
        if lower.contains("(legendary)") {
            (trimmed.replace("(Legendary)", "").replace("(legendary)", "").trim().to_string(), "legendary".to_string())
        } else if lower.contains("(platinum)") || lower.contains("(titanium)") {
            (trimmed.replace("(Platinum)", "").replace("(platinum)", "").replace("(Titanium)", "").replace("(titanium)", "").trim().to_string(), "platinum".to_string())
        } else if lower.contains("(gold)") {
            (trimmed.replace("(Gold)", "").replace("(gold)", "").trim().to_string(), "gold".to_string())
        } else if lower.contains("(silver)") {
            (trimmed.replace("(Silver)", "").replace("(silver)", "").trim().to_string(), "silver".to_string())
        } else if lower.contains("(bronze)") {
            (trimmed.replace("(Bronze)", "").replace("(bronze)", "").trim().to_string(), "bronze".to_string())
        } else if lower.contains("(iron)") {
            (trimmed.replace("(Iron)", "").replace("(iron)", "").trim().to_string(), "iron".to_string())
        } else {
            (trimmed.to_string(), "bronze".to_string())
        }
    }

    fn tier_rank(tier: &str) -> i32 {
        let lower = tier.to_lowercase();
        if lower.contains("legendary") {
            6
        } else if lower.contains("platinum") || lower.contains("titanium") {
            5
        } else if lower.contains("gold") {
            4
        } else if lower.contains("silver") {
            3
        } else if lower.contains("bronze") {
            2
        } else if lower.contains("iron") {
            1
        } else {
            2
        }
    }

    struct CardStats {
        grp_id: i64,
        card_name: String,
        mana_cost: Option<String>,
        card_type: Option<String>,
        rarity: Option<String>,
        set_code: Option<String>,
        count: i64,
        legendary_count: i64,
        platinum_count: i64,
        gold_count: i64,
        silver_count: i64,
        bronze_count: i64,
        iron_count: i64,
        highest_tier: String,
        first_earned_at: Option<String>,
        last_earned_at: Option<String>,
    }

    // HashMap: achievement_title -> (total, highest, first_earned, legendary, platinum, gold, silver, bronze, iron, cards_map)
    let mut ach_map: std::collections::HashMap<String, (i64, String, Option<String>, i64, i64, i64, i64, i64, i64, std::collections::HashMap<i64, CardStats>)> = std::collections::HashMap::new();

    let mut total_honors_count = 0i64;
    let mut legendary_count = 0i64;
    let mut platinum_count = 0i64;
    let mut gold_count = 0i64;
    let mut silver_count = 0i64;
    let mut bronze_count = 0i64;
    let mut iron_count = 0i64;

    for row in rows {
        let grp_id: i64 = row.get("grp_id");
        let card_name: String = row.try_get("card_name").unwrap_or_else(|_| format!("Card #{}", grp_id));
        let mana_cost: Option<String> = row.try_get("mana_cost").ok();
        let card_type: Option<String> = row.try_get("card_type").ok();
        let rarity: Option<String> = row.try_get("rarity").ok();
        let set_code: Option<String> = row.try_get("set_code").ok();
        let titles_json: String = row.try_get("titles").unwrap_or_default();
        let match_timestamp: Option<String> = row.try_get("match_timestamp").ok();

        if let Ok(titles) = serde_json::from_str::<Vec<String>>(&titles_json) {
            for raw in titles {
                if raw.is_empty() { continue; }
                let (clean_title, tier) = parse_title_and_tier(&raw);
                total_honors_count += 1;
                match tier.as_str() {
                    "legendary" => legendary_count += 1,
                    "platinum" => platinum_count += 1,
                    "gold" => gold_count += 1,
                    "silver" => silver_count += 1,
                    "iron" => iron_count += 1,
                    _ => bronze_count += 1,
                }

                let entry = ach_map.entry(clean_title.clone()).or_insert_with(|| (0, "bronze".to_string(), match_timestamp.clone(), 0, 0, 0, 0, 0, 0, std::collections::HashMap::new()));
                entry.0 += 1;
                if tier_rank(&tier) > tier_rank(&entry.1) {
                    entry.1 = tier.clone();
                }
                match tier.as_str() {
                    "legendary" => entry.3 += 1,
                    "platinum" => entry.4 += 1,
                    "gold" => entry.5 += 1,
                    "silver" => entry.6 += 1,
                    "bronze" => entry.7 += 1,
                    "iron" => entry.8 += 1,
                    _ => entry.7 += 1,
                }
                if let Some(ref ts) = match_timestamp {
                    match &entry.2 {
                        None => entry.2 = Some(ts.clone()),
                        Some(prev) if prev > ts => entry.2 = Some(ts.clone()),
                        _ => {}
                    }
                }

                let card_entry = entry.9.entry(grp_id).or_insert_with(|| CardStats {
                    grp_id,
                    card_name: card_name.clone(),
                    mana_cost: mana_cost.clone(),
                    card_type: card_type.clone(),
                    rarity: rarity.clone(),
                    set_code: set_code.clone(),
                    count: 0,
                    legendary_count: 0,
                    platinum_count: 0,
                    gold_count: 0,
                    silver_count: 0,
                    bronze_count: 0,
                    iron_count: 0,
                    highest_tier: "bronze".to_string(),
                    first_earned_at: match_timestamp.clone(),
                    last_earned_at: match_timestamp.clone(),
                });
                card_entry.count += 1;
                match tier.as_str() {
                    "legendary" => card_entry.legendary_count += 1,
                    "platinum" => card_entry.platinum_count += 1,
                    "gold" => card_entry.gold_count += 1,
                    "silver" => card_entry.silver_count += 1,
                    "bronze" => card_entry.bronze_count += 1,
                    "iron" => card_entry.iron_count += 1,
                    _ => card_entry.bronze_count += 1,
                }
                if let Some(ts) = &match_timestamp {
                    if card_entry.last_earned_at.as_ref().map_or(true, |prev| ts > prev) {
                        card_entry.last_earned_at = Some(ts.clone());
                    }
                    if card_entry.first_earned_at.as_ref().map_or(true, |prev| ts < prev) {
                        card_entry.first_earned_at = Some(ts.clone());
                    }
                }
                if tier_rank(&tier) > tier_rank(&card_entry.highest_tier) {
                    card_entry.highest_tier = tier.clone();
                }
            }
        }
    }

    let mut achievements: Vec<serde_json::Value> = ach_map.into_iter().map(|(title, (total_awards, highest_tier, first_earned, ac_leg, ac_plat, ac_gold, ac_silver, ac_bronze, ac_iron, cards_map))| {
        let mut cards: Vec<serde_json::Value> = cards_map.into_values().map(|c| {
            serde_json::json!({
                "grp_id": c.grp_id,
                "card_name": c.card_name,
                "mana_cost": c.mana_cost,
                "card_type": c.card_type,
                "rarity": c.rarity,
                "set_code": c.set_code,
                "count": c.count,
                "legendary_count": c.legendary_count,
                "platinum_count": c.platinum_count,
                "gold_count": c.gold_count,
                "silver_count": c.silver_count,
                "bronze_count": c.bronze_count,
                "iron_count": c.iron_count,
                "highest_tier": c.highest_tier,
                "first_earned_at": c.first_earned_at,
                "earned_at": c.last_earned_at
            })
        }).collect();

        cards.sort_by(|a, b| {
            let leg_a = a.get("legendary_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let leg_b = b.get("legendary_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let p_a = a.get("platinum_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let p_b = b.get("platinum_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let g_a = a.get("gold_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let g_b = b.get("gold_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let s_a = a.get("silver_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let s_b = b.get("silver_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let b_a = a.get("bronze_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let b_b = b.get("bronze_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let i_a = a.get("iron_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let i_b = b.get("iron_count").and_then(|v| v.as_i64()).unwrap_or(0);
            leg_b.cmp(&leg_a)
                .then_with(|| p_b.cmp(&p_a))
                .then_with(|| g_b.cmp(&g_a))
                .then_with(|| s_b.cmp(&s_a))
                .then_with(|| b_b.cmp(&b_a))
                .then_with(|| i_b.cmp(&i_a))
                .then_with(|| {
                    let cnt_b = b.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
                    let cnt_a = a.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
                    cnt_b.cmp(&cnt_a)
                })
        });

        serde_json::json!({
            "achievement": title,
            "total_awards": total_awards,
            "highest_tier": highest_tier,
            "legendary_count": ac_leg,
            "platinum_count": ac_plat,
            "gold_count": ac_gold,
            "silver_count": ac_silver,
            "bronze_count": ac_bronze,
            "iron_count": ac_iron,
            "first_earned_at": first_earned,
            "cards": cards
        })
    }).collect();

    // Priority Sort: Highest tier descending, then total_awards descending
    achievements.sort_by(|a, b| {
        let t_a = a.get("highest_tier").and_then(|v| v.as_str()).unwrap_or("bronze");
        let t_b = b.get("highest_tier").and_then(|v| v.as_str()).unwrap_or("bronze");
        tier_rank(t_b).cmp(&tier_rank(t_a)).then_with(|| {
            let tot_b = b.get("total_awards").and_then(|v| v.as_i64()).unwrap_or(0);
            let tot_a = a.get("total_awards").and_then(|v| v.as_i64()).unwrap_or(0);
            tot_b.cmp(&tot_a)
        })
    });

    Ok(serde_json::json!({
        "total_unlocked": achievements.len(),
        "total_possible": 26,
        "total_honors": total_honors_count,
        "legendary_count": legendary_count,
        "platinum_count": platinum_count,
        "gold_count": gold_count,
        "silver_count": silver_count,
        "bronze_count": bronze_count,
        "iron_count": iron_count,
        "achievements": achievements
    }))
}

#[tauri::command]
pub async fn get_global_leaderboards() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let pool = db.pool();

    // ==========================================
    // ROW 1: COMBAT DAMAGE
    // ==========================================

    // 1.1 Highest Combat Damage in a Single Hit
    let combat_single_hit = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               MAX(CASE WHEN i.max_hit_combat > 0 THEN i.max_hit_combat ELSE (CASE WHEN i.damage_combat > 0 THEN i.max_hit ELSE 0 END) END) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id 
          AND (i.max_hit_combat > 0 OR i.damage_combat > 0)
          AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        HAVING record_value > 0
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1.2 Highest Combat Damage over an entire match (single game record)
    let combat_match_damage = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               MAX(i.damage_combat) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id AND i.damage_combat > 0 AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 1.3 Total Highest Combat Damage over all logged matches
    let combat_lifetime_damage = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               SUM(i.damage_combat) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id AND i.damage_combat > 0 AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // ==========================================
    // ROW 2: NON-COMBAT (SPELLS & ABILITIES) DAMAGE
    // ==========================================

    // 2.1 Highest Non-Combat Damage in a Single Hit / Spell Cast (AoE aggregated)
    let spell_single_hit = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               MAX(CASE WHEN i.max_hit_spell > 0 THEN i.max_hit_spell ELSE (CASE WHEN i.damage_spell > 0 THEN i.max_hit ELSE 0 END) END) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id 
          AND (i.max_hit_spell > 0 OR i.damage_spell > 0)
          AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        HAVING record_value > 0
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2.2 Highest Non-Combat Damage over an entire match (single game record)
    let spell_match_damage = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               MAX(i.damage_spell) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id AND i.damage_spell > 0 AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 2.3 Total Highest Non-Combat Damage over all logged matches
    let spell_lifetime_damage = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               SUM(i.damage_spell) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id AND i.damage_spell > 0 AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // ==========================================
    // ROW 3: HONORS & MASTERY (NON-DAMAGE)
    // ==========================================

    // 3.1 Most Decorated Cards (Total Lifetime Achievements / Honors Awarded)
    let rows_honors = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code, i.titles
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id
          AND m.timestamp >= '2026-08-23T06:30:00'
          AND i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    struct HonorAgg {
        grp_id: i64,
        card_name: String,
        mana_cost: Option<String>,
        card_type: Option<String>,
        rarity: Option<String>,
        set_code: Option<String>,
        count: i64,
    }

    let mut honors_map: std::collections::HashMap<String, HonorAgg> = std::collections::HashMap::new();
    for r in rows_honors {
        let grp_id: i64 = r.get("grp_id");
        let card_name: String = r.try_get("card_name").unwrap_or_else(|_| format!("Card #{}", grp_id));
        let mana_cost: Option<String> = r.try_get("mana_cost").ok();
        let card_type: Option<String> = r.try_get("card_type").ok();
        let rarity: Option<String> = r.try_get("rarity").ok();
        let set_code: Option<String> = r.try_get("set_code").ok();
        let titles_json: String = r.try_get("titles").unwrap_or_default();

        if let Ok(titles) = serde_json::from_str::<Vec<String>>(&titles_json) {
            let valid_count = titles.iter().filter(|t| !t.is_empty()).count() as i64;
            if valid_count > 0 {
                let entry = honors_map.entry(card_name.clone()).or_insert_with(|| HonorAgg {
                    grp_id,
                    card_name,
                    mana_cost,
                    card_type,
                    rarity,
                    set_code,
                    count: 0,
                });
                entry.count += valid_count;
            }
        }
    }

    let mut top_honors_vec: Vec<HonorAgg> = honors_map.into_values().collect();
    top_honors_vec.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.card_name.cmp(&b.card_name)));

    let most_decorated_json: Vec<serde_json::Value> = top_honors_vec.into_iter().enumerate().map(|(idx, h)| {
        serde_json::json!({
            "rank": idx + 1,
            "grp_id": h.grp_id,
            "card_name": h.card_name,
            "mana_cost": h.mana_cost,
            "card_type": h.card_type,
            "rarity": h.rarity,
            "set_code": h.set_code,
            "value": h.count,
            "unit": "Honors Won"
        })
    }).collect();

    // 3.2 Card Draw Engines (Cards causing extra card draws across matches)
    let top_draw_engines = sqlx::query(
        r#"
        SELECT i.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               SUM(i.cards_drawn) as record_value
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE i.seat_id = m.hero_seat_id
          AND i.cards_drawn > 0
          AND c.name IS NOT NULL
          AND c.name != ''
          AND m.timestamp >= '2026-08-23T06:30:00'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    // 3.3 Battlefield Stalwarts (Non-land cards cast/played the most times)
    let top_stalwarts = sqlx::query(
        r#"
        SELECT e.grp_id, c.name as card_name, c.mana_cost, c.card_type, c.rarity, c.set_code,
               COUNT(*) as record_value
        FROM match_turn_events e
        JOIN matches m ON e.match_id = m.id
        JOIN cards_cache c ON e.grp_id = c.grp_id
        WHERE e.seat_id = m.hero_seat_id
          AND e.event_type = 'play'
          AND c.name IS NOT NULL
          AND c.name != ''
          AND (c.card_type IS NULL OR (LOWER(c.card_type) NOT LIKE '%land%' AND LOWER(c.card_type) NOT LIKE '%token%'))
          AND (c.rarity IS NULL OR LOWER(c.rarity) != 'token')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
          AND NOT (LOWER(COALESCE(c.card_type, '')) LIKE '%creature%' AND (c.mana_cost IS NULL OR c.mana_cost = ''))
        GROUP BY c.name
        ORDER BY record_value DESC, card_name ASC
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    fn map_leaderboard_rows(rows: Vec<sqlx::sqlite::SqliteRow>, unit: &str) -> Vec<serde_json::Value> {
        rows.into_iter().enumerate().map(|(idx, r)| {
            let grp_id: i64 = r.get("grp_id");
            let card_name: String = r.try_get("card_name").unwrap_or_else(|_| format!("Card #{}", grp_id));
            let mana_cost: Option<String> = r.try_get("mana_cost").ok();
            let card_type: Option<String> = r.try_get("card_type").ok();
            let rarity: Option<String> = r.try_get("rarity").ok();
            let set_code: Option<String> = r.try_get("set_code").ok();
            let record_value: i64 = r.get("record_value");

            serde_json::json!({
                "rank": idx + 1,
                "grp_id": grp_id,
                "card_name": card_name,
                "mana_cost": mana_cost,
                "card_type": card_type,
                "rarity": rarity,
                "set_code": set_code,
                "value": record_value,
                "unit": unit
            })
        }).collect()
    }

    Ok(serde_json::json!({
        // Row 1: Combat
        "combat_single_hit": map_leaderboard_rows(combat_single_hit, "Dmg Single Hit"),
        "combat_match_damage": map_leaderboard_rows(combat_match_damage, "Combat Dmg / Match"),
        "combat_lifetime_damage": map_leaderboard_rows(combat_lifetime_damage, "Lifetime Combat Dmg"),
        // Row 2: Spell & Abilities
        "spell_single_hit": map_leaderboard_rows(spell_single_hit, "Dmg Single Cast"),
        "spell_match_damage": map_leaderboard_rows(spell_match_damage, "Spell Dmg / Match"),
        "spell_lifetime_damage": map_leaderboard_rows(spell_lifetime_damage, "Lifetime Spell Dmg"),
        // Row 3: Honors & Mastery
        "most_decorated": most_decorated_json,
        "card_draw_engines": map_leaderboard_rows(top_draw_engines, "Cards Drawn"),
        "battlefield_stalwarts": map_leaderboard_rows(top_stalwarts, "Times Cast"),
    }))
}
