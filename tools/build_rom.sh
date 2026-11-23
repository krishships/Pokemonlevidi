#!/usr/bin/env bash
# Build the ROM. Requires a base ROM you dumped yourself, supplied either as
# $AB_ROM_BASE64 or already sitting at $BASE_DIR/pokeemerald.gba.
# The ROM is never committed and never uploaded anywhere but this build job.
set -euo pipefail

BASE_DIR="${AB_BASE_DIR:-base/pokeemerald}"
OUT_DIR="${AB_OUT_DIR:-dist}"
ROM_PATH="$BASE_DIR/pokeemerald.gba"

if [ ! -d "$BASE_DIR" ]; then
    echo "no base tree at $BASE_DIR — run tools/fetch_base.sh and tools/graft.sh" >&2
    exit 1
fi

if [ ! -f "$ROM_PATH" ]; then
    if [ -n "${AB_ROM_BASE64:-}" ]; then
        echo "== writing base ROM from AB_ROM_BASE64"
        printf '%s' "$AB_ROM_BASE64" | base64 -d > "$ROM_PATH"
    else
        echo "no base ROM at $ROM_PATH and AB_ROM_BASE64 is empty." >&2
        echo "Dump your own cartridge; this project does not ship one." >&2
        exit 1
    fi
fi

echo "== building"
make -C "$BASE_DIR" -j"$(nproc)"

mkdir -p "$OUT_DIR"
cp "$BASE_DIR/pokeemerald.gba" "$OUT_DIR/heart-and-soul.gba"
echo "== wrote $OUT_DIR/heart-and-soul.gba"
