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
