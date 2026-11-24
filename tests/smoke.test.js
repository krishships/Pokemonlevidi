/* Smoke: load the page, press every button, report any runtime error. */
const http = require('http'), fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) { puppeteer = require('/usr/lib/node_modules/puppeteer-core'); }

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try { const p = puppeteer.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) {}
  try { return execSync('which chromium || which google-chrome').toString().trim().split('\n')[0]; } catch (e) {}
  return undefined;
}

const SITE = path.join(__dirname, '..', 'site');
const server = http.createServer((q, r) => {
  const f = path.join(SITE, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
    r.end(d);
  });
});

const errs = [];
(async () => {
  await new Promise(r => server.listen(8988, r));
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/404|Failed to load resource|ERR_CERT/i.test(t)) return;   // the ROM probe
    errs.push('console: ' + t);
  });

  await page.goto('http://localhost:8988/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  const press = async (id) => {
    const ok = await page.evaluate((i) => {
      const b = document.getElementById(i);
      if (!b) return 'missing';
      b.click();
      return 'ok';
    }, id);
    await new Promise(r => setTimeout(r, 350));
    return ok;
  };

  // RESET and FORGET KEY reload the page, so they go last
  for (const id of ['apibtn', 'presetGroq', 'listmodels', 'save', 'look', 'testai',
                    'fs', 'gofs', 'exitg', 'savebtn', 'resetPersona', 'startAI', 'stopAI']) {
    const r = await press(id);
    if (r === 'missing') errs.push('missing element: #' + id);
  }

  await page.evaluate(() => { const a = document.getElementById('apikey'); if (a) a.value = 'gsk_fake'; });
  await page.type('#apikey', 'x');
  await page.evaluate(() => {
    document.getElementById('whisper').value = 'go north';
    document.getElementById('send').click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const state = await page.evaluate(() => ({
    ep: (document.getElementById('endpoint') || {}).value,
    model: (document.getElementById('model') || {}).value,
    hint: (document.getElementById('keyhint') || {}).textContent,
    log: (document.getElementById('log') || {}).innerText || ''
  }));
  console.log('endpoint :', state.ep);
  console.log('model    :', state.model);
  console.log('key hint :', JSON.stringify(state.hint));
  console.log('log tail :', state.log.split('\n').filter(Boolean).slice(-4).join(' | '));

  // the destructive ones, at the end
  for (const id of ['clear', 'reset', 'reset']) {
    await page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); }, id);
    await new Promise(r => setTimeout(r, 700));
  }
  await new Promise(r => setTimeout(r, 1500));
  const alive = await page.evaluate(() => !!document.getElementById('apikey'));
  if (!alive) errs.push('page did not come back after RESET');

  await browser.close(); server.close();
  if (errs.length) { console.log('\nERRORS:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('\nno runtime errors');
})().catch(e => { console.error('harness error:', e.message); process.exit(1); });
