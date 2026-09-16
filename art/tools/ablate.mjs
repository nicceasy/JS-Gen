#!/usr/bin/env node
//
// Where is the frame time going?
//
// Do not reach for a per-function timer first. Canvas work is deferred: calls
// queue and only rasterise when something forces a flush, so a naive profiler
// blames whichever function happens to trigger it — here, composite() appeared
// to cost 96ms of a 102ms frame, which was every other function's work in a
// trench coat.
//
// Ablation avoids the problem entirely. Skip one draw call, measure the whole
// frame, and the difference is what that call really costs.
//
//   node tools/ablate.mjs
//   node tools/ablate.mjs --frame 1800 --reps 25

import fs from 'fs';
import path from 'path';
import os from 'os';
import { launch, openPiece, args, ART } from './lib.mjs';

const a = args();
const piece = a.piece || 'lamplighter.html';
const frame = Number(a.frame || 1800);
const reps = Number(a.reps || 25);

// Rewrite the calls inside render() to route through a skippable shim. Only the
// call sites are touched, never the definitions.
const src = fs.readFileSync(path.join(ART, piece), 'utf8');
const at = src.indexOf('function render(T) {');
if (at < 0) { console.error('no render(T) in ' + piece); process.exit(1); }
const head = src.slice(0, at), rest = src.slice(at);
const end = rest.indexOf('\n}\n');
let body = rest.slice(0, end);
const names = new Set();
body = body.replace(/^(\s+)([a-zA-Z]\w*)\((g, k, T[^;]*)\);$/gm, (m, ind, fn, argl) => {
  names.add(fn);
  return `${ind}PF('${fn}',function(){${fn}(${argl});});`;
});
body = body.replace(/^(\s+)(composite|overlay)\((T)\);$/gm, (m, ind, fn, argl) => {
  names.add(fn);
  return `${ind}PF('${fn}',function(){${fn}(${argl});});`;
});
const shim = 'window.__skip={};function PF(n,f){if(window.__skip[n])return;f();}\n';
const tmp = path.join(os.tmpdir(), 'ablate-' + Date.now() + '-' + piece);
fs.writeFileSync(tmp, head + shim + body + rest.slice(end));

const browser = await launch();
const { page, state } = await openPiece(browser, { piece: tmp, seed: a.seed || 7 });
const run = skip => page.evaluate(({ s, f, r }) => {
  window.__skip = s;
  window.artPiece.frame(f);
  const t0 = performance.now();
  for (let i = 0; i < r; i++) window.artPiece.frame(f + i * 3);
  return +((performance.now() - t0) / r).toFixed(1);
}, { s: skip, f: frame, r: reps });

const base = await run({});
const rows = [];
for (const n of names) rows.push([n, base - await run({ [n]: 1 })]);
rows.sort((x, y) => y[1] - x[1]);
await browser.close();
fs.unlinkSync(tmp);

console.log('frame ' + frame + ', ' + reps + ' reps, baseline ' + base + ' ms/frame');
console.log('(headless software rasterisation — roughly an order of magnitude');
console.log(' slower than a GPU canvas. Read the ranking, not the absolutes.)\n');
for (const [n, ms] of rows) console.log('  ' + n.padEnd(15) + (ms > 0 ? ms.toFixed(1) : '~0'));
console.log('\n  ' + 'composite'.padEnd(15) + 'if this dominates it is the flush, not the blend');
if (state.errors.length) console.log('\npage errors:\n  ' + state.errors.join('\n  '));
