/* Standalone check: does the two-model split actually call two models?
 * EYES model gets the picture and returns text; BRAIN model gets text only.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { execSync } = require('child_process');

/* CI installs Chrome through puppeteer; a distro chromium is often a snap
 * wrapper that never prints a devtools URL. Prefer puppeteer's own binary. */
function findChrome(puppeteer) {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) {}
  try { return execSync('which chromium || which google-chrome || which chromium-browser')
            .toString().trim().split('\n')[0]; } catch (e) {}
  return undefined;
}
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { puppeteer = require('/usr/lib/node_modules/puppeteer-core'); }

const SITE = path.join(__dirname, '..', 'site');
const calls = [];

const server = http.createServer((q, r) => {
  if (q.method === 'OPTIONS') {
    r.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    return r.end();
  }
  if (q.url.startsWith('/v1/chat/completions')) {
    let body = '';
    q.on('data', d => body += d);
    q.on('end', () => {
      const j = JSON.parse(body || '{}');
      const hasImage = JSON.stringify(j.messages || []).includes('image_url');
      calls.push({ model: j.model, hasImage });
      const content = j.model === 'eyes-model'
        ? 'Dialogue box open: MOM says AAAA we are here hon. Player stands next to the truck.'
        : JSON.stringify({ say: 'mom is talking, press A', buttons: ['A'] });
      const out = JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });
      r.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      r.end(out);
    });
    return;
  }
  const f = path.join(SITE, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    r.end(d);
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, extra) => { if (!ok) fails++; console.log((ok ? '  PASS ' : '  FAIL ') + n + (ok || !extra ? '' : '  ' + extra)); };

(async () => {
  await new Promise(r => server.listen(8977, r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || execSync('which chromium 2>/dev/null || which google-chrome').toString().trim(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8977/', { waitUntil: 'domcontentloaded' });

  // stub the emulator, like the other test does
  await page.evaluate(() => {
    window.__png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    window.__shot = 0;
    window.EJS_emulator = {
      gameManager: {
        screenshot: function () { window.__shot++; const a = new Uint8Array(window.__png); a[a.length - 2] = window.__shot & 0xFF; return Promise.resolve(a); },
        simulateInput: function () {}, getFrameNum: function () { return 1; },
        getState: function () { return new Uint8Array(8); }, saveSaveFiles: function () {}
      }
    };
  });

  // configure: brain = groq-ish, eyes = a different model on a different endpoint
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('redexe.v1') || '{}');
    s.mode = 'api'; s.apikey = 'brain-key'; s.model = 'brain-model';
    s.endpoint = 'http://localhost:8977/v1/chat/completions';
    s.eyesEndpoint = 'http://localhost:8977/v1/chat/completions';
    s.eyesModel = 'qwen/qwen3.8-27b'; s.gap = 1;
    localStorage.setItem('redexe.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    window.__shot = 0;
    window.EJS_emulator = { gameManager: { screenshot: function () { window.__shot++; const a = new Uint8Array(window.__png); a[a.length - 2] = window.__shot & 0xFF; return Promise.resolve(a); }, simulateInput: function () {}, getFrameNum: function () { return 1; }, getState: function () { return new Uint8Array(8); }, saveSaveFiles: function () {} } };
  });

  // boot the emulator stub the same way the page really boots: a file on #rom
  await page.evaluate(() => {
    const input = document.getElementById('rom');
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test.gbc', { type: 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1200);
  await page.evaluate(() => { const b = document.getElementById('startAI'); if (b) b.click(); });
  await sleep(6000);

  const eyes = calls.filter(c => c.model === 'qwen/qwen3.8-27b');
  const brain = calls.filter(c => c.model === 'brain-model');
  check('eyes model was called', eyes.length > 0, 'calls=' + calls.length);
  check('eyes model received the picture', eyes.some(c => c.hasImage));
  check('brain model was called', brain.length > 0);
  check('brain model got text only (no image)', brain.every(c => !c.hasImage),
        JSON.stringify(brain.map(c => c.hasImage)));

  // ---------- picture cadence: not every call should carry an image
  calls.length = 0;
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('redexe.v1') || '{}');
    st.eyesModel = ''; st.eyesEndpoint = ''; st.eyesKey = '';   // one model only
    st.model = 'brain-model'; st.imgEvery = 3; st.gap = 1;
    localStorage.setItem('redexe.v1', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    window.__shot = 0;
    window.EJS_emulator = { gameManager: { screenshot: function () { window.__shot++; const a = new Uint8Array(window.__png); a[a.length - 2] = window.__shot & 0xFF; return Promise.resolve(a); }, simulateInput: function () {}, getFrameNum: function () { return 1; }, getState: function () { return new Uint8Array(8); }, saveSaveFiles: function () {} } };
    const input = document.getElementById('rom');
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test.gbc', { type: 'application/octet-stream' });
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(1200);
  await page.evaluate(() => { const b = document.getElementById('startAI'); if (b) b.click(); });
  await sleep(14000);

  const withImg = calls.filter(c => c.hasImage).length;
  const without = calls.filter(c => !c.hasImage).length;
  check('some calls carry the picture', withImg > 0, 'with=' + withImg);
  check('not every call carries the picture', without > 0,
        'with=' + withImg + ' without=' + without);

  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILURE(S)' : '\nall split checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
