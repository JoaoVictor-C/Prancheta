# TODO

Full rationale, what's genuinely hard about each, and what check would give it real teeth: [docs/research/candidate-modules.md](docs/research/candidate-modules.md).

## Constraint toggles — designed, ready to implement

**Decision recorded:** [ADR 0010](docs/decisions/0010-constraint-toggles.md) — make constraints 1, 2, and 4 toggleable; keep 3, 5, 6 as-is.

**Implementation plan:** [docs/CONSTRAINT-TOGGLES-PLAN.md](docs/CONSTRAINT-TOGGLES-PLAN.md) — 6 phases, 21-33 hours estimated.

Three toggles to implement:
- [ ] **`allowOverlap`** — disables `boxes-do-not-overlap` check when true (enables Venn diagrams, circle packings, overlapping annotations)
- [ ] **`allowConnectorCrossing`** — disables `connector-clear-of-boxes` check when true (enables callout/leader patterns crossing dense fields)
- [ ] **`allowCurvedConnectors`** — enables bezier/arc connectors in IR (enables curved flowcharts, mind maps, org charts)

All default to `false` (constraints active). Per-diagram scope via `canvas.constraints`. Reasoned through terza (confidence 0.82, 2 iterations).

**Why these three:** Each blocks specific legitimate diagram types without being load-bearing for the layout solver. Constraints 3 (axis-aligned), 5 (flat-color), and 6 (text limits) are kept as-is because they're either foundational to the solver or add complexity without structural value.

## Animation: what M11.1 through M14 left behind

Five milestones shipped against [ADR 0012](docs/decisions/0012-animation-m11-scope.md), [0013](docs/decisions/0013-animation-m11-1-check-what-renders.md), [0014](docs/decisions/0014-animation-m11-2-motor.md), [0015](docs/decisions/0015-animation-m13-stagger.md) and [0016](docs/decisions/0016-animation-m14-sequences.md). See [ROADMAP.md](ROADMAP.md) for what each found. What is genuinely open, in the order the evidence favours:

- [ ] **Connector motion (M12).** The most visibly wrong thing left in the output: a connector is pinned to its second-state (or, in a sequence, its final-state) route for the whole run while its endpoint boxes glide away from it. Needs motion-crossing via adaptive-tolerance sampling, reusing the `FLATTEN_TOLERANCE` discipline — a routed connector is not guaranteed reducible to one linear inequality the way box motion is — plus true route interpolation. Its own ADR, the same complexity class as the curve-flattening fix.

- [ ] **Multi-label diff (M12).** `diff.ts` gives each element exactly one delta kind, priority-ordered, so a box that slides *and* recolours is `restyled` and hard-cuts rather than sliding. The root-cause fix for a defect M11.1 could only disclose. Deliberately not absorbed into M11.1: it changes `FigureDiff`'s public shape and the `diff` command's output, neither of which that defect required touching — and it needed the shared trajectory derivation as a prerequisite anyway, since without it `checks.ts` would still derive its own motion and could still disagree.

- [ ] **Easing a staggered figure.** Guard 3 currently refuses the combination, because CSS applies a timing function between each *pair of keyframes*, so easing a staggered element eases its own ramp and every element ends up on a different reparametrisation of time. The way out is designed in ADR 0015 and **unverified**: ease the *global* clock, and give each element's ramp the corresponding sub-arc of that same Bezier, which is itself a Bezier by De Casteljau subdivision. Then there is one shared reparametrisation again and the original proof applies verbatim. Applies identically to an N-state sequence.

- [ ] **A stagger profile helper.** Windows are per-element and hand-declared, which is right for a generator (see [experiments/animation/vortex.mjs](experiments/animation/vortex.mjs)) and tedious by hand for a large figure. No flag is offered because any such flag has to invent an ordering rule, and the core is the wrong place for one. If this lands it belongs in a preset or a generator, not in `animate`.

- [ ] **Unowned text is still not a participant.** The motion check's population is drawn *boxes*. A `PlacedText` with no owner — a figure title rather than a label — is drawn too and has never been checked against anything moving. Owned text is covered, since it is contained in its owner's content rect and travels with it. Standing limit since ADR 0012, restated in 0013, still open.

- [ ] **Effects put ink outside the checked rect.** Inherited from every static check rather than introduced by animation, but worth stating in one place: the motion check reasons about the same rectangles the static checks do, not about pixels, so a box with elevation or depth can overlap in ink while its rect-trajectory reports clear.

