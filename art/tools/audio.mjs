// tools/audio.mjs — is the synth actually built, and is it scheduling?
//
//   npm run audio -- --at 2400 --seconds 19
//
// Two lessons are baked in here, both from HANDOFF.md §8.6.
//
// 1. createGain, createOscillator and nearly everything else live on
//    BaseAudioContext, not AudioContext. Instrumenting AudioContext.prototype
//    tallies one method and makes a healthy engine look dead. Walk the chain.
//
// 2. Note density in these pieces is driven by the state of the scene. Probing
//    at the wrong point in the cycle and seeing zero events is not a bug — it is
//    the piece working. Probe where the events are, and say where you probed.

import { args, pieces, openPiece, pad } from './lib.mjs';

const A = args();
const file = A.file || pieces()[0];
const at = A.at !== undefined ? parseInt(A.at, 10) : 2400;
const seconds = A.seconds !== undefined ? parseFloat(A.seconds) : 12;

console.log('\n  audio — ' + file + '   probing at frame ' + at +
  ' (t=' + (at / 60).toFixed(1) + 's)   for ' + seconds + 's\n');

const P = await openPiece(file, { still: false, det: false, frame: at });

// Install the probe BEFORE any gesture, walking the prototype chain so we catch
// the methods that live on BaseAudioContext.
await P.page.evaluate(() => {
  const w = window;
  w.__tally = {};
  w.__sched = [];
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) return;

  const seen = new Set();
  let proto = AC.prototype;
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (!/^create/.test(name) || seen.has(name)) continue;
      seen.add(name);
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || typeof d.value !== 'function') continue;
      const orig = d.value;
      Object.defineProperty(proto, name, {
        configurable: true, writable: true,
        value: function (...a) {
          w.__tally[name] = (w.__tally[name] || 0) + 1;
          const node = orig.apply(this, a);
          // catch scheduled starts — that is what "is it playing" really means
          if (node && typeof node.start === 'function') {
            const s = node.start.bind(node);
            node.start = function (when, ...rest) {
              w.__sched.push({ type: name.replace('create', ''), when: when || 0 });
              return s(when, ...rest);
            };
          }
          return node;
        }
      });
    }
    proto = Object.getPrototypeOf(proto);
  }
  w.__probeMethods = seen.size;
});

const methods = await P.page.evaluate(() => window.__probeMethods || 0);
console.log('    probe wrapped ' + methods + ' create* methods across the prototype chain');

// a gesture, then listen
await P.page.locator('canvas').click({ position: { x: 30, y: 30 } });
await P.page.waitForTimeout(600);

const built = await P.page.evaluate(() => ({ ...window.__tally }));
console.log('\n    graph built');
const keys = Object.keys(built).sort();
if (!keys.length) console.log('      (nothing — the engine did not build)');
for (const k of keys) console.log('      ' + pad(k, 26) + built[k]);

await P.page.waitForTimeout(seconds * 1000);

const sched = await P.page.evaluate(() => window.__sched.slice());
const byType = {};
for (const s of sched) byType[s.type] = (byType[s.type] || 0) + 1;

console.log('\n    scheduled over ' + seconds + 's');
const st = Object.keys(byType).sort();
if (!st.length) console.log('      (no start() calls — either silent, or probed at a quiet point in the cycle)');
for (const k of st) console.log('      ' + pad(k, 26) + byType[k]);

const info = await P.info();
console.log('\n    scene at probe time: ' + JSON.stringify(info));

await P.close();

const ok = keys.length > 0;
console.log('\n  ' + (ok ? 'ok — the synth built and is scheduling' : 'FAILED — no audio graph') + '\n');
process.exit(ok ? 0 : 1);
