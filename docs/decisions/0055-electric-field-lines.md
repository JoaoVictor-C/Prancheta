# 0055 — Electric field lines: lines that end where physics ends them

## Status

Accepted.

## The need

Física 3 asks for one figure in many wordings: "esboce as linhas de campo de
um dipolo", "duas cargas positivas iguais", "uma carga +2q e outra −q". What
the reader takes from it is a handful of facts — lines leave positive charges
and end on negative ones, their number is proportional to the charge, they
never cross, they bend away from like charges, and somewhere between two
equal charges the field is zero. Until now the project could only draw this as
raw IR: a polyline of typed points per line, which is the defect ADR 0050
exists to refuse, and one Física is worse at than Cálculo, because a sketch of
"roughly the right shape" is how the counts (Gauss) come out wrong.

`field` already integrates a planar field with `rk4Planar` (ADR 0050). A charge
diagram is that machinery with a different field, a seeding rule and three ways
of ending a line.

## The decision

**`kind: "charges"` on the `field` preset.** Input is charges `{ at, q, name? }`,
the box, `linesPerUnitCharge` (default 8) and `equipotentials` (a list of levels
or `"auto"`). E = Σ q r̂/r² and V = Σ q/r, with k and units omitted: the figure
shows shapes, and the panel says "linhas de campo (k omitido)".

**Seeding is the physics.** A charge of |q| seeds round(|q|·8) lines, evenly
spaced by angle on its disc. Equal angles at the source are what make the lines
leaving a charge proportional to it, and what makes the count that ends on a
sink follow Gauss (for +2q and −q: 16 lines, about 8 end on −q, the rest leave;
the test allows 7 to 9, because the 90° line is the separatrix and may go either
way). One seed points at the nearest other charge, so a configuration symmetric
about the line joining charges gives symmetric lines. Lines are seeded on
positive charges; if the total is negative, on negative charges integrated
backward (arrows still point along E).

**A line ends in one of four honest ways:** on the rim of a charge of the other
sign (interpolated onto the rim), at the box (bisected by `rk4Planar`), where
E = 0, or at a length limit (reported; never reached in the fixtures).

**Stagnation is found, not approached.** The first version stopped when |E|
fell below a threshold, and two equal charges drew a false line: the axis
seed's floating-point y is 1e-16, not 0, so it followed the saddle's unstable
direction straight up. The rule now is cancellation: a direction means nothing
when |E| is under 4% of Σ|q|/r² (the field the charges would make if they did
not cancel), so the far field of a net-charged configuration is never mistaken
for a stagnation point. When a line stops there, Newton's method finds the zero
of E nearest its last point and the line is extended to it, exactly; a small
ring marks the point and the panel says what it is. A step that turns back on
itself is also read as having crossed one.

**The lines run from the charge's centre, and the sign is strokes.** This is
driven by two existing checks. A name beside a charge is a place label
(`label-nearest-its-place`, ADR 0028): it must be nearer its place than any ink
that does not pass through the place, and lines that start on the disc's rim
are all rivals. Lines that start at the centre pass through the place, so they
are what makes the charge, not competitors to its name; the disc, drawn last
and opaque, covers the stub. But a text "+" inside the disc would then sit on
those stubs (`text-clear-of-ink`), and a text box for a legible sign is bigger
than the disc anyway — which must stay under 24px across, or the place check
stops treating it as a marker (`MARKER_EXTENT`). So the disc has radius 11.5
and the sign is two strokes (plus) or one (minus) in white. White on `#B42318`
is 6.5:1 and on `#1F4E9E` 8.6:1; tested.

**A name goes where no line is, or on a leader.** Beside the disc if a box
between two lines is within reach of the place. With 16 lines that is
impossible — the fan is closed within about 35px of the rim — so the name sits
farther out at the end of a thin leader running between two lines, and the label
annotates the leader (the annotated-figure convention). The search also
requires that no arrowhead, equipotential or other charge is nearer the label
than its owner, the rule `annotation-nearest-its-owner` enforces.

**Equipotentials reuse the contour path.** `expandLevels`'s labelling — every
branch labelled with its level, in a gap cut into the branch — was extracted
into `drawContours` and is shared; `levels` output is unchanged (its tests and
fixtures pass untouched). The charges call adds three options: a denser list of
places to try, a ranking by clearance from the field lines (a label between two
lines rather than just off one) and, for `"auto"`, dropping a level none of
whose branches has room for its label — a dashed circle with no number is not
information. A branch that only clips a corner of the box (under 60px) is not
drawn.

**The board is bare.** A physics figure has no axes or numbers, so the frame
carries only its affine map (`buildBoard(..., bare)`); nothing is drawn from it.

## What was refused

**Seeding on a lattice and keeping the long lines.** Lines then have no
relation to the charges, and the counts mean nothing.

**Stopping on a small |E| threshold.** Refused after it drew a false line (above);
a threshold has to be tuned to the step, the scale and the charges, and
cancellation does not.

**Names on a paper backing over the lines.** `backing-hides-no-ink` is right
to refuse it: a line interrupted by a label reads as a different figure.

**A text "+" and "−".** See above: it fails two checks and is larger than the
disc that has to stay a marker.

**A colour per charge magnitude.** Colour says sign only (red and blue, the
textbook's); magnitude is the number of lines and the name.

## The cost, stated

**Names on leaders when the fan is dense.** A charge with |q| ≥ 2 has its name
50–90px away on a thin line. A reader follows it; it is not the "q₁" tucked next
to the disc that a textbook draws by hand, because a textbook is not held to
nearest-its-owner against 16 lines.

**Lines are cut at the box.** A line that leaves and would curve back is not
followed. The box is what the author chose; widening it is the remedy.

**Gauss counts are 8 ± 1, not exact.** The separatrix line is on a knife edge
by symmetry. Nudging the seed rotation to hide the tie would break the rule
that one seed points at the other charge, which is what makes symmetric
configurations symmetric.

**Point charges in space, drawn in a plane.** E uses the inverse-square law of
charges in space, in the plane through them. A configuration of three or more
charges has no simple count to check against Gauss, and none is claimed.
