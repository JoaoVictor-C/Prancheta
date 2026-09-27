# 0036 — Areas and Riemann sums are derived from the curves they lie under

## Status

Accepted. Extends [ADR 0022](0022-function-graph-preset.md) and
[ADR 0029](0029-curves-beyond-graphs-of-functions.md); measured by
[ADR 0037](0037-area-matches-its-label.md).

## The need

Cálculo 1 and 2 are full of three figures `function-graph` could not draw: the
area under a curve ("área sob a curva"), the area between two curves ("área
entre curvas") and the Riemann sum ("soma de Riemann"). Each had only the ways
round it this project exists to refuse:

- a polygon of typed vertices, a second statement of the curve, free to
  disagree with it;
- a number typed beside it, "A = 8/3", free to disagree with both.

The numeric kit (`src/math/numeric.ts`) already had `integrate` and `riemann`,
built and tested with no consumer. `riemann` returns the rectangles it summed
precisely so a figure could draw those and not a second computation of them.

## The decision

### What the input says

- `areas: [{of, from, to}]` is the region between one curve and the x axis.
- `areas: [{between: [f, g], from, to}]` is the region between two curves.
  With no `from` and `to`, the bounds are the curves' first and last
  intersection.
- `riemann: [{of, from, to, n, rule}]` draws a sum, with `rule` one of `left`,
  `right`, `mid` or `trapezoid`.

Bounds are `Bound`s, as ADR 0029 made them, so `"pi/2"` and `"2pi"` are exact.
Areas and sums are taken under graphs y = f(x) and lines only. A parametric,
polar or implicit curve is refused by name.

### Everything drawn and printed is computed

- **A region's outline is sampled from the expressions.** The sampler is the
  one parametric curves use (`sampleParametric`), run at 8× the plane's scale.
  Every vertex is (x, f(x)) evaluated afresh, and lies on its curve. A bottom
  edge on the axis is two vertices. The ends are exactly `from` and `to`.
- **Bounds between curves are found, not guessed.** They are the roots of
  f − g, found by the sign chart's `criticalPoints`: sign change, bisection,
  and snapping to an exact value when f − g vanishes there. So x² and x + 2
  meet at exactly −1 and 2. Fewer than two intersections is refused.
- **Where the integrand changes sign, the region is cut there.** The cuts are
  the roots of f (or f − g) inside the interval, found the same way. A root
  that only touches splits nothing. Each part is its own closed mark with its
  own label, shaded by sign: the curve's colour above (or where f > g), rust
  below.
- **The printed number is `numeric.integrate`'s**, integrated piece by piece
  between a piecewise function's joins so Simpson never straddles a jump.
- **A Riemann figure draws exactly `numeric.riemann`'s rectangles.** Each is a
  closed mark with vertices (x0, 0), (x1, 0), (x1, h), (x0, h), or the two
  heights of a trapezoid. A negative height is drawn below the axis because it
  is negative, not because a branch decided so. The sample points of
  left/right/mid are dots declared `on` the curve, so `feature-on-its-curve`
  holds them to it.
- **Every vertex is stated in the graph's own frame**, as
  `{frame: "plane", x, y}` in axis units. Frame resolution turns them into
  pixels and records the scale `area-matches-its-label` measures in
  (ADR 0037). No vertex is pre-resolved to canvas pixels by the preset.

### What a printed value means

**The label on a region states that region's geometric area.** In each part it
prints |∫| over that part, as "A = 8/3", or "A₁ = 2" and "A₂ = 2" for sin on
[0, 2π]. That is the one number `area-matches-its-label` can hold a polygon to,
since a polygon has no sign.

**The signed integral is a caption**, asked for with `value: "integral"`. For
sin on [0, 2π] it prints "∫ = 0" beside "A₁ = 2" and "A₂ = 2". With the
default `value: "area"`, a region of several parts gets the total geometric
area as its caption, "A = 4". `total` switches the caption off or gives it a
template. This is the classic exercise put on the page: the integral is zero,
the area is not.

### How a number is written

The value goes through the one formatter, with one ordering decided here:

- an exact decimal of up to six places first, so a sum of 35/16 prints
  "2,1875" beside "∫ = 8/3";
- otherwise the formatter's exact fraction: 4/3, 8/3, 1/6;
- otherwise three decimals, and the "=" before the number becomes "≈"
  ("A ≈ 1,718"). A rounded number is never printed beside an equals sign.

The long-decimal step compares within 1e-9, not the formatter's 1e-7, because
e's integral from 0 to 1 is within 2e-7 of 1,718282.

### How each label declares what it names (ADR 0035)

| label | claim | measured by |
| --- | --- | --- |
| a region's (or part's) area | `annotates` the region's closed mark | `annotation-nearest-its-owner`, `area-matches-its-label` |
| a sum, "S₄ = 1,75" | `annotates` the outline of the rectangles' union, a closed mark whose area IS the sum | the same two |
| a total, "A = 4", or a signed integral, "∫ = 0" | `freeStanding` | nothing positional |
| the exact integral beside a sum, "∫ = 8/3" | `freeStanding` | nothing positional |
| a legend row for an area or a sum | `annotatesPlace` inside its filled swatch | `label-nearest-its-place` |

