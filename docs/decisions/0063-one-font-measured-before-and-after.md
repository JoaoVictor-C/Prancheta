# 0063 — One font, measured before the browser and after it

## Status

Accepted. Amends 0008 (the default font mode) and 0062 (the panel's widths).

## The defect

A review found that a figure was planned in one font and drawn in another.

1. **Presets set their text in the system font.** `Board` (the drawing
   surface most presets use) named `"Segoe UI, Noto Sans, system-ui"` on
   every label, and a variable name in `"Palatino Linotype, … serif"`. The
   HTML mirror loaded the bundled face, but a block's own family overrode the
   body's, so Chromium laid preset figures out in Segoe UI on Windows and Noto
   Sans on the Linux CI. The type packs did the same with `"Inter"`, which
   asks the *host* for Inter — a face the mirror never loaded.
2. **Presets planned with a guess.** Before any browser exists a preset must
   size label boxes, wrap panels and space tick numbers; it used 0.56em a
   character plus 10px (`estimateWidth`, `estimateRunsWidth`, bold +8%).
3. **So the same input planned one figure and drew another, differently on
   each OS.** CI failed twice on tick labels and on a variant shortfall
   because Linux's fonts are wider; panels wrapped early and labels got
   generous boxes because the guess had to be conservative for every font.
4. **And the SVG named a font most viewers lack.** CDP reports a web font by
   the name inside its file, so the exported stack began `"Inter", "Prancheta
   Sans", …` and, with the default `fontEmbed: "none"`, a viewer without
   Inter — including the page that rasterised the PNG — drew Segoe UI.
5. **Bold was synthesised.** Only `Inter-Regular.woff2` was loaded; a 600 or
   700 label was a smeared Regular with Regular's advances.

## The decision

### One face, one file, every consumer

`assets/fonts/Inter-Text-Variable.woff`, derived from the upstream variable
Inter by `scripts/make-font-instance.py`:

- **opsz pinned at 14** ("Text"). Chromium applies optical sizing on its own,
  so with the axis left in a 30px title is set in a narrower design than a
  13px label and every size needs its own advance table. Pinned, weight 400 is
  glyph-for-glyph the `Inter-Regular.woff2` shipped before (measured: 0.000px
  difference over the test sample), and a width depends only on size, weight
  and tracking.
- **wght kept, 400–700** — every weight a preset or pack uses. The mirror
  declares `font-weight: 400 700`, so bold is the real bold. A weight outside
  the range is clamped by Chromium and by measurement alike.
- **WOFF, not WOFF2**, because opentype.js cannot decode Brotli. The mirror
  (`@font-face`), `embed`, `outline` and planning (`opentype.js`) now read the
  same bytes; the old two-file arrangement (a WOFF2 to draw, a TTF to outline)
  is gone. `Inter-Regular.woff2` is deleted; `Inter-Variable.ttf` stays as the
  source the instance is made from.

It is named **"Prancheta Sans"** everywhere: `BUNDLED_FONT_STACK` =
`"Prancheta Sans", "Segoe UI", "Noto Sans", system-ui, sans-serif` is the
theme's family, `Board`'s family, every sans level of every type pack, the
modules' stack, and the sheet page's body. The host faces after it draw only
what the bundled face lacks. CDP's report of a custom font is mapped back to
that name (`layout/fonts.ts`), so the SVG never names "Inter" first.

**The serif is dropped, not bundled.** `serif: true` (an axis's x, a set's
name, a truth table's inputs, the sign chart's variable) was Palatino on
Windows and whatever the host had elsewhere: the one face in a figure nothing
could measure. Bundling a serif would mean choosing, licensing and shipping a
second face for a handful of one-letter labels, and keeping a second advance
table honest. The option stays on `LabelOptions` as a statement of what the
label is; it now sets the name in the bundled face at the same weight. The
sheet's page headings keep Georgia: page design, not measured figure text.

### Planning measures: `layout/text-metrics.ts`

`measureText(text, { size, weight, tracking })` sums the bundled face's
advance widths at `weight` (the HVAR delta on the weight axis), adds tracking
after every visible character as CSS does, and returns the widest line.
Per-weight glyph advances and whole strings are cached; a sample of 3 400
strings × sizes × weights costs a few milliseconds.

- **Kerning is off** — in the mirror (every mode, not only `outline` as
  before), in the exported SVG (`text { font-kerning: none; }`), and so in
  measurement. opentype.js cannot read this face's kerning: its main pair
  table sits in a GPOS extension lookup it does not implement, and its values
  vary with weight through GDEF deltas. Writing that reader was not cheap;
  turning kerning off makes the sum of advances *exactly* Chromium's line, and
  makes `embed`, `none` and `outline` put every glyph in the same place. The
  cost: "AV", "Te", "P(" set a little looser than Inter would set them.
- **A character the face lacks** (ℝ, ∈, ∪, ∩, CJK) is budgeted at 0.6em; the
  host's fallback draws it and `text-fits-box` still measures it.
- **Chromium turns tracking off for "12 000" alone.** U+202F, the digit-group
  space, is both Latin and Mongolian; a line with no letter to settle it is
  itemised as Mongolian, a cursive script, and set untracked. Measured, and
  modelled (`trackingApplies`); a bracketed group is off by one tracking unit.

Every estimate site now measures: `Board.measure`/`extent` (which gained a
`weight` argument, passed at the table presets' call sites: sign chart, value
table, truth table, statistics, number line), `shared/text.ts`'s `labelWidth`
(was `estimateWidth`), `shared/panel.ts`'s `runsWidth` (was
`estimateRunsWidth`, scripts at 0.7 of the size as the mirror sets them), the
linear map's panel packing and the statistics panel.

