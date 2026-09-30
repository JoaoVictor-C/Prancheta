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
modules/map/render.py's identical reasoning), every lone pair as a decoration
with a computed box. It does not certify that what it drew is correct: the core
measures the geometry itself. See decision 0005.

Flags: --name= / --smiles=, --theme=print|light|dark (print, dark ink on white
paper, is the default), --lone-pairs, --misdeclare.

The canvas is trimmed to the drawing: the requested width/height are a MAXIMUM
(the structure is scaled down to fit it) and never a minimum.

Run with ``--misdeclare`` to declare a bond that was never drawn and to lie
about another bond's own geometry, on purpose, and watch the core catch both.
"""

from __future__ import annotations

import html
import json
import math
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
    "ammonia": "N",
    "boron_trifluoride": "FB(F)F",
}

# Ink, secondary ink and paper. `print` is the default because these figures go
# on printed exercise lists: white paper, near-black ink. `light` is the same
# ink on a faint tint (for a screen page); `dark` is the original palette.
THEMES: dict[str, dict[str, str]] = {
    "print": {"bg": "#FFFFFF", "ink": "#1B1F27", "dim": "#4B5563"},
    "light": {"bg": "#F3F5F9", "ink": "#1B1F27", "dim": "#4B5563"},
    "dark": {"bg": "#0F1115", "ink": "#E6E9EF", "dim": "#9AA4B2"},
}
DEFAULT_THEME = "print"

MINUS = "−"

TRIM_PX = 11.0  # base clearance a bond keeps from a labelled atom; see trim_for()
LABEL_FONT_PX = 15.0  # default font-size the atom labels are drawn at
GAP = 3.2  # perpendicular offset between the two strokes of a double bond
WEDGE_WIDTH = 6.5  # half-width at the wide end of a stereo wedge/dash
BOND_PX = 50.0  # a bond is drawn this long unless the canvas maximum forces it smaller
RDKIT_BOND = 1.5  # RDKit's own bond length in its coordinate units
MARGIN = 14.0  # blank border around the drawing

# A label is a list of RUNS: (text, mode) with mode "n" normal, "sub" or "sup".
Run = tuple[str, str]
SCRIPT_SCALE = 0.7  # a subscript/superscript is drawn at this fraction of the label font
SUB_DROP = 0.2  # ... shifted down by this fraction of the label font
SUP_RAISE = 0.42  # ... or up by this
CHAR_W = 0.68  # label width budget per normal character, in font sizes (generous on purpose)
SCRIPT_CHAR_W = 0.48

# Elements whose non-bonding electrons this module does not count: d-block
# metals, where "valence electrons - bonds" is not a Lewis count.
_TRANSITION = set(range(21, 31)) | set(range(39, 49)) | set(range(57, 81))


def runs_plain(runs: list[Run]) -> str:
    return "".join(text for text, _ in runs)


def runs_width(runs: list[Run], font: float) -> float:
    """A layout budget for a run list, not a measurement (no font engine here)."""
    return sum(len(text) * font * (CHAR_W if mode == "n" else SCRIPT_CHAR_W) for text, mode in runs)


def runs_svg(runs: list[Run], font: float) -> str:
    """The inside of a <text>: plain characters, and <tspan>s for scripts.

    Baseline moves are `dy` in pixels rather than baseline-shift, which both
    Chromium and resvg place identically; each run states its move relative to
    the run before it, so the text returns to the baseline afterwards.
    """
    parts: list[str] = []
    shift = 0.0
    for text, mode in runs:
        target = {"n": 0.0, "sub": font * SUB_DROP, "sup": -font * SUP_RAISE}[mode]
        attrs = []
        if mode != "n":
            attrs.append(f'font-size="{font * SCRIPT_SCALE:.2f}"')
        dy = target - shift
        if abs(dy) > 1e-9:
            attrs.append(f'dy="{dy:.2f}"')
        shift = target
        escaped = html.escape(text)
        parts.append(f"<tspan {' '.join(attrs)}>{escaped}</tspan>" if attrs else escaped)
    return "".join(parts)


def charge_run(charge: int) -> list[Run]:
    if charge == 0:
        return []
    n = abs(charge)
    return [((str(n) if n > 1 else "") + ("+" if charge > 0 else MINUS), "sup")]


def atom_label(atom: "Chem.Atom") -> list[Run] | None:
    """The atom's label as runs, or None for a bare (uncharged carbon) vertex."""
    symbol = atom.GetSymbol()
    charge = atom.GetFormalCharge()
    if symbol == "C" and charge == 0:
        return None
    hcount = atom.GetTotalNumHs()
    subscript: list[Run] = [(str(hcount), "sub")] if hcount > 1 else []
    if atom.GetDegree() == 0 and hcount > 0:
        # A free hydride is written the way the species is: H2O, H3O+, HCl -- H
        # first for O (two or more) and the halogens -- but OH-, NH3, NH4+, H2S.
        if symbol in ("F", "Cl", "Br", "I") and hcount == 1:
            return [("H", "n"), (symbol, "n")] + charge_run(charge)
        if symbol in ("O", "S", "Se") and hcount >= 2:
            return [("H", "n")] + subscript + [(symbol, "n")] + charge_run(charge)
    runs: list[Run] = [(symbol, "n")]
    if hcount:
        runs.append(("H", "n"))
        runs += subscript
    return runs + charge_run(charge)


