# 0062 — Rich text, one reading panel, and lifting the panel into a sheet

## Status

Accepted.

## The defect

A review found two related problems in how figures print computed text.

1. **Typography was faked.** A label was one plain string. The circuit set
   "U", "AB", " = V", "A", " − V", "B" … as seven blocks side by side, each
   with an estimated width, so the gaps around "U_AB = V_A − V_B" came out
   uneven and nothing measured the line as a line. The other presets used
   Unicode sub- and superscript digits, which covers ₁ and ², but Unicode has
   no subscript capitals: U_AB, V_A, P_R1, f_x, θ_c and proj_v could not be
   written at all, and were printed as "fx", "θc" and "proj_v(u)".
2. **Eighteen presets each built their own reading panel** — the lines of
   computed readings under the figure — with their own wrap, their own line
   height, their own colours and their own ids (`panel-line-3`, `reading-2`,
   `reading-u`, `caption`, `panel-head-0`).
3. **In a sheet the panel shrank with the figure.** `sheet.ts` scales every
   figure to the page column, so a panel set at 13–14px on a 700–900px
   canvas printed at about 7pt: the optics and circuit solutions were barely
   legible, and green checks said nothing about it.

## The decision

### Rich text: `Block.runs`, closed

A Block may carry `runs: { text: string; script?: "sub" | "sup" }[]`. The
form is closed on purpose — plain, subscript or superscript; no nesting, no
colour, no weight — because that is what the defect needs and what every
consumer can reproduce exactly.

- **`label` stays, and is the plain concatenation of the runs.** `parseSpec`
  refuses a block whose `label` differs from its runs' text, a run with any
  other field, an empty run list, a script outside `sub`/`sup`, or a line
  break inside a script. Every check (`text-fits-box`, `text-clear-of-ink`,
  contrast, the label checks, the length/area/sweep parsers), search, the
  manifest and the accessible name keep reading one plain string. "U_AB"
  reads as "UAB" there — the same string a browser gives for `U<sub>AB</sub>`.
- **The mirror lays runs out with real `<sub>`/`<sup>`** (`layout/html.ts`,
  `SCRIPT_STYLE`): 0.7em, a subscript's baseline 0.21em below the line's, a
  superscript's 0.385em above, `line-height: 1` so a script does not open
  the line box. Chromium lays the line out, wraps it and measures it.
- **Measurement reads each run back** (`layout/measure.ts`, `measureRich`).
  Characters are grouped into lines by the *line's* baseline, not by the top
  of their rects — a subscript's rect sits lower and would otherwise start a
  line of its own. Each script's baseline offset and shift are measured with
  a probe built from a copy of the label's own `<sub>`/`<sup>` markup, never
  derived from the CSS. A measured line then carries `runs`: pieces of one
  script each, with the left edge, baseline and font size Chromium gave them.
