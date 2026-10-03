# 0052 — Linear maps of the plane, and a lattice that is furniture

## Status

Accepted.

## The need

Álgebra Linear and Geometria Analítica ask for one figure over and over:
"represente a transformação T(x, y) = (2x + y, x + y)", "mostre a imagem do
quadrado unitário e calcule a área", "encontre os autovetores", "reflita o
triângulo ABC em torno de y = x". What the reader takes from it is a set of
facts about a matrix — where the lattice goes, which columns T(e₁) and T(e₂)
are, the factor |det A| by which every area is multiplied, which lines the map
keeps — and every one of them is computed from four numbers.

The project's answer so far was raw IR. `fixtures/ir/transformation-grid.json` is
the example: a hand-placed triangle, the same triangle turned by hand, vertex
dots at typed coordinates and 42-pixel units in the frame. Nothing ties the
second triangle to the first; nothing stops the rotation being the wrong way,
the image being drawn at the wrong scale, or the coordinates printed beside it
being the answer to a different exercise. That is exactly the gap every preset
here exists to close — `vectors` closes it for sums and projections, `field`
for slopes and flows — and a linear map is the case in between: the arrows are
not typed, but `vectors` has no notion of applying a matrix to a lattice.

## The decision

**`linear-map` is a preset whose only typed number is a 2×2 matrix.** It comes
as `matrix: [[a, b], [c, d]]` (entries numbers or expression strings, so
`"sqrt(3)/2"` and `"cos(pi/6)"` are entries) or as one `named` map — rotation,
reflection about a line through the origin, shear, scale, orthogonal projection
— for which the preset **computes the matrix and prints the one it computed**.
The panel is how the student sees that a rotation by 90° is [[0, −1], [1, 0]]
rather than trusting it.

Everything on the plane is computed from that matrix and drawn on one gridded
`Frame` with equal units (so lengths, angles and areas mean what they say):

- **The image lattice** is the image of the lines x = k and y = k:
  k·T(e₁) + t·T(e₂) and k·T(e₂) + t·T(e₁), clipped to the plotted box. The
  range of k comes from mapping the box's corners back through A⁻¹, so a line is
  drawn exactly when it can meet the box. It is light blue over the faint grey
  original, with the images of the two axes heavier.
- **T(e₁) and T(e₂)** are the columns of A, drawn as arrows from the origin.
  Equal vectors are one arrow carrying all its names (`T(e₁) = e₂` for a
  reflection about y = x, `T(e₁) = T(e₂)` for a projection onto it).
- **The unit square's image** is the parallelogram on the columns, and its
  area — |det A|, printed as `S = 3` — is **measured** by
  `area-matches-its-label` (ADR 0037) against the polygon that is drawn. The
  polygon's vertices are stated in the frame, so frame resolution records the
  scale; a label that disagrees with the drawing fails the check, which
  `tests/linear-map.test.ts` demonstrates by editing one.
- **Eigen-lines** are the null spaces of A − λI, λ from λ² − tr·λ + det. Real
  eigenvalues draw each line through the origin, dashed, labelled `λ = 3`.
  Complex eigenvalues draw nothing and the panel says `autovalores complexos:
  1 ± i`. A repeated eigenvalue is handled as what it is: a defective matrix
  has one line, a scalar matrix has all of them and draws none.
- **Shapes and points** are mapped vertex by vertex; the image's names are the
  vertices' primed (`A′`, `B′`, `C′`) and its coordinates and area are in the
  panel. Every vertex dot carries `annotatesPlace` (ADR 0035).
- **A singular map** says what it collapses the plane onto — the line through
  the origin along its nonzero column, and the kernel line — and draws that
  line, labelled `Im T`, instead of a lattice that no longer exists. The zero
  matrix says the image is the origin.

**Numbers are written exact when they are.** `snapExact` (ADR 0040) gives
p/q, √n and kπ/q; the rationalised roots a rotation is made of (√2/2, √3/2) come
from squaring — x² a small-denominator rational — and go through the vectors
preset's `sqrtLabel`. Eigenvalues that are roots of a quadratic with integer
trace and discriminant are written (a ± b√r)/2 with the square factor taken
out: `(3 + √5)/2`, `1 + √2`. A matrix with roots or fractions is written with
fractions throughout (`1/2`, never `0,5` beside `√3/2`), one spelling across
the matrix and `T(x; y) = ((√3/2)x − y/2; x/2 + (√3/2)y)`. What is neither
exact nor a short decimal is rounded to three places and marked `≈`. The
formula is built from the entries — zero terms omitted, a coefficient of 1
dropped, signs right — and never typed.

**The reading panel** carries the matrix typeset with real brackets (four cells
and two marks, not `[[2; 1], [1; 1]]` in a line), the formula, det A and tr A,
the columns, the area factor, the eigen-facts and the images of what was
drawn. It is where every number lives that a label on the plane could only
crowd.

### The lattice is furniture, and so is the unit square

Two elements are declared `gridOf: "plane"`, which the IR documents as "never
authored" and this preset authors on purpose:

- **The image lattice.** It is the figure's substrate in exactly the sense the
  original lattice is: a reader completes a faint ruled line across a number.
  Left as ordinary marks, every label would fail `text-clear-of-ink` and
  `contrast-sufficient` against a lattice that fills the whole box, and would be
  measured as a rival for every "nearest" question (`annotation-nearest-its-owner`
  skips grid marks for the same reason).
- **The original unit square.** It is the domain the arrows are read against,
  and its edges run exactly along e₁, e₂ and, after a reflection, the images.
  As an ordinary mark it is a rival that no name set beside an arrow can beat:
  T(e₁)'s tip is often a corner of the square. As furniture it is still ink the
  label search stays off (the placer treats it as a line to avoid).

To keep this from becoming permission to sit on the lattice, every label is
tried twice. A **strict** placer counts the plane's lattice and the image
lattice as ink; a label found there needs no backing. Only when none exists —
or the clean one is more than 12px farther from its owner than the best spot
that crosses a line — the label goes on a paper backing, the halo ADR 0034
designed, which `backing-hides-no-ink` allows over lattice and nothing else.

### The origin's zero

The frame prints one "0" in a corner of the origin, in the first of four spots
no ink crosses. Two lines through the origin at 45° — a reflection about y = x,
both eigen-lines of [[2, 1], [1, 2]] — cross all four, and the number was left
struck through by the dashed line. The preset asks `tickPlan` where those four
boxes are and, only when every one is crossed, draws the eigen-lines and the
image line with a 30px gap around the origin, which a dashed line reads as
anyway.

### The lattice stays legible

A stretched or nearly singular map would put dozens of almost-parallel lines
into the box. Adjacent lines of a family are |det A|/|direction| apart, so the
step k grows (1, 2, 5, 10, …) until that gap is at least 14px and no family has
more than 24 lines. The image of the lattice x = 5k is still the image of a
lattice; it is drawn at that step, not at a step the figure cannot resolve.

### Defaults and ranges

A bare map shows the lattice, the basis and the unit square. Given `shapes` or
`points` the figure is about them, and every flag defaults off. The plotted box
defaults to whole numbers that contain the origin, everything drawn and its
image, half a unit to spare, and at least 4 wide. **An explicit `x`/`y` that
cuts anything drawn is refused, naming the offender** — nothing is clipped
silently, since a clipped image is a wrong answer that looks right. The image
lattice, a family of infinite lines, is the one thing clipped, and clipping it
is what it means to draw a lattice in a box.

## What was refused

**A `linear-map` as more `vectors`.** The vectors preset draws named arrows and
derives sums, projections and angles from them. A lattice, a region and an
eigen-line are not vectors, and grafting them on would make one preset carry
two unrelated defaults. The selection table refuses `vectors` for a linear map for the same reason.

**A typed image.** A shape's image as a second list of points, or a matrix
printed beside a hand-placed figure, is `transformation-grid.json` again. The
input carries the original vertices and the matrix; the image is a product.

**Rounding to hide an inexact matrix.** A rotation by 30° has entries √3/2 and
1/2; printing 0,866 and 0,5 is the defect ADR 0040 exists to prevent. Entries
snap through squares to rationalised roots, and a matrix that does not snap is
printed as rounded and marked `≈` instead of pretending to be exact.

**Solving the eigenproblem only when it is pretty.** Real, distinct eigenvalues
that do not snap (`(1 ± √13)/2`) are drawn and printed exact as a quadratic;
their eigenvectors are printed `≈ (1; 0,303)` with the mark, because a direction
that is not an integer vector has no honest one-word exact form here. Complex
and repeated cases are stated as such, never dropped.

**Clipping to make a figure fit.** See above: refused.

**Drawing the eigenvector arrow and its image.** The dashed line through the
origin already shows that A v is on the line; adding v and A v as arrows would
put four more labelled arrows on a plane that already carries e₁, e₂, T(e₁),
T(e₂) and the eigen-lines. The panel gives the vector.

**Composing two maps.** `T ∘ S` is the product matrix; give it as `matrix`.

## The cost, stated

- `Mark.gridOf` is now authored by a preset for two families of marks. The
  frame resolver already treats any `gridOf` mark uniformly; nothing else reads
  it as "belonging to a Frame's grid spec", but the doc comment on the field
  ("never authored") is now out of date and says so here rather than there.
- Crowded figures fail the ownership rule. With basis, unit square, eigen-lines
  and a shape all on, a name can have no spot both clear of ink and nearer its
  own arrow than a rival: in a random sweep of 80 bare maps with every flag on,
  three failed `annotation-nearest-its-owner`; with a shape as well, about one
  in seven. The fixtures pick flag sets that show the fact each one is about
  (a reflection is drawn with a shape and its mirror line, not with the basis
  on top of a square that maps to itself).
- Eigenvectors that are not integer directions are approximate in the panel.
- The tick numbers next to a polygon can be pushed a division sideways by the
  frame's own placement; that is `tickPlan`'s choice, not this preset's, and it
  keeps the number nearest its own tick.
- Text is measured by estimate before layout, as everywhere in the board; the
  panel wraps at a generous width, which sometimes breaks a line earlier than a
  browser would.
