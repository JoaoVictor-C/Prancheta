# 0032 — Vectors are given three ways in, and everything else is derived

## Status

Accepted.

## The need

Geometria Analítica and Física 1 exercises are built from vectors in R²
stated three different ways — as components (`u = (3, 1)`), as a
displacement between two labelled points (`AB`, from A to B), or as a
magnitude and a bearing (`|F| = 5 N` at `37°`) — and then asked to combine:
find the resultant, the difference, a scalar multiple, the projection of one
onto another, the angle between two, or the x/y components a vector
decomposes into.

Every one of those combinations is arithmetic a reader would otherwise do by
hand and a figure would otherwise state twice: once as drawn geometry, once
as a printed number, with nothing tying them together. That is the exact
defect ADR 0019 names for the incline figure — "the number 30 appeared
twice... nothing connected them" — reappearing one level up, in vector
algebra instead of trigonometry. A resultant drawn by eye beside a
hand-typed "R = (5, 5)" can disagree with its own arrow, the same way a
30° slope could disagree with its own label before frames existed.

## The decision

**Three typed shapes, and nothing else is typed.** `components`, `from`/`to`
(over named `points`), and `magnitude`/`angle` are the only ways a vector
enters this preset with a coordinate an author chose. `sum`, `difference`,
`scale`, `decompose`, `projection` and `angleBetween` all name vectors
already declared and compute their result — a sum's arrowhead lands where
component addition puts it, a projection's foot is the actual perpendicular,
an angle arc's sweep is the angle its own arms make. None of them accepts a
number the author computed elsewhere; that is the whole point, and it is
enforced structurally by the input shape rather than by a check that could
be satisfied by a lucky guess.

**Every vector is drawn on one gridded `Frame`, and the frame is the only
place a coordinate is chosen.** The plane's range is derived from every point
the figure touches — every tail, every head, every construction guide's
corner, the projection's foot — never stated by the author. Reusing `Frame`
(ADR 0019) rather than inventing a second coordinate system means the
lattice, the axes and their numbers are the frame's own derived geometry,
and every vector's endpoint is stated **in that frame**
(`{"frame": "plane", x, y}`) rather than pre-resolved to a canvas pixel here.

That last choice is what lets this preset use ADR 0028's
`length-matches-its-label` for free. Because both ends of every arrow share
one frame, resolution records `Connector.measuredIn` for each of them, and a
plain-decimal magnitude label placed beside the arrow (`annotates` naming
it, separate from the exact-root form the caption panel prints) is checked
against the arrow's own length in frame units — not by anything this preset
wrote, but by a check built for a different figure entirely, because the
geometry was stated the way that check expects.

**Derived operations work on components, not on where a vector is drawn.**
`sum`, `difference`, `scale`, `projection` and `angleBetween` all read a
named vector's `(dx, dy)` — its free-vector reading — never its tail. A
derived result is always drawn from the origin, regardless of whether its
operands were `from`/`to` vectors drawn elsewhere. This is the standard
convention (two vectors are equal, and combine, if they have the same
components, wherever they are drawn), and it is also what keeps the
arithmetic total: a `from`/`to` vector always has a well-defined `(dx, dy)`
to feed forward, with no second, ambiguous notion of "where do the two
operands' tails have to agree" to adjudicate.

**A caption panel prints what a reader would write by hand.** One line per
named or computed vector — `u = (3; 1), |u| = √10`, `s = u + v = (4; 5),
|s| = √41`, `ângulo(u, v) = 90°` — using the exact-root snapping
`sign-chart` established for irrational roots (ADR 0023, ADR 0027), so a
magnitude whose square is an integer prints `√10`, not `3,162`. A root is
simplified the Brazilian way, the square factor taken out (`√20` is `2√5`,
`√52` is `2√13`), and a rational radicand is rationalised (`|proj_v(u)|` for
u = (2, 4), v = (5, 1) is `7√26/13`). A derivation is printed only when it
says something the name does not: a sum named `u+v` reads `u+v = (5; 4)`,
not `u+v = u + v = (5; 4)`, and `AB` reads `AB = (0; 8)`.

