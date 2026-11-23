# Live battle system spec

Replaces the turn-based battle engine with a real-time action fight, one boss
per arena. Target: GBA at 60 Hz, no dynamic allocation, deterministic.

## 1. Frame budget

The whole simulation is 60 ticks per second, fixed step. `ab_step()` must fit
well inside 16.6 ms; it currently runs a handful of integer comparisons per
entity, so the budget is dominated by sprite/OBJ work, not by the core.

Determinism rule: the core never reads a clock, RNG source or input device
directly. Seed goes in through `ab_init()`, input through `ab_step()`. This is
what lets `tests/test_action_battle.c` replay a battle exactly.

## 2. Coordinates

Side-view arena, 352 px wide (`AB_ARENA_LEFT`/`AB_ARENA_RIGHT` = ±176 px).
Positions are 8.8 fixed point; `jump_t` is a plain pixel height above the
ground so vertical checks stay cheap on ARM.

## 3. Entities

**Player** — 100 HP, 3 px/frame walk, 5 px/frame jump arc to 40 px, 40 px nail
reach at 24 px vertical tolerance, 14 damage / 12 poise damage per swing.
Swing is 10 frames with the hitbox live on frames 5–8 of the animation.

**Boss** — stats from `data/bosses/<id>.json`. Three phases, gated by HP
percentage. Phase change triggers a 45-frame roar: invulnerable, no attacks,
resets the current attack.

## 4. Attack lifecycle

Every attack is three stages, and only the middle one can hurt you:

```
TELEGRAPH (telegraph frames)  →  ACTIVE (active frames)  →  RECOVERY (recovery frames)
   wind-up, no hitbox              hitbox live, lunge        punish window
```

One hit per attack instance (`hit_done`), so a 16-frame active window is a
single 30-damage hit, not sixteen.

**Telegraph is the design contract.** A player must be able to read the
wind-up and answer it with a dash. Minimums:

| Boss tier | min telegraph | max active | damage band |
| --- | --- | --- | --- |
| tutorial (Sentinel of Ash) | 14 | 10 | 20–34 |
| mid (Warden, Tyrant) | 14 | 16 | 16–38 |
| duelist (Blade Dancer, Duelist) | 7 | 12 | 12–22 |
| armoured (Brass Bell Beast) | 16 | 20 | 22–40 |

Anything under 7 frames is unreactable at 60 Hz and will be rejected in review.

## 5. Defence

- Taking a hit: 40 i-frames, 12 frames of control loss.
- Dash: 10 frames, 6 px/frame, **12 i-frames**, 30-frame cooldown. Dashing
  through an active hitbox is the intended answer to most attacks.
- Focus-heal: hold, 45 frames locked in place, costs 33 soul, restores 30 HP.
  Soul comes from landing hits (9 per hit, cap 100).
- Poise: each hit removes poise; at zero the boss staggers for 50 frames and
  poise resets to full. Brass Bell Beast (220 poise) needs roughly three
  staggers per kill.

## 6. Boss AI

Idle loop: face the player → tick cooldown → weighted-random pick among attacks
whose `min_phase <= current phase` and `weight > 0` → if the player is inside
`[range_min, range_max]`, begin the attack, otherwise close or open distance
and re-evaluate in 6 frames.

Cooldown between attacks scales with phase: 100% / 75% / 55% of the JSON
`aggression` value, floor 8 frames.

Attack weights are relative, not percentages — adding a phase-3 attack
rebalances the pool automatically.

## 7. Mapping the turn-based engine

Species data stays as-is; the mapping is:

| Turn-based | Live battle | Where |
| --- | --- | --- |
| `hp` / `maxHP` | player and boss HP | `ab_player.hp`, `ab_boss.hp` |
| `speed` | player attack cooldown; boss aggression | `ab_scaled_cooldown()` |
| `accuracy` / `evasion` | replaced by hitbox overlap | `ab_boxes_overlap()` |
| PP | soul charge | `ab_player.charge` |
| status / flinch | poise → stagger | `ab_hurt_boss()` |
| switching | disabled in arena | bridge |
| bag items | focus-heal + Poké Flute | bridge |

### Switching a battle into live mode

The bridge decides per encounter, so scripted turn-based battles can coexist
with boss arenas:

```c
/* src/pokeemerald/ab_bridge.c, called from BattleMainCB2 */
if (VarGet(FLAG_LIVE_BATTLE) && IsBossEncounter(gTrainerBattleOpponent_A))
    AbBridge_RunLiveBattle(&ab_boss_table[BOSS_INDEX_SENTINEL]);
```

`FLAG_LIVE_BATTLE` is a normal event flag, so a map script or an item can set
it. The arena is entered instead of the battle transition; on `AB_OUTCOME_WON`
the bridge sets the boss-defeat flag and returns to the field, on
`AB_OUTCOME_LOST` it runs the whiteout script.

### The Poké Flute

Repurposed as the arena trigger: using it in the field wakes the dormant boss
in the current map, sets `FLAG_LIVE_BATTLE` and starts the live encounter —
the live-battle equivalent of the old scripted "wake the sleeping Pokémon"
turn-based fight. In-battle, its second use is the stagger interrupt: playing
it during a boss telegraph cancels that attack once per phase. (This is a
design decision recorded here so it is not re-litigated in code review.)

## 8. Open problems

1. **Projectiles** currently resolve as instant hitboxes inside `range_max`
   rather than travelling. Needs an entity list and per-frame integration.
2. **Boss teleports** (Pale Court Duelist) are simulated by snapping `x`
   during telegraph; needs a fade + a proper spawn offset so it cannot teleport
   into the player.
3. **Audio telegraphs** are unimplemented; a sound on telegraph start is the
   single biggest accessibility win available.
4. **Camera** — the arena fits one screen today. Multi-screen arenas need a
   camera offset added to every draw call in the bridge.
