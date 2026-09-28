# Plan: covering school and university exercises

[PLAN-EXERCISES.md](PLAN-EXERCISES.md) taught the spec to compute what it draws
from what it says. This plan asks what the spec must be able to *say* so that
almost any exercise a Brazilian student meets — Cálculo 1 to 3, Geometria
Analítica, Álgebra Linear, Física, ENEM — can be illustrated without a typed
coordinate.

It came out of a reasoning session (2026-09-24, confidence 0.75). The
confidence was held down by one thing, stated rather than hidden: the ranking
of which exercise families matter most is **asserted, not counted**. Phase 0
contains the audit that replaces it.

## The shape of the answer

Not one preset per exercise family. Walking the families showed that nearly
every one consumes the same few capabilities — an expression grammar, a
numeric kit, a shared vector algebra, a projection, computed sheet text — and a
preset per family would re-derive them each time and let them drift. So the
work is capabilities, added **only when a second consumer needs them**, and
ordered by the semester in which they are needed. Correctness debt preempts
everything, because it is a way the figures that already exist can lie.

Each item states what is **computed** and what residual **check** guards the
typed text that computation cannot reach.

## Covered today

Tangent and secant lines, piecewise functions, kinematics and wave graphs
(function-graph with `t` as the axis), sign tables, free-body diagrams,
transformations on a grid, bar/line/pie charts, graphs and trees, molecules,
reactions, crystals.

## Phase 0 — correctness debt

- `length-matches-its-label` — the twin of `sweep-matches-its-label`.
- Labels that name a place (an origin, a legend row), checked instead of deleted.
- A corpus coverage audit: classify every figure in a sample of real lists
  (the Cálculo lists in `ProjectHub/Listas/`, a sample of ENEM items) as
  covered / planned / uncovered, and let the counts reorder phases 3–5.

## Phase 1 — finish Cálculo 1

- **Expressions over named variables**; parametric, polar and implicit curves
  in function-graph (implicit via marching squares with refinement).
- **Numeric kit** (`src/math/numeric.ts`): adaptive Simpson, Riemann sums that
  return what they summed, one-sided and infinite limits that return their
  evidence table, partial sums. A number that cannot be trusted is refused.
- **function-graph**: area between curves, Riemann rectangles, asymptotes and
  holes, limit tables — all computed from the expression.
- **number-line** from inequality or interval text; intersections and unions
  computed, never typed.
- **unit-circle**: points from angles; exact cos/sin values; arcs guarded by
  `sweep-matches-its-label`.
- **vectors** in R²: sums, multiples, projections, angles, all derived.
- **value-table**: every cell computed from the expression.

## Phase 2 — sheets as a study instrument

- Computed text in statements and solutions (`params` and `{{= …}}`,
  ADR 0040), so a typed "= 8/3" can never disagree with the figure beside it.
- Seeded variants with a separate gabarito; a variant is admitted only if all
  its figures pass their checks and its numbers are "nice" (ADR 0041, 0042:
  `sheet --variants N`).

*Swap with phase 3 if Geometria Analítica runs alongside Cálculo 1.*

## Phase 3 — Geometria Analítica and school solids

- One dimension-generic vector algebra shared by 2D and 3D.
- Constructive 2D kernel (intersections, perpendiculars, loci) with conics
  drawn analytically from their foci and eccentricity.
- R³ lines, planes and vectors; convex polyhedra and right cylinders, cones
  and spheres with analytic silhouettes; hidden edges dashed by visibility;
  composites transparent, per-solid visibility only.
- Scene pictograms for word problems (ladder, wall, pole and shadow, ramp),
  placed by kernel geometry from the problem's numbers.

## Phase 4 — Cálculo 2/3 and Álgebra Linear

Surfaces z = f(x, y) and arbitrary-profile solids of revolution (high risk;
matplotlib module as fallback), RK4, volumes, series plots, level curves,
slope and vector fields. Linear maps reuse the existing transformation grid.

## Phase 5 — physics and discrete

Ray optics (after a per-segment connector line style), circuits with an MNA
solver, field lines, automata (acceptance by simulation), logic gates, truth
tables computed from the expression. Fillers at any time: histogram, boxplot,
normal area, probability trees, Venn.

## CAS

SymPy only as an optional leaf module feeding computed sheet text. No CAS in
the TypeScript core — ADR 0027's refusal stands.

## Not building

