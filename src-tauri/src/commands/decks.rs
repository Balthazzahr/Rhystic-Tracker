use crate::db::DatabaseManager;
use crate::card_db;
use crate::deck_list;
use crate::parser;
use crate::commands::collection::{owned_counts, owned_grp_ids, ownership_stats};
use chrono::Utc;
use sqlx::Row;

#[tauri::command]
pub async fn get_deck_stats() -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.get_deck_stats().await.map_err(|e| e.to_string())
}

/// Rich per-deck overview for the Decks & Stats view: base W-L plus format
/// breakdown, commander breakdown (grouped by resolved name, printings merged),
/// color identity, and a mana curve derived from cards seen across the deck's matches.
#[tauri::command]
pub async fn get_deck_overview() -> Result<Vec<serde_json::Value>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // 1. Base stats per deck (mirrors get_deck_stats).
    let base_rows = sqlx::query(
        r#"
        SELECT
            hero_deck_name as deck_name,
            COUNT(*) as total_matches,
            SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
            MAX(timestamp) as last_played
        FROM matches
        WHERE hero_deck_name IS NOT NULL AND hero_deck_name != ''
        GROUP BY hero_deck_name
        ORDER BY total_matches DESC
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 2. Format breakdown per deck (excluding Bot Match).
    let format_rows = sqlx::query(
        r#"
        SELECT hero_deck_name as deck_name, format, COUNT(*) as n
        FROM matches
        WHERE hero_deck_name IS NOT NULL AND hero_deck_name != ''
          AND format IS NOT NULL AND format != '' AND LOWER(format) NOT LIKE '%bot%'
        GROUP BY hero_deck_name, format
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 3. Commander breakdown per deck: group by RESOLVED NAME (merge printings),
    //    count matches per commander, join cards_cache for the name.
    let commander_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, c.name as commander_name,
               COUNT(*) as n
        FROM matches m
        LEFT JOIN cards_cache c ON m.hero_commander_id = c.grp_id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND m.hero_commander_id IS NOT NULL
        GROUP BY m.hero_deck_name, c.name
        ORDER BY m.hero_deck_name, n DESC
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 3b. Dominant commander per deck (top by count), including a grp_id for art lookup.
    let top_commander_rows = sqlx::query(
        r#"
        SELECT deck_name, commander_name, grp_id, n FROM (
            SELECT m.hero_deck_name as deck_name, c.name as commander_name,
                   MIN(m.hero_commander_id) as grp_id, COUNT(*) as n,
                   ROW_NUMBER() OVER (PARTITION BY m.hero_deck_name ORDER BY COUNT(*) DESC, c.name ASC) as rn
            FROM matches m
            JOIN cards_cache c ON m.hero_commander_id = c.grp_id
            WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
              AND m.hero_commander_id IS NOT NULL
            GROUP BY m.hero_deck_name, c.name
        ) WHERE rn = 1
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 3c. Random non-land card per deck from cards seen (for non-commander
    //     decks). Non-land ensures the thumbnail is a spell, not a basic land;
    //     ORDER BY random() gives a different representative each refresh.
    let top_card_rows = sqlx::query(
        r#"
        SELECT deck_name, card_name, grp_id FROM (
            SELECT m.hero_deck_name as deck_name, c.name as card_name,
                   MIN(c.grp_id) as grp_id,
                   ROW_NUMBER() OVER (PARTITION BY m.hero_deck_name ORDER BY RANDOM()) as rn
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            JOIN cards_cache c ON mc.grp_id = c.grp_id
            WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
              AND mc.is_opponent = 0
              AND c.card_type IS NOT NULL
              AND lower(c.card_type) NOT LIKE '%land%'
              AND c.card_type != ''
            GROUP BY m.hero_deck_name, c.name, c.grp_id
        ) WHERE rn = 1
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4. Colors + mana curve per deck from cards seen (match_cards -> cards_cache).
    //    Aggregate by grp_id so `count` is the total occurrences across ALL of the
    //    deck's matches (mc.count is per-match, usually 1, which would make the
    //    relative-frequency threshold compare 1 against a 10+ cutoff and fail for
    //    every card -> empty colors). This mirrors the verified aggregation.
    let card_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, c.card_type, c.mana_cost, c.color_identity, c.colors,
               SUM(mc.count) as count
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND mc.is_opponent = 0
        GROUP BY m.hero_deck_name, c.grp_id, c.mana_cost, c.color_identity, c.colors
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4b. Every non-land card per deck (for the Key Cards column). These are the
    //     highest-MV creature / highest-MV spell / highest-MV other in the deck.
    let key_card_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name,
               c.name, MIN(c.grp_id) as grp_id,
               MAX(c.cmc) as cmc,
               c.card_type, c.mana_cost, c.rarity, c.set_code, c.color_identity
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND mc.is_opponent = 0
          AND c.card_type IS NOT NULL
          AND c.card_type != ''
          AND lower(c.card_type) NOT LIKE '%land%'
        GROUP BY m.hero_deck_name, c.name, c.card_type, c.mana_cost, c.rarity, c.set_code, c.color_identity
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4c. True Decklists (imported) — when present, key cards must be drawn from
    //     these grp_ids, not the logged cards. Load the stored grp_ids per deck.
    let list_rows = sqlx::query(
        "SELECT deck_name, cards_json, commander_grp_id FROM deck_lists"
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4c-ii. Custom deck artwork overrides
    let art_override_rows = sqlx::query(
        "SELECT deck_name, card_name, grp_id FROM deck_art_overrides"
    )
    .fetch_all(db.pool())
    .await
    .unwrap_or_default();
    let mut art_overrides: std::collections::HashMap<String, (String, Option<i64>)> = std::collections::HashMap::new();
    for a in &art_override_rows {
        let dname: String = a.get("deck_name");
        let cname: String = a.get("card_name");
        let gid: Option<i64> = a.get("grp_id");
        art_overrides.insert(dname, (cname, gid));
    }

    // 4d. Collection ownership for the "% owned" column: every grp_id with
    //     owned_count > 0, plus each deck's logged player-side grp_ids.
    let owned = owned_grp_ids(db.pool()).await?;
    let logged_grp_rows = sqlx::query(
        r#"
        SELECT m.hero_deck_name as deck_name, mc.grp_id as grp_id
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
          AND mc.is_opponent = 0
        GROUP BY m.hero_deck_name, mc.grp_id
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;
    let mut logged_grps: std::collections::HashMap<String, std::collections::HashSet<i64>> = std::collections::HashMap::new();
    for r in &logged_grp_rows {
        let dname: String = r.get("deck_name");
        let gid: i64 = r.get("grp_id");
        logged_grps.entry(dname).or_default().insert(gid);
    }

    // 4f. Brawl commander color identity per deck (for filtering logged cards).
    let brawl_cmd_rows = sqlx::query(
        r#"
        SELECT top.hero_deck_name as deck_name, c.color_identity FROM (
            SELECT m.hero_deck_name, m.hero_commander_id,
                   ROW_NUMBER() OVER (PARTITION BY m.hero_deck_name ORDER BY COUNT(*) DESC) as rn
            FROM matches m
            WHERE m.hero_deck_name IS NOT NULL AND m.hero_deck_name != ''
              AND m.hero_commander_id IS NOT NULL
            GROUP BY m.hero_deck_name, m.hero_commander_id
        ) top
        JOIN cards_cache c ON top.hero_commander_id = c.grp_id
        WHERE top.rn = 1
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // 4e. Pre-compute the key-card candidate source per deck:
    //     - True Decklist grp_ids when an import exists
    //     - else logged cards, filtered by commander identity for Brawl decks.
    let mut true_list_grps: std::collections::HashMap<String, Vec<i64>> = std::collections::HashMap::new();
    let mut all_true_grps: Vec<i64> = Vec::new();
    for lr in &list_rows {
        let dname: String = lr.get("deck_name");
        let cards_json: String = lr.get("cards_json");
        let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        let grps: Vec<i64> = entries.iter()
            .filter_map(|e| e.get("grp_id").and_then(|v| v.as_i64()))
            .collect();
        if !grps.is_empty() {
            true_list_grps.insert(dname.clone(), grps.clone());
            for g in grps { if !all_true_grps.contains(&g) { all_true_grps.push(g); } }
        }
    }

    // Batch metadata for every true-list grp_id (avoids N+1 queries).
    let mut meta_by_grp: std::collections::HashMap<i64, serde_json::Value> = std::collections::HashMap::new();
    if !all_true_grps.is_empty() {
        let placeholders = all_true_grps.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let q = format!(
            r#"
            SELECT grp_id, name, card_type, mana_cost, cmc, rarity, set_code, color_identity
            FROM cards_cache WHERE grp_id IN ({})
            "#, placeholders
        );
        let mut q = sqlx::query(&q);
        for g in &all_true_grps { q = q.bind(*g); }
        let meta_rows = q.fetch_all(db.pool()).await.map_err(|e| e.to_string())?;
        for m in meta_rows {
            let grp: i64 = m.get("grp_id");
            meta_by_grp.insert(grp, serde_json::json!({
                "name": m.get::<Option<String>,_>("name"),
                "card_type": m.get::<Option<String>,_>("card_type"),
                "mana_cost": m.get::<Option<String>,_>("mana_cost"),
                "cmc": m.get::<i64,_>("cmc"),
                "rarity": m.get::<i64,_>("rarity"),
                "set_code": m.get::<Option<String>,_>("set_code"),
                "color_identity": m.get::<Option<String>,_>("color_identity"),
            }));
        }
    }

    // Brawl commander identity per deck (parsed colors, empty for non-Brawl).
    let mut deck_identity: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for br in &brawl_cmd_rows {
        let dname: String = br.get("deck_name");
        let ci: Option<String> = br.get("color_identity");
        deck_identity.insert(dname, parse_identity(ci.unwrap_or_default()));
    }

    // Assemble.
    let order = ["W", "U", "B", "R", "G"];
    let mut result = Vec::new();
    for row in base_rows {
        let deck_name: String = row.get("deck_name");
        let total: i64 = row.get("total_matches");
        let wins: i64 = row.get("wins");
        let losses: i64 = row.get("losses");
        let last_played: Option<String> = row.get("last_played");
        let winrate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

        // Format breakdown.
        let mut formats: Vec<serde_json::Value> = Vec::new();
        for f in &format_rows {
            let fdeck: String = f.get("deck_name");
            if fdeck == deck_name {
                formats.push(serde_json::json!({
                    "format": f.get::<String,_>("format"),
                    "count": f.get::<i64,_>("n"),
                }));
            }
        }
        formats.sort_by(|a, b| {
            b.get("count").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&a.get("count").and_then(|v| v.as_i64()).unwrap_or(0))
        });

        // Commander breakdown (names merged across printings).
        let mut commanders: Vec<serde_json::Value> = Vec::new();
        for c in &commander_rows {
            let cdeck: String = c.get("deck_name");
            if cdeck == deck_name {
                commanders.push(serde_json::json!({
                    "name": c.get::<String,_>("commander_name"),
                    "count": c.get::<i64,_>("n"),
                }));
            }
        }

        // Colors + curve.
        use std::collections::HashSet;
        let mut colors: HashSet<String> = HashSet::new();
        let mut curve = vec![0i64; 9];
        // Color-identity pollution guard: only count a card's colors toward the deck's
        // identity if it appeared in >=20% of the deck's matches (min 2). This filters
        // one-off anomalies (stolen/borrowed cards, legacy is_opponent mislabels) while
        // preserving genuine multicolor decks. Mana curve still uses all cards-seen.
        let color_min_count = std::cmp::max(2i64, (total as f64 * 0.20).round() as i64);
        for card in &card_rows {
            let cdeck: String = card.get("deck_name");
            if cdeck != deck_name { continue; }
            let mana_cost: Option<String> = card.get("mana_cost");
            let card_type: Option<String> = card.get("card_type");
            let color_identity: Option<String> = card.get("color_identity");
            let colors_str: Option<String> = card.get("colors");
            let count: i64 = card.get("count");

            // Mana curve: skip lands/tokens and empty-cost cards.
            let is_land_token = card_type.as_deref()
                .map(|t| { let lt = t.to_lowercase(); lt.contains("land") || lt.contains("token") })
                .unwrap_or(false);
            if let Some(cost) = &mana_cost {
                if !is_land_token && !cost.is_empty() {
                    let cmc = card_db::parse_mtga_cmc(cost);
                    let bin = match cmc as usize {
                        0 => 0, 1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6, 7 => 7,
                        _ => 8,
                    };
                    curve[bin] += count;
                }
            }
            if count >= color_min_count {
                for src in [color_identity, colors_str].into_iter().flatten() {
                    for ch in src.chars() {
                        if !ch.is_ascii_alphanumeric() { continue; }
                        match ch {
                            '1' | 'W' => { colors.insert("W".to_string()); },
                            '2' | 'U' => { colors.insert("U".to_string()); },
                            '3' | 'B' => { colors.insert("B".to_string()); },
                            '4' | 'R' => { colors.insert("R".to_string()); },
                            '5' | 'G' => { colors.insert("G".to_string()); },
                            _ => {}
                        }
                    }
                }
            }
        }
        let mut colors_arr: Vec<String> = order.iter()
            .filter(|c| colors.contains(**c)).map(|c| c.to_string()).collect();

        // Dominant commander (top by count) + highest-CMC card for art/representation.
        let mut top_commander_name: Option<String> = None;
        let mut top_commander_grp: Option<i64> = None;
        for tc in &top_commander_rows {
            let tdeck: String = tc.get("deck_name");
            if tdeck == deck_name {
                top_commander_name = tc.get("commander_name");
                top_commander_grp = tc.get("grp_id");
                break;
            }
        }
        let mut top_card_name: Option<String> = None;
        let mut top_card_grp: Option<i64> = None;
        for tc in &top_card_rows {
            let tdeck: String = tc.get("deck_name");
            if tdeck == deck_name {
                top_card_name = tc.get("card_name");
                top_card_grp = tc.get("grp_id");
                break;
            }
        }

        // Key Cards: three representative non-commander cards — highest-MV
        // creature, highest-MV spell (instant/sorcery), highest-MV other
        // (non-creature, non-instant/sorcery, non-land). Fallbacks if a
        // category is missing: extra spell if no creatures, extra creature if
        // no spells, extra creature if no others.
        //
        // Candidate source: the imported True Decklist when one exists; else
        // logged cards filtered to the commander's color identity (Brawl).
        let mut candidates: Vec<serde_json::Value> = Vec::new();
        let is_brawl = deck_identity.get(&deck_name).map(|v| !v.is_empty()).unwrap_or(false);
        if let Some(grps) = true_list_grps.get(&deck_name) {
            for g in grps {
                if let Some(meta) = meta_by_grp.get(g) {
                    candidates.push(serde_json::json!({
                        "name": meta.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        "grp_id": g,
                        "cmc": meta.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0),
                        "card_type": meta.get("card_type"),
                        "mana_cost": meta.get("mana_cost"),
                        "rarity": meta.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0),
                        "set_code": meta.get("set_code"),
                    }));
                }
            }
        } else {
            let identity = deck_identity.get(&deck_name).cloned().unwrap_or_default();
            for kc in &key_card_rows {
                let kdeck: String = kc.get("deck_name");
                if kdeck != deck_name { continue; }
                // Brawl color-identity filter on logged cards.
                if is_brawl && !identity.is_empty() {
                    let ci: Option<String> = kc.get("color_identity");
                    let card_identity = parse_identity(ci.unwrap_or_default());
                    let within = card_identity.is_empty() || card_identity.iter().all(|c| identity.contains(c));
                    if !within { continue; }
                }
                candidates.push(serde_json::json!({
                    "name": kc.get::<String,_>("name"),
                    "grp_id": kc.get::<i64,_>("grp_id"),
                    "cmc": kc.get::<i64,_>("cmc"),
                    "card_type": kc.get::<Option<String>,_>("card_type"),
                    "mana_cost": kc.get::<Option<String>,_>("mana_cost"),
                    "rarity": kc.get::<i64,_>("rarity"),
                    "set_code": kc.get::<Option<String>,_>("set_code"),
                }));
            }
        }

        // Key cards: 8 representative non-commander cards — three highest-CMC
        // creatures, three highest-CMC spells (instant/sorcery), two highest-CMC
        // other (non-creature, non-instant/sorcery, non-land). Fallbacks if a
        // category is short: pull the best remaining card from the other
        // categories so all 8 slots fill when possible.
        let mut key_cards: Vec<serde_json::Value> = Vec::new();
        let mut used: Vec<String> = Vec::new();

        // Slot mapping: [0,1,2]=creature, [3,4,5]=spell, [6,7]=other.
        let slot_kinds = ["creature", "creature", "creature", "spell", "spell", "spell", "other", "other"];

        // First pass: best (highest CMC) unused card per exact kind.
        for (_slot, kind) in slot_kinds.iter().enumerate() {
            let mut best: Option<serde_json::Value> = None;
            for cand in &candidates {
                let name: String = cand.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let card_type = cand.get("card_type").and_then(|v| v.as_str()).unwrap_or("");
                let ct = card_type.to_lowercase();
                if top_commander_name.as_deref() == Some(name.as_str()) { continue; }
                if used.contains(&name) { continue; }

                let is_creature = ct.contains("creature");
                let is_spell = ct.contains("instant") || ct.contains("sorcery");
                let is_other = !is_creature && !is_spell;
                let matches_kind = match *kind {
                    "creature" => is_creature,
                    "spell" => is_spell,
                    _ => is_other,
                };
                if !matches_kind { continue; }

                let cmc: i64 = cand.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
                let replace = match &best {
                    Some(b) => cmc > b.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0),
                    None => true,
                };
                if replace { best = Some(cand.clone()); }
            }
            if let Some(card) = best {
                if let Some(n) = card.get("name").and_then(|v| v.as_str()) { used.push(n.to_string()); }
                key_cards.push(card);
            } else {
                key_cards.push(serde_json::Value::Null);
            }
        }

        // Second pass: fill any empty slots with the best remaining card,
        // preferring that slot's kind, then others (mirrors old fallbacks).
        let fill_order = [
            (0usize, vec!["creature", "spell", "other"]),
            (1usize, vec!["creature", "spell", "other"]),
            (2usize, vec!["creature", "spell", "other"]),
            (3usize, vec!["spell", "creature", "other"]),
            (4usize, vec!["spell", "creature", "other"]),
            (5usize, vec!["spell", "creature", "other"]),
            (6usize, vec!["other", "creature", "spell"]),
            (7usize, vec!["other", "creature", "spell"]),
        ];
        for (slot, priority) in &fill_order {
            if key_cards[*slot].is_null() {
                for kind in priority {
                    let mut best: Option<serde_json::Value> = None;
                    for cand in &candidates {
                        let name: String = cand.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if used.contains(&name) { continue; }
                        if top_commander_name.as_deref() == Some(name.as_str()) { continue; }
                        let card_type = cand.get("card_type").and_then(|v| v.as_str()).unwrap_or("");
                        let ct = card_type.to_lowercase();
                        let is_creature = ct.contains("creature");
                        let is_spell = ct.contains("instant") || ct.contains("sorcery");
                        let is_other = !is_creature && !is_spell;
                        let matches_kind = match *kind {
                            "creature" => is_creature,
                            "spell" => is_spell,
                            _ => is_other,
                        };
                        if !matches_kind { continue; }
                        let cmc: i64 = cand.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
                        let replace = match &best {
                            Some(b) => cmc > b.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0),
                            None => true,
                        };
                        if replace { best = Some(cand.clone()); }
                    }
                    if let Some(card) = best {
                        if let Some(n) = card.get("name").and_then(|v| v.as_str()) { used.push(n.to_string()); }
                        key_cards[*slot] = card;
                        break;
                    }
                }
            }
        }
        // Drop null placeholders, cap at 8.
        key_cards.retain(|v| !v.is_null());
        key_cards.truncate(8);

        // "% owned": true decklist grp_ids when imported, else logged player-side
        // grp_ids. Card-level — distinct cards, not copies.
        let deck_grps: std::collections::HashSet<i64> = match true_list_grps.get(&deck_name) {
            Some(grps) => grps.iter().cloned().collect(),
            None => logged_grps.get(&deck_name).cloned().unwrap_or_default(),
        };
        let (owned_cards, total_ownedable, pct) = ownership_stats(&deck_grps, &owned);
        let owned_pct = if total_ownedable > 0 { Some((pct * 10.0).round() / 10.0) } else { None };

        let mut custom_art_name: Option<String> = None;
        let mut custom_art_grp: Option<i64> = None;
        if let Some((override_name, override_grp)) = art_overrides.get(&deck_name) {
            custom_art_name = Some(override_name.clone());
            custom_art_grp = *override_grp;
            top_commander_name = Some(override_name.clone());
            top_commander_grp = *override_grp;
        }

        result.push(serde_json::json!({
            "deck_name": deck_name,
            "has_list": true_list_grps.contains_key(&deck_name),
            "total_matches": total,
            "wins": wins,
            "losses": losses,
            "winrate": format!("{:.1}%", winrate),
            "formats": formats,
            "commanders": commanders,
            "colors": colors_arr,
            "mana_curve": curve,
            "top_commander_name": top_commander_name,
            "top_commander_grp_id": top_commander_grp,
            "top_card_name": top_card_name,
            "top_card_grp_id": top_card_grp,
            "custom_art_name": custom_art_name,
            "custom_art_grp_id": custom_art_grp,
            "key_cards": key_cards,
            "owned_pct": owned_pct,
            "owned_cards": owned_cards,
            "total_ownedable": total_ownedable,
            "last_played": last_played,
        }));
        let _ = &mut colors_arr;
    }

    Ok(result)
}

/// Set a custom deck box artwork override for a deck.
#[tauri::command]
pub async fn set_deck_custom_art(
    deck_name: String,
    card_name: String,
    grp_id: Option<i64>,
) -> Result<(), String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO deck_art_overrides (deck_name, card_name, grp_id, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(deck_name) DO UPDATE SET
            card_name = excluded.card_name,
            grp_id = excluded.grp_id,
            updated_at = excluded.updated_at
        "#
    )
    .bind(&deck_name)
    .bind(&card_name)
    .bind(grp_id)
    .bind(&now)
    .execute(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Reset custom deck box artwork override for a deck.
#[tauri::command]
pub async fn reset_deck_custom_art(deck_name: String) -> Result<(), String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM deck_art_overrides WHERE deck_name = ?")
        .bind(&deck_name)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Set custom background artwork override for a deck.
#[tauri::command]
pub async fn set_deck_custom_bg_art(deck_name: String, card_name: String, grp_id: Option<i64>) -> Result<(), String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO deck_bg_art_overrides (deck_name, card_name, grp_id, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(deck_name) DO UPDATE SET
            card_name = excluded.card_name,
            grp_id = excluded.grp_id,
            updated_at = excluded.updated_at
        "#
    )
    .bind(&deck_name)
    .bind(&card_name)
    .bind(grp_id)
    .bind(&now)
    .execute(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Reset custom background artwork override for a deck.
#[tauri::command]
pub async fn reset_deck_custom_bg_art(deck_name: String) -> Result<(), String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM deck_bg_art_overrides WHERE deck_name = ?")
        .bind(&deck_name)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Full detail for a single deck (Deck Detail view, Stage 1):
/// base W-L / winrate, play vs draw split, dominant commander, deck colors,
/// and the 5 most recent matches.
#[tauri::command]
pub async fn get_deck_detail(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // Base stats.
    let base_row = sqlx::query(
        r#"
        SELECT COUNT(*) as total,
               SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches
        WHERE hero_deck_name = ?
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let total: i64 = base_row.as_ref().map(|r| r.get("total")).unwrap_or(0);
    let wins: i64 = base_row.as_ref().map(|r| r.get("wins")).unwrap_or(0);
    let losses: i64 = base_row.as_ref().map(|r| r.get("losses")).unwrap_or(0);
    let winrate = if total > 0 { (wins as f64 / total as f64) * 100.0 } else { 0.0 };

    // Play vs draw split (going_first = 1 play, 0 draw). Exclude NULL (unknown
    // order, legacy matches) from both buckets.
    let split_rows = sqlx::query(
        r#"
        SELECT going_first,
               SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches
        WHERE hero_deck_name = ? AND going_first IS NOT NULL
        GROUP BY going_first
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut play = serde_json::json!({ "wins": 0, "losses": 0 });
    let mut draw = serde_json::json!({ "wins": 0, "losses": 0 });
    for r in &split_rows {
        let gf: bool = r.get("going_first");
        let w: i64 = r.get("wins");
        let l: i64 = r.get("losses");
        let obj = if gf { &mut play } else { &mut draw };
        obj["wins"] = serde_json::json!(w);
        obj["losses"] = serde_json::json!(l);
    }

    // Dominant commander (from deck_lists if defined, or from Brawl matches), with a grp_id for art.
    let deck_list_cmd = sqlx::query(
        "SELECT commander_grp_id FROM deck_lists WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let (commander_name, commander_grp_id) = if let Some(dl_row) = deck_list_cmd {
        let cmd_grp: Option<i64> = dl_row.get("commander_grp_id");
        if let Some(cgid) = cmd_grp {
            if cgid > 0 {
                let name_row = sqlx::query_scalar::<_, String>(
                    "SELECT name FROM cards_cache WHERE grp_id = ?"
                )
                .bind(cgid)
                .fetch_optional(db.pool())
                .await
                .map_err(|e| e.to_string())?;
                (name_row, Some(cgid))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        }
    } else {
        // Fallback: check matches ONLY if played in a Brawl/Commander format
        let has_brawl = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM matches WHERE hero_deck_name = ? AND (LOWER(format) LIKE '%brawl%' OR LOWER(format) LIKE '%commander%')"
        )
        .bind(&deck_name)
        .fetch_one(db.pool())
        .await
        .map_err(|e| e.to_string())? > 0;

        if has_brawl {
            let commander_row = sqlx::query(
                r#"
                SELECT commander_name, grp_id FROM (
                    SELECT c.name as commander_name, MIN(m.hero_commander_id) as grp_id, COUNT(*) as n,
                           ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC, c.name ASC) as rn
                    FROM matches m
                    JOIN cards_cache c ON m.hero_commander_id = c.grp_id
                    WHERE m.hero_deck_name = ?
                      AND m.hero_commander_id IS NOT NULL
                      AND (LOWER(m.format) LIKE '%brawl%' OR LOWER(m.format) LIKE '%commander%')
                    GROUP BY c.name
                ) WHERE rn = 1
                "#
            )
            .bind(&deck_name)
            .fetch_optional(db.pool())
            .await
            .map_err(|e| e.to_string())?;
            let cname: Option<String> = commander_row.as_ref().map(|r| r.get("commander_name"));
            let cgrp: Option<i64> = commander_row.as_ref().map(|r| r.get("grp_id"));
            (cname, cgrp)
        } else {
            (None, None)
        }
    };

    // Distinct formats played by this deck (ordered by frequency, excluding Bot Match)
    let format_rows = sqlx::query(
        r#"
        SELECT format, COUNT(*) as n
        FROM matches
        WHERE hero_deck_name = ? AND format IS NOT NULL AND format != '' AND LOWER(format) NOT LIKE '%bot%'
        GROUP BY format
        ORDER BY n DESC
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let formats: Vec<String> = format_rows.into_iter()
        .filter_map(|r| r.get::<Option<String>, _>("format"))
        .collect();

    // Deck colors using the 20% relative-frequency threshold (same as overview).
    let deck_total: i64 = total;
    let color_min_count = std::cmp::max(2i64, (deck_total as f64 * 0.20).round() as i64);
    let color_rows = sqlx::query(
        r#"
        SELECT c.color_identity, c.colors, SUM(mc.count) as count
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
        GROUP BY m.hero_deck_name, c.grp_id, c.color_identity, c.colors
        HAVING SUM(mc.count) >= ?
        "#
    )
    .bind(&deck_name)
    .bind(color_min_count)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let order = ["W", "U", "B", "R", "G"];
    use std::collections::HashSet;
    let mut colors: HashSet<String> = HashSet::new();
    for r in &color_rows {
        let ci: Option<String> = r.get("color_identity");
        let cols: Option<String> = r.get("colors");
        for src in [ci, cols].into_iter().flatten() {
            for ch in src.chars() {
                if !ch.is_ascii_alphanumeric() { continue; }
                match ch {
                    '1' | 'W' => { colors.insert("W".to_string()); },
                    '2' | 'U' => { colors.insert("U".to_string()); },
                    '3' | 'B' => { colors.insert("B".to_string()); },
                    '4' | 'R' => { colors.insert("R".to_string()); },
                    '5' | 'G' => { colors.insert("G".to_string()); },
                    _ => {}
                }
            }
        }
    }
    let colors_arr: Vec<String> = order.iter()
        .filter(|c| colors.contains(**c)).map(|c| c.to_string()).collect();

    // Last 5 matches.
    let recent_rows = sqlx::query(
        r#"
        SELECT id, timestamp, opponent_name, result, hero_life_end, opponent_life_end, going_first
        FROM matches
        WHERE hero_deck_name = ?
        ORDER BY timestamp DESC
        LIMIT 5
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let mut recent: Vec<serde_json::Value> = Vec::new();
    for r in recent_rows {
        recent.push(serde_json::json!({
            "match_id": r.get::<String,_>("id"),
            "timestamp": r.get::<String,_>("timestamp"),
            "opponent_name": r.get::<Option<String>,_>("opponent_name"),
            "result": r.get::<String,_>("result"),
            "hero_life_end": r.get::<Option<i64>,_>("hero_life_end"),
            "opponent_life_end": r.get::<Option<i64>,_>("opponent_life_end"),
            "going_first": r.get::<Option<bool>,_>("going_first"),
        }));
    }

    // Stage 2 chart data: mana value histogram, card-type distribution, and
    // mana-color distribution. Each card counts ONCE (distinct grp_id) so the
    // distributions reflect deck composition, not match frequency.
    //
    // When a True Decklist has been imported, the charts follow it — the stored
    // grp_ids ARE the authoritative deck composition. Otherwise fall back to
    // aggregated logged cards.
    let list_row = sqlx::query(
        "SELECT cards_json FROM deck_lists WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let chart_rows = if let Some(row) = list_row {
        let cards_json: String = row.get("cards_json");
        let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        let grp_ids: Vec<i64> = entries.iter()
            .filter_map(|e| e.get("grp_id").and_then(|v| v.as_i64()))
            .collect();
        if grp_ids.is_empty() {
            Vec::new()
        } else {
            let placeholders = grp_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "SELECT grp_id, cmc, card_type, mana_cost, color_identity, colors \
                 FROM cards_cache WHERE grp_id IN ({})",
                placeholders
            );
            let mut q = sqlx::query(&sql);
            for g in grp_ids { q = q.bind(g); }
            q.fetch_all(db.pool()).await.unwrap_or_default()
        }
    } else {
        sqlx::query(
            r#"
            SELECT c.grp_id, c.cmc, c.card_type, c.mana_cost, c.color_identity, c.colors
            FROM cards_cache c
            JOIN (
                SELECT DISTINCT mc.grp_id
                FROM match_cards mc
                JOIN matches m ON mc.match_id = m.id
                WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
            ) mc ON c.grp_id = mc.grp_id
            "#
        )
        .bind(&deck_name)
        .fetch_all(db.pool())
        .await
        .unwrap_or_default()
    };

    // In Brawl/Commander decks, cards outside the commander's color identity are illegal.
    // However, some cards like Evolving Wilds have colorless identity `[]` but contain
    // mana symbols in oracle text, which isn't the card's color. Filter by
    // the format + dominant commander identity so off-identity cards are
    // excluded from the color counts.
    let is_brawl = formats.iter().any(|f| f.to_lowercase().contains("brawl") || f.to_lowercase().contains("commander"));

    let mut commander_identity: Vec<String> = Vec::new();
    if is_brawl {
        if let Some(cgid) = commander_grp_id {
            let cmd_ci = sqlx::query_scalar::<_, Option<String>>(
                "SELECT color_identity FROM cards_cache WHERE grp_id = ?"
            )
            .bind(cgid)
            .fetch_optional(db.pool())
            .await
            .map_err(|e| e.to_string())?
            .flatten();
            if let Some(ci) = cmd_ci {
                commander_identity = parse_identity(ci);
            }
        }
    }

    // Mana value histogram: bin by CMC (bins 0, 1, 2, 3, 4, 5, 6, 7, 8+).
    // Lands and tokens are excluded entirely — the curve reflects spell costs only.
    let mut curve = vec![0i64; 9];
    // Card type distribution: map primary type (last keyword wins).
    let mut type_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    // Mana color distribution: each card counts once toward each of its colors.
    let mut color_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    // Win-rate pie is computed from total/wins/losses already available.

    fn chart_category(ct: &str) -> String {
        let lower = ct.to_lowercase();
        for kw in ["planeswalker", "battle", "creature", "land", "enchantment", "artifact", "instant", "sorcery"] {
            if lower.contains(kw) {
                return kw[..1].to_uppercase() + &kw[1..];
            }
        }
        if lower.contains("token") { return "Token".to_string(); }
        "Other".to_string()
    }

    for r in &chart_rows {
        let ct: Option<String> = r.get("card_type");
        let mana_cost: Option<String> = r.get("mana_cost");
        let ci: Option<String> = r.get("color_identity");
        let cols: Option<String> = r.get("colors");

        let is_land_token = ct.as_deref().map(|t| {
            let lt = t.to_lowercase();
            lt.contains("land") || lt.contains("token")
        }).unwrap_or(false);

        // Mana value bin (spells only — lands/tokens without a cost excluded).
        if let Some(cost) = &mana_cost {
            if !is_land_token && !cost.is_empty() {
                let cmc = card_db::parse_mtga_cmc(cost);
                let bin = match cmc as usize {
                    0 => 0, 1 => 1, 2 => 2, 3 => 3, 4 => 4, 5 => 5, 6 => 6, 7 => 7,
                    _ => 8,
                };
                curve[bin] += 1;
            }
        }

        // Card type.
        let cat = chart_category(ct.as_deref().unwrap_or("Other"));
        *type_map.entry(cat).or_insert(0) += 1;

        // Mana colors (each card counts once per color it has). Lands/tokens are
        // excluded — this distribution reflects spell colors only.
        if !is_land_token {
            // Brawl color-identity guard: cards outside the commander's identity
            // are legacy leaks and must not pollute the color distribution.
            if is_brawl && !commander_identity.is_empty() {
                let card_identity = parse_identity(ci.clone().unwrap_or_default());
                let within = card_identity.is_empty() || card_identity.iter().all(|c| commander_identity.contains(c));
                if !within { continue; }
            }
            let mut card_colors: Vec<String> = Vec::new();
            for src in [ci, cols].into_iter().flatten() {
                for ch in src.chars() {
                    if !ch.is_ascii_alphanumeric() { continue; }
                    let c = match ch {
                        '1' | 'W' => "W", '2' | 'U' => "U", '3' | 'B' => "B", '4' | 'R' => "R", '5' | 'G' => "G",
                        _ => "",
                    };
                    if !c.is_empty() && !card_colors.contains(&c.to_string()) {
                        card_colors.push(c.to_string());
                    }
                }
            }
            if card_colors.is_empty() {
                *color_counts.entry("C".to_string()).or_insert(0) += 1;
            } else {
                for c in card_colors { *color_counts.entry(c).or_insert(0) += 1; }
            }
        }
    }

    let color_order = ["W", "U", "B", "R", "G", "C"];
    let color_dist: Vec<serde_json::Value> = color_order.iter()
        .filter_map(|c| color_counts.get(*c).map(|n| serde_json::json!({ "color": c, "count": n })))
        .collect();

    let mut types_sorted: Vec<serde_json::Value> = type_map.into_iter()
        .map(|(t, n)| serde_json::json!({ "type": t, "count": n }))
        .collect();
    types_sorted.sort_by(|a, b| b.get("count").and_then(|v| v.as_i64()).unwrap_or(0)
        .cmp(&a.get("count").and_then(|v| v.as_i64()).unwrap_or(0)));

    // Deck card achievements grouped by achievement type and top card achievements (Hero non-tokens only)
    let achievement_rows = sqlx::query_as::<_, (i64, Option<String>, String)>(
        r#"
        SELECT i.grp_id, c.name as card_name, i.titles
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        LEFT JOIN cards_cache c ON i.grp_id = c.grp_id
        WHERE (m.hero_deck_name = ? OR m.id IN (SELECT match_id FROM match_decks WHERE deck_name = ?))
          AND i.seat_id = m.hero_seat_id
          AND m.timestamp >= '2026-08-23T06:30:00'
          AND i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'
          AND (c.card_type IS NULL OR LOWER(c.card_type) NOT LIKE '%token%')
          AND (c.name IS NULL OR LOWER(c.name) NOT LIKE '%token%')
        "#
    )
    .bind(&deck_name)
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .unwrap_or_default();

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

    fn tier_rank(tier: &str) -> i32 {
        match tier.to_lowercase().as_str() {
            "gold" => 3,
            "silver" => 2,
            _ => 1,
        }
    }

    let mut card_ach_counts: std::collections::HashMap<(i64, String, String, String), i64> = std::collections::HashMap::new();
    for (grp_id, card_name_opt, titles_json) in achievement_rows {
        let card_name = card_name_opt.unwrap_or_else(|| format!("Card #{}", grp_id));
        if let Ok(titles) = serde_json::from_str::<Vec<String>>(&titles_json) {
            for raw_title in titles {
                if !raw_title.is_empty() {
                    let (clean_title, tier) = parse_title_and_tier(&raw_title);
                    *card_ach_counts.entry((grp_id, card_name.clone(), clean_title, tier)).or_insert(0) += 1;
                }
            }
        }
    }

    let mut top_card_achievements: Vec<serde_json::Value> = card_ach_counts.iter()
        .map(|((grp_id, card_name, title, tier), count)| {
            serde_json::json!({
                "grp_id": grp_id,
                "card_name": card_name,
                "achievement": title,
                "tier": tier,
                "count": count
            })
        })
        .collect();

    // Priority Sort: Gold > Silver > Bronze, then by count descending
    top_card_achievements.sort_by(|a, b| {
        let tier_a = a.get("tier").and_then(|v| v.as_str()).unwrap_or("bronze");
        let tier_b = b.get("tier").and_then(|v| v.as_str()).unwrap_or("bronze");
        let rank_a = tier_rank(tier_a);
        let rank_b = tier_rank(tier_b);
        if rank_a != rank_b {
            rank_b.cmp(&rank_a)
        } else {
            let cnt_a = a.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            let cnt_b = b.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            cnt_b.cmp(&cnt_a)
        }
    });

    // Grouping by achievement type
    let mut grouped_map: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();
    for ach in &top_card_achievements {
        let ach_name = ach.get("achievement").and_then(|v| v.as_str()).unwrap_or("Achievement").to_string();
        grouped_map.entry(ach_name).or_default().push(ach.clone());
    }

    let mut grouped_by_achievement: Vec<serde_json::Value> = grouped_map.into_iter()
        .map(|(achievement, cards)| {
            let total_count: i64 = cards.iter().filter_map(|c| c.get("count").and_then(|v| v.as_i64())).sum();
            serde_json::json!({
                "achievement": achievement,
                "total_count": total_count,
                "cards": cards
            })
        })
        .collect();

    grouped_by_achievement.sort_by(|a, b| {
        let cnt_a = a.get("total_count").and_then(|v| v.as_i64()).unwrap_or(0);
        let cnt_b = b.get("total_count").and_then(|v| v.as_i64()).unwrap_or(0);
        cnt_b.cmp(&cnt_a)
    });

    let custom_art_row = sqlx::query(
        "SELECT card_name, grp_id FROM deck_art_overrides WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .unwrap_or(None);

    let (custom_art_name, custom_art_grp_id) = if let Some(ca) = custom_art_row {
        (ca.get::<Option<String>, _>("card_name"), ca.get::<Option<i64>, _>("grp_id"))
    } else {
        (None, None)
    };

    let custom_bg_art_row = sqlx::query(
        "SELECT card_name, grp_id FROM deck_bg_art_overrides WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .unwrap_or(None);

    let (custom_bg_art_name, custom_bg_art_grp_id) = if let Some(ca) = custom_bg_art_row {
        (ca.get::<Option<String>, _>("card_name"), ca.get::<Option<i64>, _>("grp_id"))
    } else {
        (None, None)
    };

    let deck_achievements_raw = db.get_deck_achievements(&deck_name).await.unwrap_or_default();
    let deck_achievements: Vec<serde_json::Value> = deck_achievements_raw.into_iter().map(|(ach_id, tier, achieved_at, match_id)| {
        serde_json::json!({
            "achievement_id": ach_id,
            "tier": tier,
            "achieved_at": achieved_at,
            "match_id": match_id
        })
    }).collect();

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "total": total,
        "wins": wins,
        "losses": losses,
        "winrate": format!("{:.1}%", winrate),
        "play": play,
        "draw": draw,
        "commander_name": commander_name,
        "commander_grp_id": commander_grp_id,
        "custom_art_name": custom_art_name,
        "custom_art_grp_id": custom_art_grp_id,
        "custom_bg_art_name": custom_bg_art_name,
        "custom_bg_art_grp_id": custom_bg_art_grp_id,
        "formats": formats,
        "colors": colors_arr,
        "recent_matches": recent,
        "mana_curve": curve,
        "card_types": types_sorted,
        "mana_distribution": color_dist,
        "card_achievements_grouped": grouped_by_achievement,
        "top_card_achievements": top_card_achievements,
        "deck_achievements": deck_achievements,
    }))
}


/// Per-deck "% owned" stats. Uses the True Decklist when one is imported,
/// else falls back to the deck's logged player-side cards. pct is card-level
/// (owned distinct grp_ids / total distinct grp_ids).
pub async fn query_deck_owned_stats(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    deck_name: &str,
) -> Result<serde_json::Value, String> {
    use std::collections::{HashMap, HashSet};

    let list_row = sqlx::query("SELECT cards_json FROM deck_lists WHERE deck_name = ?")
        .bind(deck_name)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let has_list = list_row.is_some();

    let mut by_card: Vec<serde_json::Value> = Vec::new();
    let mut deck_grps: HashSet<i64> = HashSet::new();

    if let Some(row) = list_row {
        let cards_json: String = row.get("cards_json");
        let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        for entry in entries {
            let grp_id: i64 = entry.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let count: i64 = entry.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
            if grp_id > 0 {
                deck_grps.insert(grp_id);
                by_card.push(serde_json::json!({ "grp_id": grp_id, "count": count, "name": null, "owned_count": 0 }));
            }
        }
    } else {
        let rows = sqlx::query(
            r#"
            SELECT mc.grp_id as grp_id, MAX(mc.count) as count
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
            GROUP BY mc.grp_id
            "#
        )
        .bind(deck_name)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        for r in rows {
            let grp_id: i64 = r.get("grp_id");
            let count: i64 = r.get("count");
            deck_grps.insert(grp_id);
            by_card.push(serde_json::json!({ "grp_id": grp_id, "count": count, "name": null, "owned_count": 0 }));
        }
    }

    let owned_map = owned_counts(pool).await?;
    let owned_set: HashSet<i64> = owned_map.keys().cloned().collect();

    let all_ids: Vec<i64> = deck_grps.iter().cloned().collect();
    let mut name_map: HashMap<i64, String> = HashMap::new();
    if !all_ids.is_empty() {
        let placeholders = all_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let q = format!("SELECT grp_id, name FROM cards_cache WHERE grp_id IN ({})", placeholders);
        let mut q = sqlx::query(&q);
        for id in &all_ids { q = q.bind(*id); }
        let rows = q.fetch_all(pool).await.map_err(|e| e.to_string())?;
        for r in rows {
            name_map.insert(r.get::<i64, _>("grp_id"), r.get::<String, _>("name"));
        }
    }

    for card in &mut by_card {
        let gid = card.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
        card["name"] = serde_json::json!(
            name_map.get(&gid).cloned().unwrap_or_else(|| format!("Unknown Card (#{})", gid))
        );
        card["owned_count"] = serde_json::json!(owned_map.get(&gid).copied().unwrap_or(0));
    }

    let (owned_cards, total_cards, pct) = ownership_stats(&deck_grps, &owned_set);
    let owned_pct = if total_cards > 0 { (pct * 10.0).round() / 10.0 } else { 0.0 };

    Ok(serde_json::json!({
        "has_list": has_list,
        "total_cards": total_cards,
        "owned_cards": owned_cards,
        "owned_pct": owned_pct,
        "by_card": by_card,
    }))
}

#[tauri::command]
pub async fn get_deck_owned_stats(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    query_deck_owned_stats(db.pool(), &deck_name).await
}

#[tauri::command]
pub async fn get_commander_info(
    player_commander_id: Option<i64>, 
    opponent_commander_id: Option<i64>
) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let player_commander = if let Some(grp_id) = player_commander_id {
        card_db::get_card_metadata(db.pool(), grp_id).await.ok().flatten()
    } else {
        None
    };

    let opponent_commander = if let Some(grp_id) = opponent_commander_id {
        card_db::get_card_metadata(db.pool(), grp_id).await.ok().flatten()
    } else {
        None
    };

    Ok(serde_json::json!({
        "player_commander": player_commander,
        "opponent_commander": opponent_commander,
    }))
}


/// Aggregates every distinct card the player logged while playing a deck
/// ("All Logged Cards"). Cards are grouped by resolved name (printings merged),
/// with a canonical grp_id for art, the max copies seen in any single match
/// (the practical deck count), the summed copies across all matches, and how
/// many of the deck's matches the card appeared in.
///
/// For Brawl decks, a commander color-identity filter is applied: cards whose
/// identity includes a color outside the commander's identity are dropped as
/// they cannot be part of the deck (a byproduct of legacy is_opponent logging
/// leaks). Colorless cards are always kept.
#[tauri::command]
pub async fn get_deck_cards(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // Determine the deck's format (single-format per deck in practice).
    let format: Option<String> = sqlx::query(
        r#"
        SELECT format FROM matches WHERE hero_deck_name = ? LIMIT 1
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.get("format"));

    let is_brawl = format.as_deref().map(|f| f.eq_ignore_ascii_case("brawl")).unwrap_or(false);

    // Dominant commander color identity for Brawl decks.
    let mut commander_identity: Vec<String> = Vec::new();
    let mut commander_name: Option<String> = None;
    let mut commander_grp_id: Option<i64> = None;
    let mut commander_mana_cost: Option<String> = None;
    let mut commander_rarity: Option<i64> = None;
    if is_brawl {
        let cmd_row = sqlx::query(
            r#"
            SELECT c.name, c.grp_id, c.color_identity, c.mana_cost, c.rarity FROM (
                SELECT m.hero_commander_id, COUNT(*) as n
                FROM matches m
                WHERE m.hero_deck_name = ? AND m.hero_commander_id IS NOT NULL
                GROUP BY m.hero_commander_id
                ORDER BY n DESC LIMIT 1
            ) top
            JOIN cards_cache c ON top.hero_commander_id = c.grp_id
            "#
        )
        .bind(&deck_name)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;

        if let Some(r) = cmd_row {
            let ci: Option<String> = r.get("color_identity");
            if let Some(ci) = ci {
                commander_identity = parse_identity(ci);
            }
            commander_name = r.get("name");
            commander_grp_id = r.get("grp_id");
            commander_mana_cost = r.get("mana_cost");
            commander_rarity = r.get("rarity");
        }
    }

    let rows = sqlx::query(
        r#"
        SELECT c.name,
               MIN(c.grp_id) as grp_id,
               MAX(mc.count) as max_count,
               SUM(mc.count) as total_count,
               COUNT(DISTINCT mc.match_id) as match_freq,
               c.mana_cost, c.card_type, c.colors, c.color_identity, c.cmc, c.rarity, c.set_code
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
        GROUP BY c.name
        ORDER BY c.name ASC
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let total_matches: i64 = sqlx::query(
        r#"
        SELECT COUNT(*) as n FROM matches WHERE hero_deck_name = ?
        "#
    )
    .bind(&deck_name)
    .fetch_one(db.pool())
    .await
    .map_err(|e| e.to_string())?
    .get("n");

    let mut cards: Vec<serde_json::Value> = Vec::new();
    let mut filtered_identity: i64 = 0;
    for r in &rows {
        let name: Option<String> = r.get("name");
        let grp_id: i64 = r.get("grp_id");
        let max_count: i64 = r.get("max_count");
        let total_count: i64 = r.get("total_count");
        let match_freq: i64 = r.get("match_freq");

        // Brawl color-identity filter: drop cards outside the commander's identity.
        if is_brawl && !commander_identity.is_empty() {
            let ci: Option<String> = r.get("color_identity");
            let card_identity = parse_identity(ci.unwrap_or_default());
            let within = card_identity.is_empty() || card_identity.iter().all(|c| commander_identity.contains(c));
            if !within {
                filtered_identity += 1;
                continue;
            }
        }

        // Brawl singleton rule: only one copy of any card except basic lands.
        // Legacy logs sometimes recorded inflated counts (e.g. 3x of a singleton
        // Brawl card); the true-deck upload will fix that at the source, but for
        // now display Brawl decks as the rules dictate. Lands keep their count.
        let card_type = r.get::<Option<String>,_>("card_type");
        let is_land = card_type.as_deref().map(|t| t.to_lowercase().contains("land")).unwrap_or(false);
        let display_count = if is_brawl && !is_land {
            std::cmp::min(max_count, 1)
        } else {
            max_count
        };

        cards.push(serde_json::json!({
            "grp_id": grp_id,
            "name": name.unwrap_or_else(|| format!("Unknown Card (#{})", grp_id)),
            "max_count": display_count,
            "total_count": total_count,
            "match_freq": match_freq,
            "mana_cost": r.get::<Option<String>,_>("mana_cost"),
            "card_type": card_type,
            "colors": r.get::<Option<String>,_>("colors"),
            "color_identity": r.get::<Option<String>,_>("color_identity"),
            "cmc": r.get::<i64,_>("cmc"),
            "rarity": r.get::<i64,_>("rarity"),
            "set_code": r.get::<Option<String>,_>("set_code"),
        }));
    }

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "format": format,
        "is_brawl": is_brawl,
        "commander_name": commander_name,
        "commander_grp_id": commander_grp_id,
        "commander_mana_cost": commander_mana_cost,
        "commander_rarity": commander_rarity,
        "commander_identity": commander_identity,
        "filtered_identity_count": filtered_identity,
        "total_matches": total_matches,
        "cards": cards,
        "card_count": cards.len(),
    }))
}

/// Parses an MTGA color_identity string (comma-separated codes, 1=W 2=U 3=B 4=R
/// 5=G) into a list of color letters. Colorless/empty returns an empty list.
fn parse_identity(s: String) -> Vec<String> {
    let mut out = Vec::new();
    for ch in s.chars() {
        let c = match ch {
            '1' | 'W' => "W",
            '2' | 'U' => "U",
            '3' | 'B' => "B",
            '4' | 'R' => "R",
            '5' | 'G' => "G",
            _ => "",
        };
        if !c.is_empty() && !out.iter().any(|o| o == c) {
            out.push(c.to_string());
        }
    }
    out
}

/// Imports a pasted MTGA deck export for a given deck, resolving every card to
/// a grp_id at import time and storing [{grp_id, count}] JSON. Import never
/// touches match_cards — it is an authoritative canonical list used for the
/// "True Decklist" view.
#[tauri::command]
pub async fn save_deck_list(deck_name: String, export_text: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let parsed = deck_list::parse_deck_export(db.pool(), &export_text).await?;

    let commander_grp = deck_list::commander_to_grp(db.pool(), parsed.commander.clone()).await
        .map_err(|e| e.to_string())?;
    let cards_json = deck_list::cards_to_json(&parsed.cards);
    let sideboard_json = deck_list::cards_to_json(&parsed.sideboard);

    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        r#"
        INSERT INTO deck_lists (deck_name, cards_json, sideboard_json, commander_grp_id, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'export', ?, ?)
        ON CONFLICT(deck_name) DO UPDATE SET
            cards_json = excluded.cards_json,
            sideboard_json = excluded.sideboard_json,
            commander_grp_id = excluded.commander_grp_id,
            updated_at = excluded.updated_at
        "#
    )
    .bind(&deck_name)
    .bind(&cards_json)
    .bind(&sideboard_json)
    .bind(commander_grp)
    .bind(&now)
    .bind(&now)
    .execute(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    // Feed the draw-based collection from the TrueDeckList upload: each maindeck
    // card's owned_count is raised to max(current, min(listed, 4)) — monotonic,
    // never decreased (5th+ copies convert to Vault/gems in Arena, not ownership).
    for (grp_id, count) in &parsed.cards {
        if *grp_id > 0 {
            let _ = db.upsert_collection_from_decklist(*grp_id, *count).await;
        }
    }

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "card_count": parsed.cards.len(),
        "sideboard_count": parsed.sideboard.len(),
        "commander": parsed.commander,
        "unresolved": parsed.unresolved,
        "saved_at": now,
    }))
}

