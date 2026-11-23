/* AUTOPILOT — a policy that plays the player character.
 * Reads battle state, returns { ...input, decision }. No learning, no model:
 * a hand-written policy with a priority ladder. Deterministic.
 */
(function (root) {
  'use strict';

  const REACH = 48;          // nail reach, px
  const SAFE_DASH = 26;      // dash cooldown margin

  function think(b, t, whisper) {
    const p = b.player, bo = b.boss;
    const dx = bo.x - p.x;
    const adx = Math.abs(dx);
    const dirRight = dx > 0 ? 1 : 0;
    const atk = bo.atk;
    const stage = bo.atkStage;
    const incoming = bo.state === 'attack' && (stage === 'tel' || stage === 'act');
    const telLeft = atk && stage === 'tel' ? bo.atkT : 0;
    const inReach = adx <= REACH + 6;
    const lowHp = p.masks <= 2;

    const out = { left: 0, right: 0, jump: 0, attack: 0, dash: 0, focus: 0, catch: 0, decision: 'WAIT' };
    const order = whisper && whisper.ttl > 0 ? whisper.intent : null;

    // a whisper outranks instinct for as long as it lasts
    if (order === 'retreat') {
      out.right = dirRight ? 0 : 1;
      out.left = dirRight ? 1 : 0;
      if (incoming && p.dashCd === 0) out.dash = 1;
      out.decision = 'OBEY: RETREAT';
      return out;
    }
    if (order === 'hold') {
      if (adx < 120) {
        out.right = dirRight ? 0 : 1;
        out.left = dirRight ? 1 : 0;
      }
      if (incoming && p.dashCd === 0) out.dash = 1;
      out.decision = 'OBEY: HOLD';
      return out;
    }
    if (order === 'heal' && p.soul >= 33 && bossBusy) {
      out.focus = 1;
      out.decision = 'OBEY: HEAL';
      return out;
    }
    if (order === 'catch' && bo.hp / bo.maxHp <= 0.35 && !incoming) {
      if (bo.hp / bo.maxHp <= 0.15) { out.catch = 1; out.decision = 'OBEY: CATCH'; return out; }
      out.decision = 'OBEY: WEAKEN';
    }

    // 1. finish it — capture beats a kill
    if (bo.hp > 0 && bo.hp / bo.maxHp <= 0.15 && !incoming) {
      out.catch = 1;
      out.decision = 'CAPTURE';
      return out;
    }

    // 2. heal only when the boss cannot reach us
    const bossBusy = stage === 'rec' || bo.state === 'stagger' || bo.state === 'phase' || bo.cd > 10;
    if (lowHp && p.soul >= 33 && bossBusy) {
      out.focus = 1;
      out.decision = 'HEAL';
      return out;
    }

    // 3. dodge: dash through the active window, away if we are nearly dead
    if (incoming && p.dashCd === 0) {
      const threat = adx <= (atk ? atk.reach + 26 : 90);
      if (threat && stage === 'tel' && telLeft <= 14) {
        out.dash = 1;
        if (p.masks <= 2) {
          out.right = dirRight ? 0 : 1;
          out.left = dirRight ? 1 : 0;
          out.decision = 'RETREAT';
        } else {
          out.right = dirRight ? 1 : 0;
          out.left = dirRight ? 0 : 1;
          out.decision = 'DASH-THROUGH';
        }
        return out;
      }
      if (threat && stage === 'act') {
        out.dash = 1;
        out.right = dirRight ? 1 : 0;
        out.left = dirRight ? 0 : 1;
        out.decision = 'DASH-THROUGH';
        return out;
      }
    }

    // 4. jump ground-only attacks
    if (incoming && atk && atk.height <= 26 && adx < atk.reach && p.onGround) {
      out.jump = 1;
      out.decision = 'JUMP';
      return out;
    }

    // 5. in range and not swinging? strike
    const eager = order === 'attack';
    if ((inReach || (eager && adx < REACH + 26)) && p.swingCd === 0 && (!incoming || stage === 'rec' || eager)) {
      out.attack = 1;
      out.decision = 'STRIKE';
      return out;
    }

    // 6. otherwise close the gap, backing off during an active window
    if (stage === 'act' && adx < (atk ? atk.reach : 80)) {
      out.right = dirRight ? 0 : 1;
      out.left = dirRight ? 1 : 0;
      out.decision = 'BACK OFF';
      return out;
    }
    out.right = dirRight ? 1 : 0;
    out.left = dirRight ? 0 : 1;
    out.decision = 'APPROACH';
    return out;
  }

  const api = { think };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AUTOPILOT = api;
})(typeof window !== 'undefined' ? window : globalThis);
