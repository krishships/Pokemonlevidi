# Legal and asset policy

This is a non-commercial fan project. Read this before adding any file.

## What is never in this repository

- ROM images of any Pokémon game, in any region, patched or unpatched.
- Save files, save states, or emulator states.
- Ripped graphics, fonts, music, sound effects, cries, or map data from
  Nintendo / GAME FREAK / Creatures titles.
- Ripped assets from Hollow Knight or any other commercial game
  (© Team Cherry), or from a fan project that ships such assets.
- Patch files (`.bps`, `.ips`, `.ups`) that contain the above.

`.gitignore` blocks the common extensions; CI fails on any binary over 2 MB that
is not in an allowlist, so an accidental `git add` of a ROM does not land.

**Bring your own ROM.** Every contributor builds locally against a base ROM
they dumped from a cartridge they own. The build script reads it from
`base/pokeemerald/pokeemerald.gba`, which is git-ignored.

## What is fine here

- Original C code (MIT).
- Original boss designs, stats and attack tables authored for this project.
- Original art, music and text created for the hack.
- Behavioural references to other games: "this attack should feel like a
  telegraphed overhead slam" is a design note, not an asset.

## Referenced fan projects

`data/boss_sources.json` lists the open-source fan projects consulted for
*mechanics understanding*. None of them are vendored, and their assets are not
used. Their licences vary — `HK3DS` is MIT for code only, `hallowdale` is MIT
code with CC BY-NC assets, `hollow_nes` has no explicit licence. Anything with
no clear licence is reference-only and cannot be imported, which is what
`tools/import_bosses.py` enforces.

## If you are a rights holder

Open an issue and the offending file will be removed. No argument needed.
