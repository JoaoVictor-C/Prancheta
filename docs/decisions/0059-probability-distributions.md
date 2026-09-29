# 0059 — Probability distributions: the area is the probability

## Status

Accepted. Builds on [ADR 0036](0036-areas-and-riemann-sums.md) and
[ADR 0037](0037-area-matches-its-label.md); reads like
[ADR 0052](0052-linear-maps.md) in how the one number a reader copies is measured
against what is drawn.

## The need

Probabilidade e Estatística asks for one figure again and again. "Calcule
P(60 < X < 75) com X ~ N(70; 5²) e sombreie a área." "Encontre P(Z > 1,96)."
"Em um teste bilateral com α = 5%, marque os valores críticos." "Uma binomial
com n = 10 e p = 0,3: P(X = 3)." What the reader takes from it is a number, and
the number is an area: under a bell curve, or the sum of some bars' heights.

The project's answer was raw IR or `function-graph`. Neither knows a law. With
`function-graph` the density has to be typed as an expression
(`exp(-(x-70)^2/50)/(5*sqrt(2*pi))`), the region as a bound, and the number as a
label: `areas` prints the integral, which is right, but nothing knows that a
normal integrates to Φ, that a two-tailed test has two regions each with α/2, or
that bars are not a curve at all. And nothing does the exercise the figure
belongs to: the standardisation z = (x − μ)/σ, the table lookups, the
subtraction.

## The decision

**`distribution` is a preset whose typed numbers are the law's parameters and
the event.** `kind` is `normal`, `binomial` or `poisson`; the event is
`between`, `below`, `above`, `equals` or `tails`. The math is a new module,
`src/math/probability.ts`; the drawing is built on the same board and placer as
`linear-map` and `field`, and reuses `function-graph`'s polygon helpers
(`boxInside`, `distanceToPolyline`) without changing them.

### The frame's unit is a probability

Both scales are stated in the plane's own units: x in x units, and the vertical
axis in units of DENSITY (for a normal) or of MASS PER UNIT WIDTH (for bars of
width 1). A vertex `(x, f(x))` is stated in that frame, so the shoelace area of
a region in that frame is ∫f dx: the probability, with no constant. That is what
lets `area-matches-its-label` do here what it does for `function-graph`: it
reads the polygon's area in frame units and the printed number after the last
`=`, and fails the label when they differ by more than the digits printed. The
tests show it, editing one label to `P = 0,5000`.

Three consequences follow, and each was a decision.

**The polygon is finer than the check needs, because the check is coarse and
the printed number is not.** `areaSampleTolerance` forgives an eighth of a pixel
along the perimeter, which for the standard normal at 80px per unit is about
0,003: a label wrong in the third decimal would pass. So the polygon is sampled
until IT is right, not until the check is satisfied: an inscribed polygon is
short of the curve by the trapezoid rule's error, (h²/12)·(f′(b) − f′(a)), and
h is chosen so that stays under a fiftieth of the last printed digit
(h = σ·√(0,5·10⁻ᵈ), never below a quarter of a pixel). The tests integrate the
drawn polygon and hold it to 2·10⁻⁶ at four decimals.

**An open-ended region is drawn far enough.** `above 1,96` is a region that runs
to +∞, and a drawing has an edge. What lies past the edge is missing from the
polygon. At ±4σ that is 3,2·10⁻⁵ — less than a half-unit in the fourth decimal,
but enough to push a rounded value across, and more than the label's
resolution at `decimals` = 5 or 6. So an open-ended event widens the range until
the missing mass is under a tenth of the last printed digit (±4,5σ at four
decimals), in half-σ steps. A `between` keeps ±4σ, widened only to hold its
bounds with a σ to spare. The same rule picks how many bars are drawn: the
mass outside them is below the same threshold, and the event is always inside.

**A tail is its own region.** A two-sided event is two closed marks, each with
its own label, `α/2 = 0,0250`, each measured. A single label for both would name
neither polygon.

### One curve, drawn once

Where a region is shaded, its outline carries the curve; the unshaded curve is
drawn only where no region covers it. The curve is not a full mark under the
regions. `annotation-nearest-its-owner` measures a label to the NEAREST mark, and
a full curve mark would be nearer to a label sitting above a tail than the tail's
own outline, whose edge along the curve is just a piece of it: the label would
always be closer to the curve. Splitting the curve at the regions' edges makes
the region's outline the only ink there.

### The axis is furniture, the boundaries are not

Ticks and the axis line are `gridOf: "plane"`, as in ADR 0052: what a figure is
drawn on, not a rival for "nearest". The boundaries' numbers are labelled to
short open lines hanging from the axis, not to the region: a numeric label on a
closed mark is an AREA claim to `area-matches-its-label`, and "60" is not the
area of anything. Their vertical edges inside the region are the region's own
outline.

### Every number is arithmetic on the page, and the arithmetic is right

