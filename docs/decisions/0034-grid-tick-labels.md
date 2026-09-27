# 0034 — A grid's numbers speak the figure's locale, and stay off its ink

## Status

Accepted.

## The defect

A reviewer looked at two `vectors` renders whose arithmetic was right and
whose checks were mostly green, and could not read the numbers on the axes:

- **English numbers in a pt-BR figure.** `expandGrid` printed its ticks with
  `String(...)`: "2.5", ASCII "-5". Every other number in the figure went
  through the project's one formatter (ADR 0023) and read "2,5", "−5".
- **Grey on grey.** `#6B7280` clears WCAG AA against paper (4.7:1), so
  `contrast-sufficient` passed it. That check scores text against the
  *surface* under it, and a gridline is deliberately not a surface (a 1px line
  does not decide legibility; `checks.ts`, `surfacesUnder`). So the one
  complaint the reviewer made -- a pale number printed across the grey line it
  numbers -- is exactly what no check can see.
- **Numbers on lines.** Each axis printed its own "0", so the x axis's zero
  sat on the y axis and the y axis's zero on the x axis. And a number went
  where it always goes whatever was drawn there: in the projection figure the
  origin "0" sat on a dashed decomposition guide running along the x axis
  (`text-clear-of-ink [plane-tick-y-0--label]` failed), and a vector drawn
  along x = −6 would run straight through "−6".

## The decision

**The grid learns its locale from a field, and the field defaults to the old
behaviour.** `GridSpec.locale`, declared in `ir/types.ts` beside the
grid's other options. Unset, a tick prints exactly as before -- `String`,
"2.5", "-5" -- so no figure that never asked for a locale changes its
numbers. Set, every tick goes through `formatNumber`. Considered and refused:
reading the locale from the canvas (there is no figure-wide locale in the IR,
and inventing one to serve one consumer is a larger change than this), and
making pt-BR the default (it would silently rewrite every existing grid
figure's numbers). The `vectors` preset sets it from its own `locale`.

**Tick numbers are darker than their lattice: `#4B5563`, 7.3:1 on paper.**
This is a default, not a check: the check cannot see the complaint (above),
so the fix has to be in what is drawn.

**On a solid paper, a number is backed by it.** When the canvas background is
a hex colour, a tick block whose spot is clear of the scene's ink is filled
with it, interrupting the gridline under the number -- function-graph's axis
numbers already do this. It is withheld when the spot is NOT clear: a paper
backing earns `text-clear-of-ink`'s "backed grid number" pass, and connectors
paint over boxes, so a backing there would hide a real collision from the
check without hiding it from the reader.

**Zero is printed once, in the corner of the origin**, when both axes span
zero and both would number it. A plane numbered along its low edge has two
different zeros and keeps both.

**A number steps off ink, and only as far as it stays its tick's number.**
The grid is now expanded after the scene's own connectors, marks and
labelled blocks are resolved, so it knows where their ink is (`obstaclesOf`).
Each tick has an ordered list of spots (`tickPlan`, exported so a preset can
keep its labels off the first-choice spots instead of re-deriving them):

1. where it has always gone;
2. the other side of the axis;
3. further along its own gridline, away from the axis, while its box starts
   within half a division (on its own gridline it cannot be read as another
   value);
4. off its gridline to either side, while nearer its own tick than the next.

If none is clear it keeps the first spot, unbacked, and the checks report it.
Ink is tested against the whole box; other labels only against the estimated
text, because that is what `text-clear-of-other-boxes` measures and a number
should not move for a neighbour its glyphs do not touch.

## The cost, stated

**Obstacles are what can be located before layout.** A connector that ends on
a block id has no route yet, and a curve other than a `sweep` is not
modelled; a tick can still land on those, and `text-clear-of-ink` says so.

**Text widths are estimated per glyph** (a digit 6.2px at 11px, the minus 6.8,
a comma 2.8). A font much wider than that could overflow the box --
`text-fits-box` would report it -- and a much narrower one only costs a
slightly wider backing.

**A moved number can read as a different value.** Step 4 keeps a number
nearer its own tick than the next, but a number shifted sideways beside a
point of interest (a projection's foot at x = 2,69) can still suggest it
labels that point. Step 3 is ordered first for this reason.

**Blast radius.** Of the fixtures with a numbered grid, `transformation-grid`
changed in drawing only (colour, one origin zero, backings); its check results
are identical apart from the zero's id. `vectors/physics-forces` changed with
the preset. Presets that turn grid labels off (`function-graph`,
`unit-circle`) are unaffected.
