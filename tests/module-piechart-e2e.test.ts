/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python pie/donut chart module (modules/piechart/render.py)
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
  "honest run (market_share, plain pie): every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/piechart/render.py", "--name=market_share"],
      input: { width: 640, height: 420 },
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

    const slices = output.elements.filter((e) => /^slice-\d+$/.test(e.id));
    assert.equal(slices.length, 5, "five vendors in the named market_share fixture");
    for (const slice of slices) assert.ok(slice.declaredBox, `${slice.id} must declare its geometry`);

    // Wedges are real filled shapes, like modules/genomic's gene arrows --
    // this check should run for real here, not sit at not-applicable the
    // way it does for every stroke-only-feature module.
    const labelWithin = verification.checks.find((c) => c.id === "module-label-within-feature");
    assert.ok(labelWithin, "module-label-within-feature check must be present");
    assert.ok((labelWithin!.examined ?? 0) > 0, "module-label-within-feature should examine real labels here");

    // Every slice is named in the legend regardless of an inline label.
    const legendLabels = output.elements.filter((e) => e.id.startsWith("legend-label-"));
    assert.equal(legendLabels.length, 5);
  },
);

test(
  "honest run (budget_breakdown, donut): the centre hole is declared and every check passes",
  { timeout: TIMEOUT_MS },
  async () => {
    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/piechart/render.py", "--name=budget_breakdown"],
      input: { width: 640, height: 420 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    const hole = output.elements.find((e) => e.id === "donut-hole");
    assert.ok(hole, "a donut render must declare its centre hole");
    assert.ok(hole!.declaredBox);
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom slice, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/piechart/render.py", "--misdeclare"],
      input: { width: 640, height: 420 },
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
    assert.ok(idsResolve!.detail?.includes("slice-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
