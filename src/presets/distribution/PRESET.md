# distribution

A probability distribution with an event shaded and its probability computed,
for Probabilidade e Estatística: "P(60 < X < 75) com X ~ N(70; 5²)", "sombreie
a área e calcule", "P(Z > 1,96)", "binomial P(X = 3) com n = 10, p = 0,3",
"os valores críticos de um teste bilateral com α = 5%". The law's parameters and
the event are the only typed numbers. The curve, the bars, the shaded region,
the boundaries, the z axis, every number printed in the figure and every step
of the arithmetic in the panel are **computed** by `src/math/probability.ts`.
See [`docs/decisions/0059-probability-distributions.md`](../../../docs/decisions/0059-probability-distributions.md)
for what was refused and why.

**Choose it when** the content is one law (normal, binomial or Poisson) and one
event on it: an area under a bell curve, the mass of some bars, the two tails of
a significance test, a binomial checked against its normal approximation. It is
not for a curve you write as y = f(x) with tangents and integrals
(`function-graph` shades areas under any expression; this preset knows the
laws), nor for a sample's histogram or a table of frequencies (`chart`).

## Input

```json
{
  "preset": "distribution",
  "kind": "normal",
  "mean": 70,
  "sd": 5,
  "event": { "between": [60, 75] },
  "showZ": true
}
```

| field | what it does |
| --- | --- |
| `kind` | `"normal"`, `"binomial"` or `"poisson"`. |
| `mean`, `sd` | Normal only. Defaults 0 and 1: the standard Z. `sd` must be > 0. |
| `n`, `p` | Binomial only: `n` a whole number 1 to 5000, `p` strictly between 0 and 1. |
| `lambda` | Poisson only: λ > 0. |
| `event` | Exactly one of the forms below. |
| `showZ` | Normal (or a discrete law with `approximation`): a second row beneath the axis, z = (x − μ)/σ, with the boundaries' z in bold. Ignored for the standard normal, where x already is z. |
| `approximation` | `"normal"`, for a binomial or a Poisson: the normal curve N(np; npq) or N(λ; λ) dashed over the bars, the continuity edges (±0,5) as dashed verticals, and the panel's comparison. |
| `decimals` | 1 to 6, default 4: how many decimals every printed probability has. Also decides how far an open-ended normal event is drawn (see below). |
| `tickLabels` | `false` leaves the axis numberless: the ticks are still drawn. |
| `title`, `locale` | As every preset. |

The event:

| form | means | drawn |
| --- | --- | --- |
| `{ "between": [a, b] }` | normal: P(a < X < b). Discrete: P(a ≤ X ≤ b), both ends included. | the region between the two bounds |
| `{ "below": b }` | normal: P(X < b). Discrete: P(X ≤ b); `"strict": true` makes it P(X < b). | from the left edge to b |
| `{ "above": a }` | normal: P(X > a). Discrete: P(X ≥ a); `"strict": true` makes it P(X > a). | from a to the right edge |
| `{ "equals": k }` | a discrete law only: P(X = k). A normal refuses it: P(X = k) = 0. | the one bar |
| `{ "tails": z }` or `{ "tails": { "alpha": 0.05 } }` | normal only, two-sided |Z| > z. Given α, z = Φ⁻¹(1 − α/2) is computed: 1,96 for 5%, 2,576 for 1%. | both tails, α/2 each, ±z marked |

## What is drawn

**A normal**: the density over μ ± 4σ (wider when the event asks: see below), the
event's region a closed mark filled with a tint and outlined, the curve where it
is not shaded, and beneath the axis ticks at μ + kσ numbered with their values.
The boundaries are bold, in place of the ticks under them, and hang a short
line from the axis to their number. `P = 0,8186` is printed **inside the
shaded region** where its box fits, otherwise beside it, above the curve. With
`showZ`, the z row numbers the same places, and the boundaries' z are bold.

