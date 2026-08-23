# 0007 — Colour is checked, not chosen

## Status

Accepted.

## Context

Decision 0006 established the pattern this decision reuses: a new degree of
freedom is only admissible once something can verify it. Colour has been a
single hand-tuned dark palette (`theme.ts`, `#0F1115` background) since M0.
One palette can be eyeballed by its author and shipped on trust. That trust
does not scale to a second palette, because nothing in the six geometric
checks has any opinion about colour — text-fits-box is satisfied by white
text on white fill as readily as by white text on black fill.

The hazard is the same shape as decision 0006's: introduce a light or print
theme, and the manifest keeps saying `ok` for a figure nobody could actually
read. A tool whose entire premise is measuring what it drew cannot ship a
second palette that it has no way to measure the legibility of.

Two more forces sharpen this beyond ordinary contrast checking:

**Categorical data needs distinguishable colours, not just readable ones.**
A chart preset with five roles rendered in colours that a deuteranope cannot
tell apart is malformed in the same sense an overlapping box is malformed —
the reader cannot recover the information the figure claims to encode. This
is not covered by a text/background contrast check at all; it needs a
distinct check over the palette's categorical colours.

**A palette is data, not a constant, the moment there is more than one.**
`theme.ts` today hard-codes fill/stroke/text per role. Introducing `light`
and `print` variants without restructuring that would mean three near-copies
of the same object drifting independently, which is a worse failure mode
than not having variants at all.

## Decision

**Colour is checked geometry, in the same sense effects are checked
geometry.** Concretely:

1. Palettes become data: a `dark` (the existing palette, byte-identical),
   `light`, and `print` variant, each declaring the full role set
   (`default`, `primary`, `accent`, `warning`, `muted`, `callout`) plus
   canvas background and text colour. `theme.ts`'s existing shape is kept;
   the new module wraps it rather than replacing it, so nothing existing
   changes unless a spec explicitly asks for a variant.
2. A new check, `contrast-sufficient`, computes WCAG relative luminance
   contrast for every text/fill pair actually drawn (a label against its
   owning block's fill, ink against the canvas) and fails below the WCAG AA
   threshold for the element's font size (4.5:1 normal text, 3:1 large
   text ≥ 18pt or 14pt bold). This runs in `checks.ts` alongside the
   existing six, at the same cost — it reads colours already present on
   `PlacedBox`/`PlacedText`, no new measurement pass.
3. A second new check, `categorical-colours-distinguishable`, applies only
   where a spec declares two or more elements share a role intended to be
   read as categorical (initially: chart series/legend colours). It
   simulates deuteranopia and protanopia (fixed, well-known transform
   matrices — no ML, no external service) and asserts a minimum perceptual
   distance between every declared pair under each simulation.
4. Both checks are `not-applicable`, not silently passing, when nothing
   applicable was examined — the same rule decision 0005 and the existing
   six checks already hold themselves to.
5. No repair strategy is planned for either check in this milestone. A
   failure is reported with the exact contrast ratio and the threshold it
   missed; fixing it is choosing a different colour, which is an authoring
   decision, not a geometry repair the loop can make unsupervised. (Colour
   repair — e.g., darkening a fill until contrast passes — is left to a
   later milestone if it proves worth the risk of a check optimizing
   against itself.)

## Consequences

Good:

- A light or print theme can ship with the same verification guarantee
  every other degree of freedom in this project carries.
- The existing dark palette is provably unchanged: every current fixture
  renders byte-identical SVG, checked by a regression test diffing output
  before and after this decision lands.
- `node src/cli.ts effects`-style introspection becomes possible for
  palettes too — an author can ask what a theme resolves to before
  rendering.

Costs and limits:

- WCAG contrast is a real but imperfect proxy for legibility; it says
  nothing about colour meaning (a warning role that isn't visually
  "warning-like") or about non-luminance-based colour vision differences
  this decision does not attempt to simulate.
- No repair means a `contrast-sufficient` failure is always reported,
  never fixed automatically, in this milestone. That is a smaller promise
  than the rest of the repair loop makes, and is stated as a known gap
  rather than hidden.
- Categorical-distinguishability only fires where a spec explicitly marks
  colours as categorical; it cannot retroactively protect a chart authored
  before that vocabulary existed.
