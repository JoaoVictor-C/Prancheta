# TODO

What is open, and what was deliberately refused. What *landed* is in [ROADMAP.md](ROADMAP.md); the plan in progress is in [docs/plans/](docs/plans/README.md). An item that lands is deleted from here in the same change (the procedure in [CONTRIBUTING.md](CONTRIBUTING.md#the-procedure-for-a-new-preset-or-feature)).

Last pruned 2026-10-03.

## Next

- [ ] **PLAN-PHYSICS P3** — six function-graph worked examples: s×t, v×t and a×t on one time axis; two vehicles meeting; work as the area under F×d; impulse under F×t; Eₖ, Eₚ and the total against position; g against distance. Fixtures only, no new code. [docs/plans/PLAN-PHYSICS.md](docs/plans/PLAN-PHYSICS.md)
- [ ] **A core `GridAxis.schematic` field**, to replace the declaration mark the schematic axes of ADR 0066 use today.
- [ ] **The `biologia` list's solution figure s1-2 fails `label-nearest-its-place`**, on master too. Found 2026-10-03, before any of the mechanics work.
- [ ] **ENEM day 2 is 66 % covered** ([docs/research/AUDIT-ENEM.md](docs/research/AUDIT-ENEM.md)). The partial rows are the ranked list of what to build next; re-score after each preset lands.

## The core

- [ ] **`tick-labels-do-not-collide` still identifies ticks by id substring.** `id.startsWith("tick-") || id.includes("-tick-")` (src/checks.ts), with a comment calling it "temporary heuristic until metadata exists". The heuristic now carries real weight: any block whose id contains `-tick-` is treated as an axis tick. The missing metadata is a one-field change.

- [ ] **Four files are still unreachable from any spec, preset or CLI path.** They are `presets/chart/data-binding.ts` (with `src/scales.ts`, which only it imports), `layout/solver.ts`, `layout/repair.ts` and `layout/grouping.ts`, each imported only by its own tests.

  `layout/repair.ts` has a visible consequence: a failed `constraints-satisfied` reports "no repair strategy". It is **not a wiring job**, for three reasons:
  - It works on a parallel `PlacementSolution` world and needs a POSITION edit kind.
  - A position edit does not satisfy the existing loop's termination argument. ADR 0009 proves termination a different way, so the two loops would carry two proofs.
  - Moving a frame-positioned element silently breaks the coordinate it claims (ADR 0019).

  Either it gets its own ADR, or it is left as it is and that is said.

- [ ] **Contrast thresholds ignore size.** WCAG lets large text pass at 3:1; `contrast-sufficient` applies 4.5:1 to everything. The change makes a check more permissive, so it wants its own ADR.
- [ ] **Text over a colour field cannot pass.** The honest fix is a trade, not a fourth toggle: stand down the collision check and force contrast to run against the box the text sits over.
- [ ] **Composition is the missing design system.** There is `canvas.padding` and nothing else: no margins, no modular scale, no title-block rhythm.
- [ ] **Arbitrary block paths.** `flattenPath` already ships and could give `shape: "path"` containment, but it trades away the exact-containment guarantee every shape keeps. Needs its own ADR.
- [ ] **`star` (27.6 % of its box) and `cross` (55.2 %) are markers, not containers.** A symbol sheet should caption them rather than label them inside. Nothing to fix; worth not forgetting.

## The agent-facing surface

- [ ] **A module's missing dependency should be a named refusal.** `MODULES` already declares each module's `needs`; nothing says it when `module python --args …` fails on an absent package. This is the same defect ADR 0018 fixed for documents, one surface over.
- [ ] **Over MCP, `render` returns checks but no figure and no path.** An MCP-only agent is told its figure has a defect and given no way to look at it. Move the artefact write out of `cli.ts` into a helper both bindings call, so MCP returns paths. It revises a documented decision, so it needs its own ADR.
- [ ] **A validator can drift from its expander.** Stated in ADR 0018 rather than solved; revisit only if a real drift is observed.

## Animation

Shipped through ADRs [0012](docs/decisions/0012-animation-m11-scope.md)–[0017](docs/decisions/0017-animation-m15-routes.md). Open, in the order the evidence favours:

- [ ] **Multi-label diff.** A box that slides *and* recolours is `restyled` and hard-cuts. The fix changes `FigureDiff`'s public shape.
- [ ] **Easing a staggered figure.** The design is in ADR 0015 and has not been verified: ease the global clock, and give each element the matching sub-arc of the same Bezier.
- [ ] **Unowned text is not a participant** in the motion check. A figure title has never been checked against anything moving.
- [ ] **Effects put ink outside the checked rect.** The motion check reasons about the rectangles, not about pixels.
- [ ] **A sequence launches one browser per state.** This is a measured cost, not an assumed one; worth revisiting for sequences of a dozen or more states.
- [ ] **The identity-continuity bound is heuristic at its edges.** A slideshow that keeps one persistent header still passes.

## Generators

- [ ] **Nothing was migrated to `experiments/generators/lib.mjs`.** The six sound generators would be cheap to move; the six legacy ones would not be.
- [ ] **`navguide` does not belong in the poster series.** It is a node-and-connector diagram, which a core preset would serve better.

## Refused, with reasons (not backlog)

- **Shape morphing, a camera, video export** (ADR 0016). No check exists for any of them; for a camera none can, since legibility under zoom is a research problem.
- **Skew, flip, tile and scale transforms; more effects; a `poster` preset; a selection table for style packs.** Each multiplies what every check must reason about, or arbitrates taste. [ADR 0003-effects-extension](docs/decisions/0003-effects-extension.md) planned some of these and was overtaken.
- **Music notation, astronomical star charts, PCB layout, knitting charts, knot diagrams** ([docs/research/candidate-modules.md](docs/research/candidate-modules.md)). Geographic routing would fold into `modules/map`. Trusses stay set aside; free-body diagrams with real force computation, set aside with them, are now the `mechanics` preset (ADRs 0073, 0074); logic gates are `logic-circuit` (ADR 0057).
- **A `generators` command.** Nobody invokes a generator at runtime, so a repertoire table for them would have nothing to do.

## Process reminder

Every module and preset so far found real bugs in its own first draft *because* it declared what it drew and let the core's measurement disagree. Build the next one the same way: declare only what is actually computed, let the checks run before assuming the first render is right, and then **look at the PNG**, since several defects have passed every check.
