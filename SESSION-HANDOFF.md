# Session handoff — JS-Gen

Everything this session established, in the order a fresh session needs it.
Written to be picked up cold, locally, with no memory of how any of it happened.

Branch: **`claude/js-generation-repo-x5s2gg`** (the only branch — there is no `main`).
Head at time of writing: `0503ae5`.

---

## 0. Get it running in ninety seconds

The pieces are single self-contained HTML files with **zero dependencies**. You do
not need node, a server, or an API key to look at them.

```bash
git clone https://github.com/nicceasy/JS-Gen.git
cd JS-Gen/art
open apogee.html          # macOS;  `start` on Windows,  `xdg-open` on Linux
```

Click once for sound. The three pieces are `apogee.html`, `parallax.html`,
`lamplighter.html`.

This local copy is also the only one where `r` (record webm) and `c` (save a
still) work — the published artifact copies have capture stubbed out because the
viewer sandbox cannot hand you a file.

The tooling needs node ≥18 and a Chromium already on the machine:

```bash
cd art && npm install     # one package: playwright-core. It does NOT download a browser.
npm run verify            # all three pieces: purity, offline, determinism
npm run smoke -- --piece apogee.html
npm run sheet -- --piece apogee.html --seed 7 --frames 0,1200,2400,3600,4800
```

If Chromium is not found, every tool says so: `CHROME_PATH=/path/to/chrome npm run verify`.

**Published artifacts** (private to the publishing account; sign in as the same
account at claude.ai/code/artifacts if they do not appear):

- Apogee — https://claude.ai/artifact/Uis2z2iRFUgcMRd11wdTKi
- Parallax — https://claude.ai/artifact/YPD1jzxpw84U7BXAHcxJou

---

## 1. What is in the repo

```
art/
  lamplighter.html        the first piece (came with the brief; not written here)
  parallax.html           written this session
  apogee.html             written this session
  README.md               folder-level: all three pieces, how to verify
  HANDOFF-lamplighter.md  per-piece deep handoffs. §3 of each is the short version
  HANDOFF-parallax.md
  HANDOFF-apogee.md
  verify.mjs              purity scan, headless render, determinism check
  package.json            one devDependency: playwright-core
  tools/
    lib.mjs               find Chromium, open a piece offline, parse args
    sheet.mjs             contact sheet — the tool you will use most
    patch.mjs             replace one function by name inside the HTML
    smoke.mjs             loop, audio, keys, pointer, resize, offline
    audio.mjs             proves the synth built and is scheduling
    ablate.mjs            where the frame time really goes
    look.mjs              the vision loop (stage 1: a vision model)     [UNTESTED LIVE]
    decide.mjs            TypeSafe Jev client (stage 2: triage)         [UNTESTED LIVE]
```

Everything verifies clean:

```
ok   apogee.html       self-audit clean, 1 canvas, 2 body children, off-file requests 0, determinism ok
ok   lamplighter.html  ...
ok   parallax.html     ...
all pieces verified
```

---

## 2. The one idea the series is built on

Three pieces, three optical constraints. They are the same architecture — three
channels, per-channel densities, **no colour variable anywhere**, one scalar
driving the whole image — under a different physical rule each time. §3 of each
handoff is the long version.

| piece | composites | the constraint | so |
|---|---|---|---|
| Lamplighter | three inks, `multiply`, onto paper | nothing can be **lighter** than the paper | highlights are knocked out |
| Parallax | three channels, `lighter`, onto the void | nothing can be **darker** than the void | shadows are subtracted |
| Apogee | three guns, one beam, a vector tube | nothing can be **filled** | brightness is dwell time |

**The rule for a fourth piece: pick the constraint first.** Everything good in
these fell out of a physical rule taken seriously, not from a feature list.

Two consequences worth carrying forward because they were the best moments:

- **Parallax's infrared flip.** Dust occludes in the optical and *emits* in the
  infrared. A lane that is an absence becomes the brightest thing in the frame,
  and it costs two lines — because there is no colour anywhere to keep in sync.
- **Apogee's apogee.** Orbits are sampled in equal *time*, not equal angle, so
  samples crowd where a craft is slow. The display blooms at apogee and the sport
  is named for it. Nobody wrote a brightness term; it falls out of doing Kepler
  properly and letting the beam model do what beams do.

---

## 3. The piece contract

Every piece exposes the same door, so the tools never need to know which one they
are driving.

```js
window.artReady === true
window.artPiece = {
  frame(n),                  // render frame n exactly, then stop. deterministic
  seed(s),                   // rebuild on seed s
  purity(),                  // {bytes, clean, found[], canvases, elements}
  info(),                    // {seed, w, h, loop, quality, t, ...}
  view(a, b, c)              // optional: pin the canonical camera
}
```

