# 0041 — Seeded variants: reproducible re-rolls with a checkable admission gate

## Status

Accepted. Amended by [0042](0042-variant-sheets-and-gabarito.md): the `derive` option is gone; predicates are evaluated over an environment the caller computes with `calc.evaluateParams`, so there is one evaluator of params, not two. The section below on derived parameters describes the design 0042 replaced.

## The need

PLAN-COVERAGE.md's Phase 2 asks for "fresh versions of each exercise for
revision": a student who already worked Exercise 1.1 wants the same exercise
again with different numbers, not a different exercise. Naively re-rolling
random numbers into an exercise's parameters breaks two things at once:

- **The gabarito.** An answer key is only useful if it can be regenerated
  for the exact numbers a given variant used. Random numbers with no
  memory of how they were drawn cannot be reproduced later to check a
  printed answer, or to regenerate a lost sheet.
- **"Nice" numbers.** A parameter drawn uniformly from an interval will,
  almost always, make the exercise ugly or unanswerable by hand: a
  quadratic whose roots are irrational, a fraction with a three-digit
  denominator, a division that doesn't come out even. A Cálculo 1 exercise
  that wants `a` and `b` distinct integers with `a - b` a clean fraction
  needs the sampler to know that "not every draw is a keeper."

Both point at the same shape: sample from a declared domain, keep only
draws that pass declared checks, and make the whole thing replayable from
one small piece of state.

## The decision

### Seeded, not random

