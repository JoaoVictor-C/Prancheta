# Figure modules

Seven figure kinds that live outside the TypeScript core, each a separate
process in Python. This page is the index; every module has its own
`MODULE.md` with the reasoning, the findings from building it, and its stated
limits.

**It was eleven.** Four rows stopped clearing the bar and were removed rather
than kept for the sake of the count: `circuit` and `topology` never cleared it
(both were stdlib-only and said so in their own documentation, which makes
them the "a bit of arithmetic in the core would do" case the bar names),
`piechart` cleared it until the Mark arrived and a wedge became something the
core can state and check, and `plot/derivative.py` drew one fixed figure
rather than a class of them. `reaction` was never a separate module at all --
it imports `molecule`'s own `render()` -- so it is an entry point of
`molecule` here rather than a row of its own. The reasoning, and what building
each of them taught, is recorded in
[docs/research/candidate-modules.md](../docs/research/candidate-modules.md).

Everything below was verified by reading each module's source and running it.

## Why a module is not a preset

The [presets](../src/presets) draw with the core's own IR, where a `Block` is
always an axis-aligned rectangle. That covers more than it sounds like — a bar
chart is arithmetic on a rectangle's height, which is why
[chart](../src/presets/chart/PRESET.md) needed no core changes at all.

A module exists where that vocabulary genuinely runs out:

- A **map** needs Shapely and pyproj *inside* its layout loop.
- A **molecule** needs RDKit's 2D coordinate generation and stereo perception.
- A **unit cell** needs ASE to build it and a depth sort to draw it.

That is the line: geometry the core cannot compute, not a stylistic preference.
[Decision 0005](../docs/decisions/0005-module-protocol.md) states it.

**A pie wedge used to be the first example on that list**, and it was a good
one until ADR 0019 gave the IR a Mark. The line moved; the module went. That is
the intended direction of travel, and a module whose reason has expired is
worth strictly less than the same figure drawn by the core, which gets the
full check set instead of this protocol's smaller one.

## The contract

**The module declares semantics. The core measures geometry.**

Semantics are not recoverable from rendered output — no measurement tells you
that a given text is the label *for* a given region rather than a title that
happens to sit nearby, and ownership is what the interesting checks need.
Geometry is knowable by measurement, and the core has the better instrument:
the browser it already trusts.

So a module may state what it drew and what each element means. It may not
certify that what it drew is correct. **Nobody certifies their own work** — the
same reason the core re-renders its own SVG in resvg rather than trusting
Chromium about Chromium.

A module reads `{"width", "height", "spec"}` as JSON on stdin and writes
`{"svg", "elements", "notes"}` as JSON on stdout. Each element declares an `id`
matching a `data-pr-id` in the SVG, a `kind` (`feature`, `label`, `connector`
or `decoration`), optionally an `owner` (for a label: the feature it names),
optionally `joins` (for a connector), and optionally a `declaredBox` — what the
module *believes* it drew. The declared box is never used as input. It is
checked against measurement, and it is the only thing that catches a module
whose internal model has drifted from its own output. The full type is
[src/modules/protocol.ts](../src/modules/protocol.ts).

The process boundary is deliberate: a live in-process bridge would make the
module's own numbers the path of least resistance again, and a segfault in a
geospatial C extension would take the core down with it.

## Running one

```bash
node src/cli.ts module python --args "modules/molecule/render.py,--name=glucose"
```

`--width`, `--height` and `--out` are accepted too. `--args` is **repeatable**,
and each occurrence is taken verbatim — that matters because a single
`--args "a,b,c"` invocation comma-joins everything at the CLI layer, which is
why several modules use `;` and `:` as their own delimiters instead of commas.

## The repertoire

