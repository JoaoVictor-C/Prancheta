# 0064 — Acid–base figures: the equilibrium is the source of every point

## Status

Accepted. Item 8 of [`docs/PLAN-CHEMISTRY.md`](../PLAN-CHEMISTRY.md). Reads like
[0059](0059-probability-distributions.md) in what it computes and what it lets a
reader copy, and uses the reading panel of [0062](0062-rich-text-and-the-reading-panel.md),
the labels' claims of [0035](0035-what-a-label-hides-and-claims.md) and the fitted scale of the
2026-09-29 review (`src/presets/shared/scale.ts`).

## The need

General chemistry keeps asking for three pictures. **A titration curve**: 25 mL of
0,1 mol/L acetic acid with 0,1 mol/L NaOH, mark the equivalence point, read the pKa
at half-equivalence, choose an indicator. **A species-distribution diagram**:
the fraction of H₂CO₃, HCO₃⁻ and CO₃²⁻ against pH, where the curves cross. **The pH
scale**: lemon juice, blood, a solution with [H⁺] = 10⁻³, and where an indicator
changes colour.

The project's answer was `function-graph` with the curve typed as an expression, or
the reaction module, which draws molecules and knows nothing about equilibrium. A
typed curve is only as true as the person who typed it: the equivalence point, the
half-equivalence pH and the indicator's verdict are three more numbers with nothing
tying them to the curve beside them, and the curve of a *weak* acid is not a closed
form at all.

## The decision

**`acid-base` is one preset with three kinds, and the only typed numbers are the
chemistry's own inputs: constants, concentrations, volumes.** Everything drawn is
derived from them by `speciesFractions` and `solvePH` in
`src/presets/acid-base/preset.ts`.

### The titration curve is the charge balance, not Henderson–Hasselbalch

At each volume the pH is the root of the charge balance in [H⁺] —
`[B⁺] + [H⁺] = [OH⁻] + cₜ·Σ j·αⱼ(pH)` for an acid analyte, its mirror for a base —
with dilution and `Kw = 1,0·10⁻¹⁴`, found by bisection on pH. The balance is
monotone in [H⁺] (every term rises with it), so the root is unique and bisection
cannot miss it or wander; a hundred halvings from pH −2..16 is machine precision.

That one equation replaces the four textbook regimes — the weak acid alone, the
buffer, the salt at equivalence, the excess of strong base — and the seams between
them. Henderson–Hasselbalch fails exactly where a reader looks: before the first
drop (no conjugate base), near equivalence (the log of a ratio going to 0/0), and
for a diprotic acid whose steps overlap. Nothing here is a regime.

Consequences the tests hold:

- 0,1 M CH₃COOH (pKa 4,74): pH₀ = 2,873 (the brief's 2,88 is the rounding of a
  shortcut; the exact root is 2,873 and prints `2,87`), half-equivalence 4,7405 → `4,74`, equivalence 8,7194 → `8,72`,
  checked against [OH⁻] = √(Kw/Ka · c) by hand.
- 0,1 M HCl: pH₀ = 1,00 and **exactly** 7,00 at equivalence (to 10⁻⁹).
- The curve is checked against an independent monoprotic balance written in the
  test, to 10⁻¹¹ in concentration, and is strictly monotone.
- 99,9 % and 100,1 % of V_eq of the strong case give 4,30 and 9,70: the ±0,1 %
  jump every textbook quotes, from the same solve.

Marked points are computed by the same solve and **declared to lie on the curve**
(`Mark.on = ["curva"]`, checked by `feature-on-its-curve` to 1,5 px). Every marked
volume is a node of the sampled curve, so the claim is exact rather than
approximate: the equivalence dot is a vertex of the polyline.

### The sampling follows the curve

Forty even volumes plus every marked volume, then any chord whose midpoint is more
than 0,4 px off the curve, or whose length exceeds 14 px, is split (depth ≤ 18).
A jump of 10 pH units in 0,1 mL is drawn as densely as it needs; the plateau is
not. The alternative — a fixed step fine enough for the jump — is a thousand
vertices of plateau.

### What is marked is what the curve supports

- **Initial pH**, always.
- **Half-equivalence** for a weak analyte, V = (k − ½)·V_eq: the pH is printed
  `= pKa` when the solve is within 0,005 of the constant and `≈ pKa` otherwise.
  Where the neighbouring steps or water push it more than 0,3 away (the third step
  of H₃PO₄, computed 11,86 against 12,35) the point is **not marked**: printing
  `≈ pKa₃` beside a number half a unit off would teach the wrong reading.
- **Equivalence**, V_eq,k = k·c·V/c′. Across 99–101 % of its volume the curve must
  jump at least 0,8 pH units for the point to be drawn; H₃PO₄'s third equivalence
  jumps a fraction of that and is not marked. Both thresholds are named constants
  in the source and cited in PRESET.md.
- **The indicator's verdict** is a stated rule, printed with its numbers: the
  midpoint of the indicator's range lies inside the pH jump between 99,9 % and
  100,1 % of V_eq (a titration error under 0,1 %). Phenolphthalein (mid 9,10) for
  acetic acid (jump 7,74–9,70): serves. Methyl orange (mid 3,75) for HCl (jump
  4,30–9,70): does not — its whole range is on the near side of the jump. It is a
  criterion, not a colour match; a stricter or looser one is a one-line change and
  a different ADR.

