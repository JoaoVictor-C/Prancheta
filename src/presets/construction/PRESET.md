# construction

Plane geometry and Geometria Analítica in the plane, as a list of **named
objects, each defined from objects named before it**. Free points are the only
coordinates an author types; every other point, line, circle and conic is
**computed** from its definition through the shared vector algebra
(`src/geometry/vec.ts`, ADR 0043), and every printed measure — a side's
length, an angle's degrees, a conic's equation — is computed from the drawing
rather than typed beside it. The two kinds of number that look typed on the
figure, lengths and angles, are measured against the ink by
`length-matches-its-label` and `sweep-matches-its-label`.

**Choose it when** the content is a ruler-and-compass construction or an
analytic-geometry figure: a triangle and its centres, a circle through three
points, a tangent from a point, an altitude with its right angle and the
lengths it cuts, a conic from its foci or its focus and directrix, the
distance between two points and the line through them. It is not for a
function's graph (`function-graph`), for vector arithmetic (`vectors`), or for
angles on the trigonometric circle (`unit-circle`).

## Input

```json
{
  "preset": "construction",
  "axes": false,
  "equalTicks": true,
  "objects": [
    { "A": [0, 0] },
    { "B": [6, 0] },
    { "name": "B'", "rotation": { "of": "B", "about": "A", "angle": 52 }, "hidden": true },
    { "name": "A'", "rotation": { "of": "A", "about": "B", "angle": -52 }, "hidden": true },
    { "name": "C", "intersection": ["AB'", "BA'"] },
    { "name": "ABC", "polygon": ["A", "B", "C"] },
    { "name": "H", "foot": { "of": "C", "on": "AB" } },
    { "name": "CH", "perpendicular": { "through": "C", "to": "AB" }, "draw": "segment", "dashed": true }
  ],
  "annotations": [
    { "angle": ["B", "A", "C"] },
    { "angle": ["A", "C", "B"], "name": "x" },
    { "angle": ["C", "H", "B"] }
  ]
}
```

Top level: `title`, `locale` (default `"pt-BR"`), `axes` (default `false`;
`true` draws a numbered grid with pt-BR ticks, ADR 0034), `equalTicks`
(tick every group of drawn segments that come out equal), `objects`,
`annotations`.

Two names written together — `"AB"` — mean **the line through A and B**
wherever a line is expected and no object has that name, as a statement says
"the perpendicular from C to AB".

### Points

