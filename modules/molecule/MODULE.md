# molecule — a figure module in Python

Renders a 2D skeletal chemical structure — the wedge/dash convention every organic chemistry textbook uses — with real coordinate generation and real stereo perception, in the language where that work belongs.

## Why this exists outside the core

The repertoire's four presets are all *layout-agnostic*: boxes, graphs, trees, callouts on a scene. A skeletal formula is none of those. Which bonds get drawn as wedges versus hashes falls out of CIP/stereocentre perception, and 2D coordinate generation for a ring system is a constrained-layout problem with its own literature — this is [RDKit](https://www.rdkit.org/) territory, the same way projection and point-in-polygon were Shapely/pyproj territory for [the map module](../map/MODULE.md). Decision 0001 conceded exactly this shape of case: work that is native to a library in another language becomes a separate process rather than a TypeScript reimplementation nobody asked for.

## What it declares, and what it does not

Every bond is a `decoration` element with a `declaredBox` — this module computed every coordinate on that segment, so its bounds are something it genuinely knows. Every heteroatom label (`OH`, `O`, `NH2`, ...) is a `label` with **no** `declaredBox`: measuring text needs a font engine, and [the map module](../map/MODULE.md) already learned this lesson the hard way — guessing from character count was wrong by up to 16px. Carbon atoms with no charge get no label at all, matching the skeletal-formula convention: a bare vertex *is* a carbon.

## What the checks catch here specifically

- **`module-geometry-agrees`** — this is the check that mattered most while building it. A dashed stereo wedge's tip point is never itself drawn (only the hash marks are), and an early version seeded the declared bounding box with that undrawn tip anyway. The check failed on every dashed bond, off by up to 22px, and pointed straight at the bug. A second bug surfaced the same way: this module first padded every bond's declared box by half the stroke width, on the assumption that `getBoundingClientRect` on an SVG `<line>` includes paint extent. It does not — Chromium returns the geometric extent of the path data — and the check caught a uniform few-pixel disagreement on all twelve bonds of the first honest run until a standalone probe (render a plain diagonal line, measure it) confirmed the actual behaviour rather than the assumption.
- **`module-labels-clear-of-strokes`** — the check that gives this module its point. Bonds are `decoration`, so every label is automatically tested against every bond's drawn ink via `isPointInStroke`. Bonds retreat from a labelled atom by a fixed 11px (`TRIM_PX`) precisely so this passes honestly rather than being satisfied by accident — except for a one-character label (a bare `H`, only reachable once an explicit hydrogen atom is on the canvas at all), which retreats 1.4× further. That case was found, not anticipated: [modules/reaction](../reaction/MODULE.md)'s methane tile failed this check with real ~1px clearance once it started drawing methane with explicit hydrogens, and bumping `TRIM_PX` itself to cover it regressed sucrose's own tightly packed two-ring layout — a real font-ascent difference between a single capital glyph and a wider two-character label like `OH`, scoped to the one label width that actually needs the extra margin rather than paid by every label.
- **`module-labels-do-not-collide`** — sucrose and other crowded polyols pack several `OH` labels close together; this is what would catch two of them overlapping.
- **`module-label-within-feature`** — reports `not-applicable`. No element here is a `feature` with an owned label the way a map region owns its name; there is nothing for this check to examine, and it says so rather than a false `pass`.

## A caller can ask for explicit hydrogens, and gets them for real

`Chem.MolFromSmiles` silently strips explicit hydrogen atoms back into implicit ones on parse by default — invisible for an ordinary SMILES, since nothing was explicit to begin with, but it meant a caller who deliberately wrote a molecule out with explicit `[H]` atoms (a bare, unconnected atom like water or methane has no other way to get a real bond to draw at all) got them silently removed right back out, undoing the point before this module ever saw them. Parsing now passes `SmilesParserParams(removeHs=False)` explicitly. [modules/reaction](../reaction/MODULE.md)'s `structural_smiles()` is the first real caller of this: water's bare `O` and methane's bare `C` become `[H]O[H]` and `[H]C([H])([H])[H]` before reaching here, and now actually keep their hydrogens through to the drawing.

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

## What is not checked

**Malformation, not misrepresentation** — the same boundary decision 0005 draws everywhere else. A wedge pointing the wrong stereochemistry direction passes every check here: nothing verifies that the depicted configuration matches the *intended* one, only that what was declared was actually drawn where it was declared. A heteroatom mislabelled by a typo in `atom_label` passes too — text content is never checked against the molecule, only its presence and its ownership-free geometry. And aromatic rings are Kekulized to alternating single/double bonds rather than drawn with the circle-in-hexagon convention some readers prefer; that is a stated stylistic choice, not a defect this module's own checks would ever flag.
