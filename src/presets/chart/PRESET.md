# chart

Bar, line, scatter, pie and donut charts. A value with a scale, not a graph.

**Choose it when** the content is a series — values that carry a scale, compared across categories (`S-series-favours-chart`) — or the request explicitly asks to be drawn as a chart (`I-chart-favours-chart`): quarterly revenue, request counts by endpoint, a leaderboard by score.

**Do not choose it when** the content has no scale. A set of items with no numeric comparison is `labelled-blocks` (`S-series-disqualifies-blocks` fires the other way: once values genuinely carry a scale, blocks would show them as unordered text). Nor is a chart a graph: nodes and edges misrepresent a scale exactly as badly as blocks do (`I-chart-disqualifies-everything`).

**What this preset does not cover.** Curve fitting and function plots: sampling an expression, bisecting for a root and computing a least-squares fit are arithmetic no `Block` and no `Mark` performs, which is what keeps them in `modules/plot`.

**A pie used to be on that list, and no longer is.** This section read "a pie or donut chart needs a real wedge — a shape this preset's `Block`-based IR cannot express", and that was true when it was written. The Mark (ADR 0019) made a wedge expressible: an outline of two radii and an arc, flattened into the polyline every check walks. So the pie came into the core and `modules/piechart` was deleted, which is a strict gain in checking — see "Three code paths" below.

## Three genuinely different code paths, not one preset stretched thin

`chartType: "bar"` (the default) is pure `Stack`/`Block` arithmetic — see below. `chartType: "line" | "scatter"` is a different function entirely, building a `Scene{layout:"absolute"}` with a `Block` per data point and a `Connector` joining consecutive points when `"line"` (bare, unconnected, when `"scatter"`). This isn't a stylistic choice: a `Block` has no way to be "a point joined to another point", only a Scene's `Connector` can, so line/scatter needed the same absolute-coordinate shape `annotated-figure` and `graph` already use, not an extension of the flexbox trick that makes bars free. `orientation`, `stacking`, `maxBarLength`, `barThickness`, `barGap`, `groupGap` and `labelWidth` are bar-only and silently ignored otherwise; `plotWidth`/`plotHeight` are line/scatter-only.

Deliberately minimal, the same restraint the bar chart states for itself: no axis rule, no gridlines. Two end labels on the y axis (`0` and the largest value) say what a ruled line would, without one more shape that could collide with a point sitting exactly on the axis.

`chartType: "pie" | "donut"` is the third, and it is on this list for the same reason the second is rather than as a variant of it: a wedge is neither flexbox arithmetic on a rectangle nor a point joined to another point. It is a `Scene{layout:"absolute"}` whose slices are `Mark`s — a run out to the rim, round an arc, and back — with the share printed on each slice as an annotation that `annotates` it.

**The claim a pie makes, and what refuses it.** A pie asserts one thing: a slice's angle is its share. Both are derived from the same fraction, so they cannot drift apart on their own — and then `sweep-matches-its-label` measures the arc that was actually drawn and compares it against the percentage that was actually printed. That check already existed for angle marks; a share is the same claim in a different unit, so it kept its name rather than growing a near-duplicate beside it.

Two things fell out of building it, both recorded because both were caught rather than foreseen:

- **An arc past a half turn cannot be one segment.** Two endpoints and a centre name two arcs, and the minor one is the convention, so a 58% slice was drawn as the 151° left over. Slices are emitted in spans of at most 120° — not 180°, where the two candidates are the same length and the ambiguity is total; a full circle cut in half came back as an outline that retraced itself and enclosed nothing. `sweep-matches-its-label` adds a sector's rim arcs back up, grouping by radius so a donut's inner rim is not counted twice.
- **One ink cannot serve a categorical palette.** The theme's default text colour put four of five slice labels between 1.37:1 and 2.66:1, which `contrast-sufficient` reported because the label sits on the Mark and a filled Mark is a surface. Each label's ink is now chosen against the wedge it sits on.

A slice under 6% carries no inline share — there is no room to set one legibly, and a label the repair loop grew to fit would be a box bigger than the wedge it names. The legend lists every category's share regardless, which is why the pie's legend carries numbers and the bar chart's does not.

**Known, stated limit.** Two series with near-identical values at the same category place two markers close enough to partially overlap, which `boxes-do-not-overlap` will genuinely fail on — an honest collision, not a false positive. Real scatter data can produce this; small markers narrow the range of values where it happens, they do not remove it.

## A ruled bar chart, and a line over the bars (ADR 0066)

