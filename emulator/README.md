# Emulator route: an AI that plays the real game

This directory is the other half of the project. Instead of rewriting a game,
fork an emulator frontend and put a brain beside it: read the game's RAM,
decide, inject controller input. The game stays untouched.

## Why a frontend fork works

libretro exposes exactly the two things an AI player needs:

```
retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM)   // see the game state
retro_set_input_state(...)                       // press the buttons
```

Lemuroid (4,539★, Kotlin, GPL-3.0) reaches libretro through LibretroDroid
(118★, C++, GPL-3.0). LibretroDroid already resolves both symbols in
`src/main/cpp/core.cpp`, but its public Kotlin API only surfaces save states —
`serializeState` / `serializeSRAM`. So the hooks exist and are not reachable.

## What the patch does

`libretrodroid-ai-hooks.patch` adds two things and nothing else:

1. **`getSystemRam()`** — returns a direct `ByteBuffer` aliasing the core's
   system RAM. Live view, no copy, valid while the core runs.
2. **`setInputOverride(enabled, mask)`** — bit N of `mask` maps to libretro id N
   (`RETRO_DEVICE_ID_JOYPAD_A == 8`), forced in `handleSetInputState` before the
   touch/gamepad path is consulted.

It applies cleanly to LibretroDroid at the commit this was written against:

```bash
git clone https://github.com/Swordfish90/LibretroDroid.git
cd LibretroDroid && git apply /path/to/libretrodroid-ai-hooks.patch
```

## Kotlin binding still needed

The JNI exports are in place; declare them on the Kotlin side:

```kotlin
// com/swordfish/libretrodroid/LibretroDroid.kt
external fun setInputOverride(enabled: Boolean, mask: Int)
external fun getSystemRam(): java.nio.ByteBuffer?
```

Then a per-frame driver reads RAM, decides, and sets the mask before the next
frame is stepped.

## What this cannot do

**Two independent actors in one Pokémon save.** Input injection gives you one
controller for one character. Gen 1 and Gen 3 have a single player object; a
second walkable actor is engine work, not frontend work.

What it *can* do, and what to build first: **the AI plays the opponent.** You
control your character; the AI reads the battle state and picks the enemy
trainer's moves. Real two-player-vs-AI, in the real game, no engine rewrite.

## Status

- Patch applies cleanly: **verified** (`git apply --check`).
- C++ standard: **verified.** `libretrodroid/src/main/cpp/CMakeLists.txt:4`
  sets `-std=c++17`, so the structured binding (`auto [data, size]`) is legal.
- Compiles: **not verified.** No Android NDK or ARM toolchain in this sandbox.
- Runs on device: **not verified.**

## The web route, for comparison

EmulatorJS (4,363★, JS, GPL-3.0) is the browser equivalent. Verified from source:

- **Input injection: works as shipped.** `EJS_emulator.gameManager.simulateInput(player, index, value)` — the same call the keyboard and gamepad funnel through. No fork needed.
- **RAM reading: needs a fork.** No `retro_get_memory_data` export anywhere in the frontend; the core wasm would have to export it, which means rebuilding cores from `EmulatorJS/build`.
- **No per-frame callback.** `getFrameNum()` can be polled from your own `requestAnimationFrame`, but nothing calls out to you mid-frame.
- **Self-hosting works** — cores resolve against `dataPath`, CDN is only a fallback.

So the web path is the *harder* one for perception, and the easier one for
distribution. Android is the reverse.
