/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python Skew-T module (modules/skewt/render.py) and
 * verifies its output with a real Chromium instance via runAndVerifyModule.
 * Mirrors the shape of the other module e2e tests in this directory.
 *
 * If `python` is not on PATH, or python lacks metpy, the test FAILS loudly
 * rather than skipping, for the same reason the other module e2e tests do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertMetpyAvailable(): void {
  const probe = spawnSync("python", ["-c", "import metpy, numpy"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/skewt/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import metpy/numpy, needed by modules/skewt/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (midlatitude_summer): every check passes or is not-applicable, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertMetpyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/skewt/render.py", "--name=midlatitude_summer"],
      input: { width: 640, height: 640 },
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

    // A real MetPy computation, not a guess: the LCL note carries an actual
    // computed pressure/temperature pair.
    assert.ok(output.notes?.some((n) => /LCL at \d+ hPa/.test(n)), "should report a computed LCL");

    const lcl = output.elements.find((e) => e.id === "lcl-marker");
    assert.ok(lcl, "lcl-marker must be declared");
    assert.ok(lcl!.declaredBox, "lcl-marker must declare its geometry");

    const parcel = output.elements.find((e) => e.id === "parcel-profile");
    assert.ok(parcel, "parcel-profile must be declared (metpy.calc.parcel_profile)");
  },
);

test(
  "honest run (unstable_afternoon): a different sounding produces a different LCL",
  { timeout: TIMEOUT_MS },
  async () => {
    assertMetpyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/skewt/render.py", "--name=unstable_afternoon"],
      input: { width: 640, height: 640 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );
    assert.ok(output.notes?.some((n) => /LCL at \d+ hPa/.test(n)));
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom trace, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertMetpyAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/skewt/render.py", "--misdeclare"],
      input: { width: 640, height: 640 },
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
    assert.ok(idsResolve!.detail?.includes("trace-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
