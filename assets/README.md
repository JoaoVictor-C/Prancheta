# Bundled assets and their provenance

Everything in this directory is third-party. Prancheta's own MIT licence
([LICENSE](../LICENSE)) does not cover these files; each one's own terms do,
and they are recorded here so a redistributor does not have to guess.

## Fonts

### Inter

- **Files:** `fonts/Inter-Text-Variable.woff` (what Prancheta loads), derived by
  [`scripts/make-font-instance.py`](../scripts/make-font-instance.py) from the
  upstream `fonts/Inter-Variable.ttf`: optical size pinned at 14 ("Text"),
  weight axis kept from 400 to 700, WOFF so opentype.js can read it (ADR 0063).
  The OFL permits modified versions; Inter declares no Reserved Font Name.
- **Source:** [The Inter Project](https://github.com/rsms/inter) by Rasmus Andersson
- **Licence:** SIL Open Font License 1.1 — full text in [fonts/LICENSE.txt](fonts/LICENSE.txt)
- **Why it ships:** Inter is the one face that *travels*, and every figure is
  set and measured in it. `--fontEmbed embed` (the default)
  inlines it as a `@font-face` data URI and `--fontEmbed outline` converts its
  glyphs to filled paths, both verified against resvg with no system fonts
  available at all. A figure that depended on a font the recipient must already
  have installed would not be a deliverable. The OFL permits this
  redistribution and embedding; it requires the licence text to travel with the
  fonts, which is why `fonts/LICENSE.txt` is committed beside them.

## Images

### The Creation of Adam (cropped)

- **File:** `Michelangelo_-_Creation_of_Adam_(cropped).jpg`
- **Work:** Michelangelo Buonarroti (1475–1564), *The Creation of Adam*,
  Sistine Chapel ceiling, c. 1511
- **Source:** [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Michelangelo_-_Creation_of_Adam_(cropped).jpg)
- **Licence:** Public domain. The author died in 1564, so the work is out of
  copyright everywhere the term is life plus 100 years or fewer. Commons tags
  the file `PD-old-100-expired` and `PD-Art (PD-old-auto-expired)` — the latter
  being its position that a faithful photographic reproduction of a
  two-dimensional public-domain work creates no new copyright.
- **Attribution:** Not required. Recorded here anyway, because "no attribution
  required" and "no provenance recorded" are not the same thing.
- **Used by:** [experiments/pointillism/adam.mjs](../experiments/pointillism/adam.mjs),
  which resamples it as discrete marks. It is source data for one experiment,
  not an asset the renderer depends on.

## Geographic data

The map module's country boundaries are not in this directory — they live
beside the module that reads them, in
[modules/map/data](../modules/map/data). They are
[Natural Earth](https://www.naturalearthdata.com/) 1:110m cultural vectors,
public domain, no attribution required; the preparation and clipping is
documented in [modules/map/MODULE.md](../modules/map/MODULE.md).
