#!/usr/bin/env python3
"""Validate a built GBA ROM's header. Catches a malformed build that would
still be uploaded as a .gba and fail on hardware.

    python3 tools/romcheck.py dist/heart-and-soul.gba
"""
import sys
from pathlib import Path

# the 156-byte Nintendo logo every GBA ROM must carry at 0x04
LOGO = bytes.fromhex(
    "24FFAE51699AA2213D84820A84E409AD11248B98C0817F21A352BE199309CE20D"
    "10460A4A18C2D0F08C0C4B0F1AC9317CC5D7881D3A2F1D4B8C4E0C1F4B0F0E0C"
)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: romcheck.py <rom.gba>")
        return 2
    p = Path(sys.argv[1])
    data = p.read_bytes()
    problems = []

    if len(data) < 0xC0:
        print(f"FAIL: {p.name} is {len(data)} bytes, too small to be a ROM")
        return 1

    title = data[0xA0:0xAC].decode("ascii", "replace").rstrip("\x00 ")
    code = data[0xAC:0xB0].decode("ascii", "replace")
    maker = data[0xB0:0xB2].decode("ascii", "replace")

    logo = data[0x04:0x04 + len(LOGO)]
    if logo != LOGO:
        problems.append("Nintendo logo mismatch (first %d bytes differ)"
                        % sum(1 for a, b in zip(logo, LOGO) if a != b))

    hdr = data[0xA0:0xBD]
    checksum = (-(sum(hdr) + 0x19)) & 0xFF
    if checksum != data[0xBD]:
        problems.append(f"header checksum 0x{data[0xBD]:02x} != computed 0x{checksum:02x}")

    size = len(data)
    if size % 1024 != 0:
        problems.append(f"size {size} is not a multiple of 1024")

    print(f"file: {p.name}")
    print(f"size: {size} bytes ({size/1024/1024:.2f} MB)")
    print(f"title: {title!r}  code: {code!r}  maker: {maker!r}")
    print(f"header checksum: 0x{data[0xBD]:02x}")

    if problems:
        for x in problems:
            print("FAIL:", x)
        return 1
    print("RESULT: PASS - valid GBA header")
    return 0


if __name__ == "__main__":
    sys.exit(main())
