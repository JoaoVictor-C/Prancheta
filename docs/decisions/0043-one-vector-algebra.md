# 0043 — One vector algebra, generic over 2D and 3D

## Status

Accepted.

## The need

Phase 3 (`docs/PLAN-COVERAGE.md`) needs two consumers next: a ruler-and-compass
2D construction kernel (intersections, perpendiculars, loci — for conics and
school-solid pictograms) and a R³ projection for Geometria Analítica (lines,
planes, their relative positions, for school solids' silhouettes). Both need
exactly the same underlying arithmetic — add, scale, dot, a length, the angle
between two directions, a projection of one vector onto another — differing
only in whether a tuple has two components or three.

ADR 0032 already wrote a vector algebra once, inline in the `vectors` preset,
for R² alone. Writing a second copy for R³ would not just duplicate code; it
would duplicate the exact set of rounding and degeneracy decisions (how close
to zero is "zero", how a near-parallel pair is told from a truly parallel
one) that a maintainer would then have to keep in sync by hand across two
files that do not import each other. The two existing places this project
already made that mistake and paid for it are named in `PLAN-COVERAGE.md`'s
"Known residue": the numeric kit and `contour.ts` each carry their own
bisection, independently.

## The decision

**One module, `src/geometry/vec.ts`, generic over `Vec2 | Vec3`.** The shared
algebra (`add`, `sub`, `scale`, `dot`, `length`, `normalize`, `distance`,
`lerp`, `angleBetween`, `projection`, `approxEqual`) is written once as
functions generic over a type parameter `V extends Vec2 | Vec3`, so TypeScript
still refuses to add a `Vec2` to a `Vec3` at compile time, but the
IMPLEMENTATION — and every rounding decision inside it — exists in exactly one
place. `cross2` (scalar), `cross3` (vector) and `perpendicular2` are the three
functions that are genuinely dimension-specific, because "the cross product"
and "perpendicular to one vector" mean different things (or, for
`perpendicular2`, nothing at all) in the two dimensions; everything else is
shared.

On top of that shared algebra sit two independent layers that never call each
other: a 2D construction kernel (`Line2`, `Circle2`, and the intersections,
perpendiculars, bisectors and circumcircle built from them) and a 3D layer
(`Line3`, `Plane3`, and their intersections, distances, angles and relative
position). Both future consumers import only the layer they need.

**The tolerance policy is scale-invariant, stated once, and always a
parameter.** Two different shapes of comparison appear throughout:

- **Direction comparisons** — is this pair of lines parallel? are three
  points collinear? are two lines coplanar? — compare the SINE of the angle
  between the directions involved (`|cross| / (|a|·|b|)`) against
  `tolerance` directly. That ratio is dimensionless: it means the same thing
  whether the construction is drawn at plane-unit scale or at the scale of a
  ramp fifty metres long, which an absolute cross-product threshold would
  not.
- **Incidence comparisons** — is this point ON that line/plane? are two
  points the same point? — compare a distance against
  `tolerance · max(1, |coordinates involved|)`, the same "relative unless the
  numbers are small" shape `locale/format.ts`'s `snapExact` already uses.

`DEFAULT_TOLERANCE = 1e-9` is the default everywhere, tight enough for values
computed by exact arithmetic or by `math/numeric.ts` at its own default
precision. Every function that can hit a degenerate case takes `tolerance` as
an explicit last argument, never a hidden module constant, because a caller
classifying a construction built from a problem statement's rounded input
(`"37°"`, already rounded before it got here) needs to be able to loosen it
without reaching into the module.

**Degenerate cases are named outcomes, never `NaN`.** Every function that can
degenerate either throws `GeometryError` (a zero vector normalized, projected
onto, or turned into a direction; coincident points asked for the line
through them; three collinear points asked for a circle or a plane) or
returns a tagged union naming the geometric fact instead of a point full of
non-numbers: `{ kind: "parallel" | "coincident" | "point", ... }` for two 2D
lines, `{ kind: "none" | "tangent" | "two", ... }` for a line/circle or
circle/circle intersection, `{ kind: "parallel" | "contained" | "point" }`
for a line against a plane, `{ kind: "parallel" | "coincident" | "line" }`
for two planes, and `{ kind: "coincidentes" | "paralelas" | "concorrentes" |
"reversas" }` for two 3D lines — named in Portuguese because that is the
vocabulary the Geometria Analítica exercises this feeds already use, and a
translated label would stop matching the exercise text a sheet quotes
verbatim. A caller that forgets to check `kind` gets a type error from the
union, not a figure that silently draws a point at `(NaN, NaN)`.

**Multi-point results are ordered by one fixed, documented, arbitrary rule.**
Where a construction gives two points (a line through a circle, two circles
meeting), the pair is sorted lexicographically — by `x`, then by `y` — rather
than by any geometric meaning like "clockwise from the centre-to-centre
axis". A geometrically meaningful order is possible but adds its own
degenerate case (what orders two points on a vertical diameter?) for no
consumer that needs it yet; the flat rule is total, needs no extra case, and
is stated once so a test and a caller never have to guess which point a
result calls "first".

**No new snapping.** `locale/format.ts` already has `snapExact`/`writeExact`
(ADR 0040) for turning a computed number into what a reader sees. `vec.ts`
adds `snapVec`/`writeVec` as thin wrappers — one `snapExact` call per
coordinate, joined the way a coordinate pair is already joined — rather than
a second implementation of "is this number secretly √2".

## What was refused

**A `Vec4` or a fully N-dimensional generic.** Nothing in this project's
plan needs a fourth dimension, and a truly generic `number[]`-based algebra
would trade away the one thing tuples buy here: TypeScript refusing at
compile time to add a `Vec2` to a `Vec3`. Two fixed arities, one shared
implementation, is the actual requirement — not dimension-genericity for its
own sake.

**Vector classes with methods (`v.add(w)`).** Every other coordinate type in
this project (`ir/types.ts`'s `Point`, `paths.ts`'s path commands) is a plain
object or tuple, not a class — a construction is data an author or a
computation produced, not an object with behaviour. Free functions over
tuples match that, and match `rotate.ts`'s `Point`-based helpers already in
this directory.

**A single geometric convention for the angle bisector of two lines.**
Two intersecting undirected lines have two bisectors, perpendicular to each
other, of the four angles they form; there is no "the" bisector without more
context (which of the four angles a construction actually wants). Rather
than guess, `angleBisectors2` returns both, tagged as a pair, and leaves
picking one to the caller who knows which angle it drew.

**Solving the skew-vs-intersecting question by distance-between-lines alone.**
An earlier draft classified `concorrentes` vs `reversas` by whether the
minimum distance between the two lines was near zero. That conflates
"intersecting" with "the coordinates happen to be nearby", and gives the
wrong classification for two lines that pass close to each other but do not
meet. The scalar triple product test (`relativePosition3`'s doc comment)
answers the actual question — are the four points/directions coplanar? —
directly.

## The cost

**`angleBetweenLines3`, `angleBetweenPlanes3` always report the ACUTE angle.**
A line and a plane are undirected, so "the" angle between two lines or two
planes is ambiguous by up to a sign; this module always folds the answer into
`[0, π/2]`. A construction that specifically needs the obtuse angle (rare —
most Geometria Analítica exercises ask for "the angle between", which means
the acute one) computes `π` minus the result itself.

**The lexicographic point order can put a construction's "natural" first
point second.** A circle-circle intersection whose two points differ mainly
in `y` (a nearly-vertical chord) may return them in an order that looks
backwards to a diagram drawn top-to-bottom; a caller building a labelled
figure decides its own presentation order from the returned points rather
than trusting index `0` to be the visually first one.

**Every degenerate check costs one extra `length`/`cross` per call.** Cheap
at the sizes these constructions run at (single-digit vector counts per
figure, never a hot loop), but a caller building thousands of these per
frame — not a use case this project has — would want a batched, allocation-
free variant this module does not provide.
