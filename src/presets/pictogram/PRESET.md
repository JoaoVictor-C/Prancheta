# pictogram

Data drawn as rows of icons ("cada ícone representa 5 % dos entrevistados"),
and sequences of figures made of dots (triangular, square, pentagonal and
hexagonal numbers). ENEM prints both. What is typed is the data; how many icons
are filled, and how many dots each figure has, is computed from it (ADR 0072).

**Choose it when** the content is a count or a share shown by repeated icons
(`S-pictogram-favours-pictogram`), or a sequence of dot figures whose count is
the question. **Do not choose it when** the values must be compared by length
(that is a `chart`) or the icons stand for nothing countable.

## Input

```json
{
  "preset": "pictogram",
  "icon": "person",
  "unit": "%",
  "per": 5,
  "rows": [{ "label": "Ônibus", "value": 90 }, { "label": "A pé", "value": 60 }]
}
```

- `icon`: `person` (default), `circle`, `square`, `smiley`, `house`, `star`.
- `rows`: `{ label, value }`, values not negative. `per` is what one icon stands
  for (default 1); `unit` is printed after each value and in the key.
- `of`: the whole each row is part of. Every row then shows `of / per` slots,
  the unfilled ones in outline. Default 100 when `unit` is `"%"`, else the
  largest row, rounded up.
- `partial`: `"exact"` (default) fills the last icon by the remainder's
  fraction (72 casas at 10 per icon: seven icons and a fifth); `"round"`
  rounds each row to whole icons.
- `perLine` (default 20) wraps a long row; `key: false` drops the key line.
- `kind: "figurate"` with `shape` (`triangular`, `square`, `pentagonal`,
  `hexagonal`), `terms` (1–6, default 4) and `name` (default "Figura").
  Figure k is the union of the perimeters of nested regular polygons of
  sides 0…k−1 sharing one vertex, dots at unit spacing. Its count comes out of
  that construction and equals ((s − 2)k² − (s − 4)k)/2, which the tests
  check: 1, 5, 12, 22 for pentagons.

## answers: false

The question's figure: the icons, the labels, the key and the figures stay.
Each row's value and each figure's count of dots are hidden; reading them is
what the question asks.

## What the checks hold it to

Each value names its row's last icon (`annotation-nearest-its-owner`); labels,
the key and figure names are free-standing. The canvas widens to its widest
line of text, not only its icons.
