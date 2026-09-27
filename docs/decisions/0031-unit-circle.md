# 0031 — The unit circle is computed from the angle, never placed by hand

## Status

Accepted.

## The need

Before a Brazilian Cálculo 1 student meets a trig derivative, they meet the
*ciclo trigonométrico*: a circle of radius 1, an angle marked on it, and the
question "what are cos θ and sin θ here?" — often followed by "and at π − θ?
At π + θ? At 2π − θ?" and "where does the tangent line say tan θ is?" It is
the single most-drawn figure in that part of the course, and it is exactly
the shape of figure this project exists to get right: a point on a circle at
`(cos θ, sin θ)` is a number appearing in two places — once as the angle a
student is given, once as wherever a hand-placed dot happens to sit — unless
one is derived from the other.

## The decision

**`unit-circle` takes the angle as text and derives everything else.** An
angle is written the way a Brazilian textbook writes it — `"π/6"`, `"5π/4"`,
`"150°"`, `"-π/3"` — parsed once into radians, and from that radian value:

- **the point** is `(cx + R·cos θ, cy − R·sin θ)` in canvas space — never a
  pair of coordinates an author computed on a calculator and typed in;
- **the angle arc**, when asked for, is a `curve: {kind: "sweep"}` connector
  whose two arms are placed at that same θ, so its sweep is geometrically
  the angle by construction (ADR 0019) — the one thing that can still
  disagree is its own printed degree number, typed as a separate label, and
  that is exactly what `sweep-matches-its-label` exists to catch;
- **cos θ and sin θ**, when `projection` is asked for, are the literal
  `Math.cos`/`Math.sin` of the same θ, printed through the exact-value
  snapper below or the pt-BR formatter — never a value copied from a table;
- **tan θ**, when `tangent` is asked for, is `Math.sin(θ) / Math.cos(θ)`,
  and the segment's endpoint on the line x = 1 is placed at that value —
  the printed number and the segment's height are the same float;
- **the symmetric angles** (π − θ, π + θ, 2π − θ) are each their own point,
  computed from their own radian value by the same `cos`/`sin` call the
  primary angle uses — not a manual reflection across an axis. Reflecting
  by hand would need to get the right axis for the right identity; computing
  the derived angle and calling `cos`/`sin` on it needs no identity at all,
  which is the point of "derive, do not verify" taken to its logical end.

**Exact values are snapped the way `sign-chart` snaps roots (ADR 0027).**
`cos(π/3)` is `0.4999999999999999...` as a float; printed through the
ordinary formatter that is `0,5` — arithmetically correct and pedagogically
wrong, because the exercise the figure serves asks for `1/2`, not a decimal
that happens to be close to it. A five-entry table of notable magnitudes
(`0`, `1/2`, `√2/2`, `√3/2`, `1`) and their negatives is checked before
falling back to the pt-BR/en formatter, exactly mirroring `exactLabel` in
`sign-chart/preset.ts`.

**The arc's own label is deliberately locale-blind.** Every other number in
this figure goes through `locale/format.ts` like the rest of the project. The
arc's degree label does not, and that is not an oversight: `checks.ts`'s
`statedDegrees` — the function `sweep-matches-its-label` uses to read a
label back — matches `/^\s*([+-]?\d+(?:\.\d+)?)\s*(?:°|deg|degrees)?\s*$/`,
which is ASCII digits and a literal `.`, never the pt-BR comma. A degree
label printed `"26,57°"` would silently fail that regex, `statedDegrees`
would return `null`, and the check would report "not applicable" — passing
not because the arc is right but because the comparison never ran. Printing
whole degrees in plain digits keeps the guard live for every locale. This
preset's own contribution is confined to `radius` and the arc's ASCII
degrees; it changes nothing in `checks.ts`.

## What was refused

