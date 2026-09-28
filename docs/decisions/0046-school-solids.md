# 0046 — School solids: dimensions once, visibility per solid, lengths measured true

## Status

Accepted. Implemented in `src/presets/solid/`. Not yet registered: see
`src/presets/solid/INTEGRATION.md`.

## The need

Phase 3 (`docs/PLAN-COVERAGE.md`) asks for convex polyhedra and right
cylinders, cones and spheres, drawn with analytic silhouettes. Hidden edges
are to be dashed by visibility, and composites are to be transparent, with
visibility decided per solid only. It refuses general hidden-line removal
and inter-solid occlusion.

These are the figures of geometria espacial in ENEM and ensino médio: the
cube and its diagonal, the paralelepípedo with its three dimensions, the
pyramid with its height and apótema, the cylinder, the cone and its
geratriz, the sphere, and one solid inside another. Every number such a
figure prints is fixed by the dimensions. It is exactly the kind of number
that goes wrong when it is typed a second time.

[ADR 0045](0045-space-and-projection.md) left the camera ready for this.
`projectCircle`, `sphereOutline`, `tangentParamsParallelTo` and
`tangentParamsFrom` were written for this preset. It also left one open
question: a sphere drawn under the cavalier camera outlines as an ellipse.

## The decision

### Input: dimensions, typed once

