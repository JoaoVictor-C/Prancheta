# circuit — a figure module in Python

A single-loop series circuit — a battery and N components arranged around a rectangle — drawn with the symbol vocabulary an electrical engineer actually expects. See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #4.

## Why this exists outside the core

A circuit is a graph, but pretending a labelled box is a resistor is the exact "flowchart because a flowchart is available" failure the [selection core](../../docs/selection/SELECTION.md) exists to refuse — one level down, inside a single figure class instead of across the repertoire. [graph](../../src/presets/graph/PRESET.md)'s ELK-routed rectangles have no resistor zigzag, no correctly-oriented diode, no capacitor plates.

This module depends on no schematic-CAD library. Every coordinate on every symbol and every wire is computed here or in [`../symbols_electrical.py`](../symbols_electrical.py) — a shared leaf-symbol library, not a third-party layout engine's internal object model — which keeps every `declaredBox` a claim about numbers this module actually owns, the same discipline every other module in this repertoire follows.

**Symbol geometry moved to `modules/symbols_electrical.py` (M5 stage 3, step 17).** The `draw_resistor`/`draw_capacitor`/`draw_inductor`/`draw_switch`/`draw_diode`/`draw_battery` functions this section used to describe as this module's own were, in fact, generic leaf primitives with no dependency on circuit's grid layout — only on a centre point. They now live in that shared file so a future electrical-schematic module can import the same measured-not-guessed boxes rather than rediscovering them, and this file keeps only what is genuinely circuit's own: the single-loop grid, the wire routing, and the `NAMED` presets. The extraction changed no geometry — `tests/module-circuit-e2e.test.ts` re-verifies the identical claims against a real Chromium run, unmodified, and still passes.

## What it declares, and what it does not

Every component symbol is a `feature` with a `declaredBox`; every wire segment is a `decoration`, declared individually rather than as one path, so a routing bug in any one segment is caught rather than averaged away inside a bigger box. Component and battery labels are `label`s with no declared box, the usual font-metrics reason.

## What building it found

**Every symmetric-looking symbol was checked, and two of them weren't.** A resistor's zigzag and a capacitor's plates are genuinely symmetric around their centre — declaring `height/2` above and below the placement line matched what was measured on the first try. An inductor's bumps and a switch's open lever are not: the bumps rise only *above* centre, the lever's line rises further above centre than the switch's terminal circles extend below it. The first version declared every symbol as symmetric anyway, and `module-geometry-agrees` failed on both — not by a fudge-factor amount, but in a way a standalone probe (four bare `<path>`/`<circle>`/`<line>` elements, the exact markup each symbol draws, measured directly) resolved in one pass rather than by guessing again. The fix generalised `draw_*`'s return shape to `(svg, width, height, y_offset)`, where `y_offset` is how far a symbol's *true* vertical centre sits from the line it's placed on — `0.0` for the genuinely symmetric symbols, a measured non-zero value for the two that aren't.

**The same stroke-width padding mistake `molecule` already made once.** The battery symbol's declared height included `+4` for its thicker second line's stroke width. A bare `<line>`'s measured bbox has no stroke padding — `getBoundingClientRect` returns the geometric extent of the path data, the exact lesson [modules/molecule/MODULE.md](../molecule/MODULE.md) recorded from its own first run — and the same probe that found the inductor/switch bugs confirmed it again here rather than needing a fresh investigation.

## Running it

```bash
node src/cli.ts module python --args "modules/circuit/render.py,--name=rlc_series"
node src/cli.ts module python --args "modules/circuit/render.py,--components=resistor:R1;switch:S1;diode:D1,--battery=5V"
node src/cli.ts module python --args "modules/circuit/render.py,--misdeclare"
```

Named shortcuts: `rc_lowpass`, `led_circuit`, `rlc_series`, `switched_lamp` (`--name=<key>`). `--components=` takes any number of `type:value` entries — component types are `resistor`, `capacitor`, `inductor`, `switch`, `diode`. **`;` separates components, `:` separates a component's type from its label — not commas**, the same delimiter trap [modules/dendrogram/MODULE.md](../dendrogram/MODULE.md) documents for the identical reason (a single `--args "a,b,c"` invocation comma-joins everything at the CLI layer). **Fixed at the source**: `--args` is now repeatable, and each occurrence's value is taken verbatim — see dendrogram's note for the full explanation; the `;`/`:` convention here is unaffected either way. `--battery=` sets the source label (default `9V`).

## What is not checked, and what this doesn't attempt

**Malformation, not misrepresentation.** A diode drawn the right way round for a circuit where it should be reversed passes every check here — nothing verifies that the circuit *works*, only that what was declared was actually drawn where it was declared.

**Single-loop series only, deliberately.** This is not a general schematic router: it lays every component along one rectangular loop's top edge with the source on the left, and cannot draw a parallel branch, a ground reference, or arbitrary netlist topology. That is a real, stated scope limit — a genuine circuit auto-router (component placement plus wire routing around obstacles) is a much larger undertaking than the loop case this module covers, and the loop case is the shape of the most common request ("draw a circuit with X, Y and Z in series with a battery").
