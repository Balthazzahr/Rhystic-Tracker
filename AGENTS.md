# Rhystic Tracker — Agent & Project Notes

## Git / Commit Cadence

This project is published to a **public GitHub repository** (`Balthazzahr/Rhystic-Tracker`). We use **milestone commits**: no auto-commit on every change, no committing mid-work.

- At the end of each milestone — when a feature is finalized or a set of fixes is accepted — **prompt the user** to make a milestone commit.
- Suggested flow:
  1. Confirm with the user that the milestone is final.
  2. Stage and commit in **logical commits** (e.g. `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`) rather than one giant commit.
  3. Push to `origin master`.
- **After every milestone commit/push, also build the release on the local system** — the user launches the app through their shell launcher (`~/.local/share/applications/rhystic-tracker.desktop` → `launch.sh` → `src-tauri/target/release/rhystic-tracker`). So each milestone must produce a fresh release binary:
  - `npm run build` (frontend → `dist/`)
  - `source ~/.cargo/env && cargo build --release` (from `src-tauri/`) so `launch.sh` picks up the new build.
- Never commit:
  - `*.db` files, `*.log` files, or `~/.config` data (gitignored).
  - Secrets, tokens, `.env`, or local machine-specific absolute paths.
- Keep the repo portable: avoid committing `/home/...`, `/mnt/...`, or other machine-specific paths in source. Prefer `$HOME`-relative discovery or environment overrides (`RHYSTIC_MTGA_LOG`, `RHYSTIC_MTGA_RAW_DIR`).
