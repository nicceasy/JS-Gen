# Lamplighter — transfer & handoff

Everything needed to pick this up in another repo, in another session, with no
memory of how it was built.

**What it is.** `lamplighter.html` is a single file — one `<canvas>`, one
`<script>`, 59.5 KB — that draws a lighthouse through a 96-second day-and-night
cycle as a three-plate risograph print, with a synthesised soundtrack. There are
no images, no video, no audio files, no fonts and no external references of any
kind. Every pixel and every sample is computed at runtime. A seed decides the
island, the tower, the weather and who is crossing.

Alongside it is the tooling that proves those claims and the loop that makes it
possible to keep improving it: render exact frames, look at them, change one
function, render again.

---

## 0. Inventory

Copy the whole `art/` folder. It is self-contained and has no ties to the repo
it currently lives in.

| path | lines | what it is | required? |
|---|---|---|---|
| `lamplighter.html` | 1508 | the piece. This *is* the deliverable | yes |
| `README.md` | — | user-facing: controls, technique, how to verify | yes |
| `HANDOFF.md` | — | this document | yes |
| `verify.mjs` | 113 | proves the no-media claim; renders frames | yes |
| `package.json` | — | one devDependency, npm script aliases | yes |
| `tools/lib.mjs` | 116 | shared: find Chromium, open a piece offline, parse args | yes |
| `tools/sheet.mjs` | 65 | contact sheet — the tool you will use most | yes |
| `tools/patch.mjs` | 83 | replace one function by name inside the HTML | yes |
| `tools/smoke.mjs` | 75 | runtime test: loop, audio, keys, resize, offline | recommended |
| `tools/audio.mjs` | 86 | proves the synth actually built and is scheduling | recommended |
| `tools/ablate.mjs` | 70 | where the frame time really goes | when optimising |
| `.renders/` | — | tool output. Gitignore it | no |

Add to the destination repo's `.gitignore`:

```
art/.renders/
art/node_modules/
```

The piece itself has **zero** dependencies. Only the tools need node and a
headless browser, and every tool degrades to a clear message instead of a stack
trace when they are missing.

---

## 1. Transfer in five minutes

```bash
# 1. move the folder
cp -r /path/to/old/art  /path/to/new-repo/art
cd /path/to/new-repo/art

# 2. the claim, checked with no dependencies at all — works on any machine
node verify.mjs --scan-only
#   static scan
#     ok   lamplighter.html  (57.5 KB)  no embedded media, no external references
#   (57.5 KB is characters, not bytes — the file is 59.5 KB on disk. The
#    box-drawing characters in the section headers are multi-byte.)

# 3. the tools (one package; browsers are not downloaded)
npm install

# 4. the claim, checked properly: headless, network hard-blocked
npm run verify
#     ok   lamplighter.html  self-audit clean, 1 canvas, 2 body children,
#          off-file requests 0, 5 frames rendered

# 5. it actually runs
npm run smoke
#   ok — loop, audio, keys, resize, offline

# 6. look at it
npm run sheet -- --seed 23 --frames 300,1400,2400,3300,4600,5400
open .renders/sheet.png
```

Then open `lamplighter.html` in a browser and click once for sound.

**If Chromium is not found**, every tool says so and tells you the fix:
`CHROME_PATH=/path/to/chrome npm run verify`. `tools/lib.mjs` already probes
`PLAYWRIGHT_BROWSERS_PATH`, the usual Linux paths and the macOS app bundles.

This exact sequence was run against a clean copy of the folder, on a machine
with no `node_modules` anywhere above it, before this document was written.
Every step above is the real output.

---

## 2. The brief this came from

The request was to make the method described in a write-up of how Kevin Ngo
(@kevin_t_ngo) produces procedural animations actually work. The method,
condensed to the parts that constrain the code:

- A frontier model writes **one self-contained HTML file** containing only a
  canvas and JavaScript. Every visual and most audio is computed per frame.
  No embedded media, no external assets.
- **Seeded randomness**, so a URL parameter like `?f=140&s=5` gives a different
  but related image, and the same parameters always give the same image.
- **Web Audio** writes the soundtrack, synchronised with the visuals.
- Techniques that recur in his posted snippets: colour-separation "plates"
  composited with `globalCompositeOperation = 'multiply'`; helper functions
  like `plate()`, `flood()`, `tint()`, `line()`; layered drawing that mimics
  physical media.
- A **verification step**: ask the file to confirm it contains no base64
  images, no video, no external assets; test it in headless Chrome with the
  network disabled.