A GeoGebra clone; photoreal 3D; general hidden-line removal or inter-solid
occlusion; image-model illustrations; circuit auto-layout from a netlist;
matrices as figures (KaTeX suffices); 3D animation (the motion check reasons
about rectangles, not projected faces).

## Progress

| item | ADR | status |
| --- | --- | --- |
| length and place labels | [0028](decisions/0028-length-labels-and-place-labels.md) | done 2026-09-25 |
| curves beyond graphs of functions (named variables, contour) | [0029](decisions/0029-curves-beyond-graphs-of-functions.md) | done 2026-09-25 |
| numeric kit (`src/math/numeric.ts`) | — | done 2026-09-25; first consumed by function-graph areas and sums (0036) |
| number-line | [0030](decisions/0030-number-line.md) | done 2026-09-25 |
| unit-circle | [0031](decisions/0031-unit-circle.md) | done 2026-09-25 |
| vectors | [0032](decisions/0032-vectors.md) | done 2026-09-25 |
| value-table | [0033](decisions/0033-value-table.md) | done 2026-09-25 |
| pt-BR angle labels read by `sweep-matches-its-label` | — | done 2026-09-25 (found by unit-circle) |
| what a label hides and claims (backings, unclaimed labels, axes, line contrast) | [0035](decisions/0035-what-a-label-hides-and-claims.md) | done 2026-09-26 (found by visual review) |
| areas and Riemann sums in function-graph | [0036](decisions/0036-areas-and-riemann-sums.md) | done 2026-09-27 |
| `area-matches-its-label` | [0037](decisions/0037-area-matches-its-label.md) | done 2026-09-27 |
| asymptotes and holes in function-graph | [0038](decisions/0038-asymptotes-and-holes.md) | done 2026-09-27 |
| limit tables in value-table | [0039](decisions/0039-limit-tables.md) | done 2026-09-27 |
| computed sheet text: `params`, `{{= …}}`, params in figures; one snapping helper | [0040](decisions/0040-computed-sheet-text.md) | done 2026-09-27 |
| slow divergence in `numeric.limit` (ln x at 0⁺ is −∞) | — | done 2026-09-27; slow CONVERGENCE (x·ln x → 0) still reads "none" |
| seeded variants: domains, declarative predicates, bounded admission loop | [0041](decisions/0041-seeded-variants.md) | done 2026-09-27; its `derive` removed by 0042 (predicates now see `calc.evaluateParams`) |
| variant sheets and a separate gabarito: `sheet --variants N [--seed S]`, `--answers separate`, manifest, shortfall fails the build | [0042](decisions/0042-variant-sheets-and-gabarito.md) | done 2026-09-27; Phase 2 complete |
| one vector algebra for 2D and 3D (`src/geometry/vec.ts`) | [0043](decisions/0043-one-vector-algebra.md) | done 2026-09-28 |
| constructive 2D kernel: `construction` preset (points, lines, circles, conics by definition) | [0044](decisions/0044-constructions.md) | done 2026-09-28 |
| 3D camera and `space` preset (R³ points, vectors, lines, planes; dashed behind planes) | [0045](decisions/0045-space-and-projection.md) | done 2026-09-28 |
| school solids: `solid` preset (polyhedra, cylinder, cone, sphere; true-3D measured lengths) | [0046](decisions/0046-school-solids.md) | done 2026-09-28 |
| word-problem pictograms in `construction`, with a `unit` for lengths | [0047](decisions/0047-word-problem-pictograms.md) | done 2026-09-28 |
| `length-matches-its-label` reads exact roots ("2√13") | — | done 2026-09-28 |
| corpus coverage audit | — | not started |

Selection gained three structure values — `interval`, `vector`, `angle` — each
with its rules and a paragraph in SELECTION.md; value-table is offered at the
floor for a function, beside the sign table.

Known residue: the vectors preset still copies the tick LABEL geometry
(offsets and sizes) from `ir/frames.ts` to keep its labels off the grid
numbers; the tick VALUES now come from the exported `ticksOf`. The numeric
kit and `contour.ts` each carry their own bisection.

## Visual review, 2026-09-25

Every new fixture was rendered and looked at, plus six new examples written
to exercise more of each feature. All 11 fixtures pass every check, and every
number shown was verified by hand. Three of the six new examples fail checks,
and some defects passed every check. The checks guard numbers; they do not
yet guard which thing a label seems to describe.

