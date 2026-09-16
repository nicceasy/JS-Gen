// tools/sheet.mjs — contact sheet. The tool you will use most.
//
//   npm run sheet -- --seed 7 --frames 300,1400,2400,3300,4600,5400 --cols 3
//
// Six frames across the cycle catches what one screenshot never will.
//
// One caution, from HANDOFF.md §8.5: read the sheet for composition, colour and
// gross error. Tiling shrinks each frame and hides exactly the pixel-level
// artefacts you most want to catch. Confirm anything suspicious at full size —
// verify.mjs writes full-size frames to .renders/.

import fs from 'fs';
import path from 'path';
import { ART, args, nums, pieces, renders, openPiece, pad } from './lib.mjs';

const A = args();
const file = A.file || pieces()[0];
const seed = A.seed !== undefined ? parseInt(A.seed, 10) : 7;
const frames = nums(A.frames, [0, 900, 1800, 2700, 3600, 4500]);
const cols = A.cols ? parseInt(A.cols, 10) : Math.min(3, frames.length);
const cw = A.width ? parseInt(A.width, 10) : 1280;
const ch = A.height ? parseInt(A.height, 10) : 800;
const out = A.out || path.join(renders(), 'sheet.png');

console.log('\n  ' + file + '  seed ' + seed + '  frames ' + frames.join(',') + '\n');

const P = await openPiece(file, { width: cw, height: ch, seed, frame: frames[0] });

// Render each frame, then let the page itself tile them — it already has a
// canvas and a 2d context, and this avoids pulling in an image library.
const shots = [];
for (const n of frames) {
  await P.frame(n);
  const buf = await P.page.locator('canvas').screenshot();
  shots.push(buf.toString('base64'));
  console.log('    rendered f' + pad(n, 6));
}

const rows = Math.ceil(frames.length / cols);
const TILE = 520;
const th = Math.round(TILE * ch / cw);

const sheet = await P.page.evaluate(async ({ shots, frames, cols, rows, TILE, th, seed }) => {
  const GAP = 8, PADT = 26;
  const c = document.createElement('canvas');
  c.width = cols * TILE + GAP * (cols + 1);
  c.height = rows * (th + PADT) + GAP * (rows + 1);
  const g = c.getContext('2d');
  g.fillStyle = '#0b0d12';
  g.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < shots.length; i++) {
    const img = new Image();
    // a blob URL, built in-page from bytes we already have — no network
    const bin = atob(shots[i]);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const url = URL.createObjectURL(new Blob([arr], { type: 'image/png' }));
    await new Promise(res => { img.onload = res; img.onerror = res; img.src = url; });

    const cx = i % cols, cy = (i / cols) | 0;
    const x = GAP + cx * (TILE + GAP), y = GAP + cy * (th + PADT + GAP);
    g.drawImage(img, x, y + PADT, TILE, th);
    URL.revokeObjectURL(url);

    g.fillStyle = '#7f8ea3';
    g.font = '500 12px ui-monospace, Menlo, monospace';
    g.textBaseline = 'middle';
    g.fillText('seed ' + seed + '   frame ' + frames[i] + '   t=' + (frames[i] / 60).toFixed(1) + 's',
      x + 2, y + PADT / 2 + 1);
    g.strokeStyle = '#232936';
    g.strokeRect(x + 0.5, y + PADT + 0.5, TILE - 1, th - 1);
  }
  return c.toDataURL('image/png').split(',')[1];
}, { shots, frames, cols, rows, TILE, th, seed });

fs.writeFileSync(out, Buffer.from(sheet, 'base64'));
await P.close();

console.log('\n  ' + path.relative(process.cwd(), out) + '   ' +
  cols + '×' + rows + ' tiles\n' +
  '  (tiles hide pixel-level detail — confirm anything suspicious at full size)\n');
