# 0066 — Measured series, schematic axes and five-option panels

## Status

Accepted. Extends [ADR 0022](0022-function-graph-preset.md),
[ADR 0024](0024-didactic-checks.md) and [ADR 0036](0036-areas-and-riemann-sums.md);
answers item 2 of [AUDIT-ENEM](../research/AUDIT-ENEM.md).

## The need

About 17 figures in ENEM day 2 (2023 Q132, 149, 156, 177, 178; 2024 Q101,
114, 152; 2025 Q108, 127, 135, 145, 167, 169; and the bars of 2025 Q154 and
163) came close to `function-graph` or `chart` and still could not be drawn
by either. They fall into three kinds:

- **line charts of measured data.** A curve through *given* points: a
  spectrum, efficiency against speed, production by harvest, exports month by
  month. Some have a category x axis, value labels at the markers, the area
  between two series shaded, or two y axes on different scales.
- **qualitative graphs.** P against T, force against time, an energy
  profile. The axes carry no numbers, only symbols (T, P₀, t₁, f₂). Arrows on
  the curve show the direction it is travelled, and dashed guides run from a
  point to its symbols. `axis-number-present` existed to fail an axis without
  its numbers, so a figure like this could not be drawn honestly at all.
- **five-option graph questions.** "Which graph represents…", answered by
  panels (A) to (E), each a small graph drawn at the same size as the others.

## The decision

### One home per kind, and why

- **Every series on a plane goes to `function-graph`.** That covers measured
  series, category axes, fills, two y axes, schematic axes and panels. The
  plane already does what a chart needs: it never drops a tick number, has
  `axis-number-present`, the labelling discipline of ADRs 0024, 0028 and 0035,
  areas between curves, guides, a legend search and the pt-BR formatter.
  `chart`'s line mode has none of these. It draws no axis and no gridlines,
  prints only 0 and the maximum, and formats `toFixed(1)`, which gives 2.5
  where the locale wants 2,5. Extending it would have meant building the
  plane a second time.
- **Bars stay `chart`'s.** A bar chart with a ruled, numbered y axis, or with
  a line over the bars (2025 Q154), is `chart` with `yAxis` or `overlay`. That
  input is *translated* into function-graph's plane, where categories become
  the category axis, series become `bars` and the overlay becomes `series`. The
  bar arithmetic for that plane lives once, in function-graph's `bars`. Bars
  without `yAxis` or `overlay` keep chart's existing flex path unchanged. A
  line chart asked of `chart` with `yAxis` is refused, with a pointer to
  `series`.

### Measured series (`series`)

`{id, points: [[x, y], …] | values: [...], interpolate, markers, valueLabels,
axis, arrows, label, legend}`. The interpolation is stated, never guessed:

- `linear` is the polyline drawn vertex for vertex at the data.
- `smooth` is a **monotone cubic** (Fritsch–Butland slopes on a Hermite
  spline). Between two points it stays within the interval their values
  span, so it cannot draw a peak the data lacks. A natural spline would.
- `step` holds each value until the next point.
- `none` draws markers only (a scatter).

Where x runs one way, a series is also a function y(x). Areas (`between`),
`{of, x}` points, curve labels and templates then work on it exactly as on
an expression. The fill's edge is the series' own vertices (`edgeOf`), so it
meets the drawn line at every kink. A linear series whose x turns back is a
**path** (a P–T process): it is drawn in order, and anything that needs y(x)
refuses it by name. A point outside the plotted range is refused rather than
clipped.

`valueLabels` print the *given* values through the formatter. Each one names
its data point (`annotatesPlace`). Its spot is searched so that the point is
nearer the label than any ink that does not pass through it, which is the
measure `label-nearest-its-place` applies. Markers are declared `on` their
series.

**Category axis.** `x.categories` puts category i at x = i and sets the
range to [0,5; n + 0,5]. The axis rules no line across the categories, and
each name declares its place. **y fitted to the data**: with series or bars
and no `y.range`, the range is widened to whole steps of 1, 2 or 5 × 10ᵏ
(`shared/scale.ts`). Units can come from `length` or are fitted.

**Two y axes.** `y2: {range, step, name, colour}` and a series with
`axis: "y2"`. The right axis takes the y axis's height, so its unit is
derived and never given. Its numbers and name are set in its colour.
Its required numbers travel on a frame of its own, `plane-y2`, which draws
nothing, so `axis-number-present` holds them. A point read off a y2 series
would print the plane's y instead of the series' own value, so it is
refused. Value labels print the series' own values.

