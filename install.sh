#!/usr/bin/env bash
# ==============================================================================
# Rhystic Tracker — Linux & Arch / Omarchy Desktop Installer
# ==============================================================================
set -e

APP_NAME="Rhystic Tracker"
EXEC_NAME="rhystic-tracker"
ICON_NAME="rhystic-tracker"
REPO="Balthazzahr/Rhystic-Tracker"

INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
TEMP_DIR=""

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

echo "=== Installing $APP_NAME for $(whoami) ==="

# 1. Create standard XDG directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"

# 2. Locate binary or AppImage
BIN_SOURCE=""
if [ -n "$SCRIPT_DIR" ]; then
    if [ -f "$SCRIPT_DIR/src-tauri/target/release/$EXEC_NAME" ]; then
        BIN_SOURCE="$SCRIPT_DIR/src-tauri/target/release/$EXEC_NAME"
    elif [ -f "$SCRIPT_DIR/$EXEC_NAME" ]; then
        BIN_SOURCE="$SCRIPT_DIR/$EXEC_NAME"
    elif [ -f "$SCRIPT_DIR/${EXEC_NAME}-x86_64-linux" ]; then
        BIN_SOURCE="$SCRIPT_DIR/${EXEC_NAME}-x86_64-linux"
    elif [ -f "$SCRIPT_DIR/${EXEC_NAME}-aarch64-linux" ]; then
        BIN_SOURCE="$SCRIPT_DIR/${EXEC_NAME}-aarch64-linux"
    elif ls "$SCRIPT_DIR"/src-tauri/target/release/bundle/appimage/*.AppImage 1> /dev/null 2>&1; then
        BIN_SOURCE="$(ls "$SCRIPT_DIR"/src-tauri/target/release/bundle/appimage/*.AppImage | head -n 1)"
    fi
fi

# If no local binary is found, auto-download the latest release package from GitHub
if [ -z "$BIN_SOURCE" ]; then
    echo "  -> No local binary found. Fetching latest release from GitHub ($REPO)..."
    
    DOWNLOAD_CMD=""
    if command -v curl >/dev/null 2>&1; then
        DOWNLOAD_CMD="curl"
    elif command -v wget >/dev/null 2>&1; then
        DOWNLOAD_CMD="wget"
    else
        echo "❌ Error: Neither 'curl' nor 'wget' was found on your system."
        exit 1
    fi

    # Query GitHub API for latest release tarball URL
    if [ "$DOWNLOAD_CMD" = "curl" ]; then
        RELEASE_JSON=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")
    else
        RELEASE_JSON=$(wget -qO- "https://api.github.com/repos/$REPO/releases/latest")
    fi

    TARBALL_URL=$(echo "$RELEASE_JSON" | grep -o 'https://github.com/'"$REPO"'/releases/download/[^"]*\.tar\.gz' | head -n 1 || true)

    if [ -z "$TARBALL_URL" ]; then
        echo "❌ Error: Could not determine latest release download URL."
        echo "   Please check https://github.com/$REPO/releases/latest"
        exit 1
    fi

    echo "  -> Downloading: $TARBALL_URL"
    TEMP_DIR=$(mktemp -d)
    
    if [ "$DOWNLOAD_CMD" = "curl" ]; then
        curl -sSL "$TARBALL_URL" -o "$TEMP_DIR/release.tar.gz"
    else
        wget -qO "$TEMP_DIR/release.tar.gz" "$TARBALL_URL"
    fi

    echo "  -> Extracting release package..."
    tar -xzf "$TEMP_DIR/release.tar.gz" -C "$TEMP_DIR"

    # Search inside extracted directory for the binary
    EXTRACTED_BIN=$(find "$TEMP_DIR" -type f \( -name "$EXEC_NAME" -o -name "${EXEC_NAME}-x86_64-linux" -o -name "${EXEC_NAME}-aarch64-linux" \) | head -n 1)
    if [ -n "$EXTRACTED_BIN" ]; then
        BIN_SOURCE="$EXTRACTED_BIN"
    fi
fi

if [ -z "$BIN_SOURCE" ]; then
    echo "❌ Error: Could not locate or download Rhystic Tracker binary."
    exit 1
fi

echo "  -> Installing binary to $INSTALL_DIR/$EXEC_NAME"
cp -f "$BIN_SOURCE" "$INSTALL_DIR/$EXEC_NAME"
chmod +x "$INSTALL_DIR/$EXEC_NAME"

# 3. Install App Icon
ICON_SOURCE=""
CANDIDATE_DIRS=()
if [ -n "$SCRIPT_DIR" ]; then
    CANDIDATE_DIRS+=("$SCRIPT_DIR")
fi
if [ -n "$TEMP_DIR" ]; then
    CANDIDATE_DIRS+=("$TEMP_DIR")
fi

for base in "${CANDIDATE_DIRS[@]}"; do
    for candidate in \
        "$base/src-tauri/icons/icon.png" \
        "$base/icons/icon.png" \
        "$base/icon.png"; do
        if [ -f "$candidate" ]; then
            ICON_SOURCE="$candidate"
            break 2
        fi
    done
    FOUND_ICON=$(find "$base" -type f -name "icon.png" 2>/dev/null | head -n 1 || true)
    if [ -n "$FOUND_ICON" ]; then
        ICON_SOURCE="$FOUND_ICON"
        break
    fi
done

if [ -n "$ICON_SOURCE" ]; then
    echo "  -> Installing application icon from: $ICON_SOURCE"
    cp -f "$ICON_SOURCE" "$ICON_DIR/$ICON_NAME.png"
else
    echo "  ⚠  No icon found — skipping icon installation."
    echo "     You can manually place a 512x512 PNG at: $ICON_DIR/$ICON_NAME.png"
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
echo ""
echo "To uninstall, run:"
echo "   rm $INSTALL_DIR/$EXEC_NAME $DESKTOP_DIR/$EXEC_NAME.desktop $ICON_DIR/$ICON_NAME.png"
