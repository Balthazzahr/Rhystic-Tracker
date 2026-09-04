use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::OnceLock;

static PRECON_NAMES: OnceLock<HashMap<String, String>> = OnceLock::new();
static PRECON_VALUES: OnceLock<HashSet<String>> = OnceLock::new();

fn get_precon_dict() -> &'static HashMap<String, String> {
    PRECON_NAMES.get_or_init(|| {
        let json_data = include_str!("precon_deck_names.json");
        serde_json::from_str(json_data).unwrap_or_default()
    })
}

pub fn is_precon_name(name: &str) -> bool {
    let values = PRECON_VALUES.get_or_init(|| {
        get_precon_dict().values().map(|s| s.to_lowercase()).collect()
    });
    values.contains(&name.trim().to_lowercase())
}

/// Locates the MTGA ClientLocalization SQLite file in the same directory as Raw_CardDatabase.
pub fn find_client_loc_db() -> Option<PathBuf> {
    let raw_db = crate::card_db::find_latest_raw_card_db()?;
    let raw_dir = raw_db.parent()?;

    if let Ok(entries) = std::fs::read_dir(raw_dir) {
        let mut candidates: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                let name = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
                name.starts_with("Raw_ClientLocalization_") && name.ends_with(".mtga")
            })
            .collect();
        candidates.sort_by(|a, b| b.cmp(a));
        if let Some(first) = candidates.into_iter().next() {
            return Some(first);
        }
    }
    None
}

/// Resolves any deck name, translating ?=?Loc/ keys or returning the clean human name.
pub fn resolve_deck_name(raw_name: &str) -> String {
    let trimmed = raw_name.trim();
    if trimmed.is_empty() {
        return raw_name.to_string();
    }

    // Strip ?=?Loc/ or ?=? prefix
    let key = if let Some(stripped) = trimmed.strip_prefix("?=?Loc/") {
        stripped
    } else if let Some(stripped) = trimmed.strip_prefix("?=?") {
        stripped
    } else {
        trimmed
    };

    let dict = get_precon_dict();

    // 1. Direct key match (e.g. "Decks/Precon/Standard_FDN_WB")
    if let Some(name) = dict.get(key) {
        return name.clone();
    }

    // 2. Try prefix variations
    if !key.starts_with("Decks/") {
        let with_decks = format!("Decks/{}", key);
        if let Some(name) = dict.get(&with_decks) {
            return name.clone();
        }
        let with_precon = format!("Decks/Precon/{}", key);
        if let Some(name) = dict.get(&with_precon) {
            return name.clone();
        }
    }

    // 3. Check stripped ending segment against dict keys
    if let Some(last_seg) = key.split('/').last() {
        let candidate = format!("Decks/Precon/{}", last_seg);
        if let Some(name) = dict.get(&candidate) {
            return name.clone();
        }
    }

    // 4. Fallback: if it was a ?=?Loc/ key not found in dict, format nicely rather than showing ?=?
    if trimmed.starts_with("?=?") {
        let slug = key.split('/').last().unwrap_or(key);
        return slug.replace('_', " ").trim().to_string();
    }

    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_starter_deck_names() {
        assert_eq!(resolve_deck_name("?=?Loc/Decks/Precon/Standard_FDN_WB"), "Vampiric Hunger");
        assert_eq!(resolve_deck_name("?=?Loc/Decks/Precon/Precon_EPP2023_WB"), "Balancing Act");
        assert_eq!(resolve_deck_name("?=?Loc/Decks/Precon/Alchemy_BLB_Frog"), "Hop, Hop, and Away!");
        assert_eq!(resolve_deck_name("?=?Loc/Decks/Precon/2022_WC/Player_DrewB"), "Drew Baker");
    }

    #[test]
    fn test_is_precon_name() {
        assert!(is_precon_name("Vampiric Hunger"));
        assert!(is_precon_name("Balancing Act"));
        assert!(!is_precon_name("Identity Crisis"));
    }

    #[test]
    fn test_user_decks_unmodified() {
        assert_eq!(resolve_deck_name("Identity Crisis"), "Identity Crisis");
        assert_eq!(resolve_deck_name("BRAWL - Slugs"), "BRAWL - Slugs");
    }

    #[test]
    fn test_fallback_slug_cleanup() {
        assert_eq!(resolve_deck_name("?=?Loc/Decks/Precon/Unknown_New_Precon"), "Unknown New Precon");
    }
}
