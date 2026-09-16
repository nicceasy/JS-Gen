// Shared plumbing for the tools in this folder.
//
// Every piece in art/ implements the same contract, so nothing here needs to
// know which piece it is driving:
//
//   window.artReady === true          once the first frame has been drawn
//   window.artPiece.frame(n)          render frame n exactly, then stop
//   window.artPiece.seed(s)           rebuild the world on seed s
//   window.artPiece.purity()          {bytes, clean, found[], canvases, elements}
//   window.artPiece.info()            {seed, w, h, loop, quality, t}
//
// Pieces are driven with ?det=1&still=1 so a frame number always produces the
// same pixels — that is what makes a look-and-revise loop possible at all.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ART = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];

export function findChrome() {
  const globbed = [];
  try {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.readdirSync(root)) {
      if (d.startsWith('chromium-')) globbed.push(path.join(root, d, 'chrome-linux', 'chrome'));
    }
  } catch { /* no browser pool here; fall through to the fixed list */ }
  for (const p of [...CHROME_CANDIDATES, ...globbed]) {
    if (!p) continue;
    try { fs.accessSync(p); return p; } catch { /* keep looking */ }
  }
  return null;
}

export async function launch(extraArgs = []) {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch {
    die('playwright-core is not installed.\n  cd art && npm install');
  }
  const executablePath = findChrome();
  if (!executablePath) {
    die('no Chromium found. Install one and set CHROME_PATH=/path/to/chrome');
  }
  return chromium.launch({ executablePath, args: ['--force-color-profile=srgb', ...extraArgs] });
}

// Opens a piece with the network hard-blocked. Returns the page plus live
// counters, so any tool can assert "this drew without touching the network".
export async function openPiece(browser, opts = {}) {
  const {
    piece = 'lamplighter.html',
    seed = 7,
    params = 'det=1&still=1',
    width = 1280,
    height = 800,
    deviceScaleFactor = 1,
    offline = true,
    initScript = null
  } = opts;

  const file = path.isAbsolute(piece) ? piece : path.join(ART, piece);
  if (!fs.existsSync(file)) die('no such piece: ' + file);

  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
  const state = { errors: [], offNetwork: 0, file };
  page.on('pageerror', e => state.errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') state.errors.push(m.type() + ': ' + m.text());
  });
  if (initScript) await page.addInitScript(initScript);
  if (offline) {
    await page.route('**/*', r => {
      if (r.request().url().startsWith('file://')) return r.continue();
      state.offNetwork++;
      return r.abort();
    });
  }

  const q = ['s=' + seed, params].filter(Boolean).join('&');
  await page.goto('file://' + file + (q ? '?' + q : ''));
  await page.waitForFunction(() => window.artReady === true, { timeout: 20000 });
  return { page, state };
}

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[k] = true;
    else { out[k] = next; i++; }
  }
  return out;
}

export const nums = (s, dflt) =>
  (s === undefined || s === true ? dflt : String(s)).split(',').map(Number).filter(n => !Number.isNaN(n));

export function die(msg) {
  console.error('\n  ' + msg + '\n');
  process.exit(1);
}
