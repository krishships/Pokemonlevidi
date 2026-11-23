# Contributing

## The one rule

**Data first, code second.** Boss behaviour lives in `data/bosses/*.json`, not
in C. If you find yourself special-casing a boss inside `action_battle.c`, stop
and add a field to the schema instead.

## Workflow

1. Branch: `boss/<id>`, `feat/<thing>`, `fix/<thing>`.
2. Edit JSON and/or the core.
3. `make check && make test` — must be green before you push.
4. Open a PR. CI runs the same two commands plus a ROM build if the flag is on.

## Before you push

```bash
make check   # validate_bosses.py + gen_bosses.py --check
make test    # 88 checks
```

If `make check` reports stale generated tables, run
`python3 tools/gen_bosses.py` and commit the result. Never hand-edit
`include/generated/` or `src/generated/`.

## Code rules

- C11, no `malloc`, no floating point in the simulation, no 64-bit math in the
  hot path. The target is a 16.7 MHz ARM7TDMI.
- Every new tunable goes in `include/action_battle.h` and into the spec table in
  `docs/design/ACTION_BATTLE_SPEC.md`. A number without a documented reason is
  a review blocker.
- New behaviour needs a test in `tests/test_action_battle.c`. The determinism
  test will catch anything that reads hidden state.
- Keep `ab_step()` free of I/O. Rendering and audio are the bridge's job.

## Balance changes

Attach the before/after line from the roster test output (the per-boss
`hp / phase / frames / outcome` table) so reviewers can see the effect. Numbers
moved without evidence will be asked to move back.

## Never commit

ROMs, saves, ripped assets, or patches. See [LEGAL.md](docs/LEGAL.md).
