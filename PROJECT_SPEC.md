# Rhystic Tracker — Project Specification

**Application Name:** Rhystic Tracker  
**Identifier:** `com.rhystic.tracker`  
**License:** MIT  
**Current Version:** 1.1.1  
**Category:** Game Companion & Combat Analytics  

---

## 1. Product Purpose & Target Audience

**Rhystic Tracker** is an open-source, local-first companion and combat analytics engine built specifically for *Magic: The Gathering Arena* players on Linux systems (including native Arch/Omarchy installations, Pop!_OS, Ubuntu, Fedora, and Steam Deck).

### Primary Problem Statement
Existing MTGA trackers are often Windows-only, depend on cloud logins, run resource-heavy Electron bundles, or fail to accurately classify combat damage splits, game state events, and deck legitimacy under Linux/Proton environments.

### Core Objectives
1. **Zero-Latency Local Operation**: Instant database queries with all data stored privately on the local machine in SQLite.
2. **Comprehensive Combat Analytics**: Granular combat damage tracking (face vs permanent splits, combat vs spell damage, turn histograms).
3. **Pristine Collection Integrity**: Accurate collection counting derived from True Decklists and real draws, strictly filtering out temporary tokens, copies, and stolen cards.
4. **Native Desktop Integration**: Optimized GTK/WebKit windowing with system tray support, Wayland compatibility, and dynamic mana themes.

---

## 2. Core User Workflows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Auto-Tracking Workflow                                                   │
│    Launch MTGA ──▶ Rhystic Tracker detects Player.log ──▶ Background parse  │
│    ──▶ Tray icon indicates live match ──▶ Real-time HUD updates live state  │
│    ──▶ Match concludes ──▶ Full combat timeline and metrics committed to DB │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Deck & Collection Workflow                                               │
│    Export decklist from MTGA ──▶ Import into Rhystic Tracker Deck Library   │
│    ──▶ Cards registered into Collection ──▶ Card Library reflects ownership │
│    ──▶ Click card to inspect combat stats, 450px art, and adjust diamonds   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Match Inspection & Analytics Workflow                                    │
│    Dashboard / Match History ──▶ Select match ──▶ Open Match Inspector     │
│    ──▶ View play-by-play timeline, damage attributions, and deck breakdown │
│    ──▶ Click Opponent H2H to view lifetime records vs that specific player  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema & Data Models

Rhystic Tracker uses SQLite with 8 primary relational tables:

```
┌─────────────────┐       ┌─────────────────┐       ┌────────────────────────┐
│     matches     │ 1───* │   match_cards   │       │      cards_cache       │
├─────────────────┤       ├─────────────────┤       ├────────────────────────┤
│ id (PK)         │       │ id (PK, Auto)   │       │ grp_id (PK)            │
│ timestamp       │       │ match_id (FK)   │       │ name                   │
│ date_str        │       │ grp_id          │       │ mana_cost              │
│ format          │       │ is_opponent     │       │ cmc                    │
│ result          │       │ count           │       │ colors / color_identity│
│ duration_seconds│       └─────────────────┘       │ set_code / rarity      │
│ turns           │                                 │ card_type              │
│ going_first     │       ┌──────────────────┐      └────────────────────────┘
│ hero_deck_name  │ 1───* │match_turn_events │
│ opponent_name   │       ├──────────────────┤      ┌────────────────────────┐
│ opponent_life   │       │ id (PK, Auto)    │      │    collection_cards    │
│ raw_payload     │       │ match_id (FK)    │      ├────────────────────────┤
└────────┬────────┘       │ turn_number      │      │ grp_id (PK)            │
         │                │ seat_id          │      │ owned_count (0..4)     │
         │                │ event_type       │      │ provenance             │
         │                │ grp_id           │      │ draw_seen              │
         │                └──────────────────┘      └────────────────────────┘
         │
         │                ┌───────────────────────┐ ┌────────────────────────┐
         └──────────────* │ match_impactful_cards │ │       deck_lists       │
                          ├───────────────────────┤ ├────────────────────────┤
                          │ id (PK, Auto)         │ │ deck_name (PK)         │
                          │ match_id (FK)         │ │ cards_json             │
                          │ grp_id / seat_id      │ │ sideboard_json         │
                          │ total_damage          │ │ commander_grp_id       │
                          │ damage_to_player      │ └────────────────────────┘
                          │ damage_to_permanents  │
                          │ damage_combat / spell │
                          └───────────────────────┘
```

### Table Specifications

