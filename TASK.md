# Tasks

Ordered by what unblocks the most. Each one says what "done" looks like.

---

## T1. Find `gMapHeader` in RAM  ← blocks everything else

The scanner looks for four consecutive ROM pointers at 0x00/0x04/0x08/0x0C
(`mapLayout`, `events`, `mapScripts`, `connections`) in EWRAM and IWRAM. It
found zero candidates on two attempts.

**Done when:** running it on a save inside the truck prints a map header whose
`events->warpCount` is plausible (the truck has 1 warp) and whose warps decode
to sensible tiles.

**Likely causes to check, in order:**
1. EWRAM reads returning 0 — confirm `gba.bus.read32(0x02000000)` is not zero
   while the game is running. If it is, the emulator is not mapping EWRAM the
   way the bus expects, and the whole approach needs a different read path.
2. The scan window missing the struct — try the full 0x02000000–0x02040000 and
   0x03000000–0x03008000, and print the first 20 words that look like ROM
   pointers so the pattern can be seen rather than guessed.
3. The signature being too strict — some maps have `connections = 0`. Requiring
   3 of the 4 pointers to be in ROM was tried and also found nothing, which
   points at cause 1.

---

## T2. Read the warp table and walk to a door

Once T1 works: read `events->warpCount` (+0x01), `events->warps` (+0x08), and
decode 8-byte `WarpEvent` entries (`s16 x, s16 y, u8 elevation, u8 warpId,
u8 mapNum, u8 mapGroup`).

**Done when:** standing in the truck, the reader prints the door tile, and
pressing the direction that steps onto that tile changes the map id from
`25:40` to `0:9`.

That single result ends the run of failures in this project.

---

## T3. Input-lock probe

`ArePlayerFieldControlsLocked` and `ScriptContext_IsEnabled` are functions, so
they cannot be read directly. Their backing variables are `static` and only
appear in a `.map` file.

**Done when:** "can I press a button right now" is a memory read, not a
direction press followed by a position comparison.

**Blocked on:** symbol addresses (see T5).

---

## T4. Tile graph and A\*

Remember every tile stood on and which direction moved the player. Then A\* to a
target tile instead of wandering.

**Done when:** given a target `(x,y)`, the player reaches it in a straight run
with no backtracking, and revisiting a map reuses the remembered graph.

---

## T5. Get a `.map` file without shipping a ROM

The ROM has no symbol table, and retail addresses do not apply because
`pokeemerald-expansion` moves globals.

**Proposal:** a manual GitHub workflow that builds `pokeemerald-expansion` and
uploads **only `pokeemerald.map`** — build metadata, a few hundred KB, not a
ROM. That does not breach the repo's asset policy and it gives real addresses
for `gMapHeader`, `gSaveBlock1Ptr`, `gMapGroups` and the static input-lock
variables.

**Done when:** `grep gMapHeader pokeemerald.map` gives an address that matches
what the scanner finds at runtime.

---

## T6. Hybrid brain

Local policy for movement and dialogue, Groq only when the local brain meets a
screen it does not recognise. Text only, no image, so a call costs almost
nothing.

**Done when:** a full session from boot to the first route uses fewer than ten
model calls and never stalls on a screen it has seen before.

---

## Questions worth putting to a second model

1. Without a `.map`, is there a reliable way to locate `gMapGroups` in a
   prebuilt ROM — a signature, or a pointer chain from a structure already
   found in RAM?
2. If `gba.bus.read32` returns zero for all of EWRAM in `@gba-kit/gba-emulator`,
   is that a known limitation, and what is the correct accessor?
3. Is `sMessageBoxType` reachable from RAM, or is it file-static with no
   external linkage even in the map file?

---

## Known good, do not redo

- The page: emulator, vision, input, save/autosave/restore, reset, full screen,
  game-only mode.
- Groq only: endpoint pinned at load, model validated, key detected by prefix.
- Cost control: picture every Nth call, on whisper, when stuck, or on scene
  change; a free local description otherwise (12x8 tile map, region colours,
  scroll direction).
- OCR of the dialogue box, on by default, 2.5 s timeout, prefetched.
- Four test suites, all green in CI.
