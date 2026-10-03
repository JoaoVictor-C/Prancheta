# 0071 — answers: false on function graphs and charts

## Status

Accepted.

## The need

A sheet draws each statement figure with `answers: false`, so the question shows
what the exercise gives and not what it asks (ADR 0062-era convention, now on 27
presets). `function-graph` and `chart` were outside that list. They are the
figures most of a Cálculo 1 list is made of. So a statement could print
"A = 8/3" under the region it asked the reader to measure, or "inclinação = 6"
beside the tangent whose slope was the question.

## Decision

Both presets are answer-aware. The line is drawn between what the author TYPES
and what the figure COMPUTES:

- **Stays** (given): every curve, region, rectangle, bar, slice and point; a
  function's formula (`{expr}` of a function); given values (measured series,
  value labels on grouped bars); a typed point's coordinates; `{=…}` numbers.
- **Goes** (computed): area, sum and integral values; total and integral
  captions; a slope, a line's equation and a line's `{expr}`; the coordinates of
  a point read off a curve (its `x` stays if typed); asymptotes, lines and
  equations both; a pie's or donut's percentages, on the slices and in the
  legend; a stacked bar's total.

A label is cut at its first computed placeholder: `P{coords}` prints `P`,
`inclinação = {slope}` prints `inclinação`, `A₁ = {area}` prints `A₁`, so the
statement can still name it. A label that was all answer is not drawn. The full
template is still filled first, so a broken one is refused either way. An
asymptote is still found and confirmed, so a wrong claim is refused, but it is
not drawn.

A point label cut down to its name may take any side, and the closest clear
spot wins (`Board.place` with `nearest`). The author's `towards` was chosen for
`A(1; 1)`, and the letter alone must sit within its own size of the point
(`label-nearest-its-place`). Figures with answers shown are placed exactly as
before.

A sheet's `{"graph": …}` figure now takes the same path as `{"spec": …}`, so the
statement gets `answers: false` and the solution keeps it all. An author who
wants a computed value in the statement writes `"answers": true` on that figure.

## Consequences

- The Cálculo 1 list rebuilds clean. Its statement figures lose the values they
  asked for; the solutions keep them.
- A ruled bar chart (ADR 0066) has only given values, so nothing is hidden.
- What counts as computed is decided per placeholder. A typed point read
  through `{P}` is given; the same point read off a curve is not.
