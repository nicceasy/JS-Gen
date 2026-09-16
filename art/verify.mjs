// verify.mjs — prove the claim.
//
// The claim every piece in this folder makes: it contains no media and no
// external references, it renders with the network fully blocked, it requests
// nothing, and the same seed and frame number give the same pixels.
//
//   node verify.mjs --scan-only          no dependencies at all. works anywhere.
//   npm run verify                       + headless render, network hard-blocked
//   npm run verify -- --seed 23 --frames 0,2600
//
// Exit code is non-zero if anything fails, so this is CI-safe.

import fs from 'fs';
import path from 'path';
import { ART, args, nums, pieces, renders, openPiece, kb, pad } from './tools/lib.mjs';

const A = args();
const only = A.file ? [A.file] : pieces();
const seed = A.seed !== undefined ? parseInt(A.seed, 10) : 7;
const frames = nums(A.frames, [0, 1200, 2400, 3600, 4800]);
let bad = 0;

// ───────────────────────────────────────────────────────────── the static scan
//
// Needles are split so this file does not match itself when it is scanned, the
// same trick the pieces use on themselves.

const NEEDLES = [
  'da' + 'ta:', 'ba' + 'se64', '<i' + 'mg', '<vi' + 'deo', '<au' + 'dio', '<sv' + 'g',
  '<li' + 'nk', '<ifr' + 'ame', 'ht' + 'tp://', 'ht' + 'tps://', '@font-' + 'face',
  '.p' + 'ng', '.j' + 'pg', '.jpe' + 'g', '.gi' + 'f', '.we' + 'bp', '.m' + 'p3',
  '.w' + 'av', '.o' + 'gg', '.m' + 'p4', '.wo' + 'ff', '.tt' + 'f', 'sr' + 'c='
];

async function scan(file) {
  const src = fs.readFileSync(path.join(ART, file), 'utf8');
  const low = src.toLowerCase();
  const hits = [];
  for (const n of NEEDLES) {
    const at = low.indexOf(n);
    if (at >= 0) hits.push(n + ' @' + at);
  }

  // syntax-check the script without a browser
  let syntax = 'ok';
  const m = src.match(/<script>([\s\S]*)<\/script>/);
  if (!m) syntax = 'no <script> block';
  else {
    const tmp = path.join(renders(), '.syntax-check.js');
    fs.writeFileSync(tmp, m[1]);
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
      syntax = String(e.stderr || e.message).split('\n').slice(0, 4).join('\n           ');
    }
    fs.unlinkSync(tmp);
  }

  const ok = hits.length === 0 && syntax === 'ok';
  if (!ok) bad++;
  console.log(
    '    ' + (ok ? 'ok  ' : 'FAIL') + ' ' + pad(file, 22) + ' (' + kb(src.length) + ')  ' +
    (hits.length ? 'found: ' + hits.join(', ') : 'no embedded media, no external references') +
    (syntax === 'ok' ? '' : '\n         syntax: ' + syntax)
  );
  return ok;
}

console.log('\n  static scan');
for (const f of only) await scan(f);

if (A['scan-only']) {
  console.log('');
  process.exit(bad ? 1 : 0);
}

// ────────────────────────────────────────────────────── the headless render
console.log('\n  headless, network blocked');

for (const file of only) {
  let P;
  try {
    P = await openPiece(file, { seed, frame: frames[0], still: true, det: true });
  } catch (e) {
    console.log('    FAIL ' + pad(file, 22) + String(e.message).split('\n')[0]);
    bad++;
    continue;
  }

  const rep = await P.purity();
  const dir = renders();
  let wrote = 0;

  // ── determinism: render the same frame twice, out of order, and compare bytes
  let determinism = 'ok';
  const first = {};
  for (const n of frames) {
    await P.frame(n);
    const f = path.join(dir, `${path.basename(file, '.html')}-s${seed}-f${n}.png`);
    await P.shot(f);
    first[n] = fs.readFileSync(f);
    wrote++;
  }
  for (const n of [...frames].reverse()) {
    await P.frame(n);
    const again = await P.page.locator('canvas').screenshot();
    if (!again.equals(first[n])) { determinism = 'frame ' + n + ' differs on re-render'; break; }
  }

  const ok = rep.clean && P.offFile.length === 0 && P.errors.length === 0 && determinism === 'ok';
  if (!ok) bad++;

  console.log(
    '    ' + (ok ? 'ok  ' : 'FAIL') + ' ' + pad(file, 22) +
    'self-audit ' + (rep.clean ? 'clean' : 'DIRTY ' + rep.found.join(',')) +
    ', ' + rep.canvases + ' canvas, ' + rep.elements + ' body children' +
    ', off-file requests ' + P.offFile.length +
    ', ' + wrote + ' frames rendered' +
    ', determinism ' + determinism
  );
  if (P.errors.length) console.log('         page errors: ' + P.errors.join(' | '));
  if (P.offFile.length) console.log('         reached for: ' + P.offFile.slice(0, 5).join(' '));

  await P.close();
}

console.log('\n  frames in ' + path.relative(process.cwd(), renders()) + '\n');
process.exit(bad ? 1 : 0);