- A **vision loop**: render the canvas to an image, look at it, compare it to
  the intent, revise the code, repeat. On his Mona Lisa piece this ran for
  hours.
- A **style library**: keep every small piece so it can be fed back as a
  reference. "A reference of a reference of a reference." Once a visual
  language is locked in, new pieces need far fewer prompts.

The observation that turned out to be load-bearing: *Opus 5 fills the canvas,
frequently includes water, boats or lighthouses, and writes a lot of code, and
the verbosity sometimes produces better artwork than more concise models.* The
subject here leans into that deliberately rather than fighting it.

**What "done" means, concretely.** These are the acceptance criteria.
`verify.mjs` checks 1–3 directly; 4 holds by construction (`det` + `still`);
5 is yours:

1. The file contains no media and no external references.
2. It renders with the network fully blocked and requests nothing.
3. It audits itself and says so out loud.
4. Frames are reproducible: same seed and frame number, same pixels.
5. It looks good.

---

## 3. The one idea that matters

If you keep nothing else from this file, keep this.

A risograph prints one ink at a time onto paper. So the piece holds three
offscreen canvases — blue, fluorescent pink, yellow — each starting white, each
carrying a single ink, and composites them onto the paper colour with
`multiply`:

```js
out.fillStyle = PAPER;                    // #f2ecdd
out.fillRect(0, 0, W, H);
out.globalCompositeOperation = 'multiply';
for (const k of ['b','p','y']) out.drawImage(plate[k].canvas, dx, dy);
```

Overprinting then behaves like a real press: blue over yellow genuinely comes
out green. And it brings one hard consequence:

> **Nothing can ever be lighter than the paper.**

Which means highlights are not painted. They are **knocked out** — white removes
ink and lets the paper show through, because each plate's base is opaque white:

```js
function ink(g, k, a) { g.fillStyle = g.strokeStyle = 'rgba(' + INK[k] + ',' + a + ')'; }
function knock(g, a)  { g.fillStyle = g.strokeStyle = 'rgba(255,255,255,' + a + ')'; }
```

Every star is a hole in the blue plate. So is the moon, the foam on the crests,
the lit face of the beam, the white of the tower. What shows through is paper
tinted by whatever pink and yellow remain, which is why the stars read warm
without anyone painting them warm.

Two corollaries that took a while to internalise:

- **Silhouettes must be opaque, and the plate model makes that a two-step.**
  Knock everything out from under the shape first, then lay down exactly the
  density this plate should carry. `solidPath()` does this. Skipping the knock
  is how the sea shows straight through a rock and you get a glass cliff.
- **Every draw function is called once per plate and decides for itself how
  much of *that* ink it is made of.** The beam reads warm because it subtracts
  blue and adds yellow; the rock reads cold because it is mostly blue. There is
  no colour variable anywhere — colour is an emergent property of per-plate
  densities.

Then, because a real press never lines up, the plates composite about a pixel
out of register, drifting slowly (`REG`, near line 1082).

---

## 4. How the file is laid out

Twelve numbered sections, in draw order. Line numbers are as of this handoff
and will drift — the `// ─── N. name` markers are the durable anchors.

| line | section | what lives there |
|---|---|---|
| 39 | 1. groundwork | URL params, `mulberry32` seeded RNG, value noise + fbm |
| 101 | 2. the plates | ink table, `ink()` / `knock()`, `resize()`, the resolution cap |
| 152 | 3. the world | `buildWorld()` — everything a seed decides, in normalised coords |
| 253 | 4. the day | `SUN_KEYS`, `MOON_KEYS`, `updateSky()` — the colour engine |
| 299 | 5a. sky and its cast | sky gradient, stars, sun, moon, clouds, headland, `solidPath` |
| 462 | 5b. the water | `seaY`, `waveAt`, `drawSea`, `drawGlitter`, `lightPath` |
| 596 | 5c. the tower | `geometry`, `beamLobes`, `wedge`, `drawBeam`, `drawFlare`, `drawTower` |
| 842 | 5d. things that pass by | boats, birds, the squall, the foreground ledge |
| 1033 | 6. the paper | grain tiles, per-plate mottle, `composite()`, registration, vignette |
| 1110 | 7. a frame | `render(T)` — the whole draw order, three times |
| 1156 | 8. overlay | title card and HUD (suppressed in `?still=1`) |
| 1207 | 9. audio | drone, surf, wind, FM bell, foghorn, lookahead scheduler |
| 1369 | 10. capture | `MediaRecorder` webm + PNG still |
| 1407 | 11. the purity check | the file auditing itself |
| 1441 | 12. the loop | rAF tick, adaptive quality, keys, the `window.artPiece` door |

