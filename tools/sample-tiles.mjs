/* ROM-specific tile table generator, multi-position.
 * Collision comes from the map's own metatile attributes (what the movement
 * engine tests), fingerprints from the framebuffer (what the page computes).
 * Each new screen brings metatiles we have not fingerprinted yet.
 */
import { Gba, GbaButton } from '@gba-kit/gba-emulator';
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
const layout = r32(H_);
const mapPtr = r32(layout + 0x0C), prim = r32(layout + 0x10), sec = r32(layout + 0x14);
let mapW = r32(layout), mapH = r32(layout + 4);

const primAttr = ROM(prim) ? r32(prim + 0x10) : 0;
const secAttr = ROM(sec) ? r32(sec + 0x10) : 0;
const collisionOf = (id) => {
  if (id < 512 && ROM(primAttr)) return r16(primAttr + id * 2) & 3;
  if (ROM(secAttr)) return r16(secAttr + (id - 512) * 2) & 3;
  return -1;
};
const metatileAt = (mx, my) =>
  (mx < 0 || my < 0 || mx >= mapW || my >= mapH) ? -1 : r16(mapPtr + (my * mapW + mx) * 2);

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
let seen = 0, passable = 0, blocked = 0;
const B = GbaButton;
const hold = (b, f = 26) => { gba.pressButton(b); for (let i = 0; i < f; i++) gba.runFrame(); gba.releaseButton(b); for (let i = 0; i < 6; i++) gba.runFrame(); };

function sample() {
  /* the map can change under us: re-read the header each time */
  const lay = r32(H_);
  const mp = r32(lay + 0x0C);
  const pr = r32(lay + 0x10), se = r32(lay + 0x14);
  mapW = r32(lay); mapH = r32(lay + 4);
  const pa = ROM(pr) ? r32(pr + 0x10) : 0, sa = ROM(se) ? r32(se + 0x10) : 0;
  const col = (id) => {
    if (id < 512 && ROM(pa)) return r16(pa + id * 2) & 3;
    if (ROM(sa)) return r16(sa + (id - 512) * 2) & 3;
    return -1;
  };
  const at = (mx, my) => (mx < 0 || my < 0 || mx >= mapW || my >= mapH) ? -1 : r16(mp + (my * mapW + mx) * 2);

  const p0 = pos();
  const cells = frameCells();
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const id = at(p0.x + (cx - PC.x), p0.y + (cy - PC.y));
    if (id < 0) continue;
    const c = col(id);
    if (c < 0) continue;
    const h = cells[cy * CW + cx];
    const t = table[h] || (table[h] = { w: 0, b: 0, x: 0 });
    if (c === 0) { t.w++; passable++; } else { t.b++; blocked++; }
    seen++;
  }
}

console.log('start', JSON.stringify(pos()));
for (let i = 0; i < 16; i++) {
  sample();
  const a = pos();
  hold(i % 3 === 2 ? B.Down : B.Right, 28);
  const b = pos();
  if (a.g !== b.g) console.log('  map', a.g + ':' + a.n, '->', b.g + ':' + b.n);
  if (i % 5 === 4) console.log(`  pass ${i}: ${seen} cells, ${Object.keys(table).length} fingerprints`);
}

const out = {};
let conflict = 0;
for (const [h, t] of Object.entries(table)) {
  if (t.w > 0 && t.b > 0) { conflict++; continue; }        // same look, different collision: skip
  out[h] = { w: t.w, b: t.b, x: 0 };
}
fs.writeFileSync('/scratch/work/audit/site/tiles.json', JSON.stringify(out));
saveSnap(gba, '/scratch/work/emu/state.json');
console.log(`cells ${seen} (${passable} passable, ${blocked} blocked)`);
console.log(`wrote ${Object.keys(out).length} tiles (${conflict} ambiguous skipped)`);