`yAxis: {name, range, step}` and/or `overlay: [{label, values, colour, axis}]` (with `y2Axis` for an overlay on a right axis), plus `xName`, draw a vertical grouped bar chart the way an exam prints one. The y axis is numbered and ruled, and a line runs over the bars (stock bars and a demand line). Such a chart is not drawn here. It is translated into `function-graph`'s plane (`ruledChart`): the categories become its category axis, each series a set of `bars`, each overlay a `series`. That plane already numbers, rules and checks an axis, and a line over bars needs one coordinate system for both. Bars without these fields are unchanged. A **line chart of measured data** is function-graph's `series`, not this preset's line mode, which stays the minimal axis-less path below; `yAxis` on `chartType: "line"` is refused with that pointer. Fixture: [`fixtures/chart-bars-overlay.json`](../../../fixtures/chart-bars-overlay.json).

## Conventions

- Bar length is a straight linear scale against the largest value in the data — no log scale, no truncated axis. A bar chart's whole claim is that length is proportional to value; anything else needs a different chart type and a label saying so.
- Multiple series get distinct colours from the same canonical palette every other preset draws from (`theme.ts`), applied categorically rather than through a semantic `role` — there is no "green" or "teal" role, only what a data series is *allowed* to look like, not what it *means*. A single series uses one colour throughout.
- Every bar's own value is labelled by default (`showValues`). Category labels sit on one common baseline regardless of value-label height, using the same bottom/left alignment (`align: "end"`) every other Stack-based preset already relies on — no bespoke layout code.
- Horizontal orientation exists for the case vertical bars serve badly: many categories, or long category names that would collide stacked vertically.
- `stacking` (default `"grouped"`): `"stacked"` composes a category's series end to end into one bar whose total length is their sum — the scale reference switches from "largest single value" to "largest category total", since a stacked bar's length represents a sum, not one series' value. `"stacked100"` stacks the same way but rescales every bar to one common total length, so segment length reads as a series' *share* of the category, not its magnitude. `series[0]` is always the segment closest to the axis (bottom in vertical orientation, left in horizontal) — first-declared, first-drawn.
- Stacked modes deliberately drop per-segment value labels. An inline label the repair loop grows to fit would inflate that segment's box past its true value, breaking the one invariant a bar chart exists to keep: length *is* the data. The legend already names every series; a stacked bar instead gets one total label (the category's sum, or `100%` in `stacked100`) next to the whole stack.

## Input

```json
{
  "preset": "chart",
  "orientation": "vertical",
  "categories": [
    { "label": "Q1", "values": [42] },
    { "label": "Q2", "values": [58] },
    { "label": "Q3", "values": [51] },
    { "label": "Q4", "values": [67] }
  ],
  "valueSuffix": "k"
}
```

Multiple series: give each category a `values` array of the same length, and name them with `series`:

```json
{
  "preset": "chart",
  "categories": [
    { "label": "Q1", "values": [42, 30] },
    { "label": "Q2", "values": [58, 39] }
  ],
  "series": ["This year", "Last year"]
}
```

Line series, two adjacent categories joined by a real Connector:

```json
{
  "preset": "chart",
  "chartType": "line",
  "categories": [
    { "label": "d1", "values": [42, 118] },
    { "label": "d2", "values": [40, 95] }
  ],
  "series": ["p50", "p99"],
  "valueSuffix": "ms"
}
```

Scatter — the same point geometry, deliberately never connected:

```json
{
  "preset": "chart",
  "chartType": "scatter",
  "categories": [
    { "label": "auth", "values": [12] },
    { "label": "search", "values": [88] }
  ],
  "valueSuffix": "kb"
}
```

Stacked, showing composition rather than comparison:

```json
{
  "preset": "chart",
  "stacking": "stacked100",
  "orientation": "horizontal",
  "categories": [
    { "label": "NA", "values": [40, 35, 25] },
    { "label": "EU", "values": [30, 45, 25] }
  ],
  "series": ["Organic", "Paid", "Referral"]
}
```

Fixtures: [`fixtures/chart-quarterly-revenue.json`](../../../fixtures/chart-quarterly-revenue.json), [`fixtures/chart-stacked-budget.json`](../../../fixtures/chart-stacked-budget.json), [`fixtures/chart-stacked100-horizontal.json`](../../../fixtures/chart-stacked100-horizontal.json), [`fixtures/chart-line-latency.json`](../../../fixtures/chart-line-latency.json), [`fixtures/chart-scatter-single.json`](../../../fixtures/chart-scatter-single.json)