**Bars.** `bars: [{id, values, legend, valueLabels}]` on a category axis,
grouped. A bar's height is its value from zero, and a y range that leaves
out zero is refused. The legend row's text is ink: a bar fill is a surface
colour, not an ink colour.

### Schematic axes

`axes: {schematic, grid, arrows}`, or `x.schematic` / `y.schematic`. A
schematic axis prints no number, refuses `require`, has no lattice unless
`grid: true` and ends in an arrowhead. `ticks: [{at, label}]` name places on
any axis. The label is typed text (`P_0` and `t_{1}` set real subscripts,
ADR 0062), and a label that parses as a number is refused: a number on an
axis is printed by a numbered axis. Each tick label declares its place.
Point `guides: "x" | "y"` draws one guide only. `arrows: [0.2, 0.8]` on a
function or series places arrowheads at those fractions of the drawn length.
The direction follows the drawing order, or `reverse: true`. Each arrowhead's
centroid sits on the curve and is declared `on` it, so
`feature-on-its-curve` measures it.

### What `axis-number-present` now asks

A promise about numbers is made per frame. Among the frames that require a
number or declare an axis without numbers, an axis is examined when its
frame rules a line along it:

- an axis with no number and no declaration **fails**;
- a declared axis that still requires numbers **fails**, because it contradicts
  itself;
- a declared axis **passes**, and the pass detail names it.

A frame that does neither is not asked, such as a unit circle's bare axes.

The declaration is a zero-ink grid mark `<frame>-schematic-<axis>`. It is a
**stand-in**. The honest home is a `GridAxis.schematic` field that frame
resolution would turn into that mark. `src/ir/**` is outside this item, so
the preset emits the mark and the check reads it. Both ends agree on one
documented id, as `<frame>-axis-x` already does for `Mark.on`.

### Panels

`panels: [...]` with `columns` (default 2). Each panel is a function-graph
input. Every field a panel leaves out comes from the set, so five panels
share one scale unless one overrides it, and cells are all one size. Each
panel is built alone and moved into its cell. Every id is prefixed `p<letter>-`,
and so is every reference to one: `annotates`, `names`, `on`, `gridOf`, and the
frames of framed points. Generated ids stay consistent with them, so `pA-plane`
still grids out `pA-plane-axis-x`. `series-distinguishable-without-colour` compares series
**within a panel**, scoped by that prefix. A reader tells curves apart inside
one graph, never across two options.

## What was refused

- **Growing chart's line mode into a plane.** That would build a second
  numbered plane beside the first, with its own tick placer, formatter and
  checks.
- **Turning off `axis-number-present` for numberless axes.** A figure would
  pass silently in exactly the case the check exists for. A declaration is
  the price of passing, and an axis without one still fails.
- **A natural cubic spline for `smooth`.** It overshoots beside every sharp
  change, so it would draw a value nobody measured.

## The cost, stated

- **The declaration is an id convention**, not a type, until the core grid
  carries `schematic`.
- **The panel scope is also an id convention** (`p<letter>-`) in the series
  check.
- **`answers: false` stays refused** by both presets, which are not in
  ANSWER_AWARE. Everything these features draw is given data, but an area's
  printed value is computed and would need hiding before either preset could
  join.
- **A dual-axis series cannot be read by `{of, x}`.** Value labels serve
  instead.
- **Bars are told apart by colour and legend only.** The series check reads
  stroked series, and bars are fills.

## Coverage

Drawn now: the line charts 2024 Q152 (two series, fill between, highlighted
values), 2025 Q135, 167 and 169 (measured curves, category axis with value
labels, five panels); the dual-axis chart of 2024 Q114 (its five curves as
series, the reference line a guide); the qualitative graphs of 2023 Q132,
177 and 178 and 2025 Q108, 127 and 145 (schematic axes, symbolic ticks,
arrows, guides, panels); 2023 Q149 and 156 (numberless y with a grid:
`y.schematic` with `axes.grid`); and the bars of 2025 Q154 and 163 (chart
`overlay` / `yAxis`).

Not drawn: 2024 Q101 sets its curve inside a perspective drawing of a
classroom, which is an illustration and not a plane. The pie of 2025 Q163 was
already covered. 2023 Q177's Ferris wheel is item 3's.

Fixtures: `fixtures/function-graph/series-monthly-temperature.json`,
`series-fill-between.json`, `series-dual-axis.json`, `bars-with-line.json`,
`schematic-position-time.json`, `panels-five-options.json`, and
`fixtures/chart/chart-bars-overlay.json`.
