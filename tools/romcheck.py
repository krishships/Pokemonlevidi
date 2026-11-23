#!/usr/bin/env python3
"""Validate a built GBA ROM's header.

Catches a build that produced a .gba which is malformed and would fail on
hardware, before it is uploaded as an artifact.

    python3 tools/romcheck.py dist/heart-and-soul.gba

Checks: size is a multiple of 1024, the header checksum at 0xBD matches the
complement of the 29 header bytes at 0xA0..0xBC, the title is printable, and
the Nintendo logo area is populated. The logo bytes themselves are not
compared against a hardcoded copy — that would need a reference image this
project does not ship.
"""
import sys
from pathlib import Path


def check(path: Path) -> int:
    data = path.read_bytes()
    problems = []

    if len(data) < 0xC0:
        print(f"FAIL: {path.name} is {len(data)} bytes, too small to be a ROM")
        return 1

    if len(data) % 1024 != 0:
        problems.append(f"size {len(data)} is not a multiple of 1024")

    title = data[0xA0:0xAC].decode("ascii", "replace").rstrip("\x00 ")
    code = data[0xAC:0xB0].decode("ascii", "replace")
    maker = data[0xB0:0xB2].decode("ascii", "replace")

    if not title:
        problems.append("title field is empty")
    if not all(32 <= ord(c) < 127 for c in title):
        problems.append(f"title {title!r} contains non-printable bytes")

    logo = data[0x04:0xA0]
    if logo == b"\x00" * len(logo):
        problems.append("logo area is all zeros")
    if logo == b"\xff" * len(logo):
        problems.append("logo area is all 0xFF (unpatched)")

    hdr = data[0xA0:0xBD]                      # 29 bytes: 0xA0..0xBC
    computed = (-(sum(hdr) + 0x19)) & 0xFF
    stored = data[0xBD]
    if computed != stored:
        problems.append(f"header checksum stored 0x{stored:02x}, computed 0x{computed:02x}")

    print(f"file: {path.name}")
    print(f"size: {len(data)} bytes ({len(data)/1024/1024:.2f} MB)")
    print(f"title: {title!r}  code: {code!r}  maker: {maker!r}")
    print(f"header checksum: 0x{stored:02x}")

    for p in problems:
        print("FAIL:", p)
    if problems:
        return 1
    print("RESULT: PASS - valid GBA header")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: romcheck.py <rom.gba>")
        return 2
    return check(Path(sys.argv[1]))


if __name__ == "__main__":
    sys.exit(main())
