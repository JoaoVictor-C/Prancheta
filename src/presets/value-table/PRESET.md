# value-table

A table of x values and function values: the *tabela de valores* used in Cálculo 1 and school mathematics to evaluate functions at specified points. Written once, as the functions' expressions; every cell is computed from them.

**Choose it when** you need to show numeric values of one or more functions at specific points — to illustrate growth, compare functions, find where they are equal, or solve equations numerically. The table complements a `function-graph` (the graph shows shape, the table shows exact values at points you choose) or stands alone.

## Input

```json
{
  "preset": "value-table",
  "variable": "x",
  "xs": [-2, -1, 0, 1, 2],
  "functions": [
    { "name": "f", "expr": "x^2 - 1" },
    { "name": "g", "expr": "2x + 1" }
  ],
  "orientation": "rows"
}
```

- **`xs`** — the x values (points where functions are evaluated). Array of numbers; required.
- **`functions`** — array of `{ name, expr }`, required.
  - **`name`** — how the function is labelled (e.g., "f", "P(x)", "arrecadação").
  - **`expr`** — the function, in the same expression language as `function-graph` (`x^2`, `2x`, `1/x`, `sqrt(x)`, `ln(x)`...).
- **`orientation`** — `"rows"` (default) or `"columns"`.
  - `"rows"`: functions are rows, x values are columns (standard Brazilian format).
  - `"columns"`: functions are columns, x values are rows.
- **`variable`** — the variable's name, printed in the header. Default `"x"`.
- **`locale`** — `"pt-BR"` (default) or `"en"`.

## How values are computed and printed

- **Every cell is computed** by evaluating the compiled expression at that x value. The author never types a cell value.
- **Undefined values** (poles, roots of fractions, etc.) are marked **∄** (symbol for "does not exist").
- **Numbers print** with the figure's locale (decimal comma in pt-BR, fractions like 17/3 preferred over rounded decimals).
- **Central differences** would let you compute f′(x) from f: future work if an exercise asks for it.

## What is not covered

- No orientation combination (matrix transpose) — choose one layout up front.
- No automatic x values (like `{start: -2, step: 0.5, count: 9}`): list the points you want.
- No multiple sheets per table (like `function-graph` allows) — one table per preset call.
