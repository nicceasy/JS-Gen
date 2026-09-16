# Apogee — transfer & handoff

**What it is.** `apogee.html` is a single file — one `<canvas>`, one `<script>`,
~68 KB — that draws race control for an orbital sport: a rotatable Earth, the
Moon, and six craft flying Kepler orbits through a cislunar circuit. No images,
no video, no audio files, no fonts, no external references. Drag to rotate,
wheel to travel from the globe out to the whole Earth–Moon system, click a craft
to lock it.

Third piece in `art/`, and the third optical model. Read §3 here next to §3 of
the other two handoffs — that is where the series actually lives.

---

## 0. Inventory

Shares the folder's tooling; see `HANDOFF-parallax.md` §0 for the full table.
The piece itself has zero dependencies.

---

## 1. Transfer

```bash
node verify.mjs --scan-only
npm install
npm run verify
npm run smoke  -- --piece apogee.html
npm run sheet  -- --piece apogee.html --seed 7 --frames 0,1200,2400,3600,4800
```

Then open it and click once for sound.

---

## 2. The brief, and what the research changed

"A rotatable globe view that skews orbital positions of satellites in an
imaginary orbital sport game. Earth and Moon."

Three findings did real work:

- **Sports broadcast: a viewer should read a graphic in about two seconds.**
  That is the *opposite* of the survey console in `parallax.html`, where data
  density is deliberately texture. So this board is sparse where that one is
  dense: position, number, team, gap. Everything else has to earn its place.
- **F1 live timing: every car is a coloured dot moving in sync with a
  leaderboard.** The dot and the row must always agree. That single requirement
  is what forced the rim bearing marks (§4), because at globe zoom five of six
  craft are off the edge of the tube.
- **Vector CRT: brightness is dwell time.** "Where the beam moves fast it
  spreads its light over a long distance and the trace is dim; where it turns
  around it lingers and the trace blooms. This is why a square drawn by an
  oscilloscope has bright corners and a square drawn by a computer does not."
  That is the whole engine. See §3.
- **P7 phosphor is a two-layer cascade** — a blue-white strike that pumps a
  green-yellow layer underneath, so the trail is a different colour from the
  strike. Applied per team, that means a trail encodes *time* while its colour
  encodes *team*, in one mark.

---

## 3. The one idea that matters

Lamplighter is a risograph: three inks, `multiply`, onto paper. Nothing can be
lighter than the paper, so highlights are knocked out.

Parallax is a phosphor screen: three channels, `lighter`, onto the void. Nothing
can be darker than the void, so shadows are subtracted.

**Apogee is a vector CRT. There is no fill at all, and brightness is dwell
time.**

A vector display has no framebuffer. A shape exists because the beam travelled
along it, and how bright a stretch comes out depends on how long the beam spent
there. So `beam()` takes a polyline and gives every segment a brightness from
its own length:

```js
var a = gain * DWELL * SCALE / (DWELL * SCALE + len);
```

That one line is the piece. Two consequences run through the whole file:

- **Nothing can be filled.** Not the Earth, not the Moon, not a panel. Solidity
  has to be implied by how densely the beam hatches, which is why the globe is a
  graticule and coastlines, the Moon is a limb and crater rings, and every panel
  is corner marks rather than a box.
- **To make something brighter, emit more points along it.** Brightness is not a
  parameter you pass; it is a property of the path you hand over.

And then the thing that makes the whole piece worth building. Orbits are sampled
in **equal time, not equal angle**:

```js
for (var i = 0; i <= n; i++) { var M = M0 + i / n * TAU; ... }   // mean anomaly
```

Equal steps of mean anomaly are equal steps of *time*, so the samples crowd
where the craft is slow — at apogee. Short segments, slow beam, bright trace.
**The display blooms at apogee, and the sport is named for it.** Nobody wrote a
brightness term for that; it falls out of doing the orbital mechanics correctly
and then letting the beam model do what beams do.

The same mechanism gives the tails their shape: sampled backward in equal time,
so a tail is long and dim where the craft is fast and short and bright where it
is slow. It is a speedometer you never had to draw.

---

## 4. Decisions worth knowing

**Three guns, and a team is a beam mix, not a colour.** `TEAM_MIX` is six
triples over `GUN.a/g/r`. There is no colour variable anywhere else. A trail
decays toward `GUN.g` because that is the P7 cascade, so age reads as hue.

**The rim.** At globe zoom, craft on cislunar ellipses are off the edge of the
tube almost all the time. A "globe view with satellites" showing no satellites
fails the brief, so any craft outside the limb gets a bearing tick, an outward
chevron, its number and its range on the rim. That is a real tracking-display
element and it is the only reason the picture and the leaderboard agree.

**The lunar inset.** The Moon is 60.27 Earth radii out and 0.27 across. Those
two numbers are what make a cislunar chart feel real, and they also mean any
view holding both bodies draws each as a dot. True scale is honest and
unreadable; picking one body loses the brief. A broadcast would cut to an inset
while the wide shot keeps running, so there is one, bottom right, locked on the
far turn. It reuses `px()`/`py()` by pointing `INSET` and `PROJ.S` somewhere
else and putting them back — no second projection path.

**The scope's gain.** One beam is shared by everything on screen, so the more
there is to trace the less time each vector gets. `lap.gain` dims as you zoom
out, because that is the hardware, not a look.

**Everything loops.** Every period divides `LOOP` (96 s), so this is a true
seamless loop, like Parallax and unlike Lamplighter.

---

## 5. The contract