- [ ] **A sequence launches one browser per state.** `render()` launches and closes its own Chromium instance; an N-state sequence pays that cost N times rather than sharing one browser across states. Not optimised in M14 — stated as a measured cost, not assumed away. Worth revisiting if sequences of a dozen-plus states become common.

- [ ] **The identity-continuity bound is heuristic at the edges.** `persisted > 0` between every consecutive pair (ADR 0016) catches the paradigm slideshow and admits the paradigm evolving figure, but a slideshow with one persistent header element would still pass. Good enough for a feature nobody has stress-tested against adversarial specs yet; would need sharpening before it became a guard people actively try to route around.

**Deliberate non-goals, not backlog (ADR 0016).** Shape morphing, a camera, and video export. None of the three is refused for lack of effort: an axis-aligned-box solver cannot reason about a shape becoming another shape; there is no check for legibility under zoom, and none can exist without a research-grade advance; and encoding to a video file would destroy the `prefers-reduced-motion` behaviour M11.2 deliberately shipped, so it could at most be an explicitly lossy convenience, never the deliverable. "More than two states" is **not** on this list any longer — see M14.

## Agent-facing surface: what ADR 0018 shipped, and what it deliberately left

Shipped against [ADR 0018](docs/decisions/0018-preset-input-validation.md): one `parseFigureInput` dispatch replacing four independently-written copies, an unknown preset refused by name instead of falling through to a complaint about `spec.version`, per-preset validators whose remit is every expander precondition the repair loop cannot reach, and a `validate` command that never launches a browser. Full suite green throughout (812 -> 829).

Left open, in the order the evidence favours:

- [ ] **A module's missing dependency should be a named refusal.** `module python --args "..."` reaches the same CLI and the same MCP tool table as every other command, and never touches `parseFigureInput` at all — its input is an argv string, and its likeliest failure by far is an absent Python package. `MODULES` already declares each module's `needs`, so the repertoire already knows what to say; nothing says it. This is the same defect ADR 0018 fixed for documents, one surface over, and it is cheap for exactly the same reason.

- [ ] **Over MCP, `render` returns checks but no figure and no path.** The svg/png Buffers are dropped deliberately, and the stated reason is good — a base64 image in a tool result is a payload nobody asked for. But the consequence is that an MCP-only agent is strictly worse off than a CLI one: it is told its figure has a defect and given no way to look at it. The minimal fix is not base64 but moving the artefact write out of `cli.ts` into a helper both bindings call, so MCP returns paths. It revises a documented deliberate decision, so it wants its own ADR rather than being smuggled into someone else's change.

- [ ] **A validator can drift from its expander.** Stated in ADR 0018 rather than solved. Co-location under ADR 0002's discipline, a coverage test, and running every shipped fixture through the layer are mitigations; nothing *mechanically* forces a new optional field to gain a clause. Worth revisiting only if a real drift is ever observed — the alternatives (a schema library, generating from erased types) are both worse for reasons the ADR records.

- [x] **`check:root-clean` failed on a pristine tree**, flagging `.git` as an unapproved root item, so `npm run validate` exited 1 even when typecheck, every test and every generated-doc check passed — a green run was indistinguishable from a red one. Pre-existing and unrelated to ADR 0018; found while establishing a baseline for it. The script's allowlist had simply never mirrored its own ADR: [ADR 0011](docs/decisions/0011-project-organization.md) lists `.git/` among approved hidden items, and every other hidden root entry (`.gitignore`, `.npmrc`, `.claude`) was already approved. Which means the check had never passed on an actual clone — only on a copy of the tree with no VCS directory. Fixed in [scripts/check-root-clean.ts](scripts/check-root-clean.ts); `npm run check:all` now exits 0.

## Generators: the shared library became supported, the generators stayed experiments

The poster series had a 137-line `lib.mjs` that six generators used (63-149 lines each) and seven abandoned (111-708 lines each), re-deriving its own `W`/`H`/`BG`/`nid`/`ramp`/`text` on the way out. Reading them settled *why*, and it was not the reason the line counts suggested: `phyllotaxis.mjs` re-implements `poster()` inline with lib's exact magic numbers on lib's exact canvas, so it did not outgrow the frame, it copied one. The cause is that every helper took the accumulator array as its first argument, so a generator wanting one local helper wrote a closure — and having dropped the import, lost everything else in it.

Shipped in [experiments/generators/lib.mjs](experiments/generators/lib.mjs), with [README.md](experiments/generators/README.md) as its contract:

