"""Formulas as text: parsing a typed display form, checking it, and writing one.

The project's rule is that typed text is checked against what is computed. A
reaction's equation line used to be nothing BUT computed text (RDKit's Hill
formula: "H3N", "H4N+", "HO-"), which is correct and not how anyone writes it.
`--display=NH3;H2O>>NH4+;OH-` lets the author give the textbook form, and this
file refuses it unless it says exactly what RDKit computed: the same element
counts and the same net charge. Without `--display` an automatic writer picks a
conventional form for small inorganic species.

A formula is a list of RUNS -- (text, mode) with mode "n" (normal), "sub" or
"sup" -- so the caller can typeset digits as subscripts and charges as
superscripts; nothing here emits SVG.
"""

from __future__ import annotations

import re
from collections import Counter

from rdkit import Chem

Run = tuple[str, str]

MINUS = "−"
EN_DASH = "–"

_SUP_TO_ASCII = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", "0123456789+-")
_SUB_TO_ASCII = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
BOND_CHARS = "-–−—‐‑"  # hyphen, en dash, minus, em dash, hyphens
ADDUCT_CHARS = "·•∙*"  # middle dot, bullet, bullet operator, star
SIGNS = "+-–−‐‑"  # what may end a formula as a charge

_PT = Chem.GetPeriodicTable()


class DisplayError(ValueError):
    """A display string that cannot stand for the component it was given for."""


def plain(runs: list[Run]) -> str:
    return "".join(text for text, _ in runs)


def composition(mol: "Chem.Mol") -> tuple[Counter, int]:
    """Element counts (hydrogens included) and net formal charge of a molecule."""
    withh = Chem.AddHs(mol)
    counts: Counter = Counter(atom.GetSymbol() for atom in withh.GetAtoms())
    charge = sum(atom.GetFormalCharge() for atom in withh.GetAtoms())
    return counts, charge


def _charge_runs(charge: int) -> list[Run]:
    if charge == 0:
        return []
    sign = "+" if charge > 0 else MINUS
    n = abs(charge)
    return [((str(n) if n > 1 else "") + sign, "sup")]


# --- parsing --------------------------------------------------------------


