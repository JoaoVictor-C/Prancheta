# molecule — a figure module in Python

Renders a 2D skeletal chemical structure — the wedge/dash convention every organic chemistry textbook uses — with real coordinate generation and real stereo perception, in the language where that work belongs.

## Why this exists outside the core

The repertoire's four presets are all *layout-agnostic*: boxes, graphs, trees, callouts on a scene. A skeletal formula is none of those. Which bonds get drawn as wedges versus hashes falls out of CIP/stereocentre perception, and 2D coordinate generation for a ring system is a constrained-layout problem with its own literature — this is [RDKit](https://www.rdkit.org/) territory, the same way projection and point-in-polygon were Shapely/pyproj territory for [the map module](../map/MODULE.md). Decision 0001 conceded exactly this shape of case: work that is native to a library in another language becomes a separate process rather than a TypeScript reimplementation nobody asked for.

## What it declares, and what it does not

Every bond is a `decoration` element with a `declaredBox` — this module computed every coordinate on that segment, so its bounds are something it genuinely knows. Every heteroatom label (`OH`, `O`, `NH2`, ...) is a `label` with **no** `declaredBox`: measuring text needs a font engine, and [the map module](../map/MODULE.md) already learned this lesson the hard way — guessing from character count was wrong by up to 16px. Carbon atoms with no charge get no label at all, matching the skeletal-formula convention: a bare vertex *is* a carbon.

## What the checks catch here specifically

- **`module-geometry-agrees`** — this is the check that mattered most while building it. A dashed stereo wedge's tip point is never itself drawn (only the hash marks are), and an early version seeded the declared bounding box with that undrawn tip anyway. The check failed on every dashed bond, off by up to 22px, and pointed straight at the bug. A second bug surfaced the same way: this module first padded every bond's declared box by half the stroke width, on the assumption that `getBoundingClientRect` on an SVG `<line>` includes paint extent. It does not — Chromium returns the geometric extent of the path data — and the check caught a uniform few-pixel disagreement on all twelve bonds of the first honest run until a standalone probe (render a plain diagonal line, measure it) confirmed the actual behaviour rather than the assumption.
- **`module-labels-clear-of-strokes`** — the check that gives this module its point. Bonds are `decoration`, so every label is automatically tested against every bond's drawn ink via `isPointInStroke`. Bonds retreat from a labelled atom by a fixed 11px (`TRIM_PX`) precisely so this passes honestly rather than being satisfied by accident — except for a one-character label (a bare `H`, only reachable once an explicit hydrogen atom is on the canvas at all), which retreats 1.4× further. That case was found, not anticipated: [modules/reaction](../molecule/MODULE.md)'s methane tile failed this check with real ~1px clearance once it started drawing methane with explicit hydrogens, and bumping `TRIM_PX` itself to cover it regressed sucrose's own tightly packed two-ring layout — a real font-ascent difference between a single capital glyph and a wider two-character label like `OH`, scoped to the one label width that actually needs the extra margin rather than paid by every label.
- **`module-labels-do-not-collide`** — sucrose and other crowded polyols pack several `OH` labels close together; this is what would catch two of them overlapping.
- **`module-label-within-feature`** — reports `not-applicable`. No element here is a `feature` with an owned label the way a map region owns its name; there is nothing for this check to examine, and it says so rather than a false `pass`.

## A caller can ask for explicit hydrogens, and gets them for real

`Chem.MolFromSmiles` silently strips explicit hydrogen atoms back into implicit ones on parse by default — invisible for an ordinary SMILES, since nothing was explicit to begin with, but it meant a caller who deliberately wrote a molecule out with explicit `[H]` atoms (a bare, unconnected atom like water or methane has no other way to get a real bond to draw at all) got them silently removed right back out, undoing the point before this module ever saw them. Parsing now passes `SmilesParserParams(removeHs=False)` explicitly. [modules/reaction](../molecule/MODULE.md)'s `structural_smiles()` is the first real caller of this: water's bare `O` and methane's bare `C` become `[H]O[H]` and `[H]C([H])([H])[H]` before reaching here, and now actually keep their hydrogens through to the drawing.

## Requirements

Python 3, `rdkit`:

```bash
python -m pip install rdkit
```

## Running it

