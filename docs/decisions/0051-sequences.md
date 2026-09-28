# 0051 — Sequences and series as discrete points on a plane

## Status

Accepted. Reworked 2026-09-28 after a reviewer rejected the first draft's renders (see "The rework, 2026-09-28" below).

## The need

Cálculo 1 exercises ask students to evaluate sequences a_n and partial sums S_N, and to recognize convergence by plotting both. A sequence is a function of discrete n, not continuous x, so the right visualization is dots, never a curve. Partial sums are a second series on the same plane, drawn in a different colour. When a sequence converges, a limit line y = L shows where it is headed.

Every point must be **computed** from the expression, never typed. A sequence a_n = 1/n, plotted at n = 1..12, has 12 points, all derived from that one expression.

## The decision

**`sequence` is a preset that takes a term expression and a range [n_start, n_end], and computes every point.**

- **Input:** one term expression (with variable "n"), a range of integers [start, end] (both inclusive, both ≥ 1), what to plot ("terms", "partial-sums", or "both"), and optionally `limit: true` to draw y = L.
- **Output:** filled dots on a numbered plane — n on the horizontal axis (integer ticks), a_n or S_n on the vertical axis (gridlines with numeric labels).
- **Computation:**
  - Terms are evaluated by compiling the expression with `compile` from `src/math/expr.ts`, exactly as `function-graph` and `sign-chart` do.
  - Partial sums S_N = a_1 + ... + a_N are computed with `partialSums` from `src/math/numeric.ts`.
  - Limits are computed with `limit` from `src/math/numeric.ts` when `limit: true`.
- **Formatting:** numbers use the locale's formatter (pt-BR decimal comma, fractions preferred: 17/3 not 5,667).
- **Discrete plotting:** dots only, never joined by a line. The horizontal axis shows integer n; the vertical axis shows values with a margin for legibility.

Two series modes:
- **"terms"** (default): only a_n, as blue dots.
- **"partial-sums"**: only S_n, as rust dots.
- **"both"**: both series on the same plane, in different colours, with a small legend.

Limit line (when `limit: true`): one dashed horizontal line **per series shown that converges**, each at its **own** computed limit, in its own series' colour (see the rework below — the first draft drew one line, at the terms' limit, even under "partial-sums" or "both").

## What was refused

**Automatic n ranges.** An author could write `{start: 1, step: 1, count: 12}` to get [1, 12], but it is harder to reason about than explicit endpoints and offers no gain — the range [1, 12] is five characters either way.

**Continuous curves through the points.** A sequence IS discrete. Drawing it as a curve hides which values were actually computed; a reader cannot tell if a dip is a plotted point or interpolation.

**Joining terms to partial sums.** Both series sit on the same plane but with no connection between them — a_n and S_n are different sequences. A line from (n, a_n) to (n, S_n) would suggest they are samples of the same process.

**Multiple sequences from one input.** Presets that draw multiple objects (vectors) do so because they are all inputs the author gave. Here, the partial sums are DERIVED from the one term, not a separate input. A preset that took `{terms: [...], sums: [...]}` would reopen the "derive, do not verify" defect.

**Automatic limit computation for all series.** Only when `limit: true`. Computing limits is expensive (a sequence that diverges takes time to be sure), and not every exercise wants the line. The author asks for it when it matters.

## The rework, 2026-09-28

A reviewer looked at the first draft's renders and rejected all of them. None of the five defects was a false pass inside a check's own logic — the draft simply never drew the things the checks look for, or drew them somewhere the checks were never asked to look (raw `board.trace`/`board.label` calls, not a real `Frame.grid`).

