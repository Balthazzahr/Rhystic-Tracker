use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestTemplate {
    pub title: String,
    pub description_template: String,
    pub category: String,
    pub colors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResolvedQuest {
    pub loc_key: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub colors: Vec<String>,
    pub goal: u32,
}

static QUEST_DICTIONARY: OnceLock<HashMap<String, QuestTemplate>> = OnceLock::new();

fn get_dictionary() -> &'static HashMap<String, QuestTemplate> {
    QUEST_DICTIONARY.get_or_init(|| {
        let json_str = include_str!("quest_loc.json");
        serde_json::from_str(json_str).unwrap_or_default()
    })
}

fn format_quest_title(template_desc: &str, goal: u32) -> String {
    let raw = template_desc.replace("{quantity}", &goal.to_string());
    let trimmed = raw.trim_end_matches('.');

    let mut words = Vec::new();
    for (i, word) in trimmed.split_whitespace().enumerate() {
        let lower = word.to_lowercase();
        if (lower == "or" || lower == "and" || lower == "with" || lower == "of" || lower == "your" || lower == "a") && i > 0 {
            words.push(lower);
            continue;
        }

        // Handle hyphenated words like "white-green" -> "White-Green"
        let parts: Vec<String> = word.split('-').map(|sub| {
            let mut c = sub.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        }).collect();

        words.push(parts.join("-"));
    }
    words.join(" ")
}

/// Resolves an MTGA quest `loc_key` (e.g. `"Quests/Quest_Nissas_Journey"`) and `goal` (e.g. `25`)
/// into full human-readable metadata, substituting `{quantity}` in the objective text.
pub fn resolve_quest(loc_key: &str, goal: u32) -> ResolvedQuest {
    let dict = get_dictionary();
    let clean_key = loc_key.trim();

    if let Some(template) = dict.get(clean_key) {
        let desc = template
            .description_template
            .replace("{quantity}", &goal.to_string());
        let title = format_quest_title(&template.description_template, goal);
        return ResolvedQuest {
            loc_key: clean_key.to_string(),
            title,
            description: desc,
            category: template.category.clone(),
            colors: template.colors.clone(),
            goal,
        };
    }

    // Forward-compatibility fallback for unknown / future quest keys
    let clean_title = if let Some(stripped) = clean_key.strip_prefix("Quests/Quest_") {
        stripped.replace('_', " ")
    } else if let Some(stripped) = clean_key.strip_prefix("Quests/") {
        stripped.replace('_', " ")
    } else {
        clean_key.replace('_', " ")
    };

    let lower_title = clean_title.to_lowercase();
    let category = if lower_title.contains("land") {
        "lands".to_string()
    } else if lower_title.contains("creature") {
        "creatures".to_string()
    } else if lower_title.contains("attack") {
        "attacks".to_string()
    } else if lower_title.contains("kill") {
        "kills".to_string()
    } else if lower_title.contains("win") {
        "wins".to_string()
    } else {
        "spells".to_string()
    };

    let title = format!("{} ({})", clean_title, goal);
    let description = format!("Complete {} ({} required).", clean_title, goal);

    ResolvedQuest {
        loc_key: clean_key.to_string(),
        title,
        description,
        category,
        colors: vec![],
        goal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_nissas_journey() {
        let q = resolve_quest("Quests/Quest_Nissas_Journey", 25);
        assert_eq!(q.title, "Play 25 Lands");
        assert_eq!(q.description, "Play 25 lands.");
        assert_eq!(q.category, "lands");
        assert!(q.colors.is_empty());
        assert_eq!(q.goal, 25);
    }

    #[test]
    fn test_resolve_azorius_justiciar() {
        let q = resolve_quest("Quests/Quest_Azorius_Justiciar", 40);
        assert_eq!(q.title, "Cast 40 White or Blue Spells");
        assert_eq!(q.description, "Cast 40 white or blue spells.");
        assert_eq!(q.category, "spells");
        assert_eq!(q.colors, vec!["W", "U"]);
        assert_eq!(q.goal, 40);
    }

    #[test]
    fn test_resolve_fatal_push() {
        let q = resolve_quest("Quests/Quest_Fatal_Push", 15);
        assert_eq!(q.title, "Kill 15 of your Opponent's Creatures");
        assert_eq!(q.description, "Kill 15 of your opponent's creatures.");
        assert_eq!(q.category, "kills");
        assert_eq!(q.goal, 15);
    }

    #[test]
    fn test_resolve_selesnya_reverence() {
        let q = resolve_quest("Quests/Quest_Selesnya_Reverence", 2);
        assert_eq!(q.title, "Win 2 Games with a White-Green Deck");
        assert_eq!(q.description, "Win 2 games with a white-green deck.");
        assert_eq!(q.category, "wins");
        assert_eq!(q.colors, vec!["W", "G"]);
    }

    #[test]
    fn test_resolve_unknown_fallback() {
        let q = resolve_quest("Quests/Quest_Future_Lands_Challenge", 30);
        assert_eq!(q.title, "Future Lands Challenge (30)");
        assert_eq!(q.description, "Complete Future Lands Challenge (30 required).");
        assert_eq!(q.category, "lands");
        assert_eq!(q.goal, 30);
    }
}
