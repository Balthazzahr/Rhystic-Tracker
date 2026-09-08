use crate::db::DatabaseManager;
use crate::card_db;
use sqlx::Row;
use tauri::Manager;

#[tauri::command]
pub async fn get_card_info(grp_id: i64) -> Result<Option<card_db::CardMetadata>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    card_db::get_card_metadata(db.pool(), grp_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_card_info_by_name(name: String) -> Result<Option<card_db::CardMetadata>, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    card_db::get_card_metadata_by_name(db.pool(), &name).await.map_err(|e| e.to_string())
}

/// Every printing of a card (by name) with per-printing set info, plus stats
/// aggregated across all printings: how many decks contain it, how often it was
/// an impactful card, and total/max damage dealt. Used by the card viewer's
/// set/art selector and the stats sidebar.
#[tauri::command]
pub async fn get_card_printings(name: String) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let pool = db.pool();

    // All printings of this card name in the local cache, joined with set metadata.
    let printings_rows = sqlx::query(
        r#"
        SELECT c.grp_id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity,
               c.set_code, c.rarity, c.card_type, c.collector_number,
               sm.name as set_name, sm.released_at as set_released_at
        FROM cards_cache c
        LEFT JOIN sets_metadata sm ON c.set_code = sm.set_code
        WHERE c.name = ?
        ORDER BY sm.released_at DESC, c.set_code ASC
        "#
    )
    .bind(&name)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if printings_rows.is_empty() {
        return Ok(serde_json::json!({ "printings": [], "stats": null }));
    }

    let grp_ids: Vec<i64> = printings_rows.iter().map(|r| r.get::<i64, _>("grp_id")).collect();
    let placeholders = grp_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    // Decks containing this card (any printing).
    let decks_sql = format!(
        r#"
        SELECT dl.deck_name as deck_name
        FROM deck_lists dl, json_each(dl.cards_json) je
        WHERE je.value->>'grp_id' IN ({})
        ORDER BY dl.deck_name
        "#,
        placeholders
    );
    let mut decks_q = sqlx::query_as::<_, (String,)>(&decks_sql);
    for id in &grp_ids {
        decks_q = decks_q.bind(*id);
    }
    let decks = decks_q.fetch_all(pool).await.map_err(|e| e.to_string())?;

    // Impactful-card and damage stats aggregated across all printings (PLAYER ONLY).
    let impactful_sql = format!(
        r#"
        SELECT COUNT(*) as times_impactful,
               COALESCE(SUM(i.total_damage), 0) as total_damage,
               COALESCE(MAX(i.max_hit), 0) as max_hit,
               COALESCE(SUM(i.damage_to_player), 0) as damage_to_player,
               COALESCE(SUM(i.damage_to_permanents), 0) as damage_to_permanents,
               COALESCE(SUM(i.damage_combat), 0) as damage_combat,
               COALESCE(SUM(i.damage_spell), 0) as damage_spell
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        WHERE i.grp_id IN ({}) AND i.seat_id = m.hero_seat_id
        "#,
        placeholders
    );
    let mut impactful_q = sqlx::query_as::<_, (i64, i64, i64, i64, i64, i64, i64)>(&impactful_sql);
    for id in &grp_ids {
        impactful_q = impactful_q.bind(*id);
    }
    let impactful = impactful_q.fetch_one(pool).await.map_err(|e| e.to_string())?;

    // Matches played + win rate when played (PLAYER ONLY):
    // Count distinct matches where this card was played by the player, and how many of those were wins.
    let played_sql = format!(
        r#"
        SELECT 
            COUNT(DISTINCT m.id) as matches_played,
            COALESCE(SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END), 0) as wins_when_played
        FROM matches m
        JOIN match_turn_events e ON m.id = e.match_id
        WHERE e.event_type = 'play' AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id
        "#,
        placeholders
    );
    let mut played_q = sqlx::query_as::<_, (i64, i64)>(&played_sql);
    for id in &grp_ids {
        played_q = played_q.bind(*id);
    }
    let (matches_played, wins_when_played) = played_q.fetch_one(pool).await.unwrap_or((0, 0));

    // Turn cast distribution (rounds 1 through 6+) (PLAYER ONLY):
    // In MTGA, turn_number is incremented for every half-turn (Turn 1 = Player 1 Turn 1, Turn 2 = Player 2 Turn 1, etc.).
    // We map this to game rounds: round = (turn_number + 1) / 2 so "Turn 3" matches Player Round 3.
    let turn_dist_sql = format!(
        r#"
        SELECT ((e.turn_number + 1) / 2) as game_round, COUNT(*) as cnt
        FROM match_turn_events e
        JOIN matches m ON e.match_id = m.id
        WHERE e.event_type = 'play' AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id
        GROUP BY game_round
        ORDER BY game_round ASC
        "#,
        placeholders
    );
    let mut turn_dist_q = sqlx::query_as::<_, (i64, i64)>(&turn_dist_sql);
    for id in &grp_ids {
        turn_dist_q = turn_dist_q.bind(*id);
    }
    let turn_rows = turn_dist_q.fetch_all(pool).await.unwrap_or_default();
    let mut turn_distribution: Vec<serde_json::Value> = Vec::new();
    let mut total_cast_turns = 0f64;
    let mut total_casts = 0f64;
    for (rnd, cnt) in turn_rows {
        total_cast_turns += (rnd as f64) * (cnt as f64);
        total_casts += cnt as f64;
        turn_distribution.push(serde_json::json!({
            "turn": rnd,
            "count": cnt,
        }));
    }
    let avg_cast_turn = if total_casts > 0.0 {
        (total_cast_turns / total_casts * 10.0).round() / 10.0
    } else {
        0.0
    };

    // Best performing deck (PLAYER ONLY):
    let best_deck_sql = format!(
        r#"
        SELECT m.player_deck_name,
               COUNT(DISTINCT m.id) as deck_matches,
               SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as deck_wins
        FROM matches m
        JOIN match_turn_events e ON m.id = e.match_id
        WHERE e.event_type = 'play' AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id AND m.player_deck_name IS NOT NULL AND m.player_deck_name != ''
        GROUP BY m.player_deck_name
        HAVING deck_matches >= 1
        ORDER BY (CAST(deck_wins AS FLOAT) / deck_matches) DESC, deck_matches DESC
        LIMIT 1
        "#,
        placeholders
    );
    let mut best_deck_q = sqlx::query_as::<_, (String, i64, i64)>(&best_deck_sql);
    for id in &grp_ids {
        best_deck_q = best_deck_q.bind(*id);
    }
    let best_deck = best_deck_q.fetch_optional(pool).await.ok().flatten().map(|(name, m_cnt, w_cnt)| {
        let wr = if m_cnt > 0 { (w_cnt as f64 / m_cnt as f64) * 100.0 } else { 0.0 };
        serde_json::json!({
            "name": name,
            "matches": m_cnt,
            "wins": w_cnt,
            "win_rate": wr.round() as i64,
        })
    });

    let printings: Vec<serde_json::Value> = printings_rows.iter().map(|r| {
        let raw_cmc: i64 = r.get("cmc");
        let mana_cost: Option<String> = r.get("mana_cost");
        let cmc = if raw_cmc == 0 { card_db::parse_mtga_cmc(mana_cost.as_deref().unwrap_or("")) } else { raw_cmc };
        serde_json::json!({
            "grp_id": r.get::<i64, _>("grp_id"),
            "name": r.get::<Option<String>, _>("name"),
            "mana_cost": mana_cost,
            "cmc": cmc,
            "colors": r.get::<Option<String>, _>("colors"),
            "color_identity": r.get::<Option<String>, _>("color_identity"),
            "set_code": r.get::<Option<String>, _>("set_code"),
            "set_name": r.get::<Option<String>, _>("set_name"),
            "set_released_at": r.get::<Option<String>, _>("set_released_at"),
            "rarity": r.get::<i64, _>("rarity"),
            "card_type": r.get::<Option<String>, _>("card_type"),
            "collector_number": r.get::<Option<String>, _>("collector_number"),
        })
    }).collect();

    let decks_list: Vec<String> = decks.iter().map(|(d,)| d.clone()).collect();

    let win_rate = if matches_played > 0 {
        ((wins_when_played as f64 / matches_played as f64) * 100.0).round() as i64
    } else {
        0
    };

    // Owned copies across printings (capped at 4)
    let owned_sql = format!(
        r#"
        SELECT COALESCE(SUM(owned_count), 0) as total_owned
        FROM collection_cards
        WHERE grp_id IN ({})
        "#,
        placeholders
    );
    let mut owned_q = sqlx::query_as::<_, (i64,)>(&owned_sql);
    for id in &grp_ids {
        owned_q = owned_q.bind(*id);
    }
    let (total_owned,) = owned_q.fetch_one(pool).await.unwrap_or((0,));
    let owned_count = total_owned.min(4);

    // Mulligan statistics (PLAYER ONLY)
    let mulligan_stats_sql = format!(
        r#"
        SELECT
            COALESCE(SUM(CASE WHEN e.event_type = 'draw' AND e.turn_number = 0 THEN 1 ELSE 0 END), 0) as times_kept,
            COALESCE(SUM(CASE WHEN e.event_type = 'mulligan' THEN 1 ELSE 0 END), 0) as times_mulliganed,
            COALESCE(SUM(CASE WHEN e.event_type = 'bottom' THEN 1 ELSE 0 END), 0) as times_bottomed
        FROM match_turn_events e
        JOIN matches m ON e.match_id = m.id
        WHERE e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id
        "#,
        placeholders
    );
    let mut mul_q = sqlx::query_as::<_, (i64, i64, i64)>(&mulligan_stats_sql);
    for id in &grp_ids {
        mul_q = mul_q.bind(*id);
    }
    let (times_kept, times_mulliganed, times_bottomed) = mul_q.fetch_one(pool).await.unwrap_or((0, 0, 0));

    let total_seen_openers = times_kept + times_mulliganed;
    let keep_rate = if total_seen_openers > 0 {
        ((times_kept as f64 / total_seen_openers as f64) * 100.0).round() as i64
    } else {
        0
    };

    // Opening hand win rate (wins when card was kept in turn 0)
    let opener_wr_sql = format!(
        r#"
        SELECT
            COUNT(DISTINCT m.id) as opener_matches,
            COALESCE(SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END), 0) as opener_wins
        FROM matches m
        JOIN match_turn_events e ON m.id = e.match_id
        WHERE e.event_type = 'draw' AND e.turn_number = 0 AND e.grp_id IN ({}) AND e.seat_id = m.hero_seat_id
        "#,
        placeholders
    );
    let mut op_wr_q = sqlx::query_as::<_, (i64, i64)>(&opener_wr_sql);
    for id in &grp_ids {
        op_wr_q = op_wr_q.bind(*id);
    }
    let (opener_matches, opener_wins) = op_wr_q.fetch_one(pool).await.unwrap_or((0, 0));
    let opener_win_rate = if opener_matches > 0 {
        ((opener_wins as f64 / opener_matches as f64) * 100.0).round() as i64
    } else {
        0
    };

    // Lifetime achievement titles from match_impactful_cards
    let titles_sql = format!(
        r#"
        SELECT i.titles
        FROM match_impactful_cards i
        JOIN matches m ON i.match_id = m.id
        WHERE i.grp_id IN ({}) AND i.seat_id = m.hero_seat_id AND m.timestamp >= '2026-08-23T06:30:00' AND i.titles IS NOT NULL AND i.titles != '' AND i.titles != '[]'
        "#,
        placeholders
    );
    let mut titles_q = sqlx::query_as::<_, (String,)>(&titles_sql);
    for id in &grp_ids {
        titles_q = titles_q.bind(*id);
    }
    let title_rows = titles_q.fetch_all(pool).await.unwrap_or_default();
    let mut lifetime_titles: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for (t_json,) in title_rows {
        if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&t_json) {
            for title in parsed {
                *lifetime_titles.entry(title).or_insert(0) += 1;
            }
        }
    }

    Ok(serde_json::json!({
        "printings": printings,
        "stats": {
            "owned_count": owned_count,
            "deck_count": decks_list.len(),
            "decks": decks_list,
            "matches_played": matches_played,
            "wins_when_played": wins_when_played,
            "losses_when_played": matches_played.saturating_sub(wins_when_played),
            "win_rate": win_rate,
            "times_impactful": impactful.0,
            "total_damage": impactful.1,
            "max_hit": impactful.2,
            "damage_to_player": impactful.3,
            "damage_to_permanents": impactful.4,
            "damage_combat": impactful.5,
            "damage_spell": impactful.6,
            "turn_distribution": turn_distribution,
            "avg_cast_turn": avg_cast_turn,
            "best_deck": best_deck,
            "mulligan_stats": {
                "times_kept": times_kept,
                "times_mulliganed": times_mulliganed,
                "keep_rate": keep_rate,
                "times_bottomed": times_bottomed,
                "opener_matches": opener_matches,
                "opener_wins": opener_wins,
                "opener_win_rate": opener_win_rate,
            },
            "lifetime_titles": lifetime_titles,
        },
    }))
}

