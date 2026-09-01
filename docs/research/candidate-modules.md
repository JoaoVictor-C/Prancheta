# Candidate figure modules

Research only — nothing here is implemented. [decision 0005](../decisions/0005-module-protocol.md) gave the project a second dimension of repertoire beyond the four core presets: a figure module is a separate process, in whatever language has the real domain library, that computes geometry the browser/ELK core categorically cannot. Two existed when this was written — [map](../../modules/map/MODULE.md) (Shapely/pyproj: projection, point-in-polygon) and [molecule](../../modules/molecule/MODULE.md) (RDKit: 2D depiction, stereo perception) — plus one bespoke pedagogical figure, plot/derivative.py, which is not a general module (it draws one fixed figure, not a class of them).

This is the search for what belongs on that list next. The bar for a candidate is three things, all required:

1. **A real library computes geometry no TypeScript reimplementation is worth writing** — the same test that put maps and molecules on the far side of the process boundary in the first place. If ELK or a bit of arithmetic in the core would do, it isn't a module candidate, it's a preset or a fixture.
2. **The output decomposes into features, labels and decorations** the way decision 0005's protocol expects, with at least one check that would catch a *real* mistake a module author could plausibly make — not a check for its own sake. Both shipped modules found actual bugs in their own first drafts this way; a candidate that can't name its equivalent bug is not yet a strong candidate.
3. **It's a class of figures, not one figure.** `plot/derivative.py` is deliberately not on this list's model — it draws exactly one pedagogical picture. A module earns the name by taking a real input (a formula, a sequence, a molecule, a dataset) and rendering *any* instance of its class.

Ranked by how strongly each clears bar 1 — the harder the geometry is to fake, the more the module boundary is actually earning its keep — with a note on what bar 2's check would be, since that is the detail that turns a rendering script into a Prancheta module rather than a wrapper around one.

---

## Strong candidates

### 1. Reaction schemes (extends `molecule`)

Reactants, an arrow, reagents written over/under it, products — the figure a chemistry textbook draws for *any* reaction, not just respiration. **Not** a new library: it composes N calls into the existing molecule-rendering logic and adds the arrow-and-conditions layer, using RDKit's `rdChemReactions` to parse a reaction SMILES (`A.B>>C.D`) and reuse the exact per-molecule geometry `molecule` already computes and declares.

**What's genuinely hard:** laying out several independently-sized molecule sub-figures in a row without collision, and placing reagent/condition text on the arrow without it colliding with either neighbour — a packing problem, not a chemistry problem, but one the core's flow layout doesn't reach because each molecule's true footprint isn't known until RDKit has drawn it.

**The check with teeth:** a `module-labels-do-not-collide`-style check across reagent text and the nearest molecule's bonds — cheap to get wrong when conditions text is long (e.g. "H₂SO₄, Δ, 80°C") and the arrow is short.

**Priority: high.** Smallest gap from what already exists; reuses `molecule`'s hard-won geometry lessons directly rather than re-deriving them.

### 2. Phylogenetic trees / dendrograms with real branch lengths

A tree where branch *length* is data — evolutionary distance, cluster dissimilarity — not just topology. This is the one tree shape [mindmap](../../src/presets/mindmap/PRESET.md) cannot legitimately serve: mindmap's whole value is a radial layout keyed to depth, and depth is not distance. Computed via `scipy.cluster.hierarchy` (a linkage matrix from any distance metric) or `Bio.Phylo` (real phylogenetic trees from Newick files).

**What's genuinely hard:** placing every leaf and internal node so that the horizontal (or radial) position is a faithful, checkable function of the cophenetic distance the algorithm computed — this is exactly the "module's internal model may have drifted from what it drew" case decision 0005 was written for.

