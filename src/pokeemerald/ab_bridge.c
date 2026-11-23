/*
 * ab_bridge.c — engine glue between pokeemerald and the action battle core.
 *
 * GBA build only. The host test build never compiles this file, because it
 * includes engine headers that only exist inside a pokeemerald tree.
 *
 * Responsibilities:
 *   - decide, per encounter, whether a battle runs live or turn-based
 *   - own the tick accumulator and feed input into ab_step()
 *   - drive the arena's entry/exit, camera, HUD and audio
 *   - map the outcome back onto the engine (defeat flag / whiteout)
 */
#ifdef POKEMERALD

#include "global.h"
#include "battle.h"
#include "battle_main.h"
#include "event_data.h"
#include "overworld.h"
#include "script.h"
#include "action_battle.h"
#include "generated/bosses.h"

#define AB_FRAMES_PER_TICK 1 /* 60 Hz core, 60 Hz engine */

enum {
    AB_BOSS_INDEX_SENTINEL = 0,
    /* keep in the same order as data/bosses/*.json sorted by id */
};

static ab_battle sBattle;
static const ab_boss_def *sBoss;
static bool8 sLiveActive;

/* --- input ------------------------------------------------------------- */

static void AbBridge_ReadInput(ab_input *in)
{
    in->right  = JOY_NEW(DPAD_RIGHT) ? 1 : 0;
    in->left   = JOY_NEW(DPAD_LEFT) ? 1 : 0;
    in->jump   = JOY_NEW(A_BUTTON) ? 1 : 0;
    in->attack = JOY_NEW(B_BUTTON) ? 1 : 0;
    in->dash   = JOY_HELD(L_BUTTON) ? 1 : 0;
    in->focus  = JOY_HELD(R_BUTTON) ? 1 : 0;
    in->spell  = JOY_NEW(SELECT_BUTTON) ? 1 : 0;
}

/* --- lifecycle --------------------------------------------------------- */

bool8 AbBridge_IsLiveEncounter(u16 trainerId)
{
    /* Arenas are trainer battles whose id is registered as a boss arena. */
    return gAbBossArenaByTrainer[trainerId] != AB_NO_ARENA;
}

void AbBridge_Start(const ab_boss_def *def)
{
    sBoss = def;
    sLiveActive = TRUE;
    ab_init(&sBattle, def, (u32)GetTrainerId(gSaveBlock2Ptr->playerTrainerId) ^ 0x5EED);
    /* enter the arena instead of the battle transition */
    AbArena_Enter(def->id);
}

/* Called once per frame while a live battle is running. Returns TRUE when the
 * engine should skip its own battle logic for this frame. */
bool8 AbBridge_Tick(void)
{
    ab_input in;
    u8 outcome;

    if (!sLiveActive)
        return FALSE;

    AbBridge_ReadInput(&in);
    outcome = ab_step(&sBattle, &in);

    if (sBattle.events & AB_EV_PHASE)
        AbArena_PhaseRoar(sBattle.boss.phase);
    if (sBattle.events & AB_EV_STAGGER)
        AbArena_Stagger();
    if (sBattle.events & AB_EV_HIT_PLAYER)
        AbArena_PlayerHurt();
    if (sBattle.events & AB_EV_HIT_BOSS)
        AbArena_BossHurt(sBattle.boss.hp, sBattle.boss.hp_max);

    AbArena_Draw(&sBattle.player.body, &sBattle.boss.body, sBattle.boss.phase);

    if (outcome == AB_OUTCOME_WON) {
        sLiveActive = FALSE;
        FlagSet(AbArena_DefeatFlag(sBoss->id));
        AbArena_Exit();
        return TRUE;
    }
    if (outcome == AB_OUTCOME_LOST) {
        sLiveActive = FALSE;
        AbArena_Exit();
        ScriptContext_SetupScript(EventScript_WhiteOut);
        return TRUE;
    }
    return TRUE;
}

/* --- field hooks ------------------------------------------------------- */

/* Poké Flute in the field: wake the dormant boss in this map and enter its
 * arena. This is the live-battle replacement for the scripted "wake the
 * sleeping Pokémon" turn-based encounter. */
bool8 AbBridge_TriggerArena(void)
{
    const ab_boss_def *def = AbArena_BossForCurrentMap();

    if (def == NULL)
        return FALSE;
    FlagSet(FLAG_LIVE_BATTLE);
    AbBridge_Start(def);
    return TRUE;
}

/* Called from item_use.c for the Poké Flute. */
void AbBridge_UsePokeFlute(void)
{
    if (AbBridge_TriggerArena())
        return;
    /* no arena here: fall through to the vanilla behaviour */
    PlaySE(SE_POKE_FLUTE);
}

#endif /* POKEMERALD */
