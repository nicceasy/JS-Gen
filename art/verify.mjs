#!/usr/bin/env node
//
// Verifies the claim every piece in this folder makes: it is a canvas and a
// script, and nothing else. Two passes.
//
//   1. A static scan of the file. No dependencies — runs anywhere node runs.
//   2. If playwright-core is installed, boot the page in headless Chromium with
//      the network hard-blocked, ask the piece to audit itself, and render
//      frames to PNG. A file that needs the network cannot load here at all.
//
//   node art/verify.mjs                          scan + (if available) render
//   node art/verify.mjs --scan-only              scan only
//   node art/verify.mjs --frames 0,900,2600      choose which frames to render
//   node art/verify.mjs --seed 42 --out /tmp/x   seed and output directory
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SCAN_ONLY = argv.includes('--scan-only');
const SEED = arg('seed', '7');
const OUT = arg('out', path.join(HERE, '.renders'));
const FRAMES = arg('frames', '200,1300,2600,4400,5300').split(',').map(Number);

// Assembled from fragments so the scanner never matches its own source.
const NEEDLES = [
  'da' + 'ta:', 'ba' + 'se64', '<i' + 'mg', '<vi' + 'deo', '<au' + 'dio', '<sv' + 'g',
  '<li' + 'nk', '<ifr' + 'ame', '<emb' + 'ed', '<obj' + 'ect', 'ht' + 'tp://', 'ht' + 'tps://',
  '@font-' + 'face', '.p' + 'ng', '.j' + 'pg', '.jpe' + 'g', '.gi' + 'f', '.we' + 'bp',
  '.m' + 'p3', '.w' + 'av', '.o' + 'gg', '.m' + 'p4', '.wo' + 'ff', '.tt' + 'f'
];

const pieces = fs.readdirSync(HERE).filter(f => f.endsWith('.html')).sort();
if (!pieces.length) { console.error('no .html pieces in ' + HERE); process.exit(1); }

let failed = false;
console.log('static scan');
for (const f of pieces) {
  const src = fs.readFileSync(path.join(HERE, f), 'utf8');
  const low = src.toLowerCase();
  const hits = NEEDLES.filter(n => low.includes(n));
  const kb = (src.length / 1024).toFixed(1);
  if (hits.length) {
    failed = true;
    console.log('  FAIL ' + f + '  (' + kb + ' KB)  found: ' + hits.join(' '));
  } else {
    console.log('  ok   ' + f + '  (' + kb + ' KB)  no embedded media, no external references');
  }
}
if (SCAN_ONLY) process.exit(failed ? 1 : 0);

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch {
  console.log('\nrender pass skipped: playwright-core is not installed');
  console.log('  npm i -D playwright-core   (Chromium must already be on the machine)');
  process.exit(failed ? 1 : 0);
}

const EXEC = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
     .find(p => { try { fs.accessSync(p); return true; } catch { return false; } });
if (!EXEC) {
  console.log('\nrender pass skipped: no Chromium found. Set CHROME_PATH.');
  process.exit(failed ? 1 : 0);
}

fs.mkdirSync(OUT, { recursive: true });
console.log('\nheadless render, network blocked  ->  ' + OUT);
const browser = await chromium.launch({ executablePath: EXEC });

for (const f of pieces) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let offNetwork = 0;
  await page.route('**/*', r => {
    if (r.request().url().startsWith('file://')) return r.continue();
    offNetwork++;
    return r.abort();
  });

  const url = 'file://' + path.join(HERE, f) + '?s=' + SEED + '&det=1&still=1';
  await page.goto(url);
  await page.waitForFunction(() => window.artReady === true, { timeout: 20000 });

  const self = await page.evaluate(() => window.artPiece.purity());
  const base = f.replace(/\.html$/, '');
  const shots = {};
  for (const n of FRAMES) {
    await page.evaluate(k => window.artPiece.frame(k), n);
    const png = await page.screenshot({ path: path.join(OUT, base + '-s' + SEED + '-f' + n + '.png') });
    shots[n] = png;
  }

  // Determinism, checked rather than asserted: render the same frames again in
  // the opposite order and compare bytes. A piece you can drag can drift here
  // without anyone noticing — frame() has to reset every bit of interaction
  // state, and this is what proves it did.
  let drift = '';
  for (const n of [...FRAMES].reverse()) {
    await page.evaluate(k => window.artPiece.frame(k), n);
    const again = await page.screenshot();
    if (!again.equals(shots[n])) { drift = 'frame ' + n + ' differs on re-render'; break; }
  }

  const ok = self.clean && !errs.length && offNetwork === 0 && !drift;
  if (!ok) failed = true;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + f +
    '  self-audit ' + (self.clean ? 'clean' : JSON.stringify(self.found)) +
    ', ' + self.canvases + ' canvas, ' + self.elements + ' body children' +
    ', off-file requests ' + offNetwork +
    ', ' + FRAMES.length + ' frames rendered' +
    ', determinism ' + (drift || 'ok') +
    (errs.length ? ', ERRORS: ' + errs.join(' | ') : ''));
  await page.close();
}

await browser.close();
console.log(failed ? '\nFAILED' : '\nall pieces verified');
process.exit(failed ? 1 : 0);
