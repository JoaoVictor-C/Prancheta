# solid

The school solids of geometria espacial, as ENEM and ensino médio draw them:
cube, paralelepípedo, regular prisms and pyramids, the right circular
cylinder and cone, and the sphere. You type the dimensions once. Every
vertex, edge, rim ellipse and silhouette is computed from them. Every
printed measure is computed from the same numbers and written exact:
`D = 2√3`, `g = 2√5`, `V = 16π/3`, `A = 48 + 12√3`. See
[ADR 0046](../../../docs/decisions/0046-school-solids.md).

**Choose it when** the exercise is about a solid: its diagonal, height,
slant height, radius, volume or area, or one solid inscribed in another. It
is not for points, lines and planes on axes (use
[`space`](../space/PRESET.md)).

## Input

```json
{
  "preset": "solid",
  "unit": "cm",
  "solids": [
    { "kind": "cone", "radius": 2, "height": 4, "labels": true,
      "show": ["height", "radius", "slant"],
      "readings": ["measures", "volume", "area"] }
  ]
}
```

| kind | dimensions |
| --- | --- |
| `cube` | `edge` |
| `box` (paralelepípedo) | `width` (along y, page right), `depth` (along x, toward the reader), `height` |
| `prism` | `sides` (3–12), `edge`, `height` |
| `pyramid` | `sides` (default 4), `edge`, and `height` **or** `slant` (the apótema g) |
| `cylinder` | `radius`, `height` |
| `cone` | `radius`, and `height` **or** `slant` (the geratriz g) |
| `sphere` | `radius` |
| `frustum` (tronco) | of a cone: `radius` (bottom), `topRadius`, and `height` **or** `slant`; of a pyramid: `sides` (default 4), `edge` (bottom), `topEdge`, and `height` **or** `slant` |
| `hemisphere` | `radius` (or none, stood `on` a cylinder) |
| `stairs` | `steps` (1–12), `tread` (piso, along x), `riser` (espelho), `width` (along y) |
| `polyhedron` | `vertices` (`[x, y, z]` each) and `faces` (vertex indices in order round each face) |

A cone takes `"apex": "down"` to stand on its apex with its base on top (a
glass, a funnel); `at` is then the apex. See
[ADR 0068](../../../docs/decisions/0068-solid-and-space-extensions.md) for
everything below that was added with it.

- **`at`** is the centre of the base (for a sphere, its centre). It defaults
  to the origin. Solids stand upright, with their axis along z.
- A dimension that is zero or negative is refused. So is an impossible pair:
  a slant no longer than the radius, or than the base apothem.
- **Derived solids** type no dimensions at all:
  - `{"kind": "sphere", "inscribedIn": "<cube or equilateral cylinder>"}`
  - `{"kind": "sphere", "circumscribes": "<cube or box>"}`
  - `{"kind": "cone", "inscribedIn": "<cylinder>"}`

  - `{"kind": "prism", "sides": 4, "inscribedIn": "<cylinder>"}` (ℓ = R√2;
    `sides` is the one thing typed)
  - `{"kind": "cylinder", "inscribedIn": "<cube or regular prism>"}` (r = a/2,
    or the base apothem)

  Give the target a `name`.
- **`on`** stands a solid on the top of a named one: its `at` is that top's
  centre, and a hemisphere, cone or cylinder stood on a cylinder or a cone's
  frustum takes the top radius when its own is not typed. A round solid on a
  round top of the same radius makes one body: the rim they share is drawn
  once, seen where either lateral surface faces the reader, and the covered
  top is no face (not filled, not a cap that shows the rim).
