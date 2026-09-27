# 0039 — Limit tables: decimal schedule, and a verdict that cannot outrun its own evidence

## Status

Accepted.

## The need

A standard Cálculo 1 exercise: "complete a tabela e estime lim_{x→a} f(x)." The
textbook table approaches `a` from each side with DECIMAL steps — for a = 1,
x = 0,9; 0,99; 0,999; 0,9999 on the left and 1,1; 1,01; 1,001; 1,0001 on the
right (and toward infinity: 10; 100; 1000; 10000).

`numeric.ts`'s `limit()` already estimates a limit from real samples — the
whole point of that module is that "the samples ARE the evidence" for the
verdict, never a second, independently-typed table. But its existing schedule
is a twelve-step *geometric* sequence (ratio 0.3, chosen for numerical
robustness, not for matching a printed page): the closest sample lands at
roughly `0.3^12 ≈ 6e-7` of the starting step, and the intermediate x values
(`a - 0.1 * 0.3^i`) are not the decimal steps a Brazilian student was asked to
fill in. Printing that schedule would not be the table the exercise shows.

So two things were needed: a sampling schedule that matches the textbook
exactly, and a way to print a table from `value-table` that shows exactly
those x values, the computed f(x) at each, and a conclusion.

## The decision

### 1. `numeric.ts`: `limit()` gains a backward-compatible options argument

```ts
limit(f, a, side, { schedule: "decimal", count: 4 })
```

Default (`options` omitted, or `schedule: "geometric"`) is byte-for-byte the
original behaviour — the twelve-step geometric schedule, unchanged. This
matters because `function-graph`'s asymptote detection already calls
`limit(f, a, side)` with the two-argument-plus-side form, developed in
parallel with this change; nothing about that call site had to know a fourth
argument now exists.

`schedule: "decimal"` samples `a ± 10^-k` for `k = 1..count` (`count` default
4), scaled by `decimalUnit(a)`: 1 when `|a| < 1` (including `a = 0`, which is
exactly the textbook schedule), or the nearest power of ten at or below `|a|`
otherwise — so a table for `a = 100` steps by 90, 99, 99,9, 99,99 rather than
a step size that would round away to nothing next to 100. Toward an infinite
`a`, the schedule is `10^k` — 10, 100, 1000, 10000 — using the same
"`side` alone picks the direction of travel" convention the geometric
schedule already used for infinite `a` (a caller wanting `x → -∞` still
passes `side: "left"` regardless of whether `a` is written as `Infinity` or
`-Infinity`; nothing about this changed).

### 2. The verdict is computed from a schedule the printed samples must agree with

Four decimal steps are what a textbook prints, but four points is a coarser
probe than twelve geometric ones. Rather than choose between "printable" and
"trustworthy," `numeric.ts` computes both:

- the **dense** verdict, from the original twelve-step geometric schedule —
  exactly as reliable as it always was, because it is the same computation;
- the **decimal** samples, the four (or `count`) points that get printed.

The decimal-schedule result reports the dense verdict's kind and value **only
when the decimal samples themselves back it up** — checked by
`decimalAgreesFinite` (the last decimal sample lands within a relative
tolerance of the dense value, and got no farther from it than the first
sample did) or `decimalAgreesInfinite` (same sign, not shrinking). When they
disagree, the decimal-schedule verdict downgrades to `"none"`, carrying the
decimal samples and a reason naming the disagreement. **The samples returned
are always the decimal ones** — a caller printing `result.samples` is always
printing exactly the evidence the reported verdict rests on, never a
different table than the one that produced the number.

This is the direct consequence of `numeric.ts`'s standing rule (a number that
cannot be trusted is refused, not printed with false confidence) applied to a
schedule coarse enough that trust genuinely needs re-checking. `sin(1/x)` at
0 is the case the module's own doc comment already names: its geometric
schedule fails to settle, so it never even reaches the agreement check — it
is `"none"` before the decimal table is asked anything. The check exists for
the rarer case: a function that IS genuinely convergent but settles too
slowly for four decimal steps to show it on their own.

### 3. `value-table` gains a `limit` input mode

```json
{
  "preset": "value-table",
  "limit": { "expr": "(x^2 - 1) / (x - 1)", "at": 1, "side": "both", "count": 4 }
}
```

