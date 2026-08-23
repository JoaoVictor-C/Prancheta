"""Pie/donut chart figure module for Prancheta.

A real wedge -- a filled circular sector -- cannot be expressed in the core's
IR: a Block is always an axis-aligned rectangle (src/ir/types.ts), and that
is precisely the boundary that put bar charts in the TypeScript core
(src/presets/chart/) while this, the one chart shape that genuinely needs new
geometry, is a module instead. See docs/research/candidate-modules.md's
logic-gates note and src/presets/chart/PRESET.md's own stated boundary for
the identical reasoning stated from the other side.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any

# The same canonical palette src/theme.ts defines for the TypeScript core,
# applied categorically -- the identical choice src/presets/chart/preset.ts
# makes for bar-chart series, restated here because a Python module can't
# import a TS module's constants and duplicating five hex values is more
# honest than inventing a coupling that doesn't exist.
SERIES_COLOURS = ["#5B8DEF", "#E76F51", "#4CAF7D", "#E9C46A", "#48A9A6"]

BG = "#0F1115"
LABEL_COLOUR = "#0F1115"
LEGEND_TEXT = "#E6E9EF"
LEGEND_BG = "#171A21"

NAMED: dict[str, dict[str, Any]] = {
    "market_share": {
        "title": "Market share by vendor",
        "slices": [
            {"label": "Vendor A", "value": 38},
            {"label": "Vendor B", "value": 27},
            {"label": "Vendor C", "value": 19},
            {"label": "Vendor D", "value": 11},
            {"label": "Other", "value": 5},
        ],
        "donut": False,
    },
    "budget_breakdown": {
        "title": "Quarterly budget by category",
        "slices": [
            {"label": "Engineering", "value": 45},
            {"label": "Sales", "value": 20},
            {"label": "Marketing", "value": 15},
            {"label": "Support", "value": 12},
            {"label": "Other", "value": 8},
        ],
        "donut": True,
    },
}


def arc_point(cx: float, cy: float, r: float, angle: float) -> tuple[float, float]:
    return (cx + r * math.cos(angle), cy + r * math.sin(angle))


def sector_path(cx: float, cy: float, r_outer: float, r_inner: float, a0: float, a1: float) -> tuple[str, list[tuple[float, float]]]:
    """An SVG path for one wedge (pie) or annular segment (donut), plus sample points for a real bounding box."""
    large_arc = 1 if (a1 - a0) % (2 * math.pi) > math.pi else 0
    o0 = arc_point(cx, cy, r_outer, a0)
    o1 = arc_point(cx, cy, r_outer, a1)
    samples = [arc_point(cx, cy, r_outer, a0 + (a1 - a0) * t / 24) for t in range(25)]

    if r_inner <= 0:
        d = f"M {cx:.2f} {cy:.2f} L {o0[0]:.2f} {o0[1]:.2f} A {r_outer:.2f} {r_outer:.2f} 0 {large_arc} 1 {o1[0]:.2f} {o1[1]:.2f} Z"
        samples.append((cx, cy))
    else:
        i0 = arc_point(cx, cy, r_inner, a0)
        i1 = arc_point(cx, cy, r_inner, a1)
        d = (
            f"M {i0[0]:.2f} {i0[1]:.2f} L {o0[0]:.2f} {o0[1]:.2f} "
            f"A {r_outer:.2f} {r_outer:.2f} 0 {large_arc} 1 {o1[0]:.2f} {o1[1]:.2f} "
            f"L {i1[0]:.2f} {i1[1]:.2f} "
            f"A {r_inner:.2f} {r_inner:.2f} 0 {large_arc} 0 {i0[0]:.2f} {i0[1]:.2f} Z"
        )
        samples += [arc_point(cx, cy, r_inner, a0 + (a1 - a0) * t / 24) for t in range(25)]
    return d, samples


def render(width: float, height: float, title: str, slices_in: list[dict[str, Any]], donut: bool, misdeclare: bool, param_overrides: dict[str, float] | None = None) -> dict[str, Any]:
    if not slices_in:
        raise ValueError("at least one slice is required")
    total = sum(s["value"] for s in slices_in)
    if total <= 0:
        raise ValueError("slice values must sum to a positive total")

    # Adjustable parameters with defaults and bounds
    legend_w = param_overrides.get("legend_width", 200.0) if param_overrides else 200.0
    pad = param_overrides.get("pad", 30.0) if param_overrides else 30.0
    row_h = param_overrides.get("legend_row_height", 24.0) if param_overrides else 24.0

    cx = pad + (width - legend_w - 2 * pad) / 2
    cy = height / 2
    r_outer = min((width - legend_w - 2 * pad) / 2, (height - 2 * pad) / 2)
    r_inner = r_outer * 0.55 if donut else 0.0

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    angle = -math.pi / 2  # 12 o'clock, matches convention
    for i, sl in enumerate(slices_in):
        fraction = sl["value"] / total
        a0, a1 = angle, angle + fraction * 2 * math.pi
        angle = a1
        colour = SERIES_COLOURS[i % len(SERIES_COLOURS)]
        sid = f"slice-{i}"
        d, samples = sector_path(cx, cy, r_outer, r_inner, a0, a1)
        parts.append(f'<path data-pr-id="{sid}" d="{d}" fill="{colour}" stroke="{BG}" stroke-width="2"/>')
        xs = [p[0] for p in samples]
        ys = [p[1] for p in samples]
        pct = round(fraction * 100, 1)
        elements.append(
            {
                "id": sid, "kind": "feature", "claim": f'{sl["label"]}, {pct}% of the total',
                "declaredBox": {
                    "x": round(min(xs), 2), "y": round(min(ys), 2),
                    "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2),
                },
            }
        )

        # Label inside the slice only when it's wide enough to plausibly hold
        # one -- the same "leave it unlabelled rather than force a collision"
        # resolution modules/crystal and modules/map both reached for their
        # own crowded cases. The legend (below) names every slice regardless.
        if fraction > 0.06:
            mid = (a0 + a1) / 2
            label_r = (r_outer + r_inner) / 2 if donut else r_outer * 0.65
            lx, ly = arc_point(cx, cy, label_r, mid)
            lid = f"{sid}-label"
            parts.append(
                f'<text data-pr-id="{lid}" x="{lx:.2f}" y="{ly:.2f}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="13" '
                f'font-weight="700" fill="{LABEL_COLOUR}">{pct}%</text>'
            )
            # A real owner claim: a wedge is a filled path, same reasoning as
            # modules/genomic's gene arrows -- module-label-within-feature
            # runs for genuine effect here, not as not-applicable.
            elements.append({"id": lid, "kind": "label", "owner": sid, "claim": f"the percentage for {sid}"})

    if donut:
        hole_id = "donut-hole"
        parts.append(f'<circle data-pr-id="{hole_id}" cx="{cx:.2f}" cy="{cy:.2f}" r="{r_inner:.2f}" fill="{BG}"/>')
        elements.append(
            {
                "id": hole_id, "kind": "decoration", "claim": "the donut's centre hole",
                "declaredBox": {"x": round(cx - r_inner, 2), "y": round(cy - r_inner, 2), "width": round(2 * r_inner, 2), "height": round(2 * r_inner, 2)},
            }
        )

    if title:
        parts.append(
            f'<text data-pr-id="chart-title" x="{cx:.2f}" y="{pad / 1.6:.2f}" text-anchor="middle" '
            f'font-family="Segoe UI, sans-serif" font-size="15" font-weight="700" fill="{LEGEND_TEXT}">{title}</text>'
        )
        elements.append({"id": "chart-title", "kind": "label", "claim": "the chart title"})

    # --- legend: every slice, real percentage, regardless of inline label --
    legend_x = width - legend_w + 10.0
    legend_y0 = height / 2 - (len(slices_in) * row_h) / 2
    for i, sl in enumerate(slices_in):
        ry = legend_y0 + i * row_h
        colour = SERIES_COLOURS[i % len(SERIES_COLOURS)]
        swatch_id = f"legend-swatch-{i}"
        parts.append(f'<rect data-pr-id="{swatch_id}" x="{legend_x:.2f}" y="{ry:.2f}" width="14" height="14" fill="{colour}" rx="3"/>')
        elements.append(
            {
                "id": swatch_id, "kind": "decoration", "claim": f'the legend swatch for {sl["label"]}',
                "declaredBox": {"x": round(legend_x, 2), "y": round(ry, 2), "width": 14.0, "height": 14.0},
            }
        )
        text_id = f"legend-label-{i}"
        pct = round(sl["value"] / total * 100, 1)
        parts.append(
            f'<text data-pr-id="{text_id}" x="{legend_x + 20:.2f}" y="{ry + 9:.2f}" text-anchor="start" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="12" fill="{LEGEND_TEXT}">{sl["label"]} ({pct}%)</text>'
        )
        elements.append({"id": text_id, "kind": "label", "claim": f'names {swatch_id} as {sl["label"]}'})

    if misdeclare:
        elements.append({"id": "slice-phantom", "kind": "feature", "claim": "a slice that was never drawn"})
        for element in elements:
            if element["kind"] == "feature" and "declaredBox" in element:
                box = element["declaredBox"]
                element["declaredBox"] = {**box, "x": box["x"] + 30.0}
                break

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    notes = [f"{len(slices_in)} slice(s) totalling {total:g}"]
    if misdeclare:
        notes.append("misdeclare mode: a phantom slice declared, and one real slice's own geometry shifted 30px from what it drew")
    return {
        "svg": svg,
        "elements": elements,
        "notes": notes,
        "parameters": [
            {
                "name": "pad",
                "value": pad,
                "min": 20.0,
                "max": 60.0,
                "unit": "px",
                "description": "Canvas padding on all sides",
            },
            {
                "name": "legend_width",
                "value": legend_w,
                "min": 150.0,
                "max": 300.0,
                "unit": "px",
                "description": "Width of the legend column",
            },
            {
                "name": "legend_row_height",
                "value": row_h,
                "min": 18.0,
                "max": 36.0,
                "unit": "px",
                "description": "Height of each legend row",
            },
        ],
    }


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    donut_flag = "--donut" in args

    if name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        spec = NAMED[key]
        title, slices_in, donut = spec["title"], spec["slices"], spec["donut"]
    else:
        spec = NAMED["market_share"]
        title, slices_in, donut = spec["title"], spec["slices"], donut_flag

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 640))
    height = float(request.get("height", 420))
    param_overrides = request.get("parameterOverrides")

    json.dump(render(width, height, title, slices_in, donut, misdeclare, param_overrides), sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
