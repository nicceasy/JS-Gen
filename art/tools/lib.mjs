// tools/lib.mjs — the plumbing every tool in art/ shares.
//
// Three jobs: find a Chromium, open a piece with the network hard-blocked, and
// parse argv. Nothing here knows which piece it is driving — see the contract in
// HANDOFF.md §5. A piece is anything that sets window.artReady and exposes
// window.artPiece.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const ART = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ─────────────────────────────────────────────────────────────── finding chrome

function candidates() {
  const list = [];
  if (process.env.CHROME_PATH) list.push(process.env.CHROME_PATH);

  // a playwright browser pool, wherever it was told to live
  const pool = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (pool && fs.existsSync(pool)) {
    for (const dir of fs.readdirSync(pool)) {
      if (!/^chromium/.test(dir)) continue;
      list.push(
        path.join(pool, dir, 'chrome-linux', 'chrome'),
        path.join(pool, dir, 'chrome-linux', 'headless_shell'),
        path.join(pool, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
      );
    }
    list.push(path.join(pool, 'chromium'), path.join(pool, 'chrome'));
  }

  list.push(
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable', '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  );
  return list;
}

export function findChrome() {
  for (const c of candidates()) {
    try {
      const st = fs.statSync(c);
      if (st.isFile() && (st.mode & 0o111)) return c;
    } catch (e) { /* next */ }
  }
  return null;
}

// Every tool calls this instead of throwing a stack trace at someone who simply
// does not have a browser installed.
export function needChrome() {
  const exe = findChrome();
  if (exe) return exe;
  console.error(
    '\n  no Chromium found.\n\n' +
    '  This tool renders the piece in a headless browser. The piece itself has\n' +
    '  no dependencies — you can still run:  node verify.mjs --scan-only\n\n' +
    '  To fix:  CHROME_PATH=/path/to/chrome npm run <tool>\n' +
    '  or:      npx playwright install chromium\n'
  );
  process.exit(2);
}

export async function playwright() {
  try {
    return (await import('playwright')).chromium;
  } catch (e) {
    console.error(
      '\n  playwright is not installed.\n\n' +
      '  cd art && npm install       (browsers are NOT downloaded — we use yours)\n' +
      '  Or run the dependency-free check:  node verify.mjs --scan-only\n'
    );
    process.exit(2);
  }
}

// ───────────────────────────────────────────────────────────────────────── args

// --key value | --key=value | --flag   →   { key: value, flag: true, _: [rest] }
export function args(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { o[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[a.slice(2)] = true;
    else { o[a.slice(2)] = next; i++; }
  }
  return o;
}

export function nums(v, fallback = []) {
  if (v === undefined || v === true) return fallback;
  return String(v).split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
}

export function pieces(dir = ART) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
}

export function renders() {
  const d = path.join(ART, '.renders');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ──────────────────────────────────────────────────────────────── opening a piece
//
// The network is blocked two ways on purpose: the context is set offline, and
// every route that is not the file itself is aborted and recorded. A piece that
// needs the network fails loudly here rather than quietly working on the machine
// that happens to have a cache.

export async function openPiece(file, opts = {}) {
  const {
    width = 1280, height = 800, seed = null, frame = null,
    still = true, det = true, wait = 15000, quiet = false
  } = opts;

  const chromium = await playwright();
  const executablePath = needChrome();

  const browser = await chromium.launch({
    executablePath,
    args: ['--hide-scrollbars', '--mute-audio', '--disable-lcd-text']
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  });

  const offFile = [];
  const target = pathToFileURL(path.resolve(ART, file)).href;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    offFile.push(url);
    return route.abort();
  });

  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', m => consoleLines.push(m.type() + ': ' + m.text()));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));

  const q = [];
  if (seed !== null && seed !== undefined) q.push('s=' + (seed | 0));
  if (frame !== null && frame !== undefined) q.push('f=' + (frame | 0));
  if (still) q.push('still=1');
  if (det) q.push('det=1');

  await page.goto(target + (q.length ? '?' + q.join('&') : ''), { waitUntil: 'load' });
  await page.waitForFunction('window.artReady === true', null, { timeout: wait });
  // the context is offline as well as routed, so a piece cannot reach out at all
  await context.setOffline(true);

  return {
    page, browser, context, offFile, errors, consoleLines,
    // render exactly frame n, deterministically
    async frame(n) { return page.evaluate(n => window.artPiece.frame(n), n); },
    async seed(s) { return page.evaluate(s => window.artPiece.seed(s), s); },
    async purity() { return page.evaluate(() => window.artPiece.purity()); },
    async info() { return page.evaluate(() => window.artPiece.info()); },
    async shot(file) { return page.locator('canvas').screenshot({ path: file }); },
    async close() { await browser.close(); }
  };
}

export function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }
export function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
