# 0040 — Computed sheet text: every number derives from the exercise's params

## Status

Accepted.

## The need

In a sheet, "calcule a área de 0 a 2" in the statement, the bound `2` in the
figure's `areas`, and "8/3" in the answer were three typed copies of facts
that could drift apart. ADR 0026 removed one kind of copy (the answer typed
twice) and `{{fig.P}}` another (coordinates typed beside the figure that
computes them), but a statement's own numbers, a figure's inputs, and a
computed result like an integral were still typed by hand.

Phase 2 of the plan (seeded variants of each exercise) makes this
non-negotiable: a generator can only change an exercise's numbers if every
number a reader sees derives from one set of values it can replace.

## The decision

### 1. `params`: one place per exercise, one per sheet

```json
"params": { "a": 0.5, "b": 3, "f(x)": "a*x^2", "A": "integral(f(x), x, 0, b)" }
```

A param is a number, or an expression over other params in the closed
grammar of `expr.ts` (named variables, `parseIn`), plus the calculus
functions below. A key written `f(x)` defines a **function** of x over the
params. Order does not matter: dependencies are followed lazily, and a
**cycle** (`a → b → a`), an **unknown name**, or a reserved name (a
constant, a function, `figure2`, which would collide with the marker) is
refused by name.

A sheet-level `params` is shared by every exercise and by the sheet's own
texts (cover, leads). An exercise may not redefine one of its names: two
definitions of `n` in one exercise would make "which n?" a question the
reader of the JSON has to answer.

`evaluateParams(spec, overrides, base, where)` in `src/sheet/calc.ts` is
the one entry point: `overrides` replaces some params' definitions with
numbers and every param derived from them is recomputed. That is the whole
interface a variant generator needs; `resolveSheet(raw, { sheet, exercises
})` in `sheet.ts` applies overrides to a whole sheet and returns every
resolved text and substituted figure without rendering, and `buildSheet`
takes the same overrides as `options.params`.

### 2. `{{= …}}` in any text

`{{= <expression>}}` prints a value through the one formatter (ADR 0023),
TeX inside `\( \)` / `$$ $$` and text outside, following the `{{fig.P}}`
precedent. `{{= e : 2}}` fixes the decimals, like `{{num:x:2}}`. `{{a}}`
is shorthand for a param, and `{{f}}` prints a param function's formula
with the params filled in (`\frac{1}{2}x^{2} - 3` in TeX, `(1/2)x² − 3` in
text) -- tidied of the identities a filled-in value exposes (`1x`, `x + 0`,
`x¹`) and nothing else. None of these collide with `{{figure}}`,
`{{fig.P}}`, `{{num:…}}` or `{{pt:…}}`, which are tried first; a param may
not be named `figure…`.

The calculus functions:

| call | computed by | refused when |
| --- | --- | --- |
| `integral(e, x, lo, hi)` | `numeric.integrate` (adaptive Simpson) | a pole in [lo, hi] (searched for on purpose, not left to a lucky sample), or Simpson refuses |
| `deriv(e, x, at)` | central difference with one Richardson step | e undefined on either side of `at`, or the one-sided slopes do not meet (a corner) |
| `lim(e, x, at[, left\|right])` | `numeric.limit` | its verdict is `"none"` (the sides disagree, an oscillation) |
| `f(2)` | the param function's tree, evaluated | the value is not finite |

`at` may be `inf` or `-inf`. An infinite limit prints `+∞` / `+\infty`, but
only as the whole expression: `lim(1/x², x, 0) + 1` is refused, because ∞
does not take part in arithmetic.

These calls take several arguments and `expr.ts` takes one and refuses the
comma. So `calc.ts` has a small scanner that tokenizes the way `expr.ts`
does, finds each calculus or param-function call, splits its arguments at
top-level commas, computes it, and hands `expr.ts` the expression with the
call replaced by its value in brackets. The grammar stays closed -- nothing is
`eval`ed -- and `expr.ts` is untouched. A calculus call inside an integrand
or a function body is refused: it would have to be computed at every x.

### 3. One snapping helper

The printed value is snapped to an exact form when it is one: p/q with
q ≤ 12, ±√n with n ≤ 400, kπ/q. There were three private copies of this
-- `snapExact`/`writeExact` in function-graph's asymptotes (ADR 0038), with
π; `exactLabel` in sign-chart (ADR 0027), without; and value-table's limit
verdicts (ADR 0039), without π and writing 0,5 as "1/2". They are now **one
exported helper in `src/locale/format.ts`** -- `snapExact(r, tolerance)`,
`writeExact`, and a new `writeExactTex` -- beside the formatter that writes
their result. asymptotes.ts re-exports it; sign-chart's `exactLabel` and
value-table's verdict call it. What really differed between them is the one
parameter each passes: how far its number can be trusted.

