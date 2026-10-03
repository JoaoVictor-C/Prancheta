# data-table

The textbook table of **given** text and numbers: a nutrition label, a price list, a ranking, the properties of five substances. `value-table` computes a function's values from an expression; this preset draws data that are the content. A few cells can be derived (a column from other columns, a totals row) and those are computed and checked, never typed.

**Choose it when** the exercise shows rows and columns of facts the reader must read, compare or complete: header row with units, grouped headers, blank cells to fill in, a highlighted cell, a "Total" row. Not for a function's values at points (`value-table`) nor for a truth table (`truth-table`).

## Input

```json
{
  "preset": "data-table",
  "title": "Compra de material escolar",
  "columns": [
    { "header": "Produto" },
    { "header": "Quantidade", "id": "q" },
    { "header": "Preço unitário", "unit": "R$", "id": "p", "format": "money" },
    { "header": "Total", "unit": "R$", "from": "q*p", "format": "money" }
  ],
  "rows": [["Caderno", 4, 18.9], ["Caneta", 12, 2.5]],
  "stub": true,
  "totals": { "by": { "q": "sum", "D": "sum" } },
  "source": "Fonte: dados fictícios."
}
```

- **`columns`** — `{ header, unit?, id?, align?, format?, from? }`. The unit prints after the header: "Preço unitário (R$)". A header wider than its column wraps; a parenthesised unit is never split.
- **`rows`** — one array per row with the cells of the **non-derived** columns, in order (or one per column with `null` at the derived ones). A cell is text, a number, `null` (a blank to fill) or `{ "answer": v }` (shown only when answers are shown).
- **`title`** drawn above (and the figure's title); **`caption`** a note below; **`source`** "Fonte: ..." below it, smaller.
- **`headerRows`** — grouped headers above the column headers, outermost first: `[[{ "text": "Escola pública", "span": 2 }, ...]]`. Each row's spans must add up to the number of columns; `"text": ""` leaves a span empty.
- **`stub: true`** — the first column names the row (left, semibold, heavier rule after it).
- **`highlight`** — `{ row, col }` one cell, `{ row }` a row, `{ col }` a column (0-based rows; `col` is an index, a letter or an id). Tinted and bold.
- **`blank`** — `"?"` or `"____"`: what a blank or hidden answer looks like. Default: empty.
- **`locale`** — `"pt-BR"` (default) or `"en"`.

## Text and scripts

Text cells, headers, title, caption and source take real sub/superscripts: `_{…}` / `^{…}`, or the bare forms of a formula — `H_2O`, `C_6H_12O_6`, `m^2`, `g/cm^3`, `10^-3`, `Ca^2+`, `Na^+`, `SO_4^{2-}`. A sign followed by a digit or letter is not a charge (`x^2-1` keeps its minus). A lone `_` or `^` is literal.

## Numbers

Given numbers print pt-BR through the one formatter: decimal comma, the minus `−`, a narrow space from five digits. A column with no `format` prints every number with the same number of decimals (the fewest that write all of them: 2,5 / 10,0 / 0,25 → 2,50 / 10,00 / 0,25) so the decimal commas line up; numeric columns are right-aligned as a block centred under the header (`align` overrides). A column whose every cell is a number typed as text (`"4,0 · 10^-4"`, `"55,5"`) is aligned on its decimal comma the same way; one word in it keeps the column textual and left-aligned. `format`:

- `"integer"`, `"money"` (2 decimals, `1.234,50`), `"percent"` (the value is a fraction: 0,256 → `25,6%`)
- `{ decimals?, grouping?, prefix?, suffix?, percent? }` — `grouping: true` is the traditional `1.234,50`; `grouping: "space"` groups from four digits with a narrow space, as exam booklets print (`2 000,00`).

## Derived cells

- **`from`** — a column computed per row from others, in the expression language of `function-graph`: `"q*p"`, `"(C+E)/(B+D)"`, `"3*vit+emp"`. Variables are column letters (A, B, C…, by position including derived columns) and `id`s (a letter, then letters/digits; not `e`, `pi` or a function name). Write `*` explicitly. A derived column may use an earlier derived one; a loop, a blank/text input or a non-finite result is refused naming the cell.
- **`totals`** — `{ label?, by: { "q": "sum", "D": "mean" } }` with `sum`, `mean`, `min`, `max`. A row under a heavy rule; the label ("Total", or "Média" when all are means) sits in the first column.

## answers: false

Derived cells, totals-row values and `{ "answer": v }` cells are the answers: they are drawn empty (or as the `blank` marker). Every given cell stays, `null` cells stay blank, and the geometry is identical to the solution's (column widths use the hidden text too), so the question and the answer figures line up. The preset is in `ANSWER_AWARE`.

## Limits

At most 16 columns and 120 rows. A text column wraps its cells at about 230 px. No row/column spans in the body (only grouped headers), no cell borders on/off options, no images in cells.
