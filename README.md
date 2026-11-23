# Emerald — an AI plays, you speak

A Pokémon Emerald ROM, built from source, plus a page that runs it and puts an
AI in the driver's seat. He cannot call an API from inside the cartridge — no
network on a GBA — so the brain lives in the browser, reads the screen, presses
the buttons, and talks to you.

You are not a character. You are the voice he hears.

## What is here

```
site/index.html        the whisper interface: emulator, AI, settings
tools/fetch_base.sh    fetch the pinned pokeemerald base
tools/build_rom.sh     build the ROM (MODERN=1, arm-none-eabi)
tools/romcheck.py      validate the built GBA header
tools/boottest.c       headless GB boot test (binjgb, no display)
patches/red/           mods against pret/pokered
tests/ui.test.js       headless browser test of the whisper page
.github/workflows/     emerald build · red build · UI test · pages
```

## The two halves

**The ROM** is plain Emerald, built from the decompilation. No base ROM is
needed — `pokeemerald` compiles its own image. CI produces `emerald-gba`.

**The AI** is `site/index.html`. Load the ROM into it, and:

- he sees the screen — a frame is captured through the core's own screenshot
  command and sent to the model with every whisper
- he moves — the model answers with an action and a number of steps, which
  become button presses
- he remembers — the last few exchanges go back with each request
- you speak — type, and it arrives as a voice he treats as divine

## Settings

Open **API key · persona · brain**:

| Field | |
| --- | --- |
| Brain | `local` (keywords, offline, no key) or `api` (a model) |
| API key | kept in this browser only, sent to your endpoint and nowhere else |
| Endpoint | any OpenAI-compatible chat endpoint |
| Model | must accept images, e.g. `gpt-4o-mini` |
| Persona | his whole self; edit it freely |

With no key, or if a request fails, he falls back to the local brain instead of
going silent.

## Limits, stated plainly

- **No API inside the ROM.** A GBA has no network. The brain is always outside.
- **Vision is screenshots, not memory.** The shipped EmulatorJS cores do not
  export `retro_get_memory_data`, so he reads pixels, not RAM. The page probes
  for it and uses it if a future core exposes it.
- **He sees one frame per whisper**, not continuous video.

## Build locally

```bash
bash tools/fetch_base.sh     # clone the pinned base into base/
bash tools/build_rom.sh      # → dist/heart-and-soul.gba
python3 tools/romcheck.py dist/heart-and-soul.gba
```

Needs `arm-none-eabi-gcc`, `make`, `python3`, `libpng-dev`.

## Licences

Code here: MIT. No ROM images or ripped assets are in this repository —
the game is compiled from the public decompilation at build time. Pokémon is
© Nintendo / Creatures / GAME FREAK. See `docs/LEGAL.md`.
