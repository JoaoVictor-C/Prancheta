# 0008 — The deliverable, not the drawing

## Status

Accepted.

## Context

Every milestone up to this one answers "is this figure correctly drawn".
None of them answer "can this figure actually be used". The exported SVG
today is a flat sequence of `<rect>`/`<text>`/`<path>` elements with a single
document-level `<title>`, sized in unitless SVG user units, referencing fonts
by name with no guarantee any of them are installed on the machine that opens
it. That is sufficient to prove correctness and insufficient to hand
someone a figure.

Four gaps, independent of each other but sharing one root cause — the
project has only ever asked whether the figure is right, never whether it
can leave:

**No accessible structure.** A label's relationship to the shape it names
(`ownerId`) and a connector's endpoints (`joins`) are already computed and
already sit in the manifest. None of it is written into the SVG itself. A
screen reader, or a human skimming the file's outline in Illustrator, sees
an undifferentiated pile of shapes.

**No editable structure.** The SVG is flat — no `<g>`, no layer semantics,
just siblings in paint order. Opening it in Inkscape to nudge one label
means hunting through an unstructured element list with no relationship
between a box and the label sitting on it.

**No portable text.** Fonts are referenced by family name (`font-family`).
The renderer that made the file has the fonts; the machine opening it later
might not, and a missing face falls back silently to whatever the OS
substitutes, changing every metric the checks verified.

**No print-shaped output.** SVG and PNG only. A journal, a slide deck, a
printed handout wants PDF, sized in millimetres or column widths, not a
raster of pixels at an arbitrary DPI.

The temptation is to treat these as four independent nice-to-haves and ship
whichever is easiest. They are not independent: a PDF built from an SVG with
unembedded fonts inherits the exact same font-substitution risk the SVG has,
at higher stakes, because a PDF is judged more often on a machine the author
never touches. Font embedding has to land before PDF, or PDF is built on a
foundation already known to be unsound.

## Decision

**These four gaps are one deliverable layer, built as a bundle, in the
order the dependency actually requires**, not four unrelated tickets:

1. **Per-element accessibility metadata.** `<title>`/`<desc>` on every
   element, generated from data the manifest already carries — a label's
   `<title>` names what it labels via its `ownerId`; a connector's `<desc>`
   names what it joins via `joins`. No new computation, only new emission.
2. **Structured, grouped SVG — grouped by element, not by box-and-label
   pair.** Every element (each box, each connector, each label) gets its
   own `<g id="...">` wrapping just that element, with a stable `id`
   mirroring `data-pr-id`, and the three kinds sit in three named layer
   groups (`pr-boxes`, `pr-connectors`, `pr-text`) in that order. A box and
   its own label do **not** share one group, even though an editor might
   expect that: painter's order requires every label to render after
   *every* connector, including ones that terminate on that label's own
   box (an arrowhead touching its endpoint box can visually cross a label
   sitting near that edge) — nesting a label inside its box's group would
   print it before the connector layer and silently reopen the exact
   label-crossed-by-a-line defect the pipeline's paint order exists to
   prevent. Grouping by kind is what "structured" can safely mean without
   relitigating that invariant. This is additive to the existing flat
   emission — nothing currently reading a bare `<rect>` or `<text>` by
   `data-pr-id` breaks, because those attributes are kept exactly where
   they are; the `<g>` is a wrapper, not a replacement.
3. **A bundled font, not an arbitrary system one.** Neither mode below
   attempts to locate and embed whatever font Chromium happened to resolve
   on the machine that rendered the figure — that is a cross-platform
   font-file-discovery problem this project does not need to solve to keep
   its actual promise. Instead Prancheta ships its own font (Inter, SIL
   Open Font License, redistributable) under `assets/fonts/`, named
   internally as `"Prancheta Sans"`. When either mode below is requested,
   the HTML *mirror* is what switches to it — an `@font-face` pointing at
   the same bundled file is injected into the measurement pass itself, not
   only at export — so Chromium measures against the exact font that will
   ship, and decision 0001's invariant (the thing measured is the thing
   drawn) holds through this feature rather than being an exception to it.
