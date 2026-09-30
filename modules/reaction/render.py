"""Reaction-scheme figure module for Prancheta.

Reactants, an arrow, reagents/conditions over the arrow, products -- the
figure a textbook draws for any reaction, not just one. It computes nothing
that modules/molecule/render.py doesn't already compute: this module's own
job is purely the packing problem molecule-drawing does NOT solve --
arranging several independently-sized molecule sub-figures in a row without
collision, and placing condition text on the arrow without it colliding with
either neighbour. See docs/research/candidate-modules.md, candidate #1.

Reads one JSON document on stdin ({"width": ..., "height": ...}), writes one
on stdout. Declares what it drew; does not certify that what it drew is
correct -- the core measures that. See decision 0005.

Flags: --name= / --reaction=, --conditions=, --theme=print|light|dark (print is
the default), --display= (textbook form of each component, CHECKED against the
computed formula: see formula.py), --equilibrium (a reversible arrow),
--lone-pairs (dots for non-bonding pairs in the structures), --arrows= (curved
electron-pushing arrows, verified: see arrows.py), --dative=arrow|line,
--states=g;l>>aq;aq (state symbols, from the closed set s, l, g, aq),
--coefficients=1;3>>2 (real stoichiometric coefficients, one per component;
the equation is then CHECKED to balance in atoms and charge), --balanced (the
same check on the coefficients the reaction SMILES implies by repeating a
component), --answers=true|false (false: the products are not drawn, a "?"
stands where they are; the curved arrows, which belong to the reactants, stay),
--misdeclare.

The canvas is trimmed to the drawing; the requested width/height are ignored
except that the structures are never scaled above their natural size.
"""

from __future__ import annotations

import html
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

# molecule/render.py is a sibling module, not an installed package. Reusing
# its render() function directly -- rather than re-deriving 2D chemical
# depiction here -- is the whole point: this module owns layout, not
# chemistry.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "molecule"))
import render as molecule_module  # noqa: E402
from render import (  # noqa: E402
    THEMES,
    DEFAULT_THEME,
    bare_atom_hydrogens,
    render as render_molecule,
    embed_tile,
    runs_plain,
    runs_svg,
    runs_width,
)
import formula  # noqa: E402
import arrows as arrow_module  # noqa: E402

from rdkit import Chem, RDLogger  # noqa: E402

RDLogger.DisableLog("rdApp.warning")  # e.g. RDKit's note about a bare [H+]: it is a proton, not a mistake

# The font this figure's text is set in.
#
# Handed down by the core with the canvas size, because the core is what
# MEASURES the result and the two have to agree about which glyphs were drawn.
# The default is only for running this script by hand; a real invocation always
# supplies it. See src/modules/protocol.ts.
FONT_STACK = "Segoe UI, sans-serif"

