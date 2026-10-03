# 0049 — Solids of revolution: the outline is the envelope, the volume is the integral

## Status

Accepted. Implemented in `src/presets/revolution/`. Not yet registered: see
`src/presets/revolution/INTEGRATION.md`.

## The need

Phase 4 of `docs/plans/PLAN-COVERAGE.md` asks for "arbitrary-profile solids of
revolution … volumes". This is the Cálculo 2 exercise "volume de sólido de
revolução": a region under y = f(x), or between two curves, turned about an
axis, with its volume by discs, washers or shells. The textbook figure has
three parts:

- the solid, with one slice highlighted;
- the plane region, with its representative rectangle;
- the integral.

Every part is fixed by the expressions and the axis. Each is exactly what
goes wrong when it is drawn or typed by hand:

- an outline sketched as the curve and its mirror;
- a hidden half guessed;
- "V = 8π" typed beside an integral that says something else.

`solid` (ADR 0046) covers the cylinder, cone and sphere from their
dimensions. It has no profile, no axis other than z, and no integral.

## The decision

### Input

The input gives a `region`, an `axis` and, optionally, `method`, `slice`,
`sections`, `plane` and `camera`:

- **`region`**: `{of, from, to}` (between f and the x axis), or
  `{between: [f, g], from?, to?}`. Without bounds, the region runs between
  the curves' outermost intersections.
- **`axis`**: `"x"`, `"y"`, `{y: c}` or `{x: c}`.

The method follows from the axis, because the region is stated in x:

- about a horizontal line, discs, or washers when the region leaves a hole;
- about a vertical line, shells.

A number is typed only in three places: the bounds, the axis's c and the
slice's position.

### The model

The region lies in a plane through the axis. Each boundary piece of the
region is a profile u ↦ (s(u), ρ(u)): along the axis, and the distance from
it. The pieces are the two curves and the two side segments. Revolving a
piece sweeps

X(u, θ) = O + s·A + ρ·(cos θ·P + sin θ·Q),

where A is the axis, P points toward the region's side, and Q = A × P.

### The silhouette is computed, not sketched

The surface normal is ρ'·A − s'·e(θ). The outline is where that normal is
perpendicular to the camera's `toward`:

- let α, β, γ be the components of `toward` along P, Q and A;
- the condition is s'·(α cos θ + β sin θ) = ρ'·γ;
- so θ = φ ± acos(ρ'γ / (s'R)), with R cos(θ − φ) = α cos θ + β sin θ;
- this has a solution only where that ratio is within ±1.

Each run of u where a solution exists gives two branches. Where a run ends
inside a piece, the end is bisected to |k| = 1, and the two branches meet
there. This is the envelope of the projected cross-section ellipses. The
test checks both facts at every sampled silhouette point:

- the point lies on its cross-section's ellipse (from `projectCircle`);
- the outline and the ellipse share the same page tangent there.

It closes the nose of √x's paraboloid, and it draws the paraboloid cavity
inside the x/x² cone as the two dashed curves the textbook shows.

**The meridian curve is not drawn beside it.** Any camera that shows a
cross-section as an ellipse (γ ≠ 0) separates the true outline from the
meridian where ρ' ≠ 0. For √x at the default camera the gap is 5–7 px.
Drawing both gives a double line. Drawing the meridian alone as the outline
is the textbook's approximation. The figure draws what is seen: the
envelope. The generating region is drawn in the plane view.

### Visibility is a ray against the solid itself

A point is hidden when the ray from it toward the reader passes strictly
inside the solid. Membership is exact and cheap: map the 3D point back to
(s, ρ), then to (x, y), and test lo(x) < y < hi(x).

This one rule settles every case with no per-case logic:

- rims and caps;
- the washer's inner surface and the hole of √x about y = −1, both dashed;
- the far half of an end rim;
- the axis inside the solid, also dashed.

ADR 0046's per-face rule cannot do this, because it holds only for convex
bodies. A lone grazing sample that disagrees with both neighbours is
smoothed as noise.

**The slice is an object in a transparent solid.** It is not occluded, as
ADR 0046 draws an inscribed solid whole. Its own back rim uses the convex
rule of a cylinder, and its outline generators come from
`tangentParamsParallelTo`.

### The fill

