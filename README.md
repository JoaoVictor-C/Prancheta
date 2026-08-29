# Prancheta

*Prancheta* — Portuguese for a drafting board: the flat surface a draftsman pins paper to, with a parallel rule and set squares, to draw something that has to be *correct*, not merely pretty.

## What this is

A toolkit that makes a coding agent competent at producing **complex visual representations**: schematics, technical figures, diagrams, mind maps, maps, annotated illustrations. Images first; animation later.

It renders a figure specification to SVG and PNG, **measures what it drew**, reports every geometric defect it found, and repairs what it can — emitting a manifest that says exactly what was drawn, what was changed, and what could not be fixed.

## The problem

An agent asked for a figure today does one of three things, and all three fail differently:

1. **Calls an image model.** Diffusion models draw plausible-looking pixels, not correct structure. Labels come out garbled, arrows point the wrong way, counts are wrong. Fine for illustration, disqualifying for a schematic.
2. **Emits Mermaid.** Safe, renders everywhere, and collapses into the same box-and-arrow flowchart regardless of what was asked. Anything that isn't a graph — a cross-section, an annotated timeline, a map with callouts, a figure with a real coordinate system — has nowhere to go.
3. **Writes raw SVG by hand.** Maximum expressive range, no layout engine. The agent is doing arithmetic on coordinates in its head and cannot see the result: text overflows its box, labels collide, arrows cross shapes.

The common failure is not artistic. It is that **the agent never looks at what it drew**, and has no vocabulary between "flowchart" and "raw coordinates."

## The bet

Correct figures come from **code, not pixels**, plus a **render–inspect–repair loop** that closes on an actual rasterized image, plus a **repertoire** of figure kinds broader than the graph.

## Gallery

Three generator experiments from [experiments/generators](experiments/generators), rendered through the same pipeline as every other figure here.

|  |  |
|---|---|
| ![Chladni plate nodal patterns](docs/gallery/chladni.png) | ![Logistic map and Mandelbrot conjugacy](docs/gallery/conjugacy.png) |
| Four vibration modes of a square plate — sand settling along the nodal curves of `cos(nπx)cos(mπy) − cos(mπx)cos(nπy)`. | The logistic map's bifurcation cascade and the Mandelbrot set's real axis, shown as the same dynamical system in two coordinates. |
| ![The argument principle as a direction field](docs/gallery/argument.png) | ![How an agent uses Prancheta](docs/gallery/how-the-agent-uses-prancheta.png) |
| The phase field of `(z²−1)/(z²+1)`: 6,000 strokes each **turned to** `arg f` and lit tail-to-head, with three closed walks whose accumulated argument lands on `+2π`, `−2π` and `0`. Rotation here is the data, not decoration — the plate could not have been drawn before blocks could turn. | The pipeline drawing itself: what an agent does (1–5) and what runs inside (6–15), with the two refusal paths in orange. Wrapped into a square by ELK rather than laid out as one 4004px row — the spec is [beside it](docs/gallery/how-the-agent-uses-prancheta.json). |

## Install

Developed and tested on **Node 25**. It runs the TypeScript directly — there is no build step.

```bash
npm install && npx playwright install chromium
```

Python is optional, and only for the [figure modules](modules/README.md). Each module declares its own dependencies; several need none.

## Quick start

```bash
npm run render fixtures/labelled-blocks.json
```

Writes `out/labelled-blocks.svg`, `.png` and `.manifest.json`, and prints one line per check. **Exit code is non-zero if a check failed**, so it works in a pipeline.

To see the repair loop work, render a figure whose sizes are wrong on purpose — first as authored, then repaired:

```bash
npm run render fixtures/broken-boxes.json -- --no-repair -o out/authored
```

```bash
npm run render fixtures/broken-boxes.json -- -o out/repaired
```

The second run prints what it changed and why, and the manifest records every edit. **Your spec is never modified**; repairs are applied to a copy, and `render()` returns the `effectiveSpec` that was actually drawn.

## How it works

```
spec → HTML mirror → Chromium lays out → measure boxes and text lines
     → checks → [repair → lay out again] → SVG → rasterise → manifest
```

