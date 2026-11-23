/*
 * action_battle.c — real-time action battle core.
 *
 * Replaces the turn-based loop: every entity acts on the same 60 Hz clock,
 * attacks are telegraphed then become live hitboxes, damage is gated by
 * invulnerability frames, and bosses change phase at HP thresholds.
 *
 * The core is deterministic: identical seed + identical input frames produce
 * an identical battle. tests/test_action_battle.c relies on this.
 */
#include "action_battle.h"

#include <string.h>

#define AB_PLAYER_SPEED AB_FX(3)
#define AB_PLAYER_JUMP_SPEED AB_FX(5)
#define AB_JUMP_MAX 40

#define AB_PLAYER_REACH 40
#define AB_PLAYER_HEIGHT 24
#define AB_PLAYER_DAMAGE 14
#define AB_PLAYER_POISE_DAMAGE 12
#define AB_ATTACK_WINDUP 10 /* frames of the swing, hit window is inside it */

#define AB_SOUL_PER_HIT 9
#define AB_DASH_SPEED AB_FX(6)

#define AB_HURT_IFRAMES 40
#define AB_PHASE_IFRAMES 45
#define AB_STAGGER_FRAMES 50
#define AB_NO_ATTACK 0xFF

/* ---------------- helpers ---------------- */

static uint32_t ab_rng_next(uint32_t *s)
{
    uint32_t x = *s;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *s = x ? x : 0x9E3779B9u;
    return *s;
}

/* inclusive range */
static uint16_t ab_rng_below(uint32_t *s, uint16_t limit)
{
    if (limit == 0)
        return 0;
    return (uint16_t)(ab_rng_next(s) % limit);
}

static ab_fix ab_clamp(ab_fix v, ab_fix lo, ab_fix hi)
{
    if (v < lo)
        return lo;
    if (v > hi)
        return hi;
    return v;
}

static int32_t ab_abs(int32_t v) { return v < 0 ? -v : v; }

static void ab_face_towards(ab_body *self, const ab_body *target)
{
    self->facing = (target->x >= self->x) ? 1 : 0;
}

static void ab_walk(ab_body *self, int32_t px_per_frame, int8_t direction)
{
    self->x += AB_FX(px_per_frame) * direction;
    self->x = ab_clamp(self->x, AB_ARENA_LEFT, AB_ARENA_RIGHT);
}

int ab_boxes_overlap(const ab_body *attacker, uint8_t reach, uint8_t height,
                     const ab_body *target)
{
    int32_t dx = target->x - attacker->x;
    int32_t dy = (int32_t)target->jump_t - (int32_t)attacker->jump_t;

    if (attacker->facing == 0)
        dx = -dx;
    if (dx < -AB_FX(8))
        return 0;
    if (dx > AB_FX((int32_t)reach))
        return 0;
    if (ab_abs(dy) > (int32_t)height)
        return 0;
    return 1;
}

uint8_t ab_entity_phase_for_hp(const ab_boss_def *def, int16_t hp)
{
    int32_t pct;

    if (hp <= 0)
        return 3;
    pct = ((int32_t)hp * 100) / def->hp_max;
    if (pct <= def->phase3_hp_pct)
        return 3;
    if (pct <= def->phase2_hp_pct)
        return 2;
    return 1;
}

/* ---------------- init ---------------- */

void ab_init(ab_battle *b, const ab_boss_def *def, uint32_t seed)
{
    memset(b, 0, sizeof(*b));
    b->def = def;
    b->rng = seed ? seed : 0x1234567u;

    b->player.hp_max = 100;
    b->player.hp = 100;
    b->player.body.x = AB_FX(-96);
    b->player.body.facing = 1;

    b->boss.hp_max = def->hp_max;
    b->boss.hp = def->hp_max;
    b->boss.poise_max = def->poise_max;
    b->boss.poise = def->poise_max;
    b->boss.body.x = AB_FX(64);
    b->boss.body.facing = 0;
    b->boss.phase = 1;
    b->boss.state = AB_ST_IDLE;
    b->boss.attack_id = AB_NO_ATTACK;
    b->boss.cooldown = 45;

    b->outcome = AB_OUTCOME_ONGOING;
    b->events = 0;
    b->frame = 0;
}

