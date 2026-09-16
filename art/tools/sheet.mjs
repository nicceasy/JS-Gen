#!/usr/bin/env node
//
// Contact sheet: renders N exact frames into one image.
//
// This is the tool you will use most. Reviewing a 96-second animation one
// screenshot at a time is how you miss that the sea has gone plaid; six frames
// side by side across the cycle shows it immediately. Frames are stitched
// inside the browser, so this needs no image library.
//
//   node tools/sheet.mjs
//   node tools/sheet.mjs --seed 23 --frames 300,1400,2400,3300,4600,5400
//   node tools/sheet.mjs --piece lamplighter.html --cols 2 --out /tmp/sheet.png
//
// Caution: read the sheet for composition and colour, not for fine texture —
// tiling shrinks each frame and hides exactly the pixel-level artefacts you
// most want to catch. Confirm anything suspicious with a full-size render
// (tools/../verify.mjs writes those).

import path from 'path';
import { launch, openPiece, args, nums, ART } from './lib.mjs';

const a = args();
const frames = nums(a.frames, '200,1300,2600,3400,4400,5300');
const cols = Number(a.cols || 2);
const out = a.out || path.join(ART, '.renders', 'sheet.png');
const seed = a.seed || 7;

const browser = await launch();
const { page, state } = await openPiece(browser, {
  piece: a.piece || 'lamplighter.html',
  seed,
  width: Number(a.width || 1280),
  height: Number(a.height || 800)
});

await page.evaluate(({ fr, cols }) => {
  const cw = 620, ch = 388;
  const big = document.createElement('canvas');
  big.id = '__sheet';
  big.width = cw * cols;
  big.height = ch * Math.ceil(fr.length / cols);
  big.style.cssText = 'position:absolute;left:0;top:0;z-index:9;width:' + big.width +
    'px;height:' + big.height + 'px';
  document.body.appendChild(big);
  const g = big.getContext('2d');
  const view = document.querySelector('canvas');
  g.fillStyle = '#000';
  g.fillRect(0, 0, big.width, big.height);
  fr.forEach((f, i) => {
    window.artPiece.frame(f);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    g.drawImage(view, x, y, cw - 4, ch - 4);
    g.fillStyle = '#fff';
    g.font = '12px monospace';
    g.fillText('f' + f, x + 8, y + 16);
  });
}, { fr: frames, cols });

const { mkdirSync } = await import('fs');
mkdirSync(path.dirname(out), { recursive: true });
await (await page.$('#__sheet')).screenshot({ path: out });
await browser.close();

console.log('seed ' + seed + ', frames ' + frames.join(',') + ' -> ' + out);
if (state.errors.length) console.log('page errors:\n  ' + state.errors.join('\n  '));
