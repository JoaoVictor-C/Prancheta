"""Protein secondary-structure topology-cartoon figure module for Prancheta.

A 2D "TOPS-style" topology diagram: helices as rounded capsules, strands as
arrows, connected in sequence order by a serpentine (meander) path that wraps
to a new row rather than running off the canvas -- the standard convention
for laying out a chain of secondary-structure elements so the connecting
loops stay readable instead of crossing. See
docs/research/candidate-modules.md, candidate #6.

Why a module rather than a preset: this is a topology-diagram layout
problem in its own right, not a generic graph. A protein chain is a PATH
(strict sequence order, no branching), and the convention that makes it
readable -- meander left-to-right then right-to-left on the row below,
wrapping when a row fills -- is domain-specific enough that it earned its own
small algorithm here rather than being expressed as a generic ELK graph.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.

The two named topologies below are ILLUSTRATIVE constructs -- a four-helix
bundle and a beta-alpha-beta Rossmann-fold PATTERN -- not element ranges
fetched from any specific real PDB entry. Labelled as such throughout.
"""

from __future__ import annotations

import json
import sys
from typing import Any

HELIX_COLOUR = "#E76F51"
SHEET_COLOUR = "#5B8DEF"
LOOP_COLOUR = "#3D4757"
LABEL_COLOUR = "#0F1115"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "four_helix_bundle": {
        # Illustrative: four alpha helices connected by loops, the classic
        # up-down-up-down bundle topology. Not fetched from a real PDB entry.
        "elements": [
            {"type": "helix", "residues": 22, "label": "α1"},
            {"type": "helix", "residues": 20, "label": "α2"},
            {"type": "helix", "residues": 24, "label": "α3"},
            {"type": "helix", "residues": 21, "label": "α4"},
        ],
    },
    "rossmann_pattern": {
        # Illustrative: the beta-alpha-beta-alpha-beta PATTERN that gives the
        # Rossmann fold its name, with representative element lengths. Not
        # fetched from a real PDB entry.
        "elements": [
            {"type": "sheet", "residues": 6, "label": "β1"},
            {"type": "helix", "residues": 14, "label": "α1"},
            {"type": "sheet", "residues": 6, "label": "β2"},
            {"type": "helix", "residues": 12, "label": "α2"},
            {"type": "sheet", "residues": 7, "label": "β3"},
            {"type": "helix", "residues": 13, "label": "α3"},
            {"type": "sheet", "residues": 6, "label": "β4"},
        ],
    },
}

ELEMENT_H = 34.0
MIN_W, RESIDUE_W = 46.0, 5.0
ROW_GAP = 70.0
COL_GAP = 26.0


def element_width(residues: int) -> float:
    return max(MIN_W, residues * RESIDUE_W)


def draw_helix(x0: float, y: float, w: float, label: str) -> tuple[str, dict[str, Any]]:
    h = ELEMENT_H
    svg = f'<rect x="{x0:.2f}" y="{y - h / 2:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{h / 2:.2f}" fill="{HELIX_COLOUR}"/>'
    return svg, {"x": round(x0, 2), "y": round(y - h / 2, 2), "width": round(w, 2), "height": round(h, 2)}


def draw_sheet(x0: float, y: float, w: float, direction: int, label: str) -> tuple[str, dict[str, Any]]:
    h = ELEMENT_H
    tip = min(16.0, w * 0.35)
    if direction >= 0:
        body_end = x0 + w - tip
        d = (
            f"M {x0:.2f} {y - h / 2:.2f} L {body_end:.2f} {y - h / 2:.2f} "
            f"L {x0 + w:.2f} {y:.2f} L {body_end:.2f} {y + h / 2:.2f} "
            f"L {x0:.2f} {y + h / 2:.2f} Z"
        )
    else:
        body_start = x0 + tip
        d = (
            f"M {x0 + w:.2f} {y - h / 2:.2f} L {body_start:.2f} {y - h / 2:.2f} "
            f"L {x0:.2f} {y:.2f} L {body_start:.2f} {y + h / 2:.2f} "
            f"L {x0 + w:.2f} {y + h / 2:.2f} Z"
        )
    svg = f'<path d="{d}" fill="{SHEET_COLOUR}"/>'
    return svg, {"x": round(x0, 2), "y": round(y - h / 2, 2), "width": round(w, 2), "height": round(h, 2)}


