# number-line

The "reta real" used to answer an inequality, a domain, or a union/intersection of sets — a horizontal line with the boundary points marked (● included, ○ excluded) and the solution picked out in ink, rays to ±∞ carrying an arrow. Written once, as text; every boundary, every open-or-closed mark and the axis range itself are found from it.

**Choose it when** the answer is a set of real numbers described by an inequality, a domain restriction, or a combination (union/intersection) of such sets — the figure a Brazilian Cálculo 1 student draws under an inequality to state the solution set.

## Input

```json
{ "preset": "number-line", "set": "x < -1 ou 2 ≤ x < 5" }
```

```json
{ "preset": "number-line", "set": "[-2, 3) ∪ (4, +∞)" }
```

Several named rows, with a combined row **computed**, never typed:

```json
{
  "preset": "number-line",
  "rows": [
    { "label": "A", "set": "x ≥ -1" },
    { "label": "B", "set": "x < 3" },
    { "label": "A ∩ B", "op": "intersection" }
  ]
}
```

- **`set`** — shorthand for one unlabelled row. Mutually exclusive with `rows`.
- **`rows`** — top to bottom. A leaf row is `{ label?, set }`: text describing a set. A computed row is `{ label, op: "union" | "intersection", of? }`: its interval set is found by combining the rows named in `of` (default: every row declared before it) — nothing about a computed row is written by hand except its label and which rows feed it.
- **`variable`** — the letter read in an inequality chain and printed at the right end of the axis. Default `x`.
- **`locale`** — `pt-BR` (default) or `en`; only changes the decimal mark and pair separator, never the mathematics.

## The set-description grammar

Two notations, and either may be used for any row or branch:

- **Interval brackets**: `[a, b]`, `(a, b)`, and the Brazilian `]a, b[` for an open end (`]` and `(` are interchangeable as an opening exclusive mark, likewise `[` and `)` as a closing exclusive mark). `+∞`/`-∞` (or `inf`/`infinito`) are accepted as a bound and are always exclusive — `[2, +∞]` is refused, write `[2, +∞)`.
- **Inequality chains**: `x < 5`, `5 ≤ x`, `-1 < x ≤ 3`, or two one-sided inequalities joined by `e` ("and"): `x > 1 e x < 5`. `<=`, `>=`, `≤`, `≥` are all accepted.

Several branches of either notation may be joined with `∪` or `ou` ("or") to describe a union directly in one row: `x < -1 ou 2 ≤ x < 5`. `R`, `ℝ` and "todos os reais" mean the whole line; `∅`, "vazio" mean the empty set.

**Separator inside brackets.** An interval's two bounds are split on `;` if the bracket contains one, else on the first `,`. This is why a decimal endpoint needs care: write `[2,5; 3,7]` (semicolon separates, comma is the decimal mark, matching this project's pt-BR pair convention elsewhere) or `[2.5, 3.7]` (comma separates, dot is the decimal mark). `[2,5, 3,7]` is ambiguous and is refused rather than guessed at.

**Endpoint numbers.** A plain number is written through the project's one pt-BR formatter (`src/locale/format.ts`) — `-1` prints as `−1`. A fraction (`5/3`) or a square root (`√2`, `raiz de 2`) is kept exactly as stated, the same discipline `sign-chart` (ADR 0027) holds for a snapped root: the input asserts the exact value, so the label prints the exact value, never a rounded decimal.

## What is drawn

A single unlabelled row draws one line: the axis, tick marks and numbers at every boundary, arrows at both ends, and the solution picked out in a heavier stroke with a filled or open circle at each finite endpoint.

Several rows draw a line per row (labelled at the left, in declaration order) above one shared axis at the bottom, whose tick marks are every boundary pooled from every row — so a reader compares row A against row B against the computed row directly below, the classic layout for solving a system of inequalities.

## What is not covered

The axis range is derived only from the boundaries the rows actually state; a row whose set has no finite boundary at all (the whole line, or the empty set) does not by itself widen or narrow it. Equalities (`x = 3`, a single point) are not part of the grammar — write the point's neighbourhood as two touching inequalities if a single marked point is truly needed.
