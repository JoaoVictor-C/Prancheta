# function-graph

Curves on a numbered plane: functions y = f(x) (piecewise if needed), parametric, polar and implicit curves, tangent and secant lines, closed and open points, dashed guides to the axes, direct labels and a legend. A figure is a document — nothing in it is code, and nothing in it is a number typed twice.

**Choose it when** the content is a function over a continuum (`S-function-favours-function-graph`): a parabola and its tangent, the secants that approach it, a piecewise function with a hole, position–velocity–acceleration on one set of axes, simple against compound interest — or a curve of Geometria Analítica that is not the graph of a function: a conic from its equation, a cardioid, a curve traced by a parameter.

**Do not choose it when** the content is a finite list of values — that is a series, and a `chart` (`S-function-disqualifies-chart` refuses the chart the other way round). A function is never a node-and-edge `graph`, whatever the word says (`S-function-disqualifies-graph`).

## Input

```json
{
  "preset": "function-graph",
  "locale": "pt-BR",
  "x": { "range": [-1, 5], "unit": 90, "name": "x" },
  "y": { "range": [-2, 16], "unit": 22, "labelEvery": 2, "require": [9] },
  "functions": [
    { "id": "f", "expr": "x^2", "label": { "text": "y = {expr}", "at": -0.6, "towards": ["U", "R"] } }
  ],
  "lines": [
    { "id": "t", "tangent": { "of": "f", "at": 3 }, "domain": [1.4, 4.4], "colour": "warm",
      "label": { "text": "inclinação = {slope}", "at": 1.8, "towards": ["R", "D"] } }
  ],
  "points": [
    { "id": "P", "at": { "of": "f", "x": 3 }, "label": "P{coords}", "towards": ["L", "NW"], "guides": true }
  ]
}
```

