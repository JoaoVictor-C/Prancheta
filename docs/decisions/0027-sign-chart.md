# 0027 — The sign table is found from the function, never typed

## Status

Accepted.

## The need

Exercises about maxima and minima, growth, concavity and inequalities are answered in Brazilian classrooms with a *quadro de sinais*: a table of intervals, the sign of f′ (or of each factor) in each, and arrows for where f rises and falls. The Cálculo 1 sheet had exercises of exactly this kind (4.5, 5.4) and explained them in prose beside a graph, because nothing could draw the table.

A table typed by hand has the defect this project keeps meeting: it is a second statement of facts the function already fixes — its roots, its signs, its values at the extremes — free to disagree with the graph beside it.

## The decision

**`sign-chart` is a preset that takes the function's expression and finds everything in the table.** Column boundaries are the roots of every row's function and the poles of f; each sign is the sign that function takes at the interval's midpoint; each value in the variation row is f at the critical point. f′ and f″ are central differences of f, so the derivative's formula appears only as an optional row label, never as input the table depends on.

Four decisions inside it:

- **A pole is not a root.** Bisection converges on 0 for 1/x just as it does for x. What tells them apart is the size of the function where it converges: small is a root, huge is a pole, marked ‖ in every row.
- **Touching roots are found too**, as near-zero minima of |g|: (x − 1)² does not change sign at 1 and a sign-change search alone would miss it.
- **Roots are snapped to exact values** when the function vanishes there: fractions with small denominators and square roots of integers. The header prints `√3`, not `1,732`, for the same reason ADR 0023 prints 17/3.
- **Several figures per exercise in a sheet** (`"solutionFigure": [graph, table]`, markers `{{figure}}`, `{{figure2}}`), so the table and the graph of one function sit together — which is the point of having both.

In selection, a function favours `sign-chart` at the floor (`S-function-favours-sign-chart-weakly`): offered beside `function-graph`, never chosen over it, the same shape as a hierarchy weakly favouring `graph`.

## What was refused

**A new core check that the table agrees with the graph.** Both are generated from one expression by code, so a check comparing them would compare the code with itself. The guarantee is structural — one input — and the tests pin the arithmetic that produces the table (poles, touching roots, snapping, signs).

**Symbolic differentiation.** It would let the table print f′'s formula by itself, but it is a computer-algebra system's worth of code for a label an author writes once.

## The cost, stated

Roots outside `search` are not found, and a removable hole must be declared (`undefinedAt`), since the function never visibly skips it. The variation row prints values at critical points only: limits at ±∞ and at poles are not computed.
