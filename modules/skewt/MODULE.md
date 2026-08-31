# skewt — a figure module in Python

A Skew-T log-P diagram: the genuinely skewed coordinate system a meteorological sounding is plotted on, with isotherms drawn at roughly 45° and pressure on a log scale, so a dry-adiabatic ascent traces a recognisable curve instead of a meaningless one. See [docs/research/candidate-modules.md](../../docs/research/candidate-modules.md), candidate #7.

## Illustrative data, stated plainly

Both named soundings — `midlatitude_summer` and `unstable_afternoon` — are **constructed to show a plausible sounding shape**, not observed data from any real station, date, or model run. This is the same discipline [modules/dendrogram](../dendrogram/MODULE.md)'s trait matrix and modules/topology's named folds already state for themselves: presenting fabricated numbers as if they were real observations would be worse than not having the example.

## What it delegates and what it keeps

The skew transform itself — `x = T + K·(log(P_ref) − log(P))`, `y ∝ log(P)` — is a straight algebraic definition, computed once in `canvas()` and applied to every point this module draws; it needs no external library. The physics is where a real dependency earns its place: `metpy.calc.dry_lapse` computes the dry adiabats, `metpy.calc.parcel_profile` integrates a lifted surface parcel's full dry-then-moist ascent (the curve's kink *is* the level it turns moist), and `metpy.calc.lcl` finds the lifting condensation level. Re-implementing `parcel_profile` by hand would mean re-deriving a moist-adiabatic ODE integration — exactly the "the core cannot compute this" bar every module in this repertoire is held to.

## What it declares, and what it does not

The temperature trace, the dewpoint trace, the parcel profile, each dry adiabat, and the LCL marker are all `feature`s with a `declaredBox` computed from the same skew-transformed coordinates used to draw them. The dry adiabats are `decoration`s that do declare a box; the isobar and isotherm tick texts are `label`s that declare neither a box nor an `owner`, for the usual font-metrics reason. No label in this module claims ownership of anything — a sounding trace is a stroked path with no fill for `isPointInFill` to test against, so `module-label-within-feature` correctly sits at `not-applicable` here rather than being made to run on a claim the geometry cannot support.

## What building it found

**Every one of the first render's three failures was a real collision, not a fluke of one dataset.** All three are recorded because they're the kind of mistake this diagram's own geometry makes easy to reach for:

- **A hand-tuned pixel offset that wasn't enough.** The bottom-edge isotherm ticks and the left-edge 1000 hPa isobar tick meet at the same corner of the plot; a 14px offset below the axis left their text boxes overlapping. Widened to 22px.
- **A "generous" clipping margin that let ink stray into label territory.** Dry adiabats were clipped to the plot area plus a 60px tolerance on each side, on the assumption that a little overflow at the edges reads as intentional bleed. It doesn't: a low-pressure adiabat can swing well outside the temperature range, and that dashed stroke reached straight into the left-edge isobar labels' own space. Clipped tightly to the plot area instead.
- **An offset that ignored what the point it was labelling actually sits on, and took two tries to clear.** The LCL marker sits, by definition, *on* the parcel-profile curve — that curve's kink from dry to moist adiabatic is the LCL, and several dry adiabats and both environmental traces converge in the same small region near it. A purely horizontal +10px label offset crossed both the parcel profile and the nearby temperature trace; moving diagonally to (+14, −14) cleared those two but, checked at a different canvas aspect ratio (640×640 instead of the default 720×520), swung the label straight into the steepest dry adiabat instead — `module-labels-clear-of-strokes` caught "lcl-label sits on dry-adiabat-3" on a render the first fix's own aspect ratio had never exercised. The offset that actually clears every nearby line at multiple canvas sizes and both named soundings is (+26, −26) — checked, not assumed, across four canvas sizes before settling. The label's `owner` claim was also removed: it sits beside the small marker circle, not inside its fill, so the claim was never accurate to begin with — the same false-ownership pattern recorded in [modules/reaction](../molecule/MODULE.md) and [modules/plot](../plot/MODULE.md).

## Running it

```bash
node src/cli.ts module python --args "modules/skewt/render.py,--name=midlatitude_summer"
node src/cli.ts module python --args "modules/skewt/render.py,--name=unstable_afternoon"
node src/cli.ts module python --args "modules/skewt/render.py,--misdeclare"
```

Named shortcuts only for now: `midlatitude_summer`, `unstable_afternoon` (`--name=<key>`). No custom-sounding CLI input yet — adding one would follow the `;`/`:` delimiter convention every other multi-value module in this repertoire already uses, documented in [modules/dendrogram](../dendrogram/MODULE.md).

## What is not checked

**Malformation, not misrepresentation**, the limit stated everywhere in this repertoire. A sounding with a superadiabatic layer, an inverted lapse rate, or values outside any physically plausible range still passes every check here — nothing verifies that the input pressure/temperature/dewpoint values describe a real or even physically sensible atmosphere, only that what was declared was actually drawn where it was declared.
