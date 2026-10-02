"""Curved electron-pushing arrows: parsing, chemical verification, and geometry.

The textbook picture of a Lewis or Brønsted reaction is its reactants with
curved arrows saying where each electron pair goes: from N's lone pair to B
in BF3 + NH3, from a lone pair of water's O to the H of HCl, from the H-Cl
bond onto Cl. This file owns that picture for modules/reaction/render.py.

Input (`--arrows=`), arrows separated by `;`, each `SOURCE>TARGET`:

    SOURCE  lp:ATOM          a lone pair on ATOM
            bond:ATOM-ATOM   the pair of the bond between the two atoms
    TARGET  ATOM             an atom (the pair forms a bond to it, or lands on it)
            bond:ATOM-ATOM   a bond (the pair becomes a further bond there)
    ATOM    N                the atom carrying atom-map number N in the reaction SMILES ([NH3:2])
            Sym@C            the only atom of element Sym in reactant component C (1-based, as written)

Everything is drawn on the reactant side; an arrow may cross from one
component to another (over the plus sign of the equation).

VERIFIED, and refused with an error naming the arrow otherwise:
  * the source lone pair exists -- counted by modules/molecule's
    lone_pair_count, dative bonds included -- and no atom gives more pairs than
    it has; a source bond exists;
  * the target can take a pair: a hydrogen bonded to something (it leaves as
    H+), a positively charged atom, a metal, an atom with fewer than eight
    electrons around it (B in BF3: an empty orbital), or -- for a bond
    source -- one of that bond's own atoms (heterolysis); a target bond exists
    and touches the source;
  * an arrow never starts and ends on the same atom.
It does not check that the arrows together describe a sensible mechanism.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from rdkit import Chem

import render as molecule_module  # modules/molecule/render.py, already on sys.path

_NONMETALS = {
    "H", "He", "B", "C", "N", "O", "F", "Ne", "Si", "P", "S", "Cl", "Ar", "As", "Se", "Br", "Kr",
    "Te", "I", "Xe", "At", "Rn",
}

HEAD_LEN = 7.5
HEAD_HALF = 3.2
STROKE = 1.4
END_GAP = 4.0  # how far short of the target's label box the head's tip stops


class ArrowError(ValueError):
    """An arrow the chemistry or the drawing does not support."""


@dataclass
class AtomRef:
    text: str
    map_num: int | None = None
    symbol: str | None = None
    component: int | None = None


@dataclass
class Endpoint:
    kind: str  # "lp" | "bond" | "atom"
    atoms: list[AtomRef]


@dataclass
class Arrow:
    text: str
    source: Endpoint
    target: Endpoint
    # resolved: (tile, atom index) per AtomRef
    src: list[tuple[int, int]] = field(default_factory=list)
    dst: list[tuple[int, int]] = field(default_factory=list)
    why: str = ""


_ATOM = re.compile(r"^(?:(\d+)|([A-Z][a-z]?)@(\d+))$")


def _parse_atom(text: str, arrow: str) -> AtomRef:
    m = _ATOM.match(text.strip())
    if not m:
        raise ArrowError(
            f"arrow {arrow!r}: {text!r} is not an atom -- write an atom-map number from the reaction SMILES "
            f"(`2` for [NH3:2]) or Symbol@component (`N@2`)"
        )
    if m.group(1):
        return AtomRef(text.strip(), map_num=int(m.group(1)))
    return AtomRef(text.strip(), symbol=m.group(2), component=int(m.group(3)))


def _parse_endpoint(text: str, arrow: str, role: str) -> Endpoint:
    text = text.strip()
    if text.startswith("lp:"):
        if role == "target":
            raise ArrowError(f"arrow {arrow!r}: an arrow ends at an atom or a bond, not at a lone pair")
        return Endpoint("lp", [_parse_atom(text[3:], arrow)])
    if text.startswith("bond:"):
        parts = text[5:].split("-")
        if len(parts) != 2:
            raise ArrowError(f"arrow {arrow!r}: a bond is `bond:ATOM-ATOM`, got {text!r}")
        return Endpoint("bond", [_parse_atom(p, arrow) for p in parts])
    if role == "source":
        raise ArrowError(
            f"arrow {arrow!r}: an arrow starts at a lone pair (`lp:ATOM`) or a bond (`bond:ATOM-ATOM`) -- "
            f"electrons move, atoms do not; got {text!r}"
        )
    return Endpoint("atom", [_parse_atom(text, arrow)])


def parse(spec: str) -> list[Arrow]:
    arrows: list[Arrow] = []
    for chunk in spec.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        pieces = re.split(r"\s*(?:->|→|>)\s*", chunk)
        if len(pieces) != 2:
            raise ArrowError(f"arrow {chunk!r}: write SOURCE>TARGET, e.g. `lp:2>1` or `bond:3-4>4`")
        arrows.append(
            Arrow(chunk, _parse_endpoint(pieces[0], chunk, "source"), _parse_endpoint(pieces[1], chunk, "target"))
        )
    if not arrows:
        raise ArrowError("--arrows= is empty")
    return arrows


@dataclass
class Tile:
    """One reactant component as drawn: its RDKit molecule (drawn indices) and its name for messages."""

    component: int  # 1-based position among the reactants
    name: str
    mol: "Chem.Mol"


def _describe(tile: Tile, idx: int) -> str:
    atom = tile.mol.GetAtomWithIdx(idx)
    charge = atom.GetFormalCharge()
    ch = "" if charge == 0 else ("+" if charge > 0 else "-") if abs(charge) == 1 else f"{abs(charge)}{'+' if charge > 0 else '-'}"
    return f"{atom.GetSymbol()}{ch} of {tile.name} (component {tile.component})"


def _resolve_atom(ref: AtomRef, tiles: list[Tile], arrow: str) -> tuple[int, int]:
    if ref.map_num is not None:
        hits = [
            (t, a.GetIdx()) for t, tile in enumerate(tiles) for a in tile.mol.GetAtoms()
            if a.GetAtomMapNum() == ref.map_num
        ]
        if not hits:
            known = ", ".join(
                f"{a.GetAtomMapNum()} ({_describe(tile, a.GetIdx())})"
                for tile in tiles for a in tile.mol.GetAtoms() if a.GetAtomMapNum()
            )
            raise ArrowError(
                f"arrow {arrow!r}: no reactant atom carries map number {ref.map_num}"
                + (f"; mapped atoms: {known}" if known else "; the reactants carry no atom maps ([NH3:2])")
            )
        if len(hits) > 1:
            raise ArrowError(f"arrow {arrow!r}: map number {ref.map_num} is on more than one reactant atom")
        return hits[0]
    assert ref.component is not None and ref.symbol is not None
    if not 1 <= ref.component <= len(tiles):
        raise ArrowError(
            f"arrow {arrow!r}: {ref.text!r} names reactant component {ref.component}, but there are "
            f"{len(tiles)} ({', '.join(t.name for t in tiles)})"
        )
    t = ref.component - 1
    hits = [a.GetIdx() for a in tiles[t].mol.GetAtoms() if a.GetSymbol() == ref.symbol]
    if not hits:
        raise ArrowError(f"arrow {arrow!r}: {tiles[t].name} (component {ref.component}) has no {ref.symbol} atom")
    if len(hits) > 1:
        raise ArrowError(
            f"arrow {arrow!r}: {tiles[t].name} (component {ref.component}) has {len(hits)} {ref.symbol} atoms, "
            f"so {ref.text!r} is ambiguous -- number the one you mean with an atom map in the reaction SMILES"
        )
    return (t, hits[0])


def _bond(tiles: list[Tile], a: tuple[int, int], b: tuple[int, int]) -> "Chem.Bond | None":
    if a[0] != b[0]:
        return None
    return tiles[a[0]].mol.GetBondBetweenAtoms(a[1], b[1])


def _accepts(tiles: list[Tile], dst: tuple[int, int], arrow: Arrow) -> str | None:
    """Why the target atom can take an electron pair, or None if it cannot."""
    atom = tiles[dst[0]].mol.GetAtomWithIdx(dst[1])
    symbol = atom.GetSymbol()
    if arrow.source.kind == "bond" and dst in arrow.src:
        return "it takes the pair of its own breaking bond"
    if symbol == "H":
        if atom.GetDegree() >= 1:
            return "a hydrogen bonded to another atom, which leaves as H+"
        if atom.GetFormalCharge() > 0:
            return "a proton"
        return None
    if atom.GetFormalCharge() > 0:
        return "a positively charged atom"
    if symbol not in _NONMETALS:
        return "a metal, with empty orbitals to take a pair"
    electrons = molecule_module.valence_shell_electrons(atom)
    if electrons < 8:
        return f"it has {electrons} electrons around it: an empty valence orbital"
    return None


def verify(arrows: list[Arrow], tiles: list[Tile]) -> None:
    used_pairs: dict[tuple[int, int], int] = {}
    for arrow in arrows:
        arrow.src = [_resolve_atom(r, tiles, arrow.text) for r in arrow.source.atoms]
        arrow.dst = [_resolve_atom(r, tiles, arrow.text) for r in arrow.target.atoms]
        if arrow.source.kind == "lp":
            where = arrow.src[0]
            atom = tiles[where[0]].mol.GetAtomWithIdx(where[1])
            have = molecule_module.lone_pair_count(atom)
            used_pairs[where] = used_pairs.get(where, 0) + 1
            if have == 0:
                raise ArrowError(
                    f"arrow {arrow.text!r}: {_describe(tiles[where[0]], where[1])} has no lone pair to give"
                    + (" (its pair is already its dative bond)" if any(
                        molecule_module.is_dative(b) and b.GetBeginAtomIdx() == where[1] for b in atom.GetBonds()
                    ) else "")
                )
            if used_pairs[where] > have:
                raise ArrowError(
                    f"arrow {arrow.text!r}: {_describe(tiles[where[0]], where[1])} has {have} lone pair(s) and "
                    f"{used_pairs[where]} arrows leave them"
                )
        else:
            if arrow.src[0] == arrow.src[1] or _bond(tiles, arrow.src[0], arrow.src[1]) is None:
                raise ArrowError(
                    f"arrow {arrow.text!r}: there is no bond between {_describe(tiles[arrow.src[0][0]], arrow.src[0][1])} "
                    f"and {_describe(tiles[arrow.src[1][0]], arrow.src[1][1])}"
                )
        if arrow.target.kind == "atom":
            dst = arrow.dst[0]
            if arrow.source.kind == "lp" and dst == arrow.src[0]:
                raise ArrowError(f"arrow {arrow.text!r}: starts and ends on the same atom")
            why = _accepts(tiles, dst, arrow)
            if why is None:
                raise ArrowError(
                    f"arrow {arrow.text!r}: {_describe(tiles[dst[0]], dst[1])} cannot take an electron pair -- it is "
                    f"neither a bonded H, a cation, a metal nor short of an octet"
                    + (", and it is not an atom of the bond that breaks" if arrow.source.kind == "bond" else "")
                )
            arrow.why = why
        else:
            a, b = arrow.dst
            if a == b or _bond(tiles, a, b) is None:
                raise ArrowError(
                    f"arrow {arrow.text!r}: the target bond does not exist between "
                    f"{_describe(tiles[a[0]], a[1])} and {_describe(tiles[b[0]], b[1])}"
                )
            if not (set(arrow.src) & {a, b}):
                raise ArrowError(
                    f"arrow {arrow.text!r}: a pair moved INTO a bond must come from one of that bond's atoms"
                )
            arrow.why = "the pair becomes a further bond there"


def face_hints(arrows: list[Arrow]) -> dict[int, list[tuple[int, float, str]]]:
    """Per tile, the orientation requests that make an arrow's two ends face each other across the gap."""
    hints: dict[int, list[tuple[int, float, str]]] = {}
    for arrow in arrows:
        s_tile, d_tile = arrow.src[0][0], arrow.dst[0][0]
        if s_tile == d_tile:
            continue
        s_dir, d_dir = (0.0, math.pi) if s_tile < d_tile else (math.pi, 0.0)
        s_kind = "lp" if arrow.source.kind == "lp" else "atom"
        hints.setdefault(s_tile, []).append((arrow.src[0][1], s_dir, s_kind))
        hints.setdefault(d_tile, []).append((arrow.dst[0][1], d_dir, "atom"))
    return hints


