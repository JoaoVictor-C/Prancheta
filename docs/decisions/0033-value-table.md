# 0033 — The value table is computed from expressions, not typed

## Status

Accepted.

## The need

Cálculo 1 exercises use two complementary tables to show how a function behaves:
1. The **sign chart** (`sign-chart`): where f, f′, f″ are positive, negative, zero or undefined, and where f rises and falls.
2. The **value table** (`value-table`): what f IS at specified x values — a numeric snapshot of the function at points of interest.

The function-graph shows the curve's shape; the value-table shows the exact numeric values. In a single exercise, you may want both: the graph to visualize, the table to quantify.

A table typed by hand has the same defect this project keeps meeting: it is a second statement of facts the function already fixes (its values at specific points) — free to disagree with the curve beside it.

## The decision

**`value-table` is a preset that takes function expressions and x values, and computes every cell.**

- **Input:** one or more functions (name + expression) and a list of x values.
- **Output:** a table where each row is a function and each column is an x value (or vice versa if `orientation: "columns"`).
- **Computation:** every cell f(x) is evaluated by compiling the expression with `compile` from `src/math/expr.ts`, exactly as `sign-chart` does.
- **Formatting:** numbers use the locale's formatter (pt-BR decimal comma, fractions preferred: 17/3 not 5,667).
- **Undefined values:** when f(x) is non-finite (a pole, a sqrt of negative, etc.), the cell prints **∄** (symbol for "does not exist").

Two decisions inside it:

- **Reuse sign-chart's table style:** palette (PAPER, INK, RULE), cell sizes (HEADER=36, CELL_ROW=42), text size (14 for data, 15 for headers). A value-table and a sign-chart drawn side by side look like they belong together.
- **No automatic x values.** The author chooses specific points (maybe critical points where f′=0, maybe intersection points, maybe a sequence to show growth). A list of explicit x values is simpler to reason about than `{start, step, count}`.

## What was refused

**Orientation as a transformation.** An author could write the table in "rows" orientation and ask to flip it to "columns" — but treating orientation as a post-processing step introduces a type of state ("this table, but flipped") that does not exist in the input. Instead, `orientation` is a property of the input: choose it up front, and the table is built in that orientation from the start.

**Automatic x values** (like `{start: -2, step: 0.5, count: 9}`). It would be convenient, but it adds logic to decide what "step" means when the author just wants a few critical points or hand-picked values. Explicit xs are easier to verify and reason about.

**Central-difference derivatives** (f′(x) ≈ (f(x+h) − f(x−h)) / 2h). It would let one table show both f and f′, but: (1) the author would have to remember that the f′ values are approximations; (2) the sign-chart already covers derivative signs, from central differences of the one expression (ADR 0027); (3) we're not optimizing for a table that shows everything, only one that shows what the author asks.

## The cost, stated

The author must list every x value by hand — no auto-generated sequences. The value-table does not compute limits at ±∞ or derivatives. Both are out of scope: the table is a fixed snapshot, not a summary of behavior across the whole domain.
