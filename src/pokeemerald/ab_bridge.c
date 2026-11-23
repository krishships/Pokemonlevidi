/*
 * ab_bridge.c — engine glue between pokeemerald and the action battle core.
 *
 * Compiled only in the ROM build (POKEMERALD defined by the engine's own
 * headers being present). Every symbol used here was checked against
 * pret/pokeemerald @ 9103e52; see docs/GRAFTING.md for the call sites.
 *
 * The bridge is deliberately thin:
 *   - it maps arena trainers to boss definitions
 *   - it feeds joypad state into ab_step() once per frame
 *   - it hands the outcome back as gBattleOutcome so the engine's existing
 *     end-of-battle path (win text, whiteout) runs unchanged
 *
 * Rendering, camera and audio are NOT implemented here yet; see the TODO
 * block at the bottom. Nothing in this file draws to the screen.
 */
#include "global.h"
#include "battle.h"
#include "battle_main.h"
#include "battle_setup.h"
#include "constants/battle.h"
#include "event_data.h"
#include "main.h"
#include "string_util.h"
#include "ab_bridge.h"
#include "generated/bosses.h"

/* ---------------------------------------------------------------------------
 * Arena table.
 *
 * Assign the trainer id of each boss encounter here. A slot left as
 * AB_ARENA_UNBOUND is inert, so this file compiles and behaves safely before
 * any map content exists. defeatFlag is set when the boss is beaten.
 * ------------------------------------------------------------------------- */
struct AbArenaDef
{
    u16 trainerId;
    const char *bossId;
    u16 defeatFlag;
};

static const struct AbArenaDef sArenas[] =
{
    { AB_ARENA_UNBOUND, "sentinel_of_ash",            FLAG_UNUSED_0x020 },
    { AB_ARENA_UNBOUND, "mycelial_warden",            FLAG_UNUSED_0x021 },
    { AB_ARENA_UNBOUND, "blade_dancer_of_the_grove",  FLAG_UNUSED_0x022 },
    { AB_ARENA_UNBOUND, "pale_court_duelist",         FLAG_UNUSED_0x023 },
    { AB_ARENA_UNBOUND, "grave_choir_tyrant",         FLAG_UNUSED_0x024 },
    { AB_ARENA_UNBOUND, "brass_bell_beast",           FLAG_UNUSED_0x025 },
};

static ab_battle sBattle;
static const ab_boss_def *sBoss;
static bool8 sActive;

/* ------------------------------------------------------------------------- */

const ab_boss_def *AbBridge_BossForTrainer(u16 trainerId)
{
    u32 i;

    if (trainerId == AB_ARENA_UNBOUND)
        return NULL;

    for (i = 0; i < ARRAY_COUNT(sArenas); i++)
    {
        if (sArenas[i].trainerId == trainerId)
            return ab_boss_lookup(sArenas[i].bossId);
    }
    return NULL;
}

static u16 AbBridge_DefeatFlagFor(const char *bossId)
{
    u32 i;

    for (i = 0; i < ARRAY_COUNT(sArenas); i++)
    {
        if (sArenas[i].bossId == bossId || StringCompare(sArenas[i].bossId, bossId) == 0)
            return sArenas[i].defeatFlag;
    }
    return 0;
}

bool8 AbBridge_IsActive(void)
{
    return sActive;
}

const ab_battle *AbBridge_Current(void)
{
    return &sBattle;
}

/* ------------------------------------------------------------------------- */

static void AbBridge_ReadInput(ab_input *in)
{
    in->right  = JOY_HELD(DPAD_RIGHT) ? 1 : 0;
    in->left   = JOY_HELD(DPAD_LEFT) ? 1 : 0;
    in->jump   = JOY_NEW(A_BUTTON) ? 1 : 0;
    in->attack = JOY_NEW(B_BUTTON) ? 1 : 0;
    in->dash   = JOY_NEW(L_BUTTON) ? 1 : 0;
    in->focus  = JOY_HELD(R_BUTTON) ? 1 : 0;
    in->spell  = JOY_NEW(SELECT_BUTTON) ? 1 : 0;
}

/* Seed from the save so two runs of the same save replay the same fight. */
static u32 AbBridge_Seed(void)
{
    u32 seed = 0;
    u32 i;

    for (i = 0; i < TRAINER_ID_LENGTH; i++)
        seed = (seed << 8) | (u32)(gSaveBlock2Ptr->playerTrainerId[i] & 0xFF);

    return seed ? seed : 1;
}

bool8 AbBridge_StartForTrainer(u16 trainerId)
{
    const ab_boss_def *def = AbBridge_BossForTrainer(trainerId);

    if (def == NULL)
        return FALSE;
    if (sActive)
        return TRUE;

    sBoss = def;
    ab_init(&sBattle, def, AbBridge_Seed());
    sActive = TRUE;
    return TRUE;
}

/* ------------------------------------------------------------------------- */

bool8 AbBridge_Tick(void)
{
    ab_input in;
    u8 outcome;

    if (!sActive)
        return AbBridge_StartForTrainer(gTrainerBattleOpponent_A);

    AbBridge_ReadInput(&in);
    outcome = ab_step(&sBattle, &in);

    if (outcome == AB_OUTCOME_ONGOING)
        return TRUE;

    /* Resolve through the engine: setting gBattleOutcome and returning FALSE
     * lets the normal end-of-battle handling run (win text / whiteout). */
    sActive = FALSE;
    if (outcome == AB_OUTCOME_WON)
    {
        u16 flag = AbBridge_DefeatFlagFor(sBoss->id);

        if (flag != 0)
            FlagSet(flag);
        gBattleOutcome = B_OUTCOME_WON;
    }
    else
    {
        gBattleOutcome = B_OUTCOME_LOST;
    }
    return FALSE;
}

/* ---------------------------------------------------------------------------
 * TODO — not implemented yet, and deliberately absent rather than stubbed
 * behind a function name that nothing calls:
 *
 *   1. arena rendering (AbArena_Draw): draw both bodies, telegraph flash and
 *      the boss HP/poise bars from AbBridge_Current()
 *   2. camera: the arena is 352 px, one screen wide, so no camera yet
 *   3. audio: one SE per telegraph stage
 *   4. field entry: the Poké Flute has no out-of-battle handler in the base
 *      ROM, so the item needs a case adding to the party-menu item dispatch
 *      before it can call AbBridge_StartForTrainer()
 * ------------------------------------------------------------------------- */

