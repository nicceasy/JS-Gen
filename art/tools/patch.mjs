#!/usr/bin/env node
//
// Replace one top-level function inside a single-file piece, by name.
//
// A piece is ~1500 lines of JavaScript inside one HTML file, and the editing
// unit that matters is the function: "make the sea stop looking like corduroy"
// is one function. Line-based edits on a file this size are how you end up with
// two definitions of drawSea and no idea which one runs.
//
//   As a CLI:
//     node tools/patch.mjs ../lamplighter.html drawSea /tmp/newDrawSea.js
//
//   As a module (the usual way — write a patch script with several of these):
//     import { replaceFn } from './tools/patch.mjs';
//     let src = fs.readFileSync(file, 'utf8');
//     src = replaceFn(src, 'drawSea', `function drawSea(g, k, T) { ... }`);
//     fs.writeFileSync(file, src);
//
// The brace matcher understands strings, template literals, line comments and
// block comments. That last part is not optional: a naive matcher treats the
// apostrophe in a comment like "the sky's gold" as an opening quote, swallows
// the rest of the file, and silently deletes everything after it.

import fs from 'fs';

const SQ = String.fromCharCode(39), DQ = String.fromCharCode(34);
const BQ = String.fromCharCode(96), BS = String.fromCharCode(92);

// Index just past the '}' that closes the block opening at or after `from`.
export function blockEnd(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return -1;
  let depth = 0, mode = 0, quote = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1], prev = src[i - 1];
    if (mode === 1) { if (c === quote && prev !== BS) mode = 0; continue; }   // string
    if (mode === 2) { if (c === '\n') mode = 0; continue; }                   // // comment
    if (mode === 3) { if (c === '*' && n === '/') { mode = 0; i++; } continue; } // /* */
    if (c === '/' && n === '/') { mode = 2; i++; continue; }
    if (c === '/' && n === '*') { mode = 3; i++; continue; }
    if (c === SQ || c === DQ || c === BQ) { mode = 1; quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

export function findFn(src, name) {
  const needle = '\nfunction ' + name + '(';
  // The header above warns about ending up with two definitions and no idea
  // which one runs. indexOf would quietly patch the first and leave the other
  // in place, which is how you get there. Refuse instead.
  let count = 0;
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) count++;
  if (count > 1) {
    throw new Error('"' + name + '" is defined ' + count + ' times — refusing to guess which one you meant');
  }
  const at = src.indexOf(needle);
  if (at < 0) return null;
  const end = blockEnd(src, at);
  if (end < 0) return null;
  return { start: at + 1, end };
}

export function replaceFn(src, name, next) {
  const span = findFn(src, name);
  if (!span) throw new Error('function not found or unbalanced: ' + name);
  return src.slice(0, span.start) + String(next).trim() + src.slice(span.end);
}

export function replaceInFile(file, name, next) {
  const src = fs.readFileSync(file, 'utf8');
  const out = replaceFn(src, name, next);
  fs.writeFileSync(file, out);
  return out.length - src.length;
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [file, name, bodyFile] = process.argv.slice(2);
  if (!file || !name || !bodyFile) {
    console.error('usage: node tools/patch.mjs <file.html> <functionName> <newSource.js>');
    process.exit(1);
  }
  try {
    const delta = replaceInFile(file, name, fs.readFileSync(bodyFile, 'utf8'));
    console.log('patched ' + name + ' in ' + file + ' (' + (delta >= 0 ? '+' : '') + delta + ' bytes)');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
