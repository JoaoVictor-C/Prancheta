# 0050 — Slope fields, vector fields and level curves, and an RK4 that knows when to stop

## Status

Accepted.

## The need

Phase 4 (`docs/plans/PLAN-COVERAGE.md`) names three figures Cálculo 2/3 and Álgebra
Linear both need and this project could not yet draw: the "campo de
direções" of an ODE `dy/dx = f(x, y)` (a slope field, with solution curves
through given initial points), a planar vector field `(P(x, y), Q(x, y))`
(with flow lines), and the 2D contour map of `f(x, y)` — the level sets
`f(x, y) = c`, with gradient arrows. `src/math/contour.ts` already draws the
last of these as a set of curves; nothing in the project could integrate an
ODE, so neither a solution curve nor a flow line could be drawn at all
without typing a polyline of points — the exact defect this project exists
to refuse.

## The decision

**`rk4` in `src/math/numeric.ts`: a fixed- or adaptive-step Runge–Kutta 4
solver that always says why it stopped.** One core (`rkCore`) integrates a
vector ODE over any number of state components; `rk4Scalar` wraps it for
`dy/dx = f(x, y)` (state `[y]`, integration variable is `x`) and `rk4Planar`
for the autonomous system `(x', y') = (P, Q)` (state `[x, y]`, integration
variable is an arc-length-like `t` that is never itself plotted); `rk4` is a
two-overload dispatcher on whether `y0` is a number or a pair, for a caller
that wants one name for either shape. Every call returns
`{ points, stopped, detail }`, where `stopped` is one of `"completed"`,
`"boundary"`, `"non-finite"` or `"max-length"`/`"max-steps"` — never a
silent continuation through a pole with whatever `NaN` or `Infinity` a
division produced. `bounds` (the plotted box) is checked against the drawn
**position**, not the integration variable, and a boundary crossing is found
by bisecting the last step so the curve reaches the box's edge rather than
stopping one whole step short of it. This is the same discipline
`math/numeric.ts`'s `integrate` and `contour.ts`'s bisected crossings already
keep (ADR 0029): a number, or here a curve, that cannot be trusted past a
point is refused past that point, not printed as if it continued.

**The `field` preset, one gridded `Frame` per figure (the `vectors` preset's
architecture, reused), three `kind`s.** `slope` draws a segment at every
grid point with EXACTLY the slope `f(x, y)` reports there, at a FIXED length
in page pixels — direction is derived, length is not, so no mark looks
steeper than another only because it happens to be longer. `vector` draws an
arrow at every grid point; `levels` draws `contour.ts`'s curves for each
stated level, every branch labelled with its own value in a gap cut into the branch. All
three take optional initial points for a derived curve (`solutions` for
`kind: "slope"`, `flowLines` for `kind: "vector"`), integrated by
`rk4Scalar`/`rk4Planar` in both directions from the point and stopped, never
pushed through, at whatever `rk4` reports.

**The vector-arrow scaling rule is PROPORTIONAL, with one computed scale
factor per figure — stated here because a reviewer must be able to check it
by eye, not reverse it out of the code.** Every arrow's length is
`magnitude · SCALE`, and `SCALE` is the largest value that keeps the
LONGEST sampled arrow at 42% of the lattice spacing (`VECTOR_ARROW_FRACTION`)
— computed from the figure's own sampled magnitudes, never chosen by the
caller. Two arrows in one figure are therefore comparable by eye (a field
twice as strong somewhere draws an arrow twice as long there), and the 42%
bound is what keeps neighbouring arrows from ever touching, since the
longest arrow anywhere is already less than half a lattice cell. A sampled
magnitude that rounds to zero draws a small dot instead of a zero-length
arrow, which has no direction to draw. The alternative — NORMALISED arrows,
every one the same length, magnitude read off colour alone — was refused
(next section) because it throws the one comparison a vector field figure
exists to show.

**Drawing order is fixed across all three kinds and stated once:** the
field's own marks (segments or arrows) first, then every derived curve
(solution, flow, or level), then gradient arrows, then every label (each
anchored to what it names — ADR 0035), and finally the initial/reference
points as small dots. A point is never obscured by ink drawn after it, and a
label search always sees every line it might have to avoid.