**The check with teeth:** `module-geometry-agrees` on internal-node x-positions against the linkage matrix's own merge heights — would have caught, in the molecule module's own history, the exact class of bug the dashed-wedge tip was (a declared position the render code didn't actually honour).

**Priority: high.** Real scientific/analytical use (dendrograms are a standard result artifact, not a novelty), and the distance-is-data property is a genuinely new capability, not a style variant of mindmap.

### 3. General function & data plots

`plot/derivative.py` draws one hand-placed figure. A real plot module takes a spec — one or more functions, or a dataset, axis ranges, optionally a fit — and renders *any* instance: multiple series, a regression line with a confidence band (`statsmodels`/`scipy`), a shaded integral, root/extremum markers computed rather than eyeballed.

**What's genuinely hard:** correct-by-construction axis scaling and tick placement for an *arbitrary* domain/range (the derivative module hand-tuned `X_MIN..Y_MAX` for one function), and numerically finding the features worth annotating — roots, extrema, intersections — rather than a human picking `PX, QX` by eye.

**The check with teeth:** declared points (roots, extrema, intersections) checked against where the drawn curve path actually crosses that y-value — catches a solver/render mismatch, which is a real and easy bug (off-by-one in the sampling grid, a stale cached fit).

**Priority: high.** The most broadly useful single item on this list — "plot this function" or "chart this data with a trend line" is an extremely common request, and today it has nowhere to go in the repertoire except a hand-authored one-off.

### 4. Circuit schematics

Resistors, capacitors, sources, ground symbols, wires — drawn with the symbol vocabulary an electrical engineer actually expects, via `schemdraw` (Python) rather than boxes-and-lines. A circuit is a graph, but [graph](../../src/presets/graph/PRESET.md)'s ELK-routed rectangles cannot draw a resistor zigzag or a correctly-oriented diode, and pretending a labelled box is a component is the exact "flowchart because a flowchart is available" failure this project's selection core exists to refuse — just one level down, inside a single figure class rather than across the repertoire.

**What's genuinely hard:** grid-snapped wire routing that actually reaches every component terminal (an unrouted or dangling wire is a real, embarrassing defect) and symbol orientation (a diode drawn backwards changes the schematic's meaning).

**The check with teeth:** every wire endpoint declared and checked for coincidence with a component terminal position — a connectivity check with an obvious, checkable failure mode (a wire that stops short).

**Priority: medium-high.** Clear demand (agents get asked for circuit diagrams often), clean library fit, but schematic symbol conventions are a deeper rabbit hole than the other candidates before the first version is credible.

### 5. Genomic / sequence feature diagrams

Gene arrows on a linear or circular sequence axis — a plasmid map, a locus diagram, a read-alignment track — where an arrow's direction must encode strand and its position must be a faithful, checkable function of base-pair coordinates. `dna_features_viewer` or `Bio.SeqFeature` do the coordinate/packing math (overlapping features stack into rows without collision — genuinely a packing problem, not a drawing one).

**What's genuinely hard:** multi-row feature packing when annotations overlap in sequence coordinates, and keeping every feature's canvas x faithful to its declared bp range at arbitrary zoom.

**The check with teeth:** `module-geometry-agrees` between a feature's declared bp-derived box and its measured one — directly reuses the map module's own "declared vs measured" reasoning, coordinate axis substituted for a projected one.

**Priority: medium.** Narrower audience than the top three, but a clean, well-precedented library fit (this is what `dna_features_viewer` exists to do) and a real gap — nothing in the current repertoire has an axis that means base pairs.

---

## Worth having, narrower audience

### 6. Protein secondary-structure topology cartoons

The 2D "ribbon diagram" schematic — helices as cylinders/coils, sheets as arrows, connected in sequence order — computed from real secondary-structure assignment (`DSSP` output via Biopython, or a PDB's own `HELIX`/`SHEET` records), not a 3D rendering. Extends the molecule module's chemistry-into-biology direction one level up in scale.

**What's genuinely hard:** topology-diagram layout (each secondary-structure element placed so connecting loops don't cross unreadably) is its own small literature, closer to the mindmap/graph layout problem than to molecule's coordinate generation — likely reuses ELK for the connector routing once element positions are chosen.

