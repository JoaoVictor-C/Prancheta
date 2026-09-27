# 0025 — function-graph absorbs the plot module's function curves

## Status

Accepted. Amends [ADR 0005](0005-module-protocol.md) for one module.

## The question

`modules/plot` (Python) drew function curves, found roots by bisection and extrema by sampling, and declared each root to lie on its curve *and* on the x axis so the core could refute the claim by measurement. `function-graph` (ADR 0022) now draws function curves in the core. Two options were on the table:

1. **Absorb**: function-graph owns function curves, roots and extrema; `plot` keeps only what the core still cannot do.
2. **Share the input format**: both accept the same JSON; function-graph for teaching figures, `plot` for the rest.

## The decision

**Absorb.** Sharing a format means two evaluators of one expression language, and they already disagreed before a line was shared: Python's `log` is natural and the Brazilian convention function-graph follows is base 10; Python accepts `**` and rejects `x²`; implicit multiplication exists in one and not the other. A shared format would have made the same document mean two things depending on who read it — the drift this project exists to catch, built in on purpose.

And the module's founding premise is gone. `modules/plot` existed because "the core cannot evaluate a function, find a root or an extremum". The core now parses the expression (`src/math/expr.ts`), finds roots by sign change and bisection and extrema by golden-section refinement (`findFeatures`), and states the same claims:

- `Mark.on` lists the series and marks a feature claims to lie on. A root claims its curve **and** `plane-axis-x`; an extremum claims its curve.
- The zero lines of a grid now carry stable ids, `<frame>-axis-x` and `<frame>-axis-y`, so an axis can be named in a claim.
- **`feature-on-its-curve`** measures every claim: the marker's centre must be within 1.5px of each named polyline, and a failure names the half that broke. It is the core counterpart of `module-feature-on-its-stroke`, measured on geometry the core laid out rather than by `isPointInStroke` on foreign SVG.

`features: ["roots", "extrema"]` on a function turns them on. The module's old `quadratic` shortcut is restated as function-graph data in `tests/function-graph-features.test.ts`.

**What stays in `plot` is fitting data** — `numpy.polyfit`, R², residuals. That is statistics over a series, not evaluation of a stated function, and numpy is the right tool. The script is now `modules/plot/fit.py`; `--functions=` and the three function shortcuts exit with a pointer to the preset.

## What the module suite would have lost, and did not

`plot`'s misdeclare run was the module suite's one test of a lie about *meaning*: a root moved off the curve and axis it still claimed. Deleting function mode would have deleted that coverage. So the fit now makes a claim of the same shape: each fitted value ŷᵢ lies on `fit-curve` **and** at the end of its own `residual-i`. It is a real claim — a ŷ computed from the wrong coefficients but plotted on the drawn curve passes the first half; one on a residual drawn to match passes the second — and the misdeclare run moves one off both. `module-feature-on-its-stroke` also keeps its offline coverage in `tests/module-protocol-selftest.test.ts`.

## What was refused

**Moving the fit into the core too.** Degree-1 and degree-2 least squares are a few lines of TypeScript, and it may happen. It was not done here because nothing asked for it and the module is a working, checked consumer of the module protocol; removing the last reason `plot` exists belongs to its own decision.

## The cost, stated

Anyone calling `module python --args "modules/plot/function.py,..."` breaks. The path is gone and the flags are refused with a message naming the replacement; nothing is silently reinterpreted.
