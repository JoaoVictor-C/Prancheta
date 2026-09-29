# surface

The graph of a function of two variables, z = f(x, y), as Cálculo 2/3
textbooks (Stewart, Guidorizzi) draw it: a shaded mesh on three axes, its
level curves at their height and projected onto a floor, and a point on it
with its tangent plane. The expression is the only geometry you type. Every
mesh vertex is f at a grid point, every level-curve vertex satisfies
f = c, the point's height is f(x0, y0), and the tangent plane's
coefficients are its partial derivatives, printed exact
(`z = 2x + 2y − 2`). See
[ADR 0048](../../../docs/decisions/0048-surfaces.md).

**Choose it when** the exercise is about a function of two variables: its
graph, its curvas de nível, a point on it, its plano tangente. It is not for
points, lines and planes in R³ (use [`space`](../space/PRESET.md)), for
school solids (use [`solid`](../solid/PRESET.md)), or for a flat contour map
(the `field` preset owns 2D level-curve maps).

## Input

```json
{
  "preset": "surface",
  "expr": "x^2 + y^2",
  "x": [-3.5, 3.5],
  "y": [-3.5, 3.5],
  "z": [0, 12],
  "levels": [1, 4, 9],
  "point": { "name": "P", "x": 1, "y": 1, "tangentPlane": true }
}
```

| field | meaning |
| --- | --- |
| `expr` | f(x, y) in x and y: `"x^2 - y^2"`, `"e^(-(x^2 + y^2))"`, `"xy"`, `"sqrt(4 - x^2 - y^2)"`. Any other name is refused. |
| `x`, `y` | the rectangle of the domain; a bound may be a constant expression (`"pi"`). |
| `z` | the visible height range. The surface is cut where it leaves it, and the cut rim is drawn (it is the level curve at that height). Derived from f when omitted: the lowest value rounded down, the highest value. |
| `zScale` | drawn length of one unit of z against one of x and y. Derived when omitted: a graph much taller or flatter than it is wide is scaled to read, and the panel says so (`eixo z desenhado na escala 0,53 : 1`). Tick numbers stay true values. |
| `camera` | as in `space`. Default: orthographic, azimuth 30°, elevation 26° -- x toward the reader and left, y right, z up. It must look from above. |
| `mesh` | cells per side of the shaded mesh (4–64, default 24). |
| `lines` | grid lines per side along constant x and constant y (default 12); must divide `mesh`. |
| `axes` | `{ "ticks": true }` numbers the axes; `{ "names": false }` drops x, y, z. |
| `levels` | levels c of the curves f(x, y) = c. A level f never crosses on the domain is refused. |
| `levelsOn` | `"both"` (default), `"surface"` or `"floor"`. |
| `floor` | the height of the plane the level curves are projected onto; default the bottom of the z range, and never above it. |
| `point` | `{ name, x, y, guide, tangentPlane }`: x and y typed, z computed; a typed `z` is refused. `guide` (default true) draws the dashed guides down to the xy-plane and across to the axes. |

## What is drawn, and what is refused

- **Hidden parts** are decided by painting cells far to near (exact for a
  single-valued surface) and drawing every line only where no nearer cell
  covers it. Nothing hidden is dashed: a surface is opaque.
- **Holes.** Where f is undefined, jumps or blows up, no cell and no line
  is drawn across; at the edge of f's domain (a hemisphere's rim) the mesh
  runs to where f stops. The panel says so.
- **Labels.** Level labels (`z = 4`) sit beside their floor curve when an
  honest spot exists, else on a leader line in the curve's colour. The
  point's name sits beside its dot or on a leader. Every label is off the
  surface: a shaded cell is ink.
- **The tangent plane** is refused where f has no tangent plane (one-sided
  slopes differ), where the surface crosses its plane near the point (a
  saddle), or where a silhouette crosses the plane's patch. The refusal
  says so plainly: no figure module draws such a surface yet
  (`modules/plot` fits least squares and nothing else).
- **Refused outright:** a camera looking from below or straight down, a
  floor above the z range, a point outside the domain, in a hole, outside
  the z range or on a part of the surface the camera does not see.