- **Axes.** `range` in axis units, `unit` in pixels per unit, `step` for the lattice (default 1), `labelEvery` to print every nth number, `name` for the axis name ("" for none), `require` for numbers that must be printed even off the lattice. The lattice is anchored at zero, so a range of [−0.5, 4.5] still rules its lines at the integers.
- **Functions.** `expr` over `domain` (default: the whole x range), or `pieces: [{expr, domain}]`. Expressions accept `x` (or the x axis's name, e.g. `t`), `+ − * / ^`, implicit multiplication (`2x`, `3(x + 1)`), `x²`, `√`, `pi`, `e`, and `sin cos tan asin acos atan sinh cosh tanh exp ln log(=log₁₀) log2 sqrt cbrt abs sign`. Decimals use a point in expressions (`1.2`); the figure prints them in the locale. `features: ["roots", "extrema"]` marks computed roots and local extrema.
- **Curves that are not graphs** (ADR 0029). In `functions`, instead of `expr`:
  - **parametric** — `{"id": "c", "x": "cos(t)", "y": "sin(t)", "t": [0, "2pi"]}`: both expressions in `t`;
  - **polar** — `{"id": "k", "r": "1 + cos(θ)", "theta": [0, "2pi"]}`: `r` in `θ` (or `theta`); negative r is drawn opposite;
  - **implicit** — `{"id": "e", "implicit": "x^2/9 + y^2/4 = 1"}`: an equation in `x` and `y` (or the axes' names), drawn wherever it holds in the plotted range.

  An interval's ends may be expressions without variables (`"2pi"`, `"pi/2"`), since JSON cannot write 2π. `xy` is x·y when x and y are both variables; see `src/math/expr.ts` for the rule. Parametric and polar curves are sampled adaptively in pixels, so they are smooth where they are fast and are **broken, not joined**, across a pole or a jump; an implicit curve is traced by marching squares with every vertex bisected onto the curve (`src/math/contour.ts`). All three are clipped exactly at the plotted range, are series like any function, and take labels, legends and the checks below. `domain` and `features` belong to y = f(x) and are refused on them. A curve that draws nothing in the range is refused.

  What differs is how a place on them is named: a label's numeric `at`, a point's `{of, …}` and a tangent's `at` are the curve's own coordinate — `x` on a graph, `t` on a parametric curve, `θ` on a polar one (`{"of": "k", "theta": "pi/2"}`). An implicit curve has none: its label takes a point `[x, y]` and is anchored at the curve's nearest point, and points and tangents on it are refused. `{expr}` prints `(cos(t); sin(t))`, `1 + cos(θ)`, `x²/9 + y²/4 = 1`.
- **Lines.** Exactly one of `through: [A, B]` (a secant), `point` + `slope`, or `tangent: {of, at}` (slope computed; for a parametric or polar curve `at` is t or θ and the slope is y′/x′ — a vertical tangent is refused, a line here is y = mx + b). `domain` is the x interval drawn. `series` groups several lines as one thing to tell apart.
- **Points.** `at` is `[x, y]`, the id of an earlier point, or a point read off a curve: `{of: "f", x: 2, side: "left"}` on a graph (`side` picks the piece at a break), `{of: "c", t: 1}` on a parametric curve, `{of: "k", theta: "pi/2"}` on a polar one. `style: "open"` draws ○ (does not belong to the graph), default ● (belongs). `guides: true` draws dashed guides to both axes.
- **Guides.** `{x, from, to}` or `{y, from, to}`: a dashed reference line. Guides are cut around any axis number they would run through.
- **Areas** (ADR 0036). `areas: [...]`, each one of:
  - `{"of": "f", "from": 0, "to": 2}`: the region between the graph of f and the x axis;
  - `{"between": ["g", "f"], "from": a, "to": b}`: the region between two graphs;
  - `{"between": ["g", "f"]}`: the same, bounded by the curves' first and last intersection, found numerically and snapped to the exact value (x² and x + 2 meet at exactly −1 and 2). Fewer than two intersections is refused.

  `from` and `to` are bounds like any other (`"pi/2"`, `"2pi"`). The outline is sampled from the expressions, never typed. Every vertex is stated in the plane's frame, so `area-matches-its-label` (ADR 0037) measures it. Where the integrand changes sign the region is cut into parts, each shaded by sign: `colour` (default: the first curve's) above, `negativeColour` (default rust) below.

  Each part's label states that part's **geometric area**, computed by `numeric.integrate`: `"A = 8/3"`, or `"A₁ = 2"` and `"A₂ = 2"`. `label` is a template (`{area}`, `{integral}`, `{i}` for the part's subscript) or `false`. With several parts, a caption gives the total area (`"A = 4"`). With `"value": "integral"` the caption gives the **signed integral** (`"∫ = 0"`). `total` is `false` or a template. A pole inside the interval, a region the plotted range would clip, and a curve that is not y = f(x) are refused.
- **Riemann sums** (ADR 0036). `riemann: [{"of": "f", "from": 0, "to": 2, "n": 4, "rule": "left"}]`, with `rule` one of `left`, `right`, `mid`, `trapezoid`. The figure draws exactly the rectangles `numeric.riemann` summed; where f < 0 they stand below the axis. It marks the sample points on the curve (`"points": false` to omit them) and outlines the rectangles' union. `"label": true` prints the sum, `"S₄ = 1,75"`, or a template with `{sum}`, `{n}` and `{integral}`. `"integral": true` prints the exact integral beside it, `"∫ = 8/3"`.
- **Asymptotes** (ADR 0038). On a function given by `expr`, `"asymptotes": true` draws every asymptote the numerics confirm, found from the expression — never typed:
  - **vertical** `x = a`: where the expression may blow up (a denominator's zero, a logarithm's, tan's) or where the sign chart's root finder sees a pole, kept only where a one-sided limit is ±∞; `a` is snapped to the exact value it is (`x = 1`, `x = π/2`);
  - **horizontal** `y = L`: a finite limit as x → +∞ or −∞; the same L at both ends is one line across, different ones (arctan) are each drawn only toward their own side;
  - **oblique** `y = mx + q`: m = lim f(x)/x ≠ 0 and q = lim (f(x) − mx), both finite (`y = x` for (x² + 1)/x).

  An object picks kinds: `{"vertical": true, "horizontal": false}`. A kind set to `true` that the function does not have is **refused by name**, as is `"asymptotes": true` on a function with none (a polynomial); a kind left out is drawn if found. `"vertical": [1, "pi/2"]` claims exactly those, each confirmed by its limits (a hole claimed as an asymptote is refused and called a hole). A limit the numerics cannot settle (ln x at 0, which grows too slowly for `numeric.limit`) is not drawn. A function that is itself a line has no oblique asymptote.

  Each asymptote is a thin (1.4px) dashed line in its function's colour, under the curve, across the plotted range, and is its own series; its label is its computed equation in the axes' names (`x = 1`, `y = 2`, `y = 2x − 1`, `≈` if a number could not be snapped), set **beside** the line — never on it — where that line is nearer the label than any other mark and any other series. The label `annotates` the line and `names` its series. A vertical or horizontal asymptote yields to the axis number on its gridline as a guide does: the number keeps its spot, the dashed line is cut around it.
- **Holes** (ADR 0038). `"holes": true` finds every removable discontinuity — where f is undefined but has one finite limit from both sides ((x² − 1)/(x − 1) at 1) — and draws an open ring ○ at (a, lim f), over the curve with paper inside, declared to lie on the curve. `"holes": [4]` names them instead (a hole the expression never skips, `x + 4` with x ≠ 4, must be declared); y is still the limit. `{"label": "{coords}", "towards": [...]}` labels each with its computed point. A hole where the limit is not finite is refused. A piecewise function's open and closed ends remain `points`.
- **The curve is never joined across a pole.** A graph with asymptotes or holes is sampled adaptively on each stretch between them and clipped exactly, so it runs up to the plot's edge beside a vertical asymptote. Every other graph keeps its 240 even samples, but two in-range samples that straddle a pole or a jump are no longer joined.
- **How an area or a sum is printed.** An exact decimal of up to six places (`2,1875`), else the formatter's fraction (`8/3`), else three decimals with the `=` before the number turned into `≈` (`A ≈ 1,718`).
- **Labels.** `labels: [{text, at, towards, names}]` for free text; `names` marks it as the direct label of a series.
- **Legend.** Every function or line with a `legend` text gets a row. The legend is placed by search — the first spot clear of curves, guides, axes, numbers and labels, corners first. `legend.at` pins it, but the search is the point.
- **Colours.** `ink key ask rust warm soft purple ochre`, or `#rrggbb`.

### Text is computed, never typed

Every label, curve label and legend row is a template:

| placeholder | prints |
| --- | --- |
| `{coords}`, `{x}`, `{y}` | the labelled point's own coordinates |
| `{P}`, `{P.x}`, `{P.y}` | point `P`'s |
| `{expr}`, `{f.expr}` | a function's formula, set as `x² − 4x + 1` |
| `{slope}`, `{L.slope}` | a line's slope |
| `{=0.5}` | a number, formatted |
| `{y:2}` | any of the above with fixed decimals, as for money |

A literal pair such as `(2; 5)` or `(2, 5)` in label text is **refused**: it is a second statement of a number the figure already computes, free to disagree with it. The formatter (`src/locale/format.ts`) writes pt-BR pairs with a semicolon, `(2,5; 7,25)`, decimals with a comma, the minus as `−`, and a value like 17/3 as `17/3` rather than a rounded decimal that is a different number.

## What the checks hold it to

- **Axis numbers.** Every number the preset prints, and every one in `require`, is declared on the grid; `axis-number-present` fails if one is missing or has drifted more than half a division from its tick. A number whose usual spot has ink slides along its own gridline, to either side of the axis, and only as a last resort keeps its spot on a paper backing.
- **The zero line** is drawn whenever the range contains zero.
- **Series told apart without colour.** Each function and line is a series; `series-distinguishable-without-colour` fails when two share a stroke style and one has no direct label. A legend does not count — a legend tells series apart by colour.
- **Curve labels.** A direct label must sit nearer its own curve than any other (`curve-label-nearest-its-curve`).
- **Every label names something** (`label-declares-what-it-names`, ADR 0035). A point's label names its point and a legend row the end of its swatch (`label-nearest-its-place` holds both beside them); a free label names its series, or else the point it is anchored at; the axis names are declared free-standing.
- **Backings hide nothing.** A tick number's paper backing may break its own gridline, never a curve or an axis (`backing-hides-no-ink`); a number's contrast is measured against the gridlines running under it too.
- **Asymptote labels name their lines.** Each `annotates` its dashed line (`annotation-nearest-its-owner`) and `names` its series (`curve-label-nearest-its-curve`, and `series-distinguishable-without-colour` counts it as the line's direct label); a hole's ring is declared `on` its curve (`feature-on-its-curve`) and its label names its place.
- **Areas match their labels.** Each region's label `annotates` its closed mark and is placed so that mark is the nearest thing drawn to it: inside the region where it fits, else against it. `area-matches-its-label` then measures the polygon against the number printed. A sum's label names the outline of its rectangles, whose area is the sum. A total or an integral caption names no single mark and is declared free-standing.

## Where it came from

The Cálculo 1 sheet in `experiments/exercises/calculo1/` was drawn with a helper script; its fifteen figures are now the fixtures of this preset (`fixtures/function-graph/calc1-*.json`), and the defects that reached the student are the reason for each rule above. See ADR 0022. The curves beyond graphs of functions are ADR 0029; their fixtures are `fixtures/function-graph/curve-*.json` — an ellipse and a circle from their equations, and a cardioid with a point and tangent read off it by θ. Areas and Riemann sums are ADR 0036; their fixtures are `fixtures/function-graph/area-*.json` (under x², between x² and x + 2, sin on [0, 2π] as area and as signed integral) and `riemann-*.json` (left and midpoint sums of x² with n = 4 and 8, and a right sum with rectangles on both sides of the axis). Asymptotes and holes are ADR 0038; their fixtures are `fixtures/function-graph/asym-*.json` — (2x + 1)/(x − 1) and 1/(x − 1) with their vertical and horizontal asymptotes, tan with x = ±π/2, arctan with y = ±π/2 on its two sides, (x² + 1)/x with y = x, 1/(x − 1)² + 1 with asymptotes claimed by name, and the holes of (x² − 1)/(x − 1) and sin(x)/x.
