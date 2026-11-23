# Red mods

Patches against `pret/pokered`, applied by CI after the clone. The game's
assets never enter this repo — only the diff that changes them.

## Applying locally

```bash
git clone --depth 1 https://github.com/pret/pokered.git base/pokered
for p in patches/red/*.patch; do git -C base/pokered apply "$(pwd)/$p"; done
make -C base/pokered -j"$(nproc)"      # needs rgbds 1.0.4 on PATH
```

## Current mods

| Patch | What it changes |
| --- | --- |
| `0001-the-program-that-woke-up.patch` | Oak's opening speech. He no longer welcomes you to the world of Pokémon — he tells you what you were before you had hands. |
