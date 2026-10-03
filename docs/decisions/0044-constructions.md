# 0044 — A construction is a chain of definitions, and only its free points are typed

## Status

Accepted. Built; registration in `presets/index.ts` and the selection
vocabulary is pending (`src/presets/construction/INTEGRATION.md`).

## The need

Phase 3 (`docs/plans/PLAN-COVERAGE.md`) asks for a constructive 2D kernel:
intersections, perpendiculars, loci, and conics drawn analytically from their
foci. The two plane-geometry figures this project already has,
`fixtures/ir/isosceles-construction.json` and `fixtures/ir/circle-theorem.json`, show
why a preset is needed and not just more IR. Each is raw IR with its
coordinates worked out elsewhere: the isosceles apex is `(190, 243.19)`
because someone computed `190·tan 52°` outside the document, the circle
theorem's points are `(−140.954, −51.303)` because someone evaluated
`150·cos 200°` by hand. The frames of ADR 0019 tie each angle mark to its
arms, but nothing ties the arms to the triangle the exercise describes. If the
52 were edited, the apex would not move.

A Geometria Analítica exercise has the same shape one level up: "the distance
between A and B, the midpoint, the line through them", "the ellipse with foci
(±4; 0) and major axis 10". Every number the figure prints follows from a
few typed ones, and a figure that types them separately can disagree with
itself in every link.

## The decision

**A figure is a list of named objects, each defined from objects named before
it.** Free points (`{"A": [0, 0]}`) are the only coordinates an author types.
Everything else is one construction over earlier names: `midpoint`,
`intersection` (of two lines, a line and a circle, two circles), `foot`,
`onCircle`, `reflection`, `rotation`, the four triangle centres; `segment`,
`line`, `ray`, `perpendicular`, `parallel`, `perpendicularBisector`,
`angleBisector`, `tangent`; `circle` (by radius, by a point, circumscribed,
inscribed); `polygon`; `ellipse`, `hyperbola`, `parabola`. Order is the
dependency order, so a forward reference is an undefined name and a cycle
cannot be written.

**Every construction is a call into `src/geometry/vec.ts` (ADR 0043).** The
intersection of two lines is `intersectLines2`, a tangent point is
`intersectCircles2` against the Thales circle on PC, a bisector is
`angleBisectors2` with the internal one picked by its direction, a
circumcircle is `circleThroughThreePoints2`. The tolerance and the ordering of
two solutions are vec.ts's, stated once there, so a `which: 0` here means
exactly what it means to the R³ layer: first by x, then by y. Three small
helpers were not in vec.ts and live in the preset: a 2D rotation about a
point, the incentre, and the angle AVB in degrees.

**Conics are drawn from their defining elements, never from a contour.** An
ellipse from its foci and a is the parametric curve with b = √(a² − c²); a
hyperbola is two cosh/sinh branches clipped to the view; a parabola is the
vertex form along the axis from the directrix to the focus. The tests hold
every sampled point to its focal definition: |PF₁| + |PF₂| = 2a,
||PF₁| − |PF₂|| = 2a, |PF| = d(P, d). The canonical equation is computed
from the same a, b, p and centre and written through the one pt-BR formatter
with `snapExact` (`x²/25 + y²/9 = 1`, `(x − 2)²/9 − (y − 1)²/16 = 1`,
`x² = 8y`). A conic whose axis is not parallel to a coordinate axis has no
canonical equation without a rotation of axes, and asking for one is refused.

**Annotations are derived too.**

- A **length** label is computed from the segment it names and printed exact
  when it is short (`5`, `2,4`) and to hundredths otherwise (`7,21`). The
  segment is a mark stated in the plane's frame, so ADR 0028's
  `length-matches-its-label` measures the label against the run. A length
  label may name only a DRAWN segment or polygon side.
- An **angle** is a `sweep` whose arms are the two sides, and its degrees are
  computed from them, so `sweep-matches-its-label` measures the label against
  the arc (ADR 0019). A 90° angle is drawn as a right-angle square instead. An
  angle may carry a name instead of a value (`x`, the unknown), and that is
  the only free text on an annotation. It may not contain a digit.
- **Equal ticks** are refused on segments that are not equal. `equalTicks`
  finds the equal groups itself.
- A **point's name** `annotatesPlace` the point (ADR 0028), and its dot counts
  as the place (ADR 0035). A `coords` label prints the computed pair.

