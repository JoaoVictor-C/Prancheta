# 0074 — Physics kinds: one file each, solved, drawn to one scale

## Status

Accepted.

## The need

ADR 0073 built `mechanics` with five dynamics kinds in one file. The physics
plan ([PLAN-PHYSICS.md](../PLAN-PHYSICS.md)) takes it to about 25 kinds:
kinematics, energy, statics, momentum, circular motion, gravitation and fluids.
One file of 25 kinds would be unreadable and fragile, so the preset is
restructured before it grows.

## Decision

**Structure.**
- `physics.ts` holds pure solvers. They are tested against hand-worked values
  before anything is drawn.
- `draw.ts` holds the shared drawing: the palette, numbers, arrows, names,
  dimension lines, springs and the reading panel.
- `kind.ts` is the contract: a kind's fields, its validator and its drawing.
- `kinds/<kind>.ts` holds one kind each.
- `preset.ts` is the registry and the common validation.

The split was made first, with no behaviour change: the 11 existing fixtures
re-rendered byte-identical. Adding a kind is a file and one registry line, and
the field check names which kind a stray field belongs to.

**Drawing rules learned while building P1.** Each was forced by
`annotation-nearest-its-owner` or `text-clear-of-ink`, and each is how a
textbook draws it anyway:

- **A path is cut where an arrow shows the motion.** Velocity is tangent to a
  trajectory, so an arrow lies on the path, and its name would be read as the
  path's. The dashed trajectory stops around the launch arrow and the arrow at
  the top, as a guide stops around an axis number.
- **A decomposition goes in an inset.** At a ground launch, v₀'s components
  lie on the ground and on the path. "decomposição de v₀" is drawn beside the
  figure.
- **An angle's arc lies beyond the arrows at its vertex.** Its radius is
  solved from d < (R + d)·sen(θ/2), as on the incline, and taken past v₀'s
  length.
- **Tension and string forces sit beside their rope**, not on it.
- **A body that touches a track carries its mass inside it.** Any label beside
  it would sit on the track.
- **A name sits beside an arrow's head**, the end that does the naming.

**Question figures.** `answers: false` drops the reading lines everywhere. Where
a drawn thing is itself the answer, it goes too: the energy bars, and the
velocities after a collision.

## Consequences

- P1 adds nine kinds: projectile, energy, lever, collision, circular, loop,
  banked, conical and orbit.
- Tests compare drawn lengths and areas with solved values, for example
  vₓ/v₀ = cos θ, bar heights in joules, F/P from torques, N/P = 1/cos θ, and
  equal Kepler sectors.
- P2 (the rest of dynamics, statics, fluids and oscillations) follows the same
  contract.
