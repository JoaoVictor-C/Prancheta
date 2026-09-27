/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python least-squares module (modules/plot/fit.py) and
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
      `python is not available on PATH (required for modules/plot/fit.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import numpy, needed by modules/plot/fit.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "function curves are refused with a pointer to function-graph (ADR 0025)",
  { timeout: TIMEOUT_MS },
  () => {
    assertNumpyAvailable();
    for (const args of [["--name=sine_cosine"], ["--functions=sin(x)"]]) {
      const run = spawnSync("python", ["modules/plot/fit.py", ...args], { input: "{}", encoding: "utf8" });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /function-graph preset/);
    }
  },
);

test(
  "honest run (linear_fit_demo): a real least-squares fit with R^2 near 1 for near-linear data",
  { timeout: TIMEOUT_MS },
  async () => {
    assertNumpyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/plot/fit.py", "--name=linear_fit_demo"],
      input: { width: 760, height: 470 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    const fitCurve = output.elements.find((e) => e.id === "fit-curve");
    assert.ok(fitCurve, "fit-curve must be declared");
    // Every fitted value claims the curve; the ones with a visible residual
    // claim that too -- the conjunction the meaning check measures.
    const fitted = output.elements.filter((e) => e.id.startsWith("fitted-"));
    assert.equal(fitted.length, 6);
    assert.ok(fitted.some((e) => e.on?.length === 2), "at least one fitted value claims curve AND residual");
    const onStroke = verification.checks.find((c) => c.id === "module-feature-on-its-stroke")!;
    assert.equal(onStroke.status, "pass", onStroke.detail);
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
      args: ["modules/plot/fit.py", "--misdeclare"],
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

    // The planted defect that is a lie about MEANING rather than form: a
    // fitted value is moved off the curve and the residual it still claims to
    // lie on. Nothing is malformed afterwards, so this is the one defect in the
    // figure that no other check in the set can see.
    const onStroke = verification.checks.find((c) => c.id === "module-feature-on-its-stroke");
    assert.ok(onStroke, "module-feature-on-its-stroke check must be present");
    assert.equal(onStroke!.status, "fail");
    assert.ok(
      onStroke!.detail?.includes("does not lie on fit-curve"),
      `expected the broken curve relation to be named: ${onStroke!.detail}`,
    );
    assert.ok(
      /does not lie on residual-\d/.test(onStroke!.detail ?? ""),
      `both halves of the conjunction must be reported, not just the first: ${onStroke!.detail}`,
    );
  },
);
