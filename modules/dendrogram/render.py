"""Dendrogram figure module for Prancheta.

A hierarchical clustering tree where branch length IS the data -- the merge
distance scipy's own linkage algorithm computed, not a depth count. This is
the one tree shape modules/mindmap can't honestly serve: mindmap's radial
layout is keyed to depth, and depth is not distance. See
docs/research/candidate-modules.md, candidate #2.

Why a module rather than a preset: the core's IR has no notion of a distance
metric, no clustering algorithm, and nothing that could compute where a merge
"really" belongs on a distance axis. scipy.cluster.hierarchy.linkage does that
work, and scipy.cluster.hierarchy.dendrogram already lays out every link's
exact (x, y) trace -- this module's job is projecting that trace onto a
canvas, not inventing a layout of its own.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.
"""

from __future__ import annotations

import json
import sys
from typing import Any

import numpy as np
from scipy.cluster.hierarchy import dendrogram, linkage

STROKE = "#5B8DEF"
LEAF_COLOUR = "#E6E9EF"
AXIS_COLOUR = "#3D4757"
TICK_COLOUR = "#9AA4B2"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "cluster_demo": {
        "labels": ["A", "B", "C", "D", "E", "F", "G", "H"],
        "data": [
            [0.2, 0.9], [0.6, 1.1], [0.4, 0.6],
            [8.1, 8.4], [8.6, 7.9],
            [4.3, 0.5], [4.8, 0.9], [4.5, 0.2],
        ],
        "method": "average",
    },
    "species_traits": {
        # [legs/4, has_fur, has_feathers, lays_eggs, lives_in_water] -- a toy
        # trait matrix, not a real phylogenetic dataset. Illustrates that this
        # module draws whatever distance structure the data implies; it does
        # not know or check what "correct" taxonomy looks like.
        "labels": ["Dog", "Cat", "Wolf", "Sparrow", "Eagle", "Salmon", "Shark", "Human"],
        "data": [
            [1.0, 1, 0, 0, 0],
            [1.0, 1, 0, 0, 0],
            [1.0, 1, 0, 0, 0],
            [0.5, 0, 1, 1, 0],
            [0.5, 0, 1, 1, 0],
            [0.0, 0, 0, 1, 1],
            [0.0, 0, 0, 0, 1],
            [0.5, 1, 0, 0, 0],
        ],
        "method": "average",
    },
}