A solid is a `kind`, a base centre `at` (a sphere's centre), and its
dimensions:

| kind | dimensions |
| --- | --- |
| cube | edge |
| box | width, depth, height |
| prism | sides, edge, height |
| pyramid | sides, edge, and height or apótema |
| cylinder | radius, height |
| cone | radius, and height or geratriz |
| sphere | radius |

Solids stand upright, with their axis along z, as the textbook draws them.
A derived solid types no dimension at all:

- a sphere `inscribedIn` a cube (r = a/2) or an equilateral cylinder;
- a sphere that `circumscribes` a cube or box (r = D/2);
- a cone `inscribedIn` a cylinder (same base, same height).

A typed dimension on a derived solid is refused.

**What is computed:**

- **Every vertex.** A regular n-gon has its first edge facing the reader,
  so A is front-left and B front-right, the textbook's lettering.
- **Every edge**, read off the faces, and every outward normal.
- **Every rim ellipse**, via `projectCircle`, and every silhouette
  generator, via `tangentParamsParallelTo` for a cylinder and
  `tangentParamsFrom` the apex image for a cone.
- **Every measure.** The diagonal is a√3 or √(a² + b² + c²). The apothem m
  is exact for n = 3, 4, 6. The apótema is √(h² + m²), or the height
  √(g² − m²) when the apótema is given. The geratriz is √(r² + h²). Every
  base area, volume and total area is computed too.

These are carried **symbolically** (`exact.ts`): a sum of c·√r terms, all
of them times π or none of them. `snapExact` reaches √n and kπ/q, but not
the forms these solids produce, such as `48 + 12√3`, `4π + 4√5π` or
`16π/3`. A value that leaves these forms is carried numerically, printed to
hundredths and flagged `≈`: a pentagon's apothem, and everything built on
it.

**What is typed:** the dimensions, the point names (refused if they contain
a digit), `show` (which construction lines to draw), `readings` and `unit`.

### Visibility: per solid, exact for a convex body

A point on the surface of a convex solid is seen exactly when a surface
through it faces the reader. The preset uses no other rule:

- **A polyhedron edge** is visible when either of its two faces
  `facesViewer`, and hidden (dashed, thinner, same colour) when neither
  does. Under the default cavalier camera, a cube hides exactly the three
  edges at D, its back-bottom-left vertex (tested). It does the same under
  every other camera tried.
- **A rim point** is visible when its cap faces the reader, or when the
  lateral surface at that point does. The lateral normal is radial on a
  cylinder and h·radial + r·ẑ on a cone. Each rim is cut where visibility
  can change, and each piece is classified at its midpoint:
  - a cylinder's rims are cut at its two silhouette parameters;
  - a cone's base rim is cut at its two tangent parameters from the apex;
  - a sphere's equator is cut at the ends of its front half.

  The tests check that these cuts are exactly where the lateral normal is
  perpendicular to `toward`. So the silhouette generators touch their
  ellipses at the same points where dashing begins.
- **A construction line** is dashed when it lies inside the solid, or on a
  face that is turned away. That covers a height, a space diagonal, a
  sphere's radius, a cone's base radius, and a base apothem on a hidden
  base. It is drawn solid on a face the reader sees: a pyramid's apótema, a
  cylinder's top radius. It is drawn in the accent colour either way, so a
  dashed construction line never reads as a hidden edge.
- **Composites are transparent.** Each solid dashes only its own hidden
  edges, and no solid is tested against another. Fills are translucent and
  painted before every line, so an inner solid shows through the outer one.
  A rim two solids share (a cone standing on a cylinder's base) is drawn
  once, by the solid listed first, so one curve never carries two colours.

### The sphere and the camera

**The default camera depends on what is drawn.**

- **Only polyhedra: cavalier.** This is the view the textbook uses: the
  front face in true shape, depth receding at 45° and halved.
- **Only round solids: orthographic, azimuth 0°, elevation 20°.** A
  horizontal rim becomes a level ellipse, and a sphere's outline is a true
  circle.
- **Round solids mixed with polyhedra: orthographic, azimuth 30°,
  elevation 20°.** Round rims stay level ellipses, the sphere stays a
  circle, and a cube still shows three faces.

Under the cavalier camera, a sphere's outline is an ellipse, which
geometry makes right and which no textbook draws (ADR 0045, "The cost").
Its rims also tilt by about 7°. An orthographic camera avoids both,
because every horizontal circle keeps its horizontal diameter at full
length. An author can still name any camera. Under cavalier the sphere is
then drawn as the correct ellipse, not as a faked circle.

**One quirk of the cavalier camera is handled explicitly.** With a ratio of
½ at 45°, a cube's vertices A, F and G project onto one page line, so the
diagonal AG would run along the edge FG. The preset draws the one of the
four space diagonals whose image keeps farthest from every other vertex
(`clearestDiagonal`). For the default cube that is DF, with its face
diagonal DB and the right angle at B.

### Printed lengths are measured in true 3D length

A projected segment is not its true length. So a length drawn on the page
is stated in its own **frame**:

- the frame's origin is the run's start, and its x axis runs along the
  run's page direction;
- its unit (`xUnit`) is the number of pixels that **one true unit along
  that run's 3D direction** draws: `unit × |projectDirection(camera, d̂)|`.

Under this unit, `length-matches-its-label` (ADR 0028, which now reads √
forms) measures the drawn run in true 3D length. It compares that length
with the printed value. The three quantities involved come from three
places:

- the run's ends are projected vertices;
- the ruler comes from the camera's foreshortening along the run's
  direction;
- the label comes from the formula.

A wrong formula fails the check, and so does a run drawn to the wrong
vertex. A test lengthens the slant 2% and gets a failure against
`g = 2√5`. Every length on every fixture is measured and passes. None is
reported not-applicable.

**Edges and silhouettes that carry a measure are those same runs.** The box's
three dimensions, the cube's edge `a`, the prism's `ℓ` and `h`, the
cylinder's `h` and the cone's `g` are drawn once, with the ruler attached,
and never as a second line over the first.

**When a label has no honest spot.** Sometimes no spot is nearer the
labelled run than any other ink. An example is `g = 13` on a pyramid's
narrow right face. Then the drawing prints the symbol alone (`g`), which
claims no length, and the value moves to the panel. A second layout pass
makes room for that line. The panel line is skipped when a `measures`
reading already prints that symbol.

### The readings panel

It prints the formula, then the exact value:

- `V = πr²h = 12π`
- `A = 2Ab + 6ℓh = 48 + 12√3 (área total)`
- `D = a√3 = 2√3`
- `Esfera: r = a/2 = 2`

A composite prefixes each line with the solid's name.

### Drawing order and labels

The drawing order is:

1. fills, shaded per face against a light up and to the left;
2. hidden strokes;
3. visible strokes;
4. construction lines;
5. right-angle marks;
6. centre dots, last.

Labels have no backing. They are placed with the space preset's
`SpacePlacer`, reused and not copied:

- a vertex name uses `annotatesPlace` and prefers the side away from its
  solid's centre;
- a measure label `annotates` its run and prefers the outer side.

Fill outlines are given to the placer as rivals. `annotation-nearest-its-owner`
measures a label against them, and the first render failed that check
because the placer could not see them.

## What was refused

- **Inter-solid occlusion and general hidden-line removal**, as the plan
  says. A sphere inside a cube is drawn whole through the cube's front
  face, and the cube's hidden edges stay dashed behind the sphere. In a
  transparent composite that is the textbook drawing. Occluding one solid
  by another would hide the very inscribed solid the exercise is about.
- **Tilted solids.** Every axis is z. No school exercise rotates a cylinder,
  and a free orientation would be another degree of freedom with no check
  behind it.
- **A perspective camera**, for ADR 0045's reasons.
- **Lengths in the panel only.** ADR 0045 sent every space length to the
  panel because a projected segment "could only be reported unmeasurable".
  The per-run ruler answers that for solids. Each ruler is honest because
  its unit is the camera's own foreshortening along a known 3D direction.
  It is not fitted to the label.
- **Guessing an inscription.** A sphere is not inscribed in a
  non-equilateral cylinder or in a box, and a cone is not inscribed in a
  prism. Each is refused by name.
- **Hard-coding the cube's diagonal as AG.** In the cavalier view AG runs
  along an edge.

## The cost

- **Integer labels are checked to ±½.** `length-matches-its-label` forgives
  half the last printed digit. A height labelled `h = 4` and drawn 10% long
  (4.4) passes. Root labels (`2√3`) are checked exactly.
- **A plain fraction is not measured.** The check reads `h = 5/3` as 5 in
  the unit "/3". Such a label names its run's midpoint (`annotatesPlace`),
  so its length goes unchecked. Integer and decimal dimensions, which are
  what exercises use, are unaffected.
- **Non-school bases are inexact.** A pentagonal or octagonal base's apothem
  and area print rounded, with `≈`. Their labels do not parse as lengths
  and are not measured.
- **Fallback labels move a value off the drawing.** When `g = 13` has no
  honest spot, the figure says `g` and the panel says `13`. That is a real
  loss of directness, but the other choice is a label that reads as naming
  the edge beside it.
- **The default camera changes with the content.** A cube drawn alone is
  cavalier. Put a sphere in it and it becomes orthographic. The two figures
  do not match. An author who wants them to match names the camera.
- **Placement is only as good as the space around a run.** Labels are never
  set on a line, but in a crowded figure the honest spot can be a less
  natural one: the box's `2 cm` sits inside the front face, not outside
  the edge. Each fixture's numbers were chosen so that its figure reads
  cleanly. The classic pyramid is ℓ = 10, h = 12, g = 13, not the squat
  ℓ = 6, h = 4, whose right face is too narrow to label.
