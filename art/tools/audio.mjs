#!/usr/bin/env node
//
// Audio graph probe. A synthesised soundtrack fails silently: no error, no
// sound, and a screenshot cannot tell you. This wraps AudioContext before the
// page loads and counts what actually gets built and started.
//
// Two things to know, both learned the hard way:
//   1. createGain, createOscillator and friends live on BaseAudioContext, not
//      on AudioContext. Instrumenting AudioContext.prototype alone sees almost
//      nothing and looks like a dead engine. Walk the prototype chain.
//   2. Note density is driven by how dark it is, so probing at dusk can
//      legitimately produce zero bells. Probe at night: --at 2400.
//
//   node tools/audio.mjs
//   node tools/audio.mjs --at 2400 --seconds 19    # long enough for a foghorn

import { launch, openPiece, args } from './lib.mjs';

const a = args();
const at = Number(a.at || 2400);
const secs = Number(a.seconds || 19);

const browser = await launch(['--autoplay-policy=no-user-gesture-required']);
const { page, state } = await openPiece(browser, {
  piece: a.piece || 'lamplighter.html',
  seed: a.seed || 11,
  params: 'f=' + at,
  width: 900,
  height: 600,
  initScript: () => {
    window.__tally = { ctx: 0, nodes: {}, started: 0 };
    const AC = window.AudioContext;
    window.AudioContext = function () {
      const c = new AC();
      window.__tally.ctx++;
      window.__ac = c;
      const keys = new Set();
      for (let o = Object.getPrototypeOf(c); o; o = Object.getPrototypeOf(o)) {
        Object.getOwnPropertyNames(o).forEach(n => keys.add(n));
      }
      for (const k of keys) {
        if (!k.startsWith('create')) continue;
        const orig = c[k];
        if (typeof orig !== 'function') continue;
        c[k] = function (...z) {
          window.__tally.nodes[k] = (window.__tally.nodes[k] || 0) + 1;
          const n = orig.apply(c, z);
          if (n && typeof n.start === 'function') {
            const s = n.start.bind(n);
            n.start = (...y) => { window.__tally.started++; return s(...y); };
          }
          return n;
        };
      }
      return c;
    };
  }
});

await page.mouse.click(450, 300);
await page.waitForTimeout(1200);
const early = await page.evaluate(() => JSON.parse(JSON.stringify(window.__tally)));
await page.waitForTimeout(Math.max(0, secs - 1.2) * 1000);
const late = await page.evaluate(() => ({
  tally: JSON.parse(JSON.stringify(window.__tally)),
  state: window.__ac ? window.__ac.state : 'none',
  clock: window.__ac ? +window.__ac.currentTime.toFixed(2) : -1
}));
await browser.close();

const delta = {};
for (const k of new Set([...Object.keys(early.nodes), ...Object.keys(late.tally.nodes)])) {
  const d = (late.tally.nodes[k] || 0) - (early.nodes[k] || 0);
  if (d) delta[k] = d;
}
console.log('context           ' + late.state + ', clock ' + late.clock + 's');
console.log('built at boot     ' + JSON.stringify(early.nodes));
console.log('sources started   ' + early.started + ' at boot -> ' + late.tally.started + ' after ' + secs + 's');
console.log('scheduled since   ' + (Object.keys(delta).length ? JSON.stringify(delta) : 'NOTHING'));
console.log(state.errors.length ? 'errors:\n  ' + state.errors.join('\n  ') : 'no page errors');

const droneUp = early.started >= 6;
const scheduling = late.tally.started > early.started;
if (!droneUp) console.log('\nFAIL: the standing layer (drone, surf, wind) did not start');
if (!scheduling) console.log('\nFAIL: nothing was scheduled after boot — check the lookahead scheduler');
process.exit(droneUp && scheduling && !state.errors.length ? 0 : 1);
