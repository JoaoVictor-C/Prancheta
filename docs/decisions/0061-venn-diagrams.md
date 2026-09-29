# 0061 — Venn diagrams: regions computed, shading evaluated

## Status

Accepted.

## The need

Conjuntos, Probabilidade and ENEM ask for one figure in two dialects.
"Sombreie (A ∪ B) − C" wants the regions where an expression holds;
"numa pesquisa com 100 pessoas, 45 leem o jornal A, 30 o B, 12 ambos: quantas
não leem nenhum?" wants the head-count solved and written in each region,
including the one outside the circles. Both are decided by arithmetic on
regions, and both are easy to get plausibly wrong by hand: a lens shaded where
a crescent was meant, 33 written in the region that holds 18, an "outside" that
is a leftover nobody computed.

The project had no preset for it (`number-line` draws subsets of the real line,
`labelled-blocks` a stack of boxes), so a Venn diagram was raw IR with every
region positioned by eye.

## The decision

**`venn` takes the sets' names and, optionally, one of three things to show:
an expression to shade, data to solve, or elements to place.** Circles are
equal and symmetric — two overlapping, or three on an equilateral triangle of
side r. **Area-proportional (Euler) diagrams are out of scope**: nothing here
makes a region's size mean its count, and the figure says so by not trying.

### Regions come from the geometry, not from a list

The plane is cut into its 2ⁿ atomic regions (the outside of every circle
included). Each circle is split at its intersection points with the others;
an arc's midpoint, tested against the other circles, says which two regions
lie on either side of it. A region's outline is the chain of its arcs, each
walked with the region on its left, so both regions of an arc are known and the
chain closes by construction. This is exact — each arc is one IR
`{ arc, centre }` segment per ≤ 60° — where the alternative, boolean
operations on 256-gons, would have shipped an approximation and a polygon
library. (The clipped-polygon route was kept as the fallback and not needed.)
The outside is the universe rectangle, painted first; its holes are the inner
regions painted over it, because an IR mark has one outline and no holes.

### Shading is evaluation

`shade` is parsed by a small closed grammar (`src/presets/venn/setexpr.ts`:
∪ ∩ − ′, `U`, `∅`, brackets, every ascii spelling, no `eval`) and evaluated on
each region's membership vector. The regions where it is true are filled;
none is picked by hand, so `A′` shades the universe outside A and the part of
B beyond it without a rule that says so. `∪` and `−` share a level and
associate left, as + and − do; `∩` binds tighter; the caption always brackets
a mix, so a reader never depends on the convention.

**Fills are drawn first, with no stroke, and the circle outlines on top.**
The outlines are cut at the same intersection points as the region arcs, so
they are the very lines the fills end on; the seam between two shaded regions
is under a 2px line, and a shaded union reads as one area.

### Counts are solved, and refused when they do not fit

Two forms. `regions` is the exclusive count of each region. The textbook data
— |A|, |B|, |A∩B|, total, and for three sets the seven values — is solved by
inclusion–exclusion, exact(S) = Σ over T ⊇ S of (−1)^(|T|−|S|)·|∩T|, with the
union accepted in place of the last intersection. A region that comes out
negative is a `SpecError` naming it (`region "only A" comes out as −2`), as
does a total or union the other data contradicts. The two forms share key
spellings but not meaning — in the data form `A∩B` is the whole intersection, in
`regions` the part outside C — which is why they are separated by the
`regions` key rather than guessed.

Each number is set at a **sampled pole of inaccessibility** of ITS region: the
point furthest from every outline at which the label's whole box (not just its
centre) crosses no outline, found by testing whether an outline's distance
range over the box straddles the radius. Outside every circle the corner
opposite `U` is preferred among the roomy points. If the box will not fit at
any size the figure is refused rather than drawn across a line.

With `shade` and `counts`, the caption is the sum of the shaded regions
(`n((A ∪ B)′) = 37`) — computed, not typed. Without a total, the outside is
unknown and no sum that includes it is claimed.

### Elements

Membership is computed from the lists; an element in a set but not in a stated
universe is refused. A region's elements wrap to as few lines as fit at the
largest type that fits.

### Checks

Every count and element list declares the region mark it names (`annotates`),
the outside count a place; set names name their circle. The arcs of a circle and
of the regions on it use the same waypoints, so the nearest-owner check never
sees two outlines of the same circle disagree.

## Vocabulary

`STRUCTURE` already has **"set"**: an unordered set of items, drawn as
`labelled-blocks`. That is a different content — a collection with no relation
among its members — and rule `S-set-favours-blocks` must keep meaning it. The
Venn content is **relations among sets**: overlap, union, intersection,
complement, counts by region. So the proposal is a distinct value,
**`set-relations`**, favouring `venn` and disqualifying nothing; `"set"` is
left exactly as it is. Content that is both (a bag of items that also overlap
another bag) states `set-relations`; a plain list of things stays `set`.

## What was refused

- **Area-proportional circles.** A region's size would then imply its count;
  equal circles do not, and a student sees the arithmetic and not the area.
- **Four or more sets.** Four circles cannot realise all 16 regions; that
  needs ellipses or rectangles, and no exercise in the syllabus asks for it.
- **Hatching.** One tint carries the shading and prints in grey.
- **A hand-listed shaded region.** `shade: ["A only", "A∩B"]` would be the
  picking the whole preset exists to prevent.

## What is not covered

Four or more sets, area-proportional diagrams, and probabilities as fractions
inside regions (give counts; the ratio to the total is one division away).
