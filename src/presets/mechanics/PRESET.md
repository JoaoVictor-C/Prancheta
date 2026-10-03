# mechanics

Mechanics situations solved before they are drawn (ADRs 0073, 0074; the plan is
[docs/plans/PLAN-PHYSICS.md](../../../docs/plans/PLAN-PHYSICS.md)). What is typed is the
situation (masses, g, an angle, μ, a speed). Everything drawn is computed, and
every arrow is drawn to one scale per figure, so F is half of P on the page
when the physics says so.

| area | kinds |
| --- | --- |
| dynamics | `pulleys`, `incline`, `table`, `atwood`, `spring`, `contact`, `angled-pull`, `elevator`, `springs` |
| kinematics | `projectile`, `free-fall` |
| energy | `energy`, `efficiency` |
| statics | `lever`, `cables`, `center-of-mass` |
| momentum | `collision` |
| circular motion | `circular`, `loop`, `banked`, `conical` |
| oscillations | `oscillator` |
| gravitation | `orbit`, `gravitation` |
| fluids | `buoyancy`, `hydraulic`, `pressure` |

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
  - `masses`, `velocities` (before, signed, right positive) and `collision`
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

```json
{ "preset": "mechanics", "kind": "free-fall", "height": 45 }
{ "preset": "mechanics", "kind": "contact", "masses": [2, 3], "force": 20, "friction": 0.2 }
{ "preset": "mechanics", "kind": "buoyancy", "density": 600, "side": 0.2 }
{ "preset": "mechanics", "kind": "pressure", "setup": "u-tube", "densities": [800, 1000], "height": 0.2 }
```

- **free-fall**:
  - `height` (h₀, m), `speed` (v₀ upward, m/s; either may be 0, not both) and
    `interval` (the time step, s; chosen when absent).
  - A strobe photo: the body at equal time steps, to scale, with v to one
    scale at each, so the gaps grow as it falls. A throw upward is drawn as two
    columns, the rise and the fall. An arrow that would cross the ground ends
    at its body instead.
- **contact**: `masses: [m_A, m_B]` side by side, `force` on A, `friction`
  (μ, optional). One a for both; A pushes B with F_AB = m_B·a + f_B, drawn with
  its reaction F_BA, equal, at the shared face.
- **angled-pull**: `mass`, `force`, `angle` above the horizontal (10–70°),
  `friction`. Fₓ and Fᵧ are dashed components; N = P − F·sen θ, so the pull
  lightens the normal and the friction with it. A pull that would lift the
  block is refused.
- **elevator**: `mass` and signed `acceleration` (up positive). N = m(g + a),
  the apparent weight a floor scale reads: more than P while a points up, less
  while it points down, zero in free fall.
- **springs**: `mass`, `stiffness: [k₁, k₂]`, `arrangement` (`series` |
  `parallel`), `natural` (L₀). In series the force is the same and the
  stretches add; in parallel the stretch is the same and the forces add. The
  loaded system hangs beside the unloaded one, every length to one scale.
- **gravitation**: `masses`, `distance` and `compare` (another distance,
  optional). F = G·m₁·m₂/d², equal and opposite whatever the masses. With
  `compare` the same pair is drawn below at the other distance, its arrows
  scaled by (d/d')²: the inverse square law made visible.
- **cables**: `mass` hung from a knot by two cables at `angles: [α, β]`
  above the horizontal (15–75°). The three forces are drawn at the knot, and
  an inset closes them head to tail into the force triangle, to the same
  scale.
- **center-of-mass**: `bodies: [{ mass, x[, y] }]` (2–5) on a line or in the
  plane; the centre of mass, the mass-weighted mean, is marked by a cross and
  its coordinates computed.
- **oscillator**: `system` (`spring` with `mass`, `stiffness`; `pendulum`
  with `length`), and `amplitude`. The extremes and the middle: v is greatest
  in the middle, a at the ends, toward the middle. A pendulum swing under 20°
  is drawn at 20°, and the figure says the angle is exaggerated; an amplitude
  over 0,35·L is refused (the pendulum would not be simple).
- **buoyancy**: a cube of `side` and `density` in a liquid (`liquidDensity`,
  default 1000). It floats sunk to ρ_c/ρ_l of its height with E = P, or is
  drawn sinking with E/P = ρ_l/ρ_c. If the scale that lets E leave the cube
  would make P too long, neither is to scale, and the figure says so.
- **hydraulic**: `force` on the small piston, `areas: [A₁, A₂]`, `travel`
  (optional). The pistons are to scale (diameter ∝ √A); the force arrows are
  not, since their ratio is often 50 or more — the reading lines say so.
- **pressure**: `setup: "depth"` with `points: [{ name, depth }]` (1–4) at
  their depths to scale, p = p₀ + ρgh at each; or `setup: "u-tube"` with two
  `densities` and the `height` of the lighter column: ρ₁h₁ = ρ₂h₂ above the
  interface.
- **efficiency**: `input`, `useful`, `losses: [{ name, value }]` (up to 3)
  and `unit`. A band diagram, every band as wide as its value; what the named
  losses do not cover is "outras perdas". The lowest loss turns down first, so
  no band crosses another. η = útil/entrada.

The arrows carry names only (P, N, Pₓ, Pᵧ, Fₐₜ, F, T₁). The values are reading
lines under the figure: P = m·g, the components, the friction and why, and a.

## answers: false

Everything drawn stays: the arrows and their names, the mass, the angle. The
reading lines go — every computed value is what the question asks. Where a
drawn thing is itself the answer it goes too: the energy bars, and a
collision's velocities after (an explosion keeps its given one), the centre of
mass's cross. A note that a drawing is not to scale is not an answer, and stays.

## What the checks hold it to

Each arrow's name annotates its head and must be nearer it than any other ink
(`annotation-nearest-its-owner`). This is why the arrow scale is chosen so the
tips of P and Pᵧ stay 64 px above the ground, why the angle's label sits at a
radius where it is nearer its arc than either side of the angle, and why the
angle is at least 10°.
