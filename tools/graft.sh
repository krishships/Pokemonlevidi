#!/usr/bin/env bash
# Copy this repo's sources into the pokeemerald base tree and apply patches.
# Idempotent: safe to run on every build.
set -euo pipefail

BASE_DIR="${AB_BASE_DIR:-base/pokeemerald}"

if [ ! -d "$BASE_DIR" ]; then
    echo "no base tree at $BASE_DIR — run tools/fetch_base.sh first" >&2
    exit 1
fi

echo "== copying headers"
mkdir -p "$BASE_DIR/include/generated"
cp include/*.h "$BASE_DIR/include/"
cp include/generated/*.h "$BASE_DIR/include/generated/"

echo "== copying sources"
mkdir -p "$BASE_DIR/src/generated" "$BASE_DIR/src/pokeemerald"
cp src/action_battle.c "$BASE_DIR/src/"
cp src/generated/*.c "$BASE_DIR/src/generated/"
cp src/pokeemerald/*.c "$BASE_DIR/src/pokeemerald/"

echo "== applying patches"
shopt -s nullglob
patches=(patches/*.patch)
if [ ${#patches[@]} -eq 0 ]; then
    echo "   (no patches in patches/)"
else
    for p in "${patches[@]}"; do
        if git -C "$BASE_DIR" apply --check "$(pwd)/$p" 2>/dev/null; then
            git -C "$BASE_DIR" apply "$(pwd)/$p"
            echo "   applied $p"
        else
            echo "   skipped $p (already applied or does not apply)"
        fi
    done
fi

echo "== done: $BASE_DIR is grafted"