- **The SVG draws what was measured** (`render/svg.ts`). Still one `<text>`
  per line (decision 0001's rule 2), its runs as `<tspan>`s at absolute x/y
  and their own font size — placement, not layout: the SVG renderer decides
  nothing. `--fontEmbed outline` walks each run's glyph paths from its own
  measured left edge, so a run never inherits drift from the one before it.
  PDF export and the PNG go through Chromium and need nothing new.
- **A plain label is untouched.** The rich path runs only for a block with
  `runs`, so every existing figure measures and draws byte-for-byte as before.

### One reading panel: `src/presets/shared/panel.ts`

`layoutPanel(lines, { width, size, lineHeight, rules, emphasis })` wraps and
measures (a preset needs the panel's height before its canvas exists);
`Panel.draw(board, { left | align: "center", top, cut })` places it. A line
is `{ text, emphasis, colour?, swatch?, lead?, gap?, id?, wrap? }`:

- `text` is a string — `_{…}` and `^{…}` mark scripts, `rich("U_{AB}")` — or
  runs given directly. A bare `_` or `^` is literal text.
- `emphasis` is `normal` (ink), `strong` (ink, bold: a result), `soft`
  (grey: a step, a note) or `accent` (a given colour, bold). These are the
  four the presets were already using, now spelled once.
- `swatch` draws a short coloured rule before the line (the probability
  tree's highlighted paths); `lead` sets a term strong in a column of its own
  with the text hanging beside it (the automaton's word and its run); `gap`
  opens space between groups of lines.
- Wrapping goes through `shared/text.ts`'s `wrapText` with the preset's own
  rules (an operator stays with its neighbours; "→a" stays with its state); a
  script is carried through as private-use brackets so it is never parted
  from its word.
- Every block is `freeStanding` and its id starts with `panel-`
  (`panel-<id>`, `panel-<id>-2` for a wrapped continuation, `panel-<id>-lead`,
  `panel-swatch-<id>`). A block gets `runs` only when a line has a script.
- `draw` records the lines on the Board as `readings`, which `Board.spec`
  puts on the FigureSpec.

### `FigureSpec.readings`, and lifting it

`readings = { lines: ReadingLine[], top }` is the panel as data: the
*logical* lines (unwrapped — a page wraps them at its own width) with their
runs, emphasis, colour, swatch, lead and gap, and `top`, the canvas y where
the figure proper ends. `liftReadings(spec)` removes every `panel-*` block
and mark, crops the root scene to `top`, and returns the lines. It throws if
anything else reaches below `top`: cropping it would silently delete part of
the drawing. `render(spec, { readings: "omit" })` draws the lifted figure.

### The sheet sets readings as page text, by default

A figure's reading panel is lifted out of the drawing and printed as HTML
under the image — the same lines, the same emphasis and colours, scripts as
`<sub>`/`<sup>`, at 9.6pt, in a grid so swatches and leads line up.
`"readings": "drawing"` on a figure, or on the sheet, keeps the old
behaviour. The panel's CSS is added to a document only when one of its
figures has lifted readings, so a sheet without panels is byte-for-byte the
document it was (`tests/sheet-calc.test.ts` pins the Cálculo 1 list). KaTeX
is not involved.

## Migrated presets, and what changed on the page

| preset | before | now |
| --- | --- | --- |
| `circuit` | a block per run, estimated offsets; `U`, `AB`, `= V`… | one block per line, **real subscripts** U_AB, V_A, P_E1, P_R1 |
| `optics` | lens panel above the scale bar's row, below it the bar | the scale bar sits above the panel (it belongs to the figure); θ_c a **real subscript** |
| `surface` | "fx(1; 1)", "fy(1; 1)" | f_x, f_y **real subscripts** |
| `vectors` | "proj_v(u)" in the panel and on the arrow | proj with v a **real subscript**, in both |
| `distribution` | "e^(−2,5)" for a non-integer λ | e with a **real superscript** |
| `linear-map` | matrix, head lines and body all "panel" | the matrix block (A =, entries, brackets, the lines beside it: now `matrix-*` ids) is part of the figure; the body lines are the panel; unnamed vertices V_1′ get a **real subscript** |
| `construction`, `venn`, `value-table` | each line centred on its own | lines left-aligned in a block centred as a whole |
| `statistics` | statistic lines medium (500) | regular (400) ink; notes unchanged, soft |
| `field` | canvas reserved 3 lines of 56px per solution curve | the canvas ends at the last reading |
| `automaton`, `probability-tree`, `truth-table`, `logic-circuit`, `space`, `solid`, `revolution` | private panel code | same look through the shared builder (heading/verdict weight 600 → 700 in automaton) |

What each panel **says** is unchanged: the strings are the same, and the
tests that read them read the same text (a label is the runs' plain text).
Ids changed from `reading-*`, `panel-line-*`, `caption` to `panel-*`; the
tests that named them were updated.

## What was refused

- **An open rich-text model** (colour, weight, nested runs, fractions).
  Nothing asked for it, and each addition is one more thing the mirror, the
  measurement, three SVG modes and the page must reproduce exactly.
- **Positioning scripts from CSS arithmetic** (0.7em × a shift). The probe
  measures the offset and the shift in the same engine that laid out the
  label; a fallback font or a different UA default would silently break the
  arithmetic, and not the measurement.
- **`dominant-baseline`/`baseline-shift` in the SVG.** Renderers disagree on
  both; absolute tspan positions from the measurement mean one geometry.
- **Keeping per-run blocks and making them tighter.** The circuit's blocks
  were the defect: a line measured as seven guesses.
- **Lifting by hiding blocks only.** The canvas would keep the panel's empty
  band; the crop needs `top`, and the refusal when something else sits below
  it is what keeps the crop honest.
- **Recording the wrapped lines in `readings`.** The page is narrower or
  wider than the canvas; it wraps better than the canvas's estimate.

## The cost, stated

- **The panel's widths are still estimates** (`estimateRunsWidth`, 0.56em a
  character, scripts at 0.7, bold 8% wider) — a preset expands before any
  browser exists. Generous is the safe direction, and `text-fits-box` still
  measures every block.
- **In `none` font mode the SVG names the resolved face first**, as before;
  a viewer without that face draws a different one. Runs are placed
  absolutely, so a wider fallback can overlap the next run where a plain line
  would merely run long. `embed` and `outline` are exact.
- **A lifted panel is not checked.** Page text is not a figure; the sheet's
  own KaTeX/image checks do not look at it. The figure's checks still run on
  the cropped drawing.
- **The optics scale bar moved above the panel**, so a lens figure's bar and
  its note now sit directly under the plot.
- **`label` reads "UAB", not "U_AB".** It is what a browser's text content
  gives for the same markup; a screen reader hears the same.

## Tests

- `tests/rich-text.test.ts`: parseSpec keeps and refuses runs; the mirror
  emits `<sub>`; a rich line is measured as one line, run by run (subscripts
  smaller and lower, superscripts higher, left to right), and drawn as one
  `<text>` of positioned tspans; a rich label wraps into lines grouped by
  baseline; `outline` draws every glyph as a path, `embed` keeps tspans;
  every check passes.
- `tests/panel.test.ts`: `rich()`, `wrapRuns` never parting a script;
  `layoutPanel` ids, emphasis, runs, swatch, lead and logical readings; for
  every fixture of all eighteen migrated presets, with and without answers,
  a drawn panel is recorded as readings, every panel block is free-standing,
  and `liftReadings` crops cleanly; answers:false panels hide what they hid;
  a bad cut is refused; a lifted figure renders with every check passing;
  a sheet lifts by default, prints U<sub>AB</sub> as HTML, and keeps the
  panel in the drawing when asked; `readingsHtml` columns and classes.
