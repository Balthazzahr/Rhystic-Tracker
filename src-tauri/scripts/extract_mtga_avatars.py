#!/usr/bin/env python3
import json
import glob
import os
import sys

def extract_avatars(raw_dir=None, out_dir=None):
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

    if not downloads_dir or not os.path.exists(downloads_dir):
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
        print("Warning: UnityPy or PIL not installed", file=sys.stderr)
        return 0

    alt_files = glob.glob(os.path.join(downloads_dir, "ALT", "ALT_Avatar_*.mtga"))
    bundle_dir = os.path.join(downloads_dir, "AssetBundle")

    if not alt_files or not os.path.exists(bundle_dir):
        print("Error: Missing ALT or AssetBundle directory", file=sys.stderr)
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
                            bbox = img.getbbox()
                            if bbox:
                                img = img.crop(bbox)
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
    raw_arg = sys.argv[1] if len(sys.argv) > 1 else None
    out_arg = sys.argv[2] if len(sys.argv) > 2 else None
    extract_avatars(raw_arg, out_arg)