def render(width: float, height: float, elements_in: list[dict[str, Any]], param_overrides: dict[str, float] | None = None) -> dict[str, Any]:
    if not elements_in:
        raise ValueError("at least one secondary-structure element is required")

    # Adjustable parameters with defaults and bounds
    pad = param_overrides.get("pad", 50.0) if param_overrides else 50.0
    row_gap = param_overrides.get("row_gap", 70.0) if param_overrides else 70.0
    col_gap = param_overrides.get("col_gap", 26.0) if param_overrides else 26.0

    row_w = max(width - 2 * pad, 400.0)

    # --- serpentine placement: pack left-to-right, wrap and reverse ---------
    placements: list[dict[str, Any]] = []
    cursor_x = pad
    row = 0
    direction = 1
    for el in elements_in:
        w = element_width(el["residues"])
        if cursor_x + w > pad + row_w and cursor_x > pad:
            row += 1
            direction *= -1
            cursor_x = pad
        x0 = cursor_x if direction >= 0 else (pad + row_w) - (cursor_x - pad) - w
        placements.append({"row": row, "x0": x0, "w": w, "direction": direction, **el})
        cursor_x += w + col_gap

    n_rows = placements[-1]["row"] + 1
    # canvas_w must widen to match row_w's own floor, not just the requested
    # width -- a first version left the SVG's declared width at the caller's
    # (possibly narrower) request while row_w silently grew to its 400px
    # floor, and every element in a wrapped row ran off the right edge.
    # content-within-canvas caught it on the very first non-default-width run.
    canvas_w = max(width, pad * 2 + row_w)
    canvas_h = max(height, pad * 2 + n_rows * row_gap)

    def row_y(r: int) -> float:
        return pad + ELEMENT_H / 2 + r * row_gap

    parts: list[str] = []
    out_elements: list[dict[str, Any]] = []

    # --- loop connectors between consecutive elements, drawn first (under) --
    for i in range(len(placements) - 1):
        a, b = placements[i], placements[i + 1]
        ay, by = row_y(a["row"]), row_y(b["row"])
        ax = a["x0"] + a["w"] if a["direction"] >= 0 else a["x0"]
        bx = b["x0"] if b["direction"] >= 0 else b["x0"] + b["w"]
        lid = f"loop-{i}"
        if a["row"] == b["row"]:
            d = f"M {ax:.2f} {ay:.2f} L {bx:.2f} {by:.2f}"
            box = {
                "x": round(min(ax, bx), 2), "y": round(ay, 2),
                "width": round(abs(bx - ax), 2), "height": 0.0,
            }
        else:
            mid_y = (ay + by) / 2
            d = f"M {ax:.2f} {ay:.2f} L {ax:.2f} {mid_y:.2f} L {bx:.2f} {mid_y:.2f} L {bx:.2f} {by:.2f}"
            box = {
                "x": round(min(ax, bx), 2), "y": round(min(ay, by), 2),
                "width": round(abs(bx - ax), 2), "height": round(abs(by - ay), 2),
            }
        parts.append(f'<path data-pr-id="{lid}" d="{d}" stroke="{LOOP_COLOUR}" stroke-width="2.5" fill="none"/>')
        out_elements.append(
            {"id": lid, "kind": "decoration", "claim": f"the connecting loop from element {i} to {i + 1}", "declaredBox": box}
        )

    # --- every structured element -------------------------------------------
    for i, p in enumerate(placements):
        y = row_y(p["row"])
        eid = f"element-{i}"
        if p["type"] == "helix":
            svg, box = draw_helix(p["x0"], y, p["w"], p["label"])
        elif p["type"] == "sheet":
            svg, box = draw_sheet(p["x0"], y, p["w"], p["direction"], p["label"])
        else:
            raise ValueError(f"unknown element type {p['type']!r}; known: helix, sheet")
        parts.append(f'<g data-pr-id="{eid}">{svg}</g>')
        out_elements.append(
            {
                "id": eid,
                "kind": "feature",
                "claim": f"{p['label']}, a {p['type']} of {p['residues']} residues",
                "declaredBox": box,
            }
        )
        lid = f"{eid}-label"
        parts.append(
            f'<text data-pr-id="{lid}" x="{p["x0"] + p["w"] / 2:.2f}" y="{y:.2f}" text-anchor="middle" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="13" '
            f'font-weight="700" fill="{LABEL_COLOUR}">{p["label"]}</text>'
        )
        out_elements.append({"id": lid, "kind": "label", "owner": eid, "claim": f"names {eid} as {p['label']}"})

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w:.0f}" height="{canvas_h:.0f}" '
        f'viewBox="0 0 {canvas_w:.0f} {canvas_h:.0f}">'
        f'<rect x="0" y="0" width="{canvas_w:.0f}" height="{canvas_h:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {
        "svg": svg,
        "elements": out_elements,
        "notes": [f"{n_rows} row(s) for {len(placements)} element(s)"],
        "parameters": [
            {
                "name": "pad",
                "value": pad,
                "min": 30.0,
                "max": 100.0,
                "unit": "px",
                "description": "Canvas padding on all sides",
            },
            {
                "name": "row_gap",
                "value": row_gap,
                "min": 50.0,
                "max": 120.0,
                "unit": "px",
                "description": "Vertical spacing between rows",
            },
            {
                "name": "col_gap",
                "value": col_gap,
                "min": 16.0,
                "max": 60.0,
                "unit": "px",
                "description": "Horizontal spacing between elements in a row",
            },
        ],
    }


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "element-phantom", "kind": "feature", "claim": "an element that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "y": box["y"] + 20.0}
            break
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom element declared, and one real element's own geometry shifted 20px from what it drew"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    elements_arg = next((a for a in args if a.startswith("--elements=")), None)

    if elements_arg is not None:
        # "|" between elements, ":" between a element's own fields -- not
        # commas. Same CLI-layer comma-joining trap documented in
        # modules/dendrogram, modules/circuit and modules/genomic's MODULE.md.
        elements_in = []
        for token in elements_arg.split("=", 1)[1].split("|"):
            etype, residues, label = token.split(":")
            elements_in.append({"type": etype, "residues": int(residues), "label": label})
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        elements_in = NAMED[key]["elements"]
    else:
        elements_in = NAMED["four_helix_bundle"]["elements"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 620))
    height = float(request.get("height", 220))
    param_overrides = request.get("parameterOverrides")

    output = render(width, height, elements_in, param_overrides)
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
