# vectors

Vectors in R², for Geometria Analítica and Física 1. A vector is given three
ways: by components, by two named points, or by magnitude and angle. Every
sum, difference, scalar multiple, decomposition into x/y components,
projection of one vector onto another, and the angle between two vectors is
**derived** from the vectors already named — never typed. A sum's arrowhead
lands where component addition puts it; an angle arc's sweep is the angle its
two arms actually make. The number a reader would compute by hand is computed
here instead, and printed in pt-BR with the project's one locale formatter —
a magnitude whose square is an integer prints as an exact root, `|(3, 1)|` as
`√10`, the way `sign-chart` snaps a root of the function it is given.

**Choose it when** the content is one or more vectors in the plane and the
question is about their arithmetic or their geometry: a resultant force, a
displacement between two points, the component of one vector along another,
the angle between two directions. It is not for a single arrow inside a
larger scene (that is `annotated-figure`'s callout) or for a function's
curve (`function-graph`).

## Input

```json
{
  "preset": "vectors",
  "points": [
    { "name": "A", "at": [-6, -6] },
    { "name": "B", "at": [-2, -2] }
  ],
  "vectors": [
    { "name": "F1", "components": [6, 0] },
    { "name": "F2", "components": [0, 5] },
    { "name": "AB", "from": "A", "to": "B" },
    { "name": "R", "sum": ["F1", "F2"] }
  ]
}
```

- **`points`** — named points, `{ "name": "A", "at": [x, y] }`, for a vector
  stated `from`/`to`.
- **`vectors`** — each item is exactly one of the shapes below. `locale`
  (default `"pt-BR"`) and `title` are top-level, alongside `points`.

### Typed — a vector the author states

- **`{ "name": "u", "components": [x, y] }`** — tail at the origin by
  default, or at `"at": [x, y]`.
- **`{ "name": "AB", "from": "A", "to": "B" }`** — from one named point to
  another.
- **`{ "name": "w", "magnitude": 5, "angle": "37°" }`** — `angle` is degrees,
  as a number or a string (`"37°"`, `37`, and a pt-BR comma are all read).

### Derived — never typed, always computed from vectors already named

- **`{ "name": "s", "sum": ["u", "v", ...] }`** — component-wise addition.
  `"construction": "head-to-tail"` adds dashed guides chaining each addend
  from where the last one ended; `"construction": "parallelogram"` (exactly
  two addends) adds the two translated copies that complete the
  parallelogram. Neither construction changes the resultant; both are guides
  only.
- **`{ "name": "d", "difference": ["u", "v"] }`** — `u − v`, component-wise.
- **`{ "name": "m", "scale": "u", "factor": -2 }`** — a scalar multiple.
  `factor` must not be zero.
- **`{ "decompose": "u" }`** — dashed guides showing `u`'s x and y
  components, each labelled with its own value. Draws no new vector.
- **`{ "projection": { "of": "u", "onto": "v" } }`** — the vector projection
  of `u` onto `v`, drawn with the perpendicular from `u`'s head to the foot
  and a right-angle mark there. `name` is optional (default
  `proj_v(u)`); refused if `v` is the zero vector.
- **`{ "angleBetween": ["u", "v"] }`** — the angle between two vectors,
  drawn as an arc at the origin (vectors are compared by direction alone,
  regardless of where each is drawn) with its computed value printed beside
  it. `name` is optional, used only as an id.

Every typed and most derived items accept an optional `label` to override
the printed name — refused if it types a coordinate pair by hand (the same
rule `function-graph` and `sign-chart` apply: compute it, do not type it).

## What is drawn

One gridded plane: a `Frame` named `"plane"` with a `grid`, so the lattice,
the axes and their numbers are the frame's own derived geometry
(`docs/decisions/0019-derived-geometry-and-annotation.md`), never redrawn by
hand. The range is derived from every point the figure touches — every
vector's tail and head, every construction guide's corner, the projection's
foot — padded and rounded to a plane wide enough to hold them, with the
origin always in view. The lattice steps by whole numbers (1, 2, 5, ...), and
its tick numbers are written in the figure's locale — "−4", "2,5" — with one
"0" at the origin's corner (ADR 0034).

Every arrow's endpoints are stated **in the frame**
(`{"frame": "plane", x, y}`), not pre-resolved to canvas pixels, so a
straight run whose ends share the frame keeps its scale through resolution
as `Connector.measuredIn` (ADR 0028). Each vector carries two labels beside
its own shaft: its name, and — printed as a decimal to hundredths, not the
exact-root form below — its magnitude, so `length-matches-its-label` can
check that number against the arrow's own length in frame units. Every label
is placed only after all the ink is drawn, and only beside its own arrow,
nearer that arrow than any other; when no such spot exists it stays on its
own shaft and the checks report it rather than the label drifting to
wherever there is room. An angle between two vectors prints its value to
hundredths (`57,53°`) just outside its arc.

A caption panel below the plane lists one reading per named or computed
quantity — `u = (3; 1), |u| = √10`, `s = u + v = (4; 5), |s| = √41`,
`ângulo(u, v) ≈ 57,53°` — in the exact-root, pt-BR form a reader would write
by hand: roots simplified (`√20` is `2√5`), a rational radicand rationalised
(`7√26/13`), and a name that already is its derivation (`u+v`, `AB`) not
repeated (`u+v = (5; 4)`, never `u+v = u + v = (5; 4)`).

## What is not covered

- Vectors in R³, or in a space with a physical unit attached (`N`, `m/s`) —
  a `Frame.unit` could be added, but nothing here names one yet.
- A vector's own tail feeding into a derived operation: `sum`, `difference`,
  `scale`, `projection` and `angleBetween` all work on **components** (the
  free-vector reading), so a derived result is always drawn from the origin
  regardless of where its operands were drawn. Projecting or summing two
  `from`/`to` vectors that are not both anchored at the origin still uses
  only their components.
- Non-right angles between more than two vectors, or an angle stated between
  vectors that do not share components computed the same way.
