# Recreations

Three figures copied from a real original — a photograph, a lithograph and an
engraving — and rebuilt as specs this pipeline renders and checks.

The other experiments in this repository generate figures nobody has drawn
before, which makes them impossible to be wrong about. These can be wrong.
There is a specific plate each one is trying to be, anyone can put them side by
side, and the gap is visible. That is the point: it is the only test in here
where the target was not chosen by the thing being tested.

| generator | original | what it exercises |
| --- | --- | --- |
| `voyager.mjs` | The Voyager Golden Record cover, NASA, 1977 (photograph GPN-2000-001978) | 842 marks and not one word of text; arcs, local frames, computed binary |
| `nightingale.mjs` | *Diagram of the Causes of Mortality in the Army in the East*, Florence Nightingale, 1858 | wedges whose AREA is the data; rotated labels that have to be walked apart |
| `minard.mjs` | *Carte Figurative des pertes successives en hommes de l'Armée Française*, Charles Joseph Minard, 1869 | a variable-width ribbon over a projection, and a second chart tied to it |

```bash
node experiments/recreations/voyager.mjs && npm run render experiments/recreations/voyager.json -- -o out/recreations
```

## The rule these follow

**Derive what the original derived.** A recreation that types in numbers read
off a photograph is a tracing, and it proves nothing about whether a figure can
be *computed*. So:

- Every binary number on the Voyager plate is a real duration divided by the
  hydrogen hyperfine period, printed in base two. The rotation ring is exactly
  as long around the rim as 3.6 seconds happens to be wide in binary; nobody
  chose its length.
- Every Nightingale radius is `k·√rate`, and every rate is
  `deaths × 12000 / strength` from the monthly returns. Both roses share one
  `k`. The second year's rose is small because the deaths collapsed, not
  because it was drawn small.
- Every Minard ribbon width is a headcount times one constant, every position
  is a longitude and latitude through one projection, and the scale bar is
  50 lieues communes of 4.4448 km converted at 55° north.

**Say what is not the original's.** Each generator's header names its
departures. Minard's rivers are schematic because no river geometry exists in
the dataset. Voyager's fourteen pulsars are real pulsars with real periods, but
they are not necessarily the fourteen on the plate, which cannot be read off
the photograph.

## What they found

All three of these were caught by a check, not by looking:

- **A `fontFamily` containing double quotes is silently dropped.** It is
  interpolated raw into the mirror's inline `style` attribute, so the first
  quote closes the attribute — and the figure is then measured and drawn in a
  face nobody asked for, with nothing reporting it. Every family stack in
  `typography.ts` is written in exactly that shape. These generators write
  their stacks unquoted as a workaround.

- **A wide label is reported as colliding with every steeply rotated box on the
  canvas.** `overlapsBox` back-rotates the label's rect into the box's frame
  and re-bounds it; for a page-wide title against a 62° count label that
  approximation is generous by a factor of thirty, and no amount of moving
  things can make the figure pass. `minard.mjs` works around it by rotating the
  glyphs without rotating the box, and sizing the box to the turned text.

- **Nothing checked a label against a Mark's outline or a Connector's route.**
  `text-fits-box`, `text-clear-of-other-boxes` and `boxes-do-not-overlap` all
  reason about boxes; a caption set straight across a curve passed every one
  of them. Twelve city names and a caption in `minard.mjs`, five month labels
  and a leader line in `nightingale.mjs` were sitting on ink nobody was
  checking against. This one is now a real core check —
  [`text-clear-of-ink`](../../src/checks.ts) — and both scripts are fixed and
  re-verified against it. See `experiments/exercises/README.md` for the fuller
  account, since that is where it was first found.

None of the three is a defect in a recreation. Each is a defect the
recreation was long enough and crowded enough to reach — which is the
whole reason this series exists.

## A second-order finding: deferred placement

Fixing `text-clear-of-ink` surfaced a second bug, in these scripts rather than
the core: both `minard.mjs` and `nightingale.mjs` place labels the instant
they're called, searching against only the ink that already exists at that
point in the script. Minard's city names are placed early; the rivers and the
temperature panel's tie lines are drawn much later. A city name searched a
board that didn't yet have that ink on it, found nothing to dodge, and kept
its original spot — which the finished plate then draws crossing a river
eleven functions further down the file.

`minard.mjs` now queues every `placeLabel` call and resolves the whole queue
once, at the very end, against the finished plate (see `pendingLabels` and
`flushLabels`). `nightingale.mjs`'s month labels needed a different fix: a
label sitting `tick` px past its own month's wedge can still, once rotated to
run along the rim, land inside a *neighbouring* month's wedge if that
neighbour's own reading was worse — so radial clearance is now checked as an
exact distance from the rose's centre to the label's own rotated box, against
whichever of the month and its two neighbours reaches furthest, rather than
compared against the month's own radius alone.
