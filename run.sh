#!/bin/bash
export GDK_BACKEND=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
cd "$(dirname "$0")"
./src-tauri/target/debug/rhystic-tracker
