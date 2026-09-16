# Parallax — transfer & handoff

Everything needed to pick this up in another repo, in another session, with no
memory of how it was built.

**What it is.** `parallax.html` is a single file — one `<canvas>`, one
`<script>`, 86 KB — that draws the Milky Way as a galactic survey console and
sweeps it through the electromagnetic spectrum over 96 seconds. There are no
images, no video, no audio files, no fonts and no external references of any
kind. Every pixel and every sample is computed at runtime. It is interactive:
drag to orbit, scroll to zoom, click a contact to interrogate it.

It is the second piece in `art/`, and it was built from the method and the
tooling contract established by the first (`lamplighter.html`). It deliberately
does **not** copy that piece's optical model. See §3.

---

## 0. Inventory

Copy the whole `art/` folder. It is self-contained.

| path | lines | what it is | required? |
|---|---|---|---|
| `parallax.html` | 2268 | the piece. This *is* the deliverable | yes |
| `README.md` | — | user-facing: controls, technique, how to verify | yes |
| `HANDOFF.md` | — | this document | yes |
| `verify.mjs` | 120 | proves the no-media claim; renders frames; checks determinism | yes |
| `package.json` | — | one devDependency, npm script aliases | yes |
| `tools/lib.mjs` | 172 | shared: find Chromium, open a piece offline, parse args | yes |
| `tools/sheet.mjs` | 92 | contact sheet — the tool you will use most | yes |
| `tools/patch.mjs` | 118 | replace one function by name inside the HTML | yes |
| `tools/smoke.mjs` | 104 | runtime test: loop, audio, keys, resize, interaction, offline | recommended |
| `tools/audio.mjs` | 98 | proves the synth actually built and is scheduling | recommended |
| `tools/ablate.mjs` | 74 | where the frame time really goes | when optimising |
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
cp -r /path/to/old/art  /path/to/new-repo/art
cd /path/to/new-repo/art

