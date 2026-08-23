# map — a figure module in Python

Renders regions with real projection and real label placement, in the language where that work belongs.

## Why this exists outside the core

[Decision 0001](../../docs/decisions/0001-language.md) conceded one case: map label placement needs point-in-polygon, buffers and projected-coordinate transforms executed thousands of times inside a layout loop. That is Shapely and pyproj work, and no TypeScript equivalent is close.

So this is a separate process. It receives one JSON document on stdin and writes one on stdout — a boundary that is doing real work in both directions. An in-process bridge would make the module's own numbers the path of least resistance again, and a segfault in a geospatial C extension would take the core down with it.

## What it declares, and what it does not

It declares **what it drew**: an id and a kind for every element, and which feature each label names. It does *not* certify that what it drew is correct — [decision 0005](../../docs/decisions/0005-module-protocol.md). The core measures the geometry itself.

It declares `declaredBox` for **features only**. It computed those polygons, so their bounds are something it genuinely knows. It does *not* declare boxes for labels: measuring text needs a font engine, and the first version of this module guessed from character counts and was wrong by up to 16px. The core caught it immediately. **A module declares only geometry it actually computes.**

## The shape of the probe

`harbour` is deliberately **L-shaped**, and that is the whole point. The centre of its bounding box lies in the notch — outside the polygon. Shapely's `representative_point()` is guaranteed to land inside; a naive bbox centre is not. No amount of bounding-box measurement on the core's side can tell those apart. Only a real hit-test can, which is why `module-label-within-feature` asks the browser rather than comparing rectangles.

Run with `--misdeclare` to place labels at bounding-box centres *and* declare a region that was never drawn. The core must catch both:

```bash
node src/cli.ts module python --args modules/map/render.py               # clean
node src/cli.ts module python --args modules/map/render.py,--misdeclare  # two failures
```

The convex regions still pass under `--misdeclare` — their bbox centres really are inside them. Only the L-shape fails. That discrimination is the check earning its place.

## The coordinate trap, on purpose

Features are drawn inside a `<g transform="translate(...) scale(...)">` that also flips the y axis, because Mercator y grows north and SVG y grows down. Labels sit in a *different* group with no transform.

That is exactly the arrangement where naive verification goes wrong: `getBBox` and `isPointInFill` both work in an element's own user space, so feeding a label's box straight into a region's hit-test gives a confident wrong answer. The core normalises everything into one canvas space first. This module is shaped to make sure that path is actually exercised.

## What is not checked

**Malformation, not misrepresentation.** The colours here carry no data, but if they did, a reversed scale would pass every check. So would an equal-area claim about a Mercator projection — which this module uses, and which is *not* equal-area. Nothing in the protocol will tell you that.

## Requirements

Python 3, `shapely`, `pyproj`. Both ship as binary wheels:

```bash
python -m pip install --only-binary :all: shapely pyproj
```

---

## The campaign variant: categorical political maps with a legend

`--name=campaign` renders a *different* figure class from the L-shape probe above: a categorical political map with a colour-coded legend and directional movement arrows — the "who controlled what, and which way things moved" diagram (a historical campaign map, an election map, a treaty-boundary map), prompted by a request to draw something in the style of a WWII theatre map.

```bash
node src/cli.ts module python --args "modules/map/render.py,--name=campaign"
node src/cli.ts module python --args "modules/map/render.py,--name=campaign,--misdeclare"
```

**A fictional continent, stated as such.** Eleven invented territories (Corenia, Suden, Ausland, Westmark, Nordland, Brekland, Sudmark, Polvia, Vastland, Islania, and the offshore Ostholm Isles — none are real place names) on a synthetic grid, not a claim about any real country, war, or historical event. This is the same discipline every named example in this repertoire follows — [modules/dendrogram](../dendrogram/MODULE.md)'s trait matrix, [modules/skewt](../skewt/MODULE.md)'s soundings — extended to maps: the diagram *class* is real, the content is illustrative on purpose, because fabricating specific historical claims and presenting them as real would be worse than not having the example.

**Borders are irregular, and adjacent territories still meet with zero gap — guaranteed, not eyeballed.** The first version drew every territory as a literal axis-aligned rectangle: correct geometry, but nothing like a real map, which reads as "a bunch of squares" rather than a continent. `jittered_grid_box()` in [render.py](render.py) walks each region's four straight edges through `_jitter_edge()`, which perturbs a handful of points along the edge perpendicular to it by a small deterministic amount. The trick that keeps neighbouring countries seamless: the random offset is derived from the edge's own *unordered* endpoints (`sorted((p0, p1))`), always generated walking from the lexicographically smaller point to the larger, then reversed if the caller wanted the other direction. Two regions that share a physical border compute that shared edge from either side and land on the identical jittered path — the border stops being straight, but it can never develop a seam, because both sides are deriving the same geometry from the same two input points, not two independent guesses that happen to usually agree. A faint graticule and a compass rose (both undeclared decoration, the same convention [modules/skewt](../skewt/MODULE.md) uses for its own isobar ticks) round out the "real map" reading; Ostholm Isles is a small hand-authored offshore polygon rather than another grid cell, since an island borders nothing and needs none of the jitter-matching machinery.

