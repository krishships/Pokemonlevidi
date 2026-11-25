# Pokémon Emerald — custom hack

A ROM hack built on [pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion).
The output is a single `.gba` file that runs offline in any GBA emulator, including
Lemuroid on Android.

## What this aims to be

- **New graphics and tiles** — the current focus
- **New regions** — maps and layout, not Kanto/Emerald's Hoenn
- **Less friction**: no random wild encounters, no forced trainer battles on every
  route, no long empty corridors between places worth going

## Building

The ROM is built by CI on every push. Open the **Actions** tab, pick the latest
`Build ROM` run, and download the `rom` artifact — that is the `.gba`.

Locally, if you have `arm-none-eabi` and the usual build deps:

```
make -j$(nproc) MODERN=1
```

## Base

`pokeemerald-expansion` is a decompilation of Pokémon Emerald extended with
modern mechanics (physical/special split, fairy type, reusable TMs, and more).
Everything under `src/`, `data/`, `graphics/` and `include/` is its code.

## Licence and assets

This repository contains no ROM and no ripped Nintendo assets. The decomp's own
code and placeholder graphics are used under their respective licences. A ROM
you build from this must not be distributed.
