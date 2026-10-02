# 0054 — Ray optics: the image is computed, the rays are constructed

## Status

Accepted.

## The need

Física asks for the same figure in every list on optics: "construa a imagem
formada por uma lente convergente de distância focal 10 cm para um objeto a
30 cm", "determine a natureza da imagem", "um raio de luz passa do ar para a
água com 30° de incidência; calcule o ângulo de refração", "a partir de que
ângulo ocorre reflexão total?". What the reader takes from the figure is a
construction — three rays that meet at one point — and four facts computed
from two numbers: where the image is (p′), how big it is (A), and what kind
(real or virtual, direita or invertida, maior or menor).

The project had no way to draw this except raw IR, where every ray is a pair
of typed pixel coordinates. That is the failure the presets exist to close,
and it is worse here than usual: an optics figure whose rays do not meet is not
merely ugly, it is a *wrong answer drawn as if it were the right one*.

## The decision

**`optics` is a preset whose typed numbers are the ones the exercise gives**:
the focal length and its kind, the object distance and height, or two indices
and an angle. The image is **computed** by Gauss's equation with the Brazilian
sign convention (p′ > 0 real, p′ < 0 virtual, A = −p′/p = i/o), never typed.

**The rays are not aimed at the image.** Each principal ray is built from its
own rule, the way a student does it with a ruler — parallel to the axis then
through the focus, through the focus then parallel, through the optical centre
(lens) or the vertex (mirror) — from the object's tip alone. The image arrow is
drawn where Gauss says. Nothing in the drawing forces the two to agree, which is
what makes their agreement a check rather than a tautology:
`tests/optics.test.ts` reads the marks back, intersects the lines through the
drawn rays and requires every intersection to fall within one pixel of the
drawn image tip; it also decodes p, p′ and the image height from the pixels in
the units of the drawing's own scale.

**A virtual image is drawn as one.** The image arrow is dashed, and so is each
backward extension (each segment is its own mark with its own `lineStyle`); a
real image is solid, reached by solid rays. A ray line that is only *aimed* at
a focus — a focal ray of a diverging lens, of a convex mirror, or of an object
inside f — shows that part dashed too. **An object at the focus has no image**:
the rays leave parallel, no arrow is drawn, and the figure says `imagem
imprópria (no infinito)`. The focal ray, which never meets the element, is left
out. This is handled rather than divided by.

**Mirrors are traced paraxially, and cut at the arc.** A spherical mirror does
not focus exactly (spherical aberration), and a figure that reflected each ray
by the exact law at the drawn arc would put the rays a few pixels off the
image — a figure that no longer shows what the textbook says. So each ray
reflects at the tangent plane through the vertex, as school texts do, and the
arc drawn is the true circle of radius 2|f| about C. Each ray's incident and
reflected segment is cut where **its own line** meets that arc, so no line is
bent to fit the drawing and the small gap between the two cut points lies
inside the stroke of the mirror. The centre-of-curvature ray, which is radial,
uses the exact intersection and retraces itself.

**The interface applies Snell and says so with numbers.** The refracted angle
is `asin(n₁ sin θ₁ / n₂)`; past `θc = asin(n₂/n₁)` there is no refracted ray,
the reflected ray is drawn at full weight and the figure says `reflexão total
(θ₁ > θc = 48,8°)`. The panel shows the working (`sen θ₂ = 1 · 0,5 / 1,33 ≈
0,376`), so a student sees where 22,1° comes from. The denser medium is drawn
underneath and tinted, and the figure is turned over when the ray starts in it.

**Angle labels are the bare value on a `sweep` connector.** The existing check
`sweep-matches-its-label` reads a label as a number of degrees only when the
label *is* that number (`30°`, `22,1°`); a label reading `θ₁ = 30°` is
silently not compared. So the arc carries `30°` and is measured against the arc
drawn (`tests/optics.test.ts` demonstrates that editing the label to `45°`
fails the check), and the names θ₁, θ₂ live in the panel beside the working.
This costs a mapping the reader makes by position — the arc on the incident ray
is θ₁ — and buys a label that cannot disagree with its arc.

## What was refused

- **Aiming the rays at the computed image.** The obvious way to make every
  figure "come out right" and the one that defeats the point: a wrong formula
  would draw wrong numbers on rays that still meet at the wrong place.
- **Exact spherical reflection at the arc.** More physical, but the figure
  stops showing what the exercise says (rays missing F, missing the image).
- **A vertical-line mirror only.** Loses the recognisable concave/convex shape
  and the meaning of C.
- **`θ₁ = 30°` on the arc.** Unverifiable by the sweep check (see above).
- **Drawing an image at a distance that pushes everything else to a few
  pixels.** A figure to scale cannot hold an object at 10,05 cm from a 10 cm
  lens and an image at 2 000 cm; the spec is refused, naming p′, rather than
  drawn with a scale that makes the foci indistinguishable.

## The labels, and what the search costs

A ray diagram is a dense drawing: the three rays cross at F and at the image,
the axis runs through every point, and a point's name must be nearer its point
than any line that does not pass through it (`label-nearest-its-place`, ADR
0035). The names F, F′, A, A′, C are found on a fine grid around the point,
nearest first, and the first spot that clears every ink and box is taken; the
optional A, A′, O and V are left off when no clear spot exists, F, F′ and C
never are. The scale is kept large enough that the corridor between the axis
and the nearest ray is taller than a label. **Narrow angles** (below about 14°)
leave no room for a value beside its own arc — a wedge of half-angle θ/2 is
2 r sin(θ/2) wide at radius r — so the rays lengthen up to 300 px and, past
that, the arc is drawn without its label and the panel states the value.

## Consequences

- `optics` needs no new core check; it uses `sweep-matches-its-label`,
  `label-nearest-its-place`, `annotation-nearest-its-owner` and the ink checks.
- The paraxial mirror convention is a fact of the figure, stated in
  `PRESET.md`: rays reflect at the vertex plane, and the arc is decoration
  cut to their lines.
- The text is Portuguese; `locale` governs numbers only.
