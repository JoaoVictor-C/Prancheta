"""Shared electrical schematic symbols (M5 stage 3, step 17).

A leaf primitive here is a `draw_*` function: given a centre point, it
returns `(svg_fragment, width, height, y_offset)` — the SVG markup for one
symbol, and the exact box that markup occupies. That box is a **claim to be
checked**, the same discipline every module's own `declaredBox` follows
(decision 0005) — a caller wraps it in a `declaredBox` dict and the core's
`module-geometry-agrees` check verifies the browser actually measured that
box, not a number this file merely asserts.

Extracted from `modules/circuit/render.py`, which was the only module that
needed them and so grew them privately. Nothing about the geometry changed in
the move — every measured-not-guessed comment below is unchanged from where
it was found, by real `getBoundingClientRect` probes against exactly this
markup, and `tests/module-circuit-e2e.test.ts` re-verifies the same claims
today, unmodified, against `circuit`'s own real Chromium run. A second module
that wants a resistor or a switch imports from here rather than
re-discovering the same asymmetric boxes by trial and error.

width/height are always symmetric around cx (every symbol's own x0/x1 are
cx +/- half-width) but NOT always symmetric around cy: an inductor's bumps
only rise above cy, a switch's lever only rises on one side. y_offset is how
far the symbol's TRUE vertical centre sits from cy -- 0.0 for a genuinely
symmetric symbol.
"""

from __future__ import annotations

from typing import Callable

WIRE = "#E6E9EF"


def draw_resistor(cx: float, cy: float) -> tuple[str, float, float, float]:
    w, h = 46.0, 14.0
    x0 = cx - w / 2
    n = 6
    step = w / n
    pts = [(x0, cy)]
    for i in range(1, n):
        pts.append((x0 + i * step, cy + (h / 2 if i % 2 == 1 else -h / 2)))
    pts.append((x0 + w, cy))
    d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
    return f'<path d="{d}" stroke="{WIRE}" stroke-width="2" fill="none"/>', w, h, 0.0


def draw_capacitor(cx: float, cy: float) -> tuple[str, float, float, float]:
    gap, plate_h = 8.0, 26.0
    x0, x1 = cx - gap / 2, cx + gap / 2
    svg = (
        f'<line x1="{x0:.2f}" y1="{cy - plate_h / 2:.2f}" x2="{x0:.2f}" y2="{cy + plate_h / 2:.2f}" '
        f'stroke="{WIRE}" stroke-width="2.5"/>'
        f'<line x1="{x1:.2f}" y1="{cy - plate_h / 2:.2f}" x2="{x1:.2f}" y2="{cy + plate_h / 2:.2f}" '
        f'stroke="{WIRE}" stroke-width="2.5"/>'
    )
    return svg, gap, plate_h, 0.0


def draw_inductor(cx: float, cy: float) -> tuple[str, float, float, float]:
    w, r = 44.0, 5.5
    n = 4
    x0 = cx - w / 2
    step = w / n
    arcs = []
    for i in range(n):
        bx = x0 + step * i + step / 2
        arcs.append(f'M {bx - step / 2:.2f} {cy:.2f} A {r:.2f} {r:.2f} 0 0 1 {bx + step / 2:.2f} {cy:.2f}')
    d = " ".join(arcs)
    # Measured, not guessed: a standalone probe (four SVG arcs, the exact
    # markup this draws) showed getBoundingClientRect returns height r
    # exactly, at y-range [cy-r, cy] -- the bumps rise ABOVE cy only, they
    # don't straddle it. The first version declared a symmetric r+2 box
    # centred on cy; module-geometry-agrees failed on every inductor on the
    # first honest run, for two independent reasons (wrong height, and a
    # wrongly-centred one) that the probe resolved together.
    return f'<path d="{d}" stroke="{WIRE}" stroke-width="2" fill="none"/>', w, r, -r / 2


def draw_switch(cx: float, cy: float) -> tuple[str, float, float, float]:
    w = 40.0
    x0, x1 = cx - w / 2, cx + w / 2
    svg = (
        f'<circle cx="{x0:.2f}" cy="{cy:.2f}" r="2.5" fill="{WIRE}"/>'
        f'<circle cx="{x1:.2f}" cy="{cy:.2f}" r="2.5" fill="{WIRE}"/>'
        f'<line x1="{x0 + 2.5:.2f}" y1="{cy:.2f}" x2="{x1 - 6:.2f}" y2="{cy - 12:.2f}" '
        f'stroke="{WIRE}" stroke-width="2"/>'
    )
    # Measured, not guessed (same probe as draw_inductor): the two terminal
    # circles extend the true width beyond w by their own radius on each
    # side (symmetric, so width alone was right), but the true y-range is
    # [cy-12, cy+2.5] -- the open lever rises further above cy than the
    # circles extend below it, so the box's true centre sits 4.75px ABOVE cy,
    # not on it.
    return svg, w + 5.0, 14.5, -4.75


def draw_diode(cx: float, cy: float) -> tuple[str, float, float, float]:
    w, h = 30.0, 22.0
    x0, x1 = cx - w / 2, cx + w / 2
    svg = (
        f'<path d="M {x0:.2f} {cy - h / 2:.2f} L {x0:.2f} {cy + h / 2:.2f} L {x1:.2f} {cy:.2f} Z" '
        f'fill="{WIRE}"/>'
        f'<line x1="{x1:.2f}" y1="{cy - h / 2:.2f}" x2="{x1:.2f}" y2="{cy + h / 2:.2f}" '
        f'stroke="{WIRE}" stroke-width="2.5"/>'
    )
    return svg, w, h, 0.0


def draw_battery(cx: float, cy: float) -> tuple[str, float, float, float]:
    """Vertical, for the left edge. Two cells: long-thin (+) over short-thick (-)."""
    long_w, short_w, gap = 30.0, 16.0, 10.0
    svg = (
        f'<line x1="{cx - long_w / 2:.2f}" y1="{cy - gap / 2:.2f}" x2="{cx + long_w / 2:.2f}" y2="{cy - gap / 2:.2f}" '
        f'stroke="{WIRE}" stroke-width="2"/>'
        f'<line x1="{cx - short_w / 2:.2f}" y1="{cy + gap / 2:.2f}" x2="{cx + short_w / 2:.2f}" y2="{cy + gap / 2:.2f}" '
        f'stroke="{WIRE}" stroke-width="4"/>'
    )
    # Measured: two flat lines have zero height of their own, so the group's
    # true height is exactly the gap between them, not gap+4 for the thicker
    # stroke -- the "no stroke padding on a bare line" lesson modules/molecule
    # already learned, re-forgotten and re-caught here.
    return svg, long_w, gap, 0.0


SYMBOLS: dict[str, Callable[[float, float], tuple[str, float, float, float]]] = {
    "resistor": draw_resistor,
    "capacitor": draw_capacitor,
    "inductor": draw_inductor,
    "switch": draw_switch,
    "diode": draw_diode,
}
