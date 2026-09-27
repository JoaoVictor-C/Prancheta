# 0022 — Function graphs are a preset, and a figure is data

## Status

Accepted.

## The defect

The Cálculo 1 exercise sheet (`experiments/exercises/calculo1/`) needed fifteen figures, fourteen of them curves y = f(x). They were drawn by a `graph()` helper written outside the repository on top of `experiments/exercises/sheet.mjs`, and five defects reached the student through it:

- an intercept printed without its number on the axis, because the tick placer dropped a number whose spot had ink;
- a plot with no x axis, because the grid only draws the zero line when a lattice line lands exactly on zero, and `[−13, 13]` in steps of 2 never does;
- a legend set on top of axes and axis numbers, because it took a hand-typed coordinate;
- three secants and a parabola told apart only by colour;
- "(2, 5)" printed beside the decimal "0,5", and labels whose coordinates were typed by hand and drifted from the text.

Every one of those is a property of the helper being **code**: each figure was a script, each label a string the author typed, and nothing downstream knew that "(2; 17/3)" was supposed to be the value of a function at 2.

## The decision

**A function graph is a preset, `function-graph`, in the core — not a figure module.** ADR 0005 sends geometry the core cannot compute to a separate process. A curve is not that: evaluating an expression, bisecting for a root and taking a symmetric difference are a few hundred lines of TypeScript, and doing them in the core means the result is ordinary IR that every existing check measures. The premise the `plot` module was built on ("the core cannot evaluate a function") stops being true here; ADR 0025 records what that does to `plot`.

**Expressions are data, parsed by a closed grammar** (`src/math/expr.ts`). One variable, `pi` and `e`, a fixed list of functions, implicit multiplication and the notation people write (`x²`, `−`, `·`, `√`). No `eval`, no `new Function`, and own-property lookups only — the first test run found that `"constructor" in FUNCTIONS` is true through the prototype. A comma is refused rather than guessed at: in pt-BR it is a decimal mark, anywhere else it separates arguments. `log` is base 10 and `ln` natural, the Brazilian school convention.

**Labels are templates, and a typed coordinate is refused.** `{coords}`, `{P}`, `{expr}`, `{slope}`, `{eq}`, `{=0.5}` are filled from computed values through one formatter (ADR 0023). A literal pair — `(2; 5)`, `(2, 5)` — in any label is a validation error naming the placeholder to use instead. "(1,2)" with no space is a decimal in brackets and passes, because `1000·(1,2)ᵗ` is the notation the semicolon rule exists to protect.

**The placer is `sheet.mjs`'s, ported.** `src/presets/function-graph/board.ts` keeps its one idea — every stroke is also recorded as segments in a coarse grid, so a label search avoids lines and not only other labels — and drops everything a function graph does not use.

**Three core changes came with it**, each small and each named:

- `GridAxis.origin` anchors the lattice at a value (the preset uses 0), and the grid draws the zero line whenever the range *contains* zero (task 3 of the sheet's list).
- `Mark.series` and `Block.names` let a figure say which ink is which curve and which label names it; `GridAxis.require` leaves a zero-ink `Mark.tick` at each number an axis promises. These feed the checks of ADR 0024.
- `text-clear-of-ink` accepts an axis number on its own opaque backing. The tick rule never drops a number: it slides along its own gridline, both sides of the axis, at most half a division, and only if nothing there is clear keeps its spot on paper. That fallback was specified deliberately, so the check that would otherwise fail it had to learn it — narrowly, for grid furniture only.

**A preset's output now goes through `parseSpec`.** Every other preset states canvas coordinates; this one states a frame, and presets were never passed through frame resolution. The first render came back with no grid and no axes. `expandFunctionGraph` validates and resolves its own output rather than changing the dispatch for five presets that never needed it.

## What was refused

**Keeping the helper and fixing its bugs.** Each defect was fixable in the script, and each fix would have been one more thing an author had to remember. The refusals that matter — typed coordinates, unnamed curves — cannot be expressed as a script's habits; they need a document the validator can read.

**A figure module in Python.** It would have put the curve on the far side of a process boundary where the core can only check what the module declares. The core can compute it; it should.

**A general expression language** (variables, user functions, piecewise conditions inside an expression). `pieces` with explicit domains covers every figure on the sheet and keeps the domain of each piece visible in the document, where the open and closed points that sit on its ends are decided.

## The cost, stated

**Text is estimated, not measured, while placing.** A preset expands before any browser exists, so the placer sizes text with a generous heuristic. It is right often enough that all fifteen figures render clean, and when it is wrong the checks say so after the render.

**"Renders the same" was measured, not asserted.** As first converted, the fourteen data figures were pixel-diffed against the helper's renders: at most 0.08% of pixels differ, and the differences are curve labels now drawn in their curve's colour, one tick number that moved (see below) and guides cut around numbers. Five figures changed afterwards, on purpose: the checks of ADR 0024 required direct curve labels the originals lacked.

## Found while building it

**The helper's own figure 2.4 failed a check and shipped.** Its manifest has `text-clear-of-ink` failing on the "6" under the axis, where the parabola crosses it steeply. Two causes: the slide limit was half a division *minus six pixels*, and clearance was tested against a 13px box while the check measures the 16px line box. With the literal half division and the real line box, the number finds a clear spot.
