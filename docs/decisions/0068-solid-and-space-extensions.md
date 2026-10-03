# 0068 — Solid and space extensions: frustums, bores, liquids, nets, non-convex polyhedra, projections and paths

## Status

Accepted. Implemented in `src/presets/solid/` (`preset.ts`, `geometry.ts`,
`exact.ts`, and the new `mesh.ts` and `net.ts`) and `src/presets/space/preset.ts`.

## The need

The ENEM audit ([AUDIT-ENEM](../research/AUDIT-ENEM.md), item 4) found 13 figures of
day 2 that the `solid` and `space` presets came close to but could not draw:
a cone's frustum with a cylindrical bore (2023 Q136), a stair (2023 Q165), a
tank with water at a level (2025 Q170, 2024 Q161), rectangles rolled into
cylinders (2024 Q175), a medal with an inscribed square hole (2025 Q177), a
Johnson solid with its net (2025 Q149), a cube with its projections on
gridded coordinate planes (2025 Q138), a path between two walls (2024 Q174),
a mast with cables (2023 Q148) and compass-named axes (2025 Q126). Each was a
specific missing extension; none a new kind of figure.

## The decision

Everything stays derived from what is typed, and every printed number stays
exact where a student's answer is (`exact.ts` gained `div`, `cbrt` and
`parseTyped("18π")`).

### New solids

- **`frustum`**, of a cone (R, r, h or g) or of a regular pyramid (ℓ, ℓ′, h
  or g). A cone's frustum is drawn with `frustumView`: its outline generators
  are the full cone's, tangents to the bottom ellipse from the image of the
  virtual apex at h·R/(R − r) -- below the base when the frustum widens
  upward. The same view with R = 0 is a **cone on its apex** (`apex: "down"`).
  The tests check, under three cameras, that the lateral normal is
  perpendicular to `toward` exactly at those generators.
- **`hemisphere`**: the half of the sphere's outline above its base plane, and
  the base rim seen where the dome or the base faces the reader.
- **`stairs`** and **`polyhedron`** (vertices and faces). These need not be
  convex, so ADR 0046's rule ("a point is seen when a surface through it faces
  the reader") no longer holds: a riser faces the reader and can still sit
  behind a nearer step. `mesh.ts` does hidden-line removal for one closed
  polyhedron the way `space/visibility.ts` does it for plane patches: an edge
  is cut where its image crosses the outline of a front face, or pierces its
  plane, and each piece is hidden when a front face covers its midpoint and
  is nearer there. On a convex body this reduces to the old rule under every
  camera tested; on a stair seen from behind it hides an edge the old rule
  would have drawn (tested). Faces are oriented, never trusted: neighbours
  are flooded to opposite windings and the whole turned outward by its
  signed volume. An open, pinched or non-planar polyhedron is refused by
  name. Volume (divergence theorem over fans) and area (half the Newell
  normal) are exact from the coordinates; `counts` prints vertices, edges,
  faces by kind, and Euler's V − A + F.

### Composites that are one body

- **`on`** stands a solid on a named one's top. A round solid on a round top
  of the same radius is one body: the shared rim is drawn once, seen where
  either lateral surface faces the reader, and the covered top is no face. A
  smaller solid stands on the exposed ring (its base rim is seen where that
  ring is), a larger one overhangs. Everything else stays transparent, as
  ADR 0046 decided.
- **`bore`**: a round or prismatic hole along the axis, or a prism inscribed
  in a cylinder's circle (the medal). Its edges are seen on a cap that faces
  the reader, or **through the opening**: the ray from a wall point toward
  the reader is followed to the far cap and the point is seen when it leaves
  through the hole. For a convex hole that one test is exact. Nothing else
  shows a bore's edge: the corner lines of a prism inscribed in a cylinder
  touch the outer wall in a seam of no thickness, and are hidden like the
  rest of the hole's wall (tested: the medal's two near corner lines are
  dashed, as is a round hole's outline). Visibility of
  such an edge has no closed form, so `splitParam` samples and bisects each
  change to 1e-12. The panel prints `V = V(cilindro) − V(furo) = …`.
- **`total`** sums a composite's volume, and its area less twice each round
  junction.

### Liquid to a level