NAMED: dict[str, dict[str, Any]] = {
    "glucose_combustion": {
        "reaction": (
            "OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O.O=O.O=O.O=O.O=O.O=O.O=O"
            ">>"
            "O=C=O.O=C=O.O=C=O.O=C=O.O=C=O.O=C=O.O.O.O.O.O.O"
        ),
        "conditions": "cellular respiration",
    },
    "photosynthesis": {
        "reaction": (
            "O=C=O.O=C=O.O=C=O.O=C=O.O=C=O.O=C=O.O.O.O.O.O.O"
            ">>"
            "OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O.O=O.O=O.O=O.O=O.O=O.O=O"
        ),
        "conditions": "light, chlorophyll",
    },
    "combustion_methane": {
        "reaction": "C.O=O.O=O>>O=C=O.O.O",
        "conditions": "combustion",
    },
    "esterification": {
        "reaction": "CC(=O)O.CCO>>CC(=O)OCC.O",
        "conditions": "H+, Δ",
    },
    # Acid-base exercise figures (Arrhenius, Brønsted-Lowry, Lewis).
    "arrhenius_hcl": {
        "reaction": "Cl.O>>[OH3+].[Cl-]",
        "conditions": "",
    },
    "bronsted_nh3": {
        "reaction": "N.O>>[NH4+].[OH-]",
        "conditions": "",
        "display": "NH3;H2O>>NH4+;OH-",
        "equilibrium": True,
    },
    # Atom maps ([B:1], [NH3:2]) only name atoms for the curved arrows; the
    # formulas and the drawing are those of the plain species.
    "lewis_bf3_nh3": {
        "reaction": "F[B:1](F)F.[NH3:2]>>F[B-](F)(F)[NH3+]",
        "conditions": "",
        "display": "BF3;NH3>>F3B-NH3",
        "lone_pairs": True,
        "arrows": "lp:2>1",
    },
    "bronsted_hcl_h2o": {
        "reaction": "[Cl:1][H:2].[OH2:3]>>[OH3+].[Cl-]",
        "conditions": "",
        "display": "HCl;H2O>>H3O+;Cl-",
        "lone_pairs": True,
        "arrows": "lp:3>2;bond:2-1>1",
    },
    "bronsted_nh3_h2o": {
        "reaction": "[NH3:1].[H:2][OH:3]>>[NH4+].[OH-]",
        "conditions": "",
        "display": "NH3;H2O>>NH4+;OH-",
        "equilibrium": True,
        "lone_pairs": True,
        "arrows": "lp:1>2;bond:2-3>3",
    },
    "complex_silver_ammonia": {
        "reaction": "[Ag+].N.N>>N->[Ag+]<-N",
        "conditions": "",
        "display": "Ag+;NH3>>[Ag(NH3)2]+",
        "lone_pairs": True,
    },
    # Equations with state symbols and numbered coefficients, checked to balance.
    "haber_process": {
        "reaction": "N#N.[H][H]>>N",
        "conditions": "Fe, 450 °C",
        "coefficients": "1;3>>2",
        "states": "g;g>>g",
    },
    "ammonia_sulfate": {
        "reaction": "N.OS(=O)(=O)O>>[NH4+].[O-]S(=O)(=O)[O-]",
        "conditions": "",
        "coefficients": "2;1>>2;1",
        "states": "g;aq>>aq;aq",
    },
}
STATES = ("s", "l", "g", "aq")  # the closed set --states accepts
NBSP = chr(0xA0)  # between a coefficient and its formula: "2 NH3"

TILE_MAX_W, TILE_MAX_H = 300.0, 230.0
STRUCT_FONT = 18.0  # atom labels in the structure row
STRUCT_BOND = 58.0  # bond length in the structure row
STRUCT_DOT = 2.7  # lone-pair dot radius in EVERY tile of the structure row (a bare ion's too): larger than a lone molecule's, it is read from further
TILE_GAP = 30.0
ARROW_W = 130.0
PAD = 20.0

EQN_FONT = 30.0
EQN_Y = 50.0
EQN_GAP = 18.0
PLUS_FONT = 24.0
COEFF_BAND = 20.0  # room above the structures for a "6x" when some coefficient is above 1


def strip_maps(token: str) -> str:
    """The component without atom-map numbers ([NH3:2] -> N): maps only ADDRESS atoms (for --arrows), so the
    formula, the display check, the textbook writer and the coefficient count all see the plain species."""
    if ":" not in token:
        return token
    mol = Chem.MolFromSmiles(token)
    if mol is None:
        raise ValueError(f"not a valid SMILES string: {token!r}")
    for atom in mol.GetAtoms():
        atom.SetAtomMapNum(0)
    return Chem.MolToSmiles(mol)


def structural_smiles(smiles: str) -> str:
    """A bare, unconnected atom -- water's "O", methane's "C" -- has no bond
    to draw under the skeletal convention, so it gets explicit hydrogens and a
    real 2D structure (see molecule/render.py's bare_atom_hydrogens)."""
    return bare_atom_hydrogens(smiles)


