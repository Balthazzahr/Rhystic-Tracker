# Changelog

All notable changes to Rhystic Tracker are documented here.

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