1. **`matches`**: Core match metadata (timestamps, formats, winner, turn count, hero/opponent commanders, end life totals).
2. **`match_cards`**: All cards observed in a given match partitioned by hero vs opponent.
3. **`match_turn_events`**: Chronological log of plays, draws, casts, and board events mapped to match turns.
4. **`match_impactful_cards`**: Aggregated combat damage records per card per match (face vs permanent splits).
5. **`cards_cache`**: Scryfall & MTGA raw database cache mapping `grp_id` to names, mana costs, types, and sets.
6. **`collection_cards`**: Player card inventory tracking `owned_count` (monotonic non-decreasing, capped at 4), first seen timestamps, and provenance (`decklist`, `draw`, or `manual`).
7. **`deck_lists`**: Stored user decklists containing mainboard and sideboard JSON payloads.
8. **`sets_metadata`**: Set codes, official set names, release dates, and SVG set icons fetched from Scryfall.

---

## 4. Tauri IPC Command Interface

| Command | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `get_active_theme` | `theme_id: String` | `ManaTheme` | Retrieves color palette and styling variables for the active mana theme |
| `get_matches_count` | *None* | `Result<i64, String>` | Total number of recorded matches in database |
| `get_recent_matches` | `limit: Option<i64>` | `Result<Vec<Value>, String>` | Fetches recent matches with joined card counts, mana curves, and color identities |
| `get_deck_stats` | *None* | `Result<Vec<Value>, String>` | Summary analytics per deck (win rate, total games, color badges) |
| `get_deck_detail` | `deck_name: String` | `Result<Value, String>` | Detailed breakdown, mana curve, and match history for a specific deck |
| `get_deck_cards` | `deck_name: String` | `Result<Vec<Value>, String>` | List of unique cards registered to a deck with performance metrics |
| `save_deck_list` | `deck_name: String, list_text: String` | `Result<(), String>` | Parses and saves an imported MTGA decklist |
| `export_decklist` | `deck_name: String` | `Result<String, String>` | Generates a standard MTGA-formatted text export of a stored deck |
| `delete_deck` | `deck_name: String, delete_matches: bool` | `Result<(), String>` | Deletes a decklist and optionally purges its associated matches |
| `get_collection` | `filters: Value` | `Result<Value, String>` | Queries virtualized collection cards with type, color, set, and ownership filters |
| `update_collection_card_count` | `grp_id: i64, owned_count: i64` | `Result<(), String>` | Manually updates card ownership count (0–4) with instant persistence |
| `get_card_info` | `grp_id: i64` | `Result<Value, String>` | Fetches full card metadata, Scryfall oracle text, printings, and lifetime combat stats |
| `get_card_printings` | `card_name: String` | `Result<Vec<Value>, String>` | Lists all alternate set printings and illustrations available for a card |
| `get_live_match_state` | *None* | `Result<Value, String>` | Polls current in-memory live match state (life totals, active turn, recent events) |
| `get_log_path` / `set_log_path`| `path: String` | `Result<String, String>` | Gets or overrides the active MTGA `Player.log` monitoring path |
| `get_minimize_to_tray` / `set_minimize_to_tray` | `enabled: bool` | `Result<bool, String>` | Toggles whether closing the window hides it to the system tray |

---

## 5. Coding Conventions & Standards

### Rust Backend
- **Edition:** Rust 2021.
- **Error Handling:** Use `Result<T, E>` with explicit mapping to user-friendly strings for IPC boundaries (`map_err(|e| e.to_string())`).
- **Concurrency:** Tokio asynchronous tasks for I/O; `tokio::sync::watch` for state broadcasts.
- **Portability:** Never hardcode `/home/...` or `/mnt/...` paths in source code. Use `dirs::config_dir()`, `dirs::data_dir()`, or environment variables.

### TypeScript / React Frontend
- **Strict Typing:** Avoid `any` where possible. Declare interfaces for all IPC payloads.
- **Virtualization:** Always use `@tanstack/react-virtual` for data lists exceeding 100 items (e.g. Collection Grid and Table).
- **Styling:** Use Tailwind CSS utility classes; leverage dynamic theme variables (`theme.primary`, `theme.accent`, `theme.bg`).

### Testing & Verification
- **Backend Tests:** Run `cargo test` inside `src-tauri`. All 69 unit and integration tests must pass.
- **Release Compilation:** Always build release packages using `npm run build:app` (`npm run build && npx @tauri-apps/cli build --no-bundle`) to embed frontend assets into the binary.
