# Rhystic Tracker — Official User Manual & Setup Guide

Welcome to the comprehensive guide for **Rhystic Tracker v1.0.1**. This document explains how Rhystic Tracker functions, how to configure your Linux environment, how to utilize every feature, and how to troubleshoot common questions.

---

## Table of Contents

1. [How Rhystic Tracker Works](#1-how-rhystic-tracker-works)
2. [MTG Arena Game Configuration](#2-mtg-arena-game-configuration)
3. [Linux Setup & Log Discovery](#3-linux-setup--log-discovery)
   - [Steam Proton (Native & Mounted Libraries)](#steam-proton-native--mounted-libraries)
   - [Lutris, Bottles, and Heroic Games Launcher](#lutris-bottles-and-heroic-games-launcher)
   - [Manual Path Overrides](#manual-path-overrides)
4. [Desktop Integration & Launcher Setup](#4-desktop-integration--launcher-setup)
5. [Feature Guide](#5-feature-guide)
   - [Dashboard](#dashboard)
   - [Live Match HUD & Real-Time Combat Feed](#live-match-hud--real-time-combat-feed)
   - [Full Match Inspector & Turn Playback](#full-match-inspector--turn-playback)
   - [Lifetime Card Combat Analytics](#lifetime-card-combat-analytics)
   - [Deck Library & True Decklist Management](#deck-library--true-decklist-management)
   - [Card Library & Scryfall Viewer](#card-library--scryfall-viewer)
   - [Theming Engine](#theming-engine)
6. [Data Storage & Privacy](#6-data-storage--privacy)
7. [Frequently Asked Questions (FAQ)](#7-frequently-asked-questions-faq)

---

## 1. How Rhystic Tracker Works

Rhystic Tracker is an **out-of-process, non-intrusive, read-only** log parser. It does not inject memory into MTG Arena or alter game files in any way.

When MTG Arena runs with detailed logging enabled, it continuously writes game engine messages (zone changes, game state objects, life events, damage annotations) into `Player.log`. Rhystic Tracker's asynchronous Rust backend monitors this file, parses the events, attributes damages and card ownership, and commits the records into a fast local SQLite database (`~/.config/rhystic-tracker/rhystic.db`).

---

## 2. MTG Arena Game Configuration

For MTG Arena to output complete match records, detailed logs must be enabled:

1. Launch **Magic: The Gathering Arena**.
2. Click the **Gear Icon** in the top-right corner to open **Options**.
3. Under the **Account** tab (bottom left of the settings screen), look for **"Detailed Logs (Plugin Support)"**.
4. Check the box to enable it.
5. **Restart MTG Arena**.

> 💡 **Note:** If detailed logging is off, `Player.log` will only contain basic startup information and will not output combat or game actions.

---

## 3. Linux Setup & Log Discovery

Rhystic Tracker features an intelligent auto-discovery engine that scans your system upon launch.

### Steam Proton (Native & Mounted Libraries)
If you play MTGA via Steam on Linux / Steam Deck:
- Rhystic Tracker automatically checks:
  - `~/.local/share/Steam/steamapps/compatdata/2141910/pfx/drive_c/users/.../AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log`
  - `~/.steam/steam/steamapps/compatdata/...`
  - Any external mounted Steam library folders under `/mnt/*/SteamLibrary/steamapps/compatdata/...`

### Lutris, Bottles, and Heroic Games Launcher
If you run MTGA through standalone Wine, Lutris, or Bottles:
- Standalone Wine paths under `~/.wine/drive_c/users/...` are scanned automatically.
- For custom prefixes (e.g. Lutris or Bottles runners), you can specify your log location using an environment variable.

### Manual Path Overrides
If your `Player.log` is located in a custom path, you can launch Rhystic Tracker with the `RHYSTIC_MTGA_LOG` environment variable:

```bash
RHYSTIC_MTGA_LOG="/path/to/your/prefix/drive_c/users/youruser/AppData/LocalLow/Wizards Of The Coast/MTGA/Player.log" rhystic-tracker
```

You can also point Rhystic Tracker to a custom raw card database cache if needed:
```bash
RHYSTIC_MTGA_RAW_DIR="/path/to/Raw/Card/Database" rhystic-tracker
```

---

## 4. Desktop Integration & Launcher Setup

### Option A: Pre-built Release (Fastest)

1. Download `rhystic-tracker-v1.0.0-rc1-linux-x86_64.tar.gz` from the [GitHub Releases](https://github.com/Balthazzahr/Rhystic-Tracker/releases).
2. Extract the archive and run the installer:
   ```bash
   tar -xzf rhystic-tracker-v1.0.0-rc1-linux-x86_64.tar.gz
   cd rhystic-tracker-v1.0.0-rc1
   ./install.sh
   ```

### Option B: Building from Source

If compiling from source on your distribution:

**Install Build Prerequisites:**
- **Debian / Ubuntu / Pop!_OS / Linux Mint:**
  ```bash
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file libssl-dev libjavascriptcoregtk-4.1-dev nodejs npm
  ```
- **Arch Linux / Omarchy / Manjaro:**
  ```bash
  sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget openssl appmenu-gtk-module libappindicator-gtk3 librsvg nodejs npm
  ```
- **Fedora / RHEL:**
  ```bash
  sudo dnf install -y webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel openssl-devel @development-tools nodejs npm
  ```

**Build & Install:**
```bash
git clone https://github.com/Balthazzahr/Rhystic-Tracker.git
cd Rhystic-Tracker
npm install
npm run build:app
./install.sh
```

### What `install.sh` Does:
1. Installs the release binary into `~/.local/bin/rhystic-tracker`.
2. Installs the high-resolution application icon into `~/.local/share/icons/hicolor/512x512/apps/rhystic-tracker.png`.
3. Creates a valid XDG `.desktop` file in `~/.local/share/applications/rhystic-tracker.desktop`.
4. Sets `GDK_BACKEND=x11` and `WEBKIT_DISABLE_COMPOSITING_MODE=1` in the desktop launcher so the app works correctly on both X11 and Wayland sessions (via XWayland).
5. Refreshes desktop and icon cache databases.

You will now find **Rhystic Tracker** in your application launcher (e.g., **Pop Launcher**, **COSMIC**, **GNOME**, **KDE Plasma**, **Rofi**, **Wofi**, **KRunner**).

### Wayland / Steam Deck Note

Rhystic Tracker requires **X11** or **XWayland** to render its WebKitGTK window. The desktop launcher installed by `install.sh` automatically sets `GDK_BACKEND=x11`, so it works on both X11 and Wayland sessions out of the box.

If you launch the binary directly from a terminal on a Wayland-only session (e.g., Steam Deck in Gaming Mode, or a pure Wayland GNOME/KDE session), prepend the environment variable:

```bash
GDK_BACKEND=x11 rhystic-tracker
```

### Uninstalling

To remove Rhystic Tracker from your system:

```bash
rm ~/.local/bin/rhystic-tracker \
   ~/.local/share/applications/rhystic-tracker.desktop \
   ~/.local/share/icons/hicolor/512x512/apps/rhystic-tracker.png
```

Your match data in `~/.config/rhystic-tracker/rhystic.db` is preserved. To fully remove all data:

```bash
rm -rf ~/.config/rhystic-tracker
```

---

## 5. Feature Guide

### Dashboard
The **Dashboard** serves as your mission control, synthesizing daily performance, active win streaks, 5-day trending win rates, and daily match history.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="900" />
</p>

- **Win Rate & Streak**: Displays today's match record, current win/loss streak, and all-time record.
- **5-Day Trend Chart**: Visualizes recent win percentage momentum across your matches.
- **Recent Matches**: Chronological grouping of recent matches with quick result badges (`VICTORY` / `DEFEAT`).
- **Deck Spotlight**: Displays quick-launch stats for your most active decks.

---

### Live Match HUD & Real-Time Combat Feed
While in an active match, click **Live Match HUD** in the left sidebar (the menu icon pulses bright orange when a game is in progress).

<p align="center">
  <img src="docs/screenshots/live_hud.png" alt="Live Match HUD" width="900" />
</p>

- **Commander & Identity**: Shows both players' commanders and deck colors.
- **Live Action Feed**: Displays real-time entries:
  - 📥 `[DRAW]`: Cards drawn into hand.
  - 🟢 `[PLAY]`: Spells cast and permanents played.
  - 🪙 `[TOKEN]`: Tokens generated on the battlefield (e.g., *Treasure*, *1/1 Goblin*).
  - 💀 `[DIES]`: Permanents destroyed or sent to the graveyard.
  - 🌀 `[EXILE]`: Permanents exiled from the battlefield.
  - 💥 `[X DMG]`: Precise combat and spell damage dealt with source and target attributions.
  - ❤️ `[LIFE +/-X]`: Dynamic life total changes.

---

### Match History & Full Match Inspector
Clicking any match in the Dashboard, Match History, Deck detail, or Head-to-Head modal opens the comprehensive **Full Match Inspector**.

<p align="center">
  <img src="docs/screenshots/match_history.png" alt="Match History Table" width="900" />
</p>

The inspector provides two views:
1. **Cards Logged View**: Breakdown of all cards played or seen during the match, with player/opponent attribution and damage metrics.
2. **Match Play Timeline**: Turn-by-turn playback of every card drawn, played, damaged, or removed.

| Cards Logged View | Match Play Timeline |
| :---: | :---: |
| ![Cards Logged](docs/screenshots/match_inspector_cards.png) | ![Match Timeline](docs/screenshots/match_inspector_timeline.png) |

---

### Deck Library & True Decklist Management
The **Deck Library** tracks every deck you've played in MTGA, with true decklist import, format legitimacy verification, and customizable card size views.

<p align="center">
  <img src="docs/screenshots/deck_library.png" alt="Deck Library" width="900" />
</p>

- **True Decklists**: Import your exact 60-card / 100-card decklists directly using the MTGA export format (`.txt` or clipboard).
- **Legitimacy Verification**: Rhystic Tracker filters out preset and starter decks to prevent skewed collection or archetype analytics.
- **Deck Inspector Modal**: Inspect deck composition, mana curve, colors, and match history.

<p align="center">
  <img src="docs/screenshots/deck_inspector.png" alt="Deck Inspector" width="900" />
</p>

---

### Card Library & Persistent Combat Analytics
The **Card Library** gives you an interactive visual explorer paired with a 3-panel **Card Inspector** that tracks lifetime combat statistics for every card you play.

<p align="center">
  <img src="docs/screenshots/card_library.png" alt="Card Library" width="900" />
</p>

#### How Collection Ownership & Card Tracking Works
In earlier versions of Magic: The Gathering Arena, third-party companion tools could poll the client log for a player's complete inventory dump. However, recent client updates have restricted and removed general raw collection export from `Player.log`.

To maintain **100% data integrity**, Rhystic Tracker implements the following architecture:
1. **True Decklist Import**: The primary, guaranteed method to register cards into your permanent Collection is via the **Import True Decklist** feature in the Deck Library. When you import your decklists (using the standard MTGA `.txt` or clipboard export), Rhystic Tracker registers exact copies, card titles, and set printings into your local database.
2. **Game Play vs Owned Integrity (Theft & Copy Protection)**: Every card cast in a match is logged by the engine. However, cards created in-game via **token generators, clone/copy mechanics (e.g., *Spark Double*), conjure, heist, or card-theft effects (e.g., *Gonti*, *Thief of Sanity*, *Ragavan*)** are not real collection cards. By strictly deriving owned inventory from verified True Decklists, Rhystic Tracker guarantees that borrowed or generated spells never artificially pollute your genuine collection stats.
3. **Card Analytics Hub**: The Card Library is designed as an accessible combat analytics hub for the cards you own and play. Every card displays how often you've cast it across your decks, its win rate impact, and its direct combat potency. If Wizards of the Coast re-enables full client inventory dumps in future log updates, Rhystic Tracker is architected to automatically ingest full collection dumps seamlessly.

#### 3-Panel Card Inspector & Analytics
- **Panel 1 (Left)**: High-definition 450px card artwork with card style / printing selector.
- **Panel 2 (Middle)**: Card metadata, rarity, deck inclusion list, and Scryfall oracle & flavor text.
- **Panel 3 (Right)**: **Card Combat Analytics**:
  - Total matches played and win rate when cast.
  - Total damage dealt with **Face (Player)** vs **Permanents** split bar.
  - **Combat Damage** vs **Spell / Ability Damage** classification.
  - **Turn Cast Frequency Histogram** (mapped to player round turns).
  - **MVP Deck Attribution**.

<p align="center">
  <img src="docs/screenshots/card_inspector.png" alt="Card Inspector" width="900" />
</p>

---

### Theming Engine
Customize the application with five curated Magic color-identity themes:
- ⚪ **White (Plains)**: Solar gold and marble accents.
- 🔵 **Blue (Island)**: Cerulean and deep indigo tones.
- ⚫ **Black (Swamp)**: Onyx and dark obsidian styling.
- 🔴 **Red (Mountain)**: Fiery ember and crimson styling.
- 🟢 **Green (Forest)**: Emerald and forest leaf styling.

---

## 6. Data Storage & Privacy

All Rhystic Tracker data is stored **100% locally on your machine**:
- **Database**: `~/.config/rhystic-tracker/rhystic.db` (SQLite)
- **Settings & Theme**: Stored in `localStorage` inside the local webview.
- **No Telemetry / No Cloud**: Your match records, decklists, and game logs are never uploaded to any remote server.

---

## 7. Frequently Asked Questions (FAQ)

#### Q: The Live Match HUD is not showing anything during my game.
1. Make sure you enabled **"Detailed Logs (Plugin Support)"** in MTGA settings and restarted the game.
2. Verify that MTGA is writing to `Player.log`. If you are using a non-standard Wine prefix or flatpak, launch Rhystic Tracker with `RHYSTIC_MTGA_LOG=/path/to/Player.log rhystic-tracker`.

#### Q: How do I backup my match data?
Simply copy the `~/.config/rhystic-tracker/rhystic.db` file to a safe backup location.

#### Q: Can I run Rhystic Tracker on Steam Deck?
Yes! Rhystic Tracker works natively on Steam Deck in Desktop Mode or added as a non-Steam game. The installer sets `GDK_BACKEND=x11` automatically, so it runs correctly via XWayland. If launching from a terminal instead, use `GDK_BACKEND=x11 rhystic-tracker`.

#### Q: The app shows a blank or black screen on Wayland.
Rhystic Tracker requires X11 or XWayland. If the desktop launcher doesn't set `GDK_BACKEND=x11` (e.g., you copied the binary manually), launch with:
```bash
GDK_BACKEND=x11 rhystic-tracker
```
