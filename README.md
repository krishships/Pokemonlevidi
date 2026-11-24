# RED.EXE — an AI plays, you talk to him

Pokemon Red (Game Boy) or Emerald (GBA), built from the public decompilations,
plus a page that runs the ROM and puts an AI in the driver's seat. A cartridge has
no network, so the brain lives in the browser: it reads the screen, presses the
buttons, and talks to you. You are Dev, an NPC he can hear.

## Getting the ROM

**You do not need to own or supply a ROM.** `pokeemerald` is a decompilation:
it compiles its own image from source. CI does that on every push to `main`,
and the same build works locally with no base ROM.

### The newest build

1. Open **Actions → CI** on this repo
2. Click the newest green run (or **Run workflow** to build one right now)
3. Scroll to **Artifacts** and download **`emerald-gba`**
4. Unzip it — you get `emerald.gba` (16 MB, title `POKEMON EMER`, code `BPEE`)

The run summary prints the commit, size and **sha256** of the ROM, so you can
tell two builds apart instead of guessing by filename.

Artifacts are kept for 90 days and require you to be signed in, because a
public download of a Pokémon ROM is redistribution of Nintendo's game — this
repo's `docs/LEGAL.md` rules that out. If you want a permanent link, build it
locally:

```bash
bash tools/fetch_base.sh      # clones pret/pokeemerald
bash tools/build_rom.sh       # writes dist/emerald.gba
```

### What is in the ROM

Stock Emerald, compiled from source. The AI is **not** in the ROM — a Game Boy
Advance has no network, so nothing can call a model from inside the cartridge.
The AI lives in `site/index.html`, which runs the ROM in a browser and presses
its buttons.


## What is here

```
site/index.html        the page: emulator, AI loop, settings
tools/fetch_base.sh    fetch the pinned pokeemerald base
tools/build_rom.sh     build the ROM (MODERN=1, arm-none-eabi)
tools/romcheck.py      validate the built GBA header
tools/boottest.c       headless GB boot test (binjgb, no display)
patches/red/           mods against pret/pokered
tests/pure.test.js     unit tests for the parsing and local brain
tests/ui.test.js       headless browser test of the page
.github/workflows/     emerald build · red build · UI test · pages
```

## The two halves

**The ROM** is built from the public decompilations. CI produces `emerald-gba`
(plus `pokeemerald.map`, which lists every memory address for later) and `red-gb`
(Pokemon Red with the patched Oak intro).

**The AI** is `site/index.html`, styled like the Red/Blue text boxes. Load a ROM, then:

- **he plays by himself.** While awake, Red looks at the screen every few seconds,
  the model answers with a short line and 1 to 12 button presses, and the page
  presses them. No random walking in API mode.
- **you are Dev, an NPC he can hear.** Type in the box; it reaches him on his next turn.
- **he remembers** the last few exchanges.
- **he knows the secret:** his persona says he came from programming. Edit it freely.
- **if the screen stops changing,** the next prompt tells him he is blocked or in a text box.

## Using the API (Groq, OpenAI, or any OpenAI-compatible endpoint)

Open **KEY / BRAIN / RED**:

1. Tap **GROQ** (or OPENAI) to fill endpoint and model.
2. Paste your key. Tap **LIST MODELS** and put a model that accepts images in MODEL.
3. Tap **SAVE**. A newly added key switches the brain to API.
4. Press **TEST AI**. It shows the exact error (HTTP code, CORS, no vision) if anything is wrong.
5. Press **WAKE RED**.

The key stays in your browser. If Groq blocks direct browser calls (a CORS error),
put the API behind a small proxy and use its URL as the endpoint.

Free plans have rate limits: raise "seconds between moves" if you see 429.

## Limits, stated plainly

- **No API inside the ROM.** A GBA/GB has no network. The brain is always outside.
- **Vision is screenshots, not memory.** The shipped EmulatorJS cores do not export
  `retro_get_memory_data`, so he reads pixels, not RAM.
- **One ROM per page visit.** Reload the page to switch games.
- **Emerald's opening truck room** traps a pixel-only bot. Use Red for testing.

## Build locally

```bash
bash tools/fetch_base.sh     # clone the pinned base into base/
bash tools/build_rom.sh      # → dist/emerald.gba
python3 tools/romcheck.py dist/emerald.gba
```

Needs `arm-none-eabi-gcc`, `make`, `python3`, `libpng-dev`.

## Licences

Code here: MIT. No ROM images or ripped assets are in this repository —
the game is compiled from the public decompilation at build time. Pokémon is
© Nintendo / Creatures / GAME FREAK. See `docs/LEGAL.md`.

## Get the latest Emerald ROM (no ROM needed)

Actions > **Build latest Emerald** > Run workflow. Choose `pokeemerald-expansion`
(the "EE" base) or plain `pokeemerald`, and a branch (`master` is newest). It
compiles the ROM from source and uploads `emerald.gba` and `emerald.map` as the
`emerald-latest` artifact (kept 3 days). Keep this repo private: a built ROM
contains Nintendo's assets and should not be shared.

## Full screen

FULL SCREEN fills the phone: game on top, chat below, and the message box stays
above the keyboard. Landscape puts the game left and the chat right.

## Save and reset

Refreshing the page keeps everything: your ROM, the saved game, the key and settings,
Red's memory and the chat. **SAVE** writes the game now (it also autosaves every minute
and when you leave the page). **RESET** erases all of it; tap it twice within 4 seconds.
The ROM and save live only in this browser.
