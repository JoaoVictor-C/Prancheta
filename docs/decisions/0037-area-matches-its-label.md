# 0037 — An area is checked against its label

## Status

Accepted.

## The defect

The function-graph preset gained shaded regions — "área sob a curva", "área
entre curvas" — and Riemann rectangles. Each region is one closed `Mark`
whose vertices are all stated in one IR frame, and each carries a printed
area label: `"A = 4/3"`, `"A ≈ 2,67"`, `"8/3 u.a."`, `"2,5"`. The number is
computed by whatever produced the figure, but it is typed onto the page as
text, independently of the polygon that encloses the region — exactly the gap
[ADR 0019](0019-derived-geometry-and-annotation.md) opens with and
[ADR 0028](0028-length-labels-and-place-labels.md) closes for a straight run's
length. Nothing before this change compared the two. A region drawn twice as
large as the curve it claims to shade, beside a label carrying the correct
textbook answer, rendered with exit code 0.

Frame resolution already recorded `MeasuredIn` — the scale a straight run was
stated at — but only for a run of one segment (ADR 0028's rule). A shaded
region is not a run: it is a closed polygon of any number of segments, and
none of them had anywhere to record a scale.

## The decision

**Frame resolution now records `MeasuredIn` on a CLOSED mark of any number of
straight segments, under the same agreement ADR 0028 already requires for a
run's two ends: every vertex must be a `FramedPoint`, and every one of them
must agree with the first on scale (and, when the frame is not square, on
rotation too).** An arc segment has no vertex a shoelace sum can use, so a
mark with one records nothing, exactly as a curved connector already records
nothing for `length-matches-its-label`. A mark with fewer than two segments,
or one left open (`close` false and no `fill`), is ADR 0028's case already —
a single straight run — and is untouched: `scaleOf` still runs on exactly its
two ends. The new function, `scaleOfClosedOutline`, checks every vertex
pairwise against the first with the very same `scaleOf` ADR 0028 wrote, so
the "one scale" test is not a second rule living beside the first.

**`area-matches-its-label` reads a closed mark's area against its label,
shaped like `length-matches-its-label`:**

- The label is found through `annotates`, never by proximity.
- The area is the polygon's shoelace sum over its placed (canvas-pixel)
  vertices, divided by `xUnit * yUnit`. A frame's mapping composes a rotation
  with an anisotropic scale (`resolveInFrame`); a rotation preserves area, so
  the scale factor between canvas pixels² and frame units² is `xUnit * yUnit`
  regardless of which way the frame is turned. This is the one place area is
  simpler than length: `lengthInUnits` has to decompose a vector into
  along/across components precisely because the two axes scale differently,
  and an area does not care about direction at all.
- The label is parsed the way the project's formatter writes numbers (ADR
  0023: pt-BR, comma decimal), with a leading name and `=` or `≈` stripped
  (`"A = 4/3"`, `"A ≈ 2,67"`, `"≈ 1,33"`), plus one shape a length label never
  needs: an **exact fraction** — `"4/3"`, `"8/3"` — read as the rational
  number it spells rather than rounded to a decimal first. A trailing
  `"u.a."` is accepted and ignored, exactly as a length label's trailing unit
  is kept, except that nothing is compared against it — "u.a." names no
  physical quantity to be wrong about, unlike a frame's `Frame.unit`.
- A degree sign or a percentage is `sweep-matches-its-label`'s claim, not this
  check's, so it is refused here exactly as `statedLength` refuses it.
- **The tolerance has two parts.** A decimal label forgives half its own last
  printed digit, the length check's rule carried over unchanged; an exact
  fraction forgives none of that, because it claims to be exact. Both then
  add the polygon's own **sampling tolerance**: `function-graph`'s curve
  sampler (`FLAT` in `src/presets/function-graph/curves.ts`) places every
  sample within 0.125px of the true mathematical curve, the bound chosen
  there as a quarter of an output pixel. Perturbing every point of a closed
  polygon's boundary by at most `ε` moves its enclosed area by at most `ε`
  times the polygon's own perimeter — the symmetric difference between the
  true and the perturbed region is contained in a strip of width `ε` along
  the boundary, and a strip of width `ε` and length `L` has area `ε·L`. This
  project's own half-pixel `EPSILON` is folded into `ε` beside the 0.125px
  bound, for the same reason every other check forgives it. The result,
  `(0.125 + EPSILON) · perimeter`, is computed in pixels² and divided by
  `xUnit * yUnit` to reach the label's own units — the same conversion the
  measurement itself uses. For a region of bounded aspect ratio this is a
  small tolerance relative to the area it guards: perimeter grows like the
  square root of area for a shape that is not needle-thin, so the relative
  error shrinks as the figure gets bigger, which is why "a small relative
  error" is true of this bound rather than merely asserted of it.
