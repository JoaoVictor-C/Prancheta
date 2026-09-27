# 0042 — Variant sheets and a separate gabarito

## Status

Accepted. Completes Phase 2 of PLAN-COVERAGE.md. Amends 0041 (removes `derive`).

## The need

A student revising from a list wants the same exercises again with other
numbers, and wants to check their work *afterwards*: the answers must not be
on the page they are working from. ADR 0040 made every number in an exercise
derive from its `params`; ADR 0041 made a seeded, bounded sampler with
declarative predicates. Neither built anything a student could print. What
was missing:

- which params of an exercise are sampled, written next to the exercise;
- an admission rule that runs the real pipeline, so no version carries a
  figure that fails its checks or a sentence whose computation was refused;
- a layout: N printable versions, and the answers kept apart;
- a record of what was drawn, so a printed version can be regenerated and
  checked against its gabarito;
- one seam closed. 0041's `derive` evaluated derived params with its own
  `compileIn` loop, beside `calc.evaluateParams`. A predicate could pass
  against a value the sheet then printed differently (an `integral(...)`
  param, which `derive` cannot evaluate at all, is the obvious case).

## The decision

### Input: `variants` on the exercise

```json
"params":   { "a": 0.5, "b": 3, "f(x)": "a*x^2", "A": "integral(f(x), x, 0, b)" },
"variants": {
  "domains":    { "a": { "choice": ["1/2", 1, 2, 3] }, "b": { "int": [1, 4] } },
  "predicates": [{ "range": ["a*b^2", 0.5, 6] }, { "fraction": "A", "maxDen": 6 }],
  "maxTries":   200
}
```

Every domain names a number param of *that* exercise (validation refuses a
function param or an unknown name, and lists the params). A draw's values are
handed to `calc.evaluateParams` as **overrides**, so every derived param,
every `{{= …}}` and every figure substituted from `{{…}}` follows. Sheet-level
params are not sampled. An exercise without `variants` is the same in every
version.

### One evaluator of params

`generateVariants` no longer computes anything. It takes an `evaluate(sampled)`
callback returning the environment the predicates see, or `{ refused }` to
reject the draw under that reason. The sheet backs it with
`calc.evaluateParams(e.params, toNumbers(sampled), sheetEnv)` -- the same call
`resolveSheet` makes -- and turns a `SpecError` (a pole inside an integral, a
limit that does not settle) into a refusal. Without a callback the sampled
values alone are the environment. `derive` is removed; its tests now run
through `calc.evaluateParams`. A predicate may name any value param,
calculus ones included (`{"range": ["A", 0.1, 5]}` where `A` is an integral).
`"1/2"` from a `choice` becomes a number through `numericValue` (a constant
expression, never `eval`), and `"1/2"` and `0.5` are the same draw for the
duplicate check.

### Admission: the real pipeline, per exercise

A draw is admitted when, in order:

1. it is not a duplicate of an admitted draw;
2. `evaluate` computes its params;
3. every predicate holds;
4. `admit`: the sheet reduced to this one exercise goes through
   `resolveSheet` with the overrides (every placeholder in statement, answer,
   solution and captions resolved), and every figure and solution figure is
   drawn through `render` -- the path `buildSheet` takes -- with every check
   passing.

Rejections are counted by reason: a predicate's name, `duplicate`,
`params refused: …`, `text refused: …`, `figure <key> refused: …` (the preset
refused the input, e.g. an area reaching outside the plotted x range), or
`figure <key>: check <id>`. A reason's numbers are replaced by `#` so that
one kind of failure is one counter, and the first full message behind each
reason is kept beside it. A draw that fails several checks counts under each.

Renders are cached by the substituted figure's content, so the admitted
figures are not drawn twice and an exercise without `variants` is drawn once
for all versions.

KaTeX errors cannot be judged at admission (they need the page in a
browser); the final build still finds and fails on them, per document.

### The command

```
sheet <file> --variants N [--seed S] [--answers inline|separate] [--allowShortfall]
sheet <file> --answers separate
```

- Version 1 is the author's own numbers (`pinFirst`); it is resolved and
  drawn through the same override path as the others, and a test pins it
  equal to the plain build's exercises and figures.
- The seed defaults to the sheet's `name`; each exercise draws from
  `<seed>/<id>`, so adding or editing one exercise does not reshuffle the
  others. The seed is printed on each version's cover and in every page
  footer ("versão 2/3 · semente “parametros”").