def formula_text(mol: "Chem.Mol") -> str:
    """The automatic written form of a component, as plain text with real
    sub/superscript characters -- kept for callers that want a string."""
    counts, charge = formula.composition(mol)
    runs = auto_runs(mol, counts, charge)
    sub = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
    sup = str.maketrans("0123456789+−", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻")
    return "".join(t.translate(sub) if m == "sub" else t.translate(sup) if m == "sup" else t for t, m in runs)


def hill_text(mol: "Chem.Mol") -> str:
    from rdkit.Chem import rdMolDescriptors

    return rdMolDescriptors.CalcMolFormula(mol)


def auto_runs(mol: "Chem.Mol", counts: Counter, charge: int) -> list[formula.Run]:
    text = formula.auto_display(mol, counts, charge)
    # The writer is not trusted either: what it wrote goes through the same
    # verifier a typed --display does.
    return formula.verify_display(text, counts, charge, hill_text(mol), "the automatic writer")


def signed(n: int) -> str:
    return f"{n:+d}" if n else "0"


def est_text_width(text: str, font: float) -> float:
    """A layout budget for plain text, not a real measurement -- Python has no
    font engine, and the checks verify the rendered text, not this estimate."""
    return sum(font * 0.64 for _ in text)


embed = embed_tile  # the id/box rewriting lives with the molecule module, which the resonance row shares


def parse_display(display: str, n_lhs_tokens: int, n_rhs_tokens: int, flag: str = "--display") -> tuple[list[str], list[str]]:
    """`A;B>>C;D` -> (["A", "B"], ["C", "D"]). Either side may be empty; so may a component."""
    if ">>" not in display:
        raise formula.DisplayError(
            f"{flag} must mirror the reaction: components separated by ';' and the sides by '>>' (got {display!r})"
        )
    lhs, rhs = display.split(">>", 1)
    return [c.strip() for c in lhs.split(";")] if lhs.strip() else [], [
        c.strip() for c in rhs.split(";")
    ] if rhs.strip() else []


def render(
    width: float,
    height: float,
    reaction: str,
    conditions: str,
    misdeclare: bool,
    *,
    theme: str = DEFAULT_THEME,
    display: str | None = None,
    equilibrium: bool = False,
    lone_pairs: bool = False,
    arrows: str | None = None,
    dative: str = "arrow",
    answers: bool = True,
    states: str | None = None,
    coefficients: str | None = None,
    balanced: bool = False,
) -> dict[str, Any]:
    if ">>" not in reaction:
        raise ValueError(f"not a reaction SMILES (expected 'A.B>>C.D'): {reaction!r}")
    if theme not in THEMES:
        raise ValueError(f"unknown theme {theme!r}; known: {', '.join(THEMES)}")
    ink, dim, paper = THEMES[theme]["ink"], THEMES[theme]["dim"], THEMES[theme]["bg"]
    lhs, rhs = reaction.split(">>", 1)
    arrow_list = arrow_module.parse(arrows) if arrows else []
    if arrow_list:
        lone_pairs = True  # an arrow leaves a lone pair: the pairs must be drawn for it to leave from

    # The first way each component was written, atom maps and all: that is what
    # is drawn, so a map number in it still names an atom of the drawing.
    mapped_form: dict[str, str] = {}
    for token in [t for t in lhs.split(".") if t] + [t for t in rhs.split(".") if t]:
        mapped_form.setdefault(strip_maps(token), token)

    def tokens_of(text: str) -> list[str]:
        return [strip_maps(token) for token in text.split(".") if token]

    def side(text: str) -> list[tuple[str, int]]:
        toks = tokens_of(text)
        counts = Counter(toks)
        seen: list[str] = []
        for token in toks:
            if token not in seen:
                seen.append(token)
        return [(token, counts[token]) for token in seen]

    reactants, products = side(lhs), side(rhs)

    def align(flag: str, text: str, given: list[str], side_name: str, toks: list[str]) -> list[tuple[str, str]]:
        """A flag's per-component values, `A;B` for one side, matched to that side's components: one value per
        component as written, or one per distinct component."""
        unique = list(dict.fromkeys(toks))
        if not given:
            return []
        if len(given) == len(toks):
            pairs = list(zip(toks, given))
        elif len(given) == len(unique):
            pairs = list(zip(unique, given))
        else:
            raise formula.DisplayError(
                f"{flag} has {len(given)} value(s) on the {side_name} side but the reaction has "
                f"{len(toks)} component(s) ({len(unique)} distinct): give one per component, in order"
            )
        out: dict[str, str] = {}
        for smiles, value in pairs:
            if smiles in out and out[smiles] != value:
                raise formula.DisplayError(f"{flag} gives the same component {smiles!r} two values on the {side_name} side: {out[smiles]!r} and {value!r}")
            out[smiles] = value
        return list(out.items())

    # --- coefficients: numbers given here, or the repetitions counted above ------
    if coefficients is not None:
        c_lhs, c_rhs = parse_display(coefficients, 0, 0, "--coefficients")
        numbered: list[list[tuple[str, int]]] = []
        for side_name, text, given, current in (("left", lhs, c_lhs, reactants), ("right", rhs, c_rhs, products)):
            toks = tokens_of(text)
            for smiles, n in current:
                if n > 1:
                    raise formula.DisplayError(
                        f"--coefficients: {smiles!r} is written {n} times on the {side_name} side of --reaction; write it "
                        "once and give its coefficient there, not both"
                    )
            values = dict(align("--coefficients", text, given, side_name, toks))
            row: list[tuple[str, int]] = []
            for smiles, _ in current:
                raw = values.get(smiles, "").strip()
                if raw == "":
                    row.append((smiles, 1))
                    continue
                if not re.fullmatch(r"[1-9]\d*", raw):
                    raise formula.DisplayError(f"--coefficients: {raw!r} is not a whole number of 1 or more (component {smiles!r})")
                row.append((smiles, int(raw)))
            numbered.append(row)
        reactants, products = numbered

    # --- state symbols, from a closed set ---------------------------------------
    state_of: dict[tuple[str, str], str] = {}
    if states is not None:
        s_lhs, s_rhs = parse_display(states, 0, 0, "--states")
        for side_name, key, text, given in (("left", "lhs", lhs, s_lhs), ("right", "rhs", rhs, s_rhs)):
            for smiles, value in align("--states", text, given, side_name, tokens_of(text)):
                symbol = value.strip().strip("()").strip()
                if symbol == "":
                    continue
                if symbol not in STATES:
                    raise formula.DisplayError(
                        f"--states: {value!r} is not a state symbol; known: {', '.join(STATES)}"
                    )
                state_of[(key, smiles)] = symbol

    # --- what each component is, computed; and what it is written as ---------
    computed: dict[str, tuple[Counter, int, str]] = {}
    for smiles, _ in reactants + products:
        if smiles in computed:
            continue
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise ValueError(f"not a valid SMILES string: {smiles!r}")
        counts, charge = formula.composition(mol)
        computed[smiles] = (counts, charge, hill_text(mol))

    # --- does the equation balance? Atoms (hydrogens included) and charge, from the computed formulas x coefficients
    def totals(components: list[tuple[str, int]]) -> tuple[Counter, int]:
        atoms: Counter = Counter()
        charge_total = 0
        for smiles, n in components:
            counts, charge, _ = computed[smiles]
            for element, k in counts.items():
                atoms[element] += n * k
            charge_total += n * charge
        return atoms, charge_total

    left_atoms, left_charge = totals(reactants)
    right_atoms, right_charge = totals(products)
    differences = [
        f"{element}: {left_atoms[element]} on the left, {right_atoms[element]} on the right"
        for element in sorted(set(left_atoms) | set(right_atoms))
        if left_atoms[element] != right_atoms[element]
    ]
    if left_charge != right_charge:
        differences.append(f"charge: {signed(left_charge)} on the left, {signed(right_charge)} on the right")
    if differences and (coefficients is not None or balanced):
        raise ValueError(
            "the equation is not balanced -- " + "; ".join(differences)
            + ("" if coefficients is not None else " (the coefficients are the repetitions in --reaction)")
        )

    typed: dict[str, str] = {}  # smiles -> the display string the author gave it
    if display is not None:
        d_lhs, d_rhs = parse_display(display, len(tokens_of(lhs)), len(tokens_of(rhs)))
        for side_name, text, given in (("left", lhs, d_lhs), ("right", rhs, d_rhs)):
            toks = tokens_of(text)
            unique = list(dict.fromkeys(toks))
            if not given:
                continue
            if len(given) == len(toks):
                pairs = list(zip(toks, given))
            elif len(given) == len(unique):
                pairs = list(zip(unique, given))
            else:
                raise formula.DisplayError(
                    f"--display has {len(given)} component(s) on the {side_name} side but the reaction has "
                    f"{len(toks)} ({len(unique)} distinct): give one per component, in order"
                )
            for smiles, shown in pairs:
                if not shown:
                    continue
                if smiles in typed and typed[smiles] != shown:
                    raise formula.DisplayError(
                        f"--display writes the same component {smiles!r} two ways: {typed[smiles]!r} and {shown!r}"
                    )
                typed[smiles] = shown

    written: dict[str, list[formula.Run]] = {}
    for smiles, (counts, charge, hill) in computed.items():
        if smiles in typed:
            written[smiles] = formula.verify_display(
                typed[smiles], counts, charge, hill, f"component {smiles!r}"
            )
        else:
            written[smiles] = auto_runs(Chem.MolFromSmiles(smiles), counts, charge)

    # --- row 2 first, because its tiles' real sizes decide the canvas ---------
    structures: list[str] = []
    elements: list[dict[str, Any]] = []
    seen_smiles: dict[str, int] = {}
    order: list[str] = []
    for smiles, count in reactants + products:
        if smiles not in seen_smiles:
            seen_smiles[smiles] = count
            order.append(smiles)

    def draw_tiles(hints: dict[int, list[tuple[int, float, str]]]) -> list[dict[str, Any]]:
        drawn_tiles: list[dict[str, Any]] = []
        for i, smiles in enumerate(order):
            drawn = structural_smiles(mapped_form.get(smiles, smiles))
            # EVERY tile is drawn at one atom-label size and one dot size, a bare
            # ion ([Cl-], [Ag+]) included. An earlier version drew a bare ion at the
            # equation weight (34 px, bigger dots) so it would not look barely
            # there beside a skeleton; it then read as a different kind of thing
            # from the atom labels of its neighbours, which it is not.
            out = render_molecule(
                TILE_MAX_W, TILE_MAX_H, drawn, misdeclare=False, theme=theme, lone_pairs=lone_pairs,
                font_px=STRUCT_FONT, bond_px=STRUCT_BOND, dative=dative, dot_px=STRUCT_DOT, face=hints.get(i),
            )
            drawn_tiles.append({"smiles": smiles, "out": out, "w": float(out["_size"][0]), "h": float(out["_size"][1])})
        return drawn_tiles

    tiles = draw_tiles({})
    reactant_order = [smiles for smiles, _ in reactants]
    if arrow_list:
        if set(reactant_order) & {s for s, _ in products}:
            raise ValueError("--arrows: a component that is both a reactant and a product cannot be addressed unambiguously")
        # Arrows address the reactants as drawn (explicit hydrogens included),
        # component n being the n-th reactant as written -- which is also the
        # n-th tile, reactants coming first.
        arrow_tiles = [
            arrow_module.Tile(n + 1, runs_plain(written[smiles]), tiles[order.index(smiles)]["out"]["_mol"])
            for n, smiles in enumerate(reactant_order)
        ]
        arrow_module.verify(arrow_list, arrow_tiles)
        tiles = draw_tiles(arrow_module.face_hints(arrow_list))

    any_coefficient = any(seen_smiles[t["smiles"]] > 1 for t in tiles)
    row_h = max((t["h"] for t in tiles), default=0.0)
    row2_w = sum(t["w"] for t in tiles) + TILE_GAP * max(len(tiles) - 1, 0)

    # --- row 1: the equation, letters and numbers only -----------------------
    def build_equation(x0: float, hide_products: bool = False) -> tuple[list[str], list[dict[str, Any]], float]:
        eq: list[str] = []
        els: list[dict[str, Any]] = []
        cursor = x0
        token_index = 0

        def place(runs: list[formula.Run], font: float, weight: int, colour: str, id_: str | None, claim: str | None) -> None:
            nonlocal cursor
            id_attr = f' data-pr-id="{id_}"' if id_ else ""
            eq.append(
                f'<text{id_attr} x="{cursor:.2f}" y="{EQN_Y:.2f}" text-anchor="start" '
                f'dominant-baseline="middle" font-family="{FONT_STACK}" font-size="{font:.0f}" '
                f'font-weight="{weight}" fill="{colour}">{runs_svg(runs, font)}</text>'
            )
            if id_:
                els.append({"id": id_, "kind": "label", "claim": claim or runs_plain(runs)})
            cursor += runs_width(runs, font) + EQN_GAP

        def place_side(components: list[tuple[str, int]], side_name: str) -> None:
            nonlocal token_index
            if hide_products and side_name == "rhs":
                # The question: what the products are is what is asked, so one "?" stands in for all of them.
                place([("?", "n")], EQN_FONT, 700, ink, f"eqn-{side_name}-{token_index}", "?")
                token_index += 1
                return
            for i, (smiles, count) in enumerate(components):
                if i > 0:
                    place([("+", "n")], PLUS_FONT, 400, dim, None, None)
                state = state_of.get((side_name, smiles))
                state_runs: list[formula.Run] = [(f"({state})", "state")] if state else []
                # "2 NH3": the coefficient, a no-break space, the formula: one token at one baseline.
                runs = ([(f"{count}{NBSP}", "n")] if count > 1 else []) + written[smiles] + state_runs
                shown = runs_plain(written[smiles]) + (f"({state})" if state else "")
                place(
                    runs, EQN_FONT, 700, ink, f"eqn-{side_name}-{token_index}",
                    f"{count} x {shown}" if count > 1 else shown,
                )
                token_index += 1

        place_side(reactants, "lhs")
        cursor += PAD / 2
        ax0, ax1 = cursor, cursor + ARROW_W
        ay = EQN_Y
        if not equilibrium:
            # Line and arrowhead share one id, grouped, so the declared box can
            # honestly cover the whole arrow including its tip. Declaring only
            # the <line>'s own span (which stops 10px short, to make room for
            # the arrowhead) was the first version, and module-geometry-agrees
            # caught the 10px gap immediately.
            eq.append(
                f'<g data-pr-id="reaction-arrow">'
                f'<line x1="{ax0:.2f}" y1="{ay:.2f}" x2="{ax1 - 10:.2f}" y2="{ay:.2f}" '
                f'stroke="{ink}" stroke-width="2"/>'
                f'<path d="M {ax1 - 10:.2f} {ay - 5:.2f} L {ax1:.2f} {ay:.2f} '
                f'L {ax1 - 10:.2f} {ay + 5:.2f} Z" fill="{ink}"/>'
                f"</g>"
            )
            box = {"x": round(ax0, 2), "y": round(ay - 5, 2), "width": round(ax1 - ax0, 2), "height": 10.0}
            top = ay - 5
        else:
            # Two half-arrows, one above the other: the upper points right with
            # a barb on its upper side, the lower points left with a barb on its
            # lower side. Each line runs the full length to its own tip, so the
            # group's geometric extent is exactly what the box below says.
            sep, barb_len, barb_h, barb_in = 4.0, 14.0, 7.0, 8.0
            yt, yb = ay - sep, ay + sep
            eq.append(
                f'<g data-pr-id="reaction-arrow">'
                f'<line x1="{ax0:.2f}" y1="{yt:.2f}" x2="{ax1:.2f}" y2="{yt:.2f}" stroke="{ink}" stroke-width="2"/>'
                f'<polygon points="{ax1:.2f},{yt:.2f} {ax1 - barb_len:.2f},{yt - barb_h:.2f} {ax1 - barb_in:.2f},{yt:.2f}" fill="{ink}"/>'
                f'<line x1="{ax1:.2f}" y1="{yb:.2f}" x2="{ax0:.2f}" y2="{yb:.2f}" stroke="{ink}" stroke-width="2"/>'
                f'<polygon points="{ax0:.2f},{yb:.2f} {ax0 + barb_len:.2f},{yb + barb_h:.2f} {ax0 + barb_in:.2f},{yb:.2f}" fill="{ink}"/>'
                f"</g>"
            )
            box = {
                "x": round(ax0, 2),
                "y": round(yt - barb_h, 2),
                "width": round(ax1 - ax0, 2),
                "height": round((yb + barb_h) - (yt - barb_h), 2),
            }
            top = yt - barb_h
        els.append(
            {
                "id": "reaction-arrow",
                "kind": "decoration",
                "claim": "the reaction is reversible: it proceeds both ways" if equilibrium else "reaction proceeds from reactants to products",
                "declaredBox": box,
            }
        )
        if conditions:
            eq.append(
                f'<text data-pr-id="reaction-conditions" x="{(ax0 + ax1) / 2:.2f}" '
                f'y="{top - 9:.2f}" text-anchor="middle" font-family="{FONT_STACK}" '
                f'font-size="13" fill="{dim}">{html.escape(conditions)}</text>'
            )
            # No owner: the arrow is a decoration, not a filled feature a label
            # sits "inside" -- that ownership relation doesn't apply here, and
            # forcing it produced a false module-label-within-feature failure
            # (a <line>/<g> has no isPointInFill target to test against). The
            # relationship this label actually needs checked --  clear of the
            # arrow's own ink -- is module-labels-clear-of-strokes, which applies
            # to every label against every decoration regardless of ownership.
            els.append({"id": "reaction-conditions", "kind": "label", "claim": conditions})
        cursor = ax1 + PAD / 2
        place_side(products, "rhs")
        return eq, els, cursor - EQN_GAP

    _, _, eqn_end = build_equation(0.0)
    content_w = max(eqn_end, row2_w)
    canvas_w = round(content_w + 2 * PAD + 0.5)
    # The question keeps the solution canvas and the solution x for every reactant: the equation is laid out as
    # the full one and only what stands where the products are differs.
    equation, eq_elements, _ = build_equation((canvas_w - eqn_end) / 2, hide_products=not answers)
    elements.extend(eq_elements)

    # --- row 2: a real structural drawing for EVERY participant ---------------
    row2_top = EQN_Y + 32.0 + (COEFF_BAND if any_coefficient else 0.0)

    # Curved arrows are planned in the row's own frame (y = 0 at the row's
    # top), because how far they arc above or below the tiles decides where
    # the row goes and how tall the canvas is.
    planned: list[dict[str, Any]] = []
    arrow_bottom = 0.0
    if arrow_list:
        x = (canvas_w - row2_w) / 2
        placed: list[arrow_module.Placed] = []
        coeff_boxes: list[tuple[float, float, float, float]] = []
        for tile in tiles:
            ty_rel = (row_h - tile["h"]) / 2
            placed.append(arrow_module.Placed(tile["out"]["_geometry"], x, ty_rel))
            if seen_smiles[tile["smiles"]] > 1:
                coeff_boxes.append((x + tile["w"] / 2 - 14, ty_rel - 12, x + tile["w"] / 2 + 14, ty_rel + 8))
            x += tile["w"] + TILE_GAP
        planned = arrow_module.plan(arrow_list, placed, (PAD / 2, canvas_w - PAD / 2), coeff_boxes)
        top = min(p["box"][1] for p in planned)
        if top < 4.0:
            row2_top += 4.0 - top
        arrow_bottom = max(p["box"][3] for p in planned) - row_h
    cursor = (canvas_w - row2_w) / 2
    product_only = {smiles for smiles, _ in products} - {smiles for smiles, _ in reactants}
    for i, tile in enumerate(tiles):
        prefix = f"m{i}"
        ty = row2_top + (row_h - tile["h"]) / 2
        if not answers and tile["smiles"] in product_only:
            cursor += tile["w"] + TILE_GAP  # not drawn, but its room is kept
            continue
        wrapped, mol_elements = embed(tile["out"], cursor, ty, prefix)
        structures.append(wrapped)
        elements.extend(mol_elements)
        count = seen_smiles[tile["smiles"]]
        if count > 1:
            label_id = f"{prefix}-coeff"
            structures.append(
                f'<text data-pr-id="{label_id}" x="{cursor + tile["w"] / 2:.2f}" '
                f'y="{ty - 2:.2f}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="{FONT_STACK}" '
                f'font-size="16" font-weight="600" fill="{ink}">{count}x</text>'
            )
            elements.append(
                {"id": label_id, "kind": "label", "claim": f"stoichiometric coefficient {count}, times this structure"}
            )
        cursor += tile["w"] + TILE_GAP

    canvas_h = round(row2_top + row_h + max(arrow_bottom, 0.0) + PAD * 0.4 + 0.5) if tiles else round(EQN_Y + PAD * 2)

    arrow_svg = ""
    if planned:
        arrow_svg, arrow_elements = arrow_module.svg_and_elements(planned, ink, row2_top, lambda a: a.text)
        elements.extend(arrow_elements)

    if misdeclare:
        elements.append(
            {
                "id": "reagent-phantom",
                "kind": "label",
                "claim": "a reagent label that was never drawn",
            }
        )
        for element in elements:
            if element["id"] == "reaction-arrow":
                box = element["declaredBox"]
                element["declaredBox"] = {**box, "width": box["width"] + 60.0}
                break

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w}" height="{canvas_h}" '
        f'viewBox="0 0 {canvas_w} {canvas_h}">'
        f'<rect x="0" y="0" width="{canvas_w}" height="{canvas_h}" fill="{paper}"/>'
        f'<g data-pr-layer="equation">{"".join(equation)}</g>'
        f'<g data-pr-layer="structures">{"".join(structures)}</g>'
        + (f'<g data-pr-layer="electron-arrows">{arrow_svg}</g>' if arrow_svg else "")
        + "</svg>"
    )

    notes = []
    if differences:
        notes.append("balance: not balanced as written (" + "; ".join(differences) + ") -- not checked, no --coefficients or --balanced")
    else:
        notes.append(
            "balance: atoms and charge balance ("
            + ", ".join(f"{k} {v}" for k, v in sorted(left_atoms.items()))
            + f"; charge {signed(left_charge)})"
        )
    if state_of:
        notes.append(f"state symbols from the closed set {', '.join(STATES)}: {len(state_of)} component(s)")
    if not answers:
        notes.append(
            "answers hidden: the products are not drawn and a ? stands in the equation; "
            + (f"{len(planned)} curved arrow(s) of the reactants stay" if planned else "no curved arrows")
        )
    if display is not None and typed:
        notes.append(f"display forms checked against the computed formula: {len(typed)} component(s)")
    if planned:
        notes.append(
            f"{len(planned)} curved arrow(s) verified: "
            + "; ".join(f"{p['arrow'].text} ({p['arrow'].why})" for p in planned)
        )
    if misdeclare:
        notes.append(
            "misdeclare mode: a phantom reagent label declared, and the arrow's own "
            "geometry widened 60px beyond what it drew"
        )
    return {"svg": svg, "elements": elements, "notes": notes}


