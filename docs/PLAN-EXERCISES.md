# Plan: physics and maths exercise figures

Where M5–M10 came from a gap analysis against human-oriented figure tools, this
one comes from a gap analysis against **exam papers**. The target is the figure
a student is handed: a free-body diagram, a circle theorem, a transformation on
a grid.

## The finding this plan is built on

A free-body diagram was authored in the real IR and rendered through the real
pipeline. It exited 0, reported six unrepaired failures, and drew a slope of
roughly 46° — the diagonal of a 380×200 isoceles triangle — beside a label
reading `30°`.

**It passed every geometric check while asserting something false.** The number
30 appeared twice in that spec: once as a printed string, once implicitly as
whatever angle a bounding box happens to have. Nothing connected them.

That is the whole diagnosis, and it generalises. Every substrate this tool
draws well computes its geometry from the content being asserted — a bar's
height from its datum through a scale, a molecule's coordinates from RDKit, a
node's position from ELK. Every substrate it draws badly asks an author to
hand-place coordinates that a label separately claims.

**So the work is not a drawing primitive. It is teaching the spec to compute
what it draws from what it says.** A wedge primitive that still takes
hand-typed angles reproduces the identical failure in a colour wheel.

## Milestones

### M0 — three defects, no new vocabulary — **DONE (2026-08-29)**

No ADR, no IR change. Validated by re-rendering the failing free-body diagram
and counting which of its six unrepaired failures disappear **with no new
authoring** — the only step in this plan with a regression baseline already
sitting on disk.

**Outcome.** Four defects fixed, not three: a fourth (alpha never composited
before contrast was measured) surfaced only because fixing M0.2 made
`fixtures/allow-overlap.json` go red, which is the render-and-measure loop
catching a false alarm as readily as a silent pass. Blast radius measured
across all 67 fixtures before and after: **zero changed their failure sets**,
and four repair edits flipped from growing height around mangled text to
growing width around intact text. Suite 861 → 880. See the ROADMAP entry for
the full account. A fifth defect — the arrowhead's own shaft protruding past
its apex — was fixed alongside them.

**M0.1 — a label may break inside a word, and the repair loop could not undo
it.** `overflow-wrap: anywhere` at [html.ts:126](../src/layout/html.ts) was
what turned `30°` into three stacked lines `3` / `0` / `°`. The repair loop's
wrap flip was never the cause and never fired: `planWrapFallback` skips any
block that did not explicitly declare `wrap: "none"`, and the default was to
wrap. The loop could not recover, because width growth fires only on
`overflow.right > EPSILON` and a wrapped label's lines each already fit
horizontally — so the union overflowed *downward*, the height branch fired,
and the box grew to accommodate the damage. One figure grew +12% in width
against +153% in height.

The fix replaced the mirror's global `overflow-wrap: anywhere` with
`overflow-wrap: normal; word-break: normal`. Intra-word breaking was not
deleted, only demoted to an opt-in `Block.wrap` value, `"anywhere"`, joining
the existing `"normal"` and `"none"`. `fixtures/labelled-blocks.json` — titled
"worst-case labels" — is the fixture that needed it: its `unbreakable-url` and
`narrow-right` blocks (the latter carrying "Antidisestablishmentarianism") now
declare `"wrap": "anywhere"`, because with the word kept whole they grew
340→500px and 162→227px instead of breaking. Both still passed either way,
which is the point worth naming — the fixture stayed valid while no longer
testing what it was written to test, and that gap is why the opt-in exists
rather than a silent default flip. Across all 67 fixtures, the default change
altered no fixture's failure set; four repair edits flipped from growing
height around mangled text to growing width around intact text.

**M0.2 — `contrast-sufficient` scored a label against the wrong thing.**
[checks.ts:580-584](../src/checks.ts) used to resolve the substrate as the
label's own owner-box fill, falling back to the canvas background when that
box had no fill. It never asked what the label geometrically sat *over*.

Demonstrated: a label with `textColor: "#141414"` placed inside a rect filled
`#101010` rendered completely illegible, and the pipeline reported
`ok contrast-sufficient — 18.42:1 against #FFFFFF`. The true ratio was about
1.03:1. Worse, `text-clear-of-other-boxes` **also** passed, because the dark
patch fully contained the label's owner rect and
[checks.ts:412](../src/checks.ts) treats containment as ancestry and skips it.

