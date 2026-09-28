# 0048 — Surfaces z = f(x, y): painted far to near, lines cut by what the paint covers

## Status

Accepted. Implemented in `src/presets/surface/`. Not yet registered: see
`src/presets/surface/INTEGRATION.md`.

## The need

Phase 4 (`docs/PLAN-COVERAGE.md`) asks for surfaces z = f(x, y) and level
curves, marked high risk with the matplotlib module as the fallback. These
are the first figures of Cálculo 2/3: the paraboloid and its curvas de
nível projected onto the xy-plane, the saddle x² − y², a bump
e^(−(x² + y²)), a point on a surface with its plano tangente. Every number
such a figure shows — each height, each level, the tangent plane's
coefficients — follows from the expression, and is exactly the kind of
number that goes wrong when it is typed a second time.

The pieces existed. [ADR 0029](0029-curves-beyond-graphs-of-functions.md)
gave expressions over named variables (`compileIn`) and marching squares
(`contour.ts`), whose vertices are bisected onto the level set and which
refuses to join a crossing across a pole. [ADR 0045](0045-space-and-projection.md)
gave the camera and the `space` label placer. What was missing is
**hidden-surface removal for one curved surface**, which ADR 0045 refused
for segments against patches in general.

## The decision

### Input: the expression, typed once

`{ "expr": "x^2 + y^2", "x": [-2, 2], "y": [-2, 2] }`, with optional `z`
(a visible range the surface is cut to), `levels`, `levelsOn`, `floor`,
`point: { x, y, tangentPlane }`, `camera`, `mesh`, `lines`, `zScale`.
What is **computed**: every mesh vertex (f at the grid), every level-curve
vertex (`contour.ts` at 4× the mesh resolution, so each lies within 1e-9
of f = c), the rim where a stated `z` cuts the surface (the level curve at
that height), the point's height, the tangent plane's partial derivatives
(central difference; the one-sided slopes are compared first and a corner
is refused), the plane's expanded equation (each coefficient snapped with
`snapExact` at the tolerance a central difference earns, 1e-6, and written
with `writeExact`; the constant computed from the snapped values), the
default z range and vertical scale. What is **typed**: the expression, the
domain, the levels, the point's x and y, and names. A typed `z` for the
point, and a name with a digit, are refused.

### The camera

Default: orthographic, azimuth 30°, elevation 26°, the Stewart/Guidorizzi
view — x toward the reader and left, y right, z up. Unlike `space` and
`solid`, cavalier is not the default: an oblique view shears a bowl, and
no calculus text draws surfaces in it. Any camera is accepted that looks
from above; one that looks from below or straight down is refused.

A graph much taller or flatter than it is wide (x² + y² over [−3,5; 3,5]
reaches 24) is drawn with z scaled so it reads; the panel prints the
scale. Scaling z is affine, so planes stay planes and tangency is kept.

### Visibility: painter's order, exact for a height field

Every camera is a parallel projection. Along a viewing ray the horizontal
position moves along h = (toward_x, toward_y), so of two points on one ray
the nearer has the larger s = h · (x, y). A single-valued surface meets a
ray at most once per horizontal position, and a straight horizontal track
crosses a regular grid in steps that each raise the cell centre's s. So
**sorting cells by the s of their centres paints every ray back to front**
— exact, up to the one cell a track straddles. The test checks it
independently: at 400 page points of the saddle and the paraboloid, the
cell painted last is the one whose own plane is nearest there.

Each cell is filled with a Lambert shade of one hue against a light up and
to the left of the reader, lighter for the top of the surface and darker
for its underside (a bowl's outer wall). Each fill is stroked in its own
colour at 0.6 px, because adjacent unstroked fills leave a hairline of
paper where the rasteriser antialiases both edges.

**Lines are drawn after every fill, and only where no fill painted after
them covers them.** A point ON the surface takes the paint position of its
own cell; any other point (an axis, the floor, a guide) is compared by its
own key with each cell's. A line is sampled every 1,5 px and split where
visibility changes. Against a cell next to the point's own cell, a point
must be inside it by more than 0,6 px to be hidden: a grid line on the
edge two cells share lies in both images. This is the rule the fills
obey, so a line and the paint it runs on never disagree. Nothing hidden is
dashed; an opaque surface hides.

### Holes, poles and jumps

An edge or a cell is drawn only if f is finite along it and continuous:
seventeen samples, then fifty bisections into the widest step. A
continuous function's step shrinks with the interval; a pole's grows and a
jump's stays (the same reasoning `contour.ts` uses to tell a crossing from
a pole). Both diagonals are checked, since a pole at a cell's centre
touches no edge. At the edge of f's domain (√(4 − x² − y²) outside the
disc) the cell is cut to its defined part, the boundary point on each edge
found by bisection on "is finite", so a hemisphere's rim is not a
staircase. Nothing is ever joined across a place where f is not.