Each computed value is snapped at its own precision where it is computed --
arithmetic 1e-9, an integral 1e-7, a derivative 1e-6, a limit 1e-5 -- and
the whole expression at the loosest one it used, so `3·integral(x², 0, 2)`
prints 8, not 8,000000001.

### 4. Params in figures: substitution, structurally

Two ways were open: pass an environment into every preset, or substitute
params into the figure input before it is parsed. Substitution was chosen:
it is preset-agnostic (a graph, a sign chart, a raw spec all work the same),
and no preset learns what a param is. It is **structural**: the JSON is
walked and only string *values* are read, never keys.

- a string that is exactly `"{{= e}}"` or `"{{a}}"` becomes a **number**
  (`"to": "{{= b}}"`, `"range": [-0.6, "{{= b + 0.6}}"]`);
- a `{{…}}` inside a longer string is written in **expression syntax**:
  `"{{= a}}*x^2"`, `"x^{{c}}"` -- with exact spellings (`(1/3)`, `sqrt(2)`,
  `(pi/2)`, `(-2)`, a short decimal with a point), bracketed whenever it is
  not a bare unsigned number, so `x^{{c}}` with c = 1/3 cannot silently
  read as (x¹)/3 and a pt-BR `0,5` never reaches a tokenizer that refuses it;
- `"{{f}}"` becomes the param function's expression;
- anything else in `{{ }}` -- `{{fig.P}}`, an unknown name -- is refused,
  naming its JSON path.

A figure with no `{{` anywhere is returned as the same object. The points
`{{fig.P}}` cites are read off the substituted figure, so text and figure
still meet in one place.

### Acceptance, as measured

`experiments/exercises/calculo1/lista.json` builds to byte-identical HTML
(and 14 byte-identical SVGs) before and after; `tests/sheet-calc.test.ts`
pins the HTML's sha256. `experiments/exercises/parametros/lista.json` has
four exercises written entirely from params -- the area under a·x² on
[0, b], ∫ sin(kx) on one arch, a tangent line, a removable-discontinuity
limit -- and builds with no KaTeX error and every figure passing its checks;
the figure's own area label ("A = 4,5") and the answer ("A = 4,5") come from
the same `b`.

## What was refused

**`eval` or `new Function`.** The expression grammar is closed on purpose
(`expr.ts`), and the calculus calls are read by a scanner that only knows
four names and the param functions.

**Adding multi-argument functions to `expr.ts`.** Every figure parses
through it; `integral` inside a curve's expression would be computed at every
sample. The calculus lives where the numbers are printed.

**Passing params into the presets.** Eleven presets would each learn a new
concept, and a raw spec could not use it at all.

**Symbolic calculus.** `deriv` gives a number at a point, not f′'s formula;
2.1 of the example types `f'(x) = 3x^2 - 3` in its solution. A CAS stays out
of the core (ADR 0027, PLAN-COVERAGE "CAS").

**Letting an exercise shadow a sheet param.** Overrides are the way to vary
a value; a second definition is an ambiguity.

## The cost

- An inexact result prints the formatter's rounded form (`lim((1+1/n)^n, n,
  inf)` prints `2,718`); whether that deserves "≈" is the author's sentence
  to write. e is not a snapping candidate.
- A filled-in formula keeps its author's shape: `a*x + b` with b = −2 prints
  `2x - 2`, but `a*x^2` with a = 1/3 prints `\frac{1}{3}x^{2}`, and nothing
  is collected or reordered. "Nice" numbers are the variant generator's job.
- Improper integrals, where f itself is infinite at an endpoint (∫₀¹ 1/√x dx,
  ∫₀¹ ln x dx), are refused by `numeric.integrate`. That is a deliberate
  limit of that kit, not of this layer. An integrand that is finite but has
  an unbounded derivative at an endpoint (∫₀⁴ √x dx, the quarter circle
  ∫₀¹ √(1 − x²) dx) was refused too until 2026-09-27; it now converges.
- value-table's limit verdicts now write an exact rational the way the
  formatter does (0,5 rather than "1/2") and may print kπ/q; sign-chart's
  headers may print π. Every existing test and fixture is unchanged.
- The `{{` scanner of `fillText` still treats any `{{` as a placeholder, so
  TeX like `\int_0^{{{b}}}` must be spaced: `\int_0^{ {{b}} }`.
