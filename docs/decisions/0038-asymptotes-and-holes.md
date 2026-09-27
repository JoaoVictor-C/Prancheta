# 0038 — Asymptotes and holes are found from the expression, and confirmed by its limits

## Status

Accepted. Extends [ADR 0022](0022-function-graph-preset.md), reuses the root
and pole finder of [ADR 0027](0027-sign-chart.md) and the limits of the
numeric kit (`src/math/numeric.ts`). Its labels follow
[ADR 0035](0035-what-a-label-hides-and-claims.md).

## The need

"Assíntotas verticais e horizontais" and "descontinuidade removível" are a
whole week of Cálculo 1, and `function-graph` could draw neither. The ways
round it were the ones this project exists to refuse:

- a `guides` entry at a typed x, "x = 1" typed beside it — a second statement
  of where the pole is, free to disagree with the expression, and drawn in the
  style of a guide to a point, which it is not;
- an open point typed at `[1, 2]` — the hole's height typed, when it is a
  limit the figure can compute.

And one defect was already there. A graph is drawn from 240 even samples, and
a run is broken only where a sample is undefined or leaves the y range. On a
tall y range, 1/(x − 1) has samples at +84 and −44 on either side of its
pole, both in range, and the preset joined them with a vertical stroke
through the asymptote. No check noticed.

## The decision

### What the input says

On a function given by one expression (`expr`, with an optional `domain`):

- `"asymptotes": true` — every asymptote the numerics confirm;
- `"asymptotes": {"vertical": ..., "horizontal": ..., "oblique": ...}` — by
  kind. `true` means *this kind exists*; left out, *draw it if found*;
  `false`, *do not draw it*. `vertical` may instead be a list of the x of each
  asymptote the figure claims (`[1, "pi/2"]`);
- `"holes": true`, a list of x, or `{"at", "label", "towards"}`.

Piecewise, parametric, polar and implicit curves are refused by name: a
piecewise function's open and closed ends are already `points`, and the
others have no single expression in x to take a limit of.

### Everything drawn and printed is computed

**Where to look is read off the expression's tree.** A division may blow up
where its denominator vanishes, a logarithm where its argument does, tan
where cos of its argument does, a power where its base does. The zeros of
those subexpressions are found by the sign chart's `criticalPoints` (sign
change, bisection, touching roots, snapping), and joined by the poles
`criticalPoints` sees in f itself. That set is deliberately too large: a
candidate costs two limits to dismiss, a miss costs an asymptote.

**Nothing on that list is believed until its limits say so.** At each
candidate a, `numeric.limit` is asked from the left and from the right:

| left and right | verdict |
| --- | --- |
| either side ±∞ | a vertical asymptote x = a |
| both finite, equal, and f(a) undefined | a hole at (a, L) |
| anything else — a jump, a continuous point, a limit that would not settle | nothing is drawn |

**At ±∞ the same kit decides**, on each side separately, and only on a side
the function is drawn out to the edge of the plot:

- lim f(x) finite → a horizontal asymptote y = L;
- lim f(x) = ±∞, m = lim f(x)/x finite and nonzero, q = lim (f(x) − mx)
  finite → an oblique asymptote y = mx + q. m is snapped before q is asked
  for, because q is read off f(x) − mx at x in the millions, where a rounded
  m leaves its own error times x behind;
- anything else → none, with the reason kept for a refusal.

A function that is itself the line (2x − 1, or (x² − 1)/(x − 1), which is
x + 1 with a hole) has no asymptote on that side: no exercise calls a line
its own asymptote.

**Every number is snapped to the exact value it is.** A position found by
bisection is snapped within 1e-7; a limit's value, which `numeric.limit`
settles only to about 2e-5, within 1e-5. The candidates are a small fraction
(q ≤ 12), ±√n (n ≤ 400) and kπ/q (q ≤ 12) — the sign chart's set plus π,
because tan's poles and arctan's limits are the textbook's first examples.
So the figure prints `x = π/2`, `y = −π/2`, `y = 2`, never `1,571`. A number
that snaps to none of them is printed rounded, and the `=` in its label
becomes `≈`, as ADR 0036 does for areas.

**A hole's height is the limit.** Where the expression is undefined, y is
the two-sided limit, snapped. A hole may also be declared where the expression
never skips ("x + 4, x ≠ 4" — ADR 0027 already said such a hole must be
declared); its y is still the limit, and a declared hole with no finite
two-sided limit is refused.