### The tangent plane

The plane's patch is drawn on the surface's own grid rectangles around the
point, so both fields share painter keys. Merged by key, two fields that
nearly coincide paint through each other in a grid pattern around the
point of tangency (seen in the first render). So the plane is painted
**wholly behind or wholly in front**, and the preset only does that when
it is justified: over the patch the surface lies on one side of the plane
(checked at every grid point) and is seen from one side (no silhouette
crosses the patch). Then the plane is in front exactly when it is above a
surface seen from above or below a surface seen from beneath — at (1, 1)
on x² + y² under the default camera, below the bowl's outer wall, so in
front, as Stewart draws it.

### Level curves and labels

Levels are drawn at their height, projected onto the floor (default the
bottom of the z range, never above it), or both, in one colour. Each is
labelled `z = c` once, on the floor first. Every label is off the
surface: a stroked fill is ink to `text-clear-of-ink` and a rival to
`annotation-nearest-its-owner` and `label-nearest-its-place`, so no spot on
the surface is honest. A label sits beside its curve when an honest spot
exists (`SpacePlacer.elementCost`), and otherwise at the end of a leader
line in its own colour, which it `annotates` (the annotated-figure
precedent, ADR 0035). A leader ends 3 px short of its label, must be the
label's nearest ink, may not run along another line, and prefers crossing
few lines. The point's name is placed the same way. Axis names are
free-standing, as in `space`.

### No 2D contour map

A flat contour map (curvas de nível in the plane, no surface) is left to
the `field` preset, being built in parallel. This preset draws level
curves only as part of the 3D figure.

## What was refused

- **Multi-valued and self-intersecting surfaces.** A sphere, a torus, a
  cylinder x² + y² = 1, a parametric surface: more than one z per (x, y)
  and the s ordering is no longer exact. The input cannot express them,
  and the ADR names the fallback: the matplotlib module.
- **A tangent plane that crosses the surface** (at a saddle point) or whose
  patch a silhouette crosses. The refusal says why and names the fallback.
  Two surfaces that cross inside a cell cannot be painted in any order.
- **General hidden-line removal**, as the plan says. Only the surface (and
  its tangent plane) occludes; axes, guides and curves never hide each
  other.
- **Labels on the surface.** A label set on the shaded mesh is read against
  the cells around it; every such spot fails a check, and a leader is
  honest.
- **A perspective camera**, for ADR 0045's reasons.

## The cost

- **Painter's order is exact to one cell.** Where a track straddles a cell,
  or a line runs within 0,6 px of a cell edge, visibility can be wrong by
  that much. A run shorter than 3 px is dropped as the sampling's noise at a
  silhouette.
- **The tangent plane assumes nothing else passes between.** Wholly-in-front
  stacking is justified over the patch; if another fold of the surface lay
  between the reader and the patch it would be painted wrongly.
- **Leaders cross curves.** On a floor, the inner level's label has no room
  between its neighbours and reaches out on a leader across them (the
  paraboloid fixture's `z = 1`). The leader ends on its own curve, in its
  colour, but a reader must follow it.
- **Tick numbers can be left off**, as in `space`: a number with no honest
  spot beside its tick (on the surface, or where an axis runs over it) is
  omitted and its tick stays. No fixture asks for ticks.
- **z may be drawn to another scale.** The panel says so; a reader
  comparing slopes by eye is misled by exactly that factor.
- **Mark count.** A 24 × 24 mesh is ~600 filled marks; a render costs about
  a second, and the figure is not light to edit by hand.
- **When to use the matplotlib module instead:** a surface with more than
  one height over a point, one that folds over itself as seen, a tangent
  plane at a saddle point, or a figure that needs a colour-mapped height
  bar. `modules/plot` is the precedent; a surface module would declare its
  drawing and be measured by the core like any other.
