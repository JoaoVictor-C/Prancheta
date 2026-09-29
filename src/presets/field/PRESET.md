# field

Slope fields, vector fields, level curves and the electric field lines of
point charges, for Cálculo 2/3, Álgebra Linear and Física 3: EDO's "campo de
direções", a vector field's flow lines, the 2D contour map of a function of
two variables, and "esboce as linhas de campo de um dipolo". Every mark on the plane —
a slope segment's direction, a vector's length, a level curve's shape, a
solution or flow curve's path, a gradient arrow — is **derived** from the
stated expression, never typed. See `docs/decisions/0050-fields.md` for the
reasoning behind the scaling rule and the drawing order.

**Choose it when** the content is `dy/dx = f(x, y)` (a slope field), a planar
vector field `(P(x, y), Q(x, y))`, the level sets of `f(x, y) = c`, or the
field lines and equipotentials of point charges (`kind: "charges"`). It is
not for a single curve `y = f(x)` (`function-graph`) or a static vector
computed from other vectors (`vectors`).

## Input

Four shapes, chosen by `kind`. All four share `x`/`y` (the plotted box, in
world units), `title` and `locale`.

### `kind: "slope"` — dy/dx = f(x, y)

```json
{
  "preset": "field",
  "kind": "slope",
  "f": "x - y",
  "x": [-4, 4],
  "y": [-4, 4],
  "solutions": [
    { "at": [0, 3], "label": "y(0)=3" },
    { "at": [0, -2] }
  ]
}
```

- **`f`** — the right-hand side of `dy/dx = f(x, y)`, an expression over `x`
  and `y` (`src/math/expr.ts`).
- **`solutions`** (optional) — initial points `{ "at": [x0, y0] }`, each
  integrated by `rk4Scalar` in both directions until the curve leaves the
  plotted box, `f` goes non-finite (a singularity), or it has run long
  enough. `label`, if given, appears in the reading below the plot; there is
  deliberately no text label ON the plot for a solution curve — the field's
  own marks tile the whole box too densely for one to have honest room (ADR
  0050).
- A mark's direction is `(1, f(x, y))` at each grid point, drawn at a FIXED
  length in page pixels (`SEGMENT_LEN_PX`) so no mark looks steeper than
  another only because it is longer.

### `kind: "vector"` — a planar field (P, Q)

```json
{
  "preset": "field",
  "kind": "vector",
  "p": "-y",
  "q": "x",
  "x": [-3, 3],
  "y": [-3, 3],
  "flowLines": [{ "at": [1, 0], "label": "r=1" }]
}
```

- **`p`**, **`q`** — the field's two components, expressions over `x` and
  `y`.
- **`flowLines`** (optional) — initial points, each integrated by
  `rk4Planar` in both directions the same way a slope field's solutions are.
- Arrow length is **proportional** to magnitude, one scale factor shared by
  the whole figure (ADR 0050): the longest sampled arrow is set to about 42%
  of the lattice spacing, which is also what keeps arrows from overlapping.
  A magnitude of (numerically) zero draws a small dot instead of a
  zero-length arrow, which has no direction to draw.

### `kind: "levels"` — the level sets of f(x, y)

```json
{
  "preset": "field",
  "kind": "levels",
  "f": "x^2 + y^2",
  "x": [-4, 4],
  "y": [-4, 4],
  "levels": [1, 4, 9],
  "gradientAt": [[1, 1], [2, 0]]
}
```

