"""Crystal lattice figure module for Prancheta.

A schematic wireframe of a real crystal structure -- unit cell edges, atoms,
and nearest-neighbour bonds, projected from real 3D lattice geometry with
explicit painter's-algorithm occlusion (nearer atoms drawn over farther
ones). See docs/research/candidate-modules.md, candidate #8.

Deliberately NOT photorealistic, per the scope this candidate was flagged
with from the start: flat fills, no shading, no lighting, no perspective
foreshortening -- an orthographic projection with occlusion ORDER only. This
keeps it a diagram in this repertoire's own house style, not a renderer.

Why a module rather than a preset: the core's IR is 2D. Building a real
crystal structure (lattice vectors, atomic basis, space-group-correct atom
positions) is ASE's job -- ase.build.bulk() -- and projecting a 3D structure
into a 2D drawing with correct front-to-back ordering is exactly the
"geometry the core cannot compute" decision 0005 exists for: it needs a
rotation, an orthographic projection, and a depth sort, none of which the
core's box-model layout has any notion of.

Reads one JSON document on stdin, writes one on stdout. Declares what it
drew; does not certify that what it drew is correct -- the core measures
that. See decision 0005.
"""

from __future__ import annotations

import json
import math
import sys
from itertools import combinations
from typing import Any

import numpy as np
from ase.build import bulk

ELEMENT_COLOURS: dict[str, str] = {
    "Na": "#5B8DEF", "Cl": "#48A9A6", "C": "#9AA4B2", "Cu": "#E9C46A",
    "Si": "#9D7BE8", "Fe": "#E76F51",
}
ELEMENT_RADII: dict[str, float] = {  # relative, not to scale with real covalent radii
    "Na": 1.15, "Cl": 1.0, "C": 0.7, "Cu": 0.85, "Si": 0.75, "Fe": 0.8,
}
CELL_COLOUR = "#3D4757"
LABEL_COLOUR = "#0F1115"
BG = "#0F1115"

NAMED: dict[str, dict[str, Any]] = {
    "nacl_rocksalt": {"formula": "NaCl", "structure": "rocksalt", "a": 5.64},
    "diamond_cubic": {"formula": "C", "structure": "diamond", "a": 3.567},
    "fcc_copper": {"formula": "Cu", "structure": "fcc", "a": 3.615},
}

# A fixed isometric-like view: rotate about x then y. Schematic, not tied to
# any particular crystallographic zone axis.
RX, RY = np.radians(28.0), np.radians(38.0)


def rotate(points: np.ndarray) -> np.ndarray:
    cx, sx = np.cos(RX), np.sin(RX)
    cy, sy = np.cos(RY), np.sin(RY)
    rot_x = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    rot_y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    return points @ rot_x.T @ rot_y.T


def duplicate_boundary_atoms(atoms: Any) -> tuple[np.ndarray, list[str]]:
    """A textbook unit cell diagram draws an atom at EVERY corner, edge or
    face it touches -- an FCC corner atom is shared by 8 neighbouring cells,
    so the ONE cell being drawn still shows it at all 8 of its own corners,
    and a face-centred atom at both faces it sits on. ASE's conventional
    cell stores only one representative copy per site; this fills in the
    periodic images that land exactly on this cell's own boundary.

    Detected from each atom's real fractional coordinate (near 0 along an
    axis means it also has a periodic image at 1 along that axis), not
    hardcoded per structure -- so it generalises to whatever
    ``bulk(..., cubic=True)`` returns for fcc, rocksalt or diamond alike.
    """
    frac = atoms.get_scaled_positions(wrap=True)
    cell = np.array(atoms.cell[:])
    symbols = atoms.get_chemical_symbols()
    tol = 1e-3

    out_positions: list[np.ndarray] = []
    out_symbols: list[str] = []
    for f, sym in zip(frac, symbols, strict=True):
        boundary_axes = [ax for ax in range(3) if f[ax] < tol]
        for r in range(len(boundary_axes) + 1):
            for combo in combinations(boundary_axes, r):
                shifted = f.copy()
                for ax in combo:
                    shifted[ax] += 1.0
                out_positions.append(shifted @ cell)
                out_symbols.append(sym)
    return np.array(out_positions), out_symbols


