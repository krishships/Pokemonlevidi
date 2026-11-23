# Boss roster

Six bosses, 36 attacks. Every number below lives in `data/bosses/<id>.json`;
this file explains *why* the numbers are what they are.

| # | Boss | Epithet | HP | Poise | Phases | Role |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Sentinel of Ash | Keeper of the Cindered Gate | 780 | 140 | 66 / 33 | tutorial |
| 2 | Mycelial Warden | Bulwark of the Rotting Grove | 960 | 180 | 60 / 25 | armour check |
| 3 | Blade Dancer of the Grove | Three Notes, One Cut | 640 | 90 | 70 / 35 | speed check |
| 4 | Pale Court Duelist | The Last Etiquette | 700 | 100 | 65 / 30 | positioning |
| 5 | Grave Choir Tyrant | Conductor of the Hollow Hymn | 720 | 110 | 62 / 28 | zoning |
| 6 | Brass Bell Beast | What the Bell Woke | 1100 | 220 | 55 / 22 | endurance |

Phase columns are the HP percentages at which phase 2 and phase 3 begin.

## 1. Sentinel of Ash — tutorial

Slow, wide, readable. Every attack has an 18+ frame telegraph so a first-time
player can learn the dash-through answer without dying repeatedly.

- **Ash Cleave** — 18f telegraph, 52 px reach. The bread-and-butter swing.
- **Gate Slam** — area hit, 12 px height, so it is a *ground* attack: jumping
  over it works, dashing through it also works.
- **Ember Lunge** (phase 2) — 5 px/frame forward drift, teaches spacing.
- **Cinder Sweep** (phase 2) — wider, faster, lower damage; the phase-2 tempo.
- **Pyre Descent** (phase 3) — 40 px height, the anti-jump answer.
- **Last Ember** (phase 3) — 10f telegraph, the only genuinely fast move.

## 2. Mycelial Warden — armour check

Teaches that height 0 means "ground only". Its slam and spore attacks cannot
reach a player standing on a platform, but its `mycelial_grasp` and
`roll_charge` can. 180 poise means two staggers per kill with the nail.

## 3. Blade Dancer of the Grove — speed check

The fastest telegraphs in the roster (7–10 frames) and the lowest HP. The
intended solution is dashing *into* the attack rather than away: 12 dash
i-frames cover the whole active window of `first_note` and `second_note`.
Phase 3 chains `third_note` into `final_cadence` with only a 16-frame recovery
between them — that gap is deliberately too short to heal in.

## 4. Pale Court Duelist — positioning

Repositions between strikes; standing still is punished by `sidestep_cut`.
`needle_volley` covers the far half of the arena so cornering is not safe
either. Currently the only boss whose teleport hook is exercised.

## 5. Grave Choir Tyrant — zoning

Keeps distance, fills the arena with slow attacks. `hymn_bolt` and `descant`
have the longest reach in the roster (170–180 px). Weakest in melee: 110 poise
and only two close-range attacks, both phase-locked.

## 6. Brass Bell Beast — endurance

220 poise, 1100 HP, longest attack cycles. Its `brass_charge` has an 18-frame
active window and 7 px/frame lunge, so the punish is *after* it, not during.
Phase 3 `last_toll` is a 20-frame active area attack — the only move in the
game that cannot be dashed through from start to finish; you must be out of
range before it starts.

## Adding a seventh boss

Keep the roster's shape:

- one attack that answers jumping, one that answers standing still
- phase 2 adds reach, phase 3 adds speed (not just damage)
- at least one 30+ frame recovery somewhere, or the fight has no heal window
- poise roughly `hp / 6` for duelists, `hp / 5` for armoured bosses

## Provenance

All six bosses are authored for this project (`provenance.origin: "authored"`).
The archetypes are inspired by Hollow Knight's boss design language; no names,
art, audio, animations or stat tables were taken from Team Cherry or from any
fan project. `data/boss_sources.json` records the references consulted.