### The colour engine, because it explains the rest

One number runs the entire palette: the **altitude of the sun**, a keyframed
curve over the 96-second cycle.

```js
var alt    = curve(SUN_KEYS, u);                        // ~ +0.30 .. -1.00
var golden = Math.exp(-Math.pow(alt / 0.30, 2));        // peaks as it touches the water
var night  = clamp(-alt / 0.42, 0, 1);
var blue   = clamp((0.16 - alt) / 0.36, 0, 1) * (1 - night * 0.55);   // the blue hour
```

Everything downstream is a function of those four: sky ink density at the top
and at the horizon, sea density, whether there are stars, how much the lamp
matters (`sky.lamp`), how gold the reflection path is. Want a colder night or a
longer golden hour? Change `updateSky()` and the whole piece moves together.
That single point of control is the reason the day cycle looks coherent.

### The beam, because it is the trick people ask about

Any horizontal ray leaving the lamp converges on a point on the horizon. So
while a lobe travels **away**, it is drawn toward that vanishing point; as it
swings **back toward the viewer** it opens into a broad cone and finally a flare
in the lens. `beamLobes()` computes both lobes and an `away` factor, and
`drawBeam` / `drawFlare` crossfade between them. The away lobe is drawn *before*
the tower so the tower occludes it; the near lobe is drawn *after*, because
light coming at you passes in front of everything.

---

## 5. The piece contract

Every piece in `art/` exposes the same door, so the tools never need to know
which piece they are driving. Any new piece must implement this or the tooling
will not touch it.

```js
window.artReady === true          // set once the first frame has been drawn
window.artPiece = {
  frame(n),                       // render frame n exactly, then stop. deterministic
  seed(s),                        // rebuild the world on seed s
  purity(),                       // {bytes, clean, found[], canvases, elements}
  info()                          // {seed, w, h, loop, quality, t}
}
```

URL parameters:

| param | effect |
|---|---|
| `?s=5` | seed. Omitted, it is random |
| `?f=140` | start frame |
| `?still=1` | render exactly one frame and stop. **Also suppresses the HUD** |
| `?det=1` | advance a fixed 1/60 s per frame instead of wall clock |

`det` + `still` are what make a look-and-revise loop possible: frame 1800 is
always the same pixels, on any machine, at any speed. Tools always pass both.

Keys: click/space sound · `n` new seed · `p` pause · `[` `]` scrub 3 s ·
`r` record webm · `c` save PNG · `f` fullscreen.

---

## 6. The development loop that worked

```
patch one function  →  render frames  →  look at them  →  decide  →  repeat
```

**Do not edit this file line by line.** It is 1500 lines of JavaScript inside
one HTML file, and the unit of change that matters is the function: "make the
sea stop looking like corduroy" is one function. Line-based edits at this size
are how you end up with two definitions of `drawSea` and no idea which one runs.

Write a patch script instead. This is the pattern used for every change here:

```js
// fix-sea.mjs
import fs from 'fs';
import { replaceFn } from './tools/patch.mjs';

let src = fs.readFileSync('lamplighter.html', 'utf8');
src = replaceFn(src, 'drawSea', `
function drawSea(g, k, T) {
  ...whole new body...
}`);
src = replaceFn(src, 'waveAt', `...`);
fs.writeFileSync('lamplighter.html', src);
```

```bash
node fix-sea.mjs
node verify.mjs --scan-only            # syntax + purity in one shot
npm run sheet -- --seed 7 --frames 200,1300,2600,4400
```

Then **look at the sheet**. Six frames across the cycle catches what one
screenshot never will.

One caution, learned by being fooled by it: read the contact sheet for
composition, colour and gross error. Tiling shrinks each frame and hides exactly
the pixel-level artefacts you most want to catch — the rain in this piece was
declared missing twice before a full-size render showed it was there all along.
Confirm anything suspicious at full size (`verify.mjs` writes full-size frames
to `.renders/`).

For a syntax check without a browser:

```bash
node -e "const fs=require('fs');fs.writeFileSync('/tmp/x.js',
  fs.readFileSync('lamplighter.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])" \
  && node --check /tmp/x.js
```

---

## 7. Chronology: prompt to result

What actually happened, in order, so the shape of the work is visible.

