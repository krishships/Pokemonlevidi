# RED.EXE — an AI plays, you talk to him

Pokemon Red (Game Boy) or Emerald (GBA), built from the public decompilations,
plus a page that runs the ROM and puts an AI in the driver's seat. A cartridge has
no network, so the brain lives in the browser: it reads the screen, presses the
buttons, and talks to you. You are Dev, an NPC he can hear.

## Bring your own ROM

This repo does **not** build or ship a ROM. You supply one: a Pokémon Emerald
`.gba` you own, dropped into the page with **LOAD ROM**.

If you put `emerald.gba` next to `site/index.html` (or in `site/roms/`), the
page finds and loads it automatically. `.gitignore` keeps ROMs out of git, so
a ROM never lands in the repository by accident.

The AI is not in the ROM — a Game Boy Advance has no network. The brain is the
web page, which runs the ROM and presses its buttons.


## What is here

```
site/index.html        the page: emulator, AI loop, settings, save/reset
gba/emerald_bridge.lua mGBA Lua bridge: memory reads and button input
gba/emerald.py         driver for that bridge (position, map, party)
tests/pure.test.js     unit tests for the parsing and local brain
tests/ui.test.js       headless browser test of the page
.github/workflows/     page test · pages deploy
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

## Run locally

```bash
python3 -m http.server 8000 -d site
```

Open <http://localhost:8000>, press **LOAD ROM**, pick your Emerald `.gba`.
Put the file at `site/emerald.gba` and it loads by itself.

Nothing to install: the page is one HTML file, and the emulator is fetched from
the EmulatorJS CDN on first run.

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