**A discrete law**: bars of width 1 centred on each k, as tall as the mass (so
a bar's area IS its probability), separated by a thin paper line. The event's
bars are filled and merged into one outline, and `P = 0,2668` sits above it.
The bars drawn are those that hold all but a tenth of the last printed digit of
the mass, always including the event; a small binomial (n ≤ 20) shows every k
from 0 to n. Numbers under the axis are the integers, thinned to stay 30px
apart, and the event's ends in bold.

**With `approximation`**: the normal curve dashed in rust, labelled `N(20; 12)`
(variance, the textbook's way), and the corrected edges 17,5 and 24,5 dashed and
labelled in place of the bar numbers. The bars stay the exact answer. Two
edges too close for their labels (`equals` with the correction) are set in two
rows.

## The reading panel

Below the figure, every line computed:

- **Standardisation** (a non-standard normal): `z₁ = (60 − 70)/5 = −2; z₂ = (75 − 70)/5 = 1`. A z that is not exact
  is written to three decimals with `≈`.
- **The chain**: `P(60 < X < 75) = P(−2 < Z < 1) = Φ(1) − Φ(−2) = 0,84134 − 0,02275 = 0,8186 ≈ 81,86%`.
  The operands are printed with as many decimals as the subtraction on the page
  needs to be right: the four-decimal `0,8413 − 0,0228` would read 0,8185, so
  they get a fifth digit. Above: `1 − Φ(1,96) = 1 − 0,9750 = 0,0250`.
- **Tails**: `α = 0,05: z = Φ⁻¹(1 − α/2) = Φ⁻¹(0,975) ≈ 1,96`, `P(|Z| > 1,96) = 2 · [1 − Φ(1,96)] = 2 · 0,0250 = 0,0500`,
  the critical values ±z, each tail's α/2, 1 − α, and for a non-standard normal
  the x values μ ± zσ.
- **A binomial**: `P(X = 3) = C(10, 3) · 0,3³ · 0,7⁷ = 0,2668`, then `C(10, 3) = 120`. A range of up
  to six values is written term by term and summed as printed; a Poisson or binomial tail
  with a short complement is written `1 − P(X ≤ 0)`; longer ranges give `Σ P(X = k)`.
- **A Poisson**: `P(X = 2) = e⁻³ · 3² / 2! = 0,2240`.
- **The approximation**: μ, σ, the continuity correction, z at the corrected edges,
  `Φ(z₂) − Φ(z₁)`, the exact value and how far the approximation is (and a warning
  when np or nq is below 5).

## What is checked

Every fixture renders with every check passing: `text-clear-of-ink`,
`backing-hides-no-ink`, `annotation-nearest-its-owner`, `label-declares-what-it-names`,
`contrast-sufficient`, and `area-matches-its-label` (ADR 0037) reading the shaded
polygon against the printed probability. The polygon's vertices are stated in
a frame whose unit is one x unit by one unit of density, so its area in that
frame **is** a probability, and a wrong number in the label fails the check;
`tests/distribution.test.ts` shows it by editing one. Each tail of a two-sided
event is its own region with its own label, so each is measured.

## What is refused

Naming the path: an unknown `kind` or field; a parameter that belongs to another
kind; `sd ≤ 0`; `p` outside (0, 1); `n` not a whole number; a non-integer or
out-of-support bound for a discrete law; `between` with a ≥ b; more than one
event form; `equals` on a normal; `tails` on a discrete law; `strict` anywhere
but `below` or `above`; `showZ` on a discrete law without `approximation`;
`approximation` on a normal.

## What is not covered

Other laws (exponential, t, χ²: the shape is a different function and a
different table); two events at once (P(A ∪ B)); a leader line from a label to a
region that is too small for it (the label is set beside the region, nearer to
it than to anything else, which is what a leader would say; a leader would be a
second mark for the label to be nearer than); a boundary label that would land
on a tick number replaces that tick's number rather than sharing its row, so
1050 can go missing beside a bold 1000.

## answers: false

The figure of the question: curve or bars, the event shaded, and the boundary
values the statement gives. Hidden: the P value inside the region, the reading
panel (standardisation, Φ arithmetic, complement, the approximation's
calculation), the z row and its tick numbers (`showZ` is the standardisation
the exercise asks for), and — for `approximation: "normal"` — the approximating
curve, its N(μ; σ²) label and the continuity edges (they are the solution of
"aproxime"; the question shows the binomial or Poisson bars with the event).
For a two-sided test given by `alpha` the critical values are what is asked:
the shaded tails and their boundary lines stay, the numbers under them and the
α/2 labels do not (given as a critical z, the boundary is a datum and stays).
The heading keeps the law, and the title loses `= P`.

## Magnitudes

Boundaries, ticks and the μ ± zσ line are written in full (`0,0125`, not
`0,013`; `50000`), and a computed critical x is rounded to a thousandth of σ.
A result line too long for the canvas is carried over before an operator.
