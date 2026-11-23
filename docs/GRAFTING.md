# Grafting onto `pret/pokeemerald`

This repo is the hack's *own* code. The engine it builds on lives in a separate
checkout of `pret/pokeemerald`, pinned to a known-good commit. Nothing here
copies engine code, so the two can be updated independently.

## One-time setup

```bash
git clone https://github.com/pret/pokeemerald.git base/pokeemerald
cd base/pokeemerald && git checkout <PINNED_COMMIT> && cd ../..
```

`base/` is git-ignored on purpose — it is a dependency, not part of this repo.

You also need a **ROM base** you own: dump your own `pokeemerald.gba` from a
cartridge and place it at `base/pokeemerald/pokeemerald.gba`. It is git-ignored
and must never be committed or uploaded. CI takes it from a repository secret
(`AB_ROM_BASE64`), which you should only add to a private repo you control.

## Graft

```bash
bash tools/graft.sh
```

which does, in order:

1. copies `include/action_battle.h`, `include/generated/` into
   `base/pokeemerald/include/`
2. copies `src/action_battle.c`, `src/generated/`, `src/pokeemerald/` into
   `base/pokeemerald/src/`
3. applies every `patches/*.patch` with `git apply`
4. adds the new objects to `base/pokeemerald/Makefile`'s source list (the one
   patch that is not optional)

Build:

```bash
bash tools/build_rom.sh      # → dist/heart-and-soul.gba
```

## Toolchain

| Path | Toolchain | Notes |
| --- | --- | --- |
| Default | `agbcc` (`./build_tools.sh`) | matches the retail ROM's codegen |
| Modern | `arm-none-eabi-gcc` + `MODERN=1` | faster, needed for C11 features |

The core is plain C11 with no libc beyond `<string.h>`, so it builds under
either. It has no `malloc`, no floats, and no 64-bit arithmetic on the hot path.

## Hook points

| File in pokeemerald | What to do |
| --- | --- |
| `src/battle_main.c` | at the top of `BattleMainCB2()`, if `FLAG_LIVE_BATTLE` is set, call `AbBridge_RunLiveBattle()` and skip the turn loop |
| `include/battle.h` | add the live-battle fields you need to `struct BattleStruct` (arena id, boss index, tick accumulator) |
| `src/battle_script_commands.c` | short-circuit `BattleTurnPassed` so no turn script runs while live mode is active |
| `src/item_use.c` | Poké Flute → `AbBridge_TriggerArena()` in the field |
| `src/overworld.c` | restore the field state and the camera on battle end |
| `data/battle_scripts_1.s` | boss arenas get a stub script that just enters and exits live mode |

## Frame budget on hardware

The GBA has ~280k cycles per frame. The core costs a few hundred cycles per
entity per tick; the real cost is OBJ count and DMA. Keep the boss to one
composite sprite plus one hitbox flash, and cap active projectiles at 8.

## Order of work

1. Graft the core, build, boot — the ROM should still play normally with the
   flag off. **Do not** wire the AI in yet.
2. Wire the bridge with a debug key that starts a live battle from the field.
3. Convert one arena (Sentinel of Ash) end to end: entry, camera, HUD, win,
   loss.
4. Only then add the remaining five bosses.

## If this repo is public

Do not add `AB_ROM_BASE64` to a public repository. Keep `AB_ENABLE_ROM_BUILD`
unset, or keep the ROM build in a private mirror and push only source here. The
`rom-build` job is gated to manual `workflow_dispatch` runs for exactly this
reason: a pull request must never be able to reach a base ROM.