1. **No axes, no grid.** The draft printed floating tick numbers (`board.label` with `freeStanding: true`) with no axis line and no real lattice — a private drawing path, not `GridSpec`. **Fixed** by giving the plane a real gridded `Frame` (ADR 0034): `GridSpec` with `locale` set, integer ticks on n (`step: 1, origin: n_start`), and pt-BR-formatted value ticks. Both axes are drawn as **arrowed connectors**, separately from the grid's own (disabled) zero lines, named "n" and "aₙ"/"Sₙ"/"aₙ, Sₙ", placed with `board.place` like `function-graph`'s axis names.
2. **Wrong limit line.** For `show: "both"` on 1/2ⁿ, the draft called `numeric.limit()` once, on the terms, and drew BOTH series' "limit" at that one value (0) — the partial sums' own limit is 1. **Fixed**: the terms' limit and the series' (partial sums') limit are now computed independently. The series' limit has no closed form to fall back on, so it is read the same way `numeric.limit()` reads any limit — a schedule of samples approaching infinity — except the "sample" at each step is the partial sum through that many terms, cached up to a generous cap (`seriesLimit`). A second, unrelated bug surfaced fixing this: `numeric.limit()` samples a *continuous* approach to infinity, and `term` is only ever defined at integer n — `(-1)^n/n` is `NaN` at a fractional x. Both limits are now read by rounding to the nearest integer before evaluating `term`.
3. **Labels on and past the line.** "L ≈ 2,718" sat on the dashed line it named and ran off the canvas edge. **Fixed** in three parts: the canvas is now sized generously (separate `xUnit`/`yUnit` — see below); each label is placed by a search that evaluates the *exact* rule `annotation-nearest-its-owner` checks (distance to its own line vs. distance to every dot, the axis, and the other limit line, growing the offset from the line until one side clears all of them) rather than a generic "is there ink here" search, because a convergent series' dots sit closer and closer to their own limit line as n grows, and being merely "not overlapping" is not being "nearest"; and each label declares `annotates` the line it names, never `freeStanding`.
4. **Legend used ASCII underscores and sat on the dots.** `"a_n"` / `"S_n"`, at a coordinate inside the plotted data. **Fixed**: proper subscripts (aₙ, Sₙ) throughout, and the legend searches for free space (corners first, then a full scan, scored by ink and other labels under it) exactly as `function-graph`'s does — never a fixed coordinate. Because two series, up to two limit lines and a legend rarely leave a crowded, mostly-square little plane any clear 2-row spot at all, a small reserved gutter above the plot (`legendGutter`) guarantees one exists; the legend still searches within it rather than taking it as a fixed slot. When only one series shows, there is no legend at all — the y axis is named instead.
5. **PNGs written to a repo-root `tmp/` folder.** Not a drawing defect, but a process one: nothing in this preset writes files itself (`expandSequence` only returns a `FigureSpec`), so this was a rendering script's mistake, not the preset's. Documented here so it is not repeated: renders belong in the caller's own output directory, never a path the preset invents.

**A quieter change alongside these:** x and y now get their **own** scale (`xUnit`, `yUnit`), not one shared "square" unit. A sequence plot is not a geometric figure whose angles must survive measurement, and a wide n range paired with a narrow, nearly-converged value range — extremely common for exactly the series worth drawing a limit line for — squeezed every dot, its limit line, and that line's label into a strip a few pixels tall under the old shared unit, leaving no room any label search could ever find clear. This is *why* defect 3 was reachable at all: the geometry itself left no legal spot, so no amount of searching inside the old canvas could have fixed it.

## The cost, stated

**`limit: true` can be slow.** For a non-convergent sequence, `numeric.limit()` walks through a dense sample schedule before deciding. For a series (partial sums), `seriesLimit` additionally sums up to 200,000 terms once to build its own sample schedule — fast for any well-behaved textbook series, but a real cost for a term expensive to evaluate.

**Gridlines are sparse.** The y-axis' `step` is chosen by the same "nice number" heuristic as `vectors`, to keep the plane readable. A sequence with wildly spaced values (e.g. 2^n) will have sparse gridlines or overflow the plane. The author can limit the range or accept the trade-off.

**No titles for axes beyond n and aₙ/Sₙ.** A sequence always has n on the horizontal axis and aₙ (or Sₙ, or both names) on the vertical one; there is no field to rename either.

**A legend's or limit label's search is bounded, not exhaustive.** Both grow their offset from a fixed starting point (the line, or the plot's corners) rather than searching every possible position; a pathological figure with data at every scale could still exhaust the search and fall back to its default spot, which the checks would then report rather than silently accept.

**Table export is out of scope.** This preset draws a figure, not a table. To show a table of values alongside a sequence, use a separate `value-table` preset in the same exercise.