### The distribution diagram

`αⱼ = K₁…Kⱼ·hⁿ⁻ʲ / Σ` in logarithms (no under/overflow at pH 0 or 14). Adjacent
species cross **exactly** at pH = pKa — their ratio is K/h — so the crossing is
not detected on a grid, it is inserted into it: curves are sampled every 0,05 pH
*and* at every pKa and the chosen pH. Each crossing is a dot declared to lie on
both curves it joins. Where two pKa are close (3 and 4) the crossing is still at
the pKa but α there is below 0,5, and the panel prints the computed values rather
than "0,5".

A distribution diagram has the failure `series-distinguishable-without-colour` was
written for: four curves, one hue family. So each curve has a colour (Okabe–Ito,
darkened until it clears 4,5:1 on the lattice, not just on the paper — one label
failed at 4,41:1 against the gridline running under it), its own stroke pattern,
and a direct label in its own colour placed where the species dominates, searched
against the curve-label rule itself (own curve nearer than any other) before it is
committed.

### The pH scale

A single block filled with a gradient computed from stops in pH; substances are
poles with flags. The ramp is warm → pale → cool (rust, orange, sand, near-white,
light blue, navy) because red → green is the ramp the scale is traditionally drawn
in and the one a red–green colour-blind reader cannot read; **ÁCIDO / NEUTRO /
BÁSICO** are also words, so colour is never the only channel. A substance is given
by pH, [H⁺] or [OH⁻] (exactly one), the pH is computed, and the arithmetic
(`[OH⁻] = 10⁻⁴ mol/L → pOH = 4,00 → pH = 14 − 4,00 = 10,00`) is a line of the
reading panel: the reader's exercise is that arithmetic.

## What each `answers: false` hides, and why that line

The question typically gives the data and asks for a value. The rule is the one of
[0059](0059-probability-distributions.md): draw what the question gives, hide what
it asks, keep the frame so the solution draws over the question.

- **Titration.** The data are the analyte, titrant and indicator; what is asked is
  V_eq, the pH there, the pKa, the indicator. Curve, axes, heading and indicator
  bands (with names) stay — the curve is what the student reads — and every marked
  point, guide, value, the panel and the verdict go. A dot at the vertical part of
  the curve *is* V_eq to a reader with a ruler, so the points go too, not only
  their labels.
- **Distribution.** Curves, species names and a given pH line stay. The pKa
  crossings go entirely (dots and drops as well as labels: the drop to the axis
  reads the pKa as well as a number does), and so do the fractions at the given pH.
- **pH scale.** The scale and substances given by pH stay. A substance given by a
  concentration is **not placed**: where it stands is the answer. Its arithmetic
  (the panel) goes with it.

## What was refused

- **Henderson–Hasselbalch for the curve** — see above. It is exact at the
  half-equivalence point by construction, which is why a figure built on it would
  "confirm" pH = pKa without computing anything.
- **Detecting crossings and equivalence points from the sampled curve.** The
  half-equivalence volume is V_eq/2 by stoichiometry and the crossings are at the
  pKa by algebra; finding them numerically would have made the figure a check of
  its own sampling.
- **A lookup of coloured indicator transitions as a gradient on the plane.** A
  band is a range, drawn as a band, named and numbered. What the indicator
  *looks* like on each side is not what the exercise asks.
- **Marking every equivalence and half-equivalence of a polyprotic acid.** Some are
  not there (the third of H₃PO₄); drawing them would be a claim the equation does
  not make. The rule is stated where it is applied.
- **Guides on every point.** Six dashed lines to the axes over a curve with six
  labelled points is a web the labels cannot be read through; above four points
  the guides go and the labels carry the values.

## Two claims that are bent, and why

1. **The colour bar carries `gridOf`.** It is the scale a reader measures against,
   as the plane's lattice is what a curve is measured against; without it the bar
   is a rival "nearest thing" for `annotation-nearest-its-owner` to weigh a label
   against, and every label above the bar would be judged nearer the bar than its
   own pole.
2. **The substances' flags are `freeStanding`, not `annotates`.** A flag's label
   begins 7 px from its own pole and is kept at least 8 px from every other pole,
   which is the attribution a reader makes by the edge of the text. The
   `annotates` rule measures from the label's *centre*, which for a 120 px label is
   60 px from its own pole and can be nearer a neighbour's — a wide label would be
   judged wrong for being wide. The layout guarantees the property directly (rows
   are found so that no label stands on, or beside within 8 px, another pole), and
   the tests read the drawn poles back.

## The cost, stated

- 25 °C and unit activity coefficients. A 0,5 M solution's pH is a little off; the
  preset says "K_w = 1,0·10⁻¹⁴ (25 °C)" in every panel.
- A weak acid titrated by a weak base has no sharp equivalence, and a mixture of
  acids is not one analyte; neither is drawn.
- Labels for a crowded titration can go farther from their dot than one would draw
  by hand: the search runs outward in rings until the place-label rule (nothing
  else nearer the label than its point) holds, and takes the first spot that does.
- The preset is not registered by this change: integration into `PresetInput`, the
  selection rules and `ANSWER_AWARE` is a separate edit (see the integration notes
  in the change description).
