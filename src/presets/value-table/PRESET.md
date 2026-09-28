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

## Limit mode: "tabela de valores para estimar um limite" (ADR 0039)

A second, mutually-exclusive input shape for the exercise that asks the student to
complete a table and estimate lim<sub>x→a</sub> f(x), with the classic Brazilian
decimal schedule: for a = 1, x = 0,9; 0,99; 0,999; 0,9999 on the left and
1,1; 1,01; 1,001; 1,0001 on the right.

```json
{
  "preset": "value-table",
  "limit": {
    "expr": "(x^2 - 1) / (x - 1)",
    "at": 1,
    "side": "both",
    "count": 4
  }
}
```

- **`limit.expr`** — the function, in the function-graph/sign-chart expression language.
- **`limit.name`** — how the function is labelled in the row (`f`, `g`, ...). Default `"f"`.
- **`limit.at`** — where x approaches: a finite number, or `"inf"`/`"-inf"` for ±infinity.
- **`limit.side`** — `"left"`, `"right"`, or `"both"` (default `"both"` for a finite `at`;
  for an infinite `at`, the direction the sign already implies — `"right"` for `"inf"`,
  `"left"` for `"-inf"`).
- **`limit.count`** — decimal steps per side, 1–8. Default 4, the classic four-row table.

`limit` cannot be combined with `xs`/`functions` — choose one mode.

**The samples ARE the evidence.** `numeric.ts`'s `limit()` function, called with
`{schedule: "decimal", count}`, samples exactly the x values printed — a ± 10^-k for
k = 1..count (scaled when `|at|` is large, so a table for `at = 100` steps by 90, 99,
99,9, 99,99 rather than a step too small to matter), or 10^k toward an infinite `at`.
The conclusion is computed from a separate, denser (twelve-step, geometric) sampling
for reliability, but is only ever REPORTED when the printed decimal samples actually
back it up — see "What is refused" below. Evidence and verdict can never disagree,
because the printed table is what decides whether the dense verdict is trustworthy
enough to state.

**What is drawn.** The left arm (if `side` includes it), then a column for `at`
itself — the value if f is defined there, "∄" otherwise — highlighted so it reads as
the point both arms converge on, then the right arm. Each arm carries a header stating
the direction of approach: "x → 1⁻" / "x → 1⁺" for a finite `at`, "x → +∞" / "x → −∞"
for an infinite one. Below the table, separated by a rule:

- a finite limit: `"lim f(x) = 2"` (exact value, snapped the way `sign-chart` snaps a
  root — 2, 1/2, √2, and here also π and e — when the numeric value is within
  tolerance of a simple exact number: (1 + 1/x)ˣ at +∞ prints `"lim f(x) = e"`)
  or `"lim f(x) ≈ 0,693"` (a formatted decimal, otherwise);
- an infinite limit: `"lim f(x) = +∞"` or `"lim f(x) = −∞"`;
- no limit (the one-sided results disagree, or one/both never settle): `"o limite não
  existe"`, with both one-sided verdicts printed beneath it — `"x → 0⁻: lim = −1"`.

**What is refused, honestly.** A function whose fine sampling settles but whose four
printed decimal samples do not themselves look settled (checked against the dense
verdict, `numeric.ts`'s `decimalOneSided`) is reported as `"não existe"` rather than a
"finite" verdict the visible evidence disputes. `sin(1/x)` at 0 is the canonical case:
its dense schedule already fails to settle, so its decimal table is honestly reported
as inconclusive rather than snapped to a plausible-looking number.

**Numbers print pt-BR** (`0,9`; `0,999`; `1,9999`) through the one locale formatter,
except the x-schedule column, which is printed at the exact decimal width the step
actually is — `formatNumber`'s own "shortest honest form" would round 0,9999 to 1 and
make the fourth decimal step indistinguishable from `at`.