The panel does what the exercise asks. The subtlety is the last digit. The
standard textbook line is

    P(60 < X < 75) = Φ(1) − Φ(−2) = 0,8413 − 0,0228 = 0,8186

and it is wrong by one in the last place: 0,8413 − 0,0228 is 0,8185. Every table
lookup is rounded, the exact value is 0,81859…, and the line only *looks*
right because the answer was copied from the exact one. The preset does not
reproduce that. `operandDecimals` gives the operands as many decimals as the
operation on the page needs to combine to the printed result (here five:
`0,84134 − 0,02275 = 0,8186`), so a student who redoes the subtraction gets
what is written. The same rule covers `1 − Φ(z)`, `2 · tail`, and a sum of
masses; the tests re-do the subtraction over a sweep of 250 events.

A z that is not exact is written to three decimals and marked `≈`, and Φ is
evaluated at the exact z. Tables round z to two decimals first and would print a
result a little different in the fourth place; that is the tables' rounding, not
the law's, and the panel does not pretend otherwise.

A discrete probability shows the formula the exercise names,
`P(X = 3) = C(10, 3) · 0,3³ · 0,7⁷ = 0,2668`, and beneath it C(10, 3) = 120
when it fits on a line (exact, in BigInt); a range of up to six values is
`P(X = 0) + P(X = 1) + P(X = 2) = 0,0282 + 0,1211 + 0,2335 = 0,3828`, or its
complement when that is shorter, or a Σ when neither is.

### The math is accurate, and says how

`src/math/probability.ts` (tested in `tests/probability.test.ts` against scipy
values, published constants, exact BigInt rational arithmetic, and a 60-digit
decimal reference):

- **erf and erfc** to ~10⁻¹⁵, by the all-positive Kummer series below 2
  (A&S 7.1.6: no cancellation) and the Laplace continued fraction above it
  (A&S 7.1.14, modified Lentz), so Φ(−8) = 6,2·10⁻¹⁶ keeps its digits where
  `1 − erf` would print zero. Φ(−z) is always read from the tail.
- **Φ⁻¹**: Acklam's rational approximation and one Halley step against the
  accurate Φ, machine precision to 10⁻³⁰⁰. It turns α = 5% into z = 1,959964
  rather than a table's typed 1,96.
- **The binomial and Poisson masses**: Loader's saddle-point algorithm (2000),
  with `stirlerr` and `bd0` (R's `dbinom` and `dpois`), so no factorial or C(n, k)
  is ever formed: n = 1000 is right to ~10⁻¹³ relative, checked against exact
  rational arithmetic, and the masses sum to 1 to 10⁻¹³ for n up to 1000.
  Cumulative values sum masses from the shorter side.

### The approximation is a second answer, not a redraw

`approximation: "normal"` overlays the normal curve on the bars, draws the
continuity edges (±0,5) as dashed verticals, and states in the panel both
probabilities and the difference. The bars remain the exact answer and carry
the printed `P`; the approximation's value is in the panel, not shaded a second
time over the bars, which would put two regions on the same ink with two
labels, and one of them a `≈`.

## What was refused

**A typed density.** `function-graph` with `exp(-(x-70)^2/50)/(5*sqrt(2*pi))`
is the defect ADR 0022 exists to prevent, one level up: the density, the
bounds and the number are three statements free to disagree.

**A normal's `equals`.** P(X = k) = 0 for a continuous variable. A student
asking for it has usually meant `between` a rounded value's interval; the
refusal says so, and a shaded sliver of zero area is not a figure.

**`between` with both ends open on a discrete law.** `between: [3, 5]` includes
both ends; `strict` exists only on `below` and `above`, where the difference is
the exercise ("no máximo" and "menos de" are different questions).

**A z axis for a plain discrete law.** z = (k − np)/σ is only meaningful when the
normal is in the picture; `showZ` on a bare binomial is refused, not drawn.

**A second row that repeats the first.** For the standard normal x IS z, so
`showZ` is a no-op there; the one axis is named `z`.

**Colour alone for the event.** The event's bars carry an outline as well as a
fill, and the approximating curve is dashed and named: a print in grey still
reads.

**Leader lines.** A label too big for its region (a tail) sits beside it,
nearer to it than to anything else, which is what a leader would assert. A
leader would be another mark, and `annotation-nearest-its-owner` would
measure the label to it.

## The cost, stated

- A bold boundary number replaces the plain tick number under it and its near
  neighbours (1050 beside 1000); the tick is still drawn. Two boundaries too close for
  their numbers go in two rows.
- A normal drawn to ±4,5σ instead of ±4σ for an open-ended event, and its ticks
  at the whole σ multiples inside it (so at ±4 as well as ±3).
- The approximation shows one event only, and a Poisson approximation is only
  stated, not validated against a rule of thumb (the binomial's np and nq ≥ 5 is
  warned about).
- Text is measured by estimate before layout, as everywhere in the board; the
  panel wraps at a generous width.
- A fixture per event form and kind is not every combination: the sweeps in the
  tests cover the arithmetic; the fixtures, the drawing.
