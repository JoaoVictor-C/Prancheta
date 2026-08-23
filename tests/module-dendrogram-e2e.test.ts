/**
 * SLOW end-to-end module test.
 *
 * Spawns the real Python dendrogram module (modules/dendrogram/render.py)
 * and verifies its output with a real Chromium instance via
 * runAndVerifyModule. Mirrors the shape of the other module e2e tests in
 * this directory.
 *
 * If `python` is not on PATH, or python lacks scipy, the test FAILS loudly
 * rather than skipping, for the same reason the other module e2e tests do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runAndVerifyModule } from "../src/modules/run.ts";

const TIMEOUT_MS = 240_000;

function assertScipyAvailable(): void {
  const probe = spawnSync("python", ["-c", "import scipy, numpy"], { encoding: "utf8" });
  if (probe.error) {
    assert.fail(
      `python is not available on PATH (required for modules/dendrogram/render.py): ${probe.error.message}`,
    );
  }
  if (probe.status !== 0) {
    assert.fail(
      `python is on PATH but cannot import scipy/numpy, needed by modules/dendrogram/render.py: ` +
        `${probe.stderr || probe.stdout}`,
    );
  }
}

test(
  "honest run (species_traits): every check passes or is not-applicable, every declared id resolves",
  { timeout: TIMEOUT_MS },
  async () => {
    assertScipyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/dendrogram/render.py", "--name=species_traits"],
      input: { width: 760, height: 420 },
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

    // 8 leaves cluster into exactly 7 merges (n-1), each a declared, checked feature.
    const links = output.elements.filter((e) => e.id.startsWith("link-"));
    assert.equal(links.length, 7, "8 leaves should produce 7 merges");
    for (const link of links) assert.ok(link.declaredBox, `${link.id} must declare its geometry`);

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.examined, 7);
  },
);

test(
  "honest run (custom 4-point dataset): two well-separated pairs merge last, at the largest distance",
  { timeout: TIMEOUT_MS },
  async () => {
    assertScipyAvailable();

    const { output, verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/dendrogram/render.py", "--labels=P;Q;R;S", "--data=0:0;0:1;9:9;9:8"],
      input: { width: 760, height: 420 },
      timeoutMs: TIMEOUT_MS,
    });

    assert.ok(
      verification.checks.every((check) => check.status !== "fail"),
      `no check should fail: ${JSON.stringify(verification.checks.filter((c) => c.status === "fail"))}`,
    );

    const leaves = output.elements.filter((e) => e.id.startsWith("leaf-"));
    assert.equal(leaves.length, 4);
    const links = output.elements.filter((e) => e.id.startsWith("link-"));
    assert.equal(links.length, 3, "4 leaves should produce 3 merges");

    // The root merge (joining the two pairs) should have the largest declared
    // distance -- P/Q are near (0,0)-(0,1), R/S near (9,9)-(9,8), so the
    // cross-pair distance dwarfs the within-pair ones.
    const distances = links.map((l) => Number(l.claim?.match(/distance ([\d.]+)/)?.[1]));
    assert.ok(distances.every((d) => Number.isFinite(d)));
    assert.equal(Math.max(...distances), distances[distances.length - 1] ?? -1);
  },
);

test(
  "misdeclare run: module-ids-resolve fails on a phantom merge, module-geometry-agrees fails on the shifted one",
  { timeout: TIMEOUT_MS },
  async () => {
    assertScipyAvailable();

    const { verification } = await runAndVerifyModule({
      command: "python",
      args: ["modules/dendrogram/render.py", "--misdeclare"],
      input: { width: 760, height: 420 },
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
    assert.ok(idsResolve!.detail?.includes("link-phantom"));

    const geometryAgrees = verification.checks.find((c) => c.id === "module-geometry-agrees");
    assert.ok(geometryAgrees, "module-geometry-agrees check must be present");
    assert.equal(geometryAgrees!.status, "fail");
  },
);