node verify.mjs --scan-only     # no dependencies at all
npm install                     # one package; browsers are not downloaded
npm run verify                  # headless, network hard-blocked, determinism checked
npm run smoke                   # it actually runs
npm run sheet -- --seed 23 --frames 0,720,1440,2160,2880,4320
```

Then open `parallax.html` in a browser and click once for sound.

**If Chromium is not found**, every tool says so and tells you the fix:
`CHROME_PATH=/path/to/chrome npm run verify`. `tools/lib.mjs` probes
`PLAYWRIGHT_BROWSERS_PATH`, the usual Linux paths and the macOS app bundles.

---

## 2. The brief this came from

"Create a Milky Way galaxy with future UI (FUI) that is animated and
interactive." Built against the method from the first piece: one self-contained
HTML file, seeded randomness, Web Audio, a verification step, a vision loop.

### What the FUI research actually changed

Four things came out of the reference reading and all four are load-bearing:

- **GMUNK hung every element of Oblivion's interface on a dot grid.** This is the
  single rule that separates an instrument from a screensaver. Here it is `GU`,
  one number derived from the short edge, and `gx()` snaps to it. Every panel
  edge, tick, baseline and callout goes through it. Nothing floats.
- **The Expanse uses a faint grid as a distance reference *and* as aesthetic.**
  Hence the graticule on the galactic plane — it is how you read the tilt while
  you are dragging, and it is also just the right kind of furniture.
- **Cyan primary, amber and magenta accents, near-black, thin strokes.** Real
  military HUDs are high-contrast cyan on dark for readability. Restricting to
  three channels was already forced by the plate architecture; the research said
  which three.
- **Readouts should be partial and updating, not readable.** Data density is
  texture. The telemetry column is real numbers on a real tick, and you are not
  meant to read it.

The fifth thing, which is the one people get wrong: **believability in FUI comes
from research and rigour, not from licence.** So the galaxy is the actual Milky
Way — four arms at ~11° pitch, a ~4 kpc bar canted to the Sun line, the Sun at
8.2 kpc in the Orion Spur — and the seed varies the survey, not the galaxy.

**What "done" means, concretely.** `verify.mjs` checks 1–4 directly; 5 is yours.

1. The file contains no media and no external references.
2. It renders with the network fully blocked and requests nothing.
3. It audits itself and says so out loud.
4. Frames are reproducible: same seed, frame and view, same pixels. (Checked by
   rendering every frame twice, out of order, and comparing bytes.)
5. It looks good.

---

## 3. The one idea that matters

If you keep nothing else from this file, keep this.

Lamplighter is a risograph print. Three inks, composited with `multiply`, onto
paper. Nothing can ever be *lighter* than the paper, so highlights are knocked
out with white.

**Parallax is the mirror, and copying Lamplighter's engine verbatim would have
been the mistake.** A galaxy is emissive. So: three phosphor channels, each
starting black, each carrying one colour, composited onto the void with
`lighter`.

```js
out.fillStyle = VOID;                     // #05060a
out.fillRect(0, 0, W, H);
out.globalCompositeOperation = 'lighter';
for (const k of ['c','a','m']) out.drawImage(buf[k].c, dx, dy);
```

Which brings one hard consequence, and it is the exact inverse:

> **Nothing can ever be darker than the void.**

So shadows are not painted — there is nothing to paint them with. They are
**subtracted**:

```js
function emit(g, k, a)  { g.globalCompositeOperation = 'lighter';  g.fillStyle = 'rgba(' + CH[k] + ',' + a + ')'; }
function occlude(g, a)  { g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(0,0,0,' + a + ')'; }
```

`multiply` toward black attenuates exactly — `dst * (1 - a)` — and unlike
`destination-out` it is well defined on an opaque canvas. Use it, not
`destination-out`.

Three corollaries, all of which took time to internalise:

- **Addition commutes, so there is no depth sort.** Eleven thousand stars can be
  drawn in any order at all. This is a gift and it is why the star field is
  affordable.
- **Dust is the single exception, because it is the only thing that removes
  light.** It has to be drawn between the far stars and the near ones. The split
  is on projected depth, which works face-on (splitting above/below the disk) and
  edge-on (splitting front/back) with the same line of code.
- **Every draw function is called once per channel and decides how much of *that*
  light it is made of.** There is no colour variable anywhere except `CH`. A hot
  O star emits into cyan, an old giant into amber, an ionised region into
  magenta, and the colour you see is those densities added.

Then, because a real lens disperses, the channels composite about a pixel out of
register and drift slowly (`REG`, in §6 of the piece). Same code as Lamplighter's
press misregistration, different physics.

---

## 4. How the file is laid out

Twelve numbered sections, in draw order. Line numbers drift — the
`// ─── N. name` markers are the durable anchors.

| section | what lives there |
|---|---|
| 1. groundwork | URL params, `mulberry32`, gaussian `rg()`, value noise, `curve()` |
| 2. the channels | `CH` table, `emit()` / `occlude()`, glow sprites, `resize()`, `GU` |
| 3. the galaxy | `buildGalaxy()` — the real skeleton, and what the seed decides |
| 4. the survey | `BANDS`, `updateBand()` — the colour engine |
| 5. the camera | `cam`, `project()`, `proj()` — orthographic, azimuth + inclination |
| 5a. the void | deep field, the dot grid, the galactic-plane graticule |
| 5b. the galaxy | halo, bulge, arm gas, HII, dust, stars, globulars |
| 5c. the instrument | rings, sweep, contacts, anomaly, reticle |
| 5d. the readouts | band ladder, telemetry, spectrum, dossier, status |
| 6. the screen | bloom, sensor noise, aperture mask, scanlines, sync tear, glass |
| 7. a frame | `render(T)` — the whole draw order, three times |
| 8. overlay | title card and HUD (suppressed in `?still=1`) |
| 9. audio | drone, sweep, telemetry chirps, soundings, lookahead scheduler |
| 10. capture | `MediaRecorder` webm + still |
| 11. the purity check | the file auditing itself |
| 12. the loop | rAF tick, adaptive quality, pointer, keys, the `window.artPiece` door |

### The colour engine, because it explains the rest

One number runs the entire palette: **the wavelength the instrument is tuned
to**, a triangle wave over the 96-second cycle so it sweeps up the spectrum and
back with no seam.

```js
var lam = u < 0.5 ? u * 2 : 2 - u * 2;
var radio = bump(lam, 0.00, 0.15), ir = bump(lam, 0.25, 0.14);
var opt   = bump(lam, 0.50, 0.14), uv = bump(lam, 0.75, 0.14);
var xray  = bump(lam, 1.00, 0.15);
```

Everything downstream is a function of those five: per-channel master gain, a
4×3 table of how each stellar class responds, whether the star field is visible
at all, how much the core matters — and the flip:

```js
band.dustOcc  = 0.18*radio + 0.05*ir + 1.00*opt + 0.92*uv + 0.10*xray;
band.dustEmit = 0.62*radio + 1.00*ir + 0.04*opt + 0.00*uv + 0.00*xray;
```

**That flip is the best thing in the piece.** In the optical a dust lane is a
hole in the galaxy; at 8 µm it is the brightest thing in the frame. Watching a
lane go from absence to source is worth the whole build, and it costs two lines
because there is no colour anywhere to keep in sync.

Want a longer infrared pass, or a colder radio one? Change `updateBand()` and
the whole piece moves together. That single point of control is the reason the
cycle looks coherent.

### The sweep, because it is the audio/visual sync

`sweepAngle(T)` is one function. The pixels read it to draw the sweep; the audio
scheduler reads *the same function* to decide when to ping. So when the sweep
crosses a catalogued contact you hear it, because it crossed it — not because a
step counter came round.

The first piece's handoff called its unsynced foghorn "the most obviously
unfinished thing in the piece." This is that, fixed at the start rather than
listed at the end.

### Everything loops

Every period divides `LOOP`: the sweep (`LOOP/8`), the ring rotations
(`LOOP/3`, `LOOP/4`, `LOOP/2`), the telemetry tick (`LOOP/64`), the anomaly pulse
(`LOOP/16`). So the piece is a genuine seamless 96-second loop, not just a
looping palette. The first piece could not claim this; keep it true if you add
anything periodic.

---

## 5. The piece contract

Every piece in `art/` exposes the same door, so the tools never need to know
which piece they are driving.

```js
window.artReady === true          // set once the first frame has been drawn
window.artPiece = {
  frame(n),                       // render frame n exactly, then stop. deterministic
  seed(s),                        // rebuild the world on seed s
  purity(),                       // {bytes, clean, found[], canvases, elements}
  info(),                         // {seed, w, h, loop, quality, t, ...}

  // optional, and this piece adds two:
  view(az, inc, zoom),            // pin the canonical camera
  __passes                        // the pass table, for tools/ablate.mjs
}
```

`frame(n)` **resets the camera and clears any lock**, because a deterministic
frame has to be deterministic no matter what somebody dragged a moment ago.
`view()` moves the canonical camera that `frame()` resets *to*, so seed + frame +
view is still exactly reproducible — it just is not always the same three
numbers. Without it, half of what this piece does is invisible to the tooling.

`__passes` exists only so `tools/ablate.mjs` can swap a pass for a no-op from
outside the IIFE. `render()` dispatches through it. If you add a draw pass, add
it to the table or it will be invisible to the profiler.

Keys: click/space sound · drag orbit · wheel zoom · click to lock · `esc` clear ·
`1`–`5` band · `n` new seed · `p` pause · `[` `]` scrub · `g` grid · `r` record ·
`c` still · `f` fullscreen · `0` reset camera.

---

## 6. The development loop that worked

```
patch one function  →  render frames  →  look at them  →  decide  →  repeat
```

**Do not edit this file line by line.** It is 2268 lines inside one HTML file and
the unit of change that matters is the function. Line-based edits at this size
are how you end up with two definitions of `drawDust` and no idea which one runs.
`tools/patch.mjs` refuses outright if it finds a name defined twice.

Write a patch script instead:

```js
// fix-sea.mjs
import fs from 'fs';
import { replaceFn } from './tools/patch.mjs';
let src = fs.readFileSync('parallax.html', 'utf8');
src = replaceFn(src, 'drawDust', `function drawDust(g, k, T) { ... }`);
fs.writeFileSync('parallax.html', src);
```

```bash
node fix-dust.mjs
node verify.mjs --scan-only            # syntax + purity in one shot
npm run sheet -- --seed 23 --frames 0,720,1440,2160,2880,4320
```

Then **look at the sheet**. Six frames across the cycle catches what one
screenshot never will — and for this piece specifically, those six frames are one
per spectral band, which is the only way to see the whole colour engine at once.

**But read the sheet only for composition, colour and gross error.** Tiling
shrinks each frame and hides exactly the pixel-level detail you most want. This
bit twice in one session — see §8.1. Confirm anything suspicious at full size;
`verify.mjs` writes full-size frames to `.renders/`.

For a syntax check without a browser:

```bash
node -e "const fs=require('fs');fs.writeFileSync('/tmp/x.js',
  fs.readFileSync('parallax.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])" \
  && node --check /tmp/x.js
```

---

## 7. Chronology: prompt to result

**Pass 0 — research, then commit to an architecture.** Read the FUI references
(§2) and the maser-parallax arm fits. Decided immediately that Lamplighter's riso
engine was the wrong thing to copy, and that the interesting move was to mirror
it: additive onto void instead of subtractive onto paper. That decision made
everything else fall out, including the dust flip.

**Pass 1 — write it whole.** ~2170 lines in one go: channels, seeded galaxy,
band engine, camera, void, galaxy, instrument, readouts, screen, audio, capture,
purity, loop, interaction. Syntax-checked by extracting the script and running
`node --check`. Purity and determinism clean first try.

**Pass 2 — fix the known-expensive thing before looking.** The dust pass was
written as ~800 radial gradients per frame, which is the exact mistake the first
piece's handoff warns about. Rewrote it as a single white mask painted once per
frame with a pre-rendered black sprite, then multiplied onto each channel in one
`drawImage`. Three composites instead of eight hundred gradients.

**Pass 3 — first look, and the contact sheet lies.** The sheet said "glowing
smear, no structure, dust not working." The full-size render said the FUI was
legible, the dust *was* subtracting and the stars *were* resolving. Four real
faults, not the ones the sheet suggested: the anomaly was a magenta bruise
sitting on the Sun, the sweep read as a hard-edged trapezoid, the deep field
looked like dirt on the lens, and unlit HUD rows were below legibility.

**Pass 4 — the dead annulus.** Arms wound out to 8.7 kpc inside a 13.4 kpc field,
so the galaxy sat in a ring of nothing. Tightened the field and wound the arms
further. Simultaneously: dust clumps were up to 1.8 kpc across and merging into
broad shadow rather than lanes — halved the radius and nearly doubled the count.
Gave the bar more of the population and a thinner profile with density rising
toward the ends, which is what makes a bar look like a bar. This is the pass
where it started looking like the Milky Way.

**Pass 5 — the angles nobody had looked at.** Added `view()` and rendered
edge-on and three-quarter. Edge-on immediately exposed that globular clusters
were rendering over a kiloparsec across — roughly ten times life size — which is
why the halo looked like sensor dust. Also checked portrait, which the smoke test
had resized through without anyone looking at the result.

**Pass 6 — measure.** Wired `__passes` so ablation could work, and got a real
ranking. See §9.

---

## 8. Every bug, and what it taught

### 1. The contact sheet was wrong twice in one session

The first sheet said the dust was not working and the galaxy had no structure.
Both false. Tiling six 1280×800 frames into 520px cells throws away exactly the
spatial frequency that dust lanes and resolved stars live at.

The first piece's handoff warned about this in writing and it still happened
here, on the first look, which is worth knowing: **the warning is not enough.**

**Rule:** the sheet answers "is the composition right, is the colour right, is
anything grossly broken." Every other question goes to a full-size render.

### 2. The engine you copy is not the engine you need

The obvious move was to lift Lamplighter's riso plates verbatim, as its own
handoff suggests for new pieces. Doing that for an emissive subject would have
produced a galaxy that could not be brighter than paper — which is not a galaxy.

Keeping the *architecture* (three channels, per-channel densities, no colour
variables, one scalar driving the palette) while inverting the *optics* is what
made the dust flip possible, and the dust flip is the best thing in the piece.

**Lesson:** copy the discipline, not the blend mode.

### 3. Eight hundred gradients

`createRadialGradient` per dust clump per channel is ~800 gradient objects per
frame. Caught before the first render only because the previous piece's handoff
ranked gradients as the most expensive thing on a canvas.

The fix generalises: **anything identical across all three channels should be
painted once into a mask and composited three times.** Occlusion qualifies by
definition — an absence of light is the same absence whatever colour is behind
it.

### 4. `destination-out` is not the subtraction you want

The obvious way to remove light is `destination-out`. On a canvas created with
`{alpha: false}` its behaviour is muddy, because the backdrop alpha is forced to
1 and what happens to the colour channels is not what you would guess.
`multiply` toward black is exactly `dst * (1 - a)`, is well defined on an opaque
canvas, and is faster.

### 5. A pass table that nothing dispatches through is decorative

Exposed `__passes` for the ablation harness and it reported every cost as zero.
Function *declarations* inside an IIFE bind at the call site; reassigning the
table entry changes nothing, because `render()` was still calling `drawDust`
directly. Had to route `render()` through `PASS.drawDust(...)` for the swap to
mean anything.

**Lesson:** a seam you can see from outside is not a seam unless the inside goes
through it.

### 6. Scale discipline, or: the halo full of sensor dust

Globulars were authored at `rr(0.12, 0.34)` kpc "radius" and then drawn with a
3.2× glow multiplier on top, so they rendered at over a kiloparsec. Real globular
clusters are about 30 parsecs across. Nobody noticed face-on, because they sit
behind the disk. Edge-on they were unmissable.

**Lesson:** when the units are real, check the numbers against reality, and check
every camera angle — a wrong scale can hide behind a viewpoint.

### 7. Determinism has to survive the user

`frame(n)` is supposed to be reproducible, but this piece has a draggable camera
and a clickable lock, so "frame 1440" meant different pixels depending on what
had happened before. Fixed by having `frame()` reset the camera and clear the
lock. `verify.mjs` now renders every frame twice, out of order, and compares
bytes — so this class of bug fails the build rather than being noticed later.

**Lesson:** on an interactive piece, the deterministic entry point must reset
every piece of interaction state, and the check has to actually re-render rather
than trust the claim.

---

## 9. Performance: measured, inferred, unknown

**Measured, headless (1280×800, software rasterisation), quality 1, frame 1440:**
~119 ms/frame. Ablation ranking:

```
composite       40.0     full-screen: bloom, noise, mask, scanlines, glass
drawDust        29.9     three full-screen multiply composites of the mask
drawStars       29.8     11,000 stars × 3 channels
buildDustMask   14.1     ~600 sprite draws, once per frame
drawHII          9.4
drawHalo         9.1
drawArmGas       8.8
...everything else under 6
```

**Inferred:** headless Chromium here runs software rasterisation via SwiftShader,
roughly an order of magnitude slower than a GPU-backed canvas. Note that the top
four entries are almost entirely *fill rate* — full-screen composites and sprite
blits — which is precisely the work a GPU makes nearly free. The CPU-bound part
(projection, binning, geometry) does not appear in the top ten.

**Unknown, and stated plainly: real-world frame rate has not been verified.**
There is no GPU in this environment. On a normal machine this is expected to sit
comfortably at 60 fps, but that is an expectation, not a measurement.
**First thing to do on a machine with a display: open it and watch.**

**The safety net.** `tick()` keeps a rolling average and steps `quality` between
1, 0.75 and 0.5, which rebuilds the galaxy with fewer stars and thins the sea of
HUD sparklines. It engaged in headless (dropping to 0.5, 6600 stars) exactly as
designed. Internal resolution is capped at 2.4 M pixels so three full-size
channels stay affordable on retina displays.

If you optimise, in order of value:
1. `composite` — the two bloom passes are the biggest single item. One pass at
   1/8 instead of two would cost little visually.
2. `drawStars` — the bucket count (`NB`, 14) trades fillStyle changes against
   loop iterations; 10 would probably do.
3. `buildDustMask` — the mask only changes when the camera or band changes.
   Caching it across frames while both are static is the obvious win and nobody
   has done it.

---

## 10. Known limitations

Honest list. None of these are hidden by the tests.

- **Real-world frame rate is unverified.** See §9. This is the big one.
- **Recording is wired but untested.** `r` builds a `MediaRecorder` from
  `captureStream(60)` plus the audio destination. It cannot be exercised headless
  without a display. Assume it needs a pass.
- **The dust mask is rebuilt every frame** even when neither the camera nor the
  band has moved. That is ~14 ms of pure waste on a static view.
- **Seed variance is uneven.** The galaxy skeleton is fixed, so no seed is
  *broken*, but the catalogue is not evenly distributed — some seeds cluster most
  of their procedural contacts in one arm and leave a quadrant unlabelled.
- **The anomaly can still land behind a bright arm** at some camera angles and
  get lost, despite being kept clear of the Sun. It is flagged in the status
  panel regardless, so it is findable, but not always visible.
- **Portrait wastes vertical space.** The galaxy scales on the short edge, so a
  tall window gets large empty margins. Correct behaviour for a circular subject,
  but a portrait-specific layout would use the room.
- **`verify.mjs` scans every `.html` file in the folder.** Dropping an unrelated
  HTML file into `art/` will make it try to boot it as a piece and fail on
  `window.artReady`.
- **Touch is partly untested.** Pointer events cover drag and tap and were
  exercised in the smoke test, but pinch-zoom has no dedicated handler — it
  relies on wheel events, which not every mobile browser synthesises.

---

## 11. Next steps, ranked

**1. Watch it on a real display.** Everything above is headless. Open it, let a
full 96-second cycle run, drag it to edge-on, listen for a minute. Nothing else
should happen before this. *First move:* `open art/parallax.html`, click, wait.

**2. Cache the dust mask.** 14 ms per frame recomputing something that only
changes when the camera or the band moves. *First move:* key it on
`(az, inc, zoom, round(band.lam * 200))` and skip the rebuild on a hit.

**3. Build the vision loop properly.** Still the part of the source method not
implemented, and this piece is better set up for it than the last one, because
`view()` means a critique can be asked about any angle. *First move:* a
`tools/look.mjs` that renders N frames across the bands and two camera angles,
hands them to a model with the intent, and prints the critique next to the frame
paths. Then close the loop by letting it write patch scripts against
`tools/patch.mjs`.

**4. Even out catalogue distribution.** *First move:* in `buildGalaxy()`, reject
procedural catalogue picks that fall within some angular distance of an existing
one, so the survey covers the disk.

**5. A portrait layout.** Move the band ladder to a bottom strip and let the
galaxy use the height.

**6. Exercise recording**, then consider an offline exporter: `?det=1` plus
frame-by-frame capture piped to ffmpeg gives a perfect-cadence video that a
real-time recorder cannot.

**7. Optimise further, if and only if §11.1 says it needs it.** See §9.

---

## 12. Cheat sheet

```bash
node verify.mjs --scan-only                      # no deps; purity + syntax
npm run verify                                   # + headless render, determinism
npm run verify -- --seed 23 --frames 0,1440      # pick seed and frames
npm run sheet  -- --seed 23 --cols 3             # contact sheet -> .renders/sheet.png
npm run smoke                                    # loop, audio, keys, resize, interaction
npm run audio  -- --at 2880 --seconds 14         # audio graph; probe where events are
npm run ablate -- --frame 1440                   # where the frame time goes
node tools/patch.mjs parallax.html drawDust /tmp/new.js
CHROME_PATH=/path/to/chrome npm run verify       # if Chromium is not auto-found
```

**Band frames** (96 s cycle, 60 fps — the sweep goes up the spectrum and back):

| band | frame |
|---|---|
| RADIO | 0 |
| INFRARED | 720 |
| OPTICAL | 1440 |
| ULTRAVIOLET | 2160 |
| X-RAY | 2880 |

**Tuning knobs**, with what they do:

| what | where |
|---|---|
| cycle length (96 s) | `LOOP`, §1 |
| channel colours | `CH`, §2 |
| void colour | `VOID`, §2 |
| the interface grid — everything snaps to it | `GU`, in `resize()`, §2 |
| channel misregistration | `REG`, §6 |
| resolution cap | `cap`, in `resize()`, §2 |
| **the entire palette** | `updateBand()`, §4 |
| the dust flip | `band.dustOcc` / `band.dustEmit`, §4 |
| arm geometry, bar, Sun | `ARMS` / `BAR_A` / `BAR_L` / `SUN_R`, §3 |
| field of view in kpc | `KPC`, §3 |
| what a seed decides | `buildGalaxy()`, §3 |
| star count | `n` in `buildGalaxy()`, §3 |
| draw order | `render()`, §7 |
| sweep period, ring periods | `SWEEP_P` / `RING_A` / `RING_B` / `RING_C`, §1 |

**If something looks wrong, in this order:** check at full size, not on a contact
sheet (§8.1) → dump the parameters before touching the code → check whether the
units are physically sane (§8.6) → check every camera angle → check whether it is
an occlusion problem rather than an alpha one (§3).