**The browser is the layout oracle.** Text is measured in the same engine that will draw it — per character, grouped into lines, with the baseline found from a zero-height inline-block probe rather than guessed from font metrics. The HTML mirror exists only for measurement and is never exported.

That only holds while *the thing measured is the thing drawn*, which is why the mirror carries no effects, and why a whitespace bug that made a label measure narrower than it rendered was treated as a correctness failure rather than a cosmetic one.

**The PNG is rasterised from the exported SVG**, not from the mirror. If the SVG is wrong — a bad baseline, a missing glyph, an unsupported construct — the PNG shows it. Rasterising the mirror would prove nothing about the artefact anyone actually receives.

## What gets checked

Six checks, deterministic and model-free, in [src/checks.ts](src/checks.ts). They answer *is this figure malformed*, not *is this figure right*.

| check | what it asks |
| --- | --- |
| `text-fits-box` | Does every line of a label sit inside its block's content box? |
| `text-clear-of-other-boxes` | Does a label overlap a block that is not its own? |
| `boxes-do-not-overlap` | Do two boxes partially overlap? (Nesting is fine; partial overlap never is.) |
| `connector-clear-of-boxes` | Does a connector pass through a box it does not join? |
| `content-within-canvas` | Is everything inside the canvas? |
| `effect-within-canvas` | Does an effect's ink stay on the canvas? |

Each reports `pass`, `fail`, or **`not-applicable`** — a real third state, never a polite pass. A check that examined zero elements has verified nothing, and reporting that as a pass reads as coverage.

Failures carry structured overflow numbers, not just prose, because the repair engine has to act on them.

## Constraint toggles

Three of the refusals above block whole genres — a Venn diagram *is* partial overlap, a callout into a dense field *is* a line crossing boxes it does not join. Those three, and only those three, can be stood down per figure via `canvas.constraints`:

| toggle | stands down | reach for it when |
| --- | --- | --- |
| `allowOverlap` | `boxes-do-not-overlap` | Venn and Euler diagrams, circle packings, stacked annotations |
| `allowConnectorCrossing` | `connector-clear-of-boxes` | leader lines into a dense field, wiring that has to cross |
| `allowCurvedConnectors` | nothing — it *permits* `Connector.curve` | flowcharts, mind maps, org charts |

```json
{ "canvas": { "constraints": { "allowOverlap": true } } }
```

All default to `false`, so a spec that says nothing is checked exactly as it was before these existed.

**A relaxed check reports `not-applicable`, never `pass`** — and names the toggle that excused it. A pass claims the figure was examined and found sound; if a stood-down check said `pass`, a figure whose boxes genuinely do not collide and one that simply asked not to be looked at would produce identical manifests.

