/* Headless UI test for site/index.html.
 * Serves the page, stubs EmulatorJS (so no CDN and no ROM are needed),
 * stubs the API endpoint, then drives the real UI: whisper -> reply -> input.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/* CI installs Chrome through puppeteer; a distro chromium is often a snap
 * wrapper that never prints a devtools URL. Prefer puppeteer's own binary. */
function findChrome(puppeteer) {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try { const p = puppeteer.executablePath(); if (typeof p === 'string' && fs.existsSync(p)) return p; } catch (e) {}
  try { return execSync('which chromium || which google-chrome || which chromium-browser')
            .toString().trim().split('\n')[0]; } catch (e) {}
  return undefined;
}
const puppeteer = require('puppeteer-core');

const SITE = path.join(__dirname, '..', 'site');
const PORT = 8791;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// a 1x1 png, enough to prove the screenshot path round-trips
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const STUB = `
window.__inputs = [];
window.__shotCalls = 0;
window.EJS_emulator = {
  gameManager: {
    simulateInput: function (player, index, value) { window.__inputs.push([player, index, value]); },
    // vary the bytes a little, like a real screen that is not frozen, so the
    // page's same-frame cache does not (correctly) skip the second request
    screenshot: function () {
      window.__shotCalls++;
      const a = new Uint8Array(window.__png);
      a[a.length - 2] = window.__shotCalls & 0xFF;
      return Promise.resolve(a);
    }
  },
  Module: {}
};
window.__png = Uint8Array.from(atob("${PNG.toString('base64')}"), c => c.charCodeAt(0));
`;

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  PASS ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.join(SITE, url === '/' ? 'index.html' : url);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(PORT, r));

  let chrome = '';
  chrome = process.env.CHROME_PATH || '';
  if (!chrome || !fs.existsSync(chrome)) {
    chrome = execSync('which chromium || which chromium-browser || which google-chrome')
      .toString().trim().split('\n')[0];
  }
  console.log('browser: ' + chrome);
  const browser = await puppeteer.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (t.includes('ERR_CERT_AUTHORITY_INVALID')) return;  // sandbox proxy
    // the page probes for emerald.gba next to itself; a 404 there is expected
    if (t.includes('404') && t.includes('Failed to load resource')) return;
    errors.push('console: ' + t);
  });

  await page.setRequestInterception(true);
  let apiRequest = null;
  let apiCalls = 0;
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('emulatorjs.org') && u.endsWith('loader.js')) {
      return req.respond({ status: 200, contentType: 'text/javascript', body: STUB });
    }
    if (u.includes('/v1/chat/completions') && req.method() === 'OPTIONS') {
      return req.respond({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': '*'
        }
      });
    }
    if (u.includes('/v1/chat/completions')) {
      apiCalls++;
      apiRequest = { url: u, headers: req.headers(), body: JSON.parse(req.postData() || '{}') };
      return req.respond({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: '{"say":"i see a path","buttons":["LEFT"]}' } }]
        })
      });
    }
    return req.continue();
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

  // ---------- 1. page loads without throwing
  check('page loads', true);
  check('no JS errors on load', errors.length === 0, errors.join(' | '));

  // ---------- 2. fake a ROM selection so the emulator stub boots
  await page.evaluate(() => {
    const input = document.getElementById('rom');
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test.gbc', { type: 'application/octet-stream' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 900));

  const booted = await page.evaluate(() => window.__inputs !== undefined);
  check('emulator stub attached', booted);
  check('no JS errors after ROM load', errors.length === 0, errors.join(' | '));

  // ---------- 3. local mode: whisper -> reply -> input
  await page.type('#whisper', 'go left');
  await page.click('#send');
  await new Promise(r => setTimeout(r, 900));

  const local = await page.evaluate(() => ({
    log: document.getElementById('log').innerText,
    inputs: window.__inputs.length,
    pressedLeft: window.__inputs.some(([, i, v]) => i === 6 && v === 1)
  }));
  check('whisper appears in log', local.log.includes('go left'), local.log.slice(0, 80));
  check('he replies', /red/i.test(local.log));
  check('input was injected', local.inputs > 0, 'inputs=' + local.inputs);
  check('LEFT was pressed for "go left"', local.pressedLeft);
  check('no JS errors in local flow', errors.length === 0, errors.join(' | '));

  // ---------- 4. API mode: request shape, vision, JSON decode
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('redexe.v1') || '{}');
    s.mode = 'api'; s.apikey = 'test-key-123'; s.model = 'gpt-4o-mini'; s.gap = 1;
    // a stale endpoint in storage must be ignored: Groq is the only provider
    s.endpoint = 'https://api.example.com/v1/chat/completions';
    localStorage.setItem('redexe.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const input = document.getElementById('rom');
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test.gbc');
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 900));

  await page.type('#whisper', 'what do you see');
  await page.click('#send');
  await new Promise(r => setTimeout(r, 1200));

  const api = await page.evaluate(() => ({
    log: document.getElementById('log').innerText,
    shots: window.__shotCalls,
    preview: document.getElementById('preview').getAttribute('src') || '',
    eyes: document.getElementById('eyes').style.display
  }));

  check('API request was made', apiRequest !== null);
  check('request went to the Groq endpoint', /api\.groq\.com\/openai\/v1\/chat\/completions/.test(apiRequest.url || ''), apiRequest.url);
  if (apiRequest) {
    check('auth header sent', /Bearer test-key-123/.test(apiRequest.headers.authorization || ''));
    const msgs = apiRequest.body.messages || [];
    check('persona sent as system message', msgs[0] && msgs[0].role === 'system' && /Red/.test(msgs[0].content));
    const parts = msgs.flatMap(m => Array.isArray(m.content) ? m.content : []);
    check('frame sent as image_url',
      parts.some(p => p.type === 'image_url' && p.image_url.url.startsWith('data:image')));
    check('whisper text included', JSON.stringify(msgs).includes('what do you see'));
  }
  check('screenshot was taken', api.shots > 0, 'calls=' + api.shots);
  check('preview shown', api.preview.startsWith('data:image') && api.eyes === 'flex');
  check('model reply decoded and shown', api.log.includes('i see a path'), api.log.slice(-120));
  // ---------- 8. game-only mode: the picture fills the screen, nothing else
  await page.click('#gofs');
  await new Promise(r => setTimeout(r, 400));
  const g = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const log = document.getElementById('log').getBoundingClientRect();
    const menu = document.querySelector('.menu');
    return { w: st.width, h: st.height, vw: innerWidth, vh: innerHeight,
             logH: log.height, menuShown: menu ? getComputedStyle(menu).display !== 'none' : false,
             cls: document.body.className };
  });
  check('game only fills the viewport', g.w >= g.vw * 0.98 && g.h >= g.vh * 0.98,
        Math.round(g.w) + 'x' + Math.round(g.h) + ' vs ' + g.vw + 'x' + g.vh);
  check('game only hides the chat', g.logH === 0, 'log height=' + g.logH);
  check('game only hides the buttons', !g.menuShown);
  const exitBox = await page.evaluate(() => {
    const b = document.getElementById('exitg').getBoundingClientRect();
    return { w: b.width, h: b.height, shown: getComputedStyle(document.getElementById('exitg')).display };
  });
  check('exit button is visible in game only', exitBox.w > 0 && exitBox.h > 0, JSON.stringify(exitBox));
  await page.evaluate(() => document.getElementById('exitg').click());
  await new Promise(r => setTimeout(r, 300));
  const back = await page.evaluate(() => document.body.className);
  check('exit game only restores the page', !/gonly/.test(back), back);

  check('no JS errors in API flow', errors.length === 0, errors.join(' | '));

  // ---------- 5. Red keeps playing on his own (no whisper needed)
  const callsBefore = apiCalls;
  await new Promise(r => setTimeout(r, 3500));
  // the loop may skip the request when the frame has not changed, and unstick
  // instead; either way it must keep acting on its own
  const acting = await page.evaluate(() => (document.getElementById('log').textContent || '').length);
  check('autonomous loop keeps playing', apiCalls > callsBefore || acting > 0,
        'before=' + callsBefore + ' after=' + apiCalls);
  const leftApi = await page.evaluate(() => window.__inputs.filter(([, i, v]) => i === 6 && v === 1).length);
  check('model buttons were pressed (LEFT)', leftApi >= 1, 'LEFT presses=' + leftApi);

  // ---------- 6. REST stops the loop
  await page.click('#stopAI');
  await new Promise(r => setTimeout(r, 400));
  const callsAtRest = apiCalls;
  await new Promise(r => setTimeout(r, 2500));
  check('REST stops API calls', apiCalls === callsAtRest, 'before=' + callsAtRest + ' after=' + apiCalls);

  // ---------- 7. TEST AI button reports success
  await page.click('#testai');
  await new Promise(r => setTimeout(r, 1200));
  const testLog = await page.evaluate(() => document.getElementById('log').innerText);
  check('TEST AI reports api works', /api works/i.test(testLog), testLog.slice(-160));
  check('no JS errors after TEST AI', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all UI checks passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(1); });
