# Emerald map data, from the source

Struct layouts taken from `rh-hideout/pokeemerald-expansion` (not from memory),
so a RAM reader can be written against them instead of guessed.

## MapHeader — the way into everything else

```c
struct MapHeader {
    /* 0x00 */ const struct MapLayout *mapLayout;     // ROM pointer
    /* 0x04 */ const struct MapEvents *events;        // ROM pointer
    /* 0x08 */ const u8 *mapScripts;                  // ROM pointer
    /* 0x0C */ const struct MapConnections *connections; // ROM pointer
    /* 0x10 */ u16 music;
    /* 0x12 */ u16 mapLayoutId;
    ...
};
extern struct MapHeader gMapHeader;
```

Four consecutive ROM pointers at 0x00, 0x04, 0x08 and 0x0C are a strong
signature: scan EWRAM and IWRAM for that pattern and `gMapHeader` is one of the
hits. Verify a hit by reading `events` and checking that `warpCount` is small.

## MapEvents — where the doors are

```c
struct MapEvents {
    u8 objectEventCount;   // +0x00
    u8 warpCount;          // +0x01
    u8 coordEventCount;    // +0x02
    u8 bgEventCount;       // +0x03
    const struct ObjectEventTemplate *objectEvents;  // +0x04
    const struct WarpEvent *warps;                   // +0x08
    const struct CoordEvent *coordEvents;            // +0x0C
    const struct BgEvent *bgEvents;                  // +0x10
};
```

## WarpEvent — a door, exactly

```c
struct WarpEvent {
    s16 x;        // +0x00
    s16 y;        // +0x02
    u8 elevation; // +0x04
    u8 warpId;    // +0x05
    u8 mapNum;    // +0x06
    u8 mapGroup;  // +0x07
};                // 8 bytes
```

This is the fix for "walked into a wall instead of the door": the warp table
gives the door's tile coordinates and where it leads, for the map you are on.
No guessing from pixels, no walking around to find it.

## Why the retail addresses do not work here

`pokeemerald-expansion` adds globals, so the linker places IWRAM and EWRAM
symbols at different addresses than retail BPEE. `0x03005D8C` for
`gSaveBlock1Ptr` is wrong in this build; it was found by scanning IWRAM for a
pointer into EWRAM, and lands at `0x030071F0`.

A ROM has no symbol table. The reliable source of addresses is the `.map` file
from the same commit, or `arm-none-eabi-nm` on the `.elf`. Rebuilding the same
commit with the same toolchain should reproduce the ROM and give you the map.

## Input lock

`gJoyIgnore` is a pokered name and does not exist here. What gates the player
during scripted scenes lives behind `ArePlayerFieldControlsLocked`,
`LockPlayerFieldControls` and `ScriptContext_IsEnabled`; the text box state is
`sMessageBoxType` in `field_message_box.c`, with `IsTextPrinterActive` for text
still printing. These are functions, so they cannot be read from RAM directly —
their backing variables are `static` and appear in the map file.
