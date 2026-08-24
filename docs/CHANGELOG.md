# Changelog

All notable changes to Rhystic Tracker are documented here.

## [1.2.0] - 2026-08-23

### 🏆 Major Milestone: Global Card Achievements, Trophy Case & Leaderboards Hall of Fame

This major milestone introduces the full **Global Achievements & Trophy Case** and **All-Time Leaderboards** suite, alongside native **macOS platform support**, **mulligan tracking with timeline playback**, and **multi-platform GitHub Actions release automation**.

---

### 🌟 Added

- **Card Achievements & Trophy Case (`Achievements` View)**:
  - **21 Custom Achievement Emblems**: Unique vector emblems across 7 distinct MTG categories (*Combat*, *Counters*, *Closer*, *Ramp*, *Tokens*, *Defense*, *Card Draw*).
  - **Dynamic Multi-Tier System**: Bronze, Silver, and Gold tiers with objective, value-based threshold descriptions (e.g. `12+`, `18+`, `25+`).
  - **Highest-Tier Trophy Priority**: Trophy cards display the highest unlocked tier (`Gold > Silver > Bronze`) with a total award multiplier badge.
  - **Center-Out Symmetrical Clustering**: Square cards (`330px × 330px`) that cluster symmetrically from the middle of the screen (1 card centered, 2 side-by-side, 3 in a 2+1 pyramid, 4 in a 2×2 box) and fill widescreen viewports without constraints.
  - **Card MVP Showcase**: Each trophy card showcases the all-time MVP card with its **Scryfall art crop thumbnail** and full untruncated card name.
  - **Interactive Drill-Down Modal**: Clicking any trophy opens an interactive roster showing all winning cards with individual multiplier counters and click-to-preview integration.
  - **Enlarged Lore Quotes & Award Criteria**: Modal displays the precise objective criteria and immersive italic MTG lore quotes without distracting dividers or dark background boxes.
  - **Universal Keyboard Dismissal**: Full <kbd>Escape</kbd> key listener to dismiss the modal instantly.
  - **Deck Achievements Tab (Roadmap Feature)**: Dedicated switcher tab with active roadmap status for upcoming deck milestones and win-streak awards.

