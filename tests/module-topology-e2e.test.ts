/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python topology-cartoon module (modules/topology/render.py)
 * and verifies its output with a real Chromium instance via
 * runAndVerifyModule. This module has no third-party dependency beyond the
 * Python standard library, so unlike most other module e2e tests here there
 * is nothing extra to probe for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

test(
  "honest run (four_helix_bundle): every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/topology/render.py", "--name=four_helix_bundle"],
      input: { width: 620, height: 220 },
      timeoutMs: TIMEOUT_MS,
    });

    for (const check of verification.checks) {
      assert.ok(
        check.status === "pass" || check.status === "not-applicable",
        `expected pass/not-applicable, got ${check.status} for ${check.id}: ${check.detail}`,
      );
    }

    const measuredById = new Map(verification.measured.map((m) => [m.id, m]));
    for (const element of output.elements) {
      const measured = measuredById.get(element.id);
      assert.ok(measured, `declared element ${element.id} should appear in verification.measured`);
      assert.equal(measured!.found, true, `declared element ${element.id} should resolve (found: true)`);
    }

    // Arrows/capsules are real filled shapes, like modules/genomic's gene
    // arrows -- this check should run for real here, not sit at
    // not-applicable the way it does for every stroke-only-feature module.
    const labelWithin = verification.checks.find((c) => c.id === "module-label-within-feature");
    assert.ok(labelWithin, "module-label-within-feature check must be present");
    assert.ok((labelWithin!.examined ?? 0) > 0);
  },
);

test(
  "honest run (rossmann_pattern, forced to wrap): a narrow canvas produces more than one row, and the canvas widens to fit it",
  { timeout: TIMEOUT_MS },
  async () => {
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/topology/render.py", "--name=rossmann_pattern"],
      input: { width: 380, height: 200 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );
    assert.ok(output.notes?.some((n) => /[2-9] row/.test(n)), "a 380px-wide canvas should force a row wrap");
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom element, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/topology/render.py", "--misdeclare"],
      input: { width: 620, height: 220 },
      timeoutMs: TIMEOUT_MS,
    });

    const failing = verification.checks.filter((check) => check.status === "fail");
    assert.ok(
      failing.length >= 2,
      `expected at least two failing checks, got ${failing.length}: ${JSON.stringify(failing)}`,
    );

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.ok(idsResolve, "module-ids-resolve check must be present");
    assert.equal(idsResolve!.status, "fail");
    assert.ok(idsResolve!.detail?.includes("element-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
