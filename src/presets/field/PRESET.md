# field

Slope fields, vector fields and level curves, for Cálculo 2/3 and Álgebra
Linear: EDO's "campo de direções", a vector field's flow lines, and the 2D
contour map of a function of two variables. Every mark on the plane —
a slope segment's direction, a vector's length, a level curve's shape, a
solution or flow curve's path, a gradient arrow — is **derived** from the
stated expression, never typed. See `docs/decisions/0050-fields.md` for the
reasoning behind the scaling rule and the drawing order.

**Choose it when** the content is `dy/dx = f(x, y)` (a slope field), a planar
vector field `(P(x, y), Q(x, y))`, or the level sets of `f(x, y) = c`. It is
not for a single curve `y = f(x)` (`function-graph`) or a static vector
computed from other vectors (`vectors`).

## Input

Three shapes, chosen by `kind`. All three share `x`/`y` (the plotted box, in
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
points satisfy `f = c`, a gradient is perpendicular to its level curve.

## What is refused

- A solution curve or flow line whose initial point sits on a singularity of
  the field (`f`, or `(P, Q)`, not finite there).
- Levels that are attained nowhere inside the plotted box.
- An `x`/`y` range that is not `[lo, hi]` with `lo < hi`.
- A curve that would have to be drawn through a pole: `rk4Scalar`/`rk4Planar`
  stop and report why (`"boundary"`, `"non-finite"`, `"max-length"`,
  `"max-steps"`), and the curve is drawn only up to that point — never
  through it with whatever number came out the other side.
