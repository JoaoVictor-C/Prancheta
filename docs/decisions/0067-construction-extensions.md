# 0067 — Construction extensions: shapes are chains of pieces, and the checks measure what they print

## Status

Accepted. Built in `src/presets/construction/` (`shapes.ts`, `preset.ts`), `tests/construction-extensions.test.ts`
and ten fixtures. Phase 6 item 3 of `docs/research/AUDIT-ENEM.md` (14 partial figures: 2023 Q145, 154, 163, 172b, 177;
2024 Q144, 150, 155, 163, 174; 2025 Q139, 148, 156, 173, 177).

## The need

ADR 0044's constructions (points, lines, circles, polygons, conics) and ADR 0047's pictograms drew the geometry
of the ENEM figures but not their dress: a circular sector with its angle, a belt round two pulleys, a ring, the
half-pizzas on a triangle's sides, a plan with dimension lines, a path with direction arrows over a square lattice,
a trapezoid beside its axis of rotation, shaded or hatched regions. Each needs the same discipline as before: no
position and no number is typed beside the figure it describes.

## The decision

**A shape is a closed chain of pieces** (`shapes.ts`): a straight run, or an arc about a centre by a signed angle.
A sector, an annular sector, a semicircle and a user-built region are all chains. The outline is sampled from the
pieces (an arc every 2°, within 0,03 px of the circle at the sizes drawn) and the AREA is Green's theorem over the
same pieces: a line contributes ½(x₁y₂ − x₂y₁), an arc ½[r²Δθ + cₓr(sin θ₁ − sin θ₀) − c_y r(cos θ₁ − cos θ₀)]. The
number a label prints and the polygon `area-matches-its-label` measures are two evaluations of one definition. A whole
ring is one outline: the outer circle, a hairline bridge, the inner circle the other way round. Its shoelace area is
πR² − πr², and its hatch leaves the hole bare.

**Each shape is two marks, because two checks read different things.** The OUTLINE is one closed mark whose arcs
turn about their own centres. `sweep-matches-its-label` already reads such a mark as a sector (the donut-slice case),
so no new check code was needed. The FILL is a closed polygon of framed points with no stroke, which is what
`area-matches-its-label` measures (it is not applicable to a mark with arcs). A sector's angle is also drawn as a
swept arc at the apex, and that arc is the mark the angle label names.

**The belt is computed from the two circles.** External: cos φ = (r₁ − r₂)/d, each straight run is
√(d² − (r₁ − r₂)²), and the belt wraps 2π − 2φ of circle 1 and 2φ of circle 2. Crossed: cos φ = (r₁ + r₂)/d and each
circle is wrapped through 2π − 2φ. The tests hold every tangent point perpendicular to its radius. The four tangent
points can be named (`touch`), so the exercise's radii and angle are ordinary segments and `angle` annotations. The two
straight runs are measured segments (`belt.t1`, `belt.t2`), checked by `length-matches-its-label`. The belt's total
length, a sum of runs and arcs, goes to the readings panel.

**A dimension line is a framed connector.** Its two ends are the measured points moved along the left or right normal,
so it is exactly as long as what it measures and `length-matches-its-label` measures its printed number. The arrowheads
are the connector's own, the extension lines are plain marks (3 px off the point, 5 px past the line), and the label is
centred beside the line on the side away from the measured object.

**Regions are boundaries, not booleans.** A `region` is a start point and pieces: straight runs to named points and arcs
about a named centre (`to` must lie on that circle; `ccw` says which way round). It must close. This covers the
union/difference cases the audit needs (Hippocrates' lunes are two arcs, the band along a track is an annular sector)
without a polygon-clipping routine, whose degenerate cases (tangent circles, shared vertices, arcs meeting at a vertex)
would be the likeliest source of silently wrong areas. The lunes fixture asserts L₁ + L₂ = the triangle's area from the
pieces alone.

**Hatches are scan lines of the sampled region**, clipped by the even-odd rule in canvas pixels, one mark each, all
declared as ink so a label never lands on one. `fill` and `hatch` also work on polygons and circles.

**Paths and the lattice.** `path` draws a polyline through named points with a solid arrowhead at the middle of each
step. Its steps are measured segments, so a length printed on a step is checked. `grid` lays an unnumbered lattice
(`labels: false`, no axes) in the plane's frame, exempt from `text-clear-of-ink` exactly as the numbered one is.

**Rotation axes** are a dashed run past both ends of the named segment (never over the segment itself, whose own edge it
would smear) and an elliptical turn arrow with a solid head at each end asked for.

**Circles about a square.** `circumcircle` and `incircle` take a quadrilateral. The circle through three vertices is
verified through the fourth, and the incircle's centre (internal bisectors at two vertices) is verified equidistant from
all four sides. A rectangle has a circumcircle and no incircle, and is refused by name.

**`answers: false`.** `area`, `arc`, `radius`, a sector's `angle` and a dimension print a measured number, so they print
only their name (or `?` for an unnamed angle, as before) unless `"given": true` marks the exercise's own datum. `given`
also works on `length` and `angle`, closing a gap in ADR 0062's convention: a room's stated width could not be kept while
its asked-for diagonal was hidden. The belt's length reading is empty.

## What was refused

**Boolean operations on shapes.** See above.

**Measuring an arc length.** No check reads a curved run, and adding one is outside this item. `{ "arc" }` prints a
computed number and `length-matches-its-label` reports it not applicable, never a pass.

**A dimension line as a typed segment.** A segment beside the figure with a typed length is the defect ADR 0028 exists to
prevent; the dimension is derived from the two points it measures.

## The cost

**A radius label needs room.** A small circle in a figure dominated by a large one cannot always hold `r = 6 cm` beside
its radius; the belt fixture was sized until it could, and otherwise the author leaves the radius unlabelled.

**A belt is a stroked loop**, with no thickness and no teeth; the figures it serves are schematic.

**Turn arrows are elliptical caps**, a convention for "rotates about this axis", not a perspective drawing.

## Blast radius

Only `src/presets/construction/` (`preset.ts`, new `shapes.ts`, `PRESET.md`), `tests/construction-extensions.test.ts`,
ten fixtures in `fixtures/construction/` and this ADR. Existing objects, fixtures and tests are unchanged; a polygon
fill is now drawn as a framed polygon, the same shape as before. No check, shared module or registration changed.