**What's new here, structurally:** a `legend-box` decoration with per-category swatches (`decoration`, real declared geometry) and labels (no declared box, the usual font-metrics reason); movement arrows as `decoration` polylines with a real declared box covering the line and arrowhead together, in the same one-id-covers-the-whole-shape pattern [modules/reaction](../reaction/MODULE.md)'s arrow uses; and territories sharing borders with zero gap, exactly like `harbour`/`northfield`/`southmoor` above but at ten times the count, which is what actually stresses the label-placement checks.

### What building it found

**A declared arrow with nothing behind its own id.** The first version wrote the arrow's line and arrowhead as two separate, un-tagged `<path>` elements and declared a `decoration` element with that arrow's id anyway — `module-ids-resolve` failed on all three arrows outright, because nothing in the SVG actually carried `data-pr-id="thrust-north"`. Fixed by grouping the line and arrowhead under one `<g data-pr-id="...">`, the identical shape as [modules/reaction](../reaction/MODULE.md)'s own arrow fix.

**Arrow points fed into the wrong coordinate space.** Arrow vertices are authored as `(col, row)` grid coordinates, exactly like a region's corners — but a region's corners go through *two* steps before reaching canvas space (grid → lon/lat → Mercator metres via `pyproj`), and the first version of the arrow code skipped the Mercator step, feeding single-digit grid numbers straight into a canvas conversion calibrated for six-and-seven-digit Mercator values. Every arrow landed thousands of pixels off-canvas, invisible until the id-resolve fix above stopped masking it entirely. `content-within-canvas` caught it the moment the arrows became measurable at all.

**Text too large for a genuinely narrow country.** Westmark and Corenia share a border with no gap — real adjacent countries do — and at the region-label font size used for the wider territories, "Westmark" nearly filled Westmark's own 56px width, so the label's own right edge landed almost exactly on the shared border with Corenia. `module-labels-clear-of-strokes` read that as the label sitting on Corenia's stroke. Not a placement bug so much as a font size that assumed every territory would be as wide as the biggest one; fixed by sizing region labels for the narrowest country actually in the map, not the widest.

**A false `owner` claim, the same recurring mistake this repertoire keeps making and keeps catching.** Legend category labels were first declared with `owner` pointing at their colour swatch, on the assumption that adjacent text belongs to the thing it names. The label sits *beside* the swatch, not inside its fill, and `module-label-within-feature` correctly refused it — removed, the identical fix [modules/reaction](../reaction/MODULE.md) and [modules/plot](../plot/MODULE.md) already record.

---

## The `europe` variant: real country borders, not a synthetic grid

`--name=europe` answers the complaint the fictional campaign map's rectangles fairly earned: "this doesn't look like a real map." It renders actual country boundaries — real coastlines, real borders, real concave and multi-part shapes (a mainland plus islands) — categorised by **UN geoscheme subregion**, a real classification sourced from the data itself, not asserted by this module.

```bash
node src/cli.ts module python --args "modules/map/render.py,--name=europe"
node src/cli.ts module python --args "modules/map/render.py,--name=europe,--misdeclare"
```

### Where the data comes from, and why it's bundled rather than fetched live

