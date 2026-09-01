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
"""

from __future__ import annotations

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
from render import render as render_molecule  # noqa: E402

from rdkit import Chem  # noqa: E402
from rdkit.Chem import rdMolDescriptors  # noqa: E402

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
}

TILE_W, TILE_H = 230.0, 190.0
PLUS_W = 40.0
ARROW_W = 130.0
PAD = 24.0
STROKE = "#E6E9EF"
DIM = "#9AA4B2"
BG = "#0F1115"

ID_ATTR = re.compile(r'data-pr-id="([^"]*)"')
SUBSCRIPT = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")


def structural_smiles(smiles: str) -> str:
    """A bare, unconnected atom -- water's "O", methane's "C" -- has no bond
    to draw under the skeletal convention: hydrogens fold into the heavy
    atom's own label (see molecule/render.py's atom_label()), which is the
    right call once there's a real skeleton to show, and produces an entirely
    blank tile -- not even a label, since carbon's own label is suppressed --
    once there isn't. `combustion_methane`'s methane tile declared ZERO
    elements under the original code, found by checking what this module
    actually declared rather than assuming a small molecule degrades
    gracefully to text. Adding explicit hydrogen atoms turns "nothing to
    draw" into a real, if small, 2D structure -- the honest structural answer
    this row exists to give, not a workaround for a rendering gap.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is not None and mol.GetNumBonds() == 0:
        return Chem.MolToSmiles(Chem.AddHs(mol))
    return smiles


def formula_text(mol: "Chem.Mol") -> str:
    raw = rdMolDescriptors.CalcMolFormula(mol)
    # CalcMolFormula already orders elements Hill-style (C, H, then alphabetical)
    # and folds charge into a trailing +/-; only the digit run after each
    # element needs turning into a real subscript for a textbook look.
    return re.sub(r"\d+", lambda m: m.group(0).translate(SUBSCRIPT), raw)


SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉"


def est_text_width(text: str, font: float) -> float:
    """A layout budget, not a real measurement -- Python has no font engine,
    the same reason every text element in this repertoire goes undeclared or
    unmeasured until the browser lays it out for real, and the checks verify
    THAT rendered text, not this estimate. It only has to be generous enough
    that an honest layout doesn't collide; a real Unicode subscript digit
    renders narrower than a full-height glyph, so it's weighted down rather
    than counted the same as one.
    """
    return sum(font * (0.5 if ch in SUBSCRIPT_DIGITS else 0.64) for ch in text)


def embed(mol_output: dict[str, Any], tx: float, ty: float, prefix: str) -> tuple[str, list[dict[str, Any]]]:
    """Wraps one molecule sub-render at (tx, ty), with every declared id and
    declaredBox rewritten into this figure's shared id-space and canvas space.

    The alternative -- letting each molecule keep its own bare ids -- breaks
    the very first time two reactants declare "atom-0-label", which every
    reaction with more than one component does. A collision here is silent:
    the LAST element with a given id wins verification, and every earlier one
    goes unchecked without any check ever reporting a failure. Prefixing is
    the only fix that keeps the earlier ones checked at all.
    """
    svg = mol_output["svg"]
    inner_start = svg.index(">", svg.index("<svg")) + 1
    inner_end = svg.rindex("</svg>")
    inner = svg[inner_start:inner_end]
    # Drop this molecule's own background rect -- the reaction figure paints
    # one shared background, and a second opaque rect per tile would occlude
    # anything drawn behind it (a "+" sign, an earlier tile's overhang).
    inner = re.sub(r"<rect[^>]*fill=\"#0F1115\"[^>]*/>", "", inner, count=1)
    inner = ID_ATTR.sub(lambda m: f'data-pr-id="{prefix}-{m.group(1)}"', inner)
    wrapped = f'<g transform="translate({tx:.2f} {ty:.2f})">{inner}</g>'

    elements: list[dict[str, Any]] = []
    for element in mol_output["elements"]:
        entry: dict[str, Any] = {
            "id": f"{prefix}-{element['id']}",
            "kind": element["kind"],
        }
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


EQN_FONT = 30.0
EQN_Y = 56.0
EQN_GAP = 20.0
PLUS_FONT = 24.0


