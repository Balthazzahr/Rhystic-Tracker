# Changelog

All notable changes to Rhystic Tracker are documented here.

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
  - Filtered out secondary Alchemy **Specialize** transform forms (e.g. *Ambergris*, *Alora*, *Skanos*, *Wyll*, etc.) so only the primary collectible card appears in the library.
  - Filtered out subordinate split-card halves (e.g. *Appeal* and *Authority* when *Appeal // Authority* exists) and non-collectible tokens.
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
