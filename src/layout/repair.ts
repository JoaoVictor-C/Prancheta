/**
 * Translation repair loop (M10, stage 6, step 34).
 *
 * Iteratively adjusts element positions to resolve overlaps and constraint
 * violations, using ADR 0009's lexicographic potential function and per-element
 * movement budgets to guarantee termination.
 *
 * This makes boxes-do-not-overlap and connector-clear-of-boxes finally repairable.
 */

import type { PlacementSolution, PlacementViolation } from "./solver.ts";
import { detectViolations, adjustPositions, computePotential } from "./solver.ts";

export type RepairResult = {
  /** Final positions after repair. */
  positions: Map<string, { x: number; y: number }>;
  /** Elements that were moved. */
  moved: Set<string>;
  /** Remaining violations (if any). */
  violations: PlacementViolation[];
  /** Iterations performed. */
  iterations: number;
  /** Stop reason. */
  stopReason: "all_satisfied" | "budget_exhausted" | "no_improvement" | "max_iterations";
};

/**
 * Run the translation repair loop until violations are resolved or budgets exhausted.
 */
export function repairTranslations(
  solution: PlacementSolution,
  maxIterations = 100,
): RepairResult {
  const initialPositions = new Map(solution.positions);
  let currentSolution = { ...solution, positions: new Map(solution.positions) };
  const allMoved = new Set<string>();
  let iterations = 0;

  let prevPotential = computePotential(currentSolution, detectViolations(currentSolution), initialPositions);

  while (iterations < maxIterations) {
    iterations++;

    const violations = detectViolations(currentSolution);

    // Success: no violations remain
    if (violations.length === 0) {
      return {
        positions: currentSolution.positions,
        moved: allMoved,
        violations: [],
        iterations,
        stopReason: "all_satisfied",
      };
    }

    // Attempt to adjust positions to reduce violations
    const { positions: newPositions, moved } = adjustPositions(currentSolution, violations);

    // Update solution with new positions
    currentSolution = { ...currentSolution, positions: newPositions };

    // Track which elements have moved
    for (const id of moved) {
      allMoved.add(id);

      // Deduct displacement from budget
      const oldPos = solution.positions.get(id)!;
      const newPos = newPositions.get(id)!;
      const dx = newPos.x - oldPos.x;
      const dy = newPos.y - oldPos.y;
      const displacement = Math.sqrt(dx * dx + dy * dy);

      const currentBudget = currentSolution.budgets.get(id) ?? 0;
      currentSolution.budgets.set(id, Math.max(0, currentBudget - displacement));
    }

    // Compute new potential
    const newViolations = detectViolations(currentSolution);
    const newPotential = computePotential(currentSolution, newViolations, initialPositions);

    // Check for improvement (lexicographic comparison)
    const improved = lexCompare(newPotential, prevPotential) < 0;

    if (!improved) {
      // No improvement: either stuck or budget exhausted
      const anyBudgetLeft = [...currentSolution.budgets.values()].some((b) => b > 1);

      return {
        positions: currentSolution.positions,
        moved: allMoved,
        violations: newViolations,
        iterations,
        stopReason: anyBudgetLeft ? "no_improvement" : "budget_exhausted",
      };
    }

    prevPotential = newPotential;
  }

  // Max iterations reached
  return {
    positions: currentSolution.positions,
    moved: allMoved,
    violations: detectViolations(currentSolution),
    iterations,
    stopReason: "max_iterations",
  };
}

/**
 * Lexicographic comparison of potential tuples.
 * Returns: <0 if a < b, 0 if a == b, >0 if a > b.
 */
function lexCompare(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/**
 * Apply translation repair to a figure's boxes.
 *
 * This is the entry point for the repair loop that gets called from the main
 * repair orchestrator when boxes-do-not-overlap or constraints-satisfied checks fail.
 */
export function repairBoxPositions(
  boxes: Map<string, { x: number; y: number; width: number; height: number }>,
  constraints: any[] = [],
  defaultBudget = 100,
): RepairResult {
  const positions = new Map<string, { x: number; y: number }>();
  const sizes = new Map<string, { width: number; height: number }>();

  for (const [id, box] of boxes) {
    positions.set(id, { x: box.x, y: box.y });
    sizes.set(id, { width: box.width, height: box.height });
  }

  const budgets = new Map<string, number>();
  for (const id of boxes.keys()) {
    budgets.set(id, defaultBudget);
  }

  const solution: PlacementSolution = {
    positions,
    sizes,
    constraints,
    budgets,
  };

  return repairTranslations(solution);
}
