# revolution

The Cálculo 2 figure "volume de sólido de revolução": a plane region turned
about an axis. The solid, a highlighted slice, the plane region with its
representative rectangle, and the volume. All of it is derived from the
expressions and the axis. See
[ADR 0049](../../../docs/decisions/0049-solids-of-revolution.md).

**Choose it when** the exercise revolves a region under a curve, or between
two curves, about the x axis, the y axis, or a line y = c or x = c, and asks
for the volume by discs, washers or shells. It is not for school solids
from their dimensions (use [`solid`](../solid/PRESET.md)).

## Input

```json
{
  "preset": "revolution",
  "region": { "of": "sqrt(x)", "from": 0, "to": 4 },
  "axis": "x",
  "slice": { "at": 2.5 }
}
```

- **`region`** takes one of two forms:
  - `{"of": f, "from": a, "to": b}` is the region between y = f(x) and the
    x axis on [a, b].
  - `{"between": [f, g], "from"?, "to"?}` is the region between two curves.
    With no bounds, the bounds are the curves' first and last intersection
    in [−20, 20].

  Bounds may be numbers or constants (`"pi/2"`). Expressions are in x.
- **`axis`** is `"x"`, `"y"`, `{"y": c}` or `{"x": c}`.
- **`method`** is optional:
  - about a horizontal line it is `discs`, or `washers` when the region
    leaves a hole;
  - about a vertical line it is `shells`.

  Asking for the other method is refused: it would need the region
  described as a function of y (see "Refused" below).
- **`slice`**: `true` (the default) highlights one slice at 62% of the
  interval, `{"at": x}` puts it there, and `false` shows none.
- **`sections`**: how many cross-sections to draw on the outer surface,
  0–6. The default is 3. Sections too close to the slice are skipped.
- **`plane`**: the companion plane view. The default is `true`.
- **`camera`** is as in `space`/`solid`. The default is orthographic:
  - azimuth −22°, elevation 0 about a horizontal axis;
  - azimuth 0, elevation 22° about a vertical one.

## What is drawn

- **The solid.**
  - Its outline is the silhouette: where the surface normal is
    perpendicular to the view. That is the envelope of the cross-section
    ellipses, computed, not the meridian curve.
  - The rims are the circles swept by the region's corners.
  - The cross-sections are drawn on the outer surface.
  - Anything the solid itself hides is dashed. This is decided by casting
    the viewing ray against the solid's own membership test, so holes and
    hidden inner surfaces come out right.
  - The axis of revolution is blue, dashed inside the solid.
- **The slice.** It is a disc, a washer or a cylindrical shell, in the
  accent colour:
  - disc or washer: its radius R (and r) runs on the front face;
  - shell: its radius and height (h);
  - its thickness is a `dx` dimension set clear of the solid, with
    extension lines back to the slice.
- **The plane view.** The region is in the solid's tint and the curves
  are named (`y = √x`). The representative rectangle is in the accent
  colour, with R and r (or the shell's r and h) as dimension segments
  labelled from the expressions: `R(x) = √x + 1`, `h(x) = x − x²`.
- **The panel.**
  - line 1: the method and its integral, `Discos: V = π∫₀⁴ R(x)² dx, com
    R(x) = √x`;
  - line 2: the integral of these curves and its value, `V = π∫₀⁴ (√x)² dx
    = 8π ≈ 25,133`.

  The value is exact when it is a rational multiple of π. Otherwise it is
  printed after `≈`.

A measure label with no honest spot (nearer its own segment than anything
else, clear of every line) is not printed there. Its segment is dropped
from that view too, and the measure is left to the other view and the
panel.

## Refused

- A region on both sides of its axis, or across a vertical axis. The
  refusal names where it crosses.
- A pole or an undefined point in the interval.
- Two curves that cross inside the interval. Revolve each piece on its
  own.
- `shells` about a horizontal line, and `discs`/`washers` about a vertical
  one.
- A slice outside the interval.
- A camera that looks along the axis, or sees the cross-sections edge-on.