| definition | meaning |
| --- | --- |
| `{ "A": [x, y] }` or `{ "name": "A", "at": [x, y] }` | a free point — the only typed coordinates |
| `"midpoint": ["A", "B"]` | midpoint of AB |
| `"intersection": ["r", "c"]` | where two lines, a line and a circle, or two circles meet. Two solutions need `"which": 0 \| 1` (ordered by x, then y — vec.ts's rule) or `"other": "P"` (the one that is not P) |
| `"foot": { "of": "P", "on": "r" }` | foot of the perpendicular from P |
| `"onCircle": { "circle": "c", "angle": 30 }` | the point of c at 30° (counter-clockwise from +x) |
| `"reflection": { "of": "P", "over": "r" }` | reflection over a line, or over a point |
| `"rotation": { "of": "P", "about": "O", "angle": 90 }` | rotation, degrees counter-clockwise |
| `"centroid" / "incenter" / "circumcenter" / "orthocenter": ["A", "B", "C"]` | triangle centres (or the name of a triangle polygon) |

Point options: `label` (text, or `false`), `coords: true` (prints the
computed pair, `A(−2; 1)`), `dot: false`, `hidden: true`.

### Lines

| definition | meaning |
| --- | --- |
| `"segment" / "line" / "ray": ["A", "B"]` | through two points (a ray starts at A) |
| `"perpendicular": { "through": "P", "to": "r" }` | `"draw": "segment"` draws P to the foot — an altitude |
| `"parallel": { "through": "P", "to": "r" }` | |
| `"perpendicularBisector": ["A", "B"]` | mediatriz |
| `"angleBisector": ["A", "V", "B"]` | the internal bisector of angle AVB; a ray from V, or `"draw": "segment"` to side AB, or `"draw": "line"` |
| `"tangent": { "from": "P", "to": "c" }` | tangent from P; `"which"` picks one of two, `"touch": "T"` names the point of tangency, `"draw": "segment"` draws P to T |

### Circles, polygons, conics

| definition | meaning |
| --- | --- |
| `"circle": { "center": "O", "radius": 3 }` | radius a number or an expression over lengths: `"dist(A,B)"`, `"dist(A,B)/2"` |
| `"circle": { "center": "O", "through": "P" }` | |
| `"circumcircle": ["A", "B", "C"]`, `"incircle": [...]` | |
| `"polygon": ["A", "B", "C", ...]` | sides are drawn as separate measured segments; optional `"fill"` |
| `"ellipse": { "foci": ["F1", "F2"], "a": 5 }` | or `{ "center": "O", "a": 5, "b": 3, "rotation": 30 }` |
| `"hyperbola": { "foci": ["F1", "F2"], "a": 3 }` | both branches; or `{ "center", "a", "b", "rotation" }` |
| `"parabola": { "focus": "F", "directrix": "d" }` | the directrix is a line object, drawn by its own style |

Conics are drawn **analytically** from these elements (parametric ellipse,
cosh/sinh branches, the vertex form of the parabola) — never traced from a
contour. `"show"` adds `"foci"`, `"vertices"`, `"asymptotes"` (hyperbola),
`"vertex"`, `"axis"` (parabola) and `"equation"` — the canonical equation,
computed when the conic's axis is parallel to a coordinate axis
(`x²/25 + y²/9 = 1`, `(x − 2)²/9 − (y − 1)²/16 = 1`, `x² = 8y`) and refused
otherwise.

Every object takes `label` (`true` prints its name), `dashed`, `colour`,
`hidden` (computed and usable, not drawn).

### Annotations

| annotation | what is drawn |
| --- | --- |
| `{ "length": "AB" }` or `{ "length": ["A", "B"], "name": "c" }` | the computed length beside a **drawn** segment or polygon side (`5`, `2,4`, `c = 7,21`), measured by `length-matches-its-label` |
| `{ "angle": ["A", "V", "B"] }` | an arc at V with the computed degrees (`36,87°`), measured by `sweep-matches-its-label`; a 90° angle becomes a right-angle square |
| `{ "angle": [...], "name": "x" }` | the arc labelled with a name — the unknown an exercise asks for |
| `{ "equal": ["AC", "BC"] }` | equal-length ticks, **refused** unless the segments are equal |
| `{ "equation": "r" }` | the line's reduced equation (or a circle's, or a conic's) in the readings panel |

The **readings panel** under the figure holds what the drawing cannot say
exactly: `AB = √13 ≈ 3,61` beside a line labelled `3,61`, `∠CBA ≈ 36,87°`,
equations. Nothing the drawing states exactly is repeated there.

### Word-problem pictograms (ADR 0047)

A `picto` option decorates an object already defined -- it adds no coordinate
of its own, so the scene a word problem describes (a ladder, a shadow, a
sight line to a boat) is drawn from the same numbers as the triangle that
solves it.

On a drawn **segment** (`"picto"` alongside `"segment": [A, B]`):

| picto | what it draws |
| --- | --- |
| `"ground"` | hatch ticks beside the segment |
| `"wall"` | hatch ticks beside the segment (the same mark, the reader's word for a vertical one) |
| `"ladder"` | a second rail parallel to the segment plus evenly spaced rungs |
| `"ramp"` | hatch ticks along the segment's underside |
| `"pole"` | a short crossbar at the segment's own top (not a ring: an open ring is this project's mark for a point that does not belong) |
| `"tree"` | a canopy circle just past the segment's own top |
| `"person"` | a stick figure whose height is the segment: a head past the top, arms and legs off the two ends |
| `"building"` | a facade rectangle beside the segment with a grid of windows |

`"side": -1` flips which side of the segment the hatching, the facade or the
ladder's second rail falls on (default `1`); a person's or pole's own side is
fixed by the segment's own direction. A picto is refused on a line or a ray
-- it needs two actual ends.

On a **point**: `"picto": "sun"` (a circle with eight rays) or `"picto":
"boat"` (a small hull, mast and sail).

None of this is new geometry. A pole's height is its segment's own length,
computed once; a sun's ray and a sight line to a boat are ordinary
`rotation` + `line` + `intersection` objects, exactly as any other
construction is built, with the picto only drawing the icon at one end.
Every pictogram mark is stroked, never filled, and is added to the same
label placer as the rest of the drawing, so a length or angle label searches
past it exactly as it does past any other line -- a label may sit beside a
wall but never on a ladder's rails. Worked examples: `fixtures/construction/
ladder-wall.json`, `pole-shadow.json`, `ramp.json`, `angle-of-depression.json`.

A top-level `unit` (`"m"`, `"cm"`) is printed after every length, on the
drawing and in the panel, and set on the frame, so `length-matches-its-label`
compares the unit as well as the number.

## Extensions: sectors, rings, belts, regions, dimensions, paths (ADR 0067)

More objects, each computed from the objects it names, never from a typed
measure. All take `label`, `colour`, `dashed`, `hidden`, `answer`; the shapes
that enclose a region also take `fill` (a tint) and `hatch` (`true`, or
`{ "angle": 45, "gap": 6, "colour": "#..." }`: parallel lines clipped to the
region, a hole left bare). `fill` and `hatch` also work on a `circle` and a
`polygon`.

| object | definition |
| --- | --- |
| `"sector": { "center": "O", "through": "A", "angle": 72 }` | the sector from ray OA counter-clockwise by 72° (negative: clockwise). Or `"to": "B"` instead of `angle` (OA to OB), or `"radius": 5, "from": 30` (degrees). Drawn as ONE closed outline, so `sweep-matches-its-label` measures its angle |
| `"ring": { "center": "O", "inner": 3, "outer": 5 }` | an annulus; with `"from": 40, "angle": 50` an annular sector (the band along a track) |
| `"semicircle": { "on": ["A", "B"], "side": 1 }` | the half-disc on AB as diameter, `1` = left of A→B. `"away": "C"` (a point or a polygon) bulges away from it: the half-pizzas on a triangle's sides |
| `"belt": { "circles": ["pa", "pb"], "tangents": "external", "touch": ["T1", "U1", "T2", "U2"] }` | the belt round two circles: `"external"` or `"crossed"` tangents computed from the circles, plus the wrapped arcs. `touch` names the four tangent points (circle 1 then circle 2 on the first tangent, then on the second) so radii and angles can be drawn from them. Its length is a reading |
| `"region": { "start": "A", "then": [ { "arc": { "center": "M", "to": "B", "ccw": true } }, { "arc": { "center": "K", "to": "A", "ccw": false } } ] }` | a region bounded by straight pieces (`{ "line": "P" }`) and circle arcs about a named point or circle (`to` must be on that circle, `ccw` says which way round); the boundary must close. A lune, a circular segment, a stadium. This is the "polygon plus circle segments" form of a union or difference; no boolean operation on shapes is attempted |
| `"path": { "through": ["A", "B", "C"], "arrows": "each" }` | a polyline through named points with a solid arrowhead at the middle of each step (`"end"`: only at the end, `"none"`); `"closed": true`. Its steps are measured segments named `walk.1`, `walk.2`… |
| `"dimension": { "from": "A", "to": "B", "offset": 0.7, "side": -1 }` | an architectural dimension line (cota): a line parallel to AB at `offset`, arrowheads at both ends, two extension lines, the length printed centred beside it and measured by `length-matches-its-label`. `"side"`: `1` left of A→B, `-1` right. `"label": "x"` names the quantity (`x = 1,5 m`) |
| `"rotationAxis": { "through": ["P", "S"], "extend": 0.3, "arrows": "both" }` | a dashed axis past both ends of PS (by 30 % of its length) with a curved turn arrow at each end asked for (`"first"`, `"last"`, `"both"`, `"none"`; `"turn": -1` reverses). `label` names it (`eixo`) |

`circumcircle` and `incircle` also take a polygon of four points (or four
names): a rectangle's or square's circumcircle, a square's, rhombus's or
kite's incircle. A quadrilateral with no such circle is refused by name.

A top-level `"grid": true` (or `{ "step": 2 }`) lays an unnumbered square
lattice under the figure -- the "malha quadriculada" of a path question. Not
together with `axes`.

Annotations added: `{ "area": "S" }` (`A = 15,71 cm²`, measured by
`area-matches-its-label` against the region's own outline), `{ "arc": "S" }`
(`ℓ = 6,28 cm`, of a sector, semicircle or circle), `{ "angle": "S" }` (a
sector's angle as a measured arc), `{ "radius": "C", "which": "inner", "at": 135 }`
(a radius drawn from the centre with its length, `r` or `R` unless `name` says
otherwise; `which` picks a ring's radius), and `"given": true` on any of these,
`length` and `angle`. `length` also names the runs a shape owns: `"belt.t1"`,
`"belt.t2"`, `"S.r1"`, `"walk.3"`.

An arc's length cannot be measured by a check (none reads a curved run), so
`{ "arc" }` prints a computed number that `length-matches-its-label` reports as
not applicable, never as a pass. Everything else printed is measured.

Worked examples in `fixtures/construction/`: `sector-area`, `ring`,
`annular-sector`, `belt-pulleys`, `hippocrates-lunes`, `semicircles-on-sides`,
`square-circles`, `floor-plan-dimensions`, `grid-path`,
`trapezoid-rotation-axis`.

## Refusals

Also refused by name: a sector of 0° or 360°, a ring whose inner radius is not
smaller, a belt of nested or overlapping circles, a region whose boundary does
not close or whose arc ends are not on one circle, a semicircle with no side, a
path step of length zero, a quadrilateral with no circle of the kind asked.

Every construction that cannot be carried out is refused by name, never drawn
approximately: an undefined object (with a "did you mean"), two parallel lines
asked to meet, a line and a circle or two circles that do not meet, an
ambiguous intersection with no `which`, a degenerate (collinear) triangle, a
tangent from inside a circle, a focus on its own directrix, an ellipse whose
2a does not exceed the focal distance (a hyperbola's that does), an
equation asked of a turned conic, equal ticks on unequal segments, a length
on a segment that is not drawn, and a label or name that types a coordinate
or a number.

## What it guarantees

- Every point, line and circle is one vec.ts construction of the objects it
  names; the conics satisfy their focal definitions (tested).
- Lengths are stated in the plane's frame, so `length-matches-its-label`
  measures each printed length against its run; angle arcs are sweeps whose
  arms are the sides, so `sweep-matches-its-label` measures each printed angle.
- Point names `annotatesPlace` their point (ADR 0028/0035); lengths, angles
  and line names `annotates` their own ink. No label has a backing.
- Points are drawn last, so a dot is never under a line through it.

Examples: `fixtures/construction/`.

## Scale

The view is built from the drawn objects' extent alone: the margin is 8 % of
it (13 % with axes) and the unit is fitted so it fills about 460 px, so a
triangle with sides 3000 and 4000, one with sides 3 and 4 and one with sides
0,003 and 0,004 are the same figure. With `axes` the tick step is 1, 2 or 5 ×
10ᵏ at any k, at most ten divisions to an axis, and a division is never
narrower than 48 px (ADR 0034).

## answers: false

The extensions follow the same rule (ADR 0067): an `area`, `arc`, `radius`,
sector `angle` or dimension prints a measured number, so with `answers: false`
it prints only its `name` (or nothing, or `?` for an unnamed angle) -- unless it
says `"given": true`, the exercise's own datum (a pulley's radius, a room's
width), which stays. A belt's length reading and every other panel line are
empty. Hatches, fills and the shapes themselves stay.

`"answers": false` draws what an exercise **gives**. A construction figure *is*
its objects, so the drawing stays; what goes is every **measured number**:

- a `length` annotation with a `name` prints just the name (`h`, the unknown);
  one without prints nothing;
- an `angle` annotation with a `name` keeps it; one without is marked `?` in the
  unknown's red — the arc says which angle, the degrees are the answer. A 90°
  square is a shape, and stays;
- the readings panel (exact lengths, angle values, `equation` annotations, a
  conic's `show: ["equation"]` and its asymptote equations) is empty;
- `coords: true` prints a **free** point's pair (typed: a datum) and leaves a
  computed point (a midpoint, a foot, an intersection) with its name only.

The construction's own results are not guessed at: whether the altitude *is*
the answer ("construa a altura") or a given ("calcule a altura h") is the
author's to say. `"answer": true` on an object withholds it under
`answers: false` — not drawn, its dot and label gone, every `length`, `angle`
and `equal` annotation that touches it dropped — and it still bounds the view
and can be built on, so the question and the solution overlay. With `answers`
left on `"answer"` does nothing. Example:
`fixtures/construction/right-triangle-altitude-statement.json`.