| module | draws | Python dependencies |
| --- | --- | --- |
| [crystal](crystal/MODULE.md) | One conventional crystallographic unit cell, orthographic, with visible/hidden edges from real depth | `numpy`, `ase` |
| [dendrogram](dendrogram/MODULE.md) | A hierarchical-clustering dendrogram where height is real merge distance | `numpy`, `scipy` |
| [genomic](genomic/MODULE.md) | Gene arrows on a real base-pair axis; arrow direction is strand | `dna_features_viewer` |
| [map](map/MODULE.md) | Region and country maps, lon/lat projected to Web Mercator | `pyproj`, `shapely` |
| [molecule](molecule/MODULE.md) | A 2D skeletal structure from SMILES — and, through its second entry point, a whole reaction scheme | `rdkit` |
| [plot](plot/MODULE.md) | A scatter with a least-squares fit and its residuals (function curves moved to the `function-graph` preset) | `numpy` |
| [skewt](skewt/MODULE.md) | A Skew-T log-P atmospheric sounding with a lifted-parcel profile and LCL | `numpy`, `metpy` |

## Inputs, per module

Every module takes `--misdeclare` (see below) unless noted. Named shortcuts are
selected with `--name=<key>`; the **first** key listed is the default when no
selecting flag is given.

### crystal
- `--name=` `nacl_rocksalt` · `diamond_cubic` · `fcc_copper`
- No custom-structure input.

### dendrogram
- `--name=` `cluster_demo` · `species_traits`
- `--labels=a;b;c` with `--data=1:2;3:4` — `;` between rows, `:` between values.
- `--method=average` — passed straight to scipy's `linkage`.

### genomic
- `--name=` `plasmid_simple` · `operon`
- `--features=start:end:strand:label|...` — `|` between features, `:` between
  a feature's four fields.
- `--length=3000` — sequence length, used with `--features`.

### map
- `--name=` `campaign` · `europe` · `south_america`. Any other value (or none)
  renders a fixed three-region probe figure.
- `europe` and `south_america` read Natural Earth 1:110m data from
  [map/data](map/data); the probe and campaign figures use synthetic
  coordinates. Projection is EPSG:4326 → EPSG:3857.

### molecule
- `--name=` `glucose` · `fructose` · `sucrose` · `caffeine` · `aspirin` ·
  `water` · `ethanol` · `benzene`
  · `ammonia` · `boron_trifluoride`
- `--smiles=CCO` — any SMILES string. Takes priority over `--name=`.
- `--theme=print|light|dark` — `print` (white paper, near-black ink) is the
  default; `light` is the same ink on a faint tint; `dark` is the original
  palette. Contrast checks run against whichever is drawn.
- `--lone-pairs` — each atom's non-bonding pairs as pairs of dots, Lewis-dot
  style: on a SIDE of the atom (above, below, left, right; a corner only when
  the sides are taken), away from its bonds, the two dots parallel to that side
  (valence electrons − formal charge − the atom's own bonding electrons −
  radicals, halved: N in NH₃ 1, O in H₂O 2, F in BF₃ 3, B in BF₃ none, O⁻ in
  nitrate 3, S in H₂SO₄ none, S in SF₄ 1). A dative bond's donor has given the
  pair that is the bond (H₃N→Ag⁺: no pair on N); a radical electron is one dot
  (`atom-<i>-rad-<k>`). A heteroatom with pairs or a charge gets its hydrogens
  as real atoms, so F₃B–NH₃'s N⁺ is an atom, not an "NH₃⁺" group label. Each
  pair is a declared decoration `atom-<i>-lp-<k>`.
- `--dative=arrow|line` — a dative bond (`N->[Ag+]<-N`) as an arrow from donor
  to acceptor (default; shaft and filled head in one declared `<path>`) or a
  plain line. A label whose bonds all leave to the right is written H-first
  (`H₃N→Ag⁺`).
