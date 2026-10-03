# 0045 — A camera for R³, and visibility decided per object

## Status

Accepted.

## The need

Phase 3 (`docs/plans/PLAN-COVERAGE.md`) asks for R³ lines, planes and vectors, with
hidden edges dashed by visibility. It also refuses general hidden-line
removal and inter-solid occlusion. The algebra already exists:
[ADR 0043](0043-one-vector-algebra.md)'s `geometry/vec.ts` classifies lines
and planes, intersects them and measures between them. Two things were
missing:

- **A camera.** Something has to put an R³ point on the page and say which
  of two points on the same page spot is nearer the reader.
- **A preset.** Something has to turn a Geometria Analítica exercise into
  that drawing without anyone typing a page coordinate.

The `crystal` module shows the alternative. It projects a unit cell in
Python and depth-sorts atoms, and it says of itself that cell edges are
"not depth-sorted against" atoms. That is the right trade for one cell of
spheres, and the wrong one here: a textbook figure of a line piercing a
plane is judged on exactly the stretch of line that goes behind.

## The decision

### The camera (`src/geometry/projection.ts`)

Every camera is a parallel projection, a linear map R³ → R² with y up. It is
described by the page images of the three unit axes (`ex`, `ey`, `ez`) and
by `toward`, the unit vector of its kernel on the reader's side. Three
families are offered:

| camera | page images | `toward` |
| --- | --- | --- |
| **cavalier** (default) | y → (1, 0), z → (0, 1), x → ½·(−cos 45°, −sin 45°) | (1, ½cos 45°, ½sin 45°), normalised |
| **isometric** | orthographic from azimuth 45°, elevation asin(1/√3) | the (1, 1, 1) diagonal |
| **orthographic** | page right = (−sin a, cos a, 0), up completes the frame, so z always draws straight up | (cos e·cos a, cos e·sin a, sin e) |

**Cavalier is the default because it is the view the course is taught in.**
Brazilian Geometria Analítica textbooks draw it: y to the right, z up, x
toward the reader at 45° and halved. A student compares the figure with the
book, so a figure in another view is harder to read even when it is more
correct. Strictly, a ratio of ½ is the "cabinet" member of the oblique
family. The code keeps the name the course uses.

**Depth is `toward · p`, and it only orders points that share a page
position.** Moving a point along `toward` leaves its image fixed, so two
points on one page spot differ by a multiple of `toward`, and the larger
dot product is nearer. For an oblique camera `toward` is not the page
normal. Using the normal there is the classic error, and it dashes the
wrong half of a line.

The exports are:

- `project`, `projectDirection`, `depth`, `planeDepthAt`, `facesViewer`,
  `edgeOn` and `liftToRay`;
- `projectCircle(camera, centre, normal, r)`. It returns the ellipse (centre,
  semi-axes, rotation) from the singular values of the conjugate
  semi-diameters, plus the circle's parameterisation, the depth of each of
  its points and `frontCenter`, the nearest point, which splits the near
  half from the far half;
- `sphereOutline`: the image of the great circle perpendicular to `toward`.
  Under the cavalier camera that outline is an ellipse, not a circle;
- `tangentParamsParallelTo` (where a cylinder's generators touch its base
  ellipse) and `tangentParamsFrom` (where a cone's generators from its apex
  image touch it).

These last four exist for the school-solids work that follows. They are
tested against sampled points, not against numbers typed into the tests.

### The preset (`src/presets/space/`)

Typed coordinates are the only input. Every other position is derived
through `vec.ts`:

- a midpoint;
- a line meeting a plane (`intersectLinePlane3`);
- two lines meeting (`relativePosition3`, which refuses `paralelas`,
  `coincidentes` and `reversas` by name);
- two planes meeting (`intersectPlanes3`);
- a foot of a perpendicular;
- a cross product or a sum;
- the common perpendicular of `reversas`.

Every printed number goes through `printExact`. It uses `snapExact` for
rationals and multiples of π, and the vectors preset's `sqrtLabel` for a
value whose square is rational, so `d(P, π)` prints `3√14/7`, not
`√(126)/7` or `1,604`. A number that is none of these prints rounded and is
flagged with `≈`. A `label` containing a digit is refused.

A plane is drawn as a translucent patch:

- **`"parallelogram"`** (the default) has edges parallel to the two
  coordinate planes its normal leans least on, and spans the region's
  extent in those two coordinates. When the figure has points of its own,
  the patch is centred on them and clipped a little past the region.
  Otherwise it is clipped to the region.
- **`"octant"`** is the piece with x, y, z ≥ 0: for positive intercepts,
  the intercept triangle.

Its equation is printed in canonical equação geral form: whole
coefficients, no common factor, a positive leading coefficient, `= 0`.

### Visibility, per object (`src/presets/space/visibility.ts`)

The only occluders are the plane patches. The only things they hide are
straight segments: axes, lines, vector shafts, traces, common
perpendiculars and other patches' edges. For one segment and one patch,
visibility can only change at two kinds of place:

- where the segment pierces the patch's plane in 3D;
- where the segment's page image crosses the patch's page outline.

The segment is cut at every such parameter, for every patch. Each stretch
is then decided at its midpoint: it is **hidden** when its page image is
strictly inside some patch's page polygon and that patch's depth there
(`planeDepthAt`) exceeds the stretch's own. Consecutive stretches in the
same state are merged. A hidden stretch keeps its object's colour and width
and is drawn dashed.

A segment lying in a patch's plane is never hidden by that patch, and this
is exact rather than a tolerance hack. The line where two planes meet lies
in both, and a patch's own edges lie in it. A patch edge that lies on an
axis is left to the axis, so one line is never drawn in two colours.

Paint order is fills (far to near), then guides, then every segment and
arrow, then right-angle marks and ticks, then dots. A point's dot is never
under a line that passes through it.

## What was refused

- **General hidden-line removal.** Segment against segment, patch against
  patch fill, or anything with curved surfaces. The plan refuses it, and a
  textbook figure of lines and planes does not need it. Fills are
  translucent and simply overlap. A student reads two overlapping patches
  correctly, and an opaque one would hide the very line the exercise is
  about.
- **A perspective camera.** No Geometria Analítica textbook draws in
  perspective. It would also break the three facts every drawing here rests
  on: straight lines stay straight, parallel lines stay parallel, and
  midpoints map to midpoints.
- **Page normal as depth.** It is wrong for the default camera. See above.
- **Lengths printed on the drawing.** A projected segment is not its true
  length, and `length-matches-its-label` (ADR 0028) could only report it as
  unmeasurable. Every measured number goes to the panel, exact.
- **Guessing an answer where the geometry gives none.** `reversas` lines
  asked for their intersection name `commonPerpendicular`. Two planes asked
  for a point are told they meet in a line. A cross product of parallel
  vectors is refused as the zero vector.
- **Editing `vec.ts`.** It lacks a 3D foot on a line, the closest points of
  two skew lines, and a plane's foot of a perpendicular. These are
  one-liners and live in `space/preset.ts` (`footOnLine3`, `footOnPlane3`,
  `closestPoints3`), exported and tested against `vec.ts`'s own
  distances. They are candidates to move into `vec.ts`.

## The cost

- **Tick numbers can be left off.** The cavalier x axis is halved, so its
  ticks sit close together. A box guide can leave the axis one tick away on
  either side. A number with no spot that is nearer its tick than any other
  ink is left off, and its tick mark stays. In `point-box` the x axis
  numbers 2 and 3 but not 1. This breaks the function-graph rule that axis
  numbers are never dropped, and it is visible.
- **The origin's O is optional** for the same reason. It is left off when
  it cannot be placed honestly.
- **A point can be wedged** between a patch edge and an axis within a label's
  own height. Then no honest spot exists, and `label-nearest-its-place`
  fails. The fixtures' numbers were chosen so that no point is wedged. An
  author meets the same refusal and moves the point, or the region.
- **Visibility is only as good as the patch.** A patch is a finite piece of
  an infinite plane. A line passing "behind the plane" outside the patch's
  outline is drawn solid, because nothing drawn is in front of it.
- **Oblique projection distorts round things.** A sphere outlines as an
  ellipse under the cavalier camera, which is geometrically right and
  unlike the textbook's hand-drawn circle. The school-solids work must
  decide whether to draw spheres orthographically.
- **The equation is written in one form.** The panel prints the equação
  geral (`… = 0`), not the author's own form (`2x + 3y + 6z = 12`). An
  exercise asking for the segmentária form still has to state it in its
  own text.
