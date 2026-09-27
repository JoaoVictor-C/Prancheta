# 0029 — Curves that are not graphs of a function are derived too

## Status

Accepted. Extends [ADR 0022](0022-function-graph-preset.md); the grammar change amends its "one variable".

## The need

Cálculo 1 and Geometria Analítica are full of curves that are not y = f(x): the circle and the ellipse given by their equations, the hyperbola xy = 1, the cycloid and the circle traced by a parameter, the cardioid and the rose in polar form. `function-graph` could draw none of them. The only ways round it were the ones this project exists to refuse — two half-functions `sqrt(9 − x²)` glued at the ends and meeting badly at the vertices, or a polyline of typed points, a second statement of the curve free to disagree with the equation printed beside it.

## The decision

**Three new kinds of curve in `functions`, each stated as expressions and never as points:**

- parametric — `{"x": "cos(t)", "y": "sin(t)", "t": [0, "2pi"]}`;
- polar — `{"r": "1 + cos(θ)", "theta": [0, "2pi"]}`;
- implicit — `{"implicit": "x^2/9 + y^2/4 = 1"}`.

They are series like any function, so `series-distinguishable-without-colour`, `curve-label-nearest-its-curve`, the legend search and `text-clear-of-ink` hold them with no change to a check. A curve that draws nothing inside the plotted range is refused: the figure would assert something the reader cannot see.

**The grammar takes named variables** (`src/math/expr.ts`). `parseIn(source, ["x", "y"])` accepts exactly the declared names, each its own number, and refuses any other by name; `θ` is also spelled `theta`, and an axis's own name is a further spelling of x or y. The one-variable form — `parse(source, "t")`, where t and x are the same variable — is untouched, so function-graph and sign-chart did not change a line to keep working. Equations (`parseEquation`) have exactly one `=`, and a plain expression refuses `=` by name. A bound may be an expression with no variables (`"2pi"`), because JSON cannot write 2π and 6.2832 is a rounded second statement of it.

**"xy" is a product only when it cannot be anything else.** The tokenizer reads letters greedily, so "xy" is one name. With two variables, refusing it would refuse the notation of every conic in the syllabus ("xy = 1"); guessing would put a guess in a grammar built not to make any. The rule: a run that is exactly a known name is that name ("pi" is π, "exp" the function); otherwise it is a product only if it splits into declared variables and constants in exactly one way ("xy", "xe^x", "thetax"); no split is an unknown name, and two splits are refused naming both readings (variables `p`, `i` beside the constant `pi` make "pie" either pi·e or p·i·e). Functions never take part in a split — "xsin(x)" is refused, "x sin(x)" is not. Nothing that parsed before parses differently: a run that was a name still is, and a run that was refused was refused.

**Parametric and polar curves are sampled adaptively, in pixels** (`src/presets/function-graph/curves.ts`). An interval of the parameter is halved while the curve's midpoint strays from the chord by more than a quarter of an output pixel (an eighth of a CSS pixel: the PNG is rasterised at 2×), or while its two half-chords turn by more than 4°. The turn bound came second, from a review: at a rose's petal tip chords of 7px met a quarter-CSS-pixel bound yet turned 14° at every vertex, and the eye reads a polygon by its corners, not by its sagitta. Measured on the fixtures, the drawn polyline now lies within 0.06–0.09 CSS px of the true curve and turns at most about 8° between chords. Where it will not settle — the chord stays long at the deepest level — the curve has jumped, and the run is broken there instead of joined across: r = 1/cos θ is the line x = 1 with no chord through infinity, (t, 1/t) is two branches. Even samples in t, which suffice for y = f(x) because x advances steadily across the page, would draw a polygon where a cardioid is fast and a chord straight across the figure at every pole.

**Implicit curves are traced by marching squares with refinement** (`src/math/contour.ts`), pure and separately tested. Every vertex is bisected along its cell edge until the bracket is under a stated tolerance, so it lies on the curve rather than where linear interpolation guesses. A sign change whose residual does not shrink is a pole or a jump and is not a crossing — the test sign-chart uses to tell a root from a pole (ADR 0027), and the reason xy = 1 is not joined across the axes. A saddle cell is decided by evaluating the function at the cell's centre, not by the textbook's fixed table, which joins the branches of x² − y² = 0.01 half the time; a centre on the level draws an X as an X. Cells are about 3px, so a chord strays from the true curve by far less than a pixel.

**Every curve is clipped exactly at the plotted range** (Liang–Barsky), so it reaches the border instead of stopping one sample short.

**A place on a curve is named by the curve's own coordinate.** A label's numeric `at`, a point's `{of, …}` and a tangent's `at` mean x on a graph, t on a parametric curve and θ on a polar one; asking for the wrong one is refused with the right one in the message. A tangent to a parametric or polar curve has slope y′/x′ from symmetric differences; a vertical one is refused, since a line here is y = mx + b.

## What was refused

**Typed points for any of these curves.** A polyline of coordinates is the helper script's defect again, one level down.

**Points and tangents on an implicit curve.** It has no coordinate to name a place by; `{of, x}` would have to choose among several y (an ellipse has two at most x), which is a guess. A label on it takes a point and is anchored at the curve's nearest point — "near here" is a way of naming a place that cannot be wrong about which one. A point on it is placed by coordinates, or the curve is stated parametrically.

**Symbolic handling of the equation** — solving for y, finding foci, simplifying. That is a computer-algebra system's worth of code; the figure needs where the equation holds, which sampling finds.

**Vertical lines as a new line kind.** `implicit: "x = 2"` draws one already.

**Changing how y = f(x) is sampled.** The fourteen Cálculo 1 figures render against a measured baseline (ADR 0022); adaptive sampling there would move every one of them for no defect anyone has seen. Graphs keep their 240 even samples.

## The cost, stated

**What marching squares cannot see is not drawn.** A level set that touches the value without crossing it ((x² + y² − 1)² = 0), an isolated point (x² + y² = 0), and any loop smaller than a cell fall between samples. The first two draw nothing and are refused as drawing nothing; the third is invisible. Where the function is undefined at a cell corner the cell is skipped, so an implicit curve stops within one cell of the edge of its domain.

**A clipped end lies on the last chord, not on the curve** — within half a pixel of it, not within the bisection tolerance interior vertices meet.

**A tick number can step off its gridline.** A vertex on a lattice line (the hyperbola x²/4 − y² = 1 at x = −2) or a curve through the origin along the diagonal "0" slides on (the rose r = cos 2θ) inks the number's whole half-division of gridline, and the tick rule of ADR 0022 slides it straight along the curve. Its fallback, a paper backing, then painted over the curve: the checks accepted it, since the number was clear of ink, and a reviewer saw a curve with a gap — which was not the contour or the sampler at all. So where a backing would cut a curve, the number first tries every spot within a quarter division of its gridline, nearest first ("−2" sits just inside the vertex, "0" beside the origin). A backing over a guide alone is still the designed fallback — the guide is cut around the number — so the Cálculo 1 figures are unchanged. Only if nothing is clear does a backing cut a curve, and then it is the last resort.

**The fixture directory is shared.** `fixtures/function-graph/` now holds `curve-*.json` beside the sheet's `calc1-*.json`; the tests that count the sheet's figures count the `calc1-` ones.
