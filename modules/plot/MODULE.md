# plot — least-squares fits

One script, `fit.py`: a scatter of `(x, y)` data with a real least-squares polynomial fit (`numpy.polyfit`), its R², and each point's residual.

## Function curves moved to the core

This module used to draw `f(x)` curves too (`function.py --functions=...`), with roots and extrema found numerically. Its reason for existing was that the core could not evaluate a function. That stopped being true with the `function-graph` preset (ADR 0022), which parses the expression, finds the same roots and extrema, and declares each marker on its curve — a root also on the x axis — for the core check `feature-on-its-curve` to measure. Keeping both would have meant two evaluators of one expression language, and they already disagreed (Python's `log` is natural; the sheet's is base 10). ADR 0025 records the decision. `--functions=` and the old `quadratic`, `sine_cosine` and `damped_oscillation` shortcuts now exit with a pointer to the preset.

What stays here is what numpy is for: fitting a model to data.

## What it declares

- `fit-curve`, the fitted polynomial, and each `point-i`, with a `declaredBox` from the same coordinates it drew.
- `residual-i`, the vertical segment from a data point to its fitted value, when it is at least 4px long (a shorter stroke has no area for `isPointInStroke` to find a point in).
- `fitted-i`, the fitted value ŷᵢ, which claims to lie **on `fit-curve` and on `residual-i`**. That is the conjunction a root used to make with its curve and its axis: a ŷ computed from the wrong coefficients but plotted on the drawn curve passes the first half; one on a residual drawn to match passes the second. Both together have no hiding place, and `module-feature-on-its-stroke` measures both.
- The fitted equation and R² as `label`s with no owner — a stroked path has no fill for a containment test.

## Running it

```bash
node src/cli.ts module python --args "modules/plot/fit.py,--name=linear_fit_demo"
node src/cli.ts module python --args "modules/plot/fit.py,--points=0,1.1;1,2.9;2,4.8;3,7.2,--fit=linear"
node src/cli.ts module python --args "modules/plot/fit.py,--misdeclare"
```

`--points=x,y;x,y;...` takes the data; `--fit=linear|quadratic` the degree. `--misdeclare` plants a phantom series, shifts one declared box by 35px, and moves a fitted value 60px off the curve and residual it still claims.

## What is not checked

**Malformation, not misrepresentation.** A fit computed on data too few or too collinear to mean anything passes every check; R² is reported honestly for whatever numbers were given, and nothing here judges whether fitting them was reasonable.
