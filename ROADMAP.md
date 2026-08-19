# Rhystic Tracker — Development Roadmap

**Current Release:** v1.1.0 (Released 2026-08-19)  
**Status:** Active Production  

---

## 1. Completed Milestones

### Version 1.0.0 (Initial Release Candidate)
- [x] **Real-Time Log Ingestion**: Tailer engine with file-rotation supervision and multi-prefix auto-discovery for Steam Proton, Lutris, and Bottles.
- [x] **Event Parsing & State Machine**: Accurate GRE message extraction, hero seat identification, and match outcome detection.
- [x] **Persistent SQLite Storage**: Dedicated schemas for matches, cards, turn events, combat damage splits, and user decklists.
- [x] **Live Match HUD**: Real-time life totals, card plays, token creations, and damage attribution feeds.
- [x] **Full Match Inspector**: Turn-by-turn combat replay timeline with damage magnitude badges (`[4 DMG]`) and victory/defeat attribution.
- [x] **Lifetime Card Combat Analytics**: Face vs permanent damage splits, combat vs spell damage, MVP deck classification, and turn-cast histograms.
- [x] **Deck Library & Verification**: True decklist MTGA format import/export with automated precon/starter deck exclusion rules.
- [x] **Theming Engine**: Dynamic MTG color-identity themes (White, Blue, Black, Red, Green).
- [x] **Desktop Integration**: System tray menu, background minimize support, and automated Linux `.desktop` installer (`install.sh`).

### Version 1.0.1 (Collection & Layout Polish)
- [x] **Diamond Ownership Controls**: Replaced dot indicators with 4-diamond indicators representing owned copies (1–4) in collection tiles.
- [x] **Interactive 4-Diamond Selector in Card Modal**: Pinned interactive diamond ownership adjuster with instant SQLite persistence.
- [x] **Cross-View Collection Reactivity**: Updating ownership in the card preview modal updates the collection grid and table view in real time with zero flicker.
- [x] **Card Library De-Duplication**: Filtered out secondary Alchemy Specialize transform variants, split-card subordinate halves, and non-collectible tokens.
- [x] **Card Previewer Layout**: Removed outer container overhang and aligned side panels flush to the top of the card art with dynamic height scaling.
- [x] **Self-Contained Release Build Pipeline**: Standardized `npm run build:app` script embedding frontend assets directly into the standalone binary to eliminate localhost dev-server dependencies.
- [x] **Public GitHub Release Automation**: Packaged and published `v1.0.1` tarball and release notes on GitHub.

### Version 1.1.0 (Inspector Ergonomics, 3-Column Decklist Expansion & Stability)
- [x] **Universal Modal Dismissal**: Integrated global Escape key listener and backdrop click-to-close across all inspector modals (`FullMatchInfoModal`, `DeckDetailView`, `OpponentH2HModal`).
- [x] **Dynamic 80% W / 90% H Sizing**: Standardized responsive viewport scaling (`80vw` / `90vh`) with symmetric 10% side buffers and 5% vertical margins.
- [x] **Responsive 3-Column Decklist Expansion**: Dynamic height-balanced 3-column reorganizer (`colA`, `colB`, `colC`) in True Decklist and All Logged Cards views for widescreen displays.
- [x] **Header Charts Polish**: Significantly enlarged Mana Distribution pie chart and placed a translucent floating pill overlay (`MANA VALUE`) centered inside the full-height histogram.
- [x] **Tailer Startup Lookback (512KB)**: Added startup buffer seek to catch pre-match `EventSetDeckV3` deck selections and player authentication when launching mid-match.
- [x] **Single-Instance Restriction**: Integrated `tauri-plugin-single-instance` to focus existing windows on duplicate launches.
- [x] **Dual-Environment Test Pipeline**: Created isolated test environment (`./launch-test.sh` / `rhystic-tracker-test`) with auto-snapshotting `rhystic_dev.db`.
- [x] **Navigation & Resize Crash Prevention**: Stabilized `history.pushState` to eliminate rate-limit exceptions and WebKit rendering thread drops.

---

## 2. Immediate Next Steps & Active Tasks

- [ ] **Deck Win Rate Breakdown by Opponent Archetype**: Add matchup matrix in Deck Detail view showing win rates against specific color combinations (e.g. Mono-Red, Azorius Control, Golgari Midrange).
- [ ] **Mulligan Impact Analytics**: Track and display win rate correlation based on starting hand size (7 cards vs 6 vs 5) across formats.
- [ ] **Enhanced Draft / Limited Match Grouping**: Automatically group matches played in the same Draft or Sealed run under a single event banner.
- [ ] **Quick Search Keyboard Shortcuts**: Add global `/` shortcut to focus search input in Deck Library and Collection views.

---

## 3. Future Roadmap & Feature Backlog

### Phase 1: Gameplay & Deck Analytics
- [ ] **Live Overlay Mode**: Optional transparent floating window overlay for X11/Wayland displaying real-time opponent cards seen and deck remaining probabilities during active matches.
- [ ] **Decklist Diff Inspector**: Side-by-side comparison tool to view card changes and win-rate trends across different versions of the same deck.
- [ ] **Opening Hand Simulator & Mana Base Calculator**: Interactive tool in Deck Detail view simulating hypergeometric probability of drawing needed mana colors by turn 3/4.

### Phase 2: Collection & Economy Tools
- [ ] **Wildcard Crafting Advisor**: Highlight missing cards needed across multiple user decklists with total Rare/Mythic wildcard requirements.
- [ ] **Set Completion Tracker**: Visual set progress bars showing % of Commons, Uncommons, Rares, and Mythics collected per expansion.
- [ ] **Booster Pack Opening Log**: Track booster pack opens from log events to estimate vault progress and duplicate protection.

### Phase 3: Platform & Distribution
- [ ] **Flatpak & AppImage Bundles**: Create official Flatpak manifest on Flathub and automated AppImage builds in GitHub Actions.
- [ ] **Steam Deck Game Mode Integration**: Optimized gamepad navigation controls and responsive scaling presets for 1280x800 handheld displays.
- [ ] **Database Backup & Export Utility**: One-click database export/import (JSON/SQLite archive) in Settings to simplify migration between machines.

---

## 4. Known Issues & Minor Limitations

- **Wayland Hardware Acceleration**: Some NVIDIA Wayland configurations require `GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1` (handled automatically by `launch.sh` and `install.sh`).
- **MTGA Raw Collection Export**: MTGA no longer dumps complete collection inventory in `Player.log`. Rhystic Tracker derives collection accurately from True Decklists and real draws; if Wizards re-enables full client inventory dumps, automatic full-collection synchronization will activate.
