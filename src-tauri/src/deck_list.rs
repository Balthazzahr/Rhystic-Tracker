use sqlx::{Pool, Row, Sqlite};
use serde_json::json;

/// Parsed result of an MTGA deck export.
pub struct ParsedDeckList {
    pub commander: Option<String>,
    pub cards: Vec<(i64, i64)>, // (grp_id, count)
    pub sideboard: Vec<(i64, i64)>,
    pub unresolved: Vec<String>, // names we could not resolve to a grp_id
}

/// Normalizes apostrophes (curly ’ -> straight ') so names match the cache.
fn normalize_name(name: &str) -> String {
    name.trim().replace('\u{2019}', "'")
}

/// Parses a single decklist line "N Name (SET) num".
/// Returns (quantity, name, set_code, collector_number).
fn parse_line(line: &str) -> Option<(i64, String, Option<String>, Option<String>)> {
    let line = line.trim();
    if line.is_empty() { return None; }

    // Split quantity off the front.
    let mut parts = line.splitn(2, ' ');
    let qty_str = parts.next()?.trim();
    let rest = parts.next()?.trim();
    let qty: i64 = qty_str.parse().ok()?;
    if qty <= 0 || rest.is_empty() { return None; }

    // Extract trailing "(SET) num".
    let (name, set_code, collector_number) = if let Some(open) = rest.rfind(" (") {
        let maybe_suffix = &rest[open + 2..];
        // Suffix form: "SET) num" or "SET)" — find the closing paren.
        if let Some(close) = maybe_suffix.find(')') {
            let set_part = &maybe_suffix[..close];
            let set_code = set_part.trim().to_string();
            let after = maybe_suffix[close + 1..].trim();
            let collector_number = after.split_whitespace().next()
                .map(|s| s.to_string());
            let name = rest[..open].trim().to_string();
            (name, Some(set_code), collector_number)
        } else {
            (rest.to_string(), None, None)
        }
    } else {
        (rest.to_string(), None, None)
    };

    Some((qty, normalize_name(&name), set_code, collector_number))
}

/// Resolves a card name to the lowest grp_id in cards_cache (printings merged,
/// deterministic). Returns None if the name has no cache entry.
async fn resolve_by_name(pool: &Pool<Sqlite>, name: &str) -> Result<Option<i64>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT MIN(grp_id) as grp_id FROM cards_cache WHERE name = ?"
    )
    .bind(name)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|r| r.get::<Option<i64>,_>("grp_id")))
}

/// Resolves a (set_code, collector_number) pair to the lowest grp_id.
/// Returns None if no card matches, or if the pair is ambiguous (multiple
/// distinct names share it) — in which case the caller falls back to name.
async fn resolve_by_set_key(
    pool: &Pool<Sqlite>,
    set_code: &str,
    collector_number: &str,
) -> Result<Option<i64>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT grp_id FROM cards_cache
        WHERE set_code = ? AND collector_number = ?
        ORDER BY grp_id ASC
        "#
    )
    .bind(set_code)
    .bind(collector_number)
    .fetch_all(pool)
    .await?;

    // Ambiguous (multiple distinct grp_ids, e.g. SPG/0): let caller fall back
    // to exact name resolution.
    if rows.len() != 1 {
        return Ok(None);
    }
    Ok(Some(rows[0].get("grp_id")))
}