Two independent checks stood down on one figure and the render came back
green. That was not-applicable-never-pass defeated twice over.
`contrast-sufficient` now resolves the substrate geometrically instead of by
ownership: it composites, in paint order, every filled box whose rect covers
the label's ink, starting from the canvas background. A label straddling a
surface is scored against the worse of the surfaces it lies on. A new helper,
`compositeOver`, was added to [contrast.ts](../src/colour/contrast.ts) to do
source-over alpha compositing; it returns the author's own colour string
unchanged when the layer is opaque, so manifests keep naming `#171A21` and only
genuinely blended surfaces report a colour nobody typed.

**M0.2b — the geometric fix immediately produced a false alarm.** Making
`contrast-sufficient` geometric turned `fixtures/allow-overlap.json` red: its
Venn circles are filled `rgba(57, 102, 201, 0.34)`, and scoring those channels
raw read a pale blue on white as saturated blue, failing a perfectly legible
label. Alpha was being parsed everywhere in the pipeline and composited
nowhere. `compositeOver` fixed this alongside the substrate resolution above —
those labels now read `8.29:1 against rgb(182, 198, 233)`. It is worth stating
plainly: the render-and-measure loop caught this false alarm as readily as it
had caught the earlier silent pass.

**M0.3 — connector endpoints clipped to the bounding box, not the drawn
shape.** `clipToBox` ([connectors.ts:123-137](../src/layout/connectors.ts))
used `halfWidth = box.width / 2 + gap` and never consulted `shapeVertices`, so
an arrow aimed at a triangle stopped on a rectangle that was never drawn. The
rendered effect was mild and was *not* what made the force arrows in the
free-body diagram miss a shared origin — but the physics inventory is mostly
arrows meeting triangles and circles, and `shapeVertices` already existed.
`clipToBox` now ray-casts against the real polygon from `shapeVertices` when
the box has one, taking the minimum positive parameter so non-convex shapes
(`cross`, `star`) clip on the edge actually met. `rect` and `stadium` fall
through unchanged. `circle` and `ellipse` knowingly stay on the rectangular
path — an exact ellipse clip is a different computation and was out of scope.

**M0.4 — the connector shaft protruded past the arrowhead's apex.** The shaft
was drawn all the way to `points[last]`, which is also where the arrowhead's
apex sits, so with `stroke-linecap="round"` a nub of radius `strokeWidth / 2`
protruded past the point of the arrow. New `shaftInset(style)` and
`trimForHeads` in [svg.ts](../src/render/svg.ts) pull the *drawn* polyline back
by each head's reach: `size` for the filled wedges (`closed`, `half`),
`size * 2` for `diamond`, `size * 0.6` for `circle`, and zero for `open` and
`crowsfoot`, whose whole point is that the line shows through the chevron.
Only the drawing is shortened — `connector.points` is untouched, so every
check still walks the original polyline and the apex still lands on the
route's real endpoint.

### M1 — derived position ([ADR 0019](decisions/0019-derived-geometry-and-annotation.md)) — **M1.1, M1.3, M1.4 DONE; M1.2 deferred**

Four items, one ADR, one fixture. **Deliverable:
`fixtures/fbd-incline.json`** — an inclined-plane free-body diagram in which
the drawn slope, the θ arc and the printed angle are all one number.

Before writing anything, spend a day on this: `Block.rotation` with
`rotateBox` already exists and is analytically exact
([geometry/rotate.ts](../src/geometry/rotate.ts)), so a rotated rect gives a
*true* slope today. It fails only because the arrows and labels around it
cannot be placed in the rotated frame — which is exactly what the rest of M1
supplies. If that goes better than expected, M1 gets smaller.

**M1.1 — an Annotation node carrying an `owner`.** Text that names a thing must
be allowed to sit on it. Today every label is a Block, so it collides with the
substrate it annotates. The exemption goes at
[checks.ts:406-414](../src/checks.ts), mirroring the precedent already at
[checks.ts:288-296](../src/checks.ts) in `connectorClearOfBoxes`; the `owner`
concept is not invented here, the module protocol already ships it. This *adds*
a check (`annotation-clear-of-non-owners`) rather than relaxing one.

**M1.2 — a gridless Frame.** `{ id, origin, xUnit, yUnit, rotation }`. A
position stated as `{ frame: "incline", at: [3, -2] }` is resolved to canvas
px, so the drawn position is derived from the stated coordinate by
construction. Built on `createLinearScale`, which the chart preset already uses.

Two constraints, both load-bearing:

- **Frames resolve during `normalise`**, before layout and before any check
  runs, so the IR reaching the checker contains no frames at all — the same
  move the effects layer makes for bleed and `geometry/rotate.ts` makes for
  rotation. The manifest records which frame each element was authored in.
- **Frame-positioned elements are exempt from size repair and report
  `unrepaired`.** `applyEdits` writes `block.width`/`height` directly
  ([repair.ts:294](../src/repair.ts)); left alone it would silently move an
  element off the coordinate it claims, reintroducing the falseness class
  through the back door.

