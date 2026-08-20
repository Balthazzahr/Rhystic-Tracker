<p align="center">
  <img src="docs/assets/RhysticTrackerLogo.svg" alt="Rhystic Tracker Logo" width="540" />
</p>

<p align="center">
  <strong>The open-source, local-first companion and combat analytics engine for Magic: The Gathering Arena on Linux.</strong>
</p>

<p align="center">
  <a href="https://github.com/Balthazzahr/Rhystic-Tracker/releases"><img src="https://img.shields.io/badge/version-1.1.1-38BDF8?style=flat-square&logo=git" alt="Version 1.1.1" /></a>
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20Arch%20%7C%20Steam%20Deck-1793D1?style=flat-square&logo=archlinux" alt="Linux Platform" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%7C%20Rust%20%7C%20React-24C8D8?style=flat-square&logo=tauri" alt="Tauri" />
  <img src="https://img.shields.io/badge/database-SQLite-003B57?style=flat-square&logo=sqlite" alt="SQLite" />
  <img src="https://img.shields.io/badge/license-MIT-emerald?style=flat-square" alt="License MIT" />
</p>

---

## ⚡ What is Rhystic Tracker?

**Rhystic Tracker** is a native, ultra-responsive desktop companion for MTG Arena on Linux. It continuously parses MTGA's `Player.log` in real time, persisting every match, mulligan, card draw, spell resolution, token creation, permanent destruction, and combat damage swing into a local SQLite database on your machine.

Built with **Tauri v2**, **Rust**, **React 18**, and **TypeScript**, it delivers maximum visual performance and instant zero-latency queries without cloud requirements, tracking accounts, or telemetry.

> **Fan Content Disclaimer:** Rhystic Tracker is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC. Card artwork and symbols are fetched via Scryfall's API.

---

## ✨ Features at a Glance

- 📊 **Dashboard**: Today's and all-time record, win rate trends, current streak counter, daily match grouping, and rotating deck spotlights.
- ⚔️ **Live Match HUD**: Real-time game state tracker showing hero and opponent life changes, card plays, token creations, death/exile logs, and detailed combat/spell damage attributions with MTG font icons.
- 🔍 **Full Match Inspector & Turn Timeline**: Granular play-by-play combat replay per turn, dynamic Commander artwork scaling, damage magnitude badges (`[4 DMG]`), card types, life swings, and victory/defeat causes.
- 📈 **Lifetime Card Combat Analytics**: Persistent per-card metrics — win rate when cast, total damage dealt (face vs permanent splits), combat vs spell classification, MVP decks, and turn cast frequency histograms.
- 🃏 **Deck & Card Library**: Visual collection explorer with dual **Landscape Art Crop** (with translucent mana bars) and **Portrait Full Card** viewing modes, true-decklist import/export (`.txt` / MTGA format), and persistent set printing selection.
  - *Note on Collection Tracking*: Because MTGA has removed raw collection dumps from client logs, Rhystic Tracker derives owned inventory strictly through verified True Decklists. This ensures temporary or in-game cards (from *heist, theft, copy, clone, or conjure* mechanics) never pollute your genuine collection database.
- ⚙️ **Settings & Configuration**: Dynamic 2-column control panel with local image cache manager (live disk usage, purge, pre-download), database storage inspector with 1-click native DB backup export, startup tab preferences, log auto-discovery, and 5 color-identity mana themes.
- 🎨 **Five Color-Identity Mana Themes**: Dynamic White, Blue, Black, Red, and Green themes that meticulously tint the entire application.

---

## 📸 Screenshots Showcase

| Dashboard | Live Match HUD |
| :---: | :---: |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Live Match HUD](docs/screenshots/live_hud.png) |

| Match History & Match Inspector | Turn Playback & Combat Timeline |
| :---: | :---: |
| ![Match History](docs/screenshots/match_history.png) | ![Match Inspector Timeline](docs/screenshots/match_inspector_timeline.png) |

| Deck Library & True Decklist Inspector | Card Library & Combat Analytics |
| :---: | :---: |
| ![Deck Library](docs/screenshots/deck_library.png) | ![Card Inspector](docs/screenshots/card_inspector.png) |

---

## 🚀 Quick Start & Installation

### Option 1: Pre-built Release (Recommended)

Download the latest release tarball from [GitHub Releases](https://github.com/Balthazzahr/Rhystic-Tracker/releases):

```bash
# 1. Download and extract the latest release package
tar -xzf rhystic-tracker-v1.0.0-rc1-linux-x86_64.tar.gz
cd rhystic-tracker-v1.0.0-rc1

# 2. Run the desktop installer (registers icon and launcher automatically)
./install.sh
```

The tarball contains the pre-compiled binary (`rhystic-tracker-x86_64-linux`) and `install.sh`. The installer copies the binary to `~/.local/bin/rhystic-tracker`, registers high-resolution application icons into `~/.local/share/icons/`, and creates the desktop entry so Rhystic Tracker appears immediately in your application launcher (**GNOME**, **Pop Launcher**, **Cosmic**, **Rofi**, **Wofi**, **KDE Plasma**).

> **Note:** `install.sh` automatically sets `GDK_BACKEND=x11` in the desktop launcher so the app works correctly on both X11 and Wayland sessions (via XWayland).

---

### Option 2: Build from Source

If you prefer to compile from source or clone the repository:

#### 1. Install System Dependencies

Rhystic Tracker uses Tauri v2, which requires WebKitGTK and standard GTK3 build libraries.

**Debian / Ubuntu / Pop!_OS / Linux Mint:**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file libssl-dev libjavascriptcoregtk-4.1-dev nodejs npm
```

**Arch Linux / Omarchy / Manjaro:**
```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget openssl appmenu-gtk-module libappindicator-gtk3 librsvg nodejs npm
```

**Fedora / RHEL:**
```bash
sudo dnf install -y webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel openssl-devel @development-tools nodejs npm
```

#### 2. Install Node.js & Rust (if not already installed)
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

#### 3. Clone, Build, and Install

```bash
# Clone the repository
git clone https://github.com/Balthazzahr/Rhystic-Tracker.git
cd Rhystic-Tracker

# Install dependencies and build self-contained release app
npm install
npm run build:app

# Run installer to place binary and desktop shortcuts
./install.sh
```

---

### 📦 Runtime Dependencies (For Pre-built Binaries)

If running the pre-built release binary on a minimal or newly installed Linux system, ensure the WebKitGTK 4.1 runtime is present:
- **Pop!_OS / Ubuntu / Debian:** `sudo apt install libwebkit2gtk-4.1-0 libayatana-appindicator3-1`
- **Arch Linux:** `sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3`
- **Fedora:** `sudo dnf install webkit2gtk4.1 libappindicator-gtk3`

---

### 🖥️ Wayland / Steam Deck Note

Rhystic Tracker requires **X11** or **XWayland**. The desktop launcher installed by `install.sh` automatically sets `GDK_BACKEND=x11`, so it works on both X11 and Wayland sessions out of the box. If you launch the binary directly from a terminal on a Wayland-only session, prepend the env var:

```bash
GDK_BACKEND=x11 rhystic-tracker
```

---

### 🗑️ Uninstall

```bash
rm ~/.local/bin/rhystic-tracker \
   ~/.local/share/applications/rhystic-tracker.desktop \
   ~/.local/share/icons/hicolor/512x512/apps/rhystic-tracker.png
```

Your match data in `~/.config/rhystic-tracker/rhystic.db` is preserved and can be backed up or deleted separately.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
