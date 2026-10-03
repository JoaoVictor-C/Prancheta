# Exercise plates

Eight sheets a student could be handed — two each in chemistry, physics,
geography and biology. Every one renders clean: no unrepaired check, exit 0.

```bash
node experiments/exercises/phys-lens.mjs && npm run render experiments/exercises/phys-lens.json -- -o out/exercises
```

## The one authoring rule

**The geometry is always true. The answer is withheld only by not printing it.**

Drawing an unknown at a false value — a ray at a slope the stated focal length
does not produce — would be [this project's founding
defect](../../docs/plans/PLAN-EXERCISES.md) committed on purpose, and every check
that makes a plate worth anything would have to be switched off for it to pass.
So a quantity the exercise asks for is drawn exactly where it is and carries a
`?` instead of a number. A reader can measure an estimate off the page. Good:
an estimate they then have to justify by calculation is the exercise working.

## The selection rule

A plate earns its place when it carries **two representations of one
computation, reaching the page by different code paths from a shared input** —
so the figure can contradict itself and a check can say so. That criterion is
*sufficient, not necessary*: `fixtures/ir/circle-theorem.json` has one construction
and one printed angle, and `sweep-matches-its-label` compares them. Either route
counts; a plate with neither does not.

| plate | asks | the two representations | what would catch it lying |
| --- | --- | --- | --- |
| `chem-titration` | pKa, equivalence volume, the acid's concentration | the pH curve solved from the charge balance, and its **numerically differentiated** inset, whose peak must land on the marked equivalence volume | `annotation-nearest-its-owner` |
| `chem-phase` | which boundaries two paths cross, and where | boundaries fitted through the real triple and critical points, and the printed crossing conditions tied to measured crossings | the fit passes through the dots it prints |
| `phys-lens` | image distance, magnification, real/virtual | three principal rays constructed independently, and the solved image point all three must terminate on | **`constraints-satisfied`** — `align` on center-x *and* center-y is coincidence at 0.1px |
| `phys-collision` | the second puck's speed and angle | the scene's velocity vectors, and the head-to-tail momentum triangle built from the same solved set | `constraints-satisfied` for closure, `sweep-matches-its-label` for the 30° |
| `geo-contour` | a gradient, and an intervisibility | marching-squares contours, and a section sampled from **the same height field** | the two panels are one function; a hand-drawn section is where this normally goes wrong |
| `geo-stripes` | the half-spreading rate | mirrored anomaly stripes in kilometres, and the polarity timescale in millions of years — one chron array | the mirror is structural, so the flanks cannot drift |
| `bio-pedigree` | mode of inheritance, a carrier probability | inferred obligate-carrier shading, and a Punnett square filled from the same inference | the square and the shading come from one propagation |
| `bio-gel` | the length of an unknown fragment | ladder bands placed by `d = A − B·log₁₀(bp)`, and a calibration **least-squares fitted to those same bands** | a band off its own fitted line is visible |

## What is honestly not derived

Named here rather than buried in the code, because a plate that overclaims is
worse than one that admits a limit.

- **`bio-pedigree` positions are authored.** A pedigree is a DAG — two parents
  converge on every child — and no layout in this repertoire handles converging
  parental edges. What is computed is the *shading*, not the geometry. This is
  the weakest plate of the eight and its header says so.
- **`chem-phase`'s melting line is not fitted.** Both vapour boundaries are
  two-parameter fits solved through real measurements; the fusion line is drawn
  from the triple point for the sign of its slope alone.
- **`geo-contour`'s terrain is analytic**, not surveyed. The point is that the
  contours and the section come from one function, not that the hill exists.

## Notes from building them

Each of these cost a render to find, and each is now handled in
[`sheet.mjs`](sheet.mjs) so no plate has to rediscover it.

- **A rotated label needs a box sized to the *turned* text.** Size it to the
  unrotated line and a 90° axis title overflows by its own length — then the
  repair loop flips `wrap` and sets it as a column of single words. Long axis
  titles are now set across instead of turned; short ones get a rotated box.
- **`anchor: "center"` is resolved during frame resolution only.** A block that
  states no frame never sees it, so x/y stay its top-left corner.