/// Manual collection correction. Sets a card's owned_count to an explicit
/// value clamped to [0,4]. A value of 0 removes the card from the collection.
#[tauri::command]
pub async fn update_collection_card_count(grp_id: i64, count: i64) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    db.set_collection_card_count(grp_id, count).await.map_err(|e| e.to_string())?;
    clear_universe_cache();
    let owned = db.is_card_owned(grp_id).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "grp_id": grp_id, "owned": owned }))
}

type CollectionQuery<'q> = sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>;

#[derive(Clone, Debug, PartialEq)]
pub enum QBind {
    Str(String),
    Int(i64),
}

fn apply_binds<'q>(q: CollectionQuery<'q>, binds: &'q [QBind]) -> CollectionQuery<'q> {
    let mut q = q;
    for b in binds {
        match b {
            QBind::Str(s) => { q = q.bind(s.as_str()); }
            QBind::Int(i) => { q = q.bind(i); }
        }
    }
    q
}

/// grp_id -> owned_count for every owned card. Ownership is monotonic from
/// draws/decklist uploads, so `owned_count > 0` is the single owned predicate.
pub async fn owned_counts(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<std::collections::HashMap<i64, i64>, String> {
    let rows = sqlx::query("SELECT grp_id, owned_count FROM collection_cards WHERE owned_count > 0")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for r in rows {
        map.insert(r.get::<i64, _>("grp_id"), r.get::<i64, _>("owned_count"));
    }
    Ok(map)
}

/// All grp_ids currently owned, as a set (for membership checks).
pub async fn owned_grp_ids(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<std::collections::HashSet<i64>, String> {
    Ok(owned_counts(pool).await?.into_keys().collect())
}

/// Card-level ownership of a deck: how many of its distinct grp_ids are owned.
/// Returns (owned_cards, total_cards, pct). pct is 0.0 when total is 0.
pub fn ownership_stats(
    deck_grps: &std::collections::HashSet<i64>,
    owned: &std::collections::HashSet<i64>,
) -> (i64, i64, f64) {
    let total = deck_grps.len() as i64;
    let owned_cards = deck_grps.iter().filter(|g| owned.contains(g)).count() as i64;
    let pct = if total > 0 { (owned_cards as f64 / total as f64) * 100.0 } else { 0.0 };
    (owned_cards, total, pct)
}

/// Dynamic WHERE clauses + bind values for the collection query over cards_cache
/// (`c.` alias). Supports multi-select sets, multi-select colors (incl. colorless
/// "C"), multi-select rarities, card type substring, name search, and an exact
/// mana value (CMC) filter.
pub fn collection_filter_clauses(
    sets: &[String],
    colors: &[String],
    rarities: &[i64],
    types: &[String],
    search: &Option<String>,
    cmc: &Option<i64>,
) -> (Vec<String>, Vec<QBind>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut binds: Vec<QBind> = Vec::new();

    if !sets.is_empty() {
        let placeholders = sets.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        clauses.push(format!("c.set_code IN ({})", placeholders));
        for s in sets { binds.push(QBind::Str(s.clone())); }
    }

    // color_identity stores MTGA numeric codes (1=W 2=U 3=B 4=R 5=G), wrapped
    // in commas so a single-letter match can't hit multi-digit codes. Colorless
    // "C" matches empty/null identity.
    let mut color_clauses: Vec<String> = Vec::new();
    for color in colors {
        match color.as_str() {
            "W" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',1,') > 0".to_string()); }
            "U" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',2,') > 0".to_string()); }
            "B" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',3,') > 0".to_string()); }
            "R" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',4,') > 0".to_string()); }
            "G" => { color_clauses.push("instr(',' || COALESCE(c.color_identity, '') || ',', ',5,') > 0".to_string()); }
            "C" => { color_clauses.push("(c.color_identity IS NULL OR c.color_identity = '')".to_string()); }
            _ => {}
        }
    }
    if !color_clauses.is_empty() {
        // Multi-select colors behave like Deck Library: OR across selected
        // colors (a card matching any selected identity color is shown).
        clauses.push(format!("({})", color_clauses.join(" OR ")));
    }

    if !rarities.is_empty() {
        let placeholders = rarities.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        clauses.push(format!("c.rarity IN ({})", placeholders));
        for r in rarities { binds.push(QBind::Int(*r)); }
    }

    if !types.is_empty() {
        let mut type_clauses: Vec<String> = Vec::new();
        for t in types {
            type_clauses.push("LOWER(COALESCE(c.card_type, '')) LIKE ?".to_string());
            binds.push(QBind::Str(format!("%{}%", t.to_lowercase())));
        }
        clauses.push(format!("({})", type_clauses.join(" OR ")));
    }

    if let Some(search) = search {
        clauses.push("LOWER(c.name) LIKE ?".to_string());
        binds.push(QBind::Str(format!("%{}%", search.to_lowercase())));
    }

    // Exact mana value (CMC). The cache's cmc column is reliable (backfilled).
    // "8+" (cmc value 8) means 8 or more.
    if let Some(mv) = cmc {
        if *mv >= 8 {
            clauses.push("c.cmc >= ?".to_string());
            binds.push(QBind::Int(*mv));
        } else {
            clauses.push("c.cmc = ?".to_string());
            binds.push(QBind::Int(*mv));
        }
    }

    (clauses, binds)
}

