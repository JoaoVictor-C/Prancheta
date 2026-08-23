# piechart — a figure module in Python

A real pie or donut chart: filled circular sectors, angle proportional to value. See [src/presets/chart/PRESET.md](../../src/presets/chart/PRESET.md)'s own stated boundary — bar charts are a core TypeScript preset; this is not, and the reason is the same one that puts curve-fitting in [modules/plot](../plot/MODULE.md).

## Why this is a module and bar charts are not

A `Block` in Prancheta's IR (`src/ir/types.ts`) is always an axis-aligned rectangle. A bar's length is a rectangle's own height or width — arithmetic, not new geometry, which is exactly why [src/presets/chart](../../src/presets/chart/PRESET.md) needed no core changes at all. A pie wedge is not a rectangle under any transform; drawing one needs an actual circular-sector path (`M cx,cy L ... A r,r ...`), which the core's box-model pipeline has no way to measure, check, or repair. That is "geometry the core cannot compute" in the same literal sense decision 0005 states for every other module here — the module boundary is not a stylistic choice, it is where the IR's own vocabulary runs out.

## What it declares, and what it does not

Every slice is a `feature` with a `declaredBox` — the real bounding box of the sector, computed by sampling 25 points along its outer (and, for a donut, inner) arc and taking their extent, not guessed from the centre/radius/angles algebraically. A slice's percentage label, when the slice is wide enough to hold one, declares a real `owner`: a sector is a filled path, the same legitimate-ownership case [modules/genomic](../genomic/MODULE.md)'s gene arrows and [modules/topology](../topology/MODULE.md)'s capsules already are, so `module-label-within-feature` runs for genuine effect rather than sitting at `not-applicable`.

**Every slice is named in the legend regardless of whether it also carries an inline label.** A slice narrower than 6% of the total gets no inline percentage (too little room to hold one legibly, the same threshold logic [modules/crystal](../crystal/MODULE.md) and [modules/map](../map/MODULE.md) both use for their own crowded cases) — but the legend, placed in its own reserved column, always lists every category with its real computed percentage, so no data is lost to an unlabelled slice.

## Running it

```bash
node src/cli.ts module python --args "modules/piechart/render.py,--name=market_share"
node src/cli.ts module python --args "modules/piechart/render.py,--name=budget_breakdown"
node src/cli.ts module python --args "modules/piechart/render.py,--misdeclare"
```

Named shortcuts: `market_share` (a plain pie), `budget_breakdown` (a donut). No custom-data CLI input yet — adding one would follow the `;`/`:` delimiter convention every other multi-value module in this repertoire uses (see [modules/dendrogram](../dendrogram/MODULE.md); a comma can now also survive a single value intact via a repeated `--args` flag, the CLI-layer fix dendrogram's note describes).

## What is not checked

**Malformation, not misrepresentation**, the limit stated everywhere in this repertoire. A pie chart whose slices don't actually sum to the claimed total, or whose values were computed from a misleading baseline, passes every check here — nothing verifies that the underlying numbers mean what the chart implies, only that what was declared was actually drawn where it was declared.