/// Delete a deck. Always removes its True Decklist (if any). When
/// `delete_matches` is true, also removes ALL of its match history (cascades
/// via FK to match_cards / match_turn_events / match_impactful_cards /
/// match_decks). When false, the deck's match history is kept. Deleting a deck
/// never touches collection_cards — cards remain owned in the library.
#[tauri::command]
pub async fn delete_deck(deck_name: String, delete_matches: bool) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    // Remove the True Decklist row (no-op if there was none).
    sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?")
        .bind(&deck_name)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    let mut deleted_matches: u64 = 0;
    if delete_matches {
        let match_result = sqlx::query("DELETE FROM matches WHERE hero_deck_name = ?")
            .bind(&deck_name)
            .execute(db.pool())
            .await
            .map_err(|e| e.to_string())?;
        deleted_matches = match_result.rows_affected();
    }

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "delete_matches": delete_matches,
        "deleted_matches": deleted_matches,
    }))
}

/// Permanently deletes a single match and blacklists its match_id from future log ingestion.

/// Returns the stored True Decklist for a deck (resolved grp_ids), with card
/// metadata joined in, or null if none has been imported.
#[tauri::command]
pub async fn get_deck_list(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        r#"
        SELECT cards_json, sideboard_json, commander_grp_id, created_at, updated_at
        FROM deck_lists WHERE deck_name = ?
        "#
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Ok(serde_json::json!(null));
    };

    let cards_json: String = row.get("cards_json");
    let sideboard_json: Option<String> = row.get("sideboard_json");
    let commander_grp_id: Option<i64> = row.get("commander_grp_id");
    let created_at: String = row.get("created_at");
    let updated_at: String = row.get("updated_at");

    // Join card metadata for the stored grp_ids.
    let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
    let mut cards: Vec<serde_json::Value> = Vec::new();
    for entry in entries {
        let grp_id: i64 = entry.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let count: i64 = entry.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
        let meta = card_db::get_card_metadata(db.pool(), grp_id).await
            .map_err(|e| e.to_string())?
            .unwrap_or(card_db::CardMetadata {
                grp_id,
                name: format!("Unknown Card (#{})", grp_id),
                mana_cost: None, cmc: 0, colors: None, color_identity: None,
                set_code: None, rarity: 0, collector_number: None, card_type: None,
            });
        cards.push(serde_json::json!({
            "grp_id": grp_id,
            "count": count,
            "name": meta.name,
            "mana_cost": meta.mana_cost,
            "card_type": meta.card_type,
            "colors": meta.colors,
            "color_identity": meta.color_identity,
            "cmc": meta.cmc,
            "rarity": meta.rarity,
            "set_code": meta.set_code,
        }));
    }

    // Ensure commander card is in cards list if commander_grp_id is set
    if let Some(cid) = commander_grp_id {
        if cid > 0 && !cards.iter().any(|c| c.get("grp_id").and_then(|v| v.as_i64()) == Some(cid)) {
            let meta = card_db::get_card_metadata(db.pool(), cid).await
                .map_err(|e| e.to_string())?
                .unwrap_or(card_db::CardMetadata {
                    grp_id: cid,
                    name: format!("Unknown Card (#{})", cid),
                    mana_cost: None, cmc: 0, colors: None, color_identity: None,
                    set_code: None, rarity: 0, collector_number: None, card_type: None,
                });
            cards.push(serde_json::json!({
                "grp_id": cid,
                "count": 1,
                "name": meta.name,
                "mana_cost": meta.mana_cost,
                "card_type": meta.card_type,
                "colors": meta.colors,
                "color_identity": meta.color_identity,
                "cmc": meta.cmc,
                "rarity": meta.rarity,
                "set_code": meta.set_code,
            }));
        }
    }

    let sideboard: Vec<serde_json::Value> = match sideboard_json {
        Some(sj) => {
            let entries: Vec<serde_json::Value> = serde_json::from_str(&sj).unwrap_or_default();
            let mut out = Vec::new();
            for entry in entries {
                let grp_id: i64 = entry.get("grp_id").and_then(|v| v.as_i64()).unwrap_or(0);
                let count: i64 = entry.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
                let meta = card_db::get_card_metadata(db.pool(), grp_id).await
                    .map_err(|e| e.to_string())?
                    .unwrap_or(card_db::CardMetadata {
                        grp_id,
                        name: format!("Unknown Card (#{})", grp_id),
                        mana_cost: None, cmc: 0, colors: None, color_identity: None,
                        set_code: None, rarity: 0, collector_number: None, card_type: None,
                    });
                out.push(serde_json::json!({
                    "grp_id": grp_id, "count": count, "name": meta.name,
                    "mana_cost": meta.mana_cost, "card_type": meta.card_type,
                    "cmc": meta.cmc, "rarity": meta.rarity, "set_code": meta.set_code,
                }));
            }
            out
        }
        None => Vec::new(),
    };

    Ok(serde_json::json!({
        "deck_name": deck_name,
        "commander_grp_id": commander_grp_id,
        "created_at": created_at,
        "updated_at": updated_at,
        "cards": cards,
        "sideboard": sideboard,
    }))
}