def _normalise(text: str) -> str:
    text = re.sub(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+", lambda m: "^" + m.group(0).translate(_SUP_TO_ASCII), text)
    return text.translate(_SUB_TO_ASCII).strip()


def _charge_candidates(text: str) -> list[tuple[str, int]]:
    """Every way to read `text` as body + trailing charge, most literal first.

    "SO42-" is genuinely ambiguous (SO4 with charge 2-, or SO42 with 1-) and
    only the computed component can settle it, so all readings are returned and
    the verifier keeps the one that matches. An explicit "^" or a space before
    the digits settles it on its own.
    """
    out: list[tuple[str, int]] = []
    m = re.search(r"^(.*[A-Za-z)\]\d])([+\-–−‐‑])(\d)$", text)
    if m:  # Ca+2 style: sign then magnitude
        out.append((m.group(1), (1 if m.group(2) == "+" else -1) * int(m.group(3))))
    if not text or text[-1] not in SIGNS:
        return out + [(text, 0)]
    # An explicit separator settles which digits are the charge: "SO4^2-" and
    # "SO4 2-" both mean a 2- charge, and the 4 belongs to the formula.
    cut = text.rfind("^")
    if cut < 0:
        space = text.rstrip(SIGNS + "0123456789")
        cut = len(space.rstrip()) if space != text and space[-1:].isspace() else -1
    if cut >= 0:
        body, tail = text[:cut].rstrip(), text[cut + 1 :].strip()
        m2 = re.fullmatch(r"(\d*)([+\-–−‐‑])", tail)
        if m2:
            return out + [(body, (1 if m2.group(2) == "+" else -1) * (int(m2.group(1)) if m2.group(1) else 1))]
        m3 = re.fullmatch(r"([+\-–−‐‑])(\d+)", tail)
        if m3:
            return out + [(body, (1 if m3.group(1) == "+" else -1) * int(m3.group(2)))]
    sign = 1 if text[-1] == "+" else -1
    t = text[:-1]
    digits = re.search(r"\d*$", t).group()  # type: ignore[union-attr]
    rest = t[: len(t) - len(digits)]
    out.append((t, sign))
    for j in range(1, min(len(digits), 2) + 1):
        out.append((rest + digits[: len(digits) - j], sign * int(digits[len(digits) - j :])))
    return out


def _parse_seq(body: str, i: int, closer: str | None) -> tuple[list[Run], Counter, int]:
    runs: list[Run] = []
    counts: Counter = Counter()
    seg_runs: list[Run] = []
    seg_counts: Counter = Counter()
    mult = 1

    def flush() -> None:
        nonlocal seg_runs, seg_counts, mult
        for k, v in seg_counts.items():
            counts[k] += v * mult
        runs.extend(seg_runs)
        seg_runs, seg_counts, mult = [], Counter(), 1

    n = len(body)
    while i < n:
        c = body[i]
        if closer is not None and c == closer:
            break
        if c.isspace():
            i += 1
        elif c in ADDUCT_CHARS:
            flush()
            runs.append(("·", "n"))
            i += 1
            m = re.match(r"\d+", body[i:])
            if m:
                mult = int(m.group())
                runs.append((m.group(), "n"))
                i += len(m.group())
        elif c in BOND_CHARS:
            flush()
            runs.append((EN_DASH, "n"))
            i += 1
        elif c in "([":
            close = ")" if c == "(" else "]"
            inner_runs, inner_counts, i = _parse_seq(body, i + 1, close)
            if i >= n or body[i] != close:
                raise DisplayError(f"unclosed {c!r} in {body!r}")
            i += 1
            m = re.match(r"\d+", body[i:])
            k = int(m.group()) if m else 1
            seg_runs += [(c, "n")] + inner_runs + [(close, "n")]
            if m:
                seg_runs.append((m.group(), "sub"))
                i += len(m.group())
            for name, v in inner_counts.items():
                seg_counts[name] += v * k
        elif c.isupper():
            symbol = c
            if i + 1 < n and body[i + 1].islower():
                symbol += body[i + 1]
            if not _valid_symbol(symbol):
                raise DisplayError(f"{symbol!r} is not an element symbol (in {body!r})")
            i += len(symbol)
            m = re.match(r"\d+", body[i:])
            k = int(m.group()) if m else 1
            seg_runs.append((symbol, "n"))
            if m:
                seg_runs.append((m.group(), "sub"))
                i += len(m.group())
            seg_counts[symbol] += k
        elif c.isdigit():
            raise DisplayError(
                f"a number {c!r} that does not follow an element in {body!r}; a coefficient is written "
                "by repeating the component in --reaction, not in --display"
            )
        else:
            raise DisplayError(f"unexpected {c!r} in {body!r}")
    flush()
    return runs, counts, i


def _valid_symbol(symbol: str) -> bool:
    try:
        return _PT.GetAtomicNumber(symbol) > 0
    except Exception:
        return False


def parse_body(body: str) -> tuple[list[Run], Counter]:
    runs, counts, _ = _parse_seq(body, 0, None)
    if not counts:
        raise DisplayError(f"no element in {body!r}")
    return runs, counts


def _describe(counts: Counter, charge: int) -> str:
    text = "".join(f"{k}{v if v > 1 else ''}" for k, v in sorted(counts.items()))
    return f"{text} with charge {charge:+d}" if charge else f"{text} with charge 0"


def verify_display(text: str, counts: Counter, charge: int, computed_text: str, where: str) -> list[Run]:
    """The runs of `text`, if and only if it says what was computed.

    `counts`/`charge` come from RDKit (hydrogens included). `where` names the
    component in an error, `computed_text` is the computed formula it is being
    compared to.
    """
    norm = _normalise(text)
    problems: list[str] = []
    first_reading: tuple[Counter, int] | None = None
    for body, ch in _charge_candidates(norm):
        try:
            runs, cnt = parse_body(body)
        except DisplayError as err:
            problems.append(str(err))
            continue
        if first_reading is None:
            first_reading = (cnt, ch)
        if cnt == counts and ch == charge:
            return runs + _charge_runs(charge)
    if first_reading is None:
        raise DisplayError(f"--display {text!r} for {where} cannot be read: {problems[0] if problems else 'empty'}")
    cnt, ch = first_reading
    raise DisplayError(
        f"--display {text!r} for {where} does not match its computed formula {computed_text!r}: "
        f"the display reads as {_describe(cnt, ch)}, the component is {_describe(counts, charge)}"
    )


# --- writing --------------------------------------------------------------

# IUPAC's electronegativity order for writing a formula, least to most
# electronegative; anything not listed (a metal) goes first, alphabetically.
_NONMETALS = ["B", "Si", "C", "Sb", "As", "P", "N", "H", "Te", "Se", "S", "At", "I", "Br", "Cl", "O", "F"]
_NOBLE = {"He", "Ne", "Ar", "Kr", "Xe", "Rn"}

# Textbook forms that no rule derives, keyed by canonical SMILES (an isomer
# cannot be mistaken this way; a Hill formula could not tell them apart).
_KNOWN = {
    "CC(=O)O": "CH3COOH",
    "CC(=O)[O-]": "CH3COO",
    "C#N": "HCN",
    "[C-]#N": "CN",
    "O=C(O)O": "H2CO3",
    "O=C([O-])O": "HCO3",
    "CO": "CH3OH",
    "CCO": "CH3CH2OH",
    "CN": "CH3NH2",
    "C[NH3+]": "CH3NH3",
}


def _order_key(symbol: str) -> tuple[int, int, str]:
    if symbol in _NONMETALS:
        return (1, _NONMETALS.index(symbol), symbol)
    if symbol in _NOBLE:
        return (2, 0, symbol)
    return (0, 0, symbol)


def _spell(pairs: list[tuple[str, int]]) -> str:
    return "".join(f"{s}{n if n > 1 else ''}" for s, n in pairs)


def _hill(counts: Counter) -> list[tuple[str, int]]:
    def key(s: str) -> tuple[int, str]:
        if s == "C":
            return (0, s)
        if s == "H" and "C" in counts:
            return (1, s)
        return (2, s)

    return [(s, counts[s]) for s in sorted(counts, key=key)]


def _terminals(atom: "Chem.Atom", exclude: int) -> Counter | None:
    """The atoms hanging off `atom` other than atom `exclude`, or None if any has its own neighbours."""
    out: Counter = Counter()
    for nb in atom.GetNeighbors():
        if nb.GetIdx() == exclude:
            continue
        if nb.GetDegree() != 1:
            return None
        out[nb.GetSymbol()] += 1
    if atom.GetTotalNumHs():
        out["H"] += atom.GetTotalNumHs()
    return out


def _adduct(mol: "Chem.Mol") -> str | None:
    """F3B-NH3 for a carbon-free molecule that is two neutral halves joined by a
    donor-acceptor bond (the two ends carry opposite formal charges), else None.

    The acceptor (the end with the negative formal charge) is written first with
    its substituents in front, "F3B", the donor second with them behind, "NH3":
    each half then reads towards the bond.
    """
    if any(a.GetSymbol() == "C" for a in mol.GetAtoms()):
        return None
    datives = [b for b in mol.GetBonds() if _is_dative(b)]
    bridges = datives or [
        b for b in mol.GetBonds()
        if b.GetBeginAtom().GetFormalCharge() * b.GetEndAtom().GetFormalCharge() < 0
    ]
    if len(bridges) != 1 or sum(a.GetFormalCharge() for a in mol.GetAtoms()) != 0:
        return None
    bond = bridges[0]
    a, b = bond.GetBeginAtom(), bond.GetEndAtom()
    if datives:
        acceptor, donor = b, a  # RDKit writes a dative bond donor->acceptor
    else:
        acceptor, donor = (a, b) if a.GetFormalCharge() < 0 else (b, a)
    t_acc = _terminals(acceptor, donor.GetIdx())
    t_don = _terminals(donor, acceptor.GetIdx())
    if t_acc is None or t_don is None:
        return None
    if 1 + sum(t_acc.values()) < 3 or 1 + sum(t_don.values()) < 3:
        return None  # nitrate's N+-O- is a resonance form, not an adduct

    def spelled(t: Counter) -> str:
        return _spell([(s, t[s]) for s in sorted(t, key=_order_key)])

    return f"{spelled(t_acc)}{acceptor.GetSymbol()}{EN_DASH}{donor.GetSymbol()}{spelled(t_don)}"


def _is_dative(bond: "Chem.Bond") -> bool:
    return str(bond.GetBondType()) in ("DATIVE", "DATIVEONE")


def _complex(mol: "Chem.Mol", charge: int) -> str | None:
    """[Ag(NH3)2]+ for a coordination entity: one central atom that every dative bond (donor->acceptor) ends at, and
    ligands that are what is left when it is taken away. A ligand of one atom is written bare ([CoCl4]2-), one of
    several in parentheses; identical ligands are counted. None when the molecule is not that shape."""
    datives = [b for b in mol.GetBonds() if _is_dative(b)]
    if not datives:
        return None
    centres = {b.GetEndAtomIdx() for b in datives}
    if len(centres) != 1:
        return None
    centre = mol.GetAtomWithIdx(next(iter(centres)))
    if any(b.GetBeginAtomIdx() == centre.GetIdx() or not _is_dative(b) for b in centre.GetBonds()):
        return None
    pieces = Chem.FragmentOnBonds(mol, [b.GetIdx() for b in centre.GetBonds()], addDummies=False)
    ligands: list[str] = []
    for frag_atoms in Chem.GetMolFrags(pieces, asMols=False, sanitizeFrags=False):
        if centre.GetIdx() in frag_atoms:
            if len(frag_atoms) != 1:
                return None
            continue
        frag = Chem.RWMol(mol)
        for idx in sorted(set(range(mol.GetNumAtoms())) - set(frag_atoms), reverse=True):
            frag.RemoveAtom(idx)
        lig = frag.GetMol()
        try:
            Chem.SanitizeMol(lig)
        except Exception:
            return None
        lig_counts, _ = composition(lig)
        ligands.append(auto_display(lig, lig_counts, 0))
    order = list(dict.fromkeys(ligands))
    body = centre.GetSymbol()
    for lig in order:
        n = ligands.count(lig)
        single = len(re.findall(r"[A-Z]", lig)) == 1 and not re.search(r"\d", lig)
        body += (lig if single else f"({lig})") + (str(n) if n > 1 else "")
    charge_text = "" if charge == 0 else (str(abs(charge)) if abs(charge) > 1 else "") + ("+" if charge > 0 else "-")
    return f"[{body}]{charge_text}"


def auto_display(mol: "Chem.Mol", counts: Counter, charge: int) -> str:
    """A conventional written form (ASCII, with a trailing charge) of a component.

    Carbon-containing species keep Hill order unless they are one of a handful
    of textbook exceptions; carbon-free ones follow IUPAC's element order with
    the two conventions everyone writes (oxoacids H-first, hydroxides M-O-H) and
    OH-. It is a convenience, not the authority: it is always checked by the
    same verifier as a typed display.
    """
    known = _KNOWN.get(Chem.MolToSmiles(Chem.RemoveHs(mol)))
    charge_text = ("" if charge == 0 else (str(abs(charge)) if abs(charge) > 1 else "") + ("+" if charge > 0 else "-"))
    if known:
        return known + (" " + charge_text if abs(charge) > 1 else charge_text)
    if "C" in counts:
        return _spell(_hill(counts)) + (" " + charge_text if abs(charge) > 1 else charge_text)

    adduct = _adduct(Chem.RemoveHs(mol)) if mol.GetNumBonds() else None
    if adduct:
        return adduct
    entity = _complex(Chem.RemoveHs(mol), charge) if mol.GetNumBonds() else None
    if entity:
        return entity

    symbols = set(counts)
    if symbols == {"H", "O"} and counts["H"] == 1 and counts["O"] == 1:
        body = "OH"
    else:
        others = symbols - {"H", "O"}
        if "H" in symbols and "O" in symbols and len(others) == 1:
            x = next(iter(others))
            if x in _NONMETALS:
                pairs = [("H", counts["H"]), (x, counts[x]), ("O", counts["O"])]  # HNO3, H2SO4
            else:
                pairs = [(x, counts[x]), ("O", counts["O"]), ("H", counts["H"])]  # NaOH
        else:
            pairs = [(s, counts[s]) for s in sorted(counts, key=_order_key)]
        body = _spell(pairs)
    return body + (" " + charge_text if abs(charge) > 1 else charge_text)
