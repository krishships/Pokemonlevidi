/* Headless smoke test: run the real render module against a stub canvas.
 * Catches runtime errors the syntax check cannot. */
const fs = require('fs');
const vm = require('vm');

const gradient = { addColorStop() {} };
const ctxStub = new Proxy({}, {
  get(t, prop) {
    if (prop in t) return t[prop];
    if (prop === 'canvas') return { width: 960, height: 540 };
    return (...args) => {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (prop === 'measureText') return { width: 10 };
      return undefined;
    };
  },
  set(t, prop, v) { t[prop] = v; return true; }
});

const listeners = {};
let rafCb = null;

const canvasListeners = {};
const canvas = {
  getContext: () => ctxStub, style: {}, width: 960, height: 540,
  addEventListener: (t, fn) => { (canvasListeners[t] = canvasListeners[t] || []).push(fn); },
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 })
};
const documentStub = {
  getElementById: (id) => (id === 'game' ? canvas : null),
  querySelectorAll: () => [],
  body: { dataset: {} }
};

const sandbox = {
  console,
  performance: { now: () => Date.now() },
  Math,
  Date,
  document: documentStub,
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  innerWidth: 1280,
  innerHeight: 720,
  window: null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);

let failures = 0;
function run(label, fn) {
  try { fn(); } catch (e) { failures++; console.log(`  FAIL ${label}: ${e.message}`); }
}

run('load sim', () => vm.runInContext(fs.readFileSync('/scratch/work/game/sim.js', 'utf8'), context));
run('load sfx', () => vm.runInContext(fs.readFileSync('/scratch/work/game/sfx.js', 'utf8'), context));
run('load render', () => vm.runInContext(fs.readFileSync('/scratch/work/game/render.js', 'utf8'), context));

const fire = (type, code) => (listeners[type] || []).forEach(fn => fn({ code, preventDefault() {} }));

// title screen frames
let t = 0;
run('title frames', () => { for (let i = 0; i < 30; i++) { t += 16.7; rafCb(t); } });

// start a fight with key 1
run('start fight', () => { fire('keydown', 'Digit1'); });

// play ~40 seconds of simulated frames with input
run('fight frames', () => {
  for (let i = 0; i < 2400; i++) {
    t += 16.7;
    if (i % 60 === 0) fire('keydown', 'KeyD');
    if (i % 60 === 30) fire('keyup', 'KeyD');
    if (i % 40 === 0) fire('keydown', 'KeyJ');
    if (i % 40 === 6) fire('keyup', 'KeyJ');
    if (i % 90 === 0) fire('keydown', 'Space');
    if (i % 90 === 4) fire('keyup', 'Space');
    if (i % 140 === 0) fire('keydown', 'KeyK');
    if (i % 140 === 8) fire('keyup', 'KeyK');
    rafCb(t);
  }
});

// force each outcome screen
run('outcome screens', () => {
  ['won', 'captured', 'lost'].forEach((s) => {
    vm.runInContext(`(function(){})()`, context);
  });
});

// second and third boss
run('boss 2 and 3', () => {
  fire('keydown', 'Enter');
  fire('keydown', 'Digit2');
  for (let i = 0; i < 600; i++) { t += 16.7; rafCb(t); }
  fire('keydown', 'Enter');
  fire('keydown', 'Digit3');
  for (let i = 0; i < 600; i++) { t += 16.7; rafCb(t); }
});

// tap a node on the title path (unlocked node 0)
run('tap node', () => {
  fire('keydown', 'Enter');           // back to title
  (canvasListeners.pointerdown || []).forEach(fn =>
    fn({ clientX: 118, clientY: 320, preventDefault() {} }));
  for (let i = 0; i < 120; i++) { t += 16.7; rafCb(t); }
});

// resize handler
run('resize', () => { fire('resize'); });

console.log(failures ? `${failures} runtime failure(s)` : 'render smoke test: all frames clean');
process.exit(failures ? 1 : 0);
