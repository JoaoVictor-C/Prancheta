# 0009 — Termination for translation repair

## Status

Accepted (2026-08-23). Implementation proceeds in M10 (stage 6, steps 31-34).

## Context

The repair loop today can change width, height, wrapping, and canvas padding — all strictly enlarging transformations. Every edit increases at least one bounded quantity (a box's dimensions, the canvas size) and never decreases it, which gives a trivial monotone-and-bounded termination argument: the loop stops when every check passes or when it exhausts the budget trying, and oscillation is impossible because no edit can undo a prior one.

**Translation repair breaks this.** Moving box A to resolve an overlap can push A into box C, creating a new violation. A three-box cycle `A ↔ B ↔ C ↔ A` can oscillate indefinitely if the repair strategy has no discipline beyond "move things that collide until they don't."

The obvious candidate potential — total overlap area — does not decrease monotonically. Consider three boxes in a line, with A overlapping B:

```
Initial:     [A][B]  [C]
Move A:      [A]  [B][C]    (A-B resolved, B-C created)
Move B:   [A][B]     [C]    (B-C resolved, A-B recreated)
```

Total overlap went `area(A∩B) → area(B∩C) → area(A∩B)` — a cycle, not a descent.

**This is the one place the project can fail its own thesis.** Every other degree of freedom in the pipeline (size, wrapping, effects, rotation, shape) has a verified termination proof. Translation is the last unverified primitive, and the largest comparative gap (Penrose, Bluefish) remaining. If the termination argument does not hold in a form simple enough to defend, the fallback is bounded best-effort with residual violations reported in the manifest — still honest, but not a fixpoint.

Two questions must both be answered:

1. **Can we define a potential that strictly decreases?** A quantity computed from the current layout that every repair edit is guaranteed to reduce, bounded below, so the loop must terminate.
2. **Does the repair strategy that drives that descent produce acceptable layouts?** A potential that descends by moving every box to `(0,0)` would terminate instantly and be completely useless.

## Decision

**Translation repair uses a lexicographic potential: the count of violations, then the maximum violation magnitude, then total overlap area.** Concretely:

1. **Potential function:**
   ```
   Φ(layout) = (n_violations, max_overlap_area, total_overlap_area)
   ```
   where `n_violations` is the count of distinct box pairs that overlap, `max_overlap_area` is the area of the largest single pairwise overlap, and `total_overlap_area` is the sum of all pairwise overlaps. Compared lexicographically: `Φ₁ < Φ₂` iff the first differing component is smaller.

2. **Repair strategy:**
   - Each repair pass considers all overlapping pairs.
   - Pick the pair `(A, B)` with the largest overlap area (ties broken by id lexicographically, for determinism).
   - Move the **smaller** box (by area) away from the larger one, along the minimum separation vector (the shortest displacement that would resolve the overlap).
   - Distance moved is capped at a per-node **displacement budget** that decreases with each move of that node.
   - After each move, recompute `Φ`. If `Φ` did not strictly decrease, **revert the move** and mark that pair as unmovable this pass.
   - Repeat until `Φ` stops decreasing or all pairs are marked unmovable.

3. **Per-node displacement budget:**
   - Each box starts with a total displacement budget of `min(canvas.width, canvas.height) / 2` (enough to cross half the canvas).
   - Each move consumes budget equal to the distance moved.
   - When a box's budget is exhausted, it can no longer be moved.
   - This bounds the total displacement per box, which bounds the number of moves (since each move must decrease `Φ` and `Φ` is bounded below by `(0, 0, 0)`).

4. **Termination argument:**
   - `Φ` is bounded below by `(0, 0, 0)`.
   - `Φ` is non-negative and integer (or real, but with a minimum quantum if we discretize to pixels).
   - Every accepted move strictly decreases `Φ` lexicographically.
   - Reverted moves do not change `Φ`.
   - Each box has a finite displacement budget, so the number of moves per box is finite.
   - Therefore, the loop must terminate in a finite number of steps.

5. **Fallback for unmovable violations:**
   - When `Φ` stops decreasing (all remaining pairs are unmovable), the loop terminates even if violations remain.
   - Residual violations are reported in the manifest with their overlap area and the reason they could not be resolved (budget exhausted, or moving would increase `Φ`).
   - This is **honest best-effort**, not a claimed fixpoint — the manifest never says `ok` when violations remain.

## Why this potential works

**The lexicographic order prevents cycles.** In the `A ↔ B ↔ C` example:

- Initial: `Φ = (1, area(A∩B), area(A∩B))`  (one pair overlapping)
- After moving A: `Φ = (1, area(B∩C), area(B∩C))` — no change in `n_violations`, so only acceptable if `area(B∩C) < area(A∩B)`.
- If `area(B∩C) ≥ area(A∩B)`, the move would not be accepted (reverted).

The key insight: **we always resolve the largest overlap first**. If moving A to resolve its overlap with B creates a new overlap with C that is larger than the original A-B overlap, we don't accept that move. This prevents the cycle.

**The per-node budget prevents infinite small adjustments.** Even if every move decreases `Φ` by a tiny amount, each box can only move a finite total distance, so the number of moves is bounded.

**Moving the smaller box is a heuristic, not load-bearing.** The termination argument holds regardless of which box moves, as long as `Φ` decreases. Moving the smaller box tends to produce better layouts (larger, more important boxes stay anchored) but does not affect termination.

## Constraints and translation together

**Constraints declare target states; translation is how the repair loop reaches them.** A constraint like `align(A, B, "left")` or `distribute([A, B, C], "horizontal", spacing=20)` declares a desired geometric relationship. Violations are scored the same way overlaps are — by how far the layout is from satisfying the constraint.

The potential function extends to:

```
Φ(layout) = (n_violations, max_violation_magnitude, total_violation_magnitude)
```

where a "violation" is now either an overlap (two boxes intersecting) or a broken constraint (two boxes that should be aligned but aren't), and "magnitude" is overlap area for overlaps or distance-from-satisfaction for constraints.

The repair strategy is the same: pick the worst violation, make one edit to improve it (move a box, or resize it if the constraint allows), check that `Φ` decreased, revert if not.

## What this does not cover

**Rotation is not part of translation repair.** Rotating a box to avoid an overlap is a fundamentally different primitive with its own termination questions (rotating A to avoid B can make A collide with C, and a rotation can't be bounded by displacement budget). If rotation is ever included in automated repair, it needs its own ADR with its own termination proof.

**Resizing as a collision-avoidance strategy is not covered.** The existing repair loop can grow a box to fit its label, which is a monotone enlargement. Shrinking a box to avoid a collision is the opposite — unbounded in the other direction — and would need its own analysis. (The displacement budget bounds translation but does not bound shrinkage.)

**This does not prove that the resulting layout is good**, only that the loop terminates. A layout where every box is moved to a corner, all stacked on top of each other within their budgets, would terminate instantly with `Φ = (large, large, large)` and the manifest would report it honestly as unresolved. The quality of the result is a separate question from termination.

## Alternatives considered

**Delegation to a solver with a published convergence proof.** Libraries like Cassowary (constraint solver) or force-directed layout engines (d3-force, ELK's force layout) have proven termination guarantees. The argument for using one:

- Termination is guaranteed by the library's own proof, not ours.
- Layout quality is likely better (these are heavily optimized).

The argument against:

- Adds a non-trivial dependency (Cassowary is ~15KB minified; d3-force is ~20KB).
- Constraint translation is its own problem: turning `boxes-do-not-overlap` + `align(A, B)` into Cassowary's inequality format or a force-directed-graph edge set is non-trivial, and a bug in the translation can silently produce wrong layouts that pass the library's convergence check but don't satisfy the original constraints.
- Solver output must still be checked against the original constraints, so we don't escape the need for a constraint checker — we just move the complexity from the repair loop to the translation layer.

**Not chosen for this milestone.** The lexicographic potential is simpler to verify (the whole proof is in this document), has no external dependency, and keeps the repair logic in-repo where a defect can be debugged directly rather than through a third-party library's abstractions. If the hand-written repair loop proves too weak in practice (poor layout quality, or fails to resolve cases a solver would handle), delegation remains an option for a later milestone.

## Consequences

Good:

- **M10 can proceed.** Translation repair has a proven termination guarantee, so constraint satisfaction and collision avoidance can land without risking oscillation.
- **The manifest stays honest.** If violations remain, they are reported with their magnitude and reason, never hidden behind a false `ok`.
- **The proof is in-repo and auditable.** No dependency on a third-party library's convergence claim.

Bad:

- **Layout quality is not guaranteed.** The loop terminates, but the result might not be aesthetically pleasing or even fully resolved (if budgets are exhausted).
- **The repair strategy is a heuristic.** "Move the smaller box along the minimum separation vector" is not proven optimal, only proven terminating.
- **Constraints and overlaps are treated uniformly.** A broken alignment constraint has the same priority as a box overlap if their magnitudes are equal, which might not match user intent (perhaps overlaps should always take precedence). This can be refined in implementation without changing the termination proof.

Neutral:

- **This is a draft, not a commitment.** If the first implementation reveals a case where `Φ` does not actually decrease (a bug in the reasoning above), the honest outcome is to document the failure mode and revert to best-effort-without-termination, not to ship a broken proof.

## Open questions to resolve during implementation

1. **Discretization:** If positions are pixel-aligned, `Φ` components are integers and the descent is genuinely discrete. If positions are continuous floats, do we need a minimum quantum (0.1px, say) to avoid infinite descent by infinitesimal moves?

2. **Budget allocation:** Should larger boxes get larger budgets (they have more space to move into), or should all boxes get equal budgets (fairness)?

3. **Constraint priority:** Should overlap violations always be resolved before constraint violations, or should they compete in the same potential?

These don't affect termination (the proof holds regardless), but they affect layout quality. Answers can emerge from real fixtures rather than being pre-decided here.
