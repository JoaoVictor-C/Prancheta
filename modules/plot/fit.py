"""Least-squares fit figure module for Prancheta.

Draws a CLASS of figures: a scatter of (x, y) data points with a real
least-squares polynomial fit (numpy.polyfit), its R^2, and each point's
residual -- the vertical segment from the data point to the fitted value.

This module used to draw function curves too (`function.py --functions=`),
with roots and extrema found numerically. The core now evaluates functions
itself: the `function-graph` preset parses the expression, finds the same
roots and extrema, declares each on its curve (a root also on the x axis)
and checks the claim with `feature-on-its-curve`. Two evaluators of one
expression language would drift -- Python's `log` is natural, the sheet's is
base 10 -- so function plots have one owner now (ADR 0025). What stays here
is what numpy is for: fitting a model to data.

The claim a fit makes about its own arithmetic is stated so the core can
refute it: each fitted value y-hat_i lies on the fit curve AND at the end of
its own residual. Either half alone leaves a place to be wrong -- a y-hat
computed from the wrong coefficients but plotted on the drawn curve passes
the first; one at the wrong height on a residual drawn to match passes the
second.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that.
"""

from __future__ import annotations

import json
import sys
from typing import Any

import numpy as np

# The font this figure's text is set in, handed down by the core with the
# canvas size: the core MEASURES the result, so the two must agree on glyphs.
FONT_STACK = "Segoe UI, sans-serif"

COLOURS = ["#5B8DEF", "#E76F51"]
AXIS_COLOUR = "#3D4757"
DIM = "#9AA4B2"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "linear_fit_demo": {
        "degree": 1,
        "points": [[0, 1.1], [1, 2.9], [2, 4.8], [3, 7.2], [4, 8.9], [5, 11.3]],
    },
    "quadratic_fit_demo": {
        "degree": 2,
        "points": [[-3, 8.5], [-2, 3.8], [-1, 0.9], [0, -0.2], [1, 1.1], [2, 4.2], [3, 9.1]],
    },
}

MOVED = (
    "function curves moved to the core's function-graph preset (ADR 0025): write "
    '{"preset": "function-graph", "x": {...}, "y": {...}, "functions": [{"id": "f", "expr": "...", '
    '"features": ["roots", "extrema"]}]} and render it. This module now draws least-squares fits only '
    "(--points=... or --name=linear_fit_demo / quadratic_fit_demo)."
)

# A residual shorter than this is drawn but not claimed: a zero-length stroke
# has no area for the core's isPointInStroke to find a point in.
MIN_RESIDUAL_PX = 4.0


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

    for i, ((x, y), yhat) in enumerate(zip(points, fitted)):
        cx, cy, fy = sx(x), sy(y), sy(float(yhat))
        claimed = abs(cy - fy) >= MIN_RESIDUAL_PX
        rid = f"residual-{i}"
        # Round caps, so the residual's end -- where y-hat sits -- is inside
        # the stroke rather than exactly on its edge.
        parts.append(
            f'<path data-pr-id="{rid}" d="M {cx:.2f} {cy:.2f} L {cx:.2f} {fy:.2f}" stroke="{DIM}" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 3" fill="none"/>'
        )
        if claimed:
            elements.append(
                {
                    "id": rid,
                    "kind": "feature",
                    "claim": f"the residual of point {i}",
                    # The path's geometric box, as the fit curve declares its
                    # own: a vertical segment is zero wide.
                    "declaredBox": {
                        "x": round(cx, 2),
                        "y": round(min(cy, fy), 2),
                        "width": 0.0,
                        "height": round(abs(cy - fy), 2),
                    },
                }
            )
        fid = f"fitted-{i}"
        parts.append(f'<circle data-pr-id="{fid}" cx="{cx:.2f}" cy="{fy:.2f}" r="3" fill="{COLOURS[1]}"/>')
        elements.append(
            {
                "id": fid,
                "kind": "feature",
                "claim": f"the fitted value at x={x:g}",
                "declaredBox": {"x": round(cx - 3, 2), "y": round(fy - 3, 2), "width": 6.0, "height": 6.0},
                "on": ["fit-curve", rid] if claimed else ["fit-curve"],
            }
        )
        pid = f"point-{i}"
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
    # No owner: a stroked <path> has no fill area for a containment test.
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
    # A THIRD planted defect, and the only one that is a lie about MEANING:
    # a fitted value is moved off the curve and off its residual, while its
    # claim to lie on both is left standing. Nothing is malformed afterwards,
    # so only module-feature-on-its-stroke can see it.
    moved = next(
        (e for e in output["elements"] if e["id"].startswith("fitted-") and len(e.get("on", [])) == 2),
        None,
    )
    if moved is not None:
        box = moved["declaredBox"]
        shifted = box["y"] - 60.0
        output["svg"] = output["svg"].replace(
            f'data-pr-id="{moved["id"]}" cx="{box["x"] + 3:.2f}" cy="{box["y"] + 3:.2f}"',
            f'data-pr-id="{moved["id"]}" cx="{box["x"] + 3:.2f}" cy="{shifted + 3:.2f}"',
        )
        moved["declaredBox"] = {**box, "y": shifted}
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom series declared, one feature's own geometry shifted 35px from what it drew, "
        "and a fitted value moved 60px off the curve and residual it still claims to lie on"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    points_arg = next((a for a in args if a.startswith("--points=")), None)
    fit_arg = next((a for a in args if a.startswith("--fit=")), None)
    if any(a.startswith("--functions=") or a.startswith("--range=") for a in args):
        raise SystemExit(MOVED)

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    global FONT_STACK
    FONT_STACK = str(request.get("fontFamily", FONT_STACK))
    width = float(request.get("width", 760))
    height = float(request.get("height", 470))

    if points_arg is not None:
        points = [[float(v) for v in pair.split(",")] for pair in points_arg.split(";") if pair]
        degree = {"linear": 1, "quadratic": 2}.get(fit_arg.split("=", 1)[1] if fit_arg else "linear", 1)
    else:
        key = name_arg.split("=", 1)[1].lower() if name_arg is not None else "linear_fit_demo"
        if key in ("quadratic", "sine_cosine", "damped_oscillation"):
            raise SystemExit(MOVED)
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        points, degree = NAMED[key]["points"], NAMED[key]["degree"]

    output = render_fit(width, height, points, degree)
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
