# 0058 — Descriptive statistics: histograms and boxplots of raw data

## Status

Accepted.

## The need

Estatística and ENEM ask for the same two figures from a list of numbers:
"construa o histograma", "desenhe o boxplot e identifique os outliers". The
existing `chart` preset plots values it is handed, one separated bar per category;
used for a histogram it draws gaps between bars that are consecutive intervals of
one scale, and every bar height would be typed by hand.

## The decision

**`statistics` takes the observations and computes everything.** Pure functions in
`src/math/statistics.ts` give the classes, counts, quartiles, fences and moments;
the preset only draws them. Nothing numeric in a label is typed.

- **Classes.** Default Sturges: k = 1 + 3,3·log₁₀ n rounded; the width R/k is
  rounded UP to 1, 1,5, 2, 2,5, 3, 4, 5, 6, 7 or 8 times a power of ten that is a
  multiple of the data's own precision (whole-number data never get 2,5); the first
  edge is the minimum rounded down to the width's order of magnitude; classes
  continue until the maximum is reached. The Sturges arithmetic is printed. Intervals
  are [a; b) with the last closed (Brazilian convention), stated in the figure.
  Unequal widths are refused for frequency heights and drawn as density
  (fᵢ/(n·hᵢ)), because a bar's height would otherwise mislead.
- **Quartiles: one documented method, an option.** Three definitions are in use.
  Default `halves`: the median of the lower and upper halves, the median excluded
  when n is odd — what Ensino Médio texts and ENEM solutions teach. `tukey`
  includes it in both halves; `linear` interpolates (Excel QUARTIL.INC, R type 7).
  The figure prints which one it used.
- **Outliers.** Fences Q₁ − 1,5·IQR and Q₃ + 1,5·IQR; whiskers end at the most
  extreme observations inside; values beyond are open circles and are listed.
  A value exactly on a fence is not an outlier.
- **Variance.** `sample` (n − 1) is the default, `population` (n) an option; the
  figure states the divisor. A standard deviation that is a root prints `√5 ≈ 2,236`.
- **Drawing.** The frequency gridlines are a frame's grid furniture with its own
  numbering (axes off, labels off, so zero in the middle of a range cannot put the
  y numbers inside the bars). Bars are ink; polygon dots drawn last. Every label
  declares what it names (`annotates` a bar or polygon, `annotatesPlace` a quartile
  point, the group name annotates its dotted row guide). Tables measure their text.
  `both` aligns the boxplot under the histogram on the same pixel scale.

## Consequences

The first figure is reproducible from the data alone, and a wrong bar height or
quartile can no longer be typed. Limits: horizontal boxplots only, up to four
groups, and a bar's frequency label is omitted when no clear spot exists.
