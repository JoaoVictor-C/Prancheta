# linear-map

A linear map of the plane, T(v) = A v, for Álgebra Linear and Geometria
Analítica: "represente a transformação T(x, y) = (2x + y, x + y)", "mostre a
imagem do quadrado unitário e calcule a área", "encontre os autovetores",
"reflita o triângulo ABC em torno de y = x". The 2×2 matrix is the only typed
number. Everything drawn — the image of the lattice, T(e₁) and T(e₂), the unit
square's image, the eigen-lines, a shape's primed vertices — and every number
printed is **computed** from it. See
[`docs/decisions/0052-linear-maps.md`](../../../docs/decisions/0052-linear-maps.md)
for what was refused and why.

**Choose it when** the content is a linear map of R² and the question is what
it does to the plane: its matrix, determinant and area factor, where it sends
a shape or a point, which lines it keeps, what a singular map collapses onto.
It is not for the arrows themselves (`vectors` adds, decomposes and projects
vectors you name — it never applies a map to a lattice), nor for a curve
y = f(x) (`function-graph`), nor for a map of R³ (`space`).

## Input

```json
{
  "preset": "linear-map",
  "matrix": [[2, 1], [1, 2]],
  "show": { "grid": true, "basis": true, "unitSquare": true, "eigen": true }
}
```

The map — exactly one of:

- **`matrix: [[a, b], [c, d]]`** — entries are numbers or expression strings
  evaluated by `src/math/expr.ts` (`"sqrt(3)/2"`, `"cos(pi/6)"`, `"-1/2"`).
- **`named`** — the preset computes the matrix and prints it:
  - `{ "rotation": 90 }` — degrees counter-clockwise; `"90°"` also works, and
    a bare expression string is radians (`"pi/3"`);
  - `{ "reflection": { "line": "y = x" } }` — about a line through the origin:
    `"y = x"`, `"y = -x"`, `"y = x/2"`, `"x"` (the x axis), `"y"` (the y axis),
    or an angle in degrees;
  - `{ "shear": { "x": k } }` (x′ = x + k·y) or `{ "shear": { "y": k } }`
    (y′ = y + k·x);
  - `{ "scale": [sx, sy] }`;
  - `{ "projection": { "onto": "y = x" } }` — orthogonal, onto a line as above
    or a direction `[dx, dy]`.

Everything else is optional:

| field | what it does |
| --- | --- |
| `x`, `y` | The plotted box, `[lo, hi]`. Default: whole numbers containing the origin, what is drawn and its image, with half a unit to spare, and at least 4 wide. A box that cuts something drawn is **refused** naming it, never clipped silently. |
| `show.grid` | The image of the lattice lines x = k and y = k, in light blue over the faint grey original; the images of the two axes are heavier. Clipped to the box. |
| `show.basis` | e₁, e₂ (slate) and T(e₁), T(e₂) (rust); T(e₁) is column 1. Equal vectors are one arrow with all its names: `T(e₁) = e₂`, `T(e₁) = T(e₂)`. |
| `show.unitSquare` | The unit square and its image, the parallelogram on the columns, shaded, with `S = 3` — the area \|det A\| — measured against the polygon by `area-matches-its-label`. |
| `show.eigen` | Each real eigen-line through the origin, dashed and labelled `λ = 3`; the panel lists eigenvalues and eigenvectors. |
| `shapes` | `{ "points": [[x, y], …], "label": "ABC" }` — a polygon (original light, image strong) with one letter per vertex; the image's vertices are `A′`, `B′`, `C′`. |
| `points` | `{ "name": "P", "at": [x, y] }` — named points, mapped the same way to `P′`. |
| `title`, `locale` | As every preset. |

**Defaults.** A bare map shows `grid`, `basis` and `unitSquare`. As soon as
`shapes` or `points` are given, all four flags default to off — the figure is
about the shape — and each flag is turned on by naming it.

## What is drawn

Drawing order: the image lattice, the regions, the lines through the origin,
the arrows, the dots; then every label, only once all the ink is down, each
anchored to what it names (`annotates`, or `annotatesPlace` for a vertex). The
image lattice is grid furniture (`gridOf`), so a label may cross it — on a
paper backing, when it must — and a stretched or nearly singular map widens
the lattice step until adjacent lines are at least 14px apart and no family
has more than 24 lines. The unit square itself is drawn as reference
furniture too, so a name beside an arrow is not misread as naming its edge.

