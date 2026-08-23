# plot — figure modules in Python

Two scripts in this directory, deliberately different in shape.

## `derivative.py` — one fixed pedagogical figure

Draws exactly one picture: a curve, two points on it, the secant through them, and the tangent that secant becomes as the second point slides in. It takes no input beyond canvas size and is not a general module — it exists to explain what a derivative *is*, not to plot arbitrary content. See its own header comment for the reasoning.

## `function.py` — the general module

Takes a real spec and renders any instance of a class of figures: one or more `f(x)` expressions overlaid, with roots and local extrema found numerically; or a scatter of `(x, y)` points with a real least-squares fit (`numpy.polyfit`) and its R². See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #3.

### Why this exists outside the core

The core's IR cannot evaluate a function, find a root, or fit a line. Sampling an expression, bisecting for a sign change, and least-squares are exactly the "geometry the core cannot compute" decision 0005 exists for.

### What it declares, and what it does not

Curves, root markers, extremum markers, fit lines and data points are all `feature` elements with a `declaredBox` computed from the same sampled/fitted coordinates that were plotted — this module knows those positions because it just computed them. Legend text, the fitted equation, and R² are `label`s with no declared box, for the usual reason: text metrics need a font engine this process doesn't have.

### What building it found

**A label placed at a curve's own trajectory collides with the curve — reliably, not occasionally.** The first version anchored each curve's legend at its sample endpoint. `module-labels-clear-of-strokes` failed immediately on a damped oscillation, whose endpoint sits right where the curve itself settles near zero. Moving the anchor to the curve's point of maximum deflection fixed that case and broke the next one: a peak can itself sit *on* an axis (`cos(x)` peaks at `x=0`), and nudging the anchor point without also flipping which way the text anchors let the glyph box swing back across the axis it had just been nudged away from. Fixing that collision produced a third, on a peak nudged toward a canvas edge.

**Three collision fixes in a row, each relocating the same class of bug, was the signal to stop patching and change the strategy.** The legend now lives in a fixed column reserved on the canvas's right edge (`right = 150` instead of `30`), with curves geometrically confined to `x <= width - right` by construction. A label placed in that column cannot collide with a curve for any curve shape, because the two regions never overlap — the fix is structural, not another special case. The lesson, stated plainly: a placement heuristic that needs a growing pile of special cases for the shapes it collides with is evidence the region itself is unsafe, not that the heuristic needs one more case.

**The same "no fillable feature to own a label" lesson as `reaction` and `molecule`.** Legend text and the fit equation were first declared with `owner` pointing at the curve they name. `module-label-within-feature` failed on every honest run: a stroked `<path>` (`fill="none"`) has no fill area for `isPointInFill` to test against. Removed the `owner` field entirely — `module-labels-clear-of-strokes` already covers every label against every `feature`/`decoration` element regardless of ownership, which is the check that actually applies here.

### Running it

```bash
node src/cli.ts module python --args "modules/plot/function.py,--name=sine_cosine"
node src/cli.ts module python --args "modules/plot/function.py,--functions=x**3-4*x,--range=-3,3"
node src/cli.ts module python --args "modules/plot/function.py,--points=0,1.1;1,2.9;2,4.8;3,7.2,--fit=linear"
node src/cli.ts module python --args "modules/plot/function.py,--misdeclare"
```

Named shortcuts: `quadratic`, `sine_cosine`, `damped_oscillation`, `linear_fit_demo`, `quadratic_fit_demo` (`--name=<key>`). `--functions=` takes `;`-separated expressions in `x` (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `exp`, `log`, `log10`, `sqrt`, `abs`, `pow`, `pi`, `e` are the only names allowed — evaluated in a closed namespace, not a general `eval`). `--range=xmin,xmax` sets the domain; the y-range is always computed from what was actually sampled. `--points=x,y;x,y;...` switches to fit mode; `--fit=linear|quadratic` picks the polynomial degree.

### What is not checked

**Malformation, not misrepresentation**, the same limit stated everywhere else in this repertoire. A function plotted over a domain where it means something different (a log scale mislabelled as linear, an expression that isn't the one claimed in the legend text) passes every check here. So does a fit computed on a dataset too small or too collinear to mean anything — `R²` is reported honestly for whatever numbers were given, and nothing here judges whether the fit itself is a reasonable thing to have computed.