- **A Connector between two bare points joins nothing**, so it earns no
  exemption from `connector-clear-of-boxes` — an arrow landing on a marker
  block is reported as crossing it. Arrows and dimensions here are drawn as
  marks; the check stays strict for connectors that really do join two things.
- **An annotation must be nearer its own arc than anything else.** An angle
  label pushed out for legibility drifts closer to the axis beneath it and
  `annotation-nearest-its-owner` says so. Put the arc further out and the label
  closer in.
- **A landmark label in the same colour as its marker dot** scores 1:1 on
  `contrast-sufficient` if it lands on it. The dot has to be claimed before the
  label is placed.
- **Deferred placement, not call-order placement.** `place()` used to resolve
  a label's position the instant it was called, against whatever ink already
  existed at that point in the script. "F′" was labelled before ray 2 and the
  `f = 20 cm` dimension were drawn, found nothing to dodge, and kept its
  original spot — which a later render then reported sitting on both. `place()`
  now queues every call and resolves the whole queue once, at `spec()` time,
  against the finished sheet. Label-vs-label order is unaffected (the queue
  still resolves in call order); only ink visibility changed.

## `text-clear-of-ink`: a check that did not exist

Everything above was `sheet.mjs`'s own best-effort placer — useful, but
advisory: nothing in the pipeline actually verified a label stayed off a Mark's
outline or a Connector's route. `text-fits-box`, `text-clear-of-other-boxes`
and `boxes-do-not-overlap` all reason about *boxes*; a caption drawn straight
across a curve passed every one of them. Eight plates rendered green while an
angle label sat on the arrow it was measuring — exactly the failure class this
project exists to catch, reappearing in the one place nothing was looking.

It's now a real core check — [`text-clear-of-ink`](../../src/checks.ts),
wired into `runChecks` beside the other text checks, exempting a mark or
connector a label's owner `annotates` (the same relief already granted against
boxes) and grid furniture (`Mark.gridOf`), and skipping marks with no visible
stroke (a filled region with no border is a surface, not a line). Covered by
unit tests in [`tests/checks-scene.test.ts`](../../tests/checks-scene.test.ts)
and measured against the full 72-fixture suite before landing: **zero
fixtures changed their failure set**, and the check passed on every one —
new coverage with no blast radius. It found real, sub-pixel-precise
collisions across all eight plates here and both finished recreations, which
have since been fixed and re-verified against it, not against the old
heuristic.

### The exemption itself had the same hole it was built to close

The relief above is unconditional on `annotates` alone: a label sitting on
the one thing it names is exempt no matter what. That is exactly wrong for a
label with no fill of its own — which every angle label here is, since
`p.angle()` draws bare text, not a filled box. A transparent label gets the
exemption, the arc still passes directly through its glyph, and
`text-clear-of-ink` reports a pass on a figure a reader can see is broken.
That is precisely how `phys-collision`'s θ₂ and, it turned out, two more
figures (`fixtures/ir/circle-theorem.json`'s "x", `fixtures/ir/isosceles-construction.json`'s
"x") all got past a check built to catch exactly this.

The fix narrows the exemption to what it was always supposed to mean:
relief is earned by actually covering the ink, not merely by naming it.
`textClearOfInk` now checks whether the label's owner has an opaque fill
(`isTransparent(owner.fill)`, the same test `surfacesUnder` already uses to
decide what a label is legible against) before granting the pass — an opaque
owner really does paint over its annotated arc, so the relief holds; a
transparent one paints nothing, so the arc it's exempted against must still
clear the glyph, exactly like any other ink. `annotation-nearest-its-owner`
still requires the proximity; this only stops proximity from silently buying
overlap it never earned.

Measured with the same before/after blast-radius method as the check
itself: 82 of the full fixture-and-plate suite were unaffected. One more
real defect surfaced — `fixtures/ir/isosceles-construction.json`'s own "x"
label, sliced by its "apex" arc, never looked at by hand because nothing
had pointed at it — fixed the same way as the other two, by moving the label
further out along its own radial direction until its nearest point clears
the arc's radius with margin. All three are now re-verified clean by eye,
not just by the check that used to wave them through.
