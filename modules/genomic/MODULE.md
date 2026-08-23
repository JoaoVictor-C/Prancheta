# genomic — a figure module in Python

Gene arrows on a real base-pair axis — a plasmid map, a locus diagram, an operon — where an arrow's direction encodes strand and its canvas position is a faithful, checkable function of its declared bp range. See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #5.

## Why this exists outside the core

The core's IR has no notion of a genomic coordinate, and no way to pack overlapping annotations into non-colliding rows. That packing problem — several features overlapping in sequence coordinates, needing to stack into separate tracks without touching — is genuinely a small algorithm, not arithmetic the core's flow layout already does.

## What it delegates and what it keeps

`dna_features_viewer.compute_features_levels` does the row-packing: it is imported and called directly, not re-derived. This module's own job is the bp-to-canvas projection and the drawing — a strand-facing arrow (a rectangle with a triangular tip pointing in the strand's direction) at each feature's packed row.

## What it declares, and what it does not

Every feature arrow is a `feature` with a `declaredBox` computed from the same bp→canvas projection used to draw it. **A label placed *inside* its arrow declares a real `owner`, and it's a legitimate one**: an arrow is a filled polygon, not a stroked line, so it has a real fill area for `isPointInFill` to test a label's containment against. A label that did not fit and was placed *outside* the arrow declares no owner — it no longer claims to sit inside the feature it names, and declaring ownership there would be the same false claim in a new place. Which branch a given gene takes depends on whether its arrow is wide enough to hold the text, so a single figure routinely contains both — the false-ownership mistake [reaction](../reaction/MODULE.md), [plot](../plot/MODULE.md) and effectively every stroke-only-feature module in this repertoire had to remove does not apply here, because the underlying shape actually supports the relationship being declared. `module-label-within-feature` runs for real on this module, not as `not-applicable`, and reports genuine overhang on close-fitting labels (a label whose text is a touch wider than its gene's arrow, common on short genes) rather than failing outright — the same overhang-vs-escape distinction the map module's harbour case established.

Baseline ticks are `label`s with no declared box, the usual font-metrics reason. The sequence baseline is a `decoration` with a real (zero-height) declared box.

## What building it found, after the first honest render looked clean

The first render of both named datasets passed every check — and still overlapped a real reader's eyes: a short `promoter` or `terminator` feature is narrower than its own label, so the centred-inside label overflowed onto the neighbouring feature. No check caught it because no check *could*: labels declare no box (no font engine here to measure one), so nothing was checking label-vs-neighbouring-feature collision for the inside-placed case at all. A user's screenshot of exactly this — `promoter`/`GFP`/`terminator` running together — is what surfaced it.

The fix estimates each label's width from its character count (generous, not exact — there is still no font engine) and only centres a label inside its arrow when the estimate fits; a label too wide for its feature is drawn outside instead, in the feature's own colour so it still reads as *that* feature's name. The estimate does not have to be exact for the result to be checked for real: wherever the outside placement lands, `module-labels-do-not-collide` and `module-labels-clear-of-strokes` run against the actual measured text, so a wrong estimate becomes a failed check, not a silent overlap.

**The first version of the fix picked the wrong "outside."** It placed the label directly *above* the arrow — which fixed the horizontal collision and immediately failed `module-labels-clear-of-strokes` on the `operon` fixture instead, because `regX` sits in the row directly below `geneB`, and "above" reached straight into `geneB`'s own row. The corrected version places the label level with the arrow, in the horizontal gap immediately past its tip: `compute_features_levels` already guarantees two features sharing a row don't overlap in bp range, so that gap is real, checked free space, where the vertical gap above a feature belongs to whatever the packing put in the next row up, not to this feature.

## Running it

```bash
node src/cli.ts module python --args "modules/genomic/render.py,--name=operon"
node src/cli.ts module python --args "modules/genomic/render.py,--length=2000,--features=0:500:1:geneX|400:900:-1:geneY|850:1400:1:geneZ"
node src/cli.ts module python --args "modules/genomic/render.py,--misdeclare"
```

Named shortcuts: `plasmid_simple`, `operon` (`--name=<key>`). `--features=` takes any number of `start:end:strand:label` entries. **`|` separates features, `:` separates a feature's own fields — not commas**, the same CLI-layer comma-joining trap [modules/dendrogram](../dendrogram/MODULE.md) and [modules/circuit](../circuit/MODULE.md) already document — **fixed at the source** via a repeatable `--args` flag; see dendrogram's note. `--length=` sets the total sequence length in bp (default 3000).

## What is not checked

**Malformation, not misrepresentation**, the limit stated everywhere in this repertoire. A gene drawn on the wrong strand, or a feature range that doesn't match the biological annotation it claims to represent, passes every check here — nothing verifies that the *content* of a `start:end:strand:label` entry is biologically accurate, only that what was declared was actually drawn where it was declared.