- `--resonance` — the resonance forms (RDKit's enumeration, never typed) in a
  row joined by double-headed arrows, lone pairs and charges per form, one set
  of 2D coordinates for all (only bonds, charges and pairs move); at most four
  forms, and the notes say how many there are. `--name=` `nitrate` ·
  `carbonate` · `acetate` · `ozone`, or any `--smiles=`.
- `--answers=true|false` — `false` hides lone pairs, radical dots and formal
  charges and keeps the skeleton (the statement of a "draw the Lewis structure"
  exercise; the solution is the default). With `--resonance`, the structure as
  written alone.
- The canvas is trimmed to the drawing: `--width`/`--height` are a maximum the
  structure is scaled down to fit, never a minimum. Charges are superscripts
  with a real minus sign, H counts subscripts.

### plot
- `fit.py --name=` `linear_fit_demo` · `quadratic_fit_demo`
- `fit.py --points=1,2;3,4 --fit=linear|quadratic` — `;` between points, `,`
  inside one.
- Function curves (`--functions=`, and the old `quadratic`, `sine_cosine`,
  `damped_oscillation` shortcuts) are refused with a pointer to the
  `function-graph` preset, which now owns them (ADR 0025).

### molecule, second entry point: `reaction/render.py`
- `--name=` `glucose_combustion` · `photosynthesis` · `combustion_methane` ·
  `esterification`
- `--reaction=CCO.O>>CC=O` — SMILES, `.` between components, `>>` between
  sides.
- `--conditions=heat, H2SO4` — free text, used with `--reaction=`.
- Acid–base names: `arrhenius_hcl` (HCl + H₂O → H₃O⁺ + Cl⁻), `bronsted_nh3`
  (NH₃ + H₂O ⇌ NH₄⁺ + OH⁻, equilibrium, display forms), `lewis_bf3_nh3`
  (BF₃ + NH₃ → F₃B–NH₃, lone pairs, the N-pair→B curved arrow),
  `bronsted_hcl_h2o` and `bronsted_nh3_h2o` (a lone pair onto the H across the
  plus sign, the H–X bond onto X), `complex_silver_ammonia`
  (Ag⁺ + 2NH₃ → [Ag(NH₃)₂]⁺).
- `--arrows=lp:2>1;bond:2-3>3` — curved electron-pushing arrows on the
  reactant side, `;` between arrows, each `SOURCE>TARGET`. SOURCE is
  `lp:ATOM` (a lone pair) or `bond:ATOM-ATOM`; TARGET is `ATOM` or
  `bond:ATOM-ATOM`. ATOM is an atom-map number from the reaction SMILES
  (`F[B:1](F)F.[NH3:2]>>...`; maps only address atoms, formulas ignore them)
  or `Sym@C`, the only `Sym` atom of reactant component C (1-based). **Verified**,
  or refused naming the arrow: the source pair exists (the lone-pair count
  above, dative bonds included) and no atom gives more pairs than it has, a
  source bond exists, the target can take a pair (a bonded H, a cation, a metal,
  an atom short of an octet such as B in BF₃, or an atom of the breaking source
  bond), a target bond exists and touches the source. Turns on `--lone-pairs`.
  Each arrow is a smooth cubic from just outside the pair's dots (or the bond's
  middle) to just short of the target's label, bent to whichever side keeps it
  off other ink, with a filled head (two electrons); tiles are turned (and,
  without wedges, mirrored) so the two ends face each other. Declared as
  `e-arrow-<k>` (a `<g>`, box = curve's true extent ∪ head) and
  `e-arrow-<k>-curve` (the `<path>` itself, so `module-labels-clear-of-strokes`
  tests every label against it). Mechanism sense is not checked.
- `--display=` accepts brackets for a coordination entity (`[Ag(NH3)2]+`),
  and the automatic writer produces one for a complex with dative bonds.
- `--dative=arrow|line` — as for `molecule`.
- `--display=NH3;H2O>>NH4+;OH-` — the textbook written form of each component,
  `;` between components and `>>` between sides, mirroring the SMILES (one per
  component in order, or one per distinct component; a component may be left
  empty to keep the computed form). **Checked against what RDKit computed**:
  the same element counts (hydrogens included) and the same net charge, or the
  run is refused with an error naming both. Accepted: a trailing charge (`+`,
  `2-`, `3+`, `SO42-`, `SO4 2-`, `SO4^2-`, `Ca+2`), Unicode sub/superscripts
  (`NH₄⁺`), groups `Al(OH)3`, `–`/`-` as a bond and `·` as an adduct dot
  (`CuSO4·5H2O`), which are ignored for counting. A coefficient is not written
  here (repeat the component in `--reaction=`). Without it a conventional
  automatic form is written: IUPAC element order for carbon-free species, H
  first for oxoacids (HNO₃, H₂SO₄), OH⁻, and a donor–acceptor adduct as
  F₃B–NH₃; everything else in Hill order. Digits are typeset as subscripts and
  charges as superscripts (`−` is U+2212).
- `--equilibrium` — ⇌ (two half-arrows) instead of →.
- `--states=g;l>>aq;aq` — state symbols after each formula, `(g)`, in a smaller
  size; the layout of `--display`, empty = none, closed set `s`, `l`, `g`, `aq`.
- `--coefficients=1;3>>2` — stoichiometric coefficients, one per component
  (`3 H₂`, and `3x` over the structure); do not also repeat the component in
  `--reaction=`. With it, or with `--balanced` (the repetitions count as
  coefficients), the equation is **checked to balance** in atoms and charge and
  refused naming the element or charge that differs; otherwise balance is only
  reported in the notes. Named: `haber_process`, `ammonia_sulfate`.
- `--answers=true|false` — `false` draws the statement: reactants, arrow and
  conditions with a `?` where the products are, no product tile, the same canvas
  and reactant positions as the solution; the curved arrows stay (they start at
  the reactants). Default `true`.
- Every tile is drawn at one atom-label size (18) and one dot size, a bare ion
  included.
- `--lone-pairs`, `--theme=` — as for `molecule`. The canvas is trimmed to the
  equation and the structures.

### skewt
- `--name=` `midlatitude_summer` · `unstable_afternoon`
- No custom-sounding input.

## What the core checks

Eight checks, in [src/modules/verify.ts](../src/modules/verify.ts). Each reports
`pass`, `fail`, or **`not-applicable`** -- a real third state, never a polite
pass. A check that examined zero elements has verified nothing, and reporting
that as a pass would read as coverage.

| check | what it asks | reported not-applicable when |
| --- | --- | --- |
| `module-ids-resolve` | Does every declared id exist in the SVG? | never -- it is always pass or fail |
| `module-geometry-agrees` | Does each `declaredBox` match what was measured? | no element declared a box |
| `module-label-within-feature` | Does each owned label sit inside its feature's fill? | no label declares an `owner` |
| `module-labels-do-not-collide` | Do any two labels overlap? | no label resolved to a measured box |
| `module-labels-clear-of-strokes` | Does a label sit on a stroke that is not its owner's? | no labels were declared at all |
| `module-feature-on-its-stroke` | Does an element that claims to lie ON a drawn stroke actually lie on it? | nothing declared an `on` relation |
| `module-contrast-sufficient` | Can a reader make out each label against what is painted under it? | no label sits over a surface the module drew |
| `content-within-canvas` | Is everything inside the canvas? | no element resolved a box |

`content-within-canvas` deliberately keeps its core name: same method, same
meaning in both worlds. The others are named apart because the method genuinely
differs -- a foreign SVG has no content boxes and no wrapped line boxes, so a
check called `text-fits-box` would promise something it cannot deliver.

Geometry agreement is not exact. The tolerance is
`max(1, 0.02 * max(width, height))` -- relative, with an absolute floor.

### The one check here that is about meaning

`module-feature-on-its-stroke` is different in kind from the rest of this
table, and it is the only place this protocol reaches past the limit stated at
the bottom of this page. Everything else asks whether the figure is well
formed. This asks whether a relation the module **asserted about its own
arithmetic** survives being measured on the drawing.

A module states it with `on`, a list of ids the element claims to lie on:

```json
{ "id": "root-0-1", "kind": "feature", "on": ["curve-0", "axis-x"] }
```

The instrument is the browser's `isPointInStroke` against the real stroke
width -- the same call `module-labels-clear-of-strokes` already makes, with its
sense inverted, so nothing new is measured. What changes is which answer counts
as a failure.

**State the conjunction, not half of it.** A root is on the curve *and* on the
x axis. Declare only the first and a module whose root-finder is wrong, but
which then plots the marker by evaluating its own curve at that wrong x, sits
exactly on the curve and passes. Declare only the second and a marker at
(x_wrong, 0) passes the axis test. Both together have no hiding place. Roots
now live in the core's `function-graph` preset, which declares both and checks
them with `feature-on-its-curve`; `modules/plot` makes the same kind of claim
about a fit -- each fitted value lies on the fit curve *and* at the end of its
own residual.

What it still cannot reach: a relation nobody states is never checked, and a
figure whose every stated relation holds can still misrepresent its data.

### Contrast, and a known gap

`module-contrast-sufficient` composites, in paint order, every filled shape
drawn **under** a label -- measured from the SVG rather than from the manifest,
because an undeclared background rect covers a label exactly as thoroughly as a
declared one. Only surfaces painted *before* the label count; a shape drawn
over it is occlusion, which is a different problem and a different check. Where
no opaque ground is reached, the check reports not-applicable rather than
inventing a ratio against an assumed white.

Adding it found two real defects that had been passing every other check:
`genomic` drew a gene's label in its own colour directly on a neighbouring
gene's fill at 1.04:1, and `map` set every territory name in near-black
regardless of whether the territory beneath it was pale sand or deep navy.

**The known gap, recorded rather than quietly left:**
`module-labels-clear-of-strokes` skips any declared element that resolves to a
`<g>` rather than a drawable -- which is how both `map` and `reaction` declare
their arrows, since one id has to name a shaft and a head together. Descending
into the group surfaces two real collisions and two artefacts of sampling a
glyph box's empty corners; separating them needs a sampling policy for strokes
and a reroute in the map's arrow data, and that is its own change.
`module-feature-on-its-stroke` is new and has no legacy behaviour to preserve,
so it does descend.

## The `--misdeclare` probe

Every module accepts `--misdeclare`, which plants
deliberate defects in the *declaration* while drawing the figure correctly:
typically a phantom element that was never drawn, plus one real element's
`declaredBox` shifted by 20–60px.

This is how the verifier is tested rather than assumed. A checker that reports
everything as fine is indistinguishable from a checker that is not running, and
`--misdeclare` is the difference: it must make `module-ids-resolve` and
`module-geometry-agrees` fail. Each module's e2e test asserts exactly that.
`modules/plot` plants a third defect that is a lie about *meaning* rather than
form -- a fitted value moved off the curve and the residual it still claims to
lie on, leaving a figure that is not malformed in any way -- and asserts that
`module-feature-on-its-stroke` names both broken halves.

**The protocol's own self-test needs none of this.** Running it used to require
a module, and therefore whichever scientific Python that module imports. It now
also lives as a checked-in SVG-and-manifest pair in
[tests/fixtures](../tests/fixtures), driven by
`tests/module-protocol-selftest.test.ts`: no subprocess, no dependencies, and
it runs in the core suite rather than the module one. That is what made
deleting four modules a change to the repertoire rather than a hole in the
protocol's own coverage.

## What is never checked

**Malformation, not misrepresentation** -- with one narrow exception, named
above. This is the stated limit of every module here, and it is worth being
blunt about: a fit computed on a dataset too small to mean anything passes
every check; a map with the wrong country shaded passes every check; a sounding
whose numbers were transcribed wrongly passes every check.

`module-feature-on-its-stroke` narrows that gap without closing it. It can
refuse a claim the module *made* and the drawing refutes. It cannot refuse a
claim nobody made, and it says nothing about whether the underlying data means
what the figure implies.

Nothing here verifies that a figure is *true*. It verifies that what the module
declared is what the module actually drew, and that the result is not
geometrically malformed. Semantic correctness needs a model in the loop and is
worth nothing while labels still overflow their boxes.

## Writing a new module

1. Read `{"width", "height", "spec"}` from stdin as JSON; write
   `{"svg", "elements", "notes"}` to stdout. Exit non-zero with a message on
   stderr to fail.
2. Give every element a `data-pr-id` in the SVG and declare it in `elements`.
3. Declare `declaredBox` from geometry you actually computed — sample the path
   if you must. Do not derive it algebraically from the parameters you *meant*
   to draw with; that is the drift the check exists to catch, and it will agree
   with itself perfectly while being wrong.
4. Only set `owner` on a label whose owner is a filled shape.
5. If the figure contains a computed relation between two things you draw -- a
   marker on a curve, a point where two traces meet -- declare it with `on`,
   and declare the whole conjunction rather than half of it.
6. Implement `--misdeclare`, and write an e2e test asserting it fails the
   checks it should.
7. Write a `MODULE.md` saying why the core cannot do this, what building it
   found, and what it does not attempt.

[docs/research/candidate-modules.md](../docs/research/candidate-modules.md) has
the survey the current repertoire was drawn from.
