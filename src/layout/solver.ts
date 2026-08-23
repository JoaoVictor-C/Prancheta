/**
 * Placement solver for translation repair (M10, stage 6, step 32).
 *
 * Positions are a SOLUTION to constraints and collision avoidance, not a final
 * answer. The solver can adjust positions (within budgets) to satisfy constraints
 * and resolve overlaps — the core mechanism for translation repair (step 34).
 *
 * This extends layout/place.ts from "ELK or author coordinates" to "positions
 * are mutable and improvable." The repair loop (step 34) will iteratively call
 * adjustPositions to resolve violations.
 */

import type { Constraint } from "../constraints/types.ts";
import { isConstraintSatisfied } from "../constraints/types.ts";

export type PlacementSolution = {
  /** Element id → position. */
  positions: Map<string, { x: number; y: number }>;
  /** Element id → size (immutable — only positions change). */
  sizes: Map<string, { width: number; height: number }>;
  /** Constraints to satisfy. */
  constraints: Constraint[];
  /** Per-element movement budget (total distance allowed). */
  budgets: Map<string, number>;
};

export type PlacementViolation =
  | { kind: "overlap"; element1: string; element2: string; area: number }
  | { kind: "constraint"; constraint: Constraint };

/**
 * Detect all violations in the current placement.
 */
export function detectViolations(solution: PlacementSolution): PlacementViolation[] {
  const violations: PlacementViolation[] = [];

  // Check for overlaps (boxes-do-not-overlap)
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const [id, pos] of solution.positions) {
    const size = solution.sizes.get(id);
    if (size) {
      boxes.set(id, { ...pos, ...size });
    }
  }

  const ids = [...boxes.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const id1 = ids[i]!;
      const id2 = ids[j]!;
      const box1 = boxes.get(id1)!;
      const box2 = boxes.get(id2)!;

      const overlapArea = computeOverlapArea(box1, box2);
      if (overlapArea > 0) {
        violations.push({ kind: "overlap", element1: id1, element2: id2, area: overlapArea });
      }
    }
  }

  // Check constraints
  for (const constraint of solution.constraints) {
    if (!isConstraintSatisfied(constraint, boxes)) {
      violations.push({ kind: "constraint", constraint });
    }
  }

  return violations;
}

/**
 * Compute overlap area between two boxes.
 */
function computeOverlapArea(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number },
): number {
  const xOverlap = Math.max(
    0,
    Math.min(box1.x + box1.width, box2.x + box2.width) - Math.max(box1.x, box2.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(box1.y + box1.height, box2.y + box2.height) - Math.max(box1.y, box2.y),
  );
  return xOverlap * yOverlap;
}

/**
 * Adjust positions to reduce violations (step 34 will implement the full repair loop).
 *
 * This is a placeholder that demonstrates the interface — the real implementation
 * will use ADR 0009's potential function and bounded descent.
 */
export function adjustPositions(
  solution: PlacementSolution,
  violations: PlacementViolation[],
): { positions: Map<string, { x: number; y: number }>; moved: Set<string> } {
  const newPositions = new Map(solution.positions);
  const moved = new Set<string>();

  // Placeholder: for each overlap, push the second box away
  for (const violation of violations) {
    if (violation.kind === "overlap") {
      const { element1, element2 } = violation;
      const pos1 = newPositions.get(element1);
      const pos2 = newPositions.get(element2);
      const size1 = solution.sizes.get(element1);
      const size2 = solution.sizes.get(element2);

      if (!pos1 || !pos2 || !size1 || !size2) continue;

      const budget = solution.budgets.get(element2) ?? 0;
      if (budget <= 0) continue;

      // Simple push: move element2 to the right of element1
      const newX = pos1.x + size1.width + 10;
      const displacement = Math.abs(newX - pos2.x);

      if (displacement <= budget) {
        newPositions.set(element2, { x: newX, y: pos2.y });
        moved.add(element2);
      }
    }
  }

  return { positions: newPositions, moved };
}

/**
 * Initialize a placement solution from existing positions and sizes.
 */
export function createPlacementSolution(
  positions: Map<string, { x: number; y: number }>,
  sizes: Map<string, { width: number; height: number }>,
  constraints: Constraint[] = [],
  defaultBudget = 100,
): PlacementSolution {
  const budgets = new Map<string, number>();
  for (const id of positions.keys()) {
    budgets.set(id, defaultBudget);
  }

  return {
    positions,
    sizes,
    constraints,
    budgets,
  };
}

/**
 * Compute the potential function Φ from ADR 0009.
 *
 * Φ = (overlap_area, constraint_violations, total_displacement)
 *
 * Returns a tuple that can be compared lexicographically.
 */
export function computePotential(
  solution: PlacementSolution,
  violations: PlacementViolation[],
  initialPositions: Map<string, { x: number; y: number }>,
): [number, number, number] {
  const overlapArea = violations
    .filter((v) => v.kind === "overlap")
    .reduce((sum, v) => sum + (v as { area: number }).area, 0);

  const constraintViolations = violations.filter((v) => v.kind === "constraint").length;

  let totalDisplacement = 0;
  for (const [id, pos] of solution.positions) {
    const initial = initialPositions.get(id);
    if (initial) {
      const dx = pos.x - initial.x;
      const dy = pos.y - initial.y;
      totalDisplacement += Math.sqrt(dx * dx + dy * dy);
    }
  }

  return [overlapArea, constraintViolations, totalDisplacement];
}