**A number printed on the drawing is exact or rounded to hundredths** —
`8`, `2,5`, `6,40`, `57,53°`. Both checks that read those labels forgive far
more (`length-matches-its-label` half the last printed digit,
`sweep-matches-its-label` a whole degree), so the rounding can never be what
fails them, and three decimals (`57,529°`) claimed a precision no reader
measures off a figure. The caption says `≈` when the drawn value is rounded:
`ângulo(u, v) ≈ 57,53°`.

**Every label is anchored to its own ink.** All arrows, guides and marks are
drawn first; only then is any label placed, and each one only at candidate
spots beside its OWN shaft (fractions along it, either side, a few offsets
out) — never wherever there happens to be room. A spot is taken only if it
is clear of every line and label, nearer its own ink (from its centre, as
`annotation-nearest-its-owner` measures) than any other ink or label, and
not nearer an already-placed label than that label is to its owner.
Shortest arrows choose first, names before magnitudes. When no spot is
honest the label keeps its least-bad spot on its own shaft and the checks
report it: the old stepped search (`Board.place`, up to 150px from its
anchor) is what put `6,403` beside v and `u` under the x axis. An angle
arc's radius is chosen with its label — starting at 30% of the shorter arm
and growing until some spot inside the angle is nearer the arc than either
arm — because a third vector through the angle (a parallelogram's diagonal)
leaves only narrow wedges beside it. The grid numbers its ticks in the
figure's locale (ADR 0034).

## What was refused

**A fourth typed shape for "a vector at an arbitrary tail with arbitrary
components."** `components` already takes an optional `at`; a fifth field
combining `at` and a separate "direction" would restate what `components`
already expresses relative to that tail.

**Checking a derived vector's arithmetic with a dedicated check**, the same
refusal `sign-chart`'s ADR makes for the table matching the graph. A sum's
components and a difference's components are both computed by the same
function from the same inputs; a check comparing the drawn arrow to the
value that produced it would compare the code with itself. The tests pin
the arithmetic directly (`magnitudeLabel`, `angleBetweenDegrees`,
`projectComponents`, and one reading per derivation read back off the built
figure), the same discipline `criticalPoints`/`exactLabel` are held to.

**Unit conversion, or asserting a physical unit at all.** `Frame.unit`
exists (ADR 0028) and this preset's frame declares none: these are abstract
R² vectors, not forces or velocities with a named unit, and inventing one
(`"N"`, always) would assert something the input never said.

**Registering the preset.** Done after the preset was built, beside the
other presets: `PresetId`, `presets/index.ts`, and the selection rules
`S-vector-favours-vectors` and `S-vector-disqualifies-graph`.

## The cost, stated

**An angle or a projection between two vectors ignores where either is
drawn.** `angleBetween` always draws its arc at the origin; two `from`/`to`
vectors nowhere near the origin still get an angle mark there, which reads
correctly (the number is right) but not where a reader's eye is. A figure
that needs the arc at the vectors' own shared vertex has to draw that
vertex at the origin itself.

**No physical unit is asserted, so `length-matches-its-label` checks a
number against a frame of unnamed units.** A label that adds `"N"` or
`"m/s"` by hand would not be read as the same unit as the frame's (unset),
and the check would report "not comparable" rather than pass or fail on the
number — a correctness question this preset defers entirely.

**The plane's layout is a candidate search, not a solver.** Each label tries
a fixed set of spots beside its own shaft and takes the first honest one.
For several vectors sharing a tail and pointing in similar directions there
may be none; the label then stays on its own shaft at its least-bad spot and
the figure fails `annotation-nearest-its-owner` or `text-clear-of-ink`
rather than shipping a label beside the wrong arrow. A projection lies on
the vector it projects onto, so its name is exactly as near both — a tie the
check accepts and only the colour settles. A long default name
(`proj_v(u)`) on a short projection can take the tick row beneath it; the
grid then moves that tick number down its own gridline (ADR 0034). The
exercised cases are the fixtures `parallelogram-angle`,
`projection-decomposition` and `physics-forces`.
