/*
 * Host-side unit tests for the action battle core.
 * Built and run by `make test`; also the CI gate on every push.
 */
#include <stdio.h>
#include <string.h>

#include "action_battle.h"
#include "generated/bosses.h"

static int g_checks;
static int g_failures;

#define CHECK(cond, fmt, ...)                                              \
    do {                                                                   \
        g_checks++;                                                        \
        if (!(cond)) {                                                     \
            g_failures++;                                                  \
            printf("  FAIL %s:%d  " fmt "\n", __FILE__, __LINE__,          \
                   ##__VA_ARGS__);                                         \
        }                                                                  \
    } while (0)

static const ab_input IDLE = {0, 0, 0, 0, 0, 0, 0};

static void run_frames(ab_battle *b, const ab_input *in, int frames)
{
    int i;
    for (i = 0; i < frames; i++)
        ab_step(b, in);
}

/* ---------------- tests ---------------- */

static void test_init(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];

    printf("init\n");
    ab_init(&b, def, 1);
    CHECK(b.player.hp == b.player.hp_max, "player starts at full HP");
    CHECK(b.boss.hp == def->hp_max, "boss starts at full HP");
    CHECK(b.boss.phase == 1, "boss starts in phase 1");
    CHECK(b.outcome == AB_OUTCOME_ONGOING, "battle starts ongoing");
    CHECK(b.boss.body.facing == 0, "boss faces the player's side");
}

static void test_telegraph_is_safe(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];
    const ab_attack *a = &def->attacks[0];
    int16_t hp;

    printf("telegraph deals no damage\n");
    ab_init(&b, def, 7);
    /* park the player inside the attack's range */
    b.player.body.x = b.boss.body.x - AB_FX(20);
    b.boss.cooldown = 0;
    run_frames(&b, &IDLE, 1);
    hp = b.player.hp;

    /* force the attack, then walk only through its telegraph window */
    b.boss.attack_id = 0;
    b.boss.attack_stage = AB_ACT_TELEGRAPH;
    b.boss.attack_timer = a->telegraph;
    b.boss.state = AB_ST_ATTACK;
    b.boss.hit_done = 0;
    run_frames(&b, &IDLE, a->telegraph ? a->telegraph - 1 : 0);
    CHECK(b.player.hp == hp, "player untouched during telegraph");
    CHECK(b.boss.attack_stage == AB_ACT_TELEGRAPH, "still winding up");
}

static void test_active_frame_hits(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];
    int16_t hp;

    printf("active hitbox deals damage\n");
    ab_init(&b, def, 11);
    b.player.body.x = b.boss.body.x - AB_FX(20);
    b.boss.state = AB_ST_ATTACK;
    b.boss.attack_id = 0;
    b.boss.attack_stage = AB_ACT_ACTIVE;
    b.boss.attack_timer = 3;
    b.boss.hit_done = 0;
    hp = b.player.hp;

    ab_step(&b, &IDLE);
    CHECK(b.player.hp < hp, "player took damage on the active frame");
    CHECK(b.events & AB_EV_HIT_PLAYER, "hit event raised");
    CHECK(b.player.iframes > 0, "hit grants invulnerability frames");
}

static void test_dash_iframes(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];
    ab_input dash = IDLE;
    int16_t hp;

    printf("dash iframes\n");
    ab_init(&b, def, 3);
    b.player.body.x = b.boss.body.x - AB_FX(20);
    b.player.dash_cd = 0;
    dash.dash = 1;
    ab_step(&b, &dash);
    CHECK(b.player.dash_timer > 0, "dash started");
    CHECK(b.player.iframes == AB_DASH_IFRAMES, "dash grants iframes");

    b.boss.state = AB_ST_ATTACK;
    b.boss.attack_id = 0;
    b.boss.attack_stage = AB_ACT_ACTIVE;
    b.boss.attack_timer = 3;
    b.boss.hit_done = 0;
    hp = b.player.hp;
    ab_step(&b, &IDLE);
    CHECK(b.player.hp == hp, "dashing through an attack takes no damage");
}

static void test_phase_transition(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];

    printf("phase transition\n");
    ab_init(&b, def, 5);
    CHECK(ab_entity_phase_for_hp(def, def->hp_max) == 1, "full HP is phase 1");
    CHECK(ab_entity_phase_for_hp(def, (int16_t)(def->hp_max / 2)) >= 2,
          "half HP is phase 2 or later");

    b.boss.hp = (int16_t)(def->hp_max * def->phase2_hp_pct / 100);
    b.boss.poise = b.boss.poise_max;
    b.boss.iframes = 0;
    b.player.body.x = b.boss.body.x - AB_FX(20);
    b.player.attack_cd = 0;
    {
        ab_input atk = IDLE;
        atk.attack = 1;
        run_frames(&b, &atk, 6);
    }
    CHECK(b.boss.phase >= 2, "boss advanced past phase 1");
    CHECK(b.boss.iframes > 0, "phase change grants the boss a roar window");
}

static void test_poise_stagger(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];

    printf("poise stagger\n");
    ab_init(&b, def, 9);
    b.boss.poise = 1;
    b.boss.iframes = 0;
    b.player.body.x = b.boss.body.x - AB_FX(20);
    b.player.attack_cd = 0;
    {
        ab_input atk = IDLE;
        atk.attack = 1;
        run_frames(&b, &atk, 6);
    }
    CHECK(b.boss.state == AB_ST_STAGGER || (b.events & AB_EV_STAGGER),
          "breaking poise staggers the boss");
    CHECK(b.boss.poise > 0, "poise is restored after a stagger");
}

