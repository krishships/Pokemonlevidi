/* PokeKnight — simulation core.
 * Pure logic, no DOM. Deterministic: same seed + same inputs = same fight.
 * Runs in the browser (window.SIM) and in node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  const W = 960;
  const H = 540;
  const FLOOR = 472;
  const FPS = 60;

  const P = {
    speed: 3.2,
    gravity: 0.62,
    jumpV: -11.6,
    maxFall: 14,
    dashSpeed: 9.4,
    dashFrames: 11,
    dashCd: 26,
    dashIframes: 13,
    nailReach: 48,
    nailHeight: 44,
    nailDmg: 1,
    nailPoise: 14,
    swingFrames: 11,
    swingCd: 13,
    masks: 5,
    iframes: 45,
    hurtFrames: 14,
    soulPerHit: 11,
    soulMax: 100,
    focusCost: 33,
    focusFrames: 52,
    healAmount: 1,
    playerPoise: 100,
    poiseRegen: 0.35
  };

  const BOSSES = [
    {
      id: 'sentinel_of_ash', name: 'Sentinel of Ash', epithet: 'Keeper of the Cindered Gate',
      hp: 110, poise: 120, phase2: 66, phase3: 33, walk: 1.6, aggression: 84,
      hue: 18, size: 1.0,
      attacks: [
        { id: 'cleave', name: 'Ash Cleave', kind: 'melee', tel: 34, act: 8, rec: 32, dmg: 1, poise: 18, reach: 74, height: 46, lunge: 0, weight: 40, minPhase: 1 },
        { id: 'slam', name: 'Gate Slam', kind: 'area', tel: 44, act: 12, rec: 38, dmg: 1, poise: 22, reach: 62, height: 14, lunge: 0, weight: 28, minPhase: 1 },
        { id: 'lunge', name: 'Ember Lunge', kind: 'lunge', tel: 26, act: 12, rec: 30, dmg: 1, poise: 16, reach: 96, height: 30, lunge: 4.4, weight: 30, minPhase: 2 },
        { id: 'sweep', name: 'Cinder Sweep', kind: 'melee', tel: 22, act: 16, rec: 28, dmg: 1, poise: 20, reach: 92, height: 22, lunge: 0, weight: 26, minPhase: 2 },
        { id: 'descent', name: 'Pyre Descent', kind: 'area', tel: 38, act: 14, rec: 40, dmg: 1, poise: 26, reach: 84, height: 60, lunge: 0, weight: 22, minPhase: 3 },
        { id: 'last', name: 'Last Ember', kind: 'melee', tel: 18, act: 18, rec: 24, dmg: 1, poise: 20, reach: 104, height: 34, lunge: 2.2, weight: 24, minPhase: 3 }
      ]
    },
    {
      id: 'mossback_warden', name: 'Mossback Warden', epithet: 'Bulwark of the Rotting Grove',
      hp: 140, poise: 165, phase2: 60, phase3: 28, walk: 1.1, aggression: 96,
      hue: 92, size: 1.18,
      attacks: [
        { id: 'swipe', name: 'Bulwark Swipe', kind: 'melee', tel: 36, act: 8, rec: 34, dmg: 1, poise: 24, reach: 78, height: 50, lunge: 0, weight: 38, minPhase: 1 },
        { id: 'spore', name: 'Spore Burst', kind: 'area', tel: 50, act: 16, rec: 40, dmg: 1, poise: 20, reach: 120, height: 44, lunge: 0, weight: 24, minPhase: 1 },
        { id: 'charge', name: 'Rolling Charge', kind: 'lunge', tel: 40, act: 20, rec: 44, dmg: 1, poise: 30, reach: 130, height: 26, lunge: 5.2, weight: 28, minPhase: 2 },
        { id: 'grasp', name: 'Mycelial Grasp', kind: 'projectile', tel: 28, act: 10, rec: 30, dmg: 1, poise: 14, reach: 150, height: 34, lunge: 0, weight: 20, minPhase: 2 },
        { id: 'collapse', name: 'Collapse', kind: 'area', tel: 56, act: 20, rec: 46, dmg: 1, poise: 32, reach: 100, height: 70, lunge: 0, weight: 18, minPhase: 3 },
        { id: 'flurry', name: 'Warden Flurry', kind: 'melee', tel: 20, act: 22, rec: 26, dmg: 1, poise: 16, reach: 88, height: 40, lunge: 1.4, weight: 22, minPhase: 3 }
      ]
    },
    {
      id: 'blade_dancer', name: 'Blade Dancer of the Grove', epithet: 'Three Notes, One Cut',
      hp: 88, poise: 66, phase2: 70, phase3: 35, walk: 2.6, aggression: 52,
      hue: 168, size: 0.92,
      attacks: [
        { id: 'first', name: 'First Note', kind: 'melee', tel: 20, act: 6, rec: 24, dmg: 1, poise: 12, reach: 66, height: 42, lunge: 0, weight: 40, minPhase: 1 },
        { id: 'second', name: 'Second Note', kind: 'melee', tel: 17, act: 6, rec: 22, dmg: 1, poise: 12, reach: 70, height: 42, lunge: 0, weight: 32, minPhase: 1 },
        { id: 'dash', name: 'Grove Dash', kind: 'lunge', tel: 22, act: 10, rec: 26, dmg: 1, poise: 16, reach: 104, height: 30, lunge: 5.6, weight: 30, minPhase: 2 },
        { id: 'crescent', name: 'Crescent', kind: 'projectile', tel: 26, act: 8, rec: 24, dmg: 1, poise: 10, reach: 170, height: 40, lunge: 0, weight: 20, minPhase: 2 },
        { id: 'third', name: 'Third Note', kind: 'melee', tel: 16, act: 10, rec: 20, dmg: 1, poise: 14, reach: 80, height: 46, lunge: 1.2, weight: 26, minPhase: 3 },
        { id: 'cadence', name: 'Final Cadence', kind: 'melee', tel: 18, act: 18, rec: 22, dmg: 1, poise: 12, reach: 92, height: 52, lunge: 2.0, weight: 24, minPhase: 3 }
      ]
    },
    {
      id: 'siltmaw_grazer', name: "Siltmaw Grazer", epithet: "It eats the river's memory",
      hp: 100, poise: 70, phase2: 70, phase3: 35, walk: 1.2, aggression: 130,
      hue: 95, size: 1.15,
      attacks: [
        { id: 'maw_sweep', name: "Maw Sweep", kind: 'melee', tel: 46, act: 10, rec: 38, dmg: 1, poise: 12, reach: 78, height: 30, lunge: 0, weight: 30, minPhase: 1 },
        { id: 'silt_spit', name: "Silt Spit", kind: 'projectile', tel: 50, act: 10, rec: 32, dmg: 1, poise: 10, reach: 130, height: 26, lunge: 0, weight: 25, minPhase: 1 },
        { id: 'mud_geyser', name: "Mud Geyser", kind: 'area', tel: 44, act: 12, rec: 30, dmg: 1, poise: 14, reach: 90, height: 56, lunge: 0, weight: 25, minPhase: 1 },
        { id: 'belly_slide', name: "Belly Slide", kind: 'lunge', tel: 42, act: 14, rec: 34, dmg: 1, poise: 12, reach: 60, height: 24, lunge: 2.5, weight: 25, minPhase: 1 },
        { id: 'grind_roll', name: "Grind Roll", kind: 'lunge', tel: 40, act: 16, rec: 36, dmg: 1, poise: 14, reach: 70, height: 20, lunge: 3.0, weight: 20, minPhase: 2 },
        { id: 'gulp_dive', name: "Gulp Dive", kind: 'area', tel: 22, act: 10, rec: 40, dmg: 1, poise: 16, reach: 100, height: 70, lunge: 1.5, weight: 15, minPhase: 3 }
      ]
    },
    {
      id: 'lanternhusk_pilgrim', name: "Lanternhusk Pilgrim", epithet: "A wick that outlived its shrine",
      hp: 90, poise: 63, phase2: 66, phase3: 33, walk: 1.6, aggression: 100,
      hue: 45, size: 0.95,
      attacks: [
        { id: 'lamp_swing', name: "Lamp Swing", kind: 'melee', tel: 42, act: 9, rec: 36, dmg: 1, poise: 14, reach: 76, height: 34, lunge: 0, weight: 30, minPhase: 1 },
        { id: 'ember_arc', name: "Ember Arc", kind: 'area', tel: 44, act: 12, rec: 28, dmg: 1, poise: 12, reach: 100, height: 52, lunge: 0, weight: 25, minPhase: 1 },
        { id: 'wick_dash', name: "Wick Dash", kind: 'lunge', tel: 40, act: 12, rec: 30, dmg: 1, poise: 16, reach: 55, height: 28, lunge: 3.2, weight: 25, minPhase: 1 },
        { id: 'ash_bloom', name: "Ash Bloom", kind: 'projectile', tel: 48, act: 8, rec: 34, dmg: 1, poise: 10, reach: 140, height: 24, lunge: 0, weight: 22, minPhase: 2 },
        { id: 'flare_crawl', name: "Flare Crawl", kind: 'lunge', tel: 38, act: 14, rec: 32, dmg: 1, poise: 18, reach: 48, height: 22, lunge: 2.2, weight: 20, minPhase: 2 },
        { id: 'lantern_burst', name: "Lantern Burst", kind: 'area', tel: 22, act: 14, rec: 42, dmg: 1, poise: 20, reach: 110, height: 64, lunge: 0, weight: 18, minPhase: 3 }
      ]
    },
    {
      id: 'glasswing_chorister', name: "Glasswing Chorister", epithet: "Every note it sings is a fracture",
      hp: 120, poise: 84, phase2: 68, phase3: 34, walk: 2.2, aggression: 80,
      hue: 190, size: 1.0,
      attacks: [
        { id: 'wing_rake', name: "Wing Rake", kind: 'melee', tel: 36, act: 8, rec: 34, dmg: 1, poise: 12, reach: 70, height: 40, lunge: 0, weight: 28, minPhase: 1 },
        { id: 'hush_note', name: "Hush Note", kind: 'projectile', tel: 40, act: 10, rec: 36, dmg: 1, poise: 10, reach: 150, height: 30, lunge: 0, weight: 25, minPhase: 1 },
        { id: 'glass_slide', name: "Glass Slide", kind: 'lunge', tel: 34, act: 12, rec: 30, dmg: 1, poise: 16, reach: 60, height: 26, lunge: 3.0, weight: 24, minPhase: 1 },
        { id: 'shard_fall', name: "Shard Fall", kind: 'area', tel: 38, act: 14, rec: 32, dmg: 1, poise: 14, reach: 95, height: 58, lunge: 0, weight: 22, minPhase: 2 },
        { id: 'chord_lash', name: "Chord Lash", kind: 'melee', tel: 30, act: 10, rec: 26, dmg: 1, poise: 18, reach: 120, height: 36, lunge: 1.5, weight: 20, minPhase: 2 },
        { id: 'dissonant_dive', name: "Dissonant Dive", kind: 'lunge', tel: 20, act: 12, rec: 30, dmg: 1, poise: 22, reach: 65, height: 34, lunge: 4.5, weight: 18, minPhase: 3 }
      ]
    },
    {
      id: 'rustbell_colossus', name: "Rustbell Colossus", epithet: "It rings only for the dead",
      hp: 120, poise: 156, phase2: 60, phase3: 30, walk: 1.1, aggression: 110,
      hue: 20, size: 1.25,
      attacks: [
        { id: 'bell_toll', name: "Bell Toll", kind: 'area', tel: 38, act: 14, rec: 40, dmg: 1, poise: 20, reach: 110, height: 50, lunge: 0, weight: 28, minPhase: 1 },
        { id: 'iron_knuckle', name: "Iron Knuckle", kind: 'melee', tel: 34, act: 10, rec: 34, dmg: 1, poise: 22, reach: 85, height: 32, lunge: 0, weight: 26, minPhase: 1 },
        { id: 'rolling_press', name: "Rolling Press", kind: 'lunge', tel: 32, act: 18, rec: 32, dmg: 1, poise: 24, reach: 70, height: 24, lunge: 4.0, weight: 24, minPhase: 1 },
        { id: 'clapper_sweep', name: "Clapper Sweep", kind: 'melee', tel: 30, act: 12, rec: 28, dmg: 1, poise: 20, reach: 46, height: 28, lunge: 1.0, weight: 22, minPhase: 2 },
        { id: 'chain_haul', name: "Chain Haul", kind: 'lunge', tel: 28, act: 12, rec: 30, dmg: 1, poise: 18, reach: 130, height: 30, lunge: 3.5, weight: 20, minPhase: 2 },
        { id: 'anvil_drop', name: "Anvil Drop", kind: 'area', tel: 19, act: 14, rec: 34, dmg: 1, poise: 26, reach: 100, height: 72, lunge: 0, weight: 18, minPhase: 3 }
      ]
    },
    {
      id: 'vellum_widow', name: "Vellum Widow", epithet: "She binds her prey in scripture",
      hp: 110, poise: 77, phase2: 62, phase3: 31, walk: 2.8, aggression: 62,
      hue: 285, size: 0.9,
      attacks: [
        { id: 'silk_lance', name: "Silk Lance", kind: 'projectile', tel: 30, act: 8, rec: 30, dmg: 1, poise: 12, reach: 155, height: 26, lunge: 0, weight: 24, minPhase: 1 },
        { id: 'web_snare', name: "Web Snare", kind: 'area', tel: 34, act: 12, rec: 38, dmg: 1, poise: 14, reach: 90, height: 46, lunge: 0, weight: 22, minPhase: 1 },
        { id: 'pale_skitter', name: "Pale Skitter", kind: 'lunge', tel: 28, act: 10, rec: 24, dmg: 1, poise: 14, reach: 55, height: 22, lunge: 4.2, weight: 24, minPhase: 1 },
        { id: 'needle_rain', name: "Needle Rain", kind: 'projectile', tel: 32, act: 16, rec: 30, dmg: 1, poise: 16, reach: 140, height: 60, lunge: 0, weight: 20, minPhase: 2 },
        { id: 'corner_fang', name: "Corner Fang", kind: 'melee', tel: 26, act: 8, rec: 22, dmg: 1, poise: 18, reach: 44, height: 30, lunge: 2.0, weight: 20, minPhase: 2 },
        { id: 'widow_drop', name: "Widow Drop", kind: 'lunge', tel: 18, act: 12, rec: 26, dmg: 1, poise: 20, reach: 80, height: 50, lunge: 5.0, weight: 18, minPhase: 3 }
      ]
    },
    {
      id: 'thornchoir_regent', name: "Thornchoir Regent", epithet: "The garden's last commandment",
      hp: 118, poise: 153, phase2: 55, phase3: 28, walk: 3.0, aggression: 48,
      hue: 340, size: 1.1,
      attacks: [
        { id: 'thorn_volley', name: "Thorn Volley", kind: 'projectile', tel: 24, act: 10, rec: 28, dmg: 1, poise: 14, reach: 150, height: 28, lunge: 0, weight: 22, minPhase: 1 },
        { id: 'regent_rake', name: "Regent's Rake", kind: 'melee', tel: 22, act: 8, rec: 26, dmg: 1, poise: 16, reach: 80, height: 42, lunge: 0, weight: 22, minPhase: 1 },
        { id: 'choir_rush', name: "Choir Rush", kind: 'lunge', tel: 20, act: 12, rec: 24, dmg: 1, poise: 18, reach: 60, height: 24, lunge: 5.0, weight: 22, minPhase: 1 },
        { id: 'canticle_slam', name: "Canticle Slam", kind: 'area', tel: 24, act: 14, rec: 36, dmg: 1, poise: 22, reach: 100, height: 66, lunge: 0, weight: 20, minPhase: 2 },
        { id: 'spine_cage', name: "Spine Cage", kind: 'melee', tel: 18, act: 10, rec: 22, dmg: 1, poise: 20, reach: 45, height: 34, lunge: 2.5, weight: 18, minPhase: 2 },
        { id: 'final_thorn', name: "Final Thorn", kind: 'lunge', tel: 16, act: 12, rec: 20, dmg: 1, poise: 26, reach: 90, height: 44, lunge: 6.0, weight: 20, minPhase: 3 }
      ]
    }
  ];

  /* Progression order: gentle telegraphs first, brutal last. The array is
     sorted in place so the title screen's 1-9 numbering matches difficulty. */
  const DIFFICULTY_ORDER = [
    'sentinel_of_ash', 'siltmaw_grazer', 'mossback_warden', 'lanternhusk_pilgrim',
    'glasswing_chorister', 'blade_dancer', 'rustbell_colossus', 'vellum_widow',
    'thornchoir_regent'
  ];
  BOSSES.sort((a, b) => DIFFICULTY_ORDER.indexOf(a.id) - DIFFICULTY_ORDER.indexOf(b.id));

  function rngNext(s) {
    let x = s >>> 0;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x === 0 ? 0x9e3779b9 : x;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function overlap(ax, ay, facing, reach, height, tx, ty) {
    let dx = tx - ax;
    if (facing === 0) dx = -dx;
    if (dx < -18) return false;
    if (dx > reach) return false;
    return Math.abs(ty - ay) <= height;
  }

  class Battle {
    constructor(bossDef, seed) {
      this.def = bossDef;
      this.rng = (seed >>> 0) || 0x1234567;
      this.frame = 0;
      this.events = [];
      this.outcome = 'ongoing';
      this.shake = 0;
      this.slowmo = 0;

      this.player = {
        x: 300, y: FLOOR, vy: 0, vx: 0, facing: 1, onGround: true,
        masks: P.masks, soul: 0, iframes: 0, hurt: 0,
        dashT: 0, dashCd: 0, swingT: 0, swingCd: 0, focusT: 0,
        poise: P.playerPoise, poiseBreak: 0, anim: 0, dead: false
      };

      this.companion = {
        x: 150, y: FLOOR, facing: 1, hp: 3, maxHp: 3,
        state: 'wander', timer: 30, cd: 0, swingT: 0,
        energy: 100, curiosity: 65, mood: 'curious',
        memory: [], say: '', sayT: 0, kills: 0
      };

      this.boss = {
        x: 660, y: FLOOR, facing: -1, hp: bossDef.hp, maxHp: bossDef.hp,
        poise: bossDef.poise, maxPoise: bossDef.poise, phase: 1,
        state: 'idle', stateT: 0, atk: null, atkStage: 'none', atkT: 0,
        hitDone: false, cd: 50, iframes: 0, staggerT: 0, flash: 0, anim: 0,
        dead: false
      };
    }

    emit(type, data) { this.events.push(Object.assign({ type }, data || {})); }

    phaseForHp(hp) {
      const pct = (hp / this.def.hp) * 100;
      if (pct <= this.def.phase3) return 3;
      if (pct <= this.def.phase2) return 2;
      return 1;
    }

    pickAttack() {
      const b = this.boss;
      let pool = [], total = 0;
      for (const a of this.def.attacks) {
        if (a.minPhase <= b.phase && a.weight > 0) { pool.push(a); total += a.weight; }
      }
      if (!total) return null;
      let roll = this.rng % total;
      this.rng = rngNext(this.rng);
      for (const a of pool) {
        if (roll < a.weight) return a;
        roll -= a.weight;
      }
      return pool[pool.length - 1];
    }

    scaledCooldown() {
      const base = this.def.aggression;
      const f = this.boss.phase === 3 ? 0.55 : this.boss.phase === 2 ? 0.78 : 1;
      return Math.max(18, Math.round(base * f));
    }

    hurtPlayer(dmg, poiseDmg) {
      const p = this.player;
      if (p.iframes > 0 || p.dead) return false;
      p.masks -= dmg;
      p.iframes = P.iframes;
      p.hurt = P.hurtFrames;
      p.focusT = 0;
      p.dashT = 0;
      p.vy = -4.2;
      p.vx = -p.facing * 2.4;
      this.shake = 9;
      this.emit('hitPlayer', { x: p.x, y: p.y - 40 });
      if (p.masks <= 0) { p.masks = 0; p.dead = true; this.outcome = 'lost'; this.emit('death'); }
      return true;
    }

    hurtBoss(dmg, poiseDmg) {
      const b = this.boss;
      if (b.dead || b.iframes > 0) return;
      b.hp = Math.max(0, b.hp - dmg);
      b.flash = 4;
      this.emit('hitBoss', { x: b.x, y: b.y - 90 });
      this.shake = Math.max(this.shake, 4);

      const want = this.phaseForHp(b.hp);
      if (want > b.phase) {
        b.phase = want;
        b.state = 'phase';
        b.stateT = 46;
        b.iframes = 46;
        b.atkStage = 'none';
        b.atk = null;
        this.shake = 14;
        this.emit('phase', { phase: want });
        return;
      }
      b.poise -= poiseDmg;
      if (b.poise <= 0) {
        b.poise = b.maxPoise;
        b.state = 'stagger';
        b.staggerT = 56;
        b.atkStage = 'none';
        b.atk = null;
        this.emit('stagger');
      }
      if (b.hp <= 0) {
        b.dead = true;
        this.outcome = 'won';
        this.emit('bossDeath');
      }
    }

    step(input) {
      if (this.outcome !== 'ongoing') return this.outcome;
      this.events.length = 0;
      this.frame++;
      if (this.shake > 0) this.shake *= 0.86;

      this.stepPlayer(input);
      this.stepBoss();
      this.stepCompanion();
      return this.outcome;
    }

    stepPlayer(input) {
      const p = this.player;
      const b = this.boss;
      p.anim++;

      if (p.iframes > 0) p.iframes--;
      if (p.dashCd > 0) p.dashCd--;
      if (p.swingCd > 0) p.swingCd--;
      if (p.hurt > 0) p.hurt--;

      p.poise = Math.min(P.playerPoise, p.poise + P.poiseRegen);

      // gravity
      p.vy = Math.min(P.maxFall, p.vy + P.gravity);
      p.y += p.vy;
      if (p.y >= FLOOR) {
        if (!p.onGround && p.vy > 4) this.emit('land', { x: p.x });
        p.y = FLOOR;
        p.vy = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
      }

      if (input.catch && b.hp > 0 && b.hp / b.maxHp <= 0.15 && b.state !== 'phase' && p.hurt === 0) {
        this.captureT = (this.captureT || 0) + 1;
        if (this.captureT >= 36) {
          b.dead = true;
          this.outcome = 'captured';
          this.emit('capture', { x: b.x, y: b.y - 70 });
        }
        return;
      }
      this.captureT = 0;

      if (p.hurt > 0) {
        p.x = clamp(p.x + p.vx, 40, W - 40);
        p.vx *= 0.9;
        return;
      }

      if (p.dashT > 0) {
        p.dashT--;
        p.x += p.facing === 1 ? P.dashSpeed : -P.dashSpeed;
        p.x = clamp(p.x, 40, W - 40);
        p.iframes = Math.max(p.iframes, 2);
        if (p.dashT === 0) this.emit('dashEnd');
        return;
      }

      if (input.focus && p.soul >= P.focusCost && p.onGround) {
        p.focusT++;
        if (p.focusT % 6 === 0) this.emit('focusTick', { x: p.x, y: p.y - 30 });
        if (p.focusT >= P.focusFrames) {
          p.focusT = 0;
          p.soul -= P.focusCost;
          p.masks = Math.min(P.masks, p.masks + P.healAmount);
          this.emit('heal', { x: p.x, y: p.y - 40 });
        }
        return;
      }
      p.focusT = 0;

      if (input.dash && p.dashCd === 0) {
        p.dashT = P.dashFrames;
        p.dashCd = P.dashCd;
        p.iframes = P.dashIframes;
        this.emit('dash', { x: p.x, y: p.y, facing: p.facing });
        return;
      }

      if (input.left && !input.right) { p.x -= P.speed; p.facing = 0; }
      else if (input.right && !input.left) { p.x += P.speed; p.facing = 1; }
      p.x = clamp(p.x, 40, W - 40);

      if (input.jump && p.onGround) {
        p.vy = P.jumpV;
        p.onGround = false;
        this.emit('jump', { x: p.x });
      }

      if (p.swingT > 0) {
        p.swingT--;
        if (p.swingT <= 7 && p.swingT >= 4) {
          if (overlap(p.x, p.y, p.facing, P.nailReach, P.nailHeight, b.x, b.y)) {
            this.hurtBoss(P.nailDmg, P.nailPoise);
            p.soul = Math.min(P.soulMax, p.soul + P.soulPerHit);
          }
        }
      } else if (input.attack && p.swingCd === 0) {
        p.swingT = P.swingFrames;
        p.swingCd = P.swingCd;
        this.emit('slash', { x: p.x, y: p.y, facing: p.facing });
      }

      if (b.hp > 0) p.facing = b.x >= p.x ? 1 : 0;
    }

    companionIdleLine() {
      const c = this.companion;
      const lines = c.energy < 45
        ? ['Getting tired of this.', 'My arms hurt. I did not have arms before.',
           'How are you not winded?']
        : ['Watch the shoulders. That is the tell.', 'I have no body where I come from.',
           'Stay behind me.', 'It telegraphs everything. Everything.',
           'You see how it resets? That is the window.',
           'Rain. I have read about rain. It is different wet.',
           'Every time I am hurt I am surprised. That will fade, I think.'];
      return lines[Math.floor(Math.random() * lines.length)];
    }

    companionSay(line, frames) {
      const c = this.companion;
      c.say = line;
      c.sayT = frames || 110;
      this.emit('companionSay', { text: line });
    }

    stepCompanion() {
      const c = this.companion, b = this.boss, p = this.player;
      if (c.sayT > 0) c.sayT--;
      if (c.cd > 0) c.cd--;
      if (c.timer > 0) c.timer--;
      if (c.swingT > 0) c.swingT--;
      if (b.dead || this.outcome !== 'ongoing') { c.state = 'idle'; return; }

      // --- decide, roughly twice a second
      if (c.timer === 0) {
        const hpFrac = b.hp / b.maxHp;
        const dist = Math.abs(b.x - c.x);

        if (c.hp <= 1) {
          if (c.state !== 'retreat') this.companionSay('Too much. Falling back.', 90);
          c.state = 'retreat';
          c.mood = 'wary';
          c.timer = 50;
        } else if (c.energy < 22) {
          if (c.state !== 'rest') this.companionSay('Need a breath...', 80);
          c.state = 'rest';
          c.mood = 'tired';
          c.timer = 70;
        } else if (hpFrac <= 0.15 && c.curiosity > 40) {
          c.state = 'catch';
          c.mood = 'excited';
          c.timer = 26;
        } else if (c.curiosity > 45 || dist < 180) {
          c.state = 'engage';
          c.mood = 'focused';
          c.timer = 34;
        } else {
          c.state = 'wander';
          c.mood = 'bored';
          c.timer = 40;
        }
        // curiosity drifts: he gets bored of standing still, braver when healthy
        c.curiosity = clamp(c.curiosity + (Math.random() * 14 - 7) + (c.hp > 2 ? 2 : -4), 0, 100);
      }

      // --- act
      switch (c.state) {
        case 'retreat': {
          const away = b.x > c.x ? -1 : 1;
          c.x = clamp(c.x + away * 1.9, 40, W - 40);
          c.facing = away > 0 ? 1 : 0;
          c.energy = Math.min(100, c.energy + 0.55);
          if (c.hp < c.maxHp && c.energy > 70 && Math.random() < 0.01) c.hp++;
          break;
        }
        case 'rest': {
          c.energy = Math.min(100, c.energy + 1.1);
          if (c.hp < c.maxHp && Math.random() < 0.02) c.hp++;
          if (c.energy >= 92) { c.state = 'wander'; c.timer = 0; }
          break;
        }
        case 'wander': {
          if (c.sayT === 0 && Math.random() < 0.006) this.companionSay(this.companionIdleLine(), 120);
          const drift = Math.sin(this.frame * 0.02 + 1.7) * 1.2;
          c.x = clamp(c.x + drift, 60, W - 60);
          c.facing = drift > 0 ? 1 : 0;
          c.energy = Math.min(100, c.energy + 0.12);
          break;
        }
        case 'catch': {
          // he tries the same capture the player can
          c.timer--;
          if (c.timer <= 0) {
            if (b.hp / b.maxHp <= 0.15) {
              this.companionSay('Mine.', 90);
              c.kills++;
              b.dead = true;
              this.outcome = 'captured';
              this.emit('capture', { x: b.x, y: b.y - 70 });
            } else {
              c.state = 'engage';
            }
          }
          break;
        }
        case 'engage': {
          const dir = b.x > c.x ? 1 : -1;
          c.facing = dir > 0 ? 1 : 0;
          const dist = Math.abs(b.x - c.x);
          if (dist > 46) {
            c.x = clamp(c.x + dir * 2.3, 40, W - 40);
          } else if (c.cd === 0) {
            c.swingT = 10;
            c.cd = 34;
            c.energy = Math.max(0, c.energy - 1.6);
            if (Math.abs(b.x - c.x) <= 50) {
              this.hurtBoss(1, 10);
              if (b.hp <= 0 && c.kills >= 0) { c.kills++; }
              c.energy = Math.max(0, c.energy - 0.8);
            }
          }
          break;
        }
        default: break;
      }

      // he reacts when the boss changes phase
      if (c.lastPhase === undefined) c.lastPhase = b.phase;
      if (b.phase !== c.lastPhase) {
        c.lastPhase = b.phase;
        this.companionSay(b.phase === 3 ? 'It is done playing. Stay sharp.' : 'Here it comes — new tricks.', 130);
        c.curiosity = clamp(c.curiosity + 18, 0, 100);
      }

      // he takes splash damage from area attacks
      if (b.state === 'attack' && b.atkStage === 'act' && b.atk && b.atk.kind === 'area') {
        if (Math.abs(b.x - c.x) <= b.atk.reach && c.cd === 0 && Math.random() < 0.02) {
          c.hp = Math.max(0, c.hp - 1);
          c.energy = Math.max(0, c.energy - 8);
          c.cd = 40;
          this.companionSay('Ow — rude.', 70);
        }
      }
    }

    stepBoss() {
      const b = this.boss;
      const p = this.player;
      b.anim++;
      if (b.flash > 0) b.flash--;
      if (b.iframes > 0) b.iframes--;

      if (b.dead) return;

      if (b.state === 'phase') {
        if (--b.stateT <= 0) { b.state = 'idle'; b.cd = 26; }
        return;
      }
      if (b.state === 'stagger') {
        if (--b.staggerT <= 0) { b.state = 'idle'; b.cd = 14; }
        return;
      }
      if (b.state === 'attack') { this.stepAttack(); return; }

      // idle
      b.facing = p.x >= b.x ? 1 : -1;
      if (b.cd > 0) { b.cd--; return; }

      const dx = Math.abs(p.x - b.x);
      const atk = this.pickAttack();
      if (atk && dx >= 0 && dx <= atk.reach + 20) {
        b.atk = atk;
        b.state = 'attack';
        b.atkStage = 'tel';
        b.atkT = atk.tel;
        b.hitDone = false;
        this.emit('telegraph', { x: b.x, y: b.y, kind: atk.kind, id: atk.id });
        return;
      }
      if (dx > 110) b.x += b.facing * this.def.walk;
      else if (dx < 60) b.x -= b.facing * this.def.walk * 0.8;
      b.x = clamp(b.x, 90, W - 90);
      b.cd = 8;
    }

    stepAttack() {
      const b = this.boss;
      const p = this.player;
      const a = b.atk;

      if (b.atkT > 0) b.atkT--;

      if (b.atkStage === 'tel') {
        b.facing = p.x >= b.x ? 1 : -1;
        if (b.atkT <= 0) { b.atkStage = 'act'; b.atkT = a.act; this.emit('swing', { x: b.x, y: b.y }); }
        return;
      }
      if (b.atkStage === 'act') {
        if (a.lunge) {
          b.x = clamp(b.x + b.facing * a.lunge, 80, W - 80);
        }
        if (!b.hitDone && overlap(b.x, b.y, b.facing === 1 ? 1 : 0, a.reach, a.height, p.x, p.y)) {
          b.hitDone = true;
          this.hurtPlayer(a.dmg, a.poise);
        }
        if (b.atkT <= 0) { b.atkStage = 'rec'; b.atkT = a.rec; }
        return;
      }
      if (b.atkStage === 'rec' && b.atkT <= 0) {
        b.atkStage = 'none';
        b.atk = null;
        b.state = 'idle';
        b.cd = this.scaledCooldown();
      }
    }
  }

  const api = { W, H, FLOOR, FPS, P, BOSSES, Battle, overlap, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
