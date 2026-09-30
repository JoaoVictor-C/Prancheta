# acid-base

Three figures of aqueous acid–base equilibrium — a titration curve, a species-distribution diagram and the pH scale — in which **every drawn point is computed from the equilibrium and none is typed**. A titration is data (the analyte, its constant, the concentrations, the volume); the curve, the volumes of the equivalence points and the pH at each are what the chemistry gives.

Which figure is `kind`: `"titration"`, `"distribution"` or `"ph-scale"`. Text is pt-BR; every number goes through the one formatter (`src/locale/format.ts`: decimal comma, the minus `−`), so `pH = 8,72`, `V = 12,5 mL`, `Kw = 1,0·10⁻¹⁴`. `locale: "en"` changes the marks, not the words.

See [`docs/decisions/0064-acid-base-figures.md`](../../../docs/decisions/0064-acid-base-figures.md) for why the curve is a charge balance and not Henderson–Hasselbalch, and what was refused. Built on the same board, scale and reading panel as [`sequence`](../sequence/PRESET.md) and [`distribution`](../distribution/PRESET.md) (numbered plane, `fitUnits`/`niceStep`, ADR 0062 panel). Worked examples: [`fixtures/acid-base/`](../../../fixtures/acid-base/titration-weak-acid-phenolphthalein.json).

## kind: "titration"

pH against the volume of titrant added.

```json
{
  "preset": "acid-base",
  "kind": "titration",
  "analyte": { "type": "acid", "strength": "weak", "name": "CH₃COOH", "pKa": 4.74, "concentration": 0.1, "volume": 25 },
  "titrant": { "concentration": 0.1, "name": "NaOH" },
  "indicators": ["fenolftaleína"]
}
```

| field | what it does |
| --- | --- |
| `analyte.type` | `"acid"` (titrated by a strong base) or `"base"` (by a strong acid). Required. |
| `analyte.strength` | `"strong"` or `"weak"`. Required. |
| `analyte.pKa` / `Ka` | A weak acid's constant; a **list** for a polyprotic one (`[2.15, 7.2, 12.35]`, at most four, strictly increasing). For a weak **base**, the pKa of its conjugate acid. |
| `analyte.pKb` / `Kb` | A weak base's constant; a list is the successive steps (first = strongest). Exactly one constant is given; a strong analyte gives none. |
| `analyte.concentration`, `analyte.volume` | mol/L and mL, positive. |
| `analyte.name`, `titrant.name` | Text only (`"CH₃COOH"`, `"NaOH"`). Default HA/B/MOH and NaOH/HCl. |
| `titrant.concentration` | mol/L of a strong base (for an acid analyte) or strong acid. |
| `volumeMax` | mL; the axis runs to here, widened to a whole tick. Default 2 × V_eq, or (n + ½) × V_eq for an n-protic analyte; must be past the first equivalence. |
| `indicators` | Names (`"fenolftaleína"`, `"azul de bromotimol"`, `"alaranjado de metila"`, `"vermelho de metila"`, `"vermelho de fenol"`, `"tornassol"`, `"amarelo de alizarina"`, or their English names) or `{ "name", "from", "to" }`. Drawn as a shaded band across the plane, named at its right end. |

### What is computed

At each volume the pH is the root of the **charge balance**, found by bisection on pH (so on log[H⁺]), to machine precision, whether the root is 10⁻¹ or 10⁻¹³:

- acid analyte: `[B⁺] + [H⁺] = [OH⁻] + cₜ · Σ j·αⱼ(pH)`;
- base analyte: `cₜ · Σ (n−j)·αⱼ(pH) + [H⁺] = [OH⁻] + [X⁻]`;

with `Kw = 1,0·10⁻¹⁴` (25 °C), dilution included, and αⱼ the species fractions of the analyte's pKa list. A strong analyte contributes its whole charge. Nothing else is assumed: the buffer region, the jump and the plateau are one equation. The curve is sampled at 40 even volumes and every marked volume, then any chord whose midpoint is more than 0,4 px off the curve is split, so the jump is drawn as densely as it needs and a long plateau as sparsely.

Marked and labelled (each computed by the same solve, each **declared to lie on the curve** — `on: ["curva"]` — and measured by `feature-on-its-curve`):

- the **initial pH**, at V = 0;
- the **half-equivalence** point(s), V = (k − ½)·V_eq: for a weak analyte, where pH = pKa (printed `=` when the computed pH is within 0,005 of the constant, `≈` otherwise). A half-equivalence point whose pH is more than 0,3 from its pKa — the third step of H₃PO₄, lost against water and dilution — is **not marked**, so no pKa is claimed that the curve does not give;
- the **equivalence** point(s), V_eq,k = k·c·V / c_titulante, with the pH there. An equivalence point across which the curve jumps less than 0,8 pH units between 99 % and 101 % of its volume is not marked (the third equivalence of H₃PO₄).

With `indicators` the panel gives a verdict per indicator: the jump between 99,9 % and 100,1 % of V_eq (a titration error under 0,1 %) is computed from the same solve, and an indicator **serves** when the midpoint of its range lies inside it (for a polyprotic analyte, at which equivalence). That is a stated criterion, printed with the numbers, not a colour match.

### The reading panel

Analyte and titrant as given; `V_eq = c·V / c′` with the arithmetic; the initial pH; each half-equivalence (`V = ½ V_eq = 12,5 mL: pH = 4,74 = pKa`; for a base also `pKb = 14 − 9,25 = 4,75`); each equivalence with its pH and what the solution is (`solução básica; o ânion do ácido hidrolisa`); each indicator's verdict; and the method (charge balance, Kw, no Henderson–Hasselbalch).