fn collection_name_key(v: &serde_json::Value) -> String {
    v.get("name").and_then(|n| n.as_str()).unwrap_or("").to_lowercase()
}

fn sort_collection_cards(cards: &mut Vec<serde_json::Value>, sort: &str, sort_dir: &str) {
    match sort {
        "cmc" => cards.sort_by(|a, b| {
            a.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&b.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "rarity" => cards.sort_by(|a, b| {
            a.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&b.get("rarity").and_then(|v| v.as_i64()).unwrap_or(0))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "set" | "released" => cards.sort_by(|a, b| {
            a.get("set_released_at").and_then(|v| v.as_str()).unwrap_or("")
                .cmp(b.get("set_released_at").and_then(|v| v.as_str()).unwrap_or(""))
                .then_with(|| a.get("set_name").and_then(|v| v.as_str()).unwrap_or("").cmp(b.get("set_name").and_then(|v| v.as_str()).unwrap_or("")))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        "count" => cards.sort_by(|a, b| {
            b.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0)
                .cmp(&a.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0))
                .then_with(|| collection_name_key(a).cmp(&collection_name_key(b)))
        }),
        _ => cards.sort_by(|a, b| collection_name_key(a).cmp(&collection_name_key(b))),
    }
    if sort_dir.eq_ignore_ascii_case("desc") {
        cards.reverse();
    }
}

/// Full collection browse/filter query, shared by the IPC command and tests.
///
/// Universe: every card in the local MTGA card database (cards_cache). This is
/// the full set of Arena cards (incl. all printings across sets), so filtering
/// by "Not Collected" + a set shows every card that set contains, not just the
/// ones that appear in uploaded True Decklists. `owned_count` comes from
/// collection_cards (0 when a card has no ownership signal).
///
/// `owned` filter: "all" = every cached card, "owned" = owned_count > 0,
/// "unowned" = cached cards with owned_count = 0.
///
/// Multi-select filters: `sets` (Vec<String> set codes), `colors`
/// A single printing's card metadata (no ownership — that's joined per-query).
#[derive(Clone)]
pub struct UniverseCard {
    grp_id: i64,
    name: String,
    mana_cost: Option<String>,
    cmc: i64,
    colors: Option<String>,
    color_identity: Option<String>,
    set_code: Option<String>,
    set_name: Option<String>,
    set_released_at: Option<String>,
    rarity: i64,
    card_type: Option<String>,
    collector_number: Option<String>,
}

/// Process-wide cache of the full card universe (every printing in cards_cache,
/// ~26k rows), keyed by database filename so parallel tests (each with their own
/// temp DB) never collide. cards_cache is static during a run, so the cache only
/// needs invalidating when set metadata changes.
static UNIVERSE_CACHE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<Vec<UniverseCard>>>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// Identity of a pool's database file (cache key).
fn universe_db_key(pool: &sqlx::Pool<sqlx::Sqlite>) -> String {
    pool.connect_options().as_ref().clone().get_filename().to_string_lossy().to_string()
}

/// Load every printing's metadata from cards_cache (joined to sets_metadata for
/// set display names / release dates). This is the slow query — cached after the
/// first build so subsequent collection queries run entirely in memory.
async fn build_universe(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<Vec<UniverseCard>, String> {
    let rows = sqlx::query(
        r#"
        SELECT c.grp_id, c.name, c.mana_cost, c.cmc, c.colors, c.color_identity,
               c.set_code, c.rarity, c.card_type, c.collector_number,
               sm.name as set_name, sm.released_at as set_released_at
        FROM cards_cache c
        LEFT JOIN sets_metadata sm ON c.set_code = sm.set_code
        WHERE (c.card_type IS NULL OR c.card_type NOT LIKE '%Token%')
        "#
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut raw_cards = Vec::with_capacity(rows.len());
    for r in rows {
        let raw_cmc: i64 = r.get("cmc");
        let mana_cost: Option<String> = r.get("mana_cost");
        let cmc = if raw_cmc == 0 { card_db::parse_mtga_cmc(mana_cost.as_deref().unwrap_or("")) } else { raw_cmc };
        raw_cards.push(UniverseCard {
            grp_id: r.get("grp_id"),
            name: r.get::<String, _>("name"),
            mana_cost,
            cmc,
            colors: r.get("colors"),
            color_identity: r.get("color_identity"),
            set_code: r.get("set_code"),
            set_name: r.get("set_name"),
            set_released_at: r.get("set_released_at"),
            rarity: r.get("rarity"),
            card_type: r.get("card_type"),
            collector_number: r.get("collector_number"),
        });
    }

    // Identify subordinate split-card face entries (e.g. 'Appeal' or 'Authority'
    // when 'Appeal /// Authority' or 'Appeal // Authority' exists for the same set+collector_number).
    let mut split_subparts: std::collections::HashSet<(String, String, String)> = std::collections::HashSet::new();
    for c in &raw_cards {
        let s_code = c.set_code.as_deref().unwrap_or("").to_string();
        let c_num = c.collector_number.as_deref().unwrap_or("").to_string();
        if c.name.contains("///") {
            for part in c.name.split("///") {
                split_subparts.insert((s_code.clone(), c_num.clone(), part.trim().to_string()));
            }
        } else if c.name.contains(" // ") {
            for part in c.name.split(" // ") {
                split_subparts.insert((s_code.clone(), c_num.clone(), part.trim().to_string()));
            }
        }
    }

    // Identify Alchemy "Specialize" / in-game variant faces (e.g. Alora, Ambergris, Skanos variants sharing the same set+collector_number)
    // where multiple cards in the same set+collector_number group share the same base name prefix.
    let mut cn_groups: std::collections::HashMap<(String, String), Vec<(i64, String)>> = std::collections::HashMap::new();
    for c in &raw_cards {
        let s_code = c.set_code.as_deref().unwrap_or("").to_string();
        let c_num = c.collector_number.as_deref().unwrap_or("").to_string();
        cn_groups.entry((s_code, c_num)).or_default().push((c.grp_id, c.name.clone()));
    }

    let mut specialize_subs: std::collections::HashSet<i64> = std::collections::HashSet::new();
    for ((_s, _cn), members) in cn_groups {
        if members.len() > 1 {
            let base_name = &members[0].1;
            let root = base_name.split(',').next().unwrap_or("").split_whitespace().next().unwrap_or("");
            if !root.is_empty() {
                let matching: Vec<_> = members.iter().filter(|m| m.1.starts_with(root)).collect();
                if matching.len() > 1 {
                    for m in matching.iter().skip(1) {
                        specialize_subs.insert(m.0);
                    }
                }
            }
        }
    }

    let out: Vec<UniverseCard> = raw_cards
        .into_iter()
        .filter(|c| {
            let s_code = c.set_code.as_deref().unwrap_or("").to_string();
            let c_num = c.collector_number.as_deref().unwrap_or("").to_string();
            if split_subparts.contains(&(s_code, c_num, c.name.clone())) {
                return false;
            }
            if specialize_subs.contains(&c.grp_id) {
                return false;
            }
            true
        })
        .collect();

    Ok(out)
}

/// Return the cached card universe, building it lazily on first call. The build
/// (a 26k-row query) happens at most once per process; pre-warmed at startup so
/// the first Card Library visit is instant.
pub async fn get_universe(pool: &sqlx::Pool<sqlx::Sqlite>) -> Result<std::sync::Arc<Vec<UniverseCard>>, String> {
    let key = universe_db_key(pool);
    {
        let guard = UNIVERSE_CACHE.lock().unwrap();
        if let Some(u) = guard.get(&key) {
            return Ok(u.clone());
        }
    }
    let built = std::sync::Arc::new(build_universe(pool).await?);
    let mut guard = UNIVERSE_CACHE.lock().unwrap();
    guard.entry(key).or_insert_with(|| built.clone());
    Ok(built)
}

/// Drop the cached universe for every database. Used when set metadata is
/// refreshed and by tests that seed their own cards_cache.
pub fn clear_universe_cache() {
    UNIVERSE_CACHE.lock().unwrap().clear();
}

/// Merge per-printing card entries by name into a single row per card (like
/// Arena's collection). Owned copies sum across printings, capped at 4; the
/// representative keeps the newest printing's set/art.
fn merge_collection_by_name(cards: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    let mut merged: Vec<serde_json::Value> = Vec::new();
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for card in cards {
        let name = card.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if let Some(&i) = index.get(&name) {
            let existing = &mut merged[i];
            let have = existing.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0);
            let add = card.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0);
            existing["owned_count"] = serde_json::json!((have + add).min(4));
            // Keep the newer printing (higher release date) for set/art.
            let cur_rel = existing.get("set_released_at").and_then(|v| v.as_str()).unwrap_or("");
            let new_rel = card.get("set_released_at").and_then(|v| v.as_str()).unwrap_or("");
            if new_rel > cur_rel {
                *existing = card;
                existing["owned_count"] = serde_json::json!((have + add).min(4));
            }
        } else {
            index.insert(name.clone(), merged.len());
            merged.push(card);
        }
    }
    merged
}

/// (Vec<String> W/U/B/R/G/C), `rarities` (Vec<i64>), `types` (Vec<String>
/// card-type substrings), plus `search` (name substring). `sort` + `sort_dir`.
///
/// Returns the FULL filtered/sorted/merged list (no server-side pagination) so
/// the frontend can re-slice instantly on window resize. The card universe is
/// served from a process-wide cache built once (see `get_universe`), making
/// every query run in memory (milliseconds) instead of re-loading all ~26k
/// cards from SQLite.
pub async fn query_collection(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    filters: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let owned_filter = filters.get("owned").and_then(|v| v.as_str()).unwrap_or("all").to_string();

    let sets: Vec<String> = filters.get("sets")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let colors: Vec<String> = filters.get("colors")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let rarities: Vec<i64> = filters.get("rarities")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|r| r.as_i64()).collect())
        .unwrap_or_default();
    let types: Vec<String> = filters.get("types")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    let search_filter = filters.get("search").and_then(|v| v.as_str())
        .map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let cmc_filter = filters.get("cmc").and_then(|v| v.as_i64());
    let sort = filters.get("sort").and_then(|v| v.as_str()).unwrap_or("name").to_string();
    let sort_dir = filters.get("sort_dir").and_then(|v| v.as_str()).unwrap_or("asc").to_string();

    // Cached full card universe (all printings) + fresh owned counts.
    let universe = get_universe(pool).await?;
    let owned = owned_counts(pool).await?;

    // 1. Build a full metadata list with owned_count joined in.
    let mut cards: Vec<serde_json::Value> = Vec::with_capacity(universe.len());
    for uc in universe.iter() {
        let owned_count = owned.get(&uc.grp_id).copied().unwrap_or(0);
        cards.push(serde_json::json!({
            "grp_id": uc.grp_id,
            "name": uc.name,
            "mana_cost": uc.mana_cost,
            "cmc": uc.cmc,
            "colors": uc.colors,
            "color_identity": uc.color_identity,
            "set_code": uc.set_code,
            "set_name": uc.set_name,
            "set_released_at": uc.set_released_at,
            "rarity": uc.rarity,
            "card_type": uc.card_type,
            "collector_number": uc.collector_number,
            "owned_count": owned_count,
        }));
    }

    // 1b. Global collection stats over the FULL universe (every card in the
    //     client), independent of the current filters — the footer's
    //     "owned / all cards in client" figure. Merged by name so the counts
    //     reflect unique cards, like the collection grid.
    let global_merged = merge_collection_by_name(cards.clone());
    let total_cards_global = global_merged.len() as i64;
    let total_owned_cards_global = global_merged.iter()
        .filter(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0)
        .count() as i64;
    let total_owned_copies_all_global: i64 = global_merged.iter()
        .filter_map(|c| c.get("owned_count").and_then(|v| v.as_i64()))
        .sum();

    // 2. Metadata filters in memory (mirrors the previous SQL WHERE clauses,
    //    applied per-printing BEFORE the by-name merge so results match).
    if !sets.is_empty() {
        cards.retain(|c| {
            c.get("set_code").and_then(|v| v.as_str())
                .map(|s| sets.iter().any(|x| x == s)).unwrap_or(false)
        });
    }
    if !colors.is_empty() {
        let has_c = colors.iter().any(|c| c == "C");
        let mut target_colors: Vec<String> = colors.iter().filter(|c| *c != "C").cloned().collect();
        target_colors.sort();

        cards.retain(|c| {
            let ci_str = c.get("color_identity").and_then(|v| v.as_str()).unwrap_or("");
            let col_str = c.get("colors").and_then(|v| v.as_str()).unwrap_or("");
            let mut card_colors: Vec<String> = Vec::new();
            for src in [ci_str, col_str] {
                for ch in src.chars() {
                    let letter = match ch {
                        '1' | 'W' => "W",
                        '2' | 'U' => "U",
                        '3' | 'B' => "B",
                        '4' | 'R' => "R",
                        '5' | 'G' => "G",
                        _ => "",
                    };
                    if !letter.is_empty() && !card_colors.contains(&letter.to_string()) {
                        card_colors.push(letter.to_string());
                    }
                }
            }
            card_colors.sort();

            if has_c && target_colors.is_empty() {
                card_colors.is_empty()
            } else if !has_c && !target_colors.is_empty() {
                card_colors == target_colors
            } else if has_c && !target_colors.is_empty() {
                card_colors.is_empty() || card_colors == target_colors
            } else {
                true
            }
        });
    }
    if !rarities.is_empty() {
        cards.retain(|c| {
            c.get("rarity").and_then(|v| v.as_i64())
                .map(|r| rarities.contains(&r)).unwrap_or(false)
        });
    }
    if !types.is_empty() {
        cards.retain(|c| {
            let ct = c.get("card_type").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            types.iter().any(|t| ct.contains(&t.to_lowercase()))
        });
    }
    if let Some(search) = &search_filter {
        let q = search.to_lowercase();
        cards.retain(|c| {
            c.get("name").and_then(|v| v.as_str())
                .map(|n| n.to_lowercase().contains(&q)).unwrap_or(false)
        });
    }
    if let Some(mv) = cmc_filter {
        cards.retain(|c| {
            let cmc = c.get("cmc").and_then(|v| v.as_i64()).unwrap_or(0);
            if mv >= 8 { cmc >= mv } else { cmc == mv }
        });
    }

    // 3. Merge duplicate printings of the same card name into a single entry
    //    (like Arena's collection: one row per card, not per printing). Copies
    //    sum across printings, capped at 4. The representative keeps the newest
    //    printing's set/art.
    cards = merge_collection_by_name(cards);

    // 4. Ownership filter. `owned` = collected (>=1), `unowned` = not collected.
    //    An exact `copies` value (1..=4) narrows to exactly that many copies.
    let copies = filters.get("copies").and_then(|v| v.as_u64());
    if owned_filter == "owned" {
        cards.retain(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0);
    } else if owned_filter == "unowned" {
        cards.retain(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) == 0);
    }
    if let Some(n) = copies {
        let n = n.min(4) as i64;
        cards.retain(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) == n);
    }

    sort_collection_cards(&mut cards, &sort, &sort_dir);

    let filtered_count = cards.len() as i64;

    // Ownership stats over the filtered set (page-scoped, unused by the UI).
    let total_owned_cards_filtered = cards.iter()
        .filter(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0)
        .count() as i64;
    let owned_grp_ids: Vec<i64> = cards.iter()
        .filter(|c| c.get("owned_count").and_then(|v| v.as_i64()).unwrap_or(0) > 0)
        .filter_map(|c| c.get("grp_id").and_then(|v| v.as_i64()))
        .collect();
    let total_owned_copies_filtered: i64 = cards.iter()
        .filter_map(|c| c.get("owned_count").and_then(|v| v.as_i64()))
        .sum();

    Ok(serde_json::json!({
        "cards": cards,
        "page": 1,
        "page_size": filtered_count,
        "total_pages": 1,
        "summary": {
            "total_cards": total_cards_global,
            "owned_cards": total_owned_cards_filtered,
            "owned_grp_ids": owned_grp_ids,
            "total_owned_copies": total_owned_copies_filtered,
            "total_owned_cards": total_owned_cards_global,
            "total_owned_copies_all": total_owned_copies_all_global,
        },
    }))
}

