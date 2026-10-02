# space

Points, vectors, lines and planes in R³, the Geometria Analítica course's
figures, drawn on three axes through a camera. Typed coordinates are the only
input. Every other position is derived: a midpoint, the point where a line
pierces a plane, the line where two planes meet, the foot of a perpendicular,
a cross product or the common perpendicular of two skew lines. Every printed
number is computed with `geometry/vec.ts` and written exact in pt-BR:
`(12/7; 12/7; 10/7)`, `d(P, π) = 3√14/7`, `2x + 3y + 6z − 12 = 0`.

Visibility is decided per object, by depth. A line, an axis or an edge is
dashed exactly where a plane patch hides it and solid elsewhere, split at the
point where it pierces the plane. See
[ADR 0045](../../../docs/decisions/0045-space-and-projection.md).

**Choose it when** the content is a configuration in space: a point and its
coordinates, a plane and its intercepts, a line meeting a plane, two planes
and their intersection, u, v and u × v, or two skew lines. It is not for
vectors in the plane ([`vectors`](../vectors/PRESET.md)). It is not for a
school solid (a cylinder, cone, sphere or prism), which has silhouettes this
preset does not draw.

## Input

```json
{
  "preset": "space",
  "points": [
    { "name": "A", "at": [2, 1, 0] },
    { "name": "B", "at": [2, 3, 2] },
    { "name": "I", "intersection": ["r", "π"] }
  ],
  "lines": [{ "name": "r", "through": ["A", "B"] }],
  "planes": [{ "name": "π", "equation": "2x + y + 2z = 8" }],
  "measures": [{ "angle": ["r", "π"] }, { "distance": ["A", "π"] }]
}
```

Names are shared across `points`, `vectors`, `lines` and `planes`, and are
resolved in any order. A name may refer to an object declared later, and a
cycle is refused. `locale` (default `"pt-BR"`) and `title` sit at the top
level.

### Camera

`"camera"` is optional. It takes one of these values:

- **`"cavalier"`** (the default). This is the textbook oblique view: y points
  right and z up, both at true scale, and x comes toward the reader, drawn at
  45° down-left and halved. You can tune it with
  `{ "kind": "cavalier", "angle": 45, "ratio": 0.5 }`.
- **`"isometric"`**.
- **`{ "kind": "orthographic", "azimuth": 30, "elevation": 20 }`**, a general
  view given in degrees.

### Axes and region

- **`"axes"`** takes `{ "ticks": true }` for whole-number ticks with pt-BR
  numbers. Add `"names": false` to hide the x, y and z names, and
  `"origin": false` to hide the O.
- **`"region"`** takes `{ "x": [lo, hi], "y": [...], "z": [...] }`. Lines
  and plane patches are clipped to it. When it is left out, it is derived
  from the figure's points: from 0, or one below the lowest negative
  coordinate, to one past the highest. A plane's axis intercepts widen it
  only when the figure is about them (an octant patch or `intercepts`) or
  has no points of its own.

### Points

| shape | meaning |
| --- | --- |
| `{ "name": "P", "at": [2, 3, 4] }` | typed; add `"box": true` for the dashed parallelepiped to the coordinate planes, or `"box": "floor"` for P → (x, y, 0) → axes |
| `{ "name": "M", "midpoint": ["A", "B"] }` | derived |
| `{ "name": "I", "intersection": ["r", "π"] }` | a line with a plane, or two lines. Refused when they are parallel, contained, `paralelas`, `coincidentes` or `reversas` (this one names `commonPerpendicular` instead) |
| `{ "name": "F", "foot": { "from": "P", "on": "π" } }` | the foot of the perpendicular on a plane or a line, drawn with a dashed guide from P (and a right-angle mark on a line) |

A typed point's label shows its coordinates, `P(2; 3; 4)`. A derived point
shows its name, and the panel below prints its derivation and coordinates.
`"coords": true/false` overrides either default. When the figure hides the
coordinates, it still prints them in the panel.

### Vectors

| shape | meaning |
| --- | --- |
| `{ "name": "u", "components": [2, 1, 0] }` | tail at the origin, or `"at"`: a point name or `[x, y, z]` |
| `{ "name": "AB", "from": "A", "to": "B" }` | between two points |
| `{ "name": "w", "cross": ["u", "v"] }` | the cross product; refused for parallel vectors (the zero vector) |
| `{ "name": "s", "sum": ["u", "v"] }` | component-wise |

A vector drawn from the origin takes `"box"` like a point. The panel prints
`u = (2; 1; 0); |u| = √5`.

### Lines

| shape | meaning |
| --- | --- |
| `{ "name": "r", "through": ["A", "B"] }` | two points |
| `{ "name": "r", "point": "A", "direction": "u" }` | a point (name or coordinates) and a direction (vector name or components) |
| `{ "name": "r", "intersection": ["α", "β"] }` | two planes. Refused when parallel or coincident. Printed through its simplest point with whole-number direction: `(0; 0; 4) + t(1; 1; −2)` |
| `{ "name": "n", "point": "P", "perpendicularTo": "π" }` | through P along π's normal |