With more than four marked points the dashed guides to the axes are dropped (the labels carry V and pH) so the labels have room; up to four, each point has its guides.

## kind: "distribution"

The fraction α of each species of a mono-, di- or triprotic acid against pH 0–14.

```json
{ "preset": "acid-base", "kind": "distribution", "name": "ácido carbônico",
  "pKa": [6.35, 10.33], "species": ["H₂CO₃", "HCO₃⁻", "CO₃²⁻"], "pH": 7.4 }
```

| field | what it does |
| --- | --- |
| `pKa` | A number or a list of up to three, strictly increasing. Required. |
| `species` | The n + 1 names, most protonated first; a different count is refused. Default `H₂A, HA⁻, A²⁻`. |
| `name` | The acid, for the heading. |
| `pH` | A dashed vertical line at this pH, the fractions there marked on each curve and printed. |

Each curve is `αⱼ = K₁…Kⱼ·hⁿ⁻ʲ / Σ`, `h = 10^−pH`, sampled every 0,05 of pH and **at every pKa and the marked pH exactly**. Adjacent species cross at exactly `pH = pKa` (the ratio of their concentrations is K/h); each crossing is a dot declared to lie on both curves it joins, with the drop to the axis and `pKa₁ = 6,35` beside it. Curves are told apart three ways: colour (Okabe–Ito hues darkened until each clears 4,5:1), stroke pattern (solid, dashed, dash-dot, dotted) and a direct label in the curve's colour, set where the species dominates. The panel prints the fractions at the crossing (`α(H₂CO₃) = 0,500 e α(HCO₃⁻) = 0,500, iguais`) and at the given pH, with `Σα = 1`.

## kind: "ph-scale"

The pH scale 0–14 as a colour bar with substances placed at their pH.

```json
{ "preset": "acid-base", "kind": "ph-scale",
  "substances": [ { "name": "suco de limão", "pH": 2.2 }, { "name": "solução A", "H": 0.001 }, { "name": "solução B", "OH": 0.0001 } ],
  "indicators": ["fenolftaleína"] }
```

Each substance gives exactly one of `pH`, `H` ([H⁺], mol/L) or `OH` ([OH⁻], mol/L). From a concentration the pH is computed (`pH = −log[H⁺]`; `pH = 14 − pOH`) and **the arithmetic is printed in the panel** (`[H⁺] = 10⁻³ mol/L → pH = −log(10⁻³) = 3,00`). A pH off the scale is refused, naming the substance.

The bar is one linear gradient computed from stops in pH (rust → orange → sand → pale → light blue → blue → navy): a warm-to-cool ramp that survives red–green colour blindness, and the regions also carry **ÁCIDO / NEUTRO / BÁSICO** as words, so colour is never the only channel. Numbers 0–14 sit under it. A substance is a pole up from its pH with its name and `pH x` beside it, right of the pole unless the page ends; rows are found so that no label stands on another's pole. Substances within 8 px of each other share one pole, one name to a line. `indicators` are drawn as brackets under the bar, named and numbered.

## What is checked

Every figure goes through the usual checks. The ones that bite here: `feature-on-its-curve` (every marked point is within 1,5 px of the curve it claims — the titration points, the distribution crossings and the fractions at a chosen pH), `label-nearest-its-place` (a point's label is judged against the point, as the check does; the placement runs the same test before committing), `curve-label-nearest-its-curve` and `series-distinguishable-without-colour` (distribution), `contrast-sufficient` (the species labels on the lattice, the band labels on the tinted band), `axis-number-present`.

## What is refused

Unknown `kind` or key (naming the fields that exist); a weak analyte without exactly one constant, a strong one with a constant, a weak acid given `pKb`, a weak base given `Ka`; a non-increasing pKa list; a non-positive concentration or volume; `volumeMax` at or before the first equivalence; an unknown indicator (naming the known ones); `species` with the wrong count; more than three pKa in a distribution; a `pH` off 0–14; a substance with none or more than one of `pH`/`H`/`OH`; a non-positive concentration.

## What is not covered

Polyprotic *bases* are given by their successive pKb (or the conjugate acid's pKa list), not drawn with their own half-equivalence naming. Only 25 °C (Kw = 1,0·10⁻¹⁴). Activities are 1: at high ionic strength the pH is a little off, as in any school calculation. A weak acid titrated by a weak base has no sharp equivalence and is not a figure this preset draws. A mixture of two acids is not a titration input.

## answers: false

The question typically gives the data and asks V_eq, the pH at equivalence, the pKa, or which indicator to use. `answers: false` draws the figure of the question:

- **titration** keeps the heading (the given data), the numbered plane, the **curve** and the **indicator bands with their names and ranges** (they are given). It drops the initial, half-equivalence and equivalence points, their guides and values, the reading panel and the indicator verdict. The curve is still computed, so the figure is the same one the solution draws over.
- **distribution** keeps the curves, the species names, the axes and the given `pH` line with its label. It drops the pKa crossings (dots, drops and labels — the marker would give the pKa as much as its label does), the fractions marked at the given pH and the panel.
- **ph-scale** keeps the scale, its numbers and words, the substances **given by pH**, and the indicator ranges. A substance given by a concentration is **not placed** (its position is the answer) and the panel with the arithmetic goes.