static void test_focus_heals(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];
    ab_input focus = IDLE;
    int16_t hp;

    printf("focus heal\n");
    ab_init(&b, def, 13);
    b.player.hp = 40;
    b.player.charge = 60;
    focus.focus = 1;
    run_frames(&b, &focus, AB_FOCUS_FRAMES + 2);
    hp = b.player.hp;
    CHECK(hp > 40, "focus restored HP (now %d)", hp);
    CHECK(b.player.charge < 60, "focus spent soul");
}

static void test_determinism(void)
{
    ab_battle a, c;
    const ab_boss_def *def = &ab_boss_table[1];
    uint32_t seed = 0xC0FFEE;
    int i;
    uint32_t input_state = 1;

    printf("determinism\n");
    ab_init(&a, def, seed);
    ab_init(&c, def, seed);

    for (i = 0; i < 900; i++) {
        ab_input in = IDLE;
        input_state = input_state * 1103515245u + 12345u;
        in.left = (input_state >> 8) & 1;
        in.right = (input_state >> 9) & 1;
        in.attack = (input_state >> 10) & 1;
        in.dash = (input_state >> 11) & 1;
        in.jump = (input_state >> 12) & 1;
        ab_step(&a, &in);
        ab_step(&c, &in);
    }
    CHECK(a.boss.hp == c.boss.hp, "same seed, same boss HP");
    CHECK(a.player.hp == c.player.hp, "same seed, same player HP");
    CHECK(a.boss.phase == c.boss.phase, "same seed, same phase");
    CHECK(a.frame == c.frame, "same seed, same frame count");
}

static void test_player_death(void)
{
    ab_battle b;
    const ab_boss_def *def = &ab_boss_table[0];

    printf("player death ends the battle\n");
    ab_init(&b, def, 21);
    b.player.hp = 1;
    b.player.iframes = 0;
    b.boss.state = AB_ST_ATTACK;
    b.boss.attack_id = 0;
    b.boss.attack_stage = AB_ACT_ACTIVE;
    b.boss.attack_timer = 3;
    b.player.body.x = b.boss.body.x - AB_FX(20);
    ab_step(&b, &IDLE);
    CHECK(b.outcome == AB_OUTCOME_LOST, "outcome is LOST");
    CHECK(b.events & AB_EV_DEATH, "death event raised");
}

static void test_every_boss_definition(void)
{
    uint8_t i;
    uint32_t j;

    printf("boss roster (%d bosses)\n", AB_BOSS_COUNT);
    CHECK(AB_BOSS_COUNT > 0, "roster is not empty");

    for (i = 0; i < AB_BOSS_COUNT; i++) {
        const ab_boss_def *def = &ab_boss_table[i];
        ab_battle b;

        CHECK(def->hp_max > 0, "%s has HP", def->id);
        CHECK(def->poise_max > 0, "%s has poise", def->id);
        CHECK(def->attack_count > 0, "%s has attacks", def->id);
        CHECK(def->attack_count <= AB_MAX_ATTACKS, "%s fits AB_MAX_ATTACKS",
              def->id);
        CHECK(def->phase2_hp_pct < 100 && def->phase3_hp_pct < def->phase2_hp_pct,
              "%s phase thresholds descend", def->id);
        CHECK(def->walk_speed > 0, "%s can walk", def->id);

        ab_init(&b, def, 0x5EED + i);
        for (j = 0; j < 3600; j++) {
            ab_input in = IDLE;
            /* a simple bot: close in, swing, dash out of trouble */
            in.right = b.player.body.x < b.boss.body.x - AB_FX(24);
            in.left = b.player.body.x > b.boss.body.x + AB_FX(24);
            in.attack = (j % 9) < 3;
            in.dash = (j % 97) == 0;
            in.jump = (j % 151) == 0;
            ab_step(&b, &in);
            if (b.outcome != AB_OUTCOME_ONGOING)
                break;
        }
        CHECK(b.player.hp >= 0 && b.player.hp <= b.player.hp_max,
              "%s player HP stays in bounds", def->id);
        CHECK(b.boss.hp >= 0 && b.boss.hp <= b.boss.hp_max,
              "%s boss HP stays in bounds", def->id);
        CHECK(b.boss.phase >= 1 && b.boss.phase <= 3, "%s phase stays 1..3",
              def->id);
        CHECK(b.player.body.x >= AB_FX(-176) && b.player.body.x <= AB_FX(176),
              "%s player stays in the arena", def->id);
        printf("    %-28s hp %4d/%-4d  phase %d  frames %u  outcome %s\n",
               def->name, b.boss.hp, b.boss.hp_max, b.boss.phase, b.frame,
               b.outcome == AB_OUTCOME_WON ? "won"
               : b.outcome == AB_OUTCOME_LOST ? "lost"
                                              : "timeout");
    }
}

int main(void)
{
    printf("action_battle host tests\n");
    test_init();
    test_telegraph_is_safe();
    test_active_frame_hits();
    test_dash_iframes();
    test_phase_transition();
    test_poise_stagger();
    test_focus_heals();
    test_determinism();
    test_player_death();
    test_every_boss_definition();

    printf("\n%d checks, %d failures\n", g_checks, g_failures);
    return g_failures ? 1 : 0;
}
