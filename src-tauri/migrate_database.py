#!/usr/bin/env python3
"""
Rhystic Tracker Phase 2 - Database Migration Module
Imports legacy mtga_collection.db and mtga_tracker_enhanced_state.json into rhystic.db
with strict validation and NULL handling for legacy matches.
"""

import os
import sys
import os
import sys
import json
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime

# Legacy project data directory. Override with --old-data <path> or the
# RHYSTIC_OLD_DATA environment variable.
_old_data = os.environ.get("RHYSTIC_OLD_DATA")
if "--old-data" in sys.argv:
    _old_data = sys.argv[sys.argv.index("--old-data") + 1]
OLD_PROJECT_DATA = Path(_old_data) if _old_data else Path("mtga-pro-tracker-data")
OLD_DB_PATH = OLD_PROJECT_DATA / "db/mtga_collection.db"
OLD_STATE_PATH = OLD_PROJECT_DATA / "state/mtga_tracker_enhanced_state.json"

TARGET_DIR = Path.home() / ".config/rhystic-tracker"
TARGET_DB_PATH = TARGET_DIR / "rhystic.db"

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def create_target_schema(conn):
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        date_str TEXT NOT NULL,
        format TEXT,
        result TEXT NOT NULL,
        duration_seconds INTEGER,
        turns INTEGER,
        going_first BOOLEAN,
        hero_deck_name TEXT,
        hero_deck_colors TEXT,
        hero_commander TEXT,
        hero_commander_id INTEGER,
        hero_life_end INTEGER,
        opponent_name TEXT,
        opponent_colors TEXT,
        opponent_commander TEXT,
        opponent_commander_id INTEGER,
        opponent_mulligans INTEGER,
        opponent_life_end INTEGER,
        raw_payload JSON
    );
    """)
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS match_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL,
        grp_id INTEGER NOT NULL,
        is_opponent BOOLEAN NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );
    """)
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS collection_cards (
        grp_id INTEGER PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 0,
        last_updated DATETIME NOT NULL
    );
    """)
    conn.commit()

def migrate_data():
    print("=== Starting Rhystic Tracker Database Migration ===")
    
    if not OLD_DB_PATH.exists() or not OLD_STATE_PATH.exists():
        print(f"Error: Source data files not found in {OLD_PROJECT_DATA}")
        sys.exit(1)
        
    db_sha = sha256_file(OLD_DB_PATH)
    state_sha = sha256_file(OLD_STATE_PATH)
    print(f"Source mtga_collection.db SHA-256: {db_sha}")
    print(f"Source state.json SHA-256:         {state_sha}")
    
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if TARGET_DB_PATH.exists():
        TARGET_DB_PATH.unlink()
        
    conn_target = sqlite3.connect(TARGET_DB_PATH)
    create_target_schema(conn_target)
    cur = conn_target.cursor()
    
    # 1. Migrate Collection Cards
    conn_old = sqlite3.connect(OLD_DB_PATH)
    cur_old = conn_old.cursor()
    cur_old.execute("SELECT grpId, count, last_updated FROM cards")
    old_card_rows = cur_old.fetchall()
    
    for row in old_card_rows:
        cur.execute("INSERT INTO collection_cards (grp_id, quantity, last_updated) VALUES (?, ?, ?)", row)
    conn_old.close()
    
    # 2. Migrate JSON State Matches
    with open(OLD_STATE_PATH, 'r') as f:
        state = json.load(f)
        
    matches = state.get("matches", [])
    
    total_json_hero_card_entries = 0
    total_json_opp_card_entries = 0
    
    for idx, m in enumerate(matches):
        raw_mid = m.get("matchId") or m.get("match_id")
        ts = m.get("timestamp", 0)
        
        # Primary Key Handling: Use matchId if available, else legacy_<timestamp>
        match_id = str(raw_mid) if raw_mid else f"legacy_{ts}"
        
        dt_obj = datetime.fromtimestamp(ts) if ts else datetime.now()
        date_str = m.get("date") or dt_obj.strftime("%Y-%m-%d %H:%M:%S")
        
        # Format colors as CSV
        h_colors = m.get("deck_colors") or m.get("deckColors") or []
        hero_deck_colors = ",".join(h_colors) if isinstance(h_colors, list) else str(h_colors)
        
        o_colors = m.get("opponent_colors") or m.get("opponentColors") or []
        opp_colors = ",".join(o_colors) if isinstance(o_colors, list) else str(o_colors)
        
        # Explicit NULL handling for missing legacy fields
        opp_mulligans = m.get("opponent_mulligans") if "opponent_mulligans" in m else (m.get("opponentMulligans") if "opponentMulligans" in m else None)
        hero_life_end = m.get("hero_life_end") if "hero_life_end" in m else (m.get("heroLife") if "heroLife" in m else None)
        opp_life_end = m.get("opponent_life_end") if "opponent_life_end" in m else (m.get("oppLife") if "oppLife" in m else None)
        
        cur.execute("""
        INSERT INTO matches (
            id, timestamp, date_str, format, result, duration_seconds, turns, going_first,
            hero_deck_name, hero_deck_colors, hero_commander, hero_commander_id, hero_life_end,
            opponent_name, opponent_colors, opponent_commander, opponent_commander_id,
            opponent_mulligans, opponent_life_end, raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            match_id,
            dt_obj.isoformat(),
            date_str,
            m.get("format"),
            m.get("result", "unknown"),
            m.get("duration_seconds") or m.get("duration"),
            m.get("turns"),
            m.get("going_first") if "going_first" in m else m.get("goingFirst"),
            m.get("deck_name") or m.get("deckName"),
            hero_deck_colors,
            m.get("hero_commander") or m.get("heroCommander"),
            m.get("hero_commander_id") or m.get("heroCommanderId"),
            hero_life_end,
            m.get("opponent") or m.get("opponentName"),
            opp_colors,
            m.get("opponent_commander") or m.get("opponentCommander"),
            m.get("opponent_commander_id") or m.get("opponentCommanderId"),
            opp_mulligans,
            opp_life_end,
            json.dumps(m)
        ))
        
        # Process Hero Cards Seen
        hero_cards = m.get("cards_seen") or m.get("cardsSeen") or []
        total_json_hero_card_entries += len(hero_cards)
        
        # Count frequency of grp_ids
        card_counts = {}
        for c in hero_cards:
            try:
                gid = int(c)
                card_counts[gid] = card_counts.get(gid, 0) + 1
            except (ValueError, TypeError):
                pass
                
        for gid, count in card_counts.items():
            cur.execute("""
            INSERT INTO match_cards (match_id, grp_id, is_opponent, count)
            VALUES (?, ?, 0, ?)
            """, (match_id, gid, count))
            
        # Process Opponent Cards Seen
        opp_cards = m.get("opponent_cards_seen") or m.get("opponentCardsSeen") or []
        total_json_opp_card_entries += len(opp_cards)
        
        opp_card_counts = {}
        for c in opp_cards:
            try:
                gid = int(c)
                opp_card_counts[gid] = opp_card_counts.get(gid, 0) + 1
            except (ValueError, TypeError):
                pass
                
        for gid, count in opp_card_counts.items():
            cur.execute("""
            INSERT INTO match_cards (match_id, grp_id, is_opponent, count)
            VALUES (?, ?, 1, ?)
            """, (match_id, gid, count))
            
    conn_target.commit()
    
    # 3. Comprehensive Validation Assertion
    cur.execute("SELECT COUNT(*) FROM matches")
    imported_matches_count = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM collection_cards")
    imported_cards_count = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM match_cards")
    imported_match_cards_count = cur.fetchone()[0]
    
    cur.execute("SELECT COUNT(*) FROM matches WHERE opponent_mulligans IS NULL")
    null_mulligan_count = cur.fetchone()[0]
    
    conn_target.close()
    
    print("\n=== Migration Validation Report ===")
    print(f"Matches Imported:          {imported_matches_count} / {len(matches)} JSON objects (Target: 1700)")
    print(f"Collection Cards Imported: {imported_cards_count} / {len(old_card_rows)} SQLite rows (Target: 24823)")
    print(f"JSON Hero Card Entries:    {total_json_hero_card_entries}")
    print(f"JSON Opponent Card Entries:{total_json_opp_card_entries}")
    print(f"Total Match Cards Rows:    {imported_match_cards_count} (Grouped per-match unique grp_ids)")
    print(f"Legacy Matches NULL Fields: {null_mulligan_count} / 886 legacy matches correctly set to NULL")
    
    assert imported_matches_count == len(matches) == 1700, "Match count mismatch!"
    assert imported_cards_count == len(old_card_rows) == 24823, "Collection card count mismatch!"
    assert null_mulligan_count == 886, "Legacy NULL field handling mismatch!"
    print("✅ MIGRATION SUCCESSFUL & VALIDATED!")

if __name__ == "__main__":
    migrate_data()
