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
--lone-pairs (dots for non-bonding pairs in the structures), --misdeclare.

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
    runs_plain,
    runs_svg,
    runs_width,
)
import formula  # noqa: E402

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
    "lewis_bf3_nh3": {
        "reaction": "FB(F)F.N>>F[B-](F)(F)[NH3+]",
        "conditions": "",
        "display": "BF3;NH3>>F3B-NH3",
        "lone_pairs": True,
    },
}

TILE_MAX_W, TILE_MAX_H = 300.0, 230.0
STRUCT_FONT = 18.0  # atom labels in the structure row
STRUCT_BOND = 58.0  # bond length in the structure row
TILE_GAP = 30.0
ARROW_W = 130.0
PAD = 20.0
ID_ATTR = re.compile(r'data-pr-id="([^"]*)"')
BG_RECT = re.compile(r'<rect data-pr-bg="1"[^>]*/>')

EQN_FONT = 30.0
EQN_Y = 50.0
EQN_GAP = 18.0
PLUS_FONT = 24.0
COEFF_BAND = 20.0  # room above the structures for a "6x" when some coefficient is above 1


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


def est_text_width(text: str, font: float) -> float:
    """A layout budget for plain text, not a real measurement -- Python has no
    font engine, and the checks verify the rendered text, not this estimate."""
    return sum(font * 0.64 for _ in text)


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
    inner = BG_RECT.sub("", inner, count=1)
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


def parse_display(display: str, n_lhs_tokens: int, n_rhs_tokens: int) -> tuple[list[str], list[str]]:
    """`A;B>>C;D` -> (["A", "B"], ["C", "D"]). Either side may be empty; so may a component."""
    if ">>" not in display:
        raise formula.DisplayError(
            f"--display must mirror the reaction: components separated by ';' and the sides by '>>' (got {display!r})"
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
) -> dict[str, Any]:
    if ">>" not in reaction:
        raise ValueError(f"not a reaction SMILES (expected 'A.B>>C.D'): {reaction!r}")
    if theme not in THEMES:
        raise ValueError(f"unknown theme {theme!r}; known: {', '.join(THEMES)}")
    ink, dim, paper = THEMES[theme]["ink"], THEMES[theme]["dim"], THEMES[theme]["bg"]
    lhs, rhs = reaction.split(">>", 1)

    def tokens_of(text: str) -> list[str]:
        return [token for token in text.split(".") if token]

    def side(text: str) -> list[tuple[str, int]]:
        toks = tokens_of(text)
        counts = Counter(toks)
        seen: list[str] = []
        for token in toks:
            if token not in seen:
                seen.append(token)
        return [(token, counts[token]) for token in seen]

    reactants, products = side(lhs), side(rhs)

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

    tiles: list[dict[str, Any]] = []
    for i, smiles in enumerate(order):
        drawn = structural_smiles(smiles)
        params = Chem.SmilesParserParams()
        params.removeHs = False  # explicit hydrogens are atoms here, not implicit counts
        probe = Chem.MolFromSmiles(drawn, params)
        # A species AddHs cannot turn into a real skeleton -- a bare ion like
        # [Cl-] or [Na+], one atom and nothing to bond -- is a single label
        # sized for sitting AMONG bond lines in a full structure; alone next to
        # a full skeletal drawing that would read as barely there, so it is
        # drawn at the equation's weight.
        font_px = 34.0 if probe is not None and probe.GetNumAtoms() == 1 else STRUCT_FONT
        out = render_molecule(
            TILE_MAX_W, TILE_MAX_H, drawn, misdeclare=False, theme=theme, lone_pairs=lone_pairs, font_px=font_px,
            bond_px=STRUCT_BOND,
        )
        tiles.append({"smiles": smiles, "out": out, "w": float(out["_size"][0]), "h": float(out["_size"][1])})

    any_coefficient = any(seen_smiles[t["smiles"]] > 1 for t in tiles)
    row_h = max((t["h"] for t in tiles), default=0.0)
    row2_w = sum(t["w"] for t in tiles) + TILE_GAP * max(len(tiles) - 1, 0)

    # --- row 1: the equation, letters and numbers only -----------------------
    def build_equation(x0: float) -> tuple[list[str], list[dict[str, Any]], float]:
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
            for i, (smiles, count) in enumerate(components):
                if i > 0:
                    place([("+", "n")], PLUS_FONT, 400, dim, None, None)
                runs = ([(str(count), "n")] if count > 1 else []) + written[smiles]
                shown = runs_plain(written[smiles])
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
    equation, eq_elements, _ = build_equation((canvas_w - eqn_end) / 2)
    elements.extend(eq_elements)

    # --- row 2: a real structural drawing for EVERY participant ---------------
    row2_top = EQN_Y + 32.0 + (COEFF_BAND if any_coefficient else 0.0)
    cursor = (canvas_w - row2_w) / 2
    for i, tile in enumerate(tiles):
        prefix = f"m{i}"
        ty = row2_top + (row_h - tile["h"]) / 2
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

    canvas_h = round(row2_top + row_h + PAD * 0.4 + 0.5) if tiles else round(EQN_Y + PAD * 2)

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
        f"</svg>"
    )

    notes = []
    if display is not None and typed:
        notes.append(f"display forms checked against the computed formula: {len(typed)} component(s)")
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
        )
    except (formula.DisplayError, ValueError) as err:
        raise SystemExit(f"error: {err}")
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
