# sign-chart

The sign table of a function — the *quadro de sinais*: where f, f′, f″ or the factors of a product are positive, negative or zero, where f is undefined, and where f rises and falls. Written once, as the function's expression; every boundary, sign and value in the table is found from it.

**Choose it when** the question is about intervals rather than shapes: where is f positive, where does it grow, where is it concave up, which x solve an inequality like (x − 1)(x + 2)/(x − 3) ≥ 0. It is offered beside `function-graph` for any function (`S-function-favours-sign-chart-weakly`) and never chosen over it: the graph shows the shape, the table states the intervals, and both are computed from the same expression, so they cannot disagree. In a sheet, put the two side by side (`"solutionFigure": [graph, table]`, markers `{{figure}}` and `{{figure2}}`).

## Input

```json
{
  "preset": "sign-chart",
  "expr": "x^3 - 3x",
  "rows": [{ "row": "f'", "label": "f′(x) = 3x² − 3" }, "variation"]
}
```

- **`expr`** — the function, in the same expression language as `function-graph` (`x^2`, `2x`, `1/x`, `sqrt(x)`, `ln(x)`...).
- **`rows`** — top to bottom, any of: `"f"` (sign of f), `"f'"` (sign of f′), `"f''"` (sign of f″), `"variation"` (arrows for where f rises and falls, with f's value at each critical point: at the top for a maximum, at the bottom for a minimum), `"concavity"` (∪ or ∩). A row may be `{ "row": "f'", "label": "f′(x) = 3x² − 3" }` to print the derivative's formula — a label, never a number the table uses. Default `["f'", "variation"]`.
- **`factors`** — `[{ "label": "x − 1", "expr": "x - 1" }, ...]`: one sign row per factor above the others, the classic table for solving an inequality. With factors and no `rows`, the last row is the sign of f itself.
- **`search`** — where to look for roots and poles, default `[-10, 10]`.
- **`undefinedAt`** — points outside the domain the search cannot see, such as a removable hole.
- **`variable`**, **`name`** — for the header and the default labels (`t`, `s`); default `x` and `f`.

## How the table is found

- **Roots** by sign change and bisection, plus roots that touch zero without crossing it ((x − 1)² at 1), found as near-zero minima of |g|.
- **Poles**: a sign change where the function is huge, not small, is a pole — 1/x changes sign at 0 without ever being 0 — and is marked **‖** in every row, since f′ and f″ are undefined there too.
- **Exact values**: each root is snapped to the fraction or square root it is, if the function vanishes there, so the header prints `√3` and `5/3`, not `1,732` and `1,667`.
- **Signs** are the sign of each row's function at the midpoint of each interval. f′ and f″ are central differences of f, so nothing about the derivative is typed.

## What is not covered

A root outside `search` is not found, and neither is a hole the function does not visibly skip (write it in `undefinedAt`). The value printed at a critical point is f there; limits at ±∞ and at poles are not computed — the arrows say which way f goes, not where it ends.

## answers: false

In an exercise sheet, the question's figure passes `answers: false` (set automatically
by the sheet dispatcher for ANSWER_AWARE presets); the solution figure draws the same
input with the default `answers: true`. When `answers: false`:

- **Sign chart**: the row names and variable name remain, the structure (frame, column
  dividers) stays; all critical points and computed signs/values are hidden. No intervals
  are marked: the question is where to draw them. The header row with boundaries (-∞, 
  critical points, +∞) is omitted.

This is the "study the sign" figure — the student must find the roots and poles and fill in
the signs and values herself.
