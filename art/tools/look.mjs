#!/usr/bin/env node
//
// The vision loop. Render exact frames, hand them to a model, get back a
// critique you can act on without reading it yourself.
//
// Both handoffs list this as the unimplemented part of the method, and it is
// the right place to spend a fast model: writing a piece is one long creative
// generation and a cheap model makes it worse, but LOOKING at twelve frames is
// embarrassingly parallel and mostly mechanical.
//
//   node tools/look.mjs --piece apogee.html --dry          # no network, prints the request
//   node tools/look.mjs --piece apogee.html                # live
//   node tools/look.mjs --piece parallax.html --frames 0,720,1440,2160,2880 --views wide,edge
//
// ─── what this borrows from vercel-labs/json-render ──────────────────────────
//
// That project exists because free-form model output is unreliable, so it
// constrains generation to a catalog of components you define, validates the
// result structurally before rendering it, and refines by PATCH rather than by
// regenerating. Three ideas, and all three transfer here even though generating
// the pieces themselves through a component catalog would be a terrible idea:
//
//   1. Constrain the output to a catalog you control.
//      Here the catalog is not invented — it is the set of functions actually
//      defined in the piece, read out of the file. A finding that blames
//      `drawOcean` in a piece that has no `drawOcean` is rejected before it
//      costs anybody anything.
//
//   2. Validate structurally, with machine-readable codes.
//      json-render's spec-validator returns {severity, code, message} rather
//      than a boolean. So does verdict() below. "The model returned JSON" is
//      not the same as "the model returned something true about this piece".
//
//   3. Refine by patch, not by regeneration.
//      Findings come back keyed to a function name, which is exactly the unit
//      tools/patch.mjs operates on. The output of this tool is meant to be read
//      straight into a fix script.
//
// The provider is deliberately not hardcoded — json-render passes plain string
// model ids through a gateway rather than importing a provider constructor, and
// that is the right shape. Anything OpenAI-compatible works:
//
//   LOOK_BASE_URL   default https://openrouter.ai/api/v1
//   LOOK_MODEL      e.g. a fast vision model on your router of choice
//   LOOK_API_KEY    required for a live run. Never put this in the repo.

import fs from 'fs';
import path from 'path';
import { launch, openPiece, args, nums, ART, die } from './lib.mjs';

const a = args();
const piece = a.piece || 'lamplighter.html';
const seed = a.seed || 7;
const frames = nums(a.frames, '0,1200,2400,3600,4800');
const DRY = !!a.dry;
const OUT = a.out || path.join(ART, '.renders', 'look');

const BASE = process.env.LOOK_BASE_URL || 'https://openrouter.ai/api/v1';
const MODEL = a.model || process.env.LOOK_MODEL || '';
const KEY = process.env.LOOK_API_KEY || '';

// camera presets, so a critique covers the angles a contact sheet never shows
const VIEWS = {
  wide: null,                       // whatever the piece calls canonical
  edge: [null, 1.35, null],
  far:  [1.1, 0.6, 1.0]
};
const views = String(a.views || 'wide').split(',').map(s => s.trim()).filter(v => VIEWS[v] !== undefined);
if (!views.length) die('no valid --views. choose from: ' + Object.keys(VIEWS).join(','));

// ─────────────────────────────────────────────────────────── the catalog
//
// Read the piece's own function names out of the file. This is the whole
// guardrail: the model may only blame something that exists.

function catalog(file) {
  const src = fs.readFileSync(path.join(ART, file), 'utf8');
  const names = new Set();
  const re = /\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  // the ones worth critiquing are the draw passes and the engine, not helpers
  const drawish = [...names].filter(n => /^(draw|build|update|composite|render|beam|emit|occlude|ink|knock|orbit|project)/.test(n));
  return { all: [...names], targets: drawish.length ? drawish : [...names] };
}

// ─────────────────────────────────────────────────────── structural verdict
//
// json-render's spec-validator, for art criticism. Codes, not booleans.

const SEVERITIES = new Set(['error', 'warning', 'nit']);

