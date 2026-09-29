# optics

Geometric optics as Ramalho, Halliday and the ENEM ask for it: thin lenses and
spherical (or plane) mirrors with the image they form, and a plane interface
between two media where a ray refracts or reflects totally. "Construa a imagem
de um objeto a 30 cm de uma lente convergente de 10 cm de distância focal",
"um objeto entre F e C de um espelho côncavo", "um raio passa do ar para a
água com 30° de incidência", "a partir de que ângulo há reflexão total?".
Every position drawn and every number printed is **computed** from the input;
see [`docs/decisions/0054-ray-optics.md`](../../../docs/decisions/0054-ray-optics.md)
for what was refused and why.

**Choose it when** the content is a ray diagram: an optical element on an axis
with an object and its image, or one ray meeting a plane boundary. It is not
for wave optics (interference, diffraction: no rays), for a prism or a system
of several elements (two elements: author raw IR), for the eye, a telescope or
a microscope, nor for a free-body or vector figure (`vectors`).

## Input

```json
{ "preset": "optics", "kind": "lens", "lens": "converging", "f": 10, "p": 30, "o": 3 }
```

`kind` is one of:

### `"lens"`

| field | meaning |
| --- | --- |
| `lens` | `"converging"` or `"diverging"`. The kind gives the sign of f; you give its magnitude. |
| `f` | Focal length in cm, a positive number (or a constant expression, `"20/3"`). |
| `p` | Object distance in cm, > 0 (a real object). |
| `o` | Object height in cm. Default: a third of the smaller of p and f, to the half centimetre. |
| `rays` | Which principal rays, at least two of `"parallel"`, `"focal"`, `"centre"`. Default: all three. |
| `show.antiprincipal` | The points A and A′ at 2f. Default on for a converging lens, off for a diverging one. |
| `show.names` | The element's name above it. Default on. |

### `"mirror"`

`mirror` is `"concave"`, `"convex"` or `"plane"`; `f` is the magnitude (absent
for a plane mirror, refused if given). `rays` may also name `"vertex"` (the ray
that strikes the pole and reflects symmetrically) and `"centre"` (the ray
through C, which returns on itself). Default: parallel, focal and the centre
ray for a concave mirror; parallel, focal and the vertex ray for a convex one
(the centre ray of a convex mirror runs almost on top of the focal ray). A
default ray that would strike the mirror far above the object is replaced by
the next one; a plane mirror draws three rays at its own heights.

### `"interface"`

| field | meaning |
| --- | --- |
| `n1`, `n2` | `{ "name": "ar", "n": 1 }`. `n` may be omitted for `ar`, `vácuo`, `água`, `gelo`, `álcool`, `acrílico`, `vidro`, `diamante`. Must be ≥ 1. |
| `theta1` | Angle of incidence, degrees, 0 ≤ θ₁ < 90. |
| `reflected` | Draw the reflected ray when there is also a refracted one. Default true. |

`locale` (`"pt-BR"` default) formats the numbers; `title` overrides the
figure's title. The text is Portuguese.

## What is drawn

**Lens or mirror.** A horizontal axis; the element (a lens is a vertical line
with outward arrowheads when converging and inward when diverging; a mirror is
the arc of radius 2|f| about C, hatched on the back; a plane mirror a hatched
line); the points F, F′ (and A, A′) or F, C and V marked as dots on the axis
and named; the object arrow at distance p with height o; the principal rays,
each drawn from its own rule; and the image arrow. **A real image is a solid
arrow reached by solid rays; a virtual image is a dashed arrow, and the
backward extensions of the rays that make it are dashed too.** A ray that
passes through a focus behind the object or beyond the element shows that part
dashed. Small arrowheads give each ray its direction. The figure is to scale
in both directions: the drawing states its scale with a bar ("10 cm") and the
panel says so.

- **Object at the focus** (p = f): the rays leave parallel, no image arrow is
  drawn, and the nature line says `imagem imprópria (no infinito)`. The focal
  ray, which runs along the focal plane, is left out.
- **Image too far**: an object a hair inside or outside f puts the image
  hundreds of centimetres away; a figure to scale beside the object cannot show
  it, so it is refused, naming p′.

**Interface.** The plane boundary, the denser medium tinted below (when the ray
starts in the denser medium the figure is turned over, the incident ray coming
from below, the way it is in a pool), the dashed normal, the incident, the
reflected (thinner when there is also a refracted ray) and the refracted ray by
Snell, each with its name; angle arcs at the point of incidence, each a `sweep`
connector labelled with its bare value (`30°`, `22,1°`), so
`sweep-matches-its-label` measures every label against the arc drawn. Past the
critical angle there is no refracted ray, the reflected ray is drawn at full
weight, its angle is marked too, and the panel says `reflexão total (θ₁ > θc = 48,8°)`.

## The reading panel

Lens and mirror: `p = 30 cm; f = 10 cm → p′ = 15 cm; A = −0,5`, then
`1/f = 1/p + 1/p′; A = −p′/p = i/o → o = 3 cm; i = −1,5 cm`, then the nature
line in bold — `imagem real, invertida, menor` (real or virtual; direita or
invertida; maior, menor or igual). f is signed there (−12 cm for a diverging
lens or convex mirror). A number that is not exact carries `≈` and hundredths.

Interface: `n₁ sen θ₁ = n₂ sen θ₂` with the media, `θ₁ = 30°: sen θ₂ = 1 · 0,5
/ 1,33 ≈ 0,376 → θ₂ ≈ 22,1°`, the critical angle when n₁ > n₂, and a
sentence on whether the ray approaches or leaves the normal (or on total
reflection). The angle names θ₁ and θ₂ live in the panel; the arcs carry the
values.

## What is checked

The same box-model checks every preset renders through: `text-clear-of-ink`,
`annotation-nearest-its-owner`, `label-nearest-its-place`,
`label-declares-what-it-names`, `contrast-sufficient`,
`sweep-matches-its-label` (the interface's angle arcs). `tests/optics.test.ts`
reads the drawing back: that Gauss's equation and the sign convention hold
across a sweep; that **the drawn rays meet at the drawn image tip within a
pixel**, and that tip is at p′ and A·o in the drawing's own units; that the
parallel ray is parallel and the central ray passes the optical centre; that
mirror rays end on the arc of radius 2f about C; that a drawn refracted angle
is Snell's for a sweep of media; and every fixture in
[`fixtures/optics/`](../../../fixtures/optics/lens-converging-beyond-2f.json)
passes every check.

## What is refused

A missing or unknown `kind`, `lens` or `mirror`; a field that does not belong
to that kind; f ≤ 0, p ≤ 0, o ≤ 0; f for a plane mirror, no f for a spherical
one; fewer than two rays, a repeated ray, `vertex` on a lens; an image beyond
five times max(p, 2f); θ₁ outside [0, 90); a medium with no `n` that is not in
the table; n < 1.

## What is not covered

Virtual objects (p < 0), systems of two elements, thick lenses, aberrations
(mirrors are traced paraxially: rays reflect at the tangent plane through the
vertex and are cut where they meet the drawn arc), prisms, a curved interface,
dispersion, polarisation. **Very small angles**: an angle arc needs room for
its own label inside its wedge, so below about 14° the rays are drawn longer
(to 300 px) and, when even that is not enough, the arc is drawn without its
label and the panel gives the value.
