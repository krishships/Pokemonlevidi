"""emerald.py — talk to the mGBA Lua bridge and read Emerald's state.

Requires: mGBA desktop (0.10.x) running the ROM with `emerald_bridge.lua`
loaded via Tools -> Scripting. mGBA's AppImage is Qt-only and needs a display,
so this cannot run headless on a server without X.

Usage:
    python gba/emerald.py --port 8888            # print state once
    python gba/emerald.py --port 8888 --watch    # print state every second

Emerald (BPEE) memory map used here — from the pokeemerald decompilation:
    gSaveBlock1Ptr   0x03005D8C   pointer to SaveBlock1
    SaveBlock1 +0x00  s16 pos.x
    SaveBlock1 +0x02  s16 pos.y
    SaveBlock1 +0x04  u8  mapGroup
    SaveBlock1 +0x05  u8  mapNum
    SaveBlock1 +0x234 u8  party count

These are the addresses I am confident about. Anything else you add, verify
against a save you know the contents of before trusting it.
"""
from __future__ import annotations

import argparse
import socket
import time
from dataclasses import dataclass

SAVEBLOCK1_PTR = 0x03005D8C
OFF_POS_X = 0x00
OFF_POS_Y = 0x02
OFF_MAP_GROUP = 0x04
OFF_MAP_NUM = 0x05
OFF_PARTY_COUNT = 0x234

KEY = {"a": 0x001, "b": 0x002, "select": 0x004, "start": 0x008,
       "right": 0x010, "left": 0x020, "up": 0x040, "down": 0x080,
       "r": 0x100, "l": 0x200}


class Bridge:
    """One TCP connection to the Lua bridge inside mGBA."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8888, timeout: float = 5.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.f = self.sock.makefile("rwb", buffering=0)

    def cmd(self, text: str) -> str:
        self.f.write((text + "\n").encode())
        line = self.f.readline().decode().strip()
        if not line:
            raise RuntimeError("bridge closed the connection")
        return line

    # -- memory ---------------------------------------------------------
    def read8(self, addr: int) -> int:
        return int(self.cmd(f"READ8 {addr:X}"))

    def read16(self, addr: int) -> int:
        v = int(self.cmd(f"READ16 {addr:X}"))
        return v - 0x10000 if v >= 0x8000 else v

    def read32(self, addr: int) -> int:
        return int(self.cmd(f"READ32 {addr:X}"))

    # -- input ----------------------------------------------------------
    def keys(self, mask: int) -> None:
        self.cmd(f"KEYS {mask:X}")

    def press(self, button: str, frames: int = 4, settle: float = 0.06) -> None:
        mask = KEY[button.lower()]
        self.keys(mask)
        time.sleep(frames / 60.0)
        self.keys(0)
        time.sleep(settle)

    def hold(self, button: str, ms: int) -> None:
        self.keys(KEY[button.lower()])
        time.sleep(ms / 1000.0)
        self.keys(0)

    def frame(self) -> int:
        return int(self.cmd("FRAME"))

    def close(self) -> None:
        try:
            self.f.close()
        finally:
            self.sock.close()


@dataclass
class State:
    x: int
    y: int
    map_group: int
    map_num: int
    party: int
    frame: int

    def __str__(self) -> str:
        return (f"pos=({self.x},{self.y}) map={self.map_group}:{self.map_num} "
                f"party={self.party} frame={self.frame}")


def read_state(b: Bridge) -> State:
    sb1 = b.read32(SAVEBLOCK1_PTR)
    if not (0x02000000 <= sb1 < 0x02040000):
        raise RuntimeError(
            f"gSaveBlock1Ptr looks wrong (0x{sb1:08X}) — is the ROM Emerald, "
            "and is the game past the title screen?"
        )
    return State(
        x=b.read16(sb1 + OFF_POS_X),
        y=b.read16(sb1 + OFF_POS_Y),
        map_group=b.read8(sb1 + OFF_MAP_GROUP),
        map_num=b.read8(sb1 + OFF_MAP_NUM),
        party=b.read8(sb1 + OFF_PARTY_COUNT),
        frame=b.frame(),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8888)
    ap.add_argument("--watch", action="store_true")
    args = ap.parse_args()

    b = Bridge(args.host, args.port)
    print("bridge:", b.cmd("PING"))
    try:
        if args.watch:
            while True:
                print(read_state(b), flush=True)
                time.sleep(1.0)
        else:
            print(read_state(b))
    except KeyboardInterrupt:
        pass
    finally:
        b.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
