# 0072 — Pictograms: icons and dot figures counted from the data

## Status

Accepted.

## The need

The ENEM audit left three figures uncovered that are counts drawn as repeated
icons or dots: 2023 Q176 (pentagonal dot figures), 2024 Q142 (rows of faces
growing by step), 2025 Q137 (person icons for 90 % and 60 %). Drawing them by
hand means counting icons by hand, which is exactly where a figure ends up
disagreeing with its own numbers.

## Decision

A `pictogram` preset with two kinds.

- **icons**: rows of `{label, value}`, with `per` (what one icon stands for)
  and `unit`.
  - Filled icons = value/per. A remainder fills the last icon by exactly that
    fraction: its polygons are clipped at that share of its width (one
    Sutherland–Hodgman pass).
  - With `of` (default 100 for "%"), every row shows the same slots, the rest
    in outline.
  - Six icons ship as polygons in the preset, so nothing is fetched and every
    one can be clipped. They are person, circle, square, smiley, house and star.
- **figurate**: figure k is the union of the perimeters of nested regular
  s-gons of sides 0…k−1 sharing one vertex, with dots at unit spacing,
  deduplicated.
  - The count is never typed. It comes out of the construction, and the tests
    hold it to the polygonal number ((s − 2)k² − (s − 4)k)/2.

`answers: false` hides each row's value and each figure's count; the icons and
the figures are what the question gives.

## Consequences

- 2023 Q176, 2024 Q142 and 2025 Q137 are covered. 2025 Q107's beetles still
  need their own drawings; an icon set this small does not reach phenotypes.
- More icons are a list of polygons each; an icon that cannot be clipped
  (text, an image) does not belong here.
