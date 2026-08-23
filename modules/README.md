# Figure modules

Eleven figure kinds that live outside the TypeScript core, each a separate
process in Python. This page is the index; every module has its own
`MODULE.md` with the reasoning, the findings from building it, and its stated
limits.

Everything below was verified by reading each module's source and running it.

## Why a module is not a preset

The [presets](../src/presets) draw with the core's own IR, where a `Block` is
always an axis-aligned rectangle. That covers more than it sounds like — a bar
chart is arithmetic on a rectangle's height, which is why
[chart](../src/presets/chart/PRESET.md) needed no core changes at all.

A module exists where that vocabulary genuinely runs out:

- A **pie wedge** is not a rectangle under any transform. It needs a real
  circular-sector path.
- A **map** needs Shapely and pyproj *inside* its layout loop.
- A **molecule** needs RDKit's 2D coordinate generation and stereo perception.

That is the line: geometry the core cannot compute, not a stylistic preference.
[Decision 0005](../docs/decisions/0005-module-protocol.md) states it.

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
node src/cli.ts module python --args "modules/circuit/render.py,--name=rlc_series"
```

`--width`, `--height` and `--out` are accepted too. `--args` is **repeatable**,
and each occurrence is taken verbatim — that matters because a single
`--args "a,b,c"` invocation comma-joins everything at the CLI layer, which is
why several modules use `;` and `:` as their own delimiters instead of commas.

## Shared leaf symbols

Most modules are self-contained on purpose — the process boundary exists
precisely so no module's numbers become the path of least resistance for
another (see [decision 0005](../docs/decisions/0005-module-protocol.md)). The
one exception is a **leaf symbol with no dependency on its caller's layout**:
[`symbols_electrical.py`](symbols_electrical.py) holds `circuit`'s resistor,
capacitor, inductor, switch, diode and battery — each a pure function of a
centre point, each returning `(svg, width, height, y_offset)`, the same
`declaredBox` claim any module makes, checked the same way. A module that
needs one imports it (`sys.path.insert(0, str(Path(__file__).resolve().parent.parent))`
then `from symbols_electrical import ...`) rather than rediscovering the same
measured-not-guessed asymmetric boxes.

## The repertoire

| module | draws | Python dependencies |
| --- | --- | --- |
| [circuit](circuit/MODULE.md) | A single-loop series circuit with real EE symbols — resistor zigzag, capacitor plates, inductor bumps, switch gap, diode triangle | none (stdlib) |
| [crystal](crystal/MODULE.md) | One conventional crystallographic unit cell, orthographic, with visible/hidden edges from real depth | `numpy`, `ase` |
| [dendrogram](dendrogram/MODULE.md) | A hierarchical-clustering dendrogram where height is real merge distance | `numpy`, `scipy` |
| [genomic](genomic/MODULE.md) | Gene arrows on a real base-pair axis; arrow direction is strand | `dna_features_viewer` |
| [map](map/MODULE.md) | Region and country maps, lon/lat projected to Web Mercator | `pyproj`, `shapely` |
| [molecule](molecule/MODULE.md) | A 2D skeletal chemical structure from a SMILES string | `rdkit` |
| [piechart](piechart/MODULE.md) | Pie and donut charts as real circular-sector paths | none (stdlib) |
| [plot](plot/MODULE.md) | Function curves with roots and extrema, or a scatter with a least-squares fit; plus a fixed derivative explainer | `numpy` (fit mode only) |
| [reaction](reaction/MODULE.md) | A reaction scheme: an equation row, and a structural drawing of every participant | `rdkit` (and calls `molecule`) |
| [skewt](skewt/MODULE.md) | A Skew-T log-P atmospheric sounding with a lifted-parcel profile and LCL | `numpy`, `metpy` |
| [topology](topology/MODULE.md) | A protein secondary-structure cartoon — helices as capsules, strands as arrows | none (stdlib) |

## Inputs, per module

Every module takes `--misdeclare` (see below) unless noted. Named shortcuts are
selected with `--name=<key>`; the **first** key listed is the default when no
selecting flag is given.

### circuit
- `--name=` `rc_lowpass` · `led_circuit` · `rlc_series` · `switched_lamp`
- `--components=resistor:R1;switch:S1;diode:D1` — `;` between components, `:`
  between type and label. Types: `resistor`, `capacitor`, `inductor`, `switch`,
  `diode`.
- `--battery=9V` — source label, used with `--components`.

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
- `--smiles=CCO` — any SMILES string. Takes priority over `--name=`.

### piechart
- `--name=` `market_share` (a pie) · `budget_breakdown` (a donut)
- `--donut` — only consulted when `--name=` is absent.
- No custom-data input yet.

### plot
Two entry points, one module.
- `function.py --name=` `quadratic` · `sine_cosine` · `damped_oscillation` ·
  `linear_fit_demo` · `quadratic_fit_demo`
- `function.py --functions=sin(x);x**2 --range=-6,6` — `;` between expressions,
  `,` inside the range. Names allowed in an expression: `sin cos tan asin acos
  atan exp log log10 sqrt abs pow pi e`.
- `function.py --points=1,2;3,4 --fit=linear|quadratic` — `;` between points,
  `,` inside one. Points mode takes priority over `--functions=`.
- `derivative.py` — a fixed pedagogical figure. **No flags at all**, not even
  `--misdeclare`; it reads only the canvas size.

### reaction
- `--name=` `glucose_combustion` · `photosynthesis` · `combustion_methane` ·
  `esterification`
- `--reaction=CCO.O>>CC=O` — SMILES, `.` between components, `>>` between
  sides.
- `--conditions=heat, H2SO4` — free text, used with `--reaction=`.

### skewt
- `--name=` `midlatitude_summer` · `unstable_afternoon`
- No custom-sounding input.

### topology
- `--name=` `four_helix_bundle` · `rossmann_pattern`
- `--elements=helix:20:A|sheet:8:B1` — `|` between elements, `:` between an
  element's three fields. Types are `helix` and `sheet`.

## What the core checks

Six checks, in [src/modules/verify.ts](../src/modules/verify.ts). Each reports
`pass`, `fail`, or **`not-applicable`** — a real third state, never a polite
pass. A check that examined zero elements has verified nothing, and reporting
that as a pass would read as coverage.

| check | what it asks | reported not-applicable when |
| --- | --- | --- |
| `module-ids-resolve` | Does every declared id exist in the SVG? | never — it is always pass or fail |
| `module-geometry-agrees` | Does each `declaredBox` match what was measured? | no element declared a box |
| `module-label-within-feature` | Does each owned label sit inside its feature's fill? | no label declares an `owner` |
| `module-labels-do-not-collide` | Do any two labels overlap? | no label resolved to a measured box |
| `module-labels-clear-of-strokes` | Does a label sit on a stroke that is not its owner's? | no labels were declared at all |
| `content-within-canvas` | Is everything inside the canvas? | no element resolved a box |

`content-within-canvas` deliberately keeps its core name: same method, same
meaning in both worlds. The others are named apart because the method genuinely
differs — a foreign SVG has no content boxes and no wrapped line boxes, so a
check called `text-fits-box` would promise something it cannot deliver.

Geometry agreement is not exact. The tolerance is
`max(1, 0.02 × max(width, height))` — relative, with an absolute floor.

**A note on `not-applicable` in this repertoire.** Most modules leave
`module-label-within-feature` at `not-applicable`, and that is correct rather
than a gap: declaring `owner` is only meaningful when the owner is a *filled*
shape the label can be tested against. A label over a stroked path or a bare
line has no fill for the test to use, and claiming ownership there was the
recurring bug in early modules. The modules where it genuinely runs are
`topology` (capsules and arrows), `crystal` (atoms), `piechart` (sectors),
`genomic` (gene arrows, for inside-placed labels only) and `map` (regions).

## The `--misdeclare` probe

Every module except `plot/derivative.py` accepts `--misdeclare`, which plants
deliberate defects in the *declaration* while drawing the figure correctly:
typically a phantom element that was never drawn, plus one real element's
`declaredBox` shifted by 20–60px.

This is how the verifier is tested rather than assumed. A checker that reports
everything as fine is indistinguishable from a checker that is not running, and
`--misdeclare` is the difference: it must make `module-ids-resolve` and
`module-geometry-agrees` fail. Each module's e2e test asserts exactly that.

## What is never checked

**Malformation, not misrepresentation.** This is the stated limit of every
module here, and it is worth being blunt about: a diode drawn the right way
round for a circuit where it should be reversed passes every check; a pie chart
whose values were computed from a misleading baseline passes every check; a map
with the wrong country shaded passes every check.

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
5. Implement `--misdeclare`, and write an e2e test asserting it fails the
   checks it should.
6. Write a `MODULE.md` saying why the core cannot do this, what building it
   found, and what it does not attempt.

[docs/research/candidate-modules.md](../docs/research/candidate-modules.md) has
the survey the current repertoire was drawn from.
