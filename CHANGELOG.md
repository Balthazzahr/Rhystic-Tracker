# Changelog

All notable changes to Rhystic Tracker are documented here.

## [1.1.0] - 2026-08-19

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
