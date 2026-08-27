# Rhystic Tracker — Official User Manual & Setup Guide

Welcome to the comprehensive user manual and setup guide for **Rhystic Tracker v1.3.2**. This document explains how Rhystic Tracker operates under the hood, how to configure your Linux or macOS environment, how to use every feature and analytical tool, and how to troubleshoot common questions.

---

## Table of Contents

1. [How Rhystic Tracker Works](#1-how-rhystic-tracker-works)
2. [MTG Arena Game Configuration](#2-mtg-arena-game-configuration)
3. [Platform Setup & Dynamic Log Discovery](#3-platform-setup--dynamic-log-discovery)
   - [Linux: Steam Proton (Native & Mounted Libraries)](#linux-steam-proton-native--mounted-libraries)
   - [Linux: Lutris, Bottles, and Heroic Games Launcher](#linux-lutris-bottles-and-heroic-games-launcher)
   - [macOS: Native Discovery & Wine Wrappers](#macos-native-discovery--wine-wrappers)
   - [Manual Path & Environment Overrides](#manual-path--environment-overrides)
4. [First-Time Setup Wizard & Card DB Sync](#4-first-time-setup-wizard--card-db-sync)
   - [The 3-Step Onboarding Wizard](#the-3-step-onboarding-wizard)
   - [High-Speed Startup Card Database Sync](#high-speed-startup-card-database-sync)
   - [Re-Running Setup Wizard & Manual Re-Syncing](#re-running-setup-wizard--manual-re-syncing)
5. [Desktop Integration & Dual Environments](#5-desktop-integration--dual-environments)
   - [Automated Web & Local Installer (`install.sh`)](#automated-web--local-installer-installsh)
   - [Wayland, XWayland, and Steam Deck Guidelines](#wayland-xwayland-and-steam-deck-guidelines)
   - [Dual-Environment Architecture (Test vs. Production)](#dual-environment-architecture-test-vs-production)
6. [Feature Guide](#6-feature-guide)
   - [Global Card Achievements & Trophy Case](#global-card-achievements--trophy-case)
   - [All-Time Leaderboards & Hall of Fame](#all-time-leaderboards--hall-of-fame)
   - [Dashboard & Time-Series Win Rate Analytics](#dashboard--time-series-win-rate-analytics)
   - [Comprehensive MTGA Formats Coverage](#comprehensive-mtga-formats-coverage)
   - [Mulligan Tracking & Opening Phase Replay](#mulligan-tracking--opening-phase-replay)
   - [Live Match HUD & Real-Time Combat Feed](#live-match-hud--real-time-combat-feed)
   - [Match History & Full Match Inspector](#match-history--full-match-inspector)
   - [Deck Library, 3-Column Inspector & True Decklists](#deck-library-3-column-inspector--true-decklists)
   - [Card Library, Dual Art Modes & Diamond Ownership](#card-library-dual-art-modes--diamond-ownership)
   - [Settings & Configuration Control Panel](#settings--configuration-control-panel)
   - [Theming Engine](#theming-engine)
7. [Data Storage & Privacy](#7-data-storage--privacy)
8. [Frequently Asked Questions (FAQ)](#8-frequently-asked-questions-faq)

---

## 1. How Rhystic Tracker Works

Rhystic Tracker is an **out-of-process, non-intrusive, read-only** log parser and combat analytics engine. It does not inject into MTG Arena memory, alter game binaries, or intercept network packets.

```
┌─────────────────┐
│ MTGA Player.log │
└────────┬────────┘
         │ (1) Asynchronous append monitoring (inotify / polling)
         ▼
┌─────────────────┐
│   FileTailer    │ Reads new bytes, buffers lines, tracks file rotations
└────────┬────────┘
         │ (2) mpsc::channel<TailerEvent::Line>
         ▼
┌─────────────────┐
│     Parser      │ Extracts GRE engine messages, life totals, zone transfers,
│                 │ damage events, and deck submissions (EventSetDeckV3)
└────────┬────────┘
         │ (3) ParsedEvent stream
         ▼
┌─────────────────┐
│ MatchAssembler  │ State machine attributing combat damage, hero/opponent seats,
│                 │ turn progression, and deck legitimacy
└────────┬────────┘
         │ (4) Match records & turn events
         ▼
┌─────────────────┐
│ SQLite Database │ Fast local queries in `~/.config/rhystic-tracker/rhystic.db`
└────────┬────────┘
         │ (5) Tauri v2 IPC commands & live state subscriptions
         ▼
┌─────────────────┐
│ React Frontend  │ Real-time HUD, interactive charts, virtualized card grids
└─────────────────┘
```

When MTG Arena runs with detailed logging enabled, it writes game rule engine (GRE) messages (zone transfers, game state changes, life swings, damage annotations) into `Player.log`. Rhystic Tracker's asynchronous Rust backend monitors this file, parses the events, attributes damages and card ownership, and commits the records into a local SQLite database (`~/.config/rhystic-tracker/rhystic.db`).

---

## 2. MTG Arena Game Configuration

For MTG Arena to output complete match records and combat details, detailed logs must be enabled in the game client:

1. Launch **Magic: The Gathering Arena**.
2. Click the **Gear Icon** in the top-right corner to open **Options**.
3. Under the **Account** tab (bottom left of the settings screen), locate **"Detailed Logs (Plugin Support)"**.
4. Check the box to enable it.
5. **Restart MTG Arena**.

> 💡 **Note:** If detailed logging is disabled, `Player.log` will only output basic startup information and will omit combat actions, card plays, and turn state transitions.

---

## 3. Linux Setup & Dynamic Log Discovery

Rhystic Tracker features an intelligent auto-discovery engine that dynamically locates both `Player.log` and the MTGA Raw Card Database without requiring hardcoded paths.

### Steam Proton (Native & Mounted Libraries)
If you run MTGA via Steam on Linux or Steam Deck:
- Rhystic Tracker automatically inspects:
  - `~/.local/share/Steam/steamapps/compatdata/2141910/pfx/drive_c/users/.../AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log`
  - `~/.steam/steam/steamapps/compatdata/2141910/...`
  - Any external mounted Steam library folders across all mount roots (e.g. `/mnt/*/SteamLibrary/steamapps/compatdata/...`, `/teradrive/...`, `/media/...`, `/run/media/*/*`).

### Lutris, Bottles, and Heroic Games Launcher
If you run MTGA through standalone Wine, Lutris, or Bottles:
- Common Lutris paths (`~/Games/mtga`, `~/Games/magic-the-gathering-arena`) and Bottles prefixes are scanned automatically.
- The raw card database path is dynamically inferred by walking up from the discovered `Player.log` directory to locate `Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw/`.

### Manual Path & Environment Overrides
If your setup uses an unconventional path, you can set the `RHYSTIC_MTGA_LOG` environment variable:

```bash
RHYSTIC_MTGA_LOG="/path/to/your/prefix/drive_c/users/youruser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log" rhystic-tracker
```

You can also point Rhystic Tracker to a custom raw card database cache if needed:
```bash
RHYSTIC_MTGA_RAW_DIR="/path/to/Raw/Card/Database" rhystic-tracker
```

### Environment Mode (`RHYSTIC_ENV`)
Standard builds of Rhystic Tracker read the `RHYSTIC_ENV` environment variable, defaulting to `development` (using `rhystic_dev.db`) when unset:
```bash
RHYSTIC_ENV=development rhystic-tracker
```
Release builds compiled with the `production-env` cargo feature (`cargo build --features production-env`) are always `production` (using `rhystic.db`) — this cannot be overridden at runtime.

---

## 4. First-Time Setup Wizard & Card DB Sync

### The 3-Step Onboarding Wizard
On fresh installations (or when the internal card database is unpopulated), Rhystic Tracker launches a 3-step setup wizard:

1. **Step 1 — Log File Discovery**: Automatically scans all Proton, Wine, Lutris, and Bottles prefixes, displaying the detected `Player.log` path with real-time validation and a reminder to enable MTGA Detailed Logging.
2. **Step 2 — Card Database Sync**: Scans MTGA's Raw Card Database and synchronizes all 26,000+ cards into the local SQLite cache (~150ms) with an animated progress indicator.
3. **Step 3 — Ready for Combat**: Confirms operational readiness and transitions seamlessly into the Dashboard.

### High-Speed Startup Card Database Sync
Whenever Rhystic Tracker starts, a background task automatically checks if `cards_cache` is populated. If empty or updated, all ~26,000+ cards are indexed in roughly ~150ms without blocking UI interaction or delaying app launch.

### Re-Running Setup Wizard & Manual Re-Syncing
You can re-verify your system configuration anytime from the **Settings** view:
- **Card Database Status**: Displays the exact indexed card count (e.g. `26,572 cards ready`).
- **Re-sync Cards Button**: 1-click manual re-indexing to ingest new MTGA card sets immediately after client updates.
- **Re-run Setup Wizard…**: Opens the onboarding wizard with an interactive safety confirmation modal (your match history and collection remain untouched).

---

## 5. Desktop Integration & Dual Environments

### Automated Web & Local Installer (`install.sh`)

#### Option A: One-Line Web Installer (Recommended)
```bash
curl -sSL https://raw.githubusercontent.com/Balthazzahr/Rhystic-Tracker/main/install.sh | bash
```
*(Or with `wget`: `wget -qO- https://raw.githubusercontent.com/Balthazzahr/Rhystic-Tracker/main/install.sh | bash`)*

#### Option B: Manual Release Archive
1. Download `rhystic-tracker-*.tar.gz` from [GitHub Releases](https://github.com/Balthazzahr/Rhystic-Tracker/releases/latest).
2. Extract the archive and execute `./install.sh`:
   ```bash
   tar -xzf rhystic-tracker-*.tar.gz
   cd rhystic-tracker-*/
   ./install.sh
   ```

#### What `install.sh` Does:
1. Copies the release binary to `~/.local/bin/rhystic-tracker`.
2. Installs high-resolution app icons into `~/.local/share/icons/hicolor/512x512/apps/rhystic-tracker.png`.
3. Generates the XDG desktop entry in `~/.local/share/applications/rhystic-tracker.desktop` with `GDK_BACKEND=x11` and `WEBKIT_DISABLE_COMPOSITING_MODE=1` flags.
4. Refreshes system desktop and icon databases so Rhystic Tracker appears immediately in your application launcher (**GNOME**, **Pop Launcher**, **COSMIC**, **KDE Plasma**, **Rofi**, **Wofi**).

### macOS Installation & Gatekeeper Setup

#### Installing the DMG:
1. Download `rhystic-tracker-macos-universal.dmg` from [GitHub Releases](https://github.com/Balthazzahr/Rhystic-Tracker/releases/latest).
2. Open the `.dmg` file and drag **Rhystic Tracker** to your **Applications** folder.

#### Opening the App (Bypassing Gatekeeper):
Because Rhystic Tracker is an independent open-source project without a paid Apple Developer certificate, Apple Gatekeeper blocks opening on first launch with a *"cannot verify the developer / source"* notice.

To open on first launch:
- **Option 1 (Right-Click Open - Recommended)**: In Finder, open your **Applications** folder, **Right-click** (or hold <kbd>Control</kbd> and click) **Rhystic Tracker**, and select **Open**. Click **Open** in the confirmation dialog. macOS will remember this and allow standard launches going forward.
- **Option 2 (System Settings)**: Open **System Settings** → **Privacy & Security**, scroll down to the **Security** section, and click **"Open Anyway"** next to Rhystic Tracker.
- **Option 3 (Terminal)**:
  ```bash
  xattr -d com.apple.quarantine /Applications/Rhystic\ Tracker.app
  ```

### Wayland, XWayland, and Steam Deck Guidelines

Rhystic Tracker uses WebKitGTK with hardware-accelerated rendering. The launcher configured by `install.sh` automatically includes `GDK_BACKEND=x11`, which runs smoothly on both native X11 sessions and Wayland sessions (via XWayland).

If launching directly from a terminal in a pure Wayland environment (e.g. Steam Deck Desktop Mode or terminal testing), launch with:
```bash
GDK_BACKEND=x11 rhystic-tracker
```

### Dual-Environment Architecture (Test vs. Production)

To safeguard your daily match history and collection, Rhystic Tracker uses strict environment isolation:

| Environment | Launcher | Database | App Icon | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **🚀 Production** | `./launch.sh` / Desktop App | `~/.config/rhystic-tracker/rhystic.db` | Standard Quill Logo | Daily driver companion for active MTGA gameplay |
| **🧪 Test / Dev** | `./launch-test.sh` | `~/.config/rhystic-tracker/rhystic_dev.db` | Witch's Hat Badge | Development, bug verification, and layout testing |

> 🛡️ **Auto-Snapshotting**: Whenever `./launch-test.sh` runs, it automatically takes a fresh snapshot of `rhystic.db` $\rightarrow$ `rhystic_dev.db`. You can test new builds against real match data without any risk of corrupting production records.

---

## 6. Feature Guide

### Global Card Achievements & Trophy Case

The **Achievements** view transforms your match history into an interactive trophy case, celebrating epic combat feats, lethal strikes, massive token swarms, and card draw milestones.

<p align="center">
  <img src="screenshots/v13%20Achievments.png" alt="Achievements Trophy Case" width="900" />
</p>

#### 21 Custom Vector Badges Across 7 Categories
Every achievement represents a distinct gameplay feat across 7 MTG disciplines:
- 🥊 **Combat**: *Haymaker* (single-hit blow), *Juggernaut* (total match damage), *Royal Assassin* (creature destruction in combat).
- 🛡️ **Defense**: *Ironclad* (blocking lethal attacks), *Stalwart* (damage absorbed across match).
- 🔮 **Arcane Devastation / Spells**: *Cataclysm* (board wipe devastation), *Executioner* (lethal spell strikes), *Sweeper* (multi-target removal).
- ⚔️ **Counters & P/T Growth**: *Hardened* (+1/+1 counter accumulation), *Ozolithic!* (massive single-turn counter surge).
- 🌾 **Ramp & Mana**: *Mana Dynamo* (huge mana generation turns), *Blinkmaster* (flicker & enter-the-battlefield triggers).
- 👥 **Tokens & Swarm**: *Swarmer* (creature tokens created), *Cat Burglar* (graveyard theft & reanimation).
- 📜 **Card Advantage & Finishers**: *Rhystic Tracker* (cards drawn in single turn), *Scoop Inducer* (causing opponent concession), *Over-Killer* (massive overkill lethal damage).

#### Dynamic Tier Thresholds & Highest-Tier Display
- Each achievement features **Bronze**, **Silver**, and **Gold** progression tiers with objective, value-based $X+$ thresholds (e.g. `12+`, `18+`, `25+`).
- Trophy cards display the **highest tier achieved** (`Gold > Silver > Bronze`) along with the total lifetime awards won across all your matches.
- **Center-Out Symmetrical Clustering**: Square trophy cards (`330px × 330px`) cluster gracefully in the center of the screen, dynamically expanding to fill widescreen resolutions.
- **All-Time MVP Card**: Each trophy highlights the all-time MVP card that earned the badge most frequently, complete with its **Scryfall art crop thumbnail** and full untruncated name.
- **Drill-Down Inspection Modal**: Click any trophy to inspect every card that has earned it, view objective requirements, read flavor lore quotes, and click to inspect individual card stats. Press <kbd>Esc</kbd> or click the backdrop to close.

<p align="center">
  <img src="screenshots/v13%20AchievementsInspector.png" alt="Achievements Drill-Down Modal" width="900" />
</p>

---

### All-Time Leaderboards & Hall of Fame

The **Leaderboards** view showcases your MTG career's all-time greatest cards across a 3×3 matrix of Hall of Fame categories:

<p align="center">
  <img src="screenshots/v13%20Leaderboards.png" alt="All-Time Leaderboards" width="900" />
</p>

1. 🥊 **Highest Single-Hit Strike** (*Haymakers* — Most damage dealt in a single blow).
2. 🚂 **Total Match Damage** (*Juggernauts* — Cumulative match combat and spell damage).
3. 🌟 **Impactful Match MVPs** (*Key Game-Changers* — Most matches earning impactful status).
4. 🛡️ **Combat Heavyweights** (*Pure Attack Power* — Total damage dealt in combat phases).
5. 🔮 **Spell & Ability Nukes** (*Arcane Devastation* — Non-combat spell & trigger damage).
6. 👑 **Most Decorated Champions** (*Honor Titans* — Most lifetime achievement titles won).
7. 📜 **Card Draw Engines** (*Rhystic Masterminds* — Most cards drawn in a single turn).
8. 🏰 **Battlefield Stalwarts** (*Damage Absorbed* — Highest single-match damage survived).
9. 🩸 **Executioner Strikes** (*Lethal Precision* — Highest single lethal spell/ability strikes).

#### Podium Benchmark & Full-Spectrum Search
- **Top 3 Podium Styling**: Distinct visual treatment for 🥇 Gold Crown (#1), 🥈 Silver Medal (#2), and 🥉 Bronze Medal (#3).
- **Full 10-Card Dynamic Vertical Scaling**: Category cards expand to fill vertical window height with zero bottom gaps.
- **Global Search & Diff to Podium**: Search any card in your collection (e.g. *Craterhoof Behemoth*). If ranked outside the top 3, the card is displayed below the pinned Top 3 benchmark along with its true global rank (e.g. `#75`) and a dynamic **diff pill** indicating how far off it is from the #3 podium spot (e.g. `-18 to #3`).
- **Expanded Top 25 Dialog**: Maximize any category into a full-height pop-out showing up to 25 ranked cards with live in-category search.

---

### Dashboard & Time-Series Win Rate Analytics
The **Dashboard** serves as your mission control, synthesizing daily performance, active win streaks, multi-window win rate analytics, and match history.

<p align="center">
  <img src="screenshots/v13%20Dashboard.png" alt="Dashboard" width="900" />
</p>

#### Key Metrics & Streak Tracking
- **Record & Win Rate**: Real-time display of today's match record ($W - L$) and win percentage alongside your all-time career totals.
- **Dynamic Streak Counter**: Highlights active winning or losing streaks with contextual styling.

#### Time-Series Win Rate Graph
The overhauled trend graph combines volume histogram bars with rolling win rate momentum:
- **Time Window Selector**: Dark-themed styled dropdown supporting 5 distinct windows:
  - `Today`: Hourly win/loss distribution.
  - `Past 7 Days`: Daily win/loss volume with 7-day daily rolling win rate.
  - `Past 30 Days`: Daily win/loss volume with 30-day daily rolling win rate.
  - `Past 12 Months`: Week-by-week aggregated volume with 12-month weekly rolling trend.
  - `All Time`: Month-by-month aggregated volume with all-time monthly trend.
- **Dual-Colored 50% Threshold Trend Line**:
  - Displays vibrant green (`#22C55E`) when win rate is above $50\%$.
  - Displays vibrant red (`#EF4444`) when win rate is below $50\%$.
  - Transitions cleanly across the exact $50\%$ midline with a subtle blend.
- **Background Area Wash**: Subtle horizontal time-series shading beneath the curve matching the win status.
- **Outlined Histogram Bars**: Thin white borders around win and loss bars for clear visual separation.
- **Format Breakdown Matrix**: Clean 3-column × 2-row summary at the base of the dashboard displaying games played and individual format win rates.

---

### Comprehensive MTGA Formats Coverage

Rhystic Tracker provides native GRE parser categorization and database normalization across all **13 MTGA formats**:

| Format | Color Badge Accent | Commander Detection |
| :--- | :--- | :--- |
| **Standard** | Vibrant Amber | N/A |
| **Standard Brawl** | Cyan / Teal | Full Hero & Opponent Commander Resolution |
| **Brawl** | Cyan / Teal | Full Hero & Opponent Commander Resolution |
| **Alchemy** | Purple / Violet | N/A |
| **Historic** | Blue / Sapphire | N/A |
| **Timeless** | Emerald Green | N/A |
| **Explorer** | Orange / Copper | N/A |
| **Draft** | Gold / Bronze | N/A |
| **Sealed** | Indigo | N/A |
| **Bot Match (Sparky)** | Slate Grey | Automatic Selected Deck Fingerprint Resolution |
| **Direct Challenge** | Rose / Crimson | N/A |
| **Midweek Magic** | Yellow / Gold | N/A |
| **Gladiator** | Red / Ruby | N/A |

- **Dynamic Format Filter Dropdowns**: Available across the Dashboard and Match History, populating only formats present in your match database.
- **Bot Match Deck Resolution**: Automatically fingerprints Sparky and practice matches against internal deck catalogs to attribute your true deck name (e.g. `'MonoWhite - Auras (Standard)'`) instead of generic labels.

---

### Live Match HUD & Real-Time Combat Feed
While in an active match, click **Live Match HUD** in the left navigation sidebar (the sword icon pulses bright orange when a game is live).

<p align="center">
  <img src="screenshots/live_hud.png" alt="Live Match HUD" width="900" />
</p>

- **Commander & Color Identity**: Displays both players' commanders (for Brawl variants) and active color identities.
- **Live Action Feed**: Chronological stream of match events:
  - 📥 `[DRAW]`: Cards drawn into hand.
  - 🟢 `[PLAY]`: Spells cast and lands played.
  - 🪙 `[TOKEN]`: Tokens generated on the battlefield (e.g. *Treasure*, *1/1 Goblin*).
  - 💀 `[DIES]`: Permanents destroyed or placed in graveyard.
  - 🌀 `[EXILE]`: Permanents exiled from the battlefield.
  - 💥 `[X DMG]`: Granular combat and spell damage dealt with source and target attributions.
  - ❤️ `[LIFE +/-X]`: Dynamic life total changes.

---

### Match History & Full Match Inspector
Clicking any match in the Dashboard, Match History, Deck detail, or Head-to-Head modal opens the **Full Match Inspector**.

<p align="center">
  <img src="screenshots/v13%20MatchHistory.png" alt="Match History Table" width="900" />
</p>

#### Inspector Ergonomics
- **Dynamic Viewport Scaling**: Modals scale to **95% window width** ($95\text{vw}$) and **97% window height** ($97\text{vh}$) with symmetric buffers.
- **Universal Escape Key & Backdrop Dismissal**: Press <kbd>Esc</kbd> or click the darkened backdrop to immediately dismiss any open modal.

<p align="center">
  <img src="screenshots/v13%20MatchInspector.png" alt="Full Match Inspector Workspace" width="900" />
</p>

#### Inspector Views
1. **Cards Logged View**: Complete inventory of cards played or seen during the match, partitioned by hero vs opponent with damage contributions.
2. **Match Play Timeline**: Turn-by-turn combat replay showing every draw, play, attack, block, damage event, and removal with London mulligan tracking.

---

### Deck Library, 3-Column Inspector & True Decklists
The **Deck Library** tracks performance per deck, format legitimacy, automatic and manual True Decklist management, and real-time MTGA client synchronization.

<p align="center">
  <img src="screenshots/v13%20DeckLibrary.png" alt="Deck Library Grid View" width="900" />
</p>

<p align="center">
  <img src="screenshots/v13%20DeckLibraryTable.png" alt="Deck Library Table View" width="900" />
</p>

- **Automatic True Decklist Capture**:
  - **No Manual Import Required**: Whenever you start a match or view decks in MTGA, Rhystic Tracker automatically streams and stores the full, genuine decklist directly from the game's network payload into your local database (`source = 'auto'`).
  - **Full Commander Integration**: Brawl and Commander decks automatically synthesize the Commander card into the canonical 100-card decklist, rendering a dedicated top-left `COMMANDER (1)` header block above Creatures in the Deck Inspector.
  - **Manual Import / Export Still Available**: You can still import or export `.txt` decklists via clipboard anytime for offline deck planning.
- **Persistent MTGA UUID Synchronization & Auto-Rename**:
  - **Card Modifications**: Changing cards in MTGA immediately updates the stored True Decklist without disturbing historical match records.
  - **Deck Renaming**: Renaming a deck inside MTGA (e.g., from *"A Wizard Is Never Late"* to *"Fireworks in the Shire"*) automatically updates the deck's name in Rhystic Tracker and **seamlessly migrates all past matches, win rates, and game stats** over to the new name without creating duplicate entries.
- **Legitimacy Verification**: Rhystic Tracker automatically filters out preset and starter decks to prevent skewed collection and win-rate analytics.
- **Responsive 3-Column Decklist Expansion**:
  - Automatically organizes card types (*Creatures, Instants, Sorceries, Lands, Artifacts, Enchantments, Planeswalkers*) into **3 height-balanced columns** (`colA`, `colB`, `colC`) on wide screens.
  - Eliminates excessive scrolling for 60-card and 100-card Commander lists.
- **Floating Header Analytics**:
  - **Mana Distribution Pie Chart**: Distinct colored slices precisely matching authentic MTG mana pips without dark enclosures.
  - **Mana Value Curve Histogram**: Full-height histogram with centered translucent floating title badge (`MANA VALUE`).
  - **Card Types Breakdown Bars**: Visual proportional representation of deck makeup.

<p align="center">
  <img src="screenshots/v13%20DeckInspector.png" alt="Deck Inspector" width="900" />
</p>

---

### Card Library, Dual Art Modes & Real-Time Ownership Sync
The **Card Library** provides an interactive visual explorer paired with a 3-panel **Card Inspector** that tracks lifetime combat statistics.

<p align="center">
  <img src="screenshots/v13%20CardLibrary.png" alt="Card Library 4x3 Grid" width="900" />
</p>

#### How Collection Ownership Works
Because MTGA no longer dumps complete raw collections into `Player.log`, Rhystic Tracker maintains data integrity through:
1. **Automatic Deck Capture & True Decklists**: Genuine decklists played or imported in MTGA automatically register verified owned counts (up to playset cap 4) in your collection.
2. **Theft & Copy Protection**: Cards generated in-game via *tokens, copies, clones (e.g. Spark Double), conjure, heist, or theft effects (e.g. Gonti, Ragavan)* never falsely inflate your owned collection.
3. **Interactive 4-Diamond Ownership Selector**: Adjust owned copies directly in the card detail modal with instant persistence and real-time cross-view synchronization.

<p align="center">
  <img src="screenshots/v13%20CardInspector.png" alt="3-Panel Card Inspector" width="900" />
</p>

#### Dual Art Mode Viewers
Switch between two visual styles in the top toolbar:
- 🖼️ **Landscape Art Crop Mode (`<Image />`)**: Displays uncropped card illustrations in native widescreen aspect ratio with a top semi-transparent title and `<ManaPip />` mana cost bar.
- 🎴 **Portrait Full Card Mode (`<RectangleVertical />`)**: Displays classic complete card frames with oracle rules text in a calibrated 4×3 grid.

#### Persistent Alternate Set Printings
When inspecting any card, selecting an alternate set printing from the **Card Style / Set** dropdown immediately updates the main grid with the selected artwork and persists across sessions.

---

### Settings & Configuration Control Panel
The **Settings and Configuration** view is organized into 5 dedicated categorized tabs:

<p align="center">
  <img src="screenshots/v13%20Settings.png" alt="Tabbed Settings Control Panel" width="900" />
</p>

1. **General & Behavior**:
   - *Minimize to System Tray on Close*: Keep match tailing running silently in the background.
   - *Auto-Switch to Live Match HUD*: Automatically jump to the real-time match tracker when game start signals are detected.
   - *Confirm Before Deleting Decks*: Safety prompt prevention against accidental deck deletion.
   - *Default Startup Tab*: Choose which view opens on launch (Dashboard, Live Match HUD, Match History, Deck Library, Card Library, Achievements, Leaderboards).
   - *Setup Assistant*: Re-launch First-Time Setup Wizard.
2. **Appearance & Themes**:
   - *5-Color Mana Theme Selector*: Switch between White, Blue, Black, Red, and Green themes with live previews.
   - *Default Collection Sort Order*: Choose default card sorting (Release Date, Mana Value, Rarity, Alphabetical, Ownership Count).
   - *Compact Card Preview*: Toggle dense match breakdown cards.
3. **MTGA Connection**:
   - *MTGA Log Path Configuration*: Live discovery, direct manual path entry, file browsing, and validation of `Player.log`.
   - *Engine Status*: Real-time tailer activity indicator badge.
4. **Storage & Database**:
   - *Local Card Image Cache*: Real-time disk storage footprint, cached illustration count, Cache Clear, and Pre-download Collection Art tools.
   - *SQLite Database Diagnostics*: Total recorded matches, database file size, local file path, and 1-click **Backup / Export Database** snapshot action.
   - *MTGA Card Universe*: Indexed card counts, card database re-synchronization, and Scryfall set metadata catalog updater.
5. **About & Legal**:
   - Application versioning, engine stack specifications, Wizards of the Coast Fan Content Policy disclosures, and Scryfall attributions.

---

### Theming Engine
Customize the entire application interface with five curated Magic color-identity themes:
- ⚪ **White (Plains)**: Solar gold and marble accents.
- 🔵 **Blue (Island)**: Cerulean and deep indigo tones.
- ⚫ **Black (Swamp)**: Onyx and dark obsidian styling.
- 🔴 **Red (Mountain)**: Fiery ember and crimson styling.
- 🟢 **Green (Forest)**: Emerald and forest leaf styling.

---

## 7. Data Storage & Privacy

All Rhystic Tracker data is stored **100% locally on your machine**:
- **Database**: `~/.config/rhystic-tracker/rhystic.db` (SQLite)
- **Settings & Theme**: Stored locally in `localStorage` inside the webview.
- **Image Cache**: Cached offline under `~/.config/rhystic-tracker/cardimg/`.
- **Zero Telemetry**: Your match records, decklists, and game logs are never uploaded to any remote server or cloud account.

---

## 8. Frequently Asked Questions (FAQ)

#### Q: The Live Match HUD is not showing anything during my game.
1. Make sure you enabled **"Detailed Logs (Plugin Support)"** in MTGA settings and restarted MTGA.
2. Verify that MTGA is writing to `Player.log`. In Settings, check that the log path indicator shows a green checkmark.
3. If using an unusual Wine prefix or flatpak, launch Rhystic Tracker with `RHYSTIC_MTGA_LOG=/path/to/Player.log rhystic-tracker`.

#### Q: How do I backup or transfer my match history to another machine?
In **Settings**, under **Database & Storage Management**, click **Backup / Export Database**. This opens a native file dialog allowing you to save an exact copy of your SQLite database anywhere. You can restore it on another machine by placing it into `~/.config/rhystic-tracker/rhystic.db`.

#### Q: Can I run Rhystic Tracker on Steam Deck?
Yes! Rhystic Tracker runs smoothly on Steam Deck in Desktop Mode or added as a non-Steam game. The installer sets `GDK_BACKEND=x11` automatically, so it runs correctly via XWayland.

#### Q: Why are some cards showing up as "Unknown Card" or missing images?
Click **Settings** $\rightarrow$ **Re-sync Cards** to index all MTGA raw database cards. If card artwork hasn't loaded yet, make sure you have an internet connection for Scryfall artwork caching, or click **Pre-download Collection Art** in Settings.

#### Q: The app shows a blank or black window on Wayland.
Rhystic Tracker requires X11 or XWayland. If you launched the binary directly without the desktop launcher, prepend the environment flag:
```bash
GDK_BACKEND=x11 rhystic-tracker
```

