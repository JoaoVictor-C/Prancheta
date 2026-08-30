# ADR 0010: Constraint Toggles for Advanced Use Cases

**Status:** Accepted  
**Date:** 2026-08-23  
**Deciders:** Reasoning session (confidence 0.82, 2 iterations, 1 pass)

## Context

Three of Prancheta's six core checks enforce structural constraints that block legitimate diagram types:

1. **`boxes-do-not-overlap`** — prevents Venn diagrams, circle packings, overlapping annotations
2. **`connector-clear-of-boxes`** — prevents callout/leader patterns that cross dense fields
3. **Connectors are straight lines only** (not a check, an IR limitation) — blocks curved connectors standard in flowcharts, mind maps, org charts

Constraints 3, 5, and 6 from the original list serve different purposes:
- **Axis-aligned blocks** (constraint 3) — load-bearing for the layout solver; rotation would dramatically increase complexity
- **Flat color only** (constraint 5) — gradients add implementation complexity for limited value
- **Text constraints** (constraint 6) — acceptable limits that don't block major use cases

## Decision

**Make constraints 1, 2, and 4 toggleable; keep constraints 3, 5, and 6 as-is.**

### Toggleable constraints

1. **`allowOverlap`** — when true, `boxes-do-not-overlap` becomes not-applicable
2. **`allowConnectorCrossing`** — when true, `connector-clear-of-boxes` becomes not-applicable  
3. **`allowCurvedConnectors`** — enables bezier/arc connector support in the IR

### Implementation details

- **Scope:** Per-diagram global settings (in `canvas.constraints`)
- **Defaults:** All toggles default to `false` (constraints active) — new users get simple, predictable behavior
- **Constraint violations:** Soft boundaries (warn but allow) rather than blocking moves
- **Shipping:** Can be incremental — constraint 3 (curves) is independent of layout solver; constraints 1 and 2 both affect collision detection

### Why this approach

The three toggleable constraints share a pattern: each blocks specific legitimate diagram types without serving as a load-bearing simplification principle. The three kept constraints are either foundational to the layout solver (axis-alignment) or add complexity without structural value (gradients, font weight).

## Rationale

### Why toggle rather than permanently remove

Making all three toggleable (rather than permanently allowing curves) treats similar problems uniformly and preserves the tool's distinctive character:
- Consistency: all three unblock specific use cases
- Some users want constrained straight-line simplicity for technical diagrams
- Toggle preserves opt-in flexibility rather than unconstrained chaos

### Why these three and not others

**Constraint 3 (axis-aligned)** exploration via compound test: allowing rotated boxes would:
- Make the layout solver dramatically harder with arbitrary rotations
- Create complex interactions with nesting and overlap
- Not unlock major use cases that existing shape variety doesn't cover
- Cost far exceeds benefit

**Constraints 5 and 6** re-evaluation:
- Gradients add implementation complexity for limited visual value in technical diagrams
- Per-block font weight would require font loading/caching infrastructure for minimal benefit when emphasis can be conveyed via color, size, or existing effects

### Interaction effects

Constraints interact but independently toggleable is still correct:
- Users can experiment with combinations
- Per-diagram scope means all elements inherit (simpler than per-element)
- If curves + connector-crossing enabled together, curved connectors can weave through layouts (high value, manageable complexity)

## Consequences

### Positive

- Unblocks clear use cases: tangency, annotations, curved flows
- Preserves tool's simplifying character for users who want it
- Manageable complexity increase
- Enables power users without confusing beginners

### Negative

- Toggle UI adds some cognitive load
- Partially overlapping boxes create new edge cases when `allowOverlap: true`
- Per-diagram scope prevents mixing styles within one diagram (but per-element can be future iteration)

### Implementation notes

- When `allowOverlap: true`, the repair loop must not create overlaps as a side effect of other fixes
- When `allowCurvedConnectors: true`, the IR gains `Connector.curve` in three kinds: `arc` (a signed fraction of its own chord), `bezier` (one or two control points, in scene coordinates), and `spline` (corner fillets of `radius` px over an existing route)
- A curve is flattened into the polyline the checks walk, adaptively, to a stated 0.05px bound — so the geometry checked is the geometry drawn, to a tolerance well inside the half-pixel every check tolerates
- A self-loop (`from` and `to` the same block) is a **route**, not a curve, and is drawn with straight runs: a loop that curved by default would put curvature in a figure that never turned this toggle on
- Constraint violation behavior needs specification in the repair loop

## Alternatives considered

### Binary toggle vs graduated relaxation

Graduated relaxation (e.g., "allow overlap up to 20% of smaller box area") was considered but rejected:
- Adds UI complexity for unclear benefit
- Binary toggles are easier to understand and implement
- Can revisit if binary proves insufficient

### Per-diagram vs per-element scope

Per-element toggles would allow mixing constrained and unconstrained elements but at significant cost:
- UI and mental model complexity
- Mixed-mode layout solver complexity
- Per-diagram is simplest viable implementation
- Per-element can be future iteration if user demand justifies it

### Phased rollout vs all-at-once

Can ship incrementally if needed:
- Constraint 4 (curves) is independent of layout solver
- Constraints 1 and 2 both affect collision detection and might need coordinated implementation
- All-at-once provides consistency; phased allows faster delivery and learning from user feedback

## References

- Reasoning session transcript (2026-08-23)
- Original constraint list analysis
- [ADR 0003: Repairs are edits](0003-repairs-are-edits.md) — repair loop termination properties
- [ADR 0009: Termination for translation repair](0009-termination-for-translation-repair.md) — constraints and movement