- **`f`**, **`levels`** — the function and the level values to draw, found
  by `src/math/contour.ts` (marching squares with bisected crossings, ADR
  0029). Every branch of every level carries its own value, set into a gap
  cut in the branch (the contour map's convention) — the ink under the
  number is removed, never covered. A branch with no clear spot for the gap
  keeps no label; its siblings carry the value.
- **`gradientAt`** (optional) — points to draw `∇f` at, by central
  differences. A gradient arrow is perpendicular to the level curve through
  that point by construction — a level curve is where `f` does not change,
  the gradient is where it changes fastest, and the two cannot fail to be
  perpendicular for a differentiable `f` (checked numerically in
  `tests/field.test.ts`, not merely asserted).

### `kind: "charges"` — electric field lines and equipotentials

```json
{
  "preset": "field",
  "kind": "charges",
  "charges": [
    { "at": [-1.5, 0], "q": 2 },
    { "at": [1.5, 0], "q": -1 }
  ],
  "x": [-5, 5],
  "y": [-3.5, 3.5],
  "equipotentials": "auto"
}
```

- **`charges`** — each `{ at: [x, y], q, name? }`, `q` in units of the charge of
  the problem (`+2q` is `2`, `−q` is `-1`). `name` is derived from `q` when
  omitted (`q`, `−q`, `2q`, `−2,5q`); give `"q₁"` to name it yourself, `""` for
  none. A zero charge, a charge outside `x`/`y`, or two charges whose discs
  would touch are refused. No box axes or numbers are drawn: it is a physics
  figure.
- **Shapes only: E = Σ q·r̂/r², V = Σ q/r, k and units omitted**, and the panel
  under the figure says so ("linhas de campo (k omitido)").
- **`linesPerUnitCharge`** (default 8) — a charge of magnitude |q| seeds
  `round(|q| · 8)` lines, evenly spaced on its disc, so the lines leaving a
  charge are proportional to it. One seed points at the nearest other charge,
  which makes a configuration symmetric about the line joining charges draw
  symmetric lines. Lines are seeded on the positive charges (net charge ≥ 0)
  or, when the total is negative, on the negative ones and integrated
  backward, so every arrow still points along E.
- Each line is `rk4Planar` along E/|E|. It ends **on the rim of a charge of the
  other sign**, **at the box**, or **where E = 0** — found by Newton's method,
  marked with a small ring and named in the panel ("○ marca o ponto onde
  E = 0") — never drawn through one. With +2q and −q about half of the 16
  lines end on −q (Gauss); the rest leave the box. A line that would curve
  back after leaving the box is cut at the box.
- A small filled arrowhead sits mid-line pointing along E (two on a long line,
  none on a stub under 48px).
- Charges are drawn last: a red disc with a white plus, a blue disc with a
  white minus (both pass 4.5:1). The sign is drawn as strokes, not typeset:
  the disc (11.5px radius, under the 24px marker extent `checks.ts` reads as a
  point) is smaller than a text box. The name goes beside the disc where no
  line is; if the fan of lines leaves no room within reach it sits farther
  out at the end of a thin leader that runs between two lines.
- Lines run **from the charge's centre** (the disc covers the stub), so every
  line passes through the point the charge's name labels — which is how the
  place check reads a name beside a fan of lines (ADR 0055).
- **`equipotentials`** (optional) — a list of levels of V, or `"auto"` (a
  ladder ±¼, ±½, ±1, ±2 of the largest |q|, plus 0 when the charges have both
  signs; a level none of whose branches has room for its label is dropped).
  Drawn thin and dashed in green, each level labelled in a gap cut into its
  branch (the `levels` code path, shared). A list keeps every level asked for,
  labelled where there is room.

## What is checked

The same box-model checks every preset renders through (`text-clear-of-ink`,
`backing-hides-no-ink`, `annotation-nearest-its-owner`, `contrast-sufficient`,
…) hold a field figure to the same standard as any other: a label may not sit
on a line, a curve's own value must be nearer that curve than anything else,
a tick number keeps its pt-BR spelling and contrast. `tests/field.test.ts`
additionally decodes the frame's own affine map back from canvas pixels to
`(x, y)` and checks the DRAWN geometry against the stated expression: a
slope mark's direction equals `f` there, a solution curve satisfies the ODE
along its own points, a vector arrow points along `(P, Q)`, a level curve's
points satisfy `f = c`, a gradient is perpendicular to its level curve; for charges, a line is tangent to E, an arrowhead points along E, an equipotential's points satisfy V = level, the lines ending on a sink follow Gauss, and two equal charges' axis lines stop exactly where E = 0.

## What is refused

- A solution curve or flow line whose initial point sits on a singularity of
  the field (`f`, or `(P, Q)`, not finite there).
- Levels that are attained nowhere inside the plotted box.
- An `x`/`y` range that is not `[lo, hi]` with `lo < hi`.
- Charges: a zero charge, a charge outside the box, two discs that touch,
  `linesPerUnitCharge` under 1, equipotential levels attained nowhere.
- A curve that would have to be drawn through a pole: `rk4Scalar`/`rk4Planar`
  stop and report why (`"boundary"`, `"non-finite"`, `"max-length"`,
  `"max-steps"`), and the curve is drawn only up to that point — never
  through it with whatever number came out the other side.

## Limits (charges)

- A line seeded exactly on a separatrix (the 90° line of +2q and −q) may go
  either way, so the count ending on a sink is 8 ± 1, not exactly 8.
- With many lines (|q| of 2 or more) the name sits on a long leader: the fan
  leaves no room nearer.
- Three or more charges have no simple Gauss count to check; none is claimed.

## Scale

The unit is **fitted** to the range: the larger side of `x`/`y` (with its 8 %
margin) fills about 460 px, so a range of `[0, 5000]`, of `[0, 0,2]` and of
`[-4, 4]` are the same figure at different numbers. The tick step and the
lattice step are 1, 2 or 5 × 10ᵏ at any k (`src/presets/shared/scale.ts`),
about eight numbers to an axis and `density` (default 11) marks, so a mark is
never closer to its neighbour than a readable distance. `∇f` is taken with a
step in proportion to the range.

## answers: false

`"answers": false` draws what a Cálculo 2 or Física statement **gives**. A
sheet sets it on every statement figure; the solution figure keeps the
default. The frame, ranges and canvas are the same either way, so the two
overlay.

| kind | kept (the givens) | withheld (what is asked) |
| --- | --- | --- |
| `slope` | every slope mark, the axes and numbers, a dot at each `solutions[i].at` (y(x₀) = y₀ is a datum) | the solution curves and the `solução por …` readings |
| `vector` | every arrow, the axes, a dot at each `flowLines[i].at` | the flow lines, their labels and the `linha de fluxo …` readings |
| `levels` | the axes and numbers, a dot at each `gradientAt` point | the level curves and their values, the ∇f arrows |
| `charges` | the charges, their signs and names, the box | the field lines and arrowheads, the null points, the equipotentials and their values, the panel |

Decided, not obvious: a **level curve** is the answer to "esboce as curvas de
nível", and an **equipotential** to "esboce as equipotenciais", so both go with
the field lines. An exercise that instead *gives* the contour map to read a
gradient off it writes `"answers": true` on that figure (a sheet leaves an
explicit value alone).