**What the drawing cannot say exactly goes to a readings panel.** `√13` is not
a number `length-matches-its-label` reads, and printing it on the drawing
would leave the one number a student reads there unmeasured. So the drawing
says `3,61` and is measured, and the panel under the plane says
`AB = √13 ≈ 3,61`. Equations and rounded angles (`∠CBA ≈ 36,87°`) go there
too. The panel is free-standing text that repeats nothing the drawing already
states exactly.

**Labels are placed by the checks' own metrics, with no backing.** Every
candidate spot is scored against `text-clear-of-ink` with a 3px margin (the
reviewer's allowance for a wider font), `text-clear-of-other-boxes`,
`label-nearest-its-place` (near edge within the label's size, nothing that does
not pass through the place nearer) and `annotation-nearest-its-owner` (own ink
nearest from the centre). Text on a line costs more than anything else. A
point's name is tried first in the widest gap between the lines leaving the
point, facing out of the figure. No label is set on paper, so no backing can
cut a line. Points are drawn last, so no dot sits under a line through it.

### Residual checks

The only typed-looking text on a construction is a length and an angle.
**Both are measured**: every length label by `length-matches-its-label` against
its run in frame units, every angle label by `sweep-matches-its-label` against
its arc. `tests/construction.test.ts` confirms this on a rendered figure: all
four lengths of the 3-4-5 triangle pass, and replacing its "5" with "6" fails.
The remaining free text consists of names: a point's, an object's, an angle's.
An explicit `label` or annotation `name` is refused if it contains an ASCII
digit or types a coordinate. An object's own name (`F1`, printed when it has
no `label`) is trusted as a name.

## What was refused

**Typing a derived coordinate, even as a convenience.** A second way to place
C "at (3; 3,84)" would bring back the isosceles fixture's defect. The
fixture's content is now `fixtures/construction/isosceles.json`. The 52
appears once, as the rotation that makes the two base rays. C is their
intersection, and the printed `52°` is measured off the drawn arc.

**Intersecting through a segment's ends only.** An intersection uses the
carrier lines, as a construction on paper does. Refusing a meeting point that
falls outside a drawn segment would make "extend BC and find where it meets
the altitude" unwritable.

**Guessing between two solutions.** When a line and a circle, or two circles,
or two tangents give two points, the author says `which` (vec.ts's fixed
order) or `other` (the one that is not a named point). Picking one silently
is how a figure draws the reflected triangle.

**A contour for the conics.** `contour.ts` draws implicit curves by marching
squares for function-graph (ADR 0029), and PLAN-COVERAGE records the gap it
left in a hyperbola's branch. The conics here have closed parametric forms,
and sampling those is exact to the sample.

**Printing `√13` on the drawing.** Covered above: an unmeasured number on the
figure is the defect this project exists to prevent.

## The cost

**Exact irrational lengths are only in the panel.** A student sees `7,21` on
the segment and `d = 2√13 ≈ 7,21` below. Teaching `√13` on the segment itself
would need `length-matches-its-label` to read root forms, a change to
`checks.ts` this preset did not make.

**A crowded interior has no honest spot.** A short segment crossed by other
lines (an incircle radius between two bisectors) can leave no spot beside it
that is off every line and nearer its own ink. The label keeps its least-bad
spot and the checks fail, which is what happened while building
`triangle-incircle.json`. That fixture draws the radius with its right angle
but no length for this reason. The placer is a candidate search, not a solver.

**The grid's origin "0" has four spots only.** A hyperbola centred at the
origin with its asymptotes puts a line through every corner of the origin, and
the grid (ADR 0034) has nowhere to move the zero. `text-clear-of-ink` then
fails on the grid's own number. The hyperbola fixture is centred at (2; 1),
which also exercises the translated canonical form. A tick number can step
sideways off a curve only when half a division leaves room, so in axes mode a
division is at least 48px. A wide figure can therefore be large.

**Readings are one list.** Equations, rounded angles and exact lengths share
one panel under the figure. There is no per-object placement of an equation
beside its curve.

**Refusals are exact.** Every degenerate case uses vec.ts's tolerance,
`1e-9`, relative. A construction whose free points come from rounded data
(two circles "tangent" at three decimals) is classified by those decimals,
with no looser snap to what the author meant.

## Blast radius

New files only: `src/presets/construction/` (`preset.ts`, `place.ts`,
`PRESET.md`, `INTEGRATION.md`), `tests/construction.test.ts`,
`fixtures/construction/` (nine fixtures) and this ADR. `vec.ts`, the checks
and the shared presets are unchanged. Until registration, `preset-docs`'s
orphan test fails on `construction`.
