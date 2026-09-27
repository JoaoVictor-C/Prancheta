# 0030 — The number line is parsed from text, and a combined row is computed, never typed

## Status

Accepted.

## The need

Cálculo 1 answers an inequality, a domain restriction, or a union/intersection
of such sets with the *reta real*: a horizontal line, the boundary points
marked filled or open, the solution picked out in ink, rays to ±∞ carrying an
arrow. Nothing in the existing repertoire draws it — `function-graph` and
`sign-chart` both need a *function*; a solution set is not one, and typing the
figure's boxes by hand (as `labelled-blocks` would require) reintroduces the
defect this project exists to remove: a second statement of the same facts,
free to disagree with the inequality that produced it.

## The decision

**`number-line` takes the set as TEXT and finds every boundary, its
open-or-closed mark, and the axis range from it.** An author writes
`"x < -1 ou 2 ≤ x < 5"` or `"[-2, 3) ∪ (4, +∞)"`; the parser is the only place
that knows a `[` opens inclusive and a Brazilian `]` opens exclusive, that
`ou`/`∪` join a union and `e`/`∩` join two one-sided constraints into one
interval, that `+∞` can never be inclusive. Four decisions inside it:

- **Two notations, freely mixed.** A branch may be bracket notation or an
  inequality chain; branches join with `∪`/`ou`. This matches how a Brazilian
  textbook actually writes an answer — sometimes as an inequality, sometimes
  as an interval — rather than forcing one grammar and asking the author to
  transliterate.
- **A combined row is computed, not typed.** `{ label: "A ∩ B", op:
  "intersection" }` names the rows to combine (default: every row before it);
  its interval set is found by the same interval algebra (`unionAll`,
  `intersectAll` in `preset.ts`) that would answer the question by hand. The
  row cannot state a boundary the algebra disagrees with, because it never
  states one at all.
- **Exact endpoints are kept exact.** `5/3` and `√2` are printed as given —
  the pt-BR formatter (`src/locale/format.ts`) only touches a plain number.
  This is the same discipline ADR 0027 holds `sign-chart`'s snapped roots to,
  applied to a value the input states directly rather than one found by
  bisection: a fraction or a root written in the problem is not "close to" a
  decimal, it *is* the answer, and rounding it would contradict the exercise.
- **The axis range is derived from the boundaries actually present**, with a
  margin, rather than a fixed window an author must remember to widen — the
  same reasoning `function-graph`'s tick derivation and `sign-chart`'s
  `search` range both rest on, adapted to a domain with no natural default
  span of its own.

Tick positions on the shared axis are not strictly linear in value: two
boundaries closer together than their printed labels would fit are pushed
apart in a left-to-right pass that preserves order (`preset.ts`'s `px`
adjustment loop). A number line that is topologically exact but visually
illegible answers no question a reader has.

## What was refused

**A third notation for "the domain of an expression"** (`x^2 - 4 ≥ 0`,
letting the preset solve the inequality itself). That is `sign-chart`'s job —
it already finds an expression's roots and signs — and duplicating a solver
here would be exactly the second engine ADR 0027 and `docs/decisions/0002`
both warn against. `number-line` draws a set that is already known; finding
the set from an expression stays `sign-chart`'s.

**A single point as a member of the grammar** (`x = 3`). A filled point with
no line either side is a legitimate figure, but nothing in the target use —
inequalities, domains, unions and intersections of intervals — asked for it,
and adding a third bound shape (point, not interval) to every downstream
computation for a case nobody exercised was not worth the surface area.

**Symbolic simplification of a computed row's result** (printing "x ∈ (1, 3)"
as a single sentence). The computed row already IS the simplified set — the
merge in `normaliseUnion` collapses overlapping and touching pieces — so nothing
further needs solving; only the drawing was left to do.

## The cost, stated

An equality is refused rather than drawn (see above). A row whose set has no
finite boundary at all — the whole real line, or ∅ — contributes nothing to
the axis range by itself; a figure with only such rows falls back to a fixed
default span, since there is nothing in the text to derive one from. The
bracket-versus-inequality-chain grammar accepts `,` as a bound separator for
readability, which means a decimal endpoint written with a comma inside a
comma-separated bracket is genuinely ambiguous; rather than guess, that input
is refused by name and the two unambiguous spellings (`;`-separated with
comma decimals, or `,`-separated with dot decimals) are documented in
`PRESET.md`.
