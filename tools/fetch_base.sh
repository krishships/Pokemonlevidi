#!/usr/bin/env bash
# Clone the pinned pokeemerald base this hack builds against.
# base/ is git-ignored: the engine is a dependency, not part of this repo.
set -euo pipefail

PINNED_REF="${AB_BASE_REF:-master}"
BASE_DIR="${AB_BASE_DIR:-base/pokeemerald}"

if [ -d "$BASE_DIR/.git" ]; then
    echo "base already present at $BASE_DIR"
else
    mkdir -p "$(dirname "$BASE_DIR")"
    git clone --depth 1 --branch "$PINNED_REF" \
        https://github.com/pret/pokeemerald.git "$BASE_DIR"
fi

echo "base at $(git -C "$BASE_DIR" rev-parse --short HEAD)"
