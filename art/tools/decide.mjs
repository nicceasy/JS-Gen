#!/usr/bin/env node
//
// A System One client, for the decisions this process makes over and over.
//
// ─── what Jev actually is ────────────────────────────────────────────────────
//
// Not a text model and not a vision model. You hand it your app's state plus a
// set of TYPED QUESTIONS, and it returns a typed answer per question with a
// probability. There is no prose, no JSON prompting, and nothing to parse.
//
//   POST https://api.typesafe.ai/v1/systemone
//   {
//     "state":     { ...whatever your app knows... },
//     "model":     "jev-latest",
//     "questions": { "<name>": { "type": "choice",
//                                "instructions": "...",
//                                "criteria": { "<option>": "<description>" } } }
//   }
//   -> { "answers": { "<name>": { "choice": "<option>", ... } } }
//
// $0.042/M in, output free, 70-500 ms, 32K context.
//
// ─── why that is the right tool for THIS job ─────────────────────────────────
//
// tools/look.mjs has a function called verdict() whose main job is catching a
// vision model blaming `drawOcean` in a piece that has no `drawOcean`. That
// check exists because a text model CAN hallucinate a name.
//
// Jev's `criteria` map removes the possibility. The answer is a key of the map
// you supplied, so an out-of-catalog answer is not something to validate — it
// is not something that can happen. That is json-render's whole thesis
// (constrain generation to a catalog you control) pushed down a layer, from
// "validate the output" to "make the wrong output unrepresentable".
//
// So the division of labour is:
//
//   a vision model  — once per frame batch, expensive:  what do you SEE?
//   Jev             — many times, ~free:                so what do we DO?
//
// The volume is all in the second stage, which is exactly where 440x cheaper
// and sub-500 ms compounds. Using Jev for the first stage would not work at
// all; it does not take images. (jev-router, TypeSafe's own example, reduces an
// image to the literal string "[image]" plus a boolean signal before asking.)
//
// ─── configuration ───────────────────────────────────────────────────────────
//
//   JEV_BASE_URL   default https://api.typesafe.ai/v1/systemone
//   JEV_MODEL      default jev-latest
//   JEV_API_KEY    required for a live call. Never put this in the repo.
//
// Every call takes a fallback, and any failure — no key, blocked egress, a
// timeout, a non-200 — returns it rather than throwing. That is how jev-router
// does it too, and it means a pipeline built on this degrades instead of
// stopping.

const URL_ = process.env.JEV_BASE_URL || 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.JEV_MODEL || 'jev-latest';
const KEY = process.env.JEV_API_KEY || '';

export function configured() { return !!KEY; }
export function endpoint() { return URL_; }
export function model() { return MODEL; }

/**
 * Ask one or more typed questions about a state.
 * Returns { answers, source } where source is 'jev' or 'fallback:<reason>'.
 */
