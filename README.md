# Pokémon Heart and Soul — Live Battle

A **decomp-style ROM hack project** for *Pokémon Heart and Soul*, built on the
`pret/pokeemerald` codebase, whose defining feature is replacing the stock
turn-based battle engine with a **real-time action battle** — dodge, dash,
telegraph-read, punish — in the spirit of Hollow Knight-style boss fights.

This repository holds the hack's own code, data and tooling. It does **not**
contain a ROM, a ROM base, or any ripped Nintendo / Team Cherry assets.
See [docs/LEGAL.md](docs/LEGAL.md).

## Status

| Part | State |
| --- | --- |
| Portable real-time battle core (`src/action_battle.c`) | **working**, 88 host tests green |
| Boss data pipeline (JSON → C tables) | **working**, CI-enforced |
| Boss roster (6 bosses, 36 attacks) | **authored**, tuning in progress |
| Graft onto `pret/pokeemerald` | **patch applies cleanly** @ 9103e52; ARM build unverified |
| Field art, maps, story content | not started |

The battle core is deliberately engine-agnostic: it compiles with plain C11 on
the host (for tests) and on the GBA's ARM7TDMI (for the ROM). Only
`src/pokeemerald/ab_bridge.c` knows about the game engine.

## Layout

```
include/action_battle.h        public API of the battle core
include/generated/bosses.h     generated — do not edit
src/action_battle.c            the live battle simulation
src/generated/bosses_data.c    generated — do not edit
src/pokeemerald/ab_bridge.c    engine glue (GBA build only)
data/bosses/*.json             source of truth for every boss
data/boss_sources.json         where imported bosses came from + licence gate
tests/test_action_battle.c     host test suite
tools/                         codegen, validation, boss import, ROM build
docs/design/                   battle system + boss roster specs
docs/GRAFTING.md               how to graft this onto pokeemerald
.github/workflows/ci.yml       validate → codegen check → build → test
```

## Quick start

```bash
make check     # validate boss JSON + verify generated tables are current
make test      # compile the core and run the test suite
```

No compiler? `pip install ziglang` then
`python3 -m ziglang cc -std=c11 -O2 -Iinclude src/action_battle.c src/generated/bosses_data.c tests/test_action_battle.c -o build/ab_test`.

## Adding a boss

1. Drop a JSON file in `data/bosses/<id>.json` (copy an existing one, or
   `python3 tools/import_bosses.py --pack <file-or-raw-url>`).
2. `python3 tools/validate_bosses.py` — fix anything it flags.
3. `python3 tools/gen_bosses.py` — regenerates the C tables.
4. `make test` — the roster test plays every boss for 3600 frames and checks
   HP, phase and arena invariants.

Design rules for attacks (telegraph length, damage bands, phase gating) are in
[docs/design/ACTION_BATTLE_SPEC.md](docs/design/ACTION_BATTLE_SPEC.md).

## How the battle works

Turn-based concepts are mapped one-for-one onto real-time ones, so existing
species data stays meaningful:

| Turn-based | Live battle |
| --- | --- |
| HP | HP (unchanged) |
| Speed | attack cooldown + boss aggression |
| Accuracy | hitbox overlap — you can dodge |
| PP | soul charge (0–100), spent on focus-heal |
| Status / flinch | poise break → stagger |
| Switching | none — you are locked in the arena |
| Items in battle | focus-heal (hold) and the Poké Flute |

Details, frame timings and the engine hook points:
[docs/design/ACTION_BATTLE_SPEC.md](docs/design/ACTION_BATTLE_SPEC.md).

## Roadmap

- [ ] Graft onto `pret/pokeemerald` and get a bootable build (see GRAFTING.md)
- [ ] Replace the instant-hit projectile approximation with travelling hitboxes
- [ ] Boss arena maps + intro cutscene hooks
- [ ] Audio cues per telegraph stage
- [ ] Balance pass on the roster with real playtests

## Credits & licences

Code and data in this repository: MIT (see `LICENSE`).
Boss *designs* are original; the mechanics are inspired by Hollow Knight
(Team Cherry) and by open Hollow Knight fan projects listed in
`data/boss_sources.json` — used as **references only**, no assets taken.
Pokémon is © Nintendo / Creatures Inc. / GAME FREAK inc. This is a
non-commercial fan project, not affiliated with or endorsed by them.
