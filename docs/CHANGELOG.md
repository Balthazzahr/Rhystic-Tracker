# Changelog

All notable changes to Rhystic Tracker are documented here.

## [1.4.1] - 2026-09-03

### ⚔️ Match Timeline & Inspector Polish
- **Symmetrical Player & Opponent Layout**: Symmetrically mirrored action boxes between hero and opponent without redundant prefixes; removed card mana costs in favor of card type indicators.
- **Directional Combat Damage Arrows**: Added clear green arrows when player deals damage to opponent, red arrows when opponent deals damage to player, centered with aligned red damage badges.
- **Heart Life Total Indicators**: Replaced textual life changes with heart icon formatting (`[❤️ -X → Y]`).
- **Token Sacrifice & Inspector Upgrades**: Designated artifact tokens being sacrificed as amber `[USED]` rather than `DIES`. Fixed Token Inspector Scryfall set prefix resolution (`tm21`, `txln`) and face-name matching.
- **Zero-Latency Card Type Tooltips**: Replaced delayed hover tooltips on card type icons with instant CSS tooltips.
- **Play Timeline Default**: Opened the Match Inspector directly to the Play Timeline tab by default.

### 🍱 Dashboard 2.0 & Widget Enhancements
- **Interactive HSV & Hex Color Chooser**: Replaced fixed preset swatches with a full HSV color wheel / eyedropper picker, custom hex input with validation, and one-click copy-to-clipboard button.
- **Deck Spotlight Full Art Redesign**: Widget displays full card art crop matching the Deck Library deck box (custom art, commander, or top card) spanning behind a translucent header. Centered masking tape title with mana pips, stacked win rate, taller borderless curve histogram colored by positive win rate, and whole-widget clickability opening the Deck Inspector.
- **Current Streak Dot Density & Dynamic Stretching**: Scaled trail to 4 games per column (up to 16 games for 4 columns) with responsive rectangles dynamically stretching to 100% of widget width. Centered subtle `"W"` and `"L"` letters, active streak highlight ring, and contextual captions for winning/losing runs.
- **Recent Matches Streamlined Rows**: Simplified layout removing mini impactful cards in favor of equal-width themed `WIN` / `LOSS` badges, deck preview art thumbnails, matchup text, relative time elapsed, and Match History-aligned format badges.
- **Pure Color Fidelity**: Removed fillOpacity and border strokes on Trending Win Rate bars to ensure true selected hex colors render without tinting; matched All-Time and Today Win Rate subheading win/loss counts with positive/negative color slots.

## [1.4.0] - 2026-09-02

### ⚡ Urgent Hotfix (Post-Release)
- **Mana Dynamo Per-Instance Tracking**: Resolved bug where tapping multiple copies of basic lands (e.g. 5 Snow-Covered Forests) aggregated into the same card definition ID; now strictly tracks burst mana output per individual battlefield permanent instance.
- **Swarmer Token Attribution**: Removed unbounded backwards search across match history that erroneously credited tokens created in later turns to single-token spells (e.g. Ranger Class).
- **Card Name HTML Tag Sanitization**: Cleaned raw HTML markup (e.g. `<i>il</i>` in *Elas il-Kor, Sadistic Pilgrim*) across Card Inspector, Commander badges, Card Breakdown, and SQLite `cards_cache`.
- **Match Inspector Avatar Polish**: Lifted baseline standing avatar height and added custom upward focal offset/scaling for Smaug.

### 🍱 Dashboard 2.0: Modular Bento-Box Grid, Custom Theme Colors & Layout Architecture

- **Configurable Bento-Box Widget Grid Architecture**:
  - Rebuilt the core Dashboard around an extensible, persistent 12-column Bento-Box grid engine supporting multi-row dense packing and dynamic aspect ratios.
  - Interactive Customize mode enabling direct drag-and-drop reordering, column width steppers (1c–12c), row height steppers (1r–8r), interactive drag-border resizing, and smart auto-filling row reflow upon widget removal.
  - Complete widget catalog modal allowing arbitrary addition of dashboard modules: All-Time Win Rate, Today Win Rate, Current Streak, Trending Win Rate, Recent Matches, Deck Spotlight, Featured Leaderboard, Recent Achievements, Format Breakdown, and Fun Facts.
  - Persistent layout engine backed by SQLite (`dashboard_layouts` table) and frontend client caching.
- **Custom Module Color Customizer**:
  - Interactive "Change Colors" modal allowing custom two-color pairings per module:
    - All-Time Win Rate: Positive (≥50%) & Negative (<50%)
    - Today Win Rate: Positive (≥50%) & Negative (<50%)
    - Current Streak: Winning Streak & Losing Streak
    - Trending Win Rate: Histogram Wins Bar & Losses Bar
    - Recent Matches: Match Win & Match Loss
  - Integrated with MTG mana swatches, custom hex picker inputs, and persistent storage.
