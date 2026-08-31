"""Genomic sequence-feature figure module for Prancheta.

Gene arrows on a real base-pair axis -- a plasmid map, a locus diagram, an
operon -- where an arrow's direction encodes strand and its canvas position
is a faithful, checkable function of its declared bp range. See
docs/research/candidate-modules.md, candidate #5.

Why a module rather than a preset: the core's IR has no notion of a genomic
coordinate, and no way to pack overlapping annotations into non-colliding
rows. dna_features_viewer.compute_features_levels already solves exactly that
packing problem -- this module reuses its row assignment directly rather than
re-deriving one, and owns only the bp-to-canvas projection and the drawing.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from dna_features_viewer import GraphicFeature
from dna_features_viewer.compute_features_levels import compute_features_levels

BASELINE = "#3D4757"
TICK_COLOUR = "#9AA4B2"
LABEL_COLOUR = "#0F1115"
BG = "#0F1115"
COLOURS = ["#5B8DEF", "#E76F51", "#48A9A6", "#E9C46A", "#9D7BE8"]

NAMED: dict[str, dict[str, Any]] = {
    "plasmid_simple": {
        "length": 5400,
        "features": [
            {"start": 40, "end": 320, "strand": 1, "label": "ori"},
            {"start": 500, "end": 1400, "strand": 1, "label": "AmpR"},
            {"start": 1450, "end": 1520, "strand": 1, "label": "promoter"},
            {"start": 1520, "end": 2900, "strand": 1, "label": "GFP"},
            {"start": 2920, "end": 2990, "strand": -1, "label": "terminator"},
        ],
    },
    "operon": {
        "length": 4200,
        "features": [
            {"start": 100, "end": 260, "strand": 1, "label": "promoter"},
            {"start": 260, "end": 1400, "strand": 1, "label": "geneA"},
            {"start": 1380, "end": 2500, "strand": 1, "label": "geneB"},
            {"start": 2480, "end": 3200, "strand": 1, "label": "geneC"},
            {"start": 1900, "end": 2100, "strand": -1, "label": "regX"},
            {"start": 3220, "end": 3300, "strand": 1, "label": "terminator"},
        ],
    },
}


def label_placement(i, raw, raw_features, features, levels, sx, left, plot_w):
    """Where feature i's label goes: inside its arrow, beside it, or above it.

    Returns (mode, x, text-anchor). Called before the rows are sized, because
    the answer decides how tall a row has to be.

    A label centred inside a narrow feature -- a short promoter or terminator,
    a handful of bp wide -- overlaps its neighbours. No font engine here to
    measure the glyphs exactly, so this is a generous character-count estimate,
    not a declared claim -- but the decision it drives is then checked for real
    by module-labels-do-not-collide, -clear-of-strokes and
    -contrast-sufficient, so a wrong estimate shows up as a failed check rather
    than a silent overlap.

    THE ROOM BESIDE AN ARROW IS MEASURED TO THE NEXT FEATURE, NOT TO THE PLOT
    EDGE. An earlier version reasoned that "same-row features are guaranteed
    non-overlapping in x by compute_features_levels, so the gap past this
    feature's tip is real, checked free space" -- and then measured that gap as
    `plot_w - x1`, the distance to the edge. Those are not the same number. In
    the operon fixture they differ completely: promoter ends at 260 bp and
    geneA starts at 260 bp, so there is no gap at all, and "promoter" was drawn
    in its own blue directly on top of geneA's orange. It scored 1.04:1 --
    invisible -- and every check that existed before said the figure was fine,
    because a filled arrow has no stroke for module-labels-clear-of-strokes to
    test and the label collided with no other LABEL.
    """
    x0, x1 = sx(raw["start"]), sx(raw["end"])
    near, far = min(x0, x1), max(x0, x1)
    text_w_estimate = len(raw["label"]) * 7.4 + 6.0
    if far - near >= text_w_estimate:
        return ("inside", (x0 + x1) / 2, "middle")

    gap = 6.0
    level = levels[features[i]]
    same_row = [
        (min(sx(o["start"]), sx(o["end"])), max(sx(o["start"]), sx(o["end"])))
        for j, o in enumerate(raw_features)
        if j != i and levels[features[j]] == level
    ]
    right_limit = min([left + plot_w] + [lo for lo, _ in same_row if lo >= far])
    left_limit = max([left] + [hi for _, hi in same_row if hi <= near])
    if right_limit - far > text_w_estimate + gap:
        return ("beside", far + gap, "start")
    if near - left_limit > text_w_estimate + gap:
        return ("beside", near - gap, "end")
    # Neither side has room. The vertical slack is what is left, and the row
    # is grown to guarantee it. Placed level with the arrow was tried first and
    # is what put "promoter" on geneA; placed INSIDE a too-narrow arrow was
    # tried second and scored 1.00:1, because most of the glyphs missed the
    # arrow and landed on a background of their own colour.
    return ("band", (x0 + x1) / 2, "middle")


def render(width: float, height: float, length: int, raw_features: list[dict[str, Any]], param_overrides: dict[str, float] | None = None) -> dict[str, Any]:
    if length <= 0:
        raise ValueError("length must be positive")
    features = [
        GraphicFeature(start=f["start"], end=f["end"], strand=f["strand"], label=f["label"])
        for f in raw_features
    ]
    levels = compute_features_levels(features)  # dna_features_viewer's own row-packing
    max_level = max(levels.values()) if levels else 0

    # Adjustable parameters with defaults and bounds
    left = param_overrides.get("left_margin", 50.0) if param_overrides else 50.0
    right = param_overrides.get("right_margin", 30.0) if param_overrides else 30.0
    row_h = param_overrides.get("row_height", 40.0) if param_overrides else 40.0
    bottom_pad = 40.0
    plot_w = width - left - right
    arrow_h = 22.0

    def sx(bp: float) -> float:
        return left + bp / length * plot_w

    # --- where each label will go, decided BEFORE the rows are sized --------
    # A label with no horizontal room next to its own arrow goes in the band
    # above it, and that band has to exist: at the default 40px row an arrow
    # already takes 22, leaving too little for an 11px label to sit clear of
    # the arrow's own stroke geometry. So the row grows when -- and only when
    # -- some feature actually needs the band, the same way canvas_h already
    # grows to fit however many rows the packing produced. Sizing the layout
    # to its content is the lesson this repertoire has learned twice.
    placements = [label_placement(i, raw, raw_features, features, levels, sx, left, plot_w) for i, raw in enumerate(raw_features)]
    if any(p[0] == "band" for p in placements):
        row_h = max(row_h, arrow_h + 30.0)
    top = 30.0 + (max_level + 1) * row_h
    baseline_y = top

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    # --- the sequence baseline, with real bp-coordinate ticks ---------------
    parts.append(
        f'<line data-pr-id="baseline" x1="{left:.2f}" y1="{baseline_y:.2f}" x2="{left + plot_w:.2f}" '
        f'y2="{baseline_y:.2f}" stroke="{BASELINE}" stroke-width="2"/>'
    )
    elements.append(
        {
            "id": "baseline",
            "kind": "decoration",
            "claim": f"the sequence, 0 to {length} bp",
            "declaredBox": {"x": round(left, 2), "y": round(baseline_y, 2), "width": round(plot_w, 2), "height": 0.0},
        }
    )
    n_ticks = 6
    for i in range(n_ticks + 1):
        bp = round(length * i / n_ticks)
        tx = sx(bp)
        ty = baseline_y + bottom_pad - 22
        parts.append(f'<path d="M {tx:.2f} {baseline_y:.2f} L {tx:.2f} {baseline_y + 5:.2f}" stroke="{BASELINE}" stroke-width="1.5"/>')
        tick_id = f"tick-{i}"
        parts.append(
            f'<text data-pr-id="{tick_id}" x="{tx:.2f}" y="{ty + 22:.2f}" text-anchor="middle" '
            f'font-family="Segoe UI, sans-serif" font-size="11" fill="{TICK_COLOUR}">{bp}</text>'
        )
        elements.append({"id": tick_id, "kind": "label", "claim": f"the coordinate {bp} bp"})

    # --- every feature, as a strand-facing arrow at its packed row ----------
    for i, (feature, raw) in enumerate(zip(features, raw_features)):
        level = levels[feature]
        cy = top - (level + 0.5) * row_h + row_h * 0.15
        x0, x1 = sx(raw["start"]), sx(raw["end"])
        h = arrow_h
        tip = min(14.0, (x1 - x0) * 0.4)
        colour = COLOURS[i % len(COLOURS)]
        fid = f"feature-{i}"
        if raw["strand"] >= 0:
            body_end = x1 - tip
            d = (
                f"M {x0:.2f} {cy - h / 2:.2f} L {body_end:.2f} {cy - h / 2:.2f} "
                f"L {x1:.2f} {cy:.2f} L {body_end:.2f} {cy + h / 2:.2f} "
                f"L {x0:.2f} {cy + h / 2:.2f} Z"
            )
        else:
            body_start = x0 + tip
            d = (
                f"M {x1:.2f} {cy - h / 2:.2f} L {body_start:.2f} {cy - h / 2:.2f} "
                f"L {x0:.2f} {cy:.2f} L {body_start:.2f} {cy + h / 2:.2f} "
                f"L {x1:.2f} {cy + h / 2:.2f} Z"
            )
        parts.append(f'<path data-pr-id="{fid}" d="{d}" fill="{colour}"/>')
        elements.append(
            {
                "id": fid,
                "kind": "feature",
                "claim": f"{raw['label']}, {raw['start']}-{raw['end']} bp, {'+' if raw['strand'] >= 0 else '-'} strand",
                "declaredBox": {
                    "x": round(min(x0, x1), 2),
                    "y": round(cy - h / 2, 2),
                    "width": round(abs(x1 - x0), 2),
                    "height": round(h, 2),
                },
            }
        )
        lid = f"{fid}-label"
        # A label centred inside a narrow feature (a short promoter or
        # terminator, a handful of bp wide) overlaps its neighbours -- this is
        # the defect a user reported from a real render (promoter/GFP/term
        # running together in modules/genomic's own plasmid_simple output).
        # No font engine here to measure the glyphs exactly, so this is a
        # generous character-count estimate, not a declared claim -- but the
        # decision it drives (inside vs. outside placement) is then checked
        # for real by module-labels-do-not-collide / -clear-of-strokes below,
        # so a wrong estimate shows up as a failed check rather than a silent
        # overlap.
        mode, label_x, anchor = placements[i]
        if mode == "inside":
            parts.append(
                f'<text data-pr-id="{lid}" x="{label_x:.2f}" y="{cy:.2f}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="12" '
                f'font-weight="600" fill="{LABEL_COLOUR}">{raw["label"]}</text>'
            )
            elements.append({"id": lid, "kind": "label", "owner": fid, "claim": f"names {fid} as {raw['label']}"})
        else:
            # Outside the arrow, in the feature's own colour rather than the
            # inside label's near-black -- reads as a callout, not a mis-set
            # fill, and it is the colour that is legible on the background.
            # No owner: it no longer claims to sit inside the feature it names.
            label_y = cy if mode == "beside" else cy - arrow_h / 2 - 11.0
            parts.append(
                f'<text data-pr-id="{lid}" x="{label_x:.2f}" y="{label_y:.2f}" text-anchor="{anchor}" '
                f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="11" '
                f'font-weight="600" fill="{colour}">{raw["label"]}</text>'
            )
            elements.append({"id": lid, "kind": "label", "claim": f"names {fid} as {raw['label']}"})

    canvas_h = max(height, top + bottom_pad)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{canvas_h:.0f}" '
        f'viewBox="0 0 {width:.0f} {canvas_h:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{canvas_h:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {
        "svg": svg,
        "elements": elements,
        "notes": [f"{int(max_level) + 1} row(s) used for {len(features)} feature(s)"],
        "parameters": [
            {
                "name": "left_margin",
                "value": left,
                "min": 30.0,
                "max": 80.0,
                "unit": "px",
                "description": "Left margin for the sequence plot",
            },
            {
                "name": "right_margin",
                "value": right,
                "min": 20.0,
                "max": 60.0,
                "unit": "px",
                "description": "Right margin for the sequence plot",
            },
            {
                "name": "row_height",
                "value": row_h,
                "min": 30.0,
                "max": 60.0,
                "unit": "px",
                "description": "Height of each feature row",
            },
        ],
    }


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "feature-phantom", "kind": "feature", "claim": "a feature that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "x": box["x"] + 45.0}
            break
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom feature declared, and one real feature's own geometry shifted 45px from what it drew"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    length_arg = next((a for a in args if a.startswith("--length=")), None)
    features_arg = next((a for a in args if a.startswith("--features=")), None)

    if features_arg is not None:
        # "|" between features, ":" between a feature's start/end/strand/label
        # -- not commas. Same CLI-layer comma-joining trap documented in
        # modules/dendrogram/MODULE.md.
        length = int(length_arg.split("=", 1)[1]) if length_arg else 3000
        raw_features = []
        for token in features_arg.split("=", 1)[1].split("|"):
            start, end, strand, label = token.split(":")
            raw_features.append({"start": int(start), "end": int(end), "strand": int(strand), "label": label})
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        length, raw_features = NAMED[key]["length"], NAMED[key]["features"]
    else:
        length, raw_features = NAMED["plasmid_simple"]["length"], NAMED["plasmid_simple"]["features"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 820))
    height = float(request.get("height", 260))
    param_overrides = request.get("parameterOverrides")

    output = render(width, height, length, raw_features, param_overrides)
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