- `--answers` defaults to `separate` with `--variants` and to `inline`
  without. `inline` with variants gives each version its own answer key
  and solutions and no gabarito document.
- `--seed` without `--variants` is refused rather than ignored.

### Layout

In `ProjectHub/Listas/<name>/` (or `--out`):

| file | what |
| --- | --- |
| `<name>-v<k>.html`, `.pdf` | version k: cover and exercises only, starting on the cover page |
| `pages/v<k>/pNN.png` | its pages |
| `figures/v<k>/*.svg` | its figures (every version's folder is complete) |
| `<name>-gabarito.html`, `.pdf` | per version, one part: quick key, then worked solutions with that version's solution figures |
| `pages/gabarito/pNN.png` | its pages |
| `<name>-variants.json` | the manifest |
| `<name>.json` | the source, verbatim |

A plain `--answers separate` build writes `<name>.html/.pdf` (exercises
only) and `<name>-gabarito.html/.pdf` beside `figures/` and `pages/`. A
variant build removes only `figures/v*`, `pages/v*` and `pages/gabarito`, so
a plain build in the same folder keeps its figures.

### The manifest

`<name>-variants.json`: the sheet, the seed, the number of versions, the
answers mode; per exercise with `variants` its per-exercise seed, sampled
names, domains, predicates, requested/admitted counts, draws spent, the
rejection counts and one full example message per reason, and the shortfall
message if any; per version the HTML/PDF paths (relative) and, for every
exercise, the sampled values and every value param as evaluated. Nothing in
it depends on time or on the output folder: the same seed gives a
byte-identical manifest (tested).

### A shortfall fails the build

If an exercise cannot reach N distinct admitted draws within `maxTries`, the
command prints the shortfall with its rejection breakdown and exits 2.
`--allowShortfall` builds anyway: the missing versions reuse admitted draws
in turn, flagged `repeatsVersion` in the manifest, and the shortfall is
printed as a warning. The default is to fail because the author asked for N
*fresh* versions; a student handed "version 4" that is secretly version 1
revises nothing, and a silent repeat is exactly the kind of quiet
degradation 0041 refused. Opting out is one flag when the author accepts it
(a small domain, a list with one stubborn exercise).

## What was refused

**Checking the variant with a lighter pass than the build.** Rendering
every candidate costs a browser layout per figure; checking predicates only
and trusting the figure would be faster. Refused: the demo list's exercise
2.1 has five legal values of `c`, and two of them (c = 1, c = −2) produce
figures whose labels collide or stray from what they name. Predicates cannot
see that; only the checks can. The cache keeps the cost to one render per
distinct figure.

**Evaluating predicates on the sampled values only, with derived values
re-derived in the predicate expression.** It would have closed the seam by
making predicates weaker (no `integral`, no `lim`), and pushed the
duplication into every author's predicate.

**Answers at the back of each version, cut off by the student.** One
document per version with a page break before the answers is what the inline
mode already is; separating them physically is the need.

**A random seed by default.** A seed nobody wrote down cannot regenerate a
printed version. The sheet's name is always at hand and printed on the page;
`--seed` gives a new set.

**Sampling sheet-level params.** They are shared by every exercise; varying
them would vary exercises that have no `variants`, which contradicts
"unchanged in every version".

## The cost, stated

- Figures written for one set of numbers often fail for others. Every range
  and label position that should follow the params must be written as
  `{{= …}}` (the demo's units are `"{{= 378/(b + 1.2)}}"` so a figure keeps
  its printed size). The gate rejects the rest, which is correct but can
  leave few admissible values: 2.1 admits 3 of 5.
- A figure that passes its checks can still be poorly proportioned; the
  checks do not judge size. The demo was only fixed after looking at the
  page PNGs (a 1.1 variant with b = 4 made a figure taller than a page).
- Rejection counts are per reason, not per draw: one draw failing three
  checks adds three. The manifest's `triesUsed` is the per-draw count.
- The HTML changed shape inside `sheetHtml` (split into parts so the
  gabarito can reuse them); the inline output is byte-identical, pinned by
  the Cálculo 1 hash test.
- A plain `--answers separate` build and a variant build into the same folder
  both write `<name>-gabarito.html`; the last build owns it.
- A formula filled with a negative param printed `x - -1`. `calc.tidy` now
  writes `x + 1` (and `x + (−a)` as `x − a`); this changes what a param
  function prints for negative values everywhere, which is the intent.
