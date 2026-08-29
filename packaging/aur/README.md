# Rhystic Tracker — AUR Packaging

This directory contains official Arch User Repository (AUR) package recipes for **Rhystic Tracker**.

## Available Packages

1. **`rhystic-tracker-bin`** (Recommended)
   - Packages the pre-compiled, self-contained Linux release binary directly from GitHub releases.
   - Fast installation with no Rust/Node build toolchain required on the user's machine.

2. **`rhystic-tracker-git`**
   - Builds directly from the latest source code on the `master` branch.
   - Automatically resolves dependencies including Node.js, npm, Rust, and Tauri CLI.

---

## Local Installation / Testing

### Install Binary Package (`rhystic-tracker-bin`)
```bash
cd packaging/aur/rhystic-tracker-bin
makepkg -si
```

### Install Git Master Package (`rhystic-tracker-git`)
```bash
cd packaging/aur/rhystic-tracker-git
makepkg -si
```

---

## Publishing to AUR (`aur.archlinux.org`)

To publish or update these packages on the Arch User Repository:

1. **Clone the AUR repository (one-time setup):**
   ```bash
   git clone ssh://aur@aur.archlinux.org/rhystic-tracker-bin.git /tmp/aur-rhystic-tracker-bin
   ```

2. **Copy updated `PKGBUILD` and `.SRCINFO`:**
   ```bash
   cp packaging/aur/rhystic-tracker-bin/PKGBUILD /tmp/aur-rhystic-tracker-bin/
   cd /tmp/aur-rhystic-tracker-bin
   makepkg --printsrcinfo > .SRCINFO
   ```

3. **Commit and Push:**
   ```bash
   git add PKGBUILD .SRCINFO
   git commit -m "Release v1.3.4"
   git push origin master
   ```

Once published, any Arch Linux user can install and receive automatic updates using their preferred AUR helper:
```bash
yay -S rhystic-tracker-bin
# or
paru -S rhystic-tracker-bin
```
