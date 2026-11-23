#!/usr/bin/env python3
"""Import a boss definition from another project into data/bosses/.

    python3 tools/import_bosses.py --pack ./incoming/boss.json --licence MIT
    python3 tools/import_bosses.py --pack https://raw.githubusercontent.com/OWNER/REPO/main/boss.json \\
        --licence none --acknowledge-reference-only

What it does
  1. loads a JSON pack (single boss, a list of bosses, or {"bosses": [...]})
  2. normalises common field aliases into this repo's schema
  3. gates on licence: permissive licences import cleanly; anything else needs
     --acknowledge-reference-only and then only numeric behaviour fields are
     taken (never art, audio or animation data)
  4. writes data/bosses/<id>.json with a provenance block, then tells you to
     validate, regenerate and test

It never copies files. It reads numbers and writes our own JSON.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOSS_DIR = ROOT / "data" / "bosses"
SOURCES = ROOT / "data" / "boss_sources.json"

# Keys we must never carry across, whatever the source licence.
ASSET_KEYS = {"sprite", "sprites", "texture", "textures", "atlas", "animation",
              "animations", "audio", "sound", "sfx", "music", "prefab", "mesh",
              "model", "shader", "tilemap", "asset", "assets", "png", "wav"}

HP_KEYS = ("hp", "health", "max_hp", "maxhp", "maxHealth", "life", "hitPoints")
POISE_KEYS = ("poise", "posture", "stagger", "stagger_max")
WALK_KEYS = ("walk_speed", "speed", "moveSpeed", "move_speed")
AGGRO_KEYS = ("aggression", "attack_interval", "cooldown", "idle_frames")
TELEGRAPH_KEYS = ("telegraph", "windup", "wind_up", "startup", "anticipation")
ACTIVE_KEYS = ("active", "hitbox_frames", "active_frames", "duration")
RECOVERY_KEYS = ("recovery", "recover", "endlag", "recovery_frames")
DAMAGE_KEYS = ("damage", "dmg", "power")
REACH_KEYS = ("range_max", "reach", "range", "distance")
MIN_RANGE_KEYS = ("range_min", "min_range", "min_distance")


def first(data: dict, keys, default=None):
    for key in keys:
        if key in data and isinstance(data[key], (int, float)) and not isinstance(data[key], bool):
            return int(data[key])
    return default


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", str(value).lower()).strip("_")
    return cleaned or "unnamed_boss"


def fetch(pack: str) -> dict | list:
    if pack.startswith(("http://", "https://")):
        with urllib.request.urlopen(pack, timeout=30) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    return json.loads(Path(pack).read_text(encoding="utf-8"))


def strip_assets(node, dropped: set):
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if key.lower() in ASSET_KEYS:
                dropped.add(key)
                continue
            out[key] = strip_assets(value, dropped)
        return out
    if isinstance(node, list):
        return [strip_assets(item, dropped) for item in node]
    return node


def normalise(raw: dict, source: str, reference_only: bool) -> tuple[dict, list]:
    notes: list = []
    dropped: set = set()
    if reference_only:
        raw = strip_assets(raw, dropped)
        if dropped:
            notes.append(f"dropped asset keys: {sorted(dropped)}")

    name = raw.get("name") or raw.get("id") or "Unnamed Boss"
    boss_id = slug(raw.get("id") or name)

    hp = first(raw, HP_KEYS, 800)
    poise = first(raw, POISE_KEYS, max(40, hp // 6))
    movement = raw.get("movement") if isinstance(raw.get("movement"), dict) else {}
    phases = raw.get("phases") if isinstance(raw.get("phases"), dict) else {}

    phase2 = phases.get("phase2_hp_pct") or first(raw, ("phase2_hp_pct",), 65)
    phase3 = phases.get("phase3_hp_pct") or first(raw, ("phase3_hp_pct",), 30)
    if not (0 < phase3 < phase2 < 100):
        phase2, phase3 = 65, 30
        notes.append("phase thresholds were missing or invalid; defaulted to 65/30")

    walk = movement.get("walk_speed") or first(raw, WALK_KEYS, 2)
    aggression = movement.get("aggression") or first(raw, AGGRO_KEYS, 90)

    raw_attacks = raw.get("attacks") or raw.get("moves") or raw.get("patterns") or []
    if not isinstance(raw_attacks, list) or not raw_attacks:
        raise SystemExit("pack has no attacks/moves/patterns list — nothing to import")

    attacks = []
    for index, atk in enumerate(raw_attacks[:8]):
        if not isinstance(atk, dict):
            continue
        reach = first(atk, REACH_KEYS, 56)
        entry = {
            "id": slug(atk.get("id") or atk.get("name") or f"attack_{index + 1}"),
            "name": str(atk.get("name") or atk.get("id") or f"Attack {index + 1}"),
            "kind": atk.get("kind") if atk.get("kind") in {"melee", "lunge", "projectile", "area"} else "melee",
            "telegraph": max(7, first(atk, TELEGRAPH_KEYS, 16)),
            "active": max(1, first(atk, ACTIVE_KEYS, 6)),
            "recovery": max(0, first(atk, RECOVERY_KEYS, 24)),
            "damage": min(80, max(1, first(atk, DAMAGE_KEYS, 18))),
            "poise_damage": max(0, first(atk, ("poise_damage", "stagger_damage"), 14)),
            "range_min": max(0, first(atk, MIN_RANGE_KEYS, 0)),
            "range_max": min(250, max(8, reach)),
            "height": max(0, min(80, first(atk, ("height", "vertical"), 24))),
            "lunge": max(-12, min(12, first(atk, ("lunge", "dash_speed"), 0))),
            "weight": max(1, min(100, first(atk, ("weight", "chance", "probability"), 25))),
            "min_phase": max(1, min(3, first(atk, ("min_phase", "phase"), 1))),
        }
        if entry["range_min"] >= entry["range_max"]:
            entry["range_min"] = 0
        attacks.append(entry)

    boss = {
        "id": boss_id,
        "name": str(name),
        "epithet": str(raw.get("epithet") or raw.get("title") or ""),
        "archetype": str(raw.get("archetype") or "imported boss — describe the fight here"),
        "inspiration": str(raw.get("inspiration") or "imported"),
        "hp": min(4000, max(200, hp)),
        "poise": min(400, max(40, poise)),
        "phases": {"phase2_hp_pct": int(phase2), "phase3_hp_pct": int(phase3)},
        "movement": {"walk_speed": min(6, max(1, walk)), "aggression": min(240, max(20, aggression))},
        "attacks": attacks,
        "provenance": {
            "origin": "imported",
            "source": source,
            "licence": None,  # filled by caller
            "reference_only": reference_only,
            "notes": "; ".join(notes) if notes else "imported and normalised by tools/import_bosses.py",
        },
    }
    return boss, notes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pack", required=True, help="path or raw GitHub URL to a JSON boss pack")
    parser.add_argument("--licence", default="none", help="SPDX id of the source project, or 'none'")
    parser.add_argument("--acknowledge-reference-only", action="store_true",
                        help="required when the licence is not permissive")
    parser.add_argument("--force", action="store_true", help="overwrite an existing boss file")
    parser.add_argument("--dry-run", action="store_true", help="print, do not write")
    args = parser.parse_args()

    allowed = set(json.loads(SOURCES.read_text(encoding="utf-8"))["allowed_import_licences"])
    reference_only = args.licence not in allowed
    if reference_only and not args.acknowledge_reference_only:
        print(f"licence '{args.licence}' is not in the allowlist {sorted(allowed)}.")
        print("Only numeric behaviour fields may be imported from such a source.")
        print("Re-run with --acknowledge-reference-only to proceed on that basis.")
        return 2

    payload = fetch(args.pack)
    if isinstance(payload, dict) and isinstance(payload.get("bosses"), list):
        raw_bosses = payload["bosses"]
    elif isinstance(payload, list):
        raw_bosses = payload
    else:
        raw_bosses = [payload]

    written = 0
    for raw in raw_bosses:
        if not isinstance(raw, dict):
            continue
        boss, notes = normalise(raw, args.pack, reference_only)
        boss["provenance"]["licence"] = args.licence
        target = BOSS_DIR / f"{boss['id']}.json"
        if target.exists() and not args.force:
            print(f"skip {target.name}: already exists (use --force)")
            continue
        text = json.dumps(boss, indent=2) + "\n"
        if args.dry_run:
            print(text)
        else:
            target.write_text(text, encoding="utf-8")
            written += 1
            print(f"wrote {target.relative_to(ROOT)}  ({len(boss['attacks'])} attacks)")
        for note in notes:
            print(f"  note: {note}")

    if not args.dry_run and written:
        print("\nnext:")
        print("  python3 tools/validate_bosses.py")
        print("  python3 tools/gen_bosses.py")
        print("  make test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
