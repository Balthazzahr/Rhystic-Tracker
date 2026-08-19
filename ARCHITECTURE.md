# Rhystic Tracker — Architecture Reference

**Version:** 1.0.1  
**Target Platform:** Linux (X11 & Wayland via XWayland) / Steam Deck / Omarchy  
**Core Framework:** Tauri v2, Rust (2021 Edition), React 18, TypeScript, SQLite  

---

## 1. System Overview

Rhystic Tracker is a local-first, non-intrusive companion and match analytics desktop application for *Magic: The Gathering Arena*. It operates strictly out-of-process without memory injection, DLL hooking, or network interception.

The system continuously tails and parses MTGA's client log (`Player.log`), builds unified game state representations in memory, and persists granular match, combat, deck, and collection events into a local embedded SQLite database.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             MTG Arena Client                                │
│        Writes events, turns, zones, damage & deck submissions to            │
│                               Player.log                                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Real-time file appending
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Rhystic Tracker Backend (Rust / Tokio)                   │
│                                                                             │
│   ┌───────────────┐     ┌────────────────┐     ┌────────────────────────┐   │
│   │  FileTailer   │ ──▶ │  Parser Regex  │ ──▶ │    MatchAssembler      │   │
│   │ (notify + poll)     │  & JSON Engine │     │  (Combat & Game State) │   │
│   └───────────────┘     └────────────────┘     └───────────┬────────────┘   │
│                                                            │                │
│                                                            ▼                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                DatabaseManager (SQLite / sqlx)                      │   │
│   │      `~/.config/rhystic-tracker/rhystic.db` (Production Isolation)  │   │
│   └────────────────────────────────┬────────────────────────────────────┘   │
│                                    │ IPC Commands & Tray Events             │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ Tauri IPC (Custom Protocol)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Rhystic Tracker Frontend (React 18 / TS)                  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Tauri Webview Window                         │   │
│   │   • DashboardView (Records, Streaks, Daily Breakdowns, Spotlights)  │   │
│   │   • Live Match HUD (Real-Time Life Swings, Combat Attributions)     │   │
│   │   • MatchHistory & Inspector (Turn Playback Timeline)               │   │
│   │   • DeckLibrary & TrueDeckListView (Verification, Import/Export)    │   │
│   │   • CollectionView (Virtual Grid/Table, Diamond Ownership Controls) │   │
│   │   • Card Detail Modal (450px Card Art, Oracle Text, Combat Stats)   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack & Key Dependencies

### Backend (Rust / Tauri v2)
- **Tauri v2 (`tauri`, `tauri-build`, `tauri-plugin-dialog`, `tauri-plugin-fs`)**: Native OS windowing, tray lifecycle, custom asset protocol, dialogs, and IPC message routing.
- **Tokio (`tokio`)**: Asynchronous multi-threaded runtime managing the log supervisor, background workers, and interval timers.
- **SQLx (`sqlx` with `sqlite`, `runtime-tokio-native-tls`, `chrono`)**: Async SQLite connection pooling, schema migrations, and high-performance parameterized queries.
- **Notify (`notify`)**: Cross-platform filesystem event watcher for instantaneous `Player.log` append notifications.
- **Chrono & Serde (`chrono`, `serde`, `serde_json`)**: Timestamps, ISO-8601 formatting, and type-safe JSON serialization/deserialization.
- **Dirs (`dirs`)**: Standard XDG Base Directory path resolution (`~/.config`, `~/.local/share`).

### Frontend (React / TypeScript / Vite)
- **React 18 & React DOM (`react`, `react-dom`)**: Component tree, hooks, and virtual DOM rendering.
- **TypeScript (`typescript`)**: End-to-end type safety for IPC responses, state shapes, and Scryfall payloads.
- **Vite (`vite`)**: Modern ES module bundler and frontend development server.
- **Tailwind CSS (`tailwindcss`, `postcss`, `autoprefixer`, `tailwind-merge`, `clsx`)**: Utility-first responsive styling with dynamic mana themes.
- **TanStack Virtual (`@tanstack/react-virtual`)**: High-performance window virtualization for the 10,000+ card collection grid and table views.
- **Lucide Icons (`lucide-react`) & Mana Font (`mana-font`)**: Vector iconography for UI navigation and authentic MTG mana symbols.
- **Recharts (`recharts`)**: Data visualization for win rate trends, mana curves, and turn-cast histograms.

---

## 3. Directory & Module Structure