The frame is **gridless** on purpose. A grid draws gridlines, axes, ticks and
tick labels — ink and text that nothing currently owns. Gridless costs no new
checks; that is what makes it M1 and the grid M2.

**A Frame owns position, not shape.** `Block.shape` is a bare enum read by
seven sites and carried through layout as a `Map<string, ShapeKind>`. So the
incline in M1 is an **outline** — three frame points joined by connectors — not
a Block. No fill, no `label-within-shape`, no hatching. That is honest and it is
enough for this figure.

**M1.3 — `Connector.from` accepts a bare `Point`.** `to` already does. Force
arrows then share one application point at arbitrary bearings. Seven sites; the
sharp ones are the two refusals at [types.ts:996-999](../src/ir/types.ts), the
*silent drop* at [place.ts:142-143](../src/layout/place.ts), the non-nullable
`PlacedConnector.fromId`, and the endpoint-exemption degradation at
[checks.ts:279-281](../src/checks.ts).

**M1.4 — an angle arc.** One `A` command through `flattenPath`
([geometry/paths.ts](../src/geometry/paths.ts)), which is zero-import,
tolerance-bounded at 0.05px and already handles full SVG elliptical arcs. The
maths is free; the plumbing is not — an IR node and its validation clause, a
renderer branch, an ink-bounds entry so `content-within-canvas` sees it, an
ownership decision for its label, and **a check that the swept angle equals the
printed angle**. That last one is the entire point: an arc whose sweep can
disagree with its label reproduces the original defect inside the primitive
meant to cure it.

### M2 — the gridded plane

The Frame gains a grid and axes, and pays what a grid costs: extend
`tick-labels-do-not-collide` to frame axes, and decide gridline-as-substrate now
that contrast resolution is geometric (M0.2). Unlocks transformations, vectors,
loci, coordinate geometry, kinematics graphs, trig graphs and the unit circle —
every one of which is a figure whose positions are stated coordinates.
**Deliverable: a transformations question — a shape and its image on a labelled
grid.**

### M3 — geometry marks

Equal-side ticks and right-angle squares, folding in
[src/dimension/annotation.ts](../src/dimension/annotation.ts), which is already
built on `createLinearScale` and is a Frame annotation layer in all but name.
**Deliverable: a triangle construction, and a circle theorem minus the shading.**

### M4 — the Mark

Free outlines, sectors, hatching — flattened by the same 0.05px flattener, so a
mark is checked as it is drawn. It ships with a **bleed**, because hatching is
ink with area. Its other obligation, contrast substrate resolution, was already
paid in M0.2. **Deliverable: a shaded circular segment.**

### M5 — parametric shape vertices

Only if M1's outline approach proves insufficient in practice. Budget the
`gen-shape-reference` format change: it holds an exhaustive
`Record<ShapeKind, string>` and grid-samples `containsPoint` over one canonical
box, so a parameterised shape makes each entry a function rather than a
constant.

## Cut

- **Ray diagrams → a Python module.** Ray geometry is computed by refraction
  *rules* and by `1/v = 1/f − 1/u`, not stated as coordinates, so no Frame
  produces it; and the virtual-image case needs one polyline in two line styles,
  which `Connector` cannot express. This is what the module door is for.
- **Greyscale separability** and **pinned layout over a spec family** — both
  real, both serving worksheet *production* rather than figure competence.
  Pinned layout is where the question/answer-key pair belongs, after a figure is
  usable.
- **`src/math/mathjax.ts` — delete.** Unicode subscripts, Greek and the degree
  sign already measure correctly through the browser mirror, so it blocks
  nothing. Its `latex.length * fontSize * 0.6` is a guessed advance width, with
  four passing tests and no importer outside its own test file — the exact
  defect this project exists to refuse.

## Conventions each step owes

Per CONTRIBUTING.md: **every new degree of freedom ships with the check that
constrains it.** M0 is bug fixes (tests, no ADR). M1 is one ADR — 0019, since
0018 is the highest and 0003 is already duplicated across two files. Fixtures
go in `fixtures/`. Touching `LINE_STYLES`, `ARROW_STYLES` or `shapes.ts`
requires `npm run gen:shapes`; touching `src/commands.ts` requires
`npm run gen:views`. Nothing generates a check reference, so a new check id
costs no regeneration.

## What to expect

**M0's success criterion is fewer silent lies, not more green checks.** Two of
its three fixes make checks *stricter*, and the wrap change may make labels that
currently mangle themselves into a passing box fail loudly instead. The suite
may get redder before M1 makes it green again. That is the intended direction.