# --- geometry ------------------------------------------------------------------

Pt = tuple[float, float]


def _sub(a: Pt, b: Pt) -> Pt:
    return (a[0] - b[0], a[1] - b[1])


def _add(a: Pt, b: Pt, k: float = 1.0) -> Pt:
    return (a[0] + b[0] * k, a[1] + b[1] * k)


def _len(a: Pt) -> float:
    return math.hypot(a[0], a[1])


def _unit(a: Pt) -> Pt:
    n = _len(a)
    return (a[0] / n, a[1] / n) if n > 1e-9 else (1.0, 0.0)


def cubic_point(p: list[Pt], t: float) -> Pt:
    u = 1 - t
    return (
        u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
        u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    )


def cubic_split_left(p: list[Pt], t: float) -> list[Pt]:
    """The part of the cubic on [0, t] (de Casteljau)."""

    def lerp(a: Pt, b: Pt) -> Pt:
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    p01, p12, p23 = lerp(p[0], p[1]), lerp(p[1], p[2]), lerp(p[2], p[3])
    p012, p123 = lerp(p01, p12), lerp(p12, p23)
    return [p[0], p01, p012, lerp(p012, p123)]


def cubic_bbox(p: list[Pt]) -> tuple[float, float, float, float]:
    """The TRUE extent of a cubic: its end points and the points where dx/dt or dy/dt vanish -- not its control
    polygon, which the browser does not measure either."""
    ts = [0.0, 1.0]
    for axis in (0, 1):
        a = -p[0][axis] + 3 * p[1][axis] - 3 * p[2][axis] + p[3][axis]
        b = 2 * (p[0][axis] - 2 * p[1][axis] + p[2][axis])
        c = p[1][axis] - p[0][axis]
        if abs(a) < 1e-12:
            if abs(b) > 1e-12:
                ts.append(-c / b)
        else:
            disc = b * b - 4 * a * c
            if disc >= 0:
                r = math.sqrt(disc)
                ts += [(-b + r) / (2 * a), (-b - r) / (2 * a)]
    pts = [cubic_point(p, t) for t in ts if 0.0 <= t <= 1.0]
    xs, ys = [q[0] for q in pts], [q[1] for q in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def _seg_dist(p: Pt, a: Pt, b: Pt) -> float:
    ab = _sub(b, a)
    L2 = ab[0] ** 2 + ab[1] ** 2
    t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2))
    return _len(_sub(p, (a[0] + ab[0] * t, a[1] + ab[1] * t)))