[Natural Earth](https://www.naturalearthdata.com/) 1:110m cultural vectors (`ne_110m_admin_0_countries`), public domain, no attribution required. Prepared once, offline, and committed as [modules/map/data/europe_countries.geojson](data/europe_countries.geojson) — 39 European countries, clipped to a `(-25, 34)`–`(45, 72)` lon/lat box so Russia's Siberian extent doesn't dominate the frame (its unclipped bounds run the full `-180` to `180`), lightly simplified (`shapely.simplify(0.02, preserve_topology=True)`) to keep SVG path sizes reasonable. A render never hits the network: reproducible offline, and not dependent on a third-party CDN staying up. The one-time preparation script is not part of `render.py` — it was a short, throwaway `geopandas` session; `render.py` itself only needs `shapely`/`pyproj` to read the bundled GeoJSON, the same dependency footprint as every other map render here.

### Choosing a real, sourced classification instead of asserting one

The category is `SUBREGION` — the Natural Earth dataset's own field, not a classification this module invents. That choice was deliberate: the reference request that prompted this (a WWII-era occupation map) would have meant asserting *which countries were occupied when, by whom, along what boundary* — real historical claims, disputed in places, and exactly the kind of specific factual assertion this project has no business fabricating from memory. UN geoscheme subregion is real, sourced, and carries no such risk, while still proving the actual capability being asked for: real coastlines, real categorical shading, a real legend, on a genuinely crowded, non-trivial map.

### What building it found

**A sign error hid every country label behind a always-false condition.** `to_canvas` flips the y axis (Mercator y grows north, SVG y grows down), so for a country's normally-ordered bounds (`miny < maxy`), the *canvas* y-coordinates come out reversed (`cy1 < cy0`). The label-eligibility check computed `area = (cx1-cx0) * (cy1-cy0)` without `abs()`, so the y-term was always negative and every country's "area" was negative — failing `area > threshold` for all 39 countries, silently, for every canvas size tried. Caught only by noticing that `module-label-within-feature` stayed `not-applicable` even at a 1000×800 render, which is geometrically impossible for a real map of that many countries if the gate were working. `abs()` fixed it.

**Real borders that touch make real, non-trivial label-placement problems — and fixing it took two escalating rounds.** The Balkans are Europe's classic dense cluster of small, adjacent countries (Albania, Bosnia and Herzegovina, Kosovo, Montenegro, North Macedonia, Serbia), and the first area-threshold pass labelled all of them, producing failures across the whole group at once — the same *shape* of problem [modules/genomic](../genomic/MODULE.md) and [modules/topology](../topology/MODULE.md) already hit with crowded, real content, at a larger scale. Raising a single area cutoff traded that failure for a new one (Greece's label crossing into Albania), because a fixed threshold can't know which specific neighbour a given country is closest to.

The fix that actually held: `representative_point()` on an **inward-eroded** copy of each country (pulling the candidate point away from every border at once, not just the nearest one), combined with a **real geometric fitness check** — before committing to a font size, build the label's estimated extent as a `shapely.box` and test `intersects()` against every *other* country's actual polygon, at full size first and a smaller fallback second, leaving a country **unlabelled** (not defaulted to a guaranteed collision) when neither size clears. That check needed its own correction once measured against the core rather than assumed: the character-width estimate undershot real semi-bold glyph width, tightened with a margin rather than re-tuned to the one case that exposed it — the same "estimate, then let the real check decide, and widen the margin rather than chase individual misses" discipline recorded in [modules/plot](../plot/MODULE.md) and [modules/dendrogram](../dendrogram/MODULE.md).

**Misdeclare, meaningfully exercised for the first time on non-trivial shapes.** The original harbour probe's bbox-centre trick only fails on one hand-built L-shape; every rectangular campaign territory is convex, so the same trick there is inert. On 39 real countries — several genuinely concave, several genuinely multi-part — `--misdeclare`'s bbox-centre placement now fails on more than one country for real reasons, not a single planted case, alongside the usual phantom-id and shifted-geometry checks.

---

## A second real region: `south_america`, and what generalised cleanly

`--name=south_america` renders 13 real countries from a second bundled Natural Earth file ([modules/map/data/south_america_countries.geojson](data/south_america_countries.geojson)), sharing every piece of the `europe` variant's machinery through one function, `_render_political_region` — the erosion-before-`representative_point` placement, the real `intersects()`-against-neighbours label-fit check, the `abs()`-corrected area gate, all of it applies unchanged, because none of it was ever specific to Europe's geography.

```bash
node src/cli.ts module python --args "modules/map/render.py,--name=south_america"
```

**South America's own `SUBREGION` field carries no categorical information** — Natural Earth assigns it a single value ("South America") for all 13 countries, unlike Europe's four. `ECONOMY` — the same dataset's development-tier classification — is what actually varies here, so that's the field this render colours by. Same principle as choosing `SUBREGION` for Europe: a real, sourced field the data provider assigns, never a classification this module invents.

**One new bug, caught immediately by the check that was already in place for exactly this reason.** The first legend title was long enough that, centred in the legend box, its text reached past the canvas's right edge — `content-within-canvas` failed on the very first render. Shortened the title rather than widen the canvas or shrink the font; the fix that changes the least usually is.

**What this proves that the Europe render alone couldn't:** that the label-placement discipline built for one region's specific trouble spots (the Balkans' density, Greece's border proximity) is actually general-purpose geometry, not a set of Europe-shaped patches. Zero label-collision fixes were needed for South America — the erosion-and-intersection-test logic simply worked on a different, more sparsely-populated map on the first try.