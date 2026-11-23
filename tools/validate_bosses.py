#!/usr/bin/env python3
"""Validate data/bosses/*.json before codegen.

    python3 tools/validate_bosses.py           # human report
    python3 tools/validate_bosses.py --json    # machine report

Exit code 1 on any error, so CI blocks a bad boss file.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOSS_DIR = ROOT / "data" / "bosses"

KINDS = {"melee", "lunge", "projectile", "area"}

BOSS_REQUIRED = {
    "id": str, "name": str, "epithet": str, "archetype": str, "inspiration": str,
    "hp": int, "poise": int, "phases": dict, "movement": dict, "attacks": list,
    "provenance": dict,
}

ATTACK_REQUIRED = {
    "id": str, "name": str, "kind": str, "telegraph": int, "active": int,
    "recovery": int, "damage": int, "poise_damage": int, "range_min": int,
    "range_max": int, "height": int, "lunge": int, "weight": int,
    "min_phase": int,
}


def check_attack(boss_id: str, index: int, atk: dict, seen: set, errors: list) -> None:
    where = f"{boss_id}.attacks[{index}]"

    if not isinstance(atk, dict):
        errors.append(f"{where}: must be an object")
        return
    for field, kind in ATTACK_REQUIRED.items():
        if field not in atk:
            errors.append(f"{where}: missing '{field}'")
        elif not isinstance(atk[field], kind) or isinstance(atk[field], bool):
            errors.append(f"{where}.{field}: expected {kind.__name__}")
    if any(f not in atk for f in ATTACK_REQUIRED):
        return

    if atk["id"] in seen:
        errors.append(f"{where}: duplicate attack id '{atk['id']}'")
    seen.add(atk["id"])

    if atk["kind"] not in KINDS:
        errors.append(f"{where}.kind: '{atk['kind']}' not in {sorted(KINDS)}")
    if not 1 <= atk["telegraph"] <= 120:
        errors.append(f"{where}.telegraph: must be 1..120 frames")
    if not 1 <= atk["active"] <= 60:
        errors.append(f"{where}.active: must be 1..60 frames")
    if not 0 <= atk["recovery"] <= 120:
        errors.append(f"{where}.recovery: must be 0..120 frames")
    if not 1 <= atk["damage"] <= 80:
        errors.append(f"{where}.damage: must be 1..80 (player has 100 HP)")
    if not 0 <= atk["poise_damage"] <= 100:
        errors.append(f"{where}.poise_damage: must be 0..100")
    if not 0 <= atk["range_min"] < atk["range_max"] <= 250:
        errors.append(f"{where}: need 0 <= range_min < range_max <= 250")
    if not 0 <= atk["height"] <= 80:
        errors.append(f"{where}.height: must be 0..80")
    if not -12 <= atk["lunge"] <= 12:
        errors.append(f"{where}.lunge: must be -12..12 px/frame")
    if not 0 <= atk["weight"] <= 100:
        errors.append(f"{where}.weight: must be 0..100")
    if not 1 <= atk["min_phase"] <= 3:
        errors.append(f"{where}.min_phase: must be 1..3")


def check_boss(data: dict, path: Path, errors: list, warnings: list) -> None:
    name = path.name
    for field, kind in BOSS_REQUIRED.items():
        if field not in data:
            errors.append(f"{name}: missing '{field}'")
        elif not isinstance(data[field], kind) or isinstance(data[field], bool):
            errors.append(f"{name}.{field}: expected {kind.__name__}")
    if any(f not in data for f in BOSS_REQUIRED):
        return

    if data["id"] != path.stem:
        errors.append(f"{name}: id '{data['id']}' must match the filename")
    if not 200 <= data["hp"] <= 4000:
        errors.append(f"{name}.hp: must be 200..4000")
    if not 40 <= data["poise"] <= 400:
        errors.append(f"{name}.poise: must be 40..400")

    phases = data["phases"]
    p2, p3 = phases.get("phase2_hp_pct"), phases.get("phase3_hp_pct")
    if not isinstance(p2, int) or not isinstance(p3, int):
        errors.append(f"{name}.phases: needs integer phase2_hp_pct and phase3_hp_pct")
    elif not (0 < p3 < p2 < 100):
        errors.append(f"{name}.phases: need 0 < phase3_hp_pct < phase2_hp_pct < 100")

    movement = data["movement"]
    if not 1 <= movement.get("walk_speed", 0) <= 6:
        errors.append(f"{name}.movement.walk_speed: must be 1..6")
    if not 20 <= movement.get("aggression", 0) <= 240:
        errors.append(f"{name}.movement.aggression: must be 20..240 frames")

    attacks = data["attacks"]
    if not 1 <= len(attacks) <= 8:
        errors.append(f"{name}.attacks: need 1..8 attacks (AB_MAX_ATTACKS)")
    seen: set = set()
    for i, atk in enumerate(attacks):
        check_attack(data["id"], i, atk, seen, errors)

    if all(isinstance(a, dict) and a.get("weight", 0) == 0 for a in attacks):
        errors.append(f"{name}: every attack has weight 0 — the boss can never act")

    reachable = {a.get("min_phase") for a in attacks if isinstance(a, dict)}
    for phase in (2, 3):
        if phase not in reachable and any(p > phase for p in reachable if p):
            warnings.append(f"{name}: phase {phase} unlocks no new attack")

    if data["provenance"].get("origin") not in {"authored", "imported"}:
        errors.append(f"{name}.provenance.origin: must be 'authored' or 'imported'")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    errors: list = []
    warnings: list = []
    files = sorted(BOSS_DIR.glob("*.json"))
    if not files:
        errors.append(f"no boss files found in {BOSS_DIR}")

    ids: dict = {}
    total_attacks = 0
    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}: invalid JSON — {exc}")
            continue
        if isinstance(data, dict) and isinstance(data.get("id"), str):
            if data["id"] in ids:
                errors.append(f"{path.name}: duplicate boss id '{data['id']}' "
                              f"(also in {ids[data['id']]})")
            ids[data["id"]] = path.name
        check_boss(data, path, errors, warnings)
        if isinstance(data, dict) and isinstance(data.get("attacks"), list):
            total_attacks += len(data["attacks"])

    if args.json:
        print(json.dumps({
            "bosses": len(files), "attacks": total_attacks,
            "errors": errors, "warnings": warnings,
        }, indent=2))
    else:
        print(f"validated {len(files)} boss files, {total_attacks} attacks")
        for w in warnings:
            print(f"  warn  {w}")
        for e in errors:
            print(f"  ERROR {e}")
        print("OK" if not errors else f"{len(errors)} error(s)")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
