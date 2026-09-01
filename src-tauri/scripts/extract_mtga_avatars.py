#!/usr/bin/env python3
import json
import glob
import os
import sys

def extract_avatars(raw_dir=None, out_dir=None):
    if not out_dir:
        out_dir = os.path.expanduser("~/.config/rhystic-tracker/avatars")
    os.makedirs(out_dir, exist_ok=True)

    # If raw_dir is provided (e.g. /.../MTGA/MTGA_Data/Downloads/Raw), get Downloads dir
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

    if not downloads_dir or not os.path.exists(downloads_dir):
        # Search standard Wine / Steam / Lutris paths
        candidates = [
            os.path.expanduser("~/.steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.expanduser("~/.steam/root/steamapps/common/MTGA/MTGA_Data/Downloads"),
            os.path.expanduser("~/Games/magic-the-gathering-arena/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.expanduser("~/.wine/drive_c/Program Files/Wizards of the Coast/MTGA/MTGA_Data/Downloads"),
            os.path.expanduser("~/.var/app/com.valvesoftware.Steam/.steam/steam/steamapps/common/MTGA/MTGA_Data/Downloads"),
        ]
        for c in candidates:
            if os.path.exists(c):
                downloads_dir = c
                break

    if not downloads_dir:
        print("Error: Could not locate MTGA Downloads directory", file=sys.stderr)
        return 0

    try:
        import UnityPy
        from PIL import Image
        UnityPy.config.FALLBACK_UNITY_VERSION = "2022.3.22f1"
    except ImportError:
        print("Warning: UnityPy or PIL not installed, skipping dynamic extraction", file=sys.stderr)
        return 0

    alt_files = glob.glob(os.path.join(downloads_dir, "ALT", "ALT_Avatar_*.mtga"))
    manifest_files = glob.glob(os.path.join(downloads_dir, "Manifest_*.mtga"))
    bundle_dir = os.path.join(downloads_dir, "AssetBundle")

    if not alt_files or not manifest_files or not os.path.exists(bundle_dir):
        print("Error: Missing ALT or Manifest in MTGA Downloads directory", file=sys.stderr)
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
                    rel_to_avatar_ids.setdefault(rel, []).append(av_id)

    # 2. Parse Manifest for IndexedAssets
    manifest_file = [m for m in sorted(manifest_files) if "Audio" not in m and "Localization" not in m][-1]
    mf_data = json.load(open(manifest_file))
    bundle_to_indexed = {}
    for asset in mf_data.get("Assets", []):
        name = asset.get("Name", "")
        indexed = asset.get("IndexedAssets", [])
        if "Bucket_Avatar.BustPayload" in name and indexed:
            bundle_to_indexed[name] = indexed

    total_saved = 0
    for b_name, indexed_assets in bundle_to_indexed.items():
        b_path = os.path.join(bundle_dir, b_name)
        if not os.path.exists(b_path):
            continue
        try:
            env = UnityPy.load(b_path)
            sprites = [obj for obj in env.objects if obj.type.name == "Sprite"]
            for idx, sprite_obj in enumerate(sprites):
                if idx >= len(indexed_assets):
                    break
                rel_path = indexed_assets[idx]
                try:
                    s_data = sprite_obj.read()
                    img = s_data.image
                    if img:
                        bbox = img.getbbox()
                        if bbox:
                            img = img.crop(bbox)
                        stem = os.path.splitext(os.path.basename(rel_path))[0]
                        clean_stem = stem.replace("AvatarBust_", "").replace("Avatar_Bust_", "")
                        img.save(os.path.join(out_dir, f"{stem}.png"))
                        img.save(os.path.join(out_dir, f"{clean_stem}.png"))
                        for av_id in rel_to_avatar_ids.get(rel_path, []):
                            img.save(os.path.join(out_dir, f"{av_id}.png"))
                            total_saved += 1
                except Exception:
                    pass
        except Exception as e:
            print(f"Error reading bundle {b_name}: {e}", file=sys.stderr)

    print(f"Successfully extracted {total_saved} avatars to {out_dir}")
    return total_saved

if __name__ == "__main__":
    raw_arg = sys.argv[1] if len(sys.argv) > 1 else None
    out_arg = sys.argv[2] if len(sys.argv) > 2 else None
    extract_avatars(raw_arg, out_arg)