```
.
├── src/                               # Frontend React application
│   ├── assets/                        # Static SVGs, logos, and fonts
│   ├── components/                    # Modular UI views & widgets
│   │   ├── CardBreakdown.tsx          # Card type and mana distribution breakdown
│   │   ├── CardImage.tsx              # Scryfall / local cached card image loader
│   │   ├── CardNameTooltip.tsx        # Inline card name preview tooltip
│   │   ├── CollectionView.tsx         # Virtualized collection grid, table, and filters
│   │   ├── CustomDropdown.tsx         # Reusable styled UI select components
│   │   ├── DashboardView.tsx          # Main metrics dashboard, trends, and match history
│   │   ├── DeckCardList.tsx           # Formatted deck card lists categorized by type
│   │   ├── DeckDetailView.tsx         # Deck inspection, win rates, and card performance
│   │   ├── FullMatchInfoModal.tsx     # Deep-dive match inspector and combat replay
│   │   ├── HoverArtPreview.tsx        # Floating card art preview on hover
│   │   ├── LogoQuill.tsx              # Rhystic Tracker brand logo component
│   │   ├── ManaFontPip.tsx            # Mana font glyph renderer
│   │   ├── ManaPip.tsx                # Comprehensive SVG mana pip parser & renderer
│   │   ├── MatchTimeline.tsx          # Turn-by-turn combat and game event timeline
│   │   ├── OpponentH2HModal.tsx       # Head-to-head opponent match history and analytics
│   │   ├── SettingsView.tsx           # Path configuration, tray settings, and set metadata
│   │   └── TrueDeckListView.tsx       # MTGA text format decklist importer/exporter
│   ├── utils/                         # Frontend helper functions and formatters
│   ├── App.tsx                        # Master layout, navigation tabs, modal manager, IPC bridge
│   ├── index.css                      # Global Tailwind directives and custom scrollbar rules
│   └── main.tsx                       # React application bootstrap entry
│
├── src-tauri/                         # Rust backend application
│   ├── src/
│   │   ├── bin/                       # Standalone binaries and test benches
│   │   │   ├── bench_card_sync.rs     # Performance benchmark for card database caching
│   │   │   ├── live_tailer.rs         # Standalone CLI live log tailer utility
│   │   │   └── offline_test.rs        # Offline match log replay and validation harness
│   │   ├── card_db.rs                 # MTGA Raw Card Database locator and caching
│   │   ├── db.rs                      # SQLite pool manager, schema migrations, and SQL queries
│   │   ├── deck_legitimacy.rs         # Preset deck detection and format legitimacy validation
│   │   ├── deck_list.rs               # True decklist text parsing, normalization, and export
│   │   ├── lib.rs                     # Library declarations and shared exports
│   │   ├── match_assembler.rs         # State machine compiling raw events into match records
│   │   ├── parser.rs                  # Regex and JSON extractors for MTGA log structures
│   │   ├── settings.rs                # Persistent JSON configuration manager (`settings.json`)
│   │   ├── tailer.rs                  # Real-time log tailer, rotation handler, and path discovery
│   │   ├── theme.rs                   # Color-identity mana theme definitions and token maps
│   │   └── main.rs                    # Tauri commands, background tasks, tray icon, app setup
│   ├── Cargo.toml                     # Rust package manifest and crate dependencies
│   ├── tauri.conf.json                # Tauri v2 runtime, windowing, bundle, and protocol config
│   └── build.rs                       # Tauri build script
│
├── CHANGELOG.md                       # Release change history
├── USER_GUIDE.md                      # Comprehensive user setup and operation manual
├── README.md                          # Repository landing page and quickstart guide
├── install.sh                         # Desktop installer (binary, desktop file, icon deployment)
├── launch.sh                          # Production environment runner (sets GDK/WebKit variables)
└── package.json                       # NPM dependencies and build scripts
```

---

## 4. Data Flow & Core Subsystems