/// Reports whether a True Decklist exists for a deck and how many of the deck's
/// logged cards are absent from it (stale-mismatch indicator for the UI).
#[tauri::command]
pub async fn get_deck_list_status(deck_name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let row = sqlx::query(
        "SELECT cards_json FROM deck_lists WHERE deck_name = ?"
    )
    .bind(&deck_name)
    .fetch_optional(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = row else {
        return Ok(serde_json::json!({ "has_list": false }));
    };

    let cards_json: String = row.get("cards_json");
    let entries: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
    let stored_names: std::collections::HashSet<String> = {
        let mut set = std::collections::HashSet::new();
        for e in entries {
            if let Some(id) = e.get("grp_id").and_then(|v| v.as_i64()) {
                if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), id).await {
                    set.insert(meta.name);
                }
            }
        }
        set
    };

    // Logged distinct card names for this deck (player side).
    let logged_rows = sqlx::query(
        r#"
        SELECT DISTINCT c.name
        FROM match_cards mc
        JOIN matches m ON mc.match_id = m.id
        JOIN cards_cache c ON mc.grp_id = c.grp_id
        WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
        "#
    )
    .bind(&deck_name)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let logged_names: std::collections::HashSet<String> =
        logged_rows.iter().map(|r| r.get::<String,_>("name")).collect();
    let missing: Vec<&String> = logged_names.iter()
        .filter(|n| !stored_names.contains(*n))
        .collect();

    Ok(serde_json::json!({
        "has_list": true,
        "logged_count": logged_names.len(),
        "stored_count": stored_names.len(),
        "missing_count": missing.len(),
    }))
}

