/// Deck legitimacy checks for collection building.
///
/// Only matches played with the player's own (non-preset) decks feed the
/// draw-based collection. Preset/preset-equivalent decks — precons, mastery,
/// battle-pass, store decks, course-deck events, color-challenge, tokens —
/// must not contribute ownership signals.
///
/// KNOWN GAP: Arena's preset deck naming is not covered by an exhaustive
/// allowlist; WotC adds new preset types over time. Every match's submitted
/// deck is also recorded in the `match_decks` audit table (retained
/// indefinitely) so a preset type that slips through can be detected and the
/// keyword rules extended. Netdecks (IsNetDeck=true) are the player's own deck
/// once saved and are NOT excluded.
///
/// Returns the reason a deck name is considered a preset, or None if it looks
/// like a legitimate user deck.
pub fn preset_deck_reason(name: &str) -> Option<&'static str> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        // No deck identity at all: we cannot verify legitimacy. Conservatively
        // treated as a preset so we never credit ownership from an unknown deck.
        return Some("no deck identity");
    }

    // Localization-key presets (the reliable, structural marker).
    if trimmed.starts_with("?=?Loc/Decks/Precon/") {
        return Some("Loc/Decks/Precon preset");
    }
    if trimmed.starts_with("?=?Loc/Decks/HOB_") {
        return Some("Loc/Decks/HOB preset");
    }
    if trimmed.starts_with("?=?Loc/Decks/SGF_") {
        return Some("Loc/Decks/SGF preset");
    }
    if trimmed.starts_with("?=?Loc/Decks/StoreDecks/") {
        return Some("Loc/Decks/StoreDecks preset");
    }
    if trimmed.starts_with("?=?Loc/Decks/") {
        return Some("Loc/Decks preset deck");
    }

    // Bare-name preset decks (no Loc/Decks prefix).
    let lower = trimmed.to_lowercase();
    if lower.contains("_mastery") || lower.contains("_battlepass") || lower.contains("_battle_pass") {
        return Some("mastery/battle-pass preset");
    }
    if lower.ends_with("_play") || lower.ends_with("_ladder") {
        return Some("ladder/play preset");
    }
    if lower.contains("dualcolorprecon") {
        return Some("dual-color precon preset");
    }
    if lower.starts_with("cc_anb_") && lower.ends_with("_opp") {
        return Some("color challenge opponent deck");
    }
    if lower.contains("_opp") && lower.starts_with("cc_anb_") {
        return Some("color challenge deck");
    }
    if lower.contains("drafttoken") || lower.contains("sealedtoken") || lower.contains("jumpintoken")
        || lower.contains("quickdrafttoken") || lower.contains("playintoken")
        || lower.contains("cashtoken") || lower.contains("debugtoken")
        || lower.contains("arenadirecttoken") {
        return Some("token/cosmetic entry");
    }
    if lower.starts_with("jump in") || lower.contains("jump in!") || lower.starts_with("event deck") || lower == "preset / event deck" {
        return Some("jump in / event deck preset");
    }

    match trimmed {
        "Home" | "Default" | "Play" | "Ladder" | "Alchemy_Ladder" | "Explorer_Play"
        | "Historic_Play" | "Timeless_Ladder" | "DualColorPrecons" => {
            Some("generic/preset deck name")
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fixtures below are taken verbatim from real MTGA logs (live Player.log
    // and the April 2025 backup) — see "Name":"..." entries in EventSetDeck /
    // DeckSummaries / CourseDeckSummary payloads. Synthetic fixtures are kept
    // only where the real logs had no instance of a documented pattern.

    #[test]
    fn detects_real_precon_prefixes() {
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/2022_WC/Player_DrewB").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/2022_WC/Player_HisamichiY").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/CC_ANB_W").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/Historic_FDN_PlaytestDeckRG").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/Precon_EPP2023_WU").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/Precon_Alchemy_Ladder_A").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/Precon/2023_GB_BLACK").is_some());
    }

    #[test]
    fn detects_real_store_decks() {
        assert!(preset_deck_reason("?=?Loc/Decks/StoreDecks/DFT/Wave1/Champion5CUlalek").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/StoreDecks/DFT/Wave1/ChampionBWPhelia").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/StoreDecks/DSK/Wave1/Brawl_EtaliPrimalConqueror").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/StoreDecks/DSK/Wave2/FoundationTokenControl").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/StoreDecks/DSK/Wave1/Historic_GUMerfolk").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/HOB_W").is_some());
        assert!(preset_deck_reason("?=?Loc/Decks/SGF_1").is_some());
    }

    #[test]
    fn detects_real_mastery_and_battlepass_names() {
        // Bare names observed in the live log's DeckSummaries/EventSetDeck.
        assert!(preset_deck_reason("BLB_Mastery").is_some());
        assert!(preset_deck_reason("DSK_Mastery").is_some());
        assert!(preset_deck_reason("ECL_Mastery").is_some());
        assert!(preset_deck_reason("EOE_Mastery").is_some());
        assert!(preset_deck_reason("FDN_Mastery").is_some());
        assert!(preset_deck_reason("FIN_Mastery").is_some());
        assert!(preset_deck_reason("LCI_Mastery").is_some());
        assert!(preset_deck_reason("MKM_Mastery").is_some());
        assert!(preset_deck_reason("MOM_Mastery").is_some());
        assert!(preset_deck_reason("OTJ_Mastery").is_some());
        assert!(preset_deck_reason("WOE_Mastery").is_some());
        assert!(preset_deck_reason("ELD_BattlePass").is_some());
        assert!(preset_deck_reason("M20_BattlePass").is_some());
    }

    #[test]
    fn detects_real_color_challenge_decks() {
        // Color challenge opponent decks (real in the live log).
        assert!(preset_deck_reason("CC_ANB_B1_Opp").is_some());
        assert!(preset_deck_reason("CC_ANB_G4_Opp").is_some());
        assert!(preset_deck_reason("CC_ANB_R2_Opp").is_some());
        assert!(preset_deck_reason("CC_ANB_U3_Opp").is_some());
        assert!(preset_deck_reason("CC_ANB_W1_Opp").is_some());
    }

    #[test]
    fn detects_remaining_bare_preset_names() {
        // No real-log instance in our samples, but documented preset patterns
        // (kept as synthetic guards so the rules don't silently regress).
        assert!(preset_deck_reason("Alchemy_Ladder").is_some());
        assert!(preset_deck_reason("Explorer_Play").is_some());
        assert!(preset_deck_reason("Timeless_Ladder").is_some());
        assert!(preset_deck_reason("DraftToken").is_some());
        assert!(preset_deck_reason("DualColorPrecons").is_some());
        assert!(preset_deck_reason("Home").is_some());
        assert!(preset_deck_reason("Default").is_some());
    }

    #[test]
    fn allows_real_user_decks() {
        // Real user decks from the live log (including via CourseDeckSummary,
        // which is the DeckSelect course path — a real deck there is legitimate).
        assert!(preset_deck_reason("Dying Lands").is_none());
        assert!(preset_deck_reason("Elvenking").is_none());
        assert!(preset_deck_reason("Anvil Mid Range").is_none());
        assert!(preset_deck_reason("Amalia Explorer Combo").is_none());
        assert!(preset_deck_reason("BRAWL - Slugs").is_none());
        assert!(preset_deck_reason("Goblins Everywhere!").is_none());
        assert!(preset_deck_reason("MonoWhite - Auras (Standard)").is_none());
        assert!(preset_deck_reason("MonoRed Pauper (Historic)").is_none());
        assert!(preset_deck_reason("Artifact Affinity Burn").is_none());
        // Fancy/emoji and punctuation-heavy user deck names must be allowed.
        assert!(preset_deck_reason("Fe Fi Fo FUM!").is_none());
        assert!(preset_deck_reason("...in a CAVE!").is_none());
        assert!(preset_deck_reason("I'm putting together a team...").is_none());
        assert!(preset_deck_reason("Krang's Body Shop").is_none());
    }
}
