# truth-table

A truth table: one row per assignment of the variables, a column per variable,
per subexpression (optional) and per expression. The *tabela-verdade* of Lógica
e Matemática Discreta ("construa a tabela-verdade de (p → q) ∧ (q → p)",
"mostre que ¬(p ∨ q) ≡ ¬p ∧ ¬q", "classifique como tautologia, contradição ou
contingência") and of Eletrônica Digital ("monte a tabela da função maioria e
extraia os mintermos"). The expression is the only typed thing; **every cell is
computed** by [`src/math/boolean.ts`](../../math/boolean.ts), the evaluator
`logic-circuit` shares. See
[`docs/decisions/0057-boolean-logic.md`](../../../docs/decisions/0057-boolean-logic.md).

**Choose it when** the content is a boolean function and the reader must see its
values row by row. It is not for the gates (`logic-circuit` draws the diagram
from the same expression), nor for a table of a real function (`value-table`),
nor for the sign of a function (`sign-chart`).

## Input

```json
{
  "preset": "truth-table",
  "expressions": [
    { "expr": "p -> q", "label": "P" },
    { "expr": "not p or q", "label": "Q" }
  ],
  "showSubexpressions": true,
  "compare": true
}
```

| field | what it does |
| --- | --- |
| `expressions` | One to six; each a string or `{ "expr", "label" }`. Each is one result column. With a `label` the header has two lines: the label, then the expression typeset. |
| `variables` | The columns' order. Default: order of first appearance across the expressions (`"q and p"` gives q, p). Must include every variable used. At most six (64 rows). |
| `notation` | `"logic"` (default): V/F, ¬ ∧ ∨ ⊕ → ↔, rows from V…V down. `"digital"`: 1/0, · + ′ ⊕, rows from 0…0 up, so the row number is the minterm number. |
| `showSubexpressions` | A column per compound subexpression, operands before the operators that use them, each once, between the variables and the results. |
| `classify` | Panel: `p ∨ ¬p é uma tautologia: verdadeira nas 4 linhas.` / contradição / `contingência: verdadeira em 3 das 4 linhas`. |
| `compare` | Panel, for every pair of expressions: `As colunas de P e Q são iguais: P ≡ Q.` or `… diferem nas linhas 2 e 3: P ≢ Q.` (In digital notation `=` and `≠`.) |
| `minterms` | Adds an `m` column (the row's minterm number) and the panel `Σm(3, 5, 6, 7)`, the canonical sum of products and its Quine–McCluskey minimal form. |
| `title` | The figure's title. |

## The expression language

A closed grammar, parsed without `eval`. Operators in both notations, tightest
binding first: **not > and > xor > or > → > ↔**.

| meaning | spellings |
| --- | --- |
| not | `not` `¬` `~` `!` and postfix `'` `′` (`A'`, `(A+B)'`) |
| and | `and` `·` `*` `∧` `&` `.` — and **juxtaposition** (`A'B`, `A(B+C)`) |
| or | `or` `+` `∨` `\|` |
| xor | `xor` `⊕` |
| nand / nor | `nand` `↑`, `nor` `↓` (at the and / or level) |
| implication | `->` `→` `=>` (right-associative) |
| iff | `<->` `↔` `<=>` |
| constants | `0` `1` `V` `F` `true` `false` |

A variable is **one letter with optional digits** (`A`, `p`, `x1`, `Q_2`):
`AB` is A·B, never a variable called AB, which is what lets `A'B + AB'` be
written the way an electronics course writes it. `V` and `F` are therefore
constants, not variables (`V1` is a variable). Errors say where:
`truth-table.expressions[0]: falta um operando depois de "and" (posição 6)`
with the source and a caret under it.

## Columns are sized from their text

Every header line and every cell is measured, and a column is as wide as the
widest thing in it. A long header (`A·B·C·D + A′·B′·C′·D′`) widens its column
and the canvas rather than running into its neighbour — the bug `value-table`
had. A panel line wider than the table is wrapped at spaces.

## What is refused

No expressions, or more than six; a parse error (with its position); a
`variables` list that omits a variable the expressions use, repeats one, or
contains something that is not a variable name; more than six variables; an
expression with no variables at all.

## What is not covered

Karnaugh maps (the minimal form is printed, not drawn), don't-care rows,
multi-letter variable names (`Cin`: write `C` or `c1`), and tables of more than
six variables.

Fixtures: [`fixtures/truth-table/`](../../../fixtures/truth-table/majority-minterms-digital.json).
Tests: `tests/truth-table.test.ts` (decodes the drawn cells against hand-worked
tables) and `tests/boolean.test.ts` (the grammar and the minimiser).

## answers: false

A "complete a tabela" figure. Kept: the frame, every header (variables,
subexpression columns, result columns with their typeset expressions), the
variable columns filled with every assignment, and the row-number column when
`minterms` is on (a row's number is its position, not a result). Hidden: every
cell of a subexpression or result column (they are drawn empty, and those
columns keep the width of one cell), and the whole panel, so `classify`,
`compare` and `minterms` print no tautologia / equivalência line, no Σm and no
simplified form even when their flags are set.