export async function ask(state, questions, opts = {}) {
  const fallbacks = opts.fallbacks || {};
  const timeoutMs = opts.timeoutMs || 5000;

  const give = reason => ({
    answers: Object.fromEntries(Object.keys(questions).map(q => [q, {
      choice: fallbacks[q] ?? Object.keys(questions[q].criteria || {})[0] ?? null,
      probability: null
    }])),
    source: 'fallback:' + reason
  });

  if (!KEY) return give('no JEV_API_KEY');

  const body = JSON.stringify({ state, model: MODEL, questions });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
      body,
      signal: ctl.signal
    });
    if (!res.ok) return give('http ' + res.status);
    const parsed = await res.json();
    const answers = parsed.answers || {};
    // Belt and braces: the criteria map should make this impossible, but a
    // router in front of Jev could still hand back something unexpected.
    for (const q of Object.keys(questions)) {
      const opts_ = Object.keys(questions[q].criteria || {});
      if (!answers[q] || (opts_.length && !opts_.includes(answers[q].choice))) {
        return give('off-catalog answer for "' + q + '"');
      }
    }
    return { answers, source: 'jev', usage: parsed.usage };
  } catch (e) {
    return give(e.name === 'AbortError' ? 'timeout' : e.message);
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────────────────────────── the questions we actually ask

/** Which function is responsible? The criteria map IS the guardrail. */
export function blameQuestion(catalog, descriptions = {}) {
  const criteria = {};
  for (const fn of catalog) criteria[fn] = descriptions[fn] || describe(fn);
  return {
    type: 'choice',
    instructions:
      'Which single function in this piece is responsible for the reported symptom? ' +
      'Choose the one whose output the symptom describes, not the one that merely ' +
      'runs nearby.',
    criteria
  };
}

/**
 * Act, or look closer, or let it go.
 *
 * This automates the most-repeated judgment call in the whole method. Both
 * handoffs say a contact sheet hides exactly the pixel-level detail you most
 * want, and that it lied twice in one session about the same piece. So every
 * finding that came from a tiled view has to be triaged: is this real, or is it
 * the tiling? That question gets asked dozens of times per pass.
 */
export function triageQuestion() {
  return {
    type: 'choice',
    instructions:
      'A critique of a rendered frame has to be triaged before anyone edits code. ' +
      'Findings drawn from a tiled contact sheet routinely describe artefacts of ' +
      'the tiling rather than of the piece, so anything about fine texture, thin ' +
      'lines or small detail seen only on a sheet should be confirmed at full size ' +
      'first. Findings about composition, colour or gross error can be trusted ' +
      'from a sheet.',
    criteria: {
      act_now: 'Clearly real and clearly in scope. Write the patch.',
      render_full_size: 'Plausible, but seen at a size that hides or invents this class of detail. Re-render one full-size frame before touching code.',
      dump_parameters: 'The symptom may be a parameter value rather than a drawing bug. Print the generated world first.',
      defer: 'Real but not worth this pass — a nit, or out of scope for the change in hand.',
      reject: 'Describes something intended, or is not visible in the frame at all.'
    }
  };
}

/** How much does it matter? */
export function severityQuestion() {
  return {
    type: 'choice',
    instructions: 'How badly does this symptom hurt the piece?',
    criteria: {
      error: 'Reads as a rendering defect. A viewer would think it is broken.',
      warning: 'Weakens the image but reads as a choice rather than a fault.',
      nit: 'Noticeable only when looking for it.'
    }
  };
}

function describe(fn) {
  const m = fn.match(/^(draw|build|update|composite|render|beam|project|orbit)(.*)$/);
  if (!m) return 'the ' + fn + ' routine';
  const what = m[2].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
  const verb = { draw: 'draws', build: 'generates', update: 'computes',
                 composite: 'composites', render: 'renders', beam: 'strokes',
                 project: 'projects', orbit: 'positions' }[m[1]] || 'handles';
  return verb + ' ' + (what || 'the frame');
}

// ────────────────────────────────────────────────────────────────────────── cli
//
//   node tools/decide.mjs --piece apogee.html --symptom "the rim labels clip"
//
// Runs one real triage. Without a key it reports the fallback plainly rather
// than pretending an answer came back.

if (import.meta.url.endsWith(process.argv[1]?.split('/').pop() || '\u0000')) {
  const { args, ART } = await import('./lib.mjs');
  const fs = (await import('fs')).default;
  const path = (await import('path')).default;
  const a = args();
  const piece = a.piece || 'lamplighter.html';
  const symptom = a.symptom || 'a thin diagonal seam crosses the frame';

  const src = fs.readFileSync(path.join(ART, piece), 'utf8');
  const names = [...src.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(m => m[1])
    .filter(n => /^(draw|build|update|composite|render|beam|project|orbit)/.test(n));

  const state = {
    piece,
    symptom,
    seen_on: a.sheet ? 'contact sheet tile' : 'full-size render',
    functions_defined: names.length
  };
  const questions = {
    fn: blameQuestion(names),
    action: triageQuestion(),
    severity: severityQuestion()
  };

  console.log('\n  endpoint ' + endpoint() + '   model ' + model() +
              '   key ' + (configured() ? 'set' : 'NOT set'));
  console.log('  catalog  ' + names.length + ' functions');
  console.log('  symptom  ' + JSON.stringify(symptom));
  console.log('  seen on  ' + state.seen_on);

  const res = await ask(state, questions, {
    fallbacks: { fn: names[0], action: 'render_full_size', severity: 'warning' }
  });

  console.log('\n  source: ' + res.source);
  for (const [q, v] of Object.entries(res.answers)) {
    console.log('    ' + q.padEnd(9) + v.choice +
      (v.probability != null ? '   p=' + Number(v.probability).toFixed(3) : ''));
  }
  if (res.source.startsWith('fallback')) {
    console.log('\n  Those are the configured fallbacks, not Jev\'s answers.');
    console.log('  Set JEV_API_KEY for a live decision.');
  }
  console.log('');
}