Curves come in three kinds — `arc` (bows by a fraction of its own chord, so it works with auto-routed endpoints), `bezier` (explicit control points, in scene coordinates), and `spline` (rounds a route's corners by `radius` and leaves its straight runs alone, which is what a graph edge needs). **A curve is checked as it is drawn:** it is flattened into the same polyline `connector-clear-of-boxes` walks, so it cannot bow through a box the check just cleared. Flattening is adaptive to a stated 0.05px bound — a tenth of the half-pixel every check tolerates — so a curve can never pass or fail on the strength of how it was sampled rather than where it goes.

A connector from a block back to itself is a **self-transition**, routed out of the top edge and back rather than curved, so a loop needs no toggle to exist.

See [docs/CONSTRAINTS.md](docs/CONSTRAINTS.md) for how to use them and [ADR 0010](docs/decisions/0010-constraint-toggles.md) for why these three and not the others.

## Repair

A verifier that can only *detect* is worth little. The repair loop grows a box that its label overflows, flips `wrap` when a node has hit its growth budget, and grows canvas padding when an effect's halo is clipped.

Two properties make it trustworthy, and both are structural rather than hoped for:

- **Monotone.** Every edit strictly increases one bounded quantity, or flips `wrap` from `none` to `normal`, which can happen at most once per node. A cycle would require some quantity to return to a previous value, so the loop cannot oscillate.
- **Bounded.** Growth is capped at a multiple of the node's *original* measured size. A node needing more is reported as `unrepaired` with the reason, rather than inflated without limit — a box four times the size the author asked for is not a repair, it is a different figure.

## Choosing before drawing

The failure this project exists to prevent is reaching for a flowchart because a flowchart is available. Ask first:

```bash
node src/cli.ts select --structure scene --idiom annotated
```

It answers with a preset, a composition of two, or *no preset fits — author raw IR*, and names the rules that decided. [docs/selection/SELECTION.md](docs/selection/SELECTION.md) is the hand-written reasoning and the part worth reading; [docs/selection/RULES.generated.md](docs/selection/RULES.generated.md) is the generated rule reference.

## The repertoire

**Five presets**, drawn with the core's own IR — see [src/presets](src/presets):

| preset | what it is |
| --- | --- |
| [`labelled-blocks`](src/presets/labelled-blocks/PRESET.md) | Stacked labelled boxes; the plain case. |
| [`graph`](src/presets/graph/PRESET.md) | Nodes and edges, skeleton laid out by ELK. |
| [`mindmap`](src/presets/mindmap/PRESET.md) | A single-rooted tree radiating outward. |
| [`annotated-figure`](src/presets/annotated-figure/PRESET.md) | A shape or scene with callouts on leader lines. |
| [`chart`](src/presets/chart/PRESET.md) | Bar, line and scatter: values with a scale, not a graph. |

**Eleven figure modules** (`node src/cli.ts modules`), in Python, for geometry the core cannot compute — circuits, crystal unit cells, dendrograms, gene maps, real maps, molecules, pie charts, function plots, reaction schemes, Skew-T soundings, protein topology. The index is [modules/README.md](modules/README.md).

The module contract is that **the module declares semantics and the core measures geometry**. A module says what it drew and what each element means; it may not certify that what it drew is correct. Nobody certifies their own work.

## Colour, and leaving the tool

Colour is checked, not chosen. `contrast-sufficient` computes real WCAG contrast for every label against what it actually sits on; `categorical-colours-distinguishable` simulates deuteranopia and protanopia over any blocks a spec tags with a shared `categoryGroup`. Three theme variants — `dark` (default, unchanged), `light`, `print` — via `canvas.theme` in a spec, or `node src/cli.ts themes` to see every role's real contrast ratio.

```bash
node src/cli.ts render spec.json --fontEmbed outline --pdf --pdfSize a4
```

A figure can leave the tool as a deliverable, not just a correct drawing: every element carries a `<title>`/`<desc>` built from data the manifest already has, and sits in its own `<g>`. `--fontEmbed embed` inlines Prancheta's own bundled font (Inter, SIL OFL) as a `@font-face`; `--fontEmbed outline` converts every glyph to a filled path with zero runtime font dependency, verified against resvg with no system fonts available at all — the mode to reach for when the target tool is unknown. `--pdf` writes real vector PDF, sized to the figure by default or to a physical page (`a4`, `letter`, `<w>x<h>mm`).

## Depth cues, if they carry information

Blocks and connectors can take named effects — `raised-2`, `recede`, `emphasis`, `seated`, `printed` — for cases where layering, focus or contact is real information rather than polish.

```bash
node src/cli.ts effects
```

That lists every effect **and how far past its own edges it puts ink**, because that is what has to fit on the canvas.

An effect never changes layout: it is resolved after measurement, so the geometry checked is the geometry drawn. A halo clipped by the canvas edge is a reported defect that the repair loop fixes by growing the padding, not by moving anything. Everything desugars to SVG 1.1 filter primitives, and a test rasterises each effect under resvg with and without its filter to prove it is not being silently ignored.

[docs/effects/EFFECTS.md](docs/effects/EFFECTS.md) is the narrative; [docs/effects/REFERENCE.generated.md](docs/effects/REFERENCE.generated.md) is the generated parameter and bleed reference.

## Diffing two states

```bash
node src/cli.ts diff fixtures/pipeline-before.json fixtures/pipeline-after.json
```

Lays out both and reports named deltas over stably identified elements — appeared, disappeared, moved, resized, restyled, retexted. This is the identity groundwork animation will need.

## Commands

| command | what it does |
| --- | --- |
| `render <spec>` | Render to SVG, PNG and a manifest. `--out` `--scale` `--repair` `--maxPasses` `--maxScale` |
| `select` | Rank presets for content predicates. `--structure` `--idiom` |
| `presets` | List the repertoire and whether each is implemented. |
| `rules` | Print the selection rule table. |
| `effects` | List every named effect, its chain, and its bleed. |
| `modules` | List the figure modules, what each needs installed, and a command that runs it. |
| `module <command>` | Run a figure module and verify what it drew. `--args` `--width` `--height` `--out` |
| `diff <before> <after>` | Report what changed between two states of a figure. |

Run `node src/cli.ts <command> --help` for the full options of any one.

## From an agent

```bash
npm run mcp
```

Speaks MCP over stdio. Every command above appears as a tool, **generated from the same table the CLI uses**, and the knowledge tree is served as `prancheta://` resources: the selection narrative, the rule reference, the effects narrative, the module index, and one resource for every preset and every module.

A hand-written second binding drifts — a flag gets added to the CLI, the MCP tool keeps the old shape, and nobody notices because nothing compares them. Here a drift is a type error, and a test asserts the two surfaces enumerate the same commands.

`.claude/skills/prancheta/SKILL.md` and `AGENTS.md` are *generated views* of the same knowledge (`npm run gen:views`, enforced by `npm run check:views`).

## Development

| script | what it does |
| --- | --- |
| `npm test` | The full suite. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run check:independent` | Re-render exported SVGs with resvg — a Rust engine, no browser — to confirm they survive outside the engine that made them. |
| `npm run check:docs` | Both staleness checks below. |
| `npm run check:views` | Fail if `AGENTS.md` or the skill is stale. |
| `npm run check:refs` | Fail if either generated reference is stale. |
| `npm run gen:views` / `gen:rules` / `gen:effects` | Regenerate them. |

Generated files are generated for a reason: a hand-written table of effect bleed figures or selection rules would be wrong within a release and nothing would notice. What each thing is *for* stays hand-written, because that is the part a generator cannot produce.

## Decisions

- **Language: TypeScript** — Node mandatory, Python optional. [0001-language](docs/decisions/0001-language.md)
- **Shape: one repo, one version** — typed library (contract) → CLI → MCP adapter; the Claude skill is a generated view. [0002-deliverable-shape](docs/decisions/0002-deliverable-shape.md)
- **Repairs are edits, not mutations** — a monotone, terminating loop. [0003-repairs-are-edits](docs/decisions/0003-repairs-are-edits.md)
- **Selection is a rule table with a hand-written narrative** — CI tests the decision procedure, not the model. [0004-selection-core](docs/decisions/0004-selection-core.md)
- **Modules declare semantics; the core measures geometry** — nobody certifies their own work. [0005-module-protocol](docs/decisions/0005-module-protocol.md)
- **Effects are checked geometry** — a shadow is ink, its reach is computed, and a clipped halo is a defect. [0006-effects-are-checked-geometry](docs/decisions/0006-effects-are-checked-geometry.md)
- **Three constraints may be stood down, and say so** — a relaxed check reports not-applicable, never pass. [0010-constraint-toggles](docs/decisions/0010-constraint-toggles.md)

## Further reading

- [ROADMAP.md](ROADMAP.md) — everything done and planned, in order, with what each step found. Start here.
- [docs/PLAN.md](docs/PLAN.md) — the milestones in detail, M0 to M4.
- [docs/PLAN-NEXT.md](docs/PLAN-NEXT.md) — M5 to M10, with the gap analysis against human-oriented figure tools that produced them.
- [docs/research/landscape.md](docs/research/landscape.md) — survey of existing tools, libraries, agent skills, and academic work.
- [docs/research/language-choice.md](docs/research/language-choice.md) — Python vs TypeScript, with a recommendation.
- [docs/research/candidate-modules.md](docs/research/candidate-modules.md) — the survey the module repertoire was drawn from.

## Non-goals

- Competing with design tools for human-driven editing.
- Photorealism or artistic illustration. The effects layer is schematic depth *cues*, deliberately restrained; it is not a rendering engine.
- Verifying that a figure is **true**. Every check here answers malformation, not misrepresentation: a diode drawn the right way round for a circuit where it should be reversed passes every one of them.
- Video production pipelines (animation comes after images work).
