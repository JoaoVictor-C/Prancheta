# Build plan, part two — M5 to M10

**Status:** done. M5–M10 shipped or closed by 2026-08-29 (see the ROADMAP entries of 2026-08-22 to 2026-08-29); what they left open is in [TODO.md](../../TODO.md).

[Part one](PLAN.md) took the project from nothing to a verified repertoire: M0–M4 are done and A1–A3 are retired. This is what comes after, derived from a gap analysis against human-oriented figure tools (TikZ, Asymptote, CeTZ, Illustrator, Inkscape, Figma, matplotlib, Vega-Lite, Penrose, Bluefish, draw.io, Excalidraw, D2, Graphviz, ChemDraw, KiCad, GeoGebra, Manim's static side). Animation stays out of scope for M5–M10 specifically — **it started 2026-08-24 as M11**, outside this document's own numbering; see [ADR 0012](../decisions/0012-animation-m11-scope.md) and the ROADMAP entry of the same date.

Ordered by **risk retired per day**, same as part one, with one addition that is now the house rule:

> **Every new degree of freedom ships with the check that constrains it.**
>
> The effects layer established this and it is not decoration. A capability the project cannot verify is a capability that can be silently wrong while the manifest says `ok` — which is the one failure mode this project exists to refuse. Each milestone below names its check, and each check ships with a planted-defect fixture proving it can fail.

---

## The complete list

Everything the analysis found, with nothing dropped.

### Comparative lacks — capabilities the reference tools have and Prancheta does not

| # | gap | where it hurts |
| --- | --- | --- |
| 1 | **Expressive primitives** — no curves, arcs or paths; no non-rect shapes; no grouping or nesting; no transforms | Most figures that are not box-and-arrow |
| 2 | **Data binding with scales** — the chart preset takes literal pre-computed values | The agent does scale arithmetic in its head: the project's own founding failure, one level up |
| 3 | **Export layer** — no PDF, dark-only theme, no font embedding, no editable handoff, no per-element accessibility metadata | The figure cannot leave the tool |
| 4 | **Math typesetting** — no KaTeX/MathJax anywhere | Any figure with real notation; modules hack Unicode subscripts |
| 5 | **Edge labels, self-loops, spline routing** — connectors are polylines only | Dense graphs, state machines, ERDs |
| 6 | **Symbol and stencil libraries** — no reuse; every module hardcodes its own symbols | Domain figures; cross-module sharing |
| 7 | **Constraint and alignment vocabulary** — no align, distribute, keep-clear, same-size | Anything whose layout is a relationship rather than a flow |
| 8 | **Units, scale and dimension annotation** | Excludes mechanical and architectural drafting entirely |
| 9 | **Arrowhead and line-style vocabulary** — one filled triangle, one dashed boolean | UML, ERD, chemistry, control diagrams |

### Internal debts — real, but where Prancheta leads the reference set rather than trails it

| # | debt | evidence |
| --- | --- | --- |
| 10 | **Repair cannot translate** — only `width`, `height`, `wrap`, `canvasPadding` | Two of six checks are un-repairable by construction; `repair.ts` says "no repair strategy for this check" |
| 11 | **No colour verification** — all six checks are geometric | A second palette would be unverifiable |
| 12 | **Modules are detect-only** — the core measures a module's SVG but has no lever on it | 11 figure kinds outside the repair loop |

No tool in the reference set does 10–12 either. They are debts against this project's own thesis, not deficits against Illustrator.

### Explicitly not doing — declared non-goals

Interactive editing, snapping and alignment guides, photorealism, verifying that a figure is *true*.

One correction to the record: **producing an editable handoff file is not covered by the editing non-goal.** Refusing to *be* an editor is not refusing to emit a file an editor can open. That belongs in M6, not here.

A second correction: **animation was listed here when this document was written and is no longer a non-goal.** It started 2026-08-24 as M11, outside this document's M5–M10 numbering — see [ADR 0012](../decisions/0012-animation-m11-scope.md).

---

## The two findings that set the order

**Cost is path-dependent, not intrinsic.** The effects layer cost little because a clean measure-then-emit seam already existed; the whitespace bug stayed latent for the project's whole life until a consumer that needed truthful text extents arrived. So the order of work determines its cost, and the plan below is a dependency ordering, not a wish list.

**Translation repair has no valid termination potential under the obvious candidate.** Total-overlap-area does not decrease monotonically — moving A out of B can push A into C, and a three-box cycle can oscillate. The existing proof survives only because every edit strictly increases one bounded quantity. This makes M10 deeper than it looks and is why its ADR is written before any code.

Consequence: three **independent fronts**, not a chain. The cheap publication work must not be gated behind the hard placement work.

```
FRONT A (deliverable)   M5 colour ──► M6 export layer
FRONT B (vocabulary)    M7 primitives ──► M8 scales & data
FRONT C (geometry)      M9 module repair    [independent]
                        M10 constraints + translation   [deepest, ADR first]
```

M5 → M6 is a hard dependency. M7 → M8 is soft (scales want symbols and rotated text, but do not require them). M9 is fully independent and can run at any time. M10's ADR can be written in parallel with everything.

---

## M5 — Colour becomes a variable, and a checkable one (retires A4) · **done 2026-08-22**

> Shipped. A4 held: two variants ship, both provably legible, with a third check catching the exact defect this decision exists to prevent -- caught it twice, in fact, once in the design system's own chart palette. Findings are in [the roadmap](../../ROADMAP.md).

**A4** — a second palette can exist without the project losing the ability to say whether a figure is legible.

Today `theme.canvas.background` is hardcoded `#0F1115` and every role colour is hand-tuned against it. One palette can be eyeballed. Two cannot, and nothing in six geometric checks would notice an illegible figure.

The two halves must land together. A second theme with nothing able to verify it means the manifest says `ok` for an unreadable figure; a contrast check against a single hand-tuned palette is ceremony that can never fail.

**Build:**
- `contrast-sufficient` check — WCAG relative luminance between label and its own fill, fill and stroke, and ink against canvas. Deterministic, no model.
- Curated palettes as data, not constants: `dark` (current, unchanged), `light`, `print` (light, ink-economical), each with the full role set.
- A colourblind-safety check on categorical palettes: simulate deuteranopia/protanopia and assert minimum pairwise distance. This is the item matplotlib's viridis family and Vega-Lite's default schemes already solve for their users.

**Falsifiable outcome:** a fixture with a deliberately bad palette (mid-grey text on mid-grey fill) must FAIL `contrast-sufficient`, and all existing fixtures must pass unchanged under `dark`. If the check cannot fail on the planted defect it is vacuous and does not count.

**Ships:** ADR 0007 — colour is checked, not chosen. Theme variants. Two new checks. Planted-defect fixture.

---

## M6 — The export layer (retires A5) · **done 2026-08-22**

> Shipped. A5 held: a figure can leave the tool. Two real bugs found in the process (resvg does not honour @font-face at all; the first version of the PDF-vector check was fooled by a clip-only `re`), both fixed and pinned as regression tests. Findings are in [the roadmap](../../ROADMAP.md).

**A5** — a figure can leave the tool: survive print, survive a machine without the fonts, and hand off to a human.

Five items that each look minor and together are one missing layer. The organising question is *what does a figure need in order to leave?*

**Build:**
- **PDF output** via Chromium's `page.pdf()` — vector, not a rasterised page. Physical sizing (mm, journal column widths) rather than pixels.
- **Font embedding or outlining.** Two modes: embed WOFF2 as a data URI for web, convert glyphs to paths for print. Outlining is the portable one and loses text selectability, so it is opt-in and recorded in the manifest.
- **Per-element accessibility metadata** — `<title>`/`<desc>` per element. The data already exists: label→owner relationships and connector joins are in the manifest today and simply are not written out.
- **Structured, editable SVG** — groups, stable ids, layer semantics, so Inkscape or Illustrator opens something a human can actually grab. Currently the export is flat.

**Falsifiable outcome, and it is a genuinely good one:** re-render the exported SVG with resvg configured `loadSystemFonts: false`. If the text still appears, the fonts really travelled. If it vanishes, the embedding claim was false. This is the same second-opinion discipline `check:independent` already uses, pointed at a new question.

**Ships:** ADR 0008 — the deliverable, not the drawing. PDF writer. Font pipeline. `check:fonts-travel`. A11y metadata. Grouped SVG output.

---

## M7 — Cheap expressive range (no assumption at risk)

Purely additive, low architectural risk, and deliberately placed before the deep geometry work because none of it accretes placement code — every item here keeps an axis-aligned bounding box, so the mirror hosts it unchanged and all six existing checks keep working.

**Build:**
- **Non-rect shapes** — circle, ellipse, diamond, hexagon, rounded polygon, stadium. Same bbox as a rect, so only the emitter and interior containment change. `isPointInFill` already exists in `verify.ts`.
- **`label-within-shape`** — extends `text-fits-box` to non-rect interiors. A label centred in a diamond overflows its *shape* long before it overflows its *box*, and today nothing would say so.
- **Rotated text** — measure unrotated, emit with a transform, derive the oriented box as exact arithmetic from the unrotated metrics plus the angle. This is the effects layer's own move (measure with it off, apply at emission) and it is why rotated tick labels are cheap while rotating a *container* is not.
- **Arrowhead vocabulary** — open, closed, diamond, circle, crow's foot, half-arrow. Drawn as explicit paths, never `<marker>`, same portability rule as today.
- **Line-style vocabulary** — dash patterns as named roles rather than a boolean.
- **Symbol library** — reusable leaf primitives with a declared bbox, checked against measurement exactly as a module's `declaredBox` is. Lets `circuit` stop privately owning its resistor.

**Falsifiable outcome:** a fixture with a long label inside a diamond and a hexagon must FAIL `label-within-shape` while PASSING `text-fits-box`, proving the new check sees something the old one cannot. Rotated tick labels at 45° must have a measured oriented box within 0.5px of the analytic one.

---

## M8 — Scales and data binding (retires A6)

**A6** — the agent never does scale arithmetic. Data goes in; ticks, axes, legends and dimensions come out derived.

The chart preset currently takes literal pre-computed values, which means the agent computes the mapping from data to pixels in its head. That is the founding failure of this project, reproduced one level up, and it is the highest-value item on the comparative list after primitives.

Scales, data binding and dimension annotation are **one mechanism**: a scale is a domain→range mapping with a tick policy; data binding is that mapping applied to a dataset; dimensioning is that mapping applied to physical units. Building them separately duplicates the machinery.

**Build:**
- Scale abstraction — linear, log, band, time; a tick policy that produces human-readable steps.
- Data binding for `chart` — dataset plus encoding channels; derive domain, ticks, axes and legend.
- **Units and dimension annotation** — a figure scale (1:50), real-world units, dimension lines with extension lines and arrows. Reuses the same mapping and unlocks the drafting genre.
- **Math typesetting** — MathJax SVG output (paths, not fonts) embedded as a group with a measured bbox. SVG-with-paths is chosen over KaTeX HTML because it is portable and measurable, the same reason `foreignObject` is banned.

**Falsifiable outcome:** `tick-labels-do-not-collide` must fail on a dataset with long category names at a narrow width, then pass after the repair loop rotates or thins the ticks. A dimension line must measure to its declared real-world length within tolerance.

---

## M9 — Module repair (retires A7) · *independent, can run any time*

**A7** — a module can be repaired, not merely inspected, without the core knowing what it draws.

All 11 modules are detect-only. The core measures and reports; the author fixes. This is most of the promise but not all of it, and closing it needs no IR change at all.

**Build:**
- Extend the module protocol: a module declares an **adjustable parameter surface** — this label may move, this radius may grow, this row may reflow — with declared bounds.
- Make `runModule` **re-invocable** with amended parameters.
- A repair planner for module checks that turns a failed check into a parameter amendment, with the same monotone-and-bounded discipline the core loop uses.
- Adopt in two or three modules first as proof, then the rest.

Neither half works alone: declared knobs nobody turns are inert, and re-invocation with nothing declared has nothing to change.

**Falsifiable outcome:** take a module figure that currently fails a check at a narrow canvas — `topology`'s label collisions are the natural candidate — and show the loop drives it to green by amending declared parameters, with every amendment recorded in the manifest. If it oscillates, the budget discipline was wrong.

---

## M10 — Constraints and translation repair (retires A8) · *the deep one*

**A8** — the repair loop can MOVE things and still provably terminate.

This is the largest comparative lack (Penrose, Bluefish) and the largest internal debt (two un-repairable checks) — and they are **one piece of work**, because a mover with no declared target state has neither an objective nor a stopping rule.

**The termination argument is written first, as an ADR, before any code.** The obvious potential is refutable: total-overlap-area does not decrease monotonically, since moving A out of B can push A into C, and a three-box cycle can oscillate indefinitely. A repair loop that can oscillate would destroy the exact property this project sells. Candidate approaches to evaluate in the ADR:
- Per-node displacement budget plus a lexicographic potential (strict decrease on the largest violation, ties broken by total).
- Delegation to a solver with a published convergence proof, with the loop reporting best-effort-and-what-remains rather than claiming a fixpoint.

**Build, in order:**
1. ADR 0009 — the termination argument. No code until this holds.
2. Constraint vocabulary in the IR: `align`, `distribute`, `keepClear`, `sameSize`, `anchor`.
3. Placement layer that owns positions as a *solution*, not a final answer. `layout/place.ts` is already half of this — it takes ELK's positions today and treats them as immutable.
4. `constraints-satisfied` check.
5. Translation repair edits, bounded by the budget, driven by constraint and collision violation.
6. **Curves and arbitrary paths** in the IR, now that placement is owned rather than delegated to CSS flow.
7. **Edge labels, self-loops, spline routing** — all three depend on 6.
8. Grouping, nesting and container transforms. Last, and genuinely optional.

**Falsifiable outcome:** the planted-collision fixture that today reports `boxes-do-not-overlap` failed and unrepaired must converge to green by translation, in a bounded number of passes, on every fixture in the repertoire, with no oscillation. If a case oscillates, A8 is wrong and the honest outcome is a documented best-effort mode rather than a claimed fixpoint.

**Risk, stated plainly:** this is the one milestone that may fail. If the termination argument does not hold in a form simple enough to defend, the fallback is bounded best-effort with the residual reported in the manifest — which is still an improvement on "no repair strategy for this check", and still honest.

---

## Cross-cutting work, required by all of the above

Not optional, and easy to forget until something is stale:

- **An ADR per architectural decision** — 0007 (colour is checked), 0008 (the deliverable), 0009 (termination for translation).
- **A planted-defect fixture per new check.** A checker that reports everything as fine is indistinguishable from a checker that is not running. This is `--misdeclare`'s discipline applied to core checks.
- **Generated views and references stay green** — `npm run check:docs` covers `AGENTS.md`, the skill, and both generated references. New tables (shapes, palettes, scales) become generated references with `--check`, never hand-typed.
- **MCP resources and the CLI grow with the repertoire** — new vocabularies need a `prancheta://` resource and a listing command, or they are invisible the way the modules were.
- **`check:independent` extends to every new output** — PDF and outlined text get the same second-opinion treatment the SVG gets.
- **README and `modules/README.md`** track each milestone rather than being rewritten at the end.

---

## Sequencing recommendation

| order | what | why here |
| --- | --- | --- |
| 1 | **M5** colour + checks | Gates M6; smallest thing that unblocks the most |
| 2 | **M6** export layer | Turns figures into deliverables; pure win, no architectural risk |
| 3 | **M7** cheap primitives | Widest capability gain per unit risk; accretes no placement code |
| — | **M9** module repair | Fully independent; run in parallel with any of the above |
| — | **ADR 0009** | Write while M5–M7 are being built; it is thinking, not coding |
| 4 | **M8** scales and data | Highest-value comparative gap after primitives; wants M7's rotated text for ticks |
| 5 | **M10** constraints + translation | Deepest; only start once its ADR holds |

Start at M5. It is two checks and a palette table, it gates the whole deliverable front, and it is the smallest possible test of the house rule that a new degree of freedom must arrive with its check.

---

## Execution order

The milestones above are grouped by theme. This is the linear sequence to actually build them in, dependency-respecting. Each step is small enough to finish and verify before the next begins.

**Stage 1 — Colour becomes checkable** *(gates everything in stage 2)* · **done 2026-08-22**

| # | step | note |
| --- | --- | --- |
| 1 | ✅ ADR 0007 — colour is checked, not chosen | [docs/decisions/0007-colour-is-checked-not-chosen.md](../decisions/0007-colour-is-checked-not-chosen.md) |
| 2 | ✅ `contrast-sufficient` check + planted bad-palette fixture | Found a real hex-vs-rgb() parser bug on the first end-to-end run; fixtures/ir/bad-contrast.json |
| 3 | ✅ Colourblind-distance check for categorical palettes | Found a real defect in the chart preset's own SERIES_COLOURS (teal vs green) |
| 4 | ✅ Theme variants as data: `dark` (unchanged), `light`, `print` | fixtures/ir/theme-light.json, fixtures/ir/theme-print.json |
| 5 | ✅ Generated palette reference with `--check` + tests | docs/design/PALETTE.generated.md; plus a `themes` CLI/MCP command |

**Stage 2 — The export layer** *(needs stage 1; nothing here is architecturally risky)* · **done 2026-08-22**

| # | step | note |
| --- | --- | --- |
| 6 | ✅ ADR 0008 — the deliverable, not the drawing | [docs/decisions/0008-the-deliverable-not-the-drawing.md](../decisions/0008-the-deliverable-not-the-drawing.md) |
| 7 | ✅ Per-element `<title>`/`<desc>` metadata | render/svg.ts |
| 8 | ✅ Structured SVG output — groups, stable ids, layers | pr-boxes/pr-connectors/pr-text |
| 9 | ✅ Font embedding (WOFF2 data URI) and text-to-outline mode | Bundled Inter under assets/fonts/; opentype.js |
| 10 | ✅ `check:fonts-travel` | Found resvg does not support @font-face at all; embed verified via fresh Chromium page instead |
| 11 | ✅ PDF output via Chromium `page.pdf()` + physical sizing (mm, presets) | --pdf --pdfSize on the render command |
| 12 | ✅ Extend `check:independent` to PDF | First version fooled by a clip-only `re`; fixed, pinned as a regression test |

**Stage 3 — Cheap expressive range** *(widest capability gain per unit of risk; accretes no placement code)*

| # | step | note |
| --- | --- | --- |
| 13 | ✅ Arrowhead vocabulary (open, closed, diamond, circle, crow's foot, half) + line-style roles | Explicit paths, never `<marker>` |
| 14 | ✅ Non-rect shapes — circle, ellipse, diamond, hexagon, stadium (rounded polygon deferred) | Same bbox as a rect, so all six checks keep working; src/geometry/shapes.ts |
| 15 | ✅ `label-within-shape` check via `containsPoint` + planted fixture | Fails where `text-fits-box` passes; fixtures/ir/label-overflows-shape.json |
| 16 | ✅ Rotated text + oriented-box arithmetic | Measure unrotated, emit with transform, derive the box exactly; src/geometry/rotate.ts |
| 17 | ✅ Symbol library — reusable leaf primitives with declared bbox | modules/symbols_electrical.py, extracted from circuit; e2e tests unmodified and still green |
| 18 | ✅ Generated shape/arrowhead reference with `--check` | docs/design/GEOMETRY.generated.md; inscribed-area fractions computed via real containsPoint samples |
| 19 | ✅ Draft ADR 0009 — termination for translation repair | Lexicographic potential (n_violations, max_magnitude, total_magnitude) + per-node displacement budget; proven terminating |

**Stage 4 — Module repair** *(fully independent — can be pulled earlier or run in parallel)*

| # | step | note |
| --- | --- | --- |
| 20 | ✅ Module protocol: declared adjustable parameter surface with bounds | ModuleParameter type; parameters[] in ModuleOutput; parameterOverrides in ModuleInput |
| 21 | ✅ `runModule` re-invocation with amended parameters | RunModuleOptions.input.parameterOverrides passed through to module stdin |
| 22 | ✅ Module repair planner + budget, monotone and bounded | src/modules/repair.ts; lexicographic score (failures, magnitude); per-parameter budget |
| 23 | ✅ Adopt in three modules as proof — `topology`, `piechart`, `genomic` | topology: pad, row_gap, col_gap (30-100, 50-120, 16-60); tests verify parameter declaration and override |
| 24 | ✅ Roll out to the remaining eight | piechart: pad, legend_width, legend_row_height; genomic: left_margin, right_margin, row_height |

**Stage 5 — Scales and data** *(step 26 needs rotated text from step 16)*

| # | step | note |
| --- | --- | --- |
| 25 | ◐ Scale abstraction — linear, log, band, time + tick policy | src/scales.ts implements it correctly, but nothing outside dimension/annotation.ts and chart/data-binding.ts imports it, and both of those are themselves unreachable (see 27, 29) — see the 2026-08-24 roadmap entry |
| 26 | ✅ `tick-labels-do-not-collide` check + repair by rotating/thinning ticks | Check implemented in checks.ts and wired into `runChecks`, so it runs on every real figure; repair itself deferred to chart integration (step 27), which has not landed |
| 27 | ◐ Data binding for `chart` — dataset + encodings, derived axes and legend | src/presets/chart/data-binding.ts exists and is tested, but the chart preset does not call `bindData` — a chart spec still takes pre-computed values, so A6 ("the agent never does scale arithmetic") does not hold yet |
| 28 | ✗ Math typesetting — MathJax SVG output as a measured group | Removed 2026-08-29. The mock guessed its advance width, which is the defect this project exists to refuse, and Unicode subscripts, Greek and the degree sign already measure correctly through the browser mirror. See the ROADMAP entry for M4. |
| 29 | ◐ Units, figure scale (1:50) and dimension annotation | src/dimension/annotation.ts is implemented and tested but no preset or CLI path reaches it |

**Stage 6 — Constraints and translation repair** *(the deep one; do not start before 19 holds)*

| # | step | note |
| --- | --- | --- |
| 30 | ✅ Land ADR 0009 | Status changed from Draft to Accepted; termination proof reviewed and sound |
| 31 | ✅ Constraint vocabulary in the IR — `align`, `distribute`, `keepClear`, `sameSize`, `anchor` | src/constraints/types.ts; `FigureSpec.layoutConstraints` (2026-08-24) makes it authorable and `constraints-satisfied` (step 33) makes it checked — reachable from a real spec |
| 32 | ◐ Placement layer owns positions as a solution, not a final answer | src/layout/solver.ts implements `PlacementSolution`, `detectViolations`, `adjustPositions`; only imported by its own tests and by layout/repair.ts, which is itself unreachable (step 34) |
| 33 | ✅ `constraints-satisfied` check | Added to CheckId type and wired into `runChecks` (2026-08-24). Was previously a hardcoded-empty-array check that could only ever report not-applicable or an unconditional pass — vacuous by the project's own house rule. Now reads `figure.layoutConstraints`, calls `isConstraintSatisfied` per constraint, and fails naming the violated ones. Planted-defect fixture: fixtures/ir/constraint-violation.json |
| 34 | ◐ Translation repair edits, bounded by the budget | src/layout/repair.ts implements `repairTranslations` with the lexicographic potential descent and per-element budgets ADR 0009 specifies, but nothing in the check-repair loop (repair.ts at the project root, distinct from this file) calls it — a failed `constraints-satisfied` reports "no repair strategy for this check" today, same as before this step was marked done |
| 35 | ✅ Curves and arbitrary paths in the IR | src/geometry/paths.ts; PathCommand types (M/L/C/Q/A/Z) and adaptive `flattenPath`. Reached the IR through `ConnectorCurve` (decision 0010), not as a path primitive |
| 36 | ◐ Edge labels, self-loops, spline routing | Spline routing and self-loops ship in src/layout/connectors.ts. **Edge labels do not.** The first pass at this step landed a src/layout/routing.ts that nothing ever called — see the 2026-08-23 roadmap entry |
| 37 | ◐ Grouping, nesting, container transforms | src/layout/grouping.ts implements `Transform`, `applyTransform`, `transformToSvg`, `groupBounds`, `flattenGroups`; only its own test file imports it — no spec can declare a group |

### Parallelism

Stage 4 touches only `src/modules/` and the Python modules — no overlap with stages 1–3, which touch `theme.ts`, `checks.ts` and `render/svg.ts`. It is the natural candidate to run alongside the main line rather than after it.

Step 19 is the other parallel item: draft it during stage 3 so stage 6 is not gated on a blank page.

### Stop conditions

- If step 2's planted fixture cannot be made to fail, the check is vacuous — fix the check, not the fixture.
- If step 10 shows text vanishing under `loadSystemFonts: false`, stop and fix the embedding before building PDF on top of it.
- If step 30's termination argument does not hold, **do not build 34 anyway**. Ship bounded best-effort with the residual reported in the manifest, and say so.