/* ---------------- damage ---------------- */

static void ab_hurt_player(ab_battle *b, int16_t damage)
{
    ab_player *p = &b->player;

    if (p->iframes || p->hp <= 0)
        return;

    p->hp = (int16_t)(p->hp - damage);
    if (p->hp < 0)
        p->hp = 0;
    p->iframes = AB_HURT_IFRAMES;
    p->hurt_timer = 12;
    p->focus_timer = 0;
    p->dash_timer = 0;
    b->events |= AB_EV_HIT_PLAYER;
}

static void ab_boss_check_phase(ab_battle *b)
{
    ab_boss *e = &b->boss;
    uint8_t want = ab_entity_phase_for_hp(b->def, e->hp);

    if (want <= e->phase)
        return;

    e->phase = want;
    e->state = AB_ST_PHASE;
    e->state_timer = AB_PHASE_IFRAMES;
    e->iframes = AB_PHASE_IFRAMES;
    e->attack_stage = AB_ACT_NONE;
    e->attack_id = AB_NO_ATTACK;
    b->events |= AB_EV_PHASE;
}

static void ab_hurt_boss(ab_battle *b, int16_t damage, int16_t poise_damage)
{
    ab_boss *e = &b->boss;

    if (e->hp <= 0)
        return;
    if (e->iframes) /* phase roar / stagger immunity */
        return;

    e->hp = (int16_t)(e->hp - damage);
    if (e->hp < 0)
        e->hp = 0;
    b->events |= AB_EV_HIT_BOSS;

    ab_boss_check_phase(b);
    if (e->hp <= 0) {
        e->state = AB_ST_DEAD;
        b->events |= AB_EV_DEATH;
        return;
    }
    if (e->state == AB_ST_PHASE)
        return;

    e->poise = (int16_t)(e->poise - poise_damage);
    if (e->poise <= 0) {
        e->poise = e->poise_max;
        e->state = AB_ST_STAGGER;
        e->state_timer = AB_STAGGER_FRAMES;
        e->attack_stage = AB_ACT_NONE;
        e->attack_id = AB_NO_ATTACK;
        b->events |= AB_EV_STAGGER;
    }
}

/* ---------------- player ---------------- */

static void ab_player_step(ab_battle *b, const ab_input *in)
{
    ab_player *p = &b->player;
    ab_body *body = &p->body;

    if (p->hp <= 0)
        return;

    if (p->iframes)
        p->iframes--;
    if (p->attack_cd)
        p->attack_cd--;
    if (p->dash_cd)
        p->dash_cd--;
    if (p->hurt_timer)
        p->hurt_timer--;

    /* jump arc: rise to AB_JUMP_MAX, then fall back to the ground */
    if (body->airborne) {
        if (body->jump_t < AB_JUMP_MAX) {
            body->jump_t = (uint8_t)(body->jump_t + 5);
            if (body->jump_t > AB_JUMP_MAX)
                body->jump_t = AB_JUMP_MAX;
        } else {
            body->jump_t = (uint8_t)(body->jump_t - 5);
            if (body->jump_t == 0)
                body->airborne = 0;
        }
    }

    if (p->hurt_timer)
        return; /* brief control loss on hit */

    /* dash overrides everything else */
    if (p->dash_timer) {
        p->dash_timer--;
        body->x += (body->facing ? AB_DASH_SPEED : -AB_DASH_SPEED);
        body->x = ab_clamp(body->x, AB_ARENA_LEFT, AB_ARENA_RIGHT);
        return;
    }

    /* focus / heal: hold, no movement, converts soul to HP */
    if (in->focus && p->charge >= AB_FOCUS_COST) {
        p->focus_timer++;
        if (p->focus_timer >= AB_FOCUS_FRAMES) {
            p->focus_timer = 0;
            p->charge = (uint8_t)(p->charge - AB_FOCUS_COST);
            p->hp = (int16_t)(p->hp + AB_FOCUS_HEAL);
            if (p->hp > p->hp_max)
                p->hp = p->hp_max;
        }
        return;
    }
    p->focus_timer = 0;

    if (in->dash && p->dash_cd == 0) {
        p->dash_timer = AB_DASH_FRAMES;
        p->dash_cd = AB_DASH_CD;
        p->iframes = AB_DASH_IFRAMES;
        return;
    }

    if (in->left && !in->right)
        ab_walk(body, 3, -1);
    else if (in->right && !in->left)
        ab_walk(body, 3, 1);

    if (in->jump && !body->airborne) {
        body->airborne = 1;
        body->jump_t = 5;
    }

    /* swing */
    if (p->attack_timer) {
        p->attack_timer--;
        if (p->attack_timer <= 8 && p->attack_timer >= 5) {
            if (ab_boxes_overlap(body, AB_PLAYER_REACH, AB_PLAYER_HEIGHT,
                                 &b->boss.body)) {
                ab_hurt_boss(b, AB_PLAYER_DAMAGE, AB_PLAYER_POISE_DAMAGE);
                p->charge = (uint8_t)(p->charge + AB_SOUL_PER_HIT);
                if (p->charge > AB_SOUL_MAX)
                    p->charge = AB_SOUL_MAX;
            }
        }
    } else if (in->attack && p->attack_cd == 0) {
        p->attack_timer = AB_ATTACK_WINDUP;
        p->attack_cd = 16;
    }

    ab_face_towards(body, &b->boss.body);
}

