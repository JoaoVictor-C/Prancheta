"""Circuit-schematic figure module for Prancheta.

A single-loop series circuit -- a battery and N components arranged around a
rectangle -- drawn with the symbol vocabulary an electrical engineer actually
expects: a resistor zigzag, capacitor plates, an inductor's bumps, a switch
gap, a diode triangle. See docs/research/candidate-modules.md, candidate #4.

Why a module rather than the graph preset: a circuit IS a graph, but the
graph preset's ELK-routed rectangles can only draw a labelled box, and
pretending a labelled box is a resistor is the exact "flowchart because a
flowchart is available" failure the selection core exists to refuse -- one
level down, inside a single figure class instead of across the repertoire.

This module lays out its own grid rather than depending on a third-party
schematic-CAD library's internal object model: every coordinate on every
wire is computed here, so every declaredBox is a claim about numbers this
module actually owns, the same discipline every other module in this
repertoire follows. The symbols themselves (resistor, capacitor, inductor,
switch, diode, battery) live in ../symbols_electrical.py -- a shared leaf
library (M5 stage 3, step 17) rather than private to this file, so a future
electrical-schematic module does not have to rediscover the same
measured-not-guessed asymmetric boxes.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from symbols_electrical import SYMBOLS, WIRE, draw_battery  # noqa: E402

LABEL_COLOUR = "#9AA4B2"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "rc_lowpass": {
        "battery": "9V",
        "components": [{"type": "resistor", "value": "R1 = 1kΩ"}, {"type": "capacitor", "value": "C1 = 10µF"}],
    },
    "led_circuit": {
        "battery": "3V",
        "components": [{"type": "resistor", "value": "R1 = 220Ω"}, {"type": "diode", "value": "LED1"}],
    },
    "rlc_series": {
        "battery": "12V",
        "components": [
            {"type": "resistor", "value": "R1 = 100Ω"},
            {"type": "inductor", "value": "L1 = 10mH"},
            {"type": "capacitor", "value": "C1 = 100nF"},
        ],
    },
    "switched_lamp": {
        "battery": "6V",
        "components": [{"type": "switch", "value": "S1"}, {"type": "resistor", "value": "R1 = 47Ω"}],
    },
}


def render(width: float, height: float, battery: str, components: list[dict[str, str]]) -> dict[str, Any]:
    if not components:
        raise ValueError("at least one component is required")
    for c in components:
        if c["type"] not in SYMBOLS:
            raise ValueError(f"unknown component type {c['type']!r}; known: {', '.join(sorted(SYMBOLS))}")

    pad = 60.0
    n = len(components)
    slot_w = 110.0
    loop_w = max(width - 2 * pad, n * slot_w)
    loop_h = height - 2 * pad
    left, top, right, bottom = pad, pad, pad + loop_w, pad + loop_h
    battery_cy = (top + bottom) / 2

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    def wire(wid: str, x0: float, y0: float, x1: float, y1: float, claim: str) -> None:
        parts.append(f'<line data-pr-id="{wid}" x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="{WIRE}" stroke-width="2"/>')
        elements.append(
            {
                "id": wid,
                "kind": "decoration",
                "claim": claim,
                "declaredBox": {
                    "x": round(min(x0, x1), 2),
                    "y": round(min(y0, y1), 2),
                    "width": round(abs(x1 - x0), 2),
                    "height": round(abs(y1 - y0), 2),
                },
            }
        )

    # --- the battery, on the left edge --------------------------------------
    batt_svg, batt_w, batt_h, batt_yoff = draw_battery(left, battery_cy)
    parts.append(f'<g data-pr-id="battery">{batt_svg}</g>')
    elements.append(
        {
            "id": "battery",
            "kind": "feature",
            "claim": f"the voltage source, {battery}",
            "declaredBox": {
                "x": round(left - batt_w / 2, 2),
                "y": round(battery_cy + batt_yoff - batt_h / 2, 2),
                "width": round(batt_w, 2),
                "height": round(batt_h, 2),
            },
        }
    )
    parts.append(
        f'<text data-pr-id="battery-label" x="{left - 14:.2f}" y="{battery_cy:.2f}" text-anchor="end" '
        f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="13" fill="{LABEL_COLOUR}">{battery}</text>'
    )
    elements.append({"id": "battery-label", "kind": "label", "claim": f"labels the source as {battery}"})

    wire("wire-batt-top", left, battery_cy - batt_h / 2, left, top, "wire from the battery's + terminal to the top-left corner")
    wire("wire-batt-bottom", left, battery_cy + batt_h / 2, left, bottom, "wire from the battery's - terminal to the bottom-left corner")

    # --- components along the top edge --------------------------------------
    xs = [left + loop_w * (i + 0.5) / n for i in range(n)]
    prev_x = left
    for i, (comp, cx) in enumerate(zip(components, xs)):
        draw_fn = SYMBOLS[comp["type"]]
        svg, w, h, y_off = draw_fn(cx, top)
        cid = f"c{i}"
        parts.append(f'<g data-pr-id="{cid}">{svg}</g>')
        elements.append(
            {
                "id": cid,
                "kind": "feature",
                "claim": f"a {comp['type']}, {comp['value']}",
                "declaredBox": {
                    "x": round(cx - w / 2, 2),
                    "y": round(top + y_off - h / 2, 2),
                    "width": round(w, 2),
                    "height": round(h, 2),
                },
            }
        )
        parts.append(
            f'<text data-pr-id="{cid}-label" x="{cx:.2f}" y="{top - h / 2 - 10:.2f}" text-anchor="middle" '
            f'font-family="Segoe UI, sans-serif" font-size="12" fill="{LABEL_COLOUR}">{comp["value"]}</text>'
        )
        elements.append({"id": f"{cid}-label", "kind": "label", "claim": f"labels {cid} as {comp['value']}"})

        wire(f"wire-top-{i}", prev_x, top, cx - w / 2, top, f"wire into {cid}")
        prev_x = cx + w / 2

    wire("wire-top-last", prev_x, top, right, top, "wire from the last component to the top-right corner")
    wire("wire-right", right, top, right, bottom, "wire down the right edge")
    wire("wire-bottom", right, bottom, left, bottom, "wire along the bottom edge back to the battery")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {"svg": svg, "elements": elements, "notes": []}


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "wire-phantom", "kind": "decoration", "claim": "a wire that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "x": box["x"] + 28.0}
            break
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom wire declared, and one component's own geometry shifted 28px from what it drew"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    battery_arg = next((a for a in args if a.startswith("--battery=")), None)
    components_arg = next((a for a in args if a.startswith("--components=")), None)

    if components_arg is not None:
        # ";" between components, ":" between type and value -- not commas.
        # node src/cli.ts module's own --args flag is comma-joined at the CLI
        # layer (see modules/dendrogram/MODULE.md for the identical trap).
        battery = battery_arg.split("=", 1)[1] if battery_arg else "9V"
        components = []
        for token in components_arg.split("=", 1)[1].split(";"):
            ctype, _, value = token.partition(":")
            components.append({"type": ctype, "value": value or ctype})
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        battery, components = NAMED[key]["battery"], NAMED[key]["components"]
    else:
        battery, components = NAMED["rc_lowpass"]["battery"], NAMED["rc_lowpass"]["components"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 640))
    height = float(request.get("height", 320))

    output = render(width, height, battery, components)
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