4. **Two modes, and they earned different verification, not the same
   check.** `embed` inlines the bundled WOFF2 as a base64 `@font-face` data
   URI, valid per spec and honoured by browsers, Illustrator and Inkscape.
   `outline` walks each already-measured line character by character
   against the bundled font's own glyph table (via `opentype.js`, which
   this project did not previously depend on) and emits filled `<path>`
   elements instead of `<text>` — zero runtime font dependency at all, at
   the cost of the text no longer being selectable or searchable. Both are
   opt-in; the manifest records which mode ran.

   **Empirically, only one of them survives resvg.** Testing `embed`
   against `@resvg/resvg-js` directly — a WOFF2 embedded exactly as the
   spec describes, `loadSystemFonts: false` — produced a byte-identical PNG
   to the same SVG with the `@font-face` block removed entirely: usvg (the
   parser resvg is built on) does not load fonts from `@font-face` at all,
   only from `fontFiles`/`fontDirs`/`loadSystemFonts` passed to its own API.
   This is resvg's limitation, not a defect in the embedded file — Chromium
   and every other tool tested render it correctly — but it means
   `check:fonts-travel`'s resvg-based re-render can only honestly verify
   `outline`. `embed`'s manifest note says exactly this: verified against a
   fresh Chromium page load, not against resvg, and why.
5. **`check:fonts-travel`.** For `outline`, the exported SVG is re-rendered
   by resvg with `loadSystemFonts: false`; if the glyph paths still appear,
   the file is proven to carry zero external font dependency. For `embed`,
   the same file is loaded fresh in a new, unrelated Chromium page context
   instead, because that is the tool whose `@font-face` support the mode
   actually targets. Both are `check:independent`'s own argument (decision
   0001, M0) applied to a new question: not "does the SVG survive leaving
   the browser", but "does the SVG survive leaving the machine that has the
   fonts" — answered honestly per mode rather than with one check pretending
   to cover both.
6. **PDF output**, only after 4 and 5 hold, via Chromium's native
   `page.pdf()` against the same laid-out figure — vector output, not a
   rasterised page — with physical sizing (millimetres, or named
   presets for common journal column widths) as an explicit option
   alongside the existing pixel sizing.
7. **`check:independent` extended to PDF.** The existing resvg
   second-opinion check gains a PDF path: `check:fonts-travel`'s guarantee
   composed with a PDF-structure sanity check (the file parses as valid
   PDF, and contains vector paths/text rather than an embedded raster).

Steps 1–2 have no dependency on 3–7 and can land, and be verified, entirely
on their own. Steps 3–5 are a hard prerequisite for 6–7: PDF is not
attempted until font travel is proven, not assumed.

## Consequences

Good:

- A figure becomes a deliverable an agent can hand off — to a document, to
  a human editing it further, to a screen reader — with the same
  verification discipline as every geometric claim this project makes.
- The accessibility and structure work costs nothing new to compute; it is
  purely emission of data already in the manifest.
- The font-travel check turns "we embedded the font" from an assertion
  into a tested fact, the same way `--misdeclare` turns "the check runs"
  into a tested fact for modules.

Costs and limits:

- Font outlining is a real trade-off (no longer selectable/searchable
  text) and is deliberately not the default; both modes are opt-in and
  neither is forced.
- `embed` does not survive resvg. That is a real, verified gap in what
  "portable" can mean for that mode specifically, not a hidden one — the
  manifest names it, and `outline` is the mode to reach for when the
  target tool is unknown or specifically resvg-family.
- The bundled font covers Latin, Greek and Cyrillic script well; it does
  not cover CJK or other scripts it was never designed for. `outline` mode
  detects this per character (a `.notdef` glyph from the bundled font) and
  falls back to ordinary `<text>` for any line containing one, with a
  manifest warning naming which line and why — the same "report, don't
  silently substitute" discipline every check in this project already
  follows, rather than emitting a blank box glyph or claiming full outline
  coverage that isn't real.
- Embedding a WOFF2 face grows the SVG file size measurably. This is
  accepted as the cost of the guarantee; a caller who does not need
  portability can render without embedding, exactly as before this
  decision existed — nothing here changes default behaviour.
- Grouped SVG with per-element metadata is a larger file than the current
  flat output. Verified against `check:independent` and `check:fonts-travel`
  rather than assumed harmless.
- PDF sizing conventions (journal column widths, specific print standards)
  are seeded with a small, documented set rather than an exhaustive
  library; more can be added as real requests surface them.
