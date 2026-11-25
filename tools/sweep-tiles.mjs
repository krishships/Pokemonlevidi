/* Full-map tile sampler.
 *
 * Walking is far too slow (~35 emulated fps, one tile per press). The harness
 * has write access, so the player's position can be set directly: the game
 * scrolls to it, and every metatile on the map can be fingerprinted in seconds.
 * Collision comes from the metatile attributes, which is what the movement
 * engine itself tests.
 */
import { Gba } from '@gba-kit/gba-emulator';
import { loadSnap, saveSnap } from './snap.mjs';
import fs from 'fs';

const W = 240, H = 160, CW = 15, CH = 10;
const gba = new Gba();
gba.loadRom(new Uint8Array(fs.readFileSync('/scratch/work/emu/rom/heart-and-soul.gba')));
try { gba.deserialize(loadSnap('/scratch/work/emu/state.json')); } catch (e) {}
for (let i = 0; i < 30; i++) gba.runFrame();

const r32 = a => gba.bus.read32(a) >>> 0;
const r16 = a => gba.bus.read16(a) & 0xFFFF;
const r8 = a => gba.bus.read8(a);
const SB = 0x030071F0, sb = () => r32(SB);
const pos = () => ({ x: r16(sb()), y: r16(sb() + 2), g: r8(sb() + 4), n: r8(sb() + 5) });
const ROM = v => (v >>> 24) === 8 || (v >>> 24) === 9;
const H_ = 0x200b618;

function mapInfo() {
  const lay = r32(H_);
  const mp = r32(lay + 0x0C), pr = r32(lay + 0x10), se = r32(lay + 0x14);
  const pa = ROM(pr) ? r32(pr + 0x10) : 0, sa = ROM(se) ? r32(se + 0x10) : 0;
  return { w: r32(lay), h: r32(lay + 4), mp, pa, sa };
}
const colOf = (id, m) => {
  if (id < 512 && ROM(m.pa)) return r16(m.pa + id * 2) & 3;
  if (ROM(m.sa)) return r16(m.sa + (id - 512) * 2) & 3;
  return -1;
};
const metaAt = (mx, my, m) =>
  (mx < 0 || my < 0 || mx >= m.w || my >= m.h) ? -1 : r16(m.mp + (my * m.w + mx) * 2);

function frameCells() {
  const fb = gba.ppu.getFramebuffer();
  const cells = [];
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    let h = '';
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const p = fb[(cy * 16 + by * 4 + j) * W + cx * 16 + bx * 4 + i];
        r += p & 0xFF; g += (p >> 8) & 0xFF; b += (p >> 16) & 0xFF;
      }
      h += String.fromCharCode(48 + (((r >> 10) & 3) << 4 | ((g >> 10) & 3) << 2 | ((b >> 10) & 3)));
    }
    cells.push(h);
  }
  return cells;
}

const PC = { x: 7, y: 4 };
const table = {};
let cells = 0, pass = 0, block = 0;

function sampleHere() {
  const m = mapInfo();
  const p = pos();
  const grid = frameCells();
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const id = metaAt(p.x + (cx - PC.x), p.y + (cy - PC.y), m);
    if (id < 0) continue;
    const c = colOf(id, m);
    if (c < 0) continue;
    const h = grid[cy * CW + cx];
    const t = table[h] || (table[h] = { w: 0, b: 0, x: 0 });
    if (c === 0) { t.w++; pass++; } else { t.b++; block++; }
    cells++;
  }
}

const start = pos();
const m0 = mapInfo();
console.log(`map ${start.g}:${start.n} ${m0.w}x${m0.h}`);

/* sweep every position on this map, teleporting instead of walking */
for (let my = 0; my < m0.h; my += 3) {
  for (let mx = 0; mx < m0.w; mx += 3) {
    const p = sb();
    gba.bus.write16(p, mx);
    gba.bus.write16(p + 2, my);
    for (let f = 0; f < 24; f++) gba.runFrame();
    sampleHere();
  }
}
console.log(`swept ${m0.w}x${m0.h}: ${cells} cells (${pass} passable, ${block} blocked), ${Object.keys(table).length} fingerprints`);

const out = {};
let conflict = 0;
for (const [h, t] of Object.entries(table)) {
  if (t.w > 0 && t.b > 0) { conflict++; continue; }
  out[h] = { w: t.w, b: t.b, x: 0 };
}
const prevPath = '/scratch/work/audit/site/tiles.json';
let prev = {};
try { prev = JSON.parse(fs.readFileSync(prevPath, 'utf8')); } catch (e) {}
const merged = Object.assign({}, prev, out);
fs.writeFileSync(prevPath, JSON.stringify(merged));
saveSnap(gba, '/scratch/work/emu/state.json');
console.log(`wrote ${Object.keys(out).length} new (${conflict} ambiguous skipped); table now ${Object.keys(merged).length}`);
