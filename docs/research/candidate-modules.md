# Candidate figure modules

Research only — nothing here is implemented. [decision 0005](../decisions/0005-module-protocol.md) gave the project a second dimension of repertoire beyond the four core presets: a figure module is a separate process, in whatever language has the real domain library, that computes geometry the browser/ELK core categorically cannot. Two exist today — [map](../../modules/map/MODULE.md) (Shapely/pyproj: projection, point-in-polygon) and [molecule](../../modules/molecule/MODULE.md) (RDKit: 2D depiction, stereo perception) — plus one bespoke pedagogical figure, [plot/derivative.py](../../modules/plot/derivative.py), which is not a general module (it draws one fixed figure, not a class of them).

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

**This one is different in kind from every other entry on this list, and worth stating plainly: it does not clear bar 1.** A multi-level combinational network with no feedback is exactly a layered DAG, which is precisely what [graph](../../src/presets/graph/PRESET.md) already delegates to ELK for. There is no real external library computing geometry a TypeScript reimplementation isn't worth writing — the hard part is symbol vocabulary (drawing an OR gate's curved body, a NAND's bubble), which is rendering work, not domain computation. That makes this a **preset candidate, not a module candidate**: a `logic-gates` variant that reuses `graph`'s existing ELK-layered-DAG pipeline but swaps rectangular nodes for gate-shaped SVG paths, the same relationship [modules/circuit](../../modules/circuit/MODULE.md) has to `graph` one level down — except circuit's single-loop topology doesn't fit ELK's layered algorithm, so it earned a full module, while a logic network's feed-forward-only shape is exactly what that algorithm is for.

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

## What every candidate above shares

Every "what's genuinely hard" note above is a **geometry** claim, never a **correctness-of-content** claim — matching the limit decision 0005 states plainly for the two shipped modules: checked for **malformation, not misrepresentation**. A reaction scheme module can honestly declare and correctly draw a chemically impossible reaction; a plot module can correctly render a regression fit fitted to garbage data. Nothing above changes that boundary, and nothing should be built expecting it to.
