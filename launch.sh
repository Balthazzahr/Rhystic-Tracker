#!/bin/bash
# Launcher for Rhystic Tracker (release build, self-contained frontend).
cd "$(dirname "$0")"
export GDK_BACKEND=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export RHYSTIC_ENV=production
exec ./src-tauri/target/release/rhystic-tracker