**Priority: medium.** Real value for structural biology explanation, but the layout problem is harder than it looks and the audience is narrower than function plots or reaction schemes.

### 7. Meteorological thermodynamic diagrams (Skew-T log-P)

The genuinely skewed coordinate system — temperature isotherms drawn at 45°, pressure on a log-scaled vertical axis — that `MetPy` computes and that no other candidate on this list needs. A real sounding (temperature/dewpoint/wind profile vs pressure) plotted on it.

**What's genuinely hard:** the skewed-axis transform itself has to be right for *every* drawn element (isotherms, the sounding trace, wind barbs), which is a lot of surface area for one coordinate system to get consistently wrong.

**Priority: low-medium.** Narrow domain (meteorology specifically), but if any request needs it, nothing else in the repertoire comes close, and the "real coordinate transform, checked everywhere it's used" shape is a stronger fit for this project's thesis than most general-purpose chart types.

### 8. Crystallographic / lattice diagrams

Unit cells, lattice planes (Miller indices), packing diagrams — via `pymatgen` or `ASE` for the real crystallographic math, projected to 2D.

**What's genuinely hard:** the 3D→2D projection has to preserve which atoms/planes are actually behind others (a wrong occlusion order is a wrong diagram, not just an ugly one) — this brushes against the "photorealism / 3D" non-goal in [README.md](../../README.md) and would need to stay strictly schematic (wireframe/occlusion, not shaded rendering) to stay in scope.

**Priority: low.** Real gap, but narrowest audience here and the closest to the project's stated non-goals; worth a small design conversation before committing rather than an obvious yes.

### 9. Digital logic circuit diagrams

Suggested directly by a user request showing a multi-level gate network (a handful of OR/NOR gates feeding into each other, the exact shape a digital-logic textbook draws). Real gate symbols — the curved AND/OR body, the NOT/NAND/NOR bubble, XOR's double curve — laid out across logic levels so signals flow left to right without a wire crossing back on itself.

**This one is different in kind from every other entry on this list, and worth stating plainly: it does not clear bar 1.** A multi-level combinational network with no feedback is exactly a layered DAG, which is precisely what [graph](../../src/presets/graph/PRESET.md) already delegates to ELK for. There is no real external library computing geometry a TypeScript reimplementation isn't worth writing — the hard part is symbol vocabulary (drawing an OR gate's curved body, a NAND's bubble), which is rendering work, not domain computation. That makes this a **preset candidate, not a module candidate**: a `logic-gates` variant that reuses `graph`'s existing ELK-layered-DAG pipeline but swaps rectangular nodes for gate-shaped SVG paths, the same relationship modules/circuit has to `graph` one level down — except circuit's single-loop topology doesn't fit ELK's layered algorithm, so it earned a full module, while a logic network's feed-forward-only shape is exactly what that algorithm is for.

**What's genuinely hard:** ELK's layered algorithm minimises crossings for boxes; a gate's actual input/output terminal points are not the box's own bounding-box edges, so the connector endpoints ELK computes need translating to each gate symbol's real pin positions (an AND gate's two inputs on the flat left edge, its one output at the point) — a geometry-adaptation problem, not a values-adaptation one.

**The check with teeth:** this would run under the CORE's checks (`connector-clear-of-boxes`, `content-within-canvas`), not decision 0005's module protocol at all, since nothing here needs a subprocess — the interesting failure mode is a connector routed into empty space next to a gate's curved body rather than its actual pin.