Mutually exclusive with `xs`/`functions` — refused if both are given, refused
if neither is. `at` is a finite number or `"inf"`/`"-inf"`; `side` defaults to
`"both"` for a finite `at`, or the direction the sign of an infinite `at`
already implies. The table draws the left arm (far from `a` to near it, as
sampled), a column for `a` itself (the value if defined, `"∄"` otherwise,
visually distinguished as the point both arms converge on), and the right
arm — each arm headed by its direction of approach ("x → 1⁻" / "x → 1⁺", or
"x → +∞" / "x → −∞" toward infinity). A rule separates the table from its
computed conclusion:

- finite: `"lim f(x) = 2"` (exact) or `"lim f(x) = ≈ 2,718"` (a formatted
  decimal, when the value is not within tolerance of a small fraction or
  root — the same snapping discipline `sign-chart`'s `exactLabel` applies to
  a root, reimplemented locally with a looser tolerance because a
  decimal-schedule sample is a coarser estimate than a bisected root);
- infinite: `"lim f(x) = +∞"` / `"lim f(x) = −∞"`;
- none: `"o limite não existe"`, with both one-sided verdicts printed beneath
  it, because a reader who is told "it does not exist" is owed the two
  numbers that disagree.

Every cell stays `freeStanding` (ADR 0035) — a cell is read by its row and
column, not by proximity, the same rule every other table preset here
follows.

**The x-schedule column is not printed through `formatNumber`'s default
"shortest honest form."** That formatter's job elsewhere is to write the
value a reader would write by hand, which is why `0,9999` — a value with no
short fraction and more than three decimals — rounds to `1` under the default
path, indistinguishable from `a` itself. The schedule's own step size is
known exactly (`10^-k` of `decimalUnit(at)`), so the x column is instead
formatted with `{ decimals: k }`, the one option that bypasses fraction
snapping. The f(x) values keep the default formatting, because a *computed*
value legitimately wants the short/fraction form (`1`, `−1`, `17/3`).

## What was refused

**Deriving the decimal table's verdict independently of the dense one.**
Sampling only four decimal points and deciding convergence from them alone
would mean the printed evidence sometimes says less than the truth (missing
a genuine but slow-settling limit) but never says something the truth
disputes. Computing the verdict entirely from the dense schedule and simply
trusting it to agree with four sparser points risked the opposite: a verdict
whose own printed evidence, read on its own, would look unsettled or
contradictory to the student computing it by hand. Requiring agreement
between the two is the only option where the printed table and the printed
conclusion cannot come apart.

**A single combined schedule tuned to serve both purposes.** Widening the
decimal schedule (more steps, or steps chosen adaptively) would blur the
"this is the exact schedule the exercise prints" property that is the entire
reason this mode exists, and does not remove the possibility of disagreement
for a genuinely pathological function — it only changes how rare the
disagreement is.

**Reusing `sign-chart`'s `exactLabel` for the limit's value.** That helper
always returns *some* formatted string; it has no way to say "this is not
close enough to be exact," because everywhere it is used the value has
already been snapped to an exact root before formatting (`sign-chart`'s
`snap`/`snapPole`). A limit's numeric value has not been snapped — it is an
estimate — so a separate `snapExact` was written locally, with a looser,
explicit tolerance and an honest `null` when nothing close enough is found.

**Automatic direction inference from `at`'s sign for a finite `at`.** Unlike
the infinite case (where `side` alone has always picked the direction), a
finite `at` genuinely has two independent sides, and defaulting to `"both"`
matches what "estimate the limit" means without the exercise having to say
so — refusing to guess only when the caller already narrowed it with an
explicit `side`.

## The cost, stated

- **A slow-settling but genuine limit can be reported as `"não existe"` by
  the decimal schedule alone**, even though the dense schedule (and a caller
  using `{schedule: "geometric"}` directly) would report it correctly. This
  is the accepted trade of the agreement check: a false "does not exist" from
  too coarse a printed schedule, never a false "exists" the printed schedule
  itself does not support. `numeric.ts`'s dense verdict remains available to
  a caller — such as `function-graph`'s asymptote code — that does not need
  to print the decimal table at all.
- **`count` is capped at 8** by `value-table`'s own validation (not
  `numeric.ts`, which accepts any positive count) — a table wider than that
  stops being the four-to-eight-row exercise this mode exists for.
- **The `a` column's highlight is colour only**, no filled backing box — a
  filled box risked tripping `backing-hides-no-ink` against the table's own
  rule lines for no real gain, so the visual distinction is deliberately
  understated.
- **One function per limit table.** `limit.expr` is singular, matching every
  fixture and worked example in the assignment; a table comparing several
  functions' limits at once is out of scope, the same restraint ADR 0033
  already states for automatic x values.
