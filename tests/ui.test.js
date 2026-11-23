/* Headless UI test for site/index.html.
 * Serves the page, stubs EmulatorJS (so no CDN and no ROM are needed),
 * stubs the API endpoint, then drives the real UI: whisper -> reply -> input.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
    screenshot: function () { window.__shotCalls++; return Promise.resolve(window.__png); }
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
  try { chrome = puppeteer.executablePath(); } catch (e) {}
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
    errors.push('console: ' + t);
  });

  await page.setRequestInterception(true);
  let apiRequest = null;
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
      apiRequest = { headers: req.headers(), body: JSON.parse(req.postData() || '{}') };
      return req.respond({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: '{"say":"i see a path","act":"left"}' } }]
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
  await new Promise(r => setTimeout(r, 500));

  const local = await page.evaluate(() => ({
    log: document.getElementById('log').innerText,
    inputs: window.__inputs.length,
    pressedLeft: window.__inputs.some(([, i, v]) => i === 6 && v === 1)
  }));
  check('whisper appears in log', local.log.includes('go left'), local.log.slice(0, 80));
  check('he replies', /kaito/i.test(local.log));
  check('input was injected', local.inputs > 0, 'inputs=' + local.inputs);
  check('LEFT was pressed for "go left"', local.pressedLeft);
  check('no JS errors in local flow', errors.length === 0, errors.join(' | '));

  // ---------- 4. API mode: request shape, vision, JSON decode
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('emerald.whisper.v1') || '{}');
    s.mode = 'api'; s.apikey = 'test-key-123'; s.model = 'gpt-4o-mini';
    s.endpoint = 'https://api.example.com/v1/chat/completions';
    localStorage.setItem('emerald.whisper.v1', JSON.stringify(s));
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
  if (apiRequest) {
    check('auth header sent', /Bearer test-key-123/.test(apiRequest.headers.authorization || ''));
    const msgs = apiRequest.body.messages || [];
    check('persona sent as system message', msgs[0] && msgs[0].role === 'system' && /Kaito/.test(msgs[0].content));
    const parts = msgs.flatMap(m => Array.isArray(m.content) ? m.content : []);
    check('frame sent as image_url',
      parts.some(p => p.type === 'image_url' && p.image_url.url.startsWith('data:image')));
    check('whisper text included', JSON.stringify(msgs).includes('what do you see'));
  }
  check('screenshot was taken', api.shots > 0, 'calls=' + api.shots);
  check('preview shown', api.preview.startsWith('data:image') && api.eyes === 'flex');
  check('model reply decoded and shown', api.log.includes('i see a path'), api.log.slice(-120));
  check('no JS errors in API flow', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all UI checks passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(1); });
