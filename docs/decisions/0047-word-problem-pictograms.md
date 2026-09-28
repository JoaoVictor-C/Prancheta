# 0047 — Word-problem pictograms: decoration on an object already named

## Status

Accepted.

## The need

Phase 3 (`docs/PLAN-COVERAGE.md`) asks for "scene pictograms for word
problems (ladder, wall, pole and shadow, ramp), placed by kernel geometry
from the problem's numbers." The construction preset (ADR 0044) already
computes the right triangle behind "uma escada de 5 m está apoiada num
muro, com o pé a 3 m do muro" — a segment, a length label, a right angle —
but a bare triangle is not the figure a student expects. The wall, the
ladder's rungs, the ground, the sun casting a shadow: these are what tells a
reader which classic problem this is, and this project's standing rule is
that nothing on a figure is placed by eye (AGENTS.md, "derive, do not
verify"). A hand-placed ladder icon beside a correctly computed triangle
would be exactly the defect ADR 0044 exists to prevent, one layer further
out.

## The decision

**A pictogram is `picto`, an option on an object already defined — never a
new coordinate, never a new kind of geometry.** A ladder's rails and rungs
are computed from the same segment whose length is annotated `5`; a pole's
height is that segment's own length, not a second number that could
disagree with it; a sun's light ray and the shadow it casts are an ordinary
`rotation` + `line` + `intersection`, the identical recipe ADR 0044 already
uses for a reflected triangle or a tangent point, with the picto only
drawing the icon at one end of already-computed ink.

Concretely: `SEGMENT_PICTOS` (`ground`, `wall`, `ladder`, `ramp`, `pole`,
`tree`, `person`, `building`) decorate a drawn **segment** — refused on a
line or a ray, which have no second end to measure a height or a hatch
extent from. `POINT_PICTOS` (`sun`, `boat`) decorate a **point** already
placed by some earlier construction. Both are parsed and validated exactly
where every other option is (`checkedPicto`, beside `checkedText`), and
`side: 1 | -1` says which side of a segment a hatch, a facade or a ladder's
second rail falls on — the one genuinely free choice, since nothing in the
geometry says whether a wall's far side faces left or right on the page.

**Every pictogram is pure geometry over the object's own already-placed
canvas points**, in `src/presets/construction/preset.ts`'s pictogram
section: `hatchTicks`, `ladderGeometry`, `poleGlyph`, `treeGlyph`,
`personGlyph`, `buildingGlyph`, `sunGlyph`, `boatGlyph`. Each takes the
segment's or point's canvas coordinates and returns plain polylines — no
frame, no locale, nothing typed — the same shape as `rotateAbout` and
`angleAt`, and exported for the same reason: a test holds `ladderGeometry`'s
rung spacing and `hatchTicks`' tick count without rendering a figure.

**A pictogram declares its ink like any other mark, and it competes.**
`Placer.addInk`'s third argument controls whether a mark counts toward
"nearest ink" when the placer searches for a label's spot (`competes:
false` is how the grid lattice stays exempt, ADR 0028/0034). A hatch tick or
a ladder's rail is not furniture — it is real, visible ink a reader could
mistake a nearby label for naming — so pictogram ink is added **competing**.
The first attempt used `competes: false`, on the reasoning that decoration
should not fight a label for a spot; it broke `label-nearest-its-place`
outright, because the *search* stopped caring whether a hatch tick ended up
nearer a point than the point's own dot, while the real check in
`checks.ts` never knew or cared about the placer's private flag and failed
the figure anyway. Competing ink fixes the search at its source: a point's
own name is now tried at spots that are honestly nearest the point, past
the hatching, not merely clear of crossing it.

**A hatch never starts on the endpoint it decorates.** The first version
placed a tick at each segment end (`t = 0` and `t = 1`), which put the
first tick of a wall's or a ground's hatching right beside that segment's
own named endpoint (`WallBase`, `F`) — a few pixels from a point whose own
label search starts a few pixels away too. `hatchTicks` instead centres `n`
ticks in `n` equal divisions (`t = (k + 0.5) / n`), keeping every tick at
least half a gap clear of both ends. Combined with competing ink, this is
what let three of the four fixtures pass outright; the fourth
(`ladder-wall.json`, where a wall, a ladder and a ground hatch all meet at
one crowded corner) still needed its two corner points marked `"label":
false` — the pedagogical content is the wall's height and the ladder's
length, not the corner points' own names, and ADR 0044 already records that
a crowded interior can leave no honest spot for every label at once.

## What each fixture computes

- **`ladder-wall.json`.** A wall's line and a circle of radius 5 (the
  ladder) centred at the foot (3 m out) meet at the wall's top —
  `intersection`, exactly ADR 0044's own recipe. The height (4) is that
  intersection's distance from the wall's base, printed and measured by
  `length-matches-its-label`; it is never typed.
- **`pole-shadow.json`.** The sun's ray is the horizontal at the pole's top
  (`perpendicular` to the pole, `foot` of a far ground point onto it),
  rotated −30° (`rotation`) and extended to a `line`; the shadow is where
  that line meets the ground (`intersection`). The shadow's length (6√3 ≈
  10,39 m) is computed, not typed. The angle is marked at the tip of the
  shadow, between the ray and the ground, where a textbook marks the sun's
  elevation, and reads back exactly 30°. (A first draft marked it at the
  pole's top against an invisible horizontal; the maintainer moved it.)
- **`ramp.json`.** A 6-8-10 right triangle (rise, run, ramp), the same
  shape as `right-triangle-altitude.json`, with the ramp's own hypotenuse
  hatched.
- **`angle-of-depression.json`.** The same horizontal-then-rotate-then-
  intersect recipe as the pole's shadow, run from the top of a 20 m
  building at −35°, landing on the ground at the boat. The distance
  (≈28,56) is computed to two decimals, and the angle annotation between
  the horizontal reference and the sight line reads back 35°.

## What was refused

**A `pictograms` array alongside `objects`.** A separate list would have
needed its own reference resolution, its own ordering rules and its own
refusal messages — a second, smaller copy of everything `objects` already
does. A `picto` option on an object already in that list costs none of it:
validation, ordering and "did you mean" all come for free.

**Typing the sun's or the boat's position from the geometry.** The sun icon
and the boat hull are unmeasured decoration exactly where nothing needs
measuring — no check reads "where the sun icon sits," only where the ray
and the shadow it casts fall — so their point can be a free, typed
coordinate like any other free point in this preset. What must never be
typed, and is not, is the ray's angle and the shadow's length.

**A `translate` (point + vector) construction kind.** The angle-of-
depression scene seemed at first to need a way to say "a point level with
the sky, but as far out as the ground already goes." It does not:
`perpendicular` through the eye to the building gives the exact horizontal,
and `foot` of the existing far ground point onto that line gives exactly
the reference point needed, with zero new geometry.

**A separate `observer` picto.** The task that asked for this preset named
`boat`/`observer` together, one eye point and a horizontal reference line.
The point standing in for the observer is the building's own top — already
placed, already labelled if the author wants a name — and the horizontal
reference is an ordinary dashed segment to `EyeRef`, exactly as any other
auxiliary line in this preset is drawn. Adding a distinct glyph for a human
eye at the top of a tower buys a reader nothing a labelled point and a
dashed line do not already say.

## The cost, stated

- **A crowded corner can still leave no good spot for a corner point's own
  name**, exactly as ADR 0044 already records for a crowded interior. The
  fix is the same: the author suppresses the label that isn't the
  pedagogical content, as `ladder-wall.json` does for its two corner
  points.
- **`side` is chosen, not derived.** Nothing in the geometry says which
  side of a wall is "outside"; the author picks, the same freedom ADR 0028
  already grants a length label's own side.
- **A pictogram cannot be inferred from a segment's role.** A vertical
  segment might be a wall, a pole, a building or a person; the author says
  which. Guessing from orientation or length would be exactly the kind of
  heuristic ADR 0035 already refused for telling a title from a caption.
- **`tree` and `person` are implemented and tested but appear in no
  mandated fixture.** Both are exercised directly (`hatchTicks`,
  `ladderGeometry` and every glyph function are exported and unit-tested
  in `tests/construction-pictograms.test.ts`), but the four fixtures this
  ADR ships do not happen to need them.

## Blast radius

`src/presets/construction/preset.ts` only (new pictogram section, a `picto`/
`side` option on point and linear objects, two calls into the existing
drawing loops); `src/presets/construction/PRESET.md`;
`tests/construction-pictograms.test.ts` (new); four new fixtures under
`fixtures/construction/`. `tests/construction.test.ts` and every existing
fixture's output are unchanged — no existing object grew a new required
field, and `picto`/`side` are optional everywhere they appear.
