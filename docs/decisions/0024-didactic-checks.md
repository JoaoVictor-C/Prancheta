# 0024 — Didactic checks: what a teaching figure owes its reader

## Status

Accepted.

## The defect

Every check before this one asks whether a figure is *malformed*: text overflowing its box, labels on ink, boxes colliding. The Cálculo 1 sheet's figures passed all of them and still failed students in three ways no check could see:

- the number an exercise is about — the 4 of y = x + 4 — was missing from the axis;
- a parabola and three secants differed only in colour, and the legend repeated the distinction in the same channel;
- a label naming one curve sat nearer another (found by the new check itself, in figure 2.5: "h = 1" was 5px from the tangent and 25px from its own secant).

## The decision

Three core checks, in `src/checks.ts` beside the others, fed by metadata the IR now carries:

- **`axis-number-present`.** `GridAxis.require` lists numbers an axis must print; frame resolution leaves a zero-ink `Mark.tick` at each. The check passes when some text reads as that value — in the figure's own spelling, via the formatter of ADR 0023 — within half a division of the tick along the axis and within `reach` across it (so a number that slid along its gridline still counts). function-graph requires every number it prints, plus the author's list.
- **`series-distinguishable-without-colour`.** `Mark.series` names the data series a mark draws; `Block.names` marks a label as the direct label of a series. A series passes if it is labelled on the drawing or its stroke pattern is shared with no other series. A legend row names no series, deliberately: a legend tells series apart by colour.
- **`curve-label-nearest-its-curve`.** A label that `names` a series must be nearer that series — measured from the label's box, across all of the series' runs — than any other series.

A fourth, `feature-on-its-curve`, belongs to ADR 0025.

**The fixes are in the data, not the checks.** Adding the checks failed five of the fourteen figures. Each was fixed by labelling the curve on the drawing or moving the label, and each fix is a figure a student reads better.

## What was refused

**Counting a legend as identification.** It would have made the check pass on the exact figure that motivated it.

**Reusing `annotation-nearest-its-owner`.** It compares a label against every element, dots and guides included: a label beside the point where a secant meets the parabola is always nearer the dot than the line. Series are the unit a reader attributes a curve label to.

**Requiring every lattice number in the core grid.** The core grid's own numbers are placed without looking at ink, and making them required would fail figures that were fine. The requirement is opt-in (`require`), and function-graph opts in for everything it prints.

## The cost, stated

These are still geometry. `series-distinguishable-without-colour` cannot tell whether a direct label says anything useful, and `axis-number-present` cannot tell whether the required list names the numbers the exercise actually cites — the author states that, once, in `require`.