#[tauri::command]
pub async fn get_collection(filters: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let filters = filters.unwrap_or_else(|| serde_json::json!({}));
    query_collection(db.pool(), &filters).await
}

/// Set display metadata (name + release date) for sets present in the user's
/// collection (decklist-derived cards), sorted by release date (newest first).
/// Also reports how many sets are known locally and when they were last updated.
#[tauri::command]
pub async fn get_set_metadata() -> Result<serde_json::Value, String> {
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;

    let rows = sqlx::query(
        r#"
        SELECT DISTINCT c.set_code as set_code, sm.name as name, sm.released_at as released_at,
               sm.icon_svg_uri as icon_svg_uri
        FROM cards_cache c
        JOIN (
            SELECT je.value->>'grp_id' as grp_id
            FROM deck_lists dl, json_each(dl.cards_json) je
        ) d ON c.grp_id = d.grp_id
        LEFT JOIN sets_metadata sm ON c.set_code = sm.set_code
        WHERE c.set_code IS NOT NULL AND c.set_code != ''
        ORDER BY sm.released_at DESC, sm.name ASC
        "#
    )
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    let sets: Vec<serde_json::Value> = rows.iter().map(|r| {
        serde_json::json!({
            "set_code": r.get::<Option<String>,_>("set_code"),
            "name": r.get::<Option<String>,_>("name"),
            "released_at": r.get::<Option<String>,_>("released_at"),
            "icon_svg_uri": r.get::<Option<String>,_>("icon_svg_uri"),
        })
    }).collect();

    let meta_row = sqlx::query_scalar::<_, Option<String>>(
        "SELECT MAX(updated_at) FROM sets_metadata"
    )
    .fetch_one(db.pool())
    .await
    .map_err(|e| e.to_string())?;
    let known_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sets_metadata")
        .fetch_one(db.pool())
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "sets": sets,
        "known_count": known_count,
        "last_updated": meta_row,
    }))
}

