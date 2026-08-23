/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python circuit module (modules/circuit/render.py) and
 * verifies its output with a real Chromium instance via runAndVerifyModule.
 * Mirrors the shape of the other module e2e tests in this directory. This
 * module has no third-party dependency beyond the Python standard library,
 * so unlike the other module e2e tests there is nothing extra to probe for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

test(
  "honest run (rlc_series): three different symbol types, every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/circuit/render.py", "--name=rlc_series"],
      input: { width: 640, height: 320 },
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

    const features = output.elements.filter((e) => e.kind === "feature");
    assert.equal(features.length, 4, "battery + resistor + inductor + capacitor");
    for (const feature of features) assert.ok(feature.declaredBox, `${feature.id} must declare its geometry`);

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.ok((geometryAgrees!.examined ?? 0) >= 4);
  },
);

test(
  "honest run (custom, all five component types): switch and inductor asymmetric boxes still agree",
  { timeout: TIMEOUT_MS },
  async () => {
    const { verification } = await runAndVerifyModule({
      command: "python",
      args: [
        "modules/circuit/render.py",
        "--components=resistor:R1;capacitor:C1;inductor:L1;switch:S1;diode:D1",
        "--battery=5V",
      ],
      input: { width: 640, height: 320 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom wire, module-geometry-agrees fails on the shifted component",
  { timeout: TIMEOUT_MS },
  async () => {
    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/circuit/render.py", "--misdeclare"],
      input: { width: 640, height: 320 },
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
    assert.ok(idsResolve!.detail?.includes("wire-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