def _exit(box: tuple[float, float, float, float], v: Pt) -> float:
    left, top, right, bottom = box
    hw = right if v[0] >= 0 else left
    hh = bottom if v[1] >= 0 else top
    tx = hw / abs(v[0]) if abs(v[0]) > 1e-9 else float("inf")
    ty = hh / abs(v[1]) if abs(v[1]) > 1e-9 else float("inf")
    return min(tx, ty)


@dataclass
class Placed:
    """One tile's geometry moved into the reaction's frame."""

    geometry: dict[str, Any]
    ox: float
    oy: float

    def atom(self, idx: int) -> dict[str, Any]:
        return self.geometry["atoms"][idx]

    def centre(self, idx: int) -> Pt:
        c = self.atom(idx)["centre"]
        return (c[0] + self.ox, c[1] + self.oy)

    def seg(self, bond: dict[str, Any]) -> tuple[Pt, Pt]:
        (a, b) = bond["seg"]
        return ((a[0] + self.ox, a[1] + self.oy), (b[0] + self.ox, b[1] + self.oy))


def plan(
    arrows: list[Arrow], placed: list[Placed], frame: tuple[float, float], extra_boxes: list[tuple[float, float, float, float]]
) -> list[dict[str, Any]]:
    """A smooth cubic per arrow, bent to whichever side (and by however much) keeps it off other ink.

    `placed` holds EVERY tile (reactant tiles first, in the order the arrows' tile indices use); `frame` is the
    x range the row occupies; `extra_boxes` are further rectangles to keep clear of (coefficients).
    """
    boxes: list[tuple[int, int, tuple[float, float, float, float]]] = []
    bonds: list[tuple[int, int, int, Pt, Pt]] = []
    dots: list[tuple[int, str, Pt, float]] = []
    for t, pl in enumerate(placed):
        for atom in pl.geometry["atoms"]:
            if atom["labelled"]:
                cx, cy = pl.centre(atom["idx"])
                l, tp, r, b = atom["box"]
                boxes.append((t, atom["idx"], (cx - l, cy - tp, cx + r, cy + b)))
            for pair in atom["pairs"]:
                for d in pair["dots"]:
                    dots.append((t, pair["id"], (d[0] + pl.ox, d[1] + pl.oy), pl.geometry["dot_r"]))
        for bond in pl.geometry["bonds"]:
            a, b = pl.seg(bond)
            bonds.append((t, bond["i"], bond["j"], a, b))

    used_pairs: set[tuple[int, str]] = set()
    drawn: list[list[Pt]] = []
    results: list[dict[str, Any]] = []
    for arrow in arrows:
        s_tile = arrow.src[0][0]
        spl = placed[s_tile]
        if arrow.target.kind == "atom":
            d_tile, d_idx = arrow.dst[0]
            target_c = placed[d_tile].centre(d_idx)
            target_atom = placed[d_tile].atom(d_idx)
        else:
            d_tile = arrow.dst[0][0]
            a_c, b_c = placed[d_tile].centre(arrow.dst[0][1]), placed[d_tile].centre(arrow.dst[1][1])
            target_c = ((a_c[0] + b_c[0]) / 2, (a_c[1] + b_c[1]) / 2)
            target_atom = None

        if arrow.source.kind == "lp":
            s_idx = arrow.src[0][1]
            src_c = spl.centre(s_idx)
            pairs = [p for p in spl.atom(s_idx)["pairs"] if (s_tile, p["id"]) not in used_pairs]
            if not pairs:
                raise ArrowError(f"arrow {arrow.text!r}: its lone pair was not drawn (every pair already has an arrow)")
        else:
            a_c, b_c = spl.centre(arrow.src[0][1]), spl.centre(arrow.src[1][1])
            seg = next(
                (
                    (p, q) for (t, i, j, p, q) in bonds
                    if t == s_tile and {i, j} == {arrow.src[0][1], arrow.src[1][1]}
                ),
                (a_c, b_c),
            )
            src_c = ((seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2)
            pairs = []

        best: tuple[float, dict[str, Any]] | None = None
        # A bond's pair moving onto one of its own atoms (H-Cl onto Cl) is
        # the textbook's small C-shaped hook: it leaves the middle of the
        # bond perpendicular to it, curls over, and comes in to the atom
        # from the bond's side at a shallow angle -- landing on the atom's
        # face beside the bond, never on top of it where its lone pairs sit.
        # The generic apex arc dropped steeply onto the top of the atom and
        # read as pointing at the dots.
        hook = (
            arrow.source.kind == "bond"
            and arrow.target.kind == "atom"
            and d_tile == s_tile
            and d_idx in (arrow.src[0][1], arrow.src[1][1])
        )
        if hook:
            bd = _unit(_sub(target_c, src_c))
            out = (-bd[0], -bd[1])
            for side in (-1.0, 1.0):
                n = (-bd[1] * side, bd[0] * side)
                p0 = _add(src_c, n, 4.0)
                for a_rank, alpha in enumerate((0.55, 0.75, 0.95, 1.15)):
                    v = _unit(_add((out[0] * math.cos(alpha), out[1] * math.cos(alpha)), n, math.sin(alpha)))
                    if target_atom is not None and target_atom["labelled"]:
                        p3 = _add(target_c, v, _exit(tuple(target_atom["box"]), v) + END_GAP)
                    else:
                        p3 = _add(target_c, v, 7.0)
                    # Sized from its own chord: about a half-arc, never a
                    # tall loop (fixed 24-36 px handles made candy canes).
                    chord_len = _len(_sub(p3, p0))
                    for h_rank, k in enumerate((0.55, 0.7, 0.85)):
                        hh = min(max(k * chord_len, 10.0), 30.0)
                        curve = [p0, _add(p0, n, hh), _add(p3, v, hh * 0.9), p3]
                        cost = _cost(curve, arrow, s_tile, None, target_atom, d_tile, boxes, bonds, dots, drawn, frame, extra_boxes)
                        cost += _head_on_dots(p3, v, dots) + 0.3 * h_rank + 0.15 * a_rank
                        if cubic_point(curve, 0.5)[1] > max(p0[1], p3[1]) + 1:
                            cost += 0.4  # above the bond reads first, as in print
                        if best is None or cost < best[0] - 1e-9:
                            best = (cost, {"curve": curve, "pair": None})
        for side in (() if hook else (-1.0, 1.0)):
            # Bends as a fraction of the chord: textbook arrows are shallow arcs,
            # not loops (the first set, up to 0.75, read as circles).
            for h_rank, h in enumerate((0.18, 0.26, 0.36, 0.5)):
                chord = _sub(target_c, src_c)
                L = max(_len(chord), 1.0)
                n = (-chord[1] / L * side, chord[0] / L * side)
                # A bond's pair moving onto one of its own atoms spans half a
                # bond: without a floor on the bend it is a hook, not an arc.
                bend = max(h * L, 24.0 + 5.0 * h_rank if arrow.source.kind == "bond" else 10.0)
                apex = _add(((src_c[0] + target_c[0]) / 2, (src_c[1] + target_c[1]) / 2), n, bend)
                if pairs:
                    pair = max(pairs, key=lambda p: p["u"][0] * _unit(_sub(apex, src_c))[0] + p["u"][1] * _unit(_sub(apex, src_c))[1])
                    u = tuple(pair["u"])
                    pc = (pair["centre"][0] + spl.ox, pair["centre"][1] + spl.oy)
                    p0 = _add(pc, u, spl.geometry["dot_r"] + 3.5)
                    t0 = _unit(_add(_unit(_sub(apex, p0)), u, 0.5))
                else:
                    pair = None
                    p0 = _add(src_c, n, 4.0)
                    t0 = _unit(_sub(apex, p0))
                v0 = _unit(_sub(apex, target_c))
                for twist in (0.0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9, -1.2, 1.2):
                    # The head may come in to either side of the apex
                    # direction: straight in can land on the target's own
                    # lone pair, and an atom with three pairs (Cl in HCl)
                    # leaves only the gaps beside its bond free.
                    v = (v0[0] * math.cos(twist) - v0[1] * math.sin(twist), v0[0] * math.sin(twist) + v0[1] * math.cos(twist))
                    if target_atom is not None and target_atom["labelled"]:
                        p3 = _add(target_c, v, _exit(tuple(target_atom["box"]), v) + END_GAP)
                    else:
                        p3 = _add(target_c, v, 7.0 if target_atom is not None else 5.0)
                    # A parabola through the apex (its quadratic control point
                    # raised to a cubic) -- smooth, no cusp however short the
                    # chord -- with the first arm turned towards the pair's own
                    # direction so the arrow visibly leaves the dots.
                    q = _sub(_add(apex, apex), ((p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2))
                    arm0 = _len(_sub(q, p0)) * 2 / 3
                    p1 = _add(p0, t0, arm0) if pairs else _add(p0, _sub(q, p0), 2 / 3)
                    curve = [p0, p1, _add(p3, _sub(q, p3), 2 / 3), p3]
                    cost = _cost(curve, arrow, s_tile, pair, target_atom, d_tile, boxes, bonds, dots, drawn, frame, extra_boxes)
                    # A head on a lone pair merges with its dots (they read
                    # as three dots and a blob): the tip, the base and both
                    # barbs must clear every dot. Near-hard, not a nudge.
                    cost += _head_on_dots(p3, v, dots)
                    apex_y = cubic_point(curve, 0.5)[1]
                    cost += 0.35 * h_rank + (0.4 if apex_y > (p0[1] + p3[1]) / 2 + 1 else 0.0) + 0.2 * abs(twist)
                    if best is None or cost < best[0] - 1e-9:
                        best = (cost, {"curve": curve, "pair": pair})
        assert best is not None
        chosen = best[1]
        if chosen["pair"] is not None:
            used_pairs.add((s_tile, chosen["pair"]["id"]))
        curve = chosen["curve"]
        drawn.append([cubic_point(curve, k / 30) for k in range(31)])
        results.append(_finish(curve, arrow, chosen["pair"], best[0]))
    return results


def _head_on_dots(p3: Pt, v: Pt, dots: list[tuple[int, str, Pt, float]]) -> float:
    """A head on a lone pair merges with its dots: its tip, base and both barbs must clear every dot. Near-hard."""
    head_base = _add(p3, v, HEAD_LEN)
    side_v = (-v[1], v[0])
    head_pts = [p3, head_base, _add(head_base, side_v, HEAD_HALF), _add(head_base, side_v, -HEAD_HALF), _add(p3, v, HEAD_LEN / 2)]
    cost = 0.0
    for (_dt, _pid, c, r) in dots:
        if min(_len(_sub(q, c)) for q in head_pts) < r + 3.0:
            cost += 60
    return cost


def _cost(curve, arrow, s_tile, pair, target_atom, d_tile, boxes, bonds, dots, drawn, frame, extra_boxes) -> float:
    cost = 0.0
    src_atoms = {(s_tile, i) for (_, i) in arrow.src}
    dst_atoms = {(d_tile, i) for (_, i) in arrow.dst}
    for k in range(1, 40):
        t = k / 40
        p = cubic_point(curve, t)
        for (bt, idx, (x0, y0, x1, y1)) in boxes:
            if (bt, idx) in src_atoms and t < 0.3:
                continue
            if (bt, idx) in dst_atoms and t > 0.7:
                continue
            if x0 - 3 <= p[0] <= x1 + 3 and y0 - 3 <= p[1] <= y1 + 3:
                cost += 10
        for (bt, i, j, a, b) in bonds:
            if t < 0.3 and bt == s_tile and ((bt, i) in src_atoms or (bt, j) in src_atoms):
                continue
            if t > 0.8 and bt == d_tile and ((bt, i) in dst_atoms or (bt, j) in dst_atoms):
                continue
            if _seg_dist(p, a, b) < 5.0:
                cost += 5
        for (dt, pid, c, r) in dots:
            if pair is not None and dt == s_tile and pid == pair["id"] and t < 0.25:
                continue
            if _len(_sub(p, c)) < r + 3.5:
                cost += 5
        for other in drawn:
            if min(_len(_sub(p, q)) for q in other) < 7.0:
                cost += 3
        for (x0, y0, x1, y1) in extra_boxes:
            if x0 - 3 <= p[0] <= x1 + 3 and y0 - 3 <= p[1] <= y1 + 3:
                cost += 10
        if p[0] < frame[0] or p[0] > frame[1]:
            cost += 20
    return cost


def _finish(curve: list[Pt], arrow: Arrow, pair: dict[str, Any] | None, cost: float) -> dict[str, Any]:
    tip = curve[3]
    length = sum(_len(_sub(cubic_point(curve, (k + 1) / 20), cubic_point(curve, k / 20))) for k in range(20))
    head_len = min(HEAD_LEN, length * 0.3)
    head_half = HEAD_HALF * head_len / HEAD_LEN
    # Stop the stroke inside the head so a square line end never pokes past the tip.
    lo, hi = 0.5, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if _len(_sub(cubic_point(curve, mid), tip)) > head_len * 0.7:
            lo = mid
        else:
            hi = mid
    shaft = cubic_split_left(curve, lo)
    direction = _unit(_sub(tip, cubic_point(curve, 0.97)))
    base = _add(tip, direction, -head_len)
    perp = (-direction[1], direction[0])
    head = [tip, _add(base, perp, head_half), _add(base, perp, -head_half)]
    x0, y0, x1, y1 = cubic_bbox(shaft)
    hx = [q[0] for q in head]
    hy = [q[1] for q in head]
    return {
        "arrow": arrow,
        "shaft": shaft,
        "head": head,
        "shaft_box": (x0, y0, x1, y1),
        "box": (min(x0, *hx), min(y0, *hy), max(x1, *hx), max(y1, *hy)),
        "pair": pair["id"] if pair else None,
        "cost": cost,
    }


def svg_and_elements(planned: list[dict[str, Any]], ink: str, dy: float, describe) -> tuple[str, list[dict[str, Any]]]:
    """SVG for the planned arrows shifted down by `dy`, and their declarations.

    Each arrow is a <g> (the curve and its filled head under one id, declared with the union box) and, inside it,
    the curve itself as a declared <path>: a <g> is skipped by module-labels-clear-of-strokes, a <path> is not, so
    declaring the curve on its own puts every label in the figure to the test against the arrow's real stroke.
    """
    parts: list[str] = []
    elements: list[dict[str, Any]] = []

    def box(b: tuple[float, float, float, float]) -> dict[str, float]:
        return {"x": round(b[0], 2), "y": round(b[1] + dy, 2), "width": round(b[2] - b[0], 2), "height": round(b[3] - b[1], 2)}

    for k, item in enumerate(planned):
        s = [(x, y + dy) for x, y in item["shaft"]]
        h = [(x, y + dy) for x, y in item["head"]]
        gid = f"e-arrow-{k}"
        parts.append(
            f'<g data-pr-id="{gid}">'
            f'<path data-pr-id="{gid}-curve" d="M {s[0][0]:.2f} {s[0][1]:.2f} C {s[1][0]:.2f} {s[1][1]:.2f} '
            f'{s[2][0]:.2f} {s[2][1]:.2f} {s[3][0]:.2f} {s[3][1]:.2f}" fill="none" stroke="{ink}" '
            f'stroke-width="{STROKE}"/>'
            f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x, y in h)}" fill="{ink}"/>'
            f"</g>"
        )
        arrow: Arrow = item["arrow"]
        claim = f"electron pair moves: {describe(arrow)} ({arrow.why})"
        elements.append({"id": gid, "kind": "decoration", "claim": claim, "declaredBox": box(item["box"])})
        elements.append(
            {"id": f"{gid}-curve", "kind": "decoration", "claim": f"the curve of arrow {k + 1}", "declaredBox": box(item["shaft_box"])}
        )
    return "".join(parts), elements
