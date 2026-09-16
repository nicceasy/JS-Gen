// tools/ablate.mjs — where the frame time really goes.
//
//   npm run ablate -- --frame 1800
//
// This is not a profiler, and that is the point (HANDOFF.md §8.3).
//
// Wrapping each draw call in performance.now() reports nonsense, because canvas
// work is deferred: calls queue and only rasterise when something forces a flush.
// Whichever function happens to touch the buffers first gets charged for
// everyone else's work. On the first piece that made composite() look like 96 ms
// of a 102 ms frame. It was not.
//
// So: skip one function, measure the WHOLE frame, take the difference. Slower to
// run, but it is measuring the thing you actually care about.

import { args, pieces, openPiece, pad } from './lib.mjs';

const A = args();
const file = A.file || pieces()[0];
const frame = A.frame !== undefined ? parseInt(A.frame, 10) : 1800;
const reps = A.reps !== undefined ? parseInt(A.reps, 10) : 7;

console.log('\n  ablate — ' + file + '   frame ' + frame + '   ' + reps + ' reps each\n');

const P = await openPiece(file, { seed: A.seed !== undefined ? parseInt(A.seed, 10) : 7, frame });

const report = await P.page.evaluate(async ({ frame, reps }) => {
  // Every draw* function the piece hung on window, plus composite.
  const table = window.artPiece.__passes;
  if (!table) return { found: 0, base: 0, rows: [] };
  const names = Object.keys(table);

  function time() {
    // a real flush: read one pixel back, which forces everything queued to land
    const t0 = performance.now();
    for (let i = 0; i < reps; i++) {
      window.artPiece.frame(frame);
      document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1, 1);
    }
    return (performance.now() - t0) / reps;
  }

  const base = time();
  const rows = [];
  for (const n of names) {
    const orig = table[n];
    table[n] = n === 'buildDustMask' ? function () { return false; } : function () {};
    const without = time();
    table[n] = orig;
    rows.push({ name: n, cost: base - without });
  }
  rows.sort((a, b) => b.cost - a.cost);
  return { base, rows, found: names.length };
}, { frame, reps });

if (!report.found) {
  console.log('    this piece exposes no pass table.\n' +
    '    ablate needs window.artPiece.__passes — a plain object of the draw\n' +
    '    functions that render() dispatches through.\n');
} else {
  console.log('    whole frame: ' + report.base.toFixed(1) + ' ms\n');
  for (const r of report.rows) {
    if (Math.abs(r.cost) < 0.05) continue;
    const bar = '█'.repeat(Math.max(0, Math.round(r.cost / report.base * 46)));
    console.log('      ' + pad(r.name, 20) + pad(r.cost.toFixed(1), 7) + bar);
  }
  console.log('\n    (negative or near-zero means the call is free at this frame —\n' +
    '     a night-only effect measured at noon, say. Ablate at several frames.)');
}

await P.close();
console.log('');
