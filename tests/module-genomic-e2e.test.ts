/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python genomic-features module (modules/genomic/render.py)
 * and verifies its output with a real Chromium instance via
 * runAndVerifyModule. Mirrors the shape of the other module e2e tests in
 * this directory.
 *
 * If `python` is not on PATH, or python lacks dna_features_viewer, the test
 * FAILS loudly rather than skipping, for the same reason the other module
 * e2e tests do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertDnaFeaturesViewerAvailable(): void {
  const probe = spawnSync("python", ["-c", "import dna_features_viewer"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/genomic/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import dna_features_viewer, needed by modules/genomic/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (operon): overlapping features pack into more than one row, every check passes or is not-applicable",
  { timeout: TIMEOUT_MS },
  async () => {
    assertDnaFeaturesViewerAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/genomic/render.py", "--name=operon"],
      input: { width: 820, height: 260 },
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

    // regX overlaps geneB in sequence coordinates -- real row-packing, not
    // just six features drawn on one line.
    assert.ok(output.notes?.some((n) => /[2-9] row/.test(n)), "operon should need more than one row");

    // Arrows are real filled shapes, so this check should actually run here
    // (not report not-applicable the way every stroke-only-feature module in
    // this repertoire does).
    const labelWithin = verification.checks.find((c) => c.id === "module-label-within-feature");
    assert.ok(labelWithin, "module-label-within-feature check must be present");
    assert.ok((labelWithin!.examined ?? 0) > 0, "module-label-within-feature should examine real labels here");
  },
);

test(
  "honest run (custom features): a real bp axis with a custom length",
  { timeout: TIMEOUT_MS },
  async () => {
    assertDnaFeaturesViewerAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: [
        "modules/genomic/render.py",
        "--length=2000",
        "--features=0:500:1:geneX|400:900:-1:geneY|850:1400:1:geneZ",
      ],
      input: { width: 820, height: 260 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom feature, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertDnaFeaturesViewerAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/genomic/render.py", "--misdeclare"],
      input: { width: 820, height: 260 },
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
    assert.ok(idsResolve!.detail?.includes("feature-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
