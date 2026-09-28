# sequence — Discrete sequences and partial sums

## What it is

A sequence aₙ is drawn as filled dots on a gridded plane, one dot per term — a real `Frame` with a lattice, pt-BR ticks, and two arrowed axes: "n" horizontal, "aₙ" (or "Sₙ") vertical. Every point is **computed** from the expression, never typed.

Partial sums Sₙ = a₁ + a₂ + ... + aₙ can be drawn as a separate series, and `limit: true` draws a dashed limit line for **every series shown that converges**, each at its **own** computed limit — the terms' limit and the series' (partial sums') limit are generally different numbers (1/2ⁿ's terms head to 0; its partial sums head to 1), and each line is labelled beside itself, in its own series' colour.

## Input

```json
{
  "preset": "sequence",
  "term": "1/n",
  "n": [1, 12],
  "show": "terms",
  "limit": false
}
```

| field | type | default | what it does |
| --- | --- | --- | --- |
| `title` | string | "sequência" | figure title |
| `locale` | "pt-BR" \| "en-US" | "pt-BR" | number formatting and axis labels |
| `term` | string | (required) | the term expression, in variable "n" |
| `n` | [number, number] | (required) | range [start, end], both inclusive integers ≥ 1 |
| `show` | "terms" \| "partial-sums" \| "both" | "terms" | what series to plot |
| `limit` | boolean | false | draw a dashed limit line for every convergent series shown |

### Expressions

The `term` field is compiled and evaluated with `n` as the free variable, using the same expression language as `function-graph` and `sign-chart`:

- Arithmetic: `+`, `−`, `*`, `/`, `^` (power)
- Functions: `sqrt`, `abs`, `sin`, `cos`, `tan`, `exp`, `ln`, `log`, `log10`, `floor`, `ceil`, `round`
- Constants: `π`, `pi`, `e`
- Special forms: `if(cond, then, else)`, `max(...)`, `min(...)`

Example: `"(-1)^n / n"` for the alternating harmonic series.

### The plane

- A real gridded `Frame` (ADR 0034): a light lattice, integer ticks on n, pt-BR-formatted ticks on the value axis, and a heavier zero line where the value range actually contains zero.
- Both axes are drawn as arrowed connectors and named: "n" for the horizontal axis; "aₙ", "Sₙ", or "aₙ, Sₙ" for the vertical one, depending on `show`.
- x and y each get their own scale — a sequence plot is not a geometric figure whose angles must be preserved, and a wide n range paired with a narrow, nearly-converged value range is common.

### Output

- Each term aₙ is drawn as a filled dot at (n, aₙ). Dots are never joined by a line — a sequence is discrete.
- When `show: "both"`, both series appear in different colours (blue for aₙ, rust for Sₙ), with a legend that **searches for free space** — never a fixed coordinate, never drawn over a dot or a line — using proper subscripts (aₙ, Sₙ), never an ASCII underscore.
- When only one series shows, there is **no legend**; the y axis is named instead (aₙ, or Sₙ).
- When `limit: true`, a dashed limit line is drawn **for every series shown that converges**, each at its own computed limit, in its own series' colour. Each line's label sits **beside** it (above or below, never on the line, never past the canvas edge), declaring `annotates` the line it names, and its value is printed exactly when it snaps to a rational, a root, a multiple of π or a power of e ("lim aₙ = 0", "lim aₙ = e"), and with "≈" otherwise.
- All numbers use the specified locale (pt-BR: decimal comma, fractions like 17/3, minus sign "−").

## Constraints

- n must be integers in the range [1, ∞).
- All term values must be finite (no ±∞, no NaN).
- Maximum 60 terms (to keep rendering fast).
- Empty or reversed ranges are refused.
- A series' limit is computed only at integer n — the term expression is not assumed continuous (`(-1)^n/n` is not defined at a fractional n), so both the terms' limit and the partial sums' (series') limit are read off an integer-indexed approach to infinity, never a continuous one.
