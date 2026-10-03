# mechanics

Mechanics situations solved before they are drawn (ADRs 0073, 0074; the plan is
[docs/PLAN-PHYSICS.md](../../../docs/PLAN-PHYSICS.md)). What is typed is the
situation (masses, g, an angle, μ, a speed). Everything drawn is computed, and
every arrow is drawn to one scale per figure, so F is half of P on the page
when the physics says so.

| area | kinds |
| --- | --- |
| dynamics | `pulleys`, `incline`, `table`, `atwood`, `spring` |
| kinematics | `projectile` |
| energy | `energy` |
| statics | `lever` |
| momentum | `collision` |
| circular motion | `circular`, `loop`, `banked`, `conical` |
| gravitation | `orbit` |

Each kind is one file in `kinds/`, with its solver in `physics.ts`.

**Choose it when** the content is a mechanics situation: forces on a body, a
launch, a track, a lever, a collision, a circle, an orbit
(`S-forces-favours-mechanics`). **Do not choose it when** the
content is a free vector sum in the plane (that is `vectors`) or an
illustration of a machine with nothing to solve (raw IR, or
`annotated-figure`).

## Input

```json
{ "preset": "mechanics", "kind": "pulleys", "mass": 80, "movable": 2, "tensions": true }
{ "preset": "mechanics", "kind": "incline", "mass": 10, "angle": 37, "friction": 0.25 }
{ "preset": "mechanics", "kind": "table", "masses": [6, 4], "friction": 0.2 }
{ "preset": "mechanics", "kind": "atwood", "masses": [3, 5] }
{ "preset": "mechanics", "kind": "spring", "mass": 2, "stiffness": 250 }
```

- Every kind: `g` (default 10). One body takes `mass` (kg, positive), two take `masses`.
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
- **table**:
  - `masses: [m_A, m_B]`: A on the table, B hanging over a pulley at its edge.
    `friction` (μ) applies between A and the table.
  - The physics: with P_B > μN the system moves, with
    a = (P_B − μN)/(m_A + m_B) and T = m_B(g − a); otherwise static friction
    holds it, and T = P_B.
- **atwood**:
  - `masses: [m₁, m₂]` over one fixed pulley. The heavier block is drawn lower.
  - The physics: a = |m₂ − m₁|g/(m₁ + m₂) and T = 2m₁m₂g/(m₁ + m₂), which
    always lies between the two weights.
- **spring**:
  - `mass`, `stiffness` (k, N/m), `natural` (L₀, m, default 0,2).
  - The loaded spring hangs beside the same spring unloaded. L₀ and the
    stretch x = mg/k are dimension lines to one scale, so x/L₀ on the page is
    x/L₀ in metres.
  - F_el and P are drawn equal, since the block is in equilibrium.
  - A stretch too small to draw to scale beside L₀ is refused.

Tension arrows (T) are drawn beside their rope, not on it, so that their name
reads as the arrow's rather than the rope's.

- **projectile**:
  - `speed` (v₀, m/s), `angle` (0–85°; 0 = horizontal) and `height` (h₀, m).
  - The path is sampled from the solution, and the top H, the range A and the
    flight time are computed.
  - Velocities are drawn at the launch, the top (vₓ) and the landing, to one
    scale, so vₓ is visibly v₀·cos θ.
  - The dashed path is cut where an arrow shows the motion.
  - `components: true` (θ ≤ 70°) adds the decomposition of v₀ as an inset.
- **energy**:
  - `track: [{ name, height }]` (2–6 points), `speed` at the first point,
    `launcher: { stiffness, compression }` and `lost: [J per stretch]`.
  - E_mec is carried along less the losses, giving E_p = mgh and E_c = E − E_p.
    These are stacked bars under each point, to one scale, with the initial
    total dashed.
  - A point the body cannot reach is said so.
- **lever**:
  - `length`, `support` and `loads: [{ at, mass | force }]` (1–3), with
    `unknown: { at }` (find the force) or `{ force }` (find where it acts).
  - Torques about the support sum to zero; a negative force pushes up.
  - The arms are dimension lines to scale. The class (interfixa,
    inter-resistente, interpotente) is given when there is one load.
- **collision**:
  - `masses`, `velocities` (before, signed, right positive) and `type`
    (`elastic` | `perfectly-inelastic`) or `restitution` (0–1).
  - Or `explosion: { velocity, initial }`.
  - Momentum is conserved, and the kinetic energy lost (or released) is printed.
- **circular**: `radius` with `speed` or `period`, and `positions` (degrees).
  v is tangent and a_c points to the centre, equal everywhere. T, f, ω and a_c
  are printed.
- **loop**:
  - `radius`, `mass` and `speed` at the top (default: the minimum).
  - N and P both point to the centre, with v_min = √(gR) and N = mv²/R − P.
- **banked**: `radius`, `mass` and `angle` (10–60°). N and P add to a
  horizontal resultant toward the centre, so the ideal speed is √(gR·tg θ).
- **conical**:
  - `length`, `mass` and `angle` from the vertical (15–70°).
  - T and P add to a horizontal resultant, and r = L·sen θ.
  - The speed and the period 2π√(L·cos θ/g) are printed.
- **orbit**:
  - `semiMajor` (UA), `eccentricity` (0,1–0,7) and `interval` (a fraction of
    the period).
  - r_p and r_a come from a(1 ∓ e).
  - Two sectors swept in the same time are traced by Kepler's equation, so
    their areas are equal.
  - v_p/v_a = r_a/r_p, and T = a^{3/2} years about the Sun.

The arrows carry names only (P, N, Pₓ, Pᵧ, Fₐₜ, F, T₁). The values are reading
lines under the figure: P = m·g, the components, the friction and why, and a.

## answers: false

Everything drawn stays: the arrows and their names, the mass, the angle. The
reading lines go — every computed value is what the question asks. Where a
drawn thing is itself the answer it goes too: the energy bars, and a
collision's velocities after (an explosion keeps its given one).

## What the checks hold it to

Each arrow's name annotates its head and must be nearer it than any other ink
(`annotation-nearest-its-owner`). This is why the arrow scale is chosen so the
tips of P and Pᵧ stay 64 px above the ground, why the angle's label sits at a
radius where it is nearer its arc than either side of the angle, and why the
angle is at least 10°.