- **Responsive Dynamic Module Scaling**:
  - Deck Spotlight: Adaptive card scaling down to 2r × 4c with miniature single-row notable cards.
  - Recent Matches: Dynamic list displaying up to 50 matches when expanded, with compact mode hiding miniature cards on narrow widths.
  - Current Streak: Large display formatting with live duration calculation elapsed since last win/loss.
  - Recent Achievements: 2x enlarged heraldic shield badges with card artwork thumbnails.
- **Sidebar & Header Modernization**:
  - Unified `DASHBOARD` header with party ability icon across both new and legacy modes.
  - Integrated full Rhystic Tracker wordmark logo in the sidebar header with auto-collapse to compact quill icon.

### 🏆 Achievements Modal Suite, Leaderboard Benchmarking & Search Bar Standardization

- **Master Achievements Trophy Cabinet Modal (`AchievementDetailModal.tsx`)**:
  - Rebuilt the Achievement Drill-Down / Trophy Cabinet modal with a stamped heraldic shield badge, floating Beleren title, decorated cards gallery with mini art thumbnails, tier milestone progression indicators, and floating flavor quotes.
  - Linked Recent Achievements on the Dashboard to open the full Trophy Cabinet modal directly in-place without navigating away from the dashboard view.
  - Extracted as a reusable component shared across Dashboard, Achievements View, and Deck/Card trophy modals.
- **Deck & Card Achievements Modals Styling**:
  - Upgraded Deck Achievements and Card Trophy Case modals with floating headers, MTG wreath icons, and 75% larger trophy badges.
  - Fixed mini arts and column alignment in Achievements table view.
