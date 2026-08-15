# Rhystic Tracker

Unofficial Magic: The Gathering Arena match tracking and deck analysis tool. Rhystic Tracker parses MTG Arena's `Player.log` in real time to build a local SQLite history of your matches, decks, and commanders — with a desktop dashboard, live match HUD, and a searchable deck library.

Built with **Tauri**, **React**, **TypeScript**, and **Rust**.

> **Disclaimer:** Rhystic Tracker is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. It is not approved or endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC.
>
> Card metadata, symbol artwork, and mana pips are fetched via [Scryfall's API](https://scryfall.com/docs/api) under Scryfall's Free Attribution License.

## Features

- **Dashboard** — today's / all-time win rate, current streak, 5-day trending win rate, recent matches grouped by day, a rotating deck spotlight, and library fun facts.
- **Deck Library** — card and table views, search (including by commander name), filtering by format/color/commander, sorting, and a checkpoint-based card-size slider.
- **Match History** — full match records with search and format/time/result filters.
- **Live Match HUD** — real-time match state parsed from the MTGA `Player.log`.
- **Card viewer** — Scryfall art with full metadata (mana value, type, set, rarity) for any card reference.
- **Theming** — five Magic color-identity themes (White/Blue/Black/Red/Green) that tint the whole UI.

## Prerequisites

- [Node.js](https://nodejs.org/) (npm)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- Linux system dependencies for Tauri / WebKitGTK (see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

The packaged app (and raw release binary) will be produced under `src-tauri/target/release/`.

## Data & Configuration

- Match data, card metadata, and settings live in **`~/.config/rhystic-tracker/rhystic.db`** (SQLite).
- MTG Arena's `Player.log` is auto-detected on launch from the standard Steam and Wine/Proton install locations. Override it with the `RHYSTIC_MTGA_LOG` environment variable, or point at a specific Raw card database folder with `RHYSTIC_MTGA_RAW_DIR`.

## License

[MIT](LICENSE)
