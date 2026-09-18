# art/

Self-contained generative pieces. One HTML file each. No images, no video, no
audio files, no fonts, no external references of any kind — every pixel and
every sample is computed at runtime. The tools in here exist to prove that and
to make the look-and-revise loop possible.

| piece | what it is |
|---|---|
| `lamplighter.html` | a lighthouse through a 96-second day, as a three-plate risograph print |
| `parallax.html` | a galactic survey console. The Milky Way in three phosphor channels, swept up the spectrum and back |
| `apogee.html` | race control for an orbital sport. A rotatable Earth, the Moon, and six craft on Kepler orbits, drawn by one beam |

They are worth reading together, because each one is the same architecture under
a different optical constraint — three channels, per-channel densities, no
colour variable anywhere, one scalar driving the whole image:

| | composites | the constraint | so |
|---|---|---|---|
| Lamplighter | three inks, `multiply`, onto paper | nothing can be **lighter** than the paper | highlights are knocked out |
| Parallax | three channels, `lighter`, onto the void | nothing can be **darker** than the void | shadows are subtracted |
| Apogee | three guns, one beam, on a vector tube | nothing can be **filled** | brightness is dwell time |

§3 of each handoff is the short version.

---

## Apogee

Race control for an orbital sport. Drag to rotate the Earth, wheel out to the
whole Earth–Moon system, click a craft to lock it. Six teams fly Kepler orbits
through a cislunar circuit; the leaderboard, the bearing marks on the rim and
the lunar inset all read the same numbers the picture does.

Everything is drawn by one beam, and a vector display has no fill — so the globe
is a graticule and coastlines, the Moon is a limb and crater rings, and every
panel is corner marks. Brightness is dwell time: where the beam moves fast the
trace is dim, where it slows it blooms.

Orbits are sampled in equal **time**, not equal angle, so the samples crowd
where a craft is slow. The display blooms at apogee, and the sport is named for
it. Nobody wrote that — it falls out of doing the orbital mechanics properly and
letting the beam model do what beams do.

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
#   ok   lamplighter.html  (57.7 KB)  no embedded media, no external references
#   ok   parallax.html     (82.9 KB)  no embedded media, no external references

# 2. the tools. One package — playwright-core, which uses the browser you
#    already have rather than downloading one.
npm install

# 3. the claim checked properly: headless, network hard-blocked, both pieces
npm run verify
#   ok   parallax.html  self-audit clean, 1 canvas, 2 body children,
#        off-file requests 0, 5 frames rendered, determinism ok

# 4. it actually runs
npm run smoke -- --piece parallax.html
#   ok — loop, audio, keys, pointer, resize, offline

# 5. look at it
npm run sheet -- --piece parallax.html --seed 23 --frames 0,720,1440,2160,2880,4320
```

Then open `parallax.html` in a browser and click once for sound.

`npm run verify` renders each frame twice, out of order, and compares the bytes —
so "same seed and frame gives the same pixels" is checked rather than asserted.

**If Chromium is not found**, every tool says so and tells you the fix:
`CHROME_PATH=/path/to/chrome npm run verify`.

## The tools

| | |
|---|---|
| `verify.mjs` | the purity scan, the headless render with the network blocked, and the determinism comparison |
| `tools/sheet.mjs` | contact sheet — the one you will use most |
| `tools/patch.mjs` | replace one function by name inside the HTML |
| `tools/smoke.mjs` | loop, audio, keys, pointer, resize, offline |
| `tools/audio.mjs` | proves the synth built and is scheduling |
| `tools/ablate.mjs` | where the frame time really goes |
| `tools/look.mjs` | the vision loop — render frames, get a schema-constrained critique keyed to real function names |

`tools/look.mjs` is the only tool that needs the network, and it is
provider-agnostic: set `LOOK_BASE_URL`, `LOOK_MODEL` and `LOOK_API_KEY` for any
OpenAI-compatible router. Run it with `--dry` to build the request and exercise
its validator without calling out. **Never commit the key.**

Every tool takes `--piece`, and defaults to `lamplighter.html`. `verify.mjs`
covers every piece in the folder in one run.

Read the handoff for whichever piece you are touching — `HANDOFF-apogee.md`,
`HANDOFF-parallax.md` or `HANDOFF-lamplighter.md` — before changing anything. In
particular: edit by *function*, not by line, and confirm anything suspicious at
full size, because a contact sheet hides exactly the detail you are looking for.
