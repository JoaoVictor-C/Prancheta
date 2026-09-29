# venn

Venn diagrams of two or three sets in a named rectangular universe, for
Conjuntos, Probabilidade and ENEM: "sombreie (A ∪ B) − C", "numa pesquisa com
100 pessoas, 45 leem o jornal A, 30 o B, 12 ambos: quantas não leem nenhum?",
"liste os elementos de cada região". What is typed is the sets' names and,
optionally, an expression, survey data or elements. Every region drawn, every
region shaded and every number printed is **computed**. See
[`docs/decisions/0061-venn-diagrams.md`](../../../docs/decisions/0061-venn-diagrams.md).

**Choose it when** the content is sets and how they overlap: membership,
unions, intersections, differences, complements, or a head-count solved by
inclusion–exclusion. It is not for a subset of the real line (`number-line`
draws intervals and solution sets of inequalities), nor for the truth values of
a proposition (`truth-table`), nor for a stack of unrelated items
(`labelled-blocks`).

## Input

```json
{
  "preset": "venn",
  "sets": ["A", "B", "C"],
  "shade": "(A ∪ B) − C"
}
```

| field | what it does |
| --- | --- |
| `sets` | Two or three names of letters and digits (`"A"`, `"Jornal"`). Not `U`, the universe's name, or an operator word. |
| `universe` | The name drawn in the rectangle's corner. Default `"U"`. |
| `shade` | A set expression, evaluated on every region (below). |
| `counts` | Numbers: the textbook data or per-region counts (below). |
| `elements` | `{ "U": [...], "A": [...], "B": [...] }` — listed in the region each belongs to. |
| `title`, `locale` | As every preset. |

`counts` and `elements` are exclusive: a region prints one or the other.

### `shade` — the expression language

`∪` union, `∩` intersection, `−` difference, a postfix `′` for the complement,
`U` for the universe, `∅`, and brackets. `∩` binds tighter than `∪` and `−`,
which share a level and associate left, so `A ∪ B − C` is `(A ∪ B) − C`; the
caption always brackets that mix.

Every spelling is accepted: `union | +`, `inter intersect &`, `- – \ minus`,
complement as `'`, `′`, `ᶜ`, `^c`, `^{c}`, `~A`, `¬A`, `not A`. There is no
`eval`; a name that is not a set is refused with the sets that were expected.

The expression is evaluated on each region's membership vector — 4 regions for
two sets, 8 for three, the outside of every circle included — and the regions
where it holds are filled. `A′` therefore shades the universe outside A **and**
B∖A; nothing is picked by hand.

### `counts`

Textbook data — cardinalities, solved by inclusion–exclusion for every region:

```json
{ "total": 100, "A": 45, "B": 30, "A∩B": 12 }
```

Two sets need `A`, `B` and `A∩B`; three need the three sets, the three pairs and
`A∩B∩C`. `A∪B` (or `A∪B∪C`) may stand in for the last intersection. Keys also
read as `n(A)`, `|A|`, `A&B`. `total` is optional; without it nothing is printed
outside the circles.

Or the exclusive count of each region, keyed by the sets it is in: `"A"` is
only A, `"A∩B"` is in A and B and in no other set (with three sets, not in C),
`"A∩B∩C"` all three. Note the difference from the data form above, where
`"A∩B"` is the whole intersection, C included:

```json
{ "regions": { "A": 33, "B": 18, "A∩B": 12 }, "total": 100 }
```

Every inner region must be given (0 where it is empty); `none` or `total`
gives the outside.

Each count is printed at the point of **its region** furthest from every
outline, tested so that the label's whole box crosses no line. With `shade`
and `counts`, the caption adds the shaded regions' sum: `n((A ∪ B)′) = 37`.

### `elements`

Each element goes in the region its membership says. A universe list, when
given, puts what belongs to no set outside; an element in a set but not in the
universe is refused. Long lists wrap onto lines and shrink to 11 px before the
figure gives up: an impossible list is refused, never drawn across an outline.
With `shade`, the caption lists the shaded elements: `A − B = {a, b}`.

## What is drawn

- **Equal circles**, symmetric: two overlapping (centres one radius apart), or
  three on an equilateral triangle of side r, A upper left, B upper right, C
  below. Area-proportional (Euler) diagrams are **out of scope**: a region's
  size means nothing about its count.
- **Regions** are traced from the circle geometry as arcs between intersection
  points, chained into closed outlines — exact, with no polygon approximation.
  The fills come first with no stroke, and the circle outlines, cut at the same
  points, go on top, so a shaded union reads as one smooth area.
- The set names sit beside their circles, outside the overlap; `U` in the
  rectangle's corner.

## What is refused

- Fewer than two or more than three sets; repeated or reserved names.
- Data that gives a negative region — `region "only A" comes out as −2` — or
  that disagrees with its own total or union; a non-integer count.
- A `shade` that names something that is not a set, or has a stray bracket or
  a missing operator, with the position.
- `counts` together with `elements`; an unknown field (`shading`).
- An element list that does not fit its region.

## What is not covered

Four or more sets (a circle diagram does not give all the regions), area-
proportional diagrams, and shading by hatching (fills are one tint).