/// Persist Scryfall set metadata (name + release date) into sets_metadata.
/// The frontend fetches https://api.scryfall.com/sets and passes the list here.
#[tauri::command]
pub async fn refresh_set_metadata(sets: serde_json::Value) -> Result<serde_json::Value, String> {
    // Set names/release dates feed the cached card universe, so drop it so the
    // next collection query rebuilds with the fresh metadata.
    clear_universe_cache();
    let db = DatabaseManager::init().await.map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    let arr = sets.as_array().cloned().unwrap_or_default();
    let mut count = 0usize;
    for s in &arr {
        // Accept both scryfall field names and our normalised names.
        let code = s.get("code")
            .or_else(|| s.get("set_code"))
            .and_then(|v| v.as_str())
            .map(|c| c.to_uppercase())
            .unwrap_or_default();
        let name = s.get("name")
            .or_else(|| s.get("set_name"))
            .and_then(|v| v.as_str())
            .unwrap_or("").to_string();
        let released_at = s.get("released_at").and_then(|v| v.as_str()).map(|s| s.to_string());
        let icon_svg_uri = s.get("icon_svg_uri").and_then(|v| v.as_str()).map(|s| s.to_string());
        if code.is_empty() || name.is_empty() {
            continue;
        }
        sqlx::query(
            r#"
            INSERT INTO sets_metadata (set_code, name, released_at, icon_svg_uri, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(set_code) DO UPDATE SET
                name = excluded.name,
                released_at = COALESCE(excluded.released_at, sets_metadata.released_at),
                icon_svg_uri = COALESCE(excluded.icon_svg_uri, sets_metadata.icon_svg_uri),
                updated_at = excluded.updated_at
            "#
        )
        .bind(&code)
        .bind(&name)
        .bind(&released_at)
        .bind(&icon_svg_uri)
        .bind(&now)
        .execute(db.pool())
        .await
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(serde_json::json!({ "updated": count, "at": now }))
}

/// Directory where downloaded Scryfall card images are cached locally so they
/// never need re-fetching (avoids the API rate limit on repeat renders).
/// Lives under Tauri's appConfigDir (~/.config/com.rhystic.tracker) so the
/// asset protocol scope ($APPCONFIG/cardimg/*) covers it.
pub fn card_img_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let img_dir = dir.join("cardimg");
    std::fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;
    Ok(img_dir)
}

pub fn card_img_filename(name: &str, version: &str) -> String {
    // Sanitized name + version; stable across calls for the same card.
    let mut s: String = name.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    s.truncate(80);
    format!("{}_{}.img", s, version)
}

/// Save a downloaded card image (bytes) to the local cache. Returns the file
/// path the frontend can pass to convertFileSrc. If saved under a specific
/// printing (`Name|Set|CN`), also saves under the generic card name if that
/// does not yet exist.
#[tauri::command]
pub fn save_card_image(app: tauri::AppHandle, name: String, version: String, data: Vec<u8>) -> Result<String, String> {
    let dir = card_img_cache_dir(&app)?;
    let path = dir.join(card_img_filename(&name, &version));
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;

    // If saved with a specific printing key (e.g. "Card Name|dom|16"), also ensure
    // the generic base name file exists so lookups without printing find it.
    if let Some(base_name) = name.split('|').next() {
        let trimmed_base = base_name.trim();
        if !trimmed_base.is_empty() && trimmed_base != name.as_str() {
            let generic_path = dir.join(card_img_filename(trimmed_base, &version));
            if !generic_path.exists() {
                let _ = std::fs::write(&generic_path, &data);
            }
        }
    }

    Ok(path.to_string_lossy().to_string())
}

/// If a card image is already cached locally, return its file path (for
/// convertFileSrc); otherwise null. Checks exact printing filename first, then
/// falls back to checking the generic card name on disk.
/// If requesting 'small' resolution and 'normal' is already cached on disk, returns 'normal'.
#[tauri::command]
pub fn has_card_image(app: tauri::AppHandle, name: String, version: String) -> Result<Option<String>, String> {
    let dir = card_img_cache_dir(&app)?;

    // 1. Exact match with requested version
    let exact_path = dir.join(card_img_filename(&name, &version));
    if exact_path.exists() {
        return Ok(Some(exact_path.to_string_lossy().to_string()));
    }

    // 2. If 'small' requested, check if higher-resolution 'normal' is already on disk
    if version == "small" {
        let exact_normal = dir.join(card_img_filename(&name, "normal"));
        if exact_normal.exists() {
            return Ok(Some(exact_normal.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn get_preferred_prints(
    db_manager: tauri::State<'_, std::sync::Arc<DatabaseManager>>,
) -> Result<std::collections::HashMap<String, (String, String, Option<i64>)>, String> {
    db_manager.get_preferred_prints().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_preferred_print(
    db_manager: tauri::State<'_, std::sync::Arc<DatabaseManager>>,
    card_name: String,
    set_code: String,
    collector_number: String,
    grp_id: Option<i64>,
) -> Result<(), String> {
    db_manager.set_preferred_print(&card_name, &set_code, &collector_number, grp_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_preferred_print(
    db_manager: tauri::State<'_, std::sync::Arc<DatabaseManager>>,
    card_name: String,
) -> Result<(), String> {
    db_manager.clear_preferred_print(&card_name).await.map_err(|e| e.to_string())
}

