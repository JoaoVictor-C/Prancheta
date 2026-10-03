# 0035 — What a label hides, and what it claims to name

## Status

Accepted.

## The defect

A reviewer found visible defects in rendered figures whose every check was
green (PLAN-COVERAGE.md, "Visual review, 2026-09-25" and its outcome). Each
passed through one of four gaps, and none was a false pass inside a check's
own logic. Each was a question no check asked.

1. **The paper under a label was never measured.** A label gets an opaque
   fill so its text stays legible over ink. `text-clear-of-ink` then passes
   it, because the glyphs are set on paper. But painter's order draws marks
   first and boxes over them, so the backing erased every line under it:
   - a tick number's backing cut a gap in a hyperbola at its vertex, and in a
     polar rose at the origin;
   - a unit-circle angle label's backing cut gaps in OP and in both axes.
2. **A label that claims nothing was invisible.** `annotation-nearest-its-owner`
   examines only a block with `annotates`, `label-nearest-its-place` only one
   naming a place, and `curve-label-nearest-its-curve` only one with `names`.
   The unit circle's sin value "√3/2" declared none of them, sat beside the
   symmetric point it did not name, and passed.
3. **Presets treated "exempt" as "free room".** Grid furniture (the lattice
   and the axes) is exempt from `text-clear-of-ink` and
   `annotation-nearest-its-owner`. The unit circle's arc label was biased onto
   the x axis for that reason, and its backing then cut the axis. Worse, the
   `Board` label search could not see the axes at all, because the grid is
   expanded after a preset returns. `−π/2` was printed straight across the y
   axis, and nothing reported it.