```bash
# a named molecule
node src/cli.ts module python --args "modules/molecule/render.py,--name=glucose"

# any SMILES string — the general case
node src/cli.ts module python --args "modules/molecule/render.py,--smiles=CC(=O)Oc1ccccc1C(=O)O"

# deliberately broken, to see the checks catch it
node src/cli.ts module python --args "modules/molecule/render.py,--misdeclare"
```

Named shortcuts: `glucose`, `fructose`, `sucrose`, `caffeine`, `aspirin`, `water`, `ethanol`, `benzene` (`--name=<key>`). Anything else — any valid SMILES — goes straight through `--smiles=`.

The `module` command verifies but does not rasterize to disk (unlike `render`); it prints the manifest and returns the SVG as data. To get a PNG, hand the returned `svg` to any SVG renderer, or drive `runAndVerifyModule` from a short script the way `tests/module-molecule-e2e.test.ts` does.

## Second entry point: a whole reaction scheme

`modules/reaction/render.py` is this module's other front door, not a module of
its own. It computes **no chemistry**: every atom position, bond and stereo
wedge comes from this file's `render()`, imported directly -- sys.path gets the
sibling directory added and `from render import render as render_molecule` does
the rest. What it owns is the problem `molecule` does not solve: arranging
several independently-sized molecule sub-figures in a row without collision,
and placing reagent and condition text on the arrow without it colliding with a
neighbour. That is a packing problem, not a chemistry problem, and it is why
the code exists -- but it was never a reason for a second row in the
repertoire, which implies a second dependency and a second reason to exist.
`plot` already had the right shape: one module, two entry points.

### Two tiers, not one row of mismatched things

The first version of this module drew every participant — however small — in a single row, mixing plain formula text (O₂, CO₂, H₂O) with full skeletal drawings (glucose) side by side. Each piece was individually correct, but the row as a whole read as incoherent: wildly different visual weights standing in for the same kind of thing, with a stoichiometric coefficient stacked awkwardly above a molecule drawing rather than written the way an equation actually writes one.

**Row 1 is the equation, letters and numbers only** — `place_side_equation()` in [reaction/render.py](../reaction/render.py) writes `formula_text()`'s Unicode-subscripted formula for every participant, coefficient and formula on ONE token at ONE baseline (`"6O₂"`, not a number floating above a drawing), joined by `+` and a real arrow with conditions above it. This is the real equation, and it stands alone: read it top to bottom and it says everything a reaction equation says, in the way one is actually written.

**Row 2 is a real structural drawing for every participant** — not just the ones with an "interesting" skeleton. An earlier version drew a structure only for participants judged complex enough (a carbon–carbon bond, or enough heavy atoms), leaving small species as equation text only; the next round of feedback was direct — a reader asking "what does O₂ actually look like" deserves the same real answer glucose gets, not a text label standing in everywhere except the one molecule that earned a drawing. Every unique participant, deduplicated across both sides of the equation (a component appearing as both reactant and product draws once), now gets `molecule`'s real render in its own tile, with its own stoichiometric coefficient placed above it when greater than 1. Water's own tile is legitimately a single labelled atom — `O` with two implicit hydrogens has no explicit bond to draw — which is still a real structural answer, not a stand-in; two collinear O=C bonds in CO₂ read, correctly, as a straight double line, since the molecule really is linear and the convention leaves carbon unlabeled.

This split also fixed a real bug the original single-row layout had been quietly hiding: methane's own carbon atom carries no label at all under `molecule`'s skeletal convention (carbon is implicit), so `combustion_methane`'s reactant used to render as an empty box. With row 1 always giving every participant a real formula regardless of what row 2 draws, that failure mode is gone even where row 2's structural drawing is minimal.

**Water and methane get real structures, not text standing in for one.** A bare, unconnected atom — water's `O`, methane's `C` — has literally nothing to draw under the skeletal convention: hydrogens fold into the heavy atom's own label, and carbon's own label is suppressed entirely, so methane's tile originally declared **zero elements** — not even a fallback label, an entirely blank box, found by checking what this module actually declared rather than assuming a small molecule degrades gracefully. `structural_smiles()` fixes this at the source: a participant whose molecule has zero bonds gets `Chem.AddHs()` before it ever reaches `molecule.render()`, so water becomes `[H]O[H]` and methane becomes `[H]C([H])([H])[H]` — real explicit hydrogen atoms RDKit can generate real 2D coordinates and bonds for, giving water its actual bent shape and methane a real four-bond structure, not a formula standing in for one. This needed this module's own parser fixed too — `Chem.MolFromSmiles` silently strips explicit hydrogens back out by default — and surfaced a genuinely new failure mode of its own: a bare one-character `H` label needs more retreat from its bond than `TRIM_PX` gives every other label, fixed there specifically rather than by loosening the shared constant. A residual fallback (scaling up a single leftover label) still covers a species `AddHs` can't turn into a real skeleton, like a bare ion. Every stoichiometric coefficient in row 2 is written `"6x"`, not a bare number, and centred above its own tile — directly over the structure it multiplies, not floating near the tile's edge.