**Reflex-angle arcs.** A `curve: {kind: "sweep"}` connector is defined by two
endpoints and a centre, and `sweptDegrees` — the function both the geometry
and the check that guards it are built on — always measures the *shorter*
arc between two arms, clamped to 0..180° (`layout/connectors.ts`). There is
no way to ask it for the reflex angle on the other side. Rather than draw a
135° arc next to a `"225°"` label and rely on nobody comparing them,
`arc: true` is refused outright for |θ| ≥ 180°, with the reason named in the
refusal. The point itself is drawn regardless — `"5π/4"` as a bare angle,
without `arc`, works exactly as `"π/6"` does.

**Unbounded tangent segments.** tan θ diverges at θ = π/2, and even well
short of it a segment fifteen circle-radii tall stops being a figure a
sight-reader learns from. `tangent` is refused past `|tan θ| > 2` (covers
every angle in the 30°/45°/60°/120°/135°/150° family with room to spare) and
outright where cos θ = 0. This is the same shape of refusal `sign-chart`
makes for a search window that cannot see a root: a bound is stated, and a
figure past it is refused rather than quietly drawn wrong.

**Arcs, projections and tangents on symmetric points.** A symmetric point
carries a position and a label; asking it for its own arc or tangent would
either duplicate the primary angle's or need its own reference axis, and
neither was needed by any exercise this preset was built against. Declared
as a cost rather than built speculatively.

**A general "reference angle" or "quadrant" computation surfaced as a
labelled value.** The point already sits in the quadrant it sits in, and
`quadrantLabels` prints I–IV where a reader expects them; a redundant
`"quadrant: II"` string on each point would be one more thing that could
disagree with where the dot actually is, for a fact the figure already
shows geometrically.

**`Block.annotatesPlace` for a point's own label (ADR 0028), tried and
backed out.** A point label naming the exact `(cos θ, sin θ)` it sits beside
looks, at first, like the textbook case `annotatesPlace` was built for. It
is not: `label-nearest-its-place` lets everything that visibly *makes* the
place — the lines crossing there — sit arbitrarily close, but nothing marks
the little filled dot this preset draws at every point as one of those
lines, so the dot would compete as an ordinary nearby mark against its own
point's label. The two are co-located by construction (the dot's centre
*is* the place), so the case is not "here is a real rival," it is "measure
noise decides whether a correct figure fails." Adding it would have meant
either dropping the dot (losing the mark a reader actually reads the point
off) or accepting a check that could fail a figure with nothing wrong in
it — see the same call made below for the tangent's endpoint dot, which
*was* dropped for exactly this reason once a label needed to sit next to it.