The solid's tint is the union of every cross-section's projected disc. Its
outline is extracted by `contour.ts` (marching squares on the maximum of
the ellipses' quadratic forms). It is one closed mark whose outline
coincides with the silhouette. It is not a hand-assembled hull.

### The volume, and the method that checks it

The printed volume is `numeric.integrate` of:

- π∫(R² − r²) dx, with R, r = max, min(|hi − c|, |lo − c|), about y = c;
- 2π∫|x − c|(hi − lo) dx about x = c.

It is printed exact when it snaps:

- first through `snapExact`;
- then as a rational multiple of π with denominator up to 64, since
  2π/15 is past `snapExact`'s 12;
- otherwise after "≈".

`volumeInY` computes the other method independently. It slices the region
along y, with the cross-section at each height found by grid and bisection
(`levelSet`):

- shells 2π∫|y − c|·L(y) dy about a horizontal axis;
- washers π∫Σ(ρ₂² − ρ₁²) dy about a vertical one.

No formula is shared with `volumeInX`, and the tests hold the two equal to
1e-6 on six solids.

The panel writes the integral from the expressions: `π∫₀⁴ (√x)² dx = 8π ≈
25,133`, and `2π∫₀¹ x(x − x²) dx = π/6 ≈ 0,524`. The limits are sub- and
superscripted when they are whole numbers, and written out otherwise.

### Labels, colours, order

- **Colour is fixed per object:**
  - solid: ink, with its tint also used for the region in the plane view;
  - slice, rectangle and their measures: accent;
  - axis of revolution: blue, in both views.
- **Measure labels** are the accent darkened (#7A2807), so they keep 4.5:1
  on the slice's tint.
- **Every label declares what it names** (ADR 0035):
  - a measure `annotates` its segment, stated in a ruler frame whose unit
    is the true 3D length along it (ADR 0046). So a numeric R such as
    "R(x) = 2" is measured, and a symbolic one names the run and claims
    no number;
  - curve names annotate their curve;
  - axis names are free-standing.
- **Candidate positions.** A radius is tried at six angles on the slice's
  face, and each position with the full text first ("R(x) = √x"), then
  the symbol alone.
- **No honest spot means no label.** If no candidate has a spot nearer its
  own run than any other ink and clear of every line by 3 px, that view
  drops the run and its label. The other view and the panel still carry
  the measure.

## What was refused

- **Discs or washers about a vertical axis, and shells about a horizontal
  one.** Both slice along y, and would need x as a function of y. Here
  that means an inverse the expression does not give. A symbolic inverse
  is a CAS, which ADR 0027 refuses. A numeric one would print a formula
  nobody typed. The volume is the same either way, and the refusal says
  so. The other method is still computed, as the tests' independent check.
- **A region across its axis, curves that cross inside the interval, and a
  pole.** Each is refused naming the x (`signParts`, `criticalPoints`).
  The swept "solid" would not be what the integral computes.
- **Occluding the slice by the solid.** In an opaque world the slice
  inside is invisible. The textbook ghosts the solid, and so does this
  preset.
- **Leader lines.** As in ADR 0036, a leader would be the nearest mark to
  its own label.
- **General hidden-line removal.** Only this solid occludes, and only its
  own lines.

## The cost

- **Ray-marched visibility has a step.** The step is size/320, finer near
  the start. A wall thinner than about a step, met at a grazing angle,
  can be missed. The thin wall near the mouth of the x/x² washer is
  resolved (tested by eye).
- **The outline differs from the meridian by design.** A reader comparing
  with a hand-drawn textbook figure sees the outline sit a few pixels off
  where "the curve" would be. That is the true outline.
- **Labels can go missing from one view.** In the x/x² washer the annulus
  is too thin, and too crossed by the cavity's dashed silhouettes, to hold
  "R" or "r" honestly. So the 3D view shows the washer with its hole and
  `dx`, and the plane view carries `R` and `r(x) = x²`. For the shell,
  `h` lives in the plane view only.
- **Flat solids look flat.** The x − x² dome is 0.25 high on a radius of
  1, and it is drawn in true shape. No axis is exaggerated, because a
  stretched solid would misstate the volume the figure is about.
- **Default slice at 62% of the interval.** It is not placed by any rule of
  legibility. An author with a crowded figure moves it with `slice.at`.
- **Expansion costs about 0.4–1.1 s**, mostly the ray casts and the
  marching-squares fill.