- **`page()`** — closes over its own kids and its own theme, so a call site carries neither. Purely additive: the free functions are unchanged and all six incumbents still run.
- **Themes** — `midnight`, `bone`, `blueprint` as plain role records, replacing five hardcoded `INK_*` constants. Each poster prints its own contrast, measured with `contrastRatio` from `src/colour/contrast.ts` — the same function `contrast-sufficient` uses. Text roles get a WCAG AA verdict; mark roles and ramp floors get a ratio and explicitly no verdict, because a 1px rule and a data-driven mark are not text.
- **`carve`** — a rule emitted as segments that stop short of everything reserved. Extracted from `zeta-conformal`'s private `carvedLine`, which had discovered the hard way that a grid drawn as whole rects runs straight through its own axis labels.
- **`panel`** — a sub-region with a data-space map, `ticks()` that reserves labels before drawing any grid, and an optional `pitch` that snaps marks onto a lattice. Gridlines default OFF: `carve` can route a rule around reserved labels, never around a thousand data points.

**Acceptance test, and it passed:** [collatz.mjs](experiments/generators/collatz.mjs), a genuinely new two-panel poster with real axes, written from the library and README only. **88 lines**, against 340-341 for the comparable hand-rolled ones (`zeta-conformal`, `conjugacy`). Every check green. Its first render found three real defects — origin labels clipping at the axis corner, gridlines through the data, marks touching across lattice cells — each fixed in the library rather than the generator.

Open:

- [ ] **Nothing was migrated,** so no claim is made about how much of the existing 3,199 lines this makes unnecessary; the measured claim is forward-looking only. The six sound generators (`chladni`, `harmonograph`, `bifurcation`, `ulam`, `pascal`, `delaunay`) are 63-149 lines each and would be cheap to move; the six legacy ones are not, and their maths is worth more than their plumbing. The README labels which is which so the corpus stops teaching the retired idiom.

- [ ] **`navguide` does not belong in this series.** It is a node-and-connector diagram sitting in a poster directory; the library does not serve it and a core preset would. Left where it is rather than moved silently.

- [ ] **The library was derived from this corpus.** Panels, carving and the lattice are what fourteen programs actually needed, generalised from them. A genuinely different figure may find a new ceiling; the honest response is to widen the library rather than fork it a fifteenth time.

- [ ] **No `generators` command, and that is deliberate.** `modules` earns its repertoire table because a caller chooses one at runtime; nobody invokes a generator at runtime, so the same table here would be shape without reason.

## Flashy on purpose: style packs and symbol shapes

Two gaps, both measured rather than assumed. An agent asked for something loud had to write `effect` on every element by hand and keep the choices consistent itself, and the shape vocabulary was seven geometric primitives with no symbols in it at all — the word "symbol" appeared exactly once in `src/`, inside a Python module's description.

- [x] **Style packs** — [src/effects/styles.ts](src/effects/styles.ts), documented in [EFFECTS.md](docs/effects/EFFECTS.md). `canvas.style` (or `style` on any preset input) names a whole look, mapped by the `role` an element already declares: `elevated`, `neon`, `spotlight`, `etched`. Applied in the pipeline right before `normalise`, so from there down a packed effect is indistinguishable from a hand-written one — same `resolveEffects`, same bleed, same `effect-within-canvas`, same repair growing `canvas.padding`. Three rules, each with a test: it fills only absences (an authored `effect` wins), it never styles a `callout`, and it buys no exemption. New `styles` command lists each pack with the bleed every role costs, since that reach is the real difference between them.

- [x] **Six symbol shapes** — `parallelogram`, `trapezoid`, `chevron`, `cross`, `star`, `note`, taking the repertoire from 7 to 13. Every one is a polygon, and deliberately: `shapeVertices` hands the *same* vertex list to `inPolygon` for containment and to the `<polygon>` for drawing, so `label-within-shape` answers about the shape actually on the page rather than an approximation. A curved symbol (a cylinder, a cloud) would break that identity and is not offered. Reachable from the preset layer too — `shape` now passes through `graph` nodes and `labelled-blocks` items.

- [x] **`SHAPE_DESCRIPTIONS` was missing `triangle`**, so the generated shape reference had been printing `undefined` in its "what it is" column. Pre-existing; `scripts/` sits outside `tsconfig`, so the `Record<ShapeKind, string>` was never exhaustiveness-checked. All seven gaps filled.

Two things the checks said that are worth keeping in view rather than fixing:

- [ ] **`star` (27.6% of its bounding box) and `cross` (55.2%) are markers, not containers.** `label-within-shape` refuses even a two-character label in a star at ordinary node height, which is correct and is why the generated reference now states the inscribed area of every shape. A symbol sheet should caption them, not label them. Nothing to fix; worth not forgetting.

- [ ] **Nothing has a `shape` in the `mindmap`, `annotated-figure` or `chart` presets.** `graph` and `labelled-blocks` pass it through; the other three do not, and for `chart` that is probably right (a bar is a bar). Left unasserted rather than fixed by reflex.

## Typography: the third design system, and the placement helpers

Colour had THEMES. Depth had STYLE_PACKS. Type had one family stack, one size and one line-height, for everything — a categorical absence, not a gap of degree. Shipped as [src/typography.ts](src/typography.ts) + [typography-apply.ts](src/typography-apply.ts), documented in [docs/design/TYPOGRAPHY.md](docs/design/TYPOGRAPHY.md) and served over MCP as `prancheta://typography`.

- [x] **`level`, a second axis.** Type does NOT key on `role`, and one ordinary poster is why: its date line is the largest type on the page and means nothing, while a safety notice may be the smallest and mean the most. `role` answers *what does this mean*; `level` answers *how loud is this*. A warning caption is `{role: "warning", level: "caption"}`. A test asserts the two never collapse into one vocabulary.
- [x] **Four packs** — `grotesk`, `editorial`, `poster`, `technical` — over seven levels (`display · title · subtitle · body · caption · eyebrow · mono`). New `type` command lists every step.
- [x] **`letterSpacing`, measured not just drawn.** Emitted into the HTML mirror as well as the SVG, and read back from `getComputedStyle` rather than carried forward, so the width Chromium measured and the width drawn cannot drift. Emitting it only at draw time would have made every `text-fits-box` result a lie on any tracked label.
- [x] **Portability is derived, not asserted.** A pack is self-contained only when *every* level's first-choice face is bundled — and only Inter is. The first draft hand-marked `grotesk` self-contained because five of six levels use Inter; its `mono` level does not. `type` now names exactly which levels will fall back.
- [x] **Placement helpers** in [experiments/generators/lib.mjs](experiments/generators/lib.mjs): `spiral`, `ring`, `serpentine`, `tracked`, `rng`, `scatter`. Each was re-derived by hand in at least two generators before extraction. They return positions and draw nothing.

Two things the tests found rather than the design:

- The **size ladder** (`display → caption`) is asserted monotone, and the first draft failed it: the poster pack's eyebrow had been filed as a `subtitle`. An eyebrow is a *device* — small, widely tracked, sitting above a title — not a size step, so it became its own level and sits outside the ladder alongside `mono`.

Deferred, with reasons rather than as a backlog:

- [ ] **Contrast thresholds still ignore size.** WCAG lets large text pass at 3:1 rather than 4.5:1, and `contrast-sufficient` applies 4.5:1 to everything, so display type can fail a check it should pass. Packs now make size and weight knowable, so the check *could* learn this. It has not: the change makes a check more PERMISSIVE, which is the direction this project is most careful about, and it wants its own ADR rather than arriving as a side effect of typography.
- [ ] **Composition is the fourth missing system.** There is `canvas.padding` and nothing else — no margins, no modular scale, no title-block rhythm. The generator lib's `poster()` still hardcodes 140/52/916/120. Real and wanted; deliberately not shipped alongside type, because two systems in one pass is how both arrive half-verified.
- [ ] **Text over a colour field still cannot pass.** `allowOverlap` stands down `boxes-do-not-overlap`; nothing stands down `text-clear-of-other-boxes`. The honest fix is not a fourth toggle but a TRADE — stand down the collision check and force the contrast check to run against the box the text now sits over, since what matters there is legibility, not collision. Depends on the contrast work above.
- [ ] **Arbitrary block paths.** `flattenPath` already ships (used for connector curves) and is unconsumed by blocks, so a `shape: "path"` flattened for containment is feasible. Own ADR: it trades away the exact-containment guarantee every shape currently keeps.

Refused outright, on current evidence: skew/flip/tile/scale transforms (ceiling, not floor — and each multiplies what every check must reason about); more effects (14 compose from 10 primitives, and too few looks was never the measured problem); a `poster` preset (a poster is compute plus composition, and the compute cannot be JSON); a `select`-style rule table for packs (choosing wrong is a preference, not a defect, and arbitrating taste is authority this project does not have).

## Candidate figure modules, in priority order

