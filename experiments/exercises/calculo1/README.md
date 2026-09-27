# Cálculo 1 — the exercise list that shaped `function-graph` and `sheet`

A real list handed to a student: limits, average rate of change, the formal
definition of the derivative, the power rule, higher derivatives. Thirty
exercises, fourteen function figures.

| path | what it is |
| --- | --- |
| [`lista.json`](lista.json) | **The list as data.** Build it with `node src/cli.ts sheet experiments/exercises/calculo1/lista.json`; output goes to `ProjectHub/Listas/calculo1/`. |
| [`convert.py`](convert.py) | The one-off conversion from the hand-edited HTML. Figures come from `fixtures/function-graph/` (a test fails if the two drift), answers from the answer key, and the coordinates the text cites about a figure's points become `{{fig.P}}` placeholders. |
| [`original/`](original) | What existed before, copied out of a temporary folder: `figs.mjs` (the `graph()` helper), `lista.html`, `pdf.mjs`, `render.sh`, the patch scripts, the rendered figures and the PDF that reached the student. Kept as the baseline the new output was compared against. |

## What reached the student, and where each one is now handled

| defect | now |
| --- | --- |
| an intercept with no number on the axis (1.3: the 4 of y = x + 4) | numbers are never dropped; `axis-number-present` (ADR 0024) |
| no x axis when the lattice missed zero | the zero line is drawn whenever the range contains zero (ADR 0022) |
| a legend over the axes and their numbers (2.5) | the legend searches for free space |
| a parabola and three secants told apart only by colour (2.5) | `series-distinguishable-without-colour`; direct labels |
| "(2, 5)" beside the decimal "0,5" | one pt-BR formatter, `(2; 5)` (ADR 0023) |
| coordinates typed by hand, drifting from the text | typed coordinates are refused; labels and text are computed from the figure |
| the answer key typed twice, and a third time in the solutions | the key and each solution's answer come from one field (ADR 0026) |

The helper's own figure 2.4 had also shipped failing `text-clear-of-ink` (the
6 under the axis sat on the curve); the preset's tick rule fixes it.
