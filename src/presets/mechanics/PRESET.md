# mechanics

Force diagrams solved before they are drawn: pulley systems and a block on an
inclined plane (ADR 0073). What is typed is the situation (a mass, g, how many
movable pulleys, an angle, μ). The forces are computed, and every arrow is
drawn to one scale, so F is half of P on the page when the physics says so.

**Choose it when** the content is forces on a body — a pulley system, a block
on a slope (`S-forces-favours-mechanics`). **Do not choose it when** the
content is a free vector sum in the plane (that is `vectors`) or an
illustration of a machine with nothing to solve (raw IR, or
`annotated-figure`).

## Input

```json
{ "preset": "mechanics", "kind": "pulleys", "mass": 80, "movable": 2, "tensions": true }
{ "preset": "mechanics", "kind": "incline", "mass": 10, "angle": 37, "friction": 0.25 }
```

- Both kinds: `mass` (kg, positive), `g` (default 10).
- **pulleys**:
  - `movable` (0–3, default 1): movable pulleys in series, each hung by its
    own rope from the ceiling and lifting the one below.
  - `redirect` (default true): the free end passes over a fixed pulley, so the
    hand pulls down.
  - `tensions: true` labels T₁, T₂… between the two runs of each rope.
  - The physics: T_i = P/2^i and F = P/2ⁿ (F = P with a fixed pulley alone).
- **incline**:
  - `angle` (10–75°): a shallow slope is drawn longer, not lower.
  - `friction` (μ): with μ the block slides when tg θ > μ, with kinetic
    friction μN and a = g(sen θ − μ cos θ); otherwise it is held, by static
    friction equal to Pₓ, and a = 0.
  - `components` (default true) draws Pₓ and Pᵧ dashed, with the
    parallelogram back to P.
  - Friction is drawn from the block's up-slope face, where it acts.

The arrows carry names only (P, N, Pₓ, Pᵧ, Fₐₜ, F, T₁). The values are reading
lines under the figure: P = m·g, the components, the friction and why, and a.

## answers: false

Everything drawn stays: the arrows and their names, the mass, the angle. The
reading lines go — every computed value is what the question asks.

## What the checks hold it to

Each arrow's name annotates its head and must be nearer it than any other ink
(`annotation-nearest-its-owner`). This is why the arrow scale is chosen so the
tips of P and Pᵧ stay 64 px above the ground, why the angle's label sits at a
radius where it is nearer its arc than either side of the angle, and why the
angle is at least 10°.