A sum names n rectangles at once, and no single rectangle has its area. So the
figure draws one more closed mark, the outline of their union, stroked a
little heavier than the rectangles, and the sum's label names that. Its
shoelace area is Σ hᵢ·w, the sum itself, even where rectangles stand on both
sides of the axis: each slab contributes its signed area.

A total or an integral caption names a union or nothing drawn, so it claims
no mark.

### Where the labels go

Positions are searched, never typed.

- **A region's label goes inside the region** where its box fits whole, at
  the deepest clear spot, off the gridlines where it can be. The spot is taken
  only if the region's outline is the nearest mark to the label's centre,
  measured as `annotation-nearest-its-owner` measures it.
- **Otherwise, and for a sum, it goes outside**, against the owner and beside
  its middle, never at a tip.
- **A sum whose rectangles all stand on one side of the axis** is labelled on
  the other side, centred under them, past the tick numbers. There the curve
  that runs over their tops is farthest.
- **Captions keep off every region.** "A = 4" set inside the first lobe of sin
  reads as that lobe's area.
- **The legend search avoids regions too**, as it avoids ink.

Every searched label carries a halo that hides only the faint lattice under
its text. `backing-hides-no-ink` allows a backing exactly that. Inside a
region the halo is the region's own tint, made opaque, so it is invisible
against the tint. Outside it is paper. The search has already kept the box
clear of every curve, axis and stroke, which no backing may cover.

### Paint order and colour

Regions and rectangles paint before the curves, so a curve is never under its
own shading. Sample dots paint after them.

A region is a fill with no stroke. It is a surface a label may sit on, never
ink a label must avoid, and `text-clear-of-ink` agrees. The tint is 11%
opaque, chosen for contrast:

- at 17%, the rust tint of a region below the axis put the tick numbers "3"
  and "4" at 4.3:1 (`contrast-sufficient` failed);
- at 11%, FAINT on every palette colour's tint measures 4.65 to 4.74:1, and a
  label in the region's own colour keeps 4.7:1 or better.

## What was refused

- **Typed vertices, or a typed area.** Each is the defect ADR 0022 was written
  against, one level down.
- **One label for a region whose parts have different signs.** A polygon's
  area is geometric, so "∫ = 0" on the whole sin region would be a label its
  own mark contradicts. Parts are labelled; the signed total is a caption.
- **Labelling one rectangle with the sum.** It would be compared, correctly,
  with that rectangle's area and fail.
- **Hatching to tell the signs apart.** Nothing in the renderer draws a
  pattern fill today (grep finds none; the plan's M4 note is not built). The
  parts are told apart by hue, by lying on opposite sides of the axis (or
  curves), and by having separate labels. A pattern fill is a renderer
  feature, and would need the contrast check to learn what it composites to.
- **Clipping a region to the plot.** A clipped region would not have the area
  printed in it. A region that leaves the plotted range is refused, naming
  the y it reaches.
- **Integrating through a pole, or across one between sample points.**
  `integrate` refuses a non-finite sample. A pole found by `criticalPoints`
  inside the interval is refused before any sampling. A Riemann sum whose
  samples happen to miss a pole is computed, since `riemann` cannot see
  between its points, but asking for its integral is refused.

## The cost, stated

- **A region too thin for its label gets it outside.** It sits against the
  region's middle, and is measured and passed. A reader may still attach it to
  the curve that forms that edge. Between x² and 2x at a normal scale, no
  axis-aligned box fits inside the lens. The remedy is a larger `unit`. No
  leader line is drawn: a leader would be the nearest mark to its own label.
- **A sum label on rectangles of both signs** has no side of the axis to
  itself. It is placed by the general search, which on the sign-change fixture
  puts it above the curve's low part, beside the steps.
- **Parts are told apart by hue first.** Colour-blind readers get the axis
  and the labels, not the fill.
- **The printed value can be one a label check cannot read.** A signed
  caption "∫ = −2" is free-standing and measured by nothing. A part label is
  always a magnitude and is always read.
- **The search costs time.** Label spots are scanned on a 3px lattice against
  every mark's polyline. A 700×700 figure with one region takes about a
  second to expand.

## Found while building it

- **The first tint failed contrast, and only where a region lies below the
  axis.** At 17% the checks passed every region above the axis. The rust lobe
  of sin, which covers tick numbers, failed `contrast-sufficient` at 4.3:1.
  The tint was lowered for every region, not just negative ones, so no region
  can fail this way when it happens to cover a number.
- **The first between-curves fixture could not hold its own label.** It was x
  and x², then 2x and x². Its label fell outside the lens, above the line, and
  read as the line's. The measured nearest mark was still the region, so the
  checks passed. The fixture is now x² and x + 2, the lens a student meets,
  and the cost above records the thin case.
- **A fixture-count assertion assumed only `curve-` files shared the
  directory with the sheet's figures.** `tests/function-graph-render.test.ts`
  now excludes `curve-`, `area-` and `riemann-` when it counts the sheet's
  fifteen.