### What is refused, by name

- a kind set to `true` that does not exist: "f has no horizontal asymptote:
  as x → +∞, f(x) → +∞; as x → −∞, f(x) → −∞" (for x³);
- `"asymptotes": true` on a function with none (a polynomial);
- a claimed vertical asymptote the limits deny: "f has no vertical asymptote
  at x = 2: as x → 2⁻, f(x) → 1; as x → 2⁺, f(x) → 1", and at a removable
  point, "... — that is a hole, which "holes" draws";
- `"holes": true` where there is none, a declared hole without a finite
  limit, a hole or an asked-for asymptote outside the plotted range.

What the numerics cannot confirm and nobody claimed is simply not drawn.

### Drawing

**An asymptote is a thin dashed line in its function's colour** (1.4px,
`dashed`), across the plotted y range for a vertical one, and for the others:

- the same line at both ends is one line across the whole x range;
- different lines at the two ends (arctan's y = ±π/2, √(x² + 1)'s y = ±x)
  are each drawn only toward their own side, meeting in the middle of the x
  range;
- a line only one end has (e^(−x)'s y = 0 on the right) runs from the middle
  to that end.

It is painted before the curves, so a curve paints over the line it
approaches. A horizontal asymptote y = 0 is drawn over the x axis, and x = 0
over the y axis: the dashes in the function's colour on the grey axis are how
the figure says the axis is the asymptote.

**How it is told from a guide and from a dashed curve.** Colour does not
count (`series-distinguishable-without-colour`), so the answer is the check's
own: every asymptote is its own series and always carries a direct label, its
equation. There is no option to switch the label off; an unlabelled dashed
line is exactly what a guide looks like. Beyond that, a guide is grey, 1.1px,
and runs from a point to an axis; an asymptote spans the plot. A function
drawn dashed keeps its 2.6px weight and its own label.

**A vertical or horizontal asymptote yields to the axis number on its
gridline as a guide does.** x = 1 runs through the spot of the "1" under the
x axis. Stepping the number off would move it away from the very place the
asymptote crosses the axis, so the number keeps its spot and the dashed line
is cut around it (`breakGuides`, ADR 0022). An oblique asymptote only crosses
numbers in passing, and they step off it as off a curve.

**A hole is an open ring** at (a, lim f): the existing open point, radius
5.5px, stroked in the curve's colour, filled with paper, painted after every
curve. The curve's runs end at the hole itself on both sides, under the ring,
so its stroke never shows inside it. The ring is declared `on` the curve, so
`feature-on-its-curve` holds the computed limit to the drawn curve within
1.5px.

**The curve is never joined across a pole.**

- A graph with asymptotes or holes is sampled on each stretch between its
  poles and holes, adaptively, by the sampler parametric curves use
  (`sampleParametric`), and clipped exactly (Liang–Barsky). Near a vertical
  asymptote it then runs up to the edge of the plot instead of stopping one
  even sample short, which a reader sees as a curve that ends before the
  asymptote says it should.
- Every other graph keeps its 240 even samples (ADR 0029 kept them for the
  measured baseline of the Cálculo 1 figures), with one change: two
  consecutive in-range samples whose values differ by more than 8px are
  bisected toward the half that changes more. A continuous stretch's change
  shrinks below half a pixel; a pole's or a jump's does not, and the run is
  broken there. None of the 27 existing function-graph fixtures changes by a
  byte.

### How each label declares what it names (ADR 0035)

| label | claim | measured by |
| --- | --- | --- |
| an asymptote's equation, "x = 1" | `annotates` its dashed line (the piece beside it, when an axis number cut the line) **and** `names` its series | `annotation-nearest-its-owner` (centre to polyline), `curve-label-nearest-its-curve` (box to polyline), and it is the line's direct label for `series-distinguishable-without-colour` |
| a hole's label, "(1; 2)" | `annotatesPlace` the hole | `label-nearest-its-place`; the ring at the place does not compete |

**Where an asymptote's label goes.** Beside its line, never on it: candidates
are offset perpendicular to the line by half the label's extent across it
plus 5–30px, on both sides, all along it. A spot is kept only if its box is
clear of every stroke and every label (so its paper halo covers only the
faint lattice, which ADR 0035 allows a backing), off the usual spots of the
axis names (placed last, which would otherwise be pushed into the curves),
and only if this line is nearer the label than any other mark by centre and
any other series by box, each with a pixel of margin. Among those, the first
by a score that prefers the end the asymptote describes — the top of a
vertical one, the right end of y = L at +∞, the left end at −∞ — and spots
between gridlines. For 1/(x − 1)² the curve hugs x = 1 on both sides at the
top, and the label goes to the bottom, where it is honest.

## What was refused

- **Typed asymptotes.** `guides` with a typed x and a typed "x = 1" is the
  defect ADR 0022 was written against, one level down.
- **Guessing what the numerics cannot confirm.** ln x at 0 is a vertical
  asymptote, and `numeric.limit` cannot see it: at 6·10⁻⁸ from 0, ln is only
  −17, far below the size (10⁴) at which the kit calls a tail infinite, and it
  is still moving, so it is "none". The figure draws nothing there rather
  than special-case a logarithm. Claiming it (`"vertical": [0]`) is refused
  with the limits' own words.
- **Symbolic cancellation to find holes.** Factoring (x² − 1)/(x − 1) would
  find its hole without any limit, and is a computer-algebra system's worth of
  code (ADR 0027's refusal stands). The tree says where to look; the limits
  say what is there.
- **Asymptotes on piecewise, parametric, polar and implicit curves.** Each
  would need its own notion of "where it blows up" and of which piece reaches
  ±∞; none is asked for by the syllabus this serves.
- **A paper-filled ring that cuts the curve instead.** Cutting the stroke at
  the ring's radius would let the axis and gridlines show through the ring
  but would put the curve 5.5px from the ring's centre, and
  `feature-on-its-curve` could no longer hold the hole's height to the curve.
- **A new dash pattern for asymptotes.** The renderer has three (dashed,
  dotted, dashdot); taking one for asymptotes would take it from curves. The
  direct label is what the distinguishability check counts, and it is
  mandatory.

## The cost, stated

- **A hole on an axis hides the axis inside its ring.** sin(x)/x's hole at
  (0, 1) sits on the y axis, and the paper fill that keeps the curve out of
  the ring keeps the axis out too, for 11px.
- **Slowly divergent limits are invisible.** ln x at 0, and anything else
  whose tail stays under 10⁴ at 6·10⁻⁸ from the pole or at x ≈ 5·10⁶, is
  neither drawn nor claimable. This is `numeric.limit`'s threshold, not this
  preset's, and is stated there.
- **Snapping trusts a tolerance.** A limit that is truly 2,000003 would print
  as 2. The candidates are few (fractions with q ≤ 12, √n, kπ/q), and the
  tolerance is the limit's own settling tolerance.
- **Candidates come from the tree and the sampled poles.** A singularity of a
  function the grammar does not list as singular (none today besides tan and
  the logarithms), or a pole narrower than the sign chart's 2000 samples that
  no subexpression predicts, is missed.
- **A horizontal asymptote over an axis is a coloured dash over grey.** It is
  readable, and it is the only honest picture: the axis *is* the asymptote.
- **A one-sided asymptote starts at the middle of the x range.** That is a
  convention, not a computation; it only says which side the line describes.
- **The label search costs time**, like ADR 0036's: each candidate is
  measured against every mark's polyline. A figure with four asymptotes
  expands in well under a second.

## Found while building it

- **The even sampler joined curves across poles.** On a tall y range the
  preset drew 1/(x − 1) as one run through x = 1. The test for it had first
  passed for the wrong reason: with x in [−3, 5], sample 120 lands exactly on
  1, where f is undefined, and the run broke there by luck. With x in
  [−3, 5.3] no sample lands on the pole, and the test fails without the fix.
- **A label placed before the axis names pushed them into the curves.** With
  "y = 1" at the right end of its line, just under the x axis, the axis name
  "x" walked up past the asymptote and the curve. Asymptote labels now keep
  off the axis names' usual spots.
- **A declared vertical asymptote on an even pole had no honest spot at the
  top.** 1/(x − 1)² + 1 hugs x = 1 on both sides above; with the y range
  starting at −1 there was no room below the axis either, and the label fell
  back to a spot nearer the curve (the checks failed it). The fixture's y
  range starts at −2.