`frame(n)` **must reset the camera and clear any lock**. On an interactive piece
a deterministic entry point that inherits interaction state is not deterministic.
`verify.mjs` checks this by re-rendering every frame in the opposite order and
comparing bytes.

URL params: `?s=` seed · `?f=` frame · `?still=1` (one frame, no chrome) ·
`?det=1` (fixed 1/60 s per frame).

**Do not add a debug hook for the profiler.** See §5.1.

---

## 4. The development loop

```
patch one function → render frames → look at them → decide → repeat
```

Never edit a piece line by line. It is ~2000 lines inside one HTML file and the
unit of change is the function. Write a patch script:

```js
import fs from 'fs';
import { replaceFn } from './tools/patch.mjs';
let src = fs.readFileSync('apogee.html', 'utf8');
src = replaceFn(src, 'drawField', `function drawField(g, k, T) { ... }`);
fs.writeFileSync('apogee.html', src);
```

Then `node verify.mjs --scan-only`, then a sheet, then **look at it**.

### If something looks wrong, in this order

1. **Check at full size, not on a contact sheet.** (§5.2 — this is the big one.)
2. Dump the parameters before touching the code.
3. Check whether the units are physically sane.
4. Check every camera angle.
5. Check whether it is an occlusion problem rather than an alpha one.

---

## 5. Everything that went wrong, and what it taught

The most valuable section. Most of these will bite again.

### 5.1 Ask for the existing implementation before rebuilding from a description

The tooling described in Lamplighter's handoff did not arrive with it, so it was
rebuilt from the prose — about 770 lines. The real folder turned up later, and on
**every** point of difference the original was better:

- `playwright-core`, not `playwright` — never tries to download a browser
- `--force-color-profile=srgb` on launch, without which rendered frames differ
  between machines and a determinism check is meaningless
- `verify.mjs` imports nothing, so `--scan-only` really does run anywhere, and it
  *skips* the render pass rather than failing when there is no browser
- `ablate.mjs` rewrites `render()`'s call sites into a temp copy of the file, so
  it needs **nothing** from the piece

That last one cost real work. Parallax had grown a `__passes` table and a `PASS.`
dispatch in `render()` purely so a hand-rolled ablate could swap a pass for a
no-op. The hook and the handoff lesson written about it were both answers to a
problem that existed only because the tool had not been asked for. Both were
removed.

> **A spec tells you what a tool does. It does not tell you what it learned.**

### 5.2 The contact sheet lies, and knowing that is not enough

The first look at Parallax said "glowing smear, no structure, dust not working."
All false — the full-size render showed the FUI legible, the dust subtracting and
the stars resolving. Tiling six 1280×800 frames into 520 px cells throws away
exactly the spatial frequency that dust lanes and thin lines live at.

Lamplighter's handoff **warns about this in writing** and it still happened on the
first look. The warning is not enough.

> Read a sheet for composition, colour and gross error. Every other question goes
> to a full-size render.

### 5.3 A compromise view can lose both ways

Apogee's globe view had no craft in it (they are on cislunar ellipses and spend
almost all their time off-screen). The obvious fix — split the difference at an
intermediate zoom — was worse than either end: Earth too small to read, orbits
still off-screen, craft floating as unconnected dashes.

Committing to the globe and solving the off-screen problem properly (bearing
chevrons on the rim, with number and range) beat compromising between two good
views.

### 5.4 Scale discipline, twice

Parallax rendered globular clusters at over a kiloparsec across; real ones are
about 30 parsecs. Apogee authored a gate hoop at 0.34 Earth radii sitting 1.28 Re
out, which read as a second planet. Both were invisible face-on and unmissable
from an angle nobody had looked at yet.

> When the units are real, check the numbers against reality — and check every
> camera angle, because a wrong scale hides behind a viewpoint.

### 5.5 Eight hundred gradients

`createRadialGradient` per dust clump per channel is ~800 gradient objects per
frame. Caught before the first render only because Lamplighter's handoff ranked
gradients as the most expensive thing on a canvas.

> Anything identical across all three channels should be painted once into a mask
> and composited three times. Occlusion qualifies by definition.

### 5.6 `destination-out` is not the subtraction you want

On a canvas created with `{alpha: false}` its behaviour is muddy. `multiply`
toward black is exactly `dst * (1 - a)`, well defined on an opaque canvas, and
faster.

### 5.7 Convergence is a defect on an additive display

Six meridians drawn to ±90° converge on one pixel and render as a bright artefact
sitting on the pole. Real globe plots stop short. Meridians now run to ±76°.

