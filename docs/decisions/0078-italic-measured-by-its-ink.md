# 0078 — Italic, measured by its ink

## Status

Accepted · 2026-10-03. Extends ADR 0062 (rich text): a run may now carry a style as well as a script.

## The defect

Textbook mathematics sets variables in italic and digits and units upright: 𝑚₁ = 4 kg. The IR had no way to ask for italic.

- **The workaround had a cost.** The only option was Unicode's mathematical italic letters (𝑚, 𝑇, 𝜃). They look right but are different characters, so a figure's labels could no longer be searched, copied or read aloud as the letters they are.
- **The measurement had a gap.** The mirror measures text with `Range` rects, which report advance boxes. An italic glyph leans past its advance: the top of an italic f reaches over the next character's start. Measured at the advance, a line drawn through that lean is invisible to `text-clear-of-ink`.

## Decision

1. **`fontStyle: "normal" | "italic"` on a Block and on a TextRun.**
   - The block's value is the default and a run's overrides it. "m₁ = 4 kg" is three runs: an italic m, an upright subscript 1, and upright " = 4 kg".
   - `label` stays the plain concatenation, so every check, search and accessible name reads ordinary letters.
   - Anything else is refused at parse time.
2. **Italic text is measured by its ink.** For every italic line or italic run, the mirror reads canvas text metrics (`actualBoundingBoxLeft/Right/Ascent/Descent`) at the exact computed font. The line's box becomes the union of the advance box and the ink.
   - The anchor stays on the advance, which is where the text is drawn from. Only the box every check reads grows.
   - Upright text keeps its advance box. Its overhang in the repertoire's faces was measured within a pixel, and changing every box in the product for that would buy nothing.
3. **Drawing.**
   - The SVG writes `font-style="italic"` on the label, and on any `<tspan>` whose style differs from it.
   - Under `--fontEmbed outline`, italic text falls back to `<text>` in the installed face the mirror measured. The bundled outline face has no italic, and drawing an upright outline for an italic measurement would draw something unmeasured.

## Consequences

- Labels the user reads as variables are now the letters themselves.
- A label without `fontStyle` produces the same HTML and SVG as before.
- Tests: `tests/italic.test.ts`.
  - an invalid style is refused, on a block and on a run;
  - an italic label is wider by its lean;
  - a rule in the overhang fails `text-clear-of-ink`;
  - a mixed run label keeps its upright subscript and units.