- [x] **Reaction schemes** — [modules/reaction](modules/reaction/MODULE.md). Reactants → arrow → products, reusing `molecule`'s per-molecule geometry via a `.`-joined SMILES mini-DSL (repeated components declare a coefficient). Four canned reactions, `--misdeclare` probe, e2e tests.
- [x] **Phylogenetic trees / dendrograms with real branch lengths** — [modules/dendrogram](modules/dendrogram/MODULE.md). The one tree shape `mindmap` can't honestly serve, since branch length is data, not depth. Draws `scipy.cluster.hierarchy`'s own `icoord`/`dcoord` layout; declares every merge's geometry, so a scaling bug shows up as a failed check, not a plausible-looking wrong picture.
- [x] **General function & data plots** — [modules/plot/function.py](modules/plot/MODULE.md). Any `f(x)` expression (or several, overlaid) with roots/extrema found numerically, or a scatter with a real `numpy.polyfit` fit and R². `--misdeclare` probe, e2e tests.
- [x] **Circuit schematics** — [modules/circuit](modules/circuit/MODULE.md). Real component symbols (resistor zigzag, capacitor plates, inductor bumps, switch, diode) around a single-loop series circuit, laid out entirely by this module (no `schemdraw` dependency — every coordinate is owned here or in the shared [`modules/symbols_electrical.py`](modules/symbols_electrical.py) leaf library). `--misdeclare` probe, e2e tests. Scoped deliberately to one loop, not general netlist routing.
- [x] **Genomic / sequence feature diagrams** — [modules/genomic](modules/genomic/MODULE.md). Gene arrows on a real bp-coordinate axis; row-packing for overlapping features via `dna_features_viewer.compute_features_levels`, called directly rather than re-derived. The one module so far where a label legitimately declares `owner` — arrows are filled shapes, not stroked lines, so `module-label-within-feature` runs for real instead of reporting not-applicable. `--misdeclare` probe, e2e tests.
- [x] **Protein secondary-structure topology cartoons** — [modules/topology](modules/topology/MODULE.md). Helices as capsules, strands as arrows, connected by a serpentine meander that wraps rows rather than running off-canvas. Two illustrative named topologies (a four-helix bundle, a β-α-β-α-β Rossmann-fold pattern), explicitly not fetched from any real PDB entry. `--misdeclare` probe, e2e tests. Not yet implemented: reading real `HELIX`/`SHEET` records from an actual `.pdb` file (currently takes a hand-authored element list).
- [x] **Meteorological Skew-T log-P diagrams** — [modules/skewt](modules/skewt/MODULE.md). Skew transform owned by this module (a straight algebraic definition); the physics borrowed from real `metpy.calc` — dry adiabats, a lifted parcel's full dry+moist ascent, and its LCL. `--misdeclare` probe, e2e tests. Two named soundings, explicitly illustrative, not observed data.
- [x] **Crystallographic / lattice diagrams** — [modules/crystal](modules/crystal/MODULE.md). Real structures via `ase.build.bulk()`, a fixed isometric projection, painter's-algorithm occlusion. Deliberately schematic: flat fills, no shading, no perspective, staying inside the project's non-goals rather than testing them. `--misdeclare` probe, e2e tests. One real finding: some elements (Na in rocksalt, Cu's corner sites in fcc) sit exactly on a cell edge in *every* projection — a structural fact, not a placement bug — so this module labels an element only when a projection-clear representative atom exists, and says so when one doesn't rather than forcing a colliding label.

**All 8 candidates from the original research are now implemented.** See [ROADMAP.md](ROADMAP.md) for the full build history of each.

## Charts: bar charts (core preset) and pie/donut (module), both shipped

- [x] **Bar charts** — [src/presets/chart](src/presets/chart/PRESET.md). A real, first-class TypeScript preset, not a module: bar length is a linear scale, arithmetic the core already does, so the whole pipeline (text measurement, the repair loop, every existing check) applies with zero new code. Vertical/horizontal orientation, single or grouped multi-series with a legend, values labelled by default. Wired into the selection core: `structure: series` and `idiom: chart` both favour it, and `I-chart-disqualifies-everything` — kept, not retired, since refusing to draw a chart as a graph was always correct — no longer means "this repertoire can't do it."
- [x] **Pie / donut charts** — [modules/piechart](modules/piechart/MODULE.md). A real circular sector is not expressible as a `Block` (always axis-aligned rectangles), so this is a module, the same boundary that puts curve-fitting in `modules/plot`. Real angle-proportional wedges, a donut variant, every slice named in a legend regardless of whether it's also wide enough for an inline percentage. `--misdeclare` probe, e2e tests.

Together these resolve the gap [docs/selection/SELECTION.md](docs/selection/SELECTION.md) used to state plainly: "when the request wants a chart, this repertoire does not have one." It does now, split honestly across the preset/module boundary by what each chart shape actually needs.

## Chart/CLI usability, from the terza-reasoned priority pass — all three shipped

Decided via a full terza reasoning session (prelude → G/C/S loop → coda, confidence 0.92) — see the session transcript for the full derivation. Order mattered here: each shipped and was verified by the full suite in isolation, never bundled, so a regression would be traceable to the change that caused it. All three are now done; full suite green throughout.

- [x] **Stacked / 100%-stacked bar mode** — [src/presets/chart](src/presets/chart/PRESET.md). `stacking: "stacked" | "stacked100"`, cumulative segments instead of side-by-side grouping; pure arithmetic on the existing chart preset, no new IR. Scale reference switches to the largest category *total* rather than the largest single value; per-segment value labels are dropped (the repair loop growing one to fit would inflate that segment past its true value) in favour of one total label per stack, since the legend already names every series. `series[0]` always sits closest to the axis. Two new fixtures, unit tests on the raw arithmetic, e2e proportionality tests on the rendered geometry.
- [x] **CLI `--args` comma-delimiter fix** — [src/cli.ts](src/cli.ts)'s `parseArgs` and [src/commands.ts](src/commands.ts)'s `toStringArray`. Four modules (dendrogram, circuit, genomic, topology) had independently discovered that `node src/cli.ts module`'s own `--args` flag comma-split a single occurrence, and independently invented the same `;`/`:`/`\|` workaround, each documenting it separately in its own `MODULE.md`. Fixed at the source: `--args` (and any other `string[]` param) is now repeatable — `--args a --args b` — and a repeated flag's values are taken verbatim, comma included, while a single occurrence still comma-splits exactly as before for backward compatibility. Shipped and verified alone, full suite green (358/358) both before and after; each affected module's `MODULE.md` now notes the fix without removing its own dataset-shape convention, which was never the workaround, only ever the data's own grammar.
- [x] **Line / scatter chart series** — [src/presets/chart](src/presets/chart/PRESET.md). Confirmed mid-reasoning to be *not* a cheap extension of bar charts, and it wasn't: `chartType: "line" | "scatter"` is a wholly separate function, `buildSeriesChart`, building a `Scene{layout:"absolute"}` with a point `Block` per category/series and a `Connector` joining consecutive points in `"line"` mode (bare in `"scatter"`) — the same shape `annotated-figure`/`graph` already use, since only a Scene's Connector can express "a point joined to another point". Deliberately minimal (no axis rule, no gridlines — two end labels state the scale instead, the same restraint the bar chart already states for itself). One real geometry bug found and fixed the way this project always finds them: the first render caught the leftmost category's tick label overlapping the y-axis value-label column via `boxes-do-not-overlap`, fixed by edge-aligning the first/last tick labels instead of centring every one. One known, stated limit left in the docs rather than solved: two series with near-identical values at the same category can produce a genuine partial-overlap failure — real scatter data can do this, and no marker size removes it, only narrows it. Two new fixtures, unit tests on the point arithmetic and connector counts, e2e tests on rendered geometry.

## Filed elsewhere: logic gate diagrams

Requested directly (a multi-level OR/NOR gate network). It's a **preset candidate, not a module candidate** — a feed-forward gate network is exactly the layered-DAG shape `graph` already delegates to ELK; the hard part is gate-shaped SVG symbols and pin-accurate connector endpoints, not a real external library. See [docs/research/candidate-modules.md](docs/research/candidate-modules.md), candidate #9, for the full reasoning. Belongs on the repertoire-expansion backlog (a `logic-gates` preset variant), not this module list.

## Considered and set aside (see the doc for why)

Music notation · truss/free-body diagrams with real force computation · astronomical star charts · geographic routing (fold into `modules/map` instead of a new module) · PCB layout, knitting charts, knot diagrams.

## Process reminder for whichever gets picked up

Both shipped modules ([map](modules/map/MODULE.md), [molecule](modules/molecule/MODULE.md)) found real bugs in their own first drafts *because* they declared geometry and let the core's measurement disagree with them. Build the next one the same way — declare only geometry actually computed, let `module-geometry-agrees` and friends run before assuming the first render is correct — rather than skipping straight to "it looks right."
