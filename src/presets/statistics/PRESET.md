# statistics

Descriptive statistics of RAW DATA, for Estatística and ENEM: "construa o
histograma", "desenhe o boxplot e identifique os outliers". The observations are
the only typed numbers; classes, frequencies, quartiles, fences, whiskers,
outliers, mean, variance and every printed label are **computed** by
`src/math/statistics.ts`. See
[`docs/decisions/0058-descriptive-statistics.md`](../../../docs/decisions/0058-descriptive-statistics.md).

**Choose it when** the content is data that must be summarised. It is not
`chart`, which plots values it is handed as separate bars with gaps; a
histogram's bars touch because the classes are consecutive intervals.

## Input

```json
{ "preset": "statistics", "kind": "both", "data": [150, 152, 153, "..."], "unit": "cm", "variable": "Altura" }
```

| field | meaning |
| --- | --- |
| `kind` | required: `histogram`, `boxplot` or `both` (boxplot aligned under the histogram on one scale) |
| `data` | `number[]`, or `{ values, label? }[]` (up to 4 groups, boxplot only) |
| `classes` | `"sturges"` (default: k = 1 + 3,3·log n rounded; width R/k rounded up to a round number and to the data's precision; first edge rounded down), `{ start, width }`, or explicit edges |
| `frequency` | `absolute` (default), `relative`, `percent`, `density` (required when class widths differ) |
| `polygon` | frequency polygon: midpoints joined, closed to the axis at the empty neighbouring classes |
| `showTable` | table classe, fᵢ, frᵢ, Fᵢ, xᵢ (and dᵢ for density) with a Σ row |
| `showStats` | reading panel (default true): n, x̄, Md, Mo, classe modal, s²/s, A, Q₁, Q₃, IQR, fences, outliers; several groups get a summary table |
| `quartileMethod` | `halves` (default: median of each half, the median left out when n is odd; Ensino Médio and ENEM), `tukey` (median kept in both halves), `linear` (interpolation, Excel QUARTIL.INC / R type 7) |
| `variance` | `sample` (default: s², divisor n − 1) or `population` (σ², divisor n); always stated in the figure |
| `unit`, `variable`, `title`, `locale` | as usual |

Classes are [a; b), closed on the left and open on the right; the last class is
closed on both ends. The figure states this. A class scheme that would drop an
observation is refused.

## What is drawn

Histogram: touching bars, numbered frequency gridlines (the frame's own furniture),
x numbers at the class edges (thinned if they would touch), frequency above each bar
or inside it where clear of ink (omitted when no clear spot exists; the table and
axis still carry it). Boxplot: box Q₁–Q₃, median bar, whiskers to the most extreme
observation within 1,5·IQR of the box, outliers as open circles, labels `Q₁ = 12`,
`Md = 15`, `Q₃ = 18` placed above or below to stay clear; groups on one numbered
axis with dotted row guides. Horizontal only.

Limits: horizontal boxplots only; at most 4 groups; the numbers in the panel are
rounded to three decimals with "≈" when not exact (√n shown as `√5 ≈ 2,236`).
