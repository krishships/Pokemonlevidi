/*
 * action_battle.h — portable real-time ("live") battle core
 * for the Pokemon Heart and Soul ROM hack.
 *
 * This header has no pokeemerald dependency on purpose: the same code is
 * compiled on the host for tests and on the GBA (ARM7TDMI) for the ROM.
 * The bridge to the game engine lives in src/pokeemerald/ab_bridge.c.
 *
 * Units: positions and velocities are 8.8 fixed point pixels.
 *        jump_t is plain pixels above the ground.
 *        timers are frames at AB_FPS.
 */
#ifndef ACTION_BATTLE_H
#define ACTION_BATTLE_H

#include <stdint.h>

#define AB_FPS 60
#define AB_MAX_ATTACKS 8

/* Arena bounds, in 8.8 fixed point pixels. */
#define AB_ARENA_LEFT (-176 * AB_FX_ONE)
#define AB_ARENA_RIGHT (176 * AB_FX_ONE)

/* Player tunables. Keep in sync with docs/design/ACTION_BATTLE_SPEC.md. */
#define AB_DASH_FRAMES 10
#define AB_DASH_IFRAMES 12
#define AB_DASH_CD 30
#define AB_FOCUS_FRAMES 45
#define AB_FOCUS_COST 33
#define AB_FOCUS_HEAL 30
#define AB_SOUL_MAX 100

typedef int32_t ab_fix;
#define AB_FX_ONE 256
#define AB_FX(x) ((ab_fix)((x) * AB_FX_ONE))
#define AB_FX_INT(x) ((int32_t)((x) / AB_FX_ONE))

/* ---- attack definitions (generated from the JSON boss data) ---- */

typedef enum {
    AB_KIND_MELEE = 0,
    AB_KIND_LUNGE = 1,
    AB_KIND_PROJECTILE = 2,
    AB_KIND_AREA = 3
} ab_attack_kind;

typedef struct {
    const char *id;
    const char *name;
    uint8_t kind;         /* ab_attack_kind */
    uint8_t telegraph;    /* frames of wind-up, damage-free */
    uint8_t active;       /* frames the hitbox is live */
    uint8_t recovery;     /* frames of punish window after */
    int16_t damage;
    int16_t poise_damage;
    uint8_t range_min;    /* px, closest useful distance */
    uint8_t range_max;    /* px, furthest reach */
    uint8_t height;       /* px of vertical tolerance (0 = ground only) */
    int8_t lunge;         /* px/frame forward drift while active */
    uint8_t weight;       /* selection weight, 0 = never picked */
    uint8_t min_phase;    /* first boss phase that may use it */
} ab_attack;

typedef struct {
    const char *id;
    const char *name;
    const char *epithet;
    int16_t hp_max;
    int16_t poise_max;
    uint8_t phase2_hp_pct; /* phase 2 begins at or below this % of max HP */
    uint8_t phase3_hp_pct;
    uint8_t walk_speed;    /* px/frame */
    uint8_t aggression;    /* idle frames between attacks in phase 1 */
    uint8_t attack_count;
    const ab_attack *attacks;
} ab_boss_def;

/* ---- runtime state ---- */

typedef enum {
    AB_ST_IDLE = 0,
    AB_ST_ATTACK,
    AB_ST_DASH,
    AB_ST_HURT,
    AB_ST_STAGGER,
    AB_ST_PHASE,
    AB_ST_DEAD
} ab_state;

typedef enum {
    AB_ACT_NONE = 0,
    AB_ACT_TELEGRAPH,
    AB_ACT_ACTIVE,
    AB_ACT_RECOVERY
} ab_attack_stage;

typedef struct {
    ab_fix x;
    ab_fix y;        /* reserved: 0 for the side-view arena */
    uint8_t facing;  /* 0 = left, 1 = right */
    uint8_t jump_t;  /* px above ground */
    uint8_t airborne;
} ab_body;

typedef struct {
    ab_body body;
    int16_t hp;
    int16_t hp_max;
    uint8_t iframes;
    uint8_t attack_timer;
    uint8_t attack_cd;
    uint8_t dash_timer;
    uint8_t dash_cd;
    uint8_t charge;       /* soul, 0..100 */
    uint8_t focus_timer;
    uint8_t hurt_timer;
} ab_player;

typedef struct {
    ab_body body;
    int16_t hp;
    int16_t hp_max;
    int16_t poise;
    int16_t poise_max;
    uint8_t state;
    uint8_t state_timer;
    uint8_t phase;
    uint8_t attack_id;     /* 0xFF = none */
    uint8_t attack_stage;
    uint8_t attack_timer;
    uint8_t hit_done;      /* one hit per attack instance */
    uint8_t cooldown;
    uint8_t iframes;
} ab_boss;

typedef struct {
    uint8_t left, right, jump, attack, dash, focus, spell;
} ab_input;

#define AB_EV_HIT_PLAYER 0x01u
#define AB_EV_HIT_BOSS 0x02u
#define AB_EV_PHASE 0x04u
#define AB_EV_STAGGER 0x08u
#define AB_EV_DEATH 0x10u

#define AB_OUTCOME_ONGOING 0
#define AB_OUTCOME_WON 1
#define AB_OUTCOME_LOST 2

typedef struct {
    const ab_boss_def *def;
    ab_player player;
    ab_boss boss;
    uint32_t rng;
    uint32_t frame;
    uint8_t outcome;
    uint8_t events; /* bits raised during the last ab_step() */
} ab_battle;

void ab_init(ab_battle *b, const ab_boss_def *def, uint32_t seed);

/* Advance exactly one frame. Returns b->outcome. */
uint8_t ab_step(ab_battle *b, const ab_input *in);

/* Phase a boss with this HP should be in (1..3). */
uint8_t ab_entity_phase_for_hp(const ab_boss_def *def, int16_t hp);

/* True when attacker's hitbox reaches target. */
int ab_boxes_overlap(const ab_body *attacker, uint8_t reach, uint8_t height,
                     const ab_body *target);

#endif /* ACTION_BATTLE_H */