**Priority: medium**, filed here rather than promoted to a TODO item, precisely because it belongs to a different backlog (preset work, under M2's repertoire-expansion thread) than the module search this document otherwise tracks.

---

## Considered and set aside

- **Music notation** (`music21`, pitch-to-staff-position, rhythm-to-horizontal-spacing) — genuinely clears bar 1 and bar 2, but engraving-quality spacing rules are a large, separate literature (this is what dedicated engraving engines exist to get right), and a half-engraved score reads as more broken than a half-laid-out diagram does. Worth reconsidering once the module protocol has more mileage, not a near-term candidate.
- **Truss / free-body engineering diagrams** with real force computation (`anastruct`/`PyNite`) — the most interesting *check* on this whole list (declared arrow magnitudes checked against static equilibrium, sum of forces ≈ 0 — a physical-consistency check, not just a geometric one) but a narrow, specialist audience relative to the effort of a real structural-analysis dependency.
- **Astronomical star charts / orbital diagrams** (`astropy`) — clears bar 1 cleanly (real celestial coordinate transforms) but the audience is the narrowest on this list; revisit if a request pattern actually shows up.
- **Geographic route/transit diagrams with real routing** (`osmnx` + a road/transit network) — this is an *extension* of the existing map module (real routing rather than static regions) rather than a new one; folding it into `modules/map` when it's needed is more honest than standing up a third geography module.
- **PCB layout, knitting charts, knot diagrams** — real domain math exists for all three, but none has a request pattern in evidence; listed here so a future search doesn't waste time re-discovering and re-rejecting them without a reason on record.

---

## Built, then removed

Four of the candidates above were built and later deleted, and one turned out
never to have been a separate module at all. None of them was broken -- every
one passed its own e2e tests on the day it was removed. They were removed
because they stopped clearing **bar 1**, which is the only bar that decides
whether something belongs on the far side of the process boundary.

Recorded here rather than left to the git log, because the git log does not say
*why*, and because two of these are lessons worth not paying for twice.

### `piechart` -- the bar moved under it

The strongest of the four, and the only one whose reason was genuinely good
when it was written. Its `MODULE.md` argued: "A pie wedge is not a rectangle
under any transform; drawing one needs an actual circular-sector path, which
the core's box-model pipeline has no way to measure, check, or repair." True --
until [ADR 0019](../decisions/0019-derived-geometry-and-annotation.md) gave the
IR a **Mark**, which is a start point and a run of line and arc segments,
flattened at layout time into the polyline every check walks. That is a sector.

A pie is now `chartType: "pie" | "donut"` in
[the chart preset](../../src/presets/chart/PRESET.md), and moving it in was a
strict gain in checking rather than a lateral move: the slices' shares are
verified by `sweep-matches-its-label` against the arcs actually drawn, and the
labels additionally get `text-fits-box`, `contrast-sufficient` and
`annotation-nearest-its-owner`, none of which the module protocol can offer.

**Worth keeping:** three separate documents were still asserting the removed
limitation on the day it was removed -- the chart preset's own `PRESET.md`,
`SELECTION.md`, and the module's `MODULE.md`. A capability boundary is stated
in more places than the one that changes, and a stale boundary reads exactly
like a current one.

### `circuit` and `topology` -- they never cleared it

Both were stdlib-only, and both said so in their own documentation.
`circuit/MODULE.md`: "This module depends on no schematic-CAD library. Every
coordinate on every symbol and every wire is computed here."
`topology/MODULE.md`: "No real structure file is read."

That is precisely the case bar 1 excludes -- "if ELK or a bit of arithmetic in
the core would do, it isn't a module candidate, it's a preset or a fixture" --
and this document had already reached the right answer once, for candidate 9
(digital logic gates), which was refused on the ground that "the hard part is
symbol vocabulary, which is rendering work, not domain computation". Circuit is
that same argument, accepted rather than refused. The inconsistency only became
visible once the Mark removed the excuse.

Neither was ported before deletion, and that was a decision rather than an
oversight. `SELECTION.md` already licenses it: "A request the repertoire cannot
serve is information, not an error." Post-Mark, either figure is authorable as
raw IR the day somebody asks for one. What separates them from the pie is
evidence of demand: the chart preset anticipated the pie request in writing,
and nothing anywhere anticipated a request for a series circuit or a
Rossmann-fold cartoon. **If real demand for circuit diagrams shows up, the
answer is to port it, not to restore the module.**

**Worth keeping, from `circuit`:** its symbols lived in a shared
`symbols_electrical.py`, and the valuable part was never the paths -- anyone
can draw a zigzag -- but the **measured** vertical offsets. An inductor's bumps
rise only above the placement line and a switch's lever rises further above
centre than its terminal circles extend below it, so declaring every symbol
symmetric was wrong for exactly those two, and `module-geometry-agrees` caught
it. A battery's declared height also included `+4` for its thicker line's
stroke width, which is wrong because `getBoundingClientRect` returns the
geometric extent of the path data and adds no stroke padding -- the same
mistake `molecule` had already made once. Anyone drawing electrical symbols
again should measure a bare probe of the actual markup rather than reasoning
about it.

**If `topology` is ever wanted back**, the honest route is not a port but a
re-founding on the input this document originally proposed: a real `.pdb`
file's `HELIX`/`SHEET` records, which are fixed-column and parseable without
the external `mkdssp` binary. That version would clear bar 1 on the strength of
reading a real structure, which the deleted one never did.

### `plot/derivative.py` -- one figure, not a class of them

Failed **bar 3** in this document's own words, and was named here as the
counter-example when the bar was written: "it draws exactly one pedagogical
picture". It took no flags at all, not even `--misdeclare`, and had no e2e
test. By the time it was removed the core shipped the same pedagogy in
`experiments/derivative/`, authored in real IR and animated across five states
-- something the Python version could not do at all.

### `reaction` -- never a second module

It imports `modules/molecule`'s own `render()` and computes no chemistry of its
own; what it adds is the packing problem of arranging several
independently-sized molecule drawings in a row. That is a real problem and a
real reason for the code to exist, but not a reason for a second row in the
repertoire. It is now `molecule`'s second entry point, the shape `plot` already
had.

## What the removals cost, and what paid for it

The three stdlib-only modules were the only ones whose e2e tests needed no
scientific Python, so deleting them would have made the module protocol's own
`--misdeclare` coverage depend entirely on rdkit, ase, scipy, metpy, pyproj and
dna_features_viewer being installed. That was the sharpest argument against
deleting them, and it is an argument about where a test lives rather than about
whether a module should exist.

So the planted-defect self-test moved first, into
`tests/module-protocol-selftest.test.ts` with a checked-in SVG and manifest
pair -- no subprocess, no dependencies, and in the core suite rather than the
module one. Only then were the modules removed.

## The bar, restated after all this

Bar 1 decides whether a module should exist: does a real library compute
content no TypeScript reimplementation is worth writing. That is the test, and
the four removals above are all failures of it.

A second question, independent of the first, decides how much a module that
*does* exist is worth: **can it state a relation between two things it drew
that the core can falsify by measuring the drawing?** A root is on its curve
and on the x axis; an LCL is where two traces meet; a merge crossbar spans both
of its children. That is what `on` and `module-feature-on-its-stroke` are for,
and it is the only place this protocol reaches past malformation into meaning.

The two are genuinely independent, and it is worth being explicit about that
because collapsing them gives the wrong answer at both ends. `piechart` could
state a falsifiable relation and still failed bar 1. `map` clears bar 1 easily
and can state nothing falsifiable about the projection that is its whole reason
for existing -- a wrong Mercator draws a perfectly self-consistent wrong map.
So the first question decides the table; the second decides how well the
survivors are checked, and is where the remaining work is.

## What every candidate above shares

Every "what's genuinely hard" note above is a **geometry** claim, never a **correctness-of-content** claim — matching the limit decision 0005 states plainly for the two shipped modules: checked for **malformation, not misrepresentation**. A reaction scheme module can honestly declare and correctly draw a chemically impossible reaction; a plot module can correctly render a regression fit fitted to garbage data. Nothing above changes that boundary, and nothing should be built expecting it to.