def main() -> int:
    sys.stderr.reconfigure(errors="replace")  # a typed display may hold characters the console codepage lacks
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    equilibrium = "--equilibrium" in args
    lone_pairs = "--lone-pairs" in args
    arrows = next((a.split("=", 1)[1] for a in args if a.startswith("--arrows=")), None)
    states = next((a.split("=", 1)[1] for a in args if a.startswith("--states=")), None)
    coefficients = next((a.split("=", 1)[1] for a in args if a.startswith("--coefficients=")), None)
    balanced = "--balanced" in args
    answers_arg = next((a.split("=", 1)[1].lower() for a in args if a.startswith("--answers=")), "true")
    if answers_arg not in ("true", "false"):
        raise SystemExit(f"unknown --answers={answers_arg!r}; known: true, false")
    dative = next((a.split("=", 1)[1] for a in args if a.startswith("--dative=")), "arrow")
    if dative not in ("arrow", "line"):
        raise SystemExit(f"unknown --dative={dative!r}; known: arrow, line")
    reaction_arg = next((a for a in args if a.startswith("--reaction=")), None)
    name_arg = next((a for a in args if a.startswith("--name=")), None)
    display = next((a.split("=", 1)[1] for a in args if a.startswith("--display=")), None)
    theme = next((a.split("=", 1)[1] for a in args if a.startswith("--theme=")), DEFAULT_THEME)
    if theme not in THEMES:
        raise SystemExit(f"unknown --theme={theme!r}; known: {', '.join(THEMES)}")

    if reaction_arg is not None:
        reaction = reaction_arg.split("=", 1)[1]
        conditions = next((a.split("=", 1)[1] for a in args if a.startswith("--conditions=")), "")
    else:
        key = name_arg.split("=", 1)[1].lower() if name_arg is not None else "glucose_combustion"
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(NAMED)}")
        entry = NAMED[key]
        reaction = entry["reaction"]
        conditions = next((a.split("=", 1)[1] for a in args if a.startswith("--conditions=")), entry["conditions"])
        display = display if display is not None else entry.get("display")
        equilibrium = equilibrium or bool(entry.get("equilibrium"))
        lone_pairs = lone_pairs or bool(entry.get("lone_pairs"))
        arrows = arrows if arrows is not None else entry.get("arrows")
        states = states if states is not None else entry.get("states")
        coefficients = coefficients if coefficients is not None else entry.get("coefficients")

    raw = sys.stdin.read().strip()
    request = json.loads(raw) if raw else {}
    # The face the CORE will measure this SVG against, handed down with the
    # canvas size. Naming a font the measuring machine does not have is how the
    # same figure becomes two different figures.
    global FONT_STACK
    FONT_STACK = str(request.get("fontFamily", FONT_STACK))
    # The embedded molecule tiles are drawn by modules/molecule/render.py, which
    # keeps its own copy of this constant. Setting only ours would leave every
    # atom label in a face the core is not measuring against.
    molecule_module.FONT_STACK = FONT_STACK
    width = float(request.get("width", 900))
    height = float(request.get("height", 260))
    try:
        out = render(
            width, height, reaction, conditions, misdeclare,
            theme=theme, display=display, equilibrium=equilibrium, lone_pairs=lone_pairs,
            arrows=arrows, dative=dative, answers=answers_arg == "true", states=states,
            coefficients=coefficients, balanced=balanced,
        )
    except (formula.DisplayError, ValueError) as err:
        raise SystemExit(f"error: {err}")
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
