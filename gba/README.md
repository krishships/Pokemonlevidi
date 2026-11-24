# Emerald memory bridge

An AI cannot read a GBA cartridge from inside it. It needs an emulator that
exposes memory and input. This is that layer, for Emerald.

## How it works

```
emerald_bridge.lua   runs inside mGBA, opens a TCP socket, answers commands
emerald.py           connects, reads Emerald's SaveBlock1, presses buttons
```

The pattern is the one `gpt-play-pokemon-firered` uses: mGBA + a Lua socket
bridge + an external driver, reduced to what Emerald needs.

## Setup

1. Install **mGBA desktop** 0.10.x (the Qt build).
2. Open the ROM, then **Tools → Scripting → Load script** → `emerald_bridge.lua`.
   The log should say `listening on 8888`.
3. Run the driver:

```bash
python3 gba/emerald.py --port 8888          # one state read
python3 gba/emerald.py --port 8888 --watch  # every second
```

Output:

```
bridge: PONG
pos=(40,12) map=1:9 party=2 frame=1234
```

## Memory used

From the pokeemerald decompilation, for the US Emerald (BPEE) build:

| Address | Meaning |
| --- | --- |
| `0x03005D8C` | `gSaveBlock1Ptr` |
| `+0x00` | player x (s16) |
| `+0x02` | player y (s16) |
| `+0x04` | map group (u8) |
| `+0x05` | map number (u8) |
| `+0x234` | party count (u8) |

Only these are claimed as correct. Add more by checking against a save whose
contents you know.

## What is verified, and what is not

- **Protocol layer: verified.** The driver was tested against a mock bridge
  speaking the same commands, and read `pos=(40,12) map=1:9 party=2` correctly.
- **mGBA side: not verified here.** This sandbox has no display: mGBA's
  AppImage ships only the Qt build (no `mgba` CLI), it has no `offscreen` Qt
  platform plugin, and there is no Xvfb. The Lua script has never been loaded
  into a real mGBA.
- **`mgba` Python bindings: unavailable.** `pip install pygba` installs but
  needs the native `mgba` module, which is not on PyPI and needs cmake + SDL
  headers to build.

On a normal desktop, all three of those go away.

## Why this exists

Pixel heuristics can press A through dialogue. They cannot tell a door from a
wall. Position and map id can — which is the whole reason to read memory.
