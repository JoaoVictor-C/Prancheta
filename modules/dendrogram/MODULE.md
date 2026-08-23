# dendrogram — a figure module in Python

A hierarchical clustering tree where **branch length is data** — the merge distance `scipy`'s own linkage algorithm computed — not a depth count. See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #2.

## Why this exists outside the core, and outside `mindmap` too

[mindmap](../../src/presets/mindmap/PRESET.md) is the right preset for a hierarchy whose *topology* is the content — an outline, a breakdown, an incident review. A dendrogram's content is different in kind: the vertical position of every merge encodes a real distance, computed by a real clustering algorithm, and mindmap's radial layout has nowhere to put that number — it only has depth, and depth is not distance. This is precisely the tree shape [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md) named as the one `mindmap` can't honestly serve.

## What it delegates and what it keeps

`scipy.cluster.hierarchy.linkage` computes the clustering; `scipy.cluster.hierarchy.dendrogram(..., no_plot=True)` already lays out every merge's exact trace as `icoord`/`dcoord` arrays — four x-coordinates and four y-coordinates per link, tracing the U-shape from one child up to the merge height and down to the other child. This module's own job is projecting that trace onto a canvas (`sx`/`sy`), not inventing a layout of its own. The distance axis and its tick values are read directly off the same linkage result — nothing here is guessed.

## What it declares, and what it does not

Every merge is a `feature` with a `declaredBox` — the bounding box of scipy's own `icoord`/`dcoord` trace, projected through this module's `sx`/`sy`. This is the check with real teeth here: `icoord`/`dcoord` are coordinates this module did not choose, so declaring their projected bounds and having the core measure the drawn `<path>` against that claim is exactly the "did the render code honour the internal model" case decision 0005 was written for — a scaling bug (wrong axis, wrong flip, wrong padding) would show up as a `module-geometry-agrees` failure, not as a plausible-looking but wrong picture. Leaf names and axis tick labels are `label`s with no declared box, the usual font-metrics reason.

## Running it

```bash
node src/cli.ts module python --args "modules/dendrogram/render.py,--name=species_traits"
node src/cli.ts module python --args "modules/dendrogram/render.py,--labels=P;Q;R;S,--data=0:0;0:1;9:9;9:8"
node src/cli.ts module python --args "modules/dendrogram/render.py,--misdeclare"
```

Named shortcuts: `cluster_demo` (8 synthetic 2D points, three visible groups), `species_traits` (a toy trait matrix — illustrative, not a real phylogeny). `--labels=` and `--data=` take an arbitrary dataset: **`;` separates labels and separates rows; `:` separates the numbers within a row — not commas**, because a single `--args "a,b,c"` invocation still comma-joins everything into one shell string before this script ever runs, discovered by feeding it exactly that and watching the label/data counts come out wrong. **Fixed at the source**: `--args` is now repeatable (`--args a --args b`), and a repeated flag's values are taken verbatim, comma included — so `--data=0,0;0,1` survives intact if you pass it as its own `--args` occurrence rather than folding it into one comma-joined string. The `;`/`:` convention below still works and is unaffected either way; it is the dataset's own shape, not a workaround for the CLI. `--method=` picks the linkage method (`average` by default; anything `scipy.cluster.hierarchy.linkage` accepts).

## What is not checked

**Malformation, not misrepresentation**, the same limit stated everywhere else in this repertoire. A clustering computed with a metric or method that doesn't suit the data (Euclidean distance on categorical features, single linkage chaining unrelated points together) passes every check here — the tree is drawn faithfully to whatever `linkage()` returned, and nothing verifies that the *choice* of distance metric or linkage method was a reasonable one for the data given.