def render(width: float, height: float, labels: list[str], data: list[list[float]], method: str) -> dict[str, Any]:
    if len(labels) != len(data):
        raise ValueError(f"{len(labels)} labels but {len(data)} data rows")
    if len(labels) < 2:
        raise ValueError("need at least 2 leaves to cluster")

    matrix = np.array(data, dtype=float)
    z = linkage(matrix, method=method)
    d = dendrogram(z, labels=labels, no_plot=True)
    icoord: list[list[float]] = d["icoord"]
    dcoord: list[list[float]] = d["dcoord"]
    ivl: list[str] = d["ivl"]

    left, right, top, bottom = 90.0, 24.0, 20.0, 50.0
    plot_w, plot_h = width - left - right, height - top - bottom

    leaf_x_max = max(x for link in icoord for x in link)
    dist_max = max(y for link in dcoord for y in link)
    dist_max = dist_max if dist_max > 0 else 1.0

    def sx(x: float) -> float:
        return left + x / leaf_x_max * plot_w

    def sy(dist: float) -> float:
        return top + plot_h - dist / dist_max * plot_h

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    # --- distance axis, left, with a handful of computed tick values -------
    parts.append(
        f'<path data-pr-id="axis-distance" d="M {left:.2f} {top:.2f} L {left:.2f} {top + plot_h:.2f}" '
        f'stroke="{AXIS_COLOUR}" stroke-width="1.5" fill="none"/>'
    )
    elements.append({"id": "axis-distance", "kind": "decoration", "claim": "the merge-distance axis"})
    n_ticks = 5
    for i in range(n_ticks + 1):
        dist = dist_max * i / n_ticks
        ty = sy(dist)
        parts.append(
            f'<path d="M {left - 5:.2f} {ty:.2f} L {left:.2f} {ty:.2f}" stroke="{AXIS_COLOUR}" stroke-width="1.5"/>'
        )
        tick_id = f"tick-{i}"
        parts.append(
            f'<text data-pr-id="{tick_id}" x="{left - 10:.2f}" y="{ty:.2f}" text-anchor="end" '
            f'dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="11" '
            f'fill="{TICK_COLOUR}">{dist:.2f}</text>'
        )
        elements.append({"id": tick_id, "kind": "label", "claim": f"distance tick at {dist:.3f}"})

    # --- every merge, as one U-shaped link -----------------------------------
    # This is the check with real teeth: icoord/dcoord are scipy's own
    # computed layout, not this module's invention, so the declared box is a
    # claim about coordinates this module did not choose -- exactly the
    # "internal model drifted from what it drew" case decision 0005 targets.
    for i, (xs, ys) in enumerate(zip(icoord, dcoord)):
        link_id = f"link-{i}"
        pts = list(zip(xs, ys))
        path_d = "M " + " L ".join(f"{sx(x):.2f} {sy(y):.2f}" for x, y in pts)
        parts.append(f'<path data-pr-id="{link_id}" d="{path_d}" stroke="{STROKE}" stroke-width="2" fill="none"/>')
        cxs = [sx(x) for x, _ in pts]
        cys = [sy(y) for _, y in pts]
        elements.append(
            {
                "id": link_id,
                "kind": "feature",
                "claim": f"a cluster merge at distance {max(y for _, y in pts):.4f}",
                "declaredBox": {
                    "x": round(min(cxs), 2),
                    "y": round(min(cys), 2),
                    "width": round(max(cxs) - min(cxs), 2),
                    "height": round(max(cys) - min(cys), 2),
                },
            }
        )

    # --- leaves, in the order the clustering actually placed them -----------
    leaf_y = top + plot_h
    for i, name in enumerate(ivl):
        leaf_x = 5.0 + i * 10.0
        cx = sx(leaf_x)
        lid = f"leaf-{i}"
        parts.append(
            f'<text data-pr-id="{lid}" x="{cx:.2f}" y="{leaf_y + 16:.2f}" text-anchor="middle" '
            f'font-family="Segoe UI, sans-serif" font-size="13" fill="{LEAF_COLOUR}">{name}</text>'
        )
        elements.append({"id": lid, "kind": "label", "claim": f"names leaf {name!r}"})

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    return {"svg": svg, "elements": elements, "notes": [f"leaf order: {', '.join(ivl)}"]}


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "link-phantom", "kind": "feature", "claim": "a merge that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "y": box["y"] - 30.0}
            break
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom merge declared, and one real merge's own geometry shifted 30px from what it drew"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    labels_arg = next((a for a in args if a.startswith("--labels=")), None)
    data_arg = next((a for a in args if a.startswith("--data=")), None)
    method_arg = next((a for a in args if a.startswith("--method=")), None)

    if labels_arg is not None and data_arg is not None:
        # ";" between labels/rows, ":" between numbers within a row -- NOT
        # commas. node src/cli.ts module's own --args flag is itself
        # comma-joined (one shell string split into argv by comma), so a
        # comma inside an argument value here breaks silently upstream of
        # this script ever running, at the CLI layer.
        labels = labels_arg.split("=", 1)[1].split(";")
        data = [[float(v) for v in row.split(":")] for row in data_arg.split("=", 1)[1].split(";")]
        method = method_arg.split("=", 1)[1] if method_arg else "average"
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        spec = NAMED[key]
        labels, data, method = spec["labels"], spec["data"], spec["method"]
    else:
        spec = NAMED["cluster_demo"]
        labels, data, method = spec["labels"], spec["data"], spec["method"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 760))
    height = float(request.get("height", 420))

    output = render(width, height, labels, data, method)
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
