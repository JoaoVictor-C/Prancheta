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

- **`at`** is the centre of the base (for a sphere, its centre). It defaults
  to the origin. Solids stand upright, with their axis along z.
- A dimension that is zero or negative is refused. So is an impossible pair:
  a slant no longer than the radius, or than the base apothem.
- **Derived solids** type no dimensions at all:
  - `{"kind": "sphere", "inscribedIn": "<cube or equilateral cylinder>"}`
  - `{"kind": "sphere", "circumscribes": "<cube or box>"}`
  - `{"kind": "cone", "inscribedIn": "<cylinder>"}`

  Give the target a `name`.
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
