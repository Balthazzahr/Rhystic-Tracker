#!/bin/bash
# ==============================================================================
# Rhystic Tracker — Test Environment Launcher
# ==============================================================================
# Runs Rhystic Tracker in development mode against an isolated copy of the
# live production database. Any test matches, edits, or deletes happen
# strictly in rhystic_dev.db, protecting rhystic.db from corruption or changes.
# ==============================================================================
set -e
cd "$(dirname "$0")"

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/rhystic-tracker"
mkdir -p "$CONFIG_DIR"

PROD_DB="$CONFIG_DIR/rhystic.db"
DEV_DB="$CONFIG_DIR/rhystic_dev.db"

# Snapshot latest production database into dev database for realistic testing
if [ -f "$PROD_DB" ]; then
    echo "[TEST ENV] Syncing fresh snapshot of production database to test database..."
    cp -f "$PROD_DB" "$DEV_DB"
    echo "[TEST ENV] Snapshot ready ($DEV_DB)"
fi

export GDK_BACKEND=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export RHYSTIC_ENV=development

if [ -f "./src-tauri/target/release/rhystic-tracker" ]; then
    exec ./src-tauri/target/release/rhystic-tracker "$@"
elif [ -f "$HOME/.local/bin/rhystic-tracker-test" ]; then
    exec "$HOME/.local/bin/rhystic-tracker-test" "$@"
else
    exec "$HOME/.local/bin/rhystic-tracker" "$@"
fi
