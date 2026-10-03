# Prancheta

[![CI](https://github.com/JoaoVictor-C/Prancheta/actions/workflows/ci.yml/badge.svg)](https://github.com/JoaoVictor-C/Prancheta/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*Prancheta* — Portuguese for a drafting board: the flat surface a draftsman pins paper to, with a parallel rule and set squares, to draw something that has to be *correct*, not merely pretty.

## What this is

A toolkit that makes a coding agent competent at producing **complex visual representations**: schematics, technical figures, diagrams, mind maps, maps, annotated illustrations — still, or animated.

It renders a figure specification to SVG and PNG, **measures what it drew**, reports every geometric defect it found, and repairs what it can — emitting a manifest that says exactly what was drawn, what was changed, and what could not be fixed.

## The problem

An agent asked for a figure today does one of three things, and all three fail differently:

1. **Calls an image model.** Diffusion models draw plausible-looking pixels, not correct structure. Labels come out garbled, arrows point the wrong way, counts are wrong. Fine for illustration, disqualifying for a schematic.
2. **Emits Mermaid.** Safe, renders everywhere, and collapses into the same box-and-arrow flowchart regardless of what was asked. Anything that isn't a graph — a cross-section, an annotated timeline, a map with callouts, a figure with a real coordinate system — has nowhere to go.
3. **Writes raw SVG by hand.** Maximum expressive range, no layout engine. The agent is doing arithmetic on coordinates in its head and cannot see the result: text overflows its box, labels collide, arrows cross shapes.

The common failure is not artistic. It is that **the agent never looks at what it drew**, and has no vocabulary between "flowchart" and "raw coordinates."

## The bet

Correct figures come from **code, not pixels**, plus a **render–inspect–repair loop** that closes on an actual rasterized image, plus a **repertoire** of figure kinds broader than the graph.

## Gallery

Seven generator experiments from [experiments/generators](experiments/generators) and one figure of the pipeline itself, rendered through the same pipeline as every other figure here. Each generator is a program you run once; it writes a spec, and `render` draws it. **Every plate below passes its own checks** — that is the only claim being made for them, and it is not the same as being any good.

### Fields

Computed mark fields. All five are built from discrete separated marks on a lattice, because `boxes-do-not-overlap` leaves no other way to draw a curve that crosses itself.

|  |  |
|---|---|
| ![Chladni plate nodal patterns](docs/gallery/chladni.png) | ![Logistic map and Mandelbrot conjugacy](docs/gallery/conjugacy.png) |
| Four vibration modes of a square plate — sand settling along the nodal curves of `cos(nπx)cos(mπy) − cos(mπx)cos(nπy)`. | The logistic map's bifurcation cascade and the Mandelbrot set's real axis, shown as the same dynamical system in two coordinates. |
| ![The argument principle as a direction field](docs/gallery/argument.png) | ![Interference from three point sources](docs/gallery/stillwater.png) |
| The phase field of `(z²−1)/(z²+1)`: 6,000 strokes each **turned to** `arg f` and lit tail-to-head, with three closed walks whose accumulated argument lands on `+2π`, `−2π` and `0`. Rotation here is the data, not decoration — the plate could not have been drawn before blocks could turn. | Three stones dropped together. Mark size carries `\|ψ\|` and hue carries its sign, so the nodal curves draw themselves by being the only places the figure declines to put ink. λ is set against the lattice pitch rather than chosen: below about ten samples per wavelength the lattice beats against the wave and the fringes turn to speckle. |
| ![Newton basins for the fifth roots of unity](docs/gallery/newton.png) |  |
| Newton's method for `z⁵ = 1`, 61,143 starting points coloured by the root each one reaches. The strip is a single descent into one boundary point — found by bisection between two basins, not by eye — at ×1, ×40 and ×1600. It looks the same at every scale because the boundary is a Wada set: every point of it borders all five basins at once. |  |

### Figures

Coordinate frames, free marks, connectors and angle marks — the things a mark field never touches.

|  |  |
|---|---|
| ![How an agent uses Prancheta](docs/gallery/how-the-agent-uses-prancheta.png) | ![The geometry of a rainbow](docs/gallery/rainbow.png) |
| The pipeline drawing itself: what an agent does (1–5) and what runs inside (6–15), with the two refusal paths in orange. Wrapped into a square by ELK rather than laid out as one 4004px row — the spec is [beside it](docs/gallery/how-the-agent-uses-prancheta.json). | A rainbow in three panels: one drop, the deviation minimum that makes a bow, and the sky that follows. The local normal at each refraction point is a frame **aimed at** the drop's centre, so no angle is typed twice, and every angle mark prints the value its own arc sweeps. The one relaxation it asks for is `allowCurvedConnectors`, which an angle mark cannot exist without. |
| ![Projectile from a cliff](docs/gallery/projectile.png) |  |
| An exercise figure. Markers sit at equal **time** intervals, so constant horizontal spacing against changing vertical spacing says the two axes are independent without a sentence saying it. The path is integrated from `v₀`, `θ` and `g`; every unknown the question asks for is marked `?`, and none of them is answered. |  |

## Install

Needs **Node 22.18 or newer** — it runs the TypeScript directly, with no build step, so the runtime must strip types natively. Developed and tested on **Node 25**.

```bash
npm install && npx playwright install chromium
```

Chromium is a dependency, not a test convenience: the browser is the layout oracle, so nothing renders without it.

Python is optional, and only for the [figure modules](modules/README.md). Each module declares its own dependencies and several need none, so install them only if you want the modules:

```bash
python -m pip install -r modules/requirements.txt
```

## Quick start

```bash
npm run render fixtures/labelled-blocks/labelled-blocks.json
```

Writes `out/labelled-blocks.svg`, `.png` and `.manifest.json`, and prints one line per check. **Exit code is non-zero if a check failed**, so it works in a pipeline.

To see the repair loop work, render a figure whose sizes are wrong on purpose — first as authored, then repaired:

```bash
npm run render fixtures/ir/broken-boxes.json -- --no-repair -o out/authored
```

```bash
npm run render fixtures/ir/broken-boxes.json -- -o out/repaired
```

The second run prints what it changed and why, and the manifest records every edit. **Your spec is never modified**; repairs are applied to a copy, and `render()` returns the `effectiveSpec` that was actually drawn.

## How it works

```
spec → HTML mirror → Chromium lays out → measure boxes and text lines
     → checks → [repair → lay out again] → SVG → rasterise → manifest
```

**The browser is the layout oracle.** Text is measured in the same engine that will draw it — per character, grouped into lines, with the baseline found from a zero-height inline-block probe rather than guessed from font metrics. The HTML mirror exists only for measurement and is never exported.

That only holds while *the thing measured is the thing drawn*, which is why the mirror carries no effects, and why a whitespace bug that made a label measure narrower than it rendered was treated as a correctness failure rather than a cosmetic one.

**The PNG is rasterised from the exported SVG**, not from the mirror. If the SVG is wrong — a bad baseline, a missing glyph, an unsupported construct — the PNG shows it. Rasterising the mirror would prove nothing about the artefact anyone actually receives.

## What gets checked

Every check is deterministic and model-free. Most answer *is this figure malformed*. A narrower family answers *does this figure agree with itself* — a printed angle, length, area or share measured against the ink drawn for it — because a figure can be perfectly well formed and still assert something untrue (ADR 0019). The *didactic* checks hold a figure made to teach from to what it owes its reader (ADR 0024). The core checks live in [src/checks.ts](src/checks.ts); the two motion checks run over the *interior* of an animated transition ([src/anim/checks.ts](src/anim/checks.ts)); the module checks run on a figure module's foreign SVG.

The table is generated from [src/checks-catalogue.ts](src/checks-catalogue.ts), so a new check cannot ship without a line in it.

<!-- generated:checks -->
**Is the figure malformed?** (15)

| check | what it asks |
| --- | --- |
| `text-fits-box` | Does every line of a label sit inside its block's content box? |
| `label-within-shape` | Does a label sit inside the shape actually drawn, not just its bounding rectangle? |
| `text-clear-of-other-boxes` | Does a label overlap a block that is not its own? |
| `text-clear-of-ink` | Does a label sit on a line, curve, arc or arrow it does not belong to? |
| `backing-hides-no-ink` | Does a label's paper backing erase ink that carries meaning? |
| `boxes-do-not-overlap` | Do two boxes partially overlap? (Nesting is fine; partial overlap never is.) |
| `connector-clear-of-boxes` | Does a connector pass through a box it does not join? |
| `content-within-canvas` | Is everything inside the canvas? |
| `canvas-size-sane` | Is the canvas a size a figure can be (not 400 000 px tall)? |
| `effect-within-canvas` | Does an effect's ink stay on the canvas? |
| `contrast-sufficient` | Does every label clear WCAG AA against whatever it actually sits on? |
| `categorical-colours-distinguishable` | Do the colours in a shared `categoryGroup` stay distinct under deuteranopia and protanopia? |
| `tick-labels-do-not-collide` | Do a scale's tick labels overlap each other? |
| `constraints-satisfied` | Does every declared layout constraint (align, distribute, keepClear, sameSize, anchor) hold as laid out? |
| `declared-size-honoured` | Was every block drawn at the size it asked for? |

**Does every label sit by, and say, what it names?** (3)

| check | what it asks |
| --- | --- |
| `annotation-nearest-its-owner` | Is every label nearer the element it names than any other? |
| `label-nearest-its-place` | Is a label that names a place (where two lines meet) near that place? |
| `label-declares-what-it-names` | Does every label say what it names, or declare itself free-standing? |

**Does the figure agree with itself?** (5)

| check | what it asks |
| --- | --- |
| `sweep-matches-its-label` | Does an angle mark or a pie slice sweep the angle or share its label prints? |
| `length-matches-its-label` | Is a dimension line or a scaled arrow as long as its printed length? |
| `area-matches-its-label` | Does a shaded region have the area its label prints? |
| `arc-is-circular` | Are both ends of every arc the same distance from its centre? |
| `feature-on-its-curve` | Does every marker lie on what it claims (a root on its curve and on the x axis)? |

**What a figure made to teach from owes its reader** (3)

| check | what it asks |
| --- | --- |
| `axis-number-present` | Is every number an axis promised printed by its tick? |
| `series-distinguishable-without-colour` | Can every data series be told apart without colour? A legend does not count. |
| `curve-label-nearest-its-curve` | Is every curve label nearer the curve it names than any other curve? |

**Animation: over the interior of each transition** (2)

| check | what it asks |
| --- | --- |
| `boxes-do-not-overlap-during-transition` | Do two boxes collide at any instant between two states? |
| `connector-clear-of-boxes-during-transition` | Does a moving route sweep through a box it does not join? |

**Figure modules: foreign SVG, measured by the core** (7)

| check | what it asks |
| --- | --- |
| `module-ids-resolve` | Does every id a module declares exist in what it drew? |
| `module-geometry-agrees` | Does each declared box match the geometry measured in the browser? |
| `module-label-within-feature` | Does a label sit inside the filled feature it names? |
| `module-labels-do-not-collide` | Do a module's labels overlap each other? |
| `module-labels-clear-of-strokes` | Does a label sit on a drawn stroke? |
| `module-feature-on-its-stroke` | Does a feature declared to lie on a stroke lie on it, by measurement? |
| `module-contrast-sufficient` | Does every module label clear WCAG AA against the surfaces under it? |
<!-- /generated:checks -->

Each reports `pass`, `fail`, or **`not-applicable`** — a real third state, never a polite pass. A check that examined zero elements has verified nothing, and reporting that as a pass reads as coverage.

Failures carry structured overflow numbers, not just prose, because the repair engine has to act on them.

## Constraint toggles

Three of the refusals above block whole genres — a Venn diagram *is* partial overlap, a callout into a dense field *is* a line crossing boxes it does not join. Those three, and only those three, can be stood down per figure via `canvas.constraints`:

| toggle | stands down | reach for it when |
| --- | --- | --- |
| `allowOverlap` | `boxes-do-not-overlap` | Venn and Euler diagrams, circle packings, stacked annotations |
| `allowConnectorCrossing` | `connector-clear-of-boxes` | leader lines into a dense field, wiring that has to cross |
| `allowCurvedConnectors` | nothing — it *permits* `Connector.curve` | flowcharts, mind maps, org charts |

```json
{ "canvas": { "constraints": { "allowOverlap": true } } }
```

All default to `false`, so a spec that says nothing is checked exactly as it was before these existed.

**A relaxed check reports `not-applicable`, never `pass`** — and names the toggle that excused it. A pass claims the figure was examined and found sound; if a stood-down check said `pass`, a figure whose boxes genuinely do not collide and one that simply asked not to be looked at would produce identical manifests.

Curves come in three kinds — `arc` (bows by a fraction of its own chord, so it works with auto-routed endpoints), `bezier` (explicit control points, in scene coordinates), and `spline` (rounds a route's corners by `radius` and leaves its straight runs alone, which is what a graph edge needs). **A curve is checked as it is drawn:** it is flattened into the same polyline `connector-clear-of-boxes` walks, so it cannot bow through a box the check just cleared. Flattening is adaptive to a stated 0.05px bound — a tenth of the half-pixel every check tolerates — so a curve can never pass or fail on the strength of how it was sampled rather than where it goes.

A connector from a block back to itself is a **self-transition**, routed out of the top edge and back rather than curved, so a loop needs no toggle to exist.

See [docs/CONSTRAINTS.md](docs/CONSTRAINTS.md) for how to use them and [ADR 0010](docs/decisions/0010-constraint-toggles.md) for why these three and not the others.

## Repair

A verifier that can only *detect* is worth little. The repair loop grows a box that its label overflows, flips `wrap` when a node has hit its growth budget, and grows canvas padding when an effect's halo is clipped.

Two properties make it trustworthy, and both are structural rather than hoped for:

- **Monotone.** Every edit strictly increases one bounded quantity, or flips `wrap` from `none` to `normal`, which can happen at most once per node. A cycle would require some quantity to return to a previous value, so the loop cannot oscillate.
- **Bounded.** Growth is capped at a multiple of the node's *original* measured size. A node needing more is reported as `unrepaired` with the reason, rather than inflated without limit — a box four times the size the author asked for is not a repair, it is a different figure.

## Choosing before drawing

The failure this project exists to prevent is reaching for a flowchart because a flowchart is available. Ask first:

```bash
node src/cli.ts select --structure scene --idiom annotated
```

It answers with a preset, a composition of two, or *no preset fits — author raw IR*, and names the rules that decided. [docs/selection/SELECTION.md](docs/selection/SELECTION.md) is the hand-written reasoning and the part worth reading; [docs/selection/RULES.generated.md](docs/selection/RULES.generated.md) is the generated rule reference.

## The repertoire

<!-- generated:counts -->
**33 presets, 26 checks on every figure, 7 figure modules.**
<!-- /generated:counts -->

A **preset** takes the situation — an expression, a circuit's nodes, masses and an angle, a SMILES string's worth of data — and computes everything drawn from it, so a figure cannot disagree with its own numbers. Each lives in `src/presets/<id>/` with its `PRESET.md` beside the code and its fixtures in `fixtures/<id>/`. These tables are generated from [src/selection/vocabulary.ts](src/selection/vocabulary.ts).

<!-- generated:presets -->
**Diagrams**

| preset | what it is |
| --- | --- |
| [`labelled-blocks`](src/presets/labelled-blocks/PRESET.md) | Stacked labelled boxes; the plain case. |
| [`graph`](src/presets/graph/PRESET.md) | Nodes and edges, skeleton laid out by ELK. |
| [`mindmap`](src/presets/mindmap/PRESET.md) | A single-rooted tree radiating outward. |
| [`annotated-figure`](src/presets/annotated-figure/PRESET.md) | A shape or scene with callouts on leader lines. |

**Data, statistics and probability**

| preset | what it is |
| --- | --- |
| [`chart`](src/presets/chart/PRESET.md) | Bar charts: values with a scale, not a graph. |
| [`statistics`](src/presets/statistics/PRESET.md) | Histograms (Sturges or given classes, frequency table, polygon) and boxplots (quartiles by a stated method, 1,5·IQR whiskers, outliers, groups side by side) of raw data, with n, mean, median, mode, variance, standard deviation and IQR computed. |
| [`distribution`](src/presets/distribution/PRESET.md) | Normal, binomial and Poisson laws with an event shaded: the region's area is the printed probability (measured), boundaries with x and z, two-sided tails with α/2, the normal approximation with continuity correction, and the standardisation and arithmetic computed. |
| [`probability-tree`](src/presets/probability-tree/PRESET.md) | Probability trees from branch probabilities or an urn, in exact fractions: path products, an event's probability as a sum of highlighted paths, and Bayes conditionals computed from the leaves. |
| [`venn`](src/presets/venn/PRESET.md) | Venn diagrams of two or three sets in a universe: a set expression shaded by evaluating it on every region, survey data solved by inclusion–exclusion and printed in each region, and elements listed where they belong. |
| [`data-table`](src/presets/data-table/PRESET.md) | Tables of given data: a header row with units (and grouped headers), pt-BR numbers aligned on the decimal comma, real sub/superscripts, highlights and blanks to fill; derived columns and totals rows computed, hidden under answers: false. |
| [`pictogram`](src/presets/pictogram/PRESET.md) | Counts and shares as repeated icons -- filled icons computed from each value (a remainder fills the last icon by its fraction), outline slots for the whole -- and sequences of dot figures whose counts are the polygonal numbers, computed from the construction. |

**Functions and calculus**

| preset | what it is |
| --- | --- |
| [`function-graph`](src/presets/function-graph/PRESET.md) | Curves y = f(x) on a numbered plane, with tangents, secants and computed points. |
| [`sign-chart`](src/presets/sign-chart/PRESET.md) | The sign table of a function: where f, f′, f″ or a product's factors are +, − or 0, and where f rises and falls. |
| [`value-table`](src/presets/value-table/PRESET.md) | A table of values of one or more functions at chosen points, every cell computed from the expression. |
| [`number-line`](src/presets/number-line/PRESET.md) | The real line with intervals and solution sets of inequalities; unions and intersections computed. |
| [`surface`](src/presets/surface/PRESET.md) | Surfaces z = f(x, y) as a shaded mesh on three axes: hidden parts by depth, level curves on the surface and projected to a floor, a point with its tangent plane printed exact. |
| [`revolution`](src/presets/revolution/PRESET.md) | Solids of revolution from a region and an axis: discs, washers or shells, silhouette computed, hidden parts dashed, the slice's R(x), r(x) and dx, and the volume integral exact (8π, 2π/15). |
| [`field`](src/presets/field/PRESET.md) | Slope fields, vector fields and level curves: dy/dx = f(x, y), (P, Q), f(x, y) = c, with solution and flow curves integrated by RK4 and gradients computed; and the field lines and equipotentials of point charges, seeded in proportion to each charge. |
| [`sequence`](src/presets/sequence/PRESET.md) | Sequences aₙ and partial sums Sₙ as unjoined dots on a numbered plane, each limit computed and drawn as its own dashed line, exact when it snaps. |

**Geometry and linear algebra**

| preset | what it is |
| --- | --- |
| [`vectors`](src/presets/vectors/PRESET.md) | Vectors in the plane with sums, multiples, components, projections and angles derived from them. |
| [`unit-circle`](src/presets/unit-circle/PRESET.md) | The trigonometric circle: points from angles, cos and sin as projections, exact notable values, symmetric angles. |
| [`construction`](src/presets/construction/PRESET.md) | Plane and analytic geometry built from definitions: intersections, perpendiculars, bisectors, tangents, triangle centres and conics, with every length and angle computed. |
| [`space`](src/presets/space/PRESET.md) | Points, vectors, lines and planes in R³ on three axes: intersections, distances and angles computed, what is behind a plane dashed; gridded coordinate planes, blocks with their orthogonal projections, and paths with arrows and exact lengths. |
| [`solid`](src/presets/solid/PRESET.md) | School solids -- cube, box, prisms, pyramids, cylinder, cone, sphere, frustums, hemispheres, stairs and polyhedra from face data -- from their dimensions: hidden edges by real visibility, bores, liquid to a level, inscribed and stacked solids, nets; diagonals, slant heights, volumes and areas exact. |
| [`linear-map`](src/presets/linear-map/PRESET.md) | Linear maps of the plane from a matrix or a named rotation, reflection, shear, scale or projection: the image lattice, T(e₁) and T(e₂), the unit square with |det A| measured, eigen-lines, and shapes mapped to primed vertices. |

**Physics**

| preset | what it is |
| --- | --- |
| [`circuit`](src/presets/circuit/PRESET.md) | DC circuits from a given node layout: conventional symbols, branch currents solved by nodal analysis and drawn with arrows in their true direction, meter readings, U_AB, node potentials and powers. |
| [`optics`](src/presets/optics/PRESET.md) | Geometric optics: thin lenses and spherical or plane mirrors with the image computed by Gauss and the principal rays constructed (virtual images dashed), and refraction and total internal reflection at a plane interface by Snell. |
| [`mechanics`](src/presets/mechanics/PRESET.md) | Force diagrams solved before they are drawn: pulley systems (each movable pulley halves the force), a block on an inclined plane (components, normal, kinetic or static friction, acceleration), two blocks over a table's edge, Atwood's machine, a spring; projectiles, energy along a track, levers, collisions, circular motion (uniform, loop, banked curve, conical pendulum), Kepler orbits and gravitation; free fall, blocks in contact, an angled pull, an elevator, springs in series and parallel, a knot on two cables, the centre of mass, oscillators; buoyancy, a hydraulic press, pressure at depth and in a U-tube, and efficiency band diagrams -- every arrow to one scale, or the figure says it is not. |

**Chemistry and biology**

| preset | what it is |
| --- | --- |
| [`acid-base`](src/presets/acid-base/PRESET.md) | Acid–base equilibrium figures, every point computed: titration curves (pH against volume of titrant, by charge balance, with initial, half-equivalence and equivalence points, indicator bands and a verdict), species-distribution diagrams (α against pH, crossings at pH = pKa), and the pH scale with substances given by pH, [H⁺] or [OH⁻]. |
| [`genetics`](src/presets/genetics/PRESET.md) | Punnett squares and pedigrees: gametes, cells and phenotype ratios as exact fractions; family trees laid out by generation, checked against a mode of inheritance, with each individual's possible genotypes and requested probabilities exact. |

**Logic and computing**

| preset | what it is |
| --- | --- |
| [`automaton`](src/presets/automaton/PRESET.md) | Finite automata (DFA, NFA with ε) in Sipser style, with each listed word run through the automaton: its path or state sets and aceita/rejeita computed. |
| [`truth-table`](src/presets/truth-table/PRESET.md) | Truth tables of boolean expressions, every cell computed, with subexpression columns, tautology/contradiction/contingency, equivalence, and minterms with a Quine–McCluskey minimal form. |
| [`logic-circuit`](src/presets/logic-circuit/PRESET.md) | Gate diagrams built from a boolean expression in distinctive-shape symbols, with fan-out dots, optional Quine–McCluskey simplification and a simulation printing every wire's value. |
<!-- /generated:presets -->

**A preset that solves, rather than lays out.** Since the function graph, almost every preset is a solver with a drawing attached: the sign table finds its own roots, a circuit is solved by nodal analysis before its currents are drawn, a lens's image comes from Gauss, an incline's forces are drawn to one scale so F is visibly half of P. A typed coordinate or a typed answer is refused where it could be computed. Every one takes `answers: false`, which keeps the situation and hides what a question would ask for.

**A function graph is data, not code.** Functions are expressions the core parses itself (no `eval`), points are read off them, tangents and secants are computed, and every label is a template — `"P{coords}"` prints `P(3; 9)` from f(3); a coordinate typed by hand is refused. Numbers go through one pt-BR formatter shared with the text around the figure: decimal comma, `(2,5; 7,25)`, the minus `−`, `17/3` rather than a rounded decimal. Axis numbers are never dropped (a number with ink on its spot slides along its own gridline), the zero line is always drawn when the range contains zero, and the legend searches for free space. The fourteen curves of a real Cálculo 1 exercise list are its fixtures ([fixtures/function-graph](fixtures/function-graph)).

**Free outlines** where a box cannot reach. A `Mark` is a start point and a run of segments — lines, and circular arcs about a stated centre — flattened at layout time into the polyline every check walks, at the same 0.05px bound a curved connector uses. It carries no label and takes no part in layout: it is ink, painted beneath everything else, and a filled one is a surface `contrast-sufficient` reads. This is what draws the region between a chord and its arc, which no inscribed polygon can express.

**Frames**, so a figure's own numbers appear once. A frame is a coordinate system — origin, units, and a rotation either stated or *aimed* at another point — resolved to canvas coordinates before anything measures or checks. An incline drawn at 30° is a frame rotated 30°; the slope, the block on it and the normal force are all positioned in that frame, so none of them can disagree with it. Origins compose, `Frame.grid` draws a numbered coordinate plane, and a tick across AB is a block on the y axis of a frame aimed from A at B — which needs no trigonometry, and never writes AB's angle down where it could be wrong.

**Thirteen block shapes** — seven geometric (`rect`, `circle`, `ellipse`, `diamond`, `hexagon`, `stadium`, `triangle`) and six symbols (`parallelogram`, `trapezoid`, `chevron`, `cross`, `star`, `note`). Every one is a polygon, deliberately: `shapeVertices` hands the same vertex list to `inPolygon` for containment and to the `<polygon>` for drawing, so `label-within-shape` answers about the shape on the page rather than an approximation. A curved symbol — a cylinder, a cloud — would break that identity and is not offered. [docs/design/GEOMETRY.generated.md](docs/design/GEOMETRY.generated.md) states each one's inscribed area, which is what tells a container from a marker: a `star` holds 27.6% of its bounding box and a `cross` 55.2%, and neither will take an ordinary label.

**Figure modules** (`node src/cli.ts modules`), in Python, for geometry the core cannot compute. Function curves were a module too, until the core learned to evaluate them ([ADR 0025](docs/decisions/0025-function-graph-absorbs-plot.md)). It was eleven: four rows stopped clearing the bar that puts a figure outside the core at all, and one was never a separate module. The index, and the record of what came out and why, is [modules/README.md](modules/README.md).

<!-- generated:modules -->
| module | what it draws | needs | example |
| --- | --- | --- | --- |
| `crystal` | One conventional crystallographic unit cell, orthographically projected, with visible and hidden cell edges distinguished by real depth. | `numpy`, `ase` | `--args "modules/crystal/render.py,--name=nacl_rocksalt"` |
| `dendrogram` | A hierarchical-clustering dendrogram where height is real merge distance. | `numpy`, `scipy` | `--args "modules/dendrogram/render.py,--name=cluster_demo"` |
| `genomic` | Gene arrows on a real base-pair axis; arrow direction is the strand. | `dna_features_viewer` | `--args "modules/genomic/render.py,--name=plasmid_simple"` |
| `map` | Region and country maps, longitude/latitude projected to Web Mercator, with labels placed at each region's representative point. | `pyproj`, `shapely` | `--args "modules/map/render.py,--name=campaign"` |
| `molecule` | 2D skeletal chemical structures from SMILES, with stereo wedges -- one molecule, or a whole reaction scheme laid out as an equation and its participants. | `rdkit` | `--args "modules/molecule/render.py,--name=glucose"` |
| `plot` | A scatter with a least-squares fit, its R² and each residual. Every fitted value is declared to lie on the fit and on its own residual, and both are checked. Function curves moved to the function-graph preset. | `numpy` | `--args "modules/plot/fit.py,--name=linear_fit_demo"` |
| `skewt` | A Skew-T log-P atmospheric sounding with temperature and dewpoint traces, a lifted-parcel profile and the LCL. | `numpy`, `metpy` | `--args "modules/skewt/render.py,--name=midlatitude_summer"` |
<!-- /generated:modules -->

The module contract is that **the module declares semantics and the core measures geometry**. A module says what it drew and what each element means; it may not certify that what it drew is correct. Nobody certifies their own work.

## Colour, and leaving the tool

Colour is checked, not chosen. `contrast-sufficient` computes real WCAG contrast for every label against what it actually sits on; `categorical-colours-distinguishable` simulates deuteranopia and protanopia over any blocks a spec tags with a shared `categoryGroup`. Three theme variants — `dark` (default, unchanged), `light`, `print` — via `canvas.theme` in a spec, or `node src/cli.ts themes` to see every role's real contrast ratio.

```bash
node src/cli.ts render spec.json --fontEmbed outline --pdf --pdfSize a4
```

A figure can leave the tool as a deliverable, not just a correct drawing: every element carries a `<title>`/`<desc>` built from data the manifest already has, and sits in its own `<g>`. Every figure is set in Prancheta's own bundled font (Inter, SIL OFL, loaded as "Prancheta Sans"), and presets plan their layouts with that font's real advance widths, so a figure lays out the same on every OS. `--fontEmbed embed`, the default, inlines it as a `@font-face` (about 330 KB per SVG); `--fontEmbed outline` converts every glyph to a filled path with zero runtime font dependency, verified against resvg with no system fonts available at all — the mode to reach for when the target tool is unknown; `--fontEmbed none` only names the font. `--pdf` writes real vector PDF, sized to the figure by default or to a physical page (`a4`, `letter`, `<w>x<h>mm`).

## Depth cues, if they carry information

Blocks and connectors can take one of fourteen named effects — `raised-1/2/3`, `recede`, `emphasis`, `alarm`, `lit`, `inset`, `seated`, `etched`, `ghost`, `outlined`, `printed`, `depth-of-field` — for cases where layering, focus or contact is real information rather than polish.

```bash
node src/cli.ts effects
```

That lists every effect **and how far past its own edges it puts ink**, because that is what has to fit on the canvas.

An effect never changes layout: it is resolved after measurement, so the geometry checked is the geometry drawn. A halo clipped by the canvas edge is a reported defect that the repair loop fixes by growing the padding, not by moving anything. Everything desugars to SVG 1.1 filter primitives, and a test rasterises each effect under resvg with and without its filter to prove it is not being silently ignored.

[docs/effects/EFFECTS.md](docs/effects/EFFECTS.md) is the narrative; [docs/effects/REFERENCE.generated.md](docs/effects/REFERENCE.generated.md) is the generated parameter and bleed reference.

## A whole look, named once

Writing `effect` on every element by hand and keeping the choices consistent is the author's job only until there is a pack for it. `canvas.style` names one — `elevated`, `neon`, `spotlight`, `etched` — applied by the `role` an element already declares.

```bash
node src/cli.ts styles
```

That prints each pack with the bleed every role costs, which is the real difference between them. A pack **fills only absences** (an authored `effect` wins), **never styles a `callout`**, and **buys no exemption**: it is applied before `normalise`, so from there down a packed effect is indistinguishable from a hand-written one — same bleed arithmetic, same `effect-within-canvas`, same repair growing `canvas.padding`.

`canvas.type` names a **type pack** — `grotesk`, `editorial`, `poster`, `technical` — over seven levels (`display · title · subtitle · body · caption · eyebrow · mono`).

```bash
node src/cli.ts type
```

Type keys on `level` (how loud) rather than `role` (what it means), because the two are independent: a poster's date line is the largest type on the page and means nothing, while a safety notice may be the smallest and mean the most. A warning caption is `{ "role": "warning", "level": "caption" }`, which is exactly what it is.

Tracking goes into the measurement mirror as well as the SVG and is read back from `getComputedStyle`, so the width Chromium measured and the width drawn cannot drift — emitting it only at draw time would make `text-fits-box` a lie on every tracked label. `type` also names which levels fall back to an unbundled face, since only Inter travels with the tool; a pack is self-contained only when *every* level's first-choice face is bundled, and that is derived rather than asserted.

[docs/design/TYPOGRAPHY.md](docs/design/TYPOGRAPHY.md) is the reasoning.

## Diffing two states

```bash
node src/cli.ts diff fixtures/graph/pipeline-before.json fixtures/graph/pipeline-after.json
```

Lays out both and reports named deltas over stably identified elements — appeared, disappeared, moved, resized, restyled, retexted. Stable identity is what makes the next section possible: `animate` runs this diff over every consecutive pair of states.

## Animation

```bash
node src/cli.ts animate fixtures/animate/seq-0.json fixtures/animate/seq-1.json fixtures/animate/seq-2.json
```

Two or more states of one figure, tweened into a single animated SVG: eased translation for boxes that moved, crossfades for those arriving and leaving, `d`-tweened routes for connectors whose endpoints moved, optional per-element stagger via `motion: { start, end }`, and `prefers-reduced-motion` honoured in the emitted CSS. Everything runs on one clock as CSS `@keyframes` — never SMIL, which `getAnimations()` cannot see and which would put one figure's halves under two timebases.

**The motion is checked, not merely emitted**, and the checks answer about the *interior* of each transition rather than only its endpoints:

| check | what it asks |
| --- | --- |
| `boxes-do-not-overlap-during-transition` | Do two boxes collide at any instant between the two states, including while one is still fading out? |
| `connector-clear-of-boxes-during-transition` | Does a moving route sweep through a box it does not join? |

Both are closed form, with no sampling tolerance anywhere. Boxes translate affinely, so overlap is a quadratic in `t`; a moving segment needs a third separating axis — its own normal — which *turns* as the line moves, making the corner cross products quadratic too. [src/anim/sweep.ts](src/anim/sweep.ts) cuts `[0,1]` at every real root of all twelve polynomials and settles each piece with one evaluation, by the intermediate value theorem. It was validated against the static predicate over 16M random and 60M adversarial comparisons with zero mismatches.

Easing is free, and that is a proof rather than a hope: every element shares one monotone reparametrisation of time, so "overlaps somewhere strictly inside" is invariant under it. Easing functions that would break the premise are refused by name — `steps()` skips ranges of the parameter where an overlap can hide, and an overshooting cubic Bezier is rejected by `0 <= y1 <= y2 <= 1`.

Three refusals rather than known limitations: a route whose two states flatten to different vertex counts (CSS swaps discretely instead of tweening), a moving route carrying an arrowhead (nothing CSS-animatable moves the head in step), and an element that disappears and returns under the same id. A sequence is also refused when two consecutive states share no persisting element — that is two figures back to back, not one figure evolving.

Six ADRs: [0012](docs/decisions/0012-animation-m11-scope.md) scope · [0013](docs/decisions/0013-animation-m11-1-check-what-renders.md) check what renders · [0014](docs/decisions/0014-animation-m11-2-motor.md) the motor · [0015](docs/decisions/0015-animation-m13-stagger.md) stagger · [0016](docs/decisions/0016-animation-m14-sequences.md) N-state sequences · [0017](docs/decisions/0017-animation-m15-routes.md) routes.

## Commands

<!-- generated:commands -->
| command | what it does |
| --- | --- |
| `render <spec>` | Render a figure spec or preset input to SVG, PNG and a manifest.. `--out` `--scale` `--repair` `--maxPasses` `--maxScale` `--fontEmbed` `--pdf` `--pdfSize` |
| `validate <spec>` | Check a spec or preset input WITHOUT drawing it -- shape, references and arithmetic only, never whether the figure is any good.  |
| `select` | Rank presets for a set of content predicates, with the rules that decided it. `--structure` `--idiom` `--domain` |
| `presets` | List the repertoire: every preset, whether it is implemented, and what it is for..  |
| `rules` | Print the selection rule table: what each rule reacts to and what it does..  |
| `effects` | List the effect repertoire: every named effect, what it is composed of, and how far past an element's own edges it puts ink..  |
| `themes` | List the theme repertoire: every named palette, its roles, and whether each role's text clears WCAG AA against its own fill..  |
| `styles` | List the style packs: a whole look applied by role, so an effect is named once for a figure rather than written on every element by hand.  |
| `type` | List the type packs: family, size, weight and tracking for each `level` an element can declare.  |
| `modules` | List the figure modules: what each draws, what it needs installed, and a command that runs it..  |
| `module <command>` | Run a figure module in another language and verify what it drew. `--args` `--width` `--height` `--out` |
| `diff <before> <after>` | Lay out two states of a figure and report what changed between them: appeared, disappeared, moved, resized, restyled, retexted..  |
| `animate <states>` | Tween a sequence of two or more states of a figure into an animated SVG: eased position for moved boxes, crossfades for those arriving and leaving, optional per-element stagger, and a motion check that models what the renderer actually does at every transition and every state boundary.. `--out` `--durationMs` `--delayMs` `--easing` `--loop` |
| `sheet <sheet>` | Build an exercise sheet from one structured file: every figure rendered and checked, HTML with KaTeX, an A4 PDF, a PNG per page, and an answer key generated from the answers.. `--out` `--pdf` `--pages` `--dpi` `--katex` `--variants` `--seed` `--answers` `--allowShortfall` |
<!-- /generated:commands -->

Run `node src/cli.ts <command> --help` for the full options of any one.

### Exercise sheets

```bash
node src/cli.ts sheet experiments/exercises/calculo1/lista.json
```

A sheet is one JSON document. Each exercise has a `level`, a `statement`, figures, an `answer` and a `solution`, set as HTML with KaTeX (and mhchem for chemistry). A figure can be any preset input (`{"spec": …}`, or `{"graph": …}` for a function graph) or a figure module run (`{"module": …}`).

- **Answers are written once:** the answer key is generated from `answer`, and the same field closes each worked solution.
- **Statement figures are question figures:** they get `answers: false` automatically.
- **Numbers come from `params`:** the text and the figures share them, `{{= …}}` prints a computed value (exact when it is one), and `--variants N` re-rolls them into N versions with one separate gabarito.
- **Output and failure:** the output goes to `ProjectHub/Listas/<name>/` — HTML, an A4 PDF and a PNG per page. The command fails, naming each one, on a KaTeX error, a broken image or a figure that failed a check.

ADRs [0026](docs/decisions/0026-the-sheet-command.md), [0040](docs/decisions/0040-computed-sheet-text.md)–[0042](docs/decisions/0042-variant-sheets-and-gabarito.md) and [0062](docs/decisions/0062-rich-text-and-the-reading-panel.md). Worked lists are in [experiments/exercises](experiments/exercises), and [AGENTS.md](AGENTS.md) has the full field reference.

## From an agent

```bash
npm run mcp
```

Speaks MCP over stdio. Every command above appears as a tool, **generated from the same table the CLI uses**, and the knowledge tree is served as `prancheta://` resources: the selection narrative, the rule reference, the effects narrative, the module index, and one resource for every preset and every module.

A hand-written second binding drifts — a flag gets added to the CLI, the MCP tool keeps the old shape, and nobody notices because nothing compares them. Here a drift is a type error, and a test asserts the two surfaces enumerate the same commands.

`.claude/skills/prancheta/SKILL.md` and `AGENTS.md` are *generated views* of the same knowledge, and so are this README's repertoire, check, command and module tables and the [decision index](docs/decisions/README.md) (`npm run gen:views`, enforced by `npm run check:views`).

## Development

| script | what it does |
| --- | --- |
| `npm run check:all` | Everything below that gates: typecheck, both suites, both staleness checks, and the root-clean check. `npm run validate` is an alias. |
| `npm test` | The core suite. Node and Chromium only — green on a fresh clone with no Python installed. |
| `npm run test:modules` | The Python module suite. Spawns every module for real, and **fails rather than skips** when an interpreter or import is missing. |
| `npm run test:all` | Both. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run check:independent` | Re-render exported SVGs with resvg — a Rust engine, no browser — to confirm they survive outside the engine that made them. |
| `npm run check:fonts-travel` | Render with `--fontEmbed outline` and `embed` and confirm both survive with no system fonts available at all. |
| `npm run check:docs` | Both staleness checks below. |
| `npm run check:views` | Fail if `AGENTS.md`, the skill, the README's generated tables or the decision index is stale. |
| `npm run check:refs` | Fail if any of the four generated references — rules, effects, palette, geometry — is stale. |
| `npm run check:root-clean` | Fail if anything not on ADR 0011's list has appeared in the root. |
| `npm run gen:views` / `gen:rules` / `gen:effects` / `gen:palette` / `gen:shapes` | Regenerate them. |

Generated files are generated for a reason: a hand-written table of effect bleed figures or selection rules would be wrong within a release and nothing would notice. What each thing is *for* stays hand-written, because that is the part a generator cannot produce.

## Decisions

Every architectural choice is an ADR in [docs/decisions/](docs/decisions/README.md), with a generated index that gives each one's status and the next free number. The founding ones:

- **Language: TypeScript**: Node is mandatory and Python optional. [0001](docs/decisions/0001-language.md)
- **One repo, one version**: a typed library holds the contract, then the CLI, then the MCP adapter; the Claude skill is a generated view. [0002](docs/decisions/0002-deliverable-shape.md)
- **Repairs are edits, not mutations**: a monotone, terminating loop. [0003](docs/decisions/0003-repairs-are-edits.md)
- **Selection is a rule table with a hand-written narrative**: CI tests the decision procedure, not the model. [0004](docs/decisions/0004-selection-core.md)
- **Modules declare semantics; the core measures geometry**: nobody certifies their own work. [0005](docs/decisions/0005-module-protocol.md)
- **Geometry a figure derives**: where a figure can compute its geometry from the quantity it asserts, the two cannot disagree. [0019](docs/decisions/0019-derived-geometry-and-annotation.md)
- **A figure is data**: expressions are parsed by a closed grammar, labels are computed and typed coordinates are refused. [0022](docs/decisions/0022-function-graph-preset.md)
- **Keeping the docs true**: generated tables, a plans folder, and a test that a preset ships complete. [0075](docs/decisions/0075-keeping-the-docs-true.md)

## Further reading

- [docs/README.md](docs/README.md): a map of every document, what it is for, and who keeps it current. Start here.
- [ROADMAP.md](ROADMAP.md): what was built, in order, with what each step found.
- [docs/plans/](docs/plans/README.md): every plan, its status, and the one in progress.
- [docs/research/](docs/research/): the tool landscape, the language choice, the module survey and the ENEM coverage audit.
## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, where code belongs, and what a review looks for; participation is under the [Code of Conduct](.github/CODE_OF_CONDUCT.md). Security problems go through the [security policy](.github/SECURITY.md) rather than the issue tracker.

The most useful feature request is a **figure you could not draw**. The concrete figure is what says whether the answer is a preset, a module, or a new primitive.

## Licence

MIT — see [LICENSE](LICENSE).

Bundled third-party assets keep their own terms: Inter under the SIL Open Font License, and the Natural Earth and public-domain image data used by the modules and experiments. Each one's source and licence is recorded in [assets/README.md](assets/README.md).

## Non-goals

- Competing with design tools for human-driven editing.
- Photorealism or artistic illustration. The effects layer is schematic depth *cues*, deliberately restrained; it is not a rendering engine.
- Verifying that a figure is **true**. Almost every check here answers malformation, not misrepresentation: a regression fitted to meaningless data, or a map with the wrong country shaded, passes all of them. The exceptions are narrow and stated — a stated angle is checked against the arc drawn for it, and a figure module may declare that one thing it drew lies on another, which the drawing can then refuse.
- Encoding to video. Animation ships as an SVG that honours `prefers-reduced-motion`; a frame-sequence encoder would destroy exactly that, so it could at most be an explicitly lossy convenience, never the deliverable ([ADR 0016](docs/decisions/0016-animation-m14-sequences.md)). Shape morphing and a camera are refused on the same page, and for a camera permanently: legibility under zoom has no check, and none can exist without a research-grade advance.