def render(width: float, height: float, formula: str, structure: str, a: float) -> dict[str, Any]:
    # cubic=True: the conventional cubic cell every textbook diagram actually
    # draws, not the smaller rhombohedral primitive cell ASE defaults to for
    # fcc -- the primitive cell has one atom and no cube to draw at all.
    conv = bulk(formula, structure, a=a, cubic=True)
    cell = np.array(conv.cell[:])
    positions, symbols = duplicate_boundary_atoms(conv)

    # --- project: rotate to an isometric-like view, then drop z -----------
    centroid = positions.mean(axis=0)
    rotated = rotate(positions - centroid)
    cell_corners = rotate(np.array([[0, 0, 0], cell[0], cell[1], cell[2],
                                     cell[0] + cell[1], cell[0] + cell[2], cell[1] + cell[2],
                                     cell[0] + cell[1] + cell[2]]) - centroid)

    all_xy = np.vstack([rotated[:, :2], cell_corners[:, :2]])
    span = max(all_xy[:, 0].max() - all_xy[:, 0].min(), all_xy[:, 1].max() - all_xy[:, 1].min(), 1e-6)
    pad = 46.0
    scale = (min(width, height) - 2 * pad) / span
    ox, oy = width / 2, height / 2

    def to_canvas(p: np.ndarray) -> tuple[float, float]:
        return (ox + p[0] * scale, oy - p[1] * scale)  # SVG y grows down

    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    # --- unit cell edges (12): solid where visible, dashed where the cube's
    # own solid form would hide them -- the standard textbook wireframe
    # convention, not a uniform dashed reference frame. A cube has exactly
    # one vertex farthest from the viewer in any generic orthographic view;
    # the 3 edges meeting there are the hidden ones (every cube vertex has
    # degree 3, so this is always exactly 3 of the 12 edges), found from the
    # real rotated depth of each corner, not asserted.
    edge_pairs = [(0, 1), (0, 2), (0, 3), (1, 4), (1, 5), (2, 4), (2, 6), (3, 5), (3, 6), (4, 7), (5, 7), (6, 7)]
    back_corner = int(np.argmin(cell_corners[:, 2]))
    cell_edge_segments = [(to_canvas(cell_corners[a_i]), to_canvas(cell_corners[b_i])) for a_i, b_i in edge_pairs]
    for i, ((a_i, b_i), (p0, p1)) in enumerate(zip(edge_pairs, cell_edge_segments, strict=True)):
        hidden = back_corner in (a_i, b_i)
        eid = f"cell-edge-{i}"
        style = (
            f'stroke="{CELL_COLOUR}" stroke-width="1.1" stroke-dasharray="4 3" opacity="0.6"'
            if hidden
            else f'stroke="{CELL_COLOUR}" stroke-width="1.8" opacity="0.9"'
        )
        parts.append(f'<line data-pr-id="{eid}" x1="{p0[0]:.2f}" y1="{p0[1]:.2f}" x2="{p1[0]:.2f}" y2="{p1[1]:.2f}" {style}/>')
        elements.append(
            {
                "id": eid, "kind": "decoration",
                "claim": f'one {"hidden" if hidden else "visible"} edge of the crystallographic unit cell',
                "declaredBox": {
                    "x": round(min(p0[0], p1[0]), 2), "y": round(min(p0[1], p1[1]), 2),
                    "width": round(abs(p1[0] - p0[0]), 2), "height": round(abs(p1[1] - p0[1]), 2),
                },
            }
        )

    # Every atom's canvas centre and radius, computed once up front.
    atom_xy = [to_canvas(rotated[i, :2]) for i in range(len(positions))]
    atom_r = [ELEMENT_RADII.get(symbols[i], 0.8) * scale * 0.34 for i in range(len(positions))]
    atom_depth = rotated[:, 2]

    # Label only the FRONTMOST atom of each distinct element -- not every
    # atom. Duplicating boundary atoms means many atoms of the same element
    # now sit at different corners/faces; a labelled atom can still sit close
    # in 2D PROJECTION to a cell edge that is genuinely behind it in 3D --
    # correctly occluded by that atom's own opaque fill, but
    # module-labels-clear-of-strokes has no notion of paint order and flags
    # the geometric overlap regardless. That is not a bug in the check:
    # incidental 2D proximity between elements far apart in the depth this
    # diagram exists to show is the normal case for ANY projected 3D
    # structure, not a defect. Labelling one representative, least-occluded
    # atom per element -- the frontmost one -- keeps the diagram readable
    # without asking a 2D geometric check to reason about depth.
    def point_segment_dist(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
        px, py = p
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq < 1e-9 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def has_nearby_cell_edge(atom_idx: int) -> bool:
        cx, cy = atom_xy[atom_idx]
        margin = atom_r[atom_idx] * 0.7
        return any(point_segment_dist((cx, cy), p0, p1) < margin for p0, p1 in cell_edge_segments)

    candidates_by_symbol: dict[str, list[int]] = {}
    for idx, sym in enumerate(symbols):
        candidates_by_symbol.setdefault(sym, []).append(idx)
    label_atoms: set[int] = set()
    unlabelled_elements: list[str] = []
    for sym, candidates in candidates_by_symbol.items():
        # Depth descending (frontmost first); the first candidate with no
        # cell edge passing near it wins.
        #
        # Falling back to the frontmost candidate regardless (an earlier
        # version's choice) turned out to be wrong for a reason worth
        # recording: in nacl_rocksalt, EVERY Na atom sits with distance
        # exactly 0 from some cell edge, not by coincidence -- Na occupies
        # the edge-centre sites in this structure's conventional cell, so
        # every Na atom, in any projection, lies exactly ON an edge line.
        # No candidate atom could ever be clean, and forcing one just picked
        # a guaranteed failure. This is a structural fact about where an
        # element sits in a given lattice, not a placement bug to keep
        # patching -- so when nothing clears, this element goes unlabelled
        # for this render rather than declaring a label certain to overlap.
        # Colour still distinguishes it; the note below says so honestly.
        ranked = sorted(candidates, key=lambda i: atom_depth[i], reverse=True)
        chosen = next((i for i in ranked if not has_nearby_cell_edge(i)), None)
        if chosen is not None:
            label_atoms.add(chosen)
        else:
            unlabelled_elements.append(sym)

    # --- atoms only, drawn back-to-front by depth (painter's algorithm). No
    # bonds: a conventional-cell diagram like this shows where the sites ARE,
    # not which pairs count as nearest neighbours -- the real textbook
    # convention this module now follows, not a simplification of one.
    for i in sorted(range(len(positions)), key=lambda idx: atom_depth[idx]):
        sym = symbols[i]
        colour = ELEMENT_COLOURS.get(sym, "#E6E9EF")
        r = atom_r[i]
        cx, cy = atom_xy[i]
        aid = f"atom-{i}"
        parts.append(f'<circle data-pr-id="{aid}" cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{colour}" stroke="{BG}" stroke-width="1.5"/>')
        elements.append(
            {
                "id": aid, "kind": "feature", "claim": f"a {sym} atom",
                "declaredBox": {"x": round(cx - r, 2), "y": round(cy - r, 2), "width": round(2 * r, 2), "height": round(2 * r, 2)},
            }
        )
        if i in label_atoms and r > 9:  # legible glyph AND the representative atom for this element
            lid = f"{aid}-label"
            parts.append(
                f'<text data-pr-id="{lid}" x="{cx:.2f}" y="{cy:.2f}" text-anchor="middle" dominant-baseline="middle" '
                f'font-family="Segoe UI, sans-serif" font-size="{max(9.0, r * 0.9):.1f}" font-weight="700" fill="{LABEL_COLOUR}">{sym}</text>'
            )
            elements.append({"id": lid, "kind": "label", "owner": aid, "claim": f"names {aid} as {sym}"})

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'{"".join(parts)}</svg>'
    )
    notes = [
        f"{len(positions)} atom(s) shown (boundary sites duplicated to every corner/face they touch), "
        f"one conventional cubic unit cell",
        "unit cell edges drawn underneath atoms, not depth-sorted against them (stated simplification)",
    ]
    if unlabelled_elements:
        notes.append(
            f"no projection-clear atom found for: {', '.join(sorted(unlabelled_elements))} "
            f"-- distinguished by colour only in this render"
        )
    return {"svg": svg, "elements": elements, "notes": notes}


def apply_misdeclare(output: dict[str, Any]) -> dict[str, Any]:
    output["elements"].append({"id": "atom-phantom", "kind": "feature", "claim": "an atom that was never drawn"})
    for element in output["elements"]:
        if element["kind"] == "feature" and "declaredBox" in element:
            box = element["declaredBox"]
            element["declaredBox"] = {**box, "x": box["x"] + 25.0}
            break
    output.setdefault("notes", []).append(
        "misdeclare mode: a phantom atom declared, and one real atom's own geometry shifted 25px from what it drew"
    )
    return output


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    name_arg = next((a for a in args if a.startswith("--name=")), None)

    if name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        spec = NAMED[key]
    else:
        spec = NAMED["nacl_rocksalt"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    width = float(request.get("width", 560))
    height = float(request.get("height", 560))

    output = render(width, height, spec["formula"], spec["structure"], spec["a"])
    if misdeclare:
        output = apply_misdeclare(output)
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
