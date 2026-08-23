/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python map module (modules/map/render.py) as a subprocess
 * and verifies its output with a real Chromium instance via
 * runAndVerifyModule. No mocking: this is the actual protocol boundary
 * described in src/modules/protocol.ts exercised for real, in both directions
 * (honest output, and a deliberately dishonest one via --misdeclare).
 *
 * If `python` is not on PATH, or python lacks shapely/pyproj, the test FAILS
 * loudly rather than skipping -- a silently skipped probe test is worse than
 * no test at all, because a red suite that goes quietly green again looks
 * identical to one that never ran the probe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertPythonAvailable(): void {
  const probe = spawnSync("python", ["-c", "import shapely, pyproj"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/map/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import shapely/pyproj, needed by modules/map/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run: every check passes or is not-applicable, module-ids-resolve examines all 6, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py"],
      input: { width: 720, height: 520 },
      timeoutMs: TIMEOUT_MS,
    });

    for (const check of verification.checks) {
      assert.ok(
        check.status === "pass" || check.status === "not-applicable",
        `expected pass/not-applicable, got ${check.status} for ${check.id}: ${check.detail}`,
      );
    }
    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      "no check should fail on an honest run",
    );

    const idsResolve = verification.checks.find((c) => c.id === "module-ids-resolve");
    assert.ok(idsResolve, "module-ids-resolve check must be present");
    assert.equal(idsResolve!.examined, 6);

    const measuredById = new Map(verification.measured.map((m) => [m.id, m]));
    for (const element of output.elements) {
      const measured = measuredById.get(element.id);
      assert.ok(measured, `declared element ${element.id} should appear in verification.measured`);
      assert.equal(measured!.found, true, `declared element ${element.id} should resolve (found: true)`);
    }
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom region, module-label-within-feature fails on the harbour label",
  { timeout: TIMEOUT_MS },
  async () => {
    assertPythonAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/map/render.py", "--misdeclare"],
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
      idsResolve!.detail?.includes("phantom-region"),
      `module-ids-resolve detail should mention phantom-region, got: ${idsResolve!.detail}`,
    );

    const labelWithin = verification.checks.find((c) => c.id === "module-label-within-feature");
    assert.ok(labelWithin, "module-label-within-feature check must be present");
    assert.equal(labelWithin!.status, "fail");
    assert.ok(
      labelWithin!.detail?.includes("harbour"),
      `module-label-within-feature detail should mention harbour, got: ${labelWithin!.detail}`,
    );

    // Coverage: checks that actually examined elements should report a
    // non-zero count, not silently claim zero coverage while still failing.
    assert.ok(verification.coverage["module-ids-resolve"] > 0);
    assert.ok(verification.coverage["module-label-within-feature"] > 0);
  },
);