**A curve's on-plot label is dropped when the field around it leaves no
honest room, and the reading panel underneath carries the value instead.**
A first draft placed a text label beside every solution/flow curve near its
own initial point (`besidePolyline`, the same device `levels` labels use).
For `levels`, whose few curves are the only lines on the plot, this works
well. For `slope`/`vector`, the field's OWN marks tile the entire box —
unlike a construction's few clean lines, there is no interior region more
than roughly half a lattice cell from some mark, and an ordinary label is
wider than that. No amount of extra search radius fixes a genuinely
impossible placement. So a solution/flow curve is named by its start dot and
the reading panel below the plot (which already exists, and already prints
every derived value's exact reading) — never by inline text fighting the
same marks that make the figure a *field* figure in the first place. Level
curves keep their on-plot label: there, the plot's only other ink is the
handful of curves themselves.

**Level labels sit in a gap cut into their own branch, and every branch
carries one.** (Revised 2026-09-28, after looking at the rendered saddle.)
Beside the curve, on the longest branch only, was the first design. On
x² − y², whose branches run 40–60px apart, every candidate beside a curve
was nearer a neighbour than the placer allows, so each label fell back to
its furthest spot and floated between two curves, equally near both. Only
one of each hyperbola's two halves was named. The contour map's own
convention answers both: the number is set on the branch's path, and the
ink under it is removed (exactly, at the label box's edge, not covered by a
backing), so nothing is on a line. A cut branch becomes two marks, since
the IR has no pen-up inside a mark, and its label names the nearer piece.
A closed loop is restarted past its gap, so it stays one mark.

## What was refused

**Normalised vector arrows (uniform length, magnitude by colour).** Refused
because this project has no colour-only channel a printed page can rely on —
`categorical-colours-distinguishable` and the project's WCAG discipline both
assume colour is a SECONDARY cue, never the only one carrying a number. A
reader comparing two arrows' magnitudes by eye needs to compare their
lengths; normalising throws that comparison away for a purely cosmetic
uniformity this project does not need.

**A per-arrow independent length cap.** An earlier idea clamped each arrow's
length to `[MIN, MAX]` individually rather than sharing one `SCALE`. That
breaks proportionality: two arrows both hitting the cap would draw the same
length despite different magnitudes, silently re-introducing exactly what
normalising throws away. `SCALE` is one number, computed once, applied
uniformly.

**Typed points for a solution or flow curve.** The one path this project
exists to refuse throughout: a polyline of coordinates that could disagree
with the ODE printed beside it. Every curve here is `rk4`'s own output,
converted to canvas points by the frame's own `resolveInFrame` — the same
arithmetic that places every grid mark, so a curve and the marks it should
run tangent to cannot disagree.

**A second, independent tangent computation to draw a solution curve
"smoothly."** The polyline `rk4` returns already lies on the true solution
to numerical precision (fixed step at 1/200th of the span, or adaptive at
`tolerance = 1e-6` by default); a spline or Bezier fit through it would be a
second curve, agreeing with the first only approximately, drawn instead of
the one the ODE actually describes.

**Colour per curve, distinguishing several solution/flow lines from each
other.** Refused for the same reason the marks and the field arrows share
one colour: this preset already uses colour to distinguish a ROLE (the
field itself, blue; a derived curve, rust; a gradient, green), and giving
each solution curve its own hue would need as many colours as curves, with
no natural stopping point and no textbook convention behind it. Curves are
told apart by their start dot and the reading panel instead — see the
decision above.

## The cost, stated

**A solution/flow curve's on-plot label is gone for `slope`/`vector`, kept
only in the reading panel below.** A reader who wants to know which curve
started where must look at the caption, not the plot itself — a real loss
of "look at one place for everything," accepted because the alternative
(inline text fighting a dense field of marks) produced figures a reviewer
rejected on sight, not a theoretical risk.

**`rk4`'s bisected boundary crossing costs up to 40 extra derivative
evaluations per curve**, cheap at the sizes this project draws (a handful of
curves per figure) but not free; a caller integrating thousands of
trajectories per frame — not a use case here — would want a variant that
skips it.

**The adaptive step controller is step-doubling, not embedded (no
Dormand–Prince/Cash–Karp pair).** It costs roughly three derivative
evaluations per accepted step instead of the ~1.2 an embedded RK45 pair
would need, in exchange for reusing exactly one RK4 stepper — the same
function `contour.ts`'s marching squares and this preset's fixed-step calls
already share — rather than a second, differently-ordered integrator. At the
sizes a figure needs (hundreds of points per curve, not millions), the
extra cost is unmeasured in practice.

**`gradientAt` takes explicit points, never an automatic placement.** Unlike
`contour.ts`'s own curve-finding, nothing here decides WHERE a gradient
arrow would be most informative (on the curve? at a saddle? evenly spaced?)
— that judgement is left to the figure's author, the same way `vectors`
leaves choosing which angles to mark to its author rather than guessing.

**What `contour.ts`'s own stated limits already cost this preset, inherited
rather than re-solved:** a level set that touches its value without
crossing it, an isolated point, or a piece of curve smaller than a cell is
not drawn (ADR 0029). A `field(levels)` figure inherits this exactly; no new
limit was added or removed.