### What the reaction figure declares

Every embedded molecule's own elements are re-declared with a tile-prefixed id (`m0-bond-3`, `m0-atom-2-label`, ...) and any `declaredBox` translated into the reaction figure's shared canvas space — `embed()` in [reaction/render.py](../reaction/render.py) does this rewrite once, so a collision between two structural tiles both declaring `atom-0-label` never happens. The arrow is a `decoration` whose declared box covers the *whole* drawn arrow, line and arrowhead together, wrapped in one `<g data-pr-id="reaction-arrow">` — every equation token, and the conditions text, are `label`s with no declared box, for the same font-engine reason every label in this repertoire goes undeclared. `est_text_width()` budgets layout spacing between equation tokens from a rough per-character estimate, not a real measurement — it only has to be generous enough that an honest layout doesn't collide, and the checks verify the browser's own real rendered text afterward, not this estimate.

### What building the reaction figure found

**The arrow's declared box didn't match what was drawn**, on the first honest run. The `<line>` itself stops 10px short of the arrow's tip to leave room for the arrowhead triangle, and the first version declared the box as spanning the full arrow length while only the shortened line and a separately-drawn triangle were on the canvas — `module-geometry-agrees` failed by exactly that 10px gap. The fix groups the line and arrowhead under one id so the declared box and the measured box describe the same drawn thing, the identical resolution the map module reached for multi-line regions.

**A label was declared to "own" something that can't be owned.** The conditions text was first declared with `owner: "reaction-arrow"`, on the assumption that text sitting near a feature should claim it. `module-label-within-feature` failed — a `<line>`/`<g>` has no `isPointInFill` target, so the containment test has nothing to test against, and the check correctly refused to call that a pass. The real relationship this label needs verified isn't containment, it's *not sitting on the arrow's ink*, which `module-labels-clear-of-strokes` already covers for every label against every decoration, ownership or not. Removing the false `owner` was the fix, not adding a new check.

### Running the reaction entry point

```bash
node src/cli.ts module python --args "modules/reaction/render.py,--name=glucose_combustion"
node src/cli.ts module python --args "modules/reaction/render.py,--reaction=CC(=O)O.CCO>>CC(=O)OCC.O,--conditions=H+, Δ"
node src/cli.ts module python --args "modules/reaction/render.py,--misdeclare"
```

Named shortcuts: `glucose_combustion`, `photosynthesis`, `combustion_methane`, `esterification` (`--name=<key>`). `--reaction=LHS>>RHS` takes any `.`-joined SMILES on each side; **a component repeated N times is how a coefficient is declared** (`O=O.O=O.O=O.O=O.O=O.O=O` reads as `6 O2`) — the coefficient is counted from what's actually given, not inferred or balanced. Unbalanced input renders exactly as unbalanced; this module does not check stoichiometry.

### What the reaction figure does not check

**Malformation, not misrepresentation**, the same limit every module in this repertoire states. A chemically impossible or unbalanced reaction renders and passes every check — nothing here verifies mass balance, valid oxidation states, or that the named `conditions` text actually describes real conditions for the reaction shown. Only whether what was declared was actually drawn where it was declared.

## What is not checked

**Malformation, not misrepresentation** — the same boundary decision 0005 draws everywhere else. A wedge pointing the wrong stereochemistry direction passes every check here: nothing verifies that the depicted configuration matches the *intended* one, only that what was declared was actually drawn where it was declared. A heteroatom mislabelled by a typo in `atom_label` passes too — text content is never checked against the molecule, only its presence and its ownership-free geometry. And aromatic rings are Kekulized to alternating single/double bonds rather than drawn with the circle-in-hexagon convention some readers prefer; that is a stated stylistic choice, not a defect this module's own checks would ever flag.