/* ---------------- boss ---------------- */

static const ab_attack *ab_pick_attack(ab_battle *b)
{
    const ab_boss_def *def = b->def;
    uint16_t total = 0;
    uint16_t roll;
    uint8_t i;

    for (i = 0; i < def->attack_count; i++) {
        const ab_attack *a = &def->attacks[i];
        if (a->weight == 0 || a->min_phase > b->boss.phase)
            continue;
        total = (uint16_t)(total + a->weight);
    }
    if (total == 0)
        return NULL;

    roll = ab_rng_below(&b->rng, total);
    for (i = 0; i < def->attack_count; i++) {
        const ab_attack *a = &def->attacks[i];
        if (a->weight == 0 || a->min_phase > b->boss.phase)
            continue;
        if (roll < a->weight)
            return a;
        roll = (uint16_t)(roll - a->weight);
    }
    return NULL;
}

static uint8_t ab_scaled_cooldown(const ab_battle *b)
{
    uint8_t base = b->def->aggression;
    uint32_t scaled = base;

    if (b->boss.phase == 2)
        scaled = (scaled * 75) / 100;
    else if (b->boss.phase >= 3)
        scaled = (scaled * 55) / 100;

    if (scaled < 8)
        scaled = 8;
    return (uint8_t)scaled;
}

static void ab_begin_attack(ab_battle *b, const ab_attack *a, uint8_t index)
{
    ab_boss *e = &b->boss;

    e->state = AB_ST_ATTACK;
    e->attack_id = index;
    e->attack_stage = AB_ACT_TELEGRAPH;
    e->attack_timer = a->telegraph ? a->telegraph : 1;
    e->hit_done = 0;
}