- **`bore`** runs a hole through a solid with two flat bases (cylinder,
  frustum, prism, cube, box) along its axis: `{"radius": ρ}`, `{"sides": n,
  "edge": ℓ}`, or `{"sides": n, "inscribed": true}` in a cylinder (its
  corners on the cylinder's circle, ℓ = R√2 for a square). A bore that does
  not fit is refused. Its edges are seen on a cap that faces the reader or
  **through the opening**: the ray from a point of the hole's wall toward the
  reader is followed to the far cap, and the point is seen when it leaves
  through the hole -- so a thin medal shows the far bottom edge of its hole and
  a tall piece does not. Nothing else shows it: an inscribed prism's corner
  lines, a seam of no thickness on the outer wall, are hidden. `volume` and `area` print what is left:
  `V = V(cilindro) − V(furo) = 96π − 27π/2 = 165π/2`.
- **`liquid`** fills a cube, box, prism, pyramid, cylinder, cone (either way
  up) or frustum to a level: `{"height": n}`, or `{"volume": V}` (a number, or
  `"18π"`) and the level is computed -- exact for a constant section and for a
  cone whose fraction is a rational cube, by bisection (flagged `≈`)
  otherwise. The liquid is tinted; the level line is solid where the wall it
  lies on faces the reader and dashed where it does not. `show: ["level"]`
  draws the level as a dimension line beside the liquid, with arrowheads and
  extension lines from the floor (or apex) and from the level; a height
  drawn through the liquid is labelled above it. `volume` prints
  `V(líquido)` and `V(líquido)/V`; `measures` prints a computed level.
- **`net`**: `true` draws the planificação beside the solid, `"only"` instead
  of it. Polyhedra unfold along a tree of their faces, fold lines dashed;
  prisms (and cubes, boxes) as the textbook strip -- the cube's cross -- and a
  stair hangs its profiles from its floor; everything else unfolds outward
  from its largest face, and a net whose faces would overlap is refused.
  A cylinder unrolls to its 2πr × h rectangle and two discs, a cone to a
  sector of radius g and angle θ = 360°·r/g, a cone's frustum to an annular
  sector. Bases are named `base`; `netLabels` names every face instead (a
  die's numbers are allowed, a measure is not). Lengths on a net are true
  lengths and are measured.
- **`stairs`** and **`polyhedron`** are not convex in general, so they are
  drawn with hidden-line removal over the whole solid: an edge is cut where
  it crosses the outline of a face that faces the reader and is hidden where
  such a face is nearer (`mesh.ts`). A polyhedron is checked (closed, planar
  faces, two faces per edge) and oriented whatever the winding typed.
  `"tint": "sides"` colours its faces by their number of sides.
  `readings: ["counts"]` prints `vértices: 9; arestas: 16; faces: 9 (4
  triângulos, 5 quadrados)` and `V − A + F = 9 − 16 + 9 = 2` (any polyhedron).
  A stair's `area` prints pisos, espelhos and paredes laterais apart.
- **`total`** (top level): `["volume", "area"]` sums the composite, the area
  less twice every round junction.
- **`labels`**: `true` gives the textbook letters. Base vertices are A, B,
  C, … counter-clockwise from the front-left, top vertices follow, a
  pyramid's apex is V. A cylinder's centres are O and O′, a cone's are V
  and O, a sphere's is O. Pass an array instead to choose the names. A name
  containing a digit is refused.
- **`show`**: which construction lines to draw. Each is computed, and each
  printed length is checked in true 3D length.

  | kind | show |
  | --- | --- |
  | `cube` | `edge` (a), `spaceDiagonal` (D = a√3), `faceDiagonal` (d = a√2, with the right angle to D) |
  | `box` | `dimensions` (the three edges at B), `spaceDiagonal`, `faceDiagonal` |
  | `prism` | `edge` (ℓ), `height` (a lateral edge) |
  | `pyramid` | `edge`, `height` (V to O, right angle at O), `baseApothem` (m), `slant` (g, on the right visible face) |
  | `cylinder` | `radius` (on the top base), `height` (on the right silhouette) |
  | `cone` | `height`, `radius` (right angle at O), `slant` (on the right silhouette) |
  | `sphere` | `radius`, `equator` |
  | `frustum` | cone: `radius` (R), `topRadius` (r), `height`, `slant`; pyramid: `edge` (ℓ), `topEdge` (ℓ′), `height`, `slant` |
  | `hemisphere` | `radius` (centre to the top of the dome) |
  | `stairs` | `dimensions` (the width, the first riser, and the tread as a dimension line above the top step) |
  | any with a `bore` / `liquid` | `bore` (ρ or ℓ), `level` |
- **`readings`**: `"volume"`, `"area"` (total area) and `"measures"` (the
  derivation of each shown measure). Each is printed in the panel as
  formula and value: `V = πr²h/3 = 16π/3`.
- **`unit`** (top level) prints after every length, with ² for areas and
  ³ for volumes.
- **`camera`** is as in `space`. Leave it out to get the default:
  - **cavalier** when the figure has only polyhedra;
  - **orthographic, azimuth 0°, elevation 20°** when it has only round
    solids;
  - **orthographic, azimuth 30°, elevation 20°** when it mixes both.

  An orthographic camera draws a sphere as a circle and a horizontal rim as
  a level ellipse, as the textbook does.

## What is drawn

- **Hidden edges are dashed.** An edge is hidden when neither face that
  meets there faces the reader. A rim point is hidden when neither its cap
  nor the lateral surface there faces the reader. A cylinder's back half of
  the bottom rim is dashed. A cone's base rim is dashed between the two
  points where its silhouettes touch.
- **Construction lines are dashed** where they run inside the solid or on a
  face turned away: a height, a space diagonal, a base radius under a cone,
  a sphere's radius. They are solid on a face the reader sees.
- **Composites are transparent.** Each solid dashes only its own hidden
  edges, and no solid hides another. A rim two solids share is drawn once,
  by the solid listed first.
- **When a label has no honest spot**, a printed length is shown as its
  symbol alone (`g`) and its value moves to the panel. This happens when
  the full label (`g = 13`) would sit nearer another line.

## Scale

Pixels per unit are fitted to the largest dimension: solids of 1 to 30
lengths draw as they always did, and any other magnitude scales its bounds by
its decade, so a cone of r = 3000 and h = 4000, a cube of edge 0,003 and a cone
of r = 2 and h = 4 are the same figure. Small and large values print with
their digits (`a = 0,003`, `D = 3√3/1000`, `V ≈ 7238229473871`), never as
`0,00`. A typed decimal is exact whatever its magnitude.

## answers: false

`"answers": false` draws the exercise's question. Every solid keeps the
dimensions it was GIVEN, drawn and labelled; nothing computed is drawn or
printed. Kept: the solid, its vertex letters, the edge of a cube or prism, the
three dimensions of a box, r and h of a cylinder, r of a cone or sphere, the
`height` of a prism, cylinder, pyramid or cone typed by its height, the
`slant` of a pyramid or cone typed by its slant, and the equator of a sphere.
Hidden: the space and face diagonals (and their right-angle mark), a base
apothem, a height or slant the dimensions did not state (a cone typed by its
slant does not show h), every length of a derived solid (the radius of an
inscribed sphere), and the whole panel: `measures`, `volume` and `area`. The
derivation line of a derived solid keeps only its relation ("inscrita no
cubo"), not its formula.

The extensions of ADR 0068 follow the same rule. Kept: a frustum's typed radii
or edges and its typed height or slant, a bore's typed radius or edge, a
liquid's typed level, a stair's tread, riser and width, a net and every
given length on it (h, r, a typed g). Hidden: a frustum's slant or height it
was not typed by, an inscribed bore's side, a level computed from a volume
(the liquid is still drawn at it), a polyhedron's counts, a net's 2πr and
its sector angle θ, an inscribed prism's or cylinder's dimension, and every
volume, area and total.

## What is not covered

- Occlusion between solids. A composite stays transparent (ADR 0046); only a
  round solid stood on a round one of the same radius is joined into one body.
- Stacked polyhedra (`on` places them, but their shared face is not removed)
  and a `total` area for them, which is refused.
- Inner partitions (a tank's baffles), a liquid in a bored solid, a tilted
  liquid, the net of a bored solid or of a sphere.
- `16π − 32` is not an exact form here (π and non-π terms): it prints rounded,
  flagged `≈`.
- The unit is fitted to the largest dimension by its decade, so a solid whose
  largest dimension is 1 to 3 (a stair of 1,2 m) draws small; type it in a
  smaller unit (12 dm).

Fixtures: [`fixtures/solid/`](../../../fixtures/solid/).
