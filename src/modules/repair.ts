/**
 * Module repair planner (M9, stage 4, step 22).
 *
 * Turns failed module checks into parameter amendments, re-invokes the module,
 * and repeats until checks pass or the budget is exhausted. Same monotone-and-
 * bounded discipline the core repair loop uses: every amendment must strictly
 * improve the check scores, and each parameter has a total adjustment budget.
 */

import type { Check } from "../checks.ts";
import type { ModuleOutput, ModuleParameter } from "./protocol.ts";
import type { ModuleVerification } from "./verify.ts";
import type { RunModuleOptions } from "./run.ts";
import { runModule } from "./run.ts";
import { chromium } from "playwright";
import { verifyModuleFigure } from "./verify.ts";

export type RepairResult = {
  /** Final module output after repair (or initial if no repair was possible). */
  output: ModuleOutput;
  /** Final verification result. */
  verification: ModuleVerification;
  /** Number of repair iterations performed. */
  iterations: number;
  /** Parameter amendments applied, in order. */
  amendments: Array<{ iteration: number; parameter: string; from: number; to: number; reason: string }>;
  /** Whether repair succeeded (all applicable checks pass). */
  success: boolean;
  /** If repair stopped early, why. */
  stopReason?: "budget_exhausted" | "no_improvement" | "no_parameters";
};

type CheckScore = {
  /** Number of check failures (lower is better). */
  failures: number;
  /** For collision checks: total overlap area or max distance. */
  magnitude: number;
};

function computeCheckScore(verification: ModuleVerification): CheckScore {
  let failures = 0;
  let magnitude = 0;

  for (const check of verification.checks) {
    if (check.status === "fail") {
      failures += 1;
      // Extract magnitude from check details if available
      // For now, treat each failure as magnitude 1
      magnitude += 1;
    }
  }

  return { failures, magnitude };
}

function scoreBetterThan(a: CheckScore, b: CheckScore): boolean {
  // Lexicographic: fewer failures first, then lower magnitude
  if (a.failures !== b.failures) {
    return a.failures < b.failures;
  }
  return a.magnitude < b.magnitude;
}

type ParameterBudget = {
  /** Total adjustment budget (absolute value of all changes). */
  total: number;
  /** Budget consumed so far. */
  consumed: number;
};

/**
 * Repair a module figure by iteratively amending parameters.
 *
 * Algorithm:
 * 1. Check which checks are failing.
 * 2. Pick a parameter to adjust based on the failure type.
 * 3. Amend the parameter, re-invoke the module, re-verify.
 * 4. If the score improved, keep the amendment; otherwise revert.
 * 5. Repeat until all checks pass or budget exhausted.
 */
export async function repairModuleFigure(
  options: RunModuleOptions,
  initialOutput: ModuleOutput,
  initialVerification: ModuleVerification,
  maxIterations = 10,
): Promise<RepairResult> {
  const amendments: RepairResult["amendments"] = [];
  let currentOutput = initialOutput;
  let currentVerification = initialVerification;
  let currentScore = computeCheckScore(initialVerification);
  let iteration = 0;

  // If no parameters declared, nothing to repair
  if (!initialOutput.parameters || initialOutput.parameters.length === 0) {
    return {
      output: initialOutput,
      verification: initialVerification,
      iterations: 0,
      amendments: [],
      success: currentScore.failures === 0,
      stopReason: "no_parameters",
    };
  }

  // Initialize budgets: each parameter can move up to 50% of its range
  const budgets = new Map<string, ParameterBudget>();
  for (const param of initialOutput.parameters) {
    const range = param.max - param.min;
    budgets.set(param.name, { total: range * 0.5, consumed: 0 });
  }

  const browser = await chromium.launch({
    args: ["--disable-lcd-text", "--force-color-profile=srgb"],
  });

  try {
    while (iteration < maxIterations && currentScore.failures > 0) {
      iteration += 1;

      // Identify which checks are failing
      const failedChecks = currentVerification.checks.filter((c) => c.status === "fail");
      if (failedChecks.length === 0) break;

      // Pick a parameter to adjust based on failed checks
      const amendment = pickAmendment(currentOutput, failedChecks, budgets);
      if (!amendment) {
        // No more adjustments possible within budget
        return {
          output: currentOutput,
          verification: currentVerification,
          iterations: iteration - 1,
          amendments,
          success: false,
          stopReason: "budget_exhausted",
        };
      }

      // Apply the amendment
      const overrides = { ...(options.input.parameterOverrides || {}) };
      overrides[amendment.parameter] = amendment.newValue;

      // Re-invoke the module
      const newOutput = await runModule({
        ...options,
        input: { ...options.input, parameterOverrides: overrides },
      });

      // Re-verify
      const newVerification = await verifyModuleFigure(browser, newOutput);
      const newScore = computeCheckScore(newVerification);

      // Check if score improved
      if (scoreBetterThan(newScore, currentScore)) {
        // Accept the amendment
        const budget = budgets.get(amendment.parameter)!;
        budget.consumed += Math.abs(amendment.newValue - amendment.oldValue);
        amendments.push({
          iteration,
          parameter: amendment.parameter,
          from: amendment.oldValue,
          to: amendment.newValue,
          reason: amendment.reason,
        });
        currentOutput = newOutput;
        currentVerification = newVerification;
        currentScore = newScore;
      } else {
        // Revert: score didn't improve, so don't keep this amendment
        // (just continue to next iteration without changing state)
      }
    }

    return {
      output: currentOutput,
      verification: currentVerification,
      iterations: iteration,
      amendments,
      success: currentScore.failures === 0,
      stopReason: currentScore.failures > 0 ? "no_improvement" : undefined,
    };
  } finally {
    await browser.close();
  }
}

type Amendment = {
  parameter: string;
  oldValue: number;
  newValue: number;
  reason: string;
};

function pickAmendment(
  output: ModuleOutput,
  failedChecks: Check[],
  budgets: Map<string, ParameterBudget>,
): Amendment | null {
  if (!output.parameters) return null;

  // Strategy: look for label collision failures and try increasing spacing/padding
  const hasCollision = failedChecks.some((c) => c.id.includes("collide") || c.id.includes("collision"));

  for (const param of output.parameters) {
    const budget = budgets.get(param.name);
    if (!budget || budget.consumed >= budget.total) continue;

    // If we have collisions, try increasing spacing/padding parameters
    if (hasCollision && (param.name.includes("gap") || param.name.includes("pad") || param.name.includes("spacing"))) {
      const range = param.max - param.min;
      const step = Math.min(range * 0.1, budget.total - budget.consumed);
      if (step <= 0) continue;

      const newValue = Math.min(param.value + step, param.max);
      if (newValue > param.value) {
        return {
          parameter: param.name,
          oldValue: param.value,
          newValue,
          reason: "increase spacing to resolve collision",
        };
      }
    }
  }

  return null;
}
