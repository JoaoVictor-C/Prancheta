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

## Where it came from

The Cálculo 1 sheet in `experiments/exercises/calculo1/` was drawn with a helper script; its fifteen figures are now the fixtures of this preset (`fixtures/function-graph/calc1-*.json`), and the defects that reached the student are the reason for each rule above. See ADR 0022. The curves beyond graphs of functions are ADR 0029; their fixtures are `fixtures/function-graph/curve-*.json` — an ellipse and a circle from their equations, and a cardioid with a point and tangent read off it by θ.
