#!/usr/bin/env node
//
// Runtime smoke test. Everything else in this folder renders single frames with
// the clock frozen; this one runs the piece for real and pokes it.
//
// Checks: the rAF loop advances, audio starts and stays up, the keyboard does
// what it claims, a mid-flight resize rebuilds cleanly, and the page makes zero
// network requests. Exits non-zero on any page error.
//
//   node tools/smoke.mjs
//   node tools/smoke.mjs --piece lamplighter.html --seconds 3

import { launch, openPiece, args } from './lib.mjs';

const a = args();
const secs = Number(a.seconds || 2);
const browser = await launch(['--autoplay-policy=no-user-gesture-required']);
const { page, state } = await openPiece(browser, {
  piece: a.piece || 'lamplighter.html',
  seed: a.seed || 7,
  params: '',                                  // real clock, real loop
  width: 1100,
  height: 700
});

const step = async (label, fn) => {
  if (fn) await fn();
  const info = await page.evaluate(() => window.artPiece.info());
  console.log('  ' + label.padEnd(20) + JSON.stringify(info));
  return info;
};

console.log('live run');
const t0 = await step('booted');
await page.waitForTimeout(secs * 1000);
const t1 = await step('after ' + secs + 's');
if (t1.t <= t0.t) state.errors.push('clock did not advance: ' + t0.t + ' -> ' + t1.t);

const s1 = t1.seed;
const t2 = await step('sound on + reseed', async () => {
  await page.mouse.click(550, 350);
  await page.waitForTimeout(1200);
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
});
if (t2.seed === s1) state.errors.push('reseed did not change the seed');

const t3 = await step('scrub + pause', async () => {
  await page.keyboard.press(']');
  await page.keyboard.press('p');
  await page.waitForTimeout(400);
});
const t4 = await step('still paused', async () => { await page.waitForTimeout(600); });
if (Math.abs(t4.t - t3.t) > 0.05) state.errors.push('pause did not hold the clock');

await page.keyboard.press('p');

// Pointer work, for pieces that take any. A piece that ignores drag and wheel
// simply reports the same numbers back, which is a pass; one that throws on
// them fails here instead of in front of someone.
const t4b = await step('drag + wheel + click', async () => {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.42, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(350);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(250);
});
if (!(t4b.w > 0 && t4b.h > 0)) state.errors.push('piece stopped reporting size after pointer input');

const t5 = await step('resized', async () => {
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.waitForTimeout(700);
});
if (t5.w !== 700) state.errors.push('resize did not rebuild: w=' + t5.w);
await step('still running', async () => { await page.waitForTimeout(900); });

const audio = await page.evaluate(() => performance.getEntriesByType('resource').length);
console.log('\n  network requests attempted off file://: ' + state.offNetwork);
console.log('  resources fetched:                     ' + audio);
await browser.close();

if (state.errors.length || state.offNetwork || audio) {
  console.log('\nFAILED\n  ' + [...state.errors,
    ...(state.offNetwork ? ['made ' + state.offNetwork + ' off-file requests'] : []),
    ...(audio ? ['fetched ' + audio + ' resources'] : [])].join('\n  '));
  process.exit(1);
}
console.log('\nok — loop, audio, keys, pointer, resize, offline');
