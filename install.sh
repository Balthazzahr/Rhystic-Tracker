#!/usr/bin/env bash
# ==============================================================================
# Rhystic Tracker — Linux & Arch / Omarchy Desktop Installer
# ==============================================================================
set -e

APP_NAME="Rhystic Tracker"
EXEC_NAME="rhystic-tracker"
ICON_NAME="rhystic-tracker"

INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Installing $APP_NAME for $(whoami) ==="

# 1. Create standard XDG directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"

# 2. Locate binary or AppImage
BIN_SOURCE=""
if [ -f "$SCRIPT_DIR/src-tauri/target/release/$EXEC_NAME" ]; then
    BIN_SOURCE="$SCRIPT_DIR/src-tauri/target/release/$EXEC_NAME"
elif [ -f "$SCRIPT_DIR/$EXEC_NAME" ]; then
    BIN_SOURCE="$SCRIPT_DIR/$EXEC_NAME"
elif ls "$SCRIPT_DIR"/src-tauri/target/release/bundle/appimage/*.AppImage 1> /dev/null 2>&1; then
    BIN_SOURCE="$(ls "$SCRIPT_DIR"/src-tauri/target/release/bundle/appimage/*.AppImage | head -n 1)"
fi

if [ -z "$BIN_SOURCE" ]; then
    echo "❌ Error: Could not find compiled binary or AppImage."
    echo "   Please run 'npm run build && (cd src-tauri && cargo build --release)' first."
    exit 1
fi

echo "  -> Copying binary from: $BIN_SOURCE"
cp -f "$BIN_SOURCE" "$INSTALL_DIR/$EXEC_NAME"
chmod +x "$INSTALL_DIR/$EXEC_NAME"

# 3. Install App Icon
ICON_SOURCE="$SCRIPT_DIR/src-tauri/icons/icon.png"
if [ ! -f "$ICON_SOURCE" ]; then
    ICON_SOURCE="$SCRIPT_DIR/src/assets/symbolIcon.png"
fi

if [ -f "$ICON_SOURCE" ]; then
    echo "  -> Installing application icon to: $ICON_DIR/$ICON_NAME.png"
    cp -f "$ICON_SOURCE" "$ICON_DIR/$ICON_NAME.png"
fi

# 4. Generate & Install .desktop Launcher
DESKTOP_FILE="$DESKTOP_DIR/$EXEC_NAME.desktop"
echo "  -> Creating desktop launcher: $DESKTOP_FILE"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=$APP_NAME
GenericName=MTG Arena Tracker
Comment=Real-time MTGA match tracking and deck analysis companion
Exec=$INSTALL_DIR/$EXEC_NAME
Icon=$ICON_NAME
Terminal=false
Type=Application
Categories=Game;Utility;
StartupNotify=false
Keywords=mtg;magic;arena;tracker;rhystic;
EOF

chmod +x "$DESKTOP_FILE"

# 5. Update Desktop Databases if tools exist
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

echo "✅ $APP_NAME successfully installed!"
echo "   Binary:  $INSTALL_DIR/$EXEC_NAME"
echo "   Desktop: $DESKTOP_FILE"
echo ""
echo "You can now launch '$APP_NAME' from your application menu (Rofi, Wofi, GNOME, KDE, etc.) or run 'rhystic-tracker'."