### 5.8 Two craft wearing 54

`no: ri(2, 97)` per craft, independently. Two of six collided. A leaderboard with
a duplicate number quietly tells you the whole board is decorative. Draw from a
pool without replacement.

---

## 6. The Jev / json-render research

### 6.1 What json-render is

`nicceasy/json-render` is a fork of Vercel Labs' Generative UI framework: AI emits
**schema-constrained JSON over a component catalog you define**, streamed and
rendered progressively.

**The obvious lesson does not transfer.** You cannot express "brightness is dwell
time" as a catalog of components; generating these pieces that way produces
generic output. Three non-obvious ones do:

1. **Constrain output to a catalog you control.** For us the catalog is not
   invented — it is the set of functions actually defined in the piece, read out
   of the file.
2. **Validate structurally with machine-readable codes.** Their
   `packages/core/src/spec-validator.ts` returns `{severity, code, message}`, not
   a boolean. "The model returned JSON" ≠ "the model returned something true."
3. **Refine by patch, not regeneration.** Which is what `tools/patch.mjs` already
   does, arrived at independently.

Their `AGENTS.md` also passes plain string model ids through a gateway rather than
importing a provider constructor. Worth copying.

### 6.2 What Jev actually is

**Not a text model and not a vision model.** A System One structured-decision
model from TypeSafe. You hand it app state plus typed questions; it returns a
typed answer per question with a probability. No prose, no JSON prompting, nothing
to parse.