**`length-matches-its-label` (ADR 0028) for the tangent segment, kept.** The
tangent's printed `"tg θ = …"` is a number typed on a label beside a drawn
segment — the exact gap ADR 0028 closes. The segment is stated at both ends
in a second frame (`"radius"`, scaled to the circle's own R, no rotation)
built solely so resolution records its `MeasuredIn` scale; nothing else in
the figure needed a second frame. Because the check's tolerance is generous
enough to survive it, and because a second visible mark exactly at the
segment's own endpoint would create the identical "measure noise" problem
`annotatesPlace` was refused for, the tangent's own endpoint dot was
dropped rather than kept and exempted.

## The cost, stated

- **Only the shorter arc can be drawn**, so a reflex angle is markable as a
  point but not as an arc (above).
- **The tangent segment is capped**, so angles near 90°/270° cannot show it.
- **The tangent's own endpoint carries no dot**, unlike every circle point —
  dropped once it needed a label beside it, for the reason given above.
  The segment's drawn end is the mark; nothing sits on top of it.
- **A symmetric point is decoration, not a full citizen** — no arc,
  projection or tangent of its own; request those on a separate primary
  angle entry that happens to equal the same value if a figure needs both.
- **The exact-value table is five entries.** An angle whose cosine or sine
  is some other algebraic number (rare in a Cálculo 1 exercise, common
  nowhere this preset was built for) falls through to the plain formatter
  with no attempt at a closed form, unlike `sign-chart`'s general
  fraction/√n search — the unit circle's vocabulary of "nice" angles is
  small and fixed, so a fixed table was the honest match rather than
  building the general search a second time for five numbers.

## Addendum, 2026-09-25 — drawing defects a human reviewer found

Every number in the first render was correct; the DRAWING was wrong, all in
`preset.ts`, none in `checks.ts`. Recorded here because they are about what
this preset draws, which is this ADR's subject; the arithmetic this ADR
already committed to (the point, the exact-value table, tan θ) did not
change. Four defects were found in the first pass; a fifth (point 5 below)
was found immediately after, in this addendum's own first-draft renders.

**1. The angle arc had no terminal side.** The arc's sweep was drawn, but
nothing connected its outer end to the point P it swept toward — no radius
OP, so a reader saw a short curve hanging near the origin with no visible
relationship to the dot on the circle. Fixed by drawing OP itself (a plain
straight `Board.poly` run from the origin to P) whenever a primary angle
asks for `arc` or `tangent`. The arc's own "to" endpoint sits exactly on
this line by construction (both are at radius r·(cos θ, −sin θ) for their
own r), so the two cannot visually disagree.

**Why OP is scoped to `arc || tangent`, not drawn for every primary angle
unconditionally (the first cut of this fix, and the more literal reading of
"draw the radius for each primary angle").** A `projection`-only point has
no arc and no tangent for OP to connect to, and drawing it there collides
with a fact ADR 0028 introduced but this preset had not yet stressed: two
angles that are symmetric about the y axis (30°/150°, 45°/135°, ...) share
one sin value, and their sin labels are placed on the axis side OPPOSITE
their own point — deliberately, continuing the direction each one's own
horizontal guide already travels. That opposite side is exactly where the
OTHER point's OP would run. `fixtures/unit-circle/quadrant-tour-degrees.json`
(45°, 135°, −60°, all `projection`, no arc or tangent) is exactly this case:
drawing OP unconditionally made both `text-clear-of-ink` and (once the
placement search was tuned to dodge that ink) `label-nearest-its-place` fail
for the two symmetric points' sin labels, because the one spot that cleared
the new ink was demonstrably closer to the OTHER point's OP than to their
own axis foot — not a search that needed more room, but two obligations
(off this ink; beside this place) that could not both be met near a symmetric
pair. Scoping OP to angles that actually have something for it to connect
to removes the conflict rather than fighting it with a wider search.

**2. The tangent segment read as disconnected from the angle.** The segment
on x = 1 was correct (its height IS tan θ, per `length-matches-its-label`),
but nothing showed *why*: the classical construction extends the radius OP
past the circle until it meets the tangent axis, and that extension was
missing. Fixed by drawing a dashed run from P to `(1, tan θ)` whenever
`tangent` is on — the same ray OP is already on, continued (for cos θ > 0)
past P, or (for cos θ < 0, an obtuse angle) back through O and out the other
side, which is an honest picture of "the same line, continued" even though
it doubles part of OP under a dashed overlay.

**3. The projection labels named nothing, so nothing checked them.** cos θ
and sin θ, printed at the foot of each projection, carried no `annotates`
and no `annotatesPlace` — they were free-floating text with no claim
attached. `render fixtures/unit-circle/symmetric-and-projection.json` (π/3,
`projection` and `symmetric` both on) showed the sin label "√3/2" sitting
next to the symmetric point 2π/3's dot and label instead of at its own foot
on the y axis, and every check passed regardless. This is precisely why:
`annotation-nearest-its-owner` only ever examines a block whose `.annotates`
is set, and `label-nearest-its-place` only ever examines a block whose
`.annotates` names a place mark (ADR 0028). A label that declares neither is
invisible to both — not a false pass from either check's own logic, but a
figure that never made the claim those checks exist to hold it to. Fixed by
giving each label `Block.annotatesPlace` naming the true foot of its own
projection (`{x: pt.x, y: cy}` for cos, `{x: cx, y: pt.y}` for sin), the
same mechanism `vectors` uses for a named point. `label-nearest-its-place`
now holds it to sitting within its own size of that foot.

**4. The point label could land on top of the tangent's own value label.**
Reproduced by `{ "angle": "π/4", "arc": true, "projection": true, "tangent":
true }` with `quadrantLabels: true`: the point label ("π/4") ended up beside
"tg θ = 1" instead of beside the dot, failing `annotation-nearest-its-owner`
(the tangent label was, correctly, nearest its own mark — but the point
label had drifted into the same small patch of open canvas). Two causes,
both about `Board.place`'s authoring-time search, not the geometry itself:

- The point label's first escape direction is radial (straight out from the
  origin through the point) — which, once `tangent` is on, is also the ray
  OP, its dashed extension, and the tangent segment all occupy. With every
  near step blocked by ink the search was NOT exempt from (unlike the label
  naming that ink), it kept walking outward until the only clear ground was
  past the whole construction, right beside the tangent's own label. Fixed
  by trying the two directions TANGENTIAL to the circle at P first when
  `tangent` is on, before falling back to the near-radial escapes — sideways
  along the circle, away from the wedge the tangent construction occupies.
