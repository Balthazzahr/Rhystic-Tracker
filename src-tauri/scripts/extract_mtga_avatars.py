#!/usr/bin/env python3
import json
import glob
import os
import sys

def tight_alpha_crop(img, alpha_threshold=25):
    """Crops transparent padding while ignoring faint alpha compression noise."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    alpha = img.split()[-1]
    mask = alpha.point(lambda p: 255 if p >= alpha_threshold else 0)
    bbox = mask.getbbox()
    if bbox:
        # Also zero-out noise outside the threshold
        cleaned_alpha = alpha.point(lambda p: p if p >= alpha_threshold else 0)
        img.putalpha(cleaned_alpha)
        return img.crop(bbox)
    return img

def extract_avatars(raw_dir=None, out_dir=None, log_path=None):
    if not out_dir:
        out_dir = os.path.expanduser("~/.config/rhystic-tracker/avatars")
    os.makedirs(out_dir, exist_ok=True)

    # 1. Locate MTGA Downloads directory
    downloads_dir = None
    if raw_dir and os.path.exists(raw_dir):
        if os.path.basename(raw_dir.rstrip("/")) == "Raw":
            downloads_dir = os.path.dirname(raw_dir.rstrip("/"))
        elif os.path.basename(raw_dir.rstrip("/")) == "Downloads":
            downloads_dir = raw_dir
        else:
            cand = os.path.join(raw_dir, "MTGA_Data", "Downloads")
            if os.path.exists(cand):
                downloads_dir = cand

    # Derive from log_path if provided
    if (not downloads_dir or not os.path.exists(downloads_dir)) and log_path and os.path.exists(log_path):
        log_dir = os.path.dirname(os.path.abspath(log_path))
        # Walk up from Player.log looking for MTGA_Data/Downloads or drive_c
        curr = log_dir
        for _ in range(8):
            if not curr or curr == "/":
                break
            cand_dl = os.path.join(curr, "MTGA_Data", "Downloads")
            if os.path.exists(cand_dl):
                downloads_dir = cand_dl
                break
            # If we reach drive_c, inspect standard Program Files folders
            if os.path.basename(curr) == "drive_c":
                for sub in [
                    "Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads",
                    "Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads",
                    "Program Files/MTGA/MTGA_Data/Downloads",
                    "Program Files (x86)/MTGA/MTGA_Data/Downloads",
                    "MTGA/MTGA_Data/Downloads",
                    "Games/MTGA/MTGA_Data/Downloads",
                ]:
                    c = os.path.join(curr, sub)
                    if os.path.exists(c):
                        downloads_dir = c
                        break
                if downloads_dir:
                    break
            # If in steamapps/compatdata/<appid>/pfx, also look for steamapps/common/MTGA
            if "steamapps" in curr:
                parts = curr.split("steamapps")
                steam_common = os.path.join(parts[0], "steamapps", "common", "MTGA", "MTGA_Data", "Downloads")
                if os.path.exists(steam_common):
                    downloads_dir = steam_common
                    break
            curr = os.path.dirname(curr)

    if not downloads_dir or not os.path.exists(downloads_dir):
        home = os.path.expanduser("~")
        candidates = [
            os.path.join(home, ".steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".steam/root/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".local/share/Steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".var/app/com.valvesoftware.Steam/.steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, "Games/magic-the-gathering-arena/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, "Games/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, "Games/Magic-The-Gathering-Arena/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".local/share/lutris/runners/wine/mtga/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".wine/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.join(home, ".wine/drive_c/Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
        ]

        # Scan Steam compatdata prefixes for non-standard AppIDs (e.g. 2141910, 2308410)
        steam_roots = [
            os.path.join(home, ".local/share/Steam"),
            os.path.join(home, ".steam/steam"),
            os.path.join(home, ".var/app/com.valvesoftware.Steam/.local/share/Steam"),
        ]
        for s_root in steam_roots:
            compat_dir = os.path.join(s_root, "steamapps", "compatdata")
            if os.path.isdir(compat_dir):
                for app_id in os.listdir(compat_dir):
                    candidates.append(os.path.join(compat_dir, app_id, "pfx/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"))
                    candidates.append(os.path.join(compat_dir, app_id, "pfx/drive_c/Program Files (x86)/Wizards of the Coast/MTGA/MTGA_Data/Downloads"))

        # Scan Bottles
        bottles_dir = os.path.join(home, ".var/app/com.usebottles.bottles/data/bottles/bottles")
        if os.path.isdir(bottles_dir):
            for b in os.listdir(bottles_dir):
                candidates.append(os.path.join(bottles_dir, b, "drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"))

        for c in candidates:
            if os.path.exists(c):
                downloads_dir = c
                break

    if not downloads_dir:
        print("Error: Could not locate MTGA Downloads directory. Please set MTGA Raw / Log path in Settings.", file=sys.stderr)
        return 0

    try:
        import UnityPy
        from PIL import Image
        UnityPy.config.FALLBACK_UNITY_VERSION = "2022.3.22f1"
    except ImportError as e:
        print(f"Error: Missing Python dependencies ({e}). Please install them via: pip install UnityPy Pillow", file=sys.stderr)
        sys.exit(2)

    alt_files = glob.glob(os.path.join(downloads_dir, "ALT", "ALT_Avatar_*.mtga"))
    bundle_dir = os.path.join(downloads_dir, "AssetBundle")

    if not alt_files or not os.path.exists(bundle_dir):
        print(f"Error: Missing ALT or AssetBundle directory under {downloads_dir}", file=sys.stderr)
        return 0

    # 1. Parse ALT for NodeId -> RelativePath and AvatarID -> RelativePath
    alt_data = json.load(open(sorted(alt_files)[-1]))
    node_to_rel = {}
    for node in alt_data.get("ALT_Avatar.BustPayload", {}).get("Nodes", []):
        nid = node.get("NodeId")
        ref = node.get("Payload", {}).get("Reference", {})
        if nid and ref.get("RelativePath"):
            node_to_rel[nid] = ref.get("RelativePath")

    rel_to_avatar_ids = {}
    for conn in alt_data.get("ALT_Avatar.BustPayload", {}).get("Connections", []):
        child = conn.get("Child")
        if isinstance(child, dict):
            for av_id, nid in child.items():
                if nid in node_to_rel:
                    rel = node_to_rel[nid]
                    rel_to_avatar_ids.setdefault(rel.lower(), []).append(av_id)

    # 2. Extract using exact m_PathID from m_Container
    bust_bundles = glob.glob(os.path.join(bundle_dir, "Bucket_Avatar.BustPayload_*.mtga"))
    total_saved = 0

    for b_path in bust_bundles:
        try:
            env = UnityPy.load(b_path)
            path_id_to_rel = {}
            for obj in env.objects:
                if obj.type.name == "AssetBundle":
                    ab_data = obj.read()
                    for rel_path, asset_info in ab_data.m_Container:
                        pid = asset_info.asset.m_PathID
                        path_id_to_rel[pid] = rel_path

            for obj in env.objects:
                if obj.type.name == "Sprite" and obj.path_id in path_id_to_rel:
                    rel = path_id_to_rel[obj.path_id]
                    s_data = obj.read()
                    try:
                        img = s_data.image
                        if img:
                            img = tight_alpha_crop(img, alpha_threshold=25)
                            stem = os.path.splitext(os.path.basename(rel))[0]
                            clean_stem = stem.replace("AvatarBust_", "").replace("Avatar_Bust_", "")
                            img.save(os.path.join(out_dir, f"{stem}.png"))
                            img.save(os.path.join(out_dir, f"{clean_stem}.png"))
                            for av_id in rel_to_avatar_ids.get(rel.lower(), []):
                                img.save(os.path.join(out_dir, f"{av_id}.png"))
                                total_saved += 1
                    except Exception:
                        pass
        except Exception as e:
            print(f"Error {b_path}: {e}", file=sys.stderr)

    print(f"Successfully extracted {total_saved} avatars to {out_dir}")
    return total_saved

if __name__ == "__main__":
    raw_arg = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
    out_arg = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    log_arg = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    extract_avatars(raw_arg, out_arg, log_arg)
