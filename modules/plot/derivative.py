"""Derivative figure module for Prancheta.

Draws the one picture that explains what a derivative *is*: a curve, two points
on it, the secant through them, and the tangent that secant becomes as the
second point slides in.

Why a module rather than a preset: the core's IR has boxes, scenes and
connectors. It has no curve, and no way to evaluate a function or compute a
slope. Sampling f, projecting to canvas coordinates, and solving the tangent are
exactly the "geometry the core cannot compute" that decision 0005 exists for.

Reads one JSON document on stdin, writes one on stdout. Declares what it drew;
does not certify that what it drew is correct — the core measures that.
"""

from __future__ import annotations

import json
import sys

# f(x) = x^2/4 + 1. Chosen so the interesting region fits a landscape canvas
# and the tangent at P is visibly shallower than the secant.
def f(x: float) -> float:
    return x * x / 4.0 + 1.0


def df(x: float) -> float:
    return x / 2.0


X_MIN, X_MAX = -1.0, 7.0
Y_MIN, Y_MAX = 0.0, 13.0

PX, QX = 2.0, 5.4  # the two points on the curve


def render(width: float, height: float) -> dict:
    left, right = 74.0, 30.0
    top, bottom = 30.0, 58.0
    plot_w = width - left - right
    plot_h = height - top - bottom

    def sx(x: float) -> float:
        return left + (x - X_MIN) / (X_MAX - X_MIN) * plot_w

    def sy(y: float) -> float:
        return top + plot_h - (y - Y_MIN) / (Y_MAX - Y_MIN) * plot_h

    parts: list[str] = []
    elements: list[dict] = []

    def label(el_id: str, x: float, y: float, text: str, *,
              colour: str = "#E6E9EF", size: int = 15, anchor: str = "middle",
              weight: str = "400", owner: str | None = None, claim: str = "") -> None:
        parts.append(
            f'<text data-pr-id="{el_id}" x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" '
            f'font-family="Segoe UI, sans-serif" font-size="{size}" font-weight="{weight}" '
            f'fill="{colour}">{text}</text>'
        )
        entry = {"id": el_id, "kind": "label", "claim": claim or text}
        if owner:
            entry["owner"] = owner
        elements.append(entry)

    # --- axes ---------------------------------------------------------------
    ax_y = sy(0.0)
    parts.append(
        f'<path data-pr-id="axis-x" d="M {sx(X_MIN):.2f} {ax_y:.2f} L {sx(X_MAX):.2f} {ax_y:.2f}" '
        f'stroke="#3D4757" stroke-width="1.5" fill="none"/>'
    )
    parts.append(
        f'<path data-pr-id="axis-y" d="M {sx(0.0):.2f} {sy(Y_MIN):.2f} L {sx(0.0):.2f} {sy(Y_MAX):.2f}" '
        f'stroke="#3D4757" stroke-width="1.5" fill="none"/>'
    )
    elements.append({"id": "axis-x", "kind": "decoration", "claim": "the x axis"})
    elements.append({"id": "axis-y", "kind": "decoration", "claim": "the y axis"})

    # --- the curve ----------------------------------------------------------
    steps = 240
    pts = []
    for i in range(steps + 1):
        x = X_MIN + (X_MAX - X_MIN) * i / steps
        y = f(x)
        if y <= Y_MAX:
            pts.append(f"{sx(x):.2f} {sy(y):.2f}")
    parts.append(
        f'<path data-pr-id="curve" d="M {" L ".join(pts)}" stroke="#5B8DEF" '
        f'stroke-width="2.5" fill="none"/>'
    )
    elements.append({"id": "curve", "kind": "feature", "claim": "the graph of f"})

    px, py = sx(PX), sy(f(PX))
    qx, qy = sx(QX), sy(f(QX))

    # --- the run and rise, drawn as the right triangle under the secant -----
    parts.append(
        f'<path data-pr-id="run" d="M {px:.2f} {py:.2f} L {qx:.2f} {py:.2f}" '
        f'stroke="#48A9A6" stroke-width="1.8" stroke-dasharray="5 4" fill="none"/>'
    )
    parts.append(
        f'<path data-pr-id="rise" d="M {qx:.2f} {py:.2f} L {qx:.2f} {qy:.2f}" '
        f'stroke="#48A9A6" stroke-width="1.8" stroke-dasharray="5 4" fill="none"/>'
    )
    elements.append({"id": "run", "kind": "decoration", "claim": "the horizontal change, h"})
    elements.append({"id": "rise", "kind": "decoration", "claim": "the vertical change, f(a+h) - f(a)"})

    # --- the secant, extended a little past both points ----------------------
    slope_sec = (f(QX) - f(PX)) / (QX - PX)
    def sec_y(x: float) -> float:
        return f(PX) + slope_sec * (x - PX)
    s0, s1 = PX - 1.4, QX + 1.0
    parts.append(
        f'<path data-pr-id="secant" d="M {sx(s0):.2f} {sy(sec_y(s0)):.2f} '
        f'L {sx(s1):.2f} {sy(sec_y(s1)):.2f}" stroke="#E9C46A" stroke-width="2" fill="none"/>'
    )
    elements.append({"id": "secant", "kind": "feature", "claim": "the secant through P and Q"})

    # --- the tangent at P ----------------------------------------------------
    slope_tan = df(PX)
    def tan_y(x: float) -> float:
        return f(PX) + slope_tan * (x - PX)
    t0, t1 = PX - 2.2, PX + 3.0
    parts.append(
        f'<path data-pr-id="tangent" d="M {sx(t0):.2f} {sy(tan_y(t0)):.2f} '
        f'L {sx(t1):.2f} {sy(tan_y(t1)):.2f}" stroke="#E76F51" stroke-width="2.5" fill="none"/>'
    )
    elements.append({"id": "tangent", "kind": "feature", "claim": "the tangent at P: the derivative"})

    # --- the two points ------------------------------------------------------
    for el_id, cx, cy, colour in (("point-p", px, py, "#E76F51"), ("point-q", qx, qy, "#E9C46A")):
        parts.append(
            f'<circle data-pr-id="{el_id}" cx="{cx:.2f}" cy="{cy:.2f}" r="5" '
            f'fill="#0F1115" stroke="{colour}" stroke-width="2.5"/>'
        )
        elements.append({"id": el_id, "kind": "feature", "claim": f"a point on the curve"})

    # --- arrow showing Q sliding toward P -----------------------------------
    arrow_y = py + 26
    parts.append(
        f'<path data-pr-id="slide" d="M {qx - 6:.2f} {arrow_y:.2f} L {px + 16:.2f} {arrow_y:.2f}" '
        f'stroke="#8A94A6" stroke-width="1.6" fill="none"/>'
    )
    parts.append(
        f'<path d="M {px + 16:.2f} {arrow_y:.2f} L {px + 25:.2f} {arrow_y - 3.5:.2f} '
        f'L {px + 25:.2f} {arrow_y + 3.5:.2f} Z" fill="#8A94A6"/>'
    )
    elements.append({"id": "slide", "kind": "decoration", "claim": "Q slides toward P as h shrinks"})

    # --- labels --------------------------------------------------------------
    label("label-f", sx(6.2), sy(f(6.2)) - 14, "f(x)", colour="#5B8DEF", size=16, weight="600")
    label("label-p", px - 16, py - 12, "P", colour="#E76F51", size=16, weight="600")
    # Above-LEFT of Q: to the right the curve climbs steeply straight through
    # where the label would sit.
    label("label-q", qx - 12, qy - 14, "Q", colour="#E9C46A", size=16, weight="600", anchor="end")
    label("label-a", px, ax_y + 22, "a", colour="#9AA4B2")
    label("label-ah", qx, ax_y + 22, "a + h", colour="#9AA4B2")
    label("label-run", (px + qx) / 2, py + 20, "h", colour="#48A9A6", weight="600")
    label("label-rise", qx + 12, (py + qy) / 2, "f(a+h) − f(a)", colour="#48A9A6", size=13,
          anchor="start")
    # Sits above the secant BETWEEN P and Q, where the gap between secant and
    # curve is widest. Its first home was the far right end, where it collided
    # with the f(x) label — caught by module-labels-do-not-collide.
    label("label-secant", sx(4.3), sy(sec_y(4.3)) - 13, "secant: average rate",
          colour="#E9C46A", size=13, anchor="middle")
    # Below the tangent, right of P: the wedge between tangent and x-axis is the
    # only large clear region. Its first home was the tangent's far left end,
    # where it lay across the curve's tail.
    label("label-tangent", sx(4.2), sy(tan_y(4.2)) + 44, "tangent: instantaneous rate",
          colour="#E76F51", size=13, anchor="middle")
    label("label-slide", (px + qx) / 2, arrow_y + 20, "let h → 0", colour="#8A94A6", size=13)

    # Tick marks on the x axis at a and a+h.
    for tick_x in (px, qx):
        parts.append(
            f'<path d="M {tick_x:.2f} {ax_y - 4:.2f} L {tick_x:.2f} {ax_y + 4:.2f}" '
            f'stroke="#3D4757" stroke-width="1.5"/>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="#0F1115"/>'
        f'{"".join(parts)}'
        f"</svg>"
    )

    return {
        "svg": svg,
        "elements": elements,
        "notes": [
            f"secant slope {slope_sec:.3f}, tangent slope {slope_tan:.3f}",
            "labels declare no owner: none of them claims to sit inside a feature",
        ],
    }


def main() -> int:
    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    json.dump(render(float(request.get("width", 760)), float(request.get("height", 470))), sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