Wire format, confirmed from `prismhq/jev-router` (TypeSafe's own example):

```
POST https://api.typesafe.ai/v1/systemone
{ "state": {...},
  "model": "jev-latest",
  "questions": { "<name>": { "type": "choice",
                             "instructions": "...",
                             "criteria": { "<option>": "<description>" } } } }
→ { "answers": { "<name>": { "choice": "<option>", ... } } }
```

$0.042/M input, **output tokens free**, 70–500 ms, 32K context. Also reachable as
`typesafe/jev-1.13` or `typesafe/jev-latest` on OpenRouter. Released 2026-09-18,
in beta.

**It does not take images.** jev-router reduces an image to the literal string
`"[image]"` plus a boolean signal before asking.

### 6.3 json-render's own Jev integration

`apps/web/lib/jev/` plus `experimental_composeSpec` in core. The contract, from
`skills/core/SKILL.md`:

> Jev chooses elements and parent slots, never free-form text or code. It never
> executes actions.

You supply **candidates** — `{ id, description, element: {type, props}, root?,
maxUses?, resource? }` — configured component instances, not page templates. Jev
answers `root` / `select_*` / `parent_*` / `order_*`. A custom evaluator implements
`Experimental_CompositionEvaluator`: accept `{state, questions, signal}`, return
`{answers: {[q]: {choice, confidence?}}, usage?}`. Gateway model id is
`typesafe-ai/jev`; defaults are 32 evaluations, depth 8, 10 s timeout.

### 6.4 Where it fits here, and why

Two stages, because they are two different jobs:

| stage | model | when | question |
|---|---|---|---|
| 1 | a vision model | once per frame batch, expensive | *what do you see?* → free-form symptoms |
| 2 | **Jev** | once per finding, ~free | *so what do we do?* → typed choice + probability |

The volume is all in stage 2, which is where free output tokens and sub-500 ms
compound. But the **better reason is structural, not economic**:

`look.mjs` has a `verdict()` check whose main job is catching a vision model
blaming `drawOcean` in a piece with no `drawOcean`. Jev's `criteria` map removes
the possibility — the answer is a key of the map you supplied, so an out-of-catalog
answer is not something to validate, it is something that cannot be represented.

> That is json-render's thesis pushed down a layer: from *validate the output* to
> *make the wrong output unrepresentable*.

`decide.mjs`'s triage question encodes the debug order from §4 directly:
`act_now | render_full_size | dump_parameters | defer | reject`.

### 6.5 Where the speed actually is

Be honest about the loop before optimising it:

- **Writing a piece** — one long creative generation. A cheaper model makes this
  *worse*, not faster. Do not move this.
- **Rendering frames** — ~10 s. Not the bottleneck.
- **Looking and deciding** — the serial bottleneck, and the part both piece
  handoffs list as unimplemented. **This is the only place a fast model pays.**
- **Patching** — fast.

---

## 7. Blockers carried into the new session

1. **`openrouter.ai` and `api.typesafe.ai` are both 403** from the remote
   container's egress proxy (`connect_rejected`, policy denial — confirmed at the
   proxy's own status endpoint). So `look.mjs` and `decide.mjs` have **never run
   live**. Everything about them is built and offline-tested only. Locally this
   restriction disappears — that is the single biggest reason to move.
2. **The artifact wake subscription will not mint** (`mint_failed`, retried). This
   session was never watching either artifact, so comments on the artifact pages
   do not reach it.
3. **There is no `main` branch.** The repo front page shows nothing; everything is
   on `claude/js-generation-repo-x5s2gg`.
4. **Real-world frame rate is unverified for all three pieces.** No GPU in the
   container. Headless numbers are software rasterisation via SwiftShader, roughly
   an order of magnitude slow. **Open them on a real display first.**

---

## 8. Skills, and why `/jev` did not work

Skills are discovered from `~/.claude/skills/<name>/SKILL.md` and
`<repo>/.claude/skills/<name>/SKILL.md`, **at session start**.

- `~/.claude/skills/` exists in the container and does sync (it held
  `session-start-hook` and `synced`), so user-level skills do reach a remote session.
- `JS-Gen` has **no `.claude/skills/` directory at all**.
- There is no `jev` SKILL.md anywhere, which is why `/jev` was not invocable.
- `json-render/skills/` has 30+ SKILL.md files but they sit at `skills/<name>/`,
  not `.claude/skills/<name>/`, so they are documentation, not invocable skills.

A registered skill is not required to use one: any SKILL.md can be read and
followed directly.

**Not yet written, and worth doing first thing:** `.claude/skills/jev/SKILL.md`
covering §6.2–6.4 — the System One wire format, the criteria-map guardrail, and
the `composeSpec` candidate pattern. It was offered and not yet built.

---

## 9. Unfinished work, ranked

1. **Open all three pieces on a real display.** Everything above is headless.
   Nothing else should happen first.
2. **Run `look.mjs` and `decide.mjs` live**, which is now possible.
   ```bash
   export LOOK_BASE_URL=https://openrouter.ai/api/v1
   export LOOK_MODEL=<a vision model>   LOOK_API_KEY=sk-or-...
   export JEV_MODEL=jev-latest          JEV_API_KEY=...
   npm run look -- --piece apogee.html --views wide,edge
   ```
   Keys are env-only; `.env` is gitignored. **Never commit either.**
3. **Calibrate Jev's probability.** Is it trustworthy enough to gate on — e.g.
   `p < 0.6` forces `render_full_size`? That is a couple of hours locally and it
   decides whether the triage stage can run unattended.
4. **Write the jev skill** (§8).
5. **BASIS — the fourth piece.** Started but not written. Design settled:
   a signal-analysis console, one dataset shown under six transformations (time,
   window, spectrum, spectrogram, delay embedding, correlation matrix) with a
   **single linked cursor** across all panels, and the window-length/frequency-
   resolution trade-off made draggable. The `dataviz` skill applies and its
   palette is already validated:
   - 4 categorical channels on dark: `#3987e5 #d95926 #199e70 #c98500` — all six
     checks PASS, adjacent pairlist, worst CVD ΔE 8.4
   - the phase-space panel is a scatter form, so it uses the **all-pairs** list,
     which caps at three slots — it shows one channel at a time instead
   - sequential (spectrogram) = one blue hue; diverging (correlation) = blue↔red
     with a grey midpoint
   Layout intended as a **catalog + spec**, so `experimental_composeSpec`-style
   composition can choose the panels.
6. **Push a `main`** so the repo front page shows something.
7. **Per-piece leftovers** are in each `HANDOFF-*.md` §9/§11: cache Apogee's
   nothing / Parallax's dust mask (~14 ms of pure waste per frame), referee
   Apogee's gates properly, even out Parallax's catalogue distribution.

---

## 10. Cheat sheet

```bash
node verify.mjs --scan-only                      # no deps at all
npm run verify                                   # all pieces + determinism
npm run sheet  -- --piece apogee.html --seed 7 --frames 0,1200,2400,3600,4800
npm run smoke  -- --piece apogee.html
npm run audio  -- --piece apogee.html --at 1800 --seconds 12
npm run ablate -- --piece apogee.html --frame 1200
npm run look   -- --piece apogee.html --dry      # builds request, tests guardrail offline
npm run decide -- --piece apogee.html --symptom "..." --sheet
node tools/patch.mjs apogee.html drawField /tmp/new.js
CHROME_PATH=/path/to/chrome npm run verify
```

Every tool takes `--piece` and defaults to `lamplighter.html`. `verify.mjs` covers
every `.html` in the folder in one run — which also means dropping an unrelated
HTML file into `art/` will make it try to boot that as a piece and hang on
`window.artReady`.