**The 10px slack stays**, renamed `LABEL_SLACK`. It was the hedge on the
guess; it is now margin by choice, and the presets' own arithmetic (a tick
number's box is `measure − 8`) was written against it.

### The SVG carries its face by default

`DEFAULT_FONT_EMBED` is `"embed"` — for `render`, `toSvg` (so animations) and
the sheet's figures. An SVG that only names the face is a different figure on
every machine that lacks it, which is almost every machine. `outline` and
`none` remain; for `none`, the page that rasterises the PNG and PDF is given
the `@font-face`, since those files are artefacts in their own right, while
an `embed` or `outline` SVG is rasterised with nothing added, so the PNG
still proves what the file holds. `outline` now draws each glyph at its
weight (opentype.js's `variation` option) and walks the pen with the line's
tracking, which it silently dropped before for plain lines.

### Sheets

Figures are embedded like any SVG (an `<img>` SVG cannot see the page's
fonts). The page text is set in the bundled face too, inlined as `@font-face`
in the style — Chromium refuses a font from a `file://` URL — so the readings
lifted out of a figure (ADR 0062) match it, and pagination no longer depends
on the printing machine's sans.

## What it costs

| | before | after |
| --- | --- | --- |
| a figure's SVG (default mode) | names Segoe UI or "Inter" | +≈330 KB: the face as base64 |
| the 232 renderable fixtures, SVG + PNG | 21 MB | 95 MB |
| Cálculo 1 sheet PDF (14 figures, 29 pages) | 1.7 MB | 2.5 MB — each `<img>` SVG brings its own copy, which Chromium subsets per figure |
| Cálculo 1 HTML | 55 KB | 372 KB |
| `npm test` on the same machine and day | 114 s with the old face swapped back in | 118 s |

A caller that knows its viewer has the face, or ships many small SVGs, asks
for `--fontEmbed none`; one that cannot trust any font asks for `outline`.

## What changed on the page

Checked by rendering all 238 fixtures before and after
(`scratchpad/font/{before,after}`): the same 232 pass every check, the same
six planted defects fail the same checks, and the repair loop makes the same
15 edits.

- **Every preset figure is in Inter**, bold is real bold, variable names are
  sans.
- **Panels wrap later**: a real width is narrower than 0.56em for most prose,
  so automaton, distribution, linear-map and statistics panels lose a line
  (canvas 22–75px shorter).
- **Tables fit their text**: sign charts, truth tables and value tables are up
  to 45px narrower, probability trees up to 58px narrower; a few tables with
  many digits are wider, because Inter's digits (≈0.62em) are wider than the
  guess.
- **Two placements had to change**, both because a bold capital is wider in
  Inter than the guess said:
  - `vectors`: a point's name ("A" beside a vertical shaft) searched two 6px
    steps; its box now clears the shaft only at the third. Three steps.
  - `construction`: a point's name in a crowded vertex (a building's windows
    on one side, the ground's hatching on the other) found no honest spot,
    because the candidate ring pushes a wide box out along the diagonal by its
    reach until something else is nearer it than its point. `aroundPoint` now
    also offers each diagonal with the box's corner at the gap.

## What was refused

- **Reading Inter's GPOS kerning by hand.** Possible — extension lookups,
  class pairs, VariationIndex deltas into GDEF — but a second shaping engine
  to keep in step with HarfBuzz, for a looser-by-a-hair "AV".
- **Keeping opsz.** Honest optical sizes for titles, at the price of a width
  table per size and a second design at display sizes nobody asked for.
- **A WOFF2 variable face.** Smaller on the wire, unreadable by opentype.js;
  two files that must agree is what this replaces.
- **Linking the sheet's font.** `file://` fonts are cross-origin to Chromium.
- **Making `none` still the default and embedding only in sheets.** It would
  leave the default SVG a different figure on the reader's machine, which is
  the defect.

## Tests

- `tests/text-metrics.test.ts` (new): `measureText` against Chromium's own
  width on the mirror's page — 16 strings × 8 sizes × 5 weights × 3
  trackings, within 1px (the observed worst is ~0.06px); the digit-group
  tracking rule; clamping, bold wider, the fallback budget; and, for four
  presets' fixtures (function graph, statistics, truth table, probability
  tree), every planned label line against the line Chromium laid out, within
  1px.
- `tests/font-embed.test.ts`: the default is `embed`; `none` ships no bytes,
  names "Prancheta Sans" first and turns kerning off; `embed` declares the
  weight range; the asset is a WOFF with one axis, wght 400–700; `outline`
  draws a bold glyph wider and differently, without leaking that advance into
  a later regular lookup.
- `tests/shared-text.test.ts`: `labelWidth` replaces the `estimateWidth` test.
- `tests/panel.test.ts`: `runsWidth` for `estimateRunsWidth`.
- `tests/typography.test.ts`: grotesk's family is `"Prancheta Sans"…`, not
  `Inter`.
- `tests/sheet-calc.test.ts`: the Cálculo 1 HTML hash changed, and only
  because of the style's font lines (undoing those two edits reproduces the
  old hash).