- **All-Time Leaderboards & Hall of Fame (`Leaderboards` View)**:
  - **6 Hall of Fame Categories**:
    1. 🥊 **Highest Single-Hit Strike** (*Haymakers* — Most damage dealt in a single blow).
    2. 🚂 **Total Match Damage** (*Juggernauts* — Cumulative match combat and spell damage).
    3. 🌟 **Impactful Match MVPs** (*Key Game-Changers* — Most matches earning impactful status).
    4. 🛡️ **Combat Heavyweights** (*Pure Attack Power* — Total damage dealt in combat phases).
    5. 🔮 **Spell & Ability Nukes** (*Arcane Devastation* — Non-combat spell & trigger damage).
    6. 👑 **Most Decorated Champions** (*Honor Titans* — Most lifetime achievement titles won).
  - **Podium Styling & Crowns**: 🥇 Gold Crown (#1), 🥈 Silver Medal (#2), and 🥉 Bronze Medal (#3) podium styling.
  - **Full-Spectrum Global Search**: Search any card in your match history across all 6 categories to reveal its global rank (e.g. `#75`).
  - **Pinned Top 3 Benchmark**: Pinned Top 3 cards remain in view during search to provide an immediate podium reference.
  - **Diff-to-Podium Indicator**: Displays the exact point differential between any searched card and the #3 podium threshold (e.g. `-18 to #3`).
  - **Full-Height Vertical Scaling**: Dynamic vertical stretching across all 6 boxes so 10 cards fill the window without bottom gaps.

- **Dedicated Sidebar Navigation & Navigation Router**:
  - Dedicated **Achievements** (🏆 `Trophy`) and **Leaderboards** (🏛️ `Podium`) sidebar items with matching typography and hover styling.
  - Added startup tab configuration in Settings for direct launch into Achievements or Leaderboards.

- **macOS Platform Support & Universal Builds**:
  - Native macOS log discovery (`~/Library/Logs/Wizards Of The Coast/MTGA/Player.log`) and raw card database discovery.
  - Multi-platform GitHub Actions CI/CD release workflow compiling native Linux `x86_64` `.tar.gz` and macOS `.dmg` / `.app` bundles with automated SHA256 checksums.

- **Mulligan Tracking & Timeline Replay**:
  - Native GRE pre-game and prompt parsing (Prompt 36 for Mulligan, Prompt 37 for Kept hand).
  - Opening hand state machine buffering Turn 0 instances to eliminate false Turn 1 draw spikes.
  - Dedicated **"Opening Phase & Mulligans"** section in the Match Play Timeline displaying color-coded action badges (`MULLIGAN`, `BOTTOM`, `KEPT`), mana pips, and card type icons.

---

### ⚡ Fixed & Polished

- **Strict Test Environment Isolation**: Dual-environment development pipeline (`./launch-test.sh` / `rhystic_dev.db`) protecting production databases during testing and feature development.
- **Fight & Mutual Bite Damage Reclassification**: Corrected GRE damage routing so creature fight damage (`damage_type == 3`, e.g. Bushwhack, Tail Swipe, Kogla) is classified as creature attack power (`damage_combat`) rather than non-combat spell damage (`damage_spell`).
- **Dynamic Single-Match Achievement Tiering**: Engineered full backend game-state and magnitude tier calculations (`Gold`, `Silver`, `Bronze`) for *Scoop Inducer*, *Executioner*, *Over-Killer*, *Haymaker*, and *Juggernaut*.
- **Scoop Inducer Rules & Lore Tooltips**: Enforced strict $\text{CMC} \ge 5$ non-land requirement, dynamic round and opponent life thresholds (Gold: $\le$ Round 4 with $\ge 25$ life; Silver: $\le$ Round 5 with $\ge 25$ life; Bronze: $\le$ Round 6 with $\ge 20$ life), and resolved registry metadata lookup so custom flavor quotes and objectives render accurately in match tooltips.
- **Haymaker Strike Thresholds**: Tuned single-hit strike thresholds to 10+ Bronze, 20+ Silver, 30+ Gold for 1v1 formats.
- **Impactful Match MVPs Filter**: Enforced threshold requirement of $\ge 5$ damage or an earned achievement title to eliminate zero-damage non-titled entries from the Hall of Fame.
- **Deleted Matches Blacklist Table**: Added `deleted_matches` schema and `delete_match` IPC command preventing log re-scans from re-ingesting manually purged matches.
- **Top Bar Text Cleanup**: Removed redundant labels from Achievements and Leaderboards top bars, standardizing on clean search inputs and category switchers.
- **Settings View Overflow Fix**: Fixed vertical scrollbar constraints on compact resolutions.

### ⚡ Fixed

- **Live Match HUD Startup Historical Result Overlay**:
  - Emitted `TailerEvent::InitialCatchupComplete` when the log tailer finishes initial lookback catchup to distinguish historical startup processing from live gameplay.
  - Guarded `last_completed` timestamping behind an `is_live` state machine check, preventing previous matches from triggering the 13-second match result splash screen upon every app launch.

## [1.1.5] - 2026-08-22

### 🌟 Added

- **Mulligan Tracking & Opening Hand Lifecycle**:
  - Full GRE pre-game and prompt parsing (Prompt 36 for Mulligan taken, Prompt 37 for Kept hand, and `ClientMessageType_MulliganResp`).
  - Automated state machine buffering opening hand instances during Turn 0 to eliminate phantom 14+ Turn 1 card draw inflation.
  - Granular tracking for shuffled-back cards (`mulligan`), London mulligan bottomed cards (`bottom`), and kept opening hands (`draw`).
  - Persistent SQLite storage for `hero_mulligans` and `opponent_mulligans` with automated schema migrations.
  - Dedicated **"Opening Phase & Mulligans"** section in the Match Play Timeline displaying color-coded action badges (`MULLIGAN`, `BOTTOM`, `KEPT`), mana pips, and card type icons.
  - Match Specs sidebar summary displaying `Player vs Opponent` mulligan counts.
- **Automated Multi-Platform GitHub Actions CI/CD Pipeline**:
  - Configured `.github/workflows/release.yml` with dual matrix builds (`ubuntu-22.04` and `macos-latest`).
  - Automatically compiles and packages Linux `x86_64` `.tar.gz` and macOS universal release artifacts with automated SHA256 checksum generation on release tags.
- **macOS Platform Support (PR #3)**:
  - Native macOS log (`~/Library/Logs/Wizards Of The Coast/MTGA/Player.log`) and raw card database discovery.
  - Centralized `DatabaseManager::resolve_env()` and opt-in `production-env` cargo feature.

### ⚡ Fixed

- **Settings View Scrollbar Fix (PR #6)**:
  - Fixed vertical overflow and scrolling constraints on the Settings and Configuration view for compact screens.

## [1.1.4] - 2026-08-20

### ⚡ Fixed

- **On the Play vs. On the Draw (`going_first`) Tracking**:
  - Captured Turn 1 active seat (`turnInfo.activePlayer`) to dynamically and accurately resolve whether the player is on the play or on the draw.
  - Added fallback check against Turn 1 records in `match_turn_events`.
  - Added database migration reconciling historical matches with known Turn 1 event seats.
- **Match Duration Calculation**:
  - Implemented elapsed match duration calculation (`(match_end - match_start).num_seconds()`) upon match completion, resolving zero-minute match records in Match History and Dashboard.
- **Midweek Magic Format Prioritization**:
  - Prioritized rotating special event IDs (`mwm`, `midweek`) above underlying deck construction formats (e.g. Historic Pauper, Brawl) in format normalization.

## [1.1.3] - 2026-08-20

### 🌟 Added

- **Comprehensive MTGA Formats Support**:
  - Full GRE parser categorization and database normalization for all MTGA formats: Standard, Standard Brawl, Brawl, Alchemy, Historic, Timeless, Explorer, Draft, Sealed, Bot Match (Sparky/Practice), Direct Challenge, Midweek Magic, and Gladiator.
  - Dynamically populated format filter dropdowns across the Dashboard and Match History.
  - Extended mana-pip-themed badge palettes with distinct, recognizable colors for each format.
  - Extended commander detection in Match History, Full Match Inspector, and Live Match HUD to all Brawl format variants (Standard Brawl & Brawl).
- **Dashboard Trending Win Rate Graph Overhaul**:
  - **Dynamic Dropdown Selector**: Replaced horizontal format buttons with an accessible, dark-themed styled `<select>` dropdown menu.
  - **Redesigned Time Windows**:
    - `Today`: Hourly wins & losses bar graph.
    - `Past 7 Days`: Daily bar graph + daily rolling trend line.
    - `Past 30 Days`: Daily bar graph + daily rolling trend line.
    - `Past 12 Months`: Week-by-week aggregated bar graph + weekly rolling trend line.
    - `All Time`: Month-by-month aggregated bar graph + monthly rolling trend line.
  - **Dual-Colored Threshold Trend Line**: Vibrant green (`#22C55E`) above 50% and vibrant red (`#EF4444`) below 50% with an exact 50% threshold alignment and subtle transition blend.
  - **Background Area Wash**: Subtle horizontal time-series area shading under the trend line matching the win rate status (green above 50%, red below 50%).
  - **Edge-to-Edge Span**: Extended the trend line and background shading to span the absolute left and right boundaries of the graph.
  - **Histogram Outlines**: Added thin white borders to win and loss bars for clean visual separation.
  - **Snappy Graph Transitions**: Removed slow floaty animations (`isAnimationActive={false}`) for immediate zero-lag filter switching.
- **Unified Single-Source Versioning**:
  - Created `src/version.ts` exporting `APP_VERSION` from `package.json` to guarantee synchronous version displays across the Splash Screen and Settings view.

### ⚡ Fixed

- **Bot Matches & "Selected Deck" Fallback**:
  - Added multi-source deck catalog ingestion and match card fingerprint resolution in the SQLite database manager.
  - Automatically resolved previously misattributed bot matches to their true catalog names (e.g. `'MonoWhite - Auras (Standard)'`).

---

## [1.1.2] - 2026-08-20

### 🌟 Added

- **First-Time Setup Wizard**:
  - Guided 3-step onboarding modal triggered on fresh installations (or when `cards_cache` is empty).
  - Step 1: Automatic `Player.log` discovery across Steam Proton, Lutris, Bottles, Heroic, and Wine prefixes with live path status and MTGA Detailed Logging reminder.
  - Step 2: Live animated card database sync status with one-click re-indexing (~150ms).
  - Step 3: Combat analytics readiness confirmation and instant transition into the Dashboard.
- **Dynamic Log-Derived Path Discovery for Lutris & Custom Drives**:
  - Automatically derives the MTGA Raw Card Database directory from the active `Player.log` path (walking up from `drive_c/users/...` in Lutris to find `Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw/` and from `steamapps/compatdata/...` to `steamapps/common/MTGA/...`).
  - Broadened discovery across all mounted disk roots (`/mnt/*`, `/media/*`, `/run/media/*/*`, `/teradrive`), Lutris folders (`~/Games/mtga`, `~/Games/magic-the-gathering-arena`), Bottles, and Heroic prefixes.
- **Automatic Startup Card DB Sync**:
  - Background startup task automatically checks if `cards_cache` is empty and indexes all 26,000+ cards into SQLite in ~150ms without blocking UI initialization.
- **Settings Card DB Diagnostics & Wizard Re-Run**:
  - Added live indexed card universe indicator (`26,572 cards ready`) in Settings under Database & Storage Management.
  - Added a 1-click **Re-sync Cards** button.
  - Added a **Re-run Setup Wizard…** action protected by a safety confirmation dialog to re-verify paths anytime without losing match history.
- **1-Line Web Installer**:
  - Automated `curl -sSL https://raw.githubusercontent.com/Balthazzahr/Rhystic-Tracker/main/install.sh | bash` command that auto-downloads the latest release package, configures desktop launchers, and registers icons.

### ⚡ Fixed

- **Empty Card Cache & Unknown Cards on Fresh Installs**: Resolved issue where fresh installations had 0 rows in `cards_cache`, causing True Decklist imports to fail, Card Library to be blank, and match cards to appear as "Unknown Card".

---

## [1.1.1] - 2026-08-20

### 🌟 Added

- **Settings & Configuration Overhaul**:
  - **Dynamic 2-Column Responsive Layout**: Reorganized all configuration cards into an expansive, height-balanced 2-column grid (`SETTINGS AND CONFIGURATION`) with right-aligned version badge (`v1.1.1` + Test Environment tag).
  - **Local Card Image Cache Manager**: Real-time storage stats (`MB` used / file count) with **Clear Image Cache** and **Pre-download Collection Art** actions.
  - **Database & Storage Management**: Live database filename and storage metrics (`rhystic.db` / `rhystic_dev.db`, file size, total match count) with native 1-click **Backup / Export Database** file save dialog (`export_database_backup`).
  - **App & Collection Preferences**: Dropdown selectors for **Default Startup Tab** (Dashboard, Live Match HUD, Match History, Deck Library, Card Library) and **Default Collection Sort Order** (Release Date, Mana Value, Rarity, Alphabetical, Ownership Count).
  - **Live Match Auto-Switch**: Toggle to automatically navigate to the Live Match HUD tab whenever MTG Arena match start events are detected.
  - **Rebalanced Column Hierarchy**: Balanced Mana Theme Customization into the left column with smooth vertical scrolling support on smaller viewports.
- **Card Library Dual Art Modes & Viewport Optimization**:
  - **Segmented Toolbar Toggle**: Added toggle between **Illustration Only (`<Image />`)** and **Full Card with Rules Text (`<RectangleVertical />`)**.
  - **Landscape Art Crop Mode**: Switches card footprints to native illustration landscape aspect (~1.38:1), eliminating vertical/horizontal distortion.
  - **Top Name & Mana Bar**: Added a semi-transparent dark banner (`bg-black/75 backdrop-blur-xs`) pinned across the top of landscape cards displaying the card name and parsed `<ManaPip />` mana cost symbols.
  - **Recalibrated Card Footprints**: Optimized card dimensions across all 4 modes (Large Portrait `266×372`, Large Landscape `376×268`, Small Portrait `188×262`, Small Landscape `236×170`) to eliminate peripheral dead margins, enforce 4 rows minimum in small portrait mode, and maximize 6×6 card density in small landscape mode.
- **Full Match Inspector Polish**:
  - Dynamically scaled Commander artwork cards in the left column to expand and consume all available vertical space, pinning match spec details cleanly to the bottom.
- **Splash Screen Redesign**:
  - Removed sliding animation in favor of a clean centered presentation with instant dismissal after 2 seconds (or on click).
  - Enlarged symbol icon (`145px`) and logo (`110px`) by ~160% with glowing drop shadows and bold monospace version subtitle.

### ⚡ Fixed

- **Card Art Selection Persistence**: Removed generic fallback short-circuit in `has_card_image` (Rust IPC) that was returning default cached card files instead of downloading selected alternate set printings.
- **Cross-Component Style Synchronization**: Added event-driven style revision triggers (`rhystic-card-style-changed`) so changing set artwork in the inspector immediately updates the Card Library preview and persists across sessions.

---

### 🌟 Added

- **Modal Dismissal Protocols & Dynamic Scaling**:
  - **Global Escape Key Dismissal**: Pressing <kbd>Esc</kbd> now closes any active inspector modal (`FullMatchInfoModal`, `DeckDetailView`, `OpponentH2HModal`), closing nested dialogs (e.g. Export / Import) first.
  - **Backdrop Click Dismissal**: Clicking anywhere on the darkened background outside modal cards smoothly closes the inspector.
  - **Dynamic Viewport Dimensions**: Modals now scale dynamically to **80% window width** (10% margins) and **90% window height** (5% margins), maximizing screen real estate on wide monitors.
- **Responsive 3-Column Decklist Expansion**:
  - `TrueDeckListView` and `DeckCardList` dynamically adapt based on window width.
  - Squeezed or compact viewports display in 2 balanced columns; wide viewports automatically partition cards into **3 height-balanced columns** (`colA`, `colB`, `colC`), dramatically reducing vertical scrolling for 60-card standard and 100-card Commander/Brawl decks.
- **Enlarged Mana Distribution & Floating Histogram Pill Overlay**:
  - Expanded the Mana Distribution pie chart diameter (`outerRadius={76}`) and increased mana pip symbols inside slices up to 30px.
  - Spanned the Mana Value curve across the full height of the header card with a translucent, dark floating pill badge (`MANA VALUE`) centered inside the top of the histogram.
- **Log Tailer 512KB Startup Lookback**:
  - The tailer engine seeks backwards up to 512KB from the end of `Player.log` on startup to reliably ingest pre-match deck submissions (`EventSetDeckV3`) and auth data when launching Rhystic Tracker mid-queue or mid-match.
- **Single-Instance Restriction & Window Focus**:
  - Integrated `tauri-plugin-single-instance`. Launching a second instance immediately focuses the active running window and exits.
- **Dual-Environment Test Pipeline**:
  - Created isolated Test Environment (`launch-test.sh` / `rhystic-tracker-test`) running on `rhystic_dev.db` with custom witch's hat badges, ensuring daily match history and real collection data remain 100% pristine during active testing.

### ⚡ Fixed

- **History Navigation Rate Limiting Crash**: Resolved `SecurityError: history.pushState()` rate limit exception triggered during rapid window resizing with the Deck Inspector open.
- **Match Upsert Idempotence**: Added atomic child record cleanup prior to match inserts, eliminating duplicated turn events and opening hands.
- **WebKit Linux Rendering Safeguards**: Added `WEBKIT_DISABLE_DMABUF_RENDERER=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, and `GDK_BACKEND=x11` flags to ensure crisp rendering without black-screen compositing artifacts.

---

## [1.0.1] - 2026-08-18

### 🌟 Added

- **Diamond Ownership Indicator in Collection Grid**: Replaced card tile dots with glowing 4-diamond indicators representing owned copies (1–4).
- **Interactive 4-Diamond Selector in Card Preview**: Added an interactive 4-diamond ownership adjuster pinned to the bottom of the card details panel.
  - Clicking slot 4 sets 4 copies; clicking slot 1 while 1 is owned toggles to 0.
  - Changes instantly update the SQLite database and universe cache.
- **Event-Driven Collection Reactivity**: Updating ownership inside the card preview modal instantly synchronizes the collection grid and table view without requiring a view toggle or page reload.
- **Standardized App Build Pipeline (`npm run build:app`)**: Bundles frontend assets directly into the standalone Tauri binary using `npx @tauri-apps/cli build --no-bundle`, ensuring offline and self-contained operation without dependency on a local dev server.

### ⚡ Fixed

- **Card Library De-Duplication**:
  - Filtered out secondary Alchemy **Specialize** transform forms (e.g. _Ambergris_, _Alora_, _Skanos_, _Wyll_, etc.) so only the primary collectible card appears in the library.
  - Filtered out subordinate split-card halves (e.g. _Appeal_ and _Authority_ when _Appeal // Authority_ exists) and non-collectible tokens.
- **Card Preview Layout & Proportions**:
  - Removed container overhang and dark background boxes behind the card art.
  - Card art renders cleanly with its native Magic card aspect ratio.
  - Side metadata and analytics panels now align flush with the top of the card art and dynamically scale with content.
- **Compact Table View Ownership Column**: Formatted table view owned column to display compact static numerals (`1`–`4`) or a dash (`—`) when unowned.
- **Scryfall Image Cache & Memory Optimization**: Tuned in-memory image caching and background parallel asset downloads.

---

## [1.0.0] - 2026-08-12

### Initial Release

- Real-time `Player.log` monitoring and event parsing.
- Persistent SQLite match records, deck stats, and combat analytics.
- Live Match HUD, Full Match Inspector, and Turn Playback timeline.
- Five color-identity dynamic mana themes (W/U/B/R/G).
- True decklist import/export and preset deck legitimacy validation.
