/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python function-plot module (modules/plot/function.py) and
 * verifies its output with a real Chromium instance via runAndVerifyModule.
 * Mirrors the shape of the other module e2e tests in this directory.
 *
 * If `python` is not on PATH, or python lacks numpy, the test FAILS loudly
 * rather than skipping, for the same reason the other module e2e tests do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertNumpyAvailable(): void {
  const probe = spawnSync("python", ["-c", "import numpy"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/plot/function.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import numpy, needed by modules/plot/function.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (sine_cosine): two overlaid curves, every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    assertNumpyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/plot/function.py", "--name=sine_cosine"],
      input: { width: 760, height: 470 },
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

    // sin and cos both have roots and extrema in range -- a real,
    // numerically-found annotation, not just the two curves themselves.
    const roots = output.elements.filter((e) => e.id.startsWith("root-"));
    const extrema = output.elements.filter((e) => e.id.startsWith("extremum-"));
    assert.ok(roots.length > 0, "sine_cosine should find at least one root");
    assert.ok(extrema.length > 0, "sine_cosine should find at least one extremum");
  },
);

test(
  "honest run (linear_fit_demo): a real least-squares fit with R^2 near 1 for near-linear data",
  { timeout: TIMEOUT_MS },
  async () => {
    assertNumpyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/plot/function.py", "--name=linear_fit_demo"],
      input: { width: 760, height: 470 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    const fitCurve = output.elements.find((e) => e.id === "fit-curve");
    assert.ok(fitCurve, "fit-curve must be declared");
    assert.match(fitCurve!.claim ?? "", /R\^2=0\.9/, "near-linear demo data should fit with R^2 close to 1");
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom series, module-geometry-agrees fails on the shifted feature",
  { timeout: TIMEOUT_MS },
  async () => {
    assertNumpyAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/plot/function.py", "--misdeclare"],
      input: { width: 760, height: 470 },
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
    assert.ok(idsResolve!.detail?.includes("phantom-series"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");

    // The planted defect that is a lie about MEANING rather than form: the
    // root marker is moved off the curve and the axis it still claims to lie
    // on. Nothing is malformed afterwards, so this is the one defect in the
    // figure that no other check in the set can see.
    const onStroke = verification.checks.find((c) => c.id === "module-feature-on-its-stroke");
    assert.ok(onStroke, "module-feature-on-its-stroke check must be present");
    assert.equal(onStroke!.status, "fail");
    assert.ok(
      onStroke!.detail?.includes("does not lie on curve-0"),
      `expected the broken curve relation to be named: ${onStroke!.detail}`,
    );
    assert.ok(
      onStroke!.detail?.includes("does not lie on axis-x"),
      `both halves of the conjunction must be reported, not just the first: ${onStroke!.detail}`,
    );
  },
);
