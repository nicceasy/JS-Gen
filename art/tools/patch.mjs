// tools/patch.mjs — replace one function, by name, inside an HTML file.
//
// The unit of change in these pieces is the function, not the line. Line-based
// edits on a 1500-line file inside one <script> are how you end up with two
// definitions of drawSea and no idea which one runs.
//
// HANDOFF.md §8.4 is the reason this file is careful. An earlier version tracked
// string literals without understanding comments, so a comment reading
//     minus the gold it can't hold
// opened a string that never closed and the brace matcher swallowed the rest of
// the file. It failed loudly by luck. One more apostrophe and it would have
// silently deleted everything between them.
//
// A brace matcher that does not understand comments is a file shredder with a
// delay fuse. This one understands // , /* */ , ' , " and ` .

import fs from 'fs';

// Walk from the '{' at `open` to its matching '}'. Returns the index AFTER it.
export function matchBrace(src, open) {
  if (src[open] !== '{') throw new Error('matchBrace: index ' + open + ' is not "{"');
  let depth = 0;
  let i = open;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // ── comments
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? n : nl + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('patch: unterminated block comment from ' + i);
      i = end + 2;
      continue;
    }

    // ── strings (template literals can nest ${ }, so recurse through them)
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          i = matchBrace(src, i + 1);
          continue;
        }
        if (src[i] === quote) { i++; break; }
        if (src[i] === '\n' && quote !== '`') {
          throw new Error('patch: unterminated string at offset ' + i);
        }
        i++;
      }
      continue;
    }

    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  throw new Error('patch: no closing brace for the block opening at ' + open);
}

// Find `function NAME(...) { ... }` and return [start, end) of the whole thing.
export function findFn(src, name) {
  const re = new RegExp('(^|[^\\w$.])function\\s+' + name.replace(/[$]/g, '\\$&') + '\\s*\\(', 'g');
  let m, hits = [];
  while ((m = re.exec(src))) hits.push(m.index + m[1].length);

  if (hits.length === 0) throw new Error('patch: no function named "' + name + '"');
  if (hits.length > 1) {
    throw new Error(
      'patch: "' + name + '" is defined ' + hits.length + ' times (offsets ' + hits.join(', ') +
      '). Refusing to guess — this is exactly the duplicate-definition failure the ' +
      'function-level workflow exists to prevent.'
    );
  }

  const start = hits[0];
  const open = src.indexOf('{', src.indexOf(')', start));
  if (open < 0) throw new Error('patch: could not find the body of "' + name + '"');
  return [start, matchBrace(src, open)];
}

export function replaceFn(src, name, body) {
  const [a, b] = findFn(src, name);
  const trimmed = String(body).trim();
  if (!new RegExp('^function\\s+' + name + '\\s*\\(').test(trimmed)) {
    throw new Error('patch: replacement for "' + name + '" must itself start with "function ' + name + '("');
  }
  return src.slice(0, a) + trimmed + src.slice(b);
}

// ─────────────────────────────────────────────────────────────────────────── cli
//   node tools/patch.mjs piece.html drawSea /tmp/new.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, name, from] = process.argv.slice(2);
  if (!file || !name || !from) {
    console.error('usage: node tools/patch.mjs <file.html> <functionName> <replacement.js>');
    process.exit(2);
  }
  const src = fs.readFileSync(file, 'utf8');
  const out = replaceFn(src, name, fs.readFileSync(from, 'utf8'));
  fs.writeFileSync(file, out);
  const d = out.length - src.length;
  console.log('  patched ' + name + ' in ' + file + '  (' + (d >= 0 ? '+' : '') + d + ' chars)');
}
