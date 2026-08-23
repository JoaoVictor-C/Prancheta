# Decision 0001 — Implementation language

**Status:** committed · 2026-08-18
**Decision:** TypeScript. Node is the only mandatory runtime; Python is an optional, on-demand extra.
**Method:** Terza reasoning session `e2348418` — 4 iterations, 2 passes, halt on signal, final confidence 0.86.

---

## The asymmetry that decides it

Process boundaries are **cheap at the leaves and ruinous in the inner loop**.

Text measurement is an inner-loop operation: every candidate placement of every text run needs a true bounding box, and a true bounding box requires running a render engine. Only the browser measures text in the same engine that produces the final pixels.

Maps, statistical charts and manim animation are the opposite shape: one invocation, seconds of work, a file comes back.

A TypeScript core calling Python at the leaves crosses a boundary rarely. A Python core calling the browser crosses it thousands of times per figure. Flipping the language while holding every other design element fixed moves three load-bearing elements into the hot path and improves only one — so this is optimal under coordinated moves, not just single-variable ones.

## Architecture that follows

- **Core (TS):** language-neutral JSON figure IR, deterministic box-and-flow layout with relative-positioning verbs, render–inspect–repair loop.
- **Layout is a box model, not a numeric optimiser.** Three reasons: repair edits need consequences the loop can predict before applying them; the browser already implements flow and wrapping, so the hardest part is borrowed; and the manim vocabulary the project is modelled on (`next_to`, `shift`, `align_to`, `arrange`) *is* a box model. **kiwi.js** (Cassowary) is a bounded escape hatch for edge routing, non-overlapping label placement, and radial arrangements.
- **Mandatory output rule:** the browser *computes* layout; exported figures are pure SVG with absolute coordinates and one `<text>` per wrapped line. **`foreignObject` is forbidden** — resvg does not render it, librsvg/Inkscape/Illustrator are unreliable with it, and figures would appear blank in exactly the tools a user opens.
- **Graphs:** delegate skeleton layout to ELK or Graphviz, ingest their geometry as coordinates, then layer owned annotation geometry on top. Real figures are hybrid; the core must extend a third-party layout, not choose between owning and delegating.
- **Python figure modules, not renderer calls:** a module takes a figure spec as JSON, does its geometry in Shapely/pyproj/matplotlib/manim, and returns SVG or PNG **plus a manifest of placed elements with bounding boxes** so the verifier can still check it. Map label placement is a genuine Python-native inner loop, not a leaf; and a manim scene authored *inside* a Python module avoids generating Python source from TypeScript.

## On near-term vs long-term

The tension dissolves rather than resolves. Near term, the browser is the only engine that measures text where it will be drawn — the image phase's binding constraint. Long term, the durable asset is the figure IR and the verification loop, both language-neutral by construction: the language is reversible at the boundary, the IR is not. Both horizons point the same way, and manim is preserved as a module rather than traded away.

## Costs accepted deliberately

1. **Install surface is cost-neutral at best.** Node + bundled Chromium is newly required on a machine where Python is already present and working.
2. **Maps are the least integrated figure class in v1**, sitting behind a subprocess boundary. This matters because maps were named explicitly in the brief.
3. **The temporal IR is untested.** States + transitions, with pacing and camera module-side, is a design, not a result.

## Supports that were resized — do not lean on them

- **Penrose being TypeScript is inspiration, not a dependency.** `@penrose/core` is the runtime for a three-language authoring system tuned to mathematical notation, not a general layout library you hand a list of constraints.
- **Box-model repair is predictable, not local.** Widening one box does shift its siblings — but exactly which ones is computable in advance, and predictability is the property the repair loop actually needs.

## Early experiment (week two, not month six)

Author one figure as **two states**, render both statically, and check whether the elementwise diff — appeared / disappeared / moved / restyled — is expressible. If it is not, the IR is under-specified and we learn it immediately. This makes the animation risk cheap to test; it does not make it resolved.

## What the verdict rests on

Four uncontested supports: text measurement in the rendering engine · Playwright for the see-your-own-output loop · in-process ELK/Graphviz geometry ingest · HTML/SVG as the native delivery format.