def lone_pair_count(atom: "Chem.Atom") -> int:
    """Non-bonding electron pairs by the textbook count.

    (valence electrons - formal charge - bonding electrons) / 2, with the
    bonding electrons the atom's total valence (bond orders, hydrogens
    included). NH3 gives 1, H2O 2, F in BF3 3, B in BF3 0 (its empty orbital is
    the point of a Lewis acid), OH- 3, Cl- 4.
    """
    z = atom.GetAtomicNum()
    if z in _TRANSITION or z == 0:
        return 0
    outer = Chem.GetPeriodicTable().GetNOuterElecs(z)
    free = outer - atom.GetFormalCharge() - atom.GetTotalValence() - atom.GetNumRadicalElectrons()
    return max(0, free // 2)


def bare_atom_hydrogens(smiles: str) -> str:
    """A bare, unconnected atom -- water's "O", methane's "C" -- has no bond to
    draw under the skeletal convention: hydrogens fold into the heavy atom's
    own label, and carbon's label is suppressed entirely. Adding the explicit
    hydrogens turns "nothing to draw" into a real, if small, structure."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is not None and mol.GetNumBonds() == 0 and mol.GetNumAtoms() == 1 and mol.GetAtomWithIdx(0).GetTotalNumHs():
        return Chem.MolToSmiles(Chem.AddHs(mol))
    return smiles


def place_lone_pairs(count: int, neighbour_angles: list[float]) -> list[float]:
    """Directions (radians, canvas y-down) for `count` lone pairs around an atom.

    The pairs go into the largest angular gaps between bonds. Each pair is
    given to whichever gap would be left with the widest slots, and the pairs in
    one gap are spread evenly across it, so two pairs on water sit symmetrically
    on the far side and a single pair on ammonia takes the middle of one gap.
    Between equal gaps the one facing up wins, then the one facing right.
    """
    if count <= 0:
        return []
    if not neighbour_angles:
        return [-math.pi / 2 + 2 * math.pi * k / count for k in range(count)]
    angles = sorted(a % (2 * math.pi) for a in neighbour_angles)
    gaps: list[tuple[float, float]] = []  # (start angle, size)
    for k, a in enumerate(angles):
        nxt = angles[(k + 1) % len(angles)]
        size = (nxt - a) % (2 * math.pi)
        gaps.append((a, size if size > 1e-9 else 2 * math.pi))
    given = [0] * len(gaps)

    def facing(start: float, size: float) -> tuple[float, float]:
        mid = start + size / 2
        return (math.sin(mid), -math.cos(mid))  # smaller sin = further up, then further right

    for _ in range(count):
        best = max(
            range(len(gaps)),
            key=lambda g: (round(gaps[g][1] / (given[g] + 1), 6), tuple(-v for v in facing(*gaps[g]))),
        )
        given[best] += 1
    out: list[float] = []
    for (start, size), m in zip(gaps, given):
        out += [start + size * (k + 1) / (m + 1) for k in range(m)]
    return out


def render(
    width: float,
    height: float,
    smiles: str,
    misdeclare: bool,
    *,
    theme: str = DEFAULT_THEME,
    lone_pairs: bool = False,
    font_px: float = LABEL_FONT_PX,
    bond_px: float = BOND_PX,
) -> dict[str, Any]:
    if theme not in THEMES:
        raise ValueError(f"unknown theme {theme!r}; known: {', '.join(THEMES)}")
    colours = THEMES[theme]
    ink, paper = colours["ink"], colours["bg"]
    if lone_pairs:
        smiles = bare_atom_hydrogens(smiles)

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
    n_atoms = mol.GetNumAtoms()
    raw = [(conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y) for i in range(n_atoms)]
    labels: dict[int, list[Run] | None] = {i: atom_label(mol.GetAtomWithIdx(i)) for i in range(n_atoms)}
    label_w = {i: runs_width(r, font_px) for i, r in labels.items() if r is not None}
    label_has = {
        i: ({m for _, m in r} if r else set()) for i, r in labels.items()
    }
    pairs = {i: (lone_pair_count(mol.GetAtomWithIdx(i)) if lone_pairs else 0) for i in range(n_atoms)}

    dot_r = min(2.6, max(1.6, font_px * 0.115))
    dot_sep = font_px * 0.34  # centre-to-centre distance of the two dots of a pair

    def ink_box(i: int) -> tuple[float, float, float, float]:
        """Half-extents (left, top, right, bottom) of atom i's label ink, from its centre."""
        if labels[i] is None:
            return (0.0, 0.0, 0.0, 0.0)
        hw = label_w[i] / 2 + font_px * 0.08
        # The LINE box, not the ink: the core measures the former (about 1.2 font
        # sizes tall, and taller again where a script sticks out of it), and a
        # dot that clears the ink but grazes the box would fail a collision check
        # it never visibly failed.
        top = font_px * (0.76 if "sup" in label_has[i] else 0.6)
        bottom = font_px * (0.76 if "sub" in label_has[i] else 0.6)
        return (hw, top, hw, bottom)

    def exit_distance(i: int, ux: float, uy: float) -> float:
        left, top, right, bottom = ink_box(i)
        if left == 0.0:
            return 0.0
        hw = right if ux >= 0 else left
        hh = bottom if uy >= 0 else top
        tx = hw / abs(ux) if abs(ux) > 1e-9 else float("inf")
        ty = hh / abs(uy) if abs(uy) > 1e-9 else float("inf")
        return min(tx, ty)

    def layout(scale: float) -> dict[str, Any]:
        pts = [(x * scale, -y * scale) for x, y in raw]
        dots: list[tuple[int, int, float, float, float, float]] = []  # atom, k, cx-rel, cy-rel, ux, uy
        for i in range(n_atoms):
            if not pairs[i]:
                continue
            angles = []
            for nb in mol.GetAtomWithIdx(i).GetNeighbors():
                j = nb.GetIdx()
                angles.append(math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]))
            for k, theta in enumerate(place_lone_pairs(pairs[i], angles)):
                ux, uy = math.cos(theta), math.sin(theta)
                d = exit_distance(i, ux, uy) + dot_r + font_px * 0.2 + (5.0 if labels[i] is None else 0.0)
                dots.append((i, k, ux * d, uy * d, ux, uy))
        xs0, ys0, xs1, ys1 = [], [], [], []
        for i, (px, py) in enumerate(pts):
            left, top, right, bottom = ink_box(i)
            xs0.append(px - left)
            xs1.append(px + right)
            ys0.append(py - top)
            ys1.append(py + bottom)
        for i, _k, dx, dy, ux, uy in dots:
            cx, cy = pts[i][0] + dx, pts[i][1] + dy
            reach = dot_sep / 2 + dot_r
            xs0.append(cx - reach)
            xs1.append(cx + reach)
            ys0.append(cy - reach)
            ys1.append(cy + reach)
        return {
            "pts": pts,
            "dots": dots,
            "x0": min(xs0),
            "y0": min(ys0),
            "w": max(xs1) - min(xs0) + 2 * MARGIN,
            "h": max(ys1) - min(ys0) + 2 * MARGIN,
        }

    scale = bond_px / RDKIT_BOND
    lay = layout(scale)
    for _ in range(60):
        if (lay["w"] <= width and lay["h"] <= height) or scale < 4.0:
            break
        scale *= 0.94
        lay = layout(scale)

    canvas_w, canvas_h = math.ceil(lay["w"]), math.ceil(lay["h"])
    # The canvas is rounded up to whole pixels; centre the drawing in it.
    off_x = MARGIN - lay["x0"] + (canvas_w - lay["w"]) / 2
    off_y = MARGIN - lay["y0"] + (canvas_h - lay["h"]) / 2
    points = [(x + off_x, y + off_y) for x, y in lay["pts"]]

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
        """How far a bond retreats from atom `idx`; (ux, uy) points away from the atom, along the bond.

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
        if labels[idx] is None:
            return 0.0
        half_width = label_w[idx] / 2
        half_height = font_px * 0.42
        # A superscript charge lifts the line box above the capital (a subscript
        # lowers it below): a bond arriving from that side has to clear it too.
        if uy < 0 and "sup" in label_has[idx]:
            half_height += font_px * 0.2
        elif uy > 0 and "sub" in label_has[idx]:
            half_height += font_px * 0.2
        return abs(ux) * half_width + abs(uy) * half_height + TRIM_PX * 0.45 * font_px / LABEL_FONT_PX

    def trimmed(a: int, b: int) -> tuple[tuple[float, float], tuple[float, float]]:
        """The segment for bond a->b, retreating from either end that carries a label."""
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
        ux, uy = dx / length, dy / length
        ta, tb = trim_for(a, ux, uy), trim_for(b, -ux, -uy)
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
                    f'{x1 + px:.2f},{y1 + py:.2f} {x1 - px:.2f},{y1 - py:.2f}" fill="{ink}"/>'
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
                    f'<g data-pr-id="{bond_id}" stroke="{ink}" stroke-width="1.6">'
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
                f'<g data-pr-id="{bond_id}" stroke="{ink}" stroke-width="1.8">'
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
                f'<g data-pr-id="{bond_id}" stroke="{ink}" stroke-width="1.8">'
                + "".join(lines)
                + "</g>"
            )
            declared = bbox(coords)
        else:
            svg_parts.append(
                f'<line data-pr-id="{bond_id}" x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" '
                f'stroke="{ink}" stroke-width="1.8"/>'
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

    for idx, runs in labels.items():
        if runs is None:
            continue
        cx, cy = points[idx]
        label_id = f"atom-{idx}-label"
        svg_parts.append(
            f'<text data-pr-id="{label_id}" x="{cx:.2f}" y="{cy:.2f}" text-anchor="middle" '
            f'dominant-baseline="middle" font-family="{FONT_STACK}" font-size="{font_px:.2f}" '
            f'fill="{ink}">{runs_svg(runs, font_px)}</text>'
        )
        # NO declaredBox: measuring text needs a font engine this process does
        # not have. modules/map/render.py made the identical call for the same
        # reason. Guessing from character count was wrong by up to 16px there.
        elements.append({"id": label_id, "kind": "label", "claim": f"atom {idx} is {runs_plain(runs)}"})

    # Lone pairs go AFTER the labels: they are circles, so the core's contrast
    # check treats them as surfaces, and a surface painted before a label is what
    # that label is scored against. A dot is never under a label.
    for i, k, dx, dy, ux, uy in lay["dots"]:
        cx, cy = points[i][0] + dx, points[i][1] + dy
        nx, ny = -uy * dot_sep / 2, ux * dot_sep / 2
        centres = [(cx + nx, cy + ny), (cx - nx, cy - ny)]
        lp_id = f"atom-{i}-lp-{k}"
        svg_parts.append(
            f'<g data-pr-id="{lp_id}" fill="{ink}">'
            + "".join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{dot_r:.2f}"/>' for x, y in centres)
            + "</g>"
        )
        declared = bbox([(x - dot_r, y - dot_r) for x, y in centres] + [(x + dot_r, y + dot_r) for x, y in centres])
        elements.append(
            {
                "id": lp_id,
                "kind": "decoration",
                "claim": f"lone pair {k + 1} of atom {i} ({mol.GetAtomWithIdx(i).GetSymbol()})",
                "declaredBox": declared,
            }
        )

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
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w}" height="{canvas_h}" '
        f'viewBox="0 0 {canvas_w} {canvas_h}">'
        f'<rect data-pr-bg="1" x="0" y="0" width="{canvas_w}" height="{canvas_h}" fill="{paper}"/>'
        f'<g data-pr-layer="bonds">{"".join(svg_parts)}</g>'
        f"</svg>"
    )

    return {"svg": svg, "elements": elements, "notes": notes, "_size": (canvas_w, canvas_h)}


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    lone_pairs = "--lone-pairs" in args
    smiles_arg = next((a for a in args if a.startswith("--smiles=")), None)
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    theme = next((a.split("=", 1)[1] for a in args if a.startswith("--theme=")), DEFAULT_THEME)
    if theme not in THEMES:
        raise SystemExit(f"unknown --theme={theme!r}; known: {', '.join(THEMES)}")

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
    try:
        out = render(width, height, smiles, misdeclare, theme=theme, lone_pairs=lone_pairs)
    except ValueError as err:
        raise SystemExit(str(err))
    out.pop("_size", None)
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