- The arc's own label had the opposite problem in the same figure: it is
  *supposed* to sit on its own arc (`annotates` buys that overlap, ADR
  0019), but the plain ink-avoidance search does not know about that
  exemption, so once OP existed nearby it walked the label away from BOTH,
  landing nearer OP than its own arc. The first fix here used
  `avoidInk: false` on that one placement, reasoning that since `annotates`
  already forgives whatever ink is under the label, the authoring-time
  search has no reason to dodge ink at all — **and that reasoning proved
  too broad.** `avoidInk: false` forgives ALL ink, not only the label's own
  arc, so the label could (and, once OP existed, did) land squarely ON OP:
  a straight line has no curvature to visually separate "crossing it" from
  "sitting beside it" the way an arc's curve does. Its paper backing then
  cut a false gap into OP — text on a line, the exact defect this whole
  round of fixes exists to remove. See point 5 below for the real fix.
- Quadrant letters ("I", "II", ...) were plain `board.label` calls with no
  search and no ink-avoidance, drawn *before* any point's ink existed. A
  primary angle at exactly 45°/135°/225°/315° — a common case, not a corner
  one — put its dashed tangent extension directly through the fixed spot
  "I" or another quadrant letter already claimed, and nothing there could
  move to avoid it. Fixed by moving quadrant-letter placement to after all
  points' ink is drawn, and switching to a small searching `board.place`
  biased outward from the circle.

**5. `avoidInk: false` let the arc's degree label sit ON OP, cutting a false gap in it.** Visible in this addendum's own first-draft renders: "60°" drawn across OP in a 60° figure, and "45°" with a paper backing that sliced a white notch out of OP just before the glyph. The fix above for point 4's arc-label case forgave too much. The real fix places the label analytically, not by search, at a spot inside the wedge (between the x axis and OP) that is geometrically guaranteed clear of OP, with no ink-forgiving needed:

- The label sits at radius `labelR` and angular position `f · θ` (measured from the x axis, so `f = 0` hugs the axis and `f = 0.5` is the bisector). Because its angular position stays within the arc's own span `[0, θ]`, the nearest point on the arc is always directly below it at that same angle — distance `labelR − arcR` — which is why the bisector (equidistant from both arms) was never required: only the x-axis side matters, since the x axis is grid furniture (`gridOf`), exempt from both `text-clear-of-ink` and `annotation-nearest-its-owner` in the first place.
- Two conditions have to hold at the same time: physical clearance from OP (`labelR · sin(clearAngle) ≥ M`, `clearAngle = (1−f)θ` the angular gap from the label to OP, `M` the label's own half-diagonal with a slack factor) and staying nearer the arc than OP (`labelR − arcR < labelR · sin(clearAngle)`). Solving both for the smallest workable arc radius gives `arcR > M · (1/sin θ − 1)` — which is exactly why a narrow angle's arc is now drawn at a bigger radius than `ARC_BASE` when its own label needs the room (`minArcRadiusForLabel`, `arcRadii` precompute in `preset.ts`): a 15° wedge is proportionally narrow at any fixed radius, so the only way to fit the label inside it at all is to draw the arc itself further out.
- **The previous "just outside the arc's end" fallback (recorded above under point 4) was not merely insufficiently tuned — it was proven unable to work at all**, and is gone now rather than kept as a narrower-case branch. The arc's own far endpoint sits, by construction, exactly ON the ray OP is drawn along (both are `(r·cos θ, −r·sin θ)` for their own `r`). The shortest distance from any point to a *line* can never exceed its distance to one particular point already ON that line — so a spot beyond the arc's tip, past OP, is *never* nearer that endpoint than it is to OP itself, regardless of how the offset is tuned. Only a spot within the arc's own angular span has a nearest-arc-point that is not sitting on OP, which is the only way to win the comparison honestly. `arcLabelSpot` in `preset.ts` carries the full derivation and falls back to `f = 0` (hugging the x axis, the most generous position any arc radius can offer) as a best effort past `minArcRadiusForLabel`'s own cap, rather than reaching for the disproven approach again.
- Verified across a narrow (15°), moderate (45°, 60°) and obtuse (150°) angle, plus the original π/4 reproduction with `projection` and `tangent` both on; a regression test (`tests/unit-circle.test.ts`) checks the label's box against the OP segment directly (Liang-Barsky rect/segment intersection) for all three regimes.

**6. This preset's arc-degree formatting text was stale.** `checks.ts`'s
`statedDegrees` (the reader `sweep-matches-its-label` uses) was fixed
2026-09-25 to accept a pt-BR comma decimal and the typographic minus, so
the "deliberately locale-blind" framing above — written when the ASCII-only
regex was a hard technical constraint — describes a constraint that no
longer exists. It is left in place above as the historical record of why
the choice was made; the choice itself (whole degrees, plain digits) is
unchanged, because this preset never prints a fractional degree and so the
two formatters produce identical output here regardless. Nothing in
`preset.ts` changed for this point.

**7. Point 5 cleared OP and moved the same defect onto the axes.** Its spot hugged the x axis on purpose: the axis is grid furniture, exempt from `text-clear-of-ink` and `annotation-nearest-its-owner`, so it counted as free room. The label's paper backing then cut a visible gap into the x axis (15°, 45°) and into the y axis (150°, whose wedge contains it). Exempt from a check is not the same as invisible to a reader. The fix treats every line through the origin that crosses the wedge as a hazard: the x axis, OP, and the y axis once the angle passes 90°. The label sits on the bisector of the widest sub-wedge those lines leave, beyond its arc, with no backing at all, and the arc radius grows until that spot is both clear of the lines and nearer the arc than to them. When no radius up to the cap admits one (15°), the arc keeps its ordinary size and the label goes just under its foot, across the x axis from the wedge. The arc starts on that axis, so the spot is nearer the arc than OP, and it crosses nothing. The regression test now checks the label's box against both axes as well as OP, at 15°, 45°, 60°, 150° and −45°.

**8. Reversed by [ADR 0035](0035-what-a-label-hides-and-claims.md): point labels now name their points.** The refusal above ("`Block.annotatesPlace` for a point's own label, tried and backed out") is withdrawn. `label-nearest-its-place` now reads a closed marker no larger than 24px drawn AT the place as the place itself, so the dot no longer competes with its own label. The same ADR records the axes as ink for the label search (`Board.addFrame`), which moved "−π/2" off the y axis, and places the quadrant letters last, which brought "π/4" back beside its point in the quadrant tour.