When two or more lines through the origin cross all four corners where the
frame prints its "0", the eigen-lines and the image line are drawn with a
small gap around the origin instead of striking the zero through.

## The reading panel

Below the plot: the matrix typeset with brackets (`A = [ 2 1 ; 1 1 ]` as four
cells), `T(x; y) = (2x + y; x + y)` built from the entries (zero terms
omitted, coefficient 1 dropped, signs right, `(√3/2)x`, `y/2`), `det A` and
`tr A`, the columns T(e₁), T(e₂), the area factor, eigenvalues and eigenvectors
when `eigen` is on, the images of shapes and points and their areas.

- Numbers are exact when they are: `√2/2`, `1/3`, `(3 + √5)/2`, `2π/3`; a matrix
  with roots or fractions is written with fractions throughout (`1/2`, never
  `0,5` beside `√3/2`). Anything else is rounded to three places and marked `≈`.
- **Complex eigenvalues** draw no line; the panel says `autovalores complexos:
  1 ± i`. **Repeated**: a defective matrix has one line (`autovalor duplo λ = 1`,
  `único autovetor …`), a scalar matrix `A = λI` has all of them.
- **Singular**: `A é singular (det A = 0): a imagem do plano é a reta y = x,
  gerada por (1; 1)`, the kernel line, and what the unit square collapses to;
  the zero matrix says the image is only the origin. The lattice is not drawn —
  it has collapsed onto that line, which is drawn and labelled `Im T`.

## What is checked

The same box-model checks every preset renders through hold it to the same
standard: `text-clear-of-ink`, `backing-hides-no-ink`,
`annotation-nearest-its-owner`, `label-nearest-its-place`,
`label-declares-what-it-names`, `contrast-sufficient`, and `area-matches-its-label`
for \|det A\|. `tests/linear-map.test.ts` decodes the drawing back through the
plane's own geometry and checks vertex dots against A·v, lattice lines against
A⁻¹ (each is the image of a line x = k or y = k), eigen-lines against A v = λ v,
and every fixture in [`fixtures/linear-map/`](../../../fixtures/linear-map/symmetric-eigen.json)
passing every check.

## What is refused

- Both `matrix` and `named`, or neither; a matrix that is not 2×2; an entry
  that is neither a number nor a constant expression.
- A `named` with none or several of its keys; a reflection or projection line
  that does not pass through the origin (`"y = x + 1"`); the zero direction.
- A shape with fewer than three vertices, or a `label` that does not name every
  vertex; a point name used twice.
- A box `x`/`y` that does not hold everything drawn.

## What is not covered

Maps of R³ (`space` has the axes; the matrix work is not here), a non-linear
map (a translation moves the origin), and the composition of two maps — give
their product as the matrix.

## answers: false

An exercise on a linear map gives the map and asks for its image, so the question's figure keeps what is given and draws none of what is asked. Kept: the plane with its ticks, the basis e₁ e₂, the original unit square, the original shapes with their vertex letters, the original points, and the map as typed (the matrix and `T(x; y) = …`). A map given by `named` is stated by its name ("T: rotação de 90°") and its matrix is not printed, since finding it is a usual question. Hidden: the image lattice, T(e₁) and T(e₂), the unit square's image and its area S, the eigen-lines, the image line of a singular map, every shape's and point's image and primed name, det A and tr A, and every reading beneath the plane (the columns, the eigenvalues and eigenvectors, the image areas, the primed coordinates). The plotted box is still fitted to the images, so the question and its solution share one page and a reader can draw the answer on it.

## Scale

One unit on both axes, fitted so the larger span of the box is about 460px (at most 90px per unit): `[[200, 0], [0, 300]]` is a page-sized plane, not 6926px. The unit square is then honestly small (its arrows and names drop out where they would be under 4px), while the image, its area and the tick numbers stay legible. Ticks are whole units while the box is a few units wide and 1, 2 or 5 × 10ᵏ beyond.