4. **Contrast ignored the lines under the text.** `contrast-sufficient`
   composited filled boxes and filled marks under a label, and deliberately
   skipped gridlines, because a 1px line does not decide what colour a label
   sits on. So pale grey tick numbers over grey gridlines (#6B7280, 4.7:1 on
   white, 3.4:1 against #D8DCE3) passed on the strength of the paper beside
   them.

## The decision

### `backing-hides-no-ink` (new)

The complement of `text-clear-of-ink`: the text may be clear because it sits
on paper, and this check asks what the paper covers.

- **What it examines.** Every box that owns text and has a non-transparent
  fill.
- **What can be hidden.** Every stroked mark painted before that box.
  Connectors are painted after every box, so a backing never hides one; a
  label on a connector it does not name is `text-clear-of-ink`'s to report.
- **What a backing may cover:**
  - what its label `annotates`. A tangent's value set on its own segment is
    the relief ADR 0019 grants, and a reader reads that line as named there,
    not as broken;
  - a grid **lattice** line. This is the halo ADR 0034 designed, and a tick
    number earns it only where its spot is otherwise clear of ink. The count
    of such crossings is reported in the pass detail, so the allowance is
    visible.
- **What it may not cover:** an axis, a curve, a guide, or any other stroked
  mark, including a curve its label `names`. A reader sees a gap in a line
  they are reading, whatever the checks call that line.

An **axis** is told from the lattice by the stable ids frame resolution
already gives the zero lines, `<frame>-axis-x` and `<frame>-axis-y`
(`isAxis`). They are documented as stable so that `Mark.on` can name them.

### `text-clear-of-ink` reads the axes

The lattice stays exempt, because a faint ruled line under a number is what a
grid is, and every tick sits on its own. **An axis is no longer exempt.** Text
struck through by the heaviest line on the plane is a defect a reader sees.
A backed grid number keeps its pass. Its backing is now
`backing-hides-no-ink`'s to judge, and a backing over an axis fails there.

### The label search sees the axes: `Board.addFrame`

`Board.addFrame(frame)` pushes the frame and traces, as board ink, the zero
lines `expandGrid` will draw (each axis whose range spans zero). The unit
circle uses it, so every searched label steps off both axes. `function-graph`
and `vectors` already traced their axes by hand, and are unchanged. The unit
circle's point-label search also gained a sideways fallback, because for a
point **on** an axis (π/2, −π/2, π) every earlier direction ran along that
axis.

### `label-declares-what-it-names` (new) and `Block.freeStanding`

- **Which blocks it examines.** A **bare label**: a box that owns text, draws
  no stroke and no border, and is filled with nothing or with the paper
  itself. That is what a reader takes for a label about something else,
  rather than a node, a bar or a cell that is itself the thing.
- **When it fails.** When a bare label declares none of `annotates`,
  `annotatesPlace` or `names`, and is not marked `freeStanding: true`.
- **What `freeStanding` means.** It is the new explicit field for a title, a
  caption, a legend entry, an axis name or a table cell. It buys no relief
  from any check. `parseSpec` accepts only `true`, and refuses it beside a
  claim: a label that names something is not free-standing.
- **What is exempt.** Grid furniture (`gridOf` tick numbers) belongs to its
  frame, and is not asked.

Unclaimed is therefore no longer the silent default. It is a visible choice,
in the spec and in the check's own count ("… (n free-standing)").

### Two refinements the new claims needed

**A marker at a place is the place.** In `label-nearest-its-place`, a closed
mark that contains the place and is no larger than 24px (a dot or a small
ring) now counts as "passing through" the place, exactly as the lines that
cross there already did. ADR 0031 had to refuse `annotatesPlace` for a point's
own label for this reason: the dot's outline is always nearer the label than
the dot's centre is. A shaded region that merely contains the place still
competes. With this change, point labels (unit circle, function-graph) name
their points and are measured.

**A label is not what a label names, in either proximity check.**
ADR 0028 already kept other labels out of `label-nearest-its-place`. This
change keeps them out of `annotation-nearest-its-owner` too. A box counts as
a label once it makes a claim of its own (`annotates`, `names` or
`freeStanding`), unless some annotation names it.

- **This relaxes an existing check, stated here as required.** Before, a
  label could fail `annotation-nearest-its-owner` for sitting near another
  **label**. Now it can fail only against something drawn. The case that
  forced it: `annotated-cell` gives each callout `annotates` naming its
  leader. Measured centre to centre, two 170px-wide callouts stacked on one
  side read as each other's nearest neighbour while each sits at the end of
  its own leader.
- **One test changed with it.** `tests/length-and-place-labels.test.ts` had
  asserted that a legend named by swatch **elements** fails on the
  neighbouring row's text. It now passes, and the test also asserts that a
  row slid beside the wrong swatch still fails.
- **Places are still the right claim for a legend.** They measure from the
  near edge, not the centre.

### `contrast-sufficient` reads the lines under the text

Every stroked line that visibly crosses the text's em box counts as a surface
the glyphs are read against:

- **which lines:** lattice, axis, curve or connector alike, because a glyph
  does not care what the line under it is called;
- **what colour:** the line's stroke, composited over the covered surface.

A mark is not counted when an opaque box painted after it covers the whole em
box. A label's own backing hides the lattice it interrupts, and then the
paper is what the glyphs sit on. A connector is always counted. The em box
is each line box trimmed vertically to the font size, so a line through the
leading above the glyphs is under no glyph. The worst surface wins, as
before, and a failure names the line.

## Producers of unclaimed labels, and what each now says

Every producer the fixture sweep found:

| producer | labels | now |
| --- | --- | --- |
| `unit-circle` | point labels | `annotatesPlace` the point |
| `unit-circle` | axis names, quadrant letters | `freeStanding` (quadrant letters also placed last) |
| `function-graph` | point labels | `annotatesPlace` the point |
| `function-graph` | legend rows | `annotatesPlace` the swatch's end (ADR 0028) |
| `function-graph` | free labels without `names` | `annotatesPlace` their anchor |
| `function-graph` | axis names | `freeStanding` |
| `number-line` | critical numbers | `annotates` their tick mark (now given ids `tick-<n>`) |
| `number-line` | row headings, axis variable | `freeStanding` |
| `sign-chart`, `value-table` | every cell and header | `freeStanding`, stated per label: a cell is read by row and column |
| `vectors` | the readings caption | `freeStanding` |
| `chart` | bar value labels (grouped) | `annotates` their bar |
| `chart` | category names, stacked totals, legend entries, the series chart's axis numbers | `freeStanding` |
| `annotated-figure` | callouts | `annotates` their own leader |
| `fixtures/ir/allow-overlap.json` | "A", "B", "C" | `annotates` their set |
| `fixtures/ir/calc1-s5-5-chain.json` | each derivative | `annotates` its arrow |
| `fixtures/ir/calc1-s5-5-chain.json` | the two caption lines | `freeStanding` |
| `fixtures/ir/bad-contrast.json` | its planted grey box (fill equals the grey canvas) | `freeStanding` |

## What was refused

- **Inferring which labels are titles or captions.** Font size, position and
  role all look like heuristics until the first figure they misread, and
  then the check is guessing. The author says it with `freeStanding`.
- **Letting a backing cover the axis a tick numbers.** No tick sits on its
  axis. The number is beside it, and the origin "0" is in its corner.
  Allowing it would have reopened exactly the unit-circle defect.
- **Letting any label's backing cut lattice lines but not tick numbers', or
  the reverse.** The lattice is faint for everyone. A per-role rule would have
  had to decide what a "tick" is by id pattern, which
  `tick-labels-do-not-collide` already shows is fragile.
- **Treating only gridlines as strokes for contrast.** A curve under a label
  is already `text-clear-of-ink`'s failure, and counting it here as well
  costs nothing and misses nothing. So contrast counts every line.
- **Annotating an axis by name** (an axis name `annotates` `plane-axis-x`).
  The axis is expanded after `parseSpec` validates `annotates`, so the id
  does not exist yet. `annotation-nearest-its-owner` also skips grid
  furniture as an owner. Axis names are `freeStanding` instead.

## The cost, stated

- **`freeStanding` is trusted.** A label marked free-standing is checked by
  no proximity rule. A misplaced "√3/2" marked `freeStanding` would pass
  again, but only by saying so in the spec.
- **Tables are free-standing wholesale.** `sign-chart` and `value-table` mark
  every cell, because none of the proximity checks models "read by row and
  column". A cell in the wrong column is not caught here.
- **Bar-chart category names and stacked totals are free-standing.** They sit
  in a flex layout that cannot drift, but a wrong one would not be caught.
- **A label near another label can pass `annotation-nearest-its-owner`
  again.** See the relaxation above. Before, a label near a claiming label
  could fail; now it cannot. The open "ties" item in PLAN-COVERAGE.md (a
  label almost as near another element as its owner) is unchanged. The
  quadrant-tour case that motivated it is resolved by placement: quadrant
  letters are placed last.
- **What "bare" misses.**
  - A box whose fill is a colour `parseColour` cannot read (a CSS name such
    as `white`) is never taken for paper, so a white-filled label on a white
    canvas named that way is not asked.
  - A label drawn with a visible border counts as a shape, not a label.
- **The axis rule rests on ids.**
  - An axis drawn as an ordinary mark (number-line's reference line) is
    ordinary ink, and already fully checked.
  - An axis drawn by some other means with a different id is lattice to
    these checks.
- **Backings are tested against the box, not the glyph shapes.** A backing's
  corner that clips a curve by a pixel fails. That is what a reader sees, and
  it is also the strictest reading.

## Blast radius

Every fixture under `fixtures/` was rendered before and after (109 files).
The check RESULTS that changed:

- **Real defects, fixed in the preset:**
  - `unit-circle/arc-projection-tangent-together`: "−π/2" was printed across
    the y axis (`text-clear-of-ink` and `contrast-sufficient`, 2.71:1 against
    the axis). Fixed by `Board.addFrame` and the sideways fallback.
  - `unit-circle/quadrant-tour-degrees`: once point labels named their
    points, "π/4" and "3π/4" sat 46px and 43px from their points, farther
    than their own size. The letters "I" and "II" had taken the spots beside
    the dots. Fixed by placing quadrant letters last, with an inward search
    fallback.
- **Newly failing only because a label claimed nothing** (47 fixtures). Every
  one of them was a producer in the table above, and all were fixed at the
  source, not in the check.
- **New checks now reported on every fixture.** `backing-hides-no-ink` and
  `label-declares-what-it-names` report pass or not-applicable wherever they
  did not fail.

- **Checks that now examine what they used to skip.** The new claims moved
  `annotation-nearest-its-owner` from not-applicable to pass in 7 fixtures,
  and `label-nearest-its-place` in 17.
- **`length-matches-its-label` now reports per run.** It gives a per-run
  not-applicable for the newly annotated runs whose label reads as a number:
  number-line tick marks ("2" names a tick, not a length) and the chain
  diagram's arrows. This is ADR 0028's rule working as written: an unscaled
  run is reported, never passed.

No other fixture's result changed. The failures present before this change
(the planted defects: `bad-contrast`, `constraint-violation`,
`label-overflows-shape`, `shape-vocabulary`, `rotated-tick-labels`,
`new-features-smoke`, `animate/delegated-after`) are identical after it.