Standard: `artReady`, `artPiece.{frame, seed, purity, info}`, plus
`view(az, el, zoom)`. `frame(n)` resets the camera and clears any lock, because
a deterministic frame has to be deterministic no matter what somebody dragged.
`verify.mjs` checks that by re-rendering out of order and comparing bytes.

Do **not** add a debug hook for `tools/ablate.mjs`; it rewrites `render()`'s
call sites into a temp copy of the file and needs nothing from the piece.

URL params: `?s=` seed, `?f=` frame, `?still=1`, `?det=1`.
Keys: click/space sound · drag rotate · wheel globe↔system · click a craft ·
`esc` clear · `1`–`6` lock a craft · `n` new meet · `p` pause · `[` `]` scrub ·
`0` reset camera · `r` record · `c` still · `f` fullscreen.

---

## 6. Bugs, and what they taught

### 1. A compromise view can lose both ways
First pass defaulted to the globe (zoom 0) and the race was simply not in the
picture. The obvious fix — split the difference at zoom 0.22 — was worse: Earth
too small to read *and* the orbits still off-screen *and* the craft floating as
unconnected dashes. **Committing to the globe and solving the off-screen problem
properly (the rim) beat compromising between two good views.**

### 2. Convergence is a defect on a vector display
Six meridians drawn to ±90° all converge on one pixel. On an additive display
that is a bright artefact sitting on the pole, and it reads as damage. Real
globe plots stop short of the pole. Meridians now run to ±76°.

### 3. Scale discipline again
Gate 1 sits at 1.28 Earth radii and was authored with a 0.34 Re ring, which at
globe zoom reads as a second planet parked next to the first. Same class of
error as the oversized globular clusters in Parallax (`HANDOFF-parallax.md`
§8.6), found the same way — by looking at a view nobody had looked at yet.

### 4. Two craft wearing 54
`no: ri(2, 97)` per craft, independently. Two of six collided, and a leaderboard
with a duplicate number quietly tells you the whole board is decorative. Numbers
are now drawn from a pool without replacement.

### 5. A tick nobody would notice is not a report
The first rim marks were a 0.9 GU line and a 5.8 px number. They were correct
and invisible. A bearing without a range is also only half a fix, so the marks
grew a chevron and a range readout.

---

## 7. Performance

Headless (1280×800, software rasterisation), frame 1200, ablation:

```
composite   37.3     bloom, flicker, vignette, glass — full-screen work
drawField    7.2     six orbits, six tails, the rim
drawEarth    5.6
drawGates    3.3
drawInset    2.3
drawBoard    2.1
...everything else under 2
```

Markedly cheaper than Parallax, because strokes are cheaper than eleven thousand
sprite blits, and `composite` dominates by a wider margin — it is nearly all the
cost. **Real-world frame rate is unverified; there is no GPU in this
environment.** First thing to do on a machine with a display: open it and watch.

If you optimise: the two bloom passes in `composite` are the only thing worth
touching. `beam()`'s bucket count (`NBK`, 9) and `BKCAP` (6000 segments per
call) are the other knobs; a call that overruns `BKCAP` silently drops segments.

---

## 8. Known limitations

- **Real frame rate unverified.** As above.
- **The lap is not the sport.** Craft fly one orbit per 96-second lap, the Moon
  circuits once per lap, and the sun goes round once per lap. None of those
  periods are real. It is sport time, stated here rather than hidden.
- **Gate passes are geometric, not refereed.** A craft "crosses" a gate when its
  lap phase passes the gate's phase, not when its position actually intersects
  the hoop. The audio and the picture agree with each other because they read
  the same number, but neither is checking the geometry.
- **Δv only counts down cosmetically.** `dv` is seeded and static; `dvRate` is
  unused. The bar is honest about the sport's mechanic but is not simulating it.
- **Coastlines are from memory**, coarse and approximate. At vector-scope
  resolution that reads as the medium rather than as error, but do not treat the
  outlines as data.
- **Recording is wired but untested** — no display here.
- **Pinch-zoom has no dedicated handler**; it relies on wheel events.

---

## 9. Next steps, ranked

1. **Watch it on a real display.** Everything above is headless.
2. **Referee the gates properly** — test actual proximity to the hoop, and let a
   craft miss one. That turns a loop into a race.
3. **Spend the Δv.** Wire `dvRate` so the budget drains, and let a craft that
   runs out drop out of the standings. The bar already exists.
4. **A second camera for the inset** — right now it inherits the main azimuth,
   so the lunar view rotates when you drag the Earth. Independent would be
   better.
5. **Ground tracks** on the globe for the relay traffic; the research kept
   pointing at them and there was no room left.

---

## 10. Cheat sheet

```bash
npm run verify                                   # all pieces, + determinism
npm run sheet  -- --piece apogee.html --seed 7 --frames 0,1200,2400,3600,4800
npm run smoke  -- --piece apogee.html
npm run audio  -- --piece apogee.html --at 1800 --seconds 12
npm run ablate -- --piece apogee.html --frame 1200
```

| what | where |
|---|---|
| **the dwell constant — the whole feel of the display** | `DWELL`, §2 |
| gun colours | `GUN`, §2 |
| team beam mixes | `TEAM_MIX`, §4 |
| Moon distance and radius | `D_MOON` / `R_MOON`, §1 |
| the circuit | `gateDefs` in `buildMeet()`, §4 |
| the field's orbits | `buildMeet()`, §4 |
| zoom range, globe to system | `viewR()`, §6 |
| scope gain | `lap.gain` in `render()`, §9 |
| what a lap drives | `updateLap()`, §5 |
