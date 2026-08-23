/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python molecule module (modules/molecule/render.py) as a
 * subprocess and verifies its output with a real Chromium instance via
 * runAndVerifyModule. Mirrors tests/module-e2e.test.ts's shape for the map
 * module: no mocking, the actual protocol boundary, exercised for real in
 * both directions (an honest run, and a deliberately dishonest one via
 * --misdeclare).
 *
 * If `python` is not on PATH, or python lacks rdkit, the test FAILS loudly
 * rather than skipping, for the same reason module-e2e.test.ts does: a
 * silently skipped probe test is worse than no test at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertRdkitAvailable(): void {
  const probe = spawnSync("python", ["-c", "import rdkit"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/molecule/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import rdkit, needed by modules/molecule/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (glucose): every check passes or is not-applicable, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--name=glucose"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    for (const check of verification.checks) {
      assert.ok(
        check.status === "pass" || check.status === "not-applicable",
        `expected pass/not-applicable, got ${check.status} for ${check.id}: ${check.detail}`,
      );
    }

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.ok(idsResolve, "module-ids-resolve check must be present");
    assert.equal(idsResolve!.examined, output.elements.length);

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.ok(
      (geometryAgrees!.examined ?? 0) > 0,
      "at least one bond should have declared its geometry",
    );

    const measuredById = new Map(verification.measured.map((m) => [m.id, m]));
    for (const element of output.elements) {
      const measured = measuredById.get(element.id);
      assert.ok(measured, `declared element ${element.id} should appear in verification.measured`);
      assert.equal(measured!.found, true, `declared element ${element.id} should resolve (found: true)`);
    }
  },
);

test(
  "honest run (sucrose): a two-ring molecule with eleven labels still collides and overlaps cleanly",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--name=sucrose"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    const collide = verification.checks.find((c) => c.id === "module-labels-do-not-collide");
    assert.ok(collide, "module-labels-do-not-collide check must be present");
    assert.ok((collide!.examined ?? 0) >= 10, "sucrose should declare at least ten labels");
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom bond, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertRdkitAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/molecule/render.py", "--misdeclare"],
      input: { width: 720, height: 520 },
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
    assert.ok(
      idsResolve!.detail?.includes("bond-phantom"),
      `module-ids-resolve detail should mention bond-phantom, got: ${idsResolve!.detail}`,
    );

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");

    assert.ok(verification.coverage["module-ids-resolve"] > 0);
    assert.ok(verification.coverage["module-geometry-agrees"] > 0);
  },
);
