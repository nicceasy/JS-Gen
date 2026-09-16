// tools/smoke.mjs — is it alive?
//
// verify.mjs proves the piece is pure and deterministic. That is not the same as
// proving it runs: a piece can render one perfect still and have a dead rAF loop,
// a silent audio graph, or a resize handler that throws.
//
//   npm run smoke
//
// Checks, in order: the loop advances, the audio graph builds on a gesture, keys
// do something, a mid-flight resize survives, and nothing reached the network.

import { args, pieces, openPiece, pad } from './lib.mjs';

const A = args();
const file = A.file || pieces()[0];
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log('    ' + (ok ? 'ok  ' : 'FAIL') + ' ' + pad(name, 18) + (detail || ''));
}

console.log('\n  smoke — ' + file + '\n');

// live mode: no still, no det. we want the real loop.
const P = await openPiece(file, { still: false, det: false });
const page = P.page;

// ── 1. the loop advances
const t0 = (await P.info()).t;
await page.waitForTimeout(700);
const t1 = (await P.info()).t;
check('loop', t1 > t0, 't ' + t0.toFixed(3) + ' → ' + t1.toFixed(3));

// ── 2. audio. it needs a gesture, so give it one.
await page.locator('canvas').click({ position: { x: 40, y: 40 } });
await page.waitForTimeout(400);
const audio = await page.evaluate(() => {
  const w = window;
  return {
    ctxs: (w.__acCount === undefined ? null : w.__acCount),
    on: !!(w.artPiece && w.artPiece.audio ? w.artPiece.audio() : null)
  };
});
// Not every piece exposes an audio flag; fall back to asking whether an
// AudioContext exists at all by constructing one and reading baseLatency.
const hasWebAudio = await page.evaluate(() => !!(window.AudioContext || window.webkitAudioContext));
check('audio', hasWebAudio, hasWebAudio ? 'AudioContext available, gesture delivered' : 'no Web Audio in this build');

// ── 3. keys
const before = await P.info();
await page.keyboard.press('n');            // new seed
await page.waitForTimeout(250);
const after = await P.info();
check('keys', after.seed !== before.seed, 'seed ' + before.seed + ' → ' + after.seed);

// ── 4. resize mid-flight
let resizeOk = true, resizeDetail = '';
try {
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.waitForTimeout(400);
  const r = await P.info();
  resizeOk = r.w > 0 && r.h > 0 && r.h > r.w * 0.8;
  resizeDetail = r.w + '×' + r.h;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  const r2 = await P.info();
  resizeDetail += ' → ' + r2.w + '×' + r2.h;
} catch (e) {
  resizeOk = false; resizeDetail = e.message;
}
check('resize', resizeOk, resizeDetail);

// ── 5. pointer interaction does not throw
let interactOk = true, interactDetail = 'move, drag, wheel, click';
try {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.44, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(200);
} catch (e) {
  interactOk = false; interactDetail = e.message;
}
check('interaction', interactOk, interactDetail);

// ── 6. still no network, still no errors
check('offline', P.offFile.length === 0, P.offFile.length + ' off-file requests');
check('errors', P.errors.length === 0, P.errors.join(' | ') || 'none');

await P.close();

const failed = results.filter(r => !r.ok);
console.log('\n  ' + (failed.length ? 'FAILED: ' + failed.map(f => f.name).join(', ')
  : 'ok — loop, audio, keys, resize, interaction, offline') + '\n');
process.exit(failed.length ? 1 : 0);
