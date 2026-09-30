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
paper, is the default), --lone-pairs, --dative=arrow|line (a donor->acceptor
bond, `N->[Ag+]`, drawn as an arrow towards the acceptor, the default, or as a
plain line), --resonance (the resonance forms, RDKit's enumeration, in a row
joined by double-headed arrows, one shared set of coordinates; implies
--lone-pairs), --answers=true|false (false hides what a "draw the Lewis
structure" exercise asks for: lone pairs, radical dots and formal charges),
--misdeclare.

The canvas is trimmed to the drawing: the requested width/height are a MAXIMUM
(the structure is scaled down to fit it) and never a minimum.

Run with ``--misdeclare`` to declare a bond that was never drawn and to lie
about another bond's own geometry, on purpose, and watch the core catch both.
"""

from __future__ import annotations

import html
import json
import math
import re
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
    # Species with resonance forms (--resonance).
    "nitrate": "[O-][N+](=O)[O-]",
    "carbonate": "[O-]C(=O)[O-]",
    "acetate": "CC(=O)[O-]",
    "ozone": "[O-][O+]=O",
}
MAX_FORMS = 4  # --resonance draws at most this many forms and says so

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

# A label is a list of RUNS: (text, mode) with mode "n" normal, "sub" or "sup",
# or "state" (a smaller run on the baseline: the "(aq)" after a formula).
Run = tuple[str, str]
SCRIPT_SCALE = 0.7  # a subscript/superscript is drawn at this fraction of the label font
SUB_DROP = 0.2  # ... shifted down by this fraction of the label font
SUP_RAISE = 0.42  # ... or up by this
STATE_SCALE = 0.72  # a state symbol "(aq)" is drawn at this fraction of the font, on the baseline
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
        target = {"n": 0.0, "sub": font * SUB_DROP, "sup": -font * SUP_RAISE, "state": 0.0}[mode]
        attrs = []
        if mode != "n":
            attrs.append(f'font-size="{font * (STATE_SCALE if mode == "state" else SCRIPT_SCALE):.2f}"')
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


def atom_label(atom: "Chem.Atom", h_first: bool = False, show_charge: bool = True) -> list[Run] | None:
    """The atom's label as runs, or None for a bare (uncharged carbon) vertex.

    `h_first` writes the hydrogens in front ("H3N", "HO") -- for an atom whose
    bonds all leave to the right, so the label reads towards its bond the way
    a textbook writes H3N->Ag. `show_charge` False leaves the formal charge out
    (an exercise asking for it: --answers=false).
    """
    symbol = atom.GetSymbol()
    charge = atom.GetFormalCharge() if show_charge else 0
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
    if hcount and h_first:
        return [("H", "n")] + subscript + [(symbol, "n")] + charge_run(charge)
    runs: list[Run] = [(symbol, "n")]
    if hcount:
        runs.append(("H", "n"))
        runs += subscript
    return runs + charge_run(charge)


_DATIVE = {
    getattr(Chem.BondType, name) for name in ("DATIVE", "DATIVEONE") if hasattr(Chem.BondType, name)
}


def is_dative(bond: "Chem.Bond") -> bool:
    """A donor-acceptor bond: RDKit writes it `N->[Ag+]`, begin atom = donor."""
    return bond.GetBondType() in _DATIVE


def own_bonding_electrons(atom: "Chem.Atom") -> int:
    """Electrons of this atom's OWN valence shell that its bonds use.

    A covalent bond of order n takes n of them (a kekulized molecule has no
    1.5s), a hydrogen one. A dative bond is not shared that way: the donor gives
    BOTH electrons -- the lone pair that IS the bond -- and the acceptor gives
    none. RDKit's GetTotalValence counts a dative bond towards the acceptor and
    not at all towards the donor, which is exactly backwards for a Lewis count:
    that is how `N->[Ag+]<-N` came to draw each N with the pair it had already
    given to silver.
    """
    used = atom.GetTotalNumHs()
    for bond in atom.GetBonds():
        if is_dative(bond):
            used += 2 if bond.GetBeginAtomIdx() == atom.GetIdx() else 0
        else:
            used += int(round(bond.GetBondTypeAsDouble()))
    return used


def counts_electrons(atom: "Chem.Atom") -> bool:
    z = atom.GetAtomicNum()
    return not (z in _TRANSITION or z == 0)


def lone_pair_count(atom: "Chem.Atom") -> int:
    """Non-bonding electron pairs by the textbook count.

    (valence electrons - formal charge - own bonding electrons - radical
    electrons) / 2. NH3 gives 1, H2O 2, F in BF3 3, B in BF3 0 (its empty
    orbital is the point of a Lewis acid), OH- 3, Cl- 4, O- in nitrate 3, N+ 0,
    S in H2SO4 0 (an expanded shell: six bonds use all six), S in SF4 1, N in
    H3N->Ag+ 0 (its pair is the bond). d-block metals are skipped: "valence
    electrons - bonds" is not a Lewis count there.
    """
    if not counts_electrons(atom):
        return 0
    outer = Chem.GetPeriodicTable().GetNOuterElecs(atom.GetAtomicNum())
    free = outer - atom.GetFormalCharge() - own_bonding_electrons(atom) - atom.GetNumRadicalElectrons()
    return max(0, free // 2)


def radical_count(atom: "Chem.Atom") -> int:
    """Unpaired electrons drawn as single dots (NO2's O, a methyl radical)."""
    return atom.GetNumRadicalElectrons() if counts_electrons(atom) else 0


def valence_shell_electrons(atom: "Chem.Atom") -> int:
    """Electrons around the atom in its Lewis structure: its pairs, its radicals, and two per bond pair it shares
    (a dative bond counts for both ends). B in BF3 has 6 -- the empty orbital a Lewis acid is -- and N in NH3 8."""
    shared = atom.GetTotalNumHs() * 2
    for bond in atom.GetBonds():
        shared += 2 if is_dative(bond) else 2 * int(round(bond.GetBondTypeAsDouble()))
    return 2 * lone_pair_count(atom) + radical_count(atom) + shared


def bare_atom_hydrogens(smiles: str) -> str:
    """A bare, unconnected atom -- water's "O", methane's "C" -- has no bond to
    draw under the skeletal convention: hydrogens fold into the heavy atom's
    own label, and carbon's label is suppressed entirely. Adding the explicit
    hydrogens turns "nothing to draw" into a real, if small, structure."""
    params = Chem.SmilesParserParams()
    params.removeHs = False  # "[Cl:1][H:2]" already has its H as an atom -- one that carries a map number
    mol = Chem.MolFromSmiles(smiles, params)
    if mol is not None and mol.GetNumBonds() == 0 and mol.GetNumAtoms() == 1 and mol.GetAtomWithIdx(0).GetTotalNumHs():
        return Chem.MolToSmiles(Chem.AddHs(mol))
    return smiles


_CARDINAL = (-math.pi / 2, 0.0, math.pi / 2, math.pi)  # up, right, down, left (canvas y-down)
_DIAGONAL = (-3 * math.pi / 4, -math.pi / 4, math.pi / 4, 3 * math.pi / 4)
SLOT_BOND_CLEARANCE = math.radians(40)  # a slot this close to a bond is taken by that bond
SLOT_SEPARATION = math.radians(80)  # two pairs of one atom never share a side or sit on adjacent corners
DIAGONAL_PENALTY = math.radians(25)


def angular_distance(a: float, b: float) -> float:
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


def choose_slots(count: int, neighbour_angles: list[float]) -> list[float] | None:
    """Lewis-dot slots for `count` electron groups: the four SIDES of the atom first, a corner only when needed.

    A textbook writes a pair on a side of the symbol -- above it, below it, to
    its left or right -- with the two dots parallel to that side. The earlier
    gap-spreading placement put pairs at whatever angle the bonds left free, so
    nitrate's O- (three pairs, one bond at 30 degrees) came out as three tilted
    pairs that read as six scattered dots. Here every candidate slot is a side
    or a corner; a slot within 40 degrees of a bond belongs to the bond; the
    freest slot wins, corners paying a penalty; and two pairs are never closer
    than 80 degrees, so no pair crowds another. Returns None when the slots run
    out (a crowded hypervalent centre), and the caller falls back to spreading
    the pairs through the gaps.
    """
    if count <= 0:
        return []
    chosen: list[float] = []
    candidates = [(a, False) for a in _CARDINAL] + [(a, True) for a in _DIAGONAL]
    for _ in range(count):
        best: tuple[float, int, float] | None = None
        for order, (a, diagonal) in enumerate(candidates):
            if any(angular_distance(a, c) < 1e-6 for c in chosen):
                continue
            clear_bond = min((angular_distance(a, b) for b in neighbour_angles), default=math.pi)
            clear_pair = min((angular_distance(a, c) for c in chosen), default=math.pi)
            if clear_bond < SLOT_BOND_CLEARANCE - 1e-9 or clear_pair < SLOT_SEPARATION - 1e-9:
                continue
            score = min(clear_bond, math.pi * 0.75) - (DIAGONAL_PENALTY if diagonal else 0.0)
            key = (round(score, 6), -order, a)
            if best is None or key[:2] > best[:2]:
                best = key
        if best is None:
            return None
        chosen.append(best[2])
    return chosen


def place_lone_pairs(count: int, neighbour_angles: list[float]) -> list[float]:
    """Directions (radians, canvas y-down) for `count` lone pairs: Lewis-dot slots, else the gaps between bonds."""
    slots = choose_slots(count, neighbour_angles)
    return slots if slots is not None else spread_in_gaps(count, neighbour_angles)


def spread_in_gaps(count: int, neighbour_angles: list[float]) -> list[float]:
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


def oriented(
    mol: "Chem.Mol", raw: list[tuple[float, float]], face: list[tuple[int, float, str]]
) -> list[tuple[float, float]]:
    """RDKit's coordinates turned (15-degree steps) and, when nothing is wedged, mirrored so each `face` request is
    met as well as it can be. A mirror image of a wedged centre is the other enantiomer, so it is never tried then;
    a turn is always safe. Between equally good orientations the one nearest RDKit's own wins."""
    wedged = any(b.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH) for b in mol.GetBonds())
    n = len(raw)
    mx = sum(x for x, _ in raw) / n
    my = sum(y for _, y in raw) / n
    base = [(x - mx, -(y - my)) for x, y in raw]  # canvas frame (y down), centred
    nbrs = {a.GetIdx(): [nb.GetIdx() for nb in a.GetNeighbors()] for a in mol.GetAtoms()}
    best: tuple[float, list[tuple[float, float]]] | None = None
    for mirror in (False,) if wedged else (False, True):
        for step in range(24):
            phi = math.radians(15 * step)
            c, s = math.cos(phi), math.sin(phi)
            pts = [((-x if mirror else x) * c - y * s, (-x if mirror else x) * s + y * c) for x, y in base]
            score = 0.0
            for idx, direction, kind in face:
                if idx >= n:
                    continue
                px, py = pts[idx]
                r = math.hypot(px, py)
                radial = (px * math.cos(direction) + py * math.sin(direction)) / r if r > 1e-6 else 0.0
                bonds = [math.atan2(pts[j][1] - py, pts[j][0] - px) for j in nbrs[idx]]
                gap = min((angular_distance(direction, a) for a in bonds), default=math.pi) / math.pi
                score += (0.6 * radial + 0.4 * gap) if kind == "atom" else (0.3 * radial + 0.7 * gap)
            score -= 0.02 * (step % 2) + 0.002 * min(step, 24 - step) + (0.005 if mirror else 0.0)
            if best is None or score > best[0] + 1e-9:
                best = (score, pts)
    assert best is not None
    return [(x, -y) for x, y in best[1]]


def build_mol(smiles: str, lone_pairs: bool) -> "Chem.Mol":
    """The molecule to draw for a SMILES string, hydrogens as atoms where they must be.

    removeHs=False: RDKit's default silently strips explicit hydrogen atoms back
    into implicit ones on parse, which is invisible for a normal SMILES (nothing
    was explicit to begin with) but means a caller who deliberately wrote a
    molecule OUT with explicit H atoms -- modules/reaction does this for a bare,
    unconnected atom like water or methane, which otherwise has no bond to draw
    at all -- would silently get them stripped right back out.

    With pairs on, a Lewis structure shows every atom whose electrons it is
    about: "NH3+" as one group label hides the N whose charge (and, elsewhere,
    whose pairs) the figure exists to show -- F3B-NH3's N+ was drawn that way --
    so a heteroatom that carries pairs or a charge gets its hydrogens as real
    atoms and bonds. Carbon stays skeletal. AddHs appends the new atoms, so every
    original atom keeps its index.
    """
    if lone_pairs:
        smiles = bare_atom_hydrogens(smiles)
    parser_params = Chem.SmilesParserParams()
    parser_params.removeHs = False
    mol = Chem.MolFromSmiles(smiles, parser_params)
    if mol is None:
        raise ValueError(f"not a valid SMILES string: {smiles!r}")
    if lone_pairs:
        expand = [
            a.GetIdx() for a in mol.GetAtoms()
            if a.GetSymbol() not in ("C", "H") and a.GetTotalNumHs() > 0
            and (lone_pair_count(a) > 0 or a.GetFormalCharge() != 0)
        ]
        if expand:
            mol = Chem.AddHs(mol, onlyOnAtoms=tuple(expand))
    return mol


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
    dative: str = "arrow",
    dot_px: float | None = None,
    face: list[tuple[int, float, str]] | None = None,
    answers: bool = True,
    prepared: "Chem.Mol | None" = None,
    coords: list[tuple[float, float]] | None = None,
) -> dict[str, Any]:
    """`answers=False` leaves out what a "draw the Lewis structure" exercise asks for -- lone pairs, radical dots and
    formal charges -- and keeps the skeleton; room is still reserved for the pairs, so the canvas and every atom sit
    where they do in the solution. `prepared` and `coords` draw an already-built molecule (a resonance form) at
    coordinates given by the caller instead of generating them. `face` asks for an orientation: (atom index, canvas direction in radians, "atom" | "lp") -- that atom should
    stick out towards that direction ("atom") or keep its free side, where its pairs go, facing it ("lp"). The
    reaction module uses it so a curved arrow's two ends face each other across the gap between two tiles."""
    if theme not in THEMES:
        raise ValueError(f"unknown theme {theme!r}; known: {', '.join(THEMES)}")
    if dative not in ("arrow", "line"):
        raise ValueError(f"unknown dative style {dative!r}; known: arrow, line")
    colours = THEMES[theme]
    ink, paper = colours["ink"], colours["bg"]
    if prepared is not None:
        mol = Chem.Mol(prepared)
    else:
        mol = build_mol(smiles, lone_pairs)
    n_atoms = mol.GetNumAtoms()
    if prepared is not None and coords is not None:
        # A resonance form: already kekulized bond by bond, and drawn where the caller says.
        for atom in mol.GetAtoms():
            atom.SetIsAromatic(False)
        for bond in mol.GetBonds():
            bond.SetIsAromatic(False)
        raw = list(coords)
    else:
        Chem.Kekulize(mol, clearAromaticFlags=True)
        AllChem.Compute2DCoords(mol)
        Chem.WedgeMolBonds(mol, mol.GetConformer())
        conf = mol.GetConformer()
        raw = [(conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y) for i in range(n_atoms)]
    if face:
        raw = oriented(mol, raw, face)
    pairs = {i: (lone_pair_count(mol.GetAtomWithIdx(i)) if lone_pairs else 0) for i in range(n_atoms)}
    radicals = {i: (radical_count(mol.GetAtomWithIdx(i)) if lone_pairs else 0) for i in range(n_atoms)}

    def reads_rightwards(i: int) -> bool:
        heavy = [nb.GetIdx() for nb in mol.GetAtomWithIdx(i).GetNeighbors()]
        return bool(heavy) and all(raw[j][0] - raw[i][0] > 0.3 for j in heavy)

    labels: dict[int, list[Run] | None] = {
        i: atom_label(mol.GetAtomWithIdx(i), h_first=reads_rightwards(i), show_charge=answers) for i in range(n_atoms)
    }
    label_w = {i: runs_width(r, font_px) for i, r in labels.items() if r is not None}
    label_has = {
        i: ({m for _, m in r} if r else set()) for i, r in labels.items()
    }

    dot_r = dot_px if dot_px is not None else min(3.0, max(1.8, font_px * 0.13))
    dot_sep = dot_r * 2.9  # centre-to-centre distance of the two dots of a pair: a clear gap between them

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
        # atom, k, cx-rel, cy-rel, ux, uy, kind ("lp" a pair, "rad" one unpaired electron)
        dots: list[tuple[int, int, float, float, float, float, str]] = []
        for i in range(n_atoms):
            groups = pairs[i] + radicals[i]
            if not groups:
                continue
            angles = []
            for nb in mol.GetAtomWithIdx(i).GetNeighbors():
                j = nb.GetIdx()
                angles.append(math.atan2(pts[j][1] - pts[i][1], pts[j][0] - pts[i][0]))
            for k, theta in enumerate(place_lone_pairs(groups, angles)):
                ux, uy = math.cos(theta), math.sin(theta)
                d = exit_distance(i, ux, uy) + dot_r + font_px * 0.2 + (5.0 if labels[i] is None else 0.0)
                kind = "lp" if k < pairs[i] else "rad"
                dots.append((i, k if kind == "lp" else k - pairs[i], ux * d, uy * d, ux, uy, kind))
        xs0, ys0, xs1, ys1 = [], [], [], []
        for i, (px, py) in enumerate(pts):
            left, top, right, bottom = ink_box(i)
            xs0.append(px - left)
            xs1.append(px + right)
            ys0.append(py - top)
            ys1.append(py + bottom)
        for i, _k, dx, dy, ux, uy, _kind in dots:
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
    geom_bonds: list[dict[str, Any]] = []

    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        bond_id = f"bond-{bond.GetIdx()}"
        (x0, y0), (x1, y1) = trimmed(i, j)
        direction = bond.GetBondDir()
        order = bond.GetBondTypeAsDouble()

        if is_dative(bond) and dative == "arrow":
            # Donor -> acceptor: the shaft and its filled head are ONE <path>
            # (the shaft an open two-point subpath, which encloses no area to
            # fill), so the id names a drawable the stroke checks can test,
            # not a <g> they would skip. Round joins keep the stroked head's
            # tip from mitring out past the geometry that is declared.
            dx, dy = x1 - x0, y1 - y0
            length = max((dx * dx + dy * dy) ** 0.5, 1e-6)
            ux, uy = dx / length, dy / length
            head, half = min(10.0, length * 0.45), 4.2
            bx, by = x1 - ux * head, y1 - uy * head
            px, py = -uy * half, ux * half
            svg_parts.append(
                f'<path data-pr-id="{bond_id}" d="M {x0:.2f} {y0:.2f} L {bx:.2f} {by:.2f} '
                f'M {x1:.2f} {y1:.2f} L {bx + px:.2f} {by + py:.2f} L {bx - px:.2f} {by - py:.2f} Z" '
                f'fill="{ink}" stroke="{ink}" stroke-width="1.8" stroke-linejoin="round"/>'
            )
            declared = bbox([(x0, y0), (x1, y1), (bx + px, by + py), (bx - px, by - py)])
            elements.append(
                {
                    "id": bond_id,
                    "kind": "decoration",
                    "claim": f"dative bond: atom {i} ({mol.GetAtomWithIdx(i).GetSymbol()}) gives its lone pair "
                    f"to atom {j} ({mol.GetAtomWithIdx(j).GetSymbol()})",
                    "declaredBox": declared,
                }
            )
            geom_bonds.append({"idx": bond.GetIdx(), "i": i, "j": j, "seg": ((x0, y0), (x1, y1)), "dative": True})
            continue

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
        geom_bonds.append({"idx": bond.GetIdx(), "i": i, "j": j, "seg": ((x0, y0), (x1, y1)), "dative": is_dative(bond)})

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
    geom_pairs: dict[int, list[dict[str, Any]]] = {}
    # --answers=false: the room for the pairs is reserved (layout above) but nothing is drawn in it.
    for i, k, dx, dy, ux, uy, kind in (lay["dots"] if answers else []):
        cx, cy = points[i][0] + dx, points[i][1] + dy
        # The two dots sit side by side PARALLEL to the side of the atom the
        # pair is on: across the direction it points in.
        nx, ny = -uy * dot_sep / 2, ux * dot_sep / 2
        centres = [(cx + nx, cy + ny), (cx - nx, cy - ny)] if kind == "lp" else [(cx, cy)]
        lp_id = f"atom-{i}-{kind}-{k}"
        svg_parts.append(
            f'<g data-pr-id="{lp_id}" fill="{ink}">'
            + "".join(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{dot_r:.2f}"/>' for x, y in centres)
            + "</g>"
        )
        declared = bbox([(x - dot_r, y - dot_r) for x, y in centres] + [(x + dot_r, y + dot_r) for x, y in centres])
        what = "lone pair" if kind == "lp" else "unpaired electron"
        elements.append(
            {
                "id": lp_id,
                "kind": "decoration",
                "claim": f"{what} {k + 1} of atom {i} ({mol.GetAtomWithIdx(i).GetSymbol()})",
                "declaredBox": declared,
            }
        )
        if kind == "lp":
            geom_pairs.setdefault(i, []).append(
                {"id": lp_id, "centre": (cx, cy), "u": (ux, uy), "dots": centres}
            )

    if not answers:
        notes.append("answers hidden: no lone pairs, radical dots or formal charges drawn; the skeleton is as in the solution")

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

    # What a caller laying this molecule out among others needs to draw ON it
    # (the reaction module's curved arrows): where each atom, its label box,
    # its pairs and its bonds ended up, in this canvas's pixels. Underscored
    # keys never leave the process; main() drops them.
    geometry = {
        "atoms": [
            {
                "idx": i,
                "map": mol.GetAtomWithIdx(i).GetAtomMapNum(),
                "symbol": mol.GetAtomWithIdx(i).GetSymbol(),
                "centre": points[i],
                "box": ink_box(i),
                "labelled": labels[i] is not None,
                "pairs": geom_pairs.get(i, []),
            }
            for i in range(n_atoms)
        ],
        "bonds": geom_bonds,
        "dot_r": dot_r,
    }
    return {
        "svg": svg, "elements": elements, "notes": notes, "_size": (canvas_w, canvas_h),
        "_mol": mol, "_geometry": geometry,
    }


ID_ATTR = re.compile(r'data-pr-id="([^"]*)"')
BG_RECT = re.compile(r'<rect data-pr-bg="1"[^>]*/>')


def embed_tile(mol_output: dict[str, Any], tx: float, ty: float, prefix: str) -> tuple[str, list[dict[str, Any]]]:
    """Wraps one molecule sub-render at (tx, ty), with every declared id and
    declaredBox rewritten into the enclosing figure's shared id-space and canvas space.

    The alternative -- letting each molecule keep its own bare ids -- breaks
    the very first time two tiles declare "atom-0-label". A collision is silent:
    the LAST element with a given id wins verification, and every earlier one
    goes unchecked without any check ever reporting a failure. Prefixing is
    the only fix that keeps the earlier ones checked at all.
    """
    svg = mol_output["svg"]
    inner = svg[svg.index(">", svg.index("<svg")) + 1 : svg.rindex("</svg>")]
    # The enclosing figure paints one shared background; a second opaque rect per
    # tile would occlude anything drawn behind it.
    inner = BG_RECT.sub("", inner, count=1)
    inner = ID_ATTR.sub(lambda m: f'data-pr-id="{prefix}-{m.group(1)}"', inner)
    wrapped = f'<g transform="translate({tx:.2f} {ty:.2f})">{inner}</g>'
    elements: list[dict[str, Any]] = []
    for element in mol_output["elements"]:
        entry: dict[str, Any] = {"id": f"{prefix}-{element['id']}", "kind": element["kind"]}
        if "claim" in element:
            entry["claim"] = element["claim"]
        if "owner" in element:
            entry["owner"] = f"{prefix}-{element['owner']}"
        if "declaredBox" in element:
            box = element["declaredBox"]
            entry["declaredBox"] = {
                "x": round(box["x"] + tx, 2),
                "y": round(box["y"] + ty, 2),
                "width": box["width"],
                "height": box["height"],
            }
        elements.append(entry)
    return wrapped, elements


def _signature(mol: "Chem.Mol") -> tuple:
    return (
        tuple(a.GetFormalCharge() for a in mol.GetAtoms()),
        tuple(sorted((b.GetBeginAtomIdx(), b.GetEndAtomIdx(), round(b.GetBondTypeAsDouble(), 3)) for b in mol.GetBonds())),
    )


def resonance_forms(mol: "Chem.Mol") -> list["Chem.Mol"]:
    """The distinct resonance forms of `mol` (RDKit's ResonanceMolSupplier, kekule forms for a ring), the one
    as written first. Every form has the atoms of `mol` in the same order, so one set of coordinates serves all."""
    kek = Chem.Mol(mol)
    Chem.Kekulize(kek, clearAromaticFlags=True)
    written = _signature(kek)
    seen: dict[tuple, Chem.Mol] = {}
    for form in Chem.ResonanceMolSupplier(mol, Chem.KEKULE_ALL):
        if form is None:
            continue
        seen.setdefault(_signature(form), form)
    forms = list(seen.values())
    forms.sort(key=lambda f: 0 if _signature(f) == written else 1)  # stable: RDKit's order otherwise
    return forms


RES_GAP = 54.0  # between two forms, holding the double-headed arrow
RES_ARROW = 34.0
RES_HEAD = 9.0


def render_resonance(
    width: float,
    height: float,
    smiles: str,
    misdeclare: bool,
    *,
    theme: str = DEFAULT_THEME,
    dative: str = "arrow",
    font_px: float = LABEL_FONT_PX,
    bond_px: float = BOND_PX,
    answers: bool = True,
) -> dict[str, Any]:
    """The resonance forms of a species in a row, joined by double-headed arrows.

    Lone pairs and formal charges are drawn per form (so the pairs are on: a
    resonance structure is a statement about where electrons and charges sit).
    The forms are enumerated, never typed: RDKit's ResonanceMolSupplier. ONE set
    of 2D coordinates -- generated on the molecule as written -- is used for
    every form, so only bonds, charges and pairs move between them. At most
    MAX_FORMS are drawn; the notes say how many there are. With answers=False the
    statement is the one structure as written, without pairs or charges."""
    if theme not in THEMES:
        raise ValueError(f"unknown theme {theme!r}; known: {', '.join(THEMES)}")
    colours = THEMES[theme]
    ink, paper = colours["ink"], colours["bg"]
    base = build_mol(smiles, True)
    forms = resonance_forms(base)
    total = len(forms)
    shown = forms[:MAX_FORMS] if answers else forms[:1]
    laid = Chem.Mol(base)
    Chem.Kekulize(laid, clearAromaticFlags=True)
    AllChem.Compute2DCoords(laid)
    conf = laid.GetConformer()
    coords = [(conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y) for i in range(laid.GetNumAtoms())]

    def draw_all(bpx: float) -> list[dict[str, Any]]:
        return [
            render(
                4000.0, 4000.0, smiles, False, theme=theme, lone_pairs=True, font_px=font_px, bond_px=bpx,
                dative=dative, answers=answers, prepared=form, coords=coords,
            )
            for form in shown
        ]

    def measure(tiles: list[dict[str, Any]]) -> tuple[float, float, float, float]:
        anchors = [t["_geometry"]["atoms"][0]["centre"] for t in tiles]
        left = max(a[0] for a in anchors)
        right = max(t["_size"][0] - a[0] for t, a in zip(tiles, anchors))
        top = max(a[1] for a in anchors)
        bottom = max(t["_size"][1] - a[1] for t, a in zip(tiles, anchors))
        return left, right, top, bottom

    tiles = draw_all(bond_px)
    for _ in range(10):  # the requested width is a maximum, as for a single molecule
        left, right, top, bottom = measure(tiles)
        gaps = (len(tiles) - 1) * RES_GAP
        row_w = len(tiles) * (left + right) + gaps
        if row_w <= width or bond_px <= 18.0:
            break
        bond_px = max(18.0, bond_px * max(0.5, (width - gaps) / (row_w - gaps)) * 0.97)
        tiles = draw_all(bond_px)
    left, right, top, bottom = measure(tiles)
    pitch = left + right
    row_w = len(tiles) * pitch + (len(tiles) - 1) * RES_GAP
    canvas_w = math.ceil(row_w)
    canvas_h = math.ceil(top + bottom)
    dx0 = (canvas_w - row_w) / 2

    parts: list[str] = []
    elements: list[dict[str, Any]] = []
    atoms0 = tiles[0]["_geometry"]["atoms"]
    # The arrows sit level with the middle of the drawing, not with atom 0.
    axis_y = top + sum(a["centre"][1] - atoms0[0]["centre"][1] for a in atoms0) / len(atoms0)
    for k, tile in enumerate(tiles):
        ax, ay = tile["_geometry"]["atoms"][0]["centre"]
        tx = dx0 + k * (pitch + RES_GAP) + (left - ax)
        ty = top - ay
        wrapped, els = embed_tile(tile, tx, ty, f"f{k}")
        parts.append(wrapped)
        elements.extend(els)
        if k < len(tiles) - 1:
            ax0 = dx0 + k * (pitch + RES_GAP) + pitch + (RES_GAP - RES_ARROW) / 2
            ax1 = ax0 + RES_ARROW
            parts.append(
                f'<g data-pr-id="res-arrow-{k}"><line x1="{ax0 + RES_HEAD:.2f}" y1="{axis_y:.2f}" '
                f'x2="{ax1 - RES_HEAD:.2f}" y2="{axis_y:.2f}" stroke="{ink}" stroke-width="1.8"/>'
                f'<path d="M {ax0 + RES_HEAD:.2f} {axis_y - 4.5:.2f} L {ax0:.2f} {axis_y:.2f} L {ax0 + RES_HEAD:.2f} {axis_y + 4.5:.2f} Z" fill="{ink}"/>'
                f'<path d="M {ax1 - RES_HEAD:.2f} {axis_y - 4.5:.2f} L {ax1:.2f} {axis_y:.2f} L {ax1 - RES_HEAD:.2f} {axis_y + 4.5:.2f} Z" fill="{ink}"/></g>'
            )
            elements.append(
                {
                    "id": f"res-arrow-{k}",
                    "kind": "decoration",
                    "claim": f"resonance: form {k + 1} and form {k + 2} are contributors to one structure",
                    "declaredBox": {
                        "x": round(ax0, 2), "y": round(axis_y - 4.5, 2),
                        "width": round(ax1 - ax0, 2), "height": 9.0,
                    },
                }
            )
    notes = [f"resonance: RDKit enumerated {total} distinct form(s) of the species; every form drawn on the same 2D coordinates"]
    if not answers:
        notes.append("answers hidden: the structure as written, without lone pairs or formal charges; the other forms are the answer")
    elif total > MAX_FORMS:
        notes.append(f"resonance: capped at {MAX_FORMS} forms, {total - MAX_FORMS} more not drawn")
    elif total == 1:
        notes.append("resonance: this species has no other resonance form; one structure drawn")
    if misdeclare:
        elements.append({"id": "bond-phantom", "kind": "decoration", "claim": "a bond that was never drawn"})
        notes.append("misdeclare mode: a phantom bond id declared")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w}" height="{canvas_h}" '
        f'viewBox="0 0 {canvas_w} {canvas_h}">'
        f'<rect data-pr-bg="1" x="0" y="0" width="{canvas_w}" height="{canvas_h}" fill="{paper}"/>'
        f'<g data-pr-layer="resonance">{"".join(parts)}</g></svg>'
    )
    return {"svg": svg, "elements": elements, "notes": notes, "_size": (canvas_w, canvas_h)}


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    lone_pairs = "--lone-pairs" in args
    resonance = "--resonance" in args
    answers_arg = next((a.split("=", 1)[1].lower() for a in args if a.startswith("--answers=")), "true")
    if answers_arg not in ("true", "false"):
        raise SystemExit(f"unknown --answers={answers_arg!r}; known: true, false")
    answers = answers_arg == "true"
    smiles_arg = next((a for a in args if a.startswith("--smiles=")), None)
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    theme = next((a.split("=", 1)[1] for a in args if a.startswith("--theme=")), DEFAULT_THEME)
    if theme not in THEMES:
        raise SystemExit(f"unknown --theme={theme!r}; known: {', '.join(THEMES)}")
    dative = next((a.split("=", 1)[1] for a in args if a.startswith("--dative=")), "arrow")
    if dative not in ("arrow", "line"):
        raise SystemExit(f"unknown --dative={dative!r}; known: arrow, line")

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
        if resonance:
            out = render_resonance(width, height, smiles, misdeclare, theme=theme, dative=dative, answers=answers)
        else:
            out = render(
                width, height, smiles, misdeclare, theme=theme, lone_pairs=lone_pairs, dative=dative, answers=answers
            )
    except ValueError as err:
        raise SystemExit(str(err))
    for key in [k for k in out if k.startswith("_")]:
        out.pop(key)
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
