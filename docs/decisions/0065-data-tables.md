# 0065 — Data tables: given data drawn, derived cells computed

## Status

Accepted. Item 1 of phase 6 ([`docs/research/AUDIT-ENEM.md`](../research/AUDIT-ENEM.md)). Reuses the
measured column widths of `truth-table` ([0057](0057-boolean-logic.md)), the rich
text of [0062](0062-rich-text-and-the-reading-panel.md) and the bundled-font
measurement of [0063](0063-one-font-measured-before-and-after.md).

## The need

The audit found 25 figures in three ENEM years that are plain tables: five water
tests, staff by sector and salary, monthly sales of two products, a nutrition
label, a ranking. `value-table` computes every cell from an expression and could
not draw any of them; the fallback was raw IR, a grid of hand-placed boxes whose
column widths were guessed.

## The decision

**`data-table` draws what is given and computes only what is derivable.** The
author types the facts (text, numbers, blanks); the preset measures every cell
and header in the bundled face and sets each column as wide as the widest thing in
it. A header too wide for its column wraps; a long text cell wraps instead of
running into the next column.

- **Numbers are never typed as strings.** A given number prints through the pt-BR
  formatter; a column with no format uses one number of decimals for the whole
  column (the fewest that write every value), so the decimal commas align. A
  `fractions: false` rule applies: a table never prints a mean as `17/3`.
- **Derivations are checked, not typed.** A column `from: "q*p"` is evaluated per
  row by `src/math/expr.ts` over column letters and ids; a `totals` row reduces the
  columns it names. A total of a derived column sums the derived values, not a
  second typed number. A derivation that needs a blank, a text cell, or divides by
  zero is refused with its row and column.
- **`answers: false` hides exactly the answers**: derived cells, totals values and
  cells written `{ "answer": v }`. Given cells stay; `null` is a blank in both
  versions. Widths are computed from the hidden text too, so the question's figure
  and the solution's have the same size and every column lines up.
- **Scripts are real runs** (`H_2O`, `m^2`, `Ca^2+`) so a chemistry table prints
  CO₂ as set text, not as Unicode subscripts the font may lack; the label's plain
  text is the runs' concatenation, as the checks require.
- **Everything is free-standing text** (ADR 0035): a cell is read by its row and
  column. Rules are drawn light between rows, heavy under the header and above the
  totals; the highlight is a tint mark with no stroke.

## What it does not do

No row or column spans in the body (grouped headers only), no images in cells, no
per-cell borders. A table is capped at 16 columns and 120 rows so the canvas stays
under the size check (`canvas-size-sane`). A share of the total (a "% of the whole"
column) needs the total as a derived input; there is no `from` over a totals row.

## Consequences

The nine ENEM 2023 tables and the 2024 and 2025 ones in the audit become one input
each. A new selection structure value, `table`, routes "rows and columns of data"
to this preset; `value-table` stays for tables of a function's values.
