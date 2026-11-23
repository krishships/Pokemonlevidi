/* NAIL & SOUL — renderer, input and UI. Requires window.SIM. */
(function () {
  'use strict';
  const SIM = window.SIM;
  const AUTOPILOT = window.AUTOPILOT || null;
  const WHISPER = window.WHISPER || { parse: () => 'none', ack: () => '' };
  const SFX = window.SFX || { init() {}, play() {}, mute() {}, setVolume() {} };
  let audioReady = false;
  let muted = false;
  const lastPlayed = {};

  function sfx(name, opts) {
    if (!audioReady) return;
    const now = performance.now();
    if (lastPlayed[name] && now - lastPlayed[name] < 40) return;
    lastPlayed[name] = now;
    SFX.play(name, opts);
  }

  function wakeAudio() {
    if (audioReady) return;
    audioReady = true;
    SFX.init();
  }
  const W = SIM.W, H = SIM.H, FLOOR = SIM.FLOOR;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const input = { left: 0, right: 0, jump: 0, attack: 0, dash: 0, focus: 0, catch: 0 };
  let screen = 'title';      // title | fight | won | lost | captured
  let bossIndex = 0;
  let battle = null;
  let particles = [];
  let trails = [];
  let time = 0;
  let lastFrame = 0;
  let acc = 0;
  let endTimer = 0;
  let flash = 0;
  let hint = 1;
  let spectate = false;
  let lastDecision = 'WAIT';
  let whisper = { intent: 'none', ttl: 0, text: '', ack: '', ackT: 0 };

  function sendWhisper(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const intent = WHISPER.parse(clean);
    whisper = { intent, ttl: 520, text: clean, ack: WHISPER.ack(intent), ackT: 200 };
    if (battle) battle.companionSay(whisper.ack, 150);
    if (!spectate && AUTOPILOT) spectate = true;   // a whisper wakes the pilot
  }
  let unlocked = 1;          // how many bosses are available, 1..BOSSES.length
  const SAVE_KEY = 'nailsoul.unlocked';

  function loadProgress() {
    try {
      const v = parseInt(localStorage.getItem(SAVE_KEY) || '1', 10);
      unlocked = Math.min(SIM.BOSSES.length, Math.max(1, v || 1));
    } catch (e) { unlocked = 1; }
  }

  function saveProgress() {
    try { localStorage.setItem(SAVE_KEY, String(unlocked)); } catch (e) {}
  }

  function unlockNext(index) {
    if (index + 2 > unlocked) {
      unlocked = Math.min(SIM.BOSSES.length, index + 2);
      saveProgress();
    }
  }

  loadProgress();

  const STEP = 1000 / 60;

  /* ---------------------------------------------------------------- input */

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', KeyW: 'jump', ArrowUp: 'jump',
    KeyJ: 'attack', KeyZ: 'attack',
    KeyK: 'dash', KeyX: 'dash',
    KeyL: 'focus', KeyC: 'focus',
    KeyE: 'catch'
  };

  addEventListener('keydown', (e) => {
    wakeAudio();
    if (e.code === 'KeyM') { muted = !muted; SFX.mute(muted); }
    if (e.code === 'KeyS' && AUTOPILOT) { spectate = !spectate; }
    if (KEYS[e.code]) { input[KEYS[e.code]] = 1; e.preventDefault(); }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (screen === 'title' && digit && Number(digit[1]) <= unlocked) {
      bossIndex = Number(digit[1]) - 1;
      startFight();
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      if (screen === 'title') {
        bossIndex = Math.min(unlocked - 1, SIM.BOSSES.length - 1);
        startFight();
      } else if (screen === 'won' || screen === 'captured') {
        if (bossIndex + 1 < SIM.BOSSES.length) { bossIndex++; startFight(); }
        else { screen = 'title'; battle = null; }
      } else if (screen === 'lost') { screen = 'title'; battle = null; }
    }
  });

  addEventListener('keyup', (e) => {
    if (KEYS[e.code]) { input[KEYS[e.code]] = 0; e.preventDefault(); }
  });

  addEventListener('blur', () => {
    for (const k in input) input[k] = 0;
  });

  function bindTouch() {
    document.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.dataset.key;
      const on = (e) => { e.preventDefault(); wakeAudio(); input[key] = 1; el.classList.add('held'); };
      const off = (e) => { e.preventDefault(); input[key] = 0; el.classList.remove('held'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
    document.querySelectorAll('[data-boss]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); wakeAudio();
        bossIndex = Number(el.dataset.boss);
        startFight();
      });
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (screen !== 'title') return;
      e.preventDefault();
      wakeAudio();
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const py = ((e.clientY - r.top) / r.height) * H;
      for (let i = 0; i < unlocked; i++) {
        const nx = 118 + i * 90;
        const ny = 320 + Math.sin(i * 0.92 + 0.4) * 58;
        if ((px - nx) ** 2 + (py - ny) ** 2 < 34 * 34) { bossIndex = i; startFight(); return; }
      }
    });

    const wInput = document.getElementById('whisper-input');
    const wSend = document.getElementById('whisper-send');
    if (wSend && wInput) {
      const fire = (e) => {
        e.preventDefault();
        wakeAudio();
        sendWhisper(wInput.value);
        wInput.value = '';
        wInput.blur();
      };
      wSend.addEventListener('pointerdown', fire);
      wInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(e); });
    }
    document.querySelectorAll('[data-whisper]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); wakeAudio(); sendWhisper(el.dataset.whisper);
      });
    });

    const restart = document.getElementById('restart');
    if (restart) restart.addEventListener('pointerdown', (e) => {
      e.preventDefault(); screen = 'title'; battle = null;
    });
  }

  /* ------------------------------------------------------------ lifecycle */

  function startFight() {
    battle = new SIM.Battle(SIM.BOSSES[bossIndex], (Date.now() & 0xffff) | 1);
    particles = [];
    trails = [];
    screen = 'fight';
    endTimer = 0;
    hint = 1;
    document.body.dataset.boss = SIM.BOSSES[bossIndex].id;
  }

  /* -------------------------------------------------------------- effects */

  function spark(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random()) * (speed || 3);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1,
        life: 18 + Math.random() * 16, max: 34,
        color, size: 1.5 + Math.random() * 2.5, grav: 0.16
      });
    }
  }

  function dust(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 26, y: y - Math.random() * 8,
        vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 1.4,
        life: 26 + Math.random() * 20, max: 46,
        color, size: 2 + Math.random() * 3, grav: -0.01
      });
    }
  }

  function consumeEvents() {
    if (!battle) return;
    const hue = SIM.BOSSES[bossIndex].hue;
    for (const e of battle.events) {
      switch (e.type) {
        case 'hitBoss': spark(e.x, e.y, '#ffe9c4', 12, 3.4); flash = Math.max(flash, 0.18); sfx('hit'); break;
        case 'hitPlayer': spark(e.x, e.y, '#ff7a5c', 16, 4); flash = Math.max(flash, 0.4); sfx('hurt'); break;
        case 'slash': spark(e.x + (e.facing ? 30 : -30), e.y - 40, '#dfe9ff', 6, 2.2); sfx('slash'); break;
        case 'dash': trails.push({ x: e.x, y: e.y, life: 16 }); sfx('dash'); break;
        case 'land': dust(e.x, e.y, '#6b7a90', 6); sfx('land'); break;
        case 'jump': dust(e.x, e.y, '#5d6b80', 3); sfx('jump'); break;
        case 'heal': spark(e.x, e.y, '#9be6c0', 20, 2.6); sfx('heal'); break;
        case 'focusTick': particles.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y, vx: 0, vy: -1.6, life: 22, max: 22, color: '#8fd7ff', size: 2, grav: 0 }); break;
        case 'phase': spark(e.x, e.y - 80, `hsl(${hue} 80% 70%)`, 40, 5); flash = 0.85; sfx('phase'); break;
        case 'stagger': spark(e.x, e.y - 80, '#ffd479', 26, 4); sfx('stagger'); break;
        case 'telegraph': {
          const d = Math.abs(battle.player.x - e.x);
          sfx('telegraph', { pitch: Math.min(1, Math.max(0, 1 - d / 520)) });
          break;
        }
        case 'swing': dust(e.x + (e.facing ? 50 : -50), e.y, `hsl(${hue} 60% 60%)`, 8); sfx('swing'); break;
        case 'capture': spark(e.x, e.y, '#ffd479', 50, 5); flash = 0.9; sfx('capture'); break;
        case 'bossDeath': spark(e.x, e.y - 80, `hsl(${hue} 70% 65%)`, 60, 6); flash = 0.9; sfx('victory'); break;
        case 'death': flash = 0.8; sfx('death'); break;
      }
    }
  }

  /* ---------------------------------------------------------------- draw */

  function sky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#080b12');
    g.addColorStop(0.55, '#0d1220');
    g.addColorStop(1, '#070910');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // distant glow
    const gl = ctx.createRadialGradient(W * 0.5, H * 0.62, 20, W * 0.5, H * 0.62, 420);
    gl.addColorStop(0, 'rgba(90,140,190,0.10)');
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    // cave arches, three parallax layers
    const layers = [
      { p: 0.12, y: 0.30, amp: 54, col: '#0c1119', freq: 0.9 },
      { p: 0.26, y: 0.44, amp: 70, col: '#101724', freq: 0.6 },
      { p: 0.45, y: 0.60, amp: 88, col: '#151d2c', freq: 0.42 }
    ];
    for (const L of layers) {
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) {
        const s = x + (battle ? battle.player.x * L.p : 0);
        const y = H * L.y - Math.sin(s * 0.006 * L.freq) * L.amp
          - Math.sin(s * 0.013 * L.freq + 2.1) * L.amp * 0.42
          - Math.sin(s * 0.027 + t * 0.0002) * 8;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = L.col;
      ctx.fill();
    }

    // dust motes
    for (let i = 0; i < 46; i++) {
      const seed = i * 97.13;
      const x = (seed * 37 + t * 0.012 * (1 + (i % 4))) % W;
      const y = ((seed * 61) % (H - 120)) + 40 + Math.sin(t * 0.0009 + i) * 12;
      const a = 0.05 + (i % 5) * 0.022;
      ctx.fillStyle = `rgba(190,215,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, 6.284);
      ctx.fill();
    }
  }

  function ground() {
    const g = ctx.createLinearGradient(0, FLOOR - 4, 0, H);
    g.addColorStop(0, '#1b2433');
    g.addColorStop(0.15, '#141b27');
    g.addColorStop(1, '#0a0d14');
    ctx.fillStyle = g;
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = 'rgba(150,190,235,0.16)';
    ctx.fillRect(0, FLOOR - 1, W, 2);
    // rubble
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 131) % W;
      const w = 6 + (i % 5) * 5;
      ctx.fillRect(x, FLOOR + 6 + (i % 3) * 7, w, 3);
    }
  }

  function drawShadow(x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, w, w * 0.26, 0, 0, 6.284);
    ctx.fill();
  }

  function drawPlayer(p, t) {
    const bob = p.onGround ? Math.sin(t * 0.008) * 1.6 : 0;
    const x = p.x;
    const y = p.y + bob;
    const face = p.facing ? 1 : -1;

    // dash afterimages
    for (const tr of trails) {
      ctx.globalAlpha = (tr.life / 16) * 0.25;
      ctx.fillStyle = '#9fc6ff';
      ctx.beginPath();
      ctx.ellipse(tr.x, tr.y - 26, 12, 20, 0, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawShadow(p.x, p.y, 16);

    if (p.hurt > 0 && (t / 40) % 2 < 1) ctx.globalAlpha = 0.45;

    // cloak
    const cloak = ctx.createLinearGradient(x, y - 52, x, y);
    cloak.addColorStop(0, '#e9eefb');
    cloak.addColorStop(0.55, '#b9c6dd');
    cloak.addColorStop(1, '#6d7c96');
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(x - 13, y - 4);
    ctx.quadraticCurveTo(x - 16, y - 30, x - 7, y - 44);
    ctx.lineTo(x + 7, y - 44);
    ctx.quadraticCurveTo(x + 16, y - 30, x + 13, y - 4);
    ctx.closePath();
    ctx.fill();

    // head
    ctx.fillStyle = '#eef3ff';
    ctx.beginPath();
    ctx.ellipse(x, y - 50, 11, 12, 0, 0, 6.284);
    ctx.fill();

    // ears
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 56);
    ctx.quadraticCurveTo(x - 16, y - 78, x - 5, y - 62);
    ctx.closePath();
    ctx.moveTo(x + 8, y - 56);
    ctx.quadraticCurveTo(x + 16, y - 78, x + 5, y - 62);
    ctx.closePath();
    ctx.fill();

    // eyes
    ctx.fillStyle = '#14181f';
    ctx.beginPath();
    ctx.ellipse(x + face * 3.4, y - 50, 1.7, 3.2, 0, 0, 6.284);
    ctx.ellipse(x - face * 2.6, y - 50, 1.7, 3.2, 0, 0, 6.284);
    ctx.fill();

    // legs
    const stride = p.onGround && Math.abs(p.vx) > 0.01 ? 0 : 0;
    const swing = p.onGround ? Math.sin(t * 0.016) * 3 : 4;
    ctx.strokeStyle = '#8b9ab4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 8); ctx.lineTo(x - 5 + swing + stride, y);
    ctx.moveTo(x + 4, y - 8); ctx.lineTo(x + 5 - swing, y);
    ctx.stroke();

    // nail
    if (p.swingT > 0) {
      const prog = 1 - p.swingT / 11;
      const ang = (-0.9 + prog * 2.0) * face;
      ctx.save();
      ctx.translate(x, y - 34);
      ctx.rotate(ang);
      const grad = ctx.createLinearGradient(0, 0, face * 54, 0);
      grad.addColorStop(0, 'rgba(220,240,255,0.15)');
      grad.addColorStop(0.4, 'rgba(235,248,255,0.95)');
      grad.addColorStop(1, 'rgba(190,225,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(face * 54, 0);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(210,228,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + face * 10, y - 30);
      ctx.lineTo(x + face * 26, y - 44);
      ctx.stroke();
    }

    // focus aura
    if (p.focusT > 0) {
      const r = 14 + Math.sin(t * 0.02) * 3;
      const g2 = ctx.createRadialGradient(x, y - 30, 2, x, y - 30, r + 16);
      g2.addColorStop(0, 'rgba(150,220,255,0.55)');
      g2.addColorStop(1, 'rgba(150,220,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x, y - 30, r + 16, 0, 6.284);
      ctx.fill();
    }

    // dash iframes ring
    if (p.iframes > 0 && p.dashT > 0) {
      ctx.strokeStyle = `rgba(160,210,255,${0.5 * (p.iframes / 13)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y - 26, 22, 30, 0, 0, 6.284);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function drawCompanion(c, t) {
    if (!c) return;
    const bob = Math.sin(t * 0.006 + 1.2) * 2;
    const x = c.x, y = c.y + bob;
    const face = c.facing ? 1 : -1;

    drawShadow(c.x, c.y, 12);

    // cloak, cooler palette than the player
    const g = ctx.createLinearGradient(x, y - 42, x, y);
    g.addColorStop(0, '#cfe3ff');
    g.addColorStop(0.6, '#8fb0d8');
    g.addColorStop(1, '#4d6480');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 3);
    ctx.quadraticCurveTo(x - 12, y - 26, x - 5, y - 36);
    ctx.lineTo(x + 5, y - 36);
    ctx.quadraticCurveTo(x + 12, y - 26, x + 10, y - 3);
    ctx.closePath();
    ctx.fill();

    // head + ears
    ctx.fillStyle = '#e6efff';
    ctx.beginPath();
    ctx.ellipse(x, y - 41, 8.5, 9, 0, 0, 6.284);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 46);
    ctx.quadraticCurveTo(x - 13, y - 63, x - 4, y - 50);
    ctx.closePath();
    ctx.moveTo(x + 6, y - 46);
    ctx.quadraticCurveTo(x + 13, y - 63, x + 4, y - 50);
    ctx.closePath();
    ctx.fill();

    // eyes
    ctx.fillStyle = '#16202e';
    ctx.beginPath();
    ctx.ellipse(x + face * 2.6, y - 41, 1.4, 2.6, 0, 0, 6.284);
    ctx.ellipse(x - face * 2.0, y - 41, 1.4, 2.6, 0, 0, 6.284);
    ctx.fill();

    // nail
    if (c.swingT > 0) {
      const prog = 1 - c.swingT / 10;
      const ang = (-0.9 + prog * 2.0) * face;
      ctx.save();
      ctx.translate(x, y - 28);
      ctx.rotate(ang);
      const ng = ctx.createLinearGradient(0, 0, face * 44, 0);
      ng.addColorStop(0, 'rgba(190,235,255,0.2)');
      ng.addColorStop(1, 'rgba(210,245,255,0.9)');
      ctx.strokeStyle = ng;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(face * 44, 0);
      ctx.stroke();
      ctx.restore();
    }

    // hp pips above him
    for (let i = 0; i < c.maxHp; i++) {
      ctx.fillStyle = i < c.hp ? 'rgba(150,220,255,0.9)' : 'rgba(150,220,255,0.16)';
      ctx.beginPath();
      ctx.arc(x - 8 + i * 8, y - 58, 2, 0, 6.284);
      ctx.fill();
    }

    // speech
    if (c.sayT > 0 && c.say) {
      const a = Math.min(1, c.sayT / 30);
      ctx.font = '400 11px "Fragment Mono", monospace';
      const w = ctx.measureText(c.say).width;
      const bx = Math.max(8, Math.min(W - w - 24, x - w / 2 - 8));
      const by = y - 84;
      ctx.fillStyle = `rgba(8,12,18,${0.85 * a})`;
      ctx.fillRect(bx, by, w + 16, 22);
      ctx.fillStyle = `rgba(255,212,121,${0.85 * a})`;
      ctx.fillRect(bx, by, 2, 22);
      ctx.fillStyle = `rgba(220,235,255,${a})`;
      ctx.textAlign = 'left';
      ctx.fillText(c.say, bx + 8, by + 15);
    }
  }

  function drawBoss(b, def, t) {
    const hue = def.hue;
    const s = def.size || 1;
    const x = b.x;
    const y = b.y;
    const face = b.facing === 1 ? 1 : -1;
    const stagger = b.state === 'stagger';
    const tilt = stagger ? Math.sin(t * 0.02) * 0.16 : 0;
    const phaseGlow = b.state === 'phase' ? 1 : 0;

    drawShadow(x, y, 34 * s);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    // aura
    const auraR = 96 * s + (b.atkStage === 'tel' ? 18 : 0) + phaseGlow * 40;
    const aura = ctx.createRadialGradient(0, -60 * s, 8, 0, -60 * s, auraR);
    const pulse = b.atkStage === 'tel' ? 0.20 + 0.12 * Math.sin(t * 0.03) : 0.10;
    aura.addColorStop(0, `hsla(${hue},85%,60%,${pulse + phaseGlow * 0.3})`);
    aura.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -60 * s, auraR, 0, 6.284);
    ctx.fill();

    // body
    const bodyGrad = ctx.createLinearGradient(0, -120 * s, 0, 0);
    bodyGrad.addColorStop(0, `hsl(${hue},22%,26%)`);
    bodyGrad.addColorStop(0.6, `hsl(${hue},20%,16%)`);
    bodyGrad.addColorStop(1, `hsl(${hue},18%,9%)`);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-16 * s, 0);
    ctx.quadraticCurveTo(-30 * s, -46 * s, -18 * s, -86 * s);
    ctx.quadraticCurveTo(-12 * s, -104 * s, 0, -106 * s);
    ctx.quadraticCurveTo(12 * s, -104 * s, 18 * s, -86 * s);
    ctx.quadraticCurveTo(30 * s, -46 * s, 16 * s, 0);
    ctx.closePath();
    ctx.fill();

    // rim light
    ctx.strokeStyle = `hsla(${hue},60%,62%,0.5)`;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // helm
    ctx.fillStyle = `hsl(${hue},18%,20%)`;
    ctx.beginPath();
    ctx.ellipse(0, -96 * s, 15 * s, 16 * s, 0, 0, 6.284);
    ctx.fill();
    // horns
    ctx.beginPath();
    ctx.moveTo(-11 * s, -104 * s);
    ctx.quadraticCurveTo(-26 * s, -140 * s, -6 * s, -112 * s);
    ctx.closePath();
    ctx.moveTo(11 * s, -104 * s);
    ctx.quadraticCurveTo(26 * s, -140 * s, 6 * s, -112 * s);
    ctx.closePath();
    ctx.fillStyle = `hsl(${hue},20%,24%)`;
    ctx.fill();

    // eyes
    const eyeGlow = b.atkStage === 'tel' ? 1 : 0.65;
    ctx.fillStyle = `hsla(${hue},95%,72%,${eyeGlow})`;
    ctx.beginPath();
    ctx.ellipse(-5 * s, -97 * s, 2.6 * s, 4.2 * s, 0, 0, 6.284);
    ctx.ellipse(5 * s, -97 * s, 2.6 * s, 4.2 * s, 0, 0, 6.284);
    ctx.fill();

    // blade
    let bladeAng = 0.5;
    if (b.atkStage === 'tel') bladeAng = 0.5 - 1.5 * (1 - b.atkT / (b.atk ? b.atk.tel : 1));
    else if (b.atkStage === 'act') bladeAng = -1.0 + 1.9 * (1 - b.atkT / (b.atk ? b.atk.act : 1));
    else if (stagger) bladeAng = 1.5;
    ctx.save();
    ctx.translate(face * 14 * s, -62 * s);
    ctx.rotate(bladeAng * face);
    const bg = ctx.createLinearGradient(0, 0, face * 92 * s, 0);
    bg.addColorStop(0, `hsla(${hue},30%,40%,0.9)`);
    bg.addColorStop(1, `hsla(${hue},70%,${b.atkStage === 'act' ? 82 : 62}%,0.95)`);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(0, -3.5);
    ctx.lineTo(face * 92 * s, -1.5);
    ctx.lineTo(face * 96 * s, 0);
    ctx.lineTo(face * 92 * s, 2.5);
    ctx.lineTo(0, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // hit flash
    if (b.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,240,220,${b.flash / 12})`;
      ctx.beginPath();
      ctx.ellipse(0, -56 * s, 34 * s, 62 * s, 0, 0, 6.284);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // stagger stars
    if (stagger) {
      for (let i = 0; i < 3; i++) {
        const a = t * 0.006 + i * 2.1;
        ctx.fillStyle = `rgba(255,212,121,${0.5 + 0.4 * Math.sin(t * 0.01 + i)})`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 26, -120 * s + Math.sin(a) * 8, 2.6, 0, 6.284);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life--;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }
  }

  function drawHUD() {
    const p = battle.player, b = battle.boss, def = SIM.BOSSES[bossIndex];

    // masks
    for (let i = 0; i < SIM.P.masks; i++) {
      const x = 34 + i * 30, y = 40;
      const full = i < p.masks;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.quadraticCurveTo(11, -6, 11, 2);
      ctx.quadraticCurveTo(11, 10, 0, 14);
      ctx.quadraticCurveTo(-11, 10, -11, 2);
      ctx.quadraticCurveTo(-11, -6, 0, -11);
      ctx.closePath();
      ctx.fillStyle = full ? '#eef3ff' : 'rgba(255,255,255,0.10)';
      ctx.fill();
      ctx.strokeStyle = full ? 'rgba(180,205,240,0.8)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    // soul orb
    const cx = 34, cy = 96, r = 21;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.284);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,205,240,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const frac = p.soul / SIM.P.soulMax;
    if (frac > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, 0, 6.284);
      ctx.clip();
      const lvl = cy + (r - 3) - (r - 3) * 2 * frac;
      const g = ctx.createLinearGradient(0, lvl, 0, cy + r);
      g.addColorStop(0, 'rgba(190,235,255,0.95)');
      g.addColorStop(1, 'rgba(90,160,220,0.75)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, lvl + (r - 3), (r - 3) * 1.6, 0, 6.284);
      ctx.fill();
      ctx.restore();
    }
    if (p.soul >= SIM.P.focusCost) {
      ctx.strokeStyle = `rgba(190,235,255,${0.35 + 0.25 * Math.sin(time * 0.005)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, 6.284);
      ctx.stroke();
    }

    // boss bar
    const bw = 460, bx = (W - bw) / 2, by = H - 46;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(bx, by, bw, 12);
    const hpFrac = b.hp / b.maxHp;
    const barGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    barGrad.addColorStop(0, `hsl(${def.hue},70%,52%)`);
    barGrad.addColorStop(1, `hsl(${def.hue},85%,68%)`);
    ctx.fillStyle = barGrad;
    ctx.fillRect(bx, by, bw * hpFrac, 12);

    // phase ticks
    for (const pct of [def.phase2, def.phase3]) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx + bw * (pct / 100), by - 3, 2, 18);
    }

    ctx.font = '600 13px "Fragment Mono", monospace';
    ctx.fillStyle = 'rgba(220,232,255,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText(`${def.name.toUpperCase()}   ·   PHASE ${b.phase}`, W / 2, by - 12);

    // companion readout
    if (battle.companion) {
      const c = battle.companion;
      ctx.font = '400 10.5px "Fragment Mono", monospace';
      ctx.fillStyle = 'rgba(150,200,255,0.55)';
      ctx.fillText(`COMPANION  ${c.state.toUpperCase()}  ·  ${c.mood}  ·  energy ${Math.round(c.energy)}`, 34, H - 18);
    }

    // capture prompt
    const canCatch = b.hp / b.maxHp <= 0.15 && b.hp > 0;
    if (canCatch) {
      const a = 0.55 + 0.45 * Math.sin(time * 0.008);
      ctx.font = '600 15px "Fragment Mono", monospace';
      ctx.fillStyle = `rgba(255,212,121,${a})`;
      ctx.fillText('HOLD  E  /  CATCH  —  the creature is weak', W / 2, by - 34);
      if (battle.captureT) {
        ctx.fillStyle = 'rgba(255,212,121,0.9)';
        ctx.fillRect(W / 2 - 70, by - 26, 140 * (battle.captureT / 36), 3);
      }
    }
    ctx.textAlign = 'left';
  }

  /* --------------------------------------------------------------- frames */

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) lastFrame = now;
    let delta = Math.min(120, now - lastFrame);
    lastFrame = now;
    time = now;

    if (screen === 'fight' && battle) {
      acc += delta;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        if (spectate && AUTOPILOT) {
          const a = AUTOPILOT.think(battle, time, whisper);
          lastDecision = a.decision;
          battle.step(a);
        } else {
          battle.step(input);
        }
        consumeEvents();
        acc -= STEP;
        steps++;
      }
      if (whisper.ttl > 0) whisper.ttl--;
      if (whisper.ackT > 0) whisper.ackT--;

      if (battle.outcome !== 'ongoing') {
        if (battle.outcome !== 'lost' && !battle._counted) {
          battle._counted = true;
          unlockNext(bossIndex);
        }
        endTimer += delta;
        if (endTimer > 700) {
          screen = battle.outcome === 'won' ? 'won'
            : battle.outcome === 'captured' ? 'captured' : 'lost';
        }
      }
    }

    render(delta);
  }

  function render(delta) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shake = battle && battle.shake > 0.2 ? battle.shake : 0;
    ctx.save();
    if (shake) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    sky(time);
    ground();

    if (battle) {
      drawBoss(battle.boss, SIM.BOSSES[bossIndex], time);
      drawCompanion(battle.companion, time);
      drawPlayer(battle.player, time);
      drawParticles(delta);
    }

    ctx.restore();

    if (battle && screen === 'fight') {
      drawHUD();
      const bar = document.getElementById('whisper');
      if (bar) bar.style.display = spectate ? 'flex' : 'none';
      if (whisper.ttl > 0) {
        ctx.font = '600 10px "Fragment Mono", monospace';
        ctx.fillStyle = 'rgba(255,212,121,0.55)';
        ctx.textAlign = 'center';
        ctx.fillText('WHISPER: ' + whisper.text.toUpperCase(), W / 2, 26);
        if (whisper.ackT > 0) {
          ctx.font = 'italic 400 11px "Fragment Mono", monospace';
          ctx.fillStyle = `rgba(190,220,255,${Math.min(1, whisper.ackT / 60) * 0.8})`;
          ctx.fillText('"' + whisper.ack + '"', W / 2, 44);
        }
        ctx.textAlign = 'left';
      }

      if (spectate) {
        ctx.font = '600 11px "Fragment Mono", monospace';
        ctx.fillStyle = 'rgba(255,212,121,0.9)';
        ctx.textAlign = 'right';
        ctx.fillText('AI PILOT', W - 34, 34);
        ctx.font = '400 11px "Fragment Mono", monospace';
        ctx.fillStyle = 'rgba(190,210,240,0.65)';
        ctx.fillText(lastDecision, W - 34, 52);
        ctx.textAlign = 'left';
      }
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,240,220,${flash})`;
      ctx.fillRect(0, 0, W, H);
      flash *= 0.86;
    }

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    drawOverlay();
  }

  function drawOverlay() {
    const wbar = document.getElementById('whisper');
    if (wbar) wbar.style.display = 'none';

    if (screen === 'title') {
      ctx.fillStyle = 'rgba(6,9,14,0.86)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';

      ctx.font = '700 54px "Bricolage Grotesque", Georgia, serif';
      ctx.fillStyle = '#eef3ff';
      ctx.fillText('NAIL & SOUL', W / 2, 116);

      ctx.font = '400 14px "Fragment Mono", monospace';
      ctx.fillStyle = 'rgba(190,210,240,0.5)';
      ctx.fillText('a Hollow Knight-style action game with a catching mechanic', W / 2, 144);

      ctx.font = '400 11.5px "Fragment Mono", monospace';
      ctx.fillStyle = 'rgba(190,210,240,0.32)';
      ctx.fillText('A / D move    SPACE jump    J nail    K dash    L focus    E catch    M mute', W / 2, 170);

      // the path
      const nodes = SIM.BOSSES.map((b, i) => ({
        b, i,
        x: 118 + i * 90,
        y: 320 + Math.sin(i * 0.92 + 0.4) * 58
      }));

      ctx.strokeStyle = 'rgba(150,180,230,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      nodes.forEach((n, k) => (k ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y)));
      ctx.stroke();

      for (const n of nodes) {
        const open = n.i < unlocked;
        const done = n.i < unlocked - 1;
        const isNext = n.i === unlocked - 1;

        if (open) {
          const glow = ctx.createRadialGradient(n.x, n.y, 2, n.x, n.y, 40);
          glow.addColorStop(0, `hsla(${n.b.hue},70%,60%,0.28)`);
          glow.addColorStop(1, 'hsla(0,0%,0%,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 40, 0, 6.284);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, 19, 0, 6.284);
        ctx.fillStyle = open ? `hsl(${n.b.hue},30%,16%)` : 'rgba(255,255,255,0.03)';
        ctx.fill();
        ctx.strokeStyle = open ? `hsl(${n.b.hue},65%,58%)` : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = isNext ? 2.4 : 1.4;
        ctx.stroke();

        ctx.font = '600 14px "Fragment Mono", monospace';
        ctx.fillStyle = open ? '#eef3ff' : 'rgba(255,255,255,0.16)';
        ctx.fillText(done ? '\u2713' : String(n.i + 1), n.x, n.y + 5);

        if (open) {
          ctx.font = '400 10px "Fragment Mono", monospace';
          ctx.fillStyle = isNext ? 'rgba(255,212,121,0.85)' : 'rgba(190,210,240,0.42)';
          const nm = n.b.name.replace(' of the Grove', '').replace(' of Ash', '');
          ctx.fillText(nm.length > 15 ? nm.slice(0, 14) + '\u2026' : nm, n.x, n.y + 36);
        }
        if (isNext) {
          ctx.font = '400 9px "Fragment Mono", monospace';
          ctx.fillStyle = `rgba(255,212,121,${0.35 + 0.3 * Math.sin(time * 0.005)})`;
          ctx.fillText('NEXT', n.x, n.y - 30);
        }
      }

      ctx.font = '400 12px "Fragment Mono", monospace';
      ctx.fillStyle = 'rgba(190,210,240,0.4)';
      ctx.fillText(`${Math.min(unlocked, SIM.BOSSES.length)} / ${SIM.BOSSES.length} reachable  ·  tap a node or press 1–9`, W / 2, H - 64);
      ctx.fillStyle = `rgba(255,212,121,${0.45 + 0.35 * Math.sin(time * 0.004)})`;
      ctx.fillText('ENTER — fight the next one     S — watch the AI play it', W / 2, H - 40);
      ctx.textAlign = 'left';
    }

    if (screen === 'won' || screen === 'captured' || screen === 'lost') {
      const win = screen !== 'lost';
      ctx.fillStyle = 'rgba(6,9,14,0.78)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = '700 54px "Bricolage Grotesque", Georgia, serif';
      ctx.fillStyle = win ? '#ffd479' : '#ff8a72';
      ctx.fillText(screen === 'captured' ? 'CAPTURED' : win ? 'THE KNIGHT FALLS' : 'YOU DIED', W / 2, H / 2 - 30);
      ctx.font = '400 15px "Fragment Mono", monospace';
      ctx.fillStyle = 'rgba(190,210,240,0.6)';
      ctx.fillText(
        screen === 'captured'
          ? 'the creature joins you — a bond struck in the dark'
          : win ? 'the arena falls silent'
          : 'the dark takes another wanderer',
        W / 2, H / 2 + 10);
      ctx.fillStyle = `rgba(255,212,121,${0.5 + 0.4 * Math.sin(time * 0.004)})`;
      const nextName = win && bossIndex + 1 < SIM.BOSSES.length
        ? `ENTER — next: ${SIM.BOSSES[bossIndex + 1].name}` : 'ENTER — return to the path';
      ctx.fillText(nextName, W / 2, H / 2 + 56);
      ctx.textAlign = 'left';
    }
  }

  /* ----------------------------------------------------------------- boot */

  function fit() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
  }

  addEventListener('resize', fit);
  fit();
  bindTouch();
  requestAnimationFrame(frame);
})();