**Pass 0 — read the brief, pick the subject.** Chose a lighthouse at sea
deliberately: the source document notes that Opus 5 gravitates to water, boats
and lighthouses, and leaning into the house style beats fighting it. Decided on
three-plate riso up front, because the `multiply` note in the brief is the one
technical detail with real consequences.

**Pass 1 — write it whole.** ~1420 lines in one go: plates, seeded world, day
curve, sky, sea, tower, beam, boats, birds, squall, foreground, grain,
compositing, audio, capture, purity check, main loop. Syntax-checked by
extracting the script and running `node --check`.

**Pass 2 — first look, headless.** Rendered eight frames across the cycle.
Verdict: the tower, moon, grain and sky were good; the rock and the foreground
ledge were **translucent slabs** you could see the sea through; the sea was
**corduroy**; the beam had knife edges; 107 ms/frame.

**Pass 3 — opacity and shape.** Added `solidPath()` (knock, then ink) and
applied it to the rock, the ledge and the tower body. Reshaped the rock to close
at a waterline just below the horizon instead of running to the bottom of the
frame — that single change turned a glass pillar into an island. Reshaped the
ledge into a rake that exits the bottom of the frame so it has no cliff edge.
Widened the golden-hour falloff, which had been so narrow the sunsets were grey.

**Pass 4 — profile, and be wrong about it.** Per-function timing said
`composite` cost 96 ms of a 102 ms frame. False — see §8. Rebuilt as an
ablation harness, which gave a real ranking and became `tools/ablate.mjs`.

**Pass 5 — the sea, twice.** First attempt at breaking up the crest lines
produced *confetti*: uniform white sticks scattered everywhere. Fixed the
density and length variance, and got **basketweave** instead. That one was a
genuine bug: the wave function's wavelengths were shorter than the sampling
step, so the swell was aliasing. Rewrote `waveAt()` so every wavelength stays
several samples long at the step `drawSea()` uses, and made the chop advance by
a noise-driven variable gap instead of a fixed grid.

**Pass 6 — light and weather.** Replaced the beam's two hard-edged passes with
five nested cones of equal weight, which accumulate into a soft falloff. Made
the near lobe draw after the tower. Cut the lens flare spikes, which were
crossing half the frame. Made the daytime water read — its ripples were white
knockouts, invisible on a pale sea, so the chop now switches to darker ink when
`night` is low. Strengthened the squall until it actually showed.

**Pass 7 — prove it.** Ran a live smoke test: rAF loop advancing, audio graph,
keyboard, mid-flight resize, zero network requests. Probed the Web Audio graph
to confirm the drone, surf and wind start and that bells and the foghorn
schedule. Suppressed the HUD in `?still=1` after finding it baked into a render.

**Pass 8 — transfer.** Added the `window.artPiece` contract, moved the ad-hoc
scratch scripts into `tools/`, added `package.json`, and re-ran everything
against a clean copy of the folder with no `node_modules` above it.

---

## 8. Every bug, and what it taught

The most valuable section. Most of these will bite again.

### 1. Translucent silhouettes — "the glass cliff"

A rock filled at 0.8 alpha on blue, 0.5 on pink and 0.25 on yellow composites to
a dark shape *and lets the sea show through it*, because multiply never hides
what is behind. Alpha is not occlusion in this model.

**Fix:** `solidPath()` — knock to white at alpha 1, then fill the intended
density. **Lesson:** in a multiply pipeline, opacity is always two operations.

### 2. Aliased waves — "the basketweave"

`waveAt()` had components with ~15 px wavelengths while `drawSea()` sampled
every 33 px. Classic undersampling: the polylines beat against each other into a
plaid. It read as a texture bug, so the first two attempts to fix it were
cosmetic and failed.

**Fix:** wavelengths that scale with distance and stay ≥ 5 samples long at the
step in use. **Lesson:** when procedural texture looks *woven*, suspect the
sampling rate before the artistic parameters.

### 3. The profiler that lied

Wrapping each draw call in `performance.now()` reported `composite` at 96 ms of
a 102 ms frame. Canvas work is **deferred**: calls queue and only rasterise when
something forces a flush. `composite()` was the first thing to touch the plates,
so it was charged for everyone else's work.

Forcing a flush with `getImageData(0,0,1,1)` after each call only half-fixed it
— it flushed one plate, so the other two still leaked into `composite`.

**Fix:** ablation. Skip one call, measure the whole frame, take the difference.
Now `tools/ablate.mjs`. **Lesson:** never trust a canvas profiler that has not
been forced to synchronise, and prefer ablation to instrumentation.