static void ab_boss_attack_step(ab_battle *b)
{
    ab_boss *e = &b->boss;
    const ab_attack *a;

    if (e->attack_id >= b->def->attack_count) {
        e->state = AB_ST_IDLE;
        e->attack_id = AB_NO_ATTACK;
        return;
    }
    a = &b->def->attacks[e->attack_id];

    if (e->attack_timer)
        e->attack_timer--;

    switch (e->attack_stage) {
    case AB_ACT_TELEGRAPH:
        ab_face_towards(&e->body, &b->player.body);
        if (e->attack_timer == 0) {
            e->attack_stage = AB_ACT_ACTIVE;
            e->attack_timer = a->active ? a->active : 1;
        }
        break;

    case AB_ACT_ACTIVE:
        if (a->lunge)
            ab_walk(&e->body, (int32_t)ab_abs(a->lunge),
                    (int8_t)(e->body.facing ? 1 : -1));
        if (!e->hit_done &&
            ab_boxes_overlap(&e->body, a->range_max, a->height,
                             &b->player.body)) {
            e->hit_done = 1;
            ab_hurt_player(b, a->damage);
        }
        if (e->attack_timer == 0) {
            e->attack_stage = AB_ACT_RECOVERY;
            e->attack_timer = a->recovery;
        }
        break;

    case AB_ACT_RECOVERY:
    default:
        if (e->attack_timer == 0) {
            e->attack_stage = AB_ACT_NONE;
            e->attack_id = AB_NO_ATTACK;
            e->state = AB_ST_IDLE;
            e->cooldown = ab_scaled_cooldown(b);
        }
        break;
    }
}

static void ab_boss_idle_step(ab_battle *b)
{
    ab_boss *e = &b->boss;
    const ab_attack *a;
    int32_t dx = b->player.body.x - e->body.x;
    int32_t adx = ab_abs(dx);
    uint8_t index;
    uint8_t i;

    ab_face_towards(&e->body, &b->player.body);

    if (e->cooldown) {
        e->cooldown--;
        return;
    }

    a = ab_pick_attack(b);
    if (a != NULL) {
        /* find its index so the runtime can look the attack back up */
        for (i = 0, index = AB_NO_ATTACK; i < b->def->attack_count; i++) {
            if (&b->def->attacks[i] == a) {
                index = i;
                break;
            }
        }
        if (adx >= AB_FX((int32_t)a->range_min) &&
            adx <= AB_FX((int32_t)a->range_max)) {
            ab_begin_attack(b, a, index);
            return;
        }
    }

    /* reposition: close the gap, or back off if it is on top of the player */
    if (adx > AB_FX(44))
        ab_walk(&e->body, b->def->walk_speed, (int8_t)(dx > 0 ? 1 : -1));
    else if (adx < AB_FX(14))
        ab_walk(&e->body, b->def->walk_speed, (int8_t)(dx > 0 ? -1 : 1));

    e->cooldown = 6; /* re-evaluate shortly, keep pressing */
}

static void ab_boss_step(ab_battle *b)
{
    ab_boss *e = &b->boss;

    if (e->hp <= 0) {
        e->state = AB_ST_DEAD;
        return;
    }
    if (e->iframes)
        e->iframes--;

    switch (e->state) {
    case AB_ST_PHASE:
        if (e->state_timer)
            e->state_timer--;
        if (e->state_timer == 0) {
            e->state = AB_ST_IDLE;
            e->cooldown = 20;
        }
        return;

    case AB_ST_STAGGER:
        if (e->state_timer)
            e->state_timer--;
        if (e->state_timer == 0) {
            e->state = AB_ST_IDLE;
            e->cooldown = 12;
        }
        return;

    case AB_ST_HURT:
        if (e->state_timer)
            e->state_timer--;
        if (e->state_timer == 0)
            e->state = AB_ST_IDLE;
        return;

    case AB_ST_ATTACK:
        ab_boss_attack_step(b);
        return;

    case AB_ST_IDLE:
    default:
        ab_boss_idle_step(b);
        return;
    }
}

/* ---------------- public step ---------------- */

uint8_t ab_step(ab_battle *b, const ab_input *in)
{
    if (b->outcome != AB_OUTCOME_ONGOING)
        return b->outcome;

    b->events = 0;
    b->frame++;

    ab_player_step(b, in);
    ab_boss_step(b);

    if (b->boss.hp <= 0) {
        b->boss.state = AB_ST_DEAD;
        b->outcome = AB_OUTCOME_WON;
        b->events |= AB_EV_DEATH;
        return b->outcome;
    }
    if (b->player.hp <= 0) {
        b->outcome = AB_OUTCOME_LOST;
        b->events |= AB_EV_DEATH;
        return b->outcome;
    }
    return b->outcome;
}
