#!/usr/bin/env bash
# Build the ROM from source. No base ROM is needed: pokeemerald is a
# decompilation and compiles its own image. (A retail ROM is only required
# for `make compare`, which this script does not run.)
set -euo pipefail

BASE_DIR="${AB_BASE_DIR:-base/pokeemerald}"
OUT_DIR="${AB_OUT_DIR:-dist}"

if [ ! -d "$BASE_DIR" ]; then
    echo "no base tree at $BASE_DIR — run tools/fetch_base.sh and tools/graft.sh" >&2
    exit 1
fi

JOBS="$(nproc 2>/dev/null || echo 2)"
echo "== building with $JOBS jobs (MODERN=1)"
make -C "$BASE_DIR" -j"$JOBS" MODERN=1

mkdir -p "$OUT_DIR"
ROM="$(find "$BASE_DIR" -maxdepth 1 -name '*.gba' | head -1)"
if [ -z "$ROM" ]; then
    echo "build produced no .gba" >&2
    exit 1
fi
cp "$ROM" "$OUT_DIR/heart-and-soul.gba"
echo "== wrote $OUT_DIR/heart-and-soul.gba ($(stat -c%s "$OUT_DIR/heart-and-soul.gba") bytes)"