- **Implicit curves.** A hyperbola `x²/4 − y² = 1` has a visible gap on its
  left branch just below the vertex, where contour.ts drops a stretch whose
  cells meet the curve almost tangentially.
- **Polar curves.** A rose `r = cos 2θ` has a missing piece where r passes
  through zero near the origin, and its petals are visibly faceted. The
  sampler's "quarter-pixel flatness" is not met at unit 150.
- **Unit circle.**
  - With `projection`, the sin value (√3/2) is placed far from the sine
    axis, beside a symmetric point it does not name. The checks pass it.
  - No radius is drawn to the point, and the tangent has no ray from the
    origin through the point to the tangent axis.
  - With `tangent`, the point label can land at the tangent's end instead of
    at the point (fails `annotation-nearest-its-owner`).
- **Vectors.**
  - Magnitude labels drift to the wrong arrow, e.g. |u| beside u+v (fails
    `annotation-nearest-its-owner` and `text-clear-of-ink`).
  - The grid's tick labels are English ("2.5", ASCII "-"), not pt-BR.
  - Roots are not simplified (√20 instead of 2√5).
  - The angle prints three decimals (57,529°).
  - The caption repeats derived names ("u+v = u + v = …", "AB = AB = …").
- **Value table.** A wide empty column sits between the row names and the
  first value.

### Outcome, 2026-09-26

Every defect above is fixed, and each fix was confirmed by opening the
rendered PNG, not only by the checks. A second review round, prompted by the
user, found three more: the unit-circle arc had no terminal side, grid tick
numbers overlapped lines, and tick contrast was poor. It also found that
fixing one overlap often moved it onto the next line over; the arc label
went from OP to the axes. All 19 gallery figures now render with every check
passing. Core suite: 1275/1276, the remaining failure being a timing flake in
`anim-browser-playback` that passes in isolation.

What fixed each figure:
- **Curves.** A tick number's paper backing was painting over the curve at
  the hyperbola's vertex and at the rose's origin. Tick numbers now step off
  the gridline before using a backing. Sampling is flat to a quarter of an
  output pixel, with a turn bound.
- **Unit circle.**
  - Radius OP is drawn, plus its dashed extension to the tangent axis.
  - cos and sin sit at their projection feet (`annotatesPlace`).
  - The arc label sits on the bisector of the widest sub-wedge left by the
    x axis, OP and the y axis, with no backing. A narrow angle puts it under
    the arc's foot.
- **Vectors.**
  - Each label may only take a spot beside its own shaft.
  - Roots are simplified (2√5, 7√26/13); numbers have two decimals.
  - The caption no longer repeats itself.
  - The lattice step is a whole number.
- **Grid (ADR 0034).** `GridSpec.locale` for pt-BR ticks; darker tick ink
  (7.3:1); a paper halo only where a tick is clear of ink; a single origin
  "0"; ticks that step off ink.
- **Value table.** Each column is as wide as its widest header or value;
  rows are labelled f(x).

Check gaps this exposed. Each one let a visible defect pass green. The
first four are closed by [ADR 0035](decisions/0035-what-a-label-hides-and-claims.md)
(2026-09-26):
- **Hiding backings — closed.** `backing-hides-no-ink` fails an opaque
  label box over any stroked mark it does not `annotates`, axes included.
  Only a grid lattice line may run under a backing (ADR 0034's halo).
- **Unclaimed labels — closed.** `label-declares-what-it-names` fails a bare
  label that declares none of `annotates`, `annotatesPlace` or `names`
  unless it is marked `freeStanding: true`. Every producer was given a
  claim or marked; the list is in the ADR. Point labels now name their
  points: a dot drawn at a place no longer competes with its label.
- **Grid furniture — closed.** Text across an AXIS now fails
  `text-clear-of-ink` (the lattice stays exempt), and `Board.addFrame`
  records the axes as ink so a preset's label search steps off them. It
  caught "−π/2" printed across the unit circle's y axis.
- **Gridline contrast — closed.** `contrast-sufficient` scores the text
  against every line crossing its em box, unless a backing hides the line.
- **Ties.** Nothing flags a label that sits almost as near another element
  as its owner. Still open as a check. The quadrant-tour case is resolved by
  placement: quadrant letters are placed last, and "π/4" now sits beside its
  point, held there by `label-nearest-its-place`.

Residue: the shared number formatter prints no thousands separator
(999998000). `proj_v(u)` has no honest spot above a projection lying along
v, so it sits under the x axis.

