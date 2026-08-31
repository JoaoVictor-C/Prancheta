# crystal — a figure module in Python

A textbook-style unit cell diagram of a real crystal structure: one conventional cubic cell, drawn as a wireframe cube with atoms at every corner, edge and face site they touch, projected from real 3D lattice geometry with explicit visible/hidden edge distinction. See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #8 — the one flagged from the start as needing a scope conversation before starting, since 3D→2D occlusion brushes against this project's stated non-goal of photorealism.

## Staying in scope, deliberately

**Flat fills, no shading, no lighting, no perspective foreshortening.** This is an orthographic projection with occlusion *order* only — nearer atoms are drawn over farther ones, the same house style (near-black ground, flat saturated colour, thick uniform strokes) every other figure in this repertoire uses. It is a diagram, not a renderer, and the line is held on purpose rather than incidentally.

## Why this exists outside the core

Building a real crystal structure — real lattice vectors, a real atomic basis, space-group-correct atom positions — is [ASE](https://wiki.fysik.dtu.dk/ase/)'s job (`ase.build.bulk()`). Projecting a 3D structure into a 2D drawing with correct front-to-back ordering needs a rotation, an orthographic projection, and a depth sort, none of which the core's 2D box-model layout has any notion of.

## One conventional cell, not a repeated supercell

An earlier version of this module rendered a 2×2×2 chunk of repeated unit cells with nearest-neighbour bonds drawn between every pair of close atoms — real geometry, but visually a dense lattice fragment, not the single labelled cube every chemistry textbook actually draws for "here is the unit cell." This version renders exactly one **conventional** cubic cell (`ase.build.bulk(formula, structure, a=a, cubic=True)` — the standard cell every structure is conventionally described by, not the smaller rhombohedral primitive cell ASE defaults to for fcc, which has one atom and no cube to draw at all) and no bonds: a unit cell diagram shows where the sites *are*, not which pairs count as nearest neighbours.

**Boundary atoms are duplicated to every corner, edge or face they touch**, computed from each atom's real fractional coordinate (`duplicate_boundary_atoms()` in [render.py](render.py)) rather than hardcoded per structure: a coordinate near 0 along an axis means the atom also has a periodic image at 1 along that axis, and every combination of such axes gets its own copy. An FCC corner atom (fractional `(0,0,0)`, all three axes near a boundary) is shared by 8 neighbouring cells in real crystallography, so the one cell drawn here shows it at all 8 of its own corners; a face-centred atom (one axis near a boundary) gets 2 copies, one per face it sits on. This is why `fcc_copper` declares 14 atoms (8 corners + 6 faces) and `nacl_rocksalt` declares 27 (14 Na at corner/face sites + 13 Cl at edge/body-centre sites) — the real textbook atom counts for those cells, derived from the structure ASE actually built, not asserted.

## Solid edges, dashed edges — not a uniformly dashed reference frame

A cube viewed from any generic orthographic angle has exactly one vertex farthest from the viewer (every cube vertex has degree 3, so this is always exactly 3 of the 12 edges: the ones meeting at that back vertex). Those 3 are drawn dashed and faint, the standard "hidden edge" convention; the other 9 are drawn solid. The back vertex is found from each corner's own real rotated depth — the same `atom_depth`-style z-coordinate the painter's-algorithm draw order already uses — not guessed from which corner looks farthest.

## What it delegates and what it keeps

ASE builds the real structure: lattice constant, crystal system, atomic basis, and (via `get_scaled_positions()`) the real fractional coordinates the boundary-duplication logic reads. This module owns the view: a fixed isometric-like rotation, the orthographic projection, the visible/hidden edge split, and the painter's-algorithm depth sort that decides atom paint order.

## What it declares, and what it does not

Every atom is a `feature` with a `declaredBox` from its real projected circle. Every cell edge is a `decoration` with a declared box from its real endpoints, and its claim says plainly whether it is the visible or hidden kind. Element-symbol labels declare a real `owner`, the same legitimate case as [modules/genomic](../genomic/MODULE.md) and modules/topology: an atom is a filled circle, so `module-label-within-feature` runs for genuine effect.

## What building it found

**A geometric check has no notion of paint order, and a projected 3D structure makes that gap concrete rather than theoretical.** A labelled atom can sit close in 2D *projection* to a cell edge that is genuinely behind it in 3D — correctly hidden by that atom's own opaque fill, which the check cannot see. The fix labels only the least-occluded (frontmost, by depth) atom of each element, and only when a truly clear one exists — checked by measuring real distance from every candidate to every cell edge, not assumed.

**Switching from a repeated supercell to a single conventional cell changed which elements can be labelled cleanly, for real geometric reasons, not by loosening the check.** In the old 2×2×2 `nacl_rocksalt` render, *every* Na atom sat at distance **exactly 0** from some cell edge in every rotation — a structural fact about the edge-centre sites Na occupies in that repeated structure, not a placement bug, so Na went unlabelled by design, distinguished by colour alone. The single-cell view has far fewer Na atoms at different, fixed positions, and this rotation clears one of them: both Na and Cl now label successfully. The module still keeps the same honest fallback — an element with no projection-clear representative goes unlabelled with a note saying so, rather than a forced, colliding label — should a future structure or rotation need it.

## Running it

```bash
node src/cli.ts module python --args "modules/crystal/render.py,--name=nacl_rocksalt"
node src/cli.ts module python --args "modules/crystal/render.py,--name=diamond_cubic"
node src/cli.ts module python --args "modules/crystal/render.py,--name=fcc_copper"
node src/cli.ts module python --args "modules/crystal/render.py,--misdeclare"
```

Named structures only for now: `nacl_rocksalt`, `diamond_cubic`, `fcc_copper` (`--name=<key>`). No custom-structure CLI input yet.

## What is not checked, and what this doesn't attempt

**Malformation, not misrepresentation**, the limit stated everywhere in this repertoire. Nothing here verifies that the chosen structure, lattice constant or projection angle is the *pedagogically* right one to show — only that what was declared was actually drawn where it was declared.

**Unit cell edges are not depth-sorted against atoms.** They are drawn first, underneath every atom, as a reference frame rather than a participant in the painter's-algorithm ordering the atoms get. An edge that should visually pass in front of a far atom will not — a stated simplification, not a hidden one.

**No real occlusion check exists in this protocol**, and none was added. `module-geometry-agrees` verifies that a declared shape's bounds match what was drawn; nothing in decision 0005's checklist verifies that paint ORDER is correct (that a genuinely nearer atom really was drawn after a genuinely farther one), or that an edge's visible/hidden classification is the one a viewer would actually perceive. This module's depth sort and edge classification are trusted, not independently checked — the same category of stated limit as the map module's "checked for malformation, not misrepresentation," one level more specific to what a 3D projection needs.