### 4. The apostrophe that ate the file

The function-replacing patch script had a brace matcher that tracked string
literals. A comment reading `minus the gold it can't hold` opened a string that
never closed, so the matcher swallowed the rest of the file. It failed loudly
by luck, having found no closing brace; had the file contained one more
apostrophe it would have *silently deleted everything between them*.

**Fix:** the matcher in `tools/patch.mjs` understands `//`, `/* */`, `'`, `"`
and backticks. **Lesson:** a brace matcher that does not understand comments is
a file shredder with a delay fuse.

### 5. Invisible rain, twice

The squall was declared broken twice. It was rendering correctly both times —
fine diagonal hatching just does not survive being shrunk into a contact-sheet
tile. Before "fixing" it, `world.squall` was dumped to check the window was even
open (it was), and then a full-size render showed the rain plainly.

**Lesson:** verify the parameters before changing the code, and check at full
size before concluding something is missing.

### 6. The Web Audio probe that saw nothing

Instrumenting `AudioContext.prototype` tallied one method. `createGain`,
`createOscillator` and nearly everything else live on **`BaseAudioContext`**.
The engine looked dead; it was fine.

Then, with the probe fixed, zero bells fired in four seconds — also fine: note
density is driven by darkness, and the probe was running at dusk where the
chance is ~10 % on alternate steps. Probing at night (`--at 2400`) showed bells
and a foghorn.

**Lesson:** walk the prototype chain, and know your system's own probability
model before calling silence a bug. Both are baked into `tools/audio.mjs`.

### 7. Chrome in the render

`?still=1` renders came out with the HUD text baked into the bottom-left,
because `sess` (the session clock that fades the HUD) never advances when frames
are driven directly.

**Fix:** `overlay()` returns immediately under `STILL`. **Lesson:** a capture
mode needs to suppress UI explicitly; it will not fall out of the timing.

---

## 9. Performance: measured, inferred, unknown

**Measured, headless (1280×800, software rasterisation):** ~94 ms/frame at
`quality: 1`. Ablation ranking at a night frame:

```
composite   91.0     <- the flush, not the blend. See §8.3
drawSea     14.3
drawFlare   10.5
drawSky      6.5
drawBeam     5.9
drawClouds   4.3
drawLedge    3.8
...everything else under 4
```

**Inferred:** headless Chromium here runs software rasterisation via SwiftShader,
roughly an order of magnitude slower than a GPU-backed canvas. A micro-benchmark
of the composite's own operations — three `multiply` `drawImage`s, a pattern
fill and a vignette — totalled ~12 ms of that, and those are precisely the
operations a GPU makes nearly free.

**Unknown, and stated plainly: real-world frame rate has not been verified.**
There is no GPU in this environment. On a normal machine this is expected to sit
comfortably at 60 fps, but that is an expectation, not a measurement. **First
thing to do on a machine with a display: open it and watch.**

**The safety net.** `tick()` keeps a rolling average of frame cost and steps
`quality` between 1, 0.75 and 0.5, which scales sea row counts and light-path
density. It engaged in headless (dropping to 0.5) exactly as designed. Internal
resolution is also capped at 2.4 M pixels (`cap`, line 137) so three full-size
plates stay affordable on retina displays.

If you optimise, in order of value:
1. `drawSea` — row count is the lever, in `rows` at line 503.
2. `drawFlare` / `drawBeam` — the near cone is five large gradient fills per
   plate; three would probably do.
3. `drawSky` — two full-screen gradient fills per plate. Cacheable, since the
   sky changes slowly. Highest complexity, lowest certainty.

---

## 10. Known limitations

Honest list. None of these are hidden by the tests.

- **Only the sky loops.** `updateSky` wraps at 96 s, but the beam period
  (7.5–10.5 s, seeded) and the boat crossings do not divide it, so the piece
  never repeats exactly. Intentional for viewing, wrong if you want a seamless
  loop for a GIF — for that, make `beamPeriod` and boat speeds divide `LOOP`.
- **The foghorn is not synced to the beam.** It fires every 34 scheduler steps
  (17 s) while the beam sweeps on its own seeded period. They drift against each
  other. The source method emphasises audio/visual sync; the bells do sync (each
  one rings the water via `pulses`), the horn does not. This is the most
  obviously unfinished thing in the piece.
- **Recording is wired but untested.** `r` builds a `MediaRecorder` from
  `captureStream(60)` plus the audio destination. It cannot be exercised
  headless without a display. Assume it needs a pass.
