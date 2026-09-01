"""General function & data-plot figure module for Prancheta.

Draws a CLASS of figures: any f(x) expression (or several, overlaid), with
roots and local extrema found numerically rather than eyeballed; or a scatter
of (x, y) data points with a real least-squares fit (numpy.polyfit) and its
R^2. See docs/research/candidate-modules.md, candidate #3.

This directory used to hold a second script, derivative.py, that drew exactly
one hand-placed pedagogical figure. Being a class of figures rather than one
figure is the bar it failed, and it was deleted in the module audit -- the
core draws the same explanation now, animated, in experiments/derivative/.

Why a module rather than a preset: the core's IR has boxes, scenes and
connectors. It has no notion of a mathematical function, cannot evaluate one,
and cannot find a root, an extremum, or fit a line to data. Sampling,
root-finding and least-squares are exactly the "geometry the core cannot
compute" decision 0005 exists for.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any, Callable

import numpy as np

# The font this figure's text is set in.
#
# Handed down by the core with the canvas size, because the core is what
# MEASURES the result and the two have to agree about which glyphs were drawn.
# The default is only for running this script by hand; a real invocation always
# supplies it. See src/modules/protocol.ts.
FONT_STACK = "Segoe UI, sans-serif"

ALLOWED_NAMES: dict[str, Any] = {
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "exp": math.exp, "log": math.log, "log10": math.log10, "sqrt": math.sqrt,
    "abs": abs, "pow": pow, "pi": math.pi, "e": math.e,
}

COLOURS = ["#5B8DEF", "#E76F51", "#48A9A6", "#E9C46A", "#9D7BE8"]
AXIS_COLOUR = "#3D4757"
TEXT_COLOUR = "#E6E9EF"
DIM = "#9AA4B2"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "quadratic": {"mode": "functions", "functions": ["x**2/4 - 2*x + 1"], "range": [-3, 11]},
    "sine_cosine": {"mode": "functions", "functions": ["3*sin(x)", "3*cos(x)"], "range": [-6.5, 6.5]},
    "damped_oscillation": {"mode": "functions", "functions": ["4*exp(-x/6)*cos(x)"], "range": [-1, 20]},
    "linear_fit_demo": {
        "mode": "fit",
        "degree": 1,
        "points": [[0, 1.1], [1, 2.9], [2, 4.8], [3, 7.2], [4, 8.9], [5, 11.3]],
    },
    "quadratic_fit_demo": {
        "mode": "fit",
        "degree": 2,
        "points": [[-3, 8.5], [-2, 3.8], [-1, 0.9], [0, -0.2], [1, 1.1], [2, 4.2], [3, 9.1]],
    },
}


def make_function(expr: str) -> Callable[[float], float | None]:
    code = compile(expr, "<expr>", "eval")
    for name in code.co_names:
        if name not in ALLOWED_NAMES and name != "x":
            raise ValueError(f"'{name}' is not an allowed name in a plotted expression: {expr!r}")

    def fn(x: float) -> float | None:
        try:
            y = eval(code, {"__builtins__": {}}, {**ALLOWED_NAMES, "x": x})  # noqa: S307 (namespace is closed)
        except (ValueError, ZeroDivisionError, OverflowError):
            return None
        if not isinstance(y, (int, float)) or not math.isfinite(y):
            return None
        return float(y)

    return fn


def sample(fn: Callable[[float], float | None], x0: float, x1: float, steps: int) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        x = x0 + (x1 - x0) * i / steps
        y = fn(x)
        if y is not None:
            pts.append((x, y))
    return pts


def find_roots(fn: Callable[[float], float | None], pts: list[tuple[float, float]]) -> list[float]:
    roots: list[float] = []
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        if ya == 0.0:
            roots.append(xa)
            continue
        if ya * yb < 0:
            lo, hi = xa, xb
            for _ in range(40):
                mid = (lo + hi) / 2
                ym = fn(mid)
                if ym is None:
                    break
                if (ya < 0) == (ym < 0):
                    lo = mid
                else:
                    hi = mid
            roots.append((lo + hi) / 2)
    return roots


def find_extrema(pts: list[tuple[float, float]]) -> list[tuple[float, float, str]]:
    out: list[tuple[float, float, str]] = []
    for i in range(1, len(pts) - 1):
        (_, ya), (xb, yb), (_, yc) = pts[i - 1], pts[i], pts[i + 1]
        if yb > ya and yb > yc:
            out.append((xb, yb, "max"))
        elif yb < ya and yb < yc:
            out.append((xb, yb, "min"))
    return out


def render_functions(width: float, height: float, functions: list[str], xrange: list[float]) -> dict[str, Any]:
    # `right` reserves a legend column structurally outside the plotted
    # region -- curves are confined to x <= width-right by construction, so a
    # label placed in that column cannot collide with a curve no matter what
    # shape the curve takes. An earlier version chased each curve's own peak
    # for its label position instead, and every one of its collision fixes
    # (endpoint-on-curve, peak-on-y-axis, nudge-past-canvas-edge) just
    # relocated the same class of bug rather than removing it -- a fixed,
    # reserved region removes it structurally.
    left, right, top, bottom = 60.0, 150.0, 30.0, 46.0
    plot_w, plot_h = width - left - right, height - top - bottom
    x0, x1 = xrange

    fns = [make_function(expr) for expr in functions]
    samples = [sample(fn, x0, x1, 400) for fn in fns]
    all_ys = [y for pts in samples for _, y in pts]
    if not all_ys:
        raise ValueError("no function sampled to a finite value anywhere in range")
    y0, y1 = min(all_ys), max(all_ys)
    pad_y = max((y1 - y0) * 0.1, 1e-6)
    y0, y1 = y0 - pad_y, y1 + pad_y

    def sx(x: float) -> float:
        return left + (x - x0) / (x1 - x0) * plot_w

    def sy(y: float) -> float:
        return top + plot_h - (y - y0) / (y1 - y0) * plot_h

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    ax_y = sy(0.0) if y0 <= 0 <= y1 else sy(y0)
    parts.append(
        f'<path data-pr-id="axis-x" d="M {sx(x0):.2f} {ax_y:.2f} L {sx(x1):.2f} {ax_y:.2f}" '
        f'stroke="{AXIS_COLOUR}" stroke-width="1.5" fill="none"/>'
    )
    ax_x = sx(0.0) if x0 <= 0 <= x1 else sx(x0)
    parts.append(
        f'<path data-pr-id="axis-y" d="M {ax_x:.2f} {sy(y0):.2f} L {ax_x:.2f} {sy(y1):.2f}" '
        f'stroke="{AXIS_COLOUR}" stroke-width="1.5" fill="none"/>'
    )
    elements.append({"id": "axis-x", "kind": "decoration", "claim": "the x axis"})
    elements.append({"id": "axis-y", "kind": "decoration", "claim": "the y axis"})

    for i, (expr, pts) in enumerate(zip(functions, samples)):
        colour = COLOURS[i % len(COLOURS)]
        curve_id = f"curve-{i}"
        if not pts:
            continue
        d = "M " + " L ".join(f"{sx(x):.2f} {sy(y):.2f}" for x, y in pts)
        parts.append(f'<path data-pr-id="{curve_id}" d="{d}" stroke="{colour}" stroke-width="2.5" fill="none"/>')
        xs, ys = zip(*pts)
        elements.append(
            {
                "id": curve_id,
                "kind": "feature",
                "claim": f"the graph of {expr}",
                "declaredBox": {
                    "x": round(min(sx(x) for x in xs), 2),
                    "y": round(min(sy(y) for y in ys), 2),
                    "width": round(max(sx(x) for x in xs) - min(sx(x) for x in xs), 2),
                    "height": round(max(sy(y) for y in ys) - min(sy(y) for y in ys), 2),
                },
            }
        )

        for j, root_x in enumerate(find_roots(fns[i], pts)):
            rid = f"root-{i}-{j}"
            cx, cy = sx(root_x), sy(0.0)
            parts.append(f'<circle data-pr-id="{rid}" cx="{cx:.2f}" cy="{cy:.2f}" r="4.5" fill="{BG}" stroke="{colour}" stroke-width="2"/>')
            elements.append(
                {
                    "id": rid,
                    "kind": "feature",
                    "claim": f"a root of {expr} near x={root_x:.3f}",
                    "declaredBox": {"x": round(cx - 4.5, 2), "y": round(cy - 4.5, 2), "width": 9.0, "height": 9.0},
                    # What makes a root a root, stated as a relation the core
                    # can falsify by measuring the drawing rather than by
                    # trusting the bisection above. BOTH halves are required
                    # and that is the whole point: a wrong root plotted at
                    # (x_wrong, 0) misses the curve, and a wrong root plotted
                    # at (x_wrong, f(x_wrong)) sits on the curve but off the
                    # axis. Declaring either one alone leaves the module a
                    # place to be wrong in and still pass.
                    "on": [curve_id, "axis-x"],
                }
            )

        for j, (ex_x, ex_y, kind) in enumerate(find_extrema(pts)):
            eid = f"extremum-{i}-{j}"
            cx, cy = sx(ex_x), sy(ex_y)
            parts.append(f'<circle data-pr-id="{eid}" cx="{cx:.2f}" cy="{cy:.2f}" r="4.5" fill="{colour}"/>')
            elements.append(
                {
                    "id": eid,
                    "kind": "feature",
                    "claim": f"a local {kind} of {expr} near ({ex_x:.2f}, {ex_y:.2f})",
                    "declaredBox": {"x": round(cx - 4.5, 2), "y": round(cy - 4.5, 2), "width": 9.0, "height": 9.0},
                    # An extremum has only one relation to state: it lies on
                    # its own curve. There is no second drawn line for it to
                    # meet -- the tangent being horizontal is a fact about the
                    # samples, not about any ink -- so this is honestly a
                    # weaker claim than a root's, and saying so is better than
                    # inventing a second half to make it look symmetrical.
                    "on": [curve_id],
                }
            )

        # A fixed swatch + label in the reserved right-hand column -- see the
        # note on `right` above for why this replaced curve-relative
        # placement entirely rather than patching it further.
        lid = f"legend-{i}"
        swatch_x = width - right + 18
        row_y = top + 10 + i * 22
        parts.append(
            f'<line x1="{swatch_x:.2f}" y1="{row_y:.2f}" x2="{swatch_x + 18:.2f}" y2="{row_y:.2f}" '
            f'stroke="{colour}" stroke-width="3"/>'
        )
        parts.append(
            f'<text data-pr-id="{lid}" x="{swatch_x + 26:.2f}" y="{row_y:.2f}" text-anchor="start" '
            f'dominant-baseline="middle" font-family="{FONT_STACK}" font-size="13" '
            f'font-weight="600" fill="{colour}">{expr}</text>'
        )
        # No owner: a stroked <path> (fill="none") has no isPointInFill area
        # for a containment test to check against -- declaring one made
        # module-label-within-feature fail on every honest run. What this
        # label actually needs verified is that it doesn't sit on the drawn
        # ink, and module-labels-clear-of-strokes already covers that for
        # every "feature"-kind element, ownership or not (see the identical
        # fix in modules/reaction/render.py).
        elements.append({"id": lid, "kind": "label", "claim": f"names the curve {expr}"})

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {"svg": svg, "elements": elements, "notes": []}


def render_fit(width: float, height: float, points: list[list[float]], degree: int) -> dict[str, Any]:
    left, right, top, bottom = 60.0, 30.0, 30.0, 46.0
    plot_w, plot_h = width - left - right, height - top - bottom
    xs = np.array([p[0] for p in points], dtype=float)
    ys = np.array([p[1] for p in points], dtype=float)

    coeffs = np.polyfit(xs, ys, degree)
    fitted = np.polyval(coeffs, xs)
    ss_res = float(np.sum((ys - fitted) ** 2))
    ss_tot = float(np.sum((ys - np.mean(ys)) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0

    x0, x1 = float(xs.min()), float(xs.max())
    pad_x = max((x1 - x0) * 0.1, 1e-6)
    x0, x1 = x0 - pad_x, x1 + pad_x
    curve_xs = np.linspace(x0, x1, 200)
    curve_ys = np.polyval(coeffs, curve_xs)
    y0, y1 = min(float(ys.min()), float(curve_ys.min())), max(float(ys.max()), float(curve_ys.max()))
    pad_y = max((y1 - y0) * 0.12, 1e-6)
    y0, y1 = y0 - pad_y, y1 + pad_y

    def sx(x: float) -> float:
        return left + (x - x0) / (x1 - x0) * plot_w

    def sy(y: float) -> float:
        return top + plot_h - (y - y0) / (y1 - y0) * plot_h

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    ax_y = sy(0.0) if y0 <= 0 <= y1 else sy(y0)
    parts.append(
        f'<path data-pr-id="axis-x" d="M {sx(x0):.2f} {ax_y:.2f} L {sx(x1):.2f} {ax_y:.2f}" '
        f'stroke="{AXIS_COLOUR}" stroke-width="1.5" fill="none"/>'
    )
    ax_x = sx(0.0) if x0 <= 0 <= x1 else sx(x0)
    parts.append(
        f'<path data-pr-id="axis-y" d="M {ax_x:.2f} {sy(y0):.2f} L {ax_x:.2f} {sy(y1):.2f}" '
        f'stroke="{AXIS_COLOUR}" stroke-width="1.5" fill="none"/>'
    )
    elements.append({"id": "axis-x", "kind": "decoration", "claim": "the x axis"})
    elements.append({"id": "axis-y", "kind": "decoration", "claim": "the y axis"})

    d = "M " + " L ".join(f"{sx(x):.2f} {sy(y):.2f}" for x, y in zip(curve_xs, curve_ys))
    parts.append(f'<path data-pr-id="fit-curve" d="{d}" stroke="{COLOURS[1]}" stroke-width="2.5" fill="none"/>')
    elements.append(
        {
            "id": "fit-curve",
            "kind": "feature",
            "claim": f"a degree-{degree} least-squares fit, R^2={r2:.4f}",
            "declaredBox": {
                "x": round(min(sx(x) for x in curve_xs), 2),
                "y": round(min(sy(y) for y in curve_ys), 2),
                "width": round(max(sx(x) for x in curve_xs) - min(sx(x) for x in curve_xs), 2),
                "height": round(max(sy(y) for y in curve_ys) - min(sy(y) for y in curve_ys), 2),
            },
        }
    )

    for i, (x, y) in enumerate(points):
        pid = f"point-{i}"
        cx, cy = sx(x), sy(y)
        parts.append(f'<circle data-pr-id="{pid}" cx="{cx:.2f}" cy="{cy:.2f}" r="4.5" fill="{COLOURS[0]}"/>')
        elements.append(
            {
                "id": pid,
                "kind": "feature",
                "claim": f"the data point ({x:g}, {y:g})",
                "declaredBox": {"x": round(cx - 4.5, 2), "y": round(cy - 4.5, 2), "width": 9.0, "height": 9.0},
            }
        )

    terms = " + ".join(
        f"{c:.3g}·x^{degree - i}" if degree - i > 1 else (f"{c:.3g}·x" if degree - i == 1 else f"{c:.3g}")
        for i, c in enumerate(coeffs)
    )
    parts.append(
        f'<text data-pr-id="fit-equation" x="{width - right:.2f}" y="{top + 14:.2f}" text-anchor="end" '
        f'font-family="{FONT_STACK}" font-size="13" font-weight="600" fill="{COLOURS[1]}">y = {terms}</text>'
    )
    # No owner: same reasoning as the curve legend in render_functions above.
    elements.append({"id": "fit-equation", "kind": "label", "claim": f"the fitted equation, R^2={r2:.4f}"})
    parts.append(
        f'<text data-pr-id="fit-r2" x="{width - right:.2f}" y="{top + 30:.2f}" text-anchor="end" '
        f'font-family="{FONT_STACK}" font-size="12" fill="{DIM}">R² = {r2:.4f}</text>'
    )
    elements.append({"id": "fit-r2", "kind": "label", "claim": "the coefficient of determination"})

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {"svg": svg, "elements": elements, "notes": [f"R^2={r2:.4f}"]}


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "phantom-series", "kind": "feature", "claim": "a curve that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "x": box["x"] + 35.0}
            break
    # A THIRD planted defect, and the only one that is a lie about MEANING
    # rather than about form: the drawn root marker is moved off its own
    # curve while its claim to lie there is left standing. Nothing about the
    # figure is malformed afterwards -- the marker is a well-sized circle
    # inside the canvas, colliding with nothing -- so every check that
    # existed before this one still passes it. What the figure now says is
    # simply false, and module-feature-on-its-stroke is what says so.
    moved_root = None
    for element in output["elements"]:
        if element["id"].startswith("root-") and "declaredBox" in element:
            moved_root = element
            break
    if moved_root is not None:
        box = moved_root["declaredBox"]
        shifted_y = box["y"] - 60.0
        output["svg"] = output["svg"].replace(
            f'data-pr-id="{moved_root["id"]}" cx="{box["x"] + 4.5:.2f}" cy="{box["y"] + 4.5:.2f}"',
            f'data-pr-id="{moved_root["id"]}" cx="{box["x"] + 4.5:.2f}" cy="{shifted_y + 4.5:.2f}"',
        )
        moved_root["declaredBox"] = {**box, "y": shifted_y}
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom series declared, one feature's own geometry shifted 35px from what it drew, "
        "and a root marker moved 60px off the curve and axis it still claims to lie on"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    functions_arg = next((a for a in args if a.startswith("--functions=")), None)
    range_arg = next((a for a in args if a.startswith("--range=")), None)
    points_arg = next((a for a in args if a.startswith("--points=")), None)
    fit_arg = next((a for a in args if a.startswith("--fit=")), None)

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    # The face the CORE will measure this SVG against, handed down with the
    # canvas size. Naming a font the measuring machine does not have is how the
    # same figure becomes two different figures.
    global FONT_STACK
    FONT_STACK = str(request.get("fontFamily", FONT_STACK))
    width = float(request.get("width", 760))
    height = float(request.get("height", 470))

    if points_arg is not None:
        points = [[float(v) for v in pair.split(",")] for pair in points_arg.split(";") if pair]
        degree = {"linear": 1, "quadratic": 2}.get(fit_arg.split("=", 1)[1] if fit_arg else "linear", 1)
        output = render_fit(width, height, points, degree)
    elif functions_arg is not None:
        functions = [f for f in functions_arg.split(";") if f]
        xrange = [float(v) for v in range_arg.split(",")] if range_arg else [-6.0, 6.0]
        output = render_functions(width, height, functions, xrange)
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        spec = NAMED[key]
        if spec["mode"] == "fit":
            output = render_fit(width, height, spec["points"], spec["degree"])
        else:
            output = render_functions(width, height, spec["functions"], spec["range"])
    else:
        spec = NAMED["quadratic"]
        output = render_functions(width, height, spec["functions"], spec["range"])

    if misdeclare:
        output = apply_misdeclare(output)

    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