`generateVariants` takes a `seed` (a number, or a string hashed with
`seedFrom` — an exercise's own id is the natural choice) and drives every
draw from one `mulberry32` generator seeded from it. Same seed, same
domains, same predicates → byte-identical admitted parameter sets, on any
machine, forever. That is what lets a gabarito be regenerated rather than
stored twice, and what makes this module's own tests exact-equality tests
rather than statistical ones.

mulberry32 was chosen over `Math.random` (unseedable) or a crypto-based
generator (platform-dependent output, and no need for unpredictability —
nothing here is adversarial) because it is five 32-bit operations, no
dependency, and its entire state fits in one integer: the reproducibility
guarantee is trivially true by construction, not something that has to be
argued from a spec.

### Declarative domains and predicates, not callbacks

A domain (`{"int": [lo, hi], "exclude": [0]}`, `{"choice": [1, 2, 5,
"1/2"]}`, `{"decimal": [lo, hi, step]}`, `{"sign": true}`) and a predicate
(`{"integer": expr}`, `{"fraction": expr, "maxDen": n}`, `{"range": [expr,
lo, hi]}`, `{"nonzero": expr}`, `{"distinct": [expr, ...]}`, `{"positive":
expr}`) are both JSON, not JavaScript. Two consequences follow directly:

- **Nothing here executes an author's code.** A domain or predicate is
  data an integrator can put next to the exercise in the same JSON file
  the rest of the sheet is written in, and it goes through `expr.ts` —
  the same closed, declared-variable grammar `function-graph` sources
  already trust — never `eval`.
- **A rejection is nameable.** `generateVariants` reports rejection counts
  keyed by `predicateName(predicate)` (e.g. `"positive(a - b)"`), by
  `"duplicate"`, or by whatever string an `admit` callback returns. A
  manifest can print "417 draws, 380 admitted, `positive(a-b)` rejected 30,
  `distinct(x1, x2)` rejected 7" — a callback that only returned `boolean`
  could not say this.

Derived parameters (expressions the sheet, not this module, will also
need to compute) are evaluated here too, via an optional `derive` map:
each is an expression over the previously-sampled and previously-derived
names, evaluated with `compileIn`. This module does not import anything
from `sheet.ts` to do this — it treats `derive` as one more piece of
declarative data, so predicates can be written against a derived name
(`"sum"`) exactly as they would against a sampled one (`"a"`), and the
integrator does not have to sample, then separately re-derive, then
separately re-filter.

### Two-stage admission: predicates, then the real pipeline

"Nice numbers" and "a figure that still passes its checks" are different
concerns computed by different code: this module can check `a/b` is a
small fraction without knowing what a figure is, but it cannot know
whether a `function-graph` built from those numbers keeps its curve label
near its curve. So admission is `generateVariants({ domains, predicates,
admit })`: declarative predicates run first (cheap, no rendering), and
only a draw that survives them is handed to the caller-supplied `admit`
callback, which the integrator will use to actually build the exercise's
figures and run their checks — "variant-admissible" per PLAN-COVERAGE.md
means passing both stages. `admit` returns `{ ok, reasons }` so a checker
failure is nameable exactly like a predicate failure.

Duplicate parameter sets (identical sampled + derived values) are rejected
before either stage, counted as `"duplicate"` — a variant that reproduces
an earlier draw exactly is not a fresh version of the exercise.

### `maxTries`, never an unbounded loop

`generateVariants` stops after `maxTries` draws (default `50 * count`,
floor 200) whether or not `count` was reached, and returns whatever was
admitted plus a `shortfall` object naming what was requested, what was
admitted, how many draws were spent, and the full rejection breakdown.
Nothing in this module can loop forever: an unsatisfiable predicate set
(e.g. a `range` no `int` domain can reach) fails loudly and countably
rather than hanging the sheet build.

### `pinFirst`: the author's own exercise is always variant 1

`pinFirst: params` skips sampling for variant 0 and runs exactly those
values through the same two-stage admission (still checked — an author
who accidentally violates their own predicate should hear about it, not
have it silently pass). This means an exercise list's *original* numbers
are always exactly variant 1 of its own regenerated set: a student
comparing "the version I did in class" against "today's fresh version"
is comparing variant 1 against variant 2+, never wondering whether the
familiar exercise got re-rolled out from under it. If `pinFirst` itself
fails a predicate or the `admit` callback, `generateVariants` throws
rather than silently dropping it — an author's own worked exercise is not
a draw to reject and move past.

## What was refused

**Predicates as arbitrary JavaScript callbacks.** Considered because it
is more expressive — any check expressible in the language. Refused
because it reintroduces exactly what `expr.ts` exists to avoid: a
function no reviewer can audit from the exercise file alone, and a
rejection reason that is, at best, whatever string the author remembered
to attach. The six declarative kinds here cover every "nice number" shape
PLAN-COVERAGE.md and the existing Cálculo 1 lists actually need; a shape
this set cannot express is a signal to add a seventh kind, not to open
the escape hatch.

**Evaluating derived parameters independently in `sheet.ts` and here.**
The sheet needs derived values for its own computed text
(`{{calc:...}}`); this module needs them to let predicates see them. Two
separate evaluators risked the same drift the project has refused
elsewhere (ADR on formatNumber: one formatter, not two that could
disagree) — a predicate passing against a value the sheet then computes
differently would be worse than not checking at all. Rather than import
`sheet.ts` (which would invert the ownership the integrating step is
meant to establish) or have the integrator re-derive things twice, this
module accepts `derive` as its own declarative input and is the single
place both the predicate check and the parameter set handed back to the
integrator agree on that value.

**Retrying indefinitely, or silently returning fewer than `count`.**
Either is a way this module could quietly produce a sheet with three
variants when a caller asked for ten. `maxTries` with a stated `shortfall`
makes that outcome loud and inspectable instead.

**A `Set`/hash-based near-duplicate check (values within some tolerance
count as the same draw).** Refused for now: exact-key duplicates are
the case that actually recurs (small `int`/`choice` domains have few
legal values), and a fuzziness threshold would need its own domain-
specific tuning per parameter this module has no way to guess.

## The cost, stated

- A small domain (few `int` values, small `choice` lists) combined with
  strict predicates can legitimately need `maxTries` above the default;
  the integrator is expected to raise it explicitly for such an exercise
  rather than this module guessing a larger default for everyone.
- Predicates only see numbers (`Env` is `Record<string, number>`): a
  `choice` domain that draws a non-numeric string is evaluated as a
  constant expression (`compileIn(value, [])`) to get a number for
  predicates to compare against; a `choice` value that is not itself a
  valid constant expression (a template string, say) simply will not be
  visible to any predicate that names it, and any predicate that does
  will refuse with "unknown name" rather than silently treating it as 0.
- This module does not know what a "sheet exercise" or a "figure" is, by
  design — the `admit` callback is where that knowledge lives, entirely
  outside this file. That means this ADR cannot promise anything about
  *which* figures get admitted, only that the loop calling into them is
  bounded, deterministic, and reports what it rejected.
