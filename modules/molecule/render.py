"""Molecule figure module for Prancheta.

Reads one JSON document on stdin ({"width": ..., "height": ...}), writes one on
stdout. It computes geometry the TypeScript core cannot: a 2D chemical
depiction, via RDKit's coordinate generator and its wedge/dash stereo
perception. That is chemistry-native work — bond conventions, valence,
stereocentre wedging — the same reasoning that put the map module (projection,
point-in-polygon) on the far side of a process boundary in decision 0001.

The module declares WHAT IT DREW: every bond as a decoration with a real,
computed bounding box, every heteroatom label as a label with no owner (text
metrics need a font engine, which this process does not have — see
modules/map/render.py's identical reasoning). It does not certify that what it
drew is correct: the core measures the geometry itself. See decision 0005.

Run with ``--misdeclare`` to declare a bond that was never drawn and to lie
about another bond's own geometry, on purpose, and watch the core catch both.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from rdkit import Chem
from rdkit.Chem import AllChem

# The font this figure's text is set in.
#
# Handed down by the core with the canvas size, because the core is what
# MEASURES the result and the two have to agree about which glyphs were drawn.
# The default is only for running this script by hand; a real invocation always
# supplies it. See src/modules/protocol.ts.
FONT_STACK = "Segoe UI, sans-serif"

# A handful of named molecules so a request needs no SMILES literacy. Anything
# else is accepted straight through --smiles=<SMILES>, which is the general
# case: this module draws whatever valid SMILES it is given.
NAMED: dict[str, str] = {
    "glucose": "OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O",
    "fructose": "OC[C@H]1O[C@](O)(CO)[C@@H](O)[C@@H]1O",
    "sucrose": "OC[C@H]1O[C@@](CO)(O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@@H](O)[C@@H]1O",
    "caffeine": "Cn1cnc2c1c(=O)n(C)c(=O)n2C",
    "aspirin": "CC(=O)Oc1ccccc1C(=O)O",
    "water": "O",
    "ethanol": "CCO",
    "benzene": "c1ccccc1",
}

SUBSCRIPT = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")

BOND_STROKE = "#E6E9EF"
LABEL_FILL = "#E6E9EF"
BG = "#0F1115"
TRIM_PX = 11.0  # base clearance a bond keeps from a labelled atom; see trim_for()
LABEL_FONT_PX = 15.0  # must match the font-size the atom labels are drawn at
GAP = 3.2  # perpendicular offset between the two strokes of a double bond
WEDGE_WIDTH = 6.5  # half-width at the wide end of a stereo wedge/dash


def atom_label(atom: "Chem.Atom") -> str | None:
    symbol = atom.GetSymbol()
    if symbol == "C" and atom.GetFormalCharge() == 0:
        return None
    hcount = atom.GetTotalNumHs()
    charge = atom.GetFormalCharge()
    # A free water molecule is conventionally "H2O", H-first, not "OH2" --
    # the one atom-labelling exception worth hard-coding rather than
    # deriving, because it shows up constantly in reaction schemes.
    if symbol == "O" and hcount == 2 and atom.GetDegree() == 0 and charge == 0:
        return f"H{'2'.translate(SUBSCRIPT)}O"
    text = symbol if hcount == 0 else f"{symbol}H{str(hcount).translate(SUBSCRIPT) if hcount > 1 else ''}"
    if charge > 0:
        text += "+" if charge == 1 else f"{charge}+"
    elif charge < 0:
        text += "-" if charge == -1 else f"{-charge}-"
    return text


def render(width: float, height: float, smiles: str, misdeclare: bool) -> dict[str, Any]:
    # removeHs=False: RDKit's default silently strips explicit hydrogen atoms
    # back into implicit ones on parse, which is invisible for a normal SMILES
    # (nothing was explicit to begin with) but means a caller who deliberately
    # wrote a molecule OUT with explicit H atoms -- modules/reaction does this
    # for a bare, unconnected atom like water or methane, which otherwise has
    # no bond to draw at all -- would silently get them stripped right back
    # out, undoing the whole point.
    parser_params = Chem.SmilesParserParams()
    parser_params.removeHs = False
    mol = Chem.MolFromSmiles(smiles, parser_params)
    if mol is None:
        raise ValueError(f"not a valid SMILES string: {smiles!r}")
    Chem.Kekulize(mol, clearAromaticFlags=True)
    AllChem.Compute2DCoords(mol)
    Chem.WedgeMolBonds(mol, mol.GetConformer())

    conf = mol.GetConformer()
    raw = [(conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y) for i in range(mol.GetNumAtoms())]
    labels = {i: atom_label(mol.GetAtomWithIdx(i)) for i in range(mol.GetNumAtoms())}

    pad = 36.0
    minx = min(x for x, _ in raw)
    maxx = max(x for x, _ in raw)
    miny = min(y for _, y in raw)
    maxy = max(y for _, y in raw)
    span_x = max(maxx - minx, 1e-6)
    span_y = max(maxy - miny, 1e-6)
    scale = min((width - 2 * pad) / span_x, (height - 2 * pad) / span_y)
    # Centre the molecule rather than pin it to one corner when its aspect
    # ratio doesn't match the canvas.
    drawn_w, drawn_h = span_x * scale, span_y * scale
    ox = (width - drawn_w) / 2 - minx * scale
    oy = height - (height - drawn_h) / 2 + miny * scale  # SVG y grows down, RDKit y grows up

    def to_canvas(x: float, y: float) -> tuple[float, float]:
        return (x * scale + ox, -y * scale + oy)

    points = [to_canvas(x, y) for x, y in raw]

    def bbox(coords: list[tuple[float, float]]) -> dict[str, float]:
        # No stroke padding: getBoundingClientRect on an SVG <line>/<g>/
        # <polygon> in Chromium returns the geometric extent of the path data,
        # not a paint box widened by stroke-width. Adding padding here made
        # every declared box larger than what was actually measured and
        # module-geometry-agrees failed on all twelve bonds until this was
        # verified with a standalone probe rather than assumed.
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        return {
            "x": round(min(xs), 2),
            "y": round(min(ys), 2),
            "width": round(max(xs) - min(xs), 2),
            "height": round(max(ys) - min(ys), 2),
        }

    def trim_for(idx: int, ux: float, uy: float) -> float:
        """How far a bond retreats from atom `idx`, along the bond's own direction.

        DIRECTIONAL, because a label is not a circle. "OH" is about twice as
        wide as it is tall, so a bond arriving horizontally has to clear
        roughly a whole character more than one arriving vertically, and a
        single retreat distance cannot be right for both.

        This replaced a flat TRIM_PX with a 1.4x special case for one-character
        labels. That constant was measured against Segoe UI on one machine, and
        when the core started measuring every module against the bundled font
        instead -- because Segoe UI is proprietary and absent from CI -- the
        wider face put sucrose's own "OH" back on top of the bond it labels.
        Tuning the constant again would only move the problem to the next face;
        deriving the retreat from the label's own extent does not.

        The extent is estimated, not measured: this process has no font engine,
        which is why it declares no box for any label. Generous on purpose --
        over-retreating leaves a visible gap, under-retreating puts a glyph on
        a line, and only one of those is a defect.
        """
        label = labels[idx]
        if label is None:
            return 0.0
        half_width = len(label) * LABEL_FONT_PX * 0.34
        half_height = LABEL_FONT_PX * 0.42
        return abs(ux) * half_width + abs(uy) * half_height + TRIM_PX * 0.45

    def trimmed(a: int, b: int) -> tuple[tuple[float, float], tuple[float, float]]:
        """The segment for bond a->b, retreating from either end that carries a label."""
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
        ux, uy = dx / length, dy / length
        ta, tb = trim_for(a, ux, uy), trim_for(b, ux, uy)
        p0 = (ax + ux * ta, ay + uy * ta) if labels[a] else (ax, ay)
        p1 = (bx - ux * tb, by - uy * tb) if labels[b] else (bx, by)
        return p0, p1

    svg_parts: list[str] = []
    elements: list[dict[str, Any]] = []
    notes: list[str] = []

    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        bond_id = f"bond-{bond.GetIdx()}"
        (x0, y0), (x1, y1) = trimmed(i, j)
        direction = bond.GetBondDir()
        order = bond.GetBondTypeAsDouble()

        if direction in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH):
            dx, dy = x1 - x0, y1 - y0
            length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
            px, py = -dy / length * WEDGE_WIDTH, dx / length * WEDGE_WIDTH
            if direction == Chem.BondDir.BEGINWEDGE:
                svg_parts.append(
                    f'<polygon data-pr-id="{bond_id}" points="{x0:.2f},{y0:.2f} '
                    f'{x1 + px:.2f},{y1 + py:.2f} {x1 - px:.2f},{y1 - py:.2f}" fill="{BOND_STROKE}"/>'
                )
                # Same tip rule as the dash branch: the fill triangle's own
                # apex IS at (x0, y0), so it belongs in the bbox here.
                coords = [(x0, y0), (x1 + px, y1 + py), (x1 - px, y1 - py)]
            else:
                # Dashed wedge: a handful of hash marks, narrow to wide. The
                # tip (x0, y0) is never itself drawn -- only the hash marks
                # are -- so it must NOT seed the declared bbox. It did in an
                # earlier version and module-geometry-agrees caught it: up to
                # 22px of bbox that no pixel of the figure actually occupies.
                steps = 6
                hashes: list[str] = []
                coords = []
                for step in range(1, steps + 1):
                    t = step / steps
                    cx, cy = x0 + dx * t, y0 + dy * t
                    hw = WEDGE_WIDTH * t
                    hx, hy = cx + px / WEDGE_WIDTH * hw, cy + py / WEDGE_WIDTH * hw
                    hx2, hy2 = cx - px / WEDGE_WIDTH * hw, cy - py / WEDGE_WIDTH * hw
                    hashes.append(f'<line x1="{hx:.2f}" y1="{hy:.2f}" x2="{hx2:.2f}" y2="{hy2:.2f}"/>')
                    coords.append((hx, hy))
                    coords.append((hx2, hy2))
                svg_parts.append(
                    f'<g data-pr-id="{bond_id}" stroke="{BOND_STROKE}" stroke-width="1.6">'
                    + "".join(hashes)
                    + "</g>"
                )
            declared = bbox(coords)
        elif order >= 2.5:
            offsets = (-GAP, 0.0, GAP)
            lines, coords = [], []
            for off in offsets:
                dx, dy = x1 - x0, y1 - y0
                length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
                ox_, oy_ = -dy / length * off, dx / length * off
                a, b = (x0 + ox_, y0 + oy_), (x1 + ox_, y1 + oy_)
                lines.append(f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}"/>')
                coords += [a, b]
            svg_parts.append(
                f'<g data-pr-id="{bond_id}" stroke="{BOND_STROKE}" stroke-width="1.8">'
                + "".join(lines)
                + "</g>"
            )
            declared = bbox(coords)
        elif order >= 1.5:
            offsets = (-GAP * 0.7, GAP * 0.7)
            lines, coords = [], []
            for off in offsets:
                dx, dy = x1 - x0, y1 - y0
                length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
                ox_, oy_ = -dy / length * off, dx / length * off
                a, b = (x0 + ox_, y0 + oy_), (x1 + ox_, y1 + oy_)
                lines.append(f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}"/>')
                coords += [a, b]
            svg_parts.append(
                f'<g data-pr-id="{bond_id}" stroke="{BOND_STROKE}" stroke-width="1.8">'
                + "".join(lines)
                + "</g>"
            )
            declared = bbox(coords)
        else:
            svg_parts.append(
                f'<line data-pr-id="{bond_id}" x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" '
                f'stroke="{BOND_STROKE}" stroke-width="1.8"/>'
            )
            declared = bbox([(x0, y0), (x1, y1)])

        # A bond's box IS something this module knows: it computed every
        # coordinate on the segment. Declaring it lets the core check this
        # module's own model against what it actually drew, same as the map
        # module declares region bounds it computed from real polygons.
        elements.append(
            {
                "id": bond_id,
                "kind": "decoration",
                "claim": f"bond between atom {i} and atom {j}",
                "declaredBox": declared,
            }
        )

    for idx, text in labels.items():
        if text is None:
            continue
        cx, cy = points[idx]
        label_id = f"atom-{idx}-label"
        svg_parts.append(
            f'<text data-pr-id="{label_id}" x="{cx:.2f}" y="{cy:.2f}" text-anchor="middle" '
            f'dominant-baseline="middle" font-family="{FONT_STACK}" font-size="15" '
            f'fill="{LABEL_FILL}">{text}</text>'
        )
        # NO declaredBox: measuring text needs a font engine this process does
        # not have. modules/map/render.py made the identical call for the same
        # reason. Guessing from character count was wrong by up to 16px there.
        elements.append({"id": label_id, "kind": "label", "claim": f"atom {idx} is {text}"})

    if misdeclare:
        elements.append(
            {
                "id": "bond-phantom",
                "kind": "decoration",
                "claim": "a bond that was never drawn",
            }
        )
        if elements:
            for element in elements:
                if element["kind"] == "decoration" and "declaredBox" in element:
                    box = element["declaredBox"]
                    element["declaredBox"] = {**box, "x": box["x"] + 40.0, "y": box["y"] + 40.0}
                    break
        notes.append("misdeclare mode: a phantom bond id declared, and one bond's own geometry shifted 40px from what it drew")

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">'
        f'<rect x="0" y="0" width="{width:.0f}" height="{height:.0f}" fill="{BG}"/>'
        f'<g data-pr-layer="bonds">{"".join(svg_parts)}</g>'
        f"</svg>"
    )

    return {"svg": svg, "elements": elements, "notes": notes}


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    smiles_arg = next((a for a in args if a.startswith("--smiles=")), None)
    name_arg = next((a for a in args if a.startswith("--name=")), None)

    if smiles_arg is not None:
        smiles = smiles_arg.split("=", 1)[1]
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        smiles = NAMED[key]
    else:
        smiles = NAMED["glucose"]

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    # The face the CORE will measure this SVG against, handed down with the
    # canvas size. Naming a font the measuring machine does not have is how the
    # same figure becomes two different figures.
    global FONT_STACK
    FONT_STACK = str(request.get("fontFamily", FONT_STACK))
    width = float(request.get("width", 720))
    height = float(request.get("height", 520))
    json.dump(render(width, height, smiles, misdeclare), sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