def render(width: float, height: float, reaction: str, conditions: str, misdeclare: bool) -> dict[str, Any]:
    if ">>" not in reaction:
        raise ValueError(f"not a reaction SMILES (expected 'A.B>>C.D'): {reaction!r}")
    lhs, rhs = reaction.split(">>", 1)

    def side(text: str) -> list[tuple[str, int]]:
        counts = Counter(token for token in text.split(".") if token)
        seen: list[str] = []
        for token in text.split("."):
            if token and token not in seen:
                seen.append(token)
        return [(token, counts[token]) for token in seen]

    reactants, products = side(lhs), side(rhs)

    # --- row 1: the equation itself, letters and numbers only -- coefficient
    # and formula on ONE token, at the same baseline as every other token, the
    # way a real chemical equation is actually written ("6O2", not a number
    # floating above a drawing). Mixing this tier with structural drawings in
    # the same row -- an earlier version's approach -- read as incoherent:
    # wildly different visual weights standing in for the same kind of thing.
    # ---------------------------------------------------------------------
    equation: list[str] = []
    elements: list[dict[str, Any]] = []
    cursor = PAD
    token_index = 0

    def place_text(text: str, font: float, weight: int, colour: str, id_: str | None = None, claim: str | None = None) -> None:
        nonlocal cursor
        id_attr = f' data-pr-id="{id_}"' if id_ else ""
        equation.append(
            f'<text{id_attr} x="{cursor:.2f}" y="{EQN_Y:.2f}" text-anchor="start" '
            f'dominant-baseline="middle" font-family="{FONT_STACK}" font-size="{font:.0f}" '
            f'font-weight="{weight}" fill="{colour}">{text}</text>'
        )
        if id_:
            elements.append({"id": id_, "kind": "label", "claim": claim or text})
        cursor += est_text_width(text, font) + EQN_GAP

    def place_side_equation(components: list[tuple[str, int]], side_name: str) -> None:
        nonlocal token_index
        for i, (smiles, count) in enumerate(components):
            if i > 0:
                place_text("+", PLUS_FONT, 400, DIM)
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                raise ValueError(f"not a valid SMILES string: {smiles!r}")
            formula = formula_text(mol)
            token = f"{count}{formula}" if count > 1 else formula
            place_text(
                token, EQN_FONT, 700, STROKE,
                id_=f"eqn-{side_name}-{token_index}",
                claim=f"{count} x {formula}" if count > 1 else formula,
            )
            token_index += 1

    place_side_equation(reactants, "lhs")

    cursor += PAD / 2
    arrow_y = EQN_Y
    arrow_x0, arrow_x1 = cursor, cursor + ARROW_W
    # Line and arrowhead share one id, grouped, so the declared box can
    # honestly cover the whole arrow including its tip. Declaring only the
    # <line>'s own span (which stops 10px short, to make room for the
    # arrowhead) was the first version, and module-geometry-agrees caught the
    # 10px gap immediately -- the group's real bbox and the declared claim
    # must describe the same drawn thing.
    equation.append(
        f'<g data-pr-id="reaction-arrow">'
        f'<line x1="{arrow_x0:.2f}" y1="{arrow_y:.2f}" x2="{arrow_x1 - 10:.2f}" y2="{arrow_y:.2f}" '
        f'stroke="{STROKE}" stroke-width="2"/>'
        f'<path d="M {arrow_x1 - 10:.2f} {arrow_y - 5:.2f} L {arrow_x1:.2f} {arrow_y:.2f} '
        f'L {arrow_x1 - 10:.2f} {arrow_y + 5:.2f} Z" fill="{STROKE}"/>'
        f"</g>"
    )
    elements.append(
        {
            "id": "reaction-arrow",
            "kind": "decoration",
            "claim": "reaction proceeds from reactants to products",
            "declaredBox": {
                "x": round(arrow_x0, 2),
                "y": round(arrow_y - 5, 2),
                "width": round(arrow_x1 - arrow_x0, 2),
                "height": 10.0,
            },
        }
    )
    if conditions:
        equation.append(
            f'<text data-pr-id="reaction-conditions" x="{(arrow_x0 + arrow_x1) / 2:.2f}" '
            f'y="{arrow_y - 14:.2f}" text-anchor="middle" font-family="{FONT_STACK}" '
            f'font-size="13" fill="{DIM}">{conditions}</text>'
        )
        # No owner: the arrow is a decoration, not a filled feature a label
        # sits "inside" -- that ownership relation doesn't apply here, and
        # forcing it produced a false module-label-within-feature failure
        # (a <line>/<g> has no isPointInFill target to test against). The
        # relationship this label actually needs checked --  clear of the
        # arrow's own ink -- is module-labels-clear-of-strokes, which applies
        # to every label against every decoration regardless of ownership.
        elements.append({"id": "reaction-conditions", "kind": "label", "claim": conditions})
    cursor = arrow_x1 + PAD / 2

    place_side_equation(products, "rhs")
    eqn_width = cursor - EQN_GAP + PAD

    # --- row 2: a real structural drawing for EVERY participant, named once
    # each in first-seen order -- the same structure showing up as both a
    # reactant and a product in some custom --reaction= input needs drawing
    # only once. This is deliberately every participant, not just the
    # "interesting" ones: row 1 already gives the compact equation; row 2's
    # job is showing what each part of it actually IS, and a reader asking
    # "what does O2 look like" deserves the same real answer glucose gets,
    # not a text label standing in for a drawing everywhere except the one
    # molecule judged complex enough to bother with. -------------------------
    structures: list[str] = []
    seen_smiles: dict[str, int] = {}
    order: list[str] = []
    for smiles, count in reactants + products:
        if smiles not in seen_smiles:
            seen_smiles[smiles] = count
            order.append(smiles)

    row2_coeff_band = 24.0
    row2_y = EQN_Y + 54.0 + row2_coeff_band
    row2_cursor = PAD
    for i, smiles in enumerate(order):
        prefix = f"m{i}"
        mol_output = render_molecule(TILE_W, TILE_H, structural_smiles(smiles), misdeclare=False)
        # structural_smiles() gives water and methane real explicit-hydrogen
        # structures now (see below), so this is a genuine fallback rather
        # than the common case: a species AddHs cannot turn into a real
        # skeleton -- a bare ion like [Na+], with nothing left to bond --
        # still comes back as a single small heteroatom label sized for
        # sitting AMONG bond lines in a full structure, font-size 15.
        # Embedded alone in an otherwise-empty tile next to a full skeletal
        # drawing, that would read as barely there. Scaling it up to match
        # the visual weight of its neighbours is a display concern this
        # module owns, not a change to what molecule.render() actually drew.
        if len(mol_output["elements"]) == 1 and mol_output["elements"][0]["kind"] == "label":
            mol_output = {
                **mol_output,
                "svg": mol_output["svg"].replace('font-size="15"', 'font-size="34"', 1),
            }
        wrapped, mol_elements = embed(mol_output, row2_cursor, row2_y, prefix)
        structures.append(wrapped)
        elements.extend(mol_elements)

        count = seen_smiles[smiles]
        if count > 1:
            label_id = f"{prefix}-coeff"
            structures.append(
                f'<text data-pr-id="{label_id}" x="{row2_cursor + TILE_W / 2:.2f}" '
                f'y="{row2_y - row2_coeff_band / 2:.2f}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="{FONT_STACK}" '
                f'font-size="16" font-weight="600" fill="{STROKE}">{count}x</text>'
            )
            elements.append(
                {"id": label_id, "kind": "label", "claim": f"stoichiometric coefficient {count}, times this structure"}
            )

        row2_cursor += TILE_W + PLUS_W / 2

    row2_width = row2_cursor - PLUS_W / 2 + PAD if order else 0.0

    canvas_w = max(width, eqn_width, row2_width)
    canvas_h = max(height, row2_y + TILE_H + PAD) if order else max(height, EQN_Y + PAD * 2)

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
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w:.0f}" height="{canvas_h:.0f}" '
        f'viewBox="0 0 {canvas_w:.0f} {canvas_h:.0f}">'
        f'<rect x="0" y="0" width="{canvas_w:.0f}" height="{canvas_h:.0f}" fill="{BG}"/>'
        f'<g data-pr-layer="equation">{"".join(equation)}</g>'
        f'<g data-pr-layer="structures">{"".join(structures)}</g>'
        f"</svg>"
    )

    notes = []
    if misdeclare:
        notes.append(
            "misdeclare mode: a phantom reagent label declared, and the arrow's own "
            "geometry widened 60px beyond what it drew"
        )
    return {"svg": svg, "elements": elements, "notes": notes}


def main() -> int:
    args = sys.argv[1:]
    misdeclare = "--misdeclare" in args
    reaction_arg = next((a for a in args if a.startswith("--reaction=")), None)
    name_arg = next((a for a in args if a.startswith("--name=")), None)

    if reaction_arg is not None:
        reaction = reaction_arg.split("=", 1)[1]
        conditions = next((a.split("=", 1)[1] for a in args if a.startswith("--conditions=")), "")
    elif name_arg is not None:
        key = name_arg.split("=", 1)[1].lower()
        if key not in NAMED:
            raise SystemExit(f"unknown --name={key!r}; known: {', '.join(sorted(NAMED))}")
        reaction = NAMED[key]["reaction"]
        conditions = NAMED[key]["conditions"]
    else:
        reaction = NAMED["glucose_combustion"]["reaction"]
        conditions = NAMED["glucose_combustion"]["conditions"]

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
    json.dump(render(width, height, reaction, conditions, misdeclare), sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
