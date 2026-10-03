# Physics plan — mechanics, kinematics, energy, momentum, gravitation, statics, fluids

The `mechanics` preset (ADR 0073) proved the approach: type the situation,
solve it, draw the solution to one scale. This plan extends it to the rest of
school mechanics without letting the preset become one unreadable file.

## Rules for every item

1. **One file per kind.** Each kind lives in `src/presets/mechanics/kinds/<kind>.ts`
   and exports one `Kind` object (`kind.ts`):
   - its fields;
   - its validator;
   - its drawing.

   Pure physics lives in `physics.ts`, with no drawing. Shared drawing (arrows,
   names, dimension lines, reading panel) lives in `draw.ts`. `preset.ts` only
   dispatches through the registry.
2. **Solved, then drawn.** Every number on the page comes out of a solver.
   Every arrow, bar or length is to one scale per figure, and the tests compare
   drawn ratios with solved ratios.
3. **Names on the figure, values in the reading lines.** `answers: false`
   drops the reading lines and keeps everything drawn (ADR 0073).
4. **No regressions.** A refactor keeps every existing SVG byte-identical. A
   new kind adds fixtures and tests and changes no existing test.
5. **Per kind:** typecheck, its own tests, its figures opened and looked at.
   **Per phase:** the full suite, then one commit.

## Phases

### P0 — structure (no new behaviour)

| item | status |
|---|---|
| split `mechanics/preset.ts` into registry, `physics.ts`, `draw.ts`, `kinds/*.ts` | done |
| the 11 existing fixtures re-render byte-identical | done (11/11) |

### P1 — the six most asked (circular motion split into its four setups)

| kind | what is solved | status |
|---|---|---|
| `projectile` | trajectory from v₀ and θ (and launch height); H, range, flight time; v and its components at chosen instants | done |
| `energy` | a track with points A, B, C…; Eₖ, Eₚ (and spring energy) at each by conservation, optionally with friction losses; bars to one scale | done |
| `lever` | a beam on a support with loads; the unknown force or position by torques; the lever's class | done |
| `collision` | two bodies before and after; final velocities by momentum (elastic, inelastic, perfectly inelastic, explosion); kinetic energy lost | done |
| `circular` | uniform circular motion: v tangent and a_c to the centre at chosen positions; T, f, ω | done |
| `loop` | a loop-the-loop: forces at the top, minimum speed √(gR), the normal force at a given speed | done |
| `banked` | a banked curve: N and P, the horizontal resultant, the ideal speed √(gR tg θ) | done |
| `conical` | a conical pendulum: T and P, the horizontal resultant, the radius, speed and period | done |
| `orbit` | an ellipse from a and e; perihelion and aphelion; equal areas in equal times as computed sectors; orbital speed and period | done |

### P2 — the rest of dynamics, statics, fluids, oscillations

| kind | what is solved | status |
|---|---|---|
| `free-fall` | vertical throw or fall: positions at equal time steps (the strobe), v at each | done |
| `contact` | blocks in contact pushed by F: a and the contact force | done |
| `angled-pull` | a block pulled by F at an angle: Fx, Fy, the reduced normal, friction, a | done |
| `elevator` | apparent weight going up or down, speeding up or slowing down | done |
| `springs` | springs in series and in parallel: equivalent k and each stretch | done |
| `gravitation` | two bodies: equal and opposite forces; F at d and at another distance (1/d²) | done |
| `cables` | a hanging load on two cables: tensions from the angles, the force triangle | done |
| `center-of-mass` | point masses on a line or a plane: the centre of mass | done |
| `oscillator` | spring-mass or pendulum at its phases: x, v, a; the period | done |
| `buoyancy` | a floating body: submerged fraction from the densities, E = P; a sinking one, E/P = ρ_l/ρ_c | done |
| `hydraulic` | a hydraulic press: F₂ = F₁·A₂/A₁, pistons to scale | done |
| `pressure` | pressure at depth p = p₀ + ρgh; connected vessels with two liquids | done |
| `efficiency` | an energy-flow strip: input, useful output and losses, widths to scale | done |

### P3 — worked examples on `function-graph` (no new code)

| example | status |
|---|---|
| s×t, v×t and a×t of a uniformly accelerated motion, three panels on one time axis | todo |
| two vehicles meeting: both s×t lines and the meeting point | todo |
| work as the area under F×d | todo |
| impulse as the area under F×t | todo |
| Eₖ, Eₚ and the total against position, with turning points | todo |
| g against distance from a planet's centre | todo |

## Out of scope

Illustrated machines with nothing to solve stay raw IR (see SELECTION.md,
"None"). Electricity and optics have their own presets.