function verdict(findings, cat, frameSet) {
  const ok = [], bad = [];
  if (!Array.isArray(findings)) {
    return { ok, bad: [{ code: 'not_an_array', message: 'top level was not an array' }] };
  }
  for (const f of findings) {
    const issues = [];
    if (!f || typeof f !== 'object') { bad.push({ code: 'not_an_object', message: String(f) }); continue; }
    if (typeof f.symptom !== 'string' || f.symptom.length < 8) {
      issues.push({ code: 'empty_symptom', message: 'symptom missing or too short' });
    }
    if (!SEVERITIES.has(f.severity)) {
      issues.push({ code: 'bad_severity', message: 'severity was ' + JSON.stringify(f.severity) });
    }
    if (typeof f.fn !== 'string' || !cat.all.includes(f.fn)) {
      // the guardrail that matters: a critique naming a function the piece does
      // not have is a hallucination, and it is free to catch here
      issues.push({ code: 'unknown_function', message: JSON.stringify(f.fn) + ' is not defined in this piece' });
    }
    if (f.frame !== undefined && f.frame !== null && !frameSet.has(Number(f.frame))) {
      issues.push({ code: 'unrendered_frame', message: 'frame ' + f.frame + ' was not among those rendered' });
    }
    if (issues.length) bad.push({ finding: f, issues });
    else ok.push(f);
  }
  return { ok, bad };
}

// ────────────────────────────────────────────────────────────── the prompt

function buildRequest(cat, shots, intent) {
  const system = [
    'You are reviewing frames from a single-file generative art piece.',
    'Answer ONLY with a JSON array. No prose, no code fences.',
    '',
    'Each element must be exactly:',
    '  {"frame": <int>, "severity": "error"|"warning"|"nit",',
    '   "symptom": "<what is visibly wrong, in one sentence>",',
    '   "fn": "<one function name from the catalog below>",',
    '   "fix": "<the smallest change to that function that would address it>"}',
    '',
    'Rules:',
    '- "fn" MUST be copied verbatim from the catalog. Never invent a name.',
    '- Report what you can SEE. Do not speculate about code you were not shown.',
    '- An empty array is a valid and useful answer. Do not manufacture findings.',
    '- Prefer few high-confidence findings over many uncertain ones.',
    '',
    'Catalog of functions in this piece:',
    cat.targets.join(', ')
  ].join('\n');

  const content = [{ type: 'text', text: intent }];
  for (const s of shots) {
    content.push({ type: 'text', text: `frame ${s.frame}, view ${s.view}` });
    content.push({
      type: 'image_url',
      image_url: { url: 'data:image/png;base' + '64,' + s.b64 }
    });
  }

  return {
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content }
    ]
  };
}

// ──────────────────────────────────────────────────────────────────── run

const cat = catalog(piece);
fs.mkdirSync(OUT, { recursive: true });

const browser = await launch();
const { page, state } = await openPiece(browser, { piece, seed });

const shots = [];
for (const v of views) {
  if (VIEWS[v]) {
    const has = await page.evaluate(() => typeof window.artPiece.view === 'function');
    if (!has) { console.log('  (piece has no view(); skipping view "' + v + '")'); continue; }
  }
  for (const f of frames) {
    await page.evaluate(n => window.artPiece.frame(n), f);
    if (VIEWS[v]) await page.evaluate(p => window.artPiece.view(p[0], p[1], p[2]), VIEWS[v]);
    const file = path.join(OUT, `${path.basename(piece, '.html')}-s${seed}-${v}-f${f}.png`);
    const buf = await page.screenshot({ path: file });
    shots.push({ frame: f, view: v, file, b64: buf.toString('base64') });
  }
}
await browser.close();

console.log('\n  ' + piece + '  seed ' + seed);
console.log('  catalog: ' + cat.targets.length + ' reviewable functions of ' + cat.all.length + ' defined');
console.log('  rendered: ' + shots.length + ' frames -> ' + path.relative(process.cwd(), OUT));
if (state.errors.length) console.log('  page errors: ' + state.errors.join(' | '));

const intent = a.intent || [
  'This is a frame from a procedural piece that draws everything at runtime.',
  'Judge composition, legibility, and whether anything reads as a rendering',
  'defect rather than a choice. Ignore that it is dark; that is intended.'
].join(' ');

const req = buildRequest(cat, shots, intent);
const bytes = JSON.stringify(req).length;

