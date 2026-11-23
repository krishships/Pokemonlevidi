/* Playtest: run the full game with three different "players" and report.
 *  - pilot : the AI policy (dash, punish, heal, capture)
 *  - honest: same but never dashes (does the game require the mechanic?)
 *  - brute : spam attack, no defence (can it be cheesed?)
 */
const SIM = require('../game/sim.js');
const AP = require('../game/autopilot.js');

const IDLE = { left: 0, right: 0, jump: 0, attack: 0, dash: 0, focus: 0, catch: 0 };

function brute(b, t) {
  const p = b.player, bo = b.boss;
  const dx = bo.x - p.x;
  const o = Object.assign({}, IDLE);
  if (Math.abs(dx) > 44) { if (dx > 0) o.right = 1; else o.left = 1; }
  if (p.swingCd === 0) o.attack = 1;
  if (bo.hp > 0 && bo.hp / bo.maxHp <= 0.15) o.catch = 1;
  return o;
}

function honest(b, t) {
  const inp = AP.think(b, t);
  const o = Object.assign({}, inp);
  o.dash = 0;                    // never use the i-frame tool
  return o;
}

function play(boss, policy, seed) {
  const b = new SIM.Battle(boss, seed);
  let masksLost = 0, lastMasks = b.player.masks, hits = 0, phases = 1;
  const t0 = Date.now();
  for (let i = 0; i < 30000 && b.outcome === 'ongoing'; i++) {
    const inp = policy(b, i * 16.7);
    b.step(inp);
    for (const e of b.events) if (e.type === 'hitPlayer') hits++;
    if (b.player.masks < lastMasks) { masksLost += lastMasks - b.player.masks; lastMasks = b.player.masks; }
    if (b.boss.phase > phases) phases = b.boss.phase;
  }
  return {
    outcome: b.outcome,
    frames: b.frame,
    seconds: +(b.frame / 60).toFixed(1),
    masksLost, hits, phases,
    bossHpPct: Math.round((b.boss.hp / b.boss.maxHp) * 100),
    wallMs: Date.now() - t0
  };
}

const runs = { pilot: [], honest: [], brute: [] };
const POLICIES = { pilot: AP.think, honest, brute };

for (const [name, fn] of Object.entries(POLICIES)) {
  for (const boss of SIM.BOSSES) {
    runs[name].push({ boss: boss.name, ...play(boss, fn, 2024) });
  }
}

function table(name) {
  const rows = runs[name];
  const wins = rows.filter(r => r.outcome !== 'lost' && r.outcome !== 'ongoing').length;
  const totalFrames = rows.reduce((a, r) => a + r.frames, 0);
  const totalHits = rows.reduce((a, r) => a + r.hits, 0);
  const deaths = rows.filter(r => r.outcome === 'lost').length;
  console.log(`\n=== ${name.toUpperCase()} — ${wins}/${rows.length} won, ${deaths} deaths, ` +
    `${(totalFrames / 60 / 60).toFixed(1)} min, ${totalHits} hits taken`);
  for (const r of rows) {
    const flag = r.outcome === 'lost' ? 'DIED' : r.outcome === 'ongoing' ? 'STUCK' : 'won ';
    console.log(`  ${flag} ${r.boss.padEnd(26)} ${String(r.seconds).padStart(5)}s  ` +
      `masks lost ${r.masksLost}  hits ${String(r.hits).padStart(2)}  phase ${r.phases}  boss ${r.bossHpPct}%`);
  }
}

table('pilot');
table('honest');
table('brute');

// where the pilot takes the most damage
const hardest = runs.pilot.slice().sort((a, b) => b.hits - a.hits)[0];
const longest = runs.pilot.slice().sort((a, b) => b.seconds - a.seconds)[0];
console.log(`\nhardest for the pilot: ${hardest.boss} (${hardest.hits} hits)`);
console.log(`longest fight: ${longest.boss} (${longest.seconds}s)`);

const anyStuck = Object.values(runs).flat().filter(r => r.outcome === 'ongoing');
console.log(anyStuck.length ? `\nSTUCK: ${anyStuck.map(r => r.boss).join(', ')}` : '\nno stalls in any run');
