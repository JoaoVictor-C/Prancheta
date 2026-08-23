# Build plan

Research is done ([landscape](research/landscape.md)) and both architecture decisions are committed ([0001](decisions/0001-language.md), [0002](decisions/0002-deliverable-shape.md)). What follows is ordered by **risk retired per day**, not by what is pleasant to build.

Three assumptions carry the project. Each milestone below exists to try to break one of them:

- **A1** — a browser can act as layout/measurement oracle and still emit clean absolute-positioned SVG.
- **A2** — a verification loop can *repair* geometry, not merely detect defects.
- **A3** — selection can be made a testable artefact rather than a hope.

---

## M0 — Walking skeleton (retires A1) · **done 2026-08-18**

> Shipped. A1 held: the browser can be the layout oracle and still yield portable SVG, confirmed by a second non-browser renderer. Findings — measured baselines, per-glyph-run font resolution, LCD-text fringing — are recorded in [the roadmap](../ROADMAP.md).


One spec, one preset, the full pipeline end to end. No repertoire, no CLI polish, no MCP.

**Pipeline:** figure spec (JSON) → layout in headless Chromium → measure every text run → emit SVG with absolute coordinates and one `<text>` per wrapped line → rasterize → write PNG + SVG + manifest.

**Preset:** `labelled-blocks` — a handful of boxes with **deliberately awful label text**: one word, one 60-character sentence, one CJK string, one string with a hard-to-break URL. This is the least glamorous preset and the most diagnostic, because text overflow is the documented #1 defect.

**Falsifiable outcome:** open the exported SVG in Inkscape or a browser. Every label sits inside its box, wrapped, at every input length. If it doesn't, A1 is wrong and the design changes before anything is built on top.

**Deliverables:** `package.json`, `tsconfig`, `src/ir/`, `src/layout/`, `src/render/`, a `prancheta render spec.json` command, and fixture-based snapshot tests.

## M1 — The manifest and the repair loop (retires A2) · **done 2026-08-19**

> Shipped. A2 held: the loop repairs rather than merely detects, and it converges — with a pass budget of 3, 5 or 8 it finishes in exactly 3 passes every time. Repairs are edits, not mutations ([decision 0003](decisions/0003-repairs-are-edits.md)); findings are in [the roadmap](../ROADMAP.md).


The manifest is what makes verification possible: for every element, its identity, role, bounding box, and what it was *supposed* to be.

**Geometric checks first** (cheap, deterministic, no model needed): text outside its container · overlapping siblings that shouldn't · connector crossing a shape it doesn't connect · content outside the canvas.

**Then repair:** each check maps to a bounded edit on the spec — grow the box, increase the gap, re-route, re-wrap. The loop reruns layout and re-checks, capped at ~3 passes.

**Falsifiable outcome:** feed M0's worst-case labels *with the box sizes wrong on purpose*. The loop must converge to a clean figure and log which checks fired and what it changed. If repairs oscillate or fight each other, the box model's predictability claim was wrong.

Semantic checks (right arrow direction, no invented entities, nothing missing) come after the geometric ones work — they need a model in the loop and are worth nothing while boxes still overflow.

## M2 — Selection core + first real repertoire (retires A3) · **done 2026-08-19**

> The selection core is built and green: two-axis vocabulary, rule table, deterministic ranking, hand-written narrative, twenty annotated fixtures ([decision 0004](decisions/0004-selection-core.md)). A3 is retired — selection is a testable artefact rather than a hope.
>
> Four presets ship with their docs and fixtures. The IR grew a scene node and connectors; ELK lays out graph skeletons from browser-measured sizes. Not done from this section: LaTeX via KaTeX — no figure in the repertoire needs maths yet, so it moves to M4-adjacent work rather than being claimed.


The hand-written selection-and-discipline document, plus enough presets for selection to be a real choice rather than a formality.

**Presets:** `labelled-blocks` (M0) · `graph` (delegated to ELK, geometry ingested, annotations layered on top — proves the hybrid path) · `annotated-figure` (callouts with leader lines onto a shape — proves the coordinate/annotation class that no competitor serves) · `mindmap` (cheap, structurally simple, immediate everyday value).

**The selection test:** a table of ~20 real request phrasings → expected preset. Run them, judge, keep the failures visible. This is the project's differentiator and gets its own suite from day one.

**Also here:** the design system — near-black ground, small saturated palette, thick uniform strokes, generous negative space, LaTeX via KaTeX. Roughly 30 lines of constants that determine whether output looks considered or looks generated.

## M3 — Host bindings · **done 2026-08-19**

> Shipped. One command table, two bindings (CLI and MCP) asserted identical by test; the knowledge tree served as MCP resources; SKILL.md and AGENTS.md generated with a staleness check. Details in [the roadmap](../ROADMAP.md).


The CLI already exists from M0. Add the MCP adapter *generated* from the same command schema, serving the knowledge tree as MCP resources. Add the build step that renders the Claude skill tree and the `AGENTS.md` digest from preset directories, plus the tests that fail on a missing doc, a dangling preset reference, or a stale generated view.

At the end of M3, Prancheta is usable from Claude Code, from any shell, and from any MCP host.

## M4 — The two hard probes · **done 2026-08-19**

> Both probes ran and both found something. The module protocol is [decision 0005](decisions/0005-module-protocol.md); the two-state diff exposed that positional edge ids were not identity. Details in [the roadmap](../ROADMAP.md).


Deliberately last, because both can force IR changes and both are cheap to run once M0–M2 exist.

**Map module.** A Python figure module: spec in, geometry in Shapely/pyproj, SVG + manifest out. Does the manifest carry enough for the verifier to check a figure whose geometry it doesn't own? Maps are the hardest module case, which is why they come before manim.

**Two-state diff.** Author one figure as two states, render both statically, diff elementwise — appeared, disappeared, moved, restyled. If the diff is expressible, the temporal IR is sound and the animation phase has a foundation. If not, the IR is under-specified, learned now rather than in month six.

---

## What comes after M4

M0-M4 are done and A1-A3 are retired. The next six milestones — colour, the export layer, cheap primitives, scales and data binding, module repair, and constraints with translation repair — are planned in detail in [PLAN-NEXT.md](PLAN-NEXT.md), together with the gap analysis against human-oriented figure tools that produced them.

---

## Not doing yet

Animation rendering · Remotion/Motion Canvas/manim integration · interactive figures · a figure editor · publishing to npm.

## Open, non-blocking

- Final rasteriser: Chromium (fidelity) vs resvg (cross-platform determinism). Decide once there are enough fixtures to compare against.
- Whether `graph` should also front Graphviz, or ELK alone is enough.
