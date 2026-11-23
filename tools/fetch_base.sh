#!/usr/bin/env bash
# Fetch the pinned pokeemerald base this hack builds against.
# base/ is git-ignored: the engine is a dependency, not part of this repo.
#
# The pin is a commit, not a branch, so an upstream push cannot silently
# break the patch in patches/. Bump AB_BASE_REF deliberately, then re-run
# tools/graft.sh and fix the patch if it no longer applies.
set -euo pipefail

PINNED_REF="${AB_BASE_REF:-9103e529c2fbdd7add4a1ff3350c6c1f92112c42}"
BASE_DIR="${AB_BASE_DIR:-base/pokeemerald}"
REPO_URL="https://github.com/pret/pokeemerald.git"

if [ -d "$BASE_DIR/.git" ]; then
    echo "base already present at $BASE_DIR ($(git -C "$BASE_DIR" rev-parse --short HEAD))"
    exit 0
fi

mkdir -p "$(dirname "$BASE_DIR")"
git init -q "$BASE_DIR"
git -C "$BASE_DIR" remote add origin "$REPO_URL"
git -C "$BASE_DIR" fetch -q --depth 1 origin "$PINNED_REF"
git -C "$BASE_DIR" checkout -q FETCH_HEAD

echo "base pinned at $(git -C "$BASE_DIR" rev-parse --short HEAD) in $BASE_DIR"