- **Leaderboards View & Modal Redesign (`LeaderboardsView.tsx`)**:
  - Rebuilt the full Leaderboard modal with floating header, frosted glass container, and standard search styling.
  - Pinned Top 3 Podium Benchmark (#1 Gold, #2 Silver, #3 Bronze) during search with comparison delta ("Gap to Podium") for cards outside the top 3.
  - Fixed modal height to maintain layout consistency across search queries.
  - Implemented strict token creature exclusions across all SQL queries and frontend filters.
- **App-Wide Search Bar Standardization**:
  - Standardized search bar dimensions, borderless frosted glass background (`bg-white/[0.04]`), typography, icons, and clear buttons across all views and modals.

---

## [1.3.11] - 2026-09-01

### 🔮 Deck Inspector Overhaul, Card Inspector Unboxing & Palette Synchronization

- **Deck Inspector Modal Overhaul (`DeckDetailView.tsx`)**:
  - Full-window ambient background card art dynamically loaded from the deck's cover/background card art.
  - Floating, unboxed header combining the deck identity, mana curve histogram, card type bars, and mana distribution pie chart.
  - Full cover art and background art selector modal with explicit click-to-select and active highlight lock-in.
  - Plain typography applied to Commander and recent matches opponent cards in place of stylized fonts.
  - Fixed decklist import IPC handler to invoke `save_deck_list` with arena export text.
- **Card Inspector Redesign & Unboxing (`CardInspectorModal.tsx`)**:
  - Eliminated nested boxes-within-boxes in favor of single-level, fully opaque dark panels (`bg-neutral-950`).
  - Increased font sizes across the board (+2 points) for superior readability across all display resolutions.
  - Increased backdrop darkness tint (`bg-black/75 backdrop-blur-md`) to ensure prominent modal pop-up focus while keeping the underlying window discernible.
- **Black Mana & Data Visualization Palette Synchronization**:
  - Unified the Black mana color (`B`) across pie charts, bar charts, and theme options to match the charcoal/dark slate fill of the Black Mana Pip (`#374151`), replacing legacy purple while preserving subtle window tints.
- **Match History Navigation Fix**:
  - Linked deck name clicks directly in the Match History table to open the Deck Inspector modal.
- **Achievement Ingestion Filtering**:
  - Restricted card achievements to player-owned cards only and filtered token cards from receiving card achievement titles.

---

## [1.3.10] - 2026-08-31

### 🥊 Match History Inspector Redesign, Street Fighter "VS" Header & Arena Avatar Ingestion

- **Floating Unboxed Inspector Header & Arcade "VS" Face-Off**:
  - Rebuilt the Match Inspector header into a floating unboxed stage with high-contrast text and centered arcade-style "VS" badge inspired by Street Fighter.
  - Layered Hero and Opponent character avatars behind the top border rim of the modal container with authentic 3D overlap.
- **Arena Avatar Ingestion & Full 406 MTGA Catalog**:
  - Extracted full 406-avatar catalog mapping directly from Arena localization databases (`Raw_ClientLocalization_*.mtga`).
  - Added schema migrations and log ingestion for `hero_avatar`, `opponent_avatar`, `hero_platform`, and `opponent_platform` telemetry.
  - Native offline transparent Adventurer (`_npe_Player.png`) bundled directly as universal fallback.
- **Platform Telemetry Badges**:
  - Integrated platform badges across Windows PC, Steam, macOS, iOS, iPad, Android Phone, and Android Tablet with dedicated iconography.
- **Flat Card Breakdown & Muted Mana Palette**:
  - Removed nested boxes from the side-by-side card breakdown in favor of clean two-column lists matching the Match History table.
  - Replaced all neon fluorescent badge accents with authentic muted MTG mana colors.

---

## [1.3.9] - 2026-08-31

### ⚔️ Live Match HUD & Match Timeline Overhaul, Mulligan Parity & Layout Refinements

- **Live Match HUD First-Player Dynamic Layout**:
  - Dynamically aligns the player who went first (Play) to the Left Column (Turn $2r - 1$) and the second player (Draw) to the Right Column (Turn $2r$).
  - Top player/opponent dashboard stations, turn headers, and life feeds dynamically reposition to match the first-player perspective.
- **Match Inspector Timeline Synchronization**:
  - Brought historical match play inspection in `MatchTimeline.tsx` into 1:1 visual parity with the Live Match HUD.
  - Standardized badges across `[PLAY]`, `[DRAW]`, `[KEPT]`, `[MULLIGAN]`, `[BOTTOM]`, `[DIES]`, `[EXILE]`, `[TOKEN]`, `[DMG]`, `[LIFE]`, `[OPP LIFE]`, and counters.
  - Removed match-level achievement title tags from repeating on every inline turn event row, keeping the play sequence uncluttered while preserving achievements in dedicated showcase cards.
- **Opening Hand & Mulligan Processing**:
  - Fixed duplicate mulligan consumption caused by GRE server prompt processing (`PromptReq` `promptId: 36`).
  - Added support for London mulligan card bottoming tracking and kept opening hand finalization on Turn 1 start.
- **Table Pagination Standardization**:
  - Standardized table views across Match History, Card Library, Deck Library, and Achievements to 30 entries per page.
- **Modal Stacking & Visual Glitch Fixes**:
  - Fixed header transparent backdrop glitches in Card Library during initial load.
  - Standardized modal stacking context layers (`z-[100]`) and tuned sidebar background alpha.

---

## [1.3.8] - 2026-08-30

### ⚙️ Settings Overhaul, Match Deletion & Universal Mana Pip Customization

- **Settings Visual Overhaul & Universal Search Filter**:
  - Aligned the Settings view to the application design standard with left-justified glass surfaces and floating segmented category tabs (`General`, `Appearance`, `Connection`, `Storage`, `About`).
  - Integrated universal real-time search engine with keyword matching across all settings.
- **Two-Step Permanent Match Deletion & Blacklisting**:
  - Added "Enable Match Deletion in History" toggle with a 2-step confirmation modal (match summary check followed by irreversible delete warning).
  - Cascading SQLite removal across matches, card audits, and turn timeline events, with automatic registration into `deleted_matches` blacklist preventing log tailer re-ingestion.
- **Universal Mana Pip Representation Styles**:
  - Added real-time switchable Mana Pip rendering across the entire application:
    - **Graphic Pips (Default)**: Authentic circular color-filled badges with embedded Magic iconography.
    - **High-Contrast Vector Glyphs**: Pure vector font icons rendered directly via Magic's vectorized glyph library (`ms-cost`).
    - **Text Mana Codes (`{W}{U}{B}{R}{G}`)**: Compact monospace notation badges formatted as raw MTG syntax, always colored to their respective Magic mana identity.
  - Applied reactively to Card Library table rows, Deck Library, Match History, Leaderboards, and Card Inspector overlays.
- **Expanded Application & Behaviour Settings**:
  - **Exclude Sparky & Tutorial Matches**: Automatic filtering of bot matches and color challenge tutorials from match records and win-rate statistics.
  - **Sound Effects & Audio Cues**: Optional subtle system audio cues on match start, win/loss, or achievement unlock.
  - **Live HUD Window Pinning**: Native `set_always_on_top` Tauri window pinning for borderless gameplay overlays.
  - **Auto-Export Matches**: Auto-exporting of completed match records to JSON archive or CSV spreadsheet.
  - **Automated Weekly Backups**: Startup automated timestamped SQLite database backups.
  - **Scryfall Image Cache Disk Quota**: Storage quota management (500 MB, 1.0 GB, 2.0 GB, Unlimited).
  - **Best-of-Three Sideboard Segregation**: Post-sideboard card isolation for Bo3 games 2 & 3.
- **Theme Palette & Glassmorphic Contrast Tuning**:
  - Corrected Black theme palette to traditional charcoal obsidian and dark slate (`#6B7280` / `#9CA3AF`).
  - Tuned Subtle Glass (30% tint) background opacity in `BlurredCardBackground` to preserve rich ambient artwork while guaranteeing high contrast and text readability.

---

## [1.3.7] - 2026-08-30

### ⚔️ Live Match HUD Visual Overhaul & Synchronized Combat Timeline

- **Synchronized Combat Board & Full-Width Round Separators**:
  - Replaced split timeline boxes with a single unified combat workspace container (`bg-neutral-950/50 backdrop-blur-md border border-white/10`).
  - Full-width `ROUND N` headers spanning 100% across the table ensure rounds are vertically aligned across both players.
  - 2-column turn layout (Left = Turn $2N - 1$, Right = Turn $2N$) separated by a subtle divider line (`border-r border-white/5`), with strictly chronological top-to-bottom action flow.
- **Dynamic Play / Draw Positioning**:
  - The player who went first (Play) is dynamically positioned in the left column; second player (Draw) in the right column.
  - Colors remain consistent across positions: Hero is always **MTG Green** (`#22C55E` / `#16A34A`), Opponent is always **MTG Red** (`#EF4444` / `#DC2626`).
- **Unboxed Command Station Metrics**:
  - Completely removed outer wrapper boxes and nested sub-panels ('box-in-a-box' anti-pattern).
  - Deck name, cards seen, health bars, mini commander art crop (`version="art_crop"`), and color identity mana pips (`size={22}`) float directly on the ambient background.
  - High-contrast typography ensures crisp legibility directly against ambient artwork.
- **Dynamic Health Bars & Life Change Indicators**:
  - Full-width gauge bars with smooth gradient fills and centered life totals.
  - Pulsing in-turn life change delta badges (e.g. `+2 HP` / `-4 HP`) positioned next to life values.
- **Top Toolbar & Search Filter**:
  - Left-aligned search input filtering cards, types, actions, and targets in real time.
  - Right-justified metrics cluster (`[Match in Progress] [Format Badge] [Elapsed Time] [Turn | Round]`).
- **App-Wide Transparency Standardization**:
  - Standardized all major table bodies and workspaces (**Match History**, **Card Library**, **Deck Library**, **Achievements**, **Live Match HUD**) to **`bg-neutral-950/50 backdrop-blur-md border border-white/10`** for a uniform glassmorphic aesthetic.

---

## [1.3.6] - 2026-08-29

### 🎨 App-Wide Ambient Card-Art Backgrounds, UI Glassmorphism & Leaderboard Polish

- **Ambient Card-Art Background Engine**:
  - Direct hardware-accelerated local asset rendering pipeline (`ensureLocalImage` via `convertFileSrc`), completely eliminating WebKitGTK off-screen canvas tainting and security errors.
  - Three background modes configured under **Settings > Appearance & Themes**:
    - **Random**: Automatically selects and pre-warms a random prominent commander or key card from your library on every tab navigation.
    - **Preset**: Customize individual card art per tab (`Dashboard`, `Matches`, `Decks`, `Collection`, `Achievements`, `Leaderboards`, `Live HUD`, `Settings`) with real-time card search.
    - **None**: Clean solid base background without card artwork.
  - Native visual treatment: `saturate(0.55)`, `brightness(0.5)`, top-focus vertical framing (`objectPosition: center 30%`), and dual-layer base/accent washes.
  - Zero-latency tab swapping via memory pre-decoding and deduplicated in-flight cache.
- **Glassmorphism & Subtle UI Transparency**:
  - Applied subtle transparency (`~90%` opacity) paired with `backdrop-blur-md` across the left sidebar, Settings tab content body, Deck Inspector, Match Inspector, Card Inspector, and all filter/column customizer dialogs.
- **Leaderboards Polish**:
  - Fixed rank numbering logic in the 9-leaderboard grid where entries beyond 3rd place displayed `#3` instead of `#4` through `#10`.
  - Replaced 1st place wreath icon with a crisp gold `#1`.
  - Transformed leaderboard entries into clean floating rows with color-coded podium numbers and values.

---

## [1.3.5] - 2026-08-29

### 🐛 Minor Bug Fixes, Filter Polish & Miscellaneous Issues Pass

- **Deck Library Advanced Filters Fix (Issue #8 / UI)**:
  - Fixed `filteredDecks` memoization bug where `selectedFormats`, `winRateFilter`, and `gamesFilter` were missing from the React `useMemo` dependency array, preventing filter selections in the Advanced Deck Filters modal from updating the deck list.
  - Added filter states to the pagination reset effect to automatically return to Page 1 when filtering.
  - Enhanced format matching so base formats (e.g. "Standard") seamlessly match extended format tags ("Standard Ranked", "Standard Play").
- **Card Library Exact Color Identity Filtering**:
  - Rewrote color filtering in `query_collection` to enforce exact color identity matching.
  - Selecting a single color (e.g. `R`) now strictly filters for mono-color cards (excluding multi-color / dual cards).
  - Selecting multiple colors (e.g. `R` + `B`) filters strictly for cards with that exact color identity (e.g. Rakdos).
  - Selecting Colorless (`C`) filters strictly for cards with no color identity.
- **Assigned-Deck Event Identification & Stale Deck Cache Prevention (Fixes #7 / Merged #11)**:
  - Added native detection for assigned-deck queues like **Welcome Deck Duels** and **Jump In**.
  - Prevents the match assembler from inheriting the previously cached deck name, cleanly labelling matches as `"Preset / Event Deck"`.
  - Marks `match_legitimate = false` to guarantee borrowed event cards never contaminate the user's permanent collection inventory.
- **Standalone Linux Release Packaging Fix (Fixes #10)**:
  - Updated the GitHub Actions Linux release build step to compile via `npx @tauri-apps/cli build --no-bundle --features production-env`.
  - Fixes the `Could not connect to localhost: Connection refused` error by ensuring the Vite frontend bundle is embedded directly into the binary.
  - Standardized environment variables (`GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 RHYSTIC_ENV=production`) in the `.desktop` launcher created by `install.sh`.
- **Arch Linux AUR Packaging (Resolves #12)**:
  - Added official `PKGBUILD` and `.SRCINFO` recipes in `packaging/aur/` for both `rhystic-tracker-bin` and `rhystic-tracker-git`.
  - Added an automated AUR deployment step to the release workflow.

---

## [1.3.4] - 2026-08-28

### 📦 3D Physical Deck Box Cards, Custom Cover Art Selector & Visual Flair Settings

- **3D Realistic Deck Box Cards (Deck Library)**:
  - **Authentic Physical MTG Deck Box Silhouette**: Rendered with a resting angled closed envelope-flap lid via SVG vector clip-paths (`#deckBoxLidClip`), continuous body/lid card artwork alignment, and subtle translucent upturned cardboard lip bevels.
  - **Interactive 3D Opening Lid**: Smooth 3D tilt animation on hover (`rotateX(-26deg) translateY(-3px)`) with a recessed dark interior chamber peeking 3 authentic MTG cards complete with full black borders, headers, and text boxes (`version="normal"`).
  - **Handwritten Masking Tape Label**: Organic hastily-applied rotated tape strip with rough-torn jagged edges across the lid flap, featuring authentic marker pen typography powered by Google Font `Permanent Marker`.
  - **Die-Cut Circular Mana Stickers**: Die-cut individual circular mana pip stickers with fine cream vinyl borders (`#FAF7EE`), subtle non-obscuring organic touch overlap, and natural vertical staggering.
  - **Hand-Drawn Grease Pencil Win Rate Loop**: Bold handwritten win rate percentage numbers layered strictly on top of an organic hand-sketched marker circle stroke (Green for $\ge 50\%$, Red for $< 50\%$, Slate for unplayed) with high-contrast multi-stage drop-shadows for 100% legibility across all artwork.
- **Custom Deck Box Cover Art Selector (Deck Inspector)**:
  - Added a dedicated **"Cover Art"** button next to the deck name in the Deck Inspector header.
  - Interactive selection modal featuring real-time card name search across all unique cards in the deck, live `art_crop` hover preview, one-click cover art selection, and a **"Reset to Default"** button.
  - Persists custom artwork overrides to SQLite via the new `deck_art_overrides` table, syncing instantly across the Deck Inspector and Deck Library.
- **Deck Box Visual Flair Toggle (Settings)**:
  - Added a dedicated switch under **Settings > Appearance & Themes > Card & Library Display**: *Deck Box Visual Flair*.
  - Toggling off removes the mana pip stickers and win rate marker circles, displaying a clean, minimal aesthetic with deck titles and continuous card artwork only.
- **WebKitGTK Performance & Compositing Optimizations**:
  - Isolated the Deck Library grid during modal transitions (`display: none` when Deck Inspector is open), eliminating WebKitGTK multi-layer SVG compositing stutter.
  - Deferred heavy analytics charts and card list IPC during modal mount for silky 60 FPS transitions.
  - Gated interior peek card image decodes to hover-only, eliminating ~75% of background image decodes across large libraries.
- **Achievements Table Hotfix**:
  - Corrected tier mapping in the Achievements table view to read backend `gold_count`, `silver_count`, and `bronze_count` fields.

---

## [1.3.3] - 2026-08-28

### 🏆 Achievements Page Overhaul & Cross-View Grid Refinements

- **Achievements Page Redesign**: The Achievements view now mirrors the design language of Match History, Card Library, and Deck Library — borderless floating toolbar, glass search, segmented toggles, flat trophy cards, and a unified pagination footer.
- **New Achievements Table View**: 8-column table (Achievement, Highest Tier, Gold/Silver/Bronze earned counts, First Earned, Cards, Cards Achieved) with a drag-and-drop column picker, top-earner art previews, and desaturated unearned badges.
- **Achievements Card View**: Shelf-style top-down/left-to-right grid, larger cards (325×370) with scaled-up emblems, and full pagination (wheel + footer).
- **Card Library**: Removed the art-crop (illustration-only) mode — the collection now always displays full card frames.
- **Deck Library**: Fixed card-grid column fit so it fills a full page at half-screen tiled widths.
- **Directional Sort Indicators**: Card & Deck Library sort menus now show up/down bar icons that flip with sort direction, with a compact `: Name` label.
- **Instant Grid Reflow**: Card grids no longer shuffle or resize when the window resizes or the card size toggles.
- **Perfectly Centered Pagination**: The Prev / Page / Next cluster is now centered on the table in Match History, Card Library, Deck Library, and Achievements, independent of the summary text.
- **Mount-Safe Grid Measurement**: Card grids are measured via callback refs, fixing a bug where a section opened in Card Mode could paginate at one item per page.
- **Backend**: `get_global_achievements` now returns per-tier earned counts, first-earned dates, and per-card tier breakdowns for the new table view.

---

## [1.3.2] - 2026-08-27

### 🎨 Minimalist Borderless Floating UI, Deck Advanced Filters, Dynamic Orbital Spinner & Table Alignment Polish

- **Borderless Floating Toolbars & Footers**:
  - Upgraded top filter bars and bottom pagination footers across Match History, Card Library, and Deck Library to borderless floating controls.
  - Eliminated hard bounding boxes and horizontal dividing lines (`border-t border-white/5` removed) in favor of translucent floating pills (`hover:bg-white/[0.08] text-neutral-300 hover:text-white active:scale-95`).
  - Styled search bars with subtle glass backgrounds (`bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] border-0`).
  - Converted segmented view toggles (`[Cards] [Table]`, `[Crop] [Full]`) to borderless floating selectors (`bg-white/[0.03]`).
- **Advanced Deck Filters in Deck Library**:
  - Added dedicated Advanced Filters modal to the Deck Library toolbar matching Card Library and Match History positioning.
  - Filter decks by **Format** (Standard, Alchemy, Historic, Explorer, Timeless, Brawl, Commander, Limited, Casual, etc.), **Win Rate** (`≥ 50%`, `< 50%`), and **Games Played** (`0 Games`, `< 10`, `< 50`, `< 100`, `≥ 100`).
  - Added filter chip counters and active badge counts.
- **Universal Column Selector (`Columns3` & Minimalist Count)**:
  - Replaced slider icon with `Columns3` across toolbars and column customizer modal headers in Match History, Card Library, and Deck Library.
  - Omitted the word `"COLUMNS"` to display cleanly as `[Columns3] (X)`.
- **Advanced Card Filters Visual Polish**:
  - **Copies Owned**: Replaced plain text with custom diamond indicators (`◆ ◇ ◇ ◇`, `◆ ◆ ◇ ◇`, `◆ ◆ ◆ ◇`, `◆ ◆ ◆ ◆`).
  - **Rarity Tiers**: Colored typography and borders matching official MTG rarity tiers (Common `#94A3B8`, Uncommon `#38BDF8`, Rare `#FBBF24`, Mythic `#F97316`).
  - **Card Types**: Official vector font icons (`ms ms-creature`, `ms ms-instant`, etc.) alongside type names.
- **Dynamic Orbital Loader & Missing Art Placeholders**:
  - Replaced standard loaders with high-fidelity `OrbitSpinner` scaling responsively from `32px` table thumbnails to `84px` card frames in the Card Inspector.
  - Replaced generic broken image boxes with official `RhysticIcon` placeholders in muted neutral tones.
- **Table Column Centering & Alignment Consistency**:
  - Fixed horizontal disconnect between table headers and cell contents in Match History and Card Library.
  - Enforced strict alignment rule: Primary entity columns (`Name`, `Matchup`, `Deck`) remain left-aligned; all other data columns (`Cost`, `Type`, `Set`, `Rarity`, `Date`, `Result`, `Colors`, `Format`, `Play`, `Curve`, `Games`, etc.) are centered in both headers and row cells.
- **Design System Master Documentation**:
  - Updated `DESIGN_SYSTEM.md` with comprehensive UI specifications for borderless floating toolbars, table centering, icon conventions, and filter styling standards.

---

### 🐛 Fixes & Polish (Community PR + Dashboard + Deck & Card Library + Leaderboards + DB Concurrency)

- **Merged Community PR #9 — Dashboard Responsive Layout** (`jte0711`): Two-column dashboard now stacks to single-column below `1200px` (`flex-col min-[1200px]:flex-row`), divider switches horizontal/vertical, Recent Matches removes inner `overflow-y-auto` in favor of outer scroll — fixes height/width break when resizing (fixes #8).
- **Deck Inspector Win Rate by Position**: Fixed white `0.0%` above On the Play / On the Draw continuum bars — now computes `wins/(wins+losses)*100` instead of missing `detail.play.total` (reported post-1.3.0).
- **Deck Inspector → View All**: Now seeds Match History `initialSearch` with deck name and filters to that deck’s matches instead of showing unfiltered entire history (`App.tsx` `matchHistorySearch` + `MatchHistoryView` `initialSearch` prop).
- **Deck Library Sorting in Card View**: Moved `COLUMNS` button left of view toggle (`Search | Colors | flex-1 | SORT/COLUMNS | View Toggle | Card Size`). In card view it now shows a themed `SORT: …` dropdown (`deck_name` / `games` / `winrate` / `last_played`) reusing `handleSortColumn` with same `asc/desc` logic, `Escape`/backdrop close.
- **Card Library Sorting in Card View**: Mirrored pattern — `Search | Colors | Adv Filter | flex-1 | SORT/COLUMNS | View Toggle | Art Mode | Card Size`. Cards dropdown offers `Name` / `Mana Value` / `Rarity` / `Set` / `Release Date` / `Owned Count` (`sortByColumn` / `get_collection {sort,sort_dir}`).
- **Leaderboards — Domain Titles Removed & Entry Height**: Removed 3 domain headers (Combat Damage / Non-Combat Spells & Abilities / Honors & Mastery) and `space-y-4 → space-y-3` reclaiming ~85px. Leaderboard list `h-[318px] → h-[348px]` and rows `h-[58px] → h-[64px]` (`w-9 → w-10` art), keeps strictly 5 visible with no 6th peek, each entry taller.
- **Leaderboards — Card Title Size**: Individual leaderboard headers `text-xs → text-sm` (and icon `text-sm → text-base`) for two steps larger, per design system.
- **Card Draw Engines Attribution & Ability Parent Resolution**: Resolved MTGA `ZoneTransfer` draw triggers (e.g. *Feather of Flight*, *The Ten Rings*, *Thought Monitor*, *Aether Spellbomb*) where draw events reference ephemeral ability instances rather than source cards. `parser.rs` and `MatchAssembler` now track ability parentage via `parentId`, `AnnotationType_AbilityInstanceCreated`, and `AnnotationType_AbilityInstanceDeleted`.
- **Card Draw Engines Persistence & Startup Protection**: Fixed startup database cleanup query in `db.rs` to ensure cards with `cards_drawn > 0` and 0 damage are never pruned on restart, and enabled additive, idempotent historical log backfill.
- **SQLite Concurrency & Busy Timeout**: Added 10s pool acquire timeout, `PRAGMA busy_timeout = 5000;`, `PRAGMA journal_mode = WAL;`, and `PRAGMA synchronous = NORMAL;` to eliminate "database is locked (code 5)" errors during startup when the log tailer and UI query concurrently.
- **Tooling**: Added `.prettierrc` (`singleQuote:true, printWidth:120`) + `.prettierignore` per contributor suggestion on #9 to prevent future formatting churn.

---

## [1.3.0] - 2026-08-26

### 🎨 Complete Modern MTG Visual Overhaul, Tabbed Settings & Inspector Workspaces

This major feature release overhauls Rhystic Tracker's user interface with an authentic Magic: The Gathering aesthetic. The design replaces rounded borders with sharp geometry, authentic MTG typography, official Mana/Keyrune iconography, and a modernized categorized Settings system alongside expanded floating Inspector workspaces.

---

### 🌟 Added & Enhanced

- **Authentic MTG Visual Design System**:
  - Replaced generic rounded pill corners (`rounded-xl`, `rounded-full`) with sharp, high-contrast dark fantasy geometry (`rounded-none`).
  - Integrated authentic typography: **Beleren Bold** for headers/titles, **Plantin MTG** for flavor/body text, and monospace numerals for metrics.
  - Upgraded icons across the entire application to the authentic MTG Mana & Ability icon font set (`ms-ability-*`, `ms-mana-*`, `ms-battle`, `ms-library`).
  - Replaced high-fluorescence badges and bars with muted, refined color schemes.

- **Tabbed Settings Architecture**:
  - Rebuilt the settings screen into 5 organized top tabs:
    1. **General & Behavior**: Tray minimize behavior, Live Match HUD auto-switch, default startup view selector, setup wizard launcher, and new **Confirm Deck Delete** safety toggle.
    2. **Appearance & Themes**: 5-Color Mana Theme engine (White, Blue, Black, Red, Green) with active preview cards, collection default sort selector, and **Compact Card Preview** toggle.
    3. **MTGA Connection**: Active `Player.log` path picker, live engine status tailer badge, and multi-prefix auto-detection for Steam Proton, Lutris, Wine, and native installations.
    4. **Storage & Database**: Real-time SQLite storage metrics, one-click database backup export, local image cache metrics, pre-download collection art, and card universe synchronization.
    5. **About & Legal**: Version metadata, engine specs, Fan Content Policy disclosures, and Scryfall attributions.

- **Expanded Floating Inspector Workspaces**:
  - **Deck Inspector**: Enlarged workspace to `95vw × 97vh` (`max-w-[1520px] max-h-[1150px]`). Eliminated dark boxed enclosures for Mana Pie, Mana Value histogram, Card Types, and stats sidebar into floating cards. Aligned Mana Pie slice colors directly to MTG mana pips.
  - **Match Inspector**: Expanded dimensions to `95vw × 97vh`. Floating match specs sidebar and modernized sharp MVP honors shelf.
  - **Card Breakdown & Match Timeline**: Completely modernized with sharp event blocks, opening hand pre-game cards, and crisp action tags (`Play`, `Draw`, `Mulligan`, `Bottom`, `Dies`, `Exile`).

- **Card Library Calibrated 4×3 Grid**:
  - Calibrated large preview cards to `260px × 363px` strictly preserving the physical 63mm : 88mm MTG card aspect ratio.
  - Fits a clean **4 columns × 3 rows** (12 cards per page) without side padding dead-zones.

- **Dashboard & Leaderboards Refinements**:
  - Streamlined mini leaderboard headers to full-width titles while preserving descriptive lore in the expanded **Top 25** modal dialog.
  - Upgraded Dashboard Format Breakdown to a dedicated 3-column × 2-row grid with formatted `[Count] games - WR: [XX]%` summaries.
  - Expanded Recent Matches capacity to 10 matches with compact rows.

---

## [1.2.3] - 2026-08-25

### 🏆 Deck Format Badges, Non-Commander Fix, Executioner & Over-Killer Tombstone Redesign

This release addresses live playtesting enhancements across the Deck Viewer and Achievement engines:

---

### 🌟 Added & Enhanced

- **Deck Viewer Non-Commander Cleanup**:
  - Fixed an issue where non-Brawl/Standard 60-card decks would retain and display cached commander artwork and header widgets from previous Brawl matches.
  - Automatically nullified `hero_commander_id` for historical non-Brawl match records.

- **Verified Format Badges**:
  - Dynamically renders verified format badges (primary format highlighted in amber, secondary formats in subtle pills) directly underneath the deck title in the Deck Inspector based on actual match history.

- **Executioner Individual Strike Calculation**:
  - Fixed multi-attacker combat evaluation so that lethal hits are evaluated based on each creature's individual damage output ($M \ge 15 \to \text{Gold}$, $8 \le M < 15 \to \text{Silver}$, $1 \le M < 8 \to \text{Bronze}$) rather than opponent pre-combat health.

- **Redesigned Over-Killer SVG Badges (Tombstone Grave)**:
  - Redesigned the Over-Killer emblem across all shield tiers (Bronze, Silver, Gold) with an engraved `XXXX` stone headstone, earthen mound, and sprouting grass blades.

- **Over-Killer Excess Overkill Math**:
  - Updated Over-Killer achievement criteria to evaluate individual excess overkill thresholds ($M - L_{\text{before}} \ge 7 \to \text{Bronze}$, $\ge 10 \to \text{Silver}$, $\ge 15 \to \text{Gold}$), ensuring the winning creature single-handedly accounts for the excess negative life.

- **Card Art in Achievements Modal**:
  - Integrated local-cached art-crop thumbnails directly to the left of each card name in the Deck Card Achievements drill-down modal.

---

## [1.2.2] - 2026-08-24

### 🔄 Automatic True Decklist Capture, UUID Synchronization & Collection Sync

This release fundamentally modernizes Rhystic Tracker's deck and collection ingestion systems. True Decklists are now generated automatically in real time directly from the MTGA client stream without requiring manual clipboard imports. Persistent MTGA deck UUID tracking seamlessly handles in-game deck modifications and renames, instantly synchronizing deck records and migrating historical match statistics.

---

### 🌟 Added & Enhanced

- **Automatic True Decklist Capture**:
  - Automatically captures the 100% complete, genuine decklist when a match begins or when navigating decks in MTGA.
  - Automatically includes the **Commander** card in the canonical decklist (e.g. 99 maindeck cards + 1 Commander in Brawl = full 100-card decklist), rendering the dedicated top-left `COMMANDER (1)` header block in the Deck Inspector.
  - Automatically updates and verified-caps your **Collection Library** (up to playset cap 4) for every card contained in the submitted deck.

- **Persistent MTGA UUID Synchronization & Auto-Rename**:
  - Tracks MTGA's persistent `DeckId` UUID across deck submissions and catalog broadcasts.
  - Modifying cards in MTGA updates the existing True Decklist in place without losing match history.
  - Renaming a deck inside MTGA automatically renames the deck in your **Deck Library** and seamlessly migrates all past matches, win rates, and game stats to the new name without creating duplicate entries.
  - Startup migration automatically backfills UUIDs and consolidates any legacy renamed decks.

- **Real-Time Deck Library Invalidation**:
  - Live frontend reactivity triggers instant `loadDeckOverview()` queries upon match completion and whenever switching to the **Deck Library** tab, eliminating the need for app restarts.

- **Action Feed Mulligan & Bottom Badges**:
  - Added dedicated styling and badge chips in the Match Play Timeline for `mulligan` (amber badge) and `bottom` (orange badge) actions, ensuring opening hand mulligan actions are distinct from standard in-game card plays.

- **Card Draw Engine Leaderboard Fix**:
  - Resolved ability object resolution in the database to map source card GrpIds (`objectSourceGrpId`) rather than internal trigger ability IDs, ensuring all card draw engines and battlefield stalwarts accurately display their authentic card names on the leaderboard.

---

## [1.2.1] - 2026-08-24

### 🎯 Leaderboard Expansions & Hall of Fame Refinements

This release expands the Leaderboards view into a comprehensive 3×3 grid across Combat Damage, Non-Combat Damage, and Honors & Mastery with the addition of Card Draw Engines and Battlefield Stalwarts. It introduces a full-height centered pop-out modal displaying up to 25 cards with live search filtering, enlarged top-3 card typography with relocated mana costs and gold styling on rank 1, electric blue and yellow search highlights, and achievement earned dates across decorated card rosters.

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