```
┌─────────────────┐
│ MTGA Player.log │
└────────┬────────┘
         │ (1) File append notification (Notify / Polling)
         ▼
┌─────────────────┐
│   FileTailer    │ Reads new bytes, buffers lines, tracks file inode / truncation
└────────┬────────┘
         │ (2) mpsc::channel<TailerEvent::Line>
         ▼
┌─────────────────┐
│     Parser      │ Identifies event types:
│                 │ • MatchCreated / MatchCompleted / GameStateMessage
│                 │ • Event.GetDeck / EventSetDeckV2
│                 │ • Mulligan / Life / Damage / Turn / Zone Transfers
└────────┬────────┘
         │ (3) ParsedEvent stream
         ▼
┌─────────────────┐
│ MatchAssembler  │ In-Memory State Machine:
│                 │ • Tracks hero vs opponent seat IDs
│                 │ • Aggregates turn events and combat damage attributions
│                 │ • Validates deck legitimacy against preset starter rules
└────────┬────────┘
         │ (4) MatchRecord / MatchTurnEventRecord / MatchImpactfulRecord
         ▼
┌─────────────────┐
│ DatabaseManager │ SQLite Transactions:
│                 │ • Upserts `matches`, `match_cards`, `match_turn_events`
│                 │ • Updates `match_impactful_cards`
│                 │ • Monotonically updates `collection_cards` (owned 1..4)
└────────┬────────┘
         │ (5) Tauri IPC Commands & Live State Polling
         ▼
┌─────────────────┐
│ Frontend (React)│ Renders UI views, virtualization grids, charts, and modal inspectors
└─────────────────┘
```

### 1. Log Supervision & Auto-Discovery (`tailer.rs`)
- Continuously resolves the active `Player.log` path using a multi-tier fallback:
  1. User manual override stored in `settings.json` (`mtga_log_path`).
  2. Environment variable `RHYSTIC_MTGA_LOG`.
  3. Auto-discovery scanning known Steam Proton paths (`~/.local/share/Steam`, `~/.steam/steam`, `/mnt/*/SteamLibrary`), Lutris, Bottles, and native Wine prefixes.
- Supervises file rotation, truncated logs, and client restarts using file length checks and inotify event polling.

### 2. Event Parsing & State Reconstruction (`parser.rs`, `match_assembler.rs`)
- Extracts JSON payloads from GRE (Game Rules Engine) messages, including `GameStateMessage`, `IntermissionReq`, and `ClientToGREMessage`.
- Accurately identifies hero seat assignment (`hero_seat_id`) by correlating player screen names, IDs, and submitted deck IDs.
- Tracks spell casting, combat damage to face/permanents, and card zone transfers.

### 3. Collection & Decklist Provenance (`db.rs`, `deck_legitimacy.rs`, `deck_list.rs`)
- Implements strict **Theft & Copy Protection**: Cards seen during a match (tokens, copies, conjured spells, heist/thieved cards) do not inflate collection ownership.
- Collection ownership is updated via:
  - **True Decklist Import**: Ingests genuine decklists exported from MTGA, updating exact counts (1–4) with provenance `decklist`.
  - **In-Game Draws**: Real draws from hero library raise owned count to at least 1 with provenance `draw`.
  - **Manual Correction**: Direct interactive updates via the 4-Diamond selector in the card detail modal.

### 4. Card Asset Protocol & Caching (`card_db.rs`, `CardImage.tsx`, `tauri.conf.json`)
- Card artwork is fetched from Scryfall's high-resolution CDN on demand.
- Images are cached locally in `$APPCONFIG/cardimg/` and served directly to the webview using Tauri's custom asset protocol (`asset://` or `http://asset.localhost/`).
- Prevents redundant network downloads and provides smooth offline browsing.

---

## 5. Critical Design Patterns & Security Model

1. **Database Isolation & Dual-Environment Snapshotting**:
   - Production instances use `~/.config/rhystic-tracker/rhystic.db` (enforced via `RHYSTIC_ENV=production`).
   - Development & Test builds use `rhystic_dev.db` (`RHYSTIC_ENV=development`). The `launch-test.sh` script automatically creates a fresh clone of `rhystic.db` -> `rhystic_dev.db` before launch, enabling full testing against realistic data without touching or modifying the live production database.
   - Unit tests use isolated in-memory or temporary test databases and are programmatically prevented from touching real config directories.

2. **Single-Instance Enforcement**:
   - Backed by `tauri-plugin-single-instance`.
   - Secondary application launches are intercepted before initializing backend watchers or UI windows. The existing instance is brought to the active workspace, focused, and unminimized from the system tray while the duplicate process exits immediately.

3. **Strictly Idempotent Match Upserts**:
   - `DatabaseManager::upsert_match` atomically purges previous match child records (`match_cards`, `match_turn_events`, `match_impactful_cards`) inside its SQLite transaction prior to insertion, preventing event duplication across log replays or re-processing.

4. **Self-Contained Release Embedding**:
   - The frontend assets (`dist/`) are embedded directly into the Rust release binary via Tauri's compilation layer (`npm run build:app`).
   - Eliminates runtime dependency on external local dev servers (e.g. port 5173).

5. **Privacy by Design**:
   - All data is stored 100% locally in SQLite.
   - Zero telemetry, cloud sync, or external authentication required.