/// Exports a deck in the exact MTGA clipboard format the import accepts:
/// optional Commander section, then Deck, then optional Sideboard, with each
/// line "N Name (SET) collector_number". `source` selects the True Decklist
/// (from deck_lists) or All Logged Cards (aggregated from match_cards).
#[tauri::command]
pub async fn export_decklist(deck_name: String, source: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let use_true = source.eq_ignore_ascii_case("true");

    // Collect (grp_id, count) pairs for the chosen source.
    let mut commander_grp: Option<i64> = None;
    let mut entries: Vec<(i64, i64)> = Vec::new();

    if use_true {
        let row = sqlx::query(
            "SELECT cards_json, sideboard_json, commander_grp_id FROM deck_lists WHERE deck_name = ?"
        )
        .bind(&deck_name)
        .fetch_optional(db.pool())
        .await
        .map_err(|e| e.to_string())?;

        let Some(row) = row else {
            return Ok(serde_json::json!({ "error": "No true decklist imported for this deck", "text": "" }));
        };

        commander_grp = row.get("commander_grp_id");
        let cards_json: String = row.get("cards_json");
        let v: Vec<serde_json::Value> = serde_json::from_str(&cards_json).unwrap_or_default();
        for e in v {
            let grp = e.get("grp_id").and_then(|x| x.as_i64()).unwrap_or(0);
            let count = e.get("count").and_then(|x| x.as_i64()).unwrap_or(1);
            if grp > 0 { entries.push((grp, count)); }
        }
    } else {
        // Aggregated logged cards: distinct by name, canonical grp_id, sum of
        // per-match max copies as the count.
        let rows = sqlx::query(
            r#"
            SELECT c.name, MIN(c.grp_id) as grp_id, MAX(mc.count) as max_count
            FROM match_cards mc
            JOIN matches m ON mc.match_id = m.id
            JOIN cards_cache c ON mc.grp_id = c.grp_id
            WHERE m.hero_deck_name = ? AND mc.is_opponent = 0
            GROUP BY c.name
            ORDER BY c.name ASC
            "#
        )
        .bind(&deck_name)
        .fetch_all(db.pool())
        .await
        .map_err(|e| e.to_string())?;
        for r in &rows {
            let grp: i64 = r.get("grp_id");
            let count: i64 = r.get("max_count");
            entries.push((grp, count));
        }
    }

    // Format: "About\nName <deck>\n\nCommander\n...\n\nDeck\n..." — matches the
    // Moxfield/MTGA deck-name convention so re-imports preserve the deck name.
    let mut lines: Vec<String> = Vec::new();
    lines.push("About".to_string());
    lines.push(format!("Name {}", deck_name));

    if let Some(cgrp) = commander_grp {
        if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), cgrp).await {
            if let (Some(set), Some(num)) = (meta.set_code, meta.collector_number) {
                lines.push("".to_string());
                lines.push("Commander".to_string());
                lines.push(format!("1 {} ({}) {}", meta.name, set, num));
            }
        }
    }

    lines.push("".to_string());
    lines.push("Deck".to_string());
    for (grp, count) in &entries {
        if commander_grp == Some(*grp) { continue; } // commander already listed
        if let Ok(Some(meta)) = card_db::get_card_metadata(db.pool(), *grp).await {
            match (meta.set_code, meta.collector_number) {
                (Some(set), Some(num)) => {
                    lines.push(format!("{} {} ({}) {}", count, meta.name, set, num));
                }
                _ => {
                    lines.push(format!("{} {}", count, meta.name));
                }
            }
        }
    }

    Ok(serde_json::json!({ "text": lines.join("\n") }))
}
