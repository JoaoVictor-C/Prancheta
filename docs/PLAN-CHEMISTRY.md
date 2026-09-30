# Chemistry — todo

Found by building the acid–base list (`experiments/exercises/acidos-bases/lista.json`)
and probing the molecule and reaction modules on 2026-09-30. In order of
importance; each item is ticked when it lands with its tests.

- [x] **1. Dative bonds and lone pairs (bug).** `N->[Ag+]<-N` draws each N with
  the lone pair that IS its bond to silver: the lone-pair count ignores dative
  bonds, so every complex ion is chemically wrong. Count a dative bond against
  its donor's pairs, and draw it as an arrow (N→Ag) or a plain line by option.
  *Landed:* the count uses the atom's own bonding electrons (donor −2, acceptor 0, radicals as single dots),
  `--dative=arrow|line`, charged/paired heteroatoms drawn with explicit H, `[Ag(NH3)2]+` written and verified
  (`complex_silver_ammonia`).
- [x] **2. Curved electron-pushing arrows.** The figure that carries the Lewis and
  Brønsted ideas: an arrow from N's lone pair to B in BF₃ + NH₃, from a lone pair
  on water to the H of HCl, from an H–Cl bond onto Cl. Each arrow is checked: it
  starts at a real lone pair or bond and ends at an atom (or bond) that can take
  the pair.
  *Landed:* reaction `--arrows=lp:2>1;bond:2-3>3` addressed by atom maps or `Sym@component`, verified
  (pair exists and is not over-spent, bond exists, target accepts) and drawn as declared cubics
  (`modules/reaction/arrows.py`); `lewis_bf3_nh3`, `bronsted_hcl_h2o`, `bronsted_nh3_h2o`.
- [x] **3. Answers in module figures.** A sheet hides the answers of core figures
  on statement figures (`answers: false`) but not of module figures. "Complete a
  reação" / "qual o ácido conjugado?" needs the products drawn as "?" in the
  question and in full in the solution.
  *Landed:* `--answers=false` on both modules. Reaction: the reactants, the arrow and a `?` for the products, no
  product tile but the same canvas and reactant positions as the solution; the curved arrows stay (they belong to the
  reactants). Molecule: lone pairs, radical dots and charges hidden, skeleton kept (with `--resonance`, the structure
  as written alone). Default `true` is unchanged; everything is still computed and checked with the answers in.
- [x] **4. Lone-pair placement.** Pairs sometimes read as scattered single dots
  (nitrate's O⁻). Lewis-dot convention: each pair clearly on one side of its atom
  (top/bottom/left/right, avoiding bonds), dots parallel to that side; larger dots
  in reaction tiles.
  *Landed:* `choose_slots()` puts each pair on a side (corners only when needed, 40° from bonds, 80° apart),
  dots parallel to the side, radius 2.7 px in reaction tiles; a test checks no pair overlaps a pair or label.
- [x] **5. A fuller equation line.** State symbols — (aq), (g), (s), (l) — and
  real stoichiometric coefficients ("2 NH₃") instead of repeating a component.
  *Landed:* `--states=g;l>>aq;aq` (closed set s, l, g, aq, smaller run after the formula) and
  `--coefficients=1;3>>2` (refused if the component is also repeated in the SMILES); with coefficients or `--balanced`
  the equation is checked to balance in atoms and charge (the differing element or charge named), else balance is
  reported in the notes; `haber_process`, `ammonia_sulfate`.
- [x] **6. Resonance structures.** Nitrate, carbonate, acetate as their resonance
  forms joined by ↔, generated (RDKit's resonance enumeration), not typed.
  *Landed:* molecule `--resonance` (`ResonanceMolSupplier`, KEKULE_ALL, deduplicated, as-written first), forms on one
  set of coordinates joined by declared double-headed arrows, pairs and charges per form, capped at 4 with a note;
  `--name=nitrate|carbonate|acetate|ozone` (3, 3, 2, 2 forms). No brackets.
- [x] **7. Consistent sizes.** A bare ion (Cl⁻) is drawn larger than the atom
  labels of its neighbours in a reaction row.
  *Landed:* every tile uses one label size (18 px) and one dot radius (2.7 px), a bare ion included; a test compares
  them across the tiles of four reactions.
- [x] **8. Computed acid–base figures (core presets).** A titration curve (pH vs
  volume added, from Ka/Kb and concentrations: strong/weak acid with strong base
  and the reverse, equivalence and half-equivalence points), a species-distribution
  diagram (fraction of each form vs pH, mono- and polyprotic), and a pH scale with
  indicator ranges. Every point computed from the equilibrium, never typed.
  *Landed:* preset `acid-base` (ADR 0064): `titration` solves the charge balance at every volume (no
  Henderson–Hasselbalch), marks pH₀, ½Veq and Veq and judges indicators; `distribution` and `ph-scale`;
  `answers: false`; registered with structure `acid-base-equilibrium`.
