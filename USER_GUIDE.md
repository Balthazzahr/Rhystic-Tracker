# Rhystic Tracker — Official User Manual & Setup Guide

Welcome to the comprehensive guide for **Rhystic Tracker v1.0.0-rc1**. This document explains how Rhystic Tracker functions, how to configure your Linux environment, how to utilize every feature, and how to troubleshoot common questions.

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
   - [Executive Dashboard](#executive-dashboard)
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

### Arch Linux / Omarchy / Linux Installer
To install Rhystic Tracker to your user application menu:

```bash
./install.sh
```

This performs the following actions:
1. Installs the compiled binary into `~/.local/bin/rhystic-tracker`.
2. Installs the high-resolution logo into `~/.local/share/icons/hicolor/512x512/apps/rhystic-tracker.png`.
3. Creates a valid XDG `.desktop` file in `~/.local/share/applications/rhystic-tracker.desktop`.
4. Refreshes application menu databases.

You will now find **Rhystic Tracker** in your application launcher (e.g., **Rofi**, **Wofi**, **KRunner**, **GNOME**, **KDE Plasma**).

---

## 5. Feature Guide

### Executive Dashboard
- **Win Rate & Streak**: Displays today's match record, current win/loss streak, and all-time record.
- **5-Day Trend Chart**: Visualizes recent win percentage momentum across your matches.
- **Recent Matches**: Chronological grouping of recent matches with quick result badges (`VICTORY` / `DEFEAT`).
- **Deck Spotlight**: Displays quick-launch stats for your most active decks.

---

### Live Match HUD & Real-Time Combat Feed
While in an active match, click **Live Match HUD** in the left sidebar (the menu icon pulses orange when a game is in progress):
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

### Full Match Inspector & Turn Playback
Clicking any match in the Dashboard or Match History opens the **Full Match Inspector**:
- **Match Breakdown**: Starting order (Play vs Draw), mulligans taken, ending life totals, and deck win streaks.
- **Play-by-Play Timeline**: Grouped by game round, displaying every card cast, spell damage dealt, creature death, and life fluctuation on the exact turn it occurred.

---

### Lifetime Card Combat Analytics
Open any card's details to view persistent lifetime metrics (isolated strictly to your games):
- **Matches & Win Rate**: Total games played with the card and win percentage when cast.
- **Damage Distribution**: Total damage dealt, maximum single swing, and a split bar showing **Damage to Face (Player)** vs **Damage to Permanents**.
- **Source Classification**: Direct split between **Combat Damage** vs **Spell / Ability Damage**.
- **Turn Cast Frequency**: Histogram showing which turn you most frequently cast the card.
- **MVP Deck**: Attribution of which of your decks this card performs best in.

---

### Deck Library & True Decklist Management
- **True Decklists**: Import your exact 60-card / 100-card decklists directly using the MTGA export format (`.txt` or clipboard).
- **Legitimacy Verification**: Rhystic Tracker filters out preset and starter decks to prevent skewed collection or archetype analytics.
- **Card Size Sliders**: Choose between compact and expansive grid views.

---

### Card Library & Scryfall Viewer
- **450px Card Artwork**: High-definition card artwork fetched via Scryfall.
- **Art / Style Selector**: Switch between different printings and card styles for any card.
- **Responsive Layout**: On smaller viewports, panels gracefully collapse to ensure the card art remains clear and prominent.

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
Yes! Rhystic Tracker works natively on Steam Deck in Desktop Mode or added as a non-Steam game.