if (DRY || !KEY || !MODEL) {
  const why = DRY ? '--dry' : !MODEL ? 'no LOOK_MODEL set' : 'no LOOK_API_KEY set';
  console.log('\n  not calling out (' + why + ')');
  console.log('  would POST ' + (bytes / 1024 / 1024).toFixed(2) + ' MB to ' + BASE + '/chat/completions');
  console.log('  model: ' + (MODEL || '<unset>'));

  const stripped = JSON.parse(JSON.stringify(req));
  stripped.messages[1].content = stripped.messages[1].content.map(c =>
    c.type === 'image_url' ? { type: 'image_url', image_url: { url: '<' + (c.image_url.url.length / 1024 | 0) + ' KB elided>' } } : c);
  const reqFile = path.join(OUT, 'request.json');
  fs.writeFileSync(reqFile, JSON.stringify(stripped, null, 2));
  console.log('  request (images elided) -> ' + path.relative(process.cwd(), reqFile));

  // exercise the validator offline, so the guardrail is tested even with no
  // network — this is the half of the tool that can actually fail in review
  const frameSet = new Set(frames);
  const probe = verdict([
    { frame: frames[0], severity: 'warning', symptom: 'the horizon reads as a hard seam', fn: cat.targets[0], fix: 'feather it' },
    { frame: frames[0], severity: 'error', symptom: 'the sea is plaid', fn: 'drawNothingAtAll', fix: 'n/a' },
    { frame: 999999, severity: 'nit', symptom: 'label collides with the rim', fn: cat.targets[0], fix: 'stagger it' },
    { frame: frames[0], severity: 'catastrophe', symptom: 'x', fn: cat.targets[0] }
  ], cat, frameSet);
  console.log('\n  validator self-check on four planted findings:');
  console.log('    accepted ' + probe.ok.length + ', rejected ' + probe.bad.length);
  for (const b of probe.bad) {
    const codes = (b.issues || [b]).map(i => i.code + ': ' + i.message).join('; ');
    console.log('      - ' + codes);
  }
  console.log('');
  process.exit(probe.ok.length === 1 && probe.bad.length === 3 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────── live call

let res;
try {
  res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
    body: JSON.stringify(req)
  });
} catch (e) {
  die('could not reach ' + BASE + '\n  ' + e.message +
      '\n\n  If this is an egress policy block rather than a bad URL, the piece\n' +
      '  and every other tool still work — only this one needs the network.');
}
if (!res.ok) die(BASE + ' answered ' + res.status + '\n  ' + (await res.text()).slice(0, 400));

const body = await res.json();
const text = body.choices?.[0]?.message?.content ?? '';
let parsed;
try {
  parsed = JSON.parse(text);
} catch (e) {
  die('model did not return JSON:\n  ' + text.slice(0, 400));
}
// some routers wrap an array in an object when json_object is requested
const findings = Array.isArray(parsed) ? parsed
  : Array.isArray(parsed.findings) ? parsed.findings
  : Array.isArray(parsed.issues) ? parsed.issues : parsed;

const { ok, bad } = verdict(findings, cat, new Set(frames));

console.log('\n  ' + (MODEL) + '  ->  ' + ok.length + ' accepted, ' + bad.length + ' rejected');
if (body.usage) console.log('  tokens: ' + JSON.stringify(body.usage));

const byFn = {};
for (const f of ok) (byFn[f.fn] = byFn[f.fn] || []).push(f);
const order = { error: 0, warning: 1, nit: 2 };
for (const fn of Object.keys(byFn).sort((x, y) =>
    Math.min(...byFn[x].map(f => order[f.severity])) - Math.min(...byFn[y].map(f => order[f.severity])))) {
  console.log('\n  ' + fn);
  for (const f of byFn[fn].sort((x, y) => order[x.severity] - order[y.severity])) {
    console.log('    [' + f.severity + '] f' + f.frame + '  ' + f.symptom);
    if (f.fix) console.log('             -> ' + f.fix);
  }
}
if (bad.length) {
  console.log('\n  rejected:');
  for (const b of bad) {
    const codes = (b.issues || [b]).map(i => i.code).join(',');
    console.log('    [' + codes + '] ' + JSON.stringify(b.finding?.symptom || b.message || '').slice(0, 90));
  }
}

const outFile = path.join(OUT, 'findings.json');
fs.writeFileSync(outFile, JSON.stringify({ piece, seed, model: MODEL, accepted: ok, rejected: bad }, null, 2));
console.log('\n  ' + path.relative(process.cwd(), outFile));
console.log('  findings are keyed to function names — feed them to tools/patch.mjs\n');
