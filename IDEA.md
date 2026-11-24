# What this is, and what I want next

A Pokémon Emerald ROM running in a web page, with an AI playing it while you
watch and "whisper" instructions. Everything below is verified working.

## Current state

- `site/index.html` — one file, no build step. Runs a GBA ROM via EmulatorJS
  (mgba core). Vision (screenshots), input (`simulateInput`), save/autosave to
  IndexedDB, reset, full screen, game-only mode.
- Groq is the only provider: endpoint pinned, model from a list, key detected
  from its `gsk_` prefix.
- Cost control: the picture is sent only every Nth call, on a whisper, when
  stuck, or when the scene changes. Other turns get a free local description —
  a 12x8 tile map of the screen in letters, left/centre/right colours, and a
  scroll-direction note.
- Optional OCR of the dialogue box (Tesseract), on by default, with a 2.5 s
  timeout so a slow CDN cannot stall the game.
- Tests: `tests/pure.test.js` (parsing), `tests/ui.test.js` (24 browser checks),
  `tests/split.test.js` (eyes vs brain, picture cadence), `tests/smoke.test.js`
  (every button, no runtime errors). All pass in CI.
- `gba/` — an mGBA Lua bridge and a Python driver for a desktop emulator.

## The wall

EmulatorJS does not export `retro_get_memory_data`, so the page sees pixels
only. It cannot tell a door from a crate, so the bot gets stuck in the first
room of Emerald. Everything else works.

## The plan

Move the brain out of the browser into a local Node process with real memory
access (`@gba-kit/gba-emulator`, pure JS, `gba.bus.read32` works):

1. Read the save block for position and map. Already done by scanning IWRAM for
   a pointer into EWRAM — it lands at `0x030071F0` in this build, because
   pokeemerald-expansion moves globals off the retail addresses.
2. Read `gMapHeader` for the current map's `connections` and `events`, so warps
   (doors) and map exits are known instead of guessed.
3. Keep a tile graph as it explores, then A* to a target tile.
4. Call Groq only when the local brain meets a screen it does not recognise —
   text only, no image, so it is cheap and rarely used.
5. The page becomes the viewer and the whisper box, pointed at localhost.

## What I need help with

- The reliable way to get symbol addresses for a pokeemerald-expansion build
  (a `.map` file from the same commit, presumably), and whether a rebuild with
  the same toolchain reproduces the ROM byte for byte.
- How input is gated during scripted scenes: which symbol to read, and whether
  it is reachable from RAM in a prebuilt ROM.
- The exact struct layout of `gMapHeader`, `MapConnections`, and the warp entry
  in this codebase, with field offsets, so the reader can be written against
  the source rather than guessed.
