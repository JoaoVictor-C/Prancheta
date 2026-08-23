# topology — a figure module in Python

A 2D "topology cartoon" of a protein's secondary structure: helices as rounded capsules, strands as directional arrows, connected in strict sequence order by a serpentine (meander) path that wraps to a new row rather than running off the canvas. See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #6.

## Illustrative data, stated plainly

Both named examples — `four_helix_bundle` and `rossmann_pattern` — are **constructed to illustrate a real, well-known fold topology**, not fetched from any specific PDB entry. `rossmann_pattern` shows the β-α-β-α-β *pattern* that gives the Rossmann fold its name, with representative element lengths; it is not a claim about any particular protein's actual residue numbering. Fabricating specific residue ranges and presenting them as if extracted from a real structure would be worse than not having the example at all — this follows the same discipline [modules/dendrogram](../dendrogram/MODULE.md)'s `species_traits` trait matrix states for itself.

## Why this exists outside the core, and why it needed a small algorithm rather than ELK

A protein chain is a strict **path** — sequence order, no branching — and the convention that keeps a long chain's connecting loops readable is a *meander*: pack elements left-to-right, and when a row fills, wrap down and reverse direction so the chain folds back on itself rather than running off the page. That is domain-specific layout knowledge, not a generic graph-layout problem ELK already solves, which is why this earned a small dedicated algorithm here (`render()`'s placement loop) rather than being expressed as a graph preset the way [a logic-gate diagram would be](../../docs/research/candidate-modules.md) (candidate #9 in the same research doc draws the opposite conclusion for a feed-forward network, precisely because that *is* a generic layered DAG).

## What it declares, and what it does not

Every helix/strand is a `feature` with a `declaredBox` computed directly from its serpentine placement — real, known geometry. Loop connectors between consecutive elements are `decoration`s with a declared box covering their full path, including the elbow when a loop bridges two rows. Element labels declare a real `owner`: like [modules/genomic](../genomic/MODULE.md)'s gene arrows, both a helix capsule and a strand arrow are filled shapes, so `module-label-within-feature` runs for genuine effect here rather than reporting not-applicable.

## What building it found

**The canvas didn't grow to match its own content.** `row_w` — the usable width for one row of the meander — has a 400px floor regardless of the requested canvas width, the same way a molecule tile has a minimum useful size. The first version widened the canvas *height* to fit however many rows the layout needed, but left the SVG's declared *width* at the caller's original (possibly narrower) request. Rendered at a deliberately narrow 380px canvas, `row_w` silently grew to its 400px floor while the SVG stayed 380px wide, and `content-within-canvas` failed immediately — every element in the second, wrapped row ran off the right edge, because the row they were placed in was wider than the canvas that was supposed to contain it. The fix widens `canvas_w` the same way `canvas_h` already did: to `max(requested, what the layout actually needs)`.

## Running it

```bash
node src/cli.ts module python --args "modules/topology/render.py,--name=rossmann_pattern"
node src/cli.ts module python --args "modules/topology/render.py,--elements=helix:10:H1|sheet:6:S1|helix:12:H2|sheet:5:S2"
node src/cli.ts module python --args "modules/topology/render.py,--misdeclare"
```

Named shortcuts: `four_helix_bundle`, `rossmann_pattern` (`--name=<key>`). `--elements=` takes any number of `type:residues:label` entries — types are `helix` or `sheet`. **`|` separates elements, `:` separates a element's own fields — not commas**, the same CLI-layer comma-joining trap [modules/dendrogram](../dendrogram/MODULE.md), [modules/circuit](../circuit/MODULE.md) and [modules/genomic](../genomic/MODULE.md) already document — **fixed at the source** via a repeatable `--args` flag; see dendrogram's note.

## What is not checked, and what this doesn't attempt

**Malformation, not misrepresentation.** An element labelled `helix` with a residue count that doesn't match any real secondary-structure assignment passes every check here — this module draws whatever sequence of elements it is given; nothing verifies the input against a real structure or a DSSP/PDB record.

**No real structure file is read.** Unlike the aspiration in the original candidate research (`DSSP` output or a PDB's own `HELIX`/`SHEET` records), this module takes a hand-authored element list. Reading a real `.pdb` file's `HELIX`/`SHEET` records directly (a well-defined fixed-column format, parseable without the external `mkdssp` binary DSSP itself requires) is a natural next step, not implemented here — the layout and drawing problem this module exists to solve is unchanged either way.