- **Seed variance is uneven.** Some seeds produce a beautifully stepped rock;
  others a smooth dome, when the fbm that cuts ledges happens to stay flat.
  Cloud bands occasionally align into a single streak. Nothing is broken, but
  roughly one seed in five is noticeably weaker than seed 7 or 23.
- **The near beam cone shows faint banding** where the five nested cones
  overlap. Reads acceptably as light shafts; more cones or a per-slice Gaussian
  weight would remove it.
- **`verify.mjs` scans every `.html` file in the folder.** Dropping an unrelated
  HTML file into `art/` will make it try to boot it as a piece and fail on
  `window.artReady`.
- **Mobile is untested.** The layout is resolution-independent and pointer
  events work, but no touch device has seen it.

---

## 11. Next steps, ranked

**1. Watch it on a real display.** Everything above is headless. Open it, let a
full 96-second cycle run, listen to the audio for a minute. Nothing else should
happen before this. *First move:* `open art/lamplighter.html`, click, wait.

**2. Sync the foghorn to the beam.** The clearest gap against the brief. The
horn should sound as a lobe swings through the viewer, not on a step counter.
*First move:* `beamLobes()` already computes a `flare` term that peaks when a
lobe points at the camera; publish that to the audio scheduler the same way
bells publish to `pulses`, and trigger the horn on a rising edge with a minimum
interval.

**3. Build the vision loop properly.** This is the part of the source method not
yet implemented. Everything needed exists: deterministic frames, headless
render, a self-audit. *First move:* a `tools/look.mjs` that renders N frames,
hands them to a model with the intent ("this should read as a risograph print;
what is wrong with it?"), and prints the critique next to the frame paths. Then
close the loop by letting it write patch scripts against `tools/patch.mjs`.

**4. Make a second piece and start the style library.** The method's real payoff
is reuse — a visual language, referenced forward. *First move:* copy
`lamplighter.html`, keep sections 1, 2, 6 and 12 verbatim (groundwork, plates,
paper, loop — the riso engine), throw away the scene, write a new one. Resist
extracting a shared `riso.js`: the single-file constraint is the point, and
copy-paste is the correct form of reuse here. The contract in §5 means the
tooling works on the new piece the moment it sets `window.artReady`.

**5. Even out seed quality.** Render a sheet of 12 seeds, find the weak ones,
tighten the generators that produce them. *First move:*
`for s in 1 2 3 ... ; do npm run sheet -- --seed $s --frames 1300; done`, then
look at the rock and cloud generators in `buildWorld()`.

**6. Exercise recording.** Confirm `r` produces a playable webm with audio, then
consider an offline exporter: `?det=1` plus frame-by-frame PNG capture piped to
ffmpeg gives a perfect-cadence video that a real-time recorder cannot.

**7. Optimise, if and only if §11.1 says it needs it.** See §9 for the order.

---

## 12. Cheat sheet

```bash
node verify.mjs --scan-only                 # no deps; purity scan only
npm run verify                              # + headless render, network blocked
npm run verify -- --seed 23 --frames 0,2600 # pick seed and frames
npm run sheet  -- --seed 7 --cols 3         # contact sheet -> .renders/sheet.png
npm run smoke                               # live loop, audio, keys, resize
npm run audio  -- --at 2400 --seconds 19    # audio graph; probe at NIGHT
npm run ablate -- --frame 1800              # where the frame time goes
node tools/patch.mjs lamplighter.html drawSea /tmp/new.js
CHROME_PATH=/path/to/chrome npm run verify  # if Chromium is not auto-found
```

**Tuning knobs**, with the line they live on:

| what | where |
|---|---|
| cycle length (96 s) | `LOOP`, line 47 |
| ink colours | `INK`, line 111 |
| paper colour | `PAPER`, line 116 |
| plate misregistration | `REG`, line 1082 |
| resolution cap | `cap`, line 137 |
| the entire palette | `updateSky()`, line 270 |
| sun/moon paths | `SUN_KEYS` / `MOON_KEYS`, line 259 |
| what a seed decides | `buildWorld()`, line 159 |
| draw order | `render()`, line 1112 |
| horizon height | `HZ` in `resize()`, line 146 |
| note density, scale, foghorn interval | section 9, line 1207 |

**If something looks wrong, in this order:** dump the parameters before touching
the code (§8.5) → check at full size, not on a contact sheet → check the
sampling rate before the art direction (§8.2) → check whether it is an occlusion
problem rather than an alpha one (§8.1).
