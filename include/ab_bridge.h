/*
 * ab_bridge.h — the only interface between pokeemerald and the live battle
 * core. Engine-facing: includes engine headers, so host code must not use it.
 */
#ifndef AB_BRIDGE_H
#define AB_BRIDGE_H

#include "global.h"
#include "action_battle.h"

/* Arena table sentinel: a slot whose trainer has not been assigned yet. */
#define AB_ARENA_UNBOUND 0xFFFF

/* TRUE while a live battle is running. */
bool8 AbBridge_IsActive(void);

/* Called once per frame from BattleTurnPassed.
 * Lazily starts a live battle if gTrainerBattleOpponent_A is an arena trainer.
 * Returns TRUE when the engine must skip its own turn logic this frame. */
bool8 AbBridge_Tick(void);

/* Explicit start, for map scripts and debug keys. Returns FALSE if this
 * trainer is not an arena, or if a battle has already been resolved. */
bool8 AbBridge_StartForTrainer(u16 trainerId);

/* Boss definition bound to a trainer id, or NULL. */
const ab_boss_def *AbBridge_BossForTrainer(u16 trainerId);

/* Read-only view of the running battle, for the arena renderer. */
const ab_battle *AbBridge_Current(void);

#endif /* AB_BRIDGE_H */