A horizontal plane cuts the solid at the level; the liquid body is tinted
and the level line is solid where the wall it lies on faces the reader,
dashed where it does not -- the solid's own rule, applied to the wall. The
level is typed, or computed from a typed volume: exact for a constant
section (`V/Ab`) and for a cone whose fraction is a rational cube (half the
height of a glass holds an eighth), by bisection (flagged `≈`) for a frustum.
The level is drawn as a dimension line beside the liquid -- arrowheads at
both ends, thin extension lines out from the floor (or the apex) and from the
level, square to the lateral face that draws furthest right -- in true length
and measured. A height drawn through the liquid is labelled on its dry part,
never on the level. A stair's tread gets the same kind of dimension line,
raised above its top step: a label on the tread's own edge fell on the side
wall, where it read as the depth of the wall's whole bottom edge. A solid drawn
beside its net keeps the size it has alone; the page widens instead (up to
2,2 times).

### Inscribed solids

A regular prism in a cylinder (ℓ = 2R·sen(180°/n): R√3, R√2, R) and a
cylinder in a cube or regular prism (r = a/2 or the apothem), alongside ADR
0046's sphere and cone.

### Nets

A polyhedron unfolds along a spanning tree of its faces, each child turned
about its shared edge to the far side; folds dashed, cuts solid, every face
its true size (tested by area). Prisms use the textbook strip (the cube's
cross), a stair hangs its profiles from its floor, everything else unfolds
breadth-first from its largest face; a net whose faces overlap is not a net,
other roots are tried, and the figure is refused when none works. Round
solids have closed forms: the 2πr × h rectangle, the sector of angle
360°·r/g, the annular sector. A net's lengths are flat, so their ruler is the
page unit itself and they are measured like every other length. A label that
contains π names its run's midpoint (`annotatesPlace`), because the length
check would read `4π` as 4 in the unit "π".

### Space

- **Grids** on coordinate planes, **blocks** whose front faces join the plane
  patches as occluders (a grid line behind a block is left out, not dashed),
  and each block's **orthogonal projections** on coordinate planes with their
  guides (2025 Q138).
- **Paths**: polylines through points with a mid-stretch arrow, dashed where
  hidden, their length exact (`2 + 2√10 + √14 + √41`, via `solid/exact.ts`),
  and their projection on a plane (2024 Q174).
- **Axis names** (`["N", "L", "altura"]`).

### answers: false

Projections and path lengths, a level computed from a volume, an inscribed
bore's side, a polyhedron's counts, a net's 2πr and θ, a frustum's slant or
height it was not typed by, and every volume, area and total are what such
exercises ask, and are hidden. Everything typed stays.

## What was refused

- **General occlusion between solids.** Still transparent (ADR 0046). The one
  exception, a round solid on a round top of its own radius, is one body, not
  two that occlude.
- **A liquid in a bored or tilted solid**, inner partitions (2024 Q161's
  baffles), and stacked polyhedra merged into one: no audited figure needs
  them yet.
- **Mixed π and non-π exact sums** (`16π − 32`): `exact.ts` keeps one π power
  per value, as ADR 0046 decided; such a value prints rounded, flagged.

## The cost

- **Label placement in small rims.** A radius on a flat top ellipse has no
  room for `r = 3 cm` at elevation 20°; the symbol alone is set and the value
  moves to the panel. The fallback now also takes the symbol when the full
  label's best spot clashed (cost ≥ 5), not only when the symbol's spot is
  perfect. No existing fixture's output changed (byte-compared).
- **Hidden-line removal costs O(edges × faces).** Fine at school sizes (a
  25-vertex Johnson solid); not meant for meshes.
- **Bisection for a frustum's level** prints `≈`.
- **The unit is fitted by decade** (ADR 0046): a stair of 1,2 m draws small;
  the fixture types decimetres.

## Coverage of the audit's item 4

Covered now: 2023 Q136 (frustum with a bore), Q165 (stair), 2024 Q174 (path
between walls, its projection), Q175 (cylinder net, partly: the rolling
itself is a picture), 2025 Q138 (cube and projections on gridded planes),
Q149 (a polyhedron from face data, tinted by sides, and its net -- the
coordinates must be typed), Q170 (box with water at a level), Q177 (medal:
cylinder with an inscribed square bore). Partial: 2023 Q148 (mast and cables
are paths; the flag is a picture), 2024 Q161 (a tank and its level; the
baffles are not offered), 2025 Q126 (named axes and a path; the aircraft is
a picture).

Fixtures: `fixtures/solid/` (frustum-cone-volume, frustum-pyramid,
cylinder-bore, medal-square-bore, cylinder-hemisphere, stairs,
box-water-level, cone-half-height, cylinder-liquid-volume, cube-net,
cylinder-net, polyhedron-net, prism-in-cylinder) and `fixtures/space/`
(cube-projections, path-between-walls). Tests:
`tests/solid-extensions.test.ts`, `tests/space-extensions.test.ts`.