/// Parses an MTGA deck export string and resolves every card to a grp_id.
/// Section headers: Commander / Deck / Sideboard.
pub async fn parse_deck_export(
    pool: &Pool<Sqlite>,
    text: &str,
) -> Result<ParsedDeckList, String> {
    let mut commander: Option<String> = None;
    let mut section = "Deck"; // default to Deck if no headers present
    let mut raw_cards: Vec<(i64, String, Option<String>, Option<String>)> = Vec::new();
    let mut raw_sideboard: Vec<(i64, String, Option<String>, Option<String>)> = Vec::new();
    let mut unresolved: Vec<String> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

        // Section headers.
        if trimmed.eq_ignore_ascii_case("Commander") {
            section = "Commander";
            continue;
        }
        if trimmed.eq_ignore_ascii_case("Deck") {
            section = "Deck";
            continue;
        }
        if trimmed.eq_ignore_ascii_case("Sideboard") {
            section = "Sideboard";
            continue;
        }

        let parsed = parse_line(trimmed);
        let Some((qty, name, set_code, coll_num)) = parsed else { continue; };

        if section == "Commander" {
            // Commander line carries qty 1; keep the name (resolve later).
            commander = Some(name.clone());
            raw_cards.push((qty, name, set_code, coll_num));
            continue;
        }

        if section == "Sideboard" {
            raw_sideboard.push((qty, name, set_code, coll_num));
        } else {
            raw_cards.push((qty, name, set_code, coll_num));
        }
    }

    // Resolve cards: set key first, exact-name fallback.
    let mut resolved: Vec<(i64, i64)> = Vec::new();
    for (qty, name, set_code, coll_num) in raw_cards {
        let mut grp: Option<i64> = None;
        if let (Some(sc), Some(cn)) = (&set_code, &coll_num) {
            grp = resolve_by_set_key(pool, sc, cn).await.map_err(|e| e.to_string())?;
        }
        if grp.is_none() {
            grp = resolve_by_name(pool, &name).await.map_err(|e| e.to_string())?;
        }
        match grp {
            Some(id) => resolved.push((id, qty)),
            None => unresolved.push(name),
        }
    }

    // Resolve sideboard the same way.
    let mut resolved_side: Vec<(i64, i64)> = Vec::new();
    for (qty, name, set_code, coll_num) in raw_sideboard {
        let mut grp: Option<i64> = None;
        if let (Some(sc), Some(cn)) = (&set_code, &coll_num) {
            grp = resolve_by_set_key(pool, sc, cn).await.map_err(|e| e.to_string())?;
        }
        if grp.is_none() {
            grp = resolve_by_name(pool, &name).await.map_err(|e| e.to_string())?;
        }
        match grp {
            Some(id) => resolved_side.push((id, qty)),
            None => unresolved.push(name),
        }
    }

    Ok(ParsedDeckList {
        commander,
        cards: resolved,
        sideboard: resolved_side,
        unresolved,
    })
}

/// Serializes resolved cards to [{grp_id, count}] JSON.
pub fn cards_to_json(cards: &[(i64, i64)]) -> String {
    let v: Vec<serde_json::Value> = cards.iter()
        .map(|(id, count)| json!({ "grp_id": id, "count": count }))
        .collect();
    serde_json::to_string(&v).unwrap_or_else(|_| "[]".to_string())
}

/// Serializes an optional commander name to its grp_id (lowest printing).
pub async fn commander_to_grp(pool: &Pool<Sqlite>, name: Option<String>) -> Result<Option<i64>, sqlx::Error> {
    match name {
        None => Ok(None),
        Some(n) => resolve_by_name(pool, &n).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_real_export_resolves() {
        // Uses the production DB path through the same DatabaseManager the app uses.
        let db = crate::db::DatabaseManager::init().await.expect("db init");
        let sample = "Commander\n1 Aang, at the Crossroads (TLA) 203\n\nDeck\n1 Cloudshift (JMP) 97\n5 Forest (UNF) 239\n1 Bloom Tender (SPG) 0\n1 The Mind Stone (MSH) 21\n";
        let parsed = parse_deck_export(db.pool(), sample).await.expect("parse");
        assert_eq!(parsed.commander.as_deref(), Some("Aang, at the Crossroads"));
        assert!(parsed.unresolved.is_empty(), "unresolved: {:?}", parsed.unresolved);
        // Commander (1) + 4 deck cards = 5 entries; all resolved to valid grp_ids.
        assert_eq!(parsed.cards.len(), 5);
        assert!(parsed.cards.iter().all(|(id, _)| *id > 0));
    }

    #[tokio::test]
    async fn test_save_and_read_roundtrip() {
        let db = crate::db::DatabaseManager::init().await.expect("db init");
        let deck = "TEST Deck Roundtrip";
        let sample = "Deck\n1 Cloudshift (JMP) 97\n5 Forest (UNF) 239\n";
        let parsed = parse_deck_export(db.pool(), sample).await.expect("parse");
        let cards_json = cards_to_json(&parsed.cards);
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO deck_lists (deck_name, cards_json, sideboard_json, commander_grp_id, source, created_at, updated_at) VALUES (?, ?, NULL, NULL, 'export', ?, ?)"
        )
        .bind(deck).bind(&cards_json).bind(&now).bind(&now)
        .execute(db.pool()).await.expect("insert");
        let row = sqlx::query("SELECT cards_json FROM deck_lists WHERE deck_name = ?")
            .bind(deck).fetch_one(db.pool()).await.expect("select");
        let stored: String = row.get("cards_json");
        let v: Vec<serde_json::Value> = serde_json::from_str(&stored).expect("json");
        assert_eq!(v.len(), 2);
        sqlx::query("DELETE FROM deck_lists WHERE deck_name = ?").bind(deck)
            .execute(db.pool()).await.expect("cleanup");
        println!("roundtrip ok: {:?}", stored);
    }
}