The panel prints each line's vector equation.

### Planes

| shape | meaning |
| --- | --- |
| `{ "name": "π", "equation": "2x + y − z = 4" }` | read with the typographic minus, a pt-BR comma and `1/2x` |
| `{ "name": "π", "point": "A", "normal": [1, 2, 2] }` | a point and a normal |
| `{ "name": "π", "through": ["A", "B", "C"] }` | three points; refused if collinear |

Each plane takes three options:

- **`"patch"`**: `"parallelogram"` is the default. It is the textbook
  patch, with edges parallel to the two coordinate planes the normal leans
  least on. It is centred on the figure's points and clipped to the region.
  `"octant"` draws the piece in x, y, z ≥ 0, which for positive intercepts
  is the intercept triangle.
- **`"intercepts": true`** marks and numbers where the plane meets each
  axis.
- **`"traces": true`** draws its traces on the coordinate planes. An octant
  patch's edges already are its traces.

The panel prints the equação geral in canonical form: whole coefficients, no
common factor, a positive leading coefficient, `= 0`.

### Measures

Measures go to the panel only.

| shape | prints |
| --- | --- |
| `{ "distance": ["P", "π"] }` | the distance between points, lines and planes: point–point, point–line, point–plane, parallel or skew lines, parallel planes, and 0 when they meet |
| `{ "angle": ["r", "π"] }` | the angle between two vectors, two lines, a line and a plane, or two planes. It prints `ângulo(r, π) = 45°` when the angle is a whole degree. Otherwise it prints the exact cosine (or sine, for a line and a plane) and the angle rounded, `≈ 27,66°` |
| `{ "position": ["r", "s"] }` | `concorrentes`, `paralelas`, `coincidentes` or `reversas`, or a line or plane relative to a plane |
| `{ "commonPerpendicular": ["r", "s"] }` | for `reversas` only. It draws the segment between the closest points, with right-angle marks, and prints its feet and d(r, s) |

A `label` on any object may rename it. It is refused if it contains a
digit, because a printed number is computed, never typed.

## What is drawn

The drawing has these parts:

- **Axes.** Arrows at the positive ends.
- **Plane patches.** Filled at about 10% of their colour, with outlines in
  the same colour.
- **Lines.** Clipped a little past the region, so they read as lines.
- **Vectors.** A shaft and an arrowhead.
- **Guides.** Grey dashes, always dashed.
- **Points.** Dots, drawn last so that nothing is painted over a point.

Hidden stretches keep their object's colour and are drawn dashed. A patch
edge that lies on an axis is left to the axis. Labels have no backing.
Point and tick labels name their place (`annotatesPlace`). Line, vector and
plane names name the piece of ink they sit beside (`annotates`). A label is
set only where it is at least 3 px clear of every line and every other label,
and nearer what it names than anything else. A tick number with no such spot
is left off, and its tick mark stays.

## Scale

The tick step is 1, 2 or 5 × 10ᵏ for any k, fitted to the span of the
figure's own points (`shared/scale.ts`). A point at (3; 4; 5) is numbered
1, 2, 3 …; one at (3000; 4000; 5000) by 500 or 1000; one at
(0,001; 0,002; 0,003) by 0,0005. Every axis has about ten intervals whatever
the magnitude, and the canvas stays a page. Where the figure is framed by
points, a plane's far intercept still does not stretch it ("far" is more than
twelve steps). Small numbers print with their digits (`0,0005`), never as
`0,00`. A typed point whose label (name and coordinates) finds no clear spot on
a crowded page is drawn again with the name alone beside the dot and the
coordinates in the panel.

## answers: false

`"answers": false` draws the exercise's question, not its solution. Kept:
the axes and ticks, every typed point with its coordinates, every typed
vector with its components in the panel (`u = (2; 1; 0)`), lines and planes
as drawn, and the names of derived points and lines. Hidden: the arrow of a
derived vector (a cross product or a sum -- drawing it is the answer),
the coordinates of every derived point (an intersection, midpoint or foot),
the derivation lines, every `distance`, `angle`, `position` and
`commonPerpendicular` reading, the printed equation of each plane and line,
`|v|` and the components of a derived or two-point vector, and the numbers at
a plane's marked intercepts. A figure with nothing to say in the panel has
no panel. The dashed guides and the common perpendicular's segment stay:
they are the construction, not a number.

## What is not covered

- School solids (cylinders, cones, spheres, prisms). `geometry/projection.ts`
  exports what they need: `projectCircle`, `sphereOutline`,
  `tangentParamsParallelTo`, `tangentParamsFrom` and `depth`.
- General hidden-line removal. A segment never hides a segment, and
  translucent fills simply overlap.
- Planes hidden by planes, beyond their edges. Where two patches overlap,
  the fills mix and each outline is dashed where the other patch hides it.
- Lengths on the drawing. A projected length is not the true length, so
  every number goes to the panel, where it is exact.

Fixtures: [`fixtures/space/`](../../../fixtures/space/).