- **A closed mark with no recorded scale gives `not-applicable`, never a
  pass**, naming why — an arc in the outline, an unframed vertex, or vertices
  in frames of disagreeing scale.
- **A label that states no number also gives `not-applicable`, never a
  silent skip.** This is the one place this check's shape departs from
  `length-matches-its-label`, which continues past a numberless label without
  reporting it at all. Both are real gaps in what a reader can trust — an
  area label with nothing to compare it against is exactly as unverified as
  a mark with no scale — and ADR 0019's not-applicable-never-pass rule says a
  gap like that is reported, not passed over in silence. Nothing forced the
  length check's earlier choice to be repeated here just because it came
  first.
- Reported per mark, not once per figure, for the reason ADR 0028 already
  gives: one figure can hold a measured region and an unmeasurable one, and a
  single figure-level verdict would have to hide one of the two.

## What was refused

**Converting `"u.a."` against a frame's `Frame.unit`, the way a length label
is checked against it.** A dimension line's `"m"` names a physical unit a
frame can agree or disagree with. `"u.a."` ("unidades de área") is a stand-in
for "whatever this frame's square unit is" and names nothing to be wrong
about; treating it as comparable would invent a rule with no defect behind
it.

**A separate `Mark.close` inference for the new function.** `scaleOfClosedOutline`
reads the same `close ?? fill !== undefined` default `buildMarks` already
computes at layout time, rather than adding a second definition of "closed"
that could drift from the one the renderer uses.

**Reusing `scaleOf` unmodified for the whole outline in one call.** `scaleOf`
takes exactly two points; generalising it to accept a list would change its
signature for a caller — `length-matches-its-label`'s two-ended run — that
never needed more than two. `scaleOfClosedOutline` instead calls the
existing two-argument `scaleOf` once per vertex against the first, which is
the same equality test repeated rather than a new one invented.

**Basing the sampling tolerance on the number of vertices instead of the
perimeter.** A count says nothing about how far apart the vertices are; a
hand-authored triangle with three vertices and a 400px perimeter needs the
same forgiveness per pixel of boundary as a 400-sample curve with a 400px
perimeter, and none of the extra forgiveness a naive per-vertex bound would
give the triangle for having so few points.

## The cost, stated

**A hand-authored polygon gets the same sampling forgiveness as a genuinely
sampled curve.** A triangle with three vertices is not sampled from anything,
so strictly it needs no forgiveness beyond `EPSILON`, but the tolerance
formula does not distinguish the two cases — it cannot, since nothing in a
`PlacedMark` says which mark came from a `Mark.segments` list an author typed
by hand and which came from two hundred points a preset generated. This
makes the check very slightly more forgiving than it has to be for a
hand-drawn shape, never less forgiving than it has to be for a sampled one,
which is the direction that matters: a false pass on a hand-drawn shape whose
area is off by more than a fraction of a pixel's worth of its own perimeter
is not a case this project has been asked to catch yet.

**A frame with no `unit` reports the area in bare "units²" with nothing to
compare that unit against.** The same hole ADR 0028 already records for
length: a label reading `"6 m²"` beside a region in a frame that never said
what a unit is passes on the number alone, because there is no
`Frame.unit`-shaped promise to check "m²" against.

**Blast radius.** `tests/checks.test.ts`, `tests/length-and-place-labels.test.ts`,
`tests/label-hides-and-claims.test.ts`, `tests/frame-grid.test.ts`,
`tests/frames.test.ts`, `tests/presets-render.test.ts` and `tests/mark.test.ts`
were run before and after this change; no existing test's result changed. A
figure with a closed mark and a numeric label that names a percentage (a pie
wedge, `"45%"`) is unaffected: `statedArea` refuses `%` exactly as
`statedLength` refuses it, and `area-matches-its-label` reports
`not-applicable` for that label rather than examining it, so no existing
fixture newly fails.
