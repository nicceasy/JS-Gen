# art/

Self-contained generative pieces. One HTML file each. No images, no video, no
audio files, no fonts, no external references of any kind — every pixel and
every sample is computed at runtime. The tools in here exist to prove that and
to make the look-and-revise loop possible.

| piece | what it is |
|---|---|
| `parallax.html` | a galactic survey console. The Milky Way, three phosphor channels, a 96-second sweep up the spectrum and back, and an instrument looking at it |

---

## Parallax

A galactic survey console, drawn as additive light on a phosphor screen. Drag to
orbit from face-on to edge-on, scroll to zoom, click a contact to pull its
dossier. The instrument sweeps the electromagnetic spectrum over 96 seconds —
radio, infrared, optical, ultraviolet, X-ray — and the galaxy changes character
completely in each one, because it is the same galaxy seen by a different
detector.

The skeleton is not invented. Four arms with a pitch angle near 11°, a bar about
4 kpc long canted to the Sun–centre line, the Sun 8.2 kpc out in the Orion Spur —
those come from the maser-parallax fits and a seed has no business changing them.
What a seed decides is the *survey*: which stars this run resolved, what it
catalogued, where the dust clumped, and where the one thing it cannot explain is.
Every seed is the same galaxy, differently observed.

### Controls

| | |
|---|---|
| click / space | sound on |
| drag | orbit — face-on through edge-on |
| wheel / pinch | zoom |
| click a contact | lock it, and open its dossier |
| `esc` | clear the lock |
| `1`–`5` | jump to a spectral band |
| `n` | new seed |
| `p` | pause · `[` `]` scrub 3 s |
| `g` | grid · `f` fullscreen |
| `r` | record webm · `c` save a still |

URL parameters: `?s=5` seed · `?f=140` start frame · `?still=1` one frame then
stop (and no interface chrome) · `?det=1` fixed 1/60 s per frame.

### The technique

A risograph prints one ink at a time and composites with `multiply`, so nothing
can ever be lighter than the paper and highlights have to be *knocked out*. This
is the mirror of that. Three phosphor channels — cyan, amber, magenta — start
black and composite onto the void with `lighter`:

```js
out.fillStyle = VOID;                     // #05060a
out.fillRect(0, 0, W, H);
out.globalCompositeOperation = 'lighter';
for (const k of ['c','a','m']) out.drawImage(buf[k].c, dx, dy);
```

Light adds, and addition commutes, so eleven thousand stars need no depth sort at
all. The consequence is the opposite of the riso one:

> **Nothing can ever be darker than the void.**

So shadows are not painted. There is no dark to paint with. They are *subtracted*
— and the dust lanes, which are the whole reason a spiral reads as a spiral, are
made of removal:

```js
function emit(g, k, a)  { g.globalCompositeOperation = 'lighter';  g.fillStyle = 'rgba(' + CH[k] + ',' + a + ')'; }
function occlude(g, a)  { g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(0,0,0,' + a + ')'; }
```

Dust is also the one thing in the file that cares about draw order, because it is
the only thing that takes light away. Everything else is free.

There is no colour variable anywhere. A hot young star emits into cyan, an old
giant into amber, an ionised region into magenta, and what you see is those
densities multiplied out. Which is why the infrared pass works: at 8 µm the dust
stops subtracting and starts emitting, and a lane that was an absence becomes the
brightest thing in the frame without a single colour being reassigned.

One number runs the whole palette — the wavelength the instrument is tuned to,
a triangle wave over 96 seconds. Change `updateBand()` and the entire piece moves
together.

Everything in the interface hangs on a dot grid (`GU`), which is the one
structural rule that separates an instrument from a screensaver. Every panel
edge, tick and baseline snaps to it.

Every period in the piece divides the 96-second cycle — the sweep, the ring
rotations, the telemetry tick, the anomaly pulse — so it is a true seamless loop
and not just a looping palette.

---

## Verifying the claims

```bash
# 1. no dependencies at all. Works on any machine with node.
node verify.mjs --scan-only
#     ok   parallax.html  (83.9 KB)  no embedded media, no external references

# 2. the tools. One package. Browsers are NOT downloaded — it finds yours.
npm install

# 3. the claim checked properly: headless, network hard-blocked, both ways
npm run verify
#     ok   parallax.html  self-audit clean, 1 canvas, 2 body children,
#          off-file requests 0, 5 frames rendered, determinism ok

# 4. it actually runs
npm run smoke
#   ok — loop, audio, keys, resize, interaction, offline

# 5. look at it
npm run sheet -- --seed 23 --frames 0,720,1440,2160,2880,4320
```

Then open `parallax.html` in a browser and click once for sound.

`npm run verify` renders each frame twice, out of order, and compares the bytes —
so "same seed and frame gives the same pixels" is checked rather than asserted.

**If Chromium is not found**, every tool says so and tells you the fix:
`CHROME_PATH=/path/to/chrome npm run verify`.

## The tools

| | |
|---|---|
| `verify.mjs` | the purity scan, a syntax check, the headless render, and the determinism comparison |
| `tools/sheet.mjs` | contact sheet — the one you will use most |
| `tools/patch.mjs` | replace one function by name inside the HTML |
| `tools/smoke.mjs` | loop, audio, keys, resize, interaction, offline |
| `tools/audio.mjs` | proves the synth built and is scheduling |
| `tools/ablate.mjs` | where the frame time really goes |

Read `HANDOFF.md` before changing anything. In particular: edit by *function*,
not by line, and confirm anything suspicious at full size — a contact sheet hides
exactly the detail you are looking for.
